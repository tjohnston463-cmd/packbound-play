// Three callings. The Wildcaller (druid) is the original hunt. The Gravecaller and the Stormbinder
// share the wood, the loot, the Moon and the altar, and they do not share a pack or a basic attack.
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
    nimbus: { A: ['Gale Sage', 'Elder Gale'], B: ['Wolverine', 'Blood Storm'] }
  };
  var KIN_OF = { skeleton: 'wolf', mage: 'raven', golem: 'bear', spike: 'vine', priest: 'spirit', ember: 'wolf', wisp: 'raven', monolith: 'bear', hydra: 'vine', nimbus: 'spirit' };
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
    }
  };
  var ALPHA_NAMES = {
    necro: { wolf: ['Shambler', 'shambler'], raven: ['College', 'bonecollege'], bear: ['Colossus', 'colossus'], vine: ['Spike Grove', 'spikegrove'], spirit: ['Twin Priest', 'twinpriest'] },
    sorc: { wolf: ['Alpha Cinder', 'alphacinder'], raven: ['Tempest', 'tempest'], bear: ['Obelisk', 'obelisk'], vine: ['Hydra Brood', 'hydrabrood'], spirit: ['Twin Storm', 'twinstorm'] }
  };
  var CLASS_KIN = {
    necro: { wolf: 'skeleton', raven: 'mage', bear: 'golem', vine: 'spike', spirit: 'priest' },
    sorc: { wolf: 'ember', raven: 'wisp', bear: 'monolith', vine: 'hydra', spirit: 'nimbus' }
  };
  var CLASS_PAL = { necro: BONE, sorc: STORM };

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
      paint(row.id, FAM[src.id] || 'blob', CLASS_PAL[classId], classId === 'sorc' ? '#fff6c0' : '#f4efe2', null);
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

  paint('necro', 'robed', ['#2a2438', '#120e18', '#e4d4ff'], '#d0b0ff', null);
  paint('sorc', 'robed', ['#1c2448', '#0c1024', '#f5e46a'], '#fff6c0', null);

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
  node('necro', 'spearhead', 'bone', 3, 5, 'Spearhead', '+4 Bone Spear damage per rank. The staff still steps the spear.', function (r) { return { spearDmg: 4 * r }; }, ['legion']);
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
  node('sorc', 'pyre', 'flame', 1, 5, 'Pyre', '+3 Fireball damage per rank. This is your weapon.', function (r) { return { boltDmg: 3 * r }; });
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
    { from: 'spring', stat: 'chorusDmg', per: 5 }
  ];

  PB.TREE_NAME = {
    fang: 'Fang', wingroot: 'Wing & Root', command: 'Command',
    bone: 'Bone', grave: 'Grave', rite: 'Rite',
    flame: 'Flame', frost: 'Frost', arcane: 'Arcane'
  };
  PB.TREE_TEXT = {
    fang: 'wolves and the bear', wingroot: 'ravens and vines', command: 'spirits, orders, fusion',
    bone: 'skeletons, the golem, the spear', grave: 'mages and spikes', rite: 'the priest, orders, fusion',
    flame: 'the fireball and the hydra', frost: 'the monolith', arcane: 'mana, form, the Chorus'
  };

  var CLASSES = [
    { id: 'druid', name: 'Druid', title: 'Wildcaller', order: ['wolf', 'raven', 'bear', 'vine', 'spirit'], trees: ['fang', 'wingroot', 'command'],
      kin: { wolf: 'wolf', raven: 'raven', bear: 'bear', vine: 'vine', spirit: 'spirit' },
      attack: 'thornlash', attackName: 'Thornlash', attackText: 'Thornlash: a short whip cone. In menus: select',
      resource: 'Spirit', body: 'druid', glow: 'green', orb: ['#0c2a6a', '#4f8de0'],
      plantNote: '(the vine roots at the cursor)', moveText: 'Move the druid (or the summon you Skinwalk)',
      blurb: 'The whip marks. The pack kills.', fantasy: 'You conduct the living wood. The whip tells them where to bite.' },
    { id: 'necro', name: 'Necromancer', title: 'Gravecaller', order: ['skeleton', 'mage', 'golem', 'spike', 'priest'], trees: ['bone', 'grave', 'rite'],
      kin: CLASS_KIN.necro,
      attack: 'bonespear', attackName: 'Bone Spear', attackText: 'Bone Spear: a piercing line. It curses. In menus: select',
      resource: 'Essence', body: 'necro', glow: 'purple', orb: ['#241433', '#9a6ad0'],
      plantNote: '(the spike roots at the cursor)', moveText: 'Move the necromancer (or the summon you possess)',
      blurb: 'Pierce. Curse. The dead do the rest.', fantasy: 'Bone Spear curses a line. Skeletons answer it. Grove gear follows your hunters.' },
    { id: 'sorc', name: 'Sorceress', title: 'Stormbinder', order: ['ember', 'wisp', 'monolith', 'hydra', 'nimbus'], trees: ['flame', 'frost', 'arcane'],
      kin: CLASS_KIN.sorc,
      attack: 'fireball', attackName: 'Fireball', attackText: 'Fireball: you are the damage. It bursts. In menus: select',
      resource: 'Mana', body: 'sorc', glow: 'gold', orb: ['#3a2410', '#e8873a'],
      plantNote: '(the hydra roots at the cursor)', moveText: 'Move the sorceress (or the summon you become)',
      blurb: 'You are the damage. They feed the blast.', fantasy: 'Fireball is the weapon. Hydra ranks feed it. The monolith is the wall.' }
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

  PB.Classes = {
    get: get,
    of: of,
    ids: function () { return PB.CLASS_ORDER.slice(); },
    normalize: function (id) { return get(id) ? id : 'druid'; },
    order: function (save) { return of(save).order.slice(); },
    trees: function (save) { return of(save).trees.slice(); },
    kinType: kinType
  };
})(globalThis.PB = globalThis.PB || {});
