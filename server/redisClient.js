import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient = null;
let isConnected = false;
let connectionAttempted = false;

// Fallback in-memory cache store if Redis service is unreachable
const memoryCacheStore = new Map();
const memoryExpiryStore = new Map();

function getRedisConfig() {
    const uri = process.env.REDIS_URI || process.env.REDIS_URL;
    if (uri) return uri;

    return {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy(times) {
            if (times > 3) {
                return null; // Stop reconnecting after 3 attempts, switch to fast memory fallback
            }
            return Math.min(times * 200, 1000);
        },
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false
    };
}

export function getRedisClient() {
    if (!redisClient && !connectionAttempted) {
        connectionAttempted = true;
        try {
            const config = getRedisConfig();
            redisClient = typeof config === 'string' ? new Redis(config) : new Redis(config);

            redisClient.on('connect', () => {
                isConnected = true;
                console.log('🔴 Connected to Redis Fast Cache Engine');
            });

            redisClient.on('error', (err) => {
                isConnected = false;
                if (connectionAttempted) {
                    connectionAttempted = false;
                    console.warn('[Redis Notice] Redis server offline or unreachable. Operating in High-Speed Memory Cache mode:', err.message);
                }
            });
        } catch (err) {
            isConnected = false;
            redisClient = null;
        }
    }
    return redisClient;
}

export async function setCache(key, value, ttlSeconds = 300) {
    const stringVal = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // Primary: Redis Cache
    const client = getRedisClient();
    if (client && isConnected) {
        try {
            if (ttlSeconds > 0) {
                await client.setex(key, ttlSeconds, stringVal);
            } else {
                await client.set(key, stringVal);
            }
        } catch (_err) {
            isConnected = false;
        }
    }

    // High-Availability Fallback Cache
    memoryCacheStore.set(key, stringVal);
    if (ttlSeconds > 0) {
        memoryExpiryStore.set(key, Date.now() + ttlSeconds * 1000);
    } else {
        memoryExpiryStore.delete(key);
    }
}

export async function getCache(key) {
    // Primary: Redis Cache
    const client = getRedisClient();
    if (client && isConnected) {
        try {
            const val = await client.get(key);
            if (val !== null) {
                try {
                    return JSON.parse(val);
                } catch (_e) {
                    return val;
                }
            }
        } catch (_err) {
            isConnected = false;
        }
    }

    // High-Availability Fallback Cache
    if (memoryExpiryStore.has(key)) {
        if (Date.now() > memoryExpiryStore.get(key)) {
            memoryCacheStore.delete(key);
            memoryExpiryStore.delete(key);
            return null;
        }
    }

    const memVal = memoryCacheStore.get(key);
    if (memVal !== undefined && memVal !== null) {
        try {
            return JSON.parse(memVal);
        } catch (_e) {
            return memVal;
        }
    }

    return null;
}

export async function delCache(key) {
    const client = getRedisClient();
    if (client && isConnected) {
        try {
            await client.del(key);
        } catch (_err) {
            isConnected = false;
        }
    }
    memoryCacheStore.delete(key);
    memoryExpiryStore.delete(key);
}

export async function invalidateCachePattern(patternPrefix) {
    const client = getRedisClient();
    if (client && isConnected) {
        try {
            const keys = await client.keys(`${patternPrefix}*`);
            if (keys && keys.length > 0) {
                await client.del(...keys);
            }
        } catch (_err) {
            isConnected = false;
        }
    }

    for (const k of memoryCacheStore.keys()) {
        if (k.startsWith(patternPrefix)) {
            memoryCacheStore.delete(k);
            memoryExpiryStore.delete(k);
        }
    }
}

export async function checkRedisHealth() {
    const client = getRedisClient();
    if (client && isConnected) {
        try {
            const ping = await client.ping();
            return {
                status: 'connected',
                engine: 'Redis Fast Cache',
                ping: ping === 'PONG' ? 'ok' : ping
            };
        } catch (err) {
            return {
                status: 'memory_fallback',
                engine: 'In-Memory High Speed Cache',
                error: err.message
            };
        }
    }
    return {
        status: 'memory_fallback',
        engine: 'In-Memory High Speed Cache',
        message: 'Redis server offline. Active memory cache running.'
    };
}
