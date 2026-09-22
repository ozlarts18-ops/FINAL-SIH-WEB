import Header from '../components/Header';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import { useLanguage } from '../context/LanguageContext';
import './Contact.css';

const Contact = () => {
    const { t } = useLanguage();

    return (
        <div>
            <Header />
            <Nav />

            <div className="hero-text">
                <img src="/Photos/CONTACTUS.jpg" alt="Contact Us" />
                <div className="hero-content">
                    <h1>{t('contact.heroTitle')}</h1>
                    <p>{t('contact.heroSubtitle')}</p>
                </div>
            </div>

            <div className="Text1">
                <h2>{t('contact.title')}</h2>
                <h4>{t('contact.desc')}</h4>
                <p>
                    <strong>{t('contact.emailLabel')}</strong><br />
                    iot19@gmail.com
                </p>
                <p>
                    <strong>{t('contact.phoneLabel')}</strong><br />
                    +91 79001 53894
                </p>
                <p>
                    <strong>{t('contact.locationLabel')}</strong><br />
                    {t('contact.locationValue')}
                </p>
            </div>

            <Footer />
        </div>
    );
};

export default Contact;