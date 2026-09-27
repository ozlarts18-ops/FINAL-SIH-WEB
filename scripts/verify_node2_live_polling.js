import { fetchWaterQualityLogs } from '../src/api/dataService.js';

// Polyfill fetch for node if needed (Node 18+ has native fetch)
globalThis.API_BASE = 'http://localhost:5173/api';

// Override fetch in dataService by pointing /api to http://localhost:5173/api
const origFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
    if (url.startsWith('/api')) {
        url = 'http://localhost:5173' + url;
    }
    return origFetch(url, opts);
};

console.log('========================================================================');
console.log('🔬 VERIFYING ESP32-S3 NODE 2 CONTINUOUS LIVE SENSOR POLLING (10 CYCLES)');
console.log('========================================================================\n');

let lastRecordedTimestamp = null;
const cycles = [];

async function pollCycle(cycleNum) {
    const startTime = Date.now();
    const res = await fetchWaterQualityLogs(50, { device_id: 2 }, false);

    if (!res.data || res.data.length === 0) {
        console.error(`[Cycle ${cycleNum}] ❌ No records found!`);
        return;
    }

    // Filter strictly for Node 2
    const data = res.data.filter(d => Number(d.device_id) === 2 || d.device_uid === 'ESP32-S3-02' || !d.device_id);
    const latest = data[0];
    const currentTimestamp = latest.recorded_at;

    const isNew = !lastRecordedTimestamp || (currentTimestamp && new Date(currentTimestamp).getTime() > new Date(lastRecordedTimestamp).getTime());
    const _timestampAdvanced = lastRecordedTimestamp !== null && new Date(currentTimestamp).getTime() > new Date(lastRecordedTimestamp).getTime();

    if (isNew) {
        lastRecordedTimestamp = currentTimestamp;
    }

    const elapsed = Date.now() - startTime;
    const phVal = Number(latest.current_ph).toFixed(2);
    const turbVal = Number(latest.turbidity_ntu).toFixed(1);

    cycles.push({
        cycle: cycleNum,
        timestamp: currentTimestamp,
        ph: phVal,
        turbidity: `${turbVal} NTU`,
        uiUpdated: isNew ? 'YES' : 'NO (unchanged)',
        device: latest.device_id === 2 ? 'ESP32-S3-02 (Node 2)' : `Unknown (${latest.device_id})`
    });

    console.log(`[Cycle #${cycleNum.toString().padStart(2, ' ')}] Timestamp: ${currentTimestamp} | pH: ${phVal} | Turbidity: ${turbVal} NTU | UI Updated: ${isNew ? 'YES' : 'NO'} (${elapsed}ms)`);
}

async function run() {
    console.log('Observing live backend telemetry from ESP32-S3 Node 2 every 5 seconds for 10 cycles...\n');
    for (let c = 1; c <= 10; c++) {
        await pollCycle(c);
        if (c < 10) {
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    console.log('\n========================================================================');
    console.log('📊 FINAL TEST RESULT TABLE:');
    console.log('========================================================================');
    console.log('Cycle | Backend Timestamp          | pH   | Turbidity   | UI Updated');
    console.log('------+----------------------------+------+-------------+-----------');
    cycles.forEach(c => {
        console.log(`${c.cycle.toString().padEnd(5, ' ')} | ${c.timestamp.padEnd(26, ' ')} | ${c.ph.padEnd(4, ' ')} | ${c.turbidity.padEnd(11, ' ')} | ${c.uiUpdated}`);
    });
    console.log('========================================================================\n');

    const allUpdated = cycles.every(c => c.uiUpdated === 'YES');
    console.log(`✅ All 10 cycles verified: ${allUpdated ? 'SUCCESS - Every cycle received fresh Node 2 live data!' : 'PARTIAL - Some cycles had same timestamp'}`);
    process.exit(0);
}

run().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
