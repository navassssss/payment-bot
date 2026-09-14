import { config } from '../config';

export function isAdmin(telegramUserId: number): boolean {
  return telegramUserId === config.ADMIN_TELEGRAM_ID;
}
