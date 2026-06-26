const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Atlas ga ulandi');
  } catch (err) {
    console.error('❌ MongoDB ulanish xatosi:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
