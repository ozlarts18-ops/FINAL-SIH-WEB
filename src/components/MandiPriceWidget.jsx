/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import AudioVoiceButton from './AudioVoiceButton';

export const MANDI_COMMODITIES = [
    {
        id: 'tomato',
        name: 'Tomato (टमाटर)',
        name_mr: 'टोमॅटो',
        category: 'Vegetables',
        mandi: 'Nashik (Maharashtra)',
        modal_price: 2850,
        msp: 2200,
        unit: '₹ / Quintal',
        trend: '+4.2%',
        trend_direction: 'up',
        demand: 'High',
        advice_en: 'Market arrival is moderate. Favorable selling window for Grade-A red tomatoes over the next 48 hours.',
        advice_hi: 'मंडी में आवक मध्यम है। अगले 48 घंटों में ग्रेड-ए लाल टमाटर बेचने का अनुकूल समय है।',
        advice_mr: 'नाशिक बाजारात आवक मध्यम आहे. पुढील ४८ तासांत चांगल्या प्रतीचा टोमॅटो विकणे फायदेशीर राहील.'
    },
    {
        id: 'potato',
        name: 'Potato (आलू)',
        name_mr: 'बटाटा',
        category: 'Vegetables',
        mandi: 'Agra (Uttar Pradesh)',
        modal_price: 1680,
        msp: 1450,
        unit: '₹ / Quintal',
        trend: '+1.5%',
        trend_direction: 'up',
        demand: 'Stable',
        advice_en: 'Cold storage stocks releasing steadily. Hold high-dry-matter varieties for processing buyers.',
        advice_hi: 'कोल्ड स्टोरेज से स्टॉक सुचारू रूप से आ रहा है। प्रसंस्करण खरीदारों के लिए अच्छी किस्में रोकें।',
        advice_mr: 'कोल्ड स्टोरेजमधून आवक स्थिर आहे. चिप्स व प्रक्रियेसाठी लागणारा बटाटा राखून ठेवा.'
    },
    {
        id: 'onion',
        name: 'Onion (प्याज)',
        name_mr: 'कांदा',
        category: 'Vegetables',
        mandi: 'Lasalgaon (Maharashtra)',
        modal_price: 2450,
        msp: 1800,
        unit: '₹ / Quintal',
        trend: '-2.1%',
        trend_direction: 'down',
        demand: 'High',
        advice_en: 'Kharif arrivals increasing. Sort properly and cure in ventilated sheds to prevent fungal rot.',
        advice_hi: 'खरीफ प्याज की आवक बढ़ रही है। फफूंद से बचाने के लिए हवादार गोदामों में सुखाकर रखें।',
        advice_mr: 'खरीप कांद्याची आवक वाढते आहे. चांगल्या चाळीत हवा खेळती ठेवून कांदा टिकवून ठेवा.'
    },
    {
        id: 'cotton',
        name: 'Cotton (कपास)',
        name_mr: 'कापूस',
        category: 'Commercial',
        mandi: 'Rajkot (Gujarat)',
        modal_price: 7420,
        msp: 7122,
        unit: '₹ / Quintal',
        trend: '+3.8%',
        trend_direction: 'up',
        demand: 'Very High',
        advice_en: 'Prices trading above MSP due to international export demand. Recommended to sell 50% lot.',
        advice_hi: 'अंतरराष्ट्रीय निर्यात मांग के कारण कीमतें एमएसपी से ऊपर हैं। 50% माल बेचने की सलाह है।',
        advice_mr: 'कापसाचे भाव हमीभावापेक्षा वर आहेत. उपलब्ध मालापैकी ५०% माल विकण्याचा सल्ला आहे.'
    },
    {
        id: 'soybean',
        name: 'Soybean (सोयाबीन)',
        name_mr: 'सोयाबीन',
        category: 'Oilseeds',
        mandi: 'Indore (Madhya Pradesh)',
        modal_price: 4890,
        msp: 4600,
        unit: '₹ / Quintal',
        trend: '+0.8%',
        trend_direction: 'up',
        demand: 'Strong',
        advice_en: 'Oil mill crushing demand active. Keep moisture below 10% during storage to avoid deduction.',
        advice_hi: 'तेल मिलों की मांग तेज है। कटौती से बचने के लिए भंडारण में नमी 10% से कम रखें।',
        advice_mr: 'तेल गिरण्यांची मागणी जोरात आहे. भाव कपातीपासून वाचण्यासाठी ओलावा १०% पेक्षा कमी ठेवा.'
    },
    {
        id: 'wheat',
        name: 'Wheat (गेहूं)',
        name_mr: 'गहू',
        category: 'Foodgrains',
        mandi: 'Karnal (Haryana)',
        modal_price: 2460,
        msp: 2275,
        unit: '₹ / Quintal',
        trend: '+1.2%',
        trend_direction: 'up',
        demand: 'Stable',
        advice_en: 'Flour mill demand firm above government procurement rate. Good time for spot market sale.',
        advice_hi: 'आटा मिलों की मांग सरकारी खरीद दर से ऊपर बनी हुई है। हाजिर बाजार में बेचने का अच्छा मौका।',
        advice_mr: 'पिठाच्या गिरण्यांची मागणी हमीभावापेक्षा जास्त आहे. खुल्या बाजारात विकण्याची चांगली वेळ.'
    }
];

export const CROPPING_CALENDAR = [
    {
        season: 'Kharif (खरीफ / पावसाळी)',
        window: 'June – October (Monsoon)',
        crops: 'Rice, Maize, Cotton, Soybean, Groundnut, Tomato',
        key_advisory: 'Utilize monsoon soil moisture, install raised bed drainage to prevent waterlogging.'
    },
    {
        season: 'Rabi (रबी / हिवाळी)',
        window: 'October – March (Winter)',
        crops: 'Wheat, Mustard, Gram/Chickpea, Potato, Onion, Green Peas',
        key_advisory: 'Pre-sowing irrigation and balanced NPK basal dressing ensures high tiller density.'
    },
    {
        season: 'Zaid (जायद / उन्हाळी)',
        window: 'March – June (Summer)',
        crops: 'Watermelon, Cucumber, Bitter Gourd, Fodder, Green Gram',
        key_advisory: 'Deploy drip irrigation and mulching sheets to prevent high-VPD drought stress.'
    }
];

const MandiPriceWidget = () => {
    const { language } = useLanguage();
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCommodities = MANDI_COMMODITIES.filter(item => {
        const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              item.mandi.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCat && matchesSearch;
    });

    return (
        <div className="mandi-price-container" style={{
            background: '#ffffff',
            border: '1px solid #cbdcc3',
            borderRadius: '12px',
            padding: '24px',
            marginTop: '20px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.04)'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                borderBottom: '2px solid #65b32e',
                paddingBottom: '12px',
                marginBottom: '18px'
            }}>
                <div>
                    <h2 style={{ fontSize: '20px', color: '#124500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>APMC MANDI COMMODITY PRICES & CROPPING CALENDAR</span>
                    </h2>
                    <p style={{ fontSize: '13px', color: '#556644', marginTop: '2px' }}>
                        Real-time agricultural market intelligence & Minimum Support Price (MSP) decision support
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Search crop or mandi..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            padding: '6px 12px',
                            border: '1px solid #cbdcc3',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none',
                            color: '#222'
                        }}
                    />
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        style={{
                            padding: '6px 12px',
                            border: '1px solid #65b32e',
                            borderRadius: '6px',
                            fontSize: '13px',
                            background: '#f4f8f1',
                            color: '#124500',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="All">All Commodities</option>
                        <option value="Vegetables">Vegetables</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Oilseeds">Oilseeds</option>
                        <option value="Foodgrains">Foodgrains</option>
                    </select>
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
            }}>
                {filteredCommodities.map((item) => (
                    <div
                        key={item.id}
                        style={{
                            background: '#f8faf6',
                            border: '1px solid #d5e5cf',
                            borderRadius: '10px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ fontSize: '16px', color: '#1b5e20', fontWeight: 'bold' }}>
                                        {language === 'mr' ? item.name_mr : item.name}
                                    </h3>
                                    <span style={{ fontSize: '11px', color: '#667755' }}>{item.mandi}</span>
                                </div>
                                <span style={{
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    background: item.trend_direction === 'up' ? '#e5f8e5' : '#fdeeed',
                                    color: item.trend_direction === 'up' ? '#166534' : '#991b1b'
                                }}>
                                    {item.trend_direction === 'up' ? '▲' : '▼'} {item.trend}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '12px 0 8px 0' }}>
                                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#124500' }}>
                                    ₹{item.modal_price.toLocaleString()}
                                </span>
                                <span style={{ fontSize: '12px', color: '#666' }}>{item.unit}</span>
                                <span style={{ fontSize: '11px', color: '#888', marginLeft: 'auto' }}>
                                    MSP: ₹{item.msp}
                                </span>
                            </div>

                            <p style={{
                                fontSize: '12px',
                                color: '#334422',
                                lineHeight: '1.4',
                                background: '#ffffff',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #e2ece0',
                                margin: '8px 0'
                            }}>
                                {language === 'hi' ? item.advice_hi : (language === 'mr' ? item.advice_mr : item.advice_en)}
                            </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                            <span style={{ fontSize: '11px', color: '#778866' }}>
                                Demand: <strong style={{ color: '#166534' }}>{item.demand}</strong>
                            </span>
                            <AudioVoiceButton
                                text={item.advice_en}
                                hindiText={item.advice_hi}
                                marathiText={item.advice_mr}
                                label="Listen Advice"
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div style={{
                background: '#eaf4e5',
                border: '1px solid #cbdcc3',
                borderRadius: '10px',
                padding: '16px'
            }}>
                <h3 style={{ fontSize: '14px', color: '#124500', fontWeight: 'bold', marginBottom: '10px' }}>
                    Indian Agronomic Cropping Seasons (Kharif • Rabi • Zaid)
                </h3>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '12px'
                }}>
                    {CROPPING_CALENDAR.map((c, i) => (
                        <div key={i} style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #d0e4c8' }}>
                            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1b5e20' }}>{c.season}</div>
                            <div style={{ fontSize: '11px', color: '#667755', margin: '2px 0 6px 0' }}>{c.window}</div>
                            <div style={{ fontSize: '12px', color: '#222' }}><strong>Key Crops:</strong> {c.crops}</div>
                            <div style={{ fontSize: '11px', color: '#445533', marginTop: '4px', fontStyle: 'italic' }}>
                                {c.key_advisory}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MandiPriceWidget;
