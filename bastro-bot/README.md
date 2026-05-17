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
- **ClientBackURL**：預設導向 `https://astro.branddecoderai.com/member/payment-success.html?order=…`（`PAYMENT_SUCCESS_URL`）。
- **OrderResultURL**：`POST` 至 `/api/pay/ecpay/result`（信用卡等即時付款完成後導回），再 **302** 至成功／失敗頁；**入帳仍以 ReturnURL 為準**。
- **查詢入帳**：`GET /api/pay/order-status?orderId=…`（LINE Bearer），供成功頁輪詢。
- **MEMBER_PROFILE_URL**：成功／失敗頁「返回會員中心」按鈕用 LIFF 入口。
- 請勿將 **HashKey / HashIV** 提交至 Git；測試／正式網址與商店代號需一致（見 `.env.example`）。
- 文件：[全方位金流付款](https://developers.ecpay.com.tw/2864/) · [測試介接資訊](https://developers.ecpay.com.tw/2856/)

### 測試環境（Stage）設定

在 **Cloud Run** 或本機 `.env` 設定（勿 commit）：

| 變數 | 說明 |
|------|------|
| `ECPAY_MERCHANT_ID` | 測試特店編號（官方文件「模擬銀行3D驗證」範例為 `3002607`） |
| `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` | 與該測試特店後台「系統介接設定」一致 |
| 勿設或 `ECPAY_STAGE` 非 `production` | 使用 `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5` |
| `PUBLIC_BASE_URL` | Cloud Run 對外網址，例如 `https://bastro-bot-….asia-east1.run.app`（供 `ReturnURL`） |

測試信用卡（文件）：`4311-9511-1111-1111`、CVV 任意三碼；3D 簡訊驗證碼固定 `1234`。  
後台模擬付款：`SimulatePaid=1` 時本系統**不會入帳**，僅驗證 `ReturnURL` 是否回 `1|OK`。

## 法務／條款字典檔（與前端、說明頁共用）

- **單一來源**：`bastro-bot/legal-service-manifest.json`（儲值檔位、扣點表、聯絡資訊、`termsGate` 儲值前摘要、`templates` 綠界品名模板等）。
- **後端**：`legalManifest.js` 於建單時 `require` 讀取；`POST /api/pay/request` 使用 `buildPayStrings()` 產生 **TradeDesc / ItemName**。
- **前端／說明頁**：請以 **`/bastro-bot/legal-service-manifest.json`** 同網域 fetch（GitHub Pages 部署整個 repo 時路徑即存在）。會員 LIFF 與 `service-points-notice.html` 已改為讀此檔；fetch 失敗時會員頁有內嵌後備檔位與條款摘要。

## 與 Cloud Run 原始碼同步

`bastro-bot/` 內的 `.js` 已從專案 **lllcnd** 的 Cloud Run 建置暫存（`run-sources-…/bastro-bot/*.zip`）還原，並在 `index.js` 末尾加上 **`require.main` 時 `app.listen`**，以便本機與 Docker 執行 `node index.js`（雲端從原始碼建置時仍使用 `exports.webhook`）。

若你在主控台又部署了新版本、想更新本機檔案：可用 `gcloud run services describe bastro-bot --project=lllcnd --region=asia-east1 --format='value(metadata.annotations.run.googleapis.com/build-source-location)'` 取得新的 zip 路徑，再以 `gsutil cp` 下載解壓後覆蓋對應檔案。

## 部署後端（一鍵，建議）

在 **repo 根目錄**（`Astro`，不是 `bastro-bot` 內）用 PowerShell：

```powershell
# 只看本機與 Cloud Run 是否同一版
.\scripts\deploy-backend.ps1

# 已 commit 後：推送 main 並等到上線（約 3～8 分鐘）
.\scripts\deploy-backend.ps1 -Push

# 一次完成提交、推送、等待
.\scripts\deploy-backend.ps1 -Push -Message "fix: 說明"
```

流程：`push main` → GCP **Cloud Build**（`bastro-bot/Dockerfile`）→ **Cloud Run** `bastro-bot`（專案 `lllcnd`、區域 `asia-east1`）。  
在 Cursor 也可直接說：**「部署後端」**（代理會跑上述腳本；**push 前會先問你是否同意**）。

Firestore 的 prompt／扣點變更**不需** redeploy；只有改 `bastro-bot/*.js` 才需要。

## GitHub → Cloud Run（主控台設定參考，已完成可略）

連續部署已接：`BrandDecoder-Official/BrandDecoder-WebApp-astro` 的 **`main`**，context **`bastro-bot`**。  
環境變數仍在 Cloud Run 主控台維護（`LINE_*`、`GEMINI_*`、`ECPAY_*`、`PUBLIC_BASE_URL` 等，見 `.env.example`）。

## Docker 本機建置（選用）

```powershell
cd bastro-bot
docker build -t bastro-bot:local .
docker run --rm -p 8080:8080 --env-file .env bastro-bot:local
```

## 注意

- `Dockerfile` 使用 **Node 24**，與你先前 Cloud Run 畫面一致；若雲端改版本，請一併修改 `FROM node:…`。
- 根目錄 `.gitignore` 已忽略 `node_modules` 與 `.env`，避免把密鑰推上 GitHub。
