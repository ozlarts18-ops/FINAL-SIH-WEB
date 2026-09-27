import { useState, useEffect } from 'react';
import { updateCameraStreamUrl, toggleCameraFlash, captureCameraSnapshot, fetchCameraStatus } from '../api/dataService';
import './CameraModal.css';

const CameraModal = ({ isOpen, onClose, currentUrl, onUrlUpdated, isOnline = true }) => {
    const [inputUrl, setInputUrl] = useState(currentUrl || '');
    const [flashActive, setFlashActive] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [testImage, setTestImage] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    useEffect(() => {
        if (isOpen) {
            Promise.resolve().then(() => setInputUrl(currentUrl || ''));
            fetchCameraStatus().then(st => {
                if (st && st.flashLed !== undefined) {
                    setFlashActive(st.flashLed);
                }
            }).catch(() => {});
        }
    }, [isOpen, currentUrl]);

    if (!isOpen) return null;

    const handleSaveIp = async () => {
        if (!inputUrl.trim()) return;
        setIsSaving(true);
        setStatusMsg('Connecting to ESP32-CAM...');
        const clean = inputUrl.trim();
        const fullUrl = clean.startsWith('http') ? clean : `http://${clean}/stream`;
        
        await updateCameraStreamUrl(fullUrl);
        if (onUrlUpdated) {
            onUrlUpdated(fullUrl);
        }
        setIsSaving(false);
        setStatusMsg('Camera URL Updated Successfully!');
        setTimeout(() => setStatusMsg(''), 3000);
    };

    const handleToggleFlash = async () => {
        const nextState = !flashActive;
        setFlashActive(nextState);
        await toggleCameraFlash(nextState);
    };

    const handleTestSnapshot = async () => {
        setIsTesting(true);
        setStatusMsg('Capturing test frame from ESP32-CAM...');
        const clean = inputUrl.trim();
        let customCaptureUrl = null;
        if (clean) {
            const host = clean.replace(/^http:\/\//, '').replace(/\/stream\/?$/, '');
            customCaptureUrl = `http://${host}/capture?t=${Date.now()}`;
        }

        const frame = await captureCameraSnapshot(customCaptureUrl);
        setIsTesting(false);
        if (frame) {
            setTestImage(frame);
            setStatusMsg('Live Frame Captured Successfully!');
        } else {
            setStatusMsg('Could not reach camera. Ensure ESP32-CAM is connected to mobile hotspot.');
        }
    };

    const directStreamUrl = inputUrl.startsWith('http') ? inputUrl : (inputUrl ? `http://${inputUrl}/stream` : '/api/camera/stream');

    return (
        <div className="camera-modal-backdrop" onClick={onClose}>
            <div className="camera-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="camera-modal-header">
                    <h3 className="camera-modal-title">
                        ESP32-CAM Hotspot & Stream Setup
                    </h3>
                    <button className="camera-modal-close" onClick={onClose} title="Close Modal">✕</button>
                </div>

                <div className="camera-modal-body">
                    <div className="camera-status-card">
                        <div>
                            <div className="status-info-label">Live Link Status</div>
                            <div className="status-info-val">
                                {inputUrl || '/api/camera/stream'}
                            </div>
                        </div>
                        <span className={`cam-pill ${isOnline ? 'online' : 'offline'}`}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOnline ? '#10b981' : '#ef4444' }}></span>
                            {isOnline ? 'Online (Hotspot)' : 'Disconnected'}
                        </span>
                    </div>

                    <div className="form-group">
                        <label className="form-label">ESP32-CAM IP Address or Stream URL:</label>
                        <div className="input-with-btn">
                            <input
                                type="text"
                                className="cam-input"
                                placeholder="e.g. 192.168.43.105 or 10.152.37.105"
                                value={inputUrl}
                                onChange={(e) => setInputUrl(e.target.value)}
                            />
                            <button 
                                className="cam-btn"
                                onClick={handleSaveIp}
                                disabled={isSaving}
                            >
                                {isSaving ? 'Saving...' : 'Set IP'}
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Camera Hardware Controls:</label>
                        <div className="quick-actions-row">
                            <button
                                className={`cam-btn ${flashActive ? 'flash-on' : 'flash-off'}`}
                                onClick={handleToggleFlash}
                                title="Toggle high-power on-board Flash LED"
                            >
                                Flash LED: {flashActive ? 'ON' : 'OFF'}
                            </button>

                            <button
                                className="cam-btn secondary"
                                onClick={handleTestSnapshot}
                                disabled={isTesting}
                            >
                                {isTesting ? 'Testing...' : 'Test Frame Capture'}
                            </button>

                            <a
                                href={directStreamUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="cam-btn secondary"
                                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                            >
                                Open Raw Stream
                            </a>
                        </div>
                    </div>

                    {statusMsg && (
                        <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '6px', fontSize: '12px', color: '#34d399' }}>
                            {statusMsg}
                        </div>
                    )}

                    {testImage && (
                        <div className="test-preview-box">
                            <img src={testImage} alt="Test capture preview" />
                            <div className="test-preview-overlay">
                                <span>ESP32-CAM 5MP Test Frame</span>
                                <span>{new Date().toLocaleTimeString()}</span>
                            </div>
                        </div>
                    )}

                    <div className="hotspot-guide-box">
                        <h4>Mobile Hotspot Quick-Connect Guide:</h4>
                        <ol>
                            <li>Turn ON your phone's <strong>Personal Hotspot</strong> (ensure 2.4 GHz band is active).</li>
                            <li>In <code>firmware/esp32_cam/esp32_cam.ino</code>, set <code>WIFI_SSID</code> & <code>WIFI_PASSWORD</code> to your hotspot credentials.</li>
                            <li>Flash code to the ESP32-CAM using Arduino IDE or CLI.</li>
                            <li>Check your phone's <strong>Hotspot Connected Devices</strong> list to find the assigned IP (e.g. <code>192.168.43.xxx</code>).</li>
                            <li>Enter that IP above or use mDNS: <code>http://envirox-cam.local/stream</code>.</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CameraModal;
