// The hearth belt. Life flasks, spirit flasks and Moonflasks are not bag items.
// They stack in three columns. A heavy hit staggers the hunter. Drinking ends the stagger.
// Rolls use world.rng.flask only, so item drops stay on the loot stream.
(function (PB) {
  'use strict';
  var CAP = { life: 8, spirit: 8, moon: 4 };
  var HEAL = { life: 0.34, spirit: 0.4 };
  var MIN = { life: 22, spirit: 16 };
  var COST = { life: 1, spirit: 1, moon: 4 };
  var PACK = { life: 2, spirit: 2, moon: 1 };
  var DROP_N = 0.16, DROP_Q = 0.34, DROP_E = 0.5, MOON_E = 0.1, MOON_Q = 0.06, FARM = 1.25;
  var REEL_S = 0.32, REEL_AT = 0.08, REEL_SLOW = 0.45;
  var PRESS = { sipLife: 'life', sipSpirit: 'spirit', sipMoon: 'moon' };

  function starter() { return { life: 2, spirit: 2, moon: 0 }; }
  function of(save) {
    if (!save.belt) save.belt = starter();
    return save.belt;
  }
  function room(save, kind) { return Math.max(0, (CAP[kind] || 0) - ((of(save)[kind]) || 0)); }

  function label(save, kind) {
    if (kind === 'moon') return 'Moonflask';
    if (kind === 'life') return 'Life flask';
    var res = PB.Classes && save ? (PB.Classes.of(save).resource || 'Spirit') : 'Spirit';
    return res + ' flask';
  }

  function healAmount(p, kind) {
    var max = kind === 'life' ? p.maxHp : p.maxSpirit;
    return Math.max(MIN[kind] || 0, max * (HEAL[kind] || 0));
  }

  function full(p, kind) {
    if (kind === 'moon') return p.hp >= p.maxHp - 0.5 && p.spirit >= p.maxSpirit - 0.5;
    if (kind === 'spirit') return p.spirit >= p.maxSpirit - 0.5;
    return p.hp >= p.maxHp - 0.5;
  }

  // One press, one flask. A full bar does not spend it. A drink stands you back up from a stagger.
  function sip(world, kind) {
    var save = world.save, p = world.player;
    if (!save || !p || p.hp <= 0 || !CAP[kind]) return { ok: false, reason: 'down' };
    var b = of(save);
    if ((b[kind] || 0) <= 0) {
      PB.Events.emit(world.events, 'sip-fail', { kind: kind, reason: 'empty', x: p.x, y: p.y });
      return { ok: false, reason: 'empty' };
    }
    if (full(p, kind)) {
      PB.Events.emit(world.events, 'sip-fail', { kind: kind, reason: 'full', x: p.x, y: p.y });
      return { ok: false, reason: 'full' };
    }
    var beforeH = p.hp, beforeS = p.spirit;
    if (kind === 'moon') { p.hp = p.maxHp; p.spirit = p.maxSpirit; }
    else if (kind === 'spirit') p.spirit = Math.min(p.maxSpirit, p.spirit + healAmount(p, 'spirit'));
    else p.hp = Math.min(p.maxHp, p.hp + healAmount(p, 'life'));
    b[kind]--;
    p.reelT = 0;
    PB.Events.emit(world.events, 'sip', { kind: kind, x: p.x, y: p.y, hp: p.hp - beforeH, spirit: p.spirit - beforeS });
    return { ok: true, kind: kind, hp: p.hp - beforeH, spirit: p.spirit - beforeS };
  }

  function readPress(world, input) {
    var pressed = (input && input.pressed) || [], i, kind;
    for (i = 0; i < pressed.length; i++) {
      kind = PRESS[pressed[i]];
      if (kind) sip(world, kind);
    }
  }

  function buy(save, kind) {
    if (!CAP[kind]) return { ok: false, reason: 'kind' };
    if (room(save, kind) <= 0) return { ok: false, reason: 'full' };
    var cost = COST[kind];
    if ((save.currency.dust || 0) < cost) return { ok: false, reason: 'dust', cost: cost };
    var add = Math.min(room(save, kind), PACK[kind]);
    save.currency.dust -= cost;
    of(save)[kind] += add;
    return { ok: true, kind: kind, n: add, cost: cost };
  }

  function dropAt(world, def, kind, i) {
    var ang = i * 1.3;
    PB.Drops.place(world, def.x + Math.cos(ang) * (16 + i * 8), def.y + Math.sin(ang) * (16 + i * 8), { flask: kind });
  }

  // Trash, the quarry, elites, then a boss's fixed gift. Boss flasks do not roll, so a boss kill does not move this stream.
  function onKill(world, def, o) {
    var save = world.save;
    if (!save || !def || def.kind !== 'enemy' || def.noLoot) return;
    o = o || {};
    if (o.boss) {
      dropAt(world, def, 'life', 0);
      dropAt(world, def, 'life', 1);
      dropAt(world, def, 'spirit', 2);
      dropAt(world, def, 'moon', 3);
      return;
    }
    var rng = world.rng.flask;
    if (!rng) return;
    var quarry = !!(world.dir && PB.Waves.isQuarry(world.dir, def.type));
    var p = quarry ? DROP_Q : DROP_N;
    if (o.elite) p = DROP_E;
    if (o.farm) p = Math.min(0.9, p * FARM);
    var n = 0;
    if (rng.chance(p)) { dropAt(world, def, rng.chance(0.68) ? 'life' : 'spirit', 0); n = 1; }
    var moonP = o.elite ? MOON_E : quarry ? MOON_Q : 0;
    if (moonP && rng.chance(o.farm ? Math.min(0.5, moonP * FARM) : moonP)) dropAt(world, def, 'moon', n);
  }

  // Onto the column. False when that column is full: the beam stays on the ground.
  function take(world, d) {
    var save = world.save, kind = d.flask;
    if (!save || !CAP[kind]) return false;
    if (room(save, kind) <= 0) return false;
    of(save)[kind]++;
    PB.Events.emit(world.events, 'pickup', { id: d.id, flask: kind, name: label(save, kind), rarity: 'flask-' + kind, n: of(save)[kind], x: d.x, y: d.y });
    return true;
  }

  // A hit that takes a real bite of life (not a nick, not a dot) staggers movement until a drink.
  function reel(world, def, amount) {
    if (!def || def.kind !== 'player' || !(amount > 0) || def.maxHp >= 1e8 || def.maxHp <= 0) return;
    if (amount >= def.maxHp * REEL_AT) def.reelT = Math.max(def.reelT || 0, REEL_S);
  }

  PB.Belt = {
    CAP: CAP, HEAL: HEAL, MIN: MIN, COST: COST, PACK: PACK, DROP_N: DROP_N, DROP_Q: DROP_Q, DROP_E: DROP_E,
    REEL_S: REEL_S, REEL_AT: REEL_AT, REEL_SLOW: REEL_SLOW,
    starter: starter, of: of, room: room, label: label, healAmount: healAmount, sip: sip, readPress: readPress,
    buy: buy, onKill: onKill, take: take, reel: reel
  };
})(globalThis.PB = globalThis.PB || {});
