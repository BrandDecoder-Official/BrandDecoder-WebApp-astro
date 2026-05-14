const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = getFirestore('astro-bot-db');

// 這裡未來放 O2O 的 API

module.exports = router; // <-- 這行最重要