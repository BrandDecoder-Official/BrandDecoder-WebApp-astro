'use strict';

const { AI_SETTINGS } = require('./aiConfig');

/**
 * AI 設定核心（模型、扣點、人設 Prompt）。
 *
 * 基於「安全性優先」，我們已停用動態的 Firebase DB 管理模式。
 * 所有 AI 參數已全部移至 aiConfig.js。
 */

const DEFAULT_AI_SETTINGS = AI_SETTINGS;

function mergePromptField(basePrompt, patchPrompt) {
    // 雖然不再 merge DB，但為求相容保留此函數
    const trimmed = patchPrompt != null ? String(patchPrompt).trim() : '';
    return trimmed ? trimmed : basePrompt;
}

function mergeAiSettingsFromDoc(configDoc) {
    // 直接回傳本地最新的 AI 配置，忽略 configDoc
    return AI_SETTINGS;
}

function mergeModuleKey(moduleKey, configDoc) {
    // 直接回傳本地對應模組的配置，忽略 configDoc
    return AI_SETTINGS[moduleKey] || {};
}

/** 公開 API：僅回傳扣點，不含 prompt / model */
function toPublicAiConfig(merged) {
    const out = {};
    for (const key of Object.keys(AI_SETTINGS)) {
        const mod = AI_SETTINGS[key];
        if (mod && typeof mod === 'object' && mod.cost != null) {
            out[key] = { cost: mod.cost };
        }
    }
    return out;
}

module.exports = {
    DEFAULT_AI_SETTINGS,
    mergeAiSettingsFromDoc,
    mergeModuleKey,
    mergePromptField,
    toPublicAiConfig,
};
