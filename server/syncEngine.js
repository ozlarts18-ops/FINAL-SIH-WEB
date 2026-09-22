import { query } from './db.js';
import { getCollection, checkMongoHealth } from './mongoDb.js';

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

    try {
        let whereClauses = [];
        let params = [];
        let pIndex = 1;

        for (const [key, value] of Object.entries(filters)) {
            whereClauses.push(`"${key}" = $${pIndex++}`);
            params.push(value);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const orderDir = ascending ? 'ASC' : 'DESC';
        const orderSql = sortColumn ? `ORDER BY "${sortColumn}" ${orderDir}` : '';
        const limitSql = limit ? `LIMIT ${Math.min(parseInt(limit, 10) || 50, 500)}` : '';

        const sql = `SELECT * FROM "${tableName}" ${whereSql} ${orderSql} ${limitSql}`;
        const res = await query(sql, params);

        return {
            source: 'local_postgresql',
            data: res.rows,
            count: res.rowCount,
            error: null
        };
    } catch (localErr) {
        console.warn(`[Local PG Error] Falling back to MongoDB for table '${tableName}':`, localErr.message);

        try {
            const col = await getCollection(tableName);
            const mongoFilters = { ...filters };

            const sortOption = {};
            if (sortColumn) {
                sortOption[sortColumn] = ascending ? 1 : -1;
            }

            const docs = await col
                .find(mongoFilters)
                .sort(sortOption)
                .limit(Math.min(parseInt(limit, 10) || 50, 500))
                .toArray();

            return {
                source: 'mongodb_fallback',
                data: docs || [],
                count: docs?.length || 0,
                error: null
            };
        } catch (mongoErr) {
            console.error(`[MongoDB Fallback Error] Table '${tableName}':`, mongoErr.message);
            throw new Error(`Both Local PostgreSQL and MongoDB queries failed: ${localErr.message} | ${mongoErr.message}`, { cause: mongoErr });
        }
    }
}

export async function insertAndSync(tableName, record) {
    if (!ALLOWED_TABLES.has(tableName)) {
        throw new Error(`Table ${tableName} is not permitted.`);
    }

    if (!record || typeof record !== 'object') {
        throw new Error('Invalid record payload.');
    }

    let localRecord = null;
    let pgSuccess = false;

    try {
        const keys = Object.keys(record);
        if (keys.length === 0) throw new Error('Record has no keys.');

        const columns = keys.map(k => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map(k => record[k]);

        const insertSql = `INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders}) RETURNING *`;
        const res = await query(insertSql, values);
        localRecord = res.rows[0];
        pgSuccess = true;
    } catch (pgErr) {
        console.warn(`[Local PG Insert Warning] PostgreSQL insert failed for '${tableName}':`, pgErr.message);
    }

    const payloadToSync = localRecord || record;

    syncRecordToMongo(tableName, payloadToSync).catch(err => {
        console.warn(`[Background Sync Warning] Failed to sync new record to MongoDB (${tableName}):`, err.message);
    });

    return {
        source: pgSuccess ? 'local_postgresql_inserted' : 'mongodb_fallback_inserted',
        record: payloadToSync,
        syncedToMongo: true
    };
}

export async function syncRecordToMongo(tableName, record) {
    try {
        const col = await getCollection(tableName);
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

        console.log(`🍃 [MongoDB Sync Success] Record synced to MongoDB (${tableName})`);
        return true;
    } catch (err) {
        console.warn(`🍃 [MongoDB Sync Warning] Table ${tableName}:`, err.message);
        throw err;
    }
}

export async function getSystemHealth() {
    let pgStatus = 'disconnected';
    let pgDetails = null;

    try {
        const pgRes = await query('SELECT version(), current_database(), current_user');
        pgStatus = 'connected';
        pgDetails = {
            database: pgRes.rows[0].current_database,
            user: pgRes.rows[0].current_user,
            version: pgRes.rows[0].version
        };
    } catch (err) {
        pgStatus = 'error';
        pgDetails = { error: err.message };
    }

    const mongoHealth = await checkMongoHealth();

    return {
        timestamp: new Date().toISOString(),
        primary_storage: {
            engine: 'PostgreSQL Local',
            status: pgStatus,
            details: pgDetails
        },
        secondary_storage: {
            engine: 'MongoDB',
            status: mongoHealth.status,
            database: mongoHealth.database,
            details: mongoHealth
        },
        architecture: 'Local PostgreSQL First -> MongoDB Document Sync & Fallback'
    };
}
