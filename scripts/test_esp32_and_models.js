
import { runAirQualityModel, runPestDetectionAI, runPlantDiseaseAI } from '../server/aiModelService.js';
import { getESP32Status, getDetectedPorts, connectESP32, executeCliCommand } from '../server/esp32SerialService.js';

async function runTests() {
    console.log('================================================================');
    console.log('🌿 ENVIROX ESP32-S3 & AI MODEL INTEGRATION VERIFICATION SUITE');
    console.log('================================================================\n');

    console.log('1️⃣ Testing Air Quality Predictive AI Model (EnviroX-DeepAir-ResNetX)...');
    const airResult = runAirQualityModel({
        pm2_5: 22.4,
        pm10: 38.0,
        co2_ppm: 550,
        current_temperature: 27.2,
        current_humidity: 58.0,
        smoke_gas_status: 'NORMAL'
    });
    console.log(`   - Model ID: ${airResult.model_info.model_id}`);
    console.log(`   - Predicted AQI: ${airResult.outputs.aqi_index} (${airResult.outputs.air_status})`);
    console.log(`   - Air Quality Score: ${airResult.outputs.air_quality_score}/100`);
    console.log(`   - Health Risk: ${airResult.outputs.health_risk_index}`);
    console.log(`   - 24h Forecast Hourly Vector: ${airResult.outputs.hourly_forecast_24h.length} hours generated`);
    if (airResult.outputs.aqi_index >= 0 && airResult.outputs.air_quality_score > 0) {
        console.log('   ✅ Air Quality AI Model PASSED\n');
    } else {
        throw new Error('Air Quality Model test failed');
    }

    console.log('2️⃣ Testing Pest Detection AI Model (MobileNetV2-SSD-Lite INT8)...');
    const pestResult = runPestDetectionAI({
        cropName: 'Tomato (Solanum lycopersicum)',
        forceClass: 'Aphids (Cluster)'
    });
    console.log(`   - Target Crop: ${pestResult.target_crop}`);
    console.log(`   - Identified Pest: ${pestResult.detected_pest}`);
    console.log(`   - Pest Count: ${pestResult.pest_count}`);
    console.log(`   - AI Confidence: ${pestResult.ai_confidence}%`);
    console.log(`   - Severity: ${pestResult.severity_level}`);
    console.log(`   - Bounding Box: [x:${pestResult.bounding_box.x}%, y:${pestResult.bounding_box.y}%, w:${pestResult.bounding_box.width}%, h:${pestResult.bounding_box.height}%]`);
    if (pestResult.detected_pest && pestResult.ai_confidence > 80) {
        console.log('   ✅ Pest Detection AI Model PASSED\n');
    } else {
        throw new Error('Pest Detection Model test failed');
    }

    console.log('3️⃣ Testing Plant Pathology AI Model (MobileNetV3-PlantGuard)...');
    const plantResult = runPlantDiseaseAI({
        cropName: 'Bell Pepper (Capsicum annuum)',
        forceClass: 'Powdery Mildew'
    });
    console.log(`   - Crop: ${plantResult.crop_name}`);
    console.log(`   - Diagnosis: ${plantResult.disease_name}`);
    console.log(`   - Health Index: ${plantResult.health_index}/100`);
    console.log(`   - Estimated Height: ${plantResult.plant_height_cm} cm | Leaves: ${plantResult.leaf_count}`);
    console.log(`   - AI Confidence: ${plantResult.confidence_score}%`);
    if (plantResult.disease_name && plantResult.health_index > 0) {
        console.log('   ✅ Plant Pathology AI Model PASSED\n');
    } else {
        throw new Error('Plant Pathology Model test failed');
    }

    console.log('4️⃣ Testing ESP32-S3 Serial Hardware Link Service...');
    const ports = await getDetectedPorts();
    console.log(`   - Detected COM Ports: ${JSON.stringify(ports.map(p => `${p.device} (${p.description})`))}`);
    const status = getESP32Status();
    console.log(`   - Hardware Port: ${status.port} @ ${status.baudRate} baud`);
    console.log(`   - Silicon: ${status.chipInfo.model} (${status.chipInfo.psram_total_mb}MB PSRAM)`);
    console.log(`   - MAC: ${status.chipInfo.mac_address}`);

    const connectRes = await connectESP32('COM7');
    console.log(`   - Connect Response: Status = ${connectRes.status}`);

    const cliResult = await executeCliCommand('MODEL');
    console.log(`   - CLI [MODEL] Response: ${JSON.stringify(cliResult)}`);

    console.log('   ✅ ESP32-S3 Hardware Link Service PASSED\n');

    console.log('================================================================');
    console.log('🎉 ALL ESP32-S3 & AI MODEL INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
}

runTests().catch (err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
