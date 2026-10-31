// The Slaughter. Kills within WINDOW seconds climb a chain. Before five it is only a count.
// At five the chain starts paying: harder hits, a faster pack, a faster weapon, better drops.
// Every fifth kill after that, the wood answers in the way of the calling. A ripple cannot
// answer again on the same swing, so a corpse pop cannot clear the wood by itself.
(function (PB) {
  'use strict';
  var WINDOW = 3.2, CAP = 12, PAY = 5, PER = 0.02, REACH = 170;

  function state(world) {
    return world.slaughter || (world.slaughter = { n: 0, t: 0, best: 0 });
  }

  function stacks(world) {
    var s = world.slaughter;
    return s && s.t > 0 ? s.n : 0;
  }

  function title(n) {
    if (n >= 15) return 'The Wood Breaks';
    if (n >= 10) return 'Blood Moon';
    if (n >= PAY) return 'Slaughter';
    return '';
  }

  // Fraction added as "more" damage. Quiet under 5. Gear of Slaughter adds its roll on every paying stack.
  function bonus(n, gear) {
    n = n || 0;
    if (n < PAY) return 0;
    if (n > CAP) n = CAP;
    return n * (PER + Math.max(0, gear || 0) / 100);
  }

  function haste(world) {
    var n = stacks(world);
    if (n < PAY) return 0;
    return Math.min(CAP, n) * 0.01;
  }

  function swingMul(n) {
    if ((n || 0) < PAY) return 1;
    return 1 - 0.012 * Math.min(CAP, n);
  }

  function moveMul(world) {
    var n = stacks(world);
    if (n < PAY) return 1;
    return 1 + 0.015 * Math.min(CAP, n);
  }

  function lootMul(world) {
    var n = stacks(world);
    if (n >= 10) return 1.6;
    if (n >= PAY) return 1.25;
    return 1;
  }

  function line(world) {
    var n = stacks(world);
    if (!n) return '';
    var name = title(n);
    return (name || 'Chain') + ' ×' + n;
  }

  function tick(world, dt) {
    var s = world.slaughter;
    if (!s || !(s.n > 0)) return;
    s.t -= dt;
    if (s.t <= 0) { s.n = 0; s.t = 0; }
  }

  function calling(world) {
    return PB.Classes && world.save ? PB.Classes.of(world.save).id : 'druid';
  }

  function gearOf(world) {
    return world.mods && world.mods.stats ? (world.mods.stats.slaughter || 0) : 0;
  }

  function near(world, x, y, r, skip) {
    var r2 = r * r, out = [], i, e, dx, dy;
    for (i = 0; i < world.ents.length; i++) {
      e = world.ents[i];
      if (e === skip || e.dead || e.team !== 1) continue;
      dx = e.x - x; dy = e.y - y;
      if (dx * dx + dy * dy <= r2) out.push(e);
    }
    return out;
  }

  function milestone(n) {
    return n === 5 || n === 10 || n === 15 || (n >= 20 && n % 5 === 0);
  }

  function mend(e, frac) {
    if (!e || e.dead || !(e.maxHp > 0) || e.maxHp >= 1e8) return;
    e.hp = Math.min(e.maxHp, e.hp + Math.max(6, e.maxHp * frac));
  }

  // The shared answer is a Mark, so the pack turns. The calling adds its own beat on top.
  function flavor(world, def, n) {
    var list = near(world, def.x, def.y, REACH, def), i, e, p = world.player, id = calling(world);
    var amt = Math.max(1, Math.round(14 * (1 + bonus(n, gearOf(world)))));
    for (i = 0; i < list.length; i++) list[i].marked = Math.max(list[i].marked || 0, 2.5);
    if (id === 'necro') {
      for (i = 0; i < list.length; i++) PB.World.direct(world, 0, list[i], amt, false, 'slaughter');
    } else if (id === 'sorc') {
      for (i = 0; i < list.length; i++) PB.World.applyDot(list[i], 'burn', 8, 2.2, 0);
    } else if (id === 'pala') {
      mend(p, 0.06);
      for (i = 0; i < world.ents.length; i++) {
        e = world.ents[i];
        if (e.kind === 'summon' && !e.dead) mend(e, 0.08);
      }
    } else if (id === 'amaz') {
      list.sort(function (a, b) {
        var da = (a.x - def.x) * (a.x - def.x) + (a.y - def.y) * (a.y - def.y);
        var db = (b.x - def.x) * (b.x - def.x) + (b.y - def.y) * (b.y - def.y);
        return da - db;
      });
      for (i = 0; i < list.length && i < 4; i++) PB.World.direct(world, 0, list[i], amt, false, 'slaughter');
    } else if (id === 'barb') {
      if (p) {
        p.whirlT = Math.max(p.whirlT || 0, 2.4);
        p.whirlN = Math.min(4, (p.whirlN || 0) + 1);
      }
      for (i = 0; i < list.length; i++) if (!list[i].boss) list[i].frozenT = Math.max(list[i].frozenT || 0, 0.35);
    } else {
      if (p) p.spirit = Math.min(p.maxSpirit, p.spirit + 6);
      for (i = 0; i < world.ents.length; i++) {
        e = world.ents[i];
        if (e.kind === 'summon' && !e.dead) e.cd = 0;
      }
    }
  }

  function onKill(world, def) {
    if (!def || def.team !== 1 || def.kind !== 'enemy') return;
    var s = state(world);
    if (s.t > 0) s.n += 1; else s.n = 1;
    s.t = WINDOW;
    if (s.n > s.best) s.best = s.n;
    var mile = !world._slaughterLock && milestone(s.n);
    PB.Events.emit(world.events, 'slaughter', { n: s.n, x: def.x, y: def.y, milestone: mile, name: title(s.n) });
    if (!mile) return;
    world._slaughterLock = true;
    flavor(world, def, s.n);
    world._slaughterLock = false;
    PB.World.hitStop(world, 48);
  }

  var HELP = 'Kills within 3.2 seconds climb a chain. At 5 it becomes a Slaughter: you and the pack hit harder and swing faster, and the wood drops more. At 5, 10 and 15 the wood answers in the way of your calling. Prey comes through the gates in packs.';

  PB.Slaughter = {
    onKill: onKill, tick: tick, stacks: stacks, title: title, bonus: bonus, haste: haste, swingMul: swingMul,
    moveMul: moveMul, lootMul: lootMul, line: line, HELP: HELP,
    WINDOW: WINDOW, CAP: CAP, PAY: PAY, PER: PER, REACH: REACH
  };
})(globalThis.PB = globalThis.PB || {});
