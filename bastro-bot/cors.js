'use strict';

const DEFAULT_CORS_ORIGINS = 'https://astro.branddecoderai.com,https://liff.line.me';

function parseCorsOrigins() {
    const raw = process.env.CORS_ALLOWED_ORIGINS || DEFAULT_CORS_ORIGINS;
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function isAllowedOrigin(origin, allowed) {
    if (!origin || origin === 'null') return false;
    if (allowed.includes(origin)) return true;
    try {
        const { protocol, hostname } = new URL(origin);
        if (protocol !== 'https:') return false;
        const host = hostname.toLowerCase();
        if (host === 'liff.line.me' || host.endsWith('.line.me')) return true;
        if (host === 'astro.branddecoderai.com' || host.endsWith('.branddecoderai.com')) return true;
        if (host.endsWith('.github.io')) return true;
    } catch (_) {
        return false;
    }
    return false;
}

/** 僅允許白名單 Origin；無 Origin 的請求（綠界、LINE webhook）不帶 ACAO */
function corsMiddleware(req, res, next) {
    const allowed = parseCorsOrigins();
    const origin = req.headers.origin;
    const ok = isAllowedOrigin(origin, allowed);

    if (origin && ok) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(ok ? 204 : 403).end();
    }

    next();
}

module.exports = { corsMiddleware, parseCorsOrigins, isAllowedOrigin };
