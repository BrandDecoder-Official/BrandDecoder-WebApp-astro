# bastro-bot（Cloud Run 後端）

此目錄對應 `env.js` 內的 `API_BASE`（`https://bastro-bot-…run.app`）。前端仍由 GitHub Pages 部署；後端由此目錄建 Docker 映像並部署到 **Cloud Run**。

## 本機開發

1. 複製環境變數範本並填入 LINE 憑證（勿提交 `.env`）：

   ```powershell
   cd bastro-bot
   copy .env.example .env
   ```

2. 安裝依賴並啟動：

   ```powershell
   npm install
   npm run dev
   ```

3. 用 **ngrok**（或同類工具）把 `http://localhost:8080` 暴露出去，在 LINE Developers 暫時把 Webhook 指到 `https://你的網域/webhook` 做測試。

## 與 Cloud Run 原始碼同步

`bastro-bot/` 內的 `.js` 已從專案 **lllcnd** 的 Cloud Run 建置暫存（`run-sources-…/bastro-bot/*.zip`）還原，並在 `index.js` 末尾加上 **`require.main` 時 `app.listen`**，以便本機與 Docker 執行 `node index.js`（雲端從原始碼建置時仍使用 `exports.webhook`）。

若你在主控台又部署了新版本、想更新本機檔案：可用 `gcloud run services describe bastro-bot --project=lllcnd --region=asia-east1 --format='value(metadata.annotations.run.googleapis.com/build-source-location)'` 取得新的 zip 路徑，再以 `gsutil cp` 下載解壓後覆蓋對應檔案。

## GitHub → Cloud Run（鏡像部署）

做法：**Cursor 改程式 → `git push` → Google Cloud 從同一個 repo 建置並部署**。

1. 把本 repo 的變更 **push 到 GitHub**（你目前有權限的 branch，例如 `main`）。
2. 開啟 [Google Cloud Console](https://console.cloud.google.com/) → **Cloud Run** → 服務 **`bastro-bot`** → **編輯連續部署**（或「連線至存放區」）。
3. 選擇同一個 GitHub 倉庫與要部署的**分支**。
4. 建置設定（monorepo 重點）：
   - **Dockerfile 路徑**：`bastro-bot/Dockerfile`
   - **來源 / 建置背景目錄**（Build context）：`bastro-bot`  
     （若介面只有「根目錄」，選到 `bastro-bot` 子資料夾，讓建置在該目錄執行。）
5. 在 Cloud Run **環境變數** 中設定與現有服務相同的 `LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`、Firebase／Gemini 等（與本機 `.env` 對應，但不要寫進 Git）。
6. 確認 **容器連接埠** 與程式一致：本專案使用 `PORT`（預設 `8080`），Cloud Run 一般設為 **8080**；LINE Webhook URL 路徑為 **`/webhook`**（若你改成別的路徑，請同步 LINE 後台與程式）。

第一次連線 repo 時，Google 會引導建立 **Cloud Build 觸發條件**；之後每次 push 到指定分支就會自動建置並發布（實際觸發條件以你在主控台設定的為準）。

## Docker 本機建置（選用）

```powershell
cd bastro-bot
docker build -t bastro-bot:local .
docker run --rm -p 8080:8080 --env-file .env bastro-bot:local
```

## 注意

- `Dockerfile` 使用 **Node 24**，與你先前 Cloud Run 畫面一致；若雲端改版本，請一併修改 `FROM node:…`。
- 根目錄 `.gitignore` 已忽略 `node_modules` 與 `.env`，避免把密鑰推上 GitHub。
