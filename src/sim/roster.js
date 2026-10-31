// Roster lifecycle in the field: who answers a summon key, the Den, caps and bonded fusions.
// A type's roster never holds more individuals than its active cap, so a dead wolf is recovered, not replaced.
(function (PB) {
  'use strict';
  var ROSTER_MAX = 30, DEN_PER_TIER = 10;

  function capFor(type, mods) {
    var st = (mods && mods.stats) || {}, b = (mods && mods.behaviors) || {};
    var cap = PB.SUMMONS[type].cap + (st[type + 'Cap'] || 0) + (st.summonCap || 0);
    if (type === 'wolf' && b.swarming) cap += 2;
    if (type === 'wolf' && b.lordfangs) cap *= 2;
    return cap;
  }

  function costFor(type, mods) {
    var b = (mods && mods.behaviors) || {};
    return PB.SUMMONS[type].cost * (type === 'wolf' && b.lordfangs ? 0.5 : 1);
  }

  function ensure(world) { if (!world.den) world.den = {}; if (!world.active) world.active = {}; if (!world.inds) world.inds = {}; }

  function activeCount(world, type) {
    var n = 0;
    for (var id in world.active) { var ind = world.inds[id]; if (ind && ind.type === type) n++; }
    return n;
  }

  function inDen(world, ind) { return world.den[ind.id] !== undefined && world.time < world.den[ind.id]; }

  // Picks (or creates) the individual a summon key calls. Does not spawn and does not charge.
  function pick(world, save, type, rng) {
    ensure(world);
    if (activeCount(world, type) >= capFor(type, world.mods)) return { ok: false, reason: 'cap' };
    var ofType = save.roster.filter(function (x) { return x.type === type; });
    var soonest = Infinity;
    for (var i = 0; i < ofType.length; i++) {
      var ind = ofType[i];
      if (world.active[ind.id]) continue;
      if (inDen(world, ind)) { soonest = Math.min(soonest, world.den[ind.id] - world.time); continue; }
      return { ok: true, ind: ind, born: false };
    }
    if (ofType.length < capFor(type, world.mods) && save.roster.length < ROSTER_MAX) {
      return { ok: true, ind: PB.Evolution.createIndividual(save, type, rng), born: true };
    }
    if (soonest < Infinity) return { ok: false, reason: 'den', readyIn: soonest };
    return { ok: false, reason: 'roster-full' };
  }

  function summon(world, type, x, y) {
    var r = pick(world, world.save, type, world.rng.names);
    if (!r.ok) { PB.Events.emit(world.events, 'summon-fail', { unit: type, reason: r.reason }); return r; }
    var e = PB.World.spawnIndividual(world, r.ind, x, y);
    if (r.born) world.save.stats.summons++;
    return { ok: true, ent: e, ind: r.ind, born: r.born };
  }

  function onDeath(world, ent) {
    ensure(world);
    var ind = world.inds[ent.indId];
    if (!ind) return;
    delete world.active[ind.id];
    var fast = world.mods.behaviors.denFast || PB.AISummons.flags(world).denFast ? 0.5 : 1; // Elder Oak
    world.den[ind.id] = world.time + DEN_PER_TIER * ind.tier * fast;
    PB.Events.emit(world.events, 'den', { indId: ind.id, until: world.den[ind.id] });
  }

  // Lord of Fangs fade and dismiss: back to the roster at once, no Den time, deeds kept.
  function release(world, ent) {
    ensure(world);
    delete world.active[ent.indId];
    ent.dead = true; ent.released = true;
  }

  // Bonded (fused) individuals: auto-summoned at zone start and auto-returned from the Den.
  function spawnBonded(world, x, y) {
    ensure(world);
    world.save.roster.forEach(function (ind) {
      if (ind.fusedFrom && !world.active[ind.id] && !inDen(world, ind)) PB.World.spawnIndividual(world, ind, x, y);
    });
  }

  function tick(world) {
    if (!world.save || !world.den) return;
    var a = world.anchor || world.player;
    for (var id in world.den) {
      if (world.time < world.den[id]) continue;
      delete world.den[id];
      var ind = world.inds[id];
      if (ind && ind.fusedFrom && !world.active[id]) PB.World.spawnIndividual(world, ind, a.x, a.y);
    }
  }

  PB.Roster = { ROSTER_MAX: ROSTER_MAX, DEN_PER_TIER: DEN_PER_TIER, capFor: capFor, costFor: costFor, pick: pick, summon: summon,
                onDeath: onDeath, release: release, spawnBonded: spawnBonded, tick: tick, activeCount: activeCount };
})(globalThis.PB = globalThis.PB || {});
