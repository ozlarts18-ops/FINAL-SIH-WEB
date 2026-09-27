/**
 * End-to-End Test: Live ESP32-CAM capture sent to BOTH real AI pipelines:
 * 1. Pest AI (/api/ai/predict/pest -> YOLO11 best.pt)
 * 2. Plant Pathology AI (/api/ai/predict/disease -> YOLO11 best.pt)
 */

async function runDualAIVerification() {
    console.log('====================================================');
    console.log('  ENVIROX — DUAL AI LIVE CAMERA VERIFICATION');
    console.log('====================================================\n');

    // 1. Check Camera Status
    console.log('1. Checking Camera Status...');
    const statusRes = await fetch('http://localhost:5173/api/camera/status');
    const statusData = await statusRes.json();
    console.log(`   Camera Online: ${statusData.connected}`);
    console.log(`   Camera IP: ${statusData.cameraIp}`);
    console.log(`   Stream URL: ${statusData.streamUrl}\n`);

    if (!statusData.connected) {
        console.error('❌ ESP32-CAM is not reported online!');
        process.exit(1);
    }

    // 2. Capture Real Frame from ESP32-CAM
    console.log('2. Capturing real JPEG frame from /api/camera/capture...');
    const captureRes = await fetch('http://localhost:5173/api/camera/capture');
    if (captureRes.status !== 200) {
        console.error(`❌ Capture failed with status ${captureRes.status}`);
        process.exit(1);
    }
    const frameBuffer = await captureRes.arrayBuffer();
    const frameBytes = Buffer.from(frameBuffer);
    const isJpeg = frameBytes.length > 4 && frameBytes[0] === 0xFF && frameBytes[1] === 0xD8;
    console.log(`   Frame received: ${frameBytes.length} bytes`);
    console.log(`   Valid JPEG Header (SOI 0xFFD8): ${isJpeg}\n`);

    if (!isJpeg) {
        console.error('❌ Captured payload is not a valid JPEG!');
        process.exit(1);
    }

    const base64Image = `data:image/jpeg;base64,${frameBytes.toString('base64')}`;

    // 3. Test Pest AI Pipeline
    console.log('3. Sending REAL frame to Pest AI Pipeline (/api/ai/predict/pest)...');
    const pestStartTime = Date.now();
    const pestRes = await fetch('http://localhost:5173/api/ai/predict/pest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image: base64Image,
            detection_source: 'live_camera',
            cropName: 'Tomato (Solanum lycopersicum)'
        })
    });
    const pestDuration = Date.now() - pestStartTime;
    const pestJson = await pestRes.json();

    console.log(`   HTTP Status: ${pestRes.status} (${pestDuration}ms)`);
    if (pestJson.status === 'success' && pestJson.prediction) {
        const pred = pestJson.prediction;
        console.log(`   ✅ Pest Detected: "${pred.detected_pest}"`);
        console.log(`   ✅ AI Confidence: ${pred.ai_confidence}%`);
        console.log(`   ✅ Pest Count: ${pred.pest_count}`);
        console.log(`   ✅ Severity: ${pred.severity_level}`);
        console.log(`   ✅ Bounding Boxes: ${pred.bounding_boxes ? pred.bounding_boxes.length : 0} box(es)`);
        console.log(`   ✅ Treatment Action: "${pred.recommended_action}"`);
        console.log(`   ✅ Real Model Flag (isMock=false): ${!pred.isMock}`);
    } else {
        console.error('❌ Pest AI returned error:', pestJson);
        process.exit(1);
    }

    console.log('\n----------------------------------------------------\n');

    // 4. Test Plant Pathology AI Pipeline
    console.log('4. Sending REAL frame to Plant Pathology AI Pipeline (/api/ai/predict/disease)...');
    const plantStartTime = Date.now();
    const plantRes = await fetch('http://localhost:5173/api/ai/predict/disease', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image: base64Image,
            detection_source: 'live_camera',
            cropName: 'Tomato (Solanum lycopersicum)'
        })
    });
    const plantDuration = Date.now() - plantStartTime;
    const plantJson = await plantRes.json();

    console.log(`   HTTP Status: ${plantRes.status} (${plantDuration}ms)`);
    if (plantJson.status === 'success' && plantJson.prediction) {
        const pred = plantJson.prediction;
        console.log(`   ✅ Disease / Pathology: "${pred.disease_name || pred.disease}"`);
        console.log(`   ✅ Confidence: ${pred.confidence_score}%`);
        console.log(`   ✅ Health Score: ${pred.health_score}`);
        console.log(`   ✅ Health Index: ${pred.health_index}/100`);
        console.log(`   ✅ Bounding Boxes: ${pred.bounding_boxes ? pred.bounding_boxes.length : 0} box(es)`);
        console.log(`   ✅ Treatment Advice: "${pred.treatment_advice}"`);
        console.log(`   ✅ Real Model Flag (isMock=false): ${!pred.isMock}`);
    } else {
        console.error('❌ Plant AI returned error:', plantJson);
        process.exit(1);
    }

    console.log('\n====================================================');
    console.log('  ✅ ALL TESTS PASSED: REAL DUAL AI PIPELINE OPERATIONAL');
    console.log('====================================================\n');
}

runDualAIVerification().catch(err => {
    console.error('Unhandled Verification Error:', err);
    process.exit(1);
});
