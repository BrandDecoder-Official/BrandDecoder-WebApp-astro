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

const db = getFirestore('astro-bot-db');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const lineClient = new Client({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
});

router.post('/generate', async (req, res) => {
    const { userId } = req.body; 
    if (!userId) return res.status(400).json({ status: 'error', message: 'Missing userId' });

    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error('找不到該用戶資料');
        const userName = userDoc.data().displayName || userDoc.data().name || '神祕旅人';

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

            const showLoading = async () => {
                await fetch('https://api.line.me/v2/bot/chat/loading/start', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
                    body: JSON.stringify({ chatId: userId, loadingSeconds: 35 })
                }).catch(() => {});
            };

            try {
                await lineClient.pushMessage(userId, { type: 'text', text: `✨ 收到 ${userName} 的請求，大師正在為您連結宇宙高維度頻率...` });
                await showLoading();

                timer1 = setTimeout(async () => {
                    if (!isDone) {
                        await lineClient.pushMessage(userId, { type: 'text', text: `🌌 正在解碼您的專屬幸運共振與財富金鑰...` });
                        await showLoading();
                    }
                }, 4000);

                timer3 = setTimeout(async () => {
                    if (!isDone) {
                        await lineClient.pushMessage(userId, { type: 'text', text: `💫 數字頻率正在共振，大師為您提取最終的高維度指引...` });
                        await showLoading();
                    }
                }, 15000);

                const aiStartTime = Date.now();
                const model = genAI.getGenerativeModel({ model: aiConfig.model, generationConfig: { temperature: 0.7 } });
                
                const finalPrompt = `${aiConfig.prompt}
                
                🚨【系統輸出要求】(嚴格遵守)
                請務必"只"回傳 JSON 格式，絕對不可包含任何 Markdown 標記 (如 \`\`\`json)，也不要多餘文字。
                格式如下：
                {
                  "coreNumber": <1到9的隨機整數>,
                  "luckySet": [<01到99的隨機整數>, <整數>, <整數>],
                  "wealthSet": [<01到99的隨機整數>, <整數>],
                  "score": <0到100的整數，代表今日綜合能量指數>,
                  "interpretation": "一段 300 字以內的深度解析。請充分發揮你的大師人設，給予充滿療癒感與高維度智慧的詳細指引。"
                }`;

                const aiResponse = await model.generateContent(finalPrompt);
                let aiText = aiResponse.response.text().trim().replace(/```json/gi, '').replace(/```/g, '');
                
                isDone = true;
                clearTimeout(timer1);
                clearTimeout(timer3);

                let aiData;
                try {
                    aiData = JSON.parse(aiText); 
                } catch(e) {
                    console.error("數字學 JSON 破裂:", aiText);
                    aiData = { coreNumber: 7, luckySet: [11,22,33], wealthSet: [66,88], score: 80, interpretation: "宇宙頻率過強，文字無法完全解析，請靜心感受當下的直覺。" };
                }
                
                const fortuneScore = aiData.score || 80;
                const aiLatency = Date.now() - aiStartTime;
                const usage = aiResponse.response.usageMetadata || {};

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

                const flexMessage = generateNumerologyFlexMessage(userName, aiData, fortuneScore, cost, newBalance);
                await lineClient.pushMessage(userId, flexMessage);

            } catch (error) {
                isDone = true;
                clearTimeout(timer1); clearTimeout(timer3);
                console.error("數字學背景運算異常:", error);
                await lineClient.pushMessage(userId, { type: 'text', text: '⚠️ 宇宙訊號受到干擾，解碼中斷。本次不會扣除您的靈力。' });
            }
        })();

    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

function generateNumerologyFlexMessage(userName, aiData, fortuneScore, cost, newBalance) {
    const safeText = String(aiData.interpretation || "宇宙能量正在匯聚中...").substring(0, 1900);
    const luckyStr = (aiData.luckySet || ['--','--','--']).join(' · ');
    const wealthStr = (aiData.wealthSet || ['--','--']).join(' · ');
    const coreNum = aiData.coreNumber || '--';

    return {
        type: "flex", altText: `您的律動能量解碼已具現 (核心能量: ${coreNum})`,
        contents: {
            type: "bubble", size: "mega",
            body: {
                type: "box", layout: "vertical", backgroundColor: "#05050A", paddingAll: "20px",
                contents: [
                    {
                        type: "box", layout: "horizontal", alignItems: "center",
                        contents: [
                            { type: "text", text: "🌌 律動能量解碼", color: "#D4AF37", size: "sm", weight: "bold", flex: 1 },
                            { type: "text", text: `能量 ${fortuneScore} 分`, color: "#F9E498", size: "xs", align: "end", flex: 1 }
                        ]
                    },
                    { type: "separator", color: "#333333", margin: "md" },
                    {
                        type: "box", layout: "vertical", margin: "xl", alignItems: "center",
                        contents: [
                            { type: "text", text: "核心能量", color: "#888888", size: "xs", align: "center", margin: "sm" },
                            { type: "text", text: String(coreNum), color: "#E5C07B", size: "4xl", weight: "bold", align: "center", margin: "sm" }
                        ]
                    },
                    {
                        type: "box", layout: "horizontal", margin: "xl", spacing: "md",
                        contents: [
                            {
                                type: "box", layout: "vertical", flex: 1, backgroundColor: "#111115", cornerRadius: "md", paddingAll: "10px",
                                contents: [
                                    { type: "text", text: "幸運共振", color: "#888888", size: "xxs", align: "center" },
                                    { type: "text", text: luckyStr, color: "#FFFFFF", size: "sm", weight: "bold", align: "center", margin: "sm" }
                                ]
                            },
                            {
                                type: "box", layout: "vertical", flex: 1, backgroundColor: "#15130A", cornerRadius: "md", paddingAll: "10px",
                                contents: [
                                    { type: "text", text: "財富金鑰", color: "#D4AF37", size: "xxs", align: "center" },
                                    { type: "text", text: wealthStr, color: "#F2D3A1", size: "sm", weight: "bold", align: "center", margin: "sm" }
                                ]
                            }
                        ]
                    },
                    {
                        type: "box", layout: "vertical", margin: "xl", backgroundColor: "#1C1C22", cornerRadius: "md", paddingAll: "15px",
                        contents: [
                            { type: "text", text: "✨ 大師指引", color: "#D4AF37", size: "xs", weight: "bold" },
                            { type: "text", text: safeText, color: "#E0E0E0", size: "sm", wrap: true, lineSpacing: "6px", margin: "md" }
                        ]
                    },
                    { type: "separator", color: "#333333", margin: "xl" },
                    {
                        type: "box", layout: "horizontal", margin: "md",
                        contents: [
                            { type: "text", text: "⚡ 本次消耗", color: "#A0A0B0", size: "sm", flex: 1 },
                            { type: "text", text: `-${cost} 點`, color: "#FF8A80", size: "sm", weight: "bold", align: "end", flex: 1 }
                        ]
                    },
                    {
                        type: "box", layout: "horizontal", margin: "sm",
                        contents: [
                            { type: "text", text: "🔋 剩餘靈力", color: "#F9E498", size: "sm", flex: 1 },
                            { type: "text", text: `${newBalance} 點`, color: "#FFFFFF", size: "lg", weight: "bold", align: "end", flex: 1 }
                        ]
                    }
                ]
            }
        }
    };
}

module.exports = router;