// Loot rolls. Uses its own RNG stream (world.rng.loot) so combat randomness never shifts drops.
(function (PB) {
  'use strict';

  // Moon 0 stays the base table. Each Moon after that is a step, not a small slope, so replaying the zone pays.
  function moonLoot(moon) {
    moon = moon || 0;
    return moon <= 0 ? 1 : 1 + 2 * moon;
  }

  function rollRarity(rng, opts) {
    opts = opts || {};
    var mf = (opts.magicFind || 0) / 100, moon = opts.moon || 0, loot = moonLoot(moon);
    if (opts.boss) {
      var scale = (1 + mf) * loot;
      return rng.weighted(['rare', 'set', 'unique'], function (k) {
        if (k === 'unique') return 15 * scale;
        if (k === 'set') return 18 * scale;
        return 100;
      });
    }
    // Set weight comes out of rare. Common stays 70 and unique stays 1, so the old hunt still rains the same trash.
    var w = {
      common: 70,
      magic: 22 * (1 + mf) * (opts.elite ? 2 : 1),
      rare: 5 * (1 + mf) * loot * (opts.elite ? 3 : 1),
      set: 2 * (1 + mf) * loot * (opts.elite ? 3 : 1),
      unique: 1 * (1 + mf) * loot * (opts.elite ? 3 : 1)
    };
    return rng.weighted(['common', 'magic', 'rare', 'set', 'unique'], function (k) { return w[k]; });
  }

  function rarityDef(id) {
    for (var i = 0; i < PB.RARITIES.length; i++) if (PB.RARITIES[i].id === id) return PB.RARITIES[i];
    return null;
  }

  function affixValue(rng, affix, ilvl) {
    // Higher ilvl skews toward the top of the range: lerp floor rises with ilvl (cap at ilvl 40).
    // The roll then snaps to a step, so a better item crosses a threshold you can feel.
    var t = Math.min(1, ilvl / 40);
    var lo = affix.v[0] + (affix.v[1] - affix.v[0]) * 0.5 * t;
    var raw = Math.min(affix.v[1], Math.floor(rng.range(lo, affix.v[1] + 1)));
    var span = affix.v[1] - affix.v[0];
    if (span <= 4) return raw;
    var step = Math.max(1, Math.round(span / 5));
    var snapped = affix.v[0] + Math.round((raw - affix.v[0]) / step) * step;
    return Math.max(affix.v[0], Math.min(affix.v[1], snapped));
  }

  function slotFamily(slot) { return slot === 'charm1' || slot === 'charm2' ? 'charm' : slot; }

  function rollAffixes(rng, base, rarity, ilvl) {
    var def = rarityDef(rarity), n = rng.int(def.affixes[0], def.affixes[1]);
    var out = [], groups = {}, behaviors = 0;
    for (var tries = 0; out.length < n && tries < 40; tries++) {
      var wantBehavior = behaviors < def.maxBehavior && (out.length === 0 || rng.chance(0.4));
      var pool = PB.AFFIXES.filter(function (a) {
        return a.ilvl <= ilvl && a.slots.indexOf(base.slot) >= 0 && !groups[a.group] &&
          (wantBehavior ? a.kind === 'behavior' : a.kind === 'stat');
      });
      if (!pool.length) continue;
      var a = rng.pick(pool);
      groups[a.group] = true;
      if (a.kind === 'behavior') behaviors++;
      out.push({ id: a.id, value: affixValue(rng, a, ilvl) });
    }
    return out;
  }

  var RARE_NAMES = [['Grim', 'Moon', 'Thorn', 'Ash', 'Wolf', 'Bone', 'Storm', 'Hollow'], ['song', 'ward', 'call', 'mark', 'bite', 'shroud', 'eye', 'root']];

  function rareName(rng, base) {
    return rng.pick(RARE_NAMES[0]) + rng.pick(RARE_NAMES[1]) + ' ' + base.name;
  }

  function rollItem(rng, ilvl, rarity, uidSource, slot) {
    var item;
    if (rarity === 'set' && !slot && PB.Sets) {
      var piece = PB.Sets.pick(rng, ilvl, uidSource);
      if (piece) {
        var sb = PB.BASE_BY_ID[piece.base];
        return { uid: uidSource.nextItemId++, base: sb.id, slot: sb.slot, rarity: 'set', ilvl: ilvl, affixes: [], sockets: [], unique: null, set: piece.id, name: piece.name };
      }
      rarity = 'rare';
    }
    if (rarity === 'unique' && !slot) {
      var wearer = uidSource && uidSource.player && uidSource.player.classId;
      var uniques = PB.UNIQUES.filter(function (u) { return u.ilvl <= ilvl && (!u.cls || u.cls === wearer); });
      if (uniques.length) {
        var u = rng.pick(uniques), ub = PB.BASE_BY_ID[u.base];
        item = { uid: uidSource.nextItemId++, base: ub.id, slot: ub.slot, rarity: 'unique', ilvl: ilvl, affixes: [], sockets: [], unique: u.id, set: null, name: u.name };
        return item;
      }
      rarity = 'rare';
    }
    var bases = PB.ITEM_BASES.filter(function (b) { return b.ilvl <= ilvl && (!slot || b.slot === slot); });
    if (!bases.length) bases = PB.ITEM_BASES.filter(function (b) { return !slot || b.slot === slot; });
    var base = rng.pick(bases);
    var affixes = rollAffixes(rng, base, rarity, ilvl);
    var name = base.name;
    if (rarity === 'magic') {
      var pre = affixes.filter(function (x) { return PB.AFFIX_BY_ID[x.id].kind === 'behavior'; })[0];
      var suf = affixes.filter(function (x) { return PB.AFFIX_BY_ID[x.id].kind === 'stat'; })[0];
      name = (pre ? PB.AFFIX_BY_ID[pre.id].name + ' ' : '') + base.name + (suf ? ' ' + PB.AFFIX_BY_ID[suf.id].name : '');
    } else if (rarity === 'rare') {
      name = rareName(rng, base);
    }
    return { uid: uidSource.nextItemId++, base: base.id, slot: base.slot, rarity: rarity, ilvl: ilvl, affixes: affixes, sockets: [], unique: null, set: null, name: name };
  }

  // Sum equipped items into {stats:{key:number}, behaviors:{id:value}} for the sim.
  function aggregate(items) {
    var stats = {}, behaviors = {};
    items.forEach(function (it) {
      if (!it) return;
      var base = PB.BASE_BY_ID[it.base];
      for (var k in base.implicit) stats[k] = (stats[k] || 0) + base.implicit[k];
      it.affixes.forEach(function (x) {
        var a = PB.AFFIX_BY_ID[x.id];
        if (a.kind === 'stat') stats[a.stat] = (stats[a.stat] || 0) + x.value;
        else behaviors[a.id] = Math.max(behaviors[a.id] || 0, x.value);
      });
      if (it.unique) {
        var u = PB.UNIQUES.filter(function (q) { return q.id === it.unique; })[0];
        for (var b in u.behaviors) behaviors[b] = u.behaviors[b];
      }
      if (PB.Runes) PB.Runes.grant(it, stats, behaviors);
    });
    if (PB.Sets) PB.Sets.grant(items, stats, behaviors);
    return { stats: stats, behaviors: behaviors };
  }

  function describe(item) {
    var lines = item.affixes.map(function (x) { return PB.AFFIX_BY_ID[x.id].text.replace('{v}', x.value); });
    var word = PB.Runes && PB.Runes.wordOn(item);
    if (word) lines.push(word.name + ': ' + word.text);
    else if (item.sockets && item.sockets.length) lines.push('Sockets: ' + item.sockets.map(function (id) { return PB.RUNE_BY_ID[id].name; }).join(', '));
    if (item.set && PB.SET_PIECE_BY_ID[item.set]) lines.push(PB.SET_BY_ID[PB.SET_PIECE_BY_ID[item.set].setId].name + ': ' + PB.SET_PIECE_BY_ID[item.set].text);
    return lines;
  }

  function score(item) {
    if (!item) return 0;
    var n = item.unique ? 50 : 0, b = PB.BASE_BY_ID[item.base], k;
    if (b && b.implicit) for (k in b.implicit) n += b.implicit[k];
    (item.affixes || []).forEach(function (a) { n += a.value || 0; });
    var word = PB.Runes && PB.Runes.wordOn(item);
    if (word) {
      n += 30;
      for (k in word.stats) n += word.stats[k];
    } else if (item.sockets) item.sockets.forEach(function (id) { var r = PB.RUNE_BY_ID[id]; if (r) n += r.value; });
    if (item.set && PB.SET_PIECE_BY_ID[item.set]) {
      n += 40;
      var piece = PB.SET_PIECE_BY_ID[item.set];
      for (k in piece.stats) n += piece.stats[k];
    }
    return n;
  }

  function worn(save, slot) {
    var uid = save.equipped[slot];
    if (uid == null) return null;
    for (var i = 0; i < save.inventory.length; i++) if (save.inventory[i].uid === uid) return save.inventory[i];
    return null;
  }

  // Empty hands count as an upgrade. A charm upgrades the weaker charm, or an empty charm slot.
  function isUpgrade(save, item) {
    if (!save || !item) return false;
    var mine = score(item);
    if (item.slot === 'charm') {
      var a = worn(save, 'charm1'), b = worn(save, 'charm2');
      if (!a || !b) return true;
      return mine > Math.min(score(a), score(b));
    }
    var have = worn(save, item.slot);
    return !have || mine > score(have);
  }

  PB.Loot = { rollRarity: rollRarity, rollItem: rollItem, rollAffixes: rollAffixes, rareName: rareName, aggregate: aggregate, describe: describe, slotFamily: slotFamily, score: score, isUpgrade: isUpgrade };
})(globalThis.PB = globalThis.PB || {});
