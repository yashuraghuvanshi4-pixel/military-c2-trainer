# Immersive Multi-Domain Decision-Making Trainer for Degraded Communication Environments

> **Ministry of Defence (UK MOD) Prototype Dossier**  
> **Classification:** `SECRET // REL TO NATO / FVEY`  
> **Simulation Identifier:** `SIM-ID: C2-DEGRADED-2026-X`

A production-ready single-page web-based Command and Control (C2) tactical decision-making platform for degraded communication environments.

---

## 🛠️ Features Included

1. **Top Navigation & Status Bar:** System branding, mission title, UTC Zulu clock, mission elapsed timer, simulation speed controls (1x, 2x, 5x, 10x, Pause), and action buttons.
2. **Main Tactical Interface:**
   - **Left Sidebar:** BLUFOR Platoon hierarchy tree (Squad 1-Alpha, Team Members) with real-time vitals, armor, ammo, and mission objective trackers.
   - **Center Panel:** Interactive Multi-Domain GIS Canvas Map (Land, Air, Cyber, EW layers) with pan/zoom, coordinate readout, and distance measurement tool.
   - **Right Panel:** 2x3 grid of live procedural sub-unit camera feeds with noise/glitch signal degradation overlays.
3. **Instructor Scenario Engine:** Real-time injection of EW packet lag (+15s to +120s), selective camera blackouts, phantom OPFOR intel, and GPS spoofing.
4. **AI COA Assistant Panel:** Comparative tactical analysis cards (CAS Air Strike, HIMARS Artillery, Squad Direct Action) inspired by Palantir AIP C2 systems.
5. **After Action Review (AAR) Report & Export:** Debrief dossier with performance grade (A- 92%), metric cards, decision timeline log, and print-ready PDF export button.

---

## 🚀 Deployment Instructions

### 1. Local Preview Deployment (Currently Live)

To serve the app locally using Python:

```bash
python3 -m http.server 8085 --bind 127.0.0.1 --directory .
```

Access in your browser at: **`http://localhost:8085/index.html`**

---

### 2. GitHub Pages Cloud Deployment

To deploy this repository to GitHub Pages using GitHub CLI:

```bash
# 1. Authenticate with GitHub CLI
gh auth login

# 2. Create GitHub repository and push
gh repo create military-c2-trainer --public --source=. --remote=origin --push

# 3. Enable GitHub Pages from main branch
gh repo edit --enable-wiki=false
```

Once pushed, enable Pages under your repository settings:
`Settings -> Pages -> Source: Deploy from branch -> main / (root)`

---

### 3. Netlify / Vercel Cloud Deployment

Since this project is a standalone HTML5/JS single-page web application:

1. Log into [Netlify](https://app.netlify.com/) or [Vercel](https://vercel.com/).
2. Drag and drop the `military-c2-trainer` directory directly into the Netlify / Vercel dashboard.
3. The site will be instantly live with a free HTTPS URL.
