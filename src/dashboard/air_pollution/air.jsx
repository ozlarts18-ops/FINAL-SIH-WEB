import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import DashboardSubNav from '../../components/DashboardSubNav';
import AudioVoiceButton from '../../components/AudioVoiceButton';
import { useLanguage } from '../../context/LanguageContext';
import { fetchLatestSensorData, fetchAirQualityLogs } from '../../api/dataService';

import {
    initCharts,
    applyGraphFilter,
    downloadReport,
    destroyCharts,
    calculateHeatIndex,
    calculateEvapotranspiration
} from '../mainfunction';

import './air.css';

const AirPollutionDashboard = () => {
    const { language, t } = useLanguage();
    const [alertDismissed, setAlertDismissed] = useState(false);

    const [telemetry, setTelemetry] = useState({
        device: 'ESP32-S3-01',
        node1Online: false,
        temperature: null,
        humidity: null,
        lux: null,
        gasDetected: null,
        rainDetected: null,
        growLightState: 'OFF',
        growLightMode: 'AUTO'
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
            const controlsRes = await fetch('/api/controls').then(r => r.ok ? r.json() : null).catch(() => null);
            const growLightActuator = controlsRes?.data?.find(a => a.actuator_type === 'grow_lights');

            if (data && typeof data === 'object') {
                const node1 = data.node1 || {};
                const online = Boolean(data.node1 ? data.node1.online : (data.timestamp && Date.now() - new Date(data.timestamp).getTime() < 30000));

                const tempVal = node1.temperature ?? data.temperature ?? null;
                const humVal = node1.humidity ?? data.humidity ?? null;
                const luxVal = node1.lux ?? data.lux ?? null;
                const gasVal = node1.gasDetected ?? data.gasDetected ?? null;
                const rainVal = node1.rainDetected ?? data.rainDetected ?? null;

                setTelemetry({
                    device: 'ESP32-S3-01',
                    node1Online: online,
                    temperature: online && tempVal !== null ? Number(tempVal).toFixed(1) : null,
                    humidity: online && humVal !== null ? Number(humVal).toFixed(1) : null,
                    lux: online && luxVal !== null ? Number(luxVal).toFixed(2) : null,
                    gasDetected: online && gasVal !== null ? Boolean(gasVal) : null,
                    rainDetected: online && rainVal !== null ? Boolean(rainVal) : null,
                    growLightState: growLightActuator ? growLightActuator.current_state : (data.grow_lights || 'OFF'),
                    growLightMode: growLightActuator ? (growLightActuator.control_mode === 'AUTOMATIC' ? 'AUTO' : growLightActuator.current_state) : 'AUTO'
                });
            } else {
                setTelemetry(prev => ({ ...prev, node1Online: false }));
            }
        } catch (_err) {
            setTelemetry(prev => ({ ...prev, node1Online: false }));
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
        } catch (_err) { }
    };

    const handleLightControl = async (targetAction) => {
        try {
            const res = await fetch('/api/controls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actuator_type: 'grow_lights', action: targetAction })
            });
            if (res.ok) {
                const json = await res.json();
                const updatedState = json.data?.find(a => a.actuator_type === 'grow_lights');
                if (updatedState) {
                    setTelemetry(prev => ({
                        ...prev,
                        growLightState: updatedState.current_state,
                        growLightMode: updatedState.control_mode === 'AUTOMATIC' ? 'AUTO' : updatedState.current_state
                    }));
                }
            }
        } catch (e) {
            console.warn('Grow light control command error:', e.message);
        }
    };

    useEffect(() => {
        initCharts();
        Promise.resolve().then(() => {
            fetchLiveData();
            fetchHistoricalStats();
        });

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

    const heatIndex = (telemetry.node1Online && telemetry.temperature !== null && telemetry.humidity !== null)
        ? calculateHeatIndex(Number(telemetry.temperature), Number(telemetry.humidity))
        : null;

    const hasValidEtData = telemetry.node1Online && telemetry.temperature !== null && telemetry.humidity !== null;
    const etData = hasValidEtData
        ? calculateEvapotranspiration(
            Number(telemetry.temperature),
            Number(telemetry.humidity),
            telemetry.lux !== null ? Number(telemetry.lux) : 1500,
            stats.minTemp !== 'N/A' ? Number(stats.minTemp) : 24,
            stats.maxTemp !== 'N/A' ? Number(stats.maxTemp) : 34
        )
        : null;

    const getEnvironmentStatus = () => {
        if (!telemetry.node1Online) return { label: language === 'hi' ? 'नोड 1 ऑफलाइन' : 'NODE 1 OFFLINE', color: '#7f8c8d' };
        if (telemetry.gasDetected) return { label: language === 'hi' ? 'गंभीर' : 'CRITICAL', color: '#c0392b' };
        if (telemetry.rainDetected) return { label: language === 'hi' ? 'चेतावनी' : 'WARNING', color: '#e67e22' };
        if (telemetry.temperature !== null && Number(telemetry.temperature) > 35) {
            return { label: language === 'hi' ? 'चेतावनी' : 'WARNING', color: '#e67e22' };
        }
        if (telemetry.humidity !== null && (Number(telemetry.humidity) < 30 || Number(telemetry.humidity) > 85)) {
            return { label: language === 'hi' ? 'चेतावनी' : 'WARNING', color: '#e67e22' };
        }
        return { label: language === 'hi' ? 'इष्टतम' : 'OPTIMAL', color: '#3f8c20' };
    };
    const envStatus = getEnvironmentStatus();

    const alertSpeechEn = !telemetry.node1Online
        ? 'Node 1 sensor connection lost.'
        : telemetry.gasDetected
            ? 'Gas or smoke level is above the configured threshold. Immediate attention required.'
            : telemetry.rainDetected
                ? 'Rain detected. Review ventilation and irrigation requirements.'
                : telemetry.temperature && Number(telemetry.temperature) > 35
                    ? `High heat condition detected. Current canopy temperature is ${telemetry.temperature} degrees Celsius.`
                    : `Environment status optimal. Temperature is ${telemetry.temperature || 'N/A'} degrees Celsius, humidity is ${telemetry.humidity || 'N/A'} percent.`;

    const alertSpeechHi = !telemetry.node1Online
        ? 'नोड 1 सेंसर कनेक्शन टूट गया है।'
        : telemetry.gasDetected
            ? 'गैस या धुआं का स्तर सीमा से अधिक है।'
            : telemetry.rainDetected
                ? 'बारिश का पता चला है।'
                : telemetry.temperature && Number(telemetry.temperature) > 35
                    ? `उच्च तापमान की चेतावनी: ${telemetry.temperature} डिग्री सेल्सियस।`
                    : `सभी स्थितियां सामान्य हैं। तापमान ${telemetry.temperature || 'N/A'} डिग्री।`;

    const alertSpeechMr = !telemetry.node1Online
        ? 'नोड 1 सेन्सर कनेक्शन तुटले आहे.'
        : telemetry.gasDetected
            ? 'गॅस किंवा धूर पातळी जास्त आहे.'
            : telemetry.rainDetected
                ? 'पाऊस सुरू आहे.'
                : telemetry.temperature && Number(telemetry.temperature) > 35
                    ? `उच्च तापमानाचा इशारा: ${telemetry.temperature} अंश सेल्सिअस.`
                    : `सर्व स्थिती सामान्य आहे.`;

    const dynamicEvents = !telemetry.node1Online
        ? [
            {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '',
                title: 'NODE 1 SENSOR CONNECTION LOST',
                level: 'high',
                details: ['Node 1 (Atmospheric) is offline or unreachable.', 'Check hardware power and Wi-Fi connection.']
            }
        ]
        : [
            ...(telemetry.gasDetected ? [{
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '',
                title: 'GAS / SMOKE LEVEL ABOVE THRESHOLD',
                level: 'high',
                details: ['MQ gas sensor threshold exceeded.', 'Inspect growing area immediately.']
            }] : []),
            ...(telemetry.rainDetected ? [{
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '',
                title: 'RAIN DETECTED',
                level: 'medium',
                details: ['Rain sensor triggered.', 'Review greenhouse louvers and irrigation.']
            }] : []),
            ...(telemetry.lux !== null && Number(telemetry.lux) < 1.0 ? [{
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '',
                title: 'GROW LIGHT ACTIVATED AUTOMATICALLY',
                level: 'positive',
                details: [`Ambient light level is below 1.0 lux (${telemetry.lux} lux).`, 'Grow light activated automatically.']
            }] : []),
            {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '',
                title: 'NODE 1 TELEMETRY STREAMING',
                level: 'positive',
                details: [
                    `Temperature: ${telemetry.temperature !== null ? telemetry.temperature + ' °C' : 'N/A'}`,
                    `Humidity: ${telemetry.humidity !== null ? telemetry.humidity + ' %' : 'N/A'}`,
                    `Light: ${telemetry.lux !== null ? telemetry.lux + ' lux' : 'N/A'}`
                ]
            }
        ];

    const dynamicRecommendations = !telemetry.node1Online
        ? ['Check Node 1 network/power connection.']
        : [
            ...(telemetry.lux !== null && Number(telemetry.lux) < 1.0
                ? ['Consider maintaining the grow light in AUTO mode while ambient light remains below 1.0 lux.']
                : ['Ambient light is sufficient. Maintain grow light in AUTO mode for night operation.']),
            ...(telemetry.temperature !== null && Number(telemetry.temperature) > 35
                ? ['Increase ventilation if the temperature continues to rise.']
                : []),
            ...(telemetry.humidity !== null && (Number(telemetry.humidity) < 30 || Number(telemetry.humidity) > 85)
                ? ['Humidity condition requires attention. Adjust ventilation and foggers.']
                : []),
            ...(telemetry.gasDetected
                ? ['Inspect the growing area for smoke or gas sources.']
                : []),
            ...(telemetry.rainDetected
                ? ['Review irrigation requirements while rain is detected.']
                : [])
        ];

    return (
        <div className="air-pollution-page">

            <Header />
            <Nav />
            <DashboardSubNav />

            <div className="dashboard">

                <div className="overview">

                    <div className="head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                        <h1>{t('dashCommon.overview')}</h1>
                        <AudioVoiceButton
                            text={alertSpeechEn}
                            hindiText={alertSpeechHi}
                            marathiText={alertSpeechMr}
                            label={t('dashCommon.speakOverview')}
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
                                    {telemetry.node1Online ? 'Continuous Monitoring Active' : 'NODE 1 OFFLINE'}
                                </p>

                            </div>

                            <div className="box1">

                                <h2>HEAT INDEX</h2>

                                <p
                                    className="unit"
                                    id="heatIndex"
                                >
                                    {telemetry.node1Online && heatIndex !== null ? heatIndex : 'N/A'}
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
                                    {telemetry.node1Online && telemetry.lux !== null ? telemetry.lux : 'N/A'}
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
                                    style={{ color: !telemetry.node1Online ? '#7f8c8d' : (telemetry.gasDetected ? '#c0392b' : '#65b32e') }}
                                >
                                    {!telemetry.node1Online
                                        ? 'N/A'
                                        : telemetry.gasDetected
                                            ? 'WARNING'
                                            : 'NORMAL'}
                                </p>

                            </div>

                            <div className="box4">

                                <h2>GROW LIGHT</h2>

                                <p
                                    className="unit"
                                    id="growLightDisplay"
                                    style={{ color: !telemetry.node1Online ? '#7f8c8d' : (telemetry.growLightState === 'ON' ? '#65b32e' : '#95a5a6') }}
                                >
                                    {telemetry.node1Online ? telemetry.growLightState : 'N/A'}
                                </p>

                            </div>

                            <div className="box5">

                                <h2>RAIN SENSOR</h2>

                                <p
                                    className="unit"
                                    id="rain"
                                    style={{ color: !telemetry.node1Online ? '#7f8c8d' : (telemetry.rainDetected ? '#2980b9' : '#65b32e') }}
                                >
                                    {!telemetry.node1Online
                                        ? 'N/A'
                                        : telemetry.rainDetected
                                            ? 'RAIN DETECTED'
                                            : 'NO RAIN'}
                                </p>

                            </div>

                            <div className="box51">

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h2>DROUGHT & ET₀ LOSS</h2>
                                    {etData ? (
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
                                    ) : null}
                                </div>

                                <p
                                    className="unit"
                                    id="et0"
                                    style={{ fontSize: etData ? '24px' : '18px' }}
                                >
                                    {etData ? (
                                        <>{etData.et0} <span style={{ fontSize: '14px', color: '#666' }}>mm/day</span></>
                                    ) : (
                                        'DATA INSUFFICIENT'
                                    )}
                                </p>

                                <p className="t1">
                                    {etData ? (
                                        <>Need: <strong>{etData.prescribedWaterLiters} L/m²</strong> ({etData.recommendedMinutes}m drip)</>
                                    ) : (
                                        'Live telemetry required for ET₀ calculation'
                                    )}
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
                                {telemetry.node1Online && telemetry.temperature !== null ? `${telemetry.temperature}` : 'N/A'}
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
                                {telemetry.node1Online ? stats.avgTemp : 'N/A'}
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
                                {telemetry.node1Online ? stats.minTemp : 'N/A'}
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
                                {telemetry.node1Online ? stats.maxTemp : 'N/A'}
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
                                {telemetry.node1Online && telemetry.humidity !== null ? `${telemetry.humidity}` : 'N/A'}
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
                                {telemetry.node1Online ? stats.avgHum : 'N/A'}
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
                                {telemetry.node1Online ? stats.minHum : 'N/A'}
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
                                {telemetry.node1Online ? stats.maxHum : 'N/A'}
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

                            <h2>GROW LIGHT</h2>

                            <p
                                className="exf"
                                id="exf"
                                style={{ color: telemetry.growLightState === 'ON' ? '#65b32e' : '#95a5a6' }}
                            >
                                {telemetry.growLightState}
                            </p>

                        </div>

                        <div className="modes">

                            <h2>GROW LIGHT CONTROL</h2>

                            <div className="m1">

                                <input
                                    type="radio"
                                    name="growLightControlMode"
                                    id="light_mode_on"
                                    checked={telemetry.growLightMode === 'ON'}
                                    onChange={() => handleLightControl('ON')}
                                />

                                <label htmlFor="light_mode_on">
                                    ON
                                </label>

                                <input
                                    type="radio"
                                    name="growLightControlMode"
                                    id="light_mode_off"
                                    checked={telemetry.growLightMode === 'OFF'}
                                    onChange={() => handleLightControl('OFF')}
                                />

                                <label htmlFor="light_mode_off">
                                    OFF
                                </label>

                                <input
                                    type="radio"
                                    name="growLightControlMode"
                                    id="light_mode_auto"
                                    checked={telemetry.growLightMode === 'AUTO'}
                                    onChange={() => handleLightControl('AUTO')}
                                />

                                <label htmlFor="light_mode_auto">
                                    AUTO
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
                            borderColor: !telemetry.node1Online ? '#7f8c8d' : (telemetry.gasDetected ? '#c0392b' : telemetry.rainDetected ? '#2980b9' : '#65b32e'),
                            background: !telemetry.node1Online
                                ? 'linear-gradient(135deg, #f2f4f4 0%, #e5e8e8 100%)'
                                : telemetry.gasDetected
                                    ? 'linear-gradient(135deg, #fbeaea 0%, #f7d5d5 100%)'
                                    : telemetry.rainDetected
                                        ? 'linear-gradient(135deg, #e9f2fb 0%, #d2e5f8 100%)'
                                        : 'linear-gradient(135deg, #e5f3df 0%, #d5edd0 100%)'
                        }}
                    >
                        <div className="alert-banner-left">
                            <div className="alert-banner-text">
                                <h3 style={{ color: !telemetry.node1Online ? '#566573' : (telemetry.gasDetected ? '#962d22' : telemetry.rainDetected ? '#1a5276' : '#124500') }}>
                                    {!telemetry.node1Online
                                        ? 'NODE 1 SENSOR CONNECTION LOST'
                                        : telemetry.gasDetected
                                            ? 'CRITICAL ALERT: GAS / SMOKE LEVEL ABOVE THRESHOLD'
                                            : telemetry.rainDetected
                                                ? 'METEOROLOGICAL ADVISORY: PRECIPITATION DETECTED'
                                                : telemetry.temperature > 35
                                                    ? 'THERMAL WATCH: ELEVATED CANOPY TEMPERATURE'
                                                    : 'SYSTEM HEALTH ALERT: ATMOSPHERIC PARAMETERS NOMINAL'}
                                </h3>
                                <p style={{ color: !telemetry.node1Online ? '#566573' : (telemetry.gasDetected ? '#78281f' : telemetry.rainDetected ? '#154360' : '#335522') }}>
                                    {!telemetry.node1Online
                                        ? 'Node 1 (Atmospheric) is offline or unreachable. Check hardware power and Wi-Fi connection.'
                                        : telemetry.gasDetected
                                            ? 'Gas/smoke level is above the configured threshold. Inspect growing area immediately.'
                                            : telemetry.rainDetected
                                                ? 'Active rainfall detected. Review greenhouse louvers and irrigation requirements.'
                                                : telemetry.temperature > 35
                                                    ? `Canopy temperature is ${telemetry.temperature}°C. High heat condition detected.`
                                                    : 'Sensors are streaming nominal telemetry within agronomic targets.'}
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
                                    background: !telemetry.node1Online ? '#7f8c8d' : (telemetry.gasDetected ? '#c0392b' : telemetry.rainDetected ? '#2980b9' : '#65b32e')
                                }}
                            >
                                {!telemetry.node1Online ? 'NODE 1 OFFLINE' : (telemetry.gasDetected ? 'HAZARD DETECTED' : telemetry.rainDetected ? 'RAIN ACTIVE' : 'ACTIVE MONITOR')}
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
                            {dynamicEvents.map((event, idx) => (
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
                                text={dynamicRecommendations.join(' ')}
                                label="Read All"
                            />
                        </div>

                        <ul className="intelligence-list">
                            {dynamicRecommendations.map((tip, idx) => (
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