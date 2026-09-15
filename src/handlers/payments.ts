import { Bot } from 'grammy';
import { BotContext } from '../bot';
import { productQueries, paymentQueries, purchaseQueries } from '../db/queries';

export function setupPaymentsHandler(bot: Bot<BotContext>) {
  bot.callbackQuery(/^buy:(.+)$/, async (ctx) => {
    const productId = ctx.match[1];

    try {
      const product = await productQueries.getProductById(productId);

      if (!product || !product.active) {
        await ctx.answerCallbackQuery({ text: "This product is no longer available.", show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery();
      
      const payload = `order:${product.id}`;
      
      await ctx.replyWithInvoice(
        product.name,
        product.description || product.name,
        payload,
        "XTR",
        [{ label: "Price", amount: product.price_stars }],
        { provider_token: "" } // Telegram docs: pass "" for Stars payments
      );
    } catch (error) {
      console.error("Buy handler error:", error);
      await ctx.answerCallbackQuery({ text: "Error initiating payment." });
    }
  });

  bot.on('pre_checkout_query', async (ctx) => {
    try {
      const payload = ctx.preCheckoutQuery.invoice_payload;
      if (!payload.startsWith('order:')) {
        await ctx.answerPreCheckoutQuery(false, { error_message: "Invalid payload." });
        return;
      }

      const productId = payload.split(':')[1];
      const product = await productQueries.getProductById(productId);

      if (!product || !product.active) {
        await ctx.answerPreCheckoutQuery(false, { error_message: "This product is no longer available." });
        return;
      }

      if (ctx.preCheckoutQuery.currency !== 'XTR') {
        await ctx.answerPreCheckoutQuery(false, { error_message: "Invalid currency." });
        return;
      }

      if (ctx.preCheckoutQuery.total_amount !== product.price_stars) {
        await ctx.answerPreCheckoutQuery(false, { error_message: "Price mismatch." });
        return;
      }

      await ctx.answerPreCheckoutQuery(true);
    } catch (error) {
      console.error("Pre-checkout error:", error);
      await ctx.answerPreCheckoutQuery(false, { error_message: "Internal server error." });
    }
  });

  bot.on('message:successful_payment', async (ctx) => {
    const paymentInfo = ctx.message.successful_payment;
    
    try {
      const payload = paymentInfo.invoice_payload;
      if (!payload.startsWith('order:')) return;
      
      const productId = payload.split(':')[1];
      const chargeId = paymentInfo.telegram_payment_charge_id;
      
      const product = await productQueries.getProductById(productId);
      if (!product) {
        console.error("Product not found during successful payment:", productId);
        return;
      }

      if (paymentInfo.currency !== 'XTR' || paymentInfo.total_amount !== product.price_stars) {
        console.error("Payment validation failed during successful payment");
        return;
      }

      // Idempotent insertion
      const payment = await paymentQueries.createPayment({
        product_id: product.id,
        telegram_user_id: ctx.from.id,
        telegram_charge_id: chargeId,
        amount_stars: paymentInfo.total_amount
      });

      const purchase = await purchaseQueries.createPurchase({
        product_id: product.id,
        payment_id: payment.id,
        telegram_user_id: ctx.from.id,
        username: ctx.from.username || null,
        first_name: ctx.from.first_name || null
      });

      // Send the file
      try {
        await ctx.reply("✅ Payment successful!\n\nYour file is below.");
        await ctx.replyWithDocument(product.telegram_file_id);
      } catch (deliveryError) {
        console.error("File delivery error:", deliveryError);
        await ctx.reply("Your payment was received, but file delivery failed. Please check /purchases or contact support.");
      }
      
    } catch (error) {
      console.error("Successful payment error:", error);
      await ctx.reply("An error occurred processing your payment. Please contact support.");
    }
  });
}
