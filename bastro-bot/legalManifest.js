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

module.exports = { loadLegalManifest, interpolate, buildPayStrings };
