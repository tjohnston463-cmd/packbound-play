// Inventory (I; spec §16): a paper doll with the 6 equip slots, the 10x4 bag and item tooltips. Behavior affixes are
// green sentences about the pack, stat affixes blue; hovering a bag item compares it with what is equipped there.
// A click equips (Camp.equip), a click on a slot unequips (Camp.unequip). At camp, Shift-click or the anvil renders an
// item into Dust (Camp.render). In the field the game keeps running underneath, except in a Lull, and Shift-click or the
// Drop button puts an item on the ground at the druid's feet (Drops.discard; walk off and back to pick it up again).
(function (PB) {
  'use strict';
  var LW = 1280, PX = 120, PY = 70, PW = 1040, PH = 580, CELL = 54, COLS = 10, ROWS = 4;
  var S = { pause: false, anvil: false, drop: false, whet: false };
  var SLOT_POS = { mask: [150, 70], staff: [40, 170], pelt: [150, 170], talisman: [260, 170], charm1: [95, 280], charm2: [205, 280] };
  var SLOT_NAME = { staff: 'Staff', mask: 'Mask', pelt: 'Pelt', talisman: 'Talisman', charm1: 'Charm', charm2: 'Charm' };
  var STAT_TEXT = { thornDmg: 'Attack +{v} damage', spiritMax: '+{v} max Spirit', armor: '+{v} armor', packHp: '+{v}% summon life',
                    wolfDmg: '+{v}% wolf damage', ravenDmg: '+{v}% raven damage', vineDmg: '+{v}% vine damage',
                    zealDmg: 'Zeal +{v} damage', zealLeech: 'Zeal returns {v} life',
                    furyDmg: 'Lightning Fury +{v} damage', furyLeech: 'Lightning Fury returns {v} life',
                    whirlDmg: 'Whirlwind +{v} damage', whirlLeech: 'Whirlwind returns {v} life',
                    spearDmg: 'Bone Spear +{v} damage' };

  function rarityColor(r) { for (var i = 0; i < PB.RARITIES.length; i++) if (PB.RARITIES[i].id === r) return PB.RARITIES[i].color; return '#d8d8d8'; }
  function baseOf(item) { for (var i = 0; i < PB.ITEM_BASES.length; i++) if (PB.ITEM_BASES[i].id === item.base) return PB.ITEM_BASES[i]; return null; }
  function uniqueOf(item) { for (var i = 0; i < PB.UNIQUES.length; i++) if (PB.UNIQUES[i].id === item.unique) return PB.UNIQUES[i]; return null; }

  // Tooltip lines for one item.
  function itemLines(item, save) {
    var C = PB.UI.C, b = baseOf(item), u = uniqueOf(item), word = PB.Runes && PB.Runes.wordOn(item);
    var out = [{ text: word ? word.name : item.name, color: word ? '#e2b84a' : rarityColor(item.rarity) }];
    if (word) out.push({ text: item.name, color: rarityColor(item.rarity) });
    out.push({ text: (b ? b.name : item.base) + ' · ' + item.slot + ' · ' + item.rarity + ' · item level ' + item.ilvl, color: C.dim });
    if (b && b.implicit) for (var k in b.implicit) {
      var impl = (STAT_TEXT[k] || k + ' +{v}').replace('{v}', b.implicit[k]);
      if (k === 'thornDmg') {
        var lash = Math.min(5, Math.floor(b.implicit[k] / 4));
        if (lash) impl += ' · step ' + lash;
      }
      out.push({ text: impl, color: '#c8c8c8' });
    }
    if (u) out.push({ text: u.text, color: C.ember });
    if (word) out.push({ text: word.text, color: '#e2b84a' });
    else if (item.sockets && item.sockets.length) out.push({ text: 'Sockets: ' + item.sockets.map(function (id) { return PB.RUNE_BY_ID[id] ? PB.RUNE_BY_ID[id].name : id; }).join(', '), color: '#7dcca0' });
    out.push({ text: 'Renders for ' + (PB.Camp.DUST[item.rarity] || 1) + ' Dust', color: C.dim });
    item.affixes.forEach(function (a) {
      var def = PB.AFFIX_BY_ID[a.id];
      if (def) {
        var line = def.text.replace('{v}', a.value);
        if (def.stat === 'packAtkSpd') {
          var bp = PB.Behaviors.atkBreakpoint(a.value);
          line += bp ? ' · haste step ' + bp + '%' : ' · below the first haste step';
        }
        out.push({ text: line, color: def.kind === 'behavior' ? C.green : C.blue });
      }
    });
    if (item.set && PB.Sets) {
      var prev = PB.Sets.preview(item, save);
      if (prev) prev.forEach(function (ln) { out.push({ text: ln.text, color: ln.on ? '#6dbe6a' : C.dim }); });
    }
    return out;
  }

  function bag(save) {
    var eq = {};
    PB.Save.SLOTS.forEach(function (k) { if (save.equipped[k] != null) eq[save.equipped[k]] = true; });
    return save.inventory.filter(function (it) { return !eq[it.uid]; });
  }

  function icon(g, item, x, y, size) {
    var col = rarityColor(item.rarity), cx = x + size / 2, cy = y + size / 2, k = size / 54;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 3, y + 3, size - 6, size - 6);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3 * k; g.lineCap = 'round';
    g.beginPath();
    if (item.slot === 'staff') { g.moveTo(cx - 12 * k, cy + 16 * k); g.lineTo(cx + 10 * k, cy - 14 * k); g.stroke(); g.beginPath(); g.arc(cx + 11 * k, cy - 15 * k, 5 * k, 0, 6.29); g.fill(); }
    else if (item.slot === 'mask') { g.ellipse(cx, cy, 12 * k, 15 * k, 0, 0, 6.29); g.stroke(); g.beginPath(); g.arc(cx - 5 * k, cy - 3 * k, 2.5 * k, 0, 6.29); g.arc(cx + 5 * k, cy - 3 * k, 2.5 * k, 0, 6.29); g.fill(); }
    else if (item.slot === 'pelt') { g.moveTo(cx - 14 * k, cy - 12 * k); g.lineTo(cx + 14 * k, cy - 12 * k); g.lineTo(cx + 10 * k, cy + 14 * k); g.lineTo(cx - 10 * k, cy + 14 * k); g.closePath(); g.stroke(); }
    else if (item.slot === 'talisman') { g.arc(cx, cy + 3 * k, 10 * k, 0, 6.29); g.stroke(); g.beginPath(); g.moveTo(cx - 8 * k, cy - 16 * k); g.lineTo(cx, cy - 7 * k); g.lineTo(cx + 8 * k, cy - 16 * k); g.stroke(); }
    else { g.moveTo(cx, cy - 13 * k); g.lineTo(cx + 9 * k, cy); g.lineTo(cx, cy + 13 * k); g.lineTo(cx - 9 * k, cy); g.closePath(); g.fill(); }
    if (item.set || item.unique || (item.affixes && item.affixes.some(function (a) { return PB.AFFIX_BY_ID[a.id] && PB.AFFIX_BY_ID[a.id].kind === 'behavior'; }))) {
      g.fillStyle = PB.UI.C.green; g.beginPath(); g.arc(x + size - 9, y + 9, 3.5, 0, 6.29); g.fill(); // it changes behavior
    }
  }

  function drop(G, item) {
    var d = G.world && PB.Drops.discard(G.world, item.uid);
    if (!d) return false;
    if (G.run) G.run.loot = G.run.loot.filter(function (x) { return x.uid !== item.uid; }); // not loot this zone gave after all
    PB.Game.toast('Dropped ' + item.name);
    PB.Game.afterSaveChange();
    return true;
  }

  function equip(G, item) {
    var before = PB.Sets.counts(PB.Mods.equipped(G.save));
    var r = PB.Camp.equip(G.save, item.uid);
    if (!r.ok) return r;
    var msg = PB.Sets.announce(before, PB.Sets.counts(PB.Mods.equipped(G.save)));
    if (msg) PB.Game.toast(msg);
    PB.Game.afterSaveChange();
    return r;
  }

  // The equipped slot a bag item is compared with: its own slot; for a charm, the slot a click fills (Camp.charmSlot),
  // or none when no charm is worn.
  function compareSlot(save, it) {
    if (it.slot !== 'charm') return it.slot;
    if (save.equipped.charm1 == null && save.equipped.charm2 == null) return null;
    return PB.Camp.charmSlot(save);
  }

  function draw(g, G) {
    var UI = PB.UI, C = UI.C, save = G.save, inCamp = !G.world;
    if (!G.world || S.pause) UI.dim(g, 0.7); else UI.dim(g, 0.35);
    UI.panel(g, PX, PY, PW, PH, { title: 'Inventory' + (G.world && !S.pause ? ' — the hunt goes on!' : '') });
    var dx = PX + 30, dy = PY + 50;
    UI.text(g, 'Equipped', dx + 150, dy + 20, UI.font(14, true), C.gold, 'center');
    PB.Save.SLOTS.forEach(function (slot) {
      var pos = SLOT_POS[slot], r = { x: dx + pos[0] - 32 + 20, y: dy + pos[1] - 10, w: 64, h: 64 }, uid = save.equipped[slot];
      var it = uid == null ? null : PB.Camp.findItem(save, uid), hot = UI.hover(r);
      UI.roundRect(g, r.x, r.y, r.w, r.h, 6); g.fillStyle = hot ? 'rgba(50,60,46,0.95)' : 'rgba(20,24,20,0.95)'; g.fill();
      g.strokeStyle = it ? rarityColor(it.rarity) : 'rgba(176,142,84,0.4)'; g.lineWidth = 1.5; g.stroke();
      if (it) icon(g, it, r.x + 5, r.y + 5, 54); else UI.text(g, SLOT_NAME[slot], r.x + r.w / 2, r.y + 25, UI.font(11), C.faint, 'center');
      if (hot && it) UI.setTip(itemLines(it, save).concat([{ text: 'Click to unequip', color: C.dim }]), r.x + r.w / 2, r.y - 4);
      if (UI.hotspot('slot-' + slot, r) && it) { PB.Camp.unequip(save, slot); PB.Game.afterSaveChange(); }
    });
    var cur = save.currency;
    UI.text(g, 'Moonstones ' + cur.moonstones + '   Dust ' + cur.dust + ' / 10', dx + 150, dy + 380, UI.font(14), C.moon, 'center');
    UI.text(g, 'Green dot: changes how the pack acts', dx + 150, dy + 402, UI.font(12), C.green, 'center');
    if (inCamp) {
      if (UI.button(g, 'anvil', { x: dx + 20, y: dy + 430, w: 150, h: 36 }, S.anvil ? 'Anvil: click to Render' : 'Anvil (Render)', { active: S.anvil, sub: S.anvil ? '' : 'or Shift-click' })) { S.anvil = !S.anvil; if (S.anvil) S.whet = false; }
      if (UI.button(g, 'whet', { x: dx + 180, y: dy + 430, w: 150, h: 36 }, S.whet ? 'Whet: click an item' : 'Whetstone', { active: S.whet, sub: S.whet ? '' : (cur.dust || 0) + ' Dust' })) { S.whet = !S.whet; if (S.whet) S.anvil = false; }
      if (UI.button(g, 'wear', { x: dx + 340, y: dy + 430, w: 150, h: 36 }, 'Wear upgrades', { sub: 'bag to body' })) {
        var wrn = PB.Camp.wearUpgrades(save);
        PB.Game.toast(wrn.ok ? 'Wore ' + wrn.n + ' upgrade' + (wrn.n === 1 ? '' : 's') : 'Nothing in the bag is better');
        if (wrn.ok) PB.Game.afterSaveChange();
      }
    } else if (UI.button(g, 'drop', { x: dx + 60, y: dy + 430, w: 180, h: 36 }, S.drop ? 'Drop: click an item' : 'Drop on the ground', { active: S.drop, sub: S.drop ? '' : 'or Shift-click an item' })) S.drop = !S.drop;

    var items = bag(save), gx = PX + 420, gy = PY + 70;
    UI.text(g, 'Bag ' + items.length + ' / ' + PB.Drops.BAG_MAX, gx, gy - 22, UI.font(14, true), C.gold);
    for (var i = 0; i < COLS * ROWS; i++) {
      var cx = gx + (i % COLS) * (CELL + 4), cy = gy + Math.floor(i / COLS) * (CELL + 4), cell = { x: cx, y: cy, w: CELL, h: CELL }, it2 = items[i];
      var hot2 = UI.hover(cell);
      g.fillStyle = hot2 ? 'rgba(50,60,46,0.95)' : 'rgba(18,22,18,0.95)'; g.fillRect(cx, cy, CELL, CELL);
      g.strokeStyle = it2 ? rarityColor(it2.rarity) : 'rgba(176,142,84,0.25)'; g.lineWidth = 1; g.strokeRect(cx + 0.5, cy + 0.5, CELL - 1, CELL - 1);
      if (!it2) continue;
      icon(g, it2, cx, cy, CELL);
      if (hot2) {
        var lines = itemLines(it2, save), slot = compareSlot(save, it2), eq = slot && save.equipped[slot] != null ? PB.Camp.findItem(save, save.equipped[slot]) : null;
        if (eq) lines = lines.concat([{ text: '— equipped now —', color: C.dim }], itemLines(eq, save).map(function (l) { return { text: l.text, color: C.dim }; }));
        lines.unshift({ text: PB.Loot.isUpgrade(save, it2) ? 'Better than what you have on' : 'Worse than what you have on', color: PB.Loot.isUpgrade(save, it2) ? C.green : C.dim });
        var hint = inCamp ? (S.whet ? 'Click: Whetstone (' + (PB.Camp.WHET[it2.rarity] || 2) + ' Dust)' : S.anvil ? 'Click: Render (' + PB.Camp.DUST[it2.rarity] + ' Dust)' : 'Click: equip · Shift-click: Render') :
          S.drop ? 'Click: drop it on the ground' : 'Click: equip · Shift-click: drop';
        lines.push({ text: hint, color: C.dim });
        UI.setTip(lines, cx + CELL / 2, cy - 4);
      }
      var c = UI.hotspot('inv-' + i, cell);
      if (!c) continue;
      if (!inCamp && (c.shift || S.drop)) drop(G, it2);
      else if (inCamp && S.whet && !c.shift) {
        var wr = PB.Camp.whet(save, it2.uid);
        if (wr.ok) { PB.Game.toast('Whetted ' + it2.name + ': ' + wr.name + ' ' + wr.value + ' (' + wr.dust + ' Dust)'); PB.Game.afterSaveChange(); }
        else UI.flashReason(wr.reason === 'dust' ? 'Not enough Dust' : wr.reason === 'maxed' ? 'Already as high as it goes' : wr.reason === 'plain' ? 'Nothing to whet' : UI.why(wr), cx + CELL / 2, cy - 6);
      }
      else if (c.shift || S.anvil) {
        var rr = PB.Camp.render(save, it2.uid);
        if (rr.ok) { PB.Game.toast('Rendered ' + it2.name + ': +' + rr.dust + ' Dust' + (rr.moonstones ? ', +' + rr.moonstones + ' Moonstone' : '')); PB.Game.afterSaveChange(); } else UI.flashReason(UI.why(rr), cx + CELL / 2, cy - 6);
      } else {
        var er = equip(G, it2);
        if (!er.ok) UI.flashReason(UI.why(er), cx + CELL / 2, cy - 6);
      }
    }
    if (UI.button(g, 'inv-close', { x: LW / 2 - 80, y: PY + PH - 50, w: 160, h: 34 }, 'Close (' + PB.Input.keyOf('inventory') + ')', { tone: 'moss' })) PB.Game.close();
  }

  PB.Screens = PB.Screens || {};
  PB.Screens.inventory = {
    pausesSim: function () { return S.pause; },
    enter: function (G) { S.pause = !!(G.world && G.world.dir && G.world.dir.state === 'lull'); S.anvil = false; S.drop = false; S.whet = false; },
    draw: draw
  };
  PB.InvUI = { compareSlot: compareSlot, itemLines: itemLines, bag: bag, icon: icon, rarityColor: rarityColor };
})(globalThis.PB = globalThis.PB || {});
