import http from 'http';

const rpiPayload = {
    "device_id": "IOTREX-RPI-01",
    "timestamp": "2026-09-26T04:30:00.604349+05:30",
    "temperature": 27.5,
    "humidity": 61.9,
    "lux": 1.7,
    "mq2": {
        "raw": 6995,
        "voltage": 0.857
    },
    "rain": {
        "raw": 23438,
        "voltage": 2.929,
        "status": "DRY"
    },
    "soil": {
        "raw": 18653,
        "voltage": 2.315,
        "calibration_status": "PENDING"
    },
    "ph": {
        "raw": 13171,
        "voltage": 1.641,
        "calibration_status": "PENDING"
    }
};

function makeRequest(url, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                let parsedBody = body;
                try {
                    parsedBody = JSON.parse(body);
                } catch (e) {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsedBody });
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(typeof data === 'string' ? data : JSON.stringify(data));
        }
        req.end();
    });
}

async function testEndpoint() {
    const baseUrl = 'http://localhost:5173/api/sensor/data';
    console.log(`\n--- TEST 1: GET ${baseUrl} before posting data ---`);
    try {
        const get1 = await makeRequest(baseUrl, 'GET');
        console.log(`Status: ${get1.status}`);
        console.log('Response:', get1.body);
    } catch (e) {
        console.log('GET failed (is server running?):', e.message);
    }

    console.log(`\n--- TEST 2: POST RPi payload to ${baseUrl} ---`);
    try {
        const postRes = await makeRequest(baseUrl, 'POST', rpiPayload);
        console.log(`Status: ${postRes.status}`);
        console.log('Response:', postRes.body);
    } catch (e) {
        console.log('POST failed:', e.message);
    }

    console.log(`\n--- TEST 3: GET ${baseUrl} after posting data ---`);
    try {
        const get2 = await makeRequest(baseUrl, 'GET');
        console.log(`Status: ${get2.status}`);
        console.log('Response:', get2.body);
    } catch (e) {
        console.log('GET failed:', e.message);
    }

    console.log(`\n--- TEST 4: POST malformed payload to ${baseUrl} ---`);
    try {
        const badPost = await makeRequest(baseUrl, 'POST', '{ malformed json');
        console.log(`Status: ${badPost.status}`);
        console.log('Response:', badPost.body);
    } catch (e) {
        console.log('Bad POST failed:', e.message);
    }
}

testEndpoint();
