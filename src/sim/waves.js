// Wave scaling and spawn lists. zone is 0-based, wave is 1..6 (6 = boss), moon is 0.. (post-game tiers).
(function (PB) {
  'use strict';
  var WAVES_PER_ZONE = 5;
  var CONCURRENT_CAP = 80;

  function scale(zone, wave, moon) {
    moon = moon || 0;
    return {
      hp: (1 + 0.35 * zone) * (1 + 0.08 * (wave - 1)) * Math.pow(1.6, moon),
      dmg: (1 + 0.25 * zone) * (1 + 0.05 * (wave - 1)) * Math.pow(1.4, moon),
      count: wave > WAVES_PER_ZONE ? 6 + 2 * zone : 8 + 3 * (wave - 1) + 4 * zone + 4 * moon,
      eliteChance: Math.min(0.35, 0.05 + 0.02 * (wave - 1) + 0.03 * zone + 0.05 * moon),
      ilvl: 1 + zone * 3 + wave + moon * 15
    };
  }

  function rollEliteMods(rng, n) {
    var pool = PB.ELITE_MODS.slice(), out = [];
    for (var i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0].id);
    return out;
  }

  // Deterministic spawn list: [{enemy, elite:[modIds], delay, edge}] ; boss wave puts the boss first.
  function buildWave(zoneIdx, wave, moon, rng) {
    var zone = PB.ZONES[zoneIdx], s = scale(zoneIdx, wave, moon), list = [];
    var keys = Object.keys(zone.enemies).sort();
    if (wave > WAVES_PER_ZONE) list.push({ enemy: zone.boss, boss: true, elite: [], delay: 0, edge: 0 });
    for (var i = 0; i < s.count; i++) {
      var enemy = rng.weighted(keys, function (k) { return zone.enemies[k]; });
      var elite = rng.chance(s.eliteChance) ? rollEliteMods(rng, 1 + Math.min(2, moon || 0)) : []; // Moon 0: 1 mod, Moon 1: 2, Moon 2+: 3
      list.push({ enemy: enemy, boss: false, elite: elite, delay: +(i * 0.35 + rng.range(0, 0.3)).toFixed(3), edge: rng.int(0, 3) });
    }
    if (wave <= WAVES_PER_ZONE && list.length) {
      var q = quarry(zoneIdx, moon), nq = Math.min(2, list.length), qi;
      for (qi = 0; qi < nq; qi++) list[qi].enemy = q; // the wood's quarry is in the wave, not a rumor
    }
    return { scale: s, spawns: list };
  }

  // The creature this wood is hungry for. Same zone, next Moon, a different quarry.
  function quarry(zone, moon) {
    var z = PB.ZONES[zone] || PB.ZONES[0], ids = Object.keys(z.enemies).sort();
    return ids[Math.abs((zone + 1) * 13 + (moon || 0) * 7) % ids.length];
  }

  function isQuarry(dir, type) { return !!(dir && type === quarry(dir.zone, dir.moon)); }

  PB.Waves = { scale: scale, buildWave: buildWave, quarry: quarry, isQuarry: isQuarry, WAVES_PER_ZONE: WAVES_PER_ZONE, CONCURRENT_CAP: CONCURRENT_CAP };
})(globalThis.PB = globalThis.PB || {});
