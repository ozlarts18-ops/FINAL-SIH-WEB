# EnviroX — Raspberry Pi GPIO Pinout, Circuit Diagram & Sensor Guide

This document explains how to migrate the **EnviroX Hardware Node 1 (Air/Environment)** and **Node 2 (Soil/Water Quality)** from ESP32-S3 microcontrollers to a **Raspberry Pi** (3B+, 4B, 5, or Zero 2 W).

---

## ⚡ Key Hardware Difference: Analog Sensors on Raspberry Pi

> [!IMPORTANT]
> **Raspberry Pi GPIO pins are strictly 3.3V Digital (HIGH/LOW).** Unlike ESP32, Raspberry Pi does **NOT** have built-in Analog-to-Digital Converter (ADC) channels.
> To read analog output sensors (**MQ-2, Soil Moisture v1.2, pH Sensor, Turbidity Sensor**), an external **ADS1115 16-Bit 4-Channel I2C ADC module** is connected to the Raspberry Pi over I2C!

---

## 📍 Pinout & Hardware Mapping Table

### I2C Bus & Power Rails (Shared)
| Component | Device Pin | Raspberry Pi Pin Name | Physical Pin # | Notes / Address |
| :--- | :--- | :--- | :--- | :--- |
| **I2C Bus Data** | SDA | `GPIO 2 (SDA)` | **Pin 3** | Shared I2C Data Line |
| **I2C Bus Clock** | SCL | `GPIO 3 (SCL)` | **Pin 5** | Shared I2C Clock Line |
| **3.3V Main VCC** | VCC (3.3V) | `3.3V Power` | **Pin 1** | Power for BH1750, OLED, ADS1115 VCC, DHT22 |
| **5V Main VCC** | VCC (5V) | `5V Power` | **Pin 2 or 4** | Power for MQ-2 heater, pH board, Turbidity board |
| **System Ground** | GND | `Ground` | **Pin 6, 9, 14, 20** | Common Ground across ALL sensors |

---

### Digital Sensors & Displays
| Sensor / Peripheral | Hardware Signal | Raspberry Pi Pin Name | Physical Pin # | Module Address / Pin Details |
| :--- | :--- | :--- | :--- | :--- |
| **DHT22** | DATA | `GPIO 4 (GPCLK0)` | **Pin 7** | Pull-up 10kΩ resistor to 3.3V |
| **BH1750 Lux Sensor** | SDA / SCL | I2C Bus | **Pins 3 & 5** | I2C Address: `0x23` (ADDR pin to GND) |
| **SSD1306 OLED (128x64)** | SDA / SCL | I2C Bus | **Pins 3 & 5** | I2C Address: `0x3C` |
| **Rain Sensor** | DO (Digital Out) | `GPIO 17` | **Pin 11** | Active LOW (Low when wet/rain) |

---

### Analog Sensors via ADS1115 ADC (I2C Address: `0x48`)
| Sensor Module | Output Signal | ADS1115 Input Pin | Former ESP32 Pin | Sensor Function |
| :--- | :--- | :--- | :--- | :--- |
| **MQ-2 Gas Sensor** | AO (Analog Out) | **A0 (Channel 0)** | ESP32 GPIO 10 | Airborne Smoke / Combustible Gas |
| **Capacitive Soil Moisture v1.2** | AOUT | **A1 (Channel 1)** | ESP32 GPIO 3 | Soil Volumetric Water Content |
| **Analog pH Sensor Module** | Po (pH Output) | **A2 (Channel 2)** | ESP32 GPIO 5 | Irrigation Water & Soil pH |
| **Turbidity Sensor Module** | OUT (Analog) | **A3 (Channel 3)** | ESP32 GPIO 2 | Water Clarity / Suspended Solids |

---

## 🔌 Circuit Schematic Diagram

```
                              RASPBERRY PI 40-PIN HEADER
                               +-----------------------+
                     3.3V Power|  1  (3.3V)   (5V)  2  |5V Power ----> (MQ-2 VCC, pH VCC, Turbidity VCC)
              (SDA)  GPIO 2   |  3  (SDA)    (5V)  4  |
              (SCL)  GPIO 3   |  5  (SCL)    (GND) 6  |GND ---------> COMMON SYSTEM GROUND
             (DHT22) GPIO 4   |  7  (GPCLK0) (TX)  8  |
                        GND   |  9  (GND)    (RX) 10  |
              (Rain) GPIO 17  | 11  (GPIO17) ...      |
                              +-----------------------+

                                _______________________
                               |                       |
                               |    I2C BUS (SDA/SCL)   |
                               |_______________________|
                                    |        |        |
         +--------------------------+        |        +--------------------------+
         |                                   |                                   |
         v                                   v                                   v
+-----------------+                 +-----------------+                 +-----------------+
|   BH1750 Lux    |                 |  SSD1306 OLED   |                 | ADS1115 16-Bit  |
|  Address: 0x23  |                 |  Address: 0x3C  |                 |    4-Ch ADC     |
| VCC: 3.3V GND: 0|                 | VCC: 3.3V GND: 0|                 | Address: 0x48   |
+-----------------+                 +-----------------+                 +-----------------+
                                                                          | A0  A1  A2  A3|
                                                                          +---+---+---+---+
                                                                            |   |   |   |
     +----------------------------------------------------------------------+   |   |   |
     |        +-----------------------------------------------------------------+   |   |
     |        |        +------------------------------------------------------------+   |
     |        |        |        +-------------------------------------------------------+
     v        v        v        v
  [MQ-2]   [Soil]    [pH]   [Turbidity]
 (Analog) (Cap v1.2)(Analog)  (Analog)
```

---

## 🛠️ Step-by-Step Installation on Raspberry Pi

### 1. Enable I2C & GPIO Access
On the Raspberry Pi terminal, open configuration:
```bash
sudo raspi-config
```
Navigate to: **Interface Options -> I2C -> Enable -> Yes**.  
Then reboot:
```bash
sudo reboot
```

Verify I2C devices are detected on bus 1:
```bash
sudo apt-get update && sudo apt-get install -i2c-tools -y
sudo i2cdetect -y 1
```
*Expected Output:* You should see addresses `0x23` (BH1750), `0x3C` (OLED), and `0x48` (ADS1115).

---

### 2. Install Python Dependencies & Adafruit Libraries
```bash
sudo apt-get install python3-pip python3-pil python3-gpiod libgpiod2 -y

pip install adafruit-circuitpython-dht \
            adafruit-circuitpython-bh1750 \
            adafruit-circuitpython-ads1x15 \
            adafruit-circuitpython-ssd1306 \
            pillow \
            requests
```

---

### 3. Run the Sensor Controller
Copy `raspberry_pi_sensors.py` to your Raspberry Pi:
```bash
python3 raspberry_pi_sensors.py
```

---

### 4. Configure as a Systemd Service (Auto-Start on Boot)

Create systemd unit file:
```bash
sudo nano /etc/systemd/system/envirox-pi-sensors.service
```

Paste the following content:
```ini
[Unit]
Description=EnviroX Raspberry Pi Sensor Telemetry Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/envirox
ExecStart=/usr/bin/python3 /home/pi/envirox/raspberry_pi_sensors.py
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Enable and start the background service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable envirox-pi-sensors.service
sudo systemctl start envirox-pi-sensors.service
sudo systemctl status envirox-pi-sensors.service
```
