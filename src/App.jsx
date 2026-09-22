import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import About from './pages/About';
import Monitoring from './pages/Monitoring';
import Contact from './pages/Contact';
import DashboardLanding from './pages/DashboardLanding';
import Login from './pages/Login';
import Register from './pages/Register';
import AirPollutionDashboard from './dashboard/air_pollution/air';
import WaterQualityDashboard from './dashboard/waterquality/WaterQualityDashboard';
import PlantHealthDashboard from './dashboard/plantgrowth_disease/plant';
import PestDetectionDashboard from './dashboard/pest_detection/pd';

function App() {
    return (
        <LanguageProvider>
            <AuthProvider>
                <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/monitoring" element={<Monitoring />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/dashboard" element={<DashboardLanding />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />

                    <Route
                        path="/dashboard/air"
                        element={
                            <ProtectedRoute>
                                <AirPollutionDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/dashboard/water"
                        element={
                            <ProtectedRoute>
                                <WaterQualityDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/dashboard/plant"
                        element={
                            <ProtectedRoute>
                                <PlantHealthDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/dashboard/weather"
                        element={
                            <ProtectedRoute>
                                <PestDetectionDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/plant"
                        element={
                            <ProtectedRoute>
                                <PlantHealthDashboard />
                            </ProtectedRoute>
                        }
                    />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    </LanguageProvider>
    );
}

export default App;
