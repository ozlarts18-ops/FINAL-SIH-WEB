
const TARGET_URL = process.env.SERVER_URL || 'http://localhost:5173/data';
const INTERVAL_MS = 2500;

console.log('======================================================================');
console.log('🌱 ENVIROX UNIFIED MULTI-NODE LOCAL HARDWARE SIMULATOR & TELEMETRY LINK');
console.log(`📡 Ingestion Endpoint: ${TARGET_URL}`);
console.log(`⏱️  Cycle Interval:    ${INTERVAL_MS} ms`);
console.log('📡 Active Nodes:');
console.log('   🔹 Node 1 [ESP32-S3-01] -> DHT22 (Temp/Hum), BH1750 (Lux), MQ-2 (Gas), Rain, Buzzer');
console.log('   🔹 Node 2 [ESP32-S3-02] -> Soil Moisture, pH Sensor, Turbidity Voltage');
console.log('======================================================================\n');

let step = 0;

function computeSoilMoisture(soilADC) {
    let moisture;
    if (soilADC === 0) moisture = 0;
    else if (soilADC <= 10) moisture = 5;
    else if (soilADC <= 500) moisture = 30;
    else if (soilADC <= 1641) moisture = Math.round(31 + ((soilADC - 501) * (99 - 31)) / (1641 - 501));
    else moisture = 100;
    return Math.max(0, Math.min(100, moisture));
}

function computePH(phADC) {
    const phVoltage = (phADC / 4095.0) * 3.3;
    let pH = 7.0 + ((1.779 - phVoltage) / 0.18);
    pH = Math.max(0.0, Math.min(14.0, pH));
    return parseFloat(pH.toFixed(2));
}

function computeTurbidity(turbidityADC) {
    const turbidityVoltage = (turbidityADC / 4095.0) * 3.3;
    return parseFloat(turbidityVoltage.toFixed(3));
}

async function postTelemetry(payload, nodeName) {
    try {
        const start = Date.now();
        const res = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const elapsed = Date.now() - start;
        const resJson = await res.json();
        console.log(`[${nodeName}] POST -> ${TARGET_URL} | HTTP ${res.status} (${elapsed}ms) | Server: ${resJson.status || 'OK'}`);
    } catch (err) {
        console.error(`❌ [${nodeName}] Failed to send telemetry:`, err.message);
    }
}

async function cycle() {
    step++;
    const timestamp = new Date().toLocaleTimeString();

    console.log(`\n======================================================================`);
    console.log(`⏱️  [CYCLE #${step}] - ${timestamp} TELEMETRY BROADCAST`);
    console.log(`======================================================================`);

    const temp = parseFloat((26.8 + Math.sin(step * 0.1) * 3.2).toFixed(1));
    const hum = parseFloat((58.5 + Math.cos(step * 0.08) * 11.5).toFixed(1));
    const lux = parseFloat(Math.max(10, Math.round(520 + Math.sin(step * 0.15) * 350)).toFixed(1));
    const gasRaw = Math.round(420 + Math.sin(step * 0.05) * 300);
    const gasDetected = gasRaw > 1500;
    const rainRaw = Math.round(3800 - Math.cos(step * 0.04) * 400);
    const rainDetected = rainRaw < 3500;
    const node1Payload = {
        device: "ESP32-S3-01",
        temperature: temp,
        humidity: hum,
        lux: lux,
        gasDetected: gasDetected,
        rainDetected: rainDetected
    };

    console.log(`🔹 [ESP32-S3-01 Air Node]: Temp: ${temp}°C | Hum: ${hum}% | Lux: ${lux} lx | Gas: ${gasDetected ? 'YES' : 'NO'} | Rain: ${rainDetected ? 'YES' : 'NO'}`);
    console.log(`   Payload: ${JSON.stringify(node1Payload)}`);

    const soilADC = Math.round(1160 + Math.sin(step * 0.15) * 220);
    const moisture = computeSoilMoisture(soilADC);
    const phADC = Math.round(2210 + Math.sin(step * 0.12) * 60);
    const pH = computePH(phADC);
    const phStatus = pH < 6.0 ? 'ACIDIC' : (pH <= 8.0 ? 'NEUTRAL' : 'ALKALINE');
    const turbidityADC = Math.round(1526 + Math.cos(step * 0.1) * 70);
    const turbidityVoltage = computeTurbidity(turbidityADC);

    const node2Payload = {
        device: "ESP32-S3-02",
        soilMoisture: moisture,
        pH: pH,
        turbidityVoltage: turbidityVoltage
    };

    console.log(`🔹 [ESP32-S3-02 Soil/Water]: Soil Moisture: ${moisture}% | pH: ${pH} (${phStatus}) | Turbidity: ${turbidityVoltage}V`);
    console.log(`   Payload: ${JSON.stringify(node2Payload)}`);

    await Promise.all([
        postTelemetry(node1Payload, 'ESP32-S3-01'),
        postTelemetry(node2Payload, 'ESP32-S3-02')
    ]);
}

cycle();

setInterval(cycle, INTERVAL_MS);
