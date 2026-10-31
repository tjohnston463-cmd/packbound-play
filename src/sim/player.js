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
    var stats = world.mods.stats || {}, packN = world.counts.summon || 0, beh = world.mods.behaviors || {};
    var bonus = packN + (stats.packTactics || 0);
    var markFor = 2 + (stats.markDur || 0);
    var were = stats.wereRank || 0;
    if (beh.wereheart) were += 1;
    var claw = were > 0 ? (1 + 0.18 * were) : 1;
    var att = { id: 0, kind: 'player', team: 0, tags: [], x: p.x, y: p.y, dmg: [(LASH_DMG[0] + td + bonus) * claw, (LASH_DMG[1] + td + bonus) * claw], critChance: 0.05, auraDmgInc: p.auraDmgInc || 0 };
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
    if (hit && were) {
      var back = (stats.wereLeech || 0) + (beh.wereheart ? 6 : 0);
      if (back) p.hp = Math.min(p.maxHp, p.hp + back);
    }
    // The conductor. Only the whip does this. Four or more of the pack on the field feed Spirit back when the swing lands.
    if (hit && packN >= 4) p.spirit = Math.min(p.maxSpirit, p.spirit + Math.min(6, Math.floor(packN / 2)));
    if (hit) {
      for (var s = 0; s < ents.length; s++) if (ents[s].kind === 'summon' && !ents[s].dead) ents[s].cd = 0; // they bite on your swing, not on their own timer
    }
    PB.Events.emit(world.events, 'thornlash', { x: p.x, y: p.y, angle: a, hit: hit, primary: primary ? primary.id : 0, claw: were > 0 });
    if (hit) PB.World.hitStop(world, were ? 40 : LASH_STOP);
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
    var kind = PB.Classes.of(world.save).attack, b = world.mods.behaviors || {};
    var charge = kind === 'zeal', leap = kind === 'whirl', pass = kind === 'fury';
    var att = { id: 0, kind: 'player', team: 0, tags: [], x: p.x, y: p.y, dmg: charge || leap ? [14, 22] : pass ? [10, 16] : [8, 12], critChance: 0.05 };
    for (i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (!isEnemy(e) || distToSeg(e.x, e.y, x0, y0, x1, y1) > e.r + (charge || leap ? 36 : 28)) continue;
      e.lashed = 2; e.marked = Math.max(e.marked || 0, 2);
      if (charge && !e.boss) e.frozenT = Math.max(e.frozenT || 0, 0.35);
      if (leap && !e.boss) e.frozenT = Math.max(e.frozenT || 0, 0.55);
      if (pass && !e.boss) e.slowT = Math.max(e.slowT || 0, b.evadebolt ? 0.9 : 0.45);
      PB.World.damage(world, att, e);
      PB.World.knock(e, x0, y0, leap ? 200 : charge ? 160 : 120);
    }
  }

  function orderOf(world) { return PB.Classes.order(world && world.save); }

  function weaponBonus(world) {
    var st = world.mods.stats || {};
    var lv = world.save && world.save.player ? world.save.player.level : 1;
    return (st.thornDmg || 0) + Math.floor((lv - 1) / 2);
  }

  function spawnPoint(world, type, p, aim) {
    var def = PB.SUMMONS[type];
    if (def && def.rooted) {
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
    var def = PB.SUMMONS[type];
    if ((type === 'wolf' && b.lordfangs) || (def && def.fades && def.capBehavior && b[def.capBehavior])) r.ent.fadeT = FANGS_FADE;
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
      } else if (a.indexOf('summon') === 0) summonKey(world, orderOf(world)[+a.slice(6) - 1], input);
      else if (a.indexOf('dismiss') === 0) dismissKey(world, orderOf(world)[+a.slice(7) - 1]);
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

  // Bone Spear: a line, not a cone. It curses. Only the skeletons swing on it. The whip stays the druid's.
  function boneSpear(world, p, input) {
    var a = Math.atan2(input.aim.y - p.y, input.aim.x - p.x), st = world.mods.stats || {}, b = world.mods.behaviors || {};
    var lv = world.save && world.save.player ? world.save.player.level : 1;
    var reach = 300 + 12 * Math.floor(lv / 5);
    p.facing = a; p.lashCd = Math.max(0.28, 0.4 - Math.min(4, Math.floor((st.thornDmg || 0) / 5)) * 2 / 60);
    var bonus = weaponBonus(world) + (st.spearDmg || 0);
    var x1 = p.x + Math.cos(a) * reach, y1 = p.y + Math.sin(a) * reach;
    var att = { id: 0, kind: 'player', team: 0, tags: [], x: p.x, y: p.y, dmg: [11 + bonus, 18 + bonus], critChance: 0.08, auraDmgInc: p.auraDmgInc || 0 };
    var hit = false, ents = world.ents, i, e, cursed = [];
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (!isEnemy(e) || distToSeg(e.x, e.y, p.x, p.y, x1, y1) > e.r + 18) continue;
      e.amplify = Math.max(e.amplify || 0, (b.marrowheart ? 5 : 3) + (st.curseDur || 0));
      e.marked = Math.max(e.marked || 0, 3 + (st.markDur || 0));
      if ((st.decrep || 0) > 0 && !e.boss) e.slowT = Math.max(e.slowT || 0, st.decrep);
      PB.World.damage(world, att, e);
      cursed.push(e);
      hit = true;
    }
    // Marrow Wand: the curse leaps once, to bodies beside the line. It does not pierce them.
    if (hit && b.marrowheart) {
      var dur = 5 + (st.curseDur || 0);
      for (i = 0; i < ents.length; i++) {
        e = ents[i];
        if (!isEnemy(e) || cursed.indexOf(e) >= 0) continue;
        for (var j = 0; j < cursed.length; j++) {
          var sdx = e.x - cursed[j].x, sdy = e.y - cursed[j].y;
          if (sdx * sdx + sdy * sdy <= 96 * 96) { e.amplify = Math.max(e.amplify || 0, dur); break; }
        }
      }
    }
    if (hit) {
      for (i = 0; i < ents.length; i++) if (ents[i].kind === 'summon' && !ents[i].dead && ents[i].role === 'wolf') ents[i].cd = 0;
    }
    PB.Events.emit(world.events, 'bonespear', { x: p.x, y: p.y, x2: x1, y2: y1, hit: hit });
    if (hit) PB.World.hitStop(world, 24);
  }

  // Fireball: you are the damage. It bursts on the first body in the line, or at the end of the reach.
  function fireball(world, p, input) {
    var a = Math.atan2(input.aim.y - p.y, input.aim.x - p.x), st = world.mods.stats || {}, b = world.mods.behaviors || {};
    var reach = 360;
    p.facing = a; p.lashCd = Math.max(0.3, 0.46 - Math.min(4, Math.floor((st.thornDmg || 0) / 5)) * 2 / 60);
    var bonus = weaponBonus(world) + (st.boltDmg || 0);
    var x1 = p.x + Math.cos(a) * reach, y1 = p.y + Math.sin(a) * reach;
    var bestT = 2, tx = x1, ty = y1, i, e, ents = world.ents;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (!isEnemy(e)) continue;
      var vx = x1 - p.x, vy = y1 - p.y, c = vx * vx + vy * vy;
      var t = c > 0 ? ((e.x - p.x) * vx + (e.y - p.y) * vy) / c : 0;
      if (t < 0 || t > 1) continue;
      var px = p.x + vx * t, py = p.y + vy * t, dx = e.x - px, dy = e.y - py;
      if (dx * dx + dy * dy > (e.r + 14) * (e.r + 14)) continue;
      if (t < bestT) { bestT = t; tx = e.x; ty = e.y; }
    }
    var rad = 74 + (st.splash || 0), burn = 5 * (1 + (st.burnDmg || 0) / 100);
    if (b.meteor) { rad += 28; burn *= 1.4; }
    if (b.cataclysm) rad += 18;
    if (b.galeheart) rad += 22;
    var att = { id: 0, kind: 'player', team: 0, tags: [], x: tx, y: ty, dmg: [16 + bonus, 26 + bonus], critChance: Math.min(0.5, 0.07 + (st.boltCrit || 0) / 100), auraDmgInc: p.auraDmgInc || 0 };
    var hit = false;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (!isEnemy(e)) continue;
      var ex = e.x - tx, ey = e.y - ty;
      if (ex * ex + ey * ey > (rad + e.r) * (rad + e.r)) continue;
      if (b.cataclysm) e.marked = Math.max(e.marked || 0, 2);
      PB.World.damage(world, att, e);
      if (!e.dead) PB.World.applyDot(e, 'burn', burn, 3, 0);
      hit = true;
    }
    if (hit && b.cataclysm) {
      for (i = 0; i < ents.length; i++) if (ents[i].kind === 'summon' && !ents[i].dead && ents[i].role === 'wolf') ents[i].cd = 0;
    }
    if (hit && b.galeheart) p.spirit = Math.min(p.maxSpirit, p.spirit + 4);
    PB.Events.emit(world.events, 'fireball', { x: tx, y: ty, radius: rad, hit: hit });
    if (hit) PB.World.hitStop(world, 28);
  }

  var ZEAL_R = 78, ZEAL_HALF = 55 * Math.PI / 180;

  function inArc(p, a, e, reach, half) {
    var dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > reach + e.r) return false;
    if (d < 1) return true;
    var slack = Math.asin(Math.min(1, e.r / d));
    return Math.abs(PB.M.angleDiff(a, Math.atan2(dy, dx))) <= half + slack;
  }

  // Zeal: you stand in the fight. A short heavy arc, then more strikes as the skill ranks. The front line answers.
  function zeal(world, p, input) {
    var a = Math.atan2(input.aim.y - p.y, input.aim.x - p.x), st = world.mods.stats || {}, b = world.mods.behaviors || {};
    p.facing = a;
    p.lashCd = Math.max(0.32, 0.52 - Math.min(4, Math.floor((st.thornDmg || 0) / 5)) * 2 / 60);
    var strikes = 1 + Math.min(3, st.zealStrikes || 0);
    if (b.zealheart) strikes += 1;
    var sac = 1;
    if (b.sacrifice && p.hp > 1) { p.hp -= Math.min(4, p.hp - 1); sac = 2; }
    var bonus = weaponBonus(world) + (st.zealDmg || 0);
    var ents = world.ents, hits = [], i, e, primary = null, best = Infinity;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (!isEnemy(e) || !inArc(p, a, e, ZEAL_R, ZEAL_HALF)) continue;
      hits.push(e);
      var d = rayDist(p.x, p.y, a, e.x, e.y);
      if (d < best) { best = d; primary = e; }
    }
    var curse = st.conviction || 0;
    if (b.oathset) curse = Math.max(curse, 4);
    var hit = false;
    for (var s = 0; s < strikes; s++) {
      var mul = (s === 0 ? sac : 0.62);
      var att = { id: 0, kind: 'player', team: 0, tags: [], x: p.x, y: p.y, dmg: [(14 + bonus) * mul, (22 + bonus) * mul], critChance: 0.08, auraDmgInc: p.auraDmgInc || 0 };
      for (i = 0; i < hits.length; i++) {
        e = hits[i];
        if (e.dead) continue;
        if (curse) e.amplify = Math.max(e.amplify || 0, curse);
        if (e === primary || b.fanaticism) e.marked = Math.max(e.marked || 0, 2 + (st.markDur || 0));
        if (e === primary) e.lashed = 2;
        PB.World.damage(world, att, e);
        PB.World.knock(e, p.x, p.y, 36);
        hit = true;
      }
    }
    if (hit) {
      var back = (st.zealLeech || 0) + (b.zealheart ? 4 : 0);
      if (back) p.hp = Math.min(p.maxHp, p.hp + back);
      var mend = b.redoubt ? Math.max(4, back) : (b.sanctified ? 6 : 0);
      for (i = 0; i < ents.length; i++) {
        e = ents[i];
        if (e.kind !== 'summon' || e.dead) continue;
        if (b.fanaticism || e.role === 'wolf' || e.role === 'bear') e.cd = 0;
        if (mend) {
          var dx = e.x - p.x, dy = e.y - p.y;
          if (dx * dx + dy * dy <= 160 * 160) e.hp = Math.min(e.maxHp, e.hp + mend);
        }
      }
    }
    PB.Events.emit(world.events, 'zeal', { x: p.x, y: p.y, angle: a, hit: hit, strikes: strikes, primary: primary ? primary.id : 0 });
    if (hit) PB.World.hitStop(world, 42);
  }

  var FURY_FORK = 110, WHIRL_R = 72;

  // Lightning Fury: a spear along the aim, then lightning to bodies off the line. Sisters answer. The whole pack does not.
  function fury(world, p, input) {
    var a = Math.atan2(input.aim.y - p.y, input.aim.x - p.x), st = world.mods.stats || {}, b = world.mods.behaviors || {};
    var lv = world.save && world.save.player ? world.save.player.level : 1;
    var reach = 280 + 12 * Math.floor(lv / 5);
    p.facing = a; p.lashCd = Math.max(0.26, 0.42 - Math.min(4, Math.floor((st.thornDmg || 0) / 5)) * 2 / 60);
    var bonus = weaponBonus(world) + (st.furyDmg || 0);
    var forks = 1 + Math.min(3, st.furyForks || 0);
    if (b.furyheart) forks += 1;
    if (b.skyset) forks = Math.max(forks, 3);
    var x1 = p.x + Math.cos(a) * reach, y1 = p.y + Math.sin(a) * reach;
    var crit = Math.min(0.5, 0.08 + (st.furyCrit || 0) / 100);
    var att = { id: 0, kind: 'player', team: 0, tags: [], x: p.x, y: p.y, dmg: [12 + bonus, 18 + bonus], critChance: crit, auraDmgInc: p.auraDmgInc || 0 };
    var ents = world.ents, i, e, lined = [], primary = null, best = Infinity, seen = {};
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (!isEnemy(e) || distToSeg(e.x, e.y, p.x, p.y, x1, y1) > e.r + 16) continue;
      lined.push(e);
      var d = rayDist(p.x, p.y, a, e.x, e.y);
      if (d < best) { best = d; primary = e; }
    }
    function strike(ent, mul, mark) {
      if (!ent || ent.dead || seen[ent.id]) return false;
      seen[ent.id] = 1;
      if (mark || ent === primary || b.skymark) ent.marked = Math.max(ent.marked || 0, 2 + (st.markDur || 0));
      if (ent === primary) ent.lashed = 2;
      var hitAtt = mul === 1 ? att : { id: 0, kind: 'player', team: 0, tags: [], x: ent.x, y: ent.y, dmg: [att.dmg[0] * mul, att.dmg[1] * mul], critChance: crit, auraDmgInc: att.auraDmgInc };
      PB.World.damage(world, hitAtt, ent);
      return true;
    }
    var hit = false;
    for (i = 0; i < lined.length; i++) if (strike(lined[i], 1, b.skymark)) hit = true;
    var bolts = [], origins = [], hop, n;
    for (i = 0; i < lined.length; i++) origins.push(lined[i]);
    if (!origins.length) origins.push({ x: x1, y: y1, id: 0 });
    var hops = b.stormstrike ? 2 : 1, forked = 0;
    for (hop = 0; hop < hops && forked < 8; hop++) {
      var next = [];
      for (n = 0; n < origins.length && forked < 8; n++) {
        var origin = origins[n], picks = [];
        for (i = 0; i < ents.length; i++) {
          e = ents[i];
          if (!isEnemy(e) || seen[e.id] || e === origin) continue;
          var fdx = e.x - origin.x, fdy = e.y - origin.y, fd = fdx * fdx + fdy * fdy;
          if (fd > FURY_FORK * FURY_FORK) continue;
          picks.push({ e: e, d: fd });
        }
        picks.sort(function (u, v) { return u.d - v.d; });
        var take = Math.min(forks, picks.length, 8 - forked);
        for (i = 0; i < take; i++) {
          e = picks[i].e;
          if (!strike(e, 0.72, b.stormstrike)) continue;
          if (!e.boss) e.slowT = Math.max(e.slowT || 0, 0.45);
          bolts.push({ x: origin.x, y: origin.y, x2: e.x, y2: e.y });
          next.push(e);
          forked++;
          hit = true;
        }
      }
      origins = next;
    }
    if (hit) {
      var back = st.furyLeech || 0;
      if (back) p.hp = Math.min(p.maxHp, p.hp + back);
      for (i = 0; i < ents.length; i++) {
        e = ents[i];
        if (e.kind !== 'summon' || e.dead) continue;
        if (e.role === 'wolf' || (b.valkstand && e.role === 'bear') || (b.skymark && e.role === 'raven')) e.cd = 0;
      }
    }
    PB.Events.emit(world.events, 'fury', { x: p.x, y: p.y, x2: x1, y2: y1, bolts: bolts, hit: hit });
    if (hit) PB.World.hitStop(world, 26);
  }

  // Whirlwind: the whole ring, not an arc. A spin inside the window stacks frenzy. The warband answers. The whole pack does not.
  function whirlwind(world, p, input) {
    var a = Math.atan2(input.aim.y - p.y, input.aim.x - p.x), st = world.mods.stats || {}, b = world.mods.behaviors || {};
    p.facing = a;
    var maxStacks = 2 + Math.min(3, st.frenzyMax || 0);
    if ((p.whirlT || 0) > 0) p.whirlN = Math.min(maxStacks, (p.whirlN || 0) + 1);
    else p.whirlN = 1;
    var stacks = p.whirlN;
    p.whirlT = 2.4 + (b.whirlheart ? 1 : 0);
    p.lashCd = Math.max(0.22, 0.5 - stacks * 0.04 - Math.min(4, Math.floor((st.thornDmg || 0) / 5)) * 2 / 60);
    var reach = WHIRL_R + (b.whirlheart ? 18 : 0);
    var mul = 1 + 0.18 * (stacks - 1);
    var passes = b.berserk && stacks >= 3 ? 2 : 1;
    var bonus = weaponBonus(world) + (st.whirlDmg || 0);
    var ents = world.ents, hits = [], i, e, primary = null, best = Infinity;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (!isEnemy(e)) continue;
      var dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy > (reach + e.r) * (reach + e.r)) continue;
      hits.push(e);
      var d = dx * dx + dy * dy;
      if (d < best) { best = d; primary = e; }
    }
    var hit = false, pass;
    for (pass = 0; pass < passes; pass++) {
      var pm = mul * (pass === 0 ? 1 : 0.7);
      var att = { id: 0, kind: 'player', team: 0, tags: [], x: p.x, y: p.y, dmg: [(16 + bonus) * pm, (24 + bonus) * pm], critChance: 0.08, auraDmgInc: p.auraDmgInc || 0 };
      for (i = 0; i < hits.length; i++) {
        e = hits[i];
        if (e.dead) continue;
        if (e === primary || b.warcry) e.marked = Math.max(e.marked || 0, 2 + (st.markDur || 0));
        if (e === primary) e.lashed = 2;
        if (b.warcry && !e.boss && !(e.elite && e.elite.length)) e.fleeT = Math.max(e.fleeT || 0, 0.7);
        PB.World.damage(world, att, e);
        PB.World.knock(e, p.x, p.y, 70);
        hit = true;
      }
    }
    if (hit) {
      var back = st.whirlLeech || 0;
      if (back) p.hp = Math.min(p.maxHp, p.hp + back);
      for (i = 0; i < ents.length; i++) {
        e = ents[i];
        if (e.kind !== 'summon' || e.dead) continue;
        if (e.role === 'wolf' || e.role === 'bear') e.cd = 0;
        if (b.orders) {
          var ox = e.x - p.x, oy = e.y - p.y;
          if (ox * ox + oy * oy <= 160 * 160) e.hp = Math.min(e.maxHp, e.hp + 4);
        }
      }
    }
    PB.Events.emit(world.events, 'whirl', { x: p.x, y: p.y, radius: reach, hit: hit, stacks: stacks });
    if (hit) PB.World.hitStop(world, 50);
  }

  function basicAttack(world, p, input) {
    var kind = PB.Classes.of(world.save).attack;
    if (kind === 'bonespear') boneSpear(world, p, input);
    else if (kind === 'fireball') fireball(world, p, input);
    else if (kind === 'zeal') zeal(world, p, input);
    else if (kind === 'fury') fury(world, p, input);
    else if (kind === 'whirl') whirlwind(world, p, input);
    else thornlash(world, p, input);
  }

  function update(world, input, dt) {
    var p = world.player;
    p.lashCd = Math.max(0, p.lashCd - dt);
    p.whirlT = Math.max(0, (p.whirlT || 0) - dt);
    if (p.whirlT <= 0) p.whirlN = 0;
    p.bloodedT = Math.max(0, (p.bloodedT || 0) - dt);
    p.reelT = Math.max(0, (p.reelT || 0) - dt);
    p.boundCd = Math.max(0, p.boundCd - dt);
    p.iframes = Math.max(0, p.iframes - dt);
    fades(world, dt);
    if (p.hp <= 0) return; // down: the game screen takes over
    if (PB.Belt) PB.Belt.readPress(world, input); // a drink lands even while stunned or skinwalked, and it clears a stagger before this tick's step
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
      var slow = (p.reelT || 0) > 0 && PB.Belt ? PB.Belt.REEL_SLOW : 1;
      if (ml > 0) { p.x += mx / ml * p.speed * slow * dt; p.y += my / ml * p.speed * slow * dt; p.facing = Math.atan2(my, mx); }
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
    if (held.indexOf('thornlash') >= 0 && p.lashCd <= EPS) basicAttack(world, p, input);
    regen(world, p, dt);
  }

  PB.Player = { update: update, inLash: inLash, enemyAt: enemyAt, lashCooldown: lashCooldown, lashReach: lashReach, LASH_R: LASH_R, LASH_CD: LASH_CD, BOUND_T: BOUND_T, BOUND_CD: BOUND_CD, VINE_MAX: VINE_MAX, FANGS_FADE: FANGS_FADE };
})(globalThis.PB = globalThis.PB || {});
