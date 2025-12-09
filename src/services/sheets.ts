export type SheetEntry = {
  type: 'spending' | 'receiving';
  occurredAt: string;
  amount: number;
  description: string;
};

export type SheetLogItem = {
  id: string;
  date: string;
  amount: number;
  description?: string;
};

export type SheetLogResponse = {
  total?: number;
  spending?: SheetLogItem[];
  receiving?: SheetLogItem[];
};

const endpoint = import.meta.env.VITE_SHEET_WEBAPP_URL;

export async function logEntry(entry: SheetEntry) {
  if (!endpoint) {
    throw new Error('Thiếu URL webhook Google Sheet (VITE_SHEET_WEBAPP_URL).');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    },
    body: JSON.stringify(entry)
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    const message = isJson 
      ? (await response.json().catch(() => ({}))).error || 'Ghi nhận giao dịch không thành công.'
      : await response.text().catch(() => 'Ghi nhận giao dịch không thành công.');
    throw new Error(message);
  }

  if (!isJson) {
    const text = await response.text();
    if (text.includes('<html>') || text.includes('<!DOCTYPE')) {
      throw new Error('Apps Script trả về lỗi HTML. Kiểm tra lại script và deployment.');
    }
    return {};
  }

  return response.json().catch(() => ({}));
}

export async function deleteEntry(id: string, type: SheetEntry['type']) {
  if (!endpoint) {
    throw new Error('Thiếu URL webhook Google Sheet (VITE_SHEET_WEBAPP_URL).');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    },
    body: JSON.stringify({ action: 'delete', id, type })
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    const message = isJson 
      ? (await response.json().catch(() => ({}))).error || 'Xóa không thành công.'
      : await response.text().catch(() => 'Xóa không thành công.');
    throw new Error(message);
  }

  if (!isJson) {
    const text = await response.text();
    if (text.includes('<html>') || text.includes('<!DOCTYPE')) {
      throw new Error('Apps Script trả về lỗi HTML. Kiểm tra lại script và deployment.');
    }
    return {};
  }

  return response.json().catch(() => ({}));
}

export async function fetchTotal(): Promise<number> {
  if (!endpoint) {
    throw new Error('Thiếu URL webhook Google Sheet (VITE_SHEET_WEBAPP_URL).');
  }

  const url = new URL(endpoint);
  url.searchParams.set('total', 'true');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'text/plain' }
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    const message = isJson 
      ? (await response.json().catch(() => ({}))).error || 'Không thể lấy tổng.'
      : await response.text().catch(() => 'Không thể lấy tổng.');
    throw new Error(message);
  }

  if (!isJson) {
    const text = await response.text();
    if (text.includes('<html>') || text.includes('<!DOCTYPE')) {
      throw new Error('Apps Script trả về lỗi HTML. Kiểm tra lại script và deployment.');
    }
    throw new Error('Phản hồi không hợp lệ từ server.');
  }

  const data = await response.json();
  return typeof data.total === 'number' ? data.total : 0;
}

export async function fetchLogsByDateRange(dateFrom: string, dateTo: string): Promise<SheetLogResponse> {
  if (!endpoint) {
    throw new Error('Thiếu URL webhook Google Sheet (VITE_SHEET_WEBAPP_URL).');
  }

  const url = new URL(endpoint);
  url.searchParams.set('dateFrom', dateFrom);
  url.searchParams.set('dateTo', dateTo);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'text/plain' }
  });

  // Read response as text first to check if it's HTML
  const text = await response.text().catch(() => '');
  
  // Check if response is HTML error page
  if (text.includes('<html>') || text.includes('<!DOCTYPE') || text.includes('Lỗi')) {
    throw new Error('Apps Script trả về lỗi HTML. Đảm bảo deployment được set "Who has access: Anyone" và script không có lỗi.');
  }

  if (!response.ok) {
    try {
      const json = JSON.parse(text);
      throw new Error(json.error || 'Không thể lấy log theo khoảng ngày.');
    } catch {
      throw new Error(text || 'Không thể lấy log theo khoảng ngày.');
    }
  }

  // Try to parse as JSON
  try {
    const json = JSON.parse(text);
    return json;
  } catch (e) {
    throw new Error('Phản hồi không phải JSON hợp lệ từ server: ' + text.substring(0, 100));
  }
}

export async function fetchRecentItems(limit: number = 10): Promise<SheetLogResponse> {
  if (!endpoint) {
    throw new Error('Thiếu URL webhook Google Sheet (VITE_SHEET_WEBAPP_URL).');
  }

  const url = new URL(endpoint);
  url.searchParams.set('recent', 'true');
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'text/plain' }
  });

  // Read response as text first to check if it's HTML
  const text = await response.text().catch(() => '');
  
  // Check if response is HTML error page
  if (text.includes('<html>') || text.includes('<!DOCTYPE') || text.includes('Lỗi')) {
    throw new Error('Apps Script trả về lỗi HTML. Đảm bảo deployment được set "Who has access: Anyone" và script không có lỗi.');
  }

  if (!response.ok) {
    try {
      const json = JSON.parse(text);
      throw new Error(json.error || 'Không thể lấy bản ghi gần đây.');
    } catch {
      throw new Error(text || 'Không thể lấy bản ghi gần đây.');
    }
  }

  // Try to parse as JSON
  try {
    const json = JSON.parse(text);
    return json;
  } catch (e) {
    throw new Error('Phản hồi không phải JSON hợp lệ từ server: ' + text.substring(0, 100));
  }
}
