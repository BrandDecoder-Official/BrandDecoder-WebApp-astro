// ==========================================
// 🌌 BrandDecoder | 律動能量核心邏輯 (AGUI 秒關 + 雙重保險 + PixiJS 完整版)
// ==========================================
let userId = "";
/** LIFF OAuth access token（後端若驗 LINE 使用者須用此，勿用 ID Token） */
let currentAccessToken = "";
let dynamicCost = 10; 

// UI 元素 Ref
const btnActivate = document.getElementById('btn-activate');

// PixiJS 狀態
let pixiApp;
let magicCircle; 
let particles = []; 
/** 背景飄動數字（數字解碼主題） */
let digitFloaters = [];
let outerRingGfx;
let innerRingGfx;
let isRitualActive = false; 

// ==========================================
// ⚙️ 1. 初始化 (LIFF 登入 & 抓取後台定價)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("系統啟動：掛載 PixiJS 視覺引擎...");
    // LINE / LIFF WebView 常在首幀前 window 尺寸尚未穩定；延後初始化並綁定 #pixi-container 較可靠
    function schedulePixiInit() {
        const run = () => {
            try {
                initPixiBackground();
            } catch (pixiErr) {
                console.warn("Pixi 背景略過", pixiErr);
            }
        };
        if (typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => window.requestAnimationFrame(run));
        } else {
            setTimeout(run, 0);
        }
    }
    schedulePixiInit();

    try {
        const session = await BdLiff.requireLiffSession(ENV.NUMEROLOGY_LIFF_ID, { withProfile: true });
        currentAccessToken = session.token;
        const profile = session.profile || (await liff.getProfile());
        userId = profile.userId;

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
                if(costTextEl) costTextEl.innerText = `(消耗 ${dynamicCost} 靈力值)`;
            }
        } catch(apiErr) { 
            console.warn("無法取得動態定價", apiErr); 
            const costTextEl = document.querySelector('.cost-text');
            if(costTextEl) costTextEl.innerText = `(消耗 ${dynamicCost} 靈力值)`;
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
});

// ==========================================
// 🔮 2. 算命 Ritual 邏輯 (按鈕變形 + 秒回關閉)
// ==========================================
btnActivate.addEventListener('click', async (e) => {
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
// 🎨 4. PixiJS 視覺引擎（飄字 + 粒子 + 雙環魔法陣）
// ==========================================
function startPixiBlast() { isRitualActive = true; }
function stopPixiBlast() { isRitualActive = false; }

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

    pixiApp = new PIXI.Application({
        resizeTo: container,
        transparent: true,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
    });
    container.appendChild(pixiApp.view);

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

    const digitPool = "0123456789";
    const fontStack = '"PingFang TC","Microsoft JhengHei","Helvetica Neue",Helvetica,sans-serif';

    for (let i = 0; i < 42; i++) {
        const baseAlpha = 0.18 + Math.random() * 0.38;
        const ch = digitPool[Math.floor(Math.random() * digitPool.length)];
        const style = new PIXI.TextStyle({
            fontFamily: fontStack,
            fontSize: 11 + Math.random() * 16,
            fill: Math.random() > 0.48 ? 0xe5c07b : 0xb8bef5,
            fontWeight: Math.random() > 0.75 ? "600" : "400",
        });
        const t = new PIXI.Text(ch, style);
        t.anchor.set(0.5);
        t.baseAlpha = baseAlpha;
        t.alpha = baseAlpha;
        t.x = Math.random() * pixiApp.screen.width;
        t.y = Math.random() * pixiApp.screen.height;
        t.driftSpeed = 0.22 + Math.random() * 0.55;
        t.wobblePhase = Math.random() * Math.PI * 2;
        t.wobbleSpeed = 0.018 + Math.random() * 0.038;
        digitFloaters.push(t);
        pixiApp.stage.addChild(t);
    }

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
            if (ritual) {
                p.alpha = Math.min(1, 0.55 + Math.sin(Date.now() / 140 + p.x * 0.01) * 0.22);
            } else {
                p.alpha = 1;
            }
        });

        const digitBoost = ritual ? 14 : 1;
        digitFloaters.forEach((d, idx) => {
            d.y -= d.driftSpeed * delta * digitBoost;
            d.wobblePhase += d.wobbleSpeed * delta * (ritual ? 1.45 : 1);
            d.x += Math.sin(d.wobblePhase) * (ritual ? 1.15 : 0.55) * delta;

            if (d.y < -28) {
                d.y = pixiApp.screen.height + 28;
                d.x = Math.random() * pixiApp.screen.width;
                const pool = "0123456789";
                d.text = pool[Math.floor(Math.random() * pool.length)];
            }

            if (ritual) {
                const pulse = Math.sin(Date.now() / 110 + idx * 0.7);
                d.alpha = Math.min(0.92, d.baseAlpha + 0.38 + pulse * 0.12);
                const sc = 1 + pulse * 0.14;
                d.scale.set(sc);
            } else {
                d.alpha = d.baseAlpha;
                d.scale.set(1);
            }
        });
    });
}
