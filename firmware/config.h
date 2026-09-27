#ifndef ENVIRONMENT_CONFIG_H
#define ENVIRONMENT_CONFIG_H

// ============================================================================================================================================================
// ENVIROX CENTRAL NETWORK & SERVER CONFIGURATION
// Edit this file to update network credentials or backend server IP/port.
// Both Node 1 (ESP32-S3-01) and Node 2 (ESP32-S3-02) share this configuration.
// 

#define WIFI_SSID     "peter "
#define WIFI_PASSWORD "ossie@123$"

#define SERVER_IP     "10.140.217.250"
#define SERVER_PORT   5173
#define SERVER_PATH   "/data"

// ESP32-CAM Network Configuration (DHCP enabled so camera matches router subnet)
#define ESP32_CAM_USE_STATIC_IP false
#define ESP32_CAM_STATIC_IP     192, 168, 43, 21
#define ESP32_CAM_GATEWAY       192, 168, 43, 1
#define ESP32_CAM_SUBNET        255, 255, 255, 0
#define ESP32_CAM_DNS           192, 168, 43, 1

#endif // ENVIRONMENT_CONFIG_H

