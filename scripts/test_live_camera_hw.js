import http from 'http';

async function testEndpoint(url, name, isBinary = false) {
    return new Promise((resolve) => {
        const u = new URL(url);
        const req = http.request({
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname + (u.search || ''),
            method: 'GET',
            timeout: 5000
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => {
                chunks.push(chunk);
                if (name.includes('stream') && chunks.length >= 3) {
                    req.destroy();
                    const totalBytes = chunks.reduce((acc, c) => acc + c.length, 0);
                    resolve({ pass: true, statusCode: res.statusCode, contentType: res.headers['content-type'], totalBytes });
                }
            });
            res.on('end', () => {
                const totalBytes = chunks.reduce((acc, c) => acc + c.length, 0);
                const body = Buffer.concat(chunks);
                if (isBinary) {
                    const isJpeg = body.length > 4 && body[0] === 0xFF && body[1] === 0xD8;
                    resolve({ pass: res.statusCode === 200 && isJpeg, statusCode: res.statusCode, isJpeg, totalBytes });
                } else {
                    let text = body.toString('utf-8');
                    try { text = JSON.parse(text); } catch (_e) {}
                    resolve({ pass: res.statusCode === 200, statusCode: res.statusCode, data: text, totalBytes });
                }
            });
        });

        req.on('timeout', () => { req.destroy(); resolve({ pass: false, error: 'TIMEOUT' }); });
        req.on('error', (err) => { resolve({ pass: false, error: err.message }); });
        req.end();
    });
}

async function run() {
    const camIp = '10.140.217.7';
    console.log(`\n========================================================`);
    console.log(`1. DIRECT ESP32-CAM ENDPOINTS (http://${camIp})`);
    console.log(`========================================================`);
    const statusRes = await testEndpoint(`http://${camIp}/status`, '/status');
    console.log('GET /status  :', statusRes.pass ? 'PASS' : 'FAIL', JSON.stringify(statusRes));

    const captureRes = await testEndpoint(`http://${camIp}/capture`, '/capture', true);
    console.log('GET /capture :', captureRes.pass ? 'PASS' : 'FAIL', JSON.stringify(captureRes));

    const streamRes = await testEndpoint(`http://${camIp}/stream`, '/stream');
    console.log('GET /stream  :', streamRes.pass ? 'PASS' : 'FAIL', JSON.stringify(streamRes));

    console.log(`\n========================================================`);
    console.log(`2. ENVIROX BACKEND CAMERA PROXY (http://localhost:5173)`);
    console.log(`========================================================`);
    const backendStatus = await testEndpoint('http://localhost:5173/api/camera/status', 'Backend status');
    console.log('GET /api/camera/status  :', backendStatus.pass ? 'PASS' : 'FAIL', JSON.stringify(backendStatus));

    const backendCapture = await testEndpoint('http://localhost:5173/api/camera/capture', 'Backend capture', true);
    console.log('GET /api/camera/capture :', backendCapture.pass ? 'PASS' : 'FAIL', JSON.stringify(backendCapture));
}

run();
