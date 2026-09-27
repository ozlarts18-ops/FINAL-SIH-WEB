import { queryTable, insertAndSync, getSystemHealth } from '../server/syncEngine.js';
import { closeMongo } from '../server/mongoDb.js';

async function testAll() {
    console.log('🧪 Testing System Health & MongoDB Primary + Redis Fast Cache Integration...');

    try {
        const health = await getSystemHealth();
        console.log('💚 Health Report:', JSON.stringify(health, null, 2));

        const air = await queryTable('air_quality_logs', { limit: 5 });
        console.log(`\n💨 Air Quality Logs (Source: ${air.source}): ${air.count} records retrieved.`);
        if (air.data && air.data.length > 0) {
            console.log('Sample record:', air.data[0]);
        }

        const water = await queryTable('water_quality_logs', { limit: 5 });
        console.log(`\n💧 Water Quality Logs (Source: ${water.source}): ${water.count} records retrieved.`);

        const soil = await queryTable('soil_moisture_logs', { limit: 5 });
        console.log(`\n🌾 Soil Moisture Logs (Source: ${soil.source}): ${soil.count} records retrieved.`);

        const plant = await queryTable('plant_growth_logs', { limit: 5 });
        console.log(`\n🌿 Plant Growth Logs (Source: ${plant.source}): ${plant.count} records retrieved.`);

        const pest = await queryTable('pest_detection_logs', { limit: 5 });
        console.log(`\n🐛 Pest Detection Logs (Source: ${pest.source}): ${pest.count} records retrieved.`);

        console.log('\n📝 Testing Insert to Primary MongoDB and Cache Invalidation...');
        const deviceId = 1;

        const testInsert = await insertAndSync('air_quality_logs', {
            device_id: deviceId,
            air_status: 'Good',
            air_quality_score: 92.5,
            aqi_index: 38.0,
            co2_ppm: 405.0,
            pm2_5: 8.5,
            pm10: 25.0,
            smoke_gas_status: 'NORMAL',
            current_temperature: 24.5,
            avg_temperature: 25.0,
            min_temperature: 22.0,
            max_temperature: 28.0,
            current_humidity: 62.0,
            avg_humidity: 55.0,
            min_humidity: 45.0,
            max_humidity: 65.0,
            recorded_at: new Date().toISOString()
        });

        console.log(`✅ Insert successful! Source: ${testInsert.source}, Record:`, testInsert.record);

        console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    } catch (err) {
        console.error('❌ Test failed:', err);
    } finally {
        await closeMongo();
    }
}

testAll();
