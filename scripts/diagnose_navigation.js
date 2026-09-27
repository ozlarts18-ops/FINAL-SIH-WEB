import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
    console.log('Starting headless Chrome for navigation diagnosis...');
    const chrome = spawn(CHROME_PATH, [
        '--remote-debugging-port=9222',
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--user-data-dir=' + process.env.TEMP + '\\chrome_test_profile_' + Date.now()
    ]);

    await new Promise(r => setTimeout(r, 1500));

    try {
        const versionRes = await fetch('http://127.0.0.1:9222/json/version');
        const versionData = await versionRes.json();
        console.log('Chrome Debugger attached:', versionData.Browser);

        const newTargetRes = await fetch('http://127.0.0.1:9222/json/new?http://localhost:5173/dashboard', { method: 'PUT' });
        const target = await newTargetRes.json();
        console.log('Opened target:', target.id, target.url);

        const ws = new WebSocket(target.webSocketDebuggerUrl);

        let msgId = 1;
        const pendingCallbacks = new Map();

        const call = (method, params = {}) => {
            return new Promise((resolve, reject) => {
                const id = msgId++;
                pendingCallbacks.set(id, { resolve, reject });
                ws.send(JSON.stringify({ id, method, params }));
            });
        };

        ws.onopen = async () => {
            console.log('CDP WebSocket connected. Enabling Console, Runtime, Page, Log...');
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
                console.error('\n💥💥💥 [RUNTIME EXCEPTION THROWN] 💥💥💥');
                console.error(JSON.stringify(msg.params.exceptionDetails, null, 2));
            } else if (msg.method === 'Console.messageAdded') {
                console.log(`[Browser Console ${msg.params.message.level}]:`, msg.params.message.text);
            } else if (msg.method === 'Runtime.consoleAPICalled') {
                const args = (msg.params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
                console.log(`[Console ${msg.params.type}]:`, args);
            }
        };

        // Wait 2 seconds for initial page load
        await new Promise(r => setTimeout(r, 2000));

        // Set auth in localStorage
        console.log('Injecting auth token into localStorage...');
        await call('Runtime.evaluate', {
            expression: `localStorage.setItem('iotrex_user', JSON.stringify({ id: 'test_admin', email: 'admin@envirox.io', role: 'admin' }))`
        });

        // Navigate to /dashboard/weather
        console.log('Navigating to /dashboard/weather...');
        await call('Page.navigate', { url: 'http://localhost:5173/dashboard/weather' });

        // Wait 6 seconds on /dashboard/weather
        console.log('Waiting 6s on /dashboard/weather...');
        await new Promise(r => setTimeout(r, 6000));

        const initialDoc = await call('Runtime.evaluate', {
            expression: `({
                url: window.location.href,
                rootLen: document.getElementById('root')?.innerHTML?.length || 0,
                links: Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href }))
            })`,
            returnByValue: true
        });
        console.log('\nInitial state on /dashboard/weather:', JSON.stringify(initialDoc.result?.value, null, 2));

        // Click on /dashboard/water
        console.log('\nSimulating click to /dashboard/water...');
        const clickRes = await call('Runtime.evaluate', {
            expression: `(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const waterLink = links.find(a => a.href && a.href.includes('/dashboard/water'));
                if (waterLink) {
                    waterLink.click();
                    return 'Clicked: ' + waterLink.href;
                }
                return 'Water link NOT found!';
            })()`,
            returnByValue: true
        });
        console.log('Click result:', clickRes.result?.value);

        // Wait 4s after click
        await new Promise(r => setTimeout(r, 4000));

        const postNavDoc = await call('Runtime.evaluate', {
            expression: `({
                url: window.location.href,
                rootLen: document.getElementById('root')?.innerHTML?.length || 0,
                rootSnippet: document.getElementById('root')?.innerHTML?.slice(0, 500) || '',
                bodyBg: window.getComputedStyle(document.body).backgroundColor,
                bodyColor: window.getComputedStyle(document.body).color
            })`,
            returnByValue: true
        });
        console.log('\nPost-Navigation state:', JSON.stringify(postNavDoc.result?.value, null, 2));

    } catch (e) {
        console.error('Diagnosis error:', e);
    } finally {
        chrome.kill();
        process.exit(0);
    }
}

main();
