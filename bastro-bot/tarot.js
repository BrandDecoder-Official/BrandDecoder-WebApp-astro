// ==========================================
// BrandDecoder - 塔羅牌核心模組 (tarot.js)
// ==========================================
const fetch = require('node-fetch');
const { mergeModuleKey } = require('./aiSettingsDefaults');

// 1. 塔羅牌圖鑑與字典
const majorArcanaMap = [ "愚者|🌀|無限潛能", "魔術師|🪄|顯化奇蹟", "女祭司|🌙|直覺奧秘", "女皇|👑|豐盛孕育", "皇帝|🦅|秩序建立", "教皇|⛪|精神指引", "戀人|👩‍❤️‍👨|靈魂契合", "戰車|🐎|意志征服", "力量|🦁|柔性堅韌", "隱士|🏮|內在尋道", "命運之輪|🎡|業力輪轉", "正義|⚖️|平衡裁決", "倒吊人|🪢|換位思考", "死神|🦋|毀滅重生", "節制|🌈|和諧煉金", "惡魔|⛓️|物質枷鎖", "高塔|⚡|粉碎重建", "星星|✨|希望指引", "月亮|🐺|潛意識恐懼", "太陽|☀️|生命喜悅", "審判|🎺|靈魂覺醒", "世界|🌍|圓滿達成" ];
const suitsMap = [ {s:"權杖", e:"🔥", k:["新行動","抉擇","擴展","穩固","衝突","勝利","防禦","速達","疲憊","重擔","熱情","衝動","魅力","權威"]}, {s:"聖杯", e:"💧", k:["新情感","結合","慶祝","倦怠","失落","回憶","幻象","追尋","滿願","圓滿","溫柔","浪漫","直覺","包容"]}, {s:"寶劍", e:"⚔️", k:["新思想","盲點","悲痛","休養","爭執","渡過","欺瞞","束毀","焦慮","終結","機警","衝鋒","理智","嚴肅"]}, {s:"錢幣", e:"🪙", k:["新資源","波動","合作","守成","匱乏","施受","靜待","精進","豐收","傳承","務實","穩健","富足","基業"]} ];
const tarotMap = {};
majorArcanaMap.forEach(str => { const [n,e,k] = str.split('|'); tarotMap[n] = { emoji: e, keyword: k }; });
suitsMap.forEach(suit => { suit.k.forEach((kw, i) => { const ranks = ["一","二","三","四","五","六","七","八","九","十","侍者","騎士","王后","國王"]; tarotMap[`${suit.s}${ranks[i]}`] = { emoji: suit.e, keyword: kw }; }); });

// 2. 塔羅牌尊爵版 Flex Message 產生器
function generateTarotFlexMessage(cards, remainPoints, aiText, topic, score, cost = 10) {
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
            type: "bubble", styles: { header: { backgroundColor: "#D4AF37" }, body: { backgroundColor: "#0A0B10" }, footer: { backgroundColor: "#0A0B10" } },
            header: { type: "box", layout: "vertical", paddingAll: "md", contents: [{ type: "text", text: "命運解碼室 | 靈能解碼報告", color: "#000000", weight: "bold", size: "lg", align: "center" }] },
            body: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: "lg",
                contents: [
                    {
                        type: "box", layout: "horizontal", justifyContent: "space-between", alignItems: "center",
                        contents: [
                            { type: "text", text: `🔮 探尋領域：【${topic}】`, color: "#D4AF37", size: "md", weight: "bold", flex: 2 },
                            { type: "text", text: `✨ ${score || '--'} 分`, color: "#F9E498", size: "md", weight: "bold", align: "end", flex: 1 }
                        ]
                    },
                    { type: "separator", margin: "md", color: "#333333" },
                    { type: "box", layout: "horizontal", spacing: "md", contents: cardBoxes },
                    { type: "separator", margin: "lg", color: "#333333" },
                    { type: "text", text: String(aiText || "").substring(0, 1900), color: "#E0E0E0", size: "md", wrap: true, margin: "md" }
                ]
            },
            footer: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: "lg",
                contents: [
                    { type: "separator", color: "#333333" },
                    { type: "box", layout: "horizontal", margin: "md", contents: [ { type: "text", text: "⚡ 本次消耗靈力", color: "#A0A0A0", size: "md", align: "start" }, { type: "text", text: `- ${cost} 點`, color: "#FF6B6B", size: "md", weight: "bold", align: "end" } ] },
                    { type: "box", layout: "horizontal", contents: [ { type: "text", text: "🔋 剩餘靈力餘額", color: "#D4AF37", size: "md", align: "start" }, { type: "text", text: `${remainPoints} 點`, color: "#F9E498", size: "lg", weight: "bold", align: "end" } ] }
                ]
            }
        }
    };
}

// 3. 匯出塔羅牌主邏輯處理函數
exports.processTarotDraw = async function(event, userId, userData, userRef, db, client, genAI, FieldValue, recordDivinationLog) {
    
    const showLoading = async () => {
        await fetch('https://api.line.me/v2/bot/chat/loading/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
            body: JSON.stringify({ chatId: userId, loadingSeconds: 35 }) 
        }).catch(() => {});
    };

    // Webhook 模式：立刻用 replyToken 回應
    await client.replyMessage(event.replyToken, { 
        type: 'text', 
        text: `🔮 已接收到您的靈能訊號，大師正在為您解碼【${userData.pendingDraw.topic}】領域的星辰軌跡...` 
    });
    await showLoading(); 

    (async () => {
        let isDone = false;
        let timer1, timer2, timer3;
        try {
            timer1 = setTimeout(async () => {
                if (!isDone) {
                    await client.pushMessage(userId, { type: 'text', text: '✨ 正在透過牌陣連結您的潛意識能量場...' });
                    await showLoading(); 
                }
            }, 3000);

            timer2 = setTimeout(async () => {
                if (!isDone) {
                    await client.pushMessage(userId, { type: 'text', text: '🌌 靈感湧現！正在將宇宙指引轉化為文字報告，請稍候...' });
                    await showLoading(); 
                }
            }, 7000);

            timer3 = setTimeout(async () => {
                if (!isDone) {
                    await client.pushMessage(userId, { type: 'text', text: '🧘‍♂️ 宇宙訊息量龐大，大師正在為您進行最後的統整與收斂...' });
                    await showLoading(); 
                }
            }, 15000);

            const configDoc = await db.collection('system_config').doc('ai_settings').get();
            const tarotConfig = mergeModuleKey('tarot', configDoc);

            const { topic, cards } = userData.pendingDraw;
            const currentPoints = userData.points || 0;
            const remainPoints = currentPoints - tarotConfig.cost;

            const systemPrompt = tarotConfig.prompt || "你是一位充滿溫度的神祕塔羅解碼師。";
            const prompt = `${systemPrompt}\n\n【本次使用者占卜資訊】\n- 探詢領域：【${topic}】\n- 抽出的牌陣：1.過去【${cards[0]}】 2.現在【${cards[1]}】 3.未來【${cards[2]}】\n\n🚨【系統輸出要求】(嚴格遵守)\n1. 字數上限：【解析】全文（不含「【分數】」那一行）總長度請嚴格控制在 1000 個字（含標點與換行）以內，絕對不得超過；若腹稿超長請自行刪修至 1000 字內再輸出，勿在文中註明刪修或字數計算過程。\n2. 報告結構：請依序包含以下三個層次（可精簡敘述以符合字數）：\n   - 【牌陣解構】：三張牌的能量流轉。\n   - 【破局指引】：針對探詢領域的具體行動建議。\n   - 【靈魂迴響】：一句溫暖短語作結。\n3. ⚠️ 絕對不可使用 JSON 格式！請嚴格依照以下格式輸出：\n\n【分數】：85\n【解析】：\n(這裡放你產出的解碼報告全文)`;

            const dynamicModel = genAI.getGenerativeModel({ model: tarotConfig.model, generationConfig: { temperature: 0.7 } });
            const result = await dynamicModel.generateContent(prompt);
            const rawAiText = result.response.text().trim();

            isDone = true; 
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);

            let aiData = { score: 50, text: "宇宙訊號解析中..." };
            const scoreMatch = rawAiText.match(/【分數】[：:]\s*(\d+)/);
            const textMatch = rawAiText.match(/【解析】[：:]\s*([\s\S]*)/);
            if (scoreMatch) aiData.score = parseInt(scoreMatch[1], 10);
            if (textMatch) aiData.text = textMatch[1].trim(); else aiData.text = rawAiText.replace(/【分數】[：:]\s*\d+/g, '').trim();

            await recordDivinationLog({
                userId, userName: userData.displayName, type: 'tarot', topic, cards, summary: `塔羅解碼：領域【${topic}】`,
                points_change: -tarotConfig.cost, cost: tarotConfig.cost, aiText: aiData.text, fortune_score: aiData.score, timestamp: FieldValue.serverTimestamp()
            });

            let flexMessage = generateTarotFlexMessage(cards, remainPoints, aiData.text, topic, aiData.score, tarotConfig.cost);
            await client.pushMessage(userId, flexMessage);

        } catch (aiError) {
            isDone = true;
            clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3);
            console.error("塔羅解盤發生錯誤:", aiError);
            await userRef.update({ points: FieldValue.increment(tarotConfig.cost) }); 
            await client.pushMessage(userId, { type: 'text', text: '🌌 宇宙能量暫時受到干擾，解碼已取消並退還點數，請稍後再試。' });
        }
    })();
};