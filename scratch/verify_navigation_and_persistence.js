const http = require('http');

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 5173,
            path: path,
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers }));
        });
        req.on('error', reject);
        req.end();
    });
}

function fetchPiAiResults() {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 5173,
            path: '/api/ai/results',
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function runTest() {
    console.log('--- STARTING SPA NAVIGATION & SCAN PERSISTENCE VERIFICATION ---');

    // 1. Verify Vite frontend routes
    const plantPageRes = await makeRequest('/plant');
    console.log('GET /plant HTTP Status:', plantPageRes.statusCode);

    const weatherPageRes = await makeRequest('/dashboard/weather');
    console.log('GET /dashboard/weather (Pest) HTTP Status:', weatherPageRes.statusCode);

    // 2. Verify /api/ai/results return valid cycle_count and telemetry for Crop & Pest
    const telemetry = await fetchPiAiResults();
    console.log('Pi AI Telemetry sample:', {
        cycle_count: telemetry?.cycle_count,
        crop_ai: telemetry?.crop_ai?.crop_name,
        pest_detected: telemetry?.has_pest || telemetry?.yolo?.pest_count > 0,
        timestamp: telemetry?.timestamp
    });

    if (!telemetry || !telemetry.cycle_count) {
        console.error('FAILED: No valid Pi AI telemetry returned');
        process.exit(1);
    }

    const cycle = telemetry.cycle_count;

    // 3. Verify Crop frame endpoint with cycle cache-busting
    const cropFrameRes = await makeRequest(`/api/ai/crop-nutrient-frame?frame=${cycle}`);
    console.log(`GET /api/ai/crop-nutrient-frame?frame=${cycle} HTTP Status:`, cropFrameRes.statusCode, 'ContentType:', cropFrameRes.headers['content-type']);

    // 4. Verify Pest frame endpoint with cycle cache-busting
    const pestFrameRes = await makeRequest(`/api/ai/pest-frame?frame=${cycle}`);
    console.log(`GET /api/ai/pest-frame?frame=${cycle} HTTP Status:`, pestFrameRes.statusCode, 'ContentType:', pestFrameRes.headers['content-type']);

    if (cropFrameRes.statusCode === 200 && pestFrameRes.statusCode === 200) {
        console.log('✅ ALL API & FRAME VERIFICATIONS PASSED SUCCESSFULLY!');
    } else {
        console.error('FAILED: Frame endpoints returned non-200 status');
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
