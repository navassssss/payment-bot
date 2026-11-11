import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../bot';
import { productQueries } from '../db/queries';

export function setupProductsHandler(bot: Bot<BotContext>) {
  bot.callbackQuery(/^product:(.+)$/, async (ctx) => {
    const productId = ctx.match[1];

    try {
      const product = await productQueries.getProductById(productId);

      if (!product || !product.active) {
        await ctx.answerCallbackQuery({ text: "This product is no longer available.", show_alert: true });
        return;
      }

      let text = `📦 ${product.name}\n\n`;
      if (product.description) {
        text += `${product.description}\n\n`;
      }
      text += `⭐ Price: ${product.price_stars} Stars`;

      const keyboard = new InlineKeyboard()
        .text('⭐ Buy', `buy:${product.id}`).row()
        .text('⬅️ Back', 'back_to_shop');

      await ctx.editMessageText(text, { reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (error) {
      console.error("Product detail error:", error);
      await ctx.answerCallbackQuery({ text: "Error loading product." });
    }
  });

  bot.callbackQuery('back_to_shop', async (ctx) => {
    try {
      const products = await productQueries.getActiveProducts();
      
      let text = 
        "🛍 <b>Welcome to Starbot</b>\n\n" +
        "📦 <b>Available Files:</b>\n" +
        "Select a file below to purchase with Telegram Stars.\n\n" +
        "Need help or want to refund a past purchase? Use the buttons below:";

      const keyboard = new InlineKeyboard();

      products.forEach((p) => {
        keyboard.text(`[${p.name} — ⭐${p.price_stars}]`, `product:${p.id}`).row();
      });

      keyboard
        .text('📦 My Purchases', 'user:purchases_btn')
        .text('↩️ Request Refund', 'user:apply_refund');

      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' });
      await ctx.answerCallbackQuery();
    } catch (error) {
      console.error("Back to shop error:", error);
      await ctx.answerCallbackQuery({ text: "Error returning to shop." });
    }
  });
}
