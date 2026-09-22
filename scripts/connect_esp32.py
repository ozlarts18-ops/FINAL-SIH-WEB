"""
EnviroX ESP32-S3 Local Connector & Serial Bridge (No Arduino IDE Required)
Allows direct bidirectional communication with ESP32-S3 over USB Serial (COM7 / auto-detected)
Supports telemetry streaming, Edge AI inference triggers, and relay control.
"""

import sys
import os
import time
import json
import argparse
import serial
import serial.tools.list_ports

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

DEFAULT_BAUD = 115200

def list_ports():
    """Returns list of detected serial ports with descriptions"""
    ports = []
    for p in serial.tools.list_ports.comports():
        ports.append({
            "device": p.device,
            "description": p.description,
            "hwid": p.hwid,
            "is_esp32": any(k in p.description.lower() or k in p.hwid.lower() 
                            for k in ['ch343', 'ch340', 'cp210', 'esp32', 'usb serial', 'uart'])
        })
    return ports

def find_esp32_port():
    """Attempts to auto-detect the ESP32-S3 port (prioritizing COM7 and CH343)"""
    ports = list_ports()
    for p in ports:
        if p["device"].upper() == "COM7":
            return p["device"]
    for p in ports:
        if p["is_esp32"]:
            return p["device"]
    if ports:
        return ports[0]["device"]
    return None

class ESP32Bridge:
    def __init__(self, port=None, baud=DEFAULT_BAUD, timeout=1.0):
        self.port = port or find_esp32_port() or "COM7"
        self.baud = baud
        self.timeout = timeout
        self.ser = None
        self.is_connected = False

    def connect(self):
        try:
            print(f"🔌 [ESP32-S3] Connecting to {self.port} at {self.baud} baud...", file=sys.stderr)
            self.ser = serial.Serial(self.port, self.baud, timeout=self.timeout)
            time.sleep(1.5)
            self.is_connected = True
            print(f"✅ [ESP32-S3] Successfully connected to {self.port}", file=sys.stderr)
            return True
        except Exception as e:
            print(f"❌ [ESP32-S3 Error] Connection failed: {e}", file=sys.stderr)
            self.is_connected = False
            return False

    def send_command(self, cmd):
        if not self.is_connected or not self.ser:
            return {"error": "Device not connected"}
        
        try:
            full_cmd = (cmd.strip() + "\n").encode('utf-8')
            self.ser.write(full_cmd)
            self.ser.flush()
            
            lines = []
            start = time.time()
            while time.time() - start < 2.0:
                line = self.ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    lines.append(line)
                    if line.startswith("{") and line.endswith("}"):
                        try:
                            return json.loads(line)
                        except Exception:
                            pass
                else:
                    if lines:
                        break
            return {"response": lines, "raw": "\n".join(lines)}
        except Exception as e:
            return {"error": str(e)}

    def read_line(self):
        if not self.is_connected or not self.ser:
            return None
        try:
            line = self.ser.readline().decode('utf-8', errors='ignore').strip()
            return line if line else None
        except Exception:
            return None

    def close(self):
        if self.ser and self.ser.is_open:
            self.ser.close()
            self.is_connected = False
            print(f"🔌 [ESP32-S3] Closed {self.port}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="EnviroX ESP32-S3 Local Serial Bridge")
    parser.add_argument("--list-ports", action="store_true", help="List all available COM ports")
    parser.add_argument("--port", type=str, default=None, help="Serial port to connect (e.g. COM7)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--cmd", type=str, default=None, help="Execute single CLI command and exit")
    parser.add_argument("--monitor", action="store_true", help="Monitor serial telemetry continuously")
    parser.add_argument("--json-daemon", action="store_true", help="Run in JSON RPC bridge mode for Node.js API")

    args = parser.parse_args()

    if args.list_ports:
        ports = list_ports()
        print(json.dumps(ports, indent=2))
        return

    bridge = ESP32Bridge(port=args.port, baud=args.baud)

    if args.cmd:
        if bridge.connect():
            res = bridge.send_command(args.cmd)
            print(json.dumps(res, indent=2))
            bridge.close()
        return

    if args.json_daemon:
        if bridge.connect():
            print(json.dumps({"status": "connected", "port": bridge.port, "baud": bridge.baud}), flush=True)
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue
                try:
                    req = json.loads(line)
                    cmd = req.get("command", "SENSORS")
                    res = bridge.send_command(cmd)
                    print(json.dumps({"id": req.get("id"), "result": res}), flush=True)
                except Exception as e:
                    print(json.dumps({"error": str(e)}), flush=True)
            bridge.close()
        else:
            print(json.dumps({"status": "error", "message": "Failed to connect to ESP32-S3"}), flush=True)
        return

    print("=" * 60)
    print("🌿 EnviroX ESP32-S3 Local Hardware Link Monitor")
    print(f"Target Port: {bridge.port} @ {bridge.baud} baud")
    print("Commands: INFER, SENSORS, MODEL, CHIP, RELAYS, REBOOT, QUIT")
    print("=" * 60)

    if not bridge.connect():
        print(f"Could not open {bridge.port}. Ensure no other app (e.g. Arduino IDE Serial Monitor) has locked the port.")
        sys.exit(1)

    try:
        while True:
            line = bridge.read_line()
            if line:
                print(f"[{time.strftime('%H:%M:%S')}] {line}")
            time.sleep(0.05)
    except KeyboardInterrupt:
        print("\nDisconnecting...")
        bridge.close()

if __name__ == "__main__":
    main()
