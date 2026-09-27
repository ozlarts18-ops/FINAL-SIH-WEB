import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import DashboardSubNav from '../../components/DashboardSubNav';
import AudioVoiceButton from '../../components/AudioVoiceButton';
import { useLanguage } from '../../context/LanguageContext';
import { fetchLatestSensorData, fetchWaterQualityLogs } from '../../api/dataService';

import {
    initCharts,
    applyGraphFilter,
    downloadReport,
    destroyCharts
} from '../mainfunction2';

import './water.css';

const WaterQualityDashboard = () => {
    const { language, t } = useLanguage();
    const [alertDismissed, setAlertDismissed] = useState(false);

    const [telemetry, setTelemetry] = useState({
        device: 'ESP32-S3-02',
        node2Online: false,
        ph: null,
        tds: null,
        turbidity: null,
        tankLevel: null,
        waterTemp: null,
        soilMoisture: null,
        pumpState: 'OFF',
        pumpMode: 'AUTO'
    });

    const [stats, setStats] = useState({
        avgTemp: 'N/A',
        minTemp: 'N/A',
        maxTemp: 'N/A',
        avgPh: 'N/A',
        minPh: 'N/A',
        maxPh: 'N/A',
        hasHistory: false
    });

    const fetchLiveData = async () => {
        try {
            const data = await fetchLatestSensorData();
            const controlsRes = await fetch('/api/controls').then(r => r.ok ? r.json() : null).catch(() => null);
            const pumpActuator = controlsRes?.data?.find(a => a.actuator_type === 'water_pump');

            if (data && typeof data === 'object') {
                const node2 = data.node2 || {};
                const online = Boolean(data.node2 ? data.node2.online : (data.timestamp && Date.now() - new Date(data.timestamp).getTime() < 30000));

                const phVal = node2.ph ?? data.ph ?? null;
                const tdsVal = node2.tds_ppm ?? data.tds_ppm ?? null;
                const turbVal = node2.turbidity_ntu ?? data.turbidity_ntu ?? null;
                const tankVal = node2.water_tank_level_percent ?? data.water_tank_level_percent ?? null;
                const wTempVal = node2.water_temperature ?? data.water_temperature ?? null;
                const soilVal = node2.soil_moisture ?? data.soil_moisture ?? null;

                setTelemetry({
                    device: 'ESP32-S3-02',
                    node2Online: online,
                    ph: online && phVal !== null ? Number(phVal).toFixed(2) : null,
                    tds: online && tdsVal !== null ? Number(tdsVal).toFixed(1) : null,
                    turbidity: online && turbVal !== null ? Number(turbVal).toFixed(2) : null,
                    tankLevel: online && tankVal !== null ? Math.round(Number(tankVal)) : null,
                    waterTemp: online && wTempVal !== null ? Number(wTempVal).toFixed(1) : null,
                    soilMoisture: online && soilVal !== null ? Math.round(Number(soilVal)) : null,
                    pumpState: pumpActuator ? pumpActuator.current_state : (data.water_pump || 'OFF'),
                    pumpMode: pumpActuator ? (pumpActuator.control_mode === 'AUTOMATIC' ? 'AUTO' : pumpActuator.current_state) : 'AUTO'
                });
            } else {
                setTelemetry(prev => ({ ...prev, node2Online: false }));
            }
        } catch (_err) {
            setTelemetry(prev => ({ ...prev, node2Online: false }));
        }
    };

    const fetchHistoricalStats = async () => {
        try {
            const { data } = await fetchWaterQualityLogs(50);
            if (data && Array.isArray(data) && data.length > 0) {
                const temps = data
                    .map(d => Number(d.current_water_temp))
                    .filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));

                const phs = data
                    .map(d => Number(d.current_ph))
                    .filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));

                setStats({
                    avgTemp: temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : 'N/A',
                    minTemp: temps.length ? Math.min(...temps).toFixed(1) : 'N/A',
                    maxTemp: temps.length ? Math.max(...temps).toFixed(1) : 'N/A',
                    avgPh: phs.length ? (phs.reduce((a, b) => a + b, 0) / phs.length).toFixed(2) : 'N/A',
                    minPh: phs.length ? Math.min(...phs).toFixed(2) : 'N/A',
                    maxPh: phs.length ? Math.max(...phs).toFixed(2) : 'N/A',
                    hasHistory: true
                });
            } else {
                setStats({
                    avgTemp: 'N/A',
                    minTemp: 'N/A',
                    maxTemp: 'N/A',
                    avgPh: 'N/A',
                    minPh: 'N/A',
                    maxPh: 'N/A',
                    hasHistory: false
                });
            }
        } catch (_err) { }
    };

    const handlePumpControl = async (targetAction) => {
        if (targetAction === 'ON' && telemetry.tankLevel !== null && telemetry.tankLevel <= 5) {
            alert('Tank empty — automatic pump operation blocked for hardware safety.');
            return;
        }

        try {
            const res = await fetch('/api/controls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actuator_type: 'water_pump', action: targetAction })
            });
            if (res.ok) {
                const json = await res.json();
                const updatedState = json.data?.find(a => a.actuator_type === 'water_pump');
                if (updatedState) {
                    setTelemetry(prev => ({
                        ...prev,
                        pumpState: updatedState.current_state,
                        pumpMode: updatedState.control_mode === 'AUTOMATIC' ? 'AUTO' : updatedState.current_state
                    }));
                }
            }
        } catch (e) {
            console.warn('Water pump control command error:', e.message);
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

    const calculateWaterQualityScore = () => {
        if (!telemetry.node2Online || telemetry.ph === null || telemetry.tds === null) return null;
        let score = 100;
        const ph = Number(telemetry.ph);
        const tds = Number(telemetry.tds);
        const turb = telemetry.turbidity !== null ? Number(telemetry.turbidity) : null;
        const wTemp = telemetry.waterTemp !== null ? Number(telemetry.waterTemp) : null;

        if (ph < 6.0 || ph > 8.0) score -= 20;
        else if (ph < 6.5 || ph > 7.5) score -= 10;

        if (tds > 1000) score -= 25;
        else if (tds > 800 || tds < 300) score -= 10;

        if (turb !== null && turb > 5.0) score -= 15;
        if (wTemp !== null && (wTemp > 30 || wTemp < 15)) score -= 15;

        return Math.max(0, Math.min(100, Math.round(score)));
    };
    const waterQualityScore = calculateWaterQualityScore();

    const getWaterSystemStatus = () => {
        if (!telemetry.node2Online) return { label: 'NODE 2 OFFLINE', color: '#7f8c8d' };
        if (telemetry.tankLevel !== null && telemetry.tankLevel <= 5) return { label: 'TANK EMPTY', color: '#c0392b' };
        if (telemetry.ph !== null && (Number(telemetry.ph) < 5.5 || Number(telemetry.ph) > 8.0)) return { label: 'CRITICAL PH', color: '#c0392b' };
        if (telemetry.tds !== null && Number(telemetry.tds) > 1000) return { label: 'HIGH TDS', color: '#e67e22' };
        if (telemetry.turbidity !== null && Number(telemetry.turbidity) > 5.0) return { label: 'HIGH TURBIDITY', color: '#e67e22' };
        if (telemetry.tankLevel !== null && telemetry.tankLevel < 20) return { label: 'LOW TANK', color: '#e67e22' };
        return { label: 'OPTIMAL', color: '#3f8c20' };
    };
    const waterStatus = getWaterSystemStatus();

    const alertSpeechEn = !telemetry.node2Online
        ? 'Node 2 water telemetry is unavailable.'
        : telemetry.tankLevel !== null && telemetry.tankLevel <= 5
            ? 'Tank empty. Automatic pump operation blocked for hardware protection.'
            : telemetry.ph !== null && (Number(telemetry.ph) < 6.0 || Number(telemetry.ph) > 8.0)
                ? `Water pH is ${telemetry.ph}, which is outside the safe operating range.`
                : telemetry.tds !== null && Number(telemetry.tds) > 1000
                    ? `Total dissolved solids concentration is ${telemetry.tds} ppm, exceeding normal thresholds.`
                    : `Water system status optimal. pH is ${telemetry.ph || 'N/A'}, TDS is ${telemetry.tds || 'N/A'} ppm, and tank level is ${telemetry.tankLevel !== null ? telemetry.tankLevel + '%' : 'N/A'}.`;

    const alertSpeechHi = !telemetry.node2Online
        ? 'नोड 2 जल सेंसर कनेक्शन उपलब्ध नहीं है।'
        : telemetry.tankLevel !== null && telemetry.tankLevel <= 5
            ? 'टैंक खाली है। पंप परिचालन अवरुद्ध।'
            : `जल प्रणाली की स्थिति: pH ${telemetry.ph || 'N/A'}, TDS ${telemetry.tds || 'N/A'} ppm है।`;

    const alertSpeechMr = !telemetry.node2Online
        ? 'नोड 2 जल सेन्सर कनेक्शन उपलब्ध नाही.'
        : `पाणी गुणवत्ता स्थिती: pH ${telemetry.ph || 'N/A'}, TDS ${telemetry.tds || 'N/A'} ppm आहे.`;

    const dynamicEvents = !telemetry.node2Online
        ? [
            {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '⚠️',
                title: 'NODE 2 SENSOR CONNECTION LOST',
                level: 'high',
                details: ['Node 2 (Hydroponics & Substrate) is offline or unreachable.', 'Check hardware power and Wi-Fi connection.']
            }
        ]
        : [
            ...(telemetry.tankLevel !== null && telemetry.tankLevel <= 5 ? [{
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '🛑',
                title: 'TANK EMPTY — AUTOMATIC PUMP OPERATION BLOCKED',
                level: 'high',
                details: ['Reservoir level critical (<= 5%).', 'Refill water tank before restarting pump.']
            }] : []),
            ...(telemetry.ph !== null && (Number(telemetry.ph) < 6.0 || Number(telemetry.ph) > 8.0) ? [{
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '🧪',
                title: 'WATER PH OUTSIDE SAFE RANGE',
                level: 'high',
                details: [`Current pH: ${telemetry.ph}`, 'Target range: 6.0 - 7.5 pH']
            }] : []),
            ...(telemetry.tds !== null && Number(telemetry.tds) > 1000 ? [{
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '💧',
                title: 'HIGH TDS CONCENTRATION DETECTED',
                level: 'medium',
                details: [`Current TDS: ${telemetry.tds} ppm`, 'Exceeds recommended nutrient threshold']
            }] : []),
            ...(telemetry.pumpState === 'ON' ? [{
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '🚰',
                title: 'WATER PUMP IS CURRENTLY RUNNING',
                level: 'positive',
                details: ['DC Pump relay active.', 'Monitoring tank capacity and flow']
            }] : []),
            {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: '📡',
                title: 'NODE 2 TELEMETRY STREAMING',
                level: 'positive',
                details: [
                    `pH: ${telemetry.ph !== null ? telemetry.ph : 'N/A'}`,
                    `TDS: ${telemetry.tds !== null ? telemetry.tds + ' ppm' : 'N/A'}`,
                    `Tank Level: ${telemetry.tankLevel !== null ? telemetry.tankLevel + ' %' : 'N/A'}`
                ]
            }
        ];

    const dynamicRecommendations = !telemetry.node2Online
        ? ['Check Node 2 network/power connection.']
        : [
            ...(telemetry.tankLevel !== null && telemetry.tankLevel <= 20
                ? ['Refill the water reservoir before automatic irrigation is required.']
                : []),
            ...(telemetry.ph !== null && (Number(telemetry.ph) < 6.0 || Number(telemetry.ph) > 7.5)
                ? ['Check and correct the water solution pH to maintain nutrient availability.']
                : ['Water pH is currently within the configured safe operating range.']),
            ...(telemetry.tds !== null && Number(telemetry.tds) > 800
                ? ['Review nutrient concentration and reservoir dilution condition.']
                : []),
            ...(telemetry.turbidity !== null && Number(telemetry.turbidity) > 5.0
                ? ['Inspect the reservoir and filtration system for suspended particles.']
                : []),
            ...(telemetry.pumpState === 'ON'
                ? ['DC Pump active. Ensure adequate reservoir depth during irrigation cycle.']
                : [])
        ];

    return (
        <div className="water-quality-page">

            <Header />
            <Nav />
            <DashboardSubNav />

            <div className="dashboard">

                <div className="overview">

                    <div className="head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <h1>{t('dashCommon.overview')}</h1>
                            <p className="subtext">{language === 'hi' ? 'वास्तविक समय जल गुणवत्ता, पोषक तत्व सांद्रता एवं टेलीमेट्री' : 'Real-time water quality, nutrient concentration & telemetry'}</p>
                        </div>
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
                                <h2>WATER SYSTEM STATUS</h2>
                                <p
                                    className="unit"
                                    id="st"
                                    style={{ color: waterStatus.color, fontSize: waterStatus.label.length > 10 ? '24px' : '36px' }}
                                >
                                    {waterStatus.label}
                                </p>
                            </div>

                            <div className="box1">
                                <h2>PH LEVEL</h2>
                                <p className="unit" id="phl">
                                    {telemetry.node2Online && telemetry.ph !== null ? telemetry.ph : 'N/A'}
                                </p>
                            </div>

                            <div className="box2">
                                <h2>TOTAL DISSOLVED SOLIDS (TDS)</h2>
                                <p className="unit" id="tds">
                                    {telemetry.node2Online && telemetry.tds !== null ? telemetry.tds : 'N/A'}
                                </p>
                                <p className="t1">ppm</p>
                            </div>
                        </div>

                        <div className="right">
                            <div className="box3">
                                <h2>TURBIDITY</h2>
                                <p className="unit" id="wt">
                                    {telemetry.node2Online && telemetry.turbidity !== null ? telemetry.turbidity : 'N/A'}
                                </p>
                                <p className="t1">NTU</p>
                            </div>

                            <div className="box4">
                                <h2>WATER TANK LEVEL</h2>
                                <p className="unit" id="tl">
                                    {telemetry.node2Online && telemetry.tankLevel !== null ? `${telemetry.tankLevel}%` : 'N/A'}
                                </p>
                            </div>

                            <div className="box5">
                                <h2>PUMP STATUS</h2>
                                <p
                                    className="unit"
                                    id="ps"
                                    style={{ color: !telemetry.node2Online ? '#7f8c8d' : (telemetry.pumpState === 'ON' ? '#65b32e' : '#95a5a6') }}
                                >
                                    {telemetry.node2Online ? telemetry.pumpState : 'N/A'}
                                </p>
                            </div>

                            <div className="box51">
                                <h2>WATER QUALITY SCORE</h2>
                                <p className="unit" id="aqs">
                                    {telemetry.node2Online && waterQualityScore !== null ? `${waterQualityScore}/100` : 'N/A'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="temp">
                        <div className="box6">
                            <h2>CURRENT WATER TEMPERATURE</h2>
                            <p className="unit" id="ct1">
                                {telemetry.node2Online && telemetry.waterTemp !== null ? telemetry.waterTemp : 'N/A'}
                            </p>
                            <p className="t1">Celsius</p>
                        </div>

                        <div className="box7">
                            <h2>AVERAGE WATER TEMPERATURE</h2>
                            <p className="unit" id="ct2">{telemetry.node2Online ? stats.avgTemp : 'N/A'}</p>
                            <p className="t1">Celsius</p>
                        </div>

                        <div className="box8">
                            <h2>MIN WATER TEMPERATURE</h2>
                            <p className="unit" id="ct3">{telemetry.node2Online ? stats.minTemp : 'N/A'}</p>
                            <p className="t1">Celsius</p>
                        </div>

                        <div className="box9">
                            <h2>MAX WATER TEMPERATURE</h2>
                            <p className="unit" id="ct4">{telemetry.node2Online ? stats.maxTemp : 'N/A'}</p>
                            <p className="t1">Celsius</p>
                        </div>
                    </div>

                    <div className="hum">
                        <div className="box10">
                            <h2>CURRENT PH</h2>
                            <p className="unit" id="ht1">
                                {telemetry.node2Online && telemetry.ph !== null ? telemetry.ph : 'N/A'}
                            </p>
                        </div>

                        <div className="box11">
                            <h2>AVERAGE PH</h2>
                            <p className="unit" id="ht2">{telemetry.node2Online ? stats.avgPh : 'N/A'}</p>
                        </div>

                        <div className="box12">
                            <h2>MIN PH</h2>
                            <p className="unit" id="ht3">{telemetry.node2Online ? stats.minPh : 'N/A'}</p>
                        </div>

                        <div className="box13">
                            <h2>MAX PH</h2>
                            <p className="unit" id="ht4">{telemetry.node2Online ? stats.maxPh : 'N/A'}</p>
                        </div>
                    </div>

                </div>

            </div>

            <div className="dashboard2">

                <div className="controls">

                    <div className="head">
                        <h1>CONTROLS</h1>
                        <p className="subtext">Actuator relays and telemetry timeframe filters</p>
                    </div>

                    <div className="panel">

                        <div className="exn">
                            <h2>DC WATER PUMP</h2>
                            <p
                                className="exf"
                                id="exf"
                                style={{ color: telemetry.pumpState === 'ON' ? '#65b32e' : '#95a5a6' }}
                            >
                                {telemetry.pumpState}
                            </p>
                        </div>

                        <div className="modes">
                            <h2>PUMP MODES</h2>
                            <div className="m1">
                                <input
                                    type="radio"
                                    name="pumpControlMode"
                                    id="pump_mode_on"
                                    checked={telemetry.pumpMode === 'ON'}
                                    onChange={() => handlePumpControl('ON')}
                                />
                                <label htmlFor="pump_mode_on">ON</label>

                                <input
                                    type="radio"
                                    name="pumpControlMode"
                                    id="pump_mode_off"
                                    checked={telemetry.pumpMode === 'OFF'}
                                    onChange={() => handlePumpControl('OFF')}
                                />
                                <label htmlFor="pump_mode_off">OFF</label>

                                <input
                                    type="radio"
                                    name="pumpControlMode"
                                    id="pump_mode_auto"
                                    checked={telemetry.pumpMode === 'AUTO'}
                                    onChange={() => handlePumpControl('AUTO')}
                                />
                                <label htmlFor="pump_mode_auto">AUTOMATIC</label>
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
                                    onChange={() => applyGraphFilter('daily')}
                                />
                                <label htmlFor="daily">DAILY</label>

                                <input
                                    type="radio"
                                    name="graphFilter"
                                    id="weekly"
                                    onChange={() => applyGraphFilter('weekly')}
                                />
                                <label htmlFor="weekly">WEEKLY</label>

                                <input
                                    type="radio"
                                    name="graphFilter"
                                    id="monthly"
                                    onChange={() => applyGraphFilter('monthly')}
                                />
                                <label htmlFor="monthly">MONTHLY</label>
                            </div>
                        </div>

                    </div>

                </div>

            </div>

            <div className="graphs">

                <div className="glayout">

                    <div className="head">
                        <h1>GRAPHS</h1>
                        <p className="subtext">Dynamic physiological & chemical water metrics</p>
                    </div>

                    <div className="gly1">
                        <div className="c1">
                            <canvas id="PHTrend"></canvas>
                        </div>

                        <div className="c2">
                            <canvas id="TDSTrend"></canvas>
                        </div>

                        <div className="c3">
                            <canvas id="TurbidityTrend"></canvas>
                        </div>
                    </div>

                    <div className="c4">
                        <canvas id="WaterQualityScore"></canvas>
                    </div>

                    <div className="gly2">
                        <div className="c5">
                            <canvas id="WaterTemperature"></canvas>
                        </div>

                        <div className="c6">
                            <canvas id="WaterTankCapacity"></canvas>
                        </div>

                        <div className="c7">
                            <canvas id="PumpRuntime"></canvas>
                        </div>
                    </div>

                </div>

            </div>

            <div className="alert-section-wrapper">

                {!alertDismissed && (
                    <div
                        className="water-alert-banner"
                        style={{
                            borderColor: !telemetry.node2Online ? '#7f8c8d' : (telemetry.tankLevel !== null && telemetry.tankLevel <= 5 ? '#c0392b' : '#65b32e'),
                            background: !telemetry.node2Online
                                ? 'linear-gradient(135deg, #f2f4f4 0%, #e5e8e8 100%)'
                                : telemetry.tankLevel !== null && telemetry.tankLevel <= 5
                                    ? 'linear-gradient(135deg, #fbeaea 0%, #f7d5d5 100%)'
                                    : 'linear-gradient(135deg, #e5f3df 0%, #d5edd0 100%)'
                        }}
                    >
                        <div className="alert-banner-left">
                            <div className="alert-banner-text">
                                <h3 style={{ color: !telemetry.node2Online ? '#566573' : (telemetry.tankLevel !== null && telemetry.tankLevel <= 5 ? '#962d22' : '#124500') }}>
                                    {!telemetry.node2Online
                                        ? 'NODE 2 SENSOR CONNECTION LOST'
                                        : telemetry.tankLevel !== null && telemetry.tankLevel <= 5
                                            ? 'CRITICAL ALERT: TANK EMPTY — PUMP OPERATION BLOCKED'
                                            : telemetry.ph !== null && (Number(telemetry.ph) < 6.0 || Number(telemetry.ph) > 8.0)
                                                ? 'CHEMICAL ADVISORY: PH OUTSIDE SAFE OPERATING RANGE'
                                                : 'SYSTEM HEALTH ALERT: WATER PARAMETERS OPTIMAL'}
                                </h3>
                                <p style={{ color: !telemetry.node2Online ? '#566573' : (telemetry.tankLevel !== null && telemetry.tankLevel <= 5 ? '#78281f' : '#335522') }}>
                                    {!telemetry.node2Online
                                        ? 'Node 2 (Hydroponics & Substrate) is offline. Check hardware power and Wi-Fi connection.'
                                        : telemetry.tankLevel !== null && telemetry.tankLevel <= 5
                                            ? 'Water tank level is critical (<= 5%). Automatic pump operation is blocked to prevent motor burn.'
                                            : telemetry.ph !== null && (Number(telemetry.ph) < 6.0 || Number(telemetry.ph) > 8.0)
                                                ? `Water pH is ${telemetry.ph}. Adjust pH buffer solution to restore optimal nutrient absorption.`
                                                : 'Water quality & irrigation parameters are streaming within agronomic safety bounds.'}
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
                                    background: !telemetry.node2Online ? '#7f8c8d' : (telemetry.tankLevel !== null && telemetry.tankLevel <= 5 ? '#c0392b' : '#65b32e')
                                }}
                            >
                                {!telemetry.node2Online ? 'NODE 2 OFFLINE' : (telemetry.tankLevel !== null && telemetry.tankLevel <= 5 ? 'TANK EMPTY' : 'ACTIVE MONITOR')}
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
                            <h1>WATER QUALITY ALERTS & SYSTEM EVENTS</h1>
                            <p className="subtext">Telemetry logs and threshold observations</p>
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
                                <h1>D. WATER INTELLIGENCE & RECOMMENDATIONS</h1>
                                <p className="subtext">Automated agronomic observations & actions</p>
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
                        <h1>Download Reports</h1>
                        <p className="subtext">Export structured telemetry reports</p>
                    </div>

                    <button onClick={() => downloadReport('daily')}>Daily</button>
                    <button onClick={() => downloadReport('weekly')}>Weekly</button>
                    <button onClick={() => downloadReport('monthly')}>Monthly</button>

                </div>

            </div>

            <Footer />

        </div>
    );
};

export default WaterQualityDashboard;