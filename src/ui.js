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
  game.menu = {
    choices: rollChoices(p, 3, opts.minRarity, opts.slot),
    slotsLeft: freeSlots(p),
    src: opts,
    title: opts.title || 'EVOLUTION',
    sub: opts.slot ? 'ITS CORE BECOMES YOURS' : opts.minRarity ? 'A RARE SAMPLE - UNCOMMON OR BETTER' : `LEVEL ${p.level} - CHOOSE A MUTATION`,
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
  if (Input.hit('escape')) { putOffEvolution(p, menu.src); return; }

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
  const icon = mutIcon(info.id);
  if (icon) ctx.drawImage(icon, Math.round(cx - 24), y + 15 + bob, 48, 48);

  let ty = y + 70;
  for (const line of wrapText(info.name.toUpperCase(), 20)) { drawText(ctx, line, cx, ty, rc, 1, 'center'); ty += 8; }
  if (info.slot) drawText(ctx, `[${info.slot}]`, cx, ty, PAL.slate, 1, 'center', null);
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
  ty += 10;
  if (info.status) { drawText(ctx, info.status, cx, ty, PAL.white, 1, 'center'); ty += 10; }
  if (info.note) {
    for (const line of wrapText(info.note.toUpperCase(), 21)) { drawText(ctx, line, cx, ty, info.noteColor, 1, 'center', null); ty += 7; }
  }

  // It would complete a splice: don't say which, just let it pulse.
  if (info.stirs && Math.floor(menu.t * 3) % 3) drawText(ctx, 'SOMETHING STIRS', cx, y + h - 20, VIAL_COLOR, 1, 'center');
  drawText(ctx, `[${i + 1}]`, cx, y + h - 10, hover ? rc : PAL.slate, 1, 'center');
}

function drawMenu(ctx) {
  const menu = game.menu, p = game.player;
  ctx.fillStyle = 'rgba(4,2,4,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const mutagen = menu.title === 'MUTAGEN';
  drawText(ctx, menu.title, VIEW_W / 2, 18, mutagen ? VIAL_COLOR : PAL.red, 2, 'center');
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
    drawText(ctx, 'PRESS 1-3 OR CLICK A CARD  -  ESC: NOT YET', VIEW_W / 2, 206, PAL.slate, 1, 'center');
  }
}

// --- HUD --------------------------------------------------------------------------
function drawHUD(ctx) {
  const p = game.player;
  bakeHud();
  ctx.drawImage(SPR.hudTop, 0, 0);
  ctx.drawImage(SPR.hudBottom, 0, ROOM_Y + ROOM_PX_H);

  // Hearts (+ chitin shell)
  for (let i = 0; i < p.maxHp; i++) ctx.drawImage(i < p.hp ? SPR.heart : SPR.heartEmpty, 4 + i * 9, 3);
  if (p.stats.shieldCd > 0) {
    const sx = 6 + p.maxHp * 9;
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
  else if (evolveReady(p) && !room.locked && p.snoozeRoom === room && Math.floor(game.time * 2.5) % 2) { msg = 'HOLD [F] TO EVOLVE'; col = VIAL_COLOR; }
  else if (room.locked) { if (Math.floor(game.time * 3) % 2) { msg = 'CONTAINMENT LOCKDOWN'; col = PAL.red; } }
  else if (room.hatch) { msg = 'HATCH OPEN - DESCEND'; col = PAL.lime; }
  else if (room.orbs.length) { msg = 'DNA SPILLED'; col = VIAL_COLOR; }
  else if (room.corpses.length) { msg = 'FRESH MEAT - BURST IT'; col = VIAL_COLOR; }
  else if (room.type === 'vault') { msg = 'MUTAGEN VAULT'; col = VIAL_COLOR; }
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
  drawText(ctx, full ? (game.room.locked ? 'DNA READY - CLEAR THE ROOM' : 'DNA READY') : `DNA ${p.dna}/${need}`, VIEW_W / 2, 16, full ? VIAL_COLOR : '#8a6a74', 1, 'center');
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
    if (r.type === 'vault') mark = VIAL_COLOR;
    if ((r.corpses.length || r.orbs.length) && r.visited) mark = '#e8a0b8';
    if (mark && !current) { ctx.fillStyle = mark; ctx.fillRect(x + 2, y + 1, 2, 2); }
  }
}

function mutColor(p, id) {
  const d = getMutDef(id);
  if (id === 'secondheart' && p.secondHeartUsed) return PAL.dark;
  return d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color;
}

// Your body: one panel per slot along the bottom. Big parts span two slots;
// spliced parts are joined by a glowing seam; free slots wait, empty.
function drawMutationList(ctx) {
  const p = game.player;
  const top = ROOM_Y + ROOM_PX_H + 3;
  const cap = slotCapacity(p), cells = Math.max(cap, slotsUsed(p));
  const pitch = Math.floor(316 / cells);
  const spliced = new Set();
  for (const k of p.splices) for (const ids of SPLICES[k].parts) for (const m of p.parts) if (ids.some(id => m.path.includes(id))) spliced.add(m);
  const act = activeSet(p);
  const panel = (x, w) => {
    ctx.fillStyle = '#070506'; ctx.fillRect(x, top, w, 26);
    ctx.fillStyle = '#0e0b0c'; ctx.fillRect(x + 1, top + 1, w - 2, 24);
    ctx.fillStyle = '#2e2627'; ctx.fillRect(x, top + 26, w, 1); ctx.fillRect(x + w, top, 1, 27);
  };
  let cell = 0;
  for (const m of p.parts) {
    const span = partSize(m), x = 3 + cell * pitch, w = span * pitch - 2;
    cell += span;
    panel(x, w);
    const d = getMutDef(m.id), col = mutColor(p, m.id);
    ctx.fillStyle = col; ctx.fillRect(x, top, 2, 26); // rarity stripe
    if (spliced.has(m)) { ctx.fillStyle = VIAL_COLOR; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(game.time * 4); ctx.fillRect(x + 2, top, w - 2, 1); ctx.fillRect(x + 2, top + 25, w - 2, 1); ctx.globalAlpha = 1; }
    drawText(ctx, m.loc, x + 4, top + 2, '#5a4e4c', 1, 'left', null);
    const set = !m.starter && setOf(m.id);
    if (set) { // set gem (glows when it's part of an active bonus)
      const lit = act && act.set === set;
      ctx.fillStyle = PAL.black; ctx.fillRect(x + w - 7, top + 2, 6, 6);
      ctx.fillStyle = SETS[set].color; ctx.globalAlpha = lit ? 1 : 0.45; ctx.fillRect(x + w - 6, top + 3, 4, 4); ctx.globalAlpha = 1;
      if (lit && Math.floor(game.time * 2) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w - 6, top + 3, 1, 1); }
    }
    const icon = mutIcon(m.id);
    if (icon) ctx.drawImage(icon, x + 4, top + 9);
    if (w >= 56) wrapText(d.name.toUpperCase(), Math.floor((w - 24) / 4)).slice(0, 2).forEach((line, k) => drawText(ctx, line, x + 23, top + 9 + k * 7, col, 1, 'left'));
    // How far the path has grown (root, branch, branch). The next pip glows
    // if it can grow again this floor.
    const ready = childrenOf(m.id).length && !m.starter && canGrowYet(m);
    for (let l = 0; l < 3; l++) {
      ctx.fillStyle = l < m.path.length ? col : l === m.path.length && ready ? '#5a4e4c' : '#2a2222';
      ctx.fillRect(x + 23 + l * 4, top + 23, 3, 2);
    }
  }
  for (; cell < cap; cell++) {
    const x = 3 + cell * pitch, w = pitch - 2;
    panel(x, w);
    drawText(ctx, 'FREE', x + w / 2, top + 10, '#3a3232', 1, 'center', null);
  }
}

// The right-click (E) and Q abilities, with their cooldowns.
function drawActiveIcons(ctx, p) {
  const s = p.stats, limb = partAt(p, 'LIMBS'), head = partAt(p, 'HEAD');
  const items = [];
  if (limb && (s.limbActive || s.grapple || s.hands)) {
    const own = !!s.limbActive && !s.grapple && !s.hands;
    items.push({ key: 'E', id: limb.path[0], k: p.limbWear > 0 ? 1 : own ? p.limbCd / (p.limbCdMax || 1) : p.grappleCd / (s.grapple || 1) });
  }
  if (head && s.headActive) items.push({ key: 'Q', id: head.path[0], k: p.headCd / (p.headCdMax || 1) });
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
    ['Q', 'HEAD ABILITY'],
    ['ESC ON CARDS', 'EVOLVE LATER (HOLD F)'],
    ['M / P', 'MUTE / PAUSE'],
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