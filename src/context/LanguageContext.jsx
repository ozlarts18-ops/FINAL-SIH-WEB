import { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../locales/translations';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
    const [language, setLanguageState] = useState(() => {
        return localStorage.getItem('envirox_language') || 'en';
    });

    useEffect(() => {
        localStorage.setItem('envirox_language', language);
        document.documentElement.lang = language;
    }, [language]);

    const setLanguage = (lang) => {
        if (lang === 'en' || lang === 'hi') {
            setLanguageState(lang);
        }
    };

    const toggleLanguage = () => {
        setLanguageState((prev) => (prev === 'en' ? 'hi' : 'en'));
    };

    const t = (path, fallback = '') => {
        if (!path) return fallback;
        const keys = path.split('.');
        
        let current = translations[language];
        for (const k of keys) {
            if (current && typeof current === 'object' && k in current) {
                current = current[k];
            } else {
                current = undefined;
                break;
            }
        }

        if (current !== undefined && typeof current === 'string') {
            return current;
        }

        let fallbackCurrent = translations['en'];
        for (const k of keys) {
            if (fallbackCurrent && typeof fallbackCurrent === 'object' && k in fallbackCurrent) {
                fallbackCurrent = fallbackCurrent[k];
            } else {
                fallbackCurrent = undefined;
                break;
            }
        }

        return fallbackCurrent !== undefined && typeof fallbackCurrent === 'string'
            ? fallbackCurrent
            : fallback || path;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};

export default LanguageContext;
