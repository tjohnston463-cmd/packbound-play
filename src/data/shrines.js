// Grove shrines. One stands in the wood each wave. Walk into it. The red one is a choice.
(function (PB) {
  'use strict';
  PB.GROVE_SHRINES = [
    { id: 'combat', name: 'Combat Shrine', color: '#ffd44a', cursed: false,
      text: 'The pack and the whip hit harder, and the pack swings faster.',
      boon: { dmg: 0.20, atk: 0.15, dur: 25 } },
    { id: 'moon', name: 'Moon Shrine', color: '#8eb6ff', cursed: false,
      text: 'Spirit surges, and the well runs faster.',
      boon: { spirit: 0.40, regen: 0.35, dur: 25 } },
    { id: 'den', name: 'Den Shrine', color: '#7dff9a', cursed: false,
      text: 'The soonest friend in the Den stands back up.',
      instant: 'den' },
    { id: 'greed', name: 'Greed Shrine', color: '#e2c27a', cursed: false,
      text: 'Better drops for this wave. You and the pack bruise easier.',
      boon: { mf: 80, taken: 0.12, waveBound: true } },
    { id: 'monster', name: 'Monster Shrine', color: '#e85a4a', cursed: true,
      text: 'The wood turns. The next kill pays a rune.',
      boon: { enemyDmg: 0.25, enemySpd: 0.20, runeDue: 1, dur: 20 } }
  ];
  PB.GROVE_BY_ID = {};
  PB.GROVE_SHRINES.forEach(function (s) { PB.GROVE_BY_ID[s.id] = s; });
})(globalThis.PB = globalThis.PB || {});
