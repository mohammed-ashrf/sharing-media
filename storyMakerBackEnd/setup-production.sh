#!/bin/bash

# StoryMaker Media System - Production Deployment Script
# This script sets up the media system for production deployment

set -e  # Exit on any error

echo "🚀 StoryMaker Media System - Production Setup"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js 16+ is required. Current version: $(node -v)"
    exit 1
fi

print_status "Node.js version: $(node -v)"

# Create necessary directories
echo ""
print_info "Creating upload directories..."
mkdir -p uploads/media
mkdir -p uploads/thumbnails
mkdir -p uploads/temp
mkdir -p logs

# Set proper permissions for upload directories
chmod 755 uploads/
chmod 755 uploads/media/
chmod 755 uploads/thumbnails/
chmod 755 uploads/temp/

print_status "Upload directories created with proper permissions"

# Install dependencies
echo ""
print_info "Installing dependencies..."
npm ci --production

print_status "Dependencies installed"

# Check for required environment variables
echo ""
print_info "Checking environment configuration..."

if [ ! -f ".env" ]; then
    print_warning ".env file not found. Copying from .env.example..."
    cp .env.example .env
    print_info "Please edit .env file with your production values"
fi

# Check critical environment variables
REQUIRED_VARS=("JWT_SECRET" "MONGODB_URI")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^$var=" .env 2>/dev/null || grep -q "^$var=$" .env 2>/dev/null; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    print_warning "Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
fi

# Check optional but recommended variables
OPTIONAL_VARS=("PEXELS_API_KEY" "PIXABAY_API_KEY" "OPENAI_API_KEY")
MISSING_OPTIONAL=()

for var in "${OPTIONAL_VARS[@]}"; do
    if ! grep -q "^$var=" .env 2>/dev/null || grep -q "^$var=$" .env 2>/dev/null; then
        MISSING_OPTIONAL+=("$var")
    fi
done

if [ ${#MISSING_OPTIONAL[@]} -ne 0 ]; then
    print_info "Optional API keys not configured (will use mock data):"
    for var in "${MISSING_OPTIONAL[@]}"; do
        echo "  - $var"
    done
fi

# Test database connection
echo ""
print_info "Testing database connection..."
node -e "
const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/storymaker')
  .then(() => {
    console.log('✅ Database connection successful');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });
" && print_status "Database connection verified" || print_error "Database connection failed"

# Check if FFmpeg is installed (optional for video processing)
echo ""
print_info "Checking for FFmpeg (optional for advanced video processing)..."
if command -v ffmpeg &> /dev/null; then
    print_status "FFmpeg found: $(ffmpeg -version | head -1)"
else
    print_warning "FFmpeg not found. Install for advanced video processing features"
    print_info "Ubuntu/Debian: sudo apt install ffmpeg"
    print_info "CentOS/RHEL: sudo yum install ffmpeg"
    print_info "macOS: brew install ffmpeg"
fi

# Create systemd service file (Linux)
if [ -f "/etc/systemd/system/" ] 2>/dev/null; then
    echo ""
    print_info "Creating systemd service file..."
    
    sudo tee /etc/systemd/system/storymaker-media.service > /dev/null <<EOF
[Unit]
Description=StoryMaker Media API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node src/app.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$(pwd)

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    print_status "Systemd service file created: /etc/systemd/system/storymaker-media.service"
    print_info "Start with: sudo systemctl start storymaker-media"
    print_info "Enable auto-start: sudo systemctl enable storymaker-media"
fi

# Setup log rotation
echo ""
print_info "Setting up log rotation..."
if [ -f "/etc/logrotate.d/" ] 2>/dev/null; then
    sudo tee /etc/logrotate.d/storymaker-media > /dev/null <<EOF
$(pwd)/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
}
EOF
    print_status "Log rotation configured"
fi

# Performance recommendations
echo ""
print_info "Performance Recommendations:"
echo "  • Use PM2 for process management: npm install -g pm2"
echo "  • Setup nginx as reverse proxy"
echo "  • Configure SSL/TLS certificates"
echo "  • Setup monitoring (Prometheus/Grafana)"
echo "  • Use CDN for static file delivery"
echo "  • Configure Redis for caching"

# Security recommendations
echo ""
print_info "Security Recommendations:"
echo "  • Enable firewall (ufw enable)"
echo "  • Configure fail2ban"
echo "  • Regular security updates"
echo "  • Use strong JWT secrets"
echo "  • Enable rate limiting"
echo "  • Regular backup procedures"

# Final checks
echo ""
print_info "Running final system check..."

# Check if server starts
timeout 10s node -e "
require('./src/app.js');
setTimeout(() => {
  console.log('✅ Server starts successfully');
  process.exit(0);
}, 3000);
" 2>/dev/null && print_status "Server startup test passed" || print_warning "Server startup test failed - check logs"

echo ""
echo "============================================="
print_status "StoryMaker Media System setup complete!"
echo ""
print_info "Next steps:"
echo "  1. Review and update .env file with your production values"
echo "  2. Configure external API keys (Pexels, Pixabay)"
echo "  3. Setup reverse proxy (nginx)"
echo "  4. Configure SSL certificates"
echo "  5. Start the server: npm start"
echo ""
print_info "For documentation, see: MEDIA_SYSTEM.md"
echo "============================================="
