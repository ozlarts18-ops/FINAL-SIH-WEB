

#include <Wire.h>
#include <DHT.h>
#include <BH1750.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "esp_wifi.h"

const char* WIFI_SSID     = "peter";

const char* WIFI_PASSWORD = "ossie@123$";

const char* SERVER_URL    = "http://10.152.37.250:5173/data";
const char* DEVICE_ID     = "ESP32-S3-01";

#define DHT_PIN 4
#define DHT_TYPE DHT22

#define MQ2_PIN 10

#define RAIN_PIN 11

#define BUZZER_PIN 12

#define BH1750_SDA 8
#define BH1750_SCL 9

#define OLED_SDA 40
#define OLED_SCL 41

#define GAS_LIMIT  1500  
#define RAIN_LIMIT 3500  

#define BH1750_I2C_ADDRESS 0x23 

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define OLED_ADDRESS  0x3C

const unsigned long SENSOR_INTERVAL         = 2500;  
const unsigned long WIFI_RECONNECT_INTERVAL = 10000; 
const int           HTTP_TIMEOUT            = 5000;  

TwoWire BH1750Wire = TwoWire(0); 
TwoWire OLEDWire   = TwoWire(1); 

DHT dht(DHT_PIN, DHT_TYPE);
BH1750 bh1750;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &OLEDWire, OLED_RESET);

unsigned long lastSensorRead     = 0;
unsigned long lastWiFiReconnect  = 0;
bool          oledAvailable      = false;
bool          bh1750Available    = false;

void connectWiFi();
void checkWiFi();
void readAndSendSensors();
void sendTelemetry(float temperature, float humidity, float lux, bool gasDetected, bool rainDetected, bool buzzerActive);
void updateOLED(float temperature, float humidity, float lux, bool gasDetected, bool rainDetected, bool buzzerActive);
void showOLEDMessage(const char* line1, const char* line2, const char* line3, const char* line4);

void setup() {
  
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("================================================");
  Serial.println("             ENVIROX ESP32-S3 #1");
  Serial.println("             AIR / ENVIRONMENT NODE");
  Serial.println("================================================");
  Serial.println();

  pinMode(MQ2_PIN, INPUT);
  pinMode(RAIN_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("GPIO initialized.");

  analogReadResolution(12);
  Serial.println("ADC resolution: 12-bit (0-4095)");

  dht.begin();
  Serial.println("DHT22 initialized.");

  Serial.println("Starting BH1750 on I2C Bus 0...");
  BH1750Wire.begin(BH1750_SDA, BH1750_SCL);
  delay(100);

  if (bh1750.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, BH1750_I2C_ADDRESS, &BH1750Wire)) {
    bh1750Available = true;
    Serial.println("BH1750 initialized successfully at address 0x23.");
  } else {
    bh1750Available = false;
    Serial.println("WARNING: BH1750 not detected. Check SDA (GPIO 8) & SCL (GPIO 9).");
  }

  Serial.println("Starting OLED on I2C Bus 1...");
  OLEDWire.begin(OLED_SDA, OLED_SCL);
  delay(100);

  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    oledAvailable = true;
    Serial.println("OLED initialized successfully at address 0x3C.");
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("ENVIROX");
    display.setCursor(0, 15);
    display.println("ESP32-S3 #1");
    display.setCursor(0, 30);
    display.println("Starting...");
    display.display();
  } else {
    oledAvailable = false;
    Serial.println("WARNING: OLED not detected at address 0x3C.");
  }

  connectWiFi();

  Serial.println();
  Serial.println("================================================");
  Serial.println("SETUP COMPLETE - STARTING SENSOR LOOP");
  Serial.println("================================================");
  Serial.println();
}

void loop() {
  
  checkWiFi();

  unsigned long currentMillis = millis();
  if (currentMillis - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = currentMillis;
    readAndSendSensors();
  }
}

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      Serial.println("\n[WiFi] Associated with AP: " + String(WIFI_SSID));
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.println("\n========================================");
      Serial.println("🎉 [WiFi] CONNECTED TO HOTSPOT!");
      Serial.print("ESP32 IP: ");
      Serial.println(WiFi.localIP());
      Serial.print("Gateway:  ");
      Serial.println(WiFi.gatewayIP());
      Serial.print("RSSI:     ");
      Serial.print(WiFi.RSSI());
      Serial.println(" dBm");
      Serial.println("========================================");

      if (oledAvailable) {
        display.clearDisplay();
        display.setTextColor(SSD1306_WHITE);
        display.setTextSize(1);
        display.setCursor(0, 0);
        display.println("ENVIROX #1");
        display.setCursor(0, 15);
        display.println("HOTSPOT CONNECTED!");
        display.setCursor(0, 32);
        display.print("IP: ");
        display.println(WiFi.localIP());
        display.setCursor(0, 48);
        display.println("Streaming live...");
        display.display();
      }
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.print("\n[WiFi] Disconnected. Reason code: ");
      Serial.println(info.wifi_sta_disconnected.reason);
      break;
    default:
      break;
  }
}

void connectWiFi() {
  Serial.println("----------------------------------------");
  Serial.print("Starting Hotspot Connection: ");
  Serial.println(WIFI_SSID);
  Serial.println("----------------------------------------");

  if (oledAvailable) {
    showOLEDMessage("ENVIROX", "ESP32-S3 #1", "Scanning for:", WIFI_SSID);
  }

  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.onEvent(onWiFiEvent);

  esp_wifi_set_protocol(WIFI_IF_STA, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);
  esp_wifi_set_bandwidth(WIFI_IF_STA, WIFI_BW_HT20);

  Serial.println("[WiFi] Connecting to hotspot: " + String(WIFI_SSID));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startAttempt < 15000)) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
}

void checkWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long currentMillis = millis();
  if (currentMillis - lastWiFiReconnect >= 30000) {
    lastWiFiReconnect = currentMillis;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Triggering background reconnect...");
      WiFi.reconnect();
    }
  }
}

void readAndSendSensors() {
  Serial.println();
  Serial.println("================================================");
  Serial.println("        ENVIROX ESP32-S3 #1 SENSOR CYCLE");
  Serial.println("================================================");

  float temperature = dht.readTemperature();
  float humidity    = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("WARNING: DHT22 read returned NaN. Retrying next cycle...");
    return;
  }

  float lux = 0.0;
  if (bh1750Available) {
    lux = bh1750.readLightLevel();
    if (lux < 0) {
      Serial.println("WARNING: BH1750 read error.");
      lux = 0.0;
    }
  }

  int gasRaw = analogRead(MQ2_PIN);
  bool gasDetected = (gasRaw > GAS_LIMIT);

  int rainRaw = analogRead(RAIN_PIN);
  bool rainDetected = (rainRaw < RAIN_LIMIT);

  bool buzzerActive = gasDetected || rainDetected;
  digitalWrite(BUZZER_PIN, buzzerActive ? HIGH : LOW);

  Serial.println("SENSOR STATUS");
  Serial.println("----------------------------------------");
  Serial.print("Temperature: ");
  Serial.print(temperature, 1);
  Serial.println(" C");

  Serial.print("Humidity: ");
  Serial.print(humidity, 1);
  Serial.println(" %");

  Serial.print("Light: ");
  Serial.print(lux, 1);
  Serial.println(" lux");

  Serial.print("Gas detected: ");
  Serial.println(gasDetected ? "YES" : "NO");

  Serial.print("Rain detected: ");
  Serial.println(rainDetected ? "YES" : "NO");

  Serial.print("Buzzer: ");
  Serial.println(buzzerActive ? "ON" : "OFF");

  sendTelemetry(temperature, humidity, lux, gasDetected, rainDetected, buzzerActive);

  updateOLED(temperature, humidity, lux, gasDetected, rainDetected, buzzerActive);
}

void sendTelemetry(
  float temperature,
  float humidity,
  float lux,
  bool gasDetected,
  bool rainDetected,
  bool buzzerActive
) {
  
  char jsonBuffer[300];
  snprintf(jsonBuffer, sizeof(jsonBuffer),
           "{\"device\":\"%s\",\"temperature\":%.1f,\"humidity\":%.1f,\"lux\":%.1f,\"gasDetected\":%s,\"rainDetected\":%s,\"buzzer\":%s}",
           DEVICE_ID,
           temperature,
           humidity,
           lux,
           gasDetected ? "true" : "false",
           rainDetected ? "true" : "false",
           buzzerActive ? "true" : "false");

  Serial.println();
  Serial.println("ENVIROX TELEMETRY");
  Serial.println("----------------------------------------");
  Serial.println(jsonBuffer);

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Send skipped: Wi-Fi is disconnected.");
    Serial.println("----------------------------------------");
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(HTTP_TIMEOUT);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");

  Serial.print("POST -> ");
  Serial.println(SERVER_URL);

  int responseCode = http.POST((uint8_t*)jsonBuffer, strlen(jsonBuffer));

  if (responseCode > 0) {
    Serial.print("HTTP Response Code: ");
    Serial.println(responseCode);

    String response = http.getString();
    Serial.print("Server Response: ");
    Serial.println(response);

    if (responseCode >= 200 && responseCode < 300) {
      Serial.println("EnviroX: DATA SENT SUCCESSFULLY");
    } else {
      Serial.println("EnviroX: SERVER RETURNED AN ERROR");
    }
  } else {
    Serial.print("HTTP POST failed: ");
    Serial.println(http.errorToString(responseCode).c_str());
  }

  http.end();
  Serial.println("----------------------------------------");
}

void updateOLED(
  float temperature,
  float humidity,
  float lux,
  bool gasDetected,
  bool rainDetected,
  bool buzzerActive
) {
  if (!oledAvailable) {
    return;
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("ENVIROX #1");

  display.setCursor(0, 11);
  display.print("Temp: ");
  display.print(temperature, 1);
  display.println(" C");

  display.setCursor(0, 21);
  display.print("Hum : ");
  display.print(humidity, 1);
  display.println(" %");

  display.setCursor(0, 31);
  display.print("Lux : ");
  display.print(lux, 0);
  display.println(" lx");

  display.setCursor(0, 41);
  display.print("Gas : ");
  display.println(gasDetected ? "DETECTED" : "OK");

  display.setCursor(0, 51);
  display.print("Rain: ");
  display.print(rainDetected ? "YES" : "NO");

  display.setCursor(88, 51);
  display.print(buzzerActive ? "ALARM" : "OK");

  display.display();
}

void showOLEDMessage(
  const char* line1,
  const char* line2,
  const char* line3,
  const char* line4
) {
  if (!oledAvailable) {
    return;
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println(line1);

  display.setCursor(0, 16);
  display.println(line2);

  display.setCursor(0, 32);
  display.println(line3);

  display.setCursor(0, 48);
  display.println(line4);

  display.display();
}
