require('dotenv').config();
const express = require('express');
const connectDB = require('./database');
const bot = require('./bot');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;

app.get('/', (req, res) => {
  res.json({ status: 'ok', bot: 'Multi Referral Bot', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

const start = async () => {
  try {
    await connectDB();

    if (WEBHOOK_URL) {
      const webhookPath = `/webhook/${BOT_TOKEN}`;
      const fullWebhookUrl = `${WEBHOOK_URL}${webhookPath}`;

      // Avval eski webhookni o'chirish
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });

      // Yangi webhook — BARCHA eventlar bilan
      await bot.telegram.setWebhook(fullWebhookUrl, {
        allowed_updates: [
          'message',
          'edited_message',
          'callback_query',
          'chat_member',
          'my_chat_member',
          'chat_join_request'
        ]
      });

      const webhookInfo = await bot.telegram.getWebhookInfo();
      console.log('✅ Webhook info:', JSON.stringify(webhookInfo));

      app.listen(PORT, () => {
        console.log(`🚀 Server port ${PORT} da ishlamoqda`);
      });

    } else {
      await bot.telegram.deleteWebhook();
      bot.launch({
        allowedUpdates: [
          'message',
          'edited_message', 
          'callback_query',
          'chat_member',
          'my_chat_member',
          'chat_join_request'
        ]
      });
      console.log('🤖 Bot polling rejimida ishlamoqda');

      app.listen(PORT, () => {
        console.log(`🚀 Server port ${PORT} da ishlamoqda`);
      });
    }

    process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
    process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });

  } catch (err) {
    console.error('❌ Server ishga tushmadi:', err.message);
    process.exit(1);
  }
};

start();
