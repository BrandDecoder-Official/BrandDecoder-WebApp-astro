// ==========================================
// 🌌 BrandDecoder | 律動能量核心邏輯 (沉浸過場完全版)
// ==========================================
let userId = "";
let dynamicCost = 10; 

// UI 元素 Ref
const btnActivate = document.getElementById('btn-activate');
const btnCloseResult = document.getElementById('btn-close-result');
const btnShare = document.getElementById('btn-share');

// PixiJS 狀態
let pixiApp;
let magicCircle; 
let particles = []; 
let floatingNumbers = []; 
let isRitualActive = false; 

// ==========================================
// ⚙️ 1. 初始化 (LIFF 登入 & 抓取後台定價)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("系統啟動：掛載 PixiJS 視覺引擎...");
    initPixiBackground();

    try {
        // --- A. LIFF 初始化 ---
        await liff.init({ liffId: ENV.NUMEROLOGY_LIFF_ID }); 
        
        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
        }
        
        const profile = await liff.getProfile();
        userId = profile.userId;
        document.getElementById('ui-name').innerText = profile.displayName || "神祕旅人";
        console.log("✅ LIFF 登入成功 UID:", userId);

        // --- B. 動態抓取後台 AI 定價 ---
        try {
            const configRes = await fetch(`${ENV.API_BASE}/api/public/config/ai`);
            const configData = await configRes.json();
            if (configData.success && configData.data.numerology) {
                dynamicCost = configData.data.numerology.cost;
                document.querySelector('.cost-text').innerText = `(消耗 ${dynamicCost} 靈力值)`;
            }
        } catch(apiErr) { 
            console.warn("無法取得動態定價，使用預設值 10", apiErr); 
            document.querySelector('.cost-text').innerText = `(消耗 10 靈力值)`;
        }

        // --- C. 進入準備畫面 ---
        switchScreen('step-calibration', 'step-ritual');

    } catch (error) {
        console.error("初始化失敗:", error);
        const statusText = document.querySelector('.status-text');
        if(statusText) {
            statusText.innerText = "連線異常，請從 LINE 重新開啟";
            statusText.style.color = "#ff4d4f";
        }
    }
});

// ==========================================
// 🔮 2. 算命 Ritual 邏輯 (沉浸同步版)
// ==========================================
btnActivate.addEventListener('click', async () => {
    // A. 視覺過場：進入 Loading 狀態
    const loadingText = document.querySelector('#step-calibration .status-text');
    if(loadingText) {
        loadingText.style.color = "#E5C07B";
        loadingText.innerText = "宇宙頻率共振中，請稍候...";
    }
    
    switchScreen('step-ritual', 'step-calibration');
    startPixiBlast(); // 🌟 啟動背景狂飆特效
    
    try {
        // B. 呼叫 Cloud Run AI 大腦
        const cloudRunUrl = `${ENV.API_BASE}/api/numerology/generate`; 
        const response = await fetch(cloudRunUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
        });

        const result = await response.json();

        if (result.status === "success") {
            const aiData = result.data;
            
            // C. 偷偷填入結果數據 (對齊你的新 HTML 結構)
            document.getElementById('result-core').innerText = aiData.coreNumber;
            
            const luckyArr = aiData.luckySet || ['--','--','--'];
            document.getElementById('result-lucky').innerText = luckyArr.join(' · ');
            
            const wealthArr = aiData.wealthSet || ['--','--'];
            document.getElementById('result-wealth').innerText = wealthArr.join(' · ');

            document.getElementById('interpretation-text').innerHTML = aiData.interpretation;

            // D. ✨ 數據填妥後，關閉特效並華麗轉場
            setTimeout(() => {
                stopPixiBlast();
                switchScreen('step-calibration', 'step-result');
            }, 500); // 給予極短的緩衝確保視覺流暢

        } else {
            // ❌ 錯誤處理 (沉浸式警告)
            stopPixiBlast();
            if(loadingText) {
                loadingText.style.color = "#ff4d4f";
                loadingText.innerText = `靈力共振失敗：${result.message}`;
            }
            setTimeout(() => switchScreen('step-calibration', 'step-ritual'), 3000);
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        stopPixiBlast();
        if(loadingText) {
            loadingText.style.color = "#ff4d4f";
            loadingText.innerText = "宇宙網路干擾，請稍後重試。";
        }
        setTimeout(() => switchScreen('step-calibration', 'step-ritual'), 3000);
    }
});

// ==========================================
// 🚪 3. UI 行為控制
// ==========================================
if(btnCloseResult) {
    btnCloseResult.addEventListener('click', () => {
        liff.closeWindow(); 
    });
}

function switchScreen(hideId, showId) {
    const hideEl = document.getElementById(hideId);
    const showEl = document.getElementById(showId);
    if(hideEl) { hideEl.classList.remove('active'); hideEl.classList.add('hidden'); }
    if(showEl) { showEl.classList.remove('hidden'); showEl.classList.add('active'); }
}

// ==========================================
// 🎨 4. PixiJS 視覺引擎
// ==========================================
function startPixiBlast() { isRitualActive = true; }
function stopPixiBlast() { isRitualActive = false; }

function initPixiBackground() {
    const container = document.getElementById('pixi-container');
    if (!container || typeof PIXI === 'undefined') return;

    pixiApp = new PIXI.Application({
        resizeTo: window, backgroundAlpha: 0, antialias: true,
        resolution: window.devicePixelRatio || 1
    });
    container.appendChild(pixiApp.view);

    magicCircle = new PIXI.Container();
    magicCircle.x = pixiApp.screen.width / 2;
    magicCircle.y = pixiApp.screen.height / 2;
    pixiApp.stage.addChild(magicCircle);

    const outerRing = new PIXI.Graphics();
    outerRing.lineStyle(2, 0xE5C07B, 0.4);
    outerRing.drawCircle(0, 0, 180);
    magicCircle.addChild(outerRing);

    // 建立粒子
    for (let i = 0; i < 50; i++) {
        const p = new PIXI.Graphics();
        const color = Math.random() > 0.5 ? 0xE5C07B : 0x7B84E5;
        p.beginFill(color, Math.random() * 0.5 + 0.2);
        p.drawCircle(0, 0, Math.random() * 2 + 1);
        p.x = Math.random() * pixiApp.screen.width;
        p.y = Math.random() * pixiApp.screen.height;
        p.speed = Math.random() * 0.5 + 0.1;
        particles.push(p);
        pixiApp.stage.addChild(p);
    }

    pixiApp.ticker.add((delta) => {
        const rotationSpeed = isRitualActive ? 0.08 : 0.002;
        magicCircle.rotation += rotationSpeed * delta;
        
        if (isRitualActive) {
            magicCircle.scale.x = magicCircle.scale.y = 1 + Math.sin(Date.now() / 100) * 0.1;
        } else {
            magicCircle.scale.x = magicCircle.scale.y = 1;
        }

        particles.forEach(p => {
            p.y -= p.speed * delta * (isRitualActive ? 15 : 1);
            if (p.y < 0) p.y = pixiApp.screen.height;
        });
    });
}
