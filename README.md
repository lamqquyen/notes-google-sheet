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

4) **Cấu hình thông báo Telegram (Notifications):**
   
   **Bước 1: Tạo Telegram Bot**
   - Mở Telegram và tìm [@BotFather](https://t.me/botfather)
   - Gửi lệnh `/newbot`
   - Làm theo hướng dẫn để đặt tên cho bot (ví dụ: "My Money Tracker Bot")
   - BotFather sẽ cung cấp một **Bot Token** (dạng: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
   - **Lưu token này lại** - bạn sẽ cần nó ở bước tiếp theo

   **Bước 2: Lấy Chat ID**
   - Tìm bot vừa tạo trong Telegram (tìm theo tên bạn đã đặt)
   - Gửi một tin nhắn bất kỳ cho bot (ví dụ: "Hello")
   - Mở trình duyệt và truy cập URL sau (thay `<YOUR_BOT_TOKEN>` bằng token bạn vừa nhận):
     ```
     https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
     ```
   - Bạn sẽ thấy một JSON response. Tìm phần `"chat":{"id":123456789}` - số `123456789` chính là **Chat ID** của bạn
   - **Lưu Chat ID này lại**

   **Bước 3: Cấu hình trong Google Apps Script**
   - Mở Google Apps Script editor (nơi bạn đã paste code từ `appscript.gs`)
   - Tìm 2 dòng này trong code:
     ```javascript
     const TELEGRAM_BOT_TOKEN = ''; 
     const TELEGRAM_CHAT_ID = '';
     ```
   - Điền Bot Token vào `TELEGRAM_BOT_TOKEN` (giữ nguyên dấu nháy đơn):
     ```javascript
     const TELEGRAM_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
     ```
   - Điền Chat ID vào `TELEGRAM_CHAT_ID` (giữ nguyên dấu nháy đơn):
     ```javascript
     const TELEGRAM_CHAT_ID = '123456789';
     ```
   - Lưu lại (Ctrl+S hoặc Cmd+S)
   - **Deploy lại web app** (Deploy > Manage deployments > Edit > Deploy)

   **Bước 4: Kiểm tra cấu hình**
   
   **Test 1: Test notification function trực tiếp**
   - Trong Google Apps Script editor, chọn function `testAddNotification` từ dropdown
   - Click nút "Run" (▶️) để chạy test
   - Kiểm tra "Execution log" (View > Logs) để xem kết quả
   - Nếu thành công, bạn sẽ nhận được tin nhắn test trong Telegram
   
   **Test 2: Test doPost để thêm record (giống như từ frontend)**
   - Chọn function `testDoPostAddSpending` để test thêm chi tiêu
   - Hoặc chọn `testDoPostAddReceiving` để test thêm nhận tiền
   - Click Run (▶️)
   - Kiểm tra logs để xem notification có được gửi không
   - Kiểm tra Telegram để xem có nhận được notification không
   - Kiểm tra Google Sheets để xem record có được thêm không
   
   **Lưu ý:** Các test function này sẽ thực sự thêm record vào sheet của bạn, không phải chỉ test!
   
   Nếu thất bại, xem phần Troubleshooting bên dưới

   **Cách xem Execution Logs:**
   
   **Khi chạy function trực tiếp (test):**
   1. Trong Apps Script editor, chọn function từ dropdown (ví dụ: `testAddNotification`)
   2. Click Run (▶️)
   3. Xem logs ở phần "Execution log" phía dưới editor
   4. Hoặc vào menu **View > Logs** (hoặc nhấn Ctrl+Enter / Cmd+Enter)
   
   **Khi script chạy qua Web App (khi thêm/xóa record từ frontend):**
   1. Trong Apps Script editor, click vào icon **"Executions"** (⏱️) ở sidebar bên trái
   2. Hoặc vào menu **View > Executions**
   3. Bạn sẽ thấy danh sách các lần chạy gần đây
   4. Click vào một execution để xem chi tiết
   5. Trong execution details, click tab **"Logs"** để xem tất cả Logger.log() messages
   6. **Lưu ý:** Logs chỉ hiển thị trong vòng 24 giờ sau khi execution hoàn thành
   
   **Nếu không thấy Executions:**
   - Đảm bảo bạn đã deploy web app
   - Thử thêm một record từ frontend để trigger execution
   - Đợi vài giây rồi refresh trang Executions

   **Lưu ý:** 
   - Nếu không muốn dùng Telegram notifications, để trống 2 biến này (giữ nguyên dấu nháy đơn rỗng `''`)
   - Sau khi deploy, thử thêm một bản ghi chi tiêu mới để kiểm tra xem notification có hoạt động không

   **Troubleshooting (Khắc phục sự cố):**
   
   Nếu không nhận được notifications, kiểm tra các điểm sau:
   
   0. **⚠️ QUAN TRỌNG: Cấp quyền cho Apps Script (Authorization):**
      
      **Nếu bạn KHÔNG thấy popup authorization, thử các cách sau:**
      
      **Cách 1: Chạy function và xem Execution Log**
      1. Chạy function `testTelegramNotification` (Run ▶️)
      2. Nếu thấy lỗi về permissions trong Execution log
      3. Click vào link "Request Authorization" hoặc "Review Permissions" trong log
      4. Hoặc vào menu **Run > Run function > testTelegramNotification** và chờ popup
      
      **Cách 2: Manual Authorization qua Menu**
      1. Trong Apps Script editor, vào menu **Run** (hoặc **Execute**)
      2. Chọn **Run function > testTelegramNotification**
      3. Nếu không thấy popup, thử refresh trang (F5) và chạy lại
      
      **Cách 3: Chạy function triggerAuthorization (ĐÃ CÓ SẴN TRONG CODE)**
      1. Trong Apps Script editor, chọn function `triggerAuthorization` từ dropdown
      2. Click Run (▶️)
      3. Nếu popup xuất hiện, làm theo hướng dẫn
      4. Nếu không thấy popup, thử Cách 4 hoặc Cách 5
      
      **Cách 4: Manual Authorization qua Project Settings**
      1. Trong Apps Script editor, click vào icon ⚙️ (Project Settings) hoặc File > Project settings
      2. Scroll xuống phần "OAuth scopes"
      3. Tìm scope: `https://www.googleapis.com/auth/script.external_request`
      4. Nếu không thấy, thử deploy web app (Cách 6)
      
      **Cách 5: Deploy Web App để trigger authorization**
      1. Trong Apps Script editor, vào **Deploy > New deployment**
      2. Click icon ⚙️ (Select type) > chọn **"Web app"**
      3. Execute as: **"Me"**
      4. Who has access: **"Only myself"**
      5. Click **"Deploy"**
      6. Quá trình deploy có thể trigger authorization popup
      7. Sau khi deploy, quay lại và chạy `testTelegramNotification`
      
      **Cách 4: Kiểm tra Authorization Status**
      1. Vào menu **Run > Run function > testTelegramNotification**
      2. Nếu không thấy popup, có thể bạn đã cấp quyền rồi nhưng thiếu scope
      3. Vào **View > Show execution transcript** để xem chi tiết
      4. Hoặc vào **View > Stackdriver Logging** để xem logs chi tiết hơn
      
      **Cách 6: Xóa và cấp lại quyền (nếu các cách trên không work)**
      1. Vào [Google Account Permissions](https://myaccount.google.com/permissions)
      2. Tìm app "Google Apps Script API" hoặc tên project của bạn
      3. Click **Remove** để xóa quyền cũ
      4. Quay lại Apps Script editor và chạy lại function `triggerAuthorization`
      5. Popup sẽ xuất hiện để cấp quyền mới
      
      **Cách 7: Kiểm tra Popup Blocker**
      - Đảm bảo trình duyệt không chặn popup từ `script.google.com`
      - Thử dùng trình duyệt khác hoặc chế độ Incognito/Private
      - Hoặc thử trên thiết bị khác
      
      **Khi popup xuất hiện:**
      1. Click **"Review Permissions"**
      2. Chọn tài khoản Google của bạn
      3. Click **"Advanced"** ở dưới cùng (nếu có cảnh báo)
      4. Click **"Go to [Your Project Name] (unsafe)"** (đây là an toàn vì đây là script của bạn)
      5. Click **"Allow"** để cấp quyền
      6. Quay lại Apps Script editor và chạy lại function `testTelegramNotification`
      
      - Sau khi cấp quyền, script sẽ có thể gửi HTTP requests đến Telegram API
      - **Lưu ý:** Bạn chỉ cần làm bước này một lần. Sau đó script sẽ tự động có quyền
   
   1. **Kiểm tra Bot Token và Chat ID:**
      - Đảm bảo Bot Token không có khoảng trắng thừa ở đầu/cuối
      - Đảm bảo Chat ID đúng (có thể là số dương hoặc số âm cho group chats)
      - Chat ID phải là số bạn đã nhận được từ `/getUpdates`
   
   2. **Kiểm tra Bot đã được start:**
      - Mở chat với bot trong Telegram
      - Gửi lệnh `/start` cho bot
      - Một số bot cần được start trước khi có thể nhận tin nhắn
   
   3. **Kiểm tra quyền truy cập:**
      - Nếu Chat ID là số âm (ví dụ: `-5064851741`), đây là group chat
      - Bot phải được thêm vào group và có quyền gửi tin nhắn
      - Nếu là private chat, đảm bảo bạn đã gửi tin nhắn cho bot trước đó
   
   4. **Kiểm tra Execution Logs:**
      - Trong Google Apps Script editor, vào View > Logs
      - Chạy lại function `testTelegramNotification`
      - Xem log để tìm lỗi cụ thể
      - Các lỗi phổ biến:
        - `You do not have permission to call UrlFetchApp.fetch`: Cần cấp quyền authorization (xem bước 0 ở trên)
        - `401 Unauthorized`: Bot Token sai
        - `400 Bad Request`: Chat ID sai hoặc bot chưa được start
        - `403 Forbidden`: Bot không có quyền gửi tin nhắn đến chat này
   
   5. **Test trực tiếp với Telegram API:**
      - Mở trình duyệt và thử gửi tin nhắn thủ công:
        ```
        https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage?chat_id=<YOUR_CHAT_ID>&text=Test
        ```
      - Nếu URL này hoạt động, vấn đề có thể ở code Apps Script
      - Nếu URL này không hoạt động, vấn đề ở Bot Token hoặc Chat ID

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
