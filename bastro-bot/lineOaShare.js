'use strict';

/**
 * LINE 官方帳分享：Flex footer 開啟「分享專用 LIFF」→ shareTargetPicker 傳全文。
 * OA 訊息無法長按轉傳，故不用 line.me/R/share?text=…（正文僅約 50 字）。
 * `action.uri` 不得超過 1000 字元；分享 LIFF 僅帶短 token。
 */

/** LINE Messaging API：`action.uri` 上限 1000 字元（逾長 push 會 400） */
const LINE_SHARE_URI_MAX_LENGTH = 1000;

function getShareLiffId() {
    return (process.env.SHARE_LIFF_ID || '').trim();
}

/** Flex 按鈕：開啟 /share/ LIFF 頁（須設定 SHARE_LIFF_ID 環境變數） */
function buildShareLiffUri(token) {
    const liffId = getShareLiffId();
    const t = String(token || '').trim();
    if (!liffId || !t) return null;
    const uri = `https://liff.line.me/${liffId}?token=${encodeURIComponent(t)}`;
    return uri.length <= LINE_SHARE_URI_MAX_LENGTH ? uri : null;
}

/** 盡量短，為分享正文保留 URI 編碼後空間 */
const LINE_OA_INVITE_FOOTER = '\n\n命運解碼室 OA\nhttps://lin.ee/yObB3Ga';

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

const { stripHtmlForLineText } = require('./lineFlexTextFormat');

/** Flex 內文：移除 Markdown 星號、HTML 斷行等，避免顯示異常 */
function sanitizeForFlexText(str) {
    return stripHtmlForLineText(String(str == null ? '' : str)).replace(/\*\*/g, '');
}

/** Flex footer：分享給好友（開啟 share LIFF）；uri 無效時略過按鈕 */
function lineFlexShareButton(shareUri, options = {}) {
    if (!shareUri || shareUri.length > LINE_SHARE_URI_MAX_LENGTH) return null;
    const color = options.color || '#7B1FA2';
    return {
        type: 'button',
        style: 'primary',
        color,
        height: 'sm',
        action: { type: 'uri', label: '📤 分享給好友', uri: shareUri },
    };
}

function appendShareButtonToFooterContents(contents, shareUri, options = {}) {
    const btn = lineFlexShareButton(shareUri, options);
    if (btn) contents.push(btn);
    return contents;
}

module.exports = {
    LINE_OA_INVITE_FOOTER,
    LINE_SHARE_URI_MAX_LENGTH,
    formatTaipeiDateTimeLine,
    buildShareLiffUri,
    getShareLiffId,
    lineFlexShareButton,
    appendShareButtonToFooterContents,
    sanitizeForFlexText,
};
