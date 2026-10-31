// Procedural WebAudio (spec §14): no files. ctx -> master gain -> DynamicsCompressor -> destination, one seeded
// 1 s noise buffer reused by every noise sound, <= 24 live voices and one start per sound id per 30 ms.
// Every public call is wrapped so a sound can never throw into the game loop.
(function (PB) {
  'use strict';
  var MAX_VOICES = 24, THROTTLE = 0.03, CAW_GAP = 0.15, PAN_SPAN = 640;
  var A = { ctx: null, master: null, comp: null, noise: null, volume: 0.7, muted: false, voices: [], last: {}, camX: 0, lastCaw: -1, rng: null };
  var KEY = { wolf: 220, raven: 329.63, bear: 110, vine: 293.66, spirit: 277.18 };

  function semi(f, n) { return f * Math.pow(2, n / 12); }

  // ---------- building blocks ----------
  function envelope(p, t, attack, peak, decay) {
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function gainTo(dest, t, attack, peak, decay) {
    var g = A.ctx.createGain();
    envelope(g.gain, t, attack, peak, decay);
    g.connect(dest);
    return g;
  }

  // An oscillator with an optional pitch glide f0 -> f1 over dur.
  function tone(dest, type, f0, f1, t, dur, peak, attack) {
    var o = A.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(gainTo(dest, t, attack || 0.005, peak, dur));
    o.start(t); o.stop(t + (attack || 0.005) + dur + 0.05);
    return o;
  }

  // Filtered noise from the shared buffer; the filter frequency can sweep f0 -> f1.
  function hiss(dest, filter, f0, f1, q, t, dur, peak, attack) {
    var s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter();
    s.buffer = A.noise; s.loop = true;
    f.type = filter; f.frequency.setValueAtTime(f0, t); f.Q.value = q || 1;
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    s.connect(f); f.connect(gainTo(dest, t, attack || 0.003, peak, dur));
    var off = A.rng.next() * 0.8;
    s.start(t, off); s.stop(t + (attack || 0.003) + dur + 0.05);
    return s;
  }

  function arp(dest, type, root, steps, t, gap, len, peak) {
    for (var i = 0; i < steps.length; i++) tone(dest, type, semi(root, steps[i]), 0, t + i * gap, len, peak, 0.01);
    return steps.length * gap + len;
  }

  // A soft brassy blip: two detuned saws through a lowpass.
  function horn(dest, f, t, dur, peak, cutoff) {
    var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff || 1400; lp.Q.value = 2; lp.connect(dest);
    tone(lp, 'sawtooth', f, 0, t, dur, peak, 0.02);
    tone(lp, 'sawtooth', f * 1.006, 0, t, dur, peak * 0.7, 0.02);
  }

  // ---------- the sounds: each returns its length in seconds ----------
  // o: {pitch (multiplier), dur (telegraph), notes (chorus semitones)}
  var SOUNDS = {
    bite: function (d, t, o) { var p = o.pitch; hiss(d, 'bandpass', 1200 * p, 0, 3, t, 0.05, 0.5); tone(d, 'sine', 90 * p, 60 * p, t, 0.08, 0.6); return 0.1; },
    crit: function (d, t, o) { SOUNDS.bite(d, t, o); tone(d, 'square', 1800, 0, t + 0.01, 0.04, 0.18); tone(d, 'triangle', 2700, 0, t + 0.01, 0.12, 0.08); return 0.16; },
    whip: function (d, t) { hiss(d, 'highpass', 3000, 0, 0.8, t, 0.03, 0.6); return 0.05; },
    maul: function (d, t) { tone(d, 'sine', 70, 40, t, 0.18, 0.9); hiss(d, 'lowpass', 600, 200, 1, t, 0.12, 0.4); return 0.22; },
    death: function (d, t, o) { hiss(d, 'bandpass', 1400 * o.pitch, 220, 2, t, 0.2, 0.45); return 0.22; },
    eliteDeath: function (d, t) { SOUNDS.death(d, t, { pitch: 0.8 }); tone(d, 'sine', 60, 28, t, 0.4, 0.9); return 0.45; },
    druidHit: function (d, t) { var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(d); tone(lp, 'sawtooth', 180, 110, t, 0.12, 0.5); return 0.15; },
    summonDie: function (d, t, o) { var r = o.root || 220; arp(d, 'sine', r * 2, [7, 4, 2, 0], t, 0.09, 0.22, 0.18); return 0.6; },
    chorus: function (d, t, o) { var n = o.notes || [0, 4, 7]; for (var i = 0; i < n.length; i++) tone(d, 'triangle', semi(220, n[i]), 0, t, 0.4, 0.22, 0.02); return 0.45; },
    caw: function (d, t) {
      var mod = A.ctx.createOscillator(), mg = A.ctx.createGain(), car = A.ctx.createOscillator();
      mod.frequency.setValueAtTime(140, t); mg.gain.value = 300; mod.connect(mg); mg.connect(car.frequency);
      car.type = 'sawtooth'; car.frequency.setValueAtTime(900, t); car.frequency.exponentialRampToValueAtTime(500, t + 0.12);
      var bp = A.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.5;
      car.connect(bp); bp.connect(gainTo(d, t, 0.005, 0.28, 0.12));
      mod.start(t); car.start(t); mod.stop(t + 0.16); car.stop(t + 0.16);
      return 0.15;
    },
    root: function (d, t) {
      hiss(d, 'bandpass', 500, 300, 4, t, 0.3, 0.35, 0.02);
      var o = tone(d, 'triangle', 300, 0, t, 0.3, 0.2, 0.02), lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      lfo.frequency.value = 9; lg.gain.value = 25; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.35);
      return 0.35;
    },
    loot_common: function (d, t) { tone(d, 'square', 1500, 0, t, 0.03, 0.12); return 0.05; },
    loot_magic: function (d, t) { tone(d, 'sine', 988, 0, t, 0.35, 0.25); tone(d, 'sine', 1319, 0, t + 0.09, 0.4, 0.22); return 0.5; },
    loot_rare: function (d, t) { return arp(d, 'sine', 880, [0, 4, 7], t, 0.08, 0.35, 0.22); },
    loot_unique: function (d, t) {
      [0, 4, 7, 12].forEach(function (n) { tone(d, 'triangle', semi(523.25, n), 0, t, 0.8, 0.14, 0.02); });
      for (var i = 0; i < 6; i++) tone(d, 'sine', semi(2093, (i * 5) % 12), 0, t + 0.15 + i * 0.07, 0.25, 0.05);
      return 1.0;
    },
    levelup: function (d, t) { return arp(d, 'square', 523.25, [0, 4, 7, 12, 16], t, 0.075, 0.18, 0.09); },
    evolve: function (d, t) {
      [0, 7, 12].forEach(function (n) { tone(d, 'sawtooth', semi(220, n), 0, t, 1.0, 0.06, 0.6); });
      tone(d, 'sine', 1760, 0, t + 0.7, 0.6, 0.18);
      return 1.6;
    },
    telegraph: function (d, t, o) { var dur = Math.max(0.4, Math.min(1.4, o.dur || 0.8)); tone(d, 'sawtooth', 70, 160, t, dur, 0.12, dur * 0.8); return dur + 0.1; },
    tick: function (d, t) { tone(d, 'square', 2400, 0, t, 0.02, 0.08); return 0.04; },
    // Loot drops rise in pitch with rarity (spec §14): common tick, magic 2-note bell, rare 3-note rising, unique chord + shimmer.
    loot_common: function (d, t) { tone(d, 'triangle', 1320, 0, t, 0.05, 0.08); return 0.06; },
    loot_magic: function (d, t) { return arp(d, 'sine', 880, [0, 7], t, 0.09, 0.3, 0.12); },
    loot_rare: function (d, t) { return arp(d, 'triangle', 660, [0, 4, 7], t, 0.08, 0.35, 0.14); },
    loot_unique: function (d, t) { [0, 4, 7, 11].forEach(function (n) { tone(d, 'triangle', semi(523.25, n), 0, t, 0.8, 0.08, 0.02); }); arp(d, 'sine', 2093, [0, 2, 4, 7, 9, 12], t + 0.2, 0.06, 0.25, 0.04); return 0.9; },
    loot_set: function (d, t) { [0, 3, 7, 10].forEach(function (n) { tone(d, 'triangle', semi(392, n), 0, t, 0.55, 0.1, 0.02); }); tone(d, 'sine', 1568, 0, t + 0.12, 0.35, 0.08); return 0.55; },
    loot_rune: function (d, t) { tone(d, 'triangle', 196, 0, t, 0.22, 0.16, 0.04); tone(d, 'sine', 784, 1175, t + 0.05, 0.28, 0.12); return 0.4; },
    pickup: function (d, t) { tone(d, 'sine', 990, 1480, t, 0.07, 0.1); return 0.08; },
    phase: function (d, t) { horn(d, 82.4, t, 0.5, 0.35, 500); horn(d, 123.5, t, 0.5, 0.25, 500); return 0.6; },
    scatter: function (d, t) { // Game Over: the pack howls as it scatters (two voices gliding down with vibrato)
      tone(d, 'sawtooth', 520, 300, t, 1.4, 0.10, 0.25); tone(d, 'triangle', 392, 220, t + 0.35, 1.3, 0.09, 0.3);
      return 1.7;
    },
    hunt: function (d, t) {
      var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.connect(d);
      tone(lp, 'sawtooth', 220, 330, t, 0.9, 0.22, 0.05); tone(lp, 'sawtooth', 221.5, 331, t, 0.9, 0.16, 0.05);
      for (var i = 0; i < 6; i++) hiss(d, 'lowpass', 300, 0, 1, t + 0.2 + i * 0.16 + (i % 2) * 0.05, 0.06, 0.35);
      return 1.3;
    },
    taunt: function (d, t) { tone(d, 'sawtooth', 90, 70, t, 0.35, 0.2, 0.04); hiss(d, 'lowpass', 400, 0, 1, t, 0.3, 0.15, 0.04); return 0.4; },
    linkcut: function (d, t) { tone(d, 'square', 1200, 200, t, 0.18, 0.12); return 0.2; },
    ui_click: function (d, t) { tone(d, 'triangle', 660, 0, t, 0.04, 0.15); return 0.05; },
    ui_hover: function (d, t) { tone(d, 'sine', 880, 0, t, 0.03, 0.06); return 0.04; }
  };
  // Summon calls: a rising arpeggio in each type's key (wolf A, raven E, bear low A, vine D, spirit C#).
  Object.keys(KEY).forEach(function (type) {
    SOUNDS['summon_' + type] = function (d, t) { return arp(d, 'triangle', KEY[type], [0, 4, 7, 12], t, 0.06, 0.16, 0.16); };
  });
  // Commands: short horn blips, each with its own interval.
  var CMD = { focus: [0, 7], hold: [0, 5], trail: [0, 4, 7], heel: [0, -3], rally: [0, 12], frenzy: [0, 6, 12], encircle: [0, 9] };
  Object.keys(CMD).forEach(function (k) {
    SOUNDS['cmd_' + k] = function (d, t) { var n = CMD[k]; for (var i = 0; i < n.length; i++) horn(d, semi(196, n[i]), t + i * 0.07, 0.1, 0.12); return n.length * 0.07 + 0.12; };
  });
  SOUNDS.cmd_howl = function (d, t) {
    var lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(d);
    tone(lp, 'sawtooth', 196, 294, t, 0.7, 0.2, 0.15); tone(lp, 'sawtooth', 197.2, 296, t, 0.7, 0.14, 0.15);
    return 0.9;
  };

  // ---------- engine ----------
  function init(Ctor) {
    try {
      if (A.ctx) { if (A.ctx.state === 'suspended' && A.ctx.resume) A.ctx.resume(); return true; }
      var C = Ctor || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
      if (!C) return false;
      A.ctx = new C();
      A.master = A.ctx.createGain(); A.master.gain.value = A.muted ? 0 : A.volume;
      A.comp = A.ctx.createDynamicsCompressor();
      A.master.connect(A.comp); A.comp.connect(A.ctx.destination);
      var sr = A.ctx.sampleRate || 44100, rng = new PB.Rng(0xa0d10);
      A.noise = A.ctx.createBuffer(1, sr, sr);
      var data = A.noise.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = rng.next() * 2 - 1;
      A.rng = new PB.Rng(0x50f7);
      return true;
    } catch (err) { A.ctx = null; return false; }
  }

  function now() { return A.ctx ? A.ctx.currentTime : 0; }

  function liveVoices() {
    var t = now(), v = A.voices;
    for (var i = v.length - 1; i >= 0; i--) if (v[i] <= t) v.splice(i, 1);
    return v.length;
  }

  function panFor(x) { if (typeof x !== 'number' || !isFinite(x)) return 0; return Math.max(-1, Math.min(1, (x - A.camX) / PAN_SPAN)); }

  // opts: {pitch, gain, pan, dur, notes, root}. Returns true when a voice started.
  function play(id, opts) {
    try {
      if (!A.ctx || !SOUNDS[id]) return false;
      var t = now();
      if (A.last[id] !== undefined && t - A.last[id] < THROTTLE - 1e-9) return false;
      if (liveVoices() >= MAX_VOICES) return false;
      opts = opts || {};
      var o = { pitch: opts.pitch || (1 + (A.rng.next() - 0.5) * 0.16), dur: opts.dur, notes: opts.notes, root: opts.root };
      var out = A.ctx.createGain(); out.gain.value = opts.gain != null ? opts.gain : 1;
      var dest = out;
      if (A.ctx.createStereoPanner) { var pn = A.ctx.createStereoPanner(); pn.pan.value = opts.pan || 0; out.connect(pn); pn.connect(A.master); }
      else out.connect(A.master);
      var len = SOUNDS[id](dest, t + 0.005, o) || 0.2;
      A.last[id] = t;
      A.voices.push(t + len + 0.05);
      return true;
    } catch (err) { return false; }
  }

  function playAt(id, x, opts) { opts = opts || {}; opts.pan = panFor(x); return play(id, opts) ? id : null; }

  // sim event -> sound (spec §14). Returns the id that played, or null.
  function onEvent(ev) {
    try {
      switch (ev.type) {
        case 'hit':
        case 'crit':
          if (ev.dot) return null;
          if (ev.dstKind === 'player') return playAt('druidHit', ev.x);
          if (ev.srcKind === 'player') return playAt('whip', ev.x);
          return playAt(ev.type === 'crit' ? 'crit' : 'bite', ev.x, { gain: ev.dstKind === 'summon' ? 0.6 : 1 });
        case 'maul': return playAt('maul', ev.x);
        case 'kill':
          if (ev.team === 0) return playAt('summonDie', ev.x, { root: KEY[ev.unit] || 220 });
          return playAt(ev.elite || ev.boss ? 'eliteDeath' : 'death', ev.x);
        case 'summon': return KEY[ev.unit] ? playAt('summon_' + ev.unit, ev.x) : null;
        case 'command': return SOUNDS['cmd_' + ev.kind] ? playAt('cmd_' + ev.kind, undefined) : null;
        case 'mark':
          if (A.lastCaw >= 0 && now() - A.lastCaw < CAW_GAP - 1e-9) return null;
          var c = playAt('caw', ev.x); if (c) A.lastCaw = now(); return c;
        case 'root': case 'swallow': return playAt('root', ev.x);
        case 'quake': return playAt('maul', ev.x);
        case 'intercept': return playAt('taunt', ev.x);
        case 'scar': case 'fusion': case 'revive': return playAt('evolve', undefined);
        case 'owlslam': case 'warghowl': case 'roar': return playAt('maul', ev.x);
        case 'blink': return playAt('crit', ev.x);
        case 'skinwalk': case 'skinwalk-end': return playAt('cmd_rally', undefined);
        case 'signature': return playAt(ev.sig === 'slam' ? 'maul' : ev.sig === 'dive' ? 'caw' : 'bite', ev.x);
        case 'omen': return playAt('caw', ev.x);
        case 'taunt': return playAt('taunt', ev.x);
        case 'linkcut': return playAt('linkcut', ev.x);
        case 'levelup': return playAt('levelup', undefined);
        case 'evolve': return playAt('evolve', undefined);
        case 'telegraph':
          if (ev.boss) return playAt('telegraph', ev.x, { dur: ev.tele });
          if (ev.elite) return playAt('tick', ev.x);
          return null;
        case 'chorus': return playAt('chorus', ev.x, { notes: ev.notes });
        case 'phase': return playAt('phase', undefined);
        case 'execute': case 'volatile': case 'shockwave': case 'fenrir': case 'fenrir-split': return playAt('maul', ev.x);
        case 'wolfhowl': case 'wake': return playAt('taunt', ev.x);
        case 'briar': return playAt('caw', ev.x);
        case 'hearthbond': return playAt('loot_rune', ev.x);
        case 'denmother': return playAt('taunt', ev.x);
        case 'wreath': return playAt('root', ev.x);
        case 'hearthwake': return playAt('chorus', ev.x, { notes: [0, 7, 12] });
        case 'martyr': case 'sleep': return playAt('evolve', undefined);
        case 'feather': case 'split': return playAt('caw', ev.x);
        case 'gale': case 'thrall': return playAt('maul', ev.x);
        case 'thrall-break': case 'mimic': return playAt('linkcut', ev.x);
        case 'victory': return playAt('evolve', undefined);
        case 'drop': return playAt(ev.rarity === 'moonstone' ? 'loot_magic' : ev.rarity === 'rune' ? 'loot_rune' : 'loot_' + ev.rarity, ev.x);
        case 'pickup': return playAt('pickup', ev.x);
        case 'hunt': return playAt('hunt', undefined);
      }
    } catch (err) { /* never break the frame */ }
    return null;
  }

  function setVolume(v) { A.volume = Math.max(0, Math.min(1, +v || 0)); if (A.master && !A.muted) A.master.gain.value = A.volume; }
  function mute(on) {
    A.muted = typeof on === 'boolean' ? on : !A.muted;
    if (A.master) A.master.gain.value = A.muted ? 0 : A.volume;
    return A.muted;
  }

  function ids() { return Object.keys(SOUNDS); }

  // Plays every id once (bypassing the limiter by clearing it between calls); returns the ids that failed.
  function selfTest() {
    var bad = [];
    ids().forEach(function (id) {
      A.voices.length = 0; delete A.last[id];
      try { if (!play(id, { gain: 0.3 })) bad.push(id); } catch (err) { bad.push(id); }
    });
    return bad;
  }

  // Dev check (?test=1 + backtick): every sound in sequence, 0.45 s apart.
  function demo(setTimeoutFn) {
    var list = ids(), st = setTimeoutFn || (typeof setTimeout !== 'undefined' ? setTimeout : null);
    if (!st) return list.length;
    list.forEach(function (id, i) { st(function () { play(id); }, i * 450); });
    return list.length;
  }

  // ---------- music (E4) ----------
  // A per-zone drone (two detuned oscillators through a lowpass whose cutoff a slow LFO sweeps) and a heartbeat drum at
  // 70 + 2 x pack size + 20 x combat intensity BPM, swelling into the hunting horn when a Wild Hunt starts. The app
  // calls music(state) once per frame with {zone, pack, intensity, hunt}, or null to stop.
  var ROOTS = [55, 49, 61.74, 46.25, 41.2], AHEAD = 0.1;
  var MUS = { gain: null, level: 0.4, drone: null, zone: null, next: 0, beats: 0, hunt: false, horns: 0 };

  function musicBpm(pack, intensity) { return 70 + 2 * (pack || 0) + 20 * Math.max(0, Math.min(1, intensity || 0)); }
  function musicGain() { return MUS.level * 0.55; }
  function setMusic(v) { MUS.level = Math.max(0, Math.min(1, +v || 0)); if (MUS.gain) MUS.gain.gain.value = musicGain(); }

  function stopDrone(t) {
    var d = MUS.drone;
    if (!d) return;
    d.out.gain.setTargetAtTime(0.0001, t, 0.4);
    d.oscs.concat([d.lfo]).forEach(function (o) { o.stop(t + 2); });
    MUS.drone = null; MUS.zone = null;
  }

  function startDrone(zone, t) {
    var f = ROOTS[zone] || 55, out = A.ctx.createGain(), lp = A.ctx.createBiquadFilter(), lfo = A.ctx.createOscillator(), depth = A.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(0.16, t + 3);
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 3; lp.connect(out); out.connect(MUS.gain);
    lfo.frequency.value = 0.07; depth.gain.value = 260; lfo.connect(depth); depth.connect(lp.frequency); lfo.start(t);
    var oscs = [['sawtooth', f], ['triangle', f * 1.007]].map(function (k) {
      var o = A.ctx.createOscillator(); o.type = k[0]; o.frequency.value = k[1]; o.connect(lp); o.start(t); return o;
    });
    MUS.drone = { oscs: oscs, lfo: lfo, out: out, filter: lp }; MUS.zone = zone;
  }

  function beat(t, accent) { // lub-dub
    tone(MUS.gain, 'sine', 70, 38, t, 0.16, 0.5 * accent, 0.004);
    tone(MUS.gain, 'sine', 60, 34, t + 0.17, 0.12, 0.3 * accent, 0.004);
  }

  function music(st) {
    if (!A.ctx) return;
    var t = now();
    if (!MUS.gain) { MUS.gain = A.ctx.createGain(); MUS.gain.gain.value = musicGain(); MUS.gain.connect(A.master); }
    if (!st) { stopDrone(t); MUS.hunt = false; return; }
    if (MUS.zone !== st.zone) { stopDrone(t); startDrone(st.zone, t); }
    var gap = 60 / musicBpm(st.pack, st.intensity);
    if (MUS.next < t) MUS.next = t;
    while (MUS.next < t + AHEAD) { beat(MUS.next, 0.6 + 0.4 * Math.min(1, st.intensity || 0)); MUS.next += gap; MUS.beats++; }
    if (st.hunt && !MUS.hunt) { // the swell into the hunting horn: a rising fifth over the drone
      var f = (ROOTS[st.zone] || 55) * 4;
      horn(MUS.gain, f, t, 1.6, 0.14, 1600); horn(MUS.gain, f * 1.5, t + 0.8, 2.2, 0.12, 1800);
      MUS.horns++;
    }
    MUS.hunt = !!st.hunt;
  }

  PB.Audio = {
    music: music, musicBpm: musicBpm, setMusic: setMusic, musicState: function () { return MUS; },
    init: init, play: play, onEvent: onEvent, setVolume: setVolume, mute: mute, ids: ids, selfTest: selfTest, demo: demo,
    liveVoices: liveVoices, panFor: panFor, setListener: function (x) { A.camX = x; }, ready: function () { return !!A.ctx; },
    isMuted: function () { return A.muted; }, master: function () { return A.master; }, _noise: function () { return A.noise; },
    MAX_VOICES: MAX_VOICES
  };
})(globalThis.PB = globalThis.PB || {});
