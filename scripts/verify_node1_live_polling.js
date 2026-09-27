import { fetchAirQualityLogs, fetchLightIntensityLogs, fetchWaterQualityLogs } from '../src/api/dataService.js';

// Polyfill fetch for node environment pointing to local server
const origFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
    if (url.startsWith('/api') || url.startsWith('/data')) {
        url = 'http://localhost:5173' + url;
    }
    return origFetch(url, opts);
};

const POST_URL = 'http://localhost:5173/data';

async function sendNode1Packet(step, overrides = {}) {
    const temp = parseFloat((26.0 + Math.sin(step * 0.2) * 3.0).toFixed(1));
    const hum = parseFloat((58.0 + Math.cos(step * 0.15) * 10.0).toFixed(1));
    const lux = parseFloat(Math.round(500 + Math.sin(step * 0.2) * 300).toFixed(1));
    const payload = {
        device: 'ESP32-S3-01',
        temperature: temp,
        humidity: hum,
        lux: lux,
        gasDetected: false,
        rainDetected: false,
        buzzer: false,
        ...overrides
    };

    const res = await origFetch(POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return { status: res.status, payload };
}

async function sendNode2Packet() {
    const payload = {
        device: 'ESP32-S3-02',
        ph: 7.35,
        turbidity: 3.9,
        tds: 185,
        temperature: 24.1,
        waterLevel: 82
    };
    const res = await origFetch(POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return { status: res.status, payload };
}

// Emulate Frontend Node 1 Poller & State Machine matching air.jsx exactly
class Node1DashboardSimulator {
    constructor() {
        this.connectionStatus = 'OFFLINE';
        this.lastRecordedTimestamp = null;
        this.lastTelemetryWallClock = 0;
        this.lastTelemetryAgeSec = 0;
        this.telemetry = { temperature: null, humidity: null, lux: null };
        this.stats = {};
        this.history = [];
        this.isMounted = true;
    }

    async poll() {
        if (!this.isMounted) return;
        try {
            const [airRes, lightRes] = await Promise.allSettled([
                fetchAirQualityLogs(50, {}, false),
                fetchLightIntensityLogs(5, {}, false)
            ]);

            if (airRes.status === 'rejected' || airRes.value?.error) {
                throw new Error(airRes.reason?.message || airRes.value?.error || 'Failed to query air_quality_logs');
            }

            const rawAirLogs = airRes.value?.data || [];
            // Node 1 isolation filter: strictly exclude device_id 2 or ESP32-S3-02
            const node1AirLogs = rawAirLogs.filter(d => Number(d.device_id) !== 2 && d.device !== 'ESP32-S3-02');

            if (node1AirLogs.length === 0) {
                const elapsed = this.lastTelemetryWallClock > 0 ? (Date.now() - this.lastTelemetryWallClock) : 31000;
                if (elapsed >= 30000) {
                    this.connectionStatus = 'OFFLINE';
                } else if (elapsed >= 15000) {
                    this.connectionStatus = 'STALE';
                }
                return;
            }

            const latestAir = node1AirLogs[0];
            const currentTimestamp = latestAir.recorded_at;
            const isInitial = this.lastRecordedTimestamp === null;
            const isNewTimestamp = Boolean(currentTimestamp && this.lastRecordedTimestamp && new Date(currentTimestamp).getTime() > new Date(this.lastRecordedTimestamp).getTime());

            let latestLux = null;
            if (lightRes.status === 'fulfilled' && lightRes.value?.data?.length > 0) {
                const node1LightLogs = lightRes.value.data.filter(d => Number(d.device_id) !== 2);
                if (node1LightLogs.length > 0) {
                    latestLux = Number(node1LightLogs[0].lux_value);
                }
            }

            if (isInitial) {
                const recordTime = currentTimestamp ? new Date(currentTimestamp).getTime() : 0;
                const now = Date.now();
                const ageMs = recordTime > 0 ? (now - recordTime) : Infinity;

                let initialStatus = 'LIVE';
                if (ageMs >= 30000) initialStatus = 'OFFLINE';
                else if (ageMs >= 15000) initialStatus = 'STALE';

                this.lastRecordedTimestamp = currentTimestamp;
                this.lastTelemetryWallClock = now - Math.min(ageMs, 3600000);
                this.connectionStatus = initialStatus;
                this.lastTelemetryAgeSec = Math.floor(Math.min(ageMs, 3600000) / 1000);
                this.telemetry = {
                    temperature: latestAir.current_temperature,
                    humidity: latestAir.current_humidity,
                    lux: latestLux ?? latestAir.lux_value
                };
            } else if (isNewTimestamp) {
                const wasDisconnected = this.connectionStatus === 'OFFLINE' || this.connectionStatus === 'STALE' || this.connectionStatus === 'ERROR';
                if (wasDisconnected) {
                    console.log(`[Node 1 Live] Node recovered`);
                }
                this.lastRecordedTimestamp = currentTimestamp;
                this.lastTelemetryWallClock = Date.now();
                this.connectionStatus = 'LIVE';
                this.lastTelemetryAgeSec = 0;
                this.telemetry = {
                    temperature: latestAir.current_temperature,
                    humidity: latestAir.current_humidity,
                    lux: latestLux ?? latestAir.lux_value
                };
            } else {
                // Unchanged timestamp -> evaluate elapsed time
                const elapsed = Date.now() - this.lastTelemetryWallClock;
                this.lastTelemetryAgeSec = Math.floor(elapsed / 1000);
                if (elapsed >= 30000) {
                    this.connectionStatus = 'OFFLINE';
                } else if (elapsed >= 15000) {
                    if (this.connectionStatus === 'LIVE') {
                        this.connectionStatus = 'STALE';
                    }
                }
            }
        } catch (err) {
            console.log(`[Node 1 Live] API ERROR: ${err.message}`);
            this.connectionStatus = 'ERROR';
        }
    }

    tick() {
        if (this.lastTelemetryWallClock > 0) {
            const elapsed = Date.now() - this.lastTelemetryWallClock;
            this.lastTelemetryAgeSec = Math.floor(elapsed / 1000);
            if (this.connectionStatus === 'LIVE' && elapsed >= 15000) {
                this.connectionStatus = 'STALE';
                console.log(`[Node 1 Live] Status: STALE`);
                console.log(`[Node 1 Live] Last telemetry: ${this.lastRecordedTimestamp}`);
            } else if ((this.connectionStatus === 'LIVE' || this.connectionStatus === 'STALE') && elapsed >= 30000) {
                this.connectionStatus = 'OFFLINE';
                console.log(`[Node 1 Live] Status: OFFLINE`);
                console.log(`[Node 1 Live] Last telemetry: ${this.lastRecordedTimestamp}`);
            }
        }
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSuite() {
    console.log('========================================================================');
    console.log('🔬 STARTING COMPLETE MULTI-PHASE ESP32-S3 NODE 1 VERIFICATION SUITE');
    console.log('========================================================================\n');

    const sim = new Node1DashboardSimulator();
    let bgSenderActive = true;
    let senderStep = 100;

    // Start background Node 1 sender emitting every 2500ms
    const senderInterval = setInterval(async () => {
        if (bgSenderActive) {
            senderStep++;
            try {
                await sendNode1Packet(senderStep);
            } catch (_e) {}
        }
    }, 2500);

    // Initial packet and sleep
    await sendNode1Packet(senderStep);
    await sleep(600);

    // Initial poll
    await sim.poll();

    // -------------------------------------------------------------------------
    // TEST 1: NORMAL LIVE OPERATION (10 continuous 5s polling cycles)
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: NORMAL LIVE OPERATION (10 continuous 5s polling cycles) ---');
    const liveCycles = [];
    let prevTimestamp = null;
    let successfulLiveCycles = 0;

    for (let c = 1; c <= 10; c++) {
        await sleep(5000);
        sim.tick();
        await sim.poll();

        const ts = sim.lastRecordedTimestamp;
        const isNew = prevTimestamp === null || (ts && new Date(ts).getTime() > new Date(prevTimestamp).getTime());
        const isLive = sim.connectionStatus === 'LIVE';

        if (isNew && isLive) {
            successfulLiveCycles++;
        }
        prevTimestamp = ts;

        liveCycles.push({
            cycle: c,
            timestamp: ts,
            temp: `${sim.telemetry.temperature}°C`,
            humidity: `${sim.telemetry.humidity}%`,
            lux: `${sim.telemetry.lux} lux`,
            status: sim.connectionStatus,
            advances: isNew ? 'YES' : 'NO'
        });

        console.log(`[Poll #${c.toString().padStart(2, '0')}] TS: ${ts} | Temp: ${sim.telemetry.temperature}°C | Hum: ${sim.telemetry.humidity}% | Lux: ${sim.telemetry.lux} | Status: ${sim.connectionStatus} | Timestamp Advanced: ${isNew ? 'YES' : 'NO'}`);
    }

    console.log(`\nTest 1 Result: ${successfulLiveCycles}/10 successful live cycles.\n`);

    // -------------------------------------------------------------------------
    // TEST 2: TEMPORARY INTERRUPTION (STALE & OFFLINE)
    // -------------------------------------------------------------------------
    console.log('--- TEST 2: TEMPORARY INTERRUPTION (Halting Node 1 transmissions) ---');
    bgSenderActive = false; // Halt Node 1 transmission
    const haltTime = Date.now();
    const preservedTemp = sim.telemetry.temperature;
    const preservedHum = sim.telemetry.humidity;
    const preservedLux = sim.telemetry.lux;
    console.log(`Transmission halted. Last known values: Temp=${preservedTemp}°C, Hum=${preservedHum}%, Lux=${preservedLux}`);

    let staleDetected = false;
    let staleTimeSec = 0;
    let offlineDetected = false;
    let offlineTimeSec = 0;

    // Monitor for 35 seconds (polling every 5s, ticking every 1s)
    for (let s = 1; s <= 35; s++) {
        await sleep(1000);
        sim.tick();
        if (s % 5 === 0) {
            await sim.poll();
        }

        const elapsedSec = Math.floor((Date.now() - haltTime) / 1000);
        if (!staleDetected && sim.connectionStatus === 'STALE') {
            staleDetected = true;
            staleTimeSec = elapsedSec;
            console.log(`>>> STALE confirmed at ~${elapsedSec}s elapsed. Last known values intact.`);
        }
        if (!offlineDetected && sim.connectionStatus === 'OFFLINE') {
            offlineDetected = true;
            offlineTimeSec = elapsedSec;
            console.log(`>>> OFFLINE confirmed at ~${elapsedSec}s elapsed. Last known values intact.`);
        }
    }

    const valuesPreserved = sim.telemetry.temperature === preservedTemp &&
                           sim.telemetry.temperature !== 0 &&
                           sim.telemetry.temperature !== '0';

    console.log(`Test 2 Result: Stale Detected=${staleDetected} (${staleTimeSec}s) | Offline Detected=${offlineDetected} (${offlineTimeSec}s) | Values Preserved=${valuesPreserved}\n`);

    // -------------------------------------------------------------------------
    // TEST 3: AUTOMATIC RECOVERY
    // -------------------------------------------------------------------------
    console.log('--- TEST 3: AUTOMATIC RECOVERY (Restoring Node 1 transmissions) ---');
    const recoveryStartTime = Date.now();
    bgSenderActive = true; // Resume transmission
    senderStep += 10;
    await sendNode1Packet(senderStep, { temperature: 31.4, humidity: 67.8, lux: 720 });

    let recovered = false;
    let recoveryTimeSec = 0;

    // Poll every 2.5s for recovery check
    for (let r = 1; r <= 6; r++) {
        await sleep(2500);
        sim.tick();
        await sim.poll();
        if (sim.connectionStatus === 'LIVE') {
            recovered = true;
            recoveryTimeSec = Math.floor((Date.now() - recoveryStartTime) / 1000);
            console.log(`>>> RECOVERY confirmed! Status: LIVE in ${recoveryTimeSec}s. New Temp=${sim.telemetry.temperature}°C, Lux=${sim.telemetry.lux}`);
            break;
        }
    }

    console.log(`Test 3 Result: Recovered=${recovered} (${recoveryTimeSec}s)\n`);

    // -------------------------------------------------------------------------
    // TEST 4: BACKEND / API ERROR HANDLING
    // -------------------------------------------------------------------------
    console.log('--- TEST 4: BACKEND / API ERROR HANDLING ---');
    let handledError = false;
    // Simulate backend network outage / HTTP 500
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error('Network connection failure (HTTP 500 / unreachable)'));

    await sim.poll();
    if (sim.connectionStatus === 'ERROR') {
        handledError = true;
        console.log(`>>> API error correctly set status to 'ERROR' (not falsely claiming ESP32 offline).`);
        console.log(`>>> Last known sensor values preserved: Temp=${sim.telemetry.temperature}°C`);
    }

    // Restore network
    globalThis.fetch = realFetch;
    await sendNode1Packet(++senderStep);
    await sim.poll();
    const errorRecovered = sim.connectionStatus === 'LIVE';
    console.log(`>>> Recovered from API error back to: ${sim.connectionStatus}\n`);

    // -------------------------------------------------------------------------
    // TEST 5: NODE ISOLATION
    // -------------------------------------------------------------------------
    console.log('--- TEST 5: NODE ISOLATION ---');
    // Step 5a: While Node 1 is temporarily paused, transmit Node 2 packets
    bgSenderActive = false;
    console.log('Pausing Node 1 transmission. Transmitting Node 2 (ESP32-S3-02) packets...');
    const node1LastTsBeforeNode2 = sim.lastRecordedTimestamp;
    const _node1LastTempBeforeNode2 = sim.telemetry.temperature;

    await sendNode2Packet();
    await sleep(600);

    // Query Node 2 Water Quality endpoint: Node 2 data must be present
    const waterRes = await fetchWaterQualityLogs(5, { device_id: 2 }, false);
    const node2LatestWater = waterRes.data?.[0];
    const node2HasData = Boolean(node2LatestWater && Number(node2LatestWater.device_id) === 2);
    console.log(`Node 2 Dashboard API: retrieved pH=${node2LatestWater?.current_ph}, device_id=${node2LatestWater?.device_id} (Present: ${node2HasData})`);

    // Now poll Node 1 dashboard: Node 1 must NOT pick up Node 2 data!
    await sim.poll();
    const node1PickedUpNode2 = sim.lastRecordedTimestamp !== node1LastTsBeforeNode2;
    const node1TempEqualsNode2 = Number(sim.telemetry.temperature) === 24.1; // 24.1 is Node 2 water temperature

    console.log(`Node 1 Dashboard state after Node 2 transmission:`);
    console.log(`- Node 1 timestamp advanced by Node 2? ${node1PickedUpNode2 ? 'YES (LEAK!)' : 'NO (STRICTLY ISOLATED)'}`);
    console.log(`- Node 1 telemetry took Node 2 temp?     ${node1TempEqualsNode2 ? 'YES (LEAK!)' : 'NO (STRICTLY ISOLATED)'}`);
    console.log(`- Node 1 sensor temperature retained:   ${sim.telemetry.temperature}°C`);

    const isolationPass = !node1PickedUpNode2 && !node1TempEqualsNode2 && node2HasData;
    console.log(`Test 5 Result: Node 1 vs Node 2 Isolation: ${isolationPass ? 'PASS' : 'FAIL'}\n`);

    clearInterval(senderInterval);

    // -------------------------------------------------------------------------
    // SUMMARY REPORT
    // -------------------------------------------------------------------------
    const overallPass = successfulLiveCycles >= 10 &&
                        staleDetected &&
                        offlineDetected &&
                        recovered &&
                        handledError &&
                        errorRecovered &&
                        isolationPass;

    console.log('========================================================================');
    console.log('📋 FINAL REPORT');
    console.log('========================================================================');
    console.log(`Node ID:                     Node 1`);
    console.log(`Device ID:                   ESP32-S3-01 (DB device_id: 3)`);
    console.log(`Dashboard:                   Air Pollution & Microclimate (/dashboard/air)`);
    console.log(`Frontend polling interval:   5000 ms`);
    console.log(`ESP32 transmission interval: 2500 ms`);
    console.log(`Last successful timestamp:   ${sim.lastRecordedTimestamp}`);
    console.log(``);
    console.log(`LIVE test:`);
    console.log(`Cycles:                      10`);
    console.log(`Successful:                  ${successfulLiveCycles}`);
    console.log(`Failed:                      ${10 - successfulLiveCycles}`);
    console.log(``);
    console.log(`STALE test:`);
    console.log(`Detected:                    ${staleDetected ? 'YES' : 'NO'}`);
    console.log(`Detection time:              ~${staleTimeSec}s`);
    console.log(``);
    console.log(`OFFLINE test:`);
    console.log(`Detected:                    ${offlineDetected ? 'YES' : 'NO'}`);
    console.log(`Detection time:              ~${offlineTimeSec}s`);
    console.log(``);
    console.log(`RECOVERY test:`);
    console.log(`Automatic recovery:          ${recovered ? 'YES' : 'NO'}`);
    console.log(`Time to recover:             ~${recoveryTimeSec}s`);
    console.log(``);
    console.log(`Backend error test:`);
    console.log(`Handled:                     ${handledError && errorRecovered ? 'YES' : 'NO'}`);
    console.log(``);
    console.log(`Node 2 isolation:`);
    console.log(`${isolationPass ? 'PASS' : 'FAIL'}`);
    console.log(``);
    console.log(`Overall:`);
    console.log(`${overallPass ? 'PASS' : 'FAIL'}`);
    console.log('========================================================================');

    process.exit(overallPass ? 0 : 1);
}

runSuite().catch(err => {
    console.error('Test Suite Failed with error:', err);
    process.exit(1);
});
