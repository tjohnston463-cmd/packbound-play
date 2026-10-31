// Grove Runes and the five words they finish. A rune in an item grants its own small stat.
// A finished word (right runes, right order, right slot) replaces those loose stats with the word.
// Staffs hold two. Mask, pelt and talisman hold one. Charms hold none.
(function (PB) {
  'use strict';
  PB.RUNES = [
    { id: 'fang',    name: 'Fang Rune',    tier: 1, stat: 'wolfDmg',     value: 8,  text: '+8% wolf damage' },
    { id: 'thorn',   name: 'Thorn Rune',   tier: 2, stat: 'vineDmg',     value: 8,  text: '+8% vine damage' },
    { id: 'feather', name: 'Feather Rune', tier: 3, stat: 'ravenDmg',    value: 8,  text: '+8% raven damage' },
    { id: 'oak',     name: 'Oak Rune',     tier: 4, stat: 'bearHp',      value: 12, text: '+12% bear life' },
    { id: 'ember',   name: 'Ember Rune',   tier: 5, stat: 'packLeech',   value: 2,  text: 'Summons leech 2% of damage as life' },
    { id: 'moon',    name: 'Moon Rune',    tier: 6, stat: 'spiritRegen', value: 12, text: '+12% Spirit regeneration' }
  ];
  PB.RUNE_BY_ID = {};
  PB.RUNES.forEach(function (r) { PB.RUNE_BY_ID[r.id] = r; });
  PB.SOCKET_CAP = { staff: 2, mask: 1, pelt: 1, talisman: 1, charm: 0 };
  PB.RUNE_WORDS = [
    { id: 'wolfhowl', name: 'Wolfhowl', slot: 'staff', runes: ['fang', 'thorn'],
      stats: { wolfDmg: 25, packAtkSpd: 8 }, behaviors: { wolfhowl: 1 },
      text: 'Every 4th wolf bite howls. Nearby summons swing faster, and the prey is slowed. +25% wolf damage. Attack speed sits on the 8% step.' },
    { id: 'briarwake', name: 'Briarwake', slot: 'staff', runes: ['thorn', 'ember'],
      stats: { vineDmg: 25 }, behaviors: { briarwake: 1 },
      text: 'Every 4 seconds each vine bursts. What it catches is slowed. +25% vine damage.' },
    { id: 'crowmark', name: 'Crowmark', slot: 'mask', runes: ['feather'],
      stats: { ravenDmg: 18, markDmg: 10 }, behaviors: { crowmark: 1 },
      text: 'A raven Mark jumps to one nearby foe. +18% raven damage. Marked foes take +10% damage.' },
    { id: 'oakheart', name: 'Oakheart', slot: 'pelt', runes: ['oak'],
      stats: { bearHp: 30, bearDmg: 20 }, behaviors: { oakheart: 1 },
      text: 'The bear taunts whatever it mauls. +30% bear life and +20% bear damage.' },
    { id: 'hearthbond', name: 'Hearthbond', slot: 'talisman', runes: ['moon'],
      stats: { spiritRegen: 30, chorusDmg: 15 }, behaviors: { hearthbond: 1 },
      text: 'The first killing blow in 20 seconds leaves that summon at 1 life. +30% Spirit regeneration and +15% Chorus damage.' }
  ];

  function cap(slot) { var n = PB.SOCKET_CAP[slot]; return n == null ? 0 : n; }

  function byTier(tier) {
    for (var i = 0; i < PB.RUNES.length; i++) if (PB.RUNES[i].tier === tier) return PB.RUNES[i].id;
    return null;
  }
  function next(id) { var r = PB.RUNE_BY_ID[id]; return r ? byTier(r.tier + 1) : null; }
  function prev(id) { var r = PB.RUNE_BY_ID[id]; return r ? byTier(r.tier - 1) : null; }

  function wordOn(item) {
    if (!item || !item.sockets || !item.sockets.length) return null;
    var sockets = item.sockets;
    for (var i = 0; i < PB.RUNE_WORDS.length; i++) {
      var w = PB.RUNE_WORDS[i];
      if (w.slot !== item.slot || w.runes.length !== sockets.length) continue;
      var ok = true;
      for (var k = 0; k < w.runes.length; k++) if (w.runes[k] !== sockets[k]) ok = false;
      if (ok) return w;
    }
    return null;
  }

  // A finished word replaces the loose rune stats. An unfinished socket keeps each rune's own stat.
  function grant(item, stats, behaviors) {
    if (!item || !item.sockets || !item.sockets.length) return;
    var word = wordOn(item), k;
    if (word) {
      for (k in word.stats) stats[k] = (stats[k] || 0) + word.stats[k];
      for (k in word.behaviors) behaviors[k] = Math.max(behaviors[k] || 0, word.behaviors[k]);
      return;
    }
    item.sockets.forEach(function (id) {
      var r = PB.RUNE_BY_ID[id];
      if (r) stats[r.stat] = (stats[r.stat] || 0) + r.value;
    });
  }

  // Higher item level leans toward the later runes. Fang still shows up; Moon does not, until the zone is deep.
  function roll(rng, ilvl) {
    ilvl = ilvl || 1;
    return rng.weighted(PB.RUNES, function (r) {
      var center = 1 + (r.tier - 1) * 6;
      return Math.max(1, 18 - Math.abs(ilvl - center));
    }).id;
  }

  function emptyPouch() {
    var o = {};
    PB.RUNES.forEach(function (r) { o[r.id] = 0; });
    return o;
  }

  PB.Runes = { cap: cap, next: next, prev: prev, wordOn: wordOn, grant: grant, roll: roll, emptyPouch: emptyPouch };
})(globalThis.PB = globalThis.PB || {});
