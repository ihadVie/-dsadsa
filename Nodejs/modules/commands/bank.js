const moment = require("moment-timezone");

module.exports.config = {
  name: "bank",
  version: "1.0.0",
  hasPermssion: 0,
  credits: "Vanloi",
  description: "Ngân hàng DexBank và tín dụng đen",
  commandCategory: "Tiện ích",
  usages: "[register/check/gửi/rút/chovay/huygoi/listgoi/tronợ]",
  cooldowns: 0,
  dependencies: {
    "fs-extra": "",
    "axios": "",
    "canvas": ""
  }
};

const DATA_DIR = "data";
const BANK_FILE = "bank.json";
const INTEREST_RATE_PERCENT = 5n;
const INTEREST_INTERVAL_HOURS = 12;
const P2P_PROTECT_COST = 1_000_000n;
const P2P_PROTECT_HOURS = 24;
const COLLECTION_COOLDOWN_MS = 5 * 60 * 1000;
const LEND_EXPIRE_MS = 24 * 60 * 60 * 1000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

module.exports.onLoad = async () => {
  const { existsSync, writeFileSync, mkdirSync } = require("fs-extra");
  const { join } = require("path");
  const dir = join(__dirname, DATA_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const pathData = join(__dirname, DATA_DIR, BANK_FILE);
  if (!existsSync(pathData)) writeFileSync(pathData, "[]", "utf-8");

  if (!global.lendMarket) global.lendMarket = [];

  setInterval(checkAndCalculateInterest, 1 * 60 * 60 * 1000);
  setInterval(async () => {
    if (global.Currencies) {
      await settleExpiredLoans(global.Currencies);
    }
  }, 1 * 60 * 60 * 1000);
};

async function checkAndCalculateInterest() {
  const { readFileSync, writeFileSync } = require("fs-extra");
  const { join } = require("path");
  const pathData = join(__dirname, DATA_DIR, BANK_FILE);

  let users = JSON.parse(readFileSync(pathData, "utf-8"));
  const now = moment();

  users = users.map((account) => {
    if (!account.lastInterestTime) {
      account.lastInterestTime = now.toISOString();
      return account;
    }

    const lastTime = moment(account.lastInterestTime);
    const diffHours = now.diff(lastTime, "hours");

    if (diffHours >= INTEREST_INTERVAL_HOURS) {
      const periods = Math.floor(diffHours / INTEREST_INTERVAL_HOURS);
      let updatedMoney = BigInt(account.money);
      for (let i = 0; i < periods; i += 1) {
        updatedMoney = updatedMoney + (updatedMoney * INTEREST_RATE_PERCENT) / 100n;
      }
      account.money = String(updatedMoney);
      account.lastInterestTime = lastTime.add(periods * INTEREST_INTERVAL_HOURS, "hours").toISOString();
    }

    return account;
  });

  writeFileSync(pathData, JSON.stringify(users, null, 2));
}

const parseAmountToBigInt = (value) => {
  if (!value) return { value: null, error: null };
  const normalized = String(value).trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)(qi|q|t|b|m|k)?$/);
  if (!match) return { value: null, error: null };
  const base = match[1];
  const suffix = match[2];
  const multipliers = {
    k: 1_000n,
    m: 1_000_000n,
    b: 1_000_000_000n,
    t: 1_000_000_000_000n,
    q: 1_000_000_000_000_000n,
    qi: 1_000_000_000_000_000_000n
  };
  const multiplier = suffix ? multipliers[suffix] : 1n;
  if (base.includes(".")) {
    if (suffix === "q" || suffix === "qi") {
      return { value: null, error: "⚠️ Không hỗ trợ số thập phân với q/qi." };
    }
    if (suffix === undefined || suffix === "k" || suffix === "m" || suffix === "b" || suffix === "t") {
      const amount = Math.round(parseFloat(base) * Number(multiplier));
      if (!Number.isFinite(amount)) return { value: null, error: null };
      return { value: BigInt(amount), error: null };
    }
    return { value: null, error: null };
  }
  return { value: BigInt(base) * multiplier, error: null };
};

const parseCurrencyToBigInt = (value) => {
  try {
    if (value === undefined || value === null) return 0n;
    const cleaned = String(value).replace(/,/g, "").trim();
    if (!cleaned) return 0n;
    return BigInt(cleaned);
  } catch (error) {
    return 0n;
  }
};

const formatNumber = (value) => {
  const str = typeof value === "string" ? value : value.toString();
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const ensureBankProfile = (userData) => {
  if (!userData.bank || typeof userData.bank !== "object") userData.bank = {};
  const bank = userData.bank;
  if (bank.debt === undefined) bank.debt = "0";
  if (bank.debtUser === undefined) bank.debtUser = "0";
  if (bank.expire === undefined) bank.expire = 0;
  if (bank.safeUntil === undefined) bank.safeUntil = 0;
  if (bank.lenderID === undefined) bank.lenderID = "";
  if (!Array.isArray(bank.debtLog)) bank.debtLog = [];
  if (bank.lastCollectAt === undefined) bank.lastCollectAt = 0;
  return bank;
};

const getBankAccounts = () => {
  const { readFileSync } = require("fs-extra");
  const { join } = require("path");
  const pathData = join(__dirname, DATA_DIR, BANK_FILE);
  return JSON.parse(readFileSync(pathData, "utf-8"));
};

const saveBankAccounts = (data) => {
  const { writeFileSync } = require("fs-extra");
  const { join } = require("path");
  const pathData = join(__dirname, DATA_DIR, BANK_FILE);
  writeFileSync(pathData, JSON.stringify(data, null, 2));
};

const ensureFonts = async () => {
  const fs = require("fs");
  const axios = require("axios");
  const cacheDir = `${__dirname}/cache`;
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const fonts = [
    {
      name: "SplineSans-Medium.ttf",
      url: "https://drive.google.com/u/0/uc?id=102B8O3_0vTn_zla13wzSzMa-vdTZOCmp&export=download",
      family: "SplineSans-Medium"
    },
    {
      name: "SplineSans.ttf",
      url: "https://drive.google.com/u/0/uc?id=1--V7DANKLsUx57zg8nLD4b5aiPfHcmwD&export=download",
      family: "SplineSans"
    }
  ];

  for (const font of fonts) {
    const localPath = `${__dirname}/${font.name}`;
    const cachedPath = `${cacheDir}/${font.name}`;
    if (!fs.existsSync(cachedPath)) {
      if (fs.existsSync(localPath)) {
        fs.copyFileSync(localPath, cachedPath);
      } else {
        const data = (await axios.get(font.url, { responseType: "arraybuffer" })).data;
        fs.writeFileSync(cachedPath, Buffer.from(data));
      }
    }
  }

  return {
    medium: `${cacheDir}/SplineSans-Medium.ttf`,
    regular: `${cacheDir}/SplineSans.ttf`
  };
};

const toSafeNumber = (big) => {
  if (big > MAX_SAFE_BIGINT) return null;
  return Number(big);
};

const ensureHandleReply = () => {
  if (!global.client) global.client = {};
  if (!global.client.handleReply) global.client.handleReply = [];
};

const safeSend = async (api, message, threadID) => {
  try {
    const maybePromise = api.sendMessage(message, threadID, () => {});
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
      return;
    }
    await new Promise((resolve) => {
      api.sendMessage(message, threadID, () => resolve());
    });
  } catch (error) {
    console.log("[DexBank] sendMessage failed:", error?.message || error);
  }
};

const applyCurrencyChange = async ({ api, Currencies, amountBig, action, threadID, messageID, userId }) => {
  const safeNumber = toSafeNumber(amountBig);
  if (safeNumber === null) {
    if (messageID !== undefined) {
      await api.sendMessage("⚠️ Số quá lớn (vượt safe integer).", threadID, messageID);
    } else {
      await api.sendMessage("⚠️ Số quá lớn (vượt safe integer).", threadID);
    }
    return false;
  }
  if (action === "increase") {
    await Currencies.increaseMoney(userId, safeNumber);
  } else {
    await Currencies.decreaseMoney(userId, safeNumber);
  }
  return true;
};

const settleExpiredLoans = async (Currencies) => {
  if (!global.lendMarket || global.lendMarket.length === 0) return 0;
  if (!Currencies) return 0;

  const now = Date.now();
  const remaining = [];
  let refunded = 0;

  for (const loan of global.lendMarket) {
    if (!loan.createdAt || now - loan.createdAt <= LEND_EXPIRE_MS) {
      remaining.push(loan);
      continue;
    }
    if (loan.escrowed === false) {
      continue;
    }
    const amountBig = BigInt(loan.amount || 0);
    const safeNumber = toSafeNumber(amountBig);
    if (safeNumber === null) {
      console.log(`[DexBank] Loan escrow too large for safe integer: ${loan.amount}`);
      remaining.push(loan);
      continue;
    }
    try {
      await Currencies.increaseMoney(loan.lenderID, safeNumber);
      refunded += 1;
    } catch (error) {
      console.log(`[DexBank] Refund escrow failed for ${loan.lenderID}:`, error?.message || error);
      remaining.push(loan);
    }
  }

  global.lendMarket = remaining;
  return refunded;
};

const fetchAvatarBuffer = async (userId) => {
  const axios = require("axios");
  if (!userId) return null;
  const url = `https://graph.facebook.com/${userId}/picture?height=200&width=200`;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 10000 });
    return Buffer.from(res.data, "binary");
  } catch (error) {
    return null;
  }
};

const drawRoundedRect = (ctx, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const drawGrid = (ctx, width, height) => {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  const spacing = 40;
  for (let x = 0; x < width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
};

const drawTechLines = (ctx, width, height) => {
  ctx.save();
  ctx.strokeStyle = "rgba(0, 255, 204, 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 120);
  ctx.lineTo(320, 120);
  ctx.lineTo(360, 160);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width - 140, 200);
  ctx.lineTo(width - 320, 200);
  ctx.lineTo(width - 360, 240);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.moveTo(120, height - 120);
  ctx.lineTo(400, height - 120);
  ctx.lineTo(440, height - 160);
  ctx.stroke();
  ctx.restore();
};

const drawAvatar = async (ctx, buffer, x, y, size) => {
  if (!buffer) return;
  const { loadImage } = require("canvas");
  const img = await loadImage(buffer);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
};

const drawShield = (ctx, x, y, size) => {
  ctx.save();
  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.moveTo(x + size * 0.5, y);
  ctx.lineTo(x + size, y + size * 0.25);
  ctx.lineTo(x + size * 0.82, y + size * 0.85);
  ctx.lineTo(x + size * 0.5, y + size);
  ctx.lineTo(x + size * 0.18, y + size * 0.85);
  ctx.lineTo(x, y + size * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const buildBankCard = async ({
  name,
  cash,
  accountId,
  bankDebt,
  blackDebt,
  isBadDebt,
  isProtected,
  statusText,
  threadId
}) => {
  const { createCanvas } = require("canvas");
  const { registerFont } = require("canvas");
  const fonts = await ensureFonts();

  registerFont(fonts.medium, { family: "SplineSans-Medium" });
  registerFont(fonts.regular, { family: "SplineSans" });

  const width = 1000;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  if (isBadDebt) {
    gradient.addColorStop(0, "#3b0a0a");
    gradient.addColorStop(1, "#000000");
  } else {
    gradient.addColorStop(0, "#001a33");
    gradient.addColorStop(1, "#000000");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, width, height);
  drawTechLines(ctx, width, height);

  const avatarBuffer = await fetchAvatarBuffer(accountId);
  const statusColor = isProtected ? "#facc15" : isBadDebt ? "#ff4d4d" : "#22c55e";

  ctx.font = "bold 38px SplineSans-Medium";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("DexBank", 60, 70);

  ctx.font = "24px SplineSans";
  ctx.fillStyle = statusColor;
  ctx.fillText(statusText, 60, 105);

  await drawAvatar(ctx, avatarBuffer, width - 150, 40, 90);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(width - 105, 85, 48, 0, Math.PI * 2);
  ctx.stroke();

  if (isProtected) {
    drawShield(ctx, width - 210, 55, 40);
  }

  const boxWidth = 420;
  const boxHeight = 120;
  const startX = 80;
  const startY = 170;
  const gapX = 60;
  const gapY = 40;

  const boxes = [
    { label: "Tiền mặt", value: `${formatNumber(cash)}$`, color: "#00ffcc" },
    { label: "STK", value: accountId, color: "#ffcc00" },
    { label: "Nợ ngân hàng", value: `${formatNumber(bankDebt)}$`, color: "#ff4d4d" },
    { label: "Nợ tín dụng đen", value: `${formatNumber(blackDebt)}$`, color: "#ff4d4d" }
  ];

  boxes.forEach((box, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = startX + col * (boxWidth + gapX);
    const y = startY + row * (boxHeight + gapY);

    ctx.save();
    drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 20);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.stroke();
    ctx.restore();

    ctx.font = "20px SplineSans";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(box.label, x + 20, y + 35);

    ctx.font = "bold 30px SplineSans-Medium";
    ctx.fillStyle = box.color;
    ctx.fillText(box.value, x + 20, y + 80);
  });

  const timeText = moment().tz("Asia/Ho_Chi_Minh").format("HH:mm • DD/MM/YYYY");
  ctx.font = "20px SplineSans";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`⏰ ${timeText}`, 60, height - 40);

  ctx.textAlign = "right";
  ctx.fillText(`Thread: ${threadId}`, width - 60, height - 40);
  ctx.textAlign = "left";

  return canvas.toBuffer();
};

module.exports.run = async function ({ api, event, args, Currencies, Users }) {
  const { threadID, messageID, senderID } = event;
  const command = String(args[0] || "").toLowerCase();

  try {
    const userRaw = await Users.getData(senderID);
    if (!userRaw.data) userRaw.data = {};
    const bankProfile = ensureBankProfile(userRaw.data);

    if (command === "-r" || command === "register") {
      const bankAccounts = getBankAccounts();
      if (!bankAccounts.find((i) => i.senderID == senderID)) {
        const newUser = {
          senderID: senderID,
          money: "0",
          lastInterestTime: moment().toISOString()
        };
        bankAccounts.push(newUser);
        saveBankAccounts(bankAccounts);
      }
      await Users.setData(senderID, userRaw);
      return api.sendMessage("✅ Đã đăng ký DexBank.", threadID, messageID);
    }

    if (command === "gửi" || command === "send") {
      const bankAccounts = getBankAccounts();
      const balancesRaw = (await Currencies.getData(senderID)).money;
      const balances = parseCurrencyToBigInt(balancesRaw);
      const amountInfo = args[1] !== "all" ? parseAmountToBigInt(args[1]) : { value: balances, error: null };
      if (amountInfo.error) return api.sendMessage(amountInfo.error, threadID, messageID);
      if (!amountInfo.value) return api.sendMessage("❌ Số tiền không hợp lệ.", threadID, messageID);
      const balance = amountInfo.value;
      const userData = bankAccounts.find((i) => i.senderID == senderID);
      if (!userData) {
        return api.sendMessage(
          `⚠️ Chưa đăng ký. Dùng ${global.config.PREFIX}${this.config.name} register.`,
          threadID,
          messageID
        );
      }
      if (balance < 10000n) return api.sendMessage("⚠️ Gửi tối thiểu 10,000$.", threadID, messageID);
      if (balance > BigInt(balances)) return api.sendMessage(`⚠️ Không đủ ${formatNumber(balance)}$.`, threadID, messageID);

      const balanceChanged = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: balance,
        action: "decrease",
        threadID,
        messageID,
        userId: senderID
      });
      if (!balanceChanged) return;
      userData.money = String(BigInt(userData.money) + balance);
      saveBankAccounts(bankAccounts);
      return api.sendMessage(`✅ Gửi +${formatNumber(balance)}$\n🏦 Bank: ${formatNumber(userData.money)}$`, threadID, messageID);
    }

    if (command === "rút" || command === "lấy") {
      const bankAccounts = getBankAccounts();
      const userData = bankAccounts.find((i) => i.senderID == senderID);
      const amountInfo = args[1] !== "all" ? parseAmountToBigInt(args[1]) : { value: BigInt(userData?.money || 0), error: null };
      if (amountInfo.error) return api.sendMessage(amountInfo.error, threadID, messageID);
      if (!amountInfo.value) return api.sendMessage("⚠️ Nhập số tiền.", threadID, messageID);
      const money = amountInfo.value;
      if (!userData) {
        return api.sendMessage(
          `⚠️ Chưa đăng ký. Dùng ${global.config.PREFIX}${this.config.name} register.`,
          threadID,
          messageID
        );
      }
      if (money < 10000n) return api.sendMessage("⚠️ Rút tối thiểu 10,000$.", threadID, messageID);
      if (money > BigInt(userData.money)) return api.sendMessage("⚠️ Số dư không đủ.", threadID, messageID);

      const withdrawn = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: money,
        action: "increase",
        threadID,
        messageID,
        userId: senderID
      });
      if (!withdrawn) return;
      userData.money = String(BigInt(userData.money) - money);
      saveBankAccounts(bankAccounts);
      return api.sendMessage(`✅ Rút -${formatNumber(money)}$\n🏦 Còn: ${formatNumber(userData.money)}$`, threadID, messageID);
    }

    if (command === "chovay") {
      const amountInfo = parseAmountToBigInt(args[1]);
      if (amountInfo.error) return api.sendMessage(amountInfo.error, threadID, messageID);
      const amount = amountInfo.value;
      const interest = Number(args[2]);
      const hours = Number(args[3]);

      if (!amount || amount <= 0n) {
        return api.sendMessage("⚠️ Nhập số tiền hợp lệ.", threadID, messageID);
      }
      if (!Number.isFinite(interest) || interest < 0) {
        return api.sendMessage("⚠️ Lãi suất không hợp lệ.", threadID, messageID);
      }
      if (!Number.isFinite(hours) || hours <= 0) {
        return api.sendMessage("⚠️ Giờ không hợp lệ.", threadID, messageID);
      }

      const lenderBalanceRaw = (await Currencies.getData(senderID)).money || 0;
      const lenderBalance = parseCurrencyToBigInt(lenderBalanceRaw);
      if (lenderBalance < amount) {
        return api.sendMessage("⚠️ Bạn không đủ tiền để tạo gói vay.", threadID, messageID);
      }

      const escrowed = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: amount,
        action: "decrease",
        threadID,
        messageID,
        userId: senderID
      });
      if (!escrowed) return;
      const lenderName = (await Users.getData(senderID)).name || senderID;
      global.lendMarket.push({
        lenderID: senderID,
        lenderName,
        amount: String(amount),
        interest,
        hours,
        createdAt: Date.now(),
        escrowed: true
      });

      return api.sendMessage(
        `✅ Đã tạo gói vay #${global.lendMarket.length}\n💸 Số tiền: ${formatNumber(amount)}$\n💹 Lãi: ${interest}%\n⏳ Thời hạn: ${hours} giờ`,
        threadID,
        messageID
      );
    }

    if (command === "huygoi" || command === "cancel") {
      if (!global.lendMarket || global.lendMarket.length === 0) {
        return api.sendMessage("📭 Hiện không có gói vay nào.", threadID, messageID);
      }
      const index = parseInt(args[1], 10) - 1;
      if (!Number.isFinite(index) || index < 0 || index >= global.lendMarket.length) {
        return api.sendMessage("⚠️ Số thứ tự gói vay không hợp lệ.", threadID, messageID);
      }
      const loan = global.lendMarket[index];
      if (loan.lenderID !== senderID) {
        return api.sendMessage("⚠️ Bạn chỉ được hủy gói vay của mình.", threadID, messageID);
      }
      let refundText = "";
      if (loan.escrowed !== false) {
        const amountBig = BigInt(loan.amount || 0);
        const refunded = await applyCurrencyChange({
          api,
          Currencies,
          amountBig: amountBig,
          action: "increase",
          threadID,
          messageID,
          userId: senderID
        });
        if (!refunded) return;
        refundText = ` và hoàn ${formatNumber(amountBig)}$`;
      }
      global.lendMarket.splice(index, 1);
      return api.sendMessage(`✅ Đã hủy gói vay #${index + 1}${refundText}.`, threadID, messageID);
    }

    if (command === "listgoi") {
      await settleExpiredLoans(Currencies);
      if (!global.lendMarket || global.lendMarket.length === 0) {
        return api.sendMessage("📭 Hiện không có gói vay nào.", threadID, messageID);
      }

      const list = global.lendMarket
        .map((item, index) =>
          `${index + 1}. ${formatNumber(item.amount)}$ | ${item.interest}% | ${item.hours}h | Chủ nợ: ${item.lenderName}`
        )
        .join("\n");

      return api.sendMessage(
        `📋 DANH SÁCH GÓI VAY\n${list}\n\n↩️ Reply số thứ tự để nhận gói vay.\n❌ Hủy gói: ${global.config.PREFIX}${this.config.name} huygoi [số]`,
        threadID,
        (error, info) => {
          if (error) return;
          ensureHandleReply();
          global.client.handleReply.push({
            name: this.config.name,
            messageID: info.messageID,
            author: null,
            type: "lendMarket"
          });
        },
        messageID
      );
    }

    if (command === "tronợ") {
      const debtUser = BigInt(bankProfile.debtUser || 0);
      if (debtUser <= 0n) {
        return api.sendMessage("✅ Bạn không có nợ tín dụng đen để trốn.", threadID, messageID);
      }

      const balanceRaw = (await Currencies.getData(senderID)).money || 0;
      const balance = parseCurrencyToBigInt(balanceRaw);
      if (balance < P2P_PROTECT_COST) {
        return api.sendMessage("⚠️ Cần 1,000,000$ để trốn nợ.", threadID, messageID);
      }

      const protectedPaid = await applyCurrencyChange({
        api,
        Currencies,
        amountBig: P2P_PROTECT_COST,
        action: "decrease",
        threadID,
        messageID,
        userId: senderID
      });
      if (!protectedPaid) return;
      const now = Date.now();
      const baseTime = bankProfile.safeUntil && bankProfile.safeUntil > now ? bankProfile.safeUntil : now;
      bankProfile.safeUntil = baseTime + P2P_PROTECT_HOURS * 60 * 60 * 1000;
      await Users.setData(senderID, userRaw);

      const safeTime = moment(bankProfile.safeUntil).tz("Asia/Ho_Chi_Minh").format("HH:mm • DD/MM");
      return api.sendMessage(`🛡️ Đã kích hoạt bảo kê đến ${safeTime}.`, threadID, messageID);
    }

    if (command === "check" || args.length === 0) {
      const cashRaw = (await Currencies.getData(senderID)).money || 0;
      const cash = String(parseCurrencyToBigInt(cashRaw));
      const bankDebt = String(bankProfile.debt || "0");
      const blackDebt = String(bankProfile.debtUser || "0");
      const isBadDebt = BigInt(bankProfile.debtUser || 0) > 0n || BigInt(bankProfile.debt || 0) > 0n;
      const isProtected = bankProfile.safeUntil && bankProfile.safeUntil > Date.now();
      const statusText = isProtected ? "Bảo kê" : isBadDebt ? "Con nợ" : "An toàn";

      const buffer = await buildBankCard({
        name: userRaw.name || senderID,
        cash,
        accountId: senderID,
        bankDebt,
        blackDebt,
        isBadDebt,
        isProtected,
        statusText,
        threadId: threadID
      });

      const fs = require("fs");
      const path = `${__dirname}/cache/dexbank_${senderID}.png`;
      fs.writeFileSync(path, buffer);

      return api.sendMessage(
        {
          body: `🏦 DexBank | ${statusText}\n💵 Tiền mặt: ${formatNumber(cash)}$`,
          attachment: fs.createReadStream(path)
        },
        threadID,
        () => fs.unlinkSync(path),
        messageID
      );
    }

    return api.sendMessage(
      `🏦 DexBank\n${global.config.PREFIX}${this.config.name} register\n${global.config.PREFIX}${this.config.name} check\n${global.config.PREFIX}${this.config.name} gửi 10000\n${global.config.PREFIX}${this.config.name} rút 10000\n${global.config.PREFIX}${this.config.name} chovay [số] [lãi] [giờ]\n${global.config.PREFIX}${this.config.name} huygoi [số]\n${global.config.PREFIX}${this.config.name} listgoi\n${global.config.PREFIX}${this.config.name} tronợ`,
      threadID,
      messageID
    );
  } catch (error) {
    console.error(error);
    return api.sendMessage("⚠️ Có lỗi xảy ra.", threadID, messageID);
  }
};

module.exports.handleReply = async function ({ api, event, handleReply, Users, Currencies }) {
  if (handleReply.type !== "lendMarket") return;

  const { senderID, threadID, body } = event;
  if (handleReply.author && senderID !== handleReply.author) return;

  await settleExpiredLoans(Currencies);

  const choice = parseInt(body, 10);
  if (!Number.isFinite(choice)) {
    return api.sendMessage("⚠️ Vui lòng reply số thứ tự gói vay.", threadID);
  }

  const index = choice - 1;
  const loan = global.lendMarket[index];
  if (!loan) return api.sendMessage("⚠️ Gói vay không tồn tại.", threadID);

  if (loan.lenderID === senderID) {
    return api.sendMessage("⚠️ Bạn không thể tự vay gói của mình.", threadID);
  }

  const borrowerRaw = await Users.getData(senderID);
  if (!borrowerRaw.data) borrowerRaw.data = {};
  const bankProfile = ensureBankProfile(borrowerRaw.data);
  if (BigInt(bankProfile.debtUser || 0) > 0n) {
    return api.sendMessage("⚠️ Bạn đang có nợ tín dụng đen, hãy trả trước khi vay tiếp.", threadID);
  }

  const amount = BigInt(loan.amount);

  const totalDebt = amount + (amount * BigInt(Math.floor(loan.interest * 100))) / 10000n;
  const expire = Date.now() + loan.hours * 60 * 60 * 1000;

  const loanGranted = await applyCurrencyChange({
    api,
    Currencies,
    amountBig: amount,
    action: "increase",
    threadID,
    userId: senderID
  });
  if (!loanGranted) return;

  bankProfile.debtUser = String(totalDebt);
  bankProfile.expire = expire;
  bankProfile.lenderID = loan.lenderID;
  if (bankProfile.safeUntil && bankProfile.safeUntil < Date.now()) bankProfile.safeUntil = 0;

  await Users.setData(senderID, borrowerRaw);

  global.lendMarket.splice(index, 1);

  const expireText = moment(expire).tz("Asia/Ho_Chi_Minh").format("HH:mm • DD/MM");
  return api.sendMessage(
    `✅ Nhận gói vay thành công!\n💸 Nhận: ${formatNumber(amount)}$\n💰 Tổng nợ: ${formatNumber(totalDebt)}$\n⏳ Hết hạn: ${expireText}`,
    threadID
  );
};

module.exports.handleEvent = async function ({ api, event, Users, Currencies }) {
  const { senderID, threadID } = event;
  if (!senderID) return;

  const userRaw = await Users.getData(senderID);
  if (!userRaw.data) userRaw.data = {};
  const bankProfile = ensureBankProfile(userRaw.data);

  const debtUser = BigInt(bankProfile.debtUser || 0);
  if (debtUser <= 0n) return;

  const now = Date.now();
  const expire = Number(bankProfile.expire || 0);
  const safeUntil = Number(bankProfile.safeUntil || 0);

  if (safeUntil && safeUntil > now) return;
  if (!expire || now <= expire) return;
  if (bankProfile.lastCollectAt && now - bankProfile.lastCollectAt < COLLECTION_COOLDOWN_MS) return;

  const cash = parseCurrencyToBigInt((await Currencies.getData(senderID)).money || 0);

  if (cash > 0n) {
    const payAmount = cash > debtUser ? debtUser : cash;
    const safeNumber = toSafeNumber(payAmount);
    if (safeNumber === null) {
      console.log(`[DexBank] Thu nợ thất bại (vượt safe integer): ${payAmount}`);
      return;
    }
    await Currencies.decreaseMoney(senderID, safeNumber);
    if (bankProfile.lenderID) {
      await Currencies.increaseMoney(bankProfile.lenderID, safeNumber);
    }
    const remaining = debtUser - payAmount;
    bankProfile.debtUser = String(remaining > 0n ? remaining : 0n);
    if (remaining <= 0n) {
      bankProfile.expire = 0;
      bankProfile.lenderID = "";
    }
    bankProfile.lastCollectAt = now;
    bankProfile.debtLog.push({
      time: now,
      action: "collect",
      amount: String(payAmount),
      remaining: bankProfile.debtUser
    });
    await Users.setData(senderID, userRaw);

    console.log(`[DexBank] Thu nợ ${senderID}: -${payAmount} còn ${bankProfile.debtUser}`);
    await safeSend(
      api,
      `⚠️ Thu hồi nợ tín dụng đen! Đã trừ ${formatNumber(payAmount)}$ từ người vay. Còn lại: ${formatNumber(bankProfile.debtUser)}$.`,
      threadID
    );
    return;
  }

  const penalty = (debtUser * 2n) / 100n;
  bankProfile.debtUser = String(debtUser + penalty);
  bankProfile.lastCollectAt = now;
  bankProfile.debtLog.push({
    time: now,
    action: "penalty",
    amount: String(penalty),
    remaining: bankProfile.debtUser
  });
  await Users.setData(senderID, userRaw);
  console.log(`[DexBank] Phạt nợ ${senderID}: +${penalty} tổng ${bankProfile.debtUser}`);
  await safeSend(
    api,
    `🚨 Con nợ ${senderID} đã quá hạn! Nợ tăng thêm 2% (${formatNumber(penalty)}$).`,
    threadID
  );
};
