'use strict';

let sharePlainText = '';

function getShareToken() {
    return new URLSearchParams(window.location.search).get('token') || '';
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
    if (!liff.isApiAvailable || !liff.isApiAvailable('shareTargetPicker')) {
        setStatus('請在手機 LINE App 內使用分享', true);
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
        setStatus('分享未完成，請再試一次', true);
    } finally {
        btn.disabled = false;
    }
});
