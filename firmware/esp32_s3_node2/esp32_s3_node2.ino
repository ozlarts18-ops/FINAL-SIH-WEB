

#include <WiFi.h>
#include <HTTPClient.h>

#define TURBIDITY_PIN 2
#define SOIL_PIN      3
#define PH_PIN        5

const char* DEVICE_ID  = "ESP32-S3-02";
const char* SERVER_URL = "http://10.152.37.250:5173/data";

const char* WIFI_SSID = "peter";

const char* WIFI_PASSWORD = "ossie@123$";

const unsigned long SENSOR_INTERVAL        = 2500; 
const unsigned long WIFI_RECONNECT_INTERVAL = 5000; 

unsigned long lastSensorReadTime = 0;
unsigned long lastWiFiCheckTime  = 0;

void printWiFiDetails() {
  Serial.println("\n--------------------------------------");
  Serial.println("WiFi connected!");
  Serial.print("SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("ESP32 IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Gateway: ");
  Serial.println(WiFi.gatewayIP());
  Serial.print("RSSI: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
  Serial.println("--------------------------------------\n");
}

void manageWiFiConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long currentMillis = millis();
  if (currentMillis - lastWiFiCheckTime >= WIFI_RECONNECT_INTERVAL) {
    lastWiFiCheckTime = currentMillis;
    Serial.println("[WiFi] Re-initiating connection to hotspot...");
    WiFi.disconnect();
    delay(200);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

void readSensorsAndTransmit() {

  int soilADC = analogRead(SOIL_PIN);
  int moisture;

  if (soilADC == 0) {
    moisture = 0;
  }
  else if (soilADC <= 10) {
    moisture = 5;
  }
  else if (soilADC <= 500) {
    moisture = 30;
  }
  else if (soilADC <= 1641) {
    moisture = map(soilADC, 501, 1641, 31, 99);
  }
  else {
    moisture = 100;
  }

  moisture = constrain(moisture, 0, 100);

  int phADC = analogRead(PH_PIN);
  float phVoltage = (phADC / 4095.0f) * 3.3f;
  float pH = 7.0f + ((1.779f - phVoltage) / 0.18f);
  pH = constrain(pH, 0.0f, 14.0f);

  const char* phStatus;
  if (pH < 6.0f) {
    phStatus = "ACIDIC";
  } else if (pH <= 8.0f) {
    phStatus = "NEUTRAL";
  } else {
    phStatus = "ALKALINE";
  }

  int turbidityADC = analogRead(TURBIDITY_PIN);
  float turbidityVoltage = (turbidityADC / 4095.0f) * 3.3f;

  Serial.println("======================================");
  Serial.println("ESP32-S3 #2 SENSOR STATUS");
  Serial.println("======================================");
  Serial.print("Soil Moisture: ");
  Serial.print(moisture);
  Serial.println(" %");

  Serial.print("pH: ");
  Serial.println(pH, 2);

  Serial.print("pH Status: ");
  Serial.println(phStatus);

  Serial.print("Turbidity Voltage: ");
  Serial.print(turbidityVoltage, 3);
  Serial.println(" V");

  char jsonBuffer[256];
  snprintf(jsonBuffer, sizeof(jsonBuffer),
           "{\"device\":\"%s\",\"soilMoisture\":%d,\"pH\":%.2f,\"turbidityVoltage\":%.3f}",
           DEVICE_ID, moisture, pH, turbidityVoltage);

  Serial.print("Payload: ");
  Serial.println(jsonBuffer);

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.setTimeout(4000); 
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Accept", "application/json");

    Serial.print("POST -> ");
    Serial.println(SERVER_URL);

    int httpResponseCode = http.POST((uint8_t*)jsonBuffer, strlen(jsonBuffer));

    Serial.print("HTTP Response Code: ");
    Serial.println(httpResponseCode);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.print("Server Response: ");
      Serial.println(response);
    } else {
      Serial.print("HTTP Error: ");
      Serial.println(http.errorToString(httpResponseCode).c_str());
    }

    http.end();
  } else {
    Serial.println("[HTTP] Wi-Fi offline. Ingestion skipped for this cycle.");
  }

  Serial.println();
}

void setup() {
  Serial.begin(115200);

  delay(1000);

  Serial.println("\n==============================================");
  Serial.println("Starting EnviroX ESP32-S3 #2 Node Firmware...");
  Serial.println("==============================================");

  analogReadResolution(12);

  pinMode(TURBIDITY_PIN, INPUT);
  pinMode(SOIL_PIN, INPUT);
  pinMode(PH_PIN, INPUT);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); 
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.disconnect(true);
  delay(300);

  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttemptTime = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    printWiFiDetails();
  } else {
    Serial.println("Initial Wi-Fi connection timed out. Entering main loop (auto-reconnect active)...");
  }
}

void loop() {
  
  manageWiFiConnection();

  unsigned long currentMillis = millis();
  if (currentMillis - lastSensorReadTime >= SENSOR_INTERVAL) {
    lastSensorReadTime = currentMillis;
    readSensorsAndTransmit();
  }
}
