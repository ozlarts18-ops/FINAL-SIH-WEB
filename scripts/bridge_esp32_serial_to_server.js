import { spawn } from 'child_process';

const TARGET_URL = 'http://localhost:5173/data';

console.log('======================================================================');
console.log('⚡ ENVIROX PHYSICAL USB SERIAL -> SERVER BRIDGE (MULTI-PORT AUTO-DETECT)');
console.log(`📡 Ingesting into:    ${TARGET_URL}`);
console.log('======================================================================\n');

const py = spawn('python', ['-u', '-c', `
import serial, serial.tools.list_ports, sys, json, time, threading

target_ports = ['COM7', 'COM10']

def monitor_port(port_name):
    while True:
        try:
            s = serial.Serial(port_name, 115200, timeout=1.0)
            print(f"CONNECTED:{port_name}", flush=True)
            while True:
                line = s.readline().decode('utf-8', errors='replace').strip()
                if line:
                    print(f"[{port_name}] {line}", flush=True)
        except Exception as e:
            time.sleep(2.0)

for p in target_ports:
    t = threading.Thread(target=monitor_port, args=(p,), daemon=True)
    t.start()

while True:
    time.sleep(1)
`]);

py.stdout.on('data', async (chunk) => {
    const text = chunk.toString();
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const cleanLine = trimmed.replace(/^\[COM\d+\]\s*/, '');

        if (cleanLine.startsWith('Payload: ') || (cleanLine.startsWith('{') && cleanLine.endsWith('}'))) {
            const jsonStr = cleanLine.startsWith('Payload: ') ? cleanLine.replace('Payload: ', '').trim() : cleanLine;
            try {
                const payload = JSON.parse(jsonStr);
                console.log(`📡 [REAL HARDWARE DATA] ->`, payload);

                const res = await fetch(TARGET_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const resJson = await res.json();
                console.log(`✅ [EnviroX Ingestion HTTP ${res.status}] ${payload.device} -> Status: ${resJson.status || 'OK'}`);
            } catch (e) {}} else if (cleanLine.includes('SENSOR STATUS') || cleanLine.includes('Temperature:') || cleanLine.includes('Humidity:') || cleanLine.includes('Soil Moisture:') || cleanLine.includes('pH:') || cleanLine.includes('Light:')) {
            console.log(`📟 ${trimmed}`);
        } else if (trimmed.startsWith('CONNECTED:')) {
            console.log(`⚡ ${trimmed}`);
        }
    }
});

py.stderr.on('data', (err) => {
    console.error(`[Serial Error]:`, err.toString().trim());
});

py.on('close', (code) => {
    console.log(`Serial connection closed with code ${code}`);
});
