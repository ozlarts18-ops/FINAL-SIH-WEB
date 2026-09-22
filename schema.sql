
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    device_id SERIAL PRIMARY KEY,
    device_name VARCHAR(100) NOT NULL,
    device_uid VARCHAR(100) NOT NULL UNIQUE,
    device_type VARCHAR(50) DEFAULT 'Raspberry Pi',
    location VARCHAR(150),
    esp32_cam_stream_url VARCHAR(255) DEFAULT 'http://<ESP32-CAM-IP>/stream',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    last_ping TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensors (
    sensor_id SERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    sensor_name VARCHAR(100) NOT NULL,
    sensor_model VARCHAR(100),
    sensor_type VARCHAR(30) NOT NULL CHECK (sensor_type IN ('air_quality', 'water_quality', 'soil_moisture', 'soil_temp', 'light', 'ultrasonic', 'camera', 'dht22', 'npk', 'other')),
    unit_of_measurement VARCHAR(30),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_controls (
    control_id SERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    actuator_type VARCHAR(30) NOT NULL CHECK (actuator_type IN ('exhaust_fan', 'water_pump', 'grow_lights', 'spray_valve')),
    current_state VARCHAR(10) DEFAULT 'OFF' CHECK (current_state IN ('ON', 'OFF')),
    control_mode VARCHAR(20) DEFAULT 'AUTOMATIC' CHECK (control_mode IN ('ON', 'OFF', 'AUTOMATIC')),
    threshold_config JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS air_quality_logs (
    log_id BIGSERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    sensor_id INT REFERENCES sensors(sensor_id) ON DELETE SET NULL,
    air_status VARCHAR(30) DEFAULT 'Good' CHECK (air_status IN ('Good', 'Moderate', 'Poor', 'Unhealthy', 'Hazardous')),
    air_quality_score NUMERIC(5, 2),
    aqi_index NUMERIC(6, 2),
    co2_ppm NUMERIC(6, 2),
    pm2_5 NUMERIC(6, 2),
    pm10 NUMERIC(6, 2),
    smoke_gas_status VARCHAR(30) DEFAULT 'NORMAL',
    gas_detected BOOLEAN DEFAULT FALSE,
    rain_detected BOOLEAN DEFAULT FALSE,
    buzzer_active BOOLEAN DEFAULT FALSE,
    current_temperature NUMERIC(5, 2),
    avg_temperature NUMERIC(5, 2),
    min_temperature NUMERIC(5, 2),
    max_temperature NUMERIC(5, 2),
    current_humidity NUMERIC(5, 2),
    avg_humidity NUMERIC(5, 2),
    min_humidity NUMERIC(5, 2),
    max_humidity NUMERIC(5, 2),
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_air_device_time ON air_quality_logs (device_id, recorded_at);

CREATE TABLE IF NOT EXISTS water_quality_logs (
    log_id BIGSERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    sensor_id INT REFERENCES sensors(sensor_id) ON DELETE SET NULL,
    water_status VARCHAR(30) DEFAULT 'Optimal' CHECK (water_status IN ('Optimal', 'Suboptimal', 'Critical')),
    current_ph NUMERIC(4, 2),
    avg_ph NUMERIC(4, 2),
    min_ph NUMERIC(4, 2),
    max_ph NUMERIC(4, 2),
    tds_ppm NUMERIC(6, 2),
    turbidity_ntu NUMERIC(6, 2),
    dissolved_oxygen_mg_l NUMERIC(5, 2),
    conductivity_us_cm NUMERIC(6, 2),
    current_water_temp NUMERIC(5, 2),
    avg_water_temp NUMERIC(5, 2),
    min_water_temp NUMERIC(5, 2),
    max_water_temp NUMERIC(5, 2),
    water_tank_level_percent NUMERIC(5, 2),
    pump_status VARCHAR(10) DEFAULT 'OFF' CHECK (pump_status IN ('ON', 'OFF')),
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_water_device_time ON water_quality_logs (device_id, recorded_at);

CREATE TABLE IF NOT EXISTS soil_moisture_logs (
    log_id BIGSERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    sensor_id INT REFERENCES sensors(sensor_id) ON DELETE SET NULL,
    moisture_percentage NUMERIC(5, 2) NOT NULL,
    moisture_category VARCHAR(20) CHECK (moisture_category IN ('Dry (<40%)', 'Moderate (40-70%)', 'Wet (>70%)')),
    soil_temperature_celsius NUMERIC(5, 2),
    relay_pump_active BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_soil_device_time ON soil_moisture_logs (device_id, recorded_at);

CREATE TABLE IF NOT EXISTS irrigation_events (
    event_id SERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMPTZ NULL,
    duration_minutes INT,
    water_volume_liters NUMERIC(7, 2),
    trigger_mode VARCHAR(20) DEFAULT 'automatic' CHECK (trigger_mode IN ('automatic', 'manual', 'scheduled')),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed', 'aborted'))
);

CREATE TABLE IF NOT EXISTS light_intensity_logs (
    log_id BIGSERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    sensor_id INT REFERENCES sensors(sensor_id) ON DELETE SET NULL,
    lux_value NUMERIC(8, 2) NOT NULL,
    grow_lights_active BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_light_device_time ON light_intensity_logs (device_id, recorded_at);

CREATE TABLE IF NOT EXISTS growth_observations (
    observation_id SERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    crop_name VARCHAR(100) NOT NULL,
    batch_identifier VARCHAR(50),
    period_type VARCHAR(20) DEFAULT 'weekly' CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    height_score NUMERIC(5, 2),
    leaf_count_score NUMERIC(5, 2),
    stem_width_score NUMERIC(5, 2),
    leaf_color_score NUMERIC(5, 2),
    root_growth_score NUMERIC(5, 2),
    flowering_score NUMERIC(5, 2),
    is_previous_period BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plant_growth_logs (
    log_id SERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    crop_name VARCHAR(100) NOT NULL,
    batch_identifier VARCHAR(50),
    plant_height_cm NUMERIC(5, 2),
    leaf_count INT,
    growth_stage VARCHAR(30) DEFAULT 'vegetative' CHECK (growth_stage IN ('seedling', 'vegetative', 'flowering', 'harvest')),
    health_index NUMERIC(5, 2),
    crop_health_status VARCHAR(30) DEFAULT 'Healthy' CHECK (crop_health_status IN ('Healthy', 'At Risk', 'Infected', 'Good')),
    disease_risk VARCHAR(20) DEFAULT 'LOW' CHECK (disease_risk IN ('LOW', 'MEDIUM', 'HIGH')),
    nitrogen_level NUMERIC(5, 2),
    phosphorus_level NUMERIC(5, 2),
    potassium_level NUMERIC(5, 2),
    image_url VARCHAR(255),
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disease_detection_logs (
    detection_id SERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    crop_name VARCHAR(100) NOT NULL,
    disease_name VARCHAR(150) NOT NULL,
    confidence_score NUMERIC(5, 2),
    severity_level VARCHAR(20) DEFAULT 'moderate' CHECK (severity_level IN ('low', 'moderate', 'high', 'critical')),
    detection_source VARCHAR(20) DEFAULT 'live_camera' CHECK (detection_source IN ('live_camera', 'upload')),
    treatment_advice TEXT,
    input_image_url VARCHAR(255),
    result_image_url VARCHAR(255),
    detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pest_detection_logs (
    pest_log_id SERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    target_crop VARCHAR(100) NOT NULL,
    pest_detected VARCHAR(100) NOT NULL,
    pest_count INT DEFAULT 1,
    severity_level VARCHAR(20) DEFAULT 'MEDIUM' CHECK (severity_level IN ('LOW', 'MEDIUM', 'HIGH', 'SEVERE', 'CRITICAL', 'low', 'medium', 'high', 'severe', 'critical')),
    ai_confidence NUMERIC(5, 2),
    sector_zone VARCHAR(100) DEFAULT 'Sector B',
    detection_source VARCHAR(20) DEFAULT 'live_camera' CHECK (detection_source IN ('live_camera', 'upload')),
    recommended_action TEXT,
    treatment_applied TEXT,
    input_image_url VARCHAR(255),
    result_image_url VARCHAR(255),
    detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_events (
    event_id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(device_id) ON DELETE CASCADE,
    module_name VARCHAR(30) NOT NULL CHECK (module_name IN ('air_pollution', 'water_quality', 'plant_health', 'pest_detection', 'irrigation')),
    icon VARCHAR(10) DEFAULT '🌱',
    title VARCHAR(150) NOT NULL,
    event_level VARCHAR(20) DEFAULT 'low' CHECK (event_level IN ('low', 'medium', 'high', 'positive')),
    details JSONB DEFAULT '[]'::jsonb,
    event_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendations_intelligence (
    recommendation_id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(device_id) ON DELETE CASCADE,
    module_name VARCHAR(30) NOT NULL CHECK (module_name IN ('air_pollution', 'water_quality', 'plant_health', 'pest_detection')),
    recommendation_text TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
    alert_id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(device_id) ON DELETE SET NULL,
    module_name VARCHAR(30) NOT NULL CHECK (module_name IN ('air_quality', 'water_quality', 'soil_moisture', 'lighting', 'plant_health', 'pest_detection', 'system')),
    alert_level VARCHAR(20) DEFAULT 'warning' CHECK (alert_level IN ('info', 'warning', 'critical', 'normal', 'NORMAL', 'WARNING', 'INFO')),
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_exports (
    report_id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(device_id) ON DELETE CASCADE,
    report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
    module_name VARCHAR(30) NOT NULL CHECK (module_name IN ('air_pollution', 'water_quality', 'plant_health', 'pest_detection', 'all')),
    file_format VARCHAR(10) DEFAULT 'csv',
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
