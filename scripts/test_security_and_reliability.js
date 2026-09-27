import http from 'http';
import { generateUserToken } from '../server/apiBridge.js';

const BASE_URL = 'http://localhost:5173';

function makeRequest(path, method = 'GET', body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let resBody = '';
            res.on('data', chunk => { resBody += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resBody);
                    resolve({ status: res.statusCode, headers: res.headers, data: parsed });
                } catch (_e) {
                    resolve({ status: res.statusCode, headers: res.headers, raw: resBody });
                }
            });
        });

        req.on('error', (err) => reject(err));
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

async function runSecurityTests() {
    console.log('🛡️ === ENVIROX SECURITY & RELIABILITY VERIFICATION ===\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Telemetry Data & Explicit States
    try {
        const res = await makeRequest('/data');
        if (res.status === 200 && res.data.node1 && res.data.node2) {
            console.log(`✅ [1/6 DATA INTEGRITY] GET /data HTTP 200 | Node1 State: ${res.data.node1.state} | Node2 State: ${res.data.node2.state}`);
            passed++;
        } else {
            console.error(`❌ [1/6 DATA INTEGRITY] Failed: HTTP ${res.status}`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [1/6 DATA INTEGRITY] Error:`, e.message);
        failed++;
    }

    // Test 2: Invalid Actuator Type Handling (Input Validation)
    try {
        const res = await makeRequest('/api/controls', 'POST', { actuator_type: 'laser_cannon', action: 'ON' });
        if (res.status === 400 && res.data.status === 'error') {
            console.log(`✅ [2/6 INPUT VALIDATION] Invalid actuator type rejected with HTTP 400: "${res.data.message}"`);
            passed++;
        } else {
            console.error(`❌ [2/6 INPUT VALIDATION] Failed: Expected HTTP 400, got ${res.status}`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [2/6 INPUT VALIDATION] Error:`, e.message);
        failed++;
    }

    // Test 3: Invalid Action Handling (Enum Validation)
    try {
        const res = await makeRequest('/api/controls', 'POST', { actuator_type: 'grow_lights', action: 'EXPLODE' });
        if (res.status === 400 && res.data.status === 'error') {
            console.log(`✅ [3/6 ENUM VALIDATION] Invalid action rejected with HTTP 400: "${res.data.message}"`);
            passed++;
        } else {
            console.error(`❌ [3/6 ENUM VALIDATION] Failed: Expected HTTP 400, got ${res.status}`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [3/6 ENUM VALIDATION] Error:`, e.message);
        failed++;
    }

    // Test 4: Rate Limiting Enforcement
    try {
        const promises = Array.from({ length: 25 }, () => 
            makeRequest('/api/controls', 'POST', { actuator_type: 'grow_lights', action: 'AUTO' })
        );
        const results = await Promise.all(promises);
        const blocked = results.filter(r => r.status === 429);
        if (blocked.length > 0) {
            console.log(`✅ [4/6 RATE LIMITING] Verified: ${blocked.length}/25 rapid requests blocked with HTTP 429`);
            passed++;
        } else {
            console.error(`❌ [4/6 RATE LIMITING] Failed: No 429 status returned in 25 parallel requests.`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [4/6 RATE LIMITING] Error:`, e.message);
        failed++;
    }

    // Wait 10.5 seconds for rate limit bucket to reset
    console.log('⏳ Waiting 10.5 seconds for rate limit bucket reset...');
    await new Promise(r => setTimeout(r, 10500));

    // Test 5: Role-Based Access Control (RBAC) Token Verification
    try {
        const viewerToken = generateUserToken({ user_id: 'usr_viewer', email: 'viewer@envirox.local', role: 'viewer' });
        const operatorToken = generateUserToken({ user_id: 'usr_op', email: 'op@envirox.local', role: 'operator' });

        // 5a. Unauthenticated Request -> HTTP 401
        const unauthRes = await makeRequest('/api/controls', 'POST', { actuator_type: 'grow_lights', action: 'AUTO' }, {
            'X-Enforce-Auth': 'true'
        });
        
        // 5b. Read-only viewer token -> HTTP 403
        const viewerRes = await makeRequest('/api/controls', 'POST', { actuator_type: 'grow_lights', action: 'AUTO' }, {
            'X-Enforce-Auth': 'true',
            'Authorization': `Bearer ${viewerToken}`
        });

        // 5c. Authorized operator token -> HTTP 200
        const operatorRes = await makeRequest('/api/controls', 'POST', { actuator_type: 'grow_lights', action: 'AUTO' }, {
            'X-Enforce-Auth': 'true',
            'Authorization': `Bearer ${operatorToken}`
        });

        if (unauthRes.status === 401 && viewerRes.status === 403 && (operatorRes.status === 200 || operatorRes.status === 503)) {
            console.log(`✅ [5/6 AUTHORIZATION] RBAC Verified: Unauth (401), Viewer (403), Operator (${operatorRes.status} ${operatorRes.status === 503 ? 'Node Offline Safety' : 'OK'})`);
            passed++;
        } else {
            console.error(`❌ [5/6 AUTHORIZATION] Failed: Unauth=${unauthRes.status}, Viewer=${viewerRes.status}, Operator=${operatorRes.status}`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [5/6 AUTHORIZATION] Error:`, e.message);
        failed++;
    }

    // Test 6: Security Headers (Helmet/Headers check)
    try {
        const res = await makeRequest('/api/health');
        const h = res.headers;
        const hasNosniff = h['x-content-type-options'] === 'nosniff';
        const hasFrameDeny = h['x-frame-options'] === 'DENY';
        if (hasNosniff && hasFrameDeny) {
            console.log(`✅ [6/6 SECURITY HEADERS] Verified: X-Content-Type-Options: nosniff | X-Frame-Options: DENY`);
            passed++;
        } else {
            console.error(`❌ [6/6 SECURITY HEADERS] Failed: Missing headers in response.`);
            failed++;
        }
    } catch (e) {
        console.error(`❌ [6/6 SECURITY HEADERS] Error:`, e.message);
        failed++;
    }

    console.log(`\n========================================`);
    console.log(`RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runSecurityTests();
