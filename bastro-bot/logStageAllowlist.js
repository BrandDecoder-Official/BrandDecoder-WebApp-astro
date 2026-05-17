'use strict';

/** LIFF 漏斗埋點：僅允許已知 type / stage（不含 Finish，不寫入 users/history） */
const ALLOWED_LOG_TYPES = new Set(['tarot', 'ziwei']);

const ALLOWED_LOG_STAGES = new Set([
    'Stage 1: Page View',
    'Stage 2: Ticket Created',
]);

const MAX_STAGE_LEN = 80;

function isAllowedLogStage(type, stage) {
    const t = type != null ? String(type).trim() : '';
    const s = stage != null ? String(stage).trim() : '';
    if (!ALLOWED_LOG_TYPES.has(t)) return false;
    if (!ALLOWED_LOG_STAGES.has(s) || s.length > MAX_STAGE_LEN) return false;
    return true;
}

module.exports = { ALLOWED_LOG_TYPES, ALLOWED_LOG_STAGES, isAllowedLogStage };
