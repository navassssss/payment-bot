import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../bot';
import { purchaseQueries, refundQueries, refundRequestQueries } from '../db/queries';
import { config } from '../config';

export function setupPurchasesHandler(bot: Bot<BotContext>) {
  bot.command('purchases', async (ctx) => {
    try {
      const purchases = await purchaseQueries.getPurchasesByUser(ctx.from!.id);

      if (!purchases || purchases.length === 0) {
        await ctx.reply("You haven't purchased any files yet.");
        return;
      }

      let text = "📦 <b>Your purchases:</b>\n\nTap a file to download, or request a refund:";
      const keyboard = new InlineKeyboard();

      purchases.forEach((p) => {
        if (p.products) {
          keyboard.text(`[${p.products.name}]`, `get_purchase:${p.id}`).row();
        }
      });

      keyboard.text('↩️ Request a Refund', 'user:apply_refund');

      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'HTML' });
    } catch (error) {
      console.error("Purchases handler error:", error);
      await ctx.reply("Error loading your purchases.");
    }
  });

  bot.callbackQuery(['user:purchases_btn', 'user:back_to_purchases'], async (ctx) => {
    try {
      const purchases = await purchaseQueries.getPurchasesByUser(ctx.from!.id);

      if (!purchases || purchases.length === 0) {
        const keyboard = new InlineKeyboard().text('⬅️ Back to Shop', 'back_to_shop');
        await ctx.editMessageText("You haven't purchased any files yet.", { reply_markup: keyboard });
        await ctx.answerCallbackQuery();
        return;
      }

      let text = "📦 <b>Your purchases:</b>\n\nTap a file to download, or request a refund:";
      const keyboard = new InlineKeyboard();

      purchases.forEach((p) => {
        if (p.products) {
          keyboard.text(`[${p.products.name}]`, `get_purchase:${p.id}`).row();
        }
      });

      keyboard.text('↩️ Request a Refund', 'user:apply_refund').row();
      keyboard.text('⬅️ Back to Shop', 'back_to_shop');

      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' });
      await ctx.answerCallbackQuery();
    } catch (error) {
      console.error("Back to purchases error:", error);
      await ctx.answerCallbackQuery({ text: "Error loading purchases." });
    }
  });

  bot.callbackQuery('user:apply_refund', async (ctx) => {
    try {
      const purchases = await purchaseQueries.getPurchasesByUser(ctx.from!.id);

      if (!purchases || purchases.length === 0) {
        await ctx.answerCallbackQuery({ text: "No eligible purchases found.", show_alert: true });
        return;
      }

      let text = "↩️ <b>Apply for a Refund</b>\n\nSelect the purchased file you want to request a refund for:";
      const keyboard = new InlineKeyboard();

      purchases.forEach((p) => {
        if (p.products) {
          const stars = p.payments?.amount_stars || p.products.price_stars;
          keyboard.text(`[${p.products.name} — ⭐${stars}]`, `user:req_refund:${p.id}`).row();
        }
      });

      keyboard.text('⬅️ Back to Purchases', 'user:back_to_purchases');

      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' });
      await ctx.answerCallbackQuery();
    } catch (error) {
      console.error("Apply refund menu error:", error);
      await ctx.answerCallbackQuery({ text: "Error loading purchases." });
    }
  });

  bot.callbackQuery(/^user:req_refund:(.+)$/, async (ctx) => {
    const purchaseId = ctx.match[1];

    try {
      const purchases = await purchaseQueries.getPurchasesByUser(ctx.from!.id);
      const purchase = purchases.find(p => p.id === purchaseId);

      if (!purchase || !purchase.products) {
        await ctx.answerCallbackQuery({ text: "Purchase not found.", show_alert: true });
        return;
      }

      // Check if already refunded
      const isRef = await refundQueries.isRefunded(purchase.payment_id);
      if (isRef) {
        await ctx.answerCallbackQuery({ text: "This item has already been refunded.", show_alert: true });
        return;
      }

      // Check if request already pending
      const pending = await refundRequestQueries.getPendingByPaymentId(purchase.payment_id);
      if (pending) {
        await ctx.answerCallbackQuery({ 
          text: "⏳ A refund request for this item is already pending review.", 
          show_alert: true 
        });
        return;
      }

      const amount = purchase.payments?.amount_stars || purchase.products.price_stars;

      ctx.session.userState = {
        step: 'WAITING_FOR_REFUND_REASON',
        payload: {
          purchaseId: purchase.id,
          paymentId: purchase.payment_id,
          productId: purchase.product_id,
          productName: purchase.products.name,
          amount
        }
      };

      const text = 
        `↩️ <b>Apply for Refund: ${purchase.products.name}</b>\n\n` +
        `⭐ <b>Amount:</b> ${amount} Stars\n\n` +
        `Please reply with a message explaining the reason for your refund request (e.g. file not working, accidental purchase).\n\n` +
        `• Send <b>/skip</b> to submit without a reason\n` +
        `• Send <b>/cancel</b> to cancel this request`;

      const keyboard = new InlineKeyboard().text('❌ Cancel', 'user:cancel_refund');

      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' });
      await ctx.answerCallbackQuery();
    } catch (error) {
      console.error("User req refund error:", error);
      await ctx.answerCallbackQuery({ text: "Error" });
    }
  });

  bot.callbackQuery('user:cancel_refund', async (ctx) => {
    ctx.session.userState = undefined;
    await ctx.answerCallbackQuery({ text: "Refund request cancelled." });
    await ctx.editMessageText("Refund request cancelled.\nUse /purchases to view your files.");
  });

  bot.callbackQuery(/^get_purchase:(.+)$/, async (ctx) => {
    const purchaseId = ctx.match[1];

    try {
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

      // Offer refund option below the file
      const keyboard = new InlineKeyboard().text('↩️ Request Refund for this file', `user:req_refund:${purchase.id}`);
      await ctx.reply("Need help with this file?", { reply_markup: keyboard });
    } catch (error) {
      console.error("Get purchase error:", error);
      await ctx.answerCallbackQuery({ text: "Error retrieving your purchase." });
    }
  });

  // Handle user state for refund reason
  bot.on('message:text', async (ctx, next) => {
    const state = ctx.session?.userState;
    if (!state || state.step !== 'WAITING_FOR_REFUND_REASON') return next();

    const text = ctx.message.text.trim();
    if (text === '/cancel') {
      ctx.session.userState = undefined;
      await ctx.reply("Refund request cancelled.\nUse /purchases to view your files.");
      return;
    }

    const payload = state.payload || {};
    const reason = text === '/skip' ? 'No reason provided' : text;
    ctx.session.userState = undefined;

    try {
      // 1. Record request in database
      await refundRequestQueries.createRequest({
        payment_id: payload.paymentId,
        telegram_user_id: ctx.from.id,
        product_id: payload.productId,
        reason
      });

      // 2. Notify user
      await ctx.reply(
        `✅ <b>Refund Request Submitted!</b>\n\n` +
        `Your request for <b>${payload.productName}</b> (⭐${payload.amount} Stars) has been forwarded to the administrator.\n\n` +
        `You will receive a notification here once it has been processed.`,
        { parse_mode: 'HTML' }
      );

      // 3. Notify Admin
      const userIdentifier = ctx.from.username 
        ? `@${ctx.from.username}` 
        : (ctx.from.first_name || String(ctx.from.id));

      const adminKeyboard = new InlineKeyboard()
        .text(`✅ Approve (⭐${payload.amount})`, `admin:appr_req:${payload.paymentId}`).row()
        .text(`❌ Decline`, `admin:decl_req:${payload.paymentId}`);

      await ctx.api.sendMessage(
        config.ADMIN_TELEGRAM_ID,
        `📩 <b>New Refund Application!</b>\n\n` +
        `👤 <b>User:</b> ${userIdentifier} (<code>${ctx.from.id}</code>)\n` +
        `📦 <b>Product:</b> <b>${payload.productName}</b>\n` +
        `⭐ <b>Amount:</b> <b>${payload.amount} Stars</b>\n` +
        `💬 <b>Reason:</b> <i>"${reason}"</i>\n` +
        `📅 <b>Date:</b> ${new Date().toLocaleString()}`,
        {
          parse_mode: 'HTML',
          reply_markup: adminKeyboard
        }
      ).catch(e => console.error("Failed to notify admin of refund request:", e));
    } catch (err) {
      console.error("Submit refund reason error:", err);
      await ctx.reply("An error occurred while submitting your refund request. Please try again or contact /paysupport.");
    }
  });
}
