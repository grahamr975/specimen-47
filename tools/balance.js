'use strict';
// Balance simulator: plays many seeded runs with a bot and reports how parts,
// sets, set pairs and splices do. Open tools/balance.html in a browser
// (?runs=60&seed=1&strategies=random,focus,mix,splice), or run
// tools/run-balance.ps1 to play headless and save tools/balance-report.html.
//
// The bot is simple: it aims at the nearest enemy, strafes (melee builds close
// in), fires, dashes and uses its limb ability now and then. Between fights it
// is moved straight onto corpses, biomass and pickups, and through doors:
// navigation isn't what's being measured; combat is. Compare parts against
// each other under the same bot, not against a human player.

// --- Seeded randomness: every run is replayable from its seed -----------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- How the bot picks cards ----------------------------------------------------------
// Each strategy scores the cards on screen; the best one is taken.
const STRATEGIES = {
  random: () => Math.random(),
  // Stack one set: prefer cards of the set you have most of.
  focus: (p, info) => {
    const n = setCounts(p), top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    return (info.set && info.set === top ? 10 : 0) + (info.setNote && info.setNote.startsWith('COMPLETES') ? 5 : 0) + Math.random();
  },
  // Spread out: prefer sets you have little of (aims for 2+2+2).
  mix: (p, info) => {
    const n = setCounts(p);
    return (info.set ? 6 - (n[info.set] || 0) * 2 : 0) + Math.random();
  },
  // Chase splices: prefer cards that would complete one.
  splice: (p, info) => (info.stirs ? 10 : 0) + Math.random(),
};

function pickCard(p, strategy) {
  const m = game.menu, score = STRATEGIES[strategy];
  let best = 0, bs = -Infinity;
  m.choices.forEach((c, i) => {
    const info = choiceInfo(p, c);
    const v = c.id === '_gorge' ? (p.hp < p.maxHp * 0.35 ? 8 : -5) : c.id === '_hyper' ? -3 : score(p, info); // gorge only when hurting; hypertrophy only if nothing else
    if (v > bs) { bs = v; best = i; }
  });
  return best;
}

function resolveMenus(strategy) {
  for (let guard = 0; game.menu && guard < 10; guard++) {
    const m = game.menu; m.t = 1; m.stageT = 1;
    Input.pressed.add(String(pickCard(game.player, strategy) + 1));
    update(1 / 60); Input.endFrame();
  }
}

// --- The bot ----------------------------------------------------------------------------
function botFrame(strategy) {
  Input.keys.clear(); Input.mouse.rightClicked = false;
  const p = game.player;
  if (game.state === 'play' && !game.menu && evolveReady(p) && !game.room.locked) Input.keys.add('f'); // cocoon once it's safe
  else if (game.state === 'play' && !game.menu) {
    const foes = game.enemies.filter(e => e.spawnT <= 0 && !e.dead);
    const e = foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (e) {
      Input.mouse.x = e.x - camX(); Input.mouse.y = e.y + ROOM_Y - camY(); // (screen = world - camera)
      const melee = !p.stats.guns.length && !p.stats.beam && !p.stats.howl && !p.stats.miasma;
      // Steering: a sum of pushes, turned into WASD.
      let vx = 0, vy = 0, danger = 0;
      // How far to hold: melee just inside reach; guns at about two-thirds of their real reach (short sneezes up close).
      const reachOf = () => Math.max(p.stats.beam ? p.stats.beamRange : 0, p.stats.howl ? p.stats.howl.range : 0, ...p.stats.guns.map(g => (g.lob ? 140 : g.speed * g.range * (1 + (p.stats.rangeAdd || 0)))));
      const keep = melee ? Math.max(10, (p.stats.biteReach || p.stats.lashRange || 18) * 0.6) : clamp(reachOf() * 0.65, 18, 46);
      for (const o of foes) { // keep your distance from everything (melee: close on the target, but no closer)
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1;
        const want = o === e ? keep : 34;
        if (d < want + o.r) { const k = (want + o.r - d) / want * 2; vx += dx / d * k; vy += dy / d * k; }
        else if (o === e && melee) { vx -= dx / d; vy -= dy / d; } // go get it
      }
      for (const b of game.bullets) { // dodge sideways out of a shot's path
        if (b.team !== 'enemy') continue;
        const rx = p.x - b.x, ry = p.y - b.y, sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
        const along = rx * ux + ry * uy; if (along < 0 || along > 90) continue; // behind it, or far off
        const side = rx * -uy + ry * ux, miss = Math.abs(side);
        if (miss > 10 + (b.r || 2)) continue;
        const s = side >= 0 ? 1 : -1, k = 2.5 * (1 - along / 90);
        vx += -uy * s * k; vy += ux * s * k;
        if (along / sp < 0.18) danger++;
      }
      for (const tg of game.telegraphs) { // get out of a boss's warning line before it lands
        if (!tg.dmg) continue;
        const x2 = tg.x + Math.cos(tg.ang) * tg.len, y2 = tg.y + Math.sin(tg.ang) * tg.len;
        if (distToSegment(p.x, p.y, tg.x, tg.y, x2, y2) > tg.w / 2 + p.r + 8) continue;
        const nx = -Math.sin(tg.ang), ny = Math.cos(tg.ang), s = ((p.x - tg.x) * nx + (p.y - tg.y) * ny) >= 0 ? 1 : -1;
        vx += nx * s * 4; vy += ny * s * 4;
        if (tg.t < 0.3) danger++;
      }
      for (const b of game.bombs) { // and out of a bomb's ring
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
        if (d < b.r + p.r + 8) { vx += dx / d * 4; vy += dy / d * 4; if (b.t < 0.3) danger++; }
      }
      for (const pd of game.puddles) { // stay out of enemy acid
        if (pd.team === 'player') continue;
        const dx = p.x - pd.x, dy = p.y - pd.y, d = Math.hypot(dx, dy) || 1;
        if (d < pd.r + 10) { vx += dx / d * 3; vy += dy / d * 3; }
      }
      vx += (ROOM_PX_W / 2 - p.x) / ROOM_PX_W * 0.6; vy += (ROOM_PX_H / 2 - p.y) / ROOM_PX_H * 0.6; // drift back from the walls
      if (Math.hypot(vx, vy) < 0.15) { const a = game.time * 1.7; vx = Math.cos(a); vy = Math.sin(a); } // nothing pushing: circle-strafe
      if (vx > 0.2) Input.keys.add('d'); if (vx < -0.2) Input.keys.add('a'); if (vy > 0.2) Input.keys.add('s'); if (vy < -0.2) Input.keys.add('w');
      if (danger && Math.random() < 0.5) Input.pressed.add(' '); // a shot about to land: dash
    }
    Input.mouse.down = !((p.stats.charge || p.stats.tongue) && Math.floor(game.time * 1.5) % 2); // charge builds let go now and then
    if (Math.random() < 0.02) Input.mouse.rightClicked = true; // limb ability now and then
  }
  update(1 / 60);
  Input.endFrame();
  resolveMenus(strategy);
}

function frames(n, strategy) { for (let i = 0; i < n && game.state === 'play'; i++) botFrame(strategy); }

// Between fights: eat corpses, take biomass and pickups, pick a door.
function tidyRoom(strategy) {
  const room = game.room, p = game.player;
  if (p.held) throwHeld(p);
  for (const c of room.corpses.slice()) {
    p.x = clamp(c.x - (p.stats.guns.length ? 22 : 9), TILE + 6, ROOM_PX_W - TILE - 6); p.y = c.y;
    for (let k = 0; k < 150 && !c.dead && game.state === 'play'; k++) {
      Input.keys.clear(); Input.mouse.x = c.x - camX(); Input.mouse.y = c.y + ROOM_Y - camY(); Input.mouse.down = !((p.stats.charge || p.stats.tongue) && k % 40 > 30);
      update(1 / 60); Input.endFrame(); resolveMenus(strategy);
    }
  }
  for (const o of room.orbs.slice()) { p.x = o.x; p.y = o.y; frames(20, strategy); }
  for (const pk of room.pickups.slice()) { p.x = pk.x; p.y = pk.y; frames(3, strategy); }
  for (const d in room.seals || {}) { // a hazmat seal: attack it until it breaks
    if (!sealAt(room, d)) continue;
    const c = doorCenter(d);
    for (let k = 0; k < 600 && sealAt(room, d) && game.state === 'play'; k++) {
      p.x = clamp(c.x, TILE + 8, ROOM_PX_W - TILE - 8); p.y = clamp(c.y, TILE + 8, ROOM_PX_H - TILE - 8); p.mvx = p.mvy = 0;
      Input.keys.clear(); Input.mouse.x = c.x - camX(); Input.mouse.y = c.y + ROOM_Y - camY(); Input.mouse.down = true;
      update(1 / 60); Input.endFrame(); resolveMenus(strategy);
    }
  }
}

function leaveRoom(strategy) {
  const room = game.room, p = game.player;
  if (room.hatch) { p.x = ROOM_PX_W / 2; p.y = ROOM_PX_H / 2; frames(2, strategy); return; }
  const names = Object.keys(room.doors), unv = names.filter(n => !room.doors[n].visited);
  const dir = unv.length ? pick(unv) : pick(names);
  const spots = { up: [ROOM_PX_W / 2, 15], down: [ROOM_PX_W / 2, ROOM_PX_H - 15], left: [15, ROOM_PX_H / 2], right: [ROOM_PX_W - 15, ROOM_PX_H / 2] }; // (this room's door spots: rooms come in sizes)
  p.x = spots[dir][0]; p.y = spots[dir][1];
  for (let k = 0; k < 50 && game.room === room; k++) {
    Input.keys.clear(); Input.keys.add(dir === 'up' ? 'w' : dir === 'down' ? 's' : dir === 'left' ? 'a' : 'd'); Input.mouse.down = false;
    update(1 / 60); Input.endFrame();
  }
  const exitRoom = game.floor.rooms.find(r => r.type === 'exit');
  if (exitRoom.visited && exitRoom.cleared && !unv.length) enterRoom(exitRoom, 'up');
}

// --- One run ---------------------------------------------------------------------------
const MAX_FRAMES = 60 * 60 * 15; // 15 minutes of game time
const STALL = 60 * 60;           // a fight still going after a minute: call it a stall

// Forced builds (?build=thornstorm,fractured,chestburster): those parts, fully
// pathed, from the start of every run, so a reported combo can be measured.
// Their slots are opened; the rest of the run plays as normal.
function forceBuild(p, ids) {
  const pathTo = id => { const out = [id]; while (MUTATIONS[out[0]].from) out.unshift(MUTATIONS[out[0]].from); return out; };
  for (const id of ids) {
    if (!MUTATIONS[id]) throw new Error('unknown part in build: ' + id);
    const path = pathTo(id), loc = locOf(path[0]);
    const at = p.parts.findIndex(m => m.loc === loc && (m.starter || partsAt(p, loc).length >= LOC_MAX[loc]));
    const part = { id, path, loc, lvl: 0 };
    if (at >= 0) p.parts.splice(at, 1, part); else p.parts.push(part);
  }
  p.capacity = Math.max(p.capacity, p.parts.length);
  if (game.room.cage) game.room.cage = null; // (the starting cell: you already have a weapon)
  recomputeStats(p); p.hp = p.maxHp;
}

let FORCED = null; // set from ?build=
function playRun(seed, strategy) {
  Math.random = mulberry32(seed);
  newRun(); game.state = 'play';
  if (FORCED) forceBuild(game.player, FORCED);
  const p0 = game.player;
  let frame = 0, hurt = 0, lockedFor = 0, stalls = 0, lastHp = p0.hp;
  const floorAt = {};
  while (game.state === 'play' && game.depth < 6 && frame < MAX_FRAMES) {
    const before = game.depth;
    if (game.room.locked) {
      frames(30, strategy); frame += 30; lockedFor += 30;
      if (lockedFor > STALL) { stalls++; lockedFor = 0; for (const e of game.enemies.slice()) damageEnemy(e, 9999, 0, 0, true); }
    } else {
      lockedFor = 0;
      frames(10, strategy); frame += 10;
      if (game.state !== 'play') break;
      tidyRoom(strategy);
      // Evolve while it's safe: hold F until the cocoon opens (then the cards are picked by the strategy).
      for (let k = 0; k < 400 && game.state === 'play' && !game.room.locked && evolveReady(game.player); k++) {
        Input.keys.clear(); Input.keys.add('f'); update(1 / 60); Input.endFrame(); resolveMenus(strategy); frame++;
      }
      Input.keys.clear();
      leaveRoom(strategy); frame += 60;
    }
    const p = game.player;
    if (p.hp < lastHp) hurt += lastHp - p.hp;
    lastHp = p.hp;
    if (game.depth !== before) floorAt[game.depth] = frame;
  }
  const p = game.player;
  return {
    seed, strategy, depth: game.depth, died: game.state !== 'play', kills: game.kills, minutes: +(frame / 3600).toFixed(2),
    hurt: +(hurt / HP_PER_HEART).toFixed(1), stalls, floorAt,
    parts: p.parts.filter(m => !m.starter).map(m => m.path.slice()),
    sets: setCounts(p), set: (activeSet(p) || {}).set || null, splices: activeSplices(p),
  };
}

// --- The report ----------------------------------------------------------------------------
function summarize(runs) {
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const all = mean(runs.map(r => r.depth)), sd = Math.sqrt(mean(runs.map(r => (r.depth - all) ** 2))) || 1;
  // Fair comparisons: a part is only compared with runs that also got that slot
  // filled (late slots like BACK only exist in runs that already went deep); a
  // set bonus with runs of 3+ parts; a set pair with runs of 4+ parts.
  const nParts = r => r.parts.length;
  const locOfPath = path => locOf(path[0]);
  const baseOf = filter => { const rs = runs.filter(filter); const m = mean(rs.map(r => r.depth)); return { m, sd: Math.sqrt(mean(rs.map(r => (r.depth - m) ** 2))) || 1 }; };
  const group = (keyFn, baseFn = () => ({ m: all, sd })) => {
    const g = {};
    for (const r of runs) for (const k of new Set(keyFn(r))) (g[k] = g[k] || []).push(r);
    return Object.entries(g).map(([k, rs]) => {
      const depth = mean(rs.map(r => r.depth)), base = baseFn(k, rs);
      return { key: k, n: rs.length, depth: +depth.toFixed(2), vs: +base.m.toFixed(2), survive: +(rs.filter(r => !r.died).length / rs.length * 100).toFixed(0),
        kpm: +mean(rs.map(r => r.kills / Math.max(0.1, r.minutes))).toFixed(1), hurt: +mean(rs.map(r => r.hurt)).toFixed(1), stalls: +mean(rs.map(r => r.stalls)).toFixed(1),
        z: +((depth - base.m) / base.sd).toFixed(2) };
    }).sort((a, b) => b.z - a.z);
  };
  const slotBase = {}; for (const loc of LOCS) slotBase[loc] = baseOf(r => r.parts.some(path => locOfPath(path) === loc));
  const nameLoc = {}; for (const id in MUTATIONS) nameLoc[MUTATIONS[id].name] = locOf(id);
  const bySlot = k => slotBase[nameLoc[k]] || { m: all, sd };
  const setPair = r => { const ks = Object.keys(r.sets).filter(k => r.sets[k] >= 2).sort(); const out = []; for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) out.push(ks[i] + ' + ' + ks[j]); return out; };
  const base3 = baseOf(r => nParts(r) >= 3), base4 = baseOf(r => nParts(r) >= 4), base2 = baseOf(r => nParts(r) >= 2);
  return {
    runs: runs.length, depth: +all.toFixed(2), sd: +sd.toFixed(2),
    survive: +(runs.filter(r => !r.died).length / runs.length * 100).toFixed(0),
    stalls: runs.reduce((s, r) => s + r.stalls, 0),
    strategies: group(r => [r.strategy]),
    sets: group(r => nParts(r) >= 3 ? [r.set || '(no set bonus)'] : [], () => base3),
    setPairs: group(setPair, () => base4),
    splices: group(r => nParts(r) >= 2 ? (r.splices.length ? r.splices.map(k => SPLICES[k].name) : ['(none)']) : [], () => base2),
    parts: group(r => r.parts.map(path => MUTATIONS[path[path.length - 1]].name), bySlot),
    roots: group(r => r.parts.map(path => MUTATIONS[path[0]].name), bySlot),
  };
}

function renderReport(sum, el) {
  const MIN_N = Math.max(3, Math.round(sum.runs * 0.03)); // too few runs to say anything: greyed out
  const row = (x, label) => {
    const few = x.n < MIN_N, flag = few ? '' : x.z >= 0.75 ? 'strong' : x.z <= -0.75 ? 'weak' : '';
    return `<tr class="${few ? 'few' : flag}"><td>${label || x.key}</td><td>${x.n}</td><td>${x.depth}</td><td>${x.vs}</td><td>${x.survive}%</td><td>${x.kpm}</td><td>${x.hurt}</td><td>${x.stalls}</td><td>${few ? '' : (x.z > 0 ? '+' : '') + x.z}</td><td>${flag ? flag.toUpperCase() : ''}</td></tr>`;
  };
  const table = (title, rows, note) => `<h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ''}<table><tr><th></th><th>runs</th><th>avg floor</th><th>vs. similar runs</th><th>survived</th><th>kills/min</th><th>hearts lost</th><th>stalls</th><th>z</th><th></th></tr>${rows.map(x => row(x)).join('')}</table>`;
  el.innerHTML = `
    <h1>Aberrant Strain: balance report</h1>
    <p>${sum.runs} runs. Average floor reached <b>${sum.depth}</b> (sd ${sum.sd}); ${sum.survive}% reached floor 6 alive. ${sum.stalls} fights stalled (bot couldn't finish them in a minute).</p>
    <p class="note">Stalls = fights per run the bot couldn't finish in a minute (the harness clears them, which flatters slow builds: a high stall count means the floor reached is optimistic). "vs. similar runs" is the fair baseline: for a part, runs that also filled that slot (late slots only exist in runs that went deep); for a set bonus, runs with 3+ parts; for a pair, 4+ parts. z = how far above or below that baseline, in standard deviations. STRONG (z &ge; 0.75) and WEAK (z &le; -0.75) are worth a look; grey rows have too few runs (&lt; ${MIN_N}) to trust. A part appears in every run that ended with it on the body.</p>
    <h2>What hurts the bot</h2><p class="note">Hearts lost, by the game function that dealt the hit and the nearest enemy. Big numbers here are either a dangerous enemy or a gap in the bot.</p>
    <table><tr><th>source</th><th>hearts</th></tr>${(sum.hurtBy || []).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    ${table('By strategy', sum.strategies)}
    ${table('By active set bonus (end of run)', sum.sets)}
    ${table('By set pair (2+ parts of each)', sum.setPairs, 'Hints at hidden-combo potential: pairs that do well together.')}
    ${table('By splice formed', sum.splices)}
    ${table('By root (what each tree started as)', sum.roots)}
    ${table('By end form (the part as it ended)', sum.parts)}`;
}

// --- Entry ------------------------------------------------------------------------------------
// What hurts the bot: every hit, by the game function that dealt it and the nearest enemy.
const HURT_BY = {};
function watchHurts() {
  const real = hurtPlayer;
  hurtPlayer = function (...a) {
    const p = game.player, h0 = p.hp, out = real.apply(this, a);
    if (p.hp < h0) {
      const fn = ((new Error().stack || '').split('\n')[2] || '').trim().replace(/^at /, '').split(' ')[0];
      const near = game.enemies.filter(e => !e.dead).sort((x, y) => Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y))[0];
      const k = `${fn} (near ${near ? ENEMY_TYPES[near.type].name : 'nothing'})`;
      HURT_BY[k] = (HURT_BY[k] || 0) + (h0 - p.hp) / HP_PER_HEART;
    }
    return out;
  };
}

// --- Auto-tuning (?autotune=1&runs=30&rounds=3) --------------------------------------------
// Nudges each WEAPON tree's damage (TUNE in mutations.js) toward the median
// weapon. Each tree is measured by playing its first-evolution forms as forced
// builds on the same seeds every round (so differences come from the tuning,
// not luck), scored by floor reached (kill speed breaks ties), then moved
// toward the median by at most 15% a round, and never past 0.6x-1.6x overall.
function measureBuild(ids, runsPer, seed0) {
  const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  FORCED = ids; const rs = [];
  for (let i = 0; i < runsPer; i++) { try { rs.push(playRun(seed0 + i * 7919, 'random')); } catch (e) { rs.push({ depth: 1, kills: 0, minutes: 1 }); } } // a crash scores as a floor-1 death
  FORCED = null;
  const depth = mean(rs.map(r => r.depth)), kpm = mean(rs.map(r => r.kills / Math.max(0.1, r.minutes)));
  return { depth, kpm, score: depth + 0.02 * kpm };
}

function runAutotune(runsPer, rounds, seed0) {
  const roots = Object.keys(MUTATIONS).filter(id => !MUTATIONS[id].from && !MUTATIONS[id].part && locOf(id) === 'MOUTH');
  const formsOf = r => (childrenOf(r).length ? childrenOf(r) : [r]);
  const start = {}, history = [];
  for (let round = 0; round <= rounds; round++) {
    const scores = {};
    for (const r of roots) {
      const ms = formsOf(r).map(id => measureBuild([id], runsPer, seed0));
      scores[r] = { score: ms.reduce((s, m) => s + m.score, 0) / ms.length, depth: ms.reduce((s, m) => s + m.depth, 0) / ms.length };
    }
    if (round === 0) Object.assign(start, scores);
    const sorted = Object.values(scores).map(s => s.score).sort((a, b) => a - b), target = sorted[Math.floor(sorted.length / 2)];
    history.push({ round, target: +target.toFixed(2), spread: +(sorted[sorted.length - 1] - sorted[0]).toFixed(2) });
    if (round === rounds) return { roots, start, end: scores, history, tune: { ...TUNE } };
    for (const r of roots) { // nudge toward the median
      const step = clamp(Math.pow(target / Math.max(0.5, scores[r].score), 0.8), 0.85, 1.15);
      TUNE[r] = +clamp((TUNE[r] || 1) * step, 0.6, 1.6).toFixed(3);
    }
  }
}

function renderAutotune(res, el) {
  const name = id => MUTATIONS[id].name, rows = res.roots.map(r => ({ r, a: res.start[r], b: res.end[r], t: res.tune[r] || 1 })).sort((x, y) => x.t - y.t);
  el.innerHTML = `<h1>Aberrant Strain: weapon auto-tune</h1>
    <p>Each weapon tree, scored by how far its first-evolution forms got (forced builds, same seeds every round), then its damage nudged toward the median weapon. Took ${res.seconds}s.</p>
    <table><tr><th>round</th><th>median score</th><th>best - worst</th></tr>${res.history.map(h => `<tr><td>${h.round}</td><td>${h.target}</td><td>${h.spread}</td></tr>`).join('')}</table>
    <h2>Per weapon</h2><table><tr><th>weapon tree</th><th>floor before</th><th>floor after</th><th>damage tune</th></tr>
    ${rows.map(x => `<tr class="${x.t < 0.95 ? 'weak' : x.t > 1.05 ? 'strong' : ''}"><td>${name(x.r)}</td><td>${x.a.depth.toFixed(2)}</td><td>${x.b.depth.toFixed(2)}</td><td>${x.t.toFixed(2)}x</td></tr>`).join('')}</table>
    <h2>TUNE (for src/mutations.js)</h2><pre>const TUNE = ${JSON.stringify(Object.fromEntries(Object.entries(res.tune).filter(([, v]) => Math.abs(v - 1) >= 0.02).sort()))};</pre>`;
}

function runBalance() {
  watchHurts();
  const q = new URLSearchParams(location.search);
  if (q.get('autotune')) {
    const realRandom = Math.random, t0 = performance.now();
    const res = runAutotune(+(q.get('runs') || 30), +(q.get('rounds') || 3), +(q.get('seed') || 1));
    Math.random = realRandom; res.seconds = +((performance.now() - t0) / 1000).toFixed(0);
    document.getElementById('game').style.display = 'none';
    renderAutotune(res, document.getElementById('report'));
    document.getElementById('out').textContent = JSON.stringify({ autotune: res }, null, 0);
    return;
  }
  const runsPer = +(q.get('runs') || 40), seed0 = +(q.get('seed') || 1);
  const strategies = (q.get('strategies') || 'random,focus,mix,splice').split(',').filter(s => STRATEGIES[s]);
  FORCED = q.get('build') ? q.get('build').split(',').map(s => s.trim()).filter(Boolean) : null;
  const realRandom = Math.random, runs = [], t0 = performance.now();
  for (const strategy of strategies) for (let i = 0; i < runsPer; i++) {
    try { runs.push(playRun(seed0 + i * 7919 + strategies.indexOf(strategy) * 104729, strategy)); }
    catch (e) { runs.push({ seed: seed0 + i, strategy, error: String(e && e.stack || e), depth: 0, died: true, kills: 0, minutes: 0, hurt: 0, stalls: 0, parts: [], sets: {}, set: null, splices: [] }); }
  }
  Math.random = realRandom;
  const errors = runs.filter(r => r.error);
  const sum = summarize(runs.filter(r => !r.error));
  sum.seconds = +((performance.now() - t0) / 1000).toFixed(0); sum.errors = errors.length;
  sum.hurtBy = Object.entries(HURT_BY).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, +v.toFixed(1)]);
  document.getElementById('game').style.display = 'none';
  renderReport(sum, document.getElementById('report'));
  if (errors.length) document.getElementById('report').insertAdjacentHTML('afterbegin', `<p class="err">${errors.length} runs crashed. First: <pre>${errors[0].error.replace(/</g, '&lt;')}</pre></p>`);
  document.getElementById('out').textContent = JSON.stringify({ summary: sum, runs }, null, 0);
}
