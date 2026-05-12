const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChannelType } = require("discord.js");
const fs = require("fs");

// ดึงค่าจาก Secrets (Environment Variables)
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

let data = { money: {}, inventory: {}, shop: [], users: {} };
const DATA_FILE = "data.json";

if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const session = {};
const otpStore = {};

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
});

const commands = [
    new SlashCommandBuilder().setName("login").setDescription("ส่ง OTP"),
    new SlashCommandBuilder().setName("verify").setDescription("ยืนยัน OTP").addIntegerOption(o => o.setName("otp").setRequired(true)),
    new SlashCommandBuilder().setName("balance").setDescription("ดูเงิน"),
    new SlashCommandBuilder().setName("inventory").setDescription("ดูของ"),
    new SlashCommandBuilder().setName("shop").setDescription("ดูร้าน"),
    new SlashCommandBuilder().setName("store").setDescription("ร้านทั้งหมด"),
    new SlashCommandBuilder().setName("sell").setDescription("ตั้งขายของ"),
    new SlashCommandBuilder().setName("buy").setDescription("ซื้อของ").addIntegerOption(o => o.setName("id").setRequired(true)),
    new SlashCommandBuilder().setName("edititem").setDescription("แก้สินค้า").addIntegerOption(o => o.setName("id").setRequired(true)).addStringOption(o => o.setName("name")).addIntegerOption(o => o.setName("price")),
    new SlashCommandBuilder().setName("newshop").setDescription("สร้างร้าน").addStringOption(o => o.setName("name").setRequired(true)),
    new SlashCommandBuilder().setName("leaderboard").setDescription("อันดับเงิน"),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    try {
        if (!TOKEN || !CLIENT_ID) {
            console.error("❌ Error: TOKEN or CLIENT_ID is missing in Secrets!");
            return;
        }
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log("✅ Registered Slash Commands");
    } catch (e) { console.error(e); }
})();

client.once("ready", () => console.log(`✅ Logged in as ${client.user.tag}`));

client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    const userId = i.user.id;
    if (!data.money[userId]) data.money[userId] = 100;
    if (!data.inventory[userId]) data.inventory[userId] = [];

    if (i.commandName === "login") {
        const otp = Math.floor(100000 + Math.random() * 900000);
        otpStore[userId] = { code: otp, expire: Date.now() + 60000 };
        try {
            await i.user.send(`🔐 OTP: ${otp}`);
            return i.reply({ content: "📩 ส่งแล้ว", ephemeral: true });
        } catch { return i.reply({ content: "❌ เปิด DM ก่อน", ephemeral: true }); }
    }

    if (i.commandName === "verify") {
        const input = i.options.getInteger("otp");
        const otp = otpStore[userId];
        if (!otp || Date.now() > otp.expire || input !== otp.code) return i.reply({ content: "❌ ผิดพลาด", ephemeral: true });
        session[userId] = true;
        delete otpStore[userId];
        return i.reply({ content: "🔓 สำเร็จ", ephemeral: true });
    }

    if (i.commandName === "balance") {
        if (!session[userId]) return i.reply({ content: "❌ login ก่อน", ephemeral: true });
        return i.reply({ content: `💰 ${data.money[userId]}`, ephemeral: true });
    }

    if (i.commandName === "inventory") {
        if (!session[userId]) return i.reply({ content: "❌ login ก่อน", ephemeral: true });
        const inv = data.inventory[userId];
        let text = "🎒 ของคุณ:\n";
        inv.forEach((it, idx) => text += `${idx + 1}. ${it.name} | ${it.price}\n`);
        return i.reply({ content: text || "ว่างเปล่า", ephemeral: true });
    }

    if (i.commandName === "sell") {
        const item = { id: Date.now(), name: "Item", price: 100, seller: userId };
        data.shop.push(item);
        saveData();
        return i.reply(`🛒 ID: ${item.id}`);
    }

    if (i.commandName === "shop" || i.commandName === "store") {
        let text = "🏪 Shop:\n";
        data.shop.forEach(s => text += `ID:${s.id} | ${s.name} | ${s.price}\n`);
        return i.reply(text || "ไม่มีของ");
    }

    if (i.commandName === "buy") {
        const id = i.options.getInteger("id");
        const idx = data.shop.findIndex(x => x.id === id);
        const item = data.shop[idx];
        if (!item || data.money[userId] < item.price) return i.reply("❌ ไม่สำเร็จ");
        data.money[userId] -= item.price;
        data.inventory[userId].push(item);
        data.shop.splice(idx, 1);
        saveData();
        return i.reply("✅ สำเร็จ");
    }

    if (i.commandName === "edititem") {
        const id = i.options.getInteger("id");
        const item = data.shop.find(x => x.id === id);
        if (!item || item.seller !== userId) return i.reply("❌ ไม่พบสินค้า");
        const n = i.options.getString("name");
        const p = i.options.getInteger("price");
        if (n) item.name = n;
        if (p) item.price = p;
        saveData();
        return i.reply("✏️ แก้แล้ว");
    }

    if (i.commandName === "newshop") {
        const name = i.options.getString("name");
        try {
            const channel = await i.guild.channels.create({ name: `shop-${name}`, type: ChannelType.GuildText });
            return i.reply(`🏬 สร้างแล้ว: ${channel}`);
        } catch { return i.reply("❌ บอทไม่มีสิทธิ์สร้างห้อง"); }
    }

    if (i.commandName === "leaderboard") {
        const top = Object.entries(data.money).sort((a, b) => b[1] - a[1]).slice(0, 10);
        let text = "🏆 Leaderboard:\n";
        for (let idx = 0; idx < top.length; idx++) {
            const user = await client.users.fetch(top[idx][0]).catch(() => null);
            text += `${idx + 1}. ${user?.username || "Unknown"} - ${top[idx][1]}\n`;
        }
        return i.reply(text);
    }
});

client.login(TOKEN);
