import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { fetchAlerts } from '../api/dataService';
import './Header.css';

const Header = () => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        let isMounted = true;
        fetchAlerts(20)
            .then(res => {
                if (isMounted && res && res.data && Array.isArray(res.data)) {
                    const unread = res.data.filter(a => a && !a.is_read && a.status !== 'RESOLVED').length;
                    setUnreadCount(unread);
                }
            })
            .catch(() => {});
        return () => { isMounted = false; };
    }, []);

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
                <Link to="/notifications" className="header-nav-link" aria-label={t('header.notifications')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    <span className="header-text">{t('header.notifications')}</span>
                    {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
                </Link>
                <span className="divider"></span>
                <Link to="/profile" className="header-nav-link" aria-label={t('header.profile')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span className="header-text">{user?.full_name || user?.email?.split('@')[0] || t('header.profile')}</span>
                </Link>
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