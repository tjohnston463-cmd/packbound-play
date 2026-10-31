// Feeding (spec §11.3): enemy corpses lie for 8 s; an idle summon within 120px walks over and eats for 1.0 s
// (interrupted by any order or enemy). Eating heals 10% (x2 Glutton), adds the essence to the diet, and gives
// XP 5 + xp/2 (x2 Carrion Feast). Carrion: any summon eats a corpse it touches, instantly, healing its value in %.
(function (PB) {
  'use strict';
  var CORPSE_T = 8, CORPSE_MAX = 60, EAT_T = 1.0, EAT_R = 120, BITE_R = 10;

  function addCorpse(world, enemy) {
    var def = PB.ENEMIES[enemy.type] || PB.BOSSES[enemy.type] || {};
    var c = { id: world.nextCorpse = (world.nextCorpse || 0) + 1, type: enemy.type, essence: def.essence || null,
              xp: enemy.xp != null ? enemy.xp : (def.xp || 0), x: enemy.x, y: enemy.y, t: CORPSE_T, eater: 0, boss: !!enemy.boss };
    world.corpses.push(c);
    if (world.corpses.length > CORPSE_MAX) world.corpses.shift();
    return c;
  }

  function find(world, id) {
    for (var i = 0; i < world.corpses.length; i++) if (world.corpses[i].id === id) return world.corpses[i];
    return null;
  }

  function stop(world, e) {
    if (!e.eatId) return;
    var c = find(world, e.eatId);
    if (c && c.eater === e.id) c.eater = 0;
    e.eatId = 0; e.eatT = 0;
  }

  // The summon finishes a meal: heal, diet, XP, scars, event. healFrac overrides the 10% (Carrion's value).
  function eat(world, e, c, healFrac) {
    var ind = e.indId && world.inds ? world.inds[e.indId] : null;
    var glutton = ind && ind.scars.indexOf('glutton') >= 0 ? 2 : 1;
    stop(world, e); // releases whatever corpse it had claimed
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (healFrac || 0.10) * glutton);
    if (ind) {
      if (c.essence) PB.Evolution.eat(ind, c.essence); else ind.deeds.eaten++;
      if (ind.tier === 3 && !ind.infusion && !ind.fusedFrom) { // a Tier III summon takes its infusion when its diet first crosses 10
        var inf = PB.Evolution.dominantEssence(ind.diet);
        if (inf) { ind.infusion = inf; PB.World.refreshIndividual(world, ind); PB.Events.emit(world.events, 'infuse', { indId: ind.id, essence: inf, x: e.x, y: e.y }); }
      }
      PB.Progression.grant(world, ind, (5 + c.xp / 2) * (world.mods.behaviors.feast ? 2 : 1));
      PB.Progression.scars(world, ind);
    }
    world.corpses.splice(world.corpses.indexOf(c), 1);
    e.eatId = 0; e.eatT = 0;
    PB.Events.emit(world.events, 'eat', { id: e.id, x: c.x, y: c.y, unit: c.type, essence: c.essence });
  }

  // Called by AISummons.update after intent. Returns true while the summon is busy with a meal.
  // Only free-mode summons that are not fighting, recalled, posted or cut off may eat.
  function tend(world, e, it, spd, dt) {
    var pack = world.pack;
    var free = it.kind !== 'attack' && !it.post && !it.trail && pack.order.kind === 'free' && pack.recallT <= 0 && e.linkCut <= 0;
    if (!free || e.temp) { stop(world, e); return false; }
    var still = !PB.Commands.isMobile(e); // vines and spirits eat where they stand (critique-stageC-grok B5)
    var c = e.eatId ? find(world, e.eatId) : null;
    if (!c) {
      e.eatId = 0; e.eatT = 0;
      var best = null, bd = EAT_R * EAT_R;
      for (var i = 0; i < world.corpses.length; i++) {
        var k = world.corpses[i];
        if (k.eater) continue;
        var dx = k.x - e.x, dy = k.y - e.y, d2 = dx * dx + dy * dy;
        if (d2 <= bd) { best = k; bd = d2; }
      }
      if (!best) return false;
      c = best; c.eater = e.id; e.eatId = c.id; e.eatT = 0;
    }
    var gx = c.x - e.x, gy = c.y - e.y, reach = e.r + BITE_R;
    if (!still && gx * gx + gy * gy > reach * reach) { PB.World.moveToward(world, e, c.x, c.y, spd); return true; }
    e.vx *= 0.5; e.vy *= 0.5;
    e.eatT += dt;
    if (e.eatT >= EAT_T - 1e-9) eat(world, e, c);
    return true;
  }

  // Step slot 8: corpses rot away; with Carrion, any summon touching a corpse eats it at once.
  function update(world, dt) {
    var list = world.corpses, i;
    for (i = list.length - 1; i >= 0; i--) {
      list[i].t -= dt;
      if (list[i].t <= 1e-9) {
        var gone = list.splice(i, 1)[0], who = gone.eater && world.byId[gone.eater];
        if (who && who.eatId === gone.id) { who.eatId = 0; who.eatT = 0; }
      }
    }
    var carrion = world.mods.behaviors.carrion;
    if (!carrion || !list.length) return;
    var heal = carrion > 1 ? carrion / 100 : 0.10;
    for (i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (e.team !== 0 || e.dead || e.kind !== 'summon' || e.temp) continue;
      for (var j = list.length - 1; j >= 0; j--) {
        var c = list[j], dx = c.x - e.x, dy = c.y - e.y, reach = e.r + BITE_R;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (c.eater && c.eater !== e.id) { var other = world.byId[c.eater]; if (other) { other.eatId = 0; other.eatT = 0; } }
        eat(world, e, c, heal);
      }
    }
  }

  PB.Feeding = { CORPSE_T: CORPSE_T, CORPSE_MAX: CORPSE_MAX, EAT_T: EAT_T, EAT_R: EAT_R, addCorpse: addCorpse, tend: tend, update: update, stop: stop };
})(globalThis.PB = globalThis.PB || {});
