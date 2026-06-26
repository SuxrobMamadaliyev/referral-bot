const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  // Guruh yoki kanal Telegram ID
  chatId: {
    type: String,
    required: true,
    unique: true
  },

  // Guruh/kanal nomi
  title: {
    type: String,
    required: true
  },

  // @username (agar mavjud bo'lsa)
  username: {
    type: String,
    default: null
  },

  // group yoki channel
  type: {
    type: String,
    enum: ['group', 'supergroup', 'channel'],
    required: true
  },

  // Guruh egasining Telegram user_id
  ownerId: {
    type: String,
    required: true
  },

  // Nechta odam qo'shish kerak (limit)
  referralLimit: {
    type: Number,
    default: 5
  },

  // Bot hozir admin ekanmi
  isActive: {
    type: Boolean,
    default: true
  },

  // Qo'shilgan sana
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Chat', chatSchema);
