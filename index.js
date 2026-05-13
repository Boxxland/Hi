const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType
} = require("discord.js");

const fs = require("fs");

// ===== TOKEN ONLY =====
const TOKEN = process.env.TOKEN;

// ===== DATA =====
let data = { money: {}, inventory: {}, shop: [], users: {} };
const DATA_FILE = "data.json";

if (fs.existsSync(DATA_FILE)) {
  data = JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== SAFE STORAGE =====
const session = {};
const otpStore = {};

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName("login").setDescription("ส่ง OTP"),
  new SlashCommandBuilder().setName("verify").addIntegerOption(o =>
    o.setName("otp").setRequired(true)
  ).setDescription("ยืนยัน OTP"),
  new SlashCommandBuilder().setName("balance").setDescription("ดูเงิน"),
  new SlashCommandBuilder().setName("inventory").setDescription("ดูของ"),
  new SlashCommandBuilder().setName("shop").setDescription("ดูร้าน"),
  new SlashCommandBuilder().setName("store").setDescription("ร้านทั้งหมด"),
  new SlashCommandBuilder().setName("sell").setDescription("ตั้งขาย"),
  new SlashCommandBuilder().setName("buy").addIntegerOption(o =>
    o.setName("id").setRequired(true)
  ).setDescription("ซื้อของ"),
  new SlashCommandBuilder().setName("edititem").addIntegerOption(o =>
    o.setName("id").setRequired(true)
  ).setDescription("แก้สินค้า"),
  new SlashCommandBuilder().setName("newshop").addStringOption(o =>
    o.setName("name").setRequired(true)
  ).setDescription("สร้างร้าน"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("อันดับเงิน"),
].map(c => c.toJSON());

// ===== READY =====
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    // ✅ ใช้ client.user.id แทน CLIENT_ID
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("✅ Slash commands registered");
  } catch (e) {
    console.error("Slash error:", e);
  }
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const userId = i.user.id;

  if (!data.money[userId]) data.money[userId] = 100;
  if (!data.inventory[userId]) data.inventory[userId] = [];

  // ===== LOGIN =====
  if (i.commandName === "login") {
    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore[userId] = { code: otp, expire: Date.now() + 60000 };

    try {
      await i.user.send(`🔐 OTP: ${otp}`);
      return i.reply({ content: "📩 ส่ง OTP แล้ว", ephemeral: true });
    } catch {
      return i.reply({ content: "❌ เปิด DM ก่อน", ephemeral: true });
    }
  }

  // ===== VERIFY =====
  if (i.commandName === "verify") {
    const input = i.options.getInteger("otp");
    const otp = otpStore[userId];

    if (!otp || Date.now() > otp.expire || input !== otp.code) {
      return i.reply({ content: "❌ OTP ไม่ถูก", ephemeral: true });
    }

    session[userId] = true;
    delete otpStore[userId];

    return i.reply({ content: "🔓 สำเร็จ", ephemeral: true });
  }

  // ===== CHECK LOGIN =====
  if (!session[userId]) {
    return i.reply({ content: "❌ ต้อง login ก่อน", ephemeral: true });
  }

  // ===== BALANCE =====
  if (i.commandName === "balance") {
    return i.reply(`💰 ${data.money[userId]}`);
  }

  // ===== INVENTORY =====
  if (i.commandName === "inventory") {
    const inv = data.inventory[userId] || [];
    if (inv.length === 0) return i.reply("ว่างเปล่า");

    let text = "🎒 ของคุณ:\n";
    inv.forEach((it, idx) => {
      text += `${idx + 1}. ${it.name} | ${it.price}\n`;
    });

    return i.reply(text);
  }

  // ===== SELL =====
  if (i.commandName === "sell") {
    const item = {
      id: Date.now(),
      name: "Item",
      price: 100,
      seller: userId
    };

    data.shop.push(item);
    saveData();

    return i.reply(`🛒 ID: ${item.id}`);
  }

  // ===== SHOP =====
  if (i.commandName === "shop" || i.commandName === "store") {
    if (data.shop.length === 0) return i.reply("ไม่มีของ");

    let text = "🏪 Shop:\n";
    data.shop.forEach(s => {
      text += `ID:${s.id} | ${s.name} | ${s.price}\n`;
    });

    return i.reply(text);
  }

  // ===== BUY =====
  if (i.commandName === "buy") {
    const id = i.options.getInteger("id");
    const idx = data.shop.findIndex(x => x.id === id);

    const item = data.shop[idx];
    if (!item || data.money[userId] < item.price) {
      return i.reply("❌ ซื้อไม่ได้");
    }

    data.money[userId] -= item.price;
    data.inventory[userId].push(item);
    data.shop.splice(idx, 1);

    saveData();
    return i.reply("✅ ซื้อสำเร็จ");
  }

  // ===== EDIT =====
  if (i.commandName === "edititem") {
    const id = i.options.getInteger("id");
    const item = data.shop.find(x => x.id === id);

    if (!item || item.seller !== userId) {
      return i.reply("❌ ไม่พบสินค้า");
    }

    const n = i.options.getString("name");
    const p = i.options.getInteger("price");

    if (n) item.name = n;
    if (p) item.price = p;

    saveData();
    return i.reply("✏️ แก้แล้ว");
  }

  // ===== NEW SHOP =====
  if (i.commandName === "newshop") {
    const name = i.options.getString("name");

    try {
      const channel = await i.guild.channels.create({
        name: `shop-${name}`
      });

      return i.reply(`🏬 สร้างแล้ว ${channel}`);
    } catch {
      return i.reply("❌ ไม่มีสิทธิ์สร้างห้อง");
    }
  }

  // ===== LEADERBOARD SAFE =====
  if (i.commandName === "leaderboard") {
    const top = Object.entries(data.money)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const textArr = await Promise.all(
      top.map(async (u, idx) => {
        const user = await client.users.fetch(u[0]).catch(() => null);
        return `${idx + 1}. ${user?.username || "Unknown"} - ${u[1]}`;
      })
    );

    return i.reply("🏆 Leaderboard:\n" + textArr.join("\n"));
  }
});

// ===== LOGIN =====
client.login(TOKEN);
