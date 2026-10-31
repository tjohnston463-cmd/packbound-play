// Hearthgrove, the camp (spec §16): the roster lounges by name around a campfire (idle frames; hover for the card,
// click to open the Pack screen on that summon) with the Echoes as translucent ghosts behind. Menu stones: Hunt (the
// zone map: 5 nodes and a Moon selector), Pack, Fusion Altar, Moon Shrine (Enshrine and the Echoes), the Hearth Cube
// (runes and words), Inventory (with Render), Skills and Settings. Every action goes through the sim APIs; the save is stored after each change.
(function (PB) {
  'use strict';
  var LW = 1280, LH = 720, FX = 640, FY = 400;
  var S = { mode: 'camp', moon: 0, confirm: null, t: 0, trees: null, cubeUid: null, cubePage: 0, gambleLast: null };

  function lcg(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function trees() {
    if (S.trees) return S.trees;
    var r = lcg(11), out = [];
    for (var i = 0; i < 26; i++) { var a = r() * Math.PI * 2, d = 0.9 + r() * 0.5; out.push({ x: FX + Math.cos(a) * 620 * d, y: FY - 60 + Math.sin(a) * 300 * d, h: 120 + r() * 120, w: 40 + r() * 30 }); }
    out.sort(function (a, b) { return a.y - b.y; });
    return (S.trees = out);
  }

  // The clearing, baked once: Mirewood ground (terrain.js) ringed by its trees and crowns, a stone fire ring, and the
  // woods falling into darkness away from the fire.
  function backdrop() {
    if (S.bg !== undefined) return S.bg;
    if (typeof document === 'undefined' || !PB.Terrain) return (S.bg = null);
    var cx = 1200, cy = 800, ox = cx - FX, oy = cy - FY, ring = [];
    for (var i = 0; i < 14; i++) { var a = i / 14 * Math.PI * 2 + 0.2; ring.push({ x: Math.round(cx + Math.cos(a) * (660 + (i % 3) * 60)), y: Math.round(cy + Math.sin(a) * (370 + (i % 2) * 50)), r: 38 + (i * 13) % 30 }); }
    var full = PB.Terrain.bakeGround(PB.ZONES[0], 77, ring, document), c = document.createElement('canvas'); c.width = LW; c.height = LH;
    var g = c.getContext('2d');
    g.drawImage(full, ox, oy, LW, LH, 0, 0, LW, LH);
    (full.props || []).slice().sort(function (p, q) { return p.y - q.y; }).forEach(function (p) { g.drawImage(p.canvas, Math.round(p.x - p.ax - ox), Math.round(p.y - p.ay - oy)); });
    (full.canopy || []).forEach(function (k) { if (k.canvas) g.drawImage(k.canvas, Math.round(k.x - k.canvas.width / 2 - ox), Math.round(k.y - k.canvas.height / 2 - oy)); });
    for (var st = 0; st < 11; st++) { // fire ring stones
      var sa = st / 11 * Math.PI * 2, sx = FX + Math.cos(sa) * 46, sy = FY + 10 + Math.sin(sa) * 20;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(sx + 2, sy + 4, 11, 5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3e3a34'; g.beginPath(); g.ellipse(sx, sy, 10, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6a645a'; g.beginPath(); g.ellipse(sx - 2, sy - 2.5, 6, 3.5, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#0c0a08'; g.beginPath(); g.ellipse(FX, FY + 10, 36, 14, 0, 0, Math.PI * 2); g.fill(); // ash bed
    var dark = g.createRadialGradient(FX, FY, 140, FX, FY, 760);
    dark.addColorStop(0, 'rgba(4,6,8,0)'); dark.addColorStop(0.45, 'rgba(4,6,8,0.45)'); dark.addColorStop(1, 'rgba(2,3,5,0.92)');
    g.fillStyle = dark; g.fillRect(0, 0, LW, LH);
    full.width = full.height = 1;
    return (S.bg = c);
  }

  function drawScene(g, UI, t) {
    var bg = backdrop(), fl = 0.9 + 0.1 * Math.sin(t * 9) * Math.sin(t * 5.3);
    if (bg) {
      g.drawImage(bg, 0, 0);
      var warm = g.createRadialGradient(FX, FY, 10, FX, FY, 460);
      warm.addColorStop(0, 'rgba(255,140,50,' + (0.26 * fl).toFixed(3) + ')'); warm.addColorStop(0.4, 'rgba(200,90,30,0.12)'); warm.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = warm; g.fillRect(0, 0, LW, LH); g.globalCompositeOperation = 'source-over';
    } else {
      var sky = g.createLinearGradient(0, 0, 0, LH); sky.addColorStop(0, '#070b14'); sky.addColorStop(1, '#10160f');
      g.fillStyle = sky; g.fillRect(0, 0, LW, LH);
      var glow = g.createRadialGradient(FX, FY, 20, FX, FY, 520);
      glow.addColorStop(0, 'rgba(255,150,60,' + (0.42 * fl).toFixed(3) + ')'); glow.addColorStop(0.5, 'rgba(120,70,30,0.15)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = '#1a2414'; g.beginPath(); g.ellipse(FX, FY + 20, 520, 220, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = glow; g.fillRect(0, 0, LW, LH);
      trees().forEach(function (tr) {
        if (tr.y > FY - 40 && Math.abs(tr.x - FX) < 560) return; // keep the clearing open
        g.fillStyle = '#060a08'; g.beginPath(); g.moveTo(tr.x - tr.w / 2, tr.y); g.lineTo(tr.x, tr.y - tr.h); g.lineTo(tr.x + tr.w / 2, tr.y); g.fill();
      });
    }
    // the fire: logs, then flickering tongues
    g.strokeStyle = '#3b2716'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(FX - 34, FY + 16); g.lineTo(FX + 30, FY + 2); g.moveTo(FX + 34, FY + 16); g.lineTo(FX - 30, FY + 2); g.stroke();
    for (var i = 0; i < 6; i++) {
      var ph = t * (6 + i) + i * 1.7, h = 34 + 16 * Math.sin(ph) + i * 3, wx = FX + (i - 2.5) * 7 + Math.sin(ph * 0.7) * 3;
      g.fillStyle = i % 2 ? 'rgba(255,190,80,0.85)' : 'rgba(255,110,40,0.8)';
      g.beginPath(); g.moveTo(wx - 9, FY + 6); g.quadraticCurveTo(wx - 4, FY - h * 0.5, wx + Math.sin(ph) * 4, FY - h); g.quadraticCurveTo(wx + 6, FY - h * 0.4, wx + 9, FY + 6); g.fill();
    }
    g.fillStyle = 'rgba(255,240,190,0.9)'; // the white-hot heart of the fire
    g.beginPath(); g.moveTo(FX - 8, FY + 6); g.quadraticCurveTo(FX - 4, FY - 14, FX + Math.sin(t * 7) * 2, FY - 22 - 4 * Math.sin(t * 11)); g.quadraticCurveTo(FX + 5, FY - 12, FX + 8, FY + 6); g.fill();
    for (var s = 0; s < 8; s++) { var sy = (t * 40 + s * 37) % 160; g.fillStyle = 'rgba(255,200,120,' + (1 - sy / 160).toFixed(3) + ')'; g.fillRect(FX + Math.sin(s * 2 + t) * 20, FY - 30 - sy, 2, 2); }
  }

  function spot(i, n) { // around the fire, leaving the front-centre clear for the menu
    var a = Math.PI * (0.92 + 1.16 * (n <= 1 ? 0.5 : i / (n - 1))), ring = i % 2 ? 1 : 0.78;
    if (n > 14) a = Math.PI * 2 * (i / n) + Math.PI * 0.5;
    return { x: FX + Math.cos(a) * 300 * ring, y: FY + 10 + Math.sin(a) * 140 * ring };
  }

  function drawRoster(g, UI, G) {
    var save = G.save, n = save.roster.length;
    var echoes = save.echoes;
    echoes.forEach(function (e, i) { // ghosts drift behind the circle
      var x = FX - (echoes.length - 1) * 50 + i * 100, y = FY - 175 + Math.sin(S.t + i) * 5;
      g.globalCompositeOperation = 'lighter';
      UI.sprite(g, e.type, x, y, 60, { white: true, alpha: 0.28 + 0.08 * Math.sin(S.t * 2 + i) });
      g.globalCompositeOperation = 'source-over';
      UI.text(g, e.name, x, y + 26, UI.font(11), 'rgba(200,220,255,0.6)', 'center');
    });
    var order = save.roster.map(function (ind, i) { return { ind: ind, i: i, p: spot(i, n) }; }).sort(function (a, b) { return a.p.y - b.p.y; });
    order.forEach(function (o) {
      var ind = o.ind, p = o.p, size = ind.fusedFrom ? 70 : 56, r = { x: p.x - size / 2, y: p.y - size / 2, w: size, h: size };
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(p.x, p.y + size * 0.3, size * 0.4, size * 0.13, 0, 0, Math.PI * 2); g.fill();
      UI.sprite(g, ind.type, p.x, p.y - Math.abs(Math.sin(S.t * 1.5 + o.i)) * 1.5, size, { face: p.x > FX ? -1 : 1 });
      var hot = UI.hover(r);
      if (hot) {
        UI.text(g, ind.name, p.x, p.y - size / 2 - 16, UI.font(13, true), ind.fusedFrom ? UI.C.gold : UI.C.bone, 'center');
        var scars = ind.scars.map(function (id) { var s = PB.SCARS.filter(function (x) { return x.id === id; })[0]; return s ? s.name : id; });
        UI.setTip([{ text: ind.name, color: UI.C.gold }, { text: (PB.SUMMONS[ind.type] ? PB.SUMMONS[ind.type].name : PB.Game.fusionName(ind.type)) + ' · level ' + ind.level + ' · Tier ' + ind.tier + (PB.Evolution.branchName(ind) ? ' ' + PB.Evolution.branchName(ind) : '') },
          { text: 'Scars: ' + (scars.length ? scars.join(', ') : 'none'), color: UI.C.dim }, { text: PB.Evolution.canEvolve(ind) ? 'Ready to evolve! Click' : 'Click for the Pack card', color: PB.Evolution.canEvolve(ind) ? UI.C.gold : UI.C.dim }],
          p.x, p.y - size / 2 - 22);
      } else if (PB.Evolution.canEvolve(ind)) UI.text(g, '!', p.x, p.y - size / 2 - 14, UI.font(16, true), UI.C.gold, 'center');
      if (S.mode === 'camp' && UI.hotspot('camp-ind-' + o.i, r)) PB.Game.open('pack', { select: ind.id });
    });
    if (!n) UI.text(g, 'The fire is quiet. Your pack is born the first time you call it in a hunt.', FX, FY + 90, UI.font(14), UI.C.dim, 'center');
  }

  function carriedUpgrade(save) {
    var on = {}, names = { staff: 'staff', mask: 'mask', pelt: 'pelt', talisman: 'talisman', charm: 'charm' };
    PB.Save.SLOTS.forEach(function (k) { if (save.equipped[k] != null) on[save.equipped[k]] = true; });
    for (var i = 0; i < save.inventory.length; i++) {
      var it = save.inventory[i];
      if (on[it.uid]) continue;
      if (PB.Loot.isUpgrade(save, it)) return names[it.slot] || it.slot;
    }
    return '';
  }

  function drawTop(g, UI, G) {
    var save = G.save, p = save.player, pts = PB.Skills.pointsTotal(p) - PB.Skills.spent(p.skills), c = save.currency;
    UI.text(g, 'Hearthgrove', LW / 2, 16, 'bold 30px ' + UI.FACE, UI.C.bone, 'center');
    var need = PB.Progression.playerXpToNext(p.level), xf = Math.min(1, p.xp / need);
    var cls = PB.Classes.of(G.save);
    UI.text(g, cls.title + ' level ' + p.level, 24, 18, UI.font(15, true), UI.C.gold);
    g.fillStyle = 'rgba(40,40,30,0.9)'; g.fillRect(24, 42, 220, 6); g.fillStyle = UI.C.gold; g.fillRect(24, 42, 220 * xf, 6);
    UI.text(g, Math.floor(p.xp) + ' / ' + need + ' XP' + (pts ? '  ·  ' + pts + ' skill point' + (pts > 1 ? 's' : '') + '!' : ''), 24, 52, UI.font(12), pts ? UI.C.gold : UI.C.dim);
    var runeN = 0;
    if (save.runes) PB.RUNES.forEach(function (r) { runeN += save.runes[r.id] || 0; });
    UI.text(g, 'Moonstones ' + c.moonstones + '   Dust ' + c.dust + '   Runes ' + runeN + '   Pack ' + save.roster.length + ' / ' + PB.Roster.ROSTER_MAX + '   Echoes ' + save.echoes.length, LW - 24, 22, UI.font(14), UI.C.moon, 'right');
    var better = carriedUpgrade(save);
    if (better) UI.text(g, 'A better ' + better + ' is in the bag', LW - 24, 66, UI.font(13), UI.C.gold, 'right');
    var cleared = save.progress.cleared.length;
    UI.text(g, cleared ? cleared + ' of 5 zones cleared' + (save.progress.bestMoon ? ' · best Moon ' + save.progress.bestMoon : '') : 'The Mirewood waits', LW - 24, 44, UI.font(12), UI.C.dim, 'right');
  }

  var MENU = [['hunt', 'Hunt'], ['pack', 'Pack'], ['altar', 'Fusion Altar'], ['moonshrine', 'Moon Shrine'], ['cube', 'Cube'], ['inventory', 'Inventory'], ['skills', 'Skills'], ['settings', 'Settings']];
  function drawMenu(g, UI, G) {
    var w = 140, gap = 6, x0 = LW / 2 - (MENU.length * (w + gap) - gap) / 2, y = LH - 66;
    MENU.forEach(function (m, i) {
      if (!UI.button(g, m[0], { x: x0 + i * (w + gap), y: y, w: w, h: 44 }, m[1], { size: 13, tone: m[0] === 'hunt' ? 'ember' : 'moss', active: m[0] === 'hunt' })) return;
      if (m[0] === 'hunt') { S.mode = 'map'; S.moon = Math.min(G.save.progress.moon || 0, maxMoon(G.save)); }
      else if (m[0] === 'moonshrine') { S.mode = 'shrine'; S.confirm = null; }
      else if (m[0] === 'cube') { S.mode = 'cube'; S.cubeUid = null; S.cubePage = 0; }
      else if (m[0] === 'settings') PB.Game.open('pause', { tab: 'settings' });
      else PB.Game.open(m[0]);
    });
    if (UI.button(g, 'to-title', { x: 24, y: 76, w: 90, h: 26 }, 'Title', { size: 12 })) PB.Game.toTitle();
    if (S.mode === 'camp' && UI.button(g, 'gamble', { x: 124, y: 76, w: 168, h: 26 }, 'Gamble · ' + PB.Camp.GAMBLE_COST + ' Dust', { size: 12 })) S.mode = 'gamble';
    if (S.mode === 'camp' && G.save && G.save.belt && UI.button(g, 'belt', { x: 304, y: 76, w: 168, h: 26 }, 'Belt ' + G.save.belt.life + '/' + G.save.belt.spirit + '/' + G.save.belt.moon, { size: 12 })) S.mode = 'belt';
  }

  function maxMoon(save) { return save.progress.cleared.indexOf(PB.ZONES.length - 1) >= 0 ? save.progress.bestMoon + 1 : 0; }

  function drawMap(g, UI, G) {
    var save = G.save, g2 = save.progress, C = UI.C;
    UI.dim(g, 0.7);
    UI.panel(g, 90, 110, LW - 180, 470, { title: 'The Hunt' });
    var xs = [], y = 330;
    for (var i = 0; i < PB.ZONES.length; i++) xs.push(200 + i * 220);
    g.strokeStyle = 'rgba(232,135,58,0.5)'; g.lineWidth = 3; g.setLineDash([8, 8]);
    g.beginPath(); xs.forEach(function (x, i) { var yy = y + (i % 2 ? -40 : 30); if (i) g.lineTo(x, yy); else g.moveTo(x, yy); }); g.stroke(); g.setLineDash([]);
    PB.ZONES.forEach(function (z, i) {
      var yy = y + (i % 2 ? -40 : 30), open = i <= g2.unlockedZone, done = (g2.moonCleared[S.moon] || []).indexOf(i) >= 0; // cleared at this Moon tier
      g.fillStyle = open ? z.palette[1] || '#2c3a26' : '#1a1a1a'; g.beginPath(); g.arc(xs[i], yy, 44, 0, Math.PI * 2); g.fill();
      g.strokeStyle = done ? C.gold : open ? C.ember : 'rgba(120,120,120,0.5)'; g.lineWidth = 3; g.stroke();
      var wants = (PB.ENEMIES[PB.Waves.quarry(i, S.moon)] || {}).name || '';
      if (UI.button(g, 'zone-' + i, { x: xs[i] - 90, y: yy + 54, w: 180, h: 46 }, z.name, { disabled: !open, size: 14,
        reason: 'Clear ' + (PB.ZONES[i - 1] ? PB.ZONES[i - 1].name : 'the zone before') + ' first',
        sub: (done ? 'cleared · ' : '') + 'wants ' + wants + ' · ' + ['deaths slow', 'deaths burn', 'deaths chill', 'deaths spark', 'deaths poison'][i] + ' · ' + PB.BOSSES[z.boss].name })) {
        g2.moon = S.moon; S.mode = 'camp';
        PB.Game.startZone(i, S.moon);
      }
      UI.text(g, done ? '✓' : open ? String(i + 1) : '×', xs[i], yy - 12, UI.font(22, true), done ? C.gold : open ? C.bone : C.faint, 'center');
    });
    var mm = maxMoon(save);
    var atMoon = (g2.moonCleared[S.moon] || []).length;
    UI.text(g, 'Moon tier ' + S.moon + (mm ? ' · ' + atMoon + ' of 5 cleared' : '  (Moon tiers open after the fifth zone)'), LW / 2, 190, UI.font(16, true), mm ? C.moon : C.dim, 'center');
    var sc = PB.Waves.scale(0, 1, S.moon);
    UI.text(g, 'Enemy life ' + Math.round(sc.hp * 100) + '% · damage ' + Math.round(sc.dmg * 100) + '%' + (S.moon ? ' · uniques step up' : ''), LW / 2, 248, UI.font(13), C.dim, 'center');
    if (mm) {
      if (UI.button(g, 'moon-down', { x: LW / 2 - 180, y: 182, w: 40, h: 30 }, '−', { disabled: S.moon <= 0, reason: 'Moon 0 is the base tier' })) S.moon--;
      // mm = best Moon cleared + 1, so the next tier opens by clearing the Unmaker at mm itself.
      var need = 'Beat the Unmaker (The Blightheart) at Moon ' + mm + ' to open Moon ' + (mm + 1);
      if (UI.button(g, 'moon-up', { x: LW / 2 + 140, y: 182, w: 40, h: 30 }, '+', { disabled: S.moon >= mm, reason: need })) S.moon++;
      UI.text(g, need, LW / 2, 218, UI.font(13), C.dim, 'center');
    }
    UI.text(g, 'Five waves from the edges, then the boss. A fall keeps every level, item and summon.', LW / 2, 520, UI.font(13), C.dim, 'center');
    if (UI.button(g, 'map-back', { x: LW / 2 - 70, y: 540, w: 140, h: 30 }, 'Back', { tone: 'moss', size: 13 })) S.mode = 'camp';
  }

  function drawShrine(g, UI, G) {
    var save = G.save, C = UI.C;
    UI.dim(g, 0.72);
    UI.panel(g, 120, 90, LW - 240, 520, { title: 'Moon Shrine', glow: 'rgba(160,190,255,0.3)' });
    UI.wrap(g, 'A summon at level ' + PB.Camp.ENSHRINE_LEVEL + ' can be enshrined: it leaves the pack for good and becomes an Echo. Each Echo gives the whole pack +2% damage and runs in every Wild Hunt.', UI.font(13), 900)
      .forEach(function (l, k) { UI.text(g, l, LW / 2, 140 + k * 18, UI.font(13), C.dim, 'center'); });
    save.roster.forEach(function (ind, i) {
      var col = i % 2, row = Math.floor(i / 2), x = 160 + col * 300, y = 190 + row * 24;
      if (row > 14) return;
      UI.text(g, ind.name + ' · ' + (PB.SUMMONS[ind.type] ? PB.SUMMONS[ind.type].name : PB.Game.fusionName(ind.type)) + ' L' + ind.level, x, y + 3, UI.font(13), C.bone);
      var conf = S.confirm === ind.id;
      if (UI.button(g, 'enshrine-' + i, { x: x + 200, y: y, w: 86, h: 21 }, conf ? 'Sure?' : 'Enshrine', { size: 11, active: conf,
        disabled: ind.level < PB.Camp.ENSHRINE_LEVEL, reason: UI.why({ reason: 'level', need: PB.Camp.ENSHRINE_LEVEL }) })) {
        if (!conf) S.confirm = ind.id;
        else { var r = PB.Camp.enshrine(save, ind.id); S.confirm = null; if (r.ok) { PB.Game.toast(ind.name + ' becomes an Echo'); PB.Game.afterSaveChange(); } else UI.flashReason(UI.why(r), x + 240, y - 4); }
      }
    });
    var ex = 790;
    UI.text(g, 'Echoes', ex, 190, UI.font(15, true), C.moon);
    if (!save.echoes.length) UI.text(g, 'none yet', ex, 214, UI.font(13), C.faint);
    save.echoes.forEach(function (e, i) {
      g.globalCompositeOperation = 'lighter'; UI.sprite(g, e.type, ex + 20, 226 + i * 34, 34, { white: true, alpha: 0.4 }); g.globalCompositeOperation = 'source-over';
      UI.text(g, e.name + ' · L' + e.level, ex + 44, 218 + i * 34, UI.font(13), 'rgba(210,225,255,0.85)');
    });
    if (UI.button(g, 'shrine-back', { x: LW / 2 - 70, y: 560, w: 140, h: 34 }, 'Back', { tone: 'moss' })) S.mode = 'camp';
  }

  function drawGamble(g, UI, G) {
    var save = G.save, C = UI.C, band = PB.Camp.gambleBand(save), dust = save.currency.dust || 0, full = PB.Drops.bagCount(save) >= PB.Drops.BAG_MAX;
    var poor = dust < PB.Camp.GAMBLE_COST;
    UI.dim(g, 0.72);
    UI.panel(g, 200, 120, LW - 400, 440, { title: 'Hearth Gamble', glow: 'rgba(226,194,122,0.3)' });
    UI.text(g, 'Spend Dust. The hearth rolls a magic, a rare, a set or a unique. Never a plain piece.', LW / 2, 180, UI.font(15), C.bone, 'center');
    UI.text(g, 'This roll is item level ' + band[0] + ' to ' + band[1] + '. Deeper woods and a higher Moon raise it.', LW / 2, 206, UI.font(14), C.dim, 'center');
    UI.text(g, 'Dust ' + dust + '    ·    ' + PB.Camp.GAMBLE_COST + ' a roll    ·    bag ' + PB.Drops.bagCount(save) + ' / ' + PB.Drops.BAG_MAX, LW / 2, 240, UI.font(16, true), C.gold, 'center');
    var last = S.gambleLast;
    if (!last) UI.text(g, 'Nothing on the table yet.', LW / 2, 310, UI.font(16), C.faint, 'center');
    else {
      var col = '#d8d8d8', ri;
      for (ri = 0; ri < PB.RARITIES.length; ri++) if (PB.RARITIES[ri].id === last.rarity) col = PB.RARITIES[ri].color;
      UI.text(g, last.name, LW / 2, 290, UI.font(20, true), col, 'center');
      UI.text(g, last.rarity + '  ·  item level ' + last.ilvl, LW / 2, 318, UI.font(14), C.dim, 'center');
      var lines = PB.Loot.describe(last).slice(0, 4);
      lines.forEach(function (line, i) { UI.text(g, line, LW / 2, 348 + i * 18, UI.font(13), C.bone, 'center'); });
    }
    if (UI.button(g, 'gamble-roll', { x: LW / 2 - 180, y: 470, w: 170, h: 40 }, 'Roll', { tone: 'ember', disabled: poor || full, reason: full ? 'The bag is full (40). Render something.' : 'Need ' + PB.Camp.GAMBLE_COST + ' Dust' })) {
      var res = PB.Camp.gamble(save);
      if (res.ok) { S.gambleLast = res.item; PB.Game.toast('Gambled: ' + res.item.name); PB.Game.afterSaveChange(); }
      else UI.flashReason(res.reason === 'bag' ? 'The bag is full' : 'Not enough Dust', LW / 2, 450);
    }
    if (UI.button(g, 'gamble-back', { x: LW / 2 + 10, y: 470, w: 170, h: 40 }, 'Back', { tone: 'moss' })) S.mode = 'camp';
  }

  function drawBeltShop(g, UI, G) {
    var save = G.save, C = UI.C, b = PB.Belt.of(save), dust = save.currency.dust || 0, res = PB.Classes.of(save).resource;
    var zk = PB.Input.keyOf('sipLife'), xk = PB.Input.keyOf('sipSpirit'), bk = PB.Input.keyOf('sipMoon');
    UI.dim(g, 0.72);
    UI.panel(g, 180, 100, LW - 360, 490, { title: 'Hearth Belt', glow: 'rgba(196,56,56,0.28)' });
    UI.text(g, zk + ' drinks life. ' + xk + ' drinks ' + res + '. ' + bk + ' drinks a Moonflask, which fills both.', LW / 2, 168, UI.font(15), C.bone, 'center');
    UI.text(g, 'A heavy hit staggers your step. A drink shakes it off. Flasks drop in the wood. They do not fill the bag.', LW / 2, 194, UI.font(14), C.dim, 'center');
    UI.text(g, 'A boss always leaves a Moonflask. Dust ' + dust + '.', LW / 2, 218, UI.font(14), C.gold, 'center');
    var rows = [
      ['life', 'Life flasks', b.life, '#e2433a'],
      ['spirit', res + ' flasks', b.spirit, '#4f8de0'],
      ['moon', 'Moonflasks', b.moon, '#c080e0']
    ];
    rows.forEach(function (row, i) {
      var y = 250 + i * 72, kind = row[0], cost = PB.Belt.COST[kind], open = PB.Belt.room(save, kind);
      UI.text(g, row[1] + '    ' + row[2] + ' / ' + PB.Belt.CAP[kind], LW / 2, y, UI.font(18, true), row[3], 'center');
      var poor = dust < cost, full = open <= 0;
      if (UI.button(g, 'belt-buy-' + kind, { x: LW / 2 - 120, y: y + 14, w: 240, h: 32 }, 'Buy · ' + cost + ' Dust', { size: 13, tone: kind === 'moon' ? 'ember' : 'moss', disabled: poor || full, reason: full ? 'That column is full' : 'Need ' + cost + ' Dust' })) {
        var resBuy = PB.Belt.buy(save, kind);
        if (resBuy.ok) { PB.Game.toast('Bought ' + resBuy.n + ' ' + PB.Belt.label(save, kind)); PB.Game.afterSaveChange(); }
        else UI.flashReason(resBuy.reason === 'full' ? 'That column is full' : 'Not enough Dust', LW / 2, y + 6);
      }
    });
    if (UI.button(g, 'belt-back', { x: LW / 2 - 70, y: 500, w: 140, h: 34 }, 'Back', { tone: 'moss' })) S.mode = 'camp';
  }

  function cubeNote(save, res) {
    if (!res.ok) return;
    PB.Game.toast(res.text);
    PB.Game.afterSaveChange();
    if (res.item) S.cubeUid = res.item.uid;
  }

  // Runes on the left, the five words on the right, then the bag pieces you can socket and the 3-magic recipe.
  function drawCube(g, UI, G) {
    var save = G.save, C = UI.C, i;
    if (!save.runes) PB.Cube.pouch(save);
    UI.dim(g, 0.74);
    UI.panel(g, 48, 88, 1184, 548, { title: 'Hearth Cube', glow: 'rgba(125,204,160,0.28)' });
    UI.text(g, 'Elites, the quarry and bosses drop runes. Three make the next. Order matters. A finished word replaces the loose rune stats.', 72, 132, UI.font(13), C.dim);
    PB.RUNES.forEach(function (r, i) {
      var y = 164 + i * 42, n = save.runes[r.id] || 0, up = PB.Runes.next(r.id), down = PB.Runes.prev(r.id);
      UI.text(g, r.name + '  x' + n, 72, y, UI.font(14, true), '#7dcca0');
      UI.text(g, r.text, 72, y + 16, UI.font(12), C.dim);
      if (UI.button(g, 'rune-up-' + r.id, { x: 300, y: y - 2, w: 108, h: 24 }, up ? '3 to next' : 'Last', { size: 11, disabled: !up || n < 3, reason: up ? 'Need 3' : 'Moon is the last rune' })) cubeNote(save, PB.Cube.upgrade(save, r.id));
      if (UI.button(g, 'rune-down-' + r.id, { x: 414, y: y - 2, w: 72, h: 24 }, down ? 'Break' : 'First', { size: 11, disabled: !down || n < 1, reason: down ? 'Need 1' : 'Fang does not break' })) cubeNote(save, PB.Cube.shatter(save, r.id));
    });
    UI.text(g, 'Words', 520, 164, UI.font(15, true), C.gold);
    PB.RUNE_WORDS.forEach(function (w, i) {
      var y = 186 + i * 44;
      var head = w.name + ' — ' + w.runes.map(function (id) { return PB.RUNE_BY_ID[id].name.replace(' Rune', ''); }).join(' + ') + ', ' + w.slot;
      UI.text(g, head, 520, y, UI.font(13, true), C.bone);
      UI.text(g, w.text, 520, y + 16, UI.font(12), C.dim);
    });
    var pieces = save.inventory.filter(function (it) { return it.rarity !== 'set' && !it.set && PB.Runes.cap(it.slot) > 0; });
    var per = 6, pages = Math.max(1, Math.ceil(pieces.length / per));
    if (S.cubePage >= pages) S.cubePage = pages - 1;
    if (S.cubePage < 0) S.cubePage = 0;
    var slice = pieces.slice(S.cubePage * per, S.cubePage * per + per), sel = null;
    UI.text(g, 'Socket  ·  staff holds 2, the others hold 1. Charms do not.', 72, 430, UI.font(13), C.dim);
    if (!pieces.length) UI.text(g, 'No staff, mask, pelt or talisman in the bag yet.', 72, 458, UI.font(13), C.faint);
    slice.forEach(function (it, k) {
      var word = PB.Runes.wordOn(it), sockets = (it.sockets || []).map(function (id) { return PB.RUNE_BY_ID[id].name.replace(' Rune', '')[0]; }).join('');
      var label = it.name.length > 18 ? it.name.slice(0, 17) + '…' : it.name;
      if (UI.button(g, 'cube-item-' + it.uid, { x: 72 + k * 168, y: 446, w: 160, h: 36 }, label, { size: 11, active: S.cubeUid === it.uid, sub: word ? word.name : (sockets ? 'runes ' + sockets : 'empty') })) S.cubeUid = S.cubeUid === it.uid ? null : it.uid;
    });
    if (pages > 1) {
      if (UI.button(g, 'cube-prev', { x: 1088, y: 446, w: 36, h: 36 }, '<', { size: 14, disabled: S.cubePage <= 0, reason: 'First page' })) S.cubePage--;
      if (UI.button(g, 'cube-next', { x: 1130, y: 446, w: 36, h: 36 }, '>', { size: 14, disabled: S.cubePage >= pages - 1, reason: 'Last page' })) S.cubePage++;
    }
    for (i = 0; i < save.inventory.length; i++) if (save.inventory[i].uid === S.cubeUid) sel = save.inventory[i];
    if (!sel) S.cubeUid = null;
    if (sel) {
      var room = PB.Runes.cap(sel.slot) - (sel.sockets ? sel.sockets.length : 0), bx = 72;
      PB.RUNES.forEach(function (r) {
        if ((save.runes[r.id] || 0) < 1) return;
        var short = r.name.replace(' Rune', '');
        if (UI.button(g, 'cube-set-' + r.id, { x: bx, y: 492, w: 84, h: 26 }, short, { size: 11, disabled: room <= 0, reason: 'That piece is full' })) cubeNote(save, PB.Cube.socket(save, sel.uid, r.id));
        bx += 90;
      });
      if (sel.sockets && sel.sockets.length && UI.button(g, 'cube-pull', { x: 640, y: 492, w: 110, h: 26 }, 'Pull rune', { size: 11 })) cubeNote(save, PB.Cube.unsocket(save, sel.uid));
      if (sel.rarity === 'rare' && !sel.unique && UI.button(g, 'cube-reroll', { x: 760, y: 492, w: 170, h: 26 }, 'Recut (1 Moonstone)', { size: 11, disabled: save.currency.moonstones < 1, reason: 'Need 1 Moonstone' })) cubeNote(save, PB.Cube.reroll(save, sel.uid));
    }
    var fx = 72, forged = false;
    ['staff', 'mask', 'pelt', 'talisman', 'charm'].forEach(function (sl) {
      var n = 0;
      save.inventory.forEach(function (it) { if (it.slot === sl && it.rarity === 'magic' && !PB.Camp.slotOf(save, it.uid)) n++; });
      if (n < 3) return;
      forged = true;
      if (UI.button(g, 'cube-rare-' + sl, { x: fx, y: 532, w: 150, h: 28 }, 'Rare ' + sl, { size: 12, sub: n + ' magic' })) cubeNote(save, PB.Cube.forgeRare(save, sl));
      fx += 158;
    });
    if (!forged) UI.text(g, 'Three magic items of one slot, none of them worn, become one rare.', 72, 540, UI.font(12), C.faint);
    if (UI.button(g, 'cube-back', { x: 1040, y: 576, w: 140, h: 34 }, 'Back', { tone: 'moss' })) S.mode = 'camp';
  }

  PB.Screens = PB.Screens || {};
  PB.Screens.camp = {
    pausesSim: true,
    enter: function () { S.mode = 'camp'; S.confirm = null; },
    draw: function (g, G, dt) {
      var UI = PB.UI;
      S.t += dt || 0;
      drawScene(g, UI, S.t);
      drawRoster(g, UI, G);
      drawTop(g, UI, G);
      if (S.mode === 'map') drawMap(g, UI, G);
      else if (S.mode === 'shrine') drawShrine(g, UI, G);
      else if (S.mode === 'cube') drawCube(g, UI, G);
      else if (S.mode === 'gamble') drawGamble(g, UI, G);
      else if (S.mode === 'belt') drawBeltShop(g, UI, G);
      else drawMenu(g, UI, G);
    }
  };
  PB.CampUI = { state: S };
})(globalThis.PB = globalThis.PB || {});
