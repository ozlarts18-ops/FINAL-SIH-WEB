import React from 'react';
import Header from './Header';
import Nav from './Nav';
import DashboardSubNav from './DashboardSubNav';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[Dashboard Error Boundary Caught Error]:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ minHeight: '100vh', background: '#0a0f1d', color: '#e2e8f0', display: 'flex', flexDirection: 'column' }}>
                    <Header />
                    <Nav />
                    <DashboardSubNav />
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px 20px',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            background: '#151c2f',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            borderRadius: '12px',
                            padding: '32px 40px',
                            maxWidth: '560px',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                        }}>
                            <div style={{ marginBottom: '16px', display: 'inline-block' }}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            </div>
                            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#f87171', marginBottom: '12px' }}>
                                Dashboard component failed to load.
                            </h2>
                            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
                                Check browser console for details. Navigation remains fully functional. You can switch to another dashboard tab above or retry loading this component.
                            </p>
                            <button
                                type="button"
                                onClick={this.handleRetry}
                                style={{
                                    backgroundColor: '#22c55e',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '10px 24px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                Reload Component
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
