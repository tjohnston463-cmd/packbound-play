// Seeded RNG (mulberry32) with named sub-streams. Never use Math.random in src/core|data|sim.
(function (PB) {
  'use strict';

  function hashStr(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function deriveSeed(seed, label) {
    var h = hashStr(String(label)) ^ Math.imul(seed >>> 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function Rng(seed) { this.s = seed >>> 0; }
  Rng.prototype.next = function () {
    var t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.int = function (lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); };
  Rng.prototype.range = function (lo, hi) { return lo + this.next() * (hi - lo); };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.weighted = function (items, weightOf) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += Math.max(0, weightOf(items[i]));
    if (total <= 0) return null;
    var r = this.next() * total;
    for (i = 0; i < items.length; i++) {
      r -= Math.max(0, weightOf(items[i]));
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  };
  Rng.prototype.fork = function (label) { return new Rng(deriveSeed(this.s, label)); };
  Rng.prototype.getState = function () { return this.s; };
  Rng.prototype.setState = function (s) { this.s = s >>> 0; };

  PB.Rng = Rng;
  PB.hashStr = hashStr;
  PB.deriveSeed = deriveSeed;
})(globalThis.PB = globalThis.PB || {});
