
const TARGET_URL = process.env.SERVER_URL || 'http://localhost:5173/data';
const DEVICE_ID = 'ESP32-S3-01';
const INTERVAL_MS = 2500;

console.log('======================================================================');
console.log('💨 ENVIROX ESP32-S3 #1 (ESP32-S3-01) LOCAL AIR TELEMETRY DAEMON');
console.log(`📡 Ingestion Endpoint: ${TARGET_URL}`);
console.log(`⏱️  Cycle Interval:    ${INTERVAL_MS} ms`);
console.log('======================================================================\n');

let step = 0;

async function cycle() {
    step++;

    const temperature = parseFloat((26.5 + Math.sin(step * 0.1) * 3.5).toFixed(1));
    const humidity = parseFloat((58.0 + Math.cos(step * 0.08) * 12.0).toFixed(1));
    const lux = parseFloat(Math.max(10, Math.round(520 + Math.sin(step * 0.15) * 350)).toFixed(1));

    const gasRaw = Math.round(400 + Math.sin(step * 0.05) * 300);
    const gasDetected = gasRaw > 1500;

    const rainRaw = Math.round(3800 - Math.cos(step * 0.04) * 400);
    const rainDetected = rainRaw < 3500;

    const buzzerActive = gasDetected || rainDetected;

    console.log('======================================');
    console.log('        ENVIROX ESP32-S3 #1');
    console.log('======================================');
    console.log(`Temperature: ${temperature.toFixed(1)} C`);
    console.log(`Humidity: ${humidity.toFixed(1)} %`);
    console.log(`Light: ${lux.toFixed(1)} lux`);
    console.log(`Gas detected: ${gasDetected ? 'YES' : 'NO'}`);
    console.log(`Rain detected: ${rainDetected ? 'YES' : 'NO'}`);
    console.log(`Buzzer: ${buzzerActive ? 'ON' : 'OFF'}`);

    const payload = {
        device: DEVICE_ID,
        temperature: temperature,
        humidity: humidity,
        lux: lux,
        gasDetected: gasDetected,
        rainDetected: rainDetected,
        buzzer: buzzerActive
    };

    console.log('\nENVIROX TELEMETRY');
    console.log(JSON.stringify(payload));

    try {
        const res = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`POST -> ${TARGET_URL}`);
        console.log(`HTTP Response Code: ${res.status}`);

        const body = await res.json();
        console.log('Server Response:', JSON.stringify(body));
        if (res.status >= 200 && res.status < 300) {
            console.log('EnviroX: DATA SENT SUCCESSFULLY');
        }
    } catch (err) {
        console.error(`[HTTP Error] Failed to reach ${TARGET_URL}:`, err.message);
    }

    console.log();
}

cycle();

setInterval(cycle, INTERVAL_MS);
