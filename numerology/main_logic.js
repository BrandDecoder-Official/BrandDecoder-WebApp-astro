// ==========================================
// 🌌 BrandDecoder | 律動能量核心邏輯 (AGUI 秒關 + PixiJS 動畫完美保留版)
// ==========================================
let userId = "";
let currentIdToken = "";
let dynamicCost = 10; 

// UI 元素 Ref
const btnActivate = document.getElementById('btn-activate');

// PixiJS 狀態
let pixiApp;
let magicCircle; 
let particles = []; 
let isRitualActive = false; 

// ==========================================
// ⚙️ 1. 初始化 (LIFF 登入 & 抓取後台定價)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("系統啟動：掛載 PixiJS 視覺引擎...");
    
    // 🌟 1. 啟動待機動畫 (緩慢旋轉)
    initPixiBackground();

    try {
        await liff.init({ liffId: ENV.NUMEROLOGY_LIFF_ID }); 
        
        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
        }
        
        const profile = await liff.getProfile();
        userId = profile.userId;
        currentIdToken = liff.getIDToken(); // 取得 Token 以便後續呼叫 API
        
        const uiNameEl = document.getElementById('ui-name');
        if(uiNameEl) uiNameEl.innerText = profile.displayName || "神祕旅人";
        console.log("✅ LIFF 登入成功 UID:", userId);

        // 動態抓取定價
        try {
            const configRes = await fetch(`${ENV.API_BASE}/api/public/config/ai?t=${Date.now()}`);
            const configData = await configRes.json();
            if (configData.success && configData.data.numerology) {
                dynamicCost = parseInt(configData.data.numerology.cost);
                document.querySelector('.cost-text').innerText = `(消耗 ${dynamicCost} 靈力值)`;
            }
        } catch(apiErr) { 
            console.warn("無法取得動態定價", apiErr); 
            document.querySelector('.cost-text').innerText = `(消耗 10 靈力值)`;
        }

        // 隱藏「同步中」畫面，顯示主按鈕畫面
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
// 🔮 2. 算命 Ritual 邏輯 (按鈕變形 + 秒回關閉)
// ==========================================
btnActivate.addEventListener('click', async () => {
    if (btnActivate.disabled) return;

    // A. 按鈕狀態改變：鎖定、文字變更、加強發光 (不切換畫面，保持沉浸感)
    btnActivate.disabled = true;
    btnActivate.innerHTML = "宇宙頻率共振中...<br><span style='font-size:12px; color:#ccc;'>(請稍候)</span>";
    btnActivate.style.boxShadow = "0 0 30px #E5C07B"; 
    
    // 🌟 B. 啟動爆發動畫：魔法陣瞬間加速旋轉並脈衝！
    startPixiBlast(); 
    
    try {
        const cloudRunUrl = `${ENV.API_BASE}/api/numerology/generate`; 
        const response = await fetch(cloudRunUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentIdToken}` // 帶上安全憑證
            },
            body: JSON.stringify({ userId: userId })
        });

        const result = await response.json();

        if (result.status === "success") {
            // C. 成功接單：按鈕變成綠色成功狀態
            btnActivate.innerHTML = "✨ 訊號已送達大師手中！<br><span style='font-size:12px; color:#fff;'>(請關閉頁面回 LINE 查看)</span>";
            btnActivate.style.color = "#000";
            btnActivate.style.background = "linear-gradient(135deg, #4CAF50, #2E7D32)"; 
            btnActivate.style.boxShadow = "0 0 40px #4CAF50";
            btnActivate.style.border = "none";
            
            // 🌟 D. 停頓 1.8 秒：讓使用者欣賞加速旋轉的魔法陣與成功提示，然後強制關閉！
            setTimeout(() => {
                liff.closeWindow(); 
            }, 1800); 

        } else {
            throw new Error(result.message || "靈力共振失敗");
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        // 失敗時恢復原狀，魔法陣降速回待機狀態
        stopPixiBlast();
        btnActivate.disabled = false;
        btnActivate.innerHTML = `啟動律動能量 <br><span class="cost-text" style="color: rgba(255,255,255,0.6);">(消耗 ${dynamicCost} 靈力值)</span>`;
        btnActivate.style.background = ""; 
        btnActivate.style.boxShadow = "";
        alert("🚨 系統異常：" + error.message);
    }
});

// ==========================================
// 🚪 3. UI 輔助控制
// ==========================================
function switchScreen(hideId, showId) {
    const hideEl = document.getElementById(hideId);
    const showEl = document.getElementById(showId);
    if(hideEl) { hideEl.classList.remove('active'); hideEl.classList.add('hidden'); }
    if(showEl) { showEl.classList.remove('hidden'); showEl.classList.add('active'); }
}

// ==========================================
// 🎨 4. PixiJS 視覺引擎 (100% 完整保留)
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
        // 🌟 isRitualActive 控制了魔法陣的轉速與脈衝！
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
