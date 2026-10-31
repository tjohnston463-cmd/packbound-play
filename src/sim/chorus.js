// Chorus and the Wild Hunt (spec §6, §11.4). Three or more distinct summon tags hitting one target within 1 s sing
// a Chorus: a burst of 25% of those hits (+chorusDmg%), a chord, +8 meter. Kills add 0.5, elite kills 5; the Crown
// of the Wild Hunt doubles every gain. At 100, V calls the Hunt: one spectral runner per roster member and Echo, in
// 4 waves 0.4 s apart, crossing the arena along the cursor direction; every runner hits each enemy it overlaps once,
// as a crit. Runners are data in world.hunt, never entities, and are capped at 48: past that, members are dealt
// round-robin onto runners and a runner deals the sum of its members' hits.
(function (PB) {
  'use strict';
  var WINDOW = PB.Combat.CHORUS_WINDOW, BURST = 0.25, CHORUS_METER = 8, KILL_METER = 0.5, ELITE_METER = 5, METER_MAX = 100;
  var HUNT_T = 6, WAVES = [0, 0.4, 0.8, 1.2], RUNNERS_MAX = 48, RUN_SPEED = 450, RUN_FROM = 700, RUN_R = 30, LANE_SPAN = 900, WAVE_OFF = 8;
  var HUNT_FLOOR = 6, ETERNAL_REFUND = 30, LINGER_T = 10, LINGER_MAX = 8;
  // Chord notes in semitones from A3 (220 Hz): wolf A3, raven E5, bear A2, vine D4, spirit C#5.
  var NOTES = { wolf: 0, raven: 19, bear: -12, vine: 5, spirit: 16 };

  function addMeter(world, v) {
    var c = world.chorus;
    c.meter = Math.min(METER_MAX, c.meter + v * (world.mods.behaviors.huntcrown ? 2 : 1));
  }

  // Every landed summon hit on an enemy (World.damage). A fused summon records all of its tags.
  function onHit(world, att, def, h) {
    var now = world.time, list = def.chorusHits || (def.chorusHits = []), i;
    for (i = list.length - 1; i >= 0; i--) if (now - list[i].t > WINDOW + 1e-9) list.splice(i, 1);
    var weight = att.scars && att.scars.indexOf('chorister') >= 0 ? 2 : 1;
    list.push({ t: now, amount: h.amount * weight, src: att.id, tags: att.tags.slice() });
    var n = 0;
    for (i = 0; i < att.tags.length; i++) n = PB.Combat.recordChorusHit(def, att.tags[i], now) || n;
    if (!n) return 0;
    var sum = 0, tags = [], srcs = [];
    list.forEach(function (x) {
      sum += x.amount;
      x.tags.forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
      if (srcs.indexOf(x.src) < 0) srcs.push(x.src);
    });
    def.chorusHits = [];
    var burst = Math.round(BURST * sum * (1 + (world.mods.stats.chorusDmg || 0) / 100));
    PB.Events.emit(world.events, 'chorus', { x: def.x, y: def.y, dst: def.id, amount: burst,
      notes: tags.map(function (t) { return NOTES[t] || 0; }), tags: tags });
    addMeter(world, CHORUS_METER);
    srcs.forEach(function (id) {
      var e = world.byId[id], ind = e && e.indId && world.inds ? world.inds[e.indId] : null;
      if (ind) { ind.deeds.choruses++; PB.Progression.scars(world, ind); }
    });
    if (world.mods.behaviors.hearthwake) PB.Behaviors.onHearthwake(world);
    PB.World.direct(world, att.id, def, burst, false, 'chorus');
    return burst;
  }

  function onKill(world, def) {
    var base = def.elite && def.elite.length ? ELITE_METER : KILL_METER;
    if (PB.Waves.isQuarry(world.dir, def.type)) base *= 2; // the named prey fills the moon faster
    addMeter(world, base);
  }

  // A member's Hunt hit: its normal average hit as a crit (supports hit for at least HUNT_FLOOR).
  // Echo records may be partial ({name, type, level}); missing fields default like a fresh individual.
  function memberHit(world, m) {
    var rec = { type: m.type, level: m.level || 1, tier: m.tier || 1, branch: m.branch || null, scars: m.scars || [],
                infusion: m.infusion || null, fusedFrom: m.fusedFrom || null };
    var st = PB.Evolution.statsFor(rec, world.mods.stats);
    return Math.max(HUNT_FLOOR, (st.dmg[0] + st.dmg[1]) / 2) * st.critMult;
  }

  function startHunt(world, angle) {
    if (world.hunt) return { ok: false, reason: 'active' };
    if (world.chorus.meter < METER_MAX - 1e-9) return { ok: false, reason: 'meter' };
    var save = world.save, members = save ? save.roster.concat(save.echoes || []) : [];
    if (!members.length) return { ok: false, reason: 'empty' };
    world.chorus.meter = world.mods.behaviors.eternal ? ETERNAL_REFUND : 0;
    var n = Math.min(RUNNERS_MAX, members.length), runners = [], i;
    for (i = 0; i < n; i++) runners.push({ id: i, type: null, delay: WAVES[i % WAVES.length], lane: 0, dmg: 0, members: 0, hit: {} });
    members.forEach(function (m, k) {
      var r = runners[k % n];
      r.dmg += memberHit(world, m); r.members++;
      if (!r.type) r.type = m.type;
    });
    // Lanes: each wave's runners spread evenly across LANE_SPAN, waves offset so they do not run in single file.
    var span = Math.min(LANE_SPAN, 60 + 10 * n); // the stampede runs down the aim ray; only a big pack widens it
    var perWave = WAVES.map(function (_, w) { return runners.filter(function (r) { return r.id % WAVES.length === w; }).length; });
    runners.forEach(function (r) {
      var w = r.id % WAVES.length, k = Math.floor(r.id / WAVES.length), m = perWave[w];
      r.lane = ((k + 0.5) / m - 0.5) * span + (w - 1.5) * WAVE_OFF;
    });
    var a = world.anchor || world.player;
    world.hunt = { t: 0, dur: HUNT_T, angle: angle, ox: a.x, oy: a.y, runners: runners };
    PB.Events.emit(world.events, 'hunt', { x: a.x, y: a.y, angle: angle, n: n, members: members.length });
    return { ok: true, runners: n };
  }

  // Where runner r is now, or null before its wave / after it has left.
  function runnerPos(hunt, r) {
    var s = hunt.t - r.delay;
    if (s < 0) return null;
    var ux = Math.cos(hunt.angle), uy = Math.sin(hunt.angle), d = -RUN_FROM + RUN_SPEED * s;
    if (d > RUN_FROM) return null;
    return { x: hunt.ox + ux * d - uy * r.lane, y: hunt.oy + uy * d + ux * r.lane };
  }

  function tick(world, dt) {
    var hunt = world.hunt;
    if (!hunt) return;
    hunt.t += dt;
    var ents = world.ents;
    for (var i = 0; i < hunt.runners.length; i++) {
      var r = hunt.runners[i], pos = runnerPos(hunt, r);
      if (!pos) continue;
      for (var j = 0; j < ents.length; j++) {
        var o = ents[j];
        if (o.team !== 1 || o.dead || r.hit[o.id]) continue;
        var dx = o.x - pos.x, dy = o.y - pos.y, rr = RUN_R + o.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        r.hit[o.id] = 1;
        PB.World.direct(world, -1, o, r.dmg, true, 'hunt');
      }
    }
    if (hunt.t >= hunt.dur - 1e-9) { world.hunt = null; PB.Events.emit(world.events, 'hunt-end', {}); if (world.mods.behaviors.huntcrown) linger(world); }
  }

  // Crown of the Wild Hunt: every Echo (up to 8) stays 10 s as a fighting ghost (a temp summon) beside the anchor.
  function linger(world) {
    var echoes = (world.save && world.save.echoes) || [], a = world.anchor || world.player;
    echoes.slice(0, LINGER_MAX).forEach(function (m, i) {
      var rec = { type: m.type, level: m.level || 1, tier: m.tier || 1, branch: m.branch || null, scars: m.scars || [], infusion: m.infusion || null, fusedFrom: m.fusedFrom || null };
      var st = PB.Evolution.statsFor(rec, world.mods.stats), ang = i / Math.max(1, echoes.length) * Math.PI * 2;
      PB.World.spawn(world, 'summon', m.type, a.x + Math.cos(ang) * 50, a.y + Math.sin(ang) * 50, { temp: true, life: LINGER_T, echoGhost: true, name: m.name,
        hp: st.hp, maxHp: st.hp, dmg: st.dmg.slice(), atk: st.atk, speed: st.speed, r: st.r, mass: st.mass, range: st.range, tags: st.tags.slice(),
        ai: st.ai, flying: st.flying, aura: st.aura, critChance: st.critChance, critMult: st.critMult, evo: st.evo });
    });
    if (echoes.length) PB.Events.emit(world.events, 'echoes-linger', { n: Math.min(LINGER_MAX, echoes.length), x: a.x, y: a.y });
  }

  PB.Chorus = { onHit: onHit, onKill: onKill, addMeter: addMeter, startHunt: startHunt, tick: tick, memberHit: memberHit, runnerPos: runnerPos,
                NOTES: NOTES, METER_MAX: METER_MAX, RUNNERS_MAX: RUNNERS_MAX, HUNT_T: HUNT_T };
})(globalThis.PB = globalThis.PB || {});
