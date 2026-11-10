import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../bot';
import { productQueries } from '../db/queries';

export function setupStartHandler(bot: Bot<BotContext>) {
  bot.command(['start', 'shop'], async (ctx) => {
    try {
      const products = await productQueries.getActiveProducts();
      
      if (products.length === 0) {
        await ctx.reply("🛍 Welcome to Starbot\n\nThere are no active files available right now.");
        return;
      }

      let text = "🛍 Welcome to Starbot\n\n📦 Available Files:\n\n";
      const keyboard = new InlineKeyboard();

      products.forEach((p) => {
        keyboard.text(`[${p.name} — ⭐${p.price_stars}]`, `product:${p.id}`).row();
      });

      await ctx.reply(text, { reply_markup: keyboard });
    } catch (error) {
      console.error("Start handler error:", error);
      await ctx.reply("An error occurred. Please try again later.");
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply("Welcome to Starbot!\n\nUse /start or /shop to browse our files.\nUse /purchases to view your purchased files.\n\nFor support and refunds, use /paysupport.");
  });

  bot.command('terms', async (ctx) => {
    await ctx.reply("Terms of Service\n\nDigital goods are delivered immediately via Telegram upon successful payment.\nIf you experience issues with your file or need assistance, contact support via /paysupport.");
  });

  bot.command('paysupport', async (ctx) => {
    await ctx.reply("Payment Support & Refunds\n\n• If you have issues with a purchase, please check /purchases first.\n• If your file is corrupted, missing, or you need a refund, contact the administrator.\n• For refund requests, please provide your Telegram user ID or the transaction receipt received from Telegram.\n• Approved refunds are credited directly back to your Telegram Stars balance.");
  });
}
