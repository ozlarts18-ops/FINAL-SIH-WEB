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
    pestEvents,
    pestRecommendations,
    readImageFile
} from '../mainfunction4';

import { analyzePestImage, fetchLatestSensorData, fetchCameraStatus, updateCameraStreamUrl, captureCameraSnapshot, toggleCameraFlash } from '../../api/dataService';
import CameraModal from '../../components/CameraModal';
import './pd.css';

const PD = () => {
    const [uploadedImage, setUploadedImage] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [streamActive, setStreamActive] = useState(true);
    const [cameraUrl, setCameraUrl] = useState(ESP32_STREAM_URL || '/api/camera/stream');
    const [streamKey, setStreamKey] = useState(Date.now());
    const [alertDismissed, setAlertDismissed] = useState(false);
    const [eventsList, setEventsList] = useState(pestEvents);
    const [recommendationsList, setRecommendationsList] = useState(pestRecommendations);
    const [isCamModalOpen, setIsCamModalOpen] = useState(false);
    const [flashActive, setFlashActive] = useState(false);

    useEffect(() => {
        initCharts();

        const syncCamera = async () => {
            try {
                const [camStatus, s] = await Promise.allSettled([
                    fetchCameraStatus(),
                    fetchLatestSensorData()
                ]);

                if (camStatus.status === 'fulfilled' && camStatus.value?.streamUrl) {
                    const url = camStatus.value.streamUrl;
                    if (!url.includes('<ESP32-CAM-IP>')) {
                        setCameraUrl(url);
                    }
                    if (camStatus.value.flashLed !== undefined) {
                        setFlashActive(camStatus.value.flashLed);
                    }
                }

                if (s.status === 'fulfilled' && s.value?.streamUrl) {
                    if (!s.value.streamUrl.includes('<ESP32-CAM-IP>')) {
                        setCameraUrl(s.value.streamUrl);
                    }
                }
            } catch (e) {}};

        syncCamera();
        const interval = setInterval(syncCamera, 6000);

        return () => {
            destroyCharts();
            clearInterval(interval);
        };
    }, []);

    const handleSetCustomCameraIp = () => {
        setIsCamModalOpen(true);
    };

    const handleToggleFlash = async () => {
        const nextState = !flashActive;
        setFlashActive(nextState);
        await toggleCameraFlash(nextState);
    };

    const handleRefreshStream = () => {
        setStreamActive(true);
        setStreamKey(Date.now());
    };

    const handleCaptureFromCamera = async () => {
        setIsAnalyzing(true);
        const frameData = await captureCameraSnapshot();
        if (!frameData) {
            setIsAnalyzing(false);
            setStreamActive(false);
            return;
        }

        setUploadedImage(frameData);
        setAiResult(null);
        try {
            const result = await analyzePestImage({
                image: frameData,
                cropName: 'Tomato (Solanum lycopersicum)'
            });
            setTimeout(() => {
                setIsAnalyzing(false);
                setAiResult(result);
                if (result) {
                    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    setEventsList(prev => [
                        {
                            time: timeStr,
                            icon: '',
                            title: `LIVE CAM: ${(result.detected_pest || 'INSECT').toUpperCase()} IDENTIFIED`,
                            level: (result.severity_level || 'medium').toLowerCase(),
                            details: [
                                `Target Crop: ${result.target_crop || 'Tomato'}`,
                                `Pest Count: ${result.pest_count || 1}`,
                                `AI Confidence: ${result.ai_confidence}%`,
                                `Action: ${result.recommended_action}`
                            ]
                        },
                        ...prev.slice(0, 6)
                    ]);
                    setRecommendationsList(prev => [
                        `Optical AI (${result.detected_pest}): ${result.recommended_action}`,
                        ...prev.slice(0, 5)
                    ]);
                }
            }, 750);
        } catch (e) {
            setIsAnalyzing(false);
        }
    };

    const handleUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        readImageFile(file, async (base64Img) => {
            setUploadedImage(base64Img);
            setIsAnalyzing(true);
            setAiResult(null);

            try {
                const result = await analyzePestImage({
                    image: base64Img,
                    cropName: 'Tomato (Solanum lycopersicum)'
                });

                setTimeout(() => {
                    setIsAnalyzing(false);
                    setAiResult(result);

                    if (result) {
                        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setEventsList(prev => [
                            {
                                time: timeStr,
                                icon: '',
                                title: `${(result.detected_pest || 'INSECT').toUpperCase()} IDENTIFIED`,
                                level: (result.severity_level || 'medium').toLowerCase(),
                                details: [
                                    `Target Crop: ${result.target_crop || 'Tomato'}`,
                                    `Pest Count: ${result.pest_count || 1}`,
                                    `AI Confidence: ${result.ai_confidence}%`,
                                    `Action: ${result.recommended_action}`
                                ]
                            },
                            ...prev.slice(0, 6)
                        ]);

                        setRecommendationsList(prev => [
                            `Optical AI (${result.detected_pest}): ${result.recommended_action}`,
                            ...prev.slice(0, 5)
                        ]);
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

    const currentPestStatus = aiResult
        ? (aiResult.severity_level === 'LOW' || aiResult.detected_pest?.toLowerCase().includes('ladybug') ? 'No Threat' : `Active Threat - ${aiResult.detected_pest?.split(' (')[0]}`)
        : 'No Threat';

    const currentCrop = aiResult?.target_crop || 'Tomato (Solanum lycopersicum)';
    const currentPestDetected = aiResult?.detected_pest || 'Aphids (Cluster)';
    const currentPestCount = aiResult ? aiResult.pest_count : 12;
    const currentSeverity = aiResult ? aiResult.severity_level : 'MEDIUM';
    const currentConfidence = aiResult ? aiResult.ai_confidence : 97;
    const currentTimestamp = aiResult
        ? `Today, ${new Date(aiResult.detected_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : '1st September 10:30 AM';

    return (
        <div className="pest-detection-page">

            <Header />
            <Nav />
            <DashboardSubNav />

            <div className="ai-model">

                <div className="head">
                    <h1>AI MODEL</h1>
                </div>

                <div className="ai-panels">

                    <div className="cam-panel live-camera">
                        <div className="cam-panel-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <h2>LIVE CAMERA</h2>
                                <button 
                                    onClick={handleSetCustomCameraIp} 
                                    title="Configure ESP32-CAM Mobile Hotspot & IP"
                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#38bdf8', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}
                                >
                                    Hotspot IP
                                </button>
                                <button 
                                    onClick={handleToggleFlash} 
                                    title="Toggle Camera High-Power Flashlight LED"
                                    style={{ background: flashActive ? '#f59e0b' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: flashActive ? '#000' : '#a0aec0', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}
                                >
                                    {flashActive ? 'Flash ON' : 'Flash'}
                                </button>
                                <button 
                                    onClick={handleRefreshStream} 
                                    title="Reload Camera Stream"
                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#a0aec0', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', cursor: 'pointer' }}
                                >
                                    Reload
                                </button>
                            </div>
                            <span className={`status-pill ${uploadedImage || streamActive ? 'pill-online' : 'pill-offline'}`}>
                                <span className="status-dot"></span>
                                {uploadedImage ? 'Sample Active' : (streamActive ? 'Online' : 'Offline')}
                            </span>
                        </div>
                        <div className="cam-frame" style={{ position: 'relative' }}>
                            {uploadedImage ? (
                                <img
                                    src={uploadedImage}
                                    alt="Live / Uploaded Crop View"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : streamActive ? (
                                <img
                                    src={`${cameraUrl}?t=${streamKey}`}
                                    alt="ESP32-CAM Live Feed"
                                    onError={() => setStreamActive(false)}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                <div className="cam-placeholder">
                                    <p>Camera Stream Disconnected</p>
                                    <p style={{ fontSize: '11px', color: '#718096', marginTop: '4px' }}>Target: {cameraUrl}</p>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                        <button 
                                            onClick={handleRefreshStream}
                                            style={{ padding: '4px 10px', background: '#3182ce', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                        >
                                            Retry
                                        </button>
                                        <button 
                                            onClick={handleSetCustomCameraIp}
                                            style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                        >
                                            Enter IP
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isAnalyzing && (
                                <div className="ai-scanning-overlay">
                                    <div className="scanner-laser-bar"></div>
                                    <div className="scanning-hud-tag">
                                        <span className="radar-ping"></span>
                                        <span>Optical Inference Active...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#718096' }}>Source: {cameraUrl.slice(0, 30)}</span>
                            <button
                                onClick={handleCaptureFromCamera}
                                style={{
                                    padding: '5px 12px',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(16,185,129,0.3)'
                                }}
                            >
                                Scan Live Frame with AI
                            </button>
                        </div>
                    </div>

                    <div className="cam-panel upload-section">
                        <div className="cam-panel-header">
                            <h2>UPLOAD SECTION</h2>
                            <span className={`status-pill ${uploadedImage ? 'pill-online' : 'pill-idle'}`}>
                                <span className="status-dot"></span>
                                {isAnalyzing ? 'Analyzing AI...' : (uploadedImage ? 'Image Loaded' : 'Idle')}
                            </span>
                        </div>
                        <div className="upload-box">
                            {uploadedImage ? (
                                <>
                                    <div className="upload-preview-wrapper">
                                        <img
                                            src={uploadedImage}
                                            alt="Uploaded preview"
                                            className="upload-preview"
                                        />
                                        {isAnalyzing && (
                                            <div className="upload-analyzing-badge">
                                                <span className="upload-spinner"></span>
                                                Scanning...
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
                                    <span className="upload-label-text">Click to upload an image</span>
                                    <span className="upload-hint">JPG or PNG (AI Model Inference)</span>
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

                    <div className="cam-panel output-section">
                        <div className="cam-panel-header">
                            <h2>OUTPUT</h2>
                            <span className={`status-pill ${
                                isAnalyzing ? 'pill-analyzing' :
                                uploadedImage ? 'pill-upload' : 
                                (streamActive ? 'pill-online' : 'pill-offline')
                            }`}>
                                <span className="status-dot"></span>
                                {isAnalyzing ? 'Neural Inference...' : (
                                    uploadedImage ? (aiResult ? `Inferred (${aiResult.ai_confidence}%)` : 'Processing') :
                                    (streamActive ? 'From Live Feed' : 'No Source')
                                )}
                            </span>
                        </div>
                        <div className="output-frame">
                            {uploadedImage ? (
                                <div className="ai-output-container">
                                    <div className="ai-image-wrapper">
                                        <img
                                            src={uploadedImage}
                                            alt="AI Detection Output"
                                            className="output-image"
                                        />
                                        
                                        {isAnalyzing && (
                                            <div className="ai-scanning-overlay">
                                                <div className="scanner-laser-bar"></div>
                                                <div className="scanning-hud-tag">
                                                    <span className="radar-ping"></span>
                                                    <span>Running Saliency & YOLO INT8 Pipeline...</span>
                                                </div>
                                            </div>
                                        )}

                                        {!isAnalyzing && aiResult && aiResult.bounding_boxes && (
                                            <div className="ai-boxes-overlay">
                                                {aiResult.bounding_boxes.map((box, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`ai-bbox-box sev-${(aiResult.severity_level || 'medium').toLowerCase()}`}
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
                                                            {box.label || aiResult.detected_pest} • {box.conf || aiResult.ai_confidence}%
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {!isAnalyzing && aiResult && (
                                        <div className="ai-hud-floating-pill">
                                            <span className="hud-dot"></span>
                                            <span>{aiResult.detected_pest} | {aiResult.pest_count} Detected ({aiResult.ai_confidence}%)</span>
                                        </div>
                                    )}
                                </div>
                            ) : streamActive ? (
                                <img
                                    src={`${cameraUrl}?t=${streamKey}`}
                                    alt="Live Detection Output"
                                    className="output-image"
                                />
                            ) : (
                                <div className="cam-placeholder">
                                    <p>No Feed Available</p>
                                </div>
                            )}
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
                                <h2>PEST DETECTION</h2>
                                <p className={`unit ${aiResult?.severity_level === 'HIGH' || aiResult?.severity_level === 'SEVERE' ? 'text-hazard' : ''}`} id="pestStatus">
                                    {currentPestStatus}
                                </p>
                            </div>

                            <div className="box1">
                                <h2>TARGET CROP</h2>
                                <p className="unit" id="targetCrop">{currentCrop}</p>
                            </div>

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
                                <p className="unit" id="aiConfidence">{currentConfidence}%</p>
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
                    <div className={`pest-alert-banner banner-${(aiResult?.severity_level || 'medium').toLowerCase()}`}>
                        <div className="alert-banner-left">
                            <div className="alert-banner-text">
                                <h3>
                                    {aiResult
                                        ? `AI VISION DIAGNOSIS: ${aiResult.detected_pest?.toUpperCase()} (${aiResult.severity_level} SEVERITY)`
                                        : 'SYSTEM HEALTH ALERT: BIO-SECURITY RISK CONTROLLED'}
                                </h3>
                                <p>
                                    {aiResult
                                        ? aiResult.recommended_action
                                        : 'Optical AI scanning reports low aphid and whitefly activity across all greenhouse sectors. Targeted bio-pesticide sprayers on standby.'}
                                </p>
                            </div>
                        </div>
                        <div className="alert-banner-actions">
                            <AudioVoiceButton
                                text={aiResult ? `Pest detected: ${aiResult.detected_pest} at ${aiResult.severity_level} severity. Recommended action: ${aiResult.recommended_action}` : 'Pest bio-security is stable. Optical scanning reports zero active threat.'}
                                label="Speak Alert"
                            />
                            <span className="alert-status-pill">
                                {aiResult ? `${aiResult.ai_confidence}% Match` : 'Active Monitor'}
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

            <CameraModal
                isOpen={isCamModalOpen}
                onClose={() => setIsCamModalOpen(false)}
                currentUrl={cameraUrl}
                onUrlUpdated={(newUrl) => {
                    setCameraUrl(newUrl);
                    setStreamActive(true);
                    setStreamKey(Date.now());
                }}
                isOnline={streamActive}
            />

            <Footer />

        </div>
    );
};

export default PD;