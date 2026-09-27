import os from 'os';
import mDNS from 'multicast-dns';

// Protect against Windows uv_interface_addresses transient errors in multicast-dns timer
const origNetworkInterfaces = os.networkInterfaces.bind(os);
let lastGoodInterfaces = {};
try {
    lastGoodInterfaces = origNetworkInterfaces();
} catch (_) {}

os.networkInterfaces = function () {
    try {
        const res = origNetworkInterfaces();
        if (res && Object.keys(res).length > 0) {
            lastGoodInterfaces = res;
        }
        return res;
    } catch (err) {
        return lastGoodInterfaces;
    }
};

let mdnsInstance = null;
let announceTimer = null;

/**
 * Dynamically resolves the primary LAN IPv4 address (e.g. Wi-Fi, Ethernet).
 * Skips internal/loopback and VirtualBox/APIPA pseudo-interfaces.
 */
export function getPrimaryLanIp() {
    const interfaces = os.networkInterfaces();
    let candidate = null;

    for (const [name, addrs] of Object.entries(interfaces)) {
        for (const addr of addrs) {
            if (addr.family === 'IPv4' && !addr.internal) {
                const ip = addr.address;
                // Exclude APIPA (169.254.x.x)
                if (ip.startsWith('169.254.')) continue;

                // Strong preference: Wi-Fi or real Ethernet interface
                if (/wi-?fi|wlan|wireless|ethernet|eth0|en0/i.test(name)) {
                    // Avoid VirtualBox default subnet if other adapter is active
                    if (!ip.startsWith('192.168.56.')) {
                        return ip;
                    }
                }

                // Fallback candidate if not VirtualBox
                if (!candidate && !ip.startsWith('192.168.56.')) {
                    candidate = ip;
                }
            }
        }
    }

    return candidate || '127.0.0.1';
}

/**
 * Starts the mDNS responder service on UDP port 5353.
 * Responds to queries for `iotrex.local` with the laptop's current LAN IP.
 */
export function startMdnsResponder(hostname = 'iotrex.local', port = 5173) {
    if (mdnsInstance) {
        return mdnsInstance;
    }

    const cleanHost = hostname.replace(/\.local$/i, '');
    const fullHost = `${cleanHost}.local`;

    try {
        const mdns = mDNS();

        const sendAnnouncement = () => {
            const currentIp = getPrimaryLanIp();
            try {
                mdns.respond({
                    answers: [
                        {
                            name: fullHost,
                            type: 'A',
                            ttl: 120,
                            data: currentIp
                        },
                        {
                            name: `_http._tcp.local`,
                            type: 'PTR',
                            ttl: 120,
                            data: `${cleanHost}._http._tcp.local`
                        },
                        {
                            name: `${cleanHost}._http._tcp.local`,
                            type: 'SRV',
                            ttl: 120,
                            data: {
                                port: port,
                                weight: 0,
                                priority: 0,
                                target: fullHost
                            }
                        }
                    ]
                });
            } catch (err) {
                // Ignore transient send errors
            }
        };

        mdns.on('query', (query) => {
            const matches = (query.questions || []).some(q => {
                const qName = (q.name || '').toLowerCase();
                const targetFull = fullHost.toLowerCase();
                const targetClean = cleanHost.toLowerCase();
                return (q.type === 'A' || q.type === 'ANY') && (qName === targetFull || qName === targetClean);
            });

            if (matches) {
                const currentIp = getPrimaryLanIp();
                console.log(`📡 [mDNS Query] '${query.questions[0]?.name}' -> responding with ${currentIp}`);
                sendAnnouncement();
            }
        });

        mdns.on('error', (err) => {
            console.warn('[mDNS Service Warning]:', err.message);
        });

        // Initial announcement
        sendAnnouncement();

        // Periodic announcement every 30 seconds so all devices keep fresh mDNS cache
        announceTimer = setInterval(sendAnnouncement, 30000);
        if (announceTimer.unref) announceTimer.unref();

        const lanIp = getPrimaryLanIp();
        console.log(`🌐 [mDNS Active] '${fullHost}' registered on LAN (Host IP: ${lanIp}, Port: ${port})`);

        mdnsInstance = mdns;
        return mdns;
    } catch (err) {
        console.warn('[mDNS Service Error]:', err.message);
        return null;
    }
}

/**
 * Resolves an mDNS hostname (e.g. iotrex.local) to an IPv4 string.
 */
export function resolveMdns(hostname = 'iotrex.local', timeoutMs = 2500) {
    return new Promise((resolve) => {
        const cleanHost = hostname.replace(/\.local$/i, '');
        const fullHost = `${cleanHost}.local`;
        const client = mDNS();
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                client.destroy();
                resolve(null);
            }
        }, timeoutMs);

        client.on('response', (response) => {
            for (const ans of (response.answers || [])) {
                if (ans.type === 'A' && ans.name.toLowerCase() === fullHost.toLowerCase() && ans.data) {
                    if (!finished) {
                        finished = true;
                        clearTimeout(timer);
                        client.destroy();
                        resolve(ans.data);
                        return;
                    }
                }
            }
        });

        client.query({
            questions: [{ name: fullHost, type: 'A' }]
        });
    });
}
