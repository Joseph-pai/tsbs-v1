export const CONFIG = {
    FINMIND: {
        API_URL: 'https://api.finmindtrade.com/api/v4/data',
        TOKEN: process.env.FINMIND_TOKEN || '',
    },
    SYSTEM: {
        V_RATIO_THRESHOLD: 3.5,     // 提高至 3.5
        MA_ALIGNMENT_THRESHOLD: 0.02, // 2%
        INST_BUY_STREAK: 3,        // 3 days
        BULLISH_REWARD: 1.2,       // 多頭排列加成
        BEARISH_PENALTY: 0.5,      // 空頭排列扣分
        CHIP_RATIO_THRESHOLD: 0.01, // 籌碼佔比 1% 為強勢
    }
} as const;
