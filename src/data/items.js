// Item bases, rarities, uniques. Slots: staff, mask, pelt, talisman, charm (x2 equip slots: charm1, charm2).
(function (PB) {
  'use strict';
  PB.EQUIP_SLOTS = ['staff', 'mask', 'pelt', 'talisman', 'charm1', 'charm2'];
  PB.RARITIES = [
    { id: 'common', w: 70, affixes: [0, 0], maxBehavior: 0, color: '#d8d8d8' },
    { id: 'magic',  w: 22, affixes: [1, 2], maxBehavior: 1, color: '#6f9cff' },
    { id: 'rare',   w: 5,  affixes: [3, 4], maxBehavior: 2, color: '#ffd44a' },
    { id: 'set',    w: 2,  affixes: [0, 0], maxBehavior: 0, color: '#4ecf6a' },
    { id: 'unique', w: 1,  affixes: [0, 0], maxBehavior: 0, color: '#e8873a' }
  ];
  PB.ITEM_BASES = [
    { id: 'ashstaff',    slot: 'staff',    name: 'Ash Staff',       ilvl: 1,  implicit: { thornDmg: 4 } },
    { id: 'antlerstaff', slot: 'staff',    name: 'Antler Staff',    ilvl: 8,  implicit: { thornDmg: 8 } },
    { id: 'bonemask',    slot: 'mask',     name: 'Bone Mask',       ilvl: 1,  implicit: { spiritMax: 10 } },
    { id: 'stagmask',    slot: 'mask',     name: 'Stag Mask',       ilvl: 10, implicit: { spiritMax: 25 } },
    { id: 'hidepelt',    slot: 'pelt',     name: 'Hide Pelt',       ilvl: 1,  implicit: { armor: 5 } },
    { id: 'bearpelt',    slot: 'pelt',     name: 'Bear Pelt',       ilvl: 9,  implicit: { armor: 10 } },
    { id: 'knottotem',   slot: 'talisman', name: 'Knotted Totem',   ilvl: 1,  implicit: { packHp: 5 } },
    { id: 'moontotem',   slot: 'talisman', name: 'Moon Totem',      ilvl: 11, implicit: { packHp: 12 } },
    { id: 'fangcharm',   slot: 'charm',    name: 'Fang Charm',      ilvl: 1,  implicit: { wolfDmg: 5 } },
    { id: 'feathercharm',slot: 'charm',    name: 'Feather Charm',   ilvl: 1,  implicit: { ravenDmg: 5 } },
    { id: 'seedcharm',   slot: 'charm',    name: 'Seed Charm',      ilvl: 1,  implicit: { vineDmg: 5 } }
  ];
  PB.UNIQUES = [
    { id: 'fenrir',     base: 'fangcharm',   name: "Fenrir's Collar",          ilvl: 6,  behaviors: { fenrir: 1 },   text: 'While Frenzy is active, all wolves merge into one giant wolf with their combined life and damage.' },
    { id: 'thousandeye',base: 'stagmask',    name: 'The Thousand-Eyed Mask',   ilvl: 10, behaviors: { thousandeye: 1 }, text: 'Marks never expire. Each raven Marks every enemy it passes.' },
    { id: 'heartwood',  base: 'antlerstaff', name: 'Heartwood Staff',          ilvl: 8,  behaviors: { walkingvines: 1 }, text: 'Vines uproot and walk at 60% wolf speed, following the pack.' },
    { id: 'lullaby',    base: 'bearpelt',    name: "Ursa's Lullaby",           ilvl: 9,  behaviors: { lullaby: 1 },  text: 'Below 30% life your bear sleeps 3s (invulnerable, regenerating), then wakes enraged (+50% damage, 8s).' },
    { id: 'wildheart',  base: 'hidepelt',    name: 'Wildheart Pelt',           ilvl: 5,  behaviors: { wildheart: 1 }, text: 'Skinwalk has no time limit; your empty body becomes a stag that flees danger.' },
    { id: 'huntcrown',  base: 'moontotem',   name: 'Crown of the Wild Hunt',   ilvl: 12, behaviors: { huntcrown: 1 }, text: 'Chorus fills twice as fast; Echoes from the Wild Hunt linger 10s after it ends.' }
  ];
  PB.BASE_BY_ID = {};
  PB.ITEM_BASES.forEach(function (b) { PB.BASE_BY_ID[b.id] = b; });
})(globalThis.PB = globalThis.PB || {});
