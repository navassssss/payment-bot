import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../bot';
import { purchaseQueries } from '../db/queries';

export function setupPurchasesHandler(bot: Bot<BotContext>) {
  bot.command('purchases', async (ctx) => {
    try {
      const purchases = await purchaseQueries.getPurchasesByUser(ctx.from!.id);

      if (!purchases || purchases.length === 0) {
        await ctx.reply("You haven't purchased any files yet.");
        return;
      }

      let text = "📦 Your purchases:\n\n";
      const keyboard = new InlineKeyboard();

      purchases.forEach((p) => {
        if (p.products) {
           keyboard.text(`[${p.products.name}]`, `get_purchase:${p.id}`).row();
        }
      });

      await ctx.reply(text, { reply_markup: keyboard });
    } catch (error) {
      console.error("Purchases handler error:", error);
      await ctx.reply("Error loading your purchases.");
    }
  });

  bot.callbackQuery(/^get_purchase:(.+)$/, async (ctx) => {
    const purchaseId = ctx.match[1];

    try {
      // Re-fetch purchase to ensure ownership and get current product file
      const purchases = await purchaseQueries.getPurchasesByUser(ctx.from!.id);
      const purchase = purchases.find(p => p.id === purchaseId);

      if (!purchase || !purchase.products) {
        await ctx.answerCallbackQuery({ text: "Purchase not found or unauthorized.", show_alert: true });
        return;
      }

      const product = purchase.products;

      await ctx.answerCallbackQuery();
      await ctx.reply(`📦 ${product.name}\n\nHere is your file:`);
      await ctx.replyWithDocument(product.telegram_file_id);
    } catch (error) {
      console.error("Get purchase error:", error);
      await ctx.answerCallbackQuery({ text: "Error retrieving your purchase." });
    }
  });
}
