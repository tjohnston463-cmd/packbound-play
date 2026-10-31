// Fusion Altar logic: two roster individuals + Moonstones -> one fused individual.
(function (PB) {
  'use strict';

  function key(a, b) { return [a, b].sort().join('+'); }

  // Returns {id, name, alpha:boolean} or null for types that cannot fuse (already-fused types).
  function result(typeA, typeB) {
    if (!PB.SUMMONS[typeA] || !PB.SUMMONS[typeB]) return null;
    if (typeA === typeB) return { id: PB.ALPHA[typeA].id, name: PB.ALPHA[typeA].name, alpha: true };
    var f = PB.FUSIONS[key(typeA, typeB)];
    return f ? { id: f.id, name: f.name, alpha: false } : null;
  }

  function fusionSlots(save, stats) {
    return 1 + (save.player.level >= 15 ? 1 : 0) + ((stats && stats.fusionSlots) || 0);
  }

  function find(save, id) {
    for (var i = 0; i < save.roster.length; i++) if (save.roster[i].id === id) return save.roster[i];
    return null;
  }

  function canFuse(save, aId, bId, stats) {
    if (aId === bId) return { ok: false, reason: 'same-individual' };
    var a = find(save, aId), b = find(save, bId);
    if (!a || !b) return { ok: false, reason: 'missing' };
    if (a.fusedFrom || b.fusedFrom) return { ok: false, reason: 'already-fused' };
    if (a.tier < 2 || b.tier < 2) return { ok: false, reason: 'rank' };
    var r = result(a.type, b.type);
    if (!r) return { ok: false, reason: 'no-recipe' };
    var cost = r.alpha ? PB.FUSION_COST.alpha : PB.FUSION_COST.cross;
    if ((save.currency.moonstones || 0) < cost) return { ok: false, reason: 'moonstones', cost: cost };
    var fusedCount = save.roster.filter(function (x) { return !!x.fusedFrom; }).length;
    if (fusedCount >= fusionSlots(save, stats)) return { ok: false, reason: 'slots' };
    return { ok: true, result: r, cost: cost };
  }

  function fuse(save, aId, bId, rng, stats) {
    var check = canFuse(save, aId, bId, stats);
    if (!check.ok) return check;
    var a = find(save, aId), b = find(save, bId), r = check.result;
    var scars = [];
    a.scars.concat(b.scars).forEach(function (s) { if (scars.indexOf(s) < 0 && scars.length < PB.MAX_SCARS) scars.push(s); });
    var diet = {};
    PB.ESSENCES.forEach(function (e) { diet[e] = (a.diet[e] || 0) + (b.diet[e] || 0); });
    var deeds = {};
    Object.keys(a.deeds).forEach(function (k) { deeds[k] = typeof a.deeds[k] === 'boolean' ? (a.deeds[k] || b.deeds[k]) : a.deeds[k] + b.deeds[k]; });
    var fused = {
      id: save.nextIndId++, type: r.id,
      name: a.name.slice(0, Math.ceil(a.name.length / 2)) + b.name.slice(Math.floor(b.name.length / 2)).toLowerCase(),
      level: Math.max(a.level, b.level), xp: 0, tier: 2, branch: null, infusion: a.infusion || b.infusion,
      diet: diet, scars: scars, deeds: deeds,
      fusedFrom: [{ id: a.id, type: a.type, name: a.name, tags: [a.type] }, { id: b.id, type: b.type, name: b.name, tags: [b.type] }]
    };
    save.roster = save.roster.filter(function (x) { return x.id !== aId && x.id !== bId; });
    save.roster.push(fused);
    save.currency.moonstones -= check.cost;
    save.codex.fusions[r.id] = true;
    return { ok: true, individual: fused };
  }

  PB.Fusion = { key: key, result: result, canFuse: canFuse, fuse: fuse, fusionSlots: fusionSlots };
})(globalThis.PB = globalThis.PB || {});
