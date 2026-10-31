// The Terror is one open wood each Moon, after the first clear. It is harder and it pays.
// The bite is Crushing Blow, Deadly Strike, and leech on your own hits. Skill ranks and gear both feed it.
(function (PB) {
  'use strict';
  var HP = 1.45, DMG = 1.15, ILVL = 6, MF = 60, CHAMP_HP = 1.85, CHAMP_DMG = 1.22, CALL_COST = 4;
  var CRUSH_GAP = 0.45, BOSS_CRUSH = 0.35, CHAMP_CRUSH = 0.55, CRUSH_CAP = 0.12;

  function openCount(save) {
    if (!save || !save.progress) return 1;
    return Math.min(PB.ZONES.length, (save.progress.unlockedZone || 0) + 1);
  }

  // No Terror on a first clear. After that, the seed and the Moon pick one open wood.
  function natural(save, moon) {
    if (!save || !save.progress || !save.progress.cleared || !save.progress.cleared.length) return -1;
    var open = openCount(save);
    if (open < 1) return -1;
    return ((save.seed >>> 0) + (moon || 0) * 5) % open;
  }

  function zone(save, moon) {
    if (!save || !save.progress) return -1;
    moon = moon || 0;
    var call = save.progress.terrorCall;
    var open = openCount(save);
    if (call && call.moon === moon && call.zone >= 0 && call.zone < open && save.progress.cleared && save.progress.cleared.length) return call.zone;
    return natural(save, moon);
  }

  function active(save, zoneIdx, moon) { return zone(save, moon) === zoneIdx; }

  // Spend Dust to move the Terror to the next open wood. The call sticks for this Moon only.
  function callNext(save, moon) {
    moon = moon || 0;
    if (!save || !save.progress || !save.progress.cleared || !save.progress.cleared.length) return { ok: false, reason: 'clear' };
    var open = openCount(save);
    if (open < 2) return { ok: false, reason: 'one' };
    if ((save.currency.dust || 0) < CALL_COST) return { ok: false, reason: 'dust' };
    var cur = zone(save, moon);
    if (cur < 0) cur = 0;
    save.currency.dust -= CALL_COST;
    var next = (cur + 1) % open;
    save.progress.terrorCall = { moon: moon, zone: next };
    return { ok: true, zone: next };
  }

  // More bodies, and every fourth plain body is a champion. No RNG: the rest of the hunt stays on its old rolls.
  function thicken(list, wave) {
    if (!list || wave > PB.Waves.WAVES_PER_ZONE) return list;
    var plain = [], i;
    for (i = 0; i < list.length; i++) if (!list[i].boss && !(list[i].elite && list[i].elite.length)) plain.push(list[i]);
    if (!plain.length) return list;
    var extra = Math.max(3, Math.round(plain.length * 0.35)), last = 0, n;
    for (i = 0; i < list.length; i++) last = Math.max(last, list[i].delay || 0);
    for (n = 0; n < extra; n++) {
      var src = plain[n % plain.length], edge = (src.edge + n) % 4, at = pinEdge(edge, n);
      var delay = last <= 0.4 ? +(0.4 * (n + 1)).toFixed(3) : +((last * (n + 1) / (extra + 1)).toFixed(3));
      list.push({ enemy: src.enemy, boss: false, elite: [], delay: delay, edge: edge, champion: false, hunter: n % 3 === 0, pinned: true, x: at.x, y: at.y });
    }
    for (i = 3; i < plain.length; i += 4) plain[i].champion = true;
    list.sort(function (a, b) { return a.delay - b.delay; });
    return list;
  }

  // Fixed edge slots so the extra bodies do not pull the spawn rolls the rest of the wave was using.
  function pinEdge(edge, n) {
    var slot = n % 8, along = 220 + slot * 220;
    if (edge === 0) return { x: along, y: 20 };
    if (edge === 1) return { x: 2380, y: along };
    if (edge === 2) return { x: 2200 - slot * 220, y: 1580 };
    return { x: 20, y: 1400 - slot * 180 };
  }

  function biteLine(stats) {
    if (!stats) return '';
    var parts = [];
    if (stats.crush) parts.push('Crush ' + stats.crush + '%');
    if (stats.deadly) parts.push('Deadly ' + stats.deadly + '%');
    if (stats.lifeLeech) parts.push('Life ' + stats.lifeLeech + '%');
    if (stats.spiritLeech) parts.push('Spirit ' + stats.spiritLeech + '%');
    return parts.join(' · ');
  }

  // Your hit, after it has already reached life. Deadly doubles it. Crush chunks a tough body, once a swing.
  function bite(world, att, def, h) {
    h.crush = 0; h.deadly = false; h.leechLife = 0; h.leechSpirit = 0;
    if (!att || att.kind !== 'player' || att.team !== 0 || !def || def.team !== 1) return;
    var stats = (world.mods && world.mods.stats) || {};
    if (def.hp > 0 && (stats.deadly || 0) > 0 && h.taken > 0 && world.rng.combat.chance(Math.min(0.95, stats.deadly / 100))) {
      def.hp -= h.taken;
      h.taken += h.taken;
      h.deadly = true;
    }
    var tough = !!(def.boss || def.champion || (def.elite && def.elite.length));
    if (def.hp > 0 && tough && (stats.crush || 0) > 0 && !(def.crushT > world.time)) {
      var rate = (stats.crush / 100) * (def.boss ? BOSS_CRUSH : CHAMP_CRUSH);
      var chunk = Math.min(Math.round(def.maxHp * CRUSH_CAP), Math.round(def.hp * rate));
      if (chunk > 0) {
        def.hp -= chunk;
        h.taken += chunk;
        h.crush = chunk;
        def.crushT = world.time + CRUSH_GAP;
      }
    }
    var p = world.player;
    if (p && h.taken > 0 && p.hp > 0) {
      if ((stats.lifeLeech || 0) > 0) {
        var life = h.taken * stats.lifeLeech / 100;
        if (life >= 1) { p.hp = Math.min(p.maxHp, p.hp + life); h.leechLife = life; }
      }
      if ((stats.spiritLeech || 0) > 0) {
        var spirit = h.taken * stats.spiritLeech / 100;
        if (spirit >= 1) { p.spirit = Math.min(p.maxSpirit, p.spirit + spirit); h.leechSpirit = spirit; }
      }
    }
  }

  PB.Terror = {
    HP: HP, DMG: DMG, ILVL: ILVL, MF: MF, CHAMP_HP: CHAMP_HP, CHAMP_DMG: CHAMP_DMG, CALL_COST: CALL_COST,
    zone: zone, active: active, natural: natural, callNext: callNext, thicken: thicken, bite: bite, biteLine: biteLine
  };
})(globalThis.PB = globalThis.PB || {});
