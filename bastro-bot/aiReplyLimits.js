'use strict';

/**
 * 扣點服務 AI 輸出長度：與 LINE Flex 單則 bubble 大小、分享用 action.uri（1000）對齊。
 * 模型仍可能略超，故提示詞與 clamp 必須同數字。
 */

/** 塔羅／紫微「【解析】」正文（字元數 ≒ JS .length，含標點換行） */
const MAX_TAROT_ZIWEI_BODY_CHARS = 900;

/** 律動能量 JSON 內 interpretation */
const MAX_NUMEROLOGY_INTERPRETATION_CHARS = 260;

/** Flex 單一 type:text 保守上限（官方常見 2000；整包 bubble 仍不宜過大） */
const MAX_FLEX_SINGLE_TEXT_CHARS = 1200;

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
