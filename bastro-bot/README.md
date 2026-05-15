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

## 綠界金流（ECPay）

- 建單：`POST /api/pay/request`（需 LINE Bearer）→ 回傳 `{ action, fields }`，前端以 **POST form** 導轉至綠界 `Cashier/AioCheckOut/V5`。
- 入帳：綠界 **幕後** `POST` 至 **`/api/pay/ecpay/notify`**（`ReturnURL`），驗證 **CheckMacValue**、`RtnCode === 1` 後寫入 Firestore 並加點；回應字串必須為 **`1|OK`**。
- **ClientBackURL**（`MEMBER_PROFILE_URL`）：預設為會員 **LIFF 入口**（`liff.line.me/…`），讓使用者在 LINE 內按「返回商店」回到同一 LIFF。
- 請勿將 **HashKey / HashIV** 提交至 Git；測試／正式網址與商店代號需一致（見 `.env.example`）。

## 法務／條款字典檔（與前端、說明頁共用）

- **單一來源**：`bastro-bot/legal-service-manifest.json`（儲值檔位、扣點表、聯絡資訊、`termsGate` 儲值前摘要、`templates` 綠界品名模板等）。
- **後端**：`legalManifest.js` 於建單時 `require` 讀取；`POST /api/pay/request` 使用 `buildPayStrings()` 產生 **TradeDesc / ItemName**。
- **前端／說明頁**：請以 **`/bastro-bot/legal-service-manifest.json`** 同網域 fetch（GitHub Pages 部署整個 repo 時路徑即存在）。會員 LIFF 與 `service-points-notice.html` 已改為讀此檔；fetch 失敗時會員頁有內嵌後備檔位與條款摘要。

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
5. 在 Cloud Run **環境變數** 中設定：`LINE_CHANNEL_*`、`GEMINI_API_KEY`、`ADMIN_EMAILS`、Firebase（若需）、**`PUBLIC_BASE_URL`**（Cloud Run HTTPS 基底網址，供綠界 **ReturnURL**）、**`ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV`**（取自綠界後台 **系統設定 → 介接資訊 →「金流、MPOS」** 那一列；物流／電子收據列若未開通請勿誤用）、**`ECPAY_STAGE`**（正式環境設 `production`，測試留空或 `stage`）、選填 **`ECPAY_CHOOSE_PAYMENT`**（預設 `ALL`）、**`MEMBER_PROFILE_URL`**（綠界 **ClientBackURL**「返回商店」；預設為會員 **LIFF 入口** `https://liff.line.me/…` 以留在 LINE 內）、**`TG_BOT_TOKEN` + `TG_CHAT_ID`**（或 `TELEGRAM_*`）。並**移除**已停用的 `LINEPAY_*`。
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
