import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './Footer.css';

const Footer = () => {
    const { t } = useLanguage();

    return (
        <footer className="footer">
            <div className="footer-links">
                <Link to="/">{t('footer.home')}</Link>
                <Link to="/about">{t('footer.about')}</Link>
                <Link to="/monitoring">{t('footer.monitoring')}</Link>
                <Link to="/contact">{t('footer.contact')}</Link>
                <Link to="/dashboard">{t('footer.dashboard')}</Link>
            </div>
            <div className="footer-info">
                <h3>{t('footer.brandTitle')}</h3>
                <p>{t('footer.brandSubtitle')}</p>
                <p>{t('footer.tagline')}</p>
                <p>{t('footer.email')}</p>
            </div>
            <div className="social-links">
                <a href="#">f</a>
                <a href="#">in</a>
                <a href="#">𝕏</a>
                <a href="#">◎</a>
            </div>
        </footer>
    );
};

export default Footer;