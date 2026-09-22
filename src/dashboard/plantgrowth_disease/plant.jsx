import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import DashboardSubNav from '../../components/DashboardSubNav';
import AudioVoiceButton from '../../components/AudioVoiceButton';

import {
    initCharts,
    applyGraphFilter,
    downloadReport,
    destroyCharts,
    ESP32_STREAM_URL,
    plantEvents,
    plantRecommendations,
    readImageFile,
    NUTRIENT_DEFICIENCY_MATRIX,
    evaluateWaterloggingRisk
} from '../mainfunction3';

import { analyzePlantDiseaseImage, fetchLatestSensorData, fetchCameraStatus } from '../../api/dataService';
import './plant.css';

const PlantHealthDashboard = () => {
    const [selectedCrop, setSelectedCrop] = useState('Tomato');
    const [cameraConnected, setCameraConnected] = useState(false);
    const [cameraFrame, setCameraFrame] = useState(null);
    const [cameraUrl, setCameraUrl] = useState(ESP32_STREAM_URL || '/api/camera/stream');
    const [uploadedImage, setUploadedImage] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [alertDismissed, setAlertDismissed] = useState(false);
    const [eventsList, setEventsList] = useState(plantEvents);
    const [recommendationsList, setRecommendationsList] = useState(plantRecommendations);
    const [activeNutrientModal, setActiveNutrientModal] = useState(null);
    const [waterloggingData, setWaterloggingData] = useState(() => evaluateWaterloggingRisk(false, 68));

    useEffect(() => {
        initCharts();

        let isMounted = true;
        const checkCamera = async () => {
            try {
                const status = await fetchCameraStatus();
                if (isMounted) {
                    if (status && status.connected) {
                        setCameraConnected(true);
                        if (status.streamUrl) {
                            setCameraUrl(status.streamUrl);
                        }
                    } else {
                        setCameraConnected(false);
                        setCameraFrame(null);
                    }
                }
            } catch (_e) {
                if (isMounted) {
                    setCameraConnected(false);
                    setCameraFrame(null);
                }
            }
        };

        checkCamera();
        const cameraInterval = setInterval(checkCamera, 8000);

        const syncInterval = setInterval(() => {
            fetchLatestSensorData().then(s => {
                if (s && isMounted) {
                    const isRaining = Boolean(s.rain_detected || s.rainDetected);
                    const moist = Number(s.soil_moisture ?? 68);
                    setWaterloggingData(evaluateWaterloggingRisk(isRaining, moist));
                }
            }).catch(() => {});
        }, 15000);

        return () => {
            isMounted = false;
            destroyCharts();
            clearInterval(cameraInterval);
            clearInterval(syncInterval);
        };
    }, []);

    const handleUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        readImageFile(file, async (base64Img) => {
            setUploadedImage(base64Img);
            setIsAnalyzing(true);
            setAiResult(null);

            try {
                const result = await analyzePlantDiseaseImage({
                    image: base64Img,
                    cropName: selectedCrop
                });
                if (result && result.disease_name && !result.isMock) {
                    setAiResult(result);
                } else {
                    setAiResult(null);
                }
            } catch (err) {
                console.error('Plant AI inference error:', err);
                setAiResult(null);
            } finally {
                setIsAnalyzing(false);
            }
        });
    };

    const clearUpload = () => {
        setUploadedImage(null);
        setIsAnalyzing(false);
        setAiResult(null);
    };

    // Baseline Overview data (separated from ad-hoc manual image uploads)
    const activeHealthScore = aiResult?.health_score || aiResult?.healthScore || '88/100';
    const currentCropHealth = aiResult ? (aiResult.disease_risk === 'LOW' ? 'Optimal (Healthy)' : `Alert (${aiResult.disease || aiResult.disease_name})`) : 'Good (Optimal)';
    const currentDiseaseRisk = aiResult?.disease_risk || 'LOW';
    const currentNutrientStatus = 'OPTIMAL (BALANCED NPK)';
    const currentTimestamp = aiResult ? 'Real-time YOLO scan' : 'Awaiting telemetry';

    const activeAiImage = uploadedImage || (cameraConnected && cameraFrame ? cameraFrame : null);

    const getBoxesToRender = () => {
        if (!aiResult) return [];

        const rawBoxes = aiResult.bounding_boxes || aiResult.boxes || [];
        if (rawBoxes.length > 0) {
            return rawBoxes.map(b => {
                if (b.x !== undefined && b.width !== undefined) {
                    const isFraction = b.width <= 1.0 && b.height <= 1.0;
                    return {
                        left: isFraction ? b.x * 100 : b.x,
                        top: isFraction ? b.y * 100 : b.y,
                        width: isFraction ? b.width * 100 : b.width,
                        height: isFraction ? b.height * 100 : b.height,
                        label: b.label || b.class_name || aiResult.disease || '',
                        conf: b.conf || (b.confidence ? Math.round(b.confidence * 100) : null)
                    };
                }
                const origW = aiResult.image_width || 1;
                const origH = aiResult.image_height || 1;
                const x1 = b.x1 ?? b.bbox?.[0] ?? 0;
                const y1 = b.y1 ?? b.bbox?.[1] ?? 0;
                const x2 = b.x2 ?? b.bbox?.[2] ?? 0;
                const y2 = b.y2 ?? b.bbox?.[3] ?? 0;
                return {
                    left: (x1 / origW) * 100,
                    top: (y1 / origH) * 100,
                    width: ((x2 - x1) / origW) * 100,
                    height: ((y2 - y1) / origH) * 100,
                    label: b.label || b.class_name || aiResult.disease || '',
                    conf: b.conf || (b.confidence ? Math.round(b.confidence * 100) : null)
                };
            });
        }

        if (aiResult.detections && aiResult.detections.length > 0) {
            const origW = aiResult.image_width || 1;
            const origH = aiResult.image_height || 1;
            return aiResult.detections.map(d => {
                const [x1, y1, x2, y2] = d.bbox || [0, 0, 0, 0];
                return {
                    left: (x1 / origW) * 100,
                    top: (y1 / origH) * 100,
                    width: ((x2 - x1) / origW) * 100,
                    height: ((y2 - y1) / origH) * 100,
                    label: d.class_name || aiResult.disease || '',
                    conf: d.confidence_pct || (d.confidence ? Math.round(d.confidence * 100) : null)
                };
            });
        }

        return [];
    };

    const renderedBoxes = getBoxesToRender();

    return (
        <div className="plant-health-page">

            <Header />
            <Nav />
            <DashboardSubNav />

            <div className="ai-model">

                <div className="head">
                    <h1>CROP AI DETECTION</h1>
                </div>

                <div className="ai-panels">

                    <div className="cam-panel live-camera">
                        <div className="cam-panel-header">
                            <h2>LIVE CANOPY</h2>
                            <span className={`status-pill ${cameraConnected ? 'pill-online' : 'pill-idle'}`}>
                                <span className="status-dot"></span>
                                {cameraConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>

                        {!cameraConnected ? (
                            <div className="canopy-empty-state">
                                <svg className="empty-state-svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                                <p className="empty-state-title">Waiting for camera...</p>
                            </div>
                        ) : !cameraFrame ? (
                            <div className="canopy-empty-state">
                                <span className="live-rec-dot"></span>
                                <p className="empty-state-title">Waiting for camera feed...</p>
                            </div>
                        ) : (
                            <div className="cam-frame">
                                <img
                                    src={cameraFrame}
                                    alt="Live ESP32-CAM Canopy Feed"
                                    className="cam-live-feed"
                                />
                                <div className="cam-hud-badge">
                                    <span className="live-rec-dot"></span>
                                    <span>LIVE STREAM</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="cam-panel manual-upload">
                        <div className="cam-panel-header">
                            <h2>MANUAL VERIFICATION</h2>
                            <span className={`status-pill ${uploadedImage ? 'pill-upload' : 'pill-idle'}`}>
                                <span className="status-dot"></span>
                                {uploadedImage ? (isAnalyzing ? 'Analyzing' : 'Ready') : 'Awaiting Input'}
                            </span>
                        </div>
                        <div className="upload-container">
                            {uploadedImage ? (
                                <>
                                    <div className="upload-preview-wrapper">
                                        <img
                                            src={uploadedImage}
                                            alt="Uploaded plant specimen"
                                            className="upload-preview-image"
                                        />
                                        {isAnalyzing && (
                                            <div className="upload-analyzing-badge">
                                                <span className="upload-spinner"></span>
                                                Scanning Leaf...
                                            </div>
                                        )}
                                    </div>
                                    <div className="upload-actions">
                                        <label htmlFor="plantUpload" className="upload-label upload-label-secondary">
                                            Change Image
                                        </label>
                                        <button
                                            className="clear-upload"
                                            onClick={clearUpload}
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <label htmlFor="plantUpload" className="upload-dropzone">
                                    <span className="upload-label-text">Click to upload leaf photo</span>
                                    <span className="upload-hint">JPG or PNG (Ad-hoc AI Verification)</span>
                                </label>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                id="plantUpload"
                                onChange={handleUpload}
                                hidden
                            />
                        </div>
                    </div>

                    <div className="cam-panel output-section">
                        <div className="cam-panel-header">
                            <h2>AI DIAGNOSTICS</h2>
                            <span className={`status-pill ${isAnalyzing ? 'pill-analyzing' : (aiResult ? 'pill-online' : 'pill-idle')}`}>
                                <span className="status-dot"></span>
                                {isAnalyzing ? 'Analyzing...' : (aiResult ? 'Diagnosed' : 'Awaiting Analysis')}
                            </span>
                        </div>
                        {!activeAiImage || (!isAnalyzing && !aiResult) ? (
                            <div className="diagnostics-empty-state">
                                <svg className="empty-state-svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <p className="empty-state-title">
                                    {isAnalyzing ? 'Analyzing...' : 'Waiting for image analysis'}
                                </p>
                            </div>
                        ) : (
                            <div className="output-frame" style={{ position: 'relative' }}>
                                <div className="ai-output-container">
                                    <div className="detection-image-container">
                                        <img
                                            src={activeAiImage}
                                            alt="AI Detection Output"
                                            className="output-image"
                                        />

                                        {isAnalyzing && (
                                            <div className="ai-scanning-overlay">
                                                <div className="scanner-laser-bar"></div>
                                                <div className="scanning-hud-tag">
                                                    <span className="radar-ping"></span>
                                                    <span>Scanning...</span>
                                                </div>
                                            </div>
                                        )}

                                        {!isAnalyzing && renderedBoxes.length > 0 && (
                                            <div className="yolo-overlay">
                                                {renderedBoxes.map((box, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="yolo-bounding-box"
                                                        style={{
                                                            left: `${box.left}%`,
                                                            top: `${box.top}%`,
                                                            width: `${box.width}%`,
                                                            height: `${box.height}%`
                                                        }}
                                                    >
                                                        {box.label && (
                                                            <span className="yolo-box-label">
                                                                {box.label} {box.conf ? `${box.conf}%` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>


            </div>

            <div className="dashboard">

                <div className="overview">

                    <div className="head">
                        <h1>OVERVIEW</h1>
                    </div>

                    <div className="main">

                        <div className="left">

                            <div className="status">
                                <h2>CROP HEALTH</h2>
                                <p className={`unit ${aiResult?.disease_risk === 'HIGH' ? 'text-hazard' : ''}`} id="cropHealth">
                                    {currentCropHealth}
                                </p>
                            </div>

                            <div className="box0">
                                <h2>TYPE OF PLANT</h2>
                                <p className="unit" id="plantType" style={{ fontSize: '24px', margin: '4px 0 2px 0' }}>
                                    Tomato
                                </p>
                                <p style={{ fontSize: '13px', fontWeight: '600', color: '#40533b', margin: '0 0 2px 0' }}>
                                    Roma Tomato
                                </p>
                                <p className="t1">
                                    Solanum lycopersicum
                                </p>
                            </div>

                            <div className="box1">
                                <h2>SOIL MOISTURE</h2>
                                <p className="unit" id="soilMoisture">68%</p>
                            </div>

                            <div className="box2">
                                <h2>SOIL TEMPERATURE</h2>
                                <p className="unit" id="soilTemp">32</p>
                                <p className="t1">°C</p>
                            </div>

                        </div>

                        <div className="right">

                            <div className="box3">
                                <h2>PLANT HEALTH SCORE</h2>
                                <p className="unit" id="plantHealthScore">{activeHealthScore}</p>
                            </div>

                            <div className="box4">
                                <h2>DISEASE RISK</h2>
                                <p className={`unit severity-indicator sev-${currentDiseaseRisk.toLowerCase()}`} id="diseaseRisk">
                                    {currentDiseaseRisk}
                                </p>
                            </div>

                            <div className="box5">
                                <h2>NUTRIENTS STATUS</h2>
                                <p className="unit" id="nutrientStatus">{currentNutrientStatus}</p>
                            </div>

                            <div className="box51">
                                <h2>LAST UPDATED</h2>
                                <p className="unit" id="lastUpdated">{currentTimestamp}</p>
                            </div>

                        </div>

                    </div>

                    <div className="temp">

                        <div className="box6">
                            <h2>CURRENT SOIL TEMPERATURE</h2>
                            <p className="unit" id="ct1">27.5</p>
                            <p className="t1">Celsius</p>
                        </div>

                        <div className="box7">
                            <h2>AVERAGE SOIL TEMPERATURE</h2>
                            <p className="unit" id="ct2">27.5</p>
                            <p className="t1">Celsius</p>
                        </div>

                        <div className="box8">
                            <h2>MIN SOIL TEMPERATURE</h2>
                            <p className="unit" id="ct3">27.5</p>
                            <p className="t1">Celsius</p>
                        </div>

                        <div className="box9">
                            <h2>MAX SOIL TEMPERATURE</h2>
                            <p className="unit" id="ct4">27.5</p>
                            <p className="t1">Celsius</p>
                        </div>

                    </div>

                    <div className="hum">

                        <div className="box10">
                            <h2>CURRENT SOIL MOISTURE</h2>
                            <p className="unit" id="ht1">27.5</p>
                        </div>

                        <div className="box11">
                            <h2>AVERAGE SOIL MOISTURE</h2>
                            <p className="unit" id="ht2">27.5</p>
                        </div>

                        <div className="box12">
                            <h2>MIN SOIL MOISTURE</h2>
                            <p className="unit" id="ht3">27.5</p>
                        </div>

                        <div className="box13">
                            <h2>MAX SOIL MOISTURE</h2>
                            <p className="unit" id="ht4">27.5</p>
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
                    </div>

                    <div className="gly1">

                        <div className="c1">
                            <canvas id="SoilMoistureTrend"></canvas>
                        </div>

                        <div className="c2">
                            <canvas id="SoilTemperature"></canvas>
                        </div>

                        <div className="c3">
                            <canvas id="PlantHealthScore"></canvas>
                        </div>

                    </div>

                    <div className="c4">
                        <canvas id="AIDetectionConfidence"></canvas>
                    </div>

                    <div className="gly2">

                        <div className="c5">
                            <canvas id="IrrigationActivity"></canvas>
                        </div>

                        <div className="c6">
                            <canvas id="CropHealthDetection"></canvas>
                        </div>

                        <div className="c7">
                            <canvas id="LastUpdated"></canvas>
                        </div>

                    </div>

                </div>

            </div>

            <div className="alert-section-wrapper">

                {waterloggingData.flood_risk_level !== 'NONE' && (
                    <div className={`plant-alert-banner waterlog-banner banner-${waterloggingData.flood_risk_level === 'CRITICAL' ? 'high' : 'medium'}`} style={{ marginBottom: '16px' }}>
                        <div className="alert-banner-left">
                            <span className="alert-badge-icon"></span>
                            <div className="alert-banner-text">
                                <h3>{waterloggingData.alert_title}</h3>
                                <p>{waterloggingData.advisory.en}</p>
                                <div style={{ marginTop: '6px', fontSize: '11px', color: '#666', display: 'flex', gap: '12px' }}>
                                    <span>Soil Moisture: <strong>{waterloggingData.soil_moisture_percent}%</strong></span>
                                    <span>Rain Status: <strong>{waterloggingData.rain_detected ? 'Active Rain' : 'No Rain'}</strong></span>
                                    <span>Drainage Pump: <strong style={{ color: waterloggingData.recommended_pump_action === 'DRAINAGE_ON' ? '#dc2626' : '#16a34a' }}>{waterloggingData.recommended_pump_action}</strong></span>
                                </div>
                            </div>
                        </div>
                        <div className="alert-banner-actions">
                            <AudioVoiceButton
                                text={waterloggingData.advisory.en}
                                hindiText={waterloggingData.advisory.hi}
                                marathiText={waterloggingData.advisory.mr}
                                label="Listen Advisory"
                            />
                            <span className={`alert-status-pill ${waterloggingData.flood_risk_level === 'CRITICAL' ? 'pill-offline' : 'pill-analyzing'}`} style={{ textTransform: 'uppercase' }}>
                                {waterloggingData.flood_risk_level} FLOOD RISK
                            </span>
                        </div>
                    </div>
                )}

                {!alertDismissed && (
                    <div className={`plant-alert-banner banner-${(aiResult?.disease_risk || 'low').toLowerCase()}`}>
                        <div className="alert-banner-left">
                            <span className="alert-badge-icon">
                            </span>
                            <div className="alert-banner-text">
                                <h3>
                                    {aiResult
                                        ? `AI PATHOLOGY REPORT: ${aiResult.disease_name?.toUpperCase()}`
                                        : 'SYSTEM HEALTH ALERT: CANOPY & ROOT ZONE OPTIMAL'}
                                </h3>
                                <p>
                                    {aiResult
                                        ? aiResult.treatment_advice
                                        : 'Soil moisture, root temperature, and vegetative growth index are within target parameters. Automated irrigation standby active.'}
                                </p>
                            </div>
                        </div>
                        <div className="alert-banner-actions">
                            <AudioVoiceButton
                                text={aiResult ? `Plant Pathology Alert for ${aiResult.disease_name}. ${aiResult.treatment_advice}` : 'Crop health status is optimal. All sensors and growth indices are normal.'}
                                hindiText={aiResult ? `पादप रोग चेतावनी: ${aiResult.disease_name}। उपचार सलाह: ${aiResult.treatment_advice}` : 'फसल स्वास्थ्य इष्टतम है। सभी सेंसर और विकास सूचकांक सामान्य हैं।'}
                                marathiText={aiResult ? `पीक रोग इशारा: ${aiResult.disease_name}. उपचार सल्ला: ${aiResult.treatment_advice}` : 'पिकाचे आरोग्य उत्तम आहे. सर्व सेन्सर सामान्य आहेत.'}
                                label="Speak Alert"
                            />
                            <span className="alert-status-pill">
                                {aiResult ? `${aiResult.confidence_score}% Match` : 'Active Monitor'}
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
                            <h1>PLANT HEALTH ALERTS & SYSTEM EVENTS</h1>
                            <p className="subtext">Canopy diagnostics and physiological anomaly observations</p>
                        </div>

                        <div className="events-list">
                            {eventsList.map((event, idx) => (
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
                        <div className="head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h1>D. PLANT INTELLIGENCE & RECOMMENDATIONS</h1>
                                <p className="subtext">
                                    Automated agronomic observations and recommendations
                                </p>
                            </div>
                            <AudioVoiceButton
                                text={recommendationsList.join('. ')}
                                label="Read All"
                            />
                        </div>

                        <ul className="intelligence-list">
                            {recommendationsList.map((tip, idx) => (
                                <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                    <span>{tip}</span>
                                    <AudioVoiceButton
                                        text={tip}
                                        label="Voice"
                                    />
                                </li>
                            ))}
                        </ul>
                    </div>

                </div>

                <div className="nutrient-matrix-section">
                    <div className="head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h1>N-P-K & MICRONUTRIENT VISUAL DIAGNOSTIC MATRIX</h1>
                            <p className="subtext">
                                Early field deficiency diagnostics & low-cost Indian organic remedies (Jeevamrut, Wood Ash, Bone Meal, Epsom Salt)
                            </p>
                        </div>
                        <span className="nutrient-tag-badge">Zero-Cost Indian Bio-Remedies</span>
                    </div>

                    <div className="nutrient-grid">
                        {NUTRIENT_DEFICIENCY_MATRIX.map((nut) => (
                            <div
                                key={nut.id}
                                className="nutrient-card"
                                onClick={() => setActiveNutrientModal(nut)}
                            >
                                <div className="nutrient-card-header">
                                    <span className="nutrient-symbol-badge" style={{ backgroundColor: nut.badgeColor }}>
                                        {nut.symbol}
                                    </span>
                                    <div className="nutrient-header-titles">
                                        <h3>{nut.nutrient}</h3>
                                        <span className="nutrient-cat">{nut.category}</span>
                                    </div>
                                </div>
                                <div className="nutrient-card-body">
                                    <div className="nutrient-field-item">
                                        <span className="field-label">Leaf Symptoms:</span>
                                        <p className="field-text">{nut.primary_symptoms}</p>
                                    </div>
                                    <div className="nutrient-field-item organic-box">
                                        <span className="field-label">Organic Remedy:</span>
                                        <p className="field-text">{nut.organic_remedy}</p>
                                    </div>
                                </div>
                                <div className="nutrient-card-footer">
                                    <span className="tap-hint">Tap for Dosage & Voice Guide →</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {activeNutrientModal && (
                <div className="nutrient-modal-backdrop" onClick={() => setActiveNutrientModal(null)}>
                    <div className="nutrient-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="nutrient-modal-header" style={{ borderLeft: `6px solid ${activeNutrientModal.badgeColor}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span className="nutrient-symbol-badge" style={{ backgroundColor: activeNutrientModal.badgeColor, fontSize: '18px', width: '42px', height: '42px' }}>
                                    {activeNutrientModal.symbol}
                                </span>
                                <div>
                                    <h2>{activeNutrientModal.nutrient} Deficiency Diagnostic Guide</h2>
                                    <span className="nutrient-cat">{activeNutrientModal.category}</span>
                                </div>
                            </div>
                            <button className="modal-close-btn" onClick={() => setActiveNutrientModal(null)}>✕</button>
                        </div>

                        <div className="nutrient-modal-body">
                            <div className="modal-voice-banner">
                                <div>
                                    <strong>Regional Voice Advisory</strong>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#555' }}>Listen to symptom analysis and Indian field treatment in Hindi, Marathi, or English:</p>
                                </div>
                                <AudioVoiceButton
                                    text={`Nutrient advisory for ${activeNutrientModal.nutrient}. Symptoms: ${activeNutrientModal.primary_symptoms}. Organic Remedy: ${activeNutrientModal.organic_remedy}. Chemical mineral remedy: ${activeNutrientModal.mineral_remedy}`}
                                    hindiText={activeNutrientModal.advisory_hi}
                                    marathiText={activeNutrientModal.advisory_mr}
                                    label="Listen Audio Advisory"
                                />
                            </div>

                            <div className="modal-section">
                                <h4>Visual Field Identification & Pathology:</h4>
                                <p>{activeNutrientModal.primary_symptoms}</p>
                            </div>

                            <div className="modal-section organic-highlight">
                                <h4>Low-Cost Indian Organic & Bio Remedy:</h4>
                                <p><strong>{activeNutrientModal.organic_remedy}</strong></p>
                            </div>

                            <div className="modal-section mineral-highlight">
                                <h4>Rapid Mineral / Foliar Corrective Spray:</h4>
                                <p>{activeNutrientModal.mineral_remedy}</p>
                            </div>

                            <div className="modal-section tip-highlight">
                                <h4>Smart Farmer Cost-Saving Tip:</h4>
                                <p>{activeNutrientModal.cost_effective_tip}</p>
                            </div>
                        </div>

                        <div className="nutrient-modal-footer">
                            <button className="btn-modal-close" onClick={() => setActiveNutrientModal(null)}>Close Diagnostic Guide</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="downc">

                <div className="dlayout">

                    <div className="head">
                        <h1>Download Reports</h1>
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

export default PlantHealthDashboard;