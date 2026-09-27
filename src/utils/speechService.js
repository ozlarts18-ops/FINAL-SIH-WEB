
let currentUtterance = null;
let isSpeakingState = false;
let stateChangeListeners = [];

export const getCurrentUtterance = () => currentUtterance;

export const subscribeSpeechState = (listener) => {
    stateChangeListeners.push(listener);
    return () => {
        stateChangeListeners = stateChangeListeners.filter(l => l !== listener);
    };
};

const notifyStateChange = (state) => {
    isSpeakingState = state;
    stateChangeListeners.forEach(fn => fn(state));
};

export const getAvailableIndianVoices = () => {
    if (!('speechSynthesis' in window)) return [];
    const voices = window.speechSynthesis.getVoices();
    return voices.filter(v => 
        v.lang.startsWith('hi') || 
        v.lang.startsWith('mr') || 
        v.lang.startsWith('en-IN') || 
        v.lang.startsWith('en')
    );
};

export const speakAdvisory = (text, lang = 'hi-IN', onEnd = null) => {
    if (!('speechSynthesis' in window)) {
        console.warn('[Speech Engine] Speech synthesis not supported in this browser.');
        return false;
    }

    stopSpeech();

    if (!text || typeof text !== 'string') return false;

    const cleanText = text
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/[*#_~]/g, '')
        .trim();

    if (!cleanText) return false;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    currentUtterance = utterance;

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice;

    if (lang === 'hi' || lang === 'hi-IN') {
        selectedVoice = voices.find(v => v.lang.includes('hi')) || voices.find(v => v.lang.includes('IN'));
        utterance.lang = 'hi-IN';
    } else if (lang === 'mr' || lang === 'mr-IN') {
        selectedVoice = voices.find(v => v.lang.includes('mr')) || voices.find(v => v.lang.includes('hi')) || voices.find(v => v.lang.includes('IN'));
        utterance.lang = 'mr-IN';
    } else {
        selectedVoice = voices.find(v => v.lang === 'en-IN') || voices.find(v => v.lang.startsWith('en'));
        utterance.lang = 'en-IN';
    }

    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    utterance.rate = 0.92;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
        notifyStateChange(true);
    };

    utterance.onend = () => {
        notifyStateChange(false);
        currentUtterance = null;
        if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
        console.warn('[Speech Engine Error]:', e);
        notifyStateChange(false);
        currentUtterance = null;
    };

    window.speechSynthesis.speak(utterance);
    return true;
};

export const stopSpeech = () => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        notifyStateChange(false);
        currentUtterance = null;
    }
};

export const isSpeaking = () => isSpeakingState;
