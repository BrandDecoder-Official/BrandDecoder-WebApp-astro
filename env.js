// ==========================================
// 🌌 BrandDecoder 全域配置中心
// ==========================================
const ENV = {
    // 🏷️ LINE LIFF 相關 (每個功能可能不同)
    TAROT_LIFF_ID: "2009490171-yQF5PguK", 
    ZIWEI_LIFF_ID: "2009490171-8nISSem3", // 🔮 新增：紫微斗數專屬 LIFF ID
    MEMBER_LIFF_ID: "2009490171-ZuAjXwno", // 與後端 MEMBER_PROFILE_URL 預設（liff.line.me/…）同一支 LIFF
    // 👇 新增這行：數字能量專屬 LIFF ID
    NUMEROLOGY_LIFF_ID: "2009490171-krjD4SBL",
    
    
    // 🌐 後端 API 基底網址
    API_BASE: "https://bastro-bot-217800246535.asia-east1.run.app",
    
    // 🔮 當前功能設定
    TYPE: "tarot",
    VERSION: "v4.4",
    
    // 🖼️ 圖片資源路徑 (建議用絕對路徑避免目錄出錯)
    IMG_BACK: "https://branddecoderai.com/images/PK_BG.jpg",
    IMG_FRONT: "https://branddecoderai.com/images/PK_BG2.jpg",

    /**
     * 僅這些 LINE userId（ID Token 的 sub，如 U1234…）可在「電腦版 LINE／桌面類環境」使用 LIFF 頁。
     * 留空 = 不啟用限制。非空時：會員 profile、塔羅、紫微、數字能量 四頁皆套用（/liff-pc-allowlist.js）。
     */
    LIFF_PC_ALLOW_USER_IDS: "Udddc1d94a101d4b7eded5d65a1b07648",
};

// 💡 為了相容我們新寫的後台與紫微程式碼，直接把 API_BASE 鏡像成 API_URL
const API_URL = ENV.API_BASE;
