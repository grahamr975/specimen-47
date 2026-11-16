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

const STATUS = {
  bleed: { // ticks damage and drips; a bled-out kill can feed you (Leech Spitter)
    tick(e, st, dt) {
      damageEnemy(e, (st.dps || 0) * dt, 0, 0, true);
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
    draw(ctx, e) { if (Math.floor(game.time * 8) % 2) drawText(ctx, '*', e.x, e.y - 12, PAL.yellow, 1, 'center'); },
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
    draw(ctx, e) { // a red reticle
      const r = e.r + 3 + (Math.floor(game.time * 6) % 2);
      ctx.fillStyle = PAL.red;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.fillRect(Math.round(e.x + sx * r) - (sx > 0 ? 1 : 0), Math.round(e.y + sy * r), 2, 1);
        ctx.fillRect(Math.round(e.x + sx * r), Math.round(e.y + sy * r) - (sy > 0 ? 1 : 0), 1, 2);
      }
    },
  },
  corrode: { dmgTaken: () => 1.5 }, // Corrode: eaten by your gas
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

function drawStatuses(ctx, t) {
  if (t.status && !t.dead) for (const id in t.status) { const st = t.status[id], f = STATUS[id].draw; if (st.t > 0 && f) f(ctx, t, st); }
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
