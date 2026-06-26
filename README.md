# 🤖 Multi-Group Referral Bot

Telegram guruh va kanallar uchun referral tizimi. Yangi a'zolar belgilangan miqdorda odam taklif qilguncha yoza olmaydi.

---

## 📁 Loyiha Strukturasi

```
referral-bot/
├── src/
│   ├── bot.js              # Asosiy bot (handler registration)
│   ├── database.js         # MongoDB Atlas ulanish
│   ├── models/
│   │   ├── Chat.js         # Guruh/kanal modeli
│   │   └── User.js         # Foydalanuvchi referral modeli
│   ├── handlers/
│   │   ├── start.js        # /start, menyu
│   │   ├── setup.js        # Guruh ulash va sozlash
│   │   ├── member.js       # Yangi a'zo kuzatuvi + restrict
│   │   └── refs.js         # Referral statistika
├── server.js               # Express + Webhook
├── .env.example
└── package.json
```

---

## ⚙️ O'rnatish

### 1. Bog'liqliklarni o'rnatish

```bash
npm install
```

### 2. .env fayl yaratish

```bash
cp .env.example .env
```

`.env` ni tahrirlang:

```env
BOT_TOKEN=7xxxxxxxxx:AAF...          # @BotFather dan olingan token
MONGODB_URI=mongodb+srv://...         # MongoDB Atlas connection string
WEBHOOK_URL=https://your-app.onrender.com   # Render URL (deploy qilgandan keyin)
PORT=3000
```

> **`WEBHOOK_URL`** ni bo'sh qoldirsa — **long polling** rejimida ishlaydi (local dev uchun)

### 3. Local ishga tushirish

```bash
# Long polling rejimi
npm run dev
```

---

## 🚀 Render.com Deploy

### 1. MongoDB Atlas sozlash

1. [mongodb.com/atlas](https://mongodb.com/atlas) ga kiring
2. **Free M0** cluster yarating
3. **Database Access** → User yarating (username/password)
4. **Network Access** → `0.0.0.0/0` qo'shing (Render IP uchun)
5. **Connect** → **Drivers** → Connection string ni nusxa oling:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/referralbot
   ```

### 2. GitHub ga yuklash

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/sizning-username/referral-bot
git push -u origin main
```

### 3. Render.com sozlash

1. [render.com](https://render.com) → **New Web Service**
2. GitHub repo ni ulang
3. Sozlamalar:
   - **Name:** `referral-bot`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`

4. **Environment Variables** qo'shing:

| Key | Value |
|-----|-------|
| `BOT_TOKEN` | BotFather tokeningiz |
| `MONGODB_URI` | Atlas connection string |
| `WEBHOOK_URL` | `https://referral-bot.onrender.com` |
| `PORT` | `3000` |

5. **Deploy** bosing → URL oling → `WEBHOOK_URL` ni yangilang → Re-deploy

---

## 🔧 BotFather Sozlamalari

```
/setcommands

myrefs - Mening referral statistikam
invite - Taklif havolasini olish
start - Botni ishga tushirish
```

**Bot huquqlari** (guruhda admin sifatida):
- ✅ Xabarlarni o'chirish
- ✅ A'zolarni cheklash
- ✅ Yangi a'zolar haqida ma'lumot
- ✅ Taklif havolalari yaratish

---

## 📊 MongoDB Collections

### `chats` — Ulangan guruh/kanallar
```js
{
  chatId: "-1001234567890",     // Telegram chat ID
  title: "Mening guruhim",
  username: "mygroupname",      // yoki null
  type: "supergroup",           // group | supergroup | channel
  ownerId: "123456789",         // Guruh egasining user_id
  referralLimit: 5,             // Nechta odam qo'shish kerak
  isActive: true,
  createdAt: ISODate(...)
}
```

### `userchats` — Foydalanuvchi holati (har bir guruh uchun alohida)
```js
{
  userId: "987654321",
  chatId: "-1001234567890",
  firstName: "Ali",
  username: "ali_user",
  referralCount: 3,             // Qo'shgan odamlar soni
  referredUsers: ["111", "222", "333"],  // Kim qo'shildi
  isRestricted: true,           // Hozir restrict bormi
  joinedAt: ISODate(...),
  unrestrictedAt: null          // Restrict olingan vaqt
}
```

---

## 🔄 Ishlash Logikasi

```
Yangi a'zo guruhga kiradi
        ↓
Bot chat_member/new_chat_members eventi oladi
        ↓
Bu guruh botda ro'yxatdami? → YO'Q → Hech narsa qilmaydi
        ↓ HA
Foydalanuvchi DB da bormi?
  → YO'Q: Yaratadi + restrictChatMember()
  → HA + restricted: restrictChatMember() (qayta restrict)
  → HA + unrestricted: Hech narsa
        ↓
Kim taklif qildi? (update.from)
        ↓
Inviter DB da bormi? → Referral +1, referredUsers ga qo'shadi
        ↓
referralCount >= limit? → unrestrictChatMember() + Tabrik xabari
```

---

## 🛠 Muammolar va Yechimlar

### Bot `chat_member` eventini olmayapti
Webhook da `allowed_updates` da `chat_member` borligini tekshiring:
```js
await bot.telegram.setWebhook(url, {
  allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member']
});
```

### Bot restrict qila olmayapti
Bot guruhda **admin** bo'lishi va **"A'zolarni cheklash"** huquqi bo'lishi kerak.

### Render.com da bot o'chib qolmoqda
Free tier 15 daqiqada sleep qiladi. Uptime Robot bilan `/health` endpointni har 14 daqiqada ping qiling:
- [uptimerobot.com](https://uptimerobot.com) → New Monitor → HTTP(s)
- URL: `https://your-app.onrender.com/health`
- Interval: 5 daqiqa

---

## 📝 Litsenziya

MIT
