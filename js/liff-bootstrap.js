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

    global.BdLiff = { bootstrapLiff, requireLiffSession };
})(typeof window !== 'undefined' ? window : this);
