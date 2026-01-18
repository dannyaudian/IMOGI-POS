#!/usr/bin/env python3
"""
IMOGI POS - Thermal Printer Bridge
Client-side service untuk connect browser ke thermal printer
Support: Network (TCP/IP), USB, Bluetooth

Installation per kasir PC:
1. pip install flask pybluez pyserial
2. python print_bridge.py
3. Access di browser: http://localhost:5555

Usage:
- Network Printer: POST /print/network
- USB Printer: POST /print/usb
- Bluetooth Printer: POST /print/bluetooth
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import socket
import base64
import logging
import os
import sys

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('PrintBridge')

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from browser

# Configuration
DEFAULT_PORT = 5555
DEFAULT_PRINTER_PORT = 9100


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'IMOGI POS Print Bridge',
        'version': '1.0.0'
    })


@app.route('/print/network', methods=['POST'])
def print_network():
    """
    Print to network thermal printer via TCP/IP
    
    Request JSON:
    {
        "printer_ip": "192.168.1.100",
        "printer_port": 9100,
        "data": "base64_encoded_escpos_data"
    }
    """
    try:
        data = request.get_json()
        
        printer_ip = data.get('printer_ip')
        printer_port = data.get('printer_port', DEFAULT_PRINTER_PORT)
        print_data = data.get('data')
        
        if not printer_ip:
            return jsonify({
                'success': False,
                'error': 'printer_ip is required'
            }), 400
        
        if not print_data:
            return jsonify({
                'success': False,
                'error': 'data is required'
            }), 400
        
        # Decode base64 data
        try:
            decoded_data = base64.b64decode(print_data)
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid base64 data: {str(e)}'
            }), 400
        
        # Connect and send to printer
        logger.info(f"Printing to network printer: {printer_ip}:{printer_port}")
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)  # 10 second timeout
        
        try:
            sock.connect((printer_ip, int(printer_port)))
            sock.send(decoded_data)
            sock.close()
            
            logger.info(f"Print successful to {printer_ip}")
            
            return jsonify({
                'success': True,
                'message': 'Print job sent successfully',
                'printer': f"{printer_ip}:{printer_port}",
                'bytes_sent': len(decoded_data)
            })
            
        except socket.timeout:
            logger.error(f"Timeout connecting to {printer_ip}")
            return jsonify({
                'success': False,
                'error': f'Connection timeout to printer {printer_ip}'
            }), 500
            
        except ConnectionRefusedError:
            logger.error(f"Connection refused by {printer_ip}")
            return jsonify({
                'success': False,
                'error': f'Connection refused by printer {printer_ip}. Check if printer is online.'
            }), 500
            
        finally:
            try:
                sock.close()
            except:
                pass
    
    except Exception as e:
        logger.error(f"Network print error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/print/usb', methods=['POST'])
def print_usb():
    """
    Print to USB thermal printer via direct device
    
    Request JSON:
    {
        "device_path": "/dev/usb/lp0",  # Linux/Mac
        "data": "base64_encoded_escpos_data"
    }
    
    Common device paths:
    - Linux: /dev/usb/lp0, /dev/usb/lp1, /dev/ttyUSB0
    - Mac: /dev/cu.usbserial, /dev/tty.usbserial
    - Windows: LPT1, COM1 (use serial mode)
    """
    try:
        data = request.get_json()
        
        device_path = data.get('device_path')
        print_data = data.get('data')
        
        if not device_path:
            return jsonify({
                'success': False,
                'error': 'device_path is required'
            }), 400
        
        if not print_data:
            return jsonify({
                'success': False,
                'error': 'data is required'
            }), 400
        
        # Decode base64 data
        try:
            decoded_data = base64.b64decode(print_data)
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid base64 data: {str(e)}'
            }), 400
        
        # Check if device exists
        if not os.path.exists(device_path):
            return jsonify({
                'success': False,
                'error': f'Device {device_path} not found. Check device path and permissions.'
            }), 404
        
        # Write to device
        logger.info(f"Printing to USB device: {device_path}")
        
        try:
            with open(device_path, 'wb') as printer:
                printer.write(decoded_data)
            
            logger.info(f"Print successful to {device_path}")
            
            return jsonify({
                'success': True,
                'message': 'Print job sent successfully',
                'device': device_path,
                'bytes_sent': len(decoded_data)
            })
            
        except PermissionError:
            logger.error(f"Permission denied for {device_path}")
            return jsonify({
                'success': False,
                'error': f'Permission denied. Run: sudo chmod 666 {device_path}'
            }), 403
    
    except Exception as e:
        logger.error(f"USB print error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/print/bluetooth', methods=['POST'])
def print_bluetooth():
    """
    Print to Bluetooth thermal printer
    
    Request JSON:
    {
        "device_address": "00:11:22:33:44:55",  # MAC address
        "device_name": "TM-P20",  # Optional, for discovery
        "data": "base64_encoded_escpos_data"
    }
    
    Note: Requires pybluez library
    """
    try:
        # Check if bluetooth module is available
        try:
            import bluetooth
        except ImportError:
            return jsonify({
                'success': False,
                'error': 'Bluetooth support not installed. Run: pip install pybluez'
            }), 501
        
        data = request.get_json()
        
        device_address = data.get('device_address')
        device_name = data.get('device_name')
        print_data = data.get('data')
        
        if not print_data:
            return jsonify({
                'success': False,
                'error': 'data is required'
            }), 400
        
        # Decode base64 data
        try:
            decoded_data = base64.b64decode(print_data)
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid base64 data: {str(e)}'
            }), 400
        
        # If device name provided but no address, try to discover
        if not device_address and device_name:
            logger.info(f"Discovering Bluetooth device: {device_name}")
            nearby_devices = bluetooth.discover_devices(lookup_names=True)
            
            for addr, name in nearby_devices:
                if device_name.lower() in name.lower():
                    device_address = addr
                    logger.info(f"Found device: {name} at {addr}")
                    break
            
            if not device_address:
                return jsonify({
                    'success': False,
                    'error': f'Bluetooth device "{device_name}" not found. Available devices: {nearby_devices}'
                }), 404
        
        if not device_address:
            return jsonify({
                'success': False,
                'error': 'device_address or device_name is required'
            }), 400
        
        # Connect to Bluetooth printer (SPP - Serial Port Profile)
        logger.info(f"Connecting to Bluetooth printer: {device_address}")
        
        try:
            # Find SPP service
            services = bluetooth.find_service(address=device_address)
            
            if not services:
                return jsonify({
                    'success': False,
                    'error': f'No services found for device {device_address}. Make sure printer is paired.'
                }), 404
            
            # Use first SPP service
            spp_service = None
            for service in services:
                if "Serial" in service.get("name", "") or service.get("protocol") == "RFCOMM":
                    spp_service = service
                    break
            
            if not spp_service:
                spp_service = services[0]  # Fallback to first service
            
            host = spp_service["host"]
            port = spp_service["port"]
            
            # Create socket and connect
            sock = bluetooth.BluetoothSocket(bluetooth.RFCOMM)
            sock.connect((host, port))
            
            # Send data
            sock.send(decoded_data)
            sock.close()
            
            logger.info(f"Print successful to Bluetooth device {device_address}")
            
            return jsonify({
                'success': True,
                'message': 'Print job sent successfully',
                'device': device_address,
                'service': spp_service.get('name', 'Unknown'),
                'bytes_sent': len(decoded_data)
            })
            
        except bluetooth.BluetoothError as e:
            logger.error(f"Bluetooth error: {str(e)}")
            return jsonify({
                'success': False,
                'error': f'Bluetooth connection error: {str(e)}'
            }), 500
    
    except Exception as e:
        logger.error(f"Bluetooth print error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/discover/bluetooth', methods=['GET'])
def discover_bluetooth():
    """
    Discover nearby Bluetooth devices
    
    Returns list of available Bluetooth devices
    """
    try:
        try:
            import bluetooth
        except ImportError:
            return jsonify({
                'success': False,
                'error': 'Bluetooth support not installed. Run: pip install pybluez'
            }), 501
        
        logger.info("Discovering Bluetooth devices...")
        
        nearby_devices = bluetooth.discover_devices(lookup_names=True, duration=8)
        
        devices = []
        for addr, name in nearby_devices:
            devices.append({
                'address': addr,
                'name': name
            })
        
        logger.info(f"Found {len(devices)} Bluetooth devices")
        
        return jsonify({
            'success': True,
            'devices': devices,
            'count': len(devices)
        })
    
    except Exception as e:
        logger.error(f"Bluetooth discovery error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/test/network', methods=['POST'])
def test_network():
    """Test network printer connectivity"""
    try:
        data = request.get_json()
        printer_ip = data.get('printer_ip')
        printer_port = data.get('printer_port', DEFAULT_PRINTER_PORT)
        
        if not printer_ip:
            return jsonify({'success': False, 'error': 'printer_ip required'}), 400
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        
        result = sock.connect_ex((printer_ip, int(printer_port)))
        sock.close()
        
        if result == 0:
            return jsonify({
                'success': True,
                'message': f'Printer {printer_ip}:{printer_port} is reachable'
            })
        else:
            return jsonify({
                'success': False,
                'error': f'Cannot connect to {printer_ip}:{printer_port}'
            }), 500
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PRINT_BRIDGE_PORT', DEFAULT_PORT))
    
    logger.info("=" * 60)
    logger.info("IMOGI POS - Thermal Printer Bridge")
    logger.info("=" * 60)
    logger.info(f"Starting server on http://localhost:{port}")
    logger.info("Supported printers:")
    logger.info("  - Network thermal printers (TCP/IP)")
    logger.info("  - USB thermal printers")
    logger.info("  - Bluetooth thermal printers")
    logger.info("=" * 60)
    logger.info("Endpoints:")
    logger.info(f"  Health Check: http://localhost:{port}/health")
    logger.info(f"  Network Print: http://localhost:{port}/print/network")
    logger.info(f"  USB Print: http://localhost:{port}/print/usb")
    logger.info(f"  Bluetooth Print: http://localhost:{port}/print/bluetooth")
    logger.info(f"  BT Discovery: http://localhost:{port}/discover/bluetooth")
    logger.info("=" * 60)
    
    try:
        app.run(
            host='0.0.0.0',  # Allow connections from network
            port=port,
            debug=False,
            threaded=True
        )
    except KeyboardInterrupt:
        logger.info("\nShutting down Print Bridge...")
    except Exception as e:
        logger.error(f"Server error: {str(e)}")
        sys.exit(1)
