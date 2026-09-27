import { useCamera } from '../context/CameraContext';
import { useLanguage } from '../context/LanguageContext';
import './CameraStatusBadge.css';

const CameraStatusBadge = ({ onOpenModal, showConfigureBtn = true, compact = false }) => {
    const { cameraIp, connected, openCameraModal } = useCamera();
    const { language } = useLanguage();

    const handleClickConfigure = (e) => {
        e.stopPropagation();
        if (onOpenModal) {
            onOpenModal();
        } else if (openCameraModal) {
            openCameraModal();
        }
    };

    return (
        <div className={`camera-status-badge ${connected ? 'badge-online' : 'badge-offline'} ${compact ? 'badge-compact' : ''}`}>
            <span className={`cam-pulse-dot ${connected ? 'dot-online' : 'dot-offline'}`} />
            <div className="cam-status-info">
                <span className="cam-state-label">
                    {language === 'hi' ? 'कैमरा' : 'Camera'}: <strong>{connected ? (language === 'hi' ? 'कनेक्टेड' : 'Connected') : (language === 'hi' ? 'डिस्कनेक्टेड' : 'Disconnected')}</strong>
                </span>
                <span className="cam-ip-label">
                    @{cameraIp || 'envirox.local'}
                </span>
            </div>
            {showConfigureBtn && (
                <button
                    type="button"
                    onClick={handleClickConfigure}
                    className="cam-badge-cfg-btn"
                    title="Configure ESP32-CAM IP & Stream"
                >
                    {language === 'hi' ? 'कॉन्फ़िगर' : 'Config'}
                </button>
            )}
        </div>
    );
};

export default CameraStatusBadge;
