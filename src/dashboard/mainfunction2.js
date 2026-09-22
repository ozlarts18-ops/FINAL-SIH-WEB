import { Chart, registerables } from 'chart.js';
import {
    fetchWaterQualityLogs,
    fetchSoilMoistureLogs,
    fetchLightIntensityLogs,
    fetchSystemEvents,
    fetchRecommendations
} from '../api/dataService';
import { generateExecutiveReport } from '../utils/reportGenerator';

Chart.register(...registerables);

export let waterEvents = [
    {
        time: '08:30 AM',
        icon: '',
        title: 'PH STABILIZATION OPTIMAL',
        level: 'low',
        details: ['Current pH: 6.8', 'Ideal Range: 6.5 - 7.5', 'Buffer: Balanced']
    },
    {
        time: '10:15 AM',
        icon: '',
        title: 'TDS & MINERALS CHECK',
        level: 'low',
        details: ['TDS: 650 ppm', 'Electrical Conductivity: 1.2 mS/cm', 'Status: Optimal']
    },
    {
        time: '01:00 PM',
        icon: '',
        title: 'WATER TANK LEVEL NOTIFICATION',
        level: 'medium',
        details: ['Tank Level: 78%', 'Threshold Refill: 40%', 'Auto-Refill: Standby']
    },
    {
        time: '03:45 PM',
        icon: '',
        title: 'TURBIDITY WITHIN SAFE LIMIT',
        level: 'low',
        details: ['Turbidity: 2.5 NTU', 'Filter Status: Clear', 'Micro-filtration: Inactive']
    },
    {
        time: '05:20 PM',
        icon: '',
        title: 'AUTOMATIC IRRIGATION CYCLE',
        level: 'positive',
        details: ['DC Pump: Cycle Complete', 'Duration: 15 Mins', 'Flow Rate: 12 L/min']
    }
];

export let waterRecommendations = [
    'Water pH level is stable at 6.8 — within optimal nutrient absorption range (6.5 - 7.2).',
    'TDS reading is 650 ppm; maintain mineral dosing schedule for root zone health.',
    'Turbidity remains below 3.0 NTU — filtration membrane operating at peak efficiency.',
    'Water temperature average is 24.5°C; optimal for preventing root disease pathogens.',
    'Water tank storage is at 78% capacity; sufficient for 48 hours of autonomous irrigation.',
    'Overall water quality safety index is 92/100 (Optimal Grade A).'
];

let phData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [6.8, 6.9, 7.1, 7.0, 6.8, 6.7, 6.8]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [6.8, 7.0, 6.9, 7.2, 6.8, 6.9, 7.0]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [6.9, 7.0, 6.8, 7.1]
    }
};

let tdsData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [620, 640, 650, 680, 660, 645, 630]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [610, 635, 650, 660, 640, 655, 645]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [625, 645, 650, 640]
    }
};

let turbidityData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [2.1, 2.3, 2.5, 2.8, 2.4, 2.2, 2.0]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [2.0, 2.4, 2.2, 2.6, 2.5, 2.1, 2.3]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [2.2, 2.4, 2.3, 2.1]
    }
};

let waterQualityScoreData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [94, 93, 90, 88, 91, 92, 95]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [92, 90, 94, 91, 89, 93, 95]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [91, 93, 92, 94]
    }
};

let waterTempData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [22.0, 23.5, 25.5, 27.5, 26.8, 24.5, 23.0]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [23.5, 24.0, 25.2, 26.0, 25.5, 24.8, 24.5]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [23.0, 24.5, 25.8, 25.0]
    }
};

let waterTankData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [85, 82, 78, 70, 75, 88, 85]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [88, 82, 85, 76, 80, 84, 86]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [84, 82, 85, 83]
    }
};

let pumpActivityData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [15, 0, 30, 45, 0, 20, 0]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [45, 30, 60, 40, 50, 35, 25]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [220, 250, 210, 240]
    }
};

let phChart = null;
let tdsChart = null;
let turbidityChart = null;
let waterQualityScoreChart = null;
let waterTempChart = null;
let waterTankChart = null;
let pumpActivityChart = null;
let currentFilter = 'daily';

const safeDestroy = (canvasEl) => {
    if (!canvasEl) return;
    const existing = Chart.getChart(canvasEl);
    if (existing) {
        existing.destroy();
    }
};

export const syncWaterDataFromSupabase = async () => {
    try {
        const [waterRes, _soilRes, _lightRes, eventsRes, recsRes] = await Promise.allSettled([
            fetchWaterQualityLogs(50),
            fetchSoilMoistureLogs(50),
            fetchLightIntensityLogs(50),
            fetchSystemEvents('water_quality', 5),
            fetchRecommendations('water_quality', 6)
        ]);

        if (waterRes.status === 'fulfilled' && waterRes.value.data?.length > 0) {
            const data = waterRes.value.data;
            console.log(`[Water Quality Data] Loaded ${data.length} records from: ${waterRes.value.source}`);
            const labels = data.map(d => new Date(d.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

            phData.daily = { labels, values: data.map(d => Number(d.current_ph ?? 7.0)) };
            tdsData.daily = { labels, values: data.map(d => Number(d.tds_ppm ?? 650)) };
            turbidityData.daily = { labels, values: data.map(d => Number(d.turbidity_ntu ?? 2.5)) };
            waterTempData.daily = { labels, values: data.map(d => Number(d.current_water_temp ?? 24.5)) };
            waterTankData.daily = { labels, values: data.map(d => Number(d.water_tank_level_percent ?? 78)) };
            pumpActivityData.daily = { labels, values: data.map(d => (d.pump_status === 'ON' ? 25 : 0)) };
            waterQualityScoreData.daily = {
                labels,
                values: data.map(d => {
                    const ph = Number(d.current_ph ?? 7);
                    const tds = Number(d.tds_ppm ?? 600);
                    let score = 100;
                    if (ph < 6.5 || ph > 7.5) score -= 10;
                    if (tds > 800) score -= 15;
                    return Math.max(50, score);
                })
            };

            const latest = data[data.length - 1];
            updateWaterOverviewDOM(latest);
        }

        if (eventsRes.status === 'fulfilled' && eventsRes.value.data?.length > 0) {
            waterEvents = eventsRes.value.data.map(ev => ({
                time: new Date(ev.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '',
                title: ev.title,
                level: ev.event_level || 'low',
                details: Array.isArray(ev.details) ? ev.details : []
            }));
        }

        if (recsRes.status === 'fulfilled' && recsRes.value.data?.length > 0) {
            waterRecommendations = recsRes.value.data.map(r => r.recommendation_text);
        }
    } catch (err) {
        console.warn('Water quality data loading fallback:', err.message || err);
    }
};

const updateWaterOverviewDOM = (latest) => {
    if (!latest) return;
    const setElem = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.innerText = String(val);
    };

    setElem('st', latest.water_status || 'Optimal');
    setElem('phl', latest.current_ph || '6.8');
    setElem('tds', latest.tds_ppm || '650');
    setElem('wt', latest.turbidity_ntu || '2.5');
    setElem('tl', `${latest.water_tank_level_percent || 78}%`);
    setElem('ps', latest.pump_status || 'OFF');
    setElem('exf', latest.pump_status || 'ON');

    setElem('ct1', latest.current_water_temp || '24.5');
    setElem('ct2', latest.avg_water_temp || '24.8');
    setElem('ct3', latest.min_water_temp || '22.0');
    setElem('ct4', latest.max_water_temp || '27.5');

    setElem('ht1', latest.current_ph || '6.8');
    setElem('ht2', latest.avg_ph || '7.0');
    setElem('ht3', latest.min_ph || '6.5');
    setElem('ht4', latest.max_ph || '7.3');

    setElem('aqs', '92/100');
    if (latest.recorded_at) {
        setElem('lastUpdatedText', new Date(latest.recorded_at).toLocaleString());
    }
};

export const initCharts = async () => {
    await syncWaterDataFromSupabase();
    renderCharts(currentFilter);
};

const renderCharts = (timeframe = 'daily') => {
    destroyCharts();

    const phEl = document.getElementById('PHTrend');
    if (phEl) {
        safeDestroy(phEl);
        phChart = new Chart(phEl, {
            type: 'line',
            data: {
                labels: phData[timeframe]?.labels || phData.daily.labels,
                datasets: [{
                    label: 'pH Level',
                    data: phData[timeframe]?.values || phData.daily.values,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: 'rgb(54, 162, 235)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'pH Level Trend (Optimal: 6.5 - 7.5)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: false, min: 4, max: 10, title: { display: true, text: 'pH' } }
                }
            }
        });
    }

    const tdsEl = document.getElementById('TDSTrend') || document.getElementById('TDS5Trend');
    if (tdsEl) {
        safeDestroy(tdsEl);
        tdsChart = new Chart(tdsEl, {
            type: 'bar',
            data: {
                labels: tdsData[timeframe]?.labels || tdsData.daily.labels,
                datasets: [{
                    label: 'TDS (ppm)',
                    data: tdsData[timeframe]?.values || tdsData.daily.values,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgb(75, 192, 192)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Total Dissolved Solids (TDS)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: true, title: { display: true, text: 'ppm' } }
                }
            }
        });
    }

    const turbEl = document.getElementById('TurbidityTrend');
    if (turbEl) {
        safeDestroy(turbEl);
        turbidityChart = new Chart(turbEl, {
            type: 'line',
            data: {
                labels: turbidityData[timeframe]?.labels || turbidityData.daily.labels,
                datasets: [{
                    label: 'Turbidity (NTU)',
                    data: turbidityData[timeframe]?.values || turbidityData.daily.values,
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    borderColor: 'rgb(255, 159, 64)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Water Turbidity Trend (NTU)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: true, title: { display: true, text: 'NTU' } }
                }
            }
        });
    }

    const scoreEl = document.getElementById('WaterQualityScore') || document.getElementById('WaterTemperatureTrend');
    if (scoreEl) {
        safeDestroy(scoreEl);
        waterQualityScoreChart = new Chart(scoreEl, {
            type: 'line',
            data: {
                labels: waterQualityScoreData[timeframe]?.labels || waterQualityScoreData.daily.labels,
                datasets: [{
                    label: 'Water Quality Score',
                    data: waterQualityScoreData[timeframe]?.values || waterQualityScoreData.daily.values,
                    backgroundColor: 'rgba(101, 179, 46, 0.2)',
                    borderColor: '#65b32e',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#65b32e'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Composite Water Quality Safety Score (0-100)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: true, max: 100, title: { display: true, text: 'Score' } }
                }
            }
        });
    }

    const waterTempEl = document.getElementById('WaterTemperature') || document.getElementById('WaterTankLevel');
    if (waterTempEl) {
        safeDestroy(waterTempEl);
        waterTempChart = new Chart(waterTempEl, {
            type: 'line',
            data: {
                labels: waterTempData[timeframe]?.labels || waterTempData.daily.labels,
                datasets: [{
                    label: 'Water Temp (°C)',
                    data: waterTempData[timeframe]?.values || waterTempData.daily.values,
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    borderColor: 'rgb(153, 102, 255)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Water Temperature Trend (°C)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: false, title: { display: true, text: '°C' } }
                }
            }
        });
    }

    const tankEl = document.getElementById('WaterTankCapacity') || document.getElementById('PumpActivity');
    if (tankEl) {
        safeDestroy(tankEl);
        waterTankChart = new Chart(tankEl, {
            type: 'bar',
            data: {
                labels: waterTankData[timeframe]?.labels || waterTankData.daily.labels,
                datasets: [{
                    label: 'Tank Level (%)',
                    data: waterTankData[timeframe]?.values || waterTankData.daily.values,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Water Tank Level Capacity (%)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: true, max: 100, title: { display: true, text: 'Capacity %' } }
                }
            }
        });
    }

    const pumpEl = document.getElementById('PumpRuntime') || document.getElementById('LastUpdated');
    if (pumpEl) {
        safeDestroy(pumpEl);
        pumpActivityChart = new Chart(pumpEl, {
            type: 'bar',
            data: {
                labels: pumpActivityData[timeframe]?.labels || pumpActivityData.daily.labels,
                datasets: [{
                    label: 'Pump Runtime (Min)',
                    data: pumpActivityData[timeframe]?.values || pumpActivityData.daily.values,
                    backgroundColor: 'rgba(255, 99, 132, 0.6)',
                    borderColor: 'rgb(255, 99, 132)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Irrigation Pump Activity' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Runtime (Min)' } }
                }
            }
        });
    }
};

export const applyGraphFilter = (timeframe) => {
    currentFilter = timeframe;
    renderCharts(timeframe);
};

export const destroyCharts = () => {
    if (phChart) { phChart.destroy(); phChart = null; }
    if (tdsChart) { tdsChart.destroy(); tdsChart = null; }
    if (turbidityChart) { turbidityChart.destroy(); turbidityChart = null; }
    if (waterQualityScoreChart) { waterQualityScoreChart.destroy(); waterQualityScoreChart = null; }
    if (waterTempChart) { waterTempChart.destroy(); waterTempChart = null; }
    if (waterTankChart) { waterTankChart.destroy(); waterTankChart = null; }
    if (pumpActivityChart) { pumpActivityChart.destroy(); pumpActivityChart = null; }
};

export const downloadReport = (type) => {
    const statusText = document.getElementById('st')?.innerText || 'Optimal';
    const ph = document.getElementById('phl')?.innerText || '6.8';
    const tds = document.getElementById('tds')?.innerText || '650';
    const turbidity = document.getElementById('wt')?.innerText || '2.5';
    const tankLevel = document.getElementById('tl')?.innerText || '78%';
    const pumpStatus = document.getElementById('ps')?.innerText || 'OFF';
    const score = document.getElementById('aqs')?.innerText || '92/100';

    const curTemp = document.getElementById('ct1')?.innerText || '24.5';
    const avgTemp = document.getElementById('ct2')?.innerText || '24.8';
    const minTemp = document.getElementById('ct3')?.innerText || '22.0';
    const maxTemp = document.getElementById('ct4')?.innerText || '27.5';

    const curPh = document.getElementById('ht1')?.innerText || '6.8';
    const avgPh = document.getElementById('ht2')?.innerText || '7.0';
    const minPh = document.getElementById('ht3')?.innerText || '6.5';
    const maxPh = document.getElementById('ht4')?.innerText || '7.3';

    generateExecutiveReport({
        title: 'Water Quality & Irrigation Dynamics Report',
        subtitle: 'Hydro-Chemistry Analytics, Drip Telemetry & Nutrient Solution Quality',
        reportType: type,
        systemNode: 'EnviroX Hydro Node Beta (Irrigation Reservoir)',
        alertStatus: statusText,
        kpiMetrics: [
            { label: 'Water System Status', value: statusText, variant: 'highlight', status: statusText, statusLevel: statusText.toLowerCase() === 'optimal' ? 'optimal' : 'warning' },
            { label: 'pH Balance Index', value: ph, subtext: `Stability Range: ${minPh} - ${maxPh} (Avg: ${avgPh})` },
            { label: 'Total Dissolved Solids (TDS)', value: tds, unit: 'ppm', subtext: 'Nutrient & Mineral Salinity Concentration' },
            { label: 'Turbidity (Clarity)', value: turbidity, unit: 'NTU', subtext: 'Suspended Particulate Matter' },
            { label: 'Reservoir Level', value: tankLevel, subtext: 'Continuous Hydrostatic Gauge' },
            { label: 'Irrigation Drip Pump', value: pumpStatus, subtext: 'Active Pressure Flow Actuator' },
            { label: 'Water Quality Index', value: score, subtext: 'Composite Hydro-Safety Metric' },
            { label: 'Water Temperature', value: curTemp, unit: '°C', subtext: `Avg: ${avgTemp}°C (Min ${minTemp}°C, Max ${maxTemp}°C)` }
        ],
        chartConfigs: [
            { canvasId: 'PHTrend', title: 'pH Balance & Chemical Stability', description: 'Real-time potentiometric pH sensor telemetry' },
            { canvasId: 'TDSTrend', title: 'Total Dissolved Solids (TDS ppm)', description: 'Electrical conductivity & mineral salinity curve' },
            { canvasId: 'TurbidityTrend', title: 'Water Turbidity & Suspended Solids (NTU)', description: 'Optical nephelometric turbidity index' },
            { canvasId: 'WaterQualityScore', title: 'Composite Water Quality Score (0-100)', description: 'Agronomic irrigation suitability index' },
            { canvasId: 'WaterTemperature', title: 'Water Temperature Trend (°C)', description: 'Root uptake thermal optimization curve' },
            { canvasId: 'WaterTankCapacity', title: 'Reservoir Storage Capacity (%)', description: 'Continuous volumetric tank monitoring' }
        ],
        telemetryRows: [
            { parameter: 'Solution pH Level (Analog Probe)', recordedValue: ph, benchmark: '6.5 - 7.5', status: 'Optimal', notes: 'Neutral buffer maintained; optimal root uptake' },
            { parameter: 'Total Dissolved Solids (TDS)', recordedValue: `${tds} ppm`, benchmark: '500 - 800 ppm', status: 'Optimal', notes: 'Balanced nutrient ionic concentration' },
            { parameter: 'Water Turbidity (Optical NTU)', recordedValue: `${turbidity} NTU`, benchmark: '< 5.0 NTU', status: 'Optimal', notes: 'Clear water; low risk of emitter clogging' },
            { parameter: 'Water Temperature (Waterproof DS18B20)', recordedValue: `${curTemp} °C`, benchmark: '20.0 - 26.0 °C', status: 'Optimal', notes: `Daily min: ${minTemp}°C, max: ${maxTemp}°C` },
            { parameter: 'Main Reservoir Storage Tank', recordedValue: tankLevel, benchmark: '> 30 %', status: 'Normal', notes: 'Adequate reserve for planned fertigation cycles' },
            { parameter: 'Irrigation Pump Relay (12V/220V)', recordedValue: pumpStatus, benchmark: 'Automated Cycle', status: 'Normal', notes: 'Pressure line standby active' }
        ],
        recommendations: waterRecommendations && waterRecommendations.length > 0 ? waterRecommendations : [
            'Hydroponic and drip reservoir parameters are within optimal nutrient delivery bounds.',
            'Maintain weekly filter backwash to prevent emitter scaling and biofouling.',
            'TDS levels demonstrate consistent mineral replenishment without salt buildup.'
        ]
    });
};