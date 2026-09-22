import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

const DashboardSubNav = () => {
    const { pathname } = useLocation();
    const { t } = useLanguage();

    const links = [
        { to: '/dashboard/air', label: t('dashboardSubNav.air') },
        { to: '/dashboard/water', label: t('dashboardSubNav.water') },
        { to: '/dashboard/plant', label: t('dashboardSubNav.plant') },
        { to: '/dashboard/weather', label: t('dashboardSubNav.pest') },
    ];

    return (
        <div className="sub-nav">
            <div className="nav-links2">
                {links.map((link) => (
                    <Link
                        key={link.to}
                        to={link.to}
                        className={pathname === link.to ? 'active' : ''}
                    >
                        {link.label}
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default DashboardSubNav;
