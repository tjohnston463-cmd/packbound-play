// Camp actions on the save (plan D6, spec §11.2, §12.3): Enshrine a level-20 summon as an Echo, Render items into
// Dust (10 Dust = 1 Moonstone), and equip/unequip with the slot-family check. Respec lives in Skills.respec.
// Every action returns {ok} or {ok: false, reason}; a refused action leaves the save untouched.
(function (PB) {
  'use strict';
  var ENSHRINE_LEVEL = 20, DUST = { common: 1, magic: 3, rare: 8, set: 14, unique: 20 }, DUST_PER_MOONSTONE = 10;

  function findItem(save, uid) { for (var i = 0; i < save.inventory.length; i++) if (save.inventory[i].uid === uid) return save.inventory[i]; return null; }
  function slotOf(save, uid) { for (var i = 0; i < PB.Save.SLOTS.length; i++) if (save.equipped[PB.Save.SLOTS[i]] === uid) return PB.Save.SLOTS[i]; return null; }

  // The individual leaves the roster for good and becomes an Echo: +2% pack damage (Mods) and a Wild Hunt runner.
  function enshrine(save, indId) {
    var ind = null;
    for (var i = 0; i < save.roster.length; i++) if (save.roster[i].id === indId) ind = save.roster[i];
    if (!ind) return { ok: false, reason: 'missing' };
    if (ind.level < ENSHRINE_LEVEL) return { ok: false, reason: 'level' };
    var echo = { id: ind.id, name: ind.name, type: ind.type, level: ind.level, tier: ind.tier, branch: ind.branch, infusion: ind.infusion,
                 scars: ind.scars.slice(), fusedFrom: ind.fusedFrom ? JSON.parse(JSON.stringify(ind.fusedFrom)) : null, deeds: JSON.parse(JSON.stringify(ind.deeds)) };
    save.roster = save.roster.filter(function (x) { return x.id !== indId; });
    save.echoes.push(echo);
    return { ok: true, echo: echo };
  }

  function render(save, uid) {
    var it = findItem(save, uid);
    if (!it) return { ok: false, reason: 'missing' };
    if (slotOf(save, uid)) return { ok: false, reason: 'equipped' };
    var dust = DUST[it.rarity] || 1, c = save.currency;
    save.inventory = save.inventory.filter(function (x) { return x.uid !== uid; });
    c.dust += dust;
    var stones = Math.floor(c.dust / DUST_PER_MOONSTONE);
    c.moonstones += stones; c.dust -= stones * DUST_PER_MOONSTONE;
    return { ok: true, dust: dust, moonstones: stones };
  }

  // The charm slot a click fills: the first free of charm1/charm2, else the weaker worn charm (lower item level; a tie
  // replaces charm1). The Inventory compares a bag charm against this same slot.
  function charmSlot(save) {
    var e = save.equipped, c1 = e.charm1 != null ? findItem(save, e.charm1) : null, c2 = e.charm2 != null ? findItem(save, e.charm2) : null;
    if (!c1) return 'charm1';
    if (!c2) return 'charm2';
    return c2.ilvl < c1.ilvl ? 'charm2' : 'charm1';
  }

  // slot omitted: the item's own slot, or for a charm charmSlot(save). An item already equipped elsewhere moves;
  // whatever held the slot goes back to the bag.
  function equip(save, uid, slot) {
    var it = findItem(save, uid);
    if (!it) return { ok: false, reason: 'missing' };
    if (!slot) slot = it.slot === 'charm' ? charmSlot(save) : it.slot;
    if (PB.Save.SLOTS.indexOf(slot) < 0 || PB.Loot.slotFamily(slot) !== it.slot) return { ok: false, reason: 'slot' };
    var was = slotOf(save, uid);
    if (was) save.equipped[was] = null;
    save.equipped[slot] = uid;
    return { ok: true, slot: slot };
  }

  function unequip(save, slot) {
    if (PB.Save.SLOTS.indexOf(slot) < 0) return { ok: false, reason: 'slot' };
    save.equipped[slot] = null;
    return { ok: true };
  }

  var WHET = { common: 1, magic: 2, rare: 4, unique: 8 };

  // Spend Dust to raise the next affix that is not already at its top. Click again for the one after it.
  function whet(save, uid) {
    var it = findItem(save, uid);
    if (!it) return { ok: false, reason: 'missing' };
    if (!it.affixes || !it.affixes.length) return { ok: false, reason: 'plain' };
    var cost = WHET[it.rarity] || 2;
    if ((save.currency.dust || 0) < cost) return { ok: false, reason: 'dust' };
    var best = null, n = it.affixes.length, start = it.whetIx || 0, k;
    for (k = 0; k < n; k++) {
      var ix = (start + k) % n, aff = it.affixes[ix], def = PB.AFFIX_BY_ID[aff.id];
      if (def && aff.value < def.v[1]) { best = aff; it.whetIx = (ix + 1) % n; break; }
    }
    if (!best) return { ok: false, reason: 'maxed' };
    var span = PB.AFFIX_BY_ID[best.id].v[1] - PB.AFFIX_BY_ID[best.id].v[0];
    var step = span <= 4 ? 1 : Math.max(1, Math.round(span / 5));
    best.value = Math.min(PB.AFFIX_BY_ID[best.id].v[1], best.value + step);
    save.currency.dust -= cost;
    return { ok: true, id: best.id, name: PB.AFFIX_BY_ID[best.id].name, value: best.value, dust: cost };
  }

  // Put on every bag piece that beats what that slot has now. Highest score first.
  function wearUpgrades(save) {
    var n = 0, guard = 0, i, pick;
    while (guard++ < 12) {
      pick = null;
      for (i = 0; i < save.inventory.length; i++) {
        var it = save.inventory[i];
        if (slotOf(save, it.uid)) continue;
        if (!PB.Loot.isUpgrade(save, it)) continue;
        if (!pick || PB.Loot.score(it) > PB.Loot.score(pick)) pick = it;
      }
      if (!pick) break;
      var sl = pick.slot === 'charm' ? charmSlot(save) : pick.slot;
      if (!equip(save, pick.uid, sl).ok) break;
      n++;
    }
    return { ok: n > 0, n: n };
  }

  // Dust for a roll. Never a plain piece. The level follows the deepest wood opened, and the Moon, with a small swing.
  var GAMBLE_COST = 6, GAMBLE_W = { magic: 74, rare: 20, set: 4, unique: 2 };

  function gambleBand(save) {
    var g = save.progress || {}, base = 2 + (g.unlockedZone || 0) * 3 + (g.moon || 0) * 8;
    return [Math.max(1, base - 1), base + 4];
  }

  function gamble(save) {
    if ((save.currency.dust || 0) < GAMBLE_COST) return { ok: false, reason: 'dust', cost: GAMBLE_COST };
    if (PB.Drops.bagCount(save) >= PB.Drops.BAG_MAX) return { ok: false, reason: 'bag' };
    save.gambleRolls = (save.gambleRolls || 0) + 1;
    var rng = new PB.Rng(PB.deriveSeed(save.seed >>> 0, 'gamble:' + save.gambleRolls));
    var band = gambleBand(save), ilvl = band[0] + rng.int(0, band[1] - band[0]);
    var rarity = rng.weighted(['magic', 'rare', 'set', 'unique'], function (k) { return GAMBLE_W[k]; });
    var item = PB.Loot.rollItem(rng, ilvl, rarity, save);
    if (PB.Loot.isUpgrade(save, item)) item.upgrade = true;
    save.inventory.push(item);
    save.currency.dust -= GAMBLE_COST;
    return { ok: true, item: item, cost: GAMBLE_COST, ilvl: ilvl };
  }

  PB.Camp = { enshrine: enshrine, render: render, equip: equip, unequip: unequip, charmSlot: charmSlot, findItem: findItem, slotOf: slotOf, whet: whet, wearUpgrades: wearUpgrades,
              gamble: gamble, gambleBand: gambleBand, GAMBLE_COST: GAMBLE_COST,
              ENSHRINE_LEVEL: ENSHRINE_LEVEL, DUST: DUST, WHET: WHET };
})(globalThis.PB = globalThis.PB || {});
