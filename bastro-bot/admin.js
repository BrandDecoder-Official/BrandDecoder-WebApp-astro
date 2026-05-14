// ==========================================
// BrandDecoder - Super Admin 專屬模組 (admin.js)
// ==========================================
const express = require('express');
const router = express.Router();
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore('astro-bot-db');

// 🛡️ 門神：驗證 Firebase Google 登入的 Token 與超級管理員白名單
async function verifyAdminToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, msg: '未提供 Admin 通行證' });
    }
    const token = authHeader.split(' ')[1];
    
    try {
        const decodedToken = await getAuth().verifyIdToken(token);
        const userEmail = decodedToken.email;
        const allowedAdmins = (process.env.ADMIN_EMAILS || '').split(',');
        
        if (!allowedAdmins.includes(userEmail)) {
            console.warn(`⚠️ 嘗試越權存取 Admin 後台: ${userEmail}`);
            return res.status(403).json({ success: false, msg: '權限不足，您不是超級管理員' });
        }

        req.admin = decodedToken;
        next();
    } catch (error) {
        console.error("Admin Token 驗證失敗:", error.message);
        res.status(401).json({ success: false, msg: 'Admin 通行證無效或已過期' });
    }
}

router.use(verifyAdminToken);

// ==========================================
// 📊 API 1：獲取全站日誌 (支援深度分類過濾) - 記憶體過濾版
// ==========================================
router.get('/logs', async (req, res) => {
    try {
        const { startDate, endDate, limit = 50, filterClass, filterType } = req.query;
        let query = db.collection('divination_logs');

        // ❌ 刪除原本在這裡的 filterType where 條件，避免觸發 Firestore 複合索引報錯

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); 
            query = query.where('timestamp', '>=', start).where('timestamp', '<=', end);
        }

        // 為了確保在記憶體過濾後還有足夠資料，我們把抓取量放大
        query = query.orderBy('timestamp', 'desc').limit(parseInt(limit) * 3);
        const snapshot = await query.get();

        let logs = snapshot.docs.map(doc => {
            const data = doc.data();
            const log_class = data.log_class || (data.amount_paid ? 'revenue' : 'consumption');
            const points_change = data.points !== undefined ? data.points : (data.points_change || 0);

            return {
                id: doc.id,
                userId: data.userId,
                displayName: data.userName || data.displayName || '未知用戶',
                type: data.type || data.serviceType, // 確保相容舊資料
                stage: data.stage || '',
                topic: data.summary || data.topic || data.result_card || '',
                points_change: points_change,
                log_class: log_class,
                timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null
            };
        });

        // ==========================================
        // 🌟 記憶體過濾 (Memory Filter) 
        // ==========================================
        
        // 1. 過濾「大分類」 (log_class)
        if (filterClass && filterClass !== 'all') {
            if (filterClass === 'defaultView') {
                logs = logs.filter(log => log.log_class === 'consumption' || log.log_class === 'revenue');
            } else {
                logs = logs.filter(log => log.log_class === filterClass);
            }
        }

        // 2. 🌟 過濾「服務類型」 (filterType: tarot, ziwei...)
        if (filterType && filterType !== 'all') {
            logs = logs.filter(log => log.type === filterType);
        }

        // ==========================================

        // 切齊回前端要求的筆數 (例如前端要求顯示 50 筆)
        logs = logs.slice(0, parseInt(limit));

        res.json({ success: true, data: logs });
    } catch (error) {
        console.error('讀取日誌失敗:', error);
        res.status(500).json({ success: false, msg: error.message });
    }
});

// ==========================================
// 🧠 API 2：取得 / 更新 AI 大腦設定
// ==========================================
router.get('/ai-settings', async (req, res) => {
    try {
        const doc = await db.collection('system_settings').doc('ai_config').get();
        if (!doc.exists) {
            return res.json({ success: true, data: { active_model: 'gemini-3-flash-preview', available_models: ['gemini-3-flash-preview', 'gemini-3-pro'] } });
        }
        res.json({ success: true, data: doc.data() });
    } catch (error) { res.status(500).json({ success: false }); }
});

router.post('/ai-settings', express.json(), async (req, res) => {
    try {
        const newConfig = req.body;
        await db.collection('system_settings').doc('ai_config').set(newConfig, { merge: true });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;