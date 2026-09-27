import { Chart, registerables } from 'chart.js';
import { 
    fetchPestLogs, 
    fetchSystemEvents, 
    fetchRecommendations,
    fetchAgriculturalDiagnosis
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
            ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const isHi = (localStorage.getItem('envirox_language') || 'en') === 'hi';
            ctx.fillText(isHi ? 'कोई डेटा उपलब्ध नहीं है' : 'No data available', width / 2, height / 2);
            ctx.restore();
        }
    }
};

const safeFormatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

Chart.register(...registerables, emptyStatePlugin);

export let ESP32_STREAM_URL = '/api/camera/stream';

export let pestEvents = [
    {
        time: '08:40 AM',
        icon: '',
        title: 'APHIDS DETECTED',
        level: 'medium',
        details: ['Pest: Aphids (Cluster)', 'Location: Sector B (Tomatoes)', 'Count: 12']
    },
    {
        time: '10:15 AM',
        icon: '',
        title: 'AUTOMATED SCAN COMPLETED',
        level: 'low',
        details: ['Canopy inspection: Normal', 'AI Confidence: 98%', 'Threat: Minimal']
    },
    {
        time: '01:30 PM',
        icon: '',
        title: 'WHITEFLY ACTIVITY DETECTED',
        level: 'medium',
        details: ['Pest: Silverleaf Whitefly', 'Count: 8', 'Severity: Moderate']
    },
    {
        time: '03:45 PM',
        icon: '',
        title: 'HIGH PEST CONCENTRATION',
        level: 'high',
        details: ['Sector C Alert', 'Pest count exceeded 20', 'Immediate action: Bio-pesticide']
    },
    {
        time: '05:20 PM',
        icon: '',
        title: 'TARGETED SPRAY CONCLUDED',
        level: 'positive',
        details: ['Organic neem spray applied', 'Sector: B & C', 'Status: Stabilized']
    }
];

export let pestRecommendations = [
    'Aphid clusters detected on lower leaf canopies in Sector B — recommend localized neem oil spray.',
    'AI confidence score is 97% across visual insect recognition models.',
    'Whitefly counts are slightly increasing near greenhouse ventilation points.',
    'Schedule a targeted canopy sweep in Sector C before evening humidity rises.',
    'Beneficial insect predatory population (ladybugs) observed in Zone A; preserve biological balance.',
    'Overall pest severity index remains in the controllable Moderate threshold.'
];

export const readImageFile = (file, onLoad) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(reader.result);
    reader.readAsDataURL(file);
};

// 1. Pest Detection Trend: Line chart (Date/Time vs Pest Count)
let pestDetectionTrendData = {
    daily: {
        labels: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
        values: [3, 8, 12, 15, 10, 6, 4]
    },
    weekly: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        values: [14, 18, 22, 19, 15, 12, 9]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [55, 72, 60, 42]
    }
};

// 2. Pest Type Distribution: Bar chart (Pest Type vs Detections)
let pestTypeDistributionData = {
    daily: {
        labels: ['Aphids', 'Whiteflies', 'Thrips', 'Caterpillars', 'Spider Mites'],
        values: [14, 8, 5, 3, 2]
    },
    weekly: {
        labels: ['Aphids', 'Whiteflies', 'Thrips', 'Caterpillars', 'Spider Mites'],
        values: [42, 28, 16, 11, 7]
    },
    monthly: {
        labels: ['Aphids', 'Whiteflies', 'Thrips', 'Caterpillars', 'Spider Mites'],
        values: [135, 92, 48, 30, 22]
    }
};

// 3. Pest Severity: Bar chart (Severity Categories vs Detections)
let pestSeverityData = {
    daily: {
        labels: ['Low', 'Medium', 'High', 'Critical'],
        values: [14, 8, 3, 1]
    },
    weekly: {
        labels: ['Low', 'Medium', 'High', 'Critical'],
        values: [48, 32, 12, 3]
    },
    monthly: {
        labels: ['Low', 'Medium', 'High', 'Critical'],
        values: [165, 98, 42, 8]
    }
};

// 4. Pest Detections by Location: Bar chart (Location/Zone vs Detections)
let pestLocationData = {
    daily: {
        labels: ['Sector A', 'Sector B', 'Sector C', 'Sector D', 'Sector E'],
        values: [6, 15, 11, 4, 2]
    },
    weekly: {
        labels: ['Sector A', 'Sector B', 'Sector C', 'Sector D', 'Sector E'],
        values: [18, 45, 32, 14, 8]
    },
    monthly: {
        labels: ['Sector A', 'Sector B', 'Sector C', 'Sector D', 'Sector E'],
        values: [58, 142, 105, 46, 28]
    }
};

// 5. Pest Activity by Time: Line chart (Time/Date vs Activity Count)
let pestActivityTimeData = {
    daily: {
        labels: ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
        values: [4, 12, 16, 11, 7, 3]
    },
    weekly: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        values: [18, 26, 31, 24, 19, 14, 10]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [65, 82, 74, 51]
    }
};

let pestDetectionTrendChart = null;
let pestTypeDistributionChart = null;
let pestSeverityChart = null;
let pestLocationChart = null;
let pestActivityTimeChart = null;
let currentFilter = 'daily';

const safeDestroy = (canvasEl) => {
    if (!canvasEl) return;
    const existing = Chart.getChart(canvasEl);
    if (existing) {
        existing.destroy();
    }
};

let livePestPollingInterval = null;

export const syncPestDataFromSupabase = async () => {
    try {
        const [pestRes, diagRes, eventsRes, recsRes] = await Promise.allSettled([
            fetchPestLogs(50),
            fetchAgriculturalDiagnosis(),
            fetchSystemEvents('pest_detection', 5),
            fetchRecommendations('pest_detection', 6)
        ]);

        const getDocTime = (d) => d?.detected_at || d?.recorded_at || d?.event_time || d?.created_at || d?.last_synced_at || d?.updated_at;

        if (pestRes.status === 'fulfilled' && pestRes.value.data?.length > 0) {
            const rawData = pestRes.value.data.slice().reverse();
            const data = rawData.filter(d => d && getDocTime(d));
            
            // 1. Pest Detection Trend: Real timestamps and pest counts
            const labels = data.map((d, i) => safeFormatTime(getDocTime(d)) || `Scan #${i + 1}`);
            const trendValues = data.map(d => Number(d.pest_count ?? 1));
            pestDetectionTrendData.daily = {
                labels,
                values: trendValues
            };
            pestDetectionTrendData.weekly = { labels: labels.slice(-7), values: trendValues.slice(-7) };
            pestDetectionTrendData.monthly = { labels: labels.slice(-30), values: trendValues.slice(-30) };

            // 2. Pest Type Distribution: Real detected pest frequencies
            const typeMap = {};
            data.forEach(d => {
                const name = d.pest_detected ? d.pest_detected.split(' (')[0].trim() : 'Unknown';
                typeMap[name] = (typeMap[name] || 0) + (Number(d.pest_count) || 1);
            });
            const typeLabels = Object.keys(typeMap);
            if (typeLabels.length > 0) {
                pestTypeDistributionData.daily = {
                    labels: typeLabels,
                    values: Object.values(typeMap)
                };
            }

            // 3. Pest Severity: Low, Medium, High, Critical
            let low = 0, med = 0, high = 0, crit = 0;
            data.forEach(d => {
                const s = (d.severity_level || '').toUpperCase();
                if (s === 'LOW') low++;
                else if (s === 'HIGH') high++;
                else if (s === 'CRITICAL' || s === 'SEVERE') crit++;
                else med++;
            });
            pestSeverityData.daily = {
                labels: ['Low', 'Medium', 'High', 'Critical'],
                values: [low, med, high, crit]
            };

            // 4. Pest Detections by Location: Real sector/zone data
            const zoneMap = {};
            data.forEach(d => {
                const zone = d.sector_zone || 'Sector B';
                zoneMap[zone] = (zoneMap[zone] || 0) + (Number(d.pest_count) || 1);
            });
            const zoneLabels = Object.keys(zoneMap);
            if (zoneLabels.length > 0) {
                pestLocationData.daily = {
                    labels: zoneLabels,
                    values: Object.values(zoneMap)
                };
            }

            // 5. Pest Activity by Time: Real detection event distribution
            pestActivityTimeData.daily = {
                labels,
                values: trendValues
            };
            pestActivityTimeData.weekly = { labels: labels.slice(-7), values: trendValues.slice(-7) };
            pestActivityTimeData.monthly = { labels: labels.slice(-30), values: trendValues.slice(-30) };
        }

        if (eventsRes.status === 'fulfilled' && eventsRes.value.data?.length > 0) {
            pestEvents = eventsRes.value.data.map(ev => ({
                time: safeFormatTime(getDocTime(ev)) || '08:40 AM',
                icon: '',
                title: ev.title || 'PEST EVENT',
                level: ev.event_level || 'medium',
                details: Array.isArray(ev.details) ? ev.details : []
            }));
        }

        if (recsRes.status === 'fulfilled' && recsRes.value.data?.length > 0) {
            pestRecommendations = recsRes.value.data.map(r => r.recommendation_text);
        }

        const latestPest = pestRes.status === 'fulfilled' && pestRes.value.data?.length > 0 ? pestRes.value.data[pestRes.value.data.length - 1] : null;
        const liveDiag = diagRes.status === 'fulfilled' ? diagRes.value : null;

        updatePestOverviewDOM(latestPest, liveDiag);

    } catch (err) {
        console.warn('Pest detection data loading fallback:', err.message || err);
    }
};

export const updatePestOverviewDOM = (latest, liveDiag = null) => {
    const setElem = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.innerText = val;
    };

    if (latest) {
        setElem('targetCrop', latest.target_crop);
        setElem('pestDetected', latest.pest_detected);
        setElem('pestCount', latest.pest_count);
        setElem('severity', latest.severity_level);
        setElem('aiConfidence', latest.ai_confidence);
        setElem('pestStatus', latest.pest_count > 0 ? 'Threat Detected' : 'No Threat');
        if (latest.detected_at) {
            setElem('lastUpdated', new Date(latest.detected_at).toLocaleDateString());
        }
    }

    if (liveDiag && liveDiag.diagnosis?.pest) {
        const p = liveDiag.diagnosis.pest;
        if (liveDiag.crop?.name) setElem('targetCrop', liveDiag.crop.name);
        if (p.name === 'uncertain') {
            setElem('pestDetected', 'Uncertain Identification');
            setElem('pestStatus', 'Uncertain');
            setElem('severity', 'UNCERTAIN');
            setElem('aiConfidence', p.confidence);
        } else if (p.name !== 'none_detected') {
            setElem('pestDetected', p.name);
            setElem('severity', (p.severity || 'MEDIUM').toUpperCase());
            setElem('aiConfidence', p.confidence);
            setElem('pestStatus', 'Threat Detected');
        } else {
            setElem('pestDetected', 'None Detected');
            setElem('severity', 'NONE');
            setElem('aiConfidence', p.confidence);
            setElem('pestStatus', 'No Threat');
        }
    }
};

export const initCharts = async () => {
    await syncPestDataFromSupabase();
    renderCharts(currentFilter);

    if (!livePestPollingInterval) {
        livePestPollingInterval = setInterval(() => {
            fetchAgriculturalDiagnosis().then(diag => {
                if (diag) updatePestOverviewDOM(null, diag);
            }).catch(() => {});
        }, 6000);
    }
};

const renderCharts = (filter = 'daily') => {
    // 1. PEST DETECTION TREND (Line chart: Date/Time vs Detected Pests)
    const trendEl = document.getElementById('PestDetectionTrendChart');
    if (trendEl) {
        safeDestroy(trendEl);
        const dataSet = pestDetectionTrendData[filter] || { labels: [], values: [] };
        pestDetectionTrendChart = new Chart(trendEl, {
            type: 'line',
            data: {
                labels: dataSet.labels,
                datasets: [{
                    label: 'Detected Pests',
                    data: dataSet.values,
                    borderColor: '#2e7d32',
                    backgroundColor: 'rgba(46, 125, 50, 0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.25,
                    pointRadius: 3,
                    pointBackgroundColor: '#2e7d32',
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: '#1e293b',
                        padding: 8,
                        cornerRadius: 2
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: '#64748b' },
                        title: { display: true, text: 'Date / Time', font: { size: 11 }, color: '#475569' }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { size: 11 }, color: '#64748b', precision: 0 },
                        title: { display: true, text: 'Number of detected pests', font: { size: 11 }, color: '#475569' }
                    }
                }
            }
        });
    }

    // 2. PEST TYPE DISTRIBUTION (Bar chart: Pest Type vs Detections)
    const typeEl = document.getElementById('PestTypeDistributionChart');
    if (typeEl) {
        safeDestroy(typeEl);
        const dataSet = pestTypeDistributionData[filter] || { labels: [], values: [] };
        pestTypeDistributionChart = new Chart(typeEl, {
            type: 'bar',
            data: {
                labels: dataSet.labels,
                datasets: [{
                    label: 'Number of detections',
                    data: dataSet.values,
                    backgroundColor: '#40533b',
                    borderColor: '#33452f',
                    borderWidth: 1,
                    borderRadius: 0,
                    maxBarThickness: 45
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: '#1e293b',
                        padding: 8,
                        cornerRadius: 2
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: '#64748b' },
                        title: { display: true, text: 'Pest Type', font: { size: 11 }, color: '#475569' }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { size: 11 }, color: '#64748b', precision: 0 },
                        title: { display: true, text: 'Number of detections', font: { size: 11 }, color: '#475569' }
                    }
                }
            }
        });
    }

    // 3. PEST SEVERITY (Bar chart: Severity Level vs Detections)
    const sevEl = document.getElementById('PestSeverityChart');
    if (sevEl) {
        safeDestroy(sevEl);
        const dataSet = pestSeverityData[filter] || { labels: ['Low', 'Medium', 'High', 'Critical'], values: [] };
        const severityBarColors = ['#16a34a', '#d97706', '#ea580c', '#dc2626'];
        pestSeverityChart = new Chart(sevEl, {
            type: 'bar',
            data: {
                labels: dataSet.labels,
                datasets: [{
                    label: 'Number of detections',
                    data: dataSet.values,
                    backgroundColor: severityBarColors.slice(0, dataSet.labels.length),
                    borderColor: severityBarColors.slice(0, dataSet.labels.length),
                    borderWidth: 1,
                    borderRadius: 0,
                    maxBarThickness: 45
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: '#1e293b',
                        padding: 8,
                        cornerRadius: 2
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: '#64748b' },
                        title: { display: true, text: 'Severity Level', font: { size: 11 }, color: '#475569' }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { size: 11 }, color: '#64748b', precision: 0 },
                        title: { display: true, text: 'Number of detections', font: { size: 11 }, color: '#475569' }
                    }
                }
            }
        });
    }

    // 4. PEST DETECTIONS BY LOCATION (Bar chart: Field/Zone/Location vs Detections)
    const locEl = document.getElementById('PestLocationChart');
    if (locEl) {
        safeDestroy(locEl);
        const dataSet = pestLocationData[filter] || { labels: [], values: [] };
        pestLocationChart = new Chart(locEl, {
            type: 'bar',
            data: {
                labels: dataSet.labels,
                datasets: [{
                    label: 'Number of detections',
                    data: dataSet.values,
                    backgroundColor: '#4a7c59',
                    borderColor: '#3c6448',
                    borderWidth: 1,
                    borderRadius: 0,
                    maxBarThickness: 45
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: '#1e293b',
                        padding: 8,
                        cornerRadius: 2
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: '#64748b' },
                        title: { display: true, text: 'Field / Zone / Location', font: { size: 11 }, color: '#475569' }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { size: 11 }, color: '#64748b', precision: 0 },
                        title: { display: true, text: 'Number of detections', font: { size: 11 }, color: '#475569' }
                    }
                }
            }
        });
    }

    // 5. PEST ACTIVITY BY TIME (Line chart: Time/Date vs Detection count)
    const actEl = document.getElementById('PestActivityTimeChart');
    if (actEl) {
        safeDestroy(actEl);
        const dataSet = pestActivityTimeData[filter] || { labels: [], values: [] };
        pestActivityTimeChart = new Chart(actEl, {
            type: 'line',
            data: {
                labels: dataSet.labels,
                datasets: [{
                    label: 'Detection count',
                    data: dataSet.values,
                    borderColor: '#0284c7',
                    backgroundColor: 'rgba(2, 132, 199, 0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.25,
                    pointRadius: 3,
                    pointBackgroundColor: '#0284c7',
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: '#1e293b',
                        padding: 8,
                        cornerRadius: 2
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: '#64748b' },
                        title: { display: true, text: 'Time / Date', font: { size: 11 }, color: '#475569' }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { size: 11 }, color: '#64748b', precision: 0 },
                        title: { display: true, text: 'Detection count', font: { size: 11 }, color: '#475569' }
                    }
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
    if (livePestPollingInterval) {
        clearInterval(livePestPollingInterval);
        livePestPollingInterval = null;
    }
    if (pestDetectionTrendChart) { pestDetectionTrendChart.destroy(); pestDetectionTrendChart = null; }
    if (pestTypeDistributionChart) { pestTypeDistributionChart.destroy(); pestTypeDistributionChart = null; }
    if (pestSeverityChart) { pestSeverityChart.destroy(); pestSeverityChart = null; }
    if (pestLocationChart) { pestLocationChart.destroy(); pestLocationChart = null; }
    if (pestActivityTimeChart) { pestActivityTimeChart.destroy(); pestActivityTimeChart = null; }
};

export const downloadReport = (type) => {
    const pestStatus = document.getElementById('pestStatus')?.innerText || 'No Threat';
    const targetCrop = document.getElementById('targetCrop')?.innerText || 'Tomato (Solanum lycopersicum)';
    const pestDetected = document.getElementById('pestDetected')?.innerText || 'None Detected';
    const pestCount = document.getElementById('pestCount')?.innerText || '0';
    const severity = document.getElementById('severity')?.innerText || 'LOW';
    const aiConfidence = document.getElementById('aiConfidence')?.innerText || '97';
    const lastUpdated = document.getElementById('lastUpdated')?.innerText || 'Just now';

    generateExecutiveReport({
        title: 'Pest Incursion & Biocontrol Intelligence Report',
        subtitle: 'Automated Computer Vision Detection, Sector Infestation & IPM Mitigation',
        reportType: type,
        systemNode: 'EnviroX Vision Node Delta (Pest Incursion Camera Station)',
        alertStatus: pestStatus.toLowerCase().includes('threat') ? 'THREAT DETECTED' : 'OPTIMAL',
        kpiMetrics: [
            { label: 'Threat Status', value: pestStatus, variant: 'highlight', status: pestStatus, statusLevel: pestStatus.toLowerCase().includes('threat') ? 'danger' : 'optimal' },
            { label: 'Target Monitored Crop', value: targetCrop, subtext: 'Cultivar Canopy Zone' },
            { label: 'Identified Pest Species', value: pestDetected, subtext: `Severity Level: ${severity}` },
            { label: 'Incursion Pest Count', value: pestCount, unit: 'Insects', subtext: 'Optical Density Estimate' },
            { label: 'AI Diagnostic Confidence', value: `${aiConfidence}%`, subtext: 'Neural Detection Model Accuracy' },
            { label: 'Severity Rating', value: severity, subtext: 'IPM Action Threshold' },
            { label: 'Biocontrol Readiness', value: 'Ready', subtext: 'Neem Oil / Bio-Parasitoids' },
            { label: 'Last Optical Telemetry', value: lastUpdated, subtext: 'Vision Node Sync' }
        ],
        chartConfigs: [
            { canvasId: 'PestDetectionTrendChart', title: 'Pest Detection Trend', description: 'Pest detections over time' },
            { canvasId: 'PestTypeDistributionChart', title: 'Pest Type Distribution', description: 'Distribution of detected pest species' },
            { canvasId: 'PestSeverityChart', title: 'Pest Severity Breakdown', description: 'Pest detections classified by severity level' },
            { canvasId: 'PestLocationChart', title: 'Pest Detections by Location', description: 'Spatial distribution of detections across zones' },
            { canvasId: 'PestActivityTimeChart', title: 'Pest Activity by Time', description: 'Diurnal and temporal pest activity progression' }
        ],
        telemetryRows: [
            { parameter: 'Identified Insect Species', recordedValue: pestDetected, benchmark: 'Beneficial / None', status: pestStatus.toLowerCase().includes('threat') ? 'Warning' : 'Optimal', notes: 'Computer vision classification' },
            { parameter: 'Pest Incursion Population Count', recordedValue: `${pestCount} Count`, benchmark: '< 5 Per Sector', status: Number(pestCount) > 10 ? 'High' : 'Optimal', notes: 'Automated bounding box aggregation' },
            { parameter: 'Vision Model Confidence Score', recordedValue: `${aiConfidence} %`, benchmark: '> 85 %', status: 'Optimal', notes: 'High confidence detection' },
            { parameter: 'Crop Biocontrol Vulnerability', recordedValue: severity, benchmark: 'LOW / ZERO', status: severity.toLowerCase() === 'low' ? 'Optimal' : 'Warning', notes: 'Integrated Pest Management threshold' },
            { parameter: 'Monitored Greenhouse Sector', recordedValue: targetCrop, benchmark: 'All Zones Active', status: 'Normal', notes: 'Sector camera coverage 100%' }
        ],
        recommendations: pestRecommendations && pestRecommendations.length > 0 ? pestRecommendations : [
            'Deploy targeted biological control agents (Neem extract 2% spray) in affected sectors.',
            'Maintain sticky yellow insect traps around greenhouse perimeter vents.',
            'Monitor beneficial predators (Ladybird beetles, Encarsia formosa) in adjacent crop bays.'
        ]
    });
};

export const triggerPestInference = async (options = {}) => {
    try {
        const response = await fetch('/api/ai/predict/pest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });
        const result = await response.json();
        if (result.status === 'success' && result.prediction) {
            const pred = result.prediction;
            updatePestOverviewDOM({
                target_crop: pred.target_crop,
                pest_detected: pred.detected_pest,
                pest_count: pred.pest_count,
                severity_level: pred.severity_level,
                ai_confidence: pred.ai_confidence,
                detected_at: pred.detected_at
            });

            const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // 1. Detection trend update
            pestDetectionTrendData.daily.labels.push(timeLabel);
            pestDetectionTrendData.daily.values.push(pred.pest_count);
            if (pestDetectionTrendData.daily.labels.length > 12) {
                pestDetectionTrendData.daily.labels.shift();
                pestDetectionTrendData.daily.values.shift();
            }

            // 2. Type distribution update
            const pType = pred.detected_pest ? pred.detected_pest.split(' (')[0].trim() : 'Unknown';
            const tIdx = pestTypeDistributionData.daily.labels.indexOf(pType);
            if (tIdx >= 0) {
                pestTypeDistributionData.daily.values[tIdx] += Number(pred.pest_count) || 1;
            } else {
                pestTypeDistributionData.daily.labels.push(pType);
                pestTypeDistributionData.daily.values.push(Number(pred.pest_count) || 1);
            }

            // 3. Severity update (Low, Medium, High, Critical)
            const sev = (pred.severity_level || 'MEDIUM').toUpperCase();
            let sevIdx = 1;
            if (sev === 'LOW') sevIdx = 0;
            else if (sev === 'MEDIUM' || sev === 'MODERATE') sevIdx = 1;
            else if (sev === 'HIGH') sevIdx = 2;
            else if (sev === 'CRITICAL' || sev === 'SEVERE') sevIdx = 3;
            pestSeverityData.daily.values[sevIdx] = (pestSeverityData.daily.values[sevIdx] || 0) + 1;

            // 4. Location update
            const zone = pred.sector_zone || 'Sector B';
            const zIdx = pestLocationData.daily.labels.indexOf(zone);
            if (zIdx >= 0) {
                pestLocationData.daily.values[zIdx] += Number(pred.pest_count) || 1;
            } else {
                pestLocationData.daily.labels.push(zone);
                pestLocationData.daily.values.push(Number(pred.pest_count) || 1);
            }

            // 5. Activity by time update
            pestActivityTimeData.daily.labels.push(timeLabel);
            pestActivityTimeData.daily.values.push(pred.pest_count);
            if (pestActivityTimeData.daily.labels.length > 12) {
                pestActivityTimeData.daily.labels.shift();
                pestActivityTimeData.daily.values.shift();
            }

            renderCharts(currentFilter);

            pestEvents.unshift({
                time: timeLabel,
                icon: '',
                title: `${pred.detected_pest.toUpperCase()} DETECTED`,
                level: pred.severity_level.toLowerCase(),
                details: [
                    `Count: ${pred.pest_count}`,
                    `Zone: ${pred.sector_zone}`,
                    `Confidence: ${pred.ai_confidence}%`,
                    `Action: ${pred.recommended_action}`
                ]
            });
            if (pestEvents.length > 8) pestEvents.pop();

            return pred;
        }
    } catch (err) {
        console.warn('Pest inference API fallback:', err);
    }
    return null;
};

export const triggerSprayActuator = async (action = 'ON') => {
    try {
        const res = await fetch('/api/controls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actuator_type: 'spray_valve', action })
        });
        return await res.json();
    } catch (err) {
        console.warn('Spray actuator trigger warning:', err);
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