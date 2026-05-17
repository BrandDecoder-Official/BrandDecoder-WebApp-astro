'use strict';

/**
 * Gemini API 與基礎設施「預估」成本（台幣）。
 * 費率為參考 Google 公開價格區間換算，實際帳單以 GCP / Google AI 為準。
 * 可於 Cloud Run 以環境變數覆寫（見 getInfraMonthlyEstimates）。
 */

const USD_TO_TWD = Number(process.env.USD_TO_TWD || 32);

/** USD / 1M tokens（預估；未知模型用 default） */
const MODEL_PRICING_USD_PER_MILLION = {
    'gemini-3.1-flash-lite': { input: 0.075, output: 0.3 },
    'gemini-3.1-flash-lite-preview': { input: 0.075, output: 0.3 },
    'gemini-3-flash-preview': { input: 0.1, output: 0.4 },
    'gemini-3.1-pro-preview': { input: 1.25, output: 5.0 },
    'gemini-3.1-flash-image-preview': { input: 0.15, output: 0.6 },
    'gemini-3-pro-image-preview': { input: 2.0, output: 12.0 },
    default: { input: 0.15, output: 0.6 },
};

function resolveModelPricing(model) {
    const key = String(model || '').trim();
    return MODEL_PRICING_USD_PER_MILLION[key] || MODEL_PRICING_USD_PER_MILLION.default;
}

function estimateGeminiCostUsd(model, tokensIn, tokensOut) {
    const p = resolveModelPricing(model);
    const tin = Math.max(0, Number(tokensIn) || 0);
    const tout = Math.max(0, Number(tokensOut) || 0);
    return (tin / 1e6) * p.input + (tout / 1e6) * p.output;
}

function estimateGeminiCostTwd(model, tokensIn, tokensOut) {
    return estimateGeminiCostUsd(model, tokensIn, tokensOut) * USD_TO_TWD;
}

function roundTwd(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function normalizeMetrics(metrics) {
    if (!metrics || typeof metrics !== 'object') return null;
    const tokensIn = Math.max(0, Number(metrics.tokens_in) || 0);
    const tokensOut = Math.max(0, Number(metrics.tokens_out) || 0);
    const model = String(metrics.model || 'unknown');
    const costTwd = estimateGeminiCostTwd(model, tokensIn, tokensOut);
    return {
        model,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        tokens_total: tokensIn + tokensOut,
        latency_ms: Number(metrics.latency_ms) || 0,
        cost_usd: estimateGeminiCostUsd(model, tokensIn, tokensOut),
        cost_twd: roundTwd(costTwd),
    };
}

function getInfraMonthlyEstimates() {
    return [
        {
            key: 'cloud_run',
            name: 'Cloud Run（bastro-bot）',
            monthlyTwd: Number(process.env.EST_CLOUD_RUN_TWD_MONTH || 350),
            note: '依請求量、CPU/記憶體與執行時間浮動；可設 EST_CLOUD_RUN_TWD_MONTH',
        },
        {
            key: 'firestore',
            name: 'Firestore（astro-bot-db）',
            monthlyTwd: Number(process.env.EST_FIRESTORE_TWD_MONTH || 120),
            note: '讀寫次數、儲存量；可設 EST_FIRESTORE_TWD_MONTH',
        },
        {
            key: 'gemini_api',
            name: 'Gemini API（依下方 Token 加總）',
            monthlyTwd: 0,
            note: '由日誌 Token 換算，非固定月費',
            dynamic: true,
        },
        {
            key: 'github_pages',
            name: 'GitHub Pages（官網靜態）',
            monthlyTwd: Number(process.env.EST_GITHUB_PAGES_TWD_MONTH || 0),
            note: '公開 repo 靜態站多為免費額度內',
        },
        {
            key: 'line',
            name: 'LINE Messaging API',
            monthlyTwd: Number(process.env.EST_LINE_TWD_MONTH || 0),
            note: '免費額度內常為 0；推播/訊息超量另計',
        },
        {
            key: 'ecpay',
            name: '綠界金流手續費（預估）',
            monthlyTwd: Number(process.env.EST_ECPAY_FEE_TWD_MONTH || 0),
            note: '依實際成交額 × 費率；此處僅占位，可手動填 EST_ECPAY_FEE_TWD_MONTH',
        },
    ];
}

function prorateMonthlyToPeriod(monthlyTwd, periodDays) {
    const days = Math.max(1, Number(periodDays) || 30);
    return roundTwd((Number(monthlyTwd) || 0) * (days / 30));
}

function aggregateLogsAiCost(logs) {
    const totals = {
        calls: 0,
        callsWithMetrics: 0,
        tokensIn: 0,
        tokensOut: 0,
        costTwd: 0,
        byModel: {},
        byService: {},
    };

    for (const log of logs) {
        const m = normalizeMetrics(log.metrics);
        if (!m || (m.tokens_in === 0 && m.tokens_out === 0 && m.model === 'unknown')) continue;

        totals.callsWithMetrics += 1;
        totals.tokensIn += m.tokens_in;
        totals.tokensOut += m.tokens_out;
        totals.costTwd += m.cost_twd;

        const svc = log.type || log.serviceType || 'other';
        if (!totals.byService[svc]) {
            totals.byService[svc] = { calls: 0, tokensIn: 0, tokensOut: 0, costTwd: 0 };
        }
        totals.byService[svc].calls += 1;
        totals.byService[svc].tokensIn += m.tokens_in;
        totals.byService[svc].tokensOut += m.tokens_out;
        totals.byService[svc].costTwd = roundTwd(totals.byService[svc].costTwd + m.cost_twd);

        if (!totals.byModel[m.model]) {
            totals.byModel[m.model] = { calls: 0, tokensIn: 0, tokensOut: 0, costTwd: 0 };
        }
        totals.byModel[m.model].calls += 1;
        totals.byModel[m.model].tokensIn += m.tokens_in;
        totals.byModel[m.model].tokensOut += m.tokens_out;
        totals.byModel[m.model].costTwd = roundTwd(totals.byModel[m.model].costTwd + m.cost_twd);
    }

    totals.costTwd = roundTwd(totals.costTwd);
    totals.calls = logs.length;
    return totals;
}

module.exports = {
    USD_TO_TWD,
    MODEL_PRICING_USD_PER_MILLION,
    estimateGeminiCostTwd,
    normalizeMetrics,
    getInfraMonthlyEstimates,
    prorateMonthlyToPeriod,
    aggregateLogsAiCost,
};
