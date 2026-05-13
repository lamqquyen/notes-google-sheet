import { z } from "zod";
import { callLlm } from "./llm";
import type { Env, EntryType, Intent, LogItem } from "./types";

/**
 * Strip Vietnamese diacritics so the regex below can match both "hom qua" and
 * "hôm qua", "tieu" and "tiêu", "nhan" and "nhận" etc.
 *
 * For NFC-normalized strings (which JS strings are by default for typed input)
 * this transformation is *length-preserving*: each accented character is a
 * single codepoint that becomes a single ASCII codepoint. That means a regex
 * match index on the stripped string is also valid on the original string,
 * so we can extract the right slice without any index-mapping logic.
 */
function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function squashSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** "a , b" / "a,  b" → "a, b" for grocery-style lists in descriptions. */
function polishDescriptionCommas(s: string): string {
  return squashSpaces(s.replace(/\s*,\s*/g, ", "));
}

/**
 * Leading "Đã chi" / "Đã thu" (and unaccented variants) is bookkeeping, not the
 * purchase description. Same string length as stripDiacritics so slice indices
 * apply to the original segment.
 */
function stripLeadingDaVerbClause(raw: string): { text: string; spendReceiveHint?: EntryType } {
  const lead = raw.match(/^\s*/)?.[0] ?? "";
  const start = lead.length;
  const body = raw.slice(start);
  const norm = stripDiacritics(body.toLowerCase());
  const spend = /^da\s+(chi|tieu\s+xai|tieu|mua)\b\s*/.exec(norm);
  if (spend) {
    const end = start + spend[0].length;
    return { text: raw.slice(end).trimStart(), spendReceiveHint: "spending" };
  }
  const recv = /^da\s+(thu|nhan|nhap|nap)\b\s*/.exec(norm);
  if (recv) {
    const end = start + recv[0].length;
    return { text: raw.slice(end).trimStart(), spendReceiveHint: "receiving" };
  }
  return { text: raw };
}

/**
 * Step A: regex/keyword fast path for the most common Vietnamese phrasings.
 * Returns an intent (including `clarify`) or null when the caller should fall back to the LLM.
 */
export function parseWithRegex(rawInput: string, todayIso: string): Intent | null {
  const text = rawInput.trim();
  if (!text) return null;

  const normalized = stripDiacritics(text.toLowerCase());

  if (/^\/?(help|huong\s*dan|huongdan|tro\s*giup)\b/.test(normalized)) {
    return { kind: "help" };
  }

  if (
    /^\/?(undo|huy(\s*bo)?|xoa\s*(cai\s*)?(vua\s*roi|vua\s*nhap|cuoi(\s*cung)?|gan\s*nhat))\b/.test(
      normalized,
    )
  ) {
    return { kind: "undo" };
  }

  if (/^\/?(total|tong|tongtien|tong\s*tien|sodu|so\s*du)\b/.test(normalized)) {
    return { kind: "total" };
  }

  // Quick query: today / yesterday / this month
  if (/^\/?(today|homnay|hom\s*nay)\b/.test(normalized)) {
    return { kind: "query", dateFrom: todayIso, dateTo: todayIso };
  }
  if (/^\/?(yesterday|homqua|hom\s*qua)\b/.test(normalized)) {
    const y = shiftIsoDate(todayIso, -1);
    return { kind: "query", dateFrom: y, dateTo: y };
  }
  if (/^\/?(month|thang|thangnay|thang\s*nay)\b/.test(normalized)) {
    const range = monthRange(todayIso);
    return { kind: "query", dateFrom: range.from, dateTo: range.to };
  }

  // Try multi-log first ("chi 50k cafe, 30k taxi", "chi 50k cafe; thu 2tr luong",
  // multi-line input, etc.). Falls back to single-log on length 1 or any failure.
  const batch = parseMultipleLogs(text, todayIso);
  if (batch) return batch;

  // Slash commands: /spend 50k an trua, /recv 2tr luong, /chi 50k ăn trưa
  const slash = /^\/(spend|chi|tieu|recv|thu|nhap|nap)\s+([\s\S]+)$/i.exec(text);
  if (slash) {
    const verb = slash[1].toLowerCase();
    const type: EntryType = ["spend", "chi", "tieu"].includes(verb) ? "spending" : "receiving";
    const rest = slash[2].trim();
    const multiFromRest = parseMultipleLogs(rest, todayIso);
    if (multiFromRest) return multiFromRest;
    if (countVNUnitAmounts(rest) >= 2) {
      return { kind: "clarify", question: AMBIGUOUS_MULTI_AMOUNT };
    }
    const parsed = parseAmountAndRest(rest, todayIso, defaultDescription(type));
    if (parsed) return { kind: "log", type, ...parsed };
  }

  // Free-form Vietnamese: "chi 50k ăn trưa hôm qua", "thu 2tr lương"
  // Match the verb on the diacritic-stripped lowercased text so accented inputs
  // ("tiêu", "nhận") match the same patterns as their unaccented forms.
  const freeform =
    /\b(chi|tieu|tieu xai|spend|spent|thu|nhap|recv|received|nhan|nap|mua)\b/i.exec(normalized);
  if (freeform) {
    const verb = freeform[0].toLowerCase();
    const type: EntryType = verbToType(verb);
    const after = freeform.index + freeform[0].length;
    const restOriginal = text.slice(after).trim();
    const multiFromRest = parseMultipleLogs(restOriginal, todayIso);
    if (multiFromRest) return multiFromRest;
    const parsed = parseAmountAndRest(restOriginal, todayIso, defaultDescription(type));
    if (parsed) {
      if (countVNUnitAmounts(restOriginal) >= 2) {
        return { kind: "clarify", question: AMBIGUOUS_MULTI_AMOUNT };
      }
      return { kind: "log", type, ...parsed };
    }
  }

  // Verbless fallback: "50k cafe", "200k an toi hom qua" → assume spending.
  // Receiving still requires an explicit verb (thu/nhan/luong/recv/...) since
  // misclassifying a spend as income silently inflates the balance.
  const verbless = parseAmountAndRest(text, todayIso);
  if (verbless) {
    if (countVNUnitAmounts(text) >= 2) {
      return { kind: "clarify", question: AMBIGUOUS_MULTI_AMOUNT };
    }
    return { kind: "log", type: "spending", ...verbless };
  }

  return null;
}

/** Verbs that mean "spending"; everything else is "receiving". */
const SPEND_VERBS = new Set([
  "chi",
  "tieu",
  "tieu xai",
  "spend",
  "spent",
  "mua",
]);

function verbToType(verb: string): EntryType {
  return SPEND_VERBS.has(verb.toLowerCase()) ? "spending" : "receiving";
}

/**
 * Used when the user gives us a verb + amount but no description
 * ("nhận 1000k", "thu 2tr", "chi 50k"). Better to log the entry with a
 * generic Vietnamese label than to drop it on the floor or fall back to the
 * LLM (which often hallucinates a description for very short inputs).
 */
function defaultDescription(type: EntryType): string {
  return type === "spending" ? "chi tiêu" : "thu nhập";
}

/** Several `10k`-style amounts in one fragment without a clear per-line split. */
const AMBIGUOUS_MULTI_AMOUNT =
  "Có nhiều số tiền nhưng chưa rõ từng món kèm theo. Bạn ghi rõ từng khoản (vd: 10k nước, 5k cơm) hoặc mỗi dòng một khoản nhé.";

/** Counts amounts with explicit k/tr/… units (avoids treating `50,000` as two numbers). */
function countVNUnitAmounts(s: string): number {
  const re = /(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|tr|trieu|m|million)\b/gi;
  let n = 0;
  while (re.exec(s) !== null) n += 1;
  return n;
}

/**
 * True when `seg` can be parsed as one log line (optional leading verb + amount + description).
 * Used to decide whether a comma ends a segment (so "nấm ,đậu 45k" does NOT split on the first comma).
 */
function fragmentParsableAsLog(seg: string, todayIso: string): boolean {
  const { text } = stripLeadingDaVerbClause(seg);
  const segNorm = stripDiacritics(text.toLowerCase());
  const verbMatch =
    /^\/?(chi|tieu xai|tieu|spend|spent|thu|nhap|recv|received|nhan|nap|mua)\b/.exec(segNorm);

  let segText = text;
  if (verbMatch) {
    const type = verbToType(verbMatch[1]);
    segText = text.slice(verbMatch.index + verbMatch[0].length).trim();
    const fallback = defaultDescription(type);
    return parseAmountAndRest(segText, todayIso, fallback) !== null;
  }

  return parseAmountAndRest(segText, todayIso, "") !== null;
}

/** A comma/semicolon may start the next entry only if the left side already forms one complete log. */
function canEndSegmentBeforeComma(left: string, todayIso: string): boolean {
  const t = left.trimEnd();
  if (!t) return false;
  return fragmentParsableAsLog(t, todayIso);
}
/**
 * Split one line on commas/semicolons that separate finished entries. Keeps commas
 * inside lists before one amount ("nấm ,đậu 45k") and inside numbers ("1,5tr", "50,000").
 */
function splitChunkOnCommas(chunk: string, todayIso: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];
    if (ch !== "," && ch !== ";") continue;
    // Don't break European/VN decimal commas: digit immediately before comma.
    if (i > 0 && /\d/.test(chunk[i - 1]!)) continue;
    const left = chunk.slice(start, i);
    if (!canEndSegmentBeforeComma(left, todayIso)) continue;
    parts.push(left.trim());
    start = i + 1;
  }
  const tail = chunk.slice(start).trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}

function splitBatchSeparators(text: string, todayIso: string): string[] {
  const chunks = text
    .split(/\s*\n+\s*|\s+(?:va|và|rồi|roi)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const out: string[] = [];
  for (const chunk of chunks) {
    out.push(...splitChunkOnCommas(chunk, todayIso));
  }
  return out;
}

/**
 * Try to parse the message as multiple log entries separated by ",", ";",
 * newline, or " và "/" rồi ". Each segment may have its own verb prefix; if it
 * doesn't, it inherits the most recent verb seen ("chi 50k cafe, 30k taxi" →
 * both spending).
 *
 * Returns null if fewer than 2 valid log entries are found, so the caller can
 * fall through to the existing single-entry parsers / LLM fallback.
 */
function parseMultipleLogs(text: string, todayIso: string): Intent | null {
  const parts = splitBatchSeparators(text, todayIso).filter((s) => s.length > 0);

  if (parts.length < 2) return null;

  const items: LogItem[] = [];
  const segmentHadVerb: boolean[] = [];
  // Default to spending when no verb has been seen yet ("50k cafe, 30k taxi").
  // A later segment with an explicit verb (e.g. "thu 2tr lương") overrides it
  // for that segment AND for any subsequent verbless segments.
  let inheritedType: EntryType = "spending";

  for (const rawSeg of parts) {
    const daStrip = stripLeadingDaVerbClause(rawSeg);
    let seg = daStrip.text;
    if (daStrip.spendReceiveHint) {
      inheritedType = daStrip.spendReceiveHint;
    }

    const segNorm = stripDiacritics(seg.toLowerCase());

    // Match a leading verb (with optional "/" prefix). If absent, reuse the
    // verb from a previous segment.
    const verbMatch =
      /^\/?(chi|tieu xai|tieu|spend|spent|thu|nhap|recv|received|nhan|nap|mua)\b/.exec(segNorm);

    let segText = seg;
    let type: EntryType = inheritedType;
    let hadVerb = Boolean(daStrip.spendReceiveHint);

    if (verbMatch) {
      type = verbToType(verbMatch[1]);
      inheritedType = type;
      segText = seg.slice(verbMatch.index + verbMatch[0].length).trim();
      hadVerb = true;
    }

    // When a segment has an explicit verb but no description ("nhận 1000k",
    // "thu 2tr"), allow it through with a default label. Verbless segments
    // (e.g. "50k cafe") still require a real description because otherwise
    // the message is ambiguous (could be a typo, a date, ...).
    const fallback = hadVerb ? defaultDescription(type) : "";
    const parsed = parseAmountAndRest(segText, todayIso, fallback);
    if (!parsed) return null;
    segmentHadVerb.push(hadVerb);
    items.push({ type, ...parsed });
  }

  if (items.length < 2) return null;

  // Reject "chi 50k, 5k cơm": several prices but only one user description unless
  // each segment has its own verb ("chi 50k, thu 2tr" stays valid).
  const meaningful = items.filter((i) => i.description !== defaultDescription(i.type)).length;
  const verbSegs = segmentHadVerb.filter(Boolean).length;
  if (meaningful === 1 && verbSegs < 2) return null;

  return { kind: "logBatch", items };
}

function parseAmountAndRest(
  rest: string,
  todayIso: string,
  fallbackDescription = "",
): { amount: number; description: string; occurredAt: string } | null {
  const amountMatch = /(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|tr|trieu|m|million)?/i.exec(rest);
  if (!amountMatch) return null;
  const amount = normalizeAmount(amountMatch[1], amountMatch[2]);
  if (!amount || amount <= 0) return null;

  // Accept both word orders for the description:
  //   "<amount> <desc>"  → "50k cafe"
  //   "<desc> <amount>"  → "cà phê 20k", "thịt 200k"
  //   "<desc> <amount> <date>" → "thịt 200k hôm qua"
  // We just collect everything that isn't the amount itself and let extractDate
  // strip a date keyword if one is present.
  const before = rest.slice(0, amountMatch.index).trim();
  const after = rest.slice(amountMatch.index + amountMatch[0].length).trim();
  const combined = squashSpaces([before, after].filter(Boolean).join(" "));
  const fallback = squashSpaces(fallbackDescription);

  if (!combined && !fallback) return null;

  const dateInfo = extractDate(combined, todayIso);
  let description = squashSpaces(dateInfo.cleanedText) || combined || fallback;
  if (!description) return null;
  description = stripLeadingDaVerbClause(description).text.trim();
  description = polishDescriptionCommas(description);
  if (!description) return null;

  return { amount, description, occurredAt: dateInfo.iso };
}

function normalizeAmount(numberStr: string, unit?: string): number {
  const base = Number(numberStr.replace(",", "."));
  if (Number.isNaN(base)) return 0;
  switch ((unit ?? "").toLowerCase()) {
    case "k":
    case "nghin":
    case "ngan":
      return Math.round(base * 1_000);
    case "tr":
    case "trieu":
    case "m":
    case "million":
      return Math.round(base * 1_000_000);
    default:
      return Math.round(base);
  }
}

function extractDate(text: string, todayIso: string): { iso: string; cleanedText: string } {
  // Match on the diacritic-stripped lowercased text so "hôm qua" / "hôm nay"
  // (with accents) are detected. Length is preserved by stripDiacritics, so the
  // match index is also valid for slicing the original text.
  const stripped = stripDiacritics(text.toLowerCase());

  const ymatch = /\b(hom\s*qua|yesterday)\b/.exec(stripped);
  if (ymatch) {
    return {
      iso: shiftIsoDate(todayIso, -1),
      cleanedText: removeRange(text, ymatch.index, ymatch.index + ymatch[0].length),
    };
  }

  const tmatch = /\b(hom\s*nay|today)\b/.exec(stripped);
  if (tmatch) {
    return {
      iso: todayIso,
      cleanedText: removeRange(text, tmatch.index, tmatch.index + tmatch[0].length),
    };
  }

  const dmy = /(\b\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/.exec(text);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = dmy[3] ? normalizeYear(Number(dmy[3])) : Number(todayIso.slice(0, 4));
    if (isValidDate(year, month, day)) {
      const iso = `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { iso, cleanedText: removeRange(text, dmy.index, dmy.index + dmy[0].length) };
    }
  }

  return { iso: todayIso, cleanedText: text };
}

function removeRange(text: string, start: number, end: number): string {
  return (text.slice(0, start) + text.slice(end)).trim();
}

function normalizeYear(y: number): number {
  if (y < 100) return 2000 + y;
  return y;
}

function isValidDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

export function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthRange(iso: string): { from: string; to: string } {
  const [y, m] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${y}-${String(m).padStart(2, "0")}-01`,
    to: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Step B: ask the LLM to produce strict JSON when regex fails.
 * Validated by zod; on invalid output we ask a clarifying question instead of writing.
 */
const LogItemSchema = z.object({
  type: z.enum(["spending", "receiving"]),
  amount: z.number().positive(),
  description: z.string().min(1),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const LlmIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("log") }).merge(LogItemSchema),
  z.object({
    kind: z.literal("logBatch"),
    items: z.array(LogItemSchema).min(1),
  }),
  z.object({
    kind: z.literal("query"),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({ kind: z.literal("total") }),
  z.object({
    kind: z.literal("delete"),
    id: z.string().min(1),
    type: z.enum(["spending", "receiving"]),
  }),
  z.object({ kind: z.literal("undo") }),
  z.object({ kind: z.literal("help") }),
  z.object({ kind: z.literal("clarify"), question: z.string().min(1) }),
]);

const SYSTEM_PROMPT = `You are a parser for a Vietnamese personal-finance bot.
Convert the user's message into ONE JSON object matching this exact schema (no markdown, no commentary):

{ "kind": "log",      "type": "spending"|"receiving", "amount": <VND integer>, "description": "<short Vietnamese>", "occurredAt": "YYYY-MM-DD" }
{ "kind": "logBatch", "items": [ { "type": "...", "amount": ..., "description": "...", "occurredAt": "YYYY-MM-DD" }, ... ] }
{ "kind": "query",    "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD" }
{ "kind": "total" }
{ "kind": "delete",   "id": "<entry id>", "type": "spending"|"receiving" }
{ "kind": "undo" }
{ "kind": "help" }
{ "kind": "clarify",  "question": "<short Vietnamese question to ask the user>" }

Rules:
- Vietnamese verbs "chi", "tieu/tiêu", "mua", "di cho/đi chợ" ,"spent" => spending; "thu", "nhan/nhận", "luong/lương", "nap/nạp" => receiving.
- DEFAULT TO SPENDING when no verb is present. e.g. "50k cafe", "200k ăn tối hôm qua" => spending. Receiving requires an explicit verb above; never infer receiving from context alone.
- Amount units: k=1000, tr/trieu=1000000. Always emit a positive integer in VND.
- If the date is missing or vague, use today's date.
- DESCRIPTION must be the user's own wording for what was spent/received, copied verbatim with all Vietnamese diacritics preserved (e.g. "ăn trưa", not "an trua"). Do NOT include the verb (chi/thu/...), the amount, or any date words ("hôm qua", "12/4", ...).
- DESCRIPTION may appear EITHER BEFORE the amount ("thịt 200k", "cà phê 20k") OR AFTER it ("200k thịt", "20k cà phê"). Both orders are valid.
- If the user lists MULTIPLE entries in one message (separated by ",", ";", new line, "và", "rồi", or repeated verbs), return kind="logBatch" with one item per entry. When a later item omits a verb, inherit the verb from the previous item ("chi 50k cafe, 30k taxi" => both spending; "50k cafe, 30k taxi" with no verb at all => both spending by default). Use kind="log" only when there is exactly one entry.
- If amount, type, or description is missing/ambiguous, return kind="clarify" with a polite Vietnamese question.
- NEVER invent an id; only return kind="delete" when the user clearly references an existing id.
- If the user wants to undo / huy / xoa cai vua roi without giving an id, return kind="undo".`;

export async function parseWithLlm(
  env: Env,
  rawInput: string,
  todayIso: string,
): Promise<Intent> {
  const result = await callLlm(env, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Today is ${todayIso}.\nMessage: ${rawInput}` },
    ],
    jsonMode: true,
    temperature: 0,
  });

  let json: unknown;
  try {
    json = JSON.parse(result.content);
  } catch {
    return { kind: "clarify", question: "Mình chưa hiểu ý bạn, bạn có thể nói rõ hơn không?" };
  }
  const parsed = LlmIntentSchema.safeParse(json);
  if (!parsed.success) {
    return { kind: "clarify", question: "Mình chưa hiểu ý bạn, bạn có thể nói rõ hơn không?" };
  }
  return parsed.data;
}

export async function parseMessage(env: Env, rawInput: string, todayIso: string): Promise<Intent> {
  const fast = parseWithRegex(rawInput, todayIso);
  if (fast) return fast;
  return parseWithLlm(env, rawInput, todayIso);
}

export function getTodayIsoVNT(): string {
  // Asia/Ho_Chi_Minh = UTC+7, no DST.
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}
