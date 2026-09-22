import Header from '../components/Header';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import { useLanguage } from '../context/LanguageContext';
import './About.css';

const About = () => {
    const { t } = useLanguage();

    return (
        <div>
            <Header />
            <Nav />

            <div className="hero-text">
                <img src="/Photos/Team1.jpg" alt="Team" />
                <div className="hero-content">
                    <h1>{t('about.heroTitle')}</h1>
                    <p>{t('about.heroSubtitle')}</p>
                </div>
            </div>

            <section className="section">
                <div className="card1">
                    <div className="image1">
                        <img src="/Photos/plant1.jpg" alt="Plant" />
                    </div>
                    <div className="content1">
                        <h2>{t('about.card1Title')}</h2>
                        <p>{t('about.card1Desc')}</p>
                        <p>
                            <b>{t('about.teamLabel')}</b><br />
                            Antara Parab — 24302B0055<br />
                            Isha Bongarde — 24302B0054<br />
                            Bhumi Surve — 24302B0056
                        </p>
                    </div>
                </div>

                <div className="card2">
                    <div className="image2">
                        <img src="/Photos/WaterPump.jpg" alt="Water Pump" />
                    </div>
                    <div className="content2">
                        <h2>{t('about.card2Title')}</h2>
                        <p>{t('about.card2Desc')}</p>
                        <p>
                            <b>{t('about.teamLabel')}</b><br />
                            Gayatri Chavan — 24302B0019<br />
                            Harini Nadar — 24302B0020<br />
                            Ayushi Shelar — 24302B0044
                        </p>
                    </div>
                </div>

                <div className="card3">
                    <div className="image3">
                        <img src="/Photos/team3.jpg" alt="Team 3" />
                    </div>
                    <div className="content3">
                        <h2>{t('about.card3Title')}</h2>
                        <p>{t('about.card3Desc')}</p>
                        <p>
                            <b>{t('about.teamLabel')}</b><br />
                            Bhumi — 24302A0002<br />
                            Kashan — 24302A0040
                        </p>
                    </div>
                </div>

                <div className="card4">
                    <div className="image4">
                        <img src="/Photos/crop7.jpg" alt="Crop 7" />
                    </div>
                    <div className="content4">
                        <h2>{t('about.card4Title')}</h2>
                        <p>{t('about.card4Desc')}</p>
                        <p>
                            <b>{t('about.teamLabel')}</b><br />
                            Edison — 24302A0027<br />
                            Vamshi — 24302A0043<br />
                            Harshal — 24302B0041<br />
                            Shahnawaz — 24302B0048
                        </p>
                    </div>
                </div>

                <div className="card5">
                    <div className="image5">
                        <img src="/Photos/team4.jpg" alt="Team 4" />
                    </div>
                    <div className="content5">
                        <h2>{t('about.card5Title')}</h2>
                        <p>{t('about.card5Desc')}</p>
                        <p>
                            <b>{t('about.teamLabel')}</b><br />
                            Tarannum — 24302A0025<br />
                            Dhiraj — 24302A0004<br />
                            Vidhi — 24302A0028<br />
                            Gaurav — 24302A0067
                        </p>
                    </div>
                </div>

                <div className="card6">
                    <div className="image6">
                        <img src="/Photos/crop4.jpg" alt="Crop 4" />
                    </div>
                    <div className="content6">
                        <h2>{t('about.card6Title')}</h2>
                        <p>{t('about.card6Desc')}</p>
                        <p>
                            <b>{t('about.teamLabel')}</b><br />
                            Bavendan Nadar — 24302B0062<br />
                            Swati Padhi — 25302B3007<br />
                            Mohammed Sameer Shaikh — 24302B0061<br />
                            Tanisha — 24302A0058
                        </p>
                    </div>
                </div>

                <div className="card7">
                    <div className="image7">
                        <img src="/Photos/laptop.jpg" alt="Laptop" />
                    </div>
                    <div className="content7">
                        <h2>{t('about.card7Title')}</h2>
                        <p>{t('about.card7Desc')}</p>
                        <p>
                            <b>{t('about.teamLabel')}</b><br />
                            Yusuf — 24302A0006<br />
                            Oswaldo — 24302A0014
                        </p>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default About;