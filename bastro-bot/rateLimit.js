'use strict';

const rateLimit = require('express-rate-limit');

function clientKey(req) {
    if (req.user && req.user.userId) {
        return `u:${req.user.userId}`;
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return `ip:${ip}`;
}

function rateLimitJson(maxPerWindow, windowMs = 60 * 1000) {
    return rateLimit({
        windowMs,
        max: maxPerWindow,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: clientKey,
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                msg: '請求過於頻繁，請稍後再試',
                message: '請求過於頻繁，請稍後再試',
                status: 'error',
            });
        },
    });
}

/** 塔羅票根、紫微、律動等 AI 解碼 */
const aiDecodeLimiter = rateLimitJson(8);

/** 儲值建單 */
const payRequestLimiter = rateLimitJson(10);

/** 漏斗埋點 */
const logStageLimiter = rateLimitJson(40);

/** 公開扣點設定（依 IP） */
const publicConfigLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
    handler: (req, res) => {
        res.status(429).json({ success: false, msg: '請求過於頻繁，請稍後再試' });
    },
});

module.exports = {
    aiDecodeLimiter,
    payRequestLimiter,
    logStageLimiter,
    publicConfigLimiter,
};
