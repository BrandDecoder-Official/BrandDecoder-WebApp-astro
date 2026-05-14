/**
 * LIFF：電腦／桌面環境僅允許 ENV.LIFF_PC_ALLOW_USER_IDS 內的 userId（sub）。
 * 依賴：先載入 /env.js 與 LIFF SDK，再載入本檔。
 */
(function (global) {
    function getPcAllowUserIds() {
        if (typeof ENV === "undefined" || ENV == null) return [];
        const raw = ENV.LIFF_PC_ALLOW_USER_IDS;
        if (raw == null || raw === "") return [];
        if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
        return String(raw).split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    }

    function getIdTokenSub() {
        if (typeof liff === "undefined" || !liff) return null;
        try {
            if (typeof liff.getDecodedIDToken === "function") {
                const d = liff.getDecodedIDToken();
                if (d && d.sub) return d.sub;
            }
        } catch (e) { /* ignore */ }
        try {
            const t = liff.getIDToken && liff.getIDToken();
            if (!t) return null;
            const p = t.split(".")[1];
            const b = p.replace(/-/g, "+").replace(/_/g, "/");
            const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
            const json = JSON.parse(atob(b + pad));
            return json.sub || null;
        } catch (e) {
            return null;
        }
    }

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

    function showPlatformGate(title, detail) {
        const prev = document.getElementById("liff-pc-gate-overlay");
        if (prev) prev.remove();
        const el = document.createElement("div");
        el.id = "liff-pc-gate-overlay";
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
            '<button type="button" id="liff-pc-gate-close" style="margin-top:22px;padding:10px 24px;border-radius:22px;border:1px solid #D4AF37;background:transparent;color:#D4AF37;font-weight:bold;cursor:pointer;">關閉</button></div>';
        document.body.appendChild(el);
        document.getElementById("liff-pc-gate-close").addEventListener("click", function () {
            if (typeof liff !== "undefined" && liff && typeof liff.closeWindow === "function") {
                liff.closeWindow();
            } else {
                el.remove();
            }
        });
    }

    /**
     * @returns {boolean} true = 可繼續；false = 已顯示阻擋畫面，應中止初始化
     */
    function enforceDesktopAllowlist() {
        const allow = getPcAllowUserIds();
        if (allow.length === 0) return true;
        if (!isLikelyDesktopLineClient()) return true;
        const sub = getIdTokenSub();
        if (sub && allow.includes(sub)) return true;
        showPlatformGate(
            "請改用手機 LINE",
            "此功能在電腦／平板類環境僅限指定帳號使用。請以手機開啟官方帳號選單內的連結；若您為直播觀眾，無需於此頁登入。",
        );
        return false;
    }

    global.LiffPcAllowlist = {
        enforceDesktopAllowlist: enforceDesktopAllowlist,
        getPcAllowUserIds: getPcAllowUserIds,
        getIdTokenSub: getIdTokenSub,
        isLikelyDesktopLineClient: isLikelyDesktopLineClient,
    };
})(typeof window !== "undefined" ? window : this);
