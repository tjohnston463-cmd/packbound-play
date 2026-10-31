// Boot, the main requestAnimationFrame loop, the screen stack and the zone field. The director (sim/director.js) runs
// the waves; this file starts attempts, drains events into juice/audio/toasts and runs the canvas screens (src/app/ui).
// G.screen is the screen on top; G.stack holds the screens under it. An overlay over the field keeps 'field' in the
// stack, and the sim runs only while the field is on top or under an overlay whose pausesSim is false.
(function (PB) {
  'use strict';
  var STAT_CAP = 3600;
  var START_PACK = ['wolf', 'wolf', 'wolf', 'raven', 'raven', 'bear', 'spirit'];

  var G = {
    screen: 'boot', world: null, loop: null, q: null, seed: 1, frames: 0, kills: 0,
    juice: null, toasts: [], benchParticles: 0, sandbox: false, endT: 0, storage: null, paused: false, overlay: false, banner: null, downT: 0,
    save: null, stack: [], stored: false, waveBanner: null, endKind: null, endSummary: null, slowT: 0, slowN: 0, loadNote: null, seedParam: 0, run: null,
    stats: { gaps: [], sim: [], ren: [], totalFrames: 0, elapsedMs: 0 }, last: 0
  };

  function pushStat(a, v) { a.push(v); if (a.length > STAT_CAP) a.shift(); }

  function spawnNear(world, kind, type, d, extra) {
    var p = world.player, a = world.rng.spawn.range(0, PB.M.TAU);
    var x = PB.M.clamp(p.x + Math.cos(a) * d, 20, world.width - 20), y = PB.M.clamp(p.y + Math.sin(a) * d, 20, world.height - 20);
    return PB.World.spawn(world, kind, type, x, y, extra);
  }

  // A zone attempt run by the director (D4). save: carry an existing save (after a fall or a victory); omitted, a new
  // character starts. The starting pack answers for free each zone (the same named individuals once they exist);
  // after that the summon keys (1-5) call the roster back. zone defaults to the first unlocked zone not yet cleared.
  function newField(seed, save, zone, moon) {
    G.seed = seed >>> 0 || 1;
    save = save || PB.Save.newSave(G.seed);
    if (zone === undefined) zone = Math.min(save.progress.unlockedZone, PB.ZONES.length - 1);
    var w = PB.World.createWorld({ seed: G.seed, save: save, zone: zone, mods: PB.Mods.build(save) });
    PB.Director.start(w, zone, moon || 0);
    START_PACK.forEach(function (t, i) { var a = i / START_PACK.length * PB.M.TAU; PB.Roster.summon(w, t, w.player.x + Math.cos(a) * 40, w.player.y + Math.sin(a) * 40); });
    PB.Events.drain(w.events, function () {}); // the free muster is not news
    G.world = w; G.save = save; G.sandbox = false; G.kills = 0; G.banner = null; G.downT = 0; G.endT = 0;
    G.juice = PB.Juice.create(); G.toasts = []; G.benchParticles = 0;
    G.run = { kills: 0, choruses: 0, scars: [], dmg: {}, deeds0: {}, loot: [], moonstones: 0, runes: 0, leftBehind: 0, zone: zone, moon: moon || 0, clearedBefore: save.progress.cleared.indexOf(zone) >= 0 };
    save.roster.forEach(function (ind) { G.run.deeds0[ind.id] = JSON.parse(JSON.stringify(ind.deeds)); });
    G.endKind = null; G.endSummary = null; G.waveBanner = null;
    G.juice.settings.shake = save.settings.shake; G.juice.settings.numbers = save.settings.numbers;
    PB.Juice.setQuality(G.juice, LOW.on ? 'Low' : 'High');
    G.slowT = 0;
    G.stack = []; setScreen('field');
    if (PB.Input.reset) PB.Input.reset();
    PB.Render.follow(w, true);
    toast(PB.ZONES[zone].name + (moon ? ' (Moon ' + moon + ')' : '') + ': five waves, then ' + PB.BOSSES[PB.ZONES[zone].boss].name);
    if (!save.stats || save.stats.kills < 30) toast('Hold the mouse to lash. Space dodges. 1 calls a wolf. Right-click focuses the pack.');
    persist('zone');
    return w;
  }

  // ---------- persistence (D6) ----------
  // The save is stored on zone start, wave clear, victory, defeat, camp and unload; never mid-wave. A corrupt stored
  // save is copied to KEY + '.corrupt' by Save.load and a new character starts.
  var STORE_ON = { 'wave-clear': 1, victory: 1, defeat: 1 };
  function persist(reason) {
    if (!G.storage || !G.save) return 0;
    try { var n = PB.Save.store(G.storage, G.save); G.stored = true; return n; } catch (err) { toast('Could not save (' + reason + ')'); return 0; }
  }

  function seedFor(save) { return save ? ((save.seed + save.stats.kills + save.stats.deaths * 7919) >>> 0) || 1 : 1; }

  // opts: {storage, fresh, seed}. Loads the stored save (if any) and shows the Title. Returns the load result
  // ({status: 'ok' | 'empty' | 'corrupt' | 'fresh'}).
  function start(opts) {
    opts = opts || {};
    G.storage = opts.storage || null;
    loadQuality(G.storage); G.seedParam = opts.seed >>> 0 || 0;
    var r = opts.fresh || !G.storage ? { save: null, status: 'fresh' } : PB.Save.load(G.storage);
    G.world = null; G.save = r.status === 'ok' ? r.save : null; G.stored = r.status === 'ok';
    G.loadNote = r.status === 'corrupt' ? 'The stored save was corrupt (' + r.error + '); it is kept aside as ' + PB.Save.KEY + '.corrupt' : null;
    if (r.status === 'corrupt') toast('The stored save was corrupt (' + r.error + '); it is kept aside and a new hunt begins');
    G.stack = []; setScreen('title');
    return r;
  }

  function hasSave() { return !!(G.save && G.stored); }
  function newSeed() { return G.seedParam || ((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0) || 1; }

  // Title -> a brand-new character (stored at once).
  function newHunt() {
    G.save = PB.Save.newSave(newSeed());
    persist('new');
    toCamp();
  }
  function continueGame() { if (!G.save) G.save = PB.Save.newSave(newSeed()); toCamp(); }

  // A zone attempt for the current save; zone defaults to the first unlocked zone.
  function startZone(zone, moon) {
    if (!G.save) G.save = PB.Save.newSave(newSeed());
    return newField(seedFor(G.save), G.save, zone, moon);
  }

  // Leave the field for Hearthgrove (Abandon Hunt keeps loot, XP and roster). A run's positions are never saved.
  function toCamp() {
    persist('camp');
    G.world = null; G.stack = []; G.endKind = null;
    if (PB.Input.releaseAll) PB.Input.releaseAll();
    setScreen('camp');
  }
  function toTitle() { persist('title'); G.world = null; G.stack = []; G.stored = !!G.save; setScreen('title'); }
  function abandon() { toCamp(); }
  // Keep hunting (Victory): the cleared zone stays live under the player. cleared() is true there; Leave (Pause) or a
  // fall brings Victory back, after pulling what dropped since into the bag and storing the save.
  function cleared() { return !!(G.world && G.endKind === 'victory' && G.endT <= 0); }
  function leaveCleared() {
    if (!cleared()) return;
    lootShower(G.world); persist('victory');
    G.stack = ['field']; setScreen('victory');
  }

  // After a screen changed the save through a sim API: the live field takes the new mods (life % kept). At camp the
  // save is stored at once; in the field it waits for the next store point (never mid-wave).
  function afterSaveChange() {
    if (G.world) PB.Mods.apply(G.world);
    else persist('camp');
  }

  // I / K / J open (or close) Inventory, Skills and Pack over the field or the camp; one menu replaces another.
  var MENUS = { inventory: 1, skills: 1, pack: 1 }; // each is also the key-map action that toggles it
  function menuKey(code) {
    var target = PB.Input.KEYMAP[code];
    if (!MENUS[target] || !G.save) return false;
    if (G.screen === target) { close(); return true; }
    if (MENUS[G.screen]) close();
    if (G.screen !== 'field' && G.screen !== 'camp') return false;
    open(target);
    return true;
  }

  // ---------- screens ----------
  function screenDef(name) { return (PB.Screens || {})[name] || null; }
  function setScreen(name, opts) {
    var old = screenDef(G.screen);
    if (old && old.exit && G.screen !== name) old.exit(G);
    G.screen = name;
    var def = screenDef(name);
    if (def && def.enter && !(opts && opts.back)) def.enter(G, opts || {});
    G.paused = !simRunning();
  }
  function open(name, opts) { if (G.screen === name) return; G.stack.push(G.screen); setScreen(name, opts); }
  function close() {
    var back = G.stack.length ? G.stack.pop() : G.world ? 'field' : 'title';
    setScreen(back, { back: true });
  }
  function pausesSim(name) { var d = screenDef(name); if (!d) return false; return typeof d.pausesSim === 'function' ? d.pausesSim(G) : !!d.pausesSim; }
  function simRunning() {
    if (!G.world) return false;
    if (G.screen === 'field') return true;
    return G.stack.indexOf('field') >= 0 && !pausesSim(G.screen);
  }
  function showsWorld() { return !!G.world && (G.screen === 'field' || G.stack.indexOf('field') >= 0); }

  // One UI frame: the screen on top draws (and handles its clicks), then tooltips and red reasons go on top.
  function uiFrame(g, dt) {
    PB.UI.beginFrame(dt);
    var def = screenDef(G.screen);
    if (def && def.draw) def.draw(g, G, dt);
    if (G.screen === 'camp' || G.screen === 'title') drawToasts(g); // modal panels keep their buttons clear
    PB.UI.drawOverlay(g);
    G.paused = !simRunning();
  }

  function drawToasts(g) {
    for (var k = 0; k < G.toasts.length; k++) {
      var tt = G.toasts[k], fade = Math.min(1, (tt.life - tt.t) / 0.4);
      PB.UI.text(g, tt.text, 640, 680 - k * 20, PB.UI.font(14), 'rgba(255,214,160,' + fade.toFixed(3) + ')', 'center');
    }
  }

  function applySettings() {
    var st = G.save && G.save.settings;
    if (!st) return;
    PB.Audio.setVolume(st.volume);
    if (PB.Audio.setMusic) PB.Audio.setMusic(st.music);
    if (G.juice) { G.juice.settings.shake = st.shake; G.juice.settings.numbers = st.numbers; }
  }

  // Export / Import through the browser's own prompt box (the game has no DOM UI of its own).
  function promptExport() {
    if (!G.save || typeof window === 'undefined' || !window.prompt) return null;
    var text = exportSave();
    if (text === null) return null;
    window.prompt('Copy your save (Ctrl+C) and keep it somewhere safe:', text);
    return text;
  }
  function promptImport() {
    if (typeof window === 'undefined' || !window.prompt) return null;
    var text = window.prompt('Paste an exported save:', '');
    return text ? importSave(text) : null;
  }

  // Native btoa/atob must be called on the global ("Illegal invocation" otherwise), so they go through wrappers.
  function b64() { return PB.Game.b64 || { enc: function (s) { return globalThis.btoa(s); }, dec: function (s) { return globalThis.atob(s); } }; }
  // A failed export says why and returns null; it never throws out of the frame loop.
  function exportSave() {
    try { return b64().enc(unescape(encodeURIComponent(PB.Save.serialize(G.save)))); }
    catch (err) { toast('Export failed: ' + ((err && err.message) || err)); return null; }
  }
  // Only a save that passes nested validation is stored; a rejected import leaves the current save in place.
  function importSave(text) {
    var json;
    try { json = decodeURIComponent(escape(b64().dec(String(text).trim()))); } catch (err) { return { ok: false, error: 'decode' }; }
    var r = G.storage ? PB.Save.importText(G.storage, json) : PB.Save.parse(json);
    if (!r.ok) { toast('Import refused: ' + r.error); return r; }
    G.save = r.save; G.stored = true; G.world = null;
    toCamp();
    toast('Save imported');
    return r;
  }

  function fusionName(id) {
    for (var k in PB.FUSIONS) if (PB.FUSIONS[k].id === id) return PB.FUSIONS[k].name;
    for (var a in PB.ALPHA) if (PB.ALPHA[a].id === id) return PB.ALPHA[a].name;
    return id;
  }
  var FAIL_TEXT = { none: 'no summon within 300px', cooldown: 'not ready yet', down: 'not now', far: 'walk to the shrine', nothing: 'nobody is ready (Tier II pair + Moonstones, or a summon ready to evolve)', 'no-shrine': 'no shrine here', meter: 'the Chorus is not full', active: 'already running', cap: 'at its cap', den: 'resting in the Den', spirit: 'not enough Spirit', life: 'not enough Life', 'roster-full': 'roster is full', stunned: 'stunned', asleep: 'asleep' };
  function toast(text) { G.toasts.push({ text: text, t: 0, life: 3 }); if (G.toasts.length > 4) G.toasts.shift(); }

  function simStep() {
    PB.Graphics.capture(G.world);
    var f = PB.InputQueue.peek(G.q);
    if (!PB.World.step(G.world, f)) return; // hit-stop: keep the input queued
    PB.InputQueue.consume(G.q, f);
  }

  // Toasts and persistence for one sim event (juice and audio take every event in drainEvents).
  function onEvent(e) {
    var w = G.world, run = G.run;
    if ((e.type === 'hit' || e.type === 'crit') && e.srcKind === 'summon' && run && w) { // MVP by damage (the victory summary)
      var src = w.byId[e.src];
      if (src && src.indId) run.dmg[src.indId] = (run.dmg[src.indId] || 0) + (e.amount || 0);
      return;
    }
    if (e.type === 'chorus' && run) run.choruses++;
    if (e.type === 'pickup' && run) { // the victory list
      if (e.uid != null) run.loot.push({ uid: e.uid, name: e.name, rarity: e.rarity });
      else if (e.rune) run.runes = (run.runes || 0) + 1;
      else run.moonstones += e.moonstones || 0;
    }
    if (e.type === 'moonstone' && run) run.moonstones += e.n || 0;
    if (e.type === 'shrine-open') { if (G.screen === 'field') open('altar', { field: true }); return; }
    if (e.type === 'kill' && PB.BOSSES[e.unit]) { G.slowT = SLOW_T; G.slowN = 0; } // the boss falls in slow motion
    if (e.type === 'boss-cast') {
      var attackTitle = {
        antlersweep: 'Antler Sweep', stampede: 'Stampede', calltherot: 'Call the Rot', thornstorm: 'Thornstorm',
        pillars: 'Pillars', meteors: 'Meteors', brood: 'Brood', flamewave: 'Flame Wave',
        thrall: 'Thrall', frostbreath: 'Frost Breath', icelance: 'Ice Lance', whiteout: 'Whiteout',
        divebomb: 'Dive Bomb', chainbolt: 'Chain Bolt', stormcage: 'Storm Cage', galeforce: 'Galeforce',
        sever: 'Sever', mimic: 'Mimic', grasp: 'Grasp', unmaking: 'Unmaking'
      }[e.atk] || e.atk;
      G.waveBanner = { text: attackTitle, sub: 'dodge the mark', t: 0, life: 1.6 };
    }
    if (e.type === 'kill') {
      if (PB.ENEMIES[e.unit] || PB.BOSSES[e.unit]) { G.kills++; if (run) run.kills++; } // the body is already compacted away
      if (e.elite && w.dir && PB.Waves.isQuarry(w.dir, e.unit)) toast('Quarry down: ' + ((PB.ENEMIES[e.unit] || {}).name || e.unit));
    } else if (e.type === 'den' && w.inds && w.inds[e.indId] && PB.Roster.activeCount(w, w.inds[e.indId].type) === 0) {
      var heldFor = Math.max(1, Math.ceil((e.until || 0) - w.time));
      toast(w.inds[e.indId].name + ' was the last ' + w.inds[e.indId].type + '. Den ' + heldFor + 's');
    } else if (e.type === 'levelup' && e.who === 'player' && w.save) {
      var leftPts = PB.Skills.pointsLeft(w.save.player);
      toast('Level ' + e.level + '. ' + PB.Input.keyOf('skills') + ' spends ' + leftPts + ' point' + (leftPts === 1 ? '' : 's'));
    } else if (e.type === 'summon-fail') {
      var name = PB.SUMMONS[e.unit] ? PB.SUMMONS[e.unit].name : e.unit;
      toast(name + ': ' + (FAIL_TEXT[e.reason] || e.reason));
    } else if (e.type === 'command-fail') toast(e.kind + ': ' + (e.reason === 'cooldown' && e.left > 0 ? 'ready in ' + Math.ceil(e.left) + 's' : FAIL_TEXT[e.reason] || e.reason));
    else if (e.type === 'scar') {
      var si = w.inds[e.indId], sc = PB.SCARS.filter(function (x) { return x.id === e.scar; })[0];
      if (si && sc) { toast(si.name + ' earned the ' + sc.name + ' scar'); if (run) run.scars.push(si.name + ' earned ' + sc.name + ' (' + sc.text + ')'); }
    } else if (e.type === 'fusion') toast('Fused: ' + e.name + ' (' + fusionName(e.unit) + ')');
    else if (e.type === 'evolve') { var vi = w.inds[e.indId]; if (vi) toast(vi.name + ' evolved' + (e.name ? ' into a ' + e.name : '')); }
    else if (e.type === 'pickup-fail') toast('Inventory full (40): the drop stays on the ground');
    else if (e.type === 'pickup' && e.rune) toast(e.name);
    else if (e.type === 'hearthbond') toast('Hearthbond keeps a summon on its feet');
    else if (e.type === 'pickup' && e.name && e.rarity === 'set') toast('Set: ' + e.name);
    else if (e.type === 'pickup' && e.name && (e.rarity === 'rare' || e.rarity === 'unique' || (e.upgrade && e.rarity === 'magic'))) toast((e.upgrade ? 'Better: ' : 'Found ') + e.name);
    else if (e.type === 'moonstone') toast('+' + e.n + ' Moonstones');
    else if (e.type === 'dust') toast('+' + e.n + ' Dust');
    else if (e.type === 'boss-cast' && e.atk === 'thrall') toast('Thrall! Rally (' + PB.Input.keyOf('rally') + ') before the tether completes');
    else if (e.type === 'boss-cast' && e.atk === 'sever') toast('Sever! Hold (RMB ground) the pack inside a glowing circle');
    else if (e.type === 'thrall') toast('A summon is thralled for 10s');
    else if (e.type === 'thrall-break') toast('Rally broke the Thrall');
    else if (e.type === 'mimic') toast('The Unmaker copies ' + e.name);
    else if (e.type === 'phase') toast((PB.BOSSES[e.unit] || {}).name + ' grows desperate');
    else if (e.type === 'wave') {
      var quarryName = w.dir ? ((PB.ENEMIES[PB.Waves.quarry(w.dir.zone, w.dir.moon)] || {}).name || '') : '';
      G.waveBanner = e.boss ? { text: 'The boss comes', sub: (PB.BOSSES[PB.ZONES[w.dir.zone].boss] || {}).name, t: 0, life: 2.6 }
                            : { text: 'Wave ' + e.wave, sub: e.count + ' enemies · the wood wants ' + quarryName, t: 0, life: 2.2 };
    }
    else if (e.type === 'wave-clear') {
      var remind = w.save ? PB.Skills.pointsLeft(w.save.player) : 0;
      var lying = w.drops ? w.drops.length : 0, meals = w.corpses ? w.corpses.length : 0;
      toast('Wave ' + e.wave + ' cleared: Lull 8s' + (lying ? '. ' + lying + ' on the ground' : '') + (meals ? '. ' + meals + ' to eat' : '') + (remind ? '. ' + PB.Input.keyOf('skills') + ': ' + remind + ' skill point' + (remind === 1 ? '' : 's') : ''));
    }
    else if (e.type === 'echoes-linger') toast('The Echoes linger for 10s');
    else if (e.type === 'shrine') toast('A Fusion Shrine grows out of the ground');
    else if (e.type === 'grove') toast(e.cursed ? 'A ' + e.name + ' stands in the wood. It bites, and the next kill pays a rune.' : 'A ' + e.name + ' stands in the wood.');
    else if (e.type === 'grove-take') toast(e.text || e.name);
    else if (e.type === 'evolve-ready') { var ei = w.inds[e.indId]; if (ei) toast(ei.name + ' is ready to evolve'); }
    if (e.type === 'pickup' && e.uid != null && w.save && PB.Drops.bagCount(w.save) === 36) toast('Bag is getting full. 36 of 40. Render at camp.');
    if (STORE_ON[e.type]) persist(e.type);
  }

  function drainEvents(dt) {
    var w = G.world, j = G.juice;
    PB.Audio.setListener(PB.Render.cam.x);
    PB.Events.drain(w.events, function (e) {
      PB.Juice.onEvent(j, e, w);
      PB.Audio.onEvent(e);
      onEvent(e);
    });
    if (G.benchParticles && PB.Debug) PB.Debug.topUpParticles(G);
    PB.Juice.trails(j, w, dt);
    PB.Juice.update(j, G.slowT > 0 ? dt * SLOW_JUICE : dt);
    tickToasts(dt);
    if (G.waveBanner) { G.waveBanner.t += dt; if (G.waveBanner.t >= G.waveBanner.life) G.waveBanner = null; }
  }

  function tickToasts(dt) { for (var k = G.toasts.length - 1; k >= 0; k--) { G.toasts[k].t += dt; if (G.toasts[k].t >= G.toasts[k].life) G.toasts.splice(k, 1); } }

  // Spec §16: a fall shows Game Over after 1.5 s (the director has stored the defeat); a victory shows the summary
  // after the boss's slow-motion death and 3 s more to watch its loot fall, when the loot shower has pulled every drop
  // on the ground into the bag (the summary lists what this zone gave).
  var DEFEAT_DELAY = 1.5, VICTORY_DELAY = 4;
  function endTick(dt) {
    var w = G.world;
    if (!w) return;
    if (cleared()) { // kept hunting after the boss: a fall only ends the stay, the clear is already stored
      if (w.player.hp <= 0 && simRunning()) { toast('You fell, but ' + PB.ZONES[w.dir.zone].name + ' stays cleared'); leaveCleared(); }
      return;
    }
    if (G.endKind && G.endT <= 0) return;
    var p = w.player, d = w.dir;
    if (G.endKind) {
      G.endT -= dt;
      if (G.endT > 0) return;
      if (G.endKind === 'victory') { lootShower(w); open('victory'); } else open('gameover');
      persist(G.endKind);
      return;
    }
    if (p.hp <= 0 || (d && d.state === 'defeat')) { G.endKind = 'defeat'; G.endT = DEFEAT_DELAY; }
    else if (d && d.state === 'victory') { G.endKind = 'victory'; G.endT = VICTORY_DELAY; }
  }

  function lootShower(w) {
    var left = 0;
    for (var i = w.drops.length - 1; i >= 0; i--) if (!w.drops[i].discarded && !PB.Drops.take(w, w.drops[i])) left++; // what the player dropped stays dropped
    PB.Events.drain(w.events, function (e) { PB.Juice.onEvent(G.juice, e, w); PB.Audio.onEvent(e); onEvent(e); });
    if (G.run) G.run.leftBehind = left;
    if (left) toast(left + ' drops did not fit in the bag');
  }

  // Escape closes a menu (Inventory, Skills, Pack, Altar) back to what was under it. Escape / P (or P's rebinding) open
  // Pause over any other screen but the Title, and close it again (P also pauses over a menu). Other keys go to the
  // screen on top.
  var ESC_CLOSES = { inventory: 1, skills: 1, pack: 1, altar: 1 };
  function onKey(code) {
    if (code === 'Escape' && ESC_CLOSES[G.screen]) { close(); return true; }
    if (code === 'Escape' || PB.Input.KEYMAP[code] === 'pause') {
      if (G.screen === 'pause') { close(); return true; }
      if (G.screen === 'title' || G.screen === 'boot') return false;
      open('pause');
      return true;
    }
    if (menuKey(code)) return true;
    var def = screenDef(G.screen);
    return !!(def && def.key && def.key(code, G));
  }
  // Slow motion (a boss death): for SLOW_T seconds the sim keeps its fixed step but advances only every 3rd frame,
  // and juice runs at 0.3x, so the fall reads.
  var SLOW_T = 1, SLOW_JUICE = 0.3;
  function simFrame(dt) {
    G.paused = !simRunning();
    if (G.paused) return 0;
    if (G.slowT > 0) { G.slowT -= dt; G.slowN++; return G.slowN % 3 === 0 ? PB.Loop.advance(G.loop, dt) : 0; }
    return PB.Loop.advance(G.loop, dt);
  }

  // Quality belongs to presentation settings, never the deterministic character save. CHOSEN is what the player
  // picked (stored); an automatic drop lasts for this session only, so the next session tries the chosen value again.
  var LOW = { on: false, allowed: true, auto: true, dropped: false, chosen: 'High' }, qualityState = PB.Graphics.quality();
  function applyQuality(value) {
    qualityState = PB.Graphics.quality(value, LOW.auto && LOW.allowed); LOW.on = qualityState.value === 'Low';
    if (G.juice) PB.Juice.setQuality(G.juice, qualityState.value);
    if (PB.Render.setLowEnd) PB.Render.setLowEnd(LOW.on);
  }
  function lowEndTick(gapMs) {
    if (LOW.allowed && PB.Graphics.sample(qualityState, gapMs)) {
      applyQuality('Low'); LOW.dropped = true; G.autoDrops = (G.autoDrops || 0) + 1;
      toast('Frames were slow, so Quality is Low for this session (Settings > Quality turns High back on)');
    }
    return LOW.on;
  }
  function setQuality(value, store) {
    LOW.allowed = true; LOW.dropped = false; LOW.chosen = value === 'Low' ? 'Low' : 'High';
    applyQuality(LOW.chosen);
    if (store !== false) PB.Graphics.save(G.storage, LOW.chosen, LOW.auto);
    return qualityState.value;
  }
  function setAutoDrop(on) {
    LOW.auto = !!on; qualityState.auto = LOW.auto && LOW.allowed; qualityState.bad = 0;
    PB.Graphics.save(G.storage, LOW.chosen, LOW.auto);
    return LOW.auto;
  }
  function loadQuality(storage) {
    var s = PB.Graphics.loadSettings(storage);
    LOW.auto = s.auto; setQuality(s.quality, false);
  }
  function quality() { return qualityState.value; }
  function autoDrop() { return LOW.auto; }
  function autoDropped() { return LOW.dropped; }
  // Kept for older debug consumers: High with automatic drops off for this page.
  function toggleLowEnd() { setQuality('High', false); LOW.allowed = false; qualityState.auto = false; return lowEnd(); }
  function lowEnd() { return { on: LOW.on, allowed: LOW.allowed }; }

  // Music follows the screen: the zone drone and heartbeat in the field, a calm drone at camp, silence on the Title.
  function musicTick() {
    if (!PB.Audio.music || !PB.Audio.ready()) return;
    var w = G.world;
    if (showsWorld()) {
      var an = w.anchor || w.player, near = 0;
      for (var i = 0; i < w.ents.length; i++) { var e = w.ents[i]; if (e.team === 1 && !e.dead && (e.x - an.x) * (e.x - an.x) + (e.y - an.y) * (e.y - an.y) < 250000) near++; }
      PB.Audio.music({ zone: w.zoneIdx || 0, pack: w.counts.summon, intensity: near / 20, hunt: !!w.hunt });
    } else PB.Audio.music(G.screen === 'title' || G.screen === 'boot' ? null : { zone: 'camp', pack: 0, intensity: 0, hunt: false });
  }

  function avg(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }

  function frame(now) {
    var gap = G.last ? now - G.last : 1000 / 60;
    G.last = now; G.lastGap = gap;
    if (G.frames > 0) { pushStat(G.stats.gaps, gap); G.stats.totalFrames++; G.stats.elapsedMs += gap; }
    G.frames++;
    var dt = Math.min(gap, 250) / 1000;
    if (G.world) PB.Input.refresh();
    var t0 = performance.now();
    var steps = G.world ? simFrame(dt) : 0;
    var t1 = performance.now();
    if (steps > 0) pushStat(G.stats.sim, (t1 - t0) / steps);
    if (simRunning()) { drainEvents(dt); endTick(dt); } else tickToasts(dt);
    if (G.screen === 'field' && G.frames > 30 && !document.hidden) lowEndTick(gap);
    else { qualityState.bad = qualityState.elapsed = qualityState.frames = 0; }
    musicTick();
    // Level 9 sprites bake between frames: freely on menus, only cheap frames in the field.
    if (PB.Sculpt && !document.hidden) PB.Sculpt.tick(G.screen === 'field' ? 3 : 12, G.screen === 'field');
    var t2 = performance.now();
    if (showsWorld()) {
      PB.Render.follow(G.world, false, dt, simRunning() ? G.loop.acc / G.loop.dt : 1);
      PB.Render.draw(G.world, G.juice, fieldInfo(now / 1000));
    } else PB.Render.clear();
    uiFrame(PB.Render.ctx(), dt);
    pushStat(G.stats.ren, performance.now() - t2);
    if (G.frames % 15 === 0) phoneTick();
    requestAnimationFrame(frame);
  }

  // What Render.draw paints over the field. Under Victory or Game Over (even with Pause on top) the field is only a
  // backdrop: no HUD, no damage numbers, so the summary reads.
  function fieldInfo(now) {
    var end = G.screen === 'victory' || G.screen === 'gameover' || G.stack.indexOf('victory') >= 0 || G.stack.indexOf('gameover') >= 0;
    return { kills: G.kills, banner: G.banner, toasts: G.screen === 'field' ? G.toasts : [], labels: !!(G.q && G.q.held && G.q.held.labels),
             overlay: G.overlay && !end ? overlayLines() : null, now: now, dt: Math.min(0.1, (G.lastGap || 16.667) / 1000), alpha: simRunning() && G.loop ? G.loop.acc / G.loop.dt : 1, waveBanner: G.waveBanner, end: end };
  }

  function overlayLines() {
    var r = fpsReport(), w = G.world;
    return ['fps ' + r.median.toFixed(1) + '  p5 ' + r.p5.toFixed(1),
            'sim ' + r.simMsAvg.toFixed(3) + ' ms/step', 'render ' + r.renderMsAvg.toFixed(3) + ' ms/frame',
            'summons ' + w.counts.summon + '  enemies ' + w.counts.enemy + '  ents ' + w.ents.length + '  particles ' + G.juice.n];
  }

  function pct(a, p) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

  function fpsReport() {
    var gm = pct(G.stats.gaps, 0.5), g95 = pct(G.stats.gaps, 0.95);
    return { mean: G.stats.elapsedMs ? 1000 * G.stats.totalFrames / G.stats.elapsedMs : 0,
             totalFrames: G.stats.totalFrames, elapsedMs: G.stats.elapsedMs,
             median: gm ? 1000 / gm : 0, p5: g95 ? 1000 / g95 : 0, frames: G.stats.gaps.length,
             simMsAvg: avg(G.stats.sim), renderMsAvg: avg(G.stats.ren) };
  }

  // Four times a second, when the phone panel is showing (narrow portrait screens only), repeat the key numbers there.
  function phoneTick() {
    var el = document.getElementById('phone-status'), box = document.getElementById('phone');
    if (!el || !box || box.offsetParent === null) return;
    el.textContent = G.world && showsWorld() ? PB.HUD.phoneLines(G.world, G).join('\n') : G.screen === 'title' ? 'Tap New Hunt or Continue above.' : '';
  }

  function resetStats() { G.stats = { gaps: [], sim: [], ren: [], totalFrames: 0, elapsedMs: 0 }; }

  function boot() {
    var canvas = document.getElementById('game');
    PB.Render.init(canvas);
    G.q = PB.Input.attach(canvas, { screenToWorld: PB.Render.screenToWorld, screenToUI: PB.Render.screenToUI });
    PB.Input.gate = { ui: function () { return G.screen !== 'field'; }, sim: simRunning };
    G.loop = PB.Loop.create(simStep);
    // Audio starts (or resumes) on the first user gesture; M (or its rebinding) mutes. Neither reaches the sim. A key
    // the Settings rebinder took (pbCaptured) is not also a command.
    var wake = function () { PB.Audio.init(); };
    window.addEventListener('keydown', function (e) {
      wake(); if (e.pbCaptured || e.repeat || e.ctrlKey || e.metaKey) return;
      if (PB.Input.KEYMAP[e.code] === 'mute') PB.Audio.mute(); else onKey(e.code);
    });
    PB.Input.onCode = function (code) { wake(); if (PB.Input.KEYMAP[code] === 'mute') PB.Audio.mute(); else onKey(code); }; // a bound mouse button
    window.addEventListener('mousedown', wake);
    var storage = null;
    try { storage = window.localStorage; storage.getItem(PB.Save.KEY); } catch (err) { storage = null; } // file:// in Chrome has localStorage
    PB.Input.loadBinds(storage);
    var sm = /[?&]seed=(\d+)/.exec(location.search);
    start({ storage: storage, fresh: /[?&]fresh=1/.test(location.search), seed: sm ? +sm[1] : 0 });
    window.addEventListener('beforeunload', function () { persist('unload'); });
    if (G.save) { PB.Audio.setVolume(G.save.settings.volume); PB.Audio.setMusic(G.save.settings.music); }
    if (PB.Debug) PB.Debug.install(G);
    canvas.focus();
    requestAnimationFrame(frame);
  }

  PB.Game = { boot: boot, G: G, newField: newField, start: start, persist: persist, hasSave: hasSave, newHunt: newHunt, continueGame: continueGame,
              startZone: startZone, toCamp: toCamp, abandon: abandon, cleared: cleared, leaveCleared: leaveCleared, open: open, close: close, setScreen: setScreen, simRunning: simRunning,
              showsWorld: showsWorld, fieldInfo: fieldInfo, uiFrame: uiFrame, applySettings: applySettings, promptExport: promptExport, promptImport: promptImport, toast: toast,
              onEvent: onEvent, onKey: onKey, simFrame: simFrame, exportSave: exportSave, importSave: importSave, endTick: endTick,
              afterSaveChange: afterSaveChange, toTitle: toTitle, lowEndTick: lowEndTick, lowEnd: lowEnd, toggleLowEnd: toggleLowEnd, setQuality: setQuality, quality: quality, setAutoDrop: setAutoDrop, autoDrop: autoDrop, autoDropped: autoDropped,
              fpsReport: fpsReport, resetStats: resetStats, spawnNear: spawnNear, fusionName: fusionName };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', boot);
})(globalThis.PB = globalThis.PB || {});
