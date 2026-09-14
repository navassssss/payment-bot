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
    await ctx.reply("Welcome to Starbot!\n\nUse /start or /shop to browse our files.\nUse /purchases to view your purchased files.\n\nFor support, use /paysupport.");
  });

  bot.command('terms', async (ctx) => {
    await ctx.reply("Terms of Service\n\nAll purchases are final. Digital goods are delivered immediately via Telegram upon successful payment.");
  });

  bot.command('paysupport', async (ctx) => {
    await ctx.reply("Payment Support\n\nIf you have issues with a purchase, please check /purchases first. If your file is missing, contact the administrator.");
  });
}
