const WORLD = { w: 1800, h: 1400 };
const UNDER = { w: 1200, h: 720 };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rand = (min, max) => min + Math.random() * (max - min);
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const TAU = Math.PI * 2;

export const WEAPONS = {
  kestrel: { name: 'Kestrel-7', category: 'Assault rifle', damage: 26, rate: 165, speed: 670, spread: .075, mag: 30, reserve: 150, range: 610, handling: 78, recoil: 57 },
  vox: { name: 'Vox-9', category: 'Submachine gun', damage: 18, rate: 92, speed: 625, spread: .11, mag: 35, reserve: 175, range: 340, handling: 92, recoil: 44 },
  rook: { name: 'Rook DMR', category: 'Marksman rifle', damage: 48, rate: 390, speed: 820, spread: .032, mag: 12, reserve: 72, range: 850, handling: 55, recoil: 73 },
};

const surfaceBuildings = [
  { x: 92, y: 86, w: 270, h: 235, name: 'NORTHLINE APTS', type: 'residential' },
  { x: 630, y: 76, w: 292, h: 250, name: 'CROWN HOTEL', type: 'highrise' },
  { x: 1157, y: 89, w: 304, h: 238, name: 'SECTOR OFFICES', type: 'office' },
  { x: 1637, y: 88, w: 131, h: 247, name: 'PARKING', type: 'industrial' },
  { x: 90, y: 505, w: 280, h: 272, name: 'MERCER BLOCK', type: 'residential' },
  { x: 625, y: 491, w: 295, h: 275, name: 'NOVA EXCHANGE', type: 'office' },
  { x: 1148, y: 493, w: 310, h: 274, name: 'TRANSIT WORKS', type: 'industrial' },
  { x: 1634, y: 502, w: 137, h: 267, name: 'FREIGHT 04', type: 'industrial' },
  { x: 92, y: 1018, w: 276, h: 180, name: 'OLD MARKET', type: 'residential' },
  { x: 628, y: 1023, w: 293, h: 174, name: 'BROADCAST', type: 'office' },
  { x: 1150, y: 1017, w: 310, h: 190, name: 'MOTOR POOL', type: 'industrial' },
  { x: 1630, y: 1018, w: 146, h: 184, name: 'WATERFRONT', type: 'industrial' },
];

function roundedRect(ctx, x, y, w, h, r = 8) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function circleRectHit(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  return dist(x, y, cx, cy) < r;
}

function lineRectHit(x1, y1, x2, y2, rect) {
  // A few samples are sufficient for the short tactical wall and building checks in this slice.
  const steps = Math.max(3, Math.ceil(dist(x1, y1, x2, y2) / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return true;
  }
  return false;
}

function makeActor(id, x, y, options = {}) {
  return {
    id, x, y, vx: 0, vy: 0, angle: rand(0, TAU), health: options.health ?? 100,
    alive: true, friendly: Boolean(options.friendly), guard: Boolean(options.guard),
    name: options.name || `OP-${String(id).padStart(2, '0')}`,
    fireTimer: rand(.4, 2), thinkTimer: rand(0, 1), wanderX: x, wanderY: y,
    strafe: Math.random() < .5 ? -1 : 1, tagDropped: false,
  };
}

export class CanvasArena {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.options = options;
    this.weaponKey = options.weapon in WEAPONS ? options.weapon : 'kestrel';
    this.weapon = WEAPONS[this.weaponKey];
    this.mode = options.mode || 'collapse';
    this.teamSize = Number(options.teamSize) || 4;
    this.aimAssist = Boolean(options.aimAssist);
    this.autoPickup = options.autoPickup !== false;
    this.quickLoot = options.quickLoot !== false;
    this.smartReload = options.smartReload !== false;
    this.sensitivity = Number(options.sensitivity) || 100;
    this.spatialAudio = options.spatialAudio !== false;
    this.audioContext = null;
    this.audioMaster = null;
    this.footstepTimer = 0;
    this.gyroMode = options.gyroMode || 'off';
    this.eventName = options.eventName || ['BLACKOUT', 'SANDSTORM', 'FLOOD ALERT'][Math.floor(Math.random() * 3)];
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.running = false;
    this.paused = false;
    this.ended = false;
    this.lastFrame = 0;
    this.elapsed = 0;
    this.lastHudTime = 0;
    this.lastMiniTime = 0;
    this.raf = 0;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.grenadeCooldown = 0;
    this.shotFlash = 0;
    this.score = 0;
    this.kills = 0;
    this.damage = 0;
    this.ammo = this.weapon.mag;
    this.reserve = this.weapon.reserve;
    this.weaponInventory = Object.fromEntries(Object.entries(WEAPONS).map(([key, weapon]) => [key, { ammo: weapon.mag, reserve: weapon.reserve }]));
    this.grenades = 1;
    this.reloading = false;
    this.isCrouched = false;
    this.isADS = false;
    this.isSprinting = false;
    this.inVehicle = false;
    this.eventActive = false;
    this.eventElapsed = 0;
    this.eventLength = 90;
    this.eventTriggered = false;
    this.underground = false;
    this.intelRecovered = false;
    this.extractionProgress = 0;
    this.interactionProgress = 0;
    this.interactionType = '';
    this.interactionLatch = false;
    this.contextTarget = null;
    this.zoneDamageTimer = 0;
    this.endNotified = false;
    this.messageTimer = 0;
    this.particles = [];
    this.bullets = [];
    this.grenadeObjects = [];
    this.lastShotAt = 0;
    this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
    this.input = { mx: 0, my: 0, ax: 1, ay: 0, fire: false, ads: false, crouch: false, sprint: false, jump: false, interact: false };
    this.player = { x: 420, y: 915, vx: 0, vy: 0, angle: -Math.PI / 3, health: 100, armor: 82, maxHealth: 100, maxArmor: 100, radius: 13, inUnderground: false, jumpTimer: 0, hitFlash: 0, lastDamageAt: 0 };
    this.aimTargetAngle = this.player.angle;
    this.surfaceMap = document.createElement('canvas');
    this.surfaceMap.width = WORLD.w;
    this.surfaceMap.height = WORLD.h;
    this.surfaceCtx = this.surfaceMap.getContext('2d');
    this.underMap = document.createElement('canvas');
    this.underMap.width = UNDER.w;
    this.underMap.height = UNDER.h;
    this.underCtx = this.underMap.getContext('2d');
    this.surfaceSolids = surfaceBuildings.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
    this.underSolids = [
      { x: 0, y: 0, w: UNDER.w, h: 115 }, { x: 0, y: 0, w: 58, h: UNDER.h },
      { x: 0, y: UNDER.h - 52, w: UNDER.w, h: 52 }, { x: UNDER.w - 45, y: 0, w: 45, h: 485 },
      { x: 0, y: 438, w: 340, h: 125 }, { x: 392, y: 450, w: 250, h: 115 },
      { x: 1015, y: 590, w: 185, h: 130 },
    ];
    this.breachWall = { x: 947, y: 824, w: 92, h: 18, hp: 120, maxHp: 120, broken: false };
    this.surfaceLoot = [
      { x: 410, y: 870, kind: 'ammo', amount: 45, label: 'Ammo cache' },
      { x: 520, y: 360, kind: 'armor', amount: 30, label: 'Tier II plates' },
      { x: 1060, y: 490, kind: 'ammo', amount: 36, label: 'Ammo cache' },
      { x: 1468, y: 863, kind: 'armor', amount: 35, label: 'Armor plates' },
      { x: 1070, y: 1260, kind: 'ammo', amount: 40, label: 'Ammo cache' },
    ].map((item, index) => ({ ...item, index, collected: false, underground: false }));
    this.underLoot = [
      { x: 565, y: 359, kind: 'ammo', amount: 32, label: 'Metro cache' },
      { x: 934, y: 495, kind: 'armor', amount: 30, label: 'Armor plates' },
    ].map((item, index) => ({ ...item, index: index + 10, collected: false, underground: true }));
    this.dogTags = [];
    this.extraction = { x: 1576, y: 1262, unlocked: false };
    this.metro = { x: 1057, y: 895 };
    this.reinforcement = { x: 1220, y: 373 };
    this.buggy = { x: 1534, y: 882, available: true, hp: 100 };
    this.intel = { x: 810, y: 253 };
    this.trainExit = { x: 1093, y: 537 };
    this.underMetro = { x: 134, y: 342 };
    this.zone = { x: 905, y: 718, start: 1150, end: 118, radius: 1150 };
    this.enemyBots = [];
    this.crew = [];
    this.underGuards = [];
    this.createMaps();
    this.createActors();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement || this.canvas);
    this.bindEvents();
    this.resize();
    this.emitHud(true);
  }

  createMaps() {
    const ctx = this.surfaceCtx;
    ctx.fillStyle = '#20292a';
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    // Asphalt and concrete blocks give the map its own Kharon grid language.
    for (let y = 0; y < WORLD.h; y += 46) {
      ctx.strokeStyle = y % 92 === 0 ? 'rgba(170,196,188,.035)' : 'rgba(170,196,188,.018)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke();
    }
    const roads = [
      { x: 0, y: 349, w: WORLD.w, h: 104 }, { x: 0, y: 834, w: WORLD.w, h: 132 },
      { x: 0, y: 1211, w: WORLD.w, h: 74 }, { x: 417, y: 0, w: 111, h: WORLD.h },
      { x: 991, y: 0, w: 133, h: WORLD.h }, { x: 1531, y: 0, w: 107, h: WORLD.h },
    ];
    for (const road of roads) {
      ctx.fillStyle = '#30383a'; ctx.fillRect(road.x, road.y, road.w, road.h);
      ctx.strokeStyle = 'rgba(206,215,205,.13)'; ctx.lineWidth = 3;
      if (road.w > road.h) {
        ctx.beginPath(); ctx.moveTo(road.x, road.y + 5); ctx.lineTo(road.x + road.w, road.y + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(road.x, road.y + road.h - 5); ctx.lineTo(road.x + road.w, road.y + road.h - 5); ctx.stroke();
        ctx.setLineDash([18, 21]); ctx.strokeStyle = 'rgba(215,204,156,.25)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(road.x, road.y + road.h / 2); ctx.lineTo(road.x + road.w, road.y + road.h / 2); ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.beginPath(); ctx.moveTo(road.x + 5, road.y); ctx.lineTo(road.x + 5, road.y + road.h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(road.x + road.w - 5, road.y); ctx.lineTo(road.x + road.w - 5, road.y + road.h); ctx.stroke();
        ctx.setLineDash([18, 21]); ctx.strokeStyle = 'rgba(215,204,156,.25)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(road.x + road.w / 2, road.y); ctx.lineTo(road.x + road.w / 2, road.y + road.h); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // A reclaimed plaza and tree line break up the hard urban silhouette.
    ctx.fillStyle = '#293331'; ctx.fillRect(1150, 823, 280, 144);
    ctx.fillStyle = 'rgba(119, 148, 113, .13)'; ctx.fillRect(1170, 841, 240, 107);
    for (let i = 0; i < 22; i++) {
      const tx = 1185 + (i % 8) * 29 + rand(-4, 4), ty = 851 + Math.floor(i / 8) * 31 + rand(-4, 4);
      ctx.fillStyle = i % 3 === 0 ? '#425a49' : '#384b40';
      ctx.beginPath(); ctx.arc(tx, ty, rand(7, 12), 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(10,18,15,.25)'; ctx.beginPath(); ctx.arc(tx + 2, ty + 3, 9, 0, TAU); ctx.fill();
    }
    for (const b of surfaceBuildings) this.drawBuilding(ctx, b);
    // Parking bays, barriers, and rooftop clutter establish cover rhythm without turning the map noisy.
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? '#66706a' : '#394345';
      ctx.fillRect(445 + i * 13, 503, 6, 17);
    }
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#725039'; ctx.fillRect(1680 + i * 16, 420, 12, 25);
      ctx.strokeStyle = 'rgba(255,200,128,.15)'; ctx.strokeRect(1680 + i * 16, 420, 12, 25);
    }
    this.drawSurfaceMarkers(ctx);
    this.drawUndergroundMap();
  }

  drawBuilding(ctx, b) {
    const palettes = {
      residential: ['#414746', '#4e5450', '#353d3c'],
      highrise: ['#394548', '#4a5556', '#303b3e'],
      office: ['#3a4546', '#4b5555', '#2f393a'],
      industrial: ['#444b48', '#555c56', '#343b39'],
    };
    const [base, top, edge] = palettes[b.type];
    ctx.fillStyle = 'rgba(0,0,0,.27)';
    roundedRect(ctx, b.x + 9, b.y + 12, b.w, b.h, 3); ctx.fill();
    ctx.fillStyle = edge; ctx.fillRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
    ctx.fillStyle = base; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = top; ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.strokeStyle = 'rgba(199,212,202,.14)'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    // Roof panels / HVAC blocks are decorative only; tactical read stays deliberately simple.
    const rows = b.h > 205 ? 3 : 2;
    for (let row = 0; row < rows; row++) {
      const yy = b.y + 28 + row * ((b.h - 52) / rows);
      for (let col = 0; col < 3; col++) {
        const xx = b.x + 25 + col * ((b.w - 80) / 3);
        ctx.fillStyle = col === 1 && row === 0 ? 'rgba(26,34,35,.56)' : 'rgba(25,33,34,.34)';
        ctx.fillRect(xx, yy, Math.min(43, (b.w - 85) / 4), 20);
        ctx.fillStyle = 'rgba(193,208,198,.1)'; ctx.fillRect(xx + 3, yy + 3, Math.min(32, (b.w - 85) / 4 - 8), 2);
      }
    }
    ctx.fillStyle = 'rgba(209,222,212,.32)';
    for (let i = 0; i < 4; i++) {
      const wx = b.x + 15 + i * ((b.w - 30) / 4);
      ctx.fillRect(wx, b.y + b.h - 4, 17, 3);
    }
    ctx.fillStyle = 'rgba(3,8,9,.45)';
    ctx.font = '700 10px Arial, sans-serif'; ctx.letterSpacing = '1px';
    ctx.fillText(b.name, b.x + 13, b.y + 19);
    if (b.type === 'industrial') {
      ctx.fillStyle = 'rgba(245,138,54,.28)'; ctx.fillRect(b.x + b.w - 28, b.y + 11, 14, 3);
    }
  }

  drawSurfaceMarkers(ctx) {
    const label = (text, x, y) => {
      ctx.font = '700 10px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(208,222,216,.35)';
      ctx.fillText(text, x, y);
    };
    label('NOVA CITY  /  NORTHLINE', 465, 57);
    label('NOVA EXCHANGE', 770, 805);
    label('TRANSIT  —  LOWER LEVEL', 1058, 803);
    label('WATERFRONT FREIGHT', 1576, 1000);
    // Metro station
    ctx.fillStyle = 'rgba(119,227,223,.16)'; ctx.beginPath(); ctx.arc(this.metro.x, this.metro.y, 33, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#70ceca'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.metro.x, this.metro.y, 23, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#172325'; ctx.fillRect(this.metro.x - 13, this.metro.y - 7, 26, 14);
    ctx.fillStyle = '#91eee1'; ctx.font = '800 13px Arial'; ctx.textAlign = 'center'; ctx.fillText('M', this.metro.x, this.metro.y + 5);
    ctx.fillStyle = 'rgba(119,227,223,.75)'; ctx.font = '700 8px Arial'; ctx.fillText('METRO ACCESS', this.metro.x, this.metro.y + 44);
    // Dog-tag reinforcement station.
    ctx.fillStyle = '#363f40'; roundedRect(ctx, this.reinforcement.x - 22, this.reinforcement.y - 17, 44, 34, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(245,138,54,.45)'; ctx.strokeRect(this.reinforcement.x - 22, this.reinforcement.y - 17, 44, 34);
    ctx.fillStyle = '#f2a261'; ctx.font = '700 10px Arial'; ctx.fillText('R', this.reinforcement.x, this.reinforcement.y + 4);
    ctx.fillStyle = 'rgba(245,195,138,.7)'; ctx.font = '700 7px Arial'; ctx.fillText('REINFORCEMENT', this.reinforcement.x, this.reinforcement.y + 29);
    // Surface extraction pad is inactive until intel is recovered.
    ctx.fillStyle = 'rgba(15,20,21,.85)'; ctx.fillRect(this.extraction.x - 45, this.extraction.y - 27, 90, 54);
    ctx.strokeStyle = 'rgba(245,138,54,.45)'; ctx.setLineDash([5, 5]); ctx.strokeRect(this.extraction.x - 45, this.extraction.y - 27, 90, 54); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(245,138,54,.78)'; ctx.font = '700 8px Arial'; ctx.fillText('EVAC / LZ-02', this.extraction.x, this.extraction.y + 3);
  }

  drawBuggy(ctx, x, y, angle, alpha = 1) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; roundedRect(ctx, -24, -12, 52, 27, 7); ctx.fill();
    ctx.fillStyle = '#4b5a51'; roundedRect(ctx, -26, -15, 52, 24, 6); ctx.fill();
    ctx.fillStyle = '#20292a'; roundedRect(ctx, -8, -12, 21, 18, 4); ctx.fill();
    ctx.fillStyle = '#bbba8b'; ctx.fillRect(18, -10, 5, 5); ctx.fillRect(18, 4, 5, 5);
    ctx.fillStyle = '#111718'; ctx.fillRect(-18, -18, 12, 5); ctx.fillRect(12, -18, 12, 5); ctx.fillRect(-18, 10, 12, 5); ctx.fillRect(12, 10, 12, 5);
    ctx.restore();
  }

  drawUndergroundMap() {
    const ctx = this.underCtx;
    ctx.fillStyle = '#081012'; ctx.fillRect(0, 0, UNDER.w, UNDER.h);
    // A connected transit/service network, intentionally legible at phone scale.
    const corridors = [
      { x: 58, y: 262, w: 1067, h: 156 }, { x: 724, y: 126, w: 260, h: 466 },
      { x: 918, y: 480, w: 220, h: 118 }, { x: 154, y: 309, w: 180, h: 70 },
    ];
    for (const rect of corridors) {
      ctx.fillStyle = '#182426'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = 'rgba(119,227,223,.14)'; ctx.lineWidth = 2; ctx.strokeRect(rect.x + 5, rect.y + 5, rect.w - 10, rect.h - 10);
      ctx.strokeStyle = 'rgba(194,210,203,.04)'; ctx.lineWidth = 1;
      for (let y = rect.y + 14; y < rect.y + rect.h - 8; y += 14) {
        ctx.beginPath(); ctx.moveTo(rect.x + 10, y); ctx.lineTo(rect.x + rect.w - 10, y); ctx.stroke();
      }
    }
    // Side rooms and service bays.
    const rooms = [
      { x: 754, y: 126, w: 201, h: 121, label: 'ARCHIVE / 03' },
      { x: 777, y: 440, w: 162, h: 135, label: 'PUMP ROOM' },
      { x: 965, y: 482, w: 153, h: 102, label: 'LINE 2 / TRAIN' },
    ];
    for (const room of rooms) {
      ctx.fillStyle = '#202c2e'; ctx.fillRect(room.x, room.y, room.w, room.h);
      ctx.strokeStyle = 'rgba(179,196,189,.2)'; ctx.lineWidth = 3; ctx.strokeRect(room.x, room.y, room.w, room.h);
      ctx.fillStyle = 'rgba(194,211,203,.34)'; ctx.font = '700 9px Arial'; ctx.fillText(room.label, room.x + 12, room.y + 17);
    }
    // Utility lines and low-light lamps.
    ctx.fillStyle = 'rgba(245,138,54,.5)';
    for (let x = 220; x < 720; x += 98) { ctx.fillRect(x, 275, 17, 3); ctx.fillRect(x, 403, 17, 3); }
    ctx.fillStyle = 'rgba(119,227,223,.58)';
    for (const [x, y] of [[125, 280], [455, 272], [687, 405], [980, 270], [1110, 418], [1056, 590]]) {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fillStyle = 'rgba(119,227,223,.08)'; ctx.fill(); ctx.fillStyle = 'rgba(119,227,223,.58)';
    }
    // Metro in/out arrow and intel case marker.
    ctx.fillStyle = '#142123'; roundedRect(ctx, this.underMetro.x - 26, this.underMetro.y - 28, 52, 56, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(119,227,223,.52)'; ctx.strokeRect(this.underMetro.x - 26, this.underMetro.y - 28, 52, 56);
    ctx.fillStyle = '#84e5dc'; ctx.font = '700 8px Arial'; ctx.textAlign = 'center'; ctx.fillText('UP', this.underMetro.x, this.underMetro.y + 3);
    ctx.fillStyle = '#d39857'; roundedRect(ctx, this.intel.x - 20, this.intel.y - 12, 40, 24, 3); ctx.fill();
    ctx.fillStyle = '#211b15'; ctx.fillRect(this.intel.x - 9, this.intel.y - 4, 18, 8);
    ctx.fillStyle = 'rgba(231,176,108,.66)'; ctx.font = '700 8px Arial'; ctx.fillText('INTEL CASE', this.intel.x, this.intel.y - 22);
    // Reinforcement / train gate in the second route.
    ctx.fillStyle = '#252f31'; ctx.fillRect(this.trainExit.x - 25, this.trainExit.y - 20, 50, 36);
    ctx.strokeStyle = '#a2dcd6'; ctx.strokeRect(this.trainExit.x - 25, this.trainExit.y - 20, 50, 36);
    ctx.fillStyle = 'rgba(119,227,223,.72)'; ctx.font = '700 8px Arial'; ctx.fillText('LINE 2', this.trainExit.x, this.trainExit.y + 31);
    ctx.textAlign = 'left';
  }

  createActors() {
    const teamSize = clamp(this.teamSize, 1, 4);
    const allyNames = ['PATCH', 'MICA', 'WARD'];
    for (let i = 0; i < teamSize - 1; i++) {
      const angle = TAU * i / Math.max(1, teamSize - 1);
      this.crew.push(makeActor(100 + i, this.player.x + Math.cos(angle) * 34, this.player.y + Math.sin(angle) * 34, { friendly: true, name: allyNames[i] }));
    }
    const enemyCount = 20 - teamSize;
    const spawnPoints = [
      [735, 390], [1272, 397], [1512, 706], [728, 808], [1240, 900], [380, 690],
      [1110, 1194], [1532, 455], [878, 1102], [1415, 1300], [319, 380], [682, 280],
      [1288, 1100], [1700, 875], [468, 1150], [1360, 650], [823, 540], [1550, 1150], [530, 750],
    ];
    for (let i = 0; i < enemyCount; i++) {
      let [x, y] = spawnPoints[i % spawnPoints.length];
      if (i > 4) { x += rand(-70, 70); y += rand(-70, 70); }
      if (this.collides(x, y, 11, this.surfaceSolids, WORLD)) {
        const safeLanes = [[470, 380], [1060, 380], [1583, 380], [470, 900], [1057, 900], [1580, 900], [470, 1248], [1050, 1248], [1580, 1248], [1220, 373]];
        const safe = safeLanes[(i + Math.floor(rand(0, safeLanes.length))) % safeLanes.length];
        x = safe[0] + rand(-22, 22); y = safe[1] + rand(-18, 18);
      }
      const bot = makeActor(i + 1, x, y, { name: ['VALE', 'KILO', 'SABLE', 'ROOK', 'ECHO', 'NORTH', 'NIX', 'GHOST', 'TIDE'][i % 9] });
      bot.fireTimer = rand(1.8, 3.4);
      this.enemyBots.push(bot);
    }
    this.underGuards = [
      makeActor(301, 485, 339, { guard: true, name: 'SECURITY' }),
      makeActor(302, 890, 338, { guard: true, name: 'WARDEN' }),
      makeActor(303, 1021, 535, { guard: true, name: 'WARDEN' }),
    ];
    // A few match participants make their own moves in the distance so the field feels alive.
    this.nextAmbientElimination = 20;
  }

  bindEvents() {
    this.bound = {
      pointerMove: (event) => {
        if (event.pointerType !== 'mouse') return;
        const rect = this.canvas.getBoundingClientRect();
        const sx = event.clientX - rect.left - rect.width / 2;
        const sy = event.clientY - rect.top - rect.height / 2;
        const cam = this.camera();
        const worldX = cam.x + event.clientX - rect.left;
        const worldY = cam.y + event.clientY - rect.top;
        this.setAimVector(worldX - this.player.x, worldY - this.player.y);
        this.mouseAimScreen = { x: sx, y: sy };
      },
      pointerDown: (event) => {
        if (event.pointerType === 'mouse' && event.button === 0) {
          this.wakeAudio();
          this.input.fire = true;
          this.canvas.setPointerCapture?.(event.pointerId);
        } else if (event.pointerType === 'mouse' && event.button === 2) {
          this.setADS(true);
        } else if (event.pointerType !== 'mouse') {
          const rect = this.canvas.getBoundingClientRect();
          if (event.clientX > rect.left + rect.width * .48) {
            const cam = this.camera();
            this.setAimVector(cam.x + event.clientX - rect.left - this.player.x, cam.y + event.clientY - rect.top - this.player.y);
          }
        }
      },
      pointerUp: (event) => {
        if (event.pointerType === 'mouse' && event.button === 0) this.input.fire = false;
        if (event.pointerType === 'mouse' && event.button === 2) this.setADS(false);
      },
      context: (event) => event.preventDefault(),
      keyDown: (event) => this.onKey(event, true),
      keyUp: (event) => this.onKey(event, false),
      orientation: (event) => {
        this.deviceOrientation = { alpha: event.alpha || 0, beta: event.beta || 0, gamma: event.gamma || 0 };
        if (this.gyroMode === 'off') return;
        if (this.gyroMode === 'ads' && !this.isADS) return;
        const sensitivity = this.sensitivity / 100;
        const delta = (event.gamma || 0) * .0008 * sensitivity;
        if (Number.isFinite(delta)) this.aimTargetAngle += clamp(delta, -.08, .08);
      },
      blur: () => { this.input.fire = false; this.input.mx = 0; this.input.my = 0; this.input.interact = false; },
      visibility: () => { this.lastFrame = performance.now(); },
    };
    this.canvas.addEventListener('pointermove', this.bound.pointerMove);
    this.canvas.addEventListener('pointerdown', this.bound.pointerDown);
    window.addEventListener('pointerup', this.bound.pointerUp);
    window.addEventListener('pointercancel', this.bound.pointerUp);
    this.canvas.addEventListener('contextmenu', this.bound.context);
    window.addEventListener('keydown', this.bound.keyDown);
    window.addEventListener('keyup', this.bound.keyUp);
    window.addEventListener('blur', this.bound.blur);
    document.addEventListener('visibilitychange', this.bound.visibility);
    if (this.gyroMode !== 'off') window.addEventListener('deviceorientation', this.bound.orientation, { passive: true });
  }

  onKey(event, isDown) {
    if (event.repeat && ['KeyE', 'KeyR', 'KeyQ', 'KeyG', 'Space', 'KeyC'].includes(event.code)) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const key = event.code;
    if (isDown && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) this.wakeAudio();
    if (key === 'Escape' && isDown) { event.preventDefault(); this.options.onPause?.(); return; }
    if (['KeyW', 'ArrowUp'].includes(key)) this.input.my = isDown ? -1 : (this.input.my < 0 ? 0 : this.input.my);
    if (['KeyS', 'ArrowDown'].includes(key)) this.input.my = isDown ? 1 : (this.input.my > 0 ? 0 : this.input.my);
    if (['KeyA', 'ArrowLeft'].includes(key)) this.input.mx = isDown ? -1 : (this.input.mx < 0 ? 0 : this.input.mx);
    if (['KeyD', 'ArrowRight'].includes(key)) this.input.mx = isDown ? 1 : (this.input.mx > 0 ? 0 : this.input.mx);
    if (key === 'ShiftLeft' || key === 'ShiftRight') this.input.sprint = isDown;
    if (key === 'Space') { this.input.jump = isDown; if (isDown) this.player.jumpTimer = .32; }
    if (key === 'KeyE' || key === 'KeyF') this.input.interact = isDown;
    if (key === 'KeyR' && isDown) this.reload();
    if (key === 'KeyQ' && isDown) this.cycleWeapon();
    if (key === 'KeyG' && isDown) this.throwGrenade();
    if (key === 'KeyC' && isDown) this.toggleCrouch();
    if (key === 'MouseRight') this.setADS(isDown);
    if (event.button === 2) this.setADS(isDown);
    if (isDown && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) event.preventDefault();
  }

  resize() {
    const box = this.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = box.width;
    this.height = box.height;
    this.canvas.width = Math.round(box.width * this.dpr);
    this.canvas.height = Math.round(box.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawMiniMap();
  }

  camera() {
    const map = this.underground ? UNDER : WORLD;
    const x = clamp(this.player.x - this.width / 2, 0, Math.max(0, map.w - this.width));
    const y = clamp(this.player.y - this.height / 2, 0, Math.max(0, map.h - this.height));
    return { x, y };
  }

  setMoveVector(x, y) {
    const length = Math.hypot(x, y);
    const divisor = Math.max(1, length);
    this.input.mx = x / divisor;
    this.input.my = y / divisor;
  }

  setAimVector(x, y) {
    const length = Math.hypot(x, y);
    if (length < .01) return;
    this.aimTargetAngle = Math.atan2(y / length, x / length);
  }

  setInput(name, value) {
    if (name === 'fire' && value) this.wakeAudio();
    if (name in this.input) this.input[name] = Boolean(value);
    if (name === 'ads') this.setADS(Boolean(value));
    if (name === 'crouch' && value) this.toggleCrouch();
    if (name === 'jump' && value) this.player.jumpTimer = .32;
  }

  setADS(value) {
    this.isADS = value;
    this.input.ads = value;
  }

  toggleCrouch() {
    this.isCrouched = !this.isCrouched;
    this.input.crouch = this.isCrouched;
    this.emitMessage(this.isCrouched ? 'LOW PROFILE' : 'STANDING');
  }

  wakeAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContextClass();
        this.audioMaster = this.audioContext.createGain();
        this.audioMaster.gain.value = .42;
        this.audioMaster.connect(this.audioContext.destination);
      }
      if (this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {});
      return this.audioContext;
    } catch { return null; }
  }

  playShot(actor = null) {
    const audio = this.audioContext;
    if (!audio || audio.state !== 'running' || !this.audioMaster) return;
    try {
      const now = audio.currentTime;
      const localShot = !actor;
      let output = this.audioMaster;
      if (this.spatialAudio && audio.createStereoPanner) {
        const panner = audio.createStereoPanner();
        const pan = localShot ? 0 : clamp((actor.x - this.player.x) / Math.max(240, this.width * .62), -1, 1);
        panner.pan.setValueAtTime(pan, now);
        panner.connect(this.audioMaster);
        output = panner;
      }
      const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * .11), audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
      const noise = audio.createBufferSource(); noise.buffer = buffer;
      const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(localShot ? 2700 : 1850, now);
      const noiseGain = audio.createGain();
      noiseGain.gain.setValueAtTime(.0001, now);
      noiseGain.gain.linearRampToValueAtTime(localShot ? .12 : .027, now + .004);
      noiseGain.gain.exponentialRampToValueAtTime(.0001, now + .105);
      noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(output); noise.start(now); noise.stop(now + .115);
      const tone = audio.createOscillator(); tone.type = 'triangle';
      tone.frequency.setValueAtTime(localShot ? 118 : 88, now);
      tone.frequency.exponentialRampToValueAtTime(43, now + .09);
      const toneGain = audio.createGain();
      toneGain.gain.setValueAtTime(.0001, now);
      toneGain.gain.linearRampToValueAtTime(localShot ? .035 : .009, now + .004);
      toneGain.gain.exponentialRampToValueAtTime(.0001, now + .09);
      tone.connect(toneGain); toneGain.connect(output); tone.start(now); tone.stop(now + .095);
    } catch { /* Audio is an enhancement; gameplay never depends on it. */ }
  }

  playFootstep() {
    const audio = this.audioContext;
    if (!audio || audio.state !== 'running' || !this.audioMaster) return;
    try {
      const now = audio.currentTime;
      const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * .035), audio.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
      const source = audio.createBufferSource(); source.buffer = buffer;
      const onGravel = !this.underground && this.player.x > 1150 && this.player.x < 1430 && this.player.y > 835 && this.player.y < 965;
      const filter = audio.createBiquadFilter(); filter.type = this.underground ? 'highpass' : 'lowpass'; filter.frequency.value = this.underground ? 1180 : (onGravel ? 510 : 820);
      const gain = audio.createGain(); gain.gain.setValueAtTime(onGravel ? .013 : .018, now); gain.gain.exponentialRampToValueAtTime(.0001, now + .034);
      source.connect(filter); filter.connect(gain); gain.connect(this.audioMaster); source.start(now); source.stop(now + .036);
    } catch { /* Unsupported audio nodes are ignored. */ }
  }

  reload() {
    if (this.reloading || this.ammo >= this.weapon.mag || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadTimer = this.weaponKey === 'rook' ? 1.65 : 1.25;
    this.emitMessage('RELOADING');
  }

  cycleWeapon() {
    const order = Object.keys(WEAPONS);
    const current = order.indexOf(this.weaponKey);
    this.weaponInventory[this.weaponKey] = { ammo: this.ammo, reserve: this.reserve };
    this.weaponKey = order[(current + 1) % order.length];
    this.weapon = WEAPONS[this.weaponKey];
    const stored = this.weaponInventory[this.weaponKey];
    this.ammo = stored.ammo;
    this.reserve = stored.reserve;
    this.reloading = false;
    this.fireCooldown = .2;
    this.emitMessage(`${this.weapon.name.toUpperCase()} / WEAPON READY`);
    this.emitHud(true);
  }

  throwGrenade() {
    if (this.grenades <= 0 || this.grenadeCooldown > 0 || this.ended) return;
    this.grenades--;
    this.grenadeCooldown = .5;
    const direction = this.player.angle;
    const range = 190;
    this.grenadeObjects.push({ x: this.player.x + Math.cos(direction) * 30, y: this.player.y + Math.sin(direction) * 30, vx: Math.cos(direction) * 270, vy: Math.sin(direction) * 270, timer: 1.25, fuse: 1.25, range, underground: this.underground });
    this.emitMessage('FRAG OUT');
    this.emitHud(true);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame((time) => this.frame(time));
  }

  pause() {
    this.paused = true;
    this.input.fire = false;
    this.input.interact = false;
    this.input.mx = 0;
    this.input.my = 0;
  }

  resume() {
    this.paused = false;
    this.lastFrame = performance.now();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    if (!this.bound) return;
    this.canvas.removeEventListener('pointermove', this.bound.pointerMove);
    this.canvas.removeEventListener('pointerdown', this.bound.pointerDown);
    window.removeEventListener('pointerup', this.bound.pointerUp);
    window.removeEventListener('pointercancel', this.bound.pointerUp);
    this.canvas.removeEventListener('contextmenu', this.bound.context);
    window.removeEventListener('keydown', this.bound.keyDown);
    window.removeEventListener('keyup', this.bound.keyUp);
    window.removeEventListener('blur', this.bound.blur);
    document.removeEventListener('visibilitychange', this.bound.visibility);
    window.removeEventListener('deviceorientation', this.bound.orientation);
    if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close().catch(() => {});
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(.04, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (!document.hidden && !this.ended && !this.paused) {
      this.elapsed += dt;
      this.update(dt);
      this.render();
      if (now - this.lastHudTime > 160) { this.emitHud(); this.lastHudTime = now; }
      if (now - this.lastMiniTime > 420) { this.drawMiniMap(); this.lastMiniTime = now; }
    }
    this.raf = requestAnimationFrame((time) => this.frame(time));
  }

  update(dt) {
    this.zone.radius = this.elapsed < 68 ? this.zone.start : this.zone.start - (this.zone.start - this.zone.end) * clamp((this.elapsed - 68) / 370, 0, 1);
    if (!this.eventTriggered && this.elapsed >= 27) {
      this.eventTriggered = true;
      this.eventActive = true;
      this.eventElapsed = 0;
      this.emitMessage(`${this.eventName} ACTIVE — SECTOR 04`);
      this.options.onEvent?.(this.eventName);
    }
    if (this.eventActive) {
      this.eventElapsed += dt;
      if (this.eventElapsed > this.eventLength && this.eventName !== 'BLACKOUT') this.eventActive = false;
    }
    this.updatePlayer(dt);
    const bots = this.underground ? this.underGuards : this.enemyBots;
    const allies = this.underground ? [] : this.crew;
    this.updateActors(bots, allies, dt);
    this.updateBullets(dt);
    this.updateGrenades(dt);
    this.updateParticles(dt);
    this.updateInteraction(dt);
    this.updateAutoPickup();
    this.updateZone(dt);
    this.updateAmbient(dt);
    if (this.messageTimer > 0) this.messageTimer -= dt;
    if (this.elapsed >= 480) this.finish('survival');
    if (this.player.health <= 0 && !this.ended) this.finish('eliminated');
  }

  updatePlayer(dt) {
    if (this.mouseAimScreen) this.aimTargetAngle = Math.atan2(this.mouseAimScreen.y, this.mouseAimScreen.x);
    const aimDelta = Math.atan2(Math.sin(this.aimTargetAngle - this.player.angle), Math.cos(this.aimTargetAngle - this.player.angle));
    const aimResponse = 3 + this.sensitivity / 100 * 14;
    this.player.angle += aimDelta * (1 - Math.exp(-dt * aimResponse));
    this.input.ax = Math.cos(this.player.angle);
    this.input.ay = Math.sin(this.player.angle);
    this.isSprinting = this.input.sprint && Math.hypot(this.input.mx, this.input.my) > .15 && !this.isCrouched;
    const normalSpeed = this.isCrouched ? 124 : (this.isADS ? 188 : 236);
    let speed = this.inVehicle ? 345 : (this.isSprinting ? 322 : normalSpeed);
    const inFlood = this.eventActive && this.eventName === 'FLOOD ALERT' && !this.underground && this.player.x > 1145 && this.player.x < 1430 && this.player.y > 835 && this.player.y < 960;
    if (inFlood && !this.inVehicle) speed *= .55;
    const moveLength = Math.hypot(this.input.mx, this.input.my);
    const moveScale = moveLength > 1 ? 1 / moveLength : 1;
    const targetVx = this.input.mx * moveScale * speed;
    const targetVy = this.input.my * moveScale * speed;
    const accel = Math.min(1, dt * (this.inVehicle ? 4.5 : 9));
    this.player.vx += (targetVx - this.player.vx) * accel;
    this.player.vy += (targetVy - this.player.vy) * accel;
    if (Math.hypot(this.input.mx, this.input.my) < .05) {
      const drag = Math.max(0, 1 - dt * 8);
      this.player.vx *= drag; this.player.vy *= drag;
    }
    const movingOnFoot = Math.hypot(this.player.vx, this.player.vy) > 34 && !this.inVehicle;
    this.footstepTimer = Math.max(0, this.footstepTimer - dt);
    if (movingOnFoot && this.footstepTimer <= 0) {
      this.playFootstep();
      this.footstepTimer = this.isCrouched ? .62 : (this.isSprinting ? .31 : .43);
    }
    const solids = this.underground ? this.underSolids : this.surfaceSolids;
    const radius = this.inVehicle ? 17 : this.player.radius;
    let nextX = this.player.x + this.player.vx * dt;
    let nextY = this.player.y + this.player.vy * dt;
    const map = this.underground ? UNDER : WORLD;
    if (this.breachWall.hp > 0 && !this.breachWall.broken && !this.underground) solids.push(this.breachWall);
    if (!this.collides(nextX, this.player.y, radius, solids, map)) this.player.x = nextX; else this.player.vx *= -.13;
    if (!this.collides(this.player.x, nextY, radius, solids, map)) this.player.y = nextY; else this.player.vy *= -.13;
    if (this.breachWall.hp > 0 && !this.breachWall.broken && !this.underground) solids.pop();
    if (this.input.fire && this.fireCooldown <= 0) this.fireWeapon();
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = this.weapon.mag - this.ammo;
        const loaded = Math.min(needed, this.reserve);
        this.ammo += loaded; this.reserve -= loaded; this.reloading = false;
        this.weaponInventory[this.weaponKey] = { ammo: this.ammo, reserve: this.reserve };
        this.emitMessage('MAGAZINE READY');
      }
    }
    this.player.jumpTimer = Math.max(0, this.player.jumpTimer - dt);
    this.player.hitFlash = Math.max(0, this.player.hitFlash - dt);
    this.shotFlash = Math.max(0, this.shotFlash - dt);
    if (this.player.lastDamageAt > 0 && this.elapsed - this.player.lastDamageAt > 5 && this.player.health < this.player.maxHealth) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + dt * 1.35);
    }
    if (this.player.lastDamageAt > 0 && this.elapsed - this.player.lastDamageAt > 8 && this.player.armor < this.player.maxArmor) {
      this.player.armor = Math.min(this.player.maxArmor, this.player.armor + dt * .9);
    }
  }

  collides(x, y, radius, solids, map) {
    if (x < radius || y < radius || x > map.w - radius || y > map.h - radius) return true;
    for (const rect of solids) if (circleRectHit(x, y, radius, rect)) return true;
    return false;
  }

  fireWeapon() {
    if (this.reloading) return;
    if (this.ammo <= 0) { if (this.smartReload) this.reload(); else this.emitMessage('MAGAZINE EMPTY / TAP RELOAD'); return; }
    const currentTime = performance.now();
    if (currentTime - this.lastShotAt < Math.max(38, this.weapon.rate - (this.isADS ? 0 : 0))) return;
    this.lastShotAt = currentTime;
    this.ammo--;
    this.weaponInventory[this.weaponKey] = { ammo: this.ammo, reserve: this.reserve };
    this.fireCooldown = this.weapon.rate / 1000;
    this.shotFlash = .07;
    this.playShot();
    const baseAngle = Math.atan2(this.input.ay, this.input.ax);
    let aimAngle = baseAngle;
    const targetList = this.underground ? this.underGuards : [...this.enemyBots, ...this.crew.filter((actor) => actor.alive)];
    if (this.aimAssist) {
      let best = null; let bestAngle = .16;
      for (const target of targetList) {
        if (!target.alive || target.friendly) continue;
        const a = angleTo(this.player.x, this.player.y, target.x, target.y);
        const diff = Math.abs(Math.atan2(Math.sin(a - baseAngle), Math.cos(a - baseAngle)));
        const range = dist(this.player.x, this.player.y, target.x, target.y);
        if (diff < bestAngle && range < this.weapon.range * .82) { bestAngle = diff; best = target; }
      }
      if (best) aimAngle = baseAngle + Math.atan2(Math.sin(angleTo(this.player.x, this.player.y, best.x, best.y) - baseAngle), Math.cos(angleTo(this.player.x, this.player.y, best.x, best.y) - baseAngle)) * .28;
    }
    const spreadMultiplier = this.isADS ? .36 : (this.isCrouched ? .72 : 1);
    const spread = (this.weapon.spread + (this.isSprinting ? .09 : 0)) * spreadMultiplier;
    const angle = aimAngle + rand(-spread, spread);
    const bullet = {
      x: this.player.x + Math.cos(angle) * 20, y: this.player.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * this.weapon.speed, vy: Math.sin(angle) * this.weapon.speed,
      life: this.weapon.range / this.weapon.speed, damage: this.weapon.damage, friendly: true,
      underground: this.underground, trail: 0,
    };
    this.bullets.push(bullet);
    this.player.angle = baseAngle;
    this.input.ax = Math.cos(baseAngle); this.input.ay = Math.sin(baseAngle);
  }

  updateActors(enemies, allies, dt) {
    const allTargets = [this.player, ...allies.filter((actor) => actor.alive)];
    for (const actor of enemies) {
      if (!actor.alive) continue;
      actor.fireTimer -= dt; actor.thinkTimer -= dt;
      let target = allTargets[0]; let targetDist = dist(actor.x, actor.y, target.x, target.y);
      for (const candidate of allTargets.slice(1)) {
        const d = dist(actor.x, actor.y, candidate.x, candidate.y);
        if (d < targetDist) { target = candidate; targetDist = d; }
      }
      // Guards and distant operators patrol until someone enters their sound/range envelope.
      if (targetDist < (actor.guard ? 530 : 470)) {
        const angle = angleTo(actor.x, actor.y, target.x, target.y);
        actor.angle = angle;
        if (targetDist > (actor.guard ? 185 : 205)) {
          actor.vx += (Math.cos(angle) * 112 - actor.vx) * Math.min(1, dt * 2.3);
          actor.vy += (Math.sin(angle) * 112 - actor.vy) * Math.min(1, dt * 2.3);
        } else {
          actor.vx *= Math.max(0, 1 - dt * 4);
          actor.vy *= Math.max(0, 1 - dt * 4);
          const strafeAngle = angle + Math.PI / 2 * actor.strafe;
          actor.vx += Math.cos(strafeAngle) * 44 * dt;
          actor.vy += Math.sin(strafeAngle) * 44 * dt;
        }
        if (actor.fireTimer <= 0 && targetDist < (actor.guard ? 430 : 380)) {
          const accuracy = actor.guard ? .19 : .24;
          const aim = angle + rand(-accuracy, accuracy);
          this.bullets.push({ x: actor.x + Math.cos(aim) * 18, y: actor.y + Math.sin(aim) * 18, vx: Math.cos(aim) * 385, vy: Math.sin(aim) * 385, life: .95, damage: actor.guard ? 9 : 8, friendly: false, underground: this.underground, trail: 0 });
          if (targetDist < 440) this.playShot(actor);
          actor.fireTimer = rand(actor.guard ? 1.0 : 1.35, actor.guard ? 1.65 : 2.15);
          actor.strafe *= Math.random() < .45 ? -1 : 1;
        }
      } else {
        if (actor.thinkTimer <= 0) {
          actor.wanderX = clamp(actor.x + rand(-190, 190), 80, this.underground ? UNDER.w - 80 : WORLD.w - 80);
          actor.wanderY = clamp(actor.y + rand(-160, 160), 80, this.underground ? UNDER.h - 80 : WORLD.h - 80);
          actor.thinkTimer = rand(2, 5);
        }
        const wanderAngle = angleTo(actor.x, actor.y, actor.wanderX, actor.wanderY);
        if (dist(actor.x, actor.y, actor.wanderX, actor.wanderY) > 18) {
          actor.vx += (Math.cos(wanderAngle) * 63 - actor.vx) * Math.min(1, dt * 1.3);
          actor.vy += (Math.sin(wanderAngle) * 63 - actor.vy) * Math.min(1, dt * 1.3);
          actor.angle = wanderAngle;
        } else { actor.vx *= Math.max(0, 1 - dt * 3); actor.vy *= Math.max(0, 1 - dt * 3); }
      }
      const map = this.underground ? UNDER : WORLD;
      const solids = this.underground ? this.underSolids : this.surfaceSolids;
      const nx = actor.x + actor.vx * dt, ny = actor.y + actor.vy * dt;
      if (!this.collides(nx, actor.y, 9, solids, map)) actor.x = nx; else { actor.vx *= -.15; actor.wanderX = actor.x + rand(-130, 130); }
      if (!this.collides(actor.x, ny, 9, solids, map)) actor.y = ny; else { actor.vy *= -.15; actor.wanderY = actor.y + rand(-100, 100); }
    }
    for (const ally of allies) {
      if (!ally.alive) continue;
      ally.fireTimer -= dt;
      const idx = this.crew.indexOf(ally);
      const targetX = this.player.x + Math.cos(idx * 2.1 + 2.1) * (52 + idx * 13);
      const targetY = this.player.y + Math.sin(idx * 2.1 + 2.1) * (48 + idx * 12);
      const d = dist(ally.x, ally.y, this.player.x, this.player.y);
      if (d > 185) {
        const a = angleTo(ally.x, ally.y, targetX, targetY);
        ally.vx += (Math.cos(a) * 174 - ally.vx) * Math.min(1, dt * 2.8);
        ally.vy += (Math.sin(a) * 174 - ally.vy) * Math.min(1, dt * 2.8);
        ally.angle = a;
      } else { ally.vx *= Math.max(0, 1 - dt * 3.5); ally.vy *= Math.max(0, 1 - dt * 3.5); }
      const target = this.enemyBots.filter((bot) => bot.alive).sort((a, b) => dist(ally.x, ally.y, a.x, a.y) - dist(ally.x, ally.y, b.x, b.y))[0];
      if (target && dist(ally.x, ally.y, target.x, target.y) < 380 && ally.fireTimer <= 0) {
        const a = angleTo(ally.x, ally.y, target.x, target.y) + rand(-.18, .18);
        this.bullets.push({ x: ally.x, y: ally.y, vx: Math.cos(a) * 590, vy: Math.sin(a) * 590, life: .75, damage: 18, friendly: true, underground: false, trail: 0 });
        if (d < 260) this.playShot(ally);
        ally.fireTimer = rand(1.1, 1.9); ally.angle = a;
      }
      const nx = ally.x + ally.vx * dt, ny = ally.y + ally.vy * dt;
      if (!this.collides(nx, ally.y, 9, this.surfaceSolids, WORLD)) ally.x = nx;
      if (!this.collides(ally.x, ny, 9, this.surfaceSolids, WORLD)) ally.y = ny;
    }
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      if (bullet.underground !== this.underground) { bullet.life -= dt; if (bullet.life <= 0) this.bullets.splice(i, 1); continue; }
      const ox = bullet.x, oy = bullet.y;
      bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt;
      let remove = bullet.life <= 0;
      if (bullet.friendly && !this.underground && !this.breachWall.broken && this.breachWall.hp > 0 && lineRectHit(ox, oy, bullet.x, bullet.y, this.breachWall)) {
        this.breachWall.hp -= bullet.damage * .72;
        this.spark(this.breachWall.x + rand(0, this.breachWall.w), this.breachWall.y + rand(0, this.breachWall.h), '#d58d51', 4);
        if (this.breachWall.hp <= 0) {
          this.breachWall.broken = true;
          this.breachWall.hp = 0;
          this.spark(this.breachWall.x + this.breachWall.w / 2, this.breachWall.y + this.breachWall.h / 2, '#f3a461', 24);
          this.emitMessage('BREACH COMPLETE — ROUTE OPEN');
        }
        remove = true;
      }
      const mapSolids = this.underground ? this.underSolids : this.surfaceSolids;
      if (!remove && mapSolids.some((solid) => lineRectHit(ox, oy, bullet.x, bullet.y, solid))) remove = true;
      if (!remove && bullet.friendly) {
        const enemies = this.underground ? this.underGuards : this.enemyBots;
        for (const enemy of enemies) {
          if (!enemy.alive || dist(bullet.x, bullet.y, enemy.x, enemy.y) > 15) continue;
          enemy.health -= bullet.damage;
          this.damage += bullet.damage;
          this.spark(bullet.x, bullet.y, '#f58a36', 5);
          if (enemy.health <= 0) this.killActor(enemy);
          remove = true; break;
        }
      } else if (!remove && !bullet.friendly) {
        const targets = [this.player, ...(this.underground ? [] : this.crew.filter((ally) => ally.alive))];
        for (const target of targets) {
          if (dist(bullet.x, bullet.y, target.x, target.y) > (target === this.player ? 14 : 12)) continue;
          if (target === this.player) this.damagePlayer(bullet.damage);
          else { target.health -= bullet.damage; if (target.health <= 0) this.killActor(target); }
          this.spark(bullet.x, bullet.y, '#ff6b60', 4);
          remove = true; break;
        }
      }
      if (remove) this.bullets.splice(i, 1);
    }
  }

  damagePlayer(amount) {
    let remaining = amount;
    const armorHit = Math.min(this.player.armor, remaining * .72);
    this.player.armor -= armorHit;
    remaining -= armorHit;
    if (remaining > 0) this.player.health = Math.max(0, this.player.health - remaining);
    this.player.lastDamageAt = this.elapsed;
    this.player.hitFlash = .18;
    this.options.onDamage?.(amount);
  }

  killActor(actor) {
    if (!actor.alive) return;
    actor.alive = false; actor.health = 0;
    this.spark(actor.x, actor.y, actor.friendly ? '#77e3df' : '#f58a36', 13);
    if (actor.friendly) {
      if (!actor.tagDropped) {
        this.dogTags.push({ x: actor.x, y: actor.y, name: actor.name, collected: false });
        actor.tagDropped = true;
        this.emitMessage(`${actor.name} TAG SIGNAL LOST`);
      }
    } else {
      this.kills++;
      this.score += 120;
      if (Math.random() < .6) this.surfaceLoot.push({ x: actor.x, y: actor.y, kind: 'ammo', amount: 18, label: 'Operator kit', collected: false, underground: this.underground });
      if (this.enemyBots.every((bot) => !bot.alive)) this.finish('survival');
    }
  }

  updateGrenades(dt) {
    for (let i = this.grenadeObjects.length - 1; i >= 0; i--) {
      const grenade = this.grenadeObjects[i];
      grenade.timer -= dt;
      grenade.x += grenade.vx * dt; grenade.y += grenade.vy * dt;
      grenade.vx *= Math.max(0, 1 - dt * 1.6); grenade.vy *= Math.max(0, 1 - dt * 1.6);
      if (grenade.timer <= 0) {
        const radius = 112;
        const enemies = grenade.underground ? this.underGuards : this.enemyBots;
        for (const enemy of enemies) {
          const d = dist(grenade.x, grenade.y, enemy.x, enemy.y);
          if (enemy.alive && d < radius) { enemy.health -= 130 * (1 - d / (radius * 1.35)); if (enemy.health <= 0) this.killActor(enemy); }
        }
        if (!grenade.underground && dist(grenade.x, grenade.y, this.player.x, this.player.y) < radius * .5) this.damagePlayer(18);
        this.spark(grenade.x, grenade.y, '#fcb163', 38);
        this.grenadeObjects.splice(i, 1);
        this.emitMessage('FRAG DETONATED');
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  spark(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), speed = rand(24, 155);
      this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(.18, .62), total: .62, color, size: rand(1.3, 3.4) });
    }
  }

  updateInteraction(dt) {
    const target = this.findContextTarget();
    this.contextTarget = target;
    if (!target || !this.input.interact) {
      this.interactionProgress = 0;
      this.interactionType = '';
      if (!this.input.interact) this.interactionLatch = false;
      return;
    }
    if (target.hold) {
      if (this.interactionType !== target.type) { this.interactionProgress = 0; this.interactionType = target.type; }
      this.interactionProgress += dt;
      if (this.interactionProgress >= target.duration) {
        this.interactionProgress = 0;
        this.interactionType = '';
        this.completeInteraction(target);
      }
    } else if (!this.interactionLatch) {
      this.interactionLatch = true;
      this.completeInteraction(target);
    }
  }

  findContextTarget() {
    const px = this.player.x, py = this.player.y;
    const candidates = [];
    const add = (type, x, y, label, hold = false, duration = 0, extra = {}) => {
      const d = dist(px, py, x, y);
      if (d < (extra.range || 72)) candidates.push({ type, x, y, distance: d, label, hold, duration, ...extra });
    };
    if (this.underground) {
      if (!this.intelRecovered) add('intel', this.intel.x, this.intel.y, 'HOLD · RECOVER INTEL', true, 2.4, { range: 83 });
      if (this.intelRecovered) add('train-extract', this.trainExit.x, this.trainExit.y, 'HOLD · EXTRACT / LINE 2', true, 5, { range: 78 });
      add('metro-exit', this.underMetro.x, this.underMetro.y, 'RETURN TO SURFACE', false, 0, { range: 63 });
      for (const item of this.underLoot) if (!item.collected) add('loot', item.x, item.y, `COLLECT · ${item.label.toUpperCase()}`, !this.quickLoot, this.quickLoot ? 0 : .45, { range: 62, item });
      return candidates.sort((a, b) => a.distance - b.distance)[0] || null;
    }
    add('metro-enter', this.metro.x, this.metro.y, 'ENTER · UNDERGROUND', false, 0, { range: 66 });
    if (this.intelRecovered) add('surface-extract', this.extraction.x, this.extraction.y, 'HOLD · CALL EXTRACTION', true, 5.5, { range: 84 });
    if (this.buggy.available && !this.inVehicle) add('vehicle', this.buggy.x, this.buggy.y, 'ENTER · TACTICAL BUGGY', false, 0, { range: 57 });
    if (this.inVehicle) add('vehicle-exit', px, py, 'EXIT VEHICLE', false, 0, { range: 70 });
    for (const item of this.surfaceLoot) if (!item.collected && !item.underground) add('loot', item.x, item.y, `COLLECT · ${item.label.toUpperCase()}`, !this.quickLoot, this.quickLoot ? 0 : .45, { range: 59, item });
    for (const tag of this.dogTags) if (!tag.collected) add('dogtag', tag.x, tag.y, `RECOVER · ${tag.name} TAG`, false, 0, { range: 58, tag });
    if (this.elapsed < 260 && this.dogTags.some((tag) => tag.collected) && this.crew.some((member) => !member.alive)) add('reinforce', this.reinforcement.x, this.reinforcement.y, 'REDEPLOY · SQUAD TAG', false, 0, { range: 70 });
    return candidates.sort((a, b) => {
      const rank = (type) => type.includes('extract') ? 0 : (type === 'intel' ? 1 : (type === 'vehicle' ? 2 : 3));
      return rank(a.type) - rank(b.type) || a.distance - b.distance;
    })[0] || null;
  }

  completeInteraction(target) {
    if (target.type === 'intel') {
      this.intelRecovered = true; this.extraction.unlocked = true; this.score += 700;
      this.emitMessage('INTEL RECOVERED — EXTRACTION ROUTES UNLOCKED');
      this.options.onContractComplete?.(700);
      return;
    }
    if (target.type === 'surface-extract' || target.type === 'train-extract') {
      this.finish('extraction');
      return;
    }
    if (target.type === 'metro-enter') {
      this.underground = true; this.player.inUnderground = true; this.player.x = this.underMetro.x; this.player.y = this.underMetro.y;
      this.player.vx = 0; this.player.vy = 0; this.input.interact = false; this.emitMessage('BELOW STREET LEVEL — MOVE QUIET');
      return;
    }
    if (target.type === 'metro-exit') {
      this.underground = false; this.player.inUnderground = false; this.player.x = this.metro.x + 56; this.player.y = this.metro.y;
      this.player.vx = 0; this.player.vy = 0; this.input.interact = false; this.emitMessage('SURFACE LINK RESTORED'); return;
    }
    if (target.type === 'loot') {
      target.item.collected = true;
      if (target.item.kind === 'ammo') {
        this.reserve += target.item.amount;
        this.weaponInventory[this.weaponKey] = { ammo: this.ammo, reserve: this.reserve };
      }
      if (target.item.kind === 'armor') this.player.armor = Math.min(this.player.maxArmor, this.player.armor + target.item.amount);
      this.score += 30; this.emitMessage(`${target.item.label.toUpperCase()} SECURED`); return;
    }
    if (target.type === 'vehicle') {
      this.inVehicle = true; this.buggy.available = false; this.emitMessage('TACTICAL BUGGY / DRIVE'); return;
    }
    if (target.type === 'vehicle-exit') {
      this.inVehicle = false; this.buggy.available = true; this.buggy.x = this.player.x + 25; this.buggy.y = this.player.y + 14; this.emitMessage('VEHICLE SECURED'); return;
    }
    if (target.type === 'dogtag') {
      target.tag.collected = true; this.emitMessage(`${target.tag.name} DOG TAG SECURED`); return;
    }
    if (target.type === 'reinforce') {
      const tag = this.dogTags.find((item) => item.collected);
      const downed = this.crew.find((member) => !member.alive);
      if (tag && downed) {
        tag.collected = false; downed.alive = true; downed.health = 100; downed.x = this.reinforcement.x + 25; downed.y = this.reinforcement.y + 25;
        downed.tagDropped = true; this.emitMessage(`${downed.name} REDEPLOYED — BASIC KIT`);
      }
    }
  }

  updateAutoPickup() {
    if (!this.autoPickup) return;
    const items = this.underground ? this.underLoot : this.surfaceLoot.filter((item) => !item.underground);
    for (const item of items) {
      if (item.collected || dist(this.player.x, this.player.y, item.x, item.y) > 25) continue;
      item.collected = true;
      if (item.kind === 'ammo') {
        this.reserve += item.amount;
        this.weaponInventory[this.weaponKey] = { ammo: this.ammo, reserve: this.reserve };
      }
      if (item.kind === 'armor') this.player.armor = Math.min(this.player.maxArmor, this.player.armor + item.amount);
      this.score += 30;
      this.emitMessage(`${item.label.toUpperCase()} / AUTO PICKUP`);
    }
  }

  updateZone(dt) {
    if (this.elapsed < 70) return;
    const fromCenter = dist(this.player.x, this.player.y, this.zone.x, this.zone.y);
    if (fromCenter > this.zone.radius) {
      this.zoneDamageTimer -= dt;
      if (this.zoneDamageTimer <= 0) { this.damagePlayer(6); this.zoneDamageTimer = 1; this.emitMessage('OUTSIDE THE BREAKLINE — MOVE'); }
    } else this.zoneDamageTimer = 0;
  }

  updateAmbient(dt) {
    if (this.elapsed < this.nextAmbientElimination || this.enemyBots.filter((bot) => bot.alive).length <= 1) return;
    this.nextAmbientElimination = this.elapsed + rand(18, 32);
    const alive = this.enemyBots.filter((bot) => bot.alive);
    if (alive.length > 1 && Math.random() < .82) {
      const victim = alive[Math.floor(Math.random() * alive.length)];
      victim.health = 0; this.killActor(victim);
      if (this.enemyBots.filter((bot) => bot.alive).length > 1) this.emitMessage('CONTACT LOST / FIELD UPDATE');
    }
  }

  emitHud(force = false) {
    if (!this.options.onHud) return;
    const timeLeft = Math.max(0, 480 - this.elapsed);
    const mins = Math.floor(timeLeft / 60), secs = Math.floor(timeLeft % 60);
    const target = this.contextTarget || this.findContextTarget();
    const liveEnemies = this.enemyBots.filter((bot) => bot.alive).length;
    const liveCrew = this.crew.filter((member) => member.alive).length;
    const progress = target?.hold && this.interactionType === target.type ? clamp(this.interactionProgress / target.duration, 0, 1) : 0;
    const eventCopy = this.eventActive ? this.eventDescription() : `Sector event in ${this.formatTime(Math.max(0, 27 - this.elapsed))}`;
    this.options.onHud({
      time: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      alive: 1 + liveEnemies + liveCrew,
      health: this.player.health, armor: this.player.armor, ammo: this.ammo, reserve: this.reserve,
      weapon: this.weapon.name, category: this.weapon.category, kills: this.kills, score: this.score,
      mode: this.mode === 'black-sector' ? 'BLACK SECTOR' : 'COLLAPSE',
      underground: this.underground, eventName: this.eventActive ? this.eventName : 'DYNAMIC EVENT', eventCopy,
      eventActive: this.eventActive, objectiveTitle: this.intelRecovered ? 'Extract with intel' : 'Intel recovery',
      objectiveDesc: this.intelRecovered ? 'Take Line 2 below or push to the surface LZ.' : 'Find the lower transit archive beneath Nova City.',
      objectiveComplete: this.intelRecovered, progress, context: target?.label || '', contextVisible: Boolean(target),
      grenades: this.grenades, reloading: this.reloading, crouched: this.isCrouched, inVehicle: this.inVehicle,
      zone: dist(this.player.x, this.player.y, this.zone.x, this.zone.y) <= this.zone.radius,
      force,
    });
  }

  eventDescription() {
    if (this.eventName === 'BLACKOUT') return 'Power grid down. Optics offline. Move by sound.';
    if (this.eventName === 'SANDSTORM') return 'Low visibility across the surface. Close the gap.';
    return 'Water is rising. Low crossings are compromised.';
  }

  formatTime(value) {
    const mins = Math.floor(value / 60), secs = Math.floor(value % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  emitMessage(message) {
    this.options.onMessage?.(message);
  }

  finish(result) {
    if (this.endNotified) return;
    this.endNotified = true; this.ended = true;
    this.options.onEnd?.({ result, kills: this.kills, score: this.score, damage: Math.round(this.damage), intel: this.intelRecovered, time: this.elapsed, alive: this.enemyBots.filter((bot) => bot.alive).length + 1 });
  }

  render() {
    const ctx = this.ctx;
    const w = this.width, h = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#152022'; ctx.fillRect(0, 0, w, h);
    const cam = this.camera();
    ctx.save(); ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(this.underground ? this.underMap : this.surfaceMap, 0, 0);
    if (!this.underground) this.drawWorldObjects(ctx);
    else this.drawUndergroundObjects(ctx);
    const actors = this.underground ? this.underGuards : [...this.enemyBots, ...this.crew];
    for (const actor of actors) if (actor.alive) this.drawActor(ctx, actor, actor.friendly ? '#6fe5da' : (actor.guard ? '#f0ab64' : '#d66c5e'));
    for (const bullet of this.bullets) {
      if (bullet.underground !== this.underground) continue;
      ctx.strokeStyle = bullet.friendly ? 'rgba(255,211,128,.82)' : 'rgba(255,93,84,.78)';
      ctx.lineWidth = bullet.friendly ? 2 : 1.6;
      ctx.beginPath(); ctx.moveTo(bullet.x - bullet.vx * .022, bullet.y - bullet.vy * .022); ctx.lineTo(bullet.x, bullet.y); ctx.stroke();
    }
    for (const grenade of this.grenadeObjects) if (grenade.underground === this.underground) {
      ctx.fillStyle = '#f3ad62'; ctx.beginPath(); ctx.arc(grenade.x, grenade.y, 5 + Math.sin(this.elapsed * 12) * 1.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(245,138,54,.48)'; ctx.beginPath(); ctx.arc(grenade.x, grenade.y, 10, 0, TAU); ctx.stroke();
    }
    for (const particle of this.particles) {
      ctx.globalAlpha = clamp(particle.life / (particle.total || .62), 0, 1);
      ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.drawPlayer(ctx);
    ctx.restore();
    this.drawWorldEffects(ctx, cam);
    this.drawAimMarker(ctx);
  }

  drawWorldObjects(ctx) {
    // Contract extraction LZ.
    if (this.extraction.unlocked) {
      ctx.save(); ctx.strokeStyle = 'rgba(245,138,54,.7)'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
      ctx.strokeRect(this.extraction.x - 53, this.extraction.y - 35, 106, 70); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245,138,54,.16)'; ctx.fillRect(this.extraction.x - 53, this.extraction.y - 35, 106, 70);
      ctx.fillStyle = '#ffc28a'; ctx.textAlign = 'center'; ctx.font = '700 9px Arial'; ctx.fillText('EXTRACTION / LZ-02', this.extraction.x, this.extraction.y - 44); ctx.restore();
    }
    // The breakline fractures into shifting sectors instead of presenting as a clean, static ring.
    const sectorShift = this.elapsed * .035;
    for (let sector = 0; sector < 8; sector++) {
      if ((sector + Math.floor(this.elapsed / 42)) % 5 === 0) continue;
      const start = sector / 8 * TAU + sectorShift;
      const end = start + TAU / 8 * .72;
      ctx.strokeStyle = sector === Math.floor(this.elapsed / 18) % 8 ? 'rgba(245,138,54,.7)' : 'rgba(106,227,226,.48)';
      ctx.lineWidth = 2; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.arc(this.zone.x, this.zone.y, this.zone.radius, start, end); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (this.eventActive && this.eventName === 'FLOOD ALERT') {
      ctx.fillStyle = 'rgba(54,153,168,.29)'; ctx.fillRect(1150, 835, 280, 120);
      ctx.strokeStyle = 'rgba(139,226,231,.4)'; ctx.lineWidth = 1;
      for (let y = 850; y < 950; y += 15) {
        ctx.beginPath(); ctx.moveTo(1157, y + Math.sin(this.elapsed + y) * 2); ctx.lineTo(1423, y + Math.sin(this.elapsed + y) * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(170,240,235,.82)'; ctx.font = '700 8px Arial'; ctx.textAlign = 'center'; ctx.fillText('FLOOD / SLOW CROSSING', 1290, 830);
    }
    ctx.fillStyle = 'rgba(4,12,14,.05)'; ctx.beginPath(); ctx.arc(this.zone.x, this.zone.y, this.zone.radius, 0, TAU); ctx.fill();
    if (!this.breachWall.broken && this.breachWall.hp > 0) {
      ctx.fillStyle = '#aa754c'; ctx.fillRect(this.breachWall.x, this.breachWall.y, this.breachWall.w, this.breachWall.h);
      ctx.fillStyle = '#202324'; ctx.fillRect(this.breachWall.x + 4, this.breachWall.y + 4, this.breachWall.w - 8, 3);
      ctx.fillStyle = '#ffc181'; ctx.font = '700 7px Arial'; ctx.textAlign = 'center'; ctx.fillText(`BREACH ${Math.ceil(this.breachWall.hp / this.breachWall.maxHp * 100)}%`, this.breachWall.x + this.breachWall.w / 2, this.breachWall.y - 5);
    } else if (this.breachWall.broken) {
      ctx.fillStyle = '#67513f'; ctx.fillRect(this.breachWall.x, this.breachWall.y, 17, 8); ctx.fillRect(this.breachWall.x + 71, this.breachWall.y + 6, 18, 7);
    }
    this.drawLoot(ctx, this.surfaceLoot.filter((item) => !item.underground));
    for (const tag of this.dogTags) if (!tag.collected) this.drawLootCrate(ctx, tag.x, tag.y, '#77e3df', 'TAG');
    if (this.buggy.available || this.inVehicle) this.drawBuggy(ctx, this.inVehicle ? this.player.x - 8 : this.buggy.x, this.inVehicle ? this.player.y + 5 : this.buggy.y, this.inVehicle ? this.player.angle : 0, 1);
  }

  drawUndergroundObjects(ctx) {
    this.drawLoot(ctx, this.underLoot);
    if (!this.intelRecovered) {
      const pulse = 1 + Math.sin(this.elapsed * 3.2) * .12;
      ctx.strokeStyle = 'rgba(245,138,54,.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(this.intel.x, this.intel.y, 25 * pulse, 0, TAU); ctx.stroke();
    }
    if (this.intelRecovered) {
      ctx.strokeStyle = '#f58a36'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.strokeRect(this.trainExit.x - 36, this.trainExit.y - 31, 72, 62); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245,138,54,.8)'; ctx.textAlign = 'center'; ctx.font = '700 8px Arial'; ctx.fillText('EXTRACTION ROUTE', this.trainExit.x, this.trainExit.y - 38);
    }
  }

  drawLoot(ctx, items) {
    for (const item of items) {
      if (item.collected) continue;
      this.drawLootCrate(ctx, item.x, item.y, item.kind === 'armor' ? '#70d5ca' : '#edb56b', item.kind === 'armor' ? 'A' : '＋');
    }
  }

  drawLootCrate(ctx, x, y, color, label) {
    ctx.fillStyle = 'rgba(0,0,0,.28)'; roundedRect(ctx, x - 10, y - 5, 23, 18, 3); ctx.fill();
    ctx.fillStyle = '#293233'; roundedRect(ctx, x - 11, y - 9, 22, 17, 3); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.strokeRect(x - 8, y - 7, 16, 13);
    ctx.fillStyle = color; ctx.font = '700 9px Arial'; ctx.textAlign = 'center'; ctx.fillText(label, x, y + 3);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y - 14, 2, 0, TAU); ctx.fill();
  }

  drawActor(ctx, actor, color) {
    const hp = Math.max(0, actor.health / 100);
    ctx.save(); ctx.translate(actor.x, actor.y);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(2, 8, 12, 8, 0, 0, TAU); ctx.fill();
    ctx.rotate(actor.angle);
    ctx.fillStyle = actor.friendly ? '#315b5a' : (actor.guard ? '#5e4d39' : '#55413f');
    roundedRect(ctx, -9, -10, 20, 19, 5); ctx.fill();
    ctx.fillStyle = color; roundedRect(ctx, -5, -7, 12, 13, 3); ctx.fill();
    ctx.fillStyle = '#d0bda1'; ctx.beginPath(); ctx.arc(3, 0, 5.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#d4d8cf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(19, 0); ctx.stroke();
    ctx.restore();
    if (this.width > 650 || dist(actor.x, actor.y, this.player.x, this.player.y) < 330) {
      ctx.fillStyle = 'rgba(7,11,12,.78)'; roundedRect(ctx, actor.x - 18, actor.y - 27, 36, 4, 2); ctx.fill();
      ctx.fillStyle = actor.friendly ? '#77e3df' : '#f07565'; roundedRect(ctx, actor.x - 17, actor.y - 26, 34 * hp, 2, 1); ctx.fill();
      ctx.fillStyle = 'rgba(220,229,221,.68)'; ctx.font = '700 7px Arial'; ctx.textAlign = 'center'; ctx.fillText(actor.name, actor.x, actor.y - 32);
    }
  }

  drawPlayer(ctx) {
    const p = this.player;
    ctx.save(); ctx.translate(p.x, p.y);
    if (this.player.jumpTimer > 0) {
      const jumpHeight = Math.sin((.32 - this.player.jumpTimer) / .32 * Math.PI) * 12;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(1, 12, 11, 7, 0, 0, TAU); ctx.fill();
      ctx.translate(0, -jumpHeight);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.beginPath(); ctx.ellipse(2, 9, 12, 8, 0, 0, TAU); ctx.fill();
    }
    if (this.isADS) { ctx.fillStyle = 'rgba(119,227,223,.1)'; ctx.beginPath(); ctx.arc(0, 0, 51, 0, TAU); ctx.fill(); }
    ctx.rotate(p.angle);
    ctx.fillStyle = this.player.hitFlash > 0 ? '#f3c6aa' : '#314c49';
    roundedRect(ctx, -10, -10, 22, 20, 5); ctx.fill();
    ctx.fillStyle = '#77e3df'; roundedRect(ctx, -5, -7, 12, 14, 3); ctx.fill();
    ctx.fillStyle = '#d7c6a7'; ctx.beginPath(); ctx.arc(4, 0, 5.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#162022'; ctx.fillRect(2, -4, 5, 2);
    ctx.strokeStyle = '#e4e7dd'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(23, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(119,227,223,.72)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.stroke();
    ctx.restore();
    // Small player direction chevron keeps the avatar readable under event effects.
    ctx.fillStyle = 'rgba(119,227,223,.92)';
    ctx.beginPath(); ctx.moveTo(p.x + Math.cos(p.angle) * 25, p.y + Math.sin(p.angle) * 25);
    ctx.lineTo(p.x + Math.cos(p.angle + 2.3) * 11, p.y + Math.sin(p.angle + 2.3) * 11);
    ctx.lineTo(p.x + Math.cos(p.angle - 2.3) * 11, p.y + Math.sin(p.angle - 2.3) * 11); ctx.closePath(); ctx.fill();
  }

  drawWorldEffects(ctx, cam) {
    if (!this.eventActive) return;
    const w = this.width, h = this.height;
    if (this.eventName === 'BLACKOUT') {
      const px = this.player.x - cam.x, py = this.player.y - cam.y;
      const gradient = ctx.createRadialGradient(px, py, 42, px, py, Math.min(w, h) * .77);
      gradient.addColorStop(0, 'rgba(2,6,8,.05)'); gradient.addColorStop(.32, 'rgba(2,6,8,.18)'); gradient.addColorStop(.72, 'rgba(2,6,8,.76)'); gradient.addColorStop(1, 'rgba(2,6,8,.9)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(119,227,223,.05)'; ctx.fillRect(0, 0, w, h);
    } else if (this.eventName === 'SANDSTORM') {
      ctx.fillStyle = 'rgba(185,137,83,.22)'; ctx.fillRect(0, 0, w, h);
      const gradient = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .12, w / 2, h / 2, Math.max(w, h) * .67);
      gradient.addColorStop(0, 'rgba(175,134,91,0)'); gradient.addColorStop(1, 'rgba(112,91,70,.6)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = 'rgba(66,151,168,.13)'; ctx.fillRect(0, h * .58, w, h * .42);
      ctx.fillStyle = 'rgba(126,202,213,.12)';
      for (let i = 0; i < 7; i++) { const y = h * (.63 + i * .045) + Math.sin(this.elapsed * 1.2 + i) * 2; ctx.fillRect(0, y, w, 1); }
    }
  }

  drawAimMarker(ctx) {
    if (this.mouseAimScreen && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const { x, y } = this.mouseAimScreen;
      ctx.strokeStyle = 'rgba(220,241,231,.67)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 12); ctx.stroke();
    }
    if (this.shotFlash > 0) {
      const x = this.width / 2 + this.input.ax * 27, y = this.height / 2 + this.input.ay * 27;
      ctx.fillStyle = `rgba(255,211,139,${this.shotFlash / .07})`; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill();
    }
  }

  drawMiniMap() {
    const mini = document.getElementById('miniMap');
    if (!mini) return;
    const ctx = mini.getContext('2d');
    const w = mini.width = 264, h = mini.height = 184;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#141d1f'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.surfaceMap, 0, 0, WORLD.w, WORLD.h, 0, 0, w, h);
    ctx.fillStyle = 'rgba(4,8,9,.55)';
    if (this.eventName === 'BLACKOUT' && this.eventActive) ctx.fillRect(0, 0, w, h);
    const scaleX = w / WORLD.w, scaleY = h / WORLD.h;
    ctx.strokeStyle = 'rgba(119,227,223,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    for (let sector = 0; sector < 8; sector++) {
      if ((sector + Math.floor(this.elapsed / 42)) % 5 === 0) continue;
      const start = sector / 8 * TAU + this.elapsed * .035;
      ctx.beginPath(); ctx.arc(this.zone.x * scaleX, this.zone.y * scaleY, this.zone.radius * scaleX, start, start + TAU / 8 * .72); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (this.extraction.unlocked) {
      ctx.fillStyle = '#f58a36'; ctx.fillRect(this.extraction.x * scaleX - 3, this.extraction.y * scaleY - 3, 6, 6);
    }
    ctx.fillStyle = '#edb56b'; ctx.fillRect(this.metro.x * scaleX - 2, this.metro.y * scaleY - 2, 4, 4);
    if (!this.intelRecovered) { ctx.fillStyle = '#e8a75d'; ctx.fillRect(0.61 * w, 0.25 * h, 4, 4); }
    for (const bot of this.enemyBots) {
      if (!bot.alive) continue;
      ctx.fillStyle = 'rgba(238,112,98,.76)'; ctx.fillRect(bot.x * scaleX, bot.y * scaleY, 2, 2);
    }
    ctx.fillStyle = '#8ffff0'; ctx.beginPath(); ctx.arc(this.player.x * scaleX, this.player.y * scaleY, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(143,255,240,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(this.player.x * scaleX, this.player.y * scaleY); ctx.lineTo((this.player.x + Math.cos(this.player.angle) * 45) * scaleX, (this.player.y + Math.sin(this.player.angle) * 45) * scaleY); ctx.stroke();
    if (this.underground) {
      ctx.fillStyle = 'rgba(4,7,8,.7)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(119,227,223,.18)'; ctx.fillRect(.1 * w, .38 * h, .78 * w, .18 * h); ctx.fillRect(.48 * w, .18 * h, .2 * w, .6 * h);
      ctx.fillStyle = '#8ffff0'; ctx.beginPath(); ctx.arc(this.player.x / UNDER.w * w, this.player.y / UNDER.h * h, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9a65b'; ctx.fillRect(this.intel.x / UNDER.w * w - 2, this.intel.y / UNDER.h * h - 2, 5, 5);
    }
  }
}
