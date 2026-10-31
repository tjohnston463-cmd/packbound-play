// Procedural sprite atlas (spec §18), built once at boot into offscreen canvases. Bodies are side views facing +x
// with an 8-frame run cycle; render.js flips them by heading. Each frame is drawn at RES x its logical size, then lit:
// a grain texture, a top-down key light, a warm rim on the upper edge, a dark lower edge, glowing eyes and embers
// (drawn after the light so they stay bright), and a dark outline. Per type: a frame sheet, a white silhouette sheet
// (hit flashes) and, for pack types, one tinted sheet per infusion essence. Plus glows, decals and the digit atlas.
// The zone ground and props live in terrain.js. Nothing here reads the sim; `doc` is injectable so node can test it.
(function (PB) {
  'use strict';
  var TAU = Math.PI * 2, FRAMES = 8, RES = 2;
  function q(v) { return Math.round(v * 100) / 100; } // stable numbers: a full cycle redraws identically

  var ESS = { rot: '#8fae3a', ember: '#ff7a2a', frost: '#9fd8ff', storm: '#f5e46a', stone: '#a89a88' };
  var PAL = { // body, dark, accent
    wolf: ['#8f99a3', '#4b535c', '#d8dee2'], raven: ['#33354e', '#1a1b2c', '#8a8ec0'], bear: ['#cfe6f0', '#8aa6b8', '#ffffff'],
    vine: ['#4f8a34', '#2a4f1c', '#a8d870'], spirit: ['#ffd27a', '#ff9a3a', '#fff4d0'], druid: ['#3f5a33', '#232f1d', '#e8dcb0'],
    stormhound: ['#7a86b8', '#3c4478', '#f5e46a'], direwarg: ['#5e5454', '#2e2828', '#d0b090'], thornpelt: ['#5e7e44', '#324e24', '#c8e08a'],
    wraithwolf: ['#b0d0e2', '#6a88a2', '#ffffff'], owlbear: ['#94744f', '#5a4230', '#f0d090'], carrionbloom: ['#5a4a6a', '#2e2440', '#d07ae0'],
    omen: ['#5a5070', '#2a2440', '#c0a0ff'], rootwarden: ['#5a7a40', '#334a22', '#b0d078'], eldersbear: ['#e2d0a4', '#a8966a', '#ffe8a0'],
    lifebloom: ['#5aa040', '#2f6a20', '#ffb0d0'], alphawolf: ['#b4bcc4', '#626a72', '#ffcc44'], murder: ['#26283e', '#121324', '#ffcc44'],
    greatbear: ['#e2f0f8', '#a0b8ca', '#ffcc44'], stranglegrove: ['#3f7a2a', '#1e4612', '#ffcc44'], twinspirit: ['#ffe08a', '#ff8a3a', '#ffffff'],
    rotling: ['#6e7c30', '#3e4a1a', '#c8d860'], bogshaman: ['#3a5f52', '#1a332a', '#9fe0a0'], mirebrute: ['#6e5038', '#3e2a1a', '#c8a070'],
    cinderimp: ['#b04818', '#5a1e0c', '#ffd060'], asharcher: ['#7e523a', '#42281a', '#ffb070'], kilngolem: ['#5e342a', '#321a12', '#ff8a3a'],
    icewraith: ['#b4dcef', '#6e9ec0', '#ffffff'], frosttroll: ['#85a6be', '#4c6a80', '#e0f4ff'], rimespitter: ['#478aa2', '#244e60', '#c8f0ff'],
    thunderram: ['#9c8c44', '#544a20', '#f5e46a'], staticwisp: ['#f0e66a', '#a89a20', '#ffffff'], harpy: ['#7e76ac', '#423c66', '#e0d8ff'],
    hollowman: ['#5e4664', '#33243a', '#d0b0e0'], severer: ['#7e429c', '#421a58', '#e0a0ff'],
    hollowstag: ['#4e5e32', '#28331a', '#d8e090'], cindermother: ['#962f14', '#4a1608', '#ffb040'], palematriarch: ['#d2e6f2', '#88a0ba', '#ffffff'],
    tempestroc: ['#42426e', '#202042', '#f5e46a'], unmaker: ['#36263c', '#170e1c', '#b070ff']
  };
  var FAMILY = {
    wolf: 'wolf', raven: 'raven', bear: 'bear', vine: 'vine', spirit: 'spirit', druid: 'druid',
    stormhound: 'wolf', direwarg: 'wolf', thornpelt: 'wolf', wraithwolf: 'wolf', alphawolf: 'wolf',
    owlbear: 'bear', rootwarden: 'bear', eldersbear: 'bear', greatbear: 'bear',
    carrionbloom: 'vine', lifebloom: 'vine', stranglegrove: 'vine', omen: 'spirit', twinspirit: 'spirit', murder: 'raven',
    rotling: 'blob', cindermother: 'blob', bogshaman: 'robed', rimespitter: 'robed', mirebrute: 'slab', kilngolem: 'slab',
    frosttroll: 'slab', unmaker: 'slab', cinderimp: 'imp', asharcher: 'archer', severer: 'archer', icewraith: 'wraith',
    palematriarch: 'wraith', thunderram: 'ram', hollowstag: 'stag', staticwisp: 'wisp', harpy: 'harpy', tempestroc: 'harpy', hollowman: 'husk'
  };
  var EXTRA = { // small per-type features drawn over the family body
    stormhound: 'sparks', thornpelt: 'thorns', wraithwolf: 'ghost', owlbear: 'beak', eldersbear: 'halo', lifebloom: 'flower',
    carrionbloom: 'bloom', alphawolf: 'crown', greatbear: 'crown', stranglegrove: 'crown', twinspirit: 'twin', murder: 'flock',
    cindermother: 'flames', unmaker: 'eye', kilngolem: 'cracks', frosttroll: 'frost'
  };
  // Eye glow per type (enemies stare out of the dark; the pack's eyes catch the light softly).
  var EYES = { rotling: '#e8f060', bogshaman: '#9fffb0', mirebrute: '#ffb040', cinderimp: '#ffe060', asharcher: '#ffb070', kilngolem: '#ff9a3a',
    icewraith: '#c8f4ff', frosttroll: '#bff0ff', rimespitter: '#c8f0ff', thunderram: '#fff070', staticwisp: '#ffffff', harpy: '#f0e0ff',
    hollowman: '#e0a0ff', severer: '#f0b0ff', hollowstag: '#ff4a3a', cindermother: '#ffd060', palematriarch: '#e8fbff', tempestroc: '#fff070',
    unmaker: '#d090ff', omen: '#d0b0ff', wraithwolf: '#e8faff', stormhound: '#fff3a0' };
  // Families that are made of light: no key light, rim or outline darkening (they stay luminous).
  var LUMINOUS = { spirit: true, wisp: true };
  // Frame size in body radii (3.8 by default): the stag's antlers reach 2.1 r above the centre.
  var SPAN = { stag: 4.6 };

  if (PB.CLASS_PAINT) {
    for (var pid in PB.CLASS_PAINT) {
      var pp = PB.CLASS_PAINT[pid];
      if (pp.family) FAMILY[pid] = pp.family;
      if (pp.pal) PAL[pid] = pp.pal;
      if (pp.eye) EYES[pid] = pp.eye;
      if (pp.extra) EXTRA[pid] = pp.extra;
    }
  }

  function familyOf(type) { return FAMILY[type] || null; }

  // ---------- drawing helpers (all coordinates relative to the body centre, facing +x) ----------
  function ell(g, x, y, rx, ry, col, rot) { g.fillStyle = col; g.beginPath(); g.ellipse(q(x), q(y), q(Math.max(0.5, rx)), q(Math.max(0.5, ry)), q(rot || 0), 0, TAU); g.fill(); }
  function circ(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(q(x), q(y), q(Math.max(0.5, r)), 0, TAU); g.fill(); }
  function line(g, x1, y1, x2, y2, w, col) { g.strokeStyle = col; g.lineWidth = q(w); g.lineCap = 'round'; g.beginPath(); g.moveTo(q(x1), q(y1)); g.lineTo(q(x2), q(y2)); g.stroke(); }
  function poly(g, pts, col) { g.fillStyle = col; g.beginPath(); g.moveTo(q(pts[0]), q(pts[1])); for (var i = 2; i < pts.length; i += 2) g.lineTo(q(pts[i]), q(pts[i + 1])); g.closePath(); g.fill(); }
  // A closed smooth outline through the points (quadratic curves between midpoints): organic bodies.
  function blob(g, pts, col) {
    var n = pts.length / 2;
    g.fillStyle = col; g.beginPath();
    g.moveTo(q((pts[0] + pts[2]) / 2), q((pts[1] + pts[3]) / 2));
    for (var i = 1; i <= n; i++) {
      var a = i % n, b = (i + 1) % n;
      g.quadraticCurveTo(q(pts[a * 2]), q(pts[a * 2 + 1]), q((pts[a * 2] + pts[b * 2]) / 2), q((pts[a * 2 + 1] + pts[b * 2 + 1]) / 2));
    }
    g.closePath(); g.fill();
  }
  // A limb segment that narrows from w1 to w2, with round ends.
  function taper(g, x1, y1, x2, y2, w1, w2, col) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
    poly(g, [x1 + nx * w1 / 2, y1 + ny * w1 / 2, x2 + nx * w2 / 2, y2 + ny * w2 / 2, x2 - nx * w2 / 2, y2 - ny * w2 / 2, x1 - nx * w1 / 2, y1 - ny * w1 / 2], col);
    circ(g, x1, y1, w1 / 2, col); circ(g, x2, y2, w2 / 2, col);
  }
  // A two-segment leg: angles from straight down (positive leans toward +x). Returns the foot.
  function limb(g, hx, hy, a1, l1, a2, l2, w, col) {
    var kx = hx + Math.sin(a1) * l1, ky = hy + Math.cos(a1) * l1, fx = kx + Math.sin(a2) * l2, fy = ky + Math.cos(a2) * l2;
    taper(g, hx, hy, kx, ky, w, w * 0.7, col); taper(g, kx, ky, fx, fy, w * 0.7, w * 0.5, col);
    return { x: fx, y: fy };
  }
  // Shaggy fur along a polyline: soft, uneven tufts that lean back (toward -x). side 1 or -1 picks the outward face.
  function fur(g, pts, len, col, side) {
    g.fillStyle = col; g.beginPath();
    var m = 0;
    for (var i = 0; i < pts.length - 2; i += 2) {
      var x1 = pts[i], y1 = pts[i + 1], x2 = pts[i + 2], y2 = pts[i + 3], dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy) || 1, n = Math.max(1, Math.round(L / (len * 1.15)));
      for (var k = 0; k < n; k++, m++) {
        var ax = x1 + dx * k / n, ay = y1 + dy * k / n, bx = x1 + dx * (k + 1) / n, by = y1 + dy * (k + 1) / n, nx = dy / L * side, ny = -dx / L * side;
        var h = len * (0.55 + 0.45 * ((m * 7) % 3) / 2), tx = (ax + bx) / 2 - nx * h - h * 0.7, ty = (ay + by) / 2 - ny * h;
        g.moveTo(q(ax), q(ay)); g.quadraticCurveTo(q(tx + h * 0.2), q(ty + ny * h * 0.1), q(tx), q(ty)); g.quadraticCurveTo(q((tx + bx) / 2), q((ty + by) / 2 + ny * h * 0.3), q(bx), q(by));
      }
    }
    g.fill();
  }
  function sw(ph, off) { return Math.sin(TAU * (ph + off)); }
  function cw(ph, off) { return Math.cos(TAU * (ph + off)); }
  function mix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var r = Math.round((x >> 16 & 255) + ((y >> 16 & 255) - (x >> 16 & 255)) * t), gg = Math.round((x >> 8 & 255) + ((y >> 8 & 255) - (x >> 8 & 255)) * t),
        bb = Math.round((x & 255) + ((y & 255) - (x & 255)) * t);
    return '#' + ((1 << 24) | (r << 16) | (gg << 8) | bb).toString(16).slice(1);
  }

  // Quadruped gait: diagonal pairs in phase; the swinging leg lifts and folds. far: the two legs behind the body.
  function gait(g, r, ph, y, opt, far) {
    var col = far ? mix(opt.col, '#000000', 0.35) : opt.col, sx = far ? -r * 0.08 : 0;
    var legs = [[opt.front, far ? 0.5 : 0, true], [opt.back, far ? 0 : 0.5, false]];
    for (var i = 0; i < 2; i++) {
      var hx = legs[i][0] + sx, s = sw(ph, legs[i][1]), lift = Math.max(0, cw(ph, legs[i][1])), a = s * opt.swing;
      var foot = legs[i][2] ? limb(g, hx, y + opt.hip, a - 0.08, opt.L * 0.52, a + 0.12 - lift * 1.0, opt.L * 0.55, opt.w, col)
                            : limb(g, hx, y + opt.hip, a + 0.42, opt.L * 0.5, a - 0.38 - lift * 0.5, opt.L * 0.6, opt.w * 1.1, col);
      ell(g, foot.x + r * 0.05, foot.y, opt.w * 0.55, opt.w * 0.3, mix(col, '#000000', 0.25));
      if (opt.claws) for (var k = 0; k < 3; k++) line(g, foot.x + opt.w * 0.3, foot.y + (k - 1) * opt.w * 0.12, foot.x + opt.w * 0.6, foot.y + (k - 1) * opt.w * 0.15 + opt.w * 0.12, r * 0.04, '#e8e0cc');
    }
  }

  var DRAW = {
    wolf: function (g, r, ph, c) {
      var b = sw(ph * 2, 0) * r * 0.05, tail = sw(ph, 0.2) * r * 0.12, leg = { front: r * 0.55, back: -r * 0.6, hip: r * 0.05, L: r * 0.95, w: r * 0.25, swing: 0.55, col: c[0] };
      gait(g, r, ph, b, leg, true);
      blob(g, [-r * 0.8, -r * 0.3 + b, -r * 1.3, -r * 0.55 + tail, -r * 1.75, -r * 0.25 + tail * 1.5, -r * 1.45, -r * 0.05 + tail, -r * 0.9, -r * 0.05 + b], c[1]); // bushy tail
      line(g, -r * 1.35, -r * 0.35 + tail, -r * 1.7, -r * 0.24 + tail * 1.5, r * 0.08, c[2]);
      blob(g, [r * 0.8, -r * 0.1 + b, r * 0.45, -r * 0.55 + b, -r * 0.2, -r * 0.48 + b, -r * 0.88, -r * 0.42 + b, -r * 0.95, r * 0.05 + b,
        -r * 0.55, r * 0.22 + b, -r * 0.1, r * 0.18 + b, r * 0.45, r * 0.38 + b], c[0]); // deep chest, tucked waist
      blob(g, [r * 0.4, -r * 0.52 + b, -r * 0.2, -r * 0.5 + b, -r * 0.85, -r * 0.42 + b, -r * 0.3, -r * 0.3 + b], c[1]); // dark saddle
      fur(g, [r * 0.55, -r * 0.5 + b, r * 0.1, -r * 0.52 + b, -r * 0.4, -r * 0.47 + b, -r * 0.88, -r * 0.4 + b], r * 0.063, c[1], 1); // hackles
      fur(g, [r * 0.4, r * 0.36 + b, -r * 0.1, r * 0.2 + b, -r * 0.5, r * 0.22 + b], r * 0.045, c[0], -1); // shaggy belly
      blob(g, [r * 0.62, r * 0.05 + b, r * 0.3, r * 0.32 + b, -r * 0.1, r * 0.16 + b, r * 0.2, r * 0.0 + b], c[2]); // pale chest
      poly(g, [r * 0.4, -r * 0.5 + b, r * 0.95, -r * 0.75 + b, r * 1.1, -r * 0.35 + b, r * 0.75, r * 0.05 + b], c[0]); // neck ruff
      fur(g, [r * 0.95, -r * 0.3 + b, r * 0.8, r * 0.05 + b, r * 0.55, r * 0.32 + b], r * 0.063, c[2], -1); // pale throat ruff
      fur(g, [r * 0.95, -r * 0.78 + b, r * 0.6, -r * 0.62 + b, r * 0.4, -r * 0.52 + b], r * 0.068, c[0], 1); // mane
      blob(g, [r * 0.85, -r * 0.82 + b, r * 1.25, -r * 0.84 + b, r * 1.85, -r * 0.54 + b, r * 1.82, -r * 0.38 + b, r * 1.3, -r * 0.3 + b, r * 0.9, -r * 0.45 + b], c[0]); // skull + long muzzle
      poly(g, [r * 1.3, -r * 0.36 + b, r * 1.78, -r * 0.4 + b, r * 1.35, -r * 0.22 + b], c[1]); // jaw line
      line(g, r * 1.45, -r * 0.37 + b, r * 1.75, -r * 0.4 + b, r * 0.03, '#f0ead8'); // a glint of teeth
      circ(g, r * 1.83, -r * 0.52 + b, r * 0.075, '#141414'); // nose
      poly(g, [r * 0.92, -r * 0.72 + b, r * 0.98, -r * 1.12 + b, r * 1.18, -r * 0.78 + b], c[1]); // ears
      poly(g, [r * 1.05, -r * 0.76 + b, r * 1.14, -r * 1.08 + b, r * 1.3, -r * 0.78 + b], c[0]);
      gait(g, r, ph, b, leg, false);
    },
    raven: function (g, r, ph, c) {
      var flap = sw(ph, 0), up = flap * r * 1.1;
      blob(g, [-r * 0.1, -r * 0.15, -r * 0.8, -r * 0.4 - up * 0.8, -r * 1.6, -r * 0.6 - up, -r * 1.2, -r * 0.2 - up * 0.5, -r * 0.5, r * 0.05], c[1]); // far wing
      poly(g, [-r * 0.85, -r * 0.05, -r * 1.65, -r * 0.35, -r * 1.75, r * 0.0, -r * 1.6, r * 0.3, -r * 0.85, r * 0.12], c[1]); // fan tail
      blob(g, [r * 0.95, -r * 0.25, r * 0.4, -r * 0.45, -r * 0.5, -r * 0.3, -r * 0.95, r * 0.0, -r * 0.4, r * 0.35, r * 0.5, r * 0.28], c[0]); // body
      circ(g, r * 0.95, -r * 0.3, r * 0.38, c[0]);
      blob(g, [r * 1.2, -r * 0.42, r * 1.75, -r * 0.22, r * 1.2, -r * 0.12], '#1a1a1a'); // heavy beak
      line(g, r * 1.22, -r * 0.27, r * 1.65, -r * 0.22, r * 0.04, '#55575e');
      blob(g, [r * 0.2, -r * 0.1, -r * 0.4, -r * 0.3 - up * 0.9, -r * 1.3, -r * 0.45 - up * 1.2, -r * 1.0, -r * 0.05 - up * 0.6, -r * 0.2, r * 0.2], c[0]); // near wing
      for (var k = 0; k < 4; k++) line(g, -r * (0.55 + k * 0.18), -r * 0.12 - up * (0.55 + k * 0.15), -r * (0.95 + k * 0.18), -r * 0.2 - up * (0.75 + k * 0.17), r * 0.06, c[2]); // primaries
      ell(g, r * 0.7, -r * 0.42, r * 0.3, r * 0.08, c[2], -0.3); // glossy nape
      line(g, -r * 0.05, r * 0.3, -r * 0.15, r * 0.6, r * 0.07, '#2a2a2a'); line(g, r * 0.2, r * 0.28, r * 0.12, r * 0.58, r * 0.07, '#2a2a2a');
    },
    bear: function (g, r, ph, c) {
      var b = sw(ph * 2, 0) * r * 0.04, nod = sw(ph * 2, 0.25) * r * 0.05, leg = { front: r * 0.5, back: -r * 0.6, hip: r * 0.15, L: r * 0.78, w: r * 0.44, swing: 0.38, col: c[0], claws: true };
      gait(g, r, ph, b, leg, true);
      blob(g, [r * 0.8, -r * 0.05 + b, r * 0.55, -r * 0.6 + b, r * 0.15, -r * 0.98 + b, -r * 0.35, -r * 0.82 + b, -r * 0.85, -r * 0.55 + b, -r * 1.1, -r * 0.15 + b,
        -r * 1.0, r * 0.35 + b, -r * 0.4, r * 0.5 + b, r * 0.45, r * 0.5 + b], c[0]); // heavy body: high shoulder hump, sloping back
      blob(g, [r * 0.5, -r * 0.62 + b, r * 0.15, -r * 0.95 + b, -r * 0.4, -r * 0.78 + b, -r * 0.1, -r * 0.6 + b], c[2]); // frosted hump
      fur(g, [r * 0.55, -r * 0.62 + b, r * 0.15, -r * 0.98 + b, -r * 0.35, -r * 0.84 + b, -r * 0.85, -r * 0.57 + b, -r * 1.1, -r * 0.18 + b], r * 0.072, c[0], 1); // shaggy back
      fur(g, [r * 0.5, r * 0.48 + b, -r * 0.1, r * 0.5 + b, -r * 0.7, r * 0.45 + b], r * 0.072, c[1], -1); // shaggy belly
      fur(g, [-r * 1.08, -r * 0.1 + b, -r * 1.04, r * 0.3 + b], r * 0.054, c[0], 1); // rump
      blob(g, [r * 0.6, -r * 0.52 + nod, r * 1.0, -r * 0.68 + nod, r * 1.32, -r * 0.5 + nod, r * 1.62, -r * 0.3 + nod, r * 1.66, -r * 0.0 + nod,
        r * 1.25, r * 0.16 + nod, r * 0.85, r * 0.18 + nod, r * 0.55, -r * 0.1 + nod], c[0]); // big low head, blunt snout
      fur(g, [r * 0.8, r * 0.14 + nod, r * 0.55, -r * 0.05 + nod], r * 0.054, c[0], -1); // jowl ruff
      blob(g, [r * 1.28, -r * 0.28 + nod, r * 1.66, -r * 0.24 + nod, r * 1.68, r * 0.02 + nod, r * 1.28, r * 0.1 + nod], c[1]); // dark muzzle
      ell(g, r * 1.64, -r * 0.18 + nod, r * 0.1, r * 0.08, '#152028'); // nose
      line(g, r * 1.36, r * 0.06 + nod, r * 1.6, r * 0.04 + nod, r * 0.035, '#3a2a2a'); // mouth line
      circ(g, r * 0.88, -r * 0.6 + nod, r * 0.14, c[1]); circ(g, r * 0.88, -r * 0.6 + nod, r * 0.07, mix(c[1], '#ffffff', 0.4)); // round ear
      gait(g, r, ph, b, leg, false);
    },
    vine: function (g, r, ph, c) {
      var s = sw(ph, 0) * r * 0.22, t = sw(ph, 0.25) * r * 0.12;
      for (var k = 0; k < 5; k++) { var a = -0.4 + k * 0.2; taper(g, 0, r * 0.75, Math.sin(a) * r * 1.2 + (k - 2) * r * 0.1, r * 0.95 + Math.cos(a) * r * 0.05, r * 0.2, r * 0.05, c[1]); } // roots
      blob(g, [-r * 0.85, r * 0.85, -r * 0.4, r * 0.5, r * 0.4, r * 0.5, r * 0.9, r * 0.85, 0, r * 1.0], mix(c[1], '#2a2016', 0.5)); // root mound
      g.strokeStyle = c[1]; g.lineWidth = q(r * 0.36); g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, q(r * 0.7)); g.bezierCurveTo(q(-r * 0.8 + s), q(r * 0.1), q(r * 0.8 + s), q(-r * 0.4), q(s * 1.5), q(-r * 0.95)); g.stroke();
      g.strokeStyle = c[0]; g.lineWidth = q(r * 0.24);
      g.beginPath(); g.moveTo(0, q(r * 0.7)); g.bezierCurveTo(q(-r * 0.8 + s), q(r * 0.1), q(r * 0.8 + s), q(-r * 0.4), q(s * 1.5), q(-r * 0.95)); g.stroke();
      g.strokeStyle = c[0]; g.lineWidth = q(r * 0.1); // a coiling side tendril
      g.beginPath(); g.moveTo(q(-r * 0.2), q(r * 0.3)); g.bezierCurveTo(q(-r * 1.0), q(r * 0.1 + t), q(-r * 1.1), q(-r * 0.5 + t), q(-r * 0.7 + t), q(-r * 0.5)); g.stroke();
      for (var i = 0; i < 6; i++) { // thorns and leaves along the stem
        var u = (i + 1) / 7, x = (-r * 0.5 + s * u) * (1 - u) + s * 1.5 * u, y = r * 0.7 - u * r * 1.6, side = i % 2 ? 1 : -1;
        if (i % 3 === 2) blob(g, [x, y, x + side * r * 0.55, y - r * 0.25, x + side * r * 0.25, y - r * 0.05], c[2]);
        else poly(g, [x, y - r * 0.05, x + side * r * 0.32, y - r * 0.12, x, y - r * 0.16], '#d8d0a8');
      }
      var hx = s * 1.5, hy = -r * 1.05, open = 0.25 + 0.15 * sw(ph, 0.5); // the briar head: a split pod with a maw
      blob(g, [hx - r * 0.35, hy + r * 0.1, hx - r * 0.1, hy - r * 0.42, hx + r * 0.45, hy - r * 0.3 - open * r * 0.4, hx + r * 0.3, hy], c[0]);
      blob(g, [hx - r * 0.35, hy + r * 0.12, hx + r * 0.3, hy + r * 0.05, hx + r * 0.5, hy + r * 0.12 + open * r * 0.4, hx, hy + r * 0.3], c[1]);
      ell(g, hx + r * 0.25, hy + r * 0.05, r * 0.2, open * r * 0.3, '#3a0a12');
    },
    spirit: function (g, r, ph, c) {
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, q(r * 1.3));
      gr.addColorStop(0, c[2]); gr.addColorStop(0.45, c[0]); gr.addColorStop(1, 'rgba(255,160,60,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, q(r * 1.3), 0, TAU); g.fill();
      for (var k = 0; k < 5; k++) { // flame tongues licking upward
        var x = (k - 2) * r * 0.28, h = r * (0.9 + 0.35 * sw(ph, k / 5)) * (1 - Math.abs(k - 2) * 0.18);
        blob(g, [x - r * 0.22, -r * 0.1, x + sw(ph, k * 0.3) * r * 0.15, -r * 0.1 - h, x + r * 0.22, -r * 0.1, x, r * 0.2], k % 2 ? c[1] : c[0]);
      }
      circ(g, 0, sw(ph, 0) * r * 0.08, r * 0.5, c[2]);
      for (var i = 0; i < 3; i++) { var a = TAU * (ph + i / 3); circ(g, Math.cos(a) * r * 1.0, Math.sin(a) * r * 0.5, r * 0.13, c[0]); }
    },
    druid: function (g, r, ph, c) {
      var b = sw(ph * 2, 0) * r * 0.05, step = sw(ph, 0) * r * 0.32, cape = sw(ph, 0.15) * r * 0.12;
      taper(g, -r * 0.15, r * 0.35, -r * 0.15 + step, r * 1.0, r * 0.26, r * 0.2, '#2a2218'); // legs in leather
      taper(g, r * 0.15, r * 0.35, r * 0.15 - step, r * 1.0, r * 0.26, r * 0.2, '#3a2e20');
      ell(g, -r * 0.1 + step, r * 1.02, r * 0.18, r * 0.08, '#18130c'); ell(g, r * 0.2 - step, r * 1.02, r * 0.18, r * 0.08, '#18130c');
      blob(g, [-r * 0.3, -r * 0.55 + b, -r * 0.95 - cape, r * 0.15 + b, -r * 0.9 - cape * 1.5, r * 0.75 + b, -r * 0.2, r * 0.6 + b], c[1]); // cape behind
      blob(g, [0, -r * 0.62 + b, -r * 0.6, r * 0.0 + b, -r * 0.65, r * 0.72 + b, r * 0.1, r * 0.82 + b, r * 0.62, r * 0.68 + b, r * 0.5, r * 0.0 + b], c[0]); // robe
      poly(g, [-r * 0.6, r * 0.62 + b, -r * 0.4, r * 0.82 + b, -r * 0.2, r * 0.66 + b, 0, r * 0.84 + b, r * 0.2, r * 0.68 + b, r * 0.42, r * 0.8 + b, r * 0.6, r * 0.62 + b], c[1]); // ragged hem
      line(g, -r * 0.5, r * 0.08 + b, r * 0.48, r * 0.05 + b, r * 0.12, '#6a4a28'); circ(g, r * 0.05, r * 0.07 + b, r * 0.08, '#c8a860'); // belt
      blob(g, [-r * 0.45, -r * 0.45 + b, -r * 0.1, -r * 0.62 + b, r * 0.4, -r * 0.48 + b, r * 0.3, -r * 0.18 + b, -r * 0.4, -r * 0.18 + b], '#5a4a34'); // fur mantle
      blob(g, [-r * 0.32, -r * 0.62 + b, -r * 0.2, -r * 1.12 + b, r * 0.3, -r * 1.12 + b, r * 0.4, -r * 0.62 + b], c[1]); // hood
      ell(g, r * 0.16, -r * 0.82 + b, r * 0.17, r * 0.2, '#d8c49a'); // face in the hood
      for (var s = -1; s <= 1; s += 2) { // antlers
        var ax = s * r * 0.15 + r * 0.05;
        line(g, ax, -r * 1.05 + b, ax + s * r * 0.4, -r * 1.55 + b, r * 0.09, '#d8c8a0');
        line(g, ax + s * r * 0.22, -r * 1.3 + b, ax + s * r * 0.05, -r * 1.6 + b, r * 0.07, '#d8c8a0');
        line(g, ax + s * r * 0.4, -r * 1.55 + b, ax + s * r * 0.62, -r * 1.68 + b, r * 0.06, '#d8c8a0');
      }
      taper(g, r * 0.8, -r * 1.15 + b, r * 0.8, r * 1.0, r * 0.13, r * 0.1, '#6a4a28'); // staff
      line(g, r * 0.8, -r * 1.15 + b, r * 0.62, -r * 1.42 + b, r * 0.07, '#6a4a28'); line(g, r * 0.8, -r * 1.15 + b, r * 0.98, -r * 1.42 + b, r * 0.07, '#6a4a28');
      blob(g, [r * 0.45, -r * 0.35 + b, r * 0.8, -r * 0.42 + b, r * 0.85, -r * 0.2 + b, r * 0.5, -r * 0.15 + b], c[0]); // sleeve gripping the staff
    },
    blob: function (g, r, ph, c) {
      var sq = sw(ph, 0) * 0.1, w = r * (1 + sq), h = r * (0.85 - sq);
      for (var k = 0; k < 4; k++) { var px = (k - 1.5) * r * 0.45, lift = Math.max(0, sw(ph, k / 4)) * r * 0.15; taper(g, px, r * 0.4, px + r * 0.1, r * 0.92 - lift, r * 0.22, r * 0.12, c[1]); } // stubby feet
      blob(g, [w, -r * 0.05, w * 0.6, -h, -w * 0.1, -h * 1.1, -w * 0.75, -h * 0.75, -w, h * 0.1, -w * 0.6, h * 0.75, w * 0.1, h * 0.85, w * 0.8, h * 0.5], c[0]);
      blob(g, [w * 0.5, -h * 0.8, -w * 0.1, -h * 1.0, -w * 0.6, -h * 0.6, -w * 0.1, -h * 0.55], mix(c[0], c[2], 0.35)); // wet sheen
      var pus = [[-0.5, -0.3, 0.16], [0.1, -0.7, 0.12], [-0.2, 0.3, 0.14], [0.5, -0.45, 0.1], [-0.75, 0.15, 0.1]];
      for (var i = 0; i < pus.length; i++) { circ(g, pus[i][0] * w, pus[i][1] * h, pus[i][2] * r, c[2]); circ(g, pus[i][0] * w - r * 0.03, pus[i][1] * h - r * 0.03, pus[i][2] * r * 0.45, '#f4f8c0'); }
      blob(g, [w * 0.95, -r * 0.0, w * 0.55, r * 0.12, w * 0.3, r * 0.36 + sq * r, w * 0.75, r * 0.3], '#2a0a08'); // maw
      for (var t = 0; t < 4; t++) poly(g, [w * (0.42 + t * 0.12), r * 0.12, w * (0.47 + t * 0.12), r * 0.24, w * (0.52 + t * 0.12), r * 0.12], '#e8e0c0');
    },
    robed: function (g, r, ph, c) {
      var b = sw(ph * 2, 0) * r * 0.05, hem = sw(ph, 0) * r * 0.1;
      blob(g, [-r * 0.15, -r * 0.65 + b, -r * 0.7, r * 0.1 + b, -r * 0.9 - hem, r * 1.0, r * 0.75 + hem, r * 1.0, r * 0.55, r * 0.1 + b, r * 0.3, -r * 0.6 + b], c[0]); // hunched robe
      poly(g, [-r * 0.9 - hem, r * 0.95, -r * 0.65, r * 1.08, -r * 0.4, r * 0.92, -r * 0.1, r * 1.1, r * 0.2, r * 0.92, r * 0.5, r * 1.08, r * 0.75 + hem, r * 0.95], c[1]);
      line(g, -r * 0.2, -r * 0.3 + b, -r * 0.35, r * 0.9, r * 0.06, c[1]); line(g, r * 0.15, -r * 0.2 + b, r * 0.25, r * 0.9, r * 0.06, c[1]); // folds
      blob(g, [-r * 0.45, -r * 0.55 + b, -r * 0.3, -r * 1.15 + b, r * 0.25, -r * 1.25 + b, r * 0.6, -r * 0.75 + b, r * 0.3, -r * 0.45 + b], c[1]); // hood
      ell(g, r * 0.3, -r * 0.82 + b, r * 0.2, r * 0.24, '#0a0a0c'); // shadowed face
      taper(g, r * 0.75, -r * 1.25 + b, r * 0.75 + sw(ph, 0.25) * r * 0.1, r * 1.0, r * 0.13, r * 0.09, '#5a3e22'); // staff
      circ(g, r * 0.75, -r * 1.35 + b, r * 0.22, '#d8d0b8'); circ(g, r * 0.7, -r * 1.38 + b, r * 0.05, '#222'); circ(g, r * 0.82, -r * 1.38 + b, r * 0.05, '#222'); // skull totem
      for (var k = 0; k < 3; k++) line(g, r * 0.72 + k * r * 0.05, -r * 1.15 + b, r * 0.65 + k * r * 0.1, -r * 0.8 + b, r * 0.04, k === 1 ? c[2] : '#a08060'); // fetish strings
      blob(g, [r * 0.3, -r * 0.35 + b, r * 0.75, -r * 0.45 + b, r * 0.8, -r * 0.2 + b, r * 0.35, -r * 0.1 + b], c[0]); // sleeve
    },
    slab: function (g, r, ph, c) {
      var s = sw(ph, 0) * r * 0.3, b = sw(ph * 2, 0) * r * 0.04;
      taper(g, -r * 0.35, r * 0.4, -r * 0.35 + s * 0.6, r * 1.0, r * 0.4, r * 0.32, mix(c[1], '#000000', 0.2)); // far leg
      taper(g, -r * 0.6, -r * 0.4 + b, -r * 0.85 - s, r * 0.55, r * 0.38, r * 0.3, mix(c[1], '#000000', 0.2)); // back arm
      circ(g, -r * 0.85 - s, r * 0.6, r * 0.24, mix(c[1], '#000000', 0.2));
      blob(g, [-r * 0.75, r * 0.5 + b, -r * 0.9, -r * 0.35 + b, -r * 0.4, -r * 0.85 + b, r * 0.45, -r * 0.88 + b, r * 0.9, -r * 0.45 + b, r * 0.8, r * 0.5 + b, 0, r * 0.62 + b], c[0]); // hunched torso
      blob(g, [-r * 0.4, -r * 0.8 + b, r * 0.4, -r * 0.84 + b, r * 0.6, -r * 0.55 + b, -r * 0.5, -r * 0.5 + b], mix(c[0], c[2], 0.25)); // shoulders
      blob(g, [-r * 0.5, r * 0.15 + b, r * 0.6, r * 0.12 + b, r * 0.55, r * 0.5 + b, -r * 0.55, r * 0.5 + b], c[1]); // belly band
      blob(g, [r * 0.15, -r * 0.75 + b, r * 0.35, -r * 1.1 + b, r * 0.7, -r * 1.05 + b, r * 0.75, -r * 0.72 + b], c[0]); // low brutish head
      poly(g, [r * 0.38, -r * 0.82 + b, r * 0.78, -r * 0.9 + b, r * 0.75, -r * 0.8 + b], c[1]); // heavy brow
      poly(g, [r * 0.6, -r * 0.78 + b, r * 0.66, -r * 0.62 + b, r * 0.7, -r * 0.78 + b], '#e8e0c0'); // tusk
      taper(g, r * 0.35, r * 0.4, r * 0.35 - s * 0.6, r * 1.0, r * 0.42, r * 0.34, c[1]); // near leg
      taper(g, r * 0.65, -r * 0.45 + b, r * 0.85 + s, r * 0.5, r * 0.42, r * 0.34, c[0]); // front arm, hanging low
      circ(g, r * 0.85 + s, r * 0.58, r * 0.28, c[0]);
      for (var k = 0; k < 3; k++) circ(g, r * 0.95 + s, r * 0.45 + k * r * 0.12, r * 0.06, c[1]); // knuckles
    },
    imp: function (g, r, ph, c) {
      var b = sw(ph * 2, 0) * r * 0.08, flick = sw(ph, 0) * r * 0.3, flap = sw(ph * 2, 0) * r * 0.25;
      blob(g, [-r * 0.1, -r * 0.4 + b, -r * 0.9, -r * 1.1 + b - flap, -r * 0.8, -r * 0.45 + b, -r * 1.2, -r * 0.3 + b - flap * 0.5, -r * 0.4, -r * 0.1 + b], c[1]); // bat wing
      taper(g, -r * 0.55, r * 0.05 + b, -r * 1.25, -r * 0.45 + flick, r * 0.2, r * 0.06, c[1]); // tail
      blob(g, [-r * 1.25, -r * 0.45 + flick, -r * 1.45, -r * 0.7 + flick, -r * 1.2, -r * 0.65 + flick], c[2]);
      gait(g, r, ph, b, { front: r * 0.25, back: -r * 0.3, hip: r * 0.25, L: r * 0.7, w: r * 0.18, swing: 0.6, col: c[1] }, true);
      blob(g, [r * 0.6, -r * 0.05 + b, r * 0.3, -r * 0.55 + b, -r * 0.4, -r * 0.45 + b, -r * 0.65, r * 0.15 + b, -r * 0.1, r * 0.5 + b, r * 0.45, r * 0.35 + b], c[0]); // pot belly
      blob(g, [r * 0.25, -r * 0.5 + b, r * 0.5, -r * 0.85 + b, r * 0.95, -r * 0.6 + b, r * 0.85, -r * 0.25 + b, r * 0.4, -r * 0.25 + b], c[0]); // head
      poly(g, [r * 0.3, -r * 0.7 + b, r * 0.1, -r * 1.25 + b, r * 0.5, -r * 0.82 + b], c[1]); poly(g, [r * 0.55, -r * 0.8 + b, r * 0.6, -r * 1.3 + b, r * 0.75, -r * 0.75 + b], c[1]); // horns
      poly(g, [r * 0.6, -r * 0.35 + b, r * 0.92, -r * 0.4 + b, r * 0.85, -r * 0.28 + b], '#2a0804'); // grin
      gait(g, r, ph, b, { front: r * 0.25, back: -r * 0.3, hip: r * 0.25, L: r * 0.7, w: r * 0.18, swing: 0.6, col: c[0] }, false);
    },
    archer: function (g, r, ph, c) {
      var step = sw(ph, 0) * r * 0.3, b = sw(ph * 2, 0) * r * 0.04;
      taper(g, -r * 0.1, r * 0.3, -r * 0.1 - step, r * 1.0, r * 0.2, r * 0.15, c[1]); taper(g, r * 0.1, r * 0.3, r * 0.1 + step, r * 1.0, r * 0.2, r * 0.15, mix(c[1], '#000000', 0.2));
      poly(g, [-r * 0.5, -r * 0.5 + b, -r * 0.6, -r * 0.95 + b, -r * 0.35, -r * 0.95 + b, -r * 0.25, -r * 0.45 + b], '#4a3020'); // quiver
      for (var k = 0; k < 3; k++) line(g, -r * (0.55 - k * 0.1), -r * 0.95 + b, -r * (0.6 - k * 0.12), -r * 1.15 + b, r * 0.05, '#d8d0b0');
      blob(g, [0, -r * 0.65 + b, -r * 0.45, -r * 0.2 + b, -r * 0.45, r * 0.5, r * 0.4, r * 0.5, r * 0.38, -r * 0.2 + b], c[0]); // tunic
      poly(g, [-r * 0.45, r * 0.4, -r * 0.3, r * 0.6, -r * 0.1, r * 0.45, r * 0.1, r * 0.62, r * 0.4, r * 0.4], c[1]);
      blob(g, [-r * 0.25, -r * 0.65 + b, -r * 0.15, -r * 1.15 + b, r * 0.35, -r * 1.1 + b, r * 0.35, -r * 0.65 + b], c[1]); // cowl
      ell(g, r * 0.2, -r * 0.88 + b, r * 0.13, r * 0.17, '#0c0a0a');
      g.strokeStyle = '#6a4424'; g.lineWidth = q(r * 0.12); g.lineCap = 'round'; g.beginPath(); g.arc(q(r * 0.4), q(-r * 0.25 + b), q(r * 0.8), -1.2, 1.2); g.stroke(); // bow
      var tx = r * 0.4 + Math.cos(1.2) * r * 0.8, ty = Math.sin(1.2) * r * 0.8;
      line(g, tx, -r * 0.25 + b - ty, tx, -r * 0.25 + b + ty, r * 0.035, '#e0d8c0');
      taper(g, r * 0.05, -r * 0.45 + b, r * 0.5, -r * 0.3 + b, r * 0.14, r * 0.1, c[0]); // drawing arm
    },
    wraith: function (g, r, ph, c) {
      var w = sw(ph, 0) * r * 0.18, w2 = sw(ph, 0.33) * r * 0.18;
      g.globalAlpha = 0.9;
      blob(g, [-r * 0.6, -r * 0.3, -r * 0.35, -r * 1.2, r * 0.35, -r * 1.25, r * 0.65, -r * 0.3, r * 0.55, r * 0.5, r * 0.4 + w, r * 1.05, r * 0.1, r * 0.65,
        -r * 0.2 - w2, r * 1.1, -r * 0.4, r * 0.6, -r * 0.7 - w, r * 0.95], c[0]); // tattered shroud
      g.globalAlpha = 1;
      blob(g, [-r * 0.3, -r * 0.6, -r * 0.2, -r * 1.12, r * 0.3, -r * 1.15, r * 0.45, -r * 0.6], c[1]); // cowl
      ell(g, r * 0.12, -r * 0.75, r * 0.22, r * 0.25, '#05080c'); // the void within
      taper(g, r * 0.3, -r * 0.3, r * 0.95, r * 0.0 + w, r * 0.16, r * 0.08, c[0]); // reaching arm
      for (var k = 0; k < 3; k++) line(g, r * 0.95, w, r * 1.2, -r * 0.1 + k * r * 0.12 + w, r * 0.04, c[2]); // claws
    },
    ram: function (g, r, ph, c) {
      var b = sw(ph * 2, 0) * r * 0.04, leg = { front: r * 0.55, back: -r * 0.55, hip: r * 0.2, L: r * 0.75, w: r * 0.22, swing: 0.5, col: c[1] };
      gait(g, r, ph, b, leg, true);
      blob(g, [r * 0.85, -r * 0.1 + b, r * 0.5, -r * 0.6 + b, -r * 0.4, -r * 0.62 + b, -r * 1.0, -r * 0.3 + b, -r * 0.95, r * 0.3 + b, r * 0.0, r * 0.45 + b, r * 0.7, r * 0.3 + b], c[0]);
      for (var k = 0; k < 9; k++) circ(g, -r * 0.8 + (k % 5) * r * 0.36, -r * 0.4 + Math.floor(k / 5) * r * 0.32 + b, r * 0.2, c[2]); // wool curls
      blob(g, [r * 0.7, -r * 0.5 + b, r * 1.1, -r * 0.55 + b, r * 1.5, -r * 0.15 + b, r * 1.35, r * 0.05 + b, r * 0.9, -r * 0.1 + b], c[1]); // long skull
      g.strokeStyle = '#d8c890'; g.lineWidth = q(r * 0.2); g.lineCap = 'round'; g.beginPath(); g.arc(q(r * 0.85), q(-r * 0.4 + b), q(r * 0.32), -2.8, 1.6); g.stroke(); // curled horn
      g.strokeStyle = '#a89860'; g.lineWidth = q(r * 0.06); g.beginPath(); g.arc(q(r * 0.85), q(-r * 0.4 + b), q(r * 0.32), -2.0, 0.5); g.stroke();
      gait(g, r, ph, b, leg, false);
    },
    stag: function (g, r, ph, c) {
      var b = sw(ph * 2, 0) * r * 0.04, leg = { front: r * 0.6, back: -r * 0.6, hip: r * 0.1, L: r * 0.95, w: r * 0.13, swing: 0.5, col: c[1] };
      gait(g, r, ph, b, leg, true);
      blob(g, [r * 0.85, -r * 0.15 + b, r * 0.4, -r * 0.5 + b, -r * 0.5, -r * 0.48 + b, -r * 1.0, -r * 0.2 + b, -r * 0.85, r * 0.25 + b, r * 0.0, r * 0.3 + b, r * 0.7, r * 0.2 + b], c[0]); // body
      for (var k = 0; k < 5; k++) line(g, -r * 0.6 + k * r * 0.3, -r * 0.4 + b, -r * 0.65 + k * r * 0.3, r * 0.1 + b, r * 0.05, c[1]); // exposed ribs: the Hollow Stag
      taper(g, r * 0.65, -r * 0.3 + b, r * 1.05, -r * 0.9 + b, r * 0.3, r * 0.2, c[0]); // neck
      blob(g, [r * 0.95, -r * 1.05 + b, r * 1.25, -r * 1.05 + b, r * 1.5, -r * 0.88 + b, r * 1.3, -r * 0.78 + b, r * 0.98, -r * 0.82 + b], '#d8d0b8'); // skull face
      for (var s = 0; s < 2; s++) { // great antlers
        var ax = r * (1.05 - s * 0.12), col = s ? mix(c[2], '#000000', 0.3) : c[2];
        line(g, ax, -r * 1.05 + b, ax - r * 0.35, -r * 1.9 + b, r * 0.08, col);
        for (var t = 0; t < 4; t++) line(g, ax - r * 0.09 * (t + 1), -r * (1.25 + t * 0.17) + b, ax - r * 0.09 * (t + 1) + r * (t % 2 ? 0.3 : -0.25), -r * (1.45 + t * 0.2) + b, r * 0.05, col);
      }
      gait(g, r, ph, b, leg, false);
    },
    wisp: function (g, r, ph, c) {
      var gr = g.createRadialGradient(0, 0, 0, 0, 0, q(r * 1.1));
      gr.addColorStop(0, c[2]); gr.addColorStop(0.5, c[0]); gr.addColorStop(1, 'rgba(240,230,106,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, q(r * 1.1), 0, TAU); g.fill();
      g.strokeStyle = c[2]; g.lineWidth = q(r * 0.1); g.beginPath();
      for (var i = 0; i < 5; i++) { // crackling arcs
        var a = TAU * (i / 5 + ph), m = a + 0.25 * sw(ph * 3, i / 5);
        g.moveTo(q(Math.cos(a) * r * 0.5), q(Math.sin(a) * r * 0.5)); g.lineTo(q(Math.cos(m) * r * 0.9), q(Math.sin(m) * r * 0.9)); g.lineTo(q(Math.cos(a + 0.3) * r * 1.3), q(Math.sin(a + 0.3) * r * 1.3));
      }
      g.stroke(); circ(g, 0, 0, r * 0.4, c[2]);
    },
    harpy: function (g, r, ph, c) {
      var flap = sw(ph, 0), up = flap * r * 1.2;
      blob(g, [0, -r * 0.3, -r * 0.8, -r * 0.6 - up * 0.8, -r * 1.7, -r * 0.7 - up, -r * 1.3, -r * 0.2 - up * 0.4, -r * 0.5, r * 0.15], c[1]); // far wing
      line(g, -r * 0.1, r * 0.55, -r * 0.25, r * 1.0, r * 0.12, '#c8a850'); line(g, r * 0.15, r * 0.55, r * 0.25, r * 1.0, r * 0.12, '#c8a850'); // taloned legs
      for (var k = 0; k < 3; k++) { line(g, -r * 0.25, r * 1.0, -r * 0.35 + k * r * 0.1, r * 1.12, r * 0.05, '#e8e0c8'); line(g, r * 0.25, r * 1.0, r * 0.18 + k * r * 0.1, r * 1.12, r * 0.05, '#e8e0c8'); }
      blob(g, [0, -r * 0.6, -r * 0.4, -r * 0.1, -r * 0.3, r * 0.65, r * 0.35, r * 0.65, r * 0.4, -r * 0.1], c[0]); // feathered torso
      for (var f = 0; f < 3; f++) poly(g, [-r * 0.3 + f * r * 0.22, r * 0.2 + f * r * 0.08, -r * 0.2 + f * r * 0.22, r * 0.45, -r * 0.1 + f * r * 0.22, r * 0.2 + f * r * 0.08], c[1]);
      blob(g, [-r * 0.15, -r * 0.6, -r * 0.05, -r * 1.12, r * 0.35, -r * 1.1, r * 0.4, -r * 0.6], c[2]); // pale head
      blob(g, [-r * 0.3, -r * 1.05, -r * 0.6, -r * 0.5, -r * 0.4, -r * 0.2, -r * 0.1, -r * 0.7], c[1]); // wild hair
      poly(g, [r * 0.35, -r * 0.9, r * 0.6, -r * 0.82, r * 0.35, -r * 0.75], '#c8a850');
      blob(g, [r * 0.1, -r * 0.2, -r * 0.5, -r * 0.4 - up * 0.9, -r * 1.4, -r * 0.5 - up * 1.2, -r * 1.05, -r * 0.05 - up * 0.5, -r * 0.2, r * 0.3], c[0]); // near wing
      for (var p = 0; p < 4; p++) line(g, -r * (0.6 + p * 0.2), -r * 0.2 - up * (0.6 + p * 0.15), -r * (1.0 + p * 0.2), -r * 0.3 - up * (0.8 + p * 0.15), r * 0.06, c[1]);
    },
    husk: function (g, r, ph, c) {
      var s = sw(ph, 0) * r * 0.28, b = sw(ph * 2, 0) * r * 0.04;
      taper(g, -r * 0.08, r * 0.35, -r * 0.08 - s, r * 1.08, r * 0.15, r * 0.1, mix(c[1], '#000000', 0.2)); taper(g, r * 0.08, r * 0.35, r * 0.08 + s, r * 1.08, r * 0.15, r * 0.1, c[1]);
      taper(g, -r * 0.2, -r * 0.5 + b, -r * 0.4 + s * 0.5, r * 0.4, r * 0.12, r * 0.08, mix(c[1], '#000000', 0.2)); // dangling far arm
      blob(g, [0, -r * 0.75 + b, -r * 0.32, -r * 0.4 + b, -r * 0.25, r * 0.45, r * 0.25, r * 0.45, r * 0.32, -r * 0.4 + b], c[0]); // gaunt torso
      ell(g, r * 0.0, -r * 0.15 + b, r * 0.14, r * 0.22, '#120a16'); // the hollow
      for (var k = 0; k < 3; k++) line(g, -r * 0.25, -r * 0.45 + k * r * 0.15 + b, r * 0.25, -r * 0.45 + k * r * 0.15 + b, r * 0.04, c[1]); // ribs
      blob(g, [-r * 0.15, -r * 0.75 + b, -r * 0.1, -r * 1.25 + b, r * 0.35, -r * 1.2 + b, r * 0.32, -r * 0.8 + b], c[1]); // sunken head
      taper(g, r * 0.2, -r * 0.5 + b, r * 0.6 - s * 0.5, r * 0.55, r * 0.12, r * 0.08, c[0]); // reaching arm
    }
  };

  var EXTRAS = {
    sparks: function (g, r, ph, c) { for (var i = 0; i < 3; i++) { var a = TAU * (ph + i / 3); line(g, Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.6 - r * 0.2, Math.cos(a + 0.4) * r * 1.2, Math.sin(a + 0.4) * r * 0.8 - r * 0.2, r * 0.08, c[2]); } },
    thorns: function (g, r, ph, c) { for (var i = 0; i < 5; i++) { var x = -r * 0.75 + i * r * 0.32; poly(g, [x, -r * 0.42, x + r * 0.1, -r * 0.82, x + r * 0.2, -r * 0.42], c[2]); } },
    ghost: function (g, r) { g.globalAlpha = 0.3; ell(g, -r * 0.5, -r * 0.1, r * 0.9, r * 0.5, '#e8f8ff'); g.globalAlpha = 1; },
    beak: function (g, r) { blob(g, [r * 1.35, -r * 0.4, r * 1.75, -r * 0.15, r * 1.4, r * 0.0], '#d8b040'); },
    halo: function (g, r, ph, c) { g.strokeStyle = c[2]; g.lineWidth = q(r * 0.08); g.beginPath(); g.ellipse(0, q(-r * 1.15), q(r * 0.5), q(r * 0.15), 0, 0, TAU); g.stroke(); },
    flower: function (g, r, ph, c) { for (var i = 0; i < 5; i++) { var a = TAU * i / 5; circ(g, Math.cos(a) * r * 0.25, -r * 1.35 + Math.sin(a) * r * 0.25, r * 0.16, c[2]); } circ(g, 0, -r * 1.35, r * 0.12, '#ffe060'); },
    bloom: function (g, r, ph, c) { circ(g, 0, -r * 1.35, r * 0.35, c[2]); circ(g, 0, -r * 1.35, r * 0.15, '#200'); },
    crown: function (g, r) { poly(g, [-r * 0.3, -r * 1.05, -r * 0.2, -r * 1.35, 0, -r * 1.15, r * 0.2, -r * 1.35, r * 0.3, -r * 1.05], '#ffcc44'); },
    twin: function (g, r, ph, c) { circ(g, Math.cos(TAU * ph) * r * 0.9, -r * 0.6, r * 0.3, c[2]); },
    flock: function (g, r, ph, c) { circ(g, -r * 0.9, -r * 0.8 + sw(ph, 0.3) * r * 0.2, r * 0.3, c[1]); circ(g, -r * 0.9, r * 0.7 + sw(ph, 0.6) * r * 0.2, r * 0.3, c[1]); },
    flames: function (g, r, ph) { for (var i = 0; i < 4; i++) blob(g, [-r * 0.6 + i * r * 0.4, -r * 0.6, -r * 0.45 + i * r * 0.4, -r * (1.15 + 0.2 * sw(ph, i / 4)), -r * 0.3 + i * r * 0.4, -r * 0.6], '#ffb040'); },
    eye: function (g, r) { ell(g, r * 0.1, -r * 0.1, r * 0.3, r * 0.18, '#f0d0ff'); circ(g, r * 0.15, -r * 0.1, r * 0.1, '#300'); },
    cracks: function (g, r) { line(g, -r * 0.3, -r * 0.4, r * 0.1, r * 0.1, r * 0.06, '#ff8a3a'); line(g, r * 0.1, r * 0.1, r * 0.4, -r * 0.2, r * 0.06, '#ff8a3a'); line(g, -r * 0.5, 0, -r * 0.2, r * 0.35, r * 0.05, '#ffb060'); },
    frost: function (g, r) { for (var i = 0; i < 3; i++) poly(g, [-r * 0.6 + i * r * 0.5, -r * 0.75, -r * 0.5 + i * r * 0.5, -r * 1.1, -r * 0.4 + i * r * 0.5, -r * 0.75], '#e0f4ff'); }
  };

  // Where each family's eyes sit (x, y in r units, eye radius); emissive, drawn after the light pass.
  var EYE_AT = { wolf: [1.3, -0.62, 0.075], bear: [1.18, -0.4, 0.065], raven: [1.05, -0.38, 0.07], blob: [[0.45, -0.25, 0.12], [0.72, -0.18, 0.1]],
    robed: [[0.25, -0.85, 0.06], [0.4, -0.85, 0.05]], slab: [0.6, -0.86, 0.06], imp: [0.7, -0.6, 0.08], archer: [0.24, -0.9, 0.05],
    wraith: [[0.05, -0.78, 0.07], [0.25, -0.78, 0.07]], ram: [1.1, -0.38, 0.06], stag: [1.25, -0.95, 0.06], harpy: [0.25, -0.88, 0.05],
    husk: [[0.12, -1.0, 0.05], [0.26, -1.0, 0.05]], vine: null, druid: null };
  function eyes(g, type, fam, r, ph) {
    var col = EYES[type], at = EYE_AT[fam];
    if (!at) return;
    var list = typeof at[0] === 'number' ? [at] : at, b = (fam === 'wolf' || fam === 'imp' ? sw(ph * 2, 0) * r * (fam === 'imp' ? 0.08 : 0.05) : 0)
      + (fam === 'bear' ? sw(ph * 2, 0.25) * r * 0.05 : 0) + (fam === 'robed' || fam === 'archer' || fam === 'husk' || fam === 'slab' || fam === 'ram' || fam === 'stag' ? sw(ph * 2, 0) * r * 0.04 : 0);
    for (var i = 0; i < list.length; i++) {
      var x = list[i][0] * r, y = list[i][1] * r + b, er = list[i][2] * r;
      if (col) { g.globalAlpha = 0.35; circ(g, x, y, er * 2.4, col); g.globalAlpha = 1; circ(g, x, y, er, col); circ(g, x, y, er * 0.45, '#ffffff'); }
      else { circ(g, x, y, er, '#120c08'); circ(g, x - er * 0.3, y - er * 0.3, er * 0.35, 'rgba(255,255,255,0.8)'); }
    }
  }
  // Emissive details that must not be darkened by the light pass.
  function emissive(g, type, fam, r, ph, c) {
    eyes(g, type, fam, r, ph);
    if (fam === 'druid') { // the staff's living light
      var b = sw(ph * 2, 0) * r * 0.05;
      g.globalAlpha = 0.4; circ(g, r * 0.8, -r * 1.32 + b, r * 0.34, '#a8f070'); g.globalAlpha = 1;
      circ(g, r * 0.8, -r * 1.32 + b, r * 0.17, '#c8ff90'); circ(g, r * 0.78, -r * 1.35 + b, r * 0.07, '#ffffff');
    }
    if (type === 'kilngolem') EXTRAS.cracks(g, r);
    if (type === 'cindermother') EXTRAS.flames(g, r, ph);
    if (fam === 'imp') circ(g, -r * 1.3, -r * 0.6 + sw(ph, 0) * r * 0.3, r * 0.14, '#fff0a0');
    if (type === 'unmaker') { ell(g, r * 0.1, -r * 0.1, r * 0.3, r * 0.18, '#f0d0ff'); circ(g, r * 0.15, -r * 0.1, r * 0.1, '#300'); }
  }

  // Draws one frame's shapes of `type` at run phase `ph` (0..1, looping) around (0, 0), body radius r.
  function drawBody(g, type, ph, r) {
    ph = ph - Math.floor(ph);
    var fam = FAMILY[type] || 'blob', c = PAL[type] || PAL[fam] || PAL.rotling;
    DRAW[fam](g, r, ph, c);
    if (EXTRA[type] && type !== 'kilngolem' && type !== 'cindermother' && type !== 'unmaker') EXTRAS[EXTRA[type]](g, r, ph, c);
  }

  function canvas(doc, w, h) { var c = doc.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  function radiusOf(type) {
    var d = PB.SUMMONS[type] || PB.ENEMIES[type] || PB.BOSSES[type];
    if (d) return d.r;
    for (var k in PB.FUSIONS) if (PB.FUSIONS[k].id === type) return PB.FUSIONS[k].r;
    if (type === 'necro' || type === 'sorc' || type === 'pala') return 12;
    for (var t in PB.ALPHA) if (PB.ALPHA[t].id === type) return PB.SUMMONS[t].r * 1.25;
    return type === 'druid' ? 12 : 12;
  }

  // A tileable grain texture (fur, hide, bark): short diagonal strokes, light and dark. Deterministic.
  function grain(doc) {
    var c = canvas(doc, 96, 96), g = c.getContext('2d'), rng = new PB.Rng(9173);
    for (var i = 0; i < 900; i++) {
      var x = rng.next() * 96, y = rng.next() * 96, l = 1.5 + rng.next() * 3, dark = rng.next() < 0.6;
      g.strokeStyle = dark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.7)'; g.lineWidth = 0.8 + rng.next() * 0.7;
      g.beginPath(); g.moveTo(q(x), q(y)); g.lineTo(q(x - l * 0.6), q(y + l)); g.stroke();
    }
    return c;
  }

  // Scratch canvases for the light pass, sized per sheet.
  function scratch(doc, S) { return { body: canvas(doc, S, S), sil: canvas(doc, S, S), band: canvas(doc, S, S) }; }
  function clearC(c) { var g = c.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); return g; }
  // The edge band of a silhouette lit from (dx, dy) away: the silhouette minus itself shifted.
  function edgeBand(tmp, S, dx, dy, color) {
    var g = clearC(tmp.band);
    g.drawImage(tmp.sil, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(tmp.sil, dx, dy);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
    return tmp.band;
  }
  // One lit frame into the sheet at (ox, 0).
  function litFrame(doc, sheetG, ox, S, type, ph, r, tex, tmp) {
    var fam = FAMILY[type] || 'blob', c = PAL[type] || PAL[fam] || PAL.rotling, bg = clearC(tmp.body), k = RES;
    bg.save(); bg.translate(S / 2, S / 2); bg.scale(k, k); drawBody(bg, type, ph, r); bg.restore();
    var sg = clearC(tmp.sil);
    sg.drawImage(tmp.body, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#ffffff'; sg.fillRect(0, 0, S, S); sg.globalCompositeOperation = 'source-over';
    if (!LUMINOUS[fam]) {
      bg.globalCompositeOperation = 'source-atop';
      bg.globalAlpha = 0.16; bg.drawImage(tex, (r * 7) % 40, (r * 3) % 40, 96, 96, 0, 0, S * 1.2, S * 1.2); // grain
      bg.globalAlpha = 1;
      var lg = bg.createLinearGradient(q(S / 2 - r * k * 0.3), q(S / 2 - r * k * 1.2), q(S / 2 + r * k * 0.3), q(S / 2 + r * k * 1.0));
      lg.addColorStop(0, 'rgba(255,238,205,0.30)'); lg.addColorStop(0.42, 'rgba(255,238,205,0)'); lg.addColorStop(0.6, 'rgba(6,5,14,0)'); lg.addColorStop(1, 'rgba(6,5,14,0.55)');
      bg.fillStyle = lg; bg.fillRect(0, 0, S, S); // key light from above
      bg.globalAlpha = 0.5; bg.drawImage(edgeBand(tmp, S, 1.6 * k, 2.0 * k, '#fff2d8'), 0, 0); // warm rim on the upper edges
      bg.globalAlpha = 0.45; bg.drawImage(edgeBand(tmp, S, -1.2 * k, -1.6 * k, '#05040a'), 0, 0); // occluded lower edges
      bg.globalAlpha = 1; bg.globalCompositeOperation = 'source-over';
    }
    bg.save(); bg.translate(S / 2, S / 2); bg.scale(k, k); emissive(bg, type, fam, r, ph - Math.floor(ph), c); bg.restore();
    // Dark outline: the silhouette, darkened, stamped around the body beneath it.
    var og = clearC(tmp.band);
    og.drawImage(tmp.sil, 0, 0); og.globalCompositeOperation = 'source-in'; og.fillStyle = LUMINOUS[fam] ? 'rgba(60,30,0,0.25)' : 'rgba(8,6,10,0.85)'; og.fillRect(0, 0, S, S);
    var d = 1.0 * k, offs = [[d, 0], [-d, 0], [0, d], [0, -d]];
    for (var i = 0; i < offs.length; i++) sheetG.drawImage(tmp.band, ox + offs[i][0], offs[i][1]);
    sheetG.drawImage(tmp.body, ox, 0);
  }

  // A type's sheets. size: the frame's logical size (draw size in world px); cell: its pixel size in the sheet (size * RES).
  function sheetFor(doc, type, packType, tex) {
    var r = radiusOf(type), k = spanOf(type), size = Math.max(24, Math.ceil(r * k)) + (Math.ceil(r * k) % 2), S = size * RES;
    var sheet = canvas(doc, S * FRAMES, S), g = sheet.getContext('2d'), tmp = scratch(doc, S);
    for (var f = 0; f < FRAMES; f++) litFrame(doc, g, f * S, S, type, f / FRAMES, r, tex, tmp);
    var white = canvas(doc, sheet.width, S), wg = white.getContext('2d');
    wg.drawImage(sheet, 0, 0); wg.globalCompositeOperation = 'source-in'; wg.fillStyle = '#ffffff'; wg.fillRect(0, 0, white.width, S);
    var tints = {};
    if (packType) PB.ESSENCES.forEach(function (e) {
      var tc = canvas(doc, sheet.width, S), tg = tc.getContext('2d');
      tg.drawImage(sheet, 0, 0); tg.globalCompositeOperation = 'source-atop'; tg.globalAlpha = 0.38; tg.fillStyle = ESS[e]; tg.fillRect(0, 0, tc.width, S);
      tints[e] = tc;
    });
    return { sheet: sheet, white: white, tints: tints, size: size, cell: S, res: RES, r: r, frames: FRAMES };
  }

  function glow(doc, color) {
    var c = canvas(doc, 64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.45)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }

  var GLYPHS = '0123456789!+', GW = 16, GH = 24, NUM_COLORS = { hit: '#f4efe2', crit: '#ffcc44', hurt: '#ff6a5a', dot: '#9fe060' };
  var SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
  function digits(doc) {
    var kinds = Object.keys(NUM_COLORS), c = canvas(doc, GW * GLYPHS.length, GH * kinds.length), g = c.getContext('2d');
    g.font = 'bold 20px ' + SERIF; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = 'rgba(10,6,4,0.9)';
    kinds.forEach(function (k, row) {
      g.fillStyle = NUM_COLORS[k];
      for (var i = 0; i < GLYPHS.length; i++) { g.strokeText(GLYPHS[i], i * GW + GW / 2, row * GH + GH / 2 + 1); g.fillText(GLYPHS[i], i * GW + GW / 2, row * GH + GH / 2 + 1); }
    });
    return { canvas: c, row: { hit: 0, crit: 1, hurt: 2, dot: 3 }, glyphs: GLYPHS, gw: GW, gh: GH };
  }

  function decals(doc) {
    var paw = canvas(doc, 16, 16), g = paw.getContext('2d');
    circ(g, 8, 10, 3.5, 'rgba(40,30,20,0.55)'); [[4, 5], [8, 3.5], [12, 5]].forEach(function (p) { circ(g, p[0], p[1], 1.6, 'rgba(40,30,20,0.55)'); });
    var scorch = canvas(doc, 48, 48), s = scorch.getContext('2d'), gr = s.createRadialGradient(24, 24, 2, 24, 24, 24);
    gr.addColorStop(0, 'rgba(20,10,5,0.7)'); gr.addColorStop(0.6, 'rgba(30,14,6,0.4)'); gr.addColorStop(1, 'rgba(20,10,5,0)'); s.fillStyle = gr; s.fillRect(0, 0, 48, 48);
    return { paw: paw, scorch: scorch };
  }

  function build(doc) {
    doc = doc || document;
    var tex = grain(doc), bodies = {}, pack = [].concat(Object.keys(PB.SUMMONS), Object.keys(PB.FUSIONS).map(function (k) { return PB.FUSIONS[k].id; }),
      Object.keys(PB.ALPHA).map(function (k) { return PB.ALPHA[k].id; }));
    pack.forEach(function (t) { bodies[t] = sheetFor(doc, t, true, tex); });
    Object.keys(PB.ENEMIES).concat(Object.keys(PB.BOSSES), ['druid', 'necro', 'sorc', 'pala', 'amaz', 'barb']).forEach(function (t) { bodies[t] = sheetFor(doc, t, false, tex); });
    var glows = {};
    [['gold', 'rgba(255,210,122,0.9)'], ['white', 'rgba(255,255,255,0.9)'], ['frost', 'rgba(160,220,255,0.9)'], ['ember', 'rgba(255,122,42,0.9)'],
     ['green', 'rgba(140,220,110,0.9)'], ['purple', 'rgba(190,140,255,0.9)'], ['red', 'rgba(255,80,60,0.9)']].forEach(function (p) { glows[p[0]] = glow(doc, p[1]); });
    var atlas = { bodies: bodies, glows: glows, digits: digits(doc), decals: decals(doc) };
    // Level 9: the 3D sculpts (sculpt.js) replace these flat sheets as they bake, most-seen first.
    if (PB.Sculpt && doc === (typeof document !== 'undefined' ? document : null)) PB.Sculpt.start(atlas, bakeOrder());
    return atlas;
  }
  // The druid and the base pack, the first zone, then fusions and Alphas, then the later zones in order.
  function bakeOrder() {
    var out = ['druid'].concat(PB.SUMMON_ORDER || []);
    Object.keys(PB.SUMMONS).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
    PB.ZONES.forEach(function (z, i) {
      out = out.concat(Object.keys(z.enemies), [z.boss]);
      if (i === 0) out = out.concat(Object.keys(PB.FUSIONS).map(function (k) { return PB.FUSIONS[k].id; }), Object.keys(PB.ALPHA).map(function (k) { return PB.ALPHA[k].id; }));
    });
    out.push('necro', 'sorc', 'pala', 'amaz', 'barb');
    return out;
  }

  function spanOf(type) { return SPAN[FAMILY[type]] || 3.8; }
  function eyeOf(type) { return EYES[type] || null; }
  function extraOf(type) { return EXTRA[type] || null; }

  PB.Sprites = { build: build, drawBody: drawBody, familyOf: familyOf, radiusOf: radiusOf, spanOf: spanOf, eyeOf: eyeOf, extraOf: extraOf, bakeOrder: bakeOrder,
    FRAMES: FRAMES, RES: RES, PALETTE: PAL, SERIF: SERIF,
    bakeGround: function () { return PB.Terrain.bakeGround.apply(null, arguments); }, bakeChunks: function () { return PB.Terrain.bakeChunks.apply(null, arguments); },
    helpers: { ell: ell, circ: circ, line: line, poly: poly, blob: blob, taper: taper, mix: mix, q: q } };
})(globalThis.PB = globalThis.PB || {});
