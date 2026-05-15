'use strict';

/**
 * 後端追加的「技術外層」提示（第 2 層，見 aiSettingsDefaults.js 說明）。
 * 人設與報告結構在第 1 層：aiPromptDefaults.js 預設 + Firestore 後台 prompt。
 * 塔羅／紫微：外層 【分數】+【解析】；解析內文依第 1 層四段結構。
 * 律動能量：外層 JSON；interpretation 依第 1 層三位一體解碼。
 */

const { MAX_TAROT_ZIWEI_BODY_CHARS, MAX_NUMEROLOGY_INTERPRETATION_CHARS } = require('./aiReplyLimits');

/** 塔羅／紫微共用外層格式（focusTopic 為探詢領域字串） */
function buildTarotZiweiOutputSuffix(focusTopic) {
    const topic = String(focusTopic || '綜合').trim();
    return `

🚨【系統輸出格式】(技術層，與上方 Role 並存；若有衝突以此段為準)
1. 僅允許以下外層格式，不得輸出 JSON 或 Markdown 代碼塊：
【分數】：<0～100 整數>
【解析】：
（內文從下一行開始）
2. 【解析】內文必須完整遵守你 Role 中的「報告結構」次序、Emoji、空行與手機閱讀排版；勿輸出「系統要求」或字數計算過程。
3. 【解析】內文（不含【分數】那一行）總長度不得超過 ${MAX_TAROT_ZIWEI_BODY_CHARS} 字（含標點與換行）；此為上限，依分析需要撰寫，不必寫滿；若仍超長請自行精簡各段，勿在文末註明刪修。
4. 探詢領域「${topic}」須貫穿全文論述。`;
}

/** 律動能量：後台 Prompt 已含 JSON 欄位說明，此處只補技術約束 */
function buildNumerologyOutputSuffix() {
    return `

🚨【系統輸出格式】(技術層，與上方 Role 並存；若有衝突以此段為準)
- 僅輸出單一 JSON 物件，勿 \`\`\`json 或任何 Markdown 包裝，勿前後贅語。
- interpretation 欄位不得超過 ${MAX_NUMEROLOGY_INTERPRETATION_CHARS} 字（含標點與換行）；此為上限，依分析需要撰寫，不必寫滿；須符合上方「大師指引」與三位一體解碼要求。
- coreNumber、luckySet、wealthSet、score 等欄位規則依上方「生成規則」。`;
}

module.exports = {
    buildTarotZiweiOutputSuffix,
    buildNumerologyOutputSuffix,
};
