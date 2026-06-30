const { Markup } = require('telegraf');
const Chat = require('./Chat');
const UserChat = require('./User');

/**
 * /myrefs — foydalanuvchining joriy guruhda statistikasi
 * Guruh ichida ishlatiladi
 */
const myRefsCommand = async (ctx) => {
  // Faqat guruh/supergroupda
  if (ctx.chat.type === 'private') {
    return ctx.reply(
      '💡 Bu buyruqni guruh ichida ishlating.\n\nYoki "Mening Statistikam" tugmasini bosing:',
      Markup.inlineKeyboard([
        [Markup.button.callback('📊 Mening Statistikam', 'my_stats')]
      ])
    );
  }

  const chatId = String(ctx.chat.id);
  const userId = String(ctx.from.id);

  const chatConfig = await Chat.findOne({ chatId, isActive: true });
  if (!chatConfig) return; // Bu guruh botda ro'yxatda emas

  const userRecord = await UserChat.findOne({ userId, chatId });
  if (!userRecord) {
    return ctx.reply(
      `📊 @${ctx.from.username || ctx.from.first_name}, siz haqingizda ma'lumot yo'q.\n` +
      `Guruhga yangi a'zo sifatida kiring.`
    );
  }

  const done = userRecord.referralCount;
  const needed = chatConfig.referralLimit;
  const remaining = Math.max(0, needed - done);
  const progress = Math.min(done, needed);
  const progressBar = makeProgressBar(progress, needed);

  let statusText;
  if (userRecord.isRestricted) {
    statusText = `🔒 Yozish *cheklangan*\nYana *${remaining} ta odam* qo'shing`;
  } else {
    statusText = `✅ Yozish *ruxsat etilgan*`;
  }

  await ctx.reply(
    `📊 *${ctx.from.first_name}* — Statistika\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Qo'shgan odamlar: *${done}/${needed}*\n` +
    `${progressBar}\n\n` +
    `${statusText}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔗 Taklif Havolam', `get_invite:${chatId}`)]
      ])
    }
  );
};

/**
 * /invite — foydalanuvchi o'z taklif havolasini oladi
 * Bu oddiy invite link — Telegram native invite link
 */
const inviteCommand = async (ctx) => {
  if (ctx.chat.type === 'private') {
    return ctx.reply('💡 Bu buyruqni guruh ichida ishlating.');
  }

  const chatId = String(ctx.chat.id);
  const userId = String(ctx.from.id);

  const chatConfig = await Chat.findOne({ chatId, isActive: true });
  if (!chatConfig) return;

  const userRecord = await UserChat.findOne({ userId, chatId });
  if (!userRecord) return;

  // Foydalanuvchi uchun invite link yaratish
  try {
    const link = await ctx.telegram.createChatInviteLink(chatId, {
      name: `Ref_${userId}`,
      creates_join_request: false
    });

    await ctx.reply(
      `🔗 *Sizning taklif havolangiz:*\n\n` +
      `${link.invite_link}\n\n` +
      `Bu havolani do'stlaringizga yuboring!\n` +
      `Ular guruhga qo'shilganda sizning hisobingiz oshadi.`,
      {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }
    );
  } catch (err) {
    console.error('createChatInviteLink xatosi:', err.message);
    await ctx.reply('❌ Havola yaratishda xato. Bot invite yaratish huquqiga ega emasdir.');
  }
};

/**
 * "🔗 Taklif Havolam" tugmasi — myRefsCommand natijasidagi inline tugma
 */
const getInviteAction = async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = ctx.callbackQuery.data.split(':')[1];
  const userId = String(ctx.from.id);

  const chatConfig = await Chat.findOne({ chatId, isActive: true });
  if (!chatConfig) return;

  const userRecord = await UserChat.findOne({ userId, chatId });
  if (!userRecord) return;

  try {
    const link = await ctx.telegram.createChatInviteLink(chatId, {
      name: `Ref_${userId}`,
      creates_join_request: false
    });

    await ctx.reply(
      `🔗 *Sizning taklif havolangiz:*\n\n` +
      `${link.invite_link}\n\n` +
      `Bu havolani do'stlaringizga yuboring!\n` +
      `Ular guruhga qo'shilganda sizning hisobingiz oshadi.`,
      {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }
    );
  } catch (err) {
    console.error('createChatInviteLink xatosi:', err.message);
    await ctx.reply('❌ Havola yaratishda xato. Bot invite yaratish huquqiga ega emasdir.');
  }
};

/**
 * Admin uchun: guruh statistikasi (top referrerlar)
 * Guruh egalari private chatdan ko'radi
 */
const statsAction = async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = ctx.callbackQuery.data.split(':')[1];
  const userId = String(ctx.from.id);

  // Faqat guruh egasi ko'ra oladi
  const chatConfig = await Chat.findOne({ chatId, ownerId: userId });
  if (!chatConfig) {
    return ctx.editMessageText('❌ Ruxsat yo\'q.');
  }

  // Top 10 referrer
  const topUsers = await UserChat.find({ chatId })
    .sort({ referralCount: -1 })
    .limit(10);

  if (topUsers.length === 0) {
    return ctx.editMessageText(
      `📊 *${chatConfig.title}* — Statistika\n\nHali hech kim odam qo'shmagan.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Orqaga', `manage_chat:${chatId}`)]
        ])
      }
    );
  }

  const totalMembers = await UserChat.countDocuments({ chatId });
  const unlockedMembers = await UserChat.countDocuments({ chatId, isRestricted: false });

  let leaderboard = '';
  topUsers.forEach((u, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const name = u.username ? `@${u.username}` : u.firstName || `User${u.userId}`;
    const status = u.isRestricted ? '🔒' : '✅';
    leaderboard += `${medal} ${name} — ${u.referralCount} ta ${status}\n`;
  });

  await ctx.editMessageText(
    `📊 *${chatConfig.title}* — Statistika\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Jami a'zolar: *${totalMembers}*\n` +
    `✅ Yozish huquqi: *${unlockedMembers}*\n` +
    `🔒 Cheklangan: *${totalMembers - unlockedMembers}*\n` +
    `🎯 Limit: *${chatConfig.referralLimit} ta*\n\n` +
    `🏆 *Top Referrerlar:*\n${leaderboard}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Orqaga', `manage_chat:${chatId}`)]
      ])
    }
  );
};

/**
 * Private chatdan statistikani ko'rish (barcha ulangan guruhlar bo'yicha)
 */
const myStatsAction = async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);

  const records = await UserChat.find({ userId });

  if (records.length === 0) {
    return ctx.editMessageText(
      '📊 Siz hali hech qanday guruhda yo\'qsiz.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Orqaga', 'back_to_start')]
      ])
    );
  }

  let statsText = `📊 *Sizning statistikangiz:*\n━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const record of records) {
    const chat = await Chat.findOne({ chatId: record.chatId });
    if (!chat) continue;

    const status = record.isRestricted ? '🔒' : '✅';
    const done = record.referralCount;
    const needed = chat.referralLimit;
    statsText += `${status} *${chat.title}*\n`;
    statsText += `   👥 ${done}/${needed} ta qo'shildi\n\n`;
  }

  await ctx.editMessageText(statsText, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Orqaga', 'back_to_start')]
    ])
  });
};

// Progressbar yordamchi funksiya
const makeProgressBar = (current, total) => {
  const filled = Math.round((current / total) * 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty) + ` ${current}/${total}`;
};

module.exports = {
  myRefsCommand,
  inviteCommand,
  getInviteAction,
  statsAction,
  myStatsAction
};
