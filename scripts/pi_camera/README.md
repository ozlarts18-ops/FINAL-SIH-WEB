# Raspberry Pi USB Camera Ingestion (`envirox-pi-cam`)

This service runs on a Raspberry Pi (Debian Bookworm, hostname `raspberrypi`, user `vsit`, IP `10.140.217.194`) to capture continuous JPEG frames from an attached USB webcam via OpenCV and POST them to the EnviroX backend at ~1s cadence.

## Prerequisites

- Raspberry Pi running Debian Bookworm
- USB Webcam connected via USB port (accessible at `/dev/video0`)
- Python 3 with `venv` installed

## Installation Steps

1. Create target directory on the Pi and copy the python script:
   ```bash
   mkdir -p ~/envirox-cam
   cp capture_and_send.py ~/envirox-cam/
   ```

2. Create virtual environment and install dependencies:
   ```bash
   python3 -m venv ~/envirox-cam/venv
   ~/envirox-cam/venv/bin/pip install opencv-python-headless
   ```

3. Install systemd service unit:
   ```bash
   sudo cp envirox-pi-cam.service /etc/systemd/system/
   sudo systemctl daemon-reload
   ```

4. Enable and start service:
   ```bash
   sudo systemctl enable envirox-pi-cam
   sudo systemctl start envirox-pi-cam
   ```

## Monitoring & Service Commands

- **Check Service Status:**
  ```bash
  sudo systemctl status envirox-pi-cam
  ```

- **Tail Real-time Service Logs:**
  ```bash
  journalctl -u envirox-pi-cam -f
  ```

- **Restart Service:**
  ```bash
  sudo systemctl restart envirox-pi-cam
  ```

## Backend Data Contract

- **Endpoint:** `POST /api/camera/pi-frame`
- **Payload Schema:**
  ```json
  {
    "device_id": "raspberrypi",
    "timestamp": 1727170000000,
    "content_type": "image/jpeg",
    "image_base64": "<base64_encoded_jpeg>"
  }
  ```
