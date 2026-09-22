import os

os.makedirs('firmware/esp32_cam', exist_ok=True)

code = """/*
  =====================================================================================
  ENVIROX - ESP32-CAM (AI-Thinker 5MP / OV2640 / OV3660 / OV5640)
  Live Wireless Video Stream & Agricultural Computer Vision Node
  Associated with: ESP32 Node #2 (Soil & Water Node)
  Target: AI Thinker ESP32-CAM (Pure Wi-Fi Hotspot Stream)
  =====================================================================================
*/

#include "esp_camera.h"
#include <WiFi.h>
#include "esp_timer.h"
#include "img_converters.h"
#include "Arduino.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "esp_http_server.h"
#include <HTTPClient.h>

// =====================================================================================
// USER HOTSPOT SETTINGS
// =====================================================================================
const char* WIFI_SSID     = "peter";
const char* WIFI_PASSWORD = "ossie@123$";
const char* SERVER_URL    = "http://10.152.37.250:5173/data";
const char* DEVICE_ID     = "ESP32-CAM";

// =====================================================================================
// AI-THINKER CAMERA PINOUT
// =====================================================================================
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
const unsigned long TELEMETRY_INTERVAL = 3000;
bool flashLedState = false;

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t * _jpg_buf = NULL;
  char part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

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
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }
  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
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
  const char* resp = flashLedState ? "{\"led\":\"ON\"}" : "{\"led\":\"OFF\"}";
  return httpd_resp_send(req, resp, strlen(resp));
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.ctrl_port = 32768;

  httpd_uri_t stream_uri = {
    .uri = "/stream",
    .method = HTTP_GET,
    .handler = stream_handler,
    .user_ctx = NULL
  };
  httpd_uri_t capture_uri = {
    .uri = "/capture",
    .method = HTTP_GET,
    .handler = capture_handler,
    .user_ctx = NULL
  };
  httpd_uri_t led_uri = {
    .uri = "/led",
    .method = HTTP_GET,
    .handler = led_handler,
    .user_ctx = NULL
  };

  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    httpd_register_uri_handler(stream_httpd, &capture_uri);
    httpd_register_uri_handler(stream_httpd, &led_uri);
    Serial.println("[HTTP] Live Camera MJPEG Server started on port 80");
  }
}

void sendCameraTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");

  char ipStr[32];
  snprintf(ipStr, sizeof(ipStr), "%s", WiFi.localIP().toString().c_str());
  char jsonBuffer[256];
  snprintf(jsonBuffer, sizeof(jsonBuffer),
           "{\\"device\\":\\"%s\\",\\"ip\\":\\"%s\\",\\"streamUrl\\":\\"http://%s/stream\\",\\"snapshotUrl\\":\\"http://%s/capture\\",\\"targetNode\\":\\"ESP32-S3-02\\",\\"status\\":\\"ONLINE\\"}",
           DEVICE_ID, ipStr, ipStr, ipStr);
  int code = http.POST((uint8_t*)jsonBuffer, strlen(jsonBuffer));
  if (code > 0) {
    Serial.printf("[EnviroX] Camera telemetry synced (HTTP %d)\\n", code);
  }
  http.end();
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  Serial.begin(115200);
  delay(1000);

  Serial.println("\\n================================================");
  Serial.println("       ENVIROX - ESP32-CAM WIRELESS NODE");
  Serial.println("================================================");

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
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] ERROR: Camera init failed 0x%x\\n", err);
    return;
  }
  Serial.println("[CAM] Camera Sensor online!");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int att = 0;
  while (WiFi.status() != WL_CONNECTED && att < 30) {
    delay(500);
    Serial.print(".");
    att++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, LOW);
    Serial.println("🎉 [WiFi] ESP32-CAM CONNECTED TO HOTSPOT!");
    Serial.print("Camera IP:    ");
    Serial.println(WiFi.localIP());
    Serial.print("Live Stream:  http://");
    Serial.print(WiFi.localIP());
    Serial.println("/stream");
    Serial.print("Snapshot:     http://");
    Serial.print(WiFi.localIP());
    Serial.println("/capture");
    startCameraServer();
    sendCameraTelemetry();
  } else {
    Serial.println("[WiFi] Hotspot connection timeout. Streaming fallback to USB COM8.");
  }
}

void loop() {
  unsigned long now = millis();
  if (now - lastTelemetrySent >= TELEMETRY_INTERVAL) {
    lastTelemetrySent = now;
    sendCameraTelemetry();
  }

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
  delay(40);
}
"""

with open('firmware/esp32_cam/esp32_cam.ino', 'w', encoding='utf-8') as f:
    f.write(code)

print("esp32_cam.ino successfully written!")
