// Save format v1 + migrations. Storage is injected (localStorage in the browser, a Map shim in tests).
// parse() back-fills missing nested defaults, then validates every record the game later dereferences,
// so an accepted save never crashes Skills, Loot.aggregate, Evolution.statsFor or the roster.
(function (PB) {
  'use strict';
  var KEY = 'packbound.save.v1';
  var VERSION = 1;
  var MIGRATIONS = {
    // 0: function (s) { ...; s.version = 1; return s; }  // pattern for future versions
  };
  var SLOTS = ['staff', 'mask', 'pelt', 'talisman', 'charm1', 'charm2'];

  function newSave(seed, classId) {
    return {
      version: VERSION, seed: seed >>> 0, nextIndId: 1, nextItemId: 1,
      player: { level: 1, xp: 0, skills: {}, bonusPoints: 0, classId: PB.Classes.normalize(classId) },
      roster: [], inventory: [], equipped: { staff: null, mask: null, pelt: null, talisman: null, charm1: null, charm2: null },
      currency: { moonstones: 0, dust: 0 },
      belt: { life: 2, spirit: 2, moon: 0 },
      runes: PB.Runes.emptyPouch(), cubeRolls: 0, gambleRolls: 0,
      progress: { unlockedZone: 0, cleared: [], moon: 0, bestMoon: 0, moonCleared: {} }, // moonCleared: Moon tier -> zones cleared at it
      echoes: [],
      codex: { fusions: {}, uniques: {}, enemies: {} },
      settings: { volume: 0.7, music: 0.4, shake: 1, numbers: true },
      stats: { playSeconds: 0, kills: 0, deaths: 0, summons: 0 }
    };
  }

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isInt(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }
  function isNum(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }

  // Missing keys (at any depth of the default shape) are copied from a fresh save. Present keys are kept as-is.
  function fill(dst, src) {
    for (var k in src) {
      if (dst[k] === undefined) dst[k] = JSON.parse(JSON.stringify(src[k]));
      else if (isObj(src[k]) && isObj(dst[k]) && Object.keys(src[k]).length) fill(dst[k], src[k]);
    }
  }

  function summonTypeKnown(t) {
    if (PB.SUMMONS[t]) return true;
    for (var k in PB.FUSIONS) if (PB.FUSIONS[k].id === t) return true;
    for (var a in PB.ALPHA) if (PB.ALPHA[a].id === t) return true;
    return false;
  }
  function scarKnown(id) { return PB.SCARS.some(function (x) { return x.id === id; }); }
  // A bonded fusion's two parents (Fusion.fuse): Evolution reads their tags (or type), the Pack screen their names.
  function parentsOk(ff) {
    return Array.isArray(ff) && ff.length === 2 && ff.every(function (p) {
      return isObj(p) && typeof p.name === 'string' && !!PB.SUMMONS[p.type] &&
        (p.tags === undefined || (Array.isArray(p.tags) && p.tags.every(function (t) { return typeof t === 'string'; })));
    });
  }

  function validateInd(ind, ids) {
    if (!isObj(ind)) return 'roster-entry';
    if (!isInt(ind.id, 1, 1e9) || ids[ind.id]) return 'roster-id';
    ids[ind.id] = true;
    if (!summonTypeKnown(ind.type)) return 'roster-type';
    if (typeof ind.name !== 'string' || !ind.name) return 'roster-name';
    if (!isInt(ind.level, 1, PB.Evolution.MAX_LEVEL) || !isNum(ind.xp, 0, 1e9)) return 'roster-level';
    if (!isInt(ind.tier, 1, 3)) return 'roster-tier';
    if (ind.branch !== null && ind.branch !== 'A' && ind.branch !== 'B') return 'roster-branch';
    if (ind.tier >= 2 && !ind.fusedFrom && !ind.branch) return 'roster-branch';
    if (ind.infusion !== null && PB.ESSENCES.indexOf(ind.infusion) < 0) return 'roster-infusion';
    if (!isObj(ind.diet) || !PB.ESSENCES.every(function (e) { return isNum(ind.diet[e], 0, 1e9); })) return 'roster-diet';
    if (!Array.isArray(ind.scars) || ind.scars.length > PB.MAX_SCARS || !ind.scars.every(scarKnown)) return 'roster-scars';
    if (!isObj(ind.deeds)) return 'roster-deeds';
    for (var k in PB.Evolution.newDeeds()) if (k !== 'firstborn' && !isNum(ind.deeds[k], 0, 1e12)) return 'roster-deeds';
    if (ind.fusedFrom !== null && !parentsOk(ind.fusedFrom)) return 'roster-fused';
    return null;
  }

  // An Echo (Camp.enshrine) is read by camp, Mods, the Chorus roll call and the Crown's linger ghosts.
  function validateEcho(m, ids) {
    if (!isObj(m)) return 'echo-entry';
    if (!isInt(m.id, 1, 1e9) || ids[m.id]) return 'echo-id';
    ids[m.id] = true;
    if (!summonTypeKnown(m.type) || typeof m.name !== 'string' || !m.name) return 'echo-type';
    if (!isInt(m.level, 1, PB.Evolution.MAX_LEVEL) || !isInt(m.tier, 1, 3)) return 'echo-level';
    if (!Array.isArray(m.scars) || !m.scars.every(scarKnown)) return 'echo-scars';
    if (m.branch != null && m.branch !== 'A' && m.branch !== 'B') return 'echo-branch';
    if (m.infusion != null && PB.ESSENCES.indexOf(m.infusion) < 0) return 'echo-infusion';
    if (m.fusedFrom != null && !parentsOk(m.fusedFrom)) return 'echo-fused';
    return null;
  }

  function validateItem(it, uids) {
    if (!isObj(it)) return 'item-entry';
    if (!isInt(it.uid, 1, 1e9) || uids[it.uid]) return 'item-uid';
    uids[it.uid] = it;
    var base = PB.BASE_BY_ID[it.base];
    if (!base || base.slot !== it.slot) return 'item-base';
    if (!PB.RARITIES.some(function (r) { return r.id === it.rarity; })) return 'item-rarity';
    if (!isInt(it.ilvl, 1, 1000)) return 'item-ilvl';
    if (!Array.isArray(it.affixes) || !it.affixes.every(function (x) { return isObj(x) && PB.AFFIX_BY_ID[x.id] && isNum(x.value, -1e6, 1e6); })) return 'item-affix';
    if (it.unique !== null && !PB.UNIQUES.some(function (u) { return u.id === it.unique; })) return 'item-unique';
    // A missing set field is an old save. A set piece must be a known piece on its own base, and never a rune base.
    if (it.rarity === 'set') {
      if (it.unique) return 'item-set';
      var piece = PB.SET_PIECE_BY_ID[it.set];
      if (!piece || piece.base !== it.base) return 'item-set';
      if (it.sockets && it.sockets.length) return 'item-set';
    } else if (it.set) return 'item-set';
    if (it.sockets != null) {
      var cap = PB.Runes.cap(base.slot);
      if (!Array.isArray(it.sockets) || it.sockets.length > cap) return 'item-sockets';
      if (!it.sockets.every(function (id) { return !!PB.RUNE_BY_ID[id]; })) return 'item-sockets';
    }
    return null;
  }

  function validate(s) {
    if (!isObj(s)) return 'not-object';
    if (typeof s.version !== 'number') return 'no-version';
    if (!isInt(s.nextIndId, 1, 1e9) || !isInt(s.nextItemId, 1, 1e9)) return 'counters';
    var p = s.player;
    if (!isObj(p) || !isInt(p.level, 1, PB.Progression.PLAYER_MAX) || !isNum(p.xp, 0, 1e12) || !isInt(p.bonusPoints, 0, 100)) return 'player';
    if (p.classId != null && !PB.Classes.get(p.classId)) return 'player-class';
    if (!isObj(p.skills)) return 'skills';
    var spent = 0;
    for (var id in p.skills) {
      var node = PB.SKILL_BY_ID[id];
      if (!node || !isInt(p.skills[id], 0, node.max)) return 'skills';
      spent += p.skills[id];
    }
    if (spent > PB.Skills.pointsTotal(p)) return 'skills-overspent';
    if (!Array.isArray(s.roster) || s.roster.length > PB.Roster.ROSTER_MAX || !Array.isArray(s.inventory) || !Array.isArray(s.echoes)) return 'arrays';
    var ids = {}, uids = {}, err, i;
    for (i = 0; i < s.roster.length; i++) if ((err = validateInd(s.roster[i], ids))) return err;
    for (i = 0; i < s.inventory.length; i++) if ((err = validateItem(s.inventory[i], uids))) return err;
    for (i = 0; i < s.echoes.length; i++) if ((err = validateEcho(s.echoes[i], ids))) return err;
    if (!isObj(s.equipped)) return 'equipped';
    var used = {};
    for (i = 0; i < SLOTS.length; i++) {
      var uid = s.equipped[SLOTS[i]];
      if (uid === null) continue;
      var item = uids[uid];
      if (!item || used[uid] || PB.Loot.slotFamily(SLOTS[i]) !== item.slot) return 'equipped-ref';
      used[uid] = true;
    }
    var c = s.currency, g = s.progress;
    if (!isObj(c) || !isInt(c.moonstones, 0, 1e9) || !isInt(c.dust, 0, 1e9)) return 'currency';
    var belt = s.belt, beltCap = PB.Belt ? PB.Belt.CAP : { life: 8, spirit: 8, moon: 4 };
    if (!isObj(belt) || !isInt(belt.life, 0, beltCap.life) || !isInt(belt.spirit, 0, beltCap.spirit) || !isInt(belt.moon, 0, beltCap.moon)) return 'belt';
    if (!isObj(s.runes)) return 'runes';
    var runeIds = Object.keys(s.runes);
    if (runeIds.length !== PB.RUNES.length || runeIds.some(function (id) { return !PB.RUNE_BY_ID[id] || !isInt(s.runes[id], 0, 1e9); })) return 'runes';
    if (!isInt(s.cubeRolls, 0, 1e9)) return 'cube';
    if (!isInt(s.gambleRolls, 0, 1e9)) return 'gamble';
    if (!isObj(g) || !isInt(g.unlockedZone, 0, PB.ZONES.length - 1) || !Array.isArray(g.cleared) || !isInt(g.moon, 0, 1000) || !isInt(g.bestMoon, 0, 1000)) return 'progress';
    if (!g.cleared.every(function (z) { return isInt(z, 0, PB.ZONES.length - 1); })) return 'progress';
    if (!isObj(g.moonCleared) || !Object.keys(g.moonCleared).every(function (k) {
      var zs = g.moonCleared[k];
      return /^\d+$/.test(k) && Array.isArray(zs) && zs.every(function (z) { return isInt(z, 0, PB.ZONES.length - 1); });
    })) return 'progress';
    if (!isObj(s.settings) || !isNum(s.settings.volume, 0, 1) || !isNum(s.settings.music, 0, 1) || !isNum(s.settings.shake, 0, 1)) return 'settings';
    if (!isObj(s.codex) || !isObj(s.codex.fusions) || !isObj(s.codex.uniques) || !isObj(s.codex.enemies) || !isObj(s.stats)) return 'codex';
    if (!['playSeconds', 'kills', 'deaths', 'summons'].every(function (k) { return isNum(s.stats[k], 0, 1e12); })) return 'stats';
    return null;
  }

  function serialize(save) { return JSON.stringify(save); }

  // A save from before per-Moon clears: its clears were at Moon 0, and Moon tiers open in order, so the Unmaker
  // (the last zone) has fallen at every tier up to bestMoon. Other zones at higher tiers are unknown: left open.
  function backfillMoons(g) {
    g.moonCleared = { 0: g.cleared.slice() };
    var last = PB.ZONES.length - 1;
    if (g.cleared.indexOf(last) < 0) return;
    for (var m = 1; m <= (isInt(g.bestMoon, 0, 1000) ? g.bestMoon : 0); m++) g.moonCleared[m] = [last];
  }

  function parse(text) {
    var s;
    try { s = JSON.parse(text); } catch (e) { return { ok: false, error: 'json' }; }
    if (!isObj(s) || typeof s.version !== 'number') return { ok: false, error: 'no-version' };
    if (s.version > VERSION) return { ok: false, error: 'future-version' };
    while (s.version < VERSION) {
      var m = MIGRATIONS[s.version];
      if (!m) return { ok: false, error: 'no-migration-' + s.version };
      s = m(s);
    }
    var moonless = isObj(s.progress) && s.progress.moonCleared === undefined;
    fill(s, newSave(s.seed || 1));
    if (moonless && Array.isArray(s.progress.cleared)) backfillMoons(s.progress);
    var err = validate(s);
    if (err) return { ok: false, error: err };
    // Counters must stay ahead of every stored id so new individuals and items never collide.
    s.roster.concat(s.echoes).forEach(function (r) { if (r.id >= s.nextIndId) s.nextIndId = r.id + 1; });
    s.inventory.forEach(function (it) { if (it.uid >= s.nextItemId) s.nextItemId = it.uid + 1; });
    return { ok: true, save: s };
  }

  // Never overwrites a corrupt save silently: it is copied to KEY + '.corrupt' first.
  function load(storage) {
    var raw = storage.getItem(KEY);
    if (raw == null) return { save: null, status: 'empty' };
    var r = parse(raw);
    if (r.ok) return { save: r.save, status: 'ok' };
    storage.setItem(KEY + '.corrupt', raw);
    return { save: null, status: 'corrupt', error: r.error };
  }

  // Import never touches storage unless the text parses; a rejected import leaves the current save in place.
  function importText(storage, text) {
    var r = parse(text);
    if (!r.ok) return r;
    store(storage, r.save);
    return r;
  }

  function store(storage, save) {
    var text = serialize(save);
    storage.setItem(KEY, text);
    return text.length;
  }

  PB.Save = { KEY: KEY, VERSION: VERSION, SLOTS: SLOTS, newSave: newSave, serialize: serialize, parse: parse, load: load, store: store,
              importText: importText, validate: validate };
})(globalThis.PB = globalThis.PB || {});
