# Money Notes (Vite + React + styled-components)

Ứng dụng nhập nhanh chi/thu và lưu thẳng vào Google Sheets.

## Chạy dự án

- Cài đặt: `npm install`
- Chạy dev: `npm run dev` (mặc định http://localhost:5173)
- Build: `npm run build`
- Xem thử bản build: `npm run preview`

## Cấu hình Google Sheets

1) Tạo file `.env` ở thư mục gốc và thêm:
```
VITE_SHEET_WEBAPP_URL=https://script.google.com/macros/s/your-webapp-id/exec
```
   (thay URL bằng web app của Google Apps Script của bạn)

2) Sheet hiện dùng: https://docs.google.com/spreadsheets/d/1voZnl0qLLD7UdrIelONjnAt599IxpfWSWJPQRHtajfs/edit?gid=0#gid=0  
   Hãy triển khai Apps Script web app trỏ tới sheet này và cấp quyền ghi.

3) Copy nội dung từ `appscript.gs` vào Google Apps Script editor và deploy lại web app.

## Cấu trúc Google Sheets

### Spending Sheet
- Column A: ID (UUID)
- Column B: Date (Transaction date - occurredAt)
- Column C: Description
- Column D: Amount
- Column E: CreatedAt (Creation timestamp - used for filtering)

### Receiving Sheet
- Column A: ID (UUID)
- Column B: Date (Transaction date - occurredAt)
- Column C: Amount
- Column D: CreatedAt (Creation timestamp - used for filtering)

**Lưu ý:** Filtering (date range queries) sử dụng **creation date** (CreatedAt), không phải transaction date. Điều này cho phép lọc các bản ghi theo thời điểm chúng được thêm vào hệ thống.

## Ghi chú

- Thiếu biến môi trường trên, ứng dụng sẽ báo lỗi "Thiếu URL webhook Google Sheet".
- Form đã có kiểm tra đơn giản (bắt buộc, số tiền ≥ 0). Muốn thêm xác thực, chỉnh trong `src/App.tsx`.
