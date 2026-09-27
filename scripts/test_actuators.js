

async function testControl(actuatorType, action, nodeUrl, expectedMode) {
    console.log(`\n🧪 Testing website endpoint -> Express -> ESP32: [${actuatorType}] -> ${action}`);
    
    // 1. Post to Express endpoint (same endpoint used by React UI)
    const res = await fetch('http://localhost:5173/api/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actuator_type: actuatorType, action: action })
    });

    if (!res.ok) {
        console.error(`❌ Express API failed with status ${res.status}`);
        return false;
    }

    const expressJson = await res.json();
    console.log(`   Express Response:`, expressJson.message);

    // 2. Query target ESP32 node directly to verify physical hardware state
    const statusRes = await fetch(`${nodeUrl}/api/status`);
    if (!statusRes.ok) {
        console.error(`❌ ESP32 ${nodeUrl}/api/status query failed!`);
        return false;
    }

    const statusJson = await statusRes.json();
    console.log(`   ESP32 Hardware State (${nodeUrl}):`, {
        device_id: statusJson.device_id,
        mode: statusJson.mode,
        relay: statusJson.relay,
        pump: statusJson.pump,
        grow_light: statusJson.grow_light
    });

    const isMatch = statusJson.mode === expectedMode;
    if (isMatch) {
        console.log(`✅ VERIFIED: Hardware state matches expected mode [${expectedMode}]!`);
    } else {
        console.error(`❌ MISMATCH: Expected mode [${expectedMode}] but ESP32 reports [${statusJson.mode}]!`);
    }

    return isMatch;
}

async function runAllTests() {
    console.log('====================================================');
    console.log('🚀 ENVIROX ACTUATOR VERIFICATION TEST SUITE');
    console.log('====================================================');

    console.log('\n--- NODE 1 GROW LIGHT TESTS ---');
    await testControl('grow_lights', 'OFF', 'http://node1.local', 'MANUAL_OFF');
    await testControl('grow_lights', 'ON', 'http://node1.local', 'MANUAL_ON');
    await testControl('grow_lights', 'OFF', 'http://node1.local', 'MANUAL_OFF');
    await testControl('grow_lights', 'AUTO', 'http://node1.local', 'AUTO');

    console.log('\n--- NODE 2 WATER PUMP TESTS ---');
    await testControl('water_pump', 'OFF', 'http://node2.local', 'MANUAL_OFF');
    await testControl('water_pump', 'ON', 'http://node2.local', 'MANUAL_ON');
    await testControl('water_pump', 'OFF', 'http://node2.local', 'MANUAL_OFF');
    await testControl('water_pump', 'AUTO', 'http://node2.local', 'AUTO');

    console.log('\n====================================================');
    console.log('🎉 ALL ACTUATOR HARDWARE TESTS COMPLETED');
    console.log('====================================================');
}

runAllTests().catch(console.error);
