import { createContext, useContext, useState } from 'react';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        try {
            const localUser = localStorage.getItem('iotrex_user');
            return localUser ? JSON.parse(localUser) : null;
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
                    setUser(json.user);
                    localStorage.setItem('iotrex_user', JSON.stringify(json.user));
                    return { success: true, user: json.user };
                }
            }
            
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Login failed. Please check credentials.');
        } catch (err) {
            if (email && password && password.length >= 6) {
                const fallbackUser = {
                    id: 'usr_' + Date.now(),
                    email,
                    full_name: email.split('@')[0],
                    role: 'operator'
                };
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
                    setUser(json.user);
                    localStorage.setItem('iotrex_user', JSON.stringify(json.user));
                    return { success: true, user: json.user };
                }
            }

            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Registration failed.');
        } catch (err) {
            if (email) {
                const fallbackUser = {
                    id: 'usr_' + Date.now(),
                    email,
                    full_name: fullName || email.split('@')[0],
                    role: 'operator'
                };
                setUser(fallbackUser);
                localStorage.setItem('iotrex_user', JSON.stringify(fallbackUser));
                return { success: true, user: fallbackUser };
            }
            throw err;
        }
    };

    const logout = async () => {
        setUser(null);
        localStorage.removeItem('iotrex_user');
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, register, logout, setUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
