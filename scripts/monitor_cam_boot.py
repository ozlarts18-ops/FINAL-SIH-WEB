import sys
import time
import serial

port = "COM8"
baud = 115200

print(f"[ESP32-CAM] Opening {port} at {baud} baud to capture boot output...")
try:
    ser = serial.Serial(port, baud, timeout=1.0)
    # Toggle DTR/RTS to reset the board if connected
    ser.setDTR(False)
    ser.setRTS(True)
    time.sleep(0.1)
    ser.setRTS(False)
    time.sleep(0.2)

    start_time = time.time()
    while time.time() - start_time < 12:
        if ser.in_waiting:
            line = ser.readline().decode('utf-8', errors='replace').strip()
            if line:
                print(f"[CAM SERIAL] {line}")
        else:
            time.sleep(0.05)
    ser.close()
    print("[ESP32-CAM] Serial monitor finished.")
except Exception as e:
    print(f"[ESP32-CAM] Serial Error: {e}")
