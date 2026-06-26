const { Markup } = require('telegraf');
const Chat = require('./Chat');
const UserChat = require('./User');

/**
 * Yangi a'zo guruhga qo'shilganda ishga tushadi.
 * chat_member yoki new_chat_members eventi orqali.
 */
const handleNewMember = async (ctx) => {
  const chatId = String(ctx.chat.id);

  // Bu guruh botda ro'yxatdan o'tganmi?
  const chatConfig = await Chat.findOne({ chatId, isActive: true });
  if (!chatConfig) return;

  // Yangi a'zolar ro'yxati
  const newMembers = ctx.message?.new_chat_members || [];
  if (newMembers.length === 0) return;

  for (const member of newMembers) {
    // Botning o'zini cheklamaymiz
    if (member.is_bot) continue;

    const userId = String(member.id);

    // Foydalanuvchi yozuvi mavjudmi?
    let userRecord = await UserChat.findOne({ userId, chatId });

    if (!userRecord) {
      // Yangi foydalanuvchi — yaratish va restrict qilish
      userRecord = await UserChat.create({
        userId,
        chatId,
        firstName: member.first_name || '',
        lastName: member.last_name || '',
        username: member.username || null,
        referralCount: 0,
        isRestricted: true
      });

      // Foydalanuvchini restrict qilish
      await restrictUser(ctx, chatId, userId);

      // Foydalanuvchiga xabar yuborish (bot guruhda xabar yuborishi)
      try {
        const limitText = chatConfig.referralLimit;
        await ctx.reply(
          `👋 Xush kelibsiz, [${member.first_name}](tg://user?id=${userId})!\n\n` +
          `📌 Ushbu guruhda yozish uchun *${limitText} ta odam* taklif qilishingiz kerak.\n\n` +
          `💡 Taklif havolangizni olish uchun /invite buyrug'ini bosing.`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        // Bot guruhda xabar yubora olmasa (kanal bo'lsa) — ignore
      }
    } else if (userRecord.isRestricted) {
      // Qayta kirgan, hali restrict
      await restrictUser(ctx, chatId, userId);
    }
    // isRestricted === false bo'lsa — cheklov yo'q, hech narsa qilmaymiz
  }
};

/**
 * Bir foydalanuvchini restrict qilish (yoza olmaydi)
 */
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

/**
 * Bir foydalanuvchidan restrict olib tashlash (yoza oladi)
 */
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

/**
 * chat_member_updated eventi: kimdir guruhga qo'shilganda (invite link orqali ham)
 * Bu event yanada ishonchli — new_chat_members bilan birgalikda ishlatiladi
 */
const handleChatMemberUpdated = async (ctx) => {
  const update = ctx.chatMember;
  if (!update) return;

  const chatId = String(update.chat.id);
  const newStatus = update.new_chat_member?.status;
  const member = update.new_chat_member?.user;

  if (!member || member.is_bot) return;

  // Faqat qo'shilgan a'zolar
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
  } else if (existing.isRestricted) {
    await restrictUser(ctx, chatId, userId);
  }

  // Kim taklif qildi? (inviter)
  const inviterId = update.from ? String(update.from.id) : null;
  if (!inviterId || inviterId === userId) return;

  // Inviter o'zini o'zi qo'shmagan bo'lsin
  const inviterRecord = await UserChat.findOne({ userId: inviterId, chatId });
  if (!inviterRecord) return;

  // Allaqachon bu userId qo'shilganmi?
  if (inviterRecord.referredUsers.includes(userId)) return;

  // Referral hisoblash
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

    // Inviterni tabriklash
    try {
      await ctx.telegram.sendMessage(
        inviterId,
        `🎉 *Tabriklaymiz!*\n\n` +
        `Siz *"${chatConfig.title}"* guruhiga *${chatConfig.referralLimit} ta odam* qo'shdingiz!\n\n` +
        `Endi guruhda erkin yozishingiz mumkin ✅`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) { /* Bot bilan suhbat boshlashmagan bo'lishi mumkin */ }
  }
};

module.exports = {
  handleNewMember,
  handleChatMemberUpdated,
  restrictUser,
  unrestrictUser
};
