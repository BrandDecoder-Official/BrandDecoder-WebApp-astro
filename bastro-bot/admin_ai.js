// ==========================================
// 🧠 模組：AI 大腦動態參數與定價管理 (admin_ai.js)
// ==========================================
//
// 大腦釘選版次：見 aiModelCatalog.js 頂部 `AI_BRAIN_RELEASE`（調整模型清單或預設時請 bump）。
// --- Gemini 3 系模型生命週期備忘（依 Google 公告整理；上線前請再對一次官方文件）---
// 正式版
//   gemini-3.1-flash-lite：約 2026-05-07 起可用，預計 2027-05-07 停用（簽到／極輕量場景可優先鎖定此 ID）。
// 預覽版（preview）與建議更換
//   gemini-3.1-flash-lite-preview：約 2026-03-03～2026-05-25 → 建議改 gemini-3.1-flash-lite。
//   gemini-3.1-flash-image-preview：約 2026-02-26 起，停用日期待公告。
//   gemini-3.1-pro-preview：約 2026-02-19 起，停用日期待公告。
//   gemini-3-pro-image-preview：約 2025-11-20 起，停用日期待公告。
//   gemini-3-flash-preview：約 2025-12-17 起，停用日期待公告。
//   gemini-3-pro-preview：約 2025-11-18 起，約 2026-03-09 停用 → 建議改 gemini-3.1-pro-preview（後台選單已移除，勿再使用）。
// 後台可選 ID 僅見 aiModelCatalog.js（未列入官方對照表者不會出現在選單）。
//
const express = require('express');
const router = express.Router();
const { getFirestore } = require('firebase-admin/firestore');
const { mergeAiSettingsFromDoc } = require('./aiSettingsDefaults');
const { verifyAdminToken } = require('./adminAuth');

const db = getFirestore('astro-bot-db');

router.use(verifyAdminToken);

// 讀取 AI 設定（已改成唯讀本地代碼配置 aiConfig.js，忽略 DB，安全第一）
router.get('/config/ai', async (req, res) => {
    try {
        // 傳入 null，mergeAiSettingsFromDoc 內部會忽略並直接回傳本地設定
        res.json({ success: true, data: mergeAiSettingsFromDoc(null) });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
});

// 儲存 AI 設定（已改為本地配置模式，不允許線上動態修改 DB）
router.post('/config/ai', async (req, res) => {
    try {
        res.json({ 
            success: false, 
            msg: "🔒 安全設定模式已開啟：本系統已啟用『本地代碼配置 (aiConfig.js)』以提升安全性。不允許線上動態修改。如需調整各功能之 AI 大腦模型、Prompt 人設或定價價格，請直接修改程式碼並重新部署 (GCR)。" 
        });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
});

// ==========================================
// 🎉 節慶/限時扣點折扣活動動態設定 (campaign)
// ==========================================

// 讀取活動設定
router.get('/config/campaign', async (req, res) => {
    try {
        const doc = await db.collection('system_config').doc('campaign').get();
        if (doc.exists) {
            res.json({ success: true, data: doc.data() });
        } else {
            res.json({ success: true, data: { active: false, title: '', discountRate: 1, startTime: '', endTime: '' } });
        }
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
});

// 儲存活動設定
router.post('/config/campaign', async (req, res) => {
    try {
        const { active, title, discountRate, startTime, endTime } = req.body;
        const rate = parseFloat(discountRate);
        if (active && (Number.isNaN(rate) || rate <= 0 || rate > 1)) {
            return res.status(400).json({ success: false, msg: '折扣率必須是介於 0 到 1 之間的數字（例如 6 折輸入 0.6）' });
        }

        const updateData = {
            active: !!active,
            title: title || '',
            discountRate: rate || 1,
            startTime: startTime || '',
            endTime: endTime || '',
            updatedAt: new Date().toISOString(),
            updatedBy: req.admin ? req.admin.email : 'system'
        };

        await db.collection('system_config').doc('campaign').set(updateData, { merge: true });
        res.json({ success: true, msg: "🎉 限時折扣活動設定已動態更新！" });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
});

module.exports = router;