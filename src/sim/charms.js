// The charm board and the Read. Magic and better gear drops unread: the beam shows the color,
// and the name waits. A tome reads one. Camp reads the bag for free.
// Grove Charms and Moon Charms are not worn in the two charm slots. They sit on an eight-cell board
// and their stats count in the fight. A Moon Charm adds one rank to a skill you have already taken.
// Synergies stay on the points you spent. Rolls use world.rng.charm, so the loot stream does not move.
(function (PB) {
  'use strict';
  var SLOTS = 8, TOME_CAP = 20;
  var RANK = { unique: 5, set: 4, rare: 3, magic: 2, common: 1 };
  var HELP = 'Magic and better drops unread. The beam is the color, and the name waits. N spends a tome to read the best one in the bag. Camp reads everything for free. Grove Charms and Moon Charms go on the board in the inventory, eight cells, and they count while you fight. A Moon Charm takes two cells and adds one rank to a skill you have already taken. The points you spent still decide the synergies.';

  function skillers(classId) {
    classId = classId || 'druid';
    var out = [];
    PB.SKILLS.forEach(function (s) {
      if ((s.cls || 'druid') === classId && s.max >= 2) out.push(s);
    });
    return out;
  }

  function roll(rng, ilvl, save, grand) {
    var pool = skillers(save && save.player && save.player.classId);
    if (grand && (ilvl < 6 || !pool.length)) grand = false;
    var base = PB.BASE_BY_ID[grand ? 'mooncharm' : 'grovecharm'];
    var rarity = rng.chance(grand ? 0.45 : 0.28) ? 'rare' : 'magic';
    var count = grand ? (rarity === 'rare' ? [1, 1] : [0, 1]) : (rarity === 'rare' ? [2, 2] : [1, 1]);
    var affixes = PB.Loot.rollAffixes(rng, base, rarity, Math.max(1, ilvl), count);
    var skill = grand ? rng.pick(pool).id : null;
    var name;
    if (rarity === 'rare') name = (skill ? PB.SKILL_BY_ID[skill].name + ' ' : '') + PB.Loot.rareName(rng, base);
    else {
      var suf = affixes[0];
      name = (skill ? PB.SKILL_BY_ID[skill].name + ' ' : '') + base.name + (suf ? ' ' + PB.AFFIX_BY_ID[suf.id].name : '');
    }
    return {
      uid: save.nextItemId++, base: base.id, slot: 'board', span: base.span, rarity: rarity, ilvl: ilvl,
      affixes: affixes, sockets: [], unique: null, set: null, skill: skill, name: name, unread: true, at: null
    };
  }

  // Bosses always leave a charm. Elites, champions and the quarry sometimes do. Trash does not.
  function onKill(world, def, o, ilvl) {
    var rng = world.rng && world.rng.charm;
    if (!rng || !world.save || !o) return;
    var quarry = !!(world.dir && PB.Waves && PB.Waves.isQuarry(world.dir, def.type));
    var drop = false, grand = false;
    if (o.boss) { drop = true; grand = ilvl >= 6 && rng.chance(0.5); }
    else if (o.elite) { drop = rng.chance(o.terror ? 0.3 : 0.2); grand = drop && ilvl >= 8 && rng.chance(0.25); }
    else if (o.champion || quarry) drop = rng.chance(quarry ? 0.14 : 0.1);
    if (drop) PB.Drops.place(world, def.x - 20, def.y + 14, { item: roll(rng, ilvl, world.save, grand) });
    var tomes = 0;
    if (o.boss) tomes = 1 + (rng.chance(0.65) ? 1 : 0);
    else if (o.elite && rng.chance(0.4)) tomes = 1;
    else if ((o.champion || quarry) && rng.chance(0.2)) tomes = 1;
    for (var t = 0; t < tomes; t++) PB.Drops.place(world, def.x + 16 + t * 14, def.y - 16, { tome: 1 });
  }

  function layout(save) {
    var cells = [];
    for (var i = 0; i < SLOTS; i++) cells.push(null);
    (save && save.board || []).forEach(function (it) {
      if (!it || it.at == null) return;
      for (var k = 0; k < (it.span || 1); k++) cells[it.at + k] = it.uid;
    });
    return cells;
  }

  function findAt(board, span) {
    var cells = layout({ board: board }), i, k, ok;
    for (i = 0; i <= SLOTS - span; i++) {
      ok = true;
      for (k = 0; k < span; k++) if (cells[i + k]) ok = false;
      if (ok) return i;
    }
    return -1;
  }

  function free(save) {
    var n = SLOTS;
    (save && save.board || []).forEach(function (it) { n -= it.span || 1; });
    return n;
  }

  function find(save, uid) {
    var i;
    if (!save) return null;
    for (i = 0; i < save.inventory.length; i++) if (save.inventory[i].uid === uid) return save.inventory[i];
    var board = save.board || [];
    for (i = 0; i < board.length; i++) if (board[i].uid === uid) return board[i];
    return null;
  }

  function place(save, uid) {
    var it = null, i, atIndex = -1;
    for (i = 0; i < save.inventory.length; i++) if (save.inventory[i].uid === uid) { it = save.inventory[i]; atIndex = i; break; }
    if (!it) return { ok: false, reason: 'missing' };
    if (it.slot !== 'board') return { ok: false, reason: 'slot' };
    if (!save.board) save.board = [];
    var span = it.span || (PB.BASE_BY_ID[it.base] && PB.BASE_BY_ID[it.base].span) || 1;
    var at = findAt(save.board, span);
    if (at < 0) return { ok: false, reason: 'fit' };
    save.inventory.splice(atIndex, 1);
    it.at = at;
    it.span = span;
    save.board.push(it);
    return { ok: true, at: at };
  }

  function takeOff(save, uid) {
    if (!save.board) return { ok: false, reason: 'missing' };
    if (PB.Drops.bagCount(save) >= PB.Drops.BAG_MAX) return { ok: false, reason: 'bag' };
    for (var i = 0; i < save.board.length; i++) {
      if (save.board[i].uid !== uid) continue;
      var it = save.board.splice(i, 1)[0];
      it.at = null;
      save.inventory.push(it);
      return { ok: true, item: it };
    }
    return { ok: false, reason: 'missing' };
  }

  function reveal(save, it) {
    it.unread = false;
    if (it.unique && save.codex && save.codex.uniques) save.codex.uniques[it.unique] = true;
    it.upgrade = PB.Loot.isUpgrade(save, it);
  }

  function unreadList(save) {
    return (save.inventory || []).concat(save.board || []).filter(function (it) { return it && it.unread; });
  }

  function readOne(save) {
    if ((save.tomes || 0) < 1) return { ok: false, reason: 'tome' };
    var list = unreadList(save);
    if (!list.length) return { ok: false, reason: 'none' };
    list.sort(function (a, b) { return (RANK[b.rarity] || 0) - (RANK[a.rarity] || 0) || b.uid - a.uid; });
    save.tomes -= 1;
    reveal(save, list[0]);
    return { ok: true, item: list[0], name: list[0].name };
  }

  function readAll(save) {
    var list = unreadList(save).concat((save.stash || []).filter(function (it) { return it && it.unread; })), i;
    for (i = 0; i < list.length; i++) reveal(save, list[i]);
    return list.length;
  }

  // +1 only counts once the skill has a point, and only for this calling.
  function bonus(save) {
    var out = {};
    if (!save || !save.player) return out;
    var cls = save.player.classId || 'druid', skills = save.player.skills || {};
    (save.board || []).forEach(function (it) {
      if (!it || it.unread || !it.skill) return;
      var node = PB.SKILL_BY_ID[it.skill];
      if (!node || (node.cls || 'druid') !== cls) return;
      if (!(skills[it.skill] > 0)) return;
      out[it.skill] = (out[it.skill] || 0) + 1;
    });
    return out;
  }

  function isUpgrade(save, item) {
    if (!save || !item || item.slot !== 'board' || item.unread) return false;
    var span = item.span || 1;
    var board = (save.board || []).filter(function (it) { return it.uid !== item.uid; });
    if (findAt(board, span) >= 0) return true;
    var worst = null;
    board.forEach(function (it) {
      if (!worst || PB.Loot.score(it) < PB.Loot.score(worst)) worst = it;
    });
    return !!worst && PB.Loot.score(item) > PB.Loot.score(worst);
  }

  function hudLine(world) {
    var save = world && world.save;
    if (!save) return '';
    var parts = [], b = bonus(save), ids = Object.keys(b).sort();
    for (var i = 0; i < ids.length && i < 3; i++) {
      var node = PB.SKILL_BY_ID[ids[i]];
      if (node) parts.push(node.name + ' +' + b[ids[i]]);
    }
    if (ids.length > 3) parts.push('+' + (ids.length - 3) + ' more');
    var unread = unreadList(save).length;
    if (unread) {
      var key = PB.Input && PB.Input.keyOf ? (PB.Input.keyOf('read') || 'N') : 'N';
      parts.push(unread + ' unread (' + key + ')');
    }
    if ((save.tomes || 0) > 0) parts.push('Tomes ' + save.tomes);
    return parts.join(' · ');
  }

  PB.Charms = {
    SLOTS: SLOTS, TOME_CAP: TOME_CAP, HELP: HELP,
    roll: roll, onKill: onKill, layout: layout, findAt: findAt, free: free, find: find,
    place: place, takeOff: takeOff, readOne: readOne, readAll: readAll, bonus: bonus,
    isUpgrade: isUpgrade, hudLine: hudLine, skillers: skillers
  };
})(globalThis.PB = globalThis.PB || {});
