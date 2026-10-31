// The director (plan D4, spec §10): runs one zone attempt inside the sim. start() places the obstacles, calls the bonded
// fusions and starts wave 1; update() (World.step, after compaction) walks the wave's spawn list by delay, keeps at
// most 80 enemies alive (the rest wait), spawns at the four edges with a 0.6 s emerge, scales life and damage, and
// applies elite modifiers. A cleared wave starts an 8 s Lull (wave 5 banks a Moonstone); the Fusion Shrine grows
// when wave 4 starts; wave 6 is the boss, whose death is victory. The druid falling is defeat. State is world.dir.
(function (PB) {
  'use strict';
  var LULL = 8, STRAGGLERS = 3, EMERGE = 0.6, LANE = 140, CENTRE = 200, GAP = 70, EDGE_IN = 20, HUNTER_SHARE = 0.25, EPS = 1e-9;
  var ELITE_HP = 2.5, ELITE_DMG = 1.3, ELITE_XP = 3, ELITE_R = 1.15, SHIELD = 0.3, HASTE = 1.4, SPLIT_N = 3;

  // 12-18 circles (r 30-80): never within 200px (+r) of the centre, never in the 140px edge lanes the waves walk in
  // from, and every gap between two of them at least 70px, so the bear fits and steering has no concave pocket.
  function placeObstacles(world, rng) {
    var n = rng.int(12, 18), out = [], W = world.width, H = world.height;
    for (var tries = 0; out.length < n && tries < 2000; tries++) {
      var r = rng.range(30, 80), o = { x: rng.range(LANE + r, W - LANE - r), y: rng.range(LANE + r, H - LANE - r), r: Math.round(r) };
      if (Math.hypot(o.x - W / 2, o.y - H / 2) < CENTRE + o.r) continue;
      if (out.every(function (b) { return Math.hypot(o.x - b.x, o.y - b.y) - o.r - b.r >= GAP; })) out.push(o);
    }
    return out;
  }

  // The wave's spawn list (Waves.buildWave, verified) plus the hunters: about a quarter of each wave goes for the druid.
  function spawnList(zone, wave, moon, rng) {
    var list = PB.Waves.buildWave(zone, wave, moon, rng).spawns;
    list.forEach(function (sp) { sp.hunter = !sp.boss && rng.chance(HUNTER_SHARE); });
    return list;
  }

  function start(world, zone, moon) {
    var rng = world.rng.spawn, p = world.player;
    world.obstacles = placeObstacles(world, rng); world.zoneIdx = zone;
    p.x = world.width / 2; p.y = world.height / 2;
    world.dir = { zone: zone, moon: moon || 0, wave: 0, state: 'wave', t: 0, idx: 0, list: [], scale: null, bossId: 0, kills: 0 };
    if (world.save) PB.Roster.spawnBonded(world, p.x, p.y + 40);
    PB.Events.emit(world.events, 'zone', { zone: zone, moon: moon || 0, name: PB.ZONES[zone].name });
    startWave(world, 1);
    return world.dir;
  }

  function startWave(world, wave, override) {
    var d = world.dir;
    d.wave = wave; d.state = 'wave'; d.t = 0; d.idx = 0; d.bossId = 0;
    d.scale = PB.Waves.scale(d.zone, wave, d.moon);
    d.list = override || spawnList(d.zone, wave, d.moon, world.rng.spawn);
    world.ilvl = d.scale.ilvl;
    if (wave >= 4 && !world.shrine) openShrine(world);
    PB.Events.emit(world.events, 'wave', { wave: wave, zone: d.zone, boss: wave > PB.Waves.WAVES_PER_ZONE, count: d.list.length });
  }

  // The shrine grows 300-420px from the centre, clear of every obstacle.
  function openShrine(world) {
    var rng = world.rng.spawn, cx = world.width / 2, cy = world.height / 2, x = cx + 300, y = cy;
    for (var i = 0; i < 40; i++) {
      var a = rng.range(0, PB.M.TAU), r = rng.range(300, 420), tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r;
      if (world.obstacles.every(function (o) { return Math.hypot(tx - o.x, ty - o.y) > o.r + PB.Fusion.SHRINE_R; })) { x = tx; y = ty; break; }
    }
    PB.Fusion.openShrine(world, x, y);
  }

  function edgePoint(world, edge, rng) {
    var W = world.width, H = world.height;
    switch (edge) {
      case 0: return { x: rng.range(LANE, W - LANE), y: EDGE_IN };
      case 1: return { x: W - EDGE_IN, y: rng.range(LANE, H - LANE) };
      case 2: return { x: rng.range(LANE, W - LANE), y: H - EDGE_IN };
      default: return { x: EDGE_IN, y: rng.range(LANE, H - LANE) };
    }
  }

  // One enemy from a spawn record, scaled by the current wave; elites get more life, damage and their modifiers.
  function spawnEnemy(world, sp, x, y, extra) {
    var d = world.dir, s = d && d.scale ? d.scale : { hp: 1, dmg: 1 }, def = PB.ENEMIES[sp.enemy] || PB.BOSSES[sp.enemy];
    if (PB.BOSSES[sp.enemy] && d) s = PB.Waves.scale(d.zone, 1, d.moon); // a boss scales by zone and Moon, not by the wave term
    var el = sp.elite && sp.elite.length ? sp.elite.slice() : [];
    if (d && (d.moon || 0) >= 1 && !sp.boss && !el.length && PB.Waves.isQuarry(d, sp.enemy)) el = [PB.ELITE_MODS[Math.floor(world.rng.spawn.next() * PB.ELITE_MODS.length)].id];
    var em = el.length ? 1 : 0;
    var hp = Math.round(def.hp * s.hp * (em ? ELITE_HP : 1)), dmg = def.dmg * s.dmg * (em ? ELITE_DMG : 1);
    var o = { hp: hp, maxHp: hp, dmg: [dmg, dmg], elite: el, spawnX: x, spawnY: y, emergeT: EMERGE, frozenT: EMERGE, hunter: !!sp.hunter,
              xp: Math.round((def.xp || 0) * (em ? ELITE_XP : 1)) };
    if (extra) for (var k in extra) o[k] = extra[k];
    var e = PB.World.spawn(world, 'enemy', sp.enemy, x, y, o);
    if (!e) return null;
    if (em) {
      e.r = Math.round(e.r * ELITE_R);
      if (el.indexOf('shielded') >= 0) { e.shield = e.maxHp * SHIELD; e.shieldT = 0; } // shieldT 0: the shield never decays
      if (el.indexOf('hasted') >= 0) { e.speed *= HASTE; e.atk /= HASTE; e.hasted = true; }
      if (el.indexOf('vampiric') >= 0) e.vampiric = true;
      if (el.indexOf('packbane') >= 0) e.packbane = true;
    }
    if (e.boss && d) d.bossId = e.id;
    return e;
  }

  // Splitting elites break into 3 half-size, plain copies (World.kill, enemies).
  function onEnemyDeath(world, e) {
    if (!e.elite || e.elite.indexOf('splitting') < 0 || e.splitFrom) return;
    for (var i = 0; i < SPLIT_N; i++) {
      var a = i / SPLIT_N * PB.M.TAU, hp = Math.round(e.maxHp / 2);
      PB.World.spawn(world, 'enemy', e.type, e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18,
        { hp: hp, maxHp: hp, dmg: [e.dmg[0] / 2, e.dmg[1] / 2], r: Math.max(5, Math.round(e.r * 0.7)), elite: [], splitFrom: e.id, xp: Math.round(e.xp / 3), hunter: e.hunter });
    }
    PB.Events.emit(world.events, 'elite-split', { x: e.x, y: e.y, n: SPLIT_N });
  }

  function victory(world) {
    var d = world.dir, s = world.save;
    d.state = 'victory';
    if (s) {
      var g = s.progress;
      if (g.cleared.indexOf(d.zone) < 0) g.cleared.push(d.zone);
      var atMoon = g.moonCleared[d.moon] = g.moonCleared[d.moon] || []; // the map's ticks are per Moon tier
      if (atMoon.indexOf(d.zone) < 0) atMoon.push(d.zone);
      g.unlockedZone = Math.max(g.unlockedZone, Math.min(PB.ZONES.length - 1, d.zone + 1));
      if (d.zone === PB.ZONES.length - 1) g.bestMoon = Math.max(g.bestMoon, d.moon); // Moon tiers open after the Unmaker
    }
    PB.Events.emit(world.events, 'victory', { zone: d.zone, moon: d.moon });
  }

  var FARM_EVERY = 8, FARM_N = 4;

  // A cleared zone stays a hunt: a thin pack from the edges every 8s, at the zone's wave-5 strength.
  function farm(world, dt) {
    var d = world.dir;
    if (!d || d.state !== 'victory' || world.player.hp <= 0) return;
    d.farmT = (d.farmT || 0) + dt;
    if (d.farmT < FARM_EVERY) return;
    d.farmT -= FARM_EVERY;
    d.scale = PB.Waves.scale(d.zone, PB.Waves.WAVES_PER_ZONE, d.moon);
    var quarry = PB.Waves.quarry(d.zone, d.moon), n;
    for (n = 0; n < FARM_N; n++) {
      if (world.counts.enemy >= PB.Waves.CONCURRENT_CAP) break;
      var sp = { enemy: quarry, boss: false, elite: [], edge: n % 4, hunter: true };
      var at = edgePoint(world, sp.edge, world.rng.spawn);
      spawnEnemy(world, sp, at.x, at.y);
    }
  }

  // One line the player can read: what the wood wants, and which steps the pack has hit.
  function huntLine(world) {
    var d = world.dir;
    if (!d) return '';
    var q = PB.Waves.quarry(d.zone, d.moon), name = (PB.ENEMIES[q] && PB.ENEMIES[q].name) || q;
    var stats = (world.mods && world.mods.stats) || {};
    var lash = Math.min(5, Math.floor((stats.thornDmg || 0) / 4));
    var spd = stats.atkBreak || 0, gear = PB.Behaviors.atkBreakpoint(stats.packAtkSpd || 0);
    var line = 'The wood wants ' + name;
    if (d.qStreak) line += ' · quarry streak ' + d.qStreak;
    if (lash) line += ' · lash step ' + lash;
    if (spd) line += ' · pack +' + spd + '% speed';
    if (gear) line += ' · haste step ' + gear + '%';
    if (world.player && world.player.bloodedT > 0) line += ' · blooded';
    return line;
  }

  // Step slot 11 (after compaction, so the enemy count is exact).
  function update(world, dt) {
    var d = world.dir;
    if (!d || d.state === 'defeat') return;
    if (d.state === 'victory') { farm(world, dt); return; }
    var p = world.player;
    if (p.hp <= 0) {
      d.state = 'defeat';
      if (world.save) world.save.stats.deaths++;
      PB.Events.emit(world.events, 'defeat', { zone: d.zone, wave: d.wave });
      return;
    }
    d.t += dt;
    if (d.state === 'lull') { if (d.t >= LULL - EPS) startWave(world, d.wave + 1); return; }
    while (d.idx < d.list.length && d.list[d.idx].delay <= d.t + EPS && world.counts.enemy < PB.Waves.CONCURRENT_CAP) {
      var sp = d.list[d.idx++], at = edgePoint(world, sp.edge, world.rng.spawn);
      spawnEnemy(world, sp, at.x, at.y);
    }
    if (d.bossId) {
      var b = world.byId[d.bossId];
      if (!b || b.dead) { victory(world); return; }
    }
    if (d.idx >= d.list.length && world.counts.enemy > 0 && world.counts.enemy <= STRAGGLERS && !d.bossId) { // the last few come to you
      for (var i = 0; i < world.ents.length; i++) { var e = world.ents[i]; if (e.team === 1 && !e.dead) e.hunter = true; }
    }
    if (d.idx >= d.list.length && world.counts.enemy === 0 && d.wave <= PB.Waves.WAVES_PER_ZONE) {
      PB.Events.emit(world.events, 'wave-clear', { wave: d.wave, zone: d.zone });
      if (d.wave === PB.Waves.WAVES_PER_ZONE && world.save) {
        world.save.currency.moonstones += 1;
        PB.Events.emit(world.events, 'moonstone', { n: 1, x: p.x, y: p.y });
      }
      d.state = 'lull'; d.t = 0;
    }
  }

  // HUD line: zone, wave, enemies left (alive + still to come) or the boss.
  function status(world) {
    var d = world.dir;
    if (!d) return null;
    var left = world.counts.enemy + Math.max(0, d.list.length - d.idx);
    return { zone: d.zone, name: PB.ZONES[d.zone].name, wave: d.wave, state: d.state, left: left, lull: d.state === 'lull' ? Math.max(0, LULL - d.t) : 0,
             boss: d.bossId ? world.byId[d.bossId] || null : null, moon: d.moon };
  }

  PB.Director = { start: start, startWave: startWave, update: update, spawnEnemy: spawnEnemy, spawnList: spawnList, onEnemyDeath: onEnemyDeath,
                  placeObstacles: placeObstacles, status: status, huntLine: huntLine, LULL: LULL, LANE: LANE, EMERGE: EMERGE, ELITE_HP: ELITE_HP, ELITE_DMG: ELITE_DMG,
                  FARM_EVERY: FARM_EVERY, FARM_N: FARM_N };
})(globalThis.PB = globalThis.PB || {});
