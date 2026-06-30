require('dotenv').config();
const { Telegraf } = require('telegraf');

// Handlers
const {
  startHandler,
  setupStartAction,
  cancelSetupAction,
  myChatsAction,
  backToStartAction,
  pendingSetup
} = require('./start');

const {
  handleSetupMessage,
  manageChatAction,
  changeLimitAction,
  handleChangeLimitMessage,
  deleteChatAction,
  confirmDeleteAction,
  recheckAction
} = require('./setup');

const {
  handleNewMember,
  handleChatMemberUpdated
} = require('./member');

const {
  myRefsCommand,
  inviteCommand,
  getInviteAction,
  statsAction,
  myStatsAction
} = require('./refs');

const {
  adminPanelAction,
  adminStatsAction,
  adminChatsAction,
  adminBroadcastAction,
  handleBroadcastMessage
} = require('./admin');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ═══════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════

bot.start(startHandler);

bot.command('myrefs', myRefsCommand);
bot.command('invite', inviteCommand);

// ═══════════════════════════════════════════
// CALLBACK QUERY ACTIONS
// ═══════════════════════════════════════════

// Start menyu
bot.action('setup_start', setupStartAction);
bot.action('cancel_setup', cancelSetupAction);
bot.action('my_chats', myChatsAction);
bot.action('back_to_start', backToStartAction);
bot.action('my_stats', myStatsAction);

// Guruh boshqaruvi
bot.action(/^manage_chat:/, manageChatAction);
bot.action(/^change_limit:/, changeLimitAction);
bot.action(/^delete_chat:/, deleteChatAction);
bot.action(/^confirm_delete:/, confirmDeleteAction);
bot.action(/^recheck:/, (ctx) => recheckAction(ctx, bot));

// Statistika
bot.action(/^stats:/, statsAction);
bot.action(/^get_invite:/, getInviteAction);

// Admin Panel
bot.action('admin_panel', adminPanelAction);
bot.action('admin_stats', adminStatsAction);
bot.action(/^admin_chats:/, adminChatsAction);
bot.action('admin_broadcast', (ctx) => adminBroadcastAction(ctx, pendingSetup));

// ═══════════════════════════════════════════
// TEXT MESSAGES (Private chat setup flow)
// ═══════════════════════════════════════════

bot.on('text', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next();

  // Setup oqimini tekshirish
  const handled = await handleSetupMessage(ctx, bot)
    || await handleChangeLimitMessage(ctx)
    || await handleBroadcastMessage(ctx, pendingSetup);

  if (!handled) return next();
});

// ═══════════════════════════════════════════
// GROUP EVENTS
// ═══════════════════════════════════════════

// Yangi a'zo (new_chat_members event)
bot.on('new_chat_members', handleNewMember);

// chat_member_updated — invite link orqali qo'shilganda ham ishlaydi
bot.on('chat_member', handleChatMemberUpdated);

// ═══════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════

bot.catch((err, ctx) => {
  console.error(`Bot xatosi [${ctx.updateType}]:`, err.message);
});

module.exports = bot;
