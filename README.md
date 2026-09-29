# 香港機場航班板 · HKIA Flight Board

免費 GitHub Pages 託管嘅香港國際機場航班資訊板（繁體中文）：**到港／離港**、**昨天／今天／明天**、**客機／貨機**。
Free static flight board for Hong Kong International Airport, hosted on GitHub Pages: arrivals/departures, yesterday/today/tomorrow, passenger/cargo.

## 部署步驟 Deployment

1. **開新 repo**：去 github.com 開一個 **PUBLIC**（公開）repository，名叫 `hkia-flight-board`。
   - 必須公開：公開 repo 先有無限免費 GitHub Actions 分鐘，排程更新先唔會扣錢。
   - Must be public: unlimited free Actions minutes apply to public repos only.
2. **Push 呢個目錄嘅所有檔案**去 repo 嘅 `main` branch：
   ```bash
   cd hkia-github-site
   git init
   git add -A
   git commit -m "HKIA arrival flight board"
   git branch -M main
   git remote add origin https://github.com/<你的用戶名>/hkia-flight-board.git
   git push -u origin main
   ```
3. **開 GitHub Pages**：repo → Settings → Pages → Build and deployment →
   Source 揀 **Deploy from a branch**，Branch 揀 `main` / `(root)`，Save。
4. 等一兩分鐘，網站會喺以下網址生效：
   `https://<你的用戶名>.github.io/hkia-flight-board/`
5. （可選）在 Actions 分頁可以手動撳 **Run workflow** 即時更新一次資料。

## 自動更新 Auto refresh

`.github/workflows/refresh.yml` 每 15 分鐘跑一次：問香港機場官方 API 攞最新資料
（昨天／今天／明天 × 到港／離港 × 客機／貨機），重寫 `data.json`，有變先 commit。
網頁每次開啟都會載入最新嘅 `data.json`。

右上角圓形按鈕 = 重新載入頁面（帶 cache-busting），即刻攞最新資料。

## 檔案 Files

- `index.html` — 主頁（開機畫面＋航班板，手機/桌面自適應）
- `data.json` — 航班資料快照（自動更新，唔使人手改）
- `scripts/fetch_flights.py` — 抓資料腳本（無需額外依賴，python3 即可）
- `.github/workflows/refresh.yml` — 每 15 分鐘自動更新排程

## 注意 Notes

- `REG` / `SUBTYPE` / `CHOCKS` 官方 API 無提供，顯示為「—」。
- 排程用 UTC cron（`*/15 * * * *`）；香港時間 = UTC+8。
- GitHub 會在公開 repo 連續 60 日無任何活動時自動停用排程；到時去 Actions 分頁手動撳一次 Run workflow 就會恢復。
- iPhone：用 Safari 開網站 → Share → Add to Home Screen，加到主畫面。
