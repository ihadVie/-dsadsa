/**
 * FULL INDEX.JS - DEXSKILL BOT
 * Chạy trên nền tảng Node.js - Tối ưu cho Replit & MongoDB
 */

const { spawn } = require("child_process");
const path = require("path");
const axios = require("axios");
const logger = require("./utils/log"); // Đảm bảo bạn có file utils/log.js

function startBot(message) {
    (message) ? console.log(message) : "";

    const child = spawn("node", ["--expose-gc", "main.js"], {
        cwd: __dirname,
        stdio: "inherit",
        shell: true
    });

    child.on("close", (codeExit) => {
        if (codeExit != 0 || (global.countRestart && global.countRestart < 5)) {
            startBot("Bot đang khởi động lại...");
            global.countRestart = (global.countRestart || 0) + 1;
        } else {
            console.log("Bot đã dừng lại.");
        }
    });

    child.on("error", (error) => {
        console.error(`Đã xảy ra lỗi khi khởi động Bot: ${error}`);
    });
}

/** * TẠO SERVER UPTIME (Giúp Bot không bị ngủ trên Replit)
 */
const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send('Dexskill Bot is running!');
});

app.listen(port, () => {
    console.log(`[ UPTIME ] » Máy chủ đang chạy tại port: ${port}`);
});

// Bắt đầu quy trình chạy Bot
console.log("[ DEXSKILL ] » Đang kiểm tra hệ thống...");
startBot();

/**
 * AUTO CLEAN CACHE (Dọn dẹp tệp rác để tránh đầy bộ nhớ Replit)
 */
setInterval(() => {
    try {
        const cachePath = path.join(__dirname, "modules", "commands", "cache");
        if (require("fs").existsSync(cachePath)) {
            const files = require("fs").readdirSync(cachePath);
            files.forEach(file => {
                // Giữ lại các font ttf, chỉ xóa ảnh tạm
                if (!file.endsWith(".ttf")) {
                    require("fs").unlinkSync(path.join(cachePath, file));
                }
            });
            console.log("[ CLEANER ] » Đã dọn dẹp bộ nhớ đệm.");
        }
    } catch (e) {
        // Bỏ qua lỗi nếu thư mục trống
    }
}, 1000 * 60 * 60); // Dọn dẹp mỗi 1 giờ