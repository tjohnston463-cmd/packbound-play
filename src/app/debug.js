// Debug hooks. window.PB_DEBUG exists only with ?test=1; ?perf=1&s=30&e=80 builds the bench scene
// (N summons + M unkillable enemies) and shows sim and render ms on screen.
// E6 adds grant(), toCamp(), open(), kill() (the druid) and button() (a canvas button's centre) for tools/playtest.py.
(function (PB) {
  'use strict';
  var UNKILLABLE = { hp: 1e9, maxHp: 1e9 };
  var BENCH_TYPES = ['wolf', 'wolf', 'raven', 'wolf', 'bear', 'raven', 'vine', 'spirit'];

  function params() {
    var out = {};
    String(location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      out[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '1' : decodeURIComponent(kv.slice(i + 1));
    });
    return out;
  }

  // Bench: keep about `G.benchParticles` particles alive, sprayed over the visible field.
  function topUpParticles(G) {
    var j = G.juice, want = G.benchParticles - j.n, cam = PB.Render.cam, colors = [0xffcc44, 0x7fd36f, 0x9fc8ff, 0xe0402f, 0xb8a888];
    for (var k = 0; want > 0 && k < 40; k++) {
      var n = Math.min(want, 25);
      PB.Juice.emit(j, cam.x + (Math.random() - 0.5) * 1100, cam.y + (Math.random() - 0.5) * 600, n, colors[k % colors.length], { speed: 140, life: 1.6, size: 3 });
      want -= n;
    }
  }

  function bench(G, s, e, p) {
    var w = PB.World.createWorld({ seed: 5 });
    for (var i = 0; i < s; i++) PB.World.spawn(w, 'summon', BENCH_TYPES[i % BENCH_TYPES.length], 1000 + (i % 8) * 24, 700 + Math.floor(i / 8) * 24, UNKILLABLE);
    for (var j = 0; j < e; j++) PB.World.spawn(w, 'enemy', ['rotling', 'rotling', 'bogshaman', 'mirebrute'][j % 4], w.rng.spawn.range(0, w.width), j % 2 ? 0 : w.height, UNKILLABLE);
    w.player.hp = w.player.maxHp = 1e9;
    G.world = w; G.stack = []; PB.Game.setScreen('field'); G.sandbox = false; G.overlay = true; G.banner = null; G.downT = 0; G.kills = 0;
    G.juice = PB.Juice.create(); PB.Juice.setQuality(G.juice, PB.Game.quality()); G.toasts = []; G.benchParticles = p || 0;
    PB.Render.follow(w, true);
    PB.Game.resetStats();
    return { summons: w.counts.summon, enemies: w.counts.enemy };
  }

  // What a reload must keep (plan E6): equipped slots, skills, the best tier in the roster and the fused count.
  function saveSummary(sv) {
    if (!sv) return null;
    var maxTier = 0, fused = 0;
    sv.roster.forEach(function (r) { maxTier = Math.max(maxTier, r.tier); if (r.fusedFrom) fused++; });
    return { equipped: JSON.parse(JSON.stringify(sv.equipped)), skills: JSON.parse(JSON.stringify(sv.player.skills)), maxTier: maxTier, fused: fused,
             level: sv.player.level, roster: sv.roster.length, moonstones: sv.currency.moonstones };
  }

  // Debug guard for the stress window: the druid takes 10% damage and is healed to full ten times a second, so the
  // Life orb shows real numbers in screenshots. guard(false) (or any new field) ends it.
  var GUARD = { on: false, world: null };
  function guard(on) { GUARD.on = !!on; GUARD.world = on ? PB.Game.G.world : null; return GUARD.on; }
  function guardTick() {
    var w = PB.Game.G.world;
    if (!GUARD.on || !w || w !== GUARD.world) { GUARD.on = false; return; }
    var p = w.player; p.dr = Math.max(p.dr || 0, 0.9); if (p.hp > 0) p.hp = p.maxHp;
  }

  function install(G) {
    var p = params();
    if (p.perf === '1') bench(G, +(p.s || 30), +(p.e || 80), +(p.p || 0));
    if (p.test !== '1') return;
    window.addEventListener('keydown', function (e) { if (e.code === 'Backquote') { PB.Audio.init(); PB.Audio.demo(); } });
    setInterval(guardTick, 100);
    window.PB_DEBUG = {
      ready: function () { return G.screen !== 'boot' && G.frames > 2; },
      startZone: function (z, moon) { PB.Game.startZone(z, moon); return G.screen; },
      // The centre of a visible canvas button in client pixels (so the playtest clicks the real UI), or null.
      button: function (id) { var r = PB.UI.buttons[id]; return r ? PB.Render.uiToScreen(r.x + r.w / 2, r.y + r.h / 2) : null; },
      // The playtest's view of the game (plan E6), plus the fields the shell tests and feel scripts read.
      state: function () {
        var w = G.world, sv = G.save, out = { screen: G.screen, stack: G.stack.slice(), paused: G.paused, save: saveSummary(sv) };
        if (!w) return out;
        var pl = w.player, pk = w.pack, rosterXp = 0;
        (sv ? sv.roster : []).forEach(function (r) { for (var l = 1; l < r.level; l++) rosterXp += PB.Evolution.xpToNext(l); rosterXp += r.xp; });
        var more = {
          pack: w.counts.summon, enemies: w.counts.enemy, order: pk.order.kind, heel: pk.heel, frenzyT: pk.frenzyT || 0,
          encircleT: pk.encircle ? pk.encircle.t : 0, howlT: pk.howlT || 0, rallyT: pk.rallyT || 0, possessed: w.anchor ? w.anchor.id : null,
          playerXp: sv ? sv.player.xp : 0, playerLevel: sv ? sv.player.level : 1, rosterXp: rosterXp,
          tick: w.tick, seed: G.seed, kills: G.kills,
          player: { x: pl.x, y: pl.y, hp: pl.hp, maxHp: pl.maxHp, spirit: pl.spirit, iframes: pl.iframes },
          counts: { summon: w.counts.summon, enemy: w.counts.enemy }, ents: w.ents.length, hash: PB.World.hashState(w),
          particles: G.juice ? G.juice.n : 0, trauma: G.juice ? G.juice.trauma : 0,
          anchor: w.anchor ? w.anchor.id : null, chorus: w.chorus ? w.chorus.meter : 0, hunt: !!w.hunt, corpses: (w.corpses || []).length,
          dir: w.dir ? { zone: w.dir.zone, wave: w.dir.wave, state: w.dir.state, left: PB.Director.status(w).left, boss: w.dir.bossId ? (function (b) { return b ? { hp: b.hp, maxHp: b.maxHp, phase: b.phase || 1 } : null; })(w.byId[w.dir.bossId]) : null } : null,
          drops: (w.drops || []).length, inventory: sv ? sv.inventory.length : 0, moonstones: sv ? sv.currency.moonstones : 0, level: sv ? sv.player.level : 1,
          banner: G.banner, lowEnd: PB.Game.lowEnd().on,
          roster: sv ? sv.roster.map(function (r) { return { id: r.id, name: r.name, type: r.type, level: r.level, tier: r.tier, branch: r.branch, infusion: r.infusion, fused: !!r.fusedFrom, scars: r.scars.slice(), diet: r.diet }; }) : []
        };
        for (var k in more) out[k] = more[k];
        return out;
      },
      // grant({level, moonstones, roster: 'stress', items: 'sample'}). 'stress' calls a 24-summon pack (12 wolves,
      // 6 ravens, 2 bears, 3 vines, 1 spirit) past the caps, unkillable with a guarded druid (see guard), so the stress window
      // measures load, not attrition; it also adds a Tier II wolf and raven (not called) for the altar.
      grant: function (o) {
        o = o || {};
        if (!G.save) return null;
        var s = G.save, w = G.world, rng = new PB.Rng(4242);
        if (o.level && o.level > s.player.level) { var from = s.player.level; s.player.level = o.level; s.player.xp = 0; if (w) PB.Progression.applyPlayerLevel(w, from, o.level); }
        if (o.moonstones) s.currency.moonstones += o.moonstones;
        if (o.items === 'sample') ['common', 'magic', 'rare', 'set', 'unique'].forEach(function (r) { s.inventory.push(PB.Loot.rollItem(rng, 10, r, s)); });
        if (o.roster === 'stress' && w) {
          var baseWant = { wolf: 12, raven: 6, bear: 2, vine: 3, spirit: 1 }, want = {}, p = w.player, n = 0;
          PB.Classes.order(s).forEach(function (t) {
            var role = (PB.SUMMONS[t] && PB.SUMMONS[t].role) || t;
            want[t] = baseWant[t] || baseWant[role] || 1;
          });
          PB.Classes.order(s).forEach(function (t) {
            var have = s.roster.filter(function (x) { return x.type === t && !x.fusedFrom; });
            while (have.length < want[t]) { var ind = PB.Evolution.createIndividual(s, t, rng); ind.level = 6; have.push(ind); }
            have.slice(0, want[t]).forEach(function (ind) {
              var e = w.byId[w.active[ind.id]];
              if (!e || e.dead) { var a = n * 0.7; e = PB.World.spawnIndividual(w, ind, p.x + Math.cos(a) * (60 + n * 3), p.y + Math.sin(a) * (60 + n * 3)); }
              n++;
              if (e) { e.hp = e.maxHp = 1e9; }
            });
          });
          ['wolf', 'raven'].forEach(function (t) { var ind = PB.Evolution.createIndividual(s, t, rng); ind.level = 7; ind.tier = 2; ind.branch = 'A'; });
          guard(true); // the druid keeps normal life on screen: 90% damage reduction and a top-up, no infinity
        }
        return saveSummary(s);
      },
      toCamp: function () { PB.Game.toCamp(); return G.screen; },
      guard: function (on) { var r = guard(on); if (!on && G.world) G.world.player.dr = 0; return r; },
      open: function (name, opts) { PB.Game.open(name, opts); return G.screen; },
      kill: function () { if (G.world) G.world.player.hp = 0; return !!G.world; }, // the druid falls (Game Over)
      killEnemies: function () { var n = 0; if (G.world) G.world.ents.forEach(function (e) { if (e.team === 1 && !e.dead) { e.dead = true; n++; } }); return n; },
      fps: function (reset) { if (reset) { PB.Game.resetStats(); return null; } return PB.Game.fpsReport(); },
      // spawn(type, n, {unkillable, near}): enemies at `near` px (default 400) from the druid
      spawn: function (type, n, opts) {
        opts = opts || {};
        var made = 0;
        for (var i = 0; i < (n || 1); i++) {
          var e = PB.Game.spawnNear(G.world, PB.SUMMONS[type] ? 'summon' : 'enemy', type, opts.near || 400, opts.unkillable ? UNKILLABLE : null);
          if (e) made++;
        }
        return made;
      },
      setSeed: function (n) { PB.Game.newField(n); return G.seed; },
      perf: function (s, e, p) { return bench(G, s || 30, e || 80, p || 0); },
      audioSelfTest: function () { return PB.Audio.selfTest(); },
      exportSave: function () { return PB.Game.exportSave(); },
      importSave: function (t) { var r = PB.Game.importSave(t); return { ok: r.ok, error: r.error || null }; },
      persist: function () { return PB.Game.persist('debug'); },
      nearestEnemyScreen: function () {
        var pl = G.world.player, best = null, bd = Infinity;
        G.world.ents.forEach(function (e) { if (e.team !== 1 || e.dead) return; var d = Math.hypot(e.x - pl.x, e.y - pl.y); if (d < bd) { bd = d; best = e; } });
        return best ? PB.Render.worldToScreen(best.x, best.y) : null;
      }
    };
  }

  PB.Debug = { install: install, bench: bench, topUpParticles: topUpParticles };
})(globalThis.PB = globalThis.PB || {});
