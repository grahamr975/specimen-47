// --- Status effects --------------------------------------------------------------------------
// Bleeding, stuns, webs, marks... every lingering effect on an enemy (or on you)
// is an entry in STATUS. Code never touches the timers directly: it calls
// inflict() to apply one and hasStatus() to ask, and this file does the rest
// (counting down, ticking damage, slowing, changing damage taken, kill hooks,
// and drawing).
//
// A status entry can have:
//   boss       how long it lasts on a boss, as a fraction (0 = bosses are immune). Default 1.
//   tick(t, st, dt)        every frame while it lasts
//   moveMul               multiplies movement while it lasts
//   blocksAI              the target can't act at all (stun)
//   noShoot               the target can't shoot
//   dmgTaken(st, ps, t)   multiplies damage the target takes (ps = your stats)
//   onKill(e, st, p, s)   when something dies with it
//   draw(ctx, t, st)      drawn over the darkness, above the target
//
// An active status is { t: seconds left, ...magnitudes } in target.status[id].
// Applying one again keeps the larger of each value (it never weakens it).

// Fungal's verb: what your bile and gas do to whatever stands in them.
const CORRODE_MUL = 0.25, CORRODE_DPS = 0.6;
function corrodeOpts(s) { return { t: 1.2, mul: s.corrodeMul || CORRODE_MUL, dps: (s.corrodeDps || CORRODE_DPS) * s.damage }; }

const STATUS = {
  bleed: { // ticks damage and drips; a bled-out kill can feed you (Leech Spitter)
    tick(e, st, dt) {
      damageEnemy(e, (st.dps || 0) * dt, 0, 0, true); dotFlash(e, 'bleed');
      if (Math.random() < dt * 8) stainPx(e.x + rand(-3, 3), e.y + rand(0, 4), ENEMY_TYPES[e.type].fluid);
    },
    dmgTaken: (st, ps) => 1 + (ps.anticoag || 0), // Anticoagulant
    onKill(e, st, p, s) {
      if (s.leechFeed && Math.random() < s.leechFeed) healPlayer(1);
      for (let i = 0; i < (s.leechBrood || 0); i++) spawnAlly('maggot', e.x + rand(-3, 3), e.y + rand(-3, 3));
    },
  },
  stun: { // can't move, think or shoot
    boss: 0.3, blocksAI: true,
    dmgTaken: (st, ps) => ps.stunBreak ? 2 : 1, // Shatter Scream

  },
  slow: { // sticky: half speed, dripping
    moveMul: 0.5,
    tick(e, st, dt) { if (Math.random() < dt * 6) stainPx(e.x + rand(-2, 2), e.y + rand(1, 3), ['#3c4238', '#5a6a52'], 1); },
  },
  web: { // stuck in silk (or roots, or jelly); a boss tears free
    boss: 0, moveMul: 0.12,
    onKill(e, st, p, s) { // Cocoon Wrap
      if (!s.webBrood) return;
      for (let i = 0; i < s.webBrood; i++) spawnAlly('spiderling', e.x + rand(-3, 3), e.y + rand(-3, 3));
      floatText(e.x, e.y - 10, 'WRAPPED', '#e0d8d0');
    },
  },
  blind: { // can't see you: wanders, doesn't shoot (see enemyTarget)
    noShoot: true,
    dmgTaken: (st, ps) => 1 + (ps.allergen || 0), // Allergen
    onKill(e, st, p, s) { if (s.hivesCloud) spawnCloud(e.x, e.y, 14); }, // Hives
  },
  mark: { // Mark Prey: everything hits it harder
    dmgTaken: st => 1 + (st.mul || 0.4),
    onKill(e, st, p, s) { // Evil Eye: the mark jumps to the next toughest prey nearby
      if (!s.markSpread) return;
      const next = game.enemies.filter(o => o !== e && !o.dead && o.spawnT <= 0 && !hasStatus(o, 'mark') && Math.hypot(o.x - e.x, o.y - e.y) < 120).sort((a, b) => b.hp - a.hp)[0];
      if (next) { inflict(next, 'mark', { t: 6 * (s.markTime || 1), mul: st.mul || 0.4 }); floatText(next.x, next.y - 12, 'MARKED', PAL.red); }
    },
    draw(ctx, e) { // a red reticle
      const r = e.r + 3 + (Math.floor(game.time * 6) % 2);
      ctx.fillStyle = PAL.red;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.fillRect(Math.round(e.x + sx * r) - (sx > 0 ? 1 : 0), Math.round(e.y + sy * r), 2, 1);
        ctx.fillRect(Math.round(e.x + sx * r), Math.round(e.y + sy * r) - (sy > 0 ? 1 : 0), 1, 2);
      }
    },
  },
  corrode: { // Corroded: eaten by your bile (or gas, with Corrode): takes more damage from everything, and burns a little
    dmgTaken: st => 1 + (st.mul || CORRODE_MUL),
    tick(e, st, dt) {
      damageEnemy(e, (st.dps || CORRODE_DPS) * dt, 0, 0, true); dotFlash(e, 'corrode');
      const ps = game.player.stats; // Fruiting Body: the corroded spread it to whatever they touch
      if (ps.corrodeSpread && (st.spreadT = (st.spreadT || 0) - dt) <= 0) { st.spreadT = 0.5; for (const o of enemiesNear(e.x, e.y, e.r + 6, e)) if (!hasStatus(o, 'corrode')) inflict(o, 'corrode', { t: 1, mul: st.mul, dps: st.dps }); }
    },
  },
  pollen: { // Bloom: dusted with pollen
    dmgTaken: (st, ps) => ps.pollen ? 1 + (ps.pollenMul || 0.25) : 1,
    draw(ctx, e) {
      ctx.fillStyle = '#e8d040';
      for (let k = 0; k < 3; k++) if ((Math.floor(game.time * 5) + k) % 2) ctx.fillRect(Math.round(e.x - e.r + hash2(k, 1, 3) * e.r * 2), Math.round(e.y - e.r - 1 + hash2(k, 2, 3) * e.r), 1, 1);
    },
  },
  leak: { // Caustic Tendrils / Acid Silk: it leaks burning bile as it crawls
    tick(e, st, dt) { if ((st.drip = (st.drip || 0) - dt) <= 0) { st.drip = 0.25; spawnPuddle(e.x, e.y + 2, 6, 1.8, 'player'); } },
  },
  acidMark: { // Acid Maw / Acid Skin: it bursts into bile when it dies
    onKill(e, st, p, s) {
      spawnPuddle(e.x, e.y, 16, 3, 'player');
      for (const o of enemiesNear(e.x, e.y, 22, e)) damageEnemy(o, 2 * s.damage, o.x - e.x, o.y - e.y, true);
      burst(e.x, e.y, '#b0c040', 14, 100, 0.4);
    },
  },

  // --- On you ---
  chill: { moveMul: 0.6 }, // frost: slower for a while (drawn in bodyfx)
  net: {},                 // a containment net: pinned unless you dash (player.js)
};

function inflict(t, id, opts = {}) {
  const def = STATUS[id];
  if (!def) throw new Error('unknown status ' + id);
  if (!t || t.dead) return false;
  let dur = opts.t ?? 1;
  if (t.type && ENEMY_TYPES[t.type] && ENEMY_TYPES[t.type].boss) { dur *= def.boss ?? 1; if (dur <= 0) return false; }
  const cur = (t.status ||= {})[id] ||= { t: 0 };
  for (const k in opts) if (k !== 't') cur[k] = Math.max(cur[k] ?? -Infinity, opts[k]);
  cur.t = Math.max(cur.t, dur);
  return true;
}
const statusOf = (t, id) => { const st = t.status && t.status[id]; return st && st.t > 0 ? st : null; };
const hasStatus = (t, id) => !!statusOf(t, id);
const statusT = (t, id) => { const st = statusOf(t, id); return st ? st.t : 0; }; // seconds left
function clearStatus(t, id) { if (t.status) delete t.status[id]; }
// Does any active status have this flag (blocksAI, noShoot)?
function statusFlag(t, flag) {
  if (t.status) for (const id in t.status) if (t.status[id].t > 0 && STATUS[id][flag]) return true;
  return false;
}

// Count down and tick. (Ticks can kill: check t.dead after.)
function updateStatuses(t, dt) {
  if (!t.status) return;
  for (const id in t.status) {
    const st = t.status[id], def = STATUS[id];
    if (def.tick && !t.dead) def.tick(t, st, dt);
    if ((st.t -= dt) <= 0) delete t.status[id];
  }
}

function statusMoveMul(t) {
  let m = 1;
  if (t.status) for (const id in t.status) if (t.status[id].t > 0 && STATUS[id].moveMul !== undefined) m *= STATUS[id].moveMul;
  return m;
}

function statusDamageMul(t, ps) {
  let m = 1;
  if (t.status) for (const id in t.status) { const st = t.status[id], f = STATUS[id].dmgTaken; if (st.t > 0 && f) m *= f(st, ps || {}, t); }
  return m;
}

function statusOnKill(e, p, s) {
  if (e.status) for (const id in e.status) { const st = e.status[id], f = STATUS[id].onKill; if (st.t > 0 && f) f(e, st, p, s); }
}

// --- How statuses look ------------------------------------------------------------------
// One hue tints the body at a time (prio 1: damage over time, 2: disables, 3:
// debuffs; ties go to whichever has longer left). Animations all stack. A
// damage-over-time tick flashes the body in its `dot` colour (at most ~4x a second).
const STATUS_LOOK = {
  corrode: { hue: '#9ab83a', prio: 1, dot: '#e0f8a0' }, // sickly acid green
  bleed:   { hue: '#b01828', prio: 1, dot: '#ff5060' }, // crimson
  infest:  { hue: '#a040c0', prio: 1, dot: '#e8a8ff' }, // purple: something inside
  stun:    { hue: '#e8dca0', prio: 2 },                 // washed-out pale yellow
  web:     { hue: '#e0d8d0', prio: 2 },                 // silk white
  blind:   { hue: '#4a5468', prio: 2 },                 // cold slate
  slow:    { hue: '#5a7a78', prio: 3 },                 // murky teal goo
  pollen:  { hue: '#e8c840', prio: 3 },                 // gold
};

// The hue on this enemy right now, and how strongly (fades as the status runs out).
function statusHue(e) {
  let best = null, bp = 9, bt = 0;
  const consider = (id, t) => { const L = STATUS_LOOK[id]; if (!L || t <= 0) return; if (L.prio < bp || (L.prio === bp && t > bt)) { best = L; bp = L.prio; bt = t; } };
  if (e.status) for (const id in e.status) consider(id, e.status[id].t);
  if (e.infest) consider('infest', e.infest.t || 1);
  return best && { hue: best.hue, k: Math.min(1, bt / 0.5) };
}

// A damage-over-time tick: flash the body (rate-limited so heavy bleeding doesn't strobe).
function dotFlash(e, id) {
  const L = STATUS_LOOK[id];
  if (!L || !L.dot || game.time - (e.dotFlashAt || -9) < 0.25) return;
  e.dotFlashAt = game.time; e.dotFlashColor = L.dot;
}

// A solid-colour copy of a sprite (cached per sprite and colour).
const STATUS_TINT_CACHE = new WeakMap();
function tintedSprite(img, color) {
  let m = STATUS_TINT_CACHE.get(img); if (!m) STATUS_TINT_CACHE.set(img, m = new Map());
  let c = m.get(color);
  if (!c) {
    c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    m.set(color, c);
  }
  return c;
}

// Drawn right over the body (under the darkness): the status hue, pulsing gently, and the DoT flash.
function drawStatusTint(ctx, e, img, x, y) {
  const h = statusHue(e);
  if (h) { ctx.globalAlpha = h.k * (0.38 + 0.1 * Math.sin(game.time * 5 + e.x)); drawCentered(ctx, tintedSprite(img, h.hue), x, y); }
  if (game.time - (e.dotFlashAt || -9) < 0.07) { ctx.globalAlpha = 0.85; drawCentered(ctx, tintedSprite(img, e.dotFlashColor), x, y); }
  ctx.globalAlpha = 1;
}

// The little animations around an afflicted enemy (over the darkness).
const STATUS_FX = {
  corrode(ctx, e) { // green gas curling up off it, and a bubble now and then
    for (let k = 0; k < 4; k++) {
      const ph = (game.time * 0.9 + k * 0.25) % 1, wx = e.x + Math.sin(game.time * 2.2 + k * 1.7) * (e.r * 0.8) + (k - 1.5) * 2, wy = e.y + e.r * 0.6 - ph * (e.r * 2 + 8);
      ctx.globalAlpha = 0.7 * (1 - ph); ctx.fillStyle = k % 2 ? '#9ab83a' : '#c8e070';
      ctx.fillRect(Math.round(wx), Math.round(wy), 1 + (ph < 0.5 ? 1 : 0), 1);
    }
    if (Math.floor(game.time * 3 + e.x) % 4 === 0) { ctx.globalAlpha = 0.9; ctx.fillStyle = '#e0f8a0'; ctx.fillRect(Math.round(e.x - e.r * 0.4 + hash2(Math.floor(game.time * 3), 1, 7) * e.r), Math.round(e.y - 1), 1, 1); }
    ctx.globalAlpha = 1;
  },
  bleed(ctx, e) { // drops falling off it
    ctx.fillStyle = '#c01828';
    for (let k = 0; k < 3; k++) { const ph = (game.time * 1.6 + k * 0.33) % 1; ctx.fillRect(Math.round(e.x - e.r * 0.6 + hash2(k, 2, 5) * e.r * 1.2), Math.round(e.y + e.r * 0.3 + ph * 7), 1, ph < 0.7 ? 2 : 1); }
  },
  stun(ctx, e) { // sparks circling over its head
    for (let k = 0; k < 3; k++) {
      const a = game.time * 6 + k * 2.1, sx = e.x + Math.cos(a) * (e.r * 0.8 + 2), sy = e.y - e.r - 4 + Math.sin(a) * 1.5;
      ctx.fillStyle = Math.sin(a) > 0 ? '#fff4c0' : '#c8a840'; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  },
  slow(ctx, e) { // goo sagging off the bottom
    ctx.fillStyle = '#5a7a78';
    for (let k = 0; k < 3; k++) { const len = 1 + Math.round((Math.sin(game.time * 2 + k * 2) + 1) * 1.5); ctx.fillRect(Math.round(e.x - e.r * 0.5 + k * e.r * 0.5), Math.round(e.y + e.r * 0.6), 1, len); }
  },
  web(ctx, e) { // silk strands across it
    ctx.globalAlpha = 0.8; ctx.fillStyle = '#e0d8d0';
    for (let k = -1; k <= 1; k++) for (let i = -e.r; i <= e.r; i += 2) { ctx.fillRect(Math.round(e.x + i), Math.round(e.y + k * 3 + i * 0.4), 1, 1); ctx.fillRect(Math.round(e.x + i), Math.round(e.y + k * 3 - i * 0.4), 1, 1); }
    ctx.globalAlpha = 1;
  },
  blind(ctx, e) { // a spore haze drifting across its eyes
    ctx.globalAlpha = 0.75; ctx.fillStyle = '#4a5468';
    for (let k = 0; k < 5; k++) ctx.fillRect(Math.round(e.x - e.r + ((game.time * 8 + k * 5) % (e.r * 2))), Math.round(e.y - e.r * 0.4 + (k % 2)), 2, 1);
    ctx.globalAlpha = 1;
  },
};

function drawStatuses(ctx, t) {
  if (!t.status || t.dead) return;
  for (const id in t.status) {
    const st = t.status[id];
    if (!(st.t > 0)) continue;
    if (STATUS[id].draw) STATUS[id].draw(ctx, t, st);
    if (STATUS_FX[id]) STATUS_FX[id](ctx, t, st);
  }
}

// Apply what your parts say this attack leaves behind (see onHit() in mutations.js).
function applyHitEffects(e, source, s = game.player.stats) {
  const list = s.onHit && s.onHit[source];
  if (!list || e.dead) return;
  for (const h of list) {
    if (h.chance !== undefined && Math.random() >= h.chance) continue;
    if (inflict(e, h.id, h.opts) && h.say) floatText(e.x, e.y - 10, h.say[0], h.say[1]);
  }
}

// One heal, said out loud (never past full). Returns whether it healed.
function healPlayer(n = 1, color = PAL.red) {
  const p = game.player;
  if (p.hp >= p.maxHp) return false;
  p.hp = Math.min(p.maxHp, p.hp + n);
  floatText(p.x, p.y - 14, `+${n} HP`, color);
  return true;
}
