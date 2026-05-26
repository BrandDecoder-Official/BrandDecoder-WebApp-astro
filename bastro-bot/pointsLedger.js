'use strict';

const { FieldValue } = require('firebase-admin/firestore');

class InsufficientPointsError extends Error {
    constructor(cost, balance) {
        super('靈力不足');
        this.name = 'InsufficientPointsError';
        this.cost = cost;
        this.balance = balance;
    }
}

// 💡 內存快取活動設定，避免每次扣點都查詢一次 Firestore
let cachedCampaign = null;
let lastCampaignFetchTime = 0;
const CAMPAIGN_CACHE_TTL_MS = 10000; // 10秒過期

async function getCampaignConfig(db) {
    const now = Date.now();
    if (cachedCampaign && (now - lastCampaignFetchTime < CAMPAIGN_CACHE_TTL_MS)) {
        return cachedCampaign;
    }

    try {
        const doc = await db.collection('system_config').doc('campaign').get();
        if (doc.exists) {
            cachedCampaign = doc.data();
        } else {
            cachedCampaign = { active: false };
        }
        lastCampaignFetchTime = now;
    } catch (e) {
        console.error('[pointsLedger] 讀取活動折扣配置失敗，使用後備無活動設定:', e.message);
        if (!cachedCampaign) {
            cachedCampaign = { active: false };
        }
    }
    return cachedCampaign;
}

/**
 * 依據動態活動時間與折扣率計算實際扣除點數 (防套利核心)
 * @param {object} db - Firestore 資料庫實例
 * @param {number} originalCost - 原始扣點價格
 * @returns {Promise<number>} 折扣後實際扣點 (向下取整)
 */
async function getCampaignDiscountedCost(db, originalCost) {
    const campaign = await getCampaignConfig(db);
    const cost = Math.floor(Number(originalCost));
    if (!Number.isFinite(cost) || cost <= 0) return cost;

    if (campaign && campaign.active) {
        const now = new Date();
        const start = campaign.startTime ? new Date(campaign.startTime) : null;
        const end = campaign.endTime ? new Date(campaign.endTime) : null;

        let inTimeRange = true;
        if (start && now < start) inTimeRange = false;
        if (end && now > end) inTimeRange = false;

        if (inTimeRange && typeof campaign.discountRate === 'number' && campaign.discountRate > 0 && campaign.discountRate <= 1) {
            // 向下取整，如 15 * 0.6 = 9 點
            return Math.floor(cost * campaign.discountRate);
        }
    }
    return cost;
}

/**
 * 原子扣點：餘額不足則拋 InsufficientPointsError
 * @returns {Promise<number>} 扣點後餘額
 */
async function deductPointsTransaction(db, userRef, cost, extraUpdates = {}) {
    const n = Math.floor(Number(cost));
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error('invalid cost');
    }

    return db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) {
            throw new InsufficientPointsError(n, 0);
        }
        const pts = Math.floor(Number(doc.data().points)) || 0;
        if (pts < n) {
            throw new InsufficientPointsError(n, pts);
        }
        const next = pts - n;
        t.update(userRef, { points: next, ...extraUpdates });
        return next;
    });
}

async function refundPoints(userRef, amount) {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) return;
    await userRef.update({ points: FieldValue.increment(n) });
}

module.exports = {
    InsufficientPointsError,
    getCampaignDiscountedCost,
    deductPointsTransaction,
    refundPoints,
};
