'use strict';

/**
 * 扣點服務 AI 輸出長度上限（非必須寫滿）：與 Prompt、aiPromptEnvelope、clamp 單一來源。
 * 字元數 ≒ JS .length（含標點、換行）；LINE 單一 text 元件理論約 2000。
 * 分享按鈕 action.uri 另限 1000（見 lineOaShare.js），與主文上限無關。
 */

/** 塔羅／紫微「【解析】」正文上限（寫入日誌與網頁顯示，設為10000以實質達到完全不截斷，防止客訴） */
const MAX_TAROT_ZIWEI_BODY_CHARS = 10000;

/** 律動能量 JSON 內 interpretation 上限 */
const MAX_NUMEROLOGY_INTERPRETATION_CHARS = 800;

/** Flex 主文 type:text 上限（安全字元數以防 LINE 渲染出錯） */
const MAX_FLEX_SINGLE_TEXT_CHARS = 1500;

/**
 * Gemini 單次「輸出」token 上限（硬切，與 Prompt 字數、clamp 不同道）。
 * 扣點服務寧鬆勿緊，避免 MAX_TOKENS 半路截斷；實際篇幅仍由 Prompt／clamp 控制。
 */
const MAX_AI_OUTPUT_TOKENS = 4096;

/**
 * @param {string} str
 * @param {number} max
 * @param {{ addEllipsis?: boolean }} [opts]
 */
function clampTextChars(str, max, opts = {}) {
    const addEllipsis = opts.addEllipsis !== false;
    const s = String(str == null ? '' : str).trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max);
    return addEllipsis ? `${cut}…` : cut;
}

module.exports = {
    MAX_TAROT_ZIWEI_BODY_CHARS,
    MAX_NUMEROLOGY_INTERPRETATION_CHARS,
    MAX_FLEX_SINGLE_TEXT_CHARS,
    MAX_AI_OUTPUT_TOKENS,
    clampTextChars,
};
