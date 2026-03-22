// ==========================================
// 1. 全域變數與設定
// ==========================================
let userId = "";
let userPoints = 0;
const COST_POINTS = 10;

// ==========================================
// 2. 生命週期初始化 (Initialization)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("系統啟動：開始掛載大師引擎...");

    // 1. 先啟動背景的 PixiJS 動畫畫布 (讓畫面立刻有反應)
    initPixiBackground();

    try {
        // 2. 初始化 LIFF (請替換為你在 env.js 中的 liffId)
        /* await liff.init({ liffId: "YOUR_LIFF_ID" });
        if (!liff.isLoggedIn()) {
            liff.login();
            return;
        }
        const profile = await liff.getProfile();
        userId = profile.userId;
        */

        // !! 測試階段：模擬取得 LINE UID !!
        userId = "U_TEST_88888888";
        console.log("用戶已登入 UID:", userId);

        // 3. 向後端/Firebase 查詢用戶點數
        await checkUserStatus(userId);

    } catch (error) {
        console.error("LIFF 初始化失敗:", error);
        document.querySelector('.status-text').innerText = "連線異常，請重新開啟";
    }
});

// ==========================================
// 3. 數據與後端串接 (Firebase/API)
// ==========================================
async function checkUserStatus(uid) {
    // 這裡模擬去 Firebase 讀取資料的時間 (1.5秒)，讓用戶看到「校準中」的動畫
    setTimeout(() => {
        // 假設從資料庫讀取到該用戶有 520 點
        userPoints = 520; 
        console.log(`用戶剩餘點數: ${userPoints}`);

        if (userPoints >= COST_POINTS) {
            // 點數足夠，切換到「啟動儀式」按鈕
            switchScreen('step-calibration', 'step-ritual');
        } else {
            // 點數不足
            document.querySelector('.status-text').innerText = "靈力值不足，請前往會員中心";
            document.querySelector('.status-text').style.color = "#ff4d4f";
        }
    }, 1500);
}

// ==========================================
// 4. UI 互動與畫面控制
// ==========================================
function switchScreen(hideId, showId) {
    document.getElementById(hideId).classList.add('hidden');
    document.getElementById(hideId).classList.remove('active');

    document.getElementById(showId).classList.remove('hidden');
    document.getElementById(showId).classList.add('active');
}

// 綁定「啟動律動能量」按鈕點擊事件
document.getElementById('btn-activate').addEventListener('click', async () => {
    // 1. 隱藏第二階段的 UI
    document.getElementById('step-ritual').classList.add('hidden');
    
    // 2. 觸發 PixiJS 能量爆發特效
    triggerRitualAnimation();

    // 3. (預留) 這裡之後會放：扣除 Firebase 點數 + 呼叫 Gemini API 算數字
    console.log(`已扣除 ${COST_POINTS} 點，準備呼叫大腦...`);
});

// ==========================================
// 5. PixiJS 視覺引擎 (背景與特效)
// ==========================================
let pixiApp;

function initPixiBackground() {
    // 建立 Pixi 應用程式
    const container = document.getElementById('pixi-container');
    pixiApp = new PIXI.Application({
        resizeTo: window,
        backgroundAlpha: 0, // 透明背景，露出 CSS 的深邃黑
        resolution: window.devicePixelRatio || 1,
    });
    container.appendChild(pixiApp.view);

    // (下一階段：我們將在這裡畫出緩慢旋轉的星軌與粒子)
    console.log("PixiJS 畫布掛載完成");
}

function triggerRitualAnimation() {
    console.log("PixiJS: 播放能量匯聚特效...");
    
    // 模擬算命與特效播放時間 (2.5秒)，然後切換到結果頁
    setTimeout(() => {
        switchScreen('step-ritual', 'step-result');
        
        // 填入測試用假數字，確保版面正常
        document.getElementById('numbers-grid').innerHTML = `
            <h1 style="color:#E5C07B; font-size: 3rem; margin-bottom: 20px;">8</h1>
            <h3 style="color:#A0A0B0; letter-spacing: 5px;">26 · 47 · 11 · 12 · 35</h3>
        `;
        document.getElementById('interpretation-text').innerHTML = 
            "<strong>【今日主旋律】</strong><br>今日頻率為 8，象徵豐盛與權力。<br>適合推動延宕已久的重大決策。";
            
    }, 2500);
}
