# EnviroX — Complete System Architecture, Sensor Suite & Agricultural Intelligence

**EnviroX** is an end-to-end IoT and AI-driven precision agriculture and environmental monitoring system. It integrates multi-node hardware sensing, microclimate physics equations, closed-loop actuation automation, dual-database fault tolerance, and multi-channel remote alerts (Telegram & Meta WhatsApp).

---

## 1. System Architecture & Data Flow

```mermaid
graph TD
    subgraph In-Field Hardware Layer
        N1["ESP32-S3 Node 1: Air & Microclimate<br>(DHT22, BH1750, MQ-2, Rain Sensor, OLED, Buzzer)"]
        N2["ESP32-S3 Node 2: Soil Health & Water Quality<br>(Capacitive Soil Moisture, pH Sensor, Turbidity Sensor)"]
        CAM["ESP32-CAM: Visual Scouting Node<br>(OV2640 Camera Module, High-Power Flash LED)"]
    end

    subgraph Backend & Logic Layer (Node.js Server)
        SRV["API Bridge Server (Port 5000)"]
        ENG["Agricultural Computation & Actuation Engine"]
        PG[("PostgreSQL (Port 4000)<br>Primary Relational Store")]
        MGO[("MongoDB (Port 27017)<br>Secondary Document Mirror")]
    end

    subgraph Application & Alert Layer
        WEB["React + Vite Frontend Dashboard<br>(Air, Water, Plant Health, Pest Monitoring)"]
        TG["Telegram 2-Way Bot (@IOTrex_bot)<br>Interactive Control & Telemetry"]
        WA["Meta WhatsApp Cloud API<br>Automated Urgent Critical Alerts"]
    end

    N1 -->|HTTP POST /data| SRV
    N2 -->|HTTP POST /data| SRV
    CAM -->|MJPEG Live Stream & Snapshots| SRV

    SRV <--> PG
    SRV <--> MGO
    SRV --> ENG

    ENG -->|Relay Control Directives| N1
    ENG --> TG
    ENG --> WA
    SRV <--> WEB
```

---

## 2. Hardware Nodes & Sensor Suite

### Node 1: Atmospheric & Environmental Node (`ESP32-S3-01`)
*Focus: Ambient microclimate, atmospheric hazard detection, light availability, and local operator feedback.*

| Component | Pin / Interface | Measurement Range | Agricultural Role & Rationale |
| :--- | :--- | :--- | :--- |
| **DHT22 (AM2302)** | `GPIO 4` | Temperature: -40°C to 80°C (±0.5°C)<br>Humidity: 0–100% RH (±2%) | Captures ambient dry-bulb temperature and relative humidity. Vital for calculating **Vapor Pressure Deficit (VPD)**, **Dew Point**, and **Heat Index** to prevent fungal mold germination and heat-stress wilting. |
| **BH1750** | `I2C Bus 0`<br>(SDA: `GPIO 8`, SCL: `GPIO 9`) | 1 – 65,535 Lux | High-resolution digital ambient light sensor with calibrated spectral response. Feeds the **Hargreaves Evapotranspiration ($ET_0$)** equation to estimate solar radiation and daily crop water demand. |
| **MQ-2** | `GPIO 10`<br>(ADC1_CH9) | 300 – 10,000 ppm (Smoke/LPG/CO) | Measures airborne combustible gases and particulate smoke. Triggers alarms during biomass burning, stubble burning smoke events, or electrical equipment fire risks. |
| **Rain Sensor** | `GPIO 11`<br>(ADC2_CH0) | Analog Rain Level (0–4095) | Detects active precipitation events. Interlocked with root soil moisture data to compute the **Monsoon Waterlogging & Flood Risk** score and automatically suspend unnecessary irrigation. |
| **SSD1306 OLED** | `I2C Bus 1`<br>(SDA: `GPIO 40`, SCL: `GPIO 41`) | 128 × 64 monochrome pixels | Dedicated hardware I2C display providing instant real-time telemetry (temperature, humidity, lux, WiFi status) to field operators on-site. |
| **Active Buzzer** | `GPIO 12` | Audible frequency output | Acoustic alert mechanism activated instantly when hazardous gas thresholds (`> 1500`) or severe environmental risks are detected. |

---

### Node 2: Soil Health & Water Quality Node (`ESP32-S3-02`)
*Focus: Root-zone hydration, soil chemistry, and irrigation water safety.*

| Component | Pin / Interface | Measurement | Agricultural Role & Rationale |
| :--- | :--- | :--- | :--- |
| **Capacitive Soil Moisture Sensor v1.2** | `GPIO 3`<br>(ADC1_CH2) | 0 – 100% Volumetric Water Content | Uses capacitive sensing rather than resistive to prevent probe corrosion and soil ionization. Feeds closed-loop pump control to prevent under-watering (wilting) and over-watering (root hypoxia). |
| **Analog pH Sensor** | `GPIO 5`<br>(ADC1_CH4) | 0.0 – 14.0 pH | Measures acidity/alkalinity of irrigation water and soil runoff. Optimal macronutrient (N-P-K) uptake occurs in the 6.0–7.5 pH range; extreme pH levels cause nutrient lockout. |
| **Turbidity Sensor** | `GPIO 2`<br>(ADC1_CH1) | 0 – 3000 NTU (Nephelometric Turbidity Units) | Measures suspended solids and water clarity via optical transmittance. Prevents sediment clogging in drip emitters and monitors reservoir water purity. |

---

### Node 3: Optical Scouting Node (`ESP32-CAM`)
*Focus: Visual crop surveillance, automated disease diagnosis, and pest scouting.*

| Component | Interface | Agricultural Role & Rationale |
| :--- | :--- | :--- |
| **OV2640 Camera Module** | DVP Parallel Interface | Delivers continuous live MJPEG video feeds for remote crop observation and triggers automated hourly high-resolution leaf scans for disease classification. |
| **High-Power Flash LED** | `GPIO 4` | Remote software-controlled flash (`/api/camera/flash`) providing optical illumination for night-time crop scans and low-light diagnostic capture. |

---

## 3. Core Mathematical Models & Environmental Logic

### A. Vapor Pressure Deficit (VPD)
VPD defines the drying capacity of the surrounding air by measuring the difference between the saturation vapor pressure inside the leaf and the actual vapor pressure of the air.
- **Low VPD (< 0.4 kPa):** Air is too humid; transpiration stops, risking fungal infection and calcium deficiency.
- **Optimal VPD (0.8 – 1.2 kPa):** Healthy transpiration and active nutrient uptake.
- **High VPD (> 1.6 kPa):** Air is too dry; stomata close to prevent desiccation, stalling photosynthesis.

$$\text{VP}_{\text{sat}} = 0.61078 \times \exp\left(\frac{17.27 \times T}{T + 237.3}\right)$$

$$\text{VP}_{\text{act}} = \text{VP}_{\text{sat}} \times \left(\frac{\text{RH}}{100}\right)$$

$$\text{VPD} = \max(0, \text{VP}_{\text{sat}} - \text{VP}_{\text{act}}) \quad [\text{kPa}]$$

---

### B. Dew Point Temperature ($T_d$)
Calculated via the Magnus-Tetens approximation. When canopy temperature drops to the dew point, water condenses on leaf surfaces, creating ideal conditions for pathogen spores (*Phytophthora infestans*, powdery mildew) to germinate.

$$\alpha(T, \text{RH}) = \frac{17.27 \times T}{237.7 + T} + \ln\left(\frac{\text{RH}}{100}\right)$$

$$T_d = \frac{237.7 \times \alpha}{17.27 - \alpha} \quad [^\circ\text{C}]$$

---

### C. Reference Evapotranspiration ($ET_0$) & Irrigation Prescriptions
Calculates daily crop water demand using the modified Hargreaves method driven by BH1750 solar radiation estimates:

$$\text{Solar Radiation } (R_a) \approx \min\left(28, \max\left(12, \frac{\text{Lux}}{50000} \times 22 + 14\right)\right) \times 0.408$$

$$ET_0 = 0.0023 \times (T + 17.8) \times \sqrt{T_{\max} - T_{\min}} \times R_a \times \text{Humidity Modifier}$$

$$\text{Prescribed Irrigation (Liters)} = \frac{ET_0 \times K_c}{\text{Irrigation Efficiency (0.90)}}$$

---

### D. Monsoon Flood & Waterlogging Risk Sentinel
Correlates real-time precipitation detection with volumetric root moisture:
- `Rain == TRUE` **AND** `Soil Moisture >= 80%`: **CRITICAL RISK** $\rightarrow$ Dispatches emergency flood warning and triggers drainage pumps.
- `Rain == TRUE` **OR** `Soil Moisture > 85%`: **SOIL SATURATION ADVISORY** $\rightarrow$ Suspends automated irrigation.
- Otherwise: **NOMINAL SOIL MOISTURE**.

---

### E. Water Quality Index (WQI)
A weighted arithmetic index aggregating pH balance, turbidity, and mineral content into a single quality score (0–100):

$$\text{WQI} = 100 - \left[ \left|\text{pH} - 7.0\right| \times 15 + \left(\frac{\text{Turbidity}}{5.0}\right) \times 10 \right]$$

- **$\text{WQI} \ge 85$:** Optimal for precision hydroponics and micro-drip emitters.
- **$70 \le \text{WQI} < 85$:** Acceptable for soil-bound field crops.
- **$\text{WQI} < 70$:** Suboptimal; filtration or pH neutralization required.

---

### F. Pest Activity Index (PAI)
Integrates microclimate warmth ($T > 25^\circ\text{C}$), high relative humidity ($\text{RH} > 70\%$), and optical trap capture rates. When the index crosses the Economic Threshold, farmers receive bio-pesticide and IPM recommendations before the Economic Injury Level (EIL) is reached.

---

## 4. Actuator Automation & Closed-Loop Control

The system manages relay actuators via `server/actuatorService.js`:

| Actuator | Control Mode | Trigger Condition |
| :--- | :--- | :--- |
| **Water Pump (`water_pump`)** | Closed-loop Auto / Manual | • ON: Soil Moisture $\le 35\%$ and Rain is FALSE.<br>• OFF: Soil Moisture $\ge 75\%$ or Rain is TRUE. |
| **Exhaust Fan (`exhaust_fan`)** | Closed-loop Auto / Manual | • ON: Temperature $> 32^\circ\text{C}$, VPD $> 1.6\text{ kPa}$, or MQ-2 Gas $> 1500\text{ ppm}$.<br>• OFF: Microclimate nominal. |
| **Grow Lights (`grow_lights`)** | Photoperiod Schedule / Sensor | • ON: BH1750 Lux $< 800\text{ Lux}$ during active daytime photoperiod.<br>• OFF: Natural sunlight sufficient. |
| **Spray / Misting Valve (`spray_valve`)** | Closed-loop Auto / Manual | • ON: VPD $> 1.8\text{ kPa}$ and $\text{RH} < 40\%$ (combats dry-air heat stress). |

---

## 5. Dual Database & Notification Infrastructure

1. **Dual Storage Engine**:
   - **Primary Store (PostgreSQL Local)**: Enforces relational schema consistency for sensor telemetry logs, actuator states, user authentication, and system events.
   - **Secondary Mirror (MongoDB)**: Stores flexible JSON documents asynchronously for document querying and fallback redundancy.

2. **2-Way Telegram Bot Daemon (`@IOTrex_bot`)**:
   - Long-polling daemon (`server/telegramBotEngine.js`) operating without public tunnels.
   - Supports interactive commands (`/start`, `/status`, `/air`, `/water`, `/actuators`, `/pump_on`, `/pump_off`).

3. **Meta WhatsApp Cloud Notification Daemon**:
   - Automated alerting engine (`server/metaWhatsappService.js`) that pushes instant formatted WhatsApp hazard messages directly to registered farm operators.

---

## 6. Frontend Dashboard Hubs

The React + Vite application is divided into 4 specialized operational dashboards:

1. **[Air Pollution & Atmospheric Hub](src/dashboard/air_pollution/air.jsx)**: Live Heat Index, Dew Point, VPD gauge, AQI rating, and gas hazard alerts.
2. **[Water Quality & Hydration Hub](src/dashboard/waterquality/WaterQualityDashboard.jsx)**: WQI meter, pH stability charts, turbidity sensors, and N-P-K nutrient status.
3. **[Plant Health & Disease Hub](src/dashboard/plantgrowth_disease/plant.jsx)**: Live ESP32-CAM video stream, hourly automated crop diagnostic timeline, and interactive nutrient deficiency matrix.
4. **[Pest Detection & IPM Hub](src/dashboard/pest_detection/pd.jsx)**: Pest Activity Index (PAI), optical trap counters, and bio-control recommendations.

---

## 7. Operational Commands Quick Reference

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Launch Vite frontend development server (Port 5173) |
| `npm run server` | Launch Node.js API Bridge & Notification Engine (Port 5000) |
| `npm run build` | Build production frontend bundle |
| `npm run seed` | Seed local PostgreSQL database |
| `npm run sync:mongo` | Synchronize PostgreSQL seed data to MongoDB |
| `npm run esp32:node1` | Launch virtual local ESP32-S3 Node 1 emulator |
| `npm run esp32:node2` | Launch virtual local ESP32-S3 Node 2 emulator |
| `npm run esp32:all` | Run both ESP32 emulator nodes concurrently |
