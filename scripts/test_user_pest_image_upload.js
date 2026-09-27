import dotenv from 'dotenv';
import http from 'http';
dotenv.config();

import { evaluateAndNotifyMeta } from '../server/metaWhatsappService.js';
import { closeMongo } from '../server/mongoDb.js';

async function testMealybugUploadAlert() {
    console.log('🐛 ========================================================');
    console.log('🚀 Simulating User Mealybug / Whitefly Image Upload Alert');
    console.log('🐛 ========================================================\n');

    const pestAlertPayload = {
        alert_type: 'PEST_DETECTED',
        title: 'PEST DETECTED ALERT: MEALYBUG / WHITEFLY INFESTATION',
        message: 'Manual verification photo upload detected 3 x Mealybug / Whitefly (Pseudococcidae) specimens on leaf stem with 96.8% confidence. Recommended Action: Apply horticultural soap spray or deploy predatory ladybugs.',
        severity: 'HIGH',
        module_name: 'Pest Detection',
        status: 'ACTIVE',
        is_read: false,
        created_at: new Date().toISOString()
    };

    console.log('📡 1. Dispatching Meta WhatsApp Notification...');
    const metaRes = await evaluateAndNotifyMeta('alerts', pestAlertPayload);
    console.log('Meta WhatsApp Response:', metaRes);

    console.log('\n📧 2. Dispatching Email Notification to Gmail (oswaldogracias456@gmail.com)...');
    try {
        const { sendEmail } = await import('../server/emailService.js');
        const emailRes = await sendEmail({
            to: 'oswaldogracias456@gmail.com',
            subject: `[IOTrex HIGH Alert] PEST DETECTED: MEALYBUG / WHITEFLY INFESTATION`,
            text: `IOTrex Pest Alert\n\n${pestAlertPayload.message}\nTime: ${new Date().toLocaleString()}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px;">
                    <h2 style="color: #b91c1c; margin-top: 0;">🚨 PEST DETECTED ALERT: MEALYBUG / WHITEFLY</h2>
                    <p><strong>Severity:</strong> <span style="color: #ef4444; font-weight: bold;">HIGH</span></p>
                    <p><strong>Details:</strong> ${pestAlertPayload.message}</p>
                    <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                </div>
            `
        });
        console.log('Email Status:', emailRes.success ? '✅ Delivered to oswaldogracias456@gmail.com' : '❌ Failed: ' + emailRes.error);
    } catch (e) {
        console.error('Email Exception:', e.message);
    }

    await closeMongo();
}

testMealybugUploadAlert();
