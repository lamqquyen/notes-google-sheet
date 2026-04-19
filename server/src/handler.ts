import {
  deleteEntry,
  fetchLogsByDateRange,
  fetchTotal,
  formatLogResponse,
  formatVnd,
  logEntry,
} from "./dispatcher";
import { getTodayIsoVNT, monthRange, parseMessage } from "./parser";
import { runAgent } from "./agent";
import { forgetLastEntry, getLastEntry, rememberLastEntry } from "./memory";
import type { BotReply, ChatContext, Env, Intent, LastEntryItem } from "./types";

const HELP_TEXT = `Các lệnh hỗ trợ:
- chi <so> <mo ta>            vd: chi 50k ăn trưa
- thu / nạp / nhận <so> <mo ta>      vd: thu 2tr lương, nạp 500k ví
- Bỏ qua "chi" cũng được      vd: 50k cafe  (hoặc: cafe 50k)
- Nhiều khoản 1 lần           vd: cà phê 20k, bột ngọt 50k, muối 10k, đường 22k
                              hoặc: chi 50k cafe; nạp 500k momo
- /undo                       Huỷ bản ghi (hoặc cả lô) vừa nhập
- /today  /yesterday  /month  Thống kê nhanh
- /total                       Số dư hiện tại
- /help                        Xem hướng dẫn

Đơn vị tiền: k = 1.000, tr = 1.000.000. Ghi hôm qua / hôm nay / 12/4 để chỉ định ngày.`;

/**
 * Phase 1: hybrid parser (regex fast-path + LLM fallback) -> dispatcher.
 * Phase 2b: when USE_AGENT=1 in env, route to the tool-calling agent loop instead.
 *
 * Switching is configurable per channel without code changes.
 */
export async function handleChat(env: Env, ctx: ChatContext): Promise<BotReply> {
  const today = getTodayIsoVNT();

  // Allow opt-in to the agent loop in Phase 2b. For Phase 1 the parser is enough
  // and far cheaper. Treat any string starting with '1', 'true', 'yes', or 'on'
  // as enabled to make wrangler vars easy.
  if (isAgentEnabled(env)) {
    return runAgent(env, ctx);
  }

  const intent = await parseMessage(env, ctx.message, today);
  return executeIntent(env, ctx, intent);
}

function isAgentEnabled(env: Env): boolean {
  return /^(1|true|yes|on)$/i.test(env.USE_AGENT ?? "");
}

async function executeIntent(env: Env, ctx: ChatContext, intent: Intent): Promise<BotReply> {
  switch (intent.kind) {
    case "help":
      return { text: HELP_TEXT };
    case "clarify":
      return { text: intent.question };
    case "log": {
      const item = {
        type: intent.type,
        amount: intent.amount,
        description: intent.description,
        occurredAt: intent.occurredAt,
      };
      const result = await logEntry(env, item);
      if (result.id) {
        await rememberLastEntry(env, ctx.channel, ctx.userId, {
          items: [{ id: result.id, ...item }],
        });
      }
      const verb = intent.type === "spending" ? "Đã chi" : "Đã thu";
      return {
        text: `${verb} ${formatVnd(intent.amount)} - ${intent.description} (${intent.occurredAt}).\nNhập /undo nếu nhầm.`,
        refresh: true,
      };
    }
    case "logBatch": {
      const saved: LastEntryItem[] = [];
      const lines: string[] = [];
      let totalSpend = 0;
      let totalRecv = 0;

      for (const item of intent.items) {
        const result = await logEntry(env, item);
        if (result.id) {
          saved.push({ id: result.id, ...item });
        }
        const verb = item.type === "spending" ? "Đã chi" : "Đã thu";
        lines.push(
          `${verb} ${formatVnd(item.amount)} - ${item.description} (${item.occurredAt}).`,
        );
        if (item.type === "spending") totalSpend += item.amount;
        else totalRecv += item.amount;
      }

      if (saved.length > 0) {
        await rememberLastEntry(env, ctx.channel, ctx.userId, { items: saved });
      }

      if (totalSpend > 0 && totalRecv > 0) {
        lines.push(`Tổng chi: ${formatVnd(totalSpend)}, tổng thu: ${formatVnd(totalRecv)}.`);
      } else if (totalSpend > 0) {
        lines.push(`Tổng chi: ${formatVnd(totalSpend)}.`);
      } else if (totalRecv > 0) {
        lines.push(`Tổng thu: ${formatVnd(totalRecv)}.`);
      }
      lines.push(`Nhập /undo nếu nhầm (sẽ huỷ cả ${intent.items.length} bản ghi).`);

      return { text: lines.join("\n"), refresh: true };
    }
    case "total": {
      const total = await fetchTotal(env);
      return { text: `Số dư hiện tại: ${formatVnd(total)}.` };
    }
    case "query": {
      const data = await fetchLogsByDateRange(env, intent.dateFrom, intent.dateTo);
      return {
        text: formatLogResponse(data, { from: intent.dateFrom, to: intent.dateTo }),
      };
    }
    case "delete": {
      await deleteEntry(env, intent.id, intent.type);
      const last = await getLastEntry(env, ctx.channel, ctx.userId);
      if (last) {
        const remaining = last.items.filter((i) => i.id !== intent.id);
        if (remaining.length === 0) {
          await forgetLastEntry(env, ctx.channel, ctx.userId);
        } else if (remaining.length !== last.items.length) {
          await rememberLastEntry(env, ctx.channel, ctx.userId, { items: remaining });
        }
      }
      return { text: "Đã xoá.", refresh: true };
    }
    case "undo": {
      const last = await getLastEntry(env, ctx.channel, ctx.userId);
      if (!last || last.items.length === 0) {
        return { text: "Không có bản ghi nào gần đây để huỷ." };
      }
      for (const item of last.items) {
        await deleteEntry(env, item.id, item.type);
      }
      await forgetLastEntry(env, ctx.channel, ctx.userId);

      if (last.items.length === 1) {
        const item = last.items[0];
        const verb = item.type === "spending" ? "chi" : "thu";
        return {
          text: `Đã huỷ ${verb} ${formatVnd(item.amount)} - ${item.description} (${item.occurredAt}).`,
          refresh: true,
        };
      }

      const undoneLines = last.items.map((item) => {
        const verb = item.type === "spending" ? "chi" : "thu";
        return `- ${verb} ${formatVnd(item.amount)} - ${item.description} (${item.occurredAt})`;
      });
      return {
        text: `Đã huỷ ${last.items.length} bản ghi vừa nhập:\n${undoneLines.join("\n")}`,
        refresh: true,
      };
    }
  }
}

export { HELP_TEXT, monthRange };
