// The mods pipeline (plan D3): world.mods = {stats, behaviors} merged from the equipped items (Loot.aggregate), the
// skill tree (Skills.aggregate) and the Echoes (+2% pack damage each, stats.packDmgEcho). Numbers are summed and
// behaviors take the max. apply() rebuilds a live world's mods after a camp or inventory change.
(function (PB) {
  'use strict';

  function equipped(save) {
    var out = [];
    PB.Save.SLOTS.forEach(function (k) {
      var uid = save.equipped[k];
      if (uid == null) return;
      for (var i = 0; i < save.inventory.length; i++) if (save.inventory[i].uid === uid) { out.push(save.inventory[i]); return; }
    });
    return out;
  }

  function build(save) {
    var stats = {}, behaviors = {};
    if (!save) return { stats: stats, behaviors: behaviors };
    var carried = (save.board || []).filter(function (it) { return it && !it.unread; });
    [PB.Loot.aggregate(equipped(save).concat(carried)), PB.Skills.aggregate(save.player.skills || {}, PB.Charms ? PB.Charms.bonus(save) : {})].forEach(function (src) {
      var k;
      for (k in src.stats) stats[k] = (stats[k] || 0) + src.stats[k];
      for (k in src.behaviors) behaviors[k] = Math.max(behaviors[k] || 0, src.behaviors[k]);
    });
    var n = (save.echoes || []).length;
    if (n) stats.packDmgEcho = 2 * n;
    var steps = Math.floor(((save.player && save.player.level) || 1) / 5);
    if (steps) {
      stats.levelSpike = (stats.levelSpike || 0) + 4 * steps; // +4% summon damage at 5, 10, 15, 20
      stats.atkBreak = (stats.atkBreak || 0) + 8 * steps; // the same levels step summon attack speed
    }
    return { stats: stats, behaviors: behaviors };
  }

  // Rebuild world.mods from world.save; every called body takes its new stats (life % kept), the druid its Spirit.
  function apply(world) {
    var p = world.player, old = world.mods.stats.spiritMax || 0;
    world.mods = build(world.save);
    var ds = (world.mods.stats.spiritMax || 0) - old;
    p.maxSpirit += ds; p.spirit = Math.max(0, Math.min(p.maxSpirit, p.spirit + Math.max(0, ds)));
    Object.keys(world.active).sort(function (a, b) { return a - b; }).forEach(function (id) {
      var ind = world.inds[id];
      if (ind) PB.World.refreshIndividual(world, ind);
    });
    world._flagsTick = -1;
    return world.mods;
  }

  PB.Mods = { build: build, apply: apply, equipped: equipped };
})(globalThis.PB = globalThis.PB || {});
