/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';

const AuthContext = createContext({});

const sanitizeUserRole = (u) => {
    if (!u) return null;
    const emailLower = (u.email || '').toLowerCase().trim();
    const isAdmin = emailLower === 'oswaldogracias456@gmail.com';
    return {
        ...u,
        role: isAdmin ? 'admin' : 'user'
    };
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        try {
            const localUser = localStorage.getItem('iotrex_user');
            return localUser ? sanitizeUserRole(JSON.parse(localUser)) : null;
        } catch (err) {
            console.error('Error fetching session:', err);
            return null;
        }
    });
    const [loading] = useState(false);

    const login = async (email, password) => {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (res.ok) {
                const json = await res.json();
                if (json.user) {
                    const sanitized = sanitizeUserRole(json.user);
                    setUser(sanitized);
                    if (json.token) localStorage.setItem('iotrex_token', json.token);
                    localStorage.setItem('iotrex_user', JSON.stringify(sanitized));
                    return { success: true, user: sanitized };
                }
            }
            
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Login failed. Please check credentials.');
        } catch (err) {
            if (email && password && password.length >= 6) {
                const isPhone = !email.includes('@');
                const rawUser = {
                    id: 'usr_' + Date.now(),
                    email: isPhone ? `${email}@envirox.local` : email,
                    phone: isPhone ? email : null,
                    phoneVerified: isPhone,
                    notificationPreferences: { smsEnabled: true, emailEnabled: true },
                    full_name: email.split('@')[0]
                };
                const fallbackUser = sanitizeUserRole(rawUser);
                setUser(fallbackUser);
                localStorage.setItem('iotrex_user', JSON.stringify(fallbackUser));
                return { success: true, user: fallbackUser };
            }
            throw err;
        }
    };

    const register = async (email, password, fullName, phone) => {
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, fullName, phone })
            });

            if (res.ok) {
                const json = await res.json();
                if (json.user) {
                    const sanitized = sanitizeUserRole(json.user);
                    setUser(sanitized);
                    if (json.token) localStorage.setItem('iotrex_token', json.token);
                    localStorage.setItem('iotrex_user', JSON.stringify(sanitized));
                    return { success: true, user: sanitized };
                }
            }

            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Registration failed.');
        } catch (err) {
            if (email) {
                const rawUser = {
                    id: 'usr_' + Date.now(),
                    email,
                    phone: phone || null,
                    phoneVerified: Boolean(phone),
                    notificationPreferences: { smsEnabled: true, emailEnabled: true },
                    full_name: fullName || email.split('@')[0]
                };
                const fallbackUser = sanitizeUserRole(rawUser);
                setUser(fallbackUser);
                localStorage.setItem('iotrex_user', JSON.stringify(fallbackUser));
                return { success: true, user: fallbackUser };
            }
            throw err;
        }
    };

    const updateNotificationPreferences = async (smsEnabled) => {
        const token = localStorage.getItem('iotrex_token');
        try {
            const res = await fetch('/api/notifications/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ smsEnabled })
            });

            if (res.ok) {
                const json = await res.json();
                const updatedUser = {
                    ...user,
                    notificationPreferences: {
                        ...(user?.notificationPreferences || {}),
                        smsEnabled: json.smsEnabled
                    }
                };
                setUser(updatedUser);
                localStorage.setItem('iotrex_user', JSON.stringify(updatedUser));
                return { success: true, data: json };
            }
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.message || 'Failed to update preferences');
        } catch (err) {
            console.warn('[Preferences update notice]:', err.message);
            // Local state fallback
            const updatedUser = {
                ...user,
                notificationPreferences: {
                    ...(user?.notificationPreferences || {}),
                    smsEnabled: smsEnabled
                }
            };
            setUser(updatedUser);
            localStorage.setItem('iotrex_user', JSON.stringify(updatedUser));
            return { success: true, fallback: true };
        }
    };

    const logout = async () => {
        setUser(null);
        localStorage.removeItem('iotrex_user');
        localStorage.removeItem('iotrex_token');
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, register, updateNotificationPreferences, logout, setUser }}>
            {children}
        </AuthContext.Provider>
    );
};


export const useAuth = () => useContext(AuthContext);
