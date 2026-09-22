import dotenv from 'dotenv';
dotenv.config();

import { handleUserMessage } from '../server/whatsappBotEngine.js';
import { closeMongo } from '../server/mongoDb.js';

async function runInteractiveSimulation() {
    console.log('🤖 ========================================================');
    console.log('🚀 Testing IOTrex Interactive WhatsApp 2-Way Bot');
    console.log('🤖 ========================================================\n');

    const userPhone = process.env.DEFAULT_RECIPIENT_PHONE || '917900153894';

    console.log('💬 [User sends]: "help"');
    const res1 = await handleUserMessage(userPhone, 'help');
    console.log('Bot Status 1 (Help Menu):', res1.success ? '✅ Delivered' : '❌ Failed');

    console.log('\n💬 [User sends]: "sensors"');
    const res2 = await handleUserMessage(userPhone, 'sensors');
    console.log('Bot Status 2 (Live Sensors):', res2.success ? '✅ Delivered' : '❌ Failed');

    console.log('\n💬 [User sends]: "reports"');
    const res3 = await handleUserMessage(userPhone, 'reports');
    console.log('Bot Status 3 (Reports Menu):', res3.success ? '✅ Delivered' : '❌ Failed');

    console.log('\n💬 [User sends]: "daily"');
    const res4 = await handleUserMessage(userPhone, 'daily');
    console.log('Bot Status 4 (Daily Summary):', res4.success ? '✅ Delivered' : '❌ Failed');

    console.log('\n🎉 Interactive Bot Simulation Completed! Check your WhatsApp.');
    await closeMongo();
}

runInteractiveSimulation();
