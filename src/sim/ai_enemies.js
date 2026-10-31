// Enemy AI (spec §9.2) and the telegraph system (§9.1). Every damaging ability is a world telegraph that warns
// for its full `tele` and then resolves once, against the friends whose bodies overlap the shape at that moment.
(function (PB) {
  'use strict';
  var EPS = 1e-9, NOTICE = 600, LOW_PRIO = 300, LINK_CUT = 4;
  // Per-AI ranged behaviour: cd after a cast; keep = back off when nearer than keep × range; melee = bites on contact.
  var STYLE = {
    swarm:   { melee: true },
    phaser:  { melee: true, phase: true },
    charger: { melee: true, cd: 4.5 },
    slammer: { melee: true, cd: 3.8 },
    diver:   { melee: true, cd: 4.5 },
    lobber:  { melee: false, cd: 3.2, keep: 0.5 },
    archer:  { melee: false, cd: 2.8, keep: 0.5 }
  };
  var CHAIN_R = 90, CHAIN_SHARE = 0.5, INTERCEPT_R = 260, INTERCEPT_CD = 5;

  function d2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function isFriend(e) { return e.team === 0 && !e.dead && e.kind !== 'player'; }
  function lowPrio(e) { return !!e.flying || e.ai === 'aura'; }

  // ---------- telegraph shapes ----------
  // tg: {kind, x, y, angle (radians, aim), arc (degrees, cone width), radius, inner, width, length}
  function contains(tg, px, py, r) {
    var dx = px - tg.x, dy = py - tg.y, d = Math.sqrt(dx * dx + dy * dy);
    r = r || 0;
    switch (tg.kind) {
      case 'circle': return d <= tg.radius + r;
      case 'ring': return d - r <= tg.radius && d + r >= (tg.inner || 0);
      case 'line': {
        var ux = Math.cos(tg.angle), uy = Math.sin(tg.angle), t = dx * ux + dy * uy;
        var tc = Math.max(0, Math.min(tg.length, t)), cx = tg.x + ux * tc, cy = tg.y + uy * tc;
        if (t < -r || t > tg.length + r) return false;
        return d2(px, py, cx, cy) <= (tg.width / 2 + r) * (tg.width / 2 + r);
      }
      case 'cone': {
        if (d > tg.radius + r) return false;
        if (d < EPS) return true;
        var slack = Math.asin(Math.min(1, r / d));
        return Math.abs(PB.M.angleDiff(tg.angle, Math.atan2(dy, dx))) <= tg.arc * Math.PI / 360 + slack;
      }
    }
    return false;
  }

  function create(world, o) {
    var tg = { id: world.nextTg = (world.nextTg || 0) + 1, kind: o.kind, x: o.x, y: o.y, angle: o.angle || 0, arc: o.arc || 0,
               radius: o.radius || 0, inner: o.inner || 0, width: o.width || 0, length: o.length || 0, tele: o.tele, t: 0,
               dmg: o.dmg || 0, owner: o.owner != null ? o.owner : -1, targetId: o.targetId || 0, range: o.range || 0,
               dash: o.dash || null, boss: !!o.boss, elite: !!o.elite, special: o.special || null, safe: o.safe || null, data: o.data || null };
    world.telegraphs.push(tg);
    PB.Events.emit(world.events, 'telegraph', { tgId: tg.id, kind: tg.kind, x: tg.x, y: tg.y, angle: tg.angle, arc: tg.arc, radius: tg.radius,
      inner: tg.inner, width: tg.width, length: tg.length, tele: tg.tele, owner: tg.owner, targetId: tg.targetId, boss: tg.boss, elite: tg.elite, special: tg.special });
    return tg;
  }

  function resolve(world, tg) {
    var owner = world.byId[tg.owner];
    if (tg.special && PB.Bosses.resolve(world, tg)) return; // D5 boss specials
    if (tg.kind === 'tether') {
      var v = world.byId[tg.targetId];
      if (v && !v.dead && owner && !owner.dead && d2(v.x, v.y, owner.x, owner.y) <= (tg.range + 60) * (tg.range + 60)) {
        v.linkCut = LINK_CUT;
        PB.Events.emit(world.events, 'linkcut', { id: v.id, x: v.x, y: v.y, src: owner.id });
      }
      return;
    }
    var el = owner && (owner.element || (PB.Wards && PB.Wards.elementOf(owner.type)));
    var att = { id: tg.owner, kind: 'enemy', team: 1, tags: [], dmg: [tg.dmg, tg.dmg], critChance: 0, element: el || null, eleShare: el && PB.Wards ? PB.Wards.IN_SHARE : 0 };
    var ents = world.ents, hits = 0, p = world.player;
    var guard = p.hp > 0 && contains(tg, p.x, p.y, p.r) ? interceptor(world, p) : null;
    if (guard) { // Hearthwolf: leaps in front of the druid and eats the blow
      guard.x = p.x + (tg.x - p.x) * 0.3; guard.y = p.y + (tg.y - p.y) * 0.3; guard.interceptAt = world.time + INTERCEPT_CD;
      PB.Events.emit(world.events, 'intercept', { id: guard.id, x: guard.x, y: guard.y, tgId: tg.id });
      PB.World.damage(world, att, guard); hits++;
    }
    for (var i = 0; i < ents.length; i++) {
      var f = ents[i];
      if (f !== guard && isFriend(f) && contains(tg, f.x, f.y, f.r)) { PB.World.damage(world, att, f); hits++; }
    }
    if (!guard && p.hp > 0 && contains(tg, p.x, p.y, p.r)) { PB.World.damage(world, att, p); hits++; }
    PB.Events.emit(world.events, 'telegraph-hit', { tgId: tg.id, kind: tg.kind, x: tg.x, y: tg.y, angle: tg.angle, radius: tg.radius, length: tg.length, hits: hits, boss: tg.boss });
    if (tg.dash && owner && !owner.dead) { owner.dashT = tg.dash.t; owner.dashVx = (tg.dash.x - owner.x) / tg.dash.t; owner.dashVy = (tg.dash.y - owner.y) / tg.dash.t; }
  }

  function interceptor(world, p) {
    var best = null, bd = INTERCEPT_R * INTERCEPT_R;
    for (var i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (!isFriend(e) || !e.evo || !e.evo.intercept || (e.interceptAt || 0) > world.time || e.linkCut > 0) continue;
      var d = d2(e.x, e.y, p.x, p.y);
      if (d < bd) { best = e; bd = d; }
    }
    return best;
  }

  // Tethers follow their victim; everything else stays where it was cast.
  function tick(world, dt) {
    var list = world.telegraphs;
    for (var i = 0; i < list.length; i++) {
      var tg = list[i];
      if (tg.special && PB.Bosses.watch(world, tg)) { tg.done = true; continue; } // a Rally broke the Thrall
      if (tg.kind === 'tether') { var v = world.byId[tg.targetId], o = world.byId[tg.owner]; if (o && !o.dead) { tg.x = o.x; tg.y = o.y; } if (v && !v.dead) { tg.tx = v.x; tg.ty = v.y; } }
      tg.t += dt;
      if (tg.t >= tg.tele - EPS) { resolve(world, tg); tg.done = true; }
    }
    for (var j = list.length - 1; j >= 0; j--) if (list[j].done) list.splice(j, 1);
  }

  // ---------- targeting ----------
  // Taunt wins. Otherwise the nearest of the druid or a summon within 600px; ravens and spirits (low priority) only
  // when nothing else is within 300px. Melee enemies never pick flying summons; phasers always go for the druid
  // (they ignore taunts too: slipping past the bear is their whole point).
  function pickTarget(world, e) {
    var p = world.player, st = STYLE[e.ai] || STYLE.swarm;
    if (st.phase) return p;
    if (e.tauntT > 0) { var tb = world.byId[e.tauntBy]; if (tb && !tb.dead) return tb; }
    if (e.hunter && p.hp > 0) return p; // D4 hunters: a share of every wave goes for the druid
    var best = world.hash.nearest(e.x, e.y, NOTICE, function (o) { return isFriend(o) && !lowPrio(o); });
    var bd = best ? d2(e.x, e.y, best.x, best.y) : Infinity, pd = d2(e.x, e.y, p.x, p.y);
    if (p.hp > 0 && pd < bd) { best = p; bd = pd; }
    if (bd > LOW_PRIO * LOW_PRIO) {
      var low = world.hash.nearest(e.x, e.y, LOW_PRIO, function (o) { return isFriend(o) && lowPrio(o) && (!st.melee || !o.flying); });
      if (low) return low;
    }
    return best || p;
  }

  // ---------- casting ----------
  function rangeOf(atk) { return atk.range || (atk.length ? atk.length * (atk.kind === 'line' && atk.width >= 40 ? 0.9 : 0.85) : 60); }

  function cast(world, e, t, atk) {
    var a = Math.atan2(t.y - e.y, t.x - e.x), dmg = e.dmg[0], elite = !!(e.elite && e.elite.length), o;
    switch (e.ai) {
      case 'lobber': o = { kind: atk.kind, x: t.x, y: t.y, radius: atk.radius }; break;
      case 'charger':
        o = { kind: 'line', x: e.x, y: e.y, angle: a, width: atk.width, length: atk.length,
              dash: { x: e.x + Math.cos(a) * atk.length, y: e.y + Math.sin(a) * atk.length, t: 0.3 } };
        break;
      case 'archer':
        if (atk.kind === 'tether') o = { kind: 'tether', x: e.x, y: e.y, targetId: t.id, range: atk.range };
        else o = { kind: 'line', x: e.x, y: e.y, angle: a, width: atk.width, length: atk.length };
        break;
      case 'slammer': o = { kind: atk.kind, x: e.x, y: e.y, radius: atk.radius, inner: atk.inner || 0 }; break;
      case 'diver': o = { kind: 'circle', x: t.x, y: t.y, radius: atk.radius, dash: { x: t.x, y: t.y, t: 0.12 } }; break;
      default: return;
    }
    o.tele = atk.tele; o.dmg = dmg; o.owner = e.id; o.elite = elite; o.angle = o.angle != null ? o.angle : a;
    create(world, o);
    e.castT = atk.tele; e.facing = a; e.vx = 0; e.vy = 0;
    e.atkCd = (STYLE[e.ai].cd || 3) * (0.85 + 0.3 * world.rng.ai.next());
  }

  function melee(world, e, t) {
    e.cd = e.atk;
    PB.World.damage(world, e, t);
    if (e.type === 'staticwisp' && t.kind === 'summon') { // chains to one more summon
      var c = world.hash.nearest(t.x, t.y, CHAIN_R, function (o) { return isFriend(o) && o !== t; });
      if (c) {
        PB.World.damage(world, { id: e.id, kind: 'enemy', team: 1, tags: [], dmg: [e.dmg[0] * CHAIN_SHARE, e.dmg[1] * CHAIN_SHARE], critChance: 0, element: e.element || null, eleShare: e.element && PB.Wards ? PB.Wards.IN_SHARE : 0 }, c);
        PB.Events.emit(world.events, 'chain', { x: t.x, y: t.y, x2: c.x, y2: c.y });
      }
    }
  }

  // Chill, slow, and a Monster Shrine. Flee keeps its own slow rule: slow already stopped the body before this.
  function footSpeed(world, e, fleeing) {
    var s = e.speed * (e.chillT > 0 ? 0.75 : 1);
    if (!fleeing && e.slowT > 0) s *= 0.7;
    if (world.boon && world.boon.enemySpd) s *= 1 + world.boon.enemySpd;
    return s;
  }

  function update(world, e, dt) {
    var p = world.player, def = PB.ENEMIES[e.type] || {}, atk = def.attack || null, st = STYLE[e.ai] || STYLE.swarm;
    if (e.thrallT > 0) { // D5 Thrall: a summon fights for the boss, then comes home
      e.thrallT -= dt;
      if (e.thrallT <= EPS) { e.thrallT = 0; e.team = 0; e.targetId = 0; PB.Events.emit(world.events, 'thrall-end', { id: e.id, x: e.x, y: e.y }); return; }
    }
    if (e.atkCd === undefined) e.atkCd = 0.1 + 0.2 * world.rng.ai.next(); // first cast comes quickly, not in lockstep
    e.atkCd = Math.max(0, e.atkCd - dt);
    if (e.tauntT > 0) e.tauntT = Math.max(0, e.tauntT - dt);
    if (e.chillT > 0) e.chillT = Math.max(0, e.chillT - dt);
    if (e.slowT > 0) e.slowT = Math.max(0, e.slowT - dt);
    if (e.blindT > 0) e.blindT = Math.max(0, e.blindT - dt);
    if (e.emergeT > 0) e.emergeT = Math.max(0, e.emergeT - dt); // D4: 0.6 s out of the edge (frozenT holds the body)
    if (e.stunnedT > 0) e.stunnedT = Math.max(0, e.stunnedT - dt); // Crushing Maul (frozenT stops the body)
    if (e.knockedDown > 0) e.knockedDown = Math.max(0, e.knockedDown - dt); // Leaping knockdown (frozenT stops the body)
    if (e.frozenT > 0) { e.frozenT = Math.max(0, e.frozenT - dt); e.vx = 0; e.vy = 0; return; } // frost infusion freeze
    if (e.dashT > 0) { e.dashT -= dt; e.vx = e.dashVx; e.vy = e.dashVy; if (e.dashT <= EPS) { e.dashT = 0; e.vx *= 0.2; e.vy *= 0.2; } return; }
    if (e.castT > 0) { e.castT = Math.max(0, e.castT - dt); e.vx *= 0.5; e.vy *= 0.5; return; } // winding up
    if (e.fleeT > 0) {
      e.fleeT = Math.max(0, e.fleeT - dt);
      if (e.rooted <= 0) PB.World.moveToward(world, e, e.x + (e.x - p.x), e.y + (e.y - p.y), footSpeed(world, e, true));
      return;
    }
    var t = pickTarget(world, e);
    e.targetId = t.id;
    var dist = Math.sqrt(d2(e.x, e.y, t.x, t.y)), gap = dist - e.r - t.r, reach = e.r + t.r + e.range;
    if (dist > 1) e.facing = Math.atan2(t.y - e.y, t.x - e.x);

    if (atk && e.atk > 0 && e.atkCd <= EPS && t.hp > 0) { // atk 0 marks a harmless test dummy
      var rng = rangeOf(atk);
      var tetherOk = atk.kind !== 'tether' || t.kind === 'summon';
      if (tetherOk && (e.ai === 'slammer' ? gap <= rng : dist <= rng)) { cast(world, e, t, atk); return; }
      if (atk.kind === 'tether' && !tetherOk) { // a Severer looks for a summon to cut instead
        var s = world.hash.nearest(e.x, e.y, atk.range, isFriend);
        if (s) { e.targetId = s.id; cast(world, e, s, atk); return; }
      }
    }

    var moving = e.rooted <= 0, spd = footSpeed(world, e, false);
    if (!st.melee && atk) { // ranged: hold at range, back off when crowded
      var r = rangeOf(atk);
      if (dist > r * 0.9) { if (moving) PB.World.moveToward(world, e, t.x, t.y, spd); }
      else if (dist < r * st.keep) { if (moving) PB.World.moveToward(world, e, e.x - (t.x - e.x), e.y - (t.y - e.y), spd * 0.8); }
      else { e.vx *= 0.8; e.vy *= 0.8; }
      return;
    }
    if (dist > reach) { if (moving) PB.World.moveToward(world, e, t.x, t.y, spd); return; }
    e.vx *= 0.7; e.vy *= 0.7;
    if (e.cd <= 0 && e.atk > 0 && t.hp > 0) melee(world, e, t);
  }

  // Death riders (Cinder Imp): a telegraph where it fell, owned by the corpse.
  function onDeath(world, e) {
    var def = PB.ENEMIES[e.type];
    if (!def || !def.onDeath) return;
    var od = def.onDeath;
    create(world, { kind: od.kind, x: e.x, y: e.y, radius: od.radius, tele: od.tele, dmg: e.dmg[0], owner: e.id });
  }

  PB.Telegraphs = { create: create, tick: tick, contains: contains, resolve: resolve };
  PB.AIEnemies = { update: update, pickTarget: pickTarget, onDeath: onDeath, STYLE: STYLE, rangeOf: rangeOf };
})(globalThis.PB = globalThis.PB || {});
