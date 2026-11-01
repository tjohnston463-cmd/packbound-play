// The hearth gate and the chest. Stand still and a gate opens back to camp. The wood does not
// advance while you are there. The chest holds as many pieces as the bag, and nothing in it fights.
(function (PB) {
  'use strict';
  var STASH_MAX = 40, CAST = 0.5, LIFE = 90, R = 36, OUT = 34;

  function chest(save) {
    if (!save.stash) save.stash = [];
    return save.stash;
  }

  function deposit(save, uid) {
    if (!save) return { ok: false, reason: 'save' };
    var box = chest(save);
    if (PB.Camp.slotOf(save, uid)) return { ok: false, reason: 'worn' };
    if (box.length >= STASH_MAX) return { ok: false, reason: 'chest' };
    for (var i = 0; i < save.inventory.length; i++) {
      if (save.inventory[i].uid !== uid) continue;
      box.push(save.inventory.splice(i, 1)[0]);
      return { ok: true };
    }
    return { ok: false, reason: 'missing' };
  }

  function withdraw(save, uid) {
    if (!save) return { ok: false, reason: 'save' };
    var box = chest(save);
    if (PB.Drops.bagCount(save) >= PB.Drops.BAG_MAX) return { ok: false, reason: 'bag' };
    for (var i = 0; i < box.length; i++) {
      if (box[i].uid !== uid) continue;
      save.inventory.push(box.splice(i, 1)[0]);
      return { ok: true };
    }
    return { ok: false, reason: 'missing' };
  }

  function moving(input) {
    var m = input && input.move || { x: 0, y: 0 };
    var pressed = input && input.pressed || [];
    return m.x !== 0 || m.y !== 0 || pressed.indexOf('bound') >= 0;
  }

  function near(world) {
    var g = world.gate, p = world.player;
    if (!g || !p) return false;
    var dx = p.x - g.x, dy = p.y - g.y;
    return dx * dx + dy * dy <= R * R;
  }

  function begin(world) {
    var p = world.player;
    world.cast = { t: CAST, x: p.x, y: p.y };
    PB.Events.emit(world.events, 'hearth-cast', { x: p.x, y: p.y });
  }

  function cancel(world) {
    if (!world.cast) return;
    world.cast = null;
    PB.Events.emit(world.events, 'hearth-cancel', { x: world.player.x, y: world.player.y });
  }

  function enter(world) {
    if (!world.gate) return;
    world.gate.away = false;
    PB.Events.emit(world.events, 'hearth-enter', { x: world.gate.x, y: world.gate.y });
  }

  function open(world) {
    var p = world.player;
    world.cast = null;
    world.gate = { x: p.x, y: p.y, t: LIFE, away: false };
    PB.Events.emit(world.events, 'hearth-open', { x: p.x, y: p.y });
    enter(world);
  }

  // Push the hunter just outside the ring so coming home does not immediately send them back.
  function stepOut(world) {
    var g = world.gate, p = world.player;
    if (!g || !p) return;
    var dx = p.x - g.x, dy = p.y - g.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) { dx = Math.cos(p.facing || 0); dy = Math.sin(p.facing || 0); d = 1; }
    var dist = R + OUT;
    p.x = PB.M.clamp(g.x + dx / d * dist, 20, world.width - 20);
    p.y = PB.M.clamp(g.y + dy / d * dist, 20, world.height - 20);
    g.away = false;
  }

  function tick(world, input, dt) {
    var p = world.player;
    if (!p) return;
    input = input || {};
    var pressed = input.pressed || [];
    var busy = world.anchor || p.hp <= 0 || p.stunT > 0;
    if (pressed.indexOf('gate') >= 0 && !busy) {
      if (world.gate && near(world)) enter(world);
      else if (!world.cast) begin(world);
    }
    if (world.cast) {
      var dx = p.x - world.cast.x, dy = p.y - world.cast.y;
      if (busy || moving(input) || dx * dx + dy * dy > 9) cancel(world);
      else {
        world.cast.t -= dt;
        if (world.cast.t <= 0) open(world);
      }
    }
    var g = world.gate;
    if (!g) return;
    g.t -= dt;
    if (g.t <= 0) {
      world.gate = null;
      PB.Events.emit(world.events, 'hearth-fade', { x: g.x, y: g.y });
      return;
    }
    if (busy) return;
    if (!near(world)) g.away = true;
    else if (g.away) enter(world);
  }

  PB.Hearth = {
    STASH_MAX: STASH_MAX, CAST: CAST, LIFE: LIFE, R: R,
    chest: chest, deposit: deposit, withdraw: withdraw, tick: tick, stepOut: stepOut, near: near,
    HELP: 'H opens a hearth gate. Stand still. Getting shoved or stepping cancels it. Camp is on the other side, and the wood is frozen where you left it. The chest there holds 40 pieces. Nothing in the chest counts in the fight. Walk back into the gate to return. Starting another wood closes it.'
  };
})(globalThis.PB = globalThis.PB || {});
