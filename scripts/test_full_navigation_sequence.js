import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
    console.log('--- STARTING CDP FULL NAVIGATION TEST ---');
    const chrome = spawn(CHROME_PATH, [
        '--remote-debugging-port=9223',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--user-data-dir=' + process.env.TEMP + '\\chrome_test_profile_' + Date.now()
    ]);

    await new Promise(r => setTimeout(r, 2000));

    try {
        const newTargetRes = await fetch('http://127.0.0.1:9223/json/new?http://localhost:5173/dashboard', { method: 'PUT' });
        const target = await newTargetRes.json();
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        let msgId = 1;
        const pendingCallbacks = new Map();
        const errors = [];
        const _consoleLogs = [];

        const call = (method, params = {}) => {
            return new Promise((resolve, reject) => {
                const id = msgId++;
                pendingCallbacks.set(id, { resolve, reject });
                ws.send(JSON.stringify({ id, method, params }));
            });
        };

        ws.onopen = async () => {
            await call('Runtime.enable');
            await call('Console.enable');
            await call('Log.enable');
            await call('Page.enable');
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id && pendingCallbacks.has(msg.id)) {
                const { resolve, reject } = pendingCallbacks.get(msg.id);
                pendingCallbacks.delete(msg.id);
                if (msg.error) reject(msg.error);
                else resolve(msg.result);
                return;
            }

            if (msg.method === 'Runtime.exceptionThrown') {
                const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text;
                console.error('\n💥 [Runtime Exception]:', desc);
                errors.push({ type: 'Runtime.exceptionThrown', details: msg.params.exceptionDetails });
            } else if (msg.method === 'Console.messageAdded') {
                if (msg.params.message.level === 'error') {
                    console.error('[Browser Console error]:', msg.params.message.text);
                    errors.push({ type: 'Console.error', text: msg.params.message.text });
                }
            } else if (msg.method === 'Runtime.consoleAPICalled') {
                if (msg.params.type === 'error') {
                    const args = (msg.params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
                    console.error('[Console.error]:', args);
                    errors.push({ type: 'console.error', text: args });
                }
            }
        };

        // Wait 2s
        await new Promise(r => setTimeout(r, 2000));

        // Inject auth into localStorage
        console.log('1. Setting auth in localStorage...');
        await call('Runtime.evaluate', {
            expression: `localStorage.setItem('iotrex_user', JSON.stringify({ id: 'test_admin', email: 'admin@envirox.io', role: 'admin' }))`
        });

        // 1. Open pd.jsx (/dashboard/weather)
        console.log('\n2. Navigating to /dashboard/weather (pd.jsx)...');
        await call('Page.navigate', { url: 'http://localhost:5173/dashboard/weather' });

        // Wait 20 seconds on pd.jsx
        console.log('3. Waiting 20 seconds on pd.jsx (testing sustained Live Canopy)...');
        for (let i = 1; i <= 4; i++) {
            await new Promise(r => setTimeout(r, 5000));
            console.log(`   ...${i * 5}s passed`);
        }

        const pdCheck = await call('Runtime.evaluate', {
            expression: `({
                url: window.location.href,
                rootLen: document.getElementById('root')?.innerHTML?.length || 0,
                hasLiveCanopy: !!document.querySelector('.live-canopy-panel'),
                streamImg: document.querySelector('.live-canopy-stream-img')?.src,
                offlineBadge: document.querySelector('.live-canopy-offline')?.innerText?.trim()
            })`,
            returnByValue: true
        });
        console.log('pd.jsx status:', JSON.stringify(pdCheck.result?.value, null, 2));

        // Function to click nav link and evaluate state
        async function navigateAndCheck(path, name) {
            console.log(`\nNavigating to ${name} (${path}) via client-side click...`);
            const clickRes = await call('Runtime.evaluate', {
                expression: `(() => {
                    const link = document.querySelector('a[href="${path}"]');
                    if (link) {
                        link.click();
                        return 'Clicked ' + link.href;
                    }
                    return 'Link ${path} not found';
                })()`,
                returnByValue: true
            });
            console.log('Click result:', clickRes.result?.value);

            await new Promise(r => setTimeout(r, 4000));

            const state = await call('Runtime.evaluate', {
                expression: `({
                    url: window.location.href,
                    rootLen: document.getElementById('root')?.innerHTML?.length || 0,
                    bodyBg: window.getComputedStyle(document.body).backgroundColor,
                    isBlank: (document.getElementById('root')?.innerHTML?.length || 0) < 50,
                    h1Text: document.querySelector('h1, h2')?.innerText?.trim(),
                    rootSnippet: document.getElementById('root')?.innerHTML?.slice(0, 150)
                })`,
                returnByValue: true
            });
            console.log(`${name} state:`, JSON.stringify(state.result?.value, null, 2));
            return state.result?.value;
        }

        // 4. Navigate to plant.jsx (/dashboard/plant)
        const _plantState1 = await navigateAndCheck('/dashboard/plant', 'plant.jsx');

        // 5. Navigate to water.jsx (/dashboard/water)
        const _waterState = await navigateAndCheck('/dashboard/water', 'water.jsx');

        // 6. Navigate to air.jsx (/dashboard/air)
        const _airState = await navigateAndCheck('/dashboard/air', 'air.jsx');

        // 7. Navigate back to pd.jsx (/dashboard/weather)
        const _pdState2 = await navigateAndCheck('/dashboard/weather', 'pd.jsx (2nd visit)');

        // Wait 5s for camera re-establishment
        await new Promise(r => setTimeout(r, 5000));
        const pdCameraCheck = await call('Runtime.evaluate', {
            expression: `({
                hasLiveCanopy: !!document.querySelector('.live-canopy-panel'),
                streamImg: document.querySelector('.live-canopy-stream-img')?.src,
                offlineBadge: document.querySelector('.live-canopy-offline')?.innerText?.trim()
            })`,
            returnByValue: true
        });
        console.log('pd.jsx re-connect status:', JSON.stringify(pdCameraCheck.result?.value, null, 2));

        // 8. Navigate back to plant.jsx (/dashboard/plant)
        const _plantState2 = await navigateAndCheck('/dashboard/plant', 'plant.jsx (2nd visit)');

        console.log('\n--- NAVIGATION TEST COMPLETED ---');
        console.log('Total errors/exceptions caught:', errors.length);
        if (errors.length > 0) {
            console.error('Errors encountered:', JSON.stringify(errors, null, 2));
        }

    } catch (err) {
        console.error('Test execution failed:', err);
    } finally {
        chrome.kill();
        process.exit(0);
    }
}

main();
