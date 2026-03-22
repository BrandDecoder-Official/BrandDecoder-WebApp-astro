// ==========================================
// 🌌 BrandDecoder | 律動能量核心邏輯 ( Canvas 產圖 + PixiJS 完整合體版 )
// ==========================================
let userId = "";
let dynamicCost = 10; 

// UI 元素 Ref
const btnActivate = document.getElementById('btn-activate');
const btnCloseResult = document.getElementById('btn-close-result');

// 🌟 產圖相關按鈕
const btnShareCanvas = document.getElementById('btn-share-canvas');
const btnShareText = document.getElementById('btn-share-text');
const btnShareLoading = document.getElementById('btn-share-loading');
const btnDownloadImage = document.getElementById('btn-download-image');

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
    initPixiBackground();

    try {
        await liff.init({ liffId: ENV.NUMEROLOGY_LIFF_ID }); 
        
        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
        }
        
        const profile = await liff.getProfile();
        userId = profile.userId;
        const uiNameEl = document.getElementById('ui-name');
        if(uiNameEl) uiNameEl.innerText = profile.displayName || "神祕旅人";
        console.log("✅ LIFF 登入成功 UID:", userId);

        // 動態抓取定價
        try {
            const configRes = await fetch(`${ENV.API_BASE}/api/public/config/ai`);
            const configData = await configRes.json();
            if (configData.success && configData.data.numerology) {
                dynamicCost = configData.data.numerology.cost;
                document.querySelector('.cost-text').innerText = `(消耗 ${dynamicCost} 靈力值)`;
            }
        } catch(apiErr) { 
            console.warn("無法取得動態定價", apiErr); 
            document.querySelector('.cost-text').innerText = `(消耗 10 靈力值)`;
        }

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
    // A. 重置分享按鈕狀態
    if(btnShareCanvas) btnShareCanvas.style.display = 'flex';
    if(btnDownloadImage) btnDownloadImage.style.display = 'none';

    // B. 視覺過場：進入 Loading 狀態
    const loadingText = document.querySelector('#step-calibration .status-text');
    if(loadingText) {
        loadingText.style.color = "#E5C07B";
        loadingText.innerText = "宇宙頻率共振中，請稍候...";
    }
    
    switchScreen('step-ritual', 'step-calibration');
    startPixiBlast(); 
    
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
            
            // C. 填入數據
            document.getElementById('result-core').innerText = aiData.coreNumber;
            
            const luckyArr = aiData.luckySet || ['--','--','--'];
            document.getElementById('result-lucky').innerText = luckyArr.join(' · ');
            
            const wealthArr = aiData.wealthSet || ['--','--'];
            document.getElementById('result-wealth').innerText = wealthArr.join(' · ');

            document.getElementById('interpretation-text').innerHTML = aiData.interpretation;

            // D. ✨ 數據填妥後，華麗轉場
            setTimeout(() => {
                stopPixiBlast();
                switchScreen('step-calibration', 'step-result');
            }, 500); 

        } else {
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
// 🖼️ 4. Canvas 分享字卡生成邏輯
// ==========================================
if(btnShareCanvas) {
    btnShareCanvas.addEventListener('click', async () => {
        // A. 顯示按鈕 Loading 狀態
        btnShareText.innerText = "宇宙能量具現中...";
        btnShareLoading.style.display = 'block';
        btnShareCanvas.style.pointerEvents = 'none'; 

        try {
            // 嘗試抓取分數，如果找不到就給 80
            const interpretationTitle = document.getElementById('ai-interpretation').querySelector('h3').innerText;
            const scoreMatch = interpretationTitle.match(/\d+/);
            const score = scoreMatch ? scoreMatch[0] : 80;

            // B. 取得目前的靈魂數據
            const aiData = {
                core: document.getElementById('result-core').innerText,
                lucky: document.getElementById('result-lucky').innerText,
                wealth: document.getElementById('result-wealth').innerText,
                score: score
            };

            // C. 🔥 呼叫「 Canvas 產圖工廠」
            const dataUrl = await generateShareCardCanvas(aiData);
            
            // D. 隱藏產圖按鈕，顯示下載按鈕
            btnShareCanvas.style.display = 'none';
            btnDownloadImage.href = dataUrl;
            btnDownloadImage.download = `律動能量_靈魂解碼_${aiData.core}.png`;
            btnDownloadImage.style.display = 'flex'; 

        } catch (e) {
            console.error("產圖失敗:", e);
            btnShareText.innerText = "生成失敗，請重試。";
        } finally {
            btnShareCanvas.style.pointerEvents = 'auto';
            btnShareLoading.style.display = 'none';
        }
    });
}

// Canvas 繪圖主函數
async function generateShareCardCanvas(aiData) {
    const canvas = document.getElementById('share-canvas');
    if(!canvas) throw new Error("找不到 share-canvas 元素");
    const ctx = canvas.getContext('2d');
    const W = canvas.width;  // 1080
    const H = canvas.height; // 1920

    // 1. 繪製背景 (深邃宇宙黑)
    ctx.fillStyle = "#05050A";
    ctx.fillRect(0, 0, W, H);

    // 2. 繪製神聖幾何光暈背景
    const gradientBg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W);
    gradientBg.addColorStop(0, "rgba(212, 175, 55, 0.15)");
    gradientBg.addColorStop(0.5, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradientBg;
    ctx.fillRect(0, 0, W, H);

    // 3. 繪製頂部標題與分數
    ctx.fillStyle = "#D4AF37";
    ctx.font = "bold 42px 'PingFang TC', 'Microsoft JhengHei', sans-serif";
    ctx.letterSpacing = "4px";
    ctx.fillText("🌌 律動能量靈魂解碼", W * 0.1, H * 0.1);

    ctx.fillStyle = "#F9E498";
    ctx.font = "36px 'PingFang TC', 'Microsoft JhengHei', sans-serif";
    ctx.letterSpacing = "1px";
    ctx.fillText(`能量指數：${aiData.score}分`, W * 0.1, H * 0.1 + 60);

    // 4. 繪製「核心能量」 (巨大發光版)
    ctx.shadowColor = "rgba(229, 192, 123, 0.7)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = "#E5C07B";
    ctx.font = "bold 280px 'Helvetica Neue', Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(aiData.core, W/2, H/2 - 100);

    ctx.shadowBlur = 0; // 重置陰影
    ctx.fillStyle = "#A0A0B0";
    ctx.font = "48px 'PingFang TC', 'Microsoft JhengHei', sans-serif";
    ctx.fillText("您的核心能量", W/2, H/2 - 400);

    // 5. 繪製「幸運與財富能量艙」 (雙深色玻璃矩陣)
    // 幸運
    ctx.fillStyle = "rgba(20, 20, 30, 0.8)";
    ctx.beginPath(); ctx.roundRect(W*0.1, H/2 + 50, W*0.38, 200, 20); ctx.fill();
    // 財富
    ctx.fillStyle = "rgba(25, 20, 10, 0.8)";
    ctx.beginPath(); ctx.roundRect(W*0.52, H/2 + 50, W*0.38, 200, 20); ctx.fill();

    // 填入數字
    ctx.fillStyle = "#FFFFFF"; ctx.font = "bold 56px 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(aiData.lucky, W*0.1 + W*0.19, H/2 + 190);
    ctx.fillStyle = "#F2D3A1";
    ctx.fillText(aiData.wealth, W*0.52 + W*0.19, H/2 + 190);

    // 填入標題
    ctx.fillStyle = "#888888"; ctx.font = "32px 'PingFang TC', sans-serif";
    ctx.fillText("幸運共振", W*0.1 + W*0.19, H/2 + 110);
    ctx.fillText("財富金鑰", W*0.52 + W*0.19, H/2 + 110);

    // 6. 繪製「大師指引」
    const fullText = document.getElementById('interpretation-text').innerText;

    ctx.fillStyle = "#D4AF37"; ctx.font = "bold 38px 'PingFang TC', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("✨ 大師指引：", W * 0.1, H / 2 + 350);

    // 繪製磨砂玻璃底框
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.beginPath(); ctx.roundRect(W*0.08, H/2 + 390, W*0.84, 450, 15); ctx.fill();

    // 自動換行繪製文字
    ctx.fillStyle = "#E0E0E0"; ctx.font = "32px 'PingFang TC', sans-serif";
    wrapText(ctx, fullText, W*0.12, H/2 + 450, W*0.76, 52); 

    // 7. 繪製底部 Slogan
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(212, 175, 55, 0.3)"; ctx.font = "28px 'PingFang TC', sans-serif";
    ctx.fillText("@BrandDecoder_AI | 靈魂律動解碼室", W/2, H - 80);

    // 8. 輸出為 PNG
    return canvas.toDataURL("image/png");
}

// 補助函數：Canvas 文字自動換行
function wrapText(context, text, x, y, maxWidth, lineHeight) {
    var words = text.split(''); 
    var line = '';
    for(var n = 0; n < words.length; n++) {
        var testLine = line + words[n];
        var metrics = context.measureText(testLine);
        var testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            context.fillText(line, x, y);
            line = words[n];
            y += lineHeight;
        }
        else {
            line = testLine;
        }
    }
    context.fillText(line, x, y);
}

// ==========================================
// 🎨 5. PixiJS 視覺引擎 (100% 完整保留)
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
