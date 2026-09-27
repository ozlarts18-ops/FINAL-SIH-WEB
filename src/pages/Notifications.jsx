import { useState, useEffect } from 'react';
import Header from '../components/Header';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import { useLanguage } from '../context/LanguageContext';
import { fetchAlerts } from '../api/dataService';
import './Notifications.css';

const Notifications = () => {
    const { t } = useLanguage();
    const [alertsList, setAlertsList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('ALL'); // ALL, CRITICAL, UNREAD

    const loadAlerts = async () => {
        setIsLoading(true);
        try {
            const res = await fetchAlerts(50);
            if (res && res.data && Array.isArray(res.data)) {
                setAlertsList(res.data);
            }
        } catch (err) {
            console.error('Failed to load notifications:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadAlerts();
    }, []);

    const markAllAsRead = async () => {
        try {
            await fetch('/api/alerts/read-all', { method: 'POST' });
            setAlertsList(prev => prev.map(a => ({ ...a, is_read: true })));
        } catch (err) {
            console.error('Failed to mark alerts as read:', err);
        }
    };

    const markAsRead = async (id) => {
        try {
            await fetch(`/api/alerts/${id}/read`, { method: 'POST' });
            setAlertsList(prev => prev.map(a => a._id === id ? { ...a, is_read: true } : a));
        } catch (err) {
            console.error('Failed to mark alert as read:', err);
        }
    };

    const filteredAlerts = alertsList.filter(item => {
        if (filter === 'CRITICAL') return (item.severity || '').toUpperCase() === 'CRITICAL' || (item.severity || '').toUpperCase() === 'HIGH';
        if (filter === 'UNREAD') return !item.is_read;
        return true;
    });

    return (
        <div className="notifications-page">
            <Header />
            <Nav />

            <div className="notifications-container">
                <div className="notifications-header">
                    <div>
                        <h1>{t('notificationsPage.title') || 'NOTIFICATIONS & ALERTS'}</h1>
                        <p className="subtext">{t('notificationsPage.subtitle') || 'Real-time system events, threshold alerts, and operational logs'}</p>
                    </div>
                    <div className="header-actions">
                        <button className="btn-secondary" onClick={loadAlerts}>Refresh</button>
                        <button className="btn-primary" onClick={markAllAsRead}>Mark All as Read</button>
                    </div>
                </div>

                <div className="notifications-filter-bar">
                    <button
                        className={`filter-tab ${filter === 'ALL' ? 'active' : ''}`}
                        onClick={() => setFilter('ALL')}
                    >
                        ALL ({alertsList.length})
                    </button>
                    <button
                        className={`filter-tab ${filter === 'UNREAD' ? 'active' : ''}`}
                        onClick={() => setFilter('UNREAD')}
                    >
                        UNREAD ({alertsList.filter(a => !a.is_read).length})
                    </button>
                    <button
                        className={`filter-tab ${filter === 'CRITICAL' ? 'active' : ''}`}
                        onClick={() => setFilter('CRITICAL')}
                    >
                        CRITICAL ({alertsList.filter(a => (a.severity || '').toUpperCase() === 'CRITICAL' || (a.severity || '').toUpperCase() === 'HIGH').length})
                    </button>
                </div>

                {isLoading ? (
                    <div className="loading-state">
                        <span className="spinner"></span>
                        <p>Loading notification events...</p>
                    </div>
                ) : filteredAlerts.length === 0 ? (
                    <div className="empty-state">
                        <h3>{t('notificationsPage.noNotifications') || 'NO NOTIFICATIONS AVAILABLE'}</h3>
                        <p>{t('notificationsPage.noNotificationsDesc') || 'No system alerts or notification events found matching criteria.'}</p>
                    </div>
                ) : (
                    <div className="notifications-list">
                        {filteredAlerts.map((item, idx) => {
                            const sev = (item.severity || 'info').toLowerCase();
                            return (
                                <div
                                    key={item._id || idx}
                                    className={`notification-card sev-${sev} ${item.is_read ? 'is-read' : 'unread'}`}
                                >
                                    <div className="card-left">
                                        <div className={`sev-badge sev-${sev}`}>
                                            {(item.severity || 'INFO').toUpperCase()}
                                        </div>
                                        <div className="card-content">
                                            <div className="card-title">
                                                {item.title || item.alert_title || 'System Event'}
                                            </div>
                                            <div className="card-message">
                                                {item.message || item.alert_message || 'Telemetry threshold observation recorded.'}
                                            </div>
                                            <div className="card-meta">
                                                <span>Module: {item.module_name || item.device || 'System'}</span>
                                                <span className="bullet">•</span>
                                                <span>{item.created_at ? new Date(item.created_at).toLocaleString() : 'Recent'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="card-right">
                                        {!item.is_read && (
                                            <button
                                                className="btn-mark-read"
                                                onClick={() => markAsRead(item._id)}
                                                title="Mark as read"
                                            >
                                                Mark Read
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Footer />
        </div>
    );
};

export default Notifications;
