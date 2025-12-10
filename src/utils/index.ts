import type { SheetLogResponse } from "../services/sheets";

export const requiredMessage = "Trường này là bắt buộc";

export function formatNumberWithPeriods(value: number | string): string {
  if (value === "" || value === null || value === undefined) return "";
  const numValue = typeof value === "string" ? parseFloat(value.replace(/\./g, "")) : value;
  if (isNaN(numValue)) return "";
  return numValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parseFormattedNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/\./g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function sortLogsByDateDesc(logs: SheetLogResponse): SheetLogResponse {
  const parseDate = (dateStr: string): Date => {
    // Date format is dd/MM/yyyy
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    // Fallback: try to parse as-is
    return new Date(dateStr);
  };

  const sorted: SheetLogResponse = { ...logs };
  
  if (sorted.spending) {
    // Create array with original index to preserve creation order
    const spendingWithIndex = sorted.spending.map((item, index) => ({ item, originalIndex: index }));
    spendingWithIndex.sort((a, b) => {
      const dateA = parseDate(a.item.date);
      const dateB = parseDate(b.item.date);
      const dateDiff = dateB.getTime() - dateA.getTime(); // Descending (newest first)
      
      // If dates are the same, preserve original order (newer items appear first in original array)
      // Since backend returns newest first, we reverse the original index comparison
      if (dateDiff === 0) {
        return b.originalIndex - a.originalIndex; // Items that appeared later in original array come first
      }
      
      return dateDiff;
    });
    sorted.spending = spendingWithIndex.map(({ item }) => item);
  }
  
  if (sorted.receiving) {
    // Create array with original index to preserve creation order
    const receivingWithIndex = sorted.receiving.map((item, index) => ({ item, originalIndex: index }));
    receivingWithIndex.sort((a, b) => {
      const dateA = parseDate(a.item.date);
      const dateB = parseDate(b.item.date);
      const dateDiff = dateB.getTime() - dateA.getTime(); // Descending (newest first)
      
      // If dates are the same, preserve original order (newer items appear first in original array)
      // Since backend returns newest first, we reverse the original index comparison
      if (dateDiff === 0) {
        return b.originalIndex - a.originalIndex; // Items that appeared later in original array come first
      }
      
      return dateDiff;
    });
    sorted.receiving = receivingWithIndex.map(({ item }) => item);
  }
  
  return sorted;
}

export function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  // If already in dd/MM/yyyy format, return as is
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return dateStr;
  }
  return dateStr;
}

export function convertDDMMYYYYToYYYYMMDD(dateStr: string): string {
  if (!dateStr) return "";
  // If already in YYYY-MM-DD format, return as is
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  // Convert from dd/MM/yyyy to yyyy-MM-dd
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

export function convertYYYYMMDDToDDMMYYYY(dateStr: string): string {
  if (!dateStr) return "";
  // If already in dd/MM/yyyy format, return as is
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    return dateStr;
  }
  // Convert from yyyy-MM-dd to dd/MM/yyyy
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function getTodayVNT(): string {
  // Get today's date in Vietnam Time (UTC+7)
  const now = new Date();
  const vntTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // Add 7 hours for VNT
  const year = vntTime.getUTCFullYear();
  const month = String(vntTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vntTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayVNTFormatted(): string {
  return formatDateDDMMYYYY(getTodayVNT());
}

export function getDefaultDateRange() {
  const todayVNT = getTodayVNT();
  const todayParts = todayVNT.split('-');
  const todayDate = new Date(parseInt(todayParts[0]), parseInt(todayParts[1]) - 1, parseInt(todayParts[2]));
  const sevenDaysAgo = new Date(todayDate);
  sevenDaysAgo.setDate(todayDate.getDate() - 7);
  
  const year = sevenDaysAgo.getFullYear();
  const month = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
  const day = String(sevenDaysAgo.getDate()).padStart(2, '0');
  const sevenDaysAgoVNT = `${year}-${month}-${day}`;
  
  return {
    from: sevenDaysAgoVNT,
    to: todayVNT,
  };
}

export function getPastTwoDaysRange() {
  const todayVNT = getTodayVNT();
  const todayParts = todayVNT.split('-');
  const todayDate = new Date(parseInt(todayParts[0]), parseInt(todayParts[1]) - 1, parseInt(todayParts[2]));
  const twoDaysAgo = new Date(todayDate);
  twoDaysAgo.setDate(todayDate.getDate() - 2);
  
  const year = twoDaysAgo.getFullYear();
  const month = String(twoDaysAgo.getMonth() + 1).padStart(2, '0');
  const day = String(twoDaysAgo.getDate()).padStart(2, '0');
  const twoDaysAgoVNT = `${year}-${month}-${day}`;
  
  return {
    from: twoDaysAgoVNT,
    to: todayVNT,
  };
}

