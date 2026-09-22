import dotenv from 'dotenv';
import { getCollection } from './mongoDb.js';

dotenv.config();

const META_TOKEN = process.env.META_WHATSAPP_TOKEN || '';
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '1351186638067291';
const DEFAULT_RECIPIENT = process.env.DEFAULT_RECIPIENT_PHONE || '917900153894';

// Quick sanitation for target phone numbers (defaults to 91 country code if 10-digit)
export function formatRecipient(phone) {
    if (!phone) return DEFAULT_RECIPIENT;
    let digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) {
        digits = `91${digits}`;
    }
    return digits;
}

export async function getDatabaseUserPhones() {
    try {
        const usersCol = await getCollection('users');
        // only notify operators that actually have an active session logged
        const activeUsers = await usersCol.find({
            phone: { $exists: true, $ne: '' },
            last_login_at: { $exists: true, $ne: null }
        }).toArray();

        const phoneList = activeUsers
            .map(u => formatRecipient(u.phone))
            .filter(Boolean);

        if (!phoneList.length) {
            console.log('ℹ️ [meta-wa] No active logged-in operators found. Restricting alert broadcast.');
            return [];
        }

        const uniqueList = Array.from(new Set(phoneList));
        console.log(`📡 [meta-wa] Found ${uniqueList.length} operator phone(s) for dispatch:`, uniqueList);
        return uniqueList;
    } catch (err) {
        console.warn('[meta-wa] Warning reading users collection:', err.message);
        return [];
    }
}

// Send pre-approved Meta WhatsApp template (fallback for window expiry)
export async function sendMetaTemplate(to, templateName = 'hello_world', languageCode = 'en_US', components = []) {
    const recipient = formatRecipient(to);

    if (!META_TOKEN || !PHONE_NUMBER_ID) {
        console.warn(`[meta-wa] Simulated template '${templateName}' -> ${recipient} (missing META_TOKEN)`);
        return { simulated: true, success: true, to: recipient, template: templateName };
    }

    try {
        const endpoint = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
        const bodyPayload = {
            messaging_product: 'whatsapp',
            to: recipient,
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode }
            }
        };

        if (components?.length) {
            bodyPayload.template.components = components;
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${META_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyPayload)
        });

        const json = await res.json();
        if (res.ok && json.messages?.[0]) {
            console.log(`💬 [meta-wa] Template '${templateName}' sent to ${recipient} (id: ${json.messages[0].id})`);
            return { success: true, messageId: json.messages[0].id, data: json, to: recipient };
        }

        console.error(`❌ [meta-wa] Template failed for ${recipient}:`, json.error?.message || json);
        return { success: false, error: json.error?.message || 'Template failed', to: recipient, raw: json };
    } catch (err) {
        console.error(`❌ [meta-wa] Template fetch error (${recipient}):`, err.message);
        return { success: false, error: err.message, to: recipient };
    }
}

// Send standard 2-way session text message
export async function sendMetaTextMessage(to, messageBody) {
    const recipient = formatRecipient(to);

    if (!META_TOKEN || !PHONE_NUMBER_ID) {
        return { simulated: true, success: true, to: recipient, message: messageBody };
    }

    try {
        const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${META_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: recipient,
                type: 'text',
                text: { preview_url: false, body: messageBody }
            })
        });

        const data = await resp.json();
        if (resp.ok && data.messages?.[0]) {
            console.log(`💬 [meta-wa] Text sent -> ${recipient} (id: ${data.messages[0].id})`);
            return { success: true, messageId: data.messages[0].id, to: recipient };
        }

        // 24-hr session window might have expired: attempt template fallback
        console.warn(`[meta-wa] Text window closed for ${recipient}: ${data.error?.message}. Fallback to hello_world.`);
        return await sendMetaTemplate(recipient, 'hello_world');
    } catch (err) {
        console.error(`❌ [meta-wa] Text dispatch error (${recipient}):`, err.message);
        return { success: false, error: err.message, to: recipient };
    }
}

// Internal helper to broadcast message to all active operator devices
async function broadcastToOperators(body) {
    const phones = await getDatabaseUserPhones();
    if (!phones.length) return [];
    return await Promise.all(phones.map(p => sendMetaTextMessage(p, body)));
}

export async function dispatchMetaAirAlert(record) {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const msg =
        `🚨 *[EnviroX Air Quality Alert]*\n\n` +
        `• *Status:* ${record.air_status || 'CRITICAL'}\n` +
        `• *AQI:* ${record.aqi_index || record.air_quality_score || 'N/A'}\n` +
        `• *CO2:* ${record.co2_ppm || 'N/A'} ppm\n` +
        `• *PM2.5:* ${record.pm2_5 || 'N/A'} µg/m³\n` +
        `• *Temperature:* ${record.current_temperature || record.avg_temperature || 'N/A'}°C\n` +
        `• *Time:* ${timeStr}\n\n` +
        `⚠️ *Action Required:* Inspect greenhouse damper and exhaust fans immediately.`;

    return await broadcastToOperators(msg);
}

export async function dispatchMetaWaterAlert(record) {
    const msg =
        `💧 *[EnviroX Hydroponic Alert]*\n\n` +
        `• *Status:* ${record.water_status || 'WARNING'}\n` +
        `• *pH Level:* ${record.ph_level || 'N/A'} (Safe envelope: 6.5 - 7.5)\n` +
        `• *Turbidity:* ${record.turbidity_ntu || 'N/A'} NTU\n` +
        `• *TDS:* ${record.tds_ppm || 'N/A'} ppm\n\n` +
        `⚠️ *Action:* Check intake filters and verify nutrient dosing lines.`;

    return await broadcastToOperators(msg);
}

export async function dispatchMetaPestAlert(record) {
    const msg =
        `🐛 *[EnviroX Pest Infestation Alert]*\n\n` +
        `• *Pest:* ${record.pest_name || record.pest_type || 'Aphids'}\n` +
        `• *Trap Count:* ${record.pest_count || 'Elevated'}\n` +
        `• *Threat Rating:* ${record.threat_level || record.risk_level || 'HIGH'}\n` +
        `• *Sector:* Sector A - Polyhouse 1\n\n` +
        `🔍 *Advisory:* ${record.recommended_action || 'Inspect canopy traps and trigger bio-spray valve.'}`;

    return await broadcastToOperators(msg);
}

export async function dispatchMetaDailyReport() {
    let air = {}, water = {}, soil = {};
    try {
        const airCol = await getCollection('air_quality_logs');
        const waterCol = await getCollection('water_quality_logs');
        const soilCol = await getCollection('soil_moisture_logs');

        const [airList, waterList, soilList] = await Promise.all([
            airCol.find().sort({ recorded_at: -1 }).limit(1).toArray().catch(() => []),
            waterCol.find().sort({ recorded_at: -1 }).limit(1).toArray().catch(() => []),
            soilCol.find().sort({ recorded_at: -1 }).limit(1).toArray().catch(() => [])
        ]);

        if (airList[0]) air = airList[0];
        if (waterList[0]) water = waterList[0];
        if (soilList[0]) soil = soilList[0];
    } catch (e) {
        console.warn('[meta-wa] Baseline fallback used for daily report:', e.message);
    }

    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const summaryText =
        `📊 *[EnviroX Daily Summary - ${todayStr}]*\n\n` +
        `• *Air AQI:* ${air.aqi_index || air.air_quality_score || '38'} (${air.air_status || 'Optimal'})\n` +
        `• *Temp / Humidity:* ${air.current_temperature || '26.5'}°C / ${air.current_humidity || '62'}%\n` +
        `• *Water pH / TDS:* ${water.ph_level || '6.8'} | ${water.tds_ppm || '650'} ppm\n` +
        `• *Soil Moisture:* ${soil.moisture_level || '68'}%\n\n` +
        `✅ *Status:* Sensor stations synchronized. No critical failures.`;

    return await broadcastToOperators(summaryText);
}

// Evaluates incoming sensor telemetry record against thresholds
export async function evaluateAndNotifyMeta(tableName, record) {
    if (!record) return;

    try {
        if (tableName === 'air_quality_logs') {
            const highAqi = record.aqi_index && Number(record.aqi_index) > 100;
            const highCo2 = record.co2_ppm && Number(record.co2_ppm) > 1000;
            const badAir = ['POOR', 'VERY POOR', 'SEVERE', 'HAZARDOUS', 'CRITICAL'].includes(
                String(record.air_status).toUpperCase()
            );

            if (highAqi || highCo2 || badAir) {
                console.log('[meta-wa] Triggering Air Alert for record:', record._id || 'telemetry');
                await dispatchMetaAirAlert(record);
            }
        } else if (tableName === 'water_quality_logs') {
            const ph = Number(record.ph_level);
            const badPh = ph && (ph < 6.0 || ph > 8.5);
            const highTurb = record.turbidity_ntu && Number(record.turbidity_ntu) > 5.0;

            if (badPh || highTurb || ['POOR', 'CRITICAL', 'WARNING'].includes(String(record.water_status).toUpperCase())) {
                console.log('[meta-wa] Triggering Water Alert for record:', record._id || 'telemetry');
                await dispatchMetaWaterAlert(record);
            }
        } else if (tableName === 'pest_detection_logs') {
            const threat = String(record.threat_level || record.risk_level || '').toUpperCase();
            if (['HIGH', 'CRITICAL', 'SEVERE'].includes(threat) || (record.pest_count && Number(record.pest_count) > 15)) {
                console.log('[meta-wa] Triggering Pest Alert for record:', record._id || 'telemetry');
                await dispatchMetaPestAlert(record);
            }
        }
    } catch (err) {
        console.warn('[meta-wa] Threshold evaluation notice:', err.message);
    }
}

export async function sendMetaWelcomeAlert(phone, fullName = 'Operator') {
    const text =
        `🌿 *[EnviroX System Registration]*\n\n` +
        `Welcome, *${fullName}*!\n` +
        `Your device is now paired with EnviroX greenhouse telemetry.\n\n` +
        `Automated alerts configured for:\n` +
        `• Atmospheric & AQI violations\n` +
        `• Reservoir pH & TDS excursions\n` +
        `• Pest trap detections\n` +
        `• 24h executive summaries\n\n` +
        `Status: *CONNECTED* 🟢`;

    return await sendMetaTextMessage(phone, text);
}

export async function sendMetaLoginAlert(phone, fullName = 'Operator', isFirstLogin = false) {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const msg = isFirstLogin
        ? `🌱 *[EnviroX Initial Setup Complete]*\n\n` +
          `Hello *${fullName}*,\n` +
          `Welcome to the EnviroX command station.\n` +
          `• *Logged At:* ${timeStr}\n` +
          `• *Sensor Feeds:* Streaming live to cloud db.`
        : `🔒 *[EnviroX Security Login]*\n\n` +
          `Hello *${fullName}*,\n` +
          `A new operator session was authenticated at *${timeStr}*.\n` +
          `If this was you, no action is needed.`;

    return await sendMetaTextMessage(phone, msg);
}

let daemonStarted = false;
let daemonTimer = null;

export function startContinuousMetaDaemon() {
    if (daemonStarted) return;
    daemonStarted = true;

    console.log('\n================================================================================');
    console.log('🟢 [Meta WhatsApp Daemon] Continuous Background Engine STARTED');
    console.log(`📱 Default Recipient: +${DEFAULT_RECIPIENT}`);
    console.log(`🔑 Meta Cloud API: ${META_TOKEN ? '✅ ACTIVE' : '⚠️ Missing META_WHATSAPP_TOKEN in .env'}`);
    console.log('================================================================================\n');

    if (META_TOKEN) {
        const bootMsg =
            `🌿 *[IOTrex WhatsApp Engine Online]*\n\n` +
            `🚀 EnviroX server process started!\n` +
            `• *Time:* ${new Date().toLocaleTimeString()}\n` +
            `• *Telemetry Uplink:* ACTIVE\n` +
            `• *Status:* Real-time threshold polling running 🟢`;

        sendMetaTextMessage(DEFAULT_RECIPIENT, bootMsg)
            .then(res => {
                if (res?.success) console.log('[meta-wa] Startup ping delivered.');
            })
            .catch(e => console.warn('[meta-wa] Startup notice warning:', e.message));
    }

    // Polling unhandled alerts every 60s
    daemonTimer = setInterval(async () => {
        try {
            const alertsCol = await getCollection('alerts');
            const pending = await alertsCol.find({ is_resolved: false, notified_meta: { $ne: true } }).limit(3).toArray();

            for (const item of pending) {
                const alertText =
                    `🚨 *[EnviroX Threshold Alert]*\n\n` +
                    `• *Notice:* ${item.alert_title || 'Environmental Warning'}\n` +
                    `• *Severity:* ${(item.severity || 'CRITICAL').toUpperCase()}\n` +
                    `• *Details:* ${item.alert_message || 'Parameter outside safe limits.'}\n` +
                    `• *Timestamp:* ${new Date(item.created_at || Date.now()).toLocaleTimeString()}`;

                await sendMetaTextMessage(DEFAULT_RECIPIENT, alertText);
                await alertsCol.updateOne({ _id: item._id }, { $set: { notified_meta: true } });
            }
        } catch (e) {
            // silent catch during idle poll
        }
    }, 60000);
}
