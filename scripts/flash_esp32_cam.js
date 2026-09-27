/**
 * EnviroX Automated ESP32-CAM Flash & Verification Pipeline
 * Run via: node scripts/flash_esp32_cam.js
 */

import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARDUINO_CLI = 'C:\\Users\\OSWALDO\\AppData\\Local\\Programs\\Arduino IDE\\resources\\app\\lib\\backend\\resources\\arduino-cli.exe';
const SKETCH_DIR = path.resolve('firmware/esp32_cam');
const FQBN = 'esp32:esp32:esp32cam:PartitionScheme=huge_app';

function detectComPort() {
    try {
        const out = execSync('python scripts/connect_esp32.py --list-ports', { encoding: 'utf-8' });
        const ports = JSON.parse(out);
        if (ports && ports.length > 0) {
            return ports[0].device;
        }
    } catch (_e) {}
    return 'COM8';
}

function runCommand(cmd, args, description) {
    return new Promise((resolve, reject) => {
        console.log(`\n⏳ ${description}...`);
        const proc = spawn(cmd, args, { stdio: 'inherit' });
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${description} failed with exit code ${code}`));
        });
        proc.on('error', reject);
    });
}

async function testEndpoint(url, isBinary = false) {
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
            res.on('data', c => {
                chunks.push(c);
                if (url.includes('/stream') && chunks.length >= 3) {
                    req.destroy();
                    resolve({ pass: true, statusCode: res.statusCode });
                }
            });
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                if (isBinary) {
                    const isJpeg = body.length > 4 && body[0] === 0xFF && body[1] === 0xD8;
                    resolve({ pass: res.statusCode === 200 && isJpeg, statusCode: res.statusCode });
                } else {
                    resolve({ pass: res.statusCode === 200, statusCode: res.statusCode });
                }
            });
        });
        req.on('timeout', () => { req.destroy(); resolve({ pass: false, error: 'TIMEOUT' }); });
        req.on('error', (e) => resolve({ pass: false, error: e.message }));
        req.end();
    });
}

async function main() {
    console.log('========================================================');
    console.log('ENVIROX AUTOMATIC ESP32-CAM FLASH & DEPLOY PIPELINE');
    console.log('========================================================');

    // 1. Detect Port
    const port = detectComPort();
    console.log(`[ESP32-CAM] Detected port: ${port}`);

    // 2. Compile
    let buildPass = false;
    try {
        await runCommand(ARDUINO_CLI, ['compile', '--fqbn', FQBN, SKETCH_DIR], 'Compiling ESP32-CAM Firmware');
        buildPass = true;
    } catch (e) {
        console.error('Compilation failed:', e.message);
        process.exit(1);
    }

    // 3. Upload
    let uploadPass = false;
    try {
        await runCommand(ARDUINO_CLI, ['upload', '-p', port, '--fqbn', FQBN, SKETCH_DIR], `Uploading to ${port}`);
        uploadPass = true;
    } catch (e) {
        console.error('\n⚠️ Upload failed. If your hardware requires manual bootloader entry:');
        console.error('   1. Connect GPIO 0 to GND.');
        console.error('   2. Press the RST button on ESP32-CAM.');
        console.error('   3. Re-run this flash script.\n');
        process.exit(1);
    }

    // 4. Monitor Boot Output
    console.log('\n⏳ Monitoring serial boot output on ' + port + ' (115200 baud)...');
    try {
        execSync('python scripts/monitor_cam_boot.py', { stdio: 'inherit' });
    } catch (_e) {}

    // Read latest camera IP from server/cameraConfig.json
    let cameraIp = '10.140.217.7';
    try {
        const config = JSON.parse(fs.readFileSync('server/cameraConfig.json', 'utf-8'));
        if (config.cameraIp) cameraIp = config.cameraIp;
    } catch (_e) {}

    console.log(`\n⏳ Verifying Camera Network Endpoints at http://${cameraIp}...`);
    const statusRes = await testEndpoint(`http://${cameraIp}/status`);
    const captureRes = await testEndpoint(`http://${cameraIp}/capture`, true);
    const streamRes = await testEndpoint(`http://${cameraIp}/stream`);
    const backendStatus = await testEndpoint('http://localhost:5173/api/camera/status');

    // Test AI
    let pestPass = false;
    let plantPass = false;
    try {
        execSync('node scripts/test_live_ai_dual.js', { stdio: 'pipe' });
        pestPass = true;
        plantPass = true;
    } catch (_e) {}

    console.log('\n========================================================');
    console.log('FINAL ESP32-CAM FLASH REPORT');
    console.log('========================================================');
    console.log(`ESP32-CAM FLASH:    ${uploadPass ? 'SUCCESS' : 'FAILED'}`);
    console.log(`COM PORT:           ${port}`);
    console.log(`FIRMWARE BUILD:     ${buildPass ? 'SUCCESS' : 'FAILED'}`);
    console.log(`UPLOAD:             ${uploadPass ? 'SUCCESS' : 'FAILED'}`);
    console.log(`DEVICE IP:          ${cameraIp}`);
    console.log(`CAMERA STATUS:      ${statusRes.pass ? 'ONLINE' : 'OFFLINE'}`);
    console.log(`/STATUS:            ${statusRes.pass ? 'PASS' : 'FAIL'}`);
    console.log(`/CAPTURE:           ${captureRes.pass ? 'PASS' : 'FAIL'}`);
    console.log(`/STREAM:            ${streamRes.pass ? 'PASS' : 'FAIL'}`);
    console.log(`ENVIROX BACKEND:    ${backendStatus.pass ? 'PASS' : 'FAIL'}`);
    console.log(`LIVE CANOPY:        ${statusRes.pass && streamRes.pass ? 'PASS' : 'FAIL'}`);
    console.log(`PEST AI:            ${pestPass ? 'PASS' : 'FAIL'}`);
    console.log(`PLANT AI:           ${plantPass ? 'PASS' : 'FAIL'}`);
    console.log('========================================================\n');
}

main();
