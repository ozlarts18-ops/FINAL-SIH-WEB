import { getCollection, checkMongoHealth } from './mongoDb.js';
import { setCache, getCache, invalidateCachePattern, checkRedisHealth } from './redisClient.js';

export const ALLOWED_TABLES = new Set([
    'users',
    'devices',
    'sensors',
    'device_controls',
    'air_quality_logs',
    'water_quality_logs',
    'soil_moisture_logs',
    'irrigation_events',
    'light_intensity_logs',
    'growth_observations',
    'plant_growth_logs',
    'disease_detection_logs',
    'pest_detection_logs',
    'system_events',
    'recommendations_intelligence',
    'alerts',
    'report_exports'
]);

export function getDefaultSortColumn(tableName) {
    if ([
        'air_quality_logs',
        'water_quality_logs',
        'soil_moisture_logs',
        'light_intensity_logs',
        'plant_growth_logs',
        'growth_observations'
    ].includes(tableName)) {
        return 'recorded_at';
    }
    if (['disease_detection_logs', 'pest_detection_logs'].includes(tableName)) {
        return 'detected_at';
    }
    if (['system_events'].includes(tableName)) {
        return 'event_time';
    }
    if (['device_controls'].includes(tableName)) {
        return 'updated_at';
    }
    return 'created_at';
}

export async function queryTable(tableName, { limit = 50, orderBy, ascending = true, filters = {} } = {}) {
    if (!ALLOWED_TABLES.has(tableName)) {
        throw new Error(`Table ${tableName} is not permitted.`);
    }

    const sortColumn = orderBy || getDefaultSortColumn(tableName);
    const filterKey = JSON.stringify(filters);
    const cacheKey = `cache:table:${tableName}:${limit}:${sortColumn}:${ascending}:${filterKey}`;

    // 1. Try Redis Fast Cache first
    try {
        const cached = await getCache(cacheKey);
        if (cached && Array.isArray(cached.data)) {
            return {
                source: 'redis_cache',
                data: cached.data,
                count: cached.data.length,
                error: null
            };
        }
    } catch (_cacheErr) { }

    // 2. Query Primary Database (MongoDB)
    try {
        const col = await getCollection(tableName);
        if (!col) {
            return {
                source: 'empty_fallback',
                data: [],
                count: 0,
                error: null
            };
        }
        const mongoFilters = { ...filters };

        const sortOption = {};
        if (sortColumn) {
            sortOption[sortColumn] = ascending ? 1 : -1;
        }

        const maxLimit = Math.min(parseInt(limit, 10) || 50, 500);
        const docs = await col
            .find(mongoFilters)
            .sort(sortOption)
            .limit(maxLimit)
            .toArray();

        const resultData = docs || [];

        // 3. Cache result in Redis for 5 seconds
        setCache(cacheKey, { data: resultData }, 5).catch(() => {});

        return {
            source: 'mongodb_primary',
            data: resultData,
            count: resultData.length,
            error: null
        };
    } catch (mongoErr) {
        console.error(`[MongoDB Query Error] Table '${tableName}':`, mongoErr.message);
        throw new Error(`MongoDB query failed: ${mongoErr.message}`, { cause: mongoErr });
    }
}

export async function insertAndSync(tableName, record) {
    if (!ALLOWED_TABLES.has(tableName)) {
        throw new Error(`Table ${tableName} is not permitted.`);
    }

    if (!record || typeof record !== 'object') {
        throw new Error('Invalid record payload.');
    }

    const savedRecord = await syncRecordToMongo(tableName, record);

    // Invalidate Redis cache for this table
    invalidateCachePattern(`cache:table:${tableName}`).catch(() => {});

    return {
        source: 'mongodb_primary_inserted',
        record: savedRecord,
        syncedToMongo: true
    };
}

export async function syncRecordToMongo(tableName, record) {
    try {
        const col = await getCollection(tableName);
        if (!col) return record;
        const recordCopy = { ...record };

        if (recordCopy.recorded_at && typeof recordCopy.recorded_at === 'string') {
            recordCopy.recorded_at = new Date(recordCopy.recorded_at);
        }
        if (recordCopy.detected_at && typeof recordCopy.detected_at === 'string') {
            recordCopy.detected_at = new Date(recordCopy.detected_at);
        }
        if (recordCopy.event_time && typeof recordCopy.event_time === 'string') {
            recordCopy.event_time = new Date(recordCopy.event_time);
        }
        if (recordCopy.created_at && typeof recordCopy.created_at === 'string') {
            recordCopy.created_at = new Date(recordCopy.created_at);
        }
        if (recordCopy.updated_at && typeof recordCopy.updated_at === 'string') {
            recordCopy.updated_at = new Date(recordCopy.updated_at);
        }

        recordCopy.last_synced_at = new Date();

        if (tableName === 'devices' && recordCopy.device_uid) {
            await col.updateOne(
                { device_uid: recordCopy.device_uid },
                { $set: recordCopy },
                { upsert: true }
            );
        } else if (tableName === 'users' && recordCopy.email) {
            await col.updateOne(
                { email: recordCopy.email },
                { $set: recordCopy },
                { upsert: true }
            );
        } else if (tableName === 'sensors' && recordCopy.device_id && recordCopy.sensor_name) {
            await col.updateOne(
                { device_id: recordCopy.device_id, sensor_name: recordCopy.sensor_name },
                { $set: recordCopy },
                { upsert: true }
            );
        } else if (tableName === 'device_controls' && recordCopy.device_id && recordCopy.actuator_type) {
            await col.updateOne(
                { device_id: recordCopy.device_id, actuator_type: recordCopy.actuator_type },
                { $set: recordCopy },
                { upsert: true }
            );
        } else {
            if (recordCopy.log_id) {
                await col.updateOne(
                    { log_id: recordCopy.log_id },
                    { $set: recordCopy },
                    { upsert: true }
                );
            } else if (recordCopy.detection_id) {
                await col.updateOne(
                    { detection_id: recordCopy.detection_id },
                    { $set: recordCopy },
                    { upsert: true }
                );
            } else if (recordCopy.pest_log_id) {
                await col.updateOne(
                    { pest_log_id: recordCopy.pest_log_id },
                    { $set: recordCopy },
                    { upsert: true }
                );
            } else if (recordCopy.event_id) {
                await col.updateOne(
                    { event_id: recordCopy.event_id },
                    { $set: recordCopy },
                    { upsert: true }
                );
            } else if (recordCopy.alert_id) {
                await col.updateOne(
                    { alert_id: recordCopy.alert_id },
                    { $set: recordCopy },
                    { upsert: true }
                );
            } else if (recordCopy.recommendation_id) {
                await col.updateOne(
                    { recommendation_id: recordCopy.recommendation_id },
                    { $set: recordCopy },
                    { upsert: true }
                );
            } else {
                await col.insertOne(recordCopy);
            }
        }

        console.log(`🍃 [MongoDB Primary Insert] Record saved to MongoDB (${tableName})`);
        return recordCopy;
    } catch (err) {
        console.warn(`🍃 [MongoDB Insert Warning] Table ${tableName}:`, err.message);
        throw err;
    }
}

export async function getSystemHealth() {
    const mongoHealth = await checkMongoHealth();
    const redisHealth = await checkRedisHealth();

    return {
        timestamp: new Date().toISOString(),
        primary_storage: {
            engine: 'MongoDB Database',
            status: mongoHealth.status,
            database: mongoHealth.database,
            details: mongoHealth
        },
        fast_cache: {
            engine: redisHealth.engine || 'Redis Fast Cache',
            status: redisHealth.status,
            ping: redisHealth.ping || redisHealth.message || 'ok'
        },
        architecture: 'MongoDB Primary Document Database -> Redis Fast Caching Layer'
    };
}
