/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchCameraStatus, updateCameraStreamUrl, toggleCameraFlash } from '../api/dataService';

const CameraContext = createContext({
    cameraIp: 'envirox.local',
    connected: false,
    streamUrl: 'http://envirox.local:8080/?action=stream',
    flashLed: false,
    lastSeen: null,
    isModalOpen: false,
    openCameraModal: () => {},
    closeCameraModal: () => {},
    setCameraIp: async () => {},
    toggleFlash: async () => {},
    refreshStatus: async () => {}
});

export const CameraProvider = ({ children }) => {
    const [cameraIp, setCameraIpState] = useState(() => {
        try {
            return localStorage.getItem('envirox_camera_ip') || 'envirox.local';
        } catch (_e) {
            return 'envirox.local';
        }
    });

    const [connected, setConnected] = useState(false);
    const [streamUrl, setStreamUrl] = useState('http://envirox.local:8080/?action=stream');
    const [flashLed, setFlashLed] = useState(false);
    const [lastSeen, setLastSeen] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const isMountedRef = useRef(true);

    const refreshStatus = useCallback(async () => {
        try {
            const status = await fetchCameraStatus();
            if (!isMountedRef.current) return status;

            if (status) {
                const detectedIp = status.cameraIp || status.ip;
                if (detectedIp && !detectedIp.includes('<ESP32-CAM-IP>')) {
                    setCameraIpState(detectedIp);
                    try {
                        localStorage.setItem('envirox_camera_ip', detectedIp);
                    } catch (_err) {}
                }

                setConnected(Boolean(status.connected));
                setStreamUrl('/api/camera/stream');
                if (status.flashLed !== undefined) {
                    setFlashLed(Boolean(status.flashLed));
                }
                if (status.lastSeen || status.lastPing) {
                    setLastSeen(status.lastSeen || status.lastPing);
                }
            }
            return status;
        } catch (err) {
            if (isMountedRef.current) {
                setConnected(false);
            }
            return null;
        }
    }, []);

    const setCameraIp = useCallback(async (newIpOrUrl) => {
        if (!newIpOrUrl || !newIpOrUrl.trim()) return false;
        const clean = newIpOrUrl.trim();
        
        let extractedIp;
        if (clean.startsWith('http://') || clean.startsWith('https://')) {
            try {
                const u = new URL(clean);
                extractedIp = u.hostname;
            } catch (_e) {
                extractedIp = clean.replace(/^https?:\/\//, '').split('/')[0];
            }
        } else {
            extractedIp = clean.replace(/\/stream\/?$/, '').split('/')[0];
        }

        setCameraIpState(extractedIp);
        try {
            localStorage.setItem('envirox_camera_ip', extractedIp);
        } catch (_e) {}

        const updateResult = await updateCameraStreamUrl(clean);
        await refreshStatus();
        return updateResult;
    }, [refreshStatus]);

    const toggleFlash = useCallback(async (desiredState) => {
        const nextState = desiredState !== undefined ? Boolean(desiredState) : !flashLed;
        setFlashLed(nextState);
        try {
            const res = await toggleCameraFlash(nextState, cameraIp);
            if (res && res.led !== undefined) {
                setFlashLed(res.led === 'ON' || res.val === 1);
            }
        } catch (err) {
            console.warn('[CameraContext] Toggle flash error:', err.message);
        }
    }, [flashLed, cameraIp]);

    const openCameraModal = useCallback(() => setIsModalOpen(true), []);
    const closeCameraModal = useCallback(() => setIsModalOpen(false), []);

    useEffect(() => {
        isMountedRef.current = true;
        const initTimer = setTimeout(() => {
            refreshStatus();
        }, 50);

        const pollInterval = setInterval(() => {
            refreshStatus();
        }, 7000);

        return () => {
            isMountedRef.current = false;
            clearTimeout(initTimer);
            clearInterval(pollInterval);
        };
    }, [refreshStatus]);

    return (
        <CameraContext.Provider
            value={{
                cameraIp,
                connected,
                cameraConnected: connected,
                streamUrl,
                flashLed,
                lastSeen,
                isModalOpen,
                openCameraModal,
                closeCameraModal,
                setCameraIp,
                toggleFlash,
                refreshStatus
            }}
        >
            {children}
        </CameraContext.Provider>
    );
};

export const useCamera = () => useContext(CameraContext);
export default CameraContext;
