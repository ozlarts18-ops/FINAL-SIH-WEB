#!/usr/bin/env python3
"""
EnviroX Raspberry Pi USB Camera Ingestion Script
Captures continuous JPEG frames from a USB webcam via OpenCV and POSTs
base64-encoded frames to the EnviroX backend at ~1s cadence.
"""

import os
import sys
import time
import base64
import logging
import urllib.parse
import urllib.request
import json
import cv2

# Configure logging to stdout/journald
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

# Configuration from environment or defaults
SERVER_URL = os.getenv("ENVIROX_SERVER_URL", "http://10.140.217.250:5173/api/camera/pi-frame")
DEVICE_ID = os.getenv("ENVIROX_DEVICE_ID", "raspberrypi")
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
CADENCE_SEC = float(os.getenv("CADENCE_SEC", "0.25"))
JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "75"))


def open_camera(device_index):
    """Initializes OpenCV video capture for USB webcam."""
    logging.info(f"Opening USB camera at index {device_index}...")
    cap = cv2.VideoCapture(device_index, cv2.CAP_V4L2 if sys.platform.startswith("linux") else cv2.CAP_ANY)
    if not cap.isOpened():
        cap = cv2.VideoCapture(device_index)

    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        logging.info(f"Successfully initialized camera index {device_index}")
        return cap
    else:
        logging.error(f"Failed to open USB camera at index {device_index}")
        return None


def send_frame(url, payload):
    """Sends JSON frame payload to backend via HTTP POST."""
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=4.0) as resp:
        return resp.status, resp.read().decode('utf-8')


def main():
    logging.info(f"Starting EnviroX Pi Camera Streamer -> {SERVER_URL} (Device: {DEVICE_ID})")
    cap = open_camera(CAMERA_INDEX)

    consecutive_failures = 0

    while True:
        try:
            if cap is None or not cap.isOpened():
                logging.warning("Camera handle lost. Re-attempting connection...")
                if cap is not None:
                    cap.release()
                time.sleep(2)
                cap = open_camera(CAMERA_INDEX)
                if cap is None or not cap.isOpened():
                    time.sleep(3)
                    continue

            ret, frame = cap.read()
            if not ret or frame is None:
                logging.warning("Failed to grab frame from USB camera. Retrying...")
                consecutive_failures += 1
                if consecutive_failures > 5:
                    logging.error("Too many frame grab failures; re-opening camera...")
                    cap.release()
                    cap = None
                    consecutive_failures = 0
                time.sleep(1)
                continue

            consecutive_failures = 0

            # Encode frame to JPEG
            encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]
            success, jpeg_buf = cv2.imencode('.jpg', frame, encode_param)
            if not success:
                logging.warning("JPEG encoding failed")
                time.sleep(0.5)
                continue

            # Convert to Base64 string
            b64_str = base64.b64encode(jpeg_buf.tobytes()).decode('utf-8')

            # Payload adhering to EnviroX contract
            payload = {
                "device_id": DEVICE_ID,
                "timestamp": int(time.time() * 1000),
                "content_type": "image/jpeg",
                "image_base64": b64_str
            }

            status_code, resp_text = send_frame(SERVER_URL, payload)
            if status_code == 200:
                logging.debug(f"Frame delivered successfully: {len(b64_str)} bytes b64")
            else:
                logging.warning(f"Server responded with HTTP {status_code}: {resp_text}")

        except urllib.error.URLError as url_err:
            logging.warning(f"Connection error reaching backend ({SERVER_URL}): {url_err.reason}")
            time.sleep(2.0)
        except Exception as e:
            logging.error(f"Unexpected error in capture loop: {e}")
            time.sleep(2.0)

        time.sleep(CADENCE_SEC)


if __name__ == "__main__":
    main()
