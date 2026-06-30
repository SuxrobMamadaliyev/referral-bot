const Chat = require('./Chat');
const UserChat = require('./User');

// Guruhga xabar yuborish
const sendWelcomeMessage = async (telegram, botUsername, chatId, userId, firstName, limit) => {
  try {
    const name = firstName || 'Foydalanuvchi';
    const refParam = `ref_${String(chatId).replace('-', 'M')}_${userId}`;

    await telegram.sendMessage(
      chatId,
      `👋 Xush kelibsiz, [${name}](tg://user?id=${userId})!\n\n` +
      `🔒 Ushbu guruhda yozish uchun *${limit} ta odam* taklif qilishingiz kerak.\n\n` +
      `👇 Taklif havolangizni olish uchun tugmani bosing:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🔗 Taklif havolasini olish',
              url: `https://t.me/${botUsername}?start=${refParam}`
            }
          ]]
        }
      }
    );
    console.log(`✅ Guruhga xabar yuborildi: ${chatId} -> user ${userId}`);
  } catch (e) {
    console.error(`❌ Guruhga xabar yuborishda xato:`, e.message);
  }
};

// Restrict qilish
const restrictUser = async (telegram, chatId, userId) => {
  try {
    await telegram.restrictChatMember(chatId, userId, {
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
    console.log(`🔒 Restricted: ${userId} in ${chatId}`);
  } catch (err) {
    console.error(`❌ restrictChatMember xatosi:`, err.message);
  }
};

// Restrict olib tashlash
const unrestrictUser = async (telegram, chatId, userId) => {
  try {
    await telegram.restrictChatMember(chatId, userId, {
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
    console.log(`✅ Unrestricted: ${userId} in ${chatId}`);
  } catch (err) {
    console.error(`❌ unrestrictChatMember xatosi:`, err.message);
  }
};

// Yangi a'zoni qayta ishlash
const processNewMember = async (telegram, botInfo, member, chatId, chatConfig) => {
  if (member.is_bot) return;

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

    await restrictUser(telegram, chatId, userId);
    await sendWelcomeMessage(telegram, botInfo.username, chatId, userId, member.first_name, chatConfig.referralLimit);

  } else if (existing.isRestricted) {
    await restrictUser(telegram, chatId, userId);
    // Qaytib kirgan, hali ham cheklangan foydalanuvchiga eslatma + taklif link tugmasini qayta yuboramiz
    await sendWelcomeMessage(telegram, botInfo.username, chatId, userId, member.first_name, chatConfig.referralLimit);
  }
};

// Invite link name dan inviterId olish
// Bot createChatInviteLink da name: "Ref_123456789" deb yaratgan
const getInviterIdFromLink = (inviteLink) => {
  if (!inviteLink) return null;
  // invite_link object ichida name bo'ladi
  const name = inviteLink.name || '';
  if (name.startsWith('Ref_')) {
    return name.replace('Ref_', '');
  }
  return null;
};

// new_chat_members eventi
const handleNewMember = async (ctx) => {
  const chatId = String(ctx.chat.id);
  const chatConfig = await Chat.findOne({ chatId, isActive: true });
  if (!chatConfig) return;

  const newMembers = ctx.message?.new_chat_members || [];
  console.log(`📥 new_chat_members: ${newMembers.length} ta, chatId: ${chatId}`);

  for (const member of newMembers) {
    await processNewMember(ctx.telegram, ctx.botInfo, member, chatId, chatConfig);
  }
};

// chat_member eventi
const handleChatMemberUpdated = async (ctx) => {
  const update = ctx.chatMember;
  if (!update) return;

  const chatId = String(update.chat.id);
  const newStatus = update.new_chat_member?.status;
  const member = update.new_chat_member?.user;

  console.log(`📥 chat_member: userId=${member?.id}, status=${newStatus}, chatId=${chatId}`);
  console.log(`📥 invite_link:`, JSON.stringify(update.invite_link));
  console.log(`📥 from:`, update.from?.id);

  if (!member || member.is_bot) return;
  if (!['member', 'restricted'].includes(newStatus)) return;

  const chatConfig = await Chat.findOne({ chatId, isActive: true });
  if (!chatConfig) return;

  const userId = String(member.id);
  await processNewMember(ctx.telegram, ctx.botInfo, member, chatId, chatConfig);

  // InviterId aniqlash — invite_link.name dan
  let inviterId = getInviterIdFromLink(update.invite_link);

  // Agar invite_link dan topilmasa — from dan olish
  if (!inviterId && update.from) {
    inviterId = String(update.from.id);
  }

  console.log(`📊 inviterId: ${inviterId}, newUserId: ${userId}`);

  if (!inviterId || inviterId === userId) return;

  // Bot o'zi taklif qilmasin
  if (inviterId === String(ctx.botInfo.id)) return;

  const inviterRecord = await UserChat.findOne({ userId: inviterId, chatId });
  if (!inviterRecord) {
    console.log(`⚠️ Inviter DB da yo'q: ${inviterId}`);
    return;
  }

  if (inviterRecord.referredUsers.includes(userId)) {
    console.log(`⚠️ Bu user allaqachon hisoblangan: ${userId}`);
    return;
  }

  const updatedInviter = await UserChat.findOneAndUpdate(
    { userId: inviterId, chatId },
    { $inc: { referralCount: 1 }, $push: { referredUsers: userId } },
    { new: true }
  );

  console.log(`📊 Referral hisoblandi: ${inviterId} -> ${updatedInviter.referralCount}/${chatConfig.referralLimit}`);

  // Limit yetdimi?
  if (updatedInviter.referralCount >= chatConfig.referralLimit && updatedInviter.isRestricted) {
    await unrestrictUser(ctx.telegram, chatId, inviterId);

    try {
      await ctx.telegram.sendMessage(
        inviterId,
        `🎉 *Tabriklaymiz!*\n\n` +
        `*"${chatConfig.title}"* guruhida *${chatConfig.referralLimit} ta odam* taklif qildingiz!\n\n` +
        `Endi guruhda erkin yozishingiz mumkin ✅`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {}
  }
};

module.exports = {
  handleNewMember,
  handleChatMemberUpdated,
  restrictUser: (ctx, chatId, userId) => restrictUser(ctx.telegram, chatId, userId),
  unrestrictUser: (ctx, chatId, userId) => unrestrictUser(ctx.telegram, chatId, userId)
};
