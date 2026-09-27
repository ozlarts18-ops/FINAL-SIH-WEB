/**
 * Test continuous ESP32-CAM stream for 65 seconds with concurrent frame capture
 */
import http from 'http';

async function testStreamFor65Seconds(targetUrl) {
    return new Promise((resolve) => {
        console.log(`Starting continuous stream test against: ${targetUrl}`);
        console.log(`Target duration: 65 seconds (Must not drop after ~10 seconds)`);

        const u = new URL(targetUrl);
        const startTime = Date.now();
        let frameCount = 0;
        let totalBytes = 0;
        let lastReport = startTime;
        let completed = false;

        const req = http.request({
            hostname: u.hostname,
            port: u.port || 80,
            path: u.pathname + (u.search || ''),
            method: 'GET'
        }, (res) => {
            console.log(`HTTP ${res.statusCode} received. Content-Type: ${res.headers['content-type']}`);

            if (res.statusCode !== 200) {
                resolve({ pass: false, error: `HTTP status ${res.statusCode}` });
                return;
            }

            // Trigger concurrent snapshot at 20s, 35s, 50s
            const triggerCapture = (sec) => {
                setTimeout(async () => {
                    if (completed) return;
                    console.log(`\n📸 [Second ${sec}] Testing concurrent /capture while streaming...`);
                    try {
                        const snapRes = await fetch('http://localhost:5173/api/camera/capture');
                        const snapBuf = await snapRes.arrayBuffer();
                        const isJpeg = snapBuf.byteLength > 4 && new Uint8Array(snapBuf)[0] === 0xFF;
                        console.log(`   Concurrent snapshot result: HTTP ${snapRes.status}, ${snapBuf.byteLength} bytes, isJpeg: ${isJpeg}`);
                    } catch (err) {
                        console.warn(`   Concurrent snapshot error: ${err.message}`);
                    }
                }, sec * 1000);
            };

            triggerCapture(15);
            triggerCapture(30);
            triggerCapture(45);

            res.on('data', (chunk) => {
                totalBytes += chunk.length;
                // Count JPEG SOI markers 0xFF, 0xD8
                for (let i = 0; i < chunk.length - 1; i++) {
                    if (chunk[i] === 0xFF && chunk[i + 1] === 0xD8) {
                        frameCount++;
                    }
                }

                const now = Date.now();
                if (now - lastReport >= 10000) {
                    const elapsedSec = Math.round((now - startTime) / 1000);
                    const fps = (frameCount / elapsedSec).toFixed(1);
                    console.log(`⏱️ [Second ${elapsedSec}/65] Stream active! Frames received: ${frameCount} (~${fps} FPS), Data: ${(totalBytes / 1024).toFixed(1)} KB`);
                    lastReport = now;
                }

                if (now - startTime >= 65000 && !completed) {
                    completed = true;
                    req.destroy();
                    const durationSec = ((now - startTime) / 1000).toFixed(1);
                    console.log(`\n✅ [TEST COMPLETE] Stream remained connected for ${durationSec}s! Total frames: ${frameCount}, Total data: ${(totalBytes / 1024).toFixed(1)} KB`);
                    resolve({ pass: true, durationSec, frameCount, totalBytes });
                }
            });

            res.on('end', () => {
                if (!completed) {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.error(`❌ Stream unexpectedly closed by server after ${elapsed}s!`);
                    resolve({ pass: false, error: `Stream closed after ${elapsed}s`, durationSec: elapsed });
                }
            });

            res.on('error', (err) => {
                if (!completed) {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.error(`❌ Stream error after ${elapsed}s: ${err.message}`);
                    resolve({ pass: false, error: err.message, durationSec: elapsed });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ pass: false, error: `Request error: ${err.message}` });
        });

        req.end();
    });
}

testStreamFor65Seconds('http://localhost:5173/api/camera/stream')
    .then(result => {
        console.log('\nFinal Stream Test Result:', JSON.stringify(result, null, 2));
        process.exit(result.pass ? 0 : 1);
    });
