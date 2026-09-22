import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './Nav.css';

const Nav = () => {
    const location = useLocation();
    const { language, toggleLanguage, t } = useLanguage();

    return (
        <div className="main-nav">
            <div className="nav-container">
                <div className="logo">
                    <h1>IOTrex</h1>
                    <span>{t('nav.brandSubtitle')}</span>
                </div>

                <ul className="nav-links">
                    <li>
                        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
                            {t('nav.home')}
                        </Link>
                    </li>
                    <li>
                        <Link to="/about" className={location.pathname === '/about' ? 'active' : ''}>
                            {t('nav.about')}
                        </Link>
                    </li>
                    <li>
                        <Link to="/monitoring" className={location.pathname === '/monitoring' ? 'active' : ''}>
                            {t('nav.monitoring')}
                        </Link>
                    </li>
                    <li>
                        <Link to="/contact" className={location.pathname === '/contact' ? 'active' : ''}>
                            {t('nav.contact')}
                        </Link>
                    </li>
                    <li className="Dashboard">
                        <Link to="/dashboard" className={location.pathname.startsWith('/dashboard') ? 'active' : ''}>
                            {t('nav.dashboard')}
                        </Link>
                    </li>
                    <li className="nav-lang-item">
                        <button
                            type="button"
                            className={`lang-switch-btn ${language === 'hi' ? 'lang-hi' : 'lang-en'}`}
                            onClick={toggleLanguage}
                            title={language === 'en' ? 'Switch to Hindi (हिन्दी)' : 'Switch to English'}
                            aria-label="Switch Language"
                        >
                            <span className="lang-pill-track">
                                <span className={`lang-pill-opt ${language === 'en' ? 'active' : ''}`}>EN</span>
                                <span className={`lang-pill-opt ${language === 'hi' ? 'active' : ''}`}>हिन्दी</span>
                            </span>
                        </button>
                    </li>
                </ul>
            </div>
        </div>
    );
};

export default Nav;