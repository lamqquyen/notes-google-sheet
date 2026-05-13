import { callLlm, type ChatMessage, type ToolDefinition } from "./llm";
import {
  deleteEntry,
  fetchLogsByDateRange,
  fetchTotal,
  formatLogResponse,
  formatVnd,
  logEntry,
} from "./dispatcher";
import { getTodayIsoVNT } from "./parser";
import {
  forgetLastEntry,
  getLastEntry,
  loadHistory,
  rememberLastEntry,
  saveHistory,
} from "./memory";
import { type BotReply, type ChatContext, type Env, type EntryType, type LastEntryItem, undoScope } from "./types";

const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "log_entry",
      description: "Log a spending or receiving entry to the user's Google Sheet.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["spending", "receiving"] },
          amount: { type: "number", description: "Amount in VND, positive integer." },
          description: { type: "string" },
          occurredAt: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["type", "amount", "description", "occurredAt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_total",
      description: "Get the user's overall balance.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_logs_by_date_range",
      description: "List spending and receiving entries between two dates (inclusive).",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string" },
          dateTo: { type: "string" },
        },
        required: ["dateFrom", "dateTo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_entry",
      description: "Delete a specific entry by id and type. Only call after explicit user confirmation.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["spending", "receiving"] },
        },
        required: ["id", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "undo_last_entry",
      description:
        "Delete the most recent batch logged in this chat (undo). Any member can invoke; no arguments.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const SYSTEM = `You are a Vietnamese personal-finance assistant.
Reply in concise Vietnamese. Always use the provided tools to read/write data; never invent numbers.
- Verbs "chi", "tieu", "spent", "mua" => spending. "thu", "nhan", "luong", "nạp/nap" (top-up, deposit) => receiving.
- If the user gives an amount with no verb at all (e.g. "50k cafe", "thịt 200k"), default to spending. Never assume receiving without an explicit verb.
- The description text may come EITHER BEFORE the amount ("thịt 200k", "cà phê 20k") OR AFTER it ("200k thịt"). Both orders are valid.
- Amount units: k=1000, tr/trieu=1000000. Integers in VND only.
- If date is missing, use today's date.
- If the user mentions multiple entries in one message ("chi 50k cafe, 30k taxi", "chi 50k cafe và thu 2tr lương", new-line separated, ...), call log_entry once per entry in the SAME turn. The system groups them so one /undo reverts the whole batch for this chat (shared in groups).
- Confirm before calling delete_entry.`;

interface AgentToolResult {
  reply?: string;
  refresh?: boolean;
}

/**
 * Per-turn scratchpad. We collect every successful log_entry into `loggedItems`
 * and persist them as a single LastEntry once the agent loop is done, so /undo
 * can revert the whole user-turn (which may contain multiple log_entry tool
 * calls for batched messages like "chi 50k cafe, 30k taxi").
 */
interface AgentRunState {
  loggedItems: LastEntryItem[];
}

async function appendCurrentBalanceIfLogged(
  env: Env,
  state: AgentRunState,
  text: string,
): Promise<string> {
  if (state.loggedItems.length === 0) return text;
  const total = await fetchTotal(env);
  return `${text}\nSố dư hiện tại: ${formatVnd(total)}.`;
}

export async function runAgent(env: Env, ctx: ChatContext): Promise<BotReply> {
  const today = getTodayIsoVNT();
  const history = await loadHistory(env, ctx.channel, ctx.userId);

  const messages: ChatMessage[] = [
    { role: "system", content: `${SYSTEM}\nToday is ${today}.` },
    ...history,
    { role: "user", content: ctx.message },
  ];

  const maxTurns = Number(env.AGENT_MAX_TURNS || "4");
  let refresh = false;
  const state: AgentRunState = { loggedItems: [] };

  for (let turn = 0; turn < maxTurns; turn++) {
    const result = await callLlm(env, {
      messages,
      tools: TOOLS,
      toolChoice: "auto",
      temperature: 0.1,
    });

    if (!result.toolCalls || result.toolCalls.length === 0) {
      const finalText = result.content || "Da xong.";
      await persistLoggedItems(env, ctx, state);
      const finalWithBalance = await appendCurrentBalanceIfLogged(env, state, finalText);
      const newHistory: ChatMessage[] = [
        ...history,
        { role: "user", content: ctx.message },
        { role: "assistant", content: finalWithBalance },
      ];
      await saveHistory(env, ctx.channel, ctx.userId, newHistory);
      return { text: finalWithBalance, refresh };
    }

    messages.push({
      role: "assistant",
      content: result.content ?? "",
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const call of result.toolCalls) {
      const tool = await runTool(env, ctx, state, call.name, call.arguments);
      if (tool.refresh) refresh = true;
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.name,
        content: tool.reply ?? "{}",
      });
    }
  }

  await persistLoggedItems(env, ctx, state);
  const fallback = "Mình can them thong tin de xu ly tiep, ban viet ro hon nhe.";
  const text = await appendCurrentBalanceIfLogged(env, state, fallback);
  return { text, refresh };
}

async function persistLoggedItems(
  env: Env,
  ctx: ChatContext,
  state: AgentRunState,
): Promise<void> {
  if (state.loggedItems.length === 0) return;
  await rememberLastEntry(env, ctx.channel, undoScope(ctx), { items: state.loggedItems });
}

async function runTool(
  env: Env,
  ctx: ChatContext,
  state: AgentRunState,
  name: string,
  argsJson: string,
): Promise<AgentToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return { reply: JSON.stringify({ error: "invalid JSON arguments" }) };
  }

  try {
    switch (name) {
      case "log_entry": {
        const entry = {
          type: args.type as EntryType,
          amount: Number(args.amount),
          description: String(args.description ?? ""),
          occurredAt: String(args.occurredAt ?? getTodayIsoVNT()),
        };
        const result = await logEntry(env, entry);
        if (result.id) {
          state.loggedItems.push({ id: result.id, ...entry });
        }
        return {
          reply: JSON.stringify({
            ok: true,
            id: result.id,
            saved: { ...entry, amountFormatted: formatVnd(entry.amount) },
          }),
          refresh: true,
        };
      }
      case "fetch_total": {
        const total = await fetchTotal(env);
        return { reply: JSON.stringify({ total, totalFormatted: formatVnd(total) }) };
      }
      case "fetch_logs_by_date_range": {
        const data = await fetchLogsByDateRange(
          env,
          String(args.dateFrom),
          String(args.dateTo),
        );
        return {
          reply: JSON.stringify({
            ok: true,
            humanSummary: formatLogResponse(data, {
              from: String(args.dateFrom),
              to: String(args.dateTo),
            }),
            spendingCount: data.spending?.length ?? 0,
            receivingCount: data.receiving?.length ?? 0,
          }),
        };
      }
      case "delete_entry": {
        const id = String(args.id);
        await deleteEntry(env, id, args.type as EntryType);
        const last = await getLastEntry(env, ctx.channel, undoScope(ctx));
        if (last) {
          const remaining = last.items.filter((i) => i.id !== id);
          if (remaining.length === 0) {
            await forgetLastEntry(env, ctx.channel, undoScope(ctx));
          } else if (remaining.length !== last.items.length) {
            await rememberLastEntry(env, ctx.channel, undoScope(ctx), { items: remaining });
          }
        }
        // Also drop it from the in-flight scratchpad (if the agent just logged
        // and then deleted in the same turn) so we don't re-persist it.
        state.loggedItems = state.loggedItems.filter((i) => i.id !== id);
        return { reply: JSON.stringify({ ok: true }), refresh: true };
      }
      case "undo_last_entry": {
        const last = await getLastEntry(env, ctx.channel, undoScope(ctx));
        if (!last || last.items.length === 0) {
          return { reply: JSON.stringify({ ok: false, error: "no recent entry" }) };
        }
        for (const item of last.items) {
          await deleteEntry(env, item.id, item.type);
        }
        await forgetLastEntry(env, ctx.channel, undoScope(ctx));
        state.loggedItems = [];
        return {
          reply: JSON.stringify({
            ok: true,
            count: last.items.length,
            undone: last.items.map((i) => ({
              ...i,
              amountFormatted: formatVnd(i.amount),
            })),
          }),
          refresh: true,
        };
      }
      default:
        return { reply: JSON.stringify({ error: `unknown tool ${name}` }) };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool failed";
    return { reply: JSON.stringify({ error: message }) };
  }
}
