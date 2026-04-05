const orderService = require('../services/orderService');
const productService = require('../services/productService');
const messages = require('../utils/messages');
const { postDeliveryKeyboard } = require('../utils/keyboard');

module.exports = (bot) => {
    // User clicks "Đã thanh toán" button
    bot.action(/^check_paid_(\d+)$/, async (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        const order = orderService.getById(orderId);

        if (!order) {
            return ctx.answerCbQuery('❌ Đơn hàng không tồn tại');
        }

        if (order.status === 'delivered') {
            return ctx.answerCbQuery('✅ Đơn hàng đã được giao');
        }

        if (order.status === 'cancelled') {
            return ctx.answerCbQuery('❌ Đơn hàng đã bị hủy');
        }

        // For now, show pending message (admin needs to confirm)
        ctx.answerCbQuery();
        ctx.replyWithHTML(messages.paymentPending);
    });

    // Data main callback
    bot.action('data_main', (ctx) => {
        ctx.answerCbQuery();
        ctx.reply('📊 Tính năng đang phát triển...');
    });

    // Buy again callback
    bot.action('buy_again', (ctx) => {
        ctx.answerCbQuery();
        // Trigger product listing
        const products = productService.getAll();
        const { productListKeyboard } = require('../utils/keyboard');
        ctx.reply(messages.productHeader, productListKeyboard(products));
    });

    // Handle resending order items from history
    bot.action(/^get_order_(\d+)$/, async (ctx) => {
        const orderId = parseInt(ctx.match[1]);
        const order = orderService.getById(orderId);

        if (!order || order.user_id !== ctx.from.id) {
            return ctx.answerCbQuery('❌ Không tìm thấy đơn hàng');
        }

        if (order.status !== 'delivered') {
            return ctx.answerCbQuery('⏳ Đơn hàng chưa hoàn thành');
        }

        ctx.answerCbQuery('📦 Đang lấy lại KEY/File...');
        await resendOrderContent(bot, ctx.from.id, orderId);
    });
};

/**
 * Send order content (keys/files) to user
 */
async function resendOrderContent(bot, userId, orderId) {
    const orderInfo = orderService.getByIdWithKeys(orderId);
    if (!orderInfo) return;

    const { product, keys, quantity } = orderInfo;

    try {
        if (product.is_file) {
            // Send each item individually
            for (let i = 0; i < keys.length; i++) {
                const stockData = keys[i];
                const parts = stockData.split('|');
                let fileIdRaw = parts[0];
                const captionText = parts.length > 1 ? parts.slice(1).join('|') : '';
                
                let type = 'document';
                let fileId = fileIdRaw;
                if (fileIdRaw.startsWith('video:')) {
                    type = 'video';
                    fileId = fileIdRaw.substring(6);
                } else if (fileIdRaw.startsWith('photo:')) {
                    type = 'photo';
                    fileId = fileIdRaw.substring(6);
                } else if (fileIdRaw.startsWith('document:')) {
                    type = 'document';
                    fileId = fileIdRaw.substring(9);
                }
                
                const isLastFile = i === keys.length - 1;
                let finalCaption = '';
                
                if (isLastFile) {
                    finalCaption = `✅ <b>ĐƠN HÀNG THÀNH CÔNG!</b>\n\n` +
                                   `📦 ${product.name} × ${quantity}\n`;
                    if (captionText) {
                         finalCaption += `\n📝 <b>Ghi chú:</b>\n${captionText}\n`;
                    }
                    
                    finalCaption += `\nLiên hệ <b>ADMIN</b> ở phía dưới để lấy <b>KEY</b> nha các tình yêu\n` +
                                   `Sản phẩm này cần liên hệ trực tiếp để lấy.`;
                } else if (captionText) {
                    finalCaption = captionText;
                }

                const extraOpts = isLastFile ? { ...postDeliveryKeyboard(), caption: finalCaption } : { caption: finalCaption };
                
                if (type === 'video') {
                    await bot.telegram.sendVideo(userId, fileId, { ...extraOpts, parse_mode: 'HTML' });
                } else if (type === 'photo') {
                    await bot.telegram.sendPhoto(userId, fileId, { ...extraOpts, parse_mode: 'HTML' });
                } else {
                    await bot.telegram.sendDocument(userId, fileId, { ...extraOpts, parse_mode: 'HTML' });
                }
            }
        } else {
            // Send text account details
            await bot.telegram.sendMessage(
                userId,
                messages.orderSuccess(product, quantity, keys),
                {
                    parse_mode: 'HTML',
                    ...postDeliveryKeyboard(),
                }
            );
        }
    } catch (err) {
        console.error(`Failed to resend order ${orderId} to ${userId}:`, err.message);
    }
}

/**
 * Deliver order (called by admin confirm or webhook)
 */
async function deliverOrder(bot, orderId) {
    const result = orderService.confirmAndDeliver(orderId);

    if (!result.success) {
        return result;
    }

    const order = result.order;

    try {
        // Send success notification first
        await bot.telegram.sendMessage(
            order.user_id,
            messages.orderSuccessNotify(order.quantity),
            { parse_mode: 'HTML' }
        );

        // Send keys/files
        await resendOrderContent(bot, order.user_id, orderId);
    } catch (err) {
        console.error(`Failed to send delivery to ${order.user_id}:`, err.message);
    }

    return result;
}

module.exports.deliverOrder = deliverOrder;
module.exports.resendOrderContent = resendOrderContent;
