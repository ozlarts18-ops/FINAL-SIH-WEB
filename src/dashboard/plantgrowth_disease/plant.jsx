import { useEffect, useState, useRef } from 'react';
import Header from '../../components/Header';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import DashboardSubNav from '../../components/DashboardSubNav';
import AudioVoiceButton from '../../components/AudioVoiceButton';
import { useLanguage } from '../../context/LanguageContext';

import {
    initCharts,
    applyGraphFilter,
    downloadReport,
    destroyCharts,
    ESP32_STREAM_URL as _ESP32_STREAM_URL,
    plantEvents,
    plantRecommendations,
    readImageFile,
    NUTRIENT_DEFICIENCY_MATRIX,
    evaluateWaterloggingRisk
} from '../mainfunction3';

import { analyzePlantDiseaseImage, fetchLatestSensorData, fetchPiAiResults, getCropNutrientAiFrameUrl, fetchPiCameraStatus } from '../../api/dataService';
import { useAiScan } from '../../context/AiScanContext';
import './plant.css';

const PlantHealthDashboard = () => {
    const { language, t } = useLanguage();
    const {
        cropScanMode: scanMode,
        setCropScanMode: setScanMode,
        cropContinuousResult: continuousPiResult,
        setCropContinuousResult: setContinuousPiResult,
        cropLiveFrameUrl: liveCropAiFrameUrl,
        setCropLiveFrameUrl: setLiveCropAiFrameUrl,
        cropLastProcessedCycleRef: lastProcessedCycleRef
    } = useAiScan();

    const [selectedCrop] = useState('Tomato');
    const [cameraConnected, setCameraConnected] = useState(true);
    const [uploadedImage, setUploadedImage] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [manualAiResult, setManualAiResult] = useState(null);
    const [sensorData, setSensorData] = useState(null);
    const [waterloggingData, setWaterloggingData] = useState(() => evaluateWaterloggingRisk(false, 68));
    const [alertDismissed, setAlertDismissed] = useState(false);
    const [eventsList] = useState(plantEvents || []);
    const [recommendationsList] = useState(plantRecommendations || []);
    const [activeNutrientModal, setActiveNutrientModal] = useState(null);
    const [aiFrameKey, setAiFrameKey] = useState(() => Date.now());
    const [isManualScanning, setIsManualScanning] = useState(false);

    const isFetchingCamRef = useRef(false);
    const isFetchingAiRef = useRef(false);
    const STREAM_SOURCES = [
        'http://ossie.local:8080/?action=stream',
        '/api/camera/stream',
        '/api/camera/capture',
        '/api/ai/crop-nutrient-frame'
    ];
    const [streamSourceIndex, setStreamSourceIndex] = useState(0);

    const handleStreamError = () => {
        if (streamSourceIndex < STREAM_SOURCES.length - 1) {
            setStreamSourceIndex(prev => prev + 1);
        } else {
            setCameraConnected(false);
        }
    };

    const handleStreamLoad = () => {
        setCameraConnected(true);
    };

    const handleAutoScanClick = () => {
        setScanMode('auto');
    };

    const handleStopClick = () => {
        setScanMode('stop');
    };

    const triggerManualScan = async () => {
        if (isFetchingAiRef.current) return;
        setIsManualScanning(true);
        isFetchingAiRef.current = true;
        console.log(`[CROP AI] mode=${scanMode} cycle=${lastProcessedCycleRef.current} MANUAL SCAN STARTED`);
        try {
            const resData = await fetchPiAiResults();
            if (resData) {
                const realCycle = resData.cycle_count || resData.crop_ai?.cycle_count || resData.timestamp || Date.now();
                const frameUrl = `${getCropNutrientAiFrameUrl()}?frame=${realCycle}`;
                console.log(`[CROP AI] mode=${scanMode} cycle=${realCycle} lastCycle=${lastProcessedCycleRef.current} MANUAL SCAN SUCCESS | FRAME=${frameUrl}`);
                
                lastProcessedCycleRef.current = realCycle;
                setContinuousPiResult(resData);
                setLiveCropAiFrameUrl(frameUrl);
                setAiFrameKey(realCycle);
            }
        } catch (err) {
            console.warn(`[CROP AI] mode=${scanMode} MANUAL SCAN ERROR:`, err?.message || err);
        } finally {
            isFetchingAiRef.current = false;
            setIsManualScanning(false);
        }
    };

    useEffect(() => {
        initCharts();

        let isMounted = true;
        let cropPollTimeout = null;

        const checkCamera = async () => {
            if (isFetchingCamRef.current) return;
            isFetchingCamRef.current = true;
            try {
                const status = await fetchPiCameraStatus();
                if (isMounted && status && status.connected) {
                    setCameraConnected(true);
                }
            } catch (_e) {
            } finally {
                isFetchingCamRef.current = false;
            }
        };

        const checkCropTelemetry = async () => {
            if (!isMounted || scanMode !== 'auto') return;

            if (isFetchingAiRef.current) {
                if (isMounted && scanMode === 'auto') {
                    cropPollTimeout = setTimeout(checkCropTelemetry, 1000);
                }
                return;
            }

            isFetchingAiRef.current = true;
            try {
                const resData = await fetchPiAiResults();
                if (isMounted && resData) {
                    const realCycle = resData.cycle_count || resData.crop_ai?.cycle_count || resData.timestamp;

                    if (realCycle && realCycle === lastProcessedCycleRef.current) {
                        console.log(`[CROP AI] mode=auto cycle=${realCycle} lastCycle=${lastProcessedCycleRef.current} NO NEW CYCLE`);
                    } else {
                        const frameUrl = `${getCropNutrientAiFrameUrl()}?frame=${realCycle || Date.now()}`;
                        console.log(`[CROP AI] mode=auto cycle=${realCycle} lastCycle=${lastProcessedCycleRef.current} NEW CYCLE | FRAME=${frameUrl}`);
                        
                        lastProcessedCycleRef.current = realCycle;
                        setContinuousPiResult(resData);
                        setLiveCropAiFrameUrl(frameUrl);
                        setAiFrameKey(realCycle || Date.now());
                    }
                }
            } catch (err) {
                console.warn(`[CROP AI] mode=auto ERROR:`, err?.message || err);
            } finally {
                isFetchingAiRef.current = false;
                if (isMounted && scanMode === 'auto') {
                    cropPollTimeout = setTimeout(checkCropTelemetry, 1000);
                }
            }
        };

        const updateSensors = async () => {
            try {
                const s = await fetchLatestSensorData();
                if (s && isMounted) {
                    setSensorData(s);
                    const isRaining = Boolean(s.rain_detected || s.rainDetected);
                    const moist = Number(s.soil_moisture ?? s.moisture ?? 68);
                    setWaterloggingData(evaluateWaterloggingRisk(isRaining, moist));
                }
            } catch (_e) { }
        };

        checkCamera();
        if (scanMode === 'auto') {
            checkCropTelemetry();
        }
        updateSensors();

        const cameraInterval = setInterval(checkCamera, 5000);
        const syncInterval = setInterval(updateSensors, 3000);

        // Visibility & focus listener: Trigger immediate check when tab becomes visible if scanMode is auto
        const handleVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') {
                console.log(`[CROP AI] Tab/Window visible | mode=${scanMode}`);
                isFetchingAiRef.current = false;
                if (isMounted && scanMode === 'auto') {
                    if (cropPollTimeout) clearTimeout(cropPollTimeout);
                    checkCropTelemetry();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        window.addEventListener('focus', handleVisibilityOrFocus);

        return () => {
            isMounted = false;
            if (cropPollTimeout) clearTimeout(cropPollTimeout);
            destroyCharts();
            clearInterval(cameraInterval);
            clearInterval(syncInterval);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('focus', handleVisibilityOrFocus);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scanMode]);

    const handleUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        readImageFile(file, async (base64Img) => {
            setUploadedImage(base64Img);
            setIsAnalyzing(true);
            setManualAiResult(null);

            try {
                const result = await analyzePlantDiseaseImage({
                    image: base64Img,
                    cropName: selectedCrop
                });
                if (result && (result.disease_name || result.disease)) {
                    setManualAiResult(result);
                } else {
                    setManualAiResult(null);
                }
            } catch (err) {
                console.error('Plant AI inference error:', err);
                setManualAiResult(null);
            } finally {
                setIsAnalyzing(false);
            }
        });
    };

    const clearUpload = () => {
        setUploadedImage(null);
        setIsAnalyzing(false);
        setManualAiResult(null);
    };

    // Single source of truth Pi AI for Live Overview & Diagnostics
    const hasPlant = continuousPiResult
        ? (continuousPiResult.has_plant === true || continuousPiResult.crop_ai?.has_plant === true)
        : false;

    const currentCropHealth = (!cameraConnected || !continuousPiResult || scanMode === 'stop')
        ? 'N/A'
        : (hasPlant ? (continuousPiResult.crop_ai?.label || 'Healthy Canopy') : 'No Plant Detected');

    const currentPlantTypeLabel = (!cameraConnected || !continuousPiResult || scanMode === 'stop')
        ? 'N/A'
        : (hasPlant ? (continuousPiResult.crop_ai?.crop_name?.split(' (')?.[0] || 'Tomato') : 'No Plant Detected');

    const currentPlantTypeSub = (!cameraConnected || !continuousPiResult || scanMode === 'stop')
        ? ''
        : (hasPlant ? (continuousPiResult.crop_ai?.crop_name?.includes('Tomato') ? 'Roma Tomato' : '') : '');
    const currentPlantTypeSci = (!cameraConnected || !continuousPiResult || scanMode === 'stop')
        ? ''
        : (hasPlant ? 'Solanum lycopersicum' : '');

    const activeHealthScore = (!cameraConnected || !continuousPiResult || scanMode === 'stop')
        ? 'N/A'
        : (hasPlant ? `${Math.round(continuousPiResult.crop_ai?.confidence || continuousPiResult.crop_ai?.health_score || 94)}/100` : 'N/A');

    const currentDiseaseRisk = (!cameraConnected || !continuousPiResult || scanMode === 'stop')
        ? 'N/A'
        : (hasPlant ? (continuousPiResult.crop_ai?.disease_risk || 'LOW') : 'N/A');

    const currentNutrientStatus = continuousPiResult?.nutrient_ai?.label || 'Unavailable (Nutrient model not found on Raspberry Pi)';

    const currentTimestamp = (!cameraConnected || !continuousPiResult || scanMode === 'stop')
        ? (cameraConnected ? 'Awaiting Telemetry' : 'N/A')
        : (continuousPiResult?.pipeline?.last_inference_time
            ? `Live Pi AI at ${continuousPiResult.pipeline.last_inference_time}`
            : (continuousPiResult?.timestamp ? `Live Pi AI at ${new Date(continuousPiResult.timestamp).toLocaleTimeString()}` : 'Awaiting Telemetry'));

    const activeAiImage = liveCropAiFrameUrl || `${getCropNutrientAiFrameUrl()}?frame=${aiFrameKey}`;

    const currentSoilMoisture = sensorData?.soil_moisture !== undefined
        ? `${Number(sensorData.soil_moisture).toFixed(2)}%`
        : (sensorData?.moisture !== undefined ? `${Number(sensorData.moisture).toFixed(2)}%` : '68%');

    const getBoxesToRender = () => {
        if (!continuousPiResult || !hasPlant) return [];

        const detections = continuousPiResult.crop_ai?.detections || continuousPiResult.yolo?.detections || [];
        if (detections.length > 0) {
            return detections.map(d => {
                const [x1, y1, x2, y2] = d.bbox || [0, 0, 0, 0];
                return {
                    left: x1,
                    top: y1,
                    width: x2 - x1,
                    height: y2 - y1,
                    label: d.label || d.class_name || 'Plant Detected',
                    conf: d.confidence ? Math.round(d.confidence) : null
                };
            });
        }
        return [];
    };

    const renderedBoxes = getBoxesToRender();
    const aiResult = manualAiResult || (hasPlant && continuousPiResult?.crop_ai ? {
        disease_name: continuousPiResult.crop_ai.label || 'Healthy Canopy',
        disease_risk: continuousPiResult.crop_ai.disease_risk || 'LOW',
        confidence_score: Math.round(continuousPiResult.crop_ai.confidence || 94),
        treatment_advice: continuousPiResult.crop_ai.recommendation || 'Soil moisture, root temperature, and vegetative growth index are within target parameters. Automated irrigation standby active.'
    } : (continuousPiResult?.detected ? continuousPiResult : null));

    console.log('[Crop Diagnostic Render]', {
        uploadedImage: Boolean(uploadedImage),
        continuousPiResult: Boolean(continuousPiResult),
        cycle_count: continuousPiResult?.cycle_count,
        aiFrameKey,
        activeAiImage
    });

    return (
        <div className="plant-health-page">

            <Header />
            <Nav />
            <DashboardSubNav />

            <div className="ai-model">

                <div className="head">
                    <h1>{t('plantDash.cropAiDetection')}</h1>
                </div>

                <div className="ai-panels">

                    <div className="cam-panel live-camera">
                        <div className="cam-panel-header">
                            <h2>{t('plantDash.liveCanopy')}</h2>
                            <span className={`status-pill ${cameraConnected ? 'pill-online' : 'pill-idle'}`}>
                                <span className="status-dot"></span>
                                {cameraConnected ? (language === 'hi' ? 'कनेक्टेड' : 'Connected') : (language === 'hi' ? 'डिस्कनेक्टेड' : 'Disconnected')}
                            </span>
                        </div>

                        <div className="cam-frame" style={{ position: 'relative', width: '100%', height: '100%', minHeight: '220px' }}>
                            <img
                                key={streamSourceIndex}
                                src={STREAM_SOURCES[streamSourceIndex]}
                                alt="Live Canopy"
                                className="cam-live-feed"
                                onError={handleStreamError}
                                onLoad={handleStreamLoad}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraConnected ? 'block' : 'none' }}
                            />
                            {!cameraConnected && (
                                <div className="canopy-empty-state">
                                    <svg className="empty-state-svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                    <p className="empty-state-title">Waiting for camera...</p>
                                    <button
                                        type="button"
                                        style={{ marginTop: '10px', padding: '6px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                                        onClick={() => {
                                            setStreamSourceIndex(0);
                                            setCameraConnected(true);
                                        }}
                                    >
                                        Retry Stream
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="cam-panel output-section">
                        <div className="cam-panel-header">
                            <h2>AI DIAGNOSTICS</h2>
                            <span className={`status-pill ${uploadedImage ? (isAnalyzing ? 'pill-analyzing' : 'pill-upload') : (continuousPiResult ? (scanMode === 'auto' ? 'pill-online' : 'pill-idle') : 'pill-idle')}`}>
                                <span className="status-dot"></span>
                                {uploadedImage ? (isAnalyzing ? 'Analyzing' : 'Manual Verification') : (continuousPiResult ? (scanMode === 'auto' ? 'Live Pi AI' : 'AI Paused') : 'Awaiting Telemetry')}
                            </span>
                        </div>
                        <div className="output-frame" style={{ position: 'relative', background: '#f8fafc', border: 'none' }}>
                            <div className="ai-output-container">
                                <div className="detection-image-container">
                                    <img
                                        key={aiFrameKey}
                                        src={activeAiImage}
                                        alt="Raspberry Pi Plant AI Live Output"
                                        className="output-image"
                                        onError={(e) => {
                                            console.warn('[Crop Diagnostic Img Error] Failed to load image:', e.target.src);
                                            if (!e.target.dataset.fallback) {
                                                e.target.dataset.fallback = 'true';
                                                e.target.src = `/api/ai/crop-nutrient-frame?frame=${aiFrameKey}`;
                                            }
                                        }}
                                    />

                                    {renderedBoxes.length > 0 && (
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

                        {/* 3 CONTROL BUTTONS DIRECTLY BELOW AI DIAGNOSTIC FRAME — WHITE THEMED */}
                        <div className="ai-diagnostic-controls-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '12px', background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
                            <button
                                type="button"
                                className={`scan-ctrl-btn ${scanMode === 'auto' ? 'active-auto' : ''}`}
                                onClick={handleAutoScanClick}
                                title="Start automatic 1-second Pi AI cycle checking"
                                style={{
                                    padding: '7px 16px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    borderRadius: '6px',
                                    border: scanMode === 'auto' ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                                    background: scanMode === 'auto' ? '#ecfdf5' : '#ffffff',
                                    color: scanMode === 'auto' ? '#047857' : '#475569',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: scanMode === 'auto' ? '0 2px 4px rgba(16, 185, 129, 0.15)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: scanMode === 'auto' ? '#10b981' : '#94a3b8' }}></span>
                                AUTO SCAN {scanMode === 'auto' ? '(ACTIVE)' : ''}
                            </button>

                            <button
                                type="button"
                                className="scan-ctrl-btn btn-manual"
                                onClick={triggerManualScan}
                                disabled={isManualScanning}
                                title="Trigger an immediate one-shot Pi AI refresh"
                                style={{
                                    padding: '7px 16px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    borderRadius: '6px',
                                    border: isManualScanning ? '1.5px solid #3b82f6' : '1px solid #93c5fd',
                                    background: isManualScanning ? '#eff6ff' : '#ffffff',
                                    color: isManualScanning ? '#1d4ed8' : '#2563eb',
                                    cursor: isManualScanning ? 'wait' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {isManualScanning ? 'SCANNING...' : 'MANUAL SCAN'}
                            </button>

                            <button
                                type="button"
                                className={`scan-ctrl-btn ${scanMode === 'stop' ? 'active-stop' : ''}`}
                                onClick={handleStopClick}
                                title="Freeze AI Diagnostic display and stop automatic 1s telemetry checking"
                                style={{
                                    padding: '7px 16px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    borderRadius: '6px',
                                    border: scanMode === 'stop' ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                                    background: scanMode === 'stop' ? '#fef2f2' : '#ffffff',
                                    color: scanMode === 'stop' ? '#b91c1c' : '#475569',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: scanMode === 'stop' ? '0 2px 4px rgba(239, 68, 68, 0.15)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: scanMode === 'stop' ? '#ef4444' : '#94a3b8' }}></span>
                                STOP {scanMode === 'stop' ? '(ACTIVE)' : ''}
                            </button>
                        </div>
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
                                    {manualAiResult && !isAnalyzing && (
                                        <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#10b981' }}>
                                                {manualAiResult.disease_name || manualAiResult.disease || 'Specimen Analyzed'}
                                            </div>
                                            {manualAiResult.confidence_score && (
                                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                                    Confidence: {Math.round(manualAiResult.confidence_score)}%
                                                </div>
                                            )}
                                            {manualAiResult.treatment_advice && (
                                                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>
                                                    {manualAiResult.treatment_advice}
                                                </div>
                                            )}
                                        </div>
                                    )}
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
                                <p className={`unit ${currentDiseaseRisk === 'HIGH' ? 'text-hazard' : ''}`} id="cropHealth">
                                    {currentCropHealth}
                                </p>
                            </div>

                            <div className="box0">
                                <h2>TYPE OF PLANT</h2>
                                <p className="unit" id="plantType" style={{ fontSize: '24px', margin: '4px 0 2px 0' }}>
                                    {currentPlantTypeLabel}
                                </p>
                                {currentPlantTypeSub && (
                                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#40533b', margin: '0 0 2px 0' }}>
                                        {currentPlantTypeSub}
                                    </p>
                                )}
                                {currentPlantTypeSci && (
                                    <p className="t1">
                                        {currentPlantTypeSci}
                                    </p>
                                )}
                            </div>

                            <div className="box1">
                                <h2>SOIL MOISTURE</h2>
                                <p className="unit" id="soilMoisture">{currentSoilMoisture}</p>
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

                            <div className="box51">
                                <h2>LAST UPDATED</h2>
                                <p className="unit" id="lastUpdated">{currentTimestamp}</p>
                            </div>

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