# Packbound

**You are the Wildcaller. You do not fight. You conduct.**

Packbound is a top-down action RPG for the browser, in the spirit of Diablo II: Resurrected. New Hunt asks which calling you are. The Wildcaller is the summoner Druid: Thornlash marks, Wereclaw lets you step into the bite, and a full pack feeds Spirit back into the whip. The Gravecaller is a necromancer: Bone Spear curses a line and the dead answer it. The Stormbinder is a sorceress: Fireball is the weapon, and hydra ranks feed it. The Oathbound is a paladin: Zeal is a heavy close swing, the bulwark is the wall, and the oath is a short line, not a horde. The Skymark is an amazon: Lightning Fury pierces and forks, and a valkyrie holds the line. The Warbound is a barbarian: Whirlwind hits the whole ring and frenzy makes the next spin heavier. Each calling has its own pack, skill trees and fusions, and walks into the wood with that pack. Grove sets and rune words follow that calling's hunters. A class chase drops only for that calling: Moonclaw Pelt, Marrow Wand, Eye of the Gale, Hand of the Oath, Thunderstroke, Grimspire. Everything (art, sound, music) is drawn and synthesized in the browser; there are no asset files and no network calls.

## How to play

1. Double-click `index.html`. It runs in Chrome straight from the disk (`file://`), with no server and no install.
2. Click once to wake the pack (browsers start audio only after a click), pick a calling, then **New Hunt**.
3. You arrive at **Hearthgrove**, the camp. Press **Hunt**, pick **The Mirewood** and survive five waves and the boss.
4. Call your pack with **1–5**, aim them with the right mouse button, and keep out of the red telegraphs. **Z** drinks a life flask, **X** drinks a spirit flask, **B** drinks a Moonflask. A heavy hit staggers your step until you drink.
5. Between hunts, evolve summons (Pack), fuse two Tier II summons at the **Fusion Altar**, equip loot and spend skill points.
6. Elites, the quarry and bosses drop **Grove Runes** into a pouch (they do not fill the bag). At camp, open the **Hearth Cube**. Three of a rune become the next. One breaks into two of the previous. Socket them in order. A finished word changes how the pack fights. Three magic pieces of one slot become a rare. A Moonstone recuts a rare.
7. Each wave grows a **grove shrine**. Walk into it. Combat, Moon and Den help. Greed drops better and you bruise. A red **Monster Shrine** turns the wood, and the next kill pays a rune. At camp, **Gamble** spends 6 Dust on a magic, rare, set or unique. Never a plain piece. The roll follows the deepest wood you have opened, and the Moon.
8. Magic and better loot hits the ground **unread**. The beam is the color. **N** spends a tome to read the best one in the bag. Elites drop tomes. Camp reads the whole bag for free. **Grove Charms** and **Moon Charms** go on the charm board in the inventory (eight cells). They count in the fight. A Moon Charm takes two cells and adds one rank to a skill you have already taken.
9. **H** opens a hearth gate. Stand still. A step or a shove cancels it. Camp is on the other side, and the wood is frozen where you left it. The **chest** holds 40 more pieces. Nothing in the chest counts while you fight. Walk back into the ring to return. Each boss keeps a list of named prizes. The first one you pick up from that boss was promised. Later kills still leave one about a third of the time.

A fall ("The pack scatters") costs only the zone attempt: you keep every level, item and summon. Clearing a zone
unlocks the next; after the fifth, **Moon tiers** raise the difficulty and the loot.

## Controls

| Input | Action |
|---|---|
| WASD | Move (druid, or the possessed summon) |
| Mouse | Aim / cursor |
| LMB (hold) | Your attack: Thornlash, Bone Spear, Fireball, or Zeal · in menus: select |
| RMB click enemy | **Focus** |
| RMB click ground | **Hold** |
| RMB drag | **Scent Trail** |
| 1 2 3 4 5 | Summon your calling's five hunters (the planted one roots at the cursor) |
| Shift + 1–5 | Dismiss one of that type (50% Spirit refund) |
| Q | Howl |
| R | Rally |
| F | Frenzy |
| C | Encircle (at cursor) |
| G | Heel toggle |
| Space | Bound (dodge) |
| Z | Drink a life flask |
| X | Drink a spirit flask (the blue orb: Spirit, Mana, or Faith) |
| B | Drink a Moonflask (fills both, and ends a stagger) |
| N | Read the best unread item (spends a tome; camp reads the bag for free) |
| H | Hearth gate: stand still, and the wood waits while you are at camp |
| Tab | Skinwalk (target under cursor or nearest) / exit |
| V | Wild Hunt (when Chorus is full) |
| T | Interact: open the Fusion Altar at a Fusion Shrine (loot is picked up by walking over it) |
| Alt (hold) | Show every loot name on screen (near drops are always named) |
| I | Inventory |
| K | Skill tree |
| J | Pack (roster, evolve, scars, diet) |
| Esc / P | Pause + help (controls list); Esc first closes an open menu |
| M | Mute |

The help screen (Esc) lists the same bindings, generated from the live key map, plus a synergy cheat sheet and the settings.
Every key above can be changed in **Settings → Key bindings** (middle and side mouse buttons count as keys; Esc, Shift, left and right click stay fixed); the map is kept in this browser (`packbound.keys.v1`), apart from the save.

## Core ideas

- **Commands, not clicks.** Focus a target, Hold a circle, paint a Scent Trail with a right-drag, Rally, Encircle, Frenzy, Howl, Heel.
- **Individuals.** Every summon has a name, a level, deeds and up to three scars. A fallen summon rests in the Den and comes back; nobody is replaced.
- **Synergies.** Ravens Mark, wolves crit Marked prey, bears maul Rooted foes. Three different summon types hitting one target within a second ring a **Chorus**.
- **Evolve and fuse.** Each type has two branches (Tier II at level 5, Tier III at level 12, infused by what it eats). Two Tier II summons plus Moonstones fuse. Each calling has its own ten crosses and five alphas.
- **Loot rewrites behavior.** Green affixes change what the pack *does* (Leaping wolves, Grafted vines, a Hivemind life pool); uniques bend the rules.
- **Become the pack.** Tab Skinwalks into a summon; V calls the **Wild Hunt** when the Chorus moon is full, and every summon you ever raised, including the Echoes you enshrined, stampedes across the screen.

## Features

- Five zones with their own enemy families, palettes and bosses (two phases each), waves from all four edges, elites with modifiers, a Lull between waves and a Fusion Shrine from wave 4.
- 24 behavior affixes, 13 stat affixes, 8 uniques; each calling has its own skill trees, with free respec at camp.
- Canvas UI: Title, Hearthgrove (roster by the fire, zone map, Moon Shrine, Hearth Cube), HUD (orbs, summon bar, command cooldown sweeps, Chorus moon, pack list, boss bar, off-screen arrows), Inventory, Pack, Skill tree, Fusion Altar with a Codex, Pause/Help/Settings, Victory and Game Over.
- Grove Runes and the Hearth Cube: six runes in a pouch, sockets on the staff (two), mask, pelt and talisman, and five words (Wolfhowl, Briarwake, Crowmark, Oakheart, Hearthbond). A finished word replaces the loose rune stats. The two worn charm slots stay a behavior chase. The charm board is separate.
- The charm board: eight cells in the inventory. Grove Charms take one. Moon Charms take two and add one rank to a skill you already have a point in. Synergies stay on the points you spent. Magic and better drops are unread until a tome (N) or the hearth names them. A boss always leaves a charm. Trash does not.
- The hearth gate and the chest: H, then stand still. The wood freezes and you are at camp. The chest holds 40 pieces and none of them count in the fight. Walk back into the ring to return. Starting another wood closes the gate. Each boss keeps named prizes, listed on the right during the fight. The first one you carry home from that boss was promised. After that, about a third of the kills still leave one. Dying before you touch it does not spend the promise.
- Grove sets: twelve green pieces in four sets (First Howl, the Green Wreath, Hearth of the Hunt, and The Oath, which only an Oathbound can find). Two pieces wake a bonus. Three pieces change the fight: a Den Mother who Marks, skirmishers that peck a rooted foe, a Chorus that heals the pack, or Zeal that curses. A set piece is not a rune base, so a rune word and a set on the same slot is a choice.
- Grove shrines: one stone a wave, named before you step in. Combat, Moon, Den, Greed, or a cursed Monster Shrine. A cleared wood keeps growing them while you stay.
- Hearth Gamble: 6 Dust for a magic, rare, set or unique at the level of the deepest wood you have opened. The bag still holds 40. A full bag refuses the roll.
- Hearth Belt: life flasks, spirit flasks and Moonflasks stack beside the life orb (8 / 8 / 4). They drop in the wood, a boss always leaves a Moonflask, and camp sells them for Dust. They never enter the bag. A heavy hit (about 8% of life or more) staggers your step until you drink. A full bar does not waste the flask. A full column leaves the beam on the ground.
- The Terror: after the first clear, one open wood each Moon is marked in red. Prey there has more life, hits harder, and comes in thicker, with champions in the pack. Item level, magic find and rune odds step up, and the boss leaves one more piece. At the hunt map, 4 Dust calls the Terror onto the next open wood for that Moon. The Terror also cuts every ward by 40, and that cut comes off before the cap of 75.
- The wards: each wood bites in an element (blight, flame, frost, spark). A hit with no ward gear deals the same total it always did; the elemental part is what your gear reduces, down to a quarter at 75. From Moon 2 an elite can be warded in its own element, and a Terror champion always is. The body you aim with the whip loses its ward. The spear's curse strips a line. Zeal strips the arc. The second whirlwind spin cracks the ring. Fire melts a frost ward, and a living monolith cracks flame. Lightning seams a spark ward for a third of the hit. The Cracked Moon, a Moon Totem any calling can find, lets a fifth of a warded hit through and sits your own wards 20 lower. Suffixes of Embers, Rime, the Spark, the Rot and of Warding are the chase.
- Named packs: an elite walks in with a name and up to two of that wave beside it, out of the same edge. Kill the named one and the others run. If the name was Hasted, they rage instead. The wave does not grow. Those two were already in it.
- The Slaughter: kills within 3.2 seconds climb a chain on the HUD. At 5 it pays. You and the pack hit harder, the pack moves and swings faster, and your own weapon comes back sooner. At 5, 10 and 15 the wood answers in the way of your calling: the pack bites now, corpses pop, a burn, a mend, sparks, or a freeze that feeds the next spin. A ripple cannot answer again on the same swing. Prey on one edge walks out of one gate, shoulder to shoulder. Gear of Slaughter adds its roll on every paying stack.
- The bite: your own hits can Crush a tough body (a chunk of its current life), Strike twice (Deadly Strike), and return life or Spirit. Zeal crushes. The claw and the fireball leech life. The spin and the javelin strike twice. The spear returns Essence. Gear of Crushing, of Striking, of the Vein and of the Well push the same numbers. The HUD names whatever you have.
- Readable crowds: a green ring under every summon and a red ring under every enemy; bodies that grow (Fenrir's giant wolf, elites) draw at their live size.
- Juice: hit-stop, trauma shake, damage numbers, particles, pawprints, a slow-motion boss death, WebAudio sounds for every event and generative music (a zone drone and a heartbeat that quickens with the pack and the fight).
- Graphics (Diablo-style night): every creature is hand-drawn in code at twice its screen size and lit: grain, a key
  light from above, warm rim highlights, a dark outline and glowing eyes. Each zone has its own darkness and fog,
  and its own weather: fireflies, rising embers, snow, rain with lightning, blight spores. The druid carries a light
  radius; spirits, braziers, lava cracks, blight veins and obelisk runes cast colored light. Plus additive spell
  glows, summon bursts, fusion flares, lightning branches, curling roots, spectral Hunt trails and dissolving deaths.
- Terrain: each zone's ground is a lit height field with its own materials (moss and puddles, cracked ash and lava,
  snow and ice, slate and flagstones, blighted soil and bones). The obstacles are props that stand in the depth sort
  with the bodies (gnarled trees under leafy crowns, faceted boulders, basalt columns, snowy pines, crags, ruined
  pillars, obelisks) and go see-through when the druid walks behind them. Hearthgrove is a lit clearing in the same woods.
- HUD: bronze-rimmed glass orbs with moving liquid, a carved stone bar, bronze-trimmed panels and a book serif typeface.
  Fixed-tick render interpolation, eased turns/camera/UI, breathing and attack/spawn squash smooth the action.
- **Esc → Settings → Quality: High / Low**, saved in localStorage. Low removes the lighting layer, glows,
  extra effects, hit sparks, infusion trails, Hunt afterimages and grass sway; particles cap at 1,250 and ground
  marks at 24 (High: 2,500 particles / 32 marks). While the Wild Hunt runs, its moon lights the whole field, so
  High drops the darkness, glows and sparks for those seconds.
- **Auto-drop** (Settings, on by default): about 4 seconds mostly below 45 FPS selects Low for this session only,
  with a toast. It never rises by itself; Settings → Quality turns High back on, and the next session starts with
  your saved choice. Turn Auto-drop off to keep Quality exactly as you set it.
- On a phone held upright the field is a strip at the top with the key numbers (wave, Life, Spirit, pack) in
  readable text underneath. The game needs a keyboard and mouse, so play it on a computer.
- A seeded, deterministic simulation at a fixed 60 Hz, separate from rendering.

## Saves

The character lives in this browser's localStorage under the key `packbound.save.v1`. It is stored at camp, on wave
clears, on victory or defeat and when the page closes, never mid-wave. A corrupt save is kept aside as
`packbound.save.v1.corrupt` and a new hunt begins. Clearing browser data erases the save, so use
**Settings → Export save** now and then (it shows a text string to copy) and **Import save** to bring it back.
Open `index.html?fresh=1` to start without the stored save (it is not deleted until you store a new one).
Quality and Auto-drop are stored separately under `packbound.graphics.v1`; they survive a new hunt or reload without changing
the character save format. An automatic drop is never stored. If storage is unavailable, the setting still works for the current session.

## Tests

```
python3 -m unittest discover -s tests          # all logic tests (node) + gate tests; browser tests skip
node tests/js/run.js [filter]                   # the JS logic suite alone
PB_PLAYTEST=1 python3 -m unittest tests.test_browser_shell      # real Chrome over file://: input, audio, save, perf scene
PB_PLAYTEST=1 python3 -m unittest tests.test_browser_playtest   # full gameplay + phone shot, two 62 s quality runs, an injected sag (~5 min)
python3 tools/playtest.py --graphics             # High and Low over file:// + injected sag; FPS/errors, .scratch/graphics/ shots
python3 tools/perf_check.py 30 80 2000          # frame-time check: 30 summons, 80 enemies, 2000 particles
```

Debug hooks exist only with `?test=1` (`window.PB_DEBUG`); `?perf=1&s=30&e=80&p=2000` opens the bench scene.

## Browser

The game targets Chrome (any recent Chromium). The Playwright tests use the bundled Chromium when it is installed and
otherwise fall back to `PB_CHROME`, then `/usr/bin/google-chrome`, `/usr/bin/chromium` or `/usr/bin/chromium-browser`.

## Files

```
index.html            the canvas and the one ordered list of scripts (no modules, no build step)
src/core/             RNG, fixed-step loop, spatial hash, event queue, math, input queue
src/data/             tables: summons, fusions, evolutions, affixes, items, skills, zones and bosses
src/sim/              the deterministic rules (no DOM): world, combat, commands, AI, bosses, director, loot, save
src/app/              input, sprites (flat creature art), rigs and sculpt (the 3D sculpts and their WebGL2 baker), terrain (ground, props, weather lights), render, juice, audio and music, the game loop
src/app/ui/           canvas screens: widgets, title, pause, hud, inventory, skilltree, pack, altar, camp, endscreens
tests/                Python unittest entry points; tests/js/ the node logic suite
tools/                playtest.py (scripted browser play), perf_check.py
screenshots/          screenshots from the last browser playtest
docs/superpowers/     the design spec and the build plan
```
