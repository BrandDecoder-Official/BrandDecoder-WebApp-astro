'use strict';

/**
 * 扣點服務 AI 輸出長度上限（非必須寫滿）：與 Prompt、aiPromptEnvelope、clamp 單一來源。
 * 字元數 ≒ JS .length（含標點、換行）；LINE 單一 text 元件理論約 2000。
 * 分享按鈕 action.uri 另限 1000（見 lineOaShare.js），與主文上限無關。
 */

/** 塔羅／紫微「【解析】」正文上限 */
const MAX_TAROT_ZIWEI_BODY_CHARS = 1200;

/** 律動能量 JSON 內 interpretation 上限 */
const MAX_NUMEROLOGY_INTERPRETATION_CHARS = 800;

/** Flex 主文 type:text 上限（與塔羅／紫微正文對齊） */
const MAX_FLEX_SINGLE_TEXT_CHARS = MAX_TAROT_ZIWEI_BODY_CHARS;

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
    clampTextChars,
};
