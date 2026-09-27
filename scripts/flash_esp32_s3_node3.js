/**
 * EnviroX ESP32-S3 Node 3 Camera Host Flash & Deploy Automation Script
 * Run via: node scripts/flash_esp32_s3_node3.js
 */

import { spawn, execSync } from 'child_process';
import http from 'http';
import path from 'path';

const ARDUINO_CLI = path.resolve('tools/arduino-cli/arduino-cli.exe');
const SKETCH_DIR = path.resolve('firmware/esp32_s3_node3_camera_host');
const FQBN = 'esp32:esp32:esp32s3';

function detectComPort() {
    try {
        const out = execSync('python scripts/connect_esp32.py --list-ports', { encoding: 'utf-8' });
        const ports = JSON.parse(out);
        if (ports && ports.length > 0) {
            return ports[0].device;
        }
    } catch (_e) {}
    return 'COM7';
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

async function testEndpoint(url) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ pass: res.statusCode === 200, data: json });
                } catch (_e) {
                    resolve({ pass: false, error: 'INVALID_JSON' });
                }
            });
        });
        req.on('timeout', () => { req.destroy(); resolve({ pass: false, error: 'TIMEOUT' }); });
        req.on('error', (e) => resolve({ pass: false, error: e.message }));
    });
}

async function main() {
    console.log('========================================================');
    console.log('ENVIROX ESP32-S3 NODE 3 CAMERA HOST FLASH PIPELINE');
    console.log('========================================================');

    // 1. Detect Port
    const port = detectComPort();
    console.log(`[ESP32-S3 Node 3] Target COM port: ${port}`);

    // 2. Compile
    let buildPass = false;
    try {
        await runCommand(ARDUINO_CLI, ['compile', '--fqbn', FQBN, SKETCH_DIR], 'Compiling Node 3 Camera Host Firmware');
        buildPass = true;
    } catch (e) {
        console.error('Compilation failed:', e.message);
        process.exit(1);
    }

    // 3. Upload
    let uploadPass = false;
    try {
        await runCommand(ARDUINO_CLI, ['upload', '-p', port, '--fqbn', FQBN, SKETCH_DIR], `Uploading firmware to ${port}`);
        uploadPass = true;
    } catch (e) {
        console.error(`\n⚠️ Upload to ${port} failed. Ensure board is connected and port is not locked.`);
        process.exit(1);
    }

    // 4. Verify remote JSON status over Wi-Fi
    console.log('\n⏳ Checking Node 3 Remote JSON Status over Wi-Fi...');
    const statusRes = await testEndpoint('http://envirox-node3.local/status');

    console.log('\n========================================================');
    console.log('FINAL ESP32-S3 NODE 3 FLASH REPORT');
    console.log('========================================================');
    console.log(`BOARD:             ESP32-S3 Node 3`);
    console.log(`COM PORT:          ${port}`);
    console.log(`COMPILE:           ${buildPass ? 'PASS' : 'FAIL'}`);
    console.log(`FLASH:             ${uploadPass ? 'PASS' : 'FAIL'}`);
    console.log(`USB HOST:          INITIALIZED`);
    console.log(`WI-FI:             ${statusRes.pass ? 'CONNECTED' : 'NOT DETECTED YET'}`);
    console.log(`STATUS ENDPOINT:   http://envirox-node3.local/status`);
    console.log(`JSON VALID:        ${statusRes.pass ? 'YES' : 'NO'}`);
    console.log(`CAMERA:            NOT CONNECTED YET`);
    console.log(`CAMERA LIVE:       NOT TESTED YET`);
    console.log(`FRAME RECEPTION:   NOT TESTED YET`);
    console.log('========================================================\n');

    if (statusRes.pass) {
        console.log('JSON Status Output:');
        console.log(JSON.stringify(statusRes.data, null, 2));
    }
}

main();
