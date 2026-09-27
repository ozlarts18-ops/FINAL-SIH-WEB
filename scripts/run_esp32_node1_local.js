
import { resolveMdns, getPrimaryLanIp } from '../server/mdnsService.js';

const TARGET_HOST = process.env.TARGET_HOST || 'iotrex.local';
const TARGET_PORT = process.env.PORT || 5173;
const DEVICE_ID = 'ESP32-S3-01';
const INTERVAL_MS = 2500;

let resolvedIp = null;
let lastResolve = 0;

async function getEffectiveTargetUrl() {
    if (process.env.SERVER_URL) return process.env.SERVER_URL;

    // Refresh mDNS resolution if uninitialized or older than 60s
    if (!resolvedIp || (Date.now() - lastResolve > 60000)) {
        console.log(`Resolving ${TARGET_HOST} via mDNS...`);
        resolvedIp = await resolveMdns(TARGET_HOST, 2000);
        if (resolvedIp) {
            lastResolve = Date.now();
            console.log(`IOTrex server resolved: ${resolvedIp}`);
        } else {
            console.warn(`mDNS resolution failed for ${TARGET_HOST}, falling back to LAN IP: ${getPrimaryLanIp()}`);
            resolvedIp = getPrimaryLanIp();
        }
    }
    return `http://${resolvedIp}:${TARGET_PORT}/data`;
}

console.log('======================================================================');
console.log('💨 ENVIROX ESP32-S3 #1 (ESP32-S3-01) LOCAL AIR TELEMETRY DAEMON');
console.log(`📡 Target Host:        ${TARGET_HOST}:${TARGET_PORT}/data`);
console.log(`⏱️  Cycle Interval:     ${INTERVAL_MS} ms`);
console.log('======================================================================\n');

let step = 0;

async function cycle() {
    step++;

    const temperature = parseFloat((26.5 + Math.sin(step * 0.1) * 3.5).toFixed(1));
    const humidity = parseFloat((58.0 + Math.cos(step * 0.08) * 12.0).toFixed(1));
    const lux = parseFloat(Math.max(10, Math.round(520 + Math.sin(step * 0.15) * 350)).toFixed(1));

    const gasRaw = Math.round(400 + Math.sin(step * 0.05) * 300);
    const gasDetected = gasRaw > 1500;

    const rainRaw = Math.round(3800 - Math.cos(step * 0.04) * 400);
    const rainDetected = rainRaw < 3500;

    console.log('======================================');
    console.log('        ENVIROX ESP32-S3 #1');
    console.log('======================================');
    console.log(`Temperature: ${temperature.toFixed(1)} C`);
    console.log(`Humidity: ${humidity.toFixed(1)} %`);
    console.log(`Light: ${lux.toFixed(1)} lux`);
    console.log(`Gas detected: ${gasDetected ? 'YES' : 'NO'}`);
    console.log(`Rain detected: ${rainDetected ? 'YES' : 'NO'}`);

    const payload = {
        device: DEVICE_ID,
        temperature: temperature,
        humidity: humidity,
        lux: lux,
        gasDetected: gasDetected,
        rainDetected: rainDetected
    };

    console.log('\nENVIROX TELEMETRY');
    console.log(JSON.stringify(payload));

    try {
        const targetUrl = await getEffectiveTargetUrl();
        console.log(`POST http://iotrex.local:${TARGET_PORT}/data (-> ${targetUrl})`);

        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`HTTP response: ${res.status}`);

        const body = await res.json();
        console.log('Server Response:', JSON.stringify(body));
        if (res.status >= 200 && res.status < 300) {
            console.log('EnviroX: DATA SENT SUCCESSFULLY');
        }
    } catch (err) {
        console.error(`[HTTP Error] Failed to reach http://iotrex.local:${TARGET_PORT}/data:`, err.message);
        resolvedIp = null; // Re-resolve next cycle on failure
    }

    console.log();
}

cycle();

setInterval(cycle, INTERVAL_MS);
