// Fusion abilities (spec §8 table): 10 cross fusions and 5 Alphas. A fused summon still runs its base executor
// (flank, guard, rooted, aura from the FUSIONS row); this file adds each ability on top through five hooks that
// ai_summons.js and world.js call: onSpawn (perks), pre (moves that replace the executor for a tick: blink, leap),
// update (timers: trails, roars, beams, pulses), afterHit (riders on a landed strike), onKill and onHurt.
(function (PB) {
  'use strict';
  var BLINK_CD = 4, BLINK_MIN = 60, STORM_R = 160, STORM_N = 2, STORM_SHARE = 0.6;
  var WARG_ARC = 45 * Math.PI / 180, WARG_T = 4, WARG_SPEED = 1.15;
  var REFLECT = 0.3, TRAIL_EVERY = 0.25, PATCH_T = 3, PATCH_R = 24, PATCH_MAX = 40, PATCH_SLOW = 0.3;
  var WRAITH_HEAL = 0.25;
  var OWL_CD = 7, OWL_R = 350, OWL_CLUSTER = 80, OWL_T = 0.3, OWL_SLAM = 90, BLIND_T = 2;
  var CROW_N = 3, CROW_T = 6, BLOOM_R = 260;
  var WARDEN_ROOT_R = 120, WARDEN_ROOT_T = 1.2, WARDEN_SAP = 15;
  var PULSE = 0.25, ROAR_CD = 10, ROAR_R = 200, ROAR_T = 1.5;
  var BEAM = 8, REVIVE_CD = 30;
  var ALPHA_R = 250, ALPHA_INC = 0.20, MURDER_R = 60, MURDER_EXTRA = 2;
  var EPS = 1e-9;

  function d2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function near(world, x, y, r, skip) { return PB.AISummons.enemiesNear(world, x, y, r, skip); }
  function sub(e, share) { return { id: e.id, kind: 'summon', team: 0, tags: e.tags, x: e.x, y: e.y, dmg: [e.dmg[0] * share, e.dmg[1] * share], critChance: 0 }; }
  function friends(world, fn) {
    for (var i = 0; i < world.ents.length; i++) { var f = world.ents[i]; if (f.team === 0 && !f.dead) fn(f); }
  }

  // Perks that change the body itself. Called by World.spawnIndividual and World.refreshIndividual.
  function onSpawn(world, e) {
    switch (e.type) {
      case 'wraithwolf': e.ghost = true; break;
      case 'carrionbloom': e.noGrab = true; break;
      case 'greatbear': e.r = PB.SUMMONS.bear.r * 1.4; e.knockMul = 2; e.tauntR = 220; break;
      case 'stranglegrove': e.range = 220; e.grabN = 2; e.pullAmt = 60; break;
      case 'twinspirit':
        if (e.aura) { e.aura.regen = PB.SUMMONS.spirit.aura.regen * PB.EVOLUTIONS.spirit.A.t2.mods.regen; e.aura.dmgInc = PB.EVOLUTIONS.spirit.B.t2.mods.dmgAura; }
        break;
    }
  }

  // ---------- pre: moves that take the whole tick ----------
  function pre(world, e, it, dt) {
    if (e.owlT > 0) { // Owlbear in the air
      e.owlT -= dt;
      if (e.owlT <= EPS) {
        e.owlT = 0; e.vx = 0; e.vy = 0; e.owlCd = OWL_CD;
        var hit = near(world, e.x, e.y, OWL_SLAM), s = sub(e, 1);
        hit.forEach(function (o) { o.blindT = BLIND_T; PB.World.damage(world, s, o); });
        PB.Events.emit(world.events, 'owlslam', { id: e.id, x: e.x, y: e.y, radius: OWL_SLAM, n: hit.length });
        PB.World.hitStop(world, 60);
      }
      return true;
    }
    if (e.type === 'stormhound' && it.kind === 'attack' && it.target.marked > 0 && !(e.blinkCd > 0) && e.rooted <= 0) {
      var t = it.target, dist = Math.sqrt(d2(e.x, e.y, t.x, t.y)), gap = dist - e.r - t.r;
      if (gap > BLINK_MIN) {
        var back = e.r + t.r + e.range * 0.5, ux = (t.x - e.x) / dist, uy = (t.y - e.y) / dist;
        PB.Events.emit(world.events, 'blink', { id: e.id, x: e.x, y: e.y, x2: t.x - ux * back, y2: t.y - uy * back });
        e.x = t.x - ux * back; e.y = t.y - uy * back; e.vx = 0; e.vy = 0; e.blinkCd = BLINK_CD;
        return true;
      }
    }
    if (e.type === 'owlbear' && !(e.owlCd > 0) && e.rooted <= 0) {
      // Densest cluster: the enemy with the most neighbours within 80px, nearest on ties.
      var cands = near(world, e.x, e.y, OWL_R), best = null, bestN = -1; // a lone enemy is a cluster of one (critique-stageC-grok N3)
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i], n = near(world, c.x, c.y, OWL_CLUSTER, c).length;
        if (n > bestN) { best = c; bestN = n; }
      }
      if (!best) { e.owlCd = 0.5; return false; }
      var grp = near(world, best.x, best.y, OWL_CLUSTER), cx = 0, cy = 0;
      grp.forEach(function (o) { cx += o.x; cy += o.y; });
      cx /= grp.length; cy /= grp.length;
      e.vx = (cx - e.x) / OWL_T; e.vy = (cy - e.y) / OWL_T; e.owlT = OWL_T;
      PB.Events.emit(world.events, 'owlleap', { id: e.id, x: e.x, y: e.y, x2: cx, y2: cy });
      return true;
    }
    return false;
  }

  // ---------- update: timers that run alongside the executor ----------
  function update(world, e, it, dt) {
    if (e.blinkCd > 0) e.blinkCd = Math.max(0, e.blinkCd - dt);
    if (e.owlCd > 0) e.owlCd = Math.max(0, e.owlCd - dt);
    switch (e.type) {
      case 'thornpelt':
        e.trailT = (e.trailT || 0) - dt;
        if (e.trailT <= EPS && e.vx * e.vx + e.vy * e.vy > 400) {
          e.trailT = TRAIL_EVERY;
          world.patches.push({ kind: 'bramble', x: e.x, y: e.y, r: PATCH_R, t: PATCH_T, src: e.id });
          if (world.patches.length > PATCH_MAX) world.patches.shift();
        }
        break;
      case 'omen':
        e.omenT = (e.omenT || 0) - dt;
        if (e.omenT <= EPS) {
          e.omenT = e.aura.markAll;
          var ms = near(world, e.x, e.y, e.aura.radius);
          ms.forEach(function (o) { PB.AISummons.mark(world, o); });
          PB.Events.emit(world.events, 'omen', { id: e.id, x: e.x, y: e.y, radius: e.aura.radius, n: ms.length });
        }
        break;
      case 'rootwarden':
        e.sapT = (e.sapT || 0) - dt;
        if (e.sapT <= EPS) {
          e.sapT = WARDEN_SAP;
          var a = world.rng.ai.range(0, PB.M.TAU);
          PB.World.spawn(world, 'summon', 'vine', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, { temp: true, life: WARDEN_SAP, sapling: true });
        }
        break;
      case 'eldersbear':
        e.pulseT = (e.pulseT || 0) - dt;
        if (e.pulseT <= EPS) {
          e.pulseT = PULSE;
          var r2 = e.aura.radius * e.aura.radius, until = world.time + PULSE + 0.05;
          friends(world, function (f) { if (d2(e.x, e.y, f.x, f.y) <= r2) { f.auraDr = e.aura.dr; f.auraDrUntil = until; } });
          if (d2(e.x, e.y, world.player.x, world.player.y) <= r2) { world.player.auraDr = e.aura.dr; world.player.auraDrUntil = until; }
        }
        e.roarT = (e.roarT || 0) - dt;
        if (e.roarT <= EPS) {
          var scared = near(world, e.x, e.y, ROAR_R).filter(function (o) { return !o.boss && !(o.elite && o.elite.length); });
          if (scared.length) {
            e.roarT = ROAR_CD;
            scared.forEach(function (o) { o.fleeT = Math.max(o.fleeT, ROAR_T); });
            PB.Events.emit(world.events, 'roar', { id: e.id, x: e.x, y: e.y, radius: ROAR_R, n: scared.length });
          }
        }
        break;
      case 'lifebloom':
        e.pulseT = (e.pulseT || 0) - dt;
        if (e.pulseT <= EPS) {
          e.pulseT = PULSE;
          var low = null, lf = 1, R = e.aura.radius;
          friends(world, function (f) {
            if (f === e || f.hp >= f.maxHp || d2(e.x, e.y, f.x, f.y) > (R + f.r) * (R + f.r)) return;
            var fr = f.hp / f.maxHp;
            if (fr < lf || (fr === lf && low && f.id < low.id)) { low = f; lf = fr; }
          });
          if (low) { low.hp = Math.min(low.maxHp, low.hp + BEAM * PULSE); e.beamId = low.id; } else e.beamId = 0;
        }
        e.reviveT = Math.max(0, (e.reviveT || 0) - dt);
        if (e.reviveT <= EPS && world.save) {
          var pick = null, until2 = Infinity;
          for (var id in world.den) {
            var ind = world.inds[id];
            if (!ind || world.active[id] || world.time >= world.den[id]) continue;
            if (world.den[id] < until2 || (world.den[id] === until2 && +id < pick.id)) { pick = ind; until2 = world.den[id]; }
          }
          if (pick) {
            delete world.den[pick.id];
            var back = PB.World.spawnIndividual(world, pick, e.x + 30, e.y);
            if (back) { e.reviveT = REVIVE_CD; PB.Events.emit(world.events, 'revive', { id: back.id, indId: pick.id, x: back.x, y: back.y, src: e.id }); }
          }
        }
        break;
      case 'alphawolf':
        e.pulseT = (e.pulseT || 0) - dt;
        if (e.pulseT <= EPS) {
          e.pulseT = PULSE;
          var u2 = world.time + PULSE + 0.05;
          friends(world, function (f) {
            if (f === e || f.tags.indexOf('wolf') < 0 || d2(e.x, e.y, f.x, f.y) > ALPHA_R * ALPHA_R) return;
            f.alphaInc = ALPHA_INC; f.alphaUntil = u2; f.followId = e.tgtId || 0;
          });
        }
        break;
    }
  }

  // Wolves near an Alpha Wolf take its target (free mode only: orders, posts and Rally still win).
  function follow(world, e, it) {
    if (!e.followId || !(world.time < e.alphaUntil) || world.pack.order.kind !== 'free' || it.post || it.trail || world.pack.recallT > 0) return it;
    if (it.kind !== 'attack' && it.kind !== 'idle' && it.kind !== 'move') return it;
    var t = world.byId[e.followId];
    if (!t || t.dead || t.team !== 1) return it;
    return { kind: 'attack', target: t };
  }

  // ---------- afterHit: riders on a landed strike ----------
  function afterHit(world, e, target, h) {
    var s;
    switch (e.type) {
      case 'stormhound':
        s = sub(e, STORM_SHARE);
        near(world, target.x, target.y, STORM_R, target).filter(function (o) { return o.marked > 0; }).slice(0, STORM_N).forEach(function (o) {
          PB.Events.emit(world.events, 'chain', { x: target.x, y: target.y, x2: o.x, y2: o.y, src: e.id });
          PB.World.damage(world, s, o);
        });
        break;
      case 'direwarg': {
        s = sub(e, 1);
        var aim = Math.atan2(target.y - e.y, target.x - e.x), reach = e.r + e.range;
        near(world, e.x, e.y, reach, target).forEach(function (o) {
          var d = Math.sqrt(d2(e.x, e.y, o.x, o.y)), slack = d > 1 ? Math.asin(Math.min(1, o.r / d)) : Math.PI;
          if (Math.abs(PB.M.angleDiff(aim, Math.atan2(o.y - e.y, o.x - e.x))) <= WARG_ARC + slack) PB.World.damage(world, s, o);
        });
        PB.Events.emit(world.events, 'cleave', { id: e.id, x: e.x, y: e.y, angle: aim, radius: reach });
        break;
      }
      case 'wraithwolf': {
        var p = world.player;
        if (p.hp > 0 && h.taken > 0) p.hp = Math.min(p.maxHp, p.hp + h.taken * WRAITH_HEAL);
        break;
      }
      case 'rootwarden':
        near(world, e.x, e.y, WARDEN_ROOT_R).forEach(function (o) { PB.AISummons.root(o, WARDEN_ROOT_T); });
        PB.Events.emit(world.events, 'quake', { id: e.id, x: e.x, y: e.y, radius: WARDEN_ROOT_R });
        break;
      case 'murder':
        s = sub(e, 1);
        near(world, target.x, target.y, MURDER_R, target).slice(0, MURDER_EXTRA).forEach(function (o) { PB.World.damage(world, s, o); PB.AISummons.mark(world, o, e); });
        break;
    }
  }

  function onKill(world, att, def) {
    if (att && att.type === 'direwarg' && att.team === 0) {
      world.pack.wargT = WARG_T;
      PB.Events.emit(world.events, 'warghowl', { id: att.id, x: att.x, y: att.y });
    }
    // Carrion Bloom: a death within 260px of a bloom bursts into 3 crows (temps, 6s).
    for (var i = 0; i < world.ents.length; i++) {
      var b = world.ents[i];
      if (b.type !== 'carrionbloom' || b.dead || b.team !== 0) continue;
      if (d2(b.x, b.y, def.x, def.y) > (BLOOM_R + def.r) * (BLOOM_R + def.r)) continue;
      for (var k = 0; k < CROW_N; k++) {
        var a = k / CROW_N * PB.M.TAU;
        PB.World.spawn(world, 'summon', 'raven', def.x + Math.cos(a) * 14, def.y + Math.sin(a) * 14, { temp: true, life: CROW_T, crow: true });
      }
      PB.Events.emit(world.events, 'crows', { x: def.x, y: def.y, src: b.id });
      break;
    }
  }

  // Thornpelt: 30% of melee damage taken goes back to the biter (telegraph hits are not melee).
  function onHurt(world, att, def, h) {
    if (def.type !== 'thornpelt' || att.team !== 1 || world.byId[att.id] !== att || !(h.amount > 0) || att.dead) return;
    PB.World.direct(world, def.id, att, h.amount * REFLECT, false, 'reflect');
  }

  // Step slot 6c: ground patches (Thornpelt brambles) slow and poison the enemies standing in them.
  function tick(world, dt) {
    var list = world.patches;
    for (var i = list.length - 1; i >= 0; i--) {
      var pt = list[i];
      pt.t -= dt;
      if (pt.t <= EPS) { list.splice(i, 1); continue; }
      if (pt.kind === 'wake') {
        near(world, pt.x, pt.y, pt.r).forEach(function (o) {
          if (pt.zone === 0) o.slowT = Math.max(o.slowT || 0, 0.4);
          else if (pt.zone === 1) PB.World.applyDot(o, 'burn', 4, 0.5, 0);
          else if (pt.zone === 2) o.chillT = Math.max(o.chillT || 0, 0.4);
          else if (pt.zone === 3) PB.World.direct(world, 0, o, 2, false, 'zap');
          else PB.World.applyDot(o, 'poison', 4, 0.5, 0);
        });
        continue;
      }
      var src = world.byId[pt.src] || { id: pt.src };
      near(world, pt.x, pt.y, pt.r).forEach(function (o) { o.slowT = Math.max(o.slowT || 0, PATCH_SLOW); PB.AISummons.poison(world, o, src); });
    }
    if (world.pack.wargT > 0) world.pack.wargT = Math.max(0, world.pack.wargT - dt);
  }

  PB.AIFusions = { onSpawn: onSpawn, pre: pre, update: update, follow: follow, afterHit: afterHit, onKill: onKill, onHurt: onHurt, tick: tick,
                   WARG_SPEED: WARG_SPEED, WARG_T: WARG_T, ROAR_CD: ROAR_CD, REVIVE_CD: REVIVE_CD };
})(globalThis.PB = globalThis.PB || {});
