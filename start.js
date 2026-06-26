const { Markup } = require('telegraf');
const Chat = require('./Chat');
const UserChat = require('./User');

const pendingSetup = new Map();

const startHandler = async (ctx) => {
  const userId = String(ctx.from.id);
  const firstName = ctx.from.first_name || 'Foydalanuvchi';

  if (ctx.chat.type !== 'private') return;

  // /start ref_M1001234567890_987654321 — taklif havolasi
  const payload = ctx.startPayload || '';

  if (payload.startsWith('ref_')) {
    return handleRefStart(ctx, userId, firstName, payload);
  }

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

// ref_ payload kelganda — foydalanuvchiga invite link berish
const handleRefStart = async (ctx, userId, firstName, payload) => {
  // payload: ref_M1001234567890_987654321
  // chatId: -1001234567890, invitedUserId: 987654321
  try {
    const parts = payload.replace('ref_', '').split('_');
    const rawChatId = parts[0]; // M1001234567890
    const chatId = '-' + rawChatId.replace('M', ''); // -1001234567890

    const chatConfig = await Chat.findOne({ chatId, isActive: true });
    if (!chatConfig) {
      return ctx.reply('❌ Guruh topilmadi.');
    }

    // Bu foydalanuvchining o'sha guruhdagi holati
    const userRecord = await UserChat.findOne({ userId, chatId });

    if (!userRecord) {
      // Guruhda yo'q — invite link bering
      return sendInviteLink(ctx, chatId, chatConfig);
    }

    if (!userRecord.isRestricted) {
      return ctx.replyWithMarkdown(
        `✅ Siz *"${chatConfig.title}"* guruhida yozish huquqiga egasiz!\n\n` +
        `Guruhga o'ting va yozing.`
      );
    }

    // Restrict bor — statistika + invite link
    const done = userRecord.referralCount;
    const needed = chatConfig.referralLimit;
    const remaining = needed - done;
    const bar = '▓'.repeat(Math.min(done, needed)) + '░'.repeat(Math.max(0, needed - done));

    await ctx.replyWithMarkdown(
      `📊 *"${chatConfig.title}"* — Sizning holatIngiz:\n\n` +
      `👥 Qo'shgan odamlar: *${done}/${needed}*\n` +
      `${bar}\n\n` +
      `🔒 Yozish uchun yana *${remaining} ta odam* qo'shing\n\n` +
      `👇 Do'stlaringizga shu havolani yuboring:`
    );

    await sendInviteLink(ctx, chatId, chatConfig);

  } catch (e) {
    console.error('handleRefStart xatosi:', e.message);
    ctx.reply('❌ Xato yuz berdi.');
  }
};

// Guruh uchun invite link yaratib yuborish
const sendInviteLink = async (ctx, chatId, chatConfig) => {
  try {
    const link = await ctx.telegram.createChatInviteLink(chatId, {
      name: `Ref_${ctx.from.id}`,
      creates_join_request: false
    });

    await ctx.replyWithMarkdown(
      `🔗 *Sizning taklif havolangiz:*\n\n` +
      `${link.invite_link}\n\n` +
      `*"${chatConfig.title}"* guruhiga shu havola orqali odam qo'shing!\n` +
      `Har bir qo'shilgan odam hisobingizga qo'shiladi ✅`,
      { disable_web_page_preview: true }
    );
  } catch (e) {
    console.error('createChatInviteLink xatosi:', e.message);
    await ctx.reply('❌ Havola yaratishda xato. Bot "Havola orqali taklif qilish" huquqiga ega emasdir.');
  }
};

// "Guruh/Kanal Ulash" tugmasi
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

const cancelSetupAction = async (ctx) => {
  const userId = String(ctx.from.id);
  pendingSetup.delete(userId);
  await ctx.answerCbQuery('Bekor qilindi');
  await ctx.deleteMessage();
};

const myChatsAction = async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);

  const chats = await Chat.find({ ownerId: userId, isActive: true });

  if (chats.length === 0) {
    return ctx.editMessageText(
      '📭 Hali hech qanday guruh/kanal ulanmagan.',
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
    `📋 *Sizning guruh/kanallaringiz:*`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
};

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
