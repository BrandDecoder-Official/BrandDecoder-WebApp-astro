// ==========================================
// 🌌  BrandDecoder | 律動能量核心邏輯 (完全版)
// ==========================================
let userId = "";
let dynamicCost = 10; // 預設費用

// 按鈕 Ref
const btnActivate = document.getElementById('btn-activate');
const btnShare = document.getElementById('btn-share');
const btnCloseResult = document.getElementById('btn-close-result'); // 🌟 新按鈕

// PIXI 相關
let pixiApp;
let magicCircle; 
let particles = []; 
let floatingNumbers = []; 
let isRitualActive = false; 

// ==========================================
// ⚙️ 初始化 (LIFF 登入 & 動態參數)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("系統啟動：掛載 PixiJS 引擎...");
    initPixiBackground();

    try {
        // --- A. LIFF 初始化 (使用 env.js 的設定) ---
        await liff.init({ liffId: ENV.NUMEROLOGY_LIFF_ID }); 
        
        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
        }
        
        const profile = await liff.getProfile();
        userId = profile.userId;
        document.getElementById('ui-name').innerText = profile.displayName || "神祕旅人";
        console.log("✅ LIFF 登入成功 UID:", userId);

        // --- B. 抓取後台價格 ---
        try {
            const configRes = await fetch(`${ENV.API_BASE}/api/public/config/ai`);
            const configData = await configRes.json();
            if (configData.success && configData.data.numerology) {
                dynamicCost = configData.data.numerology.cost;
                document.querySelector('.cost-text').innerText = `(消耗 ${dynamicCost} 靈力值)`;
            }
        } catch(apiErr) { console.warn("無法取得定價，使用預設值", apiErr); }

        switchScreen('step-calibration', 'step-ritual');

    } catch (error) {
        console.error("初始化失敗:", error);
        document.querySelector('.status-text').innerText = "網路連線異常，請重新從 LINE 開啟";
    }
});

// ==========================================
// 🔮 算命 ritual & 深度 AI 呼叫
// ==========================================
btnActivate.addEventListener('click', async () => {
    switchScreen('step-ritual', 'step-result');
    triggerPixiBlast(); // 視覺爆發！
    
    try {
        const cloudRunUrl = `${ENV.API_BASE}/api/numerology/generate`; 
        const response = await fetch(cloudRunUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
        });

        const result = await response.json();

        if (result.status === "success") {
            const aiData = result.data;
            
            // --- 填入數據 ---
            document.getElementById('result-core').innerText = aiData.coreNumber;
            
            // 防呆地填入幸運數陣列
            const lucky = aiData.luckySet || ['--','--','--'];
            document.getElementById('result-lucky-1').innerText = lucky[0];
            document.getElementById('result-lucky-2').innerText = lucky[1];
            document.getElementById('result-lucky-3').innerText = lucky[2];
            
            // 防呆地填入財富數陣列
            const wealth = aiData.wealthSet || ['--','--'];
            document.getElementById('result-wealth-1').innerText = wealth[0];
            document.getElementById('result-wealth-2').innerText = wealth[1];

            // --- 🌟 解除封印！顯示深度解析 ---
            document.getElementById('interpretation-text').innerHTML = aiData.interpretation;

        } else {
            document.getElementById('numbers-grid').innerHTML = `<span style='color:#ff4d4f'>具現失敗：${result.message}</span>`;
            document.getElementById('interpretation-text').innerText = "";
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        document.getElementById('numbers-grid').innerHTML = "";
        document.getElementById('interpretation-text').innerHTML = `<span style='color:#ff4d4f'>宇宙網路異常，請稍後重試。</span>`;
    }
});

// ==========================================
// 👇 🌟 任務三：新增「關閉並返回 LINE」的邏輯
// ==========================================
btnCloseResult.addEventListener('click', () => {
    console.log("用戶點擊關閉報告，返回 LINE 聊天室。");
    liff.closeWindow(); 
});

// ==========================================
// 補助函數 (保留原有的 PIXI 邏輯)
// ==========================================
function switchScreen(hideId, showId) {
    document.getElementById(hideId).classList.remove('active');
    document.getElementById(hideId).classList.add('hidden');
    document.getElementById(showId).classList.remove('hidden');
    document.getElementById(showId).classList.add('active');
}

function initPixiBackground() {
    const container = document.getElementById('pixi-container');
    if (typeof PIXI === 'undefined') { console.warn("未偵測到 PIXI"); return; }
    pixiApp = new PIXI.Application({ resizeTo: window, backgroundAlpha: 0, antialias: true, resolution: window.devicePixelRatio || 1 });
    container.appendChild(pixiApp.view);

    magicCircle = new PIXI.Container();
    magicCircle.x = pixiApp.screen.width / 2;
    magicCircle.y = pixiApp.screen.height / 2;
    pixiApp.stage.addChild(magicCircle);

    const outerRing = new PIXI.Graphics(); outerRing.lineStyle(2, 0xE5C07B, 0.4); outerRing.drawCircle(0, 0, 180);
    const innerRing = new PIXI.Graphics(); innerRing.lineStyle(1, 0x7B84E5, 0.6); innerRing.drawCircle(0, 0, 160);
    magicCircle.addChild(outerRing, innerRing);

    for (let i = 0; i < 40; i++) {
        const p = new PIXI.Graphics(); const color = Math.random() > 0.5 ? 0xE5C07B : 0x7B84E5;
        p.beginFill(color, Math.random() * 0.5 + 0.2); p.drawCircle(0, 0, Math.random() * 2 + 1); p.endFill();
        p.x = Math.random() * pixiApp.screen.width; p.y = Math.random() * pixiApp.screen.height; p.speed = Math.random() * 0.5 + 0.1;
        particles.push(p); pixiApp.stage.addChild(p);
    }

    const textStyle = new PIXI.TextStyle({ fontFamily: 'Arial', fontSize: 24, fill: '#E5C07B', opacity: 0.2, fontWeight: 'bold' });
    for (let i = 0; i < 10; i++) {
        const numText = new PIXI.Text(Math.floor(Math.random() * 10).toString(), textStyle);
        numText.x = Math.random() * pixiApp.screen.width; numText.y = Math.random() * pixiApp.screen.height; numText.speed = Math.random() * 0.3 + 0.1;
        floatingNumbers.push(numText); pixiApp.stage.addChild(numText);
    }

    pixiApp.ticker.add((delta) => {
        const rotationSpeed = isRitualActive ? 0.05 : 0.002;
        magicCircle.rotation += rotationSpeed * delta;
        if (isRitualActive) { magicCircle.scale.x = magicCircle.scale.y = 1 + Math.sin(Date.now() / 100) * 0.1; }
        else { magicCircle.scale.x = magicCircle.scale.y = 1; }

        particles.forEach(p => { p.y -= p.speed * delta * (isRitualActive ? 10 : 1); if (p.y < 0) p.y = pixiApp.screen.height; });
        floatingNumbers.forEach(num => { num.y -= num.speed * delta * (isRitualActive ? 5 : 1); if (num.y < -50) num.y = pixiApp.screen.height + 50; });
    });
}

function triggerPixiBlast() { isRitualActive = true; setTimeout(() => { isRitualActive = false; }, 1500); }
