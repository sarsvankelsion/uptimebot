# UptimeBot — GitHub Actions + Discord

Check website uptime mỗi ~30 giây, gửi alert qua Discord webhook khi có sự cố.

## Cài đặt

1. Tạo repo GitHub: https://github.com/new → tên `uptimebot`
2. Chạy lệnh:
   ```bash
   git init
   git add .
   git commit -m "first"
   git branch -M main
   git remote add origin https://github.com/<USER>/uptimebot.git
   git push -u origin main
   ```
3. Vào repo trên GitHub → **Settings → Secrets and variables → Actions**
   Thêm 2 secrets:
   - `WEBHOOK_URL` = URL webhook Discord
   - `MONITORS_JSON` = danh sách URL cần check:
     ```json
     [{"name":"Google","url":"https://google.com","type":"http"}]
     ```

Xong. Vào **Actions** tab xem workflow chạy.
