'use strict';

/**
 * AI 模型與扣點：程式庫內「唯一預設源」。
 *
 * - Firestore `system_config/ai_settings` 為上線後權威資料；欄位有值時一律覆蓋此處同名字段。
 * - 文件不存在、或某子鍵（如 tarot）尚未寫入時，由此處補齊，避免 tarot / ziwei / numerology / admin 各寫一套。
 * - Firestore 連線失敗：各 API 應回 500，不得把此物件當成「已從 DB 讀到」回傳。
 * - 後台「模型下拉」顯示名稱／可選 ID 另見 aiModelCatalog.js（GET /api/public/ai-model-options）。
 * - 變更預設 model 時：該 `value` 須列在 `AI_MODEL_OPTIONS`，否則後台不易選到一致 ID；並請递增 `aiModelCatalog.js` 的 AI_BRAIN_RELEASE。
 * - 後台 `prompt`（星語塔羅／星軌紫微／律動能量）為人設與報告結構；執行時另見 aiPromptEnvelope.js 追加【分數】/【解析】或 JSON 技術外層。
 */
const DEFAULT_AI_SETTINGS = Object.freeze({
    daily: { model: 'gemini-3.1-flash-lite', cost: 0 },
    tarot: { model: 'gemini-3-flash-preview', cost: 15, prompt: '' },
    ziwei: { model: 'gemini-3.1-pro-preview', cost: 50, prompt: '' },
    numerology: {
        model: 'gemini-3-flash-preview',
        cost: 10,
        prompt: '# Role: 律動能量大師\n你是一位精通生命靈數與宇宙頻率的導師。',
    },
    face: { model: 'gemini-3.1-flash-image-preview', cost: 20, prompt: '' },
});

function mergeAiSettingsFromDoc(configDoc) {
    const raw = configDoc && configDoc.exists ? configDoc.data() || {} : {};
    const out = {};
    for (const key of Object.keys(DEFAULT_AI_SETTINGS)) {
        const base = DEFAULT_AI_SETTINGS[key];
        const patch = raw[key] && typeof raw[key] === 'object' ? raw[key] : {};
        out[key] = { ...base, ...patch };
    }
    for (const key of Object.keys(raw)) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_AI_SETTINGS, key)) {
            out[key] = raw[key];
        }
    }
    return out;
}

/** 單一模組（tarot / ziwei / numerology …）合併後設定 */
function mergeModuleKey(moduleKey, configDoc) {
    const raw = configDoc && configDoc.exists ? configDoc.data() || {} : {};
    const base = DEFAULT_AI_SETTINGS[moduleKey] || {};
    const patch = raw[moduleKey] && typeof raw[moduleKey] === 'object' ? raw[moduleKey] : {};
    return { ...base, ...patch };
}

module.exports = {
    DEFAULT_AI_SETTINGS,
    mergeAiSettingsFromDoc,
    mergeModuleKey,
};
