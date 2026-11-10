import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../bot';
import { isAdmin } from '../utils/auth';
import { productQueries, purchaseQueries, paymentQueries, refundQueries } from '../db/queries';

export function setupAdminHandler(bot: Bot<BotContext>) {
  function getAdminMenuKeyboard() {
    return new InlineKeyboard()
      .text('➕ Add File', 'admin:add').row()
      .text('📦 Manage Files', 'admin:manage').row()
      .text('📊 Sales', 'admin:sales').row()
      .text('↩️ Refunds', 'admin:refunds');
  }

  async function showRefundMenu(ctx: any) {
    const text = 
      `↩️ <b>Refund Management</b>\n\n` +
      `Select an option:\n` +
      `• <b>Recent Purchases:</b> Browse recent purchases and issue a refund\n` +
      `• <b>Search Purchase:</b> Search by User ID, @username, or Charge ID\n` +
      `• <b>Refund History:</b> View previously refunded transactions`;

    const keyboard = new InlineKeyboard()
      .text('🕒 Recent Purchases', 'admin:ref_recent').row()
      .text('🔍 Search Purchase', 'admin:ref_search').row()
      .text('📋 Refund History', 'admin:ref_history').row()
      .text('⬅️ Back to Admin', 'admin:back');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'HTML' });
    }
  }

  async function showRefundConfirmation(ctx: any, paymentId: string) {
    const payment = await paymentQueries.getPaymentById(paymentId);
    if (!payment) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: "Payment not found.", show_alert: true });
      } else {
        await ctx.reply("❌ Payment not found.");
      }
      return;
    }

    const alreadyRefunded = await refundQueries.isRefunded(payment.id);
    if (alreadyRefunded) {
      const msg = "⚠️ This payment has already been refunded.";
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: msg, show_alert: true });
      } else {
        await ctx.reply(msg);
      }
      return;
    }

    const userDisplay = payment.purchases?.username 
      ? `@${payment.purchases.username}` 
      : (payment.purchases?.first_name || `User ${payment.telegram_user_id}`);
    
    const dateStr = new Date(payment.created_at).toLocaleString();

    const text = 
      `↩️ <b>Confirm Refund</b>\n\n` +
      `📦 <b>Product:</b> ${payment.products?.name || 'Unknown'}\n` +
      `👤 <b>User:</b> ${userDisplay} (<code>${payment.telegram_user_id}</code>)\n` +
      `⭐ <b>Amount:</b> ${payment.amount_stars} Stars\n` +
      `📅 <b>Date:</b> ${dateStr}\n` +
      `🔑 <b>Charge ID:</b> <code>${payment.telegram_charge_id}</code>\n\n` +
      `⚠️ <b>Are you sure you want to refund this payment?</b>\n` +
      `• ⭐${payment.amount_stars} will be returned to the user via Telegram Stars\n` +
      `• User's file access will be revoked in /purchases\n` +
      `• User will receive a refund confirmation message`;

    const keyboard = new InlineKeyboard()
      .text(`✅ Confirm Refund (⭐${payment.amount_stars})`, `admin:ref_do:${payment.id}`).row()
      .text('❌ Cancel', 'admin:refunds');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' });
      await ctx.answerCallbackQuery();
    } else {
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'HTML' });
    }
  }

  bot.use(async (ctx, next) => {
    // Basic middleware to reset state on /admin or /start if needed
    if (ctx.message?.text === '/admin' || ctx.message?.text === '/start') {
      if (ctx.session) ctx.session.adminState = undefined;
    }
    await next();
  });

  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from?.id!)) return;

    const text = "⚙️ Admin Panel";
    await ctx.reply(text, { reply_markup: getAdminMenuKeyboard() });
  });

  bot.command('refund', async (ctx) => {
    if (!isAdmin(ctx.from?.id!)) {
      await ctx.reply(
        "Payment Support & Refunds\n\n" +
        "To request a refund, please contact the administrator via /paysupport with your receipt or payment charge ID."
      );
      return;
    }

    const rawText = ctx.message?.text || '';
    const parts = rawText.split(/\s+/);
    const query = parts.slice(1).join(' ').trim();

    if (query) {
      const results = await paymentQueries.searchPayments(query);
      if (results.length === 0) {
        await ctx.reply(`❌ No matching purchases found for "${query}".`);
        return;
      }
      if (results.length === 1) {
        await showRefundConfirmation(ctx, results[0].id);
        return;
      }

      const keyboard = new InlineKeyboard();
      results.slice(0, 10).forEach(p => {
        const name = p.purchases?.username 
          ? `@${p.purchases.username}` 
          : (p.purchases?.first_name || String(p.telegram_user_id));
        keyboard.text(`${name} — ${p.products?.name || 'File'} (⭐${p.amount_stars})`, `admin:ref:${p.id}`).row();
      });
      keyboard.text('⬅️ Refund Menu', 'admin:refunds');
      await ctx.reply("Select the purchase to refund:", { reply_markup: keyboard });
      return;
    }

    await showRefundMenu(ctx);
  });

  // Shortcut
  bot.command('add', async (ctx) => {
    if (!isAdmin(ctx.from?.id!)) return;
    ctx.session.adminState = { step: 'WAITING_FOR_FILE', payload: {} };
    await ctx.reply("Send the file.");
  });

  bot.callbackQuery('admin:add', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.session.adminState = { step: 'WAITING_FOR_FILE', payload: {} };
    await ctx.editMessageText("Send the file.");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('admin:manage', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    try {
      const products = await productQueries.getAllProducts();
      let text = "📦 Manage Files:\n\n";
      const keyboard = new InlineKeyboard();

      products.forEach((p) => {
        const status = p.active ? "" : " (Disabled)";
        keyboard.text(`[${p.name} ⭐${p.price_stars}]${status}`, `admin:prod:${p.id}`).row();
      });
      keyboard.text('⬅️ Back', 'admin:back');

      await ctx.editMessageText(text, { reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error(err);
      await ctx.answerCallbackQuery({ text: "Error" });
    }
  });

  bot.callbackQuery('admin:sales', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    try {
      const stats = await purchaseQueries.getSalesStats();
      const text = 
        `📊 <b>Sales Overview</b>\n\n` +
        `📦 <b>Active Purchases:</b> ${stats.totalPurchases}\n` +
        `💰 <b>Gross Revenue:</b> ⭐${stats.totalStars}\n` +
        `↩️ <b>Total Refunds:</b> ${stats.totalRefundsCount} (⭐${stats.totalRefundedStars})\n` +
        `✨ <b>Net Revenue:</b> ⭐${stats.netStars}\n\n` +
        `📅 <b>Today:</b>\n` +
        `• Purchases: ${stats.todayPurchases} (⭐${stats.todayStars})\n` +
        `• Refunds: ${stats.todayRefundsCount} (⭐${stats.todayRefundedStars})\n` +
        `• Net: ⭐${stats.todayNetStars}`;

      const keyboard = new InlineKeyboard()
        .text('↩️ Refund Menu', 'admin:refunds').row()
        .text('⬅️ Back', 'admin:back');

      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' });
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error(err);
      await ctx.answerCallbackQuery({ text: "Error loading sales" });
    }
  });

  bot.callbackQuery('admin:refunds', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await showRefundMenu(ctx);
  });

  bot.callbackQuery('admin:ref_recent', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    try {
      const payments = await paymentQueries.getRecentPayments(15);
      const refundable = payments.filter(p => p.purchases && (!Array.isArray(p.purchases) || p.purchases.length > 0));

      if (refundable.length === 0) {
        const keyboard = new InlineKeyboard().text('⬅️ Back', 'admin:refunds');
        await ctx.editMessageText("No refundable purchases found in recent transactions.", { reply_markup: keyboard });
        await ctx.answerCallbackQuery();
        return;
      }

      const keyboard = new InlineKeyboard();
      refundable.slice(0, 10).forEach(p => {
        const user = p.purchases?.username ? `@${p.purchases.username}` : (p.purchases?.first_name || String(p.telegram_user_id));
        const prod = p.products?.name ? (p.products.name.length > 15 ? p.products.name.slice(0, 15) + '…' : p.products.name) : 'File';
        keyboard.text(`${user} — ${prod} (⭐${p.amount_stars})`, `admin:ref:${p.id}`).row();
      });
      keyboard.text('⬅️ Back', 'admin:refunds');

      await ctx.editMessageText("Select a purchase to refund:", { reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error(err);
      await ctx.answerCallbackQuery({ text: "Error loading recent purchases" });
    }
  });

  bot.callbackQuery('admin:ref_search', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.session.adminState = { step: 'WAITING_FOR_REFUND_SEARCH', payload: {} };
    const keyboard = new InlineKeyboard().text('⬅️ Cancel', 'admin:refunds');
    await ctx.editMessageText(
      "🔍 <b>Search Purchase to Refund</b>\n\n" +
      "Send one of the following:\n" +
      "• Telegram User ID (e.g. <code>8408179126</code>)\n" +
      "• Username (e.g. <code>@username</code>)\n" +
      "• Payment Charge ID (starts with <code>stx...</code>)\n\n" +
      "Or click Cancel below.",
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin:ref:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const paymentId = ctx.match[1];
    await showRefundConfirmation(ctx, paymentId);
  });

  bot.callbackQuery(/^admin:ref_do:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const paymentId = ctx.match[1];

    try {
      const payment = await paymentQueries.getPaymentById(paymentId);
      if (!payment) {
        await ctx.answerCallbackQuery({ text: "Payment not found.", show_alert: true });
        return;
      }

      const alreadyRefunded = await refundQueries.isRefunded(payment.id);
      if (alreadyRefunded) {
        await ctx.answerCallbackQuery({ text: "This payment was already refunded.", show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: "Processing refund with Telegram..." });

      // Call Telegram Star refund API
      try {
        await ctx.api.refundStarPayment(Number(payment.telegram_user_id), payment.telegram_charge_id);
      } catch (tgError: any) {
        const errMsg = tgError?.message || String(tgError);
        console.error("Telegram refundStarPayment failed:", tgError);

        if (!errMsg.includes('CHARGE_ALREADY_REFUNDED')) {
          await ctx.editMessageText(
            `❌ <b>Telegram Refund Failed</b>\n\n<code>${errMsg}</code>\n\nPlease check the charge ID or contact Telegram support.`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text('⬅️ Back to Refunds', 'admin:refunds')
            }
          );
          return;
        }
      }

      // Record refund and revoke file access
      await refundQueries.recordRefund({
        payment_id: payment.id,
        telegram_user_id: Number(payment.telegram_user_id),
        telegram_charge_id: payment.telegram_charge_id,
        amount_stars: payment.amount_stars,
        reason: 'Admin issued refund'
      });

      // Send courteous notification to user
      try {
        await ctx.api.sendMessage(
          Number(payment.telegram_user_id),
          `💸 <b>Refund Processed</b>\n\n` +
          `Your purchase of <b>${payment.products?.name || 'file'}</b> has been refunded.\n` +
          `⭐ <b>${payment.amount_stars} Stars</b> have been credited back to your Telegram Stars balance.`,
          { parse_mode: 'HTML' }
        );
      } catch (notifyErr) {
        console.warn("Could not notify refunded user:", notifyErr);
      }

      const userDisplay = payment.purchases?.username 
        ? `@${payment.purchases.username}` 
        : (payment.purchases?.first_name || `User ${payment.telegram_user_id}`);

      await ctx.editMessageText(
        `✅ <b>Refund Completed!</b>\n\n` +
        `⭐ <b>${payment.amount_stars} Stars</b> refunded to ${userDisplay}.\n` +
        `📦 File access has been revoked for <b>${payment.products?.name || 'File'}</b>.`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('🕒 Recent Purchases', 'admin:ref_recent').row()
            .text('📋 Refund History', 'admin:ref_history').row()
            .text('⬅️ Admin Panel', 'admin:back')
        }
      );
    } catch (err) {
      console.error("Refund execution error:", err);
      await ctx.editMessageText(
        "❌ An unexpected error occurred while processing the refund.",
        { reply_markup: new InlineKeyboard().text('⬅️ Back', 'admin:refunds') }
      );
    }
  });

  bot.callbackQuery('admin:ref_history', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    try {
      const refunds = await refundQueries.getRefunds(20);
      if (refunds.length === 0) {
        const keyboard = new InlineKeyboard().text('⬅️ Back', 'admin:refunds');
        await ctx.editMessageText("📋 <b>Refund History</b>\n\nNo refunds have been recorded yet.", {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
        await ctx.answerCallbackQuery();
        return;
      }

      let text = `📋 <b>Refund History</b> (${refunds.length})\n\n`;
      refunds.forEach((r, i) => {
        const dateStr = new Date(r.refunded_at).toLocaleDateString();
        const prodName = r.payments?.products?.name || 'File';
        text += `${i + 1}. User <code>${r.telegram_user_id}</code>\n   📦 ${prodName}\n   ⭐${r.amount_stars} Stars • ${dateStr}\n\n`;
      });

      const keyboard = new InlineKeyboard().text('⬅️ Back', 'admin:refunds');
      if (text.length > 4000) text = text.substring(0, 4000) + "\n... (truncated)";

      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error(err);
      await ctx.answerCallbackQuery({ text: "Error loading refund history" });
    }
  });

  bot.callbackQuery('admin:back', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const text = "⚙️ Admin Panel";
    await ctx.editMessageText(text, { reply_markup: getAdminMenuKeyboard() });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin:prod:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const productId = ctx.match[1];
    
    try {
      const product = await productQueries.getProductById(productId);
      if (!product) return ctx.answerCallbackQuery("Product not found");

      let text = `📦 ${product.name}\n⭐${product.price_stars}\nStatus: ${product.active ? 'Active' : 'Disabled'}\n\n`;
      if (product.description) text += `${product.description}`;

      const keyboard = new InlineKeyboard()
        .text('✏️ Edit Name', `admin:edit_name:${product.id}`).row()
        .text('📝 Edit Description', `admin:edit_desc:${product.id}`).row()
        .text('💰 Change Price', `admin:edit_price:${product.id}`).row()
        .text('📎 Replace File', `admin:replace_file:${product.id}`).row()
        .text('👥 Buyers', `admin:buyers:${product.id}`).row()
        .text(product.active ? '🔴 Disable' : '🟢 Enable', `admin:toggle:${product.id}`).row()
        .text('⬅️ Back', 'admin:manage');

      await ctx.editMessageText(text, { reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error(err);
      await ctx.answerCallbackQuery("Error");
    }
  });

  bot.callbackQuery(/^admin:toggle:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const productId = ctx.match[1];
    try {
      const product = await productQueries.getProductById(productId);
      if (!product) return;
      await productQueries.updateProduct(productId, { active: !product.active });
      await ctx.answerCallbackQuery({ text: "Status updated" });
      
      // Refresh the view
      const p = await productQueries.getProductById(productId);
      if (!p) return;
      let text = `📦 ${p.name}\n⭐${p.price_stars}\nStatus: ${p.active ? 'Active' : 'Disabled'}\n\n`;
      if (p.description) text += `${p.description}`;

      const keyboard = new InlineKeyboard()
        .text('✏️ Edit Name', `admin:edit_name:${p.id}`).row()
        .text('📝 Edit Description', `admin:edit_desc:${p.id}`).row()
        .text('💰 Change Price', `admin:edit_price:${p.id}`).row()
        .text('📎 Replace File', `admin:replace_file:${p.id}`).row()
        .text('👥 Buyers', `admin:buyers:${p.id}`).row()
        .text(p.active ? '🔴 Disable' : '🟢 Enable', `admin:toggle:${p.id}`).row()
        .text('⬅️ Back', 'admin:manage');

      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch (err) {
      console.error(err);
    }
  });

  bot.callbackQuery(/^admin:buyers:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const productId = ctx.match[1];
    
    try {
      const product = await productQueries.getProductById(productId);
      const buyers = await purchaseQueries.getBuyersByProduct(productId);
      
      if (!product) return;

      let text = `👥 <b>Buyers — ${product.name}</b>\nTotal buyers: ${buyers.length}\n\n`;
      const keyboard = new InlineKeyboard();

      buyers.forEach((b, i) => {
        const name = b.username ? `@${b.username}` : (b.first_name || b.telegram_user_id.toString());
        const date = new Date(b.purchased_at).toLocaleDateString();
        text += `${i + 1}. ${name}\n   ⭐${b.payments?.amount_stars || 0}\n   ${date}\n\n`;

        // Add refund shortcut for the first 10 buyers
        if (i < 10 && b.payment_id) {
          keyboard.text(`↩️ Refund ${name}`, `admin:ref:${b.payment_id}`).row();
        }
      });

      keyboard.text('⬅️ Back', `admin:prod:${productId}`);
      
      // Prevent message too long errors
      if (text.length > 4000) text = text.substring(0, 4000) + "\n... (truncated)";
      
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' });
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error(err);
      await ctx.answerCallbackQuery("Error");
    }
  });

  // Edit actions setup
  bot.callbackQuery(/^admin:edit_name:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.session.adminState = { step: 'WAITING_FOR_EDIT_NAME', payload: { productId: ctx.match[1] } };
    await ctx.reply("Send new name:");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin:edit_desc:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.session.adminState = { step: 'WAITING_FOR_EDIT_DESC', payload: { productId: ctx.match[1] } };
    await ctx.reply("Send new description or /skip:");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin:edit_price:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.session.adminState = { step: 'WAITING_FOR_EDIT_PRICE', payload: { productId: ctx.match[1] } };
    await ctx.reply("Send new price (Stars):");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin:replace_file:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.session.adminState = { step: 'WAITING_FOR_REPLACE_FILE', payload: { productId: ctx.match[1] } };
    await ctx.reply("Send the new file:");
    await ctx.answerCallbackQuery();
  });

  // Message handler for admin state
  bot.on('message', async (ctx, next) => {
    if (!isAdmin(ctx.from?.id!)) return next();
    const state = ctx.session?.adminState;
    if (!state) return next();

    try {
      if (state.step === 'WAITING_FOR_REFUND_SEARCH') {
        const queryText = ctx.message.text?.trim();
        if (!queryText) {
          await ctx.reply("Please send a valid search text or /admin to cancel.");
          return;
        }

        const results = await paymentQueries.searchPayments(queryText);
        if (results.length === 0) {
          await ctx.reply(`❌ No purchases found for "${queryText}". Please try again or send /admin to cancel.`);
          return;
        }

        ctx.session.adminState = undefined;
        if (results.length === 1) {
          await showRefundConfirmation(ctx, results[0].id);
          return;
        }

        const keyboard = new InlineKeyboard();
        results.slice(0, 10).forEach(p => {
          const name = p.purchases?.username 
            ? `@${p.purchases.username}` 
            : (p.purchases?.first_name || String(p.telegram_user_id));
          keyboard.text(`${name} — ${p.products?.name || 'File'} (⭐${p.amount_stars})`, `admin:ref:${p.id}`).row();
        });
        keyboard.text('⬅️ Back', 'admin:refunds');
        await ctx.reply("Select the purchase to refund:", { reply_markup: keyboard });
        return;
      }

      if (state.step === 'WAITING_FOR_FILE' || state.step === 'WAITING_FOR_REPLACE_FILE') {
        const doc = ctx.message.document;
        if (!doc) {
          await ctx.reply("Please send a document file.");
          return;
        }

        const fileData = {
          telegram_file_id: doc.file_id,
          file_name: doc.file_name || null,
          mime_type: doc.mime_type || null,
          file_size: doc.file_size || null
        };

        if (state.step === 'WAITING_FOR_REPLACE_FILE') {
           await productQueries.updateProduct(state.payload.productId, fileData);
           ctx.session.adminState = undefined;
           await ctx.reply("✅ File replaced successfully.");
           return;
        } else {
           state.payload = { ...state.payload, ...fileData };
           state.step = 'WAITING_FOR_PRICE';
           await ctx.reply("Enter the price in Stars.");
           return;
        }
      }

      if (state.step === 'WAITING_FOR_PRICE' || state.step === 'WAITING_FOR_EDIT_PRICE') {
        const price = parseInt(ctx.message.text || "", 10);
        if (isNaN(price) || price <= 0) {
          await ctx.reply("Please enter a valid positive number.");
          return;
        }

        if (state.step === 'WAITING_FOR_EDIT_PRICE') {
           await productQueries.updateProduct(state.payload.productId, { price_stars: price });
           ctx.session.adminState = undefined;
           await ctx.reply(`✅ Price updated to ⭐${price}.`);
           return;
        } else {
           state.payload.price_stars = price;
           state.step = 'WAITING_FOR_NAME';
           await ctx.reply("Enter the product name.");
           return;
        }
      }

      if (state.step === 'WAITING_FOR_NAME' || state.step === 'WAITING_FOR_EDIT_NAME') {
        const name = ctx.message.text;
        if (!name) {
          await ctx.reply("Please enter a valid text name.");
          return;
        }

        if (state.step === 'WAITING_FOR_EDIT_NAME') {
           await productQueries.updateProduct(state.payload.productId, { name });
           ctx.session.adminState = undefined;
           await ctx.reply(`✅ Name updated to ${name}.`);
           return;
        } else {
           state.payload.name = name;
           state.step = 'WAITING_FOR_DESCRIPTION';
           await ctx.reply("Enter a description or /skip.");
           return;
        }
      }

      if (state.step === 'WAITING_FOR_DESCRIPTION' || state.step === 'WAITING_FOR_EDIT_DESC') {
        let desc = ctx.message.text;
        if (desc === '/skip') desc = undefined;
        else if (!desc) {
          await ctx.reply("Please enter text or /skip.");
          return;
        }

        if (state.step === 'WAITING_FOR_EDIT_DESC') {
           await productQueries.updateProduct(state.payload.productId, { description: desc || null });
           ctx.session.adminState = undefined;
           await ctx.reply("✅ Description updated.");
           return;
        } else {
           // Create the product
           state.payload.description = desc;
           
           const newProduct = await productQueries.createProduct(state.payload);
           ctx.session.adminState = undefined;
           
           await ctx.reply(`✅ File created\n\n📦 ${newProduct.name}\n⭐ ${newProduct.price_stars} Stars`);
           return;
        }
      }
    } catch (err) {
      console.error(err);
      await ctx.reply("An error occurred during this step. State was reset.");
      ctx.session.adminState = undefined;
    }
    
    return next();
  });
}
