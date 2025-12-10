// ===== Config =====

const SHEET_ID = '1voZnl0qLLD7UdrIelONjnAt599IxpfWSWJPQRHtajfs';

const TOTAL_SHEET = 'Total';

const SPENDING_SHEET = 'Spending';

const RECEIVING_SHEET = 'Receiving';

// Notification settings - configure these
const TELEGRAM_BOT_TOKEN = '8423739750:AAGZou831DWuij69FqK0cDsUqU3AtPP2oVk'; // Your Telegram bot token (optional, leave empty to disable)
const TELEGRAM_CHAT_ID = '-5064851741'; // Your Telegram chat ID (optional, leave empty to disable)

// ===== Helpers =====

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheets_() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    return {
      total: ss.getSheetByName(TOTAL_SHEET),
      spending: ss.getSheetByName(SPENDING_SHEET),
      receiving: ss.getSheetByName(RECEIVING_SHEET)
    };
  } catch (e) {
    throw new Error('Không thể mở sheet: ' + e.toString());
  }
}

function ensureTotalSheet_(totalSheet) {
  if (!totalSheet.getRange('A1').getValue()) {
    totalSheet.getRange('A1').setValue('TOTAL');
  }
  if (totalSheet.getRange('A2').isBlank()) {
    totalSheet.getRange('A2').setValue("=SUM(Receiving!C:C)-SUM(Spending!D:D)");
  }
}

function toDDMMYYYY_(v) {
  try {
    if (Object.prototype.toString.call(v) === '[object Date]') {
      const day = String(v.getDate()).padStart(2, '0');
      const month = String(v.getMonth() + 1).padStart(2, '0');
      const year = v.getFullYear();
      return day + '/' + month + '/' + year;
    }
    const str = String(v || '');
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parts = str.split('-');
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return str;
  } catch (e) {
    return String(v || '');
  }
}

function dateInRange_(dateValue, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  try {
    const dateObj = dateValue instanceof Date ? dateValue : new Date(dateValue);
    const fromObj = dateFrom ? new Date(dateFrom) : null;
    const toObj = dateTo ? new Date(dateTo) : null;
    
    if (fromObj && dateObj < fromObj) return false;
    if (toObj) {
      const toEnd = new Date(toObj);
      toEnd.setHours(23, 59, 59, 999);
      if (dateObj > toEnd) return false;
    }
    return true;
  } catch (e) {
    return true;
  }
}

function isRowEmpty_(row, isSpending) {
  if (!row[0] || String(row[0]).trim() === '') return true;
  
  if (isSpending) {
    const hasDate = row[1] && String(row[1]).trim() !== '';
    const hasCategory = row[2] && String(row[2]).trim() !== '';
    const hasAmount = row[3] && Number(row[3]) !== 0;
    return !hasDate && !hasCategory && !hasAmount;
  } else {
    const hasDate = row[1] && String(row[1]).trim() !== '';
    const hasAmount = row[2] && Number(row[2]) !== 0;
    return !hasDate && !hasAmount;
  }
}

// ===== Notifications =====

function sendNotification_(subject, message) {
  Logger.log('sendNotification_ called with subject: ' + subject);
  // Send Telegram notification if configured
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN.trim() !== '' && 
      TELEGRAM_CHAT_ID && TELEGRAM_CHAT_ID.trim() !== '') {
    Logger.log('Telegram credentials found, sending notification...');
    try {
      const telegramUrl = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
      const fullMessage = subject + '\n\n' + message;
      
      // Convert chat_id to string (Telegram API accepts both string and number)
      const chatId = String(TELEGRAM_CHAT_ID).trim();
      
      const payload = {
        chat_id: chatId,
        text: fullMessage,
        parse_mode: 'HTML'
      };
      
      const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: false // Set to false to see errors
      };
      
      const response = UrlFetchApp.fetch(telegramUrl, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      // Check if the request was successful
      if (responseCode !== 200) {
        Logger.log('Telegram API error - Status: ' + responseCode + ', Response: ' + responseText);
        return false;
      }
      
      // Parse response to check if Telegram API returned an error
      try {
        const responseJson = JSON.parse(responseText);
        if (!responseJson.ok) {
          Logger.log('Telegram API returned error: ' + JSON.stringify(responseJson));
          return false;
        }
      } catch (parseError) {
        Logger.log('Failed to parse Telegram response: ' + responseText);
        return false;
      }
      
      Logger.log('Telegram notification sent successfully');
      return true;
    } catch (e) {
      Logger.log('Failed to send Telegram notification: ' + e.toString());
      Logger.log('Stack trace: ' + e.stack);
      return false;
    }
  } else {
    Logger.log('Telegram credentials not configured or empty');
  }
  return false;
}

function formatAmount_(amount) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
}

function formatDate_(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return day + '/' + month + '/' + year;
}

// Check if total is low and send top-up notification
function checkAndNotifyLowBalance_(totalAmount) {
  const LOW_BALANCE_THRESHOLD = 50000;
  
  if (totalAmount < LOW_BALANCE_THRESHOLD) {
    const subject = '⚠️ Sắp hết quỹ';
    const message = 'Số dư hiện tại chỉ còn: ' + formatAmount_(totalAmount) + '\n'
    Logger.log('Low balance detected: ' + totalAmount + ' < ' + LOW_BALANCE_THRESHOLD);
    sendNotification_(subject, message);
  }
}

// ===== POST (create + delete) =====

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const { action, type, occurredAt, amount, description = '', id } = body;
    const { total, spending, receiving } = getSheets_();

    ensureTotalSheet_(total);

    if (action === 'delete') {
      if (!id || !type) {
        return jsonOutput({ ok: false, error: 'Thiếu id hoặc type' });
      }

      if (type === 'spending') {
        const sheet = spending;
        const dataRange = sheet.getDataRange();
        const values = dataRange.getValues();
        
        // Find the row to delete (skip header row, start from index 1)
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]) === id) {
            const deletedRow = values[i];
            const deletedDate = deletedRow[1];
            const deletedDescription = deletedRow[2] || '';
            const deletedAmount = deletedRow[3] || 0;
            
            // deleteRow automatically shifts all rows below up
            sheet.deleteRow(i + 1); // +1 because deleteRow uses 1-based indexing
            
            // Send notification
            const currentTotal = Number(total.getRange('A2').getValue()) || 0;
            const subject = '🗑️ Đã xóa bản ghi chi tiêu';
            const message = 'Đã xóa bản ghi:\n' +
              '📅 Ngày: ' + formatDate_(deletedDate) + '\n' +
              '📝 Mô tả: ' + (deletedDescription || '—') + '\n' +
              '💰 Số tiền: ' + formatAmount_(deletedAmount) + '\n' +
              '💵 Tổng tiền còn lại: ' + formatAmount_(currentTotal);
            sendNotification_(subject, message);
            
            // Check for low balance and notify
            checkAndNotifyLowBalance_(currentTotal);
            
            return jsonOutput({ ok: true, deleted: id });
          }
        }
        return jsonOutput({ ok: false, error: 'Không tìm thấy bản ghi để xóa' });
      } else {
        const sheet = receiving;
        const dataRange = sheet.getDataRange();
        const values = dataRange.getValues();
        
        // Find the row to delete (skip header row, start from index 1)
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]) === id) {
            const deletedRow = values[i];
            const deletedDate = deletedRow[1];
            const deletedAmount = deletedRow[2] || 0;
            
            // deleteRow automatically shifts all rows below up
            sheet.deleteRow(i + 1); // +1 because deleteRow uses 1-based indexing
            
            // Send notification
            const currentTotal = Number(total.getRange('A2').getValue()) || 0;
            const subject = '🗑️ Đã xóa bản ghi nhận tiền';
            const message = 'Đã xóa bản ghi:\n' +
              '📅 Ngày: ' + formatDate_(deletedDate) + '\n' +
              '💰 Số tiền: ' + formatAmount_(deletedAmount) + '\n' +
              '💵 Tổng tiền còn lại: ' + formatAmount_(currentTotal);
            sendNotification_(subject, message);
            
            // Check for low balance and notify
            checkAndNotifyLowBalance_(currentTotal);
            
            return jsonOutput({ ok: true, deleted: id });
          }
        }
        return jsonOutput({ ok: false, error: 'Không tìm thấy bản ghi để xóa' });
      }
    }

    // create
    if (!type || !occurredAt || amount === undefined) {
      return jsonOutput({ ok: false, error: 'Thiếu dữ liệu bắt buộc' });
    }

    const uuid = Utilities.getUuid();
    const now = new Date(); // Creation timestamp
    
    if (type === 'spending') {
      // Spending: A=ID, B=Date (occurredAt), C=Description, D=Amount, E=CreatedAt
      spending.appendRow([uuid, new Date(occurredAt), description, Number(amount), now]);
      const row = spending.getLastRow();
      spending.getRange(row, 2).setNumberFormat('dd/MM/yyyy');
      spending.getRange(row, 5).setNumberFormat('dd/MM/yyyy'); // Format creation date
    } else {
      // Receiving: A=ID, B=Date (occurredAt), C=Amount, D=CreatedAt
      receiving.appendRow([uuid, new Date(occurredAt), Number(amount), now]);
      const row = receiving.getLastRow();
      receiving.getRange(row, 2).setNumberFormat('dd/MM/yyyy');
      receiving.getRange(row, 4).setNumberFormat('dd/MM/yyyy'); // Format creation date
    }

    // Force spreadsheet to recalculate formulas
    SpreadsheetApp.flush();

    // Get total after adding the row (formula will auto-calculate)
    // Try reading it a couple times to ensure formula has recalculated
    let newTotal = Number(total.getRange('A2').getValue()) || 0;
    Utilities.sleep(100); // Small delay to ensure formula recalculates
    SpreadsheetApp.flush();
    newTotal = Number(total.getRange('A2').getValue()) || 0;

    Logger.log('About to send notification for new ' + type + ' record. Total: ' + newTotal);

    // Send notification - do this BEFORE returning
    let notificationSent = false;
    try {
      if (type === 'spending') {
        const subject = '💸 Đã thêm chi tiêu mới';
        const message = 'Đã thêm bản ghi chi tiêu:\n' +
          '📅 Ngày: ' + formatDate_(new Date(occurredAt)) + '\n' +
          '📝 Mô tả: ' + (description || '—') + '\n' +
          '💰 Số tiền: ' + formatAmount_(Number(amount)) + '\n' +
          '💵 Tổng tiền còn lại: ' + formatAmount_(newTotal);
        Logger.log('Calling sendNotification_ for spending...');
        notificationSent = sendNotification_(subject, message);
        Logger.log('sendNotification_ returned: ' + notificationSent);
      } else {
        const subject = '💵 Đã thêm nhận tiền mới';
        const message = 'Đã thêm bản ghi nhận tiền:\n' +
          '📅 Ngày: ' + formatDate_(new Date(occurredAt)) + '\n' +
          '💰 Số tiền: ' + formatAmount_(Number(amount)) + '\n' +
          '💵 Tổng tiền còn lại: ' + formatAmount_(newTotal);
        Logger.log('Calling sendNotification_ for receiving...');
        notificationSent = sendNotification_(subject, message);
        Logger.log('sendNotification_ returned: ' + notificationSent);
      }
      Logger.log('Notification process completed. Result: ' + notificationSent);
      
      // Check for low balance and notify
      checkAndNotifyLowBalance_(newTotal);
    } catch (notifError) {
      Logger.log('EXCEPTION in notification code: ' + notifError.toString());
      Logger.log('Stack: ' + notifError.stack);
      // Don't fail the whole operation if notification fails
      // Still check for low balance even if main notification failed
      try {
        checkAndNotifyLowBalance_(newTotal);
      } catch (e) {
        Logger.log('Error checking low balance: ' + e.toString());
      }
    }

    return jsonOutput({ ok: true, id: uuid });
  } catch (e) {
    return jsonOutput({ ok: false, error: 'Lỗi: ' + e.toString() });
  }
}

// ===== GET (with total-only support, recent items, and empty row filtering) =====

function doGet(e) {
  try {
    // Check if only total is requested
    if (e.parameter.total === 'true' || e.parameter.total === '1') {
      const { total } = getSheets_();
      ensureTotalSheet_(total);
      const totalVal = Number(total.getRange('A2').getValue()) || 0;
      return jsonOutput({ total: totalVal });
    }

    // Check if recent items are requested (by creation date)
    if (e.parameter.recent === 'true' || e.parameter.recent === '1') {
      const limit = parseInt(e.parameter.limit || '10', 10);
      const { total, spending, receiving } = getSheets_();
      ensureTotalSheet_(total);
      const totalVal = Number(total.getRange('A2').getValue()) || 0;
      
      const spendingData = spending.getDataRange().getValues().slice(1);
      const receivingData = receiving.getDataRange().getValues().slice(1);
      
      // For spending: A=ID, B=Date, C=Description, D=Amount, E=CreatedAt
      // For receiving: A=ID, B=Date, C=Amount, D=CreatedAt
      const spendingRows = spendingData
        .filter(r => !isRowEmpty_(r, true))
        .map((r) => {
          const dateValue = r[1]; // Transaction date
          const createdAtValue = r[4] || r[1]; // Creation date (fallback to transaction date for old rows)
          return {
            id: String(r[0] || ''),
            date: toDDMMYYYY_(dateValue),
            description: String(r[2] || ''),
            amount: Number(r[3] || 0),
            _createdAt: createdAtValue instanceof Date ? createdAtValue : new Date(createdAtValue)
          };
        })
        .sort((a, b) => {
          return b._createdAt.getTime() - a._createdAt.getTime();
        })
        .slice(0, limit)
        .map(({ _createdAt, ...rest }) => rest);

      const receivingRows = receivingData
        .filter(r => !isRowEmpty_(r, false))
        .map((r) => {
          const dateValue = r[1]; // Transaction date
          const createdAtValue = r[3] || r[1]; // Creation date (fallback to transaction date for old rows)
          return {
            id: String(r[0] || ''),
            date: toDDMMYYYY_(dateValue),
            amount: Number(r[2] || 0),
            _createdAt: createdAtValue instanceof Date ? createdAtValue : new Date(createdAtValue)
          };
        })
        .sort((a, b) => {
          return b._createdAt.getTime() - a._createdAt.getTime();
        })
        .slice(0, limit)
        .map(({ _createdAt, ...rest }) => rest);

      return jsonOutput({
        total: totalVal,
        spending: spendingRows,
        receiving: receivingRows
      });
    }

    // Otherwise, return logs with date range filtering (by creation date)
    const dateFrom = (e.parameter.dateFrom || '').trim();
    const dateTo = (e.parameter.dateTo || '').trim();
    const { total, spending, receiving } = getSheets_();
    ensureTotalSheet_(total);
    const totalVal = Number(total.getRange('A2').getValue()) || 0;
    
    const spendingData = spending.getDataRange().getValues().slice(1);
    const receivingData = receiving.getDataRange().getValues().slice(1);
    
    // For spending: A=ID, B=Date, C=Description, D=Amount, E=CreatedAt
    const spendingRows = spendingData
      .filter(r => !isRowEmpty_(r, true))
      .map((r) => {
        const dateValue = r[1]; // Transaction date (for display)
        const createdAtValue = r[4] || r[1]; // Creation date (fallback to transaction date for old rows)
        return {
          id: String(r[0] || ''),
          date: toDDMMYYYY_(dateValue),
          description: String(r[2] || ''),
          amount: Number(r[3] || 0),
          _createdAt: createdAtValue instanceof Date ? createdAtValue : new Date(createdAtValue)
        };
      })
      .filter(r => dateInRange_(r._createdAt, dateFrom, dateTo))
      .map(({ _createdAt, ...rest }) => rest);

    // For receiving: A=ID, B=Date, C=Amount, D=CreatedAt
    const receivingRows = receivingData
      .filter(r => !isRowEmpty_(r, false))
      .map((r) => {
        const dateValue = r[1]; // Transaction date (for display)
        const createdAtValue = r[3] || r[1]; // Creation date (fallback to transaction date for old rows)
        return {
          id: String(r[0] || ''),
          date: toDDMMYYYY_(dateValue),
          amount: Number(r[2] || 0),
          _createdAt: createdAtValue instanceof Date ? createdAtValue : new Date(createdAtValue)
        };
      })
      .filter(r => dateInRange_(r._createdAt, dateFrom, dateTo))
      .map(({ _createdAt, ...rest }) => rest);

    return jsonOutput({
      total: totalVal,
      spending: spendingRows,
      receiving: receivingRows
    });
  } catch (e) {
    return jsonOutput({ ok: false, error: 'Lỗi: ' + e.toString() });
  }
}

// Keep frontend requests simple (Content-Type: text/plain, no extra headers/credentials).
