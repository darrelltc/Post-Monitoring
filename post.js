const DETECT_USER_URL = "https://i.eastmoney.com/2246087317241028#"; // 要监控的用户链接
const DETECT_START_TIME = "08:00"; // 检测开始时间，格式为 HH:mm
const DETECT_END_TIME = "20:00";   // 检测结束时间，格式为 HH:mm
const DETECT_TIMEZONE = "UTC+8";   // 设置时区，支持 UTC 或 UTC+X 格式
const KV_KEY_HISTORY = "latest_post_time"; // KV 存储的键名，用于保存最新帖子的时间戳
const TG_BOT_TOKEN = "your-telegram-bot-token"; // Telegram 机器人 Token
const TG_CHAT_ID = "your-telegram-chat-id"; // Telegram 目标聊天 ID
const PUSH_NEW_POST = true; // 是否推送新帖到 Telegram

// 获取时区偏移（单位：分钟）
function getTimezoneOffset(timezone) {
    if (timezone === "UTC") return 0;
    const match = timezone.match(/UTC([+-]\d+)/);
    if (!match) throw new Error("Invalid DETECT_TIMEZONE format. Use UTC or UTC+X.");
    return parseInt(match[1]) * 60;
}

// 检查当前时间是否在检测时间段内
function isWithinTimePeriod(start, end, timezone) {
    const now = new Date();
    const offsetMinutes = getTimezoneOffset(timezone);
    const localNow = new Date(now.getTime() + offsetMinutes * 60 * 1000);

    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);

    const startTime = new Date(localNow);
    startTime.setHours(startHour, startMinute, 0, 0);

    const endTime = new Date(localNow);
    endTime.setHours(endHour, endMinute, 0, 0);

    return localNow >= startTime && localNow <= endTime;
}

// 发送 Telegram 消息
async function sendTelegramMessage(token, chatId, message) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = {
        chat_id: chatId,
        text: message,
    };
    await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

// 检测用户页面的最新帖子
async function checkForNewPosts() {
    // 检测时间段判断
    if (!isWithinTimePeriod(DETECT_START_TIME, DETECT_END_TIME, DETECT_TIMEZONE)) {
        console.log("当前时间不在检测时间段内，跳过检测。");
        return;
    }

    const response = await fetch(`${DETECT_USER_URL}`);
    const pageText = await response.text();

    // 使用正则解析最新帖子时间（假设页面结构符合此解析）
    const match = pageText.match(/"post_publish_time":"(.*?)"/);
    if (!match) {
        console.error("未找到最新帖子时间，可能页面结构已更改。");
        return;
    }

    const latestPostTime = new Date(match[1]).getTime();
    const storedPostTime = parseInt(await POSTS_KV.get(KV_KEY_HISTORY) || "0", 10);

    if (latestPostTime > storedPostTime) {
        console.log("发现新帖子，开始下载页面并推送。");

        // 保存最新帖子时间到 KV
        await POSTS_KV.put(KV_KEY_HISTORY, String(latestPostTime));

        // 保存帖子页面
        await POSTS_KV.put(`post_${latestPostTime}`, pageText);

        // 推送到 Telegram
        if (PUSH_NEW_POST) {
            await sendTelegramMessage(TG_BOT_TOKEN, TG_CHAT_ID, `发现新帖子，时间：${match[1]}。\n页面地址：${DETECT_USER_URL}`);
        }
    } else {
        console.log("没有新帖子更新。");
    }
}

// 主处理函数
addEventListener("scheduled", (event) => {
    event.waitUntil(checkForNewPosts());
});

addEventListener("fetch", (event) => {
    event.respondWith(
        new Response("东财用户发帖监控服务运行中", {
            headers: { "Content-Type": "text/plain" },
        })
    );
});
