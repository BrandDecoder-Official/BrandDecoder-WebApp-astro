/**
 * 強制：須在 LINE 內開啟（liff.isInClient），且不接受電腦版 LINE／桌面類環境。
 * 依賴：先載入 /env.js 與 LIFF SDK，再載入本檔。
 */
(function (global) {
    function isLikelyDesktopLineClient() {
        if (typeof liff === "undefined" || !liff || !liff.isInClient || !liff.isInClient()) return false;
        let os = "";
        try {
            if (typeof liff.getOS === "function") os = String(liff.getOS() || "");
        } catch (e) { /* ignore */ }
        if (os === "ios" || os === "android") return false;
        if (os === "mac" || os === "windows" || os === "linux") return true;
        const ua = navigator.userAgent || "";
        if (/(iPhone|iPod)(?!.*Simulator)/i.test(ua)) return false;
        if (/Android.*Mobile/i.test(ua)) return false;
        if (/Windows NT|Macintosh|Mac OS X|Win64|CrOS|X11; Linux x86_64|Linux x86_64/i.test(ua)) return true;
        return false;
    }

    function showGate(title, detail) {
        const prev = document.getElementById("liff-mobile-gate-overlay");
        if (prev) prev.remove();
        const el = document.createElement("div");
        el.id = "liff-mobile-gate-overlay";
        el.style.cssText =
            "position:fixed;inset:0;z-index:2147483647;background:#050508;display:flex;align-items:center;justify-content:center;padding:20px;font-family:'PingFang TC','Microsoft JhengHei',sans-serif;";
        el.innerHTML =
            '<div style="max-width:320px;text-align:center;padding:24px;color:#D4AF37;font-size:15px;line-height:1.7;">' +
            '<p style="margin:0 0 12px;font-size:17px;font-weight:bold;">' +
            title +
            "</p>" +
            '<p style="margin:0;color:#ccc;font-size:14px;">' +
            detail +
            "</p>" +
            '<button type="button" id="liff-mobile-gate-close" style="margin-top:22px;padding:10px 24px;border-radius:22px;border:1px solid #D4AF37;background:transparent;color:#D4AF37;font-weight:bold;cursor:pointer;">關閉</button></div>';
        document.body.appendChild(el);
        document.getElementById("liff-mobile-gate-close").addEventListener("click", function () {
            if (typeof liff !== "undefined" && liff && typeof liff.closeWindow === "function") {
                liff.closeWindow();
            } else {
                el.remove();
            }
        });
    }

    /**
     * @returns {boolean} true = 可繼續初始化
     */
    function enforceMobileLiffOnly() {
        if (typeof liff === "undefined" || !liff) {
            showGate("無法啟動", "請重新整理或從 LINE 官方帳號選單開啟。");
            return false;
        }
        if (!liff.isInClient()) {
            showGate(
                "請在 LINE 內開啟",
                "此頁僅能在 LINE App 內使用。請關閉目前分頁，回到官方帳號聊天室或圖文選單重新開啟連結。",
            );
            return false;
        }
        if (isLikelyDesktopLineClient()) {
            showGate(
                "請改用手機 LINE",
                "為維持與命理互動相同的體驗，本功能不支援電腦版 LINE 或桌面瀏覽器。請使用手機上的 LINE 開啟官方帳號內的連結。",
            );
            return false;
        }
        return true;
    }

    global.LiffMobileOnly = {
        enforceMobileLiffOnly: enforceMobileLiffOnly,
        isLikelyDesktopLineClient: isLikelyDesktopLineClient,
    };
})(typeof window !== "undefined" ? window : this);
