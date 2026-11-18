'use strict';
// ---------------------------------------------------------------------------
// HUD, minimap, the evolution (pick 1 of 3) screen, and full screens.
// ---------------------------------------------------------------------------

// --- Evolution screen -----------------------------------------------------------
// Pick one of 3 cards. A card is a new PART for a free slot, or the next
// BRANCH of a part you're growing (which locks out its sibling). Cards
// deliberately do NOT explain what mutations do: you learn by growing them.

function openEvolution(opts) {
  const p = game.player;
  if (opts.apex) { becomeApex(p); return; } // the ultimate metamorphosis has no cards
  game.menu = {
    choices: opts.evolve && p.parts.includes(opts.evolve) && childrenOf(opts.evolve.id).length ? childrenOf(opts.evolve.id).map(id => ({ id, kind: 'branch', part: opts.evolve }))
      : opts.trait ? traitCards(p, opts.trait).concat([{ id: '_gorge' }]) : opts.levelUp ? rollLevelUps(p, 3) : rollChoices(p, 3, opts.minRarity, opts.slot || opts.loc, opts.plain),
    color: opts.color,
    slotsLeft: freeSlots(p),
    src: opts,
    title: opts.title || 'EVOLUTION',
    sub: opts.trait ? 'YOU ARE WHAT YOU EAT' : opts.evolve ? MUTATIONS[opts.evolve.id].name.toUpperCase() + ' IS READY TO CHANGE' : opts.levelUp ? `LEVEL ${p.level} - GROW A PART` : opts.slot ? 'ITS CORE BECOMES YOURS' : opts.loc ? `GROW A ${LOC_NAME[opts.loc] || opts.loc}` + (opts.minRarity ? ' - UNCOMMON OR BETTER' : '') : `LEVEL ${p.level} - CHOOSE A MUTATION`,
    hover: -1, t: 0,
    stage: 'cards', stageT: 0,
  };
  Sfx.play('evolve');
}

const CARD = { w: 94, h: 146, gap: 7, y: 50 };

function cardX(i, n) {
  const total = n * CARD.w + (n - 1) * CARD.gap;
  return Math.round((VIEW_W - total) / 2) + i * (CARD.w + CARD.gap);
}

// Your first weapon can't be put off: a body is never left with no attack.
function mustChoose(p, menu) {
  return !partAt(p, 'MOUTH') && menu.choices.some(c => c.id !== '_gorge' && MUTATIONS[c.id] && locOf(c.id) === 'MOUTH' && !MUTATIONS[c.id].from);
}

function putOffEvolution(p, src) {
  if (src && src.fromDna) { p.level--; p.dna += dnaNeeded(p.level); } // the DNA goes back in the bar
  else if (src) game.pendingEvolutions.unshift(src);                   // the vial / core waits
  game.evolving = false;
  p.snoozeRoom = game.room;
  closeMenu();
  emergeFromCocoon(p);
  floatText(p.x, p.y - 14, 'NOT YET', PAL.slate);
}

function closeMenu() {
  game.menu = null;
  game.player.fireT = 0.3; // don't fire from the click that closed the menu
}

function updateMenu(dt) {
  const menu = game.menu, p = game.player;
  menu.t += dt;
  menu.stageT += dt;
  const mx = Input.mouse.x, my = Input.mouse.y;
  const n = menu.choices.length;
  menu.hover = -1;
  for (let i = 0; i < n; i++) {
    const x = cardX(i, n);
    if (mx >= x && mx < x + CARD.w && my >= CARD.y && my < CARD.y + CARD.h) menu.hover = i;
  }
  if (menu.t < 0.5 || menu.stageT < 0.2) return; // ignore input briefly so a held fire button doesn't pick by accident

  // Esc: not now. Everything waiting stays banked; hold F in a cleared room later.
  if (Input.hit('escape') && !mustChoose(p, menu)) { putOffEvolution(p, menu.src); return; }

  let choice = -1;
  for (let i = 0; i < n; i++) if (Input.hit(String(i + 1))) choice = i;
  if (Input.mouse.clicked && menu.hover >= 0) choice = menu.hover;
  if (choice < 0) return;

  applyChoice(p, menu.choices[choice]);
  closeMenu();
}

function drawCard(ctx, info, i, x, y, menu) {
  const { w, h } = CARD;
  const hover = menu.stage === 'cards' && menu.hover === i;
  const rc = RARITY[info.rarity].color;
  const frame = info.malignant ? MALIGNANT_COLOR : rc;

  ctx.fillStyle = PAL.black; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = frame; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = info.malignant ? (hover ? '#28162e' : '#1a0e1e') : hover ? '#221a1e' : '#141014';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  if (hover) { ctx.fillStyle = frame; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + h - 2, w - 2, 1); }
  if (info.rarity === 'legendary') {
    ctx.fillStyle = '#fff0c0';
    for (let k = 0; k < 4; k++) {
      const pos = (menu.t * 90 + k * (w + h) / 2) % ((w + h) * 2);
      let sx, sy;
      if (pos < w) { sx = x + pos; sy = y; }
      else if (pos < w + h) { sx = x + w - 1; sy = y + pos - w; }
      else if (pos < w * 2 + h) { sx = x + w - 1 - (pos - w - h); sy = y + h - 1; }
      else { sx = x; sy = y + h - 1 - (pos - w * 2 - h); }
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 1);
    }
  }

  const cx = x + w / 2;
  if (info.malignant) {
    drawText(ctx, 'MALIGNANT', cx, y + 5, MALIGNANT_COLOR, 1, 'center');
    ctx.fillStyle = rc; ctx.fillRect(x + 4, y + 5, 4, 5);
  } else {
    drawText(ctx, RARITY[info.rarity].label, cx, y + 5, rc, 1, 'center');
  }

  // The mutation's art, in a dark specimen window.
  ctx.fillStyle = '#060405';
  ctx.fillRect(Math.round(cx - 27), y + 13, 54, 52);
  ctx.fillStyle = info.malignant ? '#1e0e22' : '#120d0f';
  ctx.fillRect(Math.round(cx - 26), y + 14, 52, 50);
  const bob = Math.round(Math.sin(menu.t * 3 + i) * 1);
  const icon = mutIcon(info.id), old = info.from && mutIcon(info.from);
  if (old && icon) { // evolving: the part as it is now, an arrow, and what it becomes
    ctx.drawImage(old, Math.round(cx - 26), y + 31, 16, 16);
    ctx.fillStyle = PAL.white;
    for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(cx - 10 + k), y + 39 - (2 - k), 1, 1 + (2 - k) * 2);
    ctx.drawImage(icon, Math.round(cx - 6), y + 23 + bob, 32, 32);
  } else if (icon) ctx.drawImage(icon, Math.round(cx - 24), y + 15 + bob, 48, 48);

  let ty = y + 70;
  for (const line of wrapText(info.name.toUpperCase(), 20)) { drawText(ctx, line, cx, ty, rc, 1, 'center'); ty += 8; }
  if (info.slot) drawText(ctx, `[${LOC_NAME[info.slot] || info.slot}] ${LOC_TAG[info.slot] || ''}`.trim(), cx, ty, PAL.slate, 1, 'center', null);
  // Its set, and whether it moves you toward a set bonus.
  if (info.set) {
    const S = SETS[info.set], after = info.setAfter;
    ctx.fillStyle = S.color; ctx.fillRect(x + 4, y + 4, 4, 4); ctx.fillRect(x + w - 8, y + 4, 4, 4);
    ty += 8;
    drawText(ctx, S.name + (after >= 2 ? ` ${after}/${after >= 3 ? 5 : 3}` : ''), cx, ty, S.color, 1, 'center', null);
  }
  // Growth pips: how far along its path this card takes the slot.
  if (info.tier) {
    for (let l = 0; l < 3; l++) { ctx.fillStyle = l <= info.tier ? rc : '#2a2222'; ctx.fillRect(Math.round(cx - 7 + l * 5), ty + 8, 4, 2); }
    ty += 4;
  }
  // Level dots: how close this level-up takes the part to its next evolution.
  if (info.level) {
    for (let l = 0; l < LEVEL_MAX; l++) { ctx.fillStyle = l < info.level ? VIAL_COLOR : '#2a2222'; ctx.fillRect(Math.round(cx - 7 + l * 5), ty + 8, 4, 2); }
    ty += 4;
  }
  ty += 10;
  if (info.status) { drawText(ctx, info.status, cx, ty, PAL.white, 1, 'center'); ty += 10; }
  if (info.note) {
    for (const line of (info.noteLines || [info.note]).flatMap(n => wrapText(n.toUpperCase(), 21))) { drawText(ctx, line, cx, ty, info.noteColor, 1, 'center', null); ty += 7; }
  }

  // It would complete a splice: don't say which, just let it pulse.
  else if (info.stirs && Math.floor(menu.t * 3) % 3) drawText(ctx, 'SOMETHING STIRS', cx, y + h - 20, VIAL_COLOR, 1, 'center');
  drawText(ctx, `[${i + 1}]`, cx, y + h - 10, hover ? rc : PAL.slate, 1, 'center');
}

function drawMenu(ctx) {
  const menu = game.menu, p = game.player;
  ctx.fillStyle = 'rgba(4,2,4,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const mutagen = menu.title === 'MUTAGEN';
  drawText(ctx, menu.title, VIEW_W / 2, 18, menu.color || (mutagen ? VIAL_COLOR : PAL.red), 2, 'center');
  drawText(ctx, menu.sub, VIEW_W / 2, 36, PAL.slate, 1, 'center');
  const free = freeSlots(p);
  drawText(ctx, free > 0 ? `${free} FREE SLOT${free > 1 ? 'S' : ''}` : 'NO FREE SLOTS', VIEW_W - 4, 4, free > 0 ? VIAL_COLOR : PAL.slate, 1, 'right');

  const n = menu.choices.length;
  menu.choices.forEach((c, i) => {
    const appear = clamp((menu.t - i * 0.08) / 0.2, 0, 1);
    if (appear <= 0) return;
    const x = cardX(i, n);
    const y = CARD.y + Math.round((1 - appear) * 24) - (menu.stage === 'cards' && menu.hover === i ? 2 : 0);
    drawCard(ctx, choiceInfo(p, c), i, x, y, menu);
  });

  if (menu.t > 0.5) {
    // Hovering a card: what that kind of part does, in plain words.
    const hov = menu.hover >= 0 && menu.choices[menu.hover] && choiceInfo(p, menu.choices[menu.hover]);
    const help = hov && (hov.kind === 'level' ? LEVEL_HELP : LOC_HELP[hov.slot]);

    if (help) wrapText(help, 76).slice(0, 2).forEach((line, i) => drawText(ctx, line, VIEW_W / 2, 201 + i * 8, '#c8b8a8', 1, 'center'));
    else drawText(ctx, mustChoose(p, menu) ? 'PRESS 1-3 OR CLICK A CARD  -  CHOOSE YOUR FIRST WEAPON' : 'PRESS 1-3 OR CLICK A CARD  -  ESC: NOT YET', VIEW_W / 2, 206, PAL.slate, 1, 'center');
  }
}

// What each kind of part is for: a short tag on the card, and a line when you hover it.
const LOC_TAG = { MOUTH: 'ATTACK', LIMBS: 'MOVEMENT', HEAD: 'SENSES', BACK: 'DASH/HIT', CORE: 'PASSIVE' };
const LOC_HELP = {
  MOUTH: 'WEAPON: AN ATTACK. YOU HAVE ROOM FOR TWO, AND BOTH FIRE WHEN YOU SHOOT.',
  LIMBS: 'LIMBS: HOW YOU MOVE, PLUS A RIGHT-CLICK (E) ABILITY. ONE SET AT A TIME.',
  HEAD: 'HEAD: SENSES, PLUS AN ABILITY THAT FIRES BY ITSELF. YOU ONLY HAVE ONE HEAD.',
  BACK: 'BACK: GOES OFF WHEN YOU DASH OR GET HIT. ONE BACK.',
  CORE: 'CORE: ALWAYS ON. MAKES YOUR WHOLE BODY STRONGER OR TOUGHER. ONLY FROM BOSS CORES.',
};
const LEVEL_HELP = 'LEVEL UP: A SMALL BOOST TO THIS PART. AT LEVEL 3 IT EVOLVES INTO SOMETHING NEW.';

// --- HUD --------------------------------------------------------------------------
function drawHUD(ctx) {
  const p = game.player;
  bakeHud();
  ctx.drawImage(SPR.hudTop, 0, 0);
  ctx.drawImage(SPR.hudBottom, 0, ROOM_Y + ROOM_PX_H);

  // Hearts (+ chitin shell)
  // Health is in half hearts: each heart icon is full, half or empty.
  const hearts = Math.ceil(p.maxHp / HP_PER_HEART);
  for (let i = 0; i < hearts; i++) {
    const left = p.hp - i * HP_PER_HEART; // what's left in this heart
    ctx.drawImage(left >= HP_PER_HEART ? SPR.heart : left > 0 ? halfHeart() : SPR.heartEmpty, 4 + i * 9, 3);
  }
  if (!SPR.armorHeart) SPR.armorHeart = silhouette(SPR.heart, '#a8a8b8');
  for (let i = 0; i < (p.armor || 0); i++) ctx.drawImage(SPR.armorHeart, 4 + (hearts + i) * 9, 3); // grey armor hearts
  if (p.stats.shieldCd > 0) {
    const sx = 6 + (hearts + (p.armor || 0)) * 9;
    ctx.globalAlpha = p.shieldUp ? 1 : 0.3;
    ctx.drawImage(SPR.icons.chitin, sx - 3, 0, 12, 12);
    ctx.globalAlpha = 1;
  }

  drawDnaTube(ctx, p);

  drawText(ctx, `FLOOR ${game.depth}`, 5, 21, PAL.silver);
  if (p.stats.starve > 0 && p.hungerT > p.stats.starve * 0.5) {
    // Hunger warning: steady, then blinking when you're about to starve.
    const urgent = p.hungerT > p.stats.starve - 6;
    if (!urgent || Math.floor(game.time * 4) % 2) drawText(ctx, urgent ? 'STARVING' : 'HUNGRY', 48, 21, COST_COLOR);
  } else if (Sfx.muted) drawText(ctx, 'MUTED', 48, 21, PAL.slate);

  // Room status message
  const room = game.room;
  let msg = null, col = PAL.white;
  if (p.evolveT > 0) { msg = 'YOU ARE CHANGING...'; col = VIAL_COLOR; }
  else if (evolveReady(p) && !room.locked && !safeToCocoon(p)) { msg = 'GET OUT OF THE ACID TO EVOLVE'; col = VIAL_COLOR; }
  else if (evolveReady(p) && !room.locked && p.snoozeRoom === room && Math.floor(game.time * 2.5) % 2) { msg = 'HOLD [F] TO EVOLVE'; col = VIAL_COLOR; }
  else if (room.locked) { if (Math.floor(game.time * 3) % 2) { msg = 'CONTAINMENT LOCKDOWN'; col = PAL.red; } }
  else if (room.hatch) { msg = 'HATCH OPEN - DESCEND'; col = PAL.lime; }
  else if (!partAt(p, 'MOUTH') && room.pickups.some(k => k.kind === 'vial' && k.loc === 'MOUTH')) { msg = 'YOU HAVE NO WEAPON - TAKE THE RED VIAL'; col = vialColor('MOUTH'); }
  else if (room.orbs.length) { msg = 'BIOMASS SPILLED'; col = VIAL_COLOR; }
  else if (room.corpses.length) { msg = 'FRESH MEAT - DEVOUR IT'; col = VIAL_COLOR; }
  else if (room.type === 'vault') { msg = (room.vialLoc || 'MUTAGEN') + ' VAULT'; col = vialColor(room.vialLoc); }
  else if (room.seals && Object.keys(room.seals).some(d => sealAt(room, d))) { msg = 'SEALED SAMPLE - BREAK IT OPEN'; col = '#e8c020'; }
  if (msg) drawText(ctx, msg, VIEW_W / 2, 24, col, 1, 'center');

  drawMinimap(ctx);
  drawActiveIcons(ctx, p);
  drawMutationList(ctx);
}

// A glass tube of sloshing pink DNA.
function drawDnaTube(ctx, p) {
  const need = dnaNeeded(p.level);
  const tx = 110, ty = 4, inner = 96;
  ctx.drawImage(SPR.dnaTube, tx, ty);
  const fill = Math.round(inner * Math.min(1, p.dna / need));
  const shades = ['#e8a0b8', '#c96a8f', '#c96a8f', '#8a3a5a', '#8a3a5a', '#6a2a44', '#4a1a30'];
  for (let col = 0; col < fill; col++) {
    const slosh = Math.round(Math.sin(game.time * 3 + col * 0.25) * 0.6);
    for (let row = Math.max(0, slosh); row < 7; row++) {
      ctx.fillStyle = shades[row];
      ctx.fillRect(tx + 2 + col, ty + 1 + row, 1, 1);
    }
  }
  // Bubbles rising through the fluid.
  for (let k = 0; k < 3 && fill > 4; k++) {
    const bxp = (k * 37 + Math.floor(game.time * 9)) % fill;
    const byp = 6 - Math.floor((game.time * 6 + k * 2) % 6);
    ctx.fillStyle = '#f4c8d8';
    ctx.fillRect(tx + 2 + bxp, ty + 1 + byp, 1, 1);
  }
  ctx.fillStyle = 'rgba(200,230,220,0.25)';
  ctx.fillRect(tx + 2, ty + 1, inner, 1); // glass glint
  // Full: the tube glows and throbs, waiting for you to cocoon.
  const full = fill >= inner;
  if (full) {
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(game.time * 6);
    ctx.fillStyle = '#f4c8d8';
    ctx.fillRect(tx + 2, ty + 1, inner, 7);
    ctx.globalAlpha = 1;
  }
  drawText(ctx, full ? (game.room.locked ? 'BIOMASS FULL - CLEAR ROOM' : 'BIOMASS READY') : `BIOMASS ${p.dna}/${need}`, VIEW_W / 2, 16, full ? VIAL_COLOR : '#8a6a74', 1, 'center');
}

function drawMinimap(ctx) {
  const ox = VIEW_W - 66, oy = 3;
  for (const r of game.floor.rooms) {
    if (!r.visited && !r.seen) continue;
    const x = ox + (r.gx + 4) * 7, y = oy + (r.gy + 2) * 5;
    const current = r === game.room;
    ctx.fillStyle = current ? (Math.floor(game.time * 4) % 2 ? '#e8d8c8' : PAL.red) : r.visited ? '#3e3434' : '#1e1818';
    ctx.fillRect(x, y, 6, 4);
    let mark = null;
    if (r.type === 'exit') mark = PAL.red;
    if (r.type === 'vault') mark = vialColor(r.vialLoc);
    if ((r.corpses.length || r.orbs.length) && r.visited) mark = '#e8a0b8';
    if (mark && !current) { ctx.fillStyle = mark; ctx.fillRect(x + 2, y + 1, 2, 2); }
  }
}

function mutColor(p, id) {
  const d = getMutDef(id);
  if (id === 'secondheart' && p.secondHeartUsed) return PAL.dark;
  return d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color;
}

// Your body: one panel per slot along the bottom. Spliced parts are joined
// by a glowing seam; free slots wait, empty. The bar always shows all six slots, in two groups: WEAPON x2 | LIMBS HEAD BACK CORE.
// Locked ones say which comes next: each devoured boss core opens one.
const BAR_LAYOUT = ['MOUTH', 'MOUTH', 'LIMBS', 'HEAD', 'BACK', 'CORE'];
function drawMutationList(ctx) {
  const p = game.player;
  const top = ROOM_Y + ROOM_PX_H + 3;
  const groupGap = 6, pitch = Math.floor((316 - groupGap) / BAR_LAYOUT.length);
  const cellX = i => 3 + i * pitch + (i >= 2 ? groupGap : 0);
  // Which part sits in which cell, and which cells are open.
  const seen = {}, cellPart = [], cellOpen = [];
  BAR_LAYOUT.forEach((loc, i) => {
    const k = seen[loc] = (seen[loc] || 0) + 1;
    cellPart[i] = partsAt(p, loc).filter(m => !m.starter)[k - 1] || null;
    cellOpen[i] = k <= slotsAt(p, loc);
  });
  const spliced = new Set();
  for (const k of p.splices) for (const ids of SPLICES[k].parts) for (const m of p.parts) if (ids.some(id => m.path.includes(id))) spliced.add(m);
  const act = activeSet(p);
  const panel = (x, w) => {
    ctx.fillStyle = '#070506'; ctx.fillRect(x, top, w, 26);
    ctx.fillStyle = '#0e0b0c'; ctx.fillRect(x + 1, top + 1, w - 2, 24);
    ctx.fillStyle = '#2e2627'; ctx.fillRect(x, top + 26, w, 1); ctx.fillRect(x + w, top, 1, 27);
  };
  const next = nextSlot(p);
  let nextShown = false;
  BAR_LAYOUT.forEach((loc, i) => {
    const m = cellPart[i], x = cellX(i), w = pitch - 2;
    panel(x, w);
    if (!m) {
      drawText(ctx, LOC_NAME[loc], x + 4, top + 2, '#3a3232', 1, 'left', null);
      if (cellOpen[i]) drawText(ctx, 'FREE', x + w / 2, top + 12, '#4a3e3e', 1, 'center', null);
      else {
        const soon = loc === next && !nextShown; if (soon) nextShown = true;
        drawText(ctx, soon ? 'NEXT BOSS' : 'LOCKED', x + w / 2, top + 12, soon ? '#6a4a52' : '#2a2424', 1, 'center', null);
      }
      return;
    }
    const d = getMutDef(m.id), col = mutColor(p, m.id);
    ctx.fillStyle = col; ctx.fillRect(x, top, 2, 26); // rarity stripe
    if (spliced.has(m)) { ctx.fillStyle = VIAL_COLOR; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(game.time * 4); ctx.fillRect(x + 2, top, w - 2, 1); ctx.fillRect(x + 2, top + 25, w - 2, 1); ctx.globalAlpha = 1; }
    drawText(ctx, LOC_NAME[m.loc], x + 4, top + 2, '#5a4e4c', 1, 'left', null);
    const set = !m.starter && setOf(m.id);
    if (set) { // set gem (glows when it's part of an active bonus)
      const lit = act && act.set === set;
      ctx.fillStyle = PAL.black; ctx.fillRect(x + w - 7, top + 2, 6, 6);
      ctx.fillStyle = SETS[set].color; ctx.globalAlpha = lit ? 1 : 0.45; ctx.fillRect(x + w - 6, top + 3, 4, 4); ctx.globalAlpha = 1;
      if (lit && Math.floor(game.time * 2) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w - 6, top + 3, 1, 1); }
    }
    const icon = mutIcon(m.id);
    if (icon) ctx.drawImage(icon, x + 4, top + 9);
    if (w >= 44) wrapText(d.name.toUpperCase(), Math.floor((w - 24) / 4)).slice(0, 2).forEach((line, k) => drawText(ctx, line, x + 23, top + 9 + k * 7, col, 1, 'left'));
    // How far the path has grown (root, branch, branch). The next pip glows
    // if it can grow again this floor.
    for (let l = 0; l < 3; l++) {
      ctx.fillStyle = l < m.path.length ? col : '#2a2222';
      ctx.fillRect(x + 23 + l * 4, top + 23, 3, 2);
    }
    // Its level: pink dots that fill toward its next evolution.
    if (!m.starter) for (let l = 0; l < LEVEL_MAX; l++) { ctx.fillStyle = l < (m.lvl || 0) ? VIAL_COLOR : '#2a1c22'; ctx.fillRect(x + 38 + l * 3, top + 23, 2, 2); }
    if ((m.lvl || 0) > LEVEL_MAX) drawText(ctx, '+' + (m.lvl - LEVEL_MAX), x + w - 2, top + 21, '#ffd070', 1, 'right', null); // overgrowth
  });
}

// The right-click (E) ability and the head's automatic one, with their cooldowns.
function drawActiveIcons(ctx, p) {
  const s = p.stats, limb = partAt(p, 'LIMBS'), head = partAt(p, 'HEAD');
  const items = [];
  if (limb && (s.limbActive || s.grapple || s.hands)) {
    const own = !!s.limbActive && !s.grapple && !s.hands;
    items.push({ key: 'E', id: limb.path[0], k: p.limbWear > 0 ? 1 : own ? p.limbCd / (p.limbCdMax || 1) : p.grappleCd / (s.grapple || 1) });
  }
  if (head && s.headActive) items.push({ key: '', id: head.path[0], k: p.headCd / (p.headCdMax || 1) }); // automatic: no key
  items.forEach((it, i) => {
    const x = 218 + i * 17, y = 17, k = clamp(it.k, 0, 1);
    ctx.fillStyle = '#070506'; ctx.fillRect(x - 1, y - 1, 14, 14);
    const icon = mutIcon(it.id);
    if (icon) ctx.drawImage(icon, x, y, 12, 12);
    if (k > 0) { const h = Math.ceil(12 * k); ctx.fillStyle = 'rgba(6,4,5,0.78)'; ctx.fillRect(x, y, 12, h); }
    drawText(ctx, it.key, x + 10, y - 2, k > 0 ? PAL.slate : PAL.white, 1, 'left');
  });
}

// --- Whispers: cryptic hints when something new grows in you ---------------------
const WHISPER_TIME = 5;

function whisper(text) {
  if (text) game.whisper = { text: text.toUpperCase(), t: WHISPER_TIME };
}

function updateWhisper(dt) {
  if (game.whisper && (game.whisper.t -= dt) <= 0) game.whisper = null;
}

function drawWhisper(ctx) {
  const w = game.whisper;
  if (!w) return;
  const age = WHISPER_TIME - w.t;
  const shown = w.text.slice(0, Math.floor(age * 45)); // types itself out
  const lines = wrapText(shown, 70);
  const fade = Math.min(1, w.t / 0.8);
  const y = ROOM_Y + 6;
  ctx.globalAlpha = 0.75 * fade;
  ctx.fillStyle = '#060304';
  ctx.fillRect(0, y - 3, VIEW_W, lines.length * 8 + 5);
  ctx.globalAlpha = fade;
  lines.forEach((line, i) => drawText(ctx, line, VIEW_W / 2, y + i * 8, '#c8a8a8', 1, 'center'));
  ctx.globalAlpha = 1;
}

// --- Banners & overlays -----------------------------------------------------------
function drawBanner(ctx) {
  const b = game.banner;
  if (!b) return;
  const y = ROOM_Y + 60;
  ctx.fillStyle = 'rgba(4,2,4,0.7)';
  ctx.fillRect(0, y - 6, VIEW_W, b.sub ? 34 : 22);
  drawText(ctx, b.text, VIEW_W / 2, y, b.color, 2, 'center');
  if (b.sub) drawText(ctx, b.sub, VIEW_W / 2, y + 16, PAL.white, 1, 'center');
}

function drawCrosshair(ctx) {
  const x = Math.round(Input.mouse.x), y = Math.round(Input.mouse.y);
  ctx.fillStyle = PAL.black;
  ctx.fillRect(x - 4, y - 1, 9, 3); ctx.fillRect(x - 1, y - 4, 3, 9);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(x - 3, y, 2, 1); ctx.fillRect(x + 2, y, 2, 1);
  ctx.fillRect(x, y - 3, 1, 2); ctx.fillRect(x, y + 2, 1, 2);
}

function drawTitle(ctx) {
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (!SPR.titleBg) SPR.titleBg = bakeTitleBg();
  ctx.drawImage(SPR.titleBg, 0, 0);

  // Title dripping blood.
  const tw = textWidth('SPECIMEN', 4), left = Math.round(VIEW_W / 2 - tw / 2);
  for (let i = 0; i < tw; i++) {
    if ((i * 7919) % 11 > 1) continue;
    const len = Math.floor((game.time * 5 + i * 3.7) % 26);
    ctx.fillStyle = '#5a0a12';
    ctx.fillRect(left + i, 46, 1, len);
    if (len > 3) { ctx.fillStyle = '#8a1020'; ctx.fillRect(left + i, 46 + len, 1, 2); }
  }
  drawText(ctx, 'SPECIMEN', VIEW_W / 2, 28, '#8a1020', 4, 'center');
  drawText(ctx, '47', VIEW_W / 2, 54, PAL.white, 4, 'center');

  // The pure specimen degenerates as it grows new parts, then starts over.
  const showcase = ['', 'eyes', 'mandibles', 'spines', 'tentacles', 'horns'];
  const n = Math.floor(game.time / 1.3) % showcase.length;
  const st = SPR.stages[Math.min(4, n)];
  const bx = VIEW_W / 2 - 36, by = 76 + Math.round(Math.sin(game.time * 3) * 2);
  ctx.drawImage(Math.floor(game.time * 1.6) % 2 ? st.body2 : st.body, bx, by, 72, 72);
  const shown = new Set(showcase.slice(1, n + 1));
  for (const ov of OVERLAY_ORDER) if (shown.has(ov)) ctx.drawImage(st.overlay[ov], bx, by, 72, 72);

  if (Math.floor(game.time * 2) % 2) drawText(ctx, 'CLICK OR PRESS SPACE TO ESCAPE', VIEW_W / 2, 156, PAL.white, 1, 'center');
  drawText(ctx, 'CONSUME. EVOLVE. ESCAPE.', VIEW_W / 2, 172, PAL.slate, 1, 'center');

  const lines = [
    ['WASD', 'MOVE'],
    ['MOUSE / ARROWS', 'AIM + SHOOT'],
    ['SPACE / SHIFT', 'DASH'],
    ['RIGHT CLICK / E', 'LIMB ABILITY'],
    ['ESC ON CARDS', 'EVOLVE LATER (HOLD F)'],
    ['M / P / J', 'MUTE / PAUSE / JOURNAL'],
  ];
  lines.forEach(([k, v], i) => {
    drawText(ctx, k, VIEW_W / 2 - 6, 188 + i * 10, PAL.red, 1, 'right');
    drawText(ctx, v, VIEW_W / 2 + 6, 188 + i * 10, PAL.white);
  });
}

function drawGameOver(ctx) {
  ctx.fillStyle = 'rgba(4,2,4,0.82)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, 'SPECIMEN', VIEW_W / 2, 50, PAL.red, 3, 'center');
  drawText(ctx, 'TERMINATED', VIEW_W / 2, 70, PAL.red, 3, 'center');
  drawText(ctx, `REACHED FLOOR ${game.depth}  -  ${game.kills} KILLS  -  LEVEL ${game.player.level}`, VIEW_W / 2, 100, PAL.white, 1, 'center');

  const p = game.player;
  drawText(ctx, 'FINAL FORM', VIEW_W / 2, 120, PAL.slate, 1, 'center');
  const shown = p.parts.slice(0, 6), row = shown.length > 5 ? 8 : 9;
  shown.forEach((m, i) => {
    drawText(ctx, m.loc, VIEW_W / 2 - 8, 130 + i * row, PAL.slate, 1, 'right');
    const d = getMutDef(m.id);
    const label = d.name.toUpperCase() + (m.path.length >= 3 || m.starter ? '' : ` (${m.path.length}/3)`);
    drawText(ctx, label, VIEW_W / 2 + 8, 130 + i * row, mutColor(p, m.id));
  });
  if (p.parts.length > 6) drawText(ctx, `+${p.parts.length - 6} MORE`, VIEW_W / 2 + 8, 130 + 6 * row, PAL.slate);
  if (p.splices.length) drawText(ctx, 'SPLICED: ' + p.splices.map(k => SPLICES[k].name.toUpperCase()).join(', '), VIEW_W / 2, 182, VIAL_COLOR, 1, 'center');

  if (game.overT > 1 && Math.floor(game.time * 2) % 2) drawText(ctx, 'CLICK TO TRY AGAIN', VIEW_W / 2, 200, PAL.white, 1, 'center');
}

// --- The splice journal: what you've fused, kept between runs ------------------------
// Press J on the title screen or while paused. Discovered splices show both
// halves and what they do; the rest show a hint of what they're made from.
const Journal = {
  key: 'specimen47.journal',
  load() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch (e) { return {}; } },
  save(d) { try { localStorage.setItem(this.key, JSON.stringify(d)); } catch (e) { /* private mode: it just won't persist */ } },
  found() { const d = this.load(); return Array.isArray(d.splices) ? d.splices : []; },
  discover(k) {
    const d = this.load(), list = Array.isArray(d.splices) ? d.splices : [];
    if (list.includes(k)) return false;
    list.push(k); d.splices = list; this.save(d);
    return true;
  },
};
const JOURNAL_PER_PAGE = 6;

// A hint for an undiscovered splice: what kind of part each half is, and its set.
function spliceHint(k) {
  const S = SPLICES[k];
  const half = ids => { const id = ids[0], set = setOf(id); return (set ? SETS[set].name + ' ' : '') + locOf(id); };
  return 'A ' + half(S.parts[0]) + ' + A ' + half(S.parts[1]) + (S.grown === 3 ? ' (BOTH FULLY GROWN)' : '');
}

function openJournal() { game.journal = { page: 0 }; Sfx.play('flicker'); }

function updateJournal() {
  const j = game.journal, pages = Math.ceil(Object.keys(SPLICES).length / JOURNAL_PER_PAGE);
  if (Input.hit('j', 'escape')) { game.journal = null; return; }
  if (Input.hit('arrowright', 'd')) j.page = (j.page + 1) % pages;
  if (Input.hit('arrowleft', 'a')) j.page = (j.page + pages - 1) % pages;
}

function drawJournal(ctx) {
  const j = game.journal, keys = Object.keys(SPLICES), found = Journal.found();
  const pages = Math.ceil(keys.length / JOURNAL_PER_PAGE);
  ctx.fillStyle = '#060306'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawText(ctx, 'SPLICE JOURNAL', VIEW_W / 2, 8, VIAL_COLOR, 2, 'center');
  drawText(ctx, `${keys.filter(k => found.includes(k)).length} / ${keys.length} DISCOVERED`, VIEW_W / 2, 26, PAL.slate, 1, 'center');
  keys.slice(j.page * JOURNAL_PER_PAGE, (j.page + 1) * JOURNAL_PER_PAGE).forEach((k, i) => {
    const S = SPLICES[k], y = 40 + i * 33, known = found.includes(k);
    ctx.fillStyle = known ? '#1c1018' : '#120c10'; ctx.fillRect(8, y - 2, VIEW_W - 16, 30);
    ctx.fillStyle = known ? VIAL_COLOR : '#3a2a32'; ctx.fillRect(8, y - 2, 2, 30);
    if (known) {
      drawText(ctx, S.name.toUpperCase() + (S.grown === 3 ? '  (BIG)' : ''), 14, y, VIAL_COLOR, 1, 'left');
      drawText(ctx, S.parts.map(ids => ids.map(id => MUTATIONS[id].name).join(' OR ')).join(' + ').toUpperCase(), 14, y + 8, PAL.white, 1, 'left');
      wrapText(S.desc.toUpperCase(), 72).slice(0, 2).forEach((line, n) => drawText(ctx, line, 14, y + 16 + n * 7, PAL.slate, 1, 'left', null));
    } else {
      drawText(ctx, '? ? ?', 14, y, '#5a4a52', 1, 'left');
      drawText(ctx, spliceHint(k), 14, y + 9, '#8a7a82', 1, 'left', null);
    }
  });
  drawText(ctx, `PAGE ${j.page + 1}/${pages}  -  A / D: TURN  -  J: CLOSE`, VIEW_W / 2, VIEW_H - 12, PAL.slate, 1, 'center');
}
