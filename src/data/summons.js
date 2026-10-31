// Base summon types. Units: px, px/s, seconds. Level scaling lives in sim/evolution.js.
(function (PB) {
  'use strict';
  PB.SUMMON_ORDER = ['wolf', 'raven', 'bear', 'vine', 'spirit'];
  PB.SUMMONS = {
    wolf:   { name: 'Wolf',        key: '1', cost: 15, cap: 5, hp: 60,  dmg: [6, 9],   atk: 0.8, range: 26,  speed: 230, r: 11, mass: 1.0, tags: ['wolf'],   ai: 'flank',  note: 'fast melee hunter; lunges 120px; crits Marked prey' },
    raven:  { name: 'Raven',       key: '2', cost: 8,  cap: 6, hp: 20,  dmg: [3, 4],   atk: 0.6, range: 18,  speed: 300, r: 7,  mass: 0.3, tags: ['raven'],  ai: 'dart',   flying: true, note: 'orbits the druid, darts in, applies Mark (4s)' },
    bear:   { name: 'Spirit Bear', key: '3', cost: 40, cap: 1, hp: 300, dmg: [18, 26], atk: 1.4, range: 34,  speed: 150, r: 20, mass: 4.0, tags: ['bear'],   ai: 'guard',  note: 'tank; taunts within 140px every 6s; maul knocks back' },
    vine:   { name: 'Briar Vine',  key: '4', cost: 20, cap: 3, hp: 80,  dmg: [4, 6],   atk: 4.0, range: 140, speed: 0,   r: 14, mass: 99,  tags: ['vine'],   ai: 'rooted', rooted: true, note: 'planted at cursor; grabs (root 1.5s) + poison 4/s for 3s' },
    spirit: { name: 'Hearth Spirit', key: '5', cost: 30, cap: 1, hp: 50, dmg: [0, 0],  atk: 0,   range: 220, speed: 200, r: 10, mass: 0.5, tags: ['spirit'], ai: 'aura',   flying: true, aura: { radius: 220, regen: 3, dmgInc: 0.10 }, note: 'aura: +3 HP/s regen and +10% damage to pack' }
  };
})(globalThis.PB = globalThis.PB || {});
