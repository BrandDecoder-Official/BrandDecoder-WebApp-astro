'use strict';

/** LINE chat loading：前段（最後一段前）須為 5 的倍數，上限 60；最後一段保底 60 */
const LINE_LOADING_EARLY_SECONDS = 10;
const LINE_LOADING_FINAL_SECONDS = 60;
/** 最後一段安撫＋loading(60) 觸發時機（ms）；前段安撫須早於此 */
const LINE_LOADING_FINAL_AT_MS = 10000;

function clampLoadingSeconds(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n)) return LINE_LOADING_EARLY_SECONDS;
    return Math.min(60, Math.max(5, Math.round(n / 5) * 5));
}

async function startLineChatLoading(userId, loadingSeconds = LINE_LOADING_EARLY_SECONDS) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token || !userId) return;
    await fetch('https://api.line.me/v2/bot/chat/loading/start', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            chatId: userId,
            loadingSeconds: clampLoadingSeconds(loadingSeconds),
        }),
    }).catch(() => {});
}

module.exports = {
    LINE_LOADING_EARLY_SECONDS,
    LINE_LOADING_FINAL_SECONDS,
    LINE_LOADING_FINAL_AT_MS,
    startLineChatLoading,
};
