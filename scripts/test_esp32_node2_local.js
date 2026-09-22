
const TARGET_URL = process.env.SERVER_URL || 'http://localhost:5173/data';

console.log('=================================================================');
console.log('🚀 TESTING ESP32-S3 #2 (ESP32-S3-02) LOCAL TELEMETRY STREAM');
console.log(`📡 Ingestion Endpoint: ${TARGET_URL}`);
console.log('=================================================================\n');

async function sendCycle(cycleNum) {
    const soilMoisture = Math.floor(65 + Math.sin(cycleNum * 0.3) * 15);
    const pH = parseFloat((6.8 + Math.sin(cycleNum * 0.2) * 0.4).toFixed(2));
    const turbidityVoltage = parseFloat((1.23 + Math.sin(cycleNum * 0.1) * 0.15).toFixed(3));

    const phStatus = pH < 6.0 ? 'ACIDIC' : (pH <= 8.0 ? 'NEUTRAL' : 'ALKALINE');

    const payload = {
        device: 'ESP32-S3-02',
        soilMoisture: soilMoisture,
        pH: pH,
        turbidityVoltage: turbidityVoltage
    };

    console.log(`\n======================================`);
    console.log(`[Cycle #${cycleNum}] ESP32-S3 #2 SENSOR STATUS`);
    console.log(`======================================`);
    console.log(`Soil Moisture: ${soilMoisture} %`);
    console.log(`pH: ${pH.toFixed(2)}`);
    console.log(`pH Status: ${phStatus}`);
    console.log(`Turbidity Voltage: ${turbidityVoltage.toFixed(3)} V`);
    console.log(`Payload: ${JSON.stringify(payload)}`);

    try {
        const startTime = Date.now();
        const response = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const elapsed = Date.now() - startTime;
        const resBody = await response.json();

        console.log(`POST -> ${TARGET_URL}`);
        console.log(`HTTP Response Code: ${response.status} (${elapsed}ms)`);
        console.log(`Server Response:`, JSON.stringify(resBody));
    } catch (err) {
        console.error(`❌ HTTP Request Failed:`, err.message);
    }
}

async function run() {
    for (let i = 1; i <= 5; i++) {
        await sendCycle(i);
        if (i < 5) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    console.log('\n✅ ESP32-S3 #2 local telemetry test completed successfully.');
}

run();
