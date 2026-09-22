
const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';

async function runTests() {
    console.log('🧪 ============================================================');
    console.log('🌱 TESTING ESP32-S3 SENSOR INGESTION & AI DIAGNOSIS ENGINE');
    console.log(`🌐 Base Target: ${BASE_URL}`);
    console.log('🧪 ============================================================\n');

    let passed = 0;
    let failed = 0;

    const assert = (condition, testName, details = '') => {
        if (condition) {
            console.log(`✅ [PASS] ${testName}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${testName} - ${details}`);
            failed++;
        }
    };

    try {
        console.log('📌 Test 1: Fetching Initial Sensor Telemetry (GET /data)...');
        const resGet1 = await fetch(`${BASE_URL}/data`);
        assert(resGet1.ok, 'GET /data responds with HTTP 200');
        const data1 = await resGet1.json();
        assert(data1.device !== undefined, 'GET /data contains device field', JSON.stringify(data1));
        assert(data1.lux !== undefined, 'GET /data contains lux field', `lux=${data1.lux}`);

        console.log('\n📌 Test 2: Ingesting BH1750 Single Sensor JSON (POST /data)...');
        const bh1750Payload = {
            device: "ESP32-S3-01",
            sensor: "BH1750",
            lux: 523.45,
            unit: "lux",
            status: "OK"
        };
        const resPost1 = await fetch(`${BASE_URL}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bh1750Payload)
        });
        assert(resPost1.ok, 'POST /data accepted BH1750 payload');
        const postResult1 = await resPost1.json();
        assert(postResult1.status === 'success', 'POST /data returns success status');
        assert(postResult1.data.lux === 523.45, 'POST /data parsed exact lux value 523.45');

        const resGet2 = await fetch(`${BASE_URL}/data`);
        const data2 = await resGet2.json();
        assert(data2.lux === 523.45, 'GET /data returns updated BH1750 lux value 523.45');

        console.log('\n📌 Test 3: AI Diagnosis with Only Light Sensor Data (GET /api/diagnosis)...');
        const resDiag1 = await fetch(`${BASE_URL}/api/diagnosis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sensorData: {
                    device: "ESP32-S3-01",
                    sensor: "BH1750",
                    lux: 523.45,
                    unit: "lux",
                    soil_moisture: null
                }
            })
        });
        assert(resDiag1.ok, 'GET /api/diagnosis responds with HTTP 200');
        const diag1 = await resDiag1.json();
        assert(diag1.device.id === 'ESP32-S3-01', 'Diagnosis JSON contains correct device ID');
        assert(diag1.environment.light.value === 523.45, 'Diagnosis JSON contains exact light lux value');
        assert(diag1.soil.moisture.value === null, 'Soil moisture value is strictly null');
        assert(diag1.diagnosis.irrigation.reason === 'insufficient_sensor_data', 
            'Irrigation diagnosis reports "insufficient_sensor_data" when soil moisture is null',
            `actual reason: ${diag1.diagnosis.irrigation.reason}`);
        assert(diag1.diagnosis.irrigation.required === false, 'Irrigation is not required when data is absent');

        console.log('\n📌 Test 4: Ingesting Multi-Sensor Telemetry Payload (POST /data)...');
        const multiSensorPayload = {
            device: "ESP32-S3-01",
            temperature: 28.4,
            humidity: 62.0,
            soil_moisture: 35.5,
            soil_ph: 6.7,
            co2: 435.0,
            nitrogen: 24.0,
            phosphorus: 32.0,
            potassium: 54.0,
            lux: 1850.0
        };
        const resPost2 = await fetch(`${BASE_URL}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(multiSensorPayload)
        });
        assert(resPost2.ok, 'POST /data accepted multi-sensor payload');
        const postResult2 = await resPost2.json();
        assert(postResult2.data.soil_moisture === 35.5, 'Multi-sensor soil moisture parsed correctly');
        assert(postResult2.data.temperature === 28.4, 'Multi-sensor temperature parsed correctly');

        console.log('\n📌 Test 5: AI Irrigation Diagnosis for Dry Soil (<40%)...');
        const resDiag2 = await fetch(`${BASE_URL}/api/diagnosis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sensorData: multiSensorPayload
            })
        });
        const diag2 = await resDiag2.json();
        assert(diag2.diagnosis.irrigation.required === true, 'Irrigation required is TRUE for 35.5% moisture');
        assert(diag2.diagnosis.irrigation.priority === 'HIGH', 'Irrigation priority is HIGH for 35.5% moisture');
        assert(diag2.diagnosis.nutrient_deficiency.name === 'Nitrogen', 'Nutrient deficiency detects low Nitrogen (24 ppm < 30 ppm)');

        console.log('\n📌 Test 6: AI Confidence Handling (<70% Threshold -> Uncertain)...');
        const resDiag3 = await fetch(`${BASE_URL}/api/diagnosis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                visionPrediction: {
                    disease: {
                        name: "Leaf Spot",
                        confidence: 62.4,
                        severity: "low"
                    },
                    pest: {
                        name: "Unknown Beetle",
                        confidence: 58.0,
                        severity: "low"
                    }
                }
            })
        });
        const diag3 = await resDiag3.json();
        assert(diag3.diagnosis.disease.name === 'uncertain', 'Disease with 62.4% confidence marked as "uncertain"');
        assert(diag3.diagnosis.disease.severity === 'uncertain', 'Disease severity marked as "uncertain"');
        assert(diag3.diagnosis.pest.name === 'uncertain', 'Pest with 58.0% confidence marked as "uncertain"');

        console.log('\n📌 Test 7: Error Handling for Malformed Payload...');
        const resBad = await fetch(`${BASE_URL}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'invalid-non-json'
        });
        assert(resBad.status === 400, 'Malformed JSON returns HTTP 400 Bad Request');

        console.log('\n============================================================');
        console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
        console.log('============================================================\n');

        if (failed > 0) process.exit(1);

    } catch (err) {
        console.error('💥 Test Execution Error:', err);
        process.exit(1);
    }
}

runTests();
