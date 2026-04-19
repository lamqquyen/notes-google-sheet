import type { Env, EntryType } from "./types";

export interface SheetLogItem {
  id: string;
  date: string;
  amount: number;
  description?: string;
}

export interface SheetLogResponse {
  total?: number;
  spending?: SheetLogItem[];
  receiving?: SheetLogItem[];
}

/** Mirrors src/services/sheets.ts#logEntry. */
export async function logEntry(
  env: Env,
  entry: { type: EntryType; occurredAt: string; amount: number; description: string },
): Promise<{ ok: boolean; id?: string }> {
  const response = await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(entry),
  });
  const data = (await readMaybeJson(response, "Ghi giao dich khong thanh cong.")) as {
    ok?: boolean;
    id?: string;
  };
  return { ok: data?.ok !== false, id: data?.id };
}

/** Mirrors src/services/sheets.ts#deleteEntry. */
export async function deleteEntry(env: Env, id: string, type: EntryType): Promise<unknown> {
  const response = await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "delete", id, type }),
  });
  return readMaybeJson(response, "Xoa khong thanh cong.");
}

/** Mirrors src/services/sheets.ts#fetchTotal. */
export async function fetchTotal(env: Env): Promise<number> {
  const url = new URL(env.SHEET_WEBAPP_URL);
  url.searchParams.set("total", "true");
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "text/plain" },
  });
  const data = (await readMaybeJson(response, "Khong the lay tong.")) as { total?: number };
  return typeof data.total === "number" ? data.total : 0;
}

/** Mirrors src/services/sheets.ts#fetchLogsByDateRange. */
export async function fetchLogsByDateRange(
  env: Env,
  dateFrom: string,
  dateTo: string,
): Promise<SheetLogResponse> {
  const url = new URL(env.SHEET_WEBAPP_URL);
  url.searchParams.set("dateFrom", dateFrom);
  url.searchParams.set("dateTo", dateTo);
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "text/plain" },
  });
  const data = (await readMaybeJson(response, "Khong the lay log.")) as SheetLogResponse;
  return data ?? {};
}

async function readMaybeJson(response: Response, fallbackError: string): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.includes("<html>") || text.includes("<!DOCTYPE")) {
    throw new Error("Apps Script tra ve loi HTML. Kiem tra deployment.");
  }
  if (!response.ok) {
    try {
      const j = JSON.parse(text);
      throw new Error((j as { error?: string }).error || fallbackError);
    } catch {
      throw new Error(text || fallbackError);
    }
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers (Vietnamese output)
// ---------------------------------------------------------------------------

const VND = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

export function formatVnd(amount: number): string {
  return VND.format(amount);
}

export function formatLogResponse(data: SheetLogResponse, range?: { from: string; to: string }): string {
  const spending = data.spending ?? [];
  const receiving = data.receiving ?? [];

  if (spending.length === 0 && receiving.length === 0) {
    return range
      ? `Khong co giao dich nao tu ${range.from} den ${range.to}.`
      : "Khong co giao dich nao.";
  }

  const totalSpending = spending.reduce((s, x) => s + x.amount, 0);
  const totalReceiving = receiving.reduce((s, x) => s + x.amount, 0);

  const lines: string[] = [];
  if (range) lines.push(`Khoang ${range.from} -> ${range.to}`);
  if (receiving.length > 0) {
    lines.push(`\nThu (${formatVnd(totalReceiving)}):`);
    for (const r of receiving.slice(0, 20)) {
      lines.push(`+ ${r.date} ${formatVnd(r.amount)} - ${r.description ?? ""}`);
    }
  }
  if (spending.length > 0) {
    lines.push(`\nChi (${formatVnd(totalSpending)}):`);
    for (const s of spending.slice(0, 20)) {
      lines.push(`- ${s.date} ${formatVnd(s.amount)} - ${s.description ?? ""}`);
    }
  }
  if (spending.length + receiving.length > 20) {
    lines.push(`\n(Hien thi 20 muc dau, con ${spending.length + receiving.length - 20} muc khac.)`);
  }
  return lines.join("\n");
}
