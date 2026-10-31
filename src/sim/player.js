// The druid (spec §3, §15): movement, Thornlash, Bound, Spirit regen, summon/dismiss keys, Lord of Fangs fade,
// and the command/RMB dispatch. Called once per advancing tick as World.step slot (1).
(function (PB) {
  'use strict';
  var LASH_R = 90, LASH_HALF = 35 * Math.PI / 180, LASH_CD = 0.45, LASH_DMG = [6, 10], LASH_KNOCK = 90, LASH_STOP = 30;

  // Thorn damage from a staff steps the whip: +4 damage is one step, two frames faster, up to five steps.
  function lashCooldown(stats) {
    var steps = Math.min(5, Math.floor(((stats && stats.thornDmg) || 0) / 4));
    return Math.max(0.25, LASH_CD - steps * 2 / 60);
  }
  var BOUND_DIST = 180, BOUND_T = 0.22, BOUND_CD = 1.2, VINE_MAX = 500, FANGS_FADE = 30, DISMISS_REFUND = 0.5;
  var KEY_CMDS = { howl: 'howl', rally: 'rally', frenzy: 'frenzy', encircle: 'encircle', heel: 'heel' };
  var CLICK_R = 24, EPS = 1e-9;

  function isEnemy(e) { return e.team === 1 && !e.dead; }

  function regen(world, p, dt) {
    var save = world.save, level = save ? save.player.level : 1;
    var rate = PB.Progression.playerStats(level).spiritRegen * (1 + (world.mods.stats.spiritRegen || 0) / 100);
    if (world.boon && world.boon.regen) rate *= 1 + world.boon.regen;
    p.spirit = Math.min(p.maxSpirit, p.spirit + rate * dt);
  }

  // The 90px, 70° whip cone toward the aim. A body counts if any part of it is inside.
  function lashReach(world) {
    var lv = world.save && world.save.player ? world.save.player.level : 1;
    return LASH_R + 12 * Math.floor(lv / 5); // a longer whip at 5, 10, 15, 20
  }

  function inLash(p, a, e, reach) {
    var dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > (reach || LASH_R) + e.r) return false;
    if (d < 1) return true;
    var slack = Math.asin(Math.min(1, e.r / d));
    return Math.abs(PB.M.angleDiff(a, Math.atan2(dy, dx))) <= LASH_HALF + slack;
  }

  function rayDist(px, py, angle, ex, ey) {
    var dx = ex - px, dy = ey - py, rx = Math.cos(angle), ry = Math.sin(angle);
    return Math.abs(dx * ry - dy * rx);
  }

  function thornlash(world, p, input) {
    var a = Math.atan2(input.aim.y - p.y, input.aim.x - p.x), td = world.mods.stats.thornDmg || 0, hit = false;
    p.facing = a; p.lashCd = lashCooldown(world.mods.stats);
    var stats = world.mods.stats || {}, packN = world.counts.summon || 0;
    var bonus = packN + (stats.packTactics || 0);
    var markFor = 2 + (stats.markDur || 0);
    var att = { id: 0, kind: 'player', team: 0, tags: [], x: p.x, y: p.y, dmg: [LASH_DMG[0] + td + bonus, LASH_DMG[1] + td + bonus], critChance: 0.05, auraDmgInc: p.auraDmgInc || 0 };
    var ents = world.ents, hits = [], i, e, primary = null, best = Infinity;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (!isEnemy(e) || !inLash(p, a, e, lashReach(world))) continue;
      hits.push(e);
      var d = rayDist(p.x, p.y, a, e.x, e.y);
      if (d < best) { best = d; primary = e; }
    }
    for (i = 0; i < hits.length; i++) {
      e = hits[i];
      var strike = att;
      if (e === primary) {
        var dur = world.pack && world.pack.howlT > 0 ? 5 : 3;
        e.lashed = dur; // only the body on the aim line. The cone still hurts the rest.
        e.marked = Math.max(e.marked || 0, markFor);
        e.lashHits = (e.lashHits || 0) + 1;
        if ((stats.poisonDmg || 0) > 0) PB.World.applyDot(e, 'poison', 4 * (1 + stats.poisonDmg / 100), 3, 0);
        var heavy = (e.maxHp > 0 && e.hp < e.maxHp * 0.5) ? 1.5 : 1;
        if (e.lashHits >= 3) { e.lashHits = 0; e.frozenT = Math.max(e.frozenT || 0, 0.6); heavy *= 2; }
        if (heavy > 1) strike = { id: 0, kind: 'player', team: 0, tags: [], x: p.x, y: p.y, dmg: [att.dmg[0] * heavy, att.dmg[1] * heavy], critChance: 0.05, auraDmgInc: att.auraDmgInc };
        shaveDen(world);
      }
      PB.World.damage(world, strike, e);
      PB.World.knock(e, p.x, p.y, LASH_KNOCK);
      hit = true;
    }
    if (hit) {
      for (var s = 0; s < ents.length; s++) if (ents[s].kind === 'summon' && !ents[s].dead) ents[s].cd = 0; // they bite on your swing, not on their own timer
    }
    PB.Events.emit(world.events, 'thornlash', { x: p.x, y: p.y, angle: a, hit: hit, primary: primary ? primary.id : 0 });
    if (hit) PB.World.hitStop(world, LASH_STOP);
  }

  // A landed whip calls the soonest Den timer forward by a second.
  function shaveDen(world) {
    var best = null, soon = Infinity, id;
    for (id in world.den) {
      var left = world.den[id] - world.time;
      if (left > 0 && left < soon) { soon = left; best = id; }
    }
    if (best) world.den[best] = Math.max(world.time, world.den[best] - 1);
  }

  function bound(world, p, input) {
    var mx = input.move.x, my = input.move.y, ml = Math.sqrt(mx * mx + my * my);
    var dx = ml > 0 ? mx / ml : input.aim.x - p.x, dy = ml > 0 ? my / ml : input.aim.y - p.y, dl = Math.sqrt(dx * dx + dy * dy);
    if (dl < EPS) { dx = Math.cos(p.facing || 0); dy = Math.sin(p.facing || 0); dl = 1; }
    p.boundDir = { x: dx / dl, y: dy / dl }; p.boundLeft = BOUND_DIST; p.iframes = BOUND_T; p.boundCd = BOUND_CD;
    dashStrike(world, p);
    PB.Events.emit(world.events, 'bound', { x: p.x, y: p.y, dx: p.boundDir.x, dy: p.boundDir.y });
  }

  // Space is a dodge and a hit. Anything the dash line crosses is lashed, the same as the whip.
  function distToSeg(px, py, x0, y0, x1, y1) {
    var vx = x1 - x0, vy = y1 - y0, wx = px - x0, wy = py - y0, c = vx * vx + vy * vy;
    var t = c > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / c)) : 0;
    var dx = px - (x0 + vx * t), dy = py - (y0 + vy * t);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function dashStrike(world, p) {
    var x0 = p.x, y0 = p.y, x1 = p.x + p.boundDir.x * BOUND_DIST, y1 = p.y + p.boundDir.y * BOUND_DIST, i;
    var att = { id: 0, kind: 'player', team: 0, tags: [], x: p.x, y: p.y, dmg: [8, 12], critChance: 0.05 };
    for (i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (!isEnemy(e) || distToSeg(e.x, e.y, x0, y0, x1, y1) > e.r + 28) continue;
      e.lashed = 2; e.marked = Math.max(e.marked || 0, 2);
      PB.World.damage(world, att, e);
      PB.World.knock(e, x0, y0, 120);
    }
  }

  function spawnPoint(world, type, p, aim) {
    if (type === 'vine') {
      var dx = aim.x - p.x, dy = aim.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > VINE_MAX) { dx *= VINE_MAX / d; dy *= VINE_MAX / d; }
      return { x: p.x + dx, y: p.y + dy };
    }
    var a = Math.atan2(aim.y - p.y, aim.x - p.x) || 0;
    return { x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30 };
  }

  function clampToWorld(world, pt) { return { x: PB.M.clamp(pt.x, 0, world.width), y: PB.M.clamp(pt.y, 0, world.height) }; }

  // Summon key: cap and Den come from the roster; cost is Spirit (or Life with Bloodbound).
  function summonKey(world, type, input) {
    var p = world.player, b = world.mods.behaviors;
    if (!world.save) { PB.Events.emit(world.events, 'summon-fail', { unit: type, reason: 'no-save' }); return; }
    if (PB.Roster.activeCount(world, type) >= PB.Roster.capFor(type, world.mods)) {
      PB.Events.emit(world.events, 'summon-fail', { unit: type, reason: 'cap' }); return;
    }
    var cost = PB.Roster.costFor(type, world.mods), pool = b.bloodbound ? 'hp' : 'spirit';
    if (p[pool] < cost + (pool === 'hp' ? 1 : 0) - EPS) { PB.Events.emit(world.events, 'summon-fail', { unit: type, reason: pool === 'hp' ? 'life' : 'spirit' }); return; }
    var at = clampToWorld(world, spawnPoint(world, type, p, input.aim));
    var r = PB.Roster.summon(world, type, at.x, at.y);
    if (!r.ok || !r.ent) return;
    p[pool] -= cost;
    if (type === 'wolf' && b.lordfangs) r.ent.fadeT = FANGS_FADE;
  }

  // Dismiss the newest summon of that type: back to the roster at once, half the cost refunded (floored).
  function dismissKey(world, type) {
    var p = world.player, newest = null;
    for (var i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (e.kind === 'summon' && !e.dead && e.indId && e.type === type && (!newest || e.id > newest.id)) newest = e;
    }
    if (!newest) return;
    PB.Roster.release(world, newest);
    var refund = Math.floor(PB.Roster.costFor(type, world.mods) * DISMISS_REFUND);
    if (world.mods.behaviors.bloodbound) p.hp = Math.min(p.maxHp, p.hp + refund); else p.spirit = Math.min(p.maxSpirit, p.spirit + refund);
    PB.Events.emit(world.events, 'dismiss', { id: newest.id, unit: type, x: newest.x, y: newest.y });
  }

  // RMB Focus target: the enemy whose body edge is nearest the click, within 24px of it (a big sprite is clickable
  // across its whole body, as Skinwalk picks summons). Ties break on lower id.
  function enemyAt(world, x, y) {
    var best = null, bd = Infinity, ents = world.ents;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (!isEnemy(e)) continue;
      var dx = e.x - x, dy = e.y - y, d = Math.sqrt(dx * dx + dy * dy) - e.r;
      if (d <= CLICK_R && (d < bd || (d === bd && e.id < best.id))) { bd = d; best = e; }
    }
    return best;
  }

  function dispatch(world, input) {
    var pressed = input.pressed || [];
    for (var i = 0; i < pressed.length; i++) {
      var a = pressed[i];
      if (KEY_CMDS[a]) {
        var res = PB.Commands.issue(world, { kind: KEY_CMDS[a], x: input.aim.x, y: input.aim.y });
        if (!res.ok) PB.Events.emit(world.events, 'command-fail', { kind: KEY_CMDS[a], reason: res.reason, left: res.left });
      } else if (a === 'skinwalk') {
        var sk = world.anchor ? { ok: PB.Skinwalk.exit(world, 'tab') } : PB.Skinwalk.enter(world, null, input.aim);
        if (!sk.ok) PB.Events.emit(world.events, 'command-fail', { kind: 'skinwalk', reason: sk.reason });
      } else if (a === 'interact') {
        var why = PB.Fusion.nearShrine(world);
        if (why) PB.Events.emit(world.events, 'command-fail', { kind: 'shrine', reason: why });
        else PB.Events.emit(world.events, 'shrine-open', { x: world.shrine.x, y: world.shrine.y });
      } else if (a === 'hunt') {
        var an = world.anchor || world.player, hr = PB.Chorus.startHunt(world, Math.atan2(input.aim.y - an.y, input.aim.x - an.x) || 0);
        if (!hr.ok) PB.Events.emit(world.events, 'command-fail', { kind: 'hunt', reason: hr.reason });
      } else if (a.indexOf('summon') === 0) summonKey(world, PB.SUMMON_ORDER[+a.slice(6) - 1], input);
      else if (a.indexOf('dismiss') === 0) dismissKey(world, PB.SUMMON_ORDER[+a.slice(7) - 1]);
    }
    if (input.click && world.anchor) PB.Skinwalk.signature(world, input.click); // RMB is the possessed summon's signature
    else if (input.click) {
      var hit = enemyAt(world, input.click.x, input.click.y);
      PB.Commands.issue(world, hit ? { kind: 'focus', targetId: hit.id, x: hit.x, y: hit.y } : { kind: 'hold', x: input.click.x, y: input.click.y });
    }
    if (input.drag && input.drag.points && input.drag.points.length > 1) PB.Commands.issue(world, { kind: 'trail', path: input.drag.points });
  }

  function fades(world, dt) {
    for (var i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (e.fadeT === undefined || e.dead) continue;
      e.fadeT -= dt;
      if (e.fadeT <= EPS) { PB.Roster.release(world, e); PB.Events.emit(world.events, 'fade', { id: e.id, unit: e.type, x: e.x, y: e.y }); }
    }
  }

  function update(world, input, dt) {
    var p = world.player;
    p.lashCd = Math.max(0, p.lashCd - dt);
    p.bloodedT = Math.max(0, (p.bloodedT || 0) - dt);
    p.boundCd = Math.max(0, p.boundCd - dt);
    p.iframes = Math.max(0, p.iframes - dt);
    fades(world, dt);
    if (p.hp <= 0) return; // down: the game screen takes over
    PB.Skinwalk.tick(world, dt);
    if (p.stunT > 0) { p.stunT = Math.max(0, p.stunT - dt); regen(world, p, dt); return; }
    if (world.anchor) { // Skinwalk: the husk stays put (Wildheart: it flees); input drives the possessed summon
      PB.Skinwalk.husk(world, dt);
      dispatch(world, input);
      PB.Skinwalk.control(world, input, dt);
      regen(world, p, dt);
      return;
    }
    var pressed = input.pressed || [], held = input.held || [];

    if (p.boundLeft > 0) {
      var step = Math.min(p.boundLeft, BOUND_DIST / BOUND_T * dt);
      p.x += p.boundDir.x * step; p.y += p.boundDir.y * step; p.boundLeft -= step;
      if (p.boundLeft < 1e-6) p.boundLeft = 0;
    } else {
      var mx = input.move.x, my = input.move.y, ml = Math.sqrt(mx * mx + my * my);
      if (ml > 0) { p.x += mx / ml * p.speed * dt; p.y += my / ml * p.speed * dt; p.facing = Math.atan2(my, mx); }
    }
    if (pressed.indexOf('bound') >= 0 && p.boundCd <= EPS && p.boundLeft === 0) {
      bound(world, p, input);
      var s0 = Math.min(p.boundLeft, BOUND_DIST / BOUND_T * dt);
      p.x += p.boundDir.x * s0; p.y += p.boundDir.y * s0; p.boundLeft -= s0;
    }
    p.x = PB.M.clamp(p.x, 0, world.width); p.y = PB.M.clamp(p.y, 0, world.height);
    var obs = world.obstacles;
    for (var k = 0; k < obs.length; k++) {
      var o = obs[k], ox = p.x - o.x, oy = p.y - o.y, rr = o.r + p.r, d2 = ox * ox + oy * oy;
      if (d2 < rr * rr) { var od = Math.sqrt(d2) || 1; p.x = o.x + ox / od * rr; p.y = o.y + oy / od * rr; }
    }

    dispatch(world, input);
    if (held.indexOf('thornlash') >= 0 && p.lashCd <= EPS) thornlash(world, p, input);
    regen(world, p, dt);
  }

  PB.Player = { update: update, inLash: inLash, enemyAt: enemyAt, lashCooldown: lashCooldown, lashReach: lashReach, LASH_R: LASH_R, LASH_CD: LASH_CD, BOUND_T: BOUND_T, BOUND_CD: BOUND_CD, VINE_MAX: VINE_MAX, FANGS_FADE: FANGS_FADE };
})(globalThis.PB = globalThis.PB || {});
