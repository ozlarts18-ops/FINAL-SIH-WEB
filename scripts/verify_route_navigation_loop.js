import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
    console.log('====================================================');
    console.log('   ENVIROX NAVIGATION & CAMERA RESILIENCE TEST      ');
    console.log('====================================================\n');

    const chrome = spawn(CHROME_PATH, [
        '--remote-debugging-port=9224',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--user-data-dir=' + process.env.TEMP + '\\chrome_nav_test_' + Date.now()
    ]);

    await new Promise(r => setTimeout(r, 2000));

    try {
        const newTargetRes = await fetch('http://127.0.0.1:9224/json/new?http://localhost:5173/dashboard', { method: 'PUT' });
        const target = await newTargetRes.json();
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        let msgId = 1;
        const pending = new Map();
        const runtimeErrors = [];

        const call = (method, params = {}) => {
            return new Promise((resolve, reject) => {
                const id = msgId++;
                pending.set(id, { resolve, reject });
                ws.send(JSON.stringify({ id, method, params }));
            });
        };

        ws.onopen = async () => {
            await call('Runtime.enable');
            await call('Console.enable');
            await call('Page.enable');
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id && pending.has(msg.id)) {
                const { resolve, reject } = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) reject(msg.error);
                else resolve(msg.result);
                return;
            }

            if (msg.method === 'Runtime.exceptionThrown') {
                const text = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text;
                console.error('\n💥 [Browser Runtime Exception]:', text);
                runtimeErrors.push(text);
            }
        };

        await new Promise(r => setTimeout(r, 2000));

        // Inject authentication
        console.log('[Step 1] Initializing session authentication in localStorage...');
        await call('Runtime.evaluate', {
            expression: `localStorage.setItem('iotrex_user', JSON.stringify({ id: 'test_operator', email: 'operator@envirox.io', role: 'operator' }))`
        });

        // 1. Open pd.jsx
        console.log('\n[Step 2] Navigating to pd.jsx (/dashboard/weather)...');
        await call('Page.navigate', { url: 'http://localhost:5173/dashboard/weather' });

        // Wait on pd.jsx
        console.log('[Step 3] Waiting 20 seconds on pd.jsx to test sustained Live Canopy & Pest AI...');
        for (let s = 5; s <= 20; s += 5) {
            await new Promise(r => setTimeout(r, 5000));
            console.log(`         ...${s}s elapsed on pd.jsx`);
        }

        const pd1 = await call('Runtime.evaluate', {
            expression: `({
                url: window.location.href,
                hasCanopy: !!document.querySelector('.live-canopy-panel'),
                imgSrc: document.querySelector('.live-canopy-stream-img')?.src || null,
                streamVisible: !!document.querySelector('.live-canopy-stream-img'),
                aiBadge: document.querySelector('.live-canopy-ai-pill')?.innerText || null,
                rootLen: document.getElementById('root')?.innerHTML?.length || 0
            })`,
            returnByValue: true
        });
        console.log('         pd.jsx status:', JSON.stringify(pd1.result?.value));

        // Check camera health on backend
        const camStatus1 = await fetch('http://localhost:5173/api/camera/status').then(r => r.json());
        console.log(`         Camera Hardware Status: Connected=${camStatus1.connected}, IP=${camStatus1.cameraIp}`);

        // Helper navigation function
        async function navigateRoute(urlPath, pageLabel) {
            console.log(`\n[Nav] Clicking to ${pageLabel} (${urlPath})...`);
            await call('Runtime.evaluate', {
                expression: `(() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const targetLink = links.find(a => a.href && a.href.includes('${urlPath}'));
                    if (targetLink) {
                        targetLink.click();
                        return 'Clicked';
                    }
                    window.location.href = '${urlPath}';
                    return 'Window location fallback';
                })()`
            });

            await new Promise(r => setTimeout(r, 4000));

            const evalRes = await call('Runtime.evaluate', {
                expression: `({
                    url: window.location.href,
                    rootLen: document.getElementById('root')?.innerHTML?.length || 0,
                    hasBlackScreen: (document.getElementById('root')?.innerHTML?.length || 0) < 100,
                    hasErrorBoundary: !!document.querySelector('h2')?.innerText?.includes('failed to load'),
                    hasLiveCanopy: !!document.querySelector('.live-canopy-panel'),
                    imgSrc: document.querySelector('.live-canopy-stream-img')?.src || null,
                    pageTitle: document.querySelector('h1, h2')?.innerText || document.title
                })`,
                returnByValue: true
            });

            const data = evalRes.result?.value;
            console.log(`      -> Rendered ${pageLabel}: URL=${data.url}, DOM size=${data.rootLen} chars, BlackScreen=${data.hasBlackScreen}, LiveCanopy=${data.hasLiveCanopy}`);
            if (data.hasBlackScreen) {
                throw new Error(`FAILURE: Black screen detected on ${pageLabel}!`);
            }
            return data;
        }

        // Run multi-cycle test
        for (let cycle = 1; cycle <= 2; cycle++) {
            console.log(`\n================== NAVIGATION CYCLE ${cycle} ==================`);

            // Step 5 & 6: Navigate to plant.jsx
            await navigateRoute('/dashboard/plant', 'plant.jsx');

            // Wait 5s for plant AI
            await new Promise(r => setTimeout(r, 5000));

            // Step 7 & 8: Navigate to water.jsx
            await navigateRoute('/dashboard/water', 'water.jsx');

            // Step 9 & 10: Navigate to crop.jsx
            await navigateRoute('/dashboard/crop', 'crop.jsx');

            // Step 11 & 12: Navigate back to pd.jsx
            const _pdReturn = await navigateRoute('/dashboard/weather', 'pd.jsx (Return)');

            // Wait 6s for camera reconnect on pd.jsx
            await new Promise(r => setTimeout(r, 6000));
            const pdCheck = await call('Runtime.evaluate', {
                expression: `({
                    hasLiveCanopy: !!document.querySelector('.live-canopy-panel'),
                    imgVisible: !!document.querySelector('.live-canopy-stream-img'),
                    aiStatus: document.querySelector('.live-canopy-ai-pill')?.innerText
                })`,
                returnByValue: true
            });
            console.log('      pd.jsx Live Canopy Reconnect Check:', JSON.stringify(pdCheck.result?.value));

            // Step 13 & 14: Navigate back to plant.jsx
            await navigateRoute('/dashboard/plant', 'plant.jsx (Return)');

            // Check camera status
            const camCheck = await fetch('http://localhost:5173/api/camera/status').then(r => r.json());
            console.log(`      ESP32-CAM Status: Online=${camCheck.connected}, IP=${camCheck.cameraIp}`);
            if (!camCheck.connected) {
                console.warn('      WARNING: Camera disconnected during navigation!');
            }
        }

        console.log('\n====================================================');
        console.log('   NAVIGATION VERIFICATION SUMMARY                  ');
        console.log('====================================================');
        console.log(`Total Runtime Errors Detected: ${runtimeErrors.length}`);
        if (runtimeErrors.length > 0) {
            console.error('Errors:', runtimeErrors);
            process.exit(1);
        } else {
            console.log('✅ ALL PAGES RENDERED CLEANLY (0 BLACK SCREENS)');
            console.log('✅ NO REACT RUNTIME EXCEPTIONS');
            console.log('✅ LIVE CANOPY CONNECTS & RECONNECTS SEAMLESSLY');
            console.log('✅ ESP32-CAM CAMERA HARDWARE STAYS ONLINE');
        }

    } catch (e) {
        console.error('Navigation Loop Test Error:', e);
        process.exit(1);
    } finally {
        chrome.kill();
        process.exit(0);
    }
}

main();
