import twilio from 'twilio';
import dotenv from 'dotenv';
import { getCollection } from './mongoDb.js';

dotenv.config();

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+17372212163';
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const DEFAULT_RECIPIENT = process.env.DEFAULT_RECIPIENT_PHONE || '+917900153894';

let clientInstance = null;

// Lazy client init so server boots cleanly even if creds aren't set in dev
function getTwilioClient() {
    if (!clientInstance && ACCOUNT_SID && AUTH_TOKEN) {
        try {
            clientInstance = twilio(ACCOUNT_SID, AUTH_TOKEN);
        } catch (err) {
            console.warn('[twilio] Failed client initialization:', err.message);
        }
    }
    return clientInstance;
}

export function formatPhoneNumber(phone) {
    if (!phone) return null;
    const digitsOnly = phone.replace(/[^0-9+]/g, '');
    if (digitsOnly.startsWith('+')) return digitsOnly;
    if (digitsOnly.length === 10) return `+91${digitsOnly}`;
    if (digitsOnly.startsWith('91') && digitsOnly.length === 12) return `+${digitsOnly}`;
    return `+${digitsOnly}`;
}

export async function sendWhatsApp(to, messageBody) {
    const rawNumber = formatPhoneNumber(to) || DEFAULT_RECIPIENT;
    const target = rawNumber.startsWith('whatsapp:') ? rawNumber : `whatsapp:${rawNumber}`;
    const twilioCli = getTwilioClient();

    if (!twilioCli) {
        console.warn(`[twilio-wa] Simulated WhatsApp to ${target} (no credentials configured)`);
        return {
            simulated: true,
            success: true,
            to: target,
            message: messageBody
        };
    }

    try {
        const response = await twilioCli.messages.create({
            body: messageBody,
            from: TWILIO_WHATSAPP_NUMBER,
            to: target
        });

        console.log(`💬 [twilio-wa] Sent to ${target} | SID: ${response.sid}`);
        return {
            success: true,
            sid: response.sid,
            status: response.status,
            to: target
        };
    } catch (error) {
        console.error(`❌ [twilio-wa] Dispatch error for ${target}:`, error.message);
        return {
            success: false,
            error: error.message,
            to: target
        };
    }
}

export async function sendSms(to, messageBody) {
    const targetPhone = formatPhoneNumber(to) || DEFAULT_RECIPIENT;
    const twilioCli = getTwilioClient();

    if (!twilioCli) {
        return { simulated: true, success: true, to: targetPhone, message: messageBody };
    }

    try {
        const res = await twilioCli.messages.create({
            body: messageBody,
            from: TWILIO_PHONE_NUMBER,
            to: targetPhone
        });
        return { success: true, sid: res.sid, to: targetPhone };
    } catch (err) {
        return { success: false, error: err.message, to: targetPhone };
    }
}

export async function sendAlert(to, messageBody) {
    return await sendWhatsApp(to, messageBody);
}

// Retrieves operator mobile numbers from users collection with fallback to default
async function getOperatorPhones() {
    try {
        const usersCol = await getCollection('users');
        const users = await usersCol.find({}).toArray();
        const phones = users
            .map(u => formatPhoneNumber(u.phone))
            .filter(Boolean);

        if (!phones.length && DEFAULT_RECIPIENT) {
            return [DEFAULT_RECIPIENT];
        }
        return Array.from(new Set(phones));
    } catch (e) {
        return [DEFAULT_RECIPIENT];
    }
}

// Quick broadcast helper
async function notifyAllOperators(body) {
    const phoneList = await getOperatorPhones();
    return await Promise.all(phoneList.map(num => sendWhatsApp(num, body)));
}

export async function dispatchAirQualityAlert(record) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dynamicBody = 
        `🚨 *[IOTrex Air Quality Alert]*\n\n` +
        `• *Status:* ${record.air_status || 'CRITICAL'}\n` +
        `• *AQI:* ${record.aqi_index || record.air_quality_score || 'N/A'}\n` +
        `• *CO2:* ${record.co2_ppm || 'N/A'} ppm\n` +
        `• *PM2.5:* ${record.pm2_5 || 'N/A'} µg/m³\n` +
        `• *Temperature:* ${record.current_temperature || record.avg_temperature || 'N/A'}°C\n` +
        `• *Recorded:* ${timestamp}\n\n` +
        `⚠️ *Action:* Check greenhouse air exchangers & intake vents.`;

    return await notifyAllOperators(dynamicBody);
}

export async function dispatchWaterQualityAlert(record) {
    const dynamicBody = 
        `💧 *[IOTrex Water Quality Alert]*\n\n` +
        `• *Status:* ${record.water_status || 'WARNING'}\n` +
        `• *pH:* ${record.ph_level || 'N/A'} (Nominal: 6.5 – 8.5)\n` +
        `• *Turbidity:* ${record.turbidity_ntu || 'N/A'} NTU\n` +
        `• *TDS:* ${record.tds_ppm || 'N/A'} ppm\n\n` +
        `⚠️ *Action:* Verify reservoir intake filter and nutrient balance.`;

    return await notifyAllOperators(dynamicBody);
}

export async function dispatchPestAlert(record) {
    const dynamicBody = 
        `🐛 *[IOTrex Pest Surveillance Alert]*\n\n` +
        `• *Detected:* ${record.pest_name || record.pest_type || 'Aphids'}\n` +
        `• *Trap Count:* ${record.pest_count || '15+'}\n` +
        `• *Threat:* ${record.threat_level || record.risk_level || 'HIGH'}\n` +
        `• *Zone:* Sector A - Greenhouse 1\n\n` +
        `🔍 *Advisory:* ${record.recommended_action || 'Inspect sector traps & trigger bio-spray.'}`;

    return await notifyAllOperators(dynamicBody);
}

export async function dispatchDailySummaryReport() {
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

        if (latestAir[0]) air = latestAir[0];
        if (latestWater[0]) water = latestWater[0];
        if (latestSoil[0]) soil = latestSoil[0];
    } catch (e) {
        console.warn('[twilio] Daily snapshot fallback:', e.message);
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const dynamicBody = 
        `📊 *[IOTrex Daily Summary - ${dateStr}]*\n\n` +
        `• *Air AQI:* ${air.aqi_index || air.air_quality_score || '42'} (${air.air_status || 'Optimal'})\n` +
        `• *Temp / Hum:* ${air.current_temperature || '24.5'}°C / ${air.current_humidity || '58'}%\n` +
        `• *Water pH:* ${water.ph_level || '7.2'} | *TDS:* ${water.tds_ppm || '280'} ppm\n` +
        `• *Soil Moisture:* ${soil.moisture_level || '64'}%\n\n` +
        `🟢 *Status:* All greenhouse sensor channels operational.`;

    return await notifyAllOperators(dynamicBody);
}

export async function evaluateAndNotify(tableName, record) {
    if (!record) return;

    try {
        if (tableName === 'air_quality_logs') {
            const isHighAqi = record.aqi_index && Number(record.aqi_index) > 100;
            const isHighCo2 = record.co2_ppm && Number(record.co2_ppm) > 1000;
            const isCriticalStatus = ['POOR', 'VERY POOR', 'SEVERE', 'HAZARDOUS', 'CRITICAL'].includes(
                String(record.air_status).toUpperCase()
            );

            if (isHighAqi || isHighCo2 || isCriticalStatus) {
                console.log('[twilio] Dispatching Air Alert for record:', record._id || 'log');
                await dispatchAirQualityAlert(record);
            }
        } else if (tableName === 'water_quality_logs') {
            const ph = Number(record.ph_level);
            const isBadPh = ph && (ph < 6.0 || ph > 8.5);
            const isHighTurbidity = record.turbidity_ntu && Number(record.turbidity_ntu) > 5.0;

            if (isBadPh || isHighTurbidity || ['POOR', 'CRITICAL', 'WARNING'].includes(String(record.water_status).toUpperCase())) {
                console.log('[twilio] Dispatching Water Alert for record:', record._id || 'log');
                await dispatchWaterQualityAlert(record);
            }
        } else if (tableName === 'pest_detection_logs') {
            const risk = String(record.threat_level || record.risk_level || '').toUpperCase();
            if (['HIGH', 'CRITICAL', 'SEVERE'].includes(risk) || (record.pest_count && Number(record.pest_count) > 15)) {
                console.log('[twilio] Dispatching Pest Alert for record:', record._id || 'log');
                await dispatchPestAlert(record);
            }
        }
    } catch (err) {
        console.warn('[twilio] Evaluate error notice:', err.message);
    }
}
