/**
 * Immersive Multi-Domain Decision-Making Trainer - C2 Engine
 * Developed for Ministry of Defence
 */

// ==========================================
// 1. GLOBAL STATE & CONFIGURATION
// ==========================================
const state = {
  simSpeed: 1, // 0: pause, 1: 1x, 2: 2x, 5: 5x, 10: 10x
  elapsedSeconds: 15165, // T+04:12:45 starting time
  audioEnabled: true,
  
  // Comms & Spectrum State
  commsDegraded: false,
  commsLagSeconds: 0,
  droppedFeeds: new Set(), // Set of feed IDs (1 to 6)
  phantomIntelActive: false,
  gpsSpoofingActive: false,
  
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
    measureEnd: null,
    selectedUnit: 'Squad 1-Alpha'
  },
  
  // Units Data
  units: {
    squadAlpha: { name: 'Squad 1-Alpha', x: 380, y: 290, heading: 45, status: 'NOMINAL', icon: 'infantry' },
    fobAlpha: { name: 'FOB Alpha (Base)', x: 180, y: 440, status: 'SECURE', icon: 'base' },
    opforRadar: { name: 'OPFOR Radar & EW Node', x: 580, y: 180, status: 'ACTIVE', icon: 'radar', destroyed: false },
    opforArmor: { name: 'OPFOR T-90 Tank Battalion', x: 670, y: 260, status: 'CONTESTED', icon: 'armor' },
    uavReaper: { name: 'MQ-9 Reaper (Air-01)', x: 450, y: 220, angle: 0, status: 'ORBITING', icon: 'uav' },
    phantomTank: { name: 'UNCONFIRMED OPFOR CONTACT', x: 320, y: 190, status: 'PHANTOM', icon: 'phantom' }
  },
  
  // Timeline Chart Reference & History
  chart: null,
  chartData: {
    labels: ['T+04:00', 'T+04:03', 'T+04:06', 'T+04:09', 'T+04:12'],
    lagMs: [12, 14, 45, 120, 12],
    noiseDbm: [-104, -98, -62, -45, -104],
    objectivesPct: [30, 45, 60, 65, 65],
    casualties: [0, 0, 1, 1, 1]
  },
  
  // Decision Log for AAR
  decisionLog: [
    { time: 'T+00:15:00', event: 'Exercise Start & FOB Alpha Breach', action: 'Ordered Squad 1-Alpha Advance', lag: '+12ms', outcome: 'SUCCESS (100%)' },
    { time: 'T+01:45:20', event: 'EW Jamming Dome Activated (+45s Lag)', action: 'Switched to Mesh Relay Protocol', lag: '+45s', outcome: 'COMMS MAINTAINED' },
    { time: 'T+03:10:12', event: 'Conflicting Phantom OPFOR Sightings', action: 'Cross-verified via FLIR UAV Recon', lag: '+18s', outcome: 'DECEPTION DISPROVED' }
  ]
};

// Audio Context Web Audio Synthesizer
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

function toggleAudio() {
  state.audioEnabled = !state.audioEnabled;
  const btn = document.getElementById('btn-audio');
  if (state.audioEnabled) {
    btn.innerHTML = `<i data-lucide="volume-2" class="w-4 h-4 text-tcyan"></i>`;
    playBeep(600, 'sine', 0.1);
  } else {
    btn.innerHTML = `<i data-lucide="volume-x" class="w-4 h-4 text-slate-500"></i>`;
  }
  lucide.createIcons();
}

// ==========================================
// 2. SIMULATION TICK & CLOCK CONTROLS
// ==========================================
function setSimSpeed(speed) {
  state.simSpeed = speed;
  ['btn-pause', 'btn-play', 'btn-speed2', 'btn-speed5', 'btn-speed10'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.remove('bg-tcyan/20', 'text-tcyan', 'border-tcyan/40');
  });
  
  let activeId = 'btn-play';
  if (speed === 0) activeId = 'btn-pause';
  if (speed === 2) activeId = 'btn-speed2';
  if (speed === 5) activeId = 'btn-speed5';
  if (speed === 10) activeId = 'btn-speed10';
  
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) activeBtn.classList.add('bg-tcyan/20', 'text-tcyan', 'border-tcyan/40');
  playBeep(1200, 'sine', 0.05);
}

function updateClocks() {
  if (state.simSpeed > 0) {
    state.elapsedSeconds += state.simSpeed;
  }

  // Format Elapsed Time T+HH:MM:SS
  const hrs = String(Math.floor(state.elapsedSeconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((state.elapsedSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(state.elapsedSeconds % 60).padStart(2, '0');
  const timerElem = document.getElementById('mission-timer');
  if (timerElem) timerElem.innerText = `T+${hrs}:${mins}:${secs}`;

  // Live Zulu / UTC Clock
  const now = new Date();
  const utcHours = String(now.getUTCHours()).padStart(2, '0');
  const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
  const utcSecs = String(now.getUTCSeconds()).padStart(2, '0');
  const clockElem = document.getElementById('utc-clock');
  if (clockElem) clockElem.innerText = `${utcHours}:${utcMins}:${utcSecs}Z`;

  // Random micro-vitals variance for operators
  if (Math.random() < 0.2) {
    const hrK = document.getElementById('hr-KAdams');
    if (hrK) hrK.innerText = Math.floor(78 + Math.random() * 8 + (state.commsDegraded ? 25 : 0));
    const hrL = document.getElementById('hr-LMarshall');
    if (hrL) hrL.innerText = Math.floor(110 + Math.random() * 12 + (state.commsDegraded ? 30 : 0));
  }
}

setInterval(updateClocks, 1000);

// ==========================================
// 3. INTERACTIVE TACTICAL CANVAS MAP
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

  // Mouse pan & zoom listeners
  mapCanvas.addEventListener('mousedown', (e) => {
    const rect = mapCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

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

    // Update MGRS Readout
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

  window.addEventListener('mouseup', () => {
    state.map.isDragging = false;
  });

  mapCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      mapZoomIn();
    } else {
      mapZoomOut();
    }
  });

  requestAnimationFrame(renderMap);
}

function mapZoomIn() {
  state.map.zoom = Math.min(state.map.zoom + 0.15, 2.5);
}
function mapZoomOut() {
  state.map.zoom = Math.max(state.map.zoom - 0.15, 0.5);
}
function resetMapView() {
  state.map.zoom = 1.0;
  state.map.panX = 0;
  state.map.panY = 0;
  state.map.measuring = false;
  state.map.measureStart = null;
  state.map.measureEnd = null;
  document.getElementById('btn-measure')?.classList.remove('bg-tcyan/20', 'text-tcyan', 'border-tcyan/50');
}

function toggleMapMeasure() {
  state.map.measuring = !state.map.measuring;
  state.map.measureStart = null;
  state.map.measureEnd = null;
  const btn = document.getElementById('btn-measure');
  if (state.map.measuring) {
    btn.classList.add('bg-tcyan/20', 'text-tcyan', 'border-tcyan/50');
  } else {
    btn.classList.remove('bg-tcyan/20', 'text-tcyan', 'border-tcyan/50');
  }
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

  // Apply Pan & Zoom
  mapCtx.translate(state.map.panX, state.map.panY);
  mapCtx.scale(state.map.zoom, state.map.zoom);

  // 1. Render Map Background & Topographic Contour Simulation
  mapCtx.fillStyle = '#080c14';
  mapCtx.fillRect(0, 0, w, h);

  // Contour Circles (Terrain Topography)
  mapCtx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
  mapCtx.lineWidth = 1;
  for (let r = 80; r < 600; r += 70) {
    mapCtx.beginPath();
    mapCtx.arc(350, 250, r, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  // 2. Render Contested Tactical Zone (Red Overlay Polygon)
  if (state.layers.land) {
    mapCtx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    mapCtx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    mapCtx.setLineDash([4, 4]);
    mapCtx.beginPath();
    mapCtx.moveTo(480, 120);
    mapCtx.lineTo(720, 140);
    mapCtx.lineTo(750, 340);
    mapCtx.lineTo(520, 320);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.setLineDash([]);

    // Zone Label
    mapCtx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    mapCtx.font = 'bold 10px monospace';
    mapCtx.fillText('CONTESTED OPFOR SECTOR BRAVO', 530, 150);
  }

  // 3. Render EW Domain Spectrum Jamming Radius
  if (state.layers.ew && !state.units.opforRadar.destroyed) {
    const radar = state.units.opforRadar;
    const time = Date.now() * 0.003;
    const pulseR = 80 + Math.sin(time) * 15 + (state.commsDegraded ? 40 : 0);

    const grad = mapCtx.createRadialGradient(radar.x, radar.y, 10, radar.x, radar.y, pulseR);
    grad.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
    grad.addColorStop(0.7, 'rgba(239, 68, 68, 0.15)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    mapCtx.fillStyle = grad;
    mapCtx.beginPath();
    mapCtx.arc(radar.x, radar.y, pulseR, 0, Math.PI * 2);
    mapCtx.fill();

    // Radar Sweep Line
    mapCtx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    mapCtx.moveTo(radar.x, radar.y);
    mapCtx.lineTo(radar.x + Math.cos(time) * pulseR, radar.y + Math.sin(time) * pulseR);
    mapCtx.stroke();
  }

  // 4. Render Cyber Datalink Vectors (Mesh Network Lines)
  if (state.layers.cyber) {
    const sq = state.units.squadAlpha;
    const fob = state.units.fobAlpha;
    const uav = state.units.uavReaper;

    mapCtx.strokeStyle = state.commsDegraded ? 'rgba(245, 158, 11, 0.6)' : 'rgba(0, 240, 255, 0.5)';
    mapCtx.lineWidth = 1.5;
    mapCtx.setLineDash([6, 4]);

    // Datalink 1: FOB to Squad
    mapCtx.beginPath();
    mapCtx.moveTo(fob.x, fob.y);
    mapCtx.lineTo(sq.x, sq.y);
    mapCtx.stroke();

    // Datalink 2: Squad to UAV
    mapCtx.beginPath();
    mapCtx.moveTo(sq.x, sq.y);
    mapCtx.lineTo(uav.x, uav.y);
    mapCtx.stroke();

    mapCtx.setLineDash([]);

    // Datalink Animated Data Packets
    const pktPos = (Date.now() * 0.05) % 100 / 100;
    const pktX = fob.x + (sq.x - fob.x) * pktPos;
    const pktY = fob.y + (sq.y - fob.y) * pktPos;
    mapCtx.fillStyle = state.commsDegraded ? '#EF4444' : '#00F0FF';
    mapCtx.beginPath();
    mapCtx.arc(pktX, pktY, 3, 0, Math.PI * 2);
    mapCtx.fill();
  }

  // 5. Render Air Domain Flight Corridor & UAV Orbit
  if (state.layers.air) {
    const uav = state.units.uavReaper;
    uav.angle += (0.015 * state.simSpeed);
    uav.x = 420 + Math.cos(uav.angle) * 90;
    uav.y = 210 + Math.sin(uav.angle) * 45;

    // UAV Orbit Ring
    mapCtx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
    mapCtx.lineWidth = 1;
    mapCtx.setLineDash([3, 3]);
    mapCtx.beginPath();
    mapCtx.ellipse(420, 210, 90, 45, 0, 0, Math.PI * 2);
    mapCtx.stroke();
    mapCtx.setLineDash([]);

    // UAV Icon (Blue Chevron Airplane)
    mapCtx.save();
    mapCtx.translate(uav.x, uav.y);
    mapCtx.rotate(uav.angle + Math.PI / 2);
    mapCtx.fillStyle = '#00F0FF';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);
    mapCtx.lineTo(6, 6);
    mapCtx.lineTo(0, 3);
    mapCtx.lineTo(-6, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();

    // UAV Camera Cone Footprint
    mapCtx.fillStyle = 'rgba(0, 240, 255, 0.05)';
    mapCtx.beginPath();
    mapCtx.moveTo(uav.x, uav.y);
    mapCtx.lineTo(uav.x - 30, uav.y + 50);
    mapCtx.lineTo(uav.x + 30, uav.y + 50);
    mapCtx.closePath();
    mapCtx.fill();
  }

  // 6. Render Unit Markers (NATO Standard Style Symbols)

  // FOB Alpha Base Marker
  const fob = state.units.fobAlpha;
  mapCtx.fillStyle = '#10B981';
  mapCtx.fillRect(fob.x - 10, fob.y - 10, 20, 20);
  mapCtx.strokeStyle = '#ffffff';
  mapCtx.lineWidth = 1.5;
  mapCtx.strokeRect(fob.x - 10, fob.y - 10, 20, 20);
  mapCtx.fillStyle = '#ffffff';
  mapCtx.font = 'bold 9px monospace';
  mapCtx.fillText('FOB ALPHA', fob.x - 22, fob.y + 22);

  // BLUFOR Squad 1-Alpha Infantry Marker
  const sq = state.units.squadAlpha;
  if (state.gpsSpoofingActive) {
    sq.x += (Math.random() - 0.5) * 1.5;
    sq.y += (Math.random() - 0.5) * 1.5;
  }
  mapCtx.fillStyle = '#00F0FF';
  mapCtx.beginPath();
  mapCtx.arc(sq.x, sq.y, 9, 0, Math.PI * 2);
  mapCtx.fill();
  mapCtx.strokeStyle = '#ffffff';
  mapCtx.lineWidth = 2;
  mapCtx.stroke();
  // Inner NATO Infantry Cross
  mapCtx.strokeStyle = '#06090e';
  mapCtx.lineWidth = 1.5;
  mapCtx.beginPath();
  mapCtx.moveTo(sq.x - 5, sq.y - 5); mapCtx.lineTo(sq.x + 5, sq.y + 5);
  mapCtx.moveTo(sq.x + 5, sq.y - 5); mapCtx.lineTo(sq.x - 5, sq.y + 5);
  mapCtx.stroke();

  mapCtx.fillStyle = '#00F0FF';
  mapCtx.font = 'bold 10px monospace';
  mapCtx.fillText('SQUAD 1-ALPHA', sq.x - 32, sq.y - 14);

  // OPFOR Radar EW Station Marker
  const radar = state.units.opforRadar;
  if (!radar.destroyed) {
    mapCtx.fillStyle = '#EF4444';
    mapCtx.beginPath();
    mapCtx.moveTo(radar.x, radar.y - 10);
    mapCtx.lineTo(radar.x + 10, radar.y + 8);
    mapCtx.lineTo(radar.x - 10, radar.y + 8);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.strokeStyle = '#ffffff';
    mapCtx.stroke();
    mapCtx.fillStyle = '#EF4444';
    mapCtx.font = 'bold 9px monospace';
    mapCtx.fillText('OPFOR RADAR / EW', radar.x - 36, radar.y + 20);
  } else {
    // Destroyed Target Marker
    mapCtx.strokeStyle = '#EF4444';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(radar.x - 12, radar.y - 12); mapCtx.lineTo(radar.x + 12, radar.y + 12);
    mapCtx.moveTo(radar.x + 12, radar.y - 12); mapCtx.lineTo(radar.x - 12, radar.y + 12);
    mapCtx.stroke();
    mapCtx.fillStyle = '#10B981';
    mapCtx.font = 'bold 9px monospace';
    mapCtx.fillText('TARGET NEUTRALIZED', radar.x - 36, radar.y + 20);
  }

  // OPFOR Armor Battalion Marker
  const armor = state.units.opforArmor;
  mapCtx.fillStyle = '#EF4444';
  mapCtx.fillRect(armor.x - 8, armor.y - 6, 16, 12);
  mapCtx.strokeStyle = '#ffffff';
  mapCtx.strokeRect(armor.x - 8, armor.y - 6, 16, 12);
  mapCtx.fillStyle = '#EF4444';
  mapCtx.font = 'bold 9px monospace';
  mapCtx.fillText('OPFOR T-90 BATTALION', armor.x - 42, armor.y + 20);

  // Phantom Intel Deception Marker
  if (state.phantomIntelActive) {
    const pt = state.units.phantomTank;
    mapCtx.fillStyle = 'rgba(139, 92, 246, 0.8)';
    mapCtx.fillRect(pt.x - 8, pt.y - 6, 16, 12);
    mapCtx.strokeStyle = '#F59E0B';
    mapCtx.strokeRect(pt.x - 8, pt.y - 6, 16, 12);
    mapCtx.fillStyle = '#F59E0B';
    mapCtx.font = 'bold 9px monospace';
    mapCtx.fillText('? UNCONFIRMED CONTACT (CONF 42%)', pt.x - 50, pt.y + 20);
  }

  // 7. Render Measurement Ruler Tool Vector Line
  if (state.map.measureStart && state.map.measureEnd) {
    mapCtx.strokeStyle = '#F59E0B';
    mapCtx.lineWidth = 2;
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
  
  // Update active layer readout label
  const activeNames = Object.keys(state.layers).filter(k => state.layers[k]).map(k => k.toUpperCase());
  const labelElem = document.getElementById('map-domain-label');
  if (labelElem) labelElem.innerText = activeNames.join(' + ') || 'NONE';
  playBeep(900, 'sine', 0.05);
}

// ==========================================
// 4. SUB-UNIT PROCEDURAL VIDEO FEEDS RENDERER
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
        // Draw TV Static Noise Signal Loss
        const imgData = ctx.createImageData(w, h);
        const data = imgData.data;
        for (let p = 0; p < data.length; p += 4) {
          const v = Math.random() * 255;
          data[p] = v;
          data[p + 1] = v;
          data[p + 2] = v;
          data[p + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);

        // Static Text
        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('NO SIGNAL / EW JAMMED', w / 2 - 60, h / 2);
      } else {
        // Render Procedural Tactical Video Feeds
        if (i === 1 || i === 2) {
          // Optical/NVG Operator Camera View (Squad moving silhouettes)
          ctx.fillStyle = (i === 2) ? '#052b14' : '#0e1726'; // NVG green phosphor tint for Cam 2
          ctx.fillRect(0, 0, w, h);

          // Moving door frame & operator silhouette
          ctx.fillStyle = (i === 2) ? '#10B981' : '#1e293b';
          ctx.fillRect(20, 10, w - 40, h - 10);
          ctx.fillStyle = (i === 2) ? '#052b14' : '#080c14';
          ctx.fillRect(40, 20, w - 80, h - 20);

          // Squad Soldier Silhouette moving back & forth
          const sx = w / 2 + Math.sin(t * 1.5) * 15;
          ctx.fillStyle = (i === 2) ? '#34d399' : '#475569';
          ctx.beginPath();
          ctx.arc(sx, h / 2 - 10, 8, 0, Math.PI * 2); // Head
          ctx.fillRect(sx - 10, h / 2 - 2, 20, 25); // Body
          ctx.fill();

          // HUD Reticle
          ctx.strokeStyle = (i === 2) ? '#10B981' : '#00F0FF';
          ctx.lineWidth = 1;
          ctx.strokeRect(w / 2 - 15, h / 2 - 15, 30, 30);

        } else if (i === 3 || i === 5) {
          // FLIR Thermal Camera (Hot orange/white signatures)
          ctx.fillStyle = '#111827';
          ctx.fillRect(0, 0, w, h);

          // Thermal Heat Source Blob
          const tx = w / 2 + Math.cos(t) * 20;
          const ty = h / 2 + Math.sin(t) * 10;
          const grad = ctx.createRadialGradient(tx, ty, 5, tx, ty, 25);
          grad.addColorStop(0, '#FFFFFF');
          grad.addColorStop(0.5, '#F59E0B');
          grad.addColorStop(1, '#EF4444');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(tx, ty, 25, 0, Math.PI * 2);
          ctx.fill();

        } else {
          // CQB Room / Perimeter Surveillance Cam
          ctx.fillStyle = '#0a0f1d';
          ctx.fillRect(0, 0, w, h);

          // Grid Overlay & Motion Target Box
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(30, 20, w - 60, h - 40);

          const bx = 40 + (Math.sin(t * 0.8) + 1) * (w - 100) / 2;
          ctx.strokeStyle = '#F59E0B';
          ctx.strokeRect(bx, 30, 25, 35);
          ctx.fillStyle = '#F59E0B';
          ctx.font = '9px monospace';
          ctx.fillText('TARGET DETECTED', bx - 10, 25);
        }

        // Live Telemetry Overlay Text
        ctx.fillStyle = '#00F0FF';
        ctx.font = '9px monospace';
        ctx.fillText(`FPS: 30 | LAT: ${state.commsLagSeconds > 0 ? '+' + state.commsLagSeconds + 's' : '12ms'}`, 8, h - 8);
      }

      requestAnimationFrame(drawFeed);
    }
    requestAnimationFrame(drawFeed);
  }
}

// ==========================================
// 5. TIMELINE CHART ENGINE (CHART.JS)
// ==========================================
function initTimelineChart() {
  const canvas = document.getElementById('timeline-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: state.chartData.labels,
      datasets: [
        {
          label: 'Latency Lag (ms)',
          data: state.chartData.lagMs,
          borderColor: '#00F0FF',
          backgroundColor: 'rgba(0, 240, 255, 0.1)',
          tension: 0.3,
          borderWidth: 2,
          yAxisID: 'yLag'
        },
        {
          label: 'EW Noise (dBm)',
          data: state.chartData.noiseDbm,
          borderColor: '#F59E0B',
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          tension: 0.2,
          borderWidth: 1.5,
          yAxisID: 'yNoise'
        },
        {
          label: 'Objective %',
          data: state.chartData.objectivesPct,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          yAxisID: 'yPct'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#111827',
          titleColor: '#00F0FF',
          bodyFont: { family: 'JetBrains Mono' }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.3)' },
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 9 } }
        },
        yLag: {
          type: 'linear',
          position: 'left',
          grid: { color: 'rgba(51, 65, 85, 0.2)' },
          ticks: { color: '#00F0FF', font: { family: 'JetBrains Mono', size: 9 } },
          title: { display: true, text: 'Lag (ms)', color: '#00F0FF', font: { size: 9 } }
        },
        yNoise: {
          type: 'linear',
          position: 'right',
          display: false
        },
        yPct: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 100,
          ticks: { color: '#10B981', font: { family: 'JetBrains Mono', size: 9 } },
          title: { display: true, text: 'Objective %', color: '#10B981', font: { size: 9 } }
        }
      }
    }
  });
}

// Push live data point to chart
function updateChartData(lagMs, noiseDbm, pct) {
  if (!state.chart) return;
  const timeLabel = document.getElementById('mission-timer')?.innerText.replace('T+', '') || 'T+04:15';
  
  if (state.chart.data.labels.length > 15) {
    state.chart.data.labels.shift();
    state.chart.data.datasets[0].data.shift();
    state.chart.data.datasets[1].data.shift();
    state.chart.data.datasets[2].data.shift();
  }

  state.chart.data.labels.push(timeLabel);
  state.chart.data.datasets[0].data.push(lagMs);
  state.chart.data.datasets[1].data.push(noiseDbm);
  state.chart.data.datasets[2].data.push(pct);
  state.chart.update('none');
}

// ==========================================
// 6. INSTRUCTOR SCENARIO ENGINE INJECTS
// ==========================================
function updateLagValue(val) {
  state.commsLagSeconds = parseInt(val);
  state.commsDegraded = state.commsLagSeconds > 0;
  
  const label = document.getElementById('slider-lag-val');
  if (label) label.innerText = `+${val} seconds`;

  const badge = document.getElementById('comms-badge');
  const lagText = document.getElementById('telemetry-lag');
  const bar = document.getElementById('telemetry-bar');
  const banner = document.getElementById('comms-warning-banner');

  if (state.commsLagSeconds > 0) {
    if (badge) {
      badge.className = "text-[9px] font-mono text-tred bg-red-950/80 px-1.5 py-0.5 rounded border border-red-800 font-bold animate-pulse";
      badge.innerText = "DEGRADED // EW INJECTED";
    }
    if (lagText) {
      lagText.className = "text-tred font-bold";
      lagText.innerText = `+${val} s (LAG)`;
    }
    if (bar) {
      bar.className = "bg-tred h-full transition-all duration-500";
      bar.style.width = `${Math.min(val * 1.5, 100)}%`;
    }
    if (banner) banner.classList.remove('hidden');

    playAlertSound();
    updateChartData(val * 1000, -45, 65);
  } else {
    if (badge) {
      badge.className = "text-[9px] font-mono text-tgreen bg-green-950/60 px-1.5 py-0.5 rounded border border-green-800 font-bold";
      badge.innerText = "NOMINAL";
    }
    if (lagText) {
      lagText.className = "text-tgreen font-bold";
      lagText.innerText = "+12 ms";
    }
    if (bar) {
      bar.className = "bg-tgreen h-full transition-all duration-500";
      bar.style.width = "15%";
    }
    if (banner) banner.classList.add('hidden');

    updateChartData(12, -104, 65);
  }
}

function toggleFeedDropout(camId) {
  if (state.droppedFeeds.has(camId)) {
    state.droppedFeeds.delete(camId);
    document.getElementById(`inj-cam-${camId}`)?.classList.remove('bg-red-950', 'border-red-500', 'text-red-300');
    document.getElementById(`feed-overlay-${camId}`)?.classList.add('hidden');
  } else {
    state.droppedFeeds.add(camId);
    document.getElementById(`inj-cam-${camId}`)?.classList.add('bg-red-950', 'border-red-500', 'text-red-300');
    document.getElementById(`feed-overlay-${camId}`)?.classList.remove('hidden');
    playBeep(300, 'sawtooth', 0.2);
  }
}

function injectConflictingIntel() {
  state.phantomIntelActive = true;
  playAlertSound();
  alert("INSTRUCTOR INJECT: Phantom OPFOR Tank Battalion spotted at GRID 34U ED 4850 9180. Conflicting intelligence report sent to map.");
  state.decisionLog.push({
    time: document.getElementById('mission-timer')?.innerText || 'T+04:13:00',
    event: 'INJECT: Conflicting Phantom OPFOR Report',
    action: 'Radar Cross-verification Active',
    lag: `+${state.commsLagSeconds}s`,
    outcome: 'UNVERIFIED PHANTOM'
  });
  renderAARTable();
}

function injectGpsSpoofing() {
  state.gpsSpoofingActive = !state.gpsSpoofingActive;
  playAlertSound();
  if (state.gpsSpoofingActive) {
    alert("INSTRUCTOR INJECT: GPS Spoofing active! Squad 1-Alpha position vector drifting on map.");
  } else {
    alert("GPS Spoofing cleared.");
  }
}

function resetAllInjects() {
  state.commsLagSeconds = 0;
  state.commsDegraded = false;
  state.droppedFeeds.clear();
  state.phantomIntelActive = false;
  state.gpsSpoofingActive = false;
  
  const slider = document.getElementById('lag-slider');
  if (slider) slider.value = 0;
  updateLagValue(0);

  for (let i = 1; i <= 6; i++) {
    document.getElementById(`inj-cam-${i}`)?.classList.remove('bg-red-950', 'border-red-500', 'text-red-300');
    document.getElementById(`feed-overlay-${i}`)?.classList.add('hidden');
  }
}

function overrideCommsSync() {
  resetAllInjects();
  playBeep(1200, 'sine', 0.15);
}

// ==========================================
// 7. AI COA ASSISTANT & EXECUTION ENGINE
// ==========================================
let selectedCOANum = 1;

function selectCOA(num) {
  selectedCOANum = num;
  [1, 2, 3].forEach(n => {
    const card = document.getElementById(`coa-card-${n}`);
    if (card) {
      if (n === num) {
        card.classList.add('border-tcyan', 'shadow-[0_0_15px_rgba(0,240,255,0.3)]');
      } else {
        card.classList.remove('border-tcyan', 'shadow-[0_0_15px_rgba(0,240,255,0.3)]');
      }
    }
  });
  playBeep(950, 'sine', 0.05);
}

function executeCOA(num) {
  const rationale = document.getElementById('coa-rationale')?.value || 'Standard Tactical Protocol Executed';
  
  if (num === 1) {
    // Air Strike CAS Execution
    state.units.opforRadar.destroyed = true;
    playAlertSound();
    alert("COMMAND EXECUTED: F-35B Air Strike missile impact confirmed! OPFOR EW Jammer Facility Destroyed!");
  } else if (num === 2) {
    // HIMARS Rocket Execution
    state.units.opforRadar.destroyed = true;
    playAlertSound();
    alert("COMMAND EXECUTED: HIMARS Battery barrage impact confirmed! Target EW Facility Destroyed!");
  } else {
    // Squad Infiltration CQB
    state.units.opforRadar.destroyed = true;
    playBeep(1100, 'sine', 0.2);
    alert("COMMAND EXECUTED: Squad 1-Alpha breached facility and placed demolition charges. EW Facility Destroyed!");
  }

  // Log to AAR Table
  state.decisionLog.push({
    time: document.getElementById('mission-timer')?.innerText || 'T+04:14:00',
    event: `Executed COA ${num} (${num === 1 ? 'CAS Air Strike' : num === 2 ? 'HIMARS Artillery' : 'Squad Infiltration'})`,
    action: rationale,
    lag: `+${state.commsLagSeconds}s`,
    outcome: 'TARGET DESTROYED (100%)'
  });

  renderAARTable();
  updateChartData(state.commsLagSeconds * 1000, -104, 100);
  closeModal('coa-modal');
}

// ==========================================
// 8. AFTER ACTION REVIEW (AAR) DEBRIEF REPORT
// ==========================================
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

function exportAARPDF() {
  window.print();
}

// ==========================================
// 9. MODAL CONTROLS & UTILITIES
// ==========================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('hidden');
    playBeep(1000, 'sine', 0.08);
  }
  if (id === 'aar-modal') renderAARTable();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('hidden');
    playBeep(600, 'sine', 0.05);
  }
}

function toggleTree(id) {
  const content = document.getElementById(`${id}-content`);
  const arrow = document.getElementById(`${id}-arrow`);
  if (content && arrow) {
    content.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
  }
}

function focusOperator(name) {
  playBeep(1100, 'sine', 0.05);
  state.map.panX = -100;
  state.map.panY = -50;
  state.map.zoom = 1.4;
}

// Initialize on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  initMapCanvas();
  initFeedCanvases();
  initTimelineChart();
  renderAARTable();
});
