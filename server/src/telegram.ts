import type { Env } from "./types";

const TG_API = "https://api.telegram.org";

export type TelegramChatType = "private" | "group" | "supergroup" | "channel";

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: TelegramChatType };
    from?: { id: number; username?: string; first_name?: string };
  };
}

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  options?: { parseMode?: "Markdown" | "MarkdownV2" | "HTML" },
): Promise<void> {
  const url = `${TG_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (options?.parseMode) body.parse_mode = options.parseMode;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function csvIds(value: string | undefined): string[] {
  return value?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
}

/**
 * The bot accepts a message if EITHER of these is true:
 *   1. The sender's user id is in TELEGRAM_ALLOWED_USER_IDS (DM use case), OR
 *   2. The chat id is in TELEGRAM_ALLOWED_CHAT_IDS (shared group use case).
 *
 * Group chat ids are negative (e.g. -1001234567890 for supergroups). You can
 * find a chat id by checking `wrangler tail` after sending any message in the
 * group — every rejection is logged with both ids.
 */
export function isAllowedTelegramSource(
  env: Env,
  userId: number,
  chatId: number,
): boolean {
  const userIds = csvIds(env.TELEGRAM_ALLOWED_USER_IDS);
  if (userIds.includes(String(userId))) return true;
  const chatIds = csvIds(env.TELEGRAM_ALLOWED_CHAT_IDS);
  if (chatIds.includes(String(chatId))) return true;
  return false;
}
