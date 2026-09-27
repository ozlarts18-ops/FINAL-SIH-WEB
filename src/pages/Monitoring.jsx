import Header from '../components/Header';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import { useLanguage } from '../context/LanguageContext';
import './Monitoring.css';

const Monitoring = () => {
    const { t } = useLanguage();

    return (
        <div>
            <Header />
            <Nav />

            <div className="hero-text">
                <img src="/Photos/montechmain.jpg" alt="Monitoring Tech" />
                <div className="hero-content">
                    <h1>{t('monitoring.heroTitle')}</h1>
                    <p>{t('monitoring.heroSubtitle')}</p>
                </div>
            </div>

            <section className="section">
                <div className="card1">
                    <div className="image1">
                        <img src="/Photos/fieldmain.jpg" alt="Field" />
                    </div>
                    <div className="content1">
                        <h2>{t('monitoring.card1Title')}</h2>
                        <p>
                            <b>{t('monitoring.infoLabel')}</b><br />
                            {t('monitoring.card1Info')}
                        </p>
                        <p>
                            <b>{t('monitoring.techLabel')}</b><br />
                            Raspberry Pi<br />
                            Capacitive Soil Moisture Sensor<br />
                            MCP3008 ADC<br />
                            Relay Module<br />
                            Water Pump<br />
                            Python
                        </p>
                    </div>
                </div>

                <div className="card2">
                    <div className="image2">
                        <img src="/Photos/Sensors1.jpg" alt="Sensors" />
                    </div>
                    <div className="content2">
                        <h2>{t('monitoring.card2Title')}</h2>
                        <p>
                            <b>{t('monitoring.infoLabel')}</b><br />
                            {t('monitoring.card2Info')}
                        </p>
                        <p>
                            <b>{t('monitoring.techLabel')}</b><br />
                            Raspberry Pi<br />
                            HC-SR04 Ultrasonic Sensor<br />
                            Relay Module<br />
                            Python
                        </p>
                    </div>
                </div>

                <div className="card3">
                    <div className="image3">
                        <img src="/Photos/Lighttube.jpg" alt="Lighttube" />
                    </div>
                    <div className="content3">
                        <h2>{t('monitoring.card3Title')}</h2>
                        <p>
                            <b>{t('monitoring.infoLabel')}</b><br />
                            {t('monitoring.card3Info')}
                        </p>
                        <p>
                            <b>{t('monitoring.techLabel')}</b><br />
                            Raspberry Pi<br />
                            BH1750 Digital Light Sensor<br />
                            LED Grow Lights<br />
                            Relay Module<br />
                            Python
                        </p>
                    </div>
                </div>

                <div className="card4">
                    <div className="image4">
                        <img src="/Photos/Raspberrypi2.jpg" alt="ESP32-S3 & Raspberry Pi" />
                    </div>
                    <div className="content4">
                        <h2>{t('monitoring.card4Title')}</h2>
                        <p>
                            <b>{t('monitoring.infoLabel')}</b><br />
                            {t('monitoring.card4Info')}
                        </p>
                        <p>
                            <b>{t('monitoring.techLabel')}</b><br />
                            ESP32-S3 (Dual-Core 240MHz + Vector SIMD)<br />
                            MobileNetV3-PlantGuard Dual-Head<br />
                            OV2640 / OV5640 Image Sensor<br />
                            WebSerial / Python Serial Bridge<br />
                            TensorFlow Lite Micro
                        </p>
                    </div>
                </div>

                <div className="card5">
                    <div className="image5">
                        <img src="/Photos/Sensor3.jpg" alt="Air AI Model" />
                    </div>
                    <div className="content5">
                        <h2>{t('monitoring.card5Title')}</h2>
                        <p>
                            <b>{t('monitoring.infoLabel')}</b><br />
                            {t('monitoring.card5Info')}
                        </p>
                        <p>
                            <b>{t('monitoring.techLabel')}</b><br />
                            EnviroX-DeepAir-ResNetX Neural Model<br />
                            DHT22 / MQ-135 Gas / PM2.5 Sensors<br />
                            Automated Exhaust Fan Relays<br />
                            Node.js & Python AI Inference Engine
                        </p>
                    </div>
                </div>

                <div className="card6">
                    <div className="image6">
                        <img src="/Photos/sensor6.jpg" alt="ESP32-S3 Pest AI" />
                    </div>
                    <div className="content6">
                        <h2>{t('monitoring.card6Title')}</h2>
                        <p>
                            <b>{t('monitoring.infoLabel')}</b><br />
                            {t('monitoring.card6Info')}
                        </p>
                        <p>
                            <b>{t('monitoring.techLabel')}</b><br />
                            ESP32-S3 QFN56 (8MB Octal PSRAM + 16MB Flash)<br />
                            MobileNetV2-SSD-Lite INT8 (~38ms latency)<br />
                            CH343 USB-to-UART @ 115200 Baud (COM7)<br />
                            WebSerial API & Local Python Bridge<br />
                            Solenoid Bio-Pesticide Actuator
                        </p>
                    </div>
                </div>

                <div className="card7">
                    <div className="image7">
                        <img src="/Photos/Laptop8.jpg" alt="Full Stack Web Dashboard" />
                    </div>
                    <div className="content7">
                        <h2>{t('monitoring.card7Title')}</h2>
                        <p>
                            <b>{t('monitoring.infoLabel')}</b><br />
                            {t('monitoring.card7Info')}
                        </p>
                        <p>
                            <b>{t('monitoring.techLabel')}</b><br />
                            React 19 + Vite 8<br />
                            Chart.js Real-Time Telemetry<br />
                        </p>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default Monitoring;