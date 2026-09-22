import { Chart, registerables } from 'chart.js';
import { fetchAirQualityLogs, fetchSystemEvents, fetchRecommendations } from '../api/dataService';
import { generateExecutiveReport } from '../utils/reportGenerator';

Chart.register(...registerables);

export function calculateHeatIndex(tempC, humidity) {
    if (tempC === null || humidity === null || isNaN(tempC) || isNaN(humidity)) return 28.0;
    const T = Number(tempC);
    const R = Number(humidity);
    if (T < 26.7) {
        return Number((0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (R * 0.094))).toFixed(1));
    }
    const Tf = T * 1.8 + 32;
    const hi = -42.379 + 2.04901523 * Tf + 10.14333127 * R - 0.22475541 * Tf * R
             - 0.00683783 * Tf * Tf - 0.05481717 * R * R + 0.00122874 * Tf * Tf * R
             + 0.00085282 * Tf * R * R - 0.00000199 * Tf * Tf * R * R;
    const hiC = (hi - 32) / 1.8;
    return Number(hiC.toFixed(1));
}

export function calculateDewPoint(tempC, humidity) {
    if (tempC === null || humidity === null || isNaN(tempC) || isNaN(humidity) || humidity <= 0) return 20.0;
    const T = Number(tempC);
    const R = Number(humidity);
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * T) / (b + T)) + Math.log(R / 100);
    const dp = (b * alpha) / (a - alpha);
    return Number(dp.toFixed(1));
}

export function calculateVPD(tempC, humidity) {
    if (tempC === null || humidity === null || isNaN(tempC) || isNaN(humidity)) return 1.10;
    const T = Number(tempC);
    const R = Number(humidity);
    const vpSat = 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
    const vpAct = vpSat * (R / 100);
    const vpd = Math.max(0, vpSat - vpAct);
    return Number(vpd.toFixed(2));
}

export function calculateEvapotranspiration(tempC, humidity, lux = 1500, tempMin = 24, tempMax = 34) {
    const T = Number(tempC ?? 28);
    const Tmin = Number(tempMin ?? 24);
    const Tmax = Math.max(Tmin + 2, Number(tempMax ?? 34));
    const RH = Number(humidity ?? 65);
    const L = Number(lux ?? 1500);

    const estimatedSolarMJ = Math.min(28, Math.max(12, (L / 50000) * 22 + 14));
    const Ra_equivalent = estimatedSolarMJ * 0.408;
    const tempRange = Math.max(1.0, Tmax - Tmin);
    let et0 = 0.0023 * (T + 17.8) * Math.sqrt(tempRange) * Ra_equivalent;

    if (RH < 50) et0 *= (1 + (50 - RH) * 0.008);
    else if (RH > 80) et0 *= (1 - (RH - 80) * 0.006);

    et0 = Number(Math.max(1.5, Math.min(9.5, et0)).toFixed(2));
    const prescribedWaterLiters = Number((et0 * 1.15 / 0.90).toFixed(1));
    const recommendedMinutes = Math.round((prescribedWaterLiters / 4.0) * 60);

    let droughtRisk = "LOW";
    if (et0 > 5.5) droughtRisk = "SEVERE";
    else if (et0 > 4.0) droughtRisk = "MODERATE";

    return {
        et0,
        prescribedWaterLiters,
        recommendedMinutes,
        droughtRisk
    };
}

export function evaluateWaterloggingRisk(rainDetected, soilMoisture = 65) {
    const isRaining = Boolean(rainDetected);
    const sm = Number(soilMoisture);

    if (isRaining && sm >= 80) {
        return {
            risk: 'CRITICAL',
            title: 'MONSOON FLOOD & WATERLOGGING ALERT',
            desc: 'Continuous rainfall with root saturation (>80%). Engage drainage pumps to prevent root rot.',
            desc_hi: 'अत्यधिक मिट्टी की नमी (>80%)। जड़ों को सड़ने से बचाने के लिए जल निकासी पंप चलाएं।',
            desc_mr: 'शेतात पाणी साचले आहे (>80%). मुळांना वाचवण्यासाठी ड्रेनेज पंप चालू करा.'
        };
    }
    if (isRaining || sm > 85) {
        return {
            risk: 'MODERATE',
            title: 'SOIL SATURATION ADVISORY',
            desc: 'High moisture level detected. Automated irrigation suspended.',
            desc_hi: 'मिट्टी में अधिक नमी है। स्वचालित सिंचाई रोक दी गई है।',
            desc_mr: 'जमिनीत ओलावा जास्त आहे. सिंचन तात्पुरते स्थगित केले आहे.'
        };
    }
    return {
        risk: 'LOW',
        title: 'SOIL MOISTURE & AERATION NOMINAL',
        desc: 'Root-zone moisture is balanced for optimal nutrient uptake.',
        desc_hi: 'जड़ क्षेत्र की नमी पोषण के लिए सर्वोत्तम है।',
        desc_mr: 'मुळांसाठी ओलावा व हवा खेळती राहण्यासाठी योग्य स्थिती.'
    };
}

export let airEvents = [
    {
        time: '08:30 AM',
        icon: '',
        title: 'LIGHT CYCLE INITIATED (BH1750)',
        level: 'positive',
        details: ['Ambient Lux: 850 lux (Target: >500 lux)', 'Photoperiod status: Vegetative illumination active', 'Sensor: BH1750 calibrated']
    },
    {
        time: '11:15 AM',
        icon: '',
        title: 'CANOPY THERMAL MONITORING (DHT22)',
        level: 'medium',
        details: ['Temperature: 30.8 °C', 'Relative Humidity: 71.7%', 'Calculated Heat Index: 37.2 °C', 'Ventilation: Exhaust fan standing by']
    },
    {
        time: '01:45 PM',
        icon: '',
        title: 'VPD & TRANSPIRATION EQUILIBRIUM',
        level: 'low',
        details: ['Relative Humidity: 71.7%', 'Vapor Pressure Deficit: 1.25 kPa (Optimal Band)', 'Dew Point: 25.1 °C']
    },
    {
        time: '03:30 PM',
        icon: '',
        title: 'GAS & SMOKE MONITORING NOMINAL (MQ-2)',
        level: 'positive',
        details: ['MQ-2 Gas Status: NORMAL (Clean Baseline Air)', 'Hazard Buzzer: OFF (Nominal Safety)']
    },
    {
        time: '05:00 PM',
        icon: '',
        title: 'PRECIPITATION SENSOR CLEAR & HEALTHY',
        level: 'low',
        details: ['Precipitation Status: NO RAIN DETECTED', 'ESP32-S3 Node: Online & Telemetry Streaming']
    }
];

export let airRecommendations = [
    'Thermal Management: Ambient temperature is within the vegetative growth range (24°C–32°C). Maintain exhaust fan cycling during midday thermal peaks.',
    'Vapor Pressure Deficit (VPD): Temperature and relative humidity correlate to a balanced VPD (0.95–1.35 kPa), promoting healthy transpiration without stomatal stress.',
    'Photoperiod & Lux Tracking: BH1750 illuminance telemetry tracks daylight cycles and light distribution. Ensure adequate dark photoperiod for root respiration.',
    'Combustion & Gas Safeguard: MQ-2 sensor continuously guards against hazardous combustion and VOC leaks, with automatic buzzer trigger on detection.',
    'Precipitation & Louver Protection: Rain sensor integration enables immediate automated sealing of motorized roof louvers to protect internal canopy.',
    'Microcontroller Link & Diagnostics: ESP32-S3 node continuously broadcasts real-time telemetry over Wi-Fi HTTP bridge with sub-second polling.'
];

export let temperatureData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [26.4, 28.1, 30.8, 31.9, 30.2, 28.5, 27.0]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [28.2, 29.5, 30.8, 31.2, 29.8, 27.6, 28.9]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [28.5, 29.8, 30.4, 29.1]
    }
};

export let humidityData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [78.2, 74.5, 71.7, 66.8, 69.4, 75.2, 78.9]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [73.5, 71.2, 71.7, 68.9, 74.0, 76.5, 75.1]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [72.4, 74.1, 71.5, 73.0]
    }
};

export let lightData = {
    daily: {
        labels: ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'],
        values: [240, 680, 1150, 1420, 890, 120, 15]
    },
    weekly: {
        labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        values: [680, 740, 710, 830, 800, 620, 660]
    },
    monthly: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        values: [710, 760, 730, 695]
    }
};

let temperatureChart = null;
let humidityChart = null;
let lightChart = null;
let climateDynamicsChart = null;
let heatIndexChart = null;
let dewPointChart = null;
let vpdChart = null;
let currentFilter = 'daily';

const safeDestroy = (canvasEl) => {
    if (!canvasEl) return;
    const existing = Chart.getChart(canvasEl);
    if (existing) {
        existing.destroy();
    }
};

export const syncAirDataFromSupabase = async () => {
    try {
        const { data, source, error } = await fetchAirQualityLogs(50);
        if (error) throw new Error(error);

        if (data && data.length > 0) {
            console.log(`[Air Quality Data] Loaded ${data.length} records from: ${source}`);
            const labels = data.map((d) => {
                const date = new Date(d.recorded_at);
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            });

            const temps = data
                .map((d) => Number(d.current_temperature))
                .filter((v) => typeof v === 'number' && !isNaN(v) && isFinite(v));
            const hums = data
                .map((d) => Number(d.current_humidity))
                .filter((v) => typeof v === 'number' && !isNaN(v) && isFinite(v));

            const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : 'N/A';
            const minTemp = temps.length ? Math.min(...temps).toFixed(1) : 'N/A';
            const maxTemp = temps.length ? Math.max(...temps).toFixed(1) : 'N/A';

            const avgHum = hums.length ? (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1) : 'N/A';
            const minHum = hums.length ? Math.min(...hums).toFixed(1) : 'N/A';
            const maxHum = hums.length ? Math.max(...hums).toFixed(1) : 'N/A';

            if (labels.length > 0) {
                humidityData.daily = { labels, values: data.map((d) => Number(d.current_humidity ?? 70)) };
                temperatureData.daily = { labels, values: data.map((d) => Number(d.current_temperature ?? 28)) };
                lightData.daily = { labels, values: data.map((d) => Number(d.current_lux ?? d.lux_value ?? 500)) };
            }

            const latest = data[data.length - 1];
            updateAirOverviewDOM(latest, { avgTemp, minTemp, maxTemp, avgHum, minHum, maxHum });
        }

        try {
            const { data: eventsData } = await fetchSystemEvents('air');
            if (eventsData && eventsData.length > 0) {
                airEvents = eventsData.map((ev) => ({
                    time: new Date(ev.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    icon: '',
                    title: (ev.title || 'ATMOSPHERIC NOTIFICATION').toUpperCase(),
                    level: ev.severity || 'low',
                    details: Array.isArray(ev.details) ? ev.details : [ev.description || 'Sensor telemetry updated']
                }));
            }
        } catch {}
        try {
            const { data: recData } = await fetchRecommendations('air');
            if (recData && recData.length > 0) {
                airRecommendations = recData.map((r) => r.recommendation_text || r);
            }
        } catch {}} catch (err) {
        console.warn('Air pollution data loading fallback:', err.message || err);
    }
};

const updateAirOverviewDOM = (latest, stats = {}) => {
    if (!latest) return;
    const setElem = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.innerText = val;
    };

    if (latest.gas_detected !== undefined) {
        setElem('smk', latest.gas_detected ? 'DETECTED' : 'NORMAL');
    }
    if (latest.rain_detected !== undefined) {
        setElem('rain', latest.rain_detected ? 'RAIN DETECTED' : 'NO RAIN');
    }
    if (latest.buzzer_active !== undefined) {
        setElem('buzzer', latest.buzzer_active ? 'ON' : 'OFF');
    }

    if (latest.current_temperature !== undefined && latest.current_temperature !== null) {
        setElem('ct1', latest.current_temperature);
    }
    if (stats.avgTemp !== undefined) setElem('ct2', stats.avgTemp);
    if (stats.minTemp !== undefined) setElem('ct3', stats.minTemp);
    if (stats.maxTemp !== undefined) setElem('ct4', stats.maxTemp);

    if (latest.current_humidity !== undefined && latest.current_humidity !== null) {
        setElem('ht1', latest.current_humidity);
    }
    if (stats.avgHum !== undefined) setElem('ht2', stats.avgHum);
    if (stats.minHum !== undefined) setElem('ht3', stats.minHum);
    if (stats.maxHum !== undefined) setElem('ht4', stats.maxHum);

    if (latest.current_temperature !== undefined && latest.current_humidity !== undefined) {
        const hi = calculateHeatIndex(latest.current_temperature, latest.current_humidity);
        setElem('heatIndex', hi);
    }
    if (latest.lux_value !== undefined || latest.current_lux !== undefined) {
        setElem('lux', latest.lux_value ?? latest.current_lux);
    }
};

export const initCharts = async () => {
    await syncAirDataFromSupabase();
    renderCharts(currentFilter);
};

const renderCharts = (timeframe = 'daily') => {
    destroyCharts();

    const tLabels = temperatureData[timeframe]?.labels || ['8 AM', '10 AM', '12 PM', '2 PM', '4 PM', '6 PM', '8 PM'];
    const tValues = temperatureData[timeframe]?.values || [26.4, 28.1, 30.8, 31.9, 30.2, 28.5, 27.0];
    const hValues = humidityData[timeframe]?.values || [78.2, 74.5, 71.7, 66.8, 69.4, 75.2, 78.9];
    const lValues = lightData[timeframe]?.values || [240, 680, 1150, 1420, 890, 120, 15];

    const hiValues = tValues.map((t, i) => calculateHeatIndex(t, hValues[i] || 70));
    const dpValues = tValues.map((t, i) => calculateDewPoint(t, hValues[i] || 70));
    const vpdValues = tValues.map((t, i) => calculateVPD(t, hValues[i] || 70));

    const tempEl = document.getElementById('TemperatureTrend');
    if (tempEl) {
        safeDestroy(tempEl);
        temperatureChart = new Chart(tempEl, {
            type: 'line',
            data: {
                labels: tLabels,
                datasets: [{
                    label: 'Temperature (°C)',
                    data: tValues,
                    backgroundColor: 'rgba(39, 174, 96, 0.15)',
                    borderColor: '#27ae60',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#27ae60',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Temperature Profile (DHT22 - °C)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { title: { display: true, text: 'Celsius (°C)' }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }

    const humEl = document.getElementById('HumidityTrend');
    if (humEl) {
        safeDestroy(humEl);
        humidityChart = new Chart(humEl, {
            type: 'line',
            data: {
                labels: tLabels,
                datasets: [{
                    label: 'Humidity (%)',
                    data: hValues,
                    backgroundColor: 'rgba(41, 128, 185, 0.15)',
                    borderColor: '#2980b9',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#2980b9',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Relative Humidity Trend (DHT22 - %)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { min: 0, max: 100, title: { display: true, text: 'Relative Humidity (%)' }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }

    const lightEl = document.getElementById('LightTrend');
    if (lightEl) {
        safeDestroy(lightEl);
        lightChart = new Chart(lightEl, {
            type: 'bar',
            data: {
                labels: tLabels,
                datasets: [{
                    label: 'Light Intensity (Lux)',
                    data: lValues,
                    backgroundColor: 'rgba(243, 156, 18, 0.55)',
                    borderColor: '#d68910',
                    borderWidth: 1.5,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Light Intensity (BH1750 - Lux)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' }, grid: { display: false } },
                    y: { beginAtZero: true, title: { display: true, text: 'Lux (lx)' }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }

    const climateEl = document.getElementById('ClimateDynamicsChart') || document.getElementById('AirQualityScore');
    if (climateEl) {
        safeDestroy(climateEl);
        climateDynamicsChart = new Chart(climateEl, {
            type: 'line',
            data: {
                labels: tLabels,
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        data: tValues,
                        borderColor: '#27ae60',
                        backgroundColor: 'rgba(39, 174, 96, 0.08)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.35,
                        yAxisID: 'yTemp',
                        pointRadius: 4
                    },
                    {
                        label: 'Heat Index (°C)',
                        data: hiValues,
                        borderColor: '#e67e22',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [5, 4],
                        tension: 0.35,
                        yAxisID: 'yTemp',
                        pointRadius: 3
                    },
                    {
                        label: 'Humidity (%)',
                        data: hValues,
                        borderColor: '#2980b9',
                        backgroundColor: 'rgba(41, 128, 185, 0.05)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.35,
                        yAxisID: 'yHum',
                        pointRadius: 4
                    },
                    {
                        label: 'Light Intensity (Lux / 20)',
                        data: lValues.map(v => Math.round(v / 20)),
                        borderColor: '#f1c40f',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [3, 3],
                        tension: 0.3,
                        yAxisID: 'yHum',
                        pointRadius: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    title: { display: true, text: '24h Multi-Sensor Microclimate & Atmospheric Dynamics', font: { size: 15, weight: 'bold' } },
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    x: { title: { display: true, text: 'Timeline' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    yTemp: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Temperature & Heat Index (°C)' },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    yHum: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: 0,
                        max: 100,
                        title: { display: true, text: 'Humidity (%) / Scaled Lux' },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    const hiEl = document.getElementById('HeatIndexTrend') || document.getElementById('CO2Trend');
    if (hiEl) {
        safeDestroy(hiEl);
        heatIndexChart = new Chart(hiEl, {
            type: 'line',
            data: {
                labels: tLabels,
                datasets: [{
                    label: 'Heat Index (°C)',
                    data: hiValues,
                    backgroundColor: 'rgba(230, 126, 34, 0.15)',
                    borderColor: '#e67e22',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#e67e22',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Heat Index (Thermal Load - °C)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { title: { display: true, text: 'Celsius (°C)' }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }

    const dpEl = document.getElementById('DewPointTrend') || document.getElementById('PM2.5Trend') || document.getElementById('PM25Trend');
    if (dpEl) {
        safeDestroy(dpEl);
        dewPointChart = new Chart(dpEl, {
            type: 'line',
            data: {
                labels: tLabels,
                datasets: [{
                    label: 'Dew Point (°C)',
                    data: dpValues,
                    backgroundColor: 'rgba(22, 160, 133, 0.15)',
                    borderColor: '#16a085',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#16a085',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Dew Point & Saturation (°C)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { title: { display: true, text: 'Dew Point (°C)' }, grid: { color: 'rgba(0,0,0,0.05)' } }
                }
            }
        });
    }

    const vpdEl = document.getElementById('VPDDynamics') || document.getElementById('PM10Trend');
    if (vpdEl) {
        safeDestroy(vpdEl);
        vpdChart = new Chart(vpdEl, {
            type: 'line',
            data: {
                labels: tLabels,
                datasets: [{
                    label: 'VPD (kPa)',
                    data: vpdValues,
                    backgroundColor: 'rgba(142, 68, 173, 0.15)',
                    borderColor: '#8e44ad',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: '#8e44ad',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Vapor Pressure Deficit (VPD - kPa)' },
                    legend: { display: true }
                },
                scales: {
                    x: { title: { display: true, text: 'Time' }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    y: { beginAtZero: true, title: { display: true, text: 'VPD (kPa)' }, grid: { color: 'rgba(0,0,0,0.05)' } }
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
    if (temperatureChart) { temperatureChart.destroy(); temperatureChart = null; }
    if (humidityChart) { humidityChart.destroy(); humidityChart = null; }
    if (lightChart) { lightChart.destroy(); lightChart = null; }
    if (climateDynamicsChart) { climateDynamicsChart.destroy(); climateDynamicsChart = null; }
    if (heatIndexChart) { heatIndexChart.destroy(); heatIndexChart = null; }
    if (dewPointChart) { dewPointChart.destroy(); dewPointChart = null; }
    if (vpdChart) { vpdChart.destroy(); vpdChart = null; }
};

export const downloadReport = (type) => {
    const statusText = document.getElementById('st')?.innerText || 'OPTIMAL';
    const heatIndex = document.getElementById('heatIndex')?.innerText || '28.4';
    const lux = document.getElementById('lux')?.innerText || '650';
    const smk = document.getElementById('smk')?.innerText || 'Clean (12 ppm)';
    const rain = document.getElementById('rain')?.innerText || 'Clear / No Rain';
    const buzzer = document.getElementById('buzzer')?.innerText || 'STANDBY';
    const exf = document.getElementById('exf')?.innerText || 'AUTO ACTIVE';
    
    const curTemp = document.getElementById('ct1')?.innerText || '26.5';
    const avgTemp = document.getElementById('ct2')?.innerText || '26.2';
    const minTemp = document.getElementById('ct3')?.innerText || '21.0';
    const maxTemp = document.getElementById('ct4')?.innerText || '29.5';

    const curHum = document.getElementById('ht1')?.innerText || '62.0';
    const avgHum = document.getElementById('ht2')?.innerText || '61.5';
    const minHum = document.getElementById('ht3')?.innerText || '52.0';
    const maxHum = document.getElementById('ht4')?.innerText || '70.0';

    generateExecutiveReport({
        title: 'Atmospheric & Microclimate Intelligence Report',
        subtitle: 'Real-time Greenhouse Climate Telemetry, Ventilation & Thermal Analytics',
        reportType: type,
        systemNode: 'EnviroX Atmospheric Node Alpha (Greenhouse Microclimate)',
        alertStatus: statusText,
        kpiMetrics: [
            { label: 'Environment Status', value: statusText, variant: 'highlight', status: statusText, statusLevel: statusText.toLowerCase() === 'optimal' ? 'optimal' : 'warning' },
            { label: 'Heat Index (Feels Like)', value: heatIndex, unit: '°C', subtext: 'Calculated Biometeorological Index' },
            { label: 'Solar Illuminance (BH1750)', value: lux, unit: 'lux', subtext: 'Photosynthetic Active Radiation' },
            { label: 'Gas / Smoke Density (MQ-2)', value: smk, subtext: 'Combustible & VOC Monitoring' },
            { label: 'Ambient Temperature', value: curTemp, unit: '°C', subtext: `Daily Avg: ${avgTemp}°C (Min ${minTemp}°C, Max ${maxTemp}°C)` },
            { label: 'Relative Humidity', value: curHum, unit: '%', subtext: `Daily Avg: ${avgHum}% (Min ${minHum}%, Max ${maxHum}%)` },
            { label: 'Precipitation Sensor', value: rain, subtext: 'Optical / Capacitive Rain Detector' },
            { label: 'Exhaust Ventilation', value: exf, subtext: 'Automated Fan Damper Control' }
        ],
        chartConfigs: [
            { canvasId: 'AirQuality', title: 'Air Quality Index & Microclimate Trend', description: 'Real-time continuous environmental telemetry' },
            { canvasId: 'Humidity', title: 'Relative Humidity Dynamic Distribution (%)', description: 'Capacitive sensor continuous atmospheric humidity' },
            { canvasId: 'Co2', title: 'CO2 Carbon Dioxide Concentration (ppm)', description: 'NDIR sensor photosynthetic gas concentration' },
            { canvasId: 'HeatIndexTrend', title: 'Thermal Stress & Heat Index Trend (°C)', description: 'Biometeorological heat stress curve' },
            { canvasId: 'DewPointTrend', title: 'Dew Point Progression (°C)', description: 'Condensation risk & moisture saturation threshold' },
            { canvasId: 'VPDChart', title: 'Vapor Pressure Deficit (VPD kPa)', description: 'Stomatal conductance & crop transpiration demand' }
        ],
        telemetryRows: [
            { parameter: 'Ambient Air Temperature (DHT22)', recordedValue: `${curTemp} °C`, benchmark: '20.0 - 28.0 °C', status: 'Optimal', notes: `Min: ${minTemp}°C, Max: ${maxTemp}°C` },
            { parameter: 'Relative Air Humidity (DHT22)', recordedValue: `${curHum} %`, benchmark: '55.0 - 75.0 %', status: 'Optimal', notes: `Min: ${minHum}%, Max: ${maxHum}%` },
            { parameter: 'Solar Radiation / Illuminance (BH1750)', recordedValue: `${lux} lux`, benchmark: '400 - 900 lux', status: 'Optimal', notes: 'Adequate for primary vegetative photosynthesis' },
            { parameter: 'Air Purity / Gas Density (MQ-2)', recordedValue: smk, benchmark: '< 50 ppm', status: 'Normal', notes: 'No hazardous fumes or combustible gases detected' },
            { parameter: 'Rain / Moisture Optical Sensor', recordedValue: rain, benchmark: 'Dry / No Rain', status: 'Normal', notes: 'Automated greenhouse roof vents ready' },
            { parameter: 'Exhaust Fan & Damper Actuator', recordedValue: exf, benchmark: 'Dynamic Automation', status: 'Normal', notes: 'Modulating air exchanges per hour' }
        ],
        recommendations: airRecommendations && airRecommendations.length > 0 ? airRecommendations : [
            'Greenhouse temperature and humidity balance is within target vegetative thresholds.',
            'Maintain active exhaust ventilation cycling to prevent localized humidity stagnation.',
            'Light levels are optimal for solar carbon fixation across canopy layer.'
        ]
    });
};

export const fetchAirModelPrediction = async (inputs = {}) => {
    try {
        const response = await fetch('/api/air/model/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputs)
        });
        const data = await response.json();
        if (data.status === 'success' && data.result) {
            return data.result;
        }
    } catch (err) {
        console.warn('Air model prediction API fallback:', err);
    }
    return null;
};

export const fetchLatestAirTelemetryAndAI = async () => {
    try {
        const response = await fetch('/api/air/latest');
        const data = await response.json();
        if (data.status === 'success') {
            return data;
        }
    } catch (err) {
        console.warn('Latest air telemetry fetch error:', err);
    }
    return null;
};

export const triggerExhaustFanActuator = async (action = 'ON') => {
    try {
        const res = await fetch('/api/controls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actuator_type: 'exhaust_fan', action })
        });
        return await res.json();
    } catch (err) {
        console.warn('Exhaust fan actuator trigger warning:', err);
        return { status: 'mock_triggered', action };
    }
};