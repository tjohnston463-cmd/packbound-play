// Skill tree allocation. alloc = {nodeId: rank}. Points: 1 per player level after 1, plus 1 per boss first-kill.
(function (PB) {
  'use strict';

  function spentIn(alloc, tree) {
    var n = 0;
    for (var id in alloc) if (PB.SKILL_BY_ID[id] && PB.SKILL_BY_ID[id].tree === tree) n += alloc[id];
    return n;
  }
  function spent(alloc) { var n = 0; for (var id in alloc) n += alloc[id]; return n; }
  function pointsTotal(player) { return (player.level - 1) + (player.bonusPoints || 0); }
  function pointsLeft(player) { return Math.max(0, pointsTotal(player) - spent(player.skills || {})); }

  function canAllocate(player, nodeId) {
    var node = PB.SKILL_BY_ID[nodeId];
    if (!node) return { ok: false, reason: 'unknown' };
    if ((node.cls || 'druid') !== (player.classId || 'druid')) return { ok: false, reason: 'class' };
    var alloc = player.skills, rank = alloc[nodeId] || 0;
    if (rank >= node.max) return { ok: false, reason: 'max' };
    if (spent(alloc) >= pointsTotal(player)) return { ok: false, reason: 'points' };
    var reqs = node.req || [];
    for (var i = 0; i < reqs.length; i++) if (!alloc[reqs[i]]) return { ok: false, reason: 'requires', node: reqs[i] };
    if (spentIn(alloc, node.tree) < PB.SKILL_TIER_REQ[node.tier]) return { ok: false, reason: 'tier' };
    return { ok: true };
  }

  function allocate(player, nodeId) {
    var c = canAllocate(player, nodeId);
    if (c.ok) player.skills[nodeId] = (player.skills[nodeId] || 0) + 1;
    return c;
  }

  // Free respec at camp (decision: experimenting is the fun).
  function respec(player) { player.skills = {}; }

  function aggregate(alloc) {
    var stats = {}, behaviors = {};
    Object.keys(alloc).sort().forEach(function (id) {
      var node = PB.SKILL_BY_ID[id];
      if (!node || !alloc[id]) return;
      var eff = node.effect(alloc[id]);
      for (var k in eff) {
        if (k === 'behaviors') { for (var b in eff.behaviors) behaviors[b] = eff.behaviors[b]; }
        else stats[k] = (stats[k] || 0) + eff[k];
      }
    });
    // Diablo-style: ranks in one skill feed another you already use. The build is the point.
    PB.SKILL_SYNERGIES.forEach(function (s) {
      var r = alloc[s.from] || 0;
      if (r) stats[s.stat] = (stats[s.stat] || 0) + s.per * r;
    });
    return { stats: stats, behaviors: behaviors };
  }

  // from = the skill you rank. stat/per = what that rank adds on top of the other skill's own effect.
  PB.SKILL_SYNERGIES = [
    { from: 'tactics', stat: 'howlDmg', per: 8 },
    { from: 'keeneyes', stat: 'markCrit', per: 5 },
    { from: 'ursine', stat: 'bearGuard', per: 5 },
    { from: 'blight', stat: 'rootDmg', per: 10 },
    { from: 'wellspring', stat: 'chorusDmg', per: 5 },
    { from: 'wereclaw', stat: 'wolfDmg', per: 5 }
  ];
  (PB.CLASS_SYNERGIES || []).forEach(function (s) { PB.SKILL_SYNERGIES.push(s); });

  PB.Skills = { canAllocate: canAllocate, allocate: allocate, respec: respec, aggregate: aggregate, spentIn: spentIn, spent: spent, pointsTotal: pointsTotal, pointsLeft: pointsLeft };
})(globalThis.PB = globalThis.PB || {});
