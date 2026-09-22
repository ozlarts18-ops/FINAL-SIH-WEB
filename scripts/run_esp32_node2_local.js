
const TARGET_URL = process.env.SERVER_URL || 'http://localhost:5173/data';
const DEVICE_ID = 'ESP32-S3-02';
const INTERVAL_MS = 2500;

console.log('======================================================================');
console.log('🌿 ENVIROX ESP32-S3 #2 (ESP32-S3-02) LOCAL TELEMETRY DAEMON');
console.log(`📡 Ingestion Endpoint: ${TARGET_URL}`);
console.log(`⏱️  Cycle Interval:    ${INTERVAL_MS} ms`);
console.log('======================================================================\n');

let step = 0;

function computeSoilMoisture(soilADC) {
    let moisture;
    if (soilADC === 0) {
        moisture = 0;
    } else if (soilADC <= 10) {
        moisture = 5;
    } else if (soilADC <= 500) {
        moisture = 30;
    } else if (soilADC <= 1641) {
        moisture = Math.round(31 + ((soilADC - 501) * (99 - 31)) / (1641 - 501));
    } else {
        moisture = 100;
    }
    return Math.max(0, Math.min(100, moisture));
}

function computePH(phADC) {
    const phVoltage = (phADC / 4095.0) * 3.3;
    let pH = 7.0 + ((1.779 - phVoltage) / 0.18);
    pH = Math.max(0.0, Math.min(14.0, pH));
    return { phVoltage, pH: parseFloat(pH.toFixed(2)) };
}

function computeTurbidity(turbidityADC) {
    const turbidityVoltage = (turbidityADC / 4095.0) * 3.3;
    return parseFloat(turbidityVoltage.toFixed(3));
}

async function cycle() {
    step++;

    const soilADC = Math.round(1150 + Math.sin(step * 0.15) * 220);
    const moisture = computeSoilMoisture(soilADC);

    const phADC = Math.round(2210 + Math.sin(step * 0.12) * 60);
    const { pH } = computePH(phADC);

    const turbidityADC = Math.round(1526 + Math.cos(step * 0.1) * 70);
    const turbidityVoltage = computeTurbidity(turbidityADC);

    let phStatus = 'NEUTRAL';
    if (pH < 6.0) {
        phStatus = 'ACIDIC';
    } else if (pH > 8.0) {
        phStatus = 'ALKALINE';
    }

    console.log('======================================');
    console.log('ESP32-S3 #2 SENSOR STATUS');
    console.log('======================================');
    console.log(`Soil Moisture: ${moisture} %`);
    console.log(`pH: ${pH.toFixed(2)}`);
    console.log(`pH Status: ${phStatus}`);
    console.log(`Turbidity Voltage: ${turbidityVoltage.toFixed(3)} V`);

    const payload = {
        device: DEVICE_ID,
        soilMoisture: moisture,
        pH: pH,
        turbidityVoltage: turbidityVoltage
    };

    console.log(`Payload: ${JSON.stringify(payload)}`);

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
    } catch (err) {
        console.error(`[HTTP Error] Failed to reach ${TARGET_URL}:`, err.message);
    }

    console.log();
}

cycle();

setInterval(cycle, INTERVAL_MS);
