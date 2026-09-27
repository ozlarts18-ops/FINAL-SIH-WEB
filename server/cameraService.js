/**
 * EnviroX Central Backend Camera Service
 * Coordinates ESP32-CAM networking, proxy forwarding, frame capture, and status checks.
 */

import http from 'http';
import { getESP32Status, markCameraOnline, setESP32FlashLed, setESP32StreamUrl } from './esp32SerialService.js';

export function getCameraBaseUrl() {
    if (process.env.ESP32_CAM_URL) {
        return process.env.ESP32_CAM_URL.replace(/\/+$/, '');
    }
    const st = getESP32Status();
    const ip = st.cameraIp || 'ossie.local';
    return `http://${ip}`;
}

export function getCameraStreamTargetUrl(customTarget = null) {
    if (customTarget) {
        return customTarget.startsWith('http') ? customTarget : `http://${customTarget}/stream`;
    }
    if (process.env.ESP32_CAM_URL) {
        const base = process.env.ESP32_CAM_URL.replace(/\/+$/, '');
        return base.endsWith('/stream') ? base : `${base}/stream`;
    }
    const st = getESP32Status();
    if (st.streamUrl && !st.streamUrl.startsWith('/api')) {
        return st.streamUrl;
    }
    const ip = st.cameraIp || 'ossie.local';
    return `http://${ip}/stream`;
}

export function getCameraCaptureTargetUrl(customTarget = null) {
    if (customTarget) {
        const url = customTarget.startsWith('http') ? customTarget : `http://${customTarget}/capture`;
        return url.replace(/\/stream\/?$/, '/capture');
    }
    if (process.env.ESP32_CAM_URL) {
        const base = process.env.ESP32_CAM_URL.replace(/\/+$/, '').replace(/\/stream\/?$/, '');
        return `${base}/capture`;
    }
    const st = getESP32Status();
    const ip = st.cameraIp || 'ossie.local';
    return `http://${ip}/capture`;
}

export async function fetchCameraSnapshotBuffer(customUrl = null, timeoutMs = 4000) {
    const targetUrl = getCameraCaptureTargetUrl(customUrl);
    const parsed = new URL(targetUrl);

    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: parsed.hostname,
            port: parsed.port || 80,
            path: parsed.pathname + (parsed.search || ''),
            method: 'GET',
            timeout: timeoutMs
        }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`ESP32-CAM HTTP status ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                markCameraOnline(parsed.hostname);
                resolve(Buffer.concat(chunks));
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`ESP32-CAM snapshot request timed out after ${timeoutMs}ms`));
        });
        req.end();
    });
}

export async function checkCameraHealth(timeoutMs = 1200) {
    const st = getESP32Status();
    const targetUrl = getCameraCaptureTargetUrl();
    try {
        const parsed = new URL(targetUrl);
        const isReachable = await new Promise((resolve) => {
            const req = http.request({
                hostname: parsed.hostname,
                port: parsed.port || 80,
                path: '/status',
                method: 'GET',
                timeout: timeoutMs
            }, (res) => {
                resolve(res.statusCode >= 200 && res.statusCode < 500);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });

        if (isReachable) {
            markCameraOnline(parsed.hostname);
        }
        return {
            connected: isReachable || Boolean(st.connected),
            cameraIp: parsed.hostname,
            streamUrl: `/api/camera/stream`,
            flashLed: Boolean(st.flashLed),
            lastSeen: st.lastPing
        };
    } catch (_e) {
        return {
            connected: false,
            cameraIp: st.cameraIp || 'ossie.local',
            streamUrl: `/api/camera/stream`,
            flashLed: Boolean(st.flashLed),
            lastSeen: st.lastPing
        };
    }
}

export { getESP32Status, markCameraOnline, setESP32FlashLed, setESP32StreamUrl };
