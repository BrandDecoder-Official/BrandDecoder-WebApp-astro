// ==========================================
// BrandDecoder - 戰情中心 KPI 模組 (admin_kpi.js)
// ==========================================
const express = require('express');
const router = express.Router();
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore('astro-bot-db');
const {
    USD_TO_TWD,
    aggregateLogsAiCost,
    getInfraMonthlyEstimates,
    prorateMonthlyToPeriod,
} = require('./aiCostEstimate');

// 🛡️ 門神：驗證超級管理員
async function verifyAdminToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ success: false, msg: '未提供 Admin 通行證' });
    
    try {
        const decodedToken = await getAuth().verifyIdToken(authHeader.split(' ')[1]);
        const allowedAdmins = (process.env.ADMIN_EMAILS || '').split(',');
        if (!allowedAdmins.includes(decodedToken.email)) return res.status(403).json({ success: false, msg: '權限不足' });
        req.admin = decodedToken;
        next();
    } catch (error) {
        res.status(401).json({ success: false, msg: 'Admin 通行證無效' });
    }
}

router.use(verifyAdminToken);

// ==========================================
// 📊 API：獲取戰情中心總覽數據 (含四階段漏斗)
// ==========================================
router.get('/overview', async (req, res) => {
    try {
        // 1. 取得總會員數
        const usersSnapshot = await db.collection('users').get();
        const totalUsers = usersSnapshot.size;

        // 2. 取得近期 100 筆服務軌跡計算比例 (圓餅圖用)
        const logsSnapshot = await db.collection('divination_logs').orderBy('timestamp', 'desc').limit(100).get();
        
        // 🌟 修正：加入 numerologyCount 初始值
        let tarotCount = 0, ziweiCount = 0, dailyCount = 0, faceCount = 0, numerologyCount = 0;

        logsSnapshot.forEach(doc => {
            const data = doc.data();
            const type = data.type || data.serviceType;
            
            if (type === 'tarot') tarotCount++;
            else if (type === 'ziwei') ziweiCount++;
            else if (type === 'daily_draw') dailyCount++;
            else if (type === 'face' || type === 'palm') faceCount++;
            else if (type === 'numerology') numerologyCount++; // 🌟 修正：捕捉律動能量數據
        });

        // 3. 計算總營收 (直接查 orders 表)
        const ordersSnapshot = await db.collection('orders').where('status', '==', 'success').get();
        let totalRevenue = 0;
        ordersSnapshot.forEach(doc => {
            totalRevenue += (doc.data().amount || 0);
        });

        // 4. 🚀 四階段漏斗分析 (Funnel Analysis) - 高效 Count 聚合查詢
        const step1Snapshot = await db.collection('divination_logs').where('stage', '==', 'Stage 1: Page View').count().get();
        const step2Snapshot = await db.collection('divination_logs').where('stage', '==', 'Stage 2: Ticket Created').count().get();
        const step3Snapshot = await db.collection('divination_logs').where('stage', '==', 'Stage 3: Points Deducted').count().get();
        const step4Snapshot = await db.collection('divination_logs').where('stage', '==', 'Stage 4: Finish').count().get();
        
        const step1Count = step1Snapshot.data().count || 0;
        const step2Count = step2Snapshot.data().count || 0;
        const step3Count = step3Snapshot.data().count || 0;
        const step4Count = step4Snapshot.data().count || 0;

        // 5. 回傳數據
        res.json({
            success: true,
            data: { 
                totalUsers, 
                totalRevenue, 
                // 🌟 修正：在 serviceDist 中回傳 numerology 數據
                serviceDist: { 
                    tarot: tarotCount, 
                    ziwei: ziweiCount, 
                    daily: dailyCount, 
                    face: faceCount,
                    numerology: numerologyCount // 前端 Chart.js 會讀取這個 key
                },
                funnelData: { step1: step1Count, step2: step2Count, step3: step3Count, step4: step4Count } 
            }
        });
    } catch (error) {
        console.error("戰情數據載入失敗:", error);
        res.status(500).json({ success: false, msg: "資料撈取失敗" });
    }
});

// ==========================================
// 💰 API：成本總覽（Token → 台幣 + 基礎設施預估）
// ==========================================
router.get('/cost-overview', async (req, res) => {
    try {
        const periodDays = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
        const scanLimit = Math.min(2000, Math.max(100, parseInt(req.query.scanLimit, 10) || 800));

        const start = new Date();
        start.setDate(start.getDate() - periodDays);
        start.setHours(0, 0, 0, 0);

        const logsSnapshot = await db.collection('divination_logs')
            .where('timestamp', '>=', start)
            .orderBy('timestamp', 'desc')
            .limit(scanLimit)
            .get();

        const logs = logsSnapshot.docs.map((doc) => {
            const d = doc.data();
            return {
                type: d.type || d.serviceType,
                metrics: d.metrics,
            };
        });

        const aiAgg = aggregateLogsAiCost(logs);

        const ordersSnap = await db.collection('orders').where('status', '==', 'success').get();
        let revenueTwd = 0;
        let orderCount = 0;
        ordersSnap.forEach((doc) => {
            const o = doc.data();
            const completed = o.completedAt && o.completedAt.toDate ? o.completedAt.toDate() : null;
            if (completed && completed >= start) {
                revenueTwd += o.amount || 0;
                orderCount += 1;
            }
        });

        const infraMonthly = getInfraMonthlyEstimates();
        const infraLines = infraMonthly.map((row) => {
            if (row.dynamic) {
                return {
                    ...row,
                    periodTwd: aiAgg.costTwd,
                    monthlyTwd: aiAgg.costTwd,
                };
            }
            const periodTwd = prorateMonthlyToPeriod(row.monthlyTwd, periodDays);
            return { ...row, periodTwd };
        });

        const infraPeriodTotal = infraLines.reduce((s, row) => s + (row.periodTwd || 0), 0);
        const infraMonthlyTotal = infraLines.reduce((s, row) => {
            if (row.dynamic) return s + aiAgg.costTwd;
            return s + (row.monthlyTwd || 0);
        }, 0);

        const totalCostPeriodTwd = roundTwdLocal(infraPeriodTotal);
        const marginTwd = roundTwdLocal(revenueTwd - totalCostPeriodTwd);

        res.json({
            success: true,
            data: {
                periodDays,
                usdToTwd: USD_TO_TWD,
                disclaimer: 'AI 與基礎設施金額為預估，實際以 Google Cloud / Gemini 帳單為準。費率可透過環境變數 USD_TO_TWD、EST_*_TWD_MONTH 調整。',
                ai: aiAgg,
                revenue: { totalTwd: revenueTwd, orderCount },
                cost: {
                    aiTwd: aiAgg.costTwd,
                    infraPeriodTwd: totalCostPeriodTwd,
                    infraMonthlyTwd: roundTwdLocal(infraMonthlyTotal),
                    totalPeriodTwd: totalCostPeriodTwd,
                    marginTwd,
                },
                infra: infraLines,
                scan: { limit: scanLimit, scanned: logsSnapshot.size },
            },
        });
    } catch (error) {
        console.error('成本總覽載入失敗:', error);
        res.status(500).json({ success: false, msg: error.message || '成本資料撈取失敗' });
    }
});

function roundTwdLocal(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

module.exports = router;