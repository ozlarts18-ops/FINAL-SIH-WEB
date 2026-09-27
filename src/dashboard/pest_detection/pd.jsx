import { useEffect, useState } from 'react';
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
    pestEvents,
    pestRecommendations,
    readImageFile
} from '../mainfunction4';

import { useRef } from 'react';
import { analyzePestImage, fetchPiAiResults, fetchPiCameraStatus, getPestAiFrameUrl, insertLog } from '../../api/dataService';
import { useAiScan } from '../../context/AiScanContext';
import './pd.css';

const PD = () => {
    const { language, t } = useLanguage();
    const {
        pestScanMode: scanMode,
        setPestScanMode: setScanMode,
        pestContinuousResults: continuousPiResults,
        setPestContinuousResults: setContinuousPiResults,
        pestLiveFrameUrl: livePestAiFrameUrl,
        setPestLiveFrameUrl: setLivePestAiFrameUrl,
        pestLastProcessedCycleRef: lastProcessedCycleRef
    } = useAiScan();

    const [cameraConnected, setCameraConnected] = useState(true);
    const [uploadedImage, setUploadedImage] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [alertDismissed, setAlertDismissed] = useState(false);
    const [eventsList, setEventsList] = useState(pestEvents);
    const [recommendationsList, setRecommendationsList] = useState(pestRecommendations);

    const [aiFrameKey, setAiFrameKey] = useState(() => Date.now());
    const [isManualScanning, setIsManualScanning] = useState(false);

    const isFetchingCamRef = useRef(false);
    const isFetchingAiRef = useRef(false);

    const STREAM_SOURCES = [
        'http://ossie.local:8080/?action=stream',
        '/api/camera/stream',
        '/api/camera/capture',
        '/api/ai/pest-frame'
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
        console.log(`[PEST AI] mode=${scanMode} cycle=${lastProcessedCycleRef.current} MANUAL SCAN STARTED`);
        try {
            const resData = await fetchPiAiResults();
            if (resData) {
                const realCycle = resData.cycle_count || resData.yolo?.cycle_count || resData.timestamp || Date.now();
                const frameUrl = `${getPestAiFrameUrl()}?frame=${realCycle}`;
                console.log(`[PEST AI] mode=${scanMode} cycle=${realCycle} lastCycle=${lastProcessedCycleRef.current} MANUAL SCAN SUCCESS | FRAME=${frameUrl}`);

                lastProcessedCycleRef.current = realCycle;
                setContinuousPiResults(resData);
                setLivePestAiFrameUrl(frameUrl);
                setAiFrameKey(realCycle);
            }
        } catch (err) {
            console.warn(`[PEST AI] mode=${scanMode} MANUAL SCAN ERROR:`, err?.message || err);
        } finally {
            isFetchingAiRef.current = false;
            setIsManualScanning(false);
        }
    };

    useEffect(() => {
        initCharts();

        let isMounted = true;
        let aiPollTimeout = null;

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

        const checkPestTelemetry = async () => {
            if (!isMounted || scanMode !== 'auto') return;

            if (isFetchingAiRef.current) {
                if (isMounted && scanMode === 'auto') {
                    aiPollTimeout = setTimeout(checkPestTelemetry, 1000);
                }
                return;
            }

            isFetchingAiRef.current = true;
            try {
                const resData = await fetchPiAiResults();
                if (isMounted && resData) {
                    const realCycle = resData.cycle_count || resData.yolo?.cycle_count || resData.timestamp;

                    if (realCycle && realCycle === lastProcessedCycleRef.current) {
                        console.log(`[PEST AI] mode=auto cycle=${realCycle} lastCycle=${lastProcessedCycleRef.current} NO NEW CYCLE`);
                    } else {
                        const frameUrl = `${getPestAiFrameUrl()}?frame=${realCycle || Date.now()}`;
                        console.log(`[PEST AI] mode=auto cycle=${realCycle} lastCycle=${lastProcessedCycleRef.current} NEW CYCLE | FRAME=${frameUrl}`);

                        lastProcessedCycleRef.current = realCycle;
                        setContinuousPiResults(resData);
                        setLivePestAiFrameUrl(frameUrl);
                        setAiFrameKey(realCycle || Date.now());
                    }
                }
            } catch (err) {
                console.warn(`[PEST AI] mode=auto ERROR:`, err?.message || err);
            } finally {
                isFetchingAiRef.current = false;
                if (isMounted && scanMode === 'auto') {
                    aiPollTimeout = setTimeout(checkPestTelemetry, 1000);
                }
            }
        };

        checkCamera();
        if (scanMode === 'auto') {
            checkPestTelemetry();
        }

        const camInterval = setInterval(checkCamera, 5000);

        // Visibility & focus listener: Trigger immediate check when tab becomes visible if scanMode is auto
        const handleVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') {
                console.log(`[PEST AI] Tab/Window visible | mode=${scanMode}`);
                isFetchingAiRef.current = false;
                if (isMounted && scanMode === 'auto') {
                    if (aiPollTimeout) clearTimeout(aiPollTimeout);
                    checkPestTelemetry();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        window.addEventListener('focus', handleVisibilityOrFocus);

        return () => {
            isMounted = false;
            if (aiPollTimeout) clearTimeout(aiPollTimeout);
            destroyCharts();
            clearInterval(camInterval);
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
            setAiResult(null);
            setAlertDismissed(false);

            try {
                const result = await analyzePestImage({
                    image: base64Img
                });

                if (result) {
                    const pestName = result.detected_pest || 'Pest Detected';
                    const pCount = result.pest_count !== undefined ? result.pest_count : 1;
                    const sev = (result.severity_level || 'HIGH').toUpperCase();
                    const isPest = pCount > 0 && pestName !== 'No Pest Detected';

                    if (isPest) {
                        // Immediately dispatch alert to backend -> MongoDB & WhatsApp/Email dispatches
                        insertLog('alerts', {
                            alert_type: 'PEST_DETECTED',
                            title: `PEST DETECTED ALERT: ${pestName.toUpperCase()}`,
                            message: `Manual verification upload detected ${pCount} x ${pestName} with ${result.ai_confidence ? `${result.ai_confidence}%` : 'high'} confidence. Recommended Action: ${result.recommended_action || 'Inspect canopy immediately.'}`,
                            severity: sev,
                            module_name: 'Pest Detection',
                            status: 'ACTIVE',
                            is_read: false,
                            created_at: new Date().toISOString()
                        }).catch(err => console.warn('[Pest Alert Log Notice]:', err.message));
                    }
                }

                setTimeout(() => {
                    setIsAnalyzing(false);
                    setAiResult(result);
                    setAlertDismissed(false);

                    if (result) {
                        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const pestName = result.detected_pest || 'Pest Detected';
                        const pCount = result.pest_count !== undefined ? result.pest_count : 1;
                        const sev = (result.severity_level || 'HIGH').toUpperCase();
                        const isPest = pCount > 0 && pestName !== 'No Pest Detected';

                        setEventsList(prev => [
                            {
                                time: timeStr,
                                icon: '',
                                title: isPest
                                    ? `CRITICAL ALERT: PEST DETECTED - ${pestName.toUpperCase()}`
                                    : `MANUAL SCAN: ${pestName.toUpperCase()} IDENTIFIED`,
                                level: isPest ? sev.toLowerCase() : 'low',
                                details: [
                                    `Pest Species: ${pestName}`,
                                    `Pest Count: ${pCount}`,
                                    `AI Confidence: ${result.ai_confidence ? `${result.ai_confidence}%` : 'N/A'}`,
                                    `Action: ${result.recommended_action || 'Specimen Analyzed'}`
                                ]
                            },
                            ...prev.slice(0, 6)
                        ]);

                        if (result.recommended_action) {
                            setRecommendationsList(prev => [
                                `Manual Verification (${pestName}): ${result.recommended_action}`,
                                ...prev.slice(0, 5)
                            ]);
                        }
                    }
                }, 700);
            } catch (err) {
                console.error('Pest AI inference error:', err);
                setIsAnalyzing(false);
            }
        });
    };

    const clearUpload = () => {
        setUploadedImage(null);
        setIsAnalyzing(false);
        setAiResult(null);
    };

    // Calculate Overview & AI Diagnostic values based on active input source
    const isManualActive = Boolean(uploadedImage);

    let currentPestCount = 0;
    let currentPestDetected = "No Pest Detected";
    let currentSeverity = "NONE";
    let currentConfidence = "0";
    let currentTimestamp = "Awaiting Pi AI Telemetry";

    if (isManualActive && aiResult) {
        currentPestCount = aiResult.pest_count !== undefined
            ? aiResult.pest_count
            : (aiResult.bounding_boxes?.length || (aiResult.detected_pest && aiResult.detected_pest !== 'No Pest Detected' ? 1 : 0));
        currentPestDetected = currentPestCount > 0 ? (aiResult.detected_pest || "Pest Detected") : "No Pest Detected";
        currentSeverity = currentPestCount === 0 ? "NONE" : (aiResult.severity_level || (currentPestCount >= 4 ? 'HIGH' : 'MEDIUM'));
        currentConfidence = currentPestCount === 0 ? "0" : (aiResult.ai_confidence ? `${Math.round(aiResult.ai_confidence)}%` : '0');
        currentTimestamp = aiResult.detected_at
            ? `Manual scan at ${new Date(aiResult.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Manual scan complete';
    } else if (continuousPiResults) {
        const hasPest = continuousPiResults.has_pest || (continuousPiResults.yolo?.pest_count || 0) > 0;
        const detections = continuousPiResults.yolo?.detections || [];
        const countFromYolo = continuousPiResults.yolo?.pest_count;

        currentPestCount = countFromYolo !== undefined ? countFromYolo : (hasPest ? Math.max(1, detections.length) : 0);

        if (currentPestCount > 0) {
            const labels = Array.from(new Set(detections.map(d => d.label).filter(Boolean)));
            currentPestDetected = labels.length > 0
                ? labels.join(', ')
                : (continuousPiResults.pest_ai?.label || continuousPiResults.yolo?.primary_pest || "Pest Detected");
            currentSeverity = continuousPiResults.pest_ai?.severity || (currentPestCount >= 4 ? 'HIGH' : (currentPestCount >= 2 ? 'MEDIUM' : 'LOW'));
            const rawConf = continuousPiResults.pest_ai?.confidence || continuousPiResults.yolo?.confidence;
            currentConfidence = rawConf ? `${Math.round(rawConf)}%` : '0';
        } else {
            currentPestDetected = "No Pest Detected";
            currentSeverity = "NONE";
            currentConfidence = "0";
        }

        currentTimestamp = continuousPiResults.pipeline?.last_inference_time
            ? `Live Pi AI at ${continuousPiResults.pipeline.last_inference_time}`
            : (continuousPiResults.timestamp
                ? `Live Pi AI at ${new Date(continuousPiResults.timestamp).toLocaleTimeString()}`
                : 'Awaiting Pi AI Telemetry');
    }

    const finalDiagnosticImageUrl = livePestAiFrameUrl || `${getPestAiFrameUrl()}?frame=${aiFrameKey}`;

    console.log('[Pest Diagnostic Render]', {
        uploadedImage: Boolean(uploadedImage),
        continuousPiResults: Boolean(continuousPiResults),
        cycle_count: continuousPiResults?.cycle_count,
        aiFrameKey,
        finalDiagnosticImageUrl
    });

    return (
        <div className="pest-detection-page">

            <Header />
            <Nav />
            <DashboardSubNav />

            <div className="ai-model">

                <div className="head">
                    <h1>{t('pestDash.pestDetection')}</h1>
                </div>

                <div className="ai-panels">

                    {/* 1. LIVE PEST DETECTION — UNTOUCHED ORIGINAL FRAME */}
                    <div className="cam-panel live-camera">
                        <div className="cam-panel-header">
                            <h2>{t('pestDash.livePestDetection')}</h2>
                            <span className={`status-pill ${cameraConnected ? 'pill-online' : 'pill-offline'}`}>
                                <span className="status-dot"></span>
                                {cameraConnected ? (language === 'hi' ? 'ऑनलाइन' : 'Online') : (language === 'hi' ? 'ऑफलाइन' : 'Offline')}
                            </span>
                        </div>
                        <div className="cam-frame" style={{ position: 'relative', width: '100%', height: '100%', minHeight: '220px' }}>
                            <img
                                key={streamSourceIndex}
                                src={STREAM_SOURCES[streamSourceIndex]}
                                alt="Live Pest Detection"
                                className="cam-live-feed"
                                onError={handleStreamError}
                                onLoad={handleStreamLoad}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraConnected ? 'block' : 'none' }}
                            />
                            {!cameraConnected && (
                                <div className="canopy-empty-state">
                                    <svg className="empty-state-svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="6" width="14" height="12" rx="2" />
                                        <path d="M22 8.5l-6 3.5 6 3.5v-7z" />
                                        <line x1="2" y1="2" x2="22" y2="22" />
                                    </svg>
                                    <p className="empty-state-title">Waiting for Pi Camera...</p>
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

                    {/* 2. AI DIAGNOSTIC FRAME — YOLO BOUNDING BOXES & HUD */}
                    <div className="cam-panel output-section ai-diagnostic-panel-white" style={{
                        background: '#ffffff',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div className="cam-panel-header" style={{ background: '#ffffff', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', margin: 0 }}>
                            <h2 style={{ color: '#0f172a', fontWeight: '700', fontSize: '13px', margin: 0, letterSpacing: '0.4px' }}>AI DIAGNOSTIC</h2>
                            <span className={`status-pill ${uploadedImage ? (isAnalyzing ? 'pill-analyzing' : 'pill-upload') : (continuousPiResults ? (scanMode === 'auto' ? 'pill-online' : 'pill-idle') : 'pill-idle')}`}>
                                <span className="status-dot"></span>
                                {uploadedImage ? (isAnalyzing ? 'Analyzing' : 'Manual Verification') : (continuousPiResults ? (scanMode === 'auto' ? 'Live Pi AI' : 'AI Paused') : 'Awaiting Telemetry')}
                            </span>
                        </div>

                        <div className="output-frame" style={{ background: '#f8fafc', position: 'relative', border: 'none' }}>
                            {uploadedImage ? (
                                <div className="ai-output-container">
                                    <div className="ai-image-wrapper">
                                        <img
                                            src={uploadedImage}
                                            alt="Uploaded Pest Diagnostic"
                                            className="output-image"
                                        />

                                        {isAnalyzing && (
                                            <div className="ai-scanning-overlay">
                                                <div className="scanner-laser-bar"></div>
                                                <div className="scanning-hud-tag">
                                                    <span className="radar-ping"></span>
                                                    <span>Running YOLO Inference...</span>
                                                </div>
                                            </div>
                                        )}

                                        {!isAnalyzing && aiResult && aiResult.bounding_boxes && aiResult.bounding_boxes.length > 0 && (
                                            <div className="ai-boxes-overlay">
                                                {aiResult.bounding_boxes.map((box, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`ai-bbox-box sev-${currentSeverity.toLowerCase()}`}
                                                        style={{
                                                            left: `${box.x}%`,
                                                            top: `${box.y}%`,
                                                            width: `${box.width}%`,
                                                            height: `${box.height}%`
                                                        }}
                                                    >
                                                        <span className="ai-bbox-corner tl"></span>
                                                        <span className="ai-bbox-corner tr"></span>
                                                        <span className="ai-bbox-corner bl"></span>
                                                        <span className="ai-bbox-corner br"></span>
                                                        <span className="ai-bbox-label">
                                                            {box.label || currentPestDetected} • {box.conf || currentConfidence}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {!isAnalyzing && (
                                        <div className="ai-hud-floating-pill">
                                            <span className="hud-dot"></span>
                                            <span>{currentPestDetected} | {currentPestCount} Detected ({currentConfidence})</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="ai-output-container">
                                    <div className="ai-image-wrapper">
                                        <img
                                            key={aiFrameKey}
                                            src={finalDiagnosticImageUrl}
                                            alt="Raspberry Pi Pest AI Feed"
                                            className="output-image"
                                            onError={(e) => {
                                                console.warn('[Pest Diagnostic Img Error] Failed to load image:', e.target.src);
                                                if (!e.target.dataset.fallback) {
                                                    e.target.dataset.fallback = 'true';
                                                    e.target.src = `/api/ai/pest-frame?frame=${aiFrameKey}`;
                                                }
                                            }}
                                        />
                                    </div>

                                    {continuousPiResults && (
                                        <div className="ai-hud-floating-pill">
                                            <span className="hud-dot"></span>
                                            <span>{currentPestDetected} | {currentPestCount} Detected ({currentConfidence})</span>
                                        </div>
                                    )}
                                </div>
                            )}
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

                    {/* 3. MANUAL VERIFICATION */}
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
                                            alt="Uploaded pest specimen"
                                            className="upload-preview-image"
                                        />
                                        {isAnalyzing && (
                                            <div className="upload-analyzing-badge">
                                                <span className="upload-spinner"></span>
                                                Scanning Pest Photo...
                                            </div>
                                        )}
                                    </div>
                                    <div className="upload-actions">
                                        <label htmlFor="pestUpload" className="upload-label upload-label-secondary">
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
                                <label htmlFor="pestUpload" className="upload-dropzone">
                                    <span className="upload-label-text">Click to upload pest photo</span>
                                    <span className="upload-hint">JPG or PNG (Ad-hoc AI Verification)</span>
                                </label>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                id="pestUpload"
                                onChange={handleUpload}
                                hidden
                            />
                        </div>
                    </div>

                </div>

            </div>

            {/* 4. OVERVIEW SECTION */}
            <div className="dashboard">

                {!alertDismissed && (
                    <div className={`pest-alert-banner banner-${currentSeverity.toLowerCase()}`} style={{ margin: '0 0 20px 0' }}>
                        <div className="alert-banner-left">
                            <div className="alert-banner-text">
                                <h3>
                                    {currentPestCount > 0
                                        ? `PEST DETECTED ALERT: ${currentPestDetected.toUpperCase()} (${currentSeverity} SEVERITY)`
                                        : 'SYSTEM HEALTH ALERT: BIO-SECURITY RISK CONTROLLED'}
                                </h3>
                                <p>
                                    {currentPestCount > 0
                                        ? `Optical AI scanning reports ${currentPestCount} active ${currentPestDetected} detected in greenhouse canopy.`
                                        : 'Optical AI scanning reports low aphid and whitefly activity across all greenhouse sectors. Targeted bio-pesticide sprayers on standby.'}
                                </p>
                            </div>
                        </div>
                        <div className="alert-banner-actions">
                            <AudioVoiceButton
                                text={currentPestCount > 0 ? `Pest detected alert: ${currentPestDetected} at ${currentSeverity} severity.` : 'Pest bio-security is stable. Optical scanning reports zero active threat.'}
                                label="Speak Alert"
                            />
                            <span className="alert-status-pill">
                                {currentPestCount > 0 ? `${currentConfidence} Match` : 'Active Monitor'}
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

                <div className="overview">

                    <div className="head">
                        <h1>OVERVIEW</h1>
                    </div>

                    <div className="main">

                        <div className="left">

                            <div className="box2">
                                <h2>PEST DETECTED</h2>
                                <p className="unit" id="pestDetected">{currentPestDetected}</p>
                            </div>

                        </div>

                        <div className="right">

                            <div className="box3">
                                <h2>PEST COUNT</h2>
                                <p className="unit" id="pestCount">{currentPestCount}</p>
                            </div>

                            <div className="box4">
                                <h2>SEVERITY</h2>
                                <p className={`unit severity-indicator sev-${currentSeverity.toLowerCase()}`} id="severity">
                                    {currentSeverity}
                                </p>
                            </div>

                            <div className="box5">
                                <h2>AI CONFIDENCE</h2>
                                <p className="unit" id="aiConfidence">{currentConfidence}</p>
                            </div>

                            <div className="box51">
                                <h2>LAST UPDATED</h2>
                                <p className="unit" id="lastUpdated">{currentTimestamp}</p>
                            </div>

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

                    <div className="pest-charts-grid">

                        {/* Chart 1: Pest Detection Trend (Full width) */}
                        <div className="pest-chart-card full-width">
                            <div className="chart-card-header">
                                <h3>PEST DETECTION TREND</h3>
                            </div>
                            <div className="chart-card-body">
                                <canvas id="PestDetectionTrendChart"></canvas>
                            </div>
                        </div>

                        {/* Chart 2: Pest Type Distribution (Half width) */}
                        <div className="pest-chart-card half-width">
                            <div className="chart-card-header">
                                <h3>PEST TYPE DISTRIBUTION</h3>
                            </div>
                            <div className="chart-card-body">
                                <canvas id="PestTypeDistributionChart"></canvas>
                            </div>
                        </div>

                        {/* Chart 3: Pest Severity (Half width) */}
                        <div className="pest-chart-card half-width">
                            <div className="chart-card-header">
                                <h3>PEST SEVERITY</h3>
                            </div>
                            <div className="chart-card-body">
                                <canvas id="PestSeverityChart"></canvas>
                            </div>
                        </div>

                        {/* Chart 4: Pest Detections by Location (Half width) */}
                        <div className="pest-chart-card half-width">
                            <div className="chart-card-header">
                                <h3>PEST DETECTIONS BY LOCATION</h3>
                            </div>
                            <div className="chart-card-body">
                                <canvas id="PestLocationChart"></canvas>
                            </div>
                        </div>

                        {/* Chart 5: Pest Activity by Time (Half width) */}
                        <div className="pest-chart-card half-width">
                            <div className="chart-card-header">
                                <h3>PEST ACTIVITY BY TIME</h3>
                            </div>
                            <div className="chart-card-body">
                                <canvas id="PestActivityTimeChart"></canvas>
                            </div>
                        </div>

                    </div>

                </div>

            </div>

            <div className="alert-section-wrapper">

                {!alertDismissed && (
                    <div className={`pest-alert-banner banner-${currentSeverity.toLowerCase()}`}>
                        <div className="alert-banner-left">
                            <div className="alert-banner-text">
                                <h3>
                                    {currentPestCount > 0
                                        ? `AI VISION DIAGNOSIS: ${currentPestDetected.toUpperCase()} (${currentSeverity} SEVERITY)`
                                        : 'SYSTEM HEALTH ALERT: BIO-SECURITY RISK CONTROLLED'}
                                </h3>
                                <p>
                                    {currentPestCount > 0
                                        ? `Optical AI scanning reports ${currentPestCount} active ${currentPestDetected} detected in greenhouse canopy.`
                                        : 'Optical AI scanning reports low aphid and whitefly activity across all greenhouse sectors. Targeted bio-pesticide sprayers on standby.'}
                                </p>
                            </div>
                        </div>
                        <div className="alert-banner-actions">
                            <AudioVoiceButton
                                text={currentPestCount > 0 ? `Pest detected: ${currentPestDetected} at ${currentSeverity} severity.` : 'Pest bio-security is stable. Optical scanning reports zero active threat.'}
                                label="Speak Alert"
                            />
                            <span className="alert-status-pill">
                                {currentPestCount > 0 ? `${currentConfidence} Match` : 'Active Monitor'}
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
                            <h1>PEST DETECTION ALERTS & SYSTEM EVENTS</h1>
                            <p className="subtext">Entomological telemetry logs and optical detection observations</p>
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
                                <h1>D. PEST INTELLIGENCE & RECOMMENDATIONS</h1>
                                <p className="subtext">
                                    Automated pest mitigation observations and recommendations
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

            </div>

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

export default PD;