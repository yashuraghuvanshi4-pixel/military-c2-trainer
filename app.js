/**
 * Palantir AIP, C2 Cockpit, Real Satellite GIS & Army Camera Feed Engine
 * High-Fidelity Natural Camera Feeds: M4 Rifle 3D Bodycam, NVG Phosphor IR Laser, FLIR Thermal Heat Signatures, & CQB Breach Simulation
 */

// ==========================================
// 1. GLOBAL STATE & CONFIGURATION
// ==========================================
const state = {
  simSpeed: 1,
  elapsedSeconds: 15165,
  audioEnabled: true,
  
  // Active Left Sidebar Tab ('aip' | 'hierarchy')
  activeLeftTab: 'aip',

  // Map Basemap Style ('satellite' | 'hybrid' | 'dark')
  mapStyle: 'satellite',
  leafletMap: null,
  leafletTileLayer: null,

  // Comms & Spectrum State
  commsDegraded: false,
  commsLagSeconds: 0,
  droppedFeeds: new Set(),
  phantomIntelActive: false,
  gpsSpoofingActive: false,
  targetPing: null,
  targetPingMode: false,
  
  // Multi-Domain Layers Enabled
  layers: {
    land: true,
    air: true,
    cyber: true,
    ew: true
  },
  
  // Map Interactive Viewport State
  map: {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    measuring: false,
    measureStart: null,
    measureEnd: null
  },

  // BLUFOR Infantry Squad Soldiers (RTS Game Simulation)
  soldiers: [
    { name: 'K. Adams (Lead)', x: 180, y: 320, targetX: 180, targetY: 320, speed: 1.2, status: 'ADVANCING', health: 100, ammo: 120 },
    { name: 'L. Marshall (Rifle)', x: 165, y: 340, targetX: 165, targetY: 340, speed: 1.2, status: 'COVERING', health: 90, ammo: 45 },
    { name: 'M. Lawson (Auto)', x: 195, y: 340, targetX: 195, targetY: 340, speed: 1.2, status: 'ADVANCING', health: 95, ammo: 200 },
    { name: 'R. Vance (Grenadier)', x: 180, y: 360, targetX: 180, targetY: 360, speed: 1.2, status: 'READY', health: 100, ammo: 12 }
  ],

  // Gunfire Tracer Particles Array
  tracers: [],

  // Units & Positions
  units: [
    { name: 'KNIGHT 114 (HIMARS)', x: 180, y: 340, type: 'blue-artillery' },
    { name: '159th Artillery BN', x: 220, y: 390, type: 'blue-artillery' },
    { name: 'Team Foxtrot', x: 150, y: 450, type: 'blue-squad' },
    { name: '72nd Armor Brigade', x: 260, y: 490, type: 'blue-armor' },
    { name: 'Team Omega', x: 530, y: 470, type: 'blue-squad' },
    { name: 'HAWK 11 (F-16)', x: 500, y: 560, type: 'blue-air', angle: 45 },
    
    // Red Threat Targets
    { name: 'Military Command', x: 580, y: 140, type: 'red-target', destroyed: false },
    { name: 'Comms Facility', x: 500, y: 220, type: 'red-target', destroyed: false },
    { name: 'Confirmed Armor Attack BN', x: 540, y: 290, type: 'red-target', destroyed: false }
  ],

  // SquadMaps Hexagon Waypoint Cap Points
  waypoints: [
    { id: 1, name: 'Shanty Town', x: 300, y: 160 },
    { id: 2, name: 'Abandoned Airfield', x: 360, y: 180 },
    { id: 3, name: 'Downtown Center', x: 420, y: 240 },
    { id: 4, name: 'Oru Village East', x: 400, y: 310 },
    { id: 5, name: 'Warehouse District', x: 450, y: 360 },
    { id: 6, name: 'Orchard Point', x: 440, y: 440 },
    { id: 7, name: 'Parusinka Power', x: 520, y: 420 }
  ],
  
  // Decision Log for AAR
  decisionLog: [
    { time: 'T+00:15:00', event: 'Exercise Start & FOB Alpha Breach', action: 'Ordered Squad 1-Alpha Advance', lag: '+12ms', outcome: 'SUCCESS (100%)' },
    { time: 'T+01:45:20', event: 'EW Jamming Dome Activated (+45s Lag)', action: 'Switched to Mesh Relay Protocol', lag: '+45s', outcome: 'COMMS MAINTAINED' },
    { time: 'T+03:10:12', event: 'Conflicting Phantom OPFOR Sightings', action: 'Cross-verified via FLIR UAV Recon', lag: '+18s', outcome: 'DECEPTION DISPROVED' }
  ]
};

// Web Audio FX Synthesizer
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
}

function playBeep(freq = 880, type = 'sine', duration = 0.08) {
  if (!state.audioEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playAlertSound() {
  if (!state.audioEnabled) return;
  playBeep(440, 'sawtooth', 0.15);
  setTimeout(() => playBeep(880, 'sawtooth', 0.2), 150);
}

// ==========================================
// 2. LEAFLET GOOGLE MAPS GIS INTEGRATION
// ==========================================
// ==========================================
// 2. LIVE GOOGLE LOCATION MAP & GEOLOCATION INTEGRATION
// ==========================================
function initLeafletMap() {
  if (state.leafletMap) return;
  const mapContainer = document.getElementById('leaflet-map');
  if (!mapContainer) return;

  // Default initial coordinates (fallback to London / Global hub before Live GPS locks)
  const defaultLat = 51.5074;
  const defaultLon = -0.1278;

  state.leafletMap = L.map('leaflet-map', {
    center: [defaultLat, defaultLon],
    zoom: 14,
    zoomControl: false,
    attributionControl: false
  });

  const googleSatUrl = 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}';
  state.leafletTileLayer = L.tileLayer(googleSatUrl, {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
  }).addTo(state.leafletMap);

  // Synchronize Leaflet Mouse Position with HUD Footer Telemetry
  state.leafletMap.on('mousemove', (e) => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const latStr = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
    const latlonElem = document.getElementById('map-latlon');
    if (latlonElem) latlonElem.innerText = `${latStr} ${lonStr}`;

    const mgrsE = String(Math.floor(Math.abs(lng * 1000) % 10000)).padStart(4, '0');
    const mgrsN = String(Math.floor(Math.abs(lat * 1000) % 10000)).padStart(4, '0');
    const mgrsElem = document.getElementById('map-mgrs');
    if (mgrsElem) mgrsElem.innerText = `GRID ${mgrsE} ${mgrsN}`;
  });

  // Attempt Immediate Live Geolocation Lock
  locateUserLivePosition(true);

  // Watch position for continuous real-time live location updates
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (pos) => {
        state.liveLat = pos.coords.latitude;
        state.liveLon = pos.coords.longitude;
        state.liveAccuracy = pos.coords.accuracy;
        updateUserLocationMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => { console.warn("GPS Watch Position Warning:", err.message); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }
}

function locateUserLivePosition(isInitial = false) {
  if (!navigator.geolocation) {
    if (!isInitial) alert("Geolocation is not supported by your browser.");
    return;
  }

  const locateBtn = document.getElementById('btn-locate-me');
  if (locateBtn) locateBtn.classList.add('animate-pulse');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;

      state.liveLat = lat;
      state.liveLon = lon;
      state.liveAccuracy = accuracy;

      if (state.leafletMap) {
        state.leafletMap.flyTo([lat, lon], 16, { animate: true, duration: 1.5 });
        updateUserLocationMarker(lat, lon, accuracy);
      }

      playAlertSound();
      if (!isInitial) {
        alert(`📍 LIVE GPS LOCKED: ${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E (±${Math.round(accuracy)}m accuracy)`);
      }
    },
    (err) => {
      console.warn("Live Geolocation Permission/Timeout:", err);
      if (!isInitial) {
        alert("Could not retrieve live GPS location. Please check browser location permissions or try searching a location in the search bar!");
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function updateUserLocationMarker(lat, lon, accuracy) {
  if (!state.leafletMap) return;

  if (state.userLocationMarker) {
    state.userLocationMarker.setLatLng([lat, lon]);
  } else {
    // Tactical Glowing Custom Marker Icon
    const customIcon = L.divIcon({
      className: 'custom-live-marker',
      html: `
        <div class="relative flex items-center justify-center w-8 h-8">
          <div class="absolute w-8 h-8 bg-emerald-500/30 rounded-full animate-ping"></div>
          <div class="relative w-5 h-5 bg-emerald-500 border-2 border-white rounded-full shadow-[0_0_15px_#10B981] flex items-center justify-center text-[8px] font-bold text-black">HQ</div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    state.userLocationMarker = L.marker([lat, lon], { icon: customIcon }).addTo(state.leafletMap);
    state.userLocationMarker.bindPopup(`<div class="font-mono text-xs font-bold text-tgreen">🟢 YOUR LIVE COMMAND NODE<br>LAT: ${lat.toFixed(4)}° | LON: ${lon.toFixed(4)}°</div>`);
  }

  if (state.userAccuracyCircle) {
    state.userAccuracyCircle.setLatLng([lat, lon]);
    state.userAccuracyCircle.setRadius(accuracy || 50);
  } else {
    state.userAccuracyCircle = L.circle([lat, lon], {
      radius: accuracy || 50,
      color: '#10B981',
      fillColor: '#10B981',
      fillOpacity: 0.15,
      weight: 1.5
    }).addTo(state.leafletMap);
  }
}

async function searchLocationOnMap() {
  const inputElem = document.getElementById('map-search-input');
  if (!inputElem || !inputElem.value.trim()) return;

  const query = inputElem.value.trim();
  try {
    playBeep(1100, 'sine', 0.05);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (data && data.length > 0) {
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      if (state.leafletMap) {
        state.leafletMap.flyTo([lat, lon], 14, { animate: true, duration: 1.5 });

        // Add Search Result Marker
        L.popup()
          .setLatLng([lat, lon])
          .setContent(`<div class="font-mono text-xs font-bold text-tcyan">🎯 SEARCHED LOCATION:<br>${result.display_name}</div>`)
          .openOn(state.leafletMap);
      }
      playAlertSound();
    } else {
      alert(`Location "${query}" not found. Try searching with city or landmark name!`);
    }
  } catch (err) {
    console.error("Geocoding fetch error:", err);
    alert("Error searching location. Please check your network connection.");
  }
}

function switchMapStyle(style) {
  state.mapStyle = style;
  ['map-style-sat', 'map-style-hybrid', 'map-style-roadmap', 'map-style-terrain'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.className = "px-2.5 py-1 rounded text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:text-white flex items-center gap-1";
  });

  const activeBtn = document.getElementById(`map-style-${style === 'satellite' ? 'sat' : style}`);
  if (activeBtn) activeBtn.className = "px-2.5 py-1 rounded text-xs font-mono font-bold bg-tcyan/20 text-tcyan border border-tcyan/50 flex items-center gap-1 shadow-[0_0_8px_rgba(0,240,255,0.2)]";

  if (!state.leafletMap) return;

  if (state.leafletTileLayer) state.leafletMap.removeLayer(state.leafletTileLayer);

  if (style === 'satellite') {
    state.leafletTileLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(state.leafletMap);
  } else if (style === 'hybrid') {
    state.leafletTileLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(state.leafletMap);
  } else if (style === 'roadmap') {
    state.leafletTileLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(state.leafletMap);
  } else if (style === 'terrain') {
    state.leafletTileLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
      maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(state.leafletMap);
  }

  playBeep(950, 'sine', 0.05);
}

// ==========================================
// 3. TOP BAR NAVIGATION TABS, ACCORDIONS & OBJECTIVES
// ==========================================
function switchNavTab(tabName) {
  ['map', 'mission', 'timeline', 'settings'].forEach(t => {
    const btn = document.getElementById(`nav-tab-${t}`);
    if (btn) {
      btn.className = "px-3 py-1 rounded-md font-bold text-slate-400 hover:text-slate-100 flex items-center gap-1.5 transition";
    }
  });

  const activeBtn = document.getElementById(`nav-tab-${tabName}`);
  if (activeBtn) {
    activeBtn.className = "px-3 py-1 rounded-md font-bold text-tcyan bg-aipblue/20 border border-aipblue/50 flex items-center gap-1.5 shadow-[0_0_8px_rgba(0,240,255,0.2)]";
  }

  playBeep(1000, 'sine', 0.05);

  if (tabName === 'settings') {
    openModal('instructor-modal');
  } else if (tabName === 'timeline') {
    const timelineElem = document.getElementById('timeline-chart');
    if (timelineElem) timelineElem.scrollIntoView({ behavior: 'smooth' });
  } else if (tabName === 'mission') {
    const accObj = document.getElementById('acc-objectives');
    if (accObj && accObj.classList.contains('hidden')) {
      toggleAccordion('acc-objectives');
    }
  }
}

function toggleAccordion(accId) {
  const content = document.getElementById(accId);
  const icon = document.getElementById(`icon-${accId}`);
  if (!content) return;

  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    if (icon) icon.classList.add('rotate-180');
  } else {
    content.classList.add('hidden');
    if (icon) icon.classList.remove('rotate-180');
  }
  playBeep(900, 'sine', 0.04);
}

function toggleObjectiveCheck(checkbox) {
  playBeep(1100, 'sine', 0.06);
  const container = checkbox.closest('#acc-objectives');
  if (!container) return;

  const total = container.querySelectorAll('input[type="checkbox"]').length;
  const checked = container.querySelectorAll('input[type="checkbox"]:checked').length;
  const pct = Math.round((checked / total) * 100);

  const percentText = document.getElementById('obj-percent-text');
  const percentBar = document.getElementById('obj-percent-bar');
  if (percentText) percentText.innerText = `${pct}%`;
  if (percentBar) percentBar.style.width = `${pct}%`;
}

// Quick Decision Countdown Timer (30s time pressure)
let quickDecisionSeconds = 28;
setInterval(() => {
  if (quickDecisionSeconds > 0) {
    quickDecisionSeconds--;
    const timerElem = document.getElementById('decision-timer');
    if (timerElem) timerElem.innerText = `${quickDecisionSeconds}s`;
  } else {
    quickDecisionSeconds = 30;
  }
}, 1000);

function triggerCyberCountermeasure() {
  playAlertSound();
  state.commsDegraded = false;
  state.commsLagSeconds = 0;
  state.droppedFeeds.clear();
  
  const ewIndicator = document.getElementById('ew-status-text');
  if (ewIndicator) {
    ewIndicator.innerText = "OFF // 0% DEGRADED";
    ewIndicator.className = "text-tgreen font-bold";
  }

  const lagElem = document.getElementById('bottom-telemetry-lag');
  if (lagElem) lagElem.innerText = '12ms';

  const intelBox = document.getElementById('conflicting-intel-box');
  if (intelBox) {
    const entry = document.createElement('div');
    entry.className = "p-1 rounded bg-emerald-950/40 text-tgreen border-l-2 border-green-500 animate-pulse";
    entry.innerHTML = `<span class="text-slate-400">[CYBER SCRIPT]:</span> Frequency hopping engaged. Comms latency cleared to 12ms.`;
    intelBox.prepend(entry);
  }

  alert("CYBER COUNTERMEASURE EXECUTED: Silvus mesh frequency hopping activated. Electronic jamming neutralized!");
}

function triggerReconScan() {
  playBeep(1200, 'sine', 0.1);
  if (state.soldiers && state.soldiers.length > 0) {
    const s = state.soldiers[0];
    state.targetPing = { x: s.x + 120, y: s.y - 80, mgrs: "GRID 4892 9180" };
  }

  const intelBox = document.getElementById('conflicting-intel-box');
  if (intelBox) {
    const entry = document.createElement('div');
    entry.className = "p-1 rounded bg-amber-950/40 text-tamber border-l-2 border-amber-500";
    entry.innerHTML = `<span class="text-slate-400">[RECON DRONE]:</span> Thermal sweep confirms 2 hostile armor signatures at Grid 4892.`;
    intelBox.prepend(entry);
  }

  alert("RECON DRONE SCAN INITIATED: Reaper UAV launched over Sector 4. Target ping updated on tactical minimap!");
}

function handleQuickDecision(choice) {
  playAlertSound();
  quickDecisionSeconds = 30;
  const timerElem = document.getElementById('decision-timer');
  if (timerElem) timerElem.innerText = `30s`;

  if (choice === 'chaff') {
    alert("SQUAD LEADER DECISION: ECM Chaff flare deployed! Hostile radar tracking lock broken.");
  } else {
    alert("SQUAD LEADER DECISION: Stealth mesh lock engaged. Squad radar signature suppressed.");
  }
}

// Global Keyboard Hotkey Listener (1, 2, 3, 4, 5)
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === '1') triggerCyberCountermeasure();
  if (e.key === '2') triggerReconScan();
  if (e.key === '3') executeCOA(2);
  if (e.key === '4') triggerSquadMoveOrder();
  if (e.key === '5') overrideCommsSync();
});

function switchLeftTab(tabName) {
  state.activeLeftTab = tabName;
  const tabAip = document.getElementById('left-tab-aip');
  const tabHier = document.getElementById('left-tab-hierarchy');
  const btnAip = document.getElementById('tab-btn-aip');
  const btnHier = document.getElementById('tab-btn-hierarchy');

  if (tabName === 'aip') {
    tabAip?.classList.remove('hidden');
    tabHier?.classList.add('hidden');
    btnAip?.classList.add('border-b-2', 'border-tcyan', 'text-tcyan', 'bg-c2card/60');
    btnAip?.classList.remove('text-slate-400');
    btnHier?.classList.remove('border-b-2', 'border-tcyan', 'text-tcyan', 'bg-c2card/60');
    btnHier?.classList.add('text-slate-400');
  } else {
    tabAip?.classList.add('hidden');
    tabHier?.classList.remove('hidden');
    btnHier?.classList.add('border-b-2', 'border-tcyan', 'text-tcyan', 'bg-c2card/60');
    btnHier?.classList.remove('text-slate-400');
    btnAip?.classList.remove('border-b-2', 'border-tcyan', 'text-tcyan', 'bg-c2card/60');
    btnAip?.classList.add('text-slate-400');
  }
  playBeep(900, 'sine', 0.05);
}

function setSimSpeed(speed) {
  state.simSpeed = speed;
  ['btn-pause', 'btn-play', 'btn-speed2', 'btn-speed5'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('bg-aipblue', 'text-white', 'font-bold');
  });
  
  let activeId = 'btn-play';
  if (speed === 0) activeId = 'btn-pause';
  if (speed === 2) activeId = 'btn-speed2';
  if (speed === 5) activeId = 'btn-speed5';
  
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) activeBtn.classList.add('bg-aipblue', 'text-white', 'font-bold');
  playBeep(1200, 'sine', 0.05);
}

function updateClocks() {
  if (state.simSpeed > 0) {
    state.elapsedSeconds += state.simSpeed;
  }

  const hrs = String(Math.floor(state.elapsedSeconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((state.elapsedSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(state.elapsedSeconds % 60).padStart(2, '0');
  const timerElem = document.getElementById('mission-timer');
  if (timerElem) timerElem.innerText = `T+${hrs}:${mins}:${secs}`;

  const now = new Date();
  const utcHours = String(now.getUTCHours()).padStart(2, '0');
  const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
  const utcSecs = String(now.getUTCSeconds()).padStart(2, '0');
  const clockElem = document.getElementById('utc-clock');
  if (clockElem) clockElem.innerText = `${utcHours}:${utcMins}:${utcSecs}Z`;
}

setInterval(updateClocks, 1000);

// ==========================================
// 4. RTS SIMULATION ENGINE & SOLDIERS
// ==========================================
function triggerSquadMoveOrder() {
  const targetX = 380 + Math.random() * 120;
  const targetY = 220 + Math.random() * 80;

  state.soldiers.forEach((s, idx) => {
    s.targetX = targetX + (idx % 2 === 0 ? -15 : 15);
    s.targetY = targetY + (idx > 1 ? 15 : -15);
    s.status = 'ADVANCING TO WAYPOINT';
  });

  playAlertSound();
  alert("RTS SIMULATION: 1st Platoon Squad 1-Alpha ordered to advance to new tactical waypoint!");
}

function triggerGunfireSimulation() {
  playBeep(1200, 'sawtooth', 0.1);
  setTimeout(() => playBeep(600, 'sawtooth', 0.15), 100);

  for (let i = 0; i < 12; i++) {
    const s = state.soldiers[i % 4];
    state.tracers.push({
      startX: s.x,
      startY: s.y,
      currentX: s.x,
      currentY: s.y,
      targetX: 500 + (Math.random() - 0.5) * 40,
      targetY: 220 + (Math.random() - 0.5) * 40,
      progress: 0,
      speed: 0.04 + Math.random() * 0.03
    });
  }
}

function updateSimulationState() {
  if (state.simSpeed === 0) return;

  state.soldiers.forEach(s => {
    const dx = s.targetX - s.x;
    const dy = s.targetY - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 3) {
      s.x += (dx / dist) * s.speed * state.simSpeed;
      s.y += (dy / dist) * s.speed * state.simSpeed;
    } else {
      s.status = 'IN POSITION';
    }
  });

  state.tracers.forEach(t => {
    t.progress += t.speed * state.simSpeed;
    t.currentX = t.startX + (t.targetX - t.startX) * t.progress;
    t.currentY = t.startY + (t.targetY - t.startY) * t.progress;
  });
  state.tracers = state.tracers.filter(t => t.progress < 1.0);
}

// ==========================================
// 5. TACTICAL CANVAS MAP RENDERER
// ==========================================
let mapCanvas, mapCtx;

function initMapCanvas() {
  mapCanvas = document.getElementById('map-canvas');
  if (!mapCanvas) return;
  mapCtx = mapCanvas.getContext('2d');
  
  function resizeCanvas() {
    mapCanvas.width = mapCanvas.parentElement.clientWidth;
    mapCanvas.height = mapCanvas.parentElement.clientHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  mapCanvas.addEventListener('mousedown', (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (state.targetPingMode) {
      const mgrsE = 4820 + Math.floor(clickX / 10);
      const mgrsN = 9100 + Math.floor((mapCanvas.height - clickY) / 10);
      state.targetPing = { x: clickX, y: clickY, mgrs: `38R QT ${mgrsE} ${mgrsN}` };
      playAlertSound();
      state.targetPingMode = false;
      document.getElementById('btn-target-ping')?.classList.remove('bg-tamber/20', 'text-tamber', 'border-tamber/50');
      return;
    }

    if (state.map.measuring) {
      if (!state.map.measureStart) {
        state.map.measureStart = { x: clickX, y: clickY };
      } else {
        state.map.measureEnd = { x: clickX, y: clickY };
        calculateMeasurement();
      }
      return;
    }

    state.map.isDragging = true;
    state.map.dragStartX = clickX - state.map.panX;
    state.map.dragStartY = clickY - state.map.panY;
  });

  mapCanvas.addEventListener('mousemove', (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const mgrsE = 4820 + Math.floor(mouseX / 10);
    const mgrsN = 9100 + Math.floor((mapCanvas.height - mouseY) / 10);
    const mgrsElem = document.getElementById('map-mgrs');
    if (mgrsElem) mgrsElem.innerText = `38R QT ${mgrsE} ${mgrsN}`;

    if (state.map.isDragging) {
      state.map.panX = mouseX - state.map.dragStartX;
      state.map.panY = mouseY - state.map.dragStartY;
    } else if (state.map.measuring && state.map.measureStart) {
      state.map.measureEnd = { x: mouseX, y: mouseY };
    }
  });

  window.addEventListener('mouseup', () => { state.map.isDragging = false; });

  mapCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) mapZoomIn(); else mapZoomOut();
  });

  requestAnimationFrame(renderMap);
}

function mapZoomIn() { state.map.zoom = Math.min(state.map.zoom + 0.15, 2.5); }
function mapZoomOut() { state.map.zoom = Math.max(state.map.zoom - 0.15, 0.5); }
function resetMapView() {
  state.map.zoom = 1.0; state.map.panX = 0; state.map.panY = 0;
  state.map.measuring = false; state.map.measureStart = null; state.map.measureEnd = null;
  state.targetPing = null; state.targetPingMode = false;
  document.getElementById('btn-measure')?.classList.remove('bg-tcyan/20', 'text-tcyan', 'border-tcyan/50');
  document.getElementById('btn-target-ping')?.classList.remove('bg-tamber/20', 'text-tamber', 'border-tamber/50');
}

function toggleMapMeasure() {
  state.map.measuring = !state.map.measuring;
  state.map.measureStart = null; state.map.measureEnd = null;
  const btn = document.getElementById('btn-measure');
  if (state.map.measuring) btn.classList.add('bg-tcyan/20', 'text-tcyan', 'border-tcyan/50');
  else btn.classList.remove('bg-tcyan/20', 'text-tcyan', 'border-tcyan/50');
}

function toggleTargetPing() {
  state.targetPingMode = !state.targetPingMode;
  state.map.measuring = false;
  const btn = document.getElementById('btn-target-ping');
  if (state.targetPingMode) btn.classList.add('bg-tamber/20', 'text-tamber', 'border-tamber/50');
  else btn.classList.remove('bg-tamber/20', 'text-tamber', 'border-tamber/50');
  playBeep(900, 'sine', 0.05);
}

function calculateMeasurement() {
  if (!state.map.measureStart || !state.map.measureEnd) return;
  const dx = state.map.measureEnd.x - state.map.measureStart.x;
  const dy = state.map.measureEnd.y - state.map.measureStart.y;
  const pxDist = Math.sqrt(dx * dx + dy * dy);
  const kmDist = (pxDist * 0.008).toFixed(2);
  const distElem = document.getElementById('map-dist');
  if (distElem) distElem.innerText = `${kmDist} km`;
  playBeep(1000, 'sine', 0.08);
}

function renderMap() {
  if (!mapCanvas || !mapCtx) return;
  const w = mapCanvas.width;
  const h = mapCanvas.height;

  updateSimulationState();

  mapCtx.save();
  mapCtx.clearRect(0, 0, w, h);

  mapCtx.translate(state.map.panX, state.map.panY);
  mapCtx.scale(state.map.zoom, state.map.zoom);

  // Threat Radius Domes
  if (state.layers.ew) {
    const time = Date.now() * 0.002;
    const pulseR = 120 + Math.sin(time) * 10;

    const grad = mapCtx.createRadialGradient(520, 230, 20, 520, 230, pulseR);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
    grad.addColorStop(0.7, 'rgba(239, 68, 68, 0.18)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    mapCtx.fillStyle = grad;
    mapCtx.beginPath(); mapCtx.arc(520, 230, pulseR, 0, Math.PI * 2); mapCtx.fill();

    mapCtx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
    mapCtx.lineWidth = 1.5;
    mapCtx.setLineDash([6, 4]);
    mapCtx.beginPath(); mapCtx.arc(520, 230, pulseR, 0, Math.PI * 2); mapCtx.stroke();
    mapCtx.setLineDash([]);
  }

  // Cyber Datalink Vectors
  if (state.layers.cyber) {
    mapCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    mapCtx.lineWidth = 1;
    mapCtx.setLineDash([4, 4]);

    mapCtx.beginPath(); mapCtx.moveTo(180, 340); mapCtx.lineTo(540, 290); mapCtx.stroke();
    mapCtx.beginPath(); mapCtx.moveTo(530, 470); mapCtx.lineTo(540, 290); mapCtx.stroke();
    mapCtx.beginPath(); mapCtx.moveTo(500, 560); mapCtx.lineTo(540, 290); mapCtx.stroke();

    mapCtx.setLineDash([]);
  }

  // BLUFOR Soldier Figures
  if (state.layers.land) {
    state.soldiers.forEach(s => {
      mapCtx.fillStyle = '#00F0FF';
      mapCtx.beginPath(); mapCtx.arc(s.x, s.y - 6, 4, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.fillRect(s.x - 4, s.y - 2, 8, 10);

      mapCtx.strokeStyle = '#FFFFFF'; mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.moveTo(s.x, s.y); mapCtx.lineTo(s.x + 8, s.y - 2); mapCtx.stroke();

      mapCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; mapCtx.fillRect(s.x - 10, s.y - 14, 20, 3);
      mapCtx.fillStyle = '#10B981'; mapCtx.fillRect(s.x - 10, s.y - 14, 20 * (s.health / 100), 3);

      mapCtx.fillStyle = '#00F0FF'; mapCtx.font = 'bold 8px monospace';
      mapCtx.fillText(s.name, s.x - 22, s.y + 16);
    });
  }

  // Tracers
  state.tracers.forEach(t => {
    mapCtx.strokeStyle = '#F59E0B'; mapCtx.lineWidth = 2;
    mapCtx.beginPath(); mapCtx.moveTo(t.currentX, t.currentY); mapCtx.lineTo(t.currentX - 10, t.currentY - 10); mapCtx.stroke();
    mapCtx.fillStyle = '#EF4444'; mapCtx.beginPath(); mapCtx.arc(t.currentX, t.currentY, 3, 0, Math.PI * 2); mapCtx.fill();
  });

  // Waypoints
  if (state.layers.land) {
    state.waypoints.forEach(wp => {
      mapCtx.fillStyle = 'rgba(0, 240, 255, 0.2)'; mapCtx.strokeStyle = '#00F0FF'; mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      mapCtx.moveTo(wp.x, wp.y - 12); mapCtx.lineTo(wp.x + 10, wp.y);
      mapCtx.lineTo(wp.x, wp.y + 12); mapCtx.lineTo(wp.x - 10, wp.y);
      mapCtx.closePath(); mapCtx.fill(); mapCtx.stroke();
      mapCtx.fillStyle = '#FFFFFF'; mapCtx.font = 'bold 10px monospace'; mapCtx.fillText(wp.id, wp.x - 3, wp.y + 3);
    });
  }

  // Units
  state.units.forEach(u => {
    if (u.type === 'red-target') {
      if (!u.destroyed) {
        mapCtx.fillStyle = '#EF4444';
        mapCtx.beginPath(); mapCtx.moveTo(u.x, u.y - 10); mapCtx.lineTo(u.x + 10, u.y); mapCtx.lineTo(u.x, u.y + 10); mapCtx.lineTo(u.x - 10, u.y); mapCtx.closePath(); mapCtx.fill();
        mapCtx.strokeStyle = '#FFFFFF'; mapCtx.lineWidth = 1.5; mapCtx.stroke();
        mapCtx.fillStyle = '#EF4444'; mapCtx.font = 'bold 9px monospace'; mapCtx.fillText(u.name, u.x - 35, u.y + 22);
      } else {
        mapCtx.strokeStyle = '#EF4444'; mapCtx.lineWidth = 2;
        mapCtx.beginPath(); mapCtx.moveTo(u.x - 10, u.y - 10); mapCtx.lineTo(u.x + 10, u.y + 10); mapCtx.moveTo(u.x + 10, u.y - 10); mapCtx.lineTo(u.x - 10, u.y + 10); mapCtx.stroke();
        mapCtx.fillStyle = '#10B981'; mapCtx.font = 'bold 9px monospace'; mapCtx.fillText('NEUTRALIZED', u.x - 30, u.y + 22);
      }
    } else {
      mapCtx.fillStyle = '#1D6BF3'; mapCtx.fillRect(u.x - 9, u.y - 9, 18, 18);
      mapCtx.strokeStyle = '#FFFFFF'; mapCtx.lineWidth = 1.5; mapCtx.strokeRect(u.x - 9, u.y - 9, 18, 18);
      mapCtx.fillStyle = '#00F0FF'; mapCtx.font = 'bold 9px monospace'; mapCtx.fillText(u.name, u.x - 30, u.y + 24);
    }
  });

  // Target Ping Pulse
  if (state.targetPing) {
    const p = state.targetPing;
    const pulseR = 12 + Math.sin(Date.now() * 0.008) * 6;
    mapCtx.strokeStyle = '#F59E0B'; mapCtx.lineWidth = 2;
    mapCtx.beginPath(); mapCtx.arc(p.x, p.y, pulseR, 0, Math.PI * 2); mapCtx.stroke();
    mapCtx.fillStyle = '#F59E0B'; mapCtx.font = 'bold 10px monospace'; mapCtx.fillText(`DESIGNATED TARGET [${p.mgrs}]`, p.x - 50, p.y - 12);
  }

  // Ruler Measurement
  if (state.map.measureStart && state.map.measureEnd) {
    mapCtx.strokeStyle = '#F59E0B'; mapCtx.lineWidth = 2; mapCtx.setLineDash([4, 4]);
    mapCtx.beginPath(); mapCtx.moveTo(state.map.measureStart.x, state.map.measureStart.y); mapCtx.lineTo(state.map.measureEnd.x, state.map.measureEnd.y); mapCtx.stroke();
    mapCtx.setLineDash([]);
  }

  mapCtx.restore();
  requestAnimationFrame(renderMap);
}

function toggleDomainLayer(domain) {
  state.layers[domain] = !state.layers[domain];
  const btn = document.getElementById(`layer-${domain}`);
  if (state.layers[domain]) btn.className = "px-2.5 py-1 rounded text-xs font-mono font-bold bg-tcyan/20 text-tcyan border border-tcyan/50 flex items-center gap-1 shadow-[0_0_8px_rgba(0,240,255,0.2)]";
  else btn.className = "px-2.5 py-1 rounded text-xs font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700 hover:text-white flex items-center gap-1";
  playBeep(900, 'sine', 0.05);
}

// ==========================================
// 6. HIGH-DEFINITION NATURAL SUB-UNIT CAMERA FEEDS RENDERER
// ==========================================
function initFeedCanvases() {
  for (let i = 1; i <= 6; i++) {
    const canvas = document.getElementById(`feed-canvas-${i}`);
    if (!canvas) continue;
    
    function drawFeed() {
      const ctx = canvas.getContext('2d');
      const w = canvas.width = canvas.parentElement.clientWidth || 180;
      const h = canvas.height = canvas.parentElement.clientHeight || 120;
      const t = Date.now() * 0.0025;

      ctx.fillStyle = '#04070c';
      ctx.fillRect(0, 0, w, h);

      const isDropped = state.droppedFeeds.has(i);

      if (isDropped || (state.commsDegraded && Math.random() < 0.35)) {
        // Render Signal Lost Static Noise
        const imgData = ctx.createImageData(w, h);
        const data = imgData.data;
        for (let p = 0; p < data.length; p += 4) {
          const v = Math.random() * 255;
          data[p] = v; data[p + 1] = v; data[p + 2] = v; data[p + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);

        ctx.fillStyle = '#EF4444'; ctx.font = 'bold 11px monospace';
        ctx.fillText('NO SIGNAL / EW JAMMED', w / 2 - 60, h / 2);
      } else {
        
        // RENDER NATURAL TACTICAL CAMERA FEEDS BY ROLE
        if (i === 1) {
          // CAM-01: KAdams Optical First-Person Bodycam (Real Rifle & Moving Squadmate)
          ctx.fillStyle = '#101622';
          ctx.fillRect(0, 0, w, h);

          // Compound Wall & Doorway Angle Perspective
          ctx.fillStyle = '#1a2333'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(60, 20); ctx.lineTo(60, h - 20); ctx.lineTo(0, h); ctx.fill();
          ctx.fillStyle = '#0b0f19'; ctx.fillRect(60, 20, w - 120, h - 40);

          // Squadmate moving ahead in MultiCam military uniform & helmet
          const soldierX = w / 2 + Math.sin(t * 1.5) * 12;
          ctx.fillStyle = '#475569'; // MultiCam uniform torso
          ctx.fillRect(soldierX - 8, h / 2 - 4, 16, 22);
          ctx.fillStyle = '#334155'; // Tactical vest
          ctx.fillRect(soldierX - 6, h / 2 - 2, 12, 14);
          ctx.fillStyle = '#64748b'; // Military Helmet
          ctx.beginPath(); ctx.arc(soldierX, h / 2 - 10, 6, Math.PI, 0); ctx.fill();

          // Operator's own M4 Rifle Barrel in bottom right foreground
          const gunSwayY = Math.sin(t * 3) * 3;
          ctx.fillStyle = '#1e293b'; ctx.fillRect(w - 70, h - 35 + gunSwayY, 70, 35);
          ctx.fillStyle = '#0f172a'; ctx.fillRect(w - 60, h - 30 + gunSwayY, 50, 10); // Optic rail

          // HUD Pitch/Roll Horizon & Telemetry
          ctx.strokeStyle = '#00F0FF'; ctx.lineWidth = 1;
          ctx.strokeRect(w / 2 - 12, h / 2 - 12, 24, 24);
          ctx.fillStyle = '#00F0FF'; ctx.font = '8px monospace';
          ctx.fillText('CAM-01 // OPTICAL 1080P // ISO 800', 6, 12);

        } else if (i === 2) {
          // CAM-02: LMarshall Helmet NVG (Authentic Green Phosphor Shader & IR Laser)
          ctx.fillStyle = '#031f0e'; // Deep NVG green phosphor background
          ctx.fillRect(0, 0, w, h);

          // NVG Vignette Circle
          const nvgGrad = ctx.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w / 2);
          nvgGrad.addColorStop(0, 'rgba(5, 43, 20, 0.1)');
          nvgGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
          ctx.fillStyle = nvgGrad; ctx.fillRect(0, 0, w, h);

          // Room doorway & soldier silhouette in NVG green
          ctx.fillStyle = '#10B981';
          ctx.fillRect(40, 15, w - 80, h - 30);
          ctx.fillStyle = '#042711';
          ctx.fillRect(55, 25, w - 110, h - 50);

          // Soldier in NVG bright green phosphor glow
          const sx = w / 2 + Math.sin(t * 1.2) * 10;
          ctx.fillStyle = '#34d399';
          ctx.beginPath(); ctx.arc(sx, h / 2 - 8, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillRect(sx - 7, h / 2, 14, 20);

          // Infrared (IR) Laser Beam Vector Line
          ctx.strokeStyle = '#10B981'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 2]);
          ctx.beginPath(); ctx.moveTo(w - 20, h - 10); ctx.lineTo(sx, h / 2 - 4); ctx.stroke(); ctx.setLineDash([]);

          ctx.fillStyle = '#10B981'; ctx.font = '8px monospace';
          ctx.fillText('CAM-02 // NVG GREEN PHOSPHOR // IR ACTIVE', 6, 12);

        } else if (i === 3) {
          // CAM-03: MLawson FLIR Thermal (White-Hot / Black-Hot Body Heat Signatures)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, w, h);

          // Thermal Body Heat Signatures (Glowing White/Orange/Red)
          const hx = w / 2 + Math.cos(t) * 18;
          const hy = h / 2 + Math.sin(t) * 8;

          const flirGrad = ctx.createRadialGradient(hx, hy, 4, hx, hy, 28);
          flirGrad.addColorStop(0, '#FFFFFF'); // Hot core
          flirGrad.addColorStop(0.4, '#F59E0B'); // Body heat
          flirGrad.addColorStop(0.8, '#EF4444'); // Dissipation
          flirGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');

          ctx.fillStyle = flirGrad;
          ctx.beginPath(); ctx.arc(hx, hy, 28, 0, Math.PI * 2); ctx.fill();

          // FLIR Reticle
          ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(w / 2 - 10, h / 2); ctx.lineTo(w / 2 + 10, h / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(w / 2, h / 2 - 10); ctx.lineTo(w / 2, h / 2 + 10); ctx.stroke();

          ctx.fillStyle = '#F59E0B'; ctx.font = '8px monospace';
          ctx.fillText('CAM-03 // FLIR THERMAL // WHITE-HOT', 6, 12);

        } else if (i === 4) {
          // CAM-04: TGREGORY / First Room CQB Breach (Overhead Security Cam)
          ctx.fillStyle = '#090d16';
          ctx.fillRect(0, 0, w, h);

          // Room Wall Layout & Doorway
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)'; ctx.lineWidth = 1.5;
          ctx.strokeRect(15, 15, w - 30, h - 30);

          // Breach Squad Soldiers entering room in tactical formation
          for (let s = 0; s < 3; s++) {
            const bx = 30 + s * 22 + Math.sin(t + s) * 4;
            const by = 40 + s * 12;
            ctx.fillStyle = '#00F0FF'; ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1; ctx.strokeRect(bx - 7, by - 7, 14, 14);
          }

          // Target Lock Bounding Box
          ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 1.5;
          ctx.strokeRect(w - 60, h - 50, 30, 30);
          ctx.fillStyle = '#EF4444'; ctx.font = '8px monospace';
          ctx.fillText('HOSTILE', w - 65, h - 55);

          ctx.fillStyle = '#00F0FF'; ctx.font = '8px monospace';
          ctx.fillText('CAM-04 // CQB FIRST ROOM BREACH', 6, 12);

        } else if (i === 5) {
          // CAM-05: Second Room Radar Node FLIR Interior
          ctx.fillStyle = '#080d19';
          ctx.fillRect(0, 0, w, h);

          // Radar Console & Server Rack Dish Spinning
          ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(w / 2, h / 2, 22, 0, Math.PI * 2); ctx.stroke();

          const radarAngle = t * 2;
          ctx.beginPath(); ctx.moveTo(w / 2, h / 2);
          ctx.lineTo(w / 2 + Math.cos(radarAngle) * 22, h / 2 + Math.sin(radarAngle) * 22);
          ctx.stroke();

          // Server Blinking LEDs
          ctx.fillStyle = (Math.sin(t * 10) > 0) ? '#10B981' : '#EF4444';
          ctx.fillRect(20, 20, 6, 6);
          ctx.fillRect(20, 32, 6, 6);

          ctx.fillStyle = '#F59E0B'; ctx.font = '8px monospace';
          ctx.fillText('CAM-05 // RADAR NODE INTERIOR', 6, 12);

        } else {
          // CAM-06: Outside Overwatch Drone Aerial View
          ctx.fillStyle = '#0a101d';
          ctx.fillRect(0, 0, w, h);

          // Ground Road & Moving Vehicle Drive-by
          ctx.fillStyle = '#1e293b'; ctx.fillRect(0, h / 2 - 10, w, 20);
          const vx = (t * 40) % (w + 40) - 20;
          ctx.fillStyle = '#F59E0B'; ctx.fillRect(vx, h / 2 - 6, 16, 12);

          // Drone Targeting Crosshairs
          ctx.strokeStyle = '#00F0FF'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(w / 2 - 25, h / 2); ctx.lineTo(w / 2 + 25, h / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(w / 2, h / 2 - 25); ctx.lineTo(w / 2, h / 2 + 25); ctx.stroke();

          ctx.fillStyle = '#00F0FF'; ctx.font = '8px monospace';
          ctx.fillText('CAM-06 // OVERWATCH REAPER DRONE', 6, 12);
        }

        // Live Camera Telemetry Readout
        ctx.fillStyle = '#00F0FF'; ctx.font = '8px monospace';
        ctx.fillText(`FPS: 60 | LAT: ${state.commsLagSeconds > 0 ? '+' + state.commsLagSeconds + 's' : '12ms'}`, 8, h - 8);
      }

      requestAnimationFrame(drawFeed);
    }
    requestAnimationFrame(drawFeed);
  }
}

// ==========================================
// 7. TIMELINE GANTT CHART ENGINE
// ==========================================
function initTimelineChart() {
  const canvas = document.getElementById('timeline-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');

  function renderGanttTimeline() {
    const w = canvas.width = canvas.parentElement.clientWidth || 600;
    const h = canvas.height = canvas.parentElement.clientHeight || 150;

    ctx.fillStyle = '#0d121d';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#121826';
    ctx.fillRect(0, 0, w, 24);
    ctx.strokeStyle = '#1e283d';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, 24);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    const times = ['12:46:15', '12:46:30', '12:46:45', '12:47:00', '12:47:15', '12:47:30', '12:47:45', '12:48:00', '12:48:15'];
    times.forEach((tm, idx) => {
      const x = 120 + idx * ((w - 140) / 8);
      ctx.fillText(tm, x, 16);
      ctx.beginPath(); ctx.moveTo(x + 20, 24); ctx.lineTo(x + 20, h); ctx.strokeStyle = 'rgba(30, 41, 61, 0.4)'; ctx.stroke();
    });

    const rows = [
      { label: 'Enter and Clear 1st Room', color: '#10B981', start: 0.2, end: 0.9 },
      { label: 'Neutralize OPFOR Target', color: state.units[6].destroyed ? '#10B981' : '#EF4444', start: 0.1, end: 0.75 },
      { label: 'Minimize BLUFOR Casualties', color: '#10B981', start: 0.0, end: 0.8 },
      { label: 'Minimize Collateral Damage', color: '#F59E0B', start: 0.3, end: 0.65 },
      { label: 'Establish Security Engagements', color: '#10B981', start: 0.4, end: 1.0 }
    ];

    rows.forEach((r, idx) => {
      const y = 32 + idx * 24;
      
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText(r.label, 8, y + 14);

      const startX = 140 + r.start * (w - 160);
      const barW = (r.end - r.start) * (w - 160);

      ctx.fillStyle = r.color;
      ctx.fillRect(startX, y + 4, barW, 14);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.strokeRect(startX, y + 4, barW, 14);
    });

    const playX = 140 + (Date.now() * 0.02 % (w - 160));
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, h);
    ctx.stroke();

    requestAnimationFrame(renderGanttTimeline);
  }

  requestAnimationFrame(renderGanttTimeline);
}

// ==========================================
// 8. INSTRUCTOR SCENARIO INJECTS & COA EXECUTION
// ==========================================
function updateLagValue(val) {
  state.commsLagSeconds = parseInt(val);
  state.commsDegraded = state.commsLagSeconds > 0;
  
  const label = document.getElementById('slider-lag-val');
  if (label) label.innerText = `+${val} seconds`;
  const banner = document.getElementById('comms-warning-banner');

  if (state.commsLagSeconds > 0) {
    if (banner) banner.classList.remove('hidden');
    playAlertSound();
  } else {
    if (banner) banner.classList.add('hidden');
  }
}

function applyPresetScenario(type) {
  if (type === 'sandstorm') {
    updateLagValue(90);
    state.droppedFeeds.add(2); state.droppedFeeds.add(6);
    alert("INSTRUCTOR PRESET: Sandstorm EW Jamming activated (+90s Lag)");
  } else if (type === 'cyber') {
    state.phantomIntelActive = true;
    state.gpsSpoofingActive = true;
    alert("INSTRUCTOR PRESET: Cyber Datalink Breach activated");
  } else if (type === 'ambush') {
    updateLagValue(45);
    playAlertSound();
    alert("INSTRUCTOR PRESET: CQB Heavy Ambush activated");
  }
}

function toggleFeedDropout(camId) {
  if (state.droppedFeeds.has(camId)) state.droppedFeeds.delete(camId);
  else state.droppedFeeds.add(camId);
  playBeep(300, 'sawtooth', 0.2);
}

function resetAllInjects() {
  state.commsLagSeconds = 0;
  state.commsDegraded = false;
  state.droppedFeeds.clear();
  state.phantomIntelActive = false;
  state.gpsSpoofingActive = false;
  updateLagValue(0);
}

function overrideCommsSync() {
  resetAllInjects();
  playBeep(1200, 'sine', 0.15);
}

function submitAipQuery() {
  const queryInput = document.getElementById('aip-query-input');
  if (!queryInput || !queryInput.value.trim()) return;
  alert(`AIP TACTICAL ANALYSIS: Query '${queryInput.value}' processed. Recommending COA 1 (CAS Air Strike) to minimize personnel risk.`);
}

function executeCOA(num) {
  state.units.forEach(u => { if (u.type === 'red-target') u.destroyed = true; });
  triggerGunfireSimulation();
  playAlertSound();
  alert(`COMMAND EXECUTED: COA ${num} deployed! Targets neutralized.`);
  
  state.decisionLog.push({
    time: document.getElementById('mission-timer')?.innerText || 'T+04:14:00',
    event: `Executed COA ${num}`,
    action: 'Target Neutralization Strike',
    lag: `+${state.commsLagSeconds}s`,
    outcome: 'TARGET DESTROYED (100%)'
  });
  renderAARTable();
}

function renderAARTable() {
  const tbody = document.getElementById('aar-table-body');
  if (!tbody) return;
  tbody.innerHTML = state.decisionLog.map(row => `
    <tr>
      <td class="p-2.5 text-tcyan font-bold">${row.time}</td>
      <td class="p-2.5 text-slate-300">${row.event}</td>
      <td class="p-2.5 text-slate-300">${row.action}</td>
      <td class="p-2.5 text-tamber">${row.lag}</td>
      <td class="p-2.5 text-tgreen font-bold">${row.outcome}</td>
    </tr>
  `).join('');
}

function exportAARPDF() { window.print(); }
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); playBeep(1000, 'sine', 0.08); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); playBeep(600, 'sine', 0.05); }

// Initialize on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  initLeafletMap();
  initMapCanvas();
  initFeedCanvases();
  initTimelineChart();
  renderAARTable();
});
