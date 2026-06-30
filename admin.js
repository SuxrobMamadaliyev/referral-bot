const { Markup } = require('telegraf');
const Chat = require('./Chat');
const UserChat = require('./User');

// ADMIN_IDS — vergul bilan ajratilgan Telegram user_id lar (.env da)
// Misol: ADMIN_IDS=123456789,987654321
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

const isAdmin = (userId) => ADMIN_IDS.includes(String(userId));

// Faqat adminlarga ruxsat berish uchun yordamchi
const requireAdmin = async (ctx) => {
  const userId = String(ctx.from.id);
  if (!isAdmin(userId)) {
    await ctx.answerCbQuery('❌ Sizda admin huquqi yo\'q', { show_alert: true });
    return false;
  }
  return true;
};

// ═══════════════════════════════════════════
// ADMIN PANEL — bosh menyu
// ═══════════════════════════════════════════
const adminPanelAction = async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireAdmin(ctx))) return;

  await ctx.editMessageText(
    `🛠 *Admin Panel*\n\n` +
    `Botning umumiy boshqaruv markazi.\n` +
    `Kerakli bo'limni tanlang 👇`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📊 Umumiy Statistika', 'admin_stats')],
        [Markup.button.callback('📋 Barcha Guruhlar', 'admin_chats:0')],
        [Markup.button.callback('📢 Hammaga Xabar', 'admin_broadcast')],
        [Markup.button.callback('🔙 Bosh Menyu', 'back_to_start')]
      ])
    }
  );
};

// ═══════════════════════════════════════════
// UMUMIY STATISTIKA
// ═══════════════════════════════════════════
const adminStatsAction = async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireAdmin(ctx))) return;

  const [
    totalGroups,
    totalChannels,
    totalUniqueUsers,
    totalRecords,
    restrictedCount,
    unlockedCount,
    refAgg,
    topChats
  ] = await Promise.all([
    Chat.countDocuments({ isActive: true, type: { $in: ['group', 'supergroup'] } }),
    Chat.countDocuments({ isActive: true, type: 'channel' }),
    UserChat.distinct('userId'),
    UserChat.countDocuments({}),
    UserChat.countDocuments({ isRestricted: true }),
    UserChat.countDocuments({ isRestricted: false }),
    UserChat.aggregate([{ $group: { _id: null, sum: { $sum: '$referralCount' } } }]),
    Chat.find({ isActive: true }).sort({ createdAt: -1 }).limit(1)
  ]);

  const totalReferrals = refAgg[0]?.sum || 0;
  const totalChats = totalGroups + totalChannels;
  const lastConnected = topChats[0];

  await ctx.editMessageText(
    `📊 *Bot — Umumiy Statistika*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Guruhlar: *${totalGroups}*\n` +
    `📢 Kanallar: *${totalChannels}*\n` +
    `🔗 Jami ulangan: *${totalChats}*\n\n` +
    `🙋 Noyob foydalanuvchilar: *${totalUniqueUsers.length}*\n` +
    `📦 Jami a'zo yozuvlari: *${totalRecords}*\n` +
    `🔒 Hozir cheklangan: *${restrictedCount}*\n` +
    `✅ Hozir erkin: *${unlockedCount}*\n\n` +
    `🎯 Jami taklif qilingan odamlar: *${totalReferrals}*\n` +
    (lastConnected ? `🆕 So'nggi ulangan: *${lastConnected.title}*` : ''),
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Yangilash', 'admin_stats')],
        [Markup.button.callback('🔙 Orqaga', 'admin_panel')]
      ])
    }
  );
};

// ═══════════════════════════════════════════
// BARCHA GURUHLAR (sahifalab ko'rsatish)
// ═══════════════════════════════════════════
const PAGE_SIZE = 5;

const adminChatsAction = async (ctx) => {
  await ctx.answerCbQuery();
  if (!(await requireAdmin(ctx))) return;

  const page = parseInt(ctx.callbackQuery.data.split(':')[1] || '0', 10);
  const total = await Chat.countDocuments({ isActive: true });

  if (total === 0) {
    return ctx.editMessageText(
      '📭 Hali hech qanday guruh/kanal ulanmagan.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Orqaga', 'admin_panel')]])
    );
  }

  const chats = await Chat.find({ isActive: true })
    .sort({ createdAt: -1 })
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE);

  let text = `📋 *Barcha guruh/kanallar* (${page * PAGE_SIZE + 1}-${page * PAGE_SIZE + chats.length} / ${total}):\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const chat of chats) {
    const memberCount = await UserChat.countDocuments({ chatId: chat.chatId });
    const unlockedCount = await UserChat.countDocuments({ chatId: chat.chatId, isRestricted: false });
    const typeIcon = chat.type === 'channel' ? '📢' : '👥';
    text += `${typeIcon} *${chat.title}*\n`;
    text += `   🆔 \`${chat.chatId}\`\n`;
    text += `   👤 Owner: \`${chat.ownerId}\`\n`;
    text += `   🎯 Limit: ${chat.referralLimit} | 👥 A'zo: ${memberCount} | ✅ Erkin: ${unlockedCount}\n\n`;
  }

  const navButtons = [];
  if (page > 0) navButtons.push(Markup.button.callback('⬅️ Oldingi', `admin_chats:${page - 1}`));
  if ((page + 1) * PAGE_SIZE < total) navButtons.push(Markup.button.callback('Keyingi ➡️', `admin_chats:${page + 1}`));

  const buttons = [];
  if (navButtons.length) buttons.push(navButtons);
  buttons.push([Markup.button.callback('🔙 Orqaga', 'admin_panel')]);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
};

// ═══════════════════════════════════════════
// BROADCAST — hammaga xabar yuborish
// ═══════════════════════════════════════════
const adminBroadcastAction = async (ctx, pendingSetup) => {
  await ctx.answerCbQuery();
  if (!(await requireAdmin(ctx))) return;

  const userId = String(ctx.from.id);
  pendingSetup.set(userId, { step: 'awaiting_broadcast' });

  await ctx.editMessageText(
    `📢 *Hammaga xabar yuborish*\n\n` +
    `Yubormoqchi bo'lgan xabar matnini kiriting.\n` +
    `_Markdown formatlash qo'llab-quvvatlanadi (\\*qalin\\*, \\_kursiv\\_)_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Bekor qilish', 'admin_panel')]
      ])
    }
  );
};

const handleBroadcastMessage = async (ctx, pendingSetup) => {
  const userId = String(ctx.from.id);
  const setup = pendingSetup.get(userId);

  if (!setup || setup.step !== 'awaiting_broadcast') return false;
  if (!isAdmin(userId)) {
    pendingSetup.delete(userId);
    return false;
  }

  const text = ctx.message.text.trim();
  pendingSetup.delete(userId);

  const userIds = await UserChat.distinct('userId');
  const statusMsg = await ctx.reply(`⏳ ${userIds.length} foydalanuvchiga yuborilmoqda...`);

  let success = 0;
  let failed = 0;

  for (const uid of userIds) {
    try {
      await ctx.telegram.sendMessage(uid, text, { parse_mode: 'Markdown' });
      success++;
    } catch (e) {
      failed++;
    }
    // Telegram rate-limit (~30 msg/sek) ga urilmaslik uchun kichik kechikish
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  await ctx.telegram.editMessageText(
    statusMsg.chat.id,
    statusMsg.message_id,
    undefined,
    `✅ *Xabar yuborildi!*\n\n` +
    `✅ Muvaffaqiyatli: *${success}*\n` +
    `❌ Yetib bormadi: *${failed}*`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🛠 Admin Panel', 'admin_panel')]])
    }
  );
  return true;
};

module.exports = {
  isAdmin,
  adminPanelAction,
  adminStatsAction,
  adminChatsAction,
  adminBroadcastAction,
  handleBroadcastMessage
};
