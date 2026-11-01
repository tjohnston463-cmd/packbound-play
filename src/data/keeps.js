// What each boss keeps. The class pieces are filtered at the roll, so a paladin never sees Moonclaw
// and a druid never sees Grimspire. The first time you carry a prize home from that boss, it was promised.
// After that the boss still leaves one, about a third of the time. The list is the farm.
(function (PB) {
  'use strict';
  PB.KEEPS = {
    hollowstag: ['moonclaw', 'handoath', 'marrowwand', 'galeeye', 'thunderstroke', 'grimspire', 'wildheart', 'fenrir', 'lullaby'],
    cindermother: ['heartwood', 'thousandeye', 'galeeye', 'fenrir'],
    palematriarch: ['marrowwand', 'huntcrown', 'lullaby', 'thousandeye'],
    tempestroc: ['thunderstroke', 'galeeye', 'huntcrown', 'heartwood'],
    unmaker: ['grimspire', 'handoath', 'crackedmoon', 'huntcrown', 'wildheart']
  };
})(globalThis.PB = globalThis.PB || {});
