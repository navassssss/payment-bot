import { Bot, session, Context } from 'grammy';
import { config } from './config';
import { setupHandlers } from './handlers';
import { AdminState } from './types/admin-state';
import { UserState } from './types';

export interface BotContext extends Context {
  session: {
    adminState?: AdminState;
    userState?: UserState;
  };
}

export const bot = new Bot<BotContext>(config.BOT_TOKEN);

// Simple in-memory session (acceptable for V1 admin workflows as per spec)
bot.use(session({ initial: () => ({}) }));

setupHandlers(bot);

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  console.error(err.error);
});
