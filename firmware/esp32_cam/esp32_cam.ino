

#include "esp_camera.h"
#include <WiFi.h>
#include <ESPmDNS.h>
#include "esp_timer.h"
#include "img_converters.h"
#include "Arduino.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "esp_http_server.h"
#include <HTTPClient.h>

const char* WIFI_SSID     = "peter";
const char* WIFI_PASSWORD = "ossie@123$";

const char* SERVER_URL    = "http://10.152.37.250:5173/data";
const char* DEVICE_ID     = "ESP32-CAM";
const char* MDNS_NAME     = "envirox-cam"; 

#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define FLASH_LED_PIN      4
#define STATUS_LED_PIN    33

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t stream_httpd = NULL;
unsigned long lastTelemetrySent = 0;
const unsigned long TELEMETRY_INTERVAL = 4000;
bool flashLedState = false;

static const char PROGMEM INDEX_HTML[] = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EnviroX ESP32-CAM Node</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; text-align: center; }
    .card { max-width: 640px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
    h1 { color: #10b981; font-size: 22px; margin-bottom: 8px; }
    .stream-box { width: 100%; border-radius: 8px; overflow: hidden; background: #000; margin: 15px 0; border: 2px solid #10b981; min-height: 240px; }
    .stream-box img { width: 100%; height: auto; display: block; }
    .btn-row { display: flex; justify-content: center; gap: 10px; margin-top: 15px; flex-wrap: wrap; }
    button { background: #10b981; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; transition: 0.2s; }
    button:hover { background: #059669; }
    .btn-secondary { background: #3b82f6; }
    .btn-secondary:hover { background: #2563eb; }
    .btn-flash { background: #f59e0b; }
    .btn-flash:hover { background: #d97706; }
    .info { font-size: 13px; color: #94a3b8; margin-top: 15px; line-height: 1.6; text-align: left; background: #0f172a; padding: 12px; border-radius: 6px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; background: #065f46; color: #6ee7b7; font-size: 11px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">ENVIROX 5MP AI VISION NODE</span>
    <h1>ESP32-CAM Live Feed</h1>
    <div class="stream-box">
      <img src="/stream" id="camStream" alt="Live Camera Stream">
    </div>
    <div class="btn-row">
      <button onclick="toggleLed()" class="btn-flash" id="flashBtn">💡 Toggle Flash LED</button>
      <button onclick="takeSnapshot()" class="btn-secondary">📸 Open Snapshot</button>
      <button onclick="reloadStream()">🔄 Reload Feed</button>
    </div>
    <div class="info">
      <div><strong>Stream URL:</strong> <span id="sUrl">http://<script>document.write(location.host)</script>/stream</span></div>
      <div><strong>Snapshot URL:</strong> <span id="cUrl">http://<script>document.write(location.host)</script>/capture</span></div>
      <div><strong>mDNS Host:</strong> http://envirox-cam.local/stream</div>
      <div><strong>Connected To:</strong> Mobile Hotspot / Local LAN</div>
    </div>
  </div>
  <script>
    let flashOn = false;
    function toggleLed() {
      flashOn = !flashOn;
      fetch('/led?val=' + (flashOn ? 1 : 0))
        .then(r => r.json())
        .then(d => {
          document.getElementById('flashBtn').innerText = flashOn ? '💡 Flash LED (ON)' : '💡 Flash LED (OFF)';
        });
    }
    function takeSnapshot() {
      window.open('/capture?t=' + Date.now(), '_blank');
    }
    function reloadStream() {
      document.getElementById('camStream').src = '/stream?t=' + Date.now();
    }
  </script>
</body>
</html>
)rawliteral";

static esp_err_t index_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "text/html");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, INDEX_HTML, strlen(INDEX_HTML));
}

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t * _jpg_buf = NULL;
  char part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache, no-store, must-revalidate");
  httpd_resp_set_hdr(req, "Pragma", "no-cache");
  httpd_resp_set_hdr(req, "Expires", "0");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("[CAM] Camera capture failed");
      res = ESP_FAIL;
    } else {
      if (fb->format != PIXFORMAT_JPEG) {
        bool jpeg_converted = frame2jpg(fb, 80, &_jpg_buf, &_jpg_buf_len);
        esp_camera_fb_return(fb);
        fb = NULL;
        if (!jpeg_converted) {
          Serial.println("[CAM] JPEG conversion failed");
          res = ESP_FAIL;
        }
      } else {
        _jpg_buf_len = fb->len;
        _jpg_buf = fb->buf;
      }
    }

    if (res == ESP_OK) {
      size_t hlen = snprintf(part_buf, 64, _STREAM_PART, _jpg_buf_len);
      res = httpd_resp_send_chunk(req, part_buf, hlen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    }

    if (fb) {
      esp_camera_fb_return(fb);
      fb = NULL;
      _jpg_buf = NULL;
    } else if (_jpg_buf) {
      free(_jpg_buf);
      _jpg_buf = NULL;
    }

    if (res != ESP_OK) break;
  }
  return res;
}

static esp_err_t capture_handler(httpd_req_t *req) {
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[CAM] Capture frame failed");
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache");

  esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return res;
}

static esp_err_t led_handler(httpd_req_t *req) {
  char buf[32];
  size_t buf_len = sizeof(buf);
  int val = 0;

  if (httpd_req_get_url_query_str(req, buf, buf_len) == ESP_OK) {
    char param[16];
    if (httpd_query_key_value(buf, "val", param, sizeof(param)) == ESP_OK) {
      val = atoi(param);
    }
  }

  flashLedState = (val > 0);
  digitalWrite(FLASH_LED_PIN, flashLedState ? HIGH : LOW);

  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  char resp[64];
  snprintf(resp, sizeof(resp), "{\"status\":\"success\",\"led\":\"%s\",\"val\":%d}", flashLedState ? "ON" : "OFF", flashLedState ? 1 : 0);
  return httpd_resp_send(req, resp, strlen(resp));
}

static esp_err_t status_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  char ipStr[32];
  snprintf(ipStr, sizeof(ipStr), "%s", WiFi.localIP().toString().c_str());

  char resp[300];
  snprintf(resp, sizeof(resp),
           "{\"device\":\"%s\",\"status\":\"ONLINE\",\"ip\":\"%s\",\"rssi\":%d,\"psram\":%s,\"free_heap\":%u,\"flash_led\":\"%s\",\"streamUrl\":\"http://%s/stream\",\"snapshotUrl\":\"http://%s/capture\"}",
           DEVICE_ID, ipStr, WiFi.RSSI(), psramFound() ? "true" : "false", ESP.getFreeHeap(), flashLedState ? "ON" : "OFF", ipStr, ipStr);

  return httpd_resp_send(req, resp, strlen(resp));
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.ctrl_port = 32768;

  httpd_uri_t index_uri = {
    .uri       = "/",
    .method    = HTTP_GET,
    .handler   = index_handler,
    .user_ctx  = NULL
  };

  httpd_uri_t stream_uri = {
    .uri       = "/stream",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };

  httpd_uri_t capture_uri = {
    .uri       = "/capture",
    .method    = HTTP_GET,
    .handler   = capture_handler,
    .user_ctx  = NULL
  };

  httpd_uri_t led_uri = {
    .uri       = "/led",
    .method    = HTTP_GET,
    .handler   = led_handler,
    .user_ctx  = NULL
  };

  httpd_uri_t status_uri = {
    .uri       = "/status",
    .method    = HTTP_GET,
    .handler   = status_handler,
    .user_ctx  = NULL
  };

  Serial.println("[HTTP] Starting MJPEG Live Stream Server on Port 80...");
  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &index_uri);
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    httpd_register_uri_handler(stream_httpd, &capture_uri);
    httpd_register_uri_handler(stream_httpd, &led_uri);
    httpd_register_uri_handler(stream_httpd, &status_uri);
    Serial.println("[HTTP] Live Camera Server active!");
  }
}

void sendCameraTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(2500);
  http.addHeader("Content-Type", "application/json");

  char ipStr[32];
  snprintf(ipStr, sizeof(ipStr), "%s", WiFi.localIP().toString().c_str());

  char jsonBuffer[280];
  snprintf(jsonBuffer, sizeof(jsonBuffer),
           "{\"device\":\"%s\",\"ip\":\"%s\",\"streamUrl\":\"http://%s/stream\",\"snapshotUrl\":\"http://%s/capture\",\"targetNode\":\"ESP32-S3-02\",\"status\":\"ONLINE\",\"rssi\":%d}",
           DEVICE_ID, ipStr, ipStr, ipStr, WiFi.RSSI());

  int code = http.POST((uint8_t*)jsonBuffer, strlen(jsonBuffer));
  if (code > 0) {
    Serial.printf("[EnviroX] Camera telemetry synced to %s (HTTP %d)\n", SERVER_URL, code);
  }
  http.end();
}

void setup() {
  
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("=================================================");
  Serial.println("           ENVIROX - ESP32-CAM MODULE");
  Serial.println("      5MP / PSRAM MOBILE HOTSPOT NODE");
  Serial.println("=================================================");

  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, HIGH);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;

  if (psramFound()) {
    Serial.println("[CAM] PSRAM detected (High-Res 5MB/8MB buffer mode).");
    config.frame_size = FRAMESIZE_VGA;  
    config.jpeg_quality = 10;           
    config.fb_count = 2;                
  } else {
    Serial.println("[CAM] WARNING: No PSRAM detected. Running standard buffer.");
    config.frame_size = FRAMESIZE_QVGA; 
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] ERROR: Camera init failed with error 0x%x\n", err);
    return;
  }
  Serial.println("[CAM] Camera sensor initialized successfully!");

  sensor_t * s = esp_camera_sensor_get();
  if (s != NULL) {
    s->set_brightness(s, 0);     
    s->set_contrast(s, 1);       
    s->set_saturation(s, 1);     
    s->set_special_effect(s, 0); 
    s->set_whitebal(s, 1);       
    s->set_awb_gain(s, 1);       
    s->set_wb_mode(s, 0);        
    s->set_exposure_ctrl(s, 1);  
    s->set_aec2(s, 0);
    s->set_gain_ctrl(s, 1);      
    s->set_agc_gain(s, 0);
    s->set_gainceiling(s, (gainceiling_t)0);
    s->set_bpc(s, 0);
    s->set_wpc(s, 1);
    s->set_raw_gma(s, 1);
    s->set_lenc(s, 1);
    s->set_hmirror(s, 0);
    s->set_vflip(s, 0);
    s->set_dcw(s, 1);
  }

  Serial.printf("[WiFi] Connecting to Mobile Hotspot: %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 35) {
    delay(400);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, LOW); 
    Serial.println("\n🎉 [WiFi] ESP32-CAM CONNECTED TO HOTSPOT!");
    Serial.print("📱 ESP32-CAM IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("📡 Live Stream URL:      http://");
    Serial.print(WiFi.localIP());
    Serial.println("/stream");
    Serial.print("📸 Snapshot URL:         http://");
    Serial.print(WiFi.localIP());
    Serial.println("/capture");
    Serial.print("🌐 Diagnostic Portal:    http://");
    Serial.println(WiFi.localIP());

    if (MDNS.begin(MDNS_NAME)) {
      Serial.printf("🏷️ mDNS Responder active: http://%s.local/stream\n", MDNS_NAME);
      MDNS.addService("http", "tcp", 80);
    }

    startCameraServer();

    sendCameraTelemetry();
  } else {
    Serial.println("\n⚠️ [WiFi] Mobile Hotspot connection timeout.");
    Serial.println("ℹ️ Ensure Hotspot 2.4GHz band is ON, SSID & Password match.");
  }

  Serial.println("=================================================");
  Serial.println("ESP32-CAM READY & ACTIVE FOR ENVIROX");
  Serial.println("=================================================");
}

void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWiFiRetry = 0;
    if (now - lastWiFiRetry >= 5000) {
      lastWiFiRetry = now;
      digitalWrite(STATUS_LED_PIN, HIGH);
      Serial.println("[WiFi] Hotspot connection dropped. Attempting auto-reconnect...");
      WiFi.reconnect();
    }
  } else {
    digitalWrite(STATUS_LED_PIN, LOW);

    if (now - lastTelemetrySent >= TELEMETRY_INTERVAL) {
      lastTelemetrySent = now;
      sendCameraTelemetry();
    }
  }

  if (WiFi.status() != WL_CONNECTED) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (fb) {
      Serial.write((uint8_t)0xAA);
      Serial.write((uint8_t)0x55);
      Serial.write((uint8_t)((fb->len >> 24) & 0xFF));
      Serial.write((uint8_t)((fb->len >> 16) & 0xFF));
      Serial.write((uint8_t)((fb->len >> 8) & 0xFF));
      Serial.write((uint8_t)(fb->len & 0xFF));
      Serial.write(fb->buf, fb->len);
      esp_camera_fb_return(fb);
    }
    delay(50);
  } else {
    delay(100);
  }
}
