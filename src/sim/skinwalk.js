// Skinwalk (spec §11.1). Tab possesses the summon under the cursor, else the nearest within 300px. While possessed
// world.anchor is that summon (leash, Heel, Rally and auras center on it), WASD moves it (+20% speed), LMB is its
// basic attack (+30% damage, +skinDmg), RMB its signature. The druid stays behind as a rooted husk with 50% damage
// reduction; if the husk falls you snap back at 25% life, stunned 1 s. 10 s (+skinDur), cooldown 14 s; Wildheart has no
// limit and the husk flees; Mirrored leaves an echo copy on exit.
(function (PB) {
  'use strict';
  var DUR = 10, CD = 14, PICK_R = 300, CURSOR_R = 30, HUSK_DR = 0.5, SPEED = 1.2, DMG = 0.30, SIG_CD = 4, SNAP = 0.25, STUN = 1;
  var POUNCE = 200, POUNCE_T = 0.25, KNOCKDOWN = 0.5, DIVE = 260, DIVE_W = 30, SLAM_R = 110, SLAM_MUL = 1.5, PULSE = 0.15;
  var FLEE_R = 300, ECHO_T = 7, EPS = 1e-9;

  function state(world) { return world.skin || (world.skin = { id: 0, left: 0, cd: 0, sigCd: 0 }); }
  function d2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function isPack(e) { return e.team === 0 && !e.dead && e.kind === 'summon' && !e.temp; }

  function enter(world, target, cursor) {
    var s = state(world), p = world.player, i, e = target || null;
    if (world.anchor) return { ok: false, reason: 'active' };
    if (s.cd > EPS) return { ok: false, reason: 'cooldown' };
    if (p.hp <= 0 || p.stunT > 0) return { ok: false, reason: 'down' };
    if (!e && cursor) {
      var bd = Infinity;
      for (i = 0; i < world.ents.length; i++) {
        var c = world.ents[i], r = c.r + CURSOR_R, dc = d2(c.x, c.y, cursor.x, cursor.y);
        if (isPack(c) && dc <= r * r && dc < bd) { e = c; bd = dc; }
      }
    }
    if (!e) {
      var bp = PICK_R * PICK_R;
      for (i = 0; i < world.ents.length; i++) {
        var n = world.ents[i], dn = d2(n.x, n.y, p.x, p.y);
        if (isPack(n) && dn <= bp) { e = n; bp = dn; }
      }
    }
    if (!e) return { ok: false, reason: 'none' };
    var st = world.mods.stats;
    world.anchor = e; s.id = e.id; s.sigCd = 0;
    s.left = world.mods.behaviors.wildheart ? -1 : DUR + (st.skinDur || 0);
    e.skinInc = DMG + (st.skinDmg || 0) / 100; e.possessed = true; e.vx = 0; e.vy = 0;
    PB.Feeding.stop(world, e);
    p.dr = HUSK_DR;
    PB.Events.emit(world.events, 'skinwalk', { id: e.id, unit: e.type, x: e.x, y: e.y });
    return { ok: true, ent: e };
  }

  function exit(world, reason) {
    var e = world.anchor, s = state(world), p = world.player;
    if (!e) return false;
    world.anchor = null; s.id = 0; s.left = 0; s.cd = CD; p.dr = 0;
    e.skinInc = 0; e.possessed = false; e.pounceT = 0;
    var mir = world.mods.behaviors.mirrored;
    if (mir && !e.dead) {
      PB.World.spawn(world, 'summon', e.type, e.x + 20, e.y, {
        temp: true, life: mir > 1 ? mir : ECHO_T, echo: true, hp: e.maxHp, maxHp: e.maxHp, dmg: e.dmg.slice(), atk: e.atk, speed: e.speed,
        r: e.r, mass: e.mass, range: e.range, tags: e.tags.slice(), ai: e.ai, flying: e.flying, aura: e.aura, critChance: e.critChance, critMult: e.critMult
      });
    }
    PB.Events.emit(world.events, 'skinwalk-end', { id: e.id, reason: reason, x: e.x, y: e.y });
    return true;
  }

  // The husk dropped to 0: back in the body at 25% life, stunned.
  function snapBack(world) {
    var p = world.player;
    exit(world, 'husk');
    p.hp = p.maxHp * SNAP; p.stunT = STUN;
  }

  // Timers; called by Player.update every advancing tick.
  function tick(world, dt) {
    var s = state(world), e = world.anchor;
    s.cd = Math.max(0, s.cd - dt); s.sigCd = Math.max(0, s.sigCd - dt);
    if (!e) return;
    if (e.dead) { exit(world, 'lost'); return; }
    if (s.left > 0) { s.left -= dt; if (s.left <= EPS) exit(world, 'time'); }
  }

  function enemiesNear(world, x, y, r) { return PB.AISummons.enemiesNear(world, x, y, r); }
  function sub(e, mul) { return { id: e.id, kind: 'summon', team: 0, tags: e.tags, x: e.x, y: e.y, dmg: [e.dmg[0] * mul, e.dmg[1] * mul], critChance: e.critChance, critMult: e.critMult, skinInc: e.skinInc, indId: e.indId }; }

  // The RMB signature by body type: the five base moves, and each fusion's own ability on demand (spec §11.1). Keyed
  // by the fused type, never by tag order, so wolf+raven and raven+wolf Storm Hounds play the same.
  var BASE_SIG = { wolf: 'pounce', raven: 'dive', bear: 'slam', vine: 'lash', spirit: 'pulse' };
  var FUSION_SIG = { stormhound: 'stormblink', direwarg: 'warcleave', thornpelt: 'brambles', wraithwolf: 'phase', owlbear: 'owlleap',
                     carrionbloom: 'crows', omen: 'omen', rootwarden: 'quake', eldersbear: 'roar', lifebloom: 'bloom',
                     alphawolf: 'pounce', murder: 'dive', greatbear: 'slam', stranglegrove: 'lash', twinspirit: 'pulse' };
  var BLINK_R = 400, CLEAVE_ARC = 45 * Math.PI / 180, CLEAVE_MUL = 1.3, BRAMBLE_N = 8, BRAMBLE_R = 50, CROW_N = 3, CROW_T = 6, CROW_R = 260;
  var QUAKE_R = 120, QUAKE_T = 1.2, ROAR_R = 200, ROAR_T = 1.5;
  function sigKind(e) { return FUSION_SIG[e.cast] || FUSION_SIG[e.type] || BASE_SIG[e.type] || BASE_SIG[e.role] || BASE_SIG[e.tags[0]] || 'pounce'; }

  // The enemy nearest the cursor within r of the body, or null.
  function enemyNearCursor(world, e, at, r) {
    var best = null, bd = Infinity;
    enemiesNear(world, e.x, e.y, r).forEach(function (o) { var d = d2(o.x, o.y, at.x, at.y); if (d < bd) { best = o; bd = d; } });
    return best;
  }

  // RMB while possessed.
  function signature(world, at) {
    var e = world.anchor, s = state(world);
    if (!e || e.dead) return { ok: false, reason: 'none' };
    if (e.sleepT > 0) return { ok: false, reason: 'asleep' };
    if (e.stunT > 0) return { ok: false, reason: 'stunned' };
    var kind = sigKind(e), dx = at.x - e.x, dy = at.y - e.y, dl = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / dl, uy = dy / dl;
    if (kind === 'lash') { if (e.grabCd > EPS) return { ok: false, reason: 'cooldown' }; }
    else if (s.sigCd > EPS) return { ok: false, reason: 'cooldown' };
    var x2 = e.x, y2 = e.y;
    switch (kind) {
      case 'pounce':
      case 'phase':
      case 'dive': {
        var len = kind === 'dive' ? DIVE : Math.min(POUNCE, dl);
        if (kind !== 'pounce') { // Dive Marks along the strafe; the Wraith Wolf phases through and bites each body it crosses
          var hitter = sub(e, 1);
          for (var i = 0; i < world.ents.length; i++) { // every enemy whose body touches the strafe line
            var o = world.ents[i];
            if (o.team !== 1 || o.dead) continue;
            var t = Math.max(0, Math.min(len, (o.x - e.x) * ux + (o.y - e.y) * uy)), px = e.x + ux * t, py = e.y + uy * t;
            if (d2(px, py, o.x, o.y) > (DIVE_W + o.r) * (DIVE_W + o.r)) continue;
            if (kind === 'dive') PB.AISummons.mark(world, o, e);
            PB.World.damage(world, hitter, o);
          }
        }
        e.vx = ux * len / POUNCE_T; e.vy = uy * len / POUNCE_T; e.pounceT = POUNCE_T; e.pounceKind = kind === 'phase' ? 'dive' : kind;
        x2 = e.x + ux * len; y2 = e.y + uy * len;
        break;
      }
      case 'slam': {
        var big = sub(e, SLAM_MUL);
        enemiesNear(world, e.x, e.y, SLAM_R).forEach(function (o) { PB.World.damage(world, big, o); PB.World.knock(o, e.x, e.y, PB.AISummons.KNOCK.bear); });
        PB.World.hitStop(world, 60);
        break;
      }
      case 'lash': {
        var reach = e.range + e.r, v = null, bv = Infinity;
        enemiesNear(world, e.x, e.y, reach).forEach(function (o) { var dv = d2(o.x, o.y, at.x, at.y); if (PB.AISummons.canRoot(o) && dv < bv) { v = o; bv = dv; } });
        if (!v) return { ok: false, reason: 'none' };
        var held = PB.AISummons.root(v, 1.5 + (world.mods.stats.rootDur || 0) + ((e.evo && e.evo.rootDur) || 0));
        if (held && world.mods.behaviors.wreath) PB.Behaviors.onWreath(world, e, v);
        PB.AISummons.poison(world, v, e);
        e.grabCd = e.atk / 2;
        x2 = v.x; y2 = v.y;
        PB.Events.emit(world.events, 'root', { src: e.id, dst: v.id, x: v.x, y: v.y });
        break;
      }
      case 'pulse':
        for (var k = 0; k < world.ents.length; k++) { var f = world.ents[k]; if (f.team === 0 && !f.dead) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * PULSE); }
        break;
      case 'owlleap':
        e.vx = (at.x - e.x) / 0.3; e.vy = (at.y - e.y) / 0.3; e.owlT = 0.3; x2 = at.x; y2 = at.y;
        break;
      case 'stormblink': { // blink beside the enemy at the cursor, Mark it and bite: the bite chains to Marked enemies
        var tb = enemyNearCursor(world, e, at, BLINK_R);
        if (!tb) return { ok: false, reason: 'none' };
        var db = Math.sqrt(d2(e.x, e.y, tb.x, tb.y)) || 1, back = e.r + tb.r + 4;
        PB.Events.emit(world.events, 'blink', { id: e.id, x: e.x, y: e.y, x2: tb.x - (tb.x - e.x) / db * back, y2: tb.y - (tb.y - e.y) / db * back });
        e.x = tb.x - (tb.x - e.x) / db * back; e.y = tb.y - (tb.y - e.y) / db * back; e.vx = 0; e.vy = 0;
        PB.AISummons.mark(world, tb, e);
        PB.AISummons.strike(world, e, tb, PB.Commands.packMul(world), true);
        x2 = tb.x; y2 = tb.y;
        break;
      }
      case 'warcleave': { // a 90° cleave toward the cursor, and the war howl: pack +15% move speed
        var aimA = Math.atan2(dy, dx), cl = sub(e, CLEAVE_MUL), reachC = e.r + e.range + 20;
        enemiesNear(world, e.x, e.y, reachC).forEach(function (o) {
          var dd = Math.sqrt(d2(e.x, e.y, o.x, o.y)), slack = dd > 1 ? Math.asin(Math.min(1, o.r / dd)) : Math.PI;
          if (Math.abs(PB.M.angleDiff(aimA, Math.atan2(o.y - e.y, o.x - e.x))) <= CLEAVE_ARC + slack) PB.World.damage(world, cl, o);
        });
        world.pack.wargT = PB.AIFusions.WARG_T;
        PB.Events.emit(world.events, 'cleave', { id: e.id, x: e.x, y: e.y, angle: aimA, radius: reachC });
        PB.Events.emit(world.events, 'warghowl', { id: e.id, x: e.x, y: e.y });
        break;
      }
      case 'brambles': // a ring of bramble patches around the Thornpelt: slow and poison
        for (var bi = 0; bi < BRAMBLE_N; bi++) {
          var ba = bi / BRAMBLE_N * PB.M.TAU;
          world.patches.push({ kind: 'bramble', x: e.x + Math.cos(ba) * BRAMBLE_R, y: e.y + Math.sin(ba) * BRAMBLE_R, r: 24, t: 3, src: e.id });
        }
        while (world.patches.length > 40) world.patches.shift();
        break;
      case 'crows': { // the bloom bursts three carrion crows at the cursor (within its 260px reach)
        var cdx = at.x - e.x, cdy = at.y - e.y, cdl = Math.sqrt(cdx * cdx + cdy * cdy), ck = cdl > CROW_R ? CROW_R / cdl : 1;
        x2 = e.x + cdx * ck; y2 = e.y + cdy * ck;
        for (var ci = 0; ci < CROW_N; ci++) {
          var ca = ci / CROW_N * PB.M.TAU;
          PB.World.spawn(world, 'summon', 'raven', x2 + Math.cos(ca) * 14, y2 + Math.sin(ca) * 14, { temp: true, life: CROW_T, crow: true });
        }
        PB.Events.emit(world.events, 'crows', { x: x2, y: y2, src: e.id });
        break;
      }
      case 'omen': { // Mark every enemy in the aura now
        var ms = enemiesNear(world, e.x, e.y, e.aura ? e.aura.radius : 260);
        ms.forEach(function (o) { PB.AISummons.mark(world, o, e); });
        PB.Events.emit(world.events, 'omen', { id: e.id, x: e.x, y: e.y, radius: e.aura ? e.aura.radius : 260, n: ms.length });
        break;
      }
      case 'quake': // the Rootwarden's slam: everything within 120px is rooted
        enemiesNear(world, e.x, e.y, QUAKE_R).forEach(function (o) { PB.AISummons.root(o, QUAKE_T); });
        PB.Events.emit(world.events, 'quake', { id: e.id, x: e.x, y: e.y, radius: QUAKE_R });
        break;
      case 'roar': { // the Elder Ursine's roar: non-elites within 200px flee
        var sc = enemiesNear(world, e.x, e.y, ROAR_R).filter(function (o) { return !o.boss && !(o.elite && o.elite.length); });
        sc.forEach(function (o) { o.fleeT = Math.max(o.fleeT || 0, ROAR_T); });
        e.roarT = Math.max(e.roarT || 0, PB.AIFusions.ROAR_CD);
        PB.Events.emit(world.events, 'roar', { id: e.id, x: e.x, y: e.y, radius: ROAR_R, n: sc.length });
        break;
      }
      case 'bloom': { // Lifebloom: call back the summon resting longest in the Den; with nobody resting, heal the pack 15%
        var pick = null, until = Infinity;
        for (var id in world.den) {
          var ind = world.inds[id];
          if (!ind || world.active[id] || world.time >= world.den[id]) continue;
          if (world.den[id] < until) { pick = ind; until = world.den[id]; }
        }
        var back2 = pick ? (delete world.den[pick.id], PB.World.spawnIndividual(world, pick, e.x + 30, e.y)) : null;
        if (back2) PB.Events.emit(world.events, 'revive', { id: back2.id, indId: pick.id, x: back2.x, y: back2.y, src: e.id });
        else for (var hk = 0; hk < world.ents.length; hk++) { var hf = world.ents[hk]; if (hf.team === 0 && !hf.dead) hf.hp = Math.min(hf.maxHp, hf.hp + hf.maxHp * PULSE); }
        break;
      }
    }
    if (kind !== 'lash') s.sigCd = SIG_CD;
    PB.Events.emit(world.events, 'signature', { id: e.id, sig: kind, x: e.x, y: e.y, x2: x2, y2: y2 });
    return { ok: true, kind: kind };
  }

  // WASD and LMB drive the possessed summon. Called by Player.update while world.anchor is set.
  function control(world, input, dt) {
    var e = world.anchor;
    if (!e || e.dead) return;
    if (e.stunT > 0) { e.stunT = Math.max(0, e.stunT - dt); e.vx *= 0.5; e.vy *= 0.5; return; } // Sever stuns a possessed body too
    if (PB.Behaviors.bodyTick(world, e, dt)) return; // a sleeping bear sleeps under the druid too: no moves, no strikes
    var mul = PB.Commands.packMul(world), idle = { kind: 'idle' };
    if (e.grabCd > 0) e.grabCd = Math.max(0, e.grabCd - dt);
    PB.AIFusions.update(world, e, idle, dt);
    if (e.ai === 'aura') PB.AISummons.auraPulse(world, e, idle, 0, mul, dt);
    if (e.owlT > 0) { PB.AIFusions.pre(world, e, idle, dt); return; }
    if (e.pounceT > 0) {
      e.pounceT -= dt;
      if (e.pounceT <= EPS) {
        e.pounceT = 0; e.vx *= 0.1; e.vy *= 0.1;
        if (e.pounceKind === 'pounce') { // landing knocks the nearest body down
          var land = enemiesNear(world, e.x, e.y, e.r + 30)[0];
          if (land) { land.frozenT = Math.max(land.frozenT || 0, KNOCKDOWN); e.cd = 0; PB.AISummons.strike(world, e, land, mul, true); }
        }
      }
      return;
    }
    var mx = input.move.x, my = input.move.y, ml = Math.sqrt(mx * mx + my * my), spd = e.speed * SPEED * mul.speed;
    if (ml > 0 && e.rooted <= 0) { e.vx = mx / ml * spd; e.vy = my / ml * spd; } else { e.vx *= 0.7; e.vy *= 0.7; }
    var held = input.held || [];
    if (held.indexOf('thornlash') >= 0 && e.cd <= EPS && e.atk > 0) {
      var reach = e.r + e.range + 8, best = null, bd = Infinity, aim = input.aim;
      enemiesNear(world, e.x, e.y, reach).forEach(function (o) { var d = d2(o.x, o.y, aim.x, aim.y); if (d < bd) { best = o; bd = d; } });
      if (best) PB.AISummons.strike(world, e, best, mul, false);
    }
  }

  // Wildheart: the empty body runs from the nearest enemy.
  function husk(world, dt) {
    var p = world.player;
    if (!world.mods.behaviors.wildheart) return;
    var foe = world.hash.nearest(p.x, p.y, FLEE_R, PB.World.isEnemy);
    if (!foe) return;
    var dx = p.x - foe.x, dy = p.y - foe.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
    p.x = PB.M.clamp(p.x + dx / dl * p.speed * dt, 0, world.width); p.y = PB.M.clamp(p.y + dy / dl * p.speed * dt, 0, world.height);
  }

  PB.Skinwalk = { enter: enter, exit: exit, snapBack: snapBack, tick: tick, signature: signature, control: control, husk: husk, state: state, sigKind: sigKind,
                  DUR: DUR, CD: CD, PICK_R: PICK_R };
})(globalThis.PB = globalThis.PB || {});
