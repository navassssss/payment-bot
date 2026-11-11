import { Bot, InlineKeyboard } from 'grammy';
import { supabase } from '../src/db/client';
import { config } from '../src/config';

async function broadcast() {
  const bot = new Bot(config.BOT_TOKEN);

  console.log('Fetching all users from payments and purchases...');
  const { data: payUsers } = await supabase.from('payments').select('telegram_user_id');
  const { data: purUsers } = await supabase.from('purchases').select('telegram_user_id, username, first_name');

  const userMap = new Map<number, { id: number; username: string | null; first_name: string | null }>();

  purUsers?.forEach(u => {
    userMap.set(Number(u.telegram_user_id), {
      id: Number(u.telegram_user_id),
      username: u.username,
      first_name: u.first_name
    });
  });

  payUsers?.forEach(u => {
    const id = Number(u.telegram_user_id);
    if (!userMap.has(id)) {
      userMap.set(id, { id, username: null, first_name: null });
    }
  });

  const users = Array.from(userMap.values());
  console.log(`Found ${users.length} unique subscribed/buyer users to broadcast to.`);

  const broadcastMessage = 
    `📢 <b>New Feature: Refund Option Now Available!</b>\n\n` +
    `Hello! We have added an official <b>Refund System</b> to Starbot.\n\n` +
    `If you ever experience issues with a purchased file or purchased by mistake:\n` +
    `• You can now request a refund directly from the bot anytime.\n` +
    `• Use <b>/refund</b> or tap <b>[↩️ Request Refund]</b> in <b>/start</b> or <b>/purchases</b>.\n` +
    `• Select your purchased file and submit your request.\n` +
    `• Approved refunds are credited directly back to your <b>Telegram Stars</b> balance!\n\n` +
    `Tap below to view your purchases or request a refund:`;

  const keyboard = new InlineKeyboard()
    .text('📦 My Purchases', 'user:purchases_btn')
    .text('↩️ Request a Refund', 'user:apply_refund');

  let successCount = 0;
  let failedCount = 0;
  const failureDetails: Array<{ id: number; error: string }> = [];

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    try {
      await bot.api.sendMessage(u.id, broadcastMessage, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      successCount++;
      console.log(`[${i + 1}/${users.length}] ✅ Sent to user ${u.id} (${u.username ? '@' + u.username : u.first_name || 'unnamed'})`);
    } catch (err: any) {
      failedCount++;
      const msg = err.description || err.message || String(err);
      console.error(`[${i + 1}/${users.length}] ❌ Failed to send to user ${u.id}: ${msg}`);
      failureDetails.push({ id: u.id, error: msg });
    }

    // Rate limiting: sleep 200ms between messages
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n==================================');
  console.log(`Broadcast Finished!`);
  console.log(`Total: ${users.length}`);
  console.log(`Delivered: ${successCount}`);
  console.log(`Failed / Blocked: ${failedCount}`);
  console.log('==================================\n');

  // Notify Admin of broadcast completion
  try {
    await bot.api.sendMessage(
      config.ADMIN_TELEGRAM_ID,
      `📢 <b>Bulk Message Broadcast Completed</b>\n\n` +
      `• Total users targeted: <b>${users.length}</b>\n` +
      `• Successfully delivered: <b>${successCount}</b>\n` +
      `• Failed / Blocked: <b>${failedCount}</b>\n\n` +
      `<i>All subscribed users have been informed about the new refund option!</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (adminErr) {
    console.error("Could not send summary to admin:", adminErr);
  }
}

broadcast().catch(console.error);
