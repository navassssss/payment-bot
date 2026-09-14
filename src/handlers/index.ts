import { Bot } from 'grammy';
import { BotContext } from '../bot';
import { setupStartHandler } from './start';
import { setupProductsHandler } from './products';
import { setupPaymentsHandler } from './payments';
import { setupPurchasesHandler } from './purchases';
import { setupAdminHandler } from './admin';

export function setupHandlers(bot: Bot<BotContext>) {
  setupStartHandler(bot);
  setupProductsHandler(bot);
  setupPaymentsHandler(bot);
  setupPurchasesHandler(bot);
  setupAdminHandler(bot);
}
