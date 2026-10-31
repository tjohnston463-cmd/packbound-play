// Grove shrines in the field. Placement uses world.rng.shrine only, so waves and loot stay on their own streams.
// One stone at a time. Walking into it spends it. A timed boon is world.boon. A promised rune is world.runeGift,
// so it still pays if the curse wears off before the kill.
(function (PB) {
  'use strict';
  var TOUCH_R = 42, CLEAR = 56, PLAYER_GAP = 180, FUSION_GAP = 160, MIN_R = 320, MAX_R = 520;

  function onWave(world) {
    if (world.boon && world.boon.waveBound) world.boon = null;
    var d = world.dir;
    // The boss does not grow a new stone. One already standing can still be taken on the way in.
    if (d && d.wave > PB.Waves.WAVES_PER_ZONE && d.state !== 'victory') return;
    place(world);
  }

  function place(world) {
    var rng = world.rng.shrine, cx = world.width / 2, cy = world.height / 2;
    var kind = PB.GROVE_SHRINES[rng.int(0, PB.GROVE_SHRINES.length - 1)];
    var x = cx + MIN_R, y = cy, i;
    for (i = 0; i < 40; i++) {
      var a = rng.range(0, PB.M.TAU), dist = rng.range(MIN_R, MAX_R);
      var tx = PB.M.clamp(cx + Math.cos(a) * dist, 80, world.width - 80);
      var ty = PB.M.clamp(cy + Math.sin(a) * dist, 80, world.height - 80);
      if (!spotOk(world, tx, ty)) continue;
      x = tx; y = ty; break;
    }
    if (!spotOk(world, x, y)) { x = PB.M.clamp(cx + MIN_R, 80, world.width - 80); y = cy; }
    world.grove = { id: kind.id, name: kind.name, x: x, y: y, r: TOUCH_R, cursed: !!kind.cursed, color: kind.color, text: kind.text };
    PB.Events.emit(world.events, 'grove', { id: kind.id, name: kind.name, x: x, y: y, cursed: !!kind.cursed, text: kind.text });
    return world.grove;
  }

  function spotOk(world, x, y) {
    var obs = world.obstacles || [], i;
    for (i = 0; i < obs.length; i++) if (Math.hypot(x - obs[i].x, y - obs[i].y) < obs[i].r + CLEAR) return false;
    var bodies = [world.player];
    if (world.anchor && !world.anchor.dead) bodies.push(world.anchor);
    for (i = 0; i < bodies.length; i++) {
      var p = bodies[i];
      if (p && Math.hypot(x - p.x, y - p.y) < PLAYER_GAP) return false;
    }
    if (world.shrine && Math.hypot(x - world.shrine.x, y - world.shrine.y) < FUSION_GAP) return false;
    return true;
  }

  function nearBody(world, s) {
    var bodies = [world.player];
    if (world.anchor && !world.anchor.dead) bodies.push(world.anchor);
    for (var i = 0; i < bodies.length; i++) {
      var p = bodies[i];
      if (!p) continue;
      var dx = p.x - s.x, dy = p.y - s.y;
      if (dx * dx + dy * dy <= s.r * s.r) return true;
    }
    return false;
  }

  function raiseDen(world) {
    var best = null, soon = Infinity, id;
    for (id in world.den) {
      var left = world.den[id] - world.time;
      if (left > 0.02 && left < soon) { soon = left; best = id; }
    }
    if (!best) return null;
    delete world.den[best];
    var ind = world.inds[best];
    if (!ind || world.active[best]) return { name: ind ? ind.name : 'A friend', stood: false };
    if (PB.Roster.activeCount(world, ind.type) >= PB.Roster.capFor(ind.type, world.mods)) return { name: ind.name, stood: false };
    var p = world.anchor || world.player;
    var e = PB.World.spawnIndividual(world, ind, p.x + 28, p.y + 8);
    return { name: ind.name, stood: !!e };
  }

  function mend(world) {
    var n = 0, i;
    for (i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (e.dead || e.team !== 0 || e.kind === 'player') continue;
      if (e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.35); n++; }
    }
    var p = world.player;
    if (p && p.hp > 0 && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.2); n++; }
    return n;
  }

  function take(world) {
    var s = world.grove;
    if (!s || !world.player || world.player.hp <= 0 || !nearBody(world, s)) return false;
    var kind = PB.GROVE_BY_ID[s.id];
    if (!kind) { world.grove = null; return false; }
    var text = kind.text;
    if (kind.instant === 'den') {
      var raised = raiseDen(world);
      if (raised && raised.stood) text = raised.name + ' stands back up.';
      else if (raised) text = raised.name + ' can be called again.';
      else { mend(world); text = 'The Den is empty. The pack mends.'; }
    } else applyBoon(world, kind);
    world.grove = null;
    PB.World.hitStop(world, kind.cursed ? 80 : 45);
    PB.Events.emit(world.events, 'grove-take', { id: kind.id, name: kind.name, x: s.x, y: s.y, cursed: !!kind.cursed, text: text });
    return true;
  }

  function applyBoon(world, kind) {
    var src = kind.boon || {};
    world.boon = {
      id: kind.id, name: kind.name, cursed: !!kind.cursed, text: kind.text,
      dmg: src.dmg || 0, atk: src.atk || 0, regen: src.regen || 0, mf: src.mf || 0, taken: src.taken || 0,
      enemyDmg: src.enemyDmg || 0, enemySpd: src.enemySpd || 0, waveBound: !!src.waveBound,
      until: src.dur ? world.time + src.dur : 0
    };
    if (src.spirit && world.player) world.player.spirit = Math.min(world.player.maxSpirit, world.player.spirit + world.player.maxSpirit * src.spirit);
    if (src.runeDue) world.runeGift = 1;
  }

  function tick(world) {
    var b = world.boon;
    if (!b || !b.until) return;
    if (world.time + 1e-9 >= b.until) {
      var id = b.id;
      world.boon = null;
      PB.Events.emit(world.events, 'grove-end', { id: id });
    }
  }

  function magicFind(world) { return world.boon && world.boon.mf ? world.boon.mf : 0; }

  PB.Shrines = { onWave: onWave, place: place, touch: take, tick: tick, magicFind: magicFind, TOUCH_R: TOUCH_R };
})(globalThis.PB = globalThis.PB || {});
