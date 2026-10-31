// Pause / Help / Settings (spec §16, §15). The controls table is generated from the live key map (PB.Input.KEYMAP)
// and the command table (PB.COMMANDS), and the synergy sheet from PB.SYNERGY_RULES, so none of them can drift from
// the real bindings or rules. Settings write save.settings and reach audio and juice through PB.Game.applySettings.
(function (PB) {
  'use strict';
  var ACTION_TEXT = {
    bound: 'Bound: a 180px dodge dash with i-frames',
    sipLife: 'Drink a life flask. A heavy hit staggers you. A drink shakes it off',
    sipSpirit: 'Drink a spirit flask',
    sipMoon: 'Drink a Moonflask: fills Life and Spirit, and shakes off a stagger',
    skinwalk: 'Skinwalk: become the summon under the cursor (or the nearest); press again to return',
    hunt: 'Wild Hunt (when the Chorus moon is full): every summon you ever raised stampedes',
    interact: 'Interact: open the Fusion Altar at a Fusion Shrine',
    labels: 'Show every loot name on screen (hold)',
    inventory: 'Inventory', skills: 'Skill tree', pack: 'Pack (roster, evolve, scars, diet)',
    read: 'Read the best unread item in the bag. A tome drops from elites and bosses. Camp reads the bag for free',
    pause: 'Pause and this help (Esc also closes a menu)', mute: 'Mute'
  };
  var KEY_CMDS = { howl: 'howl', rally: 'rally', frenzy: 'frenzy', encircle: 'encircle', heel: 'heel' };
  var MOVE = ['up', 'left', 'down', 'right'];

  function keyLabel(code) { return PB.Input.keyName(code); }

  // action -> distinct key labels, in KEYMAP order.
  function keysFor(action) {
    var out = [], map = PB.Input.KEYMAP;
    for (var code in map) if (map[code] === action) { var l = keyLabel(code); if (out.indexOf(l) < 0) out.push(l); }
    return out;
  }

  function cmdName(id) { return id.charAt(0).toUpperCase() + id.slice(1); }

  // "Name: text", once: a text that already names the command is used as-is ("Toggle Heel: ..."), and a text that opens
  // with its own label ("Recall: ...", "Druid howls: ...") drops that label for the command's name.
  function commandText(id) {
    var tx = PB.COMMANDS[id].text, name = cmdName(id), m = /^([^:.]{1,24}): (.*)$/.exec(tx);
    if (tx.slice(0, 20).indexOf(name) >= 0) return tx;
    return name + ': ' + (m ? m[2] : tx);
  }

  // Rows {keys, text, actions[]}: every action in the key map appears in exactly one row.
  function controls() {
    var rows = [], seen = {};
    function add(keys, textStr, actions) { rows.push({ keys: keys, text: textStr, actions: actions }); actions.forEach(function (a) { seen[a] = true; }); }
    var cls = PB.Classes.of(PB.Game && PB.Game.G && PB.Game.G.save);
    var summonOrder = cls.order;
    add(MOVE.map(function (a) { return keysFor(a).join('/'); }).join(' '), cls.moveText, MOVE.slice());
    add('LMB (hold)', cls.attackText, ['thornlash']);
    ['focus', 'hold', 'trail'].forEach(function (id) { add(PB.COMMANDS[id].key, cmdName(id) + ': ' + PB.COMMANDS[id].text, [id]); });
    var sKeys = [], sActs = [], dActs = [];
    summonOrder.forEach(function (t, i) { sKeys = sKeys.concat(keysFor('summon' + (i + 1))); sActs.push('summon' + (i + 1)); dActs.push('dismiss' + (i + 1)); });
    add(sKeys.join(' '), 'Summon ' + summonOrder.map(function (t) { return PB.SUMMONS[t].name; }).join(' / ') + ' ' + cls.plantNote, sActs);
    add('Shift + ' + sKeys.join(' '), 'Dismiss one of that type (50% ' + cls.resource + ' refund)', dActs);
    for (var a in KEY_CMDS) {
      var id = KEY_CMDS[a];
      add(keysFor(a).join(' '), commandText(id), [a]);
    }
    var map = PB.Input.KEYMAP, rest = [];
    for (var code in map) if (!seen[map[code]] && rest.indexOf(map[code]) < 0) rest.push(map[code]);
    rest.forEach(function (act) { add(keysFor(act).join(' / '), ACTION_TEXT[act] || act, [act]); });
    return rows;
  }

  function synergies() {
    var out = [
      'New Hunt picks a calling. Only the Wildcaller\'s whole pack bites on the swing, and four or more of them feed Spirit back when the whip lands.',
      'The wood names a quarry. It takes more damage, gives more experience, and fills the Chorus faster.',
      'Hold the whip on a foe. The pack leaves nearer enemies to bite the one on your aim, and it hits harder.',
      PB.Slaughter ? PB.Slaughter.HELP : 'Kills chain. At five the chain starts paying.',
      'An elite walks in with a name and up to two of the wave beside it. Kill the named one and the pack runs. A Hasted name rages instead.',
      'At camp, Wear upgrades puts on anything in the bag that beats what you have.',
      'A death changes the wood: the Mire slows, Ember burns, Frost chills, Storm sparks, Blight poisons.',
      'At camp, Dust renders an item, or a Whetstone pushes one number up a step.',
      'Elites, the quarry and bosses drop Grove Runes. The Hearth Cube sockets them. A finished word changes how the pack fights.',
      'Grove sets drop in green. Two pieces wake a bonus. Three pieces change the pack. A set staff cannot hold a rune word. First Howl and the Green Wreath both want the staff.',
      'Each wave grows a grove shrine. Walk into it. Combat, Moon and Den help. Greed pays and you bruise. A red Monster Shrine turns the wood, and the next kill drops a rune.',
      'At camp, Gamble spends Dust on a magic, rare, set or unique. Never a plain piece. The roll follows the deepest wood you have opened, and the Moon.',
      'After your first clear, one open wood is the Terror. It is marked in red. Prey is tougher and drops better. Call the Terror onward for 4 Dust.',
      'Your own hits can crush a tough body, strike twice, and return life or Spirit. Zeal, the claw, the spin, the javelin, the spear and the fireball each feed one of those. Gear can too.',
      PB.Wards ? PB.Wards.HELP : 'The wood bites in an element. Gear wards you.',
      'The belt holds life flasks, spirit flasks and Moonflasks. They drop in the wood and do not fill the bag. A boss always leaves a Moonflask. Camp sells them for Dust. A heavy hit staggers your step until you drink.',
      PB.Charms ? PB.Charms.HELP : 'Magic and better drops unread. Charms on the board count in the fight.',
      'When the last summon of a type falls, it waits in the Den.'
    ];
    PB.SYNERGY_RULES.forEach(function (r) { out.push(r.text); });
    out.push('Chorus: three different summon types hit one target within 1 s: a burst of 25% of those hits and +8 Chorus. A full moon lets V call the Wild Hunt.');
    out.push('Fused summons carry both parents\' tags, so a Storm Hound counts as a wolf and a raven.');
    return out;
  }

  var S = { tab: 'controls', listen: null, note: '' };
  var LW = 1280, LH = 720, PX = 50, PY = 34, PW = 1180, PH = 652;

  function drawControls(g, UI) {
    var rows = controls(), f = UI.font(13), x = PX + 30, y = PY + 96, colW = 545, keyW = 132, col = 0;
    var bottom = PY + PH - 70;
    for (var i = 0; i < rows.length; i++) {
      var lines = UI.wrap(g, rows[i].text, f, colW - keyW - 10), h = lines.length * 16 + 6;
      if (y + h > bottom && col === 0) { col = 1; x = PX + 30 + colW + 50; y = PY + 96; }
      UI.text(g, rows[i].keys, x + keyW - 12, y, UI.font(13, true), UI.C.gold, 'right');
      for (var k = 0; k < lines.length; k++) UI.text(g, lines[k], x + keyW, y + k * 16, f, k ? UI.C.dim : UI.C.bone);
      y += h;
    }
    // Right under the list it explains, so changing a key is found where the keys are read.
    var bx = col ? x + keyW : PX + 30 + colW + 50 + keyW, byy = col ? y + 14 : PY + 96;
    if (UI.button(g, 'keybinds-help', { x: bx, y: byy, w: 280, h: 34 }, 'Change key bindings', { tone: 'moss' })) S.tab = 'keys';
  }

  function drawSynergies(g, UI) {
    var f = UI.font(14), y = PY + 100, x = PX + 60;
    UI.text(g, 'Synergies run on every hit. Mix your pack: different types on one target is the whole game.', x, y, UI.font(15, true), UI.C.gold);
    y += 36;
    synergies().forEach(function (s) {
      var lines = UI.wrap(g, s, f, PW - 140);
      g.fillStyle = UI.C.moss; g.beginPath(); g.arc(x - 12, y + 8, 3, 0, Math.PI * 2); g.fill();
      lines.forEach(function (l, k) { UI.text(g, l, x, y + k * 18, f, UI.C.bone); });
      y += lines.length * 18 + 10;
    });
  }

  function drawSettings(g, UI, G) {
    var st = G.save ? G.save.settings : null, x = PX + 120, y = PY + 130;
    var ex = x + 520;
    UI.text(g, 'Keys', ex, y + 112, UI.font(13), UI.C.bone);
    UI.text(g, 'Change any key: move, summons, commands, menus.', ex, y + 134, UI.font(13), UI.C.dim);
    if (UI.button(g, 'keybinds', { x: ex, y: y + 160, w: 354, h: 34 }, 'Change key bindings', { tone: 'moss' })) S.tab = 'keys';
    if (!st) { UI.text(g, 'Start or continue a hunt to change the other settings.', LW / 2, y, UI.font(15), UI.C.dim, 'center'); return; }
    var v = UI.slider(g, 'volume', { x: x, y: y, w: 360, h: 22 }, st.volume, 'Volume');
    var m = UI.slider(g, 'music', { x: x, y: y + 64, w: 360, h: 22 }, st.music, 'Music');
    var changed = v !== st.volume || m !== st.music;
    st.volume = v; st.music = m;
    UI.text(g, 'Screen shake', x, y + 120, UI.font(13), UI.C.bone);
    [[0, 'Off'], [0.5, 'Half'], [1, 'Full']].forEach(function (o, i) {
      if (UI.button(g, 'shake-' + Math.round(o[0] * 100), { x: x + i * 122, y: y + 140, w: 114, h: 32 }, o[1], { active: st.shake === o[0] })) { st.shake = o[0]; changed = true; }
    });
    if (UI.button(g, 'numbers', { x: x, y: y + 200, w: 360, h: 32 }, 'Damage numbers: ' + (st.numbers ? 'On' : 'Off'), { active: st.numbers })) { st.numbers = !st.numbers; changed = true; }
    var q = PB.Game.quality(), auto = PB.Game.autoDrop();
    if (UI.button(g, 'quality', { x: x, y: y + 244, w: 200, h: 32 }, 'Quality: ' + q + (PB.Game.autoDropped() ? ' (auto)' : ''), { active: q === 'High' })) PB.Game.setQuality(q === 'High' ? 'Low' : 'High');
    if (UI.button(g, 'autodrop', { x: x + 208, y: y + 244, w: 152, h: 32 }, 'Auto-drop: ' + (auto ? 'On' : 'Off'), { active: auto })) PB.Game.setAutoDrop(!auto);
    UI.text(g, auto ? 'Auto-drop picks Low for this session after 4 s below 45 fps.' : 'Auto-drop is off: Quality stays as you set it.', x, y + 286, UI.font(14), UI.C.dim);
    UI.text(g, 'Save', ex, y - 18, UI.font(13), UI.C.bone);
    UI.text(g, 'Your pack lives in this browser\'s localStorage (' + PB.Save.KEY + ').', ex, y + 4, UI.font(13), UI.C.dim);
    UI.text(g, 'Clearing browser data erases it, so export a copy now and then.', ex, y + 22, UI.font(13), UI.C.dim);
    if (UI.button(g, 'export', { x: ex, y: y + 54, w: 170, h: 34 }, 'Export save')) PB.Game.promptExport();
    if (UI.button(g, 'import', { x: ex + 184, y: y + 54, w: 170, h: 34 }, 'Import save')) PB.Game.promptImport();
    if (changed) PB.Game.applySettings();
  }

  // Key bindings: every action in the key map, two columns. Click a key, press the new one (Esc cancels). Taking a key
  // another action uses swaps the two (PB.Input.bind), so nothing is ever left without a key.
  function bindRows() {
    var rows = [['up', 'Move up'], ['left', 'Move left'], ['down', 'Move down'], ['right', 'Move right']];
    var calling = PB.Classes.of(PB.Game && PB.Game.G && PB.Game.G.save);
    calling.order.forEach(function (t, i) { rows.push(['summon' + (i + 1), 'Summon ' + PB.SUMMONS[t].name]); });
    for (var a in KEY_CMDS) rows.push([a, cmdName(KEY_CMDS[a])]);
    return rows.concat([['bound', 'Bound (dodge)'], ['sipLife', 'Life flask'], ['sipSpirit', 'Spirit flask'], ['sipMoon', 'Moonflask'], ['skinwalk', 'Skinwalk'], ['hunt', 'Wild Hunt'], ['interact', 'Interact'],
      ['inventory', 'Inventory'], ['skills', 'Skill tree'], ['pack', 'Pack'], ['read', 'Read'], ['pause', 'Pause (Esc always works)'], ['mute', 'Mute'], ['labels', 'Show loot names']]);
  }
  function stopListening() { if (S.listen) { S.listen = null; PB.Input.listen(null); } }
  function pick(action, label) {
    S.listen = action; S.note = '';
    PB.Input.listen(function (code) {
      S.listen = null;
      if (!code) return;
      var other = PB.Input.KEYMAP[code], name = PB.Input.keyName(code);
      if (!PB.Input.bind(action, code)) { S.note = name + ' is reserved (Esc pauses, Shift dismisses, Ctrl belongs to the browser, left and right click command the pack).'; return; }
      S.note = other && other !== action ? name + ' was on ' + (bindRows().filter(function (r) { return r[0] === other; })[0] || [0, other])[1] +
        ', which now uses ' + PB.Input.keyOf(other) + '.' : label + ': ' + name;
    });
  }
  function drawKeys(g, UI) {
    var rows = bindRows(), half = Math.ceil(rows.length / 2), f = UI.font(14);
    rows.forEach(function (r, i) {
      var col = i < half ? 0 : 1, x = PX + 90 + col * 540, y = PY + 100 + (i % half) * 34, on = S.listen === r[0];
      UI.text(g, r[1], x, y + 6, f, UI.C.bone);
      var keys = PB.Input.codesFor(r[0]).map(PB.Input.keyName).filter(function (k, j, all) { return all.indexOf(k) === j; }).join(' / ');
      if (UI.button(g, 'bind-' + r[0], { x: x + 250, y: y, w: 170, h: 28 }, on ? 'Press a key...' : keys, { active: on, size: 13 })) {
        if (on) stopListening(); else pick(r[0], r[1]);
      }
    });
    var hy = PY + 100 + half * 34 + 8;
    UI.text(g, S.listen ? 'Press the new key or mouse button for ' + rows.filter(function (r) { return r[0] === S.listen; })[0][1] + '. Esc cancels.' :
      (S.note || 'Click a key, then press the new key or a middle/side mouse button. Taking one another action uses swaps the two.'), LW / 2, hy, UI.font(14), S.listen ? UI.C.gold : UI.C.dim, 'center');
    if (UI.button(g, 'keys-back', { x: LW / 2 - 290, y: hy + 30, w: 280, h: 32 }, 'Back to settings')) { stopListening(); S.tab = 'settings'; }
    if (UI.button(g, 'keys-reset', { x: LW / 2 + 10, y: hy + 30, w: 280, h: 32 }, 'Reset to defaults')) { stopListening(); PB.Input.resetBinds(); S.note = 'Keys reset to the defaults.'; }
  }

  PB.Screens = PB.Screens || {};
  PB.Screens.pause = {
    pausesSim: true,
    enter: function (G, opts) { S.tab = (opts && opts.tab) || 'controls'; S.note = ''; stopListening(); },
    exit: function () { stopListening(); },
    draw: function (g, G) {
      var UI = PB.UI;
      UI.dim(g, 0.74);
      UI.panel(g, PX, PY, PW, PH, { title: G.stack.indexOf('field') >= 0 ? 'Paused' : 'Help' });
      [['controls', 'Controls'], ['synergies', 'Synergies'], ['settings', 'Settings']].forEach(function (t, i) {
        if (UI.button(g, 'tab-' + t[0], { x: LW / 2 - 255 + i * 172, y: PY + 46, w: 162, h: 30 }, t[1], { active: S.tab === t[0] || (S.tab === 'keys' && t[0] === 'settings'), size: 14 })) { stopListening(); S.tab = t[0]; }
      });
      if (S.tab === 'controls') drawControls(g, UI);
      else if (S.tab === 'synergies') drawSynergies(g, UI);
      else if (S.tab === 'keys') drawKeys(g, UI);
      else drawSettings(g, UI, G);
      var by = PY + PH - 52, inField = G.stack.indexOf('field') >= 0;
      if (UI.button(g, 'resume', { x: LW / 2 - (inField ? 230 : 100), y: by, w: 200, h: 38 }, G.stack[0] === 'title' ? 'Back' : 'Resume', { tone: 'moss' })) PB.Game.close();
      if (inField && PB.Game.cleared()) { if (UI.button(g, 'leave', { x: LW / 2 + 30, y: by, w: 200, h: 38 }, 'Leave', { sub: 'the zone is cleared', tone: 'moss' })) PB.Game.leaveCleared(); }
      else if (inField && UI.button(g, 'abandon', { x: LW / 2 + 30, y: by, w: 200, h: 38 }, 'Abandon Hunt', { sub: 'keep loot, back to camp' })) PB.Game.abandon();
      UI.text(g, 'Esc / ' + PB.Input.keyOf('pause') + ' to resume', PX + PW - 20, by + 12, UI.font(12), UI.C.faint, 'right');
    }
  };
  PB.Pause = { controls: controls, synergies: synergies, keysFor: keysFor, keyLabel: keyLabel, bindRows: bindRows, state: S };
})(globalThis.PB = globalThis.PB || {});
