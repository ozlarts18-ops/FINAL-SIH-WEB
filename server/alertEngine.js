import { getCollection } from './mongoDb.js';
import { getRedisClient } from './redisClient.js';
import { getNotificationRecipient } from './notificationConfig.js';

// Memory Cooldown Fallback Map
const memoryCooldownMap = new Map();

export async function isAlertCooldownActive(key) {
    const now = Date.now();
    const mem = memoryCooldownMap.get(key);
    if (mem && now < mem.expiresAt) return true;
    try {
        const redis = await getRedisClient();
        if (redis) {
            const val = await redis.get(key);
            if (val) return true;
        }
    } catch (_e) {}
    return false;
}

export async function setAlertCooldown(key, ttlSeconds = 1800) {
    memoryCooldownMap.set(key, { expiresAt: Date.now() + (ttlSeconds * 1000) });
    try {
        const redis = await getRedisClient();
        if (redis) {
            await redis.set(key, 'active', 'EX', ttlSeconds);
        }
    } catch (_e) {}
}

export async function clearAlertCooldown(key) {
    memoryCooldownMap.delete(key);
    try {
        const redis = await getRedisClient();
        if (redis) {
            await redis.del(key);
        }
    } catch (_e) {}
}

/**
 * Core Alert Processing Function with Deduplication, Cooldown, and Multi-channel Notifications
 * @param {Object} alertSpec
 * @returns {Promise<Object>}
 */
export async function processAlertEvent(alertSpec) {
    const {
        device = 'System',
        alert_type = 'critical_sensor',
        sensor = 'Environmental',
        condition = 'Threshold Exceeded',
        severity = 'WARNING',
        title,
        message,
        isCleared = false
    } = alertSpec;

    const identityKey = `alert:${device}:${alert_type}:${sensor}:${severity}`;
    const cooldownKey = `cooldown:${identityKey}`;

    try {
        const col = await getCollection('alerts');

        // Handle Condition Clearing
        if (isCleared) {
            if (col) {
                await col.updateMany(
                    { device, sensor, is_resolved: false },
                    {
                        $set: {
                            status: 'RESOLVED',
                            is_resolved: true,
                            resolved_at: new Date()
                        }
                    }
                );
            }
            await clearAlertCooldown(cooldownKey);
            return { cleared: true };
        }

        // Check if condition is already active in MongoDB or in Cooldown
        let existingActiveAlert = null;
        if (col) {
            existingActiveAlert = await col.findOne({
                device,
                sensor,
                is_resolved: false
            });
        }

        const inCooldown = await isAlertCooldownActive(cooldownKey);

        let alertDoc;
        let isNewAlert = false;

        if (existingActiveAlert) {
            alertDoc = existingActiveAlert;
            if (col) {
                await col.updateOne(
                    { _id: existingActiveAlert._id },
                    {
                        $set: { last_updated_at: new Date() },
                        $inc: { occurrence_count: 1 }
                    }
                );
            }
        } else {
            isNewAlert = true;
            alertDoc = {
                _id: 'alt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                device,
                alert_type,
                sensor,
                condition,
                severity,
                alert_title: title || `${severity} Alert: ${sensor} on ${device}`,
                alert_message: message || `${sensor} condition (${condition}) detected on ${device}.`,
                status: 'ACTIVE',
                is_resolved: false,
                occurrence_count: 1,
                created_at: new Date(),
                acknowledged_at: null,
                resolved_at: null,
                notifications_sent: {
                    whatsapp: false,
                    email: false,
                    sms: false
                }
            };

            if (col) {
                await col.insertOne(alertDoc);
            }
        }

        // Notification Dispatching (Only for new alerts or when cooldown expired)
        if (isNewAlert && !inCooldown) {
            await setAlertCooldown(cooldownKey, 1800); // 30 min cooldown

            const recipient = await getNotificationRecipient();
            const prefs = recipient.notificationPreferences || {};

            const isCategoryEnabled = (cat) => {
                if (!cat) return true;
                const prefKey = `category_${cat}`;
                return prefs[prefKey] !== false;
            };

            const catAllowed = isCategoryEnabled(alert_type);
            const notificationsResult = { whatsapp: false, email: false, sms: false };

            // 1. Send WhatsApp if enabled
            if (prefs.whatsappEnabled !== false && catAllowed) {
                try {
                    const { sendMetaTextMessage } = await import('./metaWhatsappService.js');
                    const waRes = await sendMetaTextMessage(
                        recipient.phone,
                        `🚨 *[EnviroX ${severity} Alert]*\n\n` +
                        `• *Device:* ${device}\n` +
                        `• *Sensor:* ${sensor}\n` +
                        `• *Details:* ${message || condition}\n` +
                        `• *Time:* ${new Date().toLocaleTimeString()}\n\n` +
                        `Check dashboard for details.`
                    );
                    if (waRes?.success) notificationsResult.whatsapp = true;
                } catch (_waErr) {}
            }

            // 2. Send Email if enabled
            if (prefs.emailEnabled !== false && catAllowed) {
                try {
                    const { sendEmail } = await import('./emailService.js');
                    const emailRes = await sendEmail({
                        to: recipient.email,
                        subject: `[EnviroX ${severity} Alert] ${device} - ${sensor}`,
                        text: `EnviroX Alert Notification\n\nDevice: ${device}\nSensor: ${sensor}\nCondition: ${condition}\nSeverity: ${severity}\nDetails: ${message || condition}\nTime: ${new Date().toISOString()}\n\nPlease log in to EnviroX dashboard to review.`
                    });
                    if (emailRes?.success) notificationsResult.email = true;
                } catch (_eErr) {}
            }

            // 3. Send SMS if enabled
            if (prefs.smsEnabled !== false && catAllowed) {
                try {
                    const { sendSMS } = await import('./smsService.js');
                    const smsRes = await sendSMS({
                        to: recipient.phone,
                        message: `EnviroX ${severity} Alert: ${device} ${sensor} (${condition}). Time: ${new Date().toLocaleTimeString()}`
                    });
                    if (smsRes?.success) notificationsResult.sms = true;
                } catch (_smsErr) {}
            }

            if (col && alertDoc._id) {
                await col.updateOne(
                    { _id: alertDoc._id },
                    { $set: { notifications_sent: notificationsResult } }
                );
            }

            return { success: true, alertId: alertDoc._id, notified: true, notificationsResult };
        }

        return { success: true, alertId: alertDoc._id, notified: false, reason: 'Cooldown or active alert deduplicated' };
    } catch (err) {
        console.warn('⚠️ [AlertEngine Warning]:', err.message);
        return { success: false, error: err.message };
    }
}
