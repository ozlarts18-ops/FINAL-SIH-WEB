import { useState, useCallback, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './LiveCanopy.css';

const DIRECT_STREAM_URL = 'http://ossie.local:8080/?action=stream';
const PROXY_STREAM_URL = '/api/camera/stream';

const LiveCanopy = ({
    title = 'LIVE CANOPY',
    isAnalyzing = false
}) => {
    const { language } = useLanguage();
    const [currentStreamUrl, setCurrentStreamUrl] = useState(DIRECT_STREAM_URL);
    const [streamError, setStreamError] = useState(false);
    const isMountedRef = useRef(true);
    const imgRef = useRef(null);

    // Stream cleanup on unmount to prevent duplicate stream connections
    useEffect(() => {
        isMountedRef.current = true;
        const currentImg = imgRef.current;
        return () => {
            isMountedRef.current = false;
            if (currentImg) {
                currentImg.onerror = null;
                currentImg.onload = null;
            }
        };
    }, []);

    const handleRefreshStream = useCallback(() => {
        if (isMountedRef.current) {
            setStreamError(false);
            setCurrentStreamUrl(DIRECT_STREAM_URL);
        }
    }, []);

    const handleImageError = useCallback(() => {
        if (isMountedRef.current) {
            if (currentStreamUrl === DIRECT_STREAM_URL) {
                setCurrentStreamUrl(PROXY_STREAM_URL);
            } else {
                setStreamError(true);
            }
        }
    }, [currentStreamUrl]);

    const defaultTitle = language === 'hi' ? 'लाइव फसल दृश्य' : 'LIVE CANOPY';

    return (
        <div className="live-canopy-panel">
            <div className="live-canopy-header">
                <h2 className="live-canopy-title">{title === 'LIVE CANOPY' ? defaultTitle : title}</h2>
            </div>

            <div className="live-canopy-frame-container">
                {!streamError ? (
                    <img
                        ref={imgRef}
                        src={currentStreamUrl}
                        alt="Live Canopy"
                        className="live-canopy-stream-img"
                        onError={handleImageError}
                        onLoad={() => setStreamError(false)}
                    />
                ) : (
                    <div className="live-canopy-offline">
                        <div className="offline-icon-box">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="23 7 16 12 23 17 23 7"/>
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                            </svg>
                        </div>
                        <div className="offline-title">{language === 'hi' ? 'कैमरा उपलब्ध नहीं है' : 'Camera unavailable'}</div>
                        <div className="offline-actions">
                            <button
                                type="button"
                                className="btn-canopy-retry"
                                onClick={handleRefreshStream}
                            >
                                {language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Laser / Radar Optical Scanning HUD */}
                {isAnalyzing && (
                    <div className="canopy-scanning-hud">
                        <div className="canopy-laser-bar" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default LiveCanopy;
