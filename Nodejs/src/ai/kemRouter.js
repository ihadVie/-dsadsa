const fs = require("fs");
const path = require("path");
const { chat, chatWithTools, image } = require("./openaiClient");
const { baseStyle } = require("./imageStyle");
const { createRateLimiter } = require("../utils/rateLimit");

const configPath = path.join(__dirname, "..", "..", "config", "kem.config.json");
const kemConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const reactionLimiter = createRateLimiter(kemConfig.reactionCooldownMs);
const KEM_WORKSPACE = "/workspace/kem";

const getSystemPrompt = () => {
  const promptPath = path.join(__dirname, "prompts", "kem_system.txt");
  return fs.readFileSync(promptPath, "utf-8");
};

const shouldRespond = ({ event, botId }) => {
  const body = String(event.body || "");
  const lower = body.toLowerCase();

  const startsWithKem = body.startsWith("kem") || body.startsWith("Kem");
  const containsTrigger = kemConfig.triggerPhrases.some((phrase) => lower.includes(phrase));
  const isReplyToKem = Boolean(event.messageReply && String(event.messageReply.senderID) === String(botId));
  const mentionsKem = Boolean(event.mentions && Object.keys(event.mentions).some((id) => String(id) === String(botId)));

  return startsWithKem || containsTrigger || isReplyToKem || mentionsKem;
};

const isAdmin = (senderID) => {
  const envIds = String(process.env.ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (envIds.includes(String(senderID))) return true;

  const config = global.config || {};
  const list = config.ADMINBOT || config.ADMIN || [];
  return Array.isArray(list) && list.map(String).includes(String(senderID));
};

const isImageRequest = (text) => {
  const normalized = String(text || "").toLowerCase();
  if (kemConfig.imageIgnorePhrases.some((phrase) => normalized.includes(phrase))) return false;
  return kemConfig.imageKeywords.some((keyword) => normalized.includes(keyword));
};

const detectImageReply = (event) => {
  const reply = event.messageReply;
  if (!reply || !Array.isArray(reply.attachments)) return null;
  const image = reply.attachments.find((att) => att.type === "photo" || att.type === "image");
  return image || null;
};

const detectTransformKeywords = (text) => {
  const normalized = String(text || "").toLowerCase();
  const keywords = ["vẽ lại", "chibi", "style", "biến thành"];
  return keywords.some((key) => normalized.includes(key));
};

const shouldReact = (text) => {
  const normalized = String(text || "").toLowerCase();
  const patterns = ["cảm ơn", "thanks", "dễ thương", "cute", "xinh", "iu", "yêu"];
  return patterns.some((p) => normalized.includes(p));
};

const pickReaction = () => {
  const list = kemConfig.reactionEmojis;
  return list[Math.floor(Math.random() * list.length)];
};

const buildMessages = (systemPrompt, text) => [
  { role: "system", content: systemPrompt },
  { role: "user", content: text }
];

const buildVisionMessages = (systemPrompt, text, imageUrl) => [
  { role: "system", content: systemPrompt },
  {
    role: "user",
    content: [
      { type: "text", text },
      { type: "image_url", image_url: { url: imageUrl } }
    ]
  }
];

const buildImagePrompt = (text, imageUrl) => {
  const base = text ? `Yêu cầu: ${text}` : "Hãy biến đổi ảnh theo phong cách dễ thương.";
  if (imageUrl) {
    return `${base}\nẢnh gốc: ${imageUrl}\n${baseStyle}`;
  }
  return `${base}\n${baseStyle}`;
};

const resolveWorkspacePath = (inputPath) => {
  const targetPath = path.resolve(KEM_WORKSPACE, inputPath || ".");
  if (!targetPath.startsWith(KEM_WORKSPACE)) {
    throw new Error("Path ngoài workspace cho phép.");
  }
  return targetPath;
};

const toolHandlers = (api, threadID) => ({
  readFile: async ({ path: target }) => {
    const resolved = resolveWorkspacePath(target);
    return fs.readFileSync(resolved, "utf-8");
  },
  writeFile: async ({ path: target, content }) => {
    const resolved = resolveWorkspacePath(target);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content ?? "", "utf-8");
    return "OK";
  },
  listDir: async ({ path: target }) => {
    const resolved = resolveWorkspacePath(target);
    return JSON.stringify(fs.readdirSync(resolved), null, 2);
  },
  runTests: async () => {
    const { execFile } = require("child_process");
    return await new Promise((resolve) => {
      execFile(
        "node",
        ["test/kem.test.js"],
        { cwd: KEM_WORKSPACE, timeout: 60_000 },
        (error, stdout, stderr) => {
          if (error) {
            resolve(`FAIL\n${stderr || error.message}`);
            return;
          }
          resolve(stdout || "OK");
        }
      );
    });
  },
  sendMessage: async ({ text }) => {
    if (!api || typeof api.sendMessage !== "function") return "sendMessage unavailable";
    await new Promise((resolve) => {
      api.sendMessage(String(text || ""), threadID, () => resolve());
    });
    return "SENT";
  }
});

const buildAgentTools = () => [
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Đọc file trong /workspace/kem",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "writeFile",
      description: "Ghi file trong /workspace/kem",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "listDir",
      description: "Liệt kê thư mục trong /workspace/kem",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "runTests",
      description: "Chạy test nội bộ",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "sendMessage",
      description: "Gửi message vào thread hiện tại",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"]
      }
    }
  }
];

const runAgentMode = async ({ api, event, text }) => {
  const task = text.replace(/^kem agent\s*/i, "").trim();
  const systemPrompt = [
    "Bạn là KEM — AI agent trong sandbox Node.js.",
    "Không hỏi lại. Thực hiện nhiệm vụ theo bước: PLAN -> ACT -> VERIFY -> REPORT.",
    "Chỉ dùng tools được cấp. Không truy cập .env. Không shell. Không network.",
    "Mọi file trong /workspace/kem."
  ].join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task || "Chưa có mô tả nhiệm vụ." }
  ];

  const handlers = toolHandlers(api, event.threadID);
  const tools = buildAgentTools();
  let replyText = "Kem chưa xử lý xong.";

  for (let step = 0; step < 6; step += 1) {
    const response = await chatWithTools({
      model: process.env.MODEL_ADMIN || "gpt-5.2",
      messages,
      tools
    });
    const message = response?.choices?.[0]?.message || {};
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const call of message.tool_calls) {
        const name = call.function?.name;
        const args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        let output = "Tool not implemented";
        try {
          output = await handlers[name](args);
        } catch (error) {
          output = `ERROR: ${error.message}`;
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: String(output)
        });
      }
      continue;
    }

    replyText = message.content || replyText;
    break;
  }

  return { type: "text", text: replyText };
};

const kemRouter = async ({ api, event, botId }) => {
  const body = typeof event?.body === "string" ? event.body : "";
  const attachments = Array.isArray(event?.attachments) ? event.attachments : [];
  const reply = event?.messageReply || null;
  const replyAttachments = Array.isArray(reply?.attachments) ? reply.attachments : [];
  const mentions = event?.mentions && typeof event.mentions === "object" ? event.mentions : {};

  if (!shouldRespond({ event: { ...event, body, mentions }, botId })) return null;

  const text = body.trim();
  const admin = isAdmin(event.senderID);
  const imageReply = detectImageReply({ messageReply: { ...reply, attachments: replyAttachments } });
  const wantsImage = isImageRequest(text);
  const wantsTransform = detectTransformKeywords(text);
  const wantsAgent = admin && /^kem agent\b/i.test(text);

  let typingTimer = null;
  if (api && typeof api.sendTyping === "function") {
    api.sendTyping(event.threadID, true);
    if (wantsImage || wantsTransform) {
      typingTimer = setTimeout(() => {
        api.sendTyping(event.threadID, false);
      }, 30_000);
    }
  }

  try {
    const systemPrompt = getSystemPrompt();
    const adminModel = process.env.MODEL_ADMIN || "gpt-5.2";
    const memberModel = process.env.MODEL_MEMBER || "gpt-4.1-nano";

    if (wantsAgent) {
      return await runAgentMode({ api, event, text });
    }

    if (imageReply && wantsTransform) {
      const prompt = buildImagePrompt(text, imageReply.url);
      const result = await image(prompt, kemConfig.imageSize);
      return { type: "image", url: result.url, b64_json: result.b64_json };
    }

    if (imageReply && !wantsTransform) {
      const visionText = await chat(
        memberModel,
        buildVisionMessages(systemPrompt, text || "Mô tả ảnh giúp mình nhé.", imageReply.url)
      );
      return { type: "text", text: visionText };
    }

    if (wantsImage) {
      const prompt = buildImagePrompt(text, null);
      const result = await image(prompt, kemConfig.imageSize);
      return { type: "image", url: result.url, b64_json: result.b64_json };
    }

    const model = admin ? adminModel : memberModel;
    const responseText = await chat(model, buildMessages(systemPrompt, text));

    if (shouldReact(text) && reactionLimiter(event.threadID) && api?.setMessageReaction) {
      api.setMessageReaction(pickReaction(), event.messageID, () => {}, true);
    }

    return { type: "text", text: responseText };
  } catch (error) {
    return { type: "text", text: "Kem lỗi nhẹ rồi, bạn thử lại nha 🥺" };
  } finally {
    if (typingTimer) clearTimeout(typingTimer);
    if (api && typeof api.sendTyping === "function") {
      api.sendTyping(event.threadID, false);
    }
  }
};

module.exports = {
  kemRouter,
  shouldRespond,
  isImageRequest,
  isAdmin
};
