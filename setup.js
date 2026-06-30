const { Markup } = require('telegraf');
const Chat = require('./Chat');
const UserChat = require('./User');
const { pendingSetup } = require('./start');

// Guruh/kanal ID tekshiruvi va bot admin ekanini verify qilish
const handleSetupMessage = async (ctx, bot) => {
  const userId = String(ctx.from.id);
  const setup = pendingSetup.get(userId);

  if (!setup || ctx.chat.type !== 'private') return false;

  // 1-qadam: Guruh ID/username kutilmoqda
  if (setup.step === 'awaiting_chat_id') {
    const input = ctx.message.text.trim();

    // Input validatsiya
    if (!input.startsWith('@') && !input.startsWith('-')) {
      await ctx.reply(
        '⚠️ Noto\'g\'ri format!\n\n' +
        'Iltimos, @username yoki guruh ID sini yuboring.\n' +
        '_Misol: @mygroupname yoki -1001234567890_',
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    // Guruh ma'lumotlarini olish
    try {
      const chat = await bot.telegram.getChat(input);

      if (!['group', 'supergroup', 'channel'].includes(chat.type)) {
        await ctx.reply('❌ Bu oddiy chat. Faqat guruh yoki kanal ulash mumkin.');
        return true;
      }

      // Faqat shu guruh/kanalning o'zi admin yoki egasi ulay oladi
      let requesterMember;
      try {
        requesterMember = await bot.telegram.getChatMember(chat.id, ctx.from.id);
      } catch (e) {
        requesterMember = null;
      }
      const requesterIsAdmin = requesterMember && ['administrator', 'creator'].includes(requesterMember.status);

      if (!requesterIsAdmin) {
        await ctx.reply(
          `❌ *Ruxsat yo'q!*\n\n` +
          `Siz *"${chat.title}"* da admin yoki ega emassiz.\n` +
          `Faqat guruh/kanalning o'zi admini ushbu guruhni botga ulashi mumkin.`,
          { parse_mode: 'Markdown' }
        );
        return true;
      }

      // Bot o'sha guruhda admin ekanini tekshirish
      const botMember = await bot.telegram.getChatMember(chat.id, ctx.botInfo.id);
      const isAdmin = ['administrator', 'creator'].includes(botMember.status);

      if (!isAdmin) {
        await ctx.reply(
          `❌ *Bot hali "${chat.title}" da admin emas!*\n\n` +
          `1. Guruh/kanalga kiring\n` +
          `2. Bot ni admin qilib qo'ying\n` +
          `3. Keyin qaytib ID/username yuboring`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔄 Qayta tekshirish', `recheck:${chat.id}`)]
            ])
          }
        );

        // Guruh ma'lumotini saqlab qo'yamiz, recheck uchun
        pendingSetup.set(userId, {
          step: 'awaiting_chat_id',
          lastChatId: String(chat.id)
        });
        return true;
      }

      // Admin — keyingi qadam: limit belgilash
      pendingSetup.set(userId, {
        step: 'awaiting_limit',
        chatData: {
          chatId: String(chat.id),
          title: chat.title,
          username: chat.username || null,
          type: chat.type
        }
      });

      await ctx.reply(
        `✅ *"${chat.title}"* topildi va bot admin!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `*2-qadam: Limit belgilang*\n\n` +
        `Yangi a'zolar nechta odam qo'shgandan so'ng yoza olsin?\n\n` +
        `_Masalan: 5 yuboring (default: 5)_`,
        { parse_mode: 'Markdown' }
      );
      return true;

    } catch (err) {
      console.error('getChat xatosi:', err.message);
      await ctx.reply(
        '❌ Guruh/kanal topilmadi!\n\n' +
        '• Username to\'g\'ri ekanini tekshiring\n' +
        '• Bot guruhda a\'zo ekanini tekshiring\n' +
        '• Kanal uchun bot avval a\'zo bo\'lishi kerak'
      );
      return true;
    }
  }

  // 2-qadam: Limit kiritilmoqda
  if (setup.step === 'awaiting_limit') {
    const limitInput = parseInt(ctx.message.text.trim());

    if (isNaN(limitInput) || limitInput < 1 || limitInput > 1000) {
      await ctx.reply('⚠️ 1 dan 1000 gacha son kiriting.');
      return true;
    }

    const { chatData } = setup;

    // MongoDB ga saqlash (mavjud bo'lsa update, bo'lmasa yaratish)
    await Chat.findOneAndUpdate(
      { chatId: chatData.chatId },
      {
        ...chatData,
        ownerId: userId,
        referralLimit: limitInput,
        isActive: true
      },
      { upsert: true, new: true }
    );

    pendingSetup.delete(userId);

    const typeLabel = chatData.type === 'channel' ? '📢 Kanal' : '👥 Guruh';

    await ctx.reply(
      `🎉 *Muvaffaqiyatli ulandi!*\n\n` +
      `${typeLabel}: *${chatData.title}*\n` +
      `🔢 Limit: *${limitInput} ta odam*\n\n` +
      `Endi yangi a'zolar ${limitInput} ta odam qo'shgandan so'ng yoza oladi.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⚙️ Boshqarish', `manage_chat:${chatData.chatId}`)],
          [Markup.button.callback('🏠 Bosh Menyu', 'back_to_start')]
        ])
      }
    );
    return true;
  }

  return false;
};

// Limit o'zgarganda, hali cheklangan (restricted) a'zolarga avtomatik xabar yuborish
const notifyLimitChange = async (telegram, chat, newLimit) => {
  const restrictedUsers = await UserChat.find({ chatId: chat.chatId, isRestricted: true });

  for (const u of restrictedUsers) {
    const done = u.referralCount;
    const remaining = Math.max(0, newLimit - done);

    try {
      await telegram.sendMessage(
        u.userId,
        `🔔 *E'tibor bering!*\n\n` +
        `*"${chat.title}"* guruhida yozish limiti o'zgartirildi.\n\n` +
        `🎯 Yangi limit: *${newLimit} ta odam*\n` +
        `👥 Sizning holatingiz: *${done}/${newLimit}*\n\n` +
        `🔒 Yozish uchun yana *${remaining} ta odam* taklif qiling.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      // Foydalanuvchi botni bloklagan bo'lishi mumkin — o'tkazib yuboramiz
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};

// Guruhni boshqarish paneli
const manageChatAction = async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = ctx.callbackQuery.data.split(':')[1];
  const userId = String(ctx.from.id);

  const chat = await Chat.findOne({ chatId, ownerId: userId });
  if (!chat) {
    return ctx.editMessageText('❌ Guruh topilmadi yoki siz egasi emassiz.');
  }

  const typeLabel = chat.type === 'channel' ? '📢' : '👥';

  await ctx.editMessageText(
    `${typeLabel} *${chat.title}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔢 Joriy limit: *${chat.referralLimit} ta odam*\n` +
    `📅 Ulangan: ${chat.createdAt.toLocaleDateString('uz-UZ')}\n` +
    `🟢 Holat: ${chat.isActive ? 'Faol' : 'Nofaol'}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Limitni O\'zgartirish', `change_limit:${chatId}`)],
        [Markup.button.callback('📊 Statistika', `stats:${chatId}`)],
        [Markup.button.callback('🗑 Guruhni O\'chirish', `delete_chat:${chatId}`)],
        [Markup.button.callback('🔙 Orqaga', 'my_chats')]
      ])
    }
  );
};

// Limitni o'zgartirish
const changeLimitAction = async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = ctx.callbackQuery.data.split(':')[1];
  const userId = String(ctx.from.id);

  pendingSetup.set(userId, {
    step: 'changing_limit',
    chatId
  });

  await ctx.editMessageText(
    `✏️ *Yangi limitni kiriting:*\n\n` +
    `(1 dan 1000 gacha son)`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Bekor', `manage_chat:${chatId}`)]
      ])
    }
  );
};

// Limit o'zgartirish jarayoni (text xabari)
const handleChangeLimitMessage = async (ctx) => {
  const userId = String(ctx.from.id);
  const setup = pendingSetup.get(userId);

  if (!setup || setup.step !== 'changing_limit') return false;

  const newLimit = parseInt(ctx.message.text.trim());
  if (isNaN(newLimit) || newLimit < 1 || newLimit > 1000) {
    await ctx.reply('⚠️ 1 dan 1000 gacha son kiriting.');
    return true;
  }

  const updatedChat = await Chat.findOneAndUpdate(
    { chatId: setup.chatId, ownerId: userId },
    { referralLimit: newLimit },
    { new: true }
  );

  pendingSetup.delete(userId);

  await ctx.reply(
    `✅ Limit muvaffaqiyatli *${newLimit} ta* ga o'zgartirildi!\n\n` +
    `🔔 Cheklangan a'zolarga xabar yuborilmoqda...`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚙️ Boshqarish', `manage_chat:${setup.chatId}`)]
      ])
    }
  );

  if (updatedChat) {
    await notifyLimitChange(ctx.telegram, updatedChat, newLimit);
  }

  return true;
};

// Guruhni o'chirish
const deleteChatAction = async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = ctx.callbackQuery.data.split(':')[1];

  await ctx.editMessageText(
    `⚠️ *Haqiqatan ham o'chirmoqchimisiz?*\n\n` +
    `Bu guruh/kanal bilan bog'liq barcha ma'lumotlar o'chadi.`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Ha, o\'chirish', `confirm_delete:${chatId}`)],
        [Markup.button.callback('❌ Yo\'q', `manage_chat:${chatId}`)]
      ])
    }
  );
};

const confirmDeleteAction = async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = ctx.callbackQuery.data.split(':')[1];
  const userId = String(ctx.from.id);

  await Chat.findOneAndDelete({ chatId, ownerId: userId });

  await ctx.editMessageText(
    `🗑 Guruh/kanal muvaffaqiyatli o'chirildi.`,
    Markup.inlineKeyboard([
      [Markup.button.callback('📋 Mening Guruhlarim', 'my_chats')]
    ])
  );
};

// Recheck: bot admin ekanini qayta tekshirish
const recheckAction = async (ctx, bot) => {
  await ctx.answerCbQuery('Tekshirilmoqda...');
  const chatId = ctx.callbackQuery.data.split(':')[1];
  const userId = String(ctx.from.id);

  try {
    const chat = await bot.telegram.getChat(chatId);
    const botMember = await bot.telegram.getChatMember(chatId, ctx.botInfo.id);
    const isAdmin = ['administrator', 'creator'].includes(botMember.status);

    if (!isAdmin) {
      return ctx.answerCbQuery('❌ Bot hali admin emas!', { show_alert: true });
    }

    // Admin — limit bosqichiga o'tish
    pendingSetup.set(userId, {
      step: 'awaiting_limit',
      chatData: {
        chatId: String(chat.id),
        title: chat.title,
        username: chat.username || null,
        type: chat.type
      }
    });

    await ctx.editMessageText(
      `✅ *"${chat.title}"* — bot admin tasdiqlandi!\n\n` +
      `Yangi a'zolar nechta odam qo'shgandan so'ng yoza olsin?\n` +
      `_Masalan: 5 yuboring_`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    await ctx.answerCbQuery('❌ Xato yuz berdi', { show_alert: true });
  }
};

module.exports = {
  handleSetupMessage,
  manageChatAction,
  changeLimitAction,
  handleChangeLimitMessage,
  deleteChatAction,
  confirmDeleteAction,
  recheckAction
};
