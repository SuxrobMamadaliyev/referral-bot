const mongoose = require('mongoose');

// Bitta foydalanuvchining bitta guruhdagi holati
const userChatSchema = new mongoose.Schema({
  // Foydalanuvchi Telegram ID
  userId: {
    type: String,
    required: true
  },

  // Guruh/kanal ID
  chatId: {
    type: String,
    required: true
  },

  // Foydalanuvchi ismi
  firstName: {
    type: String,
    default: ''
  },

  lastName: {
    type: String,
    default: ''
  },

  username: {
    type: String,
    default: null
  },

  // Bu guruha qo'shgan odamlar soni
  referralCount: {
    type: Number,
    default: 0
  },

  // Qo'shgan odamlarning user_id lari (takrorlanmasin)
  referredUsers: {
    type: [String],
    default: []
  },

  // Yozish huquqi bor yoki yo'q
  isRestricted: {
    type: Boolean,
    default: true // Yangi a'zo kelganda default restrict
  },

  // Birinchi marta qo'shilgan sana
  joinedAt: {
    type: Date,
    default: Date.now
  },

  // Limitga yetgan sana (restrict olinganda)
  unrestrictedAt: {
    type: Date,
    default: null
  }
});

// Compound index: userId + chatId kombinatsiyasi unique bo'lsin
userChatSchema.index({ userId: 1, chatId: 1 }, { unique: true });

module.exports = mongoose.model('UserChat', userChatSchema);
