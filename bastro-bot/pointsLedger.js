'use strict';

const { FieldValue } = require('firebase-admin/firestore');

class InsufficientPointsError extends Error {
    constructor(cost, balance) {
        super('靈力不足');
        this.name = 'InsufficientPointsError';
        this.cost = cost;
        this.balance = balance;
    }
}

/**
 * 原子扣點：餘額不足則拋 InsufficientPointsError
 * @returns {Promise<number>} 扣點後餘額
 */
async function deductPointsTransaction(db, userRef, cost, extraUpdates = {}) {
    const n = Math.floor(Number(cost));
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error('invalid cost');
    }

    return db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) {
            throw new InsufficientPointsError(n, 0);
        }
        const pts = Math.floor(Number(doc.data().points)) || 0;
        if (pts < n) {
            throw new InsufficientPointsError(n, pts);
        }
        const next = pts - n;
        t.update(userRef, { points: next, ...extraUpdates });
        return next;
    });
}

async function refundPoints(userRef, amount) {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) return;
    await userRef.update({ points: FieldValue.increment(n) });
}

module.exports = {
    InsufficientPointsError,
    deductPointsTransaction,
    refundPoints,
};
