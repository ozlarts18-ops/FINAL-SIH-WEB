import { useEffect, useState } from 'react';
import Header from '../../components/Header';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import DashboardSubNav from '../../components/DashboardSubNav';

import {
    initCharts,
    applyGraphFilter,
    downloadReport,
    destroyCharts,
    waterEvents,
    waterRecommendations
} from '../mainfunction2';

import './water.css';

const WaterQualityDashboard = () => {
    const [alertDismissed, setAlertDismissed] = useState(false);

    useEffect(() => {
        initCharts();
        return () => {
            destroyCharts();
        };
    }, []);

    return (
        <div className="water-quality-page">

            <Header />
            <Nav />
            <DashboardSubNav />

            <div className="dashboard">

                <div className="overview">

                    <div className="head">
                        <h1>OVERVIEW</h1>
                        <p className="subtext">Real-time water quality, nutrient concentration & telemetry</p>
                    </div>

                    <div className="main">
                        <div className="left">
                            <div className="status">
                                <h2>WATER SYSTEM STATUS</h2>
                                <p className="unit" id="st">Optimal</p>
                            </div>

                            <div className="box1">
                                <h2>PH LEVEL</h2>
                                <p className="unit" id="phl">6.8</p>
                            </div>

                            <div className="box2">
                                <h2>TOTAL DISSOLVED SOLIDS (TDS)</h2>
                                <p className="unit" id="tds">650</p>
                                <p className="t1">ppm</p>
                            </div>
                        </div>

                        <div className="right">
                            <div className="box3">
                                <h2>TURBIDITY</h2>
                                <p className="unit" id="wt">2.5</p>
                                <p className="t1">NTU</p>
                            </div>

                            <div className="box4">
                                <h2>WATER TANK LEVEL</h2>
                                <p className="unit" id="tl">78%</p>
                            </div>

                            <div className="box5">
                                <h2>PUMP STATUS</h2>
                                <p className="unit" id="ps">OFF</p>
                            </div>

                            <div className="box51">
                                <h2>WATER QUALITY SCORE</h2>
                                <p className="unit" id="aqs">92/100</p>
                            </div>
                        </div>
                    </div>

                    <div className="temp">
                        <div className="box6">
                            <h2>CURRENT WATER TEMPERATURE</h2>
                            <p className="unit" id="ct1">24.5</p>
                            <p className="t1">Celsius</p>
                        </div>

                        <div className="box7">
                            <h2>AVERAGE WATER TEMPERATURE</h2>
                            <p className="unit" id="ct2">24.8</p>
                            <p className="t1">Celsius</p>
                        </div>

                        <div className="box8">
                            <h2>MIN WATER TEMPERATURE</h2>
                            <p className="unit" id="ct3">22.0</p>
                            <p className="t1">Celsius</p>
                        </div>

                        <div className="box9">
                            <h2>MAX WATER TEMPERATURE</h2>
                            <p className="unit" id="ct4">27.5</p>
                            <p className="t1">Celsius</p>
                        </div>
                    </div>

                    <div className="hum">
                        <div className="box10">
                            <h2>CURRENT PH</h2>
                            <p className="unit" id="ht1">6.8</p>
                        </div>

                        <div className="box11">
                            <h2>AVERAGE PH</h2>
                            <p className="unit" id="ht2">7.0</p>
                        </div>

                        <div className="box12">
                            <h2>MIN PH</h2>
                            <p className="unit" id="ht3">6.5</p>
                        </div>

                        <div className="box13">
                            <h2>MAX PH</h2>
                            <p className="unit" id="ht4">7.3</p>
                        </div>
                    </div>

                </div>

            </div>

            <div className="dashboard2">

                <div className="controls">

                    <div className="head">
                        <h1>CONTROLS</h1>
                        <p className="subtext">Actuator relays and telemetry timeframe filters</p>
                    </div>

                    <div className="panel">

                        <div className="exn">
                            <h2>DC WATER PUMP</h2>
                            <p className="exf" id="exf">ON</p>
                        </div>

                        <div className="modes">
                            <h2>MODES</h2>
                            <div className="m1">
                                <input type="radio" name="mode" id="on" defaultChecked />
                                <label htmlFor="on">ON</label>

                                <input type="radio" name="mode" id="off" />
                                <label htmlFor="off">OFF</label>

                                <input type="radio" name="mode" id="auto" />
                                <label htmlFor="auto">AUTOMATIC</label>
                            </div>
                        </div>

                        <div className="filters">
                            <h2>FILTER</h2>
                            <div className="m1">
                                <input
                                    type="radio"
                                    name="graphFilter"
                                    id="daily"
                                    defaultChecked
                                    onChange={() => applyGraphFilter('daily')}
                                />
                                <label htmlFor="daily">DAILY</label>

                                <input
                                    type="radio"
                                    name="graphFilter"
                                    id="weekly"
                                    onChange={() => applyGraphFilter('weekly')}
                                />
                                <label htmlFor="weekly">WEEKLY</label>

                                <input
                                    type="radio"
                                    name="graphFilter"
                                    id="monthly"
                                    onChange={() => applyGraphFilter('monthly')}
                                />
                                <label htmlFor="monthly">MONTHLY</label>
                            </div>
                        </div>

                    </div>

                </div>

            </div>

            <div className="graphs">

                <div className="glayout">

                    <div className="head">
                        <h1>GRAPHS</h1>
                        <p className="subtext">Dynamic physiological & chemical water metrics</p>
                    </div>

                    <div className="gly1">
                        <div className="c1">
                            <canvas id="PHTrend"></canvas>
                        </div>

                        <div className="c2">
                            <canvas id="TDSTrend"></canvas>
                        </div>

                        <div className="c3">
                            <canvas id="TurbidityTrend"></canvas>
                        </div>
                    </div>

                    <div className="c4">
                        <canvas id="WaterQualityScore"></canvas>
                    </div>

                    <div className="gly2">
                        <div className="c5">
                            <canvas id="WaterTemperature"></canvas>
                        </div>

                        <div className="c6">
                            <canvas id="WaterTankCapacity"></canvas>
                        </div>

                        <div className="c7">
                            <canvas id="PumpRuntime"></canvas>
                        </div>
                    </div>

                </div>

            </div>

            <div className="alert-section-wrapper">

                {!alertDismissed && (
                    <div className="water-alert-banner">
                        <div className="alert-banner-left">
                            <div className="alert-banner-text">
                                <h3>SYSTEM HEALTH ALERT: WATER PARAMETERS OPTIMAL</h3>
                                <p>All 6 water quality & irrigation parameters are strictly within agronomic safety bounds. Automated buffering is standing by.</p>
                            </div>
                        </div>
                        <div className="alert-banner-actions">
                            <span className="alert-status-pill">Active Monitor</span>
                            <button
                                className="alert-close-btn"
                                onClick={() => setAlertDismissed(true)}
                                title="Dismiss notification"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                <div className="insights">

                    <div className="events-panel">
                        <div className="head">
                            <h1>WATER QUALITY ALERTS & SYSTEM EVENTS</h1>
                            <p className="subtext">Telemetry logs and threshold observations</p>
                        </div>

                        <div className="events-list">
                            {waterEvents.map((event, idx) => (
                                <div className={`event-item level-${event.level}`} key={idx}>
                                    <div className="event-item-top">
                                        <span className="event-icon">{event.icon}</span>
                                        <div className="event-item-text">
                                            <div className="event-title">{event.title}</div>
                                            <div className="event-time">{event.time}</div>
                                        </div>
                                    </div>
                                    <ul className="event-details">
                                        {event.details.map((line, i) => (
                                            <li key={i}>{line}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="intelligence-panel">
                        <div className="head">
                            <h1>D. WATER INTELLIGENCE & RECOMMENDATIONS</h1>
                            <p className="subtext">Automated agronomic observations & actions</p>
                        </div>

                        <ul className="intelligence-list">
                            {waterRecommendations.map((tip, idx) => (
                                <li key={idx}>{tip}</li>
                            ))}
                        </ul>
                    </div>

                </div>

            </div>

            <div className="downc">

                <div className="dlayout">

                    <div className="head">
                        <h1>Download Reports</h1>
                        <p className="subtext">Export structured telemetry reports</p>
                    </div>

                    <button onClick={() => downloadReport('daily')}>Daily</button>
                    <button onClick={() => downloadReport('weekly')}>Weekly</button>
                    <button onClick={() => downloadReport('monthly')}>Monthly</button>

                </div>

            </div>

            <Footer />

        </div>
    );
};

export default WaterQualityDashboard;