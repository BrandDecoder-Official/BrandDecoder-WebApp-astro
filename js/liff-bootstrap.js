/**
 * LIFF 單次初始化：避免重複 liff.init() 導致 reject，但登入狀態仍可用。
 * 依賴：LIFF SDK、/env.js
 */
(function (global) {
    const bootedIds = new Set();

    async function bootstrapLiff(liffId) {
        if (!global.liff) throw new Error('LIFF SDK 未載入');
        if (bootedIds.has(liffId)) return;

        try {
            await liff.init({ liffId });
        } catch (err) {
            if (typeof liff.isLoggedIn === 'function' && liff.isLoggedIn()) {
                bootedIds.add(liffId);
                return;
            }
            throw err;
        }
        bootedIds.add(liffId);
    }

    /**
     * @returns {{ token: string, profile?: object }}
     */
    async function requireLiffSession(liffId, options) {
        const opts = options || {};
        await bootstrapLiff(liffId);

        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: opts.redirectUri || global.location.href });
            const e = new Error('LIFF_LOGIN_REDIRECT');
            e.code = 'LIFF_LOGIN_REDIRECT';
            throw e;
        }

        if (opts.mobileOnly !== false && global.LiffMobileOnly && !LiffMobileOnly.enforceMobileLiffOnly()) {
            const e = new Error('LIFF_MOBILE_ONLY');
            e.code = 'LIFF_MOBILE_ONLY';
            throw e;
        }

        const token = liff.getAccessToken();
        if (!token) throw new Error('無法取得安全通行證');

        const out = { token };
        if (opts.withProfile) {
            try {
                out.profile = await liff.getProfile();
            } catch (profileErr) {
                console.warn('liff.getProfile 略過', profileErr);
            }
        }
        return out;
    }

    async function showResultReport(options) {
        const title = options.title || '解碼報告';
        const score = options.score || '--';
        const subtitle = options.subtitle || '';
        const detailsHtml = options.detailsHtml || '';
        const rawText = options.rawText || '';
        const flexMessage = options.flexMessage;

        // 🌟 1. 如果在 LINE App 內，進行「背景自動傳送 + 傳送成功直接關閉網頁」
        if (global.liff && typeof liff.isInClient === 'function' && liff.isInClient() && flexMessage) {
            let success = false;
            let retryCount = 0;
            const maxRetries = 3;

            while (!success && retryCount < maxRetries) {
                try {
                    await liff.sendMessages([flexMessage]);
                    success = true;
                    console.log("🔥 [自動傳送] 成功，直接關閉 LIFF 網頁");
                    liff.closeWindow();
                    return; // 🚀 傳送成功直接關閉並結束，不顯示毛玻璃畫面
                } catch (err) {
                    retryCount++;
                    console.warn(`🔥 [自動傳送] 失敗 (第 ${retryCount} 次重試):`, err);
                    if (retryCount < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒後重試
                    }
                }
            }
            console.error("🔥 [自動傳送] 失敗且已達最大重試次數，將開啟毛玻璃頁面供用戶閱讀與手動重傳");
        }

        // 🌟 2. 兜底流程 (若自動傳送失敗，或在一般瀏覽器中) ➡️ 建立並顯示毛玻璃畫面
        // Create container
        const container = document.createElement('div');
        container.id = 'liff-result-report-overlay';
        container.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 99999;
            background: rgba(7, 8, 13, 0.96);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 24px 20px;
            font-family: 'PingFang TC', 'Noto Serif TC', serif;
            color: #ececf0;
            overflow-y: auto;
            opacity: 0;
            transition: opacity 0.5s ease;
        `;

        // HTML Structure (已修正反斜線 \ 逸出字元 Bug)
        container.innerHTML = `
            <div style="width: 100%; max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; padding-bottom: 40px;">
                <!-- Header -->
                <div style="text-align: center; margin-top: 10px;">
                    <div style="color: #D4AF37; font-size: 14px; letter-spacing: 3px; font-weight: bold; margin-bottom: 6px;">命運解碼室</div>
                    <h1 style="color: #fff; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 0; text-shadow: 0 0 15px rgba(212,175,55,0.3);">${title}</h1>
                </div>

                <!-- Score / Summary Card -->
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(212,175,55,0.25); border-radius: 16px; padding: 20px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center; gap: 10px;">
                    ${subtitle ? `<div style="color: #ccc; font-size: 14px; font-style: italic;">${subtitle}</div>` : ''}
                    ${detailsHtml ? `<div style="margin: 5px 0; font-size: 15px; color: #fff;">${detailsHtml}</div>` : ''}
                    <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 5px;">
                        <span style="color: #aaa; font-size: 15px; letter-spacing: 1px;">綜合運勢指數：</span>
                        <span style="color: #F9E498; font-size: 32px; font-weight: 900; font-family: 'Times New Roman', serif; text-shadow: 0 0 10px rgba(249,228,152,0.6);">${score} 分</span>
                    </div>
                </div>

                <!-- AI Details Text -->
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 22px 18px; box-shadow: inset 0 0 20px rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 16px;">
                    <div style="color: #D4AF37; font-size: 15px; font-weight: bold; letter-spacing: 2px; border-bottom: 1px dashed rgba(212,175,55,0.2); padding-bottom: 8px; margin-bottom: 4px;">✨ 大師天命指引</div>
                    <div style="color: #dfdfe5; font-size: 15px; line-height: 1.8; letter-spacing: 0.5px; white-space: pre-wrap; text-align: justify; height: 260px; overflow-y: auto; padding-right: 8px;" class="report-content-scroll">${rawText}</div>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
                    <button id="btn-report-share" style="width: 100%; padding: 16px; border: none; border-radius: 50px; background: linear-gradient(135deg, #4CAF50, #2E7D32); color: #fff; font-size: 16px; font-weight: bold; letter-spacing: 2px; cursor: pointer; box-shadow: 0 4px 15px rgba(76,175,80,0.3); transition: transform 0.2s;">
                        回聊天室看結果
                    </button>
                    <button id="btn-report-close" style="width: 100%; padding: 16px; border: 1px solid rgba(255,255,255,0.15); border-radius: 50px; background: rgba(255,255,255,0.05); color: #ccc; font-size: 16px; font-weight: bold; letter-spacing: 2px; cursor: pointer; transition: transform 0.2s;">
                        分享給好友
                    </button>
                </div>
            </div>
        `;

        // Append to body
        document.body.appendChild(container);
        // Trigger transition
        setTimeout(() => { container.style.opacity = '1'; }, 50);

        // Styling scrollbar for report-content-scroll
        const styleEl = document.createElement('style');
        styleEl.innerText = `
            .report-content-scroll::-webkit-scrollbar { width: 4px; }
            .report-content-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
            .report-content-scroll::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.3); border-radius: 2px; }
        `;
        document.head.appendChild(styleEl);

        // Share to friends button logic (原 closeBtn，現在是黑色按鈕「分享給好友」)
        const closeBtn = container.querySelector('#btn-report-close');
        closeBtn.addEventListener('click', async () => {
            if (global.liff && typeof liff.isApiAvailable === 'function' && liff.isApiAvailable('shareTargetPicker')) {
                try {
                    closeBtn.disabled = true;
                    closeBtn.innerText = '請選擇分享對象...';
                    const res = await liff.shareTargetPicker([flexMessage]);
                    if (res) {
                        closeBtn.innerText = '✓ 已分享給好友';
                        closeBtn.style.color = '#7dcea0';
                        setTimeout(() => {
                            closeBtn.disabled = false;
                            closeBtn.innerText = '分享給好友';
                            closeBtn.style.color = '#ccc';
                        }, 2000);
                    } else {
                        // 使用者取消分享
                        closeBtn.disabled = false;
                        closeBtn.innerText = '分享給好友';
                    }
                } catch (err) {
                    console.error("liff.shareTargetPicker 失敗:", err);
                    alert("無法開啟分享視窗，請確認 LINE 授權");
                    closeBtn.disabled = false;
                    closeBtn.innerText = '分享給好友';
                }
            } else {
                alert("此環境不支援分享給好友，或請在 LINE 內開啟");
            }
        });

        // Share button logic (原 shareBtn，現在是綠色按鈕「回聊天室看結果」的兜底發送 + 關閉)
        const shareBtn = container.querySelector('#btn-report-share');
        if (global.liff && typeof liff.isInClient === 'function' && liff.isInClient()) {
            shareBtn.addEventListener('click', async () => {
                shareBtn.disabled = true;
                shareBtn.innerText = '傳送中...';
                try {
                    await liff.sendMessages([flexMessage]);
                    shareBtn.innerText = '✓ 傳送成功，即將關閉...';
                    shareBtn.style.background = '#2E7D32';
                    setTimeout(() => {
                        liff.closeWindow();
                    }, 1000);
                } catch (err) {
                    console.error("liff.sendMessages 失敗:", err);
                    shareBtn.disabled = false;
                    shareBtn.innerText = '傳送失敗，再試一次';
                    shareBtn.style.background = '#d32f2f';
                }
            });
        } else {
            // Outside LINE app (e.g. standard browser test)
            shareBtn.innerText = '複製解碼報告';
            shareBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(rawText);
                    shareBtn.innerText = '✓ 報告已複製到剪貼簿';
                    setTimeout(() => {
                        shareBtn.innerText = '複製解碼報告';
                    }, 2000);
                } catch (e) {
                    alert("請自行選取內容複製！");
                }
            });
        }
    }

    global.BdLiff = { bootstrapLiff, requireLiffSession, showResultReport };
})(typeof window !== 'undefined' ? window : this);
