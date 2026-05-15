'use strict';

const { MAX_NUMEROLOGY_INTERPRETATION_CHARS, clampTextChars } = require('./aiReplyLimits');

const CORE_MASTER_NUMBERS = new Set([11, 22, 33]);

function extractJsonObjectString(text) {
    const s = String(text || '').trim();
    const start = s.indexOf('{');
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inString) {
            if (escape) {
                escape = false;
            } else if (ch === '\\') {
                escape = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') depth++;
        if (ch === '}') {
            depth--;
            if (depth === 0) return s.slice(start, i + 1);
        }
    }
    return null;
}

function tryParseWithJsonRepairs(chunk) {
    if (!chunk || !chunk.startsWith('{')) return null;
    const t = chunk.trimEnd();
    const attempts = [
        t + '}',
        t.replace(/,\s*$/, '') + '}',
        t + '"}',
        t.replace(/,\s*$/, '') + '"}',
    ];
    for (const candidate of attempts) {
        try {
            return JSON.parse(candidate);
        } catch (_) {
            /* next */
        }
    }
    return null;
}

function parseJsonObjectFromAi(rawText) {
    const trimmed = String(rawText || '')
        .trim()
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
    const extracted = extractJsonObjectString(trimmed);
    const candidates = [trimmed, extracted].filter(Boolean);

    for (const chunk of candidates) {
        try {
            const obj = JSON.parse(chunk);
            if (obj && typeof obj === 'object') return obj;
        } catch (_) {
            const repaired = tryParseWithJsonRepairs(chunk);
            if (repaired && typeof repaired === 'object') return repaired;
        }
    }
    return null;
}

function toIntInRange(value, min, max) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return n;
}

function isValidCoreNumber(n) {
    if (!Number.isInteger(n)) return false;
    if (n >= 1 && n <= 9) return true;
    return CORE_MASTER_NUMBERS.has(n);
}

function normalizeIntegerArray(raw, length, min, max) {
    if (!Array.isArray(raw) || raw.length < length) return null;
    const out = [];
    for (let i = 0; i < length; i++) {
        const n = toIntInRange(raw[i], min, max);
        if (n == null) return null;
        out.push(n);
    }
    return out;
}

/**
 * 解析 AI 完整律動 JSON；失敗回傳 null（呼叫端不扣點、不使用假資料）。
 * @param {string} rawText
 * @returns {{ coreNumber: number, luckySet: number[], wealthSet: number[], score: number, interpretation: string }|null}
 */
function parseNumerologyFromAi(rawText) {
    const obj = parseJsonObjectFromAi(rawText);
    if (!obj || typeof obj !== 'object') return null;

    const coreNumber = toIntInRange(obj.coreNumber, 1, 33);
    if (coreNumber == null || !isValidCoreNumber(coreNumber)) return null;

    const luckySet = normalizeIntegerArray(obj.luckySet, 3, 1, 99);
    if (!luckySet) return null;

    const wealthSet = normalizeIntegerArray(obj.wealthSet, 2, 1, 99);
    if (!wealthSet) return null;

    const score = toIntInRange(obj.score, 0, 100);
    if (score == null) return null;

    let interpretation = obj.interpretation != null ? String(obj.interpretation).trim() : '';
    if (!interpretation && typeof obj === 'object') {
        const keys = Object.keys(obj).filter((k) => k !== 'coreNumber' && k !== 'luckySet' && k !== 'wealthSet' && k !== 'score');
        if (keys.length === 1 && typeof obj[keys[0]] === 'string') {
            interpretation = String(obj[keys[0]]).trim();
        }
    }
    if (interpretation.length < 60) return null;

    return {
        coreNumber,
        luckySet,
        wealthSet,
        score,
        interpretation: clampTextChars(interpretation, MAX_NUMEROLOGY_INTERPRETATION_CHARS),
    };
}

module.exports = {
    parseNumerologyFromAi,
};
