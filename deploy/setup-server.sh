#!/bin/bash
#===============================================================================
# Empire-X AI Calling Platform — Complete DigitalOcean Deployment Script
# Run this on a fresh Ubuntu 22.04/24.04 droplet as root
#===============================================================================
# USAGE:
#   1. Copy your project to the server (or clone from git)
#   2. SSH into the droplet as root
#   3. Run: chmod +x setup-server.sh && ./setup-server.sh
#   4. Follow the prompts for your domain name
#===============================================================================

set -e

# ─── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Empire-X AI Calling Platform — Server Setup         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Configuration ────────────────────────────────────────────────────
read -p "$(echo -e $YELLOW"Enter your domain name (e.g., empirex.yourdomain.com): "$NC)" DOMAIN
read -p "$(echo -e $YELLOW"Enter your email for SSL certificate: "$NC)" SSL_EMAIL

APP_USER="empirex"
APP_DIR="/home/$APP_USER/empirex"
BACKEND_DIR="$APP_DIR/backend"
PROJECT_DIR="/root/project-source"  # Where you'll upload the project first

# ─── Step 1: System Updates & Dependencies ────────────────────────────
echo -e "\n${GREEN}[1/10] Installing system dependencies...${NC}"

apt-get update -y
apt-get upgrade -y
apt-get install -y \
    curl wget git nginx certbot python3-certbot-nginx \
    python3-pip python3-venv python3-dev \
    build-essential portaudio19-dev \
    ffmpeg \
    ufw \
    nano

# ─── Step 2: Create Dedicated User ────────────────────────────────────
echo -e "\n${GREEN}[2/10] Creating application user...${NC}"

if ! id -u $APP_USER &>/dev/null; then
    useradd -m -s /bin/bash $APP_USER
    echo -e "Created user: $APP_USER"
else
    echo -e "User $APP_USER already exists"
fi

mkdir -p $APP_DIR
mkdir -p $APP_DIR/frontend
mkdir -p $APP_DIR/backend
mkdir -p $APP_DIR/logs

# ─── Step 3: Install Node.js 22 LTS ───────────────────────────────────
echo -e "\n${GREEN}[3/10] Installing Node.js 22 LTS...${NC}"

if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
    echo -e "Node.js $(node -v) installed"
    echo -e "npm $(npm -v) installed"
else
    echo -e "Node.js $(node -v) already installed"
fi

# ─── Step 4: Install Python Requirements ──────────────────────────────
echo -e "\n${GREEN}[4/10] Installing Python dependencies...${NC}"

python3 -m venv $APP_DIR/venv
source $APP_DIR/venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install backend requirements
if [ -f "$PROJECT_DIR/backend/requirements.txt" ]; then
    pip install -r "$PROJECT_DIR/backend/requirements.txt"
else
    pip install fastapi uvicorn pydantic python-dotenv groq edge-tts sounddevice soundfile scipy numpy requests python-multipart aiohttp
fi

echo -e "Python packages installed"

# ─── Step 5: Copy Project Files ───────────────────────────────────────
echo -e "\n${GREEN}[5/10] Copying project files...${NC}"

if [ -d "$PROJECT_DIR" ]; then
    # Copy backend
    cp -r "$PROJECT_DIR/backend/"* "$APP_DIR/backend/"
    # Copy frontend
    cp -r "$PROJECT_DIR/"* "$APP_DIR/frontend/"
    rm -rf "$APP_DIR/frontend/backend"  # Remove backend from frontend dir
    rm -rf "$APP_DIR/frontend/deploy"   # Remove deploy folder
    rm -rf "$APP_DIR/frontend/node_modules"  # Fresh install
    echo -e "Project files copied from $PROJECT_DIR"
else
    echo -e "${YELLOW}WARNING: $PROJECT_DIR not found. You'll need to copy files manually.${NC}"
    echo -e "Create the directory and copy your project files, then re-run this script."
    mkdir -p $PROJECT_DIR
fi

# Ensure logs directory exists in backend
mkdir -p $APP_DIR/backend/logs

# Fix permissions
chown -R $APP_USER:$APP_USER $APP_DIR

# ─── Step 6: Build Frontend ───────────────────────────────────────────
echo -e "\n${GREEN}[6/10] Installing frontend dependencies & building...${NC}"

cd $APP_DIR/frontend

if [ -f "package.json" ]; then
    # Install dependencies
    su - $APP_USER -c "cd $APP_DIR/frontend && npm install" 2>&1 | tail -5
    echo -e "Frontend dependencies installed"

    # Build
    su - $APP_USER -c "cd $APP_DIR/frontend && npm run build" 2>&1 | tail -10
    echo -e "Frontend built successfully"
else
    echo -e "${RED}ERROR: package.json not found in $APP_DIR/frontend${NC}"
    exit 1
fi

# ─── Step 7: Create Environment File ──────────────────────────────────
echo -e "\n${GREEN}[7/10] Creating environment configuration...${NC}"

# Frontend env
cat > "$APP_DIR/frontend/.env.local" << EOF
NEXT_PUBLIC_API_URL=http://localhost:8002/api
NEXT_PUBLIC_API_BASE=http://localhost:8002/api
NEXT_PUBLIC_APP_URL=https://$DOMAIN
EOF

chown $APP_USER:$APP_USER "$APP_DIR/frontend/.env.local"

echo -e "Environment files created"

# ─── Step 8: Create Systemd Service Files ─────────────────────────────
echo -e "\n${GREEN}[8/10] Creating systemd services...${NC}"

# ── TTS Server (port 8000) ──
cat > /etc/systemd/system/empirex-tts.service << 'EOF'
[Unit]
Description=Empire-X TTS Server (Edge-TTS)
After=network.target

[Service]
Type=simple
User=empirex
WorkingDirectory=/home/empirex/empirex/backend
ExecStart=/home/empirex/empirex/venv/bin/python tts_server.py
Restart=always
RestartSec=5
StandardOutput=append:/home/empirex/empirex/logs/tts.log
StandardError=append:/home/empirex/empirex/logs/tts.log

[Install]
WantedBy=multi-user.target
EOF

# ── Backend API (port 8002) ──
cat > /etc/systemd/system/empirex-backend.service << 'EOF'
[Unit]
Description=Empire-X Backend API (FastAPI)
After=network.target empirex-tts.service
Requires=empirex-tts.service

[Service]
Type=simple
User=empirex
WorkingDirectory=/home/empirex/empirex/backend
ExecStart=/home/empirex/empirex/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8002 --workers 2
Restart=always
RestartSec=5
StandardOutput=append:/home/empirex/empirex/logs/backend.log
StandardError=append:/home/empirex/empirex/logs/backend.log

[Install]
WantedBy=multi-user.target
EOF

# ── Frontend (port 3000) ──
cat > /etc/systemd/system/empirex-frontend.service << 'EOF'
[Unit]
Description=Empire-X Frontend (Next.js)
After=network.target empirex-backend.service
Requires=empirex-backend.service

[Service]
Type=simple
User=empirex
WorkingDirectory=/home/empirex/empirex/frontend
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
StandardOutput=append:/home/empirex/empirex/logs/frontend.log
StandardError=append:/home/empirex/empirex/logs/frontend.log

[Install]
WantedBy=multi-user.target
EOF

# ── AGI Handler (optional, for VICIdial) ──
cat > /etc/systemd/system/empirex-agi.service << 'EOF'
[Unit]
Description=Empire-X FastAGI Server (VICIdial Bridge)
After=network.target empirex-backend.service
Requires=empirex-backend.service

[Service]
Type=simple
User=empirex
WorkingDirectory=/home/empirex/empirex/backend
ExecStart=/home/empirex/empirex/venv/bin/python agi_handler.py --mode fastagi
Restart=always
RestartSec=5
StandardOutput=append:/home/empirex/empirex/logs/agi.log
StandardError=append:/home/empirex/empirex/logs/agi.log

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
systemctl daemon-reload

echo -e "Systemd services created"

# ─── Step 9: Configure Nginx + SSL ────────────────────────────────────
echo -e "\n${GREEN}[9/10] Configuring Nginx reverse proxy...${NC}"

# Remove default nginx site
rm -f /etc/nginx/sites-enabled/default

# Create nginx config
cat > /etc/nginx/sites-available/empirex << 'EOF'
server {
    listen 80;
    server_name _;

    # ── Frontend (Next.js) ──
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # ── API (Backend) ──
    location /api/ {
        proxy_pass http://127.0.0.1:8002/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeout for long-running AI calls
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # ── WebSocket support (for live chat) ──
    location /ws/ {
        proxy_pass http://127.0.0.1:8002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }
}
EOF

# Replace _ with actual domain
sed -i "s/server_name _;/server_name $DOMAIN;/" /etc/nginx/sites-available/empirex

# Enable site
ln -sf /etc/nginx/sites-available/empirex /etc/nginx/sites-enabled/empirex

# Test nginx config
nginx -t

# Restart nginx
systemctl restart nginx

echo -e "Nginx configured"

# ─── SSL Certificate ──────────────────────────────────────────────────
echo -e "\n${GREEN}[*] Obtaining SSL certificate...${NC}"

if [ "$DOMAIN" != "your-domain.com" ] && [ -n "$SSL_EMAIL" ]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL"
    echo -e "SSL certificate obtained for $DOMAIN"
else
    echo -e "${YELLOW}SSL: Skipping — run manually later: certbot --nginx -d yourdomain.com${NC}"
fi

# ─── Step 10: Configure Firewall ──────────────────────────────────────
echo -e "\n${GREEN}[10/10] Configuring firewall...${NC}"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

echo -e "Firewall configured (SSH, HTTP, HTTPS allowed)"

# ─── Start Services ───────────────────────────────────────────────────
echo -e "\n${GREEN}[*] Starting all services...${NC}"

systemctl enable empirex-tts
systemctl enable empirex-backend
systemctl enable empirex-frontend

systemctl start empirex-tts
sleep 2
systemctl start empirex-backend
sleep 2
systemctl start empirex-frontend

# ─── Status Check ─────────────────────────────────────────────────────
echo -e "\n${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e ""
echo -e "  ${GREEN}Frontend:${NC}  https://$DOMAIN"
echo -e "  ${GREEN}Backend:${NC}   http://127.0.0.1:8002/api/health"
echo -e "  ${GREEN}TTS:${NC}       http://127.0.0.1:8000/voices"
echo -e ""
echo -e "  ${YELLOW}Service Status:${NC}"
systemctl status empirex-tts --no-pager -l | head -3
systemctl status empirex-backend --no-pager -l | head -3
systemctl status empirex-frontend --no-pager -l | head -3
echo -e ""
echo -e "  ${YELLOW}Logs:${NC}  tail -f /home/empirex/empirex/logs/*.log"
echo -e "  ${YELLOW}Restart:${NC}  systemctl restart empirex-backend"
echo -e "  ${YELLOW}Update:${NC}   Copy new files, then systemctl restart empirex-*"
echo -e ""
