import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import { useLanguage } from '../context/LanguageContext';
import './Home.css';

const Home = () => {
    const { t } = useLanguage();

    return (
        <div>
            <Header />
            <Nav />

            <div className="hero-text">
                <img src="/Photos/hero.jpg" alt="Smart Environment" />
                <div className="hero-content">
                    <h1>{t('home.heroTitle')}</h1>
                    <p>{t('home.heroSubtitle')}</p>
                </div>
            </div>

            <div className="body">
                <div className="Body-content">
                    <h1>{t('home.bodyTitle')}</h1>
                    <p>{t('home.bodyDesc')}</p>
                </div>
                <div className="body-image">
                    <img src="/Photos/plant1.jpg" alt="Plant" />
                </div>
            </div>

            <section className="services">
                <h3>{t('home.servicesSub')}</h3>
                <h2>{t('home.servicesTitle')}</h2>
                <p className="services-intro">
                    {t('home.servicesIntro')}
                </p>
                <div className="services-container">
                    <div className="pcard1">
                        <img src="/Photos/crop1.jpg" alt="Crop 1" />
                    </div>
                    <div className="pcard2">
                        <img src="/Photos/crop2.jpg" alt="Crop 2" />
                    </div>
                    <div className="pcard3">
                        <img src="/Photos/field2.jpg" alt="Field 2" />
                    </div>
                </div>
            </section>

            <div className="body2">
                <div className="Body2-content">
                    <h1>{t('home.body2Title')}</h1>
                    <p>{t('home.body2Desc')}</p>
                </div>
                <div className="body2-image">
                    <img src="/Photos/Leaf5.jpg" alt="Leaf 5" />
                </div>
            </div>

            <div className="services2">
                <div className="services2-container">
                    <div className="pcard4">
                        <img src="/Photos/Leaf1.jpg" alt="Leaf 1" />
                    </div>
                    <div className="pcard5">
                        <img src="/Photos/Plant1 (1).jpg" alt="Plant 1" />
                    </div>
                    <div className="pcard6">
                        <img src="/Photos/leaf4.jpg" alt="Leaf 4" />
                    </div>
                </div>
                <div className="services2-intro">
                    <h3>{t('home.services2Sub')}</h3>
                    <h2>{t('home.services2Title')}</h2>
                    <p>{t('home.services2Desc')}</p>
                </div>
            </div>

            <div className="dtext">
                <div className="dtext-content">
                    <h1>{t('home.dtextTitle')}</h1>
                    <p>{t('home.dtextDesc')}</p>
                </div>

                <div className="Cont1">
                    <Link to="/contact" className="b1">{t('home.contactBtn')}</Link>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default Home;