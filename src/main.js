import { CanvasArena, WEAPONS } from './game.js';
import './styles.css';

const STORAGE_KEY = 'last-zone-profile-v1';
const DEFAULTS = {
  screen: 'lobby', page: 'play', mode: 'collapse', teamSize: 4, weapon: 'kestrel', operator: 'engineer', contract: 'intel',
  moreOpen: false, customizeFrom: 'settings', lastResult: null,
  profile: { callsign: 'NIGHTSHIFT', level: 18, xp: 17460, credits: 2850, matches: 12, wins: 2, extractions: 4, bestKills: 8, weaponMastery: 38 },
  settings: { gyro: 'off', sensitivity: 100, aimAssist: true, autoPickup: true, quickLoot: true, smartReload: true, performance: 'balanced', spatialAudio: true },
  hud: { move: [.15, .76], aim: [.70, .77], fire: [.89, .65], ads: [.83, .84], crouch: [.94, .82], jump: [.93, .57], grenade: [.57, .83], reload: [.59, .65], swap: [.56, .75], interact: [.48, .70] },
  cosmetics: [],
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return structuredClone(DEFAULTS);
    return {
      ...structuredClone(DEFAULTS), ...stored,
      profile: { ...DEFAULTS.profile, ...(stored.profile || {}) },
      settings: { ...DEFAULTS.settings, ...(stored.settings || {}) },
      hud: { ...DEFAULTS.hud, ...(stored.hud || {}) },
      cosmetics: Array.isArray(stored.cosmetics) ? stored.cosmetics : [],
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let state = loadState();
let game = null;
let toastTimer = 0;
let deployTimer = 0;
let countdownTimer = 0;
let controlDrag = null;
const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastEl = document.getElementById('toast');

function save() {
  try {
    const persisted = { ...state, screen: 'lobby', moreOpen: false, lastResult: null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch { /* Private browsing can deny storage; the current session still works. */ }
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function icon(name) {
  const icons = {
    play: '<path d="m8 5 11 7-11 7V5Z"/><path d="M4 4v16"/>',
    loadout: '<path d="M3 7h11M3 12h18M3 17h14"/><path d="M16 5v4M8 10v4M19 15v4"/>',
    operator: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0M18 5l2-2"/>',
    missions: '<path d="M5 4h14v17l-7-4-7 4V4Z"/><path d="m9 10 2 2 4-4"/>',
    season: '<path d="m12 2 2.7 6.1 6.6.6-5 4.3 1.5 6.5-5.8-3.4-5.8 3.4 1.5-6.5-5-4.3 6.6-.6L12 2Z"/>',
    clan: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20a7 7 0 0 1 14 0M15 15a5 5 0 0 1 7 5"/>',
    store: '<path d="M4 8h16l-1 12H5L4 8Z"/><path d="M8 9V6a4 4 0 1 1 8 0v3M8 14h8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 1.1 1.9-2 2-1.9-1.1a7 7 0 0 1-2.1.9L14 21h-4l-.5-2.3a7 7 0 0 1-2.1-.9L5.5 19l-2-2L4.6 15a7 7 0 0 1-.9-2.1L1.5 12l2.2-.5A7 7 0 0 1 4.6 9L3.5 7l2-2L7.4 6.1a7 7 0 0 1 2.1-.9L10 3h4l.5 2.2a7 7 0 0 1 2.1.9L18.5 5l2 2L19.4 9a7 7 0 0 1 .9 2.1l2.2.5-2.2.5a7 7 0 0 1-.9 2.9Z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
    exit: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7v18h-7"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    intel: '<path d="M5 3h14v18H5z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    grenade: '<path d="M9 5h6v4l3 3v7H6v-7l3-3V5Z"/><path d="M10 2h4v3h-4zM18 12h3"/>',
    spark: '<path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5L12 3Z"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
}

function navButton(page, title, symbol, selected = false) {
  return `<button class="nav-item ${selected ? 'active' : ''}" type="button" data-route="${page}" aria-label="${title}" ${selected ? 'aria-current="page"' : ''}>${icon(symbol)}<span class="nav-label">${title}</span></button>`;
}

function topbar() {
  const profile = state.profile;
  return `<header class="topbar">
    <button class="brand-lockup" type="button" data-route="play" aria-label="Last Zone home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span><span class="brand-name">LAST ZONE</span><span class="brand-sub">COLLAPSE / S01</span></span>
    </button>
    <div class="topbar-center"><span class="season-pill"><i class="live-dot"></i> SEASON 01 · THE COLLAPSE</span><span>KHARON ISLAND / 04</span></div>
    <div class="topbar-right">
      <div class="currency" title="Cosmetic currency"><span class="coin">L</span><span class="currency-label">${profile.credits.toLocaleString()}</span></div>
      <button class="profile-button" type="button" data-route="settings" aria-label="Open player settings">
        <span class="profile-info"><span class="profile-name">${esc(profile.callsign)}</span><span class="profile-rank">FIELD LEVEL ${profile.level} · OPERATOR</span></span>
        <span class="profile-avatar">${esc(profile.callsign.slice(0, 2).toUpperCase())}</span>
      </button>
    </div>
  </header>`;
}

function desktopNav() {
  return `<nav class="desktop-nav" aria-label="Main navigation">
    ${navButton('play', 'Play', 'play', state.page === 'play')}
    ${navButton('loadout', 'Loadout', 'loadout', state.page === 'loadout')}
    ${navButton('operators', 'Operators', 'operator', state.page === 'operators')}
    ${navButton('missions', 'Missions', 'missions', state.page === 'missions')}
    ${navButton('season', 'Season', 'season', state.page === 'season')}
    <span class="nav-divider"></span>
    ${navButton('clan', 'Squad', 'clan', state.page === 'clan')}
    ${navButton('store', 'Store', 'store', state.page === 'store')}
    <div class="nav-bottom">${navButton('settings', 'Settings', 'settings', state.page === 'settings' || state.page === 'customize')}</div>
  </nav>`;
}

function mobileNav() {
  const morePages = ['operators', 'clan', 'store', 'settings'];
  const activeMore = morePages.includes(state.page) || state.page === 'customize';
  const moreMenu = state.moreOpen ? `<div class="more-sheet"><div class="more-sheet-title">COMMAND MENU</div>${morePages.map((page) => `<button type="button" data-route="${page}">${icon(page === 'operators' ? 'operator' : page === 'clan' ? 'clan' : page === 'store' ? 'store' : 'settings')}<span>${page === 'clan' ? 'Squad / Clan' : page}</span>${icon('arrow')}</button>`).join('')}</div>` : '';
  return `<nav class="mobile-nav" aria-label="Main navigation">
    ${navButton('play', 'Play', 'play', state.page === 'play')}
    ${navButton('loadout', 'Kit', 'loadout', state.page === 'loadout')}
    ${navButton('missions', 'Ops', 'missions', state.page === 'missions')}
    ${navButton('season', 'Season', 'season', state.page === 'season')}
    <button class="nav-item ${activeMore ? 'active' : ''}" type="button" data-action="more" aria-label="More pages">${icon('settings')}<span class="nav-label">More</span></button>
    ${moreMenu}
  </nav>`;
}

function pageHead(kicker, title, copy, right = '') {
  return `<div class="page-head"><div><div class="page-eyebrow">${kicker}</div><h1 class="page-title">${title}</h1><p class="page-copy">${copy}</p></div>${right}</div>`;
}

function renderPlay() {
  const mode = state.mode;
  const isCollapse = mode === 'collapse';
  const team = state.teamSize;
  return `<div class="dashboard">
    <section class="hero-card" aria-label="Kharon Island deployment briefing">
      <div class="hero-art" role="img" aria-label="Blackout over Nova City on Kharon Island"></div>
      <div class="hero-topline"><span class="region-tag"><span class="region-mark">K</span> KHARON ISLAND <span style="color:#657174">/</span> SECTOR 04</span><span class="live-alert"><i class="live-dot"></i> ${isCollapse ? 'BREAKLINE UNSTABLE' : 'EXTRACTION WINDOW OPEN'}</span></div>
      <div class="hero-copy">
        <div class="hero-location">${isCollapse ? 'COLLAPSE / 20 OPERATORS' : 'BLACK SECTOR / EXTRACTION OPS'}</div>
        <h1 class="hero-title">LAST<br />ZONE<span>${isCollapse ? 'COLLAPSE' : 'BLACK SECTOR'}</span></h1>
        <p class="hero-tagline"><strong>The battlefield doesn't shrink.</strong> It breaks.<span class="hero-secondary">Survive the players. Survive the world.</span></p>
      </div>
      <div class="hero-bottom">
        <div class="hero-actions">
          <button class="btn btn-primary" type="button" data-action="deploy">${icon('play')} DEPLOY / ${isCollapse ? 'COLLAPSE' : 'BLACK SECTOR'}</button>
          <button class="btn btn-ghost" type="button" data-route="loadout">${icon('loadout')} FIELD KIT</button>
        </div>
        <div class="hero-meta"><div class="meta-item"><span class="meta-label">Match</span><span class="meta-value">08–12 <small>MIN</small></span></div><div class="meta-item"><span class="meta-label">Squad</span><span class="meta-value">${team}<small> OPERATORS</small></span></div><div class="meta-item"><span class="meta-label">Build</span><span class="meta-value">LOCAL <small>FIELD TEST</small></span></div></div>
      </div>
    </section>
    <aside class="command-rail">
      <section class="panel contract-panel"><div class="panel-inner">
        <div class="panel-header"><span class="panel-kicker">ACTIVE CONTRACT / 01</span><span class="panel-code">LZ-INTEL-04</span></div>
        <h2 class="contract-title">Intel Recovery</h2>
        <p class="contract-description">Secure the archive below Nova. Extract the package to open two high-risk exits.</p>
        <div class="contract-reward"><span class="reward-icon">L</span> 700 XP <span style="color:#5e696c">+</span> 250 CREDITS</div>
        <div class="contract-footer"><span class="contract-state"><i class="live-dot"></i> ${state.contract === 'intel' ? 'CONTRACT SELECTED' : 'OPTIONAL OBJECTIVE'}</span><button class="link-button" type="button" data-route="missions">BRIEFING ${icon('arrow')}</button></div>
      </div></section>
      <section class="panel operation-card"><div class="panel-inner">
        <div class="panel-header"><span class="panel-kicker">WORLD EVENT / RANDOMIZED</span><span class="panel-code">IN MATCH</span></div>
        <div class="event-countdown"><div><span class="panel-kicker">NEXT SIGNAL</span><h2 class="event-name">World Event</h2></div><div class="event-time">00:27<span class="event-caption">AFTER INSERTION</span></div></div>
        <p class="event-desc">Randomized per drop: blackout, sandstorm or rising water. Routes change with the signal.</p>
        <span class="event-chip">${icon('spark')} EVENT POOL / 03</span>
      </div></section>
    </aside>
    <section class="briefing-row">
      <div class="panel mode-panel"><div class="panel-inner"><div class="panel-header"><span class="panel-kicker">SELECT OPERATION</span><span class="panel-code">MATCHMAKING / LOCAL FIELD TEST</span></div>
        <div class="mode-options">
          <button type="button" class="mode-option ${isCollapse ? 'selected' : ''}" data-mode="collapse"><span class="mode-icon">${icon('crosshair')}</span><span><span class="mode-name">Collapse</span><span class="mode-info">Battle royale · two victory paths</span></span><span class="mode-badge">FLAGSHIP</span></button>
          <button type="button" class="mode-option ${!isCollapse ? 'selected' : ''}" data-mode="black-sector"><span class="mode-icon">${icon('intel')}</span><span><span class="mode-name">Black Sector</span><span class="mode-info">Extract valuable mission intel</span></span><span class="mode-badge">EXTRACTION</span></button>
        </div>
      </div></div>
      <div class="panel squad-panel"><div class="panel-inner"><div class="squad-head"><span class="panel-kicker">SQUAD ASSEMBLY</span><span class="panel-code">OPEN / FILL</span></div>
        <div class="squad-list">${Array.from({ length: 4 }, (_, index) => `<span class="squad-slot ${index < team ? 'filled' : ''} ${index === 0 ? 'is-player' : ''}">${index < team ? (index === 0 ? 'N' : ['P', 'M', 'W'][index - 1]) : '+'}</span>`).join('')}<span class="squad-slots-label"><strong>${team} / 4</strong>OPERATORS READY</span></div>
        <div class="squad-footer"><div class="size-switch" role="group" aria-label="Squad size">${[1, 2, 4].map((size) => `<button type="button" class="${team === size ? 'selected' : ''}" data-team="${size}" aria-pressed="${team === size}">${size === 1 ? 'SOLO' : size}</button>`).join('')}</div><span class="match-format">${team === 1 ? 'LONE OPERATOR' : team === 2 ? 'DUO INSERTION' : 'SQUAD OF FOUR'}</span></div>
      </div></div>
    </section>
  </div>`;
}

function weaponSvg(key) {
  const variants = {
    kestrel: '<path d="M18 39h48l17-10h42l18 7h47v7h-26l-6 4H95l-8-4H67L56 52H43l5-9H18z"/><path d="M113 36v-9h18v9M80 41v18H67l-4-14M146 43l8 9h13l-8-10"/><path d="M28 37v-7h18v7M46 37h18M174 39v8"/>',
    vox: '<path d="M22 39h44l10-8h37l16 8h36v8h-30l-8 6H93l-9-6H68L58 57H47l4-10H22z"/><path d="M98 37v-8h15v8M76 43v13H64l-3-10M138 42l8 8h13"/><path d="M26 37v-6h20v6M169 40v7"/>',
    rook: '<path d="M15 37h61l12-8h44l16 8h42v8h-34l-8 4h-47l-8-4H70L60 57H48l5-12H15z"/><path d="M112 36v-10h30v10M81 41v16H68l-3-12M143 40l9 9h11"/><path d="M20 35v-6h38v6M154 37v-5h29"/>',
  };
  return `<svg viewBox="0 0 205 72" aria-hidden="true"><g stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${variants[key]}</g></svg>`;
}

function statLine(label, value) {
  return `<div class="stat-row"><span>${label}</span><span class="stat-bar"><i style="width:${value}%"></i></span></div>`;
}

function renderLoadout() {
  const weapons = [
    ['kestrel', 'ASSAULT RIFLE', 'Kestrel-7', 'Stable platform / all-rounder', [74, 71, 69]],
    ['vox', 'SUBMACHINE GUN', 'Vox-9', 'Fast handling / close range', [54, 82, 91]],
    ['rook', 'MARKSMAN RIFLE', 'Rook DMR', 'Hard impact / controlled pace', [94, 46, 53]],
  ];
  return `<div class="page-content">${pageHead('FIELD ARMORY / CONFIGURATION', 'Your kit. Your call.', 'Three readable weapon profiles. No stat grind, no paid edge. Choose what fits your drop.')}
    <div class="card-grid">${weapons.map(([key, role, name, call, stats], index) => `<button type="button" class="weapon-card ${state.weapon === key ? 'selected' : ''}" data-weapon="${key}" aria-pressed="${state.weapon === key}">
      ${state.weapon === key ? '<span class="weapon-selected-badge">EQUIPPED</span>' : ''}<div class="weapon-top"><span class="weapon-class">${role}</span><span class="weapon-num">0${index + 1}</span></div>
      <span class="weapon-art">${weaponSvg(key)}</span><div><h2 class="weapon-name">${name}</h2><div class="weapon-call">${call}</div><div class="weapon-stats">${statLine('Damage', stats[0])}${statLine('Control', stats[1])}${statLine('Handling', stats[2])}</div></div>
    </button>`).join('')}</div>
    <div class="two-col" style="margin-top:14px"><section class="content-card"><div class="card-pad"><div class="panel-header"><span class="panel-kicker">PRIMARY / ${WEAPONS[state.weapon].category.toUpperCase()}</span><span class="panel-code">MASTERY ${state.profile.weaponMastery}%</span></div><h2 class="card-title">${WEAPONS[state.weapon].name} · Field build</h2><p class="card-subtitle">Default loadout tuned for the first field test. Attachments change handling feel only; there are no paid stat boosts.</p><div class="settings-row" style="margin-top:13px"><div><span class="setting-label">Reflex optic</span><span class="setting-hint">Quick acquisition / 1.25×</span></div><span class="event-chip">INSTALLED</span></div><div class="settings-row"><div><span class="setting-label">Compensator</span><span class="setting-hint">Moderate vertical recoil control</span></div><span class="event-chip">INSTALLED</span></div></div></section>
      <section class="content-card"><div class="card-pad"><div class="panel-header"><span class="panel-kicker">CARRIED EQUIPMENT</span><span class="panel-code">MVP LOADOUT</span></div><div class="settings-row"><div><span class="setting-label">Secondary</span><span class="setting-hint">P-11 sidearm · 12 / 48</span></div><span style="color:var(--cyan);font-size:9px">READY</span></div><div class="settings-row"><div><span class="setting-label">Tactical</span><span class="setting-hint">G-3 fragmentation grenade</span></div><span style="color:var(--cyan);font-size:9px">× 1</span></div><div class="settings-row"><div><span class="setting-label">Armor</span><span class="setting-hint">Tier II / 82% durability</span></div>${icon('shield')}</div></div></section></div>
  </div>`;
}

const operators = [
  { id: 'scout', name: 'Scout', role: 'Information', icon: 'map', perk: 'Recon drone, movement pings and route awareness. Better information; no combat buff.' },
  { id: 'medic', name: 'Medic', role: 'Squad survival', icon: 'shield', perk: 'Field trauma kit, quicker teammate revive and one medical resupply.' },
  { id: 'engineer', name: 'Engineer', role: 'Vehicle / breach', icon: 'spark', perk: 'Repair kit, deployable cover and a controlled wall breach charge.' },
  { id: 'recon', name: 'Recon', role: 'Long sightlines', icon: 'crosshair', perk: 'Tactical scanner, long-range optics and a short intel read.' },
];

function renderOperators() {
  return `<div class="page-content">${pageHead('OPERATOR CELL / FIELD SPECIALIZATIONS', 'Tools over superpowers.', 'Every operator fights with the same weapon pool. Specializations create squad utility, not magical combat advantages.')}
    <div class="operator-grid">${operators.map((op) => `<button type="button" class="operator-card ${state.operator === op.id ? 'selected' : ''}" data-operator="${op.id}" aria-pressed="${state.operator === op.id}">${state.operator === op.id ? '<span class="operator-selected">SELECTED</span>' : ''}<span class="operator-sigil">${icon(op.icon)}</span><h2 class="operator-name">${op.name}</h2><div class="operator-role">${op.role}</div><p class="operator-perk">${op.perk}</p></button>`).join('')}</div>
    <div class="content-card" style="margin-top:14px"><div class="card-pad"><div class="panel-header"><span class="panel-kicker">CURRENT DEPLOYMENT</span><span class="panel-code">FIELD TEST / 01</span></div><h2 class="card-title">${operators.find((op) => op.id === state.operator)?.name || 'Engineer'} kit assigned</h2><p class="card-subtitle">This browser vertical slice demonstrates the Engineer's breach route. Operator utility gear is represented in the product direction; networked class inventory is not part of this local simulation.</p></div></div>
  </div>`;
}

function renderMissions() {
  const contractList = [
    { id: 'intel', title: 'Intel Recovery', desc: 'Locate the archive below Nova City. Unlock surface and train extraction.', reward: '700 XP / 250 C', state: 'PLAYABLE NOW', mark: '01' },
    { id: 'bounty', title: 'Bounty', desc: 'Track an enemy fireteam using a limited intel window.', reward: '500 XP / 180 C', state: 'NEXT OP', mark: '02' },
    { id: 'radar', title: 'Radar Control', desc: 'Hold a rooftop uplink and expose nearby movement.', reward: '420 XP / 160 C', state: 'NEXT OP', mark: '03' },
  ];
  return `<div class="page-content">${pageHead('CONTRACTS / OPTIONAL OBJECTIVES', 'Purpose beyond survival.', 'Contracts pull squads into motion. The active Intel Recovery objective is playable in this vertical slice; more operations are on the roadmap.')}
    <div class="contract-list">${contractList.map((item) => `<button type="button" class="contract-select ${state.contract === item.id ? 'selected' : ''}" data-contract="${item.id}" ${item.id !== 'intel' ? 'disabled' : ''}><span class="contract-select-icon">${item.mark}</span><span><h3>${item.title}</h3><p>${item.desc}</p></span><span class="contract-select-meta">${item.state}<br /><span style="color:#a5afab;font-weight:500;letter-spacing:.02em">${item.reward}</span></span></button>`).join('')}</div>
    <section class="content-card" style="margin-top:14px"><div class="card-pad"><div class="panel-header"><span class="panel-kicker">MISSION RULES</span><span class="panel-code">EXTRACTION ≠ SURVIVAL WIN</span></div><p class="card-subtitle">Complete the contract, then hold either extraction long enough to call it in. A successful extraction awards a separate mission result. It does not erase the survival leaderboard.</p></div></section>
  </div>`;
}

function renderSeason() {
  const progress = Math.min(100, state.profile.xp % 1000 / 10);
  const rewards = [['L', '250 credits', 'FREE / 08'], ['◇', 'Ashline banner', 'FREE / 12'], ['✣', 'Breakwater kit', 'PREMIUM / 18'], ['⌁', 'Stormline wrap', 'FREE / 22'], ['✦', 'Nova flare', 'PREMIUM / 30']];
  return `<div class="page-content">${pageHead('SEASON 01 / PROGRESSION', 'The Collapse.', 'Season rewards are cosmetic only. The free track contains core progression; no gameplay power is sold.')}
    <section class="progress-card"><div class="progress-card-inner"><span class="page-eyebrow">LIVE / 42 DAYS REMAINING</span><h2 class="season-title">THE<span>COLLAPSE</span></h2><div class="season-progress"><div class="progress-label"><span>FIELD LEVEL ${state.profile.level} / NEXT LEVEL</span><span>${Math.round(progress)}%</span></div><div class="progress-track"><span style="width:${progress}%"></span></div></div></div></section>
    <div class="panel" style="margin-top:14px"><div class="panel-inner"><div class="panel-header"><span class="panel-kicker">NEXT REWARDS</span><span class="panel-code">FREE + PREMIUM / COSMETIC ONLY</span></div><div class="reward-track">${rewards.map(([mark, name, tier], index) => `<div class="reward-tile"><span class="reward-visual">${mark}</span><div class="reward-name">${name}</div><div class="reward-tier">${tier}</div></div>`).join('')}</div></div></div>
  </div>`;
}

function renderStore() {
  const items = [
    { id: 'outpost', name: 'Outpost / operator rig', kind: 'Operator skin', price: 850, mark: '04' },
    { id: 'signal', name: 'Signal / Kestrel wrap', kind: 'Weapon skin', price: 600, mark: '∕' },
    { id: 'ferry', name: 'Ferry / utility buggy', kind: 'Vehicle skin', price: 950, mark: '↗' },
  ];
  return `<div class="page-content">${pageHead('QUARTERMASTER / COSMETICS', 'Look different. Play equal.', 'Everything in the store is cosmetic. No weapons, armor, currency boosts or competitive advantages for sale.', `<span class="event-chip"><span class="coin">L</span>${state.profile.credits.toLocaleString()} CREDITS</span>`)}
    <div class="cosmetic-grid">${items.map((item) => `<article class="cosmetic-card"><div class="cosmetic-art">${item.mark}</div><div><div class="cosmetic-name">${item.name}</div><div class="cosmetic-kind">${item.kind} · COSMETIC</div></div><div style="display:flex;justify-content:space-between;align-items:center"><span class="cosmetic-cost"><span class="coin">L</span>${item.price}</span><button class="btn btn-sm" type="button" data-buy="${item.id}" data-price="${item.price}" data-name="${item.name}" ${state.cosmetics.includes(item.id) ? 'disabled' : ''}>${state.cosmetics.includes(item.id) ? 'OWNED' : 'UNLOCK'}</button></div></article>`).join('')}</div>
    <div class="device-note" style="margin-top:14px"><strong>Fair-play promise.</strong> Paid cosmetics never affect damage, armor, movement, recoil or matchmaking.</div>
  </div>`;
}

function renderClan() {
  return `<div class="page-content">${pageHead('SOCIAL / SQUAD NETWORK', 'Better together.', 'Build your fireteam before the drop. Squad invitations, voice and clan services need a live backend; this preview keeps social features local.')}
    <div class="clan-banner"><div class="clan-emblem"><span>∆</span></div><div><div class="panel-kicker">FIELD CELL / LOCAL</div><h2 class="card-title" style="margin-top:7px">NO SIGNAL</h2><p class="card-subtitle">Connect with friends in a future online build.</p></div><div class="clan-stats"><div class="clan-stat"><strong>—</strong><span>Members</span></div><div class="clan-stat"><strong>—</strong><span>Weekly XP</span></div><div class="clan-stat"><strong>—</strong><span>Region</span></div></div></div>
    <div class="two-col" style="margin-top:14px"><div class="content-card"><div class="card-pad"><div class="panel-header"><span class="panel-kicker">SQUAD ROSTER</span><span class="panel-code">4 / 4 SLOTS</span></div><div class="settings-row"><span class="setting-label">${esc(state.profile.callsign)} <span style="color:var(--cyan)">· YOU</span></span><span style="color:#879194;font-size:8px">ENGINEER</span></div>${['PATCH', 'MICA', 'WARD'].map((name, i) => `<div class="settings-row"><span class="setting-label">${i < state.teamSize - 1 ? name : 'OPEN SLOT'}</span><span style="color:${i < state.teamSize - 1 ? 'var(--green)' : '#687477'};font-size:8px">${i < state.teamSize - 1 ? 'READY' : 'INVITE'}</span></div>`).join('')}</div></div><div class="content-card"><div class="card-pad"><div class="panel-header"><span class="panel-kicker">COMMS</span><span class="panel-code">QUICK CALLS</span></div><div class="contract-list">${['Enemy spotted.', 'Need ammo.', 'Let’s move.', 'Enemy vehicle.', 'Extraction here.'].map((msg) => `<button class="contract-select" type="button" data-quick-message="${esc(msg)}"><span class="contract-select-icon">↗</span><span><h3>${msg}</h3><p>Quick communication preset</p></span></button>`).join('')}</div></div></div></div>
  </div>`;
}

function renderSettings() {
  const s = state.settings;
  const gyroLabels = [['off', 'OFF'], ['ads', 'ADS ONLY'], ['always', 'ALWAYS']];
  const graphics = [['low', 'LOW · 30'], ['balanced', 'BAL · 60'], ['ultra', 'ULTRA · 90'], ['extreme', 'MAX · 120']];
  return `<div class="page-content">${pageHead('SYSTEMS / MOBILE CONTROLS', 'Make it yours.', 'Tune touch aim, gyro and visual targets. Device support varies; this web preview runs on the display refresh available to your browser.')}
    <div class="settings-layout"><section class="content-card"><div class="card-pad"><div class="panel-header"><span class="panel-kicker">INPUT & ACCESSIBILITY</span><span class="panel-code">SAVED LOCALLY</span></div>
      <div class="settings-group"><h2 class="settings-group-title">Aim & movement</h2>
        <div class="settings-row"><div><span class="setting-label">Gyroscope aiming</span><span class="setting-hint">Phone motion supplements touch aim</span></div><div class="segmented" role="group" aria-label="Gyroscope mode">${gyroLabels.map(([value, label]) => `<button type="button" class="${s.gyro === value ? 'selected' : ''}" data-gyro="${value}" aria-pressed="${s.gyro === value}">${label}</button>`).join('')}</div></div>
        <div class="settings-row"><div><span class="setting-label">Aim sensitivity</span><span class="setting-hint">Camera / gyro scale</span></div><label class="range-wrap"><input type="range" min="50" max="150" value="${s.sensitivity}" data-setting-range="sensitivity" aria-label="Aim sensitivity"><span class="range-value" id="sensitivityValue">${s.sensitivity}</span></label></div>
        <div class="settings-row"><div><span class="setting-label">Aim assist</span><span class="setting-hint">Small slowdown near target; never auto-fires</span></div><button type="button" class="toggle ${s.aimAssist ? 'on' : ''}" data-toggle="aimAssist" aria-label="Aim assist ${s.aimAssist ? 'on' : 'off'}" aria-pressed="${s.aimAssist}"></button></div>
      </div>
      <div class="settings-group"><h2 class="settings-group-title">Smart actions</h2>
        ${[['autoPickup', 'Auto pickup', 'Recommended ammo and armor'], ['quickLoot', 'Quick loot', 'Tap to equip nearby upgrades'], ['smartReload', 'Smart reload', 'Reload on empty magazine']].map(([key, title, desc]) => `<div class="settings-row"><div><span class="setting-label">${title}</span><span class="setting-hint">${desc}</span></div><button type="button" class="toggle ${s[key] ? 'on' : ''}" data-toggle="${key}" aria-label="${title} ${s[key] ? 'on' : 'off'}" aria-pressed="${s[key]}"></button></div>`).join('')}
      </div>
      <div class="settings-group"><h2 class="settings-group-title">Performance & sound</h2>
        <div class="settings-row"><div><span class="setting-label">Visual target</span><span class="setting-hint">Native build will cap to supported display rate</span></div><div class="segmented" role="group" aria-label="Visual target">${graphics.map(([value, label]) => `<button type="button" class="${s.performance === value ? 'selected' : ''}" data-performance="${value}" aria-pressed="${s.performance === value}">${label}</button>`).join('')}</div></div>
        <div class="settings-row"><div><span class="setting-label">Spatial audio mix</span><span class="setting-hint">Headphone-oriented mix / stereo preview</span></div><button type="button" class="toggle ${s.spatialAudio ? 'on' : ''}" data-toggle="spatialAudio" aria-label="Spatial audio ${s.spatialAudio ? 'on' : 'off'}" aria-pressed="${s.spatialAudio}"></button></div>
      </div>
      <button class="btn btn-block" type="button" data-action="customize-hud">${icon('crosshair')} CUSTOMIZE TOUCH HUD</button>
    </div></section>
    <aside style="display:flex;flex-direction:column;gap:14px"><div class="content-card"><div class="card-pad"><div class="panel-header"><span class="panel-kicker">MOBILE CONTROL MAP</span><span class="panel-code">TOUCH + GYRO</span></div><p class="card-subtitle">Left hand moves. Right thumb aims and fires. Hold <strong style="color:var(--cyan)">E</strong> to interact; use the on-screen action prompt around loot, the Metro, Intel and extraction.</p><div class="settings-row"><span class="setting-label">Move / sprint</span><span class="event-chip">LEFT STICK</span></div><div class="settings-row"><span class="setting-label">Aim / ADS</span><span class="event-chip">RIGHT SIDE</span></div><div class="settings-row"><span class="setting-label">Breach / grenade</span><span class="event-chip">FIRE / G</span></div><div style="margin-top:15px"><button class="btn btn-block" type="button" data-action="customize-hud">EDIT HUD POSITIONS</button></div></div></div>
      <div class="device-note"><strong>Motion access.</strong> iOS asks for motion permission after a user gesture. Gyro may be unavailable on desktop or in a restricted browser; touch / mouse remains fully playable.</div></aside></div>
  </div>`;
}

function renderCustomize() {
  const controlDefs = [
    ['move', 'MOVE', 'large'], ['aim', 'AIM', 'large'], ['fire', 'FIRE', 'round'], ['ads', 'ADS', 'round'], ['crouch', 'CROUCH', 'round'], ['jump', 'JUMP', 'round'], ['grenade', 'FRAG', 'round'], ['reload', 'RELOAD', ''], ['swap', 'SWAP', ''], ['interact', 'INTERACT', ''],
  ];
  return `<div class="page-content">${pageHead('CONTROL SYSTEMS / TOUCH LAYOUT', 'Place your controls.', 'Drag each element into position. Layout is saved on this device and applied to the playable field test.')}
    <div class="hud-editor" id="hudEditor" aria-label="Drag to customize your mobile controls">${controlDefs.map(([id, label, type]) => `<button type="button" class="hud-drag ${type}" data-drag-control="${id}" style="left:${(state.hud[id]?.[0] ?? .5) * 100}%;top:${(state.hud[id]?.[1] ?? .5) * 100}%">${label}</button>`).join('')}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px"><p class="page-copy" style="margin:0">Tip: place movement controls on the left and combat controls on the right. Positions are normalized for different screen sizes.</p><div style="display:flex;gap:8px"><button class="btn" type="button" data-action="reset-hud">RESET</button><button class="btn btn-cyan" type="button" data-action="done-customize">SAVE LAYOUT</button></div></div>
  </div>`;
}

function moreMenuMarkup() { return ''; }

function routeContent() {
  const pages = { play: renderPlay, loadout: renderLoadout, operators: renderOperators, missions: renderMissions, season: renderSeason, clan: renderClan, store: renderStore, settings: renderSettings, customize: renderCustomize };
  return (pages[state.page] || renderPlay)();
}

function renderLobbyShell() {
  document.body.classList.remove('on-match');
  app.innerHTML = `${topbar()}${desktopNav()}<main class="workspace">${routeContent()}</main>${mobileNav()}`;
  if (state.page === 'customize') bindHudEditor();
}

function matchView() {
  return `<main class="match-app"><section class="match-stage" id="matchStage" aria-label="LAST ZONE playable field test">
    <canvas id="gameCanvas" class="game-canvas" aria-label="Top-down tactical shooter arena. Use WASD and mouse, or the on-screen mobile controls."></canvas>
    <div class="match-top">
      <div class="match-objective"><div class="match-kicker">CONTRACT / INTEL RECOVERY</div><h2 id="objectiveTitle">INTEL RECOVERY</h2><p id="objectiveDesc">Find the lower transit archive beneath Nova City.</p><div class="objective-progress"><span id="objectiveProgress"></span></div></div>
      <div class="match-center"><div class="match-mode-label" id="matchMode">COLLAPSE / KHARON ISLAND</div><strong class="match-timer" id="matchTimer">08:00</strong><div class="match-phase"><i class="live-dot"></i><span id="matchPhase">BREAKLINE STABLE</span></div></div>
      <div class="match-right"><div class="alive-chip"><strong id="aliveCount">20</strong><span>FIELD / ALIVE</span></div><button class="match-exit" type="button" data-action="pause" aria-label="Pause match">${icon('exit')}</button></div>
    </div>
    <div class="match-hints"><div class="hint-chip"><strong id="layerName">SURFACE</strong><span>/ KHARON 04</span></div><div class="hint-chip"><span>CONTRACT</span><strong id="contractState">ACTIVE</strong></div></div>
    <div class="minimap-wrap"><div class="minimap-head"><span>TACTICAL MAP</span><span id="mapHeading">N ↑</span></div><canvas id="miniMap" width="264" height="184" aria-label="Tactical minimap"></canvas></div>
    <div class="field-message" id="fieldMessage" role="status"></div>
    <div class="touch-controls" id="touchControls">
      <div class="touch-control stick-base" data-control="move" aria-label="Movement stick"><span class="stick-knob"></span></div>
      <div class="touch-control stick-base" data-control="aim" aria-label="Aim stick"><span class="stick-knob"></span></div>
      <button class="touch-control control-button fire" type="button" data-control="fire" aria-label="Fire weapon">FIRE</button>
      <button class="touch-control control-button" type="button" data-control="ads" aria-label="Aim down sights">${icon('crosshair')}</button>
      <button class="touch-control control-button" type="button" data-control="crouch" aria-label="Crouch">C</button>
      <button class="touch-control control-button" type="button" data-control="jump" aria-label="Jump / vault">↑</button>
      <button class="touch-control control-button grenade" type="button" data-control="grenade" aria-label="Throw grenade">${icon('grenade')}</button>
      <button class="touch-control control-button utility" type="button" data-control="reload" aria-label="Reload weapon">R</button>
      <button class="touch-control control-button utility" type="button" data-control="swap" aria-label="Switch weapon">SWAP</button>
      <button class="touch-control control-button interact" type="button" data-control="interact" id="interactButton">INTERACT</button>
    </div>
    <div class="desktop-controls-note"><kbd>WASD</kbd> MOVE · <kbd>SHIFT</kbd> SPRINT · <kbd>Q</kbd> SWAP · <kbd>R</kbd> RELOAD · <kbd>E</kbd> INTERACT · <kbd>G</kbd> FRAG</div>
    <div class="match-bottom">
      <div class="player-status"><div class="status-heading"><span>${esc(state.profile.callsign)}</span><span class="tier-tag" id="armorTier">TIER II</span></div><div class="status-bars"><div class="status-track"><span id="healthBar" class="health-fill"></span></div><div class="status-track"><span id="armorBar" class="armor-fill"></span></div></div><div class="status-readout"><span>VITALS <b id="healthValue">100</b></span><span>PLATE <b id="armorValue">82</b></span></div></div>
      <div class="weapon-status"><div class="weapon-slot-num">01</div><div><span class="weapon-status-name" id="weaponName">KESTREL-7</span><span class="weapon-status-type" id="weaponCategory">ASSAULT RIFLE</span></div><div class="ammo-count"><span id="ammoCount">30</span> <small>/ <span id="reserveCount">150</span></small></div></div>
      <div class="match-event"><div class="match-event-name" id="eventName">DYNAMIC EVENT</div><div class="match-event-copy" id="eventCopy">Signal window in 00:27</div></div>
    </div>
    <div class="match-overlay" id="deploymentOverlay"><div class="match-dialog"><div class="match-dialog-eyebrow">DROP AUTHORIZED / LOCAL FIELD TEST</div><div class="deployment-count" id="deployCount">3</div><p>Nova City is live. Recover the intel, break the route and choose your exit.</p><div class="event-chip">${icon('map')} KHARON ISLAND / SECTOR 04</div></div></div>
  </section></main>`;
}

function renderResult() {
  const outcome = state.lastResult || { result: 'eliminated', kills: 0, score: 0, damage: 0, intel: false, time: 0 };
  const title = outcome.result === 'extraction' ? 'MISSION<br />COMPLETE' : outcome.result === 'survival' ? 'LAST SQUAD<br />STANDING' : 'DEPLOYMENT<br />OVER';
  const descriptor = outcome.result === 'extraction' ? 'Extraction confirmed. Your team made it out with the intel. Survival placement is tracked separately.' : outcome.result === 'survival' ? 'No hostile operators remain. You own the field.' : 'Operator lost. Debrief, adjust your kit and drop again.';
  return `<main class="match-app"><section class="match-stage result-stage"><div class="hero-art"></div><div class="match-overlay"><div class="match-dialog"><div class="match-dialog-eyebrow">KHARON ISLAND / AFTER ACTION REPORT</div><h1>${title}</h1><p>${descriptor}</p><div class="result-stats"><div class="result-stat"><strong>${outcome.kills || 0}</strong><span>Eliminations</span></div><div class="result-stat"><strong>${Math.round(outcome.time || 0)}s</strong><span>Field time</span></div><div class="result-stat"><strong>${outcome.score || 0}</strong><span>Operation score</span></div></div><div class="event-chip" style="margin-bottom:19px">${outcome.intel ? 'INTEL RECOVERED' : 'CONTRACT INCOMPLETE'} · ${outcome.damage || 0} DAMAGE</div><button type="button" class="btn btn-primary btn-block" data-action="return-lobby">RETURN TO COMMAND</button><button type="button" class="link-button" style="margin-top:15px" data-action="redeploy">DEPLOY AGAIN ${icon('arrow')}</button></div></div></section></main>`;
}

function renderApp() {
  clearTimeout(deployTimer); clearInterval(countdownTimer);
  modalRoot.innerHTML = '';
  if (state.screen === 'match') {
    document.body.classList.add('on-match');
    app.innerHTML = matchView();
    applyHudPositions();
    return;
  }
  if (state.screen === 'result') {
    document.body.classList.add('on-match');
    app.innerHTML = renderResult();
    return;
  }
  document.body.classList.remove('on-match');
  renderLobbyShell();
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function updateFieldMessage(message) {
  const el = document.getElementById('fieldMessage');
  if (!el) { showToast(message); return; }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function updateHud(hud) {
  const put = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const setWidth = (id, value, max = 100) => { const el = document.getElementById(id); if (el) el.style.width = `${Math.max(0, Math.min(100, value / max * 100))}%`; };
  put('matchTimer', hud.time);
  put('aliveCount', String(hud.alive).padStart(2, '0'));
  put('healthValue', String(Math.max(0, Math.ceil(hud.health))));
  put('armorValue', String(Math.max(0, Math.ceil(hud.armor))));
  put('ammoCount', hud.reloading ? '··' : String(hud.ammo).padStart(2, '0'));
  put('reserveCount', String(hud.reserve).padStart(3, '0'));
  put('weaponName', hud.weapon.toUpperCase());
  put('weaponCategory', hud.category.toUpperCase());
  put('objectiveTitle', hud.objectiveTitle.toUpperCase());
  put('objectiveDesc', hud.objectiveDesc);
  put('eventName', hud.eventActive ? hud.eventName : 'DYNAMIC EVENT');
  put('eventCopy', hud.eventCopy);
  put('matchMode', `${hud.mode} / LOCAL SIM`);
  put('matchPhase', hud.eventActive ? `${hud.eventName} ACTIVE` : hud.zone ? 'BREAKLINE STABLE' : 'OUTSIDE BREAKLINE');
  put('layerName', hud.underground ? 'UNDERGROUND' : 'SURFACE');
  put('contractState', hud.objectiveComplete ? 'INTEL SECURED' : 'ACTIVE');
  setWidth('healthBar', hud.health);
  setWidth('armorBar', hud.armor);
  const progress = document.getElementById('objectiveProgress');
  if (progress) progress.style.width = `${Math.round(hud.progress * 100)}%`;
  const interact = document.getElementById('interactButton');
  if (interact) {
    interact.classList.toggle('visible', hud.contextVisible);
    interact.textContent = hud.context?.replace(/^HOLD\s*[·-]\s*|^ENTER\s*[·-]\s*|^COLLECT\s*[·-]\s*/i, '') || 'INTERACT';
    interact.dataset.enabled = String(hud.contextVisible);
  }
  const stage = document.getElementById('matchStage');
  if (stage) stage.classList.toggle('event-blackout', hud.eventActive && hud.eventName === 'BLACKOUT');
  const grenade = document.querySelector('[data-control="grenade"]');
  if (grenade) grenade.classList.toggle('active', hud.grenades <= 0);
}

function applyHudPositions() {
  for (const el of document.querySelectorAll('#touchControls [data-control]')) {
    const pos = state.hud[el.dataset.control];
    if (!pos) continue;
    el.style.left = `${pos[0] * 100}%`;
    el.style.top = `${pos[1] * 100}%`;
  }
}

function bindGameControls() {
  const stage = document.getElementById('matchStage');
  if (!stage || !game) return;
  const controls = stage.querySelectorAll('[data-control]');
  for (const control of controls) {
    const name = control.dataset.control;
    const pointerDown = (event) => {
      event.preventDefault(); event.stopPropagation();
      control.setPointerCapture?.(event.pointerId);
      if (name === 'move' || name === 'aim') {
        if (name === 'move') game.wakeAudio();
        control.dataset.pointer = String(event.pointerId);
        updateStick(control, event);
        return;
      }
      if (name === 'fire') game.setInput('fire', true);
      if (name === 'ads') { game.setInput('ads', true); control.classList.add('active'); }
      if (name === 'crouch') { game.toggleCrouch(); control.classList.toggle('active', game.isCrouched); }
      if (name === 'jump') game.setInput('jump', true);
      if (name === 'grenade') game.throwGrenade();
      if (name === 'reload') game.reload();
      if (name === 'swap') game.cycleWeapon();
      if (name === 'interact') game.setInput('interact', true);
    };
    const pointerMove = (event) => {
      if (control.dataset.pointer !== String(event.pointerId)) return;
      updateStick(control, event);
    };
    const pointerUp = (event) => {
      if (name === 'move' || name === 'aim') {
        if (control.dataset.pointer !== String(event.pointerId)) return;
        delete control.dataset.pointer;
        const knob = control.querySelector('.stick-knob'); if (knob) knob.style.transform = 'translate(-50%, -50%)';
        if (name === 'move') { game.setMoveVector(0, 0); game.setInput('sprint', false); }
        else game.setAimVector(Math.cos(game.player.angle), Math.sin(game.player.angle));
        return;
      }
      if (name === 'fire') game.setInput('fire', false);
      if (name === 'ads') { game.setInput('ads', false); control.classList.remove('active'); }
      if (name === 'interact') game.setInput('interact', false);
    };
    control.addEventListener('pointerdown', pointerDown);
    control.addEventListener('pointermove', pointerMove);
    control.addEventListener('pointerup', pointerUp);
    control.addEventListener('pointercancel', pointerUp);
    if (name === 'interact') control.addEventListener('click', (event) => { event.preventDefault(); });
  }

  function updateStick(control, event) {
    const rect = control.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const max = rect.width * .34;
    const dx = event.clientX - cx, dy = event.clientY - cy;
    const length = Math.hypot(dx, dy), amount = Math.min(max, length);
    const nx = length ? dx / length * amount : 0, ny = length ? dy / length * amount : 0;
    const knob = control.querySelector('.stick-knob');
    if (knob) knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    if (control.dataset.control === 'move') {
      game.setMoveVector(nx / max, ny / max);
      game.setInput('sprint', length / max > .82);
    } else if (length > 5) game.setAimVector(dx, dy);
  }
}

function startMatch() {
  state.screen = 'match';
  state.moreOpen = false;
  save();
  if (game) { game.stop(); game = null; }
  renderApp();
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const possibleEvents = ['BLACKOUT', 'SANDSTORM', 'FLOOD ALERT'];
  const eventName = possibleEvents[Math.floor(Math.random() * possibleEvents.length)];
  game = new CanvasArena(canvas, {
    mode: state.mode,
    teamSize: state.teamSize,
    weapon: state.weapon,
    eventName,
    aimAssist: state.settings.aimAssist,
    sensitivity: state.settings.sensitivity,
    spatialAudio: state.settings.spatialAudio,
    gyroMode: state.settings.gyro,
    autoPickup: state.settings.autoPickup,
    quickLoot: state.settings.quickLoot,
    smartReload: state.settings.smartReload,
    onHud: updateHud,
    onMessage: updateFieldMessage,
    onPause: pauseModal,
    onEvent: (event) => updateFieldMessage(`${event} ACTIVE — SECTOR 04`),
    onContractComplete: (xp) => {
      state.profile.xp += xp;
      state.profile.credits += 250;
      state.profile.weaponMastery = Math.min(100, state.profile.weaponMastery + 2);
      save();
      updateFieldMessage('CONTRACT REWARD / +250 CREDITS');
    },
    onEnd: finishMatch,
  });
  bindGameControls();
  let count = 3;
  const countEl = document.getElementById('deployCount');
  countdownTimer = window.setInterval(() => {
    count--;
    if (countEl) countEl.textContent = count > 0 ? String(count) : 'GO';
    if (count <= 0) {
      clearInterval(countdownTimer);
      const overlay = document.getElementById('deploymentOverlay');
      overlay?.remove();
      game?.start();
      showToast('FIELD TEST / LOCAL SIMULATION · MOVE OUT');
    }
  }, 720);
  deployTimer = window.setTimeout(() => {
    clearInterval(countdownTimer);
    const overlay = document.getElementById('deploymentOverlay');
    overlay?.remove();
    game?.start();
  }, 2350);
}

function finishMatch(result) {
  if (!result) return;
  if (game) { game.stop(); game = null; }
  state.profile.matches++;
  state.profile.xp += 100 + (result.kills || 0) * 55;
  state.profile.credits += (result.result === 'extraction' ? 180 : 55) + (result.kills || 0) * 12;
  if (result.result === 'survival') state.profile.wins++;
  if (result.result === 'extraction') state.profile.extractions++;
  state.profile.bestKills = Math.max(state.profile.bestKills, result.kills || 0);
  state.profile.level = 1 + Math.floor(state.profile.xp / 1000);
  state.lastResult = result;
  state.screen = 'result';
  save();
  renderApp();
}

function pauseModal() {
  game?.pause();
  modalRoot.innerHTML = `<div class="match-overlay" role="dialog" aria-modal="true" aria-labelledby="pauseTitle"><div class="match-dialog"><div class="match-dialog-eyebrow">FIELD CONTROL</div><h1 id="pauseTitle" style="font-size:46px">Pause<br /><span>deployment</span></h1><p>Your local field test can be resumed, or you can return to Command.</p><button class="btn btn-primary btn-block" type="button" data-action="resume">RESUME MISSION</button><button class="btn btn-block" style="margin-top:8px" type="button" data-action="return-lobby">ABORT TO COMMAND</button></div></div>`;
}

function applyRoute(route) {
  if (!route) return;
  if (route === 'more') { state.moreOpen = !state.moreOpen; renderApp(); return; }
  state.moreOpen = false;
  if (game && state.screen === 'match' && route === 'play') { pauseModal(); return; }
  state.screen = 'lobby'; state.page = route; save(); renderApp();
}

async function selectGyro(mode) {
  if (mode !== 'off' && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') { showToast('Motion permission was not granted. Touch aim is still available.'); return; }
    } catch { showToast('Motion access is unavailable in this browser.'); return; }
  }
  state.settings.gyro = mode;
  save(); renderApp();
  showToast(mode === 'off' ? 'GYROSCOPE AIM / OFF' : `GYROSCOPE AIM / ${mode === 'ads' ? 'ADS ONLY' : 'ALWAYS ON'}`);
}

function handleClick(event) {
  const target = event.target.closest('button, [data-route]');
  if (!target) return;
  if (target.dataset.route) { applyRoute(target.dataset.route); return; }
  if (target.dataset.mode) {
    state.mode = target.dataset.mode; save(); renderApp(); return;
  }
  if (target.dataset.team) {
    state.teamSize = Number(target.dataset.team); save(); renderApp(); return;
  }
  if (target.dataset.weapon) {
    state.weapon = target.dataset.weapon; save(); renderApp(); showToast(`${WEAPONS[state.weapon].name.toUpperCase()} EQUIPPED`); return;
  }
  if (target.dataset.operator) {
    state.operator = target.dataset.operator; save(); renderApp(); showToast(`${target.dataset.operator.toUpperCase()} KIT ASSIGNED`); return;
  }
  if (target.dataset.contract) {
    if (target.dataset.contract !== 'intel') { showToast('This contract joins the next operation update.'); return; }
    state.contract = target.dataset.contract; save(); renderApp(); return;
  }
  if (target.dataset.gyro) { selectGyro(target.dataset.gyro); return; }
  if (target.dataset.performance) { state.settings.performance = target.dataset.performance; save(); renderApp(); showToast(`VISUAL TARGET / ${target.dataset.performance.toUpperCase()}`); return; }
  if (target.dataset.toggle) {
    const key = target.dataset.toggle; state.settings[key] = !state.settings[key]; save(); renderApp(); return;
  }
  if (target.dataset.quickMessage) { showToast(target.dataset.quickMessage); return; }
  if (target.dataset.buy) {
    const price = Number(target.dataset.price);
    if (state.profile.credits < price) { showToast('NOT ENOUGH COSMETIC CREDITS'); return; }
    state.profile.credits -= price; state.cosmetics.push(target.dataset.buy); save(); renderApp(); showToast(`${target.dataset.name.toUpperCase()} UNLOCKED · COSMETIC ONLY`); return;
  }
  if (target.dataset.action) {
    switch (target.dataset.action) {
      case 'deploy': case 'redeploy': startMatch(); break;
      case 'return-lobby':
        if (game) { game.stop(); game = null; }
        modalRoot.innerHTML = ''; state.screen = 'lobby'; state.page = 'play'; state.lastResult = null; save(); renderApp(); break;
      case 'pause': pauseModal(); break;
      case 'resume': modalRoot.innerHTML = ''; game?.resume(); break;
      case 'more': state.moreOpen = !state.moreOpen; renderApp(); break;
      case 'customize-hud': state.page = 'customize'; state.customizeFrom = 'settings'; save(); renderApp(); break;
      case 'done-customize': state.page = 'settings'; save(); renderApp(); showToast('TOUCH HUD LAYOUT SAVED'); break;
      case 'reset-hud': state.hud = structuredClone(DEFAULTS.hud); save(); renderApp(); showToast('TOUCH HUD RESET'); break;
    }
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.matches('[data-setting-range="sensitivity"]')) {
    state.settings.sensitivity = Number(target.value);
    const value = document.getElementById('sensitivityValue'); if (value) value.textContent = target.value;
    save();
  }
}

function bindHudEditor() {
  const editor = document.getElementById('hudEditor');
  if (!editor) return;
  for (const control of editor.querySelectorAll('[data-drag-control]')) {
    control.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      control.setPointerCapture(event.pointerId);
      controlDrag = { element: control, pointerId: event.pointerId };
      control.classList.add('dragging');
      moveEditorControl(event);
    });
    control.addEventListener('pointermove', (event) => {
      if (controlDrag?.element === control && controlDrag.pointerId === event.pointerId) moveEditorControl(event);
    });
    const end = (event) => {
      if (controlDrag?.element !== control || controlDrag.pointerId !== event.pointerId) return;
      const rect = editor.getBoundingClientRect();
      const x = Math.max(.04, Math.min(.96, (event.clientX - rect.left) / rect.width));
      const y = Math.max(.08, Math.min(.92, (event.clientY - rect.top) / rect.height));
      state.hud[control.dataset.dragControl] = [x, y];
      controlDrag = null; control.classList.remove('dragging'); save();
    };
    control.addEventListener('pointerup', end); control.addEventListener('pointercancel', end);
  }
  function moveEditorControl(event) {
    const rect = editor.getBoundingClientRect();
    const x = Math.max(.04, Math.min(.96, (event.clientX - rect.left) / rect.width));
    const y = Math.max(.08, Math.min(.92, (event.clientY - rect.top) / rect.height));
    controlDrag.element.style.left = `${x * 100}%`; controlDrag.element.style.top = `${y * 100}%`;
  }
}

app.addEventListener('click', handleClick);
app.addEventListener('input', handleInput);
modalRoot.addEventListener('click', handleClick);
renderApp();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
