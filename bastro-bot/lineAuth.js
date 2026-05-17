'use strict';

const fetch = require('node-fetch');

/** LINE LIFF access token → req.user（含 userId、displayName） */
async function verifyLineToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '結界阻擋：未提供有效通行證' });
    }
    const token = authHeader.split(' ')[1];

    try {
        const response = await fetch('https://api.line.me/v2/profile', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Token 無效或已過期');

        const profile = await response.json();
        req.user = profile;
        next();
    } catch (error) {
        console.error('Token 驗證失敗:', error.message);
        res.status(401).json({ success: false, message: '結界阻擋：通行證驗證失敗' });
    }
}

module.exports = { verifyLineToken };
