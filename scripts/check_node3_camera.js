/**
 * EnviroX Node 3 Camera Remote Monitor Utility
 * Requests http://NODE3_IP/status and prints real JSON status
 * Run via: node scripts/check_node3_camera.js [http://<IP_OR_MDNS>/status]
 */

import http from 'http';

const targetUrl = process.argv[2] || 'http://envirox-node3.local/status';

function formatVal(val) {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'boolean') return val ? 'YES' : 'NO';
    return String(val);
}

function fetchStatus(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(new Error('Invalid JSON response from Node 3'));
                }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')); });
        req.on('error', (err) => reject(err));
    });
}

async function runMonitor() {
    console.log('========================================');
    console.log('EnviroX Node 3 Camera Monitor');
    console.log('Target URL:', targetUrl);
    console.log('========================================\n');

    try {
        const s = await fetchStatus(targetUrl);

        console.log(`Node 3:      ${s.wifi_connected ? 'ONLINE' : 'OFFLINE'}`);
        console.log(`Wi-Fi:       ${s.wifi_connected ? 'CONNECTED' : 'DISCONNECTED'}`);
        console.log(`USB Host:    ${s.usb_host ? 'READY' : 'NOT INITIALIZED'}`);
        console.log();
        console.log(`Camera:      ${s.camera_connected ? 'CONNECTED' : 'N/A'}`);
        console.log(`UVC:         ${s.uvc_detected ? 'DETECTED' : 'N/A'}`);
        console.log(`Live:        ${s.camera_live ? 'YES' : 'N/A'}`);
        console.log(`Frame:       ${s.frame_received ? 'RECEIVED' : 'N/A'}`);
        console.log(`Frame Count: ${formatVal(s.frame_count)}`);
        console.log(`Resolution:  ${s.width && s.height ? `${s.width}x${s.height}` : 'N/A'}`);
        console.log(`Format:      ${formatVal(s.video_format)}`);
        console.log(`FPS:         ${formatVal(s.fps)}`);
        console.log(`Last Frame:  ${formatVal(s.last_frame_timestamp)}`);
        console.log(`Uptime:      ${s.uptime_ms ? `${Math.round(s.uptime_ms / 1000)}s` : 'N/A'}`);
        console.log('\n========================================');
        console.log('REAL JSON STATUS:');
        console.log(JSON.stringify(s, null, 2));
        console.log('========================================\n');
    } catch (err) {
        console.log('Node 3 status check failed:', err.message);
        console.log('Ensure Node 3 is powered and connected to the same Wi-Fi network.');
        console.log('========================================\n');
    }
}

runMonitor();
