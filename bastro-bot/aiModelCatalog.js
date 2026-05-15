'use strict';

/**
 * 大腦釘選版次（程式庫內固定標記；每次調整本檔選項或 `aiSettingsDefaults.js` 預設模型時請递增，便於追蹤與定期覆核）
 * @see aiSettingsDefaults.js
 */
const AI_BRAIN_RELEASE = '2026.05.2';
/** 最近一次人工覆核日期（ISO 8601） */
const AI_BRAIN_LAST_REVIEWED = '2026-05-14';
/** 覆核節奏說明（給後台與 API 消費端顯示） */
const AI_BRAIN_REVIEW_POLICY =
    '建議每季或 Google 發布模型退役／更名時，覆核 aiModelCatalog.js、aiSettingsDefaults.js，並在後台重存 ai_settings。';

/**
 * 後台「運算模型」下拉選單 — **唯一選項源**
 * API：`GET /api/public/ai-model-options`
 *
 * 汰換／新增模型時請核對（避免後台選不到、或與預設脫鉤）──
 * 0. 递增本檔頂部 `AI_BRAIN_RELEASE`，並更新 `AI_BRAIN_LAST_REVIEWED`。
 * 1. 在此檔 `AI_MODEL_OPTIONS` 新增 `{ value, label }`（`value` 須與 Google Generative Language API 當期 ID 一致）。
 * 2. 若該模組要改「Firestore 尚無資料時的後備」，同步改 `aiSettingsDefaults.js` 的 `DEFAULT_AI_SETTINGS.*.model`。
 * 3. 已上線環境仍以 **Firestore `system_config/ai_settings`** 為準；此清單只影響「後台可選」與「顯示名稱」。
 * 4. `aiSettingsDefaults.js` 內每個 `*.model` 的 value，**原則上都應出現在本清單**（否則後台只能看到「資料庫既有」自帶選項）。
 * 5. 生命週期備忘可續寫在 `admin_ai.js` 檔頭註解；日期以 Google 官方公告為準。
 * 6. 本清單**僅收錄 Gemini 3 系以上**（2.5 及更早不列；若 DB 仍為舊 ID，後台會出現「（資料庫既有）」選項，請改存 3.x）。
 *
 * 目前 `DEFAULT_AI_SETTINGS` 用到的 model（請維持本表可選到）：
 * - daily → gemini-3.1-flash-lite
 * - tarot → gemini-3.1-flash-preview
 * - ziwei → gemini-3.1-pro-preview
 * - numerology → gemini-3.1-flash-preview
 * - face → gemini-3.1-flash-image-preview
 */
const AI_MODEL_OPTIONS = Object.freeze([
    // --- Gemini 3.1／3（建議主力）---
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite（正式・極輕量）' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview（即將停用）' },
    { value: 'gemini-3.1-flash-preview', label: 'Gemini 3.1 Flash Preview（標準）' },
    { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview（多模態／面相等）' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview（深度）' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview（前代標準）' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview（前代深度·汰換中）' },
    { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview（前代多模態）' },
]);

module.exports = {
    AI_MODEL_OPTIONS,
    AI_BRAIN_RELEASE,
    AI_BRAIN_LAST_REVIEWED,
    AI_BRAIN_REVIEW_POLICY,
};
