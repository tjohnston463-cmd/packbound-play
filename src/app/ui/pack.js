// Pack (J; spec §16): the roster on the left (sort by type or level) and the chosen individual's card on the right:
// portrait at 4x, name, level and XP, tier and branch, scars with tooltips, the diet over the 5 essences with the
// projected infusion, deeds, and the Evolve buttons with both branch choices (Evolution.evolve). The sim pauses.
(function (PB) {
  'use strict';
  var LW = 1280, PX = 60, PY = 40, PW = 1160, PH = 640;
  var ESS_COLOR = { rot: '#8fae3a', ember: '#e8873a', frost: '#9fd8ff', storm: '#f5e46a', stone: '#a8a29a' };
  var ESS_TEXT = { rot: 'poison on hit', ember: 'burning hits', frost: 'chilling hits', storm: 'chain sparks', stone: '20% less damage taken' };
  var S = { sel: null, sort: 'type' };

  function typeName(ind) {
    if (PB.SUMMONS[ind.type]) return PB.SUMMONS[ind.type].name;
    return PB.Game.fusionName(ind.type);
  }
  function branchLine(ind) {
    if (ind.fusedFrom) return 'Bonded fusion of ' + ind.fusedFrom.map(function (f) { return f.name; }).join(' + ');
    var b = PB.Evolution.branchName(ind);
    return 'Tier ' + ['I', 'II', 'III'][ind.tier - 1] + (b ? ' · ' + b : '') + (ind.infusion ? ' · ' + ind.infusion + '-infused' : '');
  }

  function sorted(save) {
    var order = PB.Classes.order(save);
    return save.roster.slice().sort(function (a, b) {
      if (S.sort === 'level') return b.level - a.level || a.id - b.id;
      var ta = order.indexOf(a.type), tb = order.indexOf(b.type);
      return (ta < 0 ? 9 : ta) - (tb < 0 ? 9 : tb) || b.level - a.level || a.id - b.id;
    });
  }

  function find(save, id) { for (var i = 0; i < save.roster.length; i++) if (save.roster[i].id === id) return save.roster[i]; return null; }

  function evolve(G, ind, choice) {
    var r = PB.Evolution.evolve(ind, choice);
    if (!r.ok) return r;
    var w = G.world;
    if (w) {
      var e = PB.World.refreshIndividual(w, ind) && w.byId[w.active[ind.id]];
      PB.Events.emit(w.events, 'evolve', { indId: ind.id, tier: r.tier, name: r.name, x: e ? e.x : w.player.x, y: e ? e.y : w.player.y });
    } else PB.Game.toast(ind.name + ' evolved into a ' + r.name);
    PB.Game.afterSaveChange();
    return r;
  }

  function drawList(g, G, list) {
    var UI = PB.UI, C = UI.C, x = PX + 20, y = PY + 92;
    if (UI.button(g, 'sort-type', { x: x, y: PY + 52, w: 110, h: 26 }, 'By type', { active: S.sort === 'type', size: 12 })) S.sort = 'type';
    if (UI.button(g, 'sort-level', { x: x + 118, y: PY + 52, w: 110, h: 26 }, 'By level', { active: S.sort === 'level', size: 12 })) S.sort = 'level';
    if (!list.length) UI.text(g, 'No summons yet: they are born when you first call them in a hunt.', x, y + 10, UI.font(13), C.dim);
    list.forEach(function (ind, i) {
      var r = { x: x, y: y + i * 18, w: 330, h: 17 }, sel = ind.id === S.sel, hot = UI.hover(r);
      if (sel || hot) { g.fillStyle = sel ? 'rgba(232,135,58,0.25)' : 'rgba(176,142,84,0.15)'; g.fillRect(r.x, r.y, r.w, r.h); }
      g.fillStyle = PB.HUD.COLORS[ind.type] || C.gold; g.beginPath(); g.arc(x + 8, r.y + 8, 4, 0, 6.29); g.fill();
      UI.text(g, ind.name, x + 18, r.y + 1, UI.font(13), ind.fusedFrom ? C.gold : C.bone);
      UI.text(g, typeName(ind), x + 140, r.y + 1, UI.font(12), C.dim);
      UI.text(g, 'L' + ind.level + ' · T' + ind.tier, x + 290, r.y + 1, UI.font(12), C.dim, 'right');
      if (PB.Evolution.canEvolve(ind)) UI.text(g, '!', x + 318, r.y - 1, UI.font(15, true), C.gold);
      if (UI.hotspot('ind-' + i, r)) S.sel = ind.id;
    });
  }

  function drawCard(g, G, ind) {
    var UI = PB.UI, C = UI.C, x = PX + 380, y = PY + 56, w = PW - 400;
    UI.panel(g, x, y, w, PH - 120, { fill: 'rgba(8,11,9,0.8)' });
    g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(x + 20, y + 20, 180, 180);
    UI.sprite(g, ind.type, x + 110, y + 110, 176);
    var tx = x + 222;
    UI.text(g, ind.name, tx, y + 20, UI.font(26, true), ind.fusedFrom ? C.gold : C.bone);
    UI.text(g, typeName(ind) + ' · level ' + ind.level, tx, y + 56, UI.font(15), C.bone);
    UI.text(g, branchLine(ind), tx, y + 78, UI.font(14), C.gold);
    var need = PB.Evolution.xpToNext(ind.level), xf = ind.level >= PB.Evolution.MAX_LEVEL ? 1 : Math.min(1, ind.xp / need);
    g.fillStyle = 'rgba(40,40,30,0.9)'; g.fillRect(tx, y + 104, 260, 8); g.fillStyle = C.gold; g.fillRect(tx, y + 104, 260 * xf, 8);
    UI.text(g, ind.level >= PB.Evolution.MAX_LEVEL ? 'max level' : Math.floor(ind.xp) + ' / ' + need + ' XP', tx + 268, y + 100, UI.font(12), C.dim);
    UI.text(g, 'Scars', tx, y + 126, UI.font(13, true), C.bone);
    if (!ind.scars.length) UI.text(g, 'none yet: deeds earn them', tx + 50, y + 127, UI.font(12), C.faint);
    ind.scars.forEach(function (id, i) {
      var sc = PB.SCARS.filter(function (s) { return s.id === id; })[0], r = { x: tx + 50 + i * 120, y: y + 124, w: 112, h: 20 };
      UI.roundRect(g, r.x, r.y, r.w, r.h, 4); g.fillStyle = 'rgba(120,40,30,0.6)'; g.fill();
      UI.text(g, sc ? sc.name : id, r.x + r.w / 2, r.y + 3, UI.font(12, true), '#ffb0a0', 'center');
      if (UI.hover(r) && sc) UI.setTip([{ text: sc.name, color: C.gold }, { text: sc.text }], r.x + r.w / 2, r.y - 4);
    });
    // diet chart
    var dx = tx, dy = y + 160, max = 10;
    PB.ESSENCES.forEach(function (e) { max = Math.max(max, ind.diet[e] || 0); });
    UI.text(g, 'Diet', dx, dy, UI.font(13, true), C.bone);
    PB.ESSENCES.forEach(function (e, i) {
      var n = ind.diet[e] || 0, bx = dx + 50 + i * 62, bh = 50 * n / max;
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(bx, dy + 4, 40, 50);
      g.fillStyle = ESS_COLOR[e]; g.fillRect(bx, dy + 54 - bh, 40, bh);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(bx, dy + 54 - 50 * 10 / max, 40, 1);
      UI.text(g, e + ' ' + n, bx + 20, dy + 58, UI.font(11), C.dim, 'center');
    });
    var dom = PB.Evolution.dominantEssence(ind.diet);
    UI.text(g, ind.infusion ? 'Infused with ' + ind.infusion + ': ' + ESS_TEXT[ind.infusion] : dom ? 'Projected Tier III infusion: ' + dom + ' (' + ESS_TEXT[dom] + ')' : 'Eat 10 of one essence for a Tier III infusion',
      dx + 50, dy + 74, UI.font(12), dom || ind.infusion ? ESS_COLOR[ind.infusion || dom] : C.faint);
    // deeds
    var d = ind.deeds, deeds = ['kills ' + d.kills, 'boss kills ' + d.bossKills, 'crits ' + d.crits, 'eaten ' + d.eaten, 'rallies ' + d.rallies, 'choruses ' + d.choruses, 'near-deaths ' + d.nearDeaths];
    UI.text(g, 'Deeds  ' + deeds.join(' · '), x + 20, y + 262, UI.font(12), C.dim);
    drawEvolve(g, G, ind, x + 20, y + 284, w - 40);
  }

  function drawEvolve(g, G, ind, x, y, w) {
    var UI = PB.UI, C = UI.C;
    UI.text(g, 'Evolution', x, y, UI.font(15, true), C.gold);
    if (ind.fusedFrom || !PB.EVOLUTIONS[ind.type]) { UI.text(g, 'A bonded fusion evolves no further; Fusion Lore makes it stronger.', x, y + 28, UI.font(13), C.dim); return; }
    var ev = PB.EVOLUTIONS[ind.type], ready = PB.Evolution.canEvolve(ind);
    if (ind.tier === 1) {
      ['A', 'B'].forEach(function (b, i) {
        var bx = x + i * (w / 2 + 6), bw = w / 2 - 6, t2 = ev[b].t2, t3 = ev[b].t3;
        var lines = UI.wrap(g, t2.text, UI.font(12), bw - 20);
        if (UI.button(g, 'evolve-' + b, { x: bx, y: y + 26, w: bw, h: 40 }, 'Evolve ' + b + ': ' + t2.name, { disabled: !ready, reason: UI.why({ reason: 'not-ready', need: PB.EVOLVE_LEVELS[2] }), tone: 'moss' })) {
          var r = evolve(G, ind, b); if (!r.ok) UI.flashReason(UI.why(r), bx + bw / 2, y + 20);
        }
        lines.forEach(function (l, k) { UI.text(g, l, bx + 10, y + 74 + k * 16, UI.font(12), C.bone); });
        UI.text(g, 'then ' + t3.name + ' at level ' + PB.EVOLVE_LEVELS[3], bx + 10, y + 78 + lines.length * 16, UI.font(12), C.dim);
      });
    } else if (ind.tier === 2) {
      var t3 = ev[ind.branch].t3, dom = PB.Evolution.dominantEssence(ind.diet);
      if (UI.button(g, 'evolve-3', { x: x, y: y + 26, w: w / 2, h: 40 }, 'Evolve: ' + t3.name, { disabled: !ready, reason: UI.why({ reason: 'not-ready', need: PB.EVOLVE_LEVELS[3] }), tone: 'moss' })) {
        var r3 = evolve(G, ind); if (!r3.ok) UI.flashReason(UI.why(r3), x + w / 4, y + 20);
      }
      UI.wrap(g, t3.text + (dom ? ' Infusion: ' + dom + '.' : ''), UI.font(12), w / 2 - 20).forEach(function (l, k) { UI.text(g, l, x + w / 2 + 16, y + 30 + k * 16, UI.font(12), C.bone); });
    } else UI.text(g, 'Fully evolved. At level ' + PB.Camp.ENSHRINE_LEVEL + ' it can be enshrined as an Echo at the Moon Shrine.', x, y + 28, UI.font(13), C.dim);
  }

  function draw(g, G) {
    var UI = PB.UI, list = sorted(G.save);
    if (S.sel === null || !find(G.save, S.sel)) {
      var ready = list.filter(function (x) { return PB.Evolution.canEvolve(x); })[0];
      S.sel = ready ? ready.id : list.length ? list[0].id : null;
    }
    UI.dim(g, 0.8);
    UI.panel(g, PX, PY, PW, PH, { title: 'The Pack (' + G.save.roster.length + ' / ' + PB.Roster.ROSTER_MAX + ')' });
    drawList(g, G, list);
    var ind = S.sel !== null ? find(G.save, S.sel) : null;
    if (ind) drawCard(g, G, ind);
    if (UI.button(g, 'pack-close', { x: LW / 2 - 80, y: PY + PH - 48, w: 160, h: 34 }, 'Close (' + PB.Input.keyOf('pack') + ')', { tone: 'moss' })) PB.Game.close();
  }

  PB.Screens = PB.Screens || {};
  PB.Screens.pack = {
    pausesSim: true,
    enter: function (G, opts) { S.sel = opts && opts.select !== undefined ? opts.select : null; },
    draw: draw,
    select: function (id) { S.sel = id; },
    selected: function () { return S.sel; }
  };
})(globalThis.PB = globalThis.PB || {});
