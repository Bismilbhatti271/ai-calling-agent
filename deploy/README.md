# Empire-X — DigitalOcean Deployment Guide

## Step 1: Create the Droplet

1. Log into **DigitalOcean** → **Create Droplet**
2. Choose:
   - **Ubuntu 22.04 LTS** (or 24.04)
   - **Basic Plan**
   - **$12/mo** (2 vCPU, 2GB RAM) — *minimum for AI calls*
   - **$24/mo** (2 vCPU, 4GB RAM) — *recommended*
   - **$48/mo** (4 vCPU, 8GB RAM) — *if running many calls*
3. Add **SSH key** (recommended) or use **root password**
4. Set hostname: `empirex`
5. Click **Create Droplet**

---

## Step 2: Copy Your Project to the Server

### Option A: Using SCP (simplest)

From your **local Windows machine** (PowerShell):

```powershell
# Copy entire project to server
scp -r "C:\Users\Mega Providers\Desktop\dialer data\*" root@YOUR_SERVER_IP:/root/project-source/
```

### Option B: Using Git

```bash
# On your local machine, push to a private GitHub repo
# Then clone on the server:
git clone https://github.com/YOUR_USER/empirex.git /root/project-source
```

---

## Step 3: SSH Into the Server

```bash
ssh root@YOUR_SERVER_IP
```

---

## Step 4: Run the Setup Script

```bash
cd /root/project-source/deploy
chmod +x setup-server.sh
./setup-server.sh
```

The script will ask you:
1. **Domain name** — e.g., `empirex.yourdomain.com` (point your domain's DNS A record to the server IP first)
2. **Email for SSL** — e.g., `you@email.com`

Then it does everything automatically.

---

## Step 5: Point Your Domain

Before the SSL step works, make sure your domain's **DNS A record** points to your droplet's IP address:

| Type | Name | Value |
|------|------|-------|
| A | `empirex` | `YOUR_DROPLET_IP` |

Wait 5-10 minutes for DNS to propagate.

---

## Step 6: Access Your Dashboard

Open your browser and go to:

```
https://empirex.yourdomain.com
```

Login with the default credentials:
> **Email:** mzainbhatti538@gmail.com  
> **Password:** zynu@123

---

## Managing the Server

### Check Service Status
```bash
systemctl status empirex-tts       # TTS server (port 8000)
systemctl status empirex-backend   # Backend API (port 8002)
systemctl status empirex-frontend  # Frontend (port 3000)
systemctl status empirex-agi       # VICIdial AGI (port 4573) — only if using VICIdial
```

### View Logs
```bash
tail -f /home/empirex/empirex/logs/tts.log
tail -f /home/empirex/empirex/logs/backend.log
tail -f /home/empirex/empirex/logs/frontend.log
tail -f /home/empirex/empirex/logs/agi.log
```

### Restart a Service
```bash
systemctl restart empirex-backend
systemctl restart empirex-frontend
systemctl restart empirex-tts
```

### Deploy Updates
```bash
# Copy new files to the server
scp -r "C:\path\to\new\files\*" root@YOUR_SERVER_IP:/root/project-source/

# On the server, copy to app directory and restart
cp -r /root/project-source/backend/* /home/empirex/empirex/backend/
cp -r /root/project-source/* /home/empirex/empirex/frontend/
rm -rf /home/empirex/empirex/frontend/backend

# Rebuild frontend
cd /home/empirex/empirex/frontend
npm install
npm run build

# Restart services
systemctl restart empirex-backend
systemctl restart empirex-frontend
```

### Database
The SQLite database is at:
```
/home/empirex/empirex/backend/dashboard.db
```

**Backup command:**
```bash
cp /home/empirex/empirex/backend/dashboard.db /home/empirex/empirex/backend/dashboard.db.backup
```

---

## Architecture

```
                         ┌─────────────────┐
                         │    DigitalOcean  │
                         │    (Ubuntu 22)   │
                         └────────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼────┐ ┌─────▼────┐ ┌──────▼─────┐
              │  Nginx    │ │  Nginx   │ │   Nginx    │
              │  Port 80  │ │ Port 443 │ │  (SSL)     │
              │  (HTTP)   │ │ (HTTPS)  │ │            │
              └─────┬────┘ └─────┬────┘ └──────┬─────┘
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼────┐ ┌─────▼────┐ ┌──────▼─────┐
              │  Next.js  │ │ FastAPI  │ │ Edge-TTS   │
              │  Port 3000│ │ Port 8002│ │ Port 8000  │
              │ (Frontend)│ │(Backend) │ │ (TTS)      │
              └───────────┘ └────┬─────┘ └────────────┘
                                 │
                          ┌──────▼──────┐
                          │   SQLite    │
                          │ dashboard.db│
                          └─────────────┘
```
