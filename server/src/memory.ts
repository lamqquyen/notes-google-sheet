import type { ChatMessage } from "./llm";
import type { Env, LastEntry } from "./types";

const MAX_TURNS = 8; // last N messages per user
const TTL_SECONDS = 60 * 60 * 24; // 1 day
const UNDO_TTL_SECONDS = 60 * 60 * 24; // 1 day undo window

const localMemory = new Map<string, ChatMessage[]>();
const localLastEntry = new Map<string, LastEntry>();

function key(channel: string, userId: string): string {
  return `chat:${channel}:${userId}`;
}

function lastEntryKey(channel: string, userId: string): string {
  return `last:${channel}:${userId}`;
}

export async function loadHistory(env: Env, channel: string, userId: string): Promise<ChatMessage[]> {
  const k = key(channel, userId);
  if (env.CHAT_MEMORY) {
    const raw = await env.CHAT_MEMORY.get(k);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as ChatMessage[];
    } catch {
      return [];
    }
  }
  return localMemory.get(k) ?? [];
}

export async function saveHistory(
  env: Env,
  channel: string,
  userId: string,
  messages: ChatMessage[],
): Promise<void> {
  const trimmed = messages.slice(-MAX_TURNS);
  const k = key(channel, userId);
  if (env.CHAT_MEMORY) {
    await env.CHAT_MEMORY.put(k, JSON.stringify(trimmed), { expirationTtl: TTL_SECONDS });
    return;
  }
  localMemory.set(k, trimmed);
}

export async function clearHistory(env: Env, channel: string, userId: string): Promise<void> {
  const k = key(channel, userId);
  if (env.CHAT_MEMORY) {
    await env.CHAT_MEMORY.delete(k);
    return;
  }
  localMemory.delete(k);
}

export async function rememberLastEntry(
  env: Env,
  channel: string,
  userId: string,
  entry: LastEntry,
): Promise<void> {
  const k = lastEntryKey(channel, userId);
  if (env.CHAT_MEMORY) {
    await env.CHAT_MEMORY.put(k, JSON.stringify(entry), { expirationTtl: UNDO_TTL_SECONDS });
    return;
  }
  localLastEntry.set(k, entry);
}

export async function getLastEntry(
  env: Env,
  channel: string,
  userId: string,
): Promise<LastEntry | null> {
  const k = lastEntryKey(channel, userId);
  let raw: string | null = null;
  if (env.CHAT_MEMORY) {
    raw = await env.CHAT_MEMORY.get(k);
    if (!raw) return null;
  } else {
    const v = localLastEntry.get(k);
    return v ?? null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeLastEntry(parsed);
  } catch {
    return null;
  }
}

/**
 * Accept both the new `{ items: [...] }` shape and the legacy single-entry
 * shape `{ id, type, amount, description, occurredAt }` so KV entries written
 * by an older deploy still work for one undo cycle.
 */
function normalizeLastEntry(value: unknown): LastEntry | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj.items)) {
    return { items: obj.items as LastEntry["items"] };
  }
  if (typeof obj.id === "string" && typeof obj.type === "string") {
    return {
      items: [
        {
          id: obj.id as string,
          type: obj.type as LastEntry["items"][number]["type"],
          amount: Number(obj.amount ?? 0),
          description: String(obj.description ?? ""),
          occurredAt: String(obj.occurredAt ?? ""),
        },
      ],
    };
  }
  return null;
}

export async function forgetLastEntry(
  env: Env,
  channel: string,
  userId: string,
): Promise<void> {
  const k = lastEntryKey(channel, userId);
  if (env.CHAT_MEMORY) {
    await env.CHAT_MEMORY.delete(k);
    return;
  }
  localLastEntry.delete(k);
}
