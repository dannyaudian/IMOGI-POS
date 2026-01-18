# Quick Start - ESC/POS Printing

## 🚀 5 Menit Setup

### Step 1: Install Print Bridge di Kasir PC

```bash
# Download files
cd ~
mkdir imogi-print-bridge
cd imogi-print-bridge

# Copy files:
# - print_bridge.py
# - print_bridge_requirements.txt

# Install dependencies
pip3 install flask flask-cors pybluez pyserial

# Run
python3 print_bridge.py
```

### Step 2: Configure di Browser

1. Login ke POS
2. Click **Tools** → **Printer Settings**
3. Pilih Printer Type:

**Untuk Network Printer:**
- Type: Network
- IP: 192.168.1.100
- Port: 9100

**Untuk USB Printer:**
- Type: USB
- Device: /dev/usb/lp0

**Untuk Bluetooth:**
- Type: Bluetooth
- Click **Discover Devices**
- Pilih printer dari list

4. Click **Save & Test**
5. Check if test print works ✅

### Step 3: Print!

**Auto Print:** Enable di Printer Settings

**Manual Print:** Click "Print Receipt (ESC/POS)" button

**Done!** 🎉

---

## 📋 Cheat Sheet

### Print from Code
```javascript
// Print receipt
imogi_pos.printing.print_receipt('POS-INV-00001');

// Print KOT
imogi_pos.printing.print_kot('POS-INV-00001');

// Test printer
imogi_pos.printing.test_printer();
```

### Find USB Device
```bash
ls -l /dev/usb/lp*     # List USB printers
ls -l /dev/ttyUSB*     # Serial USB
```

### Test Network Printer
```bash
ping 192.168.1.100           # Check online
telnet 192.168.1.100 9100    # Test port
echo "test" | nc 192.168.1.100 9100  # Send test
```

### Check Print Bridge
```bash
curl http://localhost:5555/health
```

---

## 🔧 Common Issues

**Print Bridge not running?**
```bash
python3 print_bridge.py
```

**Permission denied on USB?**
```bash
sudo chmod 666 /dev/usb/lp0
```

**Bluetooth not working?**
```bash
sudo systemctl restart bluetooth
bluetoothctl
> scan on
```

---

**Lihat:** [PRINTING_SETUP_GUIDE.md](PRINTING_SETUP_GUIDE.md) untuk detail lengkap.
