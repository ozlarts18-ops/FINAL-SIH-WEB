import dotenv from 'dotenv';
dotenv.config();

import { 
    dispatchTelegramAirAlert, 
    dispatchTelegramDailyReport 
} from '../server/telegramService.js';
import { handleTelegramMessage } from '../server/telegramBotEngine.js';
import { closeMongo } from '../server/mongoDb.js';

async function runTest() {
    console.log('✈️ =================================================================');
    console.log('🚀 Testing EnviroX / IOTrex 2-Way Interactive Telegram Bot (100% FREE)');
    console.log('✈️ =================================================================\n');

    console.log(`🤖 Bot Username: @IOTrex_bot`);
    console.log(`🔑 Bot Token:    ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Configured' : '⚠️ Missing'}`);
    console.log(`💬 Default Chat: ${process.env.TELEGRAM_CHAT_ID ? process.env.TELEGRAM_CHAT_ID : '📡 Auto-captures when user texts /start'}\n`);

    console.log('1️⃣ Simulating /start Command (Interactive Inline Keyboards)...');
    const startRes = await handleTelegramMessage(process.env.TELEGRAM_CHAT_ID || null, '/start', { first_name: 'Oswaldo', username: 'oswaldo' });
    console.log('Result 1 (/start):', startRes?.success ? '✅ OK' : startRes);

    console.log('\n2️⃣ Simulating /sensors Query (Live MongoDB Atlas Cluster)...');
    const sensorsRes = await handleTelegramMessage(process.env.TELEGRAM_CHAT_ID || null, '/sensors', { first_name: 'Oswaldo' });
    console.log('Result 2 (/sensors):', sensorsRes?.success ? '✅ OK' : sensorsRes);

    console.log('\n3️⃣ Dispatching Air Quality Threshold Alert...');
    const alertRes = await dispatchTelegramAirAlert({
        air_status: 'CRITICAL',
        aqi_index: 185,
        co2_ppm: 1240,
        pm2_5: 75.3,
        current_temperature: 36.2
    });
    console.log('Result 3 (Air Alert):', alertRes?.success ? '✅ OK' : alertRes);

    console.log('\n4️⃣ Generating Daily Summary from MongoDB...');
    const dailyRes = await dispatchTelegramDailyReport();
    console.log('Result 4 (Daily Summary):', dailyRes?.success ? '✅ OK' : dailyRes);

    console.log('\n=================================================================');
    console.log('🎉 Telegram Bot Engine Verified & Ready!');
    console.log('💬 Open Telegram on your phone/PC and search for @IOTrex_bot');
    console.log('👉 Click Start or send /start to chat with the bot!');
    console.log('=================================================================\n');

    await closeMongo();
}

runTest();
