require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN || '8678648564:AAEnTZUyIjFUIRDXxtk3Et5iXzho-wIxwbc',
    ADMIN_IDS: (process.env.ADMIN_ID || '0').split(',').map(id => parseInt(id.trim())),
    ADMIN_ID: parseInt((process.env.ADMIN_ID || '0').split(',')[0].trim()), // Legacy support for single ID logic if needed

    // Bank config for VietQR
    BANK: {
        BIN: process.env.BANK_BIN || '970415',
        ACCOUNT: process.env.BANK_ACCOUNT || '109880852981',
        ACCOUNT_NAME: process.env.BANK_ACCOUNT_NAME || 'DUONG DANG TUAN',
        NAME: process.env.BANK_NAME || 'ICB',
    },

    BANK2: process.env.BANK2_ACCOUNT ? {
        BIN: process.env.BANK2_BIN || '970415',
        ACCOUNT: process.env.BANK2_ACCOUNT || '109880852981',
        ACCOUNT_NAME: process.env.BANK2_ACCOUNT_NAME || 'DUONG DANG TUAN',
        NAME: process.env.BANK2_NAME || 'ICB',
    } : null,

    // Payment
    WEBHOOK_PORT: parseInt(process.env.PORT || process.env.WEBHOOK_PORT) || 3000,
    SEPAY_API_KEY: process.env.SEPAY_API_KEY || '',
    DASHBOARD_API_KEY: process.env.DASHBOARD_API_KEY || 'your-secret-api-key',

    // Mini App
    WEBAPP_URL: process.env.WEBAPP_URL || '',

    // Shop
    SHOP_NAME: process.env.SHOP_NAME || 'Hely IOS VN',
    SUPPORT_CONTACT: process.env.SUPPORT_CONTACT || '@helyiosvietnam',
};
