
// ==========================================
// 🔮 2. 算命 Ritual 邏輯 (AGUI 秒回關閉 + 雙重保險版)
// ==========================================
btnActivate.addEventListener('click', async (e) => {
    // 阻止事件冒泡，確保只有按鈕本身被點擊
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
            
            // 🌟 D. 終極雙重保險：強制關閉 LIFF
            setTimeout(() => {
                try {
                    // 方法 1：標準關閉
                    liff.closeWindow(); 
                } catch(e) {
                    console.log("liff.closeWindow 失敗", e);
                }
                
                // 方法 2：如果方法 1 裝死，我們用原生視窗關閉指令強制送客
                setTimeout(() => {
                    window.close();
                    // 方法 3：有些 iOS 版本吃這套
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
