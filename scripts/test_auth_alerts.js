import dotenv from 'dotenv';
dotenv.config();

import { sendMetaLoginAlert, sendMetaWelcomeAlert } from '../server/metaWhatsappService.js';
import { sendEmail } from '../server/emailService.js';
import { closeMongo } from '../server/mongoDb.js';

async function testAuthAlerts() {
    console.log('🔒 ========================================================');
    console.log('🚀 Testing User Login & Registration Alerts for Gmail & WhatsApp');
    console.log('🔒 ========================================================\n');

    const recipientPhone = process.env.ALERT_RECIPIENT_PHONE || '917900153894';
    const recipientEmail = 'oswaldogracias456@gmail.com';

    console.log('1️⃣ Testing Registration WhatsApp & Gmail Alert...');
    const waReg = await sendMetaWelcomeAlert(recipientPhone, 'Oswaldo Gracias');
    console.log('WhatsApp Reg:', waReg.success ? '✅ Delivered' : '❌ Failed');

    const emailReg = await sendEmail({
        to: recipientEmail,
        subject: `[IOTrex Security] New User Sign Up: Oswaldo Gracias`,
        text: `New User Registration Alert\n\nName: Oswaldo Gracias\nEmail: ${recipientEmail}\nTime: ${new Date().toLocaleString()}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f8f1; border: 2px solid #65b32e; border-radius: 8px;">
                <h2 style="color: #1b5e20; margin-top: 0;">🌱 New User Registration Alert</h2>
                <p><strong>Name:</strong> Oswaldo Gracias</p>
                <p><strong>Email:</strong> ${recipientEmail}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            </div>
        `
    });
    console.log('Gmail Reg:', emailReg.success ? '✅ Delivered to ' + recipientEmail : '❌ Failed: ' + emailReg.error);

    console.log('\n2️⃣ Testing Login Security WhatsApp & Gmail Alert...');
    const waLogin = await sendMetaLoginAlert(recipientPhone, 'Oswaldo Gracias', false);
    console.log('WhatsApp Login:', waLogin.success ? '✅ Delivered' : '❌ Failed');

    const emailLogin = await sendEmail({
        to: recipientEmail,
        subject: `[IOTrex Security Alert] User Login: Oswaldo Gracias`,
        text: `Security Login Notification\n\nUser: Oswaldo Gracias\nEmail: ${recipientEmail}\nTime: ${new Date().toLocaleString()}\nStatus: Session Authenticated`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f0fdf4; border: 2px solid #3b82f6; border-radius: 8px;">
                <h2 style="color: #1e40af; margin-top: 0;">🔒 Security Login Notification</h2>
                <p><strong>User:</strong> Oswaldo Gracias</p>
                <p><strong>Email:</strong> ${recipientEmail}</p>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Status:</strong> <span style="color: #16a34a; font-weight: bold;">Authenticated</span></p>
            </div>
        `
    });
    console.log('Gmail Login:', emailLogin.success ? '✅ Delivered to ' + recipientEmail : '❌ Failed: ' + emailLogin.error);

    await closeMongo();
}

testAuthAlerts();
