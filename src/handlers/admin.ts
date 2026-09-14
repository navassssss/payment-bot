import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from '../bot';
import { isAdmin } from '../utils/auth';
import { productQueries, purchaseQueries } from '../db/queries';

export function setupAdminHandler(bot: Bot<BotContext>) {
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
    const keyboard = new InlineKeyboard()
      .text('➕ Add File', 'admin:add').row()
      .text('📦 Manage Files', 'admin:manage').row()
      .text('📊 Sales', 'admin:sales');

    await ctx.reply(text, { reply_markup: keyboard });
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
      const text = `📊 Sales\n\nTotal purchases: ${stats.totalPurchases}\nTotal Stars: ⭐${stats.totalStars}\n\nToday:\n${stats.todayPurchases} purchases\n⭐${stats.todayStars}`;
      
      const keyboard = new InlineKeyboard().text('⬅️ Back', 'admin:back');
      await ctx.editMessageText(text, { reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error(err);
      await ctx.answerCallbackQuery({ text: "Error loading sales" });
    }
  });

  bot.callbackQuery('admin:back', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const text = "⚙️ Admin Panel";
    const keyboard = new InlineKeyboard()
      .text('➕ Add File', 'admin:add').row()
      .text('📦 Manage Files', 'admin:manage').row()
      .text('📊 Sales', 'admin:sales');

    await ctx.editMessageText(text, { reply_markup: keyboard });
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

      let text = `👥 Buyers — ${product.name}\nTotal buyers: ${buyers.length}\n\n`;
      buyers.forEach((b, i) => {
        const name = b.username ? `@${b.username}` : (b.first_name || b.telegram_user_id.toString());
        const date = new Date(b.purchased_at).toLocaleDateString();
        text += `${i + 1}. ${name}\n   ⭐${b.payments?.amount_stars || 0}\n   ${date}\n\n`;
      });

      const keyboard = new InlineKeyboard().text('⬅️ Back', `admin:prod:${productId}`);
      
      // Prevent message too long errors
      if (text.length > 4000) text = text.substring(0, 4000) + "\n... (truncated)";
      
      await ctx.editMessageText(text, { reply_markup: keyboard });
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
