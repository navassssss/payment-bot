import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const configSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ADMIN_TELEGRAM_ID: z.string().regex(/^\d+$/, "ADMIN_TELEGRAM_ID must be a numeric string").transform(Number),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1, "TELEGRAM_WEBHOOK_SECRET is required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  NODE_ENV: z.string().default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default(3000),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
