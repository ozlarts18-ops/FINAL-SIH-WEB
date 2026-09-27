import dotenv from 'dotenv';
dotenv.config();

import { sendWhatsApp, sendSms } from '../server/twilioService.js';

async function testTwilioWhatsApp() {
    console.log('📲 ========================================================');
    console.log('🚀 Testing Twilio WhatsApp & SMS Alert Dispatch');
    console.log('📲 ========================================================\n');

    const recipient = process.env.ALERT_RECIPIENT_PHONE || process.env.DEFAULT_RECIPIENT_PHONE || '917900153894';

    console.log(`📱 Target Phone: ${recipient}`);
    console.log(`🔑 Account SID: ${process.env.TWILIO_ACCOUNT_SID ? '✅ Configured (' + process.env.TWILIO_ACCOUNT_SID.substring(0, 8) + '...)' : '❌ Missing'}`);
    console.log(`🔑 Auth Token:  ${process.env.TWILIO_AUTH_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`📞 WhatsApp From: whatsapp:+14155238886\n`);

    const alertMessage = 
        `🚨 *[IOTrex System Alert]*\n\n` +
        `• *Type:* Pest & Bio-Security Threat\n` +
        `• *Details:* Optical AI vision scan detected active pest specimen in greenhouse canopy.\n` +
        `• *Target:* Oswaldo (+91 79001 53894)\n` +
        `• *Time:* ${new Date().toLocaleString()}\n\n` +
        `Please log in to your IOTrex dashboard for complete details.`;

    console.log('1️⃣ Testing Twilio SMS Dispatch...');
    try {
        const smsRes = await sendSms(recipient, '🚨 [IOTrex Alert] Pest Detected in greenhouse canopy! Check dashboard.');
        console.log('SMS Result:', JSON.stringify(smsRes, null, 2));
    } catch (e) {
        console.error('SMS Error:', e.message);
    }

    console.log('\n2️⃣ Testing Twilio WhatsApp Dispatch...');

    try {
        console.log('⏳ Dispatching Twilio WhatsApp message...');
        const res = await sendWhatsApp(recipient, alertMessage);
        console.log('\n📊 Dispatch Result:');
        console.log(JSON.stringify(res, null, 2));

        if (res.success && !res.simulated) {
            console.log('\n✅ TWILIO WHATSAPP DISPATCH SUCCESSFUL! Check your WhatsApp.');
        } else if (res.simulated) {
            console.log('\n⚠️ Dispatch was simulated (check SID/Auth Token in .env).');
        } else {
            console.log('\n❌ Twilio API returned error:', res.error || res);
        }
    } catch (err) {
        console.error('\n❌ Twilio Exception:', err.message);
    }
}

testTwilioWhatsApp();
