const login = require("@dongdev/fca-unofficial");
const fs = require("fs-extra");
const path = require("path");
const logger = require("./utils/log");
const config = require("./config.json");

global.config = config;
global.commands = new Map();
global.cooldowns = new Map();
global.nodemodule = {};

const commandsPath = path.join(__dirname, "modules", "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
    try {
        const command = require(path.join(commandsPath, file));
        if (command.config && command.config.name) {
            global.commands.set(command.config.name, command);
            logger.loader(`Loaded command: ${command.config.name}`);
        }
    } catch (error) {
        logger(`Failed to load command ${file}: ${error.message}`, "error");
    }
}

logger(`Loaded ${global.commands.size} commands`, "[ COMMANDS ]");

const Users = {
    data: {},
    async getData(uid) {
        if (!this.data[uid]) {
            this.data[uid] = { name: "User", uid: uid };
        }
        return this.data[uid];
    },
    async setData(uid, data) {
        this.data[uid] = { ...this.data[uid], ...data };
    },
    async getNameUser(uid) {
        const userData = await this.getData(uid);
        return userData.name || "User";
    }
};

const Currencies = {
    data: {},
    async getData(uid) {
        if (!this.data[uid]) {
            this.data[uid] = { money: 0 };
        }
        return this.data[uid];
    },
    async setData(uid, data) {
        this.data[uid] = { ...this.data[uid], ...data };
    },
    async increaseMoney(uid, amount) {
        if (!this.data[uid]) this.data[uid] = { money: 0 };
        this.data[uid].money = (this.data[uid].money || 0) + amount;
    },
    async decreaseMoney(uid, amount) {
        if (!this.data[uid]) this.data[uid] = { money: 0 };
        this.data[uid].money = (this.data[uid].money || 0) - amount;
    }
};

const dataPath = path.join(__dirname, "Fca_Database");
if (fs.existsSync(path.join(dataPath, "users.json"))) {
    try {
        Users.data = JSON.parse(fs.readFileSync(path.join(dataPath, "users.json"), "utf8"));
    } catch (e) {}
}
if (fs.existsSync(path.join(dataPath, "currencies.json"))) {
    try {
        Currencies.data = JSON.parse(fs.readFileSync(path.join(dataPath, "currencies.json"), "utf8"));
    } catch (e) {}
}

setInterval(() => {
    try {
        fs.writeFileSync(path.join(dataPath, "users.json"), JSON.stringify(Users.data, null, 2));
        fs.writeFileSync(path.join(dataPath, "currencies.json"), JSON.stringify(Currencies.data, null, 2));
    } catch (e) {}
}, 60000);

const appstatePath = config.APPSTATEPATH || "appstate.json";
if (!fs.existsSync(appstatePath)) {
    logger("File appstate.json not found! Please provide a valid appstate.", "error");
    process.exit(1);
}

let appstate;
try {
    appstate = JSON.parse(fs.readFileSync(appstatePath, "utf8"));
} catch (error) {
    logger(`Failed to parse appstate.json: ${error.message}`, "error");
    process.exit(1);
}

login({ appState: appstate }, config.FCAOption, (err, api) => {
    if (err) {
        logger(`Login failed: ${JSON.stringify(err)}`, "error");
        return process.exit(1);
    }

    logger(`Logged in successfully as ${config.BOTNAME}`, "[ LOGIN ]");

    api.setOptions({
        forceLogin: true,
        listenEvents: true,
        logLevel: "silent",
        selfListen: false
    });

    api.listenMqtt(async (err, event) => {
        if (err) {
            logger(`Listen error: ${err}`, "error");
            return;
        }

        if (event.type === "message" || event.type === "message_reply") {
            const { threadID, messageID, senderID, body } = event;

            if (!body) return;

            const prefix = config.PREFIX || "-";
            if (!body.startsWith(prefix)) return;

            const args = body.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            const command = global.commands.get(commandName);
            if (!command) return;

            const now = Date.now();
            const cooldownAmount = (command.config.cooldowns || 5) * 1000;
            const cooldownKey = `${senderID}_${commandName}`;

            if (global.cooldowns.has(cooldownKey)) {
                const expirationTime = global.cooldowns.get(cooldownKey) + cooldownAmount;
                if (now < expirationTime) {
                    const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
                    return api.sendMessage(
                        `Please wait ${timeLeft} seconds before using this command again.`,
                        threadID,
                        messageID
                    );
                }
            }
            global.cooldowns.set(cooldownKey, now);

            try {
                const userInfo = await new Promise((resolve, reject) => {
                    api.getUserInfo(senderID, (err, data) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                if (userInfo && userInfo[senderID]) {
                    Users.data[senderID] = {
                        ...Users.data[senderID],
                        name: userInfo[senderID].name,
                        uid: senderID
                    };
                }

                await command.run({
                    api,
                    event,
                    args,
                    Users,
                    Currencies,
                    config: global.config,
                    prefix
                });
            } catch (error) {
                logger(`Command ${commandName} error: ${error.message}`, "error");
                api.sendMessage(`Error executing command: ${error.message}`, threadID, messageID);
            }
        }
    });
});

process.on("unhandledRejection", (reason, promise) => {
    logger(`Unhandled Rejection: ${reason}`, "error");
});

process.on("uncaughtException", (error) => {
    logger(`Uncaught Exception: ${error.message}`, "error");
});
