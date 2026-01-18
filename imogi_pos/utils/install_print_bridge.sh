#!/bin/bash
###############################################################################
# IMOGI POS Print Bridge - Auto Installation Script
# Untuk Linux/Mac
###############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/imogi-pos/print-bridge"
SERVICE_NAME="imogi-print-bridge"
PYTHON_CMD="python3"

# Functions
print_header() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then 
        print_error "Please run as root or with sudo"
        exit 1
    fi
}

detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        print_info "Detected OS: Linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="mac"
        print_info "Detected OS: macOS"
    else
        print_error "Unsupported OS: $OSTYPE"
        exit 1
    fi
}

check_python() {
    print_info "Checking Python installation..."
    
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
        print_success "Python 3 found: $PYTHON_VERSION"
    else
        print_error "Python 3 not found"
        print_info "Installing Python 3..."
        
        if [ "$OS" == "linux" ]; then
            apt-get update
            apt-get install -y python3 python3-pip
        elif [ "$OS" == "mac" ]; then
            brew install python@3.11
        fi
    fi
}

install_system_deps() {
    print_header "Installing System Dependencies"
    
    if [ "$OS" == "linux" ]; then
        print_info "Installing Linux dependencies..."
        apt-get update
        apt-get install -y \
            python3-pip \
            libbluetooth-dev \
            bluez \
            python3-dev \
            build-essential
        print_success "System dependencies installed"
    
    elif [ "$OS" == "mac" ]; then
        print_info "Installing macOS dependencies..."
        
        # Check if Homebrew is installed
        if ! command -v brew &> /dev/null; then
            print_warning "Homebrew not found. Installing..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        
        brew install python@3.11 bluez
        print_success "System dependencies installed"
    fi
}

create_install_dir() {
    print_header "Creating Installation Directory"
    
    mkdir -p "$INSTALL_DIR"
    print_success "Directory created: $INSTALL_DIR"
}

install_python_deps() {
    print_header "Installing Python Dependencies"
    
    # Create requirements file if not exists
    cat > "$INSTALL_DIR/requirements.txt" << 'EOF'
flask>=2.3.0
flask-cors>=4.0.0
pyserial>=3.5
EOF

    # Add bluetooth for non-Windows
    if [ "$OS" != "windows" ]; then
        echo "pybluez>=0.23" >> "$INSTALL_DIR/requirements.txt"
    fi
    
    print_info "Installing Python packages..."
    pip3 install -r "$INSTALL_DIR/requirements.txt"
    print_success "Python dependencies installed"
}

copy_files() {
    print_header "Copying Application Files"
    
    # Check if print_bridge.py exists in current directory
    if [ -f "print_bridge.py" ]; then
        cp print_bridge.py "$INSTALL_DIR/"
        print_success "print_bridge.py copied"
    else
        print_error "print_bridge.py not found in current directory"
        print_info "Please copy print_bridge.py to $(pwd)"
        exit 1
    fi
    
    # Make executable
    chmod +x "$INSTALL_DIR/print_bridge.py"
}

create_systemd_service() {
    print_header "Creating Systemd Service"
    
    # Get non-root user for service
    if [ -n "$SUDO_USER" ]; then
        SERVICE_USER="$SUDO_USER"
    else
        SERVICE_USER="root"
    fi
    
    cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=IMOGI POS Print Bridge Service
After=network.target bluetooth.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/print_bridge.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
Environment="PRINT_BRIDGE_PORT=5555"

[Install]
WantedBy=multi-user.target
EOF

    print_success "Systemd service created"
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable service
    print_info "Enabling service to start on boot..."
    systemctl enable "$SERVICE_NAME"
    print_success "Service enabled"
    
    # Start service
    print_info "Starting service..."
    systemctl start "$SERVICE_NAME"
    sleep 2
    
    # Check status
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "Service started successfully"
    else
        print_error "Service failed to start"
        systemctl status "$SERVICE_NAME"
    fi
}

create_launchd_service() {
    print_header "Creating LaunchAgent Service"
    
    # Get current user
    CURRENT_USER=$(logname)
    LAUNCH_AGENTS_DIR="/Users/$CURRENT_USER/Library/LaunchAgents"
    
    mkdir -p "$LAUNCH_AGENTS_DIR"
    
    cat > "$LAUNCH_AGENTS_DIR/com.imogi.printbridge.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.imogi.printbridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/python3</string>
        <string>${INSTALL_DIR}/print_bridge.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/imogi-printbridge.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/imogi-printbridge-error.log</string>
</dict>
</plist>
EOF

    # Set ownership
    chown "$CURRENT_USER" "$LAUNCH_AGENTS_DIR/com.imogi.printbridge.plist"
    
    print_success "LaunchAgent created"
    
    # Load service
    print_info "Loading service..."
    sudo -u "$CURRENT_USER" launchctl load "$LAUNCH_AGENTS_DIR/com.imogi.printbridge.plist"
    sleep 2
    
    print_success "Service loaded"
}

test_installation() {
    print_header "Testing Installation"
    
    print_info "Waiting for service to start..."
    sleep 3
    
    # Test health endpoint
    print_info "Testing health endpoint..."
    if curl -s http://localhost:5555/health | grep -q "ok"; then
        print_success "Print Bridge is running!"
        echo ""
        curl -s http://localhost:5555/health | python3 -m json.tool
    else
        print_error "Print Bridge is not responding"
        print_info "Check logs:"
        if [ "$OS" == "linux" ]; then
            echo "  sudo journalctl -u $SERVICE_NAME -f"
        elif [ "$OS" == "mac" ]; then
            echo "  tail -f /tmp/imogi-printbridge.log"
        fi
        exit 1
    fi
}

print_summary() {
    print_header "Installation Complete!"
    
    echo -e "${GREEN}✓ Print Bridge installed successfully${NC}"
    echo ""
    echo "Installation Details:"
    echo "  • Installation Directory: $INSTALL_DIR"
    echo "  • Service Name: $SERVICE_NAME"
    echo "  • Endpoint: http://localhost:5555"
    echo ""
    echo "Service Management:"
    
    if [ "$OS" == "linux" ]; then
        echo "  • Start:   sudo systemctl start $SERVICE_NAME"
        echo "  • Stop:    sudo systemctl stop $SERVICE_NAME"
        echo "  • Restart: sudo systemctl restart $SERVICE_NAME"
        echo "  • Status:  sudo systemctl status $SERVICE_NAME"
        echo "  • Logs:    sudo journalctl -u $SERVICE_NAME -f"
    elif [ "$OS" == "mac" ]; then
        echo "  • Start:   launchctl load ~/Library/LaunchAgents/com.imogi.printbridge.plist"
        echo "  • Stop:    launchctl unload ~/Library/LaunchAgents/com.imogi.printbridge.plist"
        echo "  • Logs:    tail -f /tmp/imogi-printbridge.log"
    fi
    
    echo ""
    echo "Next Steps:"
    echo "  1. Configure printer in POS browser:"
    echo "     Tools → Printer Settings"
    echo "  2. Test print to verify setup"
    echo ""
    echo -e "${BLUE}Documentation: PRINTING_SETUP_GUIDE.md${NC}"
    echo ""
}

# Main installation flow
main() {
    print_header "IMOGI POS Print Bridge Installer"
    
    # Pre-checks
    check_root
    detect_os
    check_python
    
    # Installation steps
    install_system_deps
    create_install_dir
    copy_files
    install_python_deps
    
    # Service setup
    if [ "$OS" == "linux" ]; then
        create_systemd_service
    elif [ "$OS" == "mac" ]; then
        create_launchd_service
    fi
    
    # Post-installation
    test_installation
    print_summary
}

# Run installer
main
