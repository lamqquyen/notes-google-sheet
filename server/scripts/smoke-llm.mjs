#!/usr/bin/env node
// Smoke-test for any OpenAI-compatible chat endpoint (Groq, OpenAI, Ollama, ...).
// Usage:
//   LLM_BASE_URL=http://localhost:11434/v1 \
//   LLM_MODEL=llama3.2:3b-instruct-q4_K_M \
//   LLM_API_KEY="" \
//   node scripts/smoke-llm.mjs

const baseUrl = process.env.LLM_BASE_URL;
const model = process.env.LLM_MODEL;
const apiKey = process.env.LLM_API_KEY ?? "";

if (!baseUrl || !model) {
  console.error("Missing LLM_BASE_URL or LLM_MODEL");
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
const headers = { "Content-Type": "application/json" };
if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

const start = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Return ONLY {"ok": true, "echo": "<input>"} as JSON. No markdown.',
      },
      { role: "user", content: "ping" },
    ],
  }),
});

if (!res.ok) {
  console.error(`HTTP ${res.status}`, await res.text());
  process.exit(2);
}
const data = await res.json();
const elapsed = Date.now() - start;
const content = data.choices?.[0]?.message?.content ?? "";
console.log(`OK in ${elapsed} ms`);
console.log("Model reply:", content);

try {
  const parsed = JSON.parse(content);
  if (parsed.ok !== true) {
    console.error("Model did not return ok:true; check JSON-mode support.");
    process.exit(3);
  }
} catch {
  console.error("Model reply is not valid JSON; consider a stronger model.");
  process.exit(4);
}
