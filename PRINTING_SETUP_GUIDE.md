# IMOGI POS - ESC/POS Direct Printing Setup Guide

## 📋 Overview

Sistem printing hybrid untuk IMOGI POS yang support:
- ✅ **Network Thermal Printer** (TCP/IP)
- ✅ **USB Thermal Printer** (Direct device)
- ✅ **Bluetooth Thermal Printer** (Wireless)

**Cocok untuk:** Multiple cabang dengan berbagai jenis printer thermal.

## 🏗️ Arsitektur

```
┌────────────────────────────────────┐
│   FRAPPE CLOUD (Server)            │
│   - Generate ESC/POS commands      │
│   - Return as base64               │
└────────────────┬───────────────────┘
                 │ HTTP API
┌────────────────▼───────────────────┐
│   BROWSER (POS Terminal)           │
│   - Receive ESC/POS data           │
│   - Send to Print Bridge           │
└────────────────┬───────────────────┘
                 │ HTTP (localhost:5555)
┌────────────────▼───────────────────┐
│   PRINT BRIDGE (Kasir PC)          │
│   - Python Flask service           │
│   - Route to printer               │
└────────────────┬───────────────────┘
                 │ Network/USB/Bluetooth
┌────────────────▼───────────────────┐
│   THERMAL PRINTER                  │
│   - Epson, Star, Citizen, dll      │
└────────────────────────────────────┘
```

## 📦 Installation

### 1. Server-Side (Frappe Cloud/Self-Hosted)

File sudah ada di IMOGI POS app:
- ✅ `imogi_pos/api/printing.py` - ESC/POS generator API
- ✅ `imogi_pos/public/js/escpos_printing.js` - Frontend integration

No installation needed di server.

### 2. Client-Side (Kasir PC/Terminal)

**Requirements:**
- Python 3.7+
- Network connectivity ke printer (untuk Network printer)
- USB access (untuk USB printer)
- Bluetooth adapter (untuk Bluetooth printer)

#### A. Install Print Bridge

**Untuk Linux/Mac:**
```bash
# 1. Install system dependencies
# Linux
sudo apt-get install python3-pip libbluetooth-dev

# Mac
brew install python@3.11 bluez

# 2. Copy print bridge files ke kasir PC
cd /opt/imogi-pos
mkdir -p print-bridge
cd print-bridge

# 3. Copy files
# - print_bridge.py
# - print_bridge_requirements.txt

# 4. Install Python dependencies
pip3 install -r print_bridge_requirements.txt

# 5. Test run
python3 print_bridge.py
```

**Untuk Windows:**
```cmd
# 1. Install Python 3.11 dari python.org

# 2. Copy print bridge files ke folder
cd C:\IMOGI-POS\print-bridge

# 3. Install dependencies
pip install -r print_bridge_requirements.txt

# 4. Run
python print_bridge.py
```

#### B. Setup Auto-Start (Optional)

**Linux (systemd):**
```bash
# Create service file
sudo nano /etc/systemd/system/imogi-print-bridge.service
```

```ini
[Unit]
Description=IMOGI POS Print Bridge
After=network.target

[Service]
Type=simple
User=pos
WorkingDirectory=/opt/imogi-pos/print-bridge
ExecStart=/usr/bin/python3 /opt/imogi-pos/print-bridge/print_bridge.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable imogi-print-bridge
sudo systemctl start imogi-print-bridge

# Check status
sudo systemctl status imogi-print-bridge
```

**Mac (launchd):**
```bash
# Create plist file
nano ~/Library/LaunchAgents/com.imogi.printbridge.plist
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.imogi.printbridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/python3</string>
        <string>/opt/imogi-pos/print-bridge/print_bridge.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

```bash
# Load service
launchctl load ~/Library/LaunchAgents/com.imogi.printbridge.plist
```

**Windows (Task Scheduler):**
1. Open Task Scheduler
2. Create Basic Task
3. Name: "IMOGI Print Bridge"
4. Trigger: At startup
5. Action: Start a program
6. Program: `C:\Python311\python.exe`
7. Arguments: `C:\IMOGI-POS\print-bridge\print_bridge.py`
8. Finish

## ⚙️ Configuration

### Per Cabang Setup

#### CABANG A - Network Printer

**Printer:** Epson TM-T82 (Network)
**IP:** 192.168.1.100
**Port:** 9100

```javascript
// Di Browser POS Terminal
imogi_pos.printing.update_config({
    bridge_url: 'http://localhost:5555',
    printer_type: 'network',
    printer_ip: '192.168.1.100',
    printer_port: 9100,
    printer_width: 48,
    auto_print: true
});
```

#### CABANG B - USB Printer

**Printer:** Star TSP143IIIU (USB)
**Device:** /dev/usb/lp0

```bash
# Find USB printer device
ls -l /dev/usb/lp*
# or
lsusb
```

```javascript
// Di Browser POS Terminal
imogi_pos.printing.update_config({
    bridge_url: 'http://localhost:5555',
    printer_type: 'usb',
    device_path: '/dev/usb/lp0',
    printer_width: 32,
    auto_print: true
});
```

**Set permissions (Linux):**
```bash
# Add user to lp group
sudo usermod -a -G lp $USER

# Or set device permissions
sudo chmod 666 /dev/usb/lp0
```

#### CABANG C - Bluetooth Printer

**Printer:** Epson TM-P20 (Bluetooth)
**MAC:** 00:01:90:XX:XX:XX

```bash
# Pair printer first
bluetoothctl
> scan on
> pair 00:01:90:XX:XX:XX
> trust 00:01:90:XX:XX:XX
> exit
```

```javascript
// Di Browser POS Terminal
imogi_pos.printing.update_config({
    bridge_url: 'http://localhost:5555',
    printer_type: 'bluetooth',
    bluetooth_address: '00:01:90:XX:XX:XX',
    bluetooth_name: 'TM-P20',
    printer_width: 32,
    auto_print: true
});
```

## 🖥️ Usage

### Method 1: Auto Print (Recommended)

Enable auto-print di configuration:
```javascript
imogi_pos.printing.update_config({
    auto_print: true
});
```

Print otomatis setelah submit POS Invoice.

### Method 2: Manual Print Button

Klik tombol **"Print Receipt (ESC/POS)"** di POS Invoice form.

### Method 3: Programmatic

```javascript
// Print receipt
imogi_pos.printing.print_receipt('POS-INV-2024-00001', function(success) {
    if (success) {
        console.log('Print successful');
    }
});

// Print KOT
imogi_pos.printing.print_kot('POS-INV-2024-00001', function(success) {
    if (success) {
        console.log('KOT printed');
    }
});
```

## 🛠️ Testing

### Test Print Bridge

```bash
# Check if service is running
curl http://localhost:5555/health

# Expected response:
# {"status":"ok","service":"IMOGI POS Print Bridge","version":"1.0.0"}
```

### Test Network Printer

```bash
curl -X POST http://localhost:5555/test/network \
  -H "Content-Type: application/json" \
  -d '{"printer_ip":"192.168.1.100","printer_port":9100}'
```

### Test from Browser

```javascript
// Open Browser Console (F12)
imogi_pos.printing.test_printer();
```

### Test Direct Print (Network)

```bash
# Send test text to network printer
echo "Test Print" | nc 192.168.1.100 9100
```

## 🔧 Troubleshooting

### 1. Print Bridge Not Running

**Error:** "Cannot connect to Print Bridge"

**Solution:**
```bash
# Check if running
ps aux | grep print_bridge

# Start manually
python3 print_bridge.py

# Check logs
journalctl -u imogi-print-bridge -f  # Linux systemd
```

### 2. Network Printer Not Responding

**Error:** "Connection timeout" atau "Connection refused"

**Checklist:**
- ✅ Printer power on
- ✅ Network cable connected
- ✅ IP address correct
- ✅ Ping test: `ping 192.168.1.100`
- ✅ Port test: `telnet 192.168.1.100 9100`
- ✅ Firewall allow port 9100

**Find printer IP:**
```bash
# Print config page on printer (physical button)
# Or scan network
sudo nmap -p 9100 192.168.1.0/24
```

### 3. USB Printer Permission Denied

**Error:** "Permission denied" saat print ke USB

**Solution:**
```bash
# Check device permissions
ls -l /dev/usb/lp0

# Add user to lp group
sudo usermod -a -G lp $USER

# Or temp fix
sudo chmod 666 /dev/usb/lp0

# Permanent fix (udev rule)
echo 'SUBSYSTEM=="usb", MODE="0666"' | sudo tee /etc/udev/rules.d/99-usb-printer.rules
sudo udevadm control --reload-rules
```

### 4. Bluetooth Printer Not Found

**Error:** "Bluetooth device not found"

**Solution:**
```bash
# Check bluetooth service
sudo systemctl status bluetooth

# Restart bluetooth
sudo systemctl restart bluetooth

# Scan devices
bluetoothctl
> scan on
> devices
> pair XX:XX:XX:XX:XX:XX
> connect XX:XX:XX:XX:XX:XX
```

### 5. Receipt Format Issues

**Issue:** Text terpotong atau format salah

**Solution:**
- Check printer_width setting (32 atau 48 char)
- Test dengan printer_width lain
- Check printer specification

```javascript
// Adjust width
imogi_pos.printing.update_config({
    printer_width: 48  // Try 48 if 32 cuts text
});
```

### 6. CORS Error

**Error:** "CORS policy blocked"

**Solution:** Print Bridge sudah enable CORS. Check:
```bash
# Verify CORS in print_bridge.py
grep "CORS" print_bridge.py
# Should see: from flask_cors import CORS
```

## 📊 Multi-Branch Deployment

### Scenario: 5 Cabang

**Branch Printer Configuration:**

| Cabang | Printer Type | Config |
|--------|-------------|---------|
| Jakarta Pusat | Network | IP: 192.168.1.100:9100 |
| Jakarta Selatan | USB | /dev/usb/lp0 |
| Bandung | Bluetooth | MAC: 00:01:90:XX:XX:XX |
| Surabaya | Network | IP: 10.0.0.50:9100 |
| Bali | Network | IP: 172.16.0.10:9100 |

**Setup Steps:**

1. **Install Print Bridge di setiap kasir PC**
2. **Configure per terminal:**
   - Login ke POS
   - Klik **Tools** → **Printer Settings**
   - Pilih printer type
   - Input connection details
   - Click **Save & Test**

3. **Save config ke localStorage** (auto-saved)

4. **Backup config:**
```javascript
// Export config
console.log(JSON.stringify(imogi_pos.printing.config));

// Import config
imogi_pos.printing.update_config({...});
```

## 💡 Best Practices

### 1. Static IP untuk Network Printer
Set static IP di printer configuration, bukan DHCP.

### 2. Backup Configuration
Save printer config untuk disaster recovery:
```bash
# Backup localStorage
localStorage.getItem('imogi_printer_config')
```

### 3. Monitor Print Bridge
Setup monitoring untuk ensure service running:
```bash
# Simple health check script
#!/bin/bash
if ! curl -s http://localhost:5555/health > /dev/null; then
    systemctl restart imogi-print-bridge
    echo "Print Bridge restarted" | mail -s "Alert" admin@example.com
fi
```

### 4. Printer Maintenance
- Clean print head regularly
- Check paper roll
- Update firmware
- Test print daily

### 5. Network Segmentation
Isolate printer network dari public network untuk security.

## 📞 Support

**Issues:**
- Check logs: `journalctl -u imogi-print-bridge -f`
- Test connectivity: `imogi_pos.printing.check_bridge_status(true)`
- Verify printer online
- Check firewall rules

**Contact:**
- GitHub Issues: https://github.com/your-org/imogi-pos
- Email: support@imogi.com

## 🔄 Updates

### Version 1.0.0
- ✅ Network printer support
- ✅ USB printer support
- ✅ Bluetooth printer support
- ✅ Auto-print functionality
- ✅ Multi-branch configuration
- ✅ KOT printing
- ✅ Receipt customization

---

**Last Updated:** January 2026
**Maintained by:** IMOGI POS Team
