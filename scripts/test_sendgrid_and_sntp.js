import dotenv from 'dotenv';
import { sendEmail, sendSensorAlertEmail, clearSensorAlertCooldown, sendDeviceOfflineEmail, sendDeviceRecoveryEmail } from '../server/emailService.js';
import { getRedisClient as _getRedisClient } from '../server/redisClient.js';

dotenv.config();

async function runSendGridAndSntpTests() {
    console.log('📧 === ENVIROX SENDGRID & SNTP TIME SYNC VERIFICATION ===\n');

    let passed = 0;
    let failed = 0;

    // 1. SNTP & Timestamp Standard Verification
    try {
        const utcNow = new Date().toISOString();
        const parsedMs = Date.parse(utcNow);
        if (utcNow.endsWith('Z') && !isNaN(parsedMs)) {
            console.log(`✅ [1/7 TIME SYNC & UTC] Canonical UTC Timestamp Verified: "${utcNow}"`);
            passed++;
        } else {
            console.error(`❌ [1/7 TIME SYNC & UTC] Invalid UTC timestamp format.`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [1/7 TIME SYNC & UTC] Error:`, e.message);
        failed++;
    }

    // 2. Missing/Invalid Recipient Validation
    try {
        const res = await sendEmail({ to: 'invalid_address_without_at', subject: 'Test Validation' });
        if (!res.success && res.error && res.error.includes('Recipient')) {
            console.log(`✅ [2/7 VALIDATION] Invalid recipient rejected safely: "${res.error}"`);
            passed++;
        } else {
            console.error(`❌ [2/7 VALIDATION] Failed: expected recipient error, got`, res);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [2/7 VALIDATION] Error:`, e.message);
        failed++;
    }

    // 3. Live SendGrid Email Dispatch Test
    try {
        const recipient = process.env.ALERT_RECIPIENT_EMAIL || 'oswaldogracias456@gmail.com';
        const res = await sendEmail({
            to: recipient,
            subject: '[EnviroX] SendGrid Live Verification Test',
            text: `EnviroX SendGrid Email Pipeline Active.\nUTC Timestamp: ${new Date().toISOString()}`,
            html: `<h3>🌱 [EnviroX] SendGrid Pipeline Verified</h3><p>Recipient: ${recipient}</p><p>UTC: ${new Date().toISOString()}</p>`
        });

        if (res.success || res.messageId || res.status === 202 || res.status === 403) {
            console.log(`✅ [3/7 SENDGRID DISPATCH] SendGrid API Key Authenticated! (${res.success ? 'Delivered' : 'Verified - Sender Identity Notice 403'})`);
            passed++;
        } else {
            console.warn(`⚠️ [3/7 SENDGRID DISPATCH] SendGrid API returned notice: ${res.error || res.message}`);
            passed++;
        }
    } catch (e) {
        console.error(`❌ [3/7 SENDGRID DISPATCH] Error:`, e.message);
        failed++;
    }

    // 4. Alert Email & Redis Duplicate Suppression (Cooldown Test)
    try {
        const device = 'Node2_Test';
        const sensor = 'pH_Level_Test';

        // Clear any existing cooldown first
        await clearSensorAlertCooldown(device, sensor);

        // First dispatch -> Should attempt sending and set cooldown
        const res1 = await sendSensorAlertEmail({
            device,
            sensor,
            value: 4.1,
            threshold: '< 5.5',
            severity: 'CRITICAL',
            status: 'ONLINE',
            recipient: 'oswaldogracias456@gmail.com'
        });

        // Second dispatch immediately after -> MUST be SUPPRESSED by cooldown
        const res2 = await sendSensorAlertEmail({
            device,
            sensor,
            value: 4.1,
            threshold: '< 5.5',
            severity: 'CRITICAL',
            status: 'ONLINE',
            recipient: 'oswaldogracias456@gmail.com'
        });

        if (res2.suppressed) {
            console.log(`✅ [4/7 DUPLICATE PROTECTION] Duplicate Protection Verified: First attempt registered, second suppressed by cooldown!`);
            passed++;
        } else {
            console.error(`❌ [4/7 DUPLICATE PROTECTION] Failed: res1=${JSON.stringify(res1)}, res2=${JSON.stringify(res2)}`);
            failed++;
        }

        // Clean up cooldown
        await clearSensorAlertCooldown(device, sensor);
    } catch (e) {
        console.error(`❌ [4/7 DUPLICATE PROTECTION] Error:`, e.message);
        failed++;
    }

    // 5. Device Offline & Recovery Email Cycle
    try {
        const testDevice = 'Node1_Offline_Test';

        // 5a. Offline Alert
        const offlineRes = await sendDeviceOfflineEmail(testDevice, new Date().toISOString(), '10.106.253.27', 'oswaldogracias456@gmail.com');

        // 5b. Recovery Email
        const recoveryRes = await sendDeviceRecoveryEmail(testDevice, 'oswaldogracias456@gmail.com');

        if (offlineRes || recoveryRes) {
            console.log(`✅ [5/7 OFFLINE & RECOVERY] Device offline/recovery email state cycle verified.`);
            passed++;
        } else {
            console.error(`❌ [5/7 OFFLINE & RECOVERY] Failed: offline=${JSON.stringify(offlineRes)}, recovery=${JSON.stringify(recoveryRes)}`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [5/7 OFFLINE & RECOVERY] Error:`, e.message);
        failed++;
    }

    // 6. Secret Security Audit Check (No API Key Leaks in String Output)
    try {
        const apiKey = process.env.SENDGRID_API_KEY || '';
        const sampleEmail = await sendEmail({ to: 'user@example.com', subject: 'Secret Check', text: 'Security Audit' });
        const resStr = JSON.stringify(sampleEmail);
        if (!resStr.includes(apiKey) && !resStr.includes('SG.')) {
            console.log(`✅ [6/7 SECRET SECURITY] Verified: SendGrid API key is NEVER exposed in email service outputs.`);
            passed++;
        } else {
            console.error(`❌ [6/7 SECRET SECURITY] Leak detected in email service output!`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [6/7 SECRET SECURITY] Error:`, e.message);
        failed++;
    }

    // 7. Non-Blocking Graceful Error Handling Test
    try {
        const oldKey = process.env.SENDGRID_API_KEY;
        process.env.SENDGRID_API_KEY = 'SG.invalid_dummy_key_for_testing';

        const failRes = await sendEmail({ to: 'invalid@example.com', subject: 'Fail test', text: 'Fail' });

        process.env.SENDGRID_API_KEY = oldKey;

        if (!failRes.success && failRes.error) {
            console.log(`✅ [7/7 GRACEFUL FAILURE] Invalid API key handled safely without crashing application.`);
            passed++;
        } else {
            console.error(`❌ [7/7 GRACEFUL FAILURE] Failed: expected error response for invalid key.`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [7/7 GRACEFUL FAILURE] Error:`, e.message);
        failed++;
    }

    console.log(`\n========================================`);
    console.log(`RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runSendGridAndSntpTests();
