// The Hearth Cube (camp only). Three of a rune become the next. One rune breaks into two of the previous.
// A rune sockets into a bag or worn piece until the slot is full. Three magic items of one slot become one rare.
// A rare and a Moonstone recut that rare. The roll uses a counter on the save, never Math.random.
(function (PB) {
  'use strict';

  function pouch(save) {
    if (!save.runes) save.runes = PB.Runes.emptyPouch();
    PB.RUNES.forEach(function (r) { if (save.runes[r.id] == null) save.runes[r.id] = 0; });
    return save.runes;
  }

  function cubeRng(save) {
    save.cubeRolls = (save.cubeRolls || 0) + 1;
    return new PB.Rng((save.seed ^ Math.imul(save.cubeRolls, 0x9e3779b1) ^ Math.imul(save.nextItemId || 1, 0x85ebca6b)) >>> 0);
  }

  function upgrade(save, runeId) {
    var r = PB.RUNE_BY_ID[runeId];
    if (!r) return { ok: false, reason: 'rune' };
    var up = PB.Runes.next(runeId);
    if (!up) return { ok: false, reason: 'top' };
    var bag = pouch(save);
    if (bag[runeId] < 3) return { ok: false, reason: 'count' };
    bag[runeId] -= 3;
    bag[up] += 1;
    return { ok: true, rune: up, text: '3 ' + r.name + 's become 1 ' + PB.RUNE_BY_ID[up].name };
  }

  function shatter(save, runeId) {
    var r = PB.RUNE_BY_ID[runeId];
    if (!r) return { ok: false, reason: 'rune' };
    var down = PB.Runes.prev(runeId);
    if (!down) return { ok: false, reason: 'bottom' };
    var bag = pouch(save);
    if (bag[runeId] < 1) return { ok: false, reason: 'count' };
    bag[runeId] -= 1;
    bag[down] += 2;
    return { ok: true, rune: down, text: '1 ' + r.name + ' becomes 2 ' + PB.RUNE_BY_ID[down].name + 's' };
  }

  function socket(save, uid, runeId) {
    var it = PB.Camp.findItem(save, uid), r = PB.RUNE_BY_ID[runeId];
    if (!it) return { ok: false, reason: 'missing' };
    if (!r) return { ok: false, reason: 'rune' };
    if (it.rarity === 'set' || it.set) return { ok: false, reason: 'set' };
    var room = PB.Runes.cap(it.slot);
    if (room <= 0) return { ok: false, reason: 'slot' };
    if (!it.sockets) it.sockets = [];
    if (it.sockets.length >= room) return { ok: false, reason: 'full' };
    var bag = pouch(save);
    if (bag[runeId] < 1) return { ok: false, reason: 'count' };
    bag[runeId] -= 1;
    it.sockets.push(runeId);
    var word = PB.Runes.wordOn(it);
    return { ok: true, item: it, word: word, text: word ? word.name + ' wakes in ' + it.name : r.name + ' set in ' + it.name };
  }

  function unsocket(save, uid) {
    var it = PB.Camp.findItem(save, uid);
    if (!it) return { ok: false, reason: 'missing' };
    if (!it.sockets || !it.sockets.length) return { ok: false, reason: 'empty' };
    var id = it.sockets.pop();
    pouch(save)[id] += 1;
    return { ok: true, rune: id, item: it, text: PB.RUNE_BY_ID[id].name + ' returns to the pouch' };
  }

  function unequipped(save, slot, rarity) {
    var out = [];
    save.inventory.forEach(function (it) {
      if (it.slot !== slot || it.rarity !== rarity) return;
      if (PB.Camp.slotOf(save, it.uid)) return;
      out.push(it);
    });
    return out;
  }

  function forgeRare(save, slot) {
    if (!PB.ITEM_BASES.some(function (b) { return b.slot === slot; })) return { ok: false, reason: 'slot' };
    var group = unequipped(save, slot, 'magic');
    if (group.length < 3) return { ok: false, reason: 'count' };
    var take = group.slice(0, 3), ids = {}, ilvl = 1;
    take.forEach(function (it) { ids[it.uid] = true; if (it.ilvl > ilvl) ilvl = it.ilvl; });
    save.inventory = save.inventory.filter(function (it) { return !ids[it.uid]; });
    var made = PB.Loot.rollItem(cubeRng(save), ilvl, 'rare', save, slot);
    save.inventory.push(made);
    return { ok: true, item: made, text: 'The cube cuts a rare: ' + made.name };
  }

  function reroll(save, uid) {
    var it = PB.Camp.findItem(save, uid);
    if (!it) return { ok: false, reason: 'missing' };
    if (it.rarity !== 'rare' || it.unique) return { ok: false, reason: 'rarity' };
    if (!save.currency || save.currency.moonstones < 1) return { ok: false, reason: 'moonstone' };
    var base = PB.BASE_BY_ID[it.base];
    if (!base) return { ok: false, reason: 'missing' };
    save.currency.moonstones -= 1;
    var rng = cubeRng(save);
    it.affixes = PB.Loot.rollAffixes(rng, base, 'rare', it.ilvl);
    it.name = PB.Loot.rareName(rng, base);
    return { ok: true, item: it, text: 'The cube recuts ' + it.name };
  }

  PB.Cube = { upgrade: upgrade, shatter: shatter, socket: socket, unsocket: unsocket, forgeRare: forgeRare, reroll: reroll, pouch: pouch };
})(globalThis.PB = globalThis.PB || {});
