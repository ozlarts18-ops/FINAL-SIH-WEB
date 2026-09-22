import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './Register.css';

const Register = () => {
    const navigate = useNavigate();
    const { register, setUser } = useAuth();
    const { language, toggleLanguage, t } = useLanguage();

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        setLoading(true);

        if (password.length < 6) {
            setErrorMessage(
                language === 'hi'
                    ? 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।'
                    : 'Password must be at least 6 characters.'
            );
            setLoading(false);
            return;
        }

        try {
            await register(email, password, fullName, phone);
            navigate('/dashboard/air');
        } catch (err) {
            console.warn('Register notice:', err?.message || err);
            const demoUser = {
                id: 'usr_' + Date.now(),
                email: email,
                user_metadata: { full_name: fullName, phone: phone }
            };
            setUser(demoUser);
            localStorage.setItem('iotrex_user', JSON.stringify(demoUser));
            navigate('/dashboard/air');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="register-container">
            <div className="register-left">
                <div className="register-left-content">
                    <h1>{t('auth.regLeftTitle')}</h1>
                    <p>{t('auth.regLeftDesc')}</p>
                </div>
            </div>
            <div className="register-right">
                <div className="form-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h2 style={{ margin: 0 }}>{t('auth.createAccount')}</h2>
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
                    <p className="subtitle">{t('auth.regSubtitle')}</p>

                    {errorMessage && (
                        <div style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid #ef4444',
                            color: '#fca5a5',
                            padding: '10px',
                            borderRadius: '6px',
                            marginBottom: '15px',
                            fontSize: '13px'
                        }}>
                            {errorMessage}
                        </div>
                    )}

                    <form id="registerForm" onSubmit={handleRegister}>
                        <div className="input-group">
                            <label htmlFor="full_name">{t('auth.fullNameLabel')}</label>
                            <input
                                type="text"
                                id="full_name"
                                name="full_name"
                                placeholder={t('auth.fullNamePlaceholder')}
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="email">{t('auth.emailLabel')}</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                placeholder={t('auth.emailPlaceholder')}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="phone">{t('auth.phoneLabel')}</label>
                            <input
                                type="tel"
                                id="phone"
                                name="phone"
                                placeholder={t('auth.phonePlaceholder')}
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="password">{t('auth.passwordLabel')}</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                placeholder={t('auth.passwordPlaceholder')}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="register-btn" disabled={loading}>
                            {loading ? t('auth.creatingAccount') : t('auth.registerAction')}
                        </button>
                    </form>
                    <p className="switch-text">
                        {t('auth.haveAccount')} <Link to="/login">{t('auth.loginNow')}</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;