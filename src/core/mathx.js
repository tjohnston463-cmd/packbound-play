// Pure math helpers shared by AI, formations and render. No state.
(function (PB) {
  'use strict';
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { var lo = Math.min(a, b), hi = Math.max(a, b); return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
  // Signed shortest turn from a to b, in (-PI, PI].
  function angleDiff(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
  function easeOutBack(t) { var c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  PB.M = { TAU: TAU, clamp: clamp, lerp: lerp, dist2: dist2, angleTo: angleTo, angleDiff: angleDiff, easeOutCubic: easeOutCubic, easeOutBack: easeOutBack };
})(globalThis.PB = globalThis.PB || {});
