// ==========================================
// 🌌 BrandDecoder | 律動能量核心邏輯 (AGUI 秒關 + 雙重保險 + PixiJS 完整版)
// ==========================================
let userId = "";
/** LIFF OAuth access token（後端若驗 LINE 使用者須用此，勿用 ID Token） */
let currentAccessToken = "";
let dynamicCost = 10; 

// UI 元素 Ref（DOMContentLoaded 後再綁定，避免腳本提早執行）
let btnActivate = null;

// PixiJS 狀態
let pixiApp;
let magicCircle; 
let particles = []; 
let outerRingGfx;
let innerRingGfx;
let isRitualActive = false; 

// ==========================================
// ⚙️ 1. 初始化 (LIFF 登入 & 抓取後台定價)
// ==========================================
async function initAll() {
    if (window.__numerologyInitStarted) return;
    window.__numerologyInitStarted = true;

    btnActivate = document.getElementById('btn-activate');
    if (btnActivate) bindActivateButton();

    console.log("系統啟動：掛載背景特效...");
    initDigitFloatLayer();
    scheduleBackgroundFxInit();
    window.addEventListener('load', scheduleBackgroundFxInit);
    window.addEventListener('pageshow', scheduleBackgroundFxInit);

    try {
        const session = await BdLiff.requireLiffSession(ENV.NUMEROLOGY_LIFF_ID, { withProfile: true });
        currentAccessToken = session.token;
        
        let profile = null;
        if (session.profile) {
            profile = session.profile;
        } else {
            try {
                profile = await liff.getProfile();
            } catch (pErr) {
                console.warn("無法獲取個人資料，使用預設值:", pErr);
                profile = { displayName: "神祕旅人", userId: "" };
            }
        }
        
        // 嘗試從 ID Token 解析 userId 作為備用
        if (!profile.userId) {
            try {
                const idToken = liff.getDecodedIDToken();
                if (idToken && idToken.sub) {
                    profile.userId = idToken.sub;
                }
            } catch (tokenErr) {
                console.warn("解析 ID Token 失敗:", tokenErr);
            }
        }

        userId = profile.userId || "";

        const uiNameEl = document.getElementById('ui-name');
        if(uiNameEl) uiNameEl.innerText = profile.displayName || "神祕旅人";
        console.log("✅ LIFF 登入成功 UID:", userId);

        // 動態抓取定價 (加上時間戳破除快取)
        try {
            const configRes = await fetch(`${ENV.API_BASE}/api/public/config/ai?t=${Date.now()}`);
            const configData = await configRes.json();
            if (configData.success && configData.data.numerology) {
                dynamicCost = parseInt(configData.data.numerology.cost);
                const costTextEl = document.querySelector('.cost-text');
                if(costTextEl) costTextEl.innerText = `(消耗 ${dynamicCost} 額度)`;
            }
        } catch(apiErr) { 
            console.warn("無法取得動態定價", apiErr); 
            const costTextEl = document.querySelector('.cost-text');
            if(costTextEl) costTextEl.innerText = `(消耗 ${dynamicCost} 額度)`;
        }

        // 隱藏「同步中」畫面，顯示主按鈕畫面
        switchScreen('step-calibration', 'step-ritual');

    } catch (error) {
        if (error && (error.code === 'LIFF_LOGIN_REDIRECT' || error.code === 'LIFF_MOBILE_ONLY')) return;
        console.error("初始化失敗:", error);
        const statusText = document.querySelector('.status-text');
        if(statusText) {
            statusText.innerText = "連線異常，請從 LINE 重新開啟";
            statusText.style.color = "#ff4d4f";
        }
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
} else {
    initAll();
}

// ==========================================
// 🔮 2. 算命 Ritual 邏輯 (按鈕變形 + 秒回關閉)
// ==========================================
function bindActivateButton() {
    if (!btnActivate || btnActivate.dataset.bound === '1') return;
    btnActivate.dataset.bound = '1';
    btnActivate.addEventListener('click', onActivateClick);
}

async function onActivateClick(e) {
    if (!btnActivate) return;
    // 阻止事件冒泡與預設行為，防止意外重整
    e.preventDefault(); 
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
                'Authorization': `Bearer ${currentAccessToken}`
            },
            body: JSON.stringify({ userId: userId })
        });

        const result = await response.json();

        if (result.status === "success") {
            // C. 成功接單：按鈕變成綠色成功狀態
            btnActivate.innerHTML = "✨ 訊號已送達大師手中！<br><span style='font-size:12px; color:#fff;'>(請準備回 LINE 查看)</span>";
            btnActivate.style.color = "#000";
            btnActivate.style.background = "linear-gradient(135deg, #4CAF50, #2E7D32)"; 
            btnActivate.style.boxShadow = "0 0 40px #4CAF50";
            btnActivate.style.border = "none";
            
            // 🌟 D. 終極三重保險：強制關閉 LIFF
            setTimeout(() => {
                try {
                    // 方法 1：標準關閉
                    liff.closeWindow(); 
                } catch(err) {
                    console.log("liff.closeWindow 失敗", err);
                }
                
                // 方法 2 & 3：如果方法 1 裝死，用原生視窗關閉與 URL 導向強制送客
                setTimeout(() => {
                    window.close();
                    window.location.href = "line://"; 
                }, 500);

            }, 1800); 

        } else {
            throw new Error(result.message || "靈力共振失敗");
        }

    } catch (error) {
        console.error("Fetch Error:", error);
        // 失敗時恢復原狀，魔法陣降速回待機狀態
        stopPixiBlast();
        btnActivate.disabled = false;
        btnActivate.innerHTML = `啟動律動能量 <br><span class="cost-text" style="color: rgba(255,255,255,0.6);">(消耗 ${dynamicCost} 額度)</span>`;
        btnActivate.style.background = ""; 
        btnActivate.style.boxShadow = "";
        alert("🚨 系統異常：" + error.message);
    }
}

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
// 🎨 4. PixiJS 視覺引擎（飄字 + 粒子 + 雙環魔法陣）
// ==========================================
function startPixiBlast() {
    isRitualActive = true;
    document.body.classList.add('ritual-blast');
}
function stopPixiBlast() {
    isRitualActive = false;
    document.body.classList.remove('ritual-blast');
}

let bgFxInitPending = false;
function scheduleBackgroundFxInit() {
    if (pixiApp) return;
    if (bgFxInitPending) return;
    bgFxInitPending = true;
    const run = () => {
        bgFxInitPending = false;
        try {
            initPixiBackground();
        } catch (pixiErr) {
            console.error("Pixi 背景初始化失敗", pixiErr);
        }
    };
    if (typeof window.requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(run));
    } else {
        setTimeout(run, 50);
    }
}

/** DOM 飄字（不依賴 WebGL，進頁即顯示） */
function initDigitFloatLayer() {
    const layer = document.getElementById('digit-fx-layer');
    if (!layer || layer.dataset.ready === '1') return;
    layer.dataset.ready = '1';
    const pool = '0123456789';
    const count = 48;
    for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        span.className = 'digit-floater ' + (Math.random() > 0.5 ? 'gold' : 'violet');
        span.textContent = pool[Math.floor(Math.random() * pool.length)];
        const size = 14 + Math.floor(Math.random() * 18);
        const left = Math.random() * 100;
        const dur = 9 + Math.random() * 14;
        const delay = Math.random() * dur;
        const drift = (Math.random() - 0.5) * 40;
        span.style.left = left + '%';
        span.style.fontSize = size + 'px';
        span.style.setProperty('--dur', dur + 's');
        span.style.setProperty('--drift-x', drift + 'px');
        span.style.animationDuration = dur + 's';
        span.style.animationDelay = (-delay) + 's';
        layer.appendChild(span);
    }
}

function initPixiBackground() {
    if (pixiApp) return;

    const container = document.getElementById('pixi-container');
    if (!container) {
        console.warn("Pixi: 找不到 #pixi-container");
        return;
    }
    if (typeof PIXI === "undefined") {
        console.warn("Pixi: PIXI 未載入（請確認 /pixi.min.js）");
        return;
    }

    const w = window.innerWidth || document.documentElement.clientWidth || 360;
    const h = window.innerHeight || document.documentElement.clientHeight || 640;
    if (w < 2 || h < 2) {
        console.warn("Pixi: 視窗尺寸尚未就緒，稍後重試");
        scheduleBackgroundFxInit();
        return;
    }

    pixiApp = new PIXI.Application({
        resizeTo: window,
        transparent: true,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    const canvas = pixiApp.view;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    container.appendChild(canvas);

    function centerMagicCircle() {
        if (!pixiApp || !magicCircle) return;
        magicCircle.x = pixiApp.screen.width / 2;
        magicCircle.y = pixiApp.screen.height / 2;
    }
    window.addEventListener('resize', centerMagicCircle);

    magicCircle = new PIXI.Container();
    centerMagicCircle();
    pixiApp.stage.addChild(magicCircle);

    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => centerMagicCircle());
        ro.observe(container);
    }
    requestAnimationFrame(() => centerMagicCircle());

    outerRingGfx = new PIXI.Graphics();
    outerRingGfx.lineStyle(2.5, 0xE5C07B, 0.45);
    outerRingGfx.drawCircle(0, 0, 188);
    magicCircle.addChild(outerRingGfx);

    innerRingGfx = new PIXI.Graphics();
    innerRingGfx.lineStyle(1.2, 0x9FA8DA, 0.35);
    innerRingGfx.drawCircle(0, 0, 112);
    magicCircle.addChild(innerRingGfx);

    const particleCount = 78;
    for (let i = 0; i < particleCount; i++) {
        const p = new PIXI.Graphics();
        const color = Math.random() > 0.5 ? 0xE5C07B : 0x7B84E5;
        p.beginFill(color, Math.random() * 0.55 + 0.22);
        p.drawCircle(0, 0, Math.random() * 2.4 + 0.8);
        p.endFill();
        p.x = Math.random() * pixiApp.screen.width;
        p.y = Math.random() * pixiApp.screen.height;
        p.speed = Math.random() * 0.62 + 0.12;
        particles.push(p);
        pixiApp.stage.addChild(p);
    }

    pixiApp.ticker.add((delta) => {
        if (magicCircle && pixiApp) {
            magicCircle.x = pixiApp.screen.width / 2;
            magicCircle.y = pixiApp.screen.height / 2;
        }

        const ritual = isRitualActive;
        const rotationSpeed = ritual ? 0.105 : 0.0035;
        magicCircle.rotation += rotationSpeed * delta;

        if (ritual) {
            magicCircle.scale.x = magicCircle.scale.y = 1 + Math.sin(Date.now() / 95) * 0.12;
        } else {
            magicCircle.scale.x = magicCircle.scale.y = 1;
        }

        if (outerRingGfx) {
            outerRingGfx.alpha = ritual ? 0.72 + Math.sin(Date.now() / 220) * 0.22 : 0.42;
        }
        if (innerRingGfx) {
            innerRingGfx.alpha = ritual ? 0.62 + Math.cos(Date.now() / 180) * 0.18 : 0.32;
        }

        const dotBoost = ritual ? 17 : 1;
        particles.forEach((p) => {
            p.y -= p.speed * delta * dotBoost;
            if (p.y < -8) {
                p.y = pixiApp.screen.height + 8;
                p.x = Math.random() * pixiApp.screen.width;
            }
            if (p.x > pixiApp.screen.width) {
                p.x = Math.random() * pixiApp.screen.width;
            }
            if (ritual) {
                p.alpha = Math.min(1, 0.55 + Math.sin(Date.now() / 140 + p.x * 0.01) * 0.22);
            } else {
                p.alpha = 1;
            }
        });

    });

    console.log("✅ Pixi 背景已啟動", pixiApp.screen.width, "x", pixiApp.screen.height);
}
