'use strict';
// ---------------------------------------------------------------------------
// Bosses, special enemy behaviors, telegraphed attacks and elite affixes.
// ---------------------------------------------------------------------------

// --- Telegraphed attacks -------------------------------------------------------------
// A red warning line appears, then the attack lands along it.
function telegraphLine(x, y, angle, len, width, delay, dmg) {
  game.telegraphs.push({ x, y, ang: angle, len, w: width, t: delay, max: delay, dmg });
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
    if (distToSegment(p.x, p.y, tg.x, tg.y, x2, y2) < tg.w / 2 + p.r) hurtPlayer(tg.dmg);
    for (const a of game.allies) if (a.kind === 'twin' && distToSegment(a.x, a.y, tg.x, tg.y, x2, y2) < tg.w / 2 + a.r) hurtTwin(a);
    game.fx.push({ kind: 'slamline', x1: tg.x, y1: tg.y, x2, y2, t: 0.25 });
    for (let k = 0; k < 8; k++) {
      const f = k / 8;
      burst(tg.x + (x2 - tg.x) * f, tg.y + (y2 - tg.y) * f, '#8a6a70', 2, 50, 0.3);
      stainPx(tg.x + (x2 - tg.x) * f + rand(-3, 3), tg.y + (y2 - tg.y) * f + rand(-3, 3), FLUID.rot, 2);
    }
    game.shake = Math.max(game.shake, 4);
    Sfx.play('slam');
  }
  game.telegraphs = game.telegraphs.filter(t => !t.done);

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
function updateCulture(e, dt) {
  e.growT = (e.growT || 0) + dt;
  const split = floorDef(game.depth).cultureSplit;
  if (e.growT >= split) {
    e.growT = 0;
    if (game.enemies.filter(o => !o.dead).length < 18) {
      const a = rand(0, Math.PI * 2);
      const c = makeEnemy('culture', e.x, e.y);
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
  mother: { title: 'THE MOTHER CULTURE', sub: 'Failed attempt no. 1' },
};

function spawnBoss(id) {
  const e = spawnEnemy(id, ROOM_PX_W / 2, ROOM_PX_H / 2 - 8);
  e.spawnT = 1.4;
  e.birthT = 3; e.slamT = 2.5;
  game.banner = { text: BOSSES[id].title, sub: BOSSES[id].sub, color: PAL.red, t: 3 };
  game.bossName = BOSSES[id].title;
  game.bossMax = e.maxHp;
  Sfx.play('scream');
}

function livingBossParts() {
  return game.enemies.filter(e => !e.dead && ENEMY_TYPES[e.type].boss);
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
      const c = makeEnemy('culture', e.x, e.y + 8); c.spawnT = 0.3; game.enemies.push(c);
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
  game.banner = { text: 'THE MOTHER IS DEAD', sub: 'Something rare spills from her', color: PAL.lime, t: 3 };
  for (let i = 0; i < 8; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(40, 110);
    game.room.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0 });
  }
  const vial = spawnPickup('vial', ROOM_PX_W / 2 + 34, ROOM_PX_H / 2);
  vial.minRarity = 'rare';
  game.shake = 8;
}

function drawBossBar(ctx) {
  if (!game.bossName) return;
  const parts = livingBossParts();
  if (!parts.length) return;
  const hp = parts.reduce((t, e) => t + Math.max(0, e.hp), 0);
  const w = 200, x = (VIEW_W - w) / 2, y = ROOM_Y + ROOM_PX_H - 14;
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
  const n = game.depth >= 4 ? 2 : 1;
  const pool = Object.keys(AFFIXES);
  e.affixes = [];
  while (e.affixes.length < n) {
    const a = pick(pool);
    if (!e.affixes.includes(a)) e.affixes.push(a);
  }
  if (e.affixes.includes('hasted')) e.speed *= 1.5;
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
    e.timer -= dt * 0.5; // attacks come faster too
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
