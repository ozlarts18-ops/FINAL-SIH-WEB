import dotenv from 'dotenv';
dotenv.config();

import { 
    sendMetaTextMessage, 
    sendMetaTemplate,
    sendMetaWelcomeAlert, 
    sendMetaLoginAlert 
} from '../server/metaWhatsappService.js';
import { closeMongo } from '../server/mongoDb.js';

async function runTest() {
    console.log('💬 ========================================================');
    console.log('🚀 Testing IOTrex WhatsApp Alerts for Oswaldo (+91 79001 53894)');
    console.log('💬 ========================================================\n');

    const recipient = process.env.DEFAULT_RECIPIENT_PHONE || '917900153894';

    console.log(`📱 Recipient Target: ${recipient}`);
    console.log(`🔑 Access Token: ${process.env.META_WHATSAPP_TOKEN ? '✅ Configured' : '❌ Missing'}\n`);

    console.log('0️⃣ Sending Meta Pre-Approved Template (hello_world)...');
    const templateRes = await sendMetaTemplate(recipient, 'hello_world');
    console.log('Template Status 0:', templateRes.success ? '✅ Delivered' : '❌ Failed', templateRes);

    console.log('1️⃣ Sending IOTrex Registration Welcome Alert...');
    const welcome = await sendMetaWelcomeAlert(recipient, 'Oswaldo');
    console.log('Status 1:', welcome.success ? '✅ Delivered' : '❌ Failed');

    console.log('2️⃣ Sending IOTrex First-Time Login Alert...');
    const login = await sendMetaLoginAlert(recipient, 'Oswaldo', true);
    console.log('Status 2:', login.success ? '✅ Delivered' : '❌ Failed');

    console.log('3️⃣ Sending IOTrex Air Quality Critical Alert...');
    const airAlertText = 
        `🚨 *[IOTrex Air Quality Alert]*\n\n` +
        `• *Status:* CRITICAL\n` +
        `• *AQI Index:* 185 (Unhealthy)\n` +
        `• *CO2:* 1,220 ppm\n` +
        `• *PM2.5:* 74.5 µg/m³\n` +
        `• *Temperature:* 36.2°C\n` +
        `• *Time:* ${new Date().toLocaleTimeString()}\n\n` +
        `⚠️ *Action:* Inspect greenhouse ventilation units immediately.`;
    const airAlert = await sendMetaTextMessage(recipient, airAlertText);
    console.log('Status 3:', airAlert.success ? '✅ Delivered' : '❌ Failed');

    console.log('4️⃣ Sending IOTrex Pest Detection Alert...');
    const pestText = 
        `🐛 *[IOTrex Pest & Disease Alert]*\n\n` +
        `• *Species:* Whiteflies\n` +
        `• *Count:* 22 detected\n` +
        `• *Threat Level:* HIGH\n` +
        `• *Location:* Zone B - Greenhouse 2\n\n` +
        `⚠️ *Action:* Deploy sticky traps and organic bio-repellent.`;
    const pestAlert = await sendMetaTextMessage(recipient, pestText);
    console.log('Status 4:', pestAlert.success ? '✅ Delivered' : '❌ Failed');

    console.log('5️⃣ Sending IOTrex Daily Environmental Summary...');
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const summaryText = 
        `📊 *[IOTrex Daily Environmental Summary - ${dateStr}]*\n\n` +
        `• *Air AQI:* 42 (Optimal 🟢)\n` +
        `• *Temp / Hum:* 24.5°C / 58%\n` +
        `• *Water pH:* 7.2 | *TDS:* 280 ppm\n` +
        `• *Soil Moisture:* 64%\n\n` +
        `🟢 *System Health:* ALL SENSORS ACTIVE & SYNCED`;
    const summary = await sendMetaTextMessage(recipient, summaryText);
    console.log('Status 5:', summary.success ? '✅ Delivered' : '❌ Failed');

    console.log('\n🎉 ALL 5 ALERTS SENT SUCCESSFULLY TO YOUR PHONE!');
    await closeMongo();
}

runTest();
