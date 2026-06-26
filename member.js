const { Markup } = require('telegraf');
const Chat = require('./Chat');
const UserChat = require('./User');

// Guruhga yangi a'zo xabarini yuborish (inline tugma bilan)
const sendWelcomeMessage = async (ctx, chatId, userId, firstName, limit) => {
  try {
    const name = firstName || 'Foydalanuvchi';
    await ctx.telegram.sendMessage(
      chatId,
      `👋 Xush kelibsiz, [${name}](tg://user?id=${userId})!\n\n` +
      `🔒 Ushbu guruhda yozish uchun *${limit} ta odam* taklif qilishingiz kerak.\n\n` +
      `⬇️ Taklif havolangizni olish uchun quyidagi tugmani bosing:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🔗 Taklif havolasini olish',
              url: `https://t.me/${ctx.botInfo.username}?start=ref_${String(chatId).replace('-', 'M')}_${userId}`
            }
          ]]
        }
      }
    );
  } catch (e) {
    console.error('Guruhga xabar yuborishda xato:', e.message);
  }
};

// Yangi a'zo (new_chat_members event)
const handleNewMember = async (ctx) => {
  const chatId = String(ctx.chat.id);

  const chatConfig = await Chat.findOne({ chatId, isActive: true });
  if (!chatConfig) return;

  const newMembers = ctx.message?.new_chat_members || [];
  if (newMembers.length === 0) return;

  for (const member of newMembers) {
    if (member.is_bot) continue;

    const userId = String(member.id);
    let userRecord = await UserChat.findOne({ userId, chatId });

    if (!userRecord) {
      userRecord = await UserChat.create({
        userId,
        chatId,
        firstName: member.first_name || '',
        lastName: member.last_name || '',
        username: member.username || null,
        referralCount: 0,
        isRestricted: true
      });

      await restrictUser(ctx, chatId, userId);
      await sendWelcomeMessage(ctx, chatId, userId, member.first_name, chatConfig.referralLimit);

    } else if (userRecord.isRestricted) {
      await restrictUser(ctx, chatId, userId);
    }
  }
};

// Foydalanuvchini restrict qilish
const restrictUser = async (ctx, chatId, userId) => {
  try {
    await ctx.telegram.restrictChatMember(chatId, userId, {
      permissions: {
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false
      }
    });
  } catch (err) {
    console.error(`restrictChatMember xatosi (${userId}):`, err.message);
  }
};

// Restrict olib tashlash
const unrestrictUser = async (ctx, chatId, userId) => {
  try {
    await ctx.telegram.restrictChatMember(chatId, userId, {
      permissions: {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
        can_change_info: false,
        can_invite_users: true,
        can_pin_messages: false
      }
    });

    await UserChat.findOneAndUpdate(
      { userId, chatId },
      { isRestricted: false, unrestrictedAt: new Date() }
    );
  } catch (err) {
    console.error(`unrestrictChatMember xatosi (${userId}):`, err.message);
  }
};

// chat_member_updated eventi (invite link orqali qo'shilganda)
const handleChatMemberUpdated = async (ctx) => {
  const update = ctx.chatMember;
  if (!update) return;

  const chatId = String(update.chat.id);
  const newStatus = update.new_chat_member?.status;
  const member = update.new_chat_member?.user;

  if (!member || member.is_bot) return;
  if (!['member', 'restricted'].includes(newStatus)) return;

  const chatConfig = await Chat.findOne({ chatId, isActive: true });
  if (!chatConfig) return;

  const userId = String(member.id);
  const existing = await UserChat.findOne({ userId, chatId });

  if (!existing) {
    await UserChat.create({
      userId,
      chatId,
      firstName: member.first_name || '',
      lastName: member.last_name || '',
      username: member.username || null,
      referralCount: 0,
      isRestricted: true
    });

    await restrictUser(ctx, chatId, userId);
    await sendWelcomeMessage(ctx, chatId, userId, member.first_name, chatConfig.referralLimit);

  } else if (existing.isRestricted) {
    await restrictUser(ctx, chatId, userId);
  }

  // Kim taklif qildi?
  const inviterId = update.from ? String(update.from.id) : null;
  if (!inviterId || inviterId === userId) return;

  const inviterRecord = await UserChat.findOne({ userId: inviterId, chatId });
  if (!inviterRecord) return;

  if (inviterRecord.referredUsers.includes(userId)) return;

  const updatedInviter = await UserChat.findOneAndUpdate(
    { userId: inviterId, chatId },
    {
      $inc: { referralCount: 1 },
      $push: { referredUsers: userId }
    },
    { new: true }
  );

  // Limit yetdimi?
  if (updatedInviter.referralCount >= chatConfig.referralLimit && updatedInviter.isRestricted) {
    await unrestrictUser(ctx, chatId, inviterId);

    try {
      await ctx.telegram.sendMessage(
        inviterId,
        `🎉 *Tabriklaymiz!*\n\n` +
        `Siz *"${chatConfig.title}"* guruhiga *${chatConfig.referralLimit} ta odam* qo'shdingiz\\!\n\n` +
        `Endi guruhda erkin yozishingiz mumkin ✅`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }
};

module.exports = {
  handleNewMember,
  handleChatMemberUpdated,
  restrictUser,
  unrestrictUser
};
