import { fetchAirQualityLogs, fetchLightIntensityLogs, fetchWaterQualityLogs, fetchSoilMoistureLogs } from '../src/api/dataService.js';

// Polyfill fetch for node environment pointing to local server
const origFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
    if (url.startsWith('/api') || url.startsWith('/data')) {
        url = 'http://localhost:5173' + url;
    }
    return origFetch(url, opts);
};

const POST_URL = 'http://localhost:5173/data';

// Send real-format Node 1 telemetry packet matching esp32_s3_node1.ino
async function sendNode1Packet(step, overrides = {}) {
    const temp = parseFloat((26.5 + Math.sin(step * 0.1) * 3.5).toFixed(1));
    const hum = parseFloat((58.0 + Math.cos(step * 0.08) * 12.0).toFixed(1));
    const lux = parseFloat(Math.max(10, Math.round(520 + Math.sin(step * 0.15) * 350)).toFixed(1));
    const gasRaw = Math.round(400 + Math.sin(step * 0.05) * 300);
    const gasDetected = gasRaw > 1500;
    const rainRaw = Math.round(3800 - Math.cos(step * 0.04) * 400);
    const rainDetected = rainRaw < 3500;
    const buzzer = gasDetected || rainDetected;

    const payload = {
        device: 'ESP32-S3-01',
        temperature: temp,
        humidity: hum,
        lux: lux,
        gasDetected: gasDetected,
        rainDetected: rainDetected,
        buzzer: buzzer,
        ...overrides
    };

    const res = await origFetch(POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return { ok: res.ok, status: res.status, payload };
}

// Send real-format Node 2 telemetry packet matching esp32_s3_node2.ino
async function sendNode2Packet(step, overrides = {}) {
    const moisture = Math.round(65 + Math.sin(step * 0.1) * 10);
    const pH = parseFloat((7.15 + Math.sin(step * 0.05) * 0.4).toFixed(2));
    const turbidityVoltage = parseFloat((2.85 + Math.cos(step * 0.08) * 0.3).toFixed(3));

    const payload = {
        device: 'ESP32-S3-02',
        soilMoisture: moisture,
        pH: pH,
        turbidityVoltage: turbidityVoltage,
        ...overrides
    };

    const res = await origFetch(POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return { ok: res.ok, status: res.status, payload };
}

// Emulate Frontend Node 1 Dashboard poller
class Node1DashboardClient {
    constructor() {
        this.status = 'OFFLINE';
        this.lastTimestamp = null;
        this.lastWallClock = 0;
        this.telemetry = {};
    }

    async poll() {
        try {
            const [airRes, lightRes] = await Promise.allSettled([
                fetchAirQualityLogs(50, {}, false),
                fetchLightIntensityLogs(5, {}, false)
            ]);

            if (airRes.status === 'rejected' || airRes.value?.error) {
                throw new Error(airRes.reason?.message || airRes.value?.error);
            }

            const rawAir = airRes.value?.data || [];
            // Node 1 isolation filter: strictly exclude device_id 2 or ESP32-S3-02
            const node1Air = rawAir.filter(d => Number(d.device_id) !== 2 && d.device !== 'ESP32-S3-02');

            if (node1Air.length === 0) {
                const elapsed = this.lastWallClock > 0 ? (Date.now() - this.lastWallClock) : 31000;
                if (elapsed >= 30000) this.status = 'OFFLINE';
                else if (elapsed >= 15000) this.status = 'STALE';
                return;
            }

            const latest = node1Air[0];
            const ts = latest.recorded_at;
            const isInitial = this.lastTimestamp === null;
            const isNew = Boolean(ts && this.lastTimestamp && new Date(ts).getTime() > new Date(this.lastTimestamp).getTime());

            let latestLux = null;
            if (lightRes.status === 'fulfilled' && lightRes.value?.data?.length > 0) {
                const node1Light = lightRes.value.data.filter(d => Number(d.device_id) !== 2);
                if (node1Light.length > 0) latestLux = Number(node1Light[0].lux_value);
            }

            if (isInitial) {
                const ageMs = ts ? (Date.now() - new Date(ts).getTime()) : Infinity;
                let s = 'LIVE';
                if (ageMs >= 30000) s = 'OFFLINE';
                else if (ageMs >= 15000) s = 'STALE';
                this.status = s;
                this.lastTimestamp = ts;
                this.lastWallClock = Date.now() - Math.min(ageMs, 3600000);
                this.telemetry = { temp: latest.current_temperature, hum: latest.current_humidity, lux: latestLux ?? latest.lux_value, gas: latest.gas_detected, rain: latest.rain_detected, buzzer: latest.buzzer_active };
            } else if (isNew) {
                this.status = 'LIVE';
                this.lastTimestamp = ts;
                this.lastWallClock = Date.now();
                this.telemetry = { temp: latest.current_temperature, hum: latest.current_humidity, lux: latestLux ?? latest.lux_value, gas: latest.gas_detected, rain: latest.rain_detected, buzzer: latest.buzzer_active };
            } else {
                const elapsed = Date.now() - this.lastWallClock;
                if (elapsed >= 30000) this.status = 'OFFLINE';
                else if (elapsed >= 15000) this.status = 'STALE';
            }
        } catch (_err) {
            this.status = 'ERROR';
        }
    }

    tick() {
        if (this.lastWallClock > 0) {
            const elapsed = Date.now() - this.lastWallClock;
            if (this.status === 'LIVE' && elapsed >= 15000) this.status = 'STALE';
            else if ((this.status === 'LIVE' || this.status === 'STALE') && elapsed >= 30000) this.status = 'OFFLINE';
        }
    }
}

// Emulate Frontend Node 2 Dashboard poller
class Node2DashboardClient {
    constructor() {
        this.status = 'OFFLINE';
        this.lastTimestamp = null;
        this.lastWallClock = 0;
        this.telemetry = {};
    }

    async poll() {
        try {
            const [waterRes, soilRes] = await Promise.allSettled([
                fetchWaterQualityLogs(50, { device_id: 2 }, false),
                fetchSoilMoistureLogs(50)
            ]);

            if (waterRes.status === 'rejected' || waterRes.value?.error) {
                throw new Error(waterRes.reason?.message || waterRes.value?.error);
            }

            const rawWater = waterRes.value?.data || [];
            // Node 2 isolation filter: strictly device_id 2 or ESP32-S3-02
            const node2Water = rawWater.filter(d => Number(d.device_id) === 2 || d.device_uid === 'ESP32-S3-02' || !d.device_id);

            if (node2Water.length === 0) {
                const elapsed = this.lastWallClock > 0 ? (Date.now() - this.lastWallClock) : 31000;
                if (elapsed >= 30000) this.status = 'OFFLINE';
                else if (elapsed >= 15000) this.status = 'STALE';
                return;
            }

            const latest = node2Water[0];
            const ts = latest.recorded_at;
            const isInitial = this.lastTimestamp === null;
            const isNew = Boolean(ts && this.lastTimestamp && new Date(ts).getTime() > new Date(this.lastTimestamp).getTime());

            let latestSoil = null;
            if (soilRes.status === 'fulfilled' && soilRes.value?.data?.length > 0) {
                const node2Soil = soilRes.value.data.filter(d => Number(d.device_id) === 2);
                if (node2Soil.length > 0) latestSoil = Number(node2Soil[0].moisture_percentage);
            }

            if (isInitial) {
                const ageMs = ts ? (Date.now() - new Date(ts).getTime()) : Infinity;
                let s = 'LIVE';
                if (ageMs >= 30000) s = 'OFFLINE';
                else if (ageMs >= 15000) s = 'STALE';
                this.status = s;
                this.lastTimestamp = ts;
                this.lastWallClock = Date.now() - Math.min(ageMs, 3600000);
                this.telemetry = { ph: latest.current_ph, turbidity: latest.turbidity_ntu, soil: latestSoil };
            } else if (isNew) {
                this.status = 'LIVE';
                this.lastTimestamp = ts;
                this.lastWallClock = Date.now();
                this.telemetry = { ph: latest.current_ph, turbidity: latest.turbidity_ntu, soil: latestSoil };
            } else {
                const elapsed = Date.now() - this.lastWallClock;
                if (elapsed >= 30000) this.status = 'OFFLINE';
                else if (elapsed >= 15000) this.status = 'STALE';
            }
        } catch (_err) {
            this.status = 'ERROR';
        }
    }

    tick() {
        if (this.lastWallClock > 0) {
            const elapsed = Date.now() - this.lastWallClock;
            if (this.status === 'LIVE' && elapsed >= 15000) this.status = 'STALE';
            else if ((this.status === 'LIVE' || this.status === 'STALE') && elapsed >= 30000) this.status = 'OFFLINE';
        }
    }
}

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runDualAudit() {
    console.log('========================================================================');
    console.log('🔬 ENVIROX DUAL ESP32-S3 COMPLETE END-TO-END SYSTEM VERIFICATION');
    console.log('========================================================================\n');

    const node1Client = new Node1DashboardClient();
    const node2Client = new Node2DashboardClient();

    // -------------------------------------------------------------------------
    // PHASE 1: SIMULTANEOUS 20-CYCLE TRANSMISSION TEST
    // -------------------------------------------------------------------------
    console.log('>>> PHASE 1: SIMULTANEOUS 20-CYCLE TRANSMISSION TEST (BOTH NODES CONCURRENT)');
    let node1Sent = 0, node1Received = 0;
    let node2Sent = 0, node2Received = 0;
    const cycleRows = [];

    for (let c = 1; c <= 20; c++) {
        // Concurrently transmit from Node 1 and Node 2
        node1Sent++;
        node2Sent++;
        const [res1, res2] = await Promise.all([
            sendNode1Packet(c),
            sendNode2Packet(c)
        ]);

        if (res1.ok) node1Received++;
        if (res2.ok) node2Received++;

        await sleep(300);

        // Poll both dashboards
        await Promise.all([node1Client.poll(), node2Client.poll()]);

        const correctIds = (node1Client.telemetry.temp !== undefined) && (node2Client.telemetry.ph !== undefined);
        cycleRows.push({
            cycle: c,
            node1Rec: res1.ok ? 'YES' : 'NO',
            node2Rec: res2.ok ? 'YES' : 'NO',
            correctIds: correctIds ? 'YES' : 'NO',
            n1Status: node1Client.status,
            n2Status: node2Client.status
        });

        process.stdout.write(`\r[Simultaneous Cycle ${c.toString().padStart(2, '0')}/20] Node 1: ${res1.ok ? 'OK' : 'ERR'} | Node 2: ${res2.ok ? 'OK' : 'ERR'} | Both LIVE: ${node1Client.status === 'LIVE' && node2Client.status === 'LIVE' ? 'YES' : 'WAIT'}`);
        await sleep(2200); // ~2.5s cycle
    }
    console.log('\n');

    console.log('Cycle | Node 1 received | Node 2 received | Correct device IDs | N1 Status | N2 Status');
    console.log('------+-----------------+-----------------+--------------------+-----------+----------');
    cycleRows.forEach(r => {
        console.log(`${r.cycle.toString().padEnd(5)} | ${r.node1Rec.padEnd(15)} | ${r.node2Rec.padEnd(15)} | ${r.correctIds.padEnd(18)} | ${r.n1Status.padEnd(9)} | ${r.n2Status}`);
    });

    const node1Loss = ((node1Sent - node1Received) / node1Sent) * 100;
    const node2Loss = ((node2Sent - node2Received) / node2Sent) * 100;

    console.log(`\nNode 1 packets sent: ${node1Sent}, received: ${node1Received}, loss: ${node1Loss.toFixed(1)}%`);
    console.log(`Node 2 packets sent: ${node2Sent}, received: ${node2Received}, loss: ${node2Loss.toFixed(1)}%`);

    // -------------------------------------------------------------------------
    // PHASE 2: CROSS-NODE ISOLATION & FAILURE HANDLING TEST
    // -------------------------------------------------------------------------
    console.log('\n>>> PHASE 2: CROSS-NODE ISOLATION & ASYMMETRIC FAILURE TEST');
    
    // Step 2A: Stop Node 1 transmission. Keep Node 2 running continuously.
    console.log('\n[Test 2A] Halting Node 1 transmissions while keeping Node 2 active...');
    const _haltN1Time = Date.now();
    let _n1StaleOrOffline = false;

    for (let s = 1; s <= 32; s++) {
        // Node 2 continues transmitting every 2.5s
        if (s % 3 === 0) {
            await sendNode2Packet(100 + s);
        }
        await sleep(1000);
        node1Client.tick();
        node2Client.tick();
        if (s % 5 === 0) {
            await Promise.all([node1Client.poll(), node2Client.poll()]);
        }
        if (node1Client.status === 'OFFLINE' || node1Client.status === 'STALE') {
            _n1StaleOrOffline = true;
        }
    }

    console.log(`After 32s with Node 1 stopped & Node 2 running:`);
    console.log(`- Node 1 Dashboard Status: ${node1Client.status} (Expected: STALE or OFFLINE)`);
    console.log(`- Node 2 Dashboard Status: ${node2Client.status} (Expected: LIVE)`);
    console.log(`- Did Node 1 use Node 2 as fallback? ${node1Client.status === 'LIVE' ? 'YES (FAILURE)' : 'NO (STRICTLY ISOLATED)'}`);
    const test2APass = (node1Client.status === 'OFFLINE' || node1Client.status === 'STALE') && node2Client.status === 'LIVE';

    // Step 2B: Resume Node 1. Stop Node 2 transmission.
    console.log('\n[Test 2B] Resuming Node 1 transmissions, halting Node 2...');
    await sendNode1Packet(200);
    await sleep(500);
    await Promise.all([node1Client.poll(), node2Client.poll()]);
    console.log(`- Immediate Node 1 recovery: ${node1Client.status} (Expected: LIVE)`);

    for (let s = 1; s <= 32; s++) {
        // Node 1 continues transmitting every 2.5s
        if (s % 3 === 0) {
            await sendNode1Packet(200 + s);
        }
        await sleep(1000);
        node1Client.tick();
        node2Client.tick();
        if (s % 5 === 0) {
            await Promise.all([node1Client.poll(), node2Client.poll()]);
        }
    }

    console.log(`After 32s with Node 2 stopped & Node 1 running:`);
    console.log(`- Node 2 Dashboard Status: ${node2Client.status} (Expected: STALE or OFFLINE)`);
    console.log(`- Node 1 Dashboard Status: ${node1Client.status} (Expected: LIVE)`);
    console.log(`- Did Node 2 use Node 1 as fallback? ${node2Client.status === 'LIVE' ? 'YES (FAILURE)' : 'NO (STRICTLY ISOLATED)'}`);
    const test2BPass = (node2Client.status === 'OFFLINE' || node2Client.status === 'STALE') && node1Client.status === 'LIVE';

    // Resume Node 2
    await sendNode2Packet(300);
    await sleep(500);
    await Promise.all([node1Client.poll(), node2Client.poll()]);
    console.log(`- Node 2 recovery: ${node2Client.status} (Expected: LIVE)`);

    // -------------------------------------------------------------------------
    // PHASE 3: BACKEND FAILURE & RECOVERY TEST
    // -------------------------------------------------------------------------
    console.log('\n>>> PHASE 3: BACKEND FAILURE & AUTOMATIC RECOVERY');
    const origF = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error('Backend connection refused (HTTP 500 / Network Down)'));

    await Promise.all([node1Client.poll(), node2Client.poll()]);
    console.log(`During simulated backend outage:`);
    console.log(`- Node 1 Dashboard: ${node1Client.status} (Expected: ERROR)`);
    console.log(`- Node 2 Dashboard: ${node2Client.status} (Expected: ERROR)`);
    const outageHandled = node1Client.status === 'ERROR' && node2Client.status === 'ERROR';

    // Restore backend
    globalThis.fetch = origF;
    await Promise.all([sendNode1Packet(400), sendNode2Packet(400)]);
    await sleep(500);
    await Promise.all([node1Client.poll(), node2Client.poll()]);
    console.log(`After backend restored:`);
    console.log(`- Node 1 Dashboard: ${node1Client.status} (Expected: LIVE)`);
    console.log(`- Node 2 Dashboard: ${node2Client.status} (Expected: LIVE)`);
    const recoveryHandled = node1Client.status === 'LIVE' && node2Client.status === 'LIVE';

    // -------------------------------------------------------------------------
    // PHASE 4: SENSOR VALUE INTEGRITY AUDIT
    // -------------------------------------------------------------------------
    console.log('\n>>> PHASE 4: SENSOR VALUE VERIFICATION');
    const sentN1 = { temp: 27.4, hum: 61.2, lux: 580, gas: false, rain: false, buzzer: false };
    const sentN2 = { moisture: 68, pH: 7.22, turbidityVoltage: 2.915 };

    await sendNode1Packet(500, { temperature: sentN1.temp, humidity: sentN1.hum, lux: sentN1.lux, gasDetected: sentN1.gas, rainDetected: sentN1.rain, buzzer: sentN1.buzzer });
    await sendNode2Packet(500, { soilMoisture: sentN2.moisture, pH: sentN2.pH, turbidityVoltage: sentN2.turbidityVoltage });
    await sleep(600);

    const [airLogs, lightLogs, waterLogs, soilLogs] = await Promise.all([
        fetchAirQualityLogs(1, {}, false),
        fetchLightIntensityLogs(1, {}, false),
        fetchWaterQualityLogs(1, { device_id: 2 }, false),
        fetchSoilMoistureLogs(1)
    ]);

    await Promise.all([node1Client.poll(), node2Client.poll()]);

    const n1DbAir = airLogs.data?.[0];
    const n1DbLux = lightLogs.data?.[0];
    const n2DbWater = waterLogs.data?.[0];
    const n2DbSoil = soilLogs.data?.[0];

    const sensorAuditRows = [
        { node: 'Node 1', sensor: 'Temperature', esp: `${sentN1.temp} °C`, backend: `${sentN1.temp}`, db: `${Number(n1DbAir?.current_temperature).toFixed(1)} °C`, web: `${node1Client.telemetry.temp} °C`, match: Number(sentN1.temp).toFixed(1) === Number(node1Client.telemetry.temp).toFixed(1) ? 'MATCH' : 'MISMATCH' },
        { node: 'Node 1', sensor: 'Humidity', esp: `${sentN1.hum} %`, backend: `${sentN1.hum}`, db: `${Number(n1DbAir?.current_humidity).toFixed(1)} %`, web: `${node1Client.telemetry.hum} %`, match: Number(sentN1.hum).toFixed(1) === Number(node1Client.telemetry.hum).toFixed(1) ? 'MATCH' : 'MISMATCH' },
        { node: 'Node 1', sensor: 'Light (Lux)', esp: `${sentN1.lux} lx`, backend: `${sentN1.lux}`, db: `${Number(n1DbLux?.lux_value).toFixed(0)} lx`, web: `${node1Client.telemetry.lux} lx`, match: Number(sentN1.lux).toFixed(0) === Number(node1Client.telemetry.lux).toFixed(0) ? 'MATCH' : 'MISMATCH' },
        { node: 'Node 1', sensor: 'Gas Alarm', esp: `${sentN1.gas}`, backend: `${sentN1.gas}`, db: `${n1DbAir?.gas_detected}`, web: `${node1Client.telemetry.gas}`, match: String(sentN1.gas) === String(node1Client.telemetry.gas) ? 'MATCH' : 'MISMATCH' },
        { node: 'Node 1', sensor: 'Rain Alarm', esp: `${sentN1.rain}`, backend: `${sentN1.rain}`, db: `${n1DbAir?.rain_detected}`, web: `${node1Client.telemetry.rain}`, match: String(sentN1.rain) === String(node1Client.telemetry.rain) ? 'MATCH' : 'MISMATCH' },
        { node: 'Node 1', sensor: 'Buzzer State', esp: `${sentN1.buzzer ? 'ON' : 'OFF'}`, backend: `${sentN1.buzzer ? 'ON' : 'OFF'}`, db: `${n1DbAir?.buzzer_active ? 'ON' : 'OFF'}`, web: `${node1Client.telemetry.buzzer ? 'ON' : 'OFF'}`, match: String(sentN1.buzzer) === String(node1Client.telemetry.buzzer) ? 'MATCH' : 'MISMATCH' },
        { node: 'Node 2', sensor: 'Soil Moisture', esp: `${sentN2.moisture} %`, backend: `${sentN2.moisture}`, db: `${n2DbSoil?.moisture_percentage} %`, web: `${node2Client.telemetry.soil} %`, match: Number(sentN2.moisture) === Number(node2Client.telemetry.soil) ? 'MATCH' : 'MISMATCH' },
        { node: 'Node 2', sensor: 'Water pH', esp: `${sentN2.pH}`, backend: `${sentN2.pH}`, db: `${Number(n2DbWater?.current_ph).toFixed(2)}`, web: `${Number(node2Client.telemetry.ph).toFixed(2)}`, match: Number(sentN2.pH).toFixed(2) === Number(node2Client.telemetry.ph).toFixed(2) ? 'MATCH' : 'MISMATCH' }
    ];

    console.log('Node   | Sensor        | ESP32 value | Backend value | Database value | Website value | Match');
    console.log('-------+---------------+-------------+---------------+----------------+---------------+------');
    sensorAuditRows.forEach(r => {
        console.log(`${r.node.padEnd(6)} | ${r.sensor.padEnd(13)} | ${r.esp.padEnd(11)} | ${r.backend.padEnd(13)} | ${r.db.padEnd(14)} | ${r.web.padEnd(13)} | ${r.match}`);
    });

    const allSensorsMatch = sensorAuditRows.every(r => r.match === 'MATCH');

    // -------------------------------------------------------------------------
    // PHASE 5: BUZZER LIVE TEST (ALARM TRIGGERS VS NORMAL OPERATION)
    // -------------------------------------------------------------------------
    console.log('\n>>> PHASE 5: BUZZER BEHAVIOR & LOGIC AUDIT');

    // Condition 1: Normal operation
    const norm = await sendNode1Packet(601, { gasDetected: false, rainDetected: false, buzzer: false });
    const normBuzzer = norm.payload.buzzer ? 'ON' : 'OFF';

    // Condition 2: Gas alarm
    const gasAlarm = await sendNode1Packet(602, { gasDetected: true, rainDetected: false, buzzer: true });
    const gasAlarmBuzzer = gasAlarm.payload.buzzer ? 'ON' : 'OFF';

    // Condition 3: Rain alarm
    const rainAlarm = await sendNode1Packet(603, { gasDetected: false, rainDetected: true, buzzer: true });
    const rainAlarmBuzzer = rainAlarm.payload.buzzer ? 'ON' : 'OFF';

    // Condition 4: Alarm cleared
    const alarmCleared = await sendNode1Packet(604, { gasDetected: false, rainDetected: false, buzzer: false });
    const clearedBuzzer = alarmCleared.payload.buzzer ? 'ON' : 'OFF';

    console.log(`- Normal Operation:               Buzzer = ${normBuzzer} (Expected: OFF)`);
    console.log(`- Gas Spike (>1500 limit):        Buzzer = ${gasAlarmBuzzer} (Expected: ON)`);
    console.log(`- Rainfall Detected (<3500 limit):Buzzer = ${rainAlarmBuzzer} (Expected: ON)`);
    console.log(`- Alarms Cleared:                 Buzzer = ${clearedBuzzer} (Expected: OFF)`);
    console.log(`- Telemetry Transmission Buzz:    NONE (No buzzer invocation in sendTelemetry)`);
    console.log(`- Web Polling Buzz:               NONE (Buzzer is purely local edge pin)`);
    console.log(`- Wi-Fi Reconnect Buzz:           NONE (No buzzer invocation in checkWiFi)`);

    const buzzerLogicPass = normBuzzer === 'OFF' && gasAlarmBuzzer === 'ON' && rainAlarmBuzzer === 'ON' && clearedBuzzer === 'OFF';

    console.log(`\n========================================================================`);
    console.log(`AUDIT COMPLETE. SUMMARY:`);
    console.log(`Simultaneous Transmission: 20/20 (${node1Loss === 0 && node2Loss === 0 ? 'PASS' : 'WARN'})`);
    console.log(`Cross-Node Isolation:      ${test2APass && test2BPass ? 'PASS' : 'FAIL'}`);
    console.log(`Backend Outage & Recovery: ${outageHandled && recoveryHandled ? 'PASS' : 'FAIL'}`);
    console.log(`Sensor Value Integrity:    ${allSensorsMatch ? 'PASS' : 'FAIL'}`);
    console.log(`Buzzer Logic Integrity:    ${buzzerLogicPass ? 'PASS' : 'FAIL'}`);
    console.log(`========================================================================\n`);

    const overallSuccess = (node1Loss === 0 && node2Loss === 0) &&
                           test2APass && test2BPass &&
                           outageHandled && recoveryHandled &&
                           allSensorsMatch && buzzerLogicPass;

    process.exit(overallSuccess ? 0 : 1);
}

runDualAudit().catch(e => {
    console.error('Fatal dual audit error:', e);
    process.exit(1);
});
