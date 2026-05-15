// ==========================================
// BrandDecoder - 紫微斗數核心模組 (ziwei.js)
// ==========================================
const fetch = require('node-fetch');
const { mergeModuleKey } = require('./aiSettingsDefaults');
const {
    formatTaipeiDateTimeLine,
    buildLineShareUriFromHeadAndBody,
    lineFlexShareButton,
} = require('./lineOaShare');

/** 表頭至「────────」後換行為止；正文另傳，避免截斷時誤傷表頭 */
function buildZiweiShareHead(birthData, score, decodedAt) {
    const genderStr = birthData.gender === 'M' ? '乾造 (男命)' : '坤造 (女命)';
    const calStr = birthData.calendar === 'solar' ? '國曆' : '農曆';
    const topicStr = birthData.topic || '本命格局';
    const scoreLabel = score != null && score !== '' && !Number.isNaN(Number(score)) ? String(score) : '--';
    return [
        '【命運解碼室｜紫微斗數】尊爵版（分享用）',
        `解盤時間（台北）：${decodedAt}`,
        `探詢領域：${topicStr}`,
        `命造參數：【${genderStr}】${calStr} ${birthData.date} ${birthData.time}時`,
        `綜合運勢指數：${scoreLabel} 分`,
        '',
        '────────',
        '',
    ].join('\n');
}

// 1. 紫微斗數尊爵版 Flex Message 產生器
function generateZiweiFlexMessage(userName, birthData, resultText, score, cost, remainPoints, decodedAt) {
    const genderStr = birthData.gender === 'M' ? '乾造 (男命)' : '坤造 (女命)';
    const calStr = birthData.calendar === 'solar' ? '國曆' : '農曆';
    const shareHead = buildZiweiShareHead(birthData, score, decodedAt);
    const shareUri = buildLineShareUriFromHeadAndBody(shareHead, resultText);

    return {
        type: "flex", altText: "✨ 您的專屬天命占星盤已解碼完成",
        contents: {
            type: "bubble",
            styles: {
                header: { backgroundColor: "#8E24AA" },
                body: { backgroundColor: "#120024" },
                footer: { backgroundColor: "#120024" }
            },
            header: {
                type: "box", layout: "vertical", paddingAll: "md",
                contents: [
                    { type: "text", text: "命運解碼室 | 紫微斗數", color: "#F9E498", weight: "bold", size: "md", align: "center" },
                    { type: "text", text: "尊爵版 ‧ 命盤報告", color: "#FFFFFF", weight: "bold", size: "lg", align: "center", margin: "md" }
                ]
            },
            body: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: "lg",
                contents: [
                    {
                        type: "box", layout: "vertical", backgroundColor: "#FFFFFF1A", cornerRadius: "md", paddingAll: "md",
                        contents: [
                            { type: "text", text: `親愛的 ${userName}，`, color: "#F9E498", weight: "bold", size: "md" },
                            { type: "text", text: `宇宙已具現化您降臨凡間的初始代碼：\n【${genderStr}】 ${calStr} ${birthData.date} ${birthData.time}時`, color: "#FFFFFF", size: "xs", wrap: true, margin: "md", style: "italic" }
                        ]
                    },
                    {
                        type: "box", layout: "horizontal", alignItems: "center", margin: "lg",
                        contents: [
                            { type: "text", text: "🏮 綜合運勢指數", color: "#FFFFFF", size: "md", flex: 3 },
                            { type: "text", text: `${score || '--'} 分`, color: "#F9E498", size: "xxl", weight: "bold", flex: 2, align: "end" }
                        ]
                    },
                    { type: "separator", color: "#4A148C", margin: "md" },
                    { type: "text", text: "✨ 天命解碼精華：", color: "#F9E498", size: "md", weight: "bold", margin: "md" },
                    { type: "text", text: String(resultText || "").substring(0, 1900), color: "#E0E0E0", size: "md", wrap: true, margin: "md" }
                ]
            },
            footer: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: "lg",
                contents: [
                    { type: "separator", color: "#4A148C" },
                    {
                        type: "box", layout: "horizontal", margin: "md",
                        contents: [
                            { type: "text", text: "⚡ 本次解碼消耗", color: "#AAAAAA", size: "md" },
                            { type: "text", text: `- ${cost} 點`, color: "#FF8A80", size: "md", weight: "bold", align: "end" }
                        ]
                    },
                    {
                        type: "box", layout: "horizontal",
                        contents: [
                            { type: "text", text: "🔋 剩餘靈力", color: "#F9E498", size: "md" },
                            { type: "text", text: `${remainPoints} 點`, color: "#FFFFFF", size: "lg", weight: "bold", align: "end" }
                        ]
                    },
                    lineFlexShareButton(shareUri, { color: '#7B1FA2' })
                ]
            }
        }
    };
}

// 2. 匯出紫微斗數主邏輯處理函數
exports.processZiweiDivination = async function(req, res, db, client, genAI, FieldValue, recordDivinationLog) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, msg: "未授權的請求。" });
        const token = authHeader.split(' ')[1];
        const profileRes = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${token}` } });
        if (!profileRes.ok) return res.status(401).json({ success: false, msg: "通行證驗證失敗" });
        const lineProfile = await profileRes.json();
        const userId = lineProfile.userId;

        const configDoc = await db.collection('system_config').doc('ai_settings').get();
        const aiConfig = mergeModuleKey('ziwei', configDoc);

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const currentPoints = userDoc.exists ? (userDoc.data().points || 0) : 0;
        const userName = userDoc.exists ? (userDoc.data().displayName || userDoc.data().name || '神祕旅人') : '神祕旅人';

        if (currentPoints < aiConfig.cost) return res.status(400).json({ success: false, msg: "靈力不足" });

        const { birthData } = req.body;
        const topicStr = birthData.topic || '本命格局';
        const genderStr = birthData.gender === 'M' ? '乾造 (男命)' : '坤造 (女命)';
        const calStr = birthData.calendar === 'solar' ? '國曆' : '農曆';

        // 立刻回傳 200，讓前端關閉網頁
        res.json({ success: true, msg: "命盤已送交大師，請關閉網頁回聊天室查看" });

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
                await client.pushMessage(userId, { type: 'text', text: `🏮 已排定 ${userName} 的星盤，大師正在起盤推演...` });
                await showLoading(); 

                timer1 = setTimeout(async () => {
                    if (!isDone) {
                        await client.pushMessage(userId, { type: 'text', text: `✨ 正在剖析您的【${topicStr}】格局...` });
                        await showLoading(); 
                    }
                }, 4000);

                timer3 = setTimeout(async () => {
                    if (!isDone) {
                        await client.pushMessage(userId, { type: 'text', text: `⏳ 星象軌跡極為錯綜複雜，正在進行最後的命盤校準...` });
                        await showLoading(); 
                    }
                }, 15000);

                const systemPrompt = aiConfig.prompt || "你是一位精通紫微斗數的國學大師...";
                const finalPrompt = `${systemPrompt}\n\n【命主生辰與探詢資訊】\n- 探詢領域：${topicStr}\n- 生理性別：${genderStr}\n- 曆法時間：${calStr} ${birthData.date} ${birthData.time}時\n\n🚨【系統輸出要求】(嚴格遵守)\n1. 字數上限：【解析】全文（不含「【分數】」那一行）總長度請嚴格控制在 1000 個字（含標點與換行）以內，絕對不得超過；若腹稿超長請自行刪修至 1000 字內再輸出，勿在文中註明刪修或字數計算過程。\n2. 將主要篇幅集中在「${topicStr}」相關論述（仍須遵守上述字數上限）。\n3. ⚠️ 絕對不可使用 JSON 格式！請嚴格依照以下格式輸出：\n\n【分數】：85\n【解析】：\n(這裡放你產出的解碼報告全文)`;
                
                const dynamicModel = genAI.getGenerativeModel({ model: aiConfig.model, generationConfig: { temperature: 0.7 } });
                const result = await dynamicModel.generateContent(finalPrompt);
                const rawAiText = result.response.text().trim();

                isDone = true; 
                clearTimeout(timer1);
                clearTimeout(timer3);

                let aiData = { score: 75, text: "命盤解析中..." };
                const scoreMatch = rawAiText.match(/【分數】[：:]\s*(\d+)/);
                const textMatch = rawAiText.match(/【解析】[：:]\s*([\s\S]*)/);
                if (scoreMatch) aiData.score = parseInt(scoreMatch[1], 10);
                if (textMatch) aiData.text = textMatch[1].trim(); else aiData.text = rawAiText.replace(/【分數】[：:]\s*\d+/g, '').trim();

                await userRef.set({ points: FieldValue.increment(-aiConfig.cost), lastDivination: FieldValue.serverTimestamp() }, { merge: true });
                const remainPoints = currentPoints - aiConfig.cost;

                await recordDivinationLog({
                    userId, userName, type: 'ziwei', summary: `紫微解碼[${topicStr}]：${genderStr}, ${birthData.date} ${birthData.time}時`, points_change: -aiConfig.cost, cost: aiConfig.cost,
                    aiText: aiData.text, fortune_score: aiData.score
                });

                const decodedAt = formatTaipeiDateTimeLine(new Date());
                const flexMessage = generateZiweiFlexMessage(
                    userName,
                    birthData,
                    aiData.text,
                    aiData.score,
                    aiConfig.cost,
                    remainPoints,
                    decodedAt
                );
                try {
                    await client.pushMessage(userId, flexMessage);
                } catch (pushErr) {
                    await userRef.set({ points: FieldValue.increment(aiConfig.cost) }, { merge: true });
                    const lineDetail =
                        pushErr && pushErr.originalError && pushErr.originalError.response && pushErr.originalError.response.data
                            ? pushErr.originalError.response.data
                            : pushErr && pushErr.response && pushErr.response.data
                              ? pushErr.response.data
                              : null;
                    console.error(
                        '紫微 Flex 推播失敗，已退還靈力:',
                        pushErr && pushErr.message ? pushErr.message : pushErr,
                        lineDetail != null ? JSON.stringify(lineDetail) : ''
                    );
                    await client.pushMessage(userId, {
                        type: 'text',
                        text: '⚠️ 解盤已完成，但訊息無法送達 LINE（連線或官方限制）。已為您退還本次靈力，請稍後再試。',
                    });
                    return;
                }

            } catch (bgError) {
                isDone = true;
                clearTimeout(timer1); clearTimeout(timer3);
                const errStr = (() => {
                    try {
                        return typeof bgError === 'string' ? bgError : JSON.stringify(bgError);
                    } catch (e) {
                        return String(bgError && bgError.message ? bgError.message : bgError);
                    }
                })();
                console.error('紫微背景失敗:', { model: aiConfig.model, message: bgError && bgError.message, stack: bgError && bgError.stack, errStr });

                const looksLikeModel404 =
                    /404|"Not Found"|NOT_FOUND|is not found|not supported for generateContent/i.test(errStr) ||
                    (bgError && (bgError.status === 404 || bgError.code === 404));

                const lineText = looksLikeModel404
                    ? '⚠️ 解盤中斷：目前設定的 AI 模型無法使用（可能已更名、未開放或專案未啟用）。請聯絡管理員檢查後台「紫微」模型 ID。本次不會扣除您的靈力。'
                    : '⚠️ 星象干擾過強，大師解盤中斷。本次不會扣除您的靈力。';

                await client.pushMessage(userId, { type: 'text', text: lineText });
            }
        })();

    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
};