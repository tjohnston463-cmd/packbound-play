// Zones, enemies, bosses. Telegraph times are the warning window before damage lands (seconds).
(function (PB) {
  'use strict';
  PB.ENEMIES = {
    rotling:    { name: 'Rotling',       hp: 22,  dmg: 4,  speed: 120, r: 9,  xp: 4,  essence: 'rot',   ai: 'swarm' },
    bogshaman:  { name: 'Bog Shaman',    hp: 40,  dmg: 9,  speed: 80,  r: 11, xp: 9,  essence: 'rot',   ai: 'lobber', attack: { kind: 'circle', radius: 60, tele: 0.8, range: 320 } },
    mirebrute:  { name: 'Mire Brute',    hp: 140, dmg: 16, speed: 90,  r: 18, xp: 20, essence: 'stone', ai: 'charger', attack: { kind: 'line', width: 40, length: 260, tele: 0.9 } },
    cinderimp:  { name: 'Cinder Imp',    hp: 26,  dmg: 6,  speed: 170, r: 9,  xp: 6,  essence: 'ember', ai: 'swarm', onDeath: { kind: 'circle', radius: 55, tele: 0.6 } },
    asharcher:  { name: 'Ash Archer',    hp: 45,  dmg: 11, speed: 95,  r: 10, xp: 10, essence: 'ember', ai: 'archer', attack: { kind: 'line', width: 10, length: 420, tele: 0.7 } },
    kilngolem:  { name: 'Kiln Golem',    hp: 220, dmg: 22, speed: 70,  r: 22, xp: 30, essence: 'stone', ai: 'slammer', attack: { kind: 'circle', radius: 100, tele: 1.0, range: 60 } },
    icewraith:  { name: 'Ice Wraith',    hp: 50,  dmg: 9,  speed: 140, r: 10, xp: 12, essence: 'frost', ai: 'phaser' },
    frosttroll: { name: 'Frost Troll',   hp: 260, dmg: 24, speed: 85,  r: 21, xp: 32, essence: 'frost', ai: 'slammer', attack: { kind: 'ring', inner: 40, radius: 140, tele: 1.0, range: 70 } },
    rimespitter:{ name: 'Rime Spitter',  hp: 55,  dmg: 12, speed: 90,  r: 11, xp: 12, essence: 'frost', ai: 'lobber', attack: { kind: 'circle', radius: 70, tele: 0.8, range: 340 } },
    thunderram: { name: 'Thunder Ram',   hp: 180, dmg: 20, speed: 110, r: 17, xp: 26, essence: 'storm', ai: 'charger', attack: { kind: 'line', width: 46, length: 320, tele: 0.8 } },
    staticwisp: { name: 'Static Wisp',   hp: 40,  dmg: 10, speed: 160, r: 8,  xp: 10, essence: 'storm', ai: 'phaser' },
    harpy:      { name: 'Gale Harpy',    hp: 60,  dmg: 12, speed: 200, r: 11, xp: 14, essence: 'storm', ai: 'diver', attack: { kind: 'circle', radius: 50, tele: 0.6, range: 300 } },
    hollowman:  { name: 'Hollow Man',    hp: 120, dmg: 18, speed: 110, r: 13, xp: 22, essence: 'stone', ai: 'swarm' },
    severer:    { name: 'Severer',       hp: 90,  dmg: 14, speed: 120, r: 12, xp: 20, essence: 'stone', ai: 'archer', attack: { kind: 'tether', tele: 1.2, range: 300 } }
  };
  PB.BOSSES = {
    hollowstag: { name: 'The Hollow Stag', hp: 2400, dmg: 26, speed: 120, r: 34, xp: 400, essence: 'rot',
      attacks: [
        { id: 'antlersweep', kind: 'cone', angle: 120, radius: 170, tele: 0.9, cd: 4 },
        { id: 'stampede',    kind: 'line', width: 70, length: 700, tele: 1.1, cd: 9 },
        { id: 'calltherot',  kind: 'summon', enemy: 'rotling', count: 6, tele: 0.8, cd: 12 },
        { id: 'thornstorm',  kind: 'radial', spokes: 12, length: 420, tele: 1.0, cd: 8, phase: 2 }
      ] },
    cindermother: { name: 'Mother of Cinders', hp: 3600, dmg: 30, speed: 70, r: 32, xp: 650, essence: 'ember',
      attacks: [
        { id: 'pillars',  kind: 'circles', count: 5, radius: 70, tele: 1.0, cd: 5 },
        { id: 'meteors',  kind: 'circles', count: 12, radius: 55, tele: 1.4, cd: 11, phase: 2 },
        { id: 'brood',    kind: 'summon', enemy: 'cinderimp', count: 8, tele: 0.8, cd: 10 },
        { id: 'flamewave',kind: 'ring', inner: 0, radius: 260, tele: 1.2, cd: 9 }
      ] },
    palematriarch: { name: 'The Pale Matriarch', hp: 5200, dmg: 34, speed: 160, r: 30, xp: 950, essence: 'frost',
      attacks: [
        { id: 'thrall',   kind: 'thrall', tele: 2.0, cd: 10, text: 'Tethers a summon; unless you Rally before the tether completes, it turns hostile for 10s.' },
        { id: 'frostbreath', kind: 'cone', angle: 60, radius: 320, tele: 0.9, cd: 6 },
        { id: 'icelance', kind: 'line', width: 30, length: 600, tele: 0.7, cd: 4 },
        { id: 'whiteout', kind: 'ring', inner: 120, radius: 420, tele: 1.5, cd: 14, phase: 2 }
      ] },
    tempestroc: { name: 'Tempest Roc', hp: 7200, dmg: 38, speed: 240, r: 34, xp: 1400, essence: 'storm',
      attacks: [
        { id: 'divebomb', kind: 'circle', radius: 110, tele: 1.2, cd: 6, text: 'Shadow grows on the ground; the roc lands on it.' },
        { id: 'chainbolt',kind: 'chain', jumps: 5, tele: 0.6, cd: 5 },
        { id: 'stormcage',kind: 'ring', inner: 200, radius: 260, tele: 1.4, cd: 15, text: 'Lightning wall closes; stand inside.' },
        { id: 'galeforce',kind: 'push', tele: 0.8, cd: 9, phase: 2 }
      ] },
    unmaker: { name: 'The Unmaker', hp: 11000, dmg: 42, speed: 130, r: 36, xp: 2400, essence: 'stone',
      attacks: [
        { id: 'sever',    kind: 'sever', tele: 1.6, cd: 12, text: 'Expanding ring; summons outside the 3 glowing safe circles are stunned 3s and lose their link (commands ignored).' },
        { id: 'mimic',    kind: 'mimic', tele: 1.0, cd: 20, text: 'Copies your strongest fusion as a hostile shade for 15s.' },
        { id: 'grasp',    kind: 'circles', count: 7, radius: 60, tele: 0.9, cd: 6 },
        { id: 'unmaking', kind: 'cone', angle: 90, radius: 360, tele: 1.1, cd: 7, phase: 2 }
      ] }
  };
  PB.ZONES = [
    { id: 'mirewood',   name: 'The Mirewood',        palette: ['#1c2a1f', '#2b3d25', '#5c7a3a'], enemies: { rotling: 6, bogshaman: 2, mirebrute: 1 },              boss: 'hollowstag' },
    { id: 'emberfen',   name: 'Emberfen',            palette: ['#2a1a14', '#43251a', '#c2522a'], enemies: { cinderimp: 5, asharcher: 3, kilngolem: 1, rotling: 1 }, boss: 'cindermother' },
    { id: 'frostpine',  name: 'Frostpine Hollows',   palette: ['#18222c', '#26384a', '#9fc6de'], enemies: { icewraith: 3, frosttroll: 1, rimespitter: 3 },          boss: 'palematriarch' },
    { id: 'stormcrag',  name: 'Stormcrag',           palette: ['#1b1c2a', '#2e3150', '#e3d36b'], enemies: { thunderram: 1, staticwisp: 4, harpy: 3 },                boss: 'tempestroc' },
    { id: 'blightheart',name: 'The Blightheart',     palette: ['#160f18', '#2d1a30', '#9b5ac2'], enemies: { hollowman: 3, severer: 2, staticwisp: 1, frosttroll: 1 }, boss: 'unmaker' }
  ];
  PB.ELITE_MODS = [
    { id: 'shielded', name: 'Shielded', text: 'Absorbs the first 30% of max life' },
    { id: 'hasted',   name: 'Hasted',   text: '+40% move and attack speed' },
    { id: 'vampiric', name: 'Vampiric', text: 'Heals 20% of damage dealt' },
    { id: 'splitting',name: 'Splitting',text: 'Splits into 3 half-size copies on death' },
    { id: 'warded',   name: 'Warded',   text: 'Cannot be Marked or Rooted' },
    { id: 'packbane', name: 'Packbane', text: 'Deals double damage to summons' }
  ];
  PB.ESSENCES = ['rot', 'ember', 'frost', 'storm', 'stone'];
})(globalThis.PB = globalThis.PB || {});
