const userService = require('../services/userService');
const productService = require('../services/productService');
const messages = require('../utils/messages');
const { mainMenuKeyboard, quantityKeyboard } = require('../utils/keyboard');
const { Markup } = require('telegraf');
const config = require('../config');

module.exports = (bot) => {
    bot.start((ctx) => {
        // Clear support session if active
        if (ctx.session) {
            ctx.session.in_support = false;
        }
        
        const user = userService.findOrCreate(ctx.from);
        const startPayload = ctx.startPayload;

        // Handle deep-links (e.g. /start buy_123)
        if (startPayload && startPayload.startsWith('buy_')) {
            const productId = parseInt(startPayload.replace('buy_', ''));
            const product = productService.getById(productId);

            if (product) {
                // Duplicate logic from productSelect.js for simplicity
                if (product.contact_only) {
                    const buttons = [];
                    const adminUsername = config.SUPPORT_CONTACT.replace('@', '');
                    buttons.push([Markup.button.url('💬 Liên hệ mua', `https://t.me/${adminUsername}`)]);
                    if (product.contact_url) {
                        buttons.push([Markup.button.url('📱 Hotline Zalo 24/7', product.contact_url)]);
                    }
                    buttons.push([Markup.button.callback('↩️ Quay lại', 'refresh_products')]);

                    return ctx.replyWithHTML(messages.contactOnly(product), Markup.inlineKeyboard(buttons));
                }

                const availableStock = product.display_stock || product.stock_count;
                if (availableStock === 0) {
                    return ctx.reply(messages.noStock);
                }

                const maxQty = Math.min(availableStock, 10);
                return ctx.replyWithHTML(messages.selectQuantity(product), quantityKeyboard(productId, maxQty));
            }
        }

        ctx.replyWithHTML(messages.welcome(user.full_name), mainMenuKeyboard());
    });
};
