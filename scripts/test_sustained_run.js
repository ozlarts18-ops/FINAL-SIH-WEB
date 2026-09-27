import { fetchAirQualityLogs, fetchWaterQualityLogs } from '../src/api/dataService.js';

const origFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
    if (url.startsWith('/api') || url.startsWith('/data')) {
        url = 'http://localhost:5173' + url;
    }
    return origFetch(url, opts);
};

const POST_URL = 'http://localhost:5173/data';

async function sendNode1(step) {
    const temp = parseFloat((26.0 + Math.sin(step * 0.1) * 3.0).toFixed(1));
    const hum = parseFloat((58.0 + Math.cos(step * 0.08) * 10.0).toFixed(1));
    const lux = parseFloat((520 + Math.sin(step * 0.15) * 300).toFixed(1));
    const payload = {
        device: 'ESP32-S3-01',
        temperature: temp,
        humidity: hum,
        lux: lux,
        gasDetected: false,
        rainDetected: false,
        buzzer: false
    };
    const res = await origFetch(POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return res.ok;
}

async function runSustained(cycles = 60) {
    console.log(`Starting sustained test: ${cycles} cycles (~2.5s each = ~150s total)...`);
    let n1Sent = 0, n1Rec = 0;
    let _n2InitialWater, _n2FinalWater;

    const w0 = await fetchWaterQualityLogs(1, { device_id: 2 }, false);
    _n2InitialWater = w0.data?.[0];

    for (let i = 1; i <= cycles; i++) {
        n1Sent++;
        const ok = await sendNode1(i);
        if (ok) n1Rec++;
        if (i % 10 === 0) {
            const [w, a] = await Promise.all([
                fetchWaterQualityLogs(1, { device_id: 2 }, false),
                fetchAirQualityLogs(1, {}, false)
            ]);
            console.log(`[Cycle ${i.toString().padStart(2, '0')}/${cycles}] Node 1 TS: ${a.data[0]?.recorded_at} | Physical Node 2 TS: ${w.data[0]?.recorded_at} (pH=${w.data[0]?.current_ph})`);
        }
        await new Promise(r => setTimeout(r, 2500));
    }

    const [wFinal, aFinal] = await Promise.all([
        fetchWaterQualityLogs(1, { device_id: 2 }, false),
        fetchAirQualityLogs(1, {}, false)
    ]);

    console.log('\n--- SUSTAINED RUN RESULTS ---');
    console.log(`Node 1: Sent ${n1Sent}, Received ${n1Rec}, Loss: ${(((n1Sent - n1Rec) / n1Sent) * 100).toFixed(1)}%`);
    console.log(`Node 1 Latest Timestamp: ${aFinal.data[0]?.recorded_at}`);
    console.log(`Node 2 Latest Timestamp: ${wFinal.data[0]?.recorded_at}`);
    console.log(`Node 2 Latest pH: ${wFinal.data[0]?.current_ph}`);
    console.log(`Node 2 Latest Turbidity: ${wFinal.data[0]?.turbidity_ntu} NTU`);
}

runSustained(30).catch(console.error);
