// ==========================================
// BrandDecoder - LINE Pay 金流管家 (payments.js)
// ==========================================

const crypto = require('crypto');
const axios = require('axios');

// 💡 讀取 GCP 環境變數，自動判斷是 Sandbox 或是 正式環境
const LINEPAY_CONFIG = {
    channelId: process.env.LINEPAY_CHANNEL_ID,
    channelSecret: process.env.LINEPAY_CHANNEL_SECRET,
    baseUrl: process.env.LINEPAY_ENV === 'sandbox' 
        ? 'https://sandbox-api-pay.line.me' 
        : 'https://api-pay.line.me'
};

// 🌟 內部核心工具：生成 LINE Pay 規定的 V3 嚴格加密簽名
function generateSignature(uri, body, nonce) {
    const signatureRaw = LINEPAY_CONFIG.channelSecret + uri + JSON.stringify(body) + nonce;
    return crypto
        .createHmac('sha256', LINEPAY_CONFIG.channelSecret)
        .update(signatureRaw)
        .digest('base64');
}

/**
 * 1. 發送付款請求 (Request API)
 * 告訴 LINE Pay：「我要收這筆錢，請給我一個綠色的付款網址」
 */
async function requestPayment(orderId, amount, productName) {
    const uri = '/v3/payments/request';
    const nonce = Date.now().toString(); // 產生唯一隨機數防重放攻擊
    
    // ⚠️ 這是從你的截圖中抓取的 GCP Cloud Run 網址
    // 如果未來伺服器網址有變，請記得來這裡修改
    const backendUrl = 'https://bastro-bot-217800246535.asia-east1.run.app';

    const body = {
        amount: amount,
        currency: 'TWD',
        orderId: orderId,
        packages: [{
            id: `PKG_${orderId}`,
            amount: amount,
            name: '命運解碼室 - 靈力儲值',
            products: [{
                name: productName,
                quantity: 1,
                price: amount
            }]
        }],
        redirectUrls: {
            // ✅ 付款成功後，LINE Pay 會把用戶導向你的後端 Confirm API 進行最後發點數
            confirmUrl: `${backendUrl}/api/pay/confirm`,
            
            // ❌ 如果用戶在付款畫面按取消，則直接導回會員中心前端
            cancelUrl: `https://branddecoderai.com/member/membership.html` 
        }
    };

    const signature = generateSignature(uri, body, nonce);
    
    // 發送 POST 請求給 LINE Pay 總部
    const res = await axios.post(LINEPAY_CONFIG.baseUrl + uri, body, {
        headers: {
            'Content-Type': 'application/json',
            'X-LINE-ChannelId': LINEPAY_CONFIG.channelId,
            'X-LINE-Authorization-Nonce': nonce,
            'X-LINE-Authorization': signature
        }
    });

    return res.data;
}

/**
 * 2. 確認扣款 (Confirm API)
 * 用戶付完錢跳轉回來後，必須執行這步，錢才會真正進帳
 */
async function confirmPayment(transactionId, amount) {
    const uri = `/v3/payments/${transactionId}/confirm`;
    const nonce = Date.now().toString();
    const body = { 
        amount: amount, 
        currency: 'TWD' 
    };

    const signature = generateSignature(uri, body, nonce);
    
    const res = await axios.post(LINEPAY_CONFIG.baseUrl + uri, body, {
        headers: {
            'Content-Type': 'application/json',
            'X-LINE-ChannelId': LINEPAY_CONFIG.channelId,
            'X-LINE-Authorization-Nonce': nonce,
            'X-LINE-Authorization': signature
        }
    });

    return res.data;
}

// 將這兩個功能匯出，讓 index.js 可以呼叫使用
module.exports = { requestPayment, confirmPayment };