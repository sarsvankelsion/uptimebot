# ⏱️ UptimeBot

![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)
![Discord](https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=white)

Check website uptime mỗi ~30 giây và gửi alert qua **Discord webhook** khi có sự cố. Chạy hoàn toàn miễn phí trên GitHub Actions.

## ✨ Tính năng

- 🟢 Ping định kỳ mỗi 30 giây
- 🔔 Thông báo tức thì qua Discord webhook khi site down
- 📊 Dashboard HTML trực quan (xem `dashboard.html`)
- ⚙️ Cấu hình linh hoạt qua `config.json` / `monitors.json`

## 🚀 Cài đặt

### 1. Clone & push repo

```bash
git init
git add .
git commit -m "first"
git branch -M main
git remote add origin https://github.com/<USER>/uptimebot.git
git push -u origin main
```

### 2. Thêm secrets trên GitHub

Vào **Settings → Secrets and variables → Actions**, thêm 2 secrets:

- `WEBHOOK_URL` = URL webhook Discord
- `MONITORS_JSON` = danh sách URL cần check:

```json
[{"name":"Google","url":"https://google.com","type":"http"}]
```

### 3. Chạy

Vào tab **Actions** xem workflow chạy.

## 📁 Cấu trúc

```
├── .github/        # GitHub Actions workflow
├── scripts/        # Script kiểm tra uptime
├── index.html      # Trang chủ
├── dashboard.html  # Dashboard monitor
├── config.json     # Cấu hình
└── monitors.json   # Danh sách URL monitor
```

## 📄 License

MIT