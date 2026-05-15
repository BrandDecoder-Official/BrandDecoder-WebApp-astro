'use strict';

/**
 * 大腦釘選版次（程式庫內固定標記；每次調整本檔選項或 `aiSettingsDefaults.js` 預設模型時請递增，便於追蹤與定期覆核）
 * @see aiSettingsDefaults.js
 */
const AI_BRAIN_RELEASE = '2026.05.3';
/** 最近一次人工覆核日期（ISO 8601） */
const AI_BRAIN_LAST_REVIEWED = '2026-05-15';
/** 覆核節奏說明（給後台與 API 消費端顯示） */
const AI_BRAIN_REVIEW_POLICY =
    '建議每季或 Google 發布模型退役／更名時，覆核 aiModelCatalog.js、aiSettingsDefaults.js，並在後台重存 ai_settings。';

/**
 * 後台「運算模型」下拉選單 — **唯一選項源**
 * API：`GET /api/public/ai-model-options`
 *
 * 本陣列**只收錄內部對照表「Gemini 3 模型」已列出的型號**，避免後台選到未公告／已下線 ID。
 * 若 Google 新增型號：先更新對照表與官方文件，再在此加入 `{ value, label }`，並遞增 `AI_BRAIN_RELEASE`。
 *
 * 汰換／新增時請核對：
 * 0. 遞增 `AI_BRAIN_RELEASE`，更新 `AI_BRAIN_LAST_REVIEWED`。
 * 1. 同步 `aiSettingsDefaults.js` 內 `DEFAULT_AI_SETTINGS.*.model`（預設須為本表其中一個 `value`）。
 * 2. 上線後仍以 Firestore `ai_settings` 為準；若 DB 為舊 ID，後台會顯示「（資料庫既有）」請改選上表 ID 後儲存。
 *
 * 對照表摘要（與 `DEFAULT_AI_SETTINGS` 對齊）：
 * - daily → gemini-3.1-flash-lite
 * - tarot / numerology → gemini-3-flash-preview（表內文字 Flash 預覽）
 * - ziwei → gemini-3.1-pro-preview
 * - face → gemini-3.1-flash-image-preview
 *
 * 已自本表移除（勿再選）：`gemini-3-pro-preview`（約 2026-03-09 停用，請改 `gemini-3.1-pro-preview`）；
 * 未列入官方對照表者不放入選單（例如未公告之 `gemini-3.1-flash-preview` 文字版）。
 */
const AI_MODEL_OPTIONS = Object.freeze([
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite（正式版）' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview（預覽·將停用）' },
    { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview（多模態）' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview（深度）' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview（標準文字）' },
    { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview（多模態）' },
]);

module.exports = {
    AI_MODEL_OPTIONS,
    AI_BRAIN_RELEASE,
    AI_BRAIN_LAST_REVIEWED,
    AI_BRAIN_REVIEW_POLICY,
};
