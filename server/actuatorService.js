import { getCollection } from './mongoDb.js';

export const DEFAULT_ACTUATORS = [
    { actuator_type: 'grow_lights', name: '💡 Grow Light', current_state: 'OFF', control_mode: 'AUTOMATIC', pin: 11 },
    { actuator_type: 'water_pump', name: '💧 Water Pump', current_state: 'OFF', control_mode: 'AUTOMATIC', pin: 12 },
    { actuator_type: 'filter_unit', name: '🧪 Water Filtration Unit', current_state: 'ON', control_mode: 'AUTOMATIC', pin: 13 },
    { actuator_type: 'exhaust_fan', name: '💨 Exhaust Fan & Air Filter', current_state: 'ON', control_mode: 'AUTOMATIC', pin: 14 },
    { actuator_type: 'spray_valve', name: '🚿 Nutrient / Pest Spray Valve', current_state: 'OFF', control_mode: 'AUTOMATIC', pin: 15 }
];

export async function getActuatorStates() {
    try {
        const col = await getCollection('device_controls');
        if (!col) return DEFAULT_ACTUATORS;
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

async function sendCommandToESP32Node(baseUrl, command) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${baseUrl}/api/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            const json = await res.json();
            console.log(`✅ [ESP32 Relay Command Success] ${baseUrl}/api/control ->`, json);
            return json;
        } else {
            console.warn(`⚠️ [ESP32 Relay Command Warning] ${baseUrl}/api/control returned HTTP ${res.status}`);
        }
    } catch (err) {
        console.warn(`⚠️ [ESP32 Relay Command Error] ${baseUrl}/api/control -> ${err.message}`);
    }
    return null;
}

export async function setActuatorState(actuatorType, action = 'AUTO', options = {}) {
    const actUpper = String(action).toUpperCase();
    let commandStr = 'AUTO';
    if (actUpper === 'ON' || actUpper === 'MANUAL_ON') commandStr = 'MANUAL_ON';
    else if (actUpper === 'OFF' || actUpper === 'MANUAL_OFF') commandStr = 'MANUAL_OFF';
    else commandStr = 'AUTO';

    let targetBaseUrl = null;
    if (actuatorType === 'grow_lights' || actuatorType === 'grow_light') {
        targetBaseUrl = 'http://node1.local';
    } else if (actuatorType === 'water_pump' || actuatorType === 'pump' || actuatorType === 'filter_unit') {
        targetBaseUrl = 'http://node2.local';
    }

    // Safety Lockout 1: Check water tank level if commanding Water Pump ON
    if ((actuatorType === 'water_pump' || actuatorType === 'pump') && commandStr === 'MANUAL_ON' && !options.force) {
        try {
            const { getUnifiedSensorData } = await import('./esp32SerialService.js');
            const data = getUnifiedSensorData();
            const tankLevel = data.node2?.data?.water_tank_level_percent ?? data.water_tank_level_percent;
            const waterDist = data.node2?.data?.water_distance_cm;
            if (tankLevel !== null && tankLevel <= 0 && waterDist !== undefined && waterDist > 50) {
                throw new Error('Safety Lockout: Water tank is EMPTY (0%). Water pump operation blocked to prevent motor burnout.');
            }
        } catch (safetyErr) {
            if (safetyErr.message.includes('Safety Lockout')) {
                throw safetyErr;
            }
        }
    }

    let esp32Result = null;
    if (targetBaseUrl) {
        console.log(`📡 [Sending Hardware Actuator Command] ${targetBaseUrl}/api/control -> command: ${commandStr}`);
        esp32Result = await sendCommandToESP32Node(targetBaseUrl, commandStr);

        if (!esp32Result) {
            throw new Error(`Actuator command failed: Target microcontroller node at ${targetBaseUrl} is OFFLINE or unreachable.`);
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const statusRes = await fetch(`${targetBaseUrl}/api/status`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (statusRes.ok) {
                const statusJson = await statusRes.json();
                const { ingestSensorData } = await import('./esp32SerialService.js');
                ingestSensorData(statusJson);
            }
        } catch (_statusErr) {}
    }

    let state = 'OFF';
    let mode = 'MANUAL';

    if (commandStr === 'MANUAL_ON') {
        state = 'ON';
        mode = 'MANUAL';
    } else if (commandStr === 'MANUAL_OFF') {
        state = 'OFF';
        mode = 'MANUAL';
    } else {
        if (esp32Result && (esp32Result.relay !== undefined || esp32Result.pump !== undefined)) {
            state = (esp32Result.relay || esp32Result.pump) ? 'ON' : 'OFF';
        } else {
            state = (actuatorType === 'filter_unit' || actuatorType === 'exhaust_fan') ? 'ON' : 'OFF';
        }
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
        if (col) {
            await col.updateOne(
                { actuator_type: actuatorType },
                { $set: updateDoc },
                { upsert: true }
            );
        }
    } catch (mErr) {
        console.warn('[Actuator Mongo Update Notice]:', mErr.message);
    }

    try {
        const { setESP32Actuator } = await import('./esp32SerialService.js');
        setESP32Actuator(actuatorType, state);
    } catch (_e) {}

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
