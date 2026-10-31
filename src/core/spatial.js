// Uniform-grid spatial hash rebuilt every step. Linked lists in typed arrays: no per-step garbage.
(function (PB) {
  'use strict';

  function SpatialHash(width, height, cell, capacity) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.head = new Int32Array(this.cols * this.rows);
    this.next = new Int32Array(capacity);
    this.ref = new Array(capacity);
    this.count = 0;
    this.capacity = capacity;
    this.maxR = 0; // largest radius inserted since clear(): widens the cell scan so big bodies are found
    this.head.fill(-1);
  }

  SpatialHash.prototype.clear = function () {
    this.head.fill(-1);
    for (var i = 0; i < this.count; i++) this.ref[i] = null;
    this.count = 0;
    this.maxR = 0;
  };

  SpatialHash.prototype.cellOf = function (x, y) {
    var cx = Math.min(this.cols - 1, Math.max(0, (x / this.cell) | 0));
    var cy = Math.min(this.rows - 1, Math.max(0, (y / this.cell) | 0));
    return cx + cy * this.cols;
  };

  SpatialHash.prototype.insert = function (e) {
    if (this.count >= this.capacity) return false;
    var i = this.count++;
    var c = this.cellOf(e.x, e.y);
    this.ref[i] = e;
    if ((e.r || 0) > this.maxR) this.maxR = e.r;
    this.next[i] = this.head[c];
    this.head[c] = i;
    return true;
  };

  // Fills `out` with entities whose centre is within r (+ their own radius) of (x, y).
  // `filter(e)` is optional. Returns the count; out.length is set to the count.
  SpatialHash.prototype.queryRadius = function (x, y, r, out, filter) {
    var n = 0, cs = this.cell, s = r + this.maxR;
    var x0 = Math.max(0, ((x - s) / cs) | 0), x1 = Math.min(this.cols - 1, ((x + s) / cs) | 0);
    var y0 = Math.max(0, ((y - s) / cs) | 0), y1 = Math.min(this.rows - 1, ((y + s) / cs) | 0);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        for (var i = this.head[cx + cy * this.cols]; i >= 0; i = this.next[i]) {
          var e = this.ref[i];
          var dx = e.x - x, dy = e.y - y, rr = r + (e.r || 0);
          if (dx * dx + dy * dy <= rr * rr && (!filter || filter(e))) out[n++] = e;
        }
      }
    }
    out.length = n;
    return n;
  };

  // Nearest entity passing filter within r, or null. Ties break on lower id (determinism).
  SpatialHash.prototype.nearest = function (x, y, r, filter) {
    var best = null, bd = Infinity, cs = this.cell;
    var x0 = Math.max(0, ((x - r) / cs) | 0), x1 = Math.min(this.cols - 1, ((x + r) / cs) | 0);
    var y0 = Math.max(0, ((y - r) / cs) | 0), y1 = Math.min(this.rows - 1, ((y + r) / cs) | 0);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        for (var i = this.head[cx + cy * this.cols]; i >= 0; i = this.next[i]) {
          var e = this.ref[i];
          if (filter && !filter(e)) continue;
          var dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
          if (d <= r * r && (d < bd || (d === bd && best && e.id < best.id))) { bd = d; best = e; }
        }
      }
    }
    return best;
  };

  PB.SpatialHash = SpatialHash;
})(globalThis.PB = globalThis.PB || {});
