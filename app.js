/**
 * Palantir AIP, C2 Cockpit & VR Spatial Military Simulation Platform Engine
 * Advanced Graphical Upgrade: Realistic Satellite Grid, 3D Unit Vectors, VR Spatial Node Array
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
  
  // Units & Positions (Inspired by Image 1 VR Spatial & Palantir AIP)
  units: [
    { name: 'KNIGHT 114 (HIMARS)', x: 180, y: 340, type: 'blue-artillery' },
    { name: '159th Artillery BN', x: 220, y: 390, type: 'blue-artillery' },
    { name: 'Team Foxtrot', x: 150, y: 450, type: 'blue-squad' },
    { name: '72nd Armor Brigade', x: 260, y: 490, type: 'blue-armor' },
    { name: 'Team Omega', x: 530, y: 470, type: 'blue-squad' },
    { name: 'HAWK 11 (F-16)', x: 500, y: 560, type: 'blue-air', angle: 45 },
    
    // Red Threat Targets (Palantir AIP Image 2 replica)
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
// 2. TAB SWITCHER (PALANTIR AIP / HIERARCHY)
// ==========================================
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

// ==========================================
// 3. SIMULATION TICK & CLOCK CONTROLS
// ==========================================
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
// 4. ADVANCED GRAPHICAL TACTICAL CANVAS MAP
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

  // Mouse pan & zoom
  mapCanvas.addEventListener('mousedown', (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (state.targetPingMode) {
      const mgrsE = 4820 + Math.floor(clickX / 10);
      const mgrsN = 9100 + Math.floor((mapCanvas.height - clickY) / 10);
      state.targetPing = { x: clickX, y: clickY, mgrs: `34U ED ${mgrsE} ${mgrsN}` };
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
    if (mgrsElem) mgrsElem.innerText = `34U ED ${mgrsE} ${mgrsN}`;

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

  mapCtx.save();
  mapCtx.clearRect(0, 0, w, h);

  mapCtx.translate(state.map.panX, state.map.panY);
  mapCtx.scale(state.map.zoom, state.map.zoom);

  // 1. High-Res Dark Satellite Terrain Background (Image 1 VR & Image 5 replica)
  mapCtx.fillStyle = '#070b12';
  mapCtx.fillRect(0, 0, w, h);

  // Draw Detailed Topographic Elevation Contour Lines
  mapCtx.strokeStyle = 'rgba(30, 43, 66, 0.4)';
  mapCtx.lineWidth = 1;
  for (let r = 60; r < 700; r += 50) {
    mapCtx.beginPath();
    mapCtx.arc(400, 300, r, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  // Draw 3D Spatial Grid Wireframe Mesh (Image 1 VR Spatial Grid replica)
  mapCtx.strokeStyle = 'rgba(0, 240, 255, 0.07)';
  mapCtx.lineWidth = 1;
  for (let gx = 0; gx < w; gx += 40) {
    mapCtx.beginPath(); mapCtx.moveTo(gx, 0); mapCtx.lineTo(gx, h); mapCtx.stroke();
  }
  for (let gy = 0; gy < h; gy += 40) {
    mapCtx.beginPath(); mapCtx.moveTo(0, gy); mapCtx.lineTo(w, gy); mapCtx.stroke();
  }

  // 2. Red Threat Radius Dome (Palantir AIP Image 2 replica)
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

  // 3. Cyber Datalink Vector Rays (Image 1 & Image 5 replica)
  if (state.layers.cyber) {
    mapCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    mapCtx.lineWidth = 1;
    mapCtx.setLineDash([4, 4]);

    mapCtx.beginPath(); mapCtx.moveTo(180, 340); mapCtx.lineTo(540, 290); mapCtx.stroke();
    mapCtx.beginPath(); mapCtx.moveTo(530, 470); mapCtx.lineTo(540, 290); mapCtx.stroke();
    mapCtx.beginPath(); mapCtx.moveTo(500, 560); mapCtx.lineTo(540, 290); mapCtx.stroke();

    mapCtx.setLineDash([]);

    // Animated Red Cyber Datalink Beam (Image 1 VR Datalink replica)
    const t = Date.now() * 0.001;
    mapCtx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(180, 340);
    mapCtx.lineTo(180 + (540 - 180) * ((t % 2) / 2), 340 + (290 - 340) * ((t % 2) / 2));
    mapCtx.stroke();
  }

  // 4. VR Spatial Holographic Operator Avatar Pin ("Smack Target" marker from Image 1 VR replica)
  if (state.layers.air) {
    mapCtx.save();
    mapCtx.translate(680, 380);
    
    // Glowing Blue Head Silhouette
    mapCtx.fillStyle = '#00F0FF';
    mapCtx.beginPath(); mapCtx.arc(0, -20, 8, 0, Math.PI * 2); mapCtx.fill();
    mapCtx.beginPath(); mapCtx.arc(0, -4, 14, Math.PI, 0); mapCtx.fill();

    // VR Holographic Stand Pole
    mapCtx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath(); mapCtx.moveTo(0, 0); mapCtx.lineTo(0, 30); mapCtx.stroke();

    // "Smack Target" Pill Tag (Image 1 VR replica)
    mapCtx.fillStyle = 'rgba(13, 18, 29, 0.9)';
    mapCtx.strokeStyle = '#00F0FF';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath(); mapCtx.roundRect(15, -15, 80, 20, 4); mapCtx.fill(); mapCtx.stroke();
    mapCtx.fillStyle = '#FFFFFF'; mapCtx.font = 'bold 9px monospace';
    mapCtx.fillText('Smack Target', 22, -2);
    
    mapCtx.restore();
  }

  // 5. SquadMaps Hexagon Waypoint Cap Points (Image 4 replica)
  if (state.layers.land) {
    state.waypoints.forEach(wp => {
      mapCtx.fillStyle = 'rgba(0, 240, 255, 0.15)';
      mapCtx.strokeStyle = '#00F0FF';
      mapCtx.lineWidth = 1.5;

      mapCtx.beginPath();
      mapCtx.moveTo(wp.x, wp.y - 12);
      mapCtx.lineTo(wp.x + 10, wp.y);
      mapCtx.lineTo(wp.x, wp.y + 12);
      mapCtx.lineTo(wp.x - 10, wp.y);
      mapCtx.closePath();
      mapCtx.fill(); mapCtx.stroke();

      mapCtx.fillStyle = '#FFFFFF'; mapCtx.font = 'bold 10px monospace';
      mapCtx.fillText(wp.id, wp.x - 3, wp.y + 3);

      mapCtx.fillStyle = '#94A3B8'; mapCtx.font = '9px monospace';
      mapCtx.fillText(wp.name, wp.x - 25, wp.y - 15);
    });
  }

  // 6. Unit Markers (F-16 Jet Vector, HIMARS Truck, NATO Blue Square & Red Diamond from Image 1 & Image 2)
  state.units.forEach(u => {
    if (u.type === 'red-target') {
      if (!u.destroyed) {
        // Red Diamond NATO Marker
        mapCtx.fillStyle = '#EF4444';
        mapCtx.beginPath();
        mapCtx.moveTo(u.x, u.y - 10);
        mapCtx.lineTo(u.x + 10, u.y);
        mapCtx.lineTo(u.x, u.y + 10);
        mapCtx.lineTo(u.x - 10, u.y);
        mapCtx.closePath();
        mapCtx.fill();
        mapCtx.strokeStyle = '#FFFFFF'; mapCtx.lineWidth = 1.5; mapCtx.stroke();

        mapCtx.fillStyle = '#EF4444'; mapCtx.font = 'bold 9px monospace';
        mapCtx.fillText(u.name, u.x - 35, u.y + 22);
      } else {
        // Neutralized Target Cross
        mapCtx.strokeStyle = '#EF4444'; mapCtx.lineWidth = 2;
        mapCtx.beginPath();
        mapCtx.moveTo(u.x - 10, u.y - 10); mapCtx.lineTo(u.x + 10, u.y + 10);
        mapCtx.moveTo(u.x + 10, u.y - 10); mapCtx.lineTo(u.x - 10, u.y + 10);
        mapCtx.stroke();
        mapCtx.fillStyle = '#10B981'; mapCtx.font = 'bold 9px monospace';
        mapCtx.fillText('NEUTRALIZED', u.x - 30, u.y + 22);
      }
    } else if (u.type === 'blue-air') {
      // Detailed F-16 Fighter Jet Sprite (Image 1 VR F-16 replica)
      u.x += Math.sin(Date.now() * 0.001) * 0.5;
      mapCtx.save();
      mapCtx.translate(u.x, u.y);
      mapCtx.fillStyle = '#00F0FF';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -14);
      mapCtx.lineTo(10, 10);
      mapCtx.lineTo(0, 4);
      mapCtx.lineTo(-10, 10);
      mapCtx.closePath();
      mapCtx.fill();
      
      // Contrail Vector Trail
      mapCtx.strokeStyle = 'rgba(0, 240, 255, 0.4)'; mapCtx.lineWidth = 1.5;
      mapCtx.beginPath(); mapCtx.moveTo(0, 4); mapCtx.lineTo(-30, 40); mapCtx.stroke();

      mapCtx.restore();

      // Air Telemetry Label (21 nmi | FL240)
      mapCtx.fillStyle = '#00F0FF'; mapCtx.font = 'bold 9px monospace';
      mapCtx.fillText(`${u.name} [21 nmi | FL240]`, u.x - 45, u.y + 24);

    } else {
      // Blue Square NATO Unit Marker
      mapCtx.fillStyle = '#1D6BF3';
      mapCtx.fillRect(u.x - 9, u.y - 9, 18, 18);
      mapCtx.strokeStyle = '#FFFFFF'; mapCtx.lineWidth = 1.5;
      mapCtx.strokeRect(u.x - 9, u.y - 9, 18, 18);

      mapCtx.fillStyle = '#00F0FF'; mapCtx.font = 'bold 9px monospace';
      mapCtx.fillText(u.name, u.x - 30, u.y + 24);
    }
  });

  // Target Ping Pulse
  if (state.targetPing) {
    const p = state.targetPing;
    const pulseR = 12 + Math.sin(Date.now() * 0.008) * 6;
    mapCtx.strokeStyle = '#F59E0B'; mapCtx.lineWidth = 2;
    mapCtx.beginPath(); mapCtx.arc(p.x, p.y, pulseR, 0, Math.PI * 2); mapCtx.stroke();

    mapCtx.fillStyle = '#F59E0B'; mapCtx.font = 'bold 10px monospace';
    mapCtx.fillText(`DESIGNATED TARGET [${p.mgrs}]`, p.x - 50, p.y - 12);
  }

  // Ruler Distance Measure
  if (state.map.measureStart && state.map.measureEnd) {
    mapCtx.strokeStyle = '#F59E0B'; mapCtx.lineWidth = 2;
    mapCtx.setLineDash([4, 4]);
    mapCtx.beginPath();
    mapCtx.moveTo(state.map.measureStart.x, state.map.measureStart.y);
    mapCtx.lineTo(state.map.measureEnd.x, state.map.measureEnd.y);
    mapCtx.stroke();
    mapCtx.setLineDash([]);
  }

  mapCtx.restore();
  requestAnimationFrame(renderMap);
}

function toggleDomainLayer(domain) {
  state.layers[domain] = !state.layers[domain];
  const btn = document.getElementById(`layer-${domain}`);
  if (state.layers[domain]) {
    btn.className = "px-2.5 py-1 rounded text-xs font-mono font-bold bg-tcyan/20 text-tcyan border border-tcyan/50 flex items-center gap-1 shadow-[0_0_8px_rgba(0,240,255,0.2)]";
  } else {
    btn.className = "px-2.5 py-1 rounded text-xs font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700 hover:text-white flex items-center gap-1";
  }
  playBeep(900, 'sine', 0.05);
}

// ==========================================
// 5. SUB-UNIT PROCEDURAL VIDEO FEEDS RENDERER
// ==========================================
function initFeedCanvases() {
  for (let i = 1; i <= 6; i++) {
    const canvas = document.getElementById(`feed-canvas-${i}`);
    if (!canvas) continue;
    
    function drawFeed() {
      const ctx = canvas.getContext('2d');
      const w = canvas.width = canvas.parentElement.clientWidth || 180;
      const h = canvas.height = canvas.parentElement.clientHeight || 120;
      const t = Date.now() * 0.002;

      ctx.fillStyle = '#06090e';
      ctx.fillRect(0, 0, w, h);

      const isDropped = state.droppedFeeds.has(i);

      if (isDropped || (state.commsDegraded && Math.random() < 0.35)) {
        const imgData = ctx.createImageData(w, h);
        const data = imgData.data;
        for (let p = 0; p < data.length; p += 4) {
          const v = Math.random() * 255;
          data[p] = v; data[p + 1] = v; data[p + 2] = v; data[p + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('NO SIGNAL / EW JAMMED', w / 2 - 60, h / 2);
      } else {
        if (i === 1 || i === 2) {
          ctx.fillStyle = (i === 2) ? '#052b14' : '#0e1726';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = (i === 2) ? '#10B981' : '#1e293b';
          ctx.fillRect(20, 10, w - 40, h - 10);
          ctx.fillStyle = (i === 2) ? '#052b14' : '#080c14';
          ctx.fillRect(40, 20, w - 80, h - 20);

          const sx = w / 2 + Math.sin(t * 1.5) * 15;
          ctx.fillStyle = (i === 2) ? '#34d399' : '#475569';
          ctx.beginPath(); ctx.arc(sx, h / 2 - 10, 8, 0, Math.PI * 2); ctx.fillRect(sx - 10, h / 2 - 2, 20, 25); ctx.fill();

          ctx.strokeStyle = (i === 2) ? '#10B981' : '#00F0FF';
          ctx.lineWidth = 1; ctx.strokeRect(w / 2 - 15, h / 2 - 15, 30, 30);
        } else {
          ctx.fillStyle = '#0a0f1d';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
          ctx.lineWidth = 1; ctx.strokeRect(30, 20, w - 60, h - 40);

          const bx = 40 + (Math.sin(t * 0.8) + 1) * (w - 100) / 2;
          ctx.strokeStyle = '#F59E0B'; ctx.strokeRect(bx, 30, 25, 35);
          ctx.fillStyle = '#F59E0B'; ctx.font = '9px monospace'; ctx.fillText('TARGET DETECTED', bx - 10, 25);
        }

        ctx.fillStyle = '#00F0FF'; ctx.font = '9px monospace';
        ctx.fillText(`FPS: 30 | LAT: ${state.commsLagSeconds > 0 ? '+' + state.commsLagSeconds + 's' : '12ms'}`, 8, h - 8);
      }

      requestAnimationFrame(drawFeed);
    }
    requestAnimationFrame(drawFeed);
  }
}

// ==========================================
// 6. TIMELINE GANTT CHART ENGINE
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
// 7. INSTRUCTOR SCENARIO INJECTS & COA EXECUTION
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
      <td class="p-2.5 text-slate-200">${row.event}</td>
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
  initMapCanvas();
  initFeedCanvases();
  initTimelineChart();
  renderAARTable();
});
