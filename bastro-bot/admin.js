// ==========================================
// BrandDecoder - Super Admin 專屬模組 (admin.js)
// ==========================================
const express = require('express');
const router = express.Router();
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

const db = getFirestore('astro-bot-db');
const { normalizeMetrics } = require('./aiCostEstimate');

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

            const metricsRaw = data.metrics || null;
            const metrics = normalizeMetrics(metricsRaw);

            return {
                id: doc.id,
                userId: data.userId,
                displayName: data.userName || data.displayName || '未知用戶',
                type: data.type || data.serviceType,
                stage: data.stage || '',
                topic: data.summary || data.topic || data.result_card || '',
                points_change: points_change,
                log_class: log_class,
                timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : null,
                metrics: metricsRaw,
                metricsNormalized: metrics,
                amount_paid: data.amount_paid,
                paymentMethod: data.paymentMethod,
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

// ==========================================
// 👥 用戶權益管理 API
// ==========================================

// 輔助函式：統一格式化用戶列資料
function formatUserRow(userId, data) {
    let proExpiry = null;
    let flashExpiry = null;
    let lastFlashTier = data.lastFlashTier || 'none';

    if (data.proExpiry) proExpiry = data.proExpiry.toDate ? data.proExpiry.toDate() : new Date(data.proExpiry);
    if (data.flashExpiry) flashExpiry = data.flashExpiry.toDate ? data.flashExpiry.toDate() : new Date(data.flashExpiry);

    const now = new Date();
    const isProActive = proExpiry && proExpiry > now;
    const isFlashActive = flashExpiry && flashExpiry > now;

    let calculatedTier = 'none';
    let calculatedExpiry = null;
    let brainType = 'flash';

    if (isProActive) {
        calculatedTier = 'galaxy_legend';
        calculatedExpiry = proExpiry;
        brainType = 'pro';
    } else if (isFlashActive) {
        calculatedTier = lastFlashTier === 'universe_explorer' ? 'universe_explorer' : 'galaxy_scout';
        calculatedExpiry = flashExpiry;
        brainType = 'flash';
    }

    return {
        userId,
        displayName: data.displayName || '未命名用戶',
        pictureUrl: data.pictureUrl || '',
        points: data.points || 0,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : new Date(data.createdAt).toISOString()) : null,
        proExpiry: proExpiry ? proExpiry.toISOString() : null,
        flashExpiry: flashExpiry ? flashExpiry.toISOString() : null,
        lastFlashTier,
        calculatedTier,
        calculatedExpiry: calculatedExpiry ? calculatedExpiry.toISOString() : null,
        brainType
    };
}

// 🔍 1. 查詢用戶資訊與動態效期狀態
router.get('/user/search', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ success: false, msg: '缺少 userId' });

        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, msg: '找不到該用戶' });
        }

        res.json({
            success: true,
            data: formatUserRow(userId, userDoc.data())
        });
    } catch (error) {
        console.error('後台查詢用戶失敗:', error);
        res.status(500).json({ success: false, msg: error.message });
    }
});

// 🔍 1.5 查詢用戶列表與模糊搜尋
router.get('/users', async (req, res) => {
    try {
        const { query: searchQuery, limit = 50 } = req.query;
        let query = db.collection('users');

        if (searchQuery) {
            const q = searchQuery.trim();
            // 如果是 LINE UID 格式，直接查單一用戶
            if (/^U[0-9a-fA-F]{32}$/.test(q)) {
                const doc = await query.doc(q).get();
                if (!doc.exists) {
                    return res.json({ success: true, data: [] });
                }
                return res.json({ success: true, data: [formatUserRow(q, doc.data())] });
            } else {
                // 否則對暱稱進行前綴匹配
                query = query.where('displayName', '>=', q)
                             .where('displayName', '<=', q + '\uf8ff')
                             .limit(parseInt(limit, 10));
            }
        } else {
            // 預設列出最近創建的用戶
            query = query.orderBy('createdAt', 'desc').limit(parseInt(limit, 10));
        }

        const snapshot = await query.get();
        const users = snapshot.docs.map(doc => formatUserRow(doc.id, doc.data()));

        res.json({ success: true, data: users });
    } catch (error) {
        console.error('後台查詢用戶列表失敗:', error);
        res.status(500).json({ success: false, msg: error.message });
    }
});

// 🔋 2. 手動更新點數
router.post('/user/update-points', express.json(), async (req, res) => {
    try {
        const { userId, pointsChange, reason } = req.body;
        const changeVal = parseInt(pointsChange, 10);
        if (!userId || Number.isNaN(changeVal)) {
            return res.status(400).json({ success: false, msg: '參數不合法' });
        }

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, msg: '找不到該用戶' });
        }

        const batch = db.batch();
        batch.update(userRef, {
            points: FieldValue.increment(changeVal)
        });

        // 寫入歷史紀錄
        const historyRef = userRef.collection('history').doc();
        batch.set(historyRef, {
            type: 'admin_adjustment',
            points_change: changeVal,
            summary: `管理員調整靈力: ${changeVal >= 0 ? '+' : ''}${changeVal} 點 (原因: ${reason || '無'})`,
            timestamp: FieldValue.serverTimestamp()
        });

        // 寫入全站系統日誌
        const adminEmail = req.admin ? req.admin.email : '管理員';
        const globalLogRef = db.collection('divination_logs').doc();
        batch.set(globalLogRef, {
            userId,
            userName: userDoc.data().displayName || '未知用戶',
            type: 'admin_adjustment',
            log_class: 'system',
            summary: `${adminEmail} 調整靈力: ${changeVal >= 0 ? '+' : ''}${changeVal} 點 (原因: ${reason || '無'})`,
            points_change: changeVal,
            timestamp: FieldValue.serverTimestamp()
        });

        await batch.commit();
        res.json({ success: true, msg: '點數更新成功' });
    } catch (error) {
        console.error('後台手動更新點數失敗:', error);
        res.status(500).json({ success: false, msg: error.message });
    }
});

// ⏳ 3. 手動更新方案大腦效期
router.post('/user/update-tier', express.json(), async (req, res) => {
    try {
        const { userId, days, tierType, lastFlashTier } = req.body;
        const daysVal = parseInt(days, 10);
        if (!userId || Number.isNaN(daysVal) || !['pro', 'flash'].includes(tierType)) {
            return res.status(400).json({ success: false, msg: '參數不合法' });
        }

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, msg: '找不到該用戶' });
        }

        const userData = userDoc.data();
        const now = new Date();
        const batch = db.batch();
        const updateData = {};

        if (tierType === 'pro') {
            let currentExpiry = null;
            if (userData.proExpiry) {
                currentExpiry = userData.proExpiry.toDate ? userData.proExpiry.toDate() : new Date(userData.proExpiry);
            }
            
            let newExpiry;
            if (daysVal === 0) {
                newExpiry = null; // 清除效期
            } else if (currentExpiry && currentExpiry > now) {
                newExpiry = new Date(currentExpiry.getTime() + daysVal * 24 * 60 * 60 * 1000);
            } else {
                newExpiry = new Date(now.getTime() + daysVal * 24 * 60 * 60 * 1000);
            }
            updateData.proExpiry = newExpiry ? Timestamp.fromDate(newExpiry) : null;
        } else {
            let currentExpiry = null;
            if (userData.flashExpiry) {
                currentExpiry = userData.flashExpiry.toDate ? userData.flashExpiry.toDate() : new Date(userData.flashExpiry);
            }
            
            let newExpiry;
            if (daysVal === 0) {
                newExpiry = null;
            } else if (currentExpiry && currentExpiry > now) {
                newExpiry = new Date(currentExpiry.getTime() + daysVal * 24 * 60 * 60 * 1000);
            } else {
                newExpiry = new Date(now.getTime() + daysVal * 24 * 60 * 60 * 1000);
            }
            updateData.flashExpiry = newExpiry ? Timestamp.fromDate(newExpiry) : null;
            if (lastFlashTier) {
                updateData.lastFlashTier = lastFlashTier;
            }
        }

        batch.update(userRef, updateData);

        // 寫入歷史紀錄
        const historyRef = userRef.collection('history').doc();
        batch.set(historyRef, {
            type: 'admin_adjustment',
            summary: `管理員調整效期: ${tierType === 'pro' ? 'Pro大腦' : 'Flash大腦'} 調整 ${daysVal} 天`,
            timestamp: FieldValue.serverTimestamp()
        });

        // 寫入全站系統日誌
        const adminEmail = req.admin ? req.admin.email : '管理員';
        const globalLogRef = db.collection('divination_logs').doc();
        batch.set(globalLogRef, {
            userId,
            userName: userData.displayName || '未知用戶',
            type: 'admin_adjustment',
            log_class: 'system',
            summary: `${adminEmail} 調整效期: ${tierType === 'pro' ? 'Pro大腦' : 'Flash大腦'} 調整 ${daysVal} 天`,
            timestamp: FieldValue.serverTimestamp()
        });

        await batch.commit();
        res.json({ success: true, msg: '效期更新成功' });
    } catch (error) {
        console.error('後台手動更新效期失敗:', error);
        res.status(500).json({ success: false, msg: error.message });
    }
});

module.exports = router;