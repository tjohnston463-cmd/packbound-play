// Grove sets. Nine named green pieces in three sets of three. A worn piece always grants its own line.
// Two pieces wake the partial. Three pieces replace that fantasy: the Den Mother, the wreath, or the hearth.
// A set piece is not a rune base. First Howl and the Green Wreath both want the staff, so one of those is the choice.
(function (PB) {
  'use strict';
  PB.SETS = [
    { id: 'firsthowl', name: 'First Howl', pieces: [
      { id: 'howlstaff', base: 'ashstaff', name: 'Staff of the First Howl', ilvl: 3, stats: { wolfDmg: 12 }, text: '+12% wolf damage' },
      { id: 'howlmask', base: 'bonemask', name: 'Mask of the First Howl', ilvl: 3, stats: { packAtkSpd: 8 }, text: '+8% summon attack speed. That is the first haste step.' },
      { id: 'howltooth', base: 'fangcharm', name: 'Tooth of the First Howl', ilvl: 4, stats: { wolfDmg: 10 }, text: '+10% wolf damage' }
    ], partial: [
      { n: 2, stats: { wolfDmg: 20 }, text: '(2) Wolves deal +20% damage.' },
      { n: 3, behaviors: { denmother: 1 }, text: '(3) The oldest hunter of your calling is the Den Mother. Her bites Mark, and those hunters beside her swing faster.' }
    ] },
    { id: 'greenwreath', name: 'The Green Wreath', pieces: [
      { id: 'wreathstaff', base: 'ashstaff', name: 'Rooted Ash', ilvl: 5, stats: { vineDmg: 15 }, text: '+15% vine damage' },
      { id: 'wreathpelt', base: 'hidepelt', name: 'Mosscloak', ilvl: 5, stats: { packHp: 12 }, text: '+12% summon life' },
      { id: 'wreathseed', base: 'seedcharm', name: 'Crowseed', ilvl: 6, stats: { ravenDmg: 15 }, text: '+15% raven damage' }
    ], partial: [
      { n: 2, stats: { rootDur: 0.6 }, text: '(2) Vines hold for 0.6s longer.' },
      { n: 3, behaviors: { wreath: 1 }, text: '(3) A rooted foe is Marked, and every skirmisher of your calling in reach pecks it at once.' }
    ] },
    { id: 'hearthwake', name: 'Hearth of the Hunt', pieces: [
      { id: 'wakevisor', base: 'stagmask', name: 'Visor of the Wake', ilvl: 10, stats: { spiritMax: 15 }, text: '+15 max Spirit' },
      { id: 'wakeheart', base: 'moontotem', name: 'Heart of the Wake', ilvl: 11, stats: { chorusDmg: 15 }, text: '+15% Chorus damage' },
      { id: 'wakefeather', base: 'feathercharm', name: 'Feather of the Wake', ilvl: 10, stats: { spiritRegen: 15 }, text: '+15% Spirit regeneration' }
    ], partial: [
      { n: 2, stats: { chorusDmg: 10, spiritRegen: 10 }, text: '(2) Chorus hits harder and Spirit returns faster.' },
      { n: 3, behaviors: { hearthwake: 1 }, text: '(3) A Chorus heals the pack for 8% life and gives back 8 Spirit.' }
    ] }
  ];
  PB.SET_BY_ID = {};
  PB.SET_PIECE_BY_ID = {};
  PB.SETS.forEach(function (set) {
    PB.SET_BY_ID[set.id] = set;
    set.pieces.forEach(function (p) { p.setId = set.id; PB.SET_PIECE_BY_ID[p.id] = p; });
  });

  var CHASE = 0.7, DEN_R = 180, WREATH_R = 260, HEAL = 0.08, SPIRIT_BACK = 8;

  function eligible(ilvl) {
    var out = [];
    PB.SETS.forEach(function (set) {
      set.pieces.forEach(function (p) { if (p.ilvl <= ilvl) out.push(p); });
    });
    return out;
  }

  function ownedIds(src) {
    var ids = {};
    if (!src || !src.inventory) return ids;
    src.inventory.forEach(function (it) { if (it && it.set) ids[it.set] = true; });
    return ids;
  }

  // A started set is fed its missing pieces most of the time. Anything you do not own can still fall.
  // Dupes wait until every piece this zone can drop is already in the bag or on the body.
  function pick(rng, ilvl, src) {
    var pool = eligible(ilvl);
    if (!pool.length) return null;
    var owned = ownedIds(src), started = {}, missing = [], chase = [], i;
    for (i = 0; i < pool.length; i++) if (owned[pool[i].id]) started[pool[i].setId] = true;
    for (i = 0; i < pool.length; i++) {
      if (owned[pool[i].id]) continue;
      missing.push(pool[i]);
      if (started[pool[i].setId]) chase.push(pool[i]);
    }
    var use = missing.length ? missing : pool;
    if (chase.length && rng.chance(CHASE)) use = chase;
    return rng.pick(use);
  }

  // Unique piece ids only. Two copies of one piece do not count as two of the set.
  function counts(items) {
    var seen = {}, out = {};
    (items || []).forEach(function (it) {
      if (!it || !it.set || seen[it.set]) return;
      var piece = PB.SET_PIECE_BY_ID[it.set];
      if (!piece) return;
      seen[it.set] = true;
      out[piece.setId] = (out[piece.setId] || 0) + 1;
    });
    return out;
  }

  function grant(items, stats, behaviors) {
    var seen = {}, nBy = {}, i, it, piece, k, set, p, part;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it || !it.set || seen[it.set]) continue;
      piece = PB.SET_PIECE_BY_ID[it.set];
      if (!piece) continue;
      seen[it.set] = true;
      for (k in piece.stats) stats[k] = (stats[k] || 0) + piece.stats[k];
      nBy[piece.setId] = (nBy[piece.setId] || 0) + 1;
    }
    for (i = 0; i < PB.SETS.length; i++) {
      set = PB.SETS[i];
      if (!(nBy[set.id] >= 2)) continue;
      for (p = 0; p < set.partial.length; p++) {
        part = set.partial[p];
        if (nBy[set.id] < part.n) continue;
        if (part.stats) for (k in part.stats) stats[k] = (stats[k] || 0) + part.stats[k];
        if (part.behaviors) for (k in part.behaviors) behaviors[k] = Math.max(behaviors[k] || 0, part.behaviors[k]);
      }
    }
  }

  function line(save) {
    if (!save || !PB.Mods) return '';
    var nBy = counts(PB.Mods.equipped(save)), parts = [];
    PB.SETS.forEach(function (set) {
      var n = nBy[set.id] || 0;
      if (n) parts.push(set.name + ' ' + n + '/' + set.pieces.length);
    });
    return parts.join('   ');
  }

  // What the tooltip should say if this piece were in its slot. A charm replaces the charm a click would replace.
  function projected(save, item) {
    if (!save || !save.equipped || !PB.Mods || !PB.Camp) return [item];
    var dest = PB.Camp.slotOf(save, item.uid);
    if (!dest) dest = item.slot === 'charm' ? PB.Camp.charmSlot(save) : item.slot;
    var out = [], equipped = PB.Mods.equipped(save), i;
    for (i = 0; i < equipped.length; i++) {
      var it = equipped[i];
      if (!it || it.uid === item.uid) continue;
      if (PB.Camp.slotOf(save, it.uid) === dest) continue;
      out.push(it);
    }
    out.push(item);
    return out;
  }

  function preview(item, save) {
    var piece = item && PB.SET_PIECE_BY_ID[item.set];
    if (!piece) return null;
    var set = PB.SET_BY_ID[piece.setId], n = counts(projected(save, item))[set.id] || 0, lines = [];
    lines.push({ text: set.name + ' (' + n + '/' + set.pieces.length + ')', on: n >= 2 });
    lines.push({ text: piece.text, on: true });
    set.partial.forEach(function (part) { lines.push({ text: part.text, on: n >= part.n }); });
    return lines;
  }

  function announce(before, after) {
    var msgs = [];
    PB.SETS.forEach(function (set) {
      var a = after[set.id] || 0, b = before[set.id] || 0;
      if (a <= b || a < 2) return;
      msgs.push(set.name + ' ' + a + '/' + set.pieces.length + (a >= set.pieces.length ? '. The set is complete' : ''));
    });
    return msgs.join('. ');
  }

  PB.Sets = {
    eligible: eligible, pick: pick, counts: counts, grant: grant, line: line, preview: preview, announce: announce,
    CHASE: CHASE, DEN_R: DEN_R, WREATH_R: WREATH_R, HEAL: HEAL, SPIRIT_BACK: SPIRIT_BACK
  };
})(globalThis.PB = globalThis.PB || {});
