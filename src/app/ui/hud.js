// The field HUD (spec §16): life and Spirit orbs with a liquid wobble, the summon bar (count/cap, cost, Den), the
// command row with cooldown sweeps and the Heel state, the Chorus moon disc with the V prompt, the pack list (one row
// per summon up to 14, then type counts), the zone/wave line or the boss bar with its phase notch, the wave banner,
// off-screen enemy arrows and toasts. The HUD reads only world and save and never writes them (hud.test.js).
(function (PB) {
  'use strict';
  var LW = 1280, LH = 720, LIST_MAX = 14;
  var COLORS = { wolf: '#a9b4bf', raven: '#8a8ec0', bear: '#d6ecf5', vine: '#6ab04a', spirit: '#ffd27a' };
  var CMD_ROW = ['howl', 'rally', 'frenzy', 'encircle', 'heel', 'bound']; // keys come from the live (rebindable) key map

  function denWait(world, type, n, cap) {
    if (!world.save || n >= cap) return 0;
    var ofType = world.save.roster.filter(function (x) { return x.type === type; }), soonest = Infinity;
    if (ofType.length < cap) return 0;
    for (var i = 0; i < ofType.length; i++) {
      var id = ofType[i].id;
      if (world.active[id]) continue;
      var until = world.den[id];
      if (until === undefined || until <= world.time) return 0;
      soonest = Math.min(soonest, until - world.time);
    }
    return soonest === Infinity ? 0 : soonest;
  }

  function summonBar(world) {
    var p = world.player, mods = world.mods;
    return PB.SUMMON_ORDER.map(function (t, i) {
      var def = PB.SUMMONS[t], n = PB.Roster.activeCount(world, t), cap = PB.Roster.capFor(t, mods), cost = PB.Roster.costFor(t, mods);
      var den = denWait(world, t, n, cap), pool = mods.behaviors.bloodbound ? 'hp' : 'spirit';
      var afford = pool === 'hp' ? p.hp >= cost + 1 : p.spirit >= cost; // the same payment rule as Player.summonKey
      return { type: t, key: PB.Input.keyOf('summon' + (i + 1)), name: def.name, n: n, cap: cap, cost: cost, den: den, pool: pool, afford: afford, ready: n < cap && den <= 0 && afford };
    });
  }

  function commandRow(world) {
    var pack = world.pack, active = { howl: pack.howlT || 0, rally: pack.rallyT || 0, frenzy: pack.frenzyT || 0, encircle: pack.encircle ? pack.encircle.t : 0, heel: 0 };
    return CMD_ROW.map(function (kind) {
      if (kind === 'bound') { // the dodge: Space, its own 1.2 s cooldown on the druid
        var bl = world.player.boundCd || 0;
        return { kind: 'bound', key: PB.Input.keyOf('bound'), sweep: bl > 0 ? Math.min(1, bl / PB.Player.BOUND_CD) : 0, left: bl, active: world.player.iframes || 0, on: undefined };
      }
      var cd = PB.COMMANDS[kind].cd ? PB.Commands.cooldown(world, kind) : 0, left = (pack.cds && pack.cds[kind]) || 0;
      return { kind: kind, key: PB.Input.keyOf(kind), sweep: cd > 0 && left > 0 ? Math.min(1, left / cd) : 0, left: left, active: active[kind], on: kind === 'heel' ? !!pack.heel : undefined };
    });
  }

  function typeOf(world, e) { var ind = world.inds && world.inds[e.indId]; return ind && ind.fusedFrom ? 'fused' : e.type; }

  function packRows(world) {
    var list = [];
    for (var i = 0; i < world.ents.length; i++) { var e = world.ents[i]; if (e.kind === 'summon' && e.team === 0 && !e.dead && !e.ghost) list.push(e); }
    if (list.length > LIST_MAX) {
      var counts = {}, order = [];
      list.forEach(function (x) { var t = typeOf(world, x); if (!counts[t]) { counts[t] = 0; order.push(t); } counts[t]++; });
      return order.map(function (t) { return { type: t, count: counts[t], name: t === 'fused' ? 'Bonded' : (PB.SUMMONS[t] || { name: t }).name }; });
    }
    return list.map(function (x) {
      var ind = world.inds && world.inds[x.indId];
      return { id: x.id, indId: x.indId, type: x.type, name: ind ? ind.name : x.type, hp: Math.max(0, x.hp / x.maxHp), level: ind ? ind.level : 0,
               fused: !!(ind && ind.fusedFrom), ready: !!(ind && PB.Evolution.canEvolve(ind)), temp: !!x.temp, denMother: !!x.denMother };
    });
  }

  // Arrows for the nearest off-screen enemies, on the screen edge pointing at them. cam: the view centre.
  function arrows(world, cam) {
    var out = [], x0 = cam.x - LW / 2, y0 = cam.y - LH / 2, M = 26;
    for (var i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (e.team !== 1 || e.dead) continue;
      var sx = e.x - x0, sy = e.y - y0;
      if (sx >= 0 && sx <= LW && sy >= 0 && sy <= LH) continue;
      var dx = sx - LW / 2, dy = sy - LH / 2, k = Math.min((LW / 2 - M) / Math.max(1e-6, Math.abs(dx)), (LH / 2 - M) / Math.max(1e-6, Math.abs(dy)));
      out.push({ x: LW / 2 + dx * k, y: LH / 2 + dy * k, angle: Math.atan2(dy, dx), d: dx * dx + dy * dy, boss: !!e.boss, elite: !!(e.elite && e.elite.length) });
    }
    if (world.grove) {
      var gsh = world.grove, gsx = gsh.x - x0, gsy = gsh.y - y0;
      if (gsx < 0 || gsx > LW || gsy < 0 || gsy > LH) {
        var gdx = gsx - LW / 2, gdy = gsy - LH / 2;
        var gk = Math.min((LW / 2 - M) / Math.max(1e-6, Math.abs(gdx)), (LH / 2 - M) / Math.max(1e-6, Math.abs(gdy)));
        out.push({ x: LW / 2 + gdx * gk, y: LH / 2 + gdy * gk, angle: Math.atan2(gdy, gdx), d: -1, boss: false, elite: false, grove: true, color: gsh.color });
      }
    }
    out.sort(function (a, b) { return (b.boss - a.boss) || a.d - b.d; });
    return out.slice(0, 10);
  }

  // ---------- drawing ----------
  // A glass globe in a bronze socket: the liquid has a wobbling surface, slow swirls and rising bubbles; the glass a
  // dark rim shadow and a window highlight.
  function orb(g, cx, cy, r, frac, deep, bright, label, now) {
    var UI = PB.UI;
    var rim = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    rim.addColorStop(0, '#e2c27a'); rim.addColorStop(0.35, '#8a6a34'); rim.addColorStop(0.7, '#4a3618'); rim.addColorStop(1, '#a8884a');
    g.fillStyle = 'rgba(0,0,0,0.85)'; g.beginPath(); g.arc(cx, cy, r + 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, r + 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#16120c'; g.beginPath(); g.arc(cx, cy, r + 2.5, 0, Math.PI * 2); g.fill();
    for (var s = 0; s < 8; s++) { var a = s * Math.PI / 4 + Math.PI / 8; g.fillStyle = s % 2 ? '#6a5028' : '#e8d090'; g.beginPath(); g.arc(cx + Math.cos(a) * (r + 5.5), cy + Math.sin(a) * (r + 5.5), 1.8, 0, Math.PI * 2); g.fill(); }
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#07060a'; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    var top = cy + r - frac * r * 2;
    var grad = g.createLinearGradient(0, cy - r, 0, cy + r); grad.addColorStop(0, bright); grad.addColorStop(1, deep);
    g.fillStyle = grad; g.beginPath(); g.moveTo(cx - r, cy + r);
    for (var x = -r; x <= r; x += 4) g.lineTo(cx + x, top + Math.sin(x * 0.09 + now * 3) * 2.5 + Math.sin(x * 0.05 - now * 2.1) * 1.5);
    g.lineTo(cx + r, cy + r); g.closePath(); g.fill();
    g.save(); g.clip(); // swirls and bubbles stay inside the liquid
    g.globalAlpha = 0.18; g.strokeStyle = '#000'; g.lineWidth = 6;
    for (var k = 0; k < 3; k++) { g.beginPath(); g.arc(cx + Math.sin(now * 0.4 + k * 2) * r * 0.3, cy + r * 0.25 + k * 6, r * (0.35 + k * 0.18), now * 0.6 + k, now * 0.6 + k + 2.2); g.stroke(); }
    g.globalAlpha = 0.45; g.fillStyle = '#ffffff';
    for (var b = 0; b < 6; b++) { var by = cy + r - ((now * (14 + b * 3) + b * 23) % (r * 2)), bx = cx + Math.sin(now * 2 + b * 1.7) * r * 0.5; g.beginPath(); g.arc(bx, by, 1 + (b % 3) * 0.6, 0, Math.PI * 2); g.fill(); }
    g.restore();
    var inner = g.createRadialGradient(cx, cy, r * 0.55, cx, cy, r); inner.addColorStop(0, 'rgba(0,0,0,0)'); inner.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.globalAlpha = 1; g.fillStyle = inner; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.ellipse(cx - r * 0.28, cy - r * 0.5, r * 0.45, r * 0.22, -0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(cx - r * 0.42, cy - r * 0.55, r * 0.1, r * 0.05, -0.6, 0, Math.PI * 2); g.fill();
    g.restore();
    g.save(); g.shadowColor = 'rgba(0,0,0,1)'; g.shadowBlur = 5;
    UI.text(g, label, cx, cy - 9, UI.font(17, true), '#fff', 'center'); g.restore();
  }

  // The carved stone bar along the bottom edge, between the orbs, baked once.
  var BAR = null, BAR_H = 76;
  function stoneBar() {
    if (BAR || typeof document === 'undefined') return BAR;
    var c = document.createElement('canvas'); c.width = LW; c.height = BAR_H + 10;
    var g = c.getContext('2d'), top = 10;
    if (!g || !g.createLinearGradient) return (BAR = c);
    var gr = g.createLinearGradient(0, top, 0, top + BAR_H);
    gr.addColorStop(0, '#3a342c'); gr.addColorStop(0.15, '#2a2620'); gr.addColorStop(1, '#100e0c');
    g.fillStyle = gr; g.beginPath(); g.moveTo(120, top + BAR_H); g.lineTo(150, top + 8); g.lineTo(LW - 150, top + 8); g.lineTo(LW - 120, top + BAR_H); g.closePath(); g.fill();
    var seed = 11;
    var rnd = function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (var i = 0; i < 2600; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,240,210,0.05)'; g.fillRect(150 + rnd() * (LW - 300), top + 8 + rnd() * (BAR_H - 8), 1 + rnd() * 2, 1); }
    for (var b = 0; b < 9; b++) { var bx = 150 + (LW - 300) * b / 8; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(bx, top + 12); g.lineTo(bx + 3, top + BAR_H); g.stroke(); } // block seams
    var tr = g.createLinearGradient(0, top + 3, 0, top + 11); tr.addColorStop(0, '#e2c27a'); tr.addColorStop(1, '#5a4220');
    g.fillStyle = tr; g.beginPath(); g.moveTo(146, top + 11); g.lineTo(150, top + 3); g.lineTo(LW - 150, top + 3); g.lineTo(LW - 146, top + 11); g.closePath(); g.fill();
    g.fillStyle = '#000'; g.fillRect(150, top + 11, LW - 300, 1.5);
    return (BAR = c);
  }

  function glyph(g, type, x, y, size, alpha) {
    var atlas = PB.Render.atlas && PB.Render.atlas(), sp = atlas && atlas.bodies && atlas.bodies[type];
    g.globalAlpha = alpha === undefined ? 1 : alpha;
    if (sp) g.drawImage(sp.sheet, 0, 0, sp.cell, sp.cell, x - size / 2, y - size / 2, size, size);
    else { g.fillStyle = COLORS[type] || '#ffd678'; g.beginPath(); g.arc(x, y, size / 4, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }

  function drawSummonBar(g, world) {
    var UI = PB.UI, bar = summonBar(world), w = 74, gap = 6, x0 = LW / 2 - (bar.length * (w + gap) - gap) / 2, y = LH - 66;
    bar.forEach(function (s, i) {
      var x = x0 + i * (w + gap);
      UI.roundRect(g, x, y, w, 56, 3);
      g.fillStyle = 'rgba(6,5,4,0.9)'; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = s.ready ? COLORS[s.type] : 'rgba(120,104,80,0.55)'; g.lineWidth = 1.6; g.stroke();
      glyph(g, s.type, x + w / 2, y + 24, 40, s.ready ? 1 : 0.35);
      UI.text(g, s.key, x + 6, y + 3, UI.font(13, true), UI.C.gold);
      UI.text(g, s.n + '/' + s.cap, x + 5, y + 39, UI.font(12), s.ready ? UI.C.bone : UI.C.dim);
      UI.text(g, String(s.cost), x + w - 5, y + 39, UI.font(12), !s.afford ? UI.C.red : s.pool === 'hp' ? '#ff8a7a' : '#9fc4ff', 'right'); // Bloodbound pays in Life (red)
      if (s.den > 0) {
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x + 2, y + 2, w - 4, 52);
        UI.text(g, 'Den ' + Math.ceil(s.den) + 's', x + w / 2, y + 20, UI.font(12, true), UI.C.bone, 'center');
      }
    });
  }

  function drawCommandRow(g, world, now) {
    var UI = PB.UI, row = commandRow(world), w = 46, gap = 6, x0 = LW / 2 - (row.length * (w + gap) - gap) / 2, y = LH - 112;
    row.forEach(function (c, i) {
      var x = x0 + i * (w + gap), cx = x + w / 2, cy = y + 19;
      UI.roundRect(g, x, y, w, 38, 3);
      g.fillStyle = c.active > 0 || c.on ? 'rgba(120,70,30,0.7)' : 'rgba(14,12,10,0.88)'; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 3.5; g.stroke();
      g.strokeStyle = c.active > 0 || c.on ? '#ffd678' : UI.C.edge; g.lineWidth = 1.4; g.stroke();
      UI.text(g, c.key, cx, y + 4, UI.font(c.key.length > 1 ? 11 : 15, true), UI.C.bone, 'center');
      UI.text(g, c.kind === 'heel' ? (c.on ? 'heel' : 'free') : c.kind, cx, y + 22, UI.font(10), UI.C.dim, 'center');
      if (c.sweep > 0) { // the clock sweep: the dark wedge is the time still to wait
        g.save(); UI.roundRect(g, x, y, w, 38, 6); g.clip();
        g.fillStyle = 'rgba(0,0,0,0.62)'; g.beginPath(); g.moveTo(cx, cy);
        g.arc(cx, cy, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.sweep); g.closePath(); g.fill(); g.restore();
        UI.text(g, String(Math.ceil(c.left)), cx, y + 11, UI.font(13, true), '#fff', 'center');
      }
      if (c.active > 0) UI.text(g, c.active.toFixed(1), cx, y - 14, UI.font(11, true), UI.C.gold, 'center');
    });
    var order = world.pack.order.kind;
    UI.text(g, 'Order: ' + order + (world.pack.heel ? ' · heel' : ''), x0 + row.length * (w + gap) + 8, y + 12, UI.font(12), UI.C.dim);
    var sk = world.skin;
    if (world.anchor && sk) UI.text(g, 'Skinwalk ' + (sk.left < 0 ? '∞' : sk.left.toFixed(1) + 's') + ' · ' + PB.Input.keyOf('skinwalk') + ' returns · RMB signature', LW / 2, y - 32, UI.font(13, true), UI.C.gold, 'center');
    else if (sk && sk.cd > 0) UI.text(g, 'Skinwalk ' + Math.ceil(sk.cd) + 's', x0 - 8, y + 12, UI.font(12), UI.C.dim, 'right');
    else UI.text(g, PB.Input.keyOf('skinwalk') + ' Skinwalk', x0 - 8, y + 12, UI.font(12), UI.C.dim, 'right');
    void now;
  }

  function drawChorus(g, world, now) {
    var UI = PB.UI, cx = LW - 64, cy = 64, r = 36, c = world.chorus, frac = c ? c.meter / PB.Chorus.METER_MAX : 0, full = frac >= 1 - 1e-9;
    if (full || world.hunt) {
      var glow = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.2);
      glow.addColorStop(0, 'rgba(200,220,255,' + (0.35 + 0.2 * Math.sin(now * 5)).toFixed(3) + ')'); glow.addColorStop(1, 'rgba(200,220,255,0)');
      g.fillStyle = glow; g.fillRect(cx - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4);
    }
    g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, r + 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = PB.UI.C.bronze; g.beginPath(); g.arc(cx, cy, r + 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0d1424'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = full ? '#eef3ff' : '#9fb6e0'; g.fillRect(cx - r, cy + r - frac * r * 2, r * 2, frac * r * 2);
    g.fillStyle = 'rgba(120,135,170,0.35)'; g.beginPath(); g.arc(cx - 10, cy - 6, 7, 0, Math.PI * 2); g.arc(cx + 12, cy + 12, 5, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(200,215,240,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    if (world.hunt) UI.text(g, 'THE WILD HUNT', cx, cy + r + 8, UI.font(12, true), UI.C.moon, 'right');
    else if (full) {
      g.globalAlpha = 0.6 + 0.4 * Math.sin(now * 6);
      var hk = PB.Input.keyOf('hunt');
      UI.text(g, hk, cx, cy - 13, UI.font(hk.length > 2 ? 14 : 26, true), '#203060', 'center');
      g.globalAlpha = 1;
      UI.text(g, 'Wild Hunt ready', cx, cy + r + 8, UI.font(12, true), UI.C.moon, 'center');
    } else UI.text(g, 'Chorus ' + Math.floor(frac * 100) + '% · kills fill it', cx, cy + r + 8, UI.font(12), UI.C.dim, 'center');
  }

  function drawPackList(g, world) {
    var UI = PB.UI, rows = packRows(world), x = 12, y = 130;
    if (!rows.length) return;
    rows.forEach(function (r, i) {
      var yy = y + i * 20;
      if (r.count !== undefined) {
        glyph(g, r.type === 'fused' ? 'wolf' : r.type, x + 9, yy + 8, 22);
        UI.text(g, r.count + ' × ' + r.name, x + 24, yy + 1, UI.font(13, true), r.type === 'fused' ? UI.C.gold : UI.C.bone);
        return;
      }
      g.fillStyle = COLORS[r.type] || UI.C.gold; g.beginPath(); g.arc(x + 6, yy + 8, 4, 0, Math.PI * 2); g.fill();
      UI.text(g, (r.denMother ? '★ ' : '') + r.name + (r.temp ? '' : ' ' + r.level), x + 16, yy + 1, UI.font(12), r.denMother || r.fused ? UI.C.gold : r.temp ? UI.C.dim : UI.C.bone);
      g.fillStyle = 'rgba(40,10,8,0.85)'; g.fillRect(x + 128, yy + 5, 60, 5);
      g.fillStyle = r.hp > 0.35 ? '#7fd36f' : '#e2483a'; g.fillRect(x + 128, yy + 5, 60 * r.hp, 5);
      if (r.ready) UI.text(g, '!', x + 194, yy - 1, UI.font(14, true), UI.C.gold);
    });
  }

  function drawTop(g, world) {
    var UI = PB.UI, ds = PB.Director.status(world);
    UI.text(g, 'Esc: pause & help', 12, 10, UI.font(12), UI.C.faint);
    if (!ds) return;
    var head = ds.name + (ds.moon ? ' · Moon ' + ds.moon : '') + ' · ' + (ds.wave > PB.Waves.WAVES_PER_ZONE ? 'Boss' : 'Wave ' + ds.wave + ' / ' + PB.Waves.WAVES_PER_ZONE);
    if (ds.state === 'victory') head = ds.name + (ds.moon ? ' · Moon ' + ds.moon : '') + ' · Cleared · Esc, then Leave, when you are done · the wood still hunts';
    else if (ds.state === 'lull') head += ' · Lull ' + Math.ceil(ds.lull) + 's (eat, loot' + (world.shrine ? ', T at the shrine' : '') + ')';
    else if (ds.state === 'wave' && !ds.boss) head += ' · ' + ds.left + ' left';
    g.save(); g.shadowColor = 'rgba(0,0,0,0.95)'; g.shadowBlur = 6;
    UI.text(g, head, LW / 2, 10, UI.font(17, true), '#e8d8a8', 'center'); g.restore();
    if (!(ds.boss && !ds.boss.dead)) {
      var pulse = PB.Director.huntLine(world);
      if (pulse) { g.save(); g.shadowColor = 'rgba(0,0,0,0.95)'; g.shadowBlur = 6; UI.text(g, pulse, LW / 2, 30, UI.font(13), '#cbb98a', 'center'); g.restore(); }
    }
    var onLash = 0, li;
    for (li = 0; li < world.ents.length; li++) if (world.ents[li].lashed > 0 && !world.ents[li].dead) onLash++;
    if (onLash) { g.save(); g.shadowColor = 'rgba(0,0,0,0.95)'; g.shadowBlur = 6; UI.text(g, 'The pack is on your lash', LW / 2, ds.boss && !ds.boss.dead ? 100 : 66, UI.font(13, true), '#b6e36a', 'center'); g.restore(); }
    var pts = pointsLine(world);
    if (pts) {
      var py = ds.boss && !ds.boss.dead ? 80 : 48; // the boss bar owns the line under the title
      g.save(); g.shadowColor = 'rgba(0,0,0,0.95)'; g.shadowBlur = 6; UI.text(g, pts, LW / 2, py, UI.font(14, true), '#ffd678', 'center'); g.restore();
    }
    var setLine = world.save && PB.Sets ? PB.Sets.line(world.save) : '';
    if (setLine) { g.save(); g.shadowColor = 'rgba(0,0,0,0.95)'; g.shadowBlur = 6; UI.text(g, setLine, 12, 108, UI.font(12), '#8fe07a'); g.restore(); }
    if (world.boon) {
      var bn = world.boon, bl = bn.name + (bn.until ? ' ' + Math.max(0, Math.ceil(bn.until - world.time)) + 's' : (bn.waveBound ? ' this wave' : ''));
      g.save(); g.shadowColor = 'rgba(0,0,0,0.95)'; g.shadowBlur = 6; UI.text(g, bl, 12, 126, UI.font(13, true), bn.cursed ? '#e85a4a' : '#ffd678'); g.restore();
    }
    if (ds.boss && !ds.boss.dead) {
      var bb = ds.boss, bw = 460, bx = LW / 2 - bw / 2, by = 38, f = Math.max(0, bb.hp / bb.maxHp);
      g.fillStyle = 'rgba(5,5,5,0.85)'; g.fillRect(bx - 3, by - 3, bw + 6, 20);
      var gr = g.createLinearGradient(0, by, 0, by + 14); gr.addColorStop(0, '#e2543a'); gr.addColorStop(1, '#8a1c12');
      g.fillStyle = '#2a0b08'; g.fillRect(bx, by, bw, 14); g.fillStyle = gr; g.fillRect(bx, by, bw * f, 14);
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(bx + bw / 2 - 1, by - 4, 2, 22); // the phase-2 notch at 50%
      UI.text(g, (PB.BOSSES[bb.type] || {}).name || bb.type, LW / 2, by + 20, UI.font(14, true), UI.C.gold, 'center');
      if ((bb.phase || 1) > 1) UI.text(g, 'phase 2', bx + bw + 10, by, UI.font(12), UI.C.red);
    }
  }

  function drawArrows(g, world, cam) {
    var list = arrows(world, cam);
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      g.save(); g.translate(a.x, a.y); g.rotate(a.angle);
      g.fillStyle = a.grove ? (a.color || '#ffd44a') : a.boss ? '#ffd678' : a.elite ? '#ff9f5a' : 'rgba(226,72,58,0.85)';
      var s = a.boss ? 14 : 9;
      g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.7, -s * 0.7); g.lineTo(-s * 0.3, 0); g.lineTo(-s * 0.7, s * 0.7); g.closePath(); g.fill();
      g.restore();
    }
  }

  function drawToasts(g, toasts) {
    var UI = PB.UI;
    for (var k = 0; k < toasts.length; k++) {
      var tt = toasts[k], fade = Math.min(1, (tt.life - tt.t) / 0.4, tt.t / 0.15);
      g.globalAlpha = Math.max(0, fade);
      var y = LH - 170 - (toasts.length - 1 - k) * 22, w = UI.measure(g, tt.text, UI.font(14)) + 24;
      g.fillStyle = 'rgba(8,10,9,0.6)'; g.fillRect(LW / 2 - w / 2, y - 3, w, 21);
      UI.text(g, tt.text, LW / 2, y, UI.font(14), '#ffd6a0', 'center');
    }
    g.globalAlpha = 1;
  }

  function drawBanner(g, b) {
    if (!b || b.t >= b.life) return;
    var UI = PB.UI, k = Math.min(1, b.t / 0.25, (b.life - b.t) / 0.6);
    g.globalAlpha = Math.max(0, k);
    g.save(); g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 12;
    UI.text(g, b.text, LW / 2, 150, 'bold 44px ' + UI.FACE, UI.C.bone, 'center');
    if (b.sub) UI.text(g, b.sub, LW / 2, 202, UI.font(17), UI.C.gold, 'center');
    g.restore(); g.globalAlpha = 1;
  }

  // info: {now, toasts, waveBanner, cam}
  function draw(g, world, info) {
    var p = world.player, now = info.now || 0, cam = info.cam || PB.Render.cam;
    drawArrows(g, world, cam);
    var bar = stoneBar();
    if (bar) g.drawImage(bar, 0, LH - BAR_H - 10);
    orb(g, 84, LH - 84, 62, p.hp / p.maxHp, '#6a0d0d', '#e2433a', p.maxHp >= 1e8 ? '∞' : Math.max(0, Math.ceil(p.hp)) + '', now); // ∞: a debug-unkillable druid
    orb(g, LW - 84, LH - 84, 62, p.spirit / p.maxSpirit, '#0c2a6a', '#4f8de0', Math.floor(p.spirit) + '', now + 1.3);
    PB.UI.text(g, 'Life', 84, LH - 174, PB.UI.font(11), PB.UI.C.dim, 'center');
    if (p.maxHp < 1e8 && p.hp > 0 && p.hp / p.maxHp <= 0.3) PB.UI.text(g, 'Hurt', 84, LH - 196, PB.UI.font(16, true), '#e2433a', 'center');
    PB.UI.text(g, 'Spirit', LW - 84, LH - 174, PB.UI.font(11), PB.UI.C.dim, 'center');
    if (!world.mods.behaviors.bloodbound && p.spirit < PB.Roster.costFor('wolf', world.mods)) PB.UI.text(g, 'Low', LW - 84, LH - 196, PB.UI.font(16, true), '#4f8de0', 'center');
    drawSummonBar(g, world);
    drawCommandRow(g, world, now);
    drawChorus(g, world, now);
    drawPackList(g, world);
    drawTop(g, world);
    drawBanner(g, info.waveBanner);
    drawToasts(g, info.toasts || []);
  }

  // The phone panel (index.html #phone): the zone line, the two orbs and the pack in readable text, plus the newest toast.
  function phoneLines(world, G) {
    var ds = PB.Director.status(world), p = world.player, lines = [];
    lines.push(ds ? ds.name + ' · ' + (ds.wave > PB.Waves.WAVES_PER_ZONE ? 'Boss' : 'Wave ' + ds.wave + ' / ' + PB.Waves.WAVES_PER_ZONE) +
      (ds.state === 'wave' && !ds.boss ? ' · ' + ds.left + ' left' : ds.state === 'lull' ? ' · Lull' : '') : 'The field');
    lines.push('Life ' + (p.maxHp >= 1e8 ? '∞' : Math.max(0, Math.ceil(p.hp)) + ' / ' + Math.ceil(p.maxHp)) + ' · Spirit ' + Math.floor(p.spirit) + ' / ' + Math.floor(p.maxSpirit));
    lines.push('Pack ' + world.counts.summon + ' · Enemies ' + world.counts.enemy + ' · Chorus ' + Math.round(world.chorus ? world.chorus.meter : 0) + '%');
    if (world.boon) lines.push(world.boon.name + (world.boon.cursed ? ' (cursed)' : ''));
    else if (world.grove) lines.push(world.grove.name + ' in the wood');
    var t = G && G.toasts && G.toasts[G.toasts.length - 1];
    if (t) lines.push(t.text);
    var hunt = PB.Director.huntLine(world);
    if (hunt) lines.push(hunt);
    var pts = pointsLine(world);
    if (pts) lines.push(pts);
    var setLine = world.save && PB.Sets ? PB.Sets.line(world.save) : '';
    if (setLine) lines.push(setLine);
    return lines;
  }

  function pointsLine(world) {
    var s = world.save;
    if (!s || !s.player) return '';
    var left = PB.Skills.pointsLeft(s.player);
    if (!left) return '';
    var key = PB.Input.keyOf ? PB.Input.keyOf('skills') : 'K';
    return key + ': ' + left + ' skill point' + (left === 1 ? '' : 's');
  }

  PB.HUD = { draw: draw, phoneLines: phoneLines, pointsLine: pointsLine, summonBar: summonBar, commandRow: commandRow, packRows: packRows, arrows: arrows, denWait: denWait, LIST_MAX: LIST_MAX, COLORS: COLORS };
})(globalThis.PB = globalThis.PB || {});
