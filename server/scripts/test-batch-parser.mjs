// Quick smoke test for the multi-log regex parser.
// Run from server/: node scripts/test-batch-parser.mjs

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const tmp = path.join(root, ".smoke-tsc");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const tsc = spawnSync(
  "npx",
  [
    "-y", "tsc",
    "--outDir", tmp,
    "--module", "ES2022",
    "--target", "ES2022",
    "--moduleResolution", "Bundler",
    "--strict",
    "--esModuleInterop",
    "--skipLibCheck",
    "--types", "@cloudflare/workers-types",
    path.join(root, "src", "parser.ts"),
    path.join(root, "src", "types.ts"),
    path.join(root, "src", "llm.ts"),
  ],
  { stdio: "inherit" },
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

// tsc with --moduleResolution Bundler keeps bare relative imports (`./llm`),
// which Node's ESM loader rejects. Mark the dir as ESM and rewrite imports to
// add the `.js` extension Node needs.
writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ type: "module" }));
for (const file of readdirSync(tmp)) {
  if (!file.endsWith(".js")) continue;
  const p = path.join(tmp, file);
  const src = readFileSync(p, "utf8");
  const fixed = src.replace(
    /from\s+["'](\.\/[^"']+)["']/g,
    (_, spec) => (spec.endsWith(".js") ? `from "${spec}"` : `from "${spec}.js"`),
  );
  writeFileSync(p, fixed);
}

const { parseWithRegex } = await import(
  "file://" + path.join(tmp, "parser.js")
);

const today = "2026-04-19";

const cases = [
  { name: "single log untouched",                    input: "chi 50k cafe",                              expectKind: "log" },
  { name: "two spendings split by comma",            input: "chi 50k cafe, 30k taxi",                    expectKind: "logBatch", expectItems: 2 },
  { name: "three spendings + accents",               input: "chi 50k cafe, 30k taxi, 200k ăn tối",       expectKind: "logBatch", expectItems: 3 },
  { name: "mixed types with semicolon",              input: "chi 50k cafe; thu 2tr lương",               expectKind: "logBatch", expectItems: 2 },
  { name: "vietnamese 'và' conjunction",             input: "chi 50k cafe và 30k taxi",                  expectKind: "logBatch", expectItems: 2 },
  { name: "newline-separated",                       input: "chi 50k cafe\nchi 30k taxi",                expectKind: "logBatch", expectItems: 2 },
  { name: "comma INSIDE a number must NOT split",    input: "chi 50,000 cafe",                           expectKind: "log" },
  { name: "comma in number AND between items",       input: "chi 50,000 cafe, 30k taxi",                 expectKind: "logBatch", expectItems: 2 },
  { name: "no verb at all → defaults to spending",   input: "50k cafe, 30k taxi",                        expectKind: "logBatch", expectItems: 2, expectAllSpending: true },
  { name: "verbless single → spending",              input: "200k ăn tối hôm qua",                       expectKind: "log",      expectType: "spending" },
  { name: "verbless single + accents",               input: "30k cà phê",                                expectKind: "log",      expectType: "spending" },
  { name: "desc BEFORE amount (bug 1: thịt 200k)",   input: "thịt 200k",                                 expectKind: "log",      expectType: "spending", expectDescription: "thịt", expectAmount: 200000 },
  { name: "desc BEFORE amount + accents",            input: "cà phê 20k",                                expectKind: "log",      expectType: "spending", expectDescription: "cà phê", expectAmount: 20000 },
  { name: "desc BEFORE amount + date suffix",        input: "thịt 200k hôm qua",                         expectKind: "log",      expectType: "spending", expectDescription: "thịt" },
  { name: "bug 2: <category> <money> batch of 4",    input: "cà phê 20k, bột ngọt 50k, muối 10k, đường 22k", expectKind: "logBatch", expectItems: 4, expectAllSpending: true,
    expectAllDescriptions: ["cà phê", "bột ngọt", "muối", "đường"], expectAllAmounts: [20000, 50000, 10000, 22000] },
  { name: "inherited verb across all 3 segments",    input: "thu 1tr lương, 500k thưởng, 200k tiền lãi", expectKind: "logBatch", expectItems: 3 },
  { name: "verbless first, then thu overrides",      input: "50k cafe, thu 2tr lương, 100k ăn tối",      expectKind: "logBatch", expectItems: 3, expectTypes: ["spending", "receiving", "receiving"] },
  { name: "yesterday date applies per-segment",      input: "chi 50k cafe hôm qua, 30k taxi",            expectKind: "logBatch", expectItems: 2 },
  { name: "amount only, no description → null",      input: "50k",                                       expectKind: null },
  { name: "verb + amount only: nhận 1000k",          input: "nhận 1000k",                                expectKind: "log",      expectType: "receiving", expectAmount: 1000000, expectDescription: "thu nhập" },
  { name: "verb + amount only: thu 2tr",             input: "thu 2tr",                                   expectKind: "log",      expectType: "receiving", expectAmount: 2000000 },
  { name: "nạp → receiving (accented)",              input: "nạp 500k momo",                             expectKind: "log",      expectType: "receiving", expectAmount: 500000, expectDescription: "momo" },
  { name: "batch: chi then nạp",                     input: "chi 20k cafe, nạp 1tr ví",                  expectKind: "logBatch", expectItems: 2, expectTypes: ["spending", "receiving"] },
  { name: "verb + amount only: chi 50k",             input: "chi 50k",                                   expectKind: "log",      expectType: "spending",  expectAmount: 50000,   expectDescription: "chi tiêu" },
  { name: "bug: 4 spendings + nhận at end",          input: "cafe 20k, bột ngọt 10k, muối 10k, cơm 50k, nhận 1000k", expectKind: "logBatch", expectItems: 5,
    expectTypes: ["spending", "spending", "spending", "spending", "receiving"],
    expectAllDescriptions: ["cafe", "bột ngọt", "muối", "cơm", "thu nhập"],
    expectAllAmounts: [20000, 10000, 10000, 50000, 1000000] },
  { name: "commas inside one description before one amount (đã chi …)",
    input: "Đã chi  nước  dừa 30k,nấm ,đậu 45k,cà rốt ,củ hành tây 35k",
    expectKind: "logBatch", expectItems: 3,
    expectAllDescriptions: ["nước dừa", "nấm, đậu", "cà rốt, củ hành tây"],
    expectAllAmounts: [30000, 45000, 35000] },
  { name: "verbless two amounts one object → clarify",
    input: "10k,5k cơm",
    expectKind: "clarify" },
  { name: "freeform two amounts one object → clarify",
    input: "chi 10k,5k cơm",
    expectKind: "clarify" },
  { name: "slash two amounts one object → clarify",
    input: "/chi 10k,5k cơm",
    expectKind: "clarify" },
  { name: "mixed orders + missing space + verb-at-end",
    input: "cafe 20k, 10k  bột ngọt, muối 10k,5k cơm, nhận 1000k, 30k thu",
    expectKind: "logBatch", expectItems: 6,
    expectAllAmounts: [20000, 10000, 10000, 5000, 1000000, 30000] },
];

let failed = 0;
for (const c of cases) {
  const result = parseWithRegex(c.input, today);
  const kind = result?.kind ?? null;
  const items = result?.kind === "logBatch" ? result.items.length : undefined;

  let ok = kind === c.expectKind && (c.expectItems === undefined || items === c.expectItems);
  if (ok && c.expectAllSpending && result?.kind === "logBatch") {
    ok = result.items.every((i) => i.type === "spending");
  }
  if (ok && c.expectTypes && result?.kind === "logBatch") {
    ok =
      result.items.length === c.expectTypes.length &&
      result.items.every((i, idx) => i.type === c.expectTypes[idx]);
  }
  if (ok && c.expectType && result?.kind === "log") {
    ok = result.type === c.expectType;
  }
  if (ok && c.expectDescription !== undefined && result?.kind === "log") {
    ok = result.description === c.expectDescription;
  }
  if (ok && c.expectAmount !== undefined && result?.kind === "log") {
    ok = result.amount === c.expectAmount;
  }
  if (ok && c.expectAllDescriptions && result?.kind === "logBatch") {
    ok =
      result.items.length === c.expectAllDescriptions.length &&
      result.items.every((i, idx) => i.description === c.expectAllDescriptions[idx]);
  }
  if (ok && c.expectAllAmounts && result?.kind === "logBatch") {
    ok =
      result.items.length === c.expectAllAmounts.length &&
      result.items.every((i, idx) => i.amount === c.expectAllAmounts[idx]);
  }

  const detail =
    result?.kind === "logBatch"
      ? `\n        items:  ${JSON.stringify(result.items)}`
      : result?.kind === "log"
      ? `\n        log:    ${JSON.stringify(result)}`
      : "";
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n        input:  ${JSON.stringify(c.input)}\n        kind=${kind}${items !== undefined ? ` items=${items}` : ""}${detail}`,
  );
  if (!ok) failed++;
}

rmSync(tmp, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log("\nAll batch parser cases passed.");
