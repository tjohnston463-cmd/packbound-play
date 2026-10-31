// Six callings. The Wildcaller (druid) is the original hunt: the whip, and a pack that feeds it.
// The Gravecaller, the Stormbinder, the Oathbound, the Skymark and the Warbound share the wood, the loot,
// the Moon and the altar, and they do not share a pack or a basic attack.
// A calling's hunters carry a role (wolf, raven, bear, vine, spirit) so grove sets, rune words and
// the synergy rules follow the job, not only the druid's animals. Old saves have no classId and load as druid.
(function (PB) {
  'use strict';

  function copy(o) { var out = {}; for (var k in o) out[k] = o[k]; return out; }

  PB.CLASS_PAINT = PB.CLASS_PAINT || {};
  function paint(id, family, pal, eye, extra) {
    PB.CLASS_PAINT[id] = { family: family, pal: pal, eye: eye || null, extra: extra || null };
  }

  var BONE = ['#d9d3c4', '#6a6458', '#f4efe2'];
  var GRAVE = ['#8a7aa8', '#3a3050', '#e4d4ff'];
  var STORM = ['#6a78c8', '#242848', '#f5e46a'];
  var ASH = ['#c45a28', '#5a240e', '#ffd090'];
  var ICE = ['#b9d4ea', '#5a7e98', '#f4fbff'];
  var OATH = ['#e6d7a8', '#6a5a32', '#fff6d4'];
  var SKY = ['#6a8ab0', '#2a3a52', '#e6c56a'];
  var WAR = ['#a85038', '#4a2018', '#ffd0a0'];

  function summon(def) {
    PB.SUMMONS[def.id] = def;
    if (def.paint) paint(def.id, def.paint[0], def.paint[1], def.paint[2], def.paint[3]);
  }

  // --- Gravecaller: a larger, cheaper army. You pierce and curse. They do the biting. ---
  summon({ id: 'skeleton', name: 'Skeleton', key: '1', cost: 10, cap: 6, hp: 44, dmg: [5, 8], atk: 0.72, range: 26, speed: 215, r: 10, mass: 0.9, tags: ['skeleton'], ai: 'flank', role: 'wolf',
    capBehavior: 'deadrise', capMult: 2, costBehavior: 'deadrise', costMul: 0.5, fades: true,
    note: 'cheap melee. Crits Marked prey. The spear calls them onto the cursed body.',
    paint: ['husk', BONE, '#9fd8ff', null] });
  summon({ id: 'mage', name: 'Bone Mage', key: '2', cost: 12, cap: 4, hp: 26, dmg: [7, 11], atk: 1.05, range: 160, speed: 200, r: 9, mass: 0.6, tags: ['mage'], ai: 'dart', flying: true, role: 'raven',
    note: 'stands off and Marks. A Marked death is the curse spreading.',
    paint: ['robed', GRAVE, '#d0b0ff', null] });
  summon({ id: 'golem', name: 'Clay Golem', key: '3', cost: 46, cap: 1, hp: 380, dmg: [14, 20], atk: 1.55, range: 34, speed: 125, r: 22, mass: 5, tags: ['golem'], ai: 'guard', role: 'bear',
    note: 'the wall. Taunts. Mauls knock back. A second golem is a skill.',
    paint: ['slab', ['#8a7048', '#4a3820', '#e0c090'], '#ffb060', null] });
  summon({ id: 'spike', name: 'Grave Spike', key: '4', cost: 16, cap: 3, hp: 70, dmg: [5, 8], atk: 3.4, range: 150, speed: 0, r: 13, mass: 99, tags: ['spike'], ai: 'rooted', rooted: true, role: 'vine',
    note: 'planted at the cursor. Grabs and poisons.',
    paint: ['vine', ['#6a5a78', '#2e2438', '#c8b0e0'], '#e0c0ff', null] });
  summon({ id: 'priest', name: 'Grave Priest', key: '5', cost: 26, cap: 1, hp: 55, dmg: [0, 0], atk: 0, range: 210, speed: 190, r: 10, mass: 0.5, tags: ['priest'], ai: 'aura', flying: true, role: 'spirit',
    aura: { radius: 210, regen: 2.5, dmgInc: 0.08 },
    note: 'aura: the army mends, and hits a little harder.',
    paint: ['spirit', ['#c8b8e8', '#6a5888', '#f4e8ff'], '#f4e8ff', 'halo'] });

  // --- Stormbinder: you are the damage. The elementals mark, root, tank and feed the blast. ---
  summon({ id: 'ember', name: 'Ember Hound', key: '1', cost: 16, cap: 3, hp: 52, dmg: [8, 12], atk: 0.7, range: 26, speed: 245, r: 11, mass: 1, tags: ['ember'], ai: 'flank', role: 'wolf',
    note: 'a short pack of fire. Crits Marked prey. Cataclysm calls them in.',
    paint: ['wolf', ASH, '#ffd090', 'sparks'] });
  summon({ id: 'wisp', name: 'Storm Wisp', key: '2', cost: 10, cap: 5, hp: 18, dmg: [4, 7], atk: 0.55, range: 20, speed: 320, r: 7, mass: 0.3, tags: ['wisp'], ai: 'dart', flying: true, role: 'raven',
    note: 'orbits you, dives, Marks.',
    paint: ['wisp', ['#f0e68a', '#a89830', '#ffffff'], '#ffffff', null] });
  summon({ id: 'monolith', name: 'Frost Monolith', key: '3', cost: 40, cap: 1, hp: 260, dmg: [12, 18], atk: 1.45, range: 34, speed: 140, r: 20, mass: 4.2, tags: ['monolith'], ai: 'guard', role: 'bear',
    note: 'stands between you and the wood. Chill and Rime live on its maul.',
    paint: ['bear', ICE, '#e8f6ff', 'frost'] });
  summon({ id: 'hydra', name: 'Hydra', key: '4', cost: 24, cap: 2, hp: 96, dmg: [9, 14], atk: 2.1, range: 180, speed: 0, r: 14, mass: 99, tags: ['hydra'], ai: 'rooted', rooted: true, role: 'vine',
    note: 'planted at the cursor. Spits fire. Ranks feed the fireball.',
    paint: ['vine', ASH, '#ffb060', 'flames'] });
  summon({ id: 'nimbus', name: 'Nimbus', key: '5', cost: 28, cap: 1, hp: 42, dmg: [0, 0], atk: 0, range: 200, speed: 210, r: 10, mass: 0.5, tags: ['nimbus'], ai: 'aura', flying: true, role: 'spirit',
    aura: { radius: 200, regen: 1.2, dmgInc: 0.16 },
    note: 'aura: the elementals hit harder. Little mending. You are the heal.',
    paint: ['spirit', STORM, '#fff6c0', null] });

  // --- Oathbound: you stand in the fight. A short oath holds the line. Zeal is the weapon. ---
  summon({ id: 'squire', name: 'Squire', key: '1', cost: 22, cap: 2, hp: 96, dmg: [10, 15], atk: 0.85, range: 28, speed: 200, r: 12, mass: 1.3, tags: ['squire'], ai: 'flank', role: 'wolf',
    note: 'a short line. Crits Marked prey. Zeal calls them in.',
    paint: ['wolf', ['#c8b48a', '#6a5430', '#f4e6c0'], '#ffe9a0', null] });
  summon({ id: 'judicar', name: 'Judicar', key: '2', cost: 16, cap: 2, hp: 36, dmg: [8, 12], atk: 0.9, range: 170, speed: 230, r: 9, mass: 0.5, tags: ['judicar'], ai: 'dart', flying: true, role: 'raven',
    note: 'a hammer that orbits and Marks.',
    paint: ['raven', ['#d8c48a', '#7a6840', '#fff6d0'], '#fff6c0', null] });
  summon({ id: 'bulwark', name: 'Bulwark', key: '3', cost: 48, cap: 1, hp: 440, dmg: [16, 24], atk: 1.5, range: 34, speed: 118, r: 22, mass: 5.2, tags: ['bulwark'], ai: 'guard', role: 'bear',
    note: 'the shield. Taunts. Mauls knock back. You stand beside it.',
    paint: ['bear', ['#d8d0c0', '#6a6458', '#fff8e8'], '#ffe9a0', 'halo'] });
  summon({ id: 'sanctum', name: 'Sanctum', key: '4', cost: 20, cap: 2, hp: 96, dmg: [4, 7], atk: 2.8, range: 140, speed: 0, r: 14, mass: 99, tags: ['sanctum'], ai: 'rooted', rooted: true, role: 'vine',
    note: 'planted at the cursor. Consecrated ground. Holds.',
    paint: ['vine', ['#c8b070', '#6a5428', '#fff0c0'], '#ffe9a0', 'flower'] });
  summon({ id: 'banner', name: 'Banner', key: '5', cost: 30, cap: 1, hp: 64, dmg: [0, 0], atk: 0, range: 200, speed: 175, r: 11, mass: 0.6, tags: ['banner'], ai: 'aura', flying: true, role: 'spirit',
    aura: { radius: 200, regen: 2.2, dmgInc: 0.12 },
    note: 'aura: the oath hits harder and mends a little.',
    paint: ['spirit', OATH, '#fff6c0', 'halo'] });

  // --- Skymark: you throw. The javelin forks. A short war party holds the line. The valkyrie is the wall. ---
  summon({ id: 'sister', name: 'Spear Sister', key: '1', cost: 22, cap: 2, hp: 90, dmg: [10, 15], atk: 0.8, range: 30, speed: 220, r: 12, mass: 1.2, tags: ['sister'], ai: 'flank', role: 'wolf',
    note: 'a pair, not a horde. Crits Marked prey. The javelin calls them in.',
    paint: ['wolf', ['#c8a878', '#5a4030', '#f4e6c0'], '#9fd8ff', null] });
  summon({ id: 'hawk', name: 'Hawk', key: '2', cost: 12, cap: 3, hp: 22, dmg: [6, 10], atk: 0.7, range: 170, speed: 280, r: 8, mass: 0.35, tags: ['hawk'], ai: 'dart', flying: true, role: 'raven',
    note: 'a hawk that marks from above.',
    paint: ['raven', SKY, '#e8f4ff', null] });
  summon({ id: 'valk', name: 'Valkyrie', key: '3', cost: 46, cap: 1, hp: 360, dmg: [14, 22], atk: 1.4, range: 34, speed: 145, r: 18, mass: 3.6, tags: ['valk'], ai: 'guard', role: 'bear',
    note: 'one spear-maiden. Taunts. Mauls knock back. You throw from behind her.',
    paint: ['bear', ['#d8d4c8', '#6a6458', '#fff6d4'], '#9fd8ff', 'halo'] });
  summon({ id: 'stake', name: 'Decoy Stake', key: '4', cost: 16, cap: 2, hp: 70, dmg: [3, 6], atk: 2.6, range: 130, speed: 0, r: 12, mass: 99, tags: ['stake'], ai: 'rooted', rooted: true, role: 'vine',
    note: 'planted at the cursor. The wood holds what you threw past.',
    paint: ['vine', ['#7a6848', '#3a2e1c', '#e6c56a'], '#9fd8ff', 'flower'] });
  summon({ id: 'gale', name: 'Gale', key: '5', cost: 26, cap: 1, hp: 40, dmg: [0, 0], atk: 0, range: 190, speed: 220, r: 10, mass: 0.4, tags: ['gale'], ai: 'aura', flying: true, role: 'spirit',
    aura: { radius: 190, regen: 1.4, dmgInc: 0.12 },
    note: 'aura: the war party hits harder. A little mending. You are the throw.',
    paint: ['spirit', SKY, '#e8f4ff', null] });

  // --- Warbound: you are the whirlwind. A short warband shouts with you. ---
  summon({ id: 'berzerk', name: 'Berserker', key: '1', cost: 24, cap: 2, hp: 110, dmg: [12, 18], atk: 0.75, range: 28, speed: 200, r: 13, mass: 1.5, tags: ['berzerk'], ai: 'flank', role: 'wolf',
    note: 'two axes, not a horde. Crits Marked prey. The spin calls them in.',
    paint: ['wolf', WAR, '#ffd0a0', null] });
  summon({ id: 'axe', name: 'Axe Thrower', key: '2', cost: 14, cap: 2, hp: 40, dmg: [8, 13], atk: 0.95, range: 160, speed: 210, r: 10, mass: 0.7, tags: ['axe'], ai: 'dart', flying: true, role: 'raven',
    note: 'a thrown axe that marks.',
    paint: ['raven', ['#8a9098', '#3a3e44', '#e8eef4'], '#ffd0a0', null] });
  summon({ id: 'warlord', name: 'Warlord', key: '3', cost: 50, cap: 1, hp: 460, dmg: [18, 26], atk: 1.45, range: 36, speed: 120, r: 22, mass: 5, tags: ['warlord'], ai: 'guard', role: 'bear',
    note: 'the champion. Taunts. Mauls knock back. You spin beside him.',
    paint: ['bear', ['#c06048', '#4a2018', '#ffd0a0'], '#ffb060', null] });
  summon({ id: 'wartotem', name: 'War Totem', key: '4', cost: 18, cap: 2, hp: 90, dmg: [4, 7], atk: 2.8, range: 130, speed: 0, r: 14, mass: 99, tags: ['wartotem'], ai: 'rooted', rooted: true, role: 'vine',
    note: 'planted at the cursor. The shout stays in the ground.',
    paint: ['vine', ['#6a5030', '#2e2418', '#e6c56a'], '#ffb060', null] });
  summon({ id: 'shout', name: 'Warcry', key: '5', cost: 28, cap: 1, hp: 60, dmg: [0, 0], atk: 0, range: 200, speed: 170, r: 11, mass: 0.6, tags: ['shout'], ai: 'aura', flying: true, role: 'spirit',
    aura: { radius: 200, regen: 1.6, dmgInc: 0.16 },
    note: 'aura: the warband hits harder. The shout is the heal.',
    paint: ['spirit', WAR, '#ffd090', null] });

  // Evolutions keep the druid branch mods (lunge, leap, mark, quake) under new names, so the same AI hooks fire.
  var EVO_NAME = {
    skeleton: { A: ['Reaver', 'Grave Reaver'], B: ['Shield Bone', 'Crypt Guard'] },
    mage: { A: ['Dirge', 'Omen Mage'], B: ['Shard', 'Storm Skull'] },
    golem: { A: ['Bulwark', 'Mountain Clay'], B: ['Ravager', 'Berserk Clay'] },
    spike: { A: ['Strangler', 'Devourer'], B: ['Bloom', 'Mother Grave'] },
    priest: { A: ['Oak Ash', 'Elder Ash'], B: ['Blood Rite', 'Blood Moon'] },
    ember: { A: ['Hunter', 'Shadowflame'], B: ['Guardian', 'Hearth Hound'] },
    wisp: { A: ['Seer', 'Omen Wisp'], B: ['Razor', 'Storm Wisp'] },
    monolith: { A: ['Bulwark', 'Glacier'], B: ['Ravager', 'Berserk Ice'] },
    hydra: { A: ['Strangler', 'Devourer'], B: ['Bloom', 'Brood Mother'] },
    nimbus: { A: ['Gale Sage', 'Elder Gale'], B: ['Wolverine', 'Blood Storm'] },
    squire: { A: ['Knight', 'Oath Knight'], B: ['Warder', 'Hearth Knight'] },
    judicar: { A: ['Cantor', 'Omen Hammer'], B: ['Razor', 'Storm Hammer'] },
    bulwark: { A: ['Bulwark', 'Citadel'], B: ['Ravager', 'Berserk Mail'] },
    sanctum: { A: ['Strangler', 'Devourer'], B: ['Bloom', 'Mother Chapel'] },
    banner: { A: ['Chaplain', 'Elder Banner'], B: ['War Hymn', 'Blood Banner'] },
    sister: { A: ['Huntress', 'Sky Huntress'], B: ['Warder', 'Hearth Sister'] },
    hawk: { A: ['Seer', 'Omen Hawk'], B: ['Razor', 'Storm Hawk'] },
    valk: { A: ['Bulwark', 'Citadel'], B: ['Ravager', 'Berserk Spear'] },
    stake: { A: ['Strangler', 'Devourer'], B: ['Bloom', 'Mother Stake'] },
    gale: { A: ['Wind Sage', 'Elder Gale'], B: ['Skysong', 'Blood Wind'] },
    berzerk: { A: ['Reaver', 'War Reaver'], B: ['Warder', 'Hearth Axe'] },
    axe: { A: ['Cantor', 'Omen Axe'], B: ['Razor', 'Storm Axe'] },
    warlord: { A: ['Bulwark', 'Citadel'], B: ['Ravager', 'Berserk Lord'] },
    wartotem: { A: ['Strangler', 'Devourer'], B: ['Bloom', 'Mother Totem'] },
    shout: { A: ['Chanter', 'Elder Cry'], B: ['War Hymn', 'Blood Cry'] }
  };
  var KIN_OF = { skeleton: 'wolf', mage: 'raven', golem: 'bear', spike: 'vine', priest: 'spirit', ember: 'wolf', wisp: 'raven', monolith: 'bear', hydra: 'vine', nimbus: 'spirit', squire: 'wolf', judicar: 'raven', bulwark: 'bear', sanctum: 'vine', banner: 'spirit', sister: 'wolf', hawk: 'raven', valk: 'bear', stake: 'vine', gale: 'spirit', berzerk: 'wolf', axe: 'raven', warlord: 'bear', wartotem: 'vine', shout: 'spirit' };
  Object.keys(EVO_NAME).forEach(function (type) {
    var src = PB.EVOLUTIONS[KIN_OF[type]], names = EVO_NAME[type], out = {};
    ['A', 'B'].forEach(function (br) {
      out[br] = {
        t2: { name: names[br][0], mods: copy(src[br].t2.mods), text: src[br].t2.text },
        t3: { name: names[br][1], mods: copy(src[br].t3.mods), text: src[br].t3.text }
      };
    });
    PB.EVOLUTIONS[type] = out;
  });

  PB.NAME_PARTS.skeleton = [['Bone', 'Carr', 'Vel', 'Ash', 'Mor', 'Kal'], ['row', 'ic', 'tooth', 'marrow', 'grim']];
  PB.NAME_PARTS.mage = [['Quel', 'Nyx', 'Oss', 'Vex', 'Irid'], ['a', 'ion', 'eth', 'mar', 'is']];
  PB.NAME_PARTS.golem = [['Clay', 'Umber', 'Lod', 'Grav', 'Dun'], ['en', 'golem', 'barrow', 'mass']];
  PB.NAME_PARTS.spike = [['Thorn', 'Rib', 'Barrow', 'Splint'], ['spike', 'root', 'grave', 'coil']];
  PB.NAME_PARTS.priest = [['Ash', 'Lich', 'Pall', 'Requ'], ['light', 'mass', 'chant', 'em']];
  PB.NAME_PARTS.ember = [['Cinder', 'Soot', 'Pyre', 'Brand'], ['hound', 'ash', 'fang', 'whelp']];
  PB.NAME_PARTS.wisp = [['Spark', 'Ion', 'Volt', 'Gale'], ['wisp', 'mote', 'arc', 'ling']];
  PB.NAME_PARTS.monolith = [['Rime', 'Hoar', 'Glac', 'Nun'], ['stone', 'pillar', 'frost', 'at']];
  PB.NAME_PARTS.hydra = [['Pyra', 'Sulf', 'Cind', 'Ves'], ['hydra', 'maw', 'coil', 'spit']];
  PB.NAME_PARTS.nimbus = [['Nimbus', 'Cumul', 'Stratus', 'Gale'], ['cloud', 'heart', 'ion', 'a']];
  PB.NAME_PARTS.squire = [['Sir', 'Cal', 'Bren', 'Ald'], ['en', 'ric', 'hold', 'mark']];
  PB.NAME_PARTS.judicar = [['Jud', 'Mal', 'Cor', 'Ves'], ['icar', 'eth', 'hammer', 'is']];
  PB.NAME_PARTS.bulwark = [['Bast', 'Ward', 'Helm', 'Dun'], ['ion', 'wall', 'mail', 'keep']];
  PB.NAME_PARTS.sanctum = [['Chapel', 'Nave', 'Relic', 'Pyx'], ['ground', 'well', 'stone', 'light']];
  PB.NAME_PARTS.banner = [['Gold', 'Hymn', 'Pale', 'Oath'], ['banner', 'light', 'standard', 'a']];
  PB.NAME_PARTS.sister = [['Ska', 'Bry', 'Vel', 'Ash'], ['di', 'nhild', 'spear', 'a']];
  PB.NAME_PARTS.hawk = [['Kyr', 'Syl', 'Aer', 'Ves'], ['hawk', 'wing', 'a', 'is']];
  PB.NAME_PARTS.valk = [['Sig', 'Bry', 'Hild', 'Gunn'], ['run', 'a', 'spear', 'dis']];
  PB.NAME_PARTS.stake = [['Stake', 'Pale', 'Decoy', 'Ash'], ['post', 'mark', 'wood', 'a']];
  PB.NAME_PARTS.gale = [['Gale', 'Nor', 'Zeph', 'Sky'], ['wind', 'a', 'breath', 'is']];
  PB.NAME_PARTS.berzerk = [['Gor', 'Ul', 'Rag', 'Bren'], ['nak', 'f', 'axe', 'ar']];
  PB.NAME_PARTS.axe = [['Tor', 'Hal', 'Skar', 'Vig'], ['grim', 'd', 'axe', 'i']];
  PB.NAME_PARTS.warlord = [['War', 'Khan', 'Bran', 'Ul'], ['lord', 'd', 'fist', 'ric']];
  PB.NAME_PARTS.wartotem = [['Totem', 'Drum', 'Ash', 'Horn'], ['post', 'cry', 'wood', 'a']];
  PB.NAME_PARTS.shout = [['Cry', 'Howl', 'Horn', 'War'], ['song', 'a', 'shout', 'ic']];

  // Each other calling gets the druid's ten crosses and five alphas, under new names.
  // mirror points at the druid fusion so the existing ability hooks run. The druid rows stay as they are.
  var FAM = {
    stormhound: 'wolf', direwarg: 'wolf', thornpelt: 'wolf', wraithwolf: 'wolf', alphawolf: 'wolf',
    owlbear: 'bear', rootwarden: 'bear', eldersbear: 'bear', greatbear: 'bear',
    carrionbloom: 'vine', lifebloom: 'vine', stranglegrove: 'vine',
    omen: 'spirit', twinspirit: 'spirit', murder: 'raven'
  };
  var FUSION_NAMES = {
    necro: {
      stormhound: ['Bone Hound', 'bonehound'], direwarg: ['Grave Warg', 'gravewarg'], thornpelt: ['Thornbone', 'thornbone'],
      wraithwolf: ['Pale Stalker', 'palestalker'], owlbear: ['Tomb Brute', 'tombbrute'], carrionbloom: ['Gravebloom', 'gravebloom'],
      omen: ['Dirge', 'dirge'], rootwarden: ['Crypt Warden', 'cryptwarden'], eldersbear: ['Elder Clay', 'elderclay'], lifebloom: ['Bloodwell', 'bloodwell']
    },
    sorc: {
      stormhound: ['Cinder Hound', 'cinderhound'], direwarg: ['Storm Brute', 'stormbrute'], thornpelt: ['Ashpelt', 'ashpelt'],
      wraithwolf: ['Pale Ember', 'paleember'], owlbear: ['Glacier Beast', 'glacierbeast'], carrionbloom: ['Pyrebloom', 'pyrebloom'],
      omen: ['Storm Sign', 'stormsign'], rootwarden: ['World Pillar', 'worldpillar'], eldersbear: ['Elder Stone', 'elderstone'], lifebloom: ['Mana Well', 'manawell']
    },
    pala: {
      stormhound: ['Oath Hound', 'oathhound'], direwarg: ['War Brute', 'warbrute'], thornpelt: ['Thorn Oath', 'thornoath'],
      wraithwolf: ['Pale Squire', 'palesquire'], owlbear: ['Judgment', 'judgment'], carrionbloom: ['Reliquary', 'reliquary'],
      omen: ['Canticle', 'canticle'], rootwarden: ['Chapel Warden', 'chapelwarden'], eldersbear: ['Elder Aegis', 'elderaegis'], lifebloom: ['Mercy Well', 'mercywell']
    },
    amaz: {
      stormhound: ['Sky Hound', 'skyhound'], direwarg: ['Storm Sister', 'stormsister'], thornpelt: ['Thorn Sky', 'thornsky'],
      wraithwolf: ['Pale Sister', 'palesister'], owlbear: ['Sky Brute', 'skybrute'], carrionbloom: ['Skybloom', 'skybloom'],
      omen: ['Sky Sign', 'skysign'], rootwarden: ['Sky Warden', 'skywarden'], eldersbear: ['Elder Hawk', 'elderhawk'], lifebloom: ['Wind Well', 'windwell']
    },
    barb: {
      stormhound: ['War Hound', 'warhound'], direwarg: ['War Brute', 'warbrutes'], thornpelt: ['Thorn War', 'thornwar'],
      wraithwolf: ['Pale Berserk', 'paleberserk'], owlbear: ['War Beast', 'warbeast'], carrionbloom: ['Warbloom', 'warbloom'],
      omen: ['War Sign', 'warsign'], rootwarden: ['War Warden', 'warwarden'], eldersbear: ['Elder Axe', 'elderaxe'], lifebloom: ['War Well', 'warwell']
    }
  };
  var ALPHA_NAMES = {
    necro: { wolf: ['Shambler', 'shambler'], raven: ['College', 'bonecollege'], bear: ['Colossus', 'colossus'], vine: ['Spike Grove', 'spikegrove'], spirit: ['Twin Priest', 'twinpriest'] },
    sorc: { wolf: ['Alpha Cinder', 'alphacinder'], raven: ['Tempest', 'tempest'], bear: ['Obelisk', 'obelisk'], vine: ['Hydra Brood', 'hydrabrood'], spirit: ['Twin Storm', 'twinstorm'] },
    pala: { wolf: ['Captain', 'captain'], raven: ['Choir', 'choir'], bear: ['Bastion', 'bastion'], vine: ['Sanctum Grove', 'sanctumgrove'], spirit: ['Twin Banner', 'twinbanner'] },
    amaz: { wolf: ['Sky Captain', 'skycaptain'], raven: ['Cast', 'hawkcast'], bear: ['Prime', 'valkprime'], vine: ['Stake Grove', 'stakegrove'], spirit: ['Twin Gale', 'twingale'] },
    barb: { wolf: ['War Captain', 'warcaptain'], raven: ['Axe Choir', 'axechoir'], bear: ['Colossus', 'warcolossus'], vine: ['Totem Grove', 'totemgrove'], spirit: ['Twin Shout', 'twinshout'] }
  };
  var CLASS_KIN = {
    necro: { wolf: 'skeleton', raven: 'mage', bear: 'golem', vine: 'spike', spirit: 'priest' },
    sorc: { wolf: 'ember', raven: 'wisp', bear: 'monolith', vine: 'hydra', spirit: 'nimbus' },
    pala: { wolf: 'squire', raven: 'judicar', bear: 'bulwark', vine: 'sanctum', spirit: 'banner' },
    amaz: { wolf: 'sister', raven: 'hawk', bear: 'valk', vine: 'stake', spirit: 'gale' },
    barb: { wolf: 'berzerk', raven: 'axe', bear: 'warlord', vine: 'wartotem', spirit: 'shout' }
  };
  var CLASS_PAL = { necro: BONE, sorc: STORM, pala: OATH, amaz: SKY, barb: WAR };

  function addMirrorFusions(classId) {
    var kin = CLASS_KIN[classId], keys = Object.keys(PB.FUSIONS), i;
    for (i = 0; i < keys.length; i++) {
      var key = keys[i], src = PB.FUSIONS[key], parts = key.split('+');
      if (src.cls || !kin[parts[0]] || !kin[parts[1]]) continue;
      var nk = [kin[parts[0]], kin[parts[1]]].sort().join('+');
      if (PB.FUSIONS[nk]) continue;
      var names = FUSION_NAMES[classId][src.id], row = JSON.parse(JSON.stringify(src));
      row.id = names[1]; row.name = names[0]; row.mirror = src.id; row.cls = classId;
      if (src.id === 'rootwarden') row.sapType = kin.vine;
      row.ability = src.ability;
      PB.FUSIONS[nk] = row;
      paint(row.id, FAM[src.id] || 'blob', CLASS_PAL[classId], classId === 'necro' ? '#f4efe2' : '#fff6c0', null);
    }
    ['wolf', 'raven', 'bear', 'vine', 'spirit'].forEach(function (role) {
      var type = kin[role], srcA = PB.ALPHA[role], names = ALPHA_NAMES[classId][role];
      if (PB.ALPHA[type]) return;
      PB.ALPHA[type] = { id: names[1], name: names[0], mult: srcA.mult, ability: srcA.ability, mirror: srcA.id, kin: type, packTag: type, cls: classId };
      paint(names[1], FAM[srcA.id] || 'blob', CLASS_PAL[classId], '#ffcc44', null);
    });
  }
  addMirrorFusions('necro');
  addMirrorFusions('sorc');
  addMirrorFusions('pala');
  addMirrorFusions('amaz');
  addMirrorFusions('barb');

  paint('necro', 'robed', ['#2a2438', '#120e18', '#e4d4ff'], '#d0b0ff', null);
  paint('sorc', 'robed', ['#1c2448', '#0c1024', '#f5e46a'], '#fff6c0', null);
  paint('pala', 'robed', ['#3a3424', '#1a160e', '#ffe9a0'], '#fff6c0', 'halo');
  paint('amaz', 'archer', ['#8a6844', '#3a2a18', '#e6c56a'], '#9fd8ff', null);
  paint('barb', 'slab', ['#a85038', '#4a2018', '#ffd0a0'], '#ffb060', null);

  PB.FUSION_BY_ID = {};
  Object.keys(PB.FUSIONS).forEach(function (k) { PB.FUSION_BY_ID[PB.FUSIONS[k].id] = PB.FUSIONS[k]; });
  Object.keys(PB.ALPHA).forEach(function (t) { PB.FUSION_BY_ID[PB.ALPHA[t].id] = PB.ALPHA[t]; });

  function node(cls, id, tree, tier, max, name, text, effect, req) {
    var s = { id: id, cls: cls, tree: tree, tier: tier, max: max, name: name, text: text, effect: effect };
    if (req) s.req = req;
    PB.SKILLS.push(s);
  }

  // Gravecaller. Bone is the army and the spear. Grave is mages and spikes. Rite is the priest and the orders.
  node('necro', 'raise', 'bone', 1, 3, 'Raise Skeleton', '+1 skeleton cap per rank. Each rank also adds 4% skeleton damage, so the first point hits before the extra spear is up.', function (r) { return { skeletonCap: r, skeletonDmg: 4 * r }; });
  node('necro', 'marrow', 'bone', 1, 5, 'Marrow', '+8% summon life per rank', function (r) { return { packHp: 8 * r }; });
  node('necro', 'legion', 'bone', 2, 3, 'Legion', 'Skeletons deal more for each other skeleton alive, the way wolves do, and each rank feeds Howl.', function (r) { return { packTactics: 3 * r }; }, ['raise']);
  node('necro', 'clay', 'bone', 2, 3, 'Clay Flesh', '+15% golem life and damage per rank. Rank 3 raises a second golem. Each rank also hardens the guard.', function (r) { return { golemHp: 15 * r, golemDmg: 15 * r, golemCap: r >= 3 ? 1 : 0 }; }, ['marrow']);
  node('necro', 'spearhead', 'bone', 3, 5, 'Spearhead', '+4 Bone Spear damage per rank. The staff still steps the spear. Each rank returns 2% of the spear as Essence.', function (r) { return { spearDmg: 4 * r, spiritLeech: 2 * r }; }, ['legion']);
  node('necro', 'ossify', 'bone', 3, 1, 'Ossify', 'Golem hits stun for 0.5s', function () { return { behaviors: { maulstun: 1 } }; }, ['clay']);
  node('necro', 'gravespeed', 'bone', 3, 3, 'Grave Rush', '+10% summon speed per rank toward enemies under half life, and +8% damage against them.', function (r) { return { bloodscent: 10 * r, execute: 8 * r }; });
  node('necro', 'deadrise', 'bone', 4, 1, 'Dead Rise', 'KEYSTONE: skeleton cap doubled and skeletons cost half. A called skeleton fades back to the roster after 30s. Same bones. No Den time.', function () { return { behaviors: { deadrise: 1 } }; }, ['spearhead']);

  node('necro', 'college', 'grave', 1, 3, 'College', '+1 bone mage cap per rank', function (r) { return { mageCap: r }; });
  node('necro', 'irons', 'grave', 1, 3, 'Iron Spikes', '+0.3s spike root per rank', function (r) { return { rootDur: 0.3 * r }; });
  node('necro', 'sight', 'grave', 2, 3, 'Grave Sight', 'Mark lasts +2s and Marked take +5% damage per rank. Each rank also feeds crits on Marked prey.', function (r) { return { markDur: 2 * r, markDmg: 5 * r }; }, ['college']);
  node('necro', 'rot', 'grave', 2, 3, 'Rot', '+25% poison damage per rank. Each rank also feeds damage against Rooted foes.', function (r) { return { poisonDmg: 25 * r }; }, ['irons']);
  node('necro', 'feastbones', 'grave', 3, 1, 'Carrion', 'Eating corpses grants double summon XP', function () { return { behaviors: { feast: 1 } }; });
  node('necro', 'thicket', 'grave', 3, 2, 'Thicket', '+1 spike cap per rank', function (r) { return { spikeCap: r }; }, ['rot']);
  node('necro', 'volleybones', 'grave', 3, 1, 'Bone Volley', 'Mages loose together: +40% mage damage', function () { return { mageDmg: 40 }; }, ['sight']);
  node('necro', 'gravebelow', 'grave', 4, 1, 'The Grave Below', 'KEYSTONE: a temporary spike sprouts where an elite dies or is rooted', function () { return { behaviors: { greenbelow: 1 } }; }, ['thicket']);

  node('necro', 'wellrot', 'rite', 1, 5, 'Black Well', '+10% Essence regen per rank. Each rank also feeds the Chorus.', function (r) { return { spiritRegen: 10 * r }; });
  node('necro', 'voicegrave', 'rite', 1, 3, 'Death\'s Voice', '8% faster command cooldowns per rank', function (r) { return { cmdCdr: 8 * r }; });
  node('necro', 'hearthgrave', 'rite', 2, 3, 'Ash Aura', '+15% aura radius per rank', function (r) { return { auraRadius: 15 * r }; }, ['wellrot']);
  node('necro', 'shieldgrave', 'rite', 2, 3, 'Bone Shield', 'Rally shield +10% of max life per rank', function (r) { return { rallyShield: 10 * r }; }, ['voicegrave']);
  node('necro', 'possess', 'rite', 3, 3, 'Possession', '+4s inside a summon and +10% possessed damage per rank. Tab is the same key. The body is dead, not a wolf.', function (r) { return { skinDur: 4 * r, skinDmg: 10 * r }; });
  node('necro', 'loregrave', 'rite', 3, 3, 'Graft Lore', '+10% fused summon stats per rank. Rank 3: +1 fusion slot', function (r) { return { fusedStats: 10 * r, fusionSlots: r >= 3 ? 1 : 0 }; }, ['hearthgrave']);
  node('necro', 'dirgemaster', 'rite', 3, 3, 'Dirge Master', '+20% Chorus burst damage per rank', function (r) { return { chorusDmg: 20 * r }; }, ['shieldgrave']);
  node('necro', 'gravemarch', 'rite', 4, 1, 'The Grave March', 'KEYSTONE: the Wild Hunt calls every Echo you own, and refunds 30% Chorus. Your dead come back across the field.', function () { return { behaviors: { eternal: 1 } }; }, ['loregrave']);
  node('necro', 'decrepify', 'grave', 3, 3, 'Decrepify', 'Bone Spear also slows. +0.4s per rank, and the Amplify curse lasts +1s per rank.', function (r) { return { curseDur: r, decrep: 0.4 * r }; });

  // Stormbinder. Flame is the blast and the hydra. Frost is the monolith. Arcane is mana, form and the Chorus.
  node('sorc', 'kindle', 'flame', 1, 3, 'Kindle', '+1 ember hound cap per rank, and +5% ember damage', function (r) { return { emberCap: r, emberDmg: 5 * r }; });
  node('sorc', 'pyre', 'flame', 1, 5, 'Pyre', '+3 Fireball damage per rank. This is your weapon. Each rank returns 2% of the burst as life.', function (r) { return { boltDmg: 3 * r, lifeLeech: 2 * r }; });
  node('sorc', 'cinders', 'flame', 2, 3, 'Cinders', '+8% ember damage per rank. Ranks also feed the fireball.', function (r) { return { emberDmg: 8 * r }; }, ['kindle']);
  node('sorc', 'brood', 'flame', 2, 3, 'Brood', '+12% hydra damage per rank. Rank 3 adds a hydra. Each rank also feeds the fireball.', function (r) { return { hydraDmg: 12 * r, hydraCap: r >= 3 ? 1 : 0 }; }, ['pyre']);
  node('sorc', 'inferno', 'flame', 3, 1, 'Inferno', 'Fireball bursts wider and the burn lasts harder', function () { return { behaviors: { meteor: 1 }, splash: 24, burnDmg: 40 }; }, ['cinders']);
  node('sorc', 'scorch', 'flame', 3, 3, 'Scorch', '+20% burn damage per rank', function (r) { return { burnDmg: 20 * r }; }, ['brood']);
  node('sorc', 'blaze', 'flame', 3, 3, 'Blaze', '+4% fireball crit chance per rank', function (r) { return { boltCrit: 4 * r }; });
  node('sorc', 'cataclysm', 'flame', 4, 1, 'Cataclysm', 'KEYSTONE: the fireball is larger, Marks, and the ember hounds swing the moment it lands.', function () { return { behaviors: { cataclysm: 1 }, splash: 16 }; }, ['inferno']);

  node('sorc', 'glacier', 'frost', 1, 3, 'Glacier', '+15% monolith life and damage per rank', function (r) { return { monolithHp: 15 * r, monolithDmg: 15 * r }; });
  node('sorc', 'chill', 'frost', 1, 3, 'Chill', 'The monolith\'s maul slows. +0.4s per rank.', function (r) { return { slowOnHit: 0.4 * r }; });
  node('sorc', 'rampart', 'frost', 2, 3, 'Rampart', '+12% monolith life per rank. Each rank also hardens the guard.', function (r) { return { monolithHp: 12 * r }; }, ['glacier']);
  node('sorc', 'rime', 'frost', 2, 1, 'Rime', 'Monolith hits freeze for a short beat', function () { return { behaviors: { rime: 1 } }; }, ['chill']);
  node('sorc', 'secondstone', 'frost', 3, 1, 'Twin Stone', 'A second monolith', function () { return { monolithCap: 1 }; }, ['rampart']);
  node('sorc', 'whiteout', 'frost', 3, 3, 'Whiteout', '+4% summon life per rank. The cold settles into the pack.', function (r) { return { packHp: 4 * r }; });
  node('sorc', 'bulwarkice', 'frost', 3, 3, 'Hoarfrost', '+8% summon life per rank', function (r) { return { packHp: 8 * r }; });
  node('sorc', 'absolute', 'frost', 4, 1, 'Absolute Zero', 'KEYSTONE: the monolith freezes what it mauls.', function () { return { behaviors: { absolute: 1 } }; }, ['secondstone']);

  node('sorc', 'spring', 'arcane', 1, 5, 'Mana Spring', '+10% Mana regen per rank. Each rank also feeds the Chorus.', function (r) { return { spiritRegen: 10 * r }; });
  node('sorc', 'voicesorc', 'arcane', 1, 3, 'Clear Casting', '8% faster command cooldowns per rank', function (r) { return { cmdCdr: 8 * r }; });
  node('sorc', 'hearthsorc', 'arcane', 2, 3, 'Static Aura', '+15% aura radius per rank', function (r) { return { auraRadius: 15 * r }; }, ['spring']);
  node('sorc', 'shieldsorc', 'arcane', 2, 3, 'Energy Shield', 'Rally shield +10% of max life per rank', function (r) { return { rallyShield: 10 * r }; }, ['voicesorc']);
  node('sorc', 'form', 'arcane', 3, 3, 'Elemental Form', '+4s inside a summon and +10% possessed damage per rank', function (r) { return { skinDur: 4 * r, skinDmg: 10 * r }; });
  node('sorc', 'loresorc', 'arcane', 3, 3, 'Binding Lore', '+10% fused summon stats per rank. Rank 3: +1 fusion slot', function (r) { return { fusedStats: 10 * r, fusionSlots: r >= 3 ? 1 : 0 }; }, ['hearthsorc']);
  node('sorc', 'staticfield', 'arcane', 3, 3, 'Static Field', '+20% Chorus burst damage per rank', function (r) { return { chorusDmg: 20 * r }; }, ['shieldsorc']);
  node('sorc', 'perfectstorm', 'arcane', 4, 1, 'Perfect Storm', 'KEYSTONE: the Wild Hunt calls every Echo, and refunds 30% Chorus.', function () { return { behaviors: { eternal: 1 } }; }, ['loresorc']);

  // Oathbound. Zeal is the weapon. Aegis is the wall. Oath is the banner, the curse and the Chorus.
  node('pala', 'linecall', 'zeal', 1, 2, 'Call the Line', '+1 squire cap per rank, and +6% squire damage. A short line, not a horde.', function (r) { return { squireCap: r, squireDmg: 6 * r }; });
  node('pala', 'zeal', 'zeal', 1, 5, 'Zeal', '+4 Zeal damage per rank. Rank 2, 3 and 4 each add a strike. Crushing Blow +3% per rank against elites, champions and bosses.', function (r) { return { zealDmg: 4 * r, zealStrikes: Math.min(3, Math.max(0, r - 1)), crush: 3 * r }; });
  node('pala', 'shieldwall', 'zeal', 2, 3, 'Shield Wall', 'Squires deal more for each other squire alive, and each rank feeds Howl.', function (r) { return { packTactics: 3 * r }; }, ['linecall']);
  node('pala', 'bloodprice', 'zeal', 3, 3, 'Blood Price', 'Zeal returns 2 life per rank.', function (r) { return { zealLeech: 2 * r }; });
  node('pala', 'sacrifice', 'zeal', 4, 1, 'Sacrifice', 'KEYSTONE: the first strike hits twice as hard and costs 4 life. It will not drop you.', function () { return { behaviors: { sacrifice: 1 } }; }, ['zeal']);

  node('pala', 'plate', 'aegis', 1, 5, 'Plate', '+4 armor per rank. You are harder to move.', function (r) { return { armor: 4 * r }; });
  node('pala', 'consecrate', 'aegis', 1, 2, 'Consecrate', '+1 sanctum cap per rank. The ground holds a little longer.', function (r) { return { sanctumCap: r, rootDur: 0.25 * r }; });
  node('pala', 'aegis', 'aegis', 2, 3, 'Aegis', '+15% bulwark life and damage per rank. Rank 3 raises a second bulwark. Each rank hardens the guard.', function (r) { return { bulwarkHp: 15 * r, bulwarkDmg: 15 * r, bulwarkCap: r >= 3 ? 1 : 0 }; }, ['plate']);
  node('pala', 'smite', 'aegis', 2, 1, 'Smite', 'Bulwark hits stun for 0.5s', function () { return { behaviors: { maulstun: 1 } }; }, ['consecrate']);
  node('pala', 'thorns', 'aegis', 3, 3, 'Thorns', '+6% summon life per rank. The wall shares its hide.', function (r) { return { packHp: 6 * r }; });
  node('pala', 'holyground', 'aegis', 3, 1, 'Holy Ground', 'A landed Zeal mends the oath beside you.', function () { return { behaviors: { sanctified: 1 } }; }, ['consecrate']);
  node('pala', 'redoubt', 'aegis', 4, 1, 'Redoubt', 'KEYSTONE: +10 armor, and Zeal mends the oath for at least 4 life.', function () { return { behaviors: { redoubt: 1 }, armor: 10 }; }, ['aegis']);

  node('pala', 'prayer', 'oath', 1, 5, 'Prayer', '+10% Faith regen per rank. Each rank also feeds the Chorus.', function (r) { return { spiritRegen: 10 * r }; });
  node('pala', 'oathvoice', 'oath', 1, 3, 'Clear Oath', '8% faster command cooldowns per rank', function (r) { return { cmdCdr: 8 * r }; });
  node('pala', 'wideroath', 'oath', 2, 3, 'Wider Oath', '+15% aura radius per rank', function (r) { return { auraRadius: 15 * r }; }, ['prayer']);
  node('pala', 'oathrally', 'oath', 2, 3, 'Rally of the Oath', 'Rally shield +10% of max life per rank', function (r) { return { rallyShield: 10 * r }; }, ['oathvoice']);
  node('pala', 'conviction', 'oath', 3, 3, 'Conviction', 'Zeal curses. +1.2s per rank. The cursed body takes more from everyone.', function (r) { return { conviction: 1.2 * r }; });
  node('pala', 'martyr', 'oath', 3, 3, 'Martyr', '+4s inside a summon and +10% possessed damage per rank. Tab is the same key.', function (r) { return { skinDur: 4 * r, skinDmg: 10 * r }; });
  node('pala', 'oathlore', 'oath', 3, 3, 'Oath Lore', '+10% fused summon stats per rank. Rank 3: +1 fusion slot', function (r) { return { fusedStats: 10 * r, fusionSlots: r >= 3 ? 1 : 0 }; }, ['wideroath']);
  node('pala', 'cantor', 'oath', 3, 3, 'Cantor', '+20% Chorus burst damage per rank', function (r) { return { chorusDmg: 20 * r }; }, ['oathrally']);
  node('pala', 'fanaticism', 'oath', 4, 1, 'Fanaticism', 'KEYSTONE: Zeal marks the whole arc, the whole pack swings with you, and they swing faster.', function () { return { behaviors: { fanaticism: 1 }, packAtkSpd: 12 }; }, ['oathlore']);

  // Skymark. The javelin is the weapon. The valkyrie is the wall. Sky is the mark, the form and the Chorus.
  node('amaz', 'skymuster', 'javelin', 1, 2, 'Call the Sisters', '+1 spear sister cap per rank, and +6% sister damage. A pair, not a horde.', function (r) { return { sisterCap: r, sisterDmg: 6 * r }; });
  node('amaz', 'fury', 'javelin', 1, 5, 'Lightning Fury', '+4 javelin damage per rank. Rank 2, 3 and 4 each add a lightning fork. Deadly Strike +4% per rank. The throw is the weapon.', function (r) { return { furyDmg: 4 * r, furyForks: Math.min(3, Math.max(0, r - 1)), deadly: 4 * r }; });
  node('amaz', 'skywing', 'javelin', 2, 3, 'Paired Spears', 'Sisters deal more for each other sister alive, and each rank feeds Howl.', function (r) { return { packTactics: 3 * r }; }, ['skymuster']);
  node('amaz', 'charged', 'javelin', 3, 3, 'Charged Strike', 'A landed javelin returns 2 life per rank.', function (r) { return { furyLeech: 2 * r }; });
  node('amaz', 'stormstrike', 'javelin', 4, 1, 'Storm Strike', 'KEYSTONE: the lightning hops a second time, and a forked body is Marked.', function () { return { behaviors: { stormstrike: 1 } }; }, ['fury']);

  node('amaz', 'skyhide', 'valkyrie', 1, 5, 'Leather', '+4 armor per rank. You are harder to pin.', function (r) { return { armor: 4 * r }; });
  node('amaz', 'decoy', 'valkyrie', 1, 2, 'Decoy', '+1 stake cap per rank. The hold lasts a little longer.', function (r) { return { stakeCap: r, rootDur: 0.25 * r }; });
  node('amaz', 'valormight', 'valkyrie', 2, 3, 'Valkyrie', '+15% valkyrie life and damage per rank. Rank 3 calls a second valkyrie. Each rank hardens the guard.', function (r) { return { valkHp: 15 * r, valkDmg: 15 * r, valkCap: r >= 3 ? 1 : 0 }; }, ['skyhide']);
  node('amaz', 'skycrit', 'valkyrie', 2, 3, 'Critical Strike', '+4% javelin crit chance per rank. Ranks also feed the throw.', function (r) { return { furyCrit: 4 * r }; }, ['decoy']);
  node('amaz', 'skybulk', 'valkyrie', 3, 3, 'War Party', '+6% summon life per rank. The party shares its hide.', function (r) { return { packHp: 6 * r }; });
  node('amaz', 'evadebolt', 'valkyrie', 3, 1, 'Evade', 'Space leaves lightning on the line. What you pass is slowed.', function () { return { behaviors: { evadebolt: 1 } }; }, ['decoy']);
  node('amaz', 'valkstand', 'valkyrie', 4, 1, 'Stand', 'KEYSTONE: the valkyrie stuns on the maul, and the javelin calls her in with the sisters.', function () { return { behaviors: { valkstand: 1, maulstun: 1 } }; }, ['valormight']);

  node('amaz', 'skywell', 'sky', 1, 5, 'Second Wind', '+10% Focus regen per rank. Each rank also feeds the Chorus.', function (r) { return { spiritRegen: 10 * r }; });
  node('amaz', 'skyclear', 'sky', 1, 3, 'Clear Shot', '8% faster command cooldowns per rank', function (r) { return { cmdCdr: 8 * r }; });
  node('amaz', 'skywide', 'sky', 2, 3, 'Wider Gale', '+15% aura radius per rank', function (r) { return { auraRadius: 15 * r }; }, ['skywell']);
  node('amaz', 'skyrally', 'sky', 2, 3, 'Rally of the Sky', 'Rally shield +10% of max life per rank', function (r) { return { rallyShield: 10 * r }; }, ['skyclear']);
  node('amaz', 'innersight', 'sky', 3, 3, 'Inner Sight', 'The javelin marks longer. +1.2s per rank. Marked prey takes more.', function (r) { return { markDur: 1.2 * r, markDmg: 4 * r }; });
  node('amaz', 'skyform', 'sky', 3, 3, 'Skyform', '+4s inside a summon and +10% possessed damage per rank. Tab is the same key.', function (r) { return { skinDur: 4 * r, skinDmg: 10 * r }; });
  node('amaz', 'skylore', 'sky', 3, 3, 'Sky Lore', '+10% fused summon stats per rank. Rank 3: +1 fusion slot', function (r) { return { fusedStats: 10 * r, fusionSlots: r >= 3 ? 1 : 0 }; }, ['skywide']);
  node('amaz', 'skyvoice', 'sky', 3, 3, 'Gale Voice', '+20% Chorus burst damage per rank', function (r) { return { chorusDmg: 20 * r }; }, ['skyrally']);
  node('amaz', 'skymark', 'sky', 4, 1, 'Skymark', 'KEYSTONE: the javelin marks the whole line, and every hawk looses when it lands.', function () { return { behaviors: { skymark: 1 } }; }, ['skylore']);

  // Warbound. Whirlwind is the weapon. The shout is the pack. Iron is the form and the Chorus.
  node('barb', 'warband', 'frenzy', 1, 2, 'Warband', '+1 berserker cap per rank, and +6% berserker damage. Two axes, not a horde.', function (r) { return { berzerkCap: r, berzerkDmg: 6 * r }; });
  node('barb', 'whirl', 'frenzy', 1, 5, 'Whirlwind', '+4 spin damage per rank. A second spin inside the window hits harder. Rank 2, 3 and 4 each allow one more frenzy stack. Deadly Strike +4% per rank.', function (r) { return { whirlDmg: 4 * r, frenzyMax: Math.min(3, Math.max(0, r - 1)), deadly: 4 * r }; });
  node('barb', 'warline', 'frenzy', 2, 3, 'Paired Axes', 'Berserkers deal more for each other berserker alive, and each rank feeds Howl.', function (r) { return { packTactics: 3 * r }; }, ['warband']);
  node('barb', 'bloodwhirl', 'frenzy', 3, 3, 'Blood Whirl', 'A landed spin returns 2 life per rank.', function (r) { return { whirlLeech: 2 * r }; });
  node('barb', 'berserk', 'frenzy', 4, 1, 'Berserk', 'KEYSTONE: at three frenzy stacks the spin hits twice.', function () { return { behaviors: { berserk: 1 } }; }, ['whirl']);

  node('barb', 'battleorders', 'shout', 1, 5, 'Battle Orders', '+6% summon life per rank. The shout is the hide.', function (r) { return { packHp: 6 * r }; });
  node('barb', 'wartotem', 'shout', 1, 2, 'Plant the Totem', '+1 war totem cap per rank. The ground holds a little longer.', function (r) { return { wartotemCap: r, rootDur: 0.25 * r }; });
  node('barb', 'warlordmight', 'shout', 2, 3, 'Warlord', '+15% warlord life and damage per rank. Rank 3 calls a second warlord. Each rank hardens the guard.', function (r) { return { warlordHp: 15 * r, warlordDmg: 15 * r, warlordCap: r >= 3 ? 1 : 0 }; }, ['battleorders']);
  node('barb', 'warsmite', 'shout', 2, 1, 'Stun', 'Warlord hits stun for 0.5s', function () { return { behaviors: { maulstun: 1 } }; }, ['wartotem']);
  node('barb', 'warhide', 'shout', 3, 3, 'Iron Skin', '+4 armor per rank. You are the one who stays.', function (r) { return { armor: 4 * r }; });
  node('barb', 'orders', 'shout', 4, 1, 'Find the Line', 'KEYSTONE: a landed spin mends the warband beside you for 4 life.', function () { return { behaviors: { orders: 1 } }; }, ['warlordmight']);

  node('barb', 'warwell', 'iron', 1, 5, 'Deep Breath', '+10% Rage regen per rank. Each rank also feeds the Chorus.', function (r) { return { spiritRegen: 10 * r }; });
  node('barb', 'warclear', 'iron', 1, 3, 'Clear Cry', '8% faster command cooldowns per rank', function (r) { return { cmdCdr: 8 * r }; });
  node('barb', 'warwide', 'iron', 2, 3, 'Wider Cry', '+15% aura radius per rank', function (r) { return { auraRadius: 15 * r }; }, ['warwell']);
  node('barb', 'warrally', 'iron', 2, 3, 'Rally of the Band', 'Rally shield +10% of max life per rank', function (r) { return { rallyShield: 10 * r }; }, ['warclear']);
  node('barb', 'battlecry', 'iron', 3, 3, 'Battle Cry', '+3 armor per rank. The shout hardens you before the keystone.', function (r) { return { armor: 3 * r }; });
  node('barb', 'warform', 'iron', 3, 3, 'Warcry Form', '+4s inside a summon and +10% possessed damage per rank. Tab is the same key.', function (r) { return { skinDur: 4 * r, skinDmg: 10 * r }; });
  node('barb', 'warlore', 'iron', 3, 3, 'War Lore', '+10% fused summon stats per rank. Rank 3: +1 fusion slot', function (r) { return { fusedStats: 10 * r, fusionSlots: r >= 3 ? 1 : 0 }; }, ['warwide']);
  node('barb', 'warvoice', 'iron', 3, 3, 'Voice', '+20% Chorus burst damage per rank', function (r) { return { chorusDmg: 20 * r }; }, ['warrally']);
  node('barb', 'grandcry', 'iron', 4, 1, 'War Cry', 'KEYSTONE: the spin marks the whole ring, and anything that is not elite runs.', function () { return { behaviors: { warcry: 1 } }; }, ['warlore']);

  PB.SKILL_BY_ID = {};
  PB.SKILLS.forEach(function (s) { PB.SKILL_BY_ID[s.id] = s; });

  PB.CLASS_SYNERGIES = [
    { from: 'legion', stat: 'howlDmg', per: 8 },
    { from: 'sight', stat: 'markCrit', per: 5 },
    { from: 'clay', stat: 'bearGuard', per: 5 },
    { from: 'rot', stat: 'rootDmg', per: 10 },
    { from: 'wellrot', stat: 'chorusDmg', per: 5 },
    { from: 'brood', stat: 'boltDmg', per: 4 },
    { from: 'cinders', stat: 'boltDmg', per: 3 },
    { from: 'glacier', stat: 'bearGuard', per: 5 },
    { from: 'chill', stat: 'monolithDmg', per: 6 },
    { from: 'spring', stat: 'chorusDmg', per: 5 },
    { from: 'shieldwall', stat: 'howlDmg', per: 8 },
    { from: 'zeal', stat: 'squireDmg', per: 4 },
    { from: 'aegis', stat: 'bearGuard', per: 5 },
    { from: 'plate', stat: 'bearHp', per: 4 },
    { from: 'prayer', stat: 'chorusDmg', per: 5 },
    { from: 'conviction', stat: 'zealDmg', per: 3 },
    { from: 'skywing', stat: 'howlDmg', per: 8 },
    { from: 'fury', stat: 'sisterDmg', per: 4 },
    { from: 'decoy', stat: 'rootDmg', per: 8 },
    { from: 'valormight', stat: 'bearGuard', per: 5 },
    { from: 'skycrit', stat: 'furyDmg', per: 2 },
    { from: 'skywell', stat: 'chorusDmg', per: 5 },
    { from: 'innersight', stat: 'hawkDmg', per: 6 },
    { from: 'warline', stat: 'howlDmg', per: 8 },
    { from: 'whirl', stat: 'berzerkDmg', per: 4 },
    { from: 'warlordmight', stat: 'bearGuard', per: 5 },
    { from: 'wartotem', stat: 'rootDmg', per: 8 },
    { from: 'battleorders', stat: 'chorusDmg', per: 4 },
    { from: 'warwell', stat: 'chorusDmg', per: 5 }
  ];

  PB.TREE_NAME = {
    fang: 'Fang', wingroot: 'Wing & Root', command: 'Command',
    bone: 'Bone', grave: 'Grave', rite: 'Rite',
    flame: 'Flame', frost: 'Frost', arcane: 'Arcane',
    zeal: 'Zeal', aegis: 'Aegis', oath: 'Oath',
    javelin: 'Javelin', valkyrie: 'Valkyrie', sky: 'Sky',
    frenzy: 'Frenzy', shout: 'Shout', iron: 'Iron'
  };
  PB.TREE_TEXT = {
    fang: 'wolves and the bear', wingroot: 'ravens and vines', command: 'spirits, orders, fusion',
    bone: 'skeletons, the golem, the spear', grave: 'mages and spikes', rite: 'the priest, orders, fusion',
    flame: 'the fireball and the hydra', frost: 'the monolith', arcane: 'mana, form, the Chorus',
    zeal: 'the swing and the squires', aegis: 'the bulwark and the sanctum', oath: 'the banner, the curse, the Chorus',
    javelin: 'the throw and the sisters', valkyrie: 'the valkyrie and the stake', sky: 'the mark, the form, the Chorus',
    frenzy: 'the spin and the berserkers', shout: 'the warlord and the totem', iron: 'the cry, the form, the Chorus'
  };

  var CLASSES = [
    { id: 'druid', name: 'Druid', title: 'Wildcaller', order: ['wolf', 'raven', 'bear', 'vine', 'spirit'], trees: ['fang', 'wingroot', 'command'],
      kin: { wolf: 'wolf', raven: 'raven', bear: 'bear', vine: 'vine', spirit: 'spirit' },
      attack: 'thornlash', attackName: 'Thornlash', attackText: 'Thornlash: a short whip cone. In menus: select',
      resource: 'Spirit', body: 'druid', glow: 'green', orb: ['#0c2a6a', '#4f8de0'],
      plantNote: '(the vine roots at the cursor)', moveText: 'Move the druid (or the summon you Skinwalk)',
      blurb: 'The whip marks. The pack kills.', pitch: 'You do not fight. You conduct.', fantasy: 'The whip marks. A full pack feeds Spirit back into the swing. You conduct.' },
    { id: 'necro', name: 'Necromancer', title: 'Gravecaller', order: ['skeleton', 'mage', 'golem', 'spike', 'priest'], trees: ['bone', 'grave', 'rite'],
      kin: CLASS_KIN.necro,
      attack: 'bonespear', attackName: 'Bone Spear', attackText: 'Bone Spear: a piercing line. It curses. In menus: select',
      resource: 'Essence', body: 'necro', glow: 'purple', orb: ['#241433', '#9a6ad0'],
      plantNote: '(the spike roots at the cursor)', moveText: 'Move the necromancer (or the summon you possess)',
      blurb: 'Pierce. Curse. The dead answer.', pitch: 'The spear curses. The dead answer.', fantasy: 'Bone Spear curses a line. Skeletons answer it. Grove gear follows your hunters.' },
    { id: 'sorc', name: 'Sorceress', title: 'Stormbinder', order: ['ember', 'wisp', 'monolith', 'hydra', 'nimbus'], trees: ['flame', 'frost', 'arcane'],
      kin: CLASS_KIN.sorc,
      attack: 'fireball', attackName: 'Fireball', attackText: 'Fireball: you are the damage. It bursts. In menus: select',
      resource: 'Mana', body: 'sorc', glow: 'gold', orb: ['#3a2410', '#e8873a'],
      plantNote: '(the hydra roots at the cursor)', moveText: 'Move the sorceress (or the summon you become)',
      blurb: 'You are the damage. They feed it.', pitch: 'You are the blast. They feed it.', fantasy: 'Fireball is the weapon. Hydra ranks feed it. The monolith is the wall.' },
    { id: 'pala', name: 'Paladin', title: 'Oathbound', order: ['squire', 'judicar', 'bulwark', 'sanctum', 'banner'], trees: ['zeal', 'aegis', 'oath'],
      kin: CLASS_KIN.pala,
      attack: 'zeal', attackName: 'Zeal', attackText: 'Zeal: a heavy close swing. Ranks add strikes. In menus: select',
      resource: 'Faith', body: 'pala', glow: 'gold', orb: ['#3a3018', '#e6c56a'],
      plantNote: '(the sanctum roots at the cursor)', moveText: 'Move the paladin (or the summon you inhabit)',
      blurb: 'You stand in the fight.', pitch: 'You stand in the fight. The oath holds.', fantasy: 'Zeal is the weapon. The bulwark is the wall. A short oath, not a horde.' },
    { id: 'amaz', name: 'Amazon', title: 'Skymark', order: ['sister', 'hawk', 'valk', 'stake', 'gale'], trees: ['javelin', 'valkyrie', 'sky'],
      kin: CLASS_KIN.amaz,
      attack: 'fury', attackName: 'Lightning Fury', attackText: 'Lightning Fury: a javelin that pierces, then forks lightning. In menus: select',
      resource: 'Focus', body: 'amaz', glow: 'frost', orb: ['#1a2838', '#7eb0d8'],
      plantNote: '(the stake roots at the cursor)', moveText: 'Move the amazon (or the summon you become)',
      blurb: 'Throw. The lightning forks.', pitch: 'The javelin forks. She holds the line.', fantasy: 'Lightning Fury is the weapon. The valkyrie is the wall. A war party, not a horde.' },
    { id: 'barb', name: 'Barbarian', title: 'Warbound', order: ['berzerk', 'axe', 'warlord', 'wartotem', 'shout'], trees: ['frenzy', 'shout', 'iron'],
      kin: CLASS_KIN.barb,
      attack: 'whirl', attackName: 'Whirlwind', attackText: 'Whirlwind: you spin. The whole ring is hit. Frenzy stacks. In menus: select',
      resource: 'Rage', body: 'barb', glow: 'ember', orb: ['#3a1810', '#e07040'],
      plantNote: '(the totem roots at the cursor)', moveText: 'Move the barbarian (or the summon you inhabit)',
      blurb: 'Spin. The warband follows.', pitch: 'You are the whirlwind.', fantasy: 'Whirlwind is the weapon. Frenzy makes the next spin heavier. A short warband shouts with you.' }
  ];
  PB.CLASS_BY_ID = {};
  PB.CLASS_ORDER = CLASSES.map(function (c) { PB.CLASS_BY_ID[c.id] = c; return c.id; });

  function get(id) { return PB.CLASS_BY_ID[id] || null; }
  function of(save) {
    var id = save && save.player && save.player.classId;
    return get(id) || get('druid');
  }
  function kinType(save, role) {
    var k = of(save).kin;
    return (k && k[role]) || role;
  }
  // The free muster at a zone start. Roles follow the calling. A cap stops a third squire.
  function startTypes(save) {
    var c = of(save), want = [c.kin.wolf, c.kin.wolf, c.kin.wolf, c.kin.raven, c.kin.raven, c.kin.bear, c.kin.spirit];
    var counts = {}, out = [], i, t;
    for (i = 0; i < want.length; i++) {
      t = want[i];
      if (!PB.SUMMONS[t]) continue;
      counts[t] = counts[t] || 0;
      if (counts[t] >= PB.SUMMONS[t].cap) continue;
      counts[t]++;
      out.push(t);
    }
    return out;
  }

  PB.Classes = {
    get: get,
    of: of,
    ids: function () { return PB.CLASS_ORDER.slice(); },
    normalize: function (id) { return get(id) ? id : 'druid'; },
    order: function (save) { return of(save).order.slice(); },
    trees: function (save) { return of(save).trees.slice(); },
    kinType: kinType,
    startTypes: startTypes
  };
})(globalThis.PB = globalThis.PB || {});
