const { Markup } = require('telegraf');
const Chat = require('./Chat');

// Pending setup: egasi guruh ID kutayotgan holat
// { userId: { step: 'awaiting_chat_id' | 'awaiting_limit', chatData: {...} } }
const pendingSetup = new Map();

const startHandler = async (ctx) => {
  const userId = String(ctx.from.id);
  const firstName = ctx.from.first_name || 'Foydalanuvchi';

  // Faqat private chatda ishlaydi
  if (ctx.chat.type !== 'private') return;

  const welcomeText = `
👋 Salom, *${firstName}*!

Men — *Multi Referral Bot*. Sizning guruh yoki kanalingizga odam qo'shish tizimini o'rnatib beraman.

━━━━━━━━━━━━━━━━━━━━━
*Qanday ishlaydi?*

1️⃣ Botni guruhingiz/kanalingizga *admin* qiling
2️⃣ Guruh/kanal *ID* yoki *@username* ini yuboring
3️⃣ *Limit* belgilang (masalan: 5 ta odam)
4️⃣ Tayyor! Yangi a'zolar limit bajarilgunicha *yoza olmaydi*

━━━━━━━━━━━━━━━━━━━━━
*Boshlash uchun tugmani bosing 👇*
`;

  await ctx.replyWithMarkdown(welcomeText,
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Guruh/Kanal Ulash', 'setup_start')],
      [Markup.button.callback('📋 Mening Guruhlarim', 'my_chats')],
    ])
  );
};

// "Guruh/Kanal Ulash" tugmasi bosilganda
const setupStartAction = async (ctx) => {
  const userId = String(ctx.from.id);
  await ctx.answerCbQuery();

  pendingSetup.set(userId, { step: 'awaiting_chat_id' });

  await ctx.editMessageText(
    `📌 *1-qadam: Bot Admin*\n\n` +
    `Avval botni guruh yoki kanalingizga *admin* qilib qo'ying.\n\n` +
    `Keyin guruh/kanal *@username* ini yoki *ID* sini yuboring:\n\n` +
    `_Misol: @mygroupname yoki -1001234567890_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Bekor qilish', 'cancel_setup')]
      ])
    }
  );
};

// Bekor qilish
const cancelSetupAction = async (ctx) => {
  const userId = String(ctx.from.id);
  pendingSetup.delete(userId);
  await ctx.answerCbQuery('Bekor qilindi');
  await ctx.deleteMessage();
};

// Mening guruhlarim
const myChatsAction = async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);

  const chats = await Chat.find({ ownerId: userId, isActive: true });

  if (chats.length === 0) {
    return ctx.editMessageText(
      '📭 Hali hech qanday guruh/kanal ulanmagan.\n\nGuruh ulash uchun "➕ Guruh/Kanal Ulash" tugmasini bosing.',
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Guruh/Kanal Ulash', 'setup_start')],
        [Markup.button.callback('🔙 Orqaga', 'back_to_start')]
      ])
    );
  }

  const buttons = chats.map(chat => [
    Markup.button.callback(
      `${chat.type === 'channel' ? '📢' : '👥'} ${chat.title} (limit: ${chat.referralLimit})`,
      `manage_chat:${chat.chatId}`
    )
  ]);
  buttons.push([Markup.button.callback('➕ Yangi Ulash', 'setup_start')]);
  buttons.push([Markup.button.callback('🔙 Orqaga', 'back_to_start')]);

  await ctx.editMessageText(
    `📋 *Sizning guruh/kanallaringiz:*\n\nBoshqarish uchun birini tanlang:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
};

// /start ga qaytish
const backToStartAction = async (ctx) => {
  await ctx.answerCbQuery();
  const firstName = ctx.from.first_name || 'Foydalanuvchi';

  await ctx.editMessageText(
    `👋 Salom, *${firstName}*!\n\nNima qilmoqchisiz?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Guruh/Kanal Ulash', 'setup_start')],
        [Markup.button.callback('📋 Mening Guruhlarim', 'my_chats')],
      ])
    }
  );
};

module.exports = {
  startHandler,
  setupStartAction,
  cancelSetupAction,
  myChatsAction,
  backToStartAction,
  pendingSetup
};
