'use strict';

/**
 * 後台「運算模型」下拉選單的唯一選項源（供 GET /api/public/ai-model-options）。
 * 新增／汰換模型時：同步檢查 aiSettingsDefaults.js 內預設 ID 是否仍有效。
 */
const AI_MODEL_OPTIONS = Object.freeze([
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite（正式・極輕量）' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview（即將停用）' },
    { value: 'gemini-3.1-flash-preview', label: 'Gemini 3.1 Flash Preview（標準）' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview（前代標準）' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview（深度）' },
]);

module.exports = { AI_MODEL_OPTIONS };
