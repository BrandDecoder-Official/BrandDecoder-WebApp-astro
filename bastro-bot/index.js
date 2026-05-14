// ==========================================
// BrandDecoder - 命運解碼室 後端核心 (index.js)
// 版本：v5.0 (全模組化微服務架構 + AGUI 播報台)
// ==========================================

const payments = require('./payments'); 
const express = require('express');
const { middleware, Client } = require('@line/bot-sdk');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
const fetch = require('node-fetch'); 

// 1. 🌟 必須先啟動 Firebase 引擎
initializeApp();
const db = getFirestore('astro-bot-db');

// 2. 🌟 引入所有的子模組 (依賴注入)
const adminRouter = require('./admin');
const adminAiRouter = require('./admin_ai');
const adminKpiRouter = require('./admin_kpi');
const { recordDivinationLog } = require('./logger'); 
const numerologyRouter = require('./numerology');
const tarotHandler = require('./tarot');   // 🔮 塔羅牌微服務
const ziweiHandler = require('./ziwei');   // 🏮 紫微斗數微服務

const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();

const PLATFORM_VERSION = "v5.0";
const AI_MODEL = "gemini-3-flash-preview"; 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: AI_MODEL });

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.status(200).end();
    next();
});

// 🚀 掛載各大微服務 Router
app.use('/api/admin', express.json(), adminRouter);
app.use('/api/admin', express.json(), adminAiRouter);
app.use('/api/admin', express.json(), adminKpiRouter);
app.use('/api/numerology', express.json(), numerologyRouter);

// 🛡️ JWT 通行證驗證結界
async function verifyLineToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '結界阻擋：未提供有效通行證' });
    }
    const token = authHeader.split(' ')[1];
    
    try {
        const response = await fetch('https://api.line.me/v2/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Token 無效或已過期');
        
        const profile = await response.json();
        req.user = profile; 
        next(); 
    } catch (error) {
        console.error("Token 驗證失敗:", error.message);
        res.status(401).json({ success: false, message: '結界阻擋：通行證驗證失敗' });
    }
}

// ==========================================
// 👤 用戶與歷史紀錄 API
// ==========================================
app.get('/api/user/profile', verifyLineToken, async (req, res) => {
    try {
        const userId = req.user.userId; 
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ success: false, message: "查無此星盤紀錄" });
        
        const data = userDoc.data();
        res.status(200).json({
            success: true,
            data: {
                displayName: data.displayName || req.user.displayName,
                pictureUrl: data.pictureUrl || req.user.pictureUrl,
                points: data.points || 0,
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
                lastDrawDate: data.lastDrawDate,
                lastFirstRechargePeriod: data.lastFirstRechargePeriod || null
            }
        });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/user/sync-profile', express.json(), verifyLineToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { displayName, pictureUrl } = req.body;
        
        if (displayName || pictureUrl) {
            await db.collection('users').doc(userId).set({
                displayName: displayName || req.user.displayName,
                pictureUrl: pictureUrl || req.user.pictureUrl
            }, { merge: true });
        }
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/user/history', verifyLineToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        let historyQuery = db.collection('users').doc(userId).collection('history');

        if (req.query.days) {
            const days = parseInt(req.query.days);
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - days);
            historyQuery = historyQuery.where('timestamp', '>=', pastDate).orderBy('timestamp', 'desc');
        } else {
            const limit = parseInt(req.query.limit) || 15;
            historyQuery = historyQuery.orderBy('timestamp', 'desc').limit(limit);
        }
        
        const historySnapshot = await historyQuery.get();
        const history = historySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                type: data.type, 
                topic: data.topic || null,
                cards: data.cards || null,
                result_card: data.result_card || null,
                aiText: data.aiText || null,
                points_change: data.points_change || 0,
                fortune_score: data.fortune_score || null,
                amount_paid: data.amount_paid || null, 
                timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null
            };
        });
        res.status(200).json({ success: true, data: history });
    } catch (error) { res.status(500).json({ success: false }); }
});

// ==========================================
// 💳 LINE Pay 金流區
// ==========================================
app.post('/api/pay/request', express.json(), verifyLineToken, async (req, res) => {
    try {
        const { amount, productName, pointsGiven, periodCode } = req.body;
        const userId = req.user.userId; 
        const orderId = `ORD_${Date.now()}_${userId.slice(-4)}`; 

        const result = await payments.requestPayment(orderId, amount, productName);

        if (result.returnCode === '0000') {
            await db.collection('orders').doc(orderId).set({
                userId, amount, pointsGiven: pointsGiven || amount, periodCode: periodCode || null,    
                status: 'pending', paymentMethod: 'LINE Pay', createdAt: Timestamp.now()
            });
            res.json({ success: true, url: result.info.paymentUrl.web });
        } else {
            res.status(400).json({ success: false, msg: 'LINE Pay 請求失敗' });
        }
    } catch (error) { res.status(500).json({ success: false, msg: error.message }); }
});

app.get('/api/pay/confirm', async (req, res) => {
    try {
        const { transactionId, orderId } = req.query;
        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) return res.status(404).send('訂單不存在');
        
        const { amount, pointsGiven, periodCode, userId, status, paymentMethod = 'LINE Pay' } = orderDoc.data();
        if (status === 'success') return res.send('此訂單已完成，請勿重複跳轉');

        const result = await payments.confirmPayment(transactionId, amount);

        if (result.returnCode === '0000') {
            const batch = db.batch();
            batch.update(db.collection('orders').doc(orderId), { status: 'success', transactionId, completedAt: Timestamp.now() });

            let userUpdateData = { points: FieldValue.increment(pointsGiven) };
            if (periodCode) userUpdateData.lastFirstRechargePeriod = periodCode;
            batch.update(db.collection('users').doc(userId), userUpdateData);

            const userDocRef = await db.collection('users').doc(userId).get();
            const userName = userDocRef.exists ? (userDocRef.data().displayName || '未知用戶') : '未知用戶';

            const historyRef = db.collection('users').doc(userId).collection('history').doc();
            batch.set(historyRef, { type: 'recharge', amount_paid: amount, points_change: pointsGiven, timestamp: Timestamp.now() });

            const globalLogRef = db.collection('divination_logs').doc();
            batch.set(globalLogRef, {
                userId, userName, type: 'recharge', log_class: 'revenue', paymentMethod, 
                summary: `透過 ${paymentMethod} 儲值：獲取 ${pointsGiven} 點`, amount_paid: amount, points_change: pointsGiven, timestamp: Timestamp.now()
            });

            await batch.commit();

            // 🚀 TG 戰情室即時捷報推播
            try {
                const TG_BOT_TOKEN = '8723941323:AAEE5fPueDK5xdf4XD6WzH-LgjeGFwj7FKQ';
                const TG_CHAT_ID = '8549380045';
                const now = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
                const tgMessage = `🚀 【新香油錢入帳捷報】\n\n👤 靈魂代號：${userName}\n💎 儲值金額：NT$ ${amount}\n🔋 獲得靈力：${pointsGiven} 點\n💳 付款方式：${paymentMethod}\n⏱️ 交易時間：${now}\n\n✨ 命運解碼室營收持續增長中！`;
                
                fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: TG_CHAT_ID, text: tgMessage })
                }).catch(err => console.error("TG推播連線錯誤:", err));
            } catch(e) { console.error("TG捷報系統發生例外:", e); }

            res.send(`
                <script>
                    alert('✨ 靈力注入成功！已為您補充 ${pointsGiven} 點靈力');
                    window.location.href = 'https://astro.branddecoderai.com/member/profile.html'; 
                </script>
            `);
        } else {
            res.status(400).send('LINE Pay 扣款確認失敗');
        }
    } catch (error) { res.status(500).send('系統發生錯誤'); }
});

// ==========================================
// 📊 API: 埋點與票根
// ==========================================
app.post('/api/log/stage', express.json(), async (req, res) => {
    try {
        const { stage, type } = req.body;
        let userId = req.body.userId; 
        let userName = '未知用戶';

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                userId = userId || payload.sub; 
            } catch(e) { console.log("埋點 Token 解析略過"); }
        }

        if (!userId) return res.status(200).json({ success: true, msg: "無 userId，忽略埋點" });

        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) userName = userDoc.data().displayName || userDoc.data().name || '未知用戶';

        await recordDivinationLog({
            userId, userName, type, log_class: 'system', stage, summary: `系統背景程序：${stage}`, points_change: 0
        });

        res.status(200).json({ success: true });
    } catch (e) { res.status(500).end(); }
});

app.post('/api/tarot/ticket', express.json(), verifyLineToken, async (req, res) => {
    try {
        const userId = req.user.userId; 
        const { topic, cards } = req.body;
        if (!topic || !cards || cards.length !== 3) return res.status(400).json({ success: false, message: "宇宙訊號不完整" });

        const userRef = db.collection('users').doc(userId);
        let userDoc = await userRef.get();
        if (!userDoc.exists) await userRef.set({ points: 100, createdAt: FieldValue.serverTimestamp(), lastDrawDate: null, displayName: req.user.displayName, pictureUrl: req.user.pictureUrl });

        const configDoc = await db.collection('system_config').doc('ai_settings').get();
        const tarotConfig = configDoc.exists && configDoc.data().tarot ? configDoc.data().tarot : { cost: 10 };

        const currentPoints = userDoc.exists ? (userDoc.data().points || 0) : 100;
        if (currentPoints < tarotConfig.cost) return res.status(403).json({ success: false, message: `靈力不足 (需 ${tarotConfig.cost} 點)，請先儲值` });

        await db.collection('divination_logs').add({ 
            userId, userName: req.user.displayName, topic, cards, stage: "Stage 2: Ticket Created", type: "tarot", 
            log_class: 'system', summary: `系統背景程序：建立塔羅票根`, points_change: 0, platform_version: PLATFORM_VERSION, timestamp: FieldValue.serverTimestamp() 
        });

        await userRef.set({ pendingDraw: { topic, cards, timestamp: FieldValue.serverTimestamp() } }, { merge: true });
        return res.status(200).json({ success: true });
    } catch (error) { return res.status(500).json({ success: false, message: "結界開啓失敗" }); }
});

// ==========================================
// 🏮 紫微斗數：專屬深度解碼 API (模組化路由)
// ==========================================
app.post('/api/divination/ziwei', express.json(), async (req, res) => {
    // 呼叫外部的紫微斗數微服務處理核心邏輯
    return await ziweiHandler.processZiweiDivination(req, res, db, client, genAI, FieldValue, recordDivinationLog);
});

// ==========================================
// ⚙️ 系統設定與定價 API
// ==========================================
app.get('/api/admin/config/ai', async (req, res) => {
    try {
        const docRef = db.collection('system_config').doc('ai_settings');
        const doc = await docRef.get();
        res.json({ success: true, data: doc.exists ? doc.data() : {} });
    } catch (error) { res.status(500).json({ success: false, msg: "讀取後台資料失敗" }); }
});

app.get('/api/public/config/ai', async (req, res) => {
    try {
        const docRef = db.collection('system_config').doc('ai_settings');
        const doc = await docRef.get();
        res.json({ success: true, data: doc.exists ? doc.data() : {} });
    } catch (error) { res.status(500).json({ success: false, msg: "讀取公開定價資料失敗" }); }
});

// ==========================================
// 🌟 靈魂儀表板 API
// ==========================================
app.get('/api/member/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, msg: "未授權的請求，請從 LINE 內部開啟。" });
        
        const idToken = authHeader.split(' ')[1];
        const jsonPayload = Buffer.from(idToken.split('.')[1], 'base64').toString('utf-8');
        const userId = JSON.parse(jsonPayload).sub;
        if (!userId) throw new Error("無效的用戶身分");

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const currentPoints = userDoc.exists ? (userDoc.data().points || 0) : 0;

        const logsSnapshot = await db.collection('divination_logs').where('userId', '==', userId).orderBy('timestamp', 'desc').limit(200).get();

        let logs = [];
        let latestBirthData = null; 

        if (!logsSnapshot.empty) {
            logsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.log_class === 'system') return; 
                
                let isoTime = null;
                if (data.timestamp) {
                    try {
                        if (typeof data.timestamp.toDate === 'function') isoTime = data.timestamp.toDate().toISOString();
                        else if (data.timestamp._seconds) isoTime = new Date(data.timestamp._seconds * 1000).toISOString();
                        else isoTime = new Date(data.timestamp).toISOString();
                    } catch (e) { isoTime = null; }
                }

                logs.push({ ...data, timestamp: isoTime });
                if (!latestBirthData && (data.type === 'ziwei' || data.serviceType === 'ziwei') && data.birthData) latestBirthData = data.birthData;
            });
        }
        res.json({ success: true, data: { points: currentPoints, birthData: latestBirthData, logs: logs } });
    } catch (error) { res.status(500).json({ success: false, msg: "讀取靈魂檔案失敗，請聯絡客服。" }); }
});

// ==========================================
// 🌌 LINE Webhook 核心處理
// ==========================================
function getDailyQuickReply(lastDrawDate, today) {
    if (lastDrawDate === today) return undefined;
    return { items: [{ type: "action", action: { type: "message", label: "✨ 簽到領靈力 (每日一抽)", text: "每日一抽" } }] };
}

app.post('/webhook', middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).send('OK');
  } catch (err) { res.status(500).send('Internal Error'); }
});

async function handleEvent(event) {
  if (event.type !== 'follow' && event.type !== 'message') return Promise.resolve(null);

  const userId = event.source.userId;
  const userRef = db.collection('users').doc(userId); 
  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  const userMessage = (event.type === 'message' && event.message.type === 'text') ? event.message.text.trim() : "";

  try {
    let userDoc = await userRef.get();
    let userData = userDoc.exists ? userDoc.data() : {};
    let needUpdateProfile = false;

    if (!userDoc.exists || !userData.displayName) {
        try {
            const profile = await client.getProfile(userId);
            userData.displayName = profile.displayName;
            userData.pictureUrl = profile.pictureUrl || "";
            needUpdateProfile = true;
        } catch (e) {
            userData.displayName = userData.displayName || "神祕旅人";
            userData.pictureUrl = userData.pictureUrl || "";
        }
    }

    if (!userDoc.exists) {
        userData.points = 100; userData.createdAt = FieldValue.serverTimestamp(); userData.lastDrawDate = null;
        await userRef.set(userData);
    } else if (needUpdateProfile) {
        await userRef.update({ displayName: userData.displayName, pictureUrl: userData.pictureUrl });
    }

    const currentPoints = userData.points || 0;
    const quickReplyObj = getDailyQuickReply(userData.lastDrawDate, today);

    if (event.type === 'follow') {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `🌌 歡迎來到 BrandDecoder 命運解碼室。\n\n親愛的 ${userData.displayName}，宇宙的指引已為您準備就緒。我們已在您的專屬星盤中注入了 100 點初始靈力 🎁。\n\n點擊下方按鈕，或透過圖文選單，開啟您今天的第一道神祕啟示吧！✨`,
            quickReply: quickReplyObj
        });
    }

    // 🔮 塔羅牌微服務委派
    if (userMessage.startsWith("🔮 祈求宇宙指引")) {
        if (!userData.pendingDraw || !userData.pendingDraw.cards) {
            return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 星辰軌跡未同步。請點擊下方選單進入【塔羅牌】完成抽牌儀式。', quickReply: quickReplyObj });
        }

        const configDoc = await db.collection('system_config').doc('ai_settings').get();
        const tarotConfig = configDoc.exists && configDoc.data().tarot ? configDoc.data().tarot : { cost: 10 };

        if (currentPoints < tarotConfig.cost) {
            return client.replyMessage(event.replyToken, { type: 'text', text: `🔋 靈力不足 (需 ${tarotConfig.cost} 點)，請前往會員中心補充靈力：\nhttps://astro.branddecoderai.com/member/profile.html` });
        }

        await userRef.update({ points: FieldValue.increment(-tarotConfig.cost), pendingDraw: FieldValue.delete() });

        // 🚀 呼叫外部的塔羅牌模組處理核心邏輯 (依賴注入)
        return await tarotHandler.processTarotDraw(event, userId, userData, userRef, db, client, genAI, FieldValue, recordDivinationLog);
    }

    // 🃏 每日一抽 (輕量邏輯留存)
    else if (userMessage === "每日一抽") {
        if (userData.lastDrawDate === today) {
            return client.replyMessage(event.replyToken, { type: 'text', text: '✨ 您今天已經領取過宇宙的訊息囉！明天再來抽取指引吧。' });
        }

        const aiStartTime = Date.now();
        await fetch('https://api.line.me/v2/bot/chat/loading/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
            body: JSON.stringify({ chatId: userId, loadingSeconds: 15 })
        }).catch(e => console.error('Daily Draw Loading err:', e));

        const fullTarotDeck = ["愚者", "魔術師", "女祭司", "女皇", "皇帝", "教皇", "戀人", "戰車", "力量", "隱士", "命運之輪", "正義", "倒吊人", "死神", "節制", "惡魔", "高塔", "星星", "月亮", "太陽", "審判", "世界", "權杖一", "權杖二", "權杖三", "權杖四", "權杖五", "權杖六", "權杖七", "權杖八", "權杖九", "權杖十", "權杖侍者", "權杖騎士", "權杖王后", "權杖國王", "聖杯一", "聖杯二", "聖杯三", "聖杯四", "聖杯五", "聖杯六", "聖杯七", "聖杯八", "聖杯九", "聖杯十", "聖杯侍者", "聖杯騎士", "聖杯王后", "聖杯國王", "寶劍一", "寶劍二", "寶劍三", "寶劍四", "寶劍五", "寶劍六", "寶劍七", "寶劍八", "寶劍九", "寶劍十", "寶劍侍者", "寶劍騎士", "寶劍王后", "寶劍國王", "錢幣一", "錢幣二", "錢幣三", "錢幣四", "錢幣五", "錢幣六", "錢幣七", "錢幣八", "錢幣九", "錢幣十", "錢幣侍者", "錢幣騎士", "錢幣王后", "錢幣國王"];
        const randomCard = fullTarotDeck[Math.floor(Math.random() * fullTarotDeck.length)];

        try {
            const prompt = `使用者進行「每日一抽」，抽到【${randomCard}】。\n請根據此牌給出 0 到 100 的「今日能量分數」(整數)，以及 30-50 字的溫暖指引。\n🚨請嚴格以純 JSON 格式輸出，不要包含任何 Markdown 標記，格式如下 :\n{"score": 80, "text": "今日指引內容..."}`;
            
            const result = await model.generateContent(prompt);
            let rawAiText = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
            
            let aiData = { score: 50, text: rawAiText };
            try { aiData = JSON.parse(rawAiText); } catch(e) { console.error("AI JSON 解析失敗:", e); }
            
            const aiLatency = Date.now() - aiStartTime;
            const usage = result.response.usageMetadata || {};

            await userRef.update({ points: FieldValue.increment(1), lastDrawDate: today });

            const dailyLogData = {
                userId, userName: userData.displayName, log_class: 'consumption', summary: `每日簽到：抽到【${randomCard}】`,
                stage: "Finish", type: "daily_draw", result_card: randomCard, aiText: aiData.text, fortune_score: aiData.score, 
                points_change: 1, metrics: { latency_ms: aiLatency, tokens_in: usage.promptTokenCount || 0, tokens_out: usage.candidatesTokenCount || 0, model: AI_MODEL },
                platform_version: PLATFORM_VERSION, timestamp: FieldValue.serverTimestamp()
            };

            await db.collection('divination_logs').add(dailyLogData);
            await userRef.collection('history').add(dailyLogData); 

            const finalPoints = currentPoints + 1;
            const displayMsg = `【今日指引：${randomCard}】\n\n${aiData.text}\n\n──────────────\n✨ 今日能量指數：${aiData.score} 分\n🔋 靈力注入：原本 ${currentPoints} / 每日簽到 +1 / 目前靈力：${finalPoints}`;

            return client.replyMessage(event.replyToken, { type: 'text', text: displayMsg });
        } catch (aiError) {
            await userRef.update({ points: FieldValue.increment(1), lastDrawDate: today });
            return client.replyMessage(event.replyToken, { type: 'text', text: `【今日指引：${randomCard}】\n\n請順應直覺，保持平靜。\n\n──────────────\n✨ 今日靈能修復：+1\n🔋 當前靈力儲備：${currentPoints + 1}` });
        }
    } else {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `✨ 歡迎來到命運解碼室！${userData.displayName}，您可以點擊下方的圖文選單，或領取今日簽到，來進行您的專屬命運解碼喔！`,
            quickReply: quickReplyObj
        });
    }
  } catch (error) { console.error("處理用戶資料時發生錯誤:", error); }
}

exports.webhook = app;

// 本機 / Docker（`node index.js`）：Cloud Run 從原始碼建置時會用 `exports.webhook`，此處補上監聽。
if (require.main === module) {
    const port = Number(process.env.PORT) || 8080;
    app.listen(port, () => console.log(`bastro-bot listening on ${port}`));
}