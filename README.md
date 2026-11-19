# Specimen 47

A pixel-art horror twin-stick roguelike. You're an escaped lab specimen: kill what hunts you, devour the corpses for biomass, and evolve into something worse.

## Play

Open `index.html` in a browser. There's no build step and nothing to install.

| Key | Action |
|---|---|
| WASD | Move |
| Mouse or arrow keys | Aim and shoot |
| Space / Shift | Dash (brief invulnerability; becomes a charge with some mutations) |
| Right click / E | Limb ability (every LIMBS root has one; Tentacles grapple, Grasping Hands grab and throw) |
| Esc on the cards / hold F | Put an evolution off, then evolve later in any cleared room |
| M / P | Mute / pause |
| J (title screen or paused) | Splice journal: every splice you've found, and hints for the rest (kept between runs) |

## How it works

- **Culture Blobs** divide once; the copy can't divide and carries no biomass.
- **Burst corpses.** Some kills leave a usable corpse (it glints pink). Walk into it to devour it (the biomass goes straight into you), or attack it from range until it bursts and collect the glowing globules of biomass that spill out. Spawnlings and drones never leave one, and rats often don't.
- **Visceral.** Kill something up close and its blood splashes onto you; it wears off as you walk, dripping as you go. Harder hits spurt more blood and tear chunks off enemies that fly, trail blood and splat against the walls; overkill bursts bodies apart; badly wounded enemies drip as they move. The stronger you get, the messier it gets.
- **Bosses.** Every floor ends in a boss, each with two phases (it changes at half health): the Mother Culture, the Thawing Colossus (ice spikes and frost breath; then it thaws and walks), Specimen Zero (acid mortars, charges, Gas Bloaters; then it ruptures), the Archive (spiraling bullet storms and Clone packs; then it rewrites itself), and the Director (sweeping lasers, volleys, security on call; then LOCKDOWN).
- **Threat rises.** Every floor, enemies attack more often, their shots fly faster, elites carry more affixes, and health and numbers grow. Past the Director the lab loops, deeper and harder.
- **Rare finds evolve.** Five parts never show up in the normal pool (Rat Incisors, Urchin Quills, Toad Gullet, Splitter Cells, Culture Jelly); they turn up only as a vial's wild card. Fully grown, each evolves once: Plague Teeth, Pincushion, Bullfrog, Runaway Mitosis, Digesting Jelly.
- **Every floor is its own place.**
  - **Cryo Wing** (icy): ice patches you slide on. Frostbitten shamble at you and shatter into chilling shards when they die; Cryo Crawlers skitter in and spray frost that slows you; Thawed Specimens wait in cryo jars until you come close.
  - **Bio-Weapons** (sickly): gas vents puff on a cycle. Plague Carriers leak acid; Gas Bloaters drift in, swell and burst; Gun Polyps are rooted turrets firing bursts.
  - **Gene Bank** (violet): mutagen pools heal enemies standing in them. Mimics look like corpses until you go to eat them; Chimeras switch between spitting and charging; Clones hunt in packs and get faster as their siblings die.
  - **Director's Wing** (sterile): security lasers blink on and off. Enforcers carry a riot plate (only their backs are soft); Hunter-Killers lock on with a red line, then dash through; Containment Handlers fire nets that pin you in place.
- **Born in a cell.** You wake sealed in a glass containment cell with one red vial. Eat it to choose your first weapon, and the glass shatters. The first room's weapon vial and floor 1's limbs vial sometimes hold a wild card: a rare find you'd normally have to get lucky for.
- **More ways to start.** Starting weapons: Bone Spike, Bile Spit, Mandibles, Tendrils, Proboscis, Barb Flinger (barbs stick, then rip out), Spore Sneeze (a blinding sneeze), Leech Spitter (bleeding leeches), Silk Spinner (lay sticky, cutting webs). Starting limbs: Spider Legs, Wings, Pseudopods, Burrowing Claws, Crab Legs (right-click: a crushing pincer), Haunches (right-click: leap and land with a shockwave).
- **You're fragile.** You start with 3 hearts, and every hit takes half a heart. Healing comes in halves too: heart pickups are usually half a heart (now and then a whole one), and descending a floor mends half a heart. Max health bonuses (boss cores, tough parts) still add whole hearts.
- **Evolve.** Biomass builds up while you fight. Once the room is clear, a full bar wraps you in a cocoon by itself; it splits and you choose 1 of 3 (a level for a part, or a new part). Never mid-fight. (Esc on the cards puts it off; hold F in any cleared room to evolve later.) Cards don't say what a mutation does; you learn by growing it.
- **Typed slots.** Your body has six slots in two groups, shown along the bottom of the screen: two WEAPON slots, and one each of LIMBS, HEAD, BACK and CORE. You start with the first WEAPON, LIMBS and HEAD slot open, all empty: you are born with no attack at all. Each devoured boss core opens the next slot, in order: CORE, then BACK, then a second WEAPON (the bar says which comes next). A finished body is six parts, each one earned: never zero weapons, never five. Each part still grows somewhere on the body:
  - **WEAPON: an attack.** The first room always holds a red WEAPON vial: your first evolution is choosing your first weapon, and it can't be put off. With the second WEAPON slot open, both weapons fire.
  - **LIMBS: how you move, plus a right-click ability.** One set at a time. You start limbless, as a slow, inching slug, and until you grow limbs every evolution offers some. Spider Legs skitter and spit webs, Wings fly (over crates and enemy acid) and beat a gust that blows enemies and their shots away, Tentacles grapple, Burrowing Claws dig and send out a stunning tremor, Pseudopods glide on slime and roll out a slime wave.
  - **HEAD: senses, plus an ability that fires by itself** (no button). One head. Extra Eyes mark the toughest prey in sight (it takes more damage from everything), Battering Skull headbutts whatever gets in your face, Night Eyes black out your light when something closes in (everything counts as in the dark), Parasite Brain mind-spikes the nearest enemy, Bloom bursts pollen when something gets close.
  - **BACK: what happens when you dash or get hurt.** One back.
  - **CORE: your engine.** Only grows from devoured boss cores.
- **You grow.** A fresh specimen is small; every part it grows fills it out, and the Ultimate Metamorphosis swells it bigger still. The hitbox grows a little with you. Some Abomination parts add **bulk** (Overgrown Heart, Writhing Mass, and Cancerous Growth as the tumor spreads): lopsided masses swell out of your body, each one +10% damage and a wider hitbox. Power, and more of you to hit.
- **Branching paths.** Each part grows one path, so no two runs end the same:
  - A free slot is offered new **roots**, one per kind of part you don't have yet.
  - A planted part **branches**: two ways to go, and taking one locks out the other. Usually both show up side by side, and the card says what you'd give up.
  - **Biomass levels your parts; it doesn't evolve them.** A biomass level-up offers "+1 level" for your parts (a small stat bump, shown on the card as "+DAMAGE +FIRE RATE", "+SPEED +DASH" and so on; ++ or +++ means a bigger jump), plus a new part when you have room. At level 3 a part evolves: you choose its branch, and its level starts over. Vials and boss cores still evolve directly. The pink dots on each panel are its level.
  - Root, then branch, then branch: four end forms per root. Branches mostly add interactions, not bigger numbers (Bone Spike > Bone Lance > Splinter: a spike that kills bursts into a ring of bone shards).
- **Sets.** Every mutation belongs to a set: Bone, Fungal, Hive, Predator or Abomination (shown on the card). Each part counts as the set of its current form, so a branch can switch it. 3 matching parts wake a set bonus; 5 wake a stronger one (Fungal: kills burst into spore clouds; Hive: kills hatch spiderlings...).
- **Body forms.** Once two of your parts share a set, your whole body reshapes into that set's creature: a skeletal Bone crawler, a mushroom-sprouting Fungal mass, a Hive insect, a hunched Predator beast, or a lopsided Abomination. Mutation parts still grow on top.
- **Cores.** CORE parts are only planted from devoured boss cores. Each floor's boss (or, on floors without one yet, the exit room's Warden) drops its still-beating core: eat it and you always gain +1 max health and your next slot opens; then choose a CORE part. Once planted, a CORE part grows from level-ups like any other part. New defensive CORE parts: **Bone Plates** (plates orbit you, block shots and burst into shrapnel when they break; they regrow every room; the Mirror Plates branch glazes them, so a plate that stops a shot throws it back, harder).
- **Armor hearts.** Every 30 kills grow a grey armor heart (up to 2). It takes a hit for you and doesn't come back.
- **The Ultimate Metamorphosis.** Fill all six slots with fully grown parts and your next cocoon is the last: a huge chrysalis that splits into your final form. It's bigger and glows, gets +25% damage, +2 max health and a little speed, and a passive for every set among your parts (stronger the more parts share it): HIVE hatches a swarm around you, BONE bursts shards from you, FUNGAL trails toxic spores, PREDATOR kills feed you and speed you up, ABOMINATION lashes out with tendrils on its own. From then on your parts keep leveling past the max (OVERGROWTH, smaller bumps), so level-ups never run dry.
- **Rare finds.** The strangest roots (the playstyle mouths, Tentacles and Parasite Brain) never come from level-ups: they turn up, rarely, in colored vials of their kind. On a full body, one takes the place of your least-grown part of the same kind (the card says which). Together with big splices, they're where the late-game power fantasy comes from.
- **Mandibles** bite hard and fast up close: a bite lunges you onto prey just out of reach (untouchable for the instant of the snap), and whatever you bite reels for a moment, unable to move, shoot or hurt you.
- **Playstyle mouths** (boss picks). Some MOUTH roots don't shoot at all: Ovipositor (larvae that infest hosts and burst out), Miasma (a toxic aura; hold fire to vent it), Howl (no damage, but it hurls enemies into walls and each other), Polyp Seeder (plant turret polyps) and Frog Tongue (hold fire to coil it, release to lash: small prey is swallowed whole; tap to spit it back).
- **Power is earned.** A fresh body hits at 70% strength. Every fully grown part and every splice adds +6%, so a finished body ends up far stronger than it started.
- **Splices.** Certain pairs of parts fuse when you grow both (Spore Fire + Crop Duster = Firestorm: your flying spore trail burns). The two fuse into something new. **Big splices** need both halves fully grown, and they change how you fight: Dive Bomb (Mandibles + Wings: your dash lands in a swooping bite), Bone Cannon (Bone Spike + Battering Skull: your headbutt fires a bone lance), Venom Barrage (two mouths: Bone Spike + Bile Spit), Brood Howl, Silk Nursery, Seismic Howl, Toxic Bloom, Blood Gulp, Bile Garden, Battering Ram. They're never named in advance; a card that would complete one just says SOMETHING STIRS.
- **Rarity.** Mutations are Common, Uncommon, Rare or Legendary. Rare ones get likelier on deeper floors.
- **Malignant mutations** (purple cards) are extra strong with a hidden cost. Most have a branch that cures them, and a sibling branch that doubles down.
- **Colored vials** (dropped by elites and found in vaults) give a free evolution of one kind of part: red WEAPON, blue LIMBS, yellow HEAD, bone-white BACK (Uncommon or better). A vault's color shows on the minimap and glints through its seal; floor 1's vault holds LIMBS. If nothing of that kind can grow, you get a mixed roll instead.
- **Parasite Brain** sometimes takes control of your body, but it needs you alive: it steers clear of enemies, bosses and enemy acid, and at 1 health it won't take over.
- **Bodies look and feel different.** Wings fly higher the faster you go and glide with wings spread; hops squash and stretch and land with a thump; tentacles grip the floor and step like the spider legs; pseudopods reach ahead and flow after; every limb has its own footprints and sounds. Body forms have their own ambience (a predator's eye-shine in the dark, glowing fungal spots, hive flies, bone dust, falling leaves, blinking extra eyes), a full set glows, and splices leave a stitched seam.
- Clear the farthest room on each floor to open the hatch down. Step in and anything you left behind (the boss's core, vials, loose biomass) comes down with you. Its door is a toothed, red-glowing maw marked BOSS (or WARDEN); the first time, walking into it stops you at the threshold, and you keep walking to go in.

## Where to tweak things

| File | What's in it |
|---|---|
| `src/mutations.js` | The mutation tree (roots and branches per body location), open slots, whispers, rarities and card rolling. Start here. |
| `src/abilities.js` | Mechanics behind the fancier mutations: allies, spore clouds, decoys, slime, burrowing, grabbing, the right-click abilities and the automatic head abilities (ACTIVES) |
| `src/dna.js` | Corpses, bursting, biomass amounts and the level curve (biomass is called `dna` in the code) |
| `src/floors.js` | Each floor's name, enemy mix, hazard and boss |
| `src/bosses.js` | Bosses, telegraphed attacks, floor-specific enemy behaviors, elite affixes |
| `src/enemies.js` | Enemy stats (`ENEMY_TYPES`) and how each one acts (`ENEMY_BEHAVIOR`: `update`, plus optional `onDeath` / `onHurt`). A new enemy is one row in each, plus a sprite. |
| `src/status.js` | Status effects (`STATUS`): bleed, stun, slow, web, blind, mark, corrode, pollen, leak, acid mark, chill, net. Apply with `inflict(target, 'bleed', { t: 3, dps: 2 })`, ask with `hasStatus()`. A part makes an attack apply one with `onHit(s, 'lash', 'bleed', { t: 3, dps: 2 })` in its `apply()`. |
| `src/player.js` | Movement, shooting, dash/charge, bite, tentacles, shield |
| `src/music.js` | Procedural music: chords, tempo, combat layer |
| `src/sprites.js` | All sprites, painted from shaded shapes (blobs, tubes, eyes). Tweak the numbers to reshape a creature. |
| `src/paint.js` | The pixel painter: shading, outlines, and the color ramps (`RAMPS`) |
| `src/world.js` | Room obstacle layouts, floor generation, old bloodstains |
| `src/gore.js` | Blood spray, gibs, floor stains, corpses |
| `src/lighting.js` | Darkness, dithered lights, flickering, low-HP pulse |
| `src/ui.js` | HUD, evolution cards, title and game-over screens |

## Testing

`tests/test.html` loads the real game and forces through scenarios (the tree, every end form, boss phase and affix, plus full bot runs to floor 5), printing `OK` / `FAIL` lines. Run it after changes:

```powershell
powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
```

It uses headless Microsoft Edge, takes a minute or two, and exits with code 1 if anything fails. You can also just open `tests/test.html` in a browser and read the page.

**Parts explorer.** Open `tools/parts.html` in a browser to browse every body part's evolution tree (per location, plus splices), search them, and click one to see what it actually does: its stat changes, weapons, on-hit statuses and abilities at each growth level, computed live by the game's own code. Link straight to a part with its id, e.g. `tools/parts.html#venomspike`.

## Version control

The project is a git repository. Commit after each working change (`git add -A`, then `git commit -m "what changed"`), so any mistake can be undone with `git restore <file>` or by checking out an earlier commit.

## Sharing

- **itch.io**: zip the folder, create a new project with kind "HTML", upload the zip, and tick "This file will be played in the browser".
- **GitHub Pages**: push the folder to a repo and enable Pages.

# License
MIT License

# AI Notice
Developed with the assistance of Claude