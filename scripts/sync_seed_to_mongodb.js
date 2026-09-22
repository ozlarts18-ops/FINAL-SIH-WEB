import pg from 'pg';
import { getMongoDb, closeMongo } from '../server/mongoDb.js';

const LOCAL_PG_URI = process.env.PGSQL_MCP_CONNECTION_STRING || 'postgresql://postgres:ossie%40123%24@localhost:4000/IOTrex';
const pool = new pg.Pool({ connectionString: LOCAL_PG_URI });

async function syncSeedToMongoDB() {
    console.log('🔄 ========================================================');
    console.log('🔄 Checking PostgreSQL -> MongoDB Mirror Parity & Syncing...');
    console.log('🔄 ========================================================');

    let client = null;
    try {
        client = await pool.connect();
        console.log('🐘 Connected to Local PostgreSQL');
    } catch (pgErr) {
        console.warn('⚠️ Could not connect to PostgreSQL:', pgErr.message);
        console.log('ℹ️ Skipping PG -> Mongo sync (MongoDB operates stand-alone or is already seeded).');
        await pool.end();
        return;
    }

    try {
        const db = await getMongoDb();
        console.log(`🍃 Connected to MongoDB: "${db.databaseName}"`);

        const syncTable = async (tableName, idField = 'log_id', uniqueKey = null) => {
            const localRes = await client.query(`SELECT * FROM "${tableName}"`);
            const col = db.collection(tableName);

            if (uniqueKey) {
                for (const row of localRes.rows) {
                    await col.updateOne(
                        { [uniqueKey]: row[uniqueKey] },
                        { $set: { ...row, last_synced_at: new Date() } },
                        { upsert: true }
                    );
                }
                console.log(` synced ${localRes.rows.length} records in "${tableName}" (upsert by ${uniqueKey})`);
            } else {
                for (const row of localRes.rows) {
                    const queryFilter = row[idField] ? { [idField]: row[idField] } : row;
                    await col.updateOne(
                        queryFilter,
                        { $set: { ...row, last_synced_at: new Date() } },
                        { upsert: true }
                    );
                }
                console.log(` synced ${localRes.rows.length} records in "${tableName}"`);
            }
        };

        await syncTable('devices', 'device_id', 'device_uid');

        await syncTable('sensors', 'sensor_id');

        await syncTable('device_controls', 'control_id');

        await syncTable('air_quality_logs', 'log_id');
        await syncTable('water_quality_logs', 'log_id');
        await syncTable('soil_moisture_logs', 'log_id');
        await syncTable('light_intensity_logs', 'log_id');
        await syncTable('plant_growth_logs', 'log_id');
        await syncTable('pest_detection_logs', 'pest_log_id');
        await syncTable('disease_detection_logs', 'detection_id');

        await syncTable('system_events', 'event_id');
        await syncTable('recommendations_intelligence', 'recommendation_id');
        await syncTable('alerts', 'alert_id');

        await syncTable('users', 'user_id', 'email');

        console.log('\n✅ PostgreSQL -> MongoDB baseline sync completed successfully!');
    } catch (err) {
        console.error('❌ Sync parity error:', err.message);
    } finally {
        if (client) client.release();
        await pool.end();
        await closeMongo();
    }
}

syncSeedToMongoDB();
