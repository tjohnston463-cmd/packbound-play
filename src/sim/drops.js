// Drops in the world (spec §12). A kill rolls world.rng.loot: 6% for a normal enemy, 60% for an elite (which also
// has a 10% Moonstone), 3-5 rare-or-better items plus 3 banked Moonstones for a boss. Flasks roll on world.rng.flask
// (see belt.js) and never enter the bag. A drop is a light beam on the
// ground (world.drops, hashed); the druid picks it up within 40px. The bag holds 40 unequipped items; a full bag
// leaves the drop where it lies and warns once per approach. Hoarding ravens (D2) carry drops to the druid.
// The player may drop a bag item on the ground (discard): it lies at the druid's feet, is not picked up again until
// the druid has stepped out of reach and come back, and neither ravens nor the victory loot shower fetch it.
(function (PB) {
  'use strict';
  var CHANCE = 0.06, ELITE_CHANCE = 0.6, ELITE_MOON = 0.10, BOSS_ITEMS = [3, 5], BOSS_MOON = 3, PICK_R = 40, BAG_MAX = 40, SPREAD = 36;

  function equippedSet(save) {
    var u = {};
    PB.Save.SLOTS.forEach(function (k) { if (save.equipped[k] != null) u[save.equipped[k]] = true; });
    return u;
  }
  function bagCount(save) { var u = equippedSet(save), n = 0; save.inventory.forEach(function (it) { if (!u[it.uid]) n++; }); return n; }

  function place(world, x, y, what) {
    var d = { id: world.nextDrop = (world.nextDrop || 0) + 1, x: PB.M.clamp(x, 10, world.width - 10), y: PB.M.clamp(y, 10, world.height - 10),
              item: what.item || null, moonstones: what.moonstones || 0, rune: what.rune || null, flask: what.flask || null, warned: false, carrier: 0 };
    world.drops.push(d);
    PB.Events.emit(world.events, 'drop', { id: d.id, x: d.x, y: d.y, rarity: d.flask ? 'flask-' + d.flask : d.rune ? 'rune' : d.item ? d.item.rarity : 'moonstone', rune: d.rune, flask: d.flask });
    return d;
  }

  // Elites, the wood's quarry, and bosses. Trash does not. Rolled on the loot stream after the item roll.
  function maybeRune(world, def, o, rng) {
    var quarry = !!(world.dir && PB.Waves.isQuarry(world.dir, def.type)), n = 0;
    if (o.boss) n = 1 + (rng.chance(0.45) ? 1 : 0);
    else {
      var p = 0;
      if (o.elite) p = 0.22;
      if (quarry) p = o.elite ? 0.32 : 0.14;
      if (o.farm && p) p *= 1.5;
      if (p > 0 && rng.chance(Math.min(0.85, p))) n = 1;
    }
    var ilvl = dropIlvl(world), i;
    for (i = 0; i < n; i++) place(world, def.x + 18 + i * 16, def.y - 8, { rune: PB.Runes.roll(rng, ilvl) });
  }

  function opts(world, def) {
    var save = world.save;
    var farm = !!(world.dir && world.dir.state === 'victory');
    return { magicFind: (world.mods.stats.magicFind || 0) + (farm ? 100 : 0) + PB.Shrines.magicFind(world), moon: save ? save.progress.moon : 0,
             elite: !!(def.elite && def.elite.length), boss: !!def.boss, farm: farm };
  }

  // A kill rolls the zone's item level, not the current wave's. Wave 1 can drop what the zone can drop.
  function dropIlvl(world) {
    var ilvl = world.ilvl || 1, d = world.dir;
    if (!d || d.zone == null) return ilvl;
    var area = 1 + d.zone * 3 + PB.Waves.WAVES_PER_ZONE + (d.moon || 0) * 15;
    return Math.max(ilvl, area);
  }

  function onKill(world, def) {
    var save = world.save;
    if (!save || def.kind !== 'enemy' || def.noLoot) return;
    var rng = world.rng.loot, o = opts(world, def), ilvl = dropIlvl(world), n = 0, i;
    if (o.boss) {
      n = rng.int(BOSS_ITEMS[0], BOSS_ITEMS[1]);
      save.currency.moonstones += BOSS_MOON;
      PB.Events.emit(world.events, 'moonstone', { n: BOSS_MOON, x: def.x, y: def.y });
    } else if (rng.chance((o.elite ? ELITE_CHANCE : CHANCE) * (o.farm ? 2 : 1) * ((def.lashed || 0) > 0 ? 2 : 1))) n = 1;
    if (!o.boss && world.dir && PB.Waves.isQuarry(world.dir, def.type)) {
      save.currency.dust = (save.currency.dust || 0) + 1;
      PB.Events.emit(world.events, 'dust', { n: 1, x: def.x, y: def.y });
      world.dir.qStreak = (world.dir.qStreak || 0) + 1;
      if (world.dir.qStreak >= 3) { world.dir.qStreak = 0; world.dir.qBounty = true; }
    }
    if (!o.boss && world.dir && world.dir.qBounty && PB.Waves.isQuarry(world.dir, def.type)) { world.dir.qBounty = false; if (n < 1) n = 1; }
    if (!o.boss && n === 0 && world.dir && (world.dir.moon || 0) >= 1 && PB.Waves.isQuarry(world.dir, def.type) && rng.chance(0.35)) n = 1;
    for (i = 0; i < n; i++) {
      var item = PB.Loot.rollItem(rng, ilvl, PB.Loot.rollRarity(rng, o), save), a = n > 1 ? i / n * PB.M.TAU : 0;
      if (PB.Loot.isUpgrade(save, item)) item.upgrade = true;
      place(world, def.x + (n > 1 ? Math.cos(a) * SPREAD : 0), def.y + (n > 1 ? Math.sin(a) * SPREAD : 0), { item: item });
    }
    if (o.elite && !o.boss && rng.chance(ELITE_MOON)) place(world, def.x + 14, def.y + 10, { moonstones: 1 });
    maybeRune(world, def, o, rng);
    if (world.runeGift) {
      world.runeGift = 0;
      place(world, def.x - 16, def.y - 8, { rune: PB.Runes.roll(rng, ilvl) });
    }
    if (PB.Belt) PB.Belt.onKill(world, def, o);
  }

  // Into the bag (or the purse). Returns false when the bag is full.
  function take(world, d) {
    var save = world.save;
    if (d.flask) {
      if (!PB.Belt.take(world, d)) return false;
      world.drops.splice(world.drops.indexOf(d), 1);
      return true;
    }
    if (d.rune) {
      var bag = save.runes || (save.runes = PB.Runes.emptyPouch());
      bag[d.rune] = (bag[d.rune] || 0) + 1;
      var rn = PB.RUNE_BY_ID[d.rune];
      PB.Events.emit(world.events, 'pickup', { id: d.id, rune: d.rune, name: rn ? rn.name : d.rune, rarity: 'rune', x: d.x, y: d.y });
      world.drops.splice(world.drops.indexOf(d), 1);
      return true;
    }
    if (d.moonstones) {
      save.currency.moonstones += d.moonstones;
      PB.Events.emit(world.events, 'pickup', { id: d.id, moonstones: d.moonstones, x: d.x, y: d.y });
    } else {
      if (bagCount(save) >= BAG_MAX) return false;
      save.inventory.push(d.item);
      if (d.item.unique) save.codex.uniques[d.item.unique] = true;
      PB.Events.emit(world.events, 'pickup', { id: d.id, uid: d.item.uid, rarity: d.item.rarity, name: d.item.name, upgrade: !!d.item.upgrade, x: d.x, y: d.y });
    }
    world.drops.splice(world.drops.indexOf(d), 1);
    return true;
  }

  // A bag item (not equipped) onto the ground at the druid's feet. Returns the drop, or null.
  function discard(world, uid) {
    var save = world.save, p = world.player;
    if (!save || equippedSet(save)[uid]) return null;
    for (var i = 0; i < save.inventory.length; i++) {
      if (save.inventory[i].uid !== uid) continue;
      var item = save.inventory.splice(i, 1)[0], d = place(world, p.x, p.y, { item: item });
      d.discarded = true; d.away = false;
      return d;
    }
    return null;
  }

  // Step slot 8: auto-pickup within 40px of the druid (the body, also as a Skinwalk husk).
  function tick(world) {
    var list = world.drops, p = world.player;
    if (!world.save || !list.length || p.hp <= 0) return;
    for (var i = list.length - 1; i >= 0; i--) {
      var d = list[i], dx = d.x - p.x, dy = d.y - p.y, inR = dx * dx + dy * dy <= PICK_R * PICK_R;
      if (!inR) { d.warned = false; if (d.discarded) d.away = true; continue; }
      if (d.discarded && !d.away) continue; // just dropped: wait until the druid has left it
      if (d.item && !d.discarded && d.item.rarity === 'common' && !PB.Loot.isUpgrade(world.save, d.item)) continue; // a worse common stays where it fell
      if (take(world, d)) continue;
      if (!d.warned) { d.warned = true; PB.Events.emit(world.events, 'pickup-fail', { id: d.id, reason: d.flask ? 'belt' : 'full', x: d.x, y: d.y }); }
    }
  }

  PB.Drops = { onKill: onKill, place: place, tick: tick, take: take, discard: discard, bagCount: bagCount, dropIlvl: dropIlvl, PICK_R: PICK_R, BAG_MAX: BAG_MAX,
               CHANCE: CHANCE, ELITE_CHANCE: ELITE_CHANCE };
})(globalThis.PB = globalThis.PB || {});
