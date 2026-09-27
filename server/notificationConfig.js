import dotenv from 'dotenv';
import { getCollection } from './mongoDb.js';

dotenv.config();

let cachedRecipient = null;
let cacheExpiry = 0;

/**
 * Safely validates email format
 * @param {string} email 
 * @returns {boolean}
 */
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const clean = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(clean);
}

/**
 * Safely normalizes Indian phone numbers into MSG91 standard format (919876543210)
 * @param {string} phone 
 * @returns {string|null}
 */
export function normalizeIndianPhoneNumber(phone) {
    if (!phone) return null;
    let clean = String(phone).replace(/[^0-9]/g, '');

    if (clean.length === 10) {
        return `91${clean}`;
    }
    if (clean.length === 12 && clean.startsWith('91')) {
        return clean;
    }
    if (clean.length > 10 && clean.startsWith('0')) {
        clean = clean.substring(1);
        if (clean.length === 10) return `91${clean}`;
    }
    return null;
}

/**
 * Mask sensitive phone number for API response display (e.g. 9198****3210)
 * @param {string} phone 
 * @returns {string}
 */
export function maskPhone(phone) {
    const normalized = normalizeIndianPhoneNumber(phone);
    if (!normalized) return 'Invalid Phone';
    if (normalized.length < 10) return normalized;
    const start = normalized.substring(0, 4);
    const end = normalized.substring(normalized.length - 4);
    return `${start}****${end}`;
}

/**
 * Mask sensitive email for API response display (e.g. f***d@example.com)
 * @param {string} email 
 * @returns {string}
 */
export function maskEmail(email) {
    if (!isValidEmail(email)) return 'Invalid Email';
    const [name, domain] = email.split('@');
    if (name.length <= 2) return `${name}***@${domain}`;
    return `${name.substring(0, 2)}***${name.substring(name.length - 1)}@${domain}`;
}

/**
 * Centralized Notification Recipient Resolver
 * Evaluates configured recipient from MongoDB settings or environment variables
 * @returns {Promise<{name: string, phone: string, email: string}>}
 */
export async function getNotificationRecipient() {
    const now = Date.now();
    if (cachedRecipient && now < cacheExpiry) {
        return cachedRecipient;
    }

    let recipient = {
        name: process.env.ALERT_RECIPIENT_NAME || 'Oswaldo Gracias',
        phone: normalizeIndianPhoneNumber(process.env.ALERT_RECIPIENT_PHONE || process.env.DEFAULT_RECIPIENT_PHONE || '7900153894') || '917900153894',
        email: (process.env.ALERT_RECIPIENT_EMAIL && isValidEmail(process.env.ALERT_RECIPIENT_EMAIL))
            ? process.env.ALERT_RECIPIENT_EMAIL
            : 'oswaldogracias456@gmail.com'
    };

    try {
        const col = await getCollection('notification_settings');
        if (col) {
            const doc = await col.findOne({ _id: 'active_recipient' });
            if (doc) {
                const dbPhone = normalizeIndianPhoneNumber(doc.phone);
                const dbEmail = isValidEmail(doc.email) ? doc.email : null;
                if (dbPhone && dbEmail) {
                    recipient = {
                        name: doc.name || recipient.name,
                        phone: dbPhone,
                        email: dbEmail
                    };
                }
            }
        }
    } catch (dbErr) {
        console.warn('[NotificationConfig Notice] MongoDB query fallback to ENV:', dbErr.message);
    }

    cachedRecipient = recipient;
    cacheExpiry = now + 10000; // 10 second in-memory cache
    return recipient;
}

/**
 * Updates the active notification recipient in MongoDB & invalidates cache
 * @param {Object} payload 
 * @param {string} payload.name 
 * @param {string} payload.phone 
 * @param {string} payload.email 
 * @returns {Promise<{success: boolean, recipient?: Object, error?: string}>}
 */
export async function updateNotificationRecipient({ name, phone, email }) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return { success: false, error: 'Recipient name is required.' };
    }

    const normalizedPhone = normalizeIndianPhoneNumber(phone);
    if (!normalizedPhone) {
        return { success: false, error: 'Valid 10-digit Indian mobile number is required (e.g. 9876543210 or +919876543210).' };
    }

    if (!isValidEmail(email)) {
        return { success: false, error: 'Valid recipient email address is required (e.g. friend@example.com).' };
    }

    const updatedDoc = {
        _id: 'active_recipient',
        name: name.trim(),
        phone: normalizedPhone,
        email: email.trim(),
        updated_at: new Date()
    };

    try {
        const col = await getCollection('notification_settings');
        if (col) {
            await col.updateOne(
                { _id: 'active_recipient' },
                { $set: updatedDoc },
                { upsert: true }
            );
        }
    } catch (mErr) {
        console.warn('[NotificationConfig Notice] MongoDB save warning:', mErr.message);
    }

    cachedRecipient = {
        name: updatedDoc.name,
        phone: updatedDoc.phone,
        email: updatedDoc.email
    };
    cacheExpiry = Date.now() + 10000;

    return {
        success: true,
        recipient: {
            name: updatedDoc.name,
            phone: updatedDoc.phone,
            email: updatedDoc.email
        }
    };
}

/**
 * Resolves notification eligibility for a single authenticated user
 * @param {Object} user 
 * @returns {Object}
 */
export function getAuthenticatedNotificationRecipient(user) {
    if (!user || typeof user !== 'object') {
        return {
            userId: null,
            name: 'Unknown User',
            phone: null,
            normalizedPhone: null,
            smsEnabled: false,
            phoneVerified: false,
            active: false,
            eligible: false,
            reason: 'NO_USER_CONTEXT'
        };
    }

    const rawPhone = user.phone || user.user_metadata?.phone || null;
    const normalizedPhone = normalizeIndianPhoneNumber(rawPhone);
    const smsEnabled = Boolean(
        user.notificationPreferences?.smsEnabled !== undefined
            ? user.notificationPreferences.smsEnabled
            : (user.smsEnabled !== undefined ? user.smsEnabled : true)
    );
    const phoneVerified = Boolean(user.phoneVerified ?? user.user_metadata?.phoneVerified ?? false);
    const active = user.active !== false;

    let reason = null;
    if (!active) {
        reason = 'USER_INACTIVE';
    } else if (!phoneVerified) {
        reason = 'PHONE_NOT_VERIFIED';
    } else if (!smsEnabled) {
        reason = 'SMS_DISABLED';
    } else if (!normalizedPhone) {
        reason = 'INVALID_PHONE_NUMBER';
    }

    const eligible = active && smsEnabled && phoneVerified && Boolean(normalizedPhone);

    return {
        userId: user.id || user._id || user.user_id || 'usr_unknown',
        name: user.full_name || user.name || user.user_metadata?.full_name || 'EnviroX User',
        phone: rawPhone,
        normalizedPhone: normalizedPhone,
        smsEnabled: smsEnabled,
        phoneVerified: phoneVerified,
        active: active,
        eligible: eligible,
        reason: eligible ? null : reason
    };
}

/**
 * Resolves all eligible active SMS recipients from MongoDB users collection
 * Supports 29+ active recipients dynamically
 * @returns {Promise<string[]>} List of normalized Indian mobile numbers (e.g. ['919876543210', '919765432109'])
 */
export async function getEligibleSmsRecipients() {
    const recipientsSet = new Set();

    try {
        const usersCol = await getCollection('users');
        if (usersCol) {
            const cursor = usersCol.find({
                active: { $ne: false },
                phoneVerified: true,
                $or: [
                    { 'notificationPreferences.smsEnabled': true },
                    { smsEnabled: true },
                    { notificationPreferences: { $exists: false } }
                ]
            });

            const users = await cursor.toArray();
            for (const u of users) {
                const evaluated = getAuthenticatedNotificationRecipient(u);
                if (evaluated.eligible && evaluated.normalizedPhone) {
                    recipientsSet.add(evaluated.normalizedPhone);
                }
            }
        }
    } catch (err) {
        console.warn('[NotificationConfig Notice] DB query for users fallback:', err.message);
    }

    // Fallback: If no DB users matched, fallback to system recipient configuration
    if (recipientsSet.size === 0) {
        const fallback = await getNotificationRecipient();
        if (fallback && fallback.phone) {
            const normFallback = normalizeIndianPhoneNumber(fallback.phone);
            if (normFallback) {
                recipientsSet.add(normFallback);
            }
        }
    }

    return Array.from(recipientsSet);
}

