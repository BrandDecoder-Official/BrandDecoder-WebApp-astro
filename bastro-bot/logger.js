// ==========================================
// 📊 統一日誌中心模組 (logger.js)
// 負責處理全站日誌寫入，確保欄位一致性與雙向寫入
// ==========================================
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// 將版本號統一管理在這裡，日後升級只要改這裡
const PLATFORM_VERSION = "v4.95";

async function recordDivinationLog(params) {
    // 取得已初始化的 Firestore 實例
    const db = getFirestore('astro-bot-db'); 

    try {
        // 🌟 修正點：在這裡直接賦予預設值，避免 undefined 導致程式崩潰
        const {
            userId, userName, type, 
            log_class = 'consumption', 
            stage = 'Stage 4: Finish', // 如果沒傳入，預設就是 Finish
            summary = '系統紀錄', 
            points_change = 0, 
            cost = 0,
            topic, cards, result_card, aiText, fortune_score, metrics
        } = params;

        // 1. 組裝標準化的 Log 骨架
        const logData = {
            userId: userId,
            userName: userName || '神祕旅人',
            type: type, 
            log_class: log_class, 
            stage: stage, 
            summary: summary,
            points_change: points_change,
            cost: cost,
            platform_version: PLATFORM_VERSION,
            timestamp: FieldValue.serverTimestamp()
        };

        // 2. 只有當這些「選填」資料存在時，才放入物件中
        if (topic) logData.topic = topic;
        if (cards) logData.cards = cards;
        if (result_card) logData.result_card = result_card;
        if (aiText) logData.aiText = aiText;
        if (fortune_score !== undefined) logData.fortune_score = fortune_score;
        if (metrics) {
            const tokensIn = Math.max(0, Number(metrics.tokens_in) || 0);
            const tokensOut = Math.max(0, Number(metrics.tokens_out) || 0);
            logData.metrics = {
                ...metrics,
                tokens_in: tokensIn,
                tokens_out: tokensOut,
                tokens_total: tokensIn + tokensOut,
            };
        }

        // 3. 🌟 雙寫入機制 (Batch)
        const batch = db.batch();
        
        // 寫入 A：全站大日誌 (戰情室用)
        const globalLogRef = db.collection('divination_logs').doc();
        batch.set(globalLogRef, logData);

        // 寫入 B：使用者的個人歷史紀錄 (排除純系統埋點)
        if (stage.includes('Finish') || type === 'recharge' || type === 'daily_draw') {
            const userHistoryRef = db.collection('users').doc(userId).collection('history').doc();
            batch.set(userHistoryRef, logData);
        }

        await batch.commit();
        return true;
    } catch (error) {
        console.error("🚨 統一日誌寫入失敗:", error);
        return false;
    }
}

// 導出模組供外部使用
module.exports = { recordDivinationLog };