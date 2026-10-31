// Behavior affixes and uniques (spec §12.2, §12.3). Each reads world.mods.behaviors[id] (the affix value; uniques are 1)
// and changes HOW the pack acts. The executors in ai_summons.js, World.damage/kill/step and Commands call the hooks below,
// so every affix keeps one guarded block here:
//   bodyMods (spawn/refresh)  summonTick (every summon AI tick)  dart / rootedMove (executor overrides)
//   afterStrike (a landed summon strike)  onEnemyKill  onSummonDeath  hurt (damage taken)  prey / echo (commands)  post (after movement)
(function (PB) {
  'use strict';
  var EPS = 1e-9;
  var KNOCKDOWN = 0.4, PREY_R = 400, HOWL_R = 250, HOWL_T = 3, HOWL_STACKS = 3, SWARM_HP = 0.75;
  var PASS_R = 6, ORBIT_R = 80, HOARD_R = 600, GRAB_R = 8, VOLATILE_R = 90, THUNDER_SHARE = 0.5, YANK_R = 300, YANK_TO = 60;
  var CLUSTER_R = 80, BURROW_R = 400, PERCH_R = 600, MARTYR_R = 100, SHEPHERD_R = 200, WALK = 0.6, TRAMPLE_AGAIN = 1;
  var SPROUT_T = 8, LULL_FRAC = 0.3, SLEEP_T = 3, SLEEP_REGEN = 0.1, ENRAGE_T = 8, LULL_CD = 20, FENRIR_R = 1.8, FENRIR_MASS = 3;

  function B(world) { return world.mods.behaviors; }
  function d2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function has(e, t) { return !!(e.tags && e.tags.indexOf(t) >= 0); }
  function isRole(e, t) { return has(e, t) || e.role === t; }
  function anchorOf(world) { return world.anchor || world.player; }
  function near(world, x, y, r, skip) { return PB.AISummons.enemiesNear(world, x, y, r, skip); }
  function sub(e, share) { return { id: e.id, kind: 'summon', team: 0, tags: e.tags, x: e.x, y: e.y, dmg: [e.dmg[0] * share, e.dmg[1] * share], critChance: 0 }; }
  function pack(world, fn) {
    for (var i = 0; i < world.ents.length; i++) { var f = world.ents[i]; if (f.team === 0 && !f.dead && f.kind === 'summon') fn(f); }
  }

  // ---------- bodies ----------
  // Swarming: wolves -25% life. Hivemind: the whole pack +v% life. Life % is kept (refresh after an evolution).
  function bodyMods(world, e) {
    var b = B(world), m = 1;
    if (b.swarming && isRole(e, 'wolf')) m *= SWARM_HP;
    if (b.hivemind) m *= 1 + b.hivemind / 100;
    if (m === 1) return;
    var f = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    e.maxHp = Math.round(e.maxHp * m); e.hp = e.maxHp * f;
  }

  function knockDown(world, t, dur) {
    if (t.boss || t.dead) return;
    dur = dur || KNOCKDOWN;
    t.knockedDown = Math.max(t.knockedDown || 0, dur); t.frozenT = Math.max(t.frozenT || 0, dur); t.vx = 0; t.vy = 0;
    PB.Events.emit(world.events, 'knockdown', { dst: t.id, x: t.x, y: t.y });
  }

  // Thousand-Eyed Mask (any raven) and Migratory (ravens under Focus): Mark every enemy the raven flies over.
  function markPassing(world, e) {
    var out = world._out3 || (world._out3 = []);
    world.hash.queryRadius(e.x, e.y, e.r + 24, out);
    for (var i = 0; i < out.length; i++) {
      var o = out[i];
      if (o.team !== 1 || o.dead || o.marked > 1) continue;
      var r = e.r + o.r + PASS_R;
      if (d2(e.x, e.y, o.x, o.y) <= r * r) PB.AISummons.mark(world, o, e);
    }
  }

  function focusTarget(world) {
    var o = world.pack.order;
    if (o.kind !== 'focus') return null;
    var t = world.byId[o.targetId];
    return t && !t.dead ? t : null;
  }

  // ---------- every summon AI tick ----------
  // Returns the (possibly changed) move speed, or -1 when the summon does nothing else this tick (asleep).
  // The body's own timers (enrage, howl, Lullaby sleep), ticked whoever drives it: the AI here, the player while
  // Skinwalking (skinwalk.js). Returns true while asleep: the body regenerates and does nothing else.
  function bodyTick(world, e, dt) {
    if (e.enrageT > 0) e.enrageT = Math.max(0, e.enrageT - dt);
    if (e.howlT > 0) { e.howlT -= dt; if (e.howlT <= EPS) { e.howlT = 0; e.howlStacks = 0; e.atkSpdBuff = 0; } }
    if (!(e.sleepT > 0)) return false;
    e.sleepT -= dt; e.vx *= 0.5; e.vy *= 0.5; // Ursa's Lullaby
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * SLEEP_REGEN * dt);
    if (e.sleepT <= EPS) { e.sleepT = 0; e.enrageT = ENRAGE_T; PB.Events.emit(world.events, 'wake', { id: e.id, x: e.x, y: e.y }); }
    return true;
  }

  function summonTick(world, e, it, dt, spd) {
    var b = B(world), p = world.player;
    if (bodyTick(world, e, dt)) return -1;
    if (b.tethered && isRole(e, 'bear') && p.hp > 0 && d2(e.x, e.y, p.x, p.y) > YANK_R * YANK_R) {
      var dx = e.x - p.x, dy = e.y - p.y, dl = Math.sqrt(dx * dx + dy * dy);
      PB.Events.emit(world.events, 'yank', { id: e.id, x: e.x, y: e.y, x2: p.x + dx / dl * YANK_TO, y2: p.y + dy / dl * YANK_TO });
      e.x = p.x + dx / dl * YANK_TO; e.y = p.y + dy / dl * YANK_TO; e.vx = 0; e.vy = 0;
    }
    if (b.ghostly) spd *= 1 + b.ghostly / 100;
    if (isRole(e, 'raven') && (b.thousandeye || (b.migratory && focusTarget(world)))) markPassing(world, e);
    if (b.stampeding && world.pack.recallT > 0 && !world.pack.recalled[e.id] && e.ai !== 'rooted' && e.atk >= 0) trample(world, e, b.stampeding);
    return spd;
  }

  // Stampeding: a recalled summon tramples every enemy its body passes through (once a second per enemy).
  function trample(world, e, v) {
    var hit = e.trampled || (e.trampled = {}), s = null;
    var list = near(world, e.x, e.y, e.r + 4);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (hit[o.id] !== undefined && world.time - hit[o.id] < TRAMPLE_AGAIN) continue;
      hit[o.id] = world.time;
      PB.World.damage(world, s || (s = sub(e, v / 100)), o);
    }
  }

  // ---------- raven executor overrides (dart) ----------
  function dart(world, e, it, spd, mul) {
    var b = B(world);
    if (e.linkCut > 0 || it.sprint || world.pack.recallT > 0) { if (e.perchOn) unperch(world, e); return false; }
    if (b.sentinel && !e.temp && perch(world, e, spd, mul)) return true;
    var ft = b.migratory ? focusTarget(world) : null;
    if (ft && it.kind === 'attack' && it.target === ft) { // Migratory: circle the Focus target, peck when ready
      var reach = e.r + ft.r + e.range;
      if (e.cd <= 0 && e.atk > 0 && d2(e.x, e.y, ft.x, ft.y) <= reach * reach) PB.AISummons.strike(world, e, ft, mul, false);
      else PB.World.moveToward(world, e, ft.x + Math.cos(e.orbA) * ORBIT_R, ft.y + Math.sin(e.orbA) * ORBIT_R, spd);
      return true;
    }
    if (b.hoarding && it.kind !== 'attack' && !e.temp) return hoard(world, e, spd);
    return false;
  }

  function findDrop(world, id) { for (var i = 0; i < world.drops.length; i++) if (world.drops[i].id === id) return world.drops[i]; return null; }

  // Hoarding: an idle raven flies to the nearest unclaimed drop, picks it up and carries it to the druid's body (never
  // one the player dropped).
  function hoard(world, e, spd) {
    var p = world.player, d;
    if (e.carry) {
      d = findDrop(world, e.carry);
      if (d) { PB.World.moveToward(world, e, p.x, p.y, spd); d.x = e.x; d.y = e.y; return true; }
      e.carry = 0;
    }
    var best = null, bd = HOARD_R * HOARD_R;
    for (var i = 0; i < world.drops.length; i++) {
      d = world.drops[i];
      if (d.discarded || d.carrier || (d.fetcher && d.fetcher !== e.id && world.byId[d.fetcher])) continue;
      var dd = d2(d.x, d.y, p.x, p.y);
      if (dd <= bd) { best = d; bd = dd; }
    }
    if (!best) return false;
    best.fetcher = e.id;
    if (d2(e.x, e.y, best.x, best.y) <= (e.r + GRAB_R) * (e.r + GRAB_R)) {
      best.carrier = e.id; e.carry = best.id;
      PB.Events.emit(world.events, 'fetch', { id: e.id, x: best.x, y: best.y });
    } else PB.World.moveToward(world, e, best.x, best.y, spd);
    return true;
  }

  function isVine(v) { return v.team === 0 && !v.dead && v.ai === 'rooted' && isRole(v, 'vine'); }
  function unperch(world, e) { var v = world.byId[e.perchOn]; if (v && v.perchBy === e.id) v.perchBy = 0; e.perchOn = 0; e.perched = false; }

  // Sentinel: each vine takes one raven; the perched raven fires feathers (its own strike) at the vine's grown reach.
  function perch(world, e, spd, mul) {
    var v = world.byId[e.perchOn];
    if (!v || !isVine(v) || v.perchBy !== e.id) {
      e.perchOn = 0; v = null;
      var a = anchorOf(world), bd = Infinity;
      for (var i = 0; i < world.ents.length; i++) {
        var c = world.ents[i];
        if (!isVine(c) || (c.perchBy && c.perchBy !== e.id && world.byId[c.perchBy] && !world.byId[c.perchBy].dead)) continue;
        if (d2(c.x, c.y, a.x, a.y) > PERCH_R * PERCH_R) continue;
        var dc = d2(e.x, e.y, c.x, c.y);
        if (dc < bd) { v = c; bd = dc; }
      }
      if (!v) { e.perched = false; return false; }
      v.perchBy = e.id; e.perchOn = v.id;
    }
    if (d2(e.x, e.y, v.x, v.y) > 16) { e.perched = false; PB.World.moveToward(world, e, v.x, v.y, spd); return true; }
    e.x = v.x; e.y = v.y; e.vx = 0; e.vy = 0; e.perched = true;
    if (e.cd <= 0 && e.atk > 0) {
      var t = near(world, v.x, v.y, v.range + v.r)[0];
      if (t) {
        PB.Events.emit(world.events, 'feather', { src: e.id, x: v.x, y: v.y, x2: t.x, y2: t.y });
        PB.AISummons.strike(world, e, t, mul, false);
      }
    }
    return true;
  }

  // ---------- vine executor (rooted) ----------
  // Sentinel reach, Burrowing tunnels and Heartwood's walking vines. Returns true when the vine moves itself this tick.
  function rootedMove(world, e, it, mul, dt) {
    var b = B(world);
    if (e.baseRange === undefined) e.baseRange = e.range;
    var perched = b.sentinel && e.perchBy && world.byId[e.perchBy] && !world.byId[e.perchBy].dead && world.byId[e.perchBy].perched;
    e.range = perched ? e.baseRange * (1 + b.sentinel / 100) : e.baseRange;
    // Briarwake: a pulse on its own clock, not on the vine's attack timer.
    if (b.briarwake && !e.temp) {
      e.briarT = (e.briarT || 0) + dt;
      if (e.briarT >= 4) {
        e.briarT -= 4;
        var pulse = Math.max(1, Math.round((e.dmg[0] + e.dmg[1]) * 0.2));
        near(world, e.x, e.y, 100).forEach(function (o) {
          PB.World.direct(world, e.id, o, pulse, false, 'briar');
          if (!o.boss && !o.dead) o.slowT = Math.max(o.slowT || 0, 0.8);
        });
        PB.Events.emit(world.events, 'briar', { id: e.id, x: e.x, y: e.y, radius: 100 });
      }
    }
    if (e.grafted) return false;
    if (b.burrowing && !e.temp) {
      e.burrowT = (e.burrowT === undefined ? b.burrowing : e.burrowT) - dt;
      if (e.burrowT <= EPS) { e.burrowT = b.burrowing; burrow(world, e); }
    }
    if (!b.walkingvines) return false;
    var spd = PB.SUMMONS.wolf.speed * WALK * mul.speed, a = anchorOf(world);
    if (it.kind === 'attack') { e.vx *= 0.6; e.vy *= 0.6; return true; }
    if (d2(e.x, e.y, a.x, a.y) > 90 * 90) PB.World.moveToward(world, e, a.x, a.y, spd); else { e.vx *= 0.6; e.vy *= 0.6; }
    return true;
  }

  // The enemy within BURROW_R with the most neighbours within 80px (at least one): the vine surfaces beside the group.
  function burrow(world, e) {
    var cands = near(world, e.x, e.y, BURROW_R), best = null, bestN = 0;
    for (var i = 0; i < cands.length; i++) {
      var n = near(world, cands[i].x, cands[i].y, CLUSTER_R, cands[i]).length;
      if (n > bestN) { best = cands[i]; bestN = n; }
    }
    if (!best) return;
    var grp = near(world, best.x, best.y, CLUSTER_R), cx = 0, cy = 0;
    grp.forEach(function (o) { cx += o.x; cy += o.y; });
    cx /= grp.length; cy /= grp.length;
    var dx = e.x - cx, dy = e.y - cy, dl = Math.sqrt(dx * dx + dy * dy) || 1, off = e.r + 26;
    var x2 = cx + dx / dl * off, y2 = cy + dy / dl * off;
    PB.Events.emit(world.events, 'burrow', { id: e.id, x: e.x, y: e.y, x2: x2, y2: y2 });
    e.x = x2; e.y = y2; e.vx = 0; e.vy = 0;
  }

  // ---------- grove sets ----------
  // Oldest living named wolf. Cached for the tick so a second call does not pick a new mother mid-swing.
  function tagDen(world) {
    var on = !!B(world).denmother, i, e, best;
    if (world._denTick !== world.tick) {
      world._denTick = world.tick;
      world._denId = 0;
      if (on) {
        best = null;
        for (i = 0; i < world.ents.length; i++) {
          e = world.ents[i];
          if (e.team !== 0 || e.dead || e.temp || !e.indId || e.kind !== 'summon' || !isRole(e, 'wolf')) continue;
          if (!best || e.id < best.id) best = e;
        }
        world._denId = best ? best.id : 0;
      }
    }
    var mother = on && world._denId ? world.byId[world._denId] : null;
    if (mother && (mother.dead || mother.team !== 0)) mother = null;
    for (i = 0; i < world.ents.length; i++) {
      e = world.ents[i];
      if (e.team === 0) e.denMother = !!(mother && e.id === mother.id);
    }
    return mother;
  }

  // First Howl: her bite Marks, and wolves beside her take the first real haste step for 1.5s.
  function denBite(world, e, target) {
    if (!B(world).denmother || !isRole(e, 'wolf') || !target || target.dead) return;
    var mother = tagDen(world);
    if (!mother || e.id !== mother.id) return;
    PB.AISummons.mark(world, target, e);
    var r2 = PB.Sets.DEN_R * PB.Sets.DEN_R;
    pack(world, function (f) {
      if (!isRole(f, 'wolf') || d2(e.x, e.y, f.x, f.y) > r2) return;
      f.howlT = Math.max(f.howlT || 0, 1.5);
      f.atkSpdBuff = Math.max(f.atkSpdBuff || 0, 0.15);
    });
    PB.Events.emit(world.events, 'denmother', { id: e.id, x: e.x, y: e.y, dst: target.id });
  }

  // Green Wreath: a rooted foe is Marked, and every raven in reach pecks it. direct() does not sing a Chorus.
  function onWreath(world, vine, target) {
    if (!target || target.dead) return;
    PB.AISummons.mark(world, target, vine);
    var r2 = PB.Sets.WREATH_R * PB.Sets.WREATH_R, n = 0;
    pack(world, function (f) {
      if (!isRole(f, 'raven') || d2(f.x, f.y, target.x, target.y) > r2) return;
      var bite = Math.max(1, Math.round(((f.dmg[0] + f.dmg[1]) / 2) * 0.5));
      if (PB.World.direct(world, f.id, target, bite, false, 'wreath')) n++;
    });
    PB.Events.emit(world.events, 'wreath', { src: vine ? vine.id : 0, dst: target.id, x: target.x, y: target.y, n: n });
  }

  // Hearth of the Hunt: one Chorus heals the pack and hands Spirit back. Called once per Chorus, not per hit.
  function onHearthwake(world) {
    var n = 0;
    pack(world, function (f) {
      f.hp = Math.min(f.maxHp, f.hp + f.maxHp * PB.Sets.HEAL);
      n++;
    });
    var p = world.player;
    if (p) p.spirit = Math.min(p.maxSpirit, (p.spirit || 0) + PB.Sets.SPIRIT_BACK);
    PB.Events.emit(world.events, 'hearthwake', { x: p ? p.x : 0, y: p ? p.y : 0, n: n, spirit: PB.Sets.SPIRIT_BACK });
  }

  // ---------- a landed summon strike ----------
  function afterStrike(world, e, target, h) {
    var b = B(world);
    if (b.denmother) tagDen(world);
    if (b.predatory && isRole(e, 'wolf') && !target.dead && !target.boss && target.hp < target.maxHp * b.predatory / 100) {
      PB.Events.emit(world.events, 'execute', { src: e.id, dst: target.id, x: target.x, y: target.y });
      PB.World.kill(world, e, target);
    }
    if (b.howling && h.crit && isRole(e, 'wolf')) {
      var r2 = HOWL_R * HOWL_R, inc = b.howling / 100;
      pack(world, function (f) {
        if (d2(e.x, e.y, f.x, f.y) > r2) return;
        f.howlStacks = f.howlT > 0 ? Math.min(HOWL_STACKS, (f.howlStacks || 0) + 1) : 1;
        f.howlT = HOWL_T; f.atkSpdBuff = inc * f.howlStacks;
      });
      PB.Events.emit(world.events, 'wolfhowl', { id: e.id, x: e.x, y: e.y });
    }
    // Wolfhowl: every 4th wolf bite. The pack nearby swings faster, and a non-boss is slowed.
    if (b.wolfhowl && isRole(e, 'wolf')) {
      e.wordHits = (e.wordHits || 0) + 1;
      if (e.wordHits % 4 === 0) {
        var wr = 220 * 220;
        pack(world, function (f) {
          if (d2(e.x, e.y, f.x, f.y) > wr) return;
          f.howlT = Math.max(f.howlT || 0, HOWL_T);
          f.atkSpdBuff = Math.max(f.atkSpdBuff || 0, 0.12);
        });
        if (!target.dead && !target.boss) target.slowT = Math.max(target.slowT || 0, 1.2);
        PB.Events.emit(world.events, 'wolfhowl', { id: e.id, x: e.x, y: e.y, word: 1 });
      }
    }
    denBite(world, e, target);
    if (b.crowmark && isRole(e, 'raven') && (target.marked || 0) > 0) {
      var nbr = near(world, target.x, target.y, 160, target), ci;
      for (ci = 0; ci < nbr.length; ci++) {
        var markOn = nbr[ci];
        if (markOn.elite && markOn.elite.indexOf('warded') >= 0) continue;
        var was = markOn.marked || 0;
        PB.AISummons.mark(world, markOn, e);
        if ((markOn.marked || 0) > was) break;
        break;
      }
    }
    if (b.oakheart && isRole(e, 'bear') && !target.dead && !target.boss) {
      target.tauntBy = e.id; target.tauntT = 2.5;
      PB.Events.emit(world.events, 'taunt', { id: e.id, x: e.x, y: e.y, n: 1 });
    }
    if (b.thunderous && isRole(e, 'bear')) {
      var s = sub(e, THUNDER_SHARE);
      near(world, e.x, e.y, b.thunderous, target).forEach(function (o) { PB.World.damage(world, s, o); });
      PB.Events.emit(world.events, 'shockwave', { id: e.id, x: e.x, y: e.y, radius: b.thunderous });
    }
  }

  // of Haste snaps down onto a step. 7% and 9% are not the same swing; 9% is the 8% step. 25% is itself a step.
  function atkBreakpoint(pct) {
    var breaks = [0, 8, 16, 25, 33, 42, 50, 60, 75, 100], p = pct || 0, best = 0, i;
    for (i = 0; i < breaks.length; i++) if (p + 1e-9 >= breaks[i]) best = breaks[i];
    return best;
  }

  // Attack rate multiplier for one summon: pack timers, Howling stacks, haste steps, level steps, and a fresh elite kill.
  function rate(world, e, mul) {
    var stats = world.mods.stats || {};
    var haste = atkBreakpoint(stats.packAtkSpd) / 100 + (stats.atkBreak || 0) / 100;
    if (world.player && world.player.bloodedT > 0) haste += 0.08;
    if (PB.Slaughter) haste += PB.Slaughter.haste(world);
    if (world.boon && world.boon.atk) haste += world.boon.atk; // a shrine is a raw burst, not a gear breakpoint
    return mul.atkRate * (1 + (e.atkSpdBuff || 0) + haste);
  }

  // ---------- deaths ----------
  function onEnemyKill(world, att, def) {
    var b = B(world);
    if (b.splitting && att && att.team === 0 && !att.temp && has(att, 'raven') && world.byId[att.id] === att) {
      for (var k = 0; k < 2; k++) {
        var hp = Math.max(1, Math.round(att.maxHp * 0.5));
        PB.World.spawn(world, 'summon', 'raven', att.x + (k ? 10 : -10), att.y, { temp: true, life: b.splitting, ravenling: true, hp: hp, maxHp: hp,
          dmg: [att.dmg[0] * 0.5, att.dmg[1] * 0.5], r: 5, tags: att.tags.slice() });
      }
      PB.Events.emit(world.events, 'split', { id: att.id, x: att.x, y: att.y });
    }
    if (b.volatile && def.marked > 0) {
      var amt = def.maxHp * b.volatile / 100, src = att ? att.id : -1;
      PB.Events.emit(world.events, 'volatile', { x: def.x, y: def.y, radius: VOLATILE_R });
      near(world, def.x, def.y, VOLATILE_R, def).forEach(function (o) { PB.World.direct(world, src, o, amt, false, 'volatile'); });
    }
  }

  // Martyr's: the fallen summon bursts on enemies and heals summons within 100px by v% of its max life.
  function onSummonDeath(world, att, def) {
    var b = B(world);
    if (!b.martyrs || def.temp) return;
    var amt = def.maxHp * b.martyrs / 100, r2 = MARTYR_R * MARTYR_R;
    PB.Events.emit(world.events, 'martyr', { id: def.id, x: def.x, y: def.y, radius: MARTYR_R });
    pack(world, function (f) { if (f !== def && d2(def.x, def.y, f.x, f.y) <= r2) f.hp = Math.min(f.maxHp, f.hp + amt); });
    near(world, def.x, def.y, MARTYR_R).forEach(function (o) { PB.World.direct(world, def.id, o, amt, false, 'martyr'); });
  }

  // ---------- damage taken ----------
  // World.damage calls this with what got past the shield; returns what reaches def's own life.
  function hurt(world, att, def, amount) {
    var b = B(world);
    if (amount <= 0) return amount;
    if (def.kind === 'player') {
      if (!b.tethered) return amount;
      var bear = null;
      pack(world, function (f) { if (!bear && has(f, 'bear') && !f.sleepT) bear = f; });
      if (!bear) return amount;
      var part = Math.round(amount * b.tethered / 100);
      if (part > 0) PB.World.direct(world, att.id, bear, part, false, 'tether');
      return amount - part;
    }
    if (def.team !== 0 || def.kind !== 'summon') return amount;
    if (b.lullaby && has(def, 'bear') && !(def.lullCd > world.time) && def.hp - amount < def.maxHp * LULL_FRAC) {
      amount = Math.max(0, Math.min(amount, def.hp - 1));
      def.sleepT = SLEEP_T; def.lullCd = world.time + LULL_CD; def.vx = 0; def.vy = 0;
      PB.Events.emit(world.events, 'sleep', { id: def.id, x: def.x, y: def.y });
      return amount;
    }
    // Hearthbond: the first killing blow in 20s leaves this body at 1 life. Temp bodies do not get it.
    if (b.hearthbond && !def.temp && def.indId && def.hp - amount <= 0 && !(def.hearthCd > world.time)) {
      def.hearthCd = world.time + 20;
      amount = Math.max(0, def.hp - 1);
      PB.Events.emit(world.events, 'hearthbond', { id: def.id, x: def.x, y: def.y });
    }
    if (b.hivemind && !def.temp) {
      var all = [];
      pack(world, function (f) { if (!f.temp && !(f.sleepT > 0)) all.push(f); });
      if (all.indexOf(def) < 0) all.push(def);
      // One life pool: each member pays in proportion to the life it holds, so every life % falls together and
      // nobody falls before the pool is empty (an even split let a bear's hit kill a raven).
      var pool = 0, mine = amount;
      all.forEach(function (f) { pool += Math.max(0, f.hp); });
      if (pool <= 0) return amount;
      all.forEach(function (f) {
        var part = amount * Math.max(0, f.hp) / pool;
        if (f === def) { mine = part; return; }
        f.hp -= part;
        if (f.hp <= 0 && !f.dead) PB.World.kill(world, att, f);
      });
      return mine;
    }
    return amount;
  }

  // ---------- commands ----------
  // Predatory: the weakest (lowest life %) enemy within 400px of the wolf that is inside the leash.
  function prey(world, s, a, leash) {
    var list = near(world, s.x, s.y, PREY_R), best = null, bf = Infinity;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (d2(o.x, o.y, a.x, a.y) > leash * leash) continue;
      var f = o.hp / o.maxHp;
      if (f < bf - 1e-12) { best = o; bf = f; }
    }
    return best;
  }

  // Echoing: a Focus target is taunted onto the nearest mobile summon.
  function echoFocus(world, t) {
    if (!t || t.dead || t.boss) return;
    var best = null, bd = Infinity;
    pack(world, function (f) { if (f.temp || !PB.Commands.isMobile(f)) return; var d = d2(f.x, f.y, t.x, t.y); if (d < bd) { best = f; bd = d; } });
    if (best) { t.tauntBy = best.id; t.tauntT = 3; PB.Events.emit(world.events, 'taunt', { id: best.id, x: best.x, y: best.y, n: 1 }); }
  }

  // ---------- after movement (step slot 6) ----------
  function post(world) {
    var b = B(world), a = anchorOf(world), i, e;
    if (b.grafted) {
      var vine = null, bear = null;
      for (i = 0; i < world.ents.length; i++) {
        e = world.ents[i];
        if (e.team !== 0 || e.dead) continue;
        if (isVine(e) && !e.temp) { e.grafted = false; if (!vine || e.id > vine.id) vine = e; }
        if (isRole(e, 'bear') && !bear) bear = e;
      }
      if (vine && bear) { vine.grafted = true; vine.x = bear.x; vine.y = bear.y; vine.vx = 0; vine.vy = 0; }
    }
    if (b.shepherds) {
      for (i = 0; i < world.ents.length; i++) {
        e = world.ents[i];
        if (e.team !== 0 || e.dead || e.kind !== 'summon' || e === world.anchor || e.ai === 'rooted') continue;
        var dx = e.x - a.x, dy = e.y - a.y, dd = dx * dx + dy * dy;
        if (dd > SHEPHERD_R * SHEPHERD_R) { var dl = Math.sqrt(dd); e.x = a.x + dx / dl * SHEPHERD_R; e.y = a.y + dy / dl * SHEPHERD_R; }
      }
    }
    fenrir(world, b);
    tagDen(world);
  }

  // Fenrir's Collar: on Frenzy every called wolf merges into the lowest-id one (life, max life and damage summed);
  // the others leave the field but stay active (world.active points at the host), so the cap still counts them.
  // When Frenzy ends they split back with the host's life %. If the host falls, they all go to the Den.
  function fenrir(world, b) {
    var pk = world.pack, f = pk.fenrir, i;
    if (!f && b.fenrir && pk.frenzyT > 0) {
      var wolves = world.ents.filter(function (e) { return e.team === 0 && !e.dead && !e.temp && e.indId && isRole(e, 'wolf') && e !== world.anchor; })
        .sort(function (x, y) { return x.id - y.id; });
      if (wolves.length < 2) return;
      var host = wolves[0], hp = 0, mx = 0, d0 = 0, d1 = 0;
      wolves.forEach(function (w) { hp += w.hp; mx += w.maxHp; d0 += w.dmg[0]; d1 += w.dmg[1]; });
      var members = [];
      for (i = 1; i < wolves.length; i++) {
        var m = wolves[i];
        members.push(m.indId);
        PB.Feeding.stop(world, m);
        m.dead = true; m.released = true; world.active[m.indId] = host.id;
      }
      host.hp = hp; host.maxHp = mx; host.dmg = [d0, d1]; host.r = (PB.SUMMONS[host.type] || PB.SUMMONS.wolf).r * FENRIR_R; host.mass *= FENRIR_MASS; host.fenrir = true;
      pk.fenrir = { host: host.id, members: members };
      PB.Events.emit(world.events, 'fenrir', { id: host.id, x: host.x, y: host.y, n: wolves.length });
      return;
    }
    if (!f) return;
    var h = world.byId[f.host];
    if (!h || h.dead) {
      f.members.forEach(function (id) { delete world.active[id]; var ind = world.inds[id]; if (ind) world.den[id] = world.time + PB.Roster.DEN_PER_TIER * ind.tier; });
      pk.fenrir = null;
      return;
    }
    if (pk.frenzyT > 0) return;
    var frac = h.maxHp > 0 ? h.hp / h.maxHp : 1;
    h.fenrir = false;
    PB.World.refreshIndividual(world, world.inds[h.indId]);
    f.members.forEach(function (id, k) {
      delete world.active[id];
      var ind = world.inds[id], a = (k + 1) / (f.members.length + 1) * PB.M.TAU;
      var e2 = ind && PB.World.spawnIndividual(world, ind, h.x + Math.cos(a) * 24, h.y + Math.sin(a) * 24);
      if (e2) e2.hp = e2.maxHp * frac;
    });
    pk.fenrir = null;
    PB.Events.emit(world.events, 'fenrir-split', { id: h.id, x: h.x, y: h.y, n: f.members.length + 1 });
  }

  // The Green Below (keystone): a temporary vine sprouts where an elite dies or is first rooted.
  function greenBelow(world, x, y) {
    var sprout = (PB.Classes && world.save) ? PB.Classes.kinType(world.save, 'vine') : 'vine';
    var e = PB.World.spawn(world, 'summon', sprout, x, y, { temp: true, life: SPROUT_T, sprout: true });
    if (e) PB.Events.emit(world.events, 'sprout', { id: e.id, x: x, y: y });
    return e;
  }

  // Separation is skipped between the pack and enemies (Ghostly, a Stampeding recall) and for a grafted vine.
  function passThrough(world) { var b = B(world); return !!(b.ghostly || (b.stampeding && world.pack.recallT > 0)); }

  PB.Behaviors = { bodyTick: bodyTick, bodyMods: bodyMods, knockDown: knockDown, summonTick: summonTick, dart: dart, rootedMove: rootedMove, afterStrike: afterStrike,
                   rate: rate, atkBreakpoint: atkBreakpoint, onEnemyKill: onEnemyKill, onSummonDeath: onSummonDeath, hurt: hurt, prey: prey, echoFocus: echoFocus, post: post,
                   passThrough: passThrough, greenBelow: greenBelow, markPassing: markPassing, onWreath: onWreath, onHearthwake: onHearthwake, tagDen: tagDen,
                   KNOCKDOWN: KNOCKDOWN, SHEPHERD_R: SHEPHERD_R };
})(globalThis.PB = globalThis.PB || {});
