// Player and pack progression from real combat. World.damage calls onHit/onKill; nothing here needs the DOM.
// Rules (spec §3-4): the druid gets every kill's XP; the killer summon gets 100%; any other summon that hit the
// victim in the last 3s gets 50%; support summons (no attack) get 50% of kills inside their aura. First kill of
// each boss grants +1 skill point.
(function (PB) {
  'use strict';
  var PLAYER_MAX = 40, ASSIST_WINDOW = 3, ASSIST_SHARE = 0.5;

  function playerXpToNext(level) { return Math.round(100 * Math.pow(level, 1.5)); }

  function playerStats(level) {
    return { maxHp: 100 + 8 * (level - 1), maxSpirit: 100 + 3 * (level - 1), spiritRegen: 6 * (1 + 0.01 * (level - 1)) };
  }

  // A druid level-up mid-fight: max Life and Spirit rise by the level's gain and current values rise with them
  // (a fallen druid stays fallen). Deltas, so other max-life sources stack on top.
  function applyPlayerLevel(world, from, to) {
    var p = world.player, a = playerStats(from), b = playerStats(to), dh = b.maxHp - a.maxHp, ds = b.maxSpirit - a.maxSpirit;
    p.maxHp += dh; p.maxSpirit += ds;
    if (p.hp > 0 && !p.down) p.hp = Math.min(p.maxHp, p.hp + dh);
    p.spirit = p.maxSpirit; // a level fills Spirit. Life only gains the level's own increase.
  }

  function addPlayerXp(player, amount) {
    var gained = 0;
    if (player.level >= PLAYER_MAX) return 0;
    player.xp += amount;
    while (player.level < PLAYER_MAX && player.xp >= playerXpToNext(player.level)) {
      player.xp -= playerXpToNext(player.level);
      player.level++;
      gained++;
    }
    if (player.level >= PLAYER_MAX) player.xp = 0;
    return gained;
  }

  function indOf(world, ent) { return ent && ent.indId && world.inds ? world.inds[ent.indId] || null : null; }

  function grant(world, ind, amount) {
    var wasReady = PB.Evolution.canEvolve(ind);
    var r = PB.Evolution.addXp(ind, amount);
    if (r.levels) {
      if (world.active && world.active[ind.id]) PB.World.refreshIndividual(world, ind); // the body in the field grows now
      PB.Events.emit(world.events, 'levelup', { who: 'summon', indId: ind.id, level: ind.level });
    }
    if (r.evolveReady && !wasReady) PB.Events.emit(world.events, 'evolve-ready', { indId: ind.id });
  }

  // A new scar can change combat stats (Warden, Butcher, Bonebreaker, Firstborn): the body in the field takes them now.
  function scars(world, ind) {
    var got = PB.Evolution.checkScars(ind);
    if (got.length && world.active && world.active[ind.id]) PB.World.refreshIndividual(world, ind);
    got.forEach(function (id) { PB.Events.emit(world.events, 'scar', { indId: ind.id, scar: id }); });
  }

  // Every landed hit: assist bookkeeping and deeds.
  function onHit(world, att, def, hit) {
    if (att.team === 0 && def.team === 1) (def.hitBy || (def.hitBy = {}))[att.id] = world.time;
    var ai = indOf(world, att);
    if (ai && hit.crit) { ai.deeds.crits++; scars(world, ai); }
    var di = indOf(world, def);
    if (di) {
      di.deeds.damageTaken += hit.amount;
      if (!def.dead && def.hp > 0 && def.hp < def.maxHp * 0.05 && !def._near) { def._near = true; di.deeds.nearDeaths++; }
      scars(world, di);
    }
  }

  function onKill(world, killer, victim) {
    var save = world.save;
    if (!save || victim.team !== 1) return;
    var xp = victim.xp || 0, credited = {};
    if (PB.Waves.isQuarry(world.dir, victim.type)) xp = Math.round(xp * 1.5);
    var seen = save.codex.enemies[victim.type] || 0;
    save.codex.enemies[victim.type] = seen + 1;
    save.stats.kills++;
    var lv = addPlayerXp(save.player, xp);
    if (lv) { applyPlayerLevel(world, save.player.level - lv, save.player.level); PB.Events.emit(world.events, 'levelup', { who: 'player', level: save.player.level }); }
    if (victim.boss && seen === 0) { save.player.bonusPoints = (save.player.bonusPoints || 0) + 1; PB.Events.emit(world.events, 'bonuspoint', { boss: victim.type }); }

    var ki = indOf(world, killer);
    if (ki) {
      credited[killer.id] = true;
      ki.deeds.kills++;
      if (victim.boss) ki.deeds.bossKills++;
      grant(world, ki, xp);
      scars(world, ki);
    }
    var ids = Object.keys(victim.hitBy || {}).map(Number).sort(function (a, b) { return a - b; });
    ids.forEach(function (id) {
      if (credited[id] || world.time - victim.hitBy[id] > ASSIST_WINDOW) return;
      var ind = indOf(world, world.byId[id]);
      if (ind) { credited[id] = true; grant(world, ind, xp * ASSIST_SHARE); }
    });
    // Support summons: kills inside their aura count as assists, so spirits and healers progress too.
    for (var i = 0; i < world.ents.length; i++) {
      var s = world.ents[i];
      if (s.team !== 0 || s.dead || !s.aura || credited[s.id]) continue;
      var dx = victim.x - s.x, dy = victim.y - s.y, r = s.aura.radius || 0;
      if (dx * dx + dy * dy > r * r) continue;
      var si = indOf(world, s);
      if (si) { credited[s.id] = true; grant(world, si, xp * ASSIST_SHARE); }
    }
  }

  PB.Progression = { PLAYER_MAX: PLAYER_MAX, ASSIST_WINDOW: ASSIST_WINDOW, playerXpToNext: playerXpToNext, playerStats: playerStats,
                     addPlayerXp: addPlayerXp, applyPlayerLevel: applyPlayerLevel, onHit: onHit, onKill: onKill, grant: grant, scars: scars };
})(globalThis.PB = globalThis.PB || {});
