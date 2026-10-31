// Pack commands. Orders are sticky until replaced; timed commands use cooldowns scaled by cmdCdr.
// Precedence inside intent() (first match wins): linkCut > Rally recall > archetype (rooted, aura) >
// Encircle formation > standing order (Focus | Hold | Trail; Feral strips Focus and Hold only) > free/Heel leash.
(function (PB) {
  'use strict';
  PB.COMMANDS = {
    focus:    { key: 'RMB on enemy',  cd: 0,  text: 'Every mobile summon attacks this target; ravens Mark it.' },
    hold:     { key: 'RMB on ground', cd: 0,  text: 'Pack moves to the point and guards a 120px circle (engages up to 160px from the point).' },
    trail:    { key: 'RMB drag',      cd: 0,  text: 'Paint a Scent Trail (max 900px). The pack runs it, mauling what comes within 60px without leaving the line; wolves +30% speed.' },
    heel:     { key: 'G',             cd: 0,  text: 'Toggle Heel: the pack stays within 150px of you and fights only what comes close.' },
    rally:    { key: 'R',             cd: 8,  text: 'Recall: the pack sprints to you (+60% speed, up to 2s) and gains a shield of 20% max life for 3s. Clears orders. Breaks Thrall tethers.' },
    frenzy:   { key: 'F',             cd: 20, text: 'Unleash: +40% attack speed, +20% move speed, x1.15 damage for 8s; then Exhausted (-20% speed) for 4s.' },
    encircle: { key: 'C',             cd: 12, text: 'For 5s the mobile pack takes evenly spaced posts on a 90px ring around the cursor and body-blocks; enemies inside take +15% damage.' },
    howl:     { key: 'Q',             cd: 10, spirit: 20, text: 'Druid howls: summons +25% damage for 6s; non-elite enemies within 200px of you flee for 1s (a windup already started still lands).' }
  };
  var FRENZY_T = 8, EXHAUST_T = 4, ENCIRCLE_T = 5, HOWL_T = 6, RALLY_SHIELD_T = 3, RECALL_T = 2, RECALL_DONE = 100;
  var TRAIL_MAX = 900, TRAIL_REACH = 60, RING_R = 90, RING_POST = 16, RING_STEP = 15, RING_HELD = 30, HOWL_FLEE_R = 200, HOWL_FLEE_T = 1;

  function createPackState() {
    return { order: { kind: 'free' }, heel: false, cds: { rally: 0, frenzy: 0, encircle: 0, howl: 0 }, frenzyT: 0, exhaustT: 0,
             encircle: null, howlT: 0, rallyT: 0, recallT: 0, recalled: {} };
  }

  function cooldown(world, id) {
    return PB.COMMANDS[id].cd * (1 - Math.min(0.6, (world.mods.stats.cmdCdr || 0) / 100));
  }

  // Rally shield as a fraction of max life: 20% base + 10% per Rally Shield rank.
  function rallyShieldFrac(stats) { return 0.20 + ((stats && stats.rallyShield) || 0) / 100; }

  function anchorOf(world) { return world.anchor || world.player; }

  // cmd: {kind, targetId?, x?, y?, path?}. Returns {ok, reason?}.
  function issue(world, cmd) {
    var pack = world.pack, def = PB.COMMANDS[cmd.kind], i, e;
    if (!def) return { ok: false, reason: 'unknown' };
    if (pack.cds[cmd.kind] > 0) return { ok: false, reason: 'cooldown', left: pack.cds[cmd.kind] };
    if (def.spirit && world.player.spirit < def.spirit) return { ok: false, reason: 'spirit' };
    if (def.spirit) world.player.spirit -= def.spirit;
    if (def.cd) pack.cds[cmd.kind] = cooldown(world, cmd.kind);
    var ents = world.ents || [];
    switch (cmd.kind) {
      case 'focus': pack.order = { kind: 'focus', targetId: cmd.targetId }; if (world.mods.behaviors.echoing) PB.Behaviors.echoFocus(world, world.byId[cmd.targetId]); break;
      case 'hold': pack.order = { kind: 'hold', x: cmd.x, y: cmd.y, r: 120 }; break;
      case 'trail': pack.order = { kind: 'trail', path: clearOfObstacles(world, trimPath(cmd.path, TRAIL_MAX)), idx: {} }; break;
      case 'heel': pack.heel = !pack.heel; break;
      case 'rally':
        pack.order = { kind: 'free' }; pack.rallyT = RALLY_SHIELD_T; pack.recallT = RECALL_T; pack.recalled = {};
        var frac = rallyShieldFrac(world.mods.stats);
        for (i = 0; i < ents.length; i++) {
          e = ents[i];
          if (e.team === 0 && !e.dead) { e.shield = e.maxHp * frac; e.shieldT = RALLY_SHIELD_T; }
        }
        if (world.mods.behaviors.echoing) howl(world); // Echoing: Rally also Howls
        break;
      case 'frenzy': pack.frenzyT = FRENZY_T; pack.exhaustT = 0; pack.freeFrenzy = false; break;
      case 'encircle': pack.encircle = { x: cmd.x, y: cmd.y, r: RING_R, t: ENCIRCLE_T, slotTick: -1, slots: {} }; break;
      case 'howl': howl(world); break;
    }
    PB.Events.emit(world.events, 'command', { kind: cmd.kind });
    return { ok: true };
  }

  function howl(world) {
    var ents = world.ents || [], p = world.player;
    world.pack.howlT = HOWL_T;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.team !== 1 || e.dead || e.boss || (e.elite && e.elite.length)) continue;
      var dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy <= HOWL_FLEE_R * HOWL_FLEE_R) e.fleeT = HOWL_FLEE_T;
    }
  }

  function trimPath(path, maxLen) {
    var out = [path[0]], len = 0;
    for (var i = 1; i < path.length; i++) {
      var dx = path[i].x - path[i - 1].x, dy = path[i].y - path[i - 1].y, d = Math.sqrt(dx * dx + dy * dy);
      if (len + d > maxLen) break;
      len += d;
      out.push(path[i]);
    }
    return out;
  }

  // A trail painted across a rock keeps only the points a body can stand on; steering goes around the rock.
  function clearOfObstacles(world, path) {
    var obs = world.obstacles || [];
    var out = path.filter(function (pt) {
      return obs.every(function (o) { var dx = pt.x - o.x, dy = pt.y - o.y, r = o.r + 20; return dx * dx + dy * dy > r * r; });
    });
    return out.length ? out : path.slice(0, 1);
  }

  function tick(world, dt) {
    var pack = world.pack;
    for (var k in pack.cds) pack.cds[k] = Math.max(0, pack.cds[k] - dt);
    if (pack.frenzyT > 0) { pack.frenzyT -= dt; if (pack.frenzyT <= 0) { pack.frenzyT = 0; pack.exhaustT = pack.freeFrenzy ? 0 : EXHAUST_T; pack.freeFrenzy = false; } }
    else if (pack.exhaustT > 0) pack.exhaustT = Math.max(0, pack.exhaustT - dt);
    if (pack.encircle) { pack.encircle.t -= dt; if (pack.encircle.t <= 0) pack.encircle = null; }
    if (pack.howlT > 0) pack.howlT = Math.max(0, pack.howlT - dt);
    if (pack.rallyT > 0) pack.rallyT = Math.max(0, pack.rallyT - dt);
    if (pack.recallT > 0) pack.recallT = Math.max(0, pack.recallT - dt);
    if (pack.order.kind === 'focus') {
      var t = world.byId[pack.order.targetId];
      if (!t || t.dead) pack.order = { kind: 'free' };
    }
  }

  // What the HUD shows: running pack timers (label, seconds left) and commands still cooling down.
  function status(world) {
    var pack = world.pack, timers = [], cds = [];
    if (pack.frenzyT > 0) timers.push({ label: 'Frenzy', left: pack.frenzyT });
    if (pack.exhaustT > 0 && !(pack.frenzyT > 0)) timers.push({ label: 'Exhausted', left: pack.exhaustT });
    if (pack.howlT > 0) timers.push({ label: 'Howl', left: pack.howlT });
    if (pack.encircle) timers.push({ label: 'Encircle', left: pack.encircle.t });
    if (pack.rallyT > 0) timers.push({ label: 'Rally shield', left: pack.rallyT });
    for (var k in pack.cds) if (pack.cds[k] > 0) cds.push({ kind: k, left: pack.cds[k] });
    return { timers: timers, cds: cds };
  }

  // Speed and attack-rate multipliers from pack timers. One place, read by world.step.
  function packMul(world) {
    var pack = world.pack;
    var warg = pack.wargT > 0 ? PB.AIFusions.WARG_SPEED : 1; // Dire Warg kill howl
    if (pack.frenzyT > 0) return { speed: 1.2 * warg, atkRate: 1.4 };
    if (pack.exhaustT > 0) return { speed: 0.8 * warg, atkRate: 1 };
    return { speed: warg, atkRate: 1 };
  }

  function isMobile(s) { return s.ai !== 'rooted' && s.ai !== 'aura' && (s.speed || 0) > 0; }

  // Encircle posts: mobile summons sorted by id take evenly spaced angles on the ring. Rebuilt once per tick.
  function ringPost(world, s) {
    var enc = world.pack.encircle;
    if (enc.slotTick !== world.tick) {
      var ids = [];
      (world.ents || []).forEach(function (e) { if (e.team === 0 && !e.dead && e.kind === 'summon' && isMobile(e)) ids.push(e.id); });
      ids.sort(function (a, b) { return a - b; });
      enc.slots = {}; enc.n = ids.length;
      ids.forEach(function (id, i) { enc.slots[id] = i; });
      enc.slotTick = world.tick;
    }
    var i = enc.slots[s.id];
    if (i === undefined) return null;
    var a = PB.M.TAU * i / Math.max(1, enc.n);
    return { x: enc.x + enc.r * Math.cos(a), y: enc.y + enc.r * Math.sin(a) };
  }

  function d2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }

  // How many summons hold their Encircle posts right now (within RING_HELD px of the post).
  function postsHeld(world) {
    var enc = world.pack.encircle, n = 0;
    if (!enc || enc.slotTick < 0) return 0;
    for (var i = 0; i < (world.ents || []).length; i++) {
      var e = world.ents[i];
      if (e.team !== 0 || e.dead || enc.slots[e.id] === undefined) continue;
      var a = PB.M.TAU * enc.slots[e.id] / Math.max(1, enc.n), px = enc.x + enc.r * Math.cos(a), py = enc.y + enc.r * Math.sin(a);
      if (d2(e.x, e.y, px, py) <= RING_HELD * RING_HELD) n++;
    }
    return n;
  }

  // What should this summon do? nearestEnemy(x, y, r) is supplied by the world (spatial hash).
  // Returns {kind:'attack', target, hold?} | {kind:'move', x, y, sprint?, trail?, post?} | {kind:'idle'}.
  // hold = a point to keep moving toward instead of chasing a target that is out of reach (Trail, Encircle).
  function intent(world, s, nearestEnemy) {
    var pack = world.pack, a = anchorOf(world), b = world.mods.behaviors;
    if (s.linkCut > 0) return { kind: 'idle' };
    if (pack.recallT > 0 && !pack.recalled[s.id] && s.ai !== 'rooted') {
      if (d2(s.x, s.y, a.x, a.y) > RECALL_DONE * RECALL_DONE) return { kind: 'move', x: a.x, y: a.y, sprint: true };
      pack.recalled[s.id] = true;
      var ri = s.indId && world.inds ? world.inds[s.indId] : null;
      if (ri) { ri.deeds.rallies++; PB.Progression.scars(world, ri); } // Loyal counts answered Rallies
    }
    var order = pack.order;
    if (b.feral && (order.kind === 'focus' || order.kind === 'hold')) order = { kind: 'free' };

    // Archetypes that never leave their post.
    if (s.ai === 'aura') {
      if (d2(s.x, s.y, a.x, a.y) > 40 * 40) return { kind: 'move', x: a.x, y: a.y };
      return { kind: 'idle' };
    }
    if (s.ai === 'rooted') {
      var reach = (s.range || 0) + (s.r || 0);
      if (order.kind === 'focus') {
        var vf = world.byId[order.targetId];
        if (vf && !vf.dead && d2(s.x, s.y, vf.x, vf.y) <= (reach + vf.r) * (reach + vf.r)) return { kind: 'attack', target: vf };
      }
      var vt = nearestEnemy(s.x, s.y, reach);
      return vt ? { kind: 'attack', target: vt } : { kind: 'idle' };
    }

    if (pack.encircle) {
      var post = ringPost(world, s);
      if (post) {
        // A posted summon bites anything within reach of its post, stepping up to RING_STEP off it, then returns.
        var off = d2(s.x, s.y, post.x, post.y);
        if (off > (RING_STEP + RING_POST) * (RING_STEP + RING_POST)) return { kind: 'move', x: post.x, y: post.y, post: true };
        var rt = nearestEnemy(post.x, post.y, (s.r || 0) + (s.range || 20) + 20 + RING_STEP);
        if (rt) return { kind: 'attack', target: rt, hold: post, post: true, leash: RING_STEP };
        if (off > RING_POST * RING_POST) return { kind: 'move', x: post.x, y: post.y, post: true };
        return { kind: 'idle', post: true };
      }
    }

    if (order.kind === 'focus') {
      var ft = world.byId[order.targetId];
      if (ft && !ft.dead) return { kind: 'attack', target: ft };
    }
    if (order.kind === 'hold') {
      var ht = nearestEnemy(order.x, order.y, order.r + 40);
      if (ht) return { kind: 'attack', target: ht };
      return { kind: 'move', x: order.x, y: order.y };
    }
    if (order.kind === 'trail') {
      var path = order.path, i = order.idx[s.id] || 0;
      if (i < path.length) {
        var wp = path[i];
        if (d2(s.x, s.y, wp.x, wp.y) < 24 * 24) { order.idx[s.id] = i + 1; wp = path[Math.min(i + 1, path.length - 1)]; }
        var near = nearestEnemy(s.x, s.y, TRAIL_REACH);
        if (near) return { kind: 'attack', target: near, hold: { x: wp.x, y: wp.y }, trail: true };
        return { kind: 'move', x: wp.x, y: wp.y, trail: true };
      }
    }
    var leash = b.shepherds ? 200 : (pack.heel ? 150 : 520);
    var range = pack.heel ? 150 : 400;
    var cx = pack.heel ? a.x : s.x, cy = pack.heel ? a.y : s.y;
    var t = nearestEnemy(cx, cy, range);
    if (b.predatory && s.tags && s.tags.indexOf('wolf') >= 0) t = PB.Behaviors.prey(world, s, a, leash) || t; // Predatory: the weakest
    if (t && d2(t.x, t.y, a.x, a.y) <= leash * leash) return { kind: 'attack', target: t };
    if (d2(s.x, s.y, a.x, a.y) > 90 * 90) return { kind: 'move', x: a.x, y: a.y };
    return { kind: 'idle' };
  }

  PB.Commands = { createPackState: createPackState, issue: issue, tick: tick, status: status, intent: intent, cooldown: cooldown, trimPath: trimPath,
                  packMul: packMul, rallyShieldFrac: rallyShieldFrac, isMobile: isMobile, ringPost: ringPost, postsHeld: postsHeld,
                  FRENZY_T: FRENZY_T, EXHAUST_T: EXHAUST_T, TRAIL_MAX: TRAIL_MAX, RING_R: RING_R, RECALL_T: RECALL_T };
})(globalThis.PB = globalThis.PB || {});
