// Juice (spec §14): presentation-only state fed by sim events. DOM-free so node can test it; render.js draws it.
// Particles are a struct-of-arrays ring buffer capped at 2500 (a new particle replaces the oldest when full);
// damage numbers are a pool of 120 that merge hits on one target within 100 ms; shake uses a trauma model.
(function (PB) {
  'use strict';
  // DECALS_HIGH: ground marks kept on High (Low keeps 24); SPARK_BUDGET: live particles above which hits stop sparking.
  var DECALS_HIGH = 32, SPARK_BUDGET = 450, CAP = 2500, NUMBERS = 120, MERGE = 0.1, NUM_LIFE = 0.7, NUM_RISE = 40, DECAY = 1.6, MAX_SHAKE = 12, MAX_ROT = 0.6 * Math.PI / 180;
  var C = {
    gold: 0xffcc44, thorn: 0x7fd36f, red: 0xe0402f, blood: 0xb02a2a, mote: 0x9fc8ff, dust: 0xb8a888, leaf: 0x6ab04a,
    white: 0xffffff, purple: 0xb88cff, poison: 0x8fd34a
  };
  var ESSENCE = { rot: 0x8fae3a, ember: 0xff7a2a, frost: 0x9fd8ff, storm: 0xf5e46a, stone: 0xa89a88 };
  var TYPE = { wolf: 0xa9b4bf, raven: 0x8a8ec0, bear: 0xd6ecf5, vine: 0x6ab04a, spirit: 0xffd27a };

  function create() {
    var j = {
      fx: [], decals: [], fxHead: 0, decalHead: 0, decalLimit: DECALS_HIGH, low: false, kicks: new Map(),
      cap: CAP, limit: CAP, n: 0, head: 0, prints: [], swirls: [],
      x: new Float32Array(CAP), y: new Float32Array(CAP), vx: new Float32Array(CAP), vy: new Float32Array(CAP),
      life: new Float32Array(CAP), max: new Float32Array(CAP), size: new Float32Array(CAP), grav: new Float32Array(CAP),
      color: new Uint32Array(CAP),
      numbers: [], trauma: 0, flashes: new Map(), rings: [], swings: [], vignette: 0, screenFlash: 0, time: 0,
      settings: { shake: 1, numbers: true }, rng: new PB.Rng(0x5eed)
    };
    for (var i = 0; i < NUMBERS; i++) j.numbers.push({ active: false, id: -1, x: 0, y: 0, amount: 0, crit: false, t: 0, last: 0, kind: 'hit' });
    for (var f = 0; f < 96; f++) j.fx.push({ life: 0, max: 1, x: 0, y: 0, kind: 0, color: 0, radius: 0, unit: '', angle: 0 });
    for (var d = 0; d < 128; d++) j.decals.push({ life: 0, max: 10, x: 0, y: 0, kind: 0, angle: 0, size: 1, color: 0 });
    return j;
  }

  // opts: {speed, life, size, spread (radians, default full circle), angle, up (px/s^2 upward drift), jitter}
  function emit(j, x, y, count, color, opts) {
    opts = opts || {};
    var speed = opts.speed != null ? opts.speed : 120, life = opts.life || 0.5, size = opts.size || 3;
    var spread = opts.spread != null ? opts.spread : Math.PI * 2, base = opts.angle || 0, rng = j.rng;
    for (var k = 0; k < count; k++) {
      var i = j.head;
      j.head = (j.head + 1) % j.limit;
      if (!(j.life[i] > 0)) j.n++;
      var a = base + (rng.next() - 0.5) * spread, s = speed * (0.4 + 0.6 * rng.next());
      j.x[i] = x + (opts.jitter ? (rng.next() - 0.5) * opts.jitter : 0); j.y[i] = y + (opts.jitter ? (rng.next() - 0.5) * opts.jitter : 0);
      j.vx[i] = Math.cos(a) * s; j.vy[i] = Math.sin(a) * s;
      j.life[i] = j.max[i] = life * (0.7 + 0.3 * rng.next());
      j.size[i] = size; j.grav[i] = opts.up || 0; j.color[i] = color;
    }
  }

  // Low-end mode halves the live particle cap; particles above the new cap go at once.
  function setLimit(j, lim) {
    j.limit = Math.max(1, Math.min(CAP, lim | 0));
    for (var i = j.limit; i < CAP; i++) if (j.life[i] > 0) { j.life[i] = 0; j.n--; }
    if (j.head >= j.limit) j.head = 0;
  }

  function setQuality(j, value) {
    j.low = value === 'Low'; setLimit(j, j.low ? CAP / 2 : CAP);
    j.decalLimit = j.low ? 24 : DECALS_HIGH; j.decalHead %= j.decalLimit;
    for (var i = j.decalLimit; i < j.decals.length; i++) j.decals[i].life = 0;
    if (j.low) for (var k = 0; k < j.fx.length; k++) j.fx[k].life = 0;
  }
  function effect(j, x, y, kind, color, radius, life, unit) {
    if (j.low) return;
    var f = j.fx[j.fxHead]; j.fxHead = (j.fxHead + 1) % j.fx.length;
    f.x = x; f.y = y; f.kind = kind; f.color = color; f.radius = radius;
    f.life = f.max = life; f.unit = unit || ''; f.angle = j.rng.next() * Math.PI * 2;
  }
  function decal(j, x, y, kind, color, size) {
    var d = j.decals[j.decalHead]; j.decalHead = (j.decalHead + 1) % j.decalLimit;
    d.x = x; d.y = y; d.kind = kind; d.color = color; d.size = size;
    d.angle = j.rng.next() * Math.PI * 2; d.life = d.max = 9 + j.rng.next() * 5;
  }
  var SPARK = { speed: 260, life: 0.32, size: 2, spread: 1.1, angle: 0 };
  var BURST = { speed: 185, life: 0.85, size: 2, up: 55, jitter: 20 };
  var TRAIL = { speed: 16, life: 0.5, size: 2, up: 22, jitter: 10 };
  // Event-driven additions use preallocated slots. No extra particles on Low.
  function extraEvent(j, ev, world) {
    var p = world && world.player, x = ev.x == null ? (p ? p.x : 0) : ev.x, y = ev.y == null ? (p ? p.y : 0) : ev.y;
    var hit = (ev.type === 'hit' || ev.type === 'crit') && ev.amount > 0 && !ev.dot;
    if (hit) {
      j.kicks.set(ev.src, 0.22);
      if (!j.low && j.n < SPARK_BUDGET && !(world && world.hunt)) { // a Hunt lands hundreds of hits a second: sparks stop past the budget
        var src = world && world.byId && world.byId[ev.src];
        SPARK.angle = src ? Math.atan2(y - src.y, x - src.x) : 0;
        emit(j, x, y, ev.type === 'crit' ? 18 : 7, ev.type === 'crit' ? C.gold : C.white, SPARK);
      }
      if (ev.type === 'crit') effect(j, x, y, 1, C.gold, 90, 0.35);
      if (j.rng.next() < 0.24) decal(j, x, y, 2, C.dust, 13);
    }
    if (ev.type === 'kill') {
      effect(j, x, y, 3, ev.team === 0 ? C.mote : C.gold, 45, 0.7, ev.unit);
      decal(j, x, y, 0, PB.ENEMIES[ev.unit] ? ESSENCE[PB.ENEMIES[ev.unit].essence] || C.blood : C.leaf, 18);
    }
    if (ev.type === 'root' || ev.type === 'sprout') effect(j, x, y, 2, C.leaf, 32, 0.8);
    if (ev.type === 'summon' || ev.type === 'fusion' || ev.type === 'boss-cast') {
      var color = ev.type === 'boss-cast' ? C.red : ev.type === 'fusion' ? C.gold : TYPE[ev.unit] || C.mote;
      effect(j, x, y, 1, color, ev.type === 'fusion' ? 180 : ev.type === 'boss-cast' ? 130 : 75, ev.tele || 0.8);
      if (!j.low) emit(j, x, y, ev.type === 'fusion' ? 65 : 28, color, BURST);
      j.kicks.set(ev.id, 0.4);
    }
    if (ev.type === 'leap' || ev.type === 'charge' || ev.type === 'owlslam' || ev.type === 'bound') j.kicks.set(ev.id || 0, 0.3);
    if (ev.type === 'telegraph-hit' || ev.type === 'volatile' || ev.type === 'quake') decal(j, x, y, 1, C.dust, Math.min(65, ev.radius || 28));
  }
  // Called at a fixed presentation cadence, not once per rendered frame per entity.
  function trails(j, world, dt) {
    if (j.low || world.hunt) return; // the Hunt's moonlight replaces trails (and hit sparks) while it runs
    j.trailT = (j.trailT || 0) + dt;
    if (j.trailT < 0.07) return;
    j.trailT %= 0.07;
    for (var i = 0; i < world.ents.length; i++) {
      var e = world.ents[i];
      if (!e.dead && e.team === 0 && (e.infusion || e.aura)) emit(j, e.x, e.y, 2, ESSENCE[e.infusion] || C.gold, TRAIL);
    }
  }

  // Pawprints: alternating left/right prints every `step` px from (x, y) along (dx, dy).
  var PRINT_LIFE = 1.4;
  function prints(j, x, y, dx, dy, n, step) {
    var L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    for (var i = 0; i < n; i++) {
      var side = i % 2 ? 5 : -5;
      j.prints.push({ x: x + ux * step * i - uy * side, y: y + uy * step * i + ux * side, angle: Math.atan2(uy, ux), t: -i * 0.03, life: PRINT_LIFE });
    }
    if (j.prints.length > 120) j.prints.splice(0, j.prints.length - 120);
  }

  function numberRise(age) { var k = Math.min(1, Math.max(0, age / NUM_LIFE)); return NUM_RISE * PB.M.easeOutCubic(k); }

  function addNumber(j, id, x, y, amount, crit, now, kind) {
    var nums = j.numbers, i, n, free = null, oldest = null;
    for (i = 0; i < nums.length; i++) {
      n = nums[i];
      if (n.active && n.id === id && now - n.last < MERGE - 1e-9 && n.kind === (kind || 'hit')) {
        n.amount += amount; n.crit = n.crit || !!crit; n.last = now; n.x = x; n.y = y;
        return n;
      }
      if (!n.active) { if (!free) free = n; } else if (!oldest || n.t < oldest.t) oldest = n;
    }
    n = free || oldest;
    n.active = true; n.id = id; n.x = x; n.y = y; n.amount = amount; n.crit = !!crit; n.t = now; n.last = now; n.kind = kind || 'hit'; n.label = '';
    return n;
  }

  function addTrauma(j, v) { j.trauma = Math.min(1, j.trauma + v); }

  function update(j, dt) {
    j.time += dt;
    for (var f = 0; f < j.fx.length; f++) j.fx[f].life = Math.max(0, j.fx[f].life - dt);
    for (var d = 0; d < j.decalLimit; d++) j.decals[d].life = Math.max(0, j.decals[d].life - dt);
    j.kicks.forEach(function (v, id) { if (v <= dt) j.kicks.delete(id); else j.kicks.set(id, v - dt); });
    var damp = Math.pow(0.9, dt * 60);
    for (var i = 0; i < CAP; i++) {
      if (!(j.life[i] > 0)) continue;
      j.life[i] -= dt;
      if (j.life[i] <= 0) { j.life[i] = 0; j.n--; continue; }
      j.vx[i] *= damp; j.vy[i] = j.vy[i] * damp - j.grav[i] * dt;
      j.x[i] += j.vx[i] * dt; j.y[i] += j.vy[i] * dt;
    }
    for (var k = 0; k < j.numbers.length; k++) { var n = j.numbers[k]; if (n.active && j.time - n.t >= NUM_LIFE - 1e-9) n.active = false; }
    j.trauma = Math.max(0, j.trauma - DECAY * dt);
    if (j.trauma < 1e-9) j.trauma = 0;
    j.flashes.forEach(function (v, id) { v -= dt; if (v <= 0) j.flashes.delete(id); else j.flashes.set(id, v); });
    for (var r = j.rings.length - 1; r >= 0; r--) { j.rings[r].t += dt; if (j.rings[r].t >= j.rings[r].life) j.rings.splice(r, 1); }
    for (var s = j.swings.length - 1; s >= 0; s--) { j.swings[s].t += dt; if (j.swings[s].t >= j.swings[s].life) j.swings.splice(s, 1); }
    for (var q = j.prints.length - 1; q >= 0; q--) { j.prints[q].t += dt; if (j.prints[q].t >= j.prints[q].life) j.prints.splice(q, 1); }
    for (var w = j.swirls.length - 1; w >= 0; w--) { j.swirls[w].t += dt; if (j.swirls[w].t >= j.swirls[w].life) j.swirls.splice(w, 1); }
    j.vignette = Math.max(0, j.vignette - dt);
    j.screenFlash = Math.max(0, j.screenFlash - dt);
  }

  // Smooth pseudo-noise in [-1, 1] from layered sines; seeded per axis.
  function noise(t, seed) { return 0.5 * Math.sin(t * 1.0 + seed * 1.3) + 0.3 * Math.sin(t * 2.3 + seed * 2.7) + 0.2 * Math.sin(t * 5.1 + seed * 4.1); }

  function shakeOffset(j, t, out) {
    out = out || { x: 0, y: 0, rot: 0 };
    var s = j.settings.shake;
    if (!(j.trauma > 0) || !(s > 0)) { out.x = out.y = out.rot = 0; return out; }
    var k = j.trauma * j.trauma * Math.min(1, s), a = t * 23;
    out.x = MAX_SHAKE * k * noise(a, 1); out.y = MAX_SHAKE * k * noise(a, 2); out.rot = MAX_ROT * k * noise(a, 3); return out;
  }

  function ring(j, x, y, r0, r1, life, color, width) { j.rings.push({ x: x, y: y, r0: r0, r1: r1, t: 0, life: life, color: color, width: width || 3 }); }

  function hitColor(world, id) {
    var e = world && world.byId ? world.byId[id] : null;
    if (e && e.team === 1) { var d = PB.ENEMIES[e.type] || PB.BOSSES[e.type]; return (d && ESSENCE[d.essence]) || C.blood; }
    return C.blood;
  }

  function number(j, ev, crit, kind) { if (j.settings.numbers) addNumber(j, ev.dst, ev.x, ev.y, ev.amount, crit, j.time, kind); }

  // The per-event table from spec §14 (sound lives in audio.js).
  function onEvent(j, ev, world) {
    extraEvent(j, ev, world);
    var p = world && world.player;
    switch (ev.type) {
      case 'leech':
        number(j, ev, false, 'dot');
        return;
      case 'ward':
        addNumber(j, ev.dst, ev.x, ev.y - 16, 0, false, j.time, 'ward');
        return;
      case 'ward-break':
        ring(j, ev.x, ev.y, 8, 32, 0.28, ev.element === 'frost' ? 0x9fd8ff : ev.element === 'flame' ? 0xff7a3a : ev.element === 'spark' ? 0xf5e46a : 0x8fd34a, 2);
        return;
      case 'bloodpack':
        ring(j, ev.x, ev.y, 14, 70, 0.4, 0xffd678, 3);
        emit(j, ev.x, ev.y, 12, 0xffd678, { speed: 120, life: 0.45, size: 3 });
        return;
      case 'pack-break':
        addTrauma(j, ev.mad ? 0.16 : 0.08);
        ring(j, ev.x, ev.y, 10, ev.mad ? 64 : 40, 0.3, ev.mad ? 0xff5a3a : 0xcbb98a, 3);
        return;
      case 'slaughter':
        if (ev.milestone) {
          addTrauma(j, 0.24);
          ring(j, ev.x, ev.y, 12, 90 + Math.min(40, (ev.n || 0) * 3), 0.45, ev.n >= 15 ? 0xffe08a : ev.n >= 10 ? 0xff5a3a : 0xffb070, 4);
          emit(j, ev.x, ev.y, 18, 0xffb070, { speed: 220, life: 0.45, size: 4 });
          var banner = addNumber(j, -1000 - (ev.n || 0), ev.x, ev.y - 28, ev.n || 0, true, j.time, 'slaughter');
          if (banner) banner.label = ev.name || ('×' + ev.n);
        } else if ((ev.n || 0) >= 2) {
          ring(j, ev.x, ev.y, 6, 18 + Math.min(24, ev.n * 2), 0.2, 0xcbb98a, 2);
        }
        return;
      case 'hit':
      case 'crit':
        if (ev.crush > 0) addNumber(j, ev.dst, ev.x, ev.y - 12, ev.crush, false, j.time, 'crush');
        if (ev.dot) { number(j, ev, false, 'dot'); return; }
        if (ev.absorbed > 0) ring(j, ev.x, ev.y, 8, 22, 0.2, C.mote, 2); // a shield took some or all of it
        if (!(ev.amount > 0)) { j.flashes.set(ev.dst, 0.04); return; } // fully absorbed: no number
        if (ev.dstKind === 'player') {
          addTrauma(j, 0.2); j.vignette = 0.15; j.flashes.set(0, 0.06);
          emit(j, ev.x, ev.y, 8, C.red, { speed: 150, life: 0.45 });
          number(j, ev, false, 'hurt');
          return;
        }
        if (ev.srcKind === 'player') { // the hunter's own swing
          var bite = ev.element === 'flame' ? 0xff7a3a : ev.element === 'frost' ? 0x9fd8ff : ev.element === 'spark' ? 0xf5e46a : ev.element === 'blight' ? C.poison : C.thorn;
          var hot = world && PB.Slaughter && PB.Slaughter.stacks(world) >= 5;
          j.flashes.set(ev.dst, ev.deadly ? 0.1 : 0.06); addTrauma(j, (ev.deadly || ev.crush ? 0.14 : 0.05) + (hot ? 0.06 : 0));
          emit(j, ev.x, ev.y, ev.deadly ? 10 : 6, ev.deadly ? C.gold : bite, { speed: ev.deadly ? 240 : 190, life: 0.35, size: ev.deadly ? 4 : 3 });
          if (ev.crush) ring(j, ev.x, ev.y, 8, 36, 0.22, 0xff7a3a, 3);
          number(j, ev, ev.type === 'crit' || !!ev.deadly, ev.element || 'hit');
          return;
        }
        if (ev.type === 'crit') {
          j.flashes.set(ev.dst, 0.08); addTrauma(j, 0.08);
          ring(j, ev.x, ev.y, 6, 30, 0.25, C.gold, 3);
          emit(j, ev.x, ev.y, 10, C.gold, { speed: 220, life: 0.4 });
        } else {
          j.flashes.set(ev.dst, 0.06);
          emit(j, ev.x, ev.y, 4, ev.dstKind === 'summon' ? C.blood : hitColor(world, ev.dst), { speed: 140, life: 0.3 });
        }
        number(j, ev, ev.type === 'crit', ev.dstKind === 'summon' ? 'hurt' : 'hit');
        return;
      case 'maul':
        j.flashes.set(ev.dst, 0.08); addTrauma(j, 0.18);
        emit(j, ev.x, ev.y, 14, C.dust, { speed: 160, life: 0.5, size: 4 });
        ring(j, ev.x, ev.y, 10, 60, 0.3, C.dust, 4);
        return;
      case 'kill':
        if (ev.team === 0) { // a summon falls: a spirit wisp rises
          addTrauma(j, 0.06);
          emit(j, ev.x, ev.y, 16, C.mote, { speed: 40, life: 1.2, up: 60, jitter: 16, size: 3 });
          ring(j, ev.x, ev.y, 4, 22, 0.5, C.mote, 2);
          return;
        }
        if (ev.elite || ev.boss) {
          addTrauma(j, 0.3);
          emit(j, ev.x, ev.y, 30, hitColor(world, ev.dst), { speed: 280, life: 0.7, size: 4 });
          ring(j, ev.x, ev.y, 10, 120, 0.45, C.white, 4);
        } else {
          addTrauma(j, 0.05);
          emit(j, ev.x, ev.y, 12, PB.ENEMIES[ev.unit] ? ESSENCE[PB.ENEMIES[ev.unit].essence] || C.blood : C.blood, { speed: 200, life: 0.5 });
          ring(j, ev.x, ev.y, 6, 32, 0.35, 0xffdc96, 3);
        }
        return;
      case 'summon':
        ring(j, ev.x, ev.y, 4, 34, 0.45, TYPE[ev.unit] || C.white, 3);
        emit(j, ev.x, ev.y, 12, TYPE[ev.unit] || C.white, { speed: 90, life: 0.7, up: 30 });
        return;
      case 'dismiss':
      case 'fade':
        emit(j, ev.x, ev.y, 10, TYPE[ev.unit] || C.mote, { speed: 40, life: 0.8, up: 50, jitter: 12 });
        return;
      case 'command':
        if (p) ring(j, p.x, p.y, 14, 70, 0.35, 0xe6dcaa, 2);
        return;
      case 'thornlash':
        var lashHot = world && PB.Slaughter && PB.Slaughter.stacks(world) >= 5;
        j.swings.push({ x: ev.x, y: ev.y, angle: ev.angle, t: 0, life: (ev.claw ? 0.2 : 0.16) * (lashHot ? 1.35 : 1), hit: ev.hit, claw: !!ev.claw });
        return;
      case 'zeal':
        j.swings.push({ x: ev.x, y: ev.y, angle: ev.angle, t: 0, life: 0.22, hit: ev.hit, zeal: true, strikes: ev.strikes || 1 });
        if (ev.hit) ring(j, ev.x, ev.y, 18, 78, 0.28, 0xffe0a0, 3);
        return;
      case 'bonespear':
        j.swings.push({ x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, bolt: false, color: '#f4efe2', t: 0, life: 0.18, hit: ev.hit });
        if (ev.hit) ring(j, ev.x2, ev.y2, 6, 28, 0.25, 0xf4efe2, 2);
        return;
      case 'fireball':
        ring(j, ev.x, ev.y, 10, ev.radius || 74, 0.32, 0xff7a2a, 4);
        emit(j, ev.x, ev.y, 16, 0xff7a2a, { speed: 160, life: 0.4 });
        return;
      case 'fury':
        j.swings.push({ x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, bolt: false, color: '#e6c56a', t: 0, life: 0.16, hit: ev.hit });
        (ev.bolts || []).forEach(function (b) {
          j.swings.push({ x: b.x, y: b.y, x2: b.x2, y2: b.y2, bolt: true, t: 0, life: 0.2, hit: true });
        });
        return;
      case 'whirl':
        j.swings.push({ x: ev.x, y: ev.y, t: 0, life: 0.24, hit: ev.hit, whirl: true, radius: ev.radius || 72, stacks: ev.stacks || 1 });
        if (ev.hit) ring(j, ev.x, ev.y, 16, ev.radius || 72, 0.3, 0xffb060, 4);
        return;
      case 'zone-wake':
        ring(j, ev.x, ev.y, 10, 110, 0.45, ev.zone === 1 ? 0xe07030 : ev.zone === 2 ? 0x9fc6de : ev.zone === 3 ? 0xe3d36b : ev.zone === 4 ? 0x9b5ac2 : 0x6a8f4a, 3);
        return;
      case 'bound': // dust and a run of pawprints along the 180px dash
        emit(j, ev.x, ev.y, 6, C.dust, { speed: 30, life: 0.6, size: 3, jitter: 10 });
        prints(j, ev.x, ev.y, ev.dx || 1, ev.dy || 0, 6, 32);
        return;
      case 'lunge':
        emit(j, ev.x, ev.y, 4, C.dust, { speed: 60, life: 0.35 });
        return;
      case 'root':
        emit(j, ev.x, ev.y, 6, C.leaf, { speed: 80, life: 0.6, size: 3 });
        ring(j, ev.x, ev.y, 18, 8, 0.4, C.leaf, 3);
        return;
      case 'taunt':
        ring(j, ev.x, ev.y, 20, 140, 0.5, 0xd6ecf5, 3);
        return;
      case 'telegraph-hit':
        if (ev.kind !== 'line') ring(j, ev.x, ev.y, ev.radius * 0.6, ev.radius, 0.25, 0xff7850, 3);
        emit(j, ev.x, ev.y, 8, 0xff7850, { speed: 160, life: 0.35 });
        if (ev.hits) addTrauma(j, 0.04);
        return;
      case 'linkcut':
        emit(j, ev.x, ev.y, 8, C.purple, { speed: 120, life: 0.5 });
        return;
      case 'levelup': { // at the body that levelled: the druid, or the summon's field body
        var lb = ev.who === 'summon' ? (world && world.byId[world.active[ev.indId]]) : p;
        if (lb && !lb.dead) { addTrauma(j, 0.1); emit(j, lb.x, lb.y, 40, C.gold, { speed: 240, life: 0.9 }); }
        return;
      }
      // C1: feeding, branch behaviors, infusions.
      case 'eat':
        emit(j, ev.x, ev.y, 10, ESSENCE[ev.essence] || C.blood, { speed: 70, life: 0.6, up: 20 });
        ring(j, ev.x, ev.y, 4, 20, 0.35, ESSENCE[ev.essence] || C.blood, 2);
        return;
      case 'leap':
      case 'charge':
        emit(j, ev.x, ev.y, 8, C.dust, { speed: 90, life: 0.4, size: 3 });
        ring(j, ev.x, ev.y, 6, 26, 0.25, C.dust, 2);
        return;
      case 'quake':
        addTrauma(j, 0.25);
        ring(j, ev.x, ev.y, 20, ev.radius || 130, 0.4, C.dust, 5);
        emit(j, ev.x, ev.y, 20, C.dust, { speed: 220, life: 0.5, size: 4 });
        return;
      case 'swallow':
        addTrauma(j, 0.12);
        emit(j, ev.x, ev.y, 18, C.leaf, { speed: 150, life: 0.6, size: 4 });
        ring(j, ev.x, ev.y, 40, 6, 0.35, C.leaf, 4);
        return;
      case 'intercept':
        ring(j, ev.x, ev.y, 8, 40, 0.3, C.gold, 3);
        emit(j, ev.x, ev.y, 12, C.gold, { speed: 160, life: 0.4 });
        return;
      case 'chain':
        j.swings.push({ x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, bolt: true, t: 0, life: 0.14 });
        emit(j, ev.x2, ev.y2, 5, ESSENCE.storm, { speed: 120, life: 0.25 });
        return;
      case 'freeze':
        emit(j, ev.x, ev.y, 10, ESSENCE.frost, { speed: 90, life: 0.6, size: 3 });
        return;
      case 'scar':
      case 'frenzy-free':
        if (p) { emit(j, p.x, p.y, 24, C.red, { speed: 160, life: 0.8 }); ring(j, p.x, p.y, 10, 60, 0.5, C.red, 3); }
        return;
      case 'chorus': // three voices on one target: a bright chord ring in the colors of the singers
        addTrauma(j, 0.1);
        (ev.tags || []).forEach(function (t, i) { ring(j, ev.x, ev.y, 8 + i * 6, 48 + i * 14, 0.5, TYPE[t] || C.gold, 3); });
        emit(j, ev.x, ev.y, 18, C.gold, { speed: 180, life: 0.6, up: 30 });
        return;
      case 'hunt':
        addTrauma(j, 0.35); j.screenFlash = Math.max(j.screenFlash, 0.06);
        if (p) ring(j, p.x, p.y, 20, 260, 0.7, 0xe8f0ff, 5);
        return;
      // C4: Skinwalk.
      case 'skinwalk':
      case 'skinwalk-end':
        ring(j, ev.x, ev.y, 40, 6, 0.4, C.gold, 3);
        emit(j, ev.x, ev.y, 18, C.mote, { speed: 80, life: 0.7, up: 30 });
        if (p) emit(j, p.x, p.y, 10, C.mote, { speed: 60, life: 0.6, up: 30 });
        return;
      case 'signature':
        addTrauma(j, ev.sig === 'slam' ? 0.25 : 0.1);
        if (ev.sig === 'slam') ring(j, ev.x, ev.y, 10, 110, 0.35, C.dust, 5);
        else if (ev.sig === 'pulse') ring(j, ev.x, ev.y, 10, 200, 0.6, C.leaf, 4);
        else j.swings.push({ x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, bolt: ev.sig === 'dive', t: 0, life: 0.2 });
        emit(j, ev.x, ev.y, 10, C.dust, { speed: 120, life: 0.4 });
        return;
      // C3: fusion abilities and the shrine.
      case 'blink':
        emit(j, ev.x, ev.y, 10, ESSENCE.storm, { speed: 120, life: 0.35 });
        emit(j, ev.x2, ev.y2, 10, ESSENCE.storm, { speed: 120, life: 0.35 });
        j.swings.push({ x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, bolt: true, t: 0, life: 0.18 });
        return;
      case 'owlleap':
        emit(j, ev.x, ev.y, 10, C.dust, { speed: 80, life: 0.4, size: 3 });
        return;
      case 'owlslam':
        addTrauma(j, 0.3);
        ring(j, ev.x, ev.y, 10, ev.radius || 90, 0.4, C.white, 5);
        emit(j, ev.x, ev.y, 24, C.dust, { speed: 240, life: 0.55, size: 4 });
        return;
      case 'cleave':
        ring(j, ev.x, ev.y, 10, ev.radius || 50, 0.2, C.dust, 3);
        return;
      case 'warghowl':
      case 'roar':
        addTrauma(j, 0.12);
        ring(j, ev.x, ev.y, 16, ev.radius || 160, 0.5, 0xd6ecf5, 3);
        return;
      case 'omen':
        ring(j, ev.x, ev.y, ev.radius || 260, 20, 0.6, C.purple, 3);
        return;
      case 'crows':
        emit(j, ev.x, ev.y, 14, 0x2a2a3a, { speed: 160, life: 0.6, size: 3 });
        return;
      case 'seed':
        emit(j, ev.x2, ev.y2, 4, C.leaf, { speed: 90, life: 0.3 });
        return;
      case 'evolve': // the evolve swirl: three gold arcs spinning in, then the burst below
        j.swirls.push({ x: ev.x != null ? ev.x : p ? p.x : 0, y: ev.y != null ? ev.y : p ? p.y : 0, t: 0, life: 1.1 });
        /* falls through */
      case 'revive':
      case 'fusion':
        addTrauma(j, 0.15);
        ring(j, ev.x != null ? ev.x : p ? p.x : 0, ev.y != null ? ev.y : p ? p.y : 0, 6, 80, 0.7, C.gold, 4);
        emit(j, ev.x != null ? ev.x : p ? p.x : 0, ev.y != null ? ev.y : p ? p.y : 0, 30, C.gold, { speed: 200, life: 0.9, up: 40 });
        return;
      case 'grove':
      case 'grove-take': {
        var gc = ev.cursed ? 0xe85a4a : ev.id === 'moon' ? 0x8eb6ff : ev.id === 'den' ? 0x7dff9a : ev.id === 'greed' ? 0xe2c27a : 0xffd44a;
        emit(j, ev.x, ev.y, ev.type === 'grove-take' ? 26 : 12, gc, { speed: 80, life: 0.8, up: 50 });
        if (ev.type === 'grove-take') addTrauma(j, ev.cursed ? 0.22 : 0.1);
        return;
      }
      case 'hearth-open':
        addTrauma(j, 0.18);
        ring(j, ev.x, ev.y, 12, 78, 0.55, 0xc9b6ff, 4);
        emit(j, ev.x, ev.y, 22, 0x9fc0ff, { speed: 70, life: 0.8, up: 50 });
        return;
      case 'keep':
        addTrauma(j, 0.22);
        ring(j, ev.x, ev.y, 8, 56, 0.45, 0xe8873a, 4);
        emit(j, ev.x, ev.y, 18, 0xe8873a, { speed: 90, life: 0.7, up: 80 });
        return;
      case 'drop': { // a column of motes in the rarity color; the beam itself is drawn by render.js from world.drops
        var rc = ev.rarity === 'unique' ? 0xe8873a : ev.rarity === 'set' ? 0x4ecf6a : ev.rarity === 'rare' ? 0xffd44a : ev.rarity === 'magic' ? 0x6f9cff : ev.rarity === 'rune' ? 0x7dcca0 : ev.rarity === 'flask-life' ? 0xc43838 : ev.rarity === 'flask-spirit' ? 0x4f8de0 : ev.rarity === 'flask-moon' ? 0xc080e0 : ev.rarity === 'moonstone' ? 0x9fc0ff : 0xd8d8d8;
        emit(j, ev.x, ev.y, ev.rarity === 'common' ? 4 : ev.rarity === 'rune' ? 16 : 12, rc, { speed: 40, life: 0.9, up: ev.rarity === 'rune' ? 160 : 120 });
        if (ev.rarity === 'unique') addTrauma(j, 0.15);
        else if (ev.rarity === 'set') addTrauma(j, 0.08);
        return;
      }
      case 'pickup':
        emit(j, ev.x, ev.y, 8, ev.flask === 'life' ? 0xc43838 : ev.flask === 'spirit' ? 0x4f8de0 : ev.flask === 'moon' ? 0xc080e0 : C.gold, { speed: 90, life: 0.4, up: 30 });
        return;
      case 'sip': {
        var sc = ev.kind === 'life' ? 0xc43838 : ev.kind === 'spirit' ? 0x4f8de0 : 0xc080e0;
        ring(j, ev.x, ev.y, 8, 48, 0.35, sc, 3);
        emit(j, ev.x, ev.y, 16, sc, { speed: 90, life: 0.45, up: 50 });
        return;
      }
      // D2: behavior affixes and uniques.
      case 'knockdown':
        ring(j, ev.x, ev.y, 6, 30, 0.3, C.dust, 3);
        return;
      case 'execute':
        addTrauma(j, 0.15);
        emit(j, ev.x, ev.y, 16, C.blood, { speed: 200, life: 0.5 });
        return;
      case 'shockwave':
        addTrauma(j, 0.15);
        ring(j, ev.x, ev.y, 20, ev.radius || 100, 0.35, 0xd6ecf5, 4);
        return;
      case 'volatile':
        addTrauma(j, 0.2);
        ring(j, ev.x, ev.y, 10, ev.radius || 90, 0.35, C.purple, 5);
        emit(j, ev.x, ev.y, 22, C.purple, { speed: 240, life: 0.5, size: 3 });
        return;
      case 'martyr':
        ring(j, ev.x, ev.y, 10, ev.radius || 100, 0.5, C.gold, 4);
        emit(j, ev.x, ev.y, 20, C.gold, { speed: 160, life: 0.7, up: 30 });
        return;
      // D5: bosses.
      case 'phase':
        addTrauma(j, 0.6); j.screenFlash = Math.max(j.screenFlash, 0.08);
        ring(j, ev.x, ev.y, 20, 420, 0.7, C.white, 8);
        emit(j, ev.x, ev.y, 40, C.red, { speed: 300, life: 0.8, size: 4 });
        return;
      case 'thrall':
      case 'thrall-break':
      case 'thrall-end':
        ring(j, ev.x, ev.y, 6, 40, 0.4, ev.type === 'thrall' ? 0x9fd8ff : C.gold, 3);
        return;
      case 'mimic':
        emit(j, ev.x, ev.y, 24, 0x9fd8ff, { speed: 160, life: 0.7 });
        return;
      case 'gale':
        addTrauma(j, 0.35);
        ring(j, ev.x, ev.y, 30, ev.radius || 500, 0.5, 0xd6ecf5, 6);
        return;
      case 'victory':
        addTrauma(j, 0.4); j.screenFlash = Math.max(j.screenFlash, 0.1);
        return;
      case 'sprout':
        emit(j, ev.x, ev.y, 14, C.leaf, { speed: 120, life: 0.6, up: 20 });
        ring(j, ev.x, ev.y, 4, 34, 0.4, C.leaf, 3);
        return;
      case 'burrow':
        emit(j, ev.x, ev.y, 12, C.dust, { speed: 110, life: 0.5, size: 3 });
        emit(j, ev.x2, ev.y2, 16, C.leaf, { speed: 140, life: 0.6, size: 3 });
        return;
      case 'feather':
        j.swings.push({ x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, bolt: false, t: 0, life: 0.12 });
        return;
      case 'split':
        emit(j, ev.x, ev.y, 8, 0x2a2a3a, { speed: 120, life: 0.4, size: 3 });
        return;
      case 'wolfhowl':
        ring(j, ev.x, ev.y, 12, ev.word ? 220 : 250, 0.5, ev.word ? C.gold : C.mote, 2);
        return;
      case 'briar':
        ring(j, ev.x, ev.y, 6, ev.radius || 100, 0.4, C.leaf, 3);
        return;
      case 'hearthbond':
        ring(j, ev.x, ev.y, 8, 48, 0.5, C.gold, 3);
        emit(j, ev.x, ev.y, 10, C.gold, { speed: 80, life: 0.5, up: 30 });
        return;
      case 'denmother':
        ring(j, ev.x, ev.y, 10, 180, 0.45, 0xe2c56a, 2);
        return;
      case 'wreath':
        ring(j, ev.x, ev.y, 8, 70, 0.4, C.leaf, 3);
        emit(j, ev.x, ev.y, 10, C.leaf, { speed: 140, life: 0.35, size: 2 });
        return;
      case 'hearthwake':
        ring(j, ev.x, ev.y, 12, 80, 0.5, C.gold, 3);
        emit(j, ev.x, ev.y, 16, 0x8fe07a, { speed: 90, life: 0.6, up: 40 });
        return;
      case 'yank':
        j.swings.push({ x: ev.x, y: ev.y, x2: ev.x2, y2: ev.y2, bolt: true, t: 0, life: 0.2 });
        return;
      case 'sleep':
      case 'wake':
        ring(j, ev.x, ev.y, 10, 50, 0.6, ev.type === 'wake' ? C.red : C.mote, 3);
        emit(j, ev.x, ev.y, 12, ev.type === 'wake' ? C.red : C.mote, { speed: 60, life: 0.9, up: 40 });
        return;
      case 'fenrir':
      case 'fenrir-split':
        addTrauma(j, 0.3);
        ring(j, ev.x, ev.y, 10, 120, 0.5, C.red, 5);
        emit(j, ev.x, ev.y, 30, C.mote, { speed: 200, life: 0.7 });
        return;
      case 'druid-down':
        addTrauma(j, 0.5); j.vignette = 0.6;
        return;
    }
  }

  function css(c) { return '#' + ('00000' + c.toString(16)).slice(-6); }

  PB.Juice = { create: create, emit: emit, setLimit: setLimit, setQuality: setQuality, trails: trails, prints: prints, addNumber: addNumber, addTrauma: addTrauma, update: update, shakeOffset: shakeOffset,
               onEvent: onEvent, numberRise: numberRise, css: css, CAP: CAP, NUM_LIFE: NUM_LIFE, COLORS: C, TYPE_COLORS: TYPE };
})(globalThis.PB = globalThis.PB || {});
