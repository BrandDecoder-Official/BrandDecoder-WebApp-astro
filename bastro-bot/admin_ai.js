// ==========================================
// 🧠 模組：AI 大腦動態參數與定價管理 (admin_ai.js)
// ==========================================
const express = require('express');
const router = express.Router();
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const db = getFirestore('astro-bot-db');

// 讀取 AI 動態設定
router.get('/config/ai', async (req, res) => {
    try {
        const doc = await db.collection('system_config').doc('ai_settings').get();
        if (!doc.exists) {
            // 預設的基礎大腦配置 (🌟 已加入 numerology 預設值)
            return res.json({
                success: true,
                data: {
                    daily: { model: "gemini-3.1-flash-lite-preview", cost: 0 },
                    tarot: { model: "gemini-3-flash-preview", cost: 10, prompt: "" },
                    ziwei: { model: "gemini-3.1-pro-preview", cost: 30, prompt: "" },
                    numerology: { model: "gemini-3-flash-preview", cost: 10, prompt: "" },
                    face:  { model: "gemini-3.1-flash-image-preview", cost: 20, prompt: "" } // 預留給面相
                }
            });
        }
        res.json({ success: true, data: doc.data() });
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
        
        updateData.face = face || { model: "gemini-3.1-flash-image-preview", cost: 20, prompt: "" };

        // 寫入 Firestore
        await db.collection('system_config').doc('ai_settings').set(updateData, { merge: true });
        
        res.json({ success: true, msg: "🧠 AI 服務定價與模型參數已動態更新！" });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
});

module.exports = router;