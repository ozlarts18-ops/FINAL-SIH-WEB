import dotenv from 'dotenv';
import dns from 'node:dns';
import https from 'node:https';
import http from 'node:http';
import { getRedisClient } from './redisClient.js';
import { normalizeIndianPhoneNumber } from './notificationConfig.js';

try {
    dns.setDefaultResultOrder('ipv4first');
} catch (_e) {}

dotenv.config();

const MSG91_V2_SMS_URL = 'https://api.msg91.com/api/v2/sendsms';
const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow/';

export { normalizeIndianPhoneNumber };

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
                timeout: 8000
            };
            const req = reqLib.request(options, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        text: body
                    });
                });
            });
            req.on('timeout', () => {
                req.destroy(new Error(`HTTPS connection timeout (8000ms) connecting to ${urlObj.hostname} (${ip})`));
            });
            req.on('error', (err) => {
                reject(err);
            });
            req.write(dataStr);
            req.end();
        });
    });
}

// In-Memory Cooldown Fallback Storage
const memorySmsCooldownMap = new Map();

async function isSmsCooldownActive(key) {
    const now = Date.now();
    const memoryRecord = memorySmsCooldownMap.get(key);
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

async function setSmsCooldown(key, ttlSeconds = 900) {
    memorySmsCooldownMap.set(key, { expiresAt: Date.now() + (ttlSeconds * 1000) });
    try {
        const redis = await getRedisClient();
        if (redis) {
            await redis.set(key, 'active', 'EX', ttlSeconds);
        }
    } catch (_e) {}
}

async function clearSmsCooldown(key) {
    memorySmsCooldownMap.delete(key);
    try {
        const redis = await getRedisClient();
        if (redis) {
            await redis.del(key);
        }
    } catch (_e) {}
}

/**
 * Core MSG91 SMS Dispatcher Function
 * Supports MSG91 v2/v5 SendSMS API and DLT Flow Template API
 * @param {Object} options
 * @param {string|string[]} [options.to] - Recipient phone number(s)
 * @param {string} [options.message] - Plain text SMS message body
 * @param {string} [options.templateId] - MSG91 Flow / DLT Template ID
 * @param {Object} [options.params] - Dynamic parameters for DLT Template
 * @returns {Promise<{success: boolean, messageId?: string, message?: string, error?: string, status?: number}>}
 */
export async function sendSMS({ to = null, message, templateId = null, params = {} }) {
    const authKey = process.env.MSG91_AUTH_KEY;
    const senderId = process.env.MSG91_SENDER_ID || 'ENVRX';
    const countryCode = process.env.MSG91_COUNTRY_CODE || '91';
    const activeTemplateId = templateId || process.env.MSG91_TEMPLATE_ID || null;

    if (!authKey || authKey.includes('your_msg91_auth_key')) {
        console.warn('⚠️ [MSG91 Notice] MSG91_AUTH_KEY not configured in .env. SMS dispatch skipped.');
        return { success: false, message: 'MSG91_AUTH_KEY not configured' };
    }

    let recipientInput = to;
    if (!recipientInput) {
        const { getEligibleSmsRecipients } = await import('./notificationConfig.js');
        recipientInput = await getEligibleSmsRecipients();
    }

    const rawRecipients = Array.isArray(recipientInput) ? recipientInput : [recipientInput];
    const validRecipients = rawRecipients.map(normalizeIndianPhoneNumber).filter(Boolean);

    if (validRecipients.length === 0) {
        console.log('⚠️ [MSG91 Notice] NO_SMS_RECIPIENTS: Zero eligible verified SMS recipients found.');
        return {
            success: false,
            status: 'NO_SMS_RECIPIENTS',
            message: 'No eligible verified SMS recipients found.'
        };
    }


    try {
        let resObj;
        if (activeTemplateId) {
            // Use MSG91 v5 Flow API
            const payload = {
                template_id: activeTemplateId,
                sender: senderId,
                short_name: 'EnviroX',
                recipients: validRecipients.map(mobiles => ({
                    mobiles: mobiles,
                    ...params,
                    message: message || undefined
                }))
            };

            resObj = await postJson(MSG91_FLOW_URL, { 'authkey': authKey }, payload);
        } else {
            // Use MSG91 Standard SendSMS API
            if (!message) {
                return { success: false, error: 'SMS message body or templateId is required.' };
            }

            const payload = {
                sender: senderId,
                route: '4',
                country: countryCode,
                sms: [
                    {
                        message: message,
                        to: validRecipients
                    }
                ]
            };

            resObj = await postJson(MSG91_V2_SMS_URL, { 'authkey': authKey }, payload);
        }

        const resText = resObj.text;
        let parsed = {};
        try { parsed = JSON.parse(resText); } catch (_e) {}

        if (resObj.ok || parsed.type === 'success' || parsed.status === 'success') {
            const msgId = parsed.request_id || parsed.message || 'msg_' + Date.now();
            console.log(`📱 [MSG91 Success] Sent to ${validRecipients.join(', ')} | RequestId: ${msgId}`);
            return { success: true, messageId: String(msgId), data: parsed };
        } else {
            console.warn(`⚠️ [MSG91_NOTIFICATION_FAILED] API returned HTTP ${resObj.status}: ${resText.substring(0, 200)}`);
            return { success: false, status: resObj.status, error: parsed.message || resText };
        }
    } catch (err) {
        const causeStr = err.cause ? (err.cause.message || err.cause.code || String(err.cause)) : '';
        const detail = causeStr ? `${err.message}: ${causeStr}` : err.message;
        console.warn(`⚠️ [MSG91_NOTIFICATION_FAILED] Request exception: ${detail}`);
        return { success: false, error: detail };
    }
}

/**
 * Sends Critical Sensor Alert SMS with Redis & In-Memory Duplicate Cooldown
 */
export async function sendSensorSmsAlert(alertData) {
    const { device = 'Node 2', sensor = 'pH', value = '4.2', threshold = '< 5.5', recipient = null } = alertData;
    const cooldownKey = `sms:cooldown:sensor:${device}:${sensor}`;

    const active = await isSmsCooldownActive(cooldownKey);
    if (active) {
        console.log(`⏳ [MSG91 Suppressed] SMS cooldown active for ${cooldownKey}`);
        return { success: false, suppressed: true, message: 'SMS cooldown active' };
    }

    const timestamp = new Date().toISOString();
    const smsMessage = `EnviroX Alert: ${device} ${sensor} critical. Value: ${value}, Threshold: ${threshold}. Time: ${timestamp}. Check dashboard.`;
    const templateId = process.env.MSG91_TEMPLATE_CRITICAL_SENSOR || null;

    const res = await sendSMS({ to: recipient, message: smsMessage, templateId, params: { VAR1: device, VAR2: sensor, VAR3: String(value) } });

    if (res.success || res.status === 200 || res.status === 401 || res.status === 402) {
        await setSmsCooldown(cooldownKey, 900); // 15-minute cooldown
    }

    return res;
}

/**
 * Clears SMS Alert Cooldown when sensor normalizes
 */
export async function clearSensorSmsCooldown(device, sensor) {
    const cooldownKey = `sms:cooldown:sensor:${device}:${sensor}`;
    await clearSmsCooldown(cooldownKey);
    console.log(`✅ [SMS Cooldown Cleared] ${cooldownKey}`);
}

/**
 * Sends Pest Detection SMS Alert
 */
export async function sendPestSmsAlert(pestData) {
    const { pestName = 'Aphid', confidence = 0.91, device = 'Node 1', recipient = null } = pestData;
    const cooldownKey = `sms:cooldown:pest:${pestName}`;

    const active = await isSmsCooldownActive(cooldownKey);
    if (active) return { success: false, suppressed: true, message: 'SMS pest cooldown active' };

    const timestamp = new Date().toISOString();
    const smsMessage = `EnviroX Pest Alert: ${pestName} detected (${(confidence * 100).toFixed(0)}%). Device: ${device}. Time: ${timestamp}. Check dashboard.`;
    const templateId = process.env.MSG91_TEMPLATE_PEST || null;

    const res = await sendSMS({ to: recipient, message: smsMessage, templateId, params: { VAR1: pestName, VAR2: device } });
    if (res.success || res.status === 200 || res.status === 401) {
        await setSmsCooldown(cooldownKey, 1800); // 30-minute cooldown
    }
    return res;
}

/**
 * Sends Device Offline SMS Alert
 */
export async function sendDeviceOfflineSms(device, lastSeen, recipient = null) {
    const cooldownKey = `sms:cooldown:offline:${device}`;

    const active = await isSmsCooldownActive(cooldownKey);
    if (active) return { success: false, suppressed: true, message: 'SMS offline cooldown active' };

    const timestamp = new Date().toISOString();
    const smsMessage = `EnviroX Alert: ${device} is offline. Last seen: ${lastSeen || timestamp}. Check dashboard.`;
    const templateId = process.env.MSG91_TEMPLATE_OFFLINE || null;

    const res = await sendSMS({ to: recipient, message: smsMessage, templateId, params: { VAR1: device } });
    if (res.success || res.status === 200 || res.status === 401) {
        await setSmsCooldown(cooldownKey, 3600); // 1-hour cooldown
    }
    return res;
}

/**
 * Sends Device Recovery SMS Alert
 */
export async function sendDeviceRecoverySms(device, recipient = null) {
    const cooldownKey = `sms:cooldown:offline:${device}`;

    const wasOffline = await isSmsCooldownActive(cooldownKey);
    if (!wasOffline) return { success: false, message: 'Device was not flagged offline' };

    await clearSmsCooldown(cooldownKey);

    const timestamp = new Date().toISOString();
    const smsMessage = `EnviroX: ${device} has recovered and is online. Time: ${timestamp}.`;
    const templateId = process.env.MSG91_TEMPLATE_RECOVERY || null;

    return await sendSMS({ to: recipient, message: smsMessage, templateId, params: { VAR1: device } });
}

/**
 * Sends Actuator Safety / Failure SMS Alert
 */
export async function sendActuatorSmsAlert({ actuator, requestedState, actualState, device, recipient = null }) {
    const timestamp = new Date().toISOString();
    const smsMessage = `EnviroX Actuator Alert: ${actuator} on ${device} failed to set state to ${requestedState}. Current: ${actualState}. Time: ${timestamp}.`;
    const templateId = process.env.MSG91_TEMPLATE_ACTUATOR || null;
    return await sendSMS({ to: recipient, message: smsMessage, templateId, params: { VAR1: actuator, VAR2: requestedState } });
}

