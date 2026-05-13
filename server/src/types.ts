export interface Env {
  // Vars
  ALLOWED_ORIGIN: string;
  LLM_PROVIDER: "groq" | "gemini" | "openai" | "ollama";
  LLM_MODEL: string;
  LLM_BASE_URL: string;
  AGENT_MAX_TURNS: string;

  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ALLOWED_USER_IDS: string;
  /** Optional CSV of group/supergroup chat ids (negative numbers). */
  TELEGRAM_ALLOWED_CHAT_IDS?: string;
  SHEET_WEBAPP_URL: string;
  LLM_API_KEY: string;
  CHAT_SHARED_SECRET: string;

  // Phase 2b agent loop
  USE_AGENT?: string;       // "1" | "true" | ... to enable
  CHAT_MEMORY?: KVNamespace; // optional, used by src/memory.ts
}

export type EntryType = "spending" | "receiving";

export type Intent =
  | {
      kind: "log";
      type: EntryType;
      amount: number;
      description: string;
      occurredAt: string; // YYYY-MM-DD
    }
  | {
      kind: "query";
      dateFrom: string; // YYYY-MM-DD
      dateTo: string;   // YYYY-MM-DD
    }
  | { kind: "total" }
  | {
      kind: "delete";
      id: string;
      type: EntryType;
    }
  | { kind: "undo" }
  | { kind: "help" }
  | { kind: "clarify"; question: string }
  | { kind: "logBatch"; items: LogItem[] };

export interface LogItem {
  type: EntryType;
  amount: number;
  description: string;
  occurredAt: string;
}

export interface LastEntryItem extends LogItem {
  id: string;
}

/**
 * The user's most recent log action (single entry or batch). `/undo` reverts
 * every item in `items`.
 */
export interface LastEntry {
  items: LastEntryItem[];
}

export type ChatChannel = "telegram" | "web";

export interface ChatContext {
  channel: ChatChannel;
  userId: string;
  message: string;
  /**
   * KV segment for /undo (last batch). When set — e.g. Telegram `chat.id` —
   * everyone in that chat shares one undo stack. Falls back to `userId` (web).
   */
  lastEntryScope?: string;
}

/** Undo memory key segment; use with rememberLastEntry / getLastEntry / forgetLastEntry. */
export function undoScope(ctx: ChatContext): string {
  return ctx.lastEntryScope ?? ctx.userId;
}

export interface BotReply {
  text: string;
  refresh?: boolean; // hint for the web widget to refetch totals/logs
}
