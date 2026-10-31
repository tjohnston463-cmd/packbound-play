// 3D sculpts for the sprite baker (sculpt.js): every creature family and terrain prop as a list of signed-distance
// primitives (ellipsoids, round cones, hex prisms, boxes, tori) smooth-blended together, plus colour-only "paint"
// shapes and emissive glow points. Units are body radii (r = 1): x forward (the sprite faces +x), y up, z toward the
// camera. Feet stand near y = -1. Rigs are posed per run phase ph (0..1, looping) and are pure data, so node tests
// them; the GPU work lives in sculpt.js. Nothing here reads the sim.
(function (PB) {
  'use strict';
  var TAU = Math.PI * 2, sin = Math.sin, cos = Math.cos, max = Math.max, min = Math.min;
  // Materials (the shader's ids): how a surface is displaced, coloured and lit.
  var M = { FUR: 0, SKIN: 1, EYE: 2, HORN: 3, CLOTH: 4, BARK: 5, LEAF: 6, STONE: 7, GLOW: 8, FEATHER: 9, WET: 10, ICE: 11, METAL: 12, GHOST: 13, FLAME: 14, VOID: 15 };
  var FL_BACK = Math.atan2(-0.25, -1), FL_DOWN = -Math.PI / 2, FL_UP = Math.PI / 2, FL_FWD = 0, FL_REAR = Math.PI;

  // sRGB hex to linear, scaled first in sRGB (k < 1 darkens the way a painter would mix toward black).
  function lin(hex, k) {
    var n = parseInt(hex.slice(1), 16), s = k == null ? 1 : k;
    return [Math.pow(((n >> 16) & 255) / 255 * s, 2.2), Math.pow(((n >> 8) & 255) / 255 * s, 2.2), Math.pow((n & 255) / 255 * s, 2.2)];
  }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function scalec(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function v3(x, y, z) { return [x, y, z || 0]; }
  // Inverse rotation (the shader moves points into the primitive's frame) for Euler angles applied z, then x, then y.
  function quatInv(r) {
    var hx = r[0] / 2, hy = r[1] / 2, hz = r[2] / 2;
    var qx = [sin(hx), 0, 0, cos(hx)], qy = [0, sin(hy), 0, cos(hy)], qz = [0, 0, sin(hz), cos(hz)];
    function mul(a, b) {
      return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
              a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    }
    var q = mul(qy, mul(qx, qz));
    return [-q[0], -q[1], -q[2], q[3]];
  }

  // ---------- the builder ----------
  // A rig: s (shape primitives, blended in order), p (paints), glows (emissive halos drawn in 2D), and flags.
  // T: the current placement (offset o, uniform scale s), so one rig can be stamped small (a Murder's extra birds).
  function rig() { return { s: [], p: [], glows: [], hairs: false, alpha: 1, luminous: false, T: { o: [0, 0, 0], s: 1 }, at: {} }; }
  function tp(b, p) { return [b.T.o[0] + p[0] * b.T.s, b.T.o[1] + p[1] * b.T.s, b.T.o[2] + p[2] * b.T.s]; }
  function put(b, list, t, a, bb, r1, r2, o) {
    o = o || {};
    var s = b.T.s, fl = o.fl == null ? FL_BACK : o.fl, sc = t === 1 ? tp(b, bb) : t === 2 ? [bb[0] * s, bb[1] * s, bb[2] * s] : [bb[0] * s, bb[1] * s, bb[2] * s];
    list.push({ t: t, op: o.op === 'sub' ? 1 : 0, a: tp(b, a), b: sc, r1: (r1 || 0) * (t === 4 || t === 1 || t === 3 ? s : 1), r2: (r2 || 0) * (t === 1 || t === 4 ? s : 1),
                k: (o.k == null ? 0.02 : o.k) * s, m: o.m == null ? M.FUR : o.m, f: o.f || 0, c: o.c || [0.2, 0.2, 0.2],
                fx: cos(fl), fy: sin(fl), q: o.rot ? quatInv(o.rot) : [0, 0, 0, 1], w: o.w == null ? 1 : o.w });
  }
  function ell(b, c, rad, o) { put(b, b.s, 0, c, rad, 0, 0, o); }
  function cone(b, a, c, r1, r2, o) { put(b, b.s, 1, a, c, r1, r2, o); }
  function hex(b, c, rad, hh, round, o) { put(b, b.s, 2, c, [rad, hh, round || 0], 0, 0, o); }
  function box(b, c, half, round, o) { put(b, b.s, 3, c, half, round || 0, 0, o); }
  function torus(b, c, R, r, o) { put(b, b.s, 4, c, [0, 0, 0], R, r, o); }
  function sph(b, c, r, o) { put(b, b.s, 0, c, [r, r, r], 0, 0, o); }
  // Colour-only shapes: inside them (softened by k) the surface takes col with strength w; m >= 0 also sets the material.
  function paint(b, c, rad, col, k, w, rot) { b.p.push({ t: 0, op: 2, a: tp(b, c), b: scalec(rad, b.T.s), r1: 0, r2: 0, k: (k || 0.08) * b.T.s, m: -1, f: 0, c: col, fx: 1, fy: 0, q: rot ? quatInv(rot) : [0, 0, 0, 1], w: w == null ? 1 : w }); }
  function paintCone(b, a, c, r1, r2, col, k, w) { b.p.push({ t: 1, op: 2, a: tp(b, a), b: tp(b, c), r1: r1 * b.T.s, r2: r2 * b.T.s, k: (k || 0.08) * b.T.s, m: -1, f: 0, c: col, fx: 1, fy: 0, q: [0, 0, 0, 1], w: w == null ? 1 : w }); }
  function glow(b, c, r, col, a) { b.glows.push({ p: tp(b, c), r: r * b.T.s, c: col, a: a == null ? 0.5 : a }); }
  // A chain of round cones through points (radii interpolate from r1 to r2).
  function chain(b, pts, r1, r2, o) {
    for (var i = 0; i < pts.length - 1; i++) {
      var u0 = i / (pts.length - 1), u1 = (i + 1) / (pts.length - 1);
      cone(b, pts[i], pts[i + 1], r1 + (r2 - r1) * u0, r1 + (r2 - r1) * u1, o);
    }
  }
  function bez(p0, p1, p2, p3, u) {
    var a = (1 - u) * (1 - u) * (1 - u), bb = 3 * (1 - u) * (1 - u) * u, c = 3 * (1 - u) * u * u, d = u * u * u;
    return [p0[0] * a + p1[0] * bb + p2[0] * c + p3[0] * d, p0[1] * a + p1[1] * bb + p2[1] * c + p3[1] * d, p0[2] * a + p1[2] * bb + p2[2] * c + p3[2] * d];
  }
  // Two-bone leg (the mockup's): the shin folds back while the foot is in the air; bend tips the thigh forward and the
  // shin back (hind legs). Adds thigh, shin and foot; returns the foot.
  function leg(b, hip, ph, swing, bend, L1, L2, r1, r2, r3, fold, o) {
    var s = sin(TAU * ph), lift = max(0, cos(TAU * ph)), a1 = s * swing + bend, a2 = a1 - bend * 2.4 - lift * fold;
    var kn = [hip[0] + L1 * sin(a1), hip[1] - L1 * cos(a1), hip[2]], ft = [kn[0] + L2 * sin(a2), kn[1] - L2 * cos(a2), kn[2]];
    var oo = Object.assign({ fl: FL_DOWN }, o);
    cone(b, hip, kn, r1, r2, Object.assign({}, oo, { k: o.k == null ? 0.08 : o.k }));
    cone(b, kn, ft, r2, r3, Object.assign({}, oo, { k: 0.05 }));
    return ft;
  }
  function foot(b, ft, rad, o) { ell(b, add(ft, [rad[0] * 0.5, 0, 0]), rad, Object.assign({ k: 0.03, fl: FL_DOWN }, o)); }
  // A bird or bat wing on side s (+1 near, -1 far) at shoulder S: the covert panel and a fan of flight feathers, all
  // tilted about the body axis by th. len scales the span; col, tip: panel and feather colours.
  function wing(b, S, s, th, len, col, tip, mat, bat, lite) {
    var ca = cos(th), sa = sin(th), m = mat == null ? M.FEATHER : mat;
    function W(x, z) { return add(S, [x * len, z * sa * len, z * s * ca * len]); }
    ell(b, W(-0.12, 0.42), [0.36 * len, 0.05 * len, 0.42 * len], { m: m, c: col, k: 0.06 * len, rot: [-s * th, -s * 0.15, 0], fl: FL_REAR, f: 0.2 });
    var wr = W(-0.05, 0.82);
    for (var i = 0; i < 6; i += lite ? 3 : 1) {
      var a = -0.15 - i * 0.24, L2 = (bat ? 0.62 : 0.72 - i * 0.05);
      var tp2 = W(-0.05 + Math.sin(a) * L2, 0.82 + Math.cos(a) * L2 * 0.85);
      if (bat) cone(b, wr, tp2, 0.035 * len, 0.012 * len, { m: M.HORN, c: tip, k: 0.02 * len });
      else cone(b, wr, tp2, 0.075 * len, 0.02 * len, { m: m, c: i < 2 ? tip : mixc(col, tip, 0.5), k: 0.03 * len, fl: FL_REAR });
    }
    if (bat) ell(b, W(-0.35, 0.95), [0.5 * len, 0.025 * len, 0.45 * len], { m: M.SKIN, c: col, k: 0.05 * len, rot: [-s * th, -s * 0.5, 0] });
    else if (!lite) for (var j = 0; j < 4; j++) cone(b, W(-0.15 - j * 0.1, 0.25 + j * 0.15), W(-0.5 - j * 0.08, 0.2 + j * 0.17), 0.07 * len, 0.025 * len, { m: m, c: mixc(col, tip, 0.3), k: 0.04 * len, fl: FL_REAR });
  }
  // Eyes: the pack's dark glossy eyes, or an enemy's glowing ones (with a halo).
  function eyes(b, C, pts, r) {
    for (var i = 0; i < pts.length; i++) {
      if (C.eye) { sph(b, pts[i], r, { m: M.GLOW, c: C.eye, k: 0.004 }); glow(b, pts[i], r * 3.2, C.eyeHex, 0.55); }
      else sph(b, pts[i], r, { m: M.EYE, c: [0.012, 0.01, 0.01], k: 0.004 });
    }
  }

  // ---------- creature families ----------
  var FAM = {};

  FAM.wolf = function (b, ph, C, o) {
    var L = sin(TAU * ph * 2) * 0.04 + 0.12, br = sin(TAU * ph * 2 + 0.5) * 0.01, hy = sin(TAU * ph * 2 + 1.2) * 0.015;
    var flick = max(0, sin(TAU * ph)) * 0.04, sw = sin(TAU * ph + 0.6), bk = o.bulk || 1;
    function P(x, y, z) { return [x, y + L, z || 0]; }
    function Hd(x, y, z) { return [x, y + L + hy, z || 0]; }
    var base = C.base, mat = o.mat == null ? M.FUR : o.mat, F = function (f, fl, k, c) { return { c: c || base, f: f, fl: fl == null ? FL_BACK : fl, k: k == null ? 0.02 : k, m: mat }; };
    b.hairs = mat === M.FUR;
    ell(b, P(0.42, 0.08), [0.5 * bk, 0.44 * bk + br, 0.3 * bk + br], F(0.35));
    ell(b, P(-0.15, 0.14), [0.52, 0.25 * bk, 0.22 * bk], F(0.4, null, 0.25));
    ell(b, P(-0.66, 0.15), [0.37, 0.34, 0.26 * bk], F(0.3, null, 0.22));
    cone(b, P(0.6, 0.22), P(0.95, 0.55), 0.31 * bk, 0.24 * bk, F(1.6, FL_BACK, 0.15));
    ell(b, Hd(1.07, 0.63), [0.3, 0.26, 0.24], F(0.25, FL_REAR, 0.08));
    cone(b, Hd(1.22, 0.57), Hd(1.74, 0.47), 0.15, 0.065, F(0.0, FL_REAR, 0.1));
    cone(b, Hd(1.18, 0.47), Hd(1.58, 0.41), 0.095, 0.045, F(0.0, FL_REAR, 0.05));
    ell(b, Hd(1.04, 0.58, 0.16), [0.17, 0.15, 0.1], F(0.6, FL_REAR, 0.08));
    ell(b, Hd(1.04, 0.58, -0.16), [0.17, 0.15, 0.1], F(0.6, FL_REAR, 0.08));
    for (var s = -1; s <= 1; s += 2) {
      cone(b, Hd(0.99, 0.78, 0.11 * s), Hd(0.92 - flick, 1.17, 0.16 * s), 0.12, 0.016, F(0.0, FL_UP, 0.03));
      ell(b, Hd(1.05, 0.9, 0.15 * s), [0.04, 0.13, 0.05], { op: 'sub', k: 0.01, c: lin('#5a3a34'), m: M.SKIN });
    }
    var t1 = P(-0.92, 0.32), t2 = P(-1.24, 0.08 + sw * 0.03, sw * 0.06), t3 = P(-1.46, -0.34 + sw * 0.05, sw * 0.14);
    cone(b, t1, t2, 0.1, 0.2, F(1.3, Math.atan2(-0.6, -0.8), 0.1));
    cone(b, t2, t3, 0.2, 0.08, F(1.3, Math.atan2(-0.9, -0.4), 0.06));
    var legs = [[P(0.5, -0.06, 0.16), ph, 0, 0.52, 0.52, 0.155, 0.08, 1.3], [P(0.5, -0.06, -0.16), ph + 0.5, 0, 0.52, 0.52, 0.155, 0.08, 1.3],
                [P(-0.66, 0, 0.16), ph + 0.5, 0.38, 0.5, 0.58, 0.2, 0.09, 0.5], [P(-0.66, 0, -0.16), ph, 0.38, 0.5, 0.58, 0.2, 0.09, 0.5]];
    for (var i = 0; i < 4; i++) {
      var l = legs[i], ft = leg(b, l[0], l[1], 0.5, l[2], l[3] * (o.legs || 1), l[4] * (o.legs || 1), l[5] * bk, l[6] * bk, 0.06 * bk, l[7], F(0.15, FL_DOWN));
      foot(b, ft, [0.1 * bk, 0.055, 0.075 * bk], F(0.0, FL_DOWN));
    }
    sph(b, Hd(1.735, 0.5), 0.058, { m: M.SKIN, c: [0.012, 0.012, 0.012], k: 0.004 });
    eyes(b, C, [Hd(1.28, 0.665, 0.13), Hd(1.28, 0.665, -0.13)], 0.038);
    // the coat: dark saddle, pale under and chest, a pale lower muzzle, dark ear tips and tail tip, tan legs
    var dark = C.dark, pale = C.pale, tan = mixc(base, pale, 0.45);
    paint(b, P(-0.2, 0.52), [0.95, 0.3, 0.5], dark, 0.14, 0.95);
    paint(b, P(0.55, 0.72), [0.3, 0.2, 0.32], dark, 0.12, 0.7);
    paint(b, P(-0.05, -0.36), [0.7, 0.14, 0.24], pale, 0.1, 0.8);
    paint(b, P(0.86, 0.04), [0.22, 0.32, 0.3], pale, 0.1, 0.85);
    paintCone(b, Hd(1.2, 0.44), Hd(1.72, 0.39), 0.11, 0.055, pale, 0.05, 0.85);
    paint(b, Hd(1.06, 0.55, 0.17), [0.1, 0.08, 0.07], pale, 0.05, 0.8);
    paint(b, Hd(1.06, 0.55, -0.17), [0.1, 0.08, 0.07], pale, 0.05, 0.8);
    paint(b, Hd(1.32, 0.63), [0.24, 0.06, 0.08], dark, 0.05, 0.6);
    paint(b, Hd(0.96, 0.84), [0.1, 0.1, 0.06], dark, 0.06, 0.6);
    paint(b, Hd(0.93, 1.1, 0.16), [0.09, 0.1, 0.09], dark, 0.05, 1);
    paint(b, Hd(0.93, 1.1, -0.16), [0.09, 0.1, 0.09], dark, 0.05, 1);
    paint(b, t3, [0.18, 0.2, 0.18], scalec(dark, 0.7), 0.08, 1);
    paint(b, P(0, -0.85), [1.6, 0.26, 0.7], tan, 0.12, 0.45);
    paint(b, Hd(1.0, 0.75), [0.18, 0.12, 0.3], dark, 0.08, 0.55);
    paint(b, Hd(1.12, 0.57), [0.14, 0.05, 0.3], tan, 0.04, 0.4);
    b.at = { head: Hd(1.07, 0.92), crown: Hd(1.0, 1.0), back: [P(0.5, 0.62), P(0.1, 0.55), P(-0.3, 0.52), P(-0.65, 0.5)], body: P(-0.1, 0.2), bodyR: 0.55, snout: Hd(1.74, 0.5) };
  };

  FAM.bear = function (b, ph, C, o) {
    var L = sin(TAU * ph * 2) * 0.035, br = sin(TAU * ph * 2 + 0.5) * 0.012, nod = sin(TAU * (ph * 2 + 0.25)) * 0.045;
    function P(x, y, z) { return [x, y + L, z || 0]; }
    function Hd(x, y, z) { return [x, y + L + nod, z || 0]; }
    var base = C.base, mat = o.mat == null ? M.FUR : o.mat, hm = o.headMat == null ? mat : o.headMat;
    var F = function (f, fl, k, m) { return { c: base, f: f, fl: fl == null ? FL_BACK : fl, k: k == null ? 0.02 : k, m: m == null ? mat : m }; };
    b.hairs = mat === M.FUR;
    ell(b, P(0.32, 0.12), [0.62, 0.56 + br, 0.47 + br], F(0.5));
    ell(b, P(0.2, 0.5), [0.46, 0.34, 0.37], F(0.8, null, 0.3));
    ell(b, P(-0.28, 0.08), [0.6, 0.52, 0.46], F(0.4, null, 0.3));
    ell(b, P(-0.7, 0.16), [0.45, 0.48, 0.42], F(0.4, null, 0.28));
    cone(b, Hd(0.62, 0.3), Hd(0.98, 0.22), 0.38, 0.3, F(0.9, FL_BACK, 0.12, hm));
    ell(b, Hd(1.1, 0.22), [0.35, 0.31, 0.31], F(0.2, FL_REAR, 0.12, hm));
    cone(b, Hd(1.25, 0.14), Hd(1.6, 0.05), 0.2, 0.135, F(0.0, FL_REAR, 0.1, hm));
    ell(b, Hd(1.12, 0.36, 0.24), [0.08, 0.06, 0.08], F(0.3, FL_REAR, 0.06, hm));
    ell(b, Hd(1.12, 0.36, -0.24), [0.08, 0.06, 0.08], F(0.3, FL_REAR, 0.06, hm));
    for (var s = -1; s <= 1; s += 2) {
      if (o.tufts) cone(b, Hd(0.98, 0.5, 0.2 * s), Hd(0.9, 0.78, 0.26 * s), 0.08, 0.015, F(0.2, FL_UP, 0.04, hm));
      else {
        ell(b, Hd(0.98, 0.5, 0.2 * s), [0.06, 0.11, 0.1], F(0.2, FL_UP, 0.05, hm));
        ell(b, Hd(1.03, 0.52, 0.21 * s), [0.03, 0.07, 0.06], { op: 'sub', k: 0.01, c: scalec(C.dark, 0.6), m: M.SKIN });
      }
    }
    sph(b, P(-1.12, 0.32), 0.09, F(0.6, FL_BACK, 0.08));
    var legs = [[P(0.5, -0.08, 0.27), ph, 0, 0.45, 0.43, 0.25, 0.19, 0.9, true], [P(0.5, -0.08, -0.27), ph + 0.5, 0, 0.45, 0.43, 0.25, 0.19, 0.9, true],
                [P(-0.72, -0.02, 0.27), ph + 0.5, 0.2, 0.47, 0.44, 0.3, 0.2, 0.5, false], [P(-0.72, -0.02, -0.27), ph, 0.2, 0.47, 0.44, 0.3, 0.2, 0.5, false]];
    for (var i = 0; i < 4; i++) {
      var l = legs[i], ft = leg(b, l[0], l[1], 0.38, l[2], l[3], l[4], l[5], l[6], 0.16, l[7], F(0.3, FL_DOWN, 0.1));
      ell(b, add(ft, [0.06, 0.02, 0]), [0.19, 0.09, 0.15], F(0.1, FL_DOWN, 0.05));
      if (l[8]) for (var c = 0; c < 3; c++) { var z = (c - 1) * 0.075; cone(b, add(ft, [0.2, 0, z]), add(ft, [0.29, -0.06, z * 1.1]), 0.022, 0.006, { m: M.HORN, c: lin('#dbcdb0'), k: 0.004 }); }
    }
    ell(b, Hd(1.68, 0.08), [0.07, 0.06, 0.09], { m: M.SKIN, c: [0.012, 0.012, 0.014], k: 0.004 });
    eyes(b, C, [Hd(1.3, 0.32, 0.21), Hd(1.3, 0.32, -0.21)], 0.04);
    paint(b, P(0.25, 0.86), [0.7, 0.3, 0.6], C.pale, 0.14, 0.8);
    paint(b, Hd(1.62, 0.07), [0.2, 0.17, 0.2], C.dark, 0.06, 0.75);
    paint(b, P(0, -1.1), [1.6, 0.36, 0.7], C.dark, 0.15, 0.45);
    paint(b, P(0.0, -0.35), [0.9, 0.2, 0.42], C.dark, 0.15, 0.3);
    b.at = { head: Hd(1.05, 0.55), crown: Hd(1.0, 0.62), back: [P(0.3, 0.85), P(-0.1, 0.72), P(-0.5, 0.62)], body: P(0, 0.2), bodyR: 0.8, snout: Hd(1.68, 0.1) };
  };

  FAM.raven = function (b, ph, C, o) {
    var up = sin(TAU * ph), bob = -up * 0.08, fm = o.mat == null ? M.FEATHER : o.mat;
    function P(x, y, z) { return [x, y + bob, z || 0]; }
    var F = function (c, f, fl, k) { return { c: c, f: f || 0.3, fl: fl == null ? FL_REAR : fl, k: k == null ? 0.02 : k, m: fm }; };
    ell(b, P(0, 0), [0.62, 0.34, 0.33], Object.assign(F(C.base), { rot: [0, 0, 0.15] }));
    ell(b, P(0.38, -0.06), [0.34, 0.3, 0.3], F(C.base, 0.3, FL_REAR, 0.2));
    ell(b, P(0.86, 0.26), [0.3, 0.28, 0.27], F(C.base, 0.4, FL_REAR, 0.14));
    cone(b, P(1.08, 0.26), P(1.68, 0.15), 0.1, 0.014, { m: M.HORN, c: lin('#1c1c20'), k: 0.03 });
    if (!o.lite) cone(b, P(1.08, 0.18), P(1.5, 0.13), 0.07, 0.01, { m: M.HORN, c: lin('#16161a'), k: 0.02 });
    ell(b, P(-0.98, -0.08), [0.6, 0.05, 0.28], Object.assign(F(C.dark, 0.2), { rot: [0, 0, 0.22] }));
    for (var s = -1; s <= 1; s += 2) wing(b, P(0.12, 0.16, s * 0.22), s, up * 0.85 - 0.15, o.wing || 1, C.base, C.dark, fm, false, o.lite);
    if (!o.lite) {
      cone(b, P(-0.05, -0.28, 0.08), P(-0.12, -0.55, 0.1), 0.04, 0.025, { m: M.SKIN, c: lin('#2a2a2a'), k: 0.02 });
      cone(b, P(0.15, -0.28, -0.08), P(0.1, -0.55, -0.1), 0.04, 0.025, { m: M.SKIN, c: lin('#2a2a2a'), k: 0.02 });
    }
    eyes(b, C, [P(1.0, 0.34, 0.17), P(1.0, 0.34, -0.17)], 0.045);
    if (!o.lite) paint(b, P(0.6, 0.42), [0.35, 0.1, 0.3], C.pale, 0.08, 0.45);
    b.at = { head: P(0.86, 0.5), crown: P(0.8, 0.55), back: [P(0.2, 0.3), P(-0.3, 0.25)], body: P(0, 0), bodyR: 0.5, snout: P(1.6, 0.18) };
  };

  FAM.vine = function (b, ph, C, o) {
    var s = sin(TAU * ph) * 0.22, t = sin(TAU * ph + Math.PI / 2) * 0.12, bark = lin('#3a2c1c', 0.9);
    for (var k = 0; k < 6; k++) {
      var an = k / 6 * TAU + 0.3;
      cone(b, [0, -0.72, 0], [cos(an) * 1.05, -0.97, sin(an) * 0.7], 0.17, 0.035, { m: M.BARK, c: mixc(C.dark, bark, 0.6), fl: an, k: 0.12, f: 1 });
    }
    ell(b, [0, -0.84, 0], [0.7, 0.2, 0.52], { m: M.BARK, c: mixc(C.dark, bark, 0.5), k: 0.1, f: 1 });
    var p0 = [0, -0.72, 0], p1 = [-0.8 + s, -0.1, 0.05], p2 = [0.8 + s, 0.4, -0.05], p3 = [s * 1.5, 0.92, 0], pts = [];
    for (var i = 0; i <= 6; i++) pts.push(bez(p0, p1, p2, p3, i / 6));
    for (i = 0; i < 6; i++) {
      var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
      cone(b, pts[i], pts[i + 1], 0.19 - i * 0.014, 0.19 - (i + 1) * 0.014, { m: M.BARK, c: mixc(C.dark, C.base, i / 6), fl: Math.atan2(dy, dx), k: 0.08, f: 0.5 });
    }
    var tp0 = pts[2], tpts = [tp0, [-1.0, -0.05 + t, 0.15], [-1.1, 0.45 + t, 0.2], [-0.7 + t, 0.5, 0.25]], tq = [];
    for (i = 0; i <= 4; i++) tq.push(bez(tpts[0], tpts[1], tpts[2], tpts[3], i / 4));
    chain(b, tq, 0.08, 0.03, { m: M.BARK, c: C.base, k: 0.05, f: 0.3 });
    for (i = 0; i < 7; i++) {
      var u = (i + 0.5) / 7, pp = bez(p0, p1, p2, p3, u), sd = i % 2 ? 1 : -1, zz = (i % 3 - 1) * 0.14;
      if (i % 3 === 2) ell(b, add(pp, [sd * 0.3, 0.12, zz]), [0.28, 0.05, 0.15], { m: M.LEAF, c: C.pale, k: 0.04, rot: [0.3 * sd, 0, sd * 0.5], f: 0.4 });
      else cone(b, add(pp, [0, 0, zz]), add(pp, [sd * 0.33, 0.08, zz * 1.5]), 0.05, 0.004, { m: M.HORN, c: lin('#d8d0a8'), k: 0.02 });
    }
    var H = [s * 1.5, 1.05, 0], open = 0.25 + 0.15 * sin(TAU * ph + Math.PI);
    ell(b, add(H, [-0.02, 0.0, 0]), [0.3, 0.26, 0.26], { m: M.LEAF, c: C.dark, k: 0.1 });
    ell(b, add(H, [0.12, 0.14 + open * 0.15, 0]), [0.4, 0.17, 0.27], { m: M.LEAF, c: C.base, k: 0.06, rot: [0, 0, 0.35 + open * 0.7], f: 0.5 });
    ell(b, add(H, [0.1, -0.12 - open * 0.12, 0]), [0.36, 0.13, 0.24], { m: M.LEAF, c: C.dark, k: 0.06, rot: [0, 0, -0.3 - open * 0.6], f: 0.5 });
    ell(b, add(H, [0.2, 0.0, 0]), [0.24, 0.07 + open * 0.15, 0.18], { m: M.WET, c: lin('#4a0c16'), k: 0.03 });
    for (i = 0; i < 4; i++) {
      var tx = 0.18 + i * 0.07;
      cone(b, add(H, [tx, 0.06 + open * 0.1, 0.12 - i * 0.08]), add(H, [tx + 0.03, -0.02, 0.12 - i * 0.08]), 0.025, 0.003, { m: M.HORN, c: lin('#e8e0c0'), k: 0.01 });
    }
    b.at = { head: add(H, [0, 0.25, 0]), crown: add(H, [0, 0.3, 0]), back: [pts[3], pts[4]], body: [0, 0, 0], bodyR: 0.5, top: add(H, [0, 0.3, 0]) };
  };

  FAM.spirit = function (b, ph, C, o) {
    var bob = sin(TAU * ph) * 0.08;
    b.luminous = true;
    sph(b, [0, bob - 0.05, 0], 0.42, { m: M.FLAME, c: C.base, k: 0.02 });
    for (var k = 0; k < 7; k++) {
      var a0 = k / 7 * TAU, x = cos(a0) * 0.32, z = sin(a0) * 0.25, h = (1.0 + 0.45 * sin(TAU * (ph + k / 7))) * (1 - Math.abs(cos(a0)) * 0.3);
      var mid = [x * 1.05 + sin(TAU * (ph + k * 0.3)) * 0.1, bob + 0.25 + h * 0.45, z * 1.05], tip = [x * 0.5 + sin(TAU * (ph + k * 0.3 + 0.25)) * 0.22, bob + 0.3 + h, z * 0.5];
      cone(b, [x, bob, z], mid, 0.17, 0.1, { m: M.FLAME, c: k % 2 ? C.dark : C.base, k: 0.1 });
      cone(b, mid, tip, 0.1, 0.008, { m: M.FLAME, c: k % 3 ? C.dark : C.base, k: 0.05 });
    }
    sph(b, [0.05, bob, 0.12], 0.26, { m: M.GLOW, c: C.pale, k: 0.12 });
    for (var i = 0; i < 3; i++) {
      var a = TAU * (ph + i / 3), p = [cos(a) * 1.0, sin(a) * 0.25 + bob, sin(a) * 0.5];
      sph(b, p, 0.12, { m: M.GLOW, c: C.base, k: 0.01 }); glow(b, p, 0.4, C.baseHex, 0.5);
    }
    glow(b, [0, bob, 0], 1.35, C.baseHex, 0.7);
    if (o.eye) eyes(b, { eye: C.eye || lin('#ffffff'), eyeHex: C.eyeHex || '#ffffff' }, [[0.38, bob + 0.12, 0.12], [0.38, bob + 0.12, -0.12]], 0.06);
    b.at = { head: [0, bob + 0.5, 0], crown: [0, bob + 0.55, 0], back: [[0, bob + 0.4, 0]], body: [0, bob, 0], bodyR: 0.5, top: [0, bob + 1.1, 0] };
  };

  FAM.druid = function (b, ph, C, o) {
    var bb = sin(TAU * ph * 2) * 0.05, st = sin(TAU * ph) * 0.3, cape = sin(TAU * ph + 0.9) * 0.12;
    function P(x, y, z) { return [x, y + bb, z || 0]; }
    var leather = lin('#3a2e20'), boot = lin('#18130c'), wood = lin('#6a4a28'), bone = lin('#d8c8a0'), skin = lin('#d8c49a');
    cone(b, P(0.02, -0.3, 0.12), [0.02 - st, -0.92, 0.12], 0.13, 0.1, { m: M.CLOTH, c: leather, k: 0.04, fl: FL_DOWN });
    cone(b, P(-0.02, -0.3, -0.12), [-0.02 + st, -0.92, -0.12], 0.13, 0.1, { m: M.CLOTH, c: scalec(leather, 0.7), k: 0.04, fl: FL_DOWN });
    ell(b, [0.06 - st, -0.95, 0.12], [0.16, 0.07, 0.1], { m: M.SKIN, c: boot, k: 0.03 });
    ell(b, [0.02 + st, -0.95, -0.12], [0.16, 0.07, 0.1], { m: M.SKIN, c: boot, k: 0.03 });
    cone(b, P(0, 0.52), P(0, -0.35), 0.26, 0.36, { m: M.CLOTH, c: C.base, k: 0.04, f: 1, fl: FL_DOWN });
    cone(b, P(0, -0.3), [st * 0.1, -0.78, 0], 0.37, 0.44, { m: M.CLOTH, c: C.base, k: 0.12, f: 1.4, fl: FL_DOWN });
    box(b, [st * 0.1, -1.0, 0], [0.6, 0.18, 0.6], 0, { op: 'sub', k: 0.04, m: M.CLOTH, c: C.dark });
    ell(b, P(-0.36 - cape * 0.4, 0.05), [0.18, 0.62, 0.46], { m: M.CLOTH, c: C.dark, k: 0.08, rot: [0, 0, 0.12 + cape], f: 1.2, fl: FL_DOWN });
    torus(b, P(0, 0.02), 0.44, 0.045, { m: M.SKIN, c: wood, k: 0.02 });
    sph(b, P(0.44, 0.02, 0.04), 0.06, { m: M.METAL, c: lin('#c8a860'), k: 0.01 });
    ell(b, P(0, 0.5), [0.44, 0.2, 0.42], { m: M.FUR, c: lin('#5a4a34'), k: 0.08, f: 1.6 });
    ell(b, P(0.05, 0.86), [0.29, 0.31, 0.29], { m: M.CLOTH, c: C.dark, k: 0.06, f: 0.5 });
    ell(b, P(0.3, 0.82), [0.14, 0.19, 0.17], { op: 'sub', k: 0.04, c: scalec(C.dark, 0.4), m: M.CLOTH });
    ell(b, P(0.18, 0.82), [0.13, 0.16, 0.14], { m: M.SKIN, c: skin, k: 0.02 });
    sph(b, P(0.29, 0.86, 0.06), 0.022, { m: M.EYE, c: [0.01, 0.01, 0.01], k: 0.002 });
    sph(b, P(0.29, 0.86, -0.06), 0.022, { m: M.EYE, c: [0.01, 0.01, 0.01], k: 0.002 });
    for (var s = -1; s <= 1; s += 2) {
      chain(b, [P(0.02, 1.08, 0.12 * s), P(-0.14, 1.3, 0.26 * s), P(-0.32, 1.48, 0.38 * s)], 0.045, 0.026, { m: M.HORN, c: bone, k: 0.03 });
      cone(b, P(-0.1, 1.25, 0.24 * s), P(0.08, 1.52, 0.3 * s), 0.03, 0.012, { m: M.HORN, c: bone, k: 0.02 });
      cone(b, P(-0.24, 1.4, 0.33 * s), P(-0.18, 1.66, 0.42 * s), 0.026, 0.01, { m: M.HORN, c: bone, k: 0.02 });
      cone(b, P(-0.32, 1.48, 0.38 * s), P(-0.52, 1.6, 0.46 * s), 0.024, 0.008, { m: M.HORN, c: bone, k: 0.02 });
    }
    cone(b, [0.75, -0.98, 0.26], P(0.75, 1.15, 0.26), 0.06, 0.048, { m: M.BARK, c: wood, k: 0.02, fl: FL_UP, f: 0.3 });
    cone(b, P(0.75, 1.15, 0.26), P(0.6, 1.42, 0.26), 0.035, 0.015, { m: M.BARK, c: wood, k: 0.03, fl: FL_UP });
    cone(b, P(0.75, 1.15, 0.26), P(0.92, 1.42, 0.26), 0.035, 0.015, { m: M.BARK, c: wood, k: 0.03, fl: FL_UP });
    sph(b, P(0.76, 1.33, 0.26), 0.13, { m: M.GLOW, c: lin('#c8ff90'), k: 0.01 });
    glow(b, P(0.76, 1.33, 0.26), 0.5, '#a8f070', 0.6);
    cone(b, P(0.22, 0.45, 0.2), P(0.7, 0.3, 0.26), 0.12, 0.09, { m: M.CLOTH, c: C.base, k: 0.06, f: 0.8 });
    sph(b, P(0.74, 0.3, 0.26), 0.07, { m: M.SKIN, c: skin, k: 0.02 });
    cone(b, P(0.18, 0.45, -0.22), P(0.02, 0.0, -0.3), 0.11, 0.08, { m: M.CLOTH, c: scalec(C.base, 0.8), k: 0.06 });
    paint(b, [0, -0.78, 0], [0.6, 0.06, 0.6], C.dark, 0.06, 0.8);
    b.at = { head: P(0.05, 1.1), crown: P(0.05, 1.15), back: [P(-0.2, 0.6)], body: P(0, 0.1), bodyR: 0.5 };
  };

  FAM.blob = function (b, ph, C, o) {
    var sq = sin(TAU * ph) * 0.1, w = 1 + sq, h = 0.85 - sq;
    for (var k = 0; k < 4; k++) {
      var px = (k % 2 ? 0.35 : -0.35), pz = k < 2 ? 0.3 : -0.3, lift = max(0, sin(TAU * (ph + k / 4))) * 0.15;
      cone(b, [px, -0.4, pz], [px + 0.1, -0.9 + lift, pz * 1.1], 0.17, 0.09, { m: M.WET, c: C.dark, k: 0.1 });
    }
    var molten = !!o.molten, skin = molten ? { m: M.STONE, c: lin('#3a1a12'), k: 0.02, f: 1.4 } : { m: M.WET, c: C.base, k: 0.02, f: 1 };
    ell(b, [0, -0.02, 0], [0.95 * w, 0.8 * h, 0.78 * w], skin);
    if (molten) {
      for (var v = 0; v < 9; v++) {
        var va = v / 9 * TAU, vy = (v % 3 - 1) * 0.3, cr = Math.sqrt(1 - vy * vy / 0.64);
        chain(b, [[cos(va) * 0.92 * w * cr, vy * h, sin(va) * 0.76 * w * cr], [cos(va + 0.3) * 0.9 * w * cr, (vy + 0.2) * h, sin(va + 0.3) * 0.74 * w * cr], [cos(va + 0.5) * 0.85 * w * cr, (vy + 0.38) * h, sin(va + 0.5) * 0.7 * w * cr]], 0.05, 0.025, { m: M.GLOW, c: lin('#ff7a2a'), k: 0.02 });
      }
      glow(b, [0, 0, 0.5], 1.1, '#ff6a1a', 0.3);
    }
    var pus = [[-0.5, 0.35, 0.45, 0.16], [0.1, 0.62, 0.3, 0.12], [-0.2, -0.1, 0.7, 0.14], [0.45, 0.45, 0.42, 0.1], [-0.75, 0.05, 0.4, 0.11], [-0.3, 0.55, -0.4, 0.13]];
    for (var i = 0; i < pus.length; i++) {
      var pp = [pus[i][0] * w, pus[i][1] * h, pus[i][2] * w];
      sph(b, pp, pus[i][3], molten ? { m: M.GLOW, c: lin('#ffb040'), k: 0.04 } : { m: M.WET, c: C.pale, k: 0.04 });
      paint(b, add(pp, [-0.02, 0.05, 0.03]), [pus[i][3] * 0.6, pus[i][3] * 0.6, pus[i][3] * 0.6], lin('#f4f8c0'), 0.03, 0.8);
    }
    ell(b, [0.92 * w, -0.12, 0], [0.32, 0.15 + sq * 0.6, 0.42], { op: 'sub', k: 0.05, c: lin('#2a0a08'), m: M.WET });
    for (var t = 0; t < 5; t++) {
      var tz = (t - 2) * 0.13;
      cone(b, [0.82 * w, 0.01, tz], [0.86 * w, -0.1, tz], 0.03, 0.004, { m: M.HORN, c: lin('#e8e0c0'), k: 0.01 });
    }
    eyes(b, C, [[0.62 * w, 0.32 * h + 0.05, 0.24], [0.68 * w, 0.26 * h + 0.05, -0.2]], 0.1);
    if (!molten) paint(b, [-0.1, 0.7 * h, 0], [0.7, 0.25, 0.6], mixc(C.base, C.pale, 0.35), 0.15, 0.6);
    b.at = { head: [0.3, 0.8 * h, 0], crown: [0, 0.82 * h, 0], back: [[0.3, 0.75 * h, 0], [-0.3, 0.75 * h, 0]], body: [0, 0, 0], bodyR: 0.85, top: [0, 0.8 * h, 0] };
  };

  FAM.robed = function (b, ph, C, o) {
    var bb = sin(TAU * ph * 2) * 0.05, hem = sin(TAU * ph) * 0.08, sway = sin(TAU * ph + 0.5) * 0.06;
    function P(x, y, z) { return [x, y + bb, z || 0]; }
    var wood = lin('#5a3e22'), bone = lin('#d8d0b8'), skin = o.skin || lin('#7a8a6a');
    cone(b, P(0.12, 0.48), [-0.04 + hem, -0.5, 0], 0.3, 0.5, { m: M.CLOTH, c: C.base, k: 0.04, f: 1.4, fl: FL_DOWN });
    ell(b, P(-0.08, 0.38), [0.38, 0.34, 0.36], { m: M.CLOTH, c: C.base, k: 0.12, f: 1 });
    ell(b, [hem * 0.5, -0.82, 0], [0.56, 0.16, 0.5], { m: M.CLOTH, c: C.dark, k: 0.15, f: 1.6, fl: FL_DOWN });
    ell(b, P(0.3, 0.86), [0.29, 0.29, 0.29], { m: M.CLOTH, c: C.dark, k: 0.08, f: 0.6 });
    ell(b, P(0.54, 0.8), [0.17, 0.2, 0.18], { op: 'sub', k: 0.04, c: lin('#0a0a0c'), m: M.VOID });
    eyes(b, C, [P(0.48, 0.84, 0.07), P(0.48, 0.84, -0.07)], 0.045);
    cone(b, [0.8, -0.98, 0.3], P(0.8 + sway, 1.2, 0.3), 0.06, 0.045, { m: M.BARK, c: wood, k: 0.02, fl: FL_UP, f: 0.3 });
    if (o.crystal) {
      hex(b, P(0.8 + sway, 1.4, 0.3), 0.1, 0.18, 0.01, { m: M.ICE, c: lin('#c8f0ff'), k: 0.02 });
      glow(b, P(0.8 + sway, 1.4, 0.3), 0.45, '#a8e4ff', 0.5);
    } else {
      ell(b, P(0.8 + sway, 1.38, 0.3), [0.19, 0.18, 0.17], { m: M.HORN, c: bone, k: 0.02 });
      ell(b, P(0.88 + sway, 1.25, 0.3), [0.12, 0.07, 0.11], { m: M.HORN, c: scalec(bone, 0.85), k: 0.03 });
      sph(b, P(0.96 + sway, 1.4, 0.37), 0.05, { op: 'sub', k: 0.01, c: lin('#120c08'), m: M.VOID });
      sph(b, P(0.96 + sway, 1.4, 0.23), 0.05, { op: 'sub', k: 0.01, c: lin('#120c08'), m: M.VOID });
    }
    for (var k = 0; k < 3; k++) {
      var top = P(0.72 + k * 0.05 + sway, 1.16, 0.3), bot = P(0.64 + k * 0.1 + sway * 1.5, 0.82 - k * 0.04, 0.3 + (k - 1) * 0.06);
      cone(b, top, bot, 0.012, 0.012, { m: M.SKIN, c: k === 1 ? C.pale : lin('#a08060'), k: 0.005 });
      sph(b, bot, 0.03, { m: M.HORN, c: k === 1 ? C.pale : lin('#c8b088'), k: 0.005 });
    }
    cone(b, P(0.28, 0.4, 0.2), P(0.78, 0.25, 0.3), 0.14, 0.1, { m: M.CLOTH, c: C.base, k: 0.06, f: 1 });
    sph(b, P(0.8, 0.26, 0.3), 0.065, { m: M.SKIN, c: skin, k: 0.02 });
    paint(b, P(0.1, 0.0), [0.6, 0.05, 0.6], C.pale, 0.03, 0.5);
    b.at = { head: P(0.3, 1.12), crown: P(0.3, 1.15), back: [P(-0.1, 0.65)], body: P(0, 0), bodyR: 0.5 };
  };

  FAM.slab = function (b, ph, C, o) {
    var s = sin(TAU * ph) * 0.3, bb = sin(TAU * ph * 2) * 0.04, mt = o.mat == null ? M.SKIN : o.mat, f = o.rough == null ? 0.6 : o.rough;
    function P(x, y, z) { return [x, y + bb, z || 0]; }
    var dk = scalec(C.dark, 0.8), Fm = function (c, k, ff) { return { m: mt, c: c, k: k == null ? 0.1 : k, f: ff == null ? f : ff }; };
    cone(b, [-0.3, -0.3, -0.3], [-0.3 + s * 0.6, -0.92, -0.32], 0.22, 0.18, Fm(dk, 0.1));
    cone(b, [0.3, -0.3, 0.3], [0.3 - s * 0.6, -0.92, 0.32], 0.24, 0.19, Fm(C.dark, 0.1));
    ell(b, [-0.24 + s * 0.6, -0.92, -0.32], [0.24, 0.1, 0.18], Fm(dk, 0.05));
    ell(b, [0.36 - s * 0.6, -0.92, 0.32], [0.24, 0.1, 0.18], Fm(C.dark, 0.05));
    ell(b, P(0, 0.05), [0.82, 0.66, 0.62], Fm(C.base, 0.02));
    ell(b, P(-0.05, 0.52), [0.6, 0.38, 0.6], Fm(mixc(C.base, C.pale, 0.2), 0.25, f * 1.4));
    ell(b, P(0.78, 0.6), [0.28, 0.25, 0.26], Fm(C.base, 0.1));
    ell(b, P(0.94, 0.7), [0.14, 0.07, 0.22], Object.assign(Fm(C.base, 0.05), { rot: [0, 0, -0.25] }));
    ell(b, P(0.94, 0.47), [0.17, 0.11, 0.19], Fm(C.dark, 0.06));
    cone(b, P(1.0, 0.46, 0.11), P(1.1, 0.66, 0.15), 0.05, 0.01, { m: M.HORN, c: lin('#e8e0c0'), k: 0.01 });
    cone(b, P(1.0, 0.46, -0.11), P(1.1, 0.66, -0.15), 0.05, 0.01, { m: M.HORN, c: lin('#e8e0c0'), k: 0.01 });
    eyes(b, C, [P(1.04, 0.62, 0.1), P(1.04, 0.62, -0.1)], 0.05);
    var e1 = P(0.78 + s * 0.4, -0.05, 0.62), f1 = P(0.86 + s, -0.55, 0.64);
    chain(b, [P(0.5, 0.5, 0.56), e1], 0.24, 0.19, Fm(C.base, 0.12));
    cone(b, e1, f1, 0.19, 0.17, Fm(C.base, 0.06));
    ell(b, f1, [0.26, 0.24, 0.24], Fm(C.base, 0.06));
    for (var k = 0; k < 3; k++) sph(b, add(f1, [0.2, 0.06 - k * 0.1, 0.12]), 0.07, Fm(C.dark, 0.04));
    var e2 = P(-0.62 - s * 0.4, -0.05, -0.6), f2 = P(-0.8 - s, -0.5, -0.62);
    chain(b, [P(-0.38, 0.5, -0.56), e2], 0.22, 0.17, Fm(dk, 0.12));
    cone(b, e2, f2, 0.17, 0.15, Fm(dk, 0.06));
    ell(b, f2, [0.24, 0.22, 0.22], Fm(dk, 0.06));
    paint(b, P(0.2, -0.3), [0.7, 0.28, 0.7], C.dark, 0.15, 0.7);
    b.at = { head: P(0.8, 0.85), crown: P(0.75, 0.86), back: [P(0.2, 0.86), P(-0.25, 0.86), P(-0.55, 0.66)], body: P(0, 0.1), bodyR: 0.7, chest: P(0.5, 0.15, 0.4) };
  };

  FAM.imp = function (b, ph, C, o) {
    var bb = sin(TAU * ph * 2) * 0.08, flick = sin(TAU * ph) * 0.3, flap = sin(TAU * ph * 2) * 0.55;
    function P(x, y, z) { return [x, y + bb, z || 0]; }
    var legsDef = [[P(0.25, -0.22, 0.18), ph], [P(0.25, -0.22, -0.18), ph + 0.5], [P(-0.3, -0.22, 0.18), ph + 0.5], [P(-0.3, -0.22, -0.18), ph]];
    for (var i = 0; i < 4; i++) {
      var ft = leg(b, legsDef[i][0], legsDef[i][1], 0.6, i > 1 ? 0.3 : 0, 0.36, 0.38, 0.11, 0.07, 0.05, 1, { m: M.SKIN, c: i % 2 ? scalec(C.dark, 0.7) : C.dark, k: 0.06 });
      foot(b, ft, [0.08, 0.04, 0.06], { m: M.HORN, c: lin('#2a1408') });
    }
    ell(b, P(0, 0.02), [0.6, 0.5, 0.48], { m: M.SKIN, c: C.base, k: 0.02, f: 0.4 });
    ell(b, P(0.62, 0.55), [0.33, 0.3, 0.3], { m: M.SKIN, c: C.base, k: 0.12, f: 0.4 });
    for (var s = -1; s <= 1; s += 2) {
      cone(b, P(0.5, 0.78, 0.14 * s), P(0.32, 1.22, 0.24 * s), 0.08, 0.01, { m: M.HORN, c: scalec(C.dark, 0.6), k: 0.03 });
      cone(b, P(0.5, 0.6, 0.26 * s), P(0.36, 0.72, 0.5 * s), 0.07, 0.01, { m: M.SKIN, c: C.base, k: 0.04 });
      wing(b, P(-0.1, 0.42, 0.2 * s), s, flap - 0.1, 0.7, C.dark, scalec(C.dark, 0.6), M.SKIN, true);
    }
    ell(b, P(0.9, 0.42), [0.12, 0.05, 0.2], { op: 'sub', k: 0.02, c: lin('#2a0804'), m: M.VOID });
    eyes(b, C, [P(0.88, 0.62, 0.12), P(0.88, 0.62, -0.12)], 0.065);
    var tail = [P(-0.5, -0.05), P(-0.9, 0.0 + flick * 0.4, -0.05), P(-1.15, 0.3 + flick * 0.8, -0.08), P(-1.25, 0.55 + flick, -0.1)];
    chain(b, tail, 0.1, 0.03, { m: M.SKIN, c: C.dark, k: 0.05 });
    sph(b, add(tail[3], [-0.04, 0.08, 0]), 0.12, { m: M.FLAME, c: C.pale, k: 0.04 });
    glow(b, add(tail[3], [-0.04, 0.08, 0]), 0.45, '#fff0a0', 0.6);
    paint(b, P(0.1, -0.25), [0.45, 0.2, 0.4], C.pale, 0.12, 0.35);
    b.at = { head: P(0.6, 0.85), crown: P(0.55, 0.9), back: [P(0, 0.5)], body: P(0, 0), bodyR: 0.5 };
  };

  FAM.archer = function (b, ph, C, o) {
    var st = sin(TAU * ph) * 0.3, bb = sin(TAU * ph * 2) * 0.04;
    function P(x, y, z) { return [x, y + bb, z || 0]; }
    var lea = lin('#4a3020'), wood = o.bow || lin('#6a4424'), shaft = lin('#d8d0b0');
    cone(b, P(0.04, -0.28, 0.1), [0.04 - st, -0.93, 0.1], 0.1, 0.075, { m: M.CLOTH, c: C.dark, k: 0.04, fl: FL_DOWN });
    cone(b, P(-0.04, -0.28, -0.1), [-0.04 + st, -0.93, -0.1], 0.1, 0.075, { m: M.CLOTH, c: scalec(C.dark, 0.75), k: 0.04, fl: FL_DOWN });
    ell(b, [0.08 - st, -0.95, 0.1], [0.12, 0.05, 0.07], { m: M.SKIN, c: lin('#1a120a'), k: 0.03 });
    ell(b, [0.04 + st, -0.95, -0.1], [0.12, 0.05, 0.07], { m: M.SKIN, c: lin('#1a120a'), k: 0.03 });
    cone(b, P(0, 0.55), P(0, -0.25), 0.26, 0.36, { m: M.CLOTH, c: C.base, k: 0.04, f: 0.8, fl: FL_DOWN });
    ell(b, P(0, -0.36), [0.38, 0.14, 0.34], { m: M.CLOTH, c: C.dark, k: 0.1, f: 1.2, fl: FL_DOWN });
    ell(b, P(0.12, 0.88), [0.24, 0.27, 0.24], { m: M.CLOTH, c: C.dark, k: 0.08, f: 0.5 });
    ell(b, P(0.32, 0.84), [0.13, 0.16, 0.15], { op: 'sub', k: 0.03, c: lin('#0c0a0a'), m: M.VOID });
    eyes(b, C, [P(0.28, 0.88, 0.05), P(0.28, 0.88, -0.05)], 0.035);
    box(b, P(-0.36, 0.55, -0.05), [0.09, 0.26, 0.09], 0.04, { m: M.SKIN, c: lea, k: 0.03, rot: [0, 0, -0.3] });
    for (var k = 0; k < 3; k++) {
      var ax = P(-0.42 + k * 0.06, 0.8, -0.05 + (k - 1) * 0.04), tip = P(-0.52 + k * 0.08, 1.12, -0.05 + (k - 1) * 0.05);
      cone(b, ax, tip, 0.012, 0.012, { m: M.BARK, c: shaft, k: 0.004 });
      ell(b, tip, [0.03, 0.06, 0.012], { m: M.FEATHER, c: k === 1 ? C.pale : lin('#c8c0a8'), k: 0.004, rot: [0, 0, 0.3] });
    }
    var cx = 0.4, cy = 0.25, R = 0.8, bp = [];
    for (var i = 0; i <= 6; i++) { var a = -1.2 + i * 0.4; bp.push(P(cx + cos(a) * R * 0.55, cy + sin(a) * R, 0.26)); }
    chain(b, bp, 0.05, 0.05, { m: M.BARK, c: wood, k: 0.02, fl: FL_UP });
    cone(b, bp[0], bp[6], 0.012, 0.012, { m: o.string ? M.GLOW : M.SKIN, c: o.string || lin('#e0d8c0'), k: 0.003 });
    cone(b, P(0.05, 0.45, 0.2), P(0.48, 0.32, 0.26), 0.1, 0.075, { m: M.CLOTH, c: C.base, k: 0.06, f: 0.5 });
    cone(b, P(0.08, 0.45, -0.15), P(0.62, 0.3, 0.2), 0.09, 0.07, { m: M.CLOTH, c: scalec(C.base, 0.85), k: 0.06 });
    b.at = { head: P(0.12, 1.12), crown: P(0.12, 1.15), back: [P(-0.2, 0.6)], body: P(0, 0.1), bodyR: 0.4 };
  };

  FAM.wraith = function (b, ph, C, o) {
    var w = sin(TAU * ph) * 0.18, w2 = sin(TAU * ph + TAU / 3) * 0.18, fl = sin(TAU * ph) * 0.06;
    function P(x, y, z) { return [x, y + fl, z || 0]; }
    b.alpha = 0.86;
    cone(b, P(0.05, 0.55), P(-0.05, -0.45), 0.3, 0.52, { m: M.GHOST, c: C.base, k: 0.04, f: 2, fl: FL_DOWN });
    var hems = [[0.35, 0.25, w], [-0.1, 0.4, w2], [-0.45, 0.05, -w], [0.1, -0.4, -w2], [-0.3, -0.35, w * 0.7]];
    for (var i = 0; i < hems.length; i++) {
      var h = hems[i];
      cone(b, P(h[0], -0.45, h[1]), [h[0] - 0.1 + h[2], -1.05 + Math.abs(h[2]) * 0.4, h[1] * 1.2], 0.18, 0.02, { m: M.GHOST, c: mixc(C.base, C.dark, 0.3), k: 0.12, f: 1.5, fl: FL_DOWN });
    }
    ell(b, P(0.08, 0.86), [0.27, 0.3, 0.27], { m: M.GHOST, c: C.dark, k: 0.08, f: 0.8 });
    ell(b, P(0.28, 0.8), [0.15, 0.2, 0.16], { op: 'sub', k: 0.03, c: lin('#05080c'), m: M.VOID });
    eyes(b, C, [P(0.32, 0.84, 0.07), P(0.32, 0.84, -0.07)], 0.055);
    var hand = P(0.92, 0.1 + w, 0.3);
    chain(b, [P(0.22, 0.45, 0.2), P(0.55, 0.3 + w * 0.5, 0.28), hand], 0.11, 0.055, { m: M.GHOST, c: C.base, k: 0.06, f: 0.6 });
    for (var k = 0; k < 3; k++) cone(b, hand, add(hand, [0.25, -0.1 + k * 0.1, (k - 1) * 0.05]), 0.025, 0.004, { m: M.ICE, c: C.pale, k: 0.02 });
    if (o.crown) for (var c = 0; c < 5; c++) {
      var an = (c - 2) * 0.45;
      hex(b, P(0.08 + sin(an) * 0.12, 1.14 + cos(an * 0.8) * 0.06, sin(an) * 0.2), 0.035, 0.12 - Math.abs(c - 2) * 0.025, 0.005, { m: M.ICE, c: lin('#e8fbff'), k: 0.03, rot: [an * 0.6, 0, -an * 0.3] });
    }
    glow(b, P(0.1, 0.4), 1.0, C.paleHex, 0.25);
    b.at = { head: P(0.08, 1.12), crown: P(0.08, 1.16), back: [P(-0.1, 0.6)], body: P(0, 0.1), bodyR: 0.45 };
  };

  FAM.ram = function (b, ph, C, o) {
    var bb = sin(TAU * ph * 2) * 0.04;
    function P(x, y, z) { return [x, y + bb, z || 0]; }
    var horn = lin('#d8c890'), legs = [[P(0.55, -0.15, 0.22), ph], [P(0.55, -0.15, -0.22), ph + 0.5], [P(-0.55, -0.15, 0.22), ph + 0.5], [P(-0.55, -0.15, -0.22), ph]];
    b.hairs = true;
    for (var i = 0; i < 4; i++) {
      var ft = leg(b, legs[i][0], legs[i][1], 0.5, i > 1 ? 0.3 : 0, 0.4, 0.42, 0.12, 0.07, 0.06, 1, { m: M.SKIN, c: i % 2 ? scalec(C.dark, 0.7) : C.dark, k: 0.08 });
      ell(b, add(ft, [0.04, 0, 0]), [0.08, 0.06, 0.07], { m: M.HORN, c: lin('#2a2418'), k: 0.02 });
    }
    ell(b, P(0, 0.12), [0.95, 0.55, 0.55], { m: M.FUR, c: C.base, k: 0.02, f: 2.6 });
    ell(b, P(-0.2, 0.42), [0.75, 0.3, 0.45], { m: M.FUR, c: C.pale, k: 0.2, f: 3 });
    cone(b, P(0.62, 0.25), P(0.86, 0.45), 0.32, 0.24, { m: M.FUR, c: C.base, k: 0.12, f: 2.4 });
    ell(b, P(1.0, 0.42), [0.27, 0.23, 0.21], { m: M.SKIN, c: C.dark, k: 0.08, f: 0.3 });
    cone(b, P(1.08, 0.36), P(1.42, 0.18), 0.17, 0.1, { m: M.SKIN, c: C.dark, k: 0.08 });
    sph(b, P(1.44, 0.2), 0.05, { m: M.SKIN, c: lin('#1a1410'), k: 0.02 });
    for (var s = -1; s <= 1; s += 2) {
      var cc = P(0.9, 0.52, 0.2 * s), pts = [];
      for (var k = 0; k <= 7; k++) { var u = k / 7, a = 2.2 - u * 4.6, R = 0.34 - u * 0.2; pts.push([cc[0] + cos(a) * R, cc[1] + sin(a) * R, cc[2] + s * (0.04 + u * 0.16)]); }
      chain(b, pts, 0.12, 0.035, { m: M.HORN, c: horn, k: 0.03, fl: 0 });
    }
    eyes(b, C, [P(1.12, 0.48, 0.15), P(1.12, 0.48, -0.15)], 0.045);
    if (o.sparks) for (var z = 0; z < 3; z++) {
      var an2 = TAU * (ph + z / 3), sp0 = P(cos(an2) * 0.7, 0.5 + sin(an2) * 0.2, sin(an2) * 0.6);
      cone(b, sp0, add(sp0, [0.15, 0.2, 0.05]), 0.02, 0.008, { m: M.GLOW, c: C.eye || lin('#fff070'), k: 0.004 });
      glow(b, sp0, 0.25, C.eyeHex || '#fff070', 0.5);
    }
    b.at = { head: P(1.0, 0.72), crown: P(0.95, 0.75), back: [P(0.3, 0.68), P(-0.2, 0.7), P(-0.6, 0.6)], body: P(0, 0.12), bodyR: 0.7 };
  };

  FAM.stag = function (b, ph, C, o) {
    var bb = sin(TAU * ph * 2) * 0.04, nod = sin(TAU * ph * 2 + 0.6) * 0.03;
    function P(x, y, z) { return [x, y + bb, z || 0]; }
    function Hd(x, y, z) { return [x, y + bb + nod, z || 0]; }
    var bone = lin('#d8d0b8'), ant = mixc(lin('#d8d0b8'), C.pale, 0.35);
    var legs = [[P(0.62, -0.08, 0.17), ph], [P(0.62, -0.08, -0.17), ph + 0.5], [P(-0.62, -0.06, 0.17), ph + 0.5], [P(-0.62, -0.06, -0.17), ph]];
    for (var i = 0; i < 4; i++) {
      var ft = leg(b, legs[i][0], legs[i][1], 0.5, i > 1 ? 0.35 : 0, 0.44, 0.48, 0.11, 0.055, 0.045, 1.1, { m: M.SKIN, c: i % 2 ? scalec(C.dark, 0.7) : C.dark, k: 0.07 });
      ell(b, add(ft, [0.03, 0, 0]), [0.06, 0.05, 0.05], { m: M.HORN, c: lin('#1e1a14'), k: 0.02 });
    }
    ell(b, P(0, 0.2), [0.95, 0.38, 0.36], { m: M.FUR, c: C.base, k: 0.02, f: 0.9 });
    ell(b, P(0.45, 0.25), [0.4, 0.4, 0.36], { m: M.FUR, c: C.base, k: 0.2, f: 1 });
    ell(b, P(0.0, 0.16, 0.25), [0.52, 0.24, 0.2], { op: 'sub', k: 0.05, c: lin('#1a120c'), m: M.VOID });
    for (var r = 0; r < 5; r++) {
      var rx = -0.4 + r * 0.2;
      chain(b, [P(rx, 0.4, 0.18), P(rx - 0.02, 0.18, 0.33), P(rx - 0.06, -0.06, 0.2)], 0.028, 0.02, { m: M.HORN, c: bone, k: 0.02 });
    }
    cone(b, P(0.65, 0.35), Hd(1.02, 0.9), 0.22, 0.14, { m: M.FUR, c: C.base, k: 0.12, f: 1.4, fl: FL_BACK });
    ell(b, Hd(1.12, 1.0), [0.2, 0.13, 0.12], { m: M.HORN, c: bone, k: 0.06 });
    cone(b, Hd(1.2, 0.98), Hd(1.5, 0.85), 0.1, 0.05, { m: M.HORN, c: bone, k: 0.05 });
    sph(b, Hd(1.24, 1.04, 0.08), 0.05, { op: 'sub', k: 0.01, c: lin('#100808'), m: M.VOID });
    sph(b, Hd(1.24, 1.04, -0.08), 0.05, { op: 'sub', k: 0.01, c: lin('#100808'), m: M.VOID });
    eyes(b, C, [Hd(1.23, 1.04, 0.07), Hd(1.23, 1.04, -0.07)], 0.032);
    for (var s = -1; s <= 1; s += 2) {
      var A = [Hd(1.08, 1.1, 0.07 * s), Hd(0.92, 1.45, 0.25 * s), Hd(0.82, 1.78, 0.4 * s), Hd(0.76, 2.0, 0.5 * s)];
      chain(b, A, 0.05, 0.018, { m: M.HORN, c: ant, k: 0.03, fl: FL_UP });
      var tines = [[0.25, 0.3, 0.05], [0.45, -0.18, 0.28], [0.62, 0.22, 0.22], [0.8, -0.15, 0.2]];
      for (var t = 0; t < tines.length; t++) {
        var u = tines[t][0], seg = Math.min(2, Math.floor(u * 3)), lu = u * 3 - seg, p0 = [A[seg][0] + (A[seg + 1][0] - A[seg][0]) * lu, A[seg][1] + (A[seg + 1][1] - A[seg][1]) * lu, A[seg][2] + (A[seg + 1][2] - A[seg][2]) * lu];
        cone(b, p0, add(p0, [tines[t][1], tines[t][2], s * 0.06]), 0.026, 0.008, { m: M.HORN, c: ant, k: 0.02 });
      }
    }
    sph(b, P(-0.95, 0.4), 0.08, { m: M.FUR, c: C.base, k: 0.06 });
    paint(b, P(-0.2, 0.55), [0.7, 0.15, 0.4], C.pale, 0.1, 0.35);
    paint(b, P(0.3, -0.1), [0.9, 0.12, 0.4], C.dark, 0.1, 0.5);
    b.at = { head: Hd(1.12, 1.15), crown: Hd(1.05, 1.2), back: [P(0.4, 0.6), P(0, 0.55), P(-0.4, 0.55)], body: P(0, 0.2), bodyR: 0.6 };
  };

  FAM.wisp = function (b, ph, C, o) {
    b.luminous = true;
    sph(b, [0, 0, 0], 0.4, { m: M.GLOW, c: C.pale, k: 0.02 });
    ell(b, [0, 0, 0], [0.55, 0.5, 0.5], { m: M.FLAME, c: C.base, k: 0.15 });
    for (var i = 0; i < 5; i++) {
      var a = TAU * (i / 5 + ph), m2 = a + 0.25 * sin(TAU * (ph * 3 + i / 5)), z = sin(a * 2) * 0.3;
      chain(b, [[cos(a) * 0.45, sin(a) * 0.45, z], [cos(m2) * 0.85, sin(m2) * 0.85, z * 1.3], [cos(a + 0.3) * 1.2, sin(a + 0.3) * 1.2, z * 0.8]], 0.05, 0.015, { m: M.GLOW, c: C.pale, k: 0.02 });
    }
    glow(b, [0, 0, 0], 1.2, C.baseHex, 0.75);
    b.at = { head: [0, 0.5, 0], crown: [0, 0.55, 0], back: [[0, 0.4, 0]], body: [0, 0, 0], bodyR: 0.45 };
  };

  FAM.harpy = function (b, ph, C, o) {
    var up = sin(TAU * ph), bob = -up * 0.08;
    function P(x, y, z) { return [x, y + bob, z || 0]; }
    var tal = lin('#c8a850');
    for (var s = -1; s <= 1; s += 2) {
      var ft = P(-0.2 + s * 0.04, -0.95, 0.12 * s);
      cone(b, P(-0.05, -0.4, 0.1 * s), ft, 0.07, 0.045, { m: M.SKIN, c: tal, k: 0.05 });
      for (var k = 0; k < 3; k++) cone(b, ft, add(ft, [0.08 - k * 0.08, -0.08, (k - 1) * 0.06]), 0.02, 0.004, { m: M.HORN, c: lin('#e8e0c8'), k: 0.01 });
    }
    ell(b, P(0, 0.08), [0.34, 0.55, 0.3], { m: M.FEATHER, c: C.base, k: 0.02, f: 0.6, fl: FL_DOWN });
    ell(b, P(0.05, -0.3), [0.3, 0.25, 0.28], { m: M.FEATHER, c: C.dark, k: 0.15, f: 1, fl: FL_DOWN });
    ell(b, P(0.15, 0.85), [0.21, 0.24, 0.21], { m: M.SKIN, c: C.pale, k: 0.1 });
    cone(b, P(0.35, 0.85), P(0.5, 0.8), 0.05, 0.01, { m: M.HORN, c: tal, k: 0.02 });
    for (var h = 0; h < 5; h++) {
      var hz = (h - 2) * 0.1;
      chain(b, [P(0.1, 1.02, hz), P(-0.25, 0.95 + (h % 2) * 0.08, hz * 1.4), P(-0.5, 0.65 + sin(TAU * ph + h) * 0.06, hz * 1.8)], 0.08, 0.015, { m: M.FUR, c: C.dark, k: 0.06, f: 1.2, fl: FL_REAR });
    }
    eyes(b, C, [P(0.32, 0.9, 0.08), P(0.32, 0.9, -0.08)], 0.035);
    for (s = -1; s <= 1; s += 2) wing(b, P(-0.05, 0.42, 0.2 * s), s, up * 0.7 - 0.1, 0.98, C.base, C.dark);
    b.at = { head: P(0.15, 1.1), crown: P(0.15, 1.12), back: [P(-0.1, 0.5)], body: P(0, 0.1), bodyR: 0.45 };
  };

  // The Tempest Roc: a storm-dark giant bird (the harpy family in 2D), crest raised, lightning in its wings.
  FAM.roc = function (b, ph, C, o) {
    FAM.raven(b, ph, C, { mat: M.FEATHER });
    var up = sin(TAU * ph), bob = -up * 0.08;
    for (var k = 0; k < 4; k++) cone(b, [0.7, 0.45 + bob, (k - 1.5) * 0.06], [0.35 - k * 0.05, 0.85 + bob - k * 0.06, (k - 1.5) * 0.1], 0.06, 0.01, { m: M.FEATHER, c: C.pale, k: 0.04, fl: FL_REAR });
    for (var s = -1; s <= 1; s += 2) {
      var th = up * 0.85 - 0.15, p = [-0.15, 0.16 + bob + 0.85 * sin(th), s * (0.85 * cos(th) + 0.2)];
      chain(b, [p, add(p, [-0.2, 0.12, s * 0.15]), add(p, [-0.1, 0.25, s * 0.3])], 0.02, 0.008, { m: M.GLOW, c: C.pale, k: 0.004 });
      glow(b, add(p, [-0.15, 0.15, s * 0.2]), 0.3, C.paleHex, 0.45);
    }
    glow(b, [0, bob, 0], 1.0, C.paleHex, 0.15);
  };

  FAM.husk = function (b, ph, C, o) {
    var s = sin(TAU * ph) * 0.28, bb = sin(TAU * ph * 2) * 0.04;
    function P(x, y, z) { return [x, y + bb, z || 0]; }
    cone(b, P(0.04, -0.3, 0.1), [0.04 - s, -1.0, 0.1], 0.08, 0.05, { m: M.SKIN, c: C.dark, k: 0.04 });
    cone(b, P(-0.04, -0.3, -0.1), [-0.04 + s, -1.0, -0.1], 0.08, 0.05, { m: M.SKIN, c: scalec(C.dark, 0.7), k: 0.04 });
    ell(b, P(0, 0.25), [0.3, 0.45, 0.24], { m: M.SKIN, c: C.base, k: 0.02, f: 0.5 });
    ell(b, P(0, -0.28), [0.22, 0.14, 0.18], { m: M.SKIN, c: C.base, k: 0.12 });
    ell(b, P(0.12, 0.2, 0.12), [0.13, 0.22, 0.2], { op: 'sub', k: 0.03, c: lin('#120a16'), m: M.VOID });
    for (var k = 0; k < 3; k++) cone(b, P(0.05, 0.42 - k * 0.12, 0.25), P(0.28, 0.4 - k * 0.12, 0.08), 0.022, 0.018, { m: M.HORN, c: C.pale, k: 0.02 });
    ell(b, P(0.1, 0.92), [0.19, 0.23, 0.19], { m: M.SKIN, c: C.dark, k: 0.08 });
    sph(b, P(0.24, 0.96, 0.07), 0.045, { op: 'sub', k: 0.01, c: lin('#0a060c'), m: M.VOID });
    sph(b, P(0.24, 0.96, -0.07), 0.045, { op: 'sub', k: 0.01, c: lin('#0a060c'), m: M.VOID });
    eyes(b, C, [P(0.23, 0.96, 0.07), P(0.23, 0.96, -0.07)], 0.03);
    chain(b, [P(-0.18, 0.55, -0.18), P(-0.32 + s * 0.3, 0.05, -0.22), P(-0.4 + s * 0.5, -0.45, -0.22)], 0.07, 0.04, { m: M.SKIN, c: scalec(C.base, 0.75), k: 0.05 });
    var hand = P(0.62 - s * 0.5, -0.52, 0.26);
    chain(b, [P(0.18, 0.55, 0.2), P(0.42 - s * 0.25, 0.0, 0.26), hand], 0.07, 0.04, { m: M.SKIN, c: C.base, k: 0.05 });
    for (k = 0; k < 3; k++) cone(b, hand, add(hand, [0.06, -0.14, (k - 1) * 0.04]), 0.018, 0.006, { m: M.SKIN, c: C.dark, k: 0.01 });
    b.at = { head: P(0.1, 1.15), crown: P(0.1, 1.18), back: [P(-0.1, 0.6)], body: P(0, 0.2), bodyR: 0.4 };
  };

  // ---------- per-type extras over the family body ----------
  var EXTRAS = {
    sparks: function (b, ph, C) {
      for (var i = 0; i < 4; i++) {
        var a = TAU * (ph + i / 4), p = add(b.at.body, [cos(a) * 0.9, 0.35 + sin(a * 2) * 0.15, sin(a) * 0.5]);
        chain(b, [p, add(p, [0.12, 0.14, 0.04]), add(p, [0.06, 0.28, 0.06])], 0.022, 0.01, { m: M.GLOW, c: C.pale, k: 0.004 });
        glow(b, add(p, [0.08, 0.14, 0.04]), 0.3, C.paleHex, 0.5);
      }
    },
    thorns: function (b, ph, C) {
      var bk = b.at.back;
      for (var i = 0; i < bk.length; i++) for (var s = -1; s <= 1; s += 2) {
        var p = add(bk[i], [0, -0.06, 0.06 * s]);
        cone(b, p, add(p, [-0.12, 0.3, 0.1 * s]), 0.06, 0.006, { m: M.HORN, c: C.pale, k: 0.02 });
      }
    },
    ghost: function (b) {
      b.alpha = 0.82; b.hairs = false;
      b.s.forEach(function (p) { if (p.m === M.FUR) p.m = M.GHOST; });
      glow(b, b.at.body, 1.2, '#e8f8ff', 0.25);
    },
    beak: function (b) {
      var sn = b.at.snout;
      cone(b, add(sn, [-0.25, 0.08, 0]), add(sn, [0.12, -0.12, 0]), 0.16, 0.02, { m: M.HORN, c: lin('#d8b040'), k: 0.04 });
      b.s.forEach(function (p) { if (p.a[0] > 0.6 && p.m === M.FUR) p.m = M.FEATHER; });
    },
    halo: function (b, ph, C) {
      var h = add(b.at.crown, [0, 0.3 + sin(TAU * ph) * 0.03, 0]);
      torus(b, h, 0.42, 0.04, { m: M.GLOW, c: C.pale, k: 0.004 });
      glow(b, h, 0.8, C.paleHex, 0.4);
    },
    flower: function (b, ph, C) {
      var t = b.at.top || b.at.crown;
      for (var i = 0; i < 6; i++) {
        var a = TAU * i / 6;
        ell(b, add(t, [cos(a) * 0.2, 0.08, sin(a) * 0.2]), [0.17, 0.04, 0.1], { m: M.LEAF, c: C.pale, k: 0.03, rot: [0, -a, 0.35] });
      }
      sph(b, add(t, [0, 0.12, 0]), 0.1, { m: M.GLOW, c: lin('#ffe060'), k: 0.02 }); glow(b, add(t, [0, 0.12, 0]), 0.5, '#ffe060', 0.45);
    },
    bloom: function (b, ph, C) {
      var t = b.at.top || b.at.crown;
      for (var i = 0; i < 7; i++) {
        var a = TAU * i / 7;
        ell(b, add(t, [cos(a) * 0.3, 0.1 + sin(TAU * ph + i) * 0.02, sin(a) * 0.3]), [0.24, 0.05, 0.13], { m: M.LEAF, c: C.pale, k: 0.04, rot: [0, -a, 0.45] });
      }
      sph(b, add(t, [0, 0.12, 0]), 0.14, { m: M.WET, c: lin('#200008'), k: 0.03 });
    },
    crown: function (b) {
      var c = add(b.at.crown, [0, 0.08, 0]), gold = lin('#ffcc44');
      torus(b, c, 0.2, 0.04, { m: M.METAL, c: gold, k: 0.01 });
      for (var i = 0; i < 5; i++) { var a = TAU * i / 5 + 0.3; cone(b, add(c, [cos(a) * 0.2, 0.02, sin(a) * 0.2]), add(c, [cos(a) * 0.22, 0.22, sin(a) * 0.22]), 0.045, 0.008, { m: M.METAL, c: gold, k: 0.01 }); }
    },
    twin: function (b, ph, C) {
      var a = TAU * ph, p = [cos(a) * 0.9, 0.55, sin(a) * 0.5];
      sph(b, p, 0.26, { m: M.GLOW, c: C.pale, k: 0.02 }); glow(b, p, 0.7, C.paleHex, 0.55);
    },
    flock: function (b, ph, C) {
      var keep = b.T;
      b.T = { o: [-0.85, 0.7, -0.5], s: 0.45 }; FAM.raven(b, ph + 0.33, C, { lite: true });
      b.T = { o: [-0.75, -0.5, 0.55], s: 0.45 }; FAM.raven(b, ph + 0.66, C, { lite: true });
      b.T = keep;
    },
    flames: function (b, ph, C) {
      for (var i = 0; i < 5; i++) {
        var x = -0.6 + i * 0.3, base = [x, 0.55, (i % 2 ? 0.2 : -0.15)], hgt = 0.45 + 0.2 * sin(TAU * (ph + i / 5));
        cone(b, base, add(base, [sin(TAU * (ph + i * 0.3)) * 0.1, hgt, 0]), 0.2, 0.02, { m: M.FLAME, c: lin('#ffb040'), k: 0.12 });
      }
      glow(b, [0, 0.9, 0], 1.0, '#ff8a3a', 0.4);
    },
    eye: function (b) {
      var c = add(b.at.chest || b.at.body, [0.15, 0.15, 0.1]);
      sph(b, c, 0.24, { m: M.WET, c: lin('#f0d0ff'), k: 0.03 });
      sph(b, add(c, [0.16, 0, 0.12]), 0.1, { m: M.EYE, c: lin('#300020'), k: 0.01 });
      glow(b, c, 0.7, '#d090ff', 0.35);
    },
    cracks: function (b) {
      var segs = [[[0.3, 0.4, 0.55], [0.5, 0.1, 0.58], [0.45, -0.2, 0.55]], [[0.0, 0.5, 0.6], [-0.2, 0.2, 0.62], [-0.1, -0.15, 0.6]], [[0.6, 0.2, 0.3], [0.75, 0.0, 0.2]]];
      for (var i = 0; i < segs.length; i++) chain(b, segs[i], 0.035, 0.02, { m: M.GLOW, c: lin('#ff8a3a'), k: 0.004 });
      glow(b, [0.3, 0.15, 0.6], 0.6, '#ff8a3a', 0.3);
    },
    frost: function (b) {
      var bk = b.at.back;
      for (var i = 0; i < bk.length; i++) for (var s = -1; s <= 1; s += 2) hex(b, add(bk[i], [0, 0.08, 0.2 * s]), 0.06, 0.18, 0.01, { m: M.ICE, c: lin('#e0f4ff'), k: 0.03, rot: [0.4 * s, 0, -0.3] });
    }
  };

  // ---------- per-type looks (family, materials, extras) ----------
  var LOOK = {
    direwarg: { bulk: 1.18 }, wraithwolf: {}, alphawolf: { bulk: 1.06 },
    owlbear: { tufts: true, headMat: M.FEATHER }, rootwarden: { mat: M.BARK }, eldersbear: {}, greatbear: {},
    omen: { eye: true }, rimespitter: { crystal: true }, severer: { string: [1.2, 0.5, 1.6], bow: [0.12, 0.04, 0.14] },
    mirebrute: { mat: M.SKIN, rough: 0.8 }, kilngolem: { mat: M.STONE, rough: 1.4 }, frosttroll: { mat: M.FUR, rough: 1.6 }, unmaker: { mat: M.SKIN, rough: 0.4 },
    palematriarch: { crown: true }, thunderram: { sparks: true }, tempestroc: { roc: true }, cindermother: { molten: true }
  };

  // The rig of one creature type at phase ph. pal: [body, dark, accent] hex (PB.Sprites.PALETTE); eye: glow hex or null.
  function creature(type, ph, fam, pal, eyeHex, extra) {
    ph = ph - Math.floor(ph);
    var b = rig(), o = LOOK[type] || {}, C = { base: lin(pal[0], 0.88), dark: lin(pal[1], 0.7), pale: lin(pal[2], 0.95), baseHex: pal[0], darkHex: pal[1], paleHex: pal[2],
      eye: eyeHex ? lin(eyeHex) : null, eyeHex: eyeHex };
    var f = o.roc ? 'roc' : fam;
    (FAM[f] || FAM.blob)(b, ph, C, o);
    if (extra && EXTRAS[extra]) EXTRAS[extra](b, ph, C);
    if (type === 'unmaker') { // horns, and violet veins through a void-dark hide
      var hd = b.at.head;
      for (var s = -1; s <= 1; s += 2) chain(b, [add(hd, [0, -0.08, 0.16 * s]), add(hd, [-0.2, 0.25, 0.3 * s]), add(hd, [-0.45, 0.35, 0.36 * s])], 0.08, 0.012, { m: M.HORN, c: lin('#1a1020'), k: 0.03 });
      var vs = [[[0.2, 0.6, 0.55], [0.4, 0.2, 0.6], [0.3, -0.25, 0.55]], [[-0.3, 0.6, 0.55], [-0.45, 0.2, 0.55], [-0.35, -0.2, 0.5]], [[0.6, 0.35, 0.35], [0.75, 0.05, 0.3]]];
      for (var vv = 0; vv < vs.length; vv++) chain(b, vs[vv], 0.03, 0.015, { m: M.GLOW, c: lin('#b070ff'), k: 0.01 });
    }
    if (type === 'rootwarden') { // a walking thicket: mossy bark hide, saplings on the back
      var bk = b.at.back;
      for (var i = 0; i < bk.length; i++) { cone(b, bk[i], add(bk[i], [-0.1, 0.4, (i - 1) * 0.12]), 0.05, 0.01, { m: M.BARK, c: lin('#3a2c1c'), k: 0.03, fl: FL_UP }); sph(b, add(bk[i], [-0.1, 0.45, (i - 1) * 0.12]), 0.12, { m: M.LEAF, c: C.pale, k: 0.04, f: 1 }); }
      paint(b, b.at.back[0], [0.7, 0.25, 0.6], lin('#5a7a30'), 0.15, 0.6);
    }
    return b;
  }

  // ---------- terrain props (standing on an obstacle: the base centre is the origin, units of obstacle radius) ----------
  // rnd: a 0..1 generator (seeded by the caller). B: the biome (terrain.js). Returns the rig plus its frame extent.
  function rock(b, rnd, c, rad, col, cap, o) {
    ell(b, c, rad, Object.assign({ m: M.STONE, c: col, k: 0.15, f: 1.2 + rnd() * 0.6, rot: [rnd() * 0.4 - 0.2, rnd() * TAU, rnd() * 0.4 - 0.2] }, o));
  }
  function prop(kind, rnd, B) {
    var b = rig(), rk = lin(B.rock[0]), rd = lin(B.rock[1]), cap = lin(B.cap, 0.8), i, a, h, x, z;
    b.cap = cap;
    if (kind === 'boulder') {
      rock(b, rnd, [-0.25, 0.32, 0], [0.82, 0.62, 0.66], mixc(rk, rd, 0.3), cap);
      rock(b, rnd, [0.1, 0.62, -0.05], [0.5, 0.36, 0.45], rk, cap);
      rock(b, rnd, [0.5, 0.2, 0.25], [0.45, 0.3, 0.4], mixc(rk, rd, 0.5), cap);
      for (i = 0; i < 4; i++) { a = rnd() * TAU; rock(b, rnd, [cos(a) * 0.95, 0.06, sin(a) * 0.7], [0.14, 0.1, 0.12], mixc(rk, rd, rnd()), cap, { k: 0.04 }); }
      b.ext = { up: 1.3, side: 1.25 }; b.capAmt = 1;
    } else if (kind === 'basalt') {
      for (i = 0; i < 7; i++) {
        x = (i % 4 - 1.5) * 0.42 + (i > 3 ? 0.2 : 0); z = i > 3 ? -0.35 : 0.1; h = 0.45 + rnd() * (i > 3 ? 0.9 : 0.6);
        hex(b, [x, h, z], 0.22, h, 0.02, { m: M.STONE, c: mixc(rk, rd, rnd() * 0.6), k: 0.03, f: 0.5, rot: [0, rnd(), (rnd() - 0.5) * 0.12] });
        if (rnd() < 0.6) chain(b, [[x - 0.05, h * 0.4, z + 0.21], [x + 0.03, h * 1.0, z + 0.22], [x - 0.02, h * 1.5, z + 0.2]], 0.025, 0.012, { m: M.GLOW, c: lin('#ff7a2a'), k: 0.004 });
      }
      b.ext = { up: 2.1, side: 1.3 }; b.capAmt = 0.6; b.glowCol = '#ff7a2a';
    } else if (kind === 'tree' || kind === 'charred' || kind === 'deadtree') {
      var bark = lin(kind === 'tree' ? '#3a2e20' : kind === 'charred' ? '#1c1614' : '#2a2030'), tall = kind === 'tree' ? 1.65 : 2.2;
      cone(b, [0, 0, 0], [0.05, tall, 0.02], 0.36, 0.22, { m: M.BARK, c: bark, k: 0.05, fl: FL_UP, f: 1.6 });
      for (i = 0; i < 5; i++) { a = i / 5 * TAU + rnd() * 0.5; cone(b, [cos(a) * 0.18, 0.18, sin(a) * 0.14], [cos(a) * 0.62, -0.02, sin(a) * 0.45], 0.16, 0.04, { m: M.BARK, c: bark, k: 0.14, fl: a, f: 1.2 }); }
      if (kind !== 'tree') {
        for (i = 0; i < 6; i++) {
          a = rnd() * TAU; var y0 = tall * (0.55 + rnd() * 0.4), L = 0.5 + rnd() * 0.55, el = 0.5 + rnd() * 0.6;
          var p0 = [0.03, y0, 0.01], p1 = [cos(a) * L * 0.7, y0 + L * el, sin(a) * L * 0.5], p2 = add(p1, [cos(a + 0.6) * L * 0.5, L * 0.35, sin(a + 0.6) * L * 0.35]);
          chain(b, [p0, p1, p2], 0.11, 0.015, { m: M.BARK, c: bark, k: 0.06, fl: FL_UP, f: 0.8 });
        }
        if (kind === 'charred') for (i = 0; i < 5; i++) { a = rnd() * TAU; sph(b, [cos(a) * 0.3, 0.2 + rnd() * 1.4, 0.2 + sin(a) * 0.1], 0.035, { m: M.GLOW, c: lin('#ff9a40'), k: 0.01 }); }
        if (kind === 'charred') b.glowCol = '#ff9a40';
        b.ext = { up: 3.2, side: 1.3 };
      } else {
        for (i = 0; i < 3; i++) { a = rnd() * TAU; chain(b, [[0.03, tall * 0.85, 0], [cos(a) * 0.45, tall + 0.25, sin(a) * 0.3]], 0.12, 0.05, { m: M.BARK, c: bark, k: 0.08, fl: FL_UP }); }
        paint(b, [0, 0.15, 0], [0.7, 0.4, 0.7], lin('#3a5224'), 0.2, 0.55);
        b.ext = { up: 2.3, side: 1.3 };
      }
      b.capAmt = 0;
    } else if (kind === 'pine') {
      cone(b, [0, 0, 0], [0, 0.95, 0], 0.18, 0.13, { m: M.BARK, c: lin('#3a2a1e'), k: 0.04, fl: FL_UP, f: 1.2 });
      for (i = 0; i < 5; i++) {
        var tw = 1.2 - i * 0.2, ty = 0.5 + i * 0.6;
        cone(b, [0, ty, 0], [0, ty + 0.95, 0], tw, 0.03, { m: M.LEAF, c: mixc(lin(B.crown[0], 0.9), lin(B.crown[1], 0.9), rnd()), k: 0.08, f: 2.2, fl: FL_DOWN });
      }
      b.ext = { up: 4.1, side: 1.3 }; b.capAmt = 1; b.capLeaf = true;
    } else if (kind === 'crag') {
      rock(b, rnd, [-0.15, 1.0, 0], [0.55, 1.15, 0.5], mixc(rk, rd, 0.2), cap, { rot: [0, rnd(), -0.12] });
      rock(b, rnd, [0.4, 0.6, 0.15], [0.42, 0.7, 0.42], mixc(rk, rd, 0.45), cap, { rot: [0, rnd(), 0.2] });
      rock(b, rnd, [-0.6, 0.35, 0.2], [0.4, 0.4, 0.38], rk, cap);
      rock(b, rnd, [0.2, 1.75, -0.05], [0.3, 0.5, 0.3], rk, cap, { rot: [0, rnd(), 0.1] });
      b.ext = { up: 2.6, side: 1.25 }; b.capAmt = 0.8;
    } else if (kind === 'obelisk') {
      box(b, [0, 1.3, 0], [0.32, 1.3, 0.32], 0.03, { m: M.STONE, c: rd, k: 0.02, f: 0.3, rot: [0, 0.6, 0] });
      cone(b, [0, 2.55, 0], [0, 3.0, 0], 0.3, 0.02, { m: M.STONE, c: rd, k: 0.04, f: 0.2 });
      box(b, [0, 0.12, 0], [0.55, 0.12, 0.55], 0.03, { m: M.STONE, c: mixc(rk, rd, 0.5), k: 0.02, f: 0.6, rot: [0, 0.6, 0] });
      for (i = 0; i < 4; i++) { var gy = 0.7 + i * 0.5, sd = i % 2 ? 1 : -1; cone(b, [0, gy, 0.34], [0, gy + 0.3, 0.34], 0.025, 0.025, { m: M.GLOW, c: lin(B.glow), k: 0.004 }); cone(b, [0, gy + 0.15, 0.34], [sd * 0.12, gy + 0.27, 0.34], 0.022, 0.022, { m: M.GLOW, c: lin(B.glow), k: 0.004 }); }
      b.ext = { up: 3.2, side: 1.25 }; b.capAmt = 0.3; b.glowCol = B.glow;
    } else if (kind === 'pillar') {
      var brk = 1.4 + rnd() * 0.6;
      cone(b, [0, 0.25, 0], [0, brk, 0], 0.38, 0.36, { m: M.STONE, c: mixc(rk, rd, 0.3), k: 0.02, f: 0.6, fl: FL_UP });
      box(b, [0, 0.12, 0], [0.6, 0.12, 0.6], 0.03, { m: M.STONE, c: mixc(rk, rd, 0.4), k: 0.02, f: 0.6 });
      box(b, [0.05, brk + 0.05, 0], [0.5, 0.25, 0.5], 0.0, { op: 'sub', m: M.STONE, c: rd, k: 0.05, rot: [0.5, 0.3, 0.35] });
      for (i = 0; i < 3; i++) { a = rnd() * TAU; rock(b, rnd, [cos(a) * 0.85, 0.1, sin(a) * 0.6], [0.2, 0.15, 0.18], rk, cap, { k: 0.03 }); }
      b.ext = { up: 2.4, side: 1.25 }; b.capAmt = 0.7;
    }
    return b;
  }

  // A canopy crown seen from above (pitch near vertical): leaf clumps on a dome, or bare branches for dead zones.
  function crown(kind, rnd, B) {
    var b = rig(), i, a, d;
    if (kind === 'dead') {
      var bark = lin(B.crown[1]);
      for (i = 0; i < 8; i++) {
        a = rnd() * TAU; var L = 0.6 + rnd() * 0.35, p1 = [cos(a) * L, 0.1 + rnd() * 0.15, sin(a) * L];
        chain(b, [[0, 0.3, 0], [cos(a) * L * 0.5, 0.25, sin(a) * L * 0.5], p1], 0.12, 0.02, { m: M.BARK, c: bark, k: 0.05, fl: a, f: 0.8 });
        for (var t = 0; t < 2; t++) { var a2 = a + (rnd() - 0.5) * 1.6, u = 0.4 + rnd() * 0.4, q0 = [cos(a) * L * u, 0.25, sin(a) * L * u]; cone(b, q0, add(q0, [cos(a2) * 0.35, 0.05, sin(a2) * 0.35]), 0.04, 0.01, { m: M.BARK, c: lin(B.crown[0]), k: 0.03 }); }
      }
      return b;
    }
    ell(b, [0, 0.2, 0], [0.72, 0.38, 0.72], { m: M.LEAF, c: lin(B.crown[0], 0.8), k: 0.05, f: 2 });
    for (i = 0; i < 26; i++) {
      a = rnd() * TAU; d = Math.sqrt(rnd()) * 0.68;
      var rr = 0.16 + rnd() * 0.14, y = 0.2 + Math.sqrt(max(0, 0.5 - d * d)) * 0.55;
      sph(b, [cos(a) * d, y, sin(a) * d], rr, { m: M.LEAF, c: mixc(lin(B.crown[0], 0.8), lin(B.crown[1], 0.75), 0.2 + rnd() * 0.8), k: 0.12, f: 2.2 });
    }
    paint(b, [-0.4, 0.8, 0.4], [0.6, 0.4, 0.6], lin(B.crown[2], 0.7), 0.3, 0.3);
    return b;
  }

  // Packs a rig for the shader: 5 vec4 per primitive (shapes first, then paints). Returns counts and the bound.
  var STRIDE = 20;
  function pack(b, maxP, out) {
    var list = b.s.concat(b.p), n = Math.min(list.length, maxP), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    out = out || new Float32Array(maxP * STRIDE);
    out.fill(0);
    for (var i = 0; i < n; i++) {
      var p = list[i], o = i * STRIDE, ex;
      out[o] = p.a[0]; out[o + 1] = p.a[1]; out[o + 2] = p.a[2]; out[o + 3] = p.t + 8 * p.op;
      out[o + 4] = p.b[0]; out[o + 5] = p.b[1]; out[o + 6] = p.b[2]; out[o + 7] = Math.max(1e-4, p.k);
      out[o + 8] = p.r1; out[o + 9] = p.r2;
      if (p.op === 2) { out[o + 10] = p.m; out[o + 11] = p.w; }
      else { out[o + 10] = p.m + Math.min(p.f, 3.99) / 4; out[o + 11] = p.fy; }
      out[o + 12] = p.c[0]; out[o + 13] = p.c[1]; out[o + 14] = p.c[2]; out[o + 15] = p.op === 2 ? 0 : p.fx;
      out[o + 16] = p.q[0]; out[o + 17] = p.q[1]; out[o + 18] = p.q[2]; out[o + 19] = p.q[3];
      if (p.op === 0 && i < b.s.length) { // the bound: the shape's centre and its largest reach
        var cs = p.t === 1 ? [p.a, p.b] : [p.a], R = p.t === 0 ? Math.max(p.b[0], p.b[1], p.b[2]) : p.t === 1 ? Math.max(p.r1, p.r2) :
          p.t === 2 ? Math.max(p.b[0], p.b[1]) + p.b[2] : p.t === 3 ? Math.sqrt(p.b[0] * p.b[0] + p.b[1] * p.b[1] + p.b[2] * p.b[2]) : p.r1 + p.r2;
        for (var j = 0; j < cs.length; j++) for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], cs[j][k] - R); hi[k] = Math.max(hi[k], cs[j][k] + R); }
      }
      void ex;
    }
    var nShapes = Math.min(b.s.length, n);
    return { data: out, n: nShapes, nt: n, lo: lo, hi: hi, over: list.length > maxP };
  }

  PB.Rigs = { M: M, creature: creature, prop: prop, crown: crown, pack: pack, STRIDE: STRIDE, FAM: FAM, EXTRAS: EXTRAS, lin: lin };
})(globalThis.PB = globalThis.PB || {});
