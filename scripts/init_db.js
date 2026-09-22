import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_PG_URI = process.env.PGSQL_MCP_CONNECTION_STRING || 'postgresql://postgres:ossie%40123%24@localhost:4000/IOTrex';

const pool = new pg.Pool({
    connectionString: LOCAL_PG_URI,
});

async function init() {
    console.log('🚀 Starting Database Initialization for Local PostgreSQL (IOTrex)...');
    const client = await pool.connect();

    try {
        const schemaPath = path.resolve(__dirname, '../schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        console.log('📄 Executing schema.sql on Local PostgreSQL...');
        await client.query(schemaSql);
        console.log('✅ Tables, foreign keys, and indexes created successfully in Local PostgreSQL!');

        const devCheck = await client.query('SELECT * FROM devices WHERE device_uid = $1', ['ESP32-IOTREX-01']);
        let deviceId;

        if (devCheck.rows.length === 0) {
            console.log('🌱 Seeding default Master Device & Sensors...');
            const devRes = await client.query(`
                INSERT INTO devices (device_name, device_uid, device_type, location, esp32_cam_stream_url, status)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING device_id
            `, [
                'IOTrex Master Station #1',
                'ESP32-IOTREX-01',
                'ESP32 & Raspberry Pi 4',
                'Greenhouse Zone Alpha',
                'http://192.168.1.120:81/stream',
                'active'
            ]);
            deviceId = devRes.rows[0].device_id;

            await client.query(`
                INSERT INTO sensors (device_id, sensor_name, sensor_model, sensor_type, unit_of_measurement, is_active)
                VALUES 
                ($1, 'MQ-135 Gas & Air Sensor', 'MQ-135', 'air_quality', 'AQI / PPM', true),
                ($1, 'DHT22 Temperature & Humidity', 'DHT22', 'dht22', '°C / %', true),
                ($1, 'Analog Soil Moisture Sensor v1.2', 'Capacitive v1.2', 'soil_moisture', '%', true),
                ($1, 'DS18B20 Waterproof Soil Temp', 'DS18B20', 'soil_temp', '°C', true),
                ($1, 'Analog pH Sensor Kit', 'SEN0161', 'water_quality', 'pH', true),
                ($1, 'TDS Water Quality Meter', 'DFRobot Gravity TDS', 'water_quality', 'ppm', true),
                ($1, 'BH1750 Ambient Light Sensor', 'BH1750', 'light', 'Lux', true),
                ($1, 'ESP32-CAM AI Vision Module', 'OV2640', 'camera', 'Image stream', true)
            `, [deviceId]);

            await client.query(`
                INSERT INTO device_controls (device_id, actuator_type, current_state, control_mode, threshold_config)
                VALUES
                ($1, 'exhaust_fan', 'ON', 'AUTOMATIC', '{"temp_max": 30.0, "co2_max": 450}'),
                ($1, 'water_pump', 'OFF', 'AUTOMATIC', '{"moisture_min": 40.0}'),
                ($1, 'grow_lights', 'ON', 'AUTOMATIC', '{"lux_min": 500}'),
                ($1, 'spray_valve', 'OFF', 'AUTOMATIC', '{"pest_threshold": 10}')
            `, [deviceId]);
        } else {
            deviceId = devCheck.rows[0].device_id;
        }

        const airCount = await client.query('SELECT count(*) FROM air_quality_logs');
        if (parseInt(airCount.rows[0].count, 10) === 0) {
            console.log('📊 Seeding Air Quality Logs...');
            const now = Date.now();
            const airEntries = [
                { timeOffset: 6 * 3600 * 1000, aqs: 88, aqi: 65, co2: 410, pm25: 15, pm10: 42, smoke: 'NORMAL', temp: 24, avgTemp: 25, minTemp: 22, maxTemp: 28, hum: 60, avgHum: 58, minHum: 50, maxHum: 65, status: 'Good' },
                { timeOffset: 5 * 3600 * 1000, aqs: 85, aqi: 59, co2: 415, pm25: 12, pm10: 38, smoke: 'NORMAL', temp: 26, avgTemp: 25.5, minTemp: 22, maxTemp: 28, hum: 55, avgHum: 57, minHum: 50, maxHum: 65, status: 'Good' },
                { timeOffset: 4 * 3600 * 1000, aqs: 79, aqi: 80, co2: 425, pm25: 22, pm10: 55, smoke: 'NORMAL', temp: 29, avgTemp: 26, minTemp: 22, maxTemp: 30, hum: 48, avgHum: 55, minHum: 48, maxHum: 65, status: 'Moderate' },
                { timeOffset: 3 * 3600 * 1000, aqs: 74, aqi: 81, co2: 430, pm25: 28, pm10: 60, smoke: 'NORMAL', temp: 31, avgTemp: 27, minTemp: 22, maxTemp: 32, hum: 42, avgHum: 53, minHum: 42, maxHum: 65, status: 'Moderate' },
                { timeOffset: 2 * 3600 * 1000, aqs: 81, aqi: 56, co2: 420, pm25: 20, pm10: 48, smoke: 'NORMAL', temp: 30, avgTemp: 27.2, minTemp: 22, maxTemp: 32, hum: 50, avgHum: 52, minHum: 42, maxHum: 65, status: 'Good' },
                { timeOffset: 1 * 3600 * 1000, aqs: 86, aqi: 55, co2: 412, pm25: 17, pm10: 44, smoke: 'NORMAL', temp: 27, avgTemp: 27, minTemp: 22, maxTemp: 32, hum: 58, avgHum: 53, minHum: 42, maxHum: 65, status: 'Good' },
                { timeOffset: 0, aqs: 90, aqi: 40, co2: 408, pm25: 10, pm10: 30, smoke: 'NORMAL', temp: 25, avgTemp: 26.8, minTemp: 22, maxTemp: 32, hum: 63, avgHum: 54, minHum: 42, maxHum: 65, status: 'Good' }
            ];

            for (const item of airEntries) {
                const recordedAt = new Date(now - item.timeOffset).toISOString();
                await client.query(`
                    INSERT INTO air_quality_logs (
                        device_id, air_status, air_quality_score, aqi_index, co2_ppm, pm2_5, pm10,
                        smoke_gas_status, current_temperature, avg_temperature, min_temperature, max_temperature,
                        current_humidity, avg_humidity, min_humidity, max_humidity, recorded_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                `, [
                    deviceId, item.status, item.aqs, item.aqi, item.co2, item.pm25, item.pm10,
                    item.smoke, item.temp, item.avgTemp, item.minTemp, item.maxTemp,
                    item.hum, item.avgHum, item.minHum, item.maxHum, recordedAt
                ]);
            }
        }

        const waterCount = await client.query('SELECT count(*) FROM water_quality_logs');
        if (parseInt(waterCount.rows[0].count, 10) === 0) {
            console.log('💧 Seeding Water Quality Logs...');
            const now = Date.now();
            const waterEntries = [
                { timeOffset: 6 * 3600 * 1000, ph: 6.8, tds: 420, temp: 22.5, tank: 85, pump: 'OFF', status: 'Optimal' },
                { timeOffset: 4 * 3600 * 1000, ph: 6.9, tds: 435, temp: 23.0, tank: 82, pump: 'OFF', status: 'Optimal' },
                { timeOffset: 2 * 3600 * 1000, ph: 7.1, tds: 450, temp: 24.2, tank: 79, pump: 'ON', status: 'Optimal' },
                { timeOffset: 0, ph: 6.7, tds: 410, temp: 22.8, tank: 78, pump: 'OFF', status: 'Optimal' }
            ];

            for (const item of waterEntries) {
                const recordedAt = new Date(now - item.timeOffset).toISOString();
                await client.query(`
                    INSERT INTO water_quality_logs (
                        device_id, water_status, current_ph, avg_ph, min_ph, max_ph, tds_ppm, turbidity_ntu,
                        dissolved_oxygen_mg_l, conductivity_us_cm, current_water_temp, avg_water_temp,
                        min_water_temp, max_water_temp, water_tank_level_percent, pump_status, recorded_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                `, [
                    deviceId, item.status, item.ph, 6.9, 6.5, 7.3, item.tds, 1.8,
                    7.5, 820, item.temp, 23.1, 21.5, 25.0, item.tank, item.pump, recordedAt
                ]);
            }
        }

        const soilCount = await client.query('SELECT count(*) FROM soil_moisture_logs');
        if (parseInt(soilCount.rows[0].count, 10) === 0) {
            console.log('🌾 Seeding Soil Moisture & Light Logs...');
            const now = Date.now();
            const soilData = [
                { offset: 6 * 3600 * 1000, moisture: 65, temp: 22.5, category: 'Moderate (40-70%)', lux: 420 },
                { offset: 5 * 3600 * 1000, moisture: 62, temp: 24.0, category: 'Moderate (40-70%)', lux: 650 },
                { offset: 4 * 3600 * 1000, moisture: 58, temp: 27.5, category: 'Moderate (40-70%)', lux: 900 },
                { offset: 3 * 3600 * 1000, moisture: 54, temp: 29.2, category: 'Moderate (40-70%)', lux: 1050 },
                { offset: 2 * 3600 * 1000, moisture: 50, temp: 28.0, category: 'Moderate (40-70%)', lux: 880 },
                { offset: 1 * 3600 * 1000, moisture: 48, temp: 25.5, category: 'Moderate (40-70%)', lux: 500 },
                { offset: 0, moisture: 46, temp: 23.0, category: 'Moderate (40-70%)', lux: 150 }
            ];

            for (const s of soilData) {
                const recordedAt = new Date(now - s.offset).toISOString();
                await client.query(`
                    INSERT INTO soil_moisture_logs (device_id, moisture_percentage, moisture_category, soil_temperature_celsius, relay_pump_active, recorded_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [deviceId, s.moisture, s.category, s.temp, s.moisture < 45, recordedAt]);

                await client.query(`
                    INSERT INTO light_intensity_logs (device_id, lux_value, grow_lights_active, recorded_at)
                    VALUES ($1, $2, $3, $4)
                `, [deviceId, s.lux, s.lux < 300, recordedAt]);
            }
        }

        const plantCount = await client.query('SELECT count(*) FROM plant_growth_logs');
        if (parseInt(plantCount.rows[0].count, 10) === 0) {
            console.log('🌿 Seeding Plant Growth & Health Logs...');
            const now = Date.now();
            await client.query(`
                INSERT INTO plant_growth_logs (
                    device_id, crop_name, batch_identifier, plant_height_cm, leaf_count,
                    growth_stage, health_index, crop_health_status, disease_risk, nitrogen_level,
                    phosphorus_level, potassium_level, recorded_at
                ) VALUES 
                ($1, 'Roma Tomato', 'BATCH-2026-A', 28.5, 16, 'vegetative', 88.0, 'Healthy', 'LOW', 45.2, 32.1, 55.4, $2),
                ($1, 'Roma Tomato', 'BATCH-2026-A', 31.0, 18, 'vegetative', 91.0, 'Healthy', 'LOW', 48.0, 34.0, 58.0, $3),
                ($1, 'Roma Tomato', 'BATCH-2026-A', 34.2, 22, 'flowering', 94.0, 'Healthy', 'LOW', 50.1, 35.8, 60.2, $4)
            `, [
                deviceId,
                new Date(now - 14 * 86400 * 1000).toISOString(),
                new Date(now - 7 * 86400 * 1000).toISOString(),
                new Date(now).toISOString()
            ]);

            await client.query(`
                INSERT INTO disease_detection_logs (
                    device_id, crop_name, disease_name, confidence_score, severity_level, detection_source, treatment_advice, detected_at
                ) VALUES 
                ($1, 'Roma Tomato', 'Early Blight (Alternaria solani)', 94.5, 'low', 'live_camera', 'Apply copper-based fungicide spray and prune affected lower foliage.', $2),
                ($1, 'Roma Tomato', 'Leaf Mold', 96.2, 'moderate', 'live_camera', 'Increase exhaust ventilation to lower canopy humidity below 70%.', $3)
            `, [
                deviceId,
                new Date(now - 86400 * 1000).toISOString(),
                new Date(now).toISOString()
            ]);
        }

        const pestCount = await client.query('SELECT count(*) FROM pest_detection_logs');
        if (parseInt(pestCount.rows[0].count, 10) === 0) {
            console.log('🐛 Seeding Pest Detection Logs...');
            const now = Date.now();
            const pestList = [
                { timeOffset: 6 * 3600 * 1000, pest: 'Aphids', count: 3, severity: 'LOW', conf: 94.0 },
                { timeOffset: 4 * 3600 * 1000, pest: 'Aphids', count: 8, severity: 'MEDIUM', conf: 96.5 },
                { timeOffset: 2 * 3600 * 1000, pest: 'Silverleaf Whitefly', count: 12, severity: 'MEDIUM', conf: 98.0 },
                { timeOffset: 0, pest: 'Aphids', count: 4, severity: 'LOW', conf: 97.2 }
            ];

            for (const p of pestList) {
                const detectedAt = new Date(now - p.timeOffset).toISOString();
                await client.query(`
                    INSERT INTO pest_detection_logs (
                        device_id, target_crop, pest_detected, pest_count, severity_level,
                        ai_confidence, sector_zone, detection_source, recommended_action, treatment_applied, detected_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                `, [
                    deviceId, 'Roma Tomato', p.pest, p.count, p.severity,
                    p.conf, 'Sector B', 'live_camera', 'Apply organic neem oil spray during early evening.',
                    'Targeted neem extract mist applied', detectedAt
                ]);
            }
        }

        const eventCount = await client.query('SELECT count(*) FROM system_events');
        if (parseInt(eventCount.rows[0].count, 10) === 0) {
            console.log('📢 Seeding System Events & Recommendations...');
            await client.query(`
                INSERT INTO system_events (device_id, module_name, icon, title, event_level, details, event_time)
                VALUES
                ($1, 'plant_health', '💧', 'SOIL MOISTURE DROPPED', 'medium', '["Moisture: 42%", "Threshold: 50%", "Irrigation: Triggered"]'::jsonb, NOW() - INTERVAL '4 hour'),
                ($1, 'plant_health', '🌱', 'GROWTH STAGE ADVANCED', 'positive', '["Stage: Seedling → Vegetative", "Leaf count: +4"]'::jsonb, NOW() - INTERVAL '3 hour'),
                ($1, 'pest_detection', '🐛', 'APHIDS DETECTED', 'medium', '["Pest: Aphids (Cluster)", "Location: Sector B", "Count: 12"]'::jsonb, NOW() - INTERVAL '2 hour'),
                ($1, 'pest_detection', '✅', 'TARGETED SPRAY CONCLUDED', 'positive', '["Organic neem spray applied", "Sector: B & C", "Status: Stabilized"]'::jsonb, NOW() - INTERVAL '30 minute')
            `, [deviceId]);

            await client.query(`
                INSERT INTO recommendations_intelligence (device_id, module_name, recommendation_text, is_active)
                VALUES
                ($1, 'air_pollution', 'Air quality is within optimal parameters. Maintain standard fan circulation schedule.', true),
                ($1, 'water_quality', 'pH stability is optimal (6.8). TDS within nutrient threshold for current vegetative stage.', true),
                ($1, 'plant_health', 'Soil moisture is trending downward — consider increasing irrigation frequency by 10%.', true),
                ($1, 'plant_health', 'Plant health score is stable and improving over the monitoring period.', true),
                ($1, 'pest_detection', 'Aphid clusters detected on lower leaf canopies in Sector B — recommend localized neem oil spray.', true),
                ($1, 'pest_detection', 'AI confidence score is 97% across visual insect recognition models.', true)
            `, [deviceId]);
        }

        const alertCount = await client.query('SELECT count(*) FROM alerts');
        if (parseInt(alertCount.rows[0].count, 10) === 0) {
            console.log('🔔 Seeding Alerts...');
            await client.query(`
                INSERT INTO alerts (device_id, module_name, alert_level, title, message, is_resolved)
                VALUES
                ($1, 'soil_moisture', 'warning', 'Low Soil Moisture in Sector B', 'Moisture level dropped to 42%. Scheduled irrigation triggered.', true),
                ($1, 'pest_detection', 'warning', 'Aphid Cluster Detected', '12 aphids identified in Sector B tomato row #3.', false),
                ($1, 'air_quality', 'info', 'Ventilation Fan Activated', 'Exhaust fan started automatically due to temperature exceeding 29°C.', true)
            `, [deviceId]);
        }

        console.log('\n🎉 ALL TABLES & DATASETS SUCCESSFULLY INITIALIZED IN LOCAL POSTGRESQL (IOTrex)!');

        const tables = [
            'devices', 'sensors', 'device_controls', 'air_quality_logs',
            'water_quality_logs', 'soil_moisture_logs', 'light_intensity_logs',
            'plant_growth_logs', 'disease_detection_logs', 'pest_detection_logs',
            'system_events', 'recommendations_intelligence', 'alerts'
        ];

        console.log('\n📋 Row counts in Local PostgreSQL:');
        for (const t of tables) {
            const countRes = await client.query(`SELECT count(*) FROM ${t}`);
            console.log(` - ${t.padEnd(30)}: ${countRes.rows[0].count} rows`);
        }

        console.log('\n🍃 Initializing MongoDB collections and synchronizing baseline records...');
        const mongoInitPath = path.resolve(__dirname, './init_mongodb.js');
        const { fork } = await import('child_process');
        await new Promise((resolve) => {
            const child = fork(mongoInitPath);
            child.on('exit', () => resolve());
            child.on('error', () => resolve());
        });

    } catch (err) {
        console.error('❌ Error initializing database:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

init();
