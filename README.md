# EnviroX — IoT & AI Precision Smart Agriculture System

EnviroX is an IoT and AI-driven precision farming and environmental monitoring platform for field-deployable agriculture.

For the full detailed documentation including sensor schematics, mathematical models, closed-loop actuation logic, and bot engines, see **[PROJECT_DOCUMENTATION.md](file:///c:/Users/OSWALDO/Music/EnviroX/envirox/PROJECT_DOCUMENTATION.md)**.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Launch Backend & Daemons
```bash
npm run server
```
Runs on `http://localhost:5000` with PostgreSQL primary storage, MongoDB document mirror, 2-way Telegram Bot (`@IOTrex_bot`), and Meta WhatsApp Cloud alerts.

### 3. Launch Frontend Web App
```bash
npm run dev
```
Runs the Vite development server on `http://localhost:5173`.

---

## Hardware & Architecture Summary

- **Node 1 (`ESP32-S3-01`)**: DHT22, BH1750 (Lux), MQ-2 Gas/Smoke, Rain Sensor, SSD1306 OLED, Active Buzzer.
- **Node 2 (`ESP32-S3-02`)**: Capacitive Soil Moisture, Analog pH, Turbidity (NTU).
- **Node 3 (`ESP32-CAM`)**: OV2640 MJPEG video stream, Flash LED, automated hourly crop scans.
- **Microclimate Physics**: Vapor Pressure Deficit (VPD), Dew Point ($T_d$), Hargreaves Evapotranspiration ($ET_0$), Monsoon Waterlogging Sentinel, Water Quality Index (WQI), Pest Activity Index (PAI).
