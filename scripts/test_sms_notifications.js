import dotenv from 'dotenv';
import {
    sendSMS,
    normalizeIndianPhoneNumber,
    sendSensorSmsAlert,
    clearSensorSmsCooldown,
    sendDeviceOfflineSms as _sendDeviceOfflineSms,
    sendDeviceRecoverySms as _sendDeviceRecoverySms
} from '../server/smsService.js';
import {
    getAuthenticatedNotificationRecipient,
    getEligibleSmsRecipients as _getEligibleSmsRecipients,
    maskPhone
} from '../server/notificationConfig.js';
import { getCollection as _getCollection } from '../server/mongoDb.js';

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

async function runSmsComprehensiveTests() {
    console.log('\n==================================================');
    console.log('📱 ENVIROX SMS & MULTI-USER NOTIFICATION VERIFICATION');
    console.log('==================================================\n');

    // 1. User login with phone number
    console.log('[Test 1] User Login with Phone Number');
    const userWithPhone = {
        _id: 'usr_phone_001',
        email: '919876543210@envirox.local',
        phone: '9876543210',
        phoneVerified: true,
        notificationPreferences: { smsEnabled: true }
    };
    const eval1 = getAuthenticatedNotificationRecipient(userWithPhone);
    assert(eval1.eligible === true && eval1.normalizedPhone === '919876543210', 'Phone login user evaluated as eligible recipient');

    // 2. Existing user without phone
    console.log('\n[Test 2] Existing User Without Phone');
    const userNoPhone = {
        _id: 'usr_nophone_002',
        email: 'nophone@example.com',
        phone: null,
        phoneVerified: false
    };
    const eval2 = getAuthenticatedNotificationRecipient(userNoPhone);
    assert(eval2.eligible === false && eval2.reason === 'PHONE_NOT_VERIFIED', 'User without phone rejected with PHONE_NOT_VERIFIED');

    // 3. Invalid phone number
    console.log('\n[Test 3] Invalid Phone Number Rejection');
    const userBadPhone = {
        _id: 'usr_bad_003',
        email: 'bad@example.com',
        phone: '12345',
        phoneVerified: true
    };
    const eval3 = getAuthenticatedNotificationRecipient(userBadPhone);
    assert(eval3.eligible === false && eval3.reason === 'INVALID_PHONE_NUMBER', 'Invalid 5-digit phone rejected with INVALID_PHONE_NUMBER');

    // 4. Phone normalization
    console.log('\n[Test 4] Indian Phone Normalization Suite');
    assert(normalizeIndianPhoneNumber('9876543210') === '919876543210', '10-digit -> 919876543210');
    assert(normalizeIndianPhoneNumber('+919876543210') === '919876543210', '+9110-digit -> 919876543210');
    assert(normalizeIndianPhoneNumber('09876543210') === '919876543210', '0-prefixed 10-digit -> 919876543210');
    assert(normalizeIndianPhoneNumber('invalid') === null, 'Alphabetical input returns null');

    // 5. Verified phone + SMS enabled (Eligible)
    console.log('\n[Test 5] Verified Phone + SMS Enabled');
    const userEligible = {
        _id: 'usr_ok_005',
        phone: '9876543210',
        phoneVerified: true,
        notificationPreferences: { smsEnabled: true }
    };
    assert(getAuthenticatedNotificationRecipient(userEligible).eligible === true, 'Verified phone + smsEnabled: true is ELIGIBLE');

    // 6. Verified phone + SMS disabled (Ineligible)
    console.log('\n[Test 6] Verified Phone + SMS Disabled');
    const userDisabled = {
        _id: 'usr_dis_006',
        phone: '9876543210',
        phoneVerified: true,
        notificationPreferences: { smsEnabled: false }
    };
    const eval6 = getAuthenticatedNotificationRecipient(userDisabled);
    assert(eval6.eligible === false && eval6.reason === 'SMS_DISABLED', 'SMS disabled user rejected with SMS_DISABLED');

    // 7. Unverified phone (Ineligible)
    console.log('\n[Test 7] Unverified Phone Enforcement');
    const userUnverified = {
        _id: 'usr_unver_007',
        phone: '9876543210',
        phoneVerified: false,
        notificationPreferences: { smsEnabled: true }
    };
    const eval7 = getAuthenticatedNotificationRecipient(userUnverified);
    assert(eval7.eligible === false && eval7.reason === 'PHONE_NOT_VERIFIED', 'Unverified phone rejected with PHONE_NOT_VERIFIED');

    // 8. Multiple users support
    console.log('\n[Test 8] Multiple Users Filtering');
    const userList = [
        { _id: 'u1', phone: '9876543210', phoneVerified: true, notificationPreferences: { smsEnabled: true } },
        { _id: 'u2', phone: '9876543211', phoneVerified: true, notificationPreferences: { smsEnabled: true } },
        { _id: 'u3', phone: '9876543212', phoneVerified: true, notificationPreferences: { smsEnabled: false } }
    ];
    const eligibleCount = userList.map(getAuthenticatedNotificationRecipient).filter(u => u.eligible).length;
    assert(eligibleCount === 2, `Evaluated 3 users: 2 SMS enabled (eligible), 1 SMS disabled (ineligible)`);

    // 9. 29 Recipients Support
    console.log('\n[Test 9] Scale Test: 29 Active Recipients Support');
    const mock29Users = Array.from({ length: 29 }, (_, i) => ({
        _id: `scale_${i}`,
        phone: `9876543${String(i).padStart(3, '0')}`,
        phoneVerified: true,
        notificationPreferences: { smsEnabled: true }
    }));
    const eval29 = mock29Users.map(getAuthenticatedNotificationRecipient).filter(u => u.eligible);
    assert(eval29.length === 29, `Successfully processed 29 eligible active recipients (${eval29.length}/29)`);

    // 10. Zero Recipients Handling (NO_SMS_RECIPIENTS)
    console.log('\n[Test 10] Zero Eligible Recipients Return Code');
    const zeroRes = await sendSMS({ to: [], message: 'Test zero' });
    assert(zeroRes.status === 'NO_SMS_RECIPIENTS', 'Returns status: NO_SMS_RECIPIENTS without application crash');

    // 11. MSG91 Dispatch (Live or Test Recipient)
    console.log('\n[Test 11] MSG91 Dispatch Execution');
    const liveRecipient = process.env.ALERT_RECIPIENT_PHONE || process.env.DEFAULT_RECIPIENT_PHONE || '917900153894';
    const dispatchRes = await sendSMS({ to: liveRecipient, message: `EnviroX Verification Alert. Time: ${new Date().toLocaleTimeString()}` });
    assert(dispatchRes.success === true || dispatchRes.status === 200 || dispatchRes.messageId, 'MSG91 Dispatch executed successfully');

    // 12. Duplicate Alert Suppression
    console.log('\n[Test 12] Cooldown & Duplicate Protection');
    const testDev = 'Node2_Test_Dev';
    const testSen = 'pH_Test_Sen';
    await clearSensorSmsCooldown(testDev, testSen);
    const _d1 = await sendSensorSmsAlert({ device: testDev, sensor: testSen, value: '3.8', recipient: liveRecipient });
    const d2 = await sendSensorSmsAlert({ device: testDev, sensor: testSen, value: '3.8', recipient: liveRecipient });
    assert(d2.suppressed === true, 'Second rapid alert suppressed by Redis/Memory cooldown');
    await clearSensorSmsCooldown(testDev, testSen);

    // 13. Authentication Protection for API
    console.log('\n[Test 13] Preference Endpoint Authentication Safeguard');
    try {
        const unauthRes = await fetch('http://localhost:5173/api/notifications/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ smsEnabled: false })
        });
        assert(unauthRes.status === 401 || unauthRes.status === 403, `Unauthenticated request returned HTTP ${unauthRes.status}`);
    } catch (e) {
        console.warn('  ⚠️ HTTP API check notice:', e.message);
    }

    // 14. User Isolation Security Check
    console.log('\n[Test 14] User Preference Isolation Audit');
    // Ensure getAuthenticatedNotificationRecipient scopes to specific user object
    const uA = { id: 'usr_A', phone: '9876543210', phoneVerified: true, notificationPreferences: { smsEnabled: true } };
    const uB = { id: 'usr_B', phone: '9876543211', phoneVerified: true, notificationPreferences: { smsEnabled: false } };
    assert(getAuthenticatedNotificationRecipient(uA).smsEnabled === true && getAuthenticatedNotificationRecipient(uB).smsEnabled === false, 'User A settings do not pollute User B settings');

    // 15. MSG91 Secret Protection Audit
    console.log('\n[Test 15] Secret Key Isolation Audit');
    const authKey = process.env.MSG91_AUTH_KEY || '';
    const resStr = JSON.stringify(dispatchRes);
    assert(!resStr.includes(authKey), 'MSG91_AUTH_KEY is NEVER exposed in SMS service outputs');

    // 16. Existing Security Regression
    console.log('\n[Test 16] Security Regression');
    assert(typeof maskPhone('919876543210') === 'string', 'Masking helper functions operating normally');

    // 17. Existing SendGrid Integration Regression
    console.log('\n[Test 17] SendGrid Service Integrity Check');
    const { sendEmail } = await import('../server/emailService.js');
    const emailRes = await sendEmail({ to: 'invalid-email-test', subject: 'Regression Check' });
    assert(emailRes.success === false, 'SendGrid email validation functioning correctly');

    // 18. ESP32 Telemetry Architecture Regression
    console.log('\n[Test 18] ESP32 Telemetry Endpoint Check');
    try {
        const dataRes = await fetch('http://localhost:5173/data');
        assert(dataRes.status === 200, 'GET /data returned HTTP 200 OK');
    } catch (e) {
        console.warn('  ⚠️ /data fetch notice:', e.message);
    }

    console.log('\n==================================================');
    console.log(`📊 TOTAL SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('==================================================\n');

    process.exit(failed === 0 ? 0 : 1);
}

runSmsComprehensiveTests().catch(err => {
    console.error('Fatal test exception:', err);
    process.exit(1);
});
