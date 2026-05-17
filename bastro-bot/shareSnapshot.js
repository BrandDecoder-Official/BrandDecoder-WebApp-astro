'use strict';

const crypto = require('crypto');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { LINE_OA_INVITE_FOOTER } = require('./lineOaShare');

const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

function formatSharePlainText(head, body) {
    const h = String(head || '').trim();
    const b = String(body || '').trim();
    const parts = [];
    if (h) parts.push(h);
    if (b) parts.push(b);
    parts.push(`──${LINE_OA_INVITE_FOOTER}`);
    return parts.join('\n\n');
}

async function createShareSnapshot(db, { type, head, body, userId }) {
    const token = crypto.randomBytes(18).toString('base64url');
    const expiresAt = Timestamp.fromMillis(Date.now() + SHARE_TTL_MS);
    await db.collection('share_snapshots').doc(token).set({
        type: String(type || 'unknown'),
        head: String(head || ''),
        body: String(body || ''),
        userId: userId || null,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
    });
    return token;
}

async function getShareSnapshot(db, token) {
    const id = String(token || '').trim();
    if (!TOKEN_RE.test(id)) return null;

    const doc = await db.collection('share_snapshots').doc(id).get();
    if (!doc.exists) return null;

    const data = doc.data();
    const exp = data.expiresAt;
    if (exp && typeof exp.toMillis === 'function' && exp.toMillis() < Date.now()) {
        return null;
    }

    return {
        type: data.type,
        head: data.head,
        body: data.body,
        plainText: formatSharePlainText(data.head, data.body),
    };
}

module.exports = {
    createShareSnapshot,
    getShareSnapshot,
    formatSharePlainText,
};
