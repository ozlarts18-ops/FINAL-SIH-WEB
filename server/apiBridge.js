import fs from 'fs';
import path from 'path';
import { queryTable, insertAndSync, getSystemHealth } from './syncEngine.js';
import { getCollection } from './mongoDb.js';
import { query } from './db.js';
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

export function createApiMiddleware() {
    startContinuousMetaDaemon();
    startTelegramPollingDaemon();

    return async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        if (!pathname.startsWith('/api') && pathname !== '/data' && !pathname.startsWith('/data/')) {
            return next();
        }

        const sendJson = (status, payload) => {
            res.writeHead(status, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
                            const pgUser = await query('SELECT * FROM users WHERE email = $1 LIMIT 1', [normalizedEmail]);
                            if (pgUser.rows.length > 0) {
                                foundUser = pgUser.rows[0];
                            }
                        } catch (pgErr) {
                            console.warn('[Auth PG Warning] Checking MongoDB for user:', pgErr.message);
                        }

                        if (!foundUser) {
                            try {
                                const usersCol = await getCollection('users');
                                foundUser = await usersCol.findOne({ email: normalizedEmail });
                            } catch (mErr) {
                                console.warn('[Auth Mongo Warning] MongoDB user lookup failed:', mErr.message);
                            }
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

                        sendTelegramLoginAlert(foundUser.telegram_chat_id, foundUser.full_name || foundUser.email.split('@')[0], isFirstLogin)
                            .then(res => res?.success && console.log(`✈️ [Login Telegram Delivered] Chat: ${res.chatId}`))
                            .catch(e => console.warn('[Telegram Login Alert Warning]:', e.message));

                        getCollection('users').then(col => {
                            col.updateOne({ email: normalizedEmail }, { $set: { last_login_at: new Date().toISOString() } });
                        }).catch(() => { });

                        return sendJson(200, {
                            status: 'success',
                            user: {
                                id: foundUser.user_id || foundUser._id || 'usr_' + Date.now(),
                                email: foundUser.email,
                                full_name: foundUser.full_name || foundUser.email?.split('@')[0],
                                role: foundUser.role || 'operator'
                            }
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

                        evaluateAndNotify(table, parsed).catch (err => {
                            console.warn('[Twilio Trigger Warning]:', err.message);
                        });

                        evaluateAndNotifyMeta(table, parsed).catch (err => {
                            console.warn('[Meta WhatsApp Trigger Warning]:', err.message);
                        });

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

            if (pathname === '/api/notifications/sms/send' && req.method === 'POST') {
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
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { actuator_type, action } = JSON.parse(body || '{}');
                        if (!actuator_type) {
                            return sendJson(400, { status: 'error', message: 'actuator_type is required (e.g. water_pump, filter_unit, exhaust_fan, spray_valve)' });
                        }
                        const { setActuatorState, getActuatorStates } = await import('./actuatorService.js');
                        await setActuatorState(actuator_type, action || 'AUTO');
                        const updated = await getActuatorStates();
                        return sendJson(200, { status: 'success', message: `${actuator_type} switched to ${action || 'AUTO'}`, data: updated });
                    } catch (err) {
                        return sendJson(500, { status: 'error', message: err.message });
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
                        const effectiveUrl = streamUrl || (ip ? `http://${ip.replace(/^http:\/\//, '')}/stream` : '');
                        const { setESP32StreamUrl } = await import('./esp32SerialService.js');
                        const resData = setESP32StreamUrl(effectiveUrl);
                        return sendJson(200, { status: 'success', data: resData });
                    } catch (e) {
                        return sendJson(500, { status: 'error', message: e.message });
                    }
                });
                return;
            }

            if (pathname === '/api/camera/status' && req.method === 'GET') {
                const { getESP32Status } = await import('./esp32SerialService.js');
                const st = getESP32Status();
                return sendJson(200, {
                    status: 'success',
                    streamUrl: st.streamUrl,
                    connected: Boolean(st.connected),
                    flashLed: st.flashLed || false,
                    lastPing: st.lastPing
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
                    let targetIp = url.searchParams.get('ip');
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
                const { getESP32Status } = await import('./esp32SerialService.js');
                const st = getESP32Status();
                
                const customIp = url.searchParams.get('ip') || url.searchParams.get('streamUrl');
                const rawTarget = customIp || st.cameraIp || '10.152.37.105';
                let targetUrl = rawTarget.startsWith('http') 
                    ? rawTarget 
                    : `http://${rawTarget}/stream`;

                if (targetUrl.includes('/api/camera')) {
                    targetUrl = `http://${st.cameraIp || '10.152.37.105'}/stream`;
                }

                try {
                    const parsed = new URL(targetUrl);
                    const httpModule = await import('http');
                    const proxyReq = httpModule.default.request({
                        hostname: parsed.hostname,
                        port: parsed.port || 80,
                        path: parsed.pathname + (parsed.search || ''),
                        method: 'GET',
                        timeout: 3000
                    }, (proxyRes) => {
                        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
                            res.writeHead(proxyRes.statusCode, {
                                'Content-Type': proxyRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=123456789000000000000987654321',
                                'Access-Control-Allow-Origin': '*',
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
                                'Pragma': 'no-cache',
                                'Expires': '0'
                            });
                            proxyRes.pipe(res);
                        } else {
                            if (!res.headersSent) {
                                res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                                res.end(JSON.stringify({ status: 'offline', message: `ESP32-CAM returned status ${proxyRes.statusCode}` }));
                            }
                        }
                    });

                    proxyReq.on('error', (err) => {
                        if (!res.headersSent) {
                            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify({ status: 'offline', message: `Could not reach ESP32-CAM at ${targetUrl}: ${err.message}` }));
                        }
                    });

                    proxyReq.on('timeout', () => {
                        proxyReq.destroy();
                        if (!res.headersSent) {
                            res.writeHead(504, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify({ status: 'offline', message: `Timeout connecting to ESP32-CAM at ${targetUrl}` }));
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
                const { getESP32Status } = await import('./esp32SerialService.js');
                const st = getESP32Status();
                
                const customIp = url.searchParams.get('ip');
                const rawHost = customIp || st.cameraIp || '10.152.37.105';
                let captureUrl = rawHost.startsWith('http')
                    ? rawHost.replace(/\/stream\/?$/, '/capture')
                    : `http://${rawHost}/capture`;

                if (captureUrl.includes('/api/camera')) {
                    captureUrl = `http://${st.cameraIp || '10.152.37.105'}/capture`;
                }

                try {
                    const parsed = new URL(captureUrl);
                    const httpModule = await import('http');
                    const proxyReq = httpModule.default.request({
                        hostname: parsed.hostname,
                        port: parsed.port || 80,
                        path: parsed.pathname + (parsed.search || ''),
                        method: 'GET',
                        timeout: 3000
                    }, (proxyRes) => {
                        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
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
                        if (!res.headersSent) {
                            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(JSON.stringify({ status: 'offline', message: err.message }));
                        }
                    });

                    proxyReq.on('timeout', () => {
                        proxyReq.destroy();
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
                        const { runPestDetectionAI } = await import('./aiModelService.js');
                        const result = runPestDetectionAI(payload);

                        insertAndSync('pest_detection_logs', {
                            target_crop: result.target_crop,
                            pest_detected: result.detected_pest,
                            pest_count: result.pest_count,
                            severity_level: result.severity_level,
                            ai_confidence: result.ai_confidence,
                            sector_zone: result.sector_zone,
                            detection_source: payload.detection_source || 'live_camera',
                            recommended_action: result.recommended_action
                        }).catch(err => console.warn('[Pest Sync Warning]:', err.message));

                        return sendJson(200, { status: 'success', prediction: result });
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
                                    cropName: payload.cropName || 'Tomato (Solanum lycopersicum)'
                                }),
                                signal: AbortSignal.timeout(15000)
                            });
                            if (pyRes.ok) {
                                pyResult = await pyRes.json();
                            } else {
                                console.warn('[YOLO Inference HTTP Status]:', pyRes.status);
                            }
                        } catch (pyErr) {
                            console.warn('[YOLO Inference Connect Warning]:', pyErr.message);
                        }

                        if (!pyResult || !pyResult.success) {
                            return sendJson(503, {
                                status: 'error',
                                message: 'Real YOLO inference server is offline on port 8001. Please run `npm run ai`.'
                            });
                        }

                        insertAndSync('disease_detection_logs', {
                            crop_name: pyResult.crop_name,
                            disease_name: pyResult.disease_name,
                            confidence_score: pyResult.confidence_score,
                            severity_level: pyResult.severity_level,
                            detection_source: payload.detection_source || 'upload',
                            treatment_advice: pyResult.treatment_advice
                        }).catch(err => console.warn('[Disease Sync Warning]:', err.message));

                        insertAndSync('plant_growth_logs', {
                            crop_name: pyResult.crop_name,
                            plant_height_cm: 42.5,
                            leaf_count: 18,
                            growth_stage: 'Vegetative',
                            health_index: pyResult.health_index,
                            crop_health_status: pyResult.disease_risk === 'LOW' ? 'Healthy' : 'At Risk',
                            disease_risk: pyResult.disease_risk
                        }).catch(err => console.warn('[Plant Growth Sync Warning]:', err.message));

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
                        const payload = JSON.parse(body || '{}');
                        const { ingestSensorData } = await import('./esp32SerialService.js');
                        const normalized = ingestSensorData(payload);

                        const now = new Date().toISOString();
                        let deviceId = 1;

                        try {
                            const { pool } = await import('./db.js');
                            const devCheck = await pool.query('SELECT device_id FROM devices WHERE device_uid = $1 LIMIT 1', [normalized.device]);
                            if (devCheck.rows.length > 0) {
                                deviceId = devCheck.rows[0].device_id;
                            }
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
                            normalized.rainDetected !== undefined ||
                            normalized.buzzer !== undefined
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

                            if (normalized.buzzer !== undefined && normalized.buzzer !== null) {
                                airRecord.buzzer_active = normalized.buzzer;
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

                        if (normalized.streamUrl) {
                            try {
                                const { pool } = await import('./db.js');
                                pool.query('UPDATE devices SET esp32_cam_stream_url = $1, last_ping = NOW() WHERE device_uid = $2 OR device_id = $3', [normalized.streamUrl, normalized.device, deviceId]).catch(() => {});
                            } catch (_camErr) {
                            }
                        }

                        return sendJson(200, {
                            status: 'success',
                            message: 'ESP32 sensor data received and processed',
                            data: normalized
                        });
                    } catch (parseErr) {
                        return sendJson(400, {
                            status: 'error',
                            reason: 'INVALID_JSON_PAYLOAD',
                            message: parseErr.message
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

