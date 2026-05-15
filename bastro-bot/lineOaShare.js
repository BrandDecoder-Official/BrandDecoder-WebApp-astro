'use strict';

/**
 * LINE 官方帳「分享至 LINE」+ 文末 OA 邀請連結（扣點服務 Flex 共用）。
 * 每日一抽等非扣點流程請勿使用。
 * 未來面相等扣點服務：組好 shareHead（無暱稱、無靈力）+ 全文 body 後呼叫 buildLineShareUriFromHeadAndBody，footer 加上 lineFlexShareButton(uri)。`action.uri` 不得超過 1000 字元。
 */

const LINE_SHARE_TEXT_BASE = 'https://line.me/R/share?text=';
/** LINE Messaging API：`action.uri` 上限 1000 字元（逾長 push 會 400） */
const LINE_SHARE_URI_MAX_LENGTH = 1000;
const LINE_SHARE_TRUNC_SUFFIX = '\n…(續見官方帳號對話)';

const LINE_OA_INVITE_FOOTER =
    '\n\n加入「命運解碼室」LINE OA（點擊加好友）：\nhttps://lin.ee/yObB3Ga';

function formatTaipeiDateTimeLine(date) {
    return date.toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

/**
 * @param {string} head 已含標題、解盤時間、服務參數、分隔線（至正文前）
 * @param {string} body 正文全文（分享用，可為解析純文字）
 */
function buildLineShareUriFromHeadAndBody(head, body) {
    const bodyTrim = String(body || '').trim();
    const postBody = `\n────────${LINE_OA_INVITE_FOOTER}`;
    const plainFull = `${head}${bodyTrim}${postBody}`;
    const fullUri = LINE_SHARE_TEXT_BASE + encodeURIComponent(plainFull);
    if (fullUri.length <= LINE_SHARE_URI_MAX_LENGTH) return fullUri;

    let lo = 0;
    let hi = bodyTrim.length;
    let best = 0;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const slice = bodyTrim.slice(0, mid);
        const truncated = mid < bodyTrim.length;
        const candidate = `${head}${slice}${truncated ? LINE_SHARE_TRUNC_SUFFIX : ''}${postBody}`;
        const uri = LINE_SHARE_TEXT_BASE + encodeURIComponent(candidate);
        if (uri.length <= LINE_SHARE_URI_MAX_LENGTH) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    const slice = bodyTrim.slice(0, best);
    const truncated = best < bodyTrim.length;
    const candidate = `${head}${slice}${truncated ? LINE_SHARE_TRUNC_SUFFIX : ''}${postBody}`;
    return LINE_SHARE_TEXT_BASE + encodeURIComponent(candidate);
}

/** Flex footer / body 底部共用按鈕 */
function lineFlexShareButton(shareUri, options = {}) {
    const color = options.color || '#7B1FA2';
    return {
        type: 'button',
        style: 'primary',
        color,
        height: 'sm',
        action: { type: 'uri', label: '📤 分享至 LINE', uri: shareUri },
    };
}

module.exports = {
    LINE_OA_INVITE_FOOTER,
    LINE_SHARE_URI_MAX_LENGTH,
    formatTaipeiDateTimeLine,
    buildLineShareUriFromHeadAndBody,
    lineFlexShareButton,
};
