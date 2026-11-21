'use strict';
// ---------------------------------------------------------------------------
// Bosses, special enemy behaviors, telegraphed attacks and elite affixes.
// ---------------------------------------------------------------------------

// --- Telegraphed attacks -------------------------------------------------------------
// A red warning line appears, then the attack lands along it.
function telegraphLine(x, y, angle, len, width, delay, dmg, look) {
  game.telegraphs.push({ x, y, ang: angle, len, w: width, t: delay, max: delay, dmg, look });
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

// Volatile elites leave a bomb that goes off after a short fuse.
function spawnBomb(x, y, r) {
  game.bombs.push({ x, y, r, t: 0.7 });
}

function updateBossFx(dt) {
  const p = game.player;
  for (const tg of game.telegraphs) {
    tg.t -= dt;
    if (tg.t > 0) continue;
    tg.done = true;
    const x2 = tg.x + Math.cos(tg.ang) * tg.len, y2 = tg.y + Math.sin(tg.ang) * tg.len;
    if (!tg.dmg) continue; // only a warning (the attack itself comes another way)
    if (distToSegment(p.x, p.y, tg.x, tg.y, x2, y2) < tg.w / 2 + p.r) hurtPlayer(tg.dmg);
    for (const a of game.allies) if (a.kind === 'twin' && distToSegment(a.x, a.y, tg.x, tg.y, x2, y2) < tg.w / 2 + a.r) hurtTwin(a);
    game.fx.push({ kind: 'slamline', x1: tg.x, y1: tg.y, x2, y2, t: 0.25 });
    const look = tg.look || {};
    for (let k = 0; k < 8; k++) {
      const f = k / 8;
      burst(tg.x + (x2 - tg.x) * f, tg.y + (y2 - tg.y) * f, look.color || '#8a6a70', 2, 50, 0.3);
      stainPx(tg.x + (x2 - tg.x) * f + rand(-3, 3), tg.y + (y2 - tg.y) * f + rand(-3, 3), look.fluid || FLUID.rot, 2);
    }
    game.shake = Math.max(game.shake, 4);
    Sfx.play('slam');
  }
  game.telegraphs = game.telegraphs.filter(t => !t.done);
  for (const m of game.bossMarks || []) m.t -= dt; // where lobbed shots will land
  if (game.bossMarks) game.bossMarks = game.bossMarks.filter(m => m.t > 0);

  for (const b of game.bombs) {
    b.t -= dt;
    if (b.t > 0) continue;
    b.done = true;
    if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + p.r) hurtPlayer(1);
    for (const e of game.enemies) if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < b.r + e.r) damageEnemy(e, 3, e.x - b.x, e.y - b.y, true);
    game.fx.push({ kind: 'ring', x: b.x, y: b.y, r: 4, max: b.r, t: 0.25 });
    bloodSpray(b.x, b.y, 0, 0, 20, FLUID.blood, 140);
    game.shake = Math.max(game.shake, 4);
    Sfx.play('kill');
  }
  game.bombs = game.bombs.filter(b => !b.done);
}

// Drawn above the darkness so you can always see what's coming.
function drawBossFx(ctx) {
  drawBossSweeps(ctx);
  drawBossTells(ctx); // wind-ups and landing marks
  for (const tg of game.telegraphs) {
    const x2 = tg.x + Math.cos(tg.ang) * tg.len, y2 = tg.y + Math.sin(tg.ang) * tg.len;
    const k = 1 - tg.t / tg.max;
    const n = Math.ceil(tg.len / 3);
    ctx.fillStyle = Math.floor(game.time * 16) % 2 ? '#ff2a3a' : '#8a1020';
    for (let i = 0; i <= n; i++) {
      if (i / n > k + 0.15 && i % 2) continue; // fills in as it charges
      const x = tg.x + (x2 - tg.x) * (i / n), y = tg.y + (y2 - tg.y) * (i / n);
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  for (const b of game.bombs) {
    if (Math.floor(b.t * 14) % 2) pxRing(ctx, b.x, b.y, b.r * (1 - b.t / 0.7) + 2, '#ff8040');
  }
}

// --- Floor 1 enemies ------------------------------------------------------------------
// Culture Blob: barely moves; left alone, it swells and divides.
// A culture divides ONCE. Its copy can't divide again and has no DNA worth
// harvesting, so a room of cultures can always be cleared, and never farmed.
function updateCulture(e, dt) {
  if (e.offspring || e.divided) return;
  e.growT = (e.growT || 0) + dt;
  const split = floorDef(game.depth).cultureSplit;
  if (e.growT >= split) {
    e.growT = 0;
    if (game.enemies.filter(o => !o.dead).length < 18) {
      e.divided = true;
      const a = rand(0, Math.PI * 2);
      const c = makeEnemy('culture', e.x, e.y);
      c.offspring = true; c.noDna = true;
      c.spawnT = 0; c.kx = Math.cos(a) * 140; c.ky = Math.sin(a) * 140;
      game.enemies.push(c);
      bloodSpray(e.x, e.y, 0, 0, 8, FLUID.rot, 60);
      floatText(e.x, e.y - 10, 'IT DIVIDES', '#b8969a');
      Sfx.play('splat');
    }
  }
}

// Scavenger Maggot: ignores you. It eats corpses, and the DNA with them.
// Once it's eaten enough it swells up ENGORGED and flees: kill it before it
// squeezes down a drain and it bursts with more DNA than it took.
const ENGORGE_DNA = 4;      // DNA eaten before it's full
const ENGORGE_ESCAPE = 15;  // seconds until a fat one gets away
const ENGORGE_BONUS = 1.3;  // an engorged kill pays back 130%

function updateScavenger(e, dt) {
  if (e.engorged) return fleeScavenger(e, dt);
  let best = null, bd = 9999;
  for (const c of game.room.corpses) {
    if (c.held) continue;
    const d = Math.hypot(c.x - e.x, c.y - e.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) {
    if (!e.wander || Math.hypot(e.wander.x - e.x, e.wander.y - e.y) < 6) e.wander = randomFloorSpot(game.room, null, 0);
    const dx = e.wander.x - e.x, dy = e.wander.y - e.y, d = Math.hypot(dx, dy) || 1;
    return [dx / d * e.speed * 0.5, dy / d * e.speed * 0.5];
  }
  if (bd < 6) {
    e.eatT = (e.eatT || 0) + dt;
    best.shake = 0.1;
    if (Math.random() < dt * 6) bloodSpray(best.x, best.y, 0, 0, 1, best.fluid, 30);
    if (e.eatT > 1.6) {
      e.eatT = 0;
      best.dead = true;
      game.room.corpses = game.room.corpses.filter(c => !c.dead);
      stain(best.x, best.y + 1, best.r, best.fluid);
      e.ate = (e.ate || 0) + best.dna;
      Sfx.play('chomp');
      if (e.ate >= ENGORGE_DNA) engorge(e);
      else floatText(best.x, best.y - 8, 'IT FEEDS', PAL.slate);
    }
    return [0, 0];
  }
  e.eatT = 0;
  return [(best.x - e.x) / bd * e.speed, (best.y - e.y) / bd * e.speed];
}

function engorge(e) {
  e.engorged = true;
  e.fleeT = ENGORGE_ESCAPE;
  e.r = 6;
  e.maxHp = e.hp = 4 * (1 + (game.depth - 1) * 0.3); // a fat, tougher sack
  e.speed *= 1.35;                                    // panicked
  bloodSpray(e.x, e.y, 0, 0, 6, FLUID.bile, 50);
  floatText(e.x, e.y - 10, 'ENGORGED', VIAL_COLOR);
  Sfx.play('gulp');
}

// Engorged: run from the specimen, then slip down a drain.
function fleeScavenger(e, dt) {
  const p = game.player;
  e.fleeT -= dt;
  if (Math.random() < dt * 4) stainPx(e.x + rand(-2, 2), e.y + rand(1, 3), ['#6a2a44', '#3a0e22'], 1); // leaking DNA
  if (e.fleeT <= 0) {
    // Gone: down the drain with everything it ate.
    e.dead = true;
    burst(e.x, e.y, '#3a3230', 12, 60);
    floatText(e.x, e.y - 10, 'IT GOT AWAY', COST_COLOR);
    Sfx.play('splat');
    return [0, 0];
  }
  let dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
  if (d > 110) return [Math.sin(e.t * 3) * 10, Math.cos(e.t * 2) * 10]; // far enough: catch its breath
  // Away from you, curving along walls instead of cowering in a corner.
  const side = Math.sin(e.t * 0.7) > 0 ? 1 : -1;
  let vx = dx / d + (-dy / d) * 0.6 * side, vy = dy / d + (dx / d) * 0.6 * side;
  if (e.x < TILE * 2 || e.x > ROOM_PX_W - TILE * 2) vx *= 0.3;
  if (e.y < TILE * 2 || e.y > ROOM_PX_H - TILE * 2) vy *= 0.3;
  const l = Math.hypot(vx, vy) || 1;
  return [vx / l * e.speed, vy / l * e.speed];
}

// --- Bosses --------------------------------------------------------------------------
const BOSSES = {
  mother:   { title: 'THE MOTHER CULTURE',   sub: 'Failed attempt no. 1',       dead: 'THE MOTHER IS DEAD',     deadSub: 'Her core is still beating' },
  colossus: { title: 'THE THAWING COLOSSUS', sub: 'Cold storage, unit 9',       dead: 'THE COLOSSUS SHATTERS',  deadSub: 'Something still beats inside the ice' },
  biotank:  { title: 'SPECIMEN ZERO',        sub: 'Weaponized. Unstable.',      dead: 'SPECIMEN ZERO IS DOWN',  deadSub: 'Its core is still pumping' },
  archive:  { title: 'THE ARCHIVE',          sub: 'Every sample, all at once',  dead: 'THE ARCHIVE IS ERASED',  deadSub: 'One sample survives: its core' },
  director: { title: 'THE DIRECTOR',         sub: 'He made you',                dead: 'THE DIRECTOR IS DEAD',   deadSub: 'Nothing is left to stop you. Go deeper.' },
};

function spawnBoss(id) {
  const e = spawnEnemy(id, ROOM_PX_W / 2, ROOM_PX_H / 2 - 8);
  e.spawnT = 1.4;
  e.birthT = 3; e.slamT = 2.5;
  game.banner = { text: BOSSES[id].title, sub: BOSSES[id].sub, color: PAL.red, t: 3 };
  game.bossName = BOSSES[id].title; game.bossId = id;
  game.bossMax = e.maxHp;
  Sfx.play('scream');
}

function livingBossParts() {
  return game.enemies.filter(e => !e.dead && isBoss(e));
}

// The Mother Culture: births blobs, slams tendrils, and at half health splits in three.
function updateMother(e, dt, p) {
  e.birthT -= dt; e.slamT -= dt;
  const cultures = game.enemies.filter(o => !o.dead && o.type === 'culture').length;
  if (e.birthT <= 0) {
    e.birthT = rand(4, 5.5);
    if (cultures < 6) {
      for (const side of [-1, 1]) {
        if (Math.random() < 0.6 || side === 1) {
          const c = makeEnemy('culture', e.x + side * (e.r + 6), e.y + 6);
          c.offspring = true; c.noDna = true; // born of the boss: no farming her
          c.spawnT = 0.3; c.kx = side * 120;
          game.enemies.push(c);
        }
      }
      bloodSpray(e.x, e.y + 10, 0, 1, 14, FLUID.rot, 90);
      Sfx.play('hatch');
    }
  }
  if (e.slamT <= 0) {
    e.slamT = rand(2, 2.8);
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    telegraphLine(e.x, e.y, a, 170, 10, 0.75, 1);
    if (Math.random() < 0.5) telegraphLine(e.x, e.y, a + rand(0.5, 0.8) * (Math.random() < 0.5 ? -1 : 1), 170, 10, 0.95, 1);
  }
  if (e.hp <= e.maxHp * 0.5) splitMother(e);
  return [0, 0];
}

function splitMother(e) {
  e.dead = true; // not a kill: she becomes three
  bloodSpray(e.x, e.y, 0, 0, 50, FLUID.rot, 160);
  gibs(e.x, e.y, 12, ['#b8969a', '#8a6a70', '#5a4048'], FLUID.rot);
  stain(e.x, e.y, 16, FLUID.rot);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rand(-0.3, 0.3);
    const m = makeEnemy('motherling', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10);
    m.hp = m.maxHp = e.maxHp * 0.3;
    m.spawnT = 0; m.kx = Math.cos(a) * 220; m.ky = Math.sin(a) * 220;
    m.slamT = rand(1.5, 3); m.birthT = rand(5, 9);
    game.enemies.push(m);
  }
  game.bossMax = e.maxHp * 0.9;
  game.banner = { text: 'SHE DIVIDES', sub: 'Kill them close together', color: PAL.red, t: 2.2 };
  game.shake = 6;
  Sfx.play('splice');
}

function updateMotherling(e, dt, p) {
  e.slamT -= dt; e.birthT -= dt;
  // A dead sister gets reabsorbed unless you finish the rest quickly.
  if (e.reabsorbT > 0) {
    e.reabsorbT -= dt;
    if (e.reabsorbT <= 0) {
      e.hp = e.maxHp;
      floatText(e.x, e.y - 14, 'IT REABSORBS ITS SISTER', '#b8969a');
      burst(e.x, e.y, '#b8969a', 16, 80);
      Sfx.play('gulp');
    }
  }
  if (e.slamT <= 0) {
    e.slamT = rand(2.4, 3.4);
    telegraphLine(e.x, e.y, Math.atan2(p.y - e.y, p.x - e.x), 120, 8, 0.7, 1);
  }
  if (e.birthT <= 0) {
    e.birthT = rand(7, 10);
    if (game.enemies.filter(o => !o.dead && o.type === 'culture').length < 5) {
      const c = makeEnemy('culture', e.x, e.y + 8); c.offspring = true; c.noDna = true; c.spawnT = 0.3; game.enemies.push(c);
    }
  }
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
  return [dx / d * e.speed, dy / d * e.speed];
}

// Called from killEnemy for anything with `boss: true`.
function onBossPartKilled(e) {
  const rest = livingBossParts().filter(o => o !== e);
  if (e.type === 'motherling') for (const o of rest) if (!(o.reabsorbT > 0)) o.reabsorbT = 4;
  if (rest.length) return;
  // The boss is dead.
  game.bossName = null;
  const B = BOSSES[game.bossId] || BOSSES.mother;
  game.banner = { text: B.dead, sub: B.deadSub, color: PAL.lime, t: 3.2 };
  for (let i = 0; i < 8; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(40, 110);
    game.room.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0 });
  }
  spawnPickup('core', ROOM_PX_W / 2 + 34, ROOM_PX_H / 2);
  game.shake = 8;
}

function drawBossBar(ctx) {
  if (!game.bossName) return;
  const parts = livingBossParts();
  if (!parts.length) return;
  const hp = parts.reduce((t, e) => t + Math.max(0, e.hp), 0);
  const w = 200, x = (VIEW_W - w) / 2, y = ROOM_Y + VIEW_ROOM_H - 14;
  drawText(ctx, game.bossName, VIEW_W / 2, y - 8, PAL.red, 1, 'center');
  ctx.fillStyle = '#0b080a'; ctx.fillRect(x - 1, y - 1, w + 2, 6);
  ctx.fillStyle = '#3a0608'; ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = PAL.red; ctx.fillRect(x, y, Math.round(w * clamp(hp / game.bossMax, 0, 1)), 4);
  ctx.fillStyle = '#e86a6a'; ctx.fillRect(x, y, Math.round(w * clamp(hp / game.bossMax, 0, 1)), 1);
}

// --- Elite affixes ----------------------------------------------------------------------
const AFFIXES = {
  splitting: 'SPLITTING', shielded: 'SHIELDED', vampiric: 'VAMPIRIC',
  hasted: 'HASTED', volatile: 'VOLATILE', mutated: 'MUTATED',
};

function rollAffixes(e) {
  const n = game.depth >= 7 ? 3 : game.depth >= 4 ? 2 : 1; // more affixes the deeper you go
  const pool = Object.keys(AFFIXES);
  e.affixes = [];
  while (e.affixes.length < n) {
    const a = pick(pool);
    if (!e.affixes.includes(a)) e.affixes.push(a);
  }
  if (e.affixes.includes('hasted')) e.speed *= 1.25; // (was x1.5: they ran you down)
  if (e.affixes.includes('mutated')) {
    e.mut = pick(['spines', 'wings', 'shell']);
    if (e.mut === 'wings') { e.flying = true; e.speed *= 1.3; }
  }
}

const hasAffix = (e, a) => e.affixes && e.affixes.includes(a);

// Per-frame affix behavior (called from updateEnemies).
function updateAffixes(e, dt) {
  if (!e.affixes) return;
  if (e.shieldT > 0) e.shieldT -= dt;
  if (hasAffix(e, 'hasted')) {
    e.timer -= dt * 0.3; // attacks come a little faster too
    if (Math.random() < dt * 20) game.particles.push({ x: e.x - 2, y: e.y - 2, vx: 0, vy: 0, life: 0.1, color: '#5a2028', size: 4 });
  }
  if (e.mut === 'spines') {
    e.spineT = (e.spineT === undefined ? 3 : e.spineT) - dt;
    if (e.spineT <= 0) {
      e.spineT = 3.5;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, r: 2, team: 'enemy', kind: 'enemy', life: 2, color: PAL.red });
      }
      Sfx.play('spine');
    }
  }
  if (hasAffix(e, 'vampiric')) {
    e.feedT = (e.feedT || 0) - dt;
    if (e.feedT <= 0) {
      e.feedT = 2;
      const c = game.room.corpses.find(k => !k.held && Math.hypot(k.x - e.x, k.y - e.y) < 30);
      if (c) {
        c.dead = true;
        game.room.corpses = game.room.corpses.filter(k => !k.dead);
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3);
        floatText(e.x, e.y - 12, 'IT FEEDS', PAL.red);
        bloodSpray(c.x, c.y, e.x - c.x, e.y - c.y, 10, c.fluid, 90);
      }
    }
  }
}

// Returns the damage after affixes; 0 means fully blocked.
function affixDamage(e, dmg) {
  if (!e.affixes) return dmg;
  if (hasAffix(e, 'shielded') && !(e.shieldT > 0) && dmg >= 0.3) {
    e.shieldT = 3;
    game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r + 2, max: e.r + 6, t: 0.2 });
    Sfx.play('clank');
    return 0;
  }
  if (e.mut === 'shell') dmg *= 0.5;
  return dmg;
}

function onAffixDeath(e) {
  if (!e.affixes) return;
  if (hasAffix(e, 'volatile')) spawnBomb(e.x, e.y, 28);
  if (hasAffix(e, 'splitting')) {
    for (const side of [-1, 1]) {
      const c = makeEnemy(e.type, e.x + side * 4, e.y);
      c.hp = c.maxHp = e.maxHp * 0.3;
      c.spawnT = 0; c.kx = side * 130;
      game.enemies.push(c);
    }
  }
}

// --- Floor bosses 2-5 ------------------------------------------------------------------------
// Each has two phases: at half health it changes (and says so).
function bossPhase(e, flag, banner, onTurn) {
  if (e[flag] || e.hp > e.maxHp * 0.5) return !!e[flag];
  e[flag] = true;
  game.banner = Object.assign({ color: PAL.red, t: 2.4 }, banner);
  game.shake = Math.max(game.shake, 6);
  Sfx.play('splice');
  if (onTurn) onTurn();
  return true;
}
// A minion born of a boss: no DNA, no farming.
function bossMinion(type, x, y) {
  const m = makeEnemy(type, x, y); m.offspring = true; m.noDna = true; m.spawnT = 0.4;
  game.enemies.push(m); return m;
}
const countAlive = type => game.enemies.filter(o => !o.dead && o.type === type).length;

// Cryo Wing: THE THAWING COLOSSUS. Fans of ice spikes and frost breath; at
// half health the ice cracks, it starts walking, and Frostbitten break free.
function updateColossus(e, dt, p) {
  const ph2 = bossPhase(e, 'thawed', { text: 'THE ICE CRACKS', sub: 'It can move now', color: '#a0e0ff' }, () => {
    startWindup(e, 'ring', 0.8, 0); // it swells, then the ice bursts off it (see tickWindup)
  });
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  if (tickWindup(e, dt)) return [0, 0]; // winding up: it stops and shows you where
  if ((e.atkT = (e.atkT ?? 2) - dt) <= 0) {
    e.atkT = ph2 ? rand(1.5, 2.1) : rand(2.1, 2.7);
    if (Math.random() < 0.5) { // ice spikes: a fan of telegraphed lines
      for (const off of ph2 ? [-0.5, -0.25, 0, 0.25, 0.5] : [-0.35, 0, 0.35]) telegraphLine(e.x, e.y, a + off, 185, 9, 0.8, 1, ICE_LOOK);
    } else startWindup(e, 'breath', ph2 ? 0.5 : 0.65, a); // frost breath: it inhales, the cone frosts over, then it breathes
  }
  if (!ph2) return [0, 0];
  if ((e.spawnFT = (e.spawnFT ?? 3) - dt) <= 0) { e.spawnFT = 7; if (countAlive('frostbitten') < 3) { bossMinion('frostbitten', e.x + rand(-20, 20), e.y + 18); floatText(e.x, e.y - 20, 'IT SHEDS', '#a0e0ff'); } }
  return [Math.cos(a) * 24, Math.sin(a) * 24];
}
const ICE_LOOK = { color: '#a0e0ff', fluid: ['#4a7aa0', '#8ab8d8', '#d8f0ff'] };

// Bio-Weapons: SPECIMEN ZERO. Acid mortars, telegraphed charges, Gas
// Bloaters; at half health its tanks rupture and it gets faster.
function updateBiotank(e, dt, p) {
  const ph2 = bossPhase(e, 'ruptured', { text: 'IT RUPTURES', sub: 'Its tanks are leaking', color: '#c0e040' }, () => {
    e.speed *= 1.4; for (let k = 0; k < 4; k++) spawnPuddle(e.x + rand(-30, 30), e.y + rand(-20, 20), 14, 6, 'enemy');
  });
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  if (ph2 && Math.random() < dt * 2) spawnPuddle(e.x + rand(-8, 8), e.y + 10, 7, 3, 'enemy'); // leaking
  if (e.state === 'aim') { if ((e.aimT -= dt) <= 0) { e.state = 'charge'; e.timer = 0.6; Sfx.play('ram'); } return [0, 0]; }
  if (e.state === 'charge') { if (e.timer <= 0) e.state = 'move'; return [e.dirX * 260, e.dirY * 260]; }
  if ((e.atkT = (e.atkT ?? 2.5) - dt) <= 0) {
    e.atkT = ph2 ? rand(1.7, 2.3) : rand(2.5, 3.1);
    if (Math.random() < 0.55) { // mortar: lobbed acid around where you stand
      for (let i = 0; i < (ph2 ? 5 : 3); i++) {
        const tx = p.x + (i ? rand(-34, 34) : 0), ty = p.y + (i ? rand(-26, 26) : 0), fl = clamp(Math.hypot(tx - e.x, ty - e.y) / 90, 0.5, 1.4);
        spawnBullet({ x: e.x, y: e.y - 6, vx: (tx - e.x) / fl, vy: (ty - e.y) / fl, r: 3, team: 'enemy', kind: 'glob', life: fl, maxLife: fl, color: PAL.lime });
        markLanding(tx, ty, fl, PAL.lime); // (a ring where it comes down)
      }
      Sfx.play('enemyShot');
    } else { // a charge, telegraphed first
      e.state = 'aim'; e.aimT = 0.75; e.dirX = ux; e.dirY = uy;
      telegraphLine(e.x, e.y, Math.atan2(uy, ux), 180, 22, 0.75, 0, { color: '#c0e040' });
    }
  }
  if ((e.minionT = (e.minionT ?? 5) - dt) <= 0) { e.minionT = ph2 ? 6 : 8; if (countAlive('bloater') < 3) for (const s of [-1, 1]) bossMinion('bloater', e.x + s * 20, e.y); }
  return [ux * e.speed * 0.6, uy * e.speed * 0.6];
}

// Gene Bank: THE ARCHIVE. Bursts of spiraling bullets and packs of Clones;
// at half health it rewrites itself: a faster spiral, and a Chimera.
function updateArchive(e, dt, p) {
  const ph2 = bossPhase(e, 'rewritten', { text: 'IT REWRITES ITSELF', sub: 'A new sample crawls out', color: '#e8a0b8' }, () => bossMinion('chimera', e.x, e.y + 22));
  e.spinA = (e.spinA || 0) + dt * (ph2 ? 1.7 : 1.1);
  e.patT = (e.patT ?? 3) + dt; // (starts in a lull: even its first burst gets the tell)
  { const w = e.patT % 5; e.charging = w > 4.2 ? (w - 4.2) / 0.8 : 0; if (w > 4.2 && !e.chargeSounded) { e.chargeSounded = true; Sfx.play('chargeFull'); } if (w < 4.2) e.chargeSounded = false; } // it flares before it spins
  if (e.patT % 5 < 3 && (e.fireT = (e.fireT ?? 0.5) - dt) <= 0) { // spiral bursts: three seconds on, two off
    e.fireT = ph2 ? 0.17 : 0.24;
    const arms = ph2 ? 4 : 3;
    for (let k = 0; k < arms; k++) { const a = e.spinA + k * Math.PI * 2 / arms; spawnBullet({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * 82, vy: Math.sin(a) * 82, r: 2, team: 'enemy', kind: 'enemy', life: 2.8, color: '#e8a0b8' }); }
    if (Math.random() < 0.3) Sfx.play('enemyShot');
  }
  if ((e.cloneT = (e.cloneT ?? 4) - dt) <= 0) {
    e.cloneT = ph2 ? 7 : 9;
    if (countAlive('clone') < 6) { for (let k = 0; k < 3; k++) bossMinion('clone', e.x + rand(-24, 24), e.y + 24 + rand(-4, 4)); floatText(e.x, e.y - 24, 'COPIES', '#e8a0b8'); Sfx.play('hatch'); }
  }
  return [0, 0];
}

// Director's Wing: THE DIRECTOR. Sweeping lasers, aimed volleys, security
// on call; at half health, LOCKDOWN: the room's lasers come on.
function updateDirector(e, dt, p) {
  const ph2 = bossPhase(e, 'lockdown', { text: 'LOCKDOWN', sub: 'He seals the room', color: '#ff4040' }, () => {
    const rows = [TILE * 3 + 4, ROOM_PX_H - TILE * 3 - 4];
    for (const [i, y] of rows.entries()) game.room.hazards.push({ kind: 'laser', x1: TILE, y1: y, x2: ROOM_PX_W - TILE, y2: y, phase: i * LASER_CYCLE / 2 });
    Sfx.play('door');
  });
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  if (tickWindup(e, dt)) return [0, 0];
  if (e.sweep) { // a sweeping laser: a warning flicker, then the beam swings across
    const S = e.sweep;
    S.t -= dt;
    if (S.t < S.dur) {
      S.a += S.dir * S.speed * dt;
      if (distToSegment(p.x, p.y, e.x, e.y, e.x + Math.cos(S.a) * S.len, e.y + Math.sin(S.a) * S.len) < p.r + 1.5 && p.burrowT <= 0) hurtPlayer(1);
    }
    if (S.t <= 0) e.sweep = null;
    return [0, 0];
  }
  if ((e.atkT = (e.atkT ?? 2) - dt) <= 0) {
    e.atkT = ph2 ? rand(1.6, 2.2) : rand(2.2, 3);
    if (Math.random() < 0.45) {
      const dir = Math.random() < 0.5 ? 1 : -1, dur = ph2 ? 1.6 : 1.9;
      e.sweep = { a: Math.atan2(uy, ux) - dir * 1.0, dir, speed: ph2 ? 1.5 : 1.1, len: 210, dur, t: dur + 0.6 };
      Sfx.play('flicker');
    } else startWindup(e, 'volley', 0.55, Math.atan2(uy, ux), { n: ph2 ? 4 : 3 }); // he raises the gun: red lines where it'll fire
  }
  if (e.volleys > 0 && (e.volT = (e.volT || 0) - dt) <= 0) { // aimed volleys
    e.volleys--; e.volT = 0.3;
    const base = e.volBase ?? Math.atan2(uy, ux); // (down the lines he showed you)
    for (const off of [-0.3, -0.15, 0, 0.15, 0.3]) spawnBullet({ x: e.x, y: e.y - 4, vx: Math.cos(base + off) * 130, vy: Math.sin(base + off) * 130, r: 2, team: 'enemy', kind: 'enemy', life: 2.4, color: PAL.red });
    Sfx.play('enemyShot');
  }
  if ((e.callT = (e.callT ?? 5) - dt) <= 0) { // security on call
    e.callT = ph2 ? 8 : 10;
    if (countAlive('hunter') + countAlive('enforcer') < 3) { bossMinion('hunter', e.x - 30, e.y); if (ph2) bossMinion('enforcer', e.x + 30, e.y); floatText(e.x, e.y - 22, 'SECURITY', PAL.red); Sfx.play('door'); }
  }
  const f = d > 110 ? 1 : d < 80 ? -1 : 0;
  return [(ux * f - uy * 0.5) * e.speed, (uy * f + ux * 0.5) * e.speed];
}

// The Director's sweeping laser, over the darkness.
function drawBossSweeps(ctx) {
  for (const e of game.enemies) {
    if (e.dead || !e.sweep) continue;
    const S = e.sweep, x2 = e.x + Math.cos(S.a) * S.len, y2 = e.y + Math.sin(S.a) * S.len;
    if (S.t > S.dur) { // warning: where it starts
      if (Math.floor(game.time * 16) % 2) { ctx.fillStyle = '#ff6060'; const n = S.len / 3; for (let i = 0; i < n; i += 2) ctx.fillRect(Math.round(e.x + (x2 - e.x) * i / n), Math.round(e.y + (y2 - e.y) * i / n), 1, 1); }
    } else { pxLine(ctx, e.x, e.y, x2, y2, '#600808', 3, 0); pxLine(ctx, e.x, e.y, x2, y2, Math.random() < 0.5 ? '#ff3030' : '#ff9090', 1, 0); }
  }
}

// --- Tells: every boss attack shows itself before it lands ---------------------------
// A WINDUP: the boss stops, shows exactly where the attack will go (its aim locks when
// the tell starts, so you can step out of it), then lets it go. MARKS: rings on the
// floor where lobbed shots will come down.
function startWindup(e, kind, t, ang, extra) {
  e.windup = Object.assign({ kind, t, max: t, ang }, extra);
  if (kind === 'breath') Sfx.play('creak'); else Sfx.play('chargeFull');
}
function tickWindup(e, dt) {
  const W = e.windup;
  if (!W) return false;
  if (W.kind === 'breath' && Math.random() < dt * 30) { // frost gathering in its mouth
    const a = rand(0, Math.PI * 2), r = rand(10, 22);
    game.particles.push({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60, life: 0.25, color: '#d8f0ff', size: 1 });
  }
  if ((W.t -= dt) > 0) return true;
  e.windup = null;
  if (W.kind === 'breath') { // the cone it showed you
    for (let k = -4; k <= 4; k++) spawnBullet({ x: e.x, y: e.y, vx: Math.cos(W.ang + k * 0.12) * 130, vy: Math.sin(W.ang + k * 0.12) * 130, r: 2, team: 'enemy', kind: 'enemy', life: 1.1, color: '#a0e0ff', chill: true });
    Sfx.play('spray');
  } else if (W.kind === 'ring') { // the thaw: shards burst out all around
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, r: 2, team: 'enemy', kind: 'enemy', life: 1.4, color: '#d8f0ff', chill: true }); }
    burst(e.x, e.y, '#d8f0ff', 30, 140, 0.6); Sfx.play('clank');
  } else if (W.kind === 'volley') { e.volleys = W.n; e.volBase = W.ang; e.volT = 0; }
  return true;
}
function markLanding(x, y, t, color) { (game.bossMarks || (game.bossMarks = [])).push({ x, y, t, max: t, color }); }

// Drawn over the darkness, like the other warnings.
function drawBossTells(ctx) {
  const blink = Math.floor(game.time * 14) % 2;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const W = e.windup;
    if (W) {
      const k = 1 - W.t / W.max; // 0 -> 1 as it comes
      if (W.kind === 'breath') { // the cone it will breathe, frosting over
        const len = 140;
        for (const side of [-1, 1]) { const a = W.ang + side * 0.5; for (let i = 6; i < len; i += 3) { ctx.fillStyle = blink ? '#a0e0ff' : '#4a7aa0'; ctx.fillRect(Math.round(e.x + Math.cos(a) * i), Math.round(e.y + Math.sin(a) * i), 1, 1); } }
        ctx.globalAlpha = 0.12 + 0.2 * k; ctx.fillStyle = '#a0e0ff'; ctx.beginPath(); ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, len * (0.3 + 0.7 * k), W.ang - 0.5, W.ang + 0.5); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      } else if (W.kind === 'ring') { // it swells before it bursts
        pxRing(ctx, e.x, e.y, e.r + 4 + 30 * (1 - k), blink ? '#d8f0ff' : '#4a7aa0');
      } else if (W.kind === 'volley') { // the lines it will fire down
        for (const off of [-0.3, -0.15, 0, 0.15, 0.3]) for (let i = 10; i < 150; i += 4) if ((i / 4 + (blink ? 1 : 0)) % 2 < 1) { ctx.fillStyle = '#ff4040'; ctx.fillRect(Math.round(e.x + Math.cos(W.ang + off) * i), Math.round(e.y - 4 + Math.sin(W.ang + off) * i), 1, 1); }
      }
    }
    if (e.type === 'archive' && e.charging) { // about to spin up: its eyes flare, a ring closes in
      const k = e.charging;
      pxRing(ctx, e.x, e.y, e.r + 6 + 24 * (1 - k), blink ? '#ffd0e0' : '#e8a0b8');
    }
  }
  for (const m of game.bossMarks || []) { // where it's coming down: a ring tightening to the moment it lands
    const k = 1 - m.t / m.max;
    pxRing(ctx, m.x, m.y, 3 + 9 * (1 - k), blink ? m.color : '#2a3010');
    ctx.fillStyle = m.color; ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
  }
}
