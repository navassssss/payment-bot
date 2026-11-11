import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../bot';
import { productQueries } from '../db/queries';

export function setupStartHandler(bot: Bot<BotContext>) {
  bot.command(['start', 'shop'], async (ctx) => {
    try {
      const products = await productQueries.getActiveProducts();
      
      const keyboard = new InlineKeyboard();

      if (products.length === 0) {
        keyboard.text('↩️ Request a Refund', 'user:apply_refund');
        await ctx.reply(
          "🛍 <b>Welcome to Starbot</b>\n\nThere are no active files available right now.\n\nNeed assistance or a refund for a previous purchase?",
          { reply_markup: keyboard, parse_mode: 'HTML' }
        );
        return;
      }

      let text = 
        "🛍 <b>Welcome to Starbot</b>\n\n" +
        "📦 <b>Available Files:</b>\n" +
        "Select a file below to purchase with Telegram Stars.\n\n" +
        "Need help or want to refund a past purchase? Use the buttons below:";

      products.forEach((p) => {
        keyboard.text(`[${p.name} — ⭐${p.price_stars}]`, `product:${p.id}`).row();
      });

      keyboard
        .text('📦 My Purchases', 'user:purchases_btn')
        .text('↩️ Request Refund', 'user:apply_refund');

      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'HTML' });
    } catch (error) {
      console.error("Start handler error:", error);
      await ctx.reply("An error occurred. Please try again later.");
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply("Welcome to Starbot!\n\n• Use /start or /shop to browse our files.\n• Use /purchases to view your purchased files.\n• Use /refund to apply for a refund on any eligible purchase.\n• For questions or support, use /paysupport.");
  });

  bot.command('terms', async (ctx) => {
    await ctx.reply("Terms of Service\n\nDigital goods are delivered immediately via Telegram upon successful payment.\nIf you experience issues with your file or need assistance, you can request a refund using /refund or contact /paysupport.");
  });

  bot.command('paysupport', async (ctx) => {
    await ctx.reply(
      "Payment Support & Refunds\n\n" +
      "• If you have issues with a purchase, check /purchases first.\n" +
      "• You can apply for a refund directly using /refund or via the [Request Refund] button in /purchases.\n" +
      "• Once submitted, the administrator will review your application.\n" +
      "• Approved refunds are credited directly back to your Telegram Stars balance."
    );
  });
}
