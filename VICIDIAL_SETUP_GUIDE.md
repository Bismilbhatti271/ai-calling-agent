# Empire-X AI + VICIdial Integration — Setup Guide for Client

## Give This Document to Your VICIdial Admin

This guide explains how to connect your **VICIdial** system to our **Empire-X AI Calling Agent**.  
The AI will handle answered calls automatically, and transfer qualified leads to your human agents.

---

## Table of Contents

1. [What We're Building](#1-what-were-building)
2. [Prerequisites](#2-prerequisites)
3. [Step 1: Create a Non-Admin API User](#3-step-1-create-a-non-admin-api-user)
4. [Step 2: Create the AI Agent](#4-step-2-create-the-ai-agent)
5. [Step 3: Set Up the Campaign](#5-step-3-set-up-the-campaign)
6. [Step 4: Set Up the Human Agent Queue](#6-step-4-set-up-the-human-agent-queue)
7. [Step 5: Configure Network Access](#7-step-5-configure-network-access)
8. [Step 6: Install the AGI Dialplan](#8-step-6-install-the-agi-dialplan)
9. [Step 7: Configure VICIdial Server for AGI](#9-step-7-configure-vicidial-server-for-agi)
10. [Step 8: Upload Leads & Go Live](#10-step-8-upload-leads--go-live)
11. [Troubleshooting](#11-troubleshooting)
12. [Credentials Sheet](#12-credentials-sheet)

---

## 1. What We're Building

```
   VICIdial Server                    Empire-X Server
  ┌─────────────────┐               ┌─────────────────────┐
  │                 │               │                     │
  │  1. Auto-dials  │               │  4. AI Agent talks  │
  │     leads ──────┼───AGI(4573)───┼──to lead via TTS    │
  │                 │               │                     │
  │  2. Call answered               │  5. Groq LLM        │
  │     → AGI script│               │     processes       │
  │                 │               │     conversation    │
  │  3. Forwards to │               │                     │
  │     AI agent    │               │  6. If qualified    │
  │                 │               │     → Transfer back │
  │  7. Human agent◄┼────Transfer───┼──to VICIdial queue  │
  │     takes over  │               │                     │
  └─────────────────┘               └─────────────────────┘
```

**The flow:**
1. VICIdial auto-dials a lead from your list
2. When someone answers, Asterisk runs our AGI script
3. The AGI script connects the call to Empire-X AI
4. Our AI agent talks to the lead naturally (Groq LLM + TTS)
5. If the lead qualifies (age 50-80), the AI requests a transfer
6. The call is transferred to your human agent queue
7. A real human agent picks up and closes the deal

**Leads that don't qualify** (not interested, wrong age) are politely ended  
and marked with the appropriate disposition in VICIdial.

---

## 2. Prerequisites

- ✅ You have **admin access** to your VICIdial web interface
- ✅ You have **SSH access** (or console access) to your VICIdial server
- ✅ Your VICIdial server can reach the Empire-X server on **port 4573** (TCP)
- ✅ Your VICIdial version is **2.14 or later** (almost any version works)
- ✅ Estimated time: **30-45 minutes**

---

## 3. Step 1: Create a Non-Admin API User

This user allows Empire-X to communicate with VICIdial programmatically.

**In VICIdial Admin:**

1. Go to **Admin** → **Users** → **Non-Admin API Users**
2. Click **Add New User**
3. Fill in:

   | Field | Value |
   |-------|-------|
   | **User** | `empirex_api` |
   | **Password** | `EmpireX@2024!` (or any strong password) |
   | **Admin Level** | `NONE` |
   | **User Level** | `6` (or any level with API access) |

4. Click **Submit**

✅ **Send Us:** The API URL, username, and password

---

## 4. Step 2: Create the AI Agent

The AI needs to exist as an agent in VICIdial.

**In VICIdial Admin:**

1. Go to **Admin** → **Agents** → **Add New Agent**
2. Fill in:

   | Field | Value |
   |-------|-------|
   | **Agent ID / User** | `AI_AGENT_01` |
   | **Password** | `AI_Agent_Pass!` (or any password) |
   | **Full Name** | `Empire-X AI Agent` |
   | **Campaign** | Leave blank (will assign in next step) |
   | **Agent Level** | `1` (default) |

3. Click **Submit**

✅ **Send Us:** The agent username and password

---

## 5. Step 3: Set Up the Campaign

Create or modify a campaign where the AI handles calls.

**In VICIdial Admin:**

1. Go to **Admin** → **Campaigns** → **Add New Campaign**
2. Fill in:

   | Field | Value |
   |-------|-------|
   | **Campaign ID** | `AI_CAMPAIGN` |
   | **Campaign Name** | `Empire-X AI Outreach` |
   | **Campaign Description** | `AI handles initial screening, transfers qualified leads` |
   | **Campaign Status** | `ACTIVE` |
   | **Dial Method** | `RATIO` (recommended) or `ADAPT_HARDEST` |
   | **Auto Dial Level** | Start with `1:1` (1 line), increase later |
   | **Lead Order** | `DOWN` (oldest first) |
   | **Agent Assigned** | `AI_AGENT_01` (the AI agent we just created) |

3. **Important — Dialing Settings:**

   | Setting | Recommended Value |
   |---------|------------------|
   | **Dial Timeout** | `60` seconds |
   | **Answer Machine Detection** | `ENABLED` |
   | **AMD Max Wait Time** | `5000` ms |
   | **Drop Inbound Calls** | `NO` |
   | **Wait For Agent Mode** | `NONE` (AI is always ready) |

4. Click **Submit**

**OPTIONAL — Upload leads now** if you already have them:
- Go to **Lists** → **Add List** → Associate with this campaign → Upload CSV

✅ **Send Us:** The campaign ID

---

## 6. Step 4: Set Up the Human Agent Queue

This is where **transferred calls land** — your real human agents pick up here.

**In VICIdial Admin:**

1. Go to **Admin** → **Ingroups** → **Add Ingroup**
2. Fill in:

   | Field | Value |
   |-------|-------|
   | **Ingroup ID** | `200` |
   | **Ingroup Name** | `Sales - Transferred Leads` |
   | **Campaign** | `AI_CAMPAIGN` |
   | **Extension Range** | Your agent extensions (e.g., `200-210`) |

3. **Add Human Agents:**
   - In the **Agents** tab, add your human agents
   - Make sure they are logged in and ready to receive calls

4. Click **Submit**

✅ **Send Us:** The ingroup/queue ID (default: `200`)

---

## 7. Step 5: Configure Network Access

Two connections must work.

### 🔹 Empire-X → VICIdial (API calls)

The Empire-X server needs to reach your VICIdial web interface:

| Protocol | Direction | From | To | Port |
|----------|-----------|------|----|------|
| HTTP/HTTPS | Outbound | Empire-X Server | VICIdial Server | `80` or `443` |

If you have a firewall, allow the Empire-X IP to connect to VICIdial's web port.

### 🔹 VICIdial → Empire-X (AGI connection) ⭐ CRITICAL

Asterisk needs to reach the Empire-X FastAGI server:

| Protocol | Direction | From | To | Port |
|----------|-----------|------|----|------|
| TCP | Outbound | VICIdial Server | Empire-X Server | `4573` |

**Firewall commands (if applicable):**

```bash
# ON VICIdial server — allow API access from Empire-X
sudo iptables -A INPUT -p tcp --dport 80 -s YOUR_EMPIRE_SERVER_IP -j ACCEPT

# ON Empire-X server — allow AGI from VICIdial
sudo iptables -A INPUT -p tcp --dport 4573 -s YOUR_VICIDIAL_SERVER_IP -j ACCEPT
```

**Test the connection:**
```bash
# From Empire-X, test API reachability:
curl http://YOUR_VICIDIAL_IP/vicidial/non_agent_api.php?function=version

# From VICIdial, test AGI port:
telnet YOUR_EMPIRE_SERVER_IP 4573
# You should see a connection established
```

✅ **Send Us:** Your VICIdial server IP address

---

## 8. Step 6: Install the AGI Dialplan

This tells Asterisk to route answered calls to our AI agent.

### Option A: Using VICIdial's Server Config (Recommended)

1. Go to **Admin** → **Servers** → **Edit your server**
2. Find the **AGI Settings** section:

   | Setting | Value |
   |---------|-------|
   | **AGI Server** | `YOUR_EMPIRE_SERVER_IP` |
   | **AGI Port** | `4573` |

3. Click **Submit**

### Option B: Manual Dialplan (If Option A doesn't work)

SSH into your VICIdial server and:

```bash
# Edit the custom extensions file
sudo nano /etc/asterisk/extensions_custom.conf
```

Add at the bottom:

```
; ============================================================
;  Empire-X AI Agent — handles answered calls
; ============================================================

; Main AGI context — routes answered calls to our AI
[empire-ai]
exten => s,1,Answer()
same => n,AGI(agi://YOUR_EMPIRE_SERVER_IP:4573)
same => n,Hangup()

; Transfer destination — where AI sends qualified leads
[empire-human-agents]
exten => _X!,1,Dial(SIP/${EXTEN},30,tT)
same => n,Hangup()
```

Replace `YOUR_EMPIRE_SERVER_IP` with the actual Empire-X server IP.

Then reload the dialplan:
```bash
sudo asterisk -rx "dialplan reload"
```

---

## 9. Step 7: Configure VICIdial to Use the AGI Context

Now we tell VICIdial's campaign to use our AGI context for answered calls.

**In VICIdial Admin:**

1. Go to **Admin** → **Campaigns** → **Edit** your AI campaign (`AI_CAMPAIGN`)
2. Find these settings:

   | Setting | Value |
   |---------|-------|
   | **Agent Direct AGI URL** | `agi://YOUR_EMPIRE_SERVER_IP:4573` |
   | **Context** | `empire-ai` (if using manual dialplan) |
   | **TTS Server** | `http://YOUR_EMPIRE_SERVER_IP:8000` (your Edge-TTS) |

3. **Also configure the "Call Menu" or "IVR":**
   - Some VICIdial versions route calls through a Call Menu
   - Set the Call Menu to route to the `empire-ai` context

4. Click **Submit**

### If VICIdial uses auto-dialing:

Go to **Admin** → **Campaigns** → **Edit Campaign** → **Dial Prefix / Dialplan** tab:

| Setting | Value |
|---------|-------|
| **Dial Prefix** | (leave as-is, usually `9`) |
| **Dialplan** | `extensions.conf` (default) |
| **Context (for outbound)** | `default` or `trunkoutbound` |

The key is that **when the call is answered**, VICIdial should run the AGI.

---

## 10. Step 8: Upload Leads & Go Live

### Upload Leads

**In VICIdial Admin:**

1. Go to **Lists** → **Add List**
   - **List ID**: `1`
   - **Campaign**: `AI_CAMPAIGN`
   - **List Name**: `AI Outreach Leads`
2. Click **Upload Leads** → Choose your CSV (phone, first_name, last_name)
3. Click **Submit**

Or, we can sync leads directly from Empire-X to VICIdial via the API.

### Start the Campaign

1. Go to **Admin** → **Campaigns** → Find `AI_CAMPAIGN`
2. Set **Campaign Status** to `ACTIVE`
3. Click **Submit**

### Login the AI Agent

We will log the AI agent into VICIdial from our side:
- Go to Empire-X → **VICIdial Integration** page
- Click **"Login Agent"**
- You should see the agent status change to `READY`

### Monitor

- **Active calls** will appear in Empire-X's VICIdial page
- **Transferred calls** go to your human agents in VICIdial's agent interface
- **Call dispositions** are automatically set by the AI

---

## 11. Troubleshooting

### 🔴 AI Agent won't log in

Checklist:
- [ ] Agent created in VICIdial Admin → Agents
- [ ] Agent password is correct
- [ ] Campaign is assigned to the agent
- [ ] Campaign status is `ACTIVE`
- [ ] VICIdial version supports API (2.14+)

### 🔴 Call connects but no audio / silence

Checklist:
- [ ] Empire-X FastAGI server is running (`python backend/agi_handler.py --mode fastagi`)
- [ ] Port 4573 is open on Empire-X firewall
- [ ] VICIdial server can reach Empire-X on port 4573 (`telnet IP 4573`)
- [ ] TTS server is running (`python backend/tts_server.py`)
- [ ] AGI URL is configured correctly in VICIdial campaign

### 🔴 Transfers not working

Checklist:
- [ ] Human agents are logged into VICIdial
- [ ] Ingroup/Queue is configured correctly
- [ ] Human agents are in the `READY` state
- [ ] Transfer destination extension is correct

### 🔴 Can't reach VICIdial API from Empire-X

Checklist:
- [ ] API user created with correct permissions
- [ ] API URL is correct (should end in `non_agent_api.php`)
- [ ] No firewall blocking port 80/443
- [ ] Can `curl` the API from Empire-X server

---

## 12. Credentials Sheet

Give this filled-out sheet to the Empire-X team:

```yaml
# ──────────────────────────────────────────────
# VICIdial Server Information
# ──────────────────────────────────────────────
VICIDIAL_SERVER_IP:     "____________________"  # e.g. 192.168.1.100
VICIDIAL_SERVER_PORT:   "80"                    # or 443 if HTTPS

# ──────────────────────────────────────────────
# API User (Admin → Non-Admin API Users)
# ──────────────────────────────────────────────
API_URL:   "http://______/vicidial/non_agent_api.php"
API_USER:  "empirex_api"
API_PASS:  "________________________"

# ──────────────────────────────────────────────
# AI Agent (Admin → Agents)
# ──────────────────────────────────────────────
AGENT_USER: "AI_AGENT_01"
AGENT_PASS: "________________________"

# ──────────────────────────────────────────────
# Campaign (Admin → Campaigns)
# ──────────────────────────────────────────────
CAMPAIGN_ID: "AI_CAMPAIGN"
CAMPAIGN_NAME: "Empire-X AI Outreach"

# ──────────────────────────────────────────────
# Human Agent Queue (Admin → Ingroups)
# ──────────────────────────────────────────────
TRANSFER_QUEUE: "200"    # Extension/Ingroup where calls go

# ──────────────────────────────────────────────
# Empire-X Server (us — we fill this part)
# ──────────────────────────────────────────────
EMPIRE_SERVER_IP: "____________________"   # IP of Empire-X machine
EMPIRE_AGI_PORT:  4573                     # FastAGI port
```

---

## Quick Reference — All Firewall Rules Needed

```bash
# === ON VICIDIAL SERVER ===
# Allow API access from Empire-X
iptables -A INPUT -p tcp --dport 80 -s EMPIRE_SERVER_IP -j ACCEPT

# === ON EMPIRE-X SERVER ===
# Allow AGI connections from VICIdial
iptables -A INPUT -p tcp --dport 4573 -s VICIDIAL_SERVER_IP -j ACCEPT
# Allow TTS server
iptables -A INPUT -p tcp --dport 8000 -s VICIDIAL_SERVER_IP -j ACCEPT
```

---

## Need Help?

If you run into any issues, share the following with Empire-X support:

1. **Screenshot** of the error
2. **VICIdial version** (from Admin → System Settings)
3. **Campaign settings** (screenshot)
4. **Agent settings** (screenshot)
5. Any **Asterisk CLI output** (run `asterisk -r` and see logs)

---

*This guide was generated by Empire-X AI Calling Platform — July 2026*
