// Zone terrain: the baked ground (layered value noise lit as a height field, per-zone materials and stamped detail),
// the props that stand on each obstacle (trees, boulders, crags, obelisks: y-sorted with the bodies by render.js),
// canopy crowns over the edges, flickering braziers and the glowing ground features that feed the light mask.
// Presentation only: seeded from the world seed, never reads or writes the sim. `doc` is injectable for node tests.
(function (PB) {
  'use strict';
  var TAU = Math.PI * 2, floor = Math.floor, max = Math.max, min = Math.min, imul = Math.imul; // locals: hot loops (and node's vm) skip global lookups
  function q(v) { return Math.round(v * 100) / 100; }
  function H() { return PB.Sprites.helpers; }
  function canvas(doc, w, h) { var c = doc.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  // Per-zone materials. low/mid/high: the height field's tones; patch: a second material laid by a slow mask (moss,
  // ash, snow, gravel, blight); props: what stands on the obstacles; glow: the color of glowing ground features.
  var BIOME = {
    mirewood:    { low: '#121811', mid: '#222c1a', high: '#323e1e', patch: '#3a5224', cut: 0.56, relief: 1.0, props: ['tree', 'tree', 'boulder'],
                   crown: ['#1c3016', '#36552a', '#6c8e3c'], rock: ['#4e5246', '#22251f'], cap: '#4f6e2c', glow: '#9fe8a0', moon: '#a8c8ff' },
    emberfen:    { low: '#140b08', mid: '#2a1a13', high: '#3a271c', patch: '#3e3936', cut: 0.6, relief: 1.2, props: ['basalt', 'basalt', 'charred'],
                   crown: ['#120c0a', '#231610', '#3a2618'], rock: ['#3a302c', '#151010'], cap: '#4a4440', glow: '#ff7a2a', moon: '#ffb070' },
    frostpine:   { low: '#1a242e', mid: '#2a3846', high: '#3c4c5c', patch: '#6c7c8e', cut: 0.5, relief: 1.0, props: ['pine', 'pine', 'boulder'],
                   crown: ['#142026', '#1f3036', '#8a9cae'], rock: ['#5a6a78', '#24303a'], cap: '#c4d4e2', glow: '#a8e4ff', moon: '#c8dcff' },
    stormcrag:   { low: '#17171d', mid: '#25262e', high: '#363743', patch: '#45422f', cut: 0.6, relief: 1.4, props: ['crag', 'crag', 'pillar'],
                   crown: ['#16161c', '#26262e', '#45465a'], rock: ['#5a5c68', '#1e1f26'], cap: '#6a6648', glow: '#f5e46a', moon: '#c8ccff' },
    blightheart: { low: '#0e0910', mid: '#1c1220', high: '#2a1a2e', patch: '#36203c', cut: 0.6, relief: 1.0, props: ['obelisk', 'deadtree', 'boulder'],
                   crown: ['#120a14', '#22142a', '#3e2648'], rock: ['#3e3444', '#18121c'], cap: '#5a3a68', glow: '#c070ff', moon: '#d0a8ff' }
  };
  function biome(zone) { return BIOME[zone && zone.id] || BIOME.mirewood; }

  // ---------- value noise ----------
  function hash(ix, iy, s) {
    var h = (imul(ix, 374761393) + imul(iy, 668265263) + imul(s, 1442695041)) | 0;
    h = imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    var ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct) {
    var sum = 0, amp = 0.5, norm = 0;
    for (var o = 0; o < oct; o++) { sum += vnoise(x, y, s + o * 101) * amp; norm += amp; amp *= 0.5; x *= 2.03; y *= 2.03; }
    return sum / norm;
  }

  // Adds one octave of value noise (lattice spacing `cell` px) into out (w x h), weighted by amp. The lattice is hashed
  // once and interpolated with precomputed smoothstep weights, so a whole field costs a few multiplies per pixel.
  function octave(out, w, h, cell, s, amp) {
    var gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, L = new Float32Array(gw * gh), x, y;
    for (y = 0; y < gh; y++) for (x = 0; x < gw; x++) L[y * gw + x] = hash(x, y, s);
    var ix = new Int32Array(w), ux = new Float32Array(w);
    for (x = 0; x < w; x++) { var fx = x / cell, i0 = floor(fx), t = fx - i0; ix[x] = i0; ux[x] = t * t * (3 - 2 * t); }
    for (y = 0; y < h; y++) {
      var fy = y / cell, j = floor(fy), v = fy - j; v = v * v * (3 - 2 * v);
      var r0 = j * gw, r1 = r0 + gw, o = y * w;
      for (x = 0; x < w; x++) {
        var k = ix[x], u = ux[x], a = L[r0 + k], b = L[r0 + k + 1], c = L[r1 + k], d = L[r1 + k + 1];
        out[o + x] += (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * amp;
      }
    }
  }
  function field(w, h, cell, s, oct) {
    var out = new Float32Array(w * h), amp = 0.5, norm = 0;
    for (var o = 0; o < oct; o++) { octave(out, w, h, max(1, cell), s + o * 101, amp); norm += amp; amp *= 0.5; cell /= 2.03; }
    for (var i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }

  // The height field at half resolution: material from height and a patch mask, relief lighting from the slope.
  function noiseGround(doc, g, B, seed, W, Hh) {
    var w = W >> 1, h = Hh >> 1, c = canvas(doc, w, h), cg = c.getContext('2d'), img = cg.createImageData(w, h), d = img.data;
    var s1 = seed & 0xffff, s2 = (seed >>> 8) & 0xffff, hf = field(w, h, 70, s1, 4), pm = field(w, h, 160, s2, 3), x, y, i;
    var lo = rgb(B.low), mi = rgb(B.mid), hi = rgb(B.high), pa = rgb(B.patch), K = 9 * B.relief, col = [0, 0, 0];
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      var t = hf[i], k;
      if (t < 0.5) { k = max(0, (t - 0.25) / 0.25); col[0] = lo[0] + (mi[0] - lo[0]) * k; col[1] = lo[1] + (mi[1] - lo[1]) * k; col[2] = lo[2] + (mi[2] - lo[2]) * k; }
      else { k = min(1, (t - 0.5) / 0.25); col[0] = mi[0] + (hi[0] - mi[0]) * k; col[1] = mi[1] + (hi[1] - mi[1]) * k; col[2] = mi[2] + (hi[2] - mi[2]) * k; }
      var m = max(0, min(1, (pm[i] - B.cut) / 0.06 + 0.5)) * (0.55 + 0.45 * t);
      col[0] += (pa[0] - col[0]) * m; col[1] += (pa[1] - col[1]) * m; col[2] += (pa[2] - col[2]) * m;
      var nx = x > 0 && y > 0 ? hf[i - w - 1] : t, px = x < w - 1 && y < h - 1 ? hf[i + w + 1] : t;
      var lit = 1 + (nx - px) * K; // light from the upper left
      d[i * 4] = col[0] * lit; d[i * 4 + 1] = col[1] * lit; d[i * 4 + 2] = col[2] * lit; d[i * 4 + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, W, Hh);
    return { hf: hf, pm: pm, w: w, h: h };
  }

  // ---------- stamped ground detail ----------
  function pebble(g, x, y, s, B) {
    var h = H(), rc = B.rock;
    h.ell(g, x + s * 0.3, y + s * 0.35, s * 1.1, s * 0.55, 'rgba(0,0,0,0.35)');
    h.ell(g, x, y, s, s * 0.7, rc[1]); h.ell(g, x - s * 0.15, y - s * 0.2, s * 0.7, s * 0.4, rc[0]);
  }
  function crack(g, rng, x, y, len, col, w) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(q(x), q(y));
    var a = rng.range(0, TAU);
    for (var i = 0; i < 5; i++) { a += rng.range(-0.8, 0.8); x += Math.cos(a) * len / 5; y += Math.sin(a) * len / 5; g.lineTo(q(x), q(y)); }
    g.stroke();
  }
  function tuft(g, x, y, s, col) {
    g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath();
    for (var k = -2; k <= 2; k++) { g.moveTo(q(x + k), q(y)); g.quadraticCurveTo(q(x + k * 1.6), q(y - s * 0.5), q(x + k * 2.6), q(y - s * (1 - Math.abs(k) * 0.15))); }
    g.stroke();
  }
  function puddle(g, x, y, rx, ry, rot) {
    var h = H();
    h.ell(g, x, y, rx * 1.12, ry * 1.2, 'rgba(10,14,10,0.55)', rot);
    h.ell(g, x, y, rx, ry, '#0d1512', rot);
    g.globalAlpha = 0.35; h.ell(g, x - rx * 0.25, y - ry * 0.3, rx * 0.5, ry * 0.18, '#7890a0', rot); g.globalAlpha = 1; // moonlight on the water
  }
  function bone(g, x, y, s, a) {
    var h = H(), dx = Math.cos(a) * s, dy = Math.sin(a) * s;
    h.line(g, x - dx, y - dy, x + dx, y + dy, s * 0.35, '#b8ae98');
    h.circ(g, x - dx, y - dy, s * 0.28, '#c8bea8'); h.circ(g, x + dx, y + dy, s * 0.28, '#c8bea8');
  }
  function skull(g, x, y, s) {
    var h = H();
    h.ell(g, x + s * 0.2, y + s * 0.4, s * 1.1, s * 0.4, 'rgba(0,0,0,0.4)');
    h.ell(g, x, y, s, s * 0.85, '#c4baa2'); h.ell(g, x, y + s * 0.55, s * 0.6, s * 0.35, '#b0a68e');
    h.circ(g, x - s * 0.35, y, s * 0.24, '#1a1410'); h.circ(g, x + s * 0.35, y, s * 0.24, '#1a1410');
  }
  function fissure(g, rng, x, y, len, col, lights) { // a glowing crack: a wide soft stroke under a hot thin one
    var pts = [x, y], a = rng.range(0, TAU);
    for (var i = 0; i < 7; i++) { a += rng.range(-0.7, 0.7); x += Math.cos(a) * len / 7; y += Math.sin(a) * len / 7; pts.push(x, y); }
    var draw = function (w, c, alpha) {
      g.globalAlpha = alpha; g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(q(pts[0]), q(pts[1]));
      for (var k = 2; k < pts.length; k += 2) g.lineTo(q(pts[k]), q(pts[k + 1])); g.stroke();
    };
    draw(9, col, 0.18); draw(4, col, 0.5); draw(1.6, '#fff0c0', 0.85); g.globalAlpha = 1;
    lights.push({ x: q(pts[6]), y: q(pts[7]), r: q(len * 0.7), color: col, k: 0.5 });
  }
  function slabs(g, rng, x, y, n, B) { // a patch of old flagstones
    var h = H(), s = 26;
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      if (rng.chance(0.3)) continue;
      var sx = x + i * s + rng.range(-2, 2), sy = y + j * s * 0.8 + rng.range(-2, 2);
      h.poly(g, [sx, sy, sx + s - 3, sy + rng.range(-1, 1), sx + s - 3, sy + s * 0.8 - 3, sx, sy + s * 0.8 - 3], 'rgba(0,0,0,0.35)');
      h.poly(g, [sx - 1, sy - 1, sx + s - 4, sy - 1, sx + s - 4, sy + s * 0.8 - 5, sx - 1, sy + s * 0.8 - 5], rng.chance(0.5) ? B.rock[0] : H().mix(B.rock[0], B.rock[1], 0.4));
      g.globalAlpha = 0.3; h.line(g, sx, sy, sx + s - 5, sy, 1, '#c0c0c8'); g.globalAlpha = 1;
    }
  }
  function mushroom(g, x, y, s, col, lights) {
    var h = H();
    h.line(g, x, y, x, y - s * 1.2, s * 0.35, '#d8d0b0');
    h.ell(g, x, y - s * 1.3, s * 0.9, s * 0.5, col);
    h.ell(g, x - s * 0.2, y - s * 1.45, s * 0.35, s * 0.15, '#ffffff');
    if (lights) lights.push({ x: x, y: y - s, r: 46, color: col, k: 0.35 });
  }

  // Zone-specific detail over the noise. lights collects glowing features for the light mask.
  // Over the sculpted ground (gl) only what the shader lacks is stamped: the glowing features (they feed the light
  // mask), mushrooms, roots, bones and litter; its stones, cobbles, water and ice replace pebbles, cracks and puddles.
  function stampGL(g, zone, B, rng, W, Hh, lights) {
    var h = H(), i, x, y, id = zone.id;
    if (id === 'mirewood') {
      for (i = 0; i < 500; i++) { x = rng.range(0, W); y = rng.range(0, Hh); g.globalAlpha = 0.6; h.ell(g, x, y, rng.range(1.2, 2.6), rng.range(0.7, 1.3), rng.pick(['#5a4a22', '#6a5a2a', '#3e4a1e', '#7a5a26']), rng.range(0, TAU)); }
      g.globalAlpha = 1;
      for (i = 0; i < 26; i++) mushroom(g, rng.range(0, W), rng.range(0, Hh), rng.range(2.5, 4), rng.chance(0.6) ? '#7fe0b0' : '#c8a0ff', lights);
      for (i = 0; i < 40; i++) { x = rng.range(0, W); y = rng.range(0, Hh); g.globalAlpha = 0.55; crack(g, rng, x, y, rng.range(20, 50), '#241a10', 3); }
      g.globalAlpha = 1;
    } else if (id === 'emberfen') {
      for (i = 0; i < 26; i++) fissure(g, rng, rng.range(0, W), rng.range(0, Hh), rng.range(60, 160), '#ff6a1a', lights);
      for (i = 0; i < 40; i++) bone(g, rng.range(0, W), rng.range(0, Hh), rng.range(3, 6), rng.range(0, TAU));
    } else if (id === 'frostpine') {
      for (i = 0; i < 30; i++) { x = rng.range(0, W); y = rng.range(0, Hh); if (rng.chance(0.4)) lights.push({ x: x, y: y, r: rng.range(28, 84), color: B.glow, k: 0.18 }); }
      for (i = 0; i < 400; i++) { x = rng.range(0, W); y = rng.range(0, Hh); g.globalAlpha = 0.35; h.circ(g, x, y, rng.range(0.5, 1.3), '#e8f4ff'); }
      g.globalAlpha = 1;
    } else if (id === 'blightheart') {
      for (i = 0; i < 22; i++) fissure(g, rng, rng.range(0, W), rng.range(0, Hh), rng.range(50, 140), '#9a4ad8', lights);
      for (i = 0; i < 60; i++) bone(g, rng.range(0, W), rng.range(0, Hh), rng.range(3, 7), rng.range(0, TAU));
      for (i = 0; i < 14; i++) skull(g, rng.range(0, W), rng.range(0, Hh), rng.range(4, 6));
    }
  }
  function stamp(g, zone, B, rng, W, Hh, field, lights) {
    var h = H(), i, x, y, id = zone.id;
    for (i = 0; i < 260; i++) pebble(g, rng.range(0, W), rng.range(0, Hh), rng.range(1.5, 4), B);
    for (i = 0; i < 60; i++) { g.globalAlpha = 0.35; crack(g, rng, rng.range(0, W), rng.range(0, Hh), rng.range(14, 40), 'rgba(0,0,0,0.8)', 1.2); }
    g.globalAlpha = 1;
    if (id === 'mirewood' || id === 'stormcrag' || id === 'blightheart') {
      var tc = id === 'mirewood' ? ['#3e5a22', '#56742e'] : id === 'stormcrag' ? ['#5a5638', '#787250'] : ['#3a2840', '#54385e'];
      for (i = 0; i < 900; i++) { x = rng.range(0, W); y = rng.range(0, Hh); g.globalAlpha = 0.45 + rng.next() * 0.4; tuft(g, x, y, rng.range(5, 11), tc[i % 2]); }
      g.globalAlpha = 1;
    }
    if (id === 'mirewood') {
      for (i = 0; i < 22; i++) puddle(g, rng.range(0, W), rng.range(0, Hh), rng.range(16, 46), rng.range(8, 20), rng.range(-0.4, 0.4));
      for (i = 0; i < 700; i++) { x = rng.range(0, W); y = rng.range(0, Hh); h.ell(g, x, y, rng.range(1.5, 3), rng.range(0.8, 1.5), rng.pick(['#5a4a22', '#6a5a2a', '#3e4a1e', '#7a5a26']), rng.range(0, TAU)); } // leaf litter
      for (i = 0; i < 26; i++) mushroom(g, rng.range(0, W), rng.range(0, Hh), rng.range(2.5, 4), rng.chance(0.6) ? '#7fe0b0' : '#c8a0ff', lights);
      for (i = 0; i < 40; i++) { x = rng.range(0, W); y = rng.range(0, Hh); g.globalAlpha = 0.7; crack(g, rng, x, y, rng.range(20, 50), '#2a2014', 3); } // surface roots
      g.globalAlpha = 1;
    } else if (id === 'emberfen') {
      for (i = 0; i < 26; i++) fissure(g, rng, rng.range(0, W), rng.range(0, Hh), rng.range(60, 160), '#ff6a1a', lights);
      for (i = 0; i < 160; i++) { x = rng.range(0, W); y = rng.range(0, Hh); g.globalAlpha = 0.35; h.ell(g, x, y, rng.range(10, 30), rng.range(5, 14), '#0a0606', rng.range(0, TAU)); } // scorched earth
      g.globalAlpha = 1;
      for (i = 0; i < 40; i++) bone(g, rng.range(0, W), rng.range(0, Hh), rng.range(3, 6), rng.range(0, TAU));
    } else if (id === 'frostpine') {
      for (i = 0; i < 30; i++) { // ice sheets
        x = rng.range(0, W); y = rng.range(0, Hh); var rx = rng.range(20, 60), ry = rx * rng.range(0.35, 0.6);
        h.ell(g, x, y, rx, ry, 'rgba(120,170,205,0.22)'); g.globalAlpha = 0.3; h.line(g, x - rx * 0.5, y - ry * 0.2, x + rx * 0.2, y - ry * 0.5, 2, '#e8f8ff'); g.globalAlpha = 1;
        if (rng.chance(0.4)) lights.push({ x: x, y: y, r: rx * 1.4, color: B.glow, k: 0.18 });
      }
      for (i = 0; i < 500; i++) { x = rng.range(0, W); y = rng.range(0, Hh); g.globalAlpha = 0.4; h.circ(g, x, y, rng.range(0.6, 1.6), '#e8f4ff'); } // rime glitter
      g.globalAlpha = 1;
    } else if (id === 'stormcrag') {
      for (i = 0; i < 9; i++) slabs(g, rng, rng.range(0, W - 160), rng.range(0, Hh - 120), rng.int(3, 6), B);
      for (i = 0; i < 400; i++) pebble(g, rng.range(0, W), rng.range(0, Hh), rng.range(1, 2.2), B);
    } else if (id === 'blightheart') {
      for (i = 0; i < 22; i++) fissure(g, rng, rng.range(0, W), rng.range(0, Hh), rng.range(50, 140), '#9a4ad8', lights);
      for (i = 0; i < 60; i++) bone(g, rng.range(0, W), rng.range(0, Hh), rng.range(3, 7), rng.range(0, TAU));
      for (i = 0; i < 14; i++) skull(g, rng.range(0, W), rng.range(0, Hh), rng.range(4, 6));
    }
  }

  // ---------- props on the obstacles ----------
  // A rock: a low-poly boulder. A fan of facets from a raised peak to a jittered footprint, each shaded by how far it
  // faces the key light (upper left), with grain, a cap (moss, ash, snow) on the up-facing faces and a crack.
  function rock(g, cx, cy, rx, ry, ht, B, rng) {
    var h = H(), n = 8, pts = [], px = cx - rx * rng.range(0, 0.25), py = cy - ht - ry * 0.2;
    for (var i = 0; i < n; i++) {
      var a = (i + rng.range(-0.25, 0.25)) / n * TAU, j = rng.range(0.8, 1.1), up = Math.sin(a) < 0 ? -Math.sin(a) * ht * rng.range(0.25, 0.55) : 0;
      pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j - up]);
    }
    var flat = []; pts.forEach(function (p) { flat.push(p[0], p[1]); });
    h.poly(g, flat, B.rock[1]);
    for (var k = 0; k < n; k++) {
      var a0 = pts[k], a1 = pts[(k + 1) % n], mx = (a0[0] + a1[0]) / 2 - px, my = (a0[1] + a1[1]) / 2 - py, L = Math.sqrt(mx * mx + my * my) || 1;
      var lit = Math.max(0, Math.min(1, 0.45 + 0.75 * (-(mx / L) * 0.75 - (my / L) * 0.66)));
      h.poly(g, [px, py, a0[0], a0[1], a1[0], a1[1]], h.mix(B.rock[1], B.rock[0], lit));
      if (lit > 0.7) { g.globalAlpha = (lit - 0.7) * 2; h.poly(g, [px, py, a0[0] * 0.55 + px * 0.45, a0[1] * 0.55 + py * 0.45, a1[0] * 0.55 + px * 0.45, a1[1] * 0.55 + py * 0.45], B.cap); g.globalAlpha = 1; }
      g.globalAlpha = 0.25; h.line(g, px, py, a0[0], a0[1], 1, lit > 0.5 ? '#ffffff' : '#000000'); g.globalAlpha = 1; // facet edge
    }
    g.globalAlpha = 0.6; crack(g, rng, cx + rng.range(-rx * 0.3, rx * 0.3), cy - ht * 0.3, rx * 0.7, '#0a0a0a', 1.3); g.globalAlpha = 1;
    g.save(); g.beginPath(); g.moveTo(q(flat[0]), q(flat[1])); for (var f = 2; f < flat.length; f += 2) g.lineTo(q(flat[f]), q(flat[f + 1])); g.closePath(); g.clip();
    for (var sp = 0; sp < rx * 3; sp++) { g.globalAlpha = rng.range(0.15, 0.4); h.circ(g, cx + rng.range(-rx, rx), cy - rng.range(-ry, ht + ry), rng.range(0.6, 1.4), rng.chance(0.6) ? '#000000' : '#ffffff'); }
    g.restore(); g.globalAlpha = 1;
  }
  function trunk(g, cx, base, w, ht, col, dark, rng) {
    var h = H();
    h.poly(g, [cx - w * 0.5, base, cx - w * 0.28, base - ht, cx + w * 0.28, base - ht, cx + w * 0.5, base], col);
    h.poly(g, [cx + w * 0.05, base, cx + w * 0.12, base - ht, cx + w * 0.28, base - ht, cx + w * 0.5, base], dark); // shadow side
    for (var k = 0; k < 6; k++) { var bx = cx + rng.range(-w * 0.35, w * 0.3); g.globalAlpha = 0.5; h.line(g, bx, base - rng.range(0, ht * 0.2), bx + rng.range(-3, 3), base - ht * rng.range(0.5, 0.95), 1.5, '#0a0806'); }
    g.globalAlpha = 1;
    for (var r = 0; r < 4; r++) { var s = r < 2 ? -1 : 1, rx = cx + s * w * (0.3 + 0.2 * (r % 2)); h.taper(g, cx + s * w * 0.2, base - 6, rx + s * w * 0.4, base + 2, w * 0.3, w * 0.08, col); } // root flares
  }
  function crownSprite(doc, rad, B, rng, kind) {
    var size = Math.ceil(rad * 2.4), c = canvas(doc, size, size), g = c.getContext('2d'), h = H(), cx = size / 2, cy = size / 2, cr = B.crown;
    if (kind === 'dead') {
      for (var b = 0; b < 9; b++) { var a = rng.range(0, TAU), L = rad * rng.range(0.6, 1.0); g.globalAlpha = 0.9; h.taper(g, cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L, rad * 0.12, 1.5, cr[1]);
        for (var t = 0; t < 3; t++) { var u = rng.range(0.4, 0.9), bx = cx + Math.cos(a) * L * u, by = cy + Math.sin(a) * L * u, a2 = a + rng.range(-1, 1); h.taper(g, bx, by, bx + Math.cos(a2) * L * 0.4, by + Math.sin(a2) * L * 0.4, 3, 1, cr[0]); } }
      g.globalAlpha = 1; return c;
    }
    h.circ(g, cx + rad * 0.08, cy + rad * 0.1, rad * 0.78, 'rgba(0,0,0,0.4)'); h.circ(g, cx, cy, rad * 0.74, cr[0]); // canopy mass
    for (var k = 0; k < 70; k++) { // leaf clumps, darkest first, each lit toward the upper left
      var ang = rng.range(0, TAU), d = rad * Math.sqrt(rng.next()) * 0.74, rr = rad * rng.range(0.1, 0.2), x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
      var edge = (x - cx) * -0.7 + (y - cy) * -0.7 > 0 ? 1 : 0.6; // the lit side of the crown
      h.circ(g, x + rr * 0.2, y + rr * 0.25, rr, 'rgba(0,0,0,0.3)'); h.circ(g, x, y, rr, cr[0]);
      h.circ(g, x - rr * 0.18, y - rr * 0.2, rr * 0.72, cr[1]);
      g.globalAlpha = edge; h.circ(g, x - rr * 0.32, y - rr * 0.36, rr * 0.36, cr[2]); g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-atop';
    for (var n = 0; n < 420; n++) { g.globalAlpha = rng.range(0.25, 0.6); h.ell(g, rng.range(0, size), rng.range(0, size), rng.range(1.2, 3), rng.range(0.8, 1.6), rng.chance(0.55) ? '#000000' : cr[2], rng.range(0, TAU)); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    return c;
  }
  // A canopy crown: the sculpt when the GPU baker is up, else the flat clumps. Returns { canvas, res }.
  function crownOf(doc, rad, B, rng, kind) {
    var gc = sculpted(doc) && PB.Sculpt.crownSprite(rad, B, function () { return rng.next(); }, kind);
    return gc || { canvas: crownSprite(doc, rad, B, rng, kind), res: 1 };
  }
  // Each prop: sprite canvas, anchor (ax, ay) = the obstacle centre inside it, and optional crown, lights, ground marks.
  function sculpted(doc) { return !!(PB.Sculpt && typeof document !== 'undefined' && doc === document && PB.Sculpt.ready()); }
  function propSprite(doc, kind, o, B, rng, lights) {
    var gp = sculpted(doc) && PB.Sculpt.propSprite(kind, o, B, function () { return rng.next(); });
    if (gp) { // level 9: the 3D sculpt; the same glow lights and tree crowns as the flat props
      var rr = o.r;
      if (kind === 'basalt') lights.push({ x: o.x, y: o.y - rr * 0.5, r: rr * 1.6, color: B.glow, k: 0.35 });
      else if (kind === 'charred') lights.push({ x: o.x, y: o.y - rr, r: rr * 1.1, color: B.glow, k: 0.22 });
      else if (kind === 'obelisk') lights.push({ x: o.x, y: o.y - rr * 1.5, r: rr * 1.5, color: B.glow, k: 0.4 });
      else if (kind === 'tree') { var cs = crownOf(doc, rr * 1.7, B, rng, 'leafy'); gp.crown = { canvas: cs.canvas, res: cs.res, x: o.x + rr * 0.1, y: o.y - rr * 1.8, r: rr * 1.7 }; }
      return gp;
    }
    var h = H(), r = o.r, tall = kind === 'pine' ? 3.6 : kind === 'obelisk' ? 3.0 : kind === 'crag' ? 2.4 : kind === 'pillar' ? 2.2 : kind === 'tree' ? 1.9 : kind === 'charred' || kind === 'deadtree' ? 2.6 : kind === 'basalt' ? 2.2 : 1.2; // basalt columns roll up to 2 r tall
    var w = Math.ceil(r * 2.6), hh = Math.ceil(r * (tall + 1.3)), c = canvas(doc, w, hh), g = c.getContext('2d'), ax = w / 2, ay = hh - r * 0.75, out = { canvas: c, ax: ax, ay: ay, tall: tall > 1.5 };
    h.ell(g, ax + r * 0.15, ay + r * 0.12, r * 1.1, r * 0.5, 'rgba(0,0,0,0.45)'); // contact shadow
    if (kind === 'boulder') {
      rock(g, ax - r * 0.25, ay, r * 0.8, r * 0.5, r * 0.75, B, rng);
      rock(g, ax + r * 0.45, ay + r * 0.2, r * 0.5, r * 0.32, r * 0.4, B, rng);
    } else if (kind === 'basalt') {
      for (var b = 0; b < 4; b++) { // hexagonal columns of cooled lava
        var bx = ax + (b - 1.5) * r * 0.42, bh = r * rng.range(0.9, 2.0), bw = r * 0.42, top = ay - bh + (b % 2) * r * 0.15;
        h.poly(g, [bx - bw / 2, ay + (b % 2) * r * 0.15, bx - bw / 2, top, bx, top - bw * 0.2, bx + bw / 2, top, bx + bw / 2, ay + (b % 2) * r * 0.15], B.rock[1]);
        h.poly(g, [bx - bw / 2, top, bx, top - bw * 0.2, bx + bw / 2, top, bx, top + bw * 0.2], B.rock[0]);
        h.poly(g, [bx - bw / 2, ay + (b % 2) * r * 0.15, bx - bw / 2, top, bx - bw * 0.1, top + bw * 0.1, bx - bw * 0.1, ay], h.mix(B.rock[0], B.rock[1], 0.45));
        g.globalAlpha = 0.9; h.line(g, bx + bw * 0.1, top + bh * 0.3, bx - bw * 0.05, top + bh * 0.7, 1.6, '#ff8a3a'); g.globalAlpha = 1;
      }
      lights.push({ x: o.x, y: o.y - r * 0.5, r: r * 1.6, color: B.glow, k: 0.35 });
    } else if (kind === 'tree' || kind === 'charred' || kind === 'deadtree') {
      var col = kind === 'tree' ? '#3a2e20' : kind === 'charred' ? '#1a1412' : '#2a2030', dark = kind === 'tree' ? '#1e160e' : '#0a0808', base = ay + r * 0.1;
      trunk(g, ax, base, r * 0.75, r * tall * 0.85, col, dark, rng);
      if (kind !== 'tree') { // bare twisting branches
        for (var k = 0; k < 6; k++) {
          var sx = ax + rng.range(-r * 0.15, r * 0.15), sy = base - r * tall * rng.range(0.55, 0.85), a = -Math.PI / 2 + rng.range(-1.1, 1.1), L = r * rng.range(0.6, 1.1);
          h.taper(g, sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L, r * 0.14, 2, col);
          h.taper(g, sx + Math.cos(a) * L * 0.6, sy + Math.sin(a) * L * 0.6, sx + Math.cos(a + 0.6) * L * 1.0, sy + Math.sin(a + 0.6) * L * 0.9, r * 0.07, 1.2, col);
        }
        if (kind === 'charred') { for (var e = 0; e < 4; e++) h.circ(g, ax + rng.range(-r * 0.25, r * 0.25), base - rng.range(r * 0.2, r * 1.4), 1.6, '#ff9a40'); lights.push({ x: o.x, y: o.y - r, r: r * 1.1, color: B.glow, k: 0.22 }); }
      } else out.crown = { canvas: crownSprite(doc, r * 1.7, B, rng), x: o.x + r * 0.1, y: o.y - r * tall * 0.95, r: r * 1.7 };
    } else if (kind === 'pine') {
      trunk(g, ax, ay + r * 0.1, r * 0.35, r * 0.9, '#3a2a1e', '#1a120c', rng);
      for (var t = 0; t < 5; t++) { // stacked tiers, snow on each upper edge
        var tw = r * (1.25 - t * 0.2), ty = ay - r * (0.5 + t * 0.62), th = r * 0.95;
        h.poly(g, [ax - tw, ty, ax, ty - th, ax + tw, ty], B.crown[0]);
        h.poly(g, [ax, ty - th, ax + tw, ty, ax + tw * 0.2, ty - th * 0.1], B.crown[1]);
        h.poly(g, [ax - tw, ty, ax - tw * 0.55, ty - th * 0.35, ax - tw * 0.1, ty - th * 0.6, ax, ty - th, ax - tw * 0.05, ty - th * 0.75, ax - tw * 0.5, ty - th * 0.1], B.crown[2]);
      }
    } else if (kind === 'crag' || kind === 'obelisk' || kind === 'pillar') {
      var top = ay - r * tall;
      if (kind === 'crag') {
        h.poly(g, [ax - r * 0.95, ay, ax - r * 0.55, ay - r * tall * 0.55, ax - r * 0.2, top, ax + r * 0.15, ay - r * tall * 0.7, ax + r * 0.5, ay - r * tall * 0.45, ax + r * 0.95, ay], B.rock[1]);
        h.poly(g, [ax - r * 0.95, ay, ax - r * 0.55, ay - r * tall * 0.55, ax - r * 0.2, top, ax - r * 0.1, ay - r * 0.3], B.rock[0]); // lit face
        h.poly(g, [ax - r * 0.2, top, ax + r * 0.15, ay - r * tall * 0.7, ax + r * 0.05, ay - r * tall * 0.4], h.mix(B.rock[0], '#ffffff', 0.15));
        g.globalAlpha = 0.6; crack(g, rng, ax - r * 0.3, ay - r * tall * 0.5, r, '#0a0a0e', 1.5); g.globalAlpha = 1;
      } else if (kind === 'obelisk') {
        h.poly(g, [ax - r * 0.45, ay, ax - r * 0.3, top + r * 0.4, ax, top, ax + r * 0.3, top + r * 0.4, ax + r * 0.45, ay], B.rock[1]);
        h.poly(g, [ax - r * 0.45, ay, ax - r * 0.3, top + r * 0.4, ax, top, ax - r * 0.02, ay], B.rock[0]);
        for (var g2 = 0; g2 < 4; g2++) { var gy = top + r * (0.8 + g2 * 0.5); g.globalAlpha = 0.95; h.line(g, ax - r * 0.12, gy, ax + r * 0.1, gy + r * 0.18, 2, B.glow); h.line(g, ax + r * 0.1, gy, ax - r * 0.05, gy + r * 0.25, 2, B.glow); }
        g.globalAlpha = 1; lights.push({ x: o.x, y: o.y - r * tall * 0.5, r: r * 1.5, color: B.glow, k: 0.4 });
      } else {
        var broke = top + r * rng.range(0.2, 0.8);
        h.poly(g, [ax - r * 0.42, ay, ax - r * 0.38, broke + r * 0.1, ax - r * 0.1, broke - r * 0.15, ax + r * 0.15, broke + r * 0.12, ax + r * 0.38, broke, ax + r * 0.42, ay], B.rock[1]);
        h.poly(g, [ax - r * 0.42, ay, ax - r * 0.38, broke + r * 0.1, ax - r * 0.1, broke - r * 0.15, ax - r * 0.08, ay], B.rock[0]);
        for (var fl = 0; fl < 4; fl++) { g.globalAlpha = 0.4; h.line(g, ax - r * 0.3 + fl * r * 0.2, ay - 4, ax - r * 0.28 + fl * r * 0.2, broke + r * 0.15, 1.5, '#0a0a0e'); }
        g.globalAlpha = 1;
        h.poly(g, [ax - r * 0.6, ay + 2, ax - r * 0.55, ay - r * 0.12, ax + r * 0.6, ay - r * 0.12, ax + r * 0.65, ay + 2], h.mix(B.rock[0], B.rock[1], 0.4)); // plinth
        for (var rb = 0; rb < 3; rb++) rock(g, ax + rng.range(-r * 0.9, r * 0.9), ay + r * rng.range(0.1, 0.4), r * 0.2, r * 0.12, r * 0.15, B, rng);
      }
    }
    return out;
  }

  function bakeGround(zone, seed, obstacles, doc) {
    doc = doc || document;
    var W = PB.World ? PB.World.WIDTH : 2400, Hh = PB.World ? PB.World.HEIGHT : 1600, B = biome(zone), rng = new PB.Rng(PB.deriveSeed(seed >>> 0, 'ground:' + zone.id));
    var c = canvas(doc, W, Hh), g = c.getContext('2d'), lights = [], props = [], torches = [];
    g.fillStyle = B.mid; g.fillRect(0, 0, W, Hh);
    var zi = ['mirewood', 'emberfen', 'frostpine', 'stormcrag', 'blightheart'].indexOf(zone.id);
    var gpu = sculpted(doc) && PB.Sculpt.ground(g, Math.max(0, zi), B, PB.deriveSeed(seed >>> 0, 'relief:' + zone.id), W, Hh);
    if (gpu) stampGL(g, zone, B, rng, W, Hh, lights);
    else stamp(g, zone, B, rng, W, Hh, noiseGround(doc, g, B, PB.deriveSeed(seed >>> 0, 'relief:' + zone.id), W, Hh), lights);
    (obstacles || []).forEach(function (o, i) {
      var kind = B.props[i % B.props.length], p = propSprite(doc, kind, o, B, rng, lights);
      p.x = o.x; p.y = o.y; p.r = o.r; p.prop = kind; props.push(p);
      g.globalAlpha = 0.5; H().ell(g, o.x + o.r * 0.2, o.y + o.r * 0.25, o.r * 1.35, o.r * 0.75, 'rgba(0,0,0,0.6)'); g.globalAlpha = 1; // ambient occlusion
    });
    // Braziers beside a few props: fire light the field can be read by.
    for (var t = 0; t < (obstacles || []).length && torches.length < 4; t += 3) {
      var o = obstacles[t], a = rng.range(0, TAU);
      torches.push({ x: q(o.x + Math.cos(a) * (o.r + 26)), y: q(o.y + Math.abs(Math.sin(a)) * (o.r + 22)), phase: rng.next() * TAU });
    }
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 10; g.strokeRect(0, 0, W, Hh);
    // Canopy crowns along the edges, drawn by render.js above the bodies (they fade when the druid walks under).
    var canopy = [];
    for (var i = 0; i < 18; i++) {
      var side = i % 4, u = rng.range(0.05, 0.95), x, y;
      x = side === 0 ? u * W : side === 1 ? W - rng.range(0, 60) : side === 2 ? u * W : rng.range(0, 60);
      y = side === 0 ? rng.range(0, 60) : side === 1 ? u * Hh : side === 2 ? Hh - rng.range(0, 60) : u * Hh;
      var rad = q(rng.range(80, 140));
      var cw = crownOf(doc, rad, B, rng, zone.id === 'emberfen' || zone.id === 'blightheart' ? 'dead' : 'leafy');
      canopy.push({ x: q(x), y: q(y), r: rad, seed: i, canvas: cw.canvas, res: cw.res });
    }
    props.forEach(function (p) { if (p.crown) canopy.push({ x: q(p.crown.x), y: q(p.crown.y), r: q(p.crown.r), seed: canopy.length, canvas: p.crown.canvas, res: p.crown.res || 1 }); });
    c.canopy = canopy; c.props = props; c.lights = lights; c.torches = torches; c.biome = B; c.sculpted = !!gpu;
    return c;
  }

  // A 128 px tile of soil grain (light and dark specks, translucent), laid over every chunk at full resolution.
  function grainTile(doc, rng, B) {
    var c = canvas(doc, 128, 128), g = c.getContext('2d');
    for (var i = 0; i < 1500; i++) {
      var dark = rng.next() < 0.55; g.fillStyle = dark ? 'rgba(0,0,0,0.16)' : 'rgba(255,240,210,0.07)';
      g.fillRect(floor(rng.next() * 128), floor(rng.next() * 128), 1 + floor(rng.next() * 2), 1);
    }
    return c;
  }

  // Bake once, split into bounded offscreen tiles; release the temporary full-world bitmap.
  function bakeChunks(zone, seed, obstacles, doc) {
    var full = bakeGround(zone, seed, obstacles, doc), tiles = [], size = 512, B = full.biome;
    var rng = new PB.Rng(PB.deriveSeed(seed, 'detail:' + zone.id)), tufts = [], tile = grainTile(doc, rng, B);
    for (var y = 0; y < full.height; y += size) for (var x = 0; x < full.width; x += size) {
      var c = canvas(doc, Math.min(size, full.width - x), Math.min(size, full.height - y)), g = c.getContext('2d');
      g.drawImage(full, x, y, c.width, c.height, 0, 0, c.width, c.height);
      for (var ty = 0; ty < c.height; ty += 128) for (var tx = 0; tx < c.width; tx += 128) g.drawImage(tile, tx, ty); // soil grain at full resolution
      for (var i = 0; i < 1400; i++) { // and scattered specks
        g.fillStyle = i % 3 ? B.high : B.low; g.globalAlpha = 0.1 + rng.next() * 0.14;
        g.fillRect(rng.next() * c.width, rng.next() * c.height, 1 + rng.next() * 2, 1);
      }
      g.globalAlpha = 1;
      tiles.push({ x: x, y: y, canvas: c });
    }
    var grass = zone.id === 'mirewood' || zone.id === 'stormcrag' || zone.id === 'blightheart';
    for (var t = 0; t < (grass ? 420 : 0); t++) tufts.push({ x: rng.next() * full.width, y: rng.next() * full.height, h: 6 + rng.next() * 9, phase: rng.next() * TAU });
    var result = { tiles: tiles, canopy: full.canopy, tufts: tufts, props: full.props, lights: full.lights, torches: full.torches, biome: B, sculpted: full.sculpted };
    full.width = full.height = 1;
    return result;
  }

  PB.Terrain = { BIOME: BIOME, biome: biome, bakeGround: bakeGround, bakeChunks: bakeChunks, fbm: fbm, vnoise: vnoise, field: field };
})(globalThis.PB = globalThis.PB || {});
