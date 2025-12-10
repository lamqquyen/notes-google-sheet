// ===== Config =====

const SHEET_ID = '1voZnl0qLLD7UdrIelONjnAt599IxpfWSWJPQRHtajfs';

const TOTAL_SHEET = 'Total';

const SPENDING_SHEET = 'Spending';

const RECEIVING_SHEET = 'Receiving';

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
    totalSheet.getRange('A2').setValue(0);
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
            // deleteRow automatically shifts all rows below up
            sheet.deleteRow(i + 1); // +1 because deleteRow uses 1-based indexing
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
            // deleteRow automatically shifts all rows below up
            sheet.deleteRow(i + 1); // +1 because deleteRow uses 1-based indexing
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
      const row = spending.appendRow([uuid, new Date(occurredAt), description, Number(amount), now]).getRow();
      spending.getRange(row, 2).setNumberFormat('dd/MM/yyyy');
      spending.getRange(row, 5).setNumberFormat('dd/MM/yyyy'); // Format creation date
    } else {
      // Receiving: A=ID, B=Date (occurredAt), C=Amount, D=CreatedAt
      const row = receiving.appendRow([uuid, new Date(occurredAt), Number(amount), now]).getRow();
      receiving.getRange(row, 2).setNumberFormat('dd/MM/yyyy');
      receiving.getRange(row, 4).setNumberFormat('dd/MM/yyyy'); // Format creation date
    }

    const currentTotal = Number(total.getRange('A2').getValue()) || 0;
    const delta = type === 'spending' ? -Number(amount) : Number(amount);
    total.getRange('A2').setValue(currentTotal + delta);

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
