// ==========================================
// BrandDecoder - 塔羅牌核心模組 (tarot.js)
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
    tarotStyleHeaderBox,
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
const { formatFlexBodyParagraphs } = require('./lineFlexTextFormat');

function buildTarotShareHead(cards, topic, score, decodedAt) {
    const c0 = cards && cards[0] != null ? cards[0] : '—';
    const c1 = cards && cards[1] != null ? cards[1] : '—';
    const c2 = cards && cards[2] != null ? cards[2] : '—';
    const scoreLabel = score != null && score !== '' && !Number.isNaN(Number(score)) ? String(score) : '--';
    return [
        '【命運解碼室｜塔羅】',
        decodedAt,
        `領域:${topic}`,
        `牌陣:${c0}→${c1}→${c2}`,
        `指數:${scoreLabel}`,
        '',
    ].join('\n');
}

// 1. 塔羅牌圖鑑與字典
const majorArcanaMap = [ "愚者|🌀|無限潛能", "魔術師|🪄|顯化奇蹟", "女祭司|🌙|直覺奧秘", "女皇|👑|豐盛孕育", "皇帝|🦅|秩序建立", "教皇|⛪|精神指引", "戀人|👩‍❤️‍👨|靈魂契合", "戰車|🐎|意志征服", "力量|🦁|柔性堅韌", "隱士|🏮|內在尋道", "命運之輪|🎡|業力輪轉", "正義|⚖️|平衡裁決", "倒吊人|🪢|換位思考", "死神|🦋|毀滅重生", "節制|🌈|和諧煉金", "惡魔|⛓️|物質枷鎖", "高塔|⚡|粉碎重建", "星星|✨|希望指引", "月亮|🐺|潛意識恐懼", "太陽|☀️|生命喜悅", "審判|🎺|靈魂覺醒", "世界|🌍|圓滿達成" ];
const suitsMap = [ {s:"權杖", e:"🔥", k:["新行動","抉擇","擴展","穩固","衝突","勝利","防禦","速達","疲憊","重擔","熱情","衝動","魅力","權威"]}, {s:"聖杯", e:"💧", k:["新情感","結合","慶祝","倦怠","失落","回憶","幻象","追尋","滿願","圓滿","溫柔","浪漫","直覺","包容"]}, {s:"寶劍", e:"⚔️", k:["新思想","盲點","悲痛","休養","爭執","渡過","欺瞞","束毀","焦慮","終結","機警","衝鋒","理智","嚴肅"]}, {s:"錢幣", e:"🪙", k:["新資源","波動","合作","守成","匱乏","施受","靜待","精進","豐收","傳承","務實","穩健","富足","基業"]} ];
const tarotMap = {};
majorArcanaMap.forEach(str => { const [n,e,k] = str.split('|'); tarotMap[n] = { emoji: e, keyword: k }; });
suitsMap.forEach(suit => { suit.k.forEach((kw, i) => { const ranks = ["一","二","三","四","五","六","七","八","九","十","侍者","騎士","王后","國王"]; tarotMap[`${suit.s}${ranks[i]}`] = { emoji: suit.e, keyword: kw }; }); });

// 2. 塔羅牌尊爵版 Flex Message 產生器
function generateTarotFlexMessage(cards, remainPoints, aiText, topic, score, cost = 15, decodedAt, shareUri = null) {
    const cardBoxes = cards.map((cardName, index) => {
        const labels = ["過去", "現在", "未來"];
        const cardData = tarotMap[cardName] || { emoji: "🃏", keyword: "未知" }; 
        return {
            type: "box", layout: "vertical", alignItems: "center", flex: 1,
            contents: [
                {
                    type: "box", layout: "vertical", cornerRadius: "md", borderWidth: "1px", borderColor: "#D4AF37", position: "relative",
                    contents: [
                        { type: "image", url: "https://astro.branddecoderai.com/images/PK_BG2.jpg", size: "full", aspectMode: "cover", aspectRatio: "5:8" },
                        {
                            type: "box", layout: "vertical", position: "absolute", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF1A",
                            contents: [
                                { type: "text", text: cardData.emoji, size: "xl", align: "center", margin: "xs" },
                                { type: "text", text: cardName, color: "#5C4033", weight: "bold", size: "md", align: "center", margin: "xs" },
                                {
                                    type: "box", layout: "vertical", backgroundColor: "#FFFFFFB3", cornerRadius: "md", paddingAll: "md", margin: "md",
                                    contents: [{ type: "text", text: cardData.keyword, color: "#5C4033", size: "xxs", weight: "bold", align: "center" }]
                                }
                            ]
                        }
                    ]
                },
                { type: "text", text: labels[index], color: "#888888", size: "xs", align: "center", margin: "md", weight: "bold" }
            ]
        };
    });

    return {
        type: "flex", altText: "您的靈能解碼報告已具現化",
        contents: {
            type: "bubble", styles: { header: { backgroundColor: FLEX_COLOR.gold }, body: { backgroundColor: "#0A0B10" }, footer: { backgroundColor: "#0A0B10" } },
            header: tarotStyleHeaderBox('命運解碼室 | 靈能解碼報告'),
            body: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: FLEX_PAD.bubble,
                contents: [
                    {
                        type: "box", layout: "horizontal", justifyContent: "space-between", alignItems: "center",
                        contents: [
                            { type: "text", text: `🔮 探尋領域：【${topic}】`, color: FLEX_COLOR.gold, size: FLEX_SIZE.subheading, weight: "bold", flex: 2 },
                            { type: "text", text: `✨ ${score || '--'} 分`, color: FLEX_COLOR.goldLight, size: FLEX_SIZE.score, weight: "bold", align: "end", flex: 1 }
                        ]
                    },
                    { type: "separator", margin: "md", color: FLEX_COLOR.separator },
                    { type: "box", layout: "horizontal", spacing: "md", contents: cardBoxes },
                    { type: "separator", margin: "lg", color: FLEX_COLOR.separator },
                    { type: "text", text: sanitizeForFlexText(clampTextChars(String(aiText || ''), MAX_FLEX_SINGLE_TEXT_CHARS)), color: FLEX_COLOR.body, size: FLEX_SIZE.body, wrap: true, margin: "md" }
                ]
            },
            footer: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: FLEX_PAD.footer,
                contents: appendShareButtonToFooterContents(
                    tarotStylePointsFooterRows(cost, remainPoints),
                    shareUri,
                    { color: '#B8860B' }
                ),
            }
        }
    };
}

// 3. 匯出塔羅牌主邏輯處理函數
exports.processTarotDraw = async function(event, userId, userData, userRef, db, client, genAI, FieldValue, recordDivinationLog) {
    
    const showLoading = (seconds = LINE_LOADING_EARLY_SECONDS) =>
        startLineChatLoading(userId, seconds);

    // Webhook 模式：立刻用 replyToken 回應
    await client.replyMessage(event.replyToken, { 
        type: 'text', 
        text: `🔮 已接收到您的靈能訊號，大師正在為您解碼【${userData.pendingDraw.topic}】領域的星辰軌跡...` 
    });
    await showLoading(); 

    (async () => {
        let isDone = false;
        let timer1, timer2, timer3;
        let tarotConfig = null;
        const aiStartTime = Date.now();
        try {
            timer1 = setTimeout(async () => {
                if (!isDone) {
                    await client.pushMessage(userId, { type: 'text', text: '✨ 正在透過牌陣連結您的潛意識能量場...' });
                    if (!isDone) await showLoading();
                }
            }, 3000);

            timer2 = setTimeout(async () => {
                if (!isDone) {
                    await client.pushMessage(userId, { type: 'text', text: '🌌 靈感湧現！正在將宇宙指引轉化為文字報告，請稍候...' });
                    if (!isDone) await showLoading();
                }
            }, 7000);

            timer3 = setTimeout(async () => {
                if (!isDone) {
                    await client.pushMessage(userId, { type: 'text', text: '🧘‍♂️ 宇宙訊息量龐大，大師正在為您進行最後的統整與收斂...' });
                    if (!isDone) await showLoading(LINE_LOADING_FINAL_SECONDS);
                }
            }, LINE_LOADING_FINAL_AT_MS);

            const configDoc = await db.collection('system_config').doc('ai_settings').get();
            tarotConfig = mergeModuleKey('tarot', configDoc);

            const { topic, cards } = userData.pendingDraw;
            const remainPoints = Math.max(0, Math.floor(Number(userData.points)) || 0);

            const systemPrompt = tarotConfig.prompt || "你是一位充滿溫度的神祕塔羅解碼師。";
            const prompt = `${systemPrompt}\n\n【本次使用者占卜資訊】\n- 探詢領域：【${topic}】\n- 抽出的牌陣：1.過去【${cards[0]}】 2.現在【${cards[1]}】 3.未來【${cards[2]}】${buildTarotZiweiOutputSuffix(topic)}`;

            const dynamicModel = genAI.getGenerativeModel({
                model: tarotConfig.model,
                generationConfig: { temperature: 0.7, maxOutputTokens: MAX_AI_OUTPUT_TOKENS },
            });
            const result = await dynamicModel.generateContent(prompt);
            const rawAiText = result.response.text().trim();
            const usage = result.response.usageMetadata || {};
            const aiLatency = Date.now() - aiStartTime;

            isDone = true; 
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);

            let aiData = { score: 50, text: "宇宙訊號解析中..." };
            const scoreMatch = rawAiText.match(/【分數】[：:]\s*(\d+)/);
            const textMatch = rawAiText.match(/【解析】[：:]\s*([\s\S]*)/);
            if (scoreMatch) aiData.score = parseInt(scoreMatch[1], 10);
            if (textMatch) aiData.text = textMatch[1].trim(); else aiData.text = rawAiText.replace(/【分數】[：:]\s*\d+/g, '').trim();
            aiData.text = clampTextChars(formatFlexBodyParagraphs(aiData.text), MAX_TAROT_ZIWEI_BODY_CHARS);

            await recordDivinationLog({
                userId, userName: userData.displayName, type: 'tarot', topic, cards, summary: `塔羅解碼：領域【${topic}】`,
                points_change: -tarotConfig.cost, cost: tarotConfig.cost, aiText: aiData.text, fortune_score: aiData.score,
                metrics: {
                    latency_ms: aiLatency,
                    tokens_in: usage.promptTokenCount || 0,
                    tokens_out: usage.candidatesTokenCount || 0,
                    model: tarotConfig.model,
                },
            });

            const decodedAt = formatTaipeiDateTimeLine(new Date());
            const shareHead = buildTarotShareHead(cards, topic, aiData.score, decodedAt);
            const shareToken = await createShareSnapshot(db, {
                type: 'tarot',
                head: shareHead,
                body: aiData.text,
                userId,
            });
            const shareUri = buildShareLiffUri(shareToken);
            let flexMessage = generateTarotFlexMessage(
                cards,
                remainPoints,
                aiData.text,
                topic,
                aiData.score,
                tarotConfig.cost,
                decodedAt,
                shareUri
            );
            try {
                await client.pushMessage(userId, flexMessage);
            } catch (pushErr) {
                const lineDetail =
                    pushErr && pushErr.originalError && pushErr.originalError.response && pushErr.originalError.response.data
                        ? pushErr.originalError.response.data
                        : pushErr && pushErr.response && pushErr.response.data
                          ? pushErr.response.data
                          : null;
                console.error(
                    '塔羅 Flex 推播失敗:',
                    pushErr && pushErr.message ? pushErr.message : pushErr,
                    lineDetail != null ? JSON.stringify(lineDetail) : ''
                );
                if (tarotConfig) {
                    await userRef.update({ points: FieldValue.increment(tarotConfig.cost) });
                }
                await client.pushMessage(userId, {
                    type: 'text',
                    text: '⚠️ 解盤已完成，但字卡無法送達 LINE。已退還本次靈力，請稍後再試。',
                });
                return;
            }

        } catch (aiError) {
            isDone = true;
            clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3);
            const lineDetail =
                aiError && aiError.originalError && aiError.originalError.response && aiError.originalError.response.data
                    ? aiError.originalError.response.data
                    : aiError && aiError.response && aiError.response.data
                      ? aiError.response.data
                      : null;
            console.error(
                '塔羅解盤發生錯誤:',
                aiError && aiError.message ? aiError.message : aiError,
                lineDetail != null ? JSON.stringify(lineDetail) : ''
            );
            if (tarotConfig) {
                await userRef.update({ points: FieldValue.increment(tarotConfig.cost) });
};

// 4. 同步版塔羅牌主邏輯處理函數
exports.processTarotDrawSync = async function(req, res, db, client, genAI, FieldValue, recordDivinationLog) {
    const userId = req.user.userId;
    const { topic, cards } = req.body;
    if (!topic || !cards || cards.length !== 3) {
        return res.status(400).json({ success: false, message: "宇宙訊號不完整" });
    }

    const configDoc = await db.collection('system_config').doc('ai_settings').get();
    const tarotConfig = mergeModuleKey('tarot', configDoc);

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userName = userDoc.exists ? (userDoc.data().displayName || userDoc.data().name || '神祕旅人') : '神祕旅人';

    let balanceAfterDeduct;
    try {
        // 直接進行扣點交易，不再產生/刪除 pendingDraw 票根
        balanceAfterDeduct = await deductPointsTransaction(db, userRef, tarotConfig.cost, {});
    } catch (e) {
        const { InsufficientPointsError } = require('./pointsLedger');
        if (e instanceof InsufficientPointsError) {
            return res.status(403).json({ success: false, message: `靈力不足 (需 ${tarotConfig.cost} 點)` });
        }
        throw e;
    }

    const showLoading = (seconds = LINE_LOADING_EARLY_SECONDS) =>
        startLineChatLoading(userId, seconds);

    let isDone = false;
    let timer1, timer2, timer3;
    let pointsRefunded = false;
    const rollbackPoints = async () => {
        if (pointsRefunded) return;
        pointsRefunded = true;
        await refundPoints(userRef, tarotConfig.cost);
    };

    try {
        // LIFF 同步 API 模式下改用 pushMessage 推送前導訊息
        await client.pushMessage(userId, { 
            type: 'text', 
            text: `🔮 已接收到您的靈能訊號，大師正在為您解碼【${topic}】領域的星辰軌跡...` 
        });
        await showLoading(); 

        const aiStartTime = Date.now();

        timer1 = setTimeout(async () => {
            if (!isDone) {
                await client.pushMessage(userId, { type: 'text', text: '✨ 正在透過牌陣連結您的潛意識能量場...' });
                if (!isDone) await showLoading();
            }
        }, 3000);

        timer2 = setTimeout(async () => {
            if (!isDone) {
                await client.pushMessage(userId, { type: 'text', text: '🌌 靈感湧現！正在將宇宙指引轉化為文字報告，請稍候...' });
                if (!isDone) await showLoading();
            }
        }, 7000);

        timer3 = setTimeout(async () => {
            if (!isDone) {
                await client.pushMessage(userId, { type: 'text', text: '🧘‍♂️ 宇宙訊息量龐大，大師正在為您進行最後的統整與收斂...' });
                if (!isDone) await showLoading(LINE_LOADING_FINAL_SECONDS);
            }
        }, LINE_LOADING_FINAL_AT_MS);

        const remainPoints = balanceAfterDeduct;

        const systemPrompt = tarotConfig.prompt || "你是一位充滿溫度的神祕塔羅解碼師。";
        const prompt = `${systemPrompt}\n\n【本次使用者占卜資訊】\n- 探詢領域：【${topic}】\n- 抽出的牌陣：1.過去【${cards[0]}】 2.現在【${cards[1]}】 3.未來【${cards[2]}】${buildTarotZiweiOutputSuffix(topic)}`;

        const dynamicModel = genAI.getGenerativeModel({
            model: tarotConfig.model,
            generationConfig: { temperature: 0.7, maxOutputTokens: MAX_AI_OUTPUT_TOKENS },
        });
        const result = await dynamicModel.generateContent(prompt);
        const rawAiText = result.response.text().trim();
        const usage = result.response.usageMetadata || {};
        const aiLatency = Date.now() - aiStartTime;

        isDone = true; 
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);

        let aiData = { score: 50, text: "宇宙訊號解析中..." };
        const scoreMatch = rawAiText.match(/【分數】[：:]\s*(\d+)/);
        const textMatch = rawAiText.match(/【解析】[：:]\s*([\s\S]*)/);
        if (scoreMatch) aiData.score = parseInt(scoreMatch[1], 10);
        if (textMatch) aiData.text = textMatch[1].trim(); else aiData.text = rawAiText.replace(/【分數】[：:]\s*\d+/g, '').trim();
        aiData.text = clampTextChars(formatFlexBodyParagraphs(aiData.text), MAX_TAROT_ZIWEI_BODY_CHARS);

        await recordDivinationLog({
            userId, userName, type: 'tarot', topic, cards, summary: `塔羅解碼：領域【${topic}】`,
            points_change: -tarotConfig.cost, cost: tarotConfig.cost, aiText: aiData.text, fortune_score: aiData.score,
            metrics: {
                latency_ms: aiLatency,
                tokens_in: usage.promptTokenCount || 0,
                tokens_out: usage.candidatesTokenCount || 0,
                model: tarotConfig.model,
            },
        });

        // 寫入歷史歷史紀錄
        await userRef.collection('history').add({
            type: 'tarot', summary: `今日塔羅：${cards.join(' → ')}`, aiText: aiData.text, result_card: cards[0],
            points_change: -tarotConfig.cost, cost: tarotConfig.cost, fortune_score: aiData.score, timestamp: FieldValue.serverTimestamp()
        });

        const decodedAt = formatTaipeiDateTimeLine(new Date());
        const shareHead = buildTarotShareHead(cards, topic, aiData.score, decodedAt);
        const shareToken = await createShareSnapshot(db, {
            type: 'tarot',
            head: shareHead,
            body: aiData.text,
            userId,
        });
        const shareUri = buildShareLiffUri(shareToken);
        let flexMessage = generateTarotFlexMessage(
            cards,
            remainPoints,
            aiData.text,
            topic,
            aiData.score,
            tarotConfig.cost,
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
                '塔羅 Flex 推播失敗:',
                pushErr && pushErr.message ? pushErr.message : pushErr,
                lineDetail != null ? JSON.stringify(lineDetail) : ''
            );
            await client.pushMessage(userId, {
                type: 'text',
                text: '⚠️ 解盤已完成，但字卡無法送達 LINE。已退還本次靈力，請稍後再試。',
            });
            return res.status(500).json({ success: false, message: '訊息送達 LINE 失敗' });
        }

        return res.status(200).json({ success: true });

    } catch (aiError) {
        isDone = true;
        clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3);
        await rollbackPoints();
        const lineDetail =
            aiError && aiError.originalError && aiError.originalError.response && aiError.originalError.response.data
                ? aiError.originalError.response.data
                : aiError && aiError.response && aiError.response.data
                  ? aiError.response.data
                  : null;
        console.error(
            '塔羅解盤發生錯誤:',
            aiError && aiError.message ? aiError.message : aiError,
            lineDetail != null ? JSON.stringify(lineDetail) : ''
        );
        await client.pushMessage(userId, { type: 'text', text: '⚠️ 宇宙訊號受到干擾，解碼中斷。本次不會扣除您的靈力。' });
        return res.status(500).json({ success: false, message: aiError.message });
    }
};