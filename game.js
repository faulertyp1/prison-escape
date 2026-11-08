// =====================================================
// PRISON ESCAPE – game.js  (Version 2: Detail-Design)
// Aufbau:  1 Grundwerte      2 Level          3 Speichern     4 Audio
//          5 Zeichen-Helfer  6 Figuren        7 Welt          8 Partikel
//          9 Spiel starten  10 Update        11 Zeichnen     12 Menüs
//         13 Hauptschleife
// =====================================================

// ---------- 1. Grundwerte ----------
const TILE = 32, VIEW_COLS = 30, ROWS = 17; // Das sichtbare Fenster ist 30 x 17 Felder groß
const W = VIEW_COLS * TILE, H = ROWS * TILE;
let worldCols = VIEW_COLS, worldWidth = W, cameraX = 0;
const RES = 2;                            // Das Bild ist 2x so fein aufgelöst (1920 x 1088 echte Pixel)
const SPR = 0.5;                          // Eine Figur wird auf einem 100x100-Feld entworfen.
                                          // 100 Zeichenpunkte * 0.5 = 50 Spielpixel = 100 echte Pixel
const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');        // "let", weil wir kurz auf eine Hintergrund-Leinwand umschalten
canvas.width = W * RES; canvas.height = H * RES;
const $ = id => document.getElementById(id);

const GRAVITY = 0.55, MAX_FALL = 12, JUMP = -11, SPEED = 3.2;
const PICK_TIME = 100;                    // Frames, die man zum Schlossknacken E hält
const torchColumns = () => Array.from({ length: Math.ceil(worldCols / 14) }, (_, i) => 6 + i * 14);

let state = 'menu';                       // menu | intro | options | play | pause | win
const keys = { left: false, right: false, jump: false, interact: false };
let lvl = 0, grid = [], guards = [], hasKey = false, spawn = { x: 0, y: 0 };
let p = null, pickT = 0, flash = 0, time = 0, toastTimer = 0, shake = 0;

// ---------- 2. Level ----------
// Zeichen: P Start, K Schlüssel, D Tür, G Gitter, L Hebel, C Checkpoint,
//          S Stacheln, W Wache, E Ausgang, # Wand
// Jeder Eintrag: [Zeichen, Spalte, Zeile, Breite, Höhe]
function makeLevel(name, hint, items, cols = VIEW_COLS) {
  const g = Array.from({ length: ROWS }, () => Array(cols).fill('.'));
  let start = { x: 0, y: 0 };
  for (const [ch, c, r, w = 1, h = 1] of items) {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) g[y][x] = ch;
    if (ch === 'P') { start = { x: c * TILE + 6, y: r * TILE + 4 }; g[r][c] = '.'; }
  }
  for (let x = 0; x < cols; x++) { g[0][x] = '#'; g[ROWS - 1][x] = '#'; }
  for (let y = 0; y < ROWS; y++) { g[y][0] = '#'; g[y][cols - 1] = '#'; }
  return { name, hint, grid: g, start, cols };
}

const LEVEL_TEMPLATES = [
  { name: 'Die Zelle', cols: 38, spikes: 2, guards: 0, checkpoints: 0, keyDoor: true },
  { name: 'Der Hebel', cols: 42, spikes: 2, guards: 1, checkpoints: 1, leverGate: true },
  { name: 'Die Wachen', cols: 46, spikes: 3, guards: 2, checkpoints: 1, keyDoor: true },
  { name: 'Zwei Wege', cols: 48, spikes: 3, guards: 1, checkpoints: 2, keyDoor: true, leverGate: true },
  { name: 'Der lange Korridor', cols: 52, spikes: 3, guards: 2, checkpoints: 2, keyDoor: true },
  { name: 'Die untere Zisterne', cols: 56, spikes: 4, guards: 2, checkpoints: 2, leverGate: true },
  { name: 'Der Wachtturm', cols: 60, spikes: 4, guards: 3, checkpoints: 2, keyDoor: true },
  { name: 'Der Ausbruch', cols: 66, spikes: 4, guards: 4, checkpoints: 2, keyDoor: true, leverGate: true }
];

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLevels(seed) {
  const random = createRng(seed);
  return LEVEL_TEMPLATES.map(template => {
    const items = [['P', 1, 15], ['E', template.cols - 2, 15]];
    const reserved = [1, template.cols - 2];
    const between = (min, max) => min + Math.floor(random() * (max - min + 1));
    const chooseClearColumn = (min, max, gap = 3) => {
      const available = [];
      for (let col = min; col <= max; col++) {
        if (reserved.every(other => Math.abs(col - other) >= gap)) available.push(col);
      }
      if (!available.length) return null;
      const col = available[between(0, available.length - 1)];
      reserved.push(col);
      return col;
    };
    const requireClearColumn = (min, max) => {
      const col = chooseClearColumn(min, max);
      if (col === null) throw new Error('Kein freier Platz zum Erzeugen des Levels "' + template.name + '".');
      return col;
    };

    if (template.keyDoor) {
      const keyCol = requireClearColumn(4, Math.floor(template.cols * 0.3));
      const doorCol = requireClearColumn(Math.ceil(template.cols * 0.57), template.cols - 7);
      items.push(['K', keyCol, 14], ['D', doorCol, 12, 1, 4]);
    }
    if (template.leverGate) {
      const leverCol = requireClearColumn(4, Math.floor(template.cols * 0.3));
      const gateCol = requireClearColumn(Math.ceil(template.cols * 0.56), template.cols - 7);
      items.push(['L', leverCol, 15], ['G', gateCol, 12, 1, 4]);
    }
    for (let i = 0; i < template.checkpoints; i++) {
      const target = Math.round(template.cols * (i + 1) / (template.checkpoints + 1));
      const cpCol = chooseClearColumn(target - 2, target + 2, 2) ||
        chooseClearColumn(4, template.cols - 5, 2);
      if (cpCol === null) throw new Error('Kein Platz fuer einen Checkpoint in "' + template.name + '".');
      items.push(['C', cpCol, 15]);
    }

    const protectedColumns = reserved.slice();
    const placeRandomHazards = (type, count) => {
      for (let i = 0; i < count; i++) {
        const candidates = [];
        const clearance = type === 'S' ? 3 : 2;
        for (let col = 5; col < template.cols - 5; col++) {
          if (reserved.every(other => Math.abs(col - other) >= clearance) &&
              (type !== 'W' || protectedColumns.every(other => Math.abs(col - other) >= 3))) candidates.push(col);
        }
        if (!candidates.length) break;
        const col = candidates[between(0, candidates.length - 1)];
        reserved.push(col);
        if (type === 'S') items.push(['S', col, 15, between(1, 2), 1]);
        else items.push(['W', col, 15]);
      }
    };
    placeRandomHazards('S', template.spikes);
    placeRandomHazards('W', template.guards);
    const guardColumns = items.filter(item => item[0] === 'W').map(item => item[1]);
    for (const spike of items.filter(item => item[0] === 'S')) {
      if (guardColumns.some(col => Math.abs(col - spike[1]) === 2)) spike[3] = 1;
    }

    const hint = template.keyDoor && template.leverGate
      ? 'Finde den Schlüssel und betätige den Hebel. Kleine Stachelgruppen lassen sich überspringen.'
      : template.keyDoor ? 'Finde den Schlüssel für die Tür. Kleine Stachelgruppen lassen sich überspringen.'
      : template.leverGate ? 'Betätige den Hebel für das Gitter und springe über die kleinen Stachelgruppen.'
      : 'Achte auf Wachen und springe über die kleinen Stachelgruppen.';
    return makeLevel(template.name, hint, items, template.cols);
  });
}

// ---------- 3. Speichern (LocalStorage) ----------
function loadJSON(key, fallback) {
  try { return Object.assign({}, fallback, JSON.parse(localStorage.getItem(key))); }
  catch (e) { return fallback; }
}
const SAVE_KEY = 'prisonEscapeSaveTest8', SET_KEY = 'prisonEscapeSettingsTest8';
let save = loadJSON(SAVE_KEY, { started: false, level: 0, unlocked: 0, cp: null, seed: Math.floor(Math.random() * 0x100000000), introSeen: true });
let settings = loadJSON(SET_KEY, { volume: 70, music: true, sfx: true, size: 'auto' });
const writeSave = () => localStorage.setItem(SAVE_KEY, JSON.stringify(save));
const writeSettings = () => localStorage.setItem(SET_KEY, JSON.stringify(settings));
if (!Number.isInteger(save.seed)) {
  save.seed = Math.floor(Math.random() * 0x100000000);
  writeSave();
}
let LEVELS = buildLevels(save.seed);

// ---------- 4. Audio (Web Audio, keine Dateien nötig) ----------
let ac = null, master = null;
function audio() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.connect(ac.destination);
  }
  master.gain.value = settings.volume / 100;
  return ac;
}
function tone(f, d, type, vol, slide = 0) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.linearRampToValueAtTime(f + slide, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d);
}
const sfx = (f, d = 0.1, slide = 0) => { if (settings.sfx) tone(f, d, 'square', 0.12, slide); };
const NOTES = [110, 0, 131, 0, 98, 0, 117, 0];   // einfache, düstere Melodie
let noteIdx = 0;
setInterval(() => {
  if (settings.music && ac) {
    const f = NOTES[noteIdx++ % NOTES.length];
    if (f) tone(f, 0.5, 'triangle', 0.18);
  }
}, 420);

// ---------- 5. Zeichen-Helfer ----------
const OUT = '#10151c';                    // Umrissfarbe aller Figuren

// Zufallszahl, die für dieselben Eingaben IMMER dasselbe liefert (0 bis 1).
// So sieht jede Wandkachel anders aus, aber bei jedem Start gleich.
function hash(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function rect(c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function grad(x0, y0, x1, y1, stops) {           // Farbverlauf als Linie
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c)); return g;
}
function rgrad(x0, y0, r0, x1, y1, r1, stops) {  // Farbverlauf als Kreis
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c)); return g;
}
function glow(x, y, r, color) {                  // weiches Licht (wird auf das Bild "addiert")
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function poly(pts) {                             // Vieleck als Pfad vorbereiten
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function paint(fill, lw = 2) {                   // aktuellen Pfad füllen + dunkel umranden
  ctx.fillStyle = fill; ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function ball(x, y, rx, ry, fill, lw = 2) {      // Kreis / Ellipse
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); paint(fill, lw);
}
function star(x, y, r, fill) {                   // 5-zackiger Stern
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  poly(pts); paint(fill, 1);
}

// Zwei-Knochen-Gelenk ("IK"): berechnet, wo Knie/Ellbogen sitzen, wenn die Hüfte (hx,hy)
// und der Fuß/die Hand (fx,fy) feststehen. l1/l2 = Länge der beiden Glieder.
// bend = +1 / -1 bestimmt, auf welche Seite das Gelenk knickt.
function ik(hx, hy, fx, fy, l1, l2, bend) {
  let dx = fx - hx, dy = fy - hy, d = Math.max(Math.hypot(dx, dy), 0.001);
  const max = l1 + l2 - 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; fx = hx + dx; fy = hy + dy; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const mx = hx + dx * a / d, my = hy + dy * a / d;
  return { kx: mx - dy / d * h * bend, ky: my + dx / d * h * bend, fx, fy };
}
// Zeichnet ein Glied (Bein/Arm) mit Umriss; oberer Teil und unterer Teil dürfen andere Farben haben
function limb(hx, hy, k, w, upper, lower) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(k.kx, k.ky); ctx.lineTo(k.fx, k.fy);
  ctx.strokeStyle = OUT; ctx.lineWidth = w + 3; ctx.stroke();
  ctx.strokeStyle = lower; ctx.lineWidth = w; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(k.kx, k.ky);
  ctx.lineCap = 'butt'; ctx.strokeStyle = upper; ctx.lineWidth = w + 0.6; ctx.stroke();
  ctx.lineCap = 'round';
}

// ---------- 6. Figuren ----------
// drawGoblin(x, feetY, s, o): x = Mitte, feetY = Boden unter den Füßen, s = Maßstab (SPR),
// o = Pose: face (1/-1), phase (Laufzyklus), run (0..1), air (-1 steigt, 0 Boden, 1 fällt),
//           act (0..1 greift zu), land (0..1 Landestauchung), t (Zeit)
function drawGoblinDetailed(x, feetY, s, o) {
  const t = o.t, run = o.run;
  const bob = o.air ? 0 : (run > 0.1 ? -Math.abs(Math.sin(o.phase)) * 3 * run : Math.sin(t / 20) * 1.2);
  const hipY = 70 + bob, shY = 57 + bob;
  ctx.save();
  ctx.translate(x, feetY);
  ctx.scale(s * o.face, s);                       // o.face = -1 spiegelt die Figur
  let sx = 1, sy = 1;                             // "Squash & Stretch": Gummi-Effekt
  if (o.air) { sx = 0.93; sy = 1.08; }
  if (o.land > 0) { sx = 1 + 0.2 * o.land; sy = 1 - 0.18 * o.land; }
  ctx.scale(sx, sy);
  ctx.rotate(run * 0.1);                          // beim Rennen leicht nach vorn lehnen
  ctx.translate(-50, -94);                        // ab hier: Zeichenfeld 0..100, Füße bei y = 94

  const arm = front => {
    const ox = front ? 58 : 43, ph = o.phase + (front ? Math.PI : 0);
    let hx, hy;
    if (front && o.act > 0) { const r = Math.sin(o.act * Math.PI); hx = ox + 6 + 18 * r; hy = shY + 14 - 16 * r; }
    else if (o.air < 0) { hx = ox + (front ? 9 : -3); hy = shY - 12; }
    else if (o.air > 0) { hx = ox + (front ? 13 : -13); hy = shY + 2; }
    else {
      hx = ox + (front ? 3 : -2) + Math.sin(ph) * 11 * run;
      hy = shY + 17 - Math.max(0, Math.cos(ph)) * 5 * run + Math.sin(t / 18) * 0.6;
    }
    const k = ik(ox, shY, hx, hy, 9, 10, 1);
    limb(ox, shY, k, 5.5, '#e98a2e', '#78cf66');  // Ärmel orange, Unterarm grün
    ball(k.fx, k.fy, 3.8, 3.8, '#78cf66', 1.6);   // Hand
  };

  const leg = front => {
    const hx = front ? 54 : 46, ph = o.phase + (front ? 0 : Math.PI);
    let fx, fy;
    if (o.air < 0) { fx = hx + (front ? 9 : -5); fy = front ? 80 : 86; }
    else if (o.air > 0) { fx = hx + (front ? 10 : -9); fy = 88; }
    else { fx = (front ? 56 : 44) + Math.sin(ph) * 15 * run; fy = 90 - Math.max(0, Math.cos(ph)) * 9 * run; }
    const k = ik(hx, hipY, fx, fy, 10, 10, -1);
    limb(hx, hipY, k, 7, '#d9741f', '#58a84b');   // Hose orange, Unterschenkel grün
    ball(k.fx + 3, k.fy + 1.5, 7, 3.6, '#6b4a2f', 1.8);          // Sandale
    ball(k.fx + 4, k.fy + 0.5, 4, 1.2, 'rgba(255,255,255,0.18)', 0);
    if (!front) {                                 // Fußfessel mit kleiner Kette
      const cx = k.fx + (k.kx - k.fx) * 0.3, cy = k.fy + (k.ky - k.fy) * 0.3;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(k.fy - k.ky, k.fx - k.kx));
      ctx.beginPath(); ctx.roundRect(-2.2, -5.5, 4.4, 11, 1.5);
      paint(grad(-2, 0, 2, 0, [[0, '#d8deea'], [1, '#6c7488']]), 1.4); ctx.restore();
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.ellipse(cx - 3.5 * i - run * i, Math.min(cy + 3 + i * 2.5, 92), 2.4, 1.5, 0, 0, 7);
        ctx.strokeStyle = '#aab2c4'; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
  };

  arm(false); leg(false);

  // Hals + Oberkörper (atmet im Stand)
  const br = o.air || run > 0.1 ? 0 : Math.sin(t / 18) * 0.8;
  rect('#58a84b', 46, 47 + bob, 10, 8);
  ctx.beginPath(); ctx.moveTo(37, 54 + bob);
  ctx.quadraticCurveTo(50, 49 + bob - br, 63, 54 + bob);
  ctx.lineTo(66, 72 + bob); ctx.quadraticCurveTo(50, 77 + bob, 35, 72 + bob); ctx.closePath();
  paint(grad(35, 0, 66, 0, [[0, '#f7a447'], [0.55, '#e6812a'], [1, '#bb5f16']]), 2);
  ctx.save(); ctx.clip();                         // Streifen nur innerhalb des Körpers
  for (const sy2 of [60, 66, 72]) rect('rgba(40,22,10,0.55)', 30, sy2 + bob, 40, 2.6);
  rect('rgba(255,255,255,0.18)', 37, 52 + bob, 4, 24);
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.fillRect(52, 58 + bob, 8, 7);                  // Nummernschild
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2; ctx.lineJoin = 'miter';
  ctx.beginPath(); ctx.moveTo(53.5, 60 + bob); ctx.lineTo(58, 60 + bob); ctx.lineTo(55.5, 64 + bob); ctx.stroke();

  // Kopf
  const headTilt = run * 0.05 + (o.air < 0 ? -0.08 : o.air > 0 ? 0.1 : 0);
  const hy0 = 35 + bob;
  ctx.save();
  ctx.translate(50, hy0 + 14); ctx.rotate(headTilt); ctx.translate(-50, -(hy0 + 14));
  const flick = Math.sin(t / 23) * 2 + (run > 0.1 ? Math.sin(o.phase * 2) * 2.5 * run : 0) + (o.air > 0 ? -6 : o.air < 0 ? 4 : 0);
  poly([[38, hy0 - 6], [6, hy0 - 18 + flick], [13, hy0 - 4 + flick * 0.6], [37, hy0 + 8]]); paint('#4f9c45', 2);
  poly([[33, hy0 - 4], [14, hy0 - 12 + flick], [18, hy0 - 4 + flick * 0.6], [33, hy0 + 3]]); paint('#e58fa0', 0);
  poly([[38, hy0 + 2], [8, hy0 - 1 + flick * 0.8], [15, hy0 + 10 + flick * 0.4], [38, hy0 + 13]]); paint('#62b653', 2);
  ctx.beginPath(); ctx.ellipse(52, hy0, 20, 16, 0, 0, Math.PI * 2);
  paint(rgrad(45, hy0 - 8, 3, 52, hy0, 26, [[0, '#b4f29a'], [0.5, '#78cf66'], [1, '#4a9a3f']]), 2.2);
  ball(45, hy0 - 9, 7, 3, 'rgba(255,255,255,0.22)', 0);
  ctx.beginPath(); ctx.moveTo(68, hy0 - 3);                                  // große Nase
  ctx.quadraticCurveTo(80, hy0 + 1, 84, hy0 + 9); ctx.quadraticCurveTo(76, hy0 + 11, 68, hy0 + 8); ctx.closePath();
  paint('#8be07a', 2); ball(79, hy0 + 8, 1, 0.8, '#2c5a28', 0);
  ball(45, hy0 + 3, 1.5, 1.5, '#3f8a37', 0); ball(42, hy0 + 8, 1.1, 1.1, '#3f8a37', 0);   // Warzen
  ctx.strokeStyle = '#2d6a2a'; ctx.lineWidth = 2; ctx.lineCap = 'round';                // Haarbüschel
  for (const [a, b] of [[49, 46], [53, 52], [57, 59]]) { ctx.beginPath(); ctx.moveTo(a, hy0 - 15); ctx.lineTo(b === 46 ? 47 : b, hy0 - 22 + (b - 46) * 0.2); ctx.stroke(); }
  // Auge mit Blinzeln
  const bt = t % 240, bl = bt < 9 ? Math.sin(bt / 9 * Math.PI) : 0, k2 = 1 - bl * 0.92, ex = 61, ey = hy0 - 2;
  ctx.beginPath(); ctx.ellipse(ex, ey, 6.6, 6.4 * k2, 0, 0, Math.PI * 2); paint('#fffdf2', 1.8);
  const lookX = o.act > 0 ? 2 : 0;
  ball(ex + 1.8 + lookX, ey + 0.5, 3.8, 3.8 * k2, '#ffd23c', 0);
  ball(ex + 2.4 + lookX, ey + 0.5, 1.4, 3.2 * k2, '#111', 0);
  ball(ex + 0.8, ey - 2, 1.2, 1.2 * k2, '#fff', 0);
  ctx.strokeStyle = '#2d6a2a'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.beginPath();   // Augenbraue
  if (o.air > 0) { ctx.moveTo(54, hy0 - 6); ctx.lineTo(68, hy0 - 11); } else { ctx.moveTo(54, hy0 - 10); ctx.lineTo(68, hy0 - 6); }
  ctx.stroke();
  if (o.air > 0) ball(66, hy0 + 11, 3, 3.6, '#3b1020', 1.4);                 // Mund: staunend offen
  else {
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(57, hy0 + 9);
    ctx.quadraticCurveTo(64, hy0 + 14, 72, hy0 + 8); ctx.stroke();           // Mund: Grinsen
    poly([[65, hy0 + 10.6], [68, hy0 + 10.2], [66.6, hy0 + 14]]); paint('#fff', 1);   // Zahn
  }
  ctx.restore();

  leg(true); arm(true);
  ctx.restore();
}

// Die Wache: etwas breiter, blaue Uniform, Mütze, Schnurrbart, Schlagstock, Schlüsselbund
// o: face, phase, t, alert (true = hat den Goblin in der Nähe)
function drawGuardDetailed(x, feetY, s, o) {
  const t = o.t, ph = o.phase;
  const bob = -Math.abs(Math.sin(ph)) * 1.8, hipY = 68 + bob, shY = 54 + bob;
  ctx.save();
  ctx.translate(x, feetY); ctx.scale(s * o.face, s); ctx.translate(-50, -94);

  const arm = front => {
    const ox = front ? 57 : 42;
    const k0 = front ? ph + Math.PI : ph;
    let hx, hy;
    if (front) { hx = ox + 10; hy = shY + 8 - (o.alert ? 6 : 0); }      // vorn: hält den Schlagstock
    else { hx = ox - 1 + Math.sin(k0) * 8; hy = shY + 16; }
    const k = ik(ox, shY, hx, hy, 9, 10, front ? 1 : 1);
    if (front) {                                                          // Schlagstock
      ctx.save(); ctx.translate(k.fx, k.fy); ctx.rotate((o.alert ? 0.5 : 0.15) + Math.sin(t / 10) * 0.1);
      ctx.beginPath(); ctx.roundRect(-2.4, -26, 4.8, 28, 2); paint(grad(-2, 0, 2, 0, [[0, '#4a4a55'], [1, '#17171c']]), 1.6);
      rect('#9aa3b5', -2.4, -4, 4.8, 6); ctx.restore();
    }
    limb(ox, shY, k, 6.5, '#33498f', '#2c3f7d');
    ball(k.fx, k.fy, 4, 4, '#e8b890', 1.6);
  };

  const leg = front => {
    const hx = front ? 54 : 46, p2 = ph + (front ? 0 : Math.PI);
    const fx = (front ? 56 : 44) + Math.sin(p2) * 9, fy = 90 - Math.max(0, Math.cos(p2)) * 5;
    const k = ik(hx, hipY, fx, fy, 11, 11, -1);
    limb(hx, hipY, k, 8.5, '#27335f', '#27335f');
    ball(k.fx + 3, k.fy + 1.5, 8.5, 4.4, '#15171c', 1.8);                // Stiefel
    ball(k.fx + 5, k.fy, 4, 1.3, 'rgba(255,255,255,0.22)', 0);
  };

  arm(false); leg(false);

  // Oberkörper
  ctx.beginPath(); ctx.moveTo(33, 52 + bob); ctx.quadraticCurveTo(50, 46 + bob, 68, 52 + bob);
  ctx.lineTo(70, 71 + bob); ctx.quadraticCurveTo(50, 76 + bob, 31, 71 + bob); ctx.closePath();
  paint(grad(31, 0, 70, 0, [[0, '#4a62b5'], [0.6, '#33498f'], [1, '#222f66']]), 2);
  rect('#15171c', 31, 66 + bob, 39, 5); rect('#e8c34a', 54, 65.5 + bob, 8, 6);       // Gürtel + Schnalle
  rect('#15171c', 56, 67.5 + bob, 4, 2);
  for (const by of [56, 61]) ball(58, by + bob, 1.4, 1.4, '#e8c34a', 0);              // Knöpfe
  star(45, 58 + bob, 5, '#ffd34a');                                                   // Abzeichen
  const sw = Math.sin(ph) * 0.5;                                                       // Schlüsselbund schwingt
  ctx.strokeStyle = '#aab2c4'; ctx.lineWidth = 1.4; ctx.beginPath();
  ctx.moveTo(38, 70 + bob); ctx.lineTo(38 + sw * 6, 77 + bob); ctx.stroke();
  rect('#ffd34a', 36 + sw * 6, 77 + bob, 4, 5); rect('#ffd34a', 40 + sw * 6, 76 + bob, 3, 4);

  // Kopf
  const hy0 = 33 + bob;
  rect('#d9a47a', 47, 44 + bob, 9, 8);
  ball(37, hy0 + 3, 4, 5, '#e2ae84', 1.6);                                            // Ohr
  ctx.beginPath(); ctx.ellipse(52, hy0 + 2, 16, 14.5, 0, 0, Math.PI * 2);
  paint(rgrad(46, hy0 - 6, 2, 52, hy0 + 2, 22, [[0, '#f6cfa8'], [1, '#d49a70']]), 2.2);
  ball(66, hy0 + 4, 3.8, 3.2, '#e2ae84', 1.6);                                        // Nase
  const ex = 59, ey = hy0 - 1;
  ball(ex, ey, 4.4, 3.8, '#fff', 1.4);
  ball(ex + 1.4, ey + 0.4, 2.1, 2.1, o.alert ? '#c0281c' : '#222', 0);
  ctx.strokeStyle = '#3a2616'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(53, ey - 6 - (o.alert ? 0 : 1)); ctx.lineTo(65, ey - (o.alert ? 3.5 : 5)); ctx.stroke();   // Augenbraue
  ball(60, hy0 + 11, 7, 2.8, '#3a2616', 1.2); ball(67, hy0 + 11.5, 4.6, 2.4, '#3a2616', 1.2);          // Schnurrbart
  if (o.alert) ball(63, hy0 + 16, 3.4, 2.4, '#4a0f12', 1.2);                           // brüllt
  // Mütze
  ctx.beginPath(); ctx.moveTo(35, hy0 - 4); ctx.quadraticCurveTo(52, hy0 - 24, 69, hy0 - 4); ctx.closePath();
  paint(grad(0, hy0 - 22, 0, hy0 - 4, [[0, '#33498f'], [1, '#1b2547']]), 2);
  rect('#e8c34a', 36, hy0 - 7, 32, 2.6);
  poly([[60, hy0 - 4], [80, hy0 - 2], [78, hy0 + 2], [60, hy0 - 0.5]]); paint('#10131a', 1.6);   // Schirm
  star(53, hy0 - 13, 4.2, '#ffd34a');
  leg(true); arm(true);
  ctx.restore();
}

// ---------- 6a. Pixel-Sprites (festes 50 x 50 Pixelraster) ----------
const PIXEL = { ink: '#202738', stone: '#39465c', lightStone: '#586782', moss: '#65904b',
  goblin: '#79c65a', goblinLight: '#a1e276', goblinDark: '#477d43', ear: '#d37b83',
  orange: '#d87832', orangeLight: '#f2a34c', orangeDark: '#964b2e', blue: '#425caa',
  blueDark: '#2c3c75', skin: '#dca578', gold: '#f0cb55', white: '#f3e8c9', red: '#d64b45' };
const pixelSprites = new Map();

function makePixelSprite(type, frame, air, active) {
  const sprite = document.createElement('canvas');
  sprite.width = 50; sprite.height = 50;
  const pixel = sprite.getContext('2d');
  pixel.imageSmoothingEnabled = false;
  const block = (color, x, y, w, h = 1) => { pixel.fillStyle = color; pixel.fillRect(x, y, w, h); };
  const outline = PIXEL.ink;
  if (type === 'goblin') {
    const stride = air ? 0 : frame ? 1 : 0;
    block(outline, 12, 41, 12, 7); block(outline, 27, 41, 12, 7);
    block(PIXEL.goblinDark, 14 + stride, 34, 8, 8); block(PIXEL.goblin, 15 + stride, 35, 6, 6);
    block(PIXEL.goblinDark, 29 - stride, 34, 8, 8); block(PIXEL.goblin, 30 - stride, 35, 6, 6);
    block('#513d35', 10 + stride, 46, 15, 3); block('#513d35', 26 - stride, 46, 15, 3);
    block('#9e7447', 11 + stride, 46, 10, 1); block('#9e7447', 27 - stride, 46, 10, 1);
    block(outline, 13, 25, 25, 15); block(PIXEL.orangeDark, 15, 26, 21, 12);
    block(PIXEL.orange, 16, 27, 18, 10); block(PIXEL.orangeLight, 17, 28, 3, 8);
    for (const y of [30, 34]) block(PIXEL.orangeDark, 17, y, 17, 1);
    block(PIXEL.gold, 29, 32, 4, 3); block(PIXEL.white, 30, 28, 6, 4);
    block(PIXEL.orangeDark, 32, 29, 2, 1); block(PIXEL.orangeDark, 31, 30, 2, 1);
    block(outline, 9, 25, 8, 12); block(PIXEL.goblinDark, 10, 27, 6, 8);
    block(PIXEL.goblin, 11, 28, 5, 6);
    block(outline, 34, 26, 8, 12); block(PIXEL.orange, 35, 27, 6, 7);
    block(PIXEL.goblin, 38, 33, 5, 5);
    if (active) { block(outline, 39, 28, 10, 6); block(PIXEL.goblin, 40, 29, 9, 4); }
    block(outline, 12, 10, 27, 19);
    block(outline, 5, 7, 12, 8); block(PIXEL.goblinDark, 7, 9, 9, 4); block(PIXEL.goblin, 9, 10, 6, 2);
    block(outline, 12, 13, 28, 17); block(PIXEL.goblinDark, 14, 14, 24, 13);
    block(PIXEL.goblin, 15, 13, 23, 13); block(PIXEL.goblinLight, 17, 14, 7, 2);
    block(PIXEL.ear, 7, 10, 5, 2);
    block(outline, 33, 16, 13, 7); block(PIXEL.goblinLight, 35, 17, 10, 4);
    block(PIXEL.goblinDark, 42, 19, 2, 2);
    block(PIXEL.white, 29, 14, 7, 7); block(PIXEL.gold, 32, 15, 3, 5);
    block(outline, 34, 16, 2, 4); block(PIXEL.white, 29, 14, 2, 2);
    block(PIXEL.goblinDark, 23, 22, 2, 2); block(PIXEL.goblinDark, 20, 24, 2, 2);
    block(outline, 35, 24, 6, 2); block(PIXEL.white, 39, 24, 2, 2);
  } else {
    const stride = frame ? 1 : 0;
    block(outline, 12, 41, 13, 7); block(outline, 27, 41, 13, 7);
    block(PIXEL.blueDark, 14 + stride, 34, 9, 9); block(PIXEL.blue, 15 + stride, 35, 7, 7);
    block(PIXEL.blueDark, 29 - stride, 34, 9, 9); block(PIXEL.blue, 30 - stride, 35, 7, 7);
    block('#20232d', 10 + stride, 46, 17, 3); block('#20232d', 26 - stride, 46, 17, 3);
    block(outline, 12, 25, 27, 16); block(PIXEL.blueDark, 14, 26, 23, 13);
    block(PIXEL.blue, 15, 27, 20, 10); block(PIXEL.gold, 28, 28, 4, 3);
    block(outline, 9, 25, 8, 12); block(PIXEL.blue, 10, 27, 6, 8);
    block(outline, 35, 25, 8, 12); block(PIXEL.blue, 36, 27, 6, 8);
    block(PIXEL.skin, 38, active ? 28 : 33, 5, 5);
    if (!active) { block(outline, 40, 9, 5, 23); block('#6b4537', 41, 10, 3, 20); block(PIXEL.gold, 40, 24, 5, 2); }
    block(outline, 13, 10, 27, 19); block(PIXEL.skin, 15, 13, 23, 14);
    block(PIXEL.skin, 10, 17, 6, 5); block(outline, 9, 16, 3, 7);
    block(outline, 33, 16, 13, 7); block(PIXEL.skin, 35, 17, 10, 4);
    block(PIXEL.white, 30, 15, 6, 6); block(active ? PIXEL.red : outline, 33, 16, 2, 4);
    block(outline, 27, 21, 13, 4); block('#43352f', 28, 21, 11, 2);
    block(outline, 11, 10, 30, 6); block(PIXEL.blueDark, 14, 5, 23, 7);
    block(PIXEL.blue, 16, 6, 18, 4); block(PIXEL.gold, 17, 10, 21, 2);
    block(outline, 34, 10, 12, 4); block(PIXEL.blueDark, 35, 11, 9, 2);
    block(PIXEL.gold, 25, 7, 5, 4); block(PIXEL.gold, 27, 5, 1, 8);
  }
  return sprite;
}

function drawPixelCharacter(type, x, feetY, scale, pose) {
  const frame = Math.floor(pose.phase || 0) % 2;
  const airborne = type === 'goblin' && pose.air !== 0;
  const active = type === 'goblin' ? pose.act > 0.2 : pose.alert;
  const key = type + ':' + frame + ':' + airborne + ':' + active;
  if (!pixelSprites.has(key)) pixelSprites.set(key, makePixelSprite(type, frame, airborne, active));
  const size = scale * 2;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(feetY));
  ctx.scale((pose.face || 1) * size, size);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pixelSprites.get(key), -25, -50, 50, 50);
  ctx.restore();
}

function drawGoblin(x, feetY, s, o) { drawPixelCharacter('goblin', x, feetY, s, o); }
function drawGuard(x, feetY, s, o) { drawPixelCharacter('guard', x, feetY, s, o); }

// ---------- 7. Welt: Hintergrund, Wände, Gegenstände ----------
const bgCanvas = document.createElement('canvas');    // fertig gezeichneter, unbeweglicher Hintergrund
const vigCanvas = document.createElement('canvas');   // dunkle Ränder (Vignette)
const at = (c, r) => (grid[r] && grid[r][c]) || '#';
const solid = (c, r) => ['#', 'D', 'G'].includes(at(c, r));
const isWall = (c, r) => at(c, r) === '#';

function drawBackWall() {
  rect('#171b26', 0, 0, worldWidth, H);
  for (let y = 0; y < H; y += 16) for (let x = (y / 16 % 2 ? -16 : 0); x < worldWidth; x += 32) {
    rect(hash(x, y, 3) > 0.5 ? '#202737' : '#1c2230', x + 1, y + 1, 30, 14);
    rect('#111722', x, y, 32, 2); rect('#111722', x, y, 2, 16);
  }
  for (let c = 3; c < worldCols; c += 8) {
    const x = c * TILE, y = 3 * TILE;
    rect('#323d53', x - 4, y - 4, 56, 72); rect('#10172a', x, y, 48, 64);
    rect('#263b61', x + 4, y + 4, 40, 56); rect('#344d78', x + 4, y + 4, 40, 3);
    for (let i = 0; i < 4; i++) rect('#7b8daa', x + 8 + i * 10, y, 3, 64);
    rect('#7b8daa', x, y + 30, 48, 4);
    for (let i = 0; i < 5; i++) rect('#d5d9d2', x + 6 + hash(c, i, 1) * 34, y + 8 + hash(c, i, 2) * 42, 2, 2);
  }
  rect('#4a5368', 14 * TILE, 2 * TILE, 3, 48);
  rect('#4a5368', 16 * TILE, 2 * TILE, 3, 48);
  for (let i = 0; i < 6; i++) rect('#758098', 14 * TILE, 2 * TILE + i * 8, 3, 4);
}

function drawWall(c, r) {
  const x = c * TILE, y = r * TILE;
  rect(hash(c, r, 1) > 0.5 ? '#39465c' : '#303b50', x, y, TILE, TILE);
  for (let row = 0; row < 4; row++) {
    const bx = x + ((r + row) % 2 ? 4 : 16);
    rect('#263144', x, y + row * 8 + 7, TILE, 1);
    rect('#263144', bx, y + row * 8, 1, 7);
    rect(hash(c, r, row + 4) > 0.5 ? '#46546b' : '#344158', x + 4, y + row * 8 + 2, 8, 3);
    if (hash(c, r, row + 9) > 0.65) rect(PIXEL.moss, x + (row * 7) % 24, y + row * 8 + 1, 4, 2);
  }
  if (!isWall(c, r - 1)) { rect('#65738a', x, y, TILE, 2); rect('#81906e', x + 4, y, 8, 2); }
  if (!isWall(c, r + 1)) rect('#202939', x, y + TILE - 3, TILE, 3);
}

// Baut den unbeweglichen Hintergrund EINMAL pro Level (spart viel Rechenzeit pro Bild)
function buildStatic() {
  const main = ctx;
  bgCanvas.width = worldWidth * RES; bgCanvas.height = H * RES;
  ctx = bgCanvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.setTransform(RES, 0, 0, RES, 0, 0);
  drawBackWall();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < worldCols; c++) if (isWall(c, r)) drawWall(c, r);
  ctx = main;
}
function buildVignette() {
  const main = ctx;
  vigCanvas.width = W * RES; vigCanvas.height = H * RES;
  ctx = vigCanvas.getContext('2d'); ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.fillStyle = rgrad(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']]);
  ctx.fillRect(0, 0, W, H);
  ctx = main;
}

function drawTorches() {
  for (const c of torchColumns()) {
    const x = c * TILE, y = 7 * TILE;
    const f = 1 + Math.sin(time / 5 + c) * 0.12 + Math.sin(time / 2.3 + c * 2) * 0.05;
    glow(x, y - 4, 95 * f, 'rgba(255,160,60,0.30)');
    rect('#2e3340', x - 5, y + 10, 10, 3);                                          // Halterung
    ctx.beginPath(); ctx.moveTo(x - 3, y + 14); ctx.lineTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.lineTo(x + 3, y + 14);
    ctx.closePath(); paint('#6b4a2a', 1.6);
    const h = 15 * f;                                                               // Flamme in 3 Schichten
    for (const [col, k] of [['#ff6a1a', 1], ['#ffb04a', 0.72], ['#fff0a8', 0.42]]) {
      const sway = Math.sin(time / 6 + c + k) * 1.6;
      ctx.beginPath(); ctx.moveTo(x - 5 * k, y);
      ctx.quadraticCurveTo(x - 7 * k, y - h * 0.5 * k, x + sway, y - h * k);
      ctx.quadraticCurveTo(x + 7 * k, y - h * 0.5 * k, x + 5 * k, y); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    }
  }
}

// ----- bewegliche Gegenstände -----
function drawDoor(c, r) {
  const x = c * TILE, y = r * TILE;
  ctx.fillStyle = grad(x, 0, x + TILE, 0, [[0, '#6e4423'], [0.5, '#8d5c30'], [1, '#5f3a1c']]); ctx.fillRect(x + 1, y, 30, TILE);
  for (const px of [9, 17, 25]) { rect('rgba(30,15,5,0.55)', x + px, y, 1.5, TILE); rect('rgba(255,210,150,0.12)', x + px + 1.5, y, 1, TILE); }
  for (const by of [4, 24]) {                                                  // Eisenbänder mit Nieten
    rect('#2a2d35', x + 1, y + by, 30, 4); rect('#4a4f5c', x + 1, y + by, 30, 1);
    for (const rx of [5, 16, 27]) ball(x + rx, y + by + 2, 1.2, 1.2, '#8b93a6', 0);
  }
  rect('rgba(0,0,0,0.35)', x + 1, y, 1.5, TILE); rect('rgba(0,0,0,0.35)', x + 29.5, y, 1.5, TILE);
  if (at(c, r - 1) !== 'D') rect('#2a2d35', x, y, TILE, 3);
  if (at(c, r - 1) === 'D' && at(c, r - 2) === 'D' && at(c, r - 3) !== 'D') {   // Schloss in der Türmitte
    const sh = pickT > 0 ? Math.sin(time * 2) * 1.2 : 0;
    ctx.save(); ctx.translate(x + 16 + sh, y + 16);
    ctx.strokeStyle = '#aeb6c8'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, -3, 5, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-7, -3, 14, 12, 2); paint(grad(0, -3, 0, 9, [[0, '#ffe083'], [1, '#c99a1f']]), 1.6);
    ball(0, 1.5, 1.8, 1.8, '#222', 0); rect('#222', -0.8, 2, 1.6, 4);
    ctx.restore();
  }
}

function drawGate(c, r) {
  const x = c * TILE, y = r * TILE;
  rect('rgba(0,0,0,0.28)', x, y, TILE, TILE);
  for (let i = 0; i < 3; i++) {
    const bx = x + 4 + i * 10;
    ctx.fillStyle = grad(bx, 0, bx + 4, 0, [[0, '#e2e7f2'], [0.5, '#9aa3b5'], [1, '#5b6477']]); ctx.fillRect(bx, y, 4, TILE);
    if (at(c, r - 1) !== 'G') { poly([[bx - 1, y + 1], [bx + 2, y - 5], [bx + 5, y + 1]]); paint('#cfd5e3', 1.2); }
  }
  rect('#4d5567', x, y + 13, TILE, 4); rect('#aab2c4', x, y + 13, TILE, 1);
}

function drawKeyItem(c, r) {
  const x = c * TILE + 16, y = r * TILE + 16 + Math.sin(time / 12) * 3;
  glow(x, y, 30 + Math.sin(time / 9) * 4, 'rgba(255,210,80,0.35)');
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.6 + Math.sin(time / 20) * 0.12); ctx.scale(0.36, 0.36);   // 100x100-Zeichenfeld
  const gold = grad(0, -20, 0, 20, [[0, '#fff0a8'], [0.5, '#ffd34a'], [1, '#b5811a']]);
  ctx.beginPath(); ctx.arc(-24, 0, 17, 0, Math.PI * 2); ctx.arc(-24, 0, 7, 0, Math.PI * 2, true);
  ctx.fillStyle = gold; ctx.fill('evenodd'); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-8, -5, 54, 10, 3); paint(gold, 4);
  ctx.beginPath(); ctx.roundRect(28, 4, 8, 15, 2); paint(gold, 4);
  ctx.beginPath(); ctx.roundRect(40, 4, 8, 11, 2); paint(gold, 4);
  rect('rgba(255,255,255,0.5)', -6, -3, 36, 2);
  ctx.restore();
  if (Math.sin(time / 14) > 0.7) { star(x + 10, y - 12, 4, '#fff'); }               // Glitzern
}

function drawLever(ch, c, r) {
  const x = c * TILE, y = r * TILE, on = ch === 'l';
  ctx.beginPath(); ctx.roundRect(x + 4, y + 22, 24, 10, 3); paint(grad(0, y + 22, 0, y + 32, [[0, '#6a7389'], [1, '#444b5c']]), 1.6);
  ball(x + 8, y + 27, 1.2, 1.2, '#aab2c4', 0); ball(x + 24, y + 27, 1.2, 1.2, '#aab2c4', 0);
  ctx.save(); ctx.translate(x + 16, y + 25); ctx.rotate(on ? 0.75 : -0.75);
  ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -16); ctx.stroke();
  ctx.strokeStyle = '#c4cbdb'; ctx.lineWidth = 3.4; ctx.stroke();
  ball(0, -18, 5, 5, on ? '#6ed36b' : '#e05a4f', 1.6); ball(-1.5, -19.5, 1.6, 1.6, 'rgba(255,255,255,0.7)', 0);
  ctx.restore();
  glow(x + 16 + (on ? 12 : -12), y + 8, 16, on ? 'rgba(110,211,107,0.28)' : 'rgba(224,90,79,0.28)');
}

function drawFlag(c, r) {
  const x = c * TILE, y = r * TILE, on = spawn.x === c * TILE + 6;
  rect(OUT, x + 12.5, y + 1, 5, 31); rect(grad(x + 13, 0, x + 17, 0, [[0, '#d5dae6'], [1, '#6c7488']]), x + 13.5, y + 2, 3, 30);
  ball(x + 15, y + 2, 3.4, 3.4, on ? '#ffd34a' : '#8a8f9c', 1.4);
  if (on) glow(x + 22, y + 10, 40, 'rgba(110,230,120,0.3)');
  ctx.beginPath(); ctx.moveTo(x + 17, y + 5);                                   // Fahne wedelt im Wind
  for (let i = 0; i <= 10; i++) ctx.lineTo(x + 17 + i * 1.5, y + 5 + Math.sin(time / 6 + i * 0.7) * i * 0.3);
  for (let i = 10; i >= 0; i--) ctx.lineTo(x + 17 + i * 1.5, y + 15 + Math.sin(time / 6 + i * 0.7) * i * 0.3);
  ctx.closePath(); paint(on ? '#4fd36a' : '#8a8f9c', 1.4);
}

function drawSpikes(c, r) {
  const x = c * TILE, y = r * TILE;
  rect('#3c4250', x + 5, y + 29, 22, 3); rect('#5b6477', x + 5, y + 29, 22, 1);
  for (const bx of [x + 8, x + 19]) {
    poly([[bx, y + 29], [bx + 3, y + 21], [bx + 6, y + 29]]); paint('#e1e6ef', 1);
    rect('#8a93a6', bx + 3, y + 25, 2, 4);
  }
  if ((time + c * 17) % 120 < 6) rect('#fff', x + 10, y + 20, 2, 2);
}

function drawExit(c, r) {
  const x = c * TILE, y = r * TILE - 8, h = 40, pulse = 0.85 + Math.sin(time / 15) * 0.15;
  glow(x + 16, y + 22, 64 * pulse, 'rgba(255,220,140,0.45)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {                                                  // Lichtstrahlen
    const a = -Math.PI / 2 + (i - 2) * 0.3 + Math.sin(time / 40 + i) * 0.04;
    ctx.fillStyle = 'rgba(255,230,160,0.07)'; ctx.beginPath(); ctx.moveTo(x + 16, y + 30);
    ctx.lineTo(x + 16 + Math.cos(a - 0.06) * 95, y + 30 + Math.sin(a - 0.06) * 95);
    ctx.lineTo(x + 16 + Math.cos(a + 0.06) * 95, y + 30 + Math.sin(a + 0.06) * 95); ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(x + 1, y + h); ctx.lineTo(x + 1, y + 14);
  ctx.quadraticCurveTo(x + 1, y + 1, x + 16, y + 1); ctx.quadraticCurveTo(x + 31, y + 1, x + 31, y + 14);
  ctx.lineTo(x + 31, y + h); ctx.closePath(); paint('#5b6580', 2);
  ctx.beginPath(); ctx.moveTo(x + 5, y + h); ctx.lineTo(x + 5, y + 15);
  ctx.quadraticCurveTo(x + 5, y + 5, x + 16, y + 5); ctx.quadraticCurveTo(x + 27, y + 5, x + 27, y + 15);
  ctx.lineTo(x + 27, y + h); ctx.closePath();
  ctx.fillStyle = grad(0, y, 0, y + h, [[0, '#fffbe6'], [1, '#ffcf6a']]); ctx.fill();
  rect('#7b86a3', x + 13, y + 1, 6, 5);
}

// ---------- 8. Partikel (Staub, Funken, Rauchwölkchen) und Schwebestaub ----------
let parts = [];
function emit(x, y, n, o) {
  for (let i = 0; i < n && parts.length < 300; i++) {
    parts.push({ x, y, vx: (Math.random() - 0.5) * o.sp, vy: (Math.random() - 0.5) * o.sp - (o.up || 0),
                 g: o.g === undefined ? 0.12 : o.g, life: o.life, max: o.life, size: o.size, col: o.col });
  }
}
const dust = (x, y, n = 5) => emit(x, y, n, { sp: 1.8, up: 0.4, g: -0.01, life: 26, size: 3, col: '#b9bfcc' });
const sparks = (x, y, col, n = 8) => emit(x, y, n, { sp: 4, up: 1.5, g: 0.15, life: 32, size: 2, col });
function updateParts() {
  for (const q of parts) { q.x += q.vx; q.y += q.vy; q.vy += q.g; q.vx *= 0.97; q.life--; }
  parts = parts.filter(q => q.life > 0);
  if (time % 10 === 0) for (const c of torchColumns()) emit(c * TILE, 7 * TILE - 10, 1, { sp: 0.8, up: 1.1, g: -0.01, life: 50, size: 1.6, col: '#ffb04a' });
}
function drawParts() {
  for (const q of parts) {
    ctx.globalAlpha = Math.min(1, q.life / q.max * 1.4);
    ctx.fillStyle = q.col;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.4 + 0.6 * q.life / q.max), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
const MOTES = Array.from({ length: 36 }, (_, i) => ({ x: hash(i, 1) * W, y: hash(i, 2) * H, sp: 0.1 + hash(i, 3) * 0.25, ph: hash(i, 4) * 6 }));
function drawMotes() {                                          // Staubkörnchen im Fackellicht
  for (const m of MOTES) {
    const y = ((m.y - time * m.sp) % H + H) % H, x = m.x + Math.sin(time / 60 + m.ph) * 10;
    ctx.fillStyle = 'rgba(255,220,170,' + (0.12 + 0.12 * Math.sin(time / 30 + m.ph)) + ')';
    ctx.fillRect(x, y, 1.6, 1.6);
  }
}

// ---------- 9. Spiel starten ----------
function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.remove('hidden'); toastTimer = 180;
}

function loadLevel(i, useCheckpoint) {
  lvl = i;
  const L = LEVELS[i];
  worldCols = L.cols;
  worldWidth = worldCols * TILE;
  cameraX = 0;
  grid = L.grid.map(row => row.slice());
  guards = []; hasKey = false; pickT = 0; parts = [];
  spawn = { x: L.start.x, y: L.start.y };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < worldCols; c++) {
    if (grid[r][c] === 'W') {   // Wachen sind bewegliche Figuren, keine Felder
      guards.push({ x: c * TILE + 5, y: r * TILE + 4, w: 22, h: 28, dir: 1, step: 0, alert: false });
      grid[r][c] = '.';
    }
  }
  if (useCheckpoint && save.cp && save.cp.level === i) spawn = { x: save.cp.x, y: save.cp.y };
  p = { x: spawn.x, y: spawn.y, w: 20, h: 28, vx: 0, vy: 0, onGround: false,
        face: 1, coyote: 0, jumpBuf: 0, interactT: 0, step: 0, land: 0 };
  buildStatic();
  $('hudLevel').textContent = 'Level ' + (i + 1) + '/' + LEVELS.length + ' – ' + L.name;
  toast(L.hint);
}

function startPlaying() {
  show(null); state = 'play';
  $('hud').classList.remove('hidden');
}

// ---------- 10. Update ----------
// Prüft, ob ein Rechteck (Spieler) eine feste Kachel berührt
function hitsWall(x, y) {
  const c0 = Math.floor(x / TILE), c1 = Math.floor((x + p.w - 1) / TILE);
  const r0 = Math.floor(y / TILE), r1 = Math.floor((y + p.h - 1) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solid(c, r)) return true;
  return false;
}

// Sucht Kacheln mit bestimmten Zeichen in der Nähe des Spielers
function near(chars) {
  const c0 = Math.floor((p.x - 10) / TILE), c1 = Math.floor((p.x + p.w + 10) / TILE);
  const r0 = Math.floor((p.y - 4) / TILE), r1 = Math.floor((p.y + p.h) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (chars.includes(at(c, r))) return { c, r, t: at(c, r) };
  }
  return null;
}

function openAll(ch) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < worldCols; c++) if (grid[r][c] === ch) {
    grid[r][c] = '.';
    dust(c * TILE + 16, r * TILE + 16, 3);
  }
}

function die() {
  sfx(200, 0.4, -150); flash = 20; shake = 14;
  emit(p.x + p.w / 2, p.y + p.h / 2, 18, { sp: 6, up: 1.5, g: 0.2, life: 40, size: 3.4, col: '#78cf66' });
  p.x = spawn.x; p.y = spawn.y; p.vx = p.vy = 0; p.land = 0;
}

function interact() {
  p.interactT = 14;
  const lever = near('L');
  if (lever) {
    openAll('G'); grid[lever.r][lever.c] = 'l';
    sfx(300, 0.2, 200); toast('Das Gitter öffnet sich!');
    sparks(lever.c * TILE + 16, lever.r * TILE + 10, '#6ed36b'); return;
  }
  if (near('D') && hasKey) {
    openAll('D'); hasKey = false; sfx(500, 0.2, 300); toast('Tür aufgeschlossen!');
  }
}

function update() {
  time++;
  const wasGround = p.onGround;
  // --- Bewegung links/rechts ---
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  p.vx += (dir * SPEED - p.vx) * 0.25;
  if (dir) p.face = dir;
  // --- Springen (mit kleiner Toleranz, damit es zuverlässig klappt) ---
  p.coyote = p.onGround ? 6 : p.coyote - 1;
  p.jumpBuf = keys.jump ? Math.max(p.jumpBuf, 1) + (p.jumpBuf > 0 ? 0 : 5) : p.jumpBuf - 1;
  if (p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = JUMP; p.coyote = 0; p.jumpBuf = 0; sfx(400, 0.15, 250);
    dust(p.x + p.w / 2, p.y + p.h, 5);
  }
  if (!keys.jump && p.vy < -4) p.vy = -4;   // kurzer Tipp = kleiner Sprung
  p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
  const fallSpeed = p.vy;
  // --- Bewegung + Kollision, erst waagerecht, dann senkrecht ---
  p.x += p.vx;
  if (hitsWall(p.x, p.y)) {
    p.x = p.vx > 0 ? Math.floor((p.x + p.w) / TILE) * TILE - p.w : (Math.floor(p.x / TILE) + 1) * TILE;
    p.vx = 0;
  }
  p.y += p.vy; p.onGround = false;
  if (hitsWall(p.x, p.y)) {
    if (p.vy > 0) { p.y = Math.floor((p.y + p.h) / TILE) * TILE - p.h; p.onGround = true; }
    else p.y = (Math.floor(p.y / TILE) + 1) * TILE;
    p.vy = 0;
  }
  if (p.onGround && !wasGround && fallSpeed > 3) {         // Landung: Staub + Gummi-Effekt
    p.land = 1; dust(p.x + p.w / 2, p.y + p.h, 7); sfx(120, 0.06);
  }
  p.land = Math.max(0, p.land - 0.09);
  if (p.onGround && Math.abs(p.vx) > 2.5 && time % 7 === 0) dust(p.x + p.w / 2 - p.face * 6, p.y + p.h, 2);
  p.step += Math.abs(p.vx) * 0.2;                           // Laufzyklus der Beine
  if (p.interactT > 0) p.interactT--;
  if (p.y > H) die();

  // --- Schlüssel, Checkpoint ---
  const key = near('K');
  if (key) {
    grid[key.r][key.c] = '.'; hasKey = true; sfx(700, 0.2, 400); toast('Schlüssel gefunden!');
    sparks(key.c * TILE + 16, key.r * TILE + 16, '#ffd34a', 14);
  }
  const cp = near('C');
  if (cp) {
    const nx = cp.c * TILE + 6, ny = cp.r * TILE + 4;
    if (spawn.x !== nx) {
      spawn = { x: nx, y: ny }; save.cp = { level: lvl, x: nx, y: ny }; writeSave();
      sfx(600, 0.15, 200); toast('Checkpoint gespeichert');
      sparks(cp.c * TILE + 22, cp.r * TILE + 10, '#6ed36b', 12);
    }
  }
  // --- Schloss knacken: E an der Tür gedrückt halten ---
  const door = near('D');
  if (keys.interact && !hasKey && door) {
    pickT++;
    if (pickT % 16 === 0) { sfx(900, 0.04); sparks(door.c * TILE + 16, door.r * TILE + 16, '#ffe083', 3); }
    if (pickT >= PICK_TIME) { openAll('D'); pickT = 0; sfx(500, 0.25, 300); toast('Schloss geknackt!'); }
  } else pickT = 0;

  // --- Kleine Stachelspitzen haben eine schmale, passende Kollisionsfläche ---
  const c0 = Math.floor(p.x / TILE), c1 = Math.floor((p.x + p.w - 1) / TILE);
  const r0 = Math.floor(p.y / TILE), r1 = Math.floor((p.y + p.h - 1) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const spikeLeft = c * TILE + 8, spikeRight = c * TILE + 24;
    if (at(c, r) === 'S' && p.x < spikeRight && p.x + p.w > spikeLeft &&
        p.y + p.h > r * TILE + 22 && p.y < (r + 1) * TILE) die();
  }
  // --- Wachen laufen hin und her, Berührung = Tod ---
  for (const g of guards) {
    const frontX = g.x + (g.dir > 0 ? g.w + 1.2 : -1.2);
    const row = Math.floor((g.y + g.h - 2) / TILE);
    if (solid(Math.floor(frontX / TILE), row)) g.dir *= -1;
    g.x += g.dir * 1.2; g.step += 0.4;
    g.alert = Math.abs(p.x - g.x) < 90 && Math.abs(p.y - g.y) < 50;     // Wache "bemerkt" den Goblin
    if (p.x < g.x + g.w && p.x + p.w > g.x && p.y < g.y + g.h && p.y + p.h > g.y) die();
  }
  // --- Ausgang ---
  if (near('E')) finishLevel();
  cameraX = Math.max(0, Math.min(worldWidth - W, p.x + p.w / 2 - W / 2));

  if (flash > 0) flash--;
  if (shake > 0) shake--;
  updateParts();
  if (toastTimer > 0 && --toastTimer === 0) $('toast').classList.add('hidden');
  $('hudKey').textContent = hasKey ? 'Schlüssel: ja' : '';
}

function finishLevel() {
  state = 'win';
  const last = lvl === LEVELS.length - 1;
  save.started = true; save.cp = null;
  save.unlocked = Math.max(save.unlocked, lvl + 1);
  save.level = last ? 0 : lvl + 1;
  writeSave(); sfx(800, 0.4, 500);
  $('winTitle').textContent = last ? 'Du bist frei!' : 'Level geschafft!';
  $('winText').textContent = last
    ? 'Der Goblin entkommt in die Nacht, um seine Unschuld zu beweisen. Du hast alle acht Abschnitte geschafft!'
    : 'Die Zellentür fällt hinter dir zu. Weiter geht die Flucht.';
  $('btnNext').classList.toggle('hidden', last);
  $('hud').classList.add('hidden'); show('win');
}

// ---------- 11. Zeichnen ----------
function beginFrame() {
  ctx.setTransform(RES, 0, 0, RES, 0, 0);                       // ab jetzt in Spielpixeln zeichnen
  ctx.imageSmoothingEnabled = false;
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 0.7, (Math.random() - 0.5) * shake * 0.7);
  ctx.drawImage(bgCanvas, -cameraX, 0, worldWidth, H);           // Hintergrund entsprechend der Kamera einsetzen
  ctx.translate(-cameraX, 0);
}
function endFrame() {
  drawParts();
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  drawMotes();
  ctx.drawImage(vigCanvas, 0, 0, W, H);                         // dunkle Ränder
}

function groundBelow(x, y) {                                    // Boden unter einem Punkt (für den Schatten)
  for (let r = Math.max(0, Math.floor(y / TILE)); r < ROWS; r++) if (solid(Math.floor(x / TILE), r)) return r * TILE;
  return H;
}
function shadow(x, y, w, k) {
  ctx.fillStyle = 'rgba(0,0,0,' + 0.38 * k + ')';
  ctx.beginPath(); ctx.ellipse(x, y, w * k, 3.2 * k, 0, 0, 7); ctx.fill();
}

function drawPlayer() {
  const cx = p.x + p.w / 2, fy = p.y + p.h;
  const gy = groundBelow(cx, fy - 2), k = Math.max(0.35, 1 - (gy - fy) / 140);
  shadow(cx, gy, 11, k);
  drawGoblin(cx, fy + 2, SPR, {
    face: p.face, phase: p.step, run: Math.min(1, Math.abs(p.vx) / SPEED),
    air: p.onGround ? 0 : (p.vy < 1 ? -1 : 1), act: p.interactT / 14, land: p.land, t: time
  });
}
function drawOneGuard(g) {
  shadow(g.x + g.w / 2, g.y + g.h, 11, 1);
  drawGuard(g.x + g.w / 2, g.y + g.h + 2, SPR, { face: g.dir, phase: g.step, t: time, alert: g.alert });
}

function drawPrompt() {                                         // "E"-Sprechblase, wenn man etwas bedienen kann
  if (!(near('L') || (near('D') && pickT === 0))) return;
  const x = p.x + p.w / 2, y = p.y - 22 + Math.sin(time / 8) * 2;
  ctx.beginPath(); ctx.roundRect(x - 10, y - 9, 20, 20, 6); paint('rgba(20,24,34,0.88)', 1.4);
  ctx.fillStyle = '#ffb04a'; ctx.font = 'bold 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('E', x, y + 5);
}

function draw() {
  beginFrame();
  drawTorches();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < worldCols; c++) {
    const ch = grid[r][c];
    if (ch === 'D') drawDoor(c, r); else if (ch === 'G') drawGate(c, r);
    else if (ch === 'K') drawKeyItem(c, r); else if (ch === 'L' || ch === 'l') drawLever(ch, c, r);
    else if (ch === 'C') drawFlag(c, r); else if (ch === 'S') drawSpikes(c, r); else if (ch === 'E') drawExit(c, r);
  }
  guards.forEach(drawOneGuard);
  drawPlayer();
  if (state === 'play') drawPrompt();
  if (pickT > 0) {                                              // Fortschrittsbalken beim Schlossknacken
    const d = near('D');
    if (d) {
      const bx = d.c * TILE - 8, by = d.r * TILE - 14;
      ctx.beginPath(); ctx.roundRect(bx, by, 48, 9, 4); paint('rgba(10,12,18,0.9)', 1.4);
      ctx.beginPath(); ctx.roundRect(bx + 2, by + 2, 44 * pickT / PICK_TIME, 5, 2.5); ctx.fillStyle = '#ffd34a'; ctx.fill();
    }
  }
  endFrame();
  if (flash > 0) { ctx.fillStyle = 'rgba(220,40,40,' + flash / 40 + ')'; ctx.fillRect(0, 0, W, H); }
}

// Szene hinter den Menüs: Goblin steht in der Zelle, eine Wache läuft Streife
const demoGuard = { x: 790, dir: 1, step: 0 };
function drawMenuScene() {
  beginFrame();
  drawTorches();
  const floor = (ROWS - 1) * TILE;
  demoGuard.step += 0.4; demoGuard.x = 790 + Math.sin(time / 90) * 70; demoGuard.dir = Math.cos(time / 90) >= 0 ? 1 : -1;
  rect('#111722', 118, floor - 3, 64, 3); rect('#111722', demoGuard.x - 28, floor - 3, 64, 3);
  drawGoblin(150, floor + 4, SPR * 2, { face: 1, phase: 0, run: 0, air: 0, act: 0, land: 0, t: time });
  drawGuard(demoGuard.x, floor + 4, SPR * 2, { face: demoGuard.dir, phase: demoGuard.step, t: time, alert: false });
  endFrame();
}

// ---------- 12. Pixelart-Intro ----------
const INTRO_SCENES = [
  { title: 'Vor Gericht', text: 'Der Goblin wird in den Saal geführt und trägt seine Sicht der Dinge vor.', duration: 300 },
  { title: 'Das Urteil', text: 'Der Richter verkündet das Urteil. Eine Wache begleitet den Goblin hinaus.', duration: 270 },
  { title: 'Der Transport', text: 'Im bewachten Gefängniswagen geht die Fahrt durch die Nacht weiter.', duration: 360 },
  { title: 'Ankunft in der Zelle', text: 'Der Goblin steigt aus, geht in die Zelle und die Wache schließt das Gitter.', duration: 360 }
];
let introStage = 0, introElapsed = 0;

function introStageText() {
  const scene = INTRO_SCENES[introStage];
  $('introProgress').textContent = 'VORSPIEL  ' + (introStage + 1) + ' / ' + INTRO_SCENES.length;
  $('introTitle').textContent = scene.title;
  $('introText').textContent = scene.text;
  $('introNext').textContent = introStage === INTRO_SCENES.length - 1 ? 'Zur Zelle' : 'Weiter';
}

function startIntro() {
  state = 'intro'; introStage = 0; introElapsed = 0; cameraX = 0;
  save.introSeen = true;
  writeSave();
  $('hud').classList.add('hidden');
  show('intro');
  introStageText();
}

function finishIntro() {
  loadLevel(0, false);
  startPlaying();
}

function advanceIntro() {
  if (introStage >= INTRO_SCENES.length - 1) { finishIntro(); return; }
  introStage++;
  introElapsed = 0;
  introStageText();
}

function drawIntroScene() {
  const px = (color, x, y, w, h = w) => rect(color, x, y, w, h);
  const scene = introStage, t = introElapsed / INTRO_SCENES[scene].duration;
  const clamp01 = n => Math.max(0, Math.min(1, n));
  const ease = n => { n = clamp01(n); return n * n * (3 - 2 * n); };
  const groundShadow = (x, y, w, alpha = 0.35) => {
    ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    ctx.beginPath(); ctx.ellipse(x, y, w, 4, 0, 0, Math.PI * 2); ctx.fill();
  };
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.imageSmoothingEnabled = false;
  rect('#111827', 0, 0, W, H);

  if (scene < 2) {
    const floorY = 438;
    rect('#29354a', 0, 0, W, floorY);
    for (let x = 62; x < W; x += 188) {
      px('#485774', x, 58, 88, 188); px('#34435d', x + 8, 66, 72, 172);
      px('#172239', x + 16, 78, 56, 148); px('#8290aa', x + 28, 84, 4, 136);
      px('#8290aa', x + 55, 84, 4, 136); px('#53637e', x + 16, 146, 56, 6);
      px('#dce2e5', x + 33, 100, 3, 3); px('#dce2e5', x + 59, 123, 3, 3);
    }
    for (let x = 0; x < W; x += 80) {
      px('#344056', x, 270, 78, 5); px('#344056', x, 270, 5, 96);
      px('#202b3e', x + 16, 288, 3, 46); px('#202b3e', x + 58, 288, 3, 46);
    }
    rect('#4a382f', 0, floorY, W, H - floorY);
    for (let x = 0; x < W; x += 48) {
      px('#342a2d', x, floorY, 48, 4);
      px(x % 96 ? '#61483a' : '#70533d', x, floorY + 27, 46, 3);
      px('#302b32', x + 45, floorY + 4, 3, 23);
    }
    px('#202b3d', 0, floorY - 5, W, 5);
    for (const x of [70, 145, 890]) {
      px('#513d35', x, 350, 112, 14); px('#72533d', x + 7, 344, 98, 8);
      px('#513d35', x + 12, 364, 8, 60); px('#513d35', x + 92, 364, 8, 60);
    }

    // Richterpodest und Pult: beide Szenen teilen sich denselben Raum und dieselbe Kamera.
    px('#48352f', 586, 328, 310, 106); px('#76563f', 586, 320, 310, 12);
    px('#392d32', 580, 428, 322, 10);
    px('#624638', 540, 390, 52, 48); px('#72513a', 548, 382, 44, 10);
    px('#704f39', 630, 304, 226, 28); px('#4a3733', 638, 332, 210, 14);
    px('#282638', 684, 279, 54, 43); px('#30263a', 678, 295, 66, 27);
    px('#d8b98d', 696, 260, 31, 28); px('#d8b98d', 688, 270, 9, 12);
    px('#e4dfd1', 691, 255, 39, 13); px('#e4dfd1', 685, 264, 8, 12);
    px('#e4dfd1', 728, 263, 8, 12); px('#272437', 694, 251, 34, 8);
    px('#f1d06b', 707, 270, 4, 4);
    px('#4d3c3b', 704, 319, 5, 8); px('#4d3c3b', 719, 319, 5, 8);
    // Der Richter hebt den Holzhammer und setzt ihn auf dem Pult ab.
    const gavelY = scene === 1 ? 296 - Math.sin(Math.min(1, t * 2) * Math.PI) * 13 : 304;
    px('#d3a15a', 744, gavelY, 19, 5); px('#a97743', 752, gavelY - 6, 8, 8);
    px('#d3a15a', 750, 300, 5, 18);

    const walk = scene === 0 ? ease(t / 0.68) : 1;
    const goblinX = scene === 0 ? 150 + 172 * walk : 322;
    const guardX = scene === 0 ? goblinX - 64 : 382;
    groundShadow(goblinX, floorY, 15, 0.48);
    groundShadow(guardX, floorY, 14, 0.42);
    drawGoblin(goblinX, floorY, 0.9, {
      face: 1, phase: Math.floor(time / 4), run: scene === 0 && t < 0.68 ? 0.62 : 0,
      air: 0, act: 0, land: 0, t: time
    });
    drawGuard(guardX, floorY, 0.84, {
      face: 1, phase: Math.floor(time / 5), t: time, alert: false
    });
    if (scene === 1) {
      px('#ead9ac', 566, 344, 26, 18);
      px('#8c714b', 570, 349, 17, 2); px('#8c714b', 570, 355, 14, 2);
    }
  } else if (scene === 2) {
    rect('#101b32', 0, 0, W, 432);
    for (let i = 0; i < 44; i++) px(i % 4 === 0 ? '#b9c9de' : '#7485a5', (i * 197 + 31) % W, 25 + (i * 73) % 310, 3, 3);
    px('#c3c6b5', 770, 70, 54, 54); px('#101b32', 754, 62, 50, 50);
    const travel = t * 520;
    const courthouseX = 75 - travel * 0.35;
    if (courthouseX > -210) {
      px('#283248', courthouseX, 260, 196, 132); px('#46516a', courthouseX + 15, 245, 166, 18);
      px('#1b2437', courthouseX + 24, 298, 26, 94); px('#1b2437', courthouseX + 84, 298, 26, 94);
      px('#1b2437', courthouseX + 144, 298, 26, 94);
    }
    const prisonX = 830 - travel * 0.86;
    if (prisonX > -180) {
      px('#30384a', prisonX, 222, 142, 198); px('#45516a', prisonX + 18, 203, 106, 20);
      px('#161f31', prisonX + 48, 292, 46, 128); px('#9ba8ba', prisonX + 58, 282, 5, 138);
      px('#9ba8ba', prisonX + 78, 282, 5, 138);
    }
    rect('#242b38', 0, 432, W, 112);
    for (let x = -80; x < W + 80; x += 110) {
      const markX = ((x - travel * 1.8) % 110 + 110) % 110;
      px('#b69a69', markX, 478, 48, 5);
    }
    px('#171d2b', 0, 428, W, 8);
    const carriageX = 332, roadY = 428;
    for (const wheelX of [carriageX + 44, carriageX + 212]) {
      px('#11151e', wheelX - 20, roadY - 38, 40, 40);
      px('#657087', wheelX - 14, roadY - 32, 28, 28);
      px('#c2a15d', wheelX - 3, roadY - 21, 7, 7);
      const spin = Math.floor(time / 8) % 2;
      if (spin) { px('#a7aeb8', wheelX - 2, roadY - 30, 4, 26); px('#a7aeb8', wheelX - 13, roadY - 19, 26, 4); }
      else { px('#a7aeb8', wheelX - 2, roadY - 31, 4, 28); px('#a7aeb8', wheelX - 13, roadY - 20, 26, 4); }
    }
    groundShadow(carriageX + 124, roadY, 148, 0.5);
    px('#3a2b31', carriageX + 8, 380, 254, 34);
    px('#9b754b', carriageX + 5, 375, 260, 10);
    px('#3d4658', carriageX + 20, 252, 238, 128); px('#182235', carriageX + 30, 264, 218, 112);
    px('#8591a5', carriageX + 17, 246, 244, 10); px('#53627b', carriageX + 22, 251, 235, 8);
    px('#39445a', carriageX + 28, 266, 218, 5);
    // Im Wagen laufen die Figuren auf dem Bodenbrett; die Gitterstäbe liegen davor.
    groundShadow(carriageX + 123, 376, 28, 0.35);
    drawGoblin(carriageX + 113, 375, 0.82, {
      face: 1, phase: Math.floor(time / 5), run: 0.32, air: 0, act: 0, land: 0, t: time
    });
    drawGuard(carriageX + 197, 375, 0.78, {
      face: -1, phase: Math.floor(time / 6), t: time, alert: false
    });
    for (let x = carriageX + 28; x < carriageX + 251; x += 24) {
      px('#a2adbd', x, 264, 5, 113); px('#505d74', x + 5, 264, 2, 113);
    }
    px('#a2adbd', carriageX + 26, 263, 226, 5); px('#a2adbd', carriageX + 26, 374, 226, 5);
    px('#b69a69', carriageX + 118, 318, 12, 28);
    px('#222a3a', carriageX + 122, 325, 4, 4);
  } else {
    const floorY = 430;
    rect('#202a3c', 0, 0, W, floorY);
    for (let y = 0; y < floorY; y += 24) for (let x = (y / 24 % 2 ? -16 : 0); x < W; x += 48) {
      px('#2d394e', x + 1, y + 1, 46, 22);
      px('#182133', x, y, 48, 2); px('#182133', x, y, 2, 24);
      if ((x + y) % 7 === 0) px('#465366', x + 8, y + 7, 7, 3);
    }
    rect('#161f31', 0, floorY, W, H - floorY);
    for (let x = 0; x < W; x += 32) {
      px('#303e53', x, floorY, 32, 34); px('#1b2637', x, floorY, 32, 3);
      px('#273448', x + 4, floorY + 19, 20, 2);
    }
    // Angekommener Gefängniswagen, mit Rädern und einer Rampe bis auf den Boden.
    for (const wheelX of [106, 224]) {
      px('#11151e', wheelX - 18, 390, 36, 36); px('#657087', wheelX - 12, 396, 24, 24);
      px('#c2a15d', wheelX - 3, 405, 6, 6);
    }
    groundShadow(166, floorY, 118, 0.45);
    px('#3a2b31', 74, 344, 188, 54); px('#9b754b', 70, 338, 196, 10);
    px('#3d4658', 82, 275, 172, 65); px('#182235', 90, 282, 156, 56);
    px('#8a97aa', 80, 271, 174, 8);
    for (let x = 94; x < 247; x += 22) px('#a2adbd', x, 281, 4, 58);
    for (let i = 0; i < 8; i++) {
      const x = 230 + i * 8, y = 377 + i * 6;
      px('#77553c', x, y, 10, 7); px('#392c30', x, y + 7, 10, 3);
    }

    // Zelle mit offener Tür; die Schiebetür schließt erst, nachdem der Goblin eingetreten ist.
    px('#353f52', 580, 245, 316, 12); px('#353f52', 580, 418, 316, 12);
    px('#4e5b70', 602, 257, 12, 161); px('#4e5b70', 872, 257, 12, 161);
    for (const x of [622, 644, 732, 754, 776, 798, 820, 842, 864]) px('#8792a4', x, 264, 5, 148);
    px('#5a667a', 602, 257, 280, 5); px('#5a667a', 602, 409, 280, 5);

    let heroX, heroY, run;
    if (t < 0.2) {
      const down = ease(t / 0.2);
      heroX = 205 + 65 * down; heroY = 376 + 50 * down; run = 0.48;
    } else if (t < 0.7) {
      const walk = ease((t - 0.2) / 0.5);
      heroX = 270 + 350 * walk; heroY = floorY; run = 0.56;
    } else if (t < 0.84) {
      const enter = ease((t - 0.7) / 0.14);
      heroX = 620 + 126 * enter; heroY = floorY; run = 0.4;
    } else {
      heroX = 746; heroY = floorY; run = 0;
    }
    const wardenX = 438 + 92 * ease(t / 0.56);
    groundShadow(heroX, heroY + 1, 13, 0.46);
    drawGoblin(heroX, heroY, 0.88, {
      face: 1, phase: Math.floor(time / 4), run, air: 0, act: 0, land: 0, t: time
    });
    groundShadow(wardenX, floorY, 13, 0.4);
    drawGuard(wardenX, floorY, 0.82, {
      face: -1, phase: Math.floor(time / 5), t: time, alert: false
    });

    const doorX = 570 + 74 * ease((t - 0.82) / 0.12);
    for (let x = doorX; x < doorX + 54; x += 13) px('#a2adbd', x, 264, 5, 148);
    px('#9ba8ba', doorX - 4, 259, 64, 5); px('#9ba8ba', doorX - 4, 408, 64, 5);
    px('#e8bb5a', doorX + 36, 325, 12, 12); px('#fff0ad', doorX + 40, 329, 4, 4);
  }

  // Kurze Schwarzblende statt eines unvermittelten Szenensprungs.
  const fadeFrames = 20;
  const fadeIn = 1 - clamp01(introElapsed / fadeFrames);
  const fadeOut = clamp01((introElapsed - (INTRO_SCENES[scene].duration - fadeFrames)) / fadeFrames);
  const fade = Math.max(fadeIn, fadeOut);
  if (fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + fade + ')'; ctx.fillRect(0, 0, W, H); }
}

// ---------- 13. Menüs, Eingaben, Optionen ----------
const SCREENS = ['menu', 'intro', 'options', 'pause', 'win'];
function show(id) { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id)); }

function openMenu() {
  state = 'menu'; $('hud').classList.add('hidden'); $('toast').classList.add('hidden');
  worldCols = LEVELS[0].cols; worldWidth = worldCols * TILE; cameraX = 0;
  grid = LEVELS[0].grid.map(row => row.slice()); parts = []; buildStatic();   // Hintergrund für die Menü-Szene
  $('btnContinue').disabled = !save.started; show('menu');
}

let optionsFrom = 'menu';
const actions = {
  play() {
    if (save.started && !confirm('Neues Spiel starten? Dein Fortschritt wird gelöscht.')) return;
    let seed = Math.floor(Math.random() * 0x100000000);
    if (seed === save.seed) seed = (seed + 1) >>> 0;
    save = { started: true, level: 0, unlocked: 0, cp: null, seed, introSeen: false };
    LEVELS = buildLevels(seed);
    writeSave(); startIntro();
  },
  continue() { loadLevel(Math.min(save.level, LEVELS.length - 1), true); startPlaying(); },
  introNext() { advanceIntro(); },
  introSkip() { finishIntro(); },
  options() { optionsFrom = state === 'pause' ? 'pause' : 'menu'; show('options'); state = 'options'; },
  optionsBack() { state = optionsFrom; show(optionsFrom); },
  quit() { window.close(); toast('Schließe einfach diesen Tab, um das Spiel zu verlassen.'); },
  fullscreen() { document.fullscreenElement ? document.exitFullscreen() : $('wrap').requestFullscreen(); },
  resume() { show(null); state = 'play'; },
  restart() { loadLevel(lvl, true); show(null); state = 'play'; },
  next() { loadLevel(lvl + 1, false); startPlaying(); },
  toMenu() { openMenu(); }
};

document.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  audio(); actions[btn.dataset.action](); sfx(500, 0.06);
  btn.blur();                                   // damit die Leertaste keinen Button auslöst
});

function pause() { state = 'pause'; show('pause'); }

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (state === 'intro') {
    if ([' ', 'enter', 'escape'].includes(k)) e.preventDefault();
    if (k === 'escape') actions.introSkip();
    else if (k === ' ' || k === 'enter') actions.introNext();
    return;
  }
  if (['arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'a' || k === 'arrowleft') keys.left = true;
  if (k === 'd' || k === 'arrowright') keys.right = true;
  if (k === ' ') keys.jump = true;
  if (k === 'e' && !e.repeat) { keys.interact = true; if (state === 'play') interact(); }
  if (k === 'e') keys.interact = true;
  if (k === 'escape') {
    if (state === 'play') pause();
    else if (state === 'pause') actions.resume();
    else if (state === 'options') actions.optionsBack();
  }
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') keys.left = false;
  if (k === 'd' || k === 'arrowright') keys.right = false;
  if (k === ' ') keys.jump = false;
  if (k === 'e') keys.interact = false;
});
addEventListener('blur', () => { Object.keys(keys).forEach(k => keys[k] = false); if (state === 'play') pause(); });

// Optionen anzeigen, ändern und speichern
function applySettings() {
  $('optVolume').value = settings.volume; $('optMusic').checked = settings.music;
  $('optSfx').checked = settings.sfx; $('optSize').value = settings.size;
  if (master) master.gain.value = settings.volume / 100;
  $('wrap').style.width = settings.size === 'auto' ? 'min(100vw, 176vh)' : 'min(100vw, ' + settings.size + 'px)';
}
$('optVolume').addEventListener('input', e => { settings.volume = +e.target.value; audio(); applySettings(); writeSettings(); sfx(500, 0.05); });
$('optMusic').addEventListener('change', e => { settings.music = e.target.checked; audio(); writeSettings(); });
$('optSfx').addEventListener('change', e => { settings.sfx = e.target.checked; audio(); writeSettings(); sfx(500, 0.05); });
$('optSize').addEventListener('change', e => { settings.size = e.target.value; applySettings(); writeSettings(); e.target.blur(); });

// ---------- 13. Hauptschleife (feste 60 Schritte pro Sekunde) ----------
let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(now - last, 100); last = now;
  while (acc >= 1000 / 60) {
    if (state === 'play') update();
    else if (state === 'intro') {
      time++; introElapsed++; updateParts();
      if (introElapsed >= INTRO_SCENES[introStage].duration) advanceIntro();
    }
    else if (state === 'menu' || state === 'options') { time++; updateParts(); }
    acc -= 1000 / 60;
  }
  if (state === 'intro') drawIntroScene();
  else if (state === 'play' || state === 'pause' || state === 'win') draw();
  else drawMenuScene();
  requestAnimationFrame(loop);
}

buildVignette();
applySettings();
openMenu();
requestAnimationFrame(loop);
