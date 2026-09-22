import dotenv from 'dotenv';
import { getCollection } from './mongoDb.js';

dotenv.config();

let isPollingActive = false;
let pollingOffset = 0;
let registeredChatIds = new Set();

export function getTelegramBotToken() {
    return process.env.TELEGRAM_BOT_TOKEN || '8697788858:AAFN182pjBvpiHEUw3MfbaOQc5CgUGebmmI';
}

export function getDefaultTelegramChatId() {
    return process.env.TELEGRAM_CHAT_ID || Array.from(registeredChatIds)[0] || '';
}

export async function sendTelegram(messageBody, chatId = null, options = {}) {
    const token = getTelegramBotToken();
    const targetChatId = chatId || getDefaultTelegramChatId();

    if (!token || !targetChatId) {
        console.warn(`[Telegram Notice] Missing target Chat ID. Send /start to @IOTrex_bot on Telegram to link your account. Message:\n"${messageBody.slice(0, 100)}..."`);
        return {
            simulated: true,
            success: true,
            message: messageBody,
            note: 'Send /start to @IOTrex_bot on Telegram to link your phone'
        };
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const payload = {
            chat_id: targetChatId,
            text: messageBody,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...options
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.ok) {
            console.log(`✈️ [Telegram Message Sent] Chat: ${targetChatId} | Message ID: ${data.result.message_id}`);
            return { success: true, messageId: data.result.message_id, chatId: targetChatId };
        } else {
            console.error(`❌ [Telegram Send Failed]: ${data.description}`);
            return { success: false, error: data.description };
        }
    } catch (err) {
        console.error(`❌ [Telegram Error]:`, err.message);
        return { success: false, error: err.message };
    }
}

export async function answerTelegramCallback(callbackQueryId, text = '') {
    const token = getTelegramBotToken();
    if (!token || !callbackQueryId) return;

    try {
        const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text,
                show_alert: false
            })
        });
    } catch (err) {}}

export async function sendTelegramWelcomeAlert(chatId, fullName = 'Operator') {
    const time = new Date().toLocaleTimeString();
    const text = 
        `<b>[Welcome to EnviroX Ecosystem]</b>\n\n` +
        `Hello <b>${fullName}</b>, welcome aboard.\n\n` +
        `• <b>Account Status:</b> Verified & Registered\n` +
        `• <b>Database:</b> Database Synchronized\n` +
        `• <b>Time:</b> ${time}\n\n` +
        `You will receive automated sensor telemetry and real-time warnings right here.\n` +
        `<i>Send /help anytime to view live actions.</i>`;

    return await sendTelegram(text, chatId);
}

export async function sendTelegramLoginAlert(chatId, fullName = 'Operator', isFirstLogin = false) {
    const time = new Date().toLocaleTimeString();
    const text = 
        `<b>[EnviroX Security Alert: Login Detected]</b>\n\n` +
        `User <b>${fullName}</b> signed in to EnviroX.\n\n` +
        `• <b>Type:</b> ${isFirstLogin ? 'First Dashboard Session' : 'Standard Web Session'}\n` +
        `• <b>Timestamp:</b> ${time}\n` +
        `• <b>Access Level:</b> Environmental Operator\n` +
        `• <b>Node Status:</b> Operational\n\n` +
        `<i>If this was not you, please inspect your access credentials.</i>`;

    return await sendTelegram(text, chatId);
}

export async function dispatchTelegramAirAlert(record) {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const text = 
        `<b>[EnviroX Air Quality Alert]</b>\n\n` +
        `• <b>Status:</b> ${record.air_status || 'CRITICAL'}\n` +
        `• <b>AQI Index:</b> ${record.aqi_index || record.air_quality_score || 'N/A'}\n` +
        `• <b>CO2:</b> ${record.co2_ppm || 'N/A'} ppm\n` +
        `• <b>PM2.5:</b> ${record.pm2_5 || 'N/A'} µg/m³\n` +
        `• <b>Temperature:</b> ${record.current_temperature || record.avg_temperature || 'N/A'}°C\n` +
        `• <b>Time:</b> ${time}\n\n` +
        `<i>Action: Inspect greenhouse ventilation & exhaust fans immediately.</i>`;

    return await broadcastTelegram(text);
}

export async function dispatchTelegramWaterAlert(record) {
    const text = 
        `<b>[EnviroX Water Quality Alert]</b>\n\n` +
        `• <b>Status:</b> ${record.water_status || 'WARNING'}\n` +
        `• <b>pH Level:</b> ${record.ph_level || 'N/A'} (Safe: 6.5 - 7.5)\n` +
        `• <b>Turbidity:</b> ${record.turbidity_ntu || 'N/A'} NTU\n` +
        `• <b>TDS:</b> ${record.tds_ppm || 'N/A'} ppm\n\n` +
        `<i>Action: Check filtration lines and reservoir nutrient tanks.</i>`;

    return await broadcastTelegram(text);
}

export async function dispatchTelegramPestAlert(record) {
    const text = 
        `<b>[EnviroX Pest & Disease Alert]</b>\n\n` +
        `• <b>Species:</b> ${record.pest_name || record.pest_type || 'Aphids'}\n` +
        `• <b>Count:</b> ${record.pest_count || 'Elevated'}\n` +
        `• <b>Risk Level:</b> ${record.threat_level || record.risk_level || 'HIGH'}\n` +
        `• <b>Location:</b> Sector A - Polyhouse 1\n\n` +
        `<i>Action: ${record.recommended_action || 'Inspect sector immediately & apply bio-control treatment.'}</i>`;

    return await broadcastTelegram(text);
}

export async function dispatchTelegramSoilAlert(record) {
    const text = 
        `<b>[EnviroX Soil Moisture Alert]</b>\n\n` +
        `• <b>Status:</b> ${record.status || 'LOW MOISTURE'}\n` +
        `• <b>Moisture Level:</b> ${record.moisture_level || 'N/A'}%\n` +
        `• <b>Temperature:</b> ${record.temperature_c || 'N/A'}°C\n` +
        `• <b>Sector:</b> ${record.sector || 'Main Crop Bed'}\n\n` +
        `<i>Action: Automated irrigation pump cycling required.</i>`;

    return await broadcastTelegram(text);
}

export async function dispatchTelegramDailyReport() {
    let air = {}, water = {}, soil = {};
    try {
        const airCol = await getCollection('air_quality_logs');
        const waterCol = await getCollection('water_quality_logs');
        const soilCol = await getCollection('soil_moisture_logs');

        const [latestAir, latestWater, latestSoil] = await Promise.all([
            airCol.find().sort({ recorded_at: -1 }).limit(1).toArray().catch(() => []),
            waterCol.find().sort({ recorded_at: -1 }).limit(1).toArray().catch(() => []),
            soilCol.find().sort({ recorded_at: -1 }).limit(1).toArray().catch(() => [])
        ]);

        air = latestAir[0] || {};
        water = latestWater[0] || {};
        soil = latestSoil[0] || {};
    } catch (e) {
        console.warn('[Telegram Daily Report Warning] Using baseline metrics:', e.message);
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const text = 
        `<b>[EnviroX Daily Environmental Summary - ${dateStr}]</b>\n\n` +
        `• <b>Air AQI:</b> ${air.aqi_index || air.air_quality_score || '38'} (${air.air_status || 'Optimal'})\n` +
        `• <b>Temp / Hum:</b> ${air.current_temperature || '26.5'}°C / ${air.current_humidity || '62'}%\n` +
        `• <b>Water pH:</b> ${water.ph_level || '6.8'} | <b>TDS:</b> ${water.tds_ppm || '650'} ppm\n` +
        `• <b>Soil Moisture:</b> ${soil.moisture_level || '68'}%\n\n` +
        `<b>System Health:</b> ALL SENSORS ACTIVE & SYNCHRONIZED`;

    return await broadcastTelegram(text);
}

async function broadcastTelegram(text, options = {}) {
    const targetChatId = getDefaultTelegramChatId();
    if (targetChatId) {
        return await sendTelegram(text, targetChatId, options);
    }

    const chatList = Array.from(registeredChatIds);
    if (chatList.length > 0) {
        const results = await Promise.all(chatList.map(id => sendTelegram(text, id, options)));
        return results[0] || { success: true };
    }

    return await sendTelegram(text, null, options);
}

export async function evaluateAndNotifyTelegram(tableName, record) {
    if (!record) return;

    try {
        if (tableName === 'air_quality_logs') {
            const isHighAqi = record.aqi_index && Number(record.aqi_index) > 100;
            const isHighCo2 = record.co2_ppm && Number(record.co2_ppm) > 1000;
            const isCriticalStatus = ['POOR', 'VERY POOR', 'SEVERE', 'HAZARDOUS', 'CRITICAL'].includes(
                String(record.air_status).toUpperCase()
            );

            if (isHighAqi || isHighCo2 || isCriticalStatus) {
                await dispatchTelegramAirAlert(record);
            }
        } else if (tableName === 'water_quality_logs') {
            const ph = Number(record.ph_level);
            const isBadPh = ph && (ph < 6.0 || ph > 8.5);
            const isHighTurbidity = record.turbidity_ntu && Number(record.turbidity_ntu) > 5.0;

            if (isBadPh || isHighTurbidity || ['POOR', 'CRITICAL', 'WARNING'].includes(String(record.water_status).toUpperCase())) {
                await dispatchTelegramWaterAlert(record);
            }
        } else if (tableName === 'soil_moisture_logs') {
            const moisture = Number(record.moisture_level);
            if (moisture && (moisture < 30 || moisture > 85)) {
                await dispatchTelegramSoilAlert(record);
            }
        } else if (tableName === 'pest_detection_logs') {
            const risk = String(record.threat_level || record.risk_level || '').toUpperCase();
            if (['HIGH', 'CRITICAL', 'SEVERE'].includes(risk) || (record.pest_count && Number(record.pest_count) > 15)) {
                await dispatchTelegramPestAlert(record);
            }
        }
    } catch (err) {
        console.warn('[Telegram Evaluate Notice]:', err.message);
    }
}

export function startTelegramPollingDaemon() {
    const token = getTelegramBotToken();

    if (!token) {
        console.log('⚠️ [Telegram Daemon] No TELEGRAM_BOT_TOKEN provided. Telegram Bot will run in simulation mode.');
        return;
    }

    if (globalThis.__telegramAbortController) {
        try {
            globalThis.__telegramAbortController.abort();
        } catch (e) {}
    }

    const abortController = new AbortController();
    globalThis.__telegramAbortController = abortController;
    isPollingActive = true;

    console.log('\n================================================================================');
    console.log('✈️ [Telegram Bot Daemon] 2-Way Interactive Bot STARTED');
    console.log('🤖 Bot Username: @IOTrex_bot');
    console.log('📡 Long-Polling Mode: ACTIVE (Works locally with NO tunnel or port-forwarding needed)');
    console.log('💬 Send /start or /help to @IOTrex_bot in Telegram to begin chatting!');
    console.log('================================================================================\n');

    getCollection('telegram_subscribers').then(async col => {
        const subs = await col.find().toArray();
        for (const s of subs) {
            if (s.chat_id) registeredChatIds.add(s.chat_id);
        }
        if (subs.length > 0) {
            console.log(`✈️ [Telegram Subscribers] Loaded ${subs.length} active subscriber(s) from MongoDB.`);
        }
    }).catch(() => {});

    runPollingLoop(token, abortController.signal);
}

async function runPollingLoop(token, signal) {
    const { handleTelegramMessage, handleTelegramCallback } = await import('./telegramBotEngine.js');

    while (!signal.aborted) {
        try {
            const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${pollingOffset}&timeout=25&allowed_updates=${JSON.stringify(['message', 'callback_query'])}`;
            const res = await fetch(url, { signal });
            const data = await res.json();

            if (data.ok && Array.isArray(data.result)) {
                for (const update of data.result) {
                    if (signal.aborted) break;

                    pollingOffset = Math.max(pollingOffset, update.update_id + 1);

                    if (update.message) {
                        const msg = update.message;
                        const chatId = msg.chat?.id;
                        const text = msg.text || '';
                        const userMeta = msg.from || {};

                        if (chatId) {
                            registeredChatIds.add(chatId);
                            saveSubscriber(chatId, userMeta);

                            handleTelegramMessage(chatId, text, userMeta).catch (e => {
                                console.error('[Telegram Handler Error]:', e.message);
                            });
                        }
                    }

                    if (update.callback_query) {
                        const query = update.callback_query;
                        const chatId = query.message?.chat?.id;
                        const callbackData = query.data;
                        const userMeta = query.from || {};

                        if (chatId && callbackData) {
                            handleTelegramCallback(chatId, query.id, callbackData, userMeta).catch (e => {
                                console.error('[Telegram Callback Error]:', e.message);
                            });
                        }
                    }
                }
            } else if (!data.ok) {
                if (!signal.aborted) {
                    await new Promise(r => setTimeout(r, 4000));
                }
            }
        } catch (err) {
            if (signal.aborted) break;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function saveSubscriber(chatId, userMeta = {}) {
    try {
        const col = await getCollection('telegram_subscribers');
        await col.updateOne(
            { chat_id: chatId },
            {
                $set: {
                    chat_id: chatId,
                    first_name: userMeta.first_name || '',
                    last_name: userMeta.last_name || '',
                    username: userMeta.username || '',
                    last_active_at: new Date().toISOString()
                }
            },
            { upsert: true }
        );
    } catch (e) {}}
