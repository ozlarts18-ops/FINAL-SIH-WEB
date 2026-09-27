import { Chart, registerables } from 'chart.js';
import {
    fetchWaterQualityLogs,
    fetchSoilMoistureLogs,
    fetchLightIntensityLogs,
    fetchSystemEvents,
    fetchRecommendations
} from '../api/dataService';
import { generateExecutiveReport } from '../utils/reportGenerator';

const emptyStatePlugin = {
    id: 'emptyState',
    afterDraw(chart) {
        const { datasets } = chart.data;
        const hasData = datasets && datasets.some(ds => ds.data && ds.data.length > 0 && ds.data.some(v => v !== null && v !== undefined && !isNaN(v)));
        if (!hasData) {
            const { ctx, width, height } = chart;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#64748b';
            ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const isHi = (localStorage.getItem('envirox_language') || 'en') === 'hi';
            ctx.fillText(isHi ? 'कोई डेटा उपलब्ध नहीं है' : 'NO DATA AVAILABLE', width / 2, height / 2);
            ctx.restore();
        }
    }
};

Chart.register(...registerables, emptyStatePlugin);

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

const safeFormatTime = (ts) => {
    if (!ts) return null;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

        const getDocTime = (d) => d?.recorded_at || d?.detected_at || d?.event_time || d?.created_at || d?.last_synced_at || d?.updated_at;

        if (waterRes.status === 'fulfilled' && waterRes.value.data?.length > 0) {
            const rawData = waterRes.value.data.slice().reverse();
            console.log(`[Water Quality Data] Loaded ${rawData.length} records from: ${waterRes.value.source}`);
            const validRecords = rawData.filter(d => d && getDocTime(d));
            const labels = validRecords.map((d, i) => safeFormatTime(getDocTime(d)) || `Log #${i + 1}`);

            const phVals = validRecords.map(d => Number(d.current_ph ?? d.ph ?? d.ph_level ?? 7.0));
            const tdsVals = validRecords.map(d => Number(d.tds_ppm ?? d.tds ?? d.current_tds ?? 650));
            const turbVals = validRecords.map(d => Number(d.turbidity_ntu ?? d.turbidity ?? d.turb ?? d.current_turbidity ?? 2.5));
            const wTempVals = validRecords.map(d => Number(d.current_water_temp ?? 24.5));
            const tankVals = validRecords.map(d => Number(d.water_tank_level_percent ?? 78));
            const pumpVals = validRecords.map(d => (d.pump_status === 'ON' ? 25 : 0));
            const scoreVals = validRecords.map(d => {
                const ph = Number(d.current_ph ?? 7);
                const tds = Number(d.tds_ppm ?? 600);
                let score = 100;
                if (ph < 6.5 || ph > 7.5) score -= 10;
                if (tds > 800) score -= 15;
                return Math.max(50, score);
            });

            if (labels.length > 0) {
                phData.daily = { labels, values: phVals };
                tdsData.daily = { labels, values: tdsVals };
                turbidityData.daily = { labels, values: turbVals };
                waterTempData.daily = { labels, values: wTempVals };
                waterTankData.daily = { labels, values: tankVals };
                pumpActivityData.daily = { labels, values: pumpVals };
                waterQualityScoreData.daily = { labels, values: scoreVals };

                phData.weekly = { labels: labels.slice(-7), values: phVals.slice(-7) };
                phData.monthly = { labels: labels.slice(-30), values: phVals.slice(-30) };
                tdsData.weekly = { labels: labels.slice(-7), values: tdsVals.slice(-7) };
                tdsData.monthly = { labels: labels.slice(-30), values: tdsVals.slice(-30) };
                turbidityData.weekly = { labels: labels.slice(-7), values: turbVals.slice(-7) };
                turbidityData.monthly = { labels: labels.slice(-30), values: turbVals.slice(-30) };
                waterTempData.weekly = { labels: labels.slice(-7), values: wTempVals.slice(-7) };
                waterTempData.monthly = { labels: labels.slice(-30), values: wTempVals.slice(-30) };
                waterTankData.weekly = { labels: labels.slice(-7), values: tankVals.slice(-7) };
                waterTankData.monthly = { labels: labels.slice(-30), values: tankVals.slice(-30) };
            }

            const latest = validRecords[validRecords.length - 1] || rawData[rawData.length - 1];
            updateWaterOverviewDOM(latest);
        }

        if (eventsRes.status === 'fulfilled' && eventsRes.value.data?.length > 0) {
            waterEvents = eventsRes.value.data.map(ev => ({
                time: safeFormatTime(getDocTime(ev)) || '08:30 AM',
                icon: '',
                title: ev.title || 'WATER EVENT',
                level: ev.event_level || 'low',
                details: Array.isArray(ev.details) ? ev.details : []
            }));
        }

        if (recsRes.status === 'fulfilled' && recsRes.value.data?.length > 0) {
            waterRecommendations = recsRes.value.data.map(r => r.recommendation_text || r);
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

    if (latest.water_status) setElem('st', latest.water_status);
    if (latest.current_ph) setElem('phl', latest.current_ph);
    if (latest.tds_ppm) setElem('tds', latest.tds_ppm);
    if (latest.turbidity_ntu) setElem('wt', latest.turbidity_ntu);
    if (latest.water_tank_level_percent) setElem('tl', `${latest.water_tank_level_percent}%`);
    if (latest.pump_status) {
        setElem('ps', latest.pump_status);
        setElem('exf', latest.pump_status);
    }
    if (latest.current_water_temp) setElem('ct1', latest.current_water_temp);
    if (latest.avg_water_temp) setElem('ct2', latest.avg_water_temp);
    if (latest.min_water_temp) setElem('ct3', latest.min_water_temp);
    if (latest.max_water_temp) setElem('ct4', latest.max_water_temp);
    if (latest.current_ph) setElem('ht1', latest.current_ph);
    if (latest.avg_ph) setElem('ht2', latest.avg_ph);
    if (latest.min_ph) setElem('ht3', latest.min_ph);
    if (latest.max_ph) setElem('ht4', latest.max_ph);
    if (latest.recorded_at) {
        const safeTs = safeFormatTime(latest.recorded_at);
        if (safeTs) setElem('lastUpdatedText', safeTs);
    }
};

export const initCharts = async () => {
    await syncWaterDataFromSupabase();
    renderCharts(currentFilter);
};

const renderCharts = (timeframe = 'daily') => {

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

    const curTds = document.getElementById('ct1')?.innerText || tds;
    const avgTds = document.getElementById('ct2')?.innerText || tds;
    const minTds = document.getElementById('ct3')?.innerText || '380';
    const maxTds = document.getElementById('ct4')?.innerText || '510';

    const curTurb = document.getElementById('tt1')?.innerText || turbidity;
    const avgTurb = document.getElementById('tt2')?.innerText || turbidity;
    const minTurb = document.getElementById('tt3')?.innerText || '1.0';
    const maxTurb = document.getElementById('tt4')?.innerText || '4.5';

    const curPh = document.getElementById('ht1')?.innerText || ph;
    const avgPh = document.getElementById('ht2')?.innerText || '7.0';
    const minPh = document.getElementById('ht3')?.innerText || '6.5';
    const maxPh = document.getElementById('ht4')?.innerText || '7.3';

    generateExecutiveReport({
        title: 'Water Quality & Irrigation Dynamics Report',
        subtitle: 'Hydro-Chemistry Analytics, Drip Telemetry & Nutrient Solution Quality',
        reportType: type,
        systemNode: 'IOTrex Hydro Node (Irrigation Reservoir)',
        alertStatus: statusText,
        kpiMetrics: [
            { label: 'Water System Status', value: statusText, variant: 'highlight', status: statusText, statusLevel: statusText.toLowerCase() === 'optimal' ? 'optimal' : 'warning' },
            { label: 'pH Balance Index', value: curPh, subtext: `Stability Range: ${minPh} - ${maxPh} (Avg: ${avgPh})` },
            { label: 'Total Dissolved Solids (TDS)', value: `${curTds} ppm`, subtext: `Avg: ${avgTds} ppm (Min: ${minTds}, Max: ${maxTds})` },
            { label: 'Turbidity (Clarity)', value: `${curTurb} NTU`, subtext: `Avg: ${avgTurb} NTU (Min: ${minTurb}, Max: ${maxTurb})` },
            { label: 'Reservoir Level', value: tankLevel, subtext: 'Continuous Hydrostatic Gauge' },
            { label: 'Irrigation Drip Pump', value: pumpStatus, subtext: 'Active Pressure Flow Actuator' },
            { label: 'Water Quality Index', value: score, subtext: 'Composite Hydro-Safety Metric' }
        ],
        chartConfigs: [
            { canvasId: 'PHTrend', title: 'pH Balance & Chemical Stability', description: 'Real-time potentiometric pH sensor telemetry' },
            { canvasId: 'TDSTrend', title: 'Total Dissolved Solids (TDS ppm)', description: 'Electrical conductivity & mineral salinity curve' },
            { canvasId: 'TurbidityTrend', title: 'Water Turbidity & Suspended Solids (NTU)', description: 'Optical nephelometric turbidity index' },
            { canvasId: 'WaterQualityScore', title: 'Composite Water Quality Score (0-100)', description: 'Agronomic irrigation suitability index' },
            { canvasId: 'WaterTankCapacity', title: 'Reservoir Storage Capacity (%)', description: 'Continuous volumetric tank monitoring' }
        ],
        telemetryRows: [
            { parameter: 'Solution pH Level (Analog Probe)', recordedValue: curPh, benchmark: '6.5 - 7.5', status: 'Optimal', notes: 'Neutral buffer maintained; optimal root uptake' },
            { parameter: 'Total Dissolved Solids (TDS)', recordedValue: `${curTds} ppm`, benchmark: '300 - 1000 ppm', status: 'Optimal', notes: `Avg: ${avgTds} ppm` },
            { parameter: 'Water Turbidity (Optical NTU)', recordedValue: `${curTurb} NTU`, benchmark: '< 5.0 NTU', status: 'Optimal', notes: `Avg: ${avgTurb} NTU` },
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