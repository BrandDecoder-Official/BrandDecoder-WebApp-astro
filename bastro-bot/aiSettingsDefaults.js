'use strict';

const {
    TAROT_PROMPT_DEFAULT,
    ZIWEI_PROMPT_DEFAULT,
    NUMEROLOGY_PROMPT_DEFAULT,
} = require('./aiPromptDefaults');

/**
 * AI 設定預設（模型、扣點、人設 Prompt）。
 *
 * ## Prompt 三層（由下到上送進模型）
 * 1. **人設與報告結構** → `prompt` 欄位
 *    - 優先：Firestore `system_config/ai_settings`（後台 admin 可隨時改）
 *    - 備援：`aiPromptDefaults.js`（本 repo 預設，新環境或後台留空時使用）
 * 2. **技術外層** → `aiPromptEnvelope.js`（【分數】/【解析】或 JSON、字數上限；隨部署調整）
 * 3. **當次占卜上下文** → tarot.js / ziwei.js / numerology.js（牌陣、生辰、探詢領域等）
 *
 * ## 建議怎麼改 Prompt
 * - 改人設、語氣、四段標題、禁語：後台編輯 **或** 改 `aiPromptDefaults.js` 後部署
 * - 改 LINE 字數、輸出格式、分享 URI：改 `aiReplyLimits.js` + `aiPromptEnvelope.js`
 * - 改模型 ID、扣點：後台 **或** 本檔 `DEFAULT_AI_SETTINGS`
 *
 * - Firestore 連線失敗：各 API 應回 500，不得把此物件當成「已從 DB 讀到」回傳。
 * - 模型下拉：aiModelCatalog.js（GET /api/public/ai-model-options）
 */

/** 後台 prompt 為空字串時保留程式預設，避免誤蓋成人設消失 */
function mergePromptField(basePrompt, patchPrompt) {
    const trimmed = patchPrompt != null ? String(patchPrompt).trim() : '';
    return trimmed ? trimmed : basePrompt;
}

function mergeModuleSettings(base, patch) {
    const merged = { ...base, ...patch };
    if (Object.prototype.hasOwnProperty.call(base, 'prompt') || Object.prototype.hasOwnProperty.call(patch, 'prompt')) {
        merged.prompt = mergePromptField(base.prompt, patch.prompt);
    }
    return merged;
}

const DEFAULT_AI_SETTINGS = Object.freeze({
    daily: { model: 'gemini-3.1-flash-lite', cost: 0 },
    tarot: { model: 'gemini-3-flash-preview', cost: 15, prompt: TAROT_PROMPT_DEFAULT },
    ziwei: { model: 'gemini-3.1-pro-preview', cost: 50, prompt: ZIWEI_PROMPT_DEFAULT },
    numerology: {
        model: 'gemini-3-flash-preview',
        cost: 10,
        prompt: NUMEROLOGY_PROMPT_DEFAULT,
    },
    face: { model: 'gemini-3.1-flash-image-preview', cost: 20, prompt: '' },
});

function mergeAiSettingsFromDoc(configDoc) {
    const raw = configDoc && configDoc.exists ? configDoc.data() || {} : {};
    const out = {};
    for (const key of Object.keys(DEFAULT_AI_SETTINGS)) {
        const base = DEFAULT_AI_SETTINGS[key];
        const patch = raw[key] && typeof raw[key] === 'object' ? raw[key] : {};
        out[key] = mergeModuleSettings(base, patch);
    }
    for (const key of Object.keys(raw)) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_AI_SETTINGS, key)) {
            out[key] = raw[key];
        }
    }
    return out;
}

function mergeModuleKey(moduleKey, configDoc) {
    const raw = configDoc && configDoc.exists ? configDoc.data() || {} : {};
    const base = DEFAULT_AI_SETTINGS[moduleKey] || {};
    const patch = raw[moduleKey] && typeof raw[moduleKey] === 'object' ? raw[moduleKey] : {};
    return mergeModuleSettings(base, patch);
}

module.exports = {
    DEFAULT_AI_SETTINGS,
    mergeAiSettingsFromDoc,
    mergeModuleKey,
    mergePromptField,
};
