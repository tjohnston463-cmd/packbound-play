// Bosses (plan D5, spec §9.3). update() casts the next ready attack, round-robin among those off cooldown and
// allowed in the current phase and range, as world telegraphs (the shared §9.1 language); between casts the boss
// chases and bites through AIEnemies.update. Phase 2 starts at <= 50% life: one `phase` event, a 150 ms hit-stop,
// and the phase-2 attacks unlock. Special kinds resolve here (Telegraphs.resolve hands them over):
//   summon (adds), thrall (a tether on a summon; a Rally before it completes breaks it, else the summon fights for the
//   boss 10 s), sever (3 safe circles; summons outside are stunned 3 s and unlinked 4 s), mimic (a hostile shade of
//   your best fusion, 15 s), push (everything 200px away), chain (5 jumps across the pack).
(function (PB) {
  'use strict';
  var EPS = 1e-9, PHASE_AT = 0.5, PHASE_STOP = 150, PHASE_BREATH = 1.0, GAP = 0.6;
  var THRALL_R = 600, THRALL_T = 10, SEVER_STUN = 3, SEVER_CUT = 4, SAFE_N = 3, SAFE_R = 70, SAFE_MIN = 120, SAFE_MAX = 320, SEVER_R = 1400;
  var MIMIC_T = 15, PUSH = 200, PUSH_R = 500, CHAIN_N = 5, CHAIN_R = 200, CHAIN_SHARE = 0.7, ADD_R = 80, SPOKE_W = 24, STAMPEDE_T = 0.4, DIVE_T = 0.15;

  function d2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function isFriend(e) { return e.team === 0 && !e.dead && e.kind === 'summon'; }

  function inRange(b, t, a) {
    var d = Math.sqrt(d2(b.x, b.y, t.x, t.y));
    switch (a.kind) {
      case 'cone': return d <= a.radius + t.r;
      case 'line': return d <= a.length * 0.85;
      case 'ring': return d <= a.radius + t.r;
      case 'circle': return d <= 600;
      case 'push': return d <= PUSH_R * 0.8;
      default: return d <= 700;
    }
  }

  function init(b) { if (!b.phase) { b.phase = 1; b.bcd = {}; b.atkIdx = 0; b.gapT = 0; } }

  function update(world, b, dt) {
    var def = PB.BOSSES[b.type];
    if (!def) return PB.AIEnemies.update(world, b, dt);
    init(b);
    if (b.phase === 1 && b.hp <= b.maxHp * PHASE_AT && !b.dead) {
      b.phase = 2; b.gapT = Math.max(b.gapT, PHASE_BREATH);
      PB.Events.emit(world.events, 'phase', { id: b.id, x: b.x, y: b.y, unit: b.type });
      PB.World.hitStop(world, PHASE_STOP);
    }
    def.attacks.forEach(function (a) { b.bcd[a.id] = Math.max(0, (b.bcd[a.id] || 0) - dt); });
    b.gapT = Math.max(0, b.gapT - dt);
    if (b.atk > 0 && !(b.castT > 0) && !(b.dashT > 0) && !(b.frozenT > 0) && !(b.emergeT > 0) && b.gapT <= EPS) {
      var t = PB.AIEnemies.pickTarget(world, b), n = def.attacks.length;
      for (var k = 0; k < n; k++) {
        var i = (b.atkIdx + k) % n, a = def.attacks[i];
        if ((a.phase || 1) > b.phase || b.bcd[a.id] > EPS || !inRange(b, t, a)) continue;
        if (cast(world, b, a, t).length) { b.atkIdx = i + 1; break; }
      }
    }
    PB.AIEnemies.update(world, b, dt);
  }

  function friends(world) { var out = []; world.ents.forEach(function (e) { if (isFriend(e) && !e.temp) out.push(e); }); return out; }

  // Places the attack's telegraph(s); returns them. The boss stands still for the wind-up.
  function cast(world, b, a, t) {
    init(b);
    t = t || PB.AIEnemies.pickTarget(world, b);
    var ang = Math.atan2(t.y - b.y, t.x - b.x), rng = world.rng.ai, out = [], i;
    var base = function (o) { o.tele = a.tele; o.dmg = o.dmg != null ? o.dmg : b.dmg[0]; o.owner = b.id; o.boss = true; o.angle = o.angle != null ? o.angle : ang; return PB.Telegraphs.create(world, o); };
    switch (a.kind) {
      case 'cone': out.push(base({ kind: 'cone', x: b.x, y: b.y, arc: a.angle, radius: a.radius })); break; // data angle = cone width (arc)
      case 'line':
        out.push(base({ kind: 'line', x: b.x, y: b.y, width: a.width, length: a.length,
                        dash: a.id === 'stampede' ? { x: b.x + Math.cos(ang) * a.length, y: b.y + Math.sin(ang) * a.length, t: STAMPEDE_T } : null }));
        break;
      case 'radial': {
        var a0 = rng.range(0, Math.PI * 2 / a.spokes);
        for (i = 0; i < a.spokes; i++) out.push(base({ kind: 'line', x: b.x, y: b.y, angle: a0 + i / a.spokes * Math.PI * 2, width: SPOKE_W, length: a.length }));
        break;
      }
      case 'circles': {
        var fs = friends(world).concat([world.player]);
        for (i = 0; i < a.count; i++) {
          var c = i === 0 ? t : fs[Math.floor(rng.next() * fs.length)];
          out.push(base({ kind: 'circle', x: c.x + (i ? rng.range(-60, 60) : 0), y: c.y + (i ? rng.range(-60, 60) : 0), radius: a.radius }));
        }
        break;
      }
      case 'ring': out.push(base({ kind: 'ring', x: b.x, y: b.y, inner: a.inner || 0, radius: a.radius })); break;
      case 'circle': out.push(base({ kind: 'circle', x: t.x, y: t.y, radius: a.radius, dash: { x: t.x, y: t.y, t: DIVE_T } })); break;
      case 'summon': out.push(base({ kind: 'circle', x: b.x, y: b.y, radius: ADD_R, dmg: 0, special: 'summon', data: { enemy: a.enemy, count: a.count } })); break;
      case 'thrall': {
        var vs = friends(world).filter(function (f) { return d2(f.x, f.y, b.x, b.y) <= THRALL_R * THRALL_R && !f.shade; }).sort(function (x, y) { return x.id - y.id; });
        if (!vs.length) break;
        var v = vs[Math.floor(rng.next() * vs.length)];
        out.push(base({ kind: 'tether', x: b.x, y: b.y, targetId: v.id, range: 1e4, dmg: 0, special: 'thrall', data: { rally: world.pack.rallyT } }));
        break;
      }
      case 'sever': {
        var p = world.player, safe = [];
        for (var tries = 0; safe.length < SAFE_N && tries < 200; tries++) {
          var sa = rng.range(0, Math.PI * 2), sr = rng.range(SAFE_MIN, SAFE_MAX);
          var s = { x: PB.M.clamp(p.x + Math.cos(sa) * sr, SAFE_R, world.width - SAFE_R), y: PB.M.clamp(p.y + Math.sin(sa) * sr, SAFE_R, world.height - SAFE_R), r: SAFE_R };
          if (safe.every(function (q) { return Math.hypot(q.x - s.x, q.y - s.y) > SAFE_R * 2.2; })) safe.push(s);
        }
        out.push(base({ kind: 'ring', x: b.x, y: b.y, inner: 0, radius: SEVER_R, dmg: 0, special: 'sever', safe: safe }));
        break;
      }
      case 'mimic': out.push(base({ kind: 'circle', x: b.x, y: b.y, radius: 60, dmg: 0, special: 'mimic' })); break;
      case 'push': out.push(base({ kind: 'ring', x: b.x, y: b.y, inner: 0, radius: PUSH_R, dmg: 0, special: 'push' })); break;
      case 'chain': out.push(base({ kind: 'circle', x: t.x, y: t.y, radius: 30, special: 'chain', targetId: t.id })); break;
    }
    if (!out.length) { b.bcd[a.id] = 1; return out; }
    b.castT = a.tele; b.vx = 0; b.vy = 0; b.facing = ang; b.bcd[a.id] = a.cd; b.gapT = a.tele + GAP;
    PB.Events.emit(world.events, 'boss-cast', { id: b.id, atk: a.id, kind: a.kind, x: b.x, y: b.y, tele: a.tele });
    return out;
  }

  // Telegraphs.tick asks before a tick: true cancels the telegraph (a Rally broke the Thrall, or its victim is gone).
  function watch(world, tg) {
    if (tg.special !== 'thrall') return false;
    var v = world.byId[tg.targetId];
    if (!v || v.dead || v.team !== 0) return true;
    if (world.pack.rallyT > tg.data.rally + EPS) {
      PB.Events.emit(world.events, 'thrall-break', { id: v.id, x: v.x, y: v.y });
      return true;
    }
    tg.data.rally = world.pack.rallyT;
    return false;
  }

  // Special resolutions (Telegraphs.resolve). Returns true when handled.
  function resolve(world, tg) {
    var owner = world.byId[tg.owner], i, e;
    switch (tg.special) {
      case 'summon':
        for (i = 0; i < tg.data.count; i++) {
          var a = i / tg.data.count * Math.PI * 2, x = tg.x + Math.cos(a) * ADD_R, y = tg.y + Math.sin(a) * ADD_R;
          if (world.dir) PB.Director.spawnEnemy(world, { enemy: tg.data.enemy, boss: false, elite: [] }, x, y, { noLoot: true, emergeT: 0.3, frozenT: 0.3 });
          else PB.World.spawn(world, 'enemy', tg.data.enemy, x, y, { noLoot: true });
        }
        return true;
      case 'thrall': {
        var v = world.byId[tg.targetId];
        if (v && !v.dead && v.team === 0) {
          PB.Feeding.stop(world, v);
          v.team = 1; v.thrallT = THRALL_T; v.targetId = 0;
          if (world.anchor === v) PB.Skinwalk.exit(world, 'thrall');
          PB.Events.emit(world.events, 'thrall', { id: v.id, x: v.x, y: v.y, src: tg.owner });
        }
        return true;
      }
      case 'sever':
        for (i = 0; i < world.ents.length; i++) {
          e = world.ents[i];
          if (!isFriend(e)) continue;
          var safe = tg.safe.some(function (s) { return d2(e.x, e.y, s.x, s.y) <= s.r * s.r; });
          if (safe) continue;
          e.stunT = SEVER_STUN; e.linkCut = Math.max(e.linkCut, SEVER_CUT);
          PB.Events.emit(world.events, 'linkcut', { id: e.id, x: e.x, y: e.y, src: tg.owner });
        }
        PB.Events.emit(world.events, 'telegraph-hit', { tgId: tg.id, kind: 'ring', x: tg.x, y: tg.y, radius: tg.radius, hits: 0, boss: true });
        return true;
      case 'mimic': {
        var best = null;
        (world.save ? world.save.roster : []).forEach(function (ind) {
          var key = (ind.fusedFrom ? 1000 : 0) + ind.level;
          if (!best || key > best.key || (key === best.key && ind.id < best.ind.id)) best = { ind: ind, key: key };
        });
        if (!best) return true;
        var st = PB.Evolution.statsFor(best.ind, world.mods.stats);
        var sh = PB.World.spawn(world, 'enemy', best.ind.type, tg.x + 40, tg.y, { temp: true, life: MIMIC_T, shade: true, noLoot: true, xp: 0,
          hp: st.hp, maxHp: st.hp, dmg: st.dmg.slice(), atk: Math.max(0.5, st.atk || 1), speed: st.speed || 150, r: st.r, mass: st.mass, range: st.range, ai: 'swarm', flying: false });
        if (sh) PB.Events.emit(world.events, 'mimic', { id: sh.id, unit: sh.type, name: best.ind.name, x: sh.x, y: sh.y });
        return true;
      }
      case 'push': {
        var push = function (o) {
          var dx = o.x - tg.x, dy = o.y - tg.y, dl = Math.sqrt(dx * dx + dy * dy);
          if (dl > tg.radius + o.r) return;
          if (dl < 1) { dx = 1; dy = 0; dl = 1; }
          o.x = PB.M.clamp(o.x + dx / dl * PUSH, 0, world.width); o.y = PB.M.clamp(o.y + dy / dl * PUSH, 0, world.height);
        };
        for (i = 0; i < world.ents.length; i++) if (isFriend(world.ents[i])) push(world.ents[i]);
        if (world.player.hp > 0) push(world.player);
        PB.Events.emit(world.events, 'gale', { x: tg.x, y: tg.y, radius: tg.radius });
        return true;
      }
      case 'chain': {
        var first = world.byId[tg.targetId], hit = {}, from = owner || { x: tg.x, y: tg.y };
        var att = { id: tg.owner, kind: 'enemy', team: 1, tags: [], dmg: [tg.dmg * CHAIN_SHARE, tg.dmg * CHAIN_SHARE], critChance: 0 };
        var cur = first && !first.dead && (first.kind === 'player' ? first.hp > 0 : first.team === 0) ? first : null;
        for (i = 0; i < CHAIN_N && cur; i++) {
          hit[cur.id] = true;
          PB.Events.emit(world.events, 'chain', { x: from.x, y: from.y, x2: cur.x, y2: cur.y, src: tg.owner, boss: true });
          PB.World.damage(world, att, cur);
          from = cur;
          var next = null, bd = CHAIN_R * CHAIN_R;
          for (var j = 0; j < world.ents.length; j++) {
            e = world.ents[j];
            if (!isFriend(e) || hit[e.id]) continue;
            var dd = d2(from.x, from.y, e.x, e.y);
            if (dd <= bd) { next = e; bd = dd; }
          }
          cur = next;
        }
        return true;
      }
    }
    return false;
  }

  PB.Bosses = { update: update, cast: cast, watch: watch, resolve: resolve, inRange: inRange, PHASE_AT: PHASE_AT, THRALL_T: THRALL_T };
})(globalThis.PB = globalThis.PB || {});
