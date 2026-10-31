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
    { id: 'seedcharm',   slot: 'charm',    name: 'Seed Charm',      ilvl: 1,  implicit: { vineDmg: 5 } },
    // The board, not the two worn charm slots. span is how many cells it takes.
    { id: 'grovecharm',  slot: 'board',    name: 'Grove Charm',     ilvl: 1,  span: 1, implicit: {} },
    { id: 'mooncharm',   slot: 'board',    name: 'Moon Charm',      ilvl: 6,  span: 2, implicit: {} }
  ];
  PB.UNIQUES = [
    { id: 'fenrir',     base: 'fangcharm',   name: "Fenrir's Collar",          ilvl: 6,  behaviors: { fenrir: 1 },   text: 'While Frenzy is active, all wolves merge into one giant wolf with their combined life and damage.' },
    { id: 'thousandeye',base: 'stagmask',    name: 'The Thousand-Eyed Mask',   ilvl: 10, behaviors: { thousandeye: 1 }, text: 'Marks never expire. Each raven Marks every enemy it passes.' },
    { id: 'heartwood',  base: 'antlerstaff', name: 'Heartwood Staff',          ilvl: 8,  behaviors: { walkingvines: 1 }, text: 'Vines uproot and walk at 60% wolf speed, following the pack.' },
    { id: 'lullaby',    base: 'bearpelt',    name: "Ursa's Lullaby",           ilvl: 9,  behaviors: { lullaby: 1 },  text: 'Below 30% life your bear sleeps 3s (invulnerable, regenerating), then wakes enraged (+50% damage, 8s).' },
    { id: 'wildheart',  base: 'hidepelt',    name: 'Wildheart Pelt',           ilvl: 5,  behaviors: { wildheart: 1 }, text: 'Skinwalk has no time limit; your empty body becomes a stag that flees danger.' },
    { id: 'huntcrown',  base: 'moontotem',   name: 'Crown of the Wild Hunt',   ilvl: 12, behaviors: { huntcrown: 1 }, text: 'Chorus fills twice as fast; Echoes from the Wild Hunt linger 10s after it ends.' },
    { id: 'moonclaw',   base: 'hidepelt',    name: 'Moonclaw Pelt',            ilvl: 7,  cls: 'druid', behaviors: { wereheart: 1 }, text: 'Wereclaw returns 6 more life on the marked body, and the claw hits as if it were one rank deeper. Only a Wildcaller can find this.' },
    { id: 'handoath',   base: 'ashstaff',    name: 'Hand of the Oath',         ilvl: 6,  cls: 'pala', behaviors: { zealheart: 1 }, text: 'Zeal strikes once more, and a landed swing returns 4 life. Only an Oathbound can find this.' },
    { id: 'marrowwand', base: 'ashstaff',    name: 'Marrow Wand',              ilvl: 6,  cls: 'necro', behaviors: { marrowheart: 1 }, text: 'Bone Spear\'s curse lasts longer and leaps once to a body beside the line. It does not pierce that body. Only a Gravecaller can find this.' },
    { id: 'galeeye',    base: 'stagmask',    name: 'Eye of the Gale',          ilvl: 8,  cls: 'sorc', behaviors: { galeheart: 1 }, text: 'Fireball bursts wider, and a landed blast returns 4 Mana. Only a Stormbinder can find this.' },
    { id: 'thunderstroke', base: 'antlerstaff', name: 'Thunderstroke',         ilvl: 7,  cls: 'amaz', behaviors: { furyheart: 1 }, text: 'Lightning Fury forks once more. Only a Skymark can find this.' },
    { id: 'grimspire',  base: 'ashstaff',    name: 'Grimspire',                ilvl: 7,  cls: 'barb', behaviors: { whirlheart: 1 }, text: 'Whirlwind reaches farther, and the frenzy holds a second longer. Only a Warbound can find this.' },
    { id: 'crackedmoon', base: 'moontotem', name: 'Cracked Moon',            ilvl: 14, behaviors: { sunder: 1 }, text: 'A ward no longer stops its element. The body takes a fifth of it, and your own wards sit 20 lower. Any calling can find this.' }
  ];
  PB.BASE_BY_ID = {};
  PB.ITEM_BASES.forEach(function (b) { PB.BASE_BY_ID[b.id] = b; });
})(globalThis.PB = globalThis.PB || {});
