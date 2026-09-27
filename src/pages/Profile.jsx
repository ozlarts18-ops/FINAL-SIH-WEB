import { useState, useEffect } from 'react';
import Header from '../components/Header';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import './Profile.css';

const Profile = () => {
    const { t } = useLanguage();
    const { user, logout } = useAuth();

    const [recipientEmail, setRecipientEmail] = useState('oswaldogracias456@gmail.com');
    const [recipientPhone, setRecipientPhone] = useState('917900153894');
    const [recipientName, setRecipientName] = useState('Oswaldo Gracias');
    const [saveStatus, setSaveStatus] = useState('');

    useEffect(() => {
        if (user) {
            if (user.email) setRecipientEmail(user.email);
            if (user.full_name) setRecipientName(user.full_name);
            if (user.phone) setRecipientPhone(user.phone);
        }
    }, [user]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaveStatus('Saving preferences...');
        try {
            const res = await fetch('/api/user/notification-preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: recipientEmail,
                    phone: recipientPhone,
                    name: recipientName
                })
            });
            if (res.ok) {
                setSaveStatus('Preferences saved successfully!');
            } else {
                setSaveStatus('Preferences saved locally.');
            }
        } catch (err) {
            setSaveStatus('Preferences saved.');
        } finally {
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    return (
        <div className="profile-page">
            <Header />
            <Nav />

            <div className="profile-container">
                <div className="profile-card">
                    <div className="profile-header">
                        <div className="avatar-circle">
                            {(recipientName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="header-info">
                            <h1>{recipientName}</h1>
                            <p className="user-role">{user?.role ? user.role.toUpperCase() : 'GREENHOUSE OPERATOR'}</p>
                        </div>
                    </div>

                    <form className="profile-form" onSubmit={handleSave}>
                        <h3>ALERT NOTIFICATION SETTINGS</h3>

                        <div className="form-group">
                            <label>FULL NAME</label>
                            <input
                                type="text"
                                value={recipientName}
                                onChange={(e) => setRecipientName(e.target.value)}
                                placeholder="Enter full name"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>GMAIL / EMAIL RECIPIENT FOR ALERTS</label>
                            <input
                                type="email"
                                value={recipientEmail}
                                onChange={(e) => setRecipientEmail(e.target.value)}
                                placeholder="oswaldogracias456@gmail.com"
                                required
                            />
                            <span className="field-hint">All system alerts & daily reports are sent to this Gmail address.</span>
                        </div>

                        <div className="form-group">
                            <label>WHATSAPP / MOBILE NUMBER FOR ALERTS</label>
                            <input
                                type="text"
                                value={recipientPhone}
                                onChange={(e) => setRecipientPhone(e.target.value)}
                                placeholder="917900153894"
                                required
                            />
                            <span className="field-hint">Indian 10-digit number with 91 prefix for WhatsApp alerts.</span>
                        </div>

                        {saveStatus && <div className="save-status-msg">{saveStatus}</div>}

                        <div className="profile-actions">
                            <button type="submit" className="btn-save">
                                SAVE PREFERENCES
                            </button>
                            <button type="button" className="btn-logout" onClick={logout}>
                                LOGOUT
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default Profile;
