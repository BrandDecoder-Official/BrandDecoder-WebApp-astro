// ==========================================
// BrandDecoder - 紫微斗數核心模組 (ziwei.js)
// ==========================================
const fetch = require('node-fetch');
const { mergeModuleKey } = require('./aiSettingsDefaults');
const {
    formatTaipeiDateTimeLine,
    buildShareLiffUri,
    appendShareButtonToFooterContents,
    sanitizeForFlexText,
} = require('./lineOaShare');
const { createShareSnapshot } = require('./shareSnapshot');
const {
    FLEX_SIZE,
    FLEX_COLOR,
    FLEX_PAD,
    tarotStylePointsFooterRows,
} = require('./lineFlexTypography');
const {
    MAX_TAROT_ZIWEI_BODY_CHARS,
    MAX_FLEX_SINGLE_TEXT_CHARS,
    MAX_AI_OUTPUT_TOKENS,
    clampTextChars,
} = require('./aiReplyLimits');
const { buildTarotZiweiOutputSuffix } = require('./aiPromptEnvelope');
const {
    startLineChatLoading,
    LINE_LOADING_EARLY_SECONDS,
    LINE_LOADING_FINAL_SECONDS,
    LINE_LOADING_FINAL_AT_MS,
} = require('./lineLoading');
const {
    InsufficientPointsError,
    deductPointsTransaction,
    refundPoints,
} = require('./pointsLedger');
const { formatFlexBodyParagraphs } = require('./lineFlexTextFormat');

/** 表頭至「────────」後換行為止；正文另傳，避免截斷時誤傷表頭 */
function buildZiweiShareHead(birthData, score, decodedAt) {
    const genderStr = birthData.gender === 'M' ? '乾造 (男命)' : '坤造 (女命)';
    const calStr = birthData.calendar === 'solar' ? '國曆' : '農曆';
    const topicStr = birthData.topic || '本命格局';
    const scoreLabel = score != null && score !== '' && !Number.isNaN(Number(score)) ? String(score) : '--';
    return [
        '【命運解碼室｜紫微】',
        decodedAt,
        `領域:${topicStr}`,
        `命造:${genderStr} ${calStr} ${birthData.date} ${birthData.time}時`,
        `指數:${scoreLabel}`,
        '',
    ].join('\n');
}

// 1. 紫微斗數尊爵版 Flex Message 產生器
function generateZiweiFlexMessage(userName, birthData, resultText, score, cost, remainPoints, decodedAt, shareUri = null) {
    const genderStr = birthData.gender === 'M' ? '乾造 (男命)' : '坤造 (女命)';
    const calStr = birthData.calendar === 'solar' ? '國曆' : '農曆';

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
                    { type: "text", text: "命運解碼室 | 紫微斗數", color: FLEX_COLOR.goldLight, weight: "bold", size: FLEX_SIZE.subheading, align: "center" },
                    { type: "text", text: "尊爵版 ‧ 命盤報告", color: FLEX_COLOR.white, weight: "bold", size: FLEX_SIZE.headerTitle, align: "center", margin: "md" }
                ]
            },
            body: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: FLEX_PAD.bubble,
                contents: [
                    {
                        type: "box", layout: "vertical", backgroundColor: "#FFFFFF1A", cornerRadius: "md", paddingAll: "md",
                        contents: [
                            { type: "text", text: `親愛的 ${userName}，`, color: FLEX_COLOR.goldLight, weight: "bold", size: FLEX_SIZE.subheading },
                            { type: "text", text: `宇宙已具現化您降臨凡間的初始代碼：\n【${genderStr}】 ${calStr} ${birthData.date} ${birthData.time}時`, color: FLEX_COLOR.white, size: FLEX_SIZE.caption, wrap: true, margin: "md", style: "italic" }
                        ]
                    },
                    {
                        type: "box", layout: "horizontal", alignItems: "center", margin: "lg",
                        contents: [
                            { type: "text", text: "🏮 綜合運勢指數", color: FLEX_COLOR.white, size: FLEX_SIZE.subheading, flex: 3 },
                            { type: "text", text: `${score || '--'} 分`, color: FLEX_COLOR.goldLight, size: FLEX_SIZE.score, weight: "bold", flex: 2, align: "end" }
                        ]
                    },
                    { type: "separator", color: "#4A148C", margin: "md" },
                    { type: "text", text: "✨ 天命解碼精華：", color: FLEX_COLOR.goldLight, size: FLEX_SIZE.sectionLabel, weight: "bold", margin: "md" },
                    { type: "text", text: sanitizeForFlexText(clampTextChars(String(resultText || ''), MAX_FLEX_SINGLE_TEXT_CHARS)), color: FLEX_COLOR.body, size: FLEX_SIZE.body, wrap: true, margin: "md" }
                ]
            },
            footer: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: FLEX_PAD.footer,
                contents: appendShareButtonToFooterContents(
                    tarotStylePointsFooterRows(cost, remainPoints, {
                        costLabel: '⚡ 本次解碼消耗',
                        remainLabel: '🔋 剩餘靈力',
                        costColor: FLEX_COLOR.mutedAlt,
                        remainLabelColor: FLEX_COLOR.goldLight,
                        separatorColor: '#4A148C',
                    }),
                    shareUri,
                    { color: '#7B1FA2' }
                ),
            }
        }
    };
}

// 2. 匯出紫微斗數主邏輯處理函數
exports.processZiweiDivination = async function(req, res, db, client, genAI, FieldValue, recordDivinationLog) {
    try {
        const userId = req.user && req.user.userId;
        if (!userId) return res.status(401).json({ success: false, msg: "未授權的請求。" });

        const configDoc = await db.collection('system_config').doc('ai_settings').get();
        const aiConfig = mergeModuleKey('ziwei', configDoc);

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const userName = userDoc.exists ? (userDoc.data().displayName || userDoc.data().name || '神祕旅人') : '神祕旅人';

        let balanceAfterDeduct;
        try {
            balanceAfterDeduct = await deductPointsTransaction(db, userRef, aiConfig.cost, {
                lastDivination: FieldValue.serverTimestamp(),
            });
        } catch (e) {
            if (e instanceof InsufficientPointsError) {
                return res.status(400).json({ success: false, msg: '靈力不足' });
            }
            throw e;
        }

        const { birthData } = req.body;
        const topicStr = birthData.topic || '本命格局';
        const genderStr = birthData.gender === 'M' ? '乾造 (男命)' : '坤造 (女命)';
        const calStr = birthData.calendar === 'solar' ? '國曆' : '農曆';

        try {
            await recordDivinationLog({
                userId,
                userName,
                type: 'ziwei',
                log_class: 'system',
                stage: 'Stage 2: Ticket Created',
                summary: '系統背景程序：建立紫微解碼任務',
                points_change: 0,
            });
        } catch (logErr) {
            console.warn('紫微 Stage 2 日誌略過:', logErr.message);
        }

        // 立刻回傳 200，讓前端關閉網頁
        res.json({ success: true, msg: "命盤已送交大師，請關閉網頁回聊天室查看" });

        (async () => {
            let isDone = false;
            let timer1, timer3;
            let pointsRefunded = false;
            const rollbackPoints = async () => {
                if (pointsRefunded) return;
                pointsRefunded = true;
                await refundPoints(userRef, aiConfig.cost);
            };

            const showLoading = (seconds = LINE_LOADING_EARLY_SECONDS) =>
                startLineChatLoading(userId, seconds);

            try {
                await client.pushMessage(userId, { type: 'text', text: `🏮 已排定 ${userName} 的星盤，大師正在起盤推演...` });
                await showLoading(); 

                const aiStartTime = Date.now();

                timer1 = setTimeout(async () => {
                    if (!isDone) {
                        await client.pushMessage(userId, { type: 'text', text: `✨ 正在剖析您的【${topicStr}】格局...` });
                        if (!isDone) await showLoading();
                    }
                }, 4000);

                timer3 = setTimeout(async () => {
                    if (!isDone) {
                        await client.pushMessage(userId, { type: 'text', text: `⏳ 星象軌跡極為錯綜複雜，正在進行最後的命盤校準...` });
                        if (!isDone) await showLoading(LINE_LOADING_FINAL_SECONDS);
                    }
                }, LINE_LOADING_FINAL_AT_MS);

                const systemPrompt = aiConfig.prompt || "你是一位精通紫微斗數的國學大師...";
                const finalPrompt = `${systemPrompt}\n\n【命主生辰與探詢資訊】\n- 探詢領域：${topicStr}\n- 生理性別：${genderStr}\n- 曆法時間：${calStr} ${birthData.date} ${birthData.time}時${buildTarotZiweiOutputSuffix(topicStr)}`;
                
                const dynamicModel = genAI.getGenerativeModel({
                    model: aiConfig.model,
                    generationConfig: { temperature: 0.7, maxOutputTokens: MAX_AI_OUTPUT_TOKENS },
                });
                const result = await dynamicModel.generateContent(finalPrompt);
                const rawAiText = result.response.text().trim();
                const usage = result.response.usageMetadata || {};
                const aiLatency = Date.now() - aiStartTime;

                isDone = true; 
                clearTimeout(timer1);
                clearTimeout(timer3);

                let aiData = { score: 75, text: "命盤解析中..." };
                const scoreMatch = rawAiText.match(/【分數】[：:]\s*(\d+)/);
                const textMatch = rawAiText.match(/【解析】[：:]\s*([\s\S]*)/);
                if (scoreMatch) aiData.score = parseInt(scoreMatch[1], 10);
                if (textMatch) aiData.text = textMatch[1].trim(); else aiData.text = rawAiText.replace(/【分數】[：:]\s*\d+/g, '').trim();
                aiData.text = clampTextChars(formatFlexBodyParagraphs(aiData.text), MAX_TAROT_ZIWEI_BODY_CHARS);

                const remainPoints = balanceAfterDeduct;

                await recordDivinationLog({
                    userId, userName, type: 'ziwei', summary: `紫微解碼[${topicStr}]：${genderStr}, ${birthData.date} ${birthData.time}時`, points_change: -aiConfig.cost, cost: aiConfig.cost,
                    aiText: aiData.text, fortune_score: aiData.score,
                    metrics: {
                        latency_ms: aiLatency,
                        tokens_in: usage.promptTokenCount || 0,
                        tokens_out: usage.candidatesTokenCount || 0,
                        model: aiConfig.model,
                    },
                });

                const decodedAt = formatTaipeiDateTimeLine(new Date());
                const shareHead = buildZiweiShareHead(birthData, aiData.score, decodedAt);
                const shareToken = await createShareSnapshot(db, {
                    type: 'ziwei',
                    head: shareHead,
                    body: aiData.text,
                    userId,
                });
                const shareUri = buildShareLiffUri(shareToken);
                const flexMessage = generateZiweiFlexMessage(
                    userName,
                    birthData,
                    aiData.text,
                    aiData.score,
                    aiConfig.cost,
                    remainPoints,
                    decodedAt,
                    shareUri
                );
                try {
                    await client.pushMessage(userId, flexMessage);
                } catch (pushErr) {
                    await rollbackPoints();
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
                await rollbackPoints();
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