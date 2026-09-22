import { useState, useEffect } from 'react';
import { speakAdvisory, stopSpeech, subscribeSpeechState } from '../utils/speechService';
import { useLanguage } from '../context/LanguageContext';

const AudioVoiceButton = ({ text, hindiText, marathiText, label = 'Voice Advisory', className = '' }) => {
    const { language } = useLanguage();
    const [speaking, setSpeaking] = useState(false);

    useEffect(() => {
        const unsubscribe = subscribeSpeechState((isSpeaking) => {
            setSpeaking(isSpeaking);
        });
        return () => unsubscribe();
    }, []);

    const handleToggleSpeak = () => {
        if (speaking) {
            stopSpeech();
            setSpeaking(false);
            return;
        }

        let targetText = text;
        let targetLang = 'en-IN';

        if (language === 'hi' && hindiText) {
            targetText = hindiText;
            targetLang = 'hi-IN';
        } else if (language === 'mr' && (marathiText || hindiText)) {
            targetText = marathiText || hindiText;
            targetLang = 'mr-IN';
        } else if (language === 'hi') {
            targetLang = 'hi-IN';
        } else if (language === 'mr') {
            targetLang = 'mr-IN';
        }

        speakAdvisory(targetText, targetLang);
    };

    const getButtonLabel = () => {
        if (speaking) {
            if (language === 'hi') return 'रोकें (Stop)';
            if (language === 'mr') return 'थांबवा (Stop)';
            return 'Stop Audio';
        }
        if (language === 'hi') return 'सुनो (आवाज)';
        if (language === 'mr') return 'ऐका (आवाज)';
        return label;
    };

    return (
        <button
            type="button"
            className={`audio-voice-btn ${speaking ? 'is-speaking' : ''} ${className}`}
            onClick={handleToggleSpeak}
            title={speaking ? 'Click to pause audio' : 'Listen to spoken agricultural advisory'}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                background: speaking ? '#dc2626' : '#1b5e20',
                color: '#ffffff',
                border: 'none',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: speaking ? '0 0 10px rgba(220, 38, 38, 0.5)' : '0 2px 6px rgba(27, 94, 32, 0.25)',
                whiteSpace: 'nowrap'
            }}
        >
            {speaking && (
                <span
                    style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#ffffff',
                        animation: 'pulse 1s infinite'
                    }}
                />
            )}
            <span>{getButtonLabel()}</span>
        </button>
    );
};

export default AudioVoiceButton;
