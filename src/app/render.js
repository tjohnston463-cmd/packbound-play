// Canvas 2D render: letterboxed 1280x720 logical view, a follow camera with trauma shake, the baked zone ground and
// procedural sprites (sprites.js). Draw order: ground, decals (orders), telegraphs, corpses, ground rings, bodies
// sorted by y, particles, canopy, damage numbers, screen flashes, HUD.
(function (PB) {
  'use strict';
  var LW = 1280, LH = 720, LIGHT_SCALE = 4, FX_GLOWS = 10, FX_STRIPS = 8, SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
  // Per-zone night (High): the ambient darkness outside the light pools and its tint, the fog drifting through the mask,
  // and the weather drawn over the field.
  var LOOK = {
    mirewood:    { dark: [4, 10, 12], ambient: 0.56, fog: [120, 150, 135], fogA: 0.2, weather: 'fireflies' },
    emberfen:    { dark: [16, 6, 3], ambient: 0.5, fog: [70, 40, 28], fogA: 0.24, weather: 'embers' },
    frostpine:   { dark: [4, 9, 22], ambient: 0.5, fog: [175, 195, 215], fogA: 0.18, weather: 'snow' },
    stormcrag:   { dark: [6, 6, 16], ambient: 0.58, fog: [110, 112, 135], fogA: 0.16, weather: 'rain' },
    blightheart: { dark: [10, 3, 14], ambient: 0.6, fog: [95, 60, 115], fogA: 0.22, weather: 'spores' }
  };
  function look(world) { var z = PB.ZONES[(world && world.zoneIdx) || 0]; return LOOK[z && z.id] || LOOK.mirewood; }
  var COLORS = { wolf: '#a9b4bf', raven: '#8a8ec0', bear: '#d6ecf5', vine: '#6ab04a', spirit: '#ffd27a' };
  var GLOWING = { spirit: 'gold', omen: 'purple', twinspirit: 'gold', lifebloom: 'green', eldersbear: 'gold', staticwisp: 'gold', icewraith: 'frost', cinderimp: 'ember' };
  var INFUSION = { frost: 'frost', ember: 'ember', storm: 'gold', rot: 'green', stone: 'white' };
  var ELITE_HALO = { shielded: '#9fd8ff', hasted: '#f5e46a', vampiric: '#e0402f', splitting: '#8fae3a', warded: '#ffffff', packbane: '#b070ff' };
  var R = { canvas: null, ctx: null, scale: 1, cam: { x: LW / 2, y: LH / 2 }, atlas: null, digits: null, css: {},
            runner: { x: 0, y: 0 }, shake: { x: 0, y: 0, rot: 0 }, dt: 1 / 60, alpha: 1, time: 0, ground: null, groundFor: null, anim: new Map(), frame: 0, list: [] };

  function css(c) { return R.css[c] || (R.css[c] = PB.Juice.css(c)); }

  function init(canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d', { alpha: false });
    R.atlas = PB.Sprites.build(document);
    R.digits = R.atlas.digits;
    R.light = document.createElement('canvas'); R.light.width = LW / LIGHT_SCALE; R.light.height = LH / LIGHT_SCALE;
    R.lightCtx = R.light.getContext('2d');
    R.shadow = document.createElement('canvas'); R.shadow.width = 64; R.shadow.height = 32;
    var sg = R.shadow.getContext('2d'), gr = sg.createRadialGradient(32, 16, 2, 32, 16, 30);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 64, 32);
    resize();
    window.addEventListener('resize', resize);
    // Full-screen vignettes are baked up front: building one mid-fight (the first Hunt on High) costs a frame.
    R.vig = screenVignette(0.45, 0.95, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.38)');
    R.huntVig = screenVignette(0.35, 0.9, 'rgba(20,30,70,0)', 'rgba(20,30,70,0.45)');
  }

  // Fit 16:9 into the window, centred; backing store at min(devicePixelRatio, 1.5).
  function resize() {
    var c = R.canvas, k = Math.min(window.innerWidth / LW, window.innerHeight / LH);
    var cssW = Math.max(1, Math.floor(LW * k)), cssH = Math.max(1, Math.floor(LH * k));
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    // A narrow portrait screen puts the field at the top and the readable phone panel (index.html) under it.
    var phone = window.innerWidth <= 600 && window.innerHeight > window.innerWidth;
    c.style.marginTop = (phone ? 0 : Math.floor((window.innerHeight - cssH) / 2)) + 'px';
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    R.scale = c.width / LW;
  }

  function screenToWorld(clientX, clientY) {
    var b = R.canvas.getBoundingClientRect();
    return {
      x: (clientX - b.left) / (b.width || 1) * LW + R.cam.x - LW / 2,
      y: (clientY - b.top) / (b.height || 1) * LH + R.cam.y - LH / 2
    };
  }

  // Client pixels <-> the 1280x720 UI (logical) view.
  function screenToUI(clientX, clientY) {
    var b = R.canvas.getBoundingClientRect();
    return { x: (clientX - b.left) / (b.width || 1) * LW, y: (clientY - b.top) / (b.height || 1) * LH };
  }
  function uiToScreen(x, y) {
    var b = R.canvas.getBoundingClientRect();
    return { x: b.left + x / LW * b.width, y: b.top + y / LH * b.height };
  }

  // A frame with no field under it (Title, camp): clear and leave the logical UI transform set.
  function clear() {
    var g = R.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#07090b'; g.fillRect(0, 0, R.canvas.width, R.canvas.height);
    g.setTransform(R.scale, 0, 0, R.scale, 0, 0);
  }

  function worldToScreen(x, y) {
    var b = R.canvas.getBoundingClientRect();
    return { x: b.left + (x - R.cam.x + LW / 2) / LW * b.width, y: b.top + (y - R.cam.y + LH / 2) / LH * b.height };
  }

  function clampCam(world) {
    R.cam.x = Math.max(LW / 2, Math.min(world.width - LW / 2, R.cam.x));
    R.cam.y = Math.max(LH / 2, Math.min(world.height - LH / 2, R.cam.y));
  }

  function follow(world, snap, dt, alpha) {
    var p = PB.Graphics.pose(world.anchor || world.player, alpha == null ? 1 : alpha), k = snap ? 1 : 1 - Math.exp(-10 * (dt == null ? 1 / 60 : dt));
    R.cam.x += (p.x - R.cam.x) * k;
    R.cam.y += (p.y - R.cam.y) * k;
    clampCam(world);
  }

  function ring(g, x, y, r, color, width, dash) {
    g.strokeStyle = color; g.lineWidth = width || 2;
    if (dash) g.setLineDash(dash);
    g.beginPath(); g.arc(x, y, r, 0, PB.M.TAU); g.stroke();
    if (dash) g.setLineDash([]);
  }

  // The zone ground is baked once per world (value noise, props, boulders) and blitted by the visible rect.
  function drawGround(g, world, x0, y0) {
    // A zone entered before the sculpt shaders were ready is baked again (once) when they are, in its first seconds.
    if (R.groundFor === world && R.ground && !R.ground.sculpted && !R.ground.retried && PB.Sculpt && PB.Sculpt.ready()) { R.ground.retried = true; if (R.time - R.groundAt < 8) R.groundFor = null; }
    if (R.groundFor !== world) {
      R.ground = PB.Sprites.bakeChunks(PB.ZONES[world.zoneIdx || 0], world.seed, world.obstacles, document);
      R.groundFor = world; R.groundAt = R.time; R.anim.clear();
      (R.ground.lights || []).forEach(function (l) { l.glow = PB.Graphics.glowName(parseInt(String(l.color).slice(1), 16)); });
    }
    var tiles = R.ground.tiles;
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i], c = t.canvas;
      if (t.x + c.width < x0 || t.x > x0 + LW || t.y + c.height < y0 || t.y > y0 + LH) continue;
      // On whole device pixels at scale 1 the chunks abut exactly and blit unfiltered; otherwise (shake rotation, a
      // scaled window) each is drawn half a pixel oversize so no seam shows, at the cost of filtering the screen.
      if (R.exact) g.drawImage(c, t.x, t.y);
      else g.drawImage(c, t.x - 0.5, t.y - 0.5, c.width + 1, c.height + 1);
    }
    if (!R.low) {
      var tufts = R.ground.tufts;
      g.strokeStyle = R.ground.biome ? R.ground.biome.patch : PB.ZONES[world.zoneIdx || 0].palette[2]; g.globalAlpha = 0.55; g.lineWidth = 1.2; g.beginPath();
      for (var k = 0; k < tufts.length; k++) {
        var f = tufts[k];
        if (f.x < x0 || f.x > x0 + LW || f.y < y0 || f.y > y0 + LH + 16) continue;
        var sway = Math.sin(R.time * 1.8 + f.phase) * 3;
        g.moveTo(f.x - 2, f.y); g.quadraticCurveTo(f.x - 4, f.y - f.h / 2, f.x - 3 + sway, f.y - f.h);
        g.moveTo(f.x + 2, f.y); g.quadraticCurveTo(f.x + 4, f.y - f.h / 2, f.x + 3 + sway, f.y - f.h * 0.8);
      }
      g.stroke(); g.globalAlpha = 1;
    }
  }

  // The breaches the packs walk out of. A short mark on the edge, not a label.
  function drawGates(g, world) {
    var d = world.dir, gates = d && d.gates, edge;
    if (!gates) return;
    g.save();
    g.strokeStyle = 'rgba(140, 28, 18, 0.55)'; g.lineWidth = 3; g.lineCap = 'round';
    for (edge in gates) {
      var p = gates[edge];
      g.beginPath();
      if (edge === '0' || edge === '2') { g.moveTo(p.x - 34, p.y); g.lineTo(p.x + 34, p.y); }
      else { g.moveTo(p.x, p.y - 34); g.lineTo(p.x, p.y + 34); }
      g.stroke();
    }
    g.restore();
  }

  function drawSlaughterRing(g, world) {
    if (!PB.Slaughter) return;
    var n = PB.Slaughter.stacks(world);
    if (!n) return;
    var p = world.anchor || world.player;
    var col = n >= 15 ? 'rgba(255,220,140,0.8)' : n >= 10 ? 'rgba(255,70,40,0.75)' : n >= 5 ? 'rgba(255,160,70,0.7)' : 'rgba(210,190,150,0.4)';
    ring(g, p.x, p.y, 18 + n * 2.4, col, n >= 5 ? 3 : 1.5, n >= 5 ? null : [4, 5]);
  }

  function drawOrders(g, world) {
    var pack = world.pack, o = pack.order;
    if (o.kind === 'hold') { // spec §5: a green ring marks the 120px circle; the faint one is the +40px engage edge
      ring(g, o.x, o.y, o.r, 'rgba(120,220,120,0.7)', 2, [8, 6]);
      ring(g, o.x, o.y, o.r + 40, 'rgba(120,220,120,0.22)', 1, [4, 8]);
      ring(g, o.x, o.y, 6, 'rgba(120,220,120,0.9)', 2);
    }
    if (o.kind === 'focus') { var t = world.byId[o.targetId]; if (t) ring(g, t.x, t.y, t.r + 7, 'rgba(255,120,80,0.9)', 2, [4, 4]); }
    if (o.kind === 'trail' && o.path.length > 1) { // the Scent Trail: a faint line of scent and pawprints along it
      g.strokeStyle = 'rgba(200,230,150,0.22)'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(o.path[0].x, o.path[0].y);
      for (var i = 1; i < o.path.length; i++) g.lineTo(o.path[i].x, o.path[i].y);
      g.stroke();
      var carry = 0, n = 0;
      for (var k = 1; k < o.path.length; k++) {
        var a = o.path[k - 1], b = o.path[k], dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx);
        for (var d = carry; d < L; d += 28, n++) {
          var side = n % 2 ? 5 : -5;
          paw(g, a.x + dx * d / L - Math.sin(ang) * side, a.y + dy * d / L + Math.cos(ang) * side, ang, 'rgba(210,240,160,0.55)');
        }
        carry = d - L;
      }
    }
    if (pack.encircle) ring(g, pack.encircle.x, pack.encircle.y, pack.encircle.r, 'rgba(170,200,255,0.5)', 2, [8, 6]);
  }

  // One pawprint: a pad and three toes, pointing along ang.
  function paw(g, x, y, ang, color) {
    g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = color;
    g.beginPath(); g.ellipse(0, 0, 3.2, 2.6, 0, 0, PB.M.TAU); g.fill();
    g.beginPath(); g.arc(4.2, -2.6, 1.3, 0, PB.M.TAU); g.arc(4.8, 0, 1.3, 0, PB.M.TAU); g.arc(4.2, 2.6, 1.3, 0, PB.M.TAU); g.fill();
    g.restore();
  }

  // Bound pawprints (juice prints) and evolve swirls (three gold arcs spiralling in).
  function drawPrints(g, j) {
    for (var i = 0; i < j.prints.length; i++) {
      var p = j.prints[i];
      if (p.t <= 0) continue;
      paw(g, p.x, p.y, p.angle, 'rgba(230,220,180,' + (0.55 * (1 - p.t / p.life)).toFixed(3) + ')');
    }
    for (var k = 0; k < j.swirls.length; k++) {
      var w = j.swirls[k], u = w.t / w.life, rad = 64 * (1 - PB.M.easeOutCubic(u)) + 8;
      g.strokeStyle = 'rgba(255,214,120,' + (0.9 * (1 - u)).toFixed(3) + ')'; g.lineWidth = 3;
      for (var a = 0; a < 3; a++) {
        var st = u * 9 + a * PB.M.TAU / 3;
        g.beginPath(); g.arc(w.x, w.y - 10, rad, st, st + 1.4); g.stroke();
      }
    }
  }

  // Telegraphs (spec §9.1): circles and rings fill from the centre out inside a full-size outline; a line lane
  // grows to full length and flashes white for its last 60 ms; a cone wedge fills from the apex; a tether brightens.
  function drawTelegraphs(g, world) {
    var list = world.telegraphs || [];
    for (var i = 0; i < list.length; i++) {
      var tg = list[i], k = Math.min(1, tg.t / tg.tele), late = tg.tele - tg.t <= 0.06;
      var fill = 'rgba(214,72,40,' + (0.16 + 0.22 * k).toFixed(3) + ')', edge = late ? 'rgba(255,255,255,0.95)' : 'rgba(255,120,80,0.85)';
      if (tg.special === 'sever') fill = 'rgba(150,80,200,' + (0.06 + 0.12 * k).toFixed(3) + ')'; // the Unmaker's ring: violet, so the safe circles read
      if (tg.special === 'push') fill = 'rgba(200,220,255,' + (0.06 + 0.14 * k).toFixed(3) + ')';
      g.save();
      if (tg.kind === 'circle' || tg.kind === 'ring') {
        g.fillStyle = fill;
        g.beginPath(); g.arc(tg.x, tg.y, Math.max(1, tg.radius * k), 0, PB.M.TAU);
        if (tg.kind === 'ring' && tg.inner > 0) g.arc(tg.x, tg.y, Math.min(tg.inner, tg.radius * k), 0, PB.M.TAU, true);
        g.fill();
        ring(g, tg.x, tg.y, tg.radius, edge, 2);
        if (tg.kind === 'ring' && tg.inner > 0) ring(g, tg.x, tg.y, tg.inner, 'rgba(160,230,160,0.7)', 2, [5, 4]);
        if (tg.safe) tg.safe.forEach(function (s) { // Sever: three glowing safe circles
          g.fillStyle = 'rgba(170,255,200,' + (0.18 + 0.12 * Math.sin(R.frame * 0.15)).toFixed(3) + ')';
          g.beginPath(); g.arc(s.x, s.y, s.r, 0, PB.M.TAU); g.fill(); ring(g, s.x, s.y, s.r, 'rgba(200,255,220,0.95)', 3);
        });
      } else if (tg.kind === 'line') {
        g.translate(tg.x, tg.y); g.rotate(tg.angle);
        g.fillStyle = late ? 'rgba(255,255,255,0.75)' : fill;
        g.fillRect(0, -tg.width / 2, tg.length * k, tg.width);
        g.strokeStyle = edge; g.lineWidth = 1.5; g.strokeRect(0, -tg.width / 2, tg.length, tg.width);
      } else if (tg.kind === 'cone') {
        var half = tg.arc * Math.PI / 360;
        g.fillStyle = fill;
        g.beginPath(); g.moveTo(tg.x, tg.y); g.arc(tg.x, tg.y, Math.max(1, tg.radius * k), tg.angle - half, tg.angle + half); g.closePath(); g.fill();
        g.strokeStyle = edge; g.lineWidth = 2;
        g.beginPath(); g.moveTo(tg.x, tg.y); g.arc(tg.x, tg.y, tg.radius, tg.angle - half, tg.angle + half); g.closePath(); g.stroke();
      } else if (tg.kind === 'tether' && tg.tx !== undefined) {
        g.strokeStyle = 'rgba(190,140,255,' + (0.3 + 0.7 * k).toFixed(3) + ')'; g.lineWidth = 1 + 3 * k;
        g.setLineDash([6, 4]); g.lineDashOffset = -tg.t * 60;
        g.beginPath(); g.moveTo(tg.x, tg.y); g.lineTo(tg.tx, tg.ty); g.stroke();
      }
      g.restore();
    }
  }

  // Presentation-only animation state per body (never written onto sim entities: they are hashed).
  function animOf(e) {
    var st = R.anim.get(e.id);
    if (!st) { st = { ph: (e.id * 0.37) % 1, face: 1, turn: 1, age: 0, x: e.x, y: e.y, seen: 0 }; R.anim.set(e.id, st); }
    var dx = e.x - st.x, dy = e.y - st.y, d = Math.sqrt(dx * dx + dy * dy);
    st.ph = (st.ph + d / Math.max(14, (e.r || 12) * 2.8)) % 1;
    var vx = e.vx || dx * 60;
    if (Math.abs(vx) > 6) st.face = vx < 0 ? -1 : 1;
    else if (e.team === 1 && e.facing !== undefined) st.face = Math.cos(e.facing) < 0 ? -1 : 1;
    st.turn = PB.Graphics.ease(st.turn, st.face, 18, R.dt); st.age += R.dt;
    st.x = e.x; st.y = e.y; st.seen = R.frame;
    return st;
  }

  // k: draw scale (a body grown past its atlas size: Fenrir, elites, the Great Bear, a Splitting copy).
  function blit(g, sheet, sp, frame, x, y, face, k) {
    var sz = sp.cell, dz = sp.size * (k || 1);
    if (face < 0) {
      g.save(); g.translate(x, y); g.scale(-1, 1);
      g.drawImage(sheet, frame * sz, 0, sz, sz, -dz / 2, -dz / 2, dz, dz);
      g.restore();
    } else g.drawImage(sheet, frame * sz, 0, sz, sz, x - dz / 2, y - dz / 2, dz, dz);
  }

  function animatedBlit(g, sheet, sp, frame, x, y, st, scale, kick) {
    var spawn = Math.max(0, 1 - st.age / 0.4), attack = kick ? Math.sin(kick / 0.4 * Math.PI) * 0.18 : 0;
    var breath = Math.sin(R.time * 2.5 + st.ph * 6) * 0.018;
    var sx = 1 + attack + spawn * 0.25, sy = 1 - attack * 0.65 - spawn * 0.2 + breath;
    g.save(); g.translate(x, y); g.scale(sx * (0.76 + 0.24 * Math.abs(st.turn)), sy);
    blit(g, sheet, sp, frame, 0, 0, st.turn < 0 ? -1 : 1, scale); g.restore();
  }
  // Contact shadow, nudged down-right: the key light comes from the upper left.
  function shadow(g, e) { g.drawImage(R.shadow, e.x - e.r * 1.7, e.y + e.r * 0.3, e.r * 3.8, e.r * 1.3); }

  // The live body radius over the radius its sprite was baked at (1 when unchanged).
  function bodyScale(e) {
    var base = PB.Sprites.radiusOf(e.type);
    if (!base || !e.r || Math.abs(e.r - base) < 0.02 * base) return 1;
    return e.r / base;
  }

  // Team ring under every body in the field, so a crowd reads as pack versus enemies: moss green for the pack,
  // red for enemies (bosses have their own bar and size).
  var PACK_RING = 'rgba(120,224,150,0.9)', ENEMY_RING = 'rgba(226,60,48,0.9)';
  function teamRing(e) { return e.denMother ? 'rgba(226,197,106,0.95)' : e.team === 1 ? ENEMY_RING : PACK_RING; }

  // Body glows come in few sizes, so each is cached pre-scaled and drawn 1:1 at whole pixels: a software canvas then
  // skips filtering (about half the raster time of a scaled blit). Burst glows grow every frame and stay scaled.
  var glowCache = new Map();
  function glowSprite(name, r) {
    var size = Math.max(4, Math.round(r * 2)), key = name + size, c = glowCache.get(key);
    if (c || glowCache.size >= 96) return c || null;
    c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(R.atlas.glows[name], 0, 0, size, size);
    glowCache.set(key, c); return c;
  }
  function glowAt(g, name, x, y, r, alpha, scaled) {
    if (R.low || R.hunt) return; // low-end mode and the Hunt's moonlight skip glows
    var c = R.atlas.glows[name];
    if (!c) return;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha;
    var pre = !scaled && glowSprite(name, r);
    if (pre) g.drawImage(pre, Math.round(x - pre.width / 2), Math.round(y - pre.width / 2));
    else g.drawImage(c, x - r, y - r, r * 2, r * 2);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }

  function drawBody(g, e, j) {
    var sp = R.atlas.bodies[e.type], st = animOf(e), lift = e.flying ? 10 : 0, k = bodyScale(e);
    shadow(g, e);
    if (!e.boss) { // team ring on the ground
      g.strokeStyle = teamRing(e); g.lineWidth = e.denMother ? 2.5 : e.team === 1 ? 2 : 1.5; g.globalAlpha = e.team === 1 ? 0.8 : 0.7;
      g.beginPath(); g.ellipse(e.x, e.y + e.r * 0.75, e.r + 2, e.r * 0.45 + 1, 0, 0, PB.M.TAU); g.stroke(); g.globalAlpha = 1;
    }
    if (e.fenrir) { // Fenrir's Collar: the merged giant wolf keeps a pale moon halo for as long as it lasts
      glowAt(g, 'frost', e.x, e.y - lift, e.r * 2.6, 0.5);
      ring(g, e.x, e.y + e.r * 0.3, e.r + 9 + 2 * Math.sin(R.frame * 0.1), 'rgba(200,225,255,0.8)', 2);
    }
    // One glow per body (each is an additive blit, the costliest pixels on a software canvas): its own light first.
    if (GLOWING[e.type]) glowAt(g, GLOWING[e.type], e.x, e.y - lift, e.r * 2.4, 0.55);
    else if (e.infusion) glowAt(g, INFUSION[e.infusion] || 'gold', e.x, e.y, e.r * 2.4, 0.32);
    if (sp) {
      var sheet = j.flashes.get(e.id) > 0 ? sp.white : (e.infusion && sp.tints[e.infusion]) || sp.sheet;
      var frame = Math.floor(st.ph * sp.frames) % sp.frames, bob = Math.sin(R.time * (e.flying ? 7 : 2.5) + e.id) * (e.flying ? 2.5 : 0.6);
      if (e.linkCut > 0) g.globalAlpha = 0.55;
      if (e.thrallT > 0 || e.shade) ring(g, e.x, e.y - lift, e.r + 7, 'rgba(160,220,255,0.85)', 2, [2, 3]); // Thralled / Mimic shade
      if (e.emergeT > 0) { g.globalAlpha = 1 - e.emergeT / PB.Director.EMERGE; ring(g, e.x, e.y + e.r * 0.5, e.r * (1 + e.emergeT * 2), 'rgba(20,10,10,0.6)', 3); g.globalAlpha = 1 - e.emergeT / PB.Director.EMERGE; }
      animatedBlit(g, sheet, sp, frame, e.x, e.y - lift - e.r * 0.15 + bob, st, k, j.kicks.get(e.id));
      g.globalAlpha = 1;
    }
    var top = e.y - lift - e.r * 1.25;
    if (e.indId && e.team === 0 && R.world && R.world.inds[e.indId] && R.world.inds[e.indId].fusedFrom) { // a fused summon wears its name
      g.font = '12px ' + SERIF; g.textAlign = 'center'; g.fillStyle = '#ffd678';
      g.fillText(R.world.inds[e.indId].name, e.x, top - 22); g.textAlign = 'left';
    }
    if (e.denMother) {
      g.font = '12px ' + SERIF; g.textAlign = 'center'; g.fillStyle = '#e2c56a';
      g.fillText('Den Mother', e.x, top - (e.indId && R.world && R.world.inds[e.indId] && R.world.inds[e.indId].fusedFrom ? 36 : 22));
      g.textAlign = 'left';
    }
    if (e.lashed > 0) { g.strokeStyle = '#b6e36a'; g.lineWidth = 2; g.beginPath(); g.arc(e.x, e.y - lift, e.r + 5, 0, PB.M.TAU); g.stroke(); }
    if (e.marked > 0) { // red eye glyph
      g.fillStyle = '#ff5a5a'; g.beginPath(); g.ellipse(e.x, top - 10, 6, 3.2, 0, 0, PB.M.TAU); g.fill();
      g.fillStyle = '#300'; g.beginPath(); g.arc(e.x, top - 10, 1.8, 0, PB.M.TAU); g.fill();
    }
    if (e.rooted > 0) { g.strokeStyle = '#6ab04a'; g.lineWidth = 2; g.beginPath(); g.ellipse(e.x, e.y + e.r * 0.4, e.r, e.r * 0.4, 0, 0, PB.M.TAU); g.stroke(); }
    if (e.shield > 0) ring(g, e.x, e.y - lift, e.r + 4, 'rgba(140,200,255,0.7)', 2);
    if (e.linkCut > 0) ring(g, e.x, e.y - lift, e.r + 5, 'rgba(190,140,255,0.8)', 2, [3, 3]);
    if (!R.lit) drawMarks(g, e);
  }
  // Elite halo and life bar. Under High's light mask they are drawn after it (drawLit), so a threat at the edge of the
  // view keeps its full-strength marks.
  function drawMarks(g, e) {
    var top = e.y - (e.flying ? 10 : 0) - e.r * 1.25;
    if (e.champion) ring(g, e.x, e.y + e.r * 0.2, e.r + 9, '#e8a040', 2, [5, 3]);
    if (e.elite && e.elite.length) ring(g, e.x, e.y + e.r * 0.2, e.r + 6, ELITE_HALO[e.elite[0]] || '#fff', 2);
    var world = R.world, quarry = world && e.team === 1 && PB.Waves.isQuarry(world.dir, e.type);
    if (quarry) {
      ring(g, e.x, e.y + e.r * 0.2, e.r + 11, '#ffd678', 2, [4, 3]);
      g.font = '11px ' + SERIF; g.textAlign = 'center'; g.fillStyle = '#ffd678';
      g.fillText('quarry', e.x, top - 16); g.textAlign = 'left';
    }
    if (e.champion) {
      g.font = '11px ' + SERIF; g.textAlign = 'center'; g.fillStyle = '#e8a040';
      g.fillText('champion', e.x, top - (quarry ? 30 : 16)); g.textAlign = 'left';
    }
    if (e.packLead && e.packName) {
      g.font = 'bold 13px ' + SERIF; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(10,6,4,0.9)'; g.fillStyle = '#ffd678';
      var ny = top - (quarry || e.champion ? 46 : 28);
      g.strokeText(e.packName, e.x, ny); g.fillText(e.packName, e.x, ny); g.textAlign = 'left';
    } else if (e.retinue) {
      ring(g, e.x, e.y + e.r * 0.2, e.r + 4, e.enraged ? '#ff5a3a' : 'rgba(255,214,120,0.7)', 1.5, [2, 3]);
    }
    if (e.enraged) {
      g.font = '11px ' + SERIF; g.textAlign = 'center'; g.fillStyle = '#ff5a3a';
      g.fillText('enraged', e.x, top - 14); g.textAlign = 'left';
    }
    if (e.ward && PB.Wards) {
      var cracked = world && e.wardBreak > world.time;
      ring(g, e.x, e.y + e.r * 0.2, e.r + 14, cracked ? '#9a9a9a' : (PB.Wards.COLOR[e.ward] || '#fff'), 2, cracked ? [2, 4] : [6, 3]);
      g.font = '11px ' + SERIF; g.textAlign = 'center';
      g.fillStyle = cracked ? '#b6e36a' : (PB.Wards.COLOR[e.ward] || '#fff');
      g.fillText(cracked ? 'ward cracked' : PB.Wards.NAMES[e.ward] + ' Ward', e.x, top - (quarry || e.champion ? 44 : 30));
      g.textAlign = 'left';
    }
    if (e.elite && e.elite.length) {
      var names = [], ei;
      for (ei = 0; ei < e.elite.length; ei++) {
        var mod = null, mj;
        for (mj = 0; mj < PB.ELITE_MODS.length; mj++) if (PB.ELITE_MODS[mj].id === e.elite[ei]) mod = PB.ELITE_MODS[mj];
        if (mod) names.push(mod.name);
      }
      if (names.length) {
        g.font = '11px ' + SERIF; g.textAlign = 'center'; g.fillStyle = '#ffb070';
        g.fillText(names.join(' · '), e.x, top - (quarry ? 30 : 16)); g.textAlign = 'left';
      }
    }
    var order = world && world.pack && world.pack.order;
    if (order && order.kind === 'focus' && order.targetId === e.id) ring(g, e.x, e.y - (e.flying ? 10 : 0), e.r + 14, '#fff2c4', 2);
    if (e.hp < e.maxHp && e.maxHp < 1e8) {
      var w = Math.max(16, e.r * 2), f = Math.max(0, e.hp / e.maxHp);
      g.fillStyle = '#2a0b08'; g.fillRect(e.x - w / 2, top, w, 3);
      g.fillStyle = e.team === 0 ? '#7fd36f' : '#e2483a'; g.fillRect(e.x - w / 2, top, w * f, 3);
    }
  }

  function drawPlayer(g, world, j) {
    var p = world.player, q = PB.Input.queue, cls = PB.Classes.of(world.save), sp = R.atlas.bodies[cls.body] || R.atlas.bodies.druid, st = animOf(p);
    shadow(g, p);
    glowAt(g, cls.glow || 'green', p.x, p.y - 6, 55, 0.17);
    if (q) {
      var a = Math.atan2(q.aim.y - p.y, q.aim.x - p.x);
      if (!(Math.abs(p.vx || 0) > 6) && Math.abs(Math.cos(a)) > 0.2) st.face = Math.cos(a) < 0 ? -1 : 1;
      g.strokeStyle = 'rgba(230,220,170,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22); g.lineTo(p.x + Math.cos(a) * 34, p.y + Math.sin(a) * 34); g.stroke();
      if (q.held && q.held.thornlash && cls.attack === 'thornlash') {
        var reach = PB.Player.lashReach ? PB.Player.lashReach(world) : PB.Player.LASH_R, half = 35 * Math.PI / 180;
        g.strokeStyle = 'rgba(230,220,170,0.35)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, reach, a - half, a + half); g.closePath(); g.stroke();
      } else if (q.held && q.held.thornlash && cls.attack === 'bonespear') {
        g.strokeStyle = 'rgba(232,220,190,0.45)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 300); g.stroke();
      } else if (q.held && q.held.thornlash && cls.attack === 'fireball') {
        var fx = p.x + Math.cos(a) * 220, fy = p.y + Math.sin(a) * 220;
        g.strokeStyle = 'rgba(255,140,60,0.45)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(fx, fy, 74, 0, Math.PI * 2); g.stroke();
      } else if (q.held && q.held.thornlash && cls.attack === 'zeal') {
        var zr = 78, zh = 55 * Math.PI / 180;
        g.strokeStyle = 'rgba(255,220,140,0.55)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, zr, a - zh, a + zh); g.closePath(); g.stroke();
      } else if (q.held && q.held.thornlash && cls.attack === 'fury') {
        g.strokeStyle = 'rgba(230,197,106,0.55)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a) * 280, p.y + Math.sin(a) * 280); g.stroke();
      } else if (q.held && q.held.thornlash && cls.attack === 'whirl') {
        g.strokeStyle = 'rgba(255,150,70,0.55)'; g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, 72, 0, Math.PI * 2); g.stroke();
      }
    }
    if (p.reelT > 0) {
      g.strokeStyle = 'rgba(226,64,48,0.9)'; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, p.r + 7, 0, Math.PI * 2); g.stroke();
    }
    if (p.iframes > 0) g.globalAlpha = 0.5;
    animatedBlit(g, j.flashes.get(0) > 0 ? sp.white : sp.sheet, sp, Math.floor(st.ph * sp.frames) % sp.frames, p.x, p.y - p.r * 0.3, st, 1, j.kicks.get(0));
    g.globalAlpha = 1;
  }

  // Corpses (sim, world.corpses): the body's first frame lying on its side, fading as it rots (8 s) or is eaten.
  function drawCorpses(g, world, x0, y0) {
    var list = world.corpses || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i], sp = R.atlas.bodies[c.type];
      if (!sp || c.x < x0 - 80 || c.x > x0 + LW + 80 || c.y < y0 - 80 || c.y > y0 + LH + 80) continue;
      g.save(); g.translate(c.x, c.y); g.rotate(c.id % 2 === 0 ? Math.PI / 2 : -Math.PI / 2);
      g.globalAlpha = 0.5 * Math.min(1, c.t / PB.Feeding.CORPSE_T + 0.25);
      g.drawImage(sp.sheet, 0, 0, sp.cell, sp.cell, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  // Loot beams (world.drops): a tall light column in the rarity color over a glowing gem; labels when close.
  var BEAM = { common: '216,216,216', magic: '111,156,255', rare: '255,212,74', set: '78,207,106', unique: '232,135,58', moonstone: '159,192,255', rune: '125,204,160', tome: '214,186,120', 'flask-life': '196,56,56', 'flask-spirit': '79,141,224', 'flask-moon': '192,128,224' };
  // Ground names: drops within 160px of the druid; holding Alt (labels) names every drop on screen.
  var LABEL_R = 160;
  function onScreen(d, x0, y0) { return !(d.x < x0 - 40 || d.x > x0 + LW + 40 || d.y < y0 - 200 || d.y > y0 + LH + 40); }
  function labelledDrops(world, x0, y0, alt) {
    var p = world.player;
    return (world.drops || []).filter(function (d) {
      if (!onScreen(d, x0, y0)) return false;
      var dx = d.x - p.x, dy = d.y - p.y, reach = d.tome || d.rune || (d.item && (d.item.upgrade || d.item.unread)) ? 280 : LABEL_R;
      return alt || dx * dx + dy * dy < reach * reach;
    });
  }
  function drawDrops(g, world, x0, y0, alt) {
    var list = world.drops || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i], key = d.tome ? 'tome' : d.flask ? 'flask-' + d.flask : d.rune ? 'rune' : d.item ? d.item.rarity : 'moonstone', c = BEAM[key] || BEAM.common;
      if (!onScreen(d, x0, y0)) continue;
      var tall = key.indexOf('flask') === 0 ? 36 : key === 'common' ? 50 : key === 'magic' ? 90 : key === 'rune' ? 130 : 150, pulse = 0.75 + 0.25 * Math.sin(R.frame * 0.08 + d.id);
      if (!R.beams) R.beams = {};
      if (!R.beams[key]) {
        var bc = document.createElement('canvas'); bc.width = 16; bc.height = 160;
        var bg = bc.getContext('2d'), grad = bg.createLinearGradient(0, 0, 0, 160);
        grad.addColorStop(0, 'rgba(' + c + ',0)'); grad.addColorStop(1, 'rgba(' + c + ',0.65)');
        bg.fillStyle = grad; bg.fillRect(0, 0, 16, 160); R.beams[key] = bc;
      }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = pulse;
      g.drawImage(R.beams[key], d.x - 7, d.y - tall, 14, tall);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.fillStyle = 'rgb(' + c + ')';
      g.beginPath(); g.moveTo(d.x, d.y - 7); g.lineTo(d.x + 5, d.y); g.lineTo(d.x, d.y + 5); g.lineTo(d.x - 5, d.y); g.closePath(); g.fill();
    }
    // Names: the same set labelledDrops returns, stacked upward so a cluster of drops stays legible.
    var named = labelledDrops(world, x0, y0, alt), placed = [];
    g.font = '12px ' + SERIF; g.textAlign = 'center';
    for (var n = 0; n < named.length; n++) {
      var dd = named[n], runeName = dd.rune && PB.RUNE_BY_ID[dd.rune] ? PB.RUNE_BY_ID[dd.rune].name : null;
      var flaskName = dd.flask && PB.Belt ? PB.Belt.label(world.save, dd.flask) : null;
      var itemName = dd.item ? (PB.Loot.publicName ? PB.Loot.publicName(dd.item) : dd.item.name) + (!dd.item.unread && dd.item.upgrade ? ' +' : '') : null;
      var text = dd.tome ? 'Tome' : flaskName || runeName || itemName || 'Moonstone', tw = g.measureText(text).width, ly = dd.y - 12;
      for (var tries = 0; tries < 12; tries++) {
        var hit = false;
        for (var q = 0; q < placed.length; q++) {
          var o = placed[q];
          if (Math.abs(o.x - dd.x) < (o.w + tw) / 2 + 2 && Math.abs(o.y - ly) < 12) { hit = true; break; }
        }
        if (!hit) break;
        ly -= 13;
      }
      placed.push({ x: dd.x, y: ly, w: tw });
      g.fillStyle = 'rgb(' + (BEAM[dd.tome ? 'tome' : dd.flask ? 'flask-' + dd.flask : dd.rune ? 'rune' : dd.item ? dd.item.rarity : 'moonstone'] || BEAM.common) + ')';
      g.fillText(text, dd.x, ly);
    }
    g.textAlign = 'left';
  }

  // What T (Interact) does at the shrine (the pause sheet's Interact row), plus a J (Pack) hint when a summon is ready
  // to evolve. Both name the player's current keys.
  function shrinePrompt(world) {
    var ready = world.save ? world.save.roster.filter(function (x) { return PB.Evolution.canEvolve(x); }).length : 0;
    return PB.Input.keyOf('interact') + ': open the Fusion Altar' + (ready ? ' · ' + PB.Input.keyOf('pack') + ': evolve ' + (ready === 1 ? 'the 1 summon' : 'the ' + ready + ' summons') + ' ready first' : '');
  }

  // The Fusion Shrine: a ring of standing stones around a moonlit basin; it brightens when the druid is in reach.
  function drawShrine(g, world) {
    var s = world.shrine;
    if (!s) return;
    var p = world.player, inReach = (p.x - s.x) * (p.x - s.x) + (p.y - s.y) * (p.y - s.y) <= s.r * s.r;
    var pulse = 0.5 + 0.5 * Math.sin(R.frame * 0.05);
    g.globalAlpha = inReach ? 0.5 + 0.3 * pulse : 0.25 + 0.1 * pulse;
    g.fillStyle = '#9fc0ff'; g.beginPath(); g.ellipse(s.x, s.y, 34, 20, 0, 0, PB.M.TAU); g.fill();
    g.globalAlpha = 1;
    for (var i = 0; i < 6; i++) { // standing stones: a lit face, a shadow face and a rune that wakes with the basin
      var a = i / 6 * PB.M.TAU, x = s.x + Math.cos(a) * 54, y = s.y + Math.sin(a) * 34, hh = 26 + (i % 3) * 5;
      g.drawImage(R.shadow, x - 12, y - 3, 28, 9);
      g.fillStyle = '#3e4148'; g.beginPath(); g.moveTo(x - 7, y + 2); g.lineTo(x - 6, y - hh + 3); g.lineTo(x - 1, y - hh); g.lineTo(x + 6, y - hh + 4); g.lineTo(x + 7, y + 2); g.closePath(); g.fill();
      g.fillStyle = '#6e737c'; g.beginPath(); g.moveTo(x - 7, y + 2); g.lineTo(x - 6, y - hh + 3); g.lineTo(x - 1, y - hh); g.lineTo(x - 1, y + 2); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(159,192,255,' + (inReach ? 0.6 + 0.35 * pulse : 0.25).toFixed(3) + ')'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x + 1, y - hh * 0.7); g.lineTo(x + 4, y - hh * 0.5); g.lineTo(x + 1, y - hh * 0.3); g.stroke();
    }
    ring(g, s.x, s.y, s.r, inReach ? 'rgba(200,220,255,0.6)' : 'rgba(200,220,255,0.2)', 1, [4, 6]);
    if (inReach) {
      g.font = '13px ' + SERIF; g.textAlign = 'center'; g.fillStyle = '#e8f0ff';
      g.fillText(shrinePrompt(world), s.x, s.y - 52); g.textAlign = 'left';
    }
  }

  // A grove shrine names itself before you walk in, so a red Monster Shrine is a choice.
  function drawGrove(g, world) {
    var s = world.grove;
    if (!s) return;
    var pulse = 0.5 + 0.5 * Math.sin(R.frame * 0.08);
    g.drawImage(R.shadow, s.x - 16, s.y - 4, 36, 12);
    g.fillStyle = '#2c3138';
    g.beginPath(); g.moveTo(s.x - 10, s.y + 4); g.lineTo(s.x - 8, s.y - 36); g.lineTo(s.x, s.y - 44); g.lineTo(s.x + 9, s.y - 34); g.lineTo(s.x + 11, s.y + 4); g.closePath(); g.fill();
    g.fillStyle = '#6a727c';
    g.beginPath(); g.moveTo(s.x - 10, s.y + 4); g.lineTo(s.x - 8, s.y - 36); g.lineTo(s.x, s.y - 44); g.lineTo(s.x, s.y + 4); g.closePath(); g.fill();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = s.color; g.globalAlpha = 0.35 + 0.4 * pulse;
    g.beginPath(); g.arc(s.x, s.y - 18, 10 + 3 * pulse, 0, PB.M.TAU); g.fill();
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    ring(g, s.x, s.y, s.r, s.cursed ? 'rgba(232,90,74,0.55)' : 'rgba(255,214,120,0.35)', 1.5, [3, 5]);
    g.font = '13px ' + SERIF; g.textAlign = 'center'; g.fillStyle = s.color;
    g.fillText(s.name, s.x, s.y - 56);
    if (s.cursed) { g.fillStyle = '#e85a4a'; g.font = '12px ' + SERIF; g.fillText('cursed — it pays', s.x, s.y - 42); }
    g.textAlign = 'left';
  }

  function drawGroundRings(g, world) {
    var p = world.player, an = world.anchor;
    if (an && !an.dead) { // Skinwalk: the possessed summon wears a gold ring; the husk a grey one
      ring(g, an.x, an.y, an.r + 8 + 2 * Math.sin(R.frame * 0.15), 'rgba(255,214,120,0.85)', 2);
      ring(g, p.x, p.y, p.r + 8, 'rgba(180,180,180,0.5)', 2, [3, 4]);
    }
    if (world.pack.heel) ring(g, p.x, p.y, 150, 'rgba(230,220,170,0.22)', 1, [3, 6]);
    for (var i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (e.aura && e.team === 0 && !e.dead) { g.globalAlpha = 0.18; ring(g, e.x, e.y, e.aura.radius, '#ffd27a', 2, [2, 8]); g.globalAlpha = 1; }
    }
  }

  // Canopy crowns over the bodies (baked in terrain.js); a crown fades when the druid walks under it.
  function drawCanopy(g, world, x0, y0) {
    var list = (R.ground && R.ground.canopy) || [], p = world.anchor || world.player;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], cv = c.canvas, k = c.res || 1, w = cv ? cv.width / k : 0, h = cv ? cv.height / k : 0;
      if (!cv || c.x + w / 2 < x0 || c.x - w / 2 > x0 + LW || c.y + h / 2 < y0 || c.y - h / 2 > y0 + LH) continue;
      var under = (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y) < c.r * c.r * 1.1;
      g.globalAlpha = under ? 0.3 : 0.94;
      if (k === 1) g.drawImage(cv, Math.round(c.x - w / 2), Math.round(c.y - h / 2));
      else g.drawImage(cv, c.x - w / 2, c.y - h / 2, w, h); // a sculpted crown, baked finer than the world
    }
    g.globalAlpha = 1;
  }

  // A prop standing on an obstacle (terrain.js). Tall props go see-through while the druid stands behind them.
  function drawProp(g, pr, world) {
    var cv = pr.canvas, k = pr.res || 1, x = Math.round(pr.x - pr.ax), y = Math.round(pr.y - pr.ay), p = world.anchor || world.player;
    var behind = pr.tall && p.y < pr.y && p.y > y && Math.abs(p.x - pr.x) < cv.width / k * 0.45;
    if (behind) g.globalAlpha = 0.42;
    if (k === 1) g.drawImage(cv, x, y);
    else g.drawImage(cv, pr.x - pr.ax, pr.y - pr.ay, cv.width / k, cv.height / k); // a sculpted prop, baked finer than the world
    g.globalAlpha = 1;
  }

  // A stone brazier with a living flame.
  function drawTorch(g, t) {
    var x = t.x, y = t.y, f = Math.sin(R.time * 9 + t.phase) * 0.5 + Math.sin(R.time * 23 + t.phase * 2) * 0.3;
    g.drawImage(R.shadow, x - 16, y - 4, 34, 12);
    g.fillStyle = '#2a2622'; g.beginPath(); g.moveTo(x - 5, y + 2); g.lineTo(x - 3, y - 16); g.lineTo(x + 3, y - 16); g.lineTo(x + 5, y + 2); g.fill();
    g.fillStyle = '#4a4440'; g.beginPath(); g.ellipse(x, y - 17, 10, 4, 0, 0, PB.M.TAU); g.fill();
    g.fillStyle = '#1a1614'; g.beginPath(); g.ellipse(x, y - 18, 8, 2.6, 0, 0, PB.M.TAU); g.fill();
    var h = 15 + f * 4;
    g.fillStyle = '#ff6a1a'; g.beginPath(); g.moveTo(x - 7, y - 18); g.quadraticCurveTo(x - 6, y - 18 - h * 0.6, x + f * 2, y - 18 - h); g.quadraticCurveTo(x + 6, y - 18 - h * 0.5, x + 7, y - 18); g.fill();
    g.fillStyle = '#ffd060'; g.beginPath(); g.moveTo(x - 4, y - 18); g.quadraticCurveTo(x - 3, y - 18 - h * 0.45, x + f, y - 18 - h * 0.7); g.quadraticCurveTo(x + 3, y - 18 - h * 0.35, x + 4, y - 18); g.fill();
    glowAt(g, 'ember', x, y - 24, 30 + f * 4, 0.55);
  }

  // Particles batched by color (bursts write neighbouring slots, so the fill style rarely changes). Plain source-over on
  // both qualities: additive rects cost about four times as much to rasterize and a Hunt keeps 1500 of them alive.
  function drawParticles(g, j, x0, y0) {
    g.globalCompositeOperation = 'source-over';
    var last = -1, x1 = x0 + LW, y1 = y0 + LH;
    for (var i = 0; i < j.cap; i++) {
      var life = j.life[i];
      if (!(life > 0)) continue;
      var x = j.x[i], y = j.y[i];
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (j.color[i] !== last) { last = j.color[i]; g.fillStyle = css(last); }
      g.globalAlpha = Math.min(1, life / j.max[i] * 1.5);
      var sz = j.size[i];
      g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  function drawRings(g, j) {
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < j.rings.length; i++) {
      var r = j.rings[i], t = r.t / r.life;
      g.globalAlpha = 0.85 * (1 - t);
      ring(g, r.x, r.y, Math.max(1, PB.M.lerp(r.r0, r.r1, PB.M.easeOutCubic(t))), css(r.color), r.width);
    }
    for (var k = 0; k < j.swings.length; k++) { // Thornlash: a green whip arc across the 70° cone
      var s = j.swings[k], u = s.t / s.life, half = 35 * Math.PI / 180;
      g.globalAlpha = 0.9 * (1 - u);
      if (s.x2 !== undefined) { // chain lightning (bolt): a jagged two-segment line; a pounce or leap: a straight streak
        var dx = s.x2 - s.x, dy = s.y2 - s.y;
        g.beginPath(); g.moveTo(s.x, s.y);
        for (var seg = 1; seg <= 8; seg++) {
          var bend = s.bolt && seg < 8 ? Math.sin(seg * 17 + Math.floor(s.t * 40)) * 0.09 : 0;
          g.lineTo(s.x + dx * seg / 8 + dy * bend, s.y + dy * seg / 8 - dx * bend);
        }
        if (s.bolt && !R.low) {
          g.moveTo(s.x + dx * 0.5, s.y + dy * 0.5); g.lineTo(s.x + dx * 0.6 + dy * 0.2, s.y + dy * 0.6 - dx * 0.2);
          g.strokeStyle = '#609bdc'; g.lineWidth = 8; g.globalAlpha = 0.22 * (1 - u); g.stroke();
        }
        g.globalAlpha = 0.95 * (1 - u); g.strokeStyle = s.color || (s.bolt ? '#e2f5ff' : '#e6dcbe'); g.lineWidth = 2 - u; g.stroke();
        continue;
      }
      if (s.whirl) {
        g.strokeStyle = s.hit ? '#ffb060' : '#e8a060'; g.lineWidth = 5 - 2 * u;
        g.beginPath(); g.arc(s.x, s.y, (s.radius || 72) * (0.35 + 0.65 * PB.M.easeOutCubic(u)), 0, Math.PI * 2); g.stroke();
        if ((s.stacks || 1) > 1) {
          g.lineWidth = 2; g.globalAlpha = 0.4 * (1 - u);
          g.beginPath(); g.arc(s.x, s.y, (s.radius || 72) + 8, 0, Math.PI * 2); g.stroke();
        }
      } else if (s.zeal) {
        var zhalf = 55 * Math.PI / 180, zreach = 36 + 42 * PB.M.easeOutCubic(u);
        g.strokeStyle = s.hit ? '#ffe7a8' : '#e8c56a'; g.lineWidth = 6 - 2 * u;
        g.beginPath(); g.arc(s.x, s.y, zreach, s.angle - zhalf, s.angle + zhalf); g.stroke();
        if ((s.strikes || 1) > 1) {
          g.lineWidth = 2; g.globalAlpha = 0.45 * (1 - u);
          g.beginPath(); g.arc(s.x, s.y, zreach + 10, s.angle - zhalf * 0.7, s.angle + zhalf * 0.7); g.stroke();
        }
      } else {
        g.strokeStyle = s.claw ? (s.hit ? '#f0d090' : '#c4a15a') : (s.hit ? '#c8ff9a' : '#7fd36f');
        g.lineWidth = (s.claw ? 6 : 4) - 2 * u;
        g.beginPath(); g.arc(s.x, s.y, (s.claw ? 28 : 40) + (s.claw ? 36 : 50) * PB.M.easeOutCubic(u), s.angle - half, s.angle + half); g.stroke();
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  // Quarter-resolution ambient mask. Smooth radial pools need no full-size pixels.
  function lightHole(x, y, radius, strength, x0, y0) {
    if (x + radius < x0 || x - radius > x0 + LW || y + radius < y0 || y - radius > y0 + LH) return;
    var g = R.lightCtx; g.globalAlpha = strength;
    g.drawImage(R.atlas.glows.white, (x - radius - x0) / LIGHT_SCALE, (y - radius - y0) / LIGHT_SCALE,
      radius * 2 / LIGHT_SCALE, radius * 2 / LIGHT_SCALE);
  }
  // Colored light inside the mask: a source-over tint of the field (lava, runes, fire), cheaper than an additive layer.
  function lightTint(name, x, y, radius, strength, x0, y0) {
    var c = R.atlas.glows[name];
    if (!c || x + radius < x0 || x - radius > x0 + LW || y + radius < y0 || y - radius > y0 + LH) return;
    var g = R.lightCtx; g.globalAlpha = strength;
    g.drawImage(c, (x - radius - x0) / LIGHT_SCALE, (y - radius - y0) / LIGHT_SCALE, radius * 2 / LIGHT_SCALE, radius * 2 / LIGHT_SCALE);
  }
  // A tileable fog bank (periodic value noise), colored per zone and cached.
  var FOG_N = 128;
  function fogTex(lk) {
    var key = lk.fog.join(','), c = R.fogs && R.fogs[key];
    if (c) return c;
    R.fogs = R.fogs || {};
    c = document.createElement('canvas'); c.width = c.height = FOG_N;
    var g = c.getContext('2d'), img = g.createImageData(FOG_N, FOG_N), d = img.data, P = 4, noise = function (x, y) { // period P cells
      var v = 0, amp = 0.5, n = 0;
      for (var o = 0; o < 3; o++) {
        var per = P << o, fx = x * per, fy = y * per, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        var h = function (a, b) { return PB.Terrain.vnoise(((a % per) + per) % per, ((b % per) + per) % per, 31 + o); };
        var u = tx * tx * (3 - 2 * tx), w = ty * ty * (3 - 2 * ty), a00 = h(ix, iy), a10 = h(ix + 1, iy), a01 = h(ix, iy + 1), a11 = h(ix + 1, iy + 1);
        v += (a00 + (a10 - a00) * u + (a01 - a00) * w + (a00 - a10 - a01 + a11) * u * w) * amp; n += amp; amp *= 0.5;
      }
      return v / n;
    };
    for (var y = 0; y < FOG_N; y++) for (var x = 0; x < FOG_N; x++) {
      var v = noise(x / FOG_N, y / FOG_N), a = Math.max(0, Math.min(1, (v - 0.38) / 0.3)), i = (y * FOG_N + x) * 4;
      d[i] = lk.fog[0]; d[i + 1] = lk.fog[1]; d[i + 2] = lk.fog[2]; d[i + 3] = Math.round(a * a * 255);
    }
    g.putImageData(img, 0, 0);
    return (R.fogs[key] = c);
  }
  function fogLayer(lg, tex, scale, ox, oy, alpha) {
    var pat = tex.pattern || (tex.pattern = lg.createPattern(tex, 'repeat'));
    if (!pat) return;
    var span = FOG_N * scale, mx = ((ox % span) + span) % span, my = ((oy % span) + span) % span;
    lg.save(); lg.globalAlpha = alpha; lg.translate(-mx, -my); lg.scale(scale, scale); lg.fillStyle = pat;
    lg.fillRect(0, 0, (R.light.width + span) / scale, (R.light.height + span) / scale); lg.restore();
  }
  // Stormcrag's lightning: two quick flashes every ~9 s that lift the darkness for a moment.
  function lightning(world) {
    if (look(world).weather !== 'rain') return 0;
    var t = R.time % 9.3;
    return t < 0.07 ? 1 : t > 0.16 && t < 0.24 ? 0.7 : 0;
  }
  function drawLighting(g, world, j, x0, y0) {
    if (R.low || R.hunt) return;
    var lg = R.lightCtx, lk = look(world), W = R.light.width, Hq = R.light.height, flash = lightning(world);
    lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1; lg.clearRect(0, 0, W, Hq);
    lg.fillStyle = 'rgba(' + lk.dark.join(',') + ',' + (lk.ambient * (1 - 0.8 * flash)).toFixed(3) + ')'; lg.fillRect(0, 0, W, Hq);
    lg.globalCompositeOperation = 'destination-out';
    var p = PB.Graphics.pose(world.player, R.alpha);
    lightHole(p.x, p.y, 280, 1, x0, y0);
    for (var i = 0; i < world.ents.length; i++) {
      var e = world.ents[i]; if (e.dead || e.team !== 0) continue;
      var ep = PB.Graphics.pose(e, R.alpha);
      lightHole(ep.x, ep.y, e.aura ? 150 : 90, e.aura ? 0.9 : 0.65, x0, y0);
    }
    for (var d = 0; d < world.drops.length; d++) { var drop = world.drops[d]; lightHole(drop.x, drop.y - 20, 100, 0.9, x0, y0); }
    for (var t = 0; t < world.telegraphs.length; t++) { var tg = world.telegraphs[t]; lightHole(tg.x, tg.y, Math.min(200, tg.radius || 100), 0.8, x0, y0); }
    for (var k = 0; k < j.fx.length; k++) { var f = j.fx[k]; if (f.life > 0) lightHole(f.x, f.y, f.radius * 1.7, f.life / f.max, x0, y0); }
    if (world.shrine) lightHole(world.shrine.x, world.shrine.y, 150, 1, x0, y0);
    if (world.grove) lightHole(world.grove.x, world.grove.y, 120, 0.9, x0, y0);
    var G0 = R.ground || {}, lights = G0.lights || [], torches = G0.torches || [];
    for (var l = 0; l < lights.length; l++) lightHole(lights[l].x, lights[l].y, lights[l].r, lights[l].k * 1.4, x0, y0);
    for (var tc = 0; tc < torches.length; tc++) {
      var to = torches[tc], fl = 1 + 0.08 * Math.sin(R.time * 11 + to.phase) + 0.05 * Math.sin(R.time * 27 + to.phase);
      lightHole(to.x, to.y - 20, 210 * fl, 1, x0, y0);
    }
    // Fog drifts over everything, lit or not; then the colored light tints its pools.
    lg.globalCompositeOperation = 'source-over';
    var tex = fogTex(lk);
    fogLayer(lg, tex, 2, x0 / LIGHT_SCALE + R.time * 2.2, y0 / LIGHT_SCALE + R.time * 0.6, lk.fogA);
    fogLayer(lg, tex, 3.4, x0 / LIGHT_SCALE * 1.15 - R.time * 1.4, y0 / LIGHT_SCALE * 1.15 + R.time * 0.9, lk.fogA * 0.8);
    for (var c = 0; c < lights.length; c++) lightTint(lights[c].glow, lights[c].x, lights[c].y, lights[c].r * 1.2, lights[c].k * 0.55, x0, y0);
    for (var tt = 0; tt < torches.length; tt++) { var tr = torches[tt]; lightTint('ember', tr.x, tr.y - 20, 190, 0.2 + 0.03 * Math.sin(R.time * 13 + tr.phase), x0, y0); }
    lightTint('green', p.x, p.y - 10, 170, 0.08, x0, y0);
    for (var s2 = 0; s2 < world.ents.length; s2++) { var se = world.ents[s2]; if (!se.dead && GLOWING[se.type]) lightTint(GLOWING[se.type], se.x, se.y, 120, 0.16, x0, y0); }
    lg.globalAlpha = 1;
    // The screen vignette is a source-over layer, so it folds into the mask ((A over B) over the field equals A over
    // B over the field): High composites one full-screen layer instead of two.
    if (!R.vigQ) R.vigQ = screenVignette(0.4, 0.95, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.5)', LIGHT_SCALE);
    lg.drawImage(R.vigQ, 0, 0);
    // The mask is smooth already; a second full-screen bilinear filter is costly on a software canvas, and four-pixel
    // alpha steps are subvisible.
    g.imageSmoothingEnabled = false;
    g.drawImage(R.light, x0, y0, LW, LH);
    g.imageSmoothingEnabled = true;
  }

  // Weather over the field (High and Low; glowing motes need High): world-anchored motes that wrap around the view.
  var WX_N = { fireflies: 40, embers: 60, spores: 44, snow: 170, rain: 150 };
  function wrap(v, span) { return ((v % span) + span) % span; }
  function drawWeather(g, world, x0, y0) {
    var kind = look(world).weather, n = Math.round(WX_N[kind] * (R.low ? 0.5 : 1)), wx = R.wx;
    if (!wx || wx.kind !== kind) {
      var seed = 7; wx = R.wx = { kind: kind, u: [], v: [], s: [], ph: [] };
      var rnd = function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (var i = 0; i < 170; i++) { wx.u.push(rnd()); wx.v.push(rnd()); wx.s.push(0.5 + rnd() * 0.5); wx.ph.push(rnd() * PB.M.TAU); }
    }
    var SX = LW + 200, SY = LH + 200, t = R.time;
    if (kind === 'rain') {
      g.strokeStyle = 'rgba(170,185,220,0.32)'; g.lineWidth = 1.2; g.beginPath();
      for (var r = 0; r < n; r++) {
        var rx = x0 - 100 + wrap(wx.u[r] * SX - x0 - t * 160 * wx.s[r], SX), ry = y0 - 100 + wrap(wx.v[r] * SY - y0 + t * 900 * wx.s[r], SY);
        g.moveTo(rx, ry); g.lineTo(rx - 5, ry + 22);
      }
      g.stroke(); return;
    }
    if (kind === 'snow') {
      g.fillStyle = '#eef6ff';
      for (var f = 0; f < n; f++) {
        var fx = x0 - 100 + wrap(wx.u[f] * SX - x0 + t * 22 + Math.sin(t * 0.8 + wx.ph[f]) * 18, SX), fy = y0 - 100 + wrap(wx.v[f] * SY - y0 + t * 55 * wx.s[f], SY), fs = 1 + wx.s[f] * 1.8;
        g.globalAlpha = 0.45 + 0.4 * wx.s[f]; g.fillRect(fx, fy, fs, fs);
      }
      g.globalAlpha = 1; return;
    }
    var glowName = kind === 'embers' ? 'ember' : kind === 'spores' ? 'purple' : 'gold', core = kind === 'embers' ? '#ffd890' : kind === 'spores' ? '#e8c8ff' : '#f4ffb0';
    for (var m = 0; m < n; m++) {
      var mx, my, a;
      if (kind === 'fireflies') {
        mx = x0 - 100 + wrap(wx.u[m] * SX - x0, SX) + Math.sin(t * 0.5 * wx.s[m] + wx.ph[m]) * 34;
        my = y0 - 100 + wrap(wx.v[m] * SY - y0, SY) + Math.cos(t * 0.37 * wx.s[m] + wx.ph[m] * 2) * 22;
        a = Math.max(0, Math.sin(t * 1.3 * wx.s[m] + wx.ph[m])); a *= a;
      } else {
        mx = x0 - 100 + wrap(wx.u[m] * SX - x0 + Math.sin(t * 0.9 + wx.ph[m]) * 20, SX);
        my = y0 - 100 + wrap(wx.v[m] * SY - y0 - t * (kind === 'embers' ? 45 : 16) * wx.s[m], SY);
        a = 0.5 + 0.5 * Math.sin(t * 3 * wx.s[m] + wx.ph[m]);
      }
      if (a < 0.05) continue;
      glowAt(g, glowName, mx, my, kind === 'embers' ? 6 : 9, a * 0.7);
      g.globalAlpha = a; g.fillStyle = core; g.fillRect(mx - 1, my - 1, 2, 2);
    }
    g.globalAlpha = 1;
  }
  // Decals are baked once per kind, color, size and one of eight angles, then blitted 1:1 at whole pixels: 128 rotated
  // anti-aliased scuffs per frame were the costliest layer on a software canvas (about 4.5 ms a frame).
  var decalCache = new Map(), DECAL_ANGLES = 8;
  function decalSprite(d) {
    var a = ((Math.round(d.angle / (PB.M.TAU / DECAL_ANGLES)) % DECAL_ANGLES) + DECAL_ANGLES) % DECAL_ANGLES;
    var size = Math.round(d.size), key = d.kind + ':' + d.color + ':' + size + ':' + a, c = decalCache.get(key);
    if (c || decalCache.size >= 384) return c || null;
    var half = size * 1.3 + 6; c = document.createElement('canvas'); c.width = c.height = Math.ceil(half * 2);
    var g = c.getContext('2d'); g.translate(half, half); g.rotate(a * PB.M.TAU / DECAL_ANGLES);
    if (d.kind === 1) g.drawImage(R.atlas.decals.scorch, -size, -size * 0.6, size * 2, size * 1.2);
    else if (d.kind === 2) {
      g.strokeStyle = '#151610'; g.lineWidth = 1.7; g.beginPath();
      for (var k = -1; k <= 1; k++) { g.moveTo(-size, k * 4); g.quadraticCurveTo(0, k * 4 - 3, size, k * 4); }
      g.stroke();
    } else {
      g.fillStyle = css(d.color); g.beginPath(); g.ellipse(0, 0, size, size * 0.4, 0, 0, PB.M.TAU); g.fill();
      g.beginPath(); g.ellipse(size, 4, 4, 2, 0, 0, PB.M.TAU); g.fill();
    }
    decalCache.set(key, c); return c;
  }
  function drawDecals(g, j, x0, y0) {
    for (var i = 0; i < j.decalLimit; i++) {
      var d = j.decals[i];
      if (d.life <= 0 || d.x < x0 - 80 || d.x > x0 + LW + 80 || d.y < y0 - 80 || d.y > y0 + LH + 80) continue;
      var c = decalSprite(d);
      if (!c) continue;
      g.globalAlpha = Math.min(0.5, d.life / d.max);
      g.drawImage(c, Math.round(d.x - c.width / 2), Math.round(d.y - c.height / 2));
    }
    g.globalAlpha = 1;
  }
  function drawExtraFx(g, j, x0, y0) {
    if (R.low || R.hunt) return;
    // Newest first, with a budget for the large additive blits: a Hunt crits dozens of bodies at once, and fifty
    // overlapping 200 px glows cost more raster time than the whole field. Past the budget a burst keeps its ring.
    var glows = FX_GLOWS, strips = FX_STRIPS, n = j.fx.length;
    for (var s = 0; s < n; s++) {
      var f = j.fx[((j.fxHead || 0) - 1 - s + 2 * n) % n];
      if (f.life <= 0 || f.x < x0 - 200 || f.x > x0 + LW + 200 || f.y < y0 - 200 || f.y > y0 + LH + 200) continue;
      var u = 1 - f.life / f.max, fade = 1 - u;
      if (f.kind === 3 && strips-- <= 0) continue;
      g.save(); g.globalCompositeOperation = 'lighter';
      if (f.kind === 1) {
        var rad = f.radius * (0.45 + u * 0.8);
        if (glows-- > 0) glowAt(g, PB.Graphics.glowName(f.color), f.x, f.y, rad, fade * 0.55, true);
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = fade * 0.7; g.strokeStyle = css(f.color); g.lineWidth = 2;
        g.beginPath(); g.ellipse(f.x, f.y, rad * 0.55, rad * 0.23, 0, 0, PB.M.TAU); g.stroke();
        g.fillStyle = css(f.color); g.globalAlpha = fade * fade * 0.45;
        g.fillRect(f.x - 2 - fade * 4, f.y - rad, 4 + fade * 8, rad * 1.1);
      } else if (f.kind === 2) {
        g.globalAlpha = fade; g.strokeStyle = '#96d971'; g.lineWidth = 2.5; g.beginPath();
        for (var v = 0; v < 6; v++) {
          var a = f.angle + v * PB.M.TAU / 6, r = f.radius * Math.min(1, u * 5), x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r * 0.5;
          g.moveTo(x, y); g.bezierCurveTo(x + 13, y - 16, f.x - 12, f.y - 20 - r, f.x + Math.cos(a) * 10, f.y - 5);
        }
        g.stroke();
      } else if (f.kind === 3) {
        var sp = R.atlas.bodies[f.unit];
        if (sp) {
          // The white silhouette separates into strips that drift up and disperse.
          g.globalAlpha = fade * 0.55;
          var strip = sp.size / 8, cs = sp.cell / 8;
          for (var n = 0; n < 8; n++) g.drawImage(sp.white, 0, n * cs, sp.cell, cs,
            f.x - sp.size / 2 + Math.sin(n * 8 + f.angle) * u * 24, f.y - sp.size / 2 + n * strip - u * (24 + n * 4), sp.size * (1 + u * 0.2), strip);
        }
      }
      g.restore();
    }
  }

  // Numbers rise 40px over 0.7s with ease-out; crits are 1.5x, pop 1.4 -> 1 and end in '!'.
  function drawNumbers(g, j) {
    var D = R.digits, GW = D.gw, GH = D.gh, GLYPHS = D.glyphs;
    for (var i = 0; i < j.numbers.length; i++) {
      var n = j.numbers[i];
      if (!n.active) continue;
      var age = j.time - n.t, k = age / PB.Juice.NUM_LIFE;
      if (n.kind === 'ward' || n.kind === 'slaughter') {
        g.globalAlpha = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
        g.font = 'bold ' + (n.kind === 'slaughter' ? 20 : 16) + 'px ' + SERIF; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(10,6,4,0.9)';
        g.fillStyle = n.kind === 'slaughter' ? '#ffb070' : '#e8d8a8';
        var wy = n.y - 18 - PB.Juice.numberRise(age);
        var word = n.kind === 'slaughter' ? (n.label || ('×' + Math.round(n.amount))) : 'Ward';
        g.strokeText(word, n.x, wy); g.fillText(word, n.x, wy); g.textAlign = 'left';
        continue;
      }
      var text = String(Math.max(1, Math.round(n.amount))) + (n.crit ? '!' : '');
      var kind = n.crit ? 'crit' : n.kind, row = D.row[kind] !== undefined ? D.row[kind] : 0;
      var sc = (n.crit ? 1.5 * PB.M.lerp(1.4, 1, Math.min(1, age / 0.12)) : 1) * (n.kind === 'dot' ? 0.75 : 1);
      var w = text.length * GW * 0.62 * sc, x = n.x - w / 2, y = n.y - 18 - PB.Juice.numberRise(age);
      g.globalAlpha = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
      for (var c = 0; c < text.length; c++) {
        var gi = GLYPHS.indexOf(text[c]);
        g.drawImage(D.canvas, gi * GW, row * GH, GW, GH, x + c * GW * 0.62 * sc - GW * 0.19 * sc, y - GH * sc / 2, GW * sc, GH * sc);
      }
    }
    g.globalAlpha = 1;
  }

  // A runner's white sheet at 1.6x, mirrored when the Hunt runs left: baked once per type and facing, drawn 1:1.
  var runnerSheets = {};
  function runnerSheet(type, sp, face) {
    var key = type + face, c = runnerSheets[key];
    if (c && c.src === sp) return c; // a sheet replaced by its sculpt is re-made
    var sz = Math.round(sp.size * 1.6); c = document.createElement('canvas'); c.width = sz * sp.frames; c.height = sz;
    var rg = c.getContext('2d');
    for (var f = 0; f < sp.frames; f++) {
      rg.save(); rg.translate(f * sz + sz / 2, sz / 2); rg.scale(face, 1);
      rg.drawImage(sp.white, f * sp.cell, 0, sp.cell, sp.cell, -sz / 2, -sz / 2, sz, sz); rg.restore();
    }
    c.src = sp;
    return (runnerSheets[key] = c);
  }
  // Wild Hunt: white silhouettes of the members, additive, running in the hunt direction (sim positions).
  function drawHunt(g, world, x0, y0) {
    var h = world.hunt;
    if (!h) return;
    var face = Math.cos(h.angle) < 0 ? -1 : 1, prev = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < h.runners.length; i++) {
      var r = h.runners[i], pos = R.runner, sp = r.type && R.atlas.bodies[r.type];
      if (!PB.Graphics.runnerPose(h, r, h.t - (1 - R.alpha) * PB.DT, pos)) continue;
      if (!sp || pos.x < x0 - 80 || pos.x > x0 + LW + 80 || pos.y < y0 - 80 || pos.y > y0 + LH + 80) continue;
      var fr = Math.floor((h.t * 12 * sp.frames / 8 + i) % sp.frames), ux = Math.cos(h.angle), uy = Math.sin(h.angle);
      var sheet = runnerSheet(r.type, sp, face), sz = sheet.height;
      for (var k = R.low ? 0 : 1; k >= 0; k--) { // one fading after-image (High), then the bright runner
        g.globalAlpha = k ? 0.3 : 0.85;
        g.drawImage(sheet, fr * sz, 0, sz, sz, Math.round(pos.x - ux * k * 30 - sz / 2), Math.round(pos.y - uy * k * 30 - sz / 2), sz, sz);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = prev;
  }

  // Bake screen-space gradients into reusable bitmaps; a cached CanvasGradient still
  // evaluates radial falloff across the whole screen on every software-rasterized frame.
  function screenVignette(inner, outer, center, edge, scale) {
    var k = scale || 1, W = LW / k, H = LH / k, c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), grad = g.createRadialGradient(W / 2, H / 2, H * inner, W / 2, H / 2, H * outer);
    grad.addColorStop(0, center); grad.addColorStop(1, edge);
    g.fillStyle = grad; g.fillRect(0, 0, W, H); return c;
  }
  // The Hunt wash strength: strongest at the start, fading out.
  function huntK(world) {
    var h = world && world.hunt;
    return h ? Math.max(0, Math.min(1, h.t / 0.3) * Math.min(1, (h.dur - h.t) / 0.8)) : 0;
  }
  function drawScreenFx(g, j, world) {
    if (!R.lit) { // under the light mask the vignette is folded into it (drawLighting)
      if (!R.vig) R.vig = screenVignette(0.45, 0.95, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.38)');
      g.drawImage(R.vig, 0, 0);
    }
    if (world && world.hunt) { // moonlit blue-silver wash
      var k = huntK(world);
      g.fillStyle = 'rgba(110,150,235,' + (0.30 * k).toFixed(3) + ')'; g.fillRect(0, 0, LW, LH);
      if (!R.huntVig) R.huntVig = screenVignette(0.35, 0.9, 'rgba(20,30,70,0)', 'rgba(20,30,70,0.45)');
      g.globalAlpha = k; g.drawImage(R.huntVig, 0, 0); g.globalAlpha = 1;
    }
    if (j.vignette > 0) {
      if (!R.hurtVig) R.hurtVig = screenVignette(0.3, 0.85, 'rgba(160,0,0,0)', 'rgb(170,10,0)');
      g.globalAlpha = Math.min(0.55, j.vignette / 0.15 * 0.45); g.drawImage(R.hurtVig, 0, 0); g.globalAlpha = 1;
    }
    if (j.screenFlash > 0) { g.fillStyle = 'rgba(255,255,255,' + Math.min(0.8, j.screenFlash * 8).toFixed(3) + ')'; g.fillRect(0, 0, LW, LH); }
  }

  // The HUD lives in ui/hud.js; render adds the end banner and the perf overlay on top of it.
  function drawHud(g, world, info) {
    if (PB.HUD) PB.HUD.draw(g, world, { now: info.now, toasts: info.toasts, waveBanner: info.waveBanner, cam: R.cam });
    g.textBaseline = 'top';
    if (info.banner) {
      g.font = 'bold 34px ' + SERIF; g.textAlign = 'center';
      g.fillStyle = '#efe6cc'; g.fillText(info.banner, LW / 2, LH / 2 - 60); g.textAlign = 'left';
    }
    if (info.overlay) {
      g.font = '13px monospace'; g.fillStyle = '#9fe0ff';
      var lines = info.overlay;
      for (var i = 0; i < lines.length; i++) g.fillText(lines[i], LW - 300, 120 + i * 16);
    }
  }

  // Layers that sit on top of the field; info.end (Victory / Game Over) leaves only the world as a backdrop.
  function layers(info) { return { numbers: !info.end, hud: !info.end }; }

  // j: PB.Juice state; info: {kills, banner, toasts, overlay: [lines], now, end}
  function draw(world, j, info) {
    var L = layers(info);
    var g = R.ctx, s = R.scale, x0 = R.cam.x - LW / 2, y0 = R.cam.y - LH / 2;
    // The Wild Hunt's moon lights the whole field: while it runs, High drops the darkness mask, glows and bursts (the
    // wash and runners carry the moment), so the game's busiest seconds cost what Low costs.
    R.hunt = !!world.hunt; R.lit = !R.low && !R.hunt;
    R.world = world; R.dt = info.dt || 1 / 60; R.alpha = info.alpha == null ? 1 : info.alpha; R.time = info.now || 0;
    var sh = PB.Juice.shakeOffset(j, info.now || 0, R.shake);
    // A rotation that moves the screen corners by under half a pixel is invisible but sends every blit through the
    // filtered path, so it is dropped.
    if (Math.abs(sh.rot) * Math.hypot(LW, LH) / 2 < 0.5) sh.rot = 0;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#07090b';
    g.fillRect(0, 0, R.canvas.width, R.canvas.height);
    // Shake: rotate about the screen centre, then offset the camera.
    var cr = Math.cos(sh.rot) * s, sr = Math.sin(sh.rot) * s, cx = LW / 2, cy = LH / 2;
    var tx = -(x0 - sh.x) - cx, ty = -(y0 - sh.y) - cy;
    var ex = (cx + cr / s * tx - sr / s * ty) * s, ey = (cy + sr / s * tx + cr / s * ty) * s;
    // Without shake rotation the camera lands on whole device pixels, so 1:1 sprite blits (glows, decals, runners)
    // skip filtering; the world then scrolls in whole-pixel steps, which reads the same at 60 fps.
    if (sh.rot === 0) { ex = Math.round(ex); ey = Math.round(ey); }
    R.exact = sh.rot === 0 && s === 1;
    g.setTransform(cr, sr, -sr, cr, ex, ey);
    R.frame++;
    drawGround(g, world, x0, y0);
    drawDecals(g, j, x0, y0);
    drawOrders(g, world);
    drawTelegraphs(g, world);
    drawShrine(g, world);
    drawGrove(g, world);
    drawCorpses(g, world, x0, y0);
    drawDrops(g, world, x0, y0, !!info.labels);
    drawGroundRings(g, world);
    drawGates(g, world);
    drawSlaughterRing(g, world);
    drawPrints(g, j);
    var ents = world.ents, pad = 80, list = R.list;
    list.length = 0;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.dead || e.x < x0 - pad || e.x > x0 + LW + pad || e.y < y0 - pad || e.y > y0 + LH + pad) continue;
      list.push(e);
    }
    list.push(world.player);
    // Props and braziers join the depth sort, so a body behind a tree is hidden by its trunk.
    var G0 = R.ground || {}, props = G0.props || [], torches = G0.torches || [];
    for (var pi = 0; pi < props.length; pi++) {
      var pr = props[pi];
      if (pr.x + pr.canvas.width / (pr.res || 1) < x0 || pr.x - pr.canvas.width / (pr.res || 1) > x0 + LW || pr.y - pr.ay > y0 + LH + 40 || pr.y + pr.r < y0 - 40) continue;
      list.push(pr);
    }
    for (var ti = 0; ti < torches.length; ti++) { var tc = torches[ti]; if (tc.x > x0 - 60 && tc.x < x0 + LW + 60 && tc.y > y0 - 20 && tc.y < y0 + LH + 60) list.push(tc); }
    list.sort(function (a, b) { return (a.y + (a.flying ? 30 : 0)) - (b.y + (b.flying ? 30 : 0)) || (a.id || 0) - (b.id || 0); });
    for (var k = 0; k < list.length; k++) {
      var body = list[k];
      if (!body.kind) { if (body.canvas) drawProp(g, body, world); else drawTorch(g, body); continue; }
      var pose = PB.Graphics.pose(body, R.alpha);
      g.save(); g.translate(pose.x - body.x, pose.y - body.y);
      if (body.kind === 'player') drawPlayer(g, world, j); else drawBody(g, body, j);
      g.restore();
    }
    drawCanopy(g, world, x0, y0);
    drawLighting(g, world, j, x0, y0);
    if (R.lit) for (var m = 0; m < list.length; m++) {
      var mb = list[m];
      if (mb.kind !== 'summon' && mb.kind !== 'enemy') continue;
      var mp = PB.Graphics.pose(mb, R.alpha);
      g.save(); g.translate(mp.x - mb.x, mp.y - mb.y); drawMarks(g, mb); g.restore();
    }
    drawWeather(g, world, x0, y0);
    drawExtraFx(g, j, x0, y0);
    drawHunt(g, world, x0, y0);
    drawRings(g, j);
    drawParticles(g, j, x0 - 20, y0 - 20);
    if (L.numbers) drawNumbers(g, j);
    // Records live as long as their body: a summon that leaves the view and returns keeps its age (no second spawn squash).
    if (R.frame % 120 === 0) R.anim.forEach(function (st, id) { var b = world.byId[id]; if (id !== world.player.id && (!b || b.dead)) R.anim.delete(id); });
    g.setTransform(s, 0, 0, s, 0, 0);
    drawScreenFx(g, j, world);
    if (L.hud) drawHud(g, world, info);
  }

  PB.Render = { init: init, resize: resize, follow: follow, draw: draw, layers: layers, screenToWorld: screenToWorld, worldToScreen: worldToScreen,
                screenToUI: screenToUI, uiToScreen: uiToScreen, clear: clear, ctx: function () { return R.ctx; },
                setLowEnd: function (on) { R.low = !!on; }, lowEnd: function () { return !!R.low; },
                bakeGround: function (zone, seed, obstacles) { return PB.Sprites.bakeGround(zone, seed, obstacles, document); },
                atlas: function () { return R.atlas; }, cam: R.cam, LW: LW, LH: LH,
                shrinePrompt: shrinePrompt, labelledDrops: labelledDrops, anim: function (id) { return R.anim.get(id); }, bodyScale: bodyScale, teamRing: teamRing };
})(globalThis.PB = globalThis.PB || {});
