#!/usr/bin/env node
// Registers the slash-command menu and webhook URL with Telegram.
// Usage:
//   TELEGRAM_BOT_TOKEN=xxx \
//   TELEGRAM_WEBHOOK_SECRET=xxx \
//   WORKER_URL=https://notes-bot.<account>.workers.dev \
//   node scripts/setup-telegram.mjs

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const workerUrl = process.env.WORKER_URL;

if (!token || !secret || !workerUrl) {
  console.error("Missing TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, or WORKER_URL");
  process.exit(1);
}

const api = `https://api.telegram.org/bot${token}`;

async function call(method, body) {
  const res = await fetch(`${api}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}

async function main() {
  await call("setMyCommands", {
    commands: [
      { command: "spend", description: "Ghi chi tiêu: /spend 50k an trua" },
      { command: "recv",  description: "Ghi thu nhập: /recv 2tr luong" },
      { command: "undo",  description: "Huỷ bản ghi vừa nhập" },
      { command: "today", description: "Xem giao dịch hôm nay" },
      { command: "yesterday", description: "Xem giao dịch hôm qua" },
      { command: "month", description: "Xem giao dịch tháng này" },
      { command: "total", description: "Xem số dư hiện tại" },
      { command: "help",  description: "Hướng dẫn sử dụng" },
    ],
  });
  console.log("Commands registered.");

  await call("setWebhook", {
    url: `${workerUrl.replace(/\/$/, "")}/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message"],
  });
  console.log("Webhook set.");

  const info = await call("getWebhookInfo", {});
  console.log("Webhook info:", info);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
