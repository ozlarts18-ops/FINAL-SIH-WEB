import { useState, useEffect, useRef } from 'react';
import { fetchLatestPiFrame, fetchPiCameraStatus } from '../api/dataService';
import { useLanguage } from '../context/LanguageContext';
import './PiCameraFeed.css';

const PiCameraFeed = ({ title = "RASPBERRY PI USB CAMERA" }) => {
    const { language } = useLanguage();
    const [frameData, setFrameData] = useState(null);
    const [status, setStatus] = useState({ connected: false, last_seen: null, device_id: null });
    const isMountedRef = useRef(true);

    const isFetchingRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;

        const updateFrame = async () => {
            if (isFetchingRef.current) return;
            isFetchingRef.current = true;
            try {
                const data = await fetchLatestPiFrame();
                if (isMountedRef.current) {
                    if (data && data.image_base64) {
                        setFrameData(data);
                    } else {
                        setFrameData(null);
                    }
                }
            } catch (_e) {
            } finally {
                isFetchingRef.current = false;
            }
        };

        const updateStatus = async () => {
            const st = await fetchPiCameraStatus();
            if (isMountedRef.current && st) {
                setStatus(st);
            }
        };

        updateFrame();
        updateStatus();

        const frameInterval = setInterval(updateFrame, 250);
        const statusInterval = setInterval(updateStatus, 2500);

        return () => {
            isMountedRef.current = false;
            clearInterval(frameInterval);
            clearInterval(statusInterval);
        };
    }, []);

    const formatLastSeen = (ts, now = 0) => {
        if (!ts) return language === 'hi' ? 'कभी नहीं' : 'Never';
        const refTime = now || ts;
        const secAgo = Math.max(0, Math.floor((refTime - ts) / 1000));
        if (secAgo < 2) return language === 'hi' ? 'अभी' : 'Just now';
        return language === 'hi' ? `${secAgo}से पहले` : `${secAgo}s ago`;
    };

    const defaultTitle = language === 'hi' ? 'रास्पबेरी पाई USB कैमरा' : 'RASPBERRY PI USB CAMERA';

    return (
        <div className="cam-panel pi-camera-panel">
            <div className="cam-panel-header">
                <div className="pi-cam-title-group">
                    <h2>{title === "RASPBERRY PI USB CAMERA" ? defaultTitle : title}</h2>
                </div>
                <div className={`pi-status-badge ${status.connected ? 'badge-online' : 'badge-offline'}`}>
                    <span className={`pi-pulse-dot ${status.connected ? 'dot-online' : 'dot-offline'}`} />
                    <div className="pi-status-info">
                        <span className="pi-state-label">
                            {language === 'hi' ? 'पाई कैमरा' : 'Pi Cam'}: <strong>{status.connected ? (language === 'hi' ? 'कनेक्टेड' : 'Connected') : (language === 'hi' ? 'ऑफलाइन' : 'Offline')}</strong>
                        </span>
                        <span className="pi-ip-label">
                            @{status.device_id || 'raspberrypi'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="pi-camera-feed-container">
                {frameData && frameData.image_base64 ? (
                    <div className="pi-camera-frame-wrapper">
                        <img
                            src={`data:image/jpeg;base64,${frameData.image_base64}`}
                            alt="Raspberry Pi USB Camera Feed"
                            className="pi-camera-img"
                        />
                        <div className="pi-cam-hud-overlay">
                            <span className="pi-cam-hud-pill">
                                <span className="pi-cam-hud-dot"></span>
                                {language === 'hi' ? 'लाइव फ़ीड' : 'LIVE FEED'} • {formatLastSeen(frameData.timestamp || status.last_seen)}
                            </span>
                            <span className="pi-cam-id-pill">
                                NODE: {frameData.device_id || status.device_id || 'raspberrypi'}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="pi-camera-offline-placeholder">
                        <div className="offline-icon-wrapper">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="6" width="14" height="12" rx="2" />
                                <path d="M22 8.5l-6 3.5 6 3.5v-7z" />
                                <line x1="2" y1="2" x2="22" y2="22" />
                            </svg>
                        </div>
                        <h4 className="offline-title">{language === 'hi' ? 'पाई कैमरा ऑफलाइन' : 'Pi Camera Offline'}</h4>
                        <p className="offline-subtext">
                            {language === 'hi' ? 'फ्रेम प्राप्ति की प्रतीक्षा:' : 'Awaiting frame POST from'} <code>{status.device_id || 'raspberrypi'}</code>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PiCameraFeed;
