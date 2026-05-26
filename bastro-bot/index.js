// ==========================================
// BrandDecoder - 命運解碼室 後端核心 (index.js)
// 版本：v5.0 (全模組化微服務架構 + AGUI 播報台)
// ==========================================

const ecpay = require('./ecpay');
const { buildPayStrings, validateRechargeOrder } = require('./legalManifest');
const { verifyLineToken } = require('./lineAuth');
const { corsMiddleware } = require('./cors');
const {
    aiDecodeLimiter,
    payRequestLimiter,
    logStageLimiter,
    publicConfigLimiter,
} = require('./rateLimit');
const {
    InsufficientPointsError,
    getCampaignDiscountedCost,
    deductPointsTransaction,
    refundPoints,
} = require('./pointsLedger');
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
const { mergeModuleKey, mergeAiSettingsFromDoc, DEFAULT_AI_SETTINGS, toPublicAiConfig } = require('./aiSettingsDefaults');
const { isAllowedLogStage } = require('./logStageAllowlist');
const {
    AI_MODEL_OPTIONS,
    AI_BRAIN_RELEASE,
    AI_BRAIN_LAST_REVIEWED,
    AI_BRAIN_REVIEW_POLICY,
} = require('./aiModelCatalog');
const adminKpiRouter = require('./admin_kpi');
const { recordDivinationLog } = require('./logger');
const { getShareSnapshot } = require('./shareSnapshot'); 
const numerologyRouter = require('./numerology');
const tarotHandler = require('./tarot');   // 🔮 塔羅牌微服務
const ziweiHandler = require('./ziwei');   // 🏮 紫微斗數微服務

const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();
app.set('trust proxy', 1);
app.set('trust proxy', 1);
const payFormParser = express.urlencoded({ extended: false });

const memberProfileUrl = (process.env.MEMBER_PROFILE_URL || 'https://liff.line.me/2009490171-ZuAjXwno').replace(/\/$/, '');
const paymentSuccessPageUrl = (process.env.PAYMENT_SUCCESS_URL || 'https://astro.branddecoderai.com/member/payment-success.html').replace(/\/$/, '');
const paymentFailedPageUrl = (process.env.PAYMENT_FAILED_URL || 'https://astro.branddecoderai.com/member/payment-failed.html').replace(/\/$/, '');

function buildPaymentResultPageUrl(base, orderId, extraQuery = '') {
    const q = new URLSearchParams();
    if (orderId) q.set('order', orderId);
    if (extraQuery) {
        const extra = new URLSearchParams(extraQuery);
        extra.forEach((v, k) => q.set(k, v));
    }
    const qs = q.toString();
    const url = qs ? `${base}?${qs}` : base;
    return url.length <= 200 ? url : `${base}?order=${encodeURIComponent(String(orderId || '').slice(0, 20))}`;
}

/** 綠界 ReturnURL 基底：優先環境變數；未設時在 Cloud Run 上可用 Host 推斷為 https://… */
function resolvePublicBaseUrl(req) {
    const fromEnv = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    if (fromEnv) return fromEnv;
    const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    if (!host) return '';
    return `https://${host}`.replace(/\/$/, '');
}

const PLATFORM_VERSION = "v5.0";
/** 每日一抽專用：輕量模型（環境變數 > 程式庫預設 daily.model） */
const DAILY_DRAW_AI_MODEL = process.env.DAILY_DRAW_AI_MODEL || DEFAULT_AI_SETTINGS.daily.model;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const dailyDrawModel = genAI.getGenerativeModel({
    model: DAILY_DRAW_AI_MODEL,
    generationConfig: { temperature: 0.75, maxOutputTokens: 400 },
});

app.use(corsMiddleware);

// 🚀 掛載各大微服務 Router
app.use('/api/admin', express.json(), adminRouter);
app.use('/api/admin', express.json(), adminAiRouter);
app.use('/api/admin', express.json(), adminKpiRouter);
app.use('/api/numerology', express.json(), numerologyRouter);

/** 會員儀表板用：自 divination_logs 組 logs + 最近紫微生辰（Firestore 複合索引：collection=divination_logs, userId ASC, timestamp DESC） */
async function loadDivinationLogsForDashboard(userId) {
    const logs = [];
    let latestBirthData = null;
    const logsSnapshot = await db.collection('divination_logs').where('userId', '==', userId).orderBy('timestamp', 'desc').limit(200).get();
    if (!logsSnapshot.empty) {
        logsSnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.log_class === 'system') return;
            let isoTime = null;
            if (data.timestamp) {
                try {
                    if (typeof data.timestamp.toDate === 'function') isoTime = data.timestamp.toDate().toISOString();
                    else if (data.timestamp._seconds) isoTime = new Date(data.timestamp._seconds * 1000).toISOString();
                    else isoTime = new Date(data.timestamp).toISOString();
                } catch (e) {
                    isoTime = null;
                }
            }
            logs.push({ ...data, timestamp: isoTime });
            if (!latestBirthData && (data.type === 'ziwei' || data.serviceType === 'ziwei') && data.birthData) latestBirthData = data.birthData;
        });
    }
    return { logs, latestBirthData };
}

async function sendTelegramRevenueAlert({ userName, amount, pointsGiven, paymentMethod, merchantTradeNo, ecpayTradeNo }) {
    const token = process.env.TG_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TG_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;
    const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    const orderLine = merchantTradeNo ? `\n📋 本站訂單：${merchantTradeNo}` : '';
    const ecpayLine = ecpayTradeNo ? `\n🏦 綠界交易號：${ecpayTradeNo}` : '';
    const tgMessage = `🚀 【新香油錢入帳捷報】\n\n👤 靈魂代號：${userName}\n💎 儲值金額：NT$ ${amount}\n🔋 獲得靈力：${pointsGiven} 點\n💳 付款方式：${paymentMethod}${orderLine}${ecpayLine}\n⏱️ 交易時間：${now}\n\n✨ 命運解碼室營收持續增長中！`;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: tgMessage }),
    }).catch((err) => console.error('TG推播連線錯誤:', err));
}

async function fulfillRechargeOrder(orderId, ecpayBody) {
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) throw new Error('訂單不存在');
    const { amount, pointsGiven, periodCode, userId, status, paymentMethod } = orderDoc.data();
    if (status === 'success') return { already: true };

    const tradeAmt = parseInt(ecpayBody.TradeAmt, 10);
    if (!Number.isFinite(tradeAmt) || tradeAmt !== amount) {
        throw new Error(`金額不符: TradeAmt=${ecpayBody.TradeAmt} order=${amount}`);
    }

    const batch = db.batch();
    batch.update(orderRef, {
        status: 'success',
        ecpayTradeNo: ecpayBody.TradeNo || '',
        completedAt: Timestamp.now(),
    });

    const userUpdateData = { points: FieldValue.increment(pointsGiven) };
    if (periodCode) userUpdateData.lastFirstRechargePeriod = periodCode;
    batch.update(db.collection('users').doc(userId), userUpdateData);

    const userDocRef = await db.collection('users').doc(userId).get();
    const userName = userDocRef.exists ? (userDocRef.data().displayName || '未知用戶') : '未知用戶';

    const historyRef = db.collection('users').doc(userId).collection('history').doc();
    batch.set(historyRef, { type: 'recharge', amount_paid: amount, points_change: pointsGiven, timestamp: Timestamp.now() });

    const globalLogRef = db.collection('divination_logs').doc();
    batch.set(globalLogRef, {
        userId,
        userName,
        type: 'recharge',
        log_class: 'revenue',
        paymentMethod: paymentMethod || 'ECPay',
        summary: `透過 ${paymentMethod || 'ECPay'} 儲值：獲取 ${pointsGiven} 點`,
        amount_paid: amount,
        points_change: pointsGiven,
        timestamp: Timestamp.now(),
    });

    await batch.commit();

    try {
        await sendTelegramRevenueAlert({
            userName,
            amount,
            pointsGiven,
            paymentMethod: paymentMethod || 'ECPay',
            merchantTradeNo: orderId,
            ecpayTradeNo: ecpayBody.TradeNo || '',
        });
    } catch (e) {
        console.error('TG捷報系統發生例外:', e);
    }
    return { already: false };
}

// ==========================================
// 👤 用戶 API（Bearer = LIFF access token，經 verifyLineToken）
// GET /api/user/profile — 合併「基本資料 + 儀表板 logs + birthData」（原 /api/member/profile 已廢止）
// GET /api/user/history — 子集合 users/{uid}/history（圖表／明細）
// ==========================================
app.get('/api/user/profile', verifyLineToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const userDoc = await db.collection('users').doc(userId).get();
        const line = req.user;
        let displayName = line.displayName;
        let pictureUrl = line.pictureUrl;
        let points = 0;
        let createdAt = null;
        let lastDrawDate = null;
        let lastFirstRechargePeriod = null;
        let birthData = null;
        if (userDoc.exists) {
            const data = userDoc.data();
            displayName = data.displayName || displayName;
            pictureUrl = data.pictureUrl || pictureUrl;
            points = data.points || 0;
            createdAt = data.createdAt ? data.createdAt.toDate().toISOString() : null;
            lastDrawDate = data.lastDrawDate;
            lastFirstRechargePeriod = data.lastFirstRechargePeriod || null;
            birthData = data.birthData || null; // 優先使用 userDoc 儲存的生辰資料
        }
        const dailyStreak = userDoc.exists ? (userDoc.data().dailyStreak || 0) : 0;
        const { logs } = await loadDivinationLogsForDashboard(userId);
        
        const finalBirthData = birthData;

        res.status(200).json({
            success: true,
            data: {
                displayName,
                pictureUrl,
                points,
                createdAt,
                lastDrawDate,
                dailyStreak,
                lastFirstRechargePeriod,
                birthData: finalBirthData,
                logs,
            },
        });
    } catch (error) {
        console.error('GET /api/user/profile:', error.message);
        res.status(500).json({ success: false });
    }
});

// 🗑️ 隱私權保護：清除生辰座標
app.post('/api/user/clear-birthdata', verifyLineToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { FieldValue } = require('firebase-admin/firestore');
        await db.collection('users').doc(userId).update({
            birthData: FieldValue.delete()
        });
        res.json({ success: true, msg: "星辰座標已安全清除" });
    } catch (error) {
        console.error('POST /api/user/clear-birthdata:', error.message);
        res.status(500).json({ success: false, msg: error.message });
    }
});

// 💾 隱私權保護：儲存或更新生辰座標
app.post('/api/user/save-birthdata', verifyLineToken, express.json(), async (req, res) => {
    try {
        const userId = req.user.userId;
        const { birthData } = req.body;
        if (!birthData) return res.status(400).json({ success: false, msg: "缺少生辰座標數據" });
        await db.collection('users').doc(userId).set({
            birthData: birthData
        }, { merge: true });
        res.json({ success: true, msg: "星辰座標已成功定位" });
    } catch (error) {
        console.error('POST /api/user/save-birthdata:', error.message);
        res.status(500).json({ success: false, msg: error.message });
    }
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
// 💳 綠界 ECPay 金流（全方位 AioCheckOut / V5）
// ==========================================
app.post('/api/pay/request', express.json(), verifyLineToken, payRequestLimiter, async (req, res) => {
    try {
        const base = resolvePublicBaseUrl(req);
        if (!base) {
            return res.status(500).json({
                success: false,
                msg: '無法決定綠界 ReturnURL 網域：請設定 PUBLIC_BASE_URL（例如 https://bastro-bot-xxxx.asia-east1.run.app），或確認請求帶有正確的 Host 標頭。',
            });
        }
        const { amount, productName, pointsGiven, periodCode } = req.body;
        const userId = req.user.userId;

        const userDoc = await db.collection('users').doc(userId).get();
        const lastFirstRechargePeriod = userDoc.exists ? userDoc.data().lastFirstRechargePeriod : null;
        const tierCheck = validateRechargeOrder({
            amount,
            pointsGiven,
            periodCode,
            lastFirstRechargePeriod,
        });
        if (!tierCheck.ok) {
            return res.status(400).json({ success: false, msg: tierCheck.msg });
        }

        const merchantTradeNo = ecpay.buildMerchantTradeNo(userId);
        const validatedAmount = tierCheck.amount;
        const validatedPoints = tierCheck.pointsGiven;
        const validatedPeriodCode = tierCheck.periodCode;

        const returnUrl = `${base}/api/pay/ecpay/notify`;
        if (returnUrl.length > 200) {
            return res.status(500).json({ success: false, msg: 'ReturnURL 超過 200 字元，請縮短網域（PUBLIC_BASE_URL 或自訂網域）' });
        }

        const payStrings = buildPayStrings(validatedPoints, productName);

        const clientBackUrl = buildPaymentResultPageUrl(paymentSuccessPageUrl, merchantTradeNo);
        const orderResultUrl = `${base}/api/pay/ecpay/result`;
        if (orderResultUrl.length > 200) {
            return res.status(500).json({ success: false, msg: 'OrderResultURL 超過 200 字元，請縮短 PUBLIC_BASE_URL' });
        }

        const fields = ecpay.buildAioCheckoutFields({
            merchantTradeNo,
            totalAmount: validatedAmount,
            tradeDesc: payStrings.tradeDesc,
            itemName: payStrings.itemName,
            returnUrl,
            clientBackUrl,
            orderResultUrl,
        });

        await db.collection('orders').doc(merchantTradeNo).set({
            userId,
            amount: validatedAmount,
            pointsGiven: validatedPoints,
            periodCode: validatedPeriodCode,
            status: 'pending',
            paymentMethod: 'ECPay',
            createdAt: Timestamp.now(),
        });

        res.json({ success: true, action: ecpay.getCheckoutActionUrl(), fields, merchantTradeNo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, msg: error.message });
    }
});

/** 綠界付款完成導回（OrderResultURL，信用卡等即時付款；入帳仍以 ReturnURL 為準） */
app.post('/api/pay/ecpay/result', payFormParser, async (req, res) => {
    try {
        const orderId = String(req.body.MerchantTradeNo || '');
        const macOk = ecpay.verifyCheckMacValue(req.body);
        const rtnOk = ecpay.isPaymentSuccess(req.body.RtnCode);

        if (!macOk) {
            console.warn('ECPay result: CheckMacValue 驗證失敗', orderId);
            if (orderId) {
                const orderDoc = await db.collection('orders').doc(orderId).get();
                if (orderDoc.exists && orderDoc.data().status === 'success') {
                    return res.redirect(302, buildPaymentResultPageUrl(paymentSuccessPageUrl, orderId));
                }
            }
            return res.redirect(302, buildPaymentResultPageUrl(paymentFailedPageUrl, orderId, 'reason=verify'));
        }
        if (!rtnOk) {
            const code = encodeURIComponent(String(req.body.RtnCode || ''));
            return res.redirect(302, buildPaymentResultPageUrl(paymentFailedPageUrl, orderId, `code=${code}`));
        }
        return res.redirect(302, buildPaymentResultPageUrl(paymentSuccessPageUrl, orderId));
    } catch (e) {
        console.error('ECPay result redirect:', e);
        return res.redirect(302, paymentFailedPageUrl);
    }
});

/** 付款結果頁輪詢：僅能查詢本人訂單 */
app.get('/api/pay/order-status', verifyLineToken, async (req, res) => {
    try {
        const orderId = String(req.query.orderId || req.query.order || '').trim();
        if (!orderId) return res.status(400).json({ success: false, msg: '缺少 orderId' });

        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) {
            return res.status(404).json({ success: false, msg: '找不到訂單' });
        }
        const data = orderDoc.data();
        if (data.userId !== req.user.userId) {
            return res.status(403).json({ success: false, msg: '無權查詢此訂單' });
        }

        res.json({
            success: true,
            status: data.status || 'pending',
            amount: data.amount,
            pointsGiven: data.pointsGiven,
            merchantTradeNo: orderId,
        });
    } catch (e) {
        console.error('order-status:', e);
        res.status(500).json({ success: false, msg: '查詢失敗' });
    }
});

/** 綠界幕後通知：必須回傳字串 1|OK */
app.post('/api/pay/ecpay/notify', payFormParser, async (req, res) => {
    try {
        if (!ecpay.verifyCheckMacValue(req.body)) {
            console.error('ECPay notify CheckMacValue 驗證失敗');
            return res.status(400).send('0|FAIL');
        }
        if (!ecpay.isPaymentSuccess(req.body.RtnCode)) {
            return res.send('1|OK');
        }
        // 綠界後台「模擬付款」：SimulatePaid=1 僅測試 ReturnURL，不得入帳（官方文件）
        if (String(req.body.SimulatePaid || '') === '1') {
            console.log('ECPay notify: SimulatePaid=1，略過入帳', req.body.MerchantTradeNo);
            return res.send('1|OK');
        }
        const orderId = req.body.MerchantTradeNo;
        await fulfillRechargeOrder(orderId, req.body);
        return res.send('1|OK');
    } catch (e) {
        console.error('ECPay notify:', e);
        return res.status(500).send('0|FAIL');
    }
});

// ==========================================
// 📊 API: 埋點與票根
// ==========================================
app.post('/api/log/stage', express.json(), verifyLineToken, logStageLimiter, async (req, res) => {
    try {
        const { stage, type } = req.body;
        const userId = req.user.userId;

        if (!isAllowedLogStage(type, stage)) {
            return res.status(400).json({ success: false, msg: '不允許的埋點類型或階段' });
        }

        let userName = req.user.displayName || '未知用戶';
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            userName = userDoc.data().displayName || userDoc.data().name || userName;
        }

        await recordDivinationLog({
            userId,
            userName,
            type,
            log_class: 'system',
            stage,
            summary: `系統背景程序：${stage}`,
            points_change: 0,
        });

        res.status(200).json({ success: true });
    } catch (e) {
        console.error('log/stage:', e);
        res.status(500).json({ success: false });
    }
});

app.post('/api/tarot/ticket', express.json(), verifyLineToken, aiDecodeLimiter, async (req, res) => {
    try {
        const userId = req.user.userId; 
        const { topic, cards } = req.body;
        if (!topic || !cards || cards.length !== 3) return res.status(400).json({ success: false, message: "宇宙訊號不完整" });

        const userRef = db.collection('users').doc(userId);
        let userDoc = await userRef.get();
        if (!userDoc.exists) await userRef.set({ points: 100, createdAt: FieldValue.serverTimestamp(), lastDrawDate: null, displayName: req.user.displayName, pictureUrl: req.user.pictureUrl });

        const configDoc = await db.collection('system_config').doc('ai_settings').get();
        const tarotConfig = mergeModuleKey('tarot', configDoc);
        const actualCost = await getCampaignDiscountedCost(db, tarotConfig.cost);

        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(userRef);
                const pts = doc.exists ? Math.floor(Number(doc.data().points)) || 0 : 100;
                if (pts < actualCost) {
                    throw new InsufficientPointsError(actualCost, pts);
                }
                t.update(userRef, {
                    pendingDraw: { topic, cards, timestamp: FieldValue.serverTimestamp() },
                });
            });
        } catch (e) {
            if (e instanceof InsufficientPointsError) {
                return res.status(403).json({
                    success: false,
                    message: `靈力不足 (需 ${actualCost} 點)，請先儲值`,
                });
            }
            throw e;
        }

        await db.collection('divination_logs').add({ 
            userId, userName: req.user.displayName, topic, cards, stage: "Stage 2: Ticket Created", type: "tarot", 
            log_class: 'system', summary: `系統背景程序：建立塔羅票根`, points_change: 0, platform_version: PLATFORM_VERSION, timestamp: FieldValue.serverTimestamp() 
        });

        return res.status(200).json({ success: true });
    } catch (error) { return res.status(500).json({ success: false, message: "結界開啓失敗" }); }
});

// ==========================================
// 🏮 紫微斗數：專屬深度解碼 API (模組化路由)
// ==========================================
app.post('/api/divination/ziwei', express.json(), verifyLineToken, aiDecodeLimiter, async (req, res) => {
    // 呼叫外部的紫微斗數微服務處理核心邏輯
    return await ziweiHandler.processZiweiDivination(req, res, db, client, genAI, FieldValue, recordDivinationLog);
});

// ==========================================
// 🔮 塔羅牌：專屬同步解碼 API (模組化路由)
// ==========================================
app.post('/api/divination/tarot', express.json(), verifyLineToken, aiDecodeLimiter, async (req, res) => {
    return await tarotHandler.processTarotDrawSync(req, res, db, client, genAI, FieldValue, recordDivinationLog);
});

// ==========================================
// ⚙️ 系統設定與定價 API（admin 完整設定見 admin_ai.js，須 Admin token）
// ==========================================
app.get('/api/public/config/ai', publicConfigLimiter, async (req, res) => {
    try {
        const { AI_SETTINGS } = require('./aiConfig');
        const out = {};
        for (const key of Object.keys(AI_SETTINGS)) {
            const originalCost = AI_SETTINGS[key].cost;
            if (originalCost != null) {
                const discountedCost = await getCampaignDiscountedCost(db, originalCost);
                out[key] = { cost: discountedCost };
            }
        }
        res.json({ success: true, data: out });
    } catch (error) { res.status(500).json({ success: false, msg: "讀取公開定價資料失敗" }); }
});

/** 分享專用 LIFF：以 token 讀取解盤全文（30 天過期，無個資欄位） */
app.get('/api/public/share/:token', publicConfigLimiter, async (req, res) => {
    try {
        const data = await getShareSnapshot(db, req.params.token);
        if (!data) {
            return res.status(404).json({ success: false, msg: '分享內容已過期或不存在' });
        }
        res.json({ success: true, data });
    } catch (error) {
        console.error('GET /api/public/share:', error.message);
        res.status(500).json({ success: false, msg: '讀取分享內容失敗' });
    }
});

/** 後台 admin.html 模型下拉選單：與 aiModelCatalog.js 單一來源（含釘選版次） */
app.get('/api/public/ai-model-options', (req, res) => {
    res.json({
        success: true,
        release: AI_BRAIN_RELEASE,
        lastReviewed: AI_BRAIN_LAST_REVIEWED,
        reviewPolicy: AI_BRAIN_REVIEW_POLICY,
        options: AI_MODEL_OPTIONS,
    });
});

// ==========================================
// 🌌 LINE Webhook 核心處理
// ==========================================
const DAILY_STREAK_TARGET = 7;
const DAILY_STREAK_BONUS = 3;
const DAILY_BASE_POINTS = 1;

/** 台北日曆日 YYYY-MM-DD（簽到／連續天數用） */
function getTaipeiDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function normalizeDateKey(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return null;
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
}

function addDaysToDateKey(dateKey, deltaDays) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    return getTaipeiDateKey(dt);
}

/** 方法一：每日 +1；連續第 7 日再 +3（本輪共 10 點）；中斷則連續天數重算 */
function resolveDailyStreakReward(lastDrawDate, dailyStreak, todayKey) {
    const last = normalizeDateKey(lastDrawDate);
    const yesterdayKey = addDaysToDateKey(todayKey, -1);
    let streak;
    if (last === yesterdayKey) {
        streak = Math.min(DAILY_STREAK_TARGET, (Number(dailyStreak) || 0) + 1);
    } else {
        streak = 1;
    }
    const bonus = streak === DAILY_STREAK_TARGET ? DAILY_STREAK_BONUS : 0;
    const points = DAILY_BASE_POINTS + bonus;
    const streakAfter = streak === DAILY_STREAK_TARGET ? 0 : streak;
    return { streak, streakAfter, points, base: DAILY_BASE_POINTS, bonus };
}

function buildDailyPointsDisplay(currentPoints, reward) {
    const finalPoints = currentPoints + reward.points;
    let line = `🔋 靈力注入：原本 ${currentPoints} / 每日簽到 +${reward.base}`;
    if (reward.bonus) line += ` / 連續 7 日獎勵 +${reward.bonus}`;
    line += ` / 目前靈力：${finalPoints}`;
    if (reward.streak === DAILY_STREAK_TARGET) {
        line += `\n🎉 已完成本輪連續 ${DAILY_STREAK_TARGET} 日簽到！明日起重啟累積。`;
    } else {
        line += `\n📅 連續簽到進度：${reward.streak}/${DAILY_STREAK_TARGET} 日（滿 ${DAILY_STREAK_TARGET} 日再送 +${DAILY_STREAK_BONUS}）`;
    }
    return { finalPoints, line };
}

/** 給一般訊息／今日已簽到提示：顯示連續簽到進度（不觸發簽到） */
function buildDailyStreakProgressHint(userData, todayKey) {
    const last = normalizeDateKey(userData.lastDrawDate);
    const stored = Number(userData.dailyStreak) || 0;
    const yesterdayKey = addDaysToDateKey(todayKey, -1);

    if (last === todayKey) {
        if (stored === 0) {
            return `📅 今日簽到已完成！本輪連續 ${DAILY_STREAK_TARGET} 日已達標，明天將從第 1 天重新累積（每日 +${DAILY_BASE_POINTS}，滿 ${DAILY_STREAK_TARGET} 日再 +${DAILY_STREAK_BONUS}）。`;
        }
        return `📅 今日簽到已完成！目前連續 ${stored}/${DAILY_STREAK_TARGET} 日，明天記得再來延續喔。`;
    }

    if (last === yesterdayKey) {
        if (stored === 0) {
            return `📅 上輪已達連續 ${DAILY_STREAK_TARGET} 日！今日簽到將開啟新一輪第 1 天（+${DAILY_BASE_POINTS} 靈力，滿 ${DAILY_STREAK_TARGET} 日再 +${DAILY_STREAK_BONUS}）。`;
        }
        const nextDay = stored + 1;
        if (nextDay === DAILY_STREAK_TARGET) {
            return `📅 目前已連續簽到 ${stored} 日，再努力一下！今日簽到即為第 ${DAILY_STREAK_TARGET} 日，可額外獲得 +${DAILY_STREAK_BONUS} 靈力 🎁`;
        }
        const daysLeft = DAILY_STREAK_TARGET - nextDay;
        return `📅 目前已連續簽到 ${stored} 日，再努力一下！今日簽到可達第 ${nextDay} 日（距離 +${DAILY_STREAK_BONUS} 獎勵還差 ${daysLeft} 天）。`;
    }

    if (!last) {
        return `📅 尚未開始連續簽到。今日簽到為第 1 天（免費 +${DAILY_BASE_POINTS} 靈力，連滿 ${DAILY_STREAK_TARGET} 日再 +${DAILY_STREAK_BONUS}）。`;
    }

    return `📅 連續簽到已中斷，今日將從第 1 天重新計算（+${DAILY_BASE_POINTS} 靈力，滿 ${DAILY_STREAK_TARGET} 日再 +${DAILY_STREAK_BONUS}）。`;
}

function getDailyQuickReply(lastDrawDate, todayKey) {
    const last = normalizeDateKey(lastDrawDate);
    const items = [];

    if (last !== todayKey) {
        items.push({
            type: "action",
            action: {
                type: "message",
                label: "✨ 每日免費一算 (簽到+1 靈力)",
                text: "每日一抽",
            },
        });
    } else {
        items.push({
            type: "action",
            action: {
                type: "message",
                label: "🔮 靈魂儀表板 (會員中心)",
                text: "會員中心",
            },
        });
    }

    items.push({
        type: "action",
        action: {
            type: "message",
            label: "📖 服務方案與說明",
            text: "服務說明",
        },
    });

    return { items };
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
  const today = getTaipeiDateKey();
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
        userData.points = 100; userData.createdAt = FieldValue.serverTimestamp(); userData.lastDrawDate = null; userData.dailyStreak = 0;
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
        const tarotConfig = mergeModuleKey('tarot', configDoc);
        const actualCost = await getCampaignDiscountedCost(db, tarotConfig.cost);

        let balanceAfterDeduct;
        try {
            balanceAfterDeduct = await deductPointsTransaction(db, userRef, actualCost, {
                pendingDraw: FieldValue.delete(),
            });
        } catch (e) {
            if (e instanceof InsufficientPointsError) {
                return client.replyMessage(event.replyToken, {
                    type: 'text',
                    text: `🔋 靈力不足 (需 ${actualCost} 點)，請前往會員中心補充靈力：\nhttps://astro.branddecoderai.com/member/profile.html`,
                });
            }
            throw e;
        }

        userData.points = balanceAfterDeduct;

        // 🚀 呼叫外部的塔羅牌模組處理核心邏輯 (依賴注入)
        return await tarotHandler.processTarotDraw(event, userId, userData, userRef, db, client, genAI, FieldValue, recordDivinationLog);
    }

    // 🃏 每日一抽 (輕量邏輯留存)
    else if (userMessage === "每日一抽") {
        if (normalizeDateKey(userData.lastDrawDate) === today) {
            const streakHint = buildDailyStreakProgressHint(userData, today);
            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: `✨ 您今天已經領取過宇宙的訊息囉！明天再來抽取指引吧。\n\n${streakHint}`,
            });
        }

        const dailyReward = resolveDailyStreakReward(userData.lastDrawDate, userData.dailyStreak, today);
        const dailyUserUpdate = {
            points: FieldValue.increment(dailyReward.points),
            lastDrawDate: today,
            dailyStreak: dailyReward.streakAfter,
        };

        const aiStartTime = Date.now();
        await fetch('https://api.line.me/v2/bot/chat/loading/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
            body: JSON.stringify({ chatId: userId, loadingSeconds: 15 })
        }).catch(e => console.error('Daily Draw Loading err:', e));

        const fullTarotDeck = ["愚者", "魔術師", "女祭司", "女皇", "皇帝", "教皇", "戀人", "戰車", "力量", "隱士", "命運之輪", "正義", "倒吊人", "死神", "節制", "惡魔", "高塔", "星星", "月亮", "太陽", "審判", "世界", "權杖一", "權杖二", "權杖三", "權杖四", "權杖五", "權杖六", "權杖七", "權杖八", "權杖九", "權杖十", "權杖侍者", "權杖騎士", "權杖王后", "權杖國王", "聖杯一", "聖杯二", "聖杯三", "聖杯四", "聖杯五", "聖杯六", "聖杯七", "聖杯八", "聖杯九", "聖杯十", "聖杯侍者", "聖杯騎士", "聖杯王后", "聖杯國王", "寶劍一", "寶劍二", "寶劍三", "寶劍四", "寶劍五", "寶劍六", "寶劍七", "寶劍八", "寶劍九", "寶劍十", "寶劍侍者", "寶劍騎士", "寶劍王后", "寶劍國王", "錢幣一", "錢幣二", "錢幣三", "錢幣四", "錢幣五", "錢幣六", "錢幣七", "錢幣八", "錢幣九", "錢幣十", "錢幣侍者", "錢幣騎士", "錢幣王后", "錢幣國王"];
        const randomCard = fullTarotDeck[Math.floor(Math.random() * fullTarotDeck.length)];

        try {
            const prompt = `使用者進行「每日一抽」，抽到【${randomCard}】。\n請根據此牌給出 0 到 100 的「今日能量分數」(整數)，以及 30-50 字的溫暖指引。\n🚨請嚴格以純 JSON 格式輸出，不要包含任何 Markdown 標記，格式如下 :\n{"score": 80, "text": "今日指引內容..."}`;
            
            const result = await dailyDrawModel.generateContent(prompt);
            let rawAiText = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
            
            let aiData = { score: 50, text: rawAiText };
            try { aiData = JSON.parse(rawAiText); } catch(e) { console.error("AI JSON 解析失敗:", e); }
            
            const aiLatency = Date.now() - aiStartTime;
            const usage = result.response.usageMetadata || {};

            await userRef.update(dailyUserUpdate);

            const streakNote = dailyReward.bonus
                ? `（連續 ${DAILY_STREAK_TARGET} 日，含獎勵 +${dailyReward.bonus}）`
                : `（連續 ${dailyReward.streak}/${DAILY_STREAK_TARGET} 日）`;
            const dailyLogData = {
                userId, userName: userData.displayName, log_class: 'consumption', summary: `每日簽到：抽到【${randomCard}】${streakNote}`,
                stage: "Finish", type: "daily_draw", result_card: randomCard, aiText: aiData.text, fortune_score: aiData.score,
                points_change: dailyReward.points, daily_streak: dailyReward.streak,
                metrics: { latency_ms: aiLatency, tokens_in: usage.promptTokenCount || 0, tokens_out: usage.candidatesTokenCount || 0, model: DAILY_DRAW_AI_MODEL },
                platform_version: PLATFORM_VERSION, timestamp: FieldValue.serverTimestamp()
            };

            await db.collection('divination_logs').add(dailyLogData);
            await userRef.collection('history').add(dailyLogData); 

            const { line: pointsLine } = buildDailyPointsDisplay(currentPoints, dailyReward);
            const liteOracleNote =
                "\n\n免費一抽使用輕量化計算，如需更詳細的分析，請開啟選單服務進行操作。";
            const displayMsg = `【今日指引：${randomCard}】\n\n${aiData.text}\n\n──────────────\n✨ 今日能量指數：${aiData.score} 分\n${pointsLine}${liteOracleNote}`;

            return client.replyMessage(event.replyToken, { type: 'text', text: displayMsg });
        } catch (aiError) {
            await userRef.update(dailyUserUpdate);
            const { line: pointsLine } = buildDailyPointsDisplay(currentPoints, dailyReward);
            return client.replyMessage(event.replyToken, {
                type: 'text',
                text: `【今日指引：${randomCard}】\n\n請順應直覺，保持平靜。\n\n──────────────\n${pointsLine}`,
            });
        }
    }

    // 🔮 會員中心指令
    else if (userMessage === "會員中心" || userMessage === "靈魂儀表板") {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `🔮 您的專屬「靈魂儀表板」已備妥，請點擊連結開啟：\n${memberProfileUrl}`,
            quickReply: quickReplyObj
        });
    }

    // 📖 服務說明指令
    else if (userMessage === "服務說明" || userMessage === "服務方案") {
        const serviceUrl = process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/index.html` : 'https://astro.branddecoderai.com/index.html';
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `📖 命運解碼室「服務方案與說明」如下，請點擊連結開啟：\n${serviceUrl}`,
            quickReply: quickReplyObj
        });
    } else {
        const streakLine = buildDailyStreakProgressHint(userData, today);
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `✨ ${userData.displayName} 您好，歡迎回到命運解碼室。\n\n${streakLine}\n\n免費簽到：每日一抽今日指引並 +1 靈力；連續 ${DAILY_STREAK_TARGET} 日再 +${DAILY_STREAK_BONUS}（本輪最多 ${DAILY_BASE_POINTS * DAILY_STREAK_TARGET + DAILY_STREAK_BONUS} 點）。\n也可點下方按鈕簽到，或從圖文選單進入塔羅、紫微、律動能量等服務。`,
            quickReply: quickReplyObj,
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