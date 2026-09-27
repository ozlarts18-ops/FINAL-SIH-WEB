import dotenv from 'dotenv';
import dns from 'node:dns';
import https from 'node:https';
import http from 'node:http';
import { getRedisClient } from './redisClient.js';
import { getNotificationRecipient, isValidEmail } from './notificationConfig.js';

try {
    dns.setDefaultResultOrder('ipv4first');
} catch (_e) {}

dotenv.config();

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

async function postJson(urlStr, headers, payloadObj) {
    const dataStr = JSON.stringify(payloadObj);
    return new Promise((resolve, reject) => {
        const urlObj = new URL(urlStr);
        dns.lookup(urlObj.hostname, { family: 4 }, (dnsErr, ip) => {
            if (dnsErr) return reject(dnsErr);
            const reqLib = urlObj.protocol === 'https:' ? https : http;
            const options = {
                hostname: ip,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    ...headers,
                    'Host': urlObj.hostname,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(dataStr)
                },
                servername: urlObj.hostname,
                timeout: 10000
            };
            const req = reqLib.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        headers: res.headers,
                        text: body
                    });
                });
            });
            req.on('timeout', () => {
                req.destroy(new Error(`HTTPS connection timeout (10000ms) connecting to ${urlObj.hostname} (${ip})`));
            });
            req.on('error', (err) => {
                reject(err);
            });
            req.write(dataStr);
            req.end();
        });
    });
}

/**
 * Core SendGrid Email Dispatcher
 * Sends an email using official SendGrid v3 Mail Send API over HTTPS
 * @param {Object} options
 * @param {string|string[]} [options.to] - Recipient email address(es)
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body
 * @returns {Promise<{success: boolean, messageId?: string, message?: string, error?: string, status?: number}>}
 */
export async function sendEmail({ to = null, subject, text, html }) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'alerts@envirox.io';
    const fromName = process.env.SENDGRID_FROM_NAME || 'EnviroX System';

    if (!apiKey || apiKey.includes('your_sendgrid_api_key')) {
        console.warn('⚠️ [SendGrid Notice] SENDGRID_API_KEY not configured in .env. Email dispatch skipped.');
        return { success: false, message: 'SENDGRID_API_KEY not configured' };
    }

    let recipientInput = to;
    if (!recipientInput) {
        const configRecipient = await getNotificationRecipient();
        recipientInput = configRecipient.email;
    }

    const recipients = Array.isArray(recipientInput) ? recipientInput : [recipientInput];
    const validTo = recipients.map(email => ({ email: String(email).trim() })).filter(item => isValidEmail(item.email));

    if (validTo.length === 0) {
        return { success: false, error: 'Recipient email address ("to") is required and must be valid.' };
    }


    if (!subject) {
        return { success: false, error: 'Email subject is required.' };
    }

    const content = [];
    if (text) content.push({ type: 'text/plain', value: String(text) });
    if (html) content.push({ type: 'text/html', value: String(html) });

    if (content.length === 0) {
        content.push({ type: 'text/plain', value: String(text || subject) });
    }

    const payload = {
        personalizations: [
            {
                to: validTo
            }
        ],
        from: {
            email: fromEmail,
            name: fromName
        },
        subject: subject,
        content: content
    };

    try {
        const resObj = await postJson(SENDGRID_API_URL, {
            'Authorization': `Bearer ${apiKey}`
        }, payload);

        if (resObj.ok || resObj.status === 202) {
            const messageId = resObj.headers['x-message-id'] || 'msg_' + Date.now();
            console.log(`📧 [SendGrid Success] Delivered to ${validTo.map(t => t.email).join(', ')} | Subject: "${subject}" | MsgID: ${messageId}`);
            return { success: true, messageId };
        } else {
            console.warn(`⚠️ [SendGrid Error] API returned HTTP ${resObj.status}: ${resObj.text.substring(0, 200)}`);
            return { success: false, status: resObj.status, error: resObj.text };
        }
    } catch (err) {
        const causeStr = err.cause ? (err.cause.message || err.cause.code || String(err.cause)) : '';
        const detail = causeStr ? `${err.message}: ${causeStr}` : err.message;
        console.warn(`⚠️ [SendGrid Exception] Request failed: ${detail}`);
        return { success: false, error: detail };
    }
}

// In-Memory Cooldown Fallback Map
const memoryCooldownMap = new Map();

async function isCooldownActive(key) {
    const now = Date.now();
    const memoryRecord = memoryCooldownMap.get(key);
    if (memoryRecord && now < memoryRecord.expiresAt) {
        return true;
    }
    try {
        const redis = await getRedisClient();
        if (redis) {
            const val = await redis.get(key);
            if (val) return true;
        }
    } catch (_e) {}
    return false;
}

async function setCooldown(key, ttlSeconds = 900) {
    memoryCooldownMap.set(key, { expiresAt: Date.now() + (ttlSeconds * 1000) });
    try {
        const redis = await getRedisClient();
        if (redis) {
            await redis.set(key, 'active', 'EX', ttlSeconds);
        }
    } catch (_e) {}
}

async function clearCooldown(key) {
    memoryCooldownMap.delete(key);
    try {
        const redis = await getRedisClient();
        if (redis) {
            await redis.del(key);
        }
    } catch (_e) {}
}

/**
 * Sends Critical Sensor Alert email with Redis & In-Memory duplicate suppression
 */
export async function sendSensorAlertEmail(alertData) {
    const { device = 'Unknown Node', sensor = 'Unknown Sensor', value, threshold, severity = 'CRITICAL', status = 'ONLINE', recipient = null } = alertData;
    const alertKey = `email:cooldown:sensor:${device}:${sensor}`;

    // Duplicate Protection Check (Redis + Memory Fallback)
    const active = await isCooldownActive(alertKey);
    if (active) {
        console.log(`⏳ [SendGrid Suppressed] Alert cooldown active for ${alertKey}`);
        return { success: false, suppressed: true, message: 'Alert cooldown active' };
    }

    const timestamp = new Date().toISOString(); // Canonical UTC
    const subject = `[EnviroX] Critical Sensor Alert: ${device} - ${sensor}`;
    const text = `
[EnviroX] Critical Sensor Alert
Device: ${device}
Sensor: ${sensor}
Value: ${value}
Threshold: ${threshold}
Severity: ${severity}
Timestamp (UTC): ${timestamp}
Device Status: ${status}
    `.trim();

    const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 600px;">
    <h2 style="color: #d9534f; margin-top: 0;">🚨 [EnviroX] Critical Sensor Alert</h2>
    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Device:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${device}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Sensor:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${sensor}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Current Value:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #d9534f; font-weight: bold;">${value}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Threshold:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${threshold}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Severity:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><span style="background: #d9534f; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold;">${severity}</span></td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Timestamp (UTC):</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${timestamp}</td></tr>
        <tr><td style="padding: 8px;"><strong>Device Status:</strong></td><td style="padding: 8px;">${status}</td></tr>
    </table>
    <p style="color: #888; font-size: 12px; margin-top: 20px;">EnviroX Autonomous Agricultural Gateway</p>
</div>
    `.trim();

    const res = await sendEmail({ to: recipient, subject, text, html });

    // Set 15-minute cooldown in Redis & Memory if dispatch attempted
    if (res.success || res.status === 403 || res.status === 202) {
        await setCooldown(alertKey, 900); // 900s = 15 minutes
    }

    return res;
}

/**
 * Clears alert cooldown state when sensor returns to normal range
 */
export async function clearSensorAlertCooldown(device, sensor) {
    const alertKey = `email:cooldown:sensor:${device}:${sensor}`;
    await clearCooldown(alertKey);
    console.log(`✅ [Alert Cooldown Cleared] ${alertKey}`);
}

/**
 * Sends Pest Detection Alert Email
 */
export async function sendPestAlertEmail(pestData) {
    const { pestName = 'Unknown Pest', confidence = 0.9, device = 'Camera Node 1', imageUrl = null, recipient = null } = pestData;
    const alertKey = `email:cooldown:pest:${pestName}`;

    try {
        const redis = await getRedisClient();
        if (redis) {
            const exists = await redis.get(alertKey);
            if (exists) return { success: false, suppressed: true, message: 'Pest alert cooldown active' };
        }
    } catch (_e) {}

    const timestamp = new Date().toISOString();
    const subject = `[EnviroX] Pest Detection Alert: ${pestName}`;
    const text = `Pest Detected: ${pestName}\nConfidence: ${(confidence * 100).toFixed(1)}%\nDevice: ${device}\nTimestamp (UTC): ${timestamp}`;
    const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 600px;">
    <h2 style="color: #f0ad4e; margin-top: 0;">🐛 [EnviroX] Pest Detection Alert</h2>
    <p><strong>Pest Name:</strong> ${pestName}</p>
    <p><strong>Confidence:</strong> ${(confidence * 100).toFixed(1)}%</p>
    <p><strong>Device:</strong> ${device}</p>
    <p><strong>Detection Timestamp (UTC):</strong> ${timestamp}</p>
    ${imageUrl ? `<img src="${imageUrl}" style="max-width: 100%; border-radius: 6px; margin-top: 10px;" alt="Pest Detection" />` : ''}
</div>
    `.trim();

    const res = await sendEmail({ to: recipient, subject, text, html });
    if (res.success) {
        try {
            const redis = await getRedisClient();
            if (redis) await redis.set(alertKey, 'active', 'EX', 1800); // 30-min cooldown
        } catch (_e) {}
    }
    return res;
}

/**
 * Sends Device Offline Email
 */
export async function sendDeviceOfflineEmail(device, lastSeen, lastIp = 'Unknown', recipient = null) {
    const alertKey = `email:cooldown:offline:${device}`;
    try {
        const redis = await getRedisClient();
        if (redis) {
            const exists = await redis.get(alertKey);
            if (exists) return { success: false, suppressed: true, message: 'Offline alert cooldown active' };
        }
    } catch (_e) {}

    const timestamp = new Date().toISOString();
    const subject = `[EnviroX] Device Offline: ${device}`;
    const text = `Device: ${device}\nLast Seen: ${lastSeen || 'Unknown'}\nLast IP: ${lastIp}\nOffline Detected (UTC): ${timestamp}`;
    const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 600px;">
    <h2 style="color: #d9534f; margin-top: 0;">📡 [EnviroX] Device Offline Alert</h2>
    <p><strong>Device:</strong> ${device}</p>
    <p><strong>Last Seen:</strong> ${lastSeen || 'Unknown'}</p>
    <p><strong>Last Known IP:</strong> ${lastIp}</p>
    <p><strong>Offline Detection Time (UTC):</strong> ${timestamp}</p>
</div>
    `.trim();

    const res = await sendEmail({ to: recipient, subject, text, html });
    if (res.success) {
        try {
            const redis = await getRedisClient();
            if (redis) await redis.set(alertKey, 'offline_notified', 'EX', 3600); // 1-hour cooldown
        } catch (_e) {}
    }
    return res;
}

/**
 * Sends Device Recovery Email when an offline device comes back online
 */
export async function sendDeviceRecoveryEmail(device, recipient = null) {
    const alertKey = `email:cooldown:offline:${device}`;
    try {
        const redis = await getRedisClient();
        if (redis) {
            const wasOffline = await redis.get(alertKey);
            if (!wasOffline) return { success: false, message: 'Device was not flagged offline in Redis cooldown' };
            await redis.del(alertKey);
        }
    } catch (_e) {}

    const timestamp = new Date().toISOString();
    const subject = `[EnviroX] Device Reconnected: ${device}`;
    const text = `Device: ${device}\nStatus: RECONNECTED & ONLINE\nRecovery Time (UTC): ${timestamp}`;
    const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #5cb85c; border-radius: 8px; max-width: 600px;">
    <h2 style="color: #5cb85c; margin-top: 0;">✅ [EnviroX] Device Reconnected</h2>
    <p><strong>Device:</strong> ${device}</p>
    <p><strong>Status:</strong> <span style="color: #5cb85c; font-weight: bold;">RECONNECTED & ONLINE</span></p>
    <p><strong>Recovery Time (UTC):</strong> ${timestamp}</p>
</div>
    `.trim();

    return await sendEmail({ to: recipient, subject, text, html });
}

/**
 * Sends Actuator State / Warning Alert Email
 */
export async function sendActuatorAlertEmail({ actuator, requestedState, actualState, device, error = null, recipient = null }) {
    const timestamp = new Date().toISOString();
    const subject = `[EnviroX] Actuator Alert: ${actuator}`;
    const text = `Actuator: ${actuator}\nRequested State: ${requestedState}\nActual State: ${actualState}\nDevice: ${device}\nTimestamp (UTC): ${timestamp}${error ? `\nError: ${error}` : ''}`;
    const html = `
<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 600px;">
    <h2 style="color: #f0ad4e; margin-top: 0;">🎛️ [EnviroX] Actuator Alert</h2>
    <p><strong>Actuator:</strong> ${actuator}</p>
    <p><strong>Requested State:</strong> ${requestedState}</p>
    <p><strong>Actual State:</strong> ${actualState}</p>
    <p><strong>Device:</strong> ${device}</p>
    <p><strong>Timestamp (UTC):</strong> ${timestamp}</p>
    ${error ? `<p style="color: #d9534f;"><strong>Warning/Error:</strong> ${error}</p>` : ''}
</div>
    `.trim();

    return await sendEmail({ to: recipient, subject, text, html });
}

/**
 * Sends Executive Summary Report Email
 */
export async function sendReportEmail({ to, reportTitle, reportHtml }) {
    const recipient = to || process.env.ALERT_RECIPIENT_EMAIL || 'user@example.com';
    const subject = `[EnviroX] Executive Report: ${reportTitle || 'Daily Agricultural Summary'}`;
    const text = `EnviroX Automated Report: ${reportTitle || 'Daily Summary'}\nGenerated at ${new Date().toISOString()}`;

    return await sendEmail({ to: recipient, subject, text, html: reportHtml || text });
}
