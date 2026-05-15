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
//   gemini-3-pro-preview：約 2025-11-18 起，約 2026-03-09 停用 → 建議改 gemini-3.1-pro-preview。
// 其它：扣點／模型預設集中於 aiSettingsDefaults.js；LINE「每日一抽」實際呼叫模型另見 index.js 的 DAILY_DRAW_AI_MODEL（可環境變數覆寫）。
//
const express = require('express');
const router = express.Router();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { DEFAULT_AI_SETTINGS, mergeAiSettingsFromDoc } = require('./aiSettingsDefaults');
const db = getFirestore('astro-bot-db');

// 讀取 AI 動態設定（與 aiSettingsDefaults.js 合併：DB 優先，缺欄補預設；讀取失敗不回捏造資料）
router.get('/config/ai', async (req, res) => {
    try {
        const doc = await db.collection('system_config').doc('ai_settings').get();
        res.json({ success: true, data: mergeAiSettingsFromDoc(doc) });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
});

// 儲存 AI 動態設定
router.post('/config/ai', async (req, res) => {
    try {
        // 接收前端傳來的各個模組設定 (🌟 加入 numerology 的解構)
        const { daily, tarot, ziwei, face, numerology } = req.body;
        
        // 準備要更新進資料庫的物件
        const updateData = {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: req.user ? req.user.email : "system"
        };

        // 安全賦值：確保有資料才更新
        if (daily) updateData.daily = daily;
        if (tarot) updateData.tarot = tarot;
        if (ziwei) updateData.ziwei = ziwei;
        if (numerology) updateData.numerology = numerology; // 🌟 將律動能量寫入 Firebase
        
        updateData.face = face ? { ...DEFAULT_AI_SETTINGS.face, ...face } : { ...DEFAULT_AI_SETTINGS.face };

        // 寫入 Firestore
        await db.collection('system_config').doc('ai_settings').set(updateData, { merge: true });
        
        res.json({ success: true, msg: "🧠 AI 服務定價與模型參數已動態更新！" });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
});

module.exports = router;