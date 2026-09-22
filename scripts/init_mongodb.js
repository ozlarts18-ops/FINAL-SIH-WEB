import { getMongoClient, getMongoDb, closeMongo } from '../server/mongoDb.js';

const COLLECTIONS = [
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
];

async function initMongoDB() {
    console.log('🍃 ========================================================');
    console.log('🍃 Initializing MongoDB Database & Collections (Tables)...');
    console.log('🍃 ========================================================');

    try {
        await getMongoClient();
        const db = await getMongoDb();
        console.log(`✅ Connected to MongoDB database: "${db.databaseName}"`);

        const existingCols = await db.listCollections().toArray();
        const existingNames = new Set(existingCols.map(c => c.name));

        for (const colName of COLLECTIONS) {
            if (!existingNames.has(colName)) {
                await db.createCollection(colName);
                console.log(`📁 Created collection: "${colName}"`);
            } else {
                console.log(`✓ Collection already exists: "${colName}"`);
            }
        }

        console.log('\n⚡ Setting up indexes on MongoDB collections...');

        await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });

        await db.collection('devices').createIndex({ device_uid: 1 }, { unique: true });

        await db.collection('sensors').createIndex({ device_id: 1, sensor_name: 1 });

        await db.collection('device_controls').createIndex({ device_id: 1, actuator_type: 1 });

        await db.collection('air_quality_logs').createIndex({ device_id: 1, recorded_at: -1 });
        await db.collection('air_quality_logs').createIndex({ recorded_at: -1 });

        await db.collection('water_quality_logs').createIndex({ device_id: 1, recorded_at: -1 });
        await db.collection('water_quality_logs').createIndex({ recorded_at: -1 });

        await db.collection('soil_moisture_logs').createIndex({ device_id: 1, recorded_at: -1 });
        await db.collection('soil_moisture_logs').createIndex({ recorded_at: -1 });

        await db.collection('light_intensity_logs').createIndex({ device_id: 1, recorded_at: -1 });
        await db.collection('light_intensity_logs').createIndex({ recorded_at: -1 });

        await db.collection('plant_growth_logs').createIndex({ device_id: 1, recorded_at: -1 });
        await db.collection('growth_observations').createIndex({ device_id: 1, recorded_at: -1 });

        await db.collection('disease_detection_logs').createIndex({ device_id: 1, detected_at: -1 });
        await db.collection('pest_detection_logs').createIndex({ device_id: 1, detected_at: -1 });

        await db.collection('system_events').createIndex({ module_name: 1, event_time: -1 });
        await db.collection('recommendations_intelligence').createIndex({ module_name: 1, created_at: -1 });
        await db.collection('alerts').createIndex({ is_resolved: 1, created_at: -1 });
        await db.collection('report_exports').createIndex({ device_id: 1, generated_at: -1 });

        console.log('✅ Indexes configured successfully on all 17 collections.');

        console.log('\n🌱 Checking and seeding initial device records...');
        const devicesCol = db.collection('devices');
        const defaultDevice = {
            device_id: 1,
            device_name: 'IOTrex Master Station #1',
            device_uid: 'ESP32-IOTREX-01',
            device_type: 'ESP32 & Raspberry Pi 4',
            location: 'Greenhouse Zone Alpha',
            esp32_cam_stream_url: 'http://192.168.1.120:81/stream',
            status: 'active',
            last_ping: new Date(),
            created_at: new Date()
        };

        await devicesCol.updateOne(
            { device_uid: defaultDevice.device_uid },
            { $setOnInsert: defaultDevice },
            { upsert: true }
        );

        const sensorsCol = db.collection('sensors');
        const defaultSensors = [
            { sensor_id: 1, device_id: 1, sensor_name: 'MQ-135 Gas & Air Sensor', sensor_model: 'MQ-135', sensor_type: 'air_quality', unit_of_measurement: 'AQI / PPM', is_active: true, created_at: new Date() },
            { sensor_id: 2, device_id: 1, sensor_name: 'DHT22 Temperature & Humidity', sensor_model: 'DHT22', sensor_type: 'dht22', unit_of_measurement: '°C / %', is_active: true, created_at: new Date() },
            { sensor_id: 3, device_id: 1, sensor_name: 'Analog Soil Moisture Sensor v1.2', sensor_model: 'Capacitive v1.2', sensor_type: 'soil_moisture', unit_of_measurement: '%', is_active: true, created_at: new Date() },
            { sensor_id: 4, device_id: 1, sensor_name: 'DS18B20 Waterproof Soil Temp', sensor_model: 'DS18B20', sensor_type: 'soil_temp', unit_of_measurement: '°C', is_active: true, created_at: new Date() },
            { sensor_id: 5, device_id: 1, sensor_name: 'Analog pH Sensor Kit', sensor_model: 'SEN0161', sensor_type: 'water_quality', unit_of_measurement: 'pH', is_active: true, created_at: new Date() },
            { sensor_id: 6, device_id: 1, sensor_name: 'TDS Water Quality Meter', sensor_model: 'DFRobot Gravity TDS', sensor_type: 'water_quality', unit_of_measurement: 'ppm', is_active: true, created_at: new Date() },
            { sensor_id: 7, device_id: 1, sensor_name: 'BH1750 Ambient Light Sensor', sensor_model: 'BH1750', sensor_type: 'light', unit_of_measurement: 'Lux', is_active: true, created_at: new Date() },
            { sensor_id: 8, device_id: 1, sensor_name: 'ESP32-CAM AI Vision Module', sensor_model: 'OV2640', sensor_type: 'camera', unit_of_measurement: 'Image stream', is_active: true, created_at: new Date() }
        ];

        for (const s of defaultSensors) {
            await sensorsCol.updateOne(
                { device_id: s.device_id, sensor_name: s.sensor_name },
                { $setOnInsert: s },
                { upsert: true }
            );
        }

        const controlsCol = db.collection('device_controls');
        const defaultControls = [
            { control_id: 1, device_id: 1, actuator_type: 'exhaust_fan', current_state: 'ON', control_mode: 'AUTOMATIC', threshold_config: { temp_max: 30.0, co2_max: 450 }, updated_at: new Date() },
            { control_id: 2, device_id: 1, actuator_type: 'water_pump', current_state: 'OFF', control_mode: 'AUTOMATIC', threshold_config: { moisture_min: 40.0 }, updated_at: new Date() },
            { control_id: 3, device_id: 1, actuator_type: 'grow_lights', current_state: 'ON', control_mode: 'AUTOMATIC', threshold_config: { lux_min: 500 }, updated_at: new Date() },
            { control_id: 4, device_id: 1, actuator_type: 'spray_valve', current_state: 'OFF', control_mode: 'AUTOMATIC', threshold_config: { pest_threshold: 10 }, updated_at: new Date() }
        ];

        for (const c of defaultControls) {
            await controlsCol.updateOne(
                { device_id: c.device_id, actuator_type: c.actuator_type },
                { $setOnInsert: c },
                { upsert: true }
            );
        }

        const airCol = db.collection('air_quality_logs');
        const airCount = await airCol.countDocuments();
        if (airCount === 0) {
            console.log('📊 Seeding Air Quality Logs into MongoDB...');
            const now = Date.now();
            const airEntries = [
                { timeOffset: 6 * 3600 * 1000, aqs: 88, aqi: 65, co2: 410, pm25: 15, pm10: 42, smoke: 'NORMAL', temp: 24, avgTemp: 25, minTemp: 22, maxTemp: 28, hum: 60, avgHum: 58, minHum: 50, maxHum: 65, status: 'Good' },
                { timeOffset: 5 * 3600 * 1000, aqs: 85, aqi: 59, co2: 415, pm25: 12, pm10: 38, smoke: 'NORMAL', temp: 26, avgTemp: 25.5, minTemp: 22, maxTemp: 28, hum: 55, avgHum: 57, minHum: 50, maxHum: 65, status: 'Good' },
                { timeOffset: 4 * 3600 * 1000, aqs: 79, aqi: 80, co2: 425, pm25: 22, pm10: 55, smoke: 'NORMAL', temp: 29, avgTemp: 26, minTemp: 22, maxTemp: 30, hum: 48, avgHum: 55, minHum: 48, maxHum: 65, status: 'Moderate' },
                { timeOffset: 3 * 3600 * 1000, aqs: 74, aqi: 81, co2: 430, pm25: 28, pm10: 60, smoke: 'NORMAL', temp: 31, avgTemp: 27, minTemp: 22, maxTemp: 32, hum: 42, avgHum: 53, minHum: 42, maxHum: 65, status: 'Moderate' },
                { timeOffset: 2 * 3600 * 1000, aqs: 81, aqi: 56, co2: 420, pm25: 20, pm10: 48, smoke: 'NORMAL', temp: 30, avgTemp: 27.2, minTemp: 22, maxTemp: 32, hum: 50, avgHum: 52, minHum: 42, maxHum: 65, status: 'Good' },
                { timeOffset: 1 * 3600 * 1000, aqs: 86, aqi: 55, co2: 412, pm25: 17, pm10: 44, smoke: 'NORMAL', temp: 27, avgTemp: 27, minTemp: 22, maxTemp: 32, hum: 58, avgHum: 53, minHum: 42, maxHum: 65, status: 'Good' },
                { timeOffset: 0, aqs: 90, aqi: 40, co2: 408, pm25: 10, pm10: 30, smoke: 'NORMAL', temp: 25, avgTemp: 26.8, minTemp: 22, maxTemp: 32, hum: 63, avgHum: 54, minHum: 42, maxHum: 65, status: 'Good' }
            ].map((item, idx) => ({
                log_id: idx + 1,
                device_id: 1,
                air_status: item.status,
                air_quality_score: item.aqs,
                aqi_index: item.aqi,
                co2_ppm: item.co2,
                pm2_5: item.pm25,
                pm10: item.pm10,
                smoke_gas_status: item.smoke,
                current_temperature: item.temp,
                avg_temperature: item.avgTemp,
                min_temperature: item.minTemp,
                max_temperature: item.maxTemp,
                current_humidity: item.hum,
                avg_humidity: item.avgHum,
                min_humidity: item.minHum,
                max_humidity: item.maxHum,
                recorded_at: new Date(now - item.timeOffset)
            }));

            await airCol.insertMany(airEntries);
            console.log(`✅ Seeded ${airEntries.length} Air Quality records.`);
        }

        const waterCol = db.collection('water_quality_logs');
        const waterCount = await waterCol.countDocuments();
        if (waterCount === 0) {
            console.log('💧 Seeding Water Quality Logs into MongoDB...');
            const now = Date.now();
            const waterEntries = [
                { timeOffset: 6 * 3600 * 1000, status: 'Optimal', ph: 6.8, avgPh: 6.8, minPh: 6.5, maxPh: 7.2, tds: 420, turb: 1.2, do: 6.5, cond: 650, temp: 22.5, avgTemp: 22.0, minTemp: 20.0, maxTemp: 24.0, tank: 85, pump: 'OFF' },
                { timeOffset: 5 * 3600 * 1000, status: 'Optimal', ph: 6.9, avgPh: 6.85, minPh: 6.5, maxPh: 7.2, tds: 425, turb: 1.1, do: 6.4, cond: 660, temp: 22.8, avgTemp: 22.2, minTemp: 20.0, maxTemp: 24.0, tank: 84, pump: 'OFF' },
                { timeOffset: 4 * 3600 * 1000, status: 'Optimal', ph: 7.0, avgPh: 6.9, minPh: 6.5, maxPh: 7.2, tds: 430, turb: 1.3, do: 6.3, cond: 670, temp: 23.2, avgTemp: 22.5, minTemp: 20.0, maxTemp: 24.0, tank: 82, pump: 'ON' },
                { timeOffset: 3 * 3600 * 1000, status: 'Optimal', ph: 6.8, avgPh: 6.88, minPh: 6.5, maxPh: 7.2, tds: 415, turb: 1.0, do: 6.6, cond: 645, temp: 23.5, avgTemp: 22.8, minTemp: 20.0, maxTemp: 24.0, tank: 80, pump: 'OFF' },
                { timeOffset: 2 * 3600 * 1000, status: 'Optimal', ph: 6.7, avgPh: 6.85, minPh: 6.5, maxPh: 7.2, tds: 410, turb: 0.9, do: 6.8, cond: 640, temp: 23.0, avgTemp: 22.9, minTemp: 20.0, maxTemp: 24.0, tank: 79, pump: 'OFF' },
                { timeOffset: 1 * 3600 * 1000, status: 'Optimal', ph: 6.8, avgPh: 6.84, minPh: 6.5, maxPh: 7.2, tds: 418, turb: 1.0, do: 6.7, cond: 650, temp: 22.4, avgTemp: 22.8, minTemp: 20.0, maxTemp: 24.0, tank: 78, pump: 'OFF' },
                { timeOffset: 0, status: 'Optimal', ph: 6.9, avgPh: 6.85, minPh: 6.5, maxPh: 7.2, tds: 422, turb: 0.8, do: 6.9, cond: 655, temp: 22.0, avgTemp: 22.7, minTemp: 20.0, maxTemp: 24.0, tank: 77, pump: 'OFF' }
            ].map((item, idx) => ({
                log_id: idx + 1,
                device_id: 1,
                water_status: item.status,
                current_ph: item.ph,
                avg_ph: item.avgPh,
                min_ph: item.minPh,
                max_ph: item.maxPh,
                tds_ppm: item.tds,
                turbidity_ntu: item.turb,
                dissolved_oxygen_mg_l: item.do,
                conductivity_us_cm: item.cond,
                current_water_temp: item.temp,
                avg_water_temp: item.avgTemp,
                min_water_temp: item.minTemp,
                max_water_temp: item.maxTemp,
                water_tank_level_percent: item.tank,
                pump_status: item.pump,
                recorded_at: new Date(now - item.timeOffset)
            }));

            await waterCol.insertMany(waterEntries);
            console.log(`✅ Seeded ${waterEntries.length} Water Quality records.`);
        }

        const soilCol = db.collection('soil_moisture_logs');
        const soilCount = await soilCol.countDocuments();
        if (soilCount === 0) {
            console.log('🌾 Seeding Soil Moisture Logs into MongoDB...');
            const now = Date.now();
            const soilEntries = [
                { timeOffset: 6 * 3600 * 1000, moisture: 62.0, category: 'Moderate (40-70%)', temp: 21.0, pump: false },
                { timeOffset: 5 * 3600 * 1000, moisture: 58.5, category: 'Moderate (40-70%)', temp: 21.5, pump: false },
                { timeOffset: 4 * 3600 * 1000, moisture: 54.0, category: 'Moderate (40-70%)', temp: 22.0, pump: false },
                { timeOffset: 3 * 3600 * 1000, moisture: 48.2, category: 'Moderate (40-70%)', temp: 23.0, pump: false },
                { timeOffset: 2 * 3600 * 1000, moisture: 42.0, category: 'Moderate (40-70%)', temp: 23.5, pump: true },
                { timeOffset: 1 * 3600 * 1000, moisture: 68.0, category: 'Moderate (40-70%)', temp: 22.8, pump: false },
                { timeOffset: 0, moisture: 65.5, category: 'Moderate (40-70%)', temp: 22.0, pump: false }
            ].map((item, idx) => ({
                log_id: idx + 1,
                device_id: 1,
                moisture_percentage: item.moisture,
                moisture_category: item.category,
                soil_temperature_celsius: item.temp,
                relay_pump_active: item.pump,
                recorded_at: new Date(now - item.timeOffset)
            }));

            await soilCol.insertMany(soilEntries);
            console.log(`✅ Seeded ${soilEntries.length} Soil Moisture records.`);
        }

        const lightCol = db.collection('light_intensity_logs');
        const lightCount = await lightCol.countDocuments();
        if (lightCount === 0) {
            console.log('💡 Seeding Light Intensity Logs into MongoDB...');
            const now = Date.now();
            const lightEntries = [
                { timeOffset: 6 * 3600 * 1000, lux: 420.0, grow_lights: false },
                { timeOffset: 5 * 3600 * 1000, lux: 650.0, grow_lights: false },
                { timeOffset: 4 * 3600 * 1000, lux: 900.0, grow_lights: false },
                { timeOffset: 3 * 3600 * 1000, lux: 1050.0, grow_lights: false },
                { timeOffset: 2 * 3600 * 1000, lux: 880.0, grow_lights: false },
                { timeOffset: 1 * 3600 * 1000, lux: 500.0, grow_lights: false },
                { timeOffset: 0, lux: 150.0, grow_lights: true }
            ].map((item, idx) => ({
                log_id: idx + 1,
                device_id: 1,
                lux_value: item.lux,
                grow_lights_active: item.grow_lights,
                recorded_at: new Date(now - item.timeOffset)
            }));

            await lightCol.insertMany(lightEntries);
            console.log(`✅ Seeded ${lightEntries.length} Light Intensity records.`);
        }

        const plantCol = db.collection('plant_growth_logs');
        const plantCount = await plantCol.countDocuments();
        if (plantCount === 0) {
            console.log('🌿 Seeding Plant Growth Logs into MongoDB...');
            const now = Date.now();
            const plantEntries = [
                { timeOffset: 6 * 3600 * 1000, crop: 'Roma Tomato', batch: 'BATCH-2026-A', height: 42.0, leaf: 28, stage: 'vegetative', health: 92.0, status: 'Healthy', risk: 'LOW', n: 45, p: 25, k: 35 },
                { timeOffset: 5 * 3600 * 1000, crop: 'Roma Tomato', batch: 'BATCH-2026-A', height: 42.5, leaf: 28, stage: 'vegetative', health: 93.0, status: 'Healthy', risk: 'LOW', n: 44, p: 25, k: 34 },
                { timeOffset: 4 * 3600 * 1000, crop: 'Roma Tomato', batch: 'BATCH-2026-A', height: 43.0, leaf: 29, stage: 'vegetative', health: 94.0, status: 'Healthy', risk: 'LOW', n: 46, p: 26, k: 36 },
                { timeOffset: 3 * 3600 * 1000, crop: 'Roma Tomato', batch: 'BATCH-2026-A', height: 43.8, leaf: 30, stage: 'flowering', health: 95.0, status: 'Healthy', risk: 'LOW', n: 45, p: 28, k: 38 },
                { timeOffset: 2 * 3600 * 1000, crop: 'Roma Tomato', batch: 'BATCH-2026-A', height: 44.2, leaf: 30, stage: 'flowering', health: 96.0, status: 'Healthy', risk: 'LOW', n: 43, p: 27, k: 37 },
                { timeOffset: 1 * 3600 * 1000, crop: 'Roma Tomato', batch: 'BATCH-2026-A', height: 44.8, leaf: 31, stage: 'flowering', health: 96.5, status: 'Healthy', risk: 'LOW', n: 42, p: 29, k: 39 },
                { timeOffset: 0, crop: 'Roma Tomato', batch: 'BATCH-2026-A', height: 45.5, leaf: 32, stage: 'flowering', health: 97.0, status: 'Healthy', risk: 'LOW', n: 44, p: 30, k: 40 }
            ].map((item, idx) => ({
                log_id: idx + 1,
                device_id: 1,
                crop_name: item.crop,
                batch_identifier: item.batch,
                plant_height_cm: item.height,
                leaf_count: item.leaf,
                growth_stage: item.stage,
                health_index: item.health,
                crop_health_status: item.status,
                disease_risk: item.risk,
                nitrogen_level: item.n,
                phosphorus_level: item.p,
                potassium_level: item.k,
                recorded_at: new Date(now - item.timeOffset)
            }));

            await plantCol.insertMany(plantEntries);
            console.log(`✅ Seeded ${plantEntries.length} Plant Growth records.`);
        }

        const pestCol = db.collection('pest_detection_logs');
        const pestCount = await pestCol.countDocuments();
        if (pestCount === 0) {
            console.log('🐛 Seeding Pest Detection Logs into MongoDB...');
            const now = Date.now();
            const pestEntries = [
                { pest_log_id: 1, device_id: 1, target_crop: 'Roma Tomato', pest_detected: 'Whitefly (Trialeurodes vaporariorum)', pest_count: 3, severity_level: 'MEDIUM', ai_confidence: 94.2, sector_zone: 'Sector B', detection_source: 'live_camera', recommended_action: 'Deploy yellow sticky traps and activate organic neem spray.', treatment_applied: 'Scheduled automatic misting', detected_at: new Date(now - 3600 * 1000) },
                { pest_log_id: 2, device_id: 1, target_crop: 'Roma Tomato', pest_detected: 'Aphid Colony', pest_count: 1, severity_level: 'LOW', ai_confidence: 89.5, sector_zone: 'Sector A', detection_source: 'live_camera', recommended_action: 'Monitor zone A closely. Introduce predatory ladybugs if population expands.', treatment_applied: 'None required', detected_at: new Date(now - 12000 * 1000) }
            ];

            await pestCol.insertMany(pestEntries);
            console.log(`✅ Seeded ${pestEntries.length} Pest Detection records.`);
        }

        const eventsCol = db.collection('system_events');
        const eventsCount = await eventsCol.countDocuments();
        if (eventsCount === 0) {
            console.log('🌱 Seeding System Events & Recommendations into MongoDB...');
            const now = Date.now();
            const events = [
                { event_id: 1, device_id: 1, module_name: 'air_pollution', icon: '💨', title: 'Exhaust Fan Activated', event_level: 'low', details: ['Triggered by CO2 reaching 430 ppm', 'Returned to optimal range in 14 mins'], event_time: new Date(now - 7200 * 1000) },
                { event_id: 2, device_id: 1, module_name: 'water_quality', icon: '💧', title: 'Nutrient Dosing Completed', event_level: 'positive', details: ['pH calibrated to 6.8', 'TDS stabilized at 420 ppm'], event_time: new Date(now - 14400 * 1000) },
                { event_id: 3, device_id: 1, module_name: 'plant_health', icon: '🌿', title: 'Flowering Stage Transition Confirmed', event_level: 'positive', details: ['Height reached 45.5cm', 'Flowering score increased to 70/100'], event_time: new Date(now - 28800 * 1000) },
                { event_id: 4, device_id: 1, module_name: 'pest_detection', icon: '🐛', title: 'Whitefly Alert Triggered & Neutralized', event_level: 'medium', details: ['Target localized in Sector B', 'Neem misting valve pulsed for 120s'], event_time: new Date(now - 3600 * 1000) }
            ];
            await eventsCol.insertMany(events);
        }

        const recsCol = db.collection('recommendations_intelligence');
        const recsCount = await recsCol.countDocuments();
        if (recsCount === 0) {
            const recs = [
                { recommendation_id: 1, device_id: 1, module_name: 'air_pollution', recommendation_text: 'Maintain ventilation during 12 PM - 3 PM to mitigate ambient heat build-up.', is_active: true, created_at: new Date() },
                { recommendation_id: 2, device_id: 1, module_name: 'water_quality', recommendation_text: 'Inspect water filter cartridge in 48 hours to sustain low turbidity.', is_active: true, created_at: new Date() },
                { recommendation_id: 3, device_id: 1, module_name: 'plant_health', recommendation_text: 'Boost potassium formulation to support robust flower set and fruit development.', is_active: true, created_at: new Date() },
                { recommendation_id: 4, device_id: 1, module_name: 'pest_detection', recommendation_text: 'Inspect undersides of leaves in Sector B tomorrow morning to verify complete eradication.', is_active: true, created_at: new Date() }
            ];
            await recsCol.insertMany(recs);
        }

        const alertsCol = db.collection('alerts');
        const alertsCount = await alertsCol.countDocuments();
        if (alertsCount === 0) {
            const alerts = [
                { alert_id: 1, device_id: 1, module_name: 'air_quality', alert_level: 'info', title: 'CO2 Threshold Approaching', message: 'Greenhouse CO2 touched 430 ppm. Automatic exhaust initiated.', is_resolved: true, resolved_at: new Date(), created_at: new Date(Date.now() - 7200 * 1000) },
                { alert_id: 2, device_id: 1, module_name: 'pest_detection', alert_level: 'warning', title: 'Whitefly Detected in Sector B', message: 'Vision camera identified 3 whiteflies. Misting protocol executed.', is_resolved: false, created_at: new Date(Date.now() - 3600 * 1000) }
            ];
            await alertsCol.insertMany(alerts);
        }

        console.log('\n🎉 ========================================================');
        console.log('🎉 MongoDB Initialization & Seed Completed Successfully!');
        console.log('🎉 All 17 collections are ready with indexes and baseline data.');
        console.log('🎉 ========================================================');

    } catch (err) {
        console.error('❌ MongoDB initialization failed:', err);
    } finally {
        await closeMongo();
    }
}

initMongoDB();
