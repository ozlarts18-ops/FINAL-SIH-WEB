import { Chart, registerables } from 'chart.js';
import { 
    fetchPlantGrowthLogs, 
    fetchDiseaseLogs, 
    fetchSoilMoistureLogs,
    fetchSystemEvents, 
    fetchRecommendations,
    fetchLatestSensorData,
    fetchAgriculturalDiagnosis
} from '../api/dataService';
import { generateExecutiveReport } from '../utils/reportGenerator';

Chart.register(...registerables);

export let ESP32_STREAM_URL = '/api/camera/stream';

export let plantEvents = [
    {
        time: '08:40 AM',
        icon: '',
        title: 'SOIL MOISTURE DROPPED',
        level: 'medium',
        details: ['Moisture: 42%', 'Threshold: 50%', 'Irrigation: Triggered']
    },
    {
        time: '09:15 AM',
        icon: '',
        title: 'GROWTH STAGE ADVANCED',
        level: 'positive',
        details: ['Stage: Seedling → Vegetative', 'Leaf count: +4']
    },
    {
        time: '11:00 AM',
        icon: '',
        title: 'NUTRIENT LEVELS NORMAL',
        level: 'low',
        details: ['N-P-K: Within normal range', 'Action required: None']
    },
    {
        time: '01:20 PM',
        icon: '',
        title: 'RISING SOIL TEMPERATURE',
        level: 'medium',
        details: ['Soil temp: 32°C', 'Previous: 27°C']
    },
    {
        time: '05:20 PM',
        icon: '',
        title: 'SOIL TEMPERATURE SPIKE',
        level: 'high',
        details: ['Soil temp: 34°C', 'Safe range: Exceeded']
    }
];

export let plantRecommendations = [
    'Soil moisture is trending downward — consider increasing irrigation frequency by 10%.',
    'Plant health score is stable and improving over the monitoring period.',
    'Soil temperature spikes correlate with early-afternoon sun exposure.',
    'Additional inspection of the affected crop zone is recommended.',
    'Nutrient levels remain normal; next fertilizer cycle can be delayed by 3-4 days.',
    'Disease risk has stayed low compared with the previous monitoring period.'
];

export const readImageFile = (file, onLoad) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(reader.result);
    reader.readAsDataURL(file);
};

let soilMoistureData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [65, 62, 58, 54, 50, 48, 46]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [60, 58, 55, 57, 53, 50, 52]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [58, 55, 53, 50]
    }
};

let soilTemperatureData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [24, 26, 29, 32, 34, 30, 27]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [27, 28, 29, 27, 26, 28, 27]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [28, 29, 27, 26]
    }
};

const soilTemperatureColors = [
    'rgba(255, 99, 132, 0.6)',
    'rgba(255, 159, 64, 0.6)',
    'rgba(255, 205, 86, 0.6)',
    'rgba(75, 192, 192, 0.6)',
    'rgba(54, 162, 235, 0.6)',
    'rgba(153, 102, 255, 0.6)',
    'rgba(201, 203, 207, 0.6)'
];

let plantHealthScoreData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [86, 87, 88, 89, 90, 90, 91]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [85, 86, 88, 89, 90, 91, 92]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [86, 88, 90, 91]
    }
};

let aiDetectionConfidenceData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [92, 94, 95, 97, 96, 95, 93]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [91, 93, 95, 96, 95, 94, 97]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [93, 95, 96, 95]
    }
};

let irrigationActivityData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [0, 1, 1, 0, 1, 0, 0]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [2, 3, 2, 4, 3, 2, 1]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [10, 12, 9, 11]
    }
};

let cropHealthData = {
    daily: {
        labels: ['Healthy', 'At Risk', 'Infected'],
        values: [78, 16, 6]
    },
    weekly: {
        labels: ['Healthy', 'At Risk', 'Infected'],
        values: [75, 18, 7]
    },
    monthly: {
        labels: ['Healthy', 'At Risk', 'Infected'],
        values: [76, 17, 7]
    }
};

const cropHealthColors = [
    'rgba(75, 192, 192, 0.7)',
    'rgba(255, 205, 86, 0.7)',
    'rgba(255, 99, 132, 0.7)'
];

let lastUpdatedData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [1, 1, 1, 1, 1, 1, 1]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [7, 7, 7, 7, 7, 7, 7]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [49, 49, 49, 49]
    }
};

let soilMoistureChart = null;
let soilTemperatureChart = null;
let plantHealthScoreChart = null;
let aiDetectionConfidenceChart = null;
let irrigationActivityChart = null;
let cropHealthChart = null;
let lastUpdatedChart = null;
let currentFilter = 'daily';

const safeDestroy = (canvasEl) => {
    if (!canvasEl) return;
    const existing = Chart.getChart(canvasEl);
    if (existing) {
        existing.destroy();
    }
};

let livePollingInterval = null;

export const syncPlantDataFromSupabase = async () => {
    try {
        const [growthRes, diseaseRes, soilRes, sensorRes, diagRes, eventsRes, recsRes] = await Promise.allSettled([
            fetchPlantGrowthLogs(50),
            fetchDiseaseLogs(50),
            fetchSoilMoistureLogs(10),
            fetchLatestSensorData(),
            fetchAgriculturalDiagnosis(),
            fetchSystemEvents('plant_health', 5),
            fetchRecommendations('plant_health', 6)
        ]);

        if (growthRes.status === 'fulfilled' && growthRes.value.data?.length > 0) {
            const data = growthRes.value.data;
            const labels = data.map(d => new Date(d.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            plantHealthScoreData.daily = {
                labels,
                values: data.map(d => Number(d.health_index ?? 85))
            };
        }

        if (diseaseRes.status === 'fulfilled' && diseaseRes.value.data?.length > 0) {
            const data = diseaseRes.value.data;
            const labels = data.map(d => new Date(d.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            aiDetectionConfidenceData.daily = {
                labels,
                values: data.map(d => Number(d.confidence_score ?? 95))
            };
        }

        if (soilRes.status === 'fulfilled' && soilRes.value.data?.length > 0) {
            const sData = soilRes.value.data;
            const labels = sData.map(d => new Date(d.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            soilMoistureData.daily = {
                labels,
                values: sData.map(d => Number(d.moisture_percentage ?? 55))
            };
            soilTemperatureData.daily = {
                labels,
                values: sData.map(d => Number(d.soil_temperature_celsius ?? 26))
            };
        }

        if (eventsRes.status === 'fulfilled' && eventsRes.value.data?.length > 0) {
            plantEvents = eventsRes.value.data.map(ev => ({
                time: new Date(ev.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '',
                title: ev.title,
                level: ev.event_level || 'low',
                details: Array.isArray(ev.details) ? ev.details : []
            }));
        }

        if (recsRes.status === 'fulfilled' && recsRes.value.data?.length > 0) {
            plantRecommendations = recsRes.value.data.map(r => r.recommendation_text);
        }

        const latestGrowth = growthRes.status === 'fulfilled' && growthRes.value.data?.length > 0 ? growthRes.value.data[growthRes.value.data.length - 1] : null;
        const latestSoil = soilRes.status === 'fulfilled' && soilRes.value.data?.length > 0 ? soilRes.value.data[soilRes.value.data.length - 1] : null;
        const liveSensor = sensorRes.status === 'fulfilled' ? sensorRes.value : null;
        const liveDiag = diagRes.status === 'fulfilled' ? diagRes.value : null;

        updatePlantOverviewDOM(latestGrowth, latestSoil, liveSensor, liveDiag);

    } catch (err) {
        console.warn('Plant growth data loading fallback:', err.message || err);
    }
};

export const updatePlantOverviewDOM = (latestGrowth, latestSoil, liveSensor, liveDiag) => {
    const setElem = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.innerText = val;
    };

    if (latestGrowth) {
        if (latestGrowth.crop_name) {
            setElem('plantType', latestGrowth.crop_name);
        }
        setElem('cropHealth', latestGrowth.crop_health_status || 'Good');
        const score = latestGrowth.health_index ?? 88;
        const scoreStr = `${score}/100`;
        setElem('plantHealthScore', scoreStr);
        setElem('growthStage', scoreStr);
        setElem('diseaseRisk', latestGrowth.disease_risk || 'LOW');
        if (latestGrowth.recorded_at) {
            setElem('lastUpdated', new Date(latestGrowth.recorded_at).toLocaleDateString());
        }
    }

    if (latestSoil) {
        setElem('soilMoisture', `${latestSoil.moisture_percentage}%`);
        setElem('soilTemp', `${latestSoil.soil_temperature_celsius}`);
        setElem('ct1', `${latestSoil.soil_temperature_celsius}`);
        setElem('ct2', `${latestSoil.soil_temperature_celsius}`);
        setElem('ct3', `${Math.max(18, latestSoil.soil_temperature_celsius - 4)}`);
        setElem('ct4', `${latestSoil.soil_temperature_celsius + 3}`);
        setElem('ht1', `${latestSoil.moisture_percentage}%`);
        setElem('ht2', `${latestSoil.moisture_percentage}%`);
        setElem('ht3', `${Math.max(20, latestSoil.moisture_percentage - 10)}%`);
        setElem('ht4', `${Math.min(95, latestSoil.moisture_percentage + 8)}%`);
    }

    if (liveSensor) {
        if (liveSensor.soil_moisture !== undefined && liveSensor.soil_moisture !== null) {
            setElem('soilMoisture', `${liveSensor.soil_moisture}%`);
            setElem('ht1', `${liveSensor.soil_moisture}%`);
        }
        if (liveSensor.temperature !== undefined && liveSensor.temperature !== null) {
            setElem('soilTemp', `${liveSensor.temperature}`);
            setElem('ct1', `${liveSensor.temperature}`);
        }
    }

    if (liveDiag) {
        if (liveDiag.diagnosis?.disease) {
            const d = liveDiag.diagnosis.disease;
            if (d.name === 'uncertain') {
                setElem('cropHealth', 'Uncertain');
                setElem('diseaseRisk', 'UNCERTAIN');
            } else if (d.name !== 'none_detected') {
                setElem('cropHealth', d.severity === 'high' || d.severity === 'critical' ? 'At Risk' : 'Moderate');
                setElem('diseaseRisk', d.severity ? d.severity.toUpperCase() : 'MEDIUM');
            }
        }
        if (liveDiag.diagnosis?.nutrient_deficiency) {
            const n = liveDiag.diagnosis.nutrient_deficiency;
            if (n.name !== 'unknown' && n.name !== 'none_detected') {
                setElem('nutrientStatus', `Deficient: ${n.name}`);
            } else {
                setElem('nutrientStatus', 'NORMAL');
            }
        }
    }
};

export const initCharts = async () => {
    await syncPlantDataFromSupabase();
    renderCharts(currentFilter);

    if (!livePollingInterval) {
        livePollingInterval = setInterval(() => {
            fetchLatestSensorData().then(sensor => {
                if (sensor) {
                    if (sensor.soil_moisture !== undefined) {
                        const el = document.getElementById('soilMoisture');
                        if (el) el.innerText = `${sensor.soil_moisture}%`;
                    }
                }
            }).catch(() => {});
        }, 5000);
    }
};

const renderCharts = (filter = 'daily') => {
    destroyCharts();

    const soilMoistureEl = document.getElementById('SoilMoistureTrend') || document.getElementById('SoilMoisture');
    if (soilMoistureEl) {
        safeDestroy(soilMoistureEl);
        soilMoistureChart = new Chart(soilMoistureEl, {
            type: 'line',
            data: {
                labels: soilMoistureData[filter].labels,
                datasets: [{
                    label: 'Soil Moisture (%)',
                    data: soilMoistureData[filter].values,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgb(75, 192, 192)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: 'rgb(75, 192, 192)',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Soil Moisture Trend' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Moisture (%)' } }
                }
            }
        });
    }

    const soilTemperatureEl = document.getElementById('SoilTemperature') || document.getElementById('SoilTemperatureTrend');
    if (soilTemperatureEl) {
        safeDestroy(soilTemperatureEl);
        soilTemperatureChart = new Chart(soilTemperatureEl, {
            type: 'bar',
            data: {
                labels: soilTemperatureData[filter].labels,
                datasets: [{
                    label: 'Soil Temperature (°C)',
                    data: soilTemperatureData[filter].values,
                    backgroundColor: soilTemperatureColors.slice(0, soilTemperatureData[filter].values.length),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Soil Temperature Trend' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Temperature (°C)' } }
                }
            }
        });
    }

    const plantHealthScoreEl = document.getElementById('PlantHealthScore') || document.getElementById('PlantHealthScoreTrend');
    if (plantHealthScoreEl) {
        safeDestroy(plantHealthScoreEl);
        plantHealthScoreChart = new Chart(plantHealthScoreEl, {
            type: 'line',
            data: {
                labels: plantHealthScoreData[filter].labels,
                datasets: [{
                    label: 'Plant Health Score',
                    data: plantHealthScoreData[filter].values,
                    fill: false,
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Plant Health Score Trend' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: false, max: 100, title: { display: true, text: 'Score' } }
                }
            }
        });
    }

    const aiDetectionConfidenceEl = document.getElementById('AIDetectionConfidence') || document.getElementById('AIDetectionConfidenceTrend');
    if (aiDetectionConfidenceEl) {
        safeDestroy(aiDetectionConfidenceEl);
        aiDetectionConfidenceChart = new Chart(aiDetectionConfidenceEl, {
            type: 'line',
            data: {
                labels: aiDetectionConfidenceData[filter].labels,
                datasets: [{
                    label: 'AI Detection Confidence (%)',
                    data: aiDetectionConfidenceData[filter].values,
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    borderColor: 'rgb(255, 159, 64)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: 'rgb(255, 159, 64)',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'AI Detection Confidence Trend' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: false, max: 100, title: { display: true, text: 'Confidence (%)' } }
                }
            }
        });
    }

    const irrigationEl = document.getElementById('IrrigationActivity') || document.getElementById('IrrigationActivityTrend');
    if (irrigationEl) {
        safeDestroy(irrigationEl);
        irrigationActivityChart = new Chart(irrigationEl, {
            type: 'bar',
            data: {
                labels: irrigationActivityData[filter].labels,
                datasets: [{
                    label: 'Irrigation Events',
                    data: irrigationActivityData[filter].values,
                    backgroundColor: 'rgba(101, 179, 46, 0.4)',
                    borderColor: 'rgb(101, 179, 46)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Irrigation Activity' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Events' } }
                }
            }
        });
    }

    const cropHealthEl = document.getElementById('CropHealthDetection') || document.getElementById('CropHealthDistribution');
    if (cropHealthEl) {
        safeDestroy(cropHealthEl);
        cropHealthChart = new Chart(cropHealthEl, {
            type: 'doughnut',
            data: {
                labels: cropHealthData[filter].labels,
                datasets: [{
                    label: 'Crop Health (%)',
                    data: cropHealthData[filter].values,
                    backgroundColor: cropHealthColors.slice(0, cropHealthData[filter].values.length),
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Crop Health Detection' },
                    legend: { display: true }
                }
            }
        });
    }

    const lastUpdatedEl = document.getElementById('LastUpdated') || document.getElementById('LastUpdatedTrend');
    if (lastUpdatedEl) {
        safeDestroy(lastUpdatedEl);
        lastUpdatedChart = new Chart(lastUpdatedEl, {
            type: 'bar',
            data: {
                labels: lastUpdatedData[filter].labels,
                datasets: [{
                    label: 'Updates Logged',
                    data: lastUpdatedData[filter].values,
                    backgroundColor: 'rgba(153, 102, 255, 0.4)',
                    borderColor: 'rgb(153, 102, 255)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Update Frequency' },
                    legend: { display: true }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Updates' } }
                }
            }
        });
    }
};

export const applyGraphFilter = (filter) => {
    currentFilter = filter;
    renderCharts(filter);
};

export const destroyCharts = () => {
    if (livePollingInterval) {
        clearInterval(livePollingInterval);
        livePollingInterval = null;
    }
    if (soilMoistureChart) { soilMoistureChart.destroy(); soilMoistureChart = null; }
    if (soilTemperatureChart) { soilTemperatureChart.destroy(); soilTemperatureChart = null; }
    if (plantHealthScoreChart) { plantHealthScoreChart.destroy(); plantHealthScoreChart = null; }
    if (aiDetectionConfidenceChart) { aiDetectionConfidenceChart.destroy(); aiDetectionConfidenceChart = null; }
    if (irrigationActivityChart) { irrigationActivityChart.destroy(); irrigationActivityChart = null; }
    if (cropHealthChart) { cropHealthChart.destroy(); cropHealthChart = null; }
    if (lastUpdatedChart) { lastUpdatedChart.destroy(); lastUpdatedChart = null; }
};

export const downloadReport = (type) => {
    const cropHealth = document.getElementById('cropHealth')?.innerText || 'Healthy';
    const plantType = document.getElementById('plantType')?.innerText || 'Tomato (Solanum lycopersicum)';
    const soilMoisture = document.getElementById('soilMoisture')?.innerText || '68%';
    const soilTemp = document.getElementById('soilTemp')?.innerText || '26.5';
    const healthScore = document.getElementById('plantHealthScore')?.innerText || document.getElementById('growthStage')?.innerText || '88/100';
    const diseaseRisk = document.getElementById('diseaseRisk')?.innerText || 'LOW';
    const nutrientStatus = document.getElementById('nutrientStatus')?.innerText || 'Balanced';
    const lastUpdated = document.getElementById('lastUpdated')?.innerText || 'Just now';

    const curTemp = document.getElementById('ct1')?.innerText || '27.5';
    const avgTemp = document.getElementById('ct2')?.innerText || '26.8';
    const minTemp = document.getElementById('ct3')?.innerText || '22.0';
    const maxTemp = document.getElementById('ct4')?.innerText || '31.0';

    const curMoist = document.getElementById('ht1')?.innerText || '68.0';
    const avgMoist = document.getElementById('ht2')?.innerText || '66.5';
    const minMoist = document.getElementById('ht3')?.innerText || '55.0';
    const maxMoist = document.getElementById('ht4')?.innerText || '75.0';

    generateExecutiveReport({
        title: 'Plant Pathology & Vegetative Growth Audit Report',
        subtitle: 'Canopy Disease Diagnostics, Soil Moisture Telemetry & Nutrient Status',
        reportType: type,
        systemNode: 'EnviroX Agronomic Node Gamma (Greenhouse Sector 01)',
        alertStatus: diseaseRisk === 'HIGH' ? 'HAZARD / RISK' : 'OPTIMAL',
        kpiMetrics: [
            { label: 'Crop Health Status', value: cropHealth, variant: 'highlight', status: cropHealth, statusLevel: cropHealth.toLowerCase().includes('healthy') ? 'optimal' : 'warning' },
            { label: 'Crop Cultivar / Type', value: plantType, subtext: 'Target Monitored Species' },
            { label: 'Root Zone Soil Moisture', value: soilMoisture, subtext: `Daily Avg: ${avgMoist}% (Min ${minMoist}%, Max ${maxMoist}%)` },
            { label: 'Soil Temperature', value: soilTemp, unit: '°C', subtext: `Daily Avg: ${avgTemp}°C (Min ${minTemp}°C, Max ${maxTemp}°C)` },
            { label: 'Vegetative Health Score', value: `${healthScore}/100`, subtext: 'Composite AI Chlorophyll & Growth Index' },
            { label: 'Pathology Disease Risk', value: diseaseRisk, subtext: 'MobileNetV3 Neural Inference Risk Level' },
            { label: 'Macro/Micro Nutrients', value: nutrientStatus, subtext: 'N-P-K Visual Matrix Assessment' },
            { label: 'Telemetry Synchronization', value: lastUpdated, subtext: 'Live Sensor Polling Cycle' }
        ],
        chartConfigs: [
            { canvasId: 'SoilMoistureTrend', title: 'Soil Moisture Dynamic Progression (%)', description: 'Continuous volumetric root zone moisture curve' },
            { canvasId: 'SoilTemperature', title: 'Soil & Root Zone Temperature (°C)', description: 'Thermal sensor telemetry for rhizosphere health' },
            { canvasId: 'PlantHealthScore', title: 'Vegetative Vigor & Health Index Score (0-100)', description: 'Composite plant vitality index' },
            { canvasId: 'AIDetectionConfidence', title: 'AI Pathology Inference Confidence (%)', description: 'Deep learning diagnostic certainty tracking' },
            { canvasId: 'IrrigationActivity', title: 'Automated Drip Irrigation Cycling', description: 'Precision solenoid valve actuation history' },
            { canvasId: 'CropHealthDetection', title: 'Pathology Anomaly & Disease Severity Profile', description: 'Phenotyping and lesion distribution metrics' }
        ],
        telemetryRows: [
            { parameter: 'Volumetric Soil Moisture (Capacitive V1.2)', recordedValue: soilMoisture, benchmark: '60.0 - 75.0 %', status: 'Optimal', notes: 'Adequate hydration; prevents wilting and waterlogging' },
            { parameter: 'Rhizosphere Soil Temperature (DS18B20)', recordedValue: `${soilTemp} °C`, benchmark: '22.0 - 28.0 °C', status: 'Optimal', notes: `Daily min: ${minTemp}°C, max: ${maxTemp}°C` },
            { parameter: 'Pathology Risk & Severity Index', recordedValue: diseaseRisk, benchmark: 'LOW / NONE', status: diseaseRisk.toLowerCase() === 'low' ? 'Optimal' : 'Warning', notes: 'Neural vision scan shows healthy canopy architecture' },
            { parameter: 'Composite Growth & Vigor Score', recordedValue: `${healthScore} / 100`, benchmark: '> 80 / 100', status: 'Optimal', notes: 'Normal internode elongation and leaf expansion' },
            { parameter: 'Nutrient Deficiency Profile', recordedValue: nutrientStatus, benchmark: 'Balanced N-P-K', status: 'Optimal', notes: 'No acute nitrogen, phosphorus, or potassium chlorosis' }
        ],
        recommendations: plantRecommendations && plantRecommendations.length > 0 ? plantRecommendations : [
            'Maintain current automated soil moisture threshold (target 65-70%).',
            'Canopy leaf pigmentation indicates optimal chlorophyll synthesis.',
            'Continue routine bio-fertilizer Jeevamrut application during next fertigation cycle.'
        ]
    });
};

export const triggerPlantInference = async (options = {}) => {
    try {
        const response = await fetch('/api/ai/predict/disease', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        const result = await response.json();
        if (result.status === 'success' && result.prediction) {
            const pred = result.prediction;
            updatePlantOverviewDOM({
                crop_health_status: pred.disease_risk === 'LOW' ? 'Healthy' : 'At Risk',
                growth_stage: pred.growth_stage,
                disease_risk: pred.disease_risk,
                health_index: pred.health_index,
                plant_height_cm: pred.plant_height_cm,
                leaf_count: pred.leaf_count,
                recorded_at: pred.detected_at
            });

            const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            plantHealthScoreData.daily.labels.push(timeLabel);
            plantHealthScoreData.daily.values.push(pred.health_index);
            aiDetectionConfidenceData.daily.labels.push(timeLabel);
            aiDetectionConfidenceData.daily.values.push(pred.confidence_score);

            if (plantHealthScoreData.daily.labels.length > 12) {
                plantHealthScoreData.daily.labels.shift();
                plantHealthScoreData.daily.values.shift();
                aiDetectionConfidenceData.daily.labels.shift();
                aiDetectionConfidenceData.daily.values.shift();
            }
            renderCharts(currentFilter);

            plantEvents.unshift({
                time: timeLabel,
                icon: '',
                title: `${pred.disease_name.toUpperCase()}`,
                level: pred.disease_risk === 'HIGH' ? 'high' : (pred.disease_risk === 'MEDIUM' ? 'medium' : 'positive'),
                details: [
                    `Stage: ${pred.growth_stage}`,
                    `Height: ${pred.plant_height_cm} cm | Leaves: ${pred.leaf_count}`,
                    `Confidence: ${pred.confidence_score}%`,
                    `Advice: ${pred.treatment_advice}`
                ]
            });
            if (plantEvents.length > 8) plantEvents.pop();

            return pred;
        }
    } catch (err) {
        console.warn('Plant inference API fallback:', err);
    }
    return null;
};

export const triggerPumpActuator = async (action = 'ON') => {
    try {
        const res = await fetch('/api/controls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actuator_type: 'water_pump', action })
        });
        return await res.json();
    } catch (err) {
        console.warn('Water pump actuator trigger warning:', err);
        return { status: 'mock_triggered', action };
    }
};

export const fetchESP32Status = async () => {
    try {
        const res = await fetch('/api/esp32/status');
        return await res.json();
    } catch (e) {
        return { status: 'offline' };
    }
};

export const connectESP32Serial = async (port = 'COM7') => {
    try {
        const res = await fetch('/api/esp32/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port })
        });
        return await res.json();
    } catch (e) {
        return { status: 'error', message: e.message };
    }
};

export const NUTRIENT_DEFICIENCY_MATRIX = [
    {
        id: "N",
        nutrient: "Nitrogen (N)",
        symbol: "N",
        category: "Primary Macronutrient",
        badgeColor: "#15803d",
        primary_symptoms: "General chlorosis / yellowing starting on older bottom leaves; stunted thin stems and slow vegetative growth.",
        organic_remedy: "Apply fermented Jeevamrut (100 L/acre), vermicompost slurry, or Neem cake powder around root zone.",
        mineral_remedy: "Foliar spray of 1-2% Urea or Calcium Ammonium Nitrate (CAN) during vegetative stage.",
        cost_effective_tip: "Neem-coated urea slows nitrogen volatilization and leaching by 25% under heavy rains.",
        advisory_hi: "पुरानी निचली पत्तियों का पीला पड़ना। जीवामृत (100 लीटर/एकड़) या 1% यूरिया का छिड़काव करें।",
        advisory_mr: "जुन्या खालच्या पानांचे पिवळे पडणे. जीवामृत किंवा 1% युरिया फवारा."
    },
    {
        id: "P",
        nutrient: "Phosphorus (P)",
        symbol: "P",
        category: "Primary Macronutrient",
        badgeColor: "#7e22ce",
        primary_symptoms: "Dark green leaves turning purplish/bronze on underside and petiole margins; poor root development and delayed flowering.",
        organic_remedy: "Apply Bone Meal, Rock Phosphate, or PSB (Phosphate Solubilizing Bacteria bio-fertilizer).",
        mineral_remedy: "Single Super Phosphate (SSP) or Di-Ammonium Phosphate (DAP 2-3 g/L foliar).",
        cost_effective_tip: "Inoculate seedling roots with VAM (Mycorrhiza) to multiply phosphorus absorption in red/laterite soils.",
        advisory_hi: "पत्तियों के नीचे बैंगनी रंग आना व कमजोर जड़ें। रॉक फॉस्फेट या डीएपी का प्रयोग करें।",
        advisory_mr: "पानांच्या खाली जांभळा रंग येणे व मुळांची कमजोर वाढ. सिंगल सुपर फॉस्फेट किंवा डीएपी वापरा."
    },
    {
        id: "K",
        nutrient: "Potassium (K)",
        symbol: "K",
        category: "Primary Macronutrient",
        badgeColor: "#b45309",
        primary_symptoms: "Marginal necrosis and scorching on leaf tips of older leaves; weak lodging stems and reduced drought/disease resistance.",
        organic_remedy: "Apply sifted hardwood Wood Ash (50 kg/acre) or fermented banana peel extract.",
        mineral_remedy: "Spray Potassium Sulfate (0:0:50 at 5 g/L) or Muriate of Potash (MOP).",
        cost_effective_tip: "Wood ash provides 5-7% natural bio-potassium and corrects acidic soil pH at zero input cost.",
        advisory_hi: "पत्तियों के किनारों का झुलसना। लकड़ी की राख या पोटैशियम सल्फेट (0:0:50) का छिड़काव करें।",
        advisory_mr: "पानांच्या कडा जळणे व फांद्या कमजोर होणे. लाकडाची राख किंवा पोटॅशियम सल्फेट फवारा."
    },
    {
        id: "Zn",
        nutrient: "Zinc (Zn)",
        symbol: "Zn",
        category: "Essential Micronutrient",
        badgeColor: "#0284c7",
        primary_symptoms: "Interveinal chlorosis/bleaching on middle leaves, rosetting of small leaves, and stunted internodes (Khaira symptom).",
        organic_remedy: "Incorporate zinc-enriched FYM (Farm Yard Manure) incubated for 30 days.",
        mineral_remedy: "Foliar spray of 0.5% Zinc Sulfate (ZnSO4) + 0.25% slaked lime to prevent leaf scorching.",
        cost_effective_tip: "Soil application of 25 kg/ha Zinc Sulfate once every 2 years provides complete protection.",
        advisory_hi: "पत्तियों के बीच में सफेद धारियां व छोटी पत्तियां। 0.5% जिंक सल्फेट + चूना का छिड़काव करें।",
        advisory_mr: "पानांवर पांढऱ्या पट्टे व खुंटलेली पाने. 0.5% झिंक सल्फेट फवारा."
    },
    {
        id: "Fe",
        nutrient: "Iron (Fe)",
        symbol: "Fe",
        category: "Essential Micronutrient",
        badgeColor: "#dc2626",
        primary_symptoms: "Severe interveinal chlorosis on the newest young leaves; veins remain dark green while leaf blade turns ivory-white.",
        organic_remedy: "Acidify alkaline soils with organic compost / sour buttermilk (Chaach) spray.",
        mineral_remedy: "Foliar spray of 0.5% Ferrous Sulfate (FeSO4) + 0.1% Citric acid or Fe-EDDHA (chelated iron 1 g/L).",
        cost_effective_tip: "Adding citric acid prevents iron oxidation and increases leaf absorption by 40%.",
        advisory_hi: "नई कोमल पत्तियों का सफेद-पीला होना। 0.5% फेरस सल्फेट + सिट्रिक एसिड का छिड़काव करें।",
        advisory_mr: "नवीन कोवळ्या पानांचे पांढरे-पिवळे पडणे. 0.5% फेरस सल्फेट फवारा."
    },
    {
        id: "Mg",
        nutrient: "Magnesium (Mg)",
        symbol: "Mg",
        category: "Secondary Macronutrient",
        badgeColor: "#059669",
        primary_symptoms: "Interveinal chlorosis starting from leaf margins inward; inverted V-shaped green area along midrib.",
        organic_remedy: "Apply Dolomitic limestone to acidic soils; spray sea-weed liquid extract.",
        mineral_remedy: "Foliar spray of Magnesium Sulfate (Epsom Salt at 2-3 g/L water).",
        cost_effective_tip: "Epsom salt rapidly restores green chlorophyll synthesis within 48-72 hours.",
        advisory_hi: "पत्तियों के किनारों से अंदर की ओर पीलापन। मैग्नीशियम सल्फेट (एप्सम सॉल्ट 2 ग्राम/लीटर) का छिड़काव करें।",
        advisory_mr: "पानांच्या कडांपासून आत पिवळेपणा. मॅग्नेशियम सल्फेट (एप्सम सॉल्ट) फवारा."
    }
];

export const evaluateWaterloggingRisk = (rainDetected = false, soilMoisture = 60.0) => {
    const isRaining = Boolean(rainDetected);
    const moisture = Number(soilMoisture);

    let floodRisk = "NONE";
    let alertTitle = "SOIL DRAINAGE OPTIMAL";
    let advisoryEn = "Root zone moisture capacity is balanced. Normal root aeration maintained.";
    let advisoryHi = "जड़ों की नमी संतुलित है। सामान्य वायु संचार बना हुआ है।";
    let advisoryMr = "मुळांमधील ओलावा संतुलित आहे. सामान्य हवा खेळती आहे.";
    let pumpAction = "OFF";

    if (isRaining && moisture >= 80.0) {
        floodRisk = "CRITICAL";
        alertTitle = "ROOT WATERLOGGING & FLOOD RISK ALERT";
        advisoryEn = "Active monsoon precipitation combined with soil saturation (>80%). Extreme risk of root asphyxiation and fungal rot. Engage field drainage pumps immediately and suspend fertigation.";
        advisoryHi = "भारी बारिश और अत्यधिक मिट्टी की नमी (>80%)। जड़ों के सड़ने और फफूंद का भारी खतरा। तुरंत जल निकासी पंप चलाएं।";
        advisoryMr = "अतिवृष्टी आणि जमिनीतील अतिरिक्त ओलावा (>80%). मुळांना ऑक्सिजनची कमतरता व बुरशीचा तीव्र धोका. शेतातील पाण्याचा निचरा करा.";
        pumpAction = "DRAINAGE_ON";
    } else if (isRaining || moisture > 85.0) {
        floodRisk = "MODERATE";
        alertTitle = "HIGH SOIL SATURATION ADVISORY";
        advisoryEn = "Soil moisture is elevated (>85%). Suspend automated irrigation and monitor drainage channels.";
        advisoryHi = "मिट्टी में नमी अधिक है (>85%)। स्वचालित सिंचाई रोकें और जल निकासी रास्तों की निगरानी करें।";
        advisoryMr = "जमिनीत ओलावा जास्त आहे (>85%). पाणी देणे थांबवा आणि पाण्याचा निचरा तपासा.";
        pumpAction = "STANDBY";
    }

    return {
        timestamp: new Date().toISOString(),
        flood_risk_level: floodRisk,
        alert_title: alertTitle,
        soil_moisture_percent: moisture,
        rain_detected: isRaining,
        recommended_pump_action: pumpAction,
        advisory: {
            en: advisoryEn,
            hi: advisoryHi,
            mr: advisoryMr
        }
    };
};