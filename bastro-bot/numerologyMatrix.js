'use strict';

const { MAX_NUMEROLOGY_INTERPRETATION_CHARS } = require('./aiReplyLimits');

const CORE_NUMBER_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 伺服器端隨機矩陣（每次請求不同；卓越數 11/22/33 含在池中） */
function rollNumerologyMatrix() {
    return {
        coreNumber: CORE_NUMBER_POOL[randomInt(0, CORE_NUMBER_POOL.length - 1)],
        luckySet: [randomInt(1, 99), randomInt(1, 99), randomInt(1, 99)],
        wealthSet: [randomInt(1, 99), randomInt(1, 99)],
        score: randomInt(0, 100),
    };
}

/** 第 3 層上下文：數字已定，模型只寫指引 */
function buildNumerologyMatrixBlock(matrix) {
    const m = matrix || {};
    return `

🚨【今日數字矩陣】（系統已隨機抽取，請勿更改下列數字；你只需撰寫大師指引）
- coreNumber: ${m.coreNumber}
- luckySet: [${(m.luckySet || []).join(', ')}]
- wealthSet: [${(m.wealthSet || []).join(', ')}]
- score: ${m.score}`;
}

function buildNumerologyInterpretationSuffix() {
    return `

🚨【系統輸出格式】(技術層；若有衝突以此為準)
- 僅輸出一個 JSON 物件，鍵名僅能是 interpretation，例如：{"interpretation":"..."}
- 勿輸出 coreNumber、luckySet、wealthSet、score（已由系統提供）
- 勿使用 json 代碼塊或 Markdown、勿前後贅語
- interpretation 不得超過 ${MAX_NUMEROLOGY_INTERPRETATION_CHARS} 字（含標點與換行）；此為上限，依分析需要撰寫，不必寫滿；請控制篇幅避免輸出被系統截斷
- 須將上方矩陣的核心／幸運／財富數字有機融入敘事（含二位數靈數相加解讀）`;
}

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

/** 模型輸出被 maxOutputTokens 截斷時，從未閉合的 JSON 擷取 interpretation */
function salvageInterpretationFromTruncated(rawText) {
    const s = String(rawText || '').trim();
    const markerMatch = s.match(/"interpretation"\s*:\s*"/i);
    if (!markerMatch) return null;

    const startIdx = s.indexOf(markerMatch[0]) + markerMatch[0].length;
    let out = '';
    for (let i = startIdx; i < s.length; i++) {
        const ch = s[i];
        if (ch === '\\' && i + 1 < s.length) {
            out += s[i + 1];
            i++;
            continue;
        }
        if (ch === '"') break;
        out += ch;
    }
    out = out.trim();
    return out.length >= 60 ? out : null;
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
            const obj = JSON.parse(candidate);
            if (obj && typeof obj.interpretation === 'string' && obj.interpretation.trim()) {
                return obj.interpretation.trim();
            }
        } catch (_) {
            /* next */
        }
    }
    return null;
}

/**
 * @param {string} rawText
 * @returns {string|null} interpretation
 */
function parseInterpretationFromAi(rawText) {
    const trimmed = String(rawText || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
    const extracted = extractJsonObjectString(trimmed);
    const candidates = [trimmed, extracted].filter(Boolean);

    for (const chunk of candidates) {
        try {
            const obj = JSON.parse(chunk);
            if (obj && typeof obj.interpretation === 'string' && obj.interpretation.trim()) {
                return obj.interpretation.trim();
            }
            if (obj && typeof obj === 'object' && !obj.interpretation) {
                const keys = Object.keys(obj);
                if (keys.length === 1 && typeof obj[keys[0]] === 'string') {
                    return String(obj[keys[0]]).trim();
                }
            }
        } catch (_) {
            const repaired = tryParseWithJsonRepairs(chunk);
            if (repaired) return repaired;
        }
    }

    const salvaged = salvageInterpretationFromTruncated(trimmed);
    if (salvaged) return salvaged;

    return null;
}

function normalizeNumerologyPayload(matrix, interpretation) {
    const m = matrix || rollNumerologyMatrix();
    const score = Number(m.score);
    return {
        coreNumber: m.coreNumber,
        luckySet: Array.isArray(m.luckySet) ? m.luckySet.slice(0, 3) : [],
        wealthSet: Array.isArray(m.wealthSet) ? m.wealthSet.slice(0, 2) : [],
        score: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 80,
        interpretation: String(interpretation || '').trim(),
    };
}

module.exports = {
    rollNumerologyMatrix,
    buildNumerologyMatrixBlock,
    buildNumerologyInterpretationSuffix,
    parseInterpretationFromAi,
    normalizeNumerologyPayload,
};
