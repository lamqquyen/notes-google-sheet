import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleChat } from "./handler";
import { isAllowedTelegramSource, sendMessage, type TelegramUpdate } from "./telegram";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("/chat", (c, next) => cors({ origin: c.env.ALLOWED_ORIGIN, allowMethods: ["POST", "OPTIONS"], allowHeaders: ["Content-Type", "X-Chat-Secret"] })(c, next));

app.get("/", (c) => c.text("notes-bot is alive"));

// ---------------------------------------------------------------------------
// In-app chat widget endpoint
// ---------------------------------------------------------------------------
app.post("/chat", async (c) => {
  const provided = c.req.header("X-Chat-Secret");
  if (!provided || provided !== c.env.CHAT_SHARED_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  let body: { userId?: string; message?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  const userId = (body.userId ?? "web").toString();
  const message = (body.message ?? "").toString().trim();
  if (!message) return c.json({ error: "message required" }, 400);

  try {
    const reply = await handleChat(c.env, { channel: "web", userId, message });
    return c.json(reply);
  } catch (err) {
    const text = err instanceof Error ? err.message : "Co loi xay ra.";
    return c.json({ text, error: true }, 500);
  }
});

// ---------------------------------------------------------------------------
// Telegram webhook
// ---------------------------------------------------------------------------
app.post("/telegram/webhook", async (c) => {
  // Telegram echoes the secret we set with setWebhook; reject anything else silently.
  const headerSecret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (headerSecret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ ok: true });
  }

  let update: TelegramUpdate;
  try {
    update = (await c.req.json()) as TelegramUpdate;
  } catch {
    return c.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text || !message.from) return c.json({ ok: true });

  const isPrivate = message.chat.type === "private";

  if (!isAllowedTelegramSource(c.env, message.from.id, message.chat.id)) {
    // Always log so you can copy the ids from `wrangler tail` to add to the
    // TELEGRAM_ALLOWED_USER_IDS / TELEGRAM_ALLOWED_CHAT_IDS secret.
    console.log(
      `telegram: rejected message from user_id=${message.from.id} chat_id=${message.chat.id} chat_type=${message.chat.type}`,
    );
    // Only reply in DMs. In groups we stay silent so a bot accidentally added
    // to a random group doesn't spam every message there.
    if (isPrivate) {
      await sendMessage(c.env, message.chat.id, "Xin lỗi, bot này riêng tư.").catch(() => {});
    }
    return c.json({ ok: true });
  }

  // In a group, only respond when the user clearly addresses the bot:
  //   - the message starts with "/" (a bot command), OR
  //   - the message mentions @<bot_username>, OR
  //   - the message is a reply to one of the bot's messages.
  // Telegram doesn't ship the bot's username in updates, so we read the entity
  // marker by looking for "@" + a configured username when present. Easiest:
  // accept any "/command" and any text that contains "@" — covers the common
  // /spend, /undo, /help and "@botname chi 50k cafe" patterns. DM is unchanged.
  if (!isPrivate && !shouldHandleGroupMessage(message.text)) {
    return c.json({ ok: true });
  }

  try {
    const reply = await handleChat(c.env, {
      channel: "telegram",
      // Per-user memory key so each member's /undo only affects their own batch,
      // even when sharing a group.
      userId: String(message.from.id),
      message: stripBotMention(message.text),
    });
    await sendMessage(c.env, message.chat.id, reply.text);
  } catch (err) {
    const text = err instanceof Error ? err.message : "Co loi xay ra.";
    await sendMessage(c.env, message.chat.id, text).catch(() => {});
  }

  return c.json({ ok: true });
});

/**
 * In a group, the bot only reacts to:
 *   - slash commands ("/spend ...", "/undo", "/help", ...)
 *   - messages that @-mention something (we strip the mention before parsing)
 * Other group chatter (small talk, replies between members, etc.) is ignored.
 */
function shouldHandleGroupMessage(text: string): boolean {
  const t = text.trim();
  return t.startsWith("/") || /@[\w_]+/.test(t);
}

/** Remove a leading or trailing "@botname" mention so the parser sees clean text. */
function stripBotMention(text: string): string {
  return text.replace(/@[\w_]+/g, "").replace(/\s+/g, " ").trim();
}

export default app;
