'use strict';

/** LINE Flex／純文字不支援 HTML；將常見斷行標籤轉為換行 */
function stripHtmlForLineText(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '');
}

/**
 * 扣點服務 Flex 主文排版：保留 AI 既有換行；若幾乎無分段則依句讀切為 2～3 句一段（段間 \n\n）。
 * 塔羅／紫微／律動共用。
 * @param {string} text
 * @returns {string}
 */
function formatFlexBodyParagraphs(text) {
    let s = stripHtmlForLineText(text)
        .trim()
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n');
    if (!s) return s;

    s = s.replace(/\n{3,}/g, '\n\n');

    const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 3 || /\n\s*\n/.test(s)) {
        return lines.join('\n\n');
    }

    if (lines.length === 2) {
        return lines.join('\n\n');
    }

    const sentences = s
        .split(/(?<=[。！？!?])/)
        .map((part) => part.trim())
        .filter(Boolean);
    if (sentences.length <= 2) return s;

    const paragraphs = [];
    let buf = [];
    for (let i = 0; i < sentences.length; i++) {
        buf.push(sentences[i]);
        const joined = buf.join('');
        const isLast = i === sentences.length - 1;
        const shouldFlush =
            isLast || buf.length >= 3 || (buf.length >= 2 && joined.length >= 90);
        if (shouldFlush) {
            paragraphs.push(joined);
            buf = [];
        }
    }
    if (buf.length) paragraphs.push(buf.join(''));

    return paragraphs.join('\n\n');
}

module.exports = {
    stripHtmlForLineText,
    formatFlexBodyParagraphs,
};
