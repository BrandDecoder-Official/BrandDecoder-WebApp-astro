'use strict';

let sharePlainText = '';

/** LIFF 從 liff.line.me/…?token=xx 進入時，參數常在 liff.state 而非 ?token= */
function getShareToken() {
    const q = new URLSearchParams(window.location.search);
    let token = q.get('token');
    if (token) return token;

    const state = q.get('liff.state');
    if (state) {
        const stateQuery = state.startsWith('?') ? state.slice(1) : state;
        token = new URLSearchParams(stateQuery).get('token');
        if (token) return token;
    }

    const hash = window.location.hash.replace(/^#/, '');
    if (hash) {
        token = new URLSearchParams(hash.startsWith('?') ? hash.slice(1) : hash).get('token');
    }
    return token || '';
}

function setStatus(msg, isError) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('err', !!isError);
}

function showError(msg) {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.textContent = msg;
        loader.classList.add('err');
    }
    setStatus('', true);
}

function canTryShareTargetPicker() {
    if (typeof liff === 'undefined' || !liff.isInClient || !liff.isInClient()) {
        return false;
    }
    if (typeof liff.isApiAvailable === 'function' && liff.isApiAvailable('shareTargetPicker')) {
        return true;
    }
    // 部分 LINE 版本 isApiAvailable 誤報 false，仍於 App 內嘗試一次
    return true;
}

function updateShareButtons() {
    const btnShare = document.getElementById('btn-share');
    const btnCopy = document.getElementById('btn-copy');
    const inClient = typeof liff !== 'undefined' && liff.isInClient && liff.isInClient();
    const pickerMaybe = canTryShareTargetPicker();

    if (btnShare) {
        btnShare.style.display = pickerMaybe ? 'block' : 'none';
    }
    if (btnCopy) {
        btnCopy.style.display = 'block';
    }
    if (!inClient && btnShare) {
        btnShare.style.display = 'none';
        setStatus('請從 LINE App 內開啟此分享連結；或改用下方複製全文', true);
    }
}

async function copyPlainText() {
    if (!sharePlainText) return false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(sharePlainText);
            return true;
        }
    } catch (e) { /* fallback below */ }
    const ta = document.createElement('textarea');
    ta.value = sharePlainText;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
}

document.addEventListener('DOMContentLoaded', async () => {
    const token = getShareToken();
    if (!token) {
        showError('缺少分享連結參數');
        return;
    }
    if (!ENV.SHARE_LIFF_ID) {
        showError('分享功能尚未設定（SHARE_LIFF_ID）');
        return;
    }

    try {
        await BdLiff.requireLiffSession(ENV.SHARE_LIFF_ID);

        const res = await fetch(`${ENV.API_BASE}/api/public/share/${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!json.success || !json.data || !json.data.plainText) {
            throw new Error(json.msg || '無法載入解盤內容');
        }

        sharePlainText = json.data.plainText;
        const preview = document.getElementById('preview');
        if (preview) preview.textContent = sharePlainText;

        document.getElementById('loader').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        updateShareButtons();
    } catch (err) {
        if (err && err.code === 'LIFF_LOGIN_REDIRECT') return;
        if (err && err.code === 'LIFF_MOBILE_ONLY') return;
        console.error(err);
        showError((err && err.message) || '載入失敗');
    }
});

document.getElementById('btn-share').addEventListener('click', async () => {
    const btn = document.getElementById('btn-share');
    if (!sharePlainText) {
        setStatus('尚無可分享內容', true);
        return;
    }
    if (!liff.isInClient || !liff.isInClient()) {
        setStatus('請在 LINE App 內開啟；或改用「複製全文」', true);
        return;
    }

    btn.disabled = true;
    setStatus('請選擇要傳送的聊天室…');

    try {
        const result = await liff.shareTargetPicker([
            { type: 'text', text: sharePlainText },
        ]);
        if (result && result.status === 'success') {
            setStatus('已傳送');
            setTimeout(() => {
                if (typeof liff.closeWindow === 'function') liff.closeWindow();
            }, 800);
        } else {
            setStatus('已取消');
        }
    } catch (err) {
        console.error('shareTargetPicker', err);
        const msg = (err && err.message) || '';
        if (/not supported|unavailable|not available/i.test(msg)) {
            setStatus('此環境不支援一鍵分享，請用「複製全文」', true);
        } else {
            setStatus('分享未完成，請用「複製全文」或再試一次', true);
        }
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btn-copy').addEventListener('click', async () => {
    const ok = await copyPlainText();
    if (ok) {
        setStatus('已複製！請到聊天室長按貼上傳送');
    } else {
        setStatus('複製失敗，請長按上方預覽區手動選取複製', true);
    }
});
