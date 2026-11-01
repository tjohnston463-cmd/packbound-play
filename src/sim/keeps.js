// A boss's keep. The first prize from that boss is promised until you pick it up. Later kills
// leave one about a third of the time. Rolls use world.rng.keep, so the loot stream does not move.
// The flag is set on pickup, not on the drop: a death before you touch it does not spend the promise.
(function (PB) {
  'use strict';
  var REPEAT = 0.35;

  function byId(id) {
    var list = PB.UNIQUES, i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function eligible(save, bossId) {
    var row = PB.KEEPS[bossId], cls, out = [], i, u;
    if (!row) return [];
    cls = save && save.player && save.player.classId || 'druid';
    for (i = 0; i < row.length; i++) {
      u = byId(row[i]);
      if (u && (!u.cls || u.cls === cls)) out.push(row[i]);
    }
    return out;
  }

  function owns(save, id) {
    var lists = [save.inventory, save.board, save.stash], n, i;
    for (n = 0; n < lists.length; n++) {
      var list = lists[n];
      if (!list) continue;
      for (i = 0; i < list.length; i++) if (list[i] && list[i].unique === id) return true;
    }
    return !!(save.codex && save.codex.uniques && save.codex.uniques[id]);
  }

  function make(save, id) {
    var u = byId(id), b = u && PB.BASE_BY_ID[u.base];
    if (!u || !b) return null;
    return {
      uid: save.nextItemId++, base: b.id, slot: b.slot, rarity: 'unique', ilvl: u.ilvl,
      affixes: [], sockets: [], unique: id, set: null, name: u.name, unread: true
    };
  }

  function label(id) {
    var u = byId(id);
    if (!u) return id;
    return u.name.replace(/^The /, '');
  }

  function join(names) {
    if (names.length <= 1) return names[0] || '';
    return names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];
  }

  function blurb(bossId, save) {
    var pool = eligible(save, bossId), boss = (PB.BOSSES[bossId] || {}).name || 'The boss';
    if (!pool.length) return '';
    return boss + ' keeps ' + join(pool.map(label)) + '.';
  }

  function short(bossId, save) {
    var pool = eligible(save, bossId);
    if (!pool.length) return '';
    return 'Keeps ' + pool.map(label).join(' · ');
  }

  function onKill(world, def) {
    var save = world.save, id, pool, first, rng, fresh, i, chosen, item;
    if (!save || !def || !def.boss || def.noLoot || !world.rng || !world.rng.keep) return null;
    id = def.type;
    pool = eligible(save, id);
    if (!pool.length) return null;
    if (!save.keeps) save.keeps = {};
    first = !save.keeps[id];
    rng = world.rng.keep;
    if (!first && !rng.chance(REPEAT)) return null;
    fresh = [];
    for (i = 0; i < pool.length; i++) if (!owns(save, pool[i])) fresh.push(pool[i]);
    chosen = rng.pick(fresh.length ? fresh : pool);
    item = make(save, chosen);
    if (!item) return null;
    PB.Drops.place(world, def.x, def.y - 22, { item: item, keep: true, keepBoss: id });
    PB.Events.emit(world.events, 'keep', { boss: id, bossName: (PB.BOSSES[id] || {}).name || id, x: def.x, y: def.y - 22 });
    return item;
  }

  // Called from Drops.take once the piece is in the bag. Leaving it on the ground does not spend the promise.
  function claim(save, bossId) {
    if (!save || !bossId || !PB.KEEPS[bossId]) return;
    if (!save.keeps) save.keeps = {};
    save.keeps[bossId] = 1;
  }

  PB.Keeps = {
    REPEAT: REPEAT, eligible: eligible, owns: owns, make: make, blurb: blurb, short: short,
    onKill: onKill, claim: claim,
    HELP: 'Each boss keeps a list of named prizes. The right side of the boss bar names them. The first one you pick up from that boss was promised. After that, about a third of the kills still leave one. Dying before you touch it does not spend the promise.'
  };
})(globalThis.PB = globalThis.PB || {});
