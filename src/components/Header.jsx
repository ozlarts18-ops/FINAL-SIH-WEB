import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './Header.css';

const Header = () => {
    const { t } = useLanguage();

    return (
        <div className="top-header">
            <div className="top-left">
                <a href="mailto:iotrex@gmail.com" className="header-contact-link">
                    <span className="header-text">iotrex@gmail.com</span>
                </a>
            </div>
            <div className="top-right">
                <div className="social-icons-group">
                    <a href="#" aria-label="Facebook">f</a>
                    <a href="#" aria-label="LinkedIn">in</a>
                    <a href="#" aria-label="Twitter">X</a>
                </div>
                <span className="divider"></span>
                <Link to="/" className="brand-link">
                    <span className="brand-text">{t('header.smartEnv')}</span>
                </Link>
                <span className="divider"></span>
                <div className="system-badge">
                    <span className="system-text">{t('header.systemBadge')}</span>
                </div>
            </div>
        </div>
    );
};

export default Header;