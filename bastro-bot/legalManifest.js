/**
 * 讀取 legal-service-manifest.json（與 index.js 同目錄）。
 * 供綠界 ItemName／TradeDesc 等與前端／說明頁共用字串。
 */
'use strict';

const fs = require('fs');
const path = require('path');

let cache = null;

function interpolate(str, vars) {
    const v = vars || {};
    return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] != null ? String(v[k]) : ''));
}

function loadLegalManifest() {
    if (cache) return cache;
    const fp = path.join(__dirname, 'legal-service-manifest.json');
    try {
        cache = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (e) {
        console.error('[legalManifest] 讀取失敗，使用內建後備字串:', e.message);
        cache = {
            version: 'fallback',
            templates: {
                productName: '線上占卜服務點數（靈力 {{points}} 點） 命運解碼室',
                tradeDesc: '線上占卜服務點數（靈力{{points}}點）命運解碼室',
            },
        };
    }
    return cache;
}

/** 雙月期別（與 member/profile.html getCurrentRechargePeriod 一致） */
function getCurrentRechargePeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const periodNum = Math.ceil((now.getMonth() + 1) / 2);
    return `${year}-${periodNum}`;
}

function findPricingTierByAmount(amount) {
    const tiers = loadLegalManifest().pricingTiers || [];
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) return null;
    return tiers.find((t) => Math.floor(Number(t.price)) === amt) || null;
}

/**
 * 儲值建單白名單：amount / pointsGiven / periodCode 須與 manifest 及首充規則一致。
 * @returns {{ ok: true, amount: number, pointsGiven: number, periodCode: string|null } | { ok: false, msg: string }}
 */
function validateRechargeOrder({ amount, pointsGiven, periodCode, lastFirstRechargePeriod }) {
    const tier = findPricingTierByAmount(amount);
    if (!tier) {
        return { ok: false, msg: '無效的儲值金額' };
    }

    const orderAmount = Math.floor(Number(amount));
    const basePoints = Math.floor(Number(tier.points));
    const pts = Math.floor(Number(pointsGiven));
    if (!Number.isFinite(pts) || pts <= 0) {
        return { ok: false, msg: '無效的點數' };
    }

    const pcRaw = periodCode != null ? String(periodCode).trim() : '';
    const currentPeriod = getCurrentRechargePeriod();

    if (tier.testPack) {
        if (pcRaw) {
            return { ok: false, msg: '測試方案不可帶期別' };
        }
        if (pts !== basePoints) {
            return { ok: false, msg: '點數與方案不符' };
        }
        return { ok: true, amount: orderAmount, pointsGiven: basePoints, periodCode: null };
    }

    if (pcRaw !== currentPeriod) {
        return { ok: false, msg: '缺少或無效的儲值期別' };
    }

    const lastPeriod = lastFirstRechargePeriod != null ? String(lastFirstRechargePeriod).trim() : '';
    const qualifiesFirstBonus = lastPeriod !== currentPeriod;
    const expectedPoints = basePoints + (qualifiesFirstBonus ? Math.floor(basePoints * 0.1) : 0);

    if (pts !== expectedPoints) {
        return { ok: false, msg: '點數與方案不符' };
    }

    return {
        ok: true,
        amount: orderAmount,
        pointsGiven: expectedPoints,
        periodCode: currentPeriod,
    };
}

/** 綠界用：依點數套模板；itemName 可沿用前端傳入的 productName（非空時優先） */
function buildPayStrings(points, productNameFromClient) {
    const m = loadLegalManifest();
    const pts = points != null ? points : '';
    const templates = m.templates || {};
    const tradeDesc = interpolate(templates.tradeDesc, { points: pts });
    const trimmed = productNameFromClient != null ? String(productNameFromClient).trim() : '';
    const itemName = trimmed ? trimmed : interpolate(templates.productName, { points: pts });
    return { tradeDesc, itemName };
}

module.exports = {
    loadLegalManifest,
    interpolate,
    buildPayStrings,
    getCurrentRechargePeriod,
    findPricingTierByAmount,
    validateRechargeOrder,
};
