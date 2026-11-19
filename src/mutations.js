'use strict';
// ---------------------------------------------------------------------------
// MUTATIONS: the heart of the game.
//
// Your body has TYPED SLOTS, in two tracks (like weapons and passives):
//   WEAPON (id 'MOUTH'): an attack (fire button). Room for two; both fire.
//   LIMBS: how you move, plus a right-click ability. One set.
//   HEAD:  senses, plus an ability that fires by itself. One head.
//   BACK:  what happens when you dash or get hurt. One back.
//   CORE:  your engine. Only planted from devoured boss cores.
// You start with a WEAPON, LIMBS and HEAD slot open. Each devoured boss core
// opens the next slot in SLOT_ORDER (CORE, then BACK, then a second WEAPON),
// so a finished body is six parts: never zero weapons, never five.
// BOSS PICKS (`boss: true`): the strangest roots (the playstyle mouths,
// Tentacles, Parasite Brain) are rare finds in colored vials, never level-ups.
//
// Each part grows ONE path:
//   plant a ROOT in a free slot (or replace your starter slime);
//   then it BRANCHES. Two ways to go; taking one locks out the other.
//   root -> branch -> branch, then it's fully grown (4 end forms per root).
// Biomass level-ups don't evolve parts: they LEVEL them (a small stat bump).
// At level 3 a part evolves (you choose its branch) and its level resets.
// Vials and boss cores still evolve directly.
//
// Each node tweaks the stat sheet (see baseStats); branches mostly set flags
// that the game code reacts to (Bone Jaws: every bite drives a spike out the
// back of the victim). The more involved mechanics live in abilities.js.
//
// To add a branch: add an entry to MUTATIONS with `from: '<parent id>'`, plus a
// whisper in HINTS. Art: paint an icon in sprites.js (ICON_PAINT), or reuse two
// with `icon: ['a', 'b']`.
// ---------------------------------------------------------------------------

const LOCS = ['MOUTH', 'HEAD', 'BACK', 'LIMBS', 'CORE'];
const LOC_MAX = { MOUTH: 2, HEAD: 1, BACK: 1, LIMBS: 1, CORE: 1 }; // the most of each a body can hold
// The order slots open in: the first START_SLOTS at birth, then one per devoured boss core.
const SLOT_ORDER = ['MOUTH', 'LIMBS', 'HEAD', 'CORE', 'BACK', 'MOUTH'];
const START_SLOTS = 3;                  // you start with all of them empty
const MAX_SLOTS = SLOT_ORDER.length;    // the hard cap: a finished body is 6 parts
const WILD_CHANCE = 0.15;              // the first vials' chance of a rare find
const LOC_NAME = { MOUTH: 'WEAPON', HEAD: 'HEAD', BACK: 'BACK', LIMBS: 'LIMBS', CORE: 'CORE' }; // what the player sees
const LEVEL_MAX = 3;                    // levels before a part evolves
// POWER IS EARNED. A fresh body hits at 70%; every fully grown part and every
// splice adds +6%. A finished body ends up far stronger than it started.
const BASE_POWER = 0.7, POWER_PER_GROWN = 0.06, POWER_PER_SPLICE = 0.06;
function bodyPower(p) {
  const grown = p.parts.filter(m => !m.starter && !childrenOf(m.id).length).length;
  return BASE_POWER + POWER_PER_GROWN * grown + POWER_PER_SPLICE * activeSplices(p).length;
}

const RARITY = {
  common:    { label: 'COMMON',    color: '#9a9284', weight: 60 },
  uncommon:  { label: 'UNCOMMON',  color: '#8fb04a', weight: 27 },
  rare:      { label: 'RARE',      color: '#5a8ae0', weight: 18 },
  legendary: { label: 'LEGENDARY', color: '#e8a020', weight: 5 },
};
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary'];

// MALIGNANT mutations are extra strong but carry a `cost` (shown in red).
// Most can be cured by combining with the right partner.
const MALIGNANT_COLOR = '#a04ad0';
const COST_COLOR = '#d04050';

const SLUG_SPEED = 60; // limbless crawl (before its pulsing)

function baseStats() {
  return {
    // --- Movement (set by whatever is in your LIMBS). Limbless = a slow slug. ---
    speed: SLUG_SPEED, slug: true, accel: 0, drag: 0, flyover: false, hop: 0, dashSpeed: 260,
    grapple: 0, grappleRange: 0, pullDmg: 0, pullThrough: false,
    centipede: 0, burrow: 0, burrowDmg: 0, shell: false, fins: 0, stilts: false, hands: false, handDmg: 0,
    pupa: false, moleworm: false, puppeteer: false,
    limbActive: null, headActive: null, // right-click / automatic head abilities (see ACTIVES in abilities.js)
    limbCdMul: 1, headCdMul: 1,         // their cooldowns (part levels shorten them)
    limbCount: 0,
    // --- Attacks (MOUTH). Every weapon fires on its own timer, so they stack. ---
    damageMul: 1, rateMul: 1, damage: 1,
    onHit: {},    // statuses each attack leaves behind (see onHit())
    guns: [],     // projectile weapons (see gun() below)
    rangeAdd: 0, speedAdd: 0, // extra shot range / speed (Extra Eyes, Bone Lance)
    bite: false, biteDmg: 0, biteDelay: 9, biteReach: 24, biteAcid: 0, biteHeal: 0, doubleBite: false, leech: 0,
    lash: false, lashDmg: 0, lashDelay: 9, lashRange: 52, lashTargets: 1, lashAcid: 0, mawTendrils: 0, bulk: 0,
    lunge: false, lungeDmg: 0, lungeDelay: 9,
    beam: 0, beamRange: 56, vomit: 0, vomitDmg: 0, vomitDelay: 9,
    // Firing style: WHAT you fire comes from MOUTH; HOW can be changed by a
    // path (charge & blast, or rapid stream).
    charge: false, stream: false, chargeBonus: false,
    // --- Modifiers that work with any attack ---
    homing: 0, split: 0, acid: 0, pierce: 0, reach: 0,
    // Shard rings (fired when dashing / hurt)
    ring: 0, ringHoming: 0, ringAcid: false, ringSplit: 0,
    trailSpines: false, trailAcid: false,
    // Dash / charge
    dashCd: 0.8, dashTime: 0.14, dashDmg: 0, slamDmg: 0, slamR: 0, dashReset: false,
    // --- Senses ---
    antennae: false, echo: 0, compound: 0, parasite: false, symbiote: false,
    // --- Defense ---
    maxHp: 0, shieldCd: 0, shieldRing: 0, regen: 0, hemophage: 0, thorns: 0,
    invuln: 1.0, adrenal: 0, adrenalRage: false, toxicBlood: 0, secondHeart: false,
    eggsac: 0, pustules: 0, molt: false, lure: false,
    // --- Organs ---
    brood: 0, bacteria: 0, twin: false,
    // --- Trade-offs ---
    hpMul: 1, dnaMul: 1, lightMul: 1, invulnCap: 99, starve: 0, nightEyes: 0,
    speedMul: 1, hitCost: 1,
  };
}

// Runs after every slot has been applied.
function finalizeStats(s) {
  const m = s.damageMul;
  s.damage = m; // generic damage scale (shard rings etc.)
  for (const k of ['biteDmg', 'lashDmg', 'lungeDmg', 'dashDmg', 'slamDmg', 'thorns', 'toxicBlood', 'pullDmg', 'beam', 'vomitDmg', 'burrowDmg', 'handDmg']) s[k] *= m;
  for (const k of ['biteDelay', 'lashDelay', 'lungeDelay', 'vomitDelay']) s[k] *= s.rateMul;
  for (const g of s.guns) {
    g.dmg *= m; g.delay *= s.rateMul; g.range += s.rangeAdd; g.speed += s.speedAdd;
    g.acid = Math.max(g.acid, s.acid);
  }
  // Playstyle attacks.
  for (const k of ['ovi', 'howl', 'polyp', 'tongue', 'silk']) if (s[k]) s[k].delay *= s.rateMul;
  if (s.ovi) { s.ovi.dps *= m; s.ovi.burstDmg *= m; }
  if (s.howl) { s.howl.dmg *= m; s.howl.slam *= m; s.howl.range += s.reach; }
  if (s.polyp) s.polyp.dmg *= m;
  if (s.tongue) { s.tongue.dmg *= m; s.tongue.spit *= m; s.tongue.range += s.reach * 2; }
  if (s.silk) s.silk.dmg *= m;
  if (s.miasma) s.miasma.dps *= m;
  s.speed *= s.speedMul;
  // Hind legs only hop if they're your only limbs; with others you walk and still pounce.
  if (s.hop && s.limbCount > 1) s.hop = 0;
  s.slimeTrail = s.slug || s.fins > 0 || s.shell || !!s.alwaysSlime; // slugs, snails, pseudopods (and the Sticky) leave slime
  // A limbless slug can only manage a short, weak lurch.
  if (s.slug) { s.dashSpeed = 190; s.dashCd *= 1.25; s.dashTime = Math.min(s.dashTime, 0.12); }
  // Firing styles. Charge wins over stream (stream then adds pellets to the blast).
  s.chargeBonus = s.chargeBonus || (s.charge && s.stream);
  if (s.charge) s.stream = false;
  if (s.stream) {
    for (const g of s.guns) if (!g.native) { g.delay *= 0.35; g.dmg *= 0.45; g.spread += 0.16; g.range *= 0.8; g.cloud *= 0.6; }
    s.biteDelay *= 0.35; s.lashDelay *= 0.35; s.lungeDelay *= 0.4; s.vomitDelay *= 0.35;
    s.biteDmg *= 0.55; s.lashDmg *= 0.55; s.lungeDmg *= 0.55; s.vomitDmg *= 0.5;
    for (const k of ['ovi', 'howl', 'polyp', 'tongue', 'silk']) if (s[k]) s[k].delay *= 0.5;
  }
  s.biteReach += s.reach;
  s.lashRange += s.reach * 2;
  s.invuln = Math.min(s.invuln, s.invulnCap);
}

// What an attack leaves behind: onHit(s, 'lash', 'bleed', { t: 3, dps: 2 }) makes
// every lash bleed. Sources: melee, any (every shot and melee hit), bite, lash,
// lunge, dash, slam, howl, beam, burrow, barb, tongue, silk, pollen, gas, ovi, contact, jelly.
// Extras: chance (0-1), say ([text, color] floated when it lands). Two parts giving
// the same status to the same source keep the stronger of each value, or with
// mode 'add', add up their magnitudes (Gore Horns' bleed grows with its level).
function onHit(s, source, id, opts, extra = {}, mode) {
  if (!STATUS_IDS.includes(id)) throw new Error('onHit: unknown status ' + id);
  const list = s.onHit[source] ||= [];
  const cur = list.find(h => h.id === id);
  if (!cur) { list.push(Object.assign({ id, opts: Object.assign({}, opts) }, extra)); return; }
  for (const k in opts) cur.opts[k] = mode === 'add' && k !== 't' ? (cur.opts[k] || 0) + opts[k] : Math.max(cur.opts[k] ?? -Infinity, opts[k]);
  Object.assign(cur, extra);
}
const STATUS_IDS = ['bleed', 'stun', 'slow', 'web', 'blind', 'mark', 'corrode', 'pollen', 'leak', 'acidMark', 'chill', 'net']; // (status.js loads later)

// Add a projectile weapon. Each one fires on its own timer.
function gun(s, props) {
  s.guns.push(Object.assign({
    id: '', dmg: 1, delay: 0.75, speed: 155, range: 0.7, r: 2, count: 1, spread: 0,
    acid: 0, acidChance: 0, bleed: 0, slow: 0, lob: false, cloud: 0, round: false, fade: false,
    native: false, color: '#cfc4a4', sound: 'shoot',
  }, props));
}
// ===========================================================================
// THE TREE. Every slot has a few ROOTS. Each root splits into 2 branches,
// and each branch into 2 more: root -> tier 1 -> tier 2 (4 end forms).
//   `slot` marks a root, `from` marks a branch (its parent).
//   `part: true` entries are never offered; other nodes borrow their effects.
// Every node in your path is applied with l = how far the path has grown
// (1-3), so roots keep getting stronger as they branch.
// Branches mostly add NEW INTERACTIONS (flags the game code reacts to)
// instead of bigger numbers.
// ===========================================================================
const MUTATIONS = {
  // ================= MOUTH: your attack =================
  // You're born spitting little slime blobs. It never branches: your first
  // MOUTH pick replaces it with a real root.
  slime: {
    name: 'Slime Blob', slot: 'MOUTH', part: true, rarity: 'common',
    desc: 'Spit little globs of sticky slime. Whatever they hit is slowed for a moment.',
    apply(s) { gun(s, { id: 'slime', dmg: 1, delay: 0.5, speed: 135, range: 0.55, r: 2.5, slow: 1.2, round: true, color: '#9aae8a', sound: 'splat' }); },
  },
  spike: {
    name: 'Bone Spike', slot: 'MOUTH', rarity: 'common',
    desc: 'Fire a fast bone spike. Harder and faster as it grows; twin spikes at full growth.',
    apply(s, l) { gun(s, { id: 'spike', dmg: 1.4 + 0.4 * (l - 1), delay: 0.6 - 0.08 * (l - 1), speed: 170, count: l >= 3 ? 2 : 1 }); },
  },
  shotgun: {
    name: 'Bone Shotgun', from: 'spike', rarity: 'uncommon', icon: ['spike', 'marrow'],
    desc: 'Hold fire to charge, release to blast a spray of bone shrapnel.',
    short: 'Hold to charge, release a spray of bone shrapnel.',
    apply(s) { s.charge = true; },
  },
  bonewall: {
    name: 'Bone Wall', from: 'shotgun', rarity: 'rare', icon: ['spike', 'chitin'],
    desc: 'A full-charge blast leaves a wall of bone spikes for a few seconds. It cuts whatever touches it and stops enemy shots.',
    short: 'Full charges leave a wall of spikes that stops shots.',
    apply(s) { s.boneWall = true; },
  },
  shrapnel: {
    name: 'Shrapnel Storm', from: 'shotgun', rarity: 'rare', icon: ['spike', 'mitosis'],
    desc: 'Half again as much shrapnel, and every piece shatters into fragments on a hit.',
    short: 'More shrapnel, and it shatters on a hit.',
    apply(s) { s.chargeBonus = true; s.blastSplit = 2; },
  },
  lance: {
    name: 'Bone Lance', from: 'spike', rarity: 'uncommon', icon: ['spike', 'eyes'],
    desc: 'Longer spikes that punch through one enemy and shatter any enemy shot they cross.',
    short: 'Longer spikes that pierce, and shatter enemy shots.',
    apply(s) { s.rangeAdd += 0.25; s.pierce += 1; s.spikeEat = true; },
  },
  splinter: {
    name: 'Splinter', from: 'lance', rarity: 'rare', icon: ['spike', 'mitosis'],
    desc: 'A spike that kills bursts into a ring of bone shards.',
    apply(s) { s.spikeKillRing = 6; },
  },
  venomspike: {
    name: 'Venom Lance', from: 'lance', rarity: 'rare', overlay: ['acid'], icon: ['spike', 'bile'],
    desc: 'Spikes drip burning bile along their whole flight.',
    apply(s) { s.venomSpike = true; },
  },

  bile: {
    name: 'Bile Spit', slot: 'MOUTH', rarity: 'uncommon', overlay: ['acid'],
    desc: 'Flamethrower. Hold fire to spray a fast, short-range stream of burning bile.',
    short: 'Flamethrower. Spray a short stream of burning bile.',
    apply(s, l) {
      gun(s, {
        id: 'bile', dmg: 0.22 + 0.08 * l, delay: 0.09, speed: 175, range: 0.36 + 0.03 * l, spread: 0.22,
        acid: 7 + 2 * l, acidChance: 0.25, round: true, fade: true, native: true, color: '#b0c040', sound: 'spray',
      });
    },
  },
  sporefire: {
    name: 'Spore Fire', from: 'bile', rarity: 'rare', overlay: ['sporepods'], icon: ['bile', 'mitosis'],
    desc: 'A spore mortar too, and your bile flame ignites spore clouds into burning blasts.',
    short: 'A spore mortar too. Your flame ignites the clouds.',
    apply(s, l) { MUTATIONS.spores.apply(s, l); s.sporeFire = true; },
  },
  rotbloom: {
    name: 'Rot Bloom', from: 'sporefire', rarity: 'rare', icon: ['mitosis', 'regrow'],
    desc: 'Spore clouds are bigger and slowly eat whatever is lost inside them.',
    short: 'Bigger spore clouds that slowly eat their prey.',
    apply(s) { s.cloudDps = 1.2; s.cloudMul = 1.4; },
  },
  bilemortar: {
    name: 'Rot Shells', from: 'sporefire', rarity: 'rare', icon: ['bile', 'spike'],
    desc: 'Mortar shells burrow in where they land and keep coughing up spore clouds for a few seconds.',
    short: 'Mortar shells keep coughing spore clouds.',
    apply(s) { s.lobLinger = 3; },
  },
  acidmaw: {
    name: 'Acid Maw', from: 'bile', rarity: 'rare', overlay: ['mandibles'], icon: ['mandibles', 'bile'],
    desc: 'Mandibles too: anything you bite rots inside, and bursts into bile when it dies.',
    short: 'Mandibles too. Bitten prey rots and bursts into bile.',
    apply(s, l) { MUTATIONS.mandibles.apply(s, l); onHit(s, 'bite', 'acidMark', { t: Infinity }); },
  },
  vomit: {
    name: 'Purge', from: 'acidmaw', rarity: 'uncommon', icon: ['bile', 'hemophage'],
    desc: 'When you are hurt, you vomit a ring of burning bile around you that shoves everything back.',
    short: 'Hurt: vomit a ring of bile that shoves them back.',
    apply(s, l) { s.purge = 6 + 2 * l; },
  },
  meltbite: {
    name: 'Melting Bite', from: 'acidmaw', rarity: 'rare', icon: ['mandibles', 'toxic'],
    desc: 'Bites deal triple damage to anything standing in your bile.',
    short: 'Triple bite damage on prey in your bile.',
    apply(s) { s.meltBite = true; },
  },

  mandibles: {
    name: 'Mandibles', slot: 'MOUTH', rarity: 'common', overlay: ['mandibles'],
    desc: 'Melee. Fire bites whatever is in a wide arc in front of you, hard and fast, and what you bite reels.',
    short: 'Melee. Bite hard and fast in a wide arc.',
    apply(s, l) { s.bite = true; s.biteDmg += 2 + 1.2 * l; s.biteDelay = Math.min(s.biteDelay, 0.42 - 0.04 * l); },
  },
  feral: {
    name: 'Feral Lunge', from: 'mandibles', rarity: 'rare', overlay: ['fangs'],
    desc: 'Fire also leaps the way you are moving (untouchable for the leap) and savages everything ahead when you land.',
    short: 'Fire also leaps forward and savages the way ahead.',
    apply(s, l) { s.lunge = true; s.lungeDmg += 5 + 2 * l; s.lungeDelay = Math.min(s.lungeDelay, 0.5); },
  },
  apexjaws: {
    name: 'Apex Jaws', from: 'feral', rarity: 'legendary', icon: ['feral', 'mandibles'],
    desc: 'Every lunge bites twice, and a lunge that kills lets you lunge again at once.',
    short: 'Lunges bite twice. A kill lunges again.',
    apply(s) { s.doubleBite = true; s.lungeChain = true; },
  },
  rending: {
    name: 'Rending Leap', from: 'feral', rarity: 'rare', overlay: ['drool'], icon: ['feral', 'horns'],
    desc: 'Lunges leave deep bleeding wounds, and biting a bleeding enemy can heal you.',
    short: 'Lunges leave bleeding wounds that feed you.',
    apply(s) { onHit(s, 'lunge', 'bleed', { t: 3, dps: 3 }); s.bleedFeed = 0.12; },
  },
  mawtendrils: {
    name: 'Maw Tendrils', from: 'mandibles', rarity: 'rare', overlay: ['tentacles'], icon: ['mandibles', 'tentacles'],
    desc: 'Mouths grow on tendrils from your throat. Every bite sends two after the nearest other prey around you, and they bite too (half damage).',
    short: 'Each bite sends two mouths after other prey.',
    apply(s) { s.mawTendrils = 2; },
  },
  leech: {
    name: 'Leech Mouth', from: 'mawtendrils', rarity: 'uncommon', overlay: ['leech'], icon: ['mandibles', 'hemophage'],
    desc: 'Rapid little bites. Every few bites heal you.',
    short: 'Rapid little bites. Every few bites heal you.',
    apply(s, l) { s.biteDelay = Math.min(s.biteDelay, 0.26); s.leech = 7 - l; },
  },
  devour: {
    name: 'Devour', from: 'mawtendrils', rarity: 'legendary', overlay: ['fangs'], icon: ['mandibles', 'starving'],
    desc: 'Biting a badly wounded enemy swallows it whole.',
    apply(s) { s.devour = 0.35; },
  },

  tentacles: {
    name: 'Tendrils', slot: 'MOUTH', rarity: 'uncommon', overlay: ['tentacles'],
    desc: 'Melee. Fire lashes enemies in front of you at mid range: 1 / 2 / 3 targets.',
    short: 'Melee. Lash the enemies in front of you.',
    apply(s, l) { s.lash = true; s.lashDmg += 1.5 + 0.8 * l; s.lashTargets = Math.max(s.lashTargets, l); s.lashDelay = Math.min(s.lashDelay, 0.6 - 0.05 * l); },
  },
  caustic: {
    name: 'Caustic Tendrils', from: 'tentacles', rarity: 'rare', overlay: ['acid'], icon: ['tentacles', 'bile'],
    desc: 'Lashed enemies leak burning bile wherever they crawl.',
    apply(s) { onHit(s, 'lash', 'leak', { t: 3 }); },
  },
  writhing: {
    name: 'Writhing Mass', from: 'caustic', rarity: 'rare', icon: ['tentacles', 'grapple'],
    desc: 'Many more tendrils: +2 targets and longer reach. The mass makes you bigger, stronger, and easier to hit.',
    short: 'More targets, longer reach. You grow bigger.',
    apply(s) { s.lashTargets += 2; s.lashRange += 15; s.bulk += 1; },
  },
  strangle: {
    name: 'Strangle', from: 'caustic', rarity: 'rare', icon: ['tentacles', 'echo'],
    desc: 'Lashed enemies are held fast for a moment.',
    apply(s) { onHit(s, 'lash', 'stun', { t: 0.6 }); },
  },
  hooks: {
    name: 'Bone Hooks', from: 'tentacles', rarity: 'uncommon', icon: ['tentacles', 'spike'],
    desc: 'Hooked tendrils: much longer reach, and wounds bleed.',
    apply(s) { s.lashRange += 25; onHit(s, 'lash', 'bleed', { t: 3, dps: 2 }); },
  },
  lashdrain: {
    name: 'Sucker Tips', from: 'hooks', rarity: 'rare', icon: ['tentacles', 'hemophage'],
    desc: 'Tendrils drink as they lash. Enough blood heals you.',
    apply(s) { s.lashDrain = true; },
  },
  flay: {
    name: 'Flay', from: 'hooks', rarity: 'rare', icon: ['tentacles', 'barbs'],
    desc: 'Lashing a bleeding enemy tears it open into a spray of shards.',
    short: 'Lashing a bleeding enemy tears it into shards.',
    apply(s) { s.flay = true; },
  },

  proboscis: {
    requires: { set: 'PREDATOR', label: 'A PREDATOR PART' },
    name: 'Proboscis', slot: 'MOUTH', rarity: 'rare', overlay: ['proboscis'],
    desc: 'Hold fire to latch a draining beam onto prey. Drained blood heals you. The tube takes a moment to reach its prey, and to pull back before it can go for another; it cannot reach through walls.',
    short: 'Hold fire to latch on and drain. Blood heals you.',
    apply(s, l) { s.beam += 0.25 + 0.1 * l; },
  },
  siphon: {
    name: 'Siphon', from: 'proboscis', rarity: 'rare', icon: ['proboscis', 'tentacles'],
    desc: 'The beam forks into a second victim nearby.',
    apply(s) { s.beamChain = true; },
  },
  hemorrhage: {
    name: 'Hemorrhage', from: 'siphon', rarity: 'rare', icon: ['proboscis', 'horns'],
    desc: 'Drained enemies keep bleeding after you let go.',
    apply(s) { onHit(s, 'beam', 'bleed', { t: 2, dps: 2 }); },
  },
  bloodbattery: {
    name: 'Blood Battery', from: 'siphon', rarity: 'rare', icon: ['proboscis', 'hide'],
    desc: 'You need half as much blood to heal.',
    apply(s) { s.drainHeal = 6; },
  },
  bloat: {
    name: 'Bloat', from: 'proboscis', rarity: 'rare', icon: ['proboscis', 'overgrown'],
    desc: 'Enemies drained to death swell and burst, spraying everything near them.',
    short: 'Enemies you drain to death burst on their friends.',
    apply(s) { s.drainBurst = true; },
  },
  sporesac: {
    name: 'Spore Sac', from: 'bloat', rarity: 'rare', overlay: ['sporepods'], icon: ['proboscis', 'mitosis'],
    desc: 'Bursting victims release blinding spore clouds.',
    apply(s) { s.burstSpores = true; },
  },
  longtube: {
    name: 'Gorging Tube', from: 'bloat', rarity: 'rare', icon: ['proboscis', 'eyes'],
    desc: 'A longer, hungrier proboscis: much more reach and drain.',
    apply(s) { s.beamRange += 32; s.beam *= 1.5; },
  },
  // ---- Playstyle roots: they replace shooting with something else entirely ----
  ovipositor: {
    requires: { any: ['eggsac', 'brood'], label: 'EGG SAC OR BROOD' },
    name: 'Ovipositor', slot: 'MOUTH', boss: true, rarity: 'rare', overlay: ['proboscis'],
    desc: 'Slowly launch a larva. It burrows into a host, eats it from inside, then bursts out to find new hosts.',
    short: 'Launch a larva that eats its host from inside.',
    apply(s, l) { s.ovi = { delay: 1.5 - 0.15 * (l - 1), dps: 0.5 + 0.25 * l, brood: l >= 3 ? 3 : 2, burstDmg: 2 + l, time: 4 }; },
  },
  broodhost: {
    name: 'Brood Host', from: 'ovipositor', rarity: 'uncommon', icon: ['ovipositor', 'spider'],
    desc: 'Half of what bursts out of a host hatches as spiderlings that fight for you.',
    short: 'Hosts burst into spiderlings that fight for you.',
    apply(s) { s.oviSpider = true; },
  },
  swarmqueen: {
    name: 'Swarm Queen', from: 'broodhost', rarity: 'legendary', icon: ['ovipositor', 'parasite'],
    desc: 'Infested hosts turn on their own kind until they burst.',
    apply(s) { s.oviCharm = true; },
  },
  gestation: {
    name: 'Gestation', from: 'broodhost', rarity: 'rare', icon: ['ovipositor', 'hide'],
    desc: 'Hosts carry the larva longer, and the longer they carry it, the bigger the brood.',
    short: 'Hosts carry longer, and burst into bigger broods.',
    apply(s) { s.ovi.time = 6; s.oviGrow = true; },
  },
  bloodworm: {
    name: 'Bloodworm', from: 'ovipositor', rarity: 'uncommon', icon: ['ovipositor', 'hemophage'],
    desc: 'The larva feeds far harder, and hosts burst sooner.',
    apply(s) { s.ovi.dps *= 2.5; s.ovi.time = 3; },
  },
  chestburster: {
    name: 'Chestburster', from: 'bloodworm', rarity: 'rare', icon: ['ovipositor', 'overgrown'],
    desc: 'The brood tears its host apart, hurting everything near it.',
    apply(s, l) { s.oviBurst = 4 + l; },
  },
  puppetlarva: {
    name: 'Puppet Larva', from: 'bloodworm', rarity: 'rare', icon: ['ovipositor', 'echo'],
    desc: 'Hosts stagger around blind and slow while it eats them.',
    apply(s) { onHit(s, 'ovi', 'blind', { t: 0.4 }); onHit(s, 'ovi', 'slow', { t: 0.3 }); },
  },

  miasma: {
    requires: { any: ['toxic', 'bacteria', 'fins'], label: 'TOXIC BLOOD, BACTERIA OR PSEUDOPODS' },
    name: 'Miasma', slot: 'MOUTH', boss: true, rarity: 'rare',
    desc: 'No attack. You leak a toxic cloud that eats everything near you. Hold fire to vent it wider, but you slow down.',
    apply(s, l) { s.miasma = { r: 30 + 4 * (l - 1), dps: 1.6 + 0.6 * (l - 1) }; },
  },
  shroud: {
    name: 'Spore Shroud', from: 'miasma', rarity: 'uncommon', icon: ['miasma', 'eyes'],
    desc: 'Enemies inside your gas lose track of you.',
    apply(s) { onHit(s, 'gas', 'blind', { t: 0.4 }); },
  },
  rothalo: {
    name: 'Rot Halo', from: 'shroud', rarity: 'rare', icon: ['miasma', 'mitosis'],
    desc: 'Anything that dies in your gas leaves a lingering toxic cloud of its own.',
    short: 'Kills in your gas leave toxic clouds of their own.',
    apply(s) { s.gasDeathCloud = true; },
  },
  phantom: {
    name: 'Phantom', from: 'shroud', rarity: 'rare', icon: ['miasma', 'nighteyes'],
    desc: 'While you vent, you vanish: nothing can find you.',
    apply(s) { s.gasInvis = true; },
  },
  causticlungs: {
    name: 'Caustic Lungs', from: 'miasma', rarity: 'uncommon', icon: ['miasma', 'toxic'],
    desc: 'The longer something stays in your gas, the faster it dissolves.',
    short: 'The longer they breathe your gas, the faster they melt.',
    apply(s) { s.gasRamp = true; },
  },
  corrode: {
    name: 'Corrode', from: 'causticlungs', rarity: 'rare', icon: ['miasma', 'bile'],
    desc: 'Your gas corrodes too, and everything Corroded takes +50% damage (instead of +25%) and burns twice as fast.',
    short: 'Your gas corrodes too, and harder.',
    apply(s) { s.gasCorrode = true; s.corrodeMul = 0.5; s.corrodeDps = CORRODE_DPS * 2; },
  },
  choke: {
    name: 'Choke', from: 'causticlungs', rarity: 'rare', icon: ['miasma', 'twitch'],
    desc: 'Your gas slows enemies, and their shots crawl through it.',
    short: 'Your gas slows enemies and their shots.',
    apply(s) { s.gasChoke = true; onHit(s, 'gas', 'slow', { t: 0.3 }); }, // (gasChoke also slows bullets in your gas)
  },

  howl: {
    name: 'Howl', slot: 'MOUTH', boss: true, rarity: 'uncommon',
    desc: 'A sonic cone that barely hurts but hurls enemies into walls and each other, and shreds their shots out of the air.',
    short: 'A sonic cone that hurls enemies and shreds shots.',
    apply(s, l) { s.howl = { delay: 0.8 - 0.05 * (l - 1), dmg: 0.3 * l, force: 300 + 40 * l, range: 62, cone: 0.55, slam: 2 + 1.2 * l }; },
  },
  shockwave: {
    name: 'Shockwave', from: 'howl', rarity: 'uncommon', icon: ['howl', 'slam'],
    desc: 'The howl bursts out all around you instead of ahead.',
    apply(s) { s.howl.cone = -1; s.howl.range *= 0.85; },
  },
  concussion: {
    name: 'Concussion', from: 'shockwave', rarity: 'rare', icon: ['howl', 'echo'],
    desc: 'Whatever the howl hits is stunned.',
    apply(s) { onHit(s, 'howl', 'stun', { t: 0.8 }); },
  },
  avalanche: {
    name: 'Avalanche', from: 'shockwave', rarity: 'rare', icon: ['howl', 'skull'],
    desc: 'Anything flung into another enemy flings that one too.',
    apply(s) { s.howlChain = true; },
  },
  soniclance: {
    name: 'Bone Choir', from: 'howl', rarity: 'uncommon', icon: ['howl', 'spike'],
    desc: 'A narrower, longer howl that carries a spray of bone shards with it.',
    short: 'A long, narrow howl that carries bone shards.',
    apply(s) { s.howl.cone = 0.85; s.howl.range *= 1.5; s.howlShards = 5; },
  },
  wallbreaker: {
    name: 'Wallbreaker', from: 'soniclance', rarity: 'rare', icon: ['howl', 'marrow'],
    desc: 'Enemies you slam into walls take far more and burst into bone shards.',
    short: 'Enemies slammed into walls burst into shards.',
    apply(s) { s.wallSlamMul = 2.5; },
  },
  rupture: {
    name: 'Rupture', from: 'soniclance', rarity: 'rare', icon: ['howl', 'horns'],
    desc: 'The howl ruptures them inside: they bleed.',
    apply(s) { onHit(s, 'howl', 'bleed', { t: 3, dps: 2.5 }); },
  },

  polyp: {
    name: 'Polyp Seeder', slot: 'MOUTH', boss: true, rarity: 'uncommon',
    desc: 'Fire plants a fleshy polyp that spits at anything nearby. Only a few can grow at once.',
    apply(s, l) { s.polyp = { delay: 1.1, max: 1 + l, dmg: 0.7 + 0.25 * l, rate: 0.9, life: 14 }; },
  },
  sporepolyp: {
    name: 'Spore Polyp', from: 'polyp', rarity: 'uncommon', icon: ['polyp', 'mitosis'],
    desc: 'Polyps spit spores that burst into blinding clouds.',
    apply(s) { s.polypCloud = true; },
  },
  fruiting: {
    name: 'Fruiting Bodies', from: 'sporepolyp', rarity: 'rare', icon: ['polyp', 'overgrown'],
    desc: 'Polyps burst in burning bile when something touches them, or when they wither.',
    short: 'Polyps burst into burning bile when touched.',
    apply(s) { s.polypBurst = true; },
  },
  mycelialweb: {
    name: 'Mycelial Web', from: 'sporepolyp', rarity: 'rare', icon: ['polyp', 'silk'],
    desc: 'Your polyps are joined by threads that eat whatever crosses them.',
    short: 'Threads join your polyps and eat what crosses.',
    apply(s) { s.polypLink = true; },
  },
  tendrilpolyp: {
    name: 'Tendril Polyp', from: 'polyp', rarity: 'uncommon', icon: ['polyp', 'tentacles'],
    desc: 'Polyps lash whatever comes close instead of spitting, much harder.',
    short: 'Polyps lash nearby enemies instead of spitting.',
    apply(s) { s.polypLash = true; },
  },
  graspingbed: {
    name: 'Grasping Bed', from: 'tendrilpolyp', rarity: 'rare', icon: ['polyp', 'grapple'],
    desc: 'Polyp tendrils drag prey in and hold it.',
    apply(s) { s.polypGrab = true; },
  },
  feedingpolyps: {
    name: 'Feeding Polyps', from: 'tendrilpolyp', rarity: 'rare', icon: ['polyp', 'hemophage'],
    desc: 'More polyps, living longer, and what they kill feeds you.',
    apply(s) { s.polyp.max += 1; s.polyp.life *= 1.5; s.polypFeed = 5; },
  },

  tongue: {
    name: 'Frog Tongue', slot: 'MOUTH', boss: true, rarity: 'uncommon',
    desc: 'Hold fire to coil a long tongue, release to lash it out (further the longer you hold). Small prey is swallowed whole; tap fire to spit it back out.',
    short: 'Hold to coil, release to lash. Swallow small prey.',
    apply(s, l) { s.tongue = { delay: 0.55, range: 70 + 10 * l, dmg: 1.5 + 0.8 * l, spit: 3 + 1.5 * l, max: 3, size: 6 }; },
  },
  bottomlessgut: {
    name: 'Bottomless Gut', from: 'tongue', rarity: 'uncommon', icon: ['tongue', 'starving'],
    desc: 'Swallow bigger prey, and hold far more of it.',
    apply(s) { s.tongue.max = 6; s.tongue.size = 7.5; },
  },
  acidgut: {
    name: 'Acid Gut', from: 'bottomlessgut', rarity: 'rare', icon: ['tongue', 'bile'],
    desc: 'What you spit back is half-digested and bursts into burning bile.',
    short: 'Spat-out prey bursts into burning bile.',
    apply(s) { s.spitAcid = 16; },
  },
  regurgitate: {
    name: 'Regurgitate', from: 'bottomlessgut', rarity: 'rare', icon: ['tongue', 'spike'],
    desc: 'What you spit back shatters into bone shards on impact.',
    apply(s) { s.spitSplit = 5; },
  },
  barbedtongue: {
    name: 'Barbed Tongue', from: 'tongue', rarity: 'uncommon', icon: ['tongue', 'barbs'],
    desc: 'The tongue tears through everything along its length.',
    apply(s) { s.tongue.dmg *= 1.6; s.tonguePierce = true; },
  },
  grappletongue: {
    name: 'Grapple Tongue', from: 'barbedtongue', rarity: 'rare', icon: ['tongue', 'grapple'],
    desc: 'Lash anything too big to swallow, or a wall, and the tongue reels YOU in (never into a boss).',
    short: 'Lash a wall or big prey and the tongue reels you in.',
    apply(s) { s.tongueYank = true; },
  },
  venomtongue: {
    name: 'Venom Tongue', from: 'barbedtongue', rarity: 'rare', icon: ['tongue', 'toxic'],
    desc: 'The tongue leaves venom: what it touches bleeds and slows.',
    short: 'What the tongue touches bleeds and slows.',
    apply(s) { onHit(s, 'tongue', 'bleed', { t: 3, dps: 2 }); onHit(s, 'tongue', 'slow', { t: 1.5 }); },
  },

  silk: {
    name: 'Silk Spinner', slot: 'MOUTH', rarity: 'uncommon',
    desc: 'Fire spins a line of sticky web across the floor. Anything caught in it is stuck, and the silk cuts.',
    apply(s, l) { s.silk = { delay: 0.8, len: 50 + 10 * l, max: 3 + l, life: 9, dmg: 1.2 + 0.6 * l }; },
  },
  stickyweb: {
    name: 'Sticky Web', from: 'silk', rarity: 'uncommon', icon: ['silk', 'hide'],
    desc: 'The first time something touches a web, it is held completely.',
    short: 'The first touch on a web holds it completely.',
    apply(s) { onHit(s, 'silk', 'stun', { t: 1.4 }, { say: ['STUCK', '#e0d8d0'] }); },
  },
  webbrood: {
    name: 'Cocoon Wrap', from: 'stickyweb', rarity: 'rare', icon: ['silk', 'spider'],
    desc: 'Anything that dies in your web is wrapped up, and spiderlings hatch from it.',
    short: 'Kills in your web hatch spiderlings.',
    apply(s) { s.webBrood = 2; },
  },
  tripwire: {
    name: 'Tripwire', from: 'stickyweb', rarity: 'rare', icon: ['silk', 'spines'],
    desc: 'A web snaps when something hits it, firing bone shards all along its length.',
    short: 'Webs snap when hit, firing shards along them.',
    apply(s) { s.webSnap = true; },
  },
  razorsilk: {
    name: 'Razor Silk', from: 'silk', rarity: 'uncommon', icon: ['silk', 'horns'],
    desc: 'The silk is sharp: it cuts three times as deep.',
    apply(s) { s.silk.dmg *= 3; },
  },
  acidsilk: {
    name: 'Acid Silk', from: 'razorsilk', rarity: 'rare', icon: ['silk', 'bile'],
    desc: 'Whatever touches your web leaks burning bile as it crawls.',
    short: 'What touches your web leaks burning bile.',
    apply(s) { onHit(s, 'silk', 'leak', { t: 3 }); },
  },
  lair: {
    name: "Spider's Lair", from: 'razorsilk', rarity: 'rare', icon: ['silk', 'chitin'],
    desc: 'More webs that last far longer, and you run faster along your own silk.',
    short: 'More webs that last longer; run fast on silk.',
    apply(s) { s.silk.max += 3; s.silk.life *= 2; s.webLair = true; },
  },
  // Not offered on its own: Spore Fire grows it.
  spores: {
    name: 'Spore Cough', slot: 'MOUTH', part: true, rarity: 'uncommon', overlay: ['sporepods'],
    desc: 'Mortar. Lob spores over cover to where you aim; they burst into blinding clouds.',
    apply(s, l) { gun(s, { id: 'spores', dmg: 0.8, delay: 0.9, lob: true, cloud: 20 + 4 * l, r: 3, color: '#7a8a52', sound: 'splat' }); },
  },

  // ================= HEAD =================
  eyes: {
    name: 'Extra Eyes', slot: 'HEAD', rarity: 'uncommon', overlay: ['eyes'],
    desc: 'Shots curve toward prey. Melee reaches further. Every few seconds it marks the toughest prey in sight; it takes more damage from everything.',
    apply(s, l) { s.homing += 2 + 1.5 * l; s.headActive = { kind: 'mark', l }; s.rangeAdd += 0.1 * l; s.reach += 3 * l; },
  },
  compound: {
    name: 'Compound Eyes', from: 'eyes', rarity: 'uncommon', overlay: ['compound'], icon: ['eyes', 'chitin'],
    desc: 'A wider light, and enemy shots slow down near you.',
    apply(s, l) { s.lightMul *= 1.3; s.compound = l >= 3 ? 0.4 : 0.55; },
  },
  hivesight: {
    name: 'Hive Sight', from: 'compound', rarity: 'rare', overlay: ['antennae'], icon: ['eyes', 'spider'],
    desc: 'Feel them in the dark, and their shots nearly stop near you.',
    apply(s) { s.antennae = true; s.compound = 0.25; },
  },
  glare: {
    name: 'Glare', from: 'compound', rarity: 'rare', icon: ['eyes', 'abyssal'],
    desc: 'Every few seconds your eyes flash, blinding everything close to you.',
    short: 'Your eyes flash, blinding everything close.',
    apply(s) { s.glare = 3; },
  },
  abyssal: {
    name: 'Abyssal Eye', from: 'eyes', rarity: 'legendary', overlay: ['thirdeye'],
    desc: 'It sees through flesh. Shots pierce 2 enemies and seek. +30% damage.',
    short: 'Shots pierce and seek. Much more damage.',
    apply(s) { s.pierce += 2; s.homing += 3; s.damageMul *= 1.3; },
  },
  evileye: {
    name: 'Evil Eye', from: 'abyssal', rarity: 'rare', icon: ['abyssal', 'nighteyes'],
    desc: 'Your marks last twice as long, and when marked prey dies, the mark jumps to the next toughest prey nearby.',
    short: 'Marks last longer, and jump to new prey.',
    apply(s) { s.markTime = 2; s.markSpread = true; },
  },
  fractured: {
    name: 'Fractured Sight', from: 'abyssal', rarity: 'rare', overlay: ['mitosis'], icon: ['abyssal', 'mitosis'],
    desc: 'Every hit bursts into seeking fragments.',
    apply(s) { s.split += 2; },
  },

  skull: {
    name: 'Battering Skull', slot: 'HEAD', rarity: 'common', overlay: ['horns'],
    desc: 'Your dash becomes a charge that rams enemies for heavy damage. Anything that gets in your face takes a brutal, stunning headbutt.',
    short: 'Your dash rams for heavy damage. Headbutts stun.',
    apply(s, l) { s.dashDmg += 2 + 2 * l; s.headActive = { kind: 'headbutt', l }; },
  },
  horns: {
    name: 'Gore Horns', from: 'skull', rarity: 'uncommon', overlay: ['gorehorns'],
    desc: 'Charge further. Enemies you ram bleed out over time.',
    apply(s, l) { s.dashTime += 0.04 * l; s.dashDmg += l; onHit(s, 'dash', 'bleed', { t: 3, dps: 1.5 * l }, {}, 'add'); },
  },
  juggernaut: {
    name: 'Juggernaut', from: 'horns', rarity: 'legendary', icon: ['skull', 'horns'],
    desc: 'Rammed enemies are launched into walls and each other. Charge kills refresh your dash.',
    apply(s) { s.juggernaut = true; s.dashReset = true; },
  },
  bloodletter: {
    name: 'Bloodletter', from: 'horns', rarity: 'rare', icon: ['horns', 'hemophage'],
    desc: 'Ramming an enemy that is already bleeding makes it burst, hurting everything near it.',
    short: 'Ram a bleeding enemy and it bursts.',
    apply(s) { s.bleedBurst = true; },
  },
  echo: {
    name: 'Bone Echo', from: 'skull', rarity: 'uncommon', overlay: ['echo'], icon: ['skull', 'antennae'],
    desc: 'Your skull rings: every headbutt and every dash bursts bone shards out of you.',
    short: 'Headbutts and dashes burst bone shards.',
    apply(s, l) { s.skullRing = 4 + 2 * l; },
  },
  shatter: {
    name: 'Shatter Scream', from: 'echo', rarity: 'rare', icon: ['skull', 'spike'],
    desc: 'Stunned enemies take double damage.',
    apply(s) { s.stunBreak = true; },
  },
  ossified: {
    name: 'Ossified Skull', from: 'echo', rarity: 'rare', icon: ['skull', 'chitin'],
    desc: 'While your headbutt is ready, your skull takes a hit for you. Then it has to recover.',
    apply(s) { s.skullGuard = true; },
  },

  nighteyes: {
    name: 'Night Eyes', slot: 'HEAD', rarity: 'uncommon', malignant: true, overlay: ['compound'],
    desc: '+50% damage (more as it grows) to enemies outside your light. When something closes in, your light snuffs out and the whole room goes dark.',
    short: 'Far more damage to prey outside your light.',
    cost: 'Your light shrinks to a small circle.',
    costShort: 'The light begins to fail you.', // the card's line (vague); hovering shows the exact cost
    apply(s, l) { s.nightEyes += 0.3 + 0.2 * l; s.headActive = { kind: 'blackout', l }; s.lightMul *= 0.6; },
  },
  owleyes: {
    name: 'Owl Eyes', from: 'nighteyes', rarity: 'rare', cures: true, icon: ['nighteyes', 'eyes'],
    desc: 'CURED. Keep the darkness bonus, and your light returns to normal.',
    short: 'CURED. Keep the dark bonus; your light returns.',
    apply(s) { s.lightMul /= 0.6; },
  },
  antennae: {
    name: 'Antennae', from: 'owleyes', rarity: 'uncommon', overlay: ['antennae'],
    desc: 'Feel movement in the dark: see enemies as faint outlines. Hit the dark harder.',
    apply(s) { s.antennae = true; s.nightEyes += 0.3; },
  },
  stalker: {
    name: 'Stalker', from: 'owleyes', rarity: 'rare', icon: ['nighteyes', 'hemophage'],
    desc: 'Kills out in the dark can heal you.',
    apply(s) { s.darkHeal = 0.15; },
  },
  pitchblack: {
    name: 'Pitch Black', from: 'nighteyes', rarity: 'rare', malignant: true, icon: ['nighteyes', 'abyssal'],
    desc: 'Far more damage out in the dark.',
    cost: 'Your light shrinks even further.',
    costShort: 'The dark closes in.', // the card's line (vague); hovering shows the exact cost
    apply(s) { s.nightEyes += 0.75; s.lightMul *= 0.8; },
  },
  darkstare: {
    name: 'Abyss Stare', from: 'pitchblack', rarity: 'rare', icon: ['nighteyes', 'echo'],
    desc: 'Shots that hit out in the dark stun.',
    apply(s) { s.darkStun = 0.5; },
  },
  lightless: {
    name: 'Lightless', from: 'pitchblack', rarity: 'legendary', malignant: true, overlay: ['antennae'], icon: ['nighteyes', 'starving'],
    desc: 'You feel them instead of seeing them, and the dark doubles everything.',
    short: 'You feel them in the dark, and the dark doubles all.',
    cost: 'Almost no light at all.',
    costShort: 'You will not see the light again.', // the card's line (vague); hovering shows the exact cost
    apply(s) { s.antennae = true; s.nightEyes += 1; s.lightMul *= 0.6; },
  },

  parasite: {
    requires: { any: ['mitosis', 'twin'], label: 'MITOSIS OR A TWIN' },
    name: 'Parasite Brain', slot: 'HEAD', boss: true, rarity: 'rare', malignant: true, overlay: ['parasite'],
    desc: '+60% damage with everything. Every few seconds it mind-spikes the nearest enemy, stunning and wounding it.',
    short: 'Something else makes you much stronger.',
    cost: 'Sometimes it takes control of your body.',
    costShort: 'It will want your body.', // the card's line (vague); hovering shows the exact cost
    apply(s, l) { s.damageMul *= 1.6; s.parasite = true; s.headActive = { kind: 'mindspike', l }; },
  },
  symbiote: {
    name: 'Symbiote', from: 'parasite', rarity: 'legendary', cures: true, icon: ['parasite', 'antennae'],
    desc: 'CURED. The parasite works with you now: keep the damage, keep control.',
    short: 'CURED. Keep the damage, and keep control.',
    apply(s) { s.symbiote = true; },
  },
  brainworm: {
    name: 'Brain Worm', from: 'symbiote', rarity: 'rare', icon: ['parasite', 'echo'],
    desc: 'Your hits sometimes stun.',
    apply(s) { onHit(s, 'any', 'stun', { t: 0.8 }, { chance: 0.12 }); },
  },
  overmind: {
    name: 'Overmind', from: 'symbiote', rarity: 'rare', overlay: ['echo'], icon: ['parasite', 'skull'],
    desc: 'It screams through you when you dash, stunning everything near. +20% damage.',
    short: 'Dashing screams, stunning all near. You hit harder.',
    apply(s) { s.echo = Math.max(s.echo, 1.2); s.damageMul *= 1.2; },
  },
  rider: {
    name: 'Rider', from: 'parasite', rarity: 'rare', malignant: true, icon: ['parasite', 'twitch'],
    desc: '+30% more damage. While it drives, nothing can hurt you.',
    short: 'Let it drive. You hit harder.',
    cost: 'It takes control far more often.',
    costShort: 'It wants the reins.', // the card's line (vague); hovering shows the exact cost
    apply(s) { s.damageMul *= 1.3; s.parasiteInv = true; s.parasiteOften = true; },
  },
  berserkhost: {
    name: 'Berserker Host', from: 'rider', rarity: 'rare', icon: ['parasite', 'feral'],
    desc: 'While it drives, it attacks the nearest enemy for you, twice as fast.',
    short: 'While it drives, it attacks twice as fast.',
    apply(s) { s.parasiteFrenzy = true; },
  },
  cerebral: {
    name: 'Cerebral Bloat', from: 'rider', rarity: 'rare', malignant: true, icon: ['parasite', 'overgrown'],
    desc: '+40% more damage.',
    short: 'Your skull swells. You hit much harder.',
    cost: '-1 max health.',
    costShort: 'Something must make room.', // the card's line (vague); hovering shows the exact cost
    apply(s) { s.damageMul *= 1.4; s.maxHp -= 1; },
  },

  bloom: {
    name: 'Bloom', slot: 'HEAD', rarity: 'uncommon',
    desc: 'A carnivorous flower opens on your head. It puffs pollen; pollinated enemies take more damage. When something gets close, it bursts, pollinating everything around you.',
    short: 'Pollen makes enemies take more damage.',
    apply(s, l) { s.pollen = { r: 42, every: 3.2 - 0.4 * (l - 1) }; s.headActive = { kind: 'pollenburst', l }; },
  },
  venusmaw: {
    name: 'Venus Maw', from: 'bloom', rarity: 'uncommon', icon: ['bloom', 'mandibles'],
    desc: 'The flower bites anything that touches you.',
    apply(s, l) { s.flowerBite = 2 + l; },
  },
  digest: {
    name: 'Digest', from: 'venusmaw', rarity: 'rare', icon: ['bloom', 'hemophage'],
    desc: 'What the flower kills, it digests: it can heal you.',
    apply(s) { s.flowerHeal = 0.3; },
  },
  snaptrap: {
    name: 'Snap Trap', from: 'venusmaw', rarity: 'rare', icon: ['bloom', 'echo'],
    desc: 'The flower snaps shut on what it bites, holding it fast.',
    short: 'The flower snaps shut and holds its prey.',
    apply(s) { s.flowerStun = 1.2; },
  },
  sporebloom: {
    name: 'Spore Bloom', from: 'bloom', rarity: 'uncommon', icon: ['bloom', 'mitosis'],
    desc: 'Pollen blinds whatever breathes it.',
    apply(s) { onHit(s, 'pollen', 'blind', { t: 1.5 }); },
  },
  hayfever: {
    name: 'Hay Fever', from: 'sporebloom', rarity: 'rare', icon: ['bloom', 'twitch'],
    desc: 'Pollinated enemies choke and stagger, slowed to a crawl.',
    apply(s) { onHit(s, 'pollen', 'slow', { t: 2 }); },
  },
  nightbloom: {
    name: 'Night Bloom', from: 'sporebloom', rarity: 'rare', icon: ['bloom', 'nighteyes'],
    desc: 'Pollen glows. Pollinated enemies take twice the extra damage.',
    short: 'Glowing pollen: pollinated prey takes double.',
    apply(s) { s.pollenMul = 0.5; },
  },

  // ================= BACK =================
  spines: {
    name: 'Bone Spurs', slot: 'BACK', rarity: 'common', overlay: ['spines'],
    desc: 'Dashing or getting hurt fires a ring of bone shards.',
    apply(s, l) { s.ring += 4 + 2 * l; },
  },
  urchinhide: {
    name: 'Urchin Hide', from: 'spines', rarity: 'rare', overlay: ['barbs'], icon: ['spines', 'barbs'],
    desc: 'Barbed skin, and anything that touches you sets off your shard ring.',
    short: 'Barbed skin. Touching you sets off your shards.',
    apply(s, l) { s.thorns += 1 + l; s.urchinHide = true; },
  },
  venomquills: {
    name: 'Venom Quills', from: 'urchinhide', rarity: 'rare', overlay: ['acid'], icon: ['spines', 'toxic'],
    desc: 'Your shards leave bile wherever they land.',
    apply(s) { s.ringAcid = true; },
  },
  seekquills: {
    name: 'Seeking Quills', from: 'urchinhide', rarity: 'rare', icon: ['spines', 'eyes'],
    desc: 'Your shards hunt for flesh.',
    apply(s) { s.ringHoming = 5; },
  },
  quillpulse: {
    name: 'Quill Guard', from: 'spines', rarity: 'uncommon', icon: ['spines', 'chitin'],
    desc: 'Your bone shards shatter any enemy shot they touch.',
    apply(s) { s.ringEat = true; },
  },
  bonestorm: {
    name: 'Piercing Quills', from: 'quillpulse', rarity: 'rare', icon: ['spines', 'spike'],
    desc: 'More shards, and each one punches through two enemies.',
    apply(s) { s.ring += 4; s.ringPierce = 2; },
  },
  splitquills: {
    name: 'Splitting Quills', from: 'quillpulse', rarity: 'rare', icon: ['spines', 'mitosis'],
    desc: 'Every shard splits in two when it hits.',
    apply(s) { s.ringSplit = 2; },
  },

  chitin: {
    name: 'Chitin Shell', slot: 'BACK', rarity: 'uncommon', overlay: ['chitin'],
    desc: 'A shell that blocks one hit, then regrows. Regrows faster as it grows.',
    apply(s, l) { s.shieldCd = 14 - 3 * l; },
    onGain(p) { p.shieldUp = true; },
  },
  carapace: {
    name: 'Brood Shell', from: 'chitin', rarity: 'rare', overlay: ['eggs'], icon: ['chitin', 'eggsac'],
    desc: 'When your shell breaks, it splits open and spiderlings spill out of it.',
    short: 'When your shell breaks, spiderlings spill out.',
    apply(s) { s.shieldBrood = 2; },
  },
  thornplate: {
    name: 'Thorned Plate', from: 'carapace', rarity: 'rare', overlay: ['barbs'], icon: ['chitin', 'barbs'],
    desc: 'While your shell is up, anything that touches you is shredded.',
    short: 'While your shell is up, touching you shreds.',
    apply(s) { s.plateThorns = 4; },
  },
  reactive: {
    name: 'Reactive Plate', from: 'carapace', rarity: 'rare', icon: ['chitin', 'skull'],
    desc: 'When your shell breaks, it throws everything near you back.',
    short: 'When your shell breaks, it throws enemies back.',
    apply(s) { s.shieldBlast = true; },
  },
  molt: {
    name: 'Exoskeleton Molt', from: 'chitin', rarity: 'rare', overlay: ['moltshell'], icon: ['chitin', 'regrow'],
    desc: 'Once per room, shed your skin to ignore a hit, leaving a decoy husk.',
    short: 'Once a room, shed your skin to ignore a hit.',
    apply(s) { s.molt = true; },
  },
  huskbomb: {
    name: 'Husk Bomb', from: 'molt', rarity: 'rare', icon: ['chitin', 'toxic'],
    desc: 'Your shed husk bursts into bile when it falls apart.',
    apply(s) { s.huskBomb = true; },
  },
  endlessmolt: {
    name: 'Endless Molt', from: 'molt', rarity: 'rare', icon: ['chitin', 'secondheart'],
    desc: 'Your skin grows back loose: you can molt again after a while.',
    apply(s) { s.moltCd = 15; },
  },

  eggsac: {
    name: 'Egg Sac', slot: 'BACK', rarity: 'uncommon', overlay: ['eggs'],
    desc: 'When you are hurt, spiderlings hatch and fight for you.',
    apply(s, l) { s.eggsac = 1 + l; },
  },
  eggpods: {
    name: 'Egg Pods', from: 'eggsac', rarity: 'rare', overlay: ['pustules'], icon: ['spider', 'hemophage'],
    desc: 'Pustules cover your back. Anything that pops one burns, and a spiderling hatches.',
    short: 'Pustules that burn and hatch spiderlings when popped.',
    apply(s, l) { s.pustules = 1 + 0.5 * l; s.eggPods = true; },
  },
  broodmother: {
    name: 'Broodmother', from: 'eggpods', rarity: 'rare', icon: ['spider', 'mitosis'],
    desc: 'Spiderlings hatch whenever you enter a room.',
    apply(s) { s.roomBrood = 2; },
  },
  venombrood: {
    name: 'Venom Brood', from: 'eggpods', rarity: 'rare', icon: ['spider', 'bile'],
    desc: 'Your spiderlings leave bile where they bite.',
    apply(s) { s.venomBrood = true; },
  },
  lure: {
    name: 'Bioluminescent Lure', from: 'eggsac', rarity: 'uncommon', overlay: ['lure'], icon: ['antennae', 'eyes'],
    desc: 'A glowing lure on your back draws enemies (and their aim) away from you.',
    short: 'A glowing lure draws enemies and their aim.',
    apply(s) { s.lure = true; },
  },
  angler: {
    name: 'Anglerfish', from: 'lure', rarity: 'rare', icon: ['mandibles', 'eyes'],
    desc: 'Anything that reaches the lure gets bitten.',
    apply(s) { s.lureBite = 2; },
  },
  toxic: {
    name: 'Toxic Blood', from: 'lure', rarity: 'uncommon',
    desc: 'When you bleed, your blood burns everything around you.',
    short: "When you bleed, your blood burns what's near.",
    apply(s, l) { s.toxicBlood += 2 + l; },
  },

  twitch: {
    name: 'Twitch Fibers', slot: 'BACK', rarity: 'common', overlay: ['twitch'],
    desc: 'Raw muscle along the spine. Move faster, attack faster, dash sooner.',
    short: 'Move, attack and dash faster.',
    apply(s, l) { s.speed += 10 * l; s.rateMul *= Math.pow(0.9, l); s.dashCd *= Math.pow(0.9, l); },
  },
  adrenal: {
    name: 'Adrenal Gland', from: 'twitch', rarity: 'common',
    desc: 'Longer invulnerability after a hit, plus a burst of speed.',
    short: 'Longer safety after a hit, and a burst of speed.',
    apply(s, l) { s.invuln += 0.25 * l; s.adrenal = Math.max(s.adrenal, 0.8 + 0.6 * l); },
  },
  fightflight: {
    name: 'Fight or Flight', from: 'adrenal', rarity: 'rare', icon: ['twitch', 'adrenal'],
    desc: 'Getting hurt slows the world around you for a moment.',
    apply(s) { s.bulletTime = 1.6; },
  },
  rage: {
    name: 'Blood Rage', from: 'adrenal', rarity: 'rare', icon: ['adrenal', 'overgrown'],
    desc: 'After being hurt you also attack twice as fast for a while.',
    apply(s) { s.adrenalRage = true; s.adrenal += 1; },
  },
  streamfibers: {
    name: 'Stream Fibers', from: 'twitch', rarity: 'uncommon', icon: ['twitch', 'bile'],
    desc: 'Your attack becomes a rapid, wild stream.',
    apply(s) { s.stream = true; },
  },
  jitter: {
    name: 'Jitter', from: 'streamfibers', rarity: 'rare', icon: ['twitch', 'wings'],
    desc: 'Dash sooner, and every dash reloads every weapon at once.',
    short: 'Dash sooner. Each dash reloads every weapon.',
    apply(s) { s.dashCd *= 0.7; s.dashReload = true; },
  },
  needles: {
    name: 'Needle Stream', from: 'streamfibers', rarity: 'rare', icon: ['twitch', 'spike'],
    desc: 'The stream punches through an enemy.',
    apply(s) { s.pierce += 1; },
  },


  // ================= LIMBS: how you move =================
  // Empty LIMBS = a slow, inching slug.
  spider: {
    name: 'Spider Legs', slot: 'LIMBS', rarity: 'common', overlay: ['spiderlegs'],
    desc: 'Eight skittering legs. Quick, responsive movement. Right-click: spit a web that sticks enemies in place.',
    short: 'Quick legs. Right-click: spit a sticky web.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 76 + 8 * l); s.limbActive = { kind: 'web', l }; },
  },
  huntsman: {
    name: 'Huntsman', from: 'spider', rarity: 'legendary', overlay: ['hindlegs'], icon: ['spider', 'hindlegs'],
    desc: 'Your dash is a pounce: it bends toward prey in the direction you leap (never a boss), and lands with a shockwave.',
    short: 'Your dash bends toward prey ahead, and lands hard.',
    apply(s, l) { MUTATIONS.hindlegs.apply(s, l); s.hop = 0; s.homingPounce = true; },
  },
  trapdoor: {
    name: 'Scent Glands', from: 'huntsman', rarity: 'rare', icon: ['hindlegs', 'eyes'],
    desc: 'Your pounce marks what it lands on with your scent: it takes more damage from everything.',
    short: 'Your pounce marks what it lands on.',
    apply(s) { onHit(s, 'slam', 'mark', { t: 5, mul: 0.4 }); },
  },
  mantis: {
    name: 'Mantis Scythes', from: 'huntsman', rarity: 'uncommon', overlay: ['scythes'], icon: ['spider', 'horns'],
    desc: 'Your pounce slices everything it passes through.',
    apply(s, l) { s.dashDmg += 3 + 2 * l; onHit(s, 'dash', 'bleed', { t: 3, dps: 1.5 * l }, {}, 'add'); s.dashTime += 0.04; },
  },
  centipede: {
    name: 'Centipede Body', from: 'spider', rarity: 'rare', overlay: ['centlegs'], icon: ['spider', 'chitin'],
    desc: 'Faster. Your body trails behind as a segmented chain that blocks enemy shots.',
    short: 'Faster, with a trailing chain that blocks shots.',
    apply(s, l) { s.speed = Math.max(s.speed, 106 + 6 * l); s.centipede = 3 + l; },
  },
  spinedsegs: {
    name: 'Spined Segments', from: 'centipede', rarity: 'rare', icon: ['spider', 'spines'],
    desc: 'Every shot your segments block bursts into a ring of shards.',
    short: 'Shots your segments block burst into shards.',
    apply(s) { s.spinedSegments = true; },
  },
  biters: {
    name: 'Biting Segments', from: 'centipede', rarity: 'rare', icon: ['spider', 'mandibles'],
    desc: 'More segments, and each one bites whatever touches it.',
    apply(s) { s.centipede += 2; s.segBite = 1.5; },
  },

  wings: {
    name: 'Wings', slot: 'LIMBS', rarity: 'uncommon', overlay: ['wings'],
    desc: 'Fast but floaty flight. Drift over crates and tanks. Right-click: a wing beat that blows enemies and their shots away.',
    short: 'Fly over cover. Right-click: a gust.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 112 + 10 * l); s.limbActive = { kind: 'gust', l }; s.accel = s.accel || 330 + 30 * l; s.drag = s.drag || 1.5; s.flyover = true; s.dashTime += 0.05; },
  },
  carrionfly: {
    name: 'Carrion Fly', from: 'wings', rarity: 'rare', icon: ['spider', 'wings'],
    desc: 'Fly with control, trailed by a swarm of flies that bite anything near you.',
    short: 'Fly with control, wrapped in biting flies.',
    apply(s) { s.accel = 1100; s.drag = 5; s.flySwarm = 1; },
  },
  cropduster: {
    name: 'Crop Duster', from: 'carrionfly', rarity: 'rare', overlay: ['sporepods'], icon: ['wings', 'mitosis'],
    desc: 'While you fly, you drop a trail of blinding spore clouds.',
    short: 'Flying drops a trail of blinding spores.',
    apply(s) { s.cropDuster = true; },
  },
  plague: {
    name: 'Plague Swarm', from: 'carrionfly', rarity: 'rare', icon: ['wings', 'hemophage'],
    desc: 'The swarm grows thick, and its bites bleed.',
    apply(s) { s.flySwarm = 2; },
  },
  locust: {
    name: 'Locust', from: 'wings', rarity: 'rare', overlay: ['hindlegs'], icon: ['hindlegs', 'wings'],
    desc: 'Fly freely, and your dash is a pounce from the air that lands with a shockwave.',
    short: 'Fly, and your dash is a pounce that lands hard.',
    apply(s, l) { MUTATIONS.hindlegs.apply(s, l); s.hop = 0; },
  },
  meteor: {
    name: 'Meteor', from: 'locust', rarity: 'rare', icon: ['hindlegs', 'skull'],
    desc: 'A far bigger, far harder shockwave.',
    apply(s) { s.slamDmg += 4; s.slamR += 16; },
  },
  pupa: {
    name: 'Pupa', from: 'locust', rarity: 'legendary', overlay: ['shell'], icon: ['wings', 'chitin'],
    desc: 'Hold still to close a cocoon around you: it blocks everything and slowly heals.',
    short: 'Hold still to cocoon: block everything and heal.',
    apply(s) { s.shell = true; s.pupa = true; },
  },

  grapple: {
    requires: { set: 'ABOMINATION', label: 'AN ABOMINATION PART' },
    name: 'Tentacles', slot: 'LIMBS', boss: true, rarity: 'rare', overlay: ['tentlimbs'],
    desc: 'Right-click (or E) to lash a tentacle at a wall or enemy and yank yourself to it.',
    short: 'Right-click: lash a tentacle and yank yourself.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 60); s.grapple = 1.0 - 0.15 * (l - 1); s.grappleRange = 110 + 15 * l; s.pullDmg += 2 + l; },
  },
  silktendril: {
    name: 'Silk Tendril', from: 'grapple', rarity: 'rare', icon: ['spider', 'grapple'],
    desc: 'Your tentacle webs every enemy it crosses, sticking them in place.',
    short: 'Your tentacle webs every enemy it crosses.',
    apply(s) { s.webLine = true; },
  },
  bileline: {
    name: 'Bile Line', from: 'silktendril', rarity: 'rare', icon: ['grapple', 'bile'],
    desc: 'Your tentacle leaves a line of burning bile along its whole length.',
    short: 'Your tentacle leaves a line of burning bile.',
    apply(s) { s.bileLine = true; },
  },
  shredpull: {
    name: 'Shredding Pull', from: 'silktendril', rarity: 'rare', icon: ['grapple', 'barbs'],
    desc: 'Grapple twice as often, and shred anything you are dragged through.',
    short: 'Grapple twice as often, shredding what you pass.',
    apply(s) { s.grapple *= 0.5; s.pullThrough = true; },
  },
  hands: {
    name: 'Grasping Hands', from: 'grapple', rarity: 'rare', overlay: ['hands'], icon: ['grapple', 'mandibles'],
    desc: 'Right-click (or E) to grab a corpse or small enemy, and again to throw it.',
    short: 'Right-click: grab a corpse or enemy, then throw it.',
    apply(s, l) { s.hands = true; s.handDmg += 4 + 2 * l; },
  },
  puppeteer: {
    name: 'Puppeteer', from: 'hands', rarity: 'legendary', icon: ['grapple', 'parasite'],
    desc: 'Your tentacle drags enemies to YOU, straight into your hands.',
    short: 'Your tentacle drags enemies to your hands.',
    apply(s) { s.puppeteer = true; },
  },
  bilebomb: {
    name: 'Bile Bomb', from: 'hands', rarity: 'rare', icon: ['grapple', 'toxic'],
    desc: 'Whatever you throw explodes in burning bile.',
    apply(s) { s.bileBomb = true; },
  },

  burrow: {
    requires: { any: ['skull'], label: 'BATTERING SKULL' },
    name: 'Burrowing Claws', slot: 'LIMBS', rarity: 'rare', overlay: ['claws'], icon: ['spider', 'skull'],
    desc: 'Dash dives underground. Untouchable while buried; erupt with damage. Right-click: a tremor that stuns everything near you.',
    short: 'Dash underground. Right-click: a tremor.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 64); s.limbActive = { kind: 'tremor', l }; s.burrow = Math.max(s.burrow, 0.5 + 0.1 * l); s.burrowDmg += 3 + l; },
  },
  moleworm: {
    name: 'Moleworm', from: 'burrow', rarity: 'rare', overlay: ['centlegs'], icon: ['spider', 'regrow'],
    desc: 'Tunnel longer, shredding everything you pass beneath.',
    apply(s) { s.moleworm = true; s.burrow += 0.25; },
  },
  eruption: {
    name: 'Eruption', from: 'moleworm', rarity: 'rare', icon: ['spines', 'skull'],
    desc: 'You erupt in a ring of bone shards.',
    apply(s) { s.eruptRing = 10; },
  },
  tunnelbrood: {
    name: 'Tunnel Brood', from: 'moleworm', rarity: 'rare', icon: ['spider', 'mitosis'],
    desc: 'Spiderlings crawl out of the ground with you.',
    apply(s) { s.eruptBrood = 2; },
  },
  razorclaws: {
    name: 'Razor Claws', from: 'burrow', rarity: 'uncommon', overlay: ['scythes'], icon: ['horns', 'skull'],
    desc: 'You erupt much harder, and leave everything bleeding.',
    apply(s) { s.burrowDmg *= 1.6; onHit(s, 'burrow', 'bleed', { t: 3, dps: 3 }); },
  },
  ambush: {
    name: 'Ambush', from: 'razorclaws', rarity: 'rare', icon: ['feral', 'skull'],
    desc: 'Your first attack after erupting deals triple damage.',
    apply(s) { s.ambush = true; },
  },
  quake: {
    name: 'Quake', from: 'razorclaws', rarity: 'rare', icon: ['echo', 'skull'],
    desc: 'Erupting stuns everything nearby.',
    apply(s) { s.eruptStun = 1.2; },
  },

  fins: {
    name: 'Pseudopods', slot: 'LIMBS', rarity: 'common', overlay: ['fins'], icon: ['regrow', 'bile'],
    desc: 'Slide fast through your own slime and bile; sluggish everywhere else. Right-click: roll out a wave of slime to ride.',
    short: 'Slide fast through slime. Right-click: ride a wave.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 52); s.limbActive = { kind: 'slimewave', l }; s.fins = 118 + 12 * l; },
  },
  slimeglands: {
    name: 'Slime Glands', from: 'fins', rarity: 'uncommon', icon: ['bile', 'regrow'],
    desc: 'Enemies that cross your slime get stuck in it.',
    apply(s) { s.slimeSlow = 0.45; },
  },
  acidslime: {
    name: 'Acid Slime', from: 'slimeglands', rarity: 'rare', icon: ['toxic', 'bile'],
    desc: 'Your slime burns whatever crawls through it.',
    apply(s) { s.slimeBurn = 1.5; },
  },
  slipstream: {
    name: 'Slipstream', from: 'slimeglands', rarity: 'rare', icon: ['bile', 'twitch'],
    desc: 'On your own slime, you attack much faster.',
    apply(s) { s.slimeRate = 0.6; },
  },
  cilia: {
    name: 'Cilia', from: 'fins', rarity: 'common', overlay: ['cilia'], icon: ['regrow', 'twitch'],
    desc: 'Thousands of tiny hairs: a smooth, constant glide, and you attack faster.',
    short: 'A smooth, constant glide, and faster attacks.',
    apply(s, l) { s.speed = Math.max(s.speed, 78 + 6 * l); s.accel = s.accel || 640; s.drag = s.drag || 4.2; s.rateMul *= 0.92; },
  },
  stilts: {
    name: 'Bone Stilts', from: 'cilia', rarity: 'uncommon', icon: ['spike', 'spider'],
    desc: 'Stride over enemy acid untouched, and shoot over cover.',
    apply(s, l) { s.speed = Math.max(s.speed, 66 + 6 * l); s.stilts = true; s.accel = 0; },
  },
  shell: {
    name: 'Snail Shell', from: 'cilia', rarity: 'uncommon', malignant: true, overlay: ['shell'], icon: ['chitin', 'regrow'],
    desc: 'Hold still to withdraw into your shell and block everything.',
    short: 'Hold still to withdraw and block everything.',
    cost: 'Painfully slow.',
    costShort: 'You will be so slow.', // the card's line (vague); hovering shows the exact cost
    apply(s) { s.shell = true; s.speedMul *= 0.6; },
  },
  // Not offered on its own: Huntsman and Locust grow it.
  hindlegs: {
    name: 'Hind Legs', slot: 'LIMBS', part: true, rarity: 'uncommon', overlay: ['hindlegs'],
    desc: 'Move in powerful hops. Your dash is a pounce that lands with a shockwave.',
    apply(s, l) {
      s.slug = false; s.speed = Math.max(s.speed, 150); s.hop = s.hop || 0.5 - 0.05 * l;
      s.dashTime += 0.08; s.slamDmg += 2 + l; s.slamR = Math.max(s.slamR, 24 + 4 * l);
    },
  },


  // ================= CORE =================
  hide: {
    name: 'Thick Hide', slot: 'CORE', rarity: 'common',
    desc: '+1 max health per growth, and heal 1.',
    short: 'Thicker skin: more health as it grows.',
    apply(s, l) { s.maxHp += l; },
    onGain(p) { p.hp += 1; },
  },
  calcified: {
    name: 'Calcified Organs', from: 'hide', rarity: 'common', overlay: ['calcified'], icon: ['hide', 'spike'],
    desc: 'Your organs harden: you start every floor with a grey armor heart (up to 2).',
    short: 'Start every floor with an armor heart.',
    apply(s) { s.calcified = true; },
    onGain(p) { p.armor = Math.max(p.armor || 0, 1); },
  },
  bonecage: {
    name: 'Bone Cage', from: 'calcified', rarity: 'rare', icon: ['hide', 'chitin'],
    desc: 'Every third hit glances off your bones.',
    apply(s) { s.hitIgnore = 3; },
  },
  secondheart: {
    name: 'Second Heart', from: 'calcified', rarity: 'legendary', overlay: ['heart2'],
    desc: 'The first time you die, you are reborn: pure, limbless, with 3 HP.',
    short: 'The first time you die, you are reborn.',
    apply(s) { s.secondHeart = true; },
  },
  regrow: {
    name: 'Regrowth', from: 'hide', rarity: 'uncommon',
    desc: 'Slowly regrow lost flesh.',
    apply(s, l) { s.regen = 40 - 8 * l; },
  },
  hemophage: {
    name: 'Hemophage', from: 'regrow', rarity: 'rare', overlay: ['drool'],
    desc: 'Bursting corpses can heal you.',
    apply(s, l) { s.hemophage += 0.15 * l; },
  },
  mending: {
    name: 'Rapid Mending', from: 'regrow', rarity: 'rare', icon: ['regrow', 'twitch'],
    desc: 'You regrow twice as fast.',
    apply(s) { s.regen *= 0.5; },
  },

  marrow: {
    name: 'Dense Marrow', slot: 'CORE', rarity: 'common',
    desc: 'Heavier bones. Every hit or shot you block feeds them: more damage with everything for a few seconds (it stacks).',
    short: 'Blocking a hit feeds your bones: more damage.',
    apply(s, l) { s.damageMul *= 1 + 0.05 * l; s.marrowFeed = 0.06 + 0.02 * l; },
  },
  loaded: {
    name: 'Loaded Marrow', from: 'marrow', rarity: 'uncommon', icon: ['marrow', 'spike'],
    desc: 'Hold fire to charge, release to unleash everything at once as a blast.',
    short: 'Hold to charge, release everything in one blast.',
    apply(s) { s.charge = true; },
  },
  overcharge: {
    name: 'Overcharge', from: 'loaded', rarity: 'rare', icon: ['marrow', 'spines'],
    desc: 'A full charge also bursts a ring of bone shards out of you.',
    apply(s) { s.chargeRing = 12; },
  },
  pressure: {
    name: 'Pressure Marrow', from: 'loaded', rarity: 'rare', icon: ['marrow', 'chitin'],
    desc: 'Holding a charge braces you: the first hit while you hold it is blocked, and the charge is spent.',
    short: 'Holding a charge blocks the first hit.',
    apply(s) { s.chargeGuard = true; },
  },
  overgrown: {
    name: 'Overgrown Heart', from: 'marrow', rarity: 'uncommon', malignant: true, overlay: ['bigheart'],
    desc: 'Double damage from every source. Your heart swells, and you swell with it: bigger, stronger, easier to hit.',
    short: 'Double damage, both ways. You swell bigger.',
    cost: 'Max health halved.',
    costShort: 'Your heart cannot take much.', // the card's line (vague); hovering shows the exact cost
    apply(s) { s.damageMul *= 2; s.hpMul *= 0.5; s.bulk += 1; },
  },
  titanheart: {
    name: 'Titan Heart', from: 'overgrown', rarity: 'legendary', cures: true, icon: ['overgrown', 'hide'],
    desc: 'CURED. Keep double damage, and +25% max health instead of half.',
    short: 'CURED. Double damage, and more health.',
    apply(s) { s.hpMul *= 2.5; },
  },
  hollow: {
    name: 'Hollow Body', from: 'overgrown', rarity: 'uncommon', malignant: true, overlay: ['hollow'], icon: ['overgrown', 'starving'],
    desc: 'Much faster, and you attack faster.',
    cost: 'Every hit costs 2 health.',
    costShort: 'Every wound cuts deeper.', // the card's line (vague); hovering shows the exact cost
    apply(s) { s.speedMul *= 1.35; s.rateMul *= 0.85; s.hitCost = 2; },
  },

  mitosis: {
    requires: { set: 'ABOMINATION', label: 'AN ABOMINATION PART' },
    name: 'Mitosis', slot: 'CORE', rarity: 'rare', overlay: ['mitosis'],
    desc: 'Anything you hit bursts into fragments of you, shot or bite.',
    short: 'Anything you hit bursts into fragments of you.',
    apply(s, l) { s.split += 1 + l; },
  },
  brood: {
    name: 'Brood Chamber', from: 'mitosis', rarity: 'uncommon', overlay: ['brood'], icon: ['mitosis', 'hemophage'],
    desc: 'Burst corpses sometimes birth a friendly maggot as well.',
    short: 'Corpses sometimes birth a maggot too.',
    apply(s, l) { s.brood = 0.2 + 0.1 * l; },
  },
  clutch: {
    name: 'Clutch', from: 'brood', rarity: 'rare', icon: ['mitosis', 'spider'],
    desc: 'Anything your fragments kill hatches a maggot.',
    apply(s) { s.clutch = true; },
  },
  maggotburst: {
    name: 'Rupturing Maggots', from: 'brood', rarity: 'rare', icon: ['mitosis', 'bile'],
    desc: 'Your maggots burst into burning bile when they die.',
    apply(s) { s.maggotBurst = true; },
  },
  twin: {
    name: 'Twin Embryo', from: 'mitosis', rarity: 'rare', malignant: true, icon: ['mitosis', 'hide'],
    desc: 'A tiny twin follows you and copies your attacks.',
    cost: 'If it dies, you lose 1 max health.',
    costShort: 'If it dies, part of you dies with it.', // the card's line (vague); hovering shows the exact cost
    apply(s, l, p) { s.twin = true; s.maxHp -= (p && p.twinLost) || 0; },
  },
  bondedtwin: {
    name: 'Bonded Twin', from: 'twin', rarity: 'rare', cures: true, icon: ['mitosis', 'secondheart'],
    desc: 'CURED. Losing your twin no longer costs you anything.',
    apply(s, l, p) { s.maxHp += (p && p.twinLost) || 0; },
  },
  mirrortwin: {
    name: 'Mirror Twin', from: 'twin', rarity: 'rare', icon: ['mitosis', 'eyes'],
    desc: 'Your twin copies you at full strength.',
    apply(s) { s.twinMul = 1.6; },
  },

  starving: {
    name: 'Starving Cells', slot: 'CORE', rarity: 'uncommon', malignant: true, overlay: ['ribs'],
    desc: 'Corpses give double biomass.',
    cost: 'Go 30s without bursting a corpse and you starve, losing health (never fatal).',
    costShort: 'You must consume... or suffer.', // the card's line (vague); hovering shows the exact cost
    apply(s) { s.dnaMul *= 2; s.starve = 30; },
  },
  apexpredator: {
    name: 'Apex Predator', from: 'starving', rarity: 'legendary', cures: true, icon: ['starving', 'hemophage'],
    desc: 'CURED. Keep double biomass. You never starve, and bursts can heal you.',
    short: 'CURED. Never starve, and bursts heal you.',
    apply(s) { s.starve = 0; s.hemophage += 0.3; },
  },
  bacteria: {
    name: 'Gut Bacteria', from: 'apexpredator', rarity: 'common', icon: ['starving', 'mitosis'],
    desc: 'Even more biomass per corpse, but corpses take longer to burst.',
    short: 'More biomass per corpse; bursting is slower.',
    apply(s) { s.bacteria += 2; },
  },
  feedfrenzy: {
    name: 'Feeding Frenzy', from: 'apexpredator', rarity: 'rare', icon: ['starving', 'feral'],
    desc: 'Bursting a corpse sends you into a frenzy: +40% damage for a few seconds.',
    short: 'Bursting a corpse sends you into a frenzy.',
    apply(s) { s.feedFrenzy = 0.4; },
  },
  cancer: {
    name: 'Cancerous Growth', from: 'starving', rarity: 'rare', malignant: true, overlay: ['tumor'],
    desc: '+10% damage for every room you clear, forever. The tumor swells as it grows: every 6 rooms you get bigger (and easier to hit).',
    short: 'Stronger with every room. The tumor makes you bigger.',
    cost: 'Every 3rd room cleared, it takes 1 max health.',
    costShort: 'It feeds on you.', // the card's line (vague); hovering shows the exact cost
    apply(s, l, p) {
      const rooms = (p && p.cancerRooms) || 0;
      s.damageMul *= 1 + (s.cancerRate || 0.1) * rooms;
      s.maxHp -= Math.floor(rooms / 3);
      s.bulk += Math.min(2, Math.floor(rooms / 6)); // the tumor swells as it grows
    },
  },
  benignmass: {
    name: 'Benign Mass', from: 'cancer', rarity: 'legendary', cures: true, icon: ['cancer', 'regrow'],
    desc: 'CURED. The growth keeps making you stronger, but no longer costs health.',
    short: 'CURED. The growth keeps strengthening you, free.',
    apply(s, l, p) { s.maxHp += Math.floor(((p && p.cancerRooms) || 0) / 3); },
  },
  metastasis: {
    name: 'Metastasis', from: 'cancer', rarity: 'rare', malignant: true, icon: ['cancer', 'mitosis'],
    desc: 'The growth spreads faster: +20% damage per room instead.',
    short: 'The growth spreads faster: more damage per room.',
    cost: 'It still takes 1 max health every 3rd room.',
    costShort: 'It still feeds on you.', // the card's line (vague); hovering shows the exact cost
    apply(s, l, p) { const rooms = (p && p.cancerRooms) || 0; s.damageMul *= (1 + 0.2 * rooms) / (1 + 0.1 * rooms); },
  },

  // --- Bone Plates: armor you can see, and it fights back ---
  boneplates: {
    name: 'Bone Plates', slot: 'CORE', rarity: 'uncommon', icon: ['marrow', 'chitin'],
    desc: 'Bone plates orbit you and block enemy shots. A plate that breaks bursts into shrapnel. They all regrow in every new room.',
    apply(s, l) { s.plates = Math.max(s.plates || 0, 2 + l); s.plateShards = Math.max(s.plateShards || 0, 4); },
  },
  razorplates: {
    name: 'Razor Plates', from: 'boneplates', rarity: 'uncommon', icon: ['marrow', 'horns'],
    desc: 'The plates have edges: they cut whatever they pass through.',
    short: 'Your plates cut whatever they pass through.',
    apply(s, l) { s.plateDmg = 1.5 + 0.5 * l; },
  },
  bladestorm: {
    name: 'Bladestorm', from: 'razorplates', rarity: 'rare', icon: ['marrow', 'spines'],
    desc: 'Every few seconds in a fight, a plate flings itself at the nearest enemy and swings back.',
    short: 'Your plates fling themselves at enemies.',
    apply(s) { s.plateFling = 2.2; },
  },
  bonemill: {
    name: 'Bone Mill', from: 'razorplates', rarity: 'rare', icon: ['marrow', 'mitosis'],
    desc: 'Whatever the plates kill bursts into bone shards.',
    apply(s) { s.plateMill = 5; },
  },
  mirrorplates: {
    name: 'Mirror Plates', from: 'boneplates', rarity: 'uncommon', icon: ['marrow', 'eyes'],
    desc: 'Your plates glaze over like glass: a shot that hits one is thrown back, twice as hard. Broken plates regrow even in the middle of a fight.',
    short: 'Plates throw shots back, and regrow mid-fight.',
    apply(s, l) { s.plateMirror = { mul: 2 }; s.plateRegrow = 7 - l; },
  },
  prism: {
    name: 'Prism', from: 'mirrorplates', rarity: 'rare', icon: ['abyssal', 'mitosis'],
    desc: 'Every shot your plates throw back splits into three, and they hunt for prey.',
    short: 'Thrown-back shots split in three and seek.',
    apply(s) { s.plateMirror.split = true; s.plateMirror.homing = 3; },
  },
  feedingglass: {
    name: 'Feeding Glass', from: 'mirrorplates', rarity: 'rare', icon: ['eyes', 'hemophage'],
    desc: 'Every 6th shot your plates throw back heals you, and thrown-back shots hit twice as hard again.',
    short: 'Thrown-back shots sometimes heal you.',
    apply(s) { s.plateMirror.heal = 6; s.plateMirror.mul *= 2; },
  },

  // ================= NEW STARTING MOUTHS =================
  barbs: {
    name: 'Barb Flinger', slot: 'MOUTH', rarity: 'common', icon: ['spike', 'barbs'],
    desc: 'Fling barbed hooks that stick in what they hit, then rip out a moment later for more damage.',
    short: 'Hooks that stick, then rip out for more damage.',
    apply(s, l) { gun(s, { id: 'barbs', dmg: 0.8 + 0.25 * l, delay: 0.7, speed: 150, r: 2, barb: 1.6 + 0.6 * l, color: '#d8ccb0', sound: 'spine' }); },
  },
  fishhook: {
    name: 'Fishhooks', from: 'barbs', rarity: 'uncommon', icon: ['barbs', 'grapple'],
    desc: 'When the barbs rip out, they drag their victim toward you.',
    apply(s) { s.barbPull = true; },
  },
  chainhook: {
    name: 'Chain Hooks', from: 'fishhook', rarity: 'rare', icon: ['barbs', 'tentacles'],
    desc: 'A barb that rips out flies on into the next enemy.',
    apply(s) { s.barbChain = true; },
  },
  guthook: {
    name: 'Gut Hooks', from: 'fishhook', rarity: 'rare', icon: ['barbs', 'hemophage'],
    desc: 'Ripped-out barbs leave their victims bleeding badly.',
    apply(s) { onHit(s, 'barb', 'bleed', { t: 3, dps: 3 }); },
  },
  barbvolley: {
    name: 'Barb Volley', from: 'barbs', rarity: 'uncommon', icon: ['barbs', 'spines'],
    desc: 'Fling three barbs at once. Barbs stuck in the same enemy rip out together, each one harder.',
    apply(s) { const g = s.guns.find(g => g.id === 'barbs'); if (g) { g.count = 3; g.spread = 0.12; } s.barbBundle = 0.25; },
  },
  thornstorm: {
    name: 'Thorn Burst', from: 'barbvolley', rarity: 'rare', icon: ['barbs', 'spines'],
    desc: 'Barbs that rip out burst into bone shards.',
    apply(s) { s.barbBurst = 3; },
  },
  seekbarbs: {
    name: 'Seeking Barbs', from: 'barbvolley', rarity: 'rare', icon: ['barbs', 'eyes'],
    desc: 'Your barbs curve toward prey.',
    apply(s) { s.homing += 3; },
  },

  sneeze: {
    name: 'Spore Sneeze', slot: 'MOUTH', rarity: 'common', icon: ['membrane', 'toxic'],
    desc: 'A short, wide sneeze of spores. Whatever it hits is blinded for a moment.',
    apply(s, l) { gun(s, { id: 'sneeze', dmg: 0.45 + 0.15 * l, delay: 0.6, speed: 115, range: 0.34, count: 5, spread: 0.32, r: 1.5, blind: 1.1 + 0.2 * l, round: true, fade: true, color: '#c4cca4', sound: 'spray' }); },
  },
  allergen: {
    name: 'Allergen', from: 'sneeze', rarity: 'uncommon', icon: ['toxic', 'eyes'],
    desc: 'Blinded enemies take more damage from everything.',
    apply(s) { s.allergen = 0.4; },
  },
  hives: {
    name: 'Hives', from: 'allergen', rarity: 'rare', icon: ['toxic', 'mitosis'],
    desc: 'Whatever dies blinded bursts into a spore cloud.',
    apply(s) { s.hivesCloud = true; },
  },
  histamine: {
    name: 'Histamine', from: 'allergen', rarity: 'rare', icon: ['toxic', 'slime'],
    desc: 'Your sneezes also slow what they hit to a crawl.',
    apply(s) { const g = s.guns.find(g => g.id === 'sneeze'); if (g) g.slow = 1.4; },
  },
  sneezefit: {
    name: 'Sneezing Fit', from: 'sneeze', rarity: 'uncommon', icon: ['membrane', 'twitch'],
    desc: 'Sneeze twice as often, wider.',
    apply(s) { const g = s.guns.find(g => g.id === 'sneeze'); if (g) { g.delay *= 0.55; g.spread += 0.1; } },
  },
  pollenstorm: {
    name: 'Pollen Storm', from: 'sneezefit', rarity: 'rare', icon: ['membrane', 'bloom'],
    desc: 'Your sneezes pollinate what they hit: it takes more damage.',
    short: 'Sneezes pollinate: what they hit takes more.',
    apply(s) { const g = s.guns.find(g => g.id === 'sneeze'); if (g) g.pollen = true; if (!s.pollen) s.pollen = { r: 0, every: 99 }; },
  },
  mucus: {
    name: 'Mucus', from: 'sneezefit', rarity: 'rare', icon: ['membrane', 'bile'],
    desc: 'Your sneezes are thick with mucus: they leave a sticky smear on the floor that slows whatever crawls through it (it is slime, so it works with Pseudopods).',
    short: 'Sneezes leave sticky mucus that slows.',
    apply(s) { const g = s.guns.find(g => g.id === 'sneeze'); if (g) g.mucus = true; },
  },

  leechspit: {
    name: 'Leech Spitter', slot: 'MOUTH', rarity: 'uncommon', icon: ['proboscis', 'hemophage'],
    desc: 'Spit leeches that latch on and bleed their victims. Bled-out kills sometimes heal you.',
    apply(s, l) { gun(s, { id: 'leech', dmg: 0.6 + 0.2 * l, delay: 0.65, speed: 130, r: 2, bleed: 1 + 0.4 * l, round: true, color: '#5e2229', sound: 'splat' }); s.leechFeed = Math.max(s.leechFeed || 0, 0.08); },
  },
  fatleech: {
    name: 'Fat Leeches', from: 'leechspit', rarity: 'uncommon', icon: ['hemophage', 'overgrown'],
    desc: 'Swollen leeches: they bleed their victims much harder.',
    apply(s) { const g = s.guns.find(g => g.id === 'leech'); if (g) g.bleed *= 1.6; },
  },
  leechswarm: {
    name: 'Leech Swarm', from: 'fatleech', rarity: 'rare', icon: ['hemophage', 'eggsac'],
    desc: 'Whatever bleeds to death releases maggots that fight for you.',
    short: 'What bleeds to death releases fighting maggots.',
    apply(s) { s.leechBrood = 2; },
  },
  bloodpact: {
    name: 'Blood Pact', from: 'fatleech', rarity: 'rare', icon: ['hemophage', 'secondheart'],
    desc: 'Bled-out kills heal you far more often.',
    apply(s) { s.leechFeed = 0.25; },
  },
  leechspray: {
    name: 'Leech Spray', from: 'leechspit', rarity: 'uncommon', icon: ['proboscis', 'spines'],
    desc: 'Spit three smaller leeches at once.',
    apply(s) { const g = s.guns.find(g => g.id === 'leech'); if (g) { g.count = 3; g.spread = 0.2; g.dmg *= 0.7; } },
  },
  anticoag: {
    name: 'Anticoagulant', from: 'leechspray', rarity: 'rare', icon: ['hemophage', 'toxic'],
    desc: 'Bleeding enemies take more damage from everything.',
    apply(s) { s.anticoag = 0.3; },
  },
  hungryleech: {
    name: 'Hungry Leeches', from: 'leechspray', rarity: 'rare', icon: ['hemophage', 'eyes'],
    desc: 'Your leeches seek out prey.',
    apply(s) { s.homing += 3; },
  },

  // ================= NEW STARTING LIMBS =================
  crablegs: {
    name: 'Crab Legs', slot: 'LIMBS', rarity: 'common', icon: ['spider', 'chitin'],
    desc: 'Quick, armored legs. Right-click: snap a pincer shut on whatever is in front of you.',
    short: 'Quick, armored legs. Right-click: snap a pincer.',
    apply(s, l) { s.slug = false; s.speed = Math.max(s.speed, 80 + 6 * l); s.limbActive = { kind: 'pincer', l }; },
  },
  carapacelegs: {
    name: 'Shell Claw', from: 'crablegs', rarity: 'uncommon', icon: ['chitin', 'hide'],
    desc: 'Your pincer is a shield too: snapping it shatters the enemy shots in front of you.',
    short: 'Snapping your pincer shatters shots ahead.',
    apply(s) { s.shellClaw = true; },
  },
  kingcrab: {
    name: 'King Crab', from: 'carapacelegs', rarity: 'rare', icon: ['chitin', 'horns'],
    desc: 'A huge pincer: it crushes everything in front of you, harder.',
    apply(s) { s.pincerWide = true; s.pincerMul = 1.5; },
  },
  boxercrab: {
    name: 'Pistol Shrimp', from: 'carapacelegs', rarity: 'rare', icon: ['chitin', 'slam'],
    desc: 'The pincer snaps so hard it fires a shockwave forward.',
    apply(s) { s.pincerShock = true; },
  },
  scuttle: {
    name: 'Scuttle', from: 'crablegs', rarity: 'uncommon', icon: ['spider', 'spines'],
    desc: 'Every dash leaves a bone spike behind. It cuts what steps on it and stops enemy shots.',
    apply(s) { s.dashSpike = true; },
  },
  sidestep: {
    name: 'Sidestep', from: 'scuttle', rarity: 'rare', icon: ['spider', 'membrane'],
    desc: 'Dashing through enemy shots destroys them.',
    apply(s) { s.dashEat = true; },
  },
  coconutcrab: {
    name: 'Coconut Crab', from: 'scuttle', rarity: 'rare', icon: ['chitin', 'adrenal'],
    desc: 'A pincer kill refreshes the pincer and your dash.',
    apply(s) { s.pincerReset = true; },
  },

  haunches: {
    name: 'Haunches', slot: 'LIMBS', rarity: 'uncommon', icon: ['hindlegs', 'feral'],
    desc: 'Powerful hopping legs; your dash is a pounce. Right-click: leap to where you point and land with a shockwave.',
    apply(s, l) { MUTATIONS.hindlegs.apply(s, l); s.limbActive = { kind: 'leap', l }; },
  },
  pouncer: {
    name: 'Pouncer', from: 'haunches', rarity: 'uncommon', icon: ['hindlegs', 'slam'],
    desc: 'You land harder, and the shockwave stuns.',
    apply(s) { s.slamDmg += 2; onHit(s, 'slam', 'stun', { t: 0.8 }); },
  },
  gorepounce: {
    name: 'Gore Pounce', from: 'pouncer', rarity: 'rare', icon: ['hindlegs', 'hemophage'],
    desc: 'Everything you land on bleeds.',
    apply(s) { onHit(s, 'slam', 'bleed', { t: 3, dps: 3 }); },
  },
  killerleap: {
    name: 'Killing Leap', from: 'pouncer', rarity: 'rare', icon: ['hindlegs', 'adrenal'],
    desc: 'A landing that kills lets you leap again at once.',
    apply(s) { s.leapReset = true; },
  },
  longstride: {
    name: 'Long Stride', from: 'haunches', rarity: 'uncommon', icon: ['hindlegs', 'wings'],
    desc: 'No more hopping: a fast, smooth run, and your leap reaches much further.',
    short: 'A fast, smooth run, and a much longer leap.',
    apply(s) { s.hop = 0; s.speed = Math.max(s.speed, 118); s.leapRange = 125; },
  },
  sprinter: {
    name: 'Sprinter', from: 'longstride', rarity: 'rare', icon: ['hindlegs', 'twitch'],
    desc: 'Faster still, and your dash recovers quicker.',
    apply(s) { s.speed += 20; s.dashCd *= 0.8; },
  },
  antelope: {
    name: 'Antelope', from: 'longstride', rarity: 'rare', icon: ['hindlegs', 'membrane'],
    desc: 'Nothing can touch you for the whole leap, and a moment after.',
    apply(s) { s.leapInv = true; },
  },

  // ================= ONE-EVOLUTION PARTS =================
  // Parts that evolve once, fully grown (graft): no fork, just one end form.
  // They level like any part, and at full growth each evolves once.
  ratincisors: {
    name: 'Rat Incisors', slot: 'MOUTH', graft: 'rat', rarity: 'uncommon', icon: ['mandibles', 'hemophage'],
    desc: 'Gnawing teeth: quick little bites that leave whatever you bite bleeding.',
    short: 'Quick bites that leave prey bleeding.',
    apply(s, l) { s.bite = true; s.biteDmg += 1 + 0.5 * l; s.biteDelay = Math.min(s.biteDelay, 0.24); onHit(s, 'melee', 'bleed', { t: 3, dps: 2 }); },
  },
  urchinquills: {
    name: 'Urchin Quills', slot: 'BACK', graft: 'urchin', rarity: 'uncommon', icon: ['spines', 'barbs'],
    desc: 'In a fight, your quills fire a ring of spines every couple of seconds on their own.',
    short: 'In a fight, your quills fire spine rings.',
    apply(s, l) { s.quillPulse = Math.min(s.quillPulse || 99, 2.6 - 0.2 * l); s.quillCount = Math.max(s.quillCount || 0, 6); },
  },
  toadgullet: {
    name: 'Toad Gullet', slot: 'MOUTH', graft: 'spitter', rarity: 'uncommon', icon: ['bile', 'toxic'],
    desc: 'Lob globs of bile that burst into burning puddles.',
    apply(s, l) { gun(s, { id: 'toad', dmg: 1.8 + 0.4 * l, delay: 1.1, lob: true, acid: 12, r: 3, round: true, color: '#8a9a30', sound: 'splat' }); },
  },
  splittercells: {
    name: 'Splitter Cells', slot: 'CORE', graft: 'splitter', rarity: 'uncommon', icon: ['mitosis', 'regrow'],
    desc: 'When you are hurt, pieces of you split off and fight for you.',
    short: 'When hurt, pieces of you split off and fight.',
    apply(s, l) { s.hurtBrood = 1 + (l >= 2 ? 1 : 0); },
  },
  culturejelly: {
    name: 'Culture Jelly', slot: 'BACK', graft: 'culture', rarity: 'uncommon', icon: ['regrow', 'bile'],
    desc: 'Where your dash ends, a sticky jelly bursts out and holds everything near.',
    short: 'Your dash ends in a burst of sticky jelly.',
    apply(s, l) { s.dashJelly = 1.2 + 0.2 * l; },
  },
  // ...and what each becomes, fully grown.
  plagueteeth: {
    name: 'Plague Teeth', from: 'ratincisors', rarity: 'rare', icon: ['hemophage', 'toxic'],
    desc: 'Faster bites, and biting something that bleeds spreads its bleeding to everything near it.',
    short: 'Faster bites. Bleeding spreads when you bite.',
    apply(s) { s.biteDelay *= 0.8; s.plagueTeeth = true; },
  },
  pincushion: {
    name: 'Pincushion', from: 'urchinquills', rarity: 'rare', icon: ['barbs', 'spines'],
    desc: 'A thicker ring of quills, and they also fire every time you are hurt.',
    short: "More quills, and they fire when you're hurt.",
    apply(s) { s.quillCount = Math.max(s.quillCount || 0, 10); s.quillOnHurt = true; },
  },
  bullfrog: {
    name: 'Bullfrog', from: 'toadgullet', rarity: 'rare', icon: ['toxic', 'overgrown'],
    desc: 'Bigger, heavier globs that bounce once on landing, bursting twice.',
    short: 'Heavy globs that bounce once and burst twice.',
    apply(s) { const g = s.guns.find(x => x.id === 'toad'); if (g) { g.r = 4; g.dmg *= 1.3; g.acid = 16; g.bounce = 1; } },
  },
  mitosis2: {
    name: 'Runaway Mitosis', from: 'splittercells', rarity: 'rare', icon: ['mitosis', 'overgrown'],
    desc: 'More of you splits off when you are hurt, and in a fight a piece splits off on its own every few seconds.',
    short: 'More of you splits off, even on its own.',
    apply(s) { s.hurtBrood = (s.hurtBrood || 0) + 1; s.splitPulse = 7; },
  },
  digestjelly: {
    name: 'Digesting Jelly', from: 'culturejelly', rarity: 'rare', icon: ['bile', 'regrow'],
    desc: 'A wider jelly that digests what it holds: they bleed, and stay slowed after it lets go.',
    short: 'A wider jelly. What it holds bleeds and slows.',
    apply(s) { s.jellyR = 34; onHit(s, 'jelly', 'bleed', { t: 3, dps: 2.5 }); onHit(s, 'jelly', 'slow', { t: 2.5 }); },
  },
};


// WHISPERS: the cryptic line that appears when something new grows in you.
// Cards never explain mutations; these hint at what just changed.
const HINTS = {
  // What it feels like as each part grows in: pure body horror, no advice
  // (the card already says what it does). Second person, present tense.
  // MOUTH
  slime: 'Your mouth fills with something warm and slick. It does not taste like you.',
  spike: 'Bone pushes up behind your teeth, sharp, splitting the gum as it comes.',
  shotgun: 'The bone in your jaw cracks into a hundred pieces, and every piece stays sharp.',
  bonewall: 'Marrow floods the roof of your mouth. It sets hard as soon as it meets air.',
  shrapnel: 'You feel the splinters splinter again, grinding to grit between your teeth.',
  lance: 'The spike lengthens down your throat. You have to tilt your head back to make room.',
  splinter: 'Your spikes go brittle along a hundred hairline cracks. They ache to break.',
  venomspike: 'The bone in your mouth starts to sweat. It burns your tongue on the way out.',
  bile: 'Your stomach turns over and stays turned. Your throat blisters from the inside.',
  sporefire: 'Your lungs grow a soft grey fur. When you breathe out, it catches.',
  rotbloom: 'The spores in your chest start eating. You can feel them chewing.',
  bilemortar: 'Something burrows out of the shells after they land. It coughs, and keeps coughing.',
  acidmaw: 'Your pincers grow back wet. They hiss when they close.',
  vomit: 'Your stomach learns to clench at pain. It wants to throw everything back up, all at once.',
  meltbite: 'Your teeth go soft and acidic. They dissolve a little of everything they touch.',
  mandibles: 'Your jaw splits at the hinge. Two hooked pincers push out through the gums, clicking.',
  feral: 'Your spine bunches like a cat about to drop. The urge to leap does not go away.',
  apexjaws: 'A second row of teeth grows in behind the first, and the first refuses to fall out.',
  rending: 'Your teeth grow serrated. You can feel the ridges with your tongue.',
  mawtendrils: 'Your throat fills. Something slides past your tongue and opens a small mouth of its own.',
  leech: 'Your lips pucker into a round sucker ringed with tiny needle teeth.',
  devour: 'Your jaw cracks loose from your skull with a wet pop. It opens wider than it should.',
  tentacles: "A tongue that isn't yours pushes out between your teeth, and keeps coming.",
  caustic: 'The tendrils start to weep a yellow film. It burns where it drips.',
  writhing: 'More of them push out. You stop being able to count them.',
  strangle: 'The tendrils thicken into ropes of muscle. They squeeze when they are bored.',
  hooks: 'Barbs sprout along the tendrils like thorns on a vine. They catch on your own lips.',
  lashdrain: 'Tiny mouths open all along the tendrils. They are thirsty.',
  flay: 'The tendrils grow a rasp of tiny teeth, like a cat tongue made of glass.',
  proboscis: 'Your face stretches into a long, thin tube. It throbs when you are hungry.',
  siphon: 'The tube splits at the tip. Both halves twitch, looking.',
  hemorrhage: 'The tube grows a needle tip. The holes it leaves do not close.',
  bloodbattery: 'Something like a bladder grows behind your ribs. It sloshes.',
  bloat: 'You feel how much they can hold. And how much more you could give them.',
  sporesac: 'A soft sac grows at the base of the tube. It pulses when you drink.',
  longtube: 'The tube grows long and ribbed, and it never stops wanting.',
  // HEAD
  eyes: 'Your skin bubbles. The bubbles open, and they are eyes.',
  compound: 'Your eyes break into a thousand facets. Every one of them is watching.',
  hivesight: 'Your eyes go dark and glassy, and the dark is suddenly full of shapes.',
  glare: 'Your eyes burn hotter and whiter until you cannot close them anymore.',
  abyssal: 'A new eye opens in your forehead, black from edge to edge. It sees through skin.',
  evileye: 'One eye swells larger than the rest. Once it finds something, it never lets it go.',
  fractured: 'Your eye cracks like ice. You see everything in pieces now.',
  skull: 'Bone floods your scalp. You hear your skull thicken from the inside, a slow creak.',
  horns: 'Two lumps rise on your forehead and split the skin. Horns, curved and heavy.',
  juggernaut: 'Your neck thickens until your head and shoulders are one solid thing.',
  bloodletter: 'The horns grow a groove along their length, to let the blood run.',
  echo: 'Your skull goes hollow and ringing. Every step hums in your teeth.',
  shatter: 'Your skull grows dense as stone. You feel the weight of it in your neck.',
  ossified: 'Bone grows down over your face like a visor. You see through two narrow slits.',
  nighteyes: 'Your pupils swell until there is no color left. The light stings.',
  owleyes: 'Your eyes settle. The light stops hurting, and the dark stays yours.',
  antennae: 'Two long feelers unroll from your brow, tasting the air.',
  stalker: 'Your eyes start to shine in the dark, like an animal at the edge of a road.',
  pitchblack: 'Your eyes go fully black. Light feels like a burn now.',
  darkstare: 'Something behind your eyes learns to hold still, and to hold others still.',
  lightless: 'Your eyes cloud over and seal shut. You do not miss them.',
  parasite: 'Something pushes in behind your eyes and makes itself comfortable.',
  symbiote: 'The thing in your head stops fighting you. It starts humming.',
  brainworm: 'Your skull itches from the inside. Something small is laying eggs.',
  overmind: 'Your skull swells to make room for it. It has learned to use your voice.',
  rider: 'It stretches through your spine and takes the reins. You let go.',
  berserkhost: 'It wakes up angry. Your heart beats to its rhythm now.',
  cerebral: 'Your skull is too small for both of you. It creaks as it stretches.',
  // BACK
  spines: 'Your back prickles, then tears. Bone needles push out of every pore.',
  urchinhide: 'Your skin hardens into a mat of barbs. Lying down will never feel right again.',
  venomquills: 'The quills hollow out and fill with something that burns.',
  seekquills: 'The quills twitch toward heat on their own.',
  quillpulse: 'Your quills calcify, thick and dense as old bone.',
  bonestorm: 'The quills sharpen to needles. They itch to go through something.',
  splitquills: 'Your quills fork at the tips like split hair.',
  chitin: 'A hard plate creeps across your back, slow and grinding, like a tooth coming in.',
  carapace: 'Something lays eggs in the gap between your shell and your skin. You feel them shift when you move.',
  thornplate: 'Thorns punch up through your shell from underneath.',
  reactive: 'Something coils under the plate like a spring.',
  molt: 'Your skin goes loose and papery. It peels at the edges.',
  huskbomb: 'Fluid gathers under your old skin. It sloshes when you move.',
  endlessmolt: 'Your skin will not stop growing. New layers press up under the old.',
  eggsac: 'A swelling rises on your back. Something inside it turns over.',
  eggpods: 'Pustules break out across your back, and each one has a dark shape curled inside.',
  broodmother: 'The sac on your back grows heavy and warm. It never stops filling.',
  venombrood: 'The eggs darken. The things inside have bile in their mouths.',
  lure: 'A stalk grows out of your back with a soft light on the end. It sways.',
  angler: 'The light splits open. There are teeth inside.',
  toxic: 'Your blood darkens and thickens. It smokes a little when it hits the floor.',
  twitch: 'The muscle along your spine starts to tick, and does not stop.',
  adrenal: 'Two glands swell above your kidneys. Your heart races just looking at them.',
  fightflight: 'Your nerves go raw. Every sound arrives a little too early.',
  rage: 'Something hot pools behind your ribs. Pain makes it boil.',
  streamfibers: 'Your muscles start firing on their own, too fast to control.',
  jitter: 'Your nerves fray and spark. You flinch before anything happens.',
  needles: 'Your muscle fibers tighten into thin wire.',
  // LIMBS
  spider: 'Your legs crack apart at the joints and keep cracking. Eight of them now.',
  huntsman: 'Two of the eight legs grow longer and coil back, ready to snap forward.',
  trapdoor: 'Glands open along your legs, oozing something musky. Whatever you land on will smell like prey.',
  mantis: 'Two of your legs fold flat and grow edges sharp as glass.',
  centipede: 'Your body stretches out behind you, one segment at a time. You hear each one click into place.',
  spinedsegs: 'Spines erupt along each segment, bristling.',
  biters: 'Every segment of you opens a small, wet mouth.',
  wings: 'Two lumps split open between your shoulders. The wings inside are wet and new.',
  carrionfly: 'Your wings go thin and buzzing. Flies arrive and do not leave.',
  cropduster: 'Dust gathers in the veins of your wings and sheds when they beat.',
  plague: 'The flies grow fat and many. They nest in your skin.',
  locust: 'Your legs grow long and folded and spring-loaded. You smell like a field.',
  meteor: 'Your bones go dense and heavy. The floor groans under you.',
  pupa: 'Your skin hardens in patches. Something in you wants to be sealed away.',
  grapple: 'A long arm unspools from your side, boneless and aching to be thrown.',
  silktendril: 'The tentacle starts to weep silk.',
  bileline: 'The tentacle bleeds bile wherever it lies.',
  shredpull: 'The tentacle grows a rasp of teeth along its length.',
  hands: 'Your forelimbs split and spread into five fingers each. Human hands. Not yours.',
  puppeteer: 'The tentacle grows a grip at the tip, a ring of hooked fingers.',
  bilebomb: 'Your palms start to sweat bile.',
  burrow: 'Your forelimbs flatten into spades with thick black claws.',
  moleworm: 'Your eyes seal shut and your skin goes smooth and blind. You want to be underground.',
  eruption: 'Spines grow along your spine, laid flat, waiting for you to rise.',
  tunnelbrood: 'Something lays eggs in the dirt that clings to you.',
  razorclaws: 'The claws grow long and edged, like split bone.',
  ambush: 'Underground, your heartbeat slows to almost nothing. It is waiting.',
  quake: 'Your claws grow heavy and blunt. They shake the dirt loose around you.',
  fins: 'Your legs fuse and flatten into a single slick fin. You leave a wet trail.',
  slimeglands: 'Glands swell under your belly and start to leak.',
  acidslime: 'Your slime starts to smoke.',
  slipstream: 'The slime soaks into you and slicks you from the inside.',
  cilia: 'A carpet of tiny hairs grows across your belly, rippling in waves.',
  stilts: 'Your legs grow long, thin and jointed, lifting you up out of the filth.',
  shell: 'A shell grows over you, heavy and curved. You can pull yourself inside it.',
  // CORE
  hide: 'Your skin thickens like an old callus, everywhere at once.',
  calcified: 'Your organs go grey and stiff. You can feel them turning to stone.',
  bonecage: 'Your ribs grow out and around you like the bars of a cage.',
  secondheart: 'A second heart beats under the first, quiet, waiting for the first to stop.',
  regrow: 'Wounds itch as they close. You can feel the flesh knitting.',
  hemophage: 'Your stomach grows a taste for the inside of things.',
  mending: 'Your wounds close while you watch them.',
  marrow: 'Your bones grow heavy and dense. They creak when you move.',
  loaded: 'Your bones grow hollow and pressurized. They hum when you hold still.',
  overcharge: 'The pressure builds until your ribs creak with it.',
  pressure: 'Your joints lock tight when you brace, like a fist.',
  overgrown: 'Your heart swells against your ribs. Each beat shoves your whole body.',
  titanheart: 'The swollen heart settles into its new size. It fits now.',
  hollow: 'Your insides dry up and go light, like a cicada shell.',
  mitosis: 'Your cells are restless. You can feel them pulling apart.',
  brood: 'Your belly warms with something that wants out.',
  clutch: 'You feel tiny eggs in your blood.',
  maggotburst: 'Your young swell with bile.',
  twin: 'Something small is growing beside you, and it has your face.',
  bondedtwin: 'The twin settles. It breathes when you breathe.',
  mirrortwin: 'Your twin grows, and grows, until it is exactly your size.',
  starving: 'Your stomach caves in. The hunger hurts like a wound.',
  apexpredator: 'The hunger settles into something calm. Every kill tastes like enough.',
  bacteria: 'Your gut fills with something alive. It ferments the dead.',
  feedfrenzy: 'Your blood quickens at the smell of meat.',
  cancer: 'A lump grows somewhere you cannot see. It throbs with every win.',
  benignmass: 'The lump stops hurting. It keeps growing, quietly.',
  metastasis: 'The lump has friends now. They are everywhere.',
  barbs: 'Your spit grows hooks. They catch on your lips on the way out.',
  fishhook: 'The hooks curve back on themselves.',
  chainhook: 'The hooks grow eyes, and the eyes look for each other.',
  guthook: 'The hooks grow a second barb, facing the other way.',
  barbvolley: 'Your mouth crowds with hooks. They knock against your teeth.',
  thornstorm: 'The hooks go brittle and full of splinters.',
  seekbarbs: 'The hooks turn in your mouth, sniffing.',
  sneeze: 'Something itches deep in your sinuses. It does not stop.',
  allergen: 'The itch spreads to everything near you.',
  hives: 'Welts rise along your nose and throat, swollen and weeping.',
  histamine: 'Your sinuses swell shut. What you breathe out is thick.',
  sneezefit: 'You cannot stop sneezing. Your eyes stream.',
  pollenstorm: 'Pollen gathers in your nose, gold and choking.',
  mucus: 'Your sinuses thicken with something slick and stringy. It hangs from your face in ropes.',
  leechspit: 'Something wriggles in your throat, hungry. Then another.',
  leechswarm: 'They breed in your throat. You can feel them crawling.',
  fatleech: 'The leeches in your throat swell fat and dark.',
  bloodpact: 'What they drink starts to come back to you, warm.',
  leechspray: 'They clump together in your throat, tangled.',
  anticoag: 'The leeches start to drool. The drool will not let blood clot.',
  hungryleech: 'The leeches turn toward every heartbeat in the room.',
  crablegs: 'Your legs harden into jointed armor, and something heavy snaps beside your face.',
  carapacelegs: 'The pincer grows broad and flat, like a shield with a grip.',
  kingcrab: 'One pincer swells huge and heavy. You list toward it.',
  boxercrab: 'The pincer grows a hammer of muscle. It snaps loud enough to sting.',
  scuttle: 'Bone grows on your legs like barnacles and sheds as you move.',
  sidestep: 'Your leg shells grow hard as river stone.',
  coconutcrab: 'The pincer gets hungry. It twitches whenever you are near meat.',
  haunches: 'Your thighs split and knit back twice as thick. The new sinews & tendons sing when you crouch.',
  pouncer: 'Your heels thicken into hard pads, like an animal used to falling.',
  gorepounce: 'Claws curl out of your feet, black and hooked.',
  killerleap: 'Your leap uncoils and coils again on its own.',
  longstride: 'Your legs stretch longer. The hopping stops. Something in you wants to run.',
  sprinter: 'Your legs grow lean and fast, all tendon.',
  antelope: 'Your bones go light as a bird. You hang in the air.',
  ratincisors: 'Two long yellow teeth push through your upper lip. They will not stop growing.',
  urchinquills: 'Its quills come through your skin from the inside, one by one.',
  toadgullet: 'Your throat swells into a pale, wobbling pouch.',
  splittercells: 'Its cells keep dividing inside you. Some of them are yours.',
  culturejelly: 'You leak a little jelly from your pores. It wobbles.',
  plagueteeth: 'Your teeth go yellow and soft at the roots. Your breath smells like a sickroom.',
  pincushion: 'More quills crowd up through the old ones.',
  bullfrog: 'Your throat sac swells huge. It croaks on its own.',
  mitosis2: 'You cannot stop dividing. You do not want to.',
  digestjelly: 'The jelly gets a stomach. It gurgles.',
  boneplates: 'Bone grows outside you, plates of it, circling you like a slow moon.',
  razorplates: 'The plates grow edges thin enough to see through.',
  bladestorm: 'The plates strain against whatever holds them to you.',
  bonemill: 'The plates grind together as they turn. Bone dust falls from them.',
  mirrorplates: 'A glaze creeps over your plates, cold and wet. You can see yourself in them, wrong.',
  prism: 'The glaze on your plates cracks into facets. Every one holds a different eye.',
  feedingglass: 'Veins grow through the glass on your plates. They pulse when something hits them.',
  ovipositor: 'Something long and segmented grows out of your belly. It probes the air.',
  broodhost: 'The eggs you lay start moving before they hatch.',
  swarmqueen: 'Your young start listening to you instead of their hosts.',
  gestation: 'Your eggs grow bigger and slower and fuller.',
  bloodworm: 'Your young hatch already chewing.',
  chestburster: 'Your young grow claws inside the egg.',
  puppetlarva: 'Your larvae learn which part of a body to eat first.',
  miasma: 'Your mouth seals over. You leak from every pore instead.',
  shroud: 'Your breath thickens into fog. You disappear into it.',
  rothalo: 'What you breathe out smells like a grave.',
  phantom: 'Your skin goes grey and soft at the edges, blurring.',
  causticlungs: 'Your lungs blister and harden. What leaves them burns.',
  corrode: 'Your breath gets an edge, like vinegar.',
  choke: 'The air around you thickens like tar.',
  howl: 'Your chest swells and your ribs spread to make room for a sound.',
  shockwave: 'Your whole body hums with the howl, not just your throat.',
  concussion: 'The howl grows a low note you feel in your fillings.',
  avalanche: 'The howl grows heavier. It knocks things over twice.',
  soniclance: 'Bone grows in your throat, shaped like a reed.',
  wallbreaker: 'The howl drops so low that the floor shakes.',
  rupture: 'The howl finds the soft places inside things.',
  polyp: 'Something wants to take root in you, and leave.',
  sporepolyp: 'The polyps start to cough.',
  fruiting: 'The polyps swell ripe and taut.',
  mycelialweb: 'White threads trail from you wherever you plant.',
  tendrilpolyp: 'The polyps grow arms.',
  graspingbed: 'The polyps grow fingers.',
  feedingpolyps: 'The polyps grow roots that run back to you.',
  tongue: 'Your tongue keeps growing until it coils on the floor of your mouth.',
  bottomlessgut: 'Your stomach stretches and stretches and never tears.',
  acidgut: 'Your gut turns sour. Whatever sits in it starts to melt.',
  regurgitate: 'Your stomach grows teeth.',
  barbedtongue: 'Hooks grow along your tongue, all facing back.',
  grappletongue: 'Your tongue grows a muscle at the root as thick as your arm.',
  venomtongue: 'Your tongue swells and blackens and drips.',
  silk: 'Glands swell in your cheeks. Thread pulls from your lips like spit.',
  stickyweb: 'The silk gets tackier. It sticks to your teeth.',
  webbrood: 'Eggs ride the silk out of you, tiny and white.',
  tripwire: 'The silk tightens and hums like a wire.',
  razorsilk: 'The silk sharpens until it cuts your lips.',
  acidsilk: 'Your silk comes out wet with bile.',
  lair: 'You start to feel every strand of silk you have ever laid.',
  bloom: 'Your scalp splits and a flower unfolds from your skull, wet and red.',
  venusmaw: 'The petals grow teeth.',
  digest: 'The flower grows a stomach in its stem.',
  snaptrap: 'The flower grows a jaw, hinged and spring-loaded.',
  sporebloom: 'The pollen turns bitter and stinging.',
  hayfever: 'The pollen thickens until you can taste it.',
  nightbloom: 'The petals start to glow.',
  // Parts other nodes grow
  spores: 'Your lungs grow a soft grey fur. You cough it up in clouds.',
  hindlegs: 'Your back legs bunch up thick with muscle.',
};

// ===========================================================================
// SETS. Every node belongs to a set (it inherits its parent's unless listed
// here). Each part counts as the set of its CURRENT form, so a branch can
// switch a part to another set. 3 matching parts wake a bonus; 5 wake a
// stronger one. Cards show the set, never what the mutation does.
// ===========================================================================
const SETS = {
  BONE: {
    name: 'BONE', color: '#d9cfa0',
    tags: ['spike', 'hooks', 'howl', 'regurgitate', 'tripwire', 'compound', 'skull', 'spines', 'needles', 'spinedsegs', 'meteor', 'pupa', 'eruption', 'quake', 'stilts', 'shell', 'hide', 'marrow', 'boneplates', 'barbs', 'crablegs', 'urchinquills'],
    bonus: [
      { name: 'Ossified', desc: 'Everything you kill bursts into bone shards.', apply(s) { s.setKillShards = 5; } },
      { name: 'Bone Colossus', desc: 'Every kill bursts into shards, +2 max health, and a hit fires a huge shard ring.', apply(s) { s.setKillShards = 8; s.maxHp += 2; s.ring += 10; } },
    ],
    whisper: ['Your bones remember each other.', 'You are more bone than flesh now. It suits you.'],
  },
  FUNGAL: {
    name: 'FUNGAL', color: '#9aae50',
    tags: ['culturejelly', 'venomspike', 'bile', 'caustic', 'sporesac', 'miasma', 'sporepolyp', 'acidgut', 'acidsilk', 'glare', 'bloom', 'venomquills', 'huskbomb', 'eggpods', 'toxic', 'cropduster', 'bileline', 'bilebomb', 'fins', 'maggotburst', 'bacteria', 'sneeze', 'toadgullet', 'digestjelly'],
    bonus: [
      { name: 'Sporulate', desc: 'What you kill bursts into a blinding spore cloud.', apply(s) { s.setKillCloud = 18; } },
      { name: 'Fruiting Body', desc: 'Kills burst into clouds, you release spores every few seconds, and your clouds eat flesh.', apply(s) { s.setKillCloud = 22; s.setSporeAura = 4; s.cloudDps = Math.max(s.cloudDps || 0, 1.5); } },
    ],
    whisper: ['Something is fruiting under your skin.', 'You are a garden now. Everything you touch will bloom.'],
  },
  HIVE: {
    name: 'HIVE', color: '#e0a830',
    tags: ['ovipositor', 'chitin', 'puppetlarva', 'polyp', 'graspingbed', 'feedingpolyps', 'silk', 'snaptrap', 'molt', 'eggsac', 'broodmother', 'spider', 'wings', 'silktendril', 'tunnelbrood', 'brood', 'leechswarm'],
    bonus: [
      { name: 'Swarm', desc: 'Kills sometimes hatch a spiderling, and your brood can grow larger (up to 4).', apply(s) { s.setKillBrood = 0.35; s.broodCap = 2; } },
      { name: 'Hive Queen', desc: 'Every kill hatches a spiderling, your brood lives twice as long, and it grows larger still (up to 6).', apply(s) { s.setKillBrood = 1; s.allyLife = 2; s.broodCap = 4; } },
    ],
    whisper: ['The others in you begin to hum together.', 'You are the hive. Every death is a birth.'],
  },
  PREDATOR: {
    name: 'PREDATOR', color: '#d04848',
    tags: ['mandibles', 'leech', 'devour', 'hemorrhage', 'rupture', 'tongue', 'eyes', 'horns', 'nighteyes', 'twitch', 'huntsman', 'burrow', 'hindlegs', 'hemophage', 'starving', 'guthook', 'leechspit', 'haunches', 'ratincisors'],
    bonus: [
      { name: 'Blood Scent', desc: '+35% damage to wounded prey.', apply(s) { s.setWounded = 0.35; } },
      { name: 'Apex', desc: 'Wounded prey takes +50%, every kill sends you into a frenzy, and every 8th kill heals you.', apply(s) { s.setWounded = 0.5; s.setKillFrenzy = true; s.setKillHeal = 8; } },
    ],
    whisper: ['You can smell where they are hurt.', 'Nothing hunts you now. You hunt.'],
  },
  ABOMINATION: {
    name: 'ABOMINATION', color: '#b464c8',
    tags: ['mawtendrils', 'tentacles', 'writhing', 'strangle', 'lashdrain', 'proboscis', 'bloodworm', 'tendrilpolyp', 'fractured', 'lightless', 'parasite', 'splitquills', 'angler', 'rage', 'biters', 'grapple', 'shredpull', 'secondheart', 'regrow', 'overgrown', 'mitosis', 'cancer', 'splittercells'],
    bonus: [
      { name: 'Grafted', desc: 'When you are hurt, tendrils burst out and lash everything near you.', apply(s) { s.setHurtLash = 3; } },
      { name: 'Abomination', desc: 'Lashing tendrils when hurt, +30% damage, and you regrow a little flesh every room you clear.', apply(s) { s.setHurtLash = 5; s.damageMul *= 1.3; s.setRoomHeal = true; } },
    ],
    whisper: ['The pieces of you are starting to agree.', 'There is no name for what you are.'],
  },
};
const SET_OF_TAG = {};
for (const k in SETS) for (const id of SETS[k].tags) SET_OF_TAG[id] = k;

// The set a node belongs to (null for the starter slime).
function setOf(id) {
  for (let cur = id; cur; cur = MUTATIONS[cur].from) if (SET_OF_TAG[cur]) return SET_OF_TAG[cur];
  return null;
}

// How many parts match each set, by each part's current form.
function setCounts(p) {
  const n = {};
  for (const m of p.parts) {
    const k = !m.starter && setOf(m.id);
    if (k) n[k] = (n[k] || 0) + 1;
  }
  return n;
}

// The set bonus you have right now: { set, tier (0 = 3 matching, 1 = 5 matching) } or null.
function activeSet(p) {
  const n = setCounts(p);
  for (const k in n) if (n[k] >= 3) return { set: k, tier: n[k] >= 5 ? 1 : 0, count: n[k] };
  return null;
}

// ===========================================================================
// SPLICES. Hidden pairings between parts from DIFFERENT places on the body.
// Grow both halves (anywhere along their paths) and they fuse into something
// new, and into ONE part: every splice frees a slot. Each half
// lists the nodes that count. Cards never name a splice; a card that would
// complete one just says SOMETHING STIRS.
// ===========================================================================
const SPLICES = {
  firestorm:      { name: 'Firestorm',       parts: [['sporefire'], ['cropduster']],      apply(s) { s.fireTrail = true; },
    desc: 'The spore trail you drop while flying is burning.', whisper: 'Everything you drop behind you is burning.' },
  hivemind:       { name: 'Hive Mind',       parts: [['brood'], ['eggsac']],              apply(s) { s.allyDmg = 2; s.allyLife = Math.max(s.allyLife || 1, 1.5); },
    desc: 'Your brood bites twice as hard and lives longer.', whisper: 'All your children share one mind now. Yours.' },
  bonesaw:        { name: 'Bone Saw',        parts: [['spines'], ['mantis']],             apply(s) { s.boneSaw = true; },
    desc: 'Dashing sprays bone shards the whole way.', whisper: 'Lunge, and the shards come loose all along the way.' },
  bloodpump:      { name: 'Blood Pump',      parts: [['proboscis'], ['hemophage']],       apply(s) { s.drainDna = 8; },
    desc: 'The blood you drink turns into biomass.', whisper: 'What you drink, you keep.' },
  echochamber:    { name: 'Echo Chamber',    parts: [['echo'], ['spines']],               apply(s) { s.ringStun = 0.5; },
    desc: 'Your shards ring in their skulls: whatever they hit is stunned for a moment.', whisper: 'The ringing in your skull is in your shards now.' },
  livingarmor:    { name: 'Living Armor',    parts: [['chitin'], ['hide']],               apply(s) { s.shellOnKills = 5; },
    desc: 'Every 5 kills regrow your shell.', whisper: 'Your hide feeds your shell. Kill, and it grows back.' },
  septicblood:    { name: 'Septic Blood',    parts: [['toxic'], ['mitosis']],             apply(s) { s.hurtFrags = 8; },
    desc: 'When you bleed, your blood splits into seeking acid fragments.', whisper: 'Your blood divides as it leaves you, and it hunts.' },
  parasiticbrood: { name: 'Parasitic Brood', parts: [['parasite'], ['brood']],            apply(s) { s.parasiteBrood = 3; },
    desc: 'When the parasite takes control, maggots burst out of you.', whisper: 'When it drives, it lays.' },
  impaler:        { name: 'Impaler',         parts: [['horns'], ['huntsman', 'locust']],  apply(s) { onHit(s, 'slam', 'bleed', { t: 3, dps: 3 }); onHit(s, 'slam', 'stun', { t: 0.6 }); },
    desc: 'Your pounce lands horns first: everything under it bleeds and reels.', whisper: 'Land horns first.' },
  acidskin:       { name: 'Acid Skin',       parts: [['acidmaw'], ['urchinhide']],        apply(s) { onHit(s, 'contact', 'acidMark', { t: Infinity }); },
    desc: 'Anything that touches you bursts into bile when it dies.', whisper: 'Your skin bites too. What it bites, it rots.' },
  nightmarelure:  { name: 'Nightmare Lure',  parts: [['nighteyes'], ['lure']],            apply(s) { s.nightLure = true; },
    desc: 'Your lure is a dark eye that blinds whatever comes close.', whisper: 'The light on your back has learned to look back.' },
  plaguebearer:   { name: 'Plaguebearer',    parts: [['ovipositor'], ['brood']],          apply(s) { s.oviMaggots = true; },
    desc: 'Your hosts burst into maggots too.', whisper: 'Everything you lay in, breeds.' },
  toxicwings:     { name: 'Toxic Wings',     parts: [['miasma'], ['wings']],              apply(s) { s.gasTrail = true; },
    desc: 'Flying, you leave a trail of your toxic gas behind you.', whisper: 'Your wings stir the poison into the air.' },
  resonance:      { name: 'Resonance',       parts: [['howl'], ['echo']],                 apply(s) { s.dashHowl = true; },
    desc: 'Your headbutt howls too, hurling everything near you away.', whisper: 'Your skull and your throat sing together.' },
  greenhouse:     { name: 'Greenhouse',      parts: [['bloom'], ['polyp']],               apply(s) { s.polypPollen = true; if (!s.pollen) s.pollen = { r: 0, every: 99 }; },
    desc: 'Your polyps spit pollen: whatever they hit is pollinated.', whisper: 'Your garden pollinates for you.' },
  toadking:       { name: 'Toad King',       parts: [['toadgullet'], ['tongue']],         apply(s) { s.spitAcid = Math.max(s.spitAcid || 0, 14); },
    desc: 'What you swallow and spit back bursts into burning bile.', whisper: 'Two gullets, one hunger.' },
  quillstorm:     { name: 'Quill Storm',     parts: [['urchinquills'], ['boneplates']],   apply(s) { s.quillCount = 12; },
    desc: 'Your quills fire twice as many spines.', whisper: 'Every spine in you wants out.' },
  wingedbrood:    { name: 'Winged Brood',    parts: [['wings'], ['eggsac']],              apply(s) { s.flyingBrood = true; },
    desc: 'Your spiderlings hatch with wings: faster, and they fly over everything.', whisper: 'Your children are born with wings.' },

  // --- BIG SPLICES: new ways to fight. Both halves must be FULLY GROWN. ---
  divebomb:       { name: 'Dive Bomb',       parts: [['mandibles'], ['wings']], grown: 3,      apply(s) { s.diveBomb = true; },
    desc: 'Your dash ends in a swooping bite that savages and stuns everything where you land.', whisper: 'Fall on them, jaws first.' },
    bilegarden:     { name: 'Bile Garden',     parts: [['bile'], ['polyp']], grown: 3,          apply(s) { s.bilePolyps = true; },
    desc: 'Your polyps spray burning bile, twice as fast.', whisper: 'Your garden weeps acid.' },
  broodhowl:      { name: 'Brood Howl',      parts: [['howl'], ['eggsac']], grown: 3,         apply(s) { s.broodHowl = 2; },
    desc: 'Your howl lays eggs in everything it hits. When they die, spiderlings burst out.', whisper: 'Your scream is full of eggs.' },
  bonecannon:     { name: 'Bone Cannon',     parts: [['spike'], ['skull']], grown: 3,         apply(s) { s.boneCannon = true; },
    desc: 'Your headbutt fires a huge bone lance that punches through everything in a line.', whisper: 'Your skull is a barrel now.' },
  bonejaws:       { name: 'Bone Jaws',       parts: [['spike'], ['mandibles']],         apply(s) { s.boneJaws = true; },
    desc: 'Every bite drives a bone spike out through the back of the victim.', whisper: 'Teeth and bone, one mouth. What you bite, the bone goes through.' },
  barbedlash:     { name: 'Barbed Lash',     parts: [['spike'], ['tentacles']],         apply(s) { s.barbedLash = true; },
    desc: 'Every lash flings a bone spike from the victim to the next enemy.', whisper: 'Tendrils tipped with bone. What they strike, they pass along.' },
  silknursery:    { name: 'Silk Nursery',    parts: [['silk'], ['spider']], grown: 3,         apply(s) { s.silkNursery = 1.1; },
    desc: 'Whatever is stuck in your webs is swarmed: spiderlings keep hatching on it.', whisper: 'Your webs are a nursery, and the stuck are food.' },
  toxicbloom:     { name: 'Toxic Bloom',     parts: [['miasma'], ['bloom']], grown: 3,        apply(s) { s.toxicBloom = true; },
    desc: 'Your gas carries pollen, and your pollen burst leaves a poison cloud on everything it touches.', whisper: 'Your flower breathes your poison.' },
  seismichowl:    { name: 'Seismic Howl',    parts: [['howl'], ['burrow']], grown: 3,         apply(s) { s.seismicHowl = true; },
    desc: 'You erupt from the ground howling in every direction, hurling everything away.', whisper: 'The ground screams with you.' },
  bloodgulp:      { name: 'Blood Gulp',      parts: [['tongue'], ['proboscis']], grown: 3,    apply(s) { s.bloodGulp = true; },
    desc: 'Everything you swallow heals you, and what you spit back bursts like a blood bomb.', whisper: 'You drink them whole.' },
  batteringram:   { name: 'Battering Ram',   parts: [['chitin'], ['skull']], grown: 3,        apply(s) { s.batteringRam = true; },
    desc: 'With your shell up, your charge hits three times as hard and stuns everything it hits.', whisper: 'Shell first, skull first, through them.' },
  venombarrage:   { name: 'Venom Barrage',   parts: [['spike'], ['bile']], grown: 3,          apply(s) { s.venomBarrage = true; },
    desc: 'Your bone spikes fly through your flame: every one that hits bursts into burning bile.', whisper: 'Two mouths, one fire.' },
};

// Every splice whose two halves you've grown (big ones: both fully grown),
// each half in its own part.
function splicesOf(parts) {
  return Object.keys(SPLICES).filter(k => {
    const S = SPLICES[k], need = S.grown || 1;
    const a = parts.find(m => m.path.length >= need && S.parts[0].some(id => m.path.includes(id)));
    return a && parts.some(m => m !== a && m.path.length >= need && S.parts[1].some(id => m.path.includes(id)));
  });
}
function activeSplices(p) { return splicesOf(p.parts); }

// The body you'd have after taking a card.
function partsAfter(p, c) {
  c = resolveCard(p, c);
  if (c.id === '_gorge') return p.parts;
  if (c.kind === 'branch') { const m = c.part || partFor(p, c.id); return p.parts.map(x => x === m ? Object.assign({}, x, { id: c.id, path: x.path.concat([c.id]) }) : x); }
  return p.parts.filter(m => m !== c.shed).concat([{ id: c.id, path: [c.id], loc: locOf(c.id) }]);
}

// Would taking this card complete a splice you don't have yet?
function wouldSplice(p, c) {
  if (typeof c === 'string') c = { id: c };
  const now = activeSplices(p);
  return splicesOf(partsAfter(p, c)).some(k => !now.includes(k));
}

// ===========================================================================
// COLORATION. Parts recolor your whole body: spider legs make you dark and
// chitinous, a frog tongue turns you frog-green... Every node in a slot's
// path can carry a tint: [color, strength 0-1, darkening 0-1]. The body
// blends all of them (see bodyTint in player.js).
// ===========================================================================
const TINTS = {
  // MOUTH
  spike: ['#d8ccb0', 0.25], bile: ['#a8b840', 0.5], mandibles: ['#6a4020', 0.45, 0.15], tentacles: ['#8a3a6a', 0.5],
  proboscis: ['#a03040', 0.4], ovipositor: ['#d8c890', 0.5], miasma: ['#6a9a3a', 0.55, 0.1], howl: ['#8a6a50', 0.35],
  polyp: ['#c86a8a', 0.4], tongue: ['#4aa040', 0.65], silk: ['#c8c0b8', 0.45],
  // HEAD
  eyes: ['#c8a8a0', 0.2], skull: ['#d8ccb0', 0.35], nighteyes: ['#3a3a6a', 0.45, 0.25], parasite: ['#8a4a9a', 0.45], bloom: ['#d86a8a', 0.35],
  // BACK
  spines: ['#d8ccb0', 0.35], chitin: ['#6a4a24', 0.5, 0.15], eggsac: ['#d8c8a0', 0.3], twitch: ['#b04030', 0.4],
  toxic: ['#9ac030', 0.4],
  // LIMBS
  spider: ['#3a2a30', 0.7, 0.4], wings: ['#7a6a8a', 0.4], grapple: ['#8a3a6a', 0.5], burrow: ['#6a5038', 0.5, 0.15],
  fins: ['#5a8aa0', 0.5], centipede: ['#7a3a1a', 0.4, 0.1],
  // CORE
  hide: ['#7a5a48', 0.35], marrow: ['#d8ccb0', 0.3], mitosis: ['#c86a9a', 0.4], starving: ['#8a7a6a', 0.4, 0.15],
  overgrown: ['#9a2030', 0.35], boneplates: ['#d8ccb0', 0.3],
};

// --- Tree helpers -------------------------------------------------------------------
function getMutDef(id) { return MUTATIONS[id]; }

// Where on the body a node grows (branches inherit it from their root).
function locOf(id) {
  let d = MUTATIONS[id];
  while (d.from) d = MUTATIONS[d.from];
  return d.slot;
}

function rootOf(id) {
  while (MUTATIONS[id].from) id = MUTATIONS[id].from;
  return id;
}

function rootsOf(loc) {
  return Object.keys(MUTATIONS).filter(id => MUTATIONS[id].slot === loc && !MUTATIONS[id].part);
}

function childrenOf(id) {
  return Object.keys(MUTATIONS).filter(k => MUTATIONS[k].from === id);
}

function siblingOf(id) {
  const from = MUTATIONS[id].from;
  return from ? childrenOf(from).find(k => k !== id) : null;
}

// Which overlay sprites to draw for one node.
function mutOverlays(id) {
  return MUTATIONS[id].overlay || [];
}

// Add one part's whole path to a stat sheet. Each node uses the part's growth level.
// Each level makes the part itself stronger: whatever it adds to the stat
// sheet is scaled up (damage, counts, ranges), and whatever it times is
// sped up (delays, cooldowns). Per kind: [stronger per level, faster per level].
const LEVEL_GAIN = { MOUTH: [0.10, 0.08], LIMBS: [0.06, 0.08], HEAD: [0.10, 0.10], BACK: [0.12, 0.08], CORE: [0.08, 0.08] };
// What a level-up card says: + for a small bump, ++ / +++ for a big one.
const bumpSign = g => g > 0.2 ? '+++' : g > 0.12 ? '++' : '+';
function levelText(m, L) {
  const [up, fast] = LEVEL_GAIN[m.loc] || [0.1, 0.08];
  if (m.loc === 'MOUTH') return `${bumpSign(up)}DAMAGE ${bumpSign(fast)}FIRE RATE`;
  if (m.loc === 'LIMBS') return `${bumpSign(up)}SPEED ${bumpSign(fast)}DASH ${bumpSign(fast)}ABILITY`;
  if (m.loc === 'HEAD') return `${bumpSign(up)}POWER ${bumpSign(fast)}RECHARGE`;
  if (m.loc === 'BACK') return `${bumpSign(up)}EFFECT`;
  return `${bumpSign(up)}POWER` + (Math.floor(L / 2) > Math.floor((L - 1) / 2) ? ' ++HEALTH' : ''); // CORE: +1 max health every other level
}
const LOWER_IS_BETTER = new Set(['biteDelay', 'lashDelay', 'lungeDelay', 'vomitDelay', 'dashCd', 'grapple', 'shieldCd', 'regen', 'delay', 'every', 'rate', 'glare', 'cd', 'plateRegrow']);
const NO_LEVEL_SCALE = new Set(['maxHp', 'hitCost', 'starve', 'invulnCap', 'invuln', 'hop', 'dashTime', 'accel', 'drag', 'limbCount', 'hpMul', 'lightMul', 'speedMul', 'dnaMul', 'rateMul', 'damageMul', 'speed', 'dashSpeed', 'fins', 'compound', 'power']);
const DAMAGE_FIELDS = new Set(['dmg', 'dps', 'burstDmg', 'slam', 'spit', 'mul']);

// Add one part's whole path to a stat sheet. Each node uses the part's growth level.
function applyMutation(s, m, p) {
  const l = m.path.length, raw = m.lvl || 0, L = raw <= LEVEL_MAX ? raw : LEVEL_MAX + (raw - LEVEL_MAX) * 0.5; // overgrowth: half-size steps
  if (!L) { for (const id of m.path) MUTATIONS[id].apply(s, l, p); return; }
  const before = {}, objs = {}, g0 = s.guns.length;
  for (const k in s) { if (typeof s[k] === 'number') before[k] = s[k]; else if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) objs[k] = s[k]; }
  for (const id of m.path) MUTATIONS[id].apply(s, l, p);
  const [up, fast] = LEVEL_GAIN[m.loc] || [0.1, 0.08], better = 1 + up * L, quicker = 1 / (1 + fast * L);
  for (const k in s) {
    const b = s[k];
    if (typeof b === 'number') {
      const a = before[k] === undefined ? 0 : before[k];
      if (b === a || NO_LEVEL_SCALE.has(k)) continue;
      if (LOWER_IS_BETTER.has(k)) s[k] = b * quicker;
      else if (b > a) { const v = a + (b - a) * better; s[k] = Number.isInteger(a) && Number.isInteger(b) ? Math.round(v) : v; }
    } else if (b && typeof b === 'object' && !Array.isArray(b) && objs[k] !== b) { // an attack this part created
      for (const f in b) if (typeof b[f] === 'number') { if (LOWER_IS_BETTER.has(f)) b[f] *= quicker; else if (DAMAGE_FIELDS.has(f)) b[f] *= better; }
    }
  }
  for (let i = g0; i < s.guns.length; i++) { s.guns[i].dmg *= better; s.guns[i].delay *= quicker; }
  if (m.loc === 'LIMBS') { s.speed *= 1 + up * L; s.dashCd *= quicker; s.limbCdMul *= quicker; }
  if (m.loc === 'HEAD') s.headCdMul *= quicker;
  if (m.loc === 'CORE') s.maxHp += Math.floor(L / 2);
}

// --- Your parts -----------------------------------------------------------------------
// p.parts: [{ id, path, loc, starter?, lvl }]
function partsAt(p, loc) { return p.parts.filter(m => m.loc === loc); }
function partAt(p, loc) { return p.parts.find(m => m.loc === loc) || null; }
function newPart(id) { return { id, path: [id], loc: locOf(id), lvl: 0 }; }

// The path a replacement grows in on: as many steps down its tree as the part
// it replaces had grown (so swapping a grown part is a sidegrade, never a
// step back to a bare root). Where its tree forks, the branch is chosen by the
// pair of parts, so the card shows exactly what you'll get.
function swapPath(root, old) {
  const path = [root];
  let seed = 0;
  for (const ch of root + '>' + old.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  while (path.length < old.path.length) {
    const kids = childrenOf(path[path.length - 1]);
    if (!kids.length) break;
    path.push(kids[seed % kids.length]);
    seed = Math.floor(seed / kids.length) + 7;
  }
  return path;
}

// The part that holds a node, or the part a branch would grow from.
function partFor(p, id) {
  const d = MUTATIONS[id];
  return p.parts.find(m => m.path.includes(id)) || (d.from ? p.parts.find(m => m.id === d.from) : null) || null;
}

// Every part fills exactly one slot of its own kind.
function partSize(m) { return 1; }
function rootSize(id) { return 1; }
function slotsUsed(p) { return p.parts.length; }
function slotCapacity(p) { return Math.min(MAX_SLOTS, p.capacity); }
// The slots of each kind that are open right now (p.capacity counts along SLOT_ORDER).
function openSlots(p) { return SLOT_ORDER.slice(0, slotCapacity(p)); }
function slotsAt(p, loc) { return openSlots(p).filter(l => l === loc).length; }
function freeSlotsAt(p, loc) { return slotsAt(p, loc) - partsAt(p, loc).length; }
function freeSlots(p) { return LOCS.reduce((n, loc) => n + Math.max(0, freeSlotsAt(p, loc)), 0); }
// The kind of slot the next devoured core opens (null once the body is complete).
function nextSlot(p) { return slotCapacity(p) < MAX_SLOTS ? SLOT_ORDER[slotCapacity(p)] : null; }


// Does the player have this node anywhere?
function hasMutation(p, id) {
  return p.parts.some(m => m.path.includes(id));
}

// Is this part's path still carrying a malignant cost (no cure after it)?
function slotMalignant(m) {
  let mal = false;
  for (const id of m.path) {
    if (MUTATIONS[id].malignant) mal = true;
    if (MUTATIONS[id].cures) mal = false;
  }
  return mal;
}

// Some rarer roots only grow as a metamorphosis if the right part grows
// ELSEWHERE on the body (`requires: { any: [ids] }` or `{ set }`).
function meetsRequirement(p, id, except) {
  const req = MUTATIONS[id].requires;
  if (!req) return true;
  return p.parts.some(m => {
    if (m === except || m.starter) return false;
    if (req.any && req.any.some(x => m.path.includes(x))) return true;
    return !!(req.set && setOf(m.id) === req.set);
  });
}

// Every card the body could take right now. A card is { id, shed? }:
//   a BRANCH of a part you're growing (no new slot; locks out its sibling),
//   a new ROOT in a free slot (one head and one set of limbs at most),
//   a MOUTH root that replaces your starter Slime Blob,
//   a METAMORPHOSIS: a fully grown part sheds into a rarer root of its kind.
// A CORE root is only PLANTED from a devoured boss core (onlyLoc = 'CORE');
// once planted it branches like any other part.
function bodyOffers(p, onlyLoc, boss = false) {
  const out = [];
  const okLoc = loc => onlyLoc ? loc === onlyLoc : loc !== 'CORE'; // new roots and metamorphoses
  const starter = p.parts.find(m => m.starter);
  for (const m of p.parts) {
    if (m.starter || (onlyLoc && m.loc !== onlyLoc)) continue;
    const kids = childrenOf(m.id);
    if (kids.length) { for (const id of kids) out.push({ id, kind: 'branch', part: m }); continue; }
    if (!okLoc(m.loc)) continue;
    // Fully grown: it can shed into a rarer root.
    const rank = RARITY_ORDER.indexOf(MUTATIONS[m.path[0]].rarity);
    for (const r of rootsOf(m.loc)) {
      if (RARITY_ORDER.indexOf(MUTATIONS[r].rarity) <= rank || hasMutation(p, r) || MUTATIONS[r].boss || !meetsRequirement(p, r, m)) continue;
      out.push({ id: r, kind: 'meta', shed: m });
    }
  }
  for (const loc of LOCS) {
    if (!okLoc(loc)) continue;
    const swapStarter = starter && starter.loc === loc;
    if (!swapStarter && freeSlotsAt(p, loc) < 1) continue; // no open slot of this kind
    for (const r of rootsOf(loc)) {
      if (hasMutation(p, r) || !!MUTATIONS[r].boss !== boss) continue;
      out.push(swapStarter ? { id: r, kind: 'replace', shed: starter } : { id: r, kind: 'root' });
    }
  }
  return out;
}

// Boss picks you could plant right now.
// With no room, a boss pick takes the place of your least-grown part of
// the same kind (the card says which it sheds).
function bossPicks(p) {
  const out = bodyOffers(p, null, true).filter(c => MUTATIONS[c.id].boss && !MUTATIONS[c.id].from);
  for (const r of Object.keys(MUTATIONS)) {
    const d = MUTATIONS[r];
    if (!d.boss || d.from || hasMutation(p, r) || out.some(c => c.id === r)) continue;
    const shed = partsAt(p, d.slot).sort((a, b) => a.path.length - b.path.length)[0];
    if (shed) out.push({ id: r, kind: 'swap', shed });
  }
  return out;
}

// Is this card a metamorphosis (a new root shedding a grown part)?
function isMetamorph(p, c) {
  if (typeof c === 'string') c = { id: c };
  if (c.kind) return c.kind === 'meta';
  const m = c.shed || (!MUTATIONS[c.id].from && freeSlotsAt(p, locOf(c.id)) < 1 && partAt(p, locOf(c.id)));
  return !MUTATIONS[c.id].from && !!m && !m.starter;
}

// Roll `n` cards. Usually one part shows BOTH of its next branches side by
// side, so you see exactly which path you're giving up. The rest mix growing
// what you have with planting something new: wide or deep, your call.
// `onlyLoc`: a devoured boss core offers only CORE cards.
function rollChoices(p, n, minRarity, onlyLoc, plain = false, opened = null) {
  const minIdx = minRarity ? RARITY_ORDER.indexOf(minRarity) : 0;
  const luck = r => (r === 'rare' || r === 'legendary') ? (1 + 0.2 * (game.depth - 1)) : 1;
  const weight = c => {
    const d = MUTATIONS[c.id];
    let w = RARITY[d.rarity].weight * luck(d.rarity);
    if (d.malignant) w *= 0.7;
    if (d.boss) w *= 0.03; // boss picks are rare finds (about 1 vial in 4)
    if (RARITY_ORDER.indexOf(d.rarity) < minIdx) w *= 0.02; // a vial strongly prefers rare samples
    return w;
  };
  const pickWeighted = cs => {
    let total = 0;
    for (const c of cs) total += weight(c);
    let r = Math.random() * total;
    for (const c of cs) if ((r -= weight(c)) <= 0) return c;
    return cs[cs.length - 1];
  };
  const card = c => { const o = { id: c.id, kind: c.kind }; if (c.shed) o.shed = c.shed; return o; };
  const gorge = { id: '_gorge' };
  const all = bodyOffers(p, onlyLoc);

  if (onlyLoc && onlyLoc !== 'CORE') {
    // A colored vial: only that kind of part. Usually a fork, never two
    // metamorphoses. If nothing of that kind can grow, it's a mixed roll instead.
    // The strangest roots (BOSS PICKS) turn up here too, rarely (never in the first room's vial).
    const cs = all.concat(plain ? [] : bossPicks(p).filter(c => locOf(c.id) === onlyLoc)), out = [];
    if (!cs.length) return rollChoices(p, n, minRarity);
    const take = c => { if (!out.some(o => o.id === c.id)) out.push(card(c)); };
    const byPart = new Map();
    for (const c of cs) if (c.kind === 'branch') { if (!byPart.has(c.part)) byPart.set(c.part, []); byPart.get(c.part).push(c); }
    const forks = [...byPart.values()].filter(g => g.length === 2);
    if (forks.length && Math.random() < 0.7) forks[Math.floor(Math.random() * forks.length)].forEach(take);
    let metas = out.filter(c => c.kind === 'meta').length, finds = 0;
    while (out.length < n) {
      const left = cs.filter(c => !out.some(o => o.id === c.id) && (c.kind !== 'meta' || !metas) && !(MUTATIONS[c.id].boss && finds));
      if (!left.length) break;
      const c = pickWeighted(left); if (c.kind === 'meta') metas++; if (MUTATIONS[c.id].boss) finds++; // at most one rare find per vial
      take(c);
    }
    // The first vials (the first room's mouth, floor 1's limbs) sometimes hold a WILD CARD: a rare find.
    if (plain && out.length && Math.random() < WILD_CHANCE) {
      const wild = bossPicks(p).filter(c => locOf(c.id) === onlyLoc);
      if (wild.length) { const w = pick(wild); out[Math.floor(Math.random() * out.length)] = card(w); out.wild = true; }
    }
    // Nothing new can grow (no free slot, nothing to branch)? Then the vial
    // feeds the part already there, and you can always pass on a swap.
    if (!out.some(c => c.kind === 'root' || c.kind === 'branch' || c.kind === 'replace')) {
      out.splice(1); // keep one swap at most
      const feed = partsAt(p, onlyLoc).filter(m => !m.starter).sort((a, b) => (a.lvl || 0) - (b.lvl || 0))[0];
      if (feed) out.push({ id: feed.id, kind: 'level', part: feed });
      out.push(gorge);
    }
    return out.sort(() => Math.random() - 0.5);
  }
  if (onlyLoc) {
    // A devoured core (it already gave you +1 max health). If it opened a new
    // slot, one card fills it (rare or better when there is one); otherwise one
    // card is a boss pick. The rest grow your CORE.
    const cs = all.slice(), out = [];
    const best = list => { // rare or better when any is on offer
      const rare = list.filter(c => RARITY_ORDER.indexOf(MUTATIONS[c.id].rarity) >= RARITY_ORDER.indexOf('rare'));
      return rare.length ? rare : list;
    };
    const extra = opened === 'CORE' ? [] : opened
      ? bodyOffers(p, opened).filter(c => c.kind === 'root').concat(bossPicks(p).filter(c => c.kind === 'root' && locOf(c.id) === opened))
      : bossPicks(p);
    if (extra.length) out.push(card(pick(best(extra))));
    let metas = 0;
    while (out.length < n && cs.length) {
      const c = cs.splice(cs.indexOf(pickWeighted(cs)), 1)[0];
      if (c.kind === 'meta' && metas++) continue;
      out.push(card(c));
    }
    if (out.length < 2 || out.every(c => c.kind === 'meta')) out.push(gorge); // you can always decline
    return out.sort(() => Math.random() - 0.5);
  }

  const out = [];
  const take = c => { if (!out.some(o => o.id === c.id)) out.push(card(c)); };
  // Still spitting the starter slime? Always offer a way out of it.
  const replace = all.filter(c => c.kind === 'replace');
  if (replace.length) take(pickWeighted(replace));
  // No mouth yet (you skipped the first room's vial)? Always offer one.
  const mouths = !partAt(p, 'MOUTH') && all.filter(c => c.kind === 'root' && locOf(c.id) === 'MOUTH');
  if (mouths && mouths.length) take(pickWeighted(mouths));
  // Still a limbless slug? Always offer a way to move.
  const legs = !partAt(p, 'LIMBS') && all.filter(c => c.kind === 'root' && locOf(c.id) === 'LIMBS');
  if (legs && legs.length) take(pickWeighted(legs));
  // Groups: each part's branches, one per body location for new roots, and metamorphoses.
  const groups = [];
  const byPart = new Map();
  for (const c of all) if (c.kind === 'branch') { if (!byPart.has(c.part)) byPart.set(c.part, []); byPart.get(c.part).push(c); }
  const forks = [...byPart.values()].filter(g => g.length === 2);
  if (forks.length && n - out.length >= 2 && Math.random() < 0.7) {
    const f = forks[Math.floor(Math.random() * forks.length)];
    f.forEach(take);
    byPart.delete(f[0].part);
  }
  for (const g of byPart.values()) groups.push({ cards: g });
  for (const loc of LOCS) { const g = all.filter(c => c.kind === 'root' && locOf(c.id) === loc); if (g.length) groups.push({ cards: g }); }
  const metas = all.filter(c => c.kind === 'meta');
  // Tempting, never the whole offer: only sometimes, unless there's nothing else to grow.
  const nothingElse = !out.length && !groups.length;
  if (metas.length && (nothingElse || Math.random() < 0.5)) groups.push({ cards: metas });
  groups.sort(() => Math.random() - 0.5);
  for (const g of groups) { if (out.length >= n) break; take(pickWeighted(g.cards)); }
  // Still short? Take more from what's on offer (never a second metamorphosis).
  const left = all.filter(c => c.kind !== 'meta' && !out.some(o => o.id === c.id));
  while (out.length < n && left.length) take(left.splice(Math.floor(Math.random() * left.length), 1)[0]);
  if (!out.length || out.every(c => c.kind === 'meta')) out.push(gorge); // you can always decline
  return out.sort(() => Math.random() - 0.5);
}

// A part that replaces another (metamorphosis, boss pick) keeps
// its growth: it starts one level above the part it sheds, short of evolving.
function inheritedLevel(old) { return Math.min(LEVEL_MAX - 1, (old.lvl || 0) + 1); }

// Fill in what a hand-made card ({ id } only) would do.
function resolveCard(p, c) {
  if (c.kind || c.id === '_gorge') return c;
  const d = MUTATIONS[c.id], loc = locOf(c.id);
  if (d.from) return { id: c.id, kind: 'branch', part: partFor(p, c.id) };
  const starter = p.parts.find(m => m.starter && m.loc === loc);
  if (starter) return { id: c.id, kind: 'replace', shed: starter };
  const held = freeSlotsAt(p, loc) < 1 && partAt(p, loc);
  if (held) return { id: c.id, kind: 'meta', shed: held };
  return { id: c.id, kind: 'root' };
}

// Everything a card needs to show (never what it does: you learn by growing it).
// The card's line: a part's `short` if it has one, else the first sentence
// of its description (two, when the first is just a word like "Melee.").
// The full description shows when you hover the card.
function cardText(d) {
  if (d.short) return d.short;
  const ss = d.desc.match(/[^.!?]+[.!?]*/g) || [d.desc];
  let t = ss[0].trim();
  if (t.length < 16 && ss[1]) t += ' ' + ss[1].trim();
  return t;
}

function choiceInfo(p, c) {
  if (c.kind === 'level') {
    const m = c.part, d = MUTATIONS[m.id], L = (m.lvl || 0) + 1, evolves = L >= LEVEL_MAX && childrenOf(m.id).length > 0;
    return { id: m.id, name: d.name, rarity: d.rarity, desc: d.desc, short: cardText(d), malignant: !!d.malignant && slotMalignant(m), set: null, slot: m.loc, kind: 'level',
      status: evolves ? 'EVOLVES!' : L > LEVEL_MAX ? 'OVERGROWTH ' + (L - LEVEL_MAX) : 'LEVEL ' + L, note: levelText(m, L), noteColor: evolves ? VIAL_COLOR : PAL.slate, overlays: [], stirs: false, tier: 0, level: Math.min(L, LEVEL_MAX), size: 1 };
  }
  if (c.id === '_gorge') {
    const free = freeSlots(p);
    return { name: 'Gorge', rarity: 'common', desc: 'Grow nothing. Heal a heart.', short: 'Grow nothing. Keep your body as it is.', status: 'HEAL 1 HEART', note: free > 0 ? 'KEEPS THE SLOT FREE' : null, noteColor: VIAL_COLOR, overlays: [], slot: '' };
  }
  c = resolveCard(p, c);
  const loc = locOf(c.id);
  const m = c.kind === 'branch' ? (c.part || partFor(p, c.id)) : c.shed;
  // Replacing a grown part: the card shows the evolved form you'd get (swapPath).
  const grown = (c.kind === 'swap' || c.kind === 'meta') && m && !m.starter ? swapPath(c.id, m) : [c.id];
  const gid = grown[grown.length - 1], d = MUTATIONS[gid], rd = MUTATIONS[c.id];
  let status, note = null, noteColor = PAL.slate;
  if (c.kind === 'branch') { // a branch ADDS to the part: it keeps everything it already does
    status = null;
    note = m ? 'KEEPS ' + MUTATIONS[m.id].name : null; noteColor = PAL.white;
  } else if (c.kind === 'replace') {
    status = rd.boss ? 'BOSS PICK' : 'TAKES ROOT'; note = 'SHEDS ' + MUTATIONS[m.id].name; noteColor = COST_COLOR;
  } else if (c.kind === 'swap') {
    status = 'BOSS PICK'; note = 'SHEDS ' + MUTATIONS[m.id].name; noteColor = COST_COLOR;
    if (!m.starter) status += ' LV ' + inheritedLevel(m);
  } else if (c.kind === 'meta') {
    status = 'METAMORPHOSIS LV ' + inheritedLevel(m);
    if (rd.requires) { note = 'FED BY ' + rd.requires.label; noteColor = VIAL_COLOR; }
    else note = 'SHEDS ' + MUTATIONS[m.id].name;
  } else {
    status = rd.boss ? 'BOSS PICK' : 'NEW PART';
    note = `TAKES A ${LOC_NAME[loc]} SLOT`;
  }
  // What the set count would be after taking it.
  const counts = setCounts(p), set = setOf(gid);
  const was = m && !m.starter && setOf(m.id);
  if (was) counts[was]--;
  const after = set ? (counts[set] || 0) + 1 : 0;
  return {
    id: gid, name: d.name, rarity: d.rarity, costCard: d.costShort, desc: grown.length > 1 ? grown.map(id => MUTATIONS[id].name + ': ' + cardText(MUTATIONS[id])).join(' ') : d.desc, short: cardText(d), cost: d.cost, shed: c.kind !== 'branch' && m && !m.starter ? m : null, malignant: !!d.malignant, cures: !!d.cures, set,
    slot: loc, kind: c.kind, status, note, noteColor, setAfter: after, size: rootSize(c.id), grown,
    tier: c.kind === 'branch' && m ? m.path.length : grown.length - 1, overlays: mutOverlays(gid), stirs: wouldSplice(p, c), from: c.kind === 'branch' && m ? m.id : null,
  };
}

// --- The Ultimate Metamorphosis ------------------------------------------------------
// Five fully grown parts: your next cocoon is the last one. You become your
// final form: +25% damage, +2 max health, a little faster, a passive for every
// set your parts belong to (stronger the more parts share it), and your parts
// can keep leveling past the max (OVERGROWTH) for the rest of the run.
const fullyGrown = m => !m.starter && !childrenOf(m.id).length;
function apexReady(p) {
  return !p.apex && LOCS.every(loc => partsAt(p, loc).length >= LOC_MAX[loc]) && p.parts.every(fullyGrown);
}
function checkApex(p) {
  if (!apexReady(p) || game.pendingEvolutions.some(e => e.apex)) return;
  game.pendingEvolutions.push({ apex: true, title: 'ULTIMATE METAMORPHOSIS' });
  whisper('Every part of you is finished. One last change is coming.');
}
// What each set gives a final form, given how many of your parts belong to it.
const APEX_PASSIVES = {
  HIVE: 'A SWARM HATCHES AROUND YOU', BONE: 'BONE SHARDS BURST FROM YOU', FUNGAL: 'YOU TRAIL TOXIC SPORES',
  PREDATOR: 'KILLS FEED YOU AND SPEED YOU UP', ABOMINATION: 'TENDRILS LASH OUT ON THEIR OWN',
};
function apexPassives(p) { return setCounts(p); }
function becomeApex(p) {
  p.apex = true;
  recomputeStats(p);
  p.hp = p.maxHp;
  const sets = Object.keys(apexPassives(p));
  game.banner = { text: 'ULTIMATE METAMORPHOSIS', sub: sets.map(k => APEX_PASSIVES[k]).slice(0, 2).join(' - ') || 'YOU ARE FINISHED', color: '#ffd070', t: 4 };
  whisper('There is nothing left of the specimen. There is only you.');
  bloodSpray(p.x, p.y, 0, 0, 40, FLUID.blood, 160);
  gibs(p.x, p.y, 12, ['#c8b4a0', '#a8907e', '#5e2229', '#ffd070'], FLUID.blood);
  burst(p.x, p.y, '#ffd070', 40, 150, 1);
  game.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 4, max: 70, t: 0.6 });
  game.shake = Math.max(game.shake, 8);
  Sfx.play('splice'); Sfx.play('secondHeart');
}

// --- Level-ups --------------------------------------------------------------------
// A biomass level-up: mostly "+1 level" for your parts, plus a new part when
// you have room (always a mouth / limbs while you have none), and a
// metamorphosis now and then for a fully grown part at max level.
function rollLevelUps(p, n) {
  const weight = c => RARITY[MUTATIONS[c.id].rarity].weight * (MUTATIONS[c.id].malignant ? 0.7 : 1);
  const pickW = cs => { let t = 0; for (const c of cs) t += weight(c); let r = Math.random() * t; for (const c of cs) if ((r -= weight(c)) <= 0) return c; return cs[cs.length - 1]; };
  const all = bodyOffers(p), roots = all.filter(c => c.kind === 'root'), out = [];
  const takeRoot = loc => { const rs = roots.filter(c => (!loc || locOf(c.id) === loc) && !out.some(o => o.id === c.id)); if (rs.length) out.push({ id: pickW(rs).id, kind: 'root' }); };
  if (!partAt(p, 'MOUTH')) takeRoot('MOUTH');
  if (!partAt(p, 'LIMBS') && out.length < n) takeRoot('LIMBS');
  const levels = p.parts.filter(m => !m.starter && ((m.lvl || 0) < LEVEL_MAX || (p.apex && fullyGrown(m)))).sort(() => Math.random() - 0.5).map(m => ({ id: m.id, kind: 'level', part: m }));
  if (!out.length && roots.length) takeRoot(); // room for one more part: one card offers it
  for (const c of levels) { if (out.length >= n) break; out.push(c); }
  while (out.length < n && roots.length > out.filter(c => c.kind === 'root').length) { const k = out.length; takeRoot(); if (out.length === k) break; }
  const metas = all.filter(c => c.kind === 'meta');
  if (out.length < n && metas.length) { const c = metas[Math.floor(Math.random() * metas.length)]; out.push({ id: c.id, kind: 'meta', shed: c.shed }); }
  if (!out.length) out.push({ id: '_gorge' });
  return out.sort(() => Math.random() - 0.5);
}

// --- Applying a choice ------------------------------------------------------------
function applyChoice(p, c) {
  if (c.id === '_gorge') { p.hp = Math.min(p.maxHp, p.hp + HP_PER_HEART); return; }
  if (c.kind === 'level') { // a part grows a level; at the max, it evolves
    const m = c.part, d = MUTATIONS[m.id];
    m.lvl = (m.lvl || 0) + 1;
    floatText(p.x, p.y - 14, d.name.toUpperCase() + ' LV ' + m.lvl, VIAL_COLOR);
    if (m.lvl >= LEVEL_MAX && childrenOf(m.id).length) {
      m.lvl = 0;
      game.pendingEvolutions.unshift({ evolve: m, title: 'EVOLUTION', color: d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color });
      floatText(p.x, p.y - 22, 'IT IS READY TO CHANGE', PAL.red);
    }
    burst(p.x, p.y, VIAL_COLOR, 10, 60, 0.4);
    Sfx.play('absorb');
    recomputeStats(p);
    checkApex(p);
    return;
  }
  c = resolveCard(p, c);
  p.evolutions++;
  let d = MUTATIONS[c.id], gid = c.id; // gid: the node you end up with
  if (c.kind === 'branch') {
    const m = c.part || partFor(p, c.id);
    m.path.push(c.id);
    m.id = c.id;
    m.lvl = 0; // evolving starts its levels over
  } else {
    const old = c.shed, part = newPart(c.id), at = old ? p.parts.indexOf(old) : -1;
    if (old && !old.starter) {
      // A replacement is never a step back: it arrives as evolved as the part
      // it replaces (see swapPath), and a level up (see inheritedLevel).
      part.path = swapPath(c.id, old); part.id = gid = part.path[part.path.length - 1];
      part.lvl = inheritedLevel(old);
      for (const id of part.path.slice(0, -1)) if (MUTATIONS[id].onGain) MUTATIONS[id].onGain(p);
      d = MUTATIONS[gid];
    }
    if (old) bloodSpray(p.x, p.y, 0, 0, 14, FLUID.blood, 90); // the old part tears out
    if (old && !old.starter) { // Metamorphosis: the grown path sloughs off; something rarer takes root
      game.banner = { text: c.kind === 'swap' ? 'BOSS PICK' : 'METAMORPHOSIS', sub: MUTATIONS[old.id].name + ' > ' + d.name, color: RARITY[d.rarity].color, t: 2.6 };
      gibs(p.x, p.y, 6, ['#a8534f', '#5e2229', '#d9cfa0'], FLUID.blood);
      game.shake = Math.max(game.shake, 4);
    }
    if (at >= 0) p.parts.splice(at, 1, part); else p.parts.push(part);
  }
  whisper(HINTS[gid], d.name, d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color); // what it feels like as it grows in
  p.lastSet = setOf(gid);
  if (d.onGain) d.onGain(p);
  const col = d.malignant ? MALIGNANT_COLOR : RARITY[d.rarity].color;
  floatText(p.x, p.y - 14, d.name.toUpperCase(), col);
  if (c.kind === 'branch' && d.from && !childrenOf(gid).length) {
    // A path reaches its end form.
    game.banner = { text: 'FULLY GROWN', sub: d.name + ' - YOU GROW STRONGER', color: col, t: 2.2 };
    burst(p.x, p.y, col, 24, 110, 0.7);
    game.shake = Math.max(game.shake, 3);
    Sfx.play('splice');
  } else {
    Sfx.play('absorb');
  }
  recomputeStats(p);
  checkApex(p);
}
