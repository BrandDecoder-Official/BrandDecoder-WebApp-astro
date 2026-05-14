/**
 * LINE Webhook（Cloud Run 入口與 Console 設定一致時路徑為 /webhook）
 * 若你雲端專案的路由不同，請改 app.post 第一個參數，並同步 Cloud Run「容器連接埠的對應」與 LINE Developers 的 Webhook URL。
 */

if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch {
    /* optional in production */
  }
}

const express = require("express");
const line = require("@line/bot-sdk");

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || "",
};

const client = new line.Client(config);

const app = express();
const port = Number(process.env.PORT) || 8080;

app.get("/", (_req, res) => {
  res.type("text/plain").send("bastro-bot ok");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }
  const text = event.message.text;
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: `（本機骨架）已收到：${text}\n請把 Cloud Run 上的模組貼回此 repo 的 bastro-bot/ 目錄後再部署。`,
  });
}

app.post(
  "/webhook",
  line.middleware(config),
  (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
      .then(() => res.status(200).end())
      .catch((err) => {
        console.error(err);
        res.status(500).end();
      });
  },
);

app.listen(port, () => {
  console.log(`listening on ${port}`);
});
