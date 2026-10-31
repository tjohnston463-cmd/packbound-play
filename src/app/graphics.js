// Presentation helpers: independent of simulation RNG, entities and character save schema.
(function (PB) {
  'use strict';
  var KEY = 'packbound.graphics.v1', motion = new WeakMap();
  // Auto-drop: quarter-second windows whose mean frame is slower than 45 fps add to a streak; faster windows drain it
  // at twice the rate, so jitter and a Hunt-sized dip never add up. Four seconds of streak selects Low.
  var SLOW_MS = 1000 / 45, STREAK_S = 4;
  function quality(value, auto) { return { value: value === 'Low' ? 'Low' : 'High', auto: auto !== false, bad: 0, elapsed: 0, frames: 0 }; }
  // Hidden-tab gaps and single stalls over 250 ms reset the evidence.
  function sample(q, ms) {
    if (!Number.isFinite(ms) || ms <= 0 || ms > 250) { q.bad = q.elapsed = q.frames = 0; return false; }
    if (q.value === 'Low' || q.auto === false) return false;
    q.elapsed += ms; q.frames++;
    if (q.elapsed < 250) return false;
    var s = q.elapsed / 1000;
    q.bad = q.elapsed / q.frames > SLOW_MS ? q.bad + s : Math.max(0, q.bad - 2 * s);
    q.elapsed = q.frames = 0;
    if (q.bad >= STREAK_S) { q.value = 'Low'; return true; }
    return false;
  }
  // Stored presentation settings: {quality, auto}. An old record without `auto` means auto-drop on.
  function loadSettings(storage) {
    try {
      var s = JSON.parse(storage.getItem(KEY));
      return { quality: s && s.quality === 'Low' ? 'Low' : 'High', auto: !(s && s.auto === false) };
    } catch (_) { return { quality: 'High', auto: true }; }
  }
  function load(storage) { return loadSettings(storage).quality; }
  function save(storage, value, auto) {
    try { storage.setItem(KEY, JSON.stringify({ quality: value === 'Low' ? 'Low' : 'High', auto: auto !== false })); return true; } catch (_) { return false; }
  }
  // The glow-atlas color nearest an effect color (sprites.js bakes these seven).
  var GLOWS = { gold: [255, 210, 122], white: [255, 255, 255], frost: [160, 220, 255], ember: [255, 122, 42],
                green: [140, 220, 110], purple: [190, 140, 255], red: [255, 80, 60] };
  function glowName(color) {
    var r = color >> 16 & 255, g = color >> 8 & 255, b = color & 255, best = 'white', bd = Infinity;
    for (var k in GLOWS) {
      var c = GLOWS[k], d = (r - c[0]) * (r - c[0]) + (g - c[1]) * (g - c[1]) + (b - c[2]) * (b - c[2]);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  function interpolate(a, b, alpha) { return Math.abs(b - a) > 160 ? b : a + (b - a) * Math.max(0, Math.min(1, alpha)); }
  function ease(a, b, rate, dt) { return a + (b - a) * (1 - Math.exp(-rate * Math.max(0, dt))); }
  function record(e) {
    var p = motion.get(e);
    if (!p) { p = { px: e.x, py: e.y, x: e.x, y: e.y }; motion.set(e, p); }
    return p;
  }
  function snapshot(e) { var p = record(e); p.px = e.x; p.py = e.y; }
  function capture(w) { snapshot(w.player); for (var i = 0; i < w.ents.length; i++) snapshot(w.ents[i]); }
  function pose(e, alpha) {
    var p = record(e);
    // Snap both axes for a teleport, without writing previous positions into the sim.
    var snap = Math.hypot(e.x - p.px, e.y - p.py) > 160;
    p.x = snap ? e.x : interpolate(p.px, e.x, alpha); p.y = snap ? e.y : interpolate(p.py, e.y, alpha);
    return p;
  }
  // Pure render projection of the Hunt path. Parity with Chorus.runnerPos is tested; output is reused.
  function runnerPose(h, r, time, out) {
    var elapsed = time - r.delay, d = -700 + 450 * elapsed;
    if (elapsed < 0 || d > 700) return false;
    var ux = Math.cos(h.angle), uy = Math.sin(h.angle);
    out.x = h.ox + ux * d - uy * r.lane; out.y = h.oy + uy * d + ux * r.lane;
    return true;
  }
  PB.Graphics = { KEY: KEY, SLOW_MS: SLOW_MS, STREAK_S: STREAK_S, quality: quality, sample: sample, load: load, loadSettings: loadSettings, save: save, glowName: glowName,
    interpolate: interpolate, ease: ease, capture: capture, pose: pose, runnerPose: runnerPose };
})(globalThis.PB = globalThis.PB || {});
