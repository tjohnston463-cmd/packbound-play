// The simulation world. step(world, input) advances exactly one fixed tick (1/60 s) and returns true,
// or returns false when hit-stop froze the tick (the caller must then keep its input queued).
// Stage A ships this skeleton; stages B-D grow the per-kind update functions it calls.
(function (PB) {
  'use strict';
  var W = 2400, H = 1600;
  var CAPS = { summon: 40, enemy: 120, temp: 16 }; // spec §18 entity budgets; temps are short-lived extras

  function emptyInput() { return { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, pressed: [], held: [], click: null, drag: null }; }

  function createWorld(opts) {
    opts = opts || {};
    var seed = (opts.seed >>> 0) || 1;
    var rng = {};
    ['combat', 'ai', 'spawn', 'loot', 'names', 'fx', 'shrine', 'flask'].forEach(function (k) { rng[k] = new PB.Rng(PB.deriveSeed(seed, k + ':' + (opts.zone || 0))); });
    var level = opts.save ? opts.save.player.level : 1, ps = PB.Progression.playerStats(level);
    var world = {
      seed: seed, tick: 0, time: 0, width: W, height: H, freeze: 0, freezeGate: 0, stopTick: -1, stopN: 0,
      rng: rng, events: PB.Events.create(), ents: [], byId: {}, nextId: 1,
      hash: new PB.SpatialHash(W, H, 64, 1024),
      player: { id: 0, x: W / 2, y: H / 2, r: 12, hp: ps.maxHp, maxHp: ps.maxHp, spirit: ps.maxSpirit, maxSpirit: ps.maxSpirit, team: 0, kind: 'player', speed: 160, tags: [],
                facing: 0, lashCd: 0, boundCd: 0, boundLeft: 0, boundDir: { x: 1, y: 0 }, iframes: 0, mass: 1, vx: 0, vy: 0, down: false },
      anchor: null, // the possessed summon during Skinwalk (C4); leash, Heel, Rally and auras center on it
      pack: PB.Commands.createPackState(),
      mods: opts.mods || { stats: {}, behaviors: {} },
      save: opts.save || null, inds: {}, den: {}, active: {}, temps: [], telegraphs: [], nextTg: 0, corpses: [], nextCorpse: 0, chorus: { meter: 0 }, hunt: null, patches: [], drops: [], nextDrop: 0, dir: null, ilvl: opts.ilvl || 1, shrine: null, grove: null, boon: null, runeGift: 0, skin: { id: 0, left: 0, cd: 0, sigCd: 0 },
      obstacles: opts.obstacles || [], // collision circles {x, y, r}; placement rules live in the director (D4)
      counts: { summon: 0, enemy: 0 }, wolvesAlive: 0, _out: []
    };
    var sm = world.mods.stats.spiritMax || 0; // Bone/Stag Mask implicit
    world.player.maxSpirit += sm; world.player.spirit += sm;
    world.byId[0] = world.player;
    return world;
  }

  // kind: 'summon' | 'enemy'. extra.temp marks a short-lived extra (ravenling, sapling, crow, echo):
  // temps share one budget and the oldest is retired when it is full. Returns null at a hard cap.
  function spawn(world, kind, type, x, y, extra) {
    var def = kind === 'summon' ? (PB.SUMMONS[type] || PB.Evolution.baseDef({ type: type })) : (PB.ENEMIES[type] || PB.BOSSES[type] || PB.Evolution.baseDef({ type: type })); // a Mimic shade is a summon body
    var temp = !!(extra && extra.temp);
    if (temp) {
      while (world.temps.length >= CAPS.temp) { var old = world.temps.shift(); if (!old.dead) { old.dead = true; old.expired = true; } }
    } else if (world.counts[kind] >= CAPS[kind]) {
      PB.Events.emit(world.events, 'spawn-fail', { unit: type, reason: 'budget' });
      return null;
    }
    var e = {
      id: world.nextId++, kind: kind, type: type, team: kind === 'summon' ? 0 : 1, x: x, y: y, vx: 0, vy: 0,
      r: def.r, hp: def.hp, maxHp: def.hp, speed: def.speed, atk: def.atk != null ? def.atk : 1, cd: 0, dead: false,
      dmg: def.dmg instanceof Array ? def.dmg.slice() : [def.dmg, def.dmg], tags: kind === 'summon' ? (def.tags || [type]).slice() : [],
      mass: def.mass || 1, marked: 0, rooted: 0, dr: 0, critChance: 0.05, critMult: 1.75, range: def.range || 20,
      ai: def.ai, flying: !!def.flying, aura: def.aura || null, shield: 0, shieldT: 0, fleeT: 0, linkCut: 0, encircled: 0,
      xp: def.xp || 0, boss: !!PB.BOSSES[type] && kind === 'enemy', elite: [], temp: temp, life: 0
    };
    if (def.role) e.role = def.role;
    if (extra) for (var k in extra) e[k] = extra[k];
    if (temp) world.temps.push(e); else world.counts[kind]++;
    world.ents.push(e);
    world.byId[e.id] = e;
    PB.Events.emit(world.events, kind === 'summon' ? 'summon' : 'spawn', { id: e.id, x: x, y: y, unit: type });
    return e;
  }

  // Spawns a roster individual (base, Alpha or cross fusion) with its effective stats and tags.
  function spawnIndividual(world, ind, x, y) {
    var st = PB.Evolution.statsFor(ind, world.mods.stats);
    var e = spawn(world, 'summon', ind.type, x, y, {
      indId: ind.id, hp: st.hp, maxHp: st.hp, dmg: st.dmg.slice(), atk: st.atk, speed: st.speed, r: st.r, mass: st.mass,
      range: st.range, tags: st.tags.slice(), critChance: st.critChance, critMult: st.critMult, ai: st.ai, flying: st.flying,
      aura: st.aura, infusion: st.infusion, dr: st.dr, evo: st.evo, scars: ind.scars
    });
    if (!e) return null;
    world._flagsTick = -1;
    world.inds[ind.id] = ind;
    world.active[ind.id] = e.id;
    PB.AIFusions.onSpawn(world, e);
    PB.Behaviors.bodyMods(world, e);
    return e;
  }

  // After an evolution (or any roster change) the field body takes the individual's new stats, keeping its life %.
  function refreshIndividual(world, ind) {
    var e = world.byId[world.active[ind.id]];
    if (!e || e.dead || e.fenrir) return null;
    var st = PB.Evolution.statsFor(ind, world.mods.stats), frac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    e.maxHp = st.hp; e.hp = st.hp * frac; e.dmg = st.dmg.slice(); e.atk = st.atk; e.speed = st.speed; e.r = st.r; e.mass = st.mass;
    e.range = st.range; e.tags = st.tags.slice(); e.critChance = st.critChance; e.critMult = st.critMult; e.ai = st.ai; e.flying = st.flying;
    e.aura = st.aura; e.infusion = st.infusion; e.dr = st.dr; e.evo = st.evo; e.scars = ind.scars;
    PB.AIFusions.onSpawn(world, e);
    PB.Behaviors.bodyMods(world, e);
    world._flagsTick = -1;
    return e;
  }

  // Hit-stop with a budget: at most one start per 120 ms (7 steps) and never more than 12 steps queued.
  // Requests on the tick that started it merge: the largest wins (a crit maul freezes like a maul, not like a crit).
  function hitStop(world, ms) {
    var n = Math.round(ms / (1000 / 60));
    if (world.tick < world.freezeGate) {
      if (world.stopTick !== world.tick || n <= world.stopN) return false;
      world.freeze = Math.min(12, world.freeze + n - world.stopN); world.stopN = n;
      return true;
    }
    world.freeze = Math.min(12, world.freeze + n);
    world.freezeGate = world.tick + 7; world.stopTick = world.tick; world.stopN = n;
    return true;
  }

  // Knockback: impulse / mass, added to velocity (damped by the movement code each step).
  function knock(e, fromX, fromY, impulse) {
    if (e.kind === 'player' || e.rooted > 0 || e.anchored) return;
    var dx = e.x - fromX, dy = e.y - fromY, d = Math.sqrt(dx * dx + dy * dy) || 1, v = impulse / (e.mass || 1);
    e.vx += dx / d * v; e.vy += dy / d * v;
  }

  function damage(world, att, def) {
    if (def.iframes > 0 || def.sleepT > 0) return { amount: 0, taken: 0, crit: false, rules: [], dodged: true };
    var src = world.byId[att.id];
    if (src && src.team === 1 && src.blindT > 0 && world.rng.combat.chance(0.5)) { // Owlbear blind: enemies miss half
      PB.Events.emit(world.events, 'miss', { src: att.id, dst: def.id, x: def.x, y: def.y });
      return { amount: 0, taken: 0, crit: false, rules: [], miss: true };
    }
    var beh = world.mods.behaviors, extraDr = def.auraDr && world.time < def.auraDrUntil ? def.auraDr : 0;
    if (beh.shepherds && def.kind === 'summon' && def.team === 0) extraDr += beh.shepherds / 100;
    if (def.kind === 'player' && world.mods.stats.armor) extraDr += world.mods.stats.armor / 100; // of Bark, pelts
    var h = PB.Combat.computeHit(att, def, { stats: world.mods.stats, wolvesAlive: world.wolvesAlive, frenzy: world.pack.frenzyT > 0, howl: world.pack.howlT > 0,
                                             extraDr: extraDr, omen: !!PB.AISummons.flags(world).t_omen, bearGuard: guarded(world, def), behaviors: beh,
                                             quarry: def.team === 1 && PB.Waves.isQuarry(world.dir, def.type), boon: world.boon }, world.rng.combat);
    var amount = h.amount, soak = 0;
    if (src && src.packbane && def.kind === 'summon') { amount *= 2; h.amount = amount; } // Packbane elites
    if (def.shield > 0) { soak = Math.min(def.shield, amount); def.shield -= soak; amount -= soak; }
    amount = PB.Behaviors.hurt(world, att, def, amount);
    def.hp -= amount;
    h.taken = amount;
    if (src && src.vampiric && !src.dead && amount > 0) src.hp = Math.min(src.maxHp, src.hp + amount * 0.2); // Vampiric elites
    var leech = world.mods.stats.packLeech;
    if (leech && src && src.team === 0 && src.kind === 'summon' && !src.dead && def.team === 1 && amount > 0) src.hp = Math.min(src.maxHp, src.hp + amount * leech / 100); // of Hunger
    // amount is what reached life (the number on screen); absorbed is what a shield ate
    PB.Events.emit(world.events, h.crit ? 'crit' : 'hit', { src: att.id, dst: def.id, amount: amount, absorbed: soak, x: def.x, y: def.y, srcKind: att.kind, dstKind: def.kind, rules: h.rules });
    if (h.crit) hitStop(world, 40);
    PB.Progression.onHit(world, att, def, h);
    PB.AIFusions.onHurt(world, att, def, h);
    if (att.team === 0 && def.team === 1 && att.tags && att.tags.length && !def.dead) PB.Chorus.onHit(world, att, def, h);
    if (def.kind === 'player') {
      hitStop(world, 50);
      if (PB.Belt) PB.Belt.reel(world, def, amount);
      if (def.hp <= 0 && world.anchor) { PB.Skinwalk.snapBack(world); return h; } // the husk falls: back in the body
      if (def.hp <= 0 && !def.down) { def.down = true; PB.Events.emit(world.events, 'druid-down', { x: def.x, y: def.y }); }
      return h;
    }
    if (def.hp <= 0 && !def.dead && def.scars && def.scars.indexOf('stubborn') >= 0 && world.rng.combat.chance(0.15)) {
      def.hp = 1; PB.Events.emit(world.events, 'stubborn', { id: def.id, x: def.x, y: def.y });
    }
    if (def.hp <= 0 && !def.dead) kill(world, att, def);
    return h;
  }

  // Bear guard (spec §6): a summon within 120px of another living bear-tagged summon takes 15% less damage.
  function guarded(world, def) {
    if (def.team !== 0 || def.kind !== 'summon') return false;
    for (var i = 0; i < world.ents.length; i++) {
      var b = world.ents[i];
      if (b === def || b.dead || b.team !== 0 || (b.tags.indexOf('bear') < 0 && b.role !== 'bear')) continue;
      var dx = b.x - def.x, dy = b.y - def.y;
      if (dx * dx + dy * dy <= 120 * 120) return true;
    }
    return false;
  }

  // A death in a wood splashes the neighbors. Each zone does it differently, so the woods do not play the same.
  function zoneWake(world, def) {
    var d = world.dir;
    if (!d || world._waking || def.boss) return;
    world._waking = true;
    var r2 = 120 * 120, i;
    for (i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (e.team !== 1 || e.dead || e === def) continue;
      var dx = e.x - def.x, dy = e.y - def.y;
      if (dx * dx + dy * dy > r2) continue;
      if (d.zone === 0) e.slowT = Math.max(e.slowT || 0, 2);
      else if (d.zone === 1) applyDot(e, 'burn', 6, 2, 0);
      else if (d.zone === 2) e.chillT = Math.max(e.chillT || 0, 1.5);
      else if (d.zone === 3) direct(world, 0, e, 4, false, 'zap');
      else applyDot(e, 'poison', 6, 2, 0);
    }
    world._waking = false;
    world.patches.push({ kind: 'wake', zone: d.zone, x: def.x, y: def.y, r: 70, t: 3, src: 0 });
    if (world.patches.length > 40) world.patches.shift();
    PB.Events.emit(world.events, 'zone-wake', { x: def.x, y: def.y, zone: d.zone });
  }

  function kill(world, att, def) {
    def.dead = true;
    if (def.team === 1 && world.player) {
      world.player.lashCd = 0; // a pack kill opens the whip
      if (def.elite && def.elite.length) world.player.bloodedT = 3; // an elite kill speeds the pack for 3s
      if ((def.lashed || 0) > 0) world.player.spirit = Math.min(world.player.maxSpirit, world.player.spirit + 6);
      zoneWake(world, def);
    }
    PB.Events.emit(world.events, 'kill', { src: att ? att.id : -1, dst: def.id, x: def.x, y: def.y, unit: def.type, team: def.team, elite: !!(def.elite && def.elite.length), boss: !!def.boss });
    if (def.kind === 'summon' && def.team === 0) PB.Behaviors.onSummonDeath(world, att, def);
    if (def.indId) PB.Roster.onDeath(world, def);
    else PB.Progression.onKill(world, att, def);
    if (def.team === 1) {
      if (world.mods.behaviors.greenbelow && def.elite && def.elite.length) PB.Behaviors.greenBelow(world, def.x, def.y);
      PB.AIEnemies.onDeath(world, def);
      if (def.kind === 'enemy') PB.Director.onEnemyDeath(world, def);
      PB.Feeding.addCorpse(world, def);
      PB.AISummons.onKill(world, att, def);
      PB.Chorus.onKill(world, def);
      PB.Drops.onKill(world, def);
    }
  }

  // A fixed hit with no roll (Chorus burst, Wild Hunt runner): no hit-stop, credited to srcId if it still exists.
  function direct(world, srcId, def, amount, crit, fx) {
    if (def.dead || amount <= 0) return 0;
    var att = world.byId[srcId] || null;
    amount = Math.max(1, Math.round(amount));
    def.hp -= amount;
    if (att && att.team === 0 && def.team === 1) (def.hitBy || (def.hitBy = {}))[att.id] = world.time;
    PB.Events.emit(world.events, crit ? 'crit' : 'hit', { src: srcId, dst: def.id, amount: amount, x: def.x, y: def.y, srcKind: att ? att.kind : fx, dstKind: def.kind, fx: fx });
    if (def.hp <= 0 && !def.dead) kill(world, att, def);
    return amount;
  }

  // A damage-over-time status (poison, burn, bleed) on e: fields <k>T, <k>Dps, <k>Src, <k>Acc. Ticks land in
  // whole points of 2 (the last remainder at the end), so the numbers stay readable.
  function applyDot(e, k, dps, dur, srcId) {
    if (e.dead) return;
    var live = (e[k + 'T'] || 0) > 0;
    e[k + 'Dps'] = live ? Math.max(e[k + 'Dps'] || 0, dps) : dps;
    e[k + 'T'] = Math.max(e[k + 'T'] || 0, dur);
    e[k + 'Src'] = srcId;
  }
  function tickDot(world, e, k, dt) {
    var T = e[k + 'T'];
    if (!(T > 0) || e.dead) return;
    var pd = Math.min(T, dt) * e[k + 'Dps'];
    T = e[k + 'T'] = Math.max(0, T - dt);
    var acc = e[k + 'Acc'] = (e[k + 'Acc'] || 0) + pd;
    if (acc >= 2 || (T === 0 && acc >= 0.5)) { var amt = Math.round(acc); e[k + 'Acc'] = acc - amt; dot(world, e[k + 'Src'], e, amt); }
    if (T === 0) e[k + 'Acc'] = 0;
  }

  // Damage over time (poison, burn): no roll, no crit, no hit-stop; credited to the source if it still exists.
  function dot(world, srcId, def, amount) {
    if (def.dead || amount <= 0) return;
    if (def.iframes > 0 || def.sleepT > 0) return;
    var att = world.byId[srcId] || null;
    def.hp -= amount;
    if (att && att.team === 0 && def.team === 1) (def.hitBy || (def.hitBy = {}))[att.id] = world.time;
    PB.Events.emit(world.events, 'hit', { src: srcId, dst: def.id, amount: amount, x: def.x, y: def.y, dot: true, dstKind: def.kind });
    if (def.kind === 'player') { if (def.hp <= 0 && world.anchor) { PB.Skinwalk.snapBack(world); return; } if (def.hp <= 0 && !def.down) { def.down = true; PB.Events.emit(world.events, 'druid-down', { x: def.x, y: def.y }); } return; }
    if (def.hp <= 0) kill(world, att, def);
  }

  // Obstacle avoidance: steer toward a detour point beside the nearest obstacle ahead on the straight line. Only
  // obstacles in front count (one beside or behind the body cannot block it; counting it made a body flip between two
  // detours forever). Of the two sides, a body keeps the side it picked for this obstacle, else takes a side whose
  // leg to the detour is clear of other obstacles, else the nearer side; a blocked leg is steered around in turn.
  function firstBlock(obs, e, x0, y0, tx, ty, skip) {
    var dx = tx - x0, dy = ty - y0, L = Math.sqrt(dx * dx + dy * dy);
    if (L < 1) return null;
    var ux = dx / L, uy = dy / L, best = -1, bestT = Infinity, bestPerp = 0;
    for (var i = 0; i < obs.length; i++) {
      if (i === skip) continue;
      var o = obs[i], cx = o.x - x0, cy = o.y - y0, t = cx * ux + cy * uy;
      if (t <= 0 || t > L + o.r) continue;
      var perp = cx * uy - cy * ux, R = o.r + e.r + 4;
      if (Math.abs(perp) >= R) continue;
      if (t < bestT) { best = i; bestT = t; bestPerp = perp; }
    }
    return best < 0 ? null : { i: best, perp: bestPerp, ux: ux, uy: uy };
  }
  function steerPoint(world, e, tx, ty) {
    var obs = world.obstacles;
    if (e.flying || !obs.length) return { x: tx, y: ty };
    var b = firstBlock(obs, e, e.x, e.y, tx, ty, -1);
    if (!b) { e.navObs = -1; return { x: tx, y: ty }; }
    var o = obs[b.i], off = o.r + e.r + 14, ux = b.ux, uy = b.uy;
    var pt = function (side) { return { x: o.x + side * uy * off, y: o.y - side * ux * off }; };
    var side = b.perp > 0 ? -1 : 1;
    if (e.navObs === b.i) side = e.navSide;
    else if (firstBlock(obs, e, e.x, e.y, pt(side).x, pt(side).y, b.i) && !firstBlock(obs, e, e.x, e.y, pt(-side).x, pt(-side).y, b.i)) side = -side;
    e.navObs = b.i; e.navSide = side;
    var g = pt(side), c = firstBlock(obs, e, e.x, e.y, g.x, g.y, b.i);
    if (!c) return g;
    var o2 = obs[c.i], off2 = o2.r + e.r + 14, s2 = c.perp > 0 ? -1 : 1;
    return { x: o2.x + s2 * c.uy * off2, y: o2.y - s2 * c.ux * off2 };
  }

  function moveToward(world, e, tx, ty, speed) {
    var g = steerPoint(world, e, tx, ty);
    var dx = g.x - e.x, dy = g.y - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    e.vx += (dx / d * speed - e.vx) * 0.2;
    e.vy += (dy / d * speed - e.vy) * 0.2;
  }

  function rebuildHash(world) {
    var hash = world.hash, ents = world.ents;
    hash.clear();
    world.wolvesAlive = 0;
    for (var i = 0; i < ents.length; i++) { var e = ents[i]; hash.insert(e); if (e.team === 0 && !e.dead && (e.tags.indexOf('wolf') >= 0 || e.role === 'wolf')) world.wolvesAlive++; }
    hash.insert(world.player);
  }

  function step(world, input) {
    input = input || emptyInput();
    var dt = PB.DT;
    if (world.freeze > 0) { world.freeze--; return false; } // hit-stop: whole tick skipped; input stays queued
    world.tick++;
    world.time = world.tick * dt;
    if (world.save) world.save.stats.playSeconds += dt;
    var p = world.player, ents = world.ents, hash = world.hash, i, e;

    // 2. spatial hash rebuild (before input so a click can find its enemy)
    rebuildHash(world);

    // 1. player input: movement, Thornlash, Bound, summon keys, commands (sim/player.js)
    PB.Player.update(world, input, dt);
    PB.Shrines.touch(world);

    // 3. commands tick + Encircle stamp
    PB.Commands.tick(world, dt);
    var enc = world.pack.encircle;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (e.team !== 1) continue;
      e.encircled = enc && (e.x - enc.x) * (e.x - enc.x) + (e.y - enc.y) * (e.y - enc.y) <= enc.r * enc.r ? 1 : 0;
    }
    var nearestEnemy = function (x, y, r) {
      var best = null, bd = r * r, n;
      for (n = 0; n < ents.length; n++) {
        var foe = ents[n];
        if (!isEnemy(foe) || !(foe.lashed > 0)) continue;
        var dx = foe.x - x, dy = foe.y - y, dd = dx * dx + dy * dy;
        if (dd <= bd) { bd = dd; best = foe; }
      }
      return best || hash.nearest(x, y, r, isEnemy); // a fresh lash outranks a nearer body
    };
    var mul = PB.Commands.packMul(world), thousand = !!world.mods.behaviors.thousandeye, through = PB.Behaviors.passThrough(world);
    PB.AISummons.beginTick(world);

    // 4. AI + attacks
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (e.dead) continue;
      e.cd = Math.max(0, e.cd - dt);
      if (!(thousand && e.marked > 0)) e.marked = Math.max(0, e.marked - dt); // Thousand-Eyed Mask: Marks never expire
      e.rooted = Math.max(0, e.rooted - dt);
      e.linkCut = Math.max(0, e.linkCut - dt);
      if (e.team === 0) PB.AISummons.update(world, e, dt, nearestEnemy, mul);
      else if (e.boss) PB.Bosses.update(world, e, dt);
      else PB.AIEnemies.update(world, e, dt);
    }

    // 6. integrate + separation (flying bodies ignore it; Encircle posts are anchored) + obstacle push-out
    var out = world._out, obs = world.obstacles;
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      if (e.dead) continue;
      if (!e.flying) {
        hash.queryRadius(e.x, e.y, e.r, out);
        var em = e.anchored ? 50 : e.mass;
        for (var j = 0; j < out.length; j++) {
          var o = out[j];
          if (o === e || o.kind === 'player' || o.flying || o.dead) continue;
          if ((e.ai === 'phaser' && o.team === 0) || (o.ai === 'phaser' && e.team === 0)) continue; // phasers slip through the pack
          if (e.ghost || o.ghost || e.grafted || o.grafted) continue; // Wraith Wolf phases through bodies; a grafted vine rides the bear
          if (through && e.team !== o.team) continue; // Ghostly, Stampeding recall
          var sx = e.x - o.x, sy = e.y - o.y, d2 = sx * sx + sy * sy, m = e.r + o.r, om = o.anchored ? 50 : o.mass;
          if (d2 > 0.0001 && d2 < m * m) { var d = Math.sqrt(d2), push = (m - d) / d * (om / (em + om)); e.x += sx * push; e.y += sy * push; }
        }
      }
      if (e.rooted > 0 && e.team === 1) { e.vx = 0; e.vy = 0; }
      if (e.vx * e.vx + e.vy * e.vy > 400) e.facing = Math.atan2(e.vy, e.vx);
      e.x = Math.max(0, Math.min(W, e.x + e.vx * dt));
      e.y = Math.max(0, Math.min(H, e.y + e.vy * dt));
      if (!e.flying) for (var k = 0; k < obs.length; k++) {
        var ob = obs[k], ox = e.x - ob.x, oy = e.y - ob.y, od2 = ox * ox + oy * oy, rr = ob.r + e.r;
        if (od2 < rr * rr) { var od = Math.sqrt(od2) || 1; e.x = ob.x + ox / od * rr; e.y = ob.y + oy / od * rr; }
      }
    }

    // 6. behavior affixes that place bodies after movement: Grafted, Shepherd's, Fenrir's Collar
    PB.Behaviors.post(world);

    // 6a. Encircle corrals: while at least 3 summons hold their posts, an enemy that was inside the ring last tick
    // (encircled) cannot cross it. Bosses break through; phasers slip between the posts.
    if (enc && PB.Commands.postsHeld(world) >= 3) {
      for (i = 0; i < ents.length; i++) {
        e = ents[i];
        if (e.team !== 1 || e.dead || !e.encircled || e.boss || e.ai === 'phaser') continue;
        var fx = e.x - enc.x, fy = e.y - enc.y, fd = Math.sqrt(fx * fx + fy * fy), lim = enc.r - e.r;
        if (fd > lim && fd > 0) { e.x = enc.x + fx / fd * lim; e.y = enc.y + fy / fd * lim; }
      }
    }

    // 6b. telegraphs resolve against the bodies where they now stand
    PB.Telegraphs.tick(world, dt);

    // 6c. Wild Hunt runners sweep the arena; ground patches (brambles) bite
    PB.Chorus.tick(world, dt);
    PB.AIFusions.tick(world, dt);

    // 7. statuses: poison, burn and bleed tick every 2 points, aura bonus expires, druid aura bonus too
    for (i = 0; i < ents.length; i++) {
      e = ents[i];
      tickDot(world, e, 'poison', dt);
      tickDot(world, e, 'burn', dt);
      tickDot(world, e, 'bleed', dt);
      if (e.auraDmgInc && world.time >= e.auraUntil) e.auraDmgInc = 0;
      if (e.alphaInc && world.time >= e.alphaUntil) { e.alphaInc = 0; e.followId = 0; }
      if (e.shieldT > 0) { e.shieldT = Math.max(0, e.shieldT - dt); if (e.shieldT === 0) e.shield = 0; }
      if (e.lashed > 0) e.lashed = Math.max(0, e.lashed - dt);
      if (e.amplify > 0) e.amplify = Math.max(0, e.amplify - dt);
      if (e.temp && e.life > 0) { e.life -= dt; if (e.life <= 1e-9 && !e.dead) { e.dead = true; e.expired = true; } }
    }

    if (p.auraDmgInc && world.time >= p.auraUntil) p.auraDmgInc = 0;

    // 8. deaths: Den recovery and bonded auto-return; corpses rot (and Carrion eats on contact)
    PB.Roster.tick(world);
    PB.Feeding.update(world, dt);
    PB.Drops.tick(world);

    // 10. compact dead (swap-remove keeps it O(n) with no allocation)
    for (i = ents.length - 1; i >= 0; i--) {
      e = ents[i];
      if (!e.dead) continue;
      if (e.temp) { var ti = world.temps.indexOf(e); if (ti >= 0) world.temps.splice(ti, 1); } else world.counts[e.kind]--;
      if (e.indId && world.active[e.indId] === e.id) delete world.active[e.indId];
      delete world.byId[e.id]; ents[i] = ents[ents.length - 1]; ents.pop();
    }

    // 11. the director: waves, Lull, shrine, boss, victory/defeat (D4)
    PB.Shrines.tick(world);
    PB.Director.update(world, dt);
    return true;
  }

  function isEnemy(e) { return e.team === 1 && !e.dead; }
  function isFriend(e) { return e.team === 0 && !e.dead && e.kind !== 'player'; }

  // Canonical snapshot of all authoritative state: keys sorted, entities by id, RNG states, pack, player, Den,
  // mods (gear, camp, Echoes), counters and the save but its settings. Order-independent and complete; for tests and replay checkpoints.
  function canon(v) {
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? '' : JSON.stringify(v === Infinity ? 'inf' : v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return k + ':' + canon(v[k]); }).join(',') + '}';
  }
  function snapshot(world) {
    var rng = {};
    Object.keys(world.rng).forEach(function (k) { rng[k] = world.rng[k].getState(); });
    var ents = world.ents.slice().sort(function (a, b) { return a.id - b.id; });
    var s = world.save;
    return {
      tick: world.tick, freeze: world.freeze, freezeGate: world.freezeGate, stopTick: world.stopTick, stopN: world.stopN, nextId: world.nextId, player: world.player, anchor: world.anchor ? world.anchor.id : null,
      pack: world.pack, rng: rng, ents: ents, den: world.den, active: world.active, obstacles: world.obstacles, telegraphs: world.telegraphs, corpses: world.corpses, chorus: world.chorus, hunt: world.hunt, patches: world.patches, drops: world.drops, nextDrop: world.nextDrop, dir: world.dir, ilvl: world.ilvl, shrine: world.shrine, skin: world.skin,
      time: world.time, mods: world.mods, temps: world.temps.map(function (t) { return t.id; }), nextTg: world.nextTg, nextCorpse: world.nextCorpse,
      counts: world.counts, wolvesAlive: world.wolvesAlive, zoneIdx: world.zoneIdx, seed: world.seed, grove: world.grove, boon: world.boon, runeGift: world.runeGift,
      // the whole save but its settings: gear, Echoes and progress change how combat resolves
      save: s ? { player: s.player, roster: s.roster, currency: s.currency, runes: s.runes, belt: s.belt, cubeRolls: s.cubeRolls, gambleRolls: s.gambleRolls, codex: s.codex, stats: s.stats, inventory: s.inventory, equipped: s.equipped,
                  echoes: s.echoes, progress: s.progress, nextIndId: s.nextIndId, nextItemId: s.nextItemId, seed: s.seed, version: s.version } : null
    };
  }
  function hashState(world) {
    var str = canon(snapshot(world)), h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16) + ':' + world.ents.length + ':' + world.tick;
  }

  PB.World = { createWorld: createWorld, spawn: spawn, spawnIndividual: spawnIndividual, refreshIndividual: refreshIndividual, step: step, damage: damage, hitStop: hitStop,
               hashState: hashState, snapshot: snapshot, emptyInput: emptyInput, steerPoint: steerPoint, moveToward: moveToward, knock: knock, dot: dot, kill: kill, applyDot: applyDot, direct: direct,
               isEnemy: isEnemy, isFriend: isFriend, rebuildHash: rebuildHash, CAPS: CAPS, WIDTH: W, HEIGHT: H };
})(globalThis.PB = globalThis.PB || {});
