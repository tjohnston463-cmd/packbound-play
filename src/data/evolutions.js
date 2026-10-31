// Evolution branches per base type. Tier 2 at level 5 (choose A or B), tier 3 at level 12 (capstone of that branch).
// mods are multipliers/flags read by sim/evolution.statsFor and the AI. A Tier III summon keeps its Tier II mods
// (statsFor merges both into ent.evo), so a Shadowfang still lunges like a Hunter.
(function (PB) {
  'use strict';
  PB.EVOLVE_LEVELS = { 2: 5, 3: 12 };
  PB.EVOLUTIONS = {
    wolf: {
      A: { t2: { name: 'Hunter',   mods: { dmg: 1.25, crit: 0.10, lunge: 180 }, text: '+25% damage, +10% crit; lunge range 180px' },
           t3: { name: 'Shadowfang', mods: { dmg: 1.2, bleed: 1, leap: 320 }, text: 'Leaps between Marked targets; crits cause bleed (40% of hit over 3s)' } },
      B: { t2: { name: 'Guardian', mods: { hp: 1.5, taunt: 1 },        text: '+50% life; intercepts melee aimed at the druid' },
           t3: { name: 'Hearthwolf', mods: { hp: 1.3, intercept: 1 },  text: 'Leaps in front of projectiles aimed at the druid and eats them' } }
    },
    raven: {
      A: { t2: { name: 'Seer',     mods: { markDur: 2, markSpread: 1 }, text: 'Mark +2s; Mark jumps to one nearby enemy when the target dies' },
           t3: { name: 'Omenwing', mods: { markBurst: 1 },              text: 'Marked deaths burst, Marking all enemies within 120px' } },
      B: { t2: { name: 'Razor',    mods: { dmg: 1.6, bleed: 1 },         text: '+60% damage; pecks bleed' },
           t3: { name: 'Stormcrow', mods: { dmg: 1.2, chain: 2 },        text: 'Pecks chain lightning to 2 more enemies' } }
    },
    bear: {
      A: { t2: { name: 'Bulwark',  mods: { hp: 1.4, dr: 0.15, tauntCd: 4 }, text: '+40% life, 15% less damage taken; taunt every 4s' },
           t3: { name: 'Mountain', mods: { hp: 1.2, quake: 1 },          text: 'Every 3rd maul is a quake: roots 1s in 130px' } },
      B: { t2: { name: 'Ravager',  mods: { dmg: 1.4, charge: 1 },        text: '+40% damage; charges targets 250px away' },
           t3: { name: 'Berserker',mods: { rage: 1 },                    text: 'Up to +100% damage as life falls; kills heal 5%' } }
    },
    vine: {
      A: { t2: { name: 'Strangler', mods: { rootDur: 1.0, pull: 60 },   text: 'Root +1s; pulls grabbed enemies 60px toward the vine' },
           t3: { name: 'Devourer',  mods: { execute: 0.15 },            text: 'Swallows rooted non-boss enemies below 15% life' } },
      B: { t2: { name: 'Bloom',     mods: { cloud: 1, heal: 4 },        text: 'Poison cloud on grab; heals summons in range 4/s' },
           t3: { name: 'Mother Briar', mods: { sapling: 12 },           text: 'Spawns a sapling (40% stats, 12s) every 12s' } }
    },
    spirit: {
      A: { t2: { name: 'Oak Sage',  mods: { regen: 2.5 },               text: 'Regen aura x2.5' },
           t3: { name: 'Elder Oak', mods: { denFast: 0.5, killShield: 1 }, text: 'Den recovery 50% faster; pack kills grant 5% shields' } },
      B: { t2: { name: 'Wolverine', mods: { dmgAura: 0.25 },            text: 'Damage aura becomes +25%' },
           t3: { name: 'Bloodmoon', mods: { leechAura: 0.06, frenzyOnKill: 1 }, text: 'Pack leeches 6%; elite kills trigger a free 3s Frenzy' } }
    }
  };
  PB.SCARS = [
    { id: 'firstborn',  name: 'Firstborn',  text: '+10% life',                  test: function (d) { return d.firstborn; } },
    { id: 'kingslayer', name: 'Kingslayer', text: '+20% damage vs bosses',      test: function (d) { return d.bossKills >= 1; } },
    { id: 'stubborn',   name: 'Stubborn',   text: '15% chance to survive a killing blow at 1 life', test: function (d) { return d.nearDeaths >= 3; } },
    { id: 'glutton',    name: 'Glutton',    text: 'Eating heals twice as much', test: function (d) { return d.eaten >= 40; } },
    { id: 'butcher',    name: 'Butcher',    text: '+5% crit chance',            test: function (d) { return d.kills >= 150; } },
    { id: 'loyal',      name: 'Loyal',      text: '+20% speed when Rallied',    test: function (d) { return d.rallies >= 30; } },
    { id: 'bonebreaker',name: 'Bonebreaker',text: 'Crit multiplier 1.9 (base 1.75)',           test: function (d) { return d.crits >= 60; } },
    { id: 'warden',     name: 'Warden',     text: '+10% damage reduction',      test: function (d) { return d.damageTaken >= 3000; } },
    { id: 'chorister',  name: 'Chorister',  text: 'Its Chorus hits count double', test: function (d) { return d.choruses >= 25; } }
  ];
  PB.MAX_SCARS = 3;
  PB.NAME_PARTS = {
    wolf:   [['Ash', 'Grey', 'Fen', 'Rune', 'Sorrow', 'Kor', 'Vel', 'Sable'], ['fang', 'paw', 'mane', 'tooth', 'howl', 'run', 'ka', 'ric']],
    raven:  [['Quill', 'Nev', 'Hug', 'Mun', 'Corv', 'Tar', 'Ink'], ['in', 'ra', 'wing', 'eye', 'ash', 'ot']],
    bear:   [['Old', 'Ur', 'Bram', 'Moss', 'Thun', 'Hal'], ['sa', 'den', 'hide', 'paw', 'bjorn', 'gar']],
    vine:   [['Thistle', 'Brier', 'Nettle', 'Wort', 'Ivy', 'Bram'], ['root', 'knot', 'coil', 'thorn', 'ble']],
    spirit: [['Ember', 'Hearth', 'Lume', 'Wisp', 'Ond', 'Sel'], ['glow', 'light', 'ine', 'a', 'mere']]
  };
})(globalThis.PB = globalThis.PB || {});
