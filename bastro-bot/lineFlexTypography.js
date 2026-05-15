'use strict';

/**
 * 扣點服務 Flex 字級／色票（以塔羅為模版）。
 * 塔羅、紫微、律動能量共用；服務專屬區塊（牌圖、核心大數字）仍可在各模組覆寫。
 */
const FLEX_SIZE = Object.freeze({
    headerTitle: 'lg',
    subheading: 'md',
    body: 'md',
    sectionLabel: 'md',
    score: 'md',
    footerLabel: 'md',
    footerBalance: 'lg',
    caption: 'xs',
    micro: 'xxs',
    heroNumber: '4xl',
});

const FLEX_COLOR = Object.freeze({
    headerTitleOnGold: '#000000',
    headerTitleOnDark: '#F9E498',
    gold: '#D4AF37',
    goldLight: '#F9E498',
    body: '#E0E0E0',
    white: '#FFFFFF',
    muted: '#A0A0A0',
    mutedAlt: '#AAAAAA',
    cost: '#FF6B6B',
    costAlt: '#FF8A80',
    separator: '#333333',
});

const FLEX_PAD = Object.freeze({
    bubble: 'lg',
    header: 'md',
    footer: 'lg',
    footerCompact: '12px',
});

/** 塔羅式 header 單行（金底黑字） */
function tarotStyleHeaderBox(titleText) {
    return {
        type: 'box',
        layout: 'vertical',
        paddingAll: FLEX_PAD.header,
        contents: [
            {
                type: 'text',
                text: titleText,
                color: FLEX_COLOR.headerTitleOnGold,
                weight: 'bold',
                size: FLEX_SIZE.headerTitle,
                align: 'center',
            },
        ],
    };
}

/** 塔羅式 footer：消耗 + 餘額（分享鈕由 lineOaShare 再接） */
function tarotStylePointsFooterRows(cost, remainPoints, options = {}) {
    const costLabel = options.costLabel || '⚡ 本次消耗靈力';
    const remainLabel = options.remainLabel || '🔋 剩餘靈力餘額';
    const costColor = options.costColor || FLEX_COLOR.muted;
    const remainLabelColor = options.remainLabelColor || FLEX_COLOR.gold;
    return [
        { type: 'separator', color: options.separatorColor || FLEX_COLOR.separator },
        {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
                { type: 'text', text: costLabel, color: costColor, size: FLEX_SIZE.footerLabel, align: 'start' },
                {
                    type: 'text',
                    text: `- ${cost} 點`,
                    color: FLEX_COLOR.cost,
                    size: FLEX_SIZE.footerLabel,
                    weight: 'bold',
                    align: 'end',
                },
            ],
        },
        {
            type: 'box',
            layout: 'horizontal',
            contents: [
                { type: 'text', text: remainLabel, color: remainLabelColor, size: FLEX_SIZE.footerLabel, align: 'start' },
                {
                    type: 'text',
                    text: `${remainPoints} 點`,
                    color: FLEX_COLOR.goldLight,
                    size: FLEX_SIZE.footerBalance,
                    weight: 'bold',
                    align: 'end',
                },
            ],
        },
    ];
}

module.exports = {
    FLEX_SIZE,
    FLEX_COLOR,
    FLEX_PAD,
    tarotStyleHeaderBox,
    tarotStylePointsFooterRows,
};
