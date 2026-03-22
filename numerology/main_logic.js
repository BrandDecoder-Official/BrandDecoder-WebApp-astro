// ==========================================
// 1. 全域變數與設定
// ==========================================
let userId = "U_TEST_88888888";
let userPoints = 520;
const COST_POINTS = 10;

// PixiJS 專用變數
let pixiApp;
let magicCircle; // 法陣容器
let particles = []; // 星塵粒子陣列
let floatingNumbers = []; // 漂浮數字陣列
let isRitualActive = false; // 是否進入「爆發狀態」

// ==========================================
// 2. 初始化 (Initialization)
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("系統啟動：開始掛載大師引擎...");

    // 1. 啟動視覺拉滿的 PixiJS 引擎
    initPixiBackground();

    // 2. 模擬去後台驗證身分與點數
    setTimeout(() => {
        if (userPoints >= COST_POINTS) {
            switchScreen('step-calibration', 'step-ritual');
            // 校準完成，法陣稍微加速
            isRitualActive = false; 
        }
    }, 2000);
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

// 點擊啟動按鈕
document.getElementById('btn-activate').addEventListener('click', () => {
    switchScreen('step-ritual', 'step-result');
    triggerPixiBlast(); // 觸發視覺爆發！
    
    // 模擬 AI 運算延遲後顯示結果
    setTimeout(() => {
        document.getElementById('numbers-grid').innerHTML = `
            <div style="margin-bottom: 30px;">
                <span style="font-size: 1.2rem; color: #A0A0B0;">核心能量</span><br>
                <span style="font-size: 4.5rem; color: #E5C07B; font-weight: bold; text-shadow: 0 0 20px rgba(229,192,123,0.8);">8</span>
            </div>
            <div style="font-size: 1.5rem; color: #E0E0E0; letter-spacing: 4px;">
                26 · 47 · 11 · 12 · 35
            </div>
        `;
        document.getElementById('interpretation-text').innerHTML = 
            "<span style='color:#E5C07B'>【豐盛之鑰】</span><br>今日磁場強大，數字 8 為您匯聚財富頻率。<br>請留意身邊帶有 26 與 12 的人事物。";
    }, 1500);
});


// ==========================================
// 4. PixiJS 視覺引擎 (核心特效區)
// ==========================================
function initPixiBackground() {
    const container = document.getElementById('pixi-container');
    
    // 建立應用程式 (透明背景，讓 CSS 的深邃黑透出來)
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

    // 畫外圓環 (虛線感)
    const outerRing = new PIXI.Graphics();
    outerRing.lineStyle(2, 0xE5C07B, 0.4);
    outerRing.drawCircle(0, 0, 180);
    // 畫內圓環
    const innerRing = new PIXI.Graphics();
    innerRing.lineStyle(1, 0x7B84E5, 0.6);
    innerRing.drawCircle(0, 0, 160);
    // 畫幾何多邊形 (八角星)
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
        fontFamily: 'Arial',
        fontSize: 24,
        fill: '#E5C07B',
        opacity: 0.3,
        fontWeight: 'bold'
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
        // 法陣旋轉 (如果觸發儀式，轉速暴增)
        const rotationSpeed = isRitualActive ? 0.05 : 0.002;
        magicCircle.rotation += rotationSpeed * delta;
        
        // 如果觸發儀式，法陣脈衝放大
        if (isRitualActive) {
            magicCircle.scale.x = 1 + Math.sin(Date.now() / 100) * 0.1;
            magicCircle.scale.y = 1 + Math.sin(Date.now() / 100) * 0.1;
        } else {
            // 恢復平穩
            magicCircle.scale.x += (1 - magicCircle.scale.x) * 0.05;
            magicCircle.scale.y += (1 - magicCircle.scale.y) * 0.05;
        }

        // 粒子緩慢上升
        particles.forEach(p => {
            p.y -= p.speed * delta * (isRitualActive ? 10 : 1);
            if (p.y < 0) {
                p.y = pixiApp.screen.height;
                p.x = Math.random() * pixiApp.screen.width;
            }
        });

        // 數字緩慢漂浮與閃爍
        floatingNumbers.forEach(num => {
            num.y -= num.speed * delta * (isRitualActive ? 5 : 1);
            num.alpha += (Math.random() - 0.5) * 0.05; // 閃爍效果
            if (num.alpha < 0) num.alpha = 0;
            if (num.alpha > 0.5) num.alpha = 0.5;

            if (num.y < -50) {
                num.y = pixiApp.screen.height + 50;
                num.x = Math.random() * pixiApp.screen.width;
                num.text = Math.floor(Math.random() * 10).toString(); // 換個數字
            }
        });
    });
}

// 觸發視覺爆發
function triggerPixiBlast() {
    console.log("PixiJS: 啟動超空間震盪特效！");
    isRitualActive = true;
    
    // 震盪 1.5 秒後恢復平靜的高級質感
    setTimeout(() => {
        isRitualActive = false;
    }, 1500);
}
