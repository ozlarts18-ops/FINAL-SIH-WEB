import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import DashboardSubNav from '../../components/DashboardSubNav';
import AudioVoiceButton from '../../components/AudioVoiceButton';
import { fetchLatestSensorData, fetchAirQualityLogs } from '../../api/dataService';

import {
    initCharts,
    applyGraphFilter,
    downloadReport,
    destroyCharts,
    calculateHeatIndex,
    calculateEvapotranspiration,
    evaluateWaterloggingRisk,
    airEvents,
    airRecommendations
} from '../mainfunction';

import './air.css';

const AirPollutionDashboard = () => {
    const [alertDismissed, setAlertDismissed] = useState(false);

    const [telemetry, setTelemetry] = useState({
        device: 'ESP32-S3-01',
        isOnline: false,
        temperature: null,
        humidity: null,
        lux: null,
        gasDetected: null,
        rainDetected: null,
        buzzer: null
    });

    const [stats, setStats] = useState({
        avgTemp: 'N/A',
        minTemp: 'N/A',
        maxTemp: 'N/A',
        avgHum: 'N/A',
        minHum: 'N/A',
        maxHum: 'N/A'
    });

    const fetchLiveData = async () => {
        try {
            const data = await fetchLatestSensorData();
            if (data && typeof data === 'object') {
                let online = false;
                if (data.timestamp) {
                    const timeDiff = Date.now() - new Date(data.timestamp).getTime();
                    online = timeDiff < 30000;
                } else if (data.status === 'OK') {
                    online = true;
                }

                setTelemetry({
                    device: data.device || 'ESP32-S3-01',
                    isOnline: online,
                    temperature: data.temperature !== undefined && data.temperature !== null ? Number(data.temperature).toFixed(1) : null,
                    humidity: data.humidity !== undefined && data.humidity !== null ? Number(data.humidity).toFixed(1) : null,
                    lux: data.lux !== undefined && data.lux !== null ? data.lux : null,
                    gasDetected: data.gasDetected !== undefined && data.gasDetected !== null ? Boolean(data.gasDetected) : null,
                    rainDetected: data.rainDetected !== undefined && data.rainDetected !== null ? Boolean(data.rainDetected) : null,
                    buzzer: data.buzzer !== undefined && data.buzzer !== null ? Boolean(data.buzzer) : null
                });
            } else {
                setTelemetry(prev => ({ ...prev, isOnline: false }));
            }
        } catch (_err) {
            setTelemetry(prev => ({ ...prev, isOnline: false }));
        }
    };

    const fetchHistoricalStats = async () => {
        try {
            const { data } = await fetchAirQualityLogs(50);
            if (data && Array.isArray(data) && data.length > 0) {
                const temps = data
                    .map(d => Number(d.current_temperature))
                    .filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));

                const hums = data
                    .map(d => Number(d.current_humidity))
                    .filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));

                setStats({
                    avgTemp: temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : 'N/A',
                    minTemp: temps.length ? Math.min(...temps).toFixed(1) : 'N/A',
                    maxTemp: temps.length ? Math.max(...temps).toFixed(1) : 'N/A',
                    avgHum: hums.length ? (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1) : 'N/A',
                    minHum: hums.length ? Math.min(...hums).toFixed(1) : 'N/A',
                    maxHum: hums.length ? Math.max(...hums).toFixed(1) : 'N/A'
                });
            } else {
                setStats({
                    avgTemp: 'N/A',
                    minTemp: 'N/A',
                    maxTemp: 'N/A',
                    avgHum: 'N/A',
                    minHum: 'N/A',
                    maxHum: 'N/A'
                });
            }
        } catch (_err) {}};

    useEffect(() => {
        initCharts();
        fetchLiveData();
        fetchHistoricalStats();

        const liveInterval = setInterval(() => {
            fetchLiveData();
        }, 2500);

        const statsInterval = setInterval(() => {
            fetchHistoricalStats();
        }, 10000);

        return () => {
            clearInterval(liveInterval);
            clearInterval(statsInterval);
            destroyCharts();
        };
    }, []);

    const heatIndex = (telemetry.temperature !== null && telemetry.humidity !== null)
        ? calculateHeatIndex(Number(telemetry.temperature), Number(telemetry.humidity))
        : null;

    const etData = calculateEvapotranspiration(
        telemetry.temperature ?? 28,
        telemetry.humidity ?? 65,
        telemetry.lux ?? 1500,
        stats.minTemp !== 'N/A' ? Number(stats.minTemp) : 24,
        stats.maxTemp !== 'N/A' ? Number(stats.maxTemp) : 34
    );

    const getEnvironmentStatus = () => {
        if (telemetry.gasDetected) return { label: 'HAZARD: GAS DETECTED', color: '#c0392b' };
        if (telemetry.rainDetected) return { label: 'RAIN DETECTED', color: '#2980b9' };
        if (telemetry.temperature !== null && Number(telemetry.temperature) > 35) {
            return { label: 'HIGH HEAT ADVISORY', color: '#e67e22' };
        }
        return { label: 'OPTIMAL', color: '#3f8c20' };
    };
    const envStatus = getEnvironmentStatus();

    const alertSpeechEn = telemetry.gasDetected
        ? 'Critical Alert: Combustible gas or smoke spike detected by MQ-2 sensor. Immediate ventilation required.'
        : telemetry.rainDetected
            ? 'Precipitation Advisory: Rainfall detected. Please monitor soil saturation and adjust greenhouse louvers.'
            : telemetry.temperature > 35
                ? `High Heat Warning: Canopy temperature is ${telemetry.temperature} degrees Celsius. Evapotranspiration loss is ${etData.et0} mm per day. Early morning drip irrigation prescribed.`
                : `System Status Optimal: Temperature is ${telemetry.temperature || 28} degrees, humidity is ${telemetry.humidity || 70} percent, and drought risk is low.`;

    const alertSpeechHi = telemetry.gasDetected
        ? 'गंभीर चेतावनी: गैस या धुआं का स्तर बढ़ गया है। तत्काल निकास पंखे चालू करें।'
        : telemetry.rainDetected
            ? 'बारिश की चेतावनी: वर्षा संवेदक सक्रिय है। कृपया जल निकासी की जांच करें।'
            : telemetry.temperature > 35
                ? `गर्मी की चेतावनी: तापमान ${telemetry.temperature} डिग्री सेल्सियस है। वाष्पीकरण दर ${etData.et0} मिमी प्रति दिन है। सुबह जल्दी ड्रिप सिंचाई करें।`
                : `सभी स्थितियां सामान्य हैं। तापमान ${telemetry.temperature || 28} डिग्री और आर्द्रता ${telemetry.humidity || 70} प्रतिशत है।`;

    const alertSpeechMr = telemetry.gasDetected
        ? 'गंभीर इशारा: विषारी वायू किंवा धूर वाढला आहे. लगेच एक्झॉस्ट फॅन चालू करा.'
        : telemetry.rainDetected
            ? 'पावसाची सूचना: पाऊस सुरू आहे. कृपया पाण्याचा निचरा तपासा.'
            : telemetry.temperature > 35
                ? `उष्णतेचा इशारा: तापमान ${telemetry.temperature} अंश सेल्सिअस आहे. बाष्पीभवन ${etData.et0} मिमी/दिवस आहे. सकाळी लवकर पाणी द्या.`
                : `सर्व स्थिती सामान्य आहे. तापमान ${telemetry.temperature || 28} अंश आणि हवेतील आर्द्रता ${telemetry.humidity || 70} टक्के आहे.`;

    return (
        <div className="air-pollution-page">

            <Header />
            <Nav />
            <DashboardSubNav />

            <div className="dashboard">

                <div className="overview">

                    <div className="head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                        <h1>OVERVIEW</h1>
                        <AudioVoiceButton
                            text={alertSpeechEn}
                            hindiText={alertSpeechHi}
                            marathiText={alertSpeechMr}
                            label="Speak Overview"
                        />
                    </div>

                    <div className="main">

                        <div className="left">

                            <div className="status">

                                <h2>ENVIRONMENT STATUS</h2>

                                <p
                                    className="unit"
                                    id="st"
                                    style={{
                                        color: envStatus.color,
                                        fontSize: envStatus.label.length > 10 ? '26px' : '36px'
                                    }}
                                >
                                    {envStatus.label}
                                </p>

                                <p className="t1" style={{ marginTop: '8px' }}>
                                    {telemetry.isOnline ? 'Continuous Monitoring Active' : 'Sensor Offline'}
                                </p>

                            </div>

                            <div className="box1">

                                <h2>HEAT INDEX</h2>

                                <p
                                    className="unit"
                                    id="heatIndex"
                                >
                                    {heatIndex !== null ? heatIndex : 'N/A'}
                                </p>

                                <p className="t1">
                                    Celsius (Feels Like)
                                </p>

                            </div>

                            <div className="box2">

                                <h2>LIGHT</h2>

                                <p
                                    className="unit"
                                    id="lux"
                                >
                                    {telemetry.lux !== null ? telemetry.lux : 'N/A'}
                                </p>

                                <p className="t1">
                                    lux
                                </p>

                            </div>

                        </div>

                        <div className="right">

                            <div className="box3">

                                <h2>GAS/SMOKE</h2>

                                <p
                                    className="unit"
                                    id="smk"
                                    style={{ color: telemetry.gasDetected ? '#c0392b' : '#65b32e' }}
                                >
                                    {telemetry.gasDetected === null
                                        ? 'N/A'
                                        : telemetry.gasDetected
                                            ? 'DETECTED'
                                            : 'NORMAL'}
                                </p>

                            </div>

                            <div className="box4">

                                <h2>BUZZER</h2>

                                <p
                                    className="unit"
                                    id="buzzer"
                                    style={{ color: telemetry.buzzer ? '#c0392b' : '#65b32e' }}
                                >
                                    {telemetry.buzzer === null
                                        ? 'N/A'
                                        : telemetry.buzzer
                                            ? 'ON'
                                            : 'OFF'}
                                </p>

                            </div>

                            <div className="box5">

                                <h2>RAIN SENSOR</h2>

                                <p
                                    className="unit"
                                    id="rain"
                                    style={{ color: telemetry.rainDetected ? '#2980b9' : '#65b32e' }}
                                >
                                    {telemetry.rainDetected === null
                                        ? 'N/A'
                                        : telemetry.rainDetected
                                            ? 'RAIN DETECTED'
                                            : 'NO RAIN'}
                                </p>

                            </div>

                            <div className="box51">

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h2>DROUGHT & ET₀ LOSS</h2>
                                    <span style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: etData.droughtRisk === 'SEVERE' ? '#fdeeed' : (etData.droughtRisk === 'MODERATE' ? '#fef3c7' : '#e5f8e5'),
                                        color: etData.droughtRisk === 'SEVERE' ? '#991b1b' : (etData.droughtRisk === 'MODERATE' ? '#92400e' : '#166534'),
                                        fontWeight: '700'
                                    }}>
                                        {etData.droughtRisk} RISK
                                    </span>
                                </div>

                                <p
                                    className="unit"
                                    id="et0"
                                    style={{ fontSize: '24px' }}
                                >
                                    {etData.et0} <span style={{ fontSize: '14px', color: '#666' }}>mm/day</span>
                                </p>

                                <p className="t1">
                                    Need: <strong>{etData.prescribedWaterLiters} L/m²</strong> ({etData.recommendedMinutes}m drip)
                                </p>

                            </div>

                        </div>

                    </div>

                    <div className="temp">

                        <div className="box6">

                            <h2>CURRENT TEMPERATURE</h2>

                            <p
                                className="unit"
                                id="ct1"
                            >
                                {telemetry.temperature !== null ? `${telemetry.temperature}` : 'N/A'}
                            </p>

                            <p className="t1">
                                Celsius
                            </p>

                        </div>

                        <div className="box7">

                            <h2>AVERAGE TEMPERATURE</h2>

                            <p
                                className="unit"
                                id="ct2"
                            >
                                {stats.avgTemp}
                            </p>

                            <p className="t1">
                                Celsius
                            </p>

                        </div>

                        <div className="box8">

                            <h2>MIN TEMPERATURE</h2>

                            <p
                                className="unit"
                                id="ct3"
                            >
                                {stats.minTemp}
                            </p>

                            <p className="t1">
                                Celsius
                            </p>

                        </div>

                        <div className="box9">

                            <h2>MAX TEMPERATURE</h2>

                            <p
                                className="unit"
                                id="ct4"
                            >
                                {stats.maxTemp}
                            </p>

                            <p className="t1">
                                Celsius
                            </p>

                        </div>

                    </div>

                    <div className="hum">

                        <div className="box10">

                            <h2>CURRENT HUMIDITY</h2>

                            <p
                                className="unit"
                                id="ht1"
                            >
                                {telemetry.humidity !== null ? `${telemetry.humidity}` : 'N/A'}
                            </p>

                            <p className="t1">
                                %
                            </p>

                        </div>

                        <div className="box11">

                            <h2>AVERAGE HUMIDITY</h2>

                            <p
                                className="unit"
                                id="ht2"
                            >
                                {stats.avgHum}
                            </p>

                            <p className="t1">
                                %
                            </p>

                        </div>

                        <div className="box12">

                            <h2>MIN HUMIDITY</h2>

                            <p
                                className="unit"
                                id="ht3"
                            >
                                {stats.minHum}
                            </p>

                            <p className="t1">
                                %
                            </p>

                        </div>

                        <div className="box13">

                            <h2>MAX HUMIDITY</h2>

                            <p
                                className="unit"
                                id="ht4"
                            >
                                {stats.maxHum}
                            </p>

                            <p className="t1">
                                %
                            </p>

                        </div>

                    </div>

                </div>

            </div>

            <div className="dashboard2">

                <div className="controls">

                    <div className="head">
                        <h1>CONTROLS</h1>
                    </div>

                    <div className="panel">

                        <div className="exn">

                            <h2>EXHAUST FAN</h2>

                            <p
                                className="exf"
                                id="exf"
                            >
                                ON
                            </p>

                        </div>

                        <div className="modes">

                            <h2>MODES</h2>

                            <div className="m1">

                                <input
                                    type="radio"
                                    name="mode"
                                    id="on"
                                    defaultChecked
                                />

                                <label htmlFor="on">
                                    ON
                                </label>

                                <input
                                    type="radio"
                                    name="mode"
                                    id="off"
                                />

                                <label htmlFor="off">
                                    OFF
                                </label>

                                <input
                                    type="radio"
                                    name="mode"
                                    id="auto"
                                />

                                <label htmlFor="auto">
                                    AUTOMATIC
                                </label>

                            </div>

                        </div>

                        <div className="filters">

                            <h2>FILTER</h2>

                            <div className="m1">

                                <input
                                    type="radio"
                                    name="graphFilter"
                                    id="daily"
                                    defaultChecked
                                    onChange={() =>
                                        applyGraphFilter('daily')
                                    }
                                />

                                <label htmlFor="daily">
                                    DAILY
                                </label>

                                <input
                                    type="radio"
                                    name="graphFilter"
                                    id="weekly"
                                    onChange={() =>
                                        applyGraphFilter('weekly')
                                    }
                                />

                                <label htmlFor="weekly">
                                    WEEKLY
                                </label>

                                <input
                                    type="radio"
                                    name="graphFilter"
                                    id="monthly"
                                    onChange={() =>
                                        applyGraphFilter('monthly')
                                    }
                                />

                                <label htmlFor="monthly">
                                    MONTHLY
                                </label>

                            </div>

                        </div>

                    </div>

                </div>

            </div>

            <div className="graphs">

                <div className="glayout">

                    <div className="head">
                        <h1>GRAPHS</h1>
                    </div>

                    <div className="gly1">

                        <div className="c1">
                            <canvas id="TemperatureTrend"></canvas>
                        </div>

                        <div className="c2">
                            <canvas id="HumidityTrend"></canvas>
                        </div>

                        <div className="c3">
                            <canvas id="LightTrend"></canvas>
                        </div>

                    </div>

                    <div className="c4">

                        <canvas id="ClimateDynamicsChart"></canvas>

                    </div>

                    <div className="gly2">

                        <div className="c5">
                            <canvas id="HeatIndexTrend"></canvas>
                        </div>

                        <div className="c6">
                            <canvas id="DewPointTrend"></canvas>
                        </div>

                        <div className="c7">
                            <canvas id="VPDDynamics"></canvas>
                        </div>

                    </div>

                </div>

            </div>

            <div className="alert-section-wrapper">

                {!alertDismissed && (
                    <div
                        className="air-alert-banner"
                        style={{
                            borderColor: telemetry.gasDetected ? '#c0392b' : telemetry.rainDetected ? '#2980b9' : '#65b32e',
                            background: telemetry.gasDetected
                                ? 'linear-gradient(135deg, #fbeaea 0%, #f7d5d5 100%)'
                                : telemetry.rainDetected
                                    ? 'linear-gradient(135deg, #e9f2fb 0%, #d2e5f8 100%)'
                                    : 'linear-gradient(135deg, #e5f3df 0%, #d5edd0 100%)'
                        }}
                    >
                        <div className="alert-banner-left">
                            <div className="alert-banner-text">
                                <h3 style={{ color: telemetry.gasDetected ? '#962d22' : telemetry.rainDetected ? '#1a5276' : '#124500' }}>
                                    {telemetry.gasDetected
                                        ? 'CRITICAL ALERT: COMBUSTIBLE GAS / SMOKE DETECTED BY MQ-2'
                                        : telemetry.rainDetected
                                            ? 'METEOROLOGICAL ADVISORY: PRECIPITATION DETECTED BY RAIN SENSOR'
                                            : telemetry.temperature > 35
                                                ? 'THERMAL WATCH: ELEVATED CANOPY TEMPERATURE'
                                                : 'SYSTEM HEALTH ALERT: ATMOSPHERIC & SENSOR PARAMETERS NOMINAL'}
                                </h3>
                                <p style={{ color: telemetry.gasDetected ? '#78281f' : telemetry.rainDetected ? '#154360' : '#335522' }}>
                                    {telemetry.gasDetected
                                        ? 'MQ-2 sensor reports volatile combustion threshold excursion. Emergency buzzer active and exhaust fan ventilation triggered.'
                                        : telemetry.rainDetected
                                            ? 'Active rainfall detected by atmospheric sensor array. Automated louvers and greenhouse ventilation standby.'
                                            : telemetry.temperature > 35
                                                ? `DHT22 sensor reports canopy temperature of ${telemetry.temperature}°C. Evapotranspiration loss is ${etData.et0} mm/day. Early morning drip irrigation recommended.`
                                                : 'DHT22 (Temp/Hum), BH1750 (Lux), and MQ-2 Gas sensors are streaming nominal telemetry within agronomic targets.'}
                                </p>
                            </div>
                        </div>
                        <div className="alert-banner-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AudioVoiceButton
                                text={alertSpeechEn}
                                hindiText={alertSpeechHi}
                                marathiText={alertSpeechMr}
                                label="Listen"
                            />
                            <span
                                className="alert-status-pill"
                                style={{
                                    background: telemetry.gasDetected ? '#c0392b' : telemetry.rainDetected ? '#2980b9' : '#65b32e'
                                }}
                            >
                                {telemetry.gasDetected ? 'HAZARD DETECTED' : telemetry.rainDetected ? 'RAIN ACTIVE' : 'ACTIVE MONITOR'}
                            </span>
                            <button
                                className="alert-close-btn"
                                onClick={() => setAlertDismissed(true)}
                                title="Dismiss notification"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                <div className="insights">

                    <div className="events-panel">
                        <div className="head">
                            <h1>AIR QUALITY ALERTS & SYSTEM EVENTS</h1>
                            <p className="subtext">Atmospheric telemetry logs and threshold observations</p>
                        </div>

                        <div className="events-list">
                            {airEvents.map((event, idx) => (
                                <div className={`event-item level-${event.level}`} key={idx}>
                                    <div className="event-item-top">
                                        <span className="event-icon">{event.icon}</span>
                                        <div className="event-item-text">
                                            <div className="event-title">{event.title}</div>
                                            <div className="event-time">{event.time}</div>
                                        </div>
                                    </div>
                                    <ul className="event-details">
                                        {event.details.map((line, i) => (
                                            <li key={i}>{line}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="intelligence-panel">
                        <div className="head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                                <h1>D. AIR INTELLIGENCE & RECOMMENDATIONS</h1>
                                <p className="subtext">Automated climate control observations & actions</p>
                            </div>
                            <AudioVoiceButton
                                text={airRecommendations.join(' ')}
                                label="Read All"
                            />
                        </div>

                        <ul className="intelligence-list">
                            {airRecommendations.map((tip, idx) => (
                                <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{tip}</span>
                                    <AudioVoiceButton
                                        text={tip}
                                        label="Listen"
                                        className="btn-micro"
                                    />
                                </li>
                            ))}
                        </ul>
                    </div>

                </div>

            </div>

            <div className="downc">

                <div className="dlayout">

                    <div className="head">
                        <h1>
                            Download Reports
                        </h1>
                    </div>

                    <button
                        onClick={() =>
                            downloadReport('daily')
                        }
                    >
                        Daily
                    </button>

                    <button
                        onClick={() =>
                            downloadReport('weekly')
                        }
                    >
                        Weekly
                    </button>

                    <button
                        onClick={() =>
                            downloadReport('monthly')
                        }
                    >
                        Monthly
                    </button>

                </div>

            </div>

            <Footer />

        </div>
    );
};

export default AirPollutionDashboard;