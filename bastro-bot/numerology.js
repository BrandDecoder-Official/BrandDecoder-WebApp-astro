// ==========================================
// 律動能量 (數字學) - 核心邏輯 (numerology.js)
// ==========================================
const express = require('express');
const router = express.Router();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Client } = require('@line/bot-sdk'); 
const { recordDivinationLog } = require('./logger');
const fetch = require('node-fetch');
const { mergeModuleKey } = require('./aiSettingsDefaults');
const {
    formatTaipeiDateTimeLine,
    buildLineShareUriFromHeadAndBody,
    appendShareButtonToFooterContents,
    sanitizeForFlexText,
} = require('./lineOaShare');
const {
    FLEX_SIZE,
    FLEX_COLOR,
    FLEX_PAD,
    tarotStyleHeaderBox,
    tarotStylePointsFooterRows,
} = require('./lineFlexTypography');
const {
    MAX_NUMEROLOGY_INTERPRETATION_CHARS,
    MAX_AI_OUTPUT_TOKENS,
    clampTextChars,
} = require('./aiReplyLimits');
const { parseNumerologyFromAi } = require('./numerologyMatrix');
const { buildNumerologyOutputSuffix } = require('./aiPromptEnvelope');
const {
    startLineChatLoading,
    LINE_LOADING_EARLY_SECONDS,
    LINE_LOADING_FINAL_SECONDS,
    LINE_LOADING_FINAL_AT_MS,
} = require('./lineLoading');
const { verifyLineToken } = require('./lineAuth');

const db = getFirestore('astro-bot-db');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const lineClient = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
});

router.post('/generate', verifyLineToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error('找不到該用戶資料');
        const userName =
            userDoc.data().displayName ||
            userDoc.data().name ||
            req.user.displayName ||
            '神祕旅人';

        const configDoc = await db.collection('system_config').doc('ai_settings').get();
        const aiConfig = mergeModuleKey('numerology', configDoc);
        const cost = aiConfig.cost;

        const currentPoints = userDoc.data().points || 0;
        if (currentPoints < cost) {
            return res.status(400).json({ status: 'error', message: `靈力值不足，需 ${cost} 點` });
        }

        // 立刻回傳，讓前端關閉
        res.json({ status: 'success', message: '命盤已送交大師，請回聊天室查看' });

        (async () => {
            let isDone = false;
            let timer1, timer3;

            const showLoading = (seconds = LINE_LOADING_EARLY_SECONDS) =>
                startLineChatLoading(userId, seconds);

            try {
                await lineClient.pushMessage(userId, { type: 'text', text: `✨ 收到 ${userName} 的請求，大師正在為您連結宇宙高維度頻率...` });
                await showLoading();

                timer1 = setTimeout(async () => {
                    if (!isDone) {
                        await lineClient.pushMessage(userId, { type: 'text', text: `🌌 正在解碼您的專屬幸運共振與財富金鑰...` });
                        if (!isDone) await showLoading();
                    }
                }, 4000);

                timer3 = setTimeout(async () => {
                    if (!isDone) {
                        await lineClient.pushMessage(userId, { type: 'text', text: `💫 數字頻率正在共振，大師為您提取最終的高維度指引...` });
                        if (!isDone) await showLoading(LINE_LOADING_FINAL_SECONDS);
                    }
                }, LINE_LOADING_FINAL_AT_MS);

                const aiStartTime = Date.now();
                const model = genAI.getGenerativeModel({
                    model: aiConfig.model,
                    generationConfig: {
                        temperature: 0.75,
                        maxOutputTokens: MAX_AI_OUTPUT_TOKENS,
                        responseMimeType: 'application/json',
                    },
                });

                const finalPromptBase = `${aiConfig.prompt}${buildNumerologyOutputSuffix()}`;
                const retryPromptSuffix =
                    '\n\n【重試】上次 JSON 無法解析。請輸出完整合法 JSON（含 coreNumber、luckySet、wealthSet、score、interpretation），interpretation 可適度精簡以確保 JSON 完整閉合。';

                let aiData = null;
                let aiResponse;
                let lastRaw = '';
                for (let attempt = 1; attempt <= 2; attempt++) {
                    const finalPrompt =
                        attempt === 1 ? finalPromptBase : `${finalPromptBase}${retryPromptSuffix}`;
                    aiResponse = await model.generateContent(finalPrompt);
                    lastRaw = aiResponse.response.text();
                    aiData = parseNumerologyFromAi(lastRaw);
                    if (aiData) break;

                    const finishReason =
                        aiResponse.response.candidates &&
                        aiResponse.response.candidates[0] &&
                        aiResponse.response.candidates[0].finishReason;
                    console.error(
                        `數字學 JSON 解析失敗 (第 ${attempt} 次, finishReason=${finishReason || 'unknown'}):`,
                        String(lastRaw).slice(0, 800)
                    );
                }

                isDone = true;
                clearTimeout(timer1);
                clearTimeout(timer3);

                if (!aiData) {
                    await lineClient.pushMessage(userId, {
                        type: 'text',
                        text: '⚠️ 律動能量解碼未能完成（AI 回覆格式異常）。本次不會扣除您的靈力，請稍後再試。',
                    });
                    return;
                }

                const fortuneScore = aiData.score;
                const aiLatency = Date.now() - aiStartTime;
                const usage = (aiResponse && aiResponse.response.usageMetadata) || {};

                const newBalance = await db.runTransaction(async (t) => {
                    const doc = await t.get(userRef);
                    const updatedPoints = doc.data().points - cost;
                    t.update(userRef, { points: updatedPoints, lastDivination: FieldValue.serverTimestamp() });
                    return updatedPoints;
                });

                await recordDivinationLog({
                    userId: userId, userName: userName, type: 'numerology', summary: `數字能量：核心數[${aiData.coreNumber}]`,
                    points_change: -cost, cost: cost, aiText: aiData.interpretation, fortune_score: fortuneScore,
                    metrics: { latency_ms: aiLatency, tokens_in: usage.promptTokenCount || 0, tokens_out: usage.candidatesTokenCount || 0, model: aiConfig.model }
                });

                await userRef.collection('history').add({
                    type: 'numerology', summary: `今日核心能量：${aiData.coreNumber}`, aiText: aiData.interpretation, result_card: aiData.coreNumber.toString(),
                    points_change: -cost, cost: cost, fortune_score: fortuneScore, timestamp: FieldValue.serverTimestamp()
                });

                const decodedAt = formatTaipeiDateTimeLine(new Date());
                const flexMessage = generateNumerologyFlexMessage(userName, aiData, fortuneScore, cost, newBalance, decodedAt);
                await lineClient.pushMessage(userId, flexMessage);

            } catch (error) {
                isDone = true;
                clearTimeout(timer1); clearTimeout(timer3);
                const lineDetail =
                    error && error.originalError && error.originalError.response && error.originalError.response.data
                        ? error.originalError.response.data
                        : error && error.response && error.response.data
                          ? error.response.data
                          : null;
                console.error(
                    '數字學背景運算異常:',
                    error && error.message ? error.message : error,
                    lineDetail != null ? JSON.stringify(lineDetail) : ''
                );
                await lineClient.pushMessage(userId, { type: 'text', text: '⚠️ 宇宙訊號受到干擾，解碼中斷。本次不會扣除您的靈力。' });
            }
        })();

    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

function buildNumerologyShareHead(aiData, fortuneScore, decodedAt) {
    const coreNum = aiData.coreNumber != null && aiData.coreNumber !== '' ? String(aiData.coreNumber) : '—';
    const luckyStr = (aiData.luckySet || ['—', '—', '—']).join(' · ');
    const wealthStr = (aiData.wealthSet || ['—', '—']).join(' · ');
    const scoreLabel = fortuneScore != null && !Number.isNaN(Number(fortuneScore)) ? String(fortuneScore) : '--';
    return [
        '【命運解碼室｜律動能量】',
        `台北 ${decodedAt}`,
        `核心:${coreNum}`,
        `幸運:${luckyStr}`,
        `財富:${wealthStr}`,
        `指數:${scoreLabel}`,
        '',
    ].join('\n');
}

function generateNumerologyFlexMessage(userName, aiData, fortuneScore, cost, newBalance, decodedAt) {
    const shareHead = buildNumerologyShareHead(aiData, fortuneScore, decodedAt);
    const shareBody = String(aiData.interpretation || '').trim();
    const shareUri = buildLineShareUriFromHeadAndBody(shareHead, shareBody);
    const safeText = clampTextChars(
        String(aiData.interpretation || '宇宙能量正在匯聚中...'),
        MAX_NUMEROLOGY_INTERPRETATION_CHARS
    );
    const luckyStr = (aiData.luckySet || ['--','--','--']).join(' · ');
    const wealthStr = (aiData.wealthSet || ['--','--']).join(' · ');
    const coreNum = aiData.coreNumber || '--';

    return {
        type: "flex", altText: `您的律動能量解碼已具現 (核心能量: ${coreNum})`,
        contents: {
            type: "bubble",
            size: "mega",
            styles: {
                header: { backgroundColor: FLEX_COLOR.gold },
                body: { backgroundColor: "#05050A" },
                footer: { backgroundColor: "#05050A" },
            },
            header: tarotStyleHeaderBox('命運解碼室 | 律動能量'),
            body: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: FLEX_PAD.bubble,
                contents: [
                    {
                        type: "box", layout: "horizontal", justifyContent: "space-between", alignItems: "center",
                        contents: [
                            { type: "text", text: "🌌 今日能量矩陣", color: FLEX_COLOR.gold, size: FLEX_SIZE.subheading, weight: "bold", flex: 2 },
                            { type: "text", text: `✨ ${fortuneScore} 分`, color: FLEX_COLOR.goldLight, size: FLEX_SIZE.score, weight: "bold", align: "end", flex: 1 },
                        ],
                    },
                    { type: "separator", margin: "md", color: FLEX_COLOR.separator },
                    {
                        type: "box", layout: "vertical", margin: "lg", alignItems: "center",
                        contents: [
                            { type: "text", text: "核心能量", color: FLEX_COLOR.muted, size: FLEX_SIZE.caption, align: "center", margin: "sm" },
                            { type: "text", text: String(coreNum), color: FLEX_COLOR.goldLight, size: FLEX_SIZE.heroNumber, weight: "bold", align: "center", margin: "sm" },
                        ],
                    },
                    {
                        type: "box", layout: "horizontal", margin: "lg", spacing: "md",
                        contents: [
                            {
                                type: "box", layout: "vertical", flex: 1, backgroundColor: "#111115", cornerRadius: "md", paddingAll: "10px",
                                contents: [
                                    { type: "text", text: "幸運共振", color: FLEX_COLOR.muted, size: FLEX_SIZE.micro, align: "center" },
                                    { type: "text", text: luckyStr, color: FLEX_COLOR.white, size: FLEX_SIZE.subheading, weight: "bold", align: "center", margin: "sm" },
                                ],
                            },
                            {
                                type: "box", layout: "vertical", flex: 1, backgroundColor: "#15130A", cornerRadius: "md", paddingAll: "10px",
                                contents: [
                                    { type: "text", text: "財富金鑰", color: FLEX_COLOR.gold, size: FLEX_SIZE.micro, align: "center" },
                                    { type: "text", text: wealthStr, color: "#F2D3A1", size: FLEX_SIZE.subheading, weight: "bold", align: "center", margin: "sm" },
                                ],
                            },
                        ],
                    },
                    { type: "separator", margin: "lg", color: FLEX_COLOR.separator },
                    { type: "text", text: "✨ 大師指引", color: FLEX_COLOR.gold, size: FLEX_SIZE.sectionLabel, weight: "bold", margin: "md" },
                    { type: "text", text: sanitizeForFlexText(safeText), color: FLEX_COLOR.body, size: FLEX_SIZE.body, wrap: true, margin: "md" },
                ],
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                paddingAll: FLEX_PAD.footer,
                contents: appendShareButtonToFooterContents(
                    tarotStylePointsFooterRows(cost, newBalance, {
                        costLabel: '⚡ 本次消耗靈力',
                        remainLabel: '🔋 剩餘靈力餘額',
                    }),
                    shareUri,
                    { color: '#D4AF37' }
                ),
            },
        },
    };
}

module.exports = router;