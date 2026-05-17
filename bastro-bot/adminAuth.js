'use strict';

const { getAuth } = require('firebase-admin/auth');

function parseAdminEmails() {
    return (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}

/** Firebase ID token + ADMIN_EMAILS 白名單 */
async function verifyAdminToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, msg: '未提供 Admin 通行證' });
    }
    const token = authHeader.split(' ')[1];

    try {
        const decodedToken = await getAuth().verifyIdToken(token);
        const userEmail = (decodedToken.email || '').trim().toLowerCase();
        const allowedAdmins = parseAdminEmails();

        if (!userEmail || !allowedAdmins.includes(userEmail)) {
            console.warn(`⚠️ 嘗試越權存取 Admin 後台: ${decodedToken.email || '(no email)'}`);
            return res.status(403).json({ success: false, msg: '權限不足，您不是超級管理員' });
        }

        req.admin = decodedToken;
        next();
    } catch (error) {
        console.error('Admin Token 驗證失敗:', error.message);
        res.status(401).json({ success: false, msg: 'Admin 通行證無效或已過期' });
    }
}

module.exports = { verifyAdminToken, parseAdminEmails };
