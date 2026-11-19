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
      : opts.levelUp ? rollLevelUps(p, 3) : rollChoices(p, 3, opts.minRarity, opts.slot || opts.loc, opts.plain, opts.opened),
    color: opts.color,
    slotsLeft: freeSlots(p),
    src: opts,
    title: opts.title || 'EVOLUTION',
    sub: opts.evolve ? MUTATIONS[opts.evolve.id].name.toUpperCase() + ' IS READY TO CHANGE' : opts.levelUp ? `LEVEL ${p.level} - GROW A PART` : opts.slot ? 'ITS CORE BECOMES YOURS' : opts.loc ? `GROW A ${LOC_NAME[opts.loc] || opts.loc}` + (opts.minRarity ? ' - UNCOMMON OR BETTER' : '') : `LEVEL ${p.level} - CHOOSE A MUTATION`,
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
  const loses = !!info.shed; // this card tears out a part you already have
  const cx = x + w / 2;

  // Blood seeps off the bottom edge (always the same drips per card; they run on hover).
  for (let k = 0; k < 4; k++) {
    const dx = x + 6 + Math.floor(hash2(i, k, 3) * (w - 12));
    const len = 1 + Math.floor(hash2(k, i, 7) * 3) + (hover ? Math.floor((menu.t * 4 + k * 0.7) % 4) : 0);
    ctx.fillStyle = loses ? '#8a1820' : '#4a1418'; ctx.fillRect(dx, y + h, 1, len + 1);
    if (k % 2 === 0) ctx.fillRect(dx - 1, y + h, 3, 1);
  }

  // A dark specimen slab in a bony frame.
  ctx.fillStyle = PAL.black; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = frame; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = info.malignant ? (hover ? '#28162e' : '#1a0e1e') : hover ? '#221a1e' : '#141014';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#2a2023'; // an inner seam, like a sutured edge
  ctx.fillRect(x + 3, y + 3, w - 6, 1); ctx.fillRect(x + 3, y + h - 4, w - 6, 1);
  ctx.fillRect(x + 3, y + 3, 1, h - 6); ctx.fillRect(x + w - 4, y + 3, 1, h - 6);
  for (let s = x + 7; s < x + w - 6; s += 6) { ctx.fillRect(s, y + 2, 1, 3); ctx.fillRect(s, y + h - 5, 1, 3); } // stitches
  // Bone knuckles on the corners.
  for (const [kx, ky] of [[x - 2, y - 2], [x + w - 2, y - 2], [x - 2, y + h - 2], [x + w - 2, y + h - 2]]) {
    ctx.fillStyle = '#3a3226'; ctx.fillRect(kx, ky, 4, 4);
    ctx.fillStyle = '#d8ccb0'; ctx.fillRect(kx, ky, 3, 3);
    ctx.fillStyle = '#fff4dc'; ctx.fillRect(kx, ky, 1, 1);
  }
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

  // Header: what it costs you (a red band) or its rarity.
  if (loses) {
    const pulse = 0.75 + 0.25 * Math.sin(menu.t * 5);
    ctx.fillStyle = '#3a060a'; ctx.fillRect(x + 4, y + 4, w - 8, 9);
    ctx.globalAlpha = pulse; ctx.fillStyle = '#7a1018'; ctx.fillRect(x + 5, y + 5, w - 10, 7); ctx.globalAlpha = 1;
    ctx.fillStyle = '#8a1820'; for (const dx of [9, 23, w - 30, w - 13]) ctx.fillRect(x + dx, y + 13, 1, 1 + (dx % 3)); // it drips
    drawText(ctx, 'REPLACES ' + (LOC_NAME[info.slot] || ''), cx, y + 6, '#f4d8d0', 1, 'center');
  } else if (info.malignant) {
    drawText(ctx, 'MALIGNANT', cx, y + 6, MALIGNANT_COLOR, 1, 'center');
  } else {
    drawText(ctx, RARITY[info.rarity].label, cx, y + 6, rc, 1, 'center');
  }
  // Set gems in the corners (two-window cards show the set on their tag line only).
  if (info.set && !info.from && !info.shed) { const S = SETS[info.set]; ctx.fillStyle = S.color; ctx.fillRect(x + 5, y + 16, 3, 3); ctx.fillRect(x + w - 8, y + 16, 3, 3); }

  // The art, in a dark specimen window. A branch shows the part and what it
  // grows into; a swap shows the part you lose, crossed out.
  const top = y + 15, winH = 38;
  const bob = Math.round(Math.sin(menu.t * 3 + i) * 1);
  const icon = mutIcon(info.id), oldId = info.from || (info.shed && info.shed.id), old = oldId && mutIcon(oldId);
  const box = (bx, by, bw, bh, edge) => { // a specimen window
    ctx.fillStyle = edge; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#060405'; ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    ctx.fillStyle = info.malignant ? '#1e0e22' : '#120d0f'; ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
  };
  if (old && icon) {
    // Two windows: what you have now (left, small) and what you get (right).
    const lx = x + 6, ly = top + 6, ls = 26, rs = 38, rx = x + w - 6 - rs;
    box(lx, ly, ls, ls, loses ? '#8a1820' : '#3a3034');
    if (loses) ctx.globalAlpha = 0.55; // it's going
    ctx.drawImage(old, lx + 5, ly + 5, 16, 16);
    ctx.globalAlpha = 1;
    if (loses) for (let k = 0; k < ls - 6; k++) { // crossed out
      ctx.fillStyle = '#e02030';
      ctx.fillRect(lx + 3 + k, ly + 3 + k, 2, 1); ctx.fillRect(lx + ls - 5 - k, ly + 3 + k, 2, 1);
    }
    // Arrows between: red when it tears the old part out, white when it keeps it.
    ctx.fillStyle = loses ? '#e04048' : PAL.white;
    const ax = Math.round((lx + ls + rx) / 2) - 4, ay = top + winH / 2;
    for (const off of [0, 4]) for (let k = 0; k < 3; k++) ctx.fillRect(ax + off + k, ay - 2 + k, 1, 1), ctx.fillRect(ax + off + k, ay + 2 - k, 1, 1);
    box(rx, top, rs, rs, rc);
    ctx.drawImage(icon, rx + 3, top + 3 + bob, 32, 32);
  } else {
    box(Math.round(cx - 27), top, 54, winH, '#060405');
    if (icon) ctx.drawImage(icon, Math.round(cx - 16), top + 3 + bob, 32, 32);
    else if (!info.id) drawGorgeArt(ctx, cx, top + winH / 2, menu.t);
  }
  // Growth pips (how far along its path) or level dots, under the window.
  let ty = top + winH + 2;
  if (info.tier) for (let l = 0; l < 3; l++) { ctx.fillStyle = l <= info.tier ? rc : '#2a2222'; ctx.fillRect(Math.round(cx - 7 + l * 5), ty, 4, 2); }
  if (info.level) for (let l = 0; l < LEVEL_MAX; l++) { ctx.fillStyle = l < info.level ? VIAL_COLOR : '#2a2222'; ctx.fillRect(Math.round(cx - 7 + l * 5), ty, 4, 2); }
  ty += 5;

  for (const line of fitText(info.name, w - 8, 2)) { drawText(ctx, line, cx, ty, rc, 1, 'center'); ty += 8; }
  const tag = info.slot ? `[${LOC_NAME[info.slot] || info.slot}]` : '';
  const setTag = info.set ? SETS[info.set].name + (info.setAfter >= 2 ? ` ${info.setAfter}/${info.setAfter >= 3 ? 5 : 3}` : '') : '';
  if (tag || setTag) {
    const both = tag + (tag && setTag ? ' ' : '') + setTag;
    if (textWidth(both) <= w - 8) {
      const x0 = cx - textWidth(both) / 2;
      drawText(ctx, tag, x0, ty, PAL.slate, 1, 'left', null);
      if (setTag) drawText(ctx, setTag, x0 + (tag ? textWidth(tag + ' ') + 1 : 0), ty, SETS[info.set].color, 1, 'left', null);
      ty += 8;
    } else {
      if (tag) { drawText(ctx, tag, cx, ty, PAL.slate, 1, 'center', null); ty += 7; }
      drawText(ctx, setTag, cx, ty, SETS[info.set].color, 1, 'center', null); ty += 8;
    }
  }

  // The bottom: its status and what it costs or keeps, above the key.
  const notes = info.note ? fitText(info.note, w - 8, 2) : [];
  let by = y + h - 13 - notes.length * 7 - (info.status ? 9 : 0);
  // The short description fills what's left between.
  ctx.fillStyle = '#2a2023'; ctx.fillRect(Math.round(cx - 12), ty, 24, 1);
  ty += 4;
  const room = Math.max(0, Math.min(5, Math.floor((by - ty - 2) / 7)));
  const said = info.short ? fitText(info.short, w - 10, room) : [];
  for (const line of said) { drawText(ctx, line, cx, ty, '#cbbcae', 1, 'center', null); ty += 7; }
  if (info.cost && ty + 7 <= by - 2) for (const line of fitText(info.cost.split('. ')[0], w - 10, Math.floor((by - ty - 2) / 7))) { drawText(ctx, line, cx, ty, MALIGNANT_COLOR, 1, 'center', null); ty += 7; }
  if (info.status) { drawText(ctx, info.status, cx, by, PAL.white, 1, 'center'); by += 9; }
  for (const line of notes) { drawText(ctx, line, cx, by, info.noteColor, 1, 'center', null); by += 7; }
  if (!notes.length && info.stirs && Math.floor(menu.t * 3) % 3) drawText(ctx, 'SOMETHING STIRS', cx, y + h - 20, VIAL_COLOR, 1, 'center');
  drawText(ctx, `[${i + 1}]`, cx, y + h - 11, hover ? rc : PAL.slate, 1, 'center');
}

// Gorge's art: a heart, beating.
function drawGorgeArt(ctx, cx, cy, t) {
  const s = 1 + (Math.sin(t * 7) > 0.6 ? 1 : 0);
  ctx.save(); ctx.translate(Math.round(cx), Math.round(cy)); ctx.scale(2 + s * 0.25, 2 + s * 0.25);
  ctx.fillStyle = '#5e1a22';
  ctx.fillRect(-5, -3, 4, 3); ctx.fillRect(1, -3, 4, 3); ctx.fillRect(-6, -2, 12, 4); ctx.fillRect(-4, 2, 8, 2); ctx.fillRect(-2, 4, 4, 2);
  ctx.fillStyle = '#a8343c'; ctx.fillRect(-5, -2, 3, 3); ctx.fillRect(2, -2, 3, 3); ctx.fillRect(-3, 0, 6, 3);
  ctx.fillStyle = '#e88080'; ctx.fillRect(-4, -2, 1, 1);
  ctx.restore();
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
    // Hovering a card: everything it does (the card only says the gist).
    const hov = menu.hover >= 0 && menu.choices[menu.hover] && choiceInfo(p, menu.choices[menu.hover]);
    if (hov && hov.shed) drawShedLink(ctx, hov.shed, cardX(menu.hover, n) + CARD.w / 2, CARD.y + CARD.h + 2, menu.t);
    const help = hov && (hov.kind === 'level' ? LEVEL_HELP : !hov.id ? GORGE_HELP : hov.desc + (hov.cost ? ' ' + hov.cost : ''));

    if (help) fitText(help, VIEW_W - 16, 3).forEach((line, i) => drawText(ctx, line, VIEW_W / 2, 203 + i * 7, '#c8b8a8', 1, 'center'));
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
const GORGE_HELP = 'GORGE: HEAL A HEART AND GROW NOTHING. YOUR BODY STAYS EXACTLY AS IT IS.';

// Hovering a card that replaces a part: a red thread runs from the card down
// to that part's cell in the slot bar, and the cell pulses.
function drawShedLink(ctx, part, fromX, fromY, t) {
  const cell = (game.barCells || []).find(c => c.part === part);
  if (!cell) return;
  const tx = Math.round(cell.x + cell.w / 2), ty = cell.y - 1, midY = 200;
  const a = 0.6 + 0.4 * Math.sin(t * 6);
  ctx.globalAlpha = a; ctx.fillStyle = '#d02030';
  const x0 = Math.round(fromX);
  ctx.fillRect(x0, fromY, 1, midY - fromY);
  ctx.fillRect(Math.min(x0, tx), midY, Math.abs(tx - x0) + 1, 1);
  ctx.fillRect(tx, midY, 1, ty - midY);
  ctx.fillRect(tx - 1, ty - 2, 3, 1); ctx.fillRect(tx, ty - 1, 1, 1); // arrowhead
  ctx.fillRect(cell.x - 1, cell.y - 1, cell.w + 2, 1); ctx.fillRect(cell.x - 1, cell.y + 26, cell.w + 2, 1);
  ctx.fillRect(cell.x - 1, cell.y - 1, 1, 28); ctx.fillRect(cell.x + cell.w, cell.y - 1, 1, 28);
  ctx.globalAlpha = 1;
}

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
// Fit a name into a box `maxW` pixels wide, on at most `maxLines` lines.
// Words wrap by their real pixel width; a word too long for a whole line is
// shortened with a dot (HAUNCH.), and so is the last line if more is left over.
function fitText(s, maxW, maxLines) {
  if (maxLines <= 0) return [];
  const fits = t => textWidth(t) <= maxW;
  const clip = t => { while (t.length > 1 && !fits(t + '.')) t = t.slice(0, -1); return t + '.'; };
  const lines = [];
  let line = '';
  for (let w of String(s).toUpperCase().split(' ')) {
    if (!fits(w)) w = clip(w);
    const joined = line ? line + ' ' + w : w;
    if (fits(joined)) { line = joined; continue; }
    if (line) lines.push(line);
    line = w;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  out[maxLines - 1] = out[maxLines - 1].endsWith('.') ? out[maxLines - 1] : clip(out[maxLines - 1]);
  return out;
}

const BAR_NARROW = 34; // pitch of an empty or locked cell; filled cells share what's left
function drawMutationList(ctx) {
  const p = game.player;
  const top = ROOM_Y + ROOM_PX_H + 3;
  // Which part sits in which cell, and which cells are open.
  const seen = {}, cellPart = [], cellOpen = [];
  BAR_LAYOUT.forEach((loc, i) => {
    const k = seen[loc] = (seen[loc] || 0) + 1;
    cellPart[i] = partsAt(p, loc).filter(m => !m.starter)[k - 1] || null;
    cellOpen[i] = k <= slotsAt(p, loc);
  });
  // Filled cells get the room the empty ones don't need, so names have space to read.
  const groupGap = 6, total = 316 - groupGap, filled = cellPart.filter(Boolean).length;
  const wide = filled ? Math.min(96, Math.floor((total - BAR_NARROW * (BAR_LAYOUT.length - filled)) / filled)) : BAR_NARROW;
  const pitches = cellPart.map(m => m ? wide : BAR_NARROW);
  const used = pitches.reduce((a, b) => a + b, 0);
  const lead = 3 + Math.floor((total - used) / 2); // centre the bar if it doesn't fill the width
  const cellX = i => lead + pitches.slice(0, i).reduce((a, b) => a + b, 0) + (i >= 2 ? groupGap : 0);
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
  game.barCells = []; // where each part sits, for the card menu's red thread
  BAR_LAYOUT.forEach((loc, i) => {
    const m = cellPart[i], x = cellX(i), w = pitches[i] - 2;
    game.barCells.push({ part: m, x, y: top, w });
    panel(x, w);
    if (!m) {
      drawText(ctx, LOC_NAME[loc], x + w / 2, top + 3, '#3a3232', 1, 'center', null);
      if (cellOpen[i]) drawText(ctx, 'FREE', x + w / 2, top + 13, '#4a3e3e', 1, 'center', null);
      else {
        const soon = loc === next && !nextShown; if (soon) nextShown = true;
        if (soon) { drawText(ctx, 'NEXT', x + w / 2, top + 10, '#6a4a52', 1, 'center', null); drawText(ctx, 'BOSS', x + w / 2, top + 17, '#6a4a52', 1, 'center', null); }
        else drawText(ctx, 'LOCKED', x + w / 2, top + 13, '#2a2424', 1, 'center', null);
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
    fitText(d.name, w - 22, 2).forEach((line, k) => drawText(ctx, line, x + 21, top + 9 + k * 7, col, 1, 'left'));
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

// --- Whispers: what your body feels as something grows -----------------------------
// When a part grows (`name` given), it pops up mid-screen: the part's name, then
// the feeling of it arriving, typed out letter by letter. The newest letters
// are still raw: red, and twitching.
const WHISPER_TIME = 5.5, WHISPER_CPS = 38;

function whisper(text, name = null, color = null) {
  if (!text) return;
  const lines = fitText(text, 220, 4);
  game.whisper = { text: text.toUpperCase(), lines, name: name && name.toUpperCase(), color: color || PAL.white, t: WHISPER_TIME };
}

function updateWhisper(dt) {
  if (game.whisper && (game.whisper.t -= dt) <= 0) game.whisper = null;
}

function drawWhisper(ctx) {
  const w = game.whisper;
  if (!w) return;
  const age = WHISPER_TIME - w.t;
  let fade = Math.min(1, w.t / 0.8, age / 0.15);
  if (hash2(Math.floor(game.time * 12), 7, 3) < 0.04) fade *= 0.35; // it flickers, now and then
  const y = ROOM_Y + 12, head = 0;
  // The first instant: a faint pulse of red over everything, like a heartbeat.
  if (w.name && age < 0.25) { ctx.globalAlpha = 0.14 * (1 - age / 0.25); ctx.fillStyle = '#c01020'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  // A plain black box behind it (old-school, and easy to read), sized to the text.
  const bw = Math.max(...w.lines.map(l => textWidth(l))) + 10, bh = w.lines.length * 9 + 9;
  ctx.globalAlpha = fade; ctx.fillStyle = '#000000';
  ctx.fillRect(Math.round(VIEW_W / 2 - bw / 2), y - 4, Math.round(bw), bh);
  // Crooked letters: each sits a little off its line, drifts slowly, and some drip.
  const scrawl = (line, cx, ly, color, seed, shown = line.length, raw = 0) => {
    let x = Math.round(cx - textWidth(line) / 2);
    for (let k = 0; k < shown; k++) {
      const ch = line[k], h = hash2(k, seed, 13);
      const settled = k < shown - raw;
      const jy = Math.round((h - 0.5) * 2 + Math.sin(game.time * 1.3 + k * 0.7 + seed) * 0.6) + (settled ? 0 : Math.round((Math.random() - 0.5) * 3));
      const jx = settled ? 0 : Math.round((Math.random() - 0.5) * 2);
      drawText(ctx, ch, x + jx, ly + jy, settled ? color : '#ff3a40', 1, 'left', '#0a0204');
      if (settled && ch !== ' ' && h > 0.9) { // a drip runs off this letter
        const len = Math.min(5, Math.floor((age - k / WHISPER_CPS) * 3 * h)) ;
        ctx.fillStyle = color; if (len > 0) ctx.fillRect(x + 1, ly + jy + 5, 1, len);
      }
      x += textWidth(ch + 'X') - textWidth('X');
    }
  };
  // Type it out across the lines (laid out in full first, so nothing reflows).
  let left = Math.floor(Math.max(0, age - 0.3) * WHISPER_CPS);
  w.lines.forEach((line, i) => {
    const shown = Math.min(line.length, Math.max(0, left)); left -= line.length;
    if (shown) scrawl(line, VIEW_W / 2, y + head + i * 9, '#b8202c', i * 17 + 3, shown, left >= 0 ? 0 : 3);
  });
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
