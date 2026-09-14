import { createServer } from 'http';
import { webhookCallback } from 'grammy';
import { bot } from './bot';
import { config } from './config';

const webhookHandler = webhookCallback(bot, 'http', {
  secretToken: config.TELEGRAM_WEBHOOK_SECRET
});

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/telegram/webhook') {
    // grammY's webhook handler will check X-Telegram-Bot-Api-Secret-Token
    try {
      await webhookHandler(req, res);
    } catch (err) {
      console.error("Webhook error:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(config.PORT, () => {
  console.log(`🚀 Server listening on port ${config.PORT}`);
});
