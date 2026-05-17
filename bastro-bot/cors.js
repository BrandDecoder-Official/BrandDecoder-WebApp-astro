'use strict';

const DEFAULT_CORS_ORIGINS = 'https://astro.branddecoderai.com';

function parseCorsOrigins() {
    const raw = process.env.CORS_ALLOWED_ORIGINS || DEFAULT_CORS_ORIGINS;
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/** 僅允許白名單 Origin；無 Origin 的請求（綠界、LINE webhook）不帶 ACAO */
function corsMiddleware(req, res, next) {
    const allowed = parseCorsOrigins();
    const origin = req.headers.origin;

    if (origin && allowed.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(origin && allowed.includes(origin) ? 204 : 403).end();
    }

    next();
}

module.exports = { corsMiddleware, parseCorsOrigins };
