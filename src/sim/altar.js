// The altar flow (spec §8) on top of the verified Fusion logic: what the Fusion Altar screen offers (options), the
// mid-zone Fusion Shrine (the director opens it after wave 3; D4), and fusing in the field at the shrine.
// T at the shrine only asks the app to open the Fusion Altar screen ('shrine-open'); the screen calls fieldFuse
// (E3 replaced the Stage C shrineAuto stand-in).
(function (PB) {
  'use strict';
  var SHRINE_R = 90;

  function options(save, stats) {
    var out = [], r = save.roster;
    for (var i = 0; i < r.length; i++) {
      for (var j = i + 1; j < r.length; j++) {
        var a = r[i], b = r[j];
        if (a.tier < 2 || b.tier < 2 || a.fusedFrom || b.fusedFrom) continue;
        var res = PB.Fusion.result(a.type, b.type);
        if (!res) continue;
        var chk = PB.Fusion.canFuse(save, a.id, b.id, stats);
        out.push({ aId: a.id, bId: b.id, result: res, cost: res.alpha ? PB.FUSION_COST.alpha : PB.FUSION_COST.cross, ok: chk.ok, reason: chk.ok ? null : chk.reason,
                   levels: a.level + b.level });
      }
    }
    return out;
  }

  function openShrine(world, x, y) {
    world.shrine = { x: x, y: y, r: SHRINE_R };
    PB.Events.emit(world.events, 'shrine', { x: x, y: y });
    return world.shrine;
  }

  function nearShrine(world) {
    var s = world.shrine, p = world.player;
    if (!s) return 'no-shrine';
    var dx = p.x - s.x, dy = p.y - s.y;
    return dx * dx + dy * dy <= s.r * s.r ? null : 'far';
  }

  // Parents in the field leave at once (no Den time); the bonded fusion appears beside the shrine.
  function fieldFuse(world, aId, bId) {
    var why = nearShrine(world);
    if (why) return { ok: false, reason: why };
    var chk = PB.Fusion.canFuse(world.save, aId, bId, world.mods.stats);
    if (!chk.ok) return chk;
    [aId, bId].forEach(function (id) {
      var ent = world.byId[world.active[id]];
      if (ent && !ent.dead) PB.Roster.release(world, ent);
      delete world.den[id];
    });
    var r = PB.Fusion.fuse(world.save, aId, bId, world.rng.names, world.mods.stats);
    var s = world.shrine, ent2 = PB.World.spawnIndividual(world, r.individual, s.x, s.y + 30);
    PB.Events.emit(world.events, 'fusion', { indId: r.individual.id, unit: r.individual.type, name: r.individual.name, x: s.x, y: s.y + 30 });
    return { ok: true, individual: r.individual, ent: ent2 };
  }

  PB.Fusion.options = options;
  PB.Fusion.openShrine = openShrine;
  PB.Fusion.fieldFuse = fieldFuse;
  PB.Fusion.nearShrine = nearShrine;
  PB.Fusion.SHRINE_R = SHRINE_R;
})(globalThis.PB = globalThis.PB || {});
