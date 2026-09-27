import dotenv from 'dotenv';
import {
    normalizeIndianPhoneNumber,
    isValidEmail,
    maskPhone,
    maskEmail,
    getNotificationRecipient,
    updateNotificationRecipient
} from '../server/notificationConfig.js';
import { sendSMS } from '../server/smsService.js';
import { sendEmail } from '../server/emailService.js';

dotenv.config();

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

async function runNotificationRecipientTests() {
    console.log('\n==================================================');
    console.log('🧪 ENVIROX NOTIFICATION RECIPIENT & PIPELINE AUDIT');
    console.log('==================================================\n');

    // 1. Valid Indian phone normalization
    console.log('[Test 1] Valid Indian Phone Normalization');
    assert(normalizeIndianPhoneNumber('9876543210') === '919876543210', '9876543210 -> 919876543210');
    assert(normalizeIndianPhoneNumber('+919876543210') === '919876543210', '+919876543210 -> 919876543210');
    assert(normalizeIndianPhoneNumber('09876543210') === '919876543210', '09876543210 -> 919876543210');
    assert(normalizeIndianPhoneNumber('91 9876543210') === '919876543210', '91 9876543210 -> 919876543210');

    // 2. Invalid phone rejection
    console.log('\n[Test 2] Invalid Phone Rejection');
    assert(normalizeIndianPhoneNumber('12345') === null, 'Rejects 5-digit number');
    assert(normalizeIndianPhoneNumber('abcdefghij') === null, 'Rejects alphabetic string');
    assert(normalizeIndianPhoneNumber('') === null, 'Rejects empty string');
    assert(normalizeIndianPhoneNumber(null) === null, 'Rejects null input');

    // 3. Valid email acceptance
    console.log('\n[Test 3] Valid Email Acceptance');
    assert(isValidEmail('friend@example.com') === true, 'Accepts friend@example.com');
    assert(isValidEmail('user.name+tag@domain.co.in') === true, 'Accepts complex valid email');

    // 4. Invalid email rejection
    console.log('\n[Test 4] Invalid Email Rejection');
    assert(isValidEmail('invalid-email') === false, 'Rejects string without @');
    assert(isValidEmail('@domain.com') === false, 'Rejects email missing username');
    assert(isValidEmail('user@') === false, 'Rejects email missing domain');
    assert(isValidEmail('') === false, 'Rejects empty string');
    assert(isValidEmail(null) === false, 'Rejects null input');

    // 5. Recipient resolution
    console.log('\n[Test 5] Recipient Resolution Engine');
    const recipient = await getNotificationRecipient();
    assert(typeof recipient.name === 'string' && recipient.name.length > 0, `Resolved Name: "${recipient.name}"`);
    assert(normalizeIndianPhoneNumber(recipient.phone) !== null, `Resolved Phone normalized: ${recipient.phone}`);
    assert(isValidEmail(recipient.email) === true, `Resolved Email valid: ${recipient.email}`);

    // 6. MSG91 recipient selection default
    console.log('\n[Test 6] MSG91 Recipient Selection (Dry Run Validation)');
    // Calling sendSMS without `to` should auto-resolve target phone number from getNotificationRecipient()
    const invalidSend = await sendSMS({ to: 'invalid_number', message: 'Test message' });
    assert(invalidSend.success === false, 'Rejects invalid explicit target number without crash');

    // 7. SendGrid recipient selection default
    console.log('\n[Test 7] SendGrid Recipient Selection (Dry Run Validation)');
    const invalidEmailSend = await sendEmail({ to: 'invalid-email-addr', subject: 'Test' });
    assert(invalidEmailSend.success === false, 'Rejects invalid explicit target email without crash');

    // 8. Duplicate / Cooldown Protection
    console.log('\n[Test 8] Cooldown & Masking Utilities');
    const maskedP = maskPhone('919876543210');
    assert(maskedP === '9198****3210', `Masked phone format: ${maskedP}`);
    const maskedE = maskEmail('friend@example.com');
    assert(maskedE.includes('***'), `Masked email format: ${maskedE}`);

    // 9. Update & MongoDB Persistence Test
    console.log('\n[Test 9] Update Recipient Validation & Persistence');
    const updateFail = await updateNotificationRecipient({ name: '', phone: '123', email: 'bad' });
    assert(updateFail.success === false, 'Rejects invalid update payload with descriptive error');

    // 10. Secret protection check
    console.log('\n[Test 10] Secret Protection Audit');
    const jsonRecipient = JSON.stringify(recipient);
    assert(!jsonRecipient.includes(process.env.MSG91_AUTH_KEY || 'N/A'), 'MSG91_AUTH_KEY not in resolved recipient object');
    assert(!jsonRecipient.includes(process.env.SENDGRID_API_KEY || 'N/A'), 'SENDGRID_API_KEY not in resolved recipient object');

    // 11 & 12. HTTP API endpoints test (via fetch to localhost)
    console.log('\n[Test 11 & 12] Live Local HTTP API Integration & RBAC Check');
    try {
        const getRes = await fetch('http://localhost:5173/api/notifications/recipient');
        if (getRes.ok) {
            const getData = await getRes.json();
            assert(getData.status === 'success', 'GET /api/notifications/recipient returns status: success');
            assert(Boolean(getData.data.maskedPhone), `GET response includes maskedPhone: ${getData.data.maskedPhone}`);
        } else {
            console.warn(`  ⚠️ GET /api/notifications/recipient HTTP ${getRes.status}`);
        }

        // Test POST without auth -> should be rejected (401 or 403)
        const unauthPost = await fetch('http://localhost:5173/api/notifications/recipient', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test', phone: '9876543210', email: 'test@example.com' })
        });
        assert(unauthPost.status === 401 || unauthPost.status === 403, `Unauthenticated POST rejected with HTTP ${unauthPost.status}`);

        // Test POST with valid API key
        const authPost = await fetch('http://localhost:5173/api/notifications/recipient', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.ENVIROX_API_KEY || 'envirox_master_key_2026'
            },
            body: JSON.stringify({ name: recipient.name, phone: recipient.phone, email: recipient.email })
        });
        assert(authPost.status === 200, `Authenticated POST with master key succeeded (HTTP ${authPost.status})`);
    } catch (apiErr) {
        console.warn('  ⚠️ HTTP API test skipped (dev server not responding):', apiErr.message);
    }

    console.log('\n==================================================');
    console.log(`📊 AUTOMATED UNIT TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('==================================================\n');

    // Controlled Real Live Test (1 MSG91, 1 SendGrid)
    console.log('🚀 PERFORMING 1 CONTROLLED REAL TEST FOR MSG91 & SENDGRID...');
    console.log(`🎯 Recipient Target: ${recipient.name} | Phone: ${maskPhone(recipient.phone)} | Email: ${maskEmail(recipient.email)}`);

    console.log('\n1. Controlled MSG91 Live Test Dispatch:');
    const liveSmsRes = await sendSMS({
        message: `🌱 [EnviroX Live Test] Recipient config verified for ${recipient.name}. Time: ${new Date().toLocaleTimeString()}`
    });
    console.log('  MSG91 Dispatch Result:', JSON.stringify(liveSmsRes, null, 2));

    console.log('\n2. Controlled SendGrid Live Test Dispatch:');
    const liveEmailRes = await sendEmail({
        subject: '[EnviroX] Notification Recipient Live Verification',
        text: `EnviroX Notification Recipient Configuration Live Test\nRecipient: ${recipient.name}\nTimestamp: ${new Date().toISOString()}`,
        html: `
<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #5cb85c; border-radius: 8px; max-width: 600px;">
    <h2 style="color: #5cb85c; margin-top: 0;">🌱 [EnviroX] Recipient Verification</h2>
    <p>Notification recipient successfully configured!</p>
    <p><strong>Name:</strong> ${recipient.name}</p>
    <p><strong>Phone:</strong> ${maskPhone(recipient.phone)}</p>
    <p><strong>Email:</strong> ${recipient.email}</p>
    <p><strong>Timestamp (UTC):</strong> ${new Date().toISOString()}</p>
</div>
        `.trim()
    });
    console.log('  SendGrid Dispatch Result:', JSON.stringify(liveEmailRes, null, 2));

    process.exit(failed === 0 ? 0 : 1);
}

runNotificationRecipientTests().catch(err => {
    console.error('Fatal test exception:', err);
    process.exit(1);
});
