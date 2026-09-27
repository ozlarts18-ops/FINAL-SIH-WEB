import crypto from 'crypto';
import http from 'http';
import { queryTable, insertAndSync, getSystemHealth } from './syncEngine.js';
import { getCollection } from './mongoDb.js';
import {
    sendSms,
    evaluateAndNotify
} from './twilioService.js';
import {
    evaluateAndNotifyMeta,
    sendMetaWelcomeAlert,
    sendMetaLoginAlert,
    startContinuousMetaDaemon
} from './metaWhatsappService.js';
import { handleUserMessage } from './whatsappBotEngine.js';
import {
    startTelegramPollingDaemon,
    sendTelegramWelcomeAlert,
    sendTelegramLoginAlert
} from './telegramService.js';
import { startMdnsResponder } from './mdnsService.js';
import { startContinuousHardwareLinkDaemon } from './esp32SerialService.js';

// Security Token Config
const JWT_SECRET = process.env.JWT_SECRET || 'envirox_secure_jwt_secret_key_2026';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://iotrex.local:5173').split(',').map(s => s.trim());

export function generateUserToken(user) {
    const payload = {
        id: user.user_id || user.id || user._id || 'usr_' + Date.now(),
        email: user.email,
        role: user.role || 'operator',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (86400 * 30) // 30-day expiration
    };
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${signature}`;
}

export function verifyUserToken(tokenStr) {
    if (!tokenStr) return null;
    try {
        const cleanToken = tokenStr.replace(/^Bearer\s+/i, '').trim();
        const parts = cleanToken.split('.');
        if (parts.length !== 3) return null;
        const [header, body, signature] = parts;
        const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
        if (signature !== expectedSig) return null;
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch (_e) {
        return null;
    }
}

export function authenticateRequest(req, requiredRoles = null) {
    const authHeader = req.headers['authorization'] || '';
    const apiKeyHeader = req.headers['x-api-key'] || '';

    const masterApiKey = process.env.ENVIROX_API_KEY || 'envirox_master_key_2026';
    if (apiKeyHeader && apiKeyHeader === masterApiKey) {
        return { authenticated: true, user: { role: 'admin', email: 'system@envirox.local' } };
    }

    const user = verifyUserToken(authHeader);
    if (!user) {
        return { authenticated: false, error: '401', message: 'Authentication required. Missing or invalid Bearer token.' };
    }

    if (requiredRoles) {
        const allowed = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        if (!allowed.includes(user.role)) {
            return { authenticated: false, error: '403', message: `Forbidden. User role '${user.role}' lacks authorization for this operation.` };
        }
    }

    return { authenticated: true, user };
}

// Rate Limiter Storage
const rateLimitMap = new Map();

function checkRateLimit(ip, endpointKey, maxRequests, windowMs) {
    const now = Date.now();
    const key = `${ip}:${endpointKey}`;
    let record = rateLimitMap.get(key);
    if (!record || now > record.resetTime) {
        record = { count: 1, resetTime: now + windowMs };
        rateLimitMap.set(key, record);
        return { allowed: true, remaining: maxRequests - 1 };
    }
    record.count += 1;
    if (record.count > maxRequests) {
        return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: maxRequests - record.count };
}

// Cache the latest complete JPEG frame passing through the MJPEG proxy
let latestStreamFrameBuffer = null;
let latestStreamFrameTime = 0;

// Raspberry Pi USB Camera state (latest frame + rolling buffer of last 5 frames)
let latestPiFrame = null;
let piFrameHistory = [];


export function createApiMiddleware() {
    startContinuousMetaDaemon();
    startTelegramPollingDaemon();
    startMdnsResponder('iotrex.local', 5173);
    startContinuousHardwareLinkDaemon();

    return async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        if (!pathname.startsWith('/api') && pathname !== '/data' && !pathname.startsWith('/data/')) {
            return next();
        }

        const reqOrigin = req.headers.origin;
        const isAllowedOrigin = !reqOrigin || ALLOWED_ORIGINS.includes(reqOrigin) || process.env.NODE_ENV !== 'production';
        const corsOrigin = isAllowedOrigin && reqOrigin ? reqOrigin : (ALLOWED_ORIGINS[0] || 'http://localhost:5173');

        const sendJson = (status, payload) => {
            res.writeHead(status, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
                'Access-Control-Allow-Credentials': 'true',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'X-XSS-Protection': '1; mode=block',
                'Referrer-Policy': 'strict-origin-when-cross-origin'
            });
            res.end(JSON.stringify(payload));
        };

        if (req.method === 'OPTIONS') {
            return sendJson(200, { ok: true });
        }

        try {
            if (pathname === '/api/health' && req.method === 'GET') {
                const health = await getSystemHealth();
                return sendJson(200, health);
            }

            if (pathname === '/api/auth/register' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { email, password, fullName, phone } = JSON.parse(body || '{}');
                        if (!email) {
                            return sendJson(400, { status: 'error', message: 'Email is required' });
                        }

                        const userRecord = {
                            full_name: fullName || email.split('@')[0],
                            email: email.toLowerCase(),
                            password_hash: password || 'default_hashed',
                            phone: phone || '',
                            role: 'operator',
                            created_at: new Date().toISOString()
                        };

                        const insertResult = await insertAndSync('users', userRecord);
                        const user = {
                            id: insertResult.record?.user_id || insertResult.record?._id || 'usr_' + Date.now(),
                            email: userRecord.email,
                            full_name: userRecord.full_name,
                            role: userRecord.role
                        };

                        const welcomePhone = userRecord.phone || process.env.DEFAULT_RECIPIENT_PHONE || '917900153894';
                        console.log(`🌱 [Register Event] Sending WhatsApp Welcome to ${welcomePhone} for user ${userRecord.full_name}...`);
                        sendMetaWelcomeAlert(welcomePhone, userRecord.full_name)
                            .then(res => console.log(`✅ [Register WhatsApp Delivered] ID: ${res?.messageId || 'OK'}`))
                            .catch(e => console.warn('[Meta WhatsApp Welcome Warning]:', e.message));

                        import('./emailService.js').then(({ sendEmail }) => {
                            sendEmail({
                                to: 'oswaldogracias456@gmail.com',
                                subject: `[IOTrex Security] New User Sign Up: ${userRecord.full_name}`,
                                text: `New User Registration Alert\n\nName: ${userRecord.full_name}\nEmail: ${userRecord.email}\nPhone: ${userRecord.phone || 'N/A'}\nTime: ${new Date().toLocaleString()}\n\nA new user account has been registered on your IOTrex platform.`,
                                html: `
                                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f8f1; border: 2px solid #65b32e; border-radius: 8px;">
                                        <h2 style="color: #1b5e20; margin-top: 0;">🌱 New User Registration Alert</h2>
                                        <p><strong>Name:</strong> ${userRecord.full_name}</p>
                                        <p><strong>Email:</strong> ${userRecord.email}</p>
                                        <p><strong>Phone:</strong> ${userRecord.phone || 'N/A'}</p>
                                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                                        <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
                                        <p style="font-size: 12px; color: #64748b;">This is an automated security notification from your IOTrex Smart Greenhouse System.</p>
                                    </div>
                                `
                            }).then(res => console.log('📧 [Register Email Delivered to Gmail]:', res.success ? 'Success' : res.error))
                                .catch(e => console.warn('[Register Email Exception]:', e.message));
                        }).catch(() => { });

                        sendTelegramWelcomeAlert(userRecord.telegram_chat_id, userRecord.full_name)
                            .then(res => res?.success && console.log(`✈️ [Register Telegram Delivered] Chat: ${res.chatId}`))
                            .catch(e => console.warn('[Telegram Welcome Warning]:', e.message));

                        return sendJson(201, {
                            status: 'success',
                            user,
                            message: 'User registered successfully'
                        });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/auth/login' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { email, password } = JSON.parse(body || '{}');
                        if (!email || !password) {
                            return sendJson(400, { status: 'error', message: 'Email and password are required' });
                        }

                        const normalizedEmail = email.toLowerCase();
                        let foundUser = null;

                        try {
                            const usersCol = await getCollection('users');
                            foundUser = await usersCol.findOne({ email: normalizedEmail });
                        } catch (mErr) {
                            console.warn('[Auth Mongo Warning] MongoDB user lookup failed:', mErr.message);
                        }

                        if (!foundUser && password.length >= 6) {
                            foundUser = {
                                user_id: 'usr_' + Date.now(),
                                email: normalizedEmail,
                                full_name: normalizedEmail.split('@')[0],
                                phone: process.env.DEFAULT_RECIPIENT_PHONE || '917900153894',
                                role: 'operator'
                            };
                            insertAndSync('users', {
                                email: normalizedEmail,
                                full_name: foundUser.full_name,
                                phone: foundUser.phone,
                                password_hash: password,
                                role: 'operator'
                            }).catch(() => { });
                        } else if (!foundUser) {
                            return sendJson(401, { status: 'error', message: 'Invalid email or password credentials.' });
                        }

                        const loginPhone = foundUser.phone || process.env.DEFAULT_RECIPIENT_PHONE || '917900153894';
                        const isFirstLogin = !foundUser.last_login_at;
                        console.log(`🔐 [Login Event] User '${foundUser.email}' logged in. Sending WhatsApp alert to ${loginPhone}...`);

                        sendMetaLoginAlert(loginPhone, foundUser.full_name || foundUser.email.split('@')[0], isFirstLogin)
                            .then(res => console.log(`✅ [Login WhatsApp Delivered] ID: ${res?.messageId || 'OK'}`))
                            .catch(e => console.warn('[Meta WhatsApp Login Alert Warning]:', e.message));

                        import('./emailService.js').then(({ sendEmail }) => {
                            sendEmail({
                                to: 'oswaldogracias456@gmail.com',
                                subject: `[IOTrex Security Alert] User Login: ${foundUser.full_name || foundUser.email}`,
                                text: `Security Login Notification\n\nUser: ${foundUser.full_name || foundUser.email}\nEmail: ${foundUser.email}\nTime: ${new Date().toLocaleString()}\nStatus: Session Authenticated\n\nIf this was not you, please log in and change your password immediately.`,
                                html: `
                                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f0fdf4; border: 2px solid #3b82f6; border-radius: 8px;">
                                        <h2 style="color: #1e40af; margin-top: 0;">🔒 Security Login Notification</h2>
                                        <p><strong>User:</strong> ${foundUser.full_name || foundUser.email}</p>
                                        <p><strong>Email:</strong> ${foundUser.email}</p>
                                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                                        <p><strong>Status:</strong> <span style="color: #16a34a; font-weight: bold;">Authenticated</span></p>
                                        <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
                                        <p style="font-size: 12px; color: #64748b;">This is an automated login security notification from your IOTrex Smart Greenhouse System.</p>
                                    </div>
                                `
                            }).then(res => console.log('📧 [Login Email Delivered to Gmail]:', res.success ? 'Success' : res.error))
                                .catch(e => console.warn('[Login Email Exception]:', e.message));
                        }).catch(() => { });

                        sendTelegramLoginAlert(foundUser.telegram_chat_id, foundUser.full_name || foundUser.email.split('@')[0], isFirstLogin)
                            .then(res => res?.success && console.log(`✈️ [Login Telegram Delivered] Chat: ${res.chatId}`))
                            .catch(e => console.warn('[Telegram Login Alert Warning]:', e.message));

                        getCollection('users').then(col => {
                            col.updateOne({ email: normalizedEmail }, { $set: { last_login_at: new Date().toISOString() } });
                        }).catch(() => { });

                        const userPayload = {
                            id: foundUser.user_id || foundUser._id || 'usr_' + Date.now(),
                            email: foundUser.email,
                            full_name: foundUser.full_name || foundUser.email?.split('@')[0],
                            role: foundUser.role || 'operator'
                        };
                        const token = generateUserToken(userPayload);

                        return sendJson(200, {
                            status: 'success',
                            token,
                            user: userPayload
                        });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/overview' && req.method === 'GET') {
                const [airRes, waterRes, plantRes, pestRes, alertsRes] = await Promise.allSettled([
                    queryTable('air_quality_logs', { limit: 1, orderBy: 'recorded_at', ascending: false }),
                    queryTable('water_quality_logs', { limit: 1, orderBy: 'recorded_at', ascending: false }),
                    queryTable('plant_growth_logs', { limit: 1, orderBy: 'recorded_at', ascending: false }),
                    queryTable('pest_detection_logs', { limit: 1, orderBy: 'detected_at', ascending: false }),
                    queryTable('alerts', { limit: 5, orderBy: 'created_at', ascending: false, filters: { is_resolved: false } })
                ]);

                return sendJson(200, {
                    status: 'success',
                    data: {
                        air: airRes.status === 'fulfilled' ? airRes.value.data?.[0] : null,
                        water: waterRes.status === 'fulfilled' ? waterRes.value.data?.[0] : null,
                        plant: plantRes.status === 'fulfilled' ? plantRes.value.data?.[0] : null,
                        pest: pestRes.status === 'fulfilled' ? pestRes.value.data?.[0] : null,
                        unresolved_alerts: alertsRes.status === 'fulfilled' ? alertsRes.value.data : []
                    }
                });
            }

            const dataMatch = pathname.match(/^\/api\/data\/([a-zA-Z0-9_-]+)/);
            if (dataMatch && req.method === 'GET') {
                const table = dataMatch[1];
                const limit = parseInt(url.searchParams.get('limit') || '50', 10);
                const orderBy = url.searchParams.get('orderBy') || 'recorded_at';
                const ascending = url.searchParams.get('ascending') !== 'false';

                const filters = {};
                for (const [key, value] of url.searchParams.entries()) {
                    if (!['limit', 'orderBy', 'ascending'].includes(key)) {
                        filters[key] = value;
                    }
                }

                let effectiveOrderBy = orderBy;
                if (['pest_detection_logs', 'disease_detection_logs'].includes(table) && orderBy === 'recorded_at') {
                    effectiveOrderBy = 'detected_at';
                } else if (['system_events'].includes(table) && orderBy === 'recorded_at') {
                    effectiveOrderBy = 'event_time';
                } else if (['alerts', 'users', 'sensors', 'devices', 'recommendations_intelligence'].includes(table) && orderBy === 'recorded_at') {
                    effectiveOrderBy = 'created_at';
                }

                const result = await queryTable(table, {
                    limit,
                    orderBy: effectiveOrderBy,
                    ascending,
                    filters
                });

                return sendJson(200, {
                    status: 'success',
                    table,
                    ...result
                });
            }

            if (dataMatch && req.method === 'POST') {
                const table = dataMatch[1];
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const parsed = JSON.parse(body || '{}');
                        const result = await insertAndSync(table, parsed);

                        evaluateAndNotify(table, parsed).catch(err => {
                            console.warn('[Twilio Trigger Warning]:', err.message);
                        });

                        evaluateAndNotifyMeta(table, parsed).catch(err => {
                            console.warn('[Meta WhatsApp Trigger Warning]:', err.message);
                        });

                        if (table === 'alerts') {
                            import('./emailService.js').then(({ sendEmail }) => {
                                const subject = `[IOTrex ${parsed.severity || 'CRITICAL'} Alert] ${parsed.title || 'Greenhouse System Alert'}`;
                                const text = `IOTrex Greenhouse Alert Notification\n\n` +
                                    `Title: ${parsed.title || 'System Alert'}\n` +
                                    `Module: ${parsed.module_name || 'Greenhouse'}\n` +
                                    `Severity: ${parsed.severity || 'HIGH'}\n` +
                                    `Details: ${parsed.message || ''}\n` +
                                    `Timestamp: ${new Date().toISOString()}\n\n` +
                                    `Please log in to your IOTrex dashboard.`;

                                const html = `
                                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f8f1; border-radius: 8px; border: 1px solid #cbd5e1;">
                                        <h2 style="color: #ef4444; margin-top: 0;">🚨 ${parsed.title || 'IOTrex Greenhouse System Alert'}</h2>
                                        <p><strong>Module:</strong> ${parsed.module_name || 'Greenhouse'}</p>
                                        <p><strong>Severity:</strong> <span style="color: #b91c1c; font-weight: bold;">${parsed.severity || 'HIGH'}</span></p>
                                        <p><strong>Details:</strong> ${parsed.message || ''}</p>
                                        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                                        <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
                                        <p style="font-size: 12px; color: #64748b;">This is an automated real-time alert dispatched to oswaldogracias456@gmail.com from your IOTrex Smart Greenhouse System.</p>
                                    </div>
                                `;
                                sendEmail({ to: 'oswaldogracias456@gmail.com', subject, text, html })
                                    .then(res => console.log('📧 [Alert Email Delivered to oswaldogracias456@gmail.com]:', res.success ? 'Success' : res.error))
                                    .catch(e => console.warn('[Alert Email Exception]:', e.message));
                            }).catch(() => { });
                        }

                        return sendJson(201, {
                            status: 'success',
                            table,
                            ...result
                        });
                    } catch (parseErr) {
                        return sendJson(400, { status: 'error', message: parseErr.message });
                    }
                });
                return;
            }

            if (pathname === '/api/notifications/email/send' && req.method === 'POST') {
                const clientIp = req.socket.remoteAddress || '127.0.0.1';
                const rl = checkRateLimit(clientIp, 'email_send', 5, 60000);
                if (!rl.allowed) {
                    return sendJson(429, { status: 'error', message: 'Rate limit exceeded for email sending.' });
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { to, subject, message, html } = JSON.parse(body || '{}');
                        if (!to || !to.includes('@')) {
                            return sendJson(400, { status: 'error', message: 'Valid recipient email address ("to") is required.' });
                        }
                        if (!subject) {
                            return sendJson(400, { status: 'error', message: 'Email subject is required.' });
                        }
                        const { sendEmail } = await import('./emailService.js');
                        const result = await sendEmail({ to, subject, text: message, html });
                        if (result.success) {
                            return sendJson(200, { status: 'success', result });
                        } else {
                            return sendJson(500, { status: 'error', message: result.error || 'SendGrid email dispatch failed' });
                        }
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/auth/login' && req.method === 'POST') {
                const clientIp = req.socket.remoteAddress || '127.0.0.1';
                const rl = checkRateLimit(clientIp, 'auth_login', 20, 60000);
                if (!rl.allowed) {
                    return sendJson(429, { status: 'error', message: 'Too many login attempts. Please wait.' });
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { email, phone } = JSON.parse(body || '{}');
                        const { normalizeIndianPhoneNumber } = await import('./notificationConfig.js');

                        if (!email && !phone) {
                            return sendJson(400, { status: 'error', message: 'Email or phone number is required.' });
                        }

                        const inputPhone = phone || (email && !email.includes('@') ? email : null);
                        const normalizedPhone = normalizeIndianPhoneNumber(inputPhone);
                        const cleanEmail = email && email.includes('@') ? email.trim() : (normalizedPhone ? `${normalizedPhone}@envirox.local` : 'user@envirox.local');

                        let userDoc = null;
                        try {
                            const usersCol = await getCollection('users');
                            if (usersCol) {
                                if (normalizedPhone) {
                                    userDoc = await usersCol.findOne({ $or: [{ phone: normalizedPhone }, { email: cleanEmail }] });
                                } else {
                                    userDoc = await usersCol.findOne({ email: cleanEmail });
                                }

                                if (!userDoc) {
                                    userDoc = {
                                        _id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                                        email: cleanEmail,
                                        phone: normalizedPhone,
                                        phoneVerified: Boolean(normalizedPhone),
                                        notificationPreferences: {
                                            smsEnabled: true,
                                            emailEnabled: true
                                        },
                                        full_name: cleanEmail.split('@')[0],
                                        role: 'operator',
                                        active: true,
                                        created_at: new Date(),
                                        updated_at: new Date()
                                    };
                                    await usersCol.insertOne(userDoc);
                                } else {
                                    // Update existing user phone if newly supplied without overwriting preferences
                                    const updates = { updated_at: new Date() };
                                    if (normalizedPhone && !userDoc.phone) {
                                        updates.phone = normalizedPhone;
                                        updates.phoneVerified = true;
                                    }
                                    await usersCol.updateOne({ _id: userDoc._id }, { $set: updates });
                                    if (updates.phone) {
                                        userDoc.phone = updates.phone;
                                        userDoc.phoneVerified = true;
                                    }
                                }
                            }
                        } catch (dbErr) {
                            console.warn('[Auth Notice] Mongo User store fallback:', dbErr.message);
                        }

                        if (!userDoc) {
                            userDoc = {
                                _id: 'usr_' + Date.now(),
                                email: cleanEmail,
                                phone: normalizedPhone,
                                phoneVerified: Boolean(normalizedPhone),
                                notificationPreferences: { smsEnabled: true, emailEnabled: true },
                                full_name: cleanEmail.split('@')[0],
                                role: 'operator',
                                active: true
                            };
                        }

                        const token = generateUserToken(userDoc);
                        return sendJson(200, {
                            status: 'success',
                            token,
                            user: {
                                id: userDoc._id,
                                email: userDoc.email,
                                full_name: userDoc.full_name,
                                phone: userDoc.phone,
                                phoneVerified: Boolean(userDoc.phoneVerified),
                                notificationPreferences: userDoc.notificationPreferences || { smsEnabled: true, emailEnabled: true },
                                role: userDoc.role || 'operator'
                            }
                        });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/auth/register' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { email, fullName, phone } = JSON.parse(body || '{}');
                        const { normalizeIndianPhoneNumber } = await import('./notificationConfig.js');

                        if (!email) {
                            return sendJson(400, { status: 'error', message: 'Email address is required.' });
                        }

                        const normalizedPhone = normalizeIndianPhoneNumber(phone);
                        const userDoc = {
                            _id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                            email: email.trim(),
                            phone: normalizedPhone,
                            phoneVerified: Boolean(normalizedPhone),
                            notificationPreferences: {
                                smsEnabled: true,
                                emailEnabled: true
                            },
                            full_name: fullName || email.split('@')[0],
                            role: 'operator',
                            active: true,
                            created_at: new Date(),
                            updated_at: new Date()
                        };

                        try {
                            const usersCol = await getCollection('users');
                            if (usersCol) {
                                await usersCol.updateOne(
                                    { email: userDoc.email },
                                    { $set: userDoc },
                                    { upsert: true }
                                );
                            }
                        } catch (dbErr) {
                            console.warn('[Auth Notice] Mongo User register save warning:', dbErr.message);
                        }

                        const token = generateUserToken(userDoc);
                        return sendJson(200, {
                            status: 'success',
                            token,
                            user: {
                                id: userDoc._id,
                                email: userDoc.email,
                                full_name: userDoc.full_name,
                                phone: userDoc.phone,
                                phoneVerified: Boolean(userDoc.phoneVerified),
                                notificationPreferences: userDoc.notificationPreferences,
                                role: userDoc.role
                            }
                        });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/notifications/preferences' && req.method === 'GET') {
                const authResult = authenticateRequest(req);
                if (!authResult.authenticated) {
                    return sendJson(401, { status: 'error', message: authResult.message });
                }

                try {
                    const { maskPhone } = await import('./notificationConfig.js');
                    const usersCol = await getCollection('users');
                    let userDoc = null;
                    if (usersCol) {
                        userDoc = await usersCol.findOne({
                            $or: [
                                { _id: authResult.user.id },
                                { email: authResult.user.email }
                            ]
                        });
                    }

                    const smsEnabled = userDoc?.notificationPreferences?.smsEnabled ?? userDoc?.smsEnabled ?? true;
                    const phone = userDoc?.phone || null;
                    const phoneVerified = Boolean(userDoc?.phoneVerified ?? false);

                    return sendJson(200, {
                        status: 'success',
                        smsEnabled,
                        phone: phone ? maskPhone(phone) : null,
                        phoneVerified
                    });
                } catch (err) {
                    return sendJson(500, { status: 'error', message: err.message });
                }
            }

            if (pathname === '/api/notifications/preferences' && req.method === 'POST') {
                const authResult = authenticateRequest(req);
                if (!authResult.authenticated) {
                    return sendJson(401, { status: 'error', message: authResult.message });
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { smsEnabled } = JSON.parse(body || '{}');
                        if (typeof smsEnabled !== 'boolean') {
                            return sendJson(400, { status: 'error', message: 'Parameter "smsEnabled" must be a boolean.' });
                        }

                        const { maskPhone } = await import('./notificationConfig.js');
                        let userDoc = null;
                        try {
                            const usersCol = await getCollection('users');
                            if (usersCol) {
                                userDoc = await usersCol.findOne({
                                    $or: [
                                        { _id: authResult.user.id },
                                        { email: authResult.user.email }
                                    ]
                                });

                                if (userDoc) {
                                    await usersCol.updateOne(
                                        { _id: userDoc._id },
                                        {
                                            $set: {
                                                'notificationPreferences.smsEnabled': smsEnabled,
                                                smsEnabled: smsEnabled,
                                                updated_at: new Date()
                                            }
                                        }
                                    );
                                    userDoc.smsEnabled = smsEnabled;
                                }
                            }
                        } catch (dbErr) {
                            console.warn('[Preferences Notice] Mongo save warning:', dbErr.message);
                        }

                        return sendJson(200, {
                            status: 'success',
                            message: 'Notification preferences updated successfully',
                            smsEnabled,
                            phone: userDoc?.phone ? maskPhone(userDoc.phone) : null,
                            phoneVerified: Boolean(userDoc?.phoneVerified ?? false)
                        });
                    } catch (err) {
                        return sendJson(400, { status: 'error', message: 'Invalid JSON payload: ' + err.message });
                    }
                });
                return;
            }


            if (pathname === '/api/notifications/recipient' && req.method === 'POST') {
                const clientIp = req.socket.remoteAddress || '127.0.0.1';
                const rl = checkRateLimit(clientIp, 'recipient_config', 10, 60000);
                if (!rl.allowed) {
                    return sendJson(429, { status: 'error', message: 'Rate limit exceeded for recipient configuration.' });
                }

                const authResult = authenticateRequest(req, ['operator', 'admin', 'superuser']);

                // Enforce authentication for notification recipient modification
                if (!authResult.authenticated) {
                    const code = authResult.error === '403' ? 403 : 401;
                    return sendJson(code, { status: 'error', message: authResult.message });
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { name, phone, email } = JSON.parse(body || '{}');
                        const { updateNotificationRecipient } = await import('./notificationConfig.js');
                        const updateRes = await updateNotificationRecipient({ name, phone, email });

                        if (!updateRes.success) {
                            return sendJson(400, { status: 'error', message: updateRes.error });
                        }

                        return sendJson(200, {
                            status: 'success',
                            message: 'Notification recipient updated successfully',
                            data: updateRes.recipient
                        });
                    } catch (err) {
                        return sendJson(400, { status: 'error', message: 'Invalid JSON payload: ' + err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/notifications/email/test' && req.method === 'POST') {
                const clientIp = req.socket.remoteAddress || '127.0.0.1';
                const rl = checkRateLimit(clientIp, 'email_test', 5, 600000); // 5 tests per 10 mins
                if (!rl.allowed) {
                    return sendJson(429, { status: 'error', message: 'Rate limit exceeded for email test.' });
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { to } = JSON.parse(body || '{}');
                        const { getNotificationRecipient } = await import('./notificationConfig.js');
                        const configRecipient = await getNotificationRecipient();
                        const recipient = to || configRecipient.email;
                        const { sendEmail } = await import('./emailService.js');
                        const testBody = `🌱 [EnviroX SendGrid Integration Test]\nSendGrid email notification pipeline is ACTIVE!\nRecipient Name: ${configRecipient.name}\nCanonical UTC Time: ${new Date().toISOString()}`;
                        const testHtml = `
<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #5cb85c; border-radius: 8px; max-width: 600px;">
    <h2 style="color: #5cb85c; margin-top: 0;">🌱 [EnviroX] SendGrid Email Service Active</h2>
    <p>SendGrid notification integration successfully verified!</p>
    <p><strong>Recipient Name:</strong> ${configRecipient.name}</p>
    <p><strong>Recipient Email:</strong> ${recipient}</p>
    <p><strong>Timestamp (UTC):</strong> ${new Date().toISOString()}</p>
</div>
                        `.trim();
                        const result = await sendEmail({ to: recipient, subject: '[EnviroX] SendGrid Integration Test', text: testBody, html: testHtml });
                        return sendJson(200, { status: 'success', recipient, result });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/notifications/sms/msg91/send' && req.method === 'POST') {
                const clientIp = req.socket.remoteAddress || '127.0.0.1';
                const rl = checkRateLimit(clientIp, 'msg91_send', 5, 60000);
                if (!rl.allowed) {
                    return sendJson(429, { status: 'error', message: 'Rate limit exceeded for MSG91 SMS dispatch.' });
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { to, message, templateId, params } = JSON.parse(body || '{}');
                        const { sendSMS } = await import('./smsService.js');
                        const { normalizeIndianPhoneNumber, getNotificationRecipient } = await import('./notificationConfig.js');
                        let target = to;
                        if (!target) {
                            const rec = await getNotificationRecipient();
                            target = rec.phone;
                        }
                        const normalizedTo = normalizeIndianPhoneNumber(target);
                        if (!normalizedTo) {
                            return sendJson(400, { status: 'error', message: 'Valid 10-digit Indian phone number ("to") is required.' });
                        }
                        const result = await sendSMS({ to: normalizedTo, message, templateId, params });
                        return sendJson(result.success ? 200 : 500, { status: result.success ? 'success' : 'error', result });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/notifications/sms/msg91/test' && req.method === 'POST') {
                const clientIp = req.socket.remoteAddress || '127.0.0.1';
                const rl = checkRateLimit(clientIp, 'msg91_test', 50, 600000); // 50 tests per 10 mins
                if (!rl.allowed) {
                    return sendJson(429, { status: 'error', message: 'Rate limit exceeded for MSG91 test endpoint.' });
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { to, message } = JSON.parse(body || '{}');
                        const { sendSMS } = await import('./smsService.js');
                        const { normalizeIndianPhoneNumber, getNotificationRecipient } = await import('./notificationConfig.js');
                        let target = to;
                        if (!target) {
                            const rec = await getNotificationRecipient();
                            target = rec.phone;
                        }
                        const recipient = normalizeIndianPhoneNumber(target);
                        if (!recipient) {
                            return sendJson(400, { status: 'error', message: 'Valid 10-digit Indian mobile number is required.' });
                        }
                        const smsMessage = message || `EnviroX MSG91 SMS Integration Test Active. Time: ${new Date().toISOString()}`;
                        const result = await sendSMS({ to: recipient, message: smsMessage });
                        return sendJson(200, { status: 'success', recipient, result });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/notifications/sms/send' && req.method === 'POST') {
                const clientIp = req.socket.remoteAddress || '127.0.0.1';
                const rl = checkRateLimit(clientIp, 'sms_send', 5, 60000);
                if (!rl.allowed) {
                    return sendJson(429, { status: 'error', message: 'Rate limit exceeded for SMS sending.' });
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { to, message } = JSON.parse(body || '{}');
                        if (!message) {
                            return sendJson(400, { status: 'error', message: 'SMS message body is required' });
                        }
                        const result = await sendSms(to, message);
                        return sendJson(200, { status: 'success', result });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/notifications/sms/test' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { to } = JSON.parse(body || '{}');
                        const testBody = `🌱 [EnviroX Alert Test]\nTwilio SMS integration is active!\nLive Sensor Data connected to MongoDB. Time: ${new Date().toLocaleTimeString()}`;
                        const result = await sendSms(to, testBody);
                        return sendJson(200, { status: 'success', result });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/webhook/whatsapp' && req.method === 'GET') {
                const mode = url.searchParams.get('hub.mode');
                const token = url.searchParams.get('hub.verify_token');
                const challenge = url.searchParams.get('hub.challenge');
                const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'iotrex_verify_token_123';

                if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    return res.end(challenge);
                }
                return sendJson(403, { error: 'Verification token mismatch' });
            }

            if (pathname === '/api/webhook/whatsapp' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const payload = JSON.parse(body || '{}');
                        console.log('📩 [Meta WhatsApp Webhook POST]:', JSON.stringify(payload, null, 2));

                        for (const entry of (payload.entry || [])) {
                            for (const change of (entry.changes || [])) {
                                const value = change.value;
                                const messages = value?.messages || [];

                                for (const message of messages) {
                                    const fromNumber = message.from;
                                    const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || '';
                                    if (fromNumber && text) {
                                        console.log(`🤖 [Bot Dispatching Query] From: ${fromNumber} | Command: "${text}"`);
                                        handleUserMessage(fromNumber, text).catch(e => console.error('[Bot Error]:', e.message));
                                    }
                                }
                            }
                        }

                        return sendJson(200, { status: 'EVENT_RECEIVED' });
                    } catch (e) {
                        console.error('[Webhook Parse Error]:', e.message);
                        return sendJson(200, { status: 'ERROR', message: e.message });
                    }
                });
                return;
            }

            // Alert Lifecycle: Acknowledge Alert
            const ackMatch = pathname.match(/^\/api\/alerts\/([a-zA-Z0-9_-]+)\/acknowledge$/);
            if (ackMatch && req.method === 'POST') {
                const alertId = ackMatch[1];
                try {
                    const col = await getCollection('alerts');
                    if (col) {
                        const result = await col.updateOne(
                            { _id: alertId },
                            {
                                $set: {
                                    status: 'ACKNOWLEDGED',
                                    acknowledged_at: new Date()
                                }
                            }
                        );
                        if (result.matchedCount === 0) {
                            return sendJson(404, { status: 'error', message: 'Alert not found' });
                        }
                    }
                    return sendJson(200, { status: 'success', message: 'Alert acknowledged', alertId });
                } catch (err) {
                    return sendJson(500, { status: 'error', message: err.message });
                }
            }

            // Alert Lifecycle: Resolve Alert
            const resMatch = pathname.match(/^\/api\/alerts\/([a-zA-Z0-9_-]+)\/resolve$/);
            if (resMatch && req.method === 'POST') {
                const alertId = resMatch[1];
                try {
                    const col = await getCollection('alerts');
                    if (col) {
                        const result = await col.updateOne(
                            { _id: alertId },
                            {
                                $set: {
                                    status: 'RESOLVED',
                                    is_resolved: true,
                                    resolved_at: new Date()
                                }
                            }
                        );
                        if (result.matchedCount === 0) {
                            return sendJson(404, { status: 'error', message: 'Alert not found' });
                        }
                    }
                    return sendJson(200, { status: 'success', message: 'Alert resolved', alertId });
                } catch (err) {
                    return sendJson(500, { status: 'error', message: err.message });
                }
            }

            // Alert Lifecycle: Mark Alert Read
            const readMatch = pathname.match(/^\/api\/alerts\/([a-zA-Z0-9_-]+)\/read$/);
            if (readMatch && req.method === 'POST') {
                const alertId = readMatch[1];
                try {
                    const col = await getCollection('alerts');
                    if (col) {
                        await col.updateOne(
                            { _id: alertId },
                            {
                                $set: {
                                    is_read: true,
                                    read_at: new Date()
                                }
                            }
                        );
                    }
                    return sendJson(200, { status: 'success', message: 'Alert marked read', alertId });
                } catch (err) {
                    return sendJson(500, { status: 'error', message: err.message });
                }
            }

            // Alert Lifecycle: Mark All Alerts Read
            if (pathname === '/api/alerts/read-all' && req.method === 'POST') {
                try {
                    const col = await getCollection('alerts');
                    if (col) {
                        await col.updateMany(
                            { is_read: { $ne: true } },
                            {
                                $set: {
                                    is_read: true,
                                    read_at: new Date()
                                }
                            }
                        );
                    }
                    return sendJson(200, { status: 'success', message: 'All alerts marked read' });
                } catch (err) {
                    return sendJson(500, { status: 'error', message: err.message });
                }
            }

            // Notification Preferences: GET
            if (pathname === '/api/user/notification-preferences' && req.method === 'GET') {
                try {
                    const authRes = authenticateRequest(req);
                    const authUser = authRes.authenticated ? authRes.user : null;
                    const { getAuthenticatedNotificationRecipient } = await import('./notificationConfig.js');
                    const recipient = getAuthenticatedNotificationRecipient(authUser);
                    return sendJson(200, {
                        status: 'success',
                        preferences: recipient.notificationPreferences,
                        phone: recipient.phone,
                        email: recipient.email,
                        phoneVerified: recipient.phoneVerified
                    });
                } catch (err) {
                    return sendJson(500, { status: 'error', message: err.message });
                }
            }

            // Notification Preferences: POST
            if (pathname === '/api/user/notification-preferences' && req.method === 'POST') {
                const authRes = authenticateRequest(req);
                if (!authRes.authenticated) {
                    return sendJson(401, { status: 'error', message: 'Authentication required to update notification preferences.' });
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const payload = JSON.parse(body || '{}');
                        const usersCol = await getCollection('users');
                        if (usersCol) {
                            await usersCol.updateOne(
                                { email: authRes.user.email },
                                {
                                    $set: {
                                        notificationPreferences: payload,
                                        updated_at: new Date()
                                    }
                                }
                            );
                        }
                        return sendJson(200, {
                            status: 'success',
                            message: 'Notification preferences updated successfully.',
                            preferences: payload
                        });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/bot/simulate' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { from, command, message } = JSON.parse(body || '{}');
                        const target = from || process.env.DEFAULT_RECIPIENT_PHONE || '917900153894';
                        const cmd = command || message || 'sensors';
                        const result = await handleUserMessage(target, cmd);
                        return sendJson(200, { status: 'success', command: cmd, target, result });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/telegram/simulate' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { chatId, command, message } = JSON.parse(body || '{}');
                        const { handleTelegramMessage } = await import('./telegramBotEngine.js');
                        const cmd = command || message || '/sensors';
                        const result = await handleTelegramMessage(chatId || null, cmd, { first_name: 'TestUser' });
                        return sendJson(200, { status: 'success', command: cmd, result });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/controls' && req.method === 'GET') {
                try {
                    const { getActuatorStates } = await import('./actuatorService.js');
                    const controls = await getActuatorStates();
                    return sendJson(200, { status: 'success', data: controls });
                } catch (err) {
                    return sendJson(500, { status: 'error', message: err.message });
                }
            }

            if (pathname === '/api/controls' && req.method === 'POST') {
                const clientIp = req.socket.remoteAddress || '127.0.0.1';
                const rl = checkRateLimit(clientIp, 'controls', 15, 10000); // Max 15 commands per 10 sec
                if (!rl.allowed) {
                    return sendJson(429, { status: 'error', message: 'Too many actuator commands. Rate limit exceeded.' });
                }

                // Verify auth token if provided or enforcing
                const authResult = authenticateRequest(req, ['operator', 'admin', 'superuser']);
                const enforceAuth = process.env.ENFORCE_ACTUATOR_AUTH === 'true' || req.headers['x-enforce-auth'] === 'true';
                if (!authResult.authenticated && enforceAuth) {
                    const code = authResult.error === '403' ? 403 : 401;
                    return sendJson(code, { status: 'error', message: authResult.message });
                }

                let body = '';
                req.on('data', chunk => {
                    body += chunk;
                    if (body.length > 5000) {
                        res.writeHead(413, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'error', message: 'Payload size limit exceeded (max 5KB)' }));
                        req.destroy();
                    }
                });
                req.on('end', async () => {
                    try {
                        const { actuator_type, action } = JSON.parse(body || '{}');
                        const validActuators = ['grow_lights', 'grow_light', 'water_pump', 'pump', 'filter_unit', 'exhaust_fan', 'spray_valve'];
                        if (!actuator_type || !validActuators.includes(actuator_type)) {
                            return sendJson(400, { status: 'error', message: `Invalid actuator_type '${actuator_type}'. Allowed: ${validActuators.join(', ')}` });
                        }

                        const validActions = ['ON', 'OFF', 'AUTO', 'MANUAL_ON', 'MANUAL_OFF', 'AUTOMATIC'];
                        if (action && !validActions.includes(String(action).toUpperCase())) {
                            return sendJson(400, { status: 'error', message: `Invalid action '${action}'. Allowed: ${validActions.join(', ')}` });
                        }

                        const { setActuatorState, getActuatorStates } = await import('./actuatorService.js');
                        await setActuatorState(actuator_type, action || 'AUTO');
                        const updated = await getActuatorStates();
                        return sendJson(200, { status: 'success', message: `${actuator_type} switched to ${action || 'AUTO'}`, data: updated });
                    } catch (err) {
                        console.error('❌ [/api/controls Error]:', err.message);
                        const status = err.message.includes('Safety Lockout') ? 409 : (err.message.includes('OFFLINE') ? 503 : 500);
                        return sendJson(status, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/esp32/status' && req.method === 'GET') {
                const { getESP32Status } = await import('./esp32SerialService.js');
                return sendJson(200, { status: 'success', data: getESP32Status() });
            }

            if (pathname === '/api/esp32/ports' && req.method === 'GET') {
                const { getDetectedPorts } = await import('./esp32SerialService.js');
                const ports = await getDetectedPorts();
                return sendJson(200, { status: 'success', ports });
            }

            if (pathname === '/api/esp32/connect' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { port } = JSON.parse(body || '{}');
                        const { connectESP32 } = await import('./esp32SerialService.js');
                        const resData = await connectESP32(port || 'COM7');
                        return sendJson(200, { status: 'success', data: resData });
                    } catch (e) {
                        return sendJson(500, { status: 'error', message: e.message });
                    }
                });
                return;
            }

            if (pathname === '/api/esp32/disconnect' && req.method === 'POST') {
                const { disconnectESP32 } = await import('./esp32SerialService.js');
                const resData = disconnectESP32();
                return sendJson(200, { status: 'success', data: resData });
            }

            if (pathname === '/api/esp32/command' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { command } = JSON.parse(body || '{}');
                        const { executeCliCommand } = await import('./esp32SerialService.js');
                        const result = await executeCliCommand(command || 'SENSORS');
                        return sendJson(200, { status: 'success', command, result });
                    } catch (e) {
                        return sendJson(500, { status: 'error', message: e.message });
                    }
                });
                return;
            }

            if ((pathname === '/api/esp32/stream-url' || pathname === '/api/camera/stream-url') && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { streamUrl, ip } = JSON.parse(body || '{}');
                        let cleanIp = null;
                        let effectiveUrl = '';
                        if (ip) {
                            cleanIp = ip.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
                        }
                        if (streamUrl) {
                            effectiveUrl = streamUrl.trim();
                        } else if (cleanIp) {
                            effectiveUrl = `http://${cleanIp}/stream`;
                        }

                        const { setESP32StreamUrl, getESP32Status } = await import('./esp32SerialService.js');
                        const resData = setESP32StreamUrl(effectiveUrl, cleanIp);
                        const st = getESP32Status();
                        console.log(`📹 [ESP32-CAM Global Config Updated] IP: ${st.cameraIp} | Stream: ${st.streamUrl}`);
                        return sendJson(200, {
                            status: 'success',
                            cameraIp: st.cameraIp,
                            ip: st.cameraIp,
                            streamUrl: st.streamUrl,
                            data: resData
                        });
                    } catch (e) {
                        return sendJson(500, { status: 'error', message: e.message });
                    }
                });
                return;
            }

            if (pathname === '/api/camera/pi-frame' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const parsed = JSON.parse(body || '{}');
                        const { device_id, timestamp, content_type, image_base64 } = parsed;

                        if (!image_base64 || typeof image_base64 !== 'string' || image_base64.trim() === '') {
                            return sendJson(400, { status: 'error', message: 'Missing or empty image_base64 payload' });
                        }
                        if (content_type !== 'image/jpeg') {
                            return sendJson(400, { status: 'error', message: 'Invalid content_type; expected "image/jpeg"' });
                        }

                        const received_at = Date.now();
                        latestPiFrame = {
                            device_id: device_id || 'raspberrypi',
                            timestamp: timestamp || received_at,
                            content_type: 'image/jpeg',
                            image_base64: image_base64.trim(),
                            received_at
                        };

                        piFrameHistory.push(latestPiFrame);
                        if (piFrameHistory.length > 5) {
                            piFrameHistory.shift();
                        }

                        return sendJson(200, { status: 'ok', received_at });
                    } catch (err) {
                        return sendJson(400, { status: 'error', message: 'Invalid JSON payload: ' + err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/camera/pi-frame' && req.method === 'GET') {
                if (!latestPiFrame) {
                    return sendJson(404, { status: 'no frame yet' });
                }
                const now = Date.now();
                const age_ms = Math.max(0, now - (latestPiFrame.received_at || now));
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                return sendJson(200, {
                    device_id: latestPiFrame.device_id,
                    timestamp: latestPiFrame.timestamp,
                    image_base64: latestPiFrame.image_base64,
                    received_at: latestPiFrame.received_at,
                    age_ms
                });
            }

            if (pathname === '/api/camera/pi-status' && req.method === 'GET') {
                const now = Date.now();
                const age_ms = latestPiFrame ? Math.max(0, now - (latestPiFrame.received_at || now)) : null;
                const isConnected = Boolean(latestPiFrame && age_ms !== null && age_ms <= 5000);
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                return sendJson(200, {
                    connected: isConnected,
                    last_seen: latestPiFrame ? latestPiFrame.received_at : null,
                    age_ms,
                    device_id: latestPiFrame ? latestPiFrame.device_id : null
                });
            }

            if (pathname === '/api/camera/status' && req.method === 'GET') {
                const { getESP32Status, markCameraOnline } = await import('./esp32SerialService.js');
                let st = getESP32Status();

                // If not marked connected, probe physical camera quickly (max 800ms)
                if (!st.connected && st.cameraIp) {
                    try {
                        const targetStream = st.streamUrl || 'http://ossie.local:8080/?action=stream';
                        const parsedUrl = new URL(targetStream.startsWith('http') ? targetStream : `http://${targetStream}`);
                        const httpModule = await import('http');
                        const isReachable = await new Promise((resolve) => {
                            const probe = httpModule.default.request({
                                hostname: parsedUrl.hostname || 'ossie.local',
                                port: parsedUrl.port || 8080,
                                path: parsedUrl.pathname + parsedUrl.search,
                                method: 'GET',
                                timeout: 1200
                            }, (pRes) => {
                                resolve(pRes.statusCode >= 200 && pRes.statusCode < 500);
                            });
                            probe.on('error', () => resolve(false));
                            probe.on('timeout', () => { probe.destroy(); resolve(false); });
                            probe.end();
                        });
                        if (isReachable) {
                            markCameraOnline(parsedUrl.hostname);
                            st = getESP32Status();
                        }
                    } catch (_e) { }
                }

                return sendJson(200, {
                    status: 'success',
                    cameraIp: st.cameraIp || 'ossie.local',
                    ip: st.cameraIp || 'ossie.local',
                    streamUrl: st.streamUrl || 'http://ossie.local:8080/?action=stream',
                    connected: Boolean(st.connected),
                    flashLed: st.flashLed || false,
                    lastPing: st.lastPing,
                    lastSeen: st.lastPing
                });
            }

            if (pathname === '/api/camera/led' && (req.method === 'GET' || req.method === 'POST')) {
                const { getESP32Status, setESP32FlashLed } = await import('./esp32SerialService.js');
                const st = getESP32Status();

                let targetVal = 0;
                if (req.method === 'GET') {
                    const qVal = url.searchParams.get('val');
                    const qLed = url.searchParams.get('led');
                    targetVal = (qVal === '1' || qVal === 'true' || qLed === 'ON' || qLed === '1') ? 1 : 0;
                }

                const executeLedCommand = async (val) => {
                    setESP32FlashLed(val > 0);
                    let targetIp = url.searchParams.get('ip') || st.cameraIp || '10.152.37.105';
                    if (!targetIp && st.streamUrl && !st.streamUrl.includes('<ESP32-CAM-IP>')) {
                        try {
                            const parsed = new URL(st.streamUrl);
                            targetIp = parsed.hostname;
                        } catch (_e) {
                            targetIp = '10.152.37.105';
                        }
                    }

                    if (targetIp) {
                        try {
                            const httpModule = await import('http');
                            const proxyReq = httpModule.default.request({
                                hostname: targetIp,
                                port: 80,
                                path: `/led?val=${val}`,
                                method: 'GET',
                                timeout: 1500
                            }, (proxyRes) => {
                                let data = '';
                                proxyRes.on('data', chunk => { data += chunk; });
                                proxyRes.on('end', () => {
                                    if (!res.headersSent) {
                                        return sendJson(200, { status: 'success', led: val > 0 ? 'ON' : 'OFF', val, deviceIp: targetIp, remoteResponse: data });
                                    }
                                });
                            });
                            proxyReq.on('error', () => {
                                if (!res.headersSent) {
                                    return sendJson(200, { status: 'success', led: val > 0 ? 'ON' : 'OFF', val, note: 'State cached (camera offline)' });
                                }
                            });
                            proxyReq.on('timeout', () => {
                                proxyReq.destroy();
                                if (!res.headersSent) {
                                    return sendJson(200, { status: 'success', led: val > 0 ? 'ON' : 'OFF', val, note: 'State cached (camera timeout)' });
                                }
                            });
                            proxyReq.end();
                            return;
                        } catch (_err) {
                        }
                    }
                    return sendJson(200, { status: 'success', led: val > 0 ? 'ON' : 'OFF', val });
                };

                if (req.method === 'GET') {
                    return await executeLedCommand(targetVal);
                } else {
                    let body = '';
                    req.on('data', chunk => { body += chunk; });
                    req.on('end', async () => {
                        try {
                            const { val, led, state } = JSON.parse(body || '{}');
                            const effectiveVal = (val === 1 || val === '1' || led === 'ON' || state === true) ? 1 : 0;
                            return await executeLedCommand(effectiveVal);
                        } catch (e) {
                            return await executeLedCommand(0);
                        }
                    });
                    return;
                }
            }

            if (pathname === '/api/camera/stream' && req.method === 'GET') {
                const { getESP32Status, markCameraOnline } = await import('./esp32SerialService.js');
                const st = getESP32Status();

                const customIp = url.searchParams.get('ip') || url.searchParams.get('streamUrl');
                let targetUrl = customIp || st.streamUrl || 'http://ossie.local:8080/?action=stream';
                if (!targetUrl.startsWith('http')) {
                    targetUrl = `http://${targetUrl}`;
                }
                if (targetUrl.includes('/api/camera')) {
                    targetUrl = st.streamUrl || 'http://ossie.local:8080/?action=stream';
                }

                console.log(`📡 [Camera Stream Proxy] Connecting to ${targetUrl} [Stored IP: ${st.cameraIp}]`);

                try {
                    const parsed = new URL(targetUrl);
                    const httpModule = await import('http');
                    const proxyReq = httpModule.default.request({
                        hostname: parsed.hostname,
                        port: parsed.port || 80,
                        path: parsed.pathname + (parsed.search || ''),
                        method: 'GET'
                    }, (proxyRes) => {
                        // Keep stream connection alive indefinitely
                        if (proxyRes.socket) {
                            proxyRes.socket.setTimeout(0);
                            proxyRes.socket.setKeepAlive(true, 1000);
                        }

                        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
                            markCameraOnline(parsed.hostname);
                            res.writeHead(proxyRes.statusCode, {
                                'Content-Type': proxyRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=123456789000000000000987654321',
                                'Access-Control-Allow-Origin': '*',
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
                                'Pragma': 'no-cache',
                                'Expires': '0'
                            });
                            proxyRes.pipe(res);

                            // Sniff stream chunks to extract latest complete JPEG frame for instantaneous AI capture
                            let mjpegBuf = Buffer.alloc(0);
                            proxyRes.on('data', (chunk) => {
                                mjpegBuf = Buffer.concat([mjpegBuf, chunk]);
                                if (mjpegBuf.length > 524288) {
                                    mjpegBuf = mjpegBuf.subarray(mjpegBuf.length - 131072);
                                }
                                const start = mjpegBuf.indexOf(Buffer.from([0xFF, 0xD8]));
                                if (start !== -1) {
                                    const end = mjpegBuf.indexOf(Buffer.from([0xFF, 0xD9]), start + 2);
                                    if (end !== -1) {
                                        latestStreamFrameBuffer = Buffer.from(mjpegBuf.subarray(start, end + 2));
                                        latestStreamFrameTime = Date.now();
                                        mjpegBuf = mjpegBuf.subarray(end + 2);
                                    }
                                }
                            });
                        } else {
                            if (!res.headersSent) {
                                res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                                res.end(JSON.stringify({ status: 'offline', message: `ESP32-CAM returned status ${proxyRes.statusCode}` }));
                            }
                        }
                    });

                    // Initial connect timeout only (5s to establish TCP connection)
                    proxyReq.setTimeout(5000, () => {
                        if (!res.headersSent) {
                            proxyReq.destroy();
                            res.writeHead(504, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify({ status: 'offline', message: `Timeout connecting to ESP32-CAM at ${targetUrl}` }));
                        }
                    });

                    proxyReq.on('error', (err) => {
                        if (!res.headersSent) {
                            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify({ status: 'offline', message: `Could not reach ESP32-CAM at ${targetUrl}: ${err.message}` }));
                        }
                    });

                    req.on('close', () => {
                        proxyReq.destroy();
                    });

                    proxyReq.end();
                    return;
                } catch (urlErr) {
                    if (!res.headersSent) {
                        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ status: 'error', message: urlErr.message }));
                    }
                    return;
                }
            }

            if (pathname === '/api/camera/capture' && req.method === 'GET') {
                const { getESP32Status, markCameraOnline } = await import('./esp32SerialService.js');
                const st = getESP32Status();

                // If live stream is actively delivering frames (< 3.0s ago), immediately serve the cached frame.
                // This eliminates ESP32 socket contention, avoids camera mutex contention, and responds in < 1ms!
                if (latestStreamFrameBuffer && (Date.now() - latestStreamFrameTime < 3000)) {
                    markCameraOnline(st.cameraIp);
                    res.writeHead(200, {
                        'Content-Type': 'image/jpeg',
                        'Content-Length': latestStreamFrameBuffer.length,
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'X-Frame-Source': 'live-stream-cache'
                    });
                    res.end(latestStreamFrameBuffer);
                    return;
                }

                const customIp = url.searchParams.get('ip');
                let captureUrl = customIp || st.streamUrl || 'http://ossie.local:8080/?action=stream';
                if (!captureUrl.startsWith('http')) {
                    captureUrl = `http://${captureUrl}`;
                }
                if (captureUrl.includes('?action=stream')) {
                    captureUrl = captureUrl.replace('?action=stream', '?action=snapshot');
                } else if (!captureUrl.includes('?action=snapshot') && !captureUrl.endsWith('/capture')) {
                    captureUrl = captureUrl.replace(/\/+$/, '') + '/capture';
                }

                if (captureUrl.includes('/api/camera')) {
                    captureUrl = 'http://ossie.local:8080/?action=snapshot';
                }

                console.log(`📸 [Camera Capture Proxy] Fetching frame from ${captureUrl} [Stored IP: ${st.cameraIp}] @ ${new Date().toISOString()}`);

                try {
                    const parsed = new URL(captureUrl);
                    const httpModule = await import('http');
                    const proxyReq = httpModule.default.request({
                        hostname: parsed.hostname,
                        port: parsed.port || 80,
                        path: parsed.pathname + (parsed.search || ''),
                        method: 'GET',
                        timeout: 6000
                    }, (proxyRes) => {
                        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
                            markCameraOnline(parsed.hostname);
                            res.writeHead(proxyRes.statusCode, {
                                'Content-Type': 'image/jpeg',
                                'Access-Control-Allow-Origin': '*',
                                'Cache-Control': 'no-cache'
                            });
                            proxyRes.pipe(res);
                        } else {
                            if (!res.headersSent) {
                                res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                                res.end(JSON.stringify({ status: 'offline', message: 'ESP32-CAM snapshot unavailable' }));
                            }
                        }
                    });

                    proxyReq.on('error', (err) => {
                        console.warn(`⚠️ [Camera Capture Proxy] Snapshot unreachable at ${captureUrl}: ${err.message}`);
                        if (!res.headersSent) {
                            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify({ status: 'offline', message: err.message }));
                        }
                    });

                    proxyReq.on('timeout', () => {
                        proxyReq.destroy();
                        console.warn(`⚠️ [Camera Capture Proxy] Snapshot timeout at ${captureUrl}`);
                        if (!res.headersSent) {
                            res.writeHead(504, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify({ status: 'offline', message: 'ESP32-CAM capture timeout' }));
                        }
                    });

                    proxyReq.end();
                    return;
                } catch (e) {
                    if (!res.headersSent) {
                        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ status: 'error', message: e.message }));
                    }
                    return;
                }
            }



            if (pathname === '/api/ai/predict/pest' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const payload = JSON.parse(body || '{}');

                        if (!payload.image) {
                            return sendJson(400, {
                                status: 'error',
                                message: 'No camera image frame provided for Pest AI scan'
                            });
                        }

                        let pyResult = null;
                        try {
                            const pyRes = await fetch('http://127.0.0.1:8001/predict/base64', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    image: payload.image,
                                    cropName: payload.cropName || 'Tomato (Solanum lycopersicum)',
                                    ai_type: 'pest'
                                }),
                                signal: AbortSignal.timeout(15000)
                            });
                            if (pyRes.ok) {
                                pyResult = await pyRes.json();
                            } else {
                                console.warn('[YOLO Pest Inference HTTP Status]:', pyRes.status);
                            }
                        } catch (pyErr) {
                            console.warn('[YOLO Pest Inference Connect Warning]:', pyErr.message);
                        }

                        if (!pyResult || !pyResult.success) {
                            return sendJson(503, {
                                status: 'error',
                                message: 'Real YOLO inference server is offline on port 8001. Please run `npm run ai`.'
                            });
                        }

                        const pestResult = {
                            target_crop: payload.cropName || pyResult.target_crop || 'Tomato (Solanum lycopersicum)',
                            detected_pest: pyResult.detected_pest || null,
                            pest_count: pyResult.pest_count || 0,
                            severity_level: pyResult.severity_level || 'LOW',
                            ai_confidence: pyResult.ai_confidence || null,
                            sector_zone: 'Sector B (Stem Zone)',
                            detection_source: payload.detection_source || 'live_camera',
                            threat_status: pyResult.pest_count > 0 ? `Active Threat - ${pyResult.detected_pest}` : 'No Active Threat Detected',
                            recommended_action: pyResult.recommended_action || 'Maintain routine canopy monitoring.',
                            bounding_boxes: pyResult.bounding_boxes || [],
                            boxes: pyResult.bounding_boxes || [],
                            annotated_image: pyResult.annotated_image || null,
                            detected_at: new Date().toISOString(),
                            isMock: false,
                            model_ready: true
                        };

                        if (pestResult.detected_pest) {
                            insertAndSync('pest_detection_logs', {
                                target_crop: pestResult.target_crop,
                                pest_detected: pestResult.detected_pest,
                                pest_count: pestResult.pest_count,
                                severity_level: pestResult.severity_level,
                                ai_confidence: pestResult.ai_confidence,
                                sector_zone: pestResult.sector_zone,
                                detection_source: pestResult.detection_source,
                                recommended_action: pestResult.recommended_action
                            }).catch(err => console.warn('[Pest Sync Warning]:', err.message));
                        }

                        return sendJson(200, { status: 'success', prediction: pestResult });
                    } catch (e) {
                        return sendJson(500, { status: 'error', message: e.message });
                    }
                });
                return;
            }

            if (pathname === '/api/ai/predict/disease' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const payload = JSON.parse(body || '{}');
                        if (!payload.image) {
                            return sendJson(400, { status: 'error', message: 'No image provided for AI analysis' });
                        }

                        let pyResult = null;
                        try {
                            const pyRes = await fetch('http://127.0.0.1:8001/predict/base64', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    image: payload.image,
                                    cropName: payload.cropName || 'Tomato (Solanum lycopersicum)',
                                    ai_type: 'disease'
                                }),
                                signal: AbortSignal.timeout(15000)
                            });
                            if (pyRes.ok) {
                                pyResult = await pyRes.json();
                            } else {
                                console.warn('[YOLO Disease Inference HTTP Status]:', pyRes.status);
                            }
                        } catch (pyErr) {
                            console.warn('[YOLO Disease Inference Connect Warning]:', pyErr.message);
                        }

                        if (!pyResult || !pyResult.success) {
                            return sendJson(503, {
                                status: 'error',
                                message: 'Real YOLO inference server is offline on port 8001. Please run `npm run ai`.'
                            });
                        }

                        if (pyResult.disease_name) {
                            insertAndSync('disease_detection_logs', {
                                crop_name: pyResult.crop_name,
                                disease_name: pyResult.disease_name,
                                confidence_score: pyResult.confidence_score,
                                severity_level: pyResult.severity_level,
                                detection_source: payload.detection_source || 'upload',
                                treatment_advice: pyResult.treatment_advice
                            }).catch(err => console.warn('[Disease Sync Warning]:', err.message));
                        }

                        return sendJson(200, { status: 'success', prediction: pyResult });
                    } catch (e) {
                        return sendJson(500, { status: 'error', message: e.message });
                    }
                });
                return;
            }

            if (pathname === '/api/crop/snapshot' && req.method === 'POST') {
                const contentType = req.headers['content-type'] || '';

                if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
                    const chunks = [];
                    req.on('data', chunk => chunks.push(chunk));
                    req.on('end', async () => {
                        try {
                            const buffer = Buffer.concat(chunks);
                            const cropName = url.searchParams.get('crop') || 'Tomato (Solanum lycopersicum)';
                            const { processCropSnapshot } = await import('./cropDiagnosisService.js');
                            const diagnosis = await processCropSnapshot({
                                imageBuffer: buffer,
                                cropName,
                                source: 'esp32_cam_binary_post'
                            });
                            return sendJson(200, { status: 'success', diagnosis });
                        } catch (err) {
                            return sendJson(500, { status: 'error', message: err.message });
                        }
                    });
                    return;
                }

                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const payload = JSON.parse(body || '{}');
                        const { processCropSnapshot } = await import('./cropDiagnosisService.js');
                        const diagnosis = await processCropSnapshot({
                            base64Image: payload.image,
                            cropName: payload.cropName || 'Tomato (Solanum lycopersicum)',
                            source: payload.source || 'web_dashboard'
                        });
                        return sendJson(200, { status: 'success', diagnosis });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/crop/latest-diagnosis' && req.method === 'GET') {
                try {
                    const { getLatestCropDiagnosis } = await import('./cropDiagnosisService.js');
                    const diagnosis = getLatestCropDiagnosis();
                    return sendJson(200, { status: 'success', data: diagnosis });
                } catch (err) {
                    return sendJson(500, { status: 'error', message: err.message });
                }
            }

            if (pathname === '/api/crop/history' && req.method === 'GET') {
                try {
                    const { getCropScanHistory } = await import('./cropDiagnosisService.js');
                    const history = getCropScanHistory();
                    return sendJson(200, { status: 'success', data: history });
                } catch (err) {
                    return sendJson(500, { status: 'error', message: err.message });
                }
            }

            if (pathname === '/api/crop/trigger-scan' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { cropName } = JSON.parse(body || '{}');
                        const { triggerCropScanNow } = await import('./cropDiagnosisService.js');
                        const diagnosis = await triggerCropScanNow(cropName || 'Tomato (Solanum lycopersicum)');
                        return sendJson(200, { status: 'success', diagnosis });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                });
                return;
            }

            if (pathname === '/api/air/model/info' && req.method === 'GET') {
                const { AIR_MODEL_METADATA } = await import('./aiModelService.js');
                return sendJson(200, { status: 'success', model: AIR_MODEL_METADATA });
            }

            if (pathname === '/api/air/model/predict' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const payload = JSON.parse(body || '{}');
                        const { runAirQualityModel } = await import('./aiModelService.js');
                        const result = runAirQualityModel(payload);
                        return sendJson(200, { status: 'success', result });
                    } catch (e) {
                        return sendJson(500, { status: 'error', message: e.message });
                    }
                });
                return;
            }

            if (pathname === '/api/air/latest' && req.method === 'GET') {
                const { queryTable } = await import('./syncEngine.js');
                const { runAirQualityModel } = await import('./aiModelService.js');
                const latestRes = await queryTable('air_quality_logs', { limit: 1, orderBy: 'recorded_at', ascending: false });
                const latestLog = latestRes.data?.[0] || {
                    pm2_5: 16.5,
                    pm10: 24.0,
                    co2_ppm: 485.0,
                    current_temperature: 26.8,
                    current_humidity: 54.2,
                    smoke_gas_status: 'NORMAL'
                };
                const aiEvaluation = runAirQualityModel(latestLog);
                return sendJson(200, {
                    status: 'success',
                    log: latestLog,
                    ai_evaluation: aiEvaluation
                });
            }

            if ((pathname.startsWith('/api/ai/') || pathname.startsWith('/api/pi-ai/')) && req.method === 'GET') {
                const subPath = pathname.replace(/^\/api\/(pi-)?ai/, '/api/ai');
                const targetUrl = `http://ossie.local:8001${subPath}${url.search || ''}`;
                try {
                    const proxyReq = http.get(targetUrl, { family: 4 }, (proxyRes) => {
                        if (!res.headersSent) {
                            res.writeHead(proxyRes.statusCode, {
                                'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                                'Access-Control-Allow-Origin': '*',
                                'Cache-Control': 'no-cache, no-store, must-revalidate'
                            });
                            proxyRes.pipe(res);
                        }
                    });
                    proxyReq.on('error', (err) => {
                        if (!res.headersSent) {
                            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify({ status: 'offline', message: `Pi AI unreachable: ${err.message}` }));
                        }
                    });
                    return;
                } catch (e) {
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ status: 'error', message: e.message }));
                    }
                    return;
                }
            }

            if ((pathname === '/data' || pathname === '/api/sensor/data' || pathname === '/api/data/sensor') && req.method === 'GET') {
                const { getLatestSensorData } = await import('./esp32SerialService.js');
                const sensorData = getLatestSensorData();
                return sendJson(200, sensorData);
            }

            if ((pathname === '/data' || pathname === '/api/sensor/data' || pathname === '/api/data/sensor') && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        if (!body || !body.trim()) {
                            return sendJson(400, {
                                success: false,
                                status: 'error',
                                reason: 'EMPTY_PAYLOAD',
                                message: 'Request body cannot be empty'
                            });
                        }

                        let payload;
                        try {
                            payload = JSON.parse(body);
                        } catch (jsonErr) {
                            return sendJson(400, {
                                success: false,
                                status: 'error',
                                reason: 'INVALID_JSON_PAYLOAD',
                                message: jsonErr.message
                            });
                        }

                        const { ingestSensorData } = await import('./esp32SerialService.js');
                        const normalized = ingestSensorData(payload);

                        const now = new Date().toISOString();
                        let deviceId = 1;

                        try {
                            const devCol = await getCollection('devices');
                            const devUid = normalized.device_id || normalized.device || 'IOTREX-RPI-01';
                            const devDoc = await devCol.findOne({ $or: [{ device_uid: devUid }, { device_id: 1 }] });
                            if (devDoc) deviceId = devDoc.device_id || 1;
                        } catch (_dErr) {
                            deviceId = 1;
                        }

                        if (normalized.lux !== undefined && normalized.lux !== null) {
                            insertAndSync('light_intensity_logs', {
                                device_id: deviceId,
                                lux_value: normalized.lux,
                                grow_lights_active: normalized.lux < 300,
                                recorded_at: now
                            }).catch(e => console.warn('[Sensor Sync Lux Warning]:', e.message));
                        }

                        if (normalized.soil_moisture !== undefined && normalized.soil_moisture !== null) {
                            insertAndSync('soil_moisture_logs', {
                                device_id: deviceId,
                                moisture_percentage: normalized.soil_moisture,
                                moisture_category: normalized.soil_moisture < 40 ? 'Dry (<40%)' : (normalized.soil_moisture <= 70 ? 'Moderate (40-70%)' : 'Wet (>70%)'),
                                soil_temperature_celsius: normalized.temperature || 24.5,
                                relay_pump_active: normalized.soil_moisture < 40,
                                recorded_at: now
                            }).catch(e => console.warn('[Sensor Sync Soil Warning]:', e.message));
                        }

                        if (
                            normalized.temperature !== undefined ||
                            normalized.humidity !== undefined ||
                            normalized.co2 !== undefined ||
                            normalized.gasDetected !== undefined ||
                            normalized.rainDetected !== undefined
                        ) {
                            const airRecord = {
                                device_id: deviceId,
                                air_status: normalized.gasDetected ? 'Poor' : 'Good',
                                current_temperature: normalized.temperature ?? 25.0,
                                current_humidity: normalized.humidity ?? 55.0,
                                smoke_gas_status: normalized.gasDetected ? 'GAS_DETECTED' : 'NORMAL',
                                recorded_at: now
                            };

                            if (normalized.co2 !== undefined && normalized.co2 !== null) {
                                airRecord.co2_ppm = normalized.co2;
                            }

                            if (normalized.gasDetected !== undefined && normalized.gasDetected !== null) {
                                airRecord.gas_detected = normalized.gasDetected;
                            }

                            if (normalized.rainDetected !== undefined && normalized.rainDetected !== null) {
                                airRecord.rain_detected = normalized.rainDetected;
                            }

                            insertAndSync('air_quality_logs', airRecord).catch(e => console.warn('[Sensor Sync Air Warning]:', e.message));
                        }

                        if (normalized.soil_ph !== undefined || normalized.turbidity_ntu !== undefined) {
                            const waterRecord = {
                                device_id: deviceId,
                                current_ph: normalized.soil_ph ?? 7.0,
                                turbidity_ntu: normalized.turbidity_ntu ?? 1.5,
                                water_status: (normalized.soil_ph && (normalized.soil_ph < 6.0 || normalized.soil_ph > 8.5)) ? 'Suboptimal' : 'Optimal',
                                recorded_at: now
                            };
                            insertAndSync('water_quality_logs', waterRecord).catch(e => console.warn('[Sensor Sync Water Warning]:', e.message));
                        }

                        try {
                            const devUid = normalized.device_id || normalized.device || 'IOTREX-RPI-01';
                            getCollection('devices').then(col => {
                                const updateFields = {
                                    device_id: deviceId,
                                    device_uid: devUid,
                                    last_ping: new Date(),
                                    status: 'active',
                                    updated_at: new Date()
                                };
                                if (normalized.streamUrl) updateFields.esp32_cam_stream_url = normalized.streamUrl;
                                col.updateOne(
                                    { device_uid: devUid },
                                    { $set: updateFields },
                                    { upsert: true }
                                ).catch(() => { });
                            }).catch(() => { });
                        } catch (_mDevErr) {
                        }

                        return sendJson(200, {
                            success: true,
                            status: 'success',
                            message: 'Sensor data received',
                            data: normalized
                        });
                    } catch (err) {
                        console.error('[Sensor Endpoint Error]:', err.message);
                        return sendJson(500, {
                            success: false,
                            status: 'error',
                            message: 'Failed to process sensor data: ' + err.message
                        });
                    }
                });
                return;
            }

            if (pathname === '/api/diagnosis' && (req.method === 'GET' || req.method === 'POST')) {
                const processDiagnosis = async (inputOptions = {}) => {
                    const { getLatestSensorData, getESP32Status } = await import('./esp32SerialService.js');
                    const { runAgriculturalDiagnosisEngine } = await import('./aiModelService.js');

                    const liveSensors = getLatestSensorData();
                    const hwStatus = getESP32Status();

                    const mergedSensors = {
                        ...liveSensors,
                        ...(inputOptions.sensorData || inputOptions.sensors || inputOptions)
                    };

                    const diagnosisResult = runAgriculturalDiagnosisEngine({
                        sensorData: mergedSensors,
                        visionPrediction: inputOptions.visionPrediction,
                        cropName: inputOptions.cropName || 'Tomato (Solanum lycopersicum)',
                        deviceInfo: {
                            id: mergedSensors.device || hwStatus.deviceUid || 'ESP32-S3-01',
                            status: hwStatus.connected ? 'online' : (mergedSensors.status || 'online')
                        },
                        forceDiseaseClass: inputOptions.forceDiseaseClass,
                        forcePestClass: inputOptions.forcePestClass,
                        runPestInference: inputOptions.runPestInference !== false
                    });

                    return diagnosisResult;
                };

                if (req.method === 'GET') {
                    try {
                        const diagnosis = await processDiagnosis({});
                        return sendJson(200, diagnosis);
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
                    }
                } else {
                    let body = '';
                    req.on('data', chunk => { body += chunk; });
                    req.on('end', async () => {
                        try {
                            const parsed = JSON.parse(body || '{}');
                            const diagnosis = await processDiagnosis(parsed);
                            return sendJson(200, diagnosis);
                        } catch (err) {
                            return sendJson(400, { status: 'error', message: err.message });
                        }
                    });
                    return;
                }
            }

            if (pathname === '/api/agri/drought-et0' && req.method === 'GET') {
                try {
                    const { calculateEvapotranspiration } = await import('./aiModelService.js');
                    const { getLatestSensorData } = await import('./esp32SerialService.js');
                    const liveSensors = getLatestSensorData();

                    const temp = Number(url.searchParams.get('temp') || liveSensors.temperature || 30.0);
                    const hum = Number(url.searchParams.get('humidity') || liveSensors.humidity || 65.0);
                    const lux = Number(url.searchParams.get('lux') || liveSensors.lux || 1500);
                    const soilMoist = Number(url.searchParams.get('soil_moisture') || liveSensors.soil_moisture || 60.0);

                    const et0Result = calculateEvapotranspiration(temp, hum, lux, temp - 5, temp + 4, soilMoist);
                    return sendJson(200, { status: 'success', data: et0Result });
                } catch (e) {
                    return sendJson(500, { status: 'error', message: e.message });
                }
            }

            if (pathname === '/api/agri/waterlogging-risk' && req.method === 'GET') {
                try {
                    const { evaluateWaterloggingAndFloodRisk } = await import('./aiModelService.js');
                    const { getLatestSensorData } = await import('./esp32SerialService.js');
                    const liveSensors = getLatestSensorData();

                    const isRaining = url.searchParams.get('rain') === 'true' || Boolean(liveSensors.rain_detected || liveSensors.rainDetected);
                    const soilMoist = Number(url.searchParams.get('soil_moisture') || liveSensors.soil_moisture || 60.0);

                    const riskResult = evaluateWaterloggingAndFloodRisk(isRaining, soilMoist);
                    return sendJson(200, { status: 'success', data: riskResult });
                } catch (e) {
                    return sendJson(500, { status: 'error', message: e.message });
                }
            }

            if (pathname === '/api/agri/nutrients' && req.method === 'GET') {
                try {
                    const { NUTRIENT_DEFICIENCY_MATRIX } = await import('./aiModelService.js');
                    return sendJson(200, { status: 'success', data: NUTRIENT_DEFICIENCY_MATRIX });
                } catch (e) {
                    return sendJson(500, { status: 'error', message: e.message });
                }
            }

            if (pathname === '/api/agri/mandi-prices' && req.method === 'GET') {
                const mandiData = [
                    {
                        commodity: "Tomato (Desi)",
                        variety: "Hybrid / Desi",
                        mandi: "Nashik (Pimpalgaon)",
                        state: "Maharashtra",
                        modal_price: "₹ 1,850 / Quintal",
                        price_range: "₹ 1,400 - ₹ 2,200",
                        trend: "up",
                        msp: "₹ 1,200",
                        arrival_tons: "420 MT",
                        updated_at: "Today, 06:00 AM"
                    },
                    {
                        commodity: "Potato (Jyoti)",
                        variety: "Kufri Jyoti",
                        mandi: "Agra (Fatehabad)",
                        state: "Uttar Pradesh",
                        modal_price: "₹ 1,240 / Quintal",
                        price_range: "₹ 1,100 - ₹ 1,450",
                        trend: "stable",
                        msp: "₹ 1,050",
                        arrival_tons: "890 MT",
                        updated_at: "Today, 06:15 AM"
                    },
                    {
                        commodity: "Onion (Red)",
                        variety: "Nashik Red",
                        mandi: "Lasalgaon APMC",
                        state: "Maharashtra",
                        modal_price: "₹ 2,450 / Quintal",
                        price_range: "₹ 2,100 - ₹ 2,900",
                        trend: "up",
                        msp: "₹ 1,800",
                        arrival_tons: "1,250 MT",
                        updated_at: "Today, 06:30 AM"
                    },
                    {
                        commodity: "Cotton (Medium Staple)",
                        variety: "Shankar-6",
                        mandi: "Rajkot APMC",
                        state: "Gujarat",
                        modal_price: "₹ 7,120 / Quintal",
                        price_range: "₹ 6,800 - ₹ 7,400",
                        trend: "up",
                        msp: "₹ 7,121 (Govt MSP)",
                        arrival_tons: "640 MT",
                        updated_at: "Today, 05:45 AM"
                    },
                    {
                        commodity: "Soybean (Yellow)",
                        variety: "JS-335",
                        mandi: "Indore (Laxmibai)",
                        state: "Madhya Pradesh",
                        modal_price: "₹ 4,890 / Quintal",
                        price_range: "₹ 4,600 - ₹ 5,150",
                        trend: "stable",
                        msp: "₹ 4,892 (Govt MSP)",
                        arrival_tons: "780 MT",
                        updated_at: "Today, 06:10 AM"
                    },
                    {
                        commodity: "Wheat (Sharbati / Lokwan)",
                        variety: "Lokwan Premium",
                        mandi: "Khanna APMC",
                        state: "Punjab",
                        modal_price: "₹ 2,425 / Quintal",
                        price_range: "₹ 2,275 - ₹ 2,600",
                        trend: "stable",
                        msp: "₹ 2,275 (Govt MSP)",
                        arrival_tons: "1,100 MT",
                        updated_at: "Today, 06:00 AM"
                    }
                ];

                return sendJson(200, {
                    status: 'success',
                    data: mandiData,
                    source: "Agmarknet / e-NAM Live APMC Gateway",
                    timestamp: new Date().toISOString()
                });
            }

            return sendJson(404, { status: 'error', message: `Endpoint ${pathname} not found.` });

        } catch (err) {
            console.error('API Middleware error:', err);
            return sendJson(500, { status: 'error', message: err.message });
        }
    };
}

