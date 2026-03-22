// ==========================================
// 1. 全域變數與設定
// ==========================================
let userId = "";
let dynamicCost = 10; // 預設值，稍後會被後台覆蓋

// 你的 Cloud Run 網址
const API_BASE_URL = 'https://bastro-bot-217800246535.asia-east1.run.app';

// PixiJS 專用變數
let pixiApp;
let magicCircle; 
let particles = []; 
let floatingNumbers = []; 
let isRitualActive = false; 

// ==========================================
// 2. 初始化 (LIFF 登入 & 抓取後台價格)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("系統啟動：開始掛載大師引擎...");
    initPixiBackground(); // 先讓背景動起來

    try {
        // --- A. 初始化 LIFF ---
        await liff.init({ liffId: "2009490171-krjD4SBL" }); // 填入你的專屬 LIFF ID
        
        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
        }
        
        const profile = await liff.getProfile();
        userId = profile.userId;
        console.log("真實用戶已登入 UID:", userId);

        // --- B. 動態抓取後台 AI 定價 ---
        try {
            const configRes = await fetch(`${API_BASE_URL}/api/public/config/ai`);
            const configData = await configRes.json();
            if (configData.success && configData.data.numerology) {
                dynamicCost = configData.data.numerology.cost;
                // 動態更新按鈕上的價格文字
                document.querySelector('.cost-text').innerText = `(消耗 ${dynamicCost} 靈力值)`;
            }
        } catch(e) {
            console.warn("無法取得動態定價，使用預設值 10", e);
        }

        // --- C. 檢查點數 (這部分交給點擊時後端驗證，前端先切換畫面) ---
        switchScreen('step-calibration', 'step-ritual');

    } catch (error) {
        console.error("初始化失敗:", error);
        document.querySelector('.status-text').innerText = "連線異常，請從 LINE 重新開啟";
        document.querySelector('.status-text').style.color = "#ff4d4f";
    }
});

// ==========================================
// 3. UI 控制邏輯
// ==========================================
function switchScreen(hideId, showId) {
    const hideEl = document.getElementById(hideId);
    const showEl = document.getElementById(showId);
    if(hideEl) {
        hideEl.classList.remove('active');
        hideEl.classList.add('hidden');
    }
    if(showEl) {
        showEl.classList.remove('hidden');
        showEl.classList.add('active');
    }
}

// 點擊啟動按鈕 (真實 API 呼叫版)
document.getElementById('btn-activate').addEventListener('click', async () => {
    // 1. 切換畫面並觸發動畫
    switchScreen('step-ritual', 'step-result');
    triggerPixiBlast(); // 觸發視覺爆發！
    
    // 先在畫面上顯示「讀取中」的提示
    document.getElementById('numbers-grid').innerHTML = `
        <div style="font-size: 1.5rem; color: #E5C07B; animation: pulseText 2s infinite;">
            正在與宇宙頻率共振...
        </div>
    `;
    document.getElementById('interpretation-text').innerHTML = "大師正在為您解碼...";

    try {
        // 2. 向 Cloud Run 後端發送請求
        const cloudRunUrl = `${API_BASE_URL}/api/numerology/generate`; 
        
        const response = await fetch(cloudRunUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId }) // 費用由後端決定，不從前端傳
        });

        const result = await response.json();

        // 3. 處理大腦回傳的結果
        if (result.status === "success") {
            const aiData = result.data;
            
            // 填入真實的 AI 數據
            document.getElementById('numbers-grid').innerHTML = `
                <div style="margin-bottom: 30px;">
                    <span style="font-size: 1.2rem; color: #A0A0B0;">核心能量</span><br>
                    <span style="font-size: 4.5rem; color: #E5C07B; font-weight: bold; text-shadow: 0 0 20px rgba(229,192,123,0.8);">${aiData.coreNumber}</span>
                </div>
                <div style="font-size: 1.5rem; color: #E0E0E0; letter-spacing: 4px;">
                    ${aiData.luckySet.join(' · ')} · ${aiData.wealthSet.join(' · ')}
                </div>
            `;
            // 填入真實的 AI 解析文案
            document.getElementById('interpretation-text').innerHTML = aiData.interpretation;
            console.log(`扣款成功，伺服器回傳剩餘點數: ${result.balance}`);

        } else {
            // 處理後端報錯 (例如點數不足)
            document.getElementById('numbers-grid').innerHTML = "";
            document.getElementById('interpretation-text').innerHTML = `<span style='color:#ff4d4f'>能量連線失敗：${result.message}</span>`;
        }

    } catch (error) {
        // 處理網路斷線或 Server 500 錯誤
        console.error("Fetch Error:", error);
        document.getElementById('numbers-grid').innerHTML = "";
        document.getElementById('interpretation-text').innerHTML = `<span style='color:#ff4d4f'>宇宙網路干擾，請稍後再試。</span>`;
    }
});

// ==========================================
// 4. PixiJS 視覺引擎 (核心特效區)
// ==========================================
function initPixiBackground() {
    const container = document.getElementById('pixi-container');
    
    // 如果沒有引入 Pixi，防呆
    if (typeof PIXI === 'undefined') {
        console.warn("未偵測到 PixiJS，跳過背景動畫");
        return;
    }

    pixiApp = new PIXI.Application({
        resizeTo: window,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
    });
    container.appendChild(pixiApp.view);

    // --- A. 建立神聖幾何法陣 ---
    magicCircle = new PIXI.Container();
    magicCircle.x = pixiApp.screen.width / 2;
    magicCircle.y = pixiApp.screen.height / 2;
    pixiApp.stage.addChild(magicCircle);

    const outerRing = new PIXI.Graphics();
    outerRing.lineStyle(2, 0xE5C07B, 0.4);
    outerRing.drawCircle(0, 0, 180);
    
    const innerRing = new PIXI.Graphics();
    innerRing.lineStyle(1, 0x7B84E5, 0.6);
    innerRing.drawCircle(0, 0, 160);
    
    const starG = new PIXI.Graphics();
    starG.lineStyle(1.5, 0xE5C07B, 0.5);
    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const x = Math.cos(angle) * 160;
        const y = Math.sin(angle) * 160;
        if (i === 0) starG.moveTo(x, y);
        else starG.lineTo(x, y);
    }
    starG.closePath();
    
    magicCircle.addChild(outerRing, innerRing, starG);

    // --- B. 建立星塵粒子 ---
    for (let i = 0; i < 60; i++) {
        const p = new PIXI.Graphics();
        const color = Math.random() > 0.5 ? 0xE5C07B : 0x7B84E5;
        p.beginFill(color, Math.random() * 0.5 + 0.2);
        p.drawCircle(0, 0, Math.random() * 2 + 1);
        p.endFill();
        p.x = Math.random() * pixiApp.screen.width;
        p.y = Math.random() * pixiApp.screen.height;
        p.speed = Math.random() * 0.5 + 0.1;
        particles.push(p);
        pixiApp.stage.addChild(p);
    }

    // --- C. 建立漂浮數字 ---
    const textStyle = new PIXI.TextStyle({
        fontFamily: 'Arial', fontSize: 24, fill: '#E5C07B', opacity: 0.3, fontWeight: 'bold'
    });

    for (let i = 0; i < 15; i++) {
        const numText = new PIXI.Text(Math.floor(Math.random() * 10).toString(), textStyle);
        numText.x = Math.random() * pixiApp.screen.width;
        numText.y = Math.random() * pixiApp.screen.height;
        numText.alpha = Math.random() * 0.4;
        numText.speed = Math.random() * 0.3 + 0.1;
        floatingNumbers.push(numText);
        pixiApp.stage.addChild(numText);
    }

    // --- D. 動畫渲染迴圈 (Ticker) ---
    pixiApp.ticker.add((delta) => {
        const rotationSpeed = isRitualActive ? 0.05 : 0.002;
        magicCircle.rotation += rotationSpeed * delta;
        
        if (isRitualActive) {
            magicCircle.scale.x = 1 + Math.sin(Date.now() / 100) * 0.1;
            magicCircle.scale.y = 1 + Math.sin(Date.now() / 100) * 0.1;
        } else {
            magicCircle.scale.x += (1 - magicCircle.scale.x) * 0.05;
            magicCircle.scale.y += (1 - magicCircle.scale.y) * 0.05;
        }

        particles.forEach(p => {
            p.y -= p.speed * delta * (isRitualActive ? 10 : 1);
            if (p.y < 0) {
                p.y = pixiApp.screen.height;
                p.x = Math.random() * pixiApp.screen.width;
            }
        });

        floatingNumbers.forEach(num => {
            num.y -= num.speed * delta * (isRitualActive ? 5 : 1);
            num.alpha += (Math.random() - 0.5) * 0.05; 
            if (num.alpha < 0) num.alpha = 0;
            if (num.alpha > 0.5) num.alpha = 0.5;

            if (num.y < -50) {
                num.y = pixiApp.screen.height + 50;
                num.x = Math.random() * pixiApp.screen.width;
                num.text = Math.floor(Math.random() * 10).toString(); 
            }
        });
    });
}

function triggerPixiBlast() {
    isRitualActive = true;
    setTimeout(() => { isRitualActive = false; }, 1500);
}
