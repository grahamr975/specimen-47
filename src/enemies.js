'use strict';
// ---------------------------------------------------------------------------
// Enemies. Each type has a simple, readable behavior. Their corpses are
// worth DNA (`dna`) when you eat them; drones leave inedible scrap.
// ---------------------------------------------------------------------------

// dna: DNA in a usable corpse. corpse: chance to leave one (elites always do).
// fluid: what they bleed. gib: colors of the chunks. eyes: glint pixels
// (offsets from center, facing right) that shine in the dark.
const ENEMY_TYPES = {
  rat:      { name: 'Lab Rat',         hp: 3, r: 5, speed: 60, dna: 1, corpse: 0.5, fluid: FLUID.blood, gib: ['#5e5450', '#7a0f1a', '#a8534f'], eyes: [[8, 1]] },
  drone:    { name: 'Security Drone',  hp: 4, r: 6, speed: 48, dna: 0, corpse: 0, fluid: FLUID.oil,   gib: ['#5e5a5a', '#3e3c40', '#8a8478'], eyes: [[0, 2], [-1, 2], [0, 3]], flying: true, robot: true },
  urchin:   { name: 'Bone Urchin',     hp: 6, r: 6, speed: 22, dna: 2, corpse: 0.6, fluid: FLUID.ichor, gib: ['#cfc4a4', '#3a1020', '#6a1a2a'], eyes: [[-2, -1], [2, -1]] },
  splitter: { name: 'Failed Specimen', hp: 8, r: 7, speed: 28, dna: 3, corpse: 1, fluid: FLUID.rot,   gib: ['#5e6a48', '#2e3424', '#7e8a62'], eyes: [[6, 1], [3, 1]] },
  mini:     { name: 'Spawnling',       hp: 2, r: 4, speed: 55, dna: 0, corpse: 0, fluid: FLUID.rot,   gib: ['#5e6a48', '#2e3424'], eyes: [[0, 0]] },
  spitter:  { name: 'Bloat Toad',      hp: 5, r: 6, speed: 34, dna: 2, corpse: 0.7, fluid: FLUID.bile,  gib: ['#3e4a2a', '#8a9a30', '#232a18'], eyes: [[-4, -4], [4, -4]] },
  // --- Floor 1: Petri Labs ---
  culture:  { name: 'Culture Blob',    hp: 4, r: 6, speed: 8,  dna: 1, corpse: 0.4, fluid: FLUID.rot,   gib: ['#b8969a', '#8a6a70', '#5a4048'], eyes: [] },
  scavenger:{ name: 'Scavenger Maggot', hp: 1, r: 4, speed: 34, dna: 0, corpse: 0,  fluid: FLUID.bile,  gib: ['#9a8c70', '#6a5e48'], eyes: [[4, -1]], harmless: true },
  // --- Floor 2: Cryo Wing ---
  frostbitten: { name: 'Frostbitten',      hp: 7, r: 6, speed: 26, dna: 2, corpse: 0.6, fluid: FLUID.blood, gib: ['#9aaab8', '#3a4a5a', '#d8f0ff'], eyes: [[4, -6]] },
  cryocrawler: { name: 'Cryo Crawler',     hp: 4, r: 5, speed: 70, dna: 1, corpse: 0.5, fluid: FLUID.ichor, gib: ['#9aaab8', '#4a7aa0', '#d8f0ff'], eyes: [[6, 0]] },
  jarthing:    { name: 'Thawed Specimen',  hp: 9, r: 6, speed: 50, dna: 3, corpse: 0.8, fluid: FLUID.rot,   gib: ['#9aaab8', '#3a4a5a', '#5a2a3a'], eyes: [[7, -2]], startState: 'dormant' },
  // --- Floor 3: Bio-Weapons ---
  carrier:     { name: 'Plague Carrier',   hp: 7, r: 6, speed: 30, dna: 2, corpse: 0.6, fluid: FLUID.bile,  gib: ['#b0605a', '#aac25a', '#5a2228'], eyes: [[3, -6]] },
  bloater:     { name: 'Gas Bloater',      hp: 4, r: 6, speed: 30, dna: 0, corpse: 0,   fluid: FLUID.bile,  gib: ['#7a9238', '#2e3a18'], eyes: [[0, 0]], flying: true },
  gunpolyp:    { name: 'Gun Polyp',        hp: 7, r: 6, speed: 0,  dna: 2, corpse: 0.7, fluid: FLUID.blood, gib: ['#8a1c22', '#b0605a', '#5a2228'], eyes: [[-2, -1]] },
  // --- Floor 4: Gene Bank ---
  mimic:       { name: 'Mimic',            hp: 6, r: 5, speed: 64, dna: 2, corpse: 0.6, fluid: FLUID.blood, gib: ['#5e5450', '#7a0f1a', '#e8e0c8'], eyes: [[6, -2]], startState: 'disguise' },
  chimera:     { name: 'Chimera',          hp: 12, r: 8, speed: 36, dna: 4, corpse: 1,  fluid: FLUID.ichor, gib: ['#56643a', '#c4b898', '#a8534f'], eyes: [[8, -2], [7, -2]] },
  clone:       { name: 'Clone',            hp: 2, r: 4, speed: 58, dna: 1, corpse: 0.25, fluid: FLUID.blood, gib: ['#b07070', '#d09a90'], eyes: [[1, -4], [-1, -4]] },
  // --- Floor 5: Director's Wing ---
  enforcer:    { name: 'Enforcer',         hp: 12, r: 7, speed: 26, dna: 0, corpse: 0,  fluid: FLUID.oil,   gib: ['#5e5e66', '#3e3e46', '#8a8a92'], eyes: [[0, -6]], robot: true },
  hunter:      { name: 'Hunter-Killer',    hp: 6, r: 6, speed: 55, dna: 0, corpse: 0,   fluid: FLUID.oil,   gib: ['#5e5e66', '#3e3e46'], eyes: [[5, 0]], flying: true, robot: true },
  handler:     { name: 'Containment Handler', hp: 7, r: 6, speed: 34, dna: 2, corpse: 0.7, fluid: FLUID.blood, gib: ['#d8c040', '#a08a20', '#7a0f1a'], eyes: [[1, -6]] },
  // --- Bosses ---
  colossus: { name: 'The Thawing Colossus', hp: 70, r: 16, speed: 0, dna: 0, corpse: 0, fluid: FLUID.blood, gib: ['#9aaab8', '#4a7aa0', '#d8f0ff'], eyes: [[-2, -12], [2, -12]], boss: true },
  biotank:  { name: 'Specimen Zero',     hp: 80, r: 15, speed: 30, dna: 0, corpse: 0, fluid: FLUID.bile, gib: ['#b0605a', '#aac25a', '#5e5e66'], eyes: [[-2, -10], [1, -10]], boss: true },
  archive:  { name: 'The Archive',       hp: 85, r: 17, speed: 0, dna: 0, corpse: 0, fluid: FLUID.ichor, gib: ['#a45a7a', '#4a7aa0', '#e0c8c8'], eyes: [[-6, -4], [4, -6], [-1, 3]], boss: true },
  director: { name: 'The Director',      hp: 100, r: 12, speed: 34, dna: 0, corpse: 0, fluid: FLUID.blood, gib: ['#e8e8ee', '#5e5e66', '#7a0f1a'], eyes: [[-2, -13], [2, -13]], boss: true },
  mother:   { name: 'The Mother Culture', hp: 60, r: 17, speed: 0, dna: 0, corpse: 0, fluid: FLUID.rot, gib: ['#b8969a', '#8a6a70', '#5a4048'], eyes: [[0, -8], [-12, 0], [12, 2]], boss: true },
  motherling:{ name: 'Mother Culture',  hp: 18, r: 10, speed: 22, dna: 0, corpse: 0, fluid: FLUID.rot, gib: ['#b8969a', '#8a6a70', '#5a4048'], eyes: [[0, -4]], boss: true },
};

function isBoss(e) { return !!ENEMY_TYPES[e.type].boss; }
// Living, hatched enemies within r of (x, y) (measured to their edge), optionally but one.
function enemiesNear(x, y, r, except) {
  return game.enemies.filter(e => e !== except && !e.dead && e.spawnT <= 0 && Math.hypot(e.x - x, e.y - y) < r + e.r);
}

const ENEMY_POOL = ['rat', 'rat', 'drone', 'urchin', 'splitter', 'spitter'];

// THREAT: everything gets a little harder every floor (and keeps going after the
// Director, as the lab loops deeper). Enemies attack more often and their shots
// fly faster; elites carry more affixes; health and numbers keep growing (makeEnemy,
// spawnRoomEnemies).
function threatRate() { return 1 + 0.12 * (game.depth - 1); }            // how much faster they act
function threatShotSpeed() { return Math.min(1.45, 1 + 0.06 * (game.depth - 1)); }

function makeEnemy(type, x, y, elite = false) {
  const T = ENEMY_TYPES[type];
  const depth = game.depth;
  const hp = T.hp * (1 + (depth - 1) * 0.3) * (elite ? 3 : 1);
  return {
    type, x, y, r: T.r, hp, maxHp: hp, elite,
    speed: T.speed * (1 + (depth - 1) * 0.05),
    flying: !!T.flying,
    spawnT: 0.7,                 // warp-in delay before it becomes active
    flash: 0, kx: 0, ky: 0,      // hit flash + knockback velocity
    t: Math.random() * 10,
    timer: rand(1, 2.5),
    state: T.startState || 'move', dirX: 0, dirY: 0,
    strafe: Math.random() < 0.5 ? 1 : -1,
    face: 1, dead: false,
  };
}

function spawnEnemy(type, x, y, elite) {
  const e = makeEnemy(type, x, y, elite);
  game.enemies.push(e);
  return e;
}

function spawnRoomEnemies(room) {
  const fd = floorDef(game.depth);
  // The floor's last room holds its boss (if it has one yet).
  if (room.type === 'exit' && fd.boss) { spawnBoss(fd.boss); return; }

  // Floor 1 is gentler: you start weak and need a few meals to get going.
  let n = game.depth === 1 ? randInt(3, 4) : 3 + Math.min(game.depth, 6) + randInt(0, 2);
  if (room.type === 'exit') n += 1;
  n = Math.min(n, 13);
  for (let i = 0; i < n; i++) {
    const spot = randomFloorSpot(room, game.player, 70);
    const type = pick(fd.pool), e = spawnEnemy(type, spot.x, spot.y);
    e.spawnT += i * 0.08;
    if (type === 'clone') for (let c = 0; c < 2 && i < n - 1; c++, i++) { // clones come in packs
      const o = spawnEnemy('clone', spot.x + rand(-10, 10), spot.y + rand(-8, 8)); o.spawnT = e.spawnT + 0.05 * (c + 1);
    }
  }
  // An elite with affixes: always in the exit room, sometimes elsewhere.
  if (room.type === 'exit' || Math.random() < 0.08 + 0.07 * game.depth) {
    const spot = randomFloorSpot(room, game.player, 90);
    const e = spawnEnemy(pick(fd.pool.filter(t => !['culture', 'mimic', 'clone'].includes(t))), spot.x, spot.y, true);
    rollAffixes(e);
    // On floors without a boss yet, the exit's elite is the WARDEN: it carries the floor's core.
    if (room.type === 'exit') { e.warden = true; e.hp = e.maxHp = e.maxHp * 1.6; }
  }
  // Scavengers crawl in a little later, looking for meat.
  if (fd.scavengers) {
    const k = randInt(1, 2);
    for (let i = 0; i < k; i++) {
      const spot = randomFloorSpot(room, game.player, 60);
      spawnEnemy('scavenger', spot.x, spot.y).spawnT = 3 + i * 2;
    }
  }
}

// Set bonuses that fire when anything dies.
function onSetKill(e, p, s) {
  if (e.type === 'scavenger') return; // its own payout
  if (s.setKillShards) ringFrom(e.x, e.y, s.setKillShards);                        // Bone
  if (s.setKillCloud) spawnCloud(e.x, e.y, s.setKillCloud);                         // Fungal
  if (s.setKillBrood && Math.random() < s.setKillBrood) spawnAlly('spiderling', e.x, e.y); // Hive
  if (s.setKillFrenzy) { if (!(p.frenzyT > 0)) { p.frenzyT = 3; recomputeStats(p); } else p.frenzyT = 3; } // Apex
  if (s.setKillHeal && ++p.setKills % s.setKillHeal === 0) healPlayer(1);
  if (s.shellOnKills && s.shieldCd > 0 && !p.shieldUp && ++p.armorKills % s.shellOnKills === 0) { p.shieldUp = true; Sfx.play('shieldUp'); floatText(p.x, p.y - 14, 'SHELL REGROWN', '#8a7a5a'); } // Living Armor
}

// --- Knockback ----------------------------------------------------------------------
// Every hit shoves. `force` defaults to the damage dealt, so a slime blob
// barely nudges while a bite or a shotgun blast sends things flying. Big
// enemies and elites are heavier; bosses don't budge. A hard enough shove
// staggers (interrupts) the enemy, and slamming it into a wall hurts.
const KNOCK_PER_DMG = 30;  // force per point of damage, for hits with no force given
const KNOCK_MAX = 320;        // most force a single hit can apply
const KNOCK_SPEED_CAP = 420;  // fastest an enemy can be flung (~45px of slide)
function enemyMass(e) {
  const T = ENEMY_TYPES[e.type];
  if (T.boss) return Infinity;
  return Math.max(0.6, (e.r / 5) ** 2) * (e.elite ? 2.5 : 1);
}
function knock(e, dx, dy, force) {
  const l = Math.hypot(dx, dy);
  if (!l || !(force > 0) || e.dead) return 0;
  const f = Math.min(KNOCK_MAX, force) / enemyMass(e);
  e.kx += dx / l * f; e.ky += dy / l * f;
  const k = Math.hypot(e.kx, e.ky);
  if (k > KNOCK_SPEED_CAP) { e.kx *= KNOCK_SPEED_CAP / k; e.ky *= KNOCK_SPEED_CAP / k; } // stacked hits can't launch it across the room
  if (f > 110) e.staggerT = Math.max(e.staggerT || 0, Math.min(0.3, f / 900)); // staggered
  return f;
}

// Knockback movement: an enemy flung into a wall takes a hit from it.
function moveKnocked(e, vx, vy, dt) {
  const speed = Math.hypot(e.kx, e.ky);
  const bumped = moveEntity(game.room, e, vx * dt, vy * dt);
  if (bumped && speed > 170 && !isBoss(e)) {
    e.kx = e.ky = 0;
    burst(e.x, e.y, '#5e5450', 6, 60, 0.3);
    game.shake = Math.max(game.shake, 2);
    Sfx.play('ram');
    damageEnemy(e, speed / 160 * game.player.stats.damage, 0, 0, true);
  }
  return bumped;
}

function damageEnemy(e, dmg, vx, vy, quiet, force) {
  if (e.dead) return;
  // Predator set: wounded prey takes more.
  const ps = game.player && game.player.stats;
  if (ps && ps.setWounded && e.hp < e.maxHp * 0.5) dmg *= 1 + ps.setWounded;
  dmg *= statusDamageMul(e, ps); // marked, corroded, pollen-dusted; and your synergies with its bleeding / stun / blindness
  dmg *= marrowMul(game.player); // Dense Marrow: fed by every block
  if (ENEMY_BEHAVIOR[e.type].onHurt) dmg = ENEMY_BEHAVIOR[e.type].onHurt(e, dmg, vx, vy); // (the Enforcer's riot plate)
  dmg = affixDamage(e, dmg); // shielded / shelled elites
  if (dmg <= 0) return;
  e.hp -= dmg;
  const T = ENEMY_TYPES[e.type];
  if (dmg < 0.3) { if (e.hp <= 0) killEnemy(e); return; } // tiny damage ticks (bleed) stay quiet
  e.flash = 0.08;
  const heavy = dmg / e.maxHp; // how hard this hit landed, for this enemy
  e.lastHeavy = heavy;
  if (vx || vy) {
    knock(e, vx, vy, force !== undefined ? force : dmg * KNOCK_PER_DMG);
    bloodSpray(e.x, e.y, vx, vy, 6 + Math.round(16 * Math.min(1, heavy * 2)), T.fluid, 110 + 60 * Math.min(1, heavy)); // spurts out the far side, harder hits spurt more
  }
  if (heavy >= 0.3 && !T.boss) severChunk(e, vx, vy); // a heavy hit tears a piece off
  if (!vx && !vy && Math.random() < 0.3) {
    bloodSpray(e.x, e.y, 0, 0, 1, T.fluid, 30);
  }
  if (T.robot && !quiet) burst(e.x, e.y, '#ffd070', 3, 70, 0.2); // sparks
  if (!quiet) Sfx.play('hit');
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  game.kills++;
  const T = ENEMY_TYPES[e.type];
  const p = game.player, s = p.stats;
  statusOnKill(e, p, s); // Acid Maw bursts, Leech Spitter feeds, Hives, Cocoon Wrap...
  onSetKill(e, p, s);
  apexKill(p);
  if (ENEMY_BEHAVIOR[e.type].onDeath) ENEMY_BEHAVIOR[e.type].onDeath(e, p); // (shatters, bursts...)
  if (!T.harmless && ++p.armorKills >= ARMOR_KILLS) { // armor grows, slowly
    p.armorKills = 0;
    if ((p.armor || 0) < ARMOR_MAX) { p.armor = (p.armor || 0) + 1; floatText(p.x, p.y - 22, 'ARMOR GROWS', '#b8b8c8'); Sfx.play('shieldUp'); }
  }
  if (p.form === 'PREDATOR' && Math.hypot(e.x - p.x, e.y - p.y) < 60) p.bloodyT = 2.5; // blood on the muzzle
  if (e.eggs) { for (let i = 0; i < e.eggs; i++) spawnAlly('spiderling', e.x + rand(-3, 3), e.y + rand(-3, 3)); Sfx.play('hatch'); } // Brood Howl
  if (e.infest) hostBurst(e); // the brood inside bursts out
  if (s.gasDeathCloud && Math.hypot(e.x - p.x, e.y - p.y) < (p.gasR || 0) + e.r) game.clouds.push({ x: e.x, y: e.y, r: 16, life: 3.5, toxic: true }); // Rot Halo
  // Stalker: kills out in the dark can heal you.
  if (s.darkHeal && p.hp < p.maxHp && Math.hypot(e.x - p.x, e.y - p.y) > 45 && Math.random() < s.darkHeal) {
    healPlayer(1);
  }
  if (e.swallowed) { // Frog Tongue: gone in one gulp, DNA and all
    const n = Math.round((T.dna || 0) * s.dnaMul);
    if (n) gainDna(n);
  } else {
  bloodSpray(e.x, e.y, 0, 0, e.elite ? 40 : 22, T.fluid, 130);
  gibs(e.x, e.y, e.elite ? 10 : randInt(3, 6), T.gib, T.fluid);
  // Overkill (lots of damage to spare, or one huge hit) bursts the body.
  if (!T.robot && !T.boss && (-e.hp >= e.maxHp * 0.6 || (e.lastHeavy || 0) >= 1.5)) goreExplode(e);
  if (T.robot) {
    leaveCorpse(e, enemySpriteName(e), T.fluid); // scrap: nothing to harvest
    burst(e.x, e.y, '#ffd070', 10, 110, 0.35);
    Sfx.play('clank');
  } else if (T.dna && !e.noDna && (e.elite || Math.random() < T.corpse)) {
    spawnCorpse(e, enemySpriteName(e)); // usable: burst it open for DNA
  } else {
    // Torn apart: just a smear, nothing worth harvesting.
    stain(e.x, e.y + 1, e.r + 2, T.fluid);
    gibs(e.x, e.y, 3, T.gib, T.fluid);
  }
  }
  Sfx.play('kill');
  game.shake = Math.max(game.shake, e.elite ? 5 : 2);

  // A scavenger bursts with the DNA it stole (130% if it was engorged).
  if (e.ate) {
    const n = Math.round(e.ate * (e.engorged ? ENGORGE_BONUS : 1) * s.dnaMul);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(30, 90);
      game.room.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0 });
    }
    if (e.engorged) { bloodSpray(e.x, e.y, 0, 0, 20, FLUID.bile, 130); floatText(e.x, e.y - 10, 'IT BURSTS', VIAL_COLOR); }
  }
  onAffixDeath(e);
  if (T.boss) { onBossPartKilled(e); return; }
  if (e.warden) {
    spawnPickup('core', e.x, e.y);
    game.banner = { text: 'WARDEN KILLED', sub: 'Its core is still beating', color: PAL.lime, t: 2.5 };
  }

  // Drops: elites often drop a mutagen vial; anything might drop a heart.
  const room = game.room;
  let x = e.x, y = e.y;
  if (pointSolid(room, x, y)) ({ x, y } = randomFloorSpot(room, null, 0));
  if (e.elite && Math.random() < 0.45) spawnPickup('vial', x, y);
  else if (!T.harmless && Math.random() < 0.05) spawnPickup('heart', x, y);
}

// --- How each enemy acts ------------------------------------------------------------------
// update(e, dt, c) returns how it wants to move: [mx, my]. c is what it knows: tg (where it
// thinks you are: you, a decoy, a lure, or a wander point when blind), dx/dy/d/ux/uy toward
// tg, pd (real distance to you) and p (you). Bosses get dt sped up by the floor's threat.
// Optional hooks: onDeath(e) when it dies; onHurt(e, dmg, vx, vy) returns the damage it takes.
const ENEMY_BEHAVIOR = {
  culture: {
    update(e, dt, c) { // drifts, swells, divides
      const { ux, uy } = c;
      let mx = 0, my = 0;
      updateCulture(e, dt);
      mx = ux * e.speed + Math.sin(e.t * 2) * 4; my = uy * e.speed + Math.cos(e.t * 1.7) * 4;
      return [mx, my];
    },
  },
  scavenger: { update(e, dt, c) { return updateScavenger(e, dt); } },
  // --- Floor 2: Cryo Wing ---
  frostbitten: { // shambles; shatters when it dies
    update(e, dt, c) { const { ux, uy } = c; return [ux * e.speed, uy * e.speed]; },
    onDeath(e) { // into chilling shards
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, r: 2, team: 'enemy', kind: 'enemy', life: 0.7, color: '#d8f0ff', chill: true }); }
      burst(e.x, e.y, '#d8f0ff', 14, 110, 0.4); Sfx.play('clank');
    },
  },
  cryocrawler: {
    update(e, dt, c) { // skitters in, stops, sprays a frost cone that chills you
      const { d, ux, uy } = c;
      let mx = 0, my = 0;
      if (e.state === 'spray') {
        if (e.timer <= 0) {
          e.state = 'move'; e.timer = rand(1.8, 2.6);
          const base = Math.atan2(uy, ux);
          for (let k = -2; k <= 2; k++) spawnBullet({ x: e.x, y: e.y, vx: Math.cos(base + k * 0.18) * 125, vy: Math.sin(base + k * 0.18) * 125, r: 2, team: 'enemy', kind: 'enemy', life: 0.5, color: '#a0e0ff', chill: true });
          Sfx.play('spray');
        }
        return [mx, my];
      }
      const w = Math.sin(e.t * 10) * 0.8;
      mx = (ux - uy * w) * e.speed; my = (uy + ux * w) * e.speed;
      if (e.timer <= 0) { if (d < 85) { e.state = 'spray'; e.timer = 0.45; } else e.timer = rand(0.8, 1.6); }
      return [mx, my];
    },
  },
  jarthing: {
    update(e, dt, c) { // dormant in a cryo jar until you come close; then it bursts out and lunges
      const { d, pd, ux, uy } = c;
      let mx = 0, my = 0;
      if (e.state === 'dormant') {
        if (pd < 55 || e.hp < e.maxHp) { e.state = 'burst'; e.timer = 0.35; burst(e.x, e.y, '#d8f0ff', 14, 90, 0.4); Sfx.play('clank'); floatText(e.x, e.y - 14, '!', '#a0e0ff'); }
        return [mx, my];
      }
      if (e.state === 'burst') { if (e.timer <= 0) { e.state = 'charge'; e.timer = 0.4; e.dirX = ux; e.dirY = uy; } return [mx, my]; }
      if (e.state === 'charge') { mx = e.dirX * 230; my = e.dirY * 230; if (e.timer <= 0) { e.state = 'move'; e.timer = rand(1.5, 2.5); } return [mx, my]; }
      mx = ux * e.speed; my = uy * e.speed;
      if (e.timer <= 0 && d < 75) { e.state = 'burst'; e.timer = 0.3; } else if (e.timer <= 0) e.timer = 0.5;
      return [mx, my];
    },
  },
  // --- Floor 3: Bio-Weapons ---
  carrier: {
    onDeath(e) { spawnPuddle(e.x, e.y, 16, 5, 'enemy'); }, // it bursts into acid
    update(e, dt, c) { // shuffles after you, leaking acid
      const { ux, uy } = c;
      let mx = 0, my = 0;
      mx = ux * e.speed; my = uy * e.speed;
      if ((e.dripT = (e.dripT || 0) - dt) <= 0) { e.dripT = 0.7; spawnPuddle(e.x, e.y + 2, 7, 4, 'enemy'); }
      return [mx, my];
    },
  },
  bloater: {
    onDeath(e, p) { // it bursts: gas and acid
      game.fx.push({ kind: 'ring', x: e.x, y: e.y, r: 4, max: 30, t: 0.25 }); burst(e.x, e.y, '#aac25a', 24, 140, 0.5);
      spawnPuddle(e.x, e.y, 18, 5, 'enemy'); game.shake = Math.max(game.shake, 4); Sfx.play('blast');
      if (Math.hypot(p.x - e.x, p.y - e.y) < 30 + p.r) hurtPlayer(1);
      for (const o of enemiesNear(e.x, e.y, 30, e)) damageEnemy(o, 4, o.x - e.x, o.y - e.y, true);
    },
    update(e, dt, c) { // drifts at you, then swells and bursts
      const { pd, ux, uy } = c;
      let mx = 0, my = 0;
      if (e.state === 'fuse') { if (e.timer <= 0) damageEnemy(e, e.hp + 1, 0, 0, true); return [mx, my]; }
      mx = ux * e.speed + Math.sin(e.t * 2) * 8; my = uy * e.speed + Math.cos(e.t * 1.6) * 8;
      if (pd < 28) { e.state = 'fuse'; e.timer = 0.7; Sfx.play('flicker'); floatText(e.x, e.y - 12, '!', '#c0e040'); }
      return [mx, my];
    },
  },
  gunpolyp: {
    update(e, dt, c) { // rooted: fires bursts of three aimed spores
      const { ux, uy } = c;
      if (e.timer <= 0) { e.burstN = 3; e.timer = rand(2.4, 3.2); }
      if (e.burstN > 0 && (e.burstT = (e.burstT || 0) - dt) <= 0) {
        e.burstN--; e.burstT = 0.16;
        spawnBullet({ x: e.x, y: e.y - 3, vx: ux * 115, vy: uy * 115, r: 2, team: 'enemy', kind: 'enemy', life: 2.5, color: '#c870a0' });
        Sfx.play('enemyShot');
      }
      return [0, 0];
    },
  },
  // --- Floor 4: Gene Bank ---
  mimic: {
    update(e, dt, c) { // a corpse, until you come close to eat it
      const { pd, ux, uy } = c;
      let mx = 0, my = 0;
      if (e.state === 'disguise') {
        if (pd < 24 || e.hp < e.maxHp) { e.state = 'reveal'; e.timer = 0.25; floatText(e.x, e.y - 10, '!', PAL.red); Sfx.play('chomp'); }
        return [mx, my];
      }
      if (e.state === 'reveal') { if (e.timer <= 0) { e.state = 'charge'; e.timer = 0.32; e.dirX = ux; e.dirY = uy; } return [mx, my]; }
      if (e.state === 'charge') { mx = e.dirX * 240; my = e.dirY * 240; if (e.timer <= 0) { e.state = 'move'; e.timer = 1; } return [mx, my]; }
      const w = Math.sin(e.t * 9) * 0.5; mx = (ux - uy * w) * e.speed; my = (uy + ux * w) * e.speed;
      return [mx, my];
    },
  },
  chimera: {
    update(e, dt, c) { // a toad's spit and an urchin's charge, switching every few seconds
      const { dx, dy, d, ux, uy } = c;
      let mx = 0, my = 0;
      e.modeT = (e.modeT ?? rand(2, 4)) - dt;
      if (e.modeT <= 0) { e.modeT = 4; e.mode = e.mode === 'spit' ? 'charge' : 'spit'; e.state = 'move'; e.timer = 0.6; burst(e.x, e.y, '#c4b898', 6, 50); }
      if (e.mode === 'spit') {
        const f = d > 110 ? 1 : d < 75 ? -1 : 0;
        mx = (ux * f - uy * e.strafe * 0.4) * e.speed; my = (uy * f + ux * e.strafe * 0.4) * e.speed;
        if (e.timer <= 0) {
          e.timer = rand(1.4, 2);
          const flight = clamp(d / 90, 0.4, 1.4);
          for (const side of [-1, 0, 1]) spawnBullet({ x: e.x, y: e.y, vx: (dx - uy * 30 * side) / flight, vy: (dy + ux * 30 * side) / flight, r: 3, team: 'enemy', kind: 'glob', life: flight, maxLife: flight, color: PAL.lime });
          Sfx.play('enemyShot');
        }
      } else if (e.state === 'move') {
        mx = ux * e.speed; my = uy * e.speed;
        if (e.timer <= 0) { e.state = 'wind'; e.timer = 0.45; }
      } else if (e.state === 'wind') { if (e.timer <= 0) { e.state = 'charge'; e.timer = 0.55; e.dirX = ux; e.dirY = uy; } }
      else if (e.state === 'charge') { mx = e.dirX * 200; my = e.dirY * 200; if (e.timer <= 0) { e.state = 'rest'; e.timer = 0.5; } }
      else if (e.timer <= 0) { e.state = 'move'; e.timer = rand(0.8, 1.4); }
      return [mx, my];
    },
  },
  clone: {
    onDeath(e) { for (const o of game.enemies) if (o !== e && !o.dead && o.type === 'clone') { o.rage = Math.min(1.2, (o.rage || 0) + 0.25); burst(o.x, o.y, '#e05050', 3, 40, 0.2); } }, // the others get faster
    update(e, dt, c) { // pack hunters; each loss makes the rest faster
      const { ux, uy } = c;
      let mx = 0, my = 0;
      const sp = e.speed * (1 + (e.rage || 0)), w = e.strafe * 0.35;
      mx = (ux - uy * w) * sp; my = (uy + ux * w) * sp;
      return [mx, my];
    },
  },
  // --- Floor 5: Director's Wing ---
  enforcer: {
    onHurt(e, dmg, vx, vy) { // a hit on its riot plate barely lands (only its back is soft)
      if (!(vx || vy) || e.fx === undefined || (vx * e.fx + vy * e.fy) / (Math.hypot(vx, vy) || 1) >= -0.35) return dmg;
      if (!(e.clankT > game.time)) { e.clankT = game.time + 0.15; burst(e.x + e.fx * 6, e.y + e.fy * 6, '#ffd070', 4, 80, 0.2); Sfx.play('clank'); }
      return dmg * 0.25;
    },
    update(e, dt, c) { // advances behind a riot plate (only its back is soft) and fires spreads
      const { d, ux, uy } = c;
      let mx = 0, my = 0;
      e.fx = ux; e.fy = uy; e.face = ux >= 0 ? 1 : -1;
      const k = d > 50 ? 1 : 0.2; mx = ux * e.speed * k; my = uy * e.speed * k;
      if (e.timer <= 0 && d < 150) {
        e.timer = rand(2.2, 3);
        const base = Math.atan2(uy, ux);
        for (const off of e.elite ? [-0.3, -0.15, 0, 0.15, 0.3] : [-0.2, 0, 0.2]) spawnBullet({ x: e.x, y: e.y, vx: Math.cos(base + off) * 120, vy: Math.sin(base + off) * 120, r: 2, team: 'enemy', kind: 'enemy', life: 2.4, color: PAL.red });
        Sfx.play('enemyShot');
      }
      return [mx, my];
    },
  },
  hunter: {
    update(e, dt, c) { // circles, locks on (a red line), then dashes straight through
      const { tg, d, ux, uy } = c;
      let mx = 0, my = 0;
      if (e.state === 'aim') {
        e.tx += (tg.x - e.tx) * Math.min(1, dt * 3); e.ty += (tg.y - e.ty) * Math.min(1, dt * 3);
        if (e.timer <= 0) { const ddx = e.tx - e.x, ddy = e.ty - e.y, dd = Math.hypot(ddx, ddy) || 1; e.state = 'charge'; e.timer = Math.min(0.55, (dd + 30) / 290); e.dirX = ddx / dd; e.dirY = ddy / dd; Sfx.play('dash'); }
      } else if (e.state === 'charge') { mx = e.dirX * 290; my = e.dirY * 290; if (e.timer <= 0) { e.state = 'rest'; e.timer = 0.5; } }
      else if (e.state === 'rest') { if (e.timer <= 0) { e.state = 'move'; e.timer = rand(1.4, 2.4); } }
      else {
        const f = d > 100 ? 1 : d < 70 ? -1 : 0;
        mx = (ux * f - uy * e.strafe) * e.speed; my = (uy * f + ux * e.strafe) * e.speed;
        if (e.timer <= 0) { e.state = 'aim'; e.timer = 0.6; e.tx = tg.x; e.ty = tg.y; Sfx.play('flicker'); }
      }
      return [mx, my];
    },
  },
  handler: {
    update(e, dt, c) { // keeps its distance and fires containment nets that pin you
      const { d, ux, uy } = c;
      let mx = 0, my = 0;
      const f = d > 110 ? 1 : d < 70 ? -1 : 0;
      mx = (ux * f - uy * e.strafe * 0.5) * e.speed; my = (uy * f + ux * e.strafe * 0.5) * e.speed;
      if (e.timer <= 0) { e.timer = rand(2.6, 3.4); spawnBullet({ x: e.x, y: e.y, vx: ux * 105, vy: uy * 105, r: 3, team: 'enemy', kind: 'enemy', life: 2.2, color: '#e8e0c8', net: true }); Sfx.play('whip'); }
      return [mx, my];
    },
  },
  mother: { update(e, dt, c) { return updateMother(e, dt, c.p); } },
  colossus: { update(e, dt, c) { return updateColossus(e, dt, c.p); } },
  biotank: { update(e, dt, c) { return updateBiotank(e, dt, c.p); } },
  archive: { update(e, dt, c) { return updateArchive(e, dt, c.p); } },
  director: { update(e, dt, c) { return updateDirector(e, dt, c.p); } },
  motherling: { update(e, dt, c) { return updateMotherling(e, dt, c.p); } },
  rat: {
    update(e, dt, c) { // fast, wiggly chaser
      const { ux, uy } = c;
      let mx = 0, my = 0;
      const w = Math.sin(e.t * 8) * 0.6;
      mx = (ux - uy * w) * e.speed;
      my = (uy + ux * w) * e.speed;
      return [mx, my];
    },
  },
  splitter: {
    onDeath(e) { // it splits in two (unless swallowed whole: then its spawn are digested with it)
      if (e.swallowed) return;
      for (const side of [-1, 1]) { const m = makeEnemy('mini', e.x + side * 3, e.y, false); m.spawnT = 0; m.kx = side * 120; game.enemies.push(m); }
    },
    update(e, dt, c) { // slow, relentless chasers
      const { ux, uy } = c;
      let mx = 0, my = 0;
      mx = ux * e.speed; my = uy * e.speed;
      return [mx, my];
    },
  },
  drone: {
    update(e, dt, c) { // keeps its distance, strafes, shoots
      const { d, ux, uy } = c;
      let mx = 0, my = 0;
      const f = d > 95 ? 1 : d < 65 ? -1 : 0;
      mx = (ux * f - uy * e.strafe * 0.7) * e.speed;
      my = (uy * f + ux * e.strafe * 0.7) * e.speed;
      if (Math.random() < dt * 0.4) e.strafe *= -1;
      if (e.timer <= 0) {
        e.timer = rand(1.6, 2.4);
        const angles = e.elite ? [-0.3, 0, 0.3] : [0];
        const base = Math.atan2(uy, ux);
        for (const off of angles) {
          spawnBullet({ x: e.x, y: e.y, vx: Math.cos(base + off) * 95, vy: Math.sin(base + off) * 95, r: 2, team: 'enemy', kind: 'enemy', life: 3, color: PAL.red });
        }
        Sfx.play('enemyShot');
      }
      return [mx, my];
    },
  },
  urchin: {
    update(e, dt, c) { // creeps, winds up, then charges in a straight line
      const { ux, uy } = c;
      let mx = 0, my = 0;
      if (e.state === 'move') {
        mx = ux * e.speed; my = uy * e.speed;
        if (e.timer <= 0) { e.state = 'wind'; e.timer = 0.5; }
      } else if (e.state === 'wind') {
        if (e.timer <= 0) { e.state = 'charge'; e.timer = 0.6; e.dirX = ux; e.dirY = uy; }
      } else if (e.state === 'charge') {
        mx = e.dirX * 190; my = e.dirY * 190;
        if (e.timer <= 0) { e.state = 'rest'; e.timer = 0.6; }
      } else if (e.timer <= 0) {
        e.state = 'move'; e.timer = rand(1.2, 2.2);
      }
      return [mx, my];
    },
  },
  spitter: {
    update(e, dt, c) { // keeps range and lobs acid where you're standing
      const { dx, dy, d, ux, uy } = c;
      let mx = 0, my = 0;
      const f = d > 120 ? 1 : d < 80 ? -1 : 0;
      mx = (ux * f - uy * e.strafe * 0.4) * e.speed;
      my = (uy * f + ux * e.strafe * 0.4) * e.speed;
      if (e.timer <= 0) {
        e.timer = rand(2, 2.8);
        const flight = clamp(d / 90, 0.4, 1.4);
        spawnBullet({ x: e.x, y: e.y, vx: dx / flight, vy: dy / flight, r: 3, team: 'enemy', kind: 'glob', life: flight, maxLife: flight, color: PAL.lime });
        if (e.elite) {
          for (const side of [-1, 1]) {
            spawnBullet({ x: e.x, y: e.y, vx: (dx - uy * 40 * side) / flight, vy: (dy + ux * 40 * side) / flight, r: 3, team: 'enemy', kind: 'glob', life: flight, maxLife: flight, color: PAL.lime });
          }
        }
        Sfx.play('enemyShot');
      }
      return [mx, my];
    },
  },
};
ENEMY_BEHAVIOR.mini = { update: ENEMY_BEHAVIOR.splitter.update }; // moves the same (but doesn't split again)

function updateEnemies(dt) {
  const p = game.player;
  for (const e of game.enemies) {
    if (e.dead) continue;
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    e.t += dt; e.flash -= dt; e.timer -= dt * threatRate(); // deeper floors: they attack more often
    if (e.barbT > 0 && (e.barbT -= dt) <= 0) ripBarbs(e); // barbs tear out
    if (e.hp < e.maxHp * 0.5 && !ENEMY_TYPES[e.type].robot && Math.random() < dt * 4) stainPx(e.x + rand(-2, 2), e.y + e.r * 0.6, ENEMY_TYPES[e.type].fluid, 1); // badly hurt: it drips
    // Held in your hands, flying through the air, or stunned: no thinking.
    if (e.held) continue;
    if (e.thrown) { updateThrownEnemy(e, dt); continue; }
    if (e.grabOnArrive) {
      if (!p.held && Math.hypot(p.x - e.x, p.y - e.y) < e.r + 12) { e.grabOnArrive = false; grab(p, { kind: 'enemy', ref: e }); continue; }
      if (Math.hypot(e.kx, e.ky) < 30) e.grabOnArrive = false;
    }
    updateStatuses(e, dt); // bleeding, stuns, webs... (see status.js)
    if (e.dead) continue;
    if (statusFlag(e, 'blocksAI') || e.staggerT > 0) { // stunned, or staggered by a heavy hit
      e.staggerT -= dt;
      moveKnocked(e, e.kx, e.ky, dt); e.kx *= 0.85; e.ky *= 0.85;
      continue;
    }

    // Where it thinks you are (a decoy, your lure, or nowhere if blinded).
    const tg = enemyTarget(e);
    const dx = tg.x - e.x, dy = tg.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const pd = Math.hypot(p.x - e.x, p.y - e.y);
    const ux = dx / d, uy = dy / d;
    updateAffixes(e, dt);

    const B = ENEMY_BEHAVIOR[e.type];
    let [mx, my] = B.update(e, isBoss(e) ? dt * threatRate() : dt, { p, tg, dx, dy, d, pd, ux, uy });

    if (statusFlag(e, 'noShoot') && e.type !== 'urchin') e.timer = Math.max(e.timer, 0.5); // blind things don't shoot
    { const m = statusMoveMul(e); mx *= m; my *= m; } // webbed, slowed
    // Your slime is slippery: things crawling through it slow and slide.
    if (!e.flying && game.room.slime.length && onSlime(e.x, e.y + 2, 5)) {
      const slow = p.stats.slimeSlow || 0.55; // Slime Glands: much stickier
      mx = mx * slow + rand(-25, 25); my = my * slow + rand(-25, 25);
      if (p.stats.toxicBlood > 0) damageEnemy(e, 0.8 * dt, 0, 0, true); // toxic slime
      if (p.stats.slimeBurn) damageEnemy(e, p.stats.slimeBurn * dt, 0, 0, true); // Acid Slime
      if (e.dead) continue;
    }
    const bumped = moveKnocked(e, mx + e.kx, my + e.ky, dt);
    e.kx *= 0.85; e.ky *= 0.85;
    if (bumped && e.state === 'charge') {
      e.state = 'rest'; e.timer = 0.7;
      game.shake = Math.max(game.shake, 2);
      burst(e.x + e.dirX * e.r, e.y + e.dirY * e.r, PAL.silver, 6, 60);
    }
    if (Math.abs(mx) > 1) e.face = mx > 0 ? 1 : -1;

    if (pd < e.r + p.r - 1 && p.burrowT <= 0 && !ENEMY_TYPES[e.type].harmless && !(e.infest && p.stats.oviCharm) && e.state !== 'dormant' && e.state !== 'disguise') {
      // Pustule Field: touching you pops a pustule of burning bile.
      if (p.stats.pustules && !(e.pusT > 0)) {
        e.pusT = 0.8; inflict(e, 'bleed', { t: 3, dps: p.stats.pustules });
        spawnPuddle(e.x, e.y, 8, 1.5, 'player');
        if (p.stats.eggPods) spawnAlly('spiderling', p.x + rand(-4, 4), p.y + rand(-3, 3)); // Egg Pods
        Sfx.play('splat');
      }
      applyHitEffects(e, 'contact'); // Acid Skin, Sap
      // Venus Maw: the flower on your head bites.
      if (p.stats.flowerBite && !(e.flowerT > game.time)) {
        e.flowerT = game.time + 0.6;
        damageEnemy(e, p.stats.flowerBite * p.stats.damage, e.x - p.x, e.y - p.y, true);
        game.fx.push({ kind: 'bite', x: (e.x + p.x) / 2, y: (e.y + p.y) / 2 - 4, t: 0.12 });
        Sfx.play('bite');
        if (e.dead) { if (p.stats.flowerHeal && Math.random() < p.stats.flowerHeal) healPlayer(1); continue; }
        if (p.stats.flowerStun) inflict(e, 'stun', { t: p.stats.flowerStun });
      }
      // Urchin Hide: touching you sets off your shard ring.
      if (p.stats.urchinHide && p.stats.ring > 0 && !(p.urchinT > game.time)) { p.urchinT = game.time + 0.6; fireRing(p, p.stats.ring); }
      // Thorned Plate: your shell shreds whatever touches it.
      if (p.stats.plateThorns && p.shieldUp && !(e.plateT > game.time)) {
        e.plateT = game.time + 0.4;
        damageEnemy(e, p.stats.plateThorns * p.stats.damage, e.x - p.x, e.y - p.y, true);
        if (e.dead) continue;
      }
      // Barbed Hide shreds anything that touches you.
      if (p.stats.thorns > 0 && !(e.thornT > 0)) {
        e.thornT = 0.4;
        damageEnemy(e, p.stats.thorns, e.x - p.x, e.y - p.y, true);
        if (e.dead) continue;
      }
      if (hurtPlayer(1) && hasAffix(e, 'vampiric')) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3); floatText(e.x, e.y - 12, 'IT FEEDS', PAL.red); }
    }
    if (e.thornT > 0) e.thornT -= dt;
    if (e.pusT > 0) e.pusT -= dt;
  }

  // Keep enemies from stacking on top of each other.
  const list = game.enemies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.dead || b.dead || a.spawnT > 0 || b.spawnT > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const overlap = a.r + b.r - d;
      if (overlap > 0) {
        const px = (dx / d) * overlap * 0.25, py = (dy / d) * overlap * 0.25;
        moveEntity(game.room, a, -px, -py);
        moveEntity(game.room, b, px, py);
      }
    }
  }
  game.enemies = game.enemies.filter(e => !e.dead);
}

const FRAMED = new Set(['frostbitten', 'cryocrawler', 'jarthing', 'carrier', 'gunpolyp', 'mimic', 'chimera', 'clone', 'enforcer', 'hunter', 'handler']);
function enemySpriteName(e) {
  let n = e.type;
  if (e.type === 'rat' && Math.floor(e.t * 10) % 2) n = 'rat2';
  if (e.type === 'drone' && Math.floor(e.t * 16) % 2) n = 'drone2';
  if (e.type === 'scavenger' && e.engorged) n = e.fleeT < 4 && Math.floor(e.t * 8) % 2 ? 'scavengerfat2' : 'scavengerfat'; // pulses when about to escape
  if (e.type === 'culture' && !e.offspring && !e.divided && (e.growT || 0) > floorDef(game.depth).cultureSplit * 0.6) n = 'culture2'; // swelling, about to divide
  if (['mother', 'motherling', 'colossus', 'biotank', 'archive', 'director'].includes(e.type) && Math.floor(e.t * 2.5) % 2) n = e.type + '2'; // pulsing / breathing
  if (FRAMED.has(e.type) && (e.speed === 0 ? e.burstN > 0 : true) && Math.floor(e.t * 8) % 2) n = e.type + '2';           // walking frames
  if (e.type === 'jarthing' && e.state === 'dormant') n = 'jar';
  if (e.type === 'mimic' && e.state === 'disguise') n = 'mimicdead';
  if (e.type === 'bloater' && e.state === 'fuse' && Math.floor(e.t * 14) % 2) n = 'bloater2';
  if (e.face < 0) n += '_L';
  return n;
}

function enemyDrawPos(e) {
  let x = e.x, y = e.y;
  if (e.type === 'drone') y += Math.round(Math.sin(e.t * 4) * 1.5) - 3;
  if (e.type === 'urchin' && e.state === 'wind') x += Math.floor(e.t * 30) % 2 ? -1 : 1;
  return { x, y };
}

function drawEnemies(ctx) {
  for (const e of game.enemies) {
    if (e.spawnT > 0 || e.held) continue; // spawning: drawn above the darkness; held: drawn in your hands
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(Math.round(e.x - e.r - 2), Math.round(e.y + e.r - 1), e.r * 2 + 4, 3);

    const name = enemySpriteName(e);
    const { x, y } = enemyDrawPos(e);
    const winding = e.type === 'urchin' && e.state === 'wind';

    if (e.elite) {
      const outline = SPR[name + '_elite'];
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawCentered(ctx, outline, x + ox, y + oy);
    }
    const flash = e.flash > 0 || (winding && Math.floor(e.t * 20) % 2);
    drawCentered(ctx, SPR[flash ? name + '_flash' : name], x, y);

  }
}

// Drawn on top of the darkness: spawn warnings, glinting eyes, elite health.
function drawEnemyGlow(ctx) {
  const p = game.player;
  for (const e of game.enemies) { // a Hunter-Killer's lock-on line
    if (e.dead || e.type !== 'hunter' || e.state !== 'aim') continue;
    const n = Math.max(1, Math.round(Math.hypot(e.tx - e.x, e.ty - e.y) / 3));
    ctx.fillStyle = Math.floor(game.time * 20) % 2 ? '#ff3030' : '#a01010';
    for (let i = 0; i <= n; i += 2) ctx.fillRect(Math.round(e.x + (e.tx - e.x) * i / n), Math.round(e.y + (e.ty - e.y) * i / n), 1, 1);
  }
  for (const e of game.enemies) {
    if (p.stats.antennae && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.y - p.y) > 50) {
      ctx.globalAlpha = 0.22;
      drawCentered(ctx, SPR[enemySpriteName(e) + '_flash'], e.x, e.y);
      ctx.globalAlpha = 1;
    }
    drawStatuses(ctx, e); // stun stars, mark reticles, pollen (status.js)
    if (e.warden && !e.dead) drawText(ctx, 'WARDEN', e.x, e.y - e.r - 12, '#b03040', 1, 'center');
    if (e.infest && !e.dead) { // something writhing under its skin
      const wx = e.x + Math.sin(game.time * 14 + e.infest.wriggle) * 2, wy = e.y - 1 + Math.cos(game.time * 11) * 1.5;
      pxCircle(ctx, wx, wy, 1.6, '#3a2a20'); pxCircle(ctx, wx, wy, 1, '#e8dcc0');
    }
    if (e.spawnT > 0) {
      // Something is crawling out: a warning so spawns are never unfair.
      if (Math.floor(e.spawnT * 14) % 2 === 0) pxRing(ctx, e.x, e.y, 2 + e.spawnT * 9, PAL.red);
      ctx.fillStyle = PAL.red;
      ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y) - 1, 3, 3);
      continue;
    }
    if (e.state === 'disguise' || e.state === 'dormant') continue; // a corpse, or a thing asleep in its jar: no eyes in the dark
    const { x, y } = enemyDrawPos(e);
    const T = ENEMY_TYPES[e.type];
    const charging = e.type === 'urchin' && (e.state === 'wind' || e.state === 'charge');
    ctx.fillStyle = charging ? '#ff8040' : '#ff2a3a';
    for (const [ex, ey] of T.eyes) {
      const gx = e.face < 0 ? -ex - 1 : ex;
      ctx.fillRect(Math.round(x + gx), Math.round(y + ey), 1, 1);
    }
    if (e.elite) {
      const w = 16, fill = Math.max(0, Math.round((e.hp / e.maxHp) * w));
      ctx.fillStyle = PAL.black; ctx.fillRect(Math.round(e.x - w / 2) - 1, Math.round(y - 12), w + 2, 3);
      ctx.fillStyle = PAL.red; ctx.fillRect(Math.round(e.x - w / 2), Math.round(y - 11), fill, 1);
      if (e.affixes) drawText(ctx, e.affixes.map(a => AFFIXES[a]).join(' '), e.x, y - 19, '#e8a020', 1, 'center');
      if (hasAffix(e, 'shielded') && !(e.shieldT > 0)) pxRing(ctx, x, y, e.r + 3, Math.floor(game.time * 4) % 2 ? '#8a7a5a' : '#5a4a3a');
    }
  }
}
