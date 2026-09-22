
async function runCameraTests() {
    const BASE_URL = 'http://localhost:5173';
    console.log('================================================================');
    console.log('🧪 ENVIROX ESP32-CAM & MOBILE HOTSPOT INTEGRATION TEST SUITE');
    console.log('================================================================\n');

    let passed = 0;
    let failed = 0;

    const assert = (condition, title, details = '') => {
        if (condition) {
            console.log(`✅ [PASS] ${title}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${title} - ${details}`);
            failed++;
        }
    };

    console.log('--- 1. Testing Hotspot Telemetry Auto-Discovery ---');
    try {
        const camPayload = {
            device: "ESP32-CAM",
            ip: "192.168.43.105",
            streamUrl: "http://192.168.43.105/stream",
            snapshotUrl: "http://192.168.43.105/capture",
            targetNode: "ESP32-S3-02",
            status: "ONLINE",
            rssi: -58
        };

        const postRes = await fetch(`${BASE_URL}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(camPayload)
        });
        const postJson = await postRes.json();
        assert(postRes.status === 200 && postJson.status === 'success', 'ESP32-CAM Telemetry Ingestion (POST /data)', JSON.stringify(postJson));
    } catch (e) {
        assert(false, 'ESP32-CAM Telemetry Ingestion', e.message);
    }

    console.log('\n--- 2. Testing Camera Status Endpoint ---');
    try {
        const statusRes = await fetch(`${BASE_URL}/api/camera/status`);
        const statusJson = await statusRes.json();
        assert(statusRes.status === 200 && statusJson.status === 'success', 'Camera Status Query (GET /api/camera/status)', JSON.stringify(statusJson));
        assert(statusJson.streamUrl.includes('192.168.43.105'), 'Camera Stream URL correctly updated with Hotspot IP', statusJson.streamUrl);
    } catch (e) {
        assert(false, 'Camera Status Query', e.message);
    }

    console.log('\n--- 3. Testing Camera Flashlight LED Controls ---');
    try {
        const ledOnRes = await fetch(`${BASE_URL}/api/camera/led?val=1`);
        const ledOnJson = await ledOnRes.json();
        assert(ledOnRes.status === 200 && ledOnJson.led === 'ON', 'Turn Flash LED ON (GET /api/camera/led?val=1)', JSON.stringify(ledOnJson));

        const ledOffRes = await fetch(`${BASE_URL}/api/camera/led?val=0`);
        const ledOffJson = await ledOffRes.json();
        assert(ledOffRes.status === 200 && ledOffJson.led === 'OFF', 'Turn Flash LED OFF (GET /api/camera/led?val=0)', JSON.stringify(ledOffJson));
    } catch (e) {
        assert(false, 'Flash LED Control', e.message);
    }

    console.log('\n--- 4. Testing Manual IP / Stream URL Update ---');
    try {
        const updateRes = await fetch(`${BASE_URL}/api/camera/stream-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ streamUrl: 'http://192.168.43.200/stream' })
        });
        const updateJson = await updateRes.json();
        assert(updateRes.status === 200 && updateJson.status === 'success', 'Custom Stream URL Update (POST /api/camera/stream-url)', JSON.stringify(updateJson));

        const verifyRes = await fetch(`${BASE_URL}/api/camera/status`);
        const verifyJson = await verifyRes.json();
        assert(verifyJson.streamUrl === 'http://192.168.43.200/stream', 'Verified new Stream URL in Camera Status', verifyJson.streamUrl);
    } catch (e) {
        assert(false, 'Custom Stream URL Update', e.message);
    }

    console.log('\n================================================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runCameraTests().catch (err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
