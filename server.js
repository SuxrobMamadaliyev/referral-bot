require('dotenv').config();
const express = require('express');
const connectDB = require('./database');
const bot = require('./bot');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;

// Health check (Render.com uchun zarur)
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'Multi Referral Bot',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Webhook endpoint
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Asosiy ishga tushirish
const start = async () => {
  try {
    // MongoDB ga ulanish
    await connectDB();

    if (WEBHOOK_URL) {
      // Production: Webhook rejimi (Render.com)
      const webhookPath = `/webhook/${BOT_TOKEN}`;
      const fullWebhookUrl = `${WEBHOOK_URL}${webhookPath}`;

      await bot.telegram.setWebhook(fullWebhookUrl, {
        allowed_updates: [
          'message',
          'callback_query',
          'chat_member',
          'my_chat_member'
        ]
      });

      console.log(`✅ Webhook o'rnatildi: ${fullWebhookUrl}`);

      app.listen(PORT, () => {
        console.log(`🚀 Server port ${PORT} da ishlamoqda`);
        console.log(`🤖 Bot webhook rejimida ishlamoqda`);
      });

    } else {
      // Development: Long polling rejimi
      await bot.telegram.deleteWebhook();
      console.log('🔄 Long polling rejimi...');
      bot.launch();
      console.log('🤖 Bot polling rejimida ishlamoqda');

      // Express ham ishlaydi (local test uchun)
      app.listen(PORT, () => {
        console.log(`🚀 Server port ${PORT} da ishlamoqda`);
      });
    }

    // Graceful shutdown
    process.once('SIGINT', () => {
      bot.stop('SIGINT');
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      bot.stop('SIGTERM');
      process.exit(0);
    });

  } catch (err) {
    console.error('❌ Server ishga tushmadi:', err.message);
    process.exit(1);
  }
};

start();
