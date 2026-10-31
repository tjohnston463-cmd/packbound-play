// Fusion Altar (T at a Fusion Shrine, or from camp; spec §8, §16): two sockets, the roster filtered to eligible
// individuals (Tier II+, unfused), a preview of the result (name, role, ability, merged scars, level, Moonstone cost)
// and the Codex grid of all 15 fusions ("???" with a parent hint until discovered). Fuse calls Fusion.fuse at camp or
// Fusion.fieldFuse at a shrine, then plays the ritual: both summons spiral in and a burst reveals the result.
(function (PB) {
  'use strict';
  var LW = 1280, PX = 60, PY = 30, PW = 1160, PH = 660, RITUAL = 1.4, REVEAL = 1.6;
  var ROLE = { flank: 'Striker', guard: 'Guardian', rooted: 'Rooted turret', aura: 'Support aura', dart: 'Skirmisher' };
  var S = { a: null, b: null, field: false, ritual: null, page: 0 };
  var ROW_H = 22, PAGE = 16; // 16 rows fit between the list title and the Codex

  function cap(t) { return PB.SUMMONS[t] ? PB.SUMMONS[t].name : t; }

  // All 15 recipes in a fixed order: the 10 cross fusions, then the 5 Alphas.
  function codex(save) {
    var out = [], allow = {};
    PB.Classes.order(save).forEach(function (t) { allow[t] = true; });
    Object.keys(PB.FUSIONS).forEach(function (k) {
      var parts = k.split('+');
      if (!allow[parts[0]] || !allow[parts[1]]) return;
      var f = PB.FUSIONS[k];
      out.push({ id: f.id, name: f.name, known: !!save.codex.fusions[f.id], hint: cap(parts[0]) + ' + ' + cap(parts[1]), ability: f.ability });
    });
    Object.keys(PB.ALPHA).forEach(function (t) {
      if (!allow[t]) return;
      var a = PB.ALPHA[t];
      out.push({ id: a.id, name: a.name, known: !!save.codex.fusions[a.id], hint: cap(t) + ' + ' + cap(t), ability: a.ability });
    });
    return out;
  }

  function defOf(typeA, typeB) {
    if (typeA === typeB) { var a = PB.ALPHA[typeA]; return { name: a.name, ability: a.ability, ai: PB.SUMMONS[typeA].ai }; }
    return PB.FUSIONS[PB.Fusion.key(typeA, typeB)] || null;
  }

  function eligible(save) { return save.roster.filter(function (x) { return x.tier >= 2 && !x.fusedFrom; }); }
  function find(save, id) { for (var i = 0; i < save.roster.length; i++) if (save.roster[i].id === id) return save.roster[i]; return null; }
  function statsOf(G) { return G.world ? G.world.mods.stats : PB.Mods.build(G.save).stats; }

  function fuse(G) {
    var save = G.save, a = find(save, S.a), b = find(save, S.b);
    var r = S.field && G.world ? PB.Fusion.fieldFuse(G.world, S.a, S.b)
                               : PB.Fusion.fuse(save, S.a, S.b, new PB.Rng((save.seed ^ (save.nextIndId * 2654435761)) >>> 0), statsOf(G));
    if (!r.ok) return r;
    S.ritual = { t: 0, a: { type: a.type, name: a.name }, b: { type: b.type, name: b.name }, result: r.individual };
    S.a = S.b = null;
    if (!G.world) PB.Game.toast('Fused: ' + r.individual.name + ' (' + PB.Game.fusionName(r.individual.type) + ')');
    PB.Game.afterSaveChange();
    return r;
  }

  function socket(g, UI, i, x, y, ind) {
    var r = { x: x - 70, y: y - 70, w: 140, h: 140 }, hot = UI.hover(r);
    g.strokeStyle = hot ? UI.C.gold : 'rgba(159,192,255,0.6)'; g.lineWidth = 2;
    g.fillStyle = 'rgba(20,28,44,0.9)'; g.beginPath(); g.arc(x, y, 64, 0, 6.29); g.fill(); g.stroke();
    g.setLineDash([4, 6]); g.beginPath(); g.arc(x, y, 72, UI.t * 0.4, UI.t * 0.4 + 6.29); g.stroke(); g.setLineDash([]);
    if (ind) {
      UI.sprite(g, ind.type, x, y - 6, 96);
      UI.text(g, ind.name, x, y + 44, UI.font(13, true), UI.C.bone, 'center');
      UI.text(g, cap(ind.type) + ' L' + ind.level, x, y + 76, UI.font(12), UI.C.dim, 'center');
    } else UI.text(g, 'empty', x, y - 8, UI.font(13), UI.C.faint, 'center');
    if (UI.hotspot('socket-' + i, r) && ind) { if (i === 0) S.a = null; else S.b = null; }
  }

  function drawRitual(g, UI, G) {
    var R = S.ritual, t = R.t, cx = LW / 2, cy = 300;
    if (t < RITUAL) {
      var k = t / RITUAL, ang = k * 7, rad = 220 * (1 - PB.M.easeOutCubic(k));
      [R.a, R.b].forEach(function (p, i) {
        var a = ang + i * Math.PI;
        UI.sprite(g, p.type, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.5, 90 * (1 - k * 0.5), { alpha: 1 - k * 0.4 });
      });
      if (PB.Game.quality() === 'High') {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = k * 0.8;
        var atlas = PB.Render.atlas(), radius = 160 * k + 20;
        if (atlas) g.drawImage(atlas.glows.frost, cx - radius, cy - radius, radius * 2, radius * 2);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
    } else {
      var u = Math.min(1, (t - RITUAL) / 0.3);
      if (t - RITUAL < 0.25) { g.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - (t - RITUAL) / 0.25)).toFixed(3) + ')'; g.fillRect(0, 0, LW, 720); }
      g.strokeStyle = 'rgba(255,214,120,' + (1 - u * 0.6).toFixed(3) + ')'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 60 + 140 * u, 0, 6.29); g.stroke();
      if (PB.Game.quality() === 'High') {
        var bloom = Math.max(0, 1 - (t - RITUAL) / 1.2), assets = PB.Render.atlas();
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = bloom * 0.7;
        if (assets) g.drawImage(assets.glows.gold, cx - 240, cy - 240, 480, 480);
        g.strokeStyle = '#ffdf9a'; g.lineWidth = 2; g.beginPath();
        for (var ray = 0; ray < 36; ray++) {
          var angle = ray * 2.39996, distance = (t - RITUAL) * (90 + ray % 5 * 20) + 30;
          g.moveTo(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance * 0.65);
          g.lineTo(cx + Math.cos(angle) * (distance + 12), cy + Math.sin(angle) * (distance + 12) * 0.65);
        }
        g.stroke(); g.restore();
      }
      UI.sprite(g, R.result.type, cx, cy, 150 * (0.6 + 0.4 * u));
      UI.text(g, R.result.name, cx, cy + 92, UI.font(26, true), UI.C.gold, 'center');
      UI.text(g, PB.Game.fusionName(R.result.type) + ' · level ' + R.result.level, cx, cy + 126, UI.font(15), UI.C.bone, 'center');
    }
  }

  function draw(g, G, dt) {
    var UI = PB.UI, C = UI.C, save = G.save;
    UI.dim(g, 0.82);
    UI.panel(g, PX, PY, PW, PH, { title: 'Fusion Altar' + (S.field ? ' (Shrine)' : ''), glow: 'rgba(120,160,255,0.25)' });
    UI.text(g, 'Moonstones ' + save.currency.moonstones + ' · fused ' + save.roster.filter(function (x) { return x.fusedFrom; }).length + ' / ' + PB.Fusion.fusionSlots(save, statsOf(G)) + ' slots',
      PX + PW - 24, PY + 14, UI.font(13), C.moon, 'right');
    if (S.ritual) {
      S.ritual.t += dt || 0;
      drawRitual(g, UI, G);
      if (S.ritual.t > RITUAL + REVEAL) S.ritual = null;
      return;
    }
    // eligible list
    var list = eligible(save), lx = PX + 24, ly = PY + 60;
    UI.text(g, 'Tier II summons', lx, ly, UI.font(14, true), C.gold);
    if (!list.length) UI.wrap(g, 'Nobody is ready: evolve two summons to Tier II (level ' + PB.EVOLVE_LEVELS[2] + ', J) and bring Moonstones.', UI.font(13), 260)
      .forEach(function (l, k) { UI.text(g, l, lx, ly + 26 + k * 17, UI.font(13), C.dim); });
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    S.page = Math.min(S.page, pages - 1);
    list.forEach(function (ind, i) {
      if (Math.floor(i / PAGE) !== S.page) return;
      var r = { x: lx, y: ly + 24 + (i % PAGE) * ROW_H, w: 280, h: 20 }, picked = ind.id === S.a || ind.id === S.b;
      UI.roundRect(g, r.x, r.y, r.w, r.h, 4); g.fillStyle = picked ? 'rgba(120,160,255,0.3)' : UI.hover(r) ? 'rgba(176,142,84,0.2)' : 'rgba(20,24,20,0.8)'; g.fill();
      UI.text(g, ind.name, r.x + 8, r.y + 3, UI.font(13), C.bone);
      UI.text(g, cap(ind.type) + ' L' + ind.level + ' ' + (PB.Evolution.branchName(ind) || ''), r.x + r.w - 8, r.y + 4, UI.font(11), C.dim, 'right');
      if (UI.hotspot('altar-pick-' + i, r)) {
        if (picked) { if (S.a === ind.id) S.a = null; else S.b = null; }
        else if (S.a === null) S.a = ind.id; else S.b = ind.id;
      }
    });
    if (pages > 1) { // paging: every eligible summon stays selectable however full the roster is
      var py0 = ly + 24 + PAGE * ROW_H + 4;
      UI.text(g, 'Page ' + (S.page + 1) + ' / ' + pages + ' (' + list.length + ')', lx + 140, py0 + 5, UI.font(12), C.dim, 'center');
      if (S.page > 0 && UI.button(g, 'altar-prev', { x: lx, y: py0, w: 60, h: 24 }, '◀', { tone: 'moss', size: 12 })) S.page--;
      if (S.page < pages - 1 && UI.button(g, 'altar-next', { x: lx + 220, y: py0, w: 60, h: 24 }, '▶', { tone: 'moss', size: 12 })) S.page++;
    }
    var a = S.a !== null ? find(save, S.a) : null, b = S.b !== null ? find(save, S.b) : null;
    socket(g, UI, 0, PX + 430, PY + 160, a);
    socket(g, UI, 1, PX + 730, PY + 160, b);
    UI.text(g, '+', PX + 580, PY + 140, UI.font(36, true), C.moon, 'center');
    // preview
    var px = PX + 360, py = PY + 290, verdict = a && b ? PB.Fusion.canFuse(save, a.id, b.id, statsOf(G)) : { ok: false, reason: 'pick' };
    if (a && b) {
      var res = PB.Fusion.result(a.type, b.type), def = res && defOf(a.type, b.type);
      if (res && def) {
        var cost = res.alpha ? PB.FUSION_COST.alpha : PB.FUSION_COST.cross, scars = [];
        a.scars.concat(b.scars).forEach(function (s) { if (scars.indexOf(s) < 0 && scars.length < PB.MAX_SCARS) scars.push(s); });
        UI.text(g, res.name, px + 220, py, UI.font(22, true), C.gold, 'center');
        UI.text(g, (ROLE[def.ai] || def.ai) + ' · level ' + Math.max(a.level, b.level) + ' · Tier II · carries both tags', px + 220, py + 30, UI.font(13), C.bone, 'center');
        UI.wrap(g, def.ability, UI.font(13), 440).forEach(function (l, k) { UI.text(g, l, px + 220, py + 54 + k * 17, UI.font(13), C.green, 'center'); });
        UI.text(g, 'Scars: ' + (scars.length ? scars.map(function (id) { var s = PB.SCARS.filter(function (x) { return x.id === id; })[0]; return s ? s.name : id; }).join(', ') : 'none'), px + 220, py + 100, UI.font(12), C.dim, 'center');
        UI.text(g, 'Cost: ' + cost + ' Moonstones', px + 220, py + 120, UI.font(14, true), save.currency.moonstones >= cost ? C.moon : C.red, 'center');
      } else UI.text(g, 'These two cannot fuse', px + 220, py + 20, UI.font(15), C.red, 'center');
    } else UI.text(g, 'Pick two Tier II summons from the list', px + 220, py + 20, UI.font(15), C.dim, 'center');
    if (UI.button(g, 'altar-fuse', { x: px + 120, y: py + 146, w: 200, h: 40 }, 'Fuse', { disabled: !verdict.ok, reason: verdict.reason === 'pick' ? 'Pick two Tier II summons' : UI.why(verdict), tone: 'moon', size: 17 })) {
      var fr = fuse(G); if (!fr.ok) UI.flashReason(UI.why(fr), px + 220, py + 140);
    }
    // codex
    var cx0 = PX + 24, cy0 = PY + 500, cw = 220, ch = 34;
    UI.text(g, 'Codex', cx0, cy0 - 22, UI.font(14, true), C.gold);
    codex(save).forEach(function (c, i) {
      var r = { x: cx0 + (i % 5) * (cw + 6), y: cy0 + Math.floor(i / 5) * (ch + 5), w: cw, h: ch };
      UI.roundRect(g, r.x, r.y, r.w, r.h, 4); g.fillStyle = c.known ? 'rgba(40,46,70,0.9)' : 'rgba(18,20,24,0.9)'; g.fill();
      if (c.known) { UI.sprite(g, c.id, r.x + 18, r.y + 17, 30); UI.text(g, c.name, r.x + 38, r.y + 9, UI.font(13, true), C.bone); }
      else { UI.text(g, '???', r.x + 10, r.y + 3, UI.font(13, true), C.faint); UI.text(g, c.hint, r.x + 10, r.y + 18, UI.font(11), C.dim); }
      if (UI.hover(r)) UI.setTip(c.known ? [{ text: c.name, color: C.gold }, { text: c.ability }] : [{ text: '??? (' + c.hint + ')', color: C.dim }], r.x + r.w / 2, r.y - 4);
    });
    if (UI.button(g, 'altar-back', { x: PX + 20, y: PY + 12, w: 110, h: 28 }, 'Back', { tone: 'moss', size: 13 })) PB.Game.close();
  }

  PB.Screens = PB.Screens || {};
  PB.Screens.altar = {
    pausesSim: true,
    enter: function (G, opts) { S.a = S.b = null; S.ritual = null; S.page = 0; S.field = !!(opts && opts.field); },
    draw: draw
  };
  PB.Altar = { codex: codex, eligible: eligible, state: S };
})(globalThis.PB = globalThis.PB || {});
