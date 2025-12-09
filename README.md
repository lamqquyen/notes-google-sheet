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

## Ghi chú

- Thiếu biến môi trường trên, ứng dụng sẽ báo lỗi “Thiếu URL webhook Google Sheet”.
- Form đã có kiểm tra đơn giản (bắt buộc, số tiền ≥ 0). Muốn thêm xác thực, chỉnh trong `src/App.tsx`.
