/**
 * 綠界 ECPay 全方位金流 AioCheckOut/V5（導轉 POST）
 * 全方位金流：https://developers.ecpay.com.tw/2864/
 * 測試環境：https://developers.ecpay.com.tw/2856/
 * 檢查碼：https://developers.ecpay.com.tw/?p=2902
 */

const crypto = require("crypto");

function isProduction() {
  return String(process.env.ECPAY_STAGE || "").toLowerCase() === "production";
}

function getCheckoutActionUrl() {
  return isProduction()
    ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
    : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";
}

function getConfig() {
  const merchantId = process.env.ECPAY_MERCHANT_ID || "";
  const hashKey = process.env.ECPAY_HASH_KEY || "";
  const hashIv = process.env.ECPAY_HASH_IV || "";
  return { merchantId, hashKey, hashIv };
}

/**
 * 產生 CheckMacValue（SHA256，EncryptType=1）
 */
function generateCheckMacValue(params, hashKey, hashIv) {
  const keys = Object.keys(params)
    .filter((k) => k !== "CheckMacValue" && params[k] !== "" && params[k] != null)
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));

  let raw = `HashKey=${hashKey}&`;
  for (const k of keys) {
    raw += `${k}=${params[k]}&`;
  }
  raw += `HashIV=${hashIv}`;

  let enc = encodeURIComponent(raw).toLowerCase();
  enc = enc.replace(/%20/g, "+");
  enc = enc.replace(/%2d/gi, "-");
  enc = enc.replace(/%5f/gi, "_");
  enc = enc.replace(/%2e/gi, ".");
  enc = enc.replace(/%21/g, "!");
  enc = enc.replace(/%2a/gi, "*");
  enc = enc.replace(/%28/g, "(");
  enc = enc.replace(/%29/g, ")");

  return crypto.createHash("sha256").update(enc).digest("hex").toUpperCase();
}

function verifyCheckMacValue(body) {
  const { hashKey, hashIv } = getConfig();
  if (!body || !body.CheckMacValue) return false;
  const received = String(body.CheckMacValue);
  const clone = { ...body };
  delete clone.CheckMacValue;
  const computed = generateCheckMacValue(clone, hashKey, hashIv);
  return received === computed;
}

function sanitizeTradeDesc(s) {
  return String(s || "商品購買")
    .replace(/[#%&<>'"\\]/g, "")
    .slice(0, 200);
}

function sanitizeItemName(s) {
  return String(s || "商品")
    .replace(/[#%&<>'"\\]/g, "")
    .slice(0, 400);
}

/** 特店訂單編號：英數混合、唯一、長度 ≤20 */
function buildMerchantTradeNo(userId) {
  const ts = String(Date.now());
  const tail = String(userId || "x")
    .replace(/[^0-9A-Za-z]/g, "")
    .slice(-5)
    .padStart(5, "0");
  const id = `BD${ts}${tail}`;
  return id.length <= 20 ? id : id.slice(0, 20);
}

function merchantTradeDateTaipei() {
  const s = new Date().toLocaleString("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return s.replace(",", "").replace(/-/g, "/").trim();
}

/**
 * 建立導轉綠界所需表單欄位（已含 CheckMacValue）
 */
function buildAioCheckoutFields({
  merchantTradeNo,
  totalAmount,
  tradeDesc,
  itemName,
  returnUrl,
  clientBackUrl,
  orderResultUrl,
}) {
  const { merchantId, hashKey, hashIv } = getConfig();
  if (!merchantId || !hashKey || !hashIv) {
    throw new Error("缺少 ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV");
  }

  const choosePayment = process.env.ECPAY_CHOOSE_PAYMENT || "ALL";

  const base = {
    MerchantID: merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: merchantTradeDateTaipei(),
    PaymentType: "aio",
    TotalAmount: String(Math.floor(Number(totalAmount))),
    TradeDesc: sanitizeTradeDesc(tradeDesc),
    ItemName: sanitizeItemName(itemName),
    ReturnURL: returnUrl,
    ChoosePayment: choosePayment,
    EncryptType: "1",
  };

  if (clientBackUrl) {
    base.ClientBackURL = clientBackUrl.slice(0, 200);
  }
  if (orderResultUrl) {
    base.OrderResultURL = orderResultUrl.slice(0, 200);
  }

  base.CheckMacValue = generateCheckMacValue(base, hashKey, hashIv);
  return base;
}

function isPaymentSuccess(rtnCode) {
  return String(rtnCode) === "1";
}

module.exports = {
  getCheckoutActionUrl,
  getConfig,
  generateCheckMacValue,
  verifyCheckMacValue,
  buildMerchantTradeNo,
  buildAioCheckoutFields,
  isPaymentSuccess,
};
