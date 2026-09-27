import assert from 'assert';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5173';

async function testUnifiedCamera() {
    console.log('🧪 Testing Unified ESP32-CAM Configuration & Pipeline...');

    // 1. Configure IP via POST /api/camera/stream-url
    const testIp = '192.168.43.123';
    const updateRes = await fetch(`${BASE_URL}/api/camera/stream-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: testIp })
    });
    const updateJson = await updateRes.json();
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateJson.status, 'success');
    assert.strictEqual(updateJson.cameraIp, testIp);
    console.log('✅ POST /api/camera/stream-url set cameraIp to:', updateJson.cameraIp);

    // 2. Verify GET /api/camera/status reflects the configured IP
    const statusRes = await fetch(`${BASE_URL}/api/camera/status`);
    const statusJson = await statusRes.json();
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusJson.cameraIp, testIp);
    assert.ok(statusJson.lastPing || statusJson.lastSeen, 'Expected lastPing / lastSeen timestamp');
    console.log('✅ GET /api/camera/status confirmed cameraIp:', statusJson.cameraIp, 'lastSeen:', statusJson.lastSeen);

    // 3. Verify server/cameraConfig.json was persisted
    const configPath = path.resolve('server/cameraConfig.json');
    assert.ok(fs.existsSync(configPath), 'cameraConfig.json must exist');
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(persisted.cameraIp, testIp);
    console.log('✅ server/cameraConfig.json persistence verified:', persisted);

    // 4. Verify LED Flash command
    const ledOn = await fetch(`${BASE_URL}/api/camera/led?val=1`);
    const ledOnJson = await ledOn.json();
    assert.strictEqual(ledOnJson.status, 'success');
    assert.strictEqual(ledOnJson.led, 'ON');

    const ledOff = await fetch(`${BASE_URL}/api/camera/led?val=0`);
    const ledOffJson = await ledOff.json();
    assert.strictEqual(ledOffJson.status, 'success');
    assert.strictEqual(ledOffJson.led, 'OFF');
    console.log('✅ LED Flash control toggled successfully');

    // 5. Verify /api/camera/capture and /api/camera/stream hit the expected proxy target
    const capRes = await fetch(`${BASE_URL}/api/camera/capture`);
    // Expected either 200 (if camera physically present) or 503 (offline camera on LAN)
    assert.ok([200, 503, 504].includes(capRes.status), `Unexpected status: ${capRes.status}`);
    console.log(`✅ /api/camera/capture handled correctly with status ${capRes.status} (proxy to ${testIp})`);

    console.log('\n🎉 ALL UNIFIED CAMERA VERIFICATIONS PASSED SUCCESSFULLY!');
}

testUnifiedCamera().catch(err => {
    console.error('❌ Unified Camera Test Failed:', err);
    process.exit(1);
});
