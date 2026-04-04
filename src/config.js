require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN || '8678648564:AAEnTZUyIjFUIRDXxtk3Et5iXzho-wIxwbc',
    ADMIN_ID: parseInt(process.env.ADMIN_ID) || 0,

    // Bank config for VietQR
    BANK: {
        BIN: process.env.BANK_BIN || '970415',
        ACCOUNT: process.env.BANK_ACCOUNT || '109880852981',
        ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME || 'DUONG DANG TUAN',
        NAME: process.env.BANK_NAME || 'MB',
    },

    BANK2: process.env.BANK2_ACCOUNT ? {
        BIN: process.env.BANK2_BIN || '970415',
        ACCOUNT: process.env.BANK2_ACCOUNT || '109880852981',
        ACCOUNT_NAME: process.env.BANK2_ACCOUNT_NAME || 'DUONG DANG TUAN',
        NAME: process.env.BANK2_NAME || 'ICB',
    } : null,

    // Payment
    WEBHOOK_PORT: parseInt(process.env.WEBHOOK_PORT) || 3000,
    SEPAY_API_KEY: process.env.SEPAY_API_KEY || '',

    // Shop
    SHOP_NAME: process.env.SHOP_NAME || 'Hely IOS VN',
    SUPPORT_CONTACT: process.env.SUPPORT_CONTACT || '@helyiosvietnam',
};
