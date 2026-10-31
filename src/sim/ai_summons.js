// Summon AI executors (spec §4). Every executor first takes Commands.intent() and only decides HOW to carry it
// out; the precedence table in commands.js is never re-decided here. All walking goes through World.moveToward,
// so obstacles are handled in one place.
(function (PB) {
  'use strict';
  var TAU = Math.PI * 2;
  var LUNGE_MIN = 60, LUNGE_MAX = 120, LUNGE_DIST = 120, LUNGE_T = 0.2, LUNGE_CD = 4;
  var KNOCK = { wolf: 60, lunge: 140, bear: 220 };
  var ORBIT_R = 80, ORBIT_W = 2.4, RETREAT_R = 60;
  var GUARD_OUT = 60, GUARD_ENGAGE = 160, TAUNT_R = 140, TAUNT_CD = 6, TAUNT_T = 3, MAUL_STOP = 60;
  var POISON_DPS = 4, POISON_T = 3, ROOT_T = 1.5, VINE_LASH = 1.0, SPREAD_R = 80;
  var AURA_PULSE = 0.25, MAUL_STUN = 0.5, SKILL_LUNGE = 180, LUNGE_KNOCK = 0.3, BLOODSCENT_FRAC = 0.5;
  // C1 branch behaviors and infusions (spec §7). Each EVOLUTIONS mod has one guarded block below.
  var LEAP_T = 0.25, LEAP_MIN = 100, LEAP_CD = 3, CHARGE_MIN = 100, CHARGE_MAX = 250, CHARGE_T = 0.35, CHARGE_CD = 6;
  var BLEED_SHARE = 0.4, BLEED_T = 3, CHAIN_R = 120, CHAIN_SHARE = 0.6, QUAKE_R = 130, QUAKE_T = 1;
  var SPREAD_MARK_R = 160, BURST_R = 120, IGNITE_R = 60, CLOUD_R = 70, GUARDIAN_R = 150, GUARDIAN_T = 2, SWALLOW_CD = 0.5;
  var NONE = {};

  function evoOf(e) { return e.evo || NONE; }

  // Branch flags of every living summon, OR-ed together (Seer, Omenwing, Elder Oak, Bloodmoon act pack-wide).
  function flags(world) {
    if (world._flagsTick === world.tick && world._flags) return world._flags;
    var f = {};
    for (var i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (e.team !== 0 || e.dead) continue;
      f['t_' + e.type] = true; // fusion presence (Omen) by type
      if (e.evo) for (var k in e.evo) f[k] = f[k] || e.evo[k];
    }
    world._flags = f; world._flagsTick = world.tick;
    return f;
  }

  function enemiesNear(world, x, y, r, skip) {
    var out = [];
    for (var i = 0; i < world.ents.length; i++) {
      var o = world.ents[i];
      if (o.team !== 1 || o.dead || o === skip) continue;
      if (d2(x, y, o.x, o.y) <= (r + o.r) * (r + o.r)) out.push(o);
    }
    out.sort(function (a, b) { return d2(x, y, a.x, a.y) - d2(x, y, b.x, b.y) || a.id - b.id; });
    return out;
  }

  function hasTag(e, t) { return e.tags.indexOf(t) >= 0; }
  function roleIs(e, t) { return hasTag(e, t) || e.role === t; }
  function warded(e) { return !!(e.elite && e.elite.indexOf('warded') >= 0); }
  // Every root goes through here: bosses and Warded elites cannot be Rooted (zones.js elite text).
  function canRoot(o) { return o.team === 1 && !o.dead && !o.boss && !warded(o); }
  function root(o, dur) { if (!canRoot(o)) return false; o.rooted = Math.max(o.rooted || 0, dur); o.vx = 0; o.vy = 0; return true; }
  function d2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function anchorOf(world) { return world.anchor || world.player; }

  function poison(world, target, src) {
    if (target.dead) return;
    target.poisonT = Math.max(target.poisonT || 0, POISON_T);
    target.poisonDps = Math.max(target.poisonDps || 0, POISON_DPS * (1 + (world.mods.stats.poisonDmg || 0) / 100)); // Blight
    target.poisonSrc = src.id;
  }

  function mark(world, target, src) {
    if (warded(target)) return;
    target.marked = Math.max(target.marked, 4 + (world.mods.stats.markDur || 0) + ((src && evoOf(src).markDur) || 0));
    PB.Events.emit(world.events, 'mark', { dst: target.id, x: target.x, y: target.y });
  }

  // One landed attack and its per-archetype rider (knockback, mark, maul).
  function strike(world, e, target, mul, lunging) {
    e.cd = e.atk / PB.Behaviors.rate(world, e, mul);
    var h = PB.World.damage(world, e, target), km = e.infusion === 'stone' ? 1.5 : 1;
    if (roleIs(e, 'raven')) {
      if (target.poisonT > 0) {
        var other = world.hash.nearest(target.x, target.y, SPREAD_R, function (o) { return o.team === 1 && !o.dead && o !== target && !(o.poisonT > 0); });
        if (other) poison(world, other, e);
      }
      mark(world, target, e);
    }
    if (roleIs(e, 'bear')) {
      PB.World.knock(target, e.x, e.y, KNOCK.bear * km * (e.knockMul || 1));
      PB.Events.emit(world.events, 'maul', { src: e.id, dst: target.id, x: target.x, y: target.y });
      PB.World.hitStop(world, MAUL_STOP);
      if (world.mods.behaviors.maulstun && !target.boss && !target.dead) { target.stunnedT = MAUL_STUN; target.frozenT = Math.max(target.frozenT || 0, MAUL_STUN); } // Crushing Maul
      e.mauls = (e.mauls || 0) + 1;
      if (evoOf(e).quake && e.mauls % 3 === 0) quake(world, e);
    } else if (roleIs(e, 'wolf')) PB.World.knock(target, e.x, e.y, (lunging ? KNOCK.lunge : KNOCK.wolf) * km);
    var slowFor = world.mods.stats.slowOnHit || 0;
    if (slowFor > 0 && roleIs(e, 'bear') && !target.dead) target.slowT = Math.max(target.slowT || 0, slowFor);
    if (world.mods.behaviors.rime && roleIs(e, 'bear') && !target.boss && !target.dead) target.frozenT = Math.max(target.frozenT || 0, 0.35);
    if (world.mods.behaviors.absolute && roleIs(e, 'bear') && !target.boss && !target.dead) target.frozenT = Math.max(target.frozenT || 0, 0.8);
    afterHit(world, e, target, h);
    PB.AIFusions.afterHit(world, e, target, h);
    PB.Behaviors.afterStrike(world, e, target, h);
    return h;
  }

  // Mountain: every 3rd maul roots non-boss enemies within 130px for 1s.
  function quake(world, e) {
    enemiesNear(world, e.x, e.y, QUAKE_R).forEach(function (o) { root(o, QUAKE_T); });
    PB.Events.emit(world.events, 'quake', { id: e.id, x: e.x, y: e.y, radius: QUAKE_R });
  }

  // Lightning from `from` to the n nearest other enemies within 120px, for share of the attacker's damage.
  function chainHit(world, e, from, n, share) {
    var sub = { id: e.id, kind: 'summon', team: 0, tags: e.tags, x: e.x, y: e.y, dmg: [e.dmg[0] * share, e.dmg[1] * share], critChance: 0 };
    enemiesNear(world, from.x, from.y, CHAIN_R, from).slice(0, n).forEach(function (o) {
      PB.Events.emit(world.events, 'chain', { x: from.x, y: from.y, x2: o.x, y2: o.y, src: e.id });
      PB.World.damage(world, sub, o);
    });
  }

  // Riders on a landed summon hit: branch mods (bleed, chain), aura leech, then the Tier III infusion table.
  function afterHit(world, e, target, h) {
    var ev = evoOf(e), amt = h.amount || 0;
    if (ev.bleed && (hasTag(e, 'raven') || h.crit) && !target.dead) PB.World.applyDot(target, 'bleed', amt * BLEED_SHARE / BLEED_T, BLEED_T, e.id);
    if (ev.chain) chainHit(world, e, target, ev.chain, CHAIN_SHARE);
    if (e.leech && e.leechUntil > world.time && h.taken > 0) e.hp = Math.min(e.maxHp, e.hp + e.leech * h.taken);
    switch (e.infusion) {
      case 'rot': if (!target.dead) { PB.World.applyDot(target, 'poison', amt * 0.2, 3, e.id); } break;
      case 'ember': if (!target.dead) PB.World.applyDot(target, 'burn', amt * 0.3 / 2, 2, e.id); break;
      case 'frost':
        target.chillT = Math.max(target.chillT || 0, 1.5);
        if (!target.boss && world.rng.combat.chance(0.05)) { target.frozenT = 0.8; PB.Events.emit(world.events, 'freeze', { dst: target.id, x: target.x, y: target.y }); }
        break;
      case 'storm': if (world.rng.combat.chance(0.15)) chainHit(world, e, target, 2, 0.5); break;
    }
  }

  // Enemy deaths: Seer/Omenwing Mark riders, ember ignition, Berserker heal, Elder Oak shields, Bloodmoon Frenzy.
  function onKill(world, att, def) {
    var f = flags(world), i, list;
    PB.Behaviors.onEnemyKill(world, att, def);
    if (def.marked > 0) {
      if (f.markBurst) enemiesNear(world, def.x, def.y, BURST_R, def).forEach(function (o) { mark(world, o); });
      if (f.markSpread) {
        list = enemiesNear(world, def.x, def.y, SPREAD_MARK_R, def).filter(function (o) { return !(o.marked > 0) && !warded(o); });
        if (list.length) mark(world, list[0]);
      }
    }
    if (def.burnT > 0) enemiesNear(world, def.x, def.y, IGNITE_R, def).forEach(function (o) { PB.World.applyDot(o, 'burn', def.burnDps, 2, def.burnSrc); });
    if (att && !att.dead && att.evo && att.evo.rage) att.hp = Math.min(att.maxHp, att.hp + att.maxHp * 0.05);
    var packKill = !!(att && att.team === 0 && att.kind === 'summon');
    if (packKill && f.killShield) {
      for (i = 0; i < world.ents.length; i++) {
        var s = world.ents[i];
        if (s.team !== 0 || s.dead) continue;
        s.shield = Math.max(s.shield, s.maxHp * 0.05); s.shieldT = Math.max(s.shieldT, 3);
      }
    }
    if (packKill && f.frenzyOnKill && def.elite && def.elite.length && world.pack.frenzyT <= 0) {
      world.pack.frenzyT = 3; world.pack.freeFrenzy = true; world.pack.exhaustT = 0;
      PB.Events.emit(world.events, 'frenzy-free', { x: def.x, y: def.y });
    }
    PB.AIFusions.onKill(world, att, def);
  }

  function inReach(e, t) { var r = e.r + t.r + e.range; return d2(e.x, e.y, t.x, t.y) <= r * r; }

  // The plain executor: chase (or keep to the hold point) and attack when in reach.
  // leash (Encircle): a summon may leave its hold point by up to leash px to reach the target, then goes back.
  function engage(world, e, target, hold, spd, mul, leash) {
    if (!inReach(e, target)) {
      if (e.rooted > 0) return;
      var goal = hold;
      if (hold && leash) { var lr = leash + e.r + target.r + e.range; if (d2(target.x, target.y, hold.x, hold.y) <= lr * lr) goal = target; }
      if (goal) PB.World.moveToward(world, e, goal.x, goal.y, spd); else PB.World.moveToward(world, e, target.x, target.y, spd);
      return;
    }
    e.vx *= 0.7; e.vy *= 0.7;
    if (e.cd <= 0 && e.atk > 0) strike(world, e, target, mul, false);
  }

  function follow(world, e, it, spd) {
    if (it.kind === 'move') PB.World.moveToward(world, e, it.x, it.y, spd * (it.sprint ? 1.6 : 1));
    else { e.vx *= 0.8; e.vy *= 0.8; }
  }

  // Flank slots, rebuilt once per tick from last tick's choices. A target's slot base is fixed when its first
  // attacker arrives (behind its facing then), so knockback never spins the ring; slots go out in the wolves'
  // current angular order around the target, so no wolf has to cross another to reach its post.
  function beginTick(world) {
    var by = {}, ents = world.ents, i, e;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (e.dead || e.ai !== 'flank' || !e.tgtId) continue;
      (by[e.tgtId] || (by[e.tgtId] = [])).push(e);
    }
    for (var k in by) {
      var t = world.byId[k];
      if (!t) { delete by[k]; continue; }
      if (t.flankTick !== world.tick - 1 || t.flankBase === undefined) t.flankBase = (t.facing || 0) + Math.PI;
      t.flankTick = world.tick;
      var base = t.flankBase;
      var rel = function (w) { var a = Math.atan2(w.y - t.y, w.x - t.x) - base; a %= TAU; return a < 0 ? a + TAU : a; };
      by[k].sort(function (a, b) { return rel(a) - rel(b) || a.id - b.id; });
      by[k] = by[k].map(function (w) { return w.id; });
    }
    world._flank = by;
  }

  function flank(world, e, it, spd, mul, dt) {
    if (e.lungeT > 0) {
      e.lungeT -= dt;
      var lt = world.byId[e.lungeAt];
      if (lt && !lt.dead && inReach(e, lt) && e.cd <= 0 && e.atk > 0) {
        strike(world, e, lt, mul, true);
        if (e.leaping && e.leapKnock) PB.Behaviors.knockDown(world, lt);
        else if (!e.leaping && e.lungeKnock) PB.Behaviors.knockDown(world, lt, LUNGE_KNOCK); // Lunge (skill)
      }
      if (e.leaping && (e.lungeT <= 1e-9 || (lt && inReach(e, lt)))) { e.leaping = false; e.lungeT = 0; e.vx *= 0.15; e.vy *= 0.15; }
      return;
    }
    if (it.kind !== 'attack') return follow(world, e, it, spd);
    var t = it.target, ev = evoOf(e);
    if (it.hold) return engage(world, e, t, it.hold, spd, mul, it.leash);
    var dist = Math.sqrt(d2(e.x, e.y, t.x, t.y)), gap = dist - e.r - t.r;
    // Shadowfang: leap onto a Marked target (100px up to the leap range), 3s cooldown. Leaping (affix): any target, knocks down.
    var leapR = ev.leap && t.marked > 0 ? ev.leap : 0, bl = world.mods.behaviors.leaping || 0;
    if (bl > leapR) leapR = bl;
    if (leapR && e.leapCd <= 0 && e.rooted <= 0 && gap >= LEAP_MIN && gap <= leapR) {
      var travel = dist - (e.r + t.r + e.range * 0.5), lv = travel / LEAP_T;
      e.vx = (t.x - e.x) / dist * lv; e.vy = (t.y - e.y) / dist * lv;
      e.lungeT = LEAP_T; e.lungeAt = t.id; e.leaping = true; e.leapCd = LEAP_CD; e.leapKnock = bl > 0;
      PB.Events.emit(world.events, 'leap', { id: e.id, x: e.x, y: e.y, dst: t.id, x2: t.x, y2: t.y });
      return;
    }
    var sl = world.mods.behaviors.lunge ? SKILL_LUNGE : 0, lungeMax = Math.max(ev.lunge || LUNGE_MAX, sl);
    if (e.lungeCd <= 0 && e.rooted <= 0 && gap >= LUNGE_MIN && gap <= lungeMax) {
      var ux = (t.x - e.x) / dist, uy = (t.y - e.y) / dist, v = Math.max(ev.lunge || LUNGE_DIST, sl) / LUNGE_T;
      e.vx = ux * v; e.vy = uy * v; e.lungeT = LUNGE_T; e.lungeCd = LUNGE_CD; e.lungeAt = t.id; e.lungeKnock = sl > 0;
      PB.Events.emit(world.events, 'lunge', { id: e.id, x: e.x, y: e.y, dst: t.id });
      return;
    }
    var list = (world._flank && world._flank[t.id]) || [], rank = list.indexOf(e.id), n = list.length;
    if (rank < 0) { rank = n; n++; }
    var ring = t.r + e.r + e.range * 0.5;
    var slotA = (t.flankBase !== undefined ? t.flankBase : (t.facing || 0) + Math.PI) + rank * TAU / n;
    if (gap > 70) PB.World.moveToward(world, e, t.x, t.y, spd); // far: close in first
    else {
      // Near: walk around the target (never through it) toward the slot angle.
      var cur = Math.atan2(e.y - t.y, e.x - t.x), diff = PB.M.angleDiff(cur, slotA);
      var a = Math.abs(diff) > 0.6 ? cur + (diff > 0 ? 0.6 : -0.6) : slotA;
      var gx = t.x + Math.cos(a) * ring, gy = t.y + Math.sin(a) * ring;
      if (d2(e.x, e.y, gx, gy) > 9) PB.World.moveToward(world, e, gx, gy, spd); else { e.vx *= 0.6; e.vy *= 0.6; }
    }
    if (inReach(e, t) && e.cd <= 0 && e.atk > 0) strike(world, e, t, mul, false);
  }

  function dart(world, e, it, spd, mul, dt) {
    e.orbA = (e.orbA || 0) + ORBIT_W * dt;
    if (PB.Behaviors.dart(world, e, it, spd, mul)) return;
    if (it.kind !== 'attack') {
      if (it.kind === 'move') return follow(world, e, it, spd);
      var a = anchorOf(world);
      PB.World.moveToward(world, e, a.x + Math.cos(e.orbA) * ORBIT_R, a.y + Math.sin(e.orbA) * ORBIT_R, spd * 0.6);
      return;
    }
    var t = it.target;
    if (it.hold) return engage(world, e, t, it.hold, spd, mul, it.leash);
    if (e.cd <= 0 && e.atk > 0) { // dive and peck
      if (inReach(e, t)) strike(world, e, t, mul, false);
      else PB.World.moveToward(world, e, t.x, t.y, spd);
      return;
    }
    // Hit and run: pull back out to about 60px and circle until the next peck.
    var r = t.r + RETREAT_R;
    PB.World.moveToward(world, e, t.x + Math.cos(e.orbA) * r, t.y + Math.sin(e.orbA) * r, spd);
  }

  function taunt(world, e, dt) {
    e.tauntCd = Math.max(0, (e.tauntCd || 0) - dt);
    if (e.tauntCd > 0) return;
    var out = world._out2 || (world._out2 = []), n = 0;
    var TR = e.tauntR || TAUNT_R;
    world.hash.queryRadius(e.x, e.y, TR, out);
    for (var i = 0; i < out.length; i++) {
      var o = out[i];
      if (o.team !== 1 || o.dead || o.boss) continue;
      if (d2(e.x, e.y, o.x, o.y) > (TR + o.r) * (TR + o.r)) continue;
      o.tauntBy = e.id; o.tauntT = TAUNT_T; n++;
    }
    if (n) { e.tauntCd = evoOf(e).tauntCd || TAUNT_CD; PB.Events.emit(world.events, 'taunt', { id: e.id, x: e.x, y: e.y, n: n }); }
  }

  // Ravager: charge a target 100-250px away (6s cooldown); the charge strikes on arrival.
  function charge(world, e, t) {
    if (!evoOf(e).charge || e.chargeCd > 0 || e.rooted > 0 || e.atk <= 0) return false;
    var dist = Math.sqrt(d2(e.x, e.y, t.x, t.y)), gap = dist - e.r - t.r;
    if (gap < CHARGE_MIN || gap > CHARGE_MAX) return false;
    var v = (dist - (e.r + t.r + e.range * 0.5)) / CHARGE_T;
    e.vx = (t.x - e.x) / dist * v; e.vy = (t.y - e.y) / dist * v;
    e.chargeT = CHARGE_T; e.chargeAt = t.id; e.chargeCd = CHARGE_CD;
    PB.Events.emit(world.events, 'charge', { id: e.id, x: e.x, y: e.y, dst: t.id });
    return true;
  }

  function guard(world, e, it, spd, mul, dt) {
    taunt(world, e, dt);
    if (e.chargeT > 0) {
      e.chargeT -= dt;
      var ct = world.byId[e.chargeAt];
      var hit = ct && !ct.dead && inReach(e, ct);
      if (hit && e.cd <= 0) strike(world, e, ct, mul, false);
      if (hit || e.chargeT <= 1e-9) { e.chargeT = 0; e.vx *= 0.2; e.vy *= 0.2; }
      return;
    }
    if (it.kind !== 'attack') return follow(world, e, it, spd);
    var t = it.target, a = anchorOf(world);
    if (it.hold || world.pack.order.kind !== 'free') { if (!it.hold && charge(world, e, t)) return; return engage(world, e, t, it.hold, spd, mul, it.leash); }
    // Free mode: stand between the druid and the threat; engage only what comes near the druid.
    if (d2(t.x, t.y, a.x, a.y) <= (GUARD_ENGAGE + t.r) * (GUARD_ENGAGE + t.r)) { if (charge(world, e, t)) return; return engage(world, e, t, null, spd, mul); }
    var dx = t.x - a.x, dy = t.y - a.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
    var gx = a.x + dx / dl * GUARD_OUT, gy = a.y + dy / dl * GUARD_OUT;
    if (d2(e.x, e.y, gx, gy) > 16) PB.World.moveToward(world, e, gx, gy, spd); else { e.vx *= 0.6; e.vy *= 0.6; }
    if (inReach(e, t) && e.cd <= 0 && e.atk > 0) strike(world, e, t, mul, false);
  }

  function rooted(world, e, it, spd, mul, dt) {
    var ev = evoOf(e);
    if (!PB.Behaviors.rootedMove(world, e, it, mul, dt)) { e.vx = 0; e.vy = 0; }
    e.grabCd = Math.max(0, (e.grabCd || 0) - dt);
    var reach = e.range + e.r;
    var grabbable = function (o) { return canRoot(o) && !(o.rooted > 0); };
    for (var g = 0; g < (e.grabN || 1) && e.grabCd <= 0 && e.atk > 0 && !e.noGrab; g++) {
      // Spec §5: the vine's attack goes to the Focus target when it is in reach, so the grab does too; else the nearest.
      var ft = g === 0 && it.kind === 'attack' && world.pack.order.kind === 'focus' && it.target.id === world.pack.order.targetId ? it.target : null;
      var v = ft && grabbable(ft) && d2(e.x, e.y, ft.x, ft.y) <= reach * reach ? ft : world.hash.nearest(e.x, e.y, reach, grabbable);
      if (!v) break;
      {
        var held = root(v, ROOT_T + (world.mods.stats.rootDur || 0) + (ev.rootDur || 0));
        if (held && world.mods.behaviors.wreath) PB.Behaviors.onWreath(world, e, v);
        if (world.mods.behaviors.greenbelow && v.elite && v.elite.length && !v.sprouted) { v.sprouted = true; PB.Behaviors.greenBelow(world, v.x, v.y); }
        poison(world, v, e);
        if (g === (e.grabN || 1) - 1) e.grabCd = e.atk;
        var pull = ev.pull || e.pullAmt;
        if (pull) { // Strangler / Strangler Grove: drag the catch toward the vine, never into it
          var dx = e.x - v.x, dy = e.y - v.y, dl = Math.sqrt(dx * dx + dy * dy) || 1, mv = Math.min(pull, dl - e.r - v.r);
          if (mv > 0) { v.x += dx / dl * mv; v.y += dy / dl * mv; }
        }
        if (ev.cloud) enemiesNear(world, v.x, v.y, CLOUD_R, v).forEach(function (o) { poison(world, o, e); }); // Bloom
        PB.Events.emit(world.events, 'root', { src: e.id, dst: v.id, x: v.x, y: v.y });
      }
    }
    if (ev.execute) { // Devourer: swallow a rooted non-boss below the threshold
      e.swallowCd = Math.max(0, (e.swallowCd || 0) - dt);
      if (e.swallowCd <= 0) {
        var prey = enemiesNear(world, e.x, e.y, reach).filter(function (o) { return o.rooted > 0 && !o.boss && o.hp < o.maxHp * ev.execute; })[0];
        if (prey) {
          e.swallowCd = SWALLOW_CD;
          PB.Events.emit(world.events, 'swallow', { src: e.id, dst: prey.id, x: prey.x, y: prey.y });
          PB.World.kill(world, e, prey);
        }
      }
    }
    if (ev.heal) { // Bloom: heal summons in reach
      e.healT = (e.healT || 0) - dt;
      if (e.healT <= 1e-9) {
        e.healT = AURA_PULSE;
        for (var i = 0; i < world.ents.length; i++) {
          var f = world.ents[i];
          if (f.team === 0 && !f.dead && f !== e && d2(e.x, e.y, f.x, f.y) <= reach * reach) f.hp = Math.min(f.maxHp, f.hp + ev.heal * AURA_PULSE);
        }
      }
    }
    if (ev.sapling) { // Mother Briar: a 40% sapling (temp) every N seconds, living N seconds
      e.sapT = (e.sapT || 0) - dt;
      if (e.sapT <= 1e-9) {
        e.sapT = ev.sapling;
        var sa = world.rng.ai.range(0, TAU), hp = Math.round(e.maxHp * 0.4);
        PB.World.spawn(world, 'summon', 'vine', e.x + Math.cos(sa) * 50, e.y + Math.sin(sa) * 50,
          { temp: true, life: ev.sapling, sapling: true, hp: hp, maxHp: hp, dmg: [e.dmg[0] * 0.4, e.dmg[1] * 0.4], r: Math.round(e.r * 0.75), range: e.range });
      }
    }
    if (it.kind === 'attack' && e.cd <= 0 && e.atk > 0 && inReach(e, it.target)) {
      e.cd = (e.noGrab ? e.atk : VINE_LASH) / PB.Behaviors.rate(world, e, mul); // Carrion Bloom spits seeds at its own rate
      if (e.noGrab) PB.Events.emit(world.events, 'seed', { id: e.id, x: e.x, y: e.y, x2: it.target.x, y2: it.target.y });
      PB.World.damage(world, e, it.target);
    }
  }

  function aura(world, e, it, spd, mul, dt) {
    var rb = world.mods.behaviors.rootbound;
    if (rb) { e.vx = 0; e.vy = 0; } else follow(world, e, it, spd); // Rootbound: planted where summoned
    e.auraT = (e.auraT || 0) - dt;
    if (e.auraT > 1e-9 || !e.aura) return;
    e.auraT = AURA_PULSE;
    var r = e.aura.radius * (rb ? 1 + rb / 100 : 1), heal = (e.aura.regen || 0) * AURA_PULSE, until = world.time + AURA_PULSE + 0.05;
    var inc = e.aura.markAll ? 0 : e.aura.dmgInc || 0; // Omen's 15% is on Marked enemies, not a pack buff
    var bless = function (f) {
      if (d2(e.x, e.y, f.x, f.y) > r * r) return;
      f.hp = Math.min(f.maxHp, f.hp + heal);
      f.auraDmgInc = Math.max(f.auraDmgInc && world.time < f.auraUntil ? f.auraDmgInc : 0, inc);
      f.auraUntil = until;
      if (e.aura.leech) { f.leech = e.aura.leech; f.leechUntil = until; } // Bloodmoon
    };
    for (var i = 0; i < world.ents.length; i++) { var f = world.ents[i]; if (f.team === 0 && !f.dead && f !== e) bless(f); }
    if (world.player.hp > 0) bless(world.player);
  }

  // Guardian (and Hearthwolf): enemies within 150px of the druid that are going for the druid turn on this wolf.
  function guardian(world, e, dt) {
    e.guardT = (e.guardT || 0) - dt;
    if (e.guardT > 1e-9) return;
    e.guardT = 0.1;
    var p = world.player;
    if (d2(e.x, e.y, p.x, p.y) > 300 * 300) return;
    var n = 0;
    enemiesNear(world, p.x, p.y, GUARDIAN_R).forEach(function (o) {
      if (o.boss || o.targetId !== p.id || o.ai === 'phaser') return;
      o.tauntBy = e.id; o.tauntT = GUARDIAN_T; n++;
    });
    if (n) PB.Events.emit(world.events, 'taunt', { id: e.id, x: e.x, y: e.y, n: n, guardian: true });
  }

  var EXEC = { flank: flank, dart: dart, guard: guard, rooted: rooted, aura: aura };

  function update(world, e, dt, nearestEnemy, mul) {
    if (world.anchor === e) return; // Skinwalk: the player drives this one (skinwalk.js)
    if (e.stunT > 0) { e.stunT = Math.max(0, e.stunT - dt); e.vx *= 0.5; e.vy *= 0.5; return; } // D5 Sever
    var it = PB.AIFusions.follow(world, e, PB.Commands.intent(world, e, nearestEnemy));
    e.anchored = !!it.post && it.kind !== 'move';
    e.tgtId = it.kind === 'attack' ? it.target.id : 0;
    e.lungeCd = Math.max(0, (e.lungeCd || 0) - dt);
    e.leapCd = Math.max(0, (e.leapCd || 0) - dt);
    e.chargeCd = Math.max(0, (e.chargeCd || 0) - dt);
    var spd = e.speed * mul.speed * (PB.Slaughter ? PB.Slaughter.moveMul(world) : 1);
    if (it.trail && roleIs(e, 'wolf')) spd *= 1.3;
    if (world.pack.recallT > 0 && e.scars && e.scars.indexOf('loyal') >= 0) spd *= 1.2;
    var bs = world.mods.stats.bloodscent;
    if (bs && it.kind === 'attack' && it.target.hp < it.target.maxHp * BLOODSCENT_FRAC) spd *= 1 + bs / 100; // Bloodscent
    spd = PB.Behaviors.summonTick(world, e, it, dt, spd);
    if (spd < 0) return;
    if (evoOf(e).taunt) guardian(world, e, dt);
    PB.AIFusions.update(world, e, it, dt);
    if (PB.AIFusions.pre(world, e, it, dt)) return;
    if (!(e.lungeT > 0) && !(e.chargeT > 0) && PB.Feeding.tend(world, e, it, spd, dt)) return;
    var fn = EXEC[e.ai];
    if (fn) fn(world, e, it, spd, mul, dt);
    else if (it.kind === 'attack') engage(world, e, it.target, it.hold || null, spd, mul, it.leash);
    else follow(world, e, it, spd);
  }

  PB.AISummons = { update: update, beginTick: beginTick, engage: engage, strike: strike, poison: poison, mark: mark,
                   afterHit: afterHit, onKill: onKill, canRoot: canRoot, root: root, auraPulse: aura, flags: flags, chainHit: chainHit, enemiesNear: enemiesNear,
                   KNOCK: KNOCK, TAUNT_R: TAUNT_R, TAUNT_CD: TAUNT_CD };
})(globalThis.PB = globalThis.PB || {});
