import serial
import time
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

port = sys.argv[1] if len(sys.argv) > 1 else 'COM10'
print(f"Connecting to {port} at 115200 baud...")

try:
    ser = serial.Serial(port, 115200, timeout=2.0)
    time.sleep(1.0)
    print("--- LIVE ESP32-S3 SERIAL OUTPUT ---")
    start = time.time()
    while time.time() - start < 8.0:
        line = ser.readline().decode('utf-8', errors='replace').strip()
        if line:
            print(line)
    ser.close()
    print("--- END OF STREAM ---")
except Exception as e:
    print(f"Serial read error: {e}")
