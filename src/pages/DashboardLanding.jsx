import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './DashboardLanding.css';

const DashboardLanding = () => {
    const { isAuthenticated, user, logout } = useAuth();
    const { language, toggleLanguage, t } = useLanguage();

    // Allow viewing user notification profile settings on /dashboard

    return (
        <div className="dl-container">
            <div className="dl-left">
                <div className="dl-left-content">
                    <h1>{t('auth.landingTitle')}</h1>
                    <p>{t('auth.landingDesc')}</p>
                </div>
            </div>
            <div className="dl-right">
                <div className="form-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h2 style={{ margin: 0 }}>{t('auth.dashboardAccess')}</h2>
                        <button
                            type="button"
                            onClick={toggleLanguage}
                            className="auth-lang-btn"
                            title="Toggle Language / भाषा बदलें"
                            style={{
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: '16px',
                                padding: '4px 10px',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#334155',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            <span>{language === 'en' ? 'हिन्दी' : 'English'}</span>
                        </button>
                    </div>

                    {isAuthenticated ? (
                        <div>
                            <p className="subtitle">
                                {t('auth.verifiedAs')} <b>{user?.email || 'User'}</b>
                            </p>
                            <Link to="/dashboard/air" className="dl-btn-link">
                                <button className="dl-btn">{t('auth.proceedBtn')}</button>
                            </Link>

                            <button
                                className="dl-btn secondary"
                                onClick={logout}
                                style={{ marginTop: '16px', width: '100%' }}
                            >
                                {t('auth.logoutBtn')}
                            </button>
                        </div>
                    ) : (
                        <div>
                            <p className="subtitle">{t('auth.authPrompt')}</p>
                            <Link to="/login" className="dl-btn-link">
                                <button className="dl-btn">{t('auth.loginBtn')}</button>
                            </Link>
                            <Link to="/register" className="dl-btn-link">
                                <button className="dl-btn secondary">{t('auth.registerBtn')}</button>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardLanding;