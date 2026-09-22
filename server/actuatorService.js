import { getCollection } from './mongoDb.js';
import { query } from './db.js';

export const DEFAULT_ACTUATORS = [
    { actuator_type: 'water_pump', name: '💧 Water Pump', current_state: 'OFF', control_mode: 'AUTOMATIC', pin: 12 },
    { actuator_type: 'filter_unit', name: '🧪 Water Filtration Unit', current_state: 'ON', control_mode: 'AUTOMATIC', pin: 13 },
    { actuator_type: 'exhaust_fan', name: '💨 Exhaust Fan & Air Filter', current_state: 'ON', control_mode: 'AUTOMATIC', pin: 14 },
    { actuator_type: 'spray_valve', name: '🚿 Nutrient / Pest Spray Valve', current_state: 'OFF', control_mode: 'AUTOMATIC', pin: 15 }
];

export async function getActuatorStates() {
    try {
        const col = await getCollection('device_controls');
        let controls = await col.find().toArray();

        if (!controls || controls.length === 0) {
            for (const item of DEFAULT_ACTUATORS) {
                await col.updateOne(
                    { actuator_type: item.actuator_type },
                    { $set: { ...item, updated_at: new Date() } },
                    { upsert: true }
                );
            }
            controls = await col.find().toArray();
        }

        return controls;
    } catch (err) {
        console.warn('[Actuator Service Warning]:', err.message);
        return DEFAULT_ACTUATORS;
    }
}

export async function setActuatorState(actuatorType, action = 'AUTO') {
    const actUpper = String(action).toUpperCase();
    let state = 'OFF';
    let mode = 'MANUAL';

    if (actUpper === 'ON') {
        state = 'ON';
        mode = 'MANUAL';
    } else if (actUpper === 'OFF') {
        state = 'OFF';
        mode = 'MANUAL';
    } else if (actUpper === 'AUTO' || actUpper === 'AUTOMATIC') {
        state = (actuatorType === 'filter_unit' || actuatorType === 'exhaust_fan') ? 'ON' : 'OFF';
        mode = 'AUTOMATIC';
    }

    const updateDoc = {
        actuator_type: actuatorType,
        current_state: state,
        control_mode: mode,
        updated_at: new Date()
    };

    try {
        const col = await getCollection('device_controls');
        await col.updateOne(
            { actuator_type: actuatorType },
            { $set: updateDoc },
            { upsert: true }
        );
    } catch (mErr) {
        console.warn('[Actuator Mongo Update Notice]:', mErr.message);
    }

    try {
        await query(
            `UPDATE actuator_controls 
             SET current_state = $1, control_mode = $2, updated_at = NOW() 
             WHERE actuator_type = $3`,
            [state, mode, actuatorType]
        );
    } catch (pErr) {}
    console.log(`🎛️ [Actuator Switched] ${actuatorType} ➔ State: ${state} | Mode: ${mode}`);
    return updateDoc;
}

export async function formatActuatorReport(format = 'HTML') {
    const controls = await getActuatorStates();
    const time = new Date().toLocaleTimeString();

    const getIcon = (state) => state === 'ON' ? '🟢 <b>ON</b>' : '🔴 <b>OFF</b>';
    const getMode = (mode) => mode === 'AUTOMATIC' ? '🔄 <i>Auto-Pilot</i>' : '👤 <i>Manual Override</i>';

    const getActuator = (type) => controls.find(c => c.actuator_type === type) || { current_state: 'OFF', control_mode: 'AUTOMATIC' };

    const pump = getActuator('water_pump');
    const filter = getActuator('filter_unit');
    const fan = getActuator('exhaust_fan');
    const spray = getActuator('spray_valve');

    if (format === 'HTML') {
        return (
            `🎛️ <b>[IOTrex Relay & Actuator Telemetry]</b>\n` +
            `⏱️ <i>Updated: ${time}</i>\n\n` +
            `💧 <b>DC WATER PUMP:</b> ${getIcon(pump.current_state)} (${getMode(pump.control_mode)})\n` +
            `🧪 <b>WATER FILTRATION:</b> ${getIcon(filter.current_state)} (${getMode(filter.control_mode)})\n` +
            `💨 <b>EXHAUST & AIR FILTER:</b> ${getIcon(fan.current_state)} (${getMode(fan.control_mode)})\n` +
            `🚿 <b>MIST SPRAY VALVE:</b> ${getIcon(spray.current_state)} (${getMode(spray.control_mode)})\n\n` +
            `👇 <i>Use the controls below to switch any device:</i>`
        );
    }

    const getMdIcon = (state) => state === 'ON' ? '🟢 *ON*' : '🔴 *OFF*';
    const getMdMode = (mode) => mode === 'AUTOMATIC' ? '🔄 _Auto_' : '👤 _Manual_';

    return (
        `🎛️ *[IOTrex Relay & Actuator Telemetry]*\n` +
        `⏱️ _Updated: ${time}_\n\n` +
        `💧 *DC WATER PUMP:* ${getMdIcon(pump.current_state)} (${getMdMode(pump.control_mode)})\n` +
        `🧪 *WATER FILTRATION:* ${getMdIcon(filter.current_state)} (${getMdMode(filter.control_mode)})\n` +
        `💨 *EXHAUST & AIR FILTER:* ${getMdIcon(fan.current_state)} (${getMdMode(fan.control_mode)})\n` +
        `🚿 *MIST SPRAY VALVE:* ${getMdIcon(spray.current_state)} (${getMdMode(spray.control_mode)})\n\n` +
        `💡 _To switch devices, reply with:_\n` +
        `• *pump on* / *pump off* / *pump auto*\n` +
        `• *filter on* / *filter off* / *filter auto*\n` +
        `• *fan on* / *fan off* / *fan auto*\n` +
        `• *spray on* / *spray off* / *spray auto*`
    );
}
