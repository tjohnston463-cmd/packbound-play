// Keyboard/mouse -> PB.InputQueue. Listeners only queue: presses and RMB gestures wait until a sim tick
// that advances consumes them (see PB.InputQueue), so nothing is cleared by rendering. PB.Input.gate (set by game.js)
// routes the mouse to the canvas UI while a screen is up (gate.ui) and drops presses while the sim is stopped (gate.sim).
// Keys are rebindable (Settings > Key bindings): KEYMAP is edited in place, so every reader sees a change at once, and
// the player's map is stored as presentation settings beside graphics, never in the character save.
(function (PB) {
  'use strict';
  var KEYMAP = {
    KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right',
    Digit1: 'summon1', Digit2: 'summon2', Digit3: 'summon3', Digit4: 'summon4', Digit5: 'summon5',
    KeyQ: 'howl', KeyR: 'rally', KeyF: 'frenzy', KeyC: 'encircle', KeyG: 'heel',
    Space: 'bound', Tab: 'skinwalk', KeyV: 'hunt', KeyT: 'interact',
    KeyI: 'inventory', KeyK: 'skills', KeyJ: 'pack', Escape: 'pause', KeyP: 'pause', KeyM: 'mute',
    AltLeft: 'labels', AltRight: 'labels'
  };
  var DEFAULTS = Object.assign({}, KEYMAP), DEFAULTS_ACTIONS = {}, STORE = 'packbound.keys.v1', storage = null, capture = null;
  for (var dc in DEFAULTS) DEFAULTS_ACTIONS[DEFAULTS[dc]] = true;
  // Esc always pauses and closes menus, Shift is the dismiss modifier, and Ctrl/Meta belong to the browser. Of the
  // mouse, the middle and two side buttons (codes Mouse1, Mouse3, Mouse4) bind like keys; left and right stay
  // Thornlash and the pack commands.
  var RESERVED = /^(Escape|Shift|Control|Meta|OS|Mouse[02])/, AUX = { 1: 1, 3: 1, 4: 1 };
  var MOVE = { up: 1, down: 1, left: 1, right: 1 };
  var CLICK_PX = 8, CLICK_MS = 250, SAMPLE_PX = 12;

  var q = null, mapper = null, mouse = { x: 0, y: 0 }, rmb = null;

  function actionFor(code, shift) {
    var a = KEYMAP[code] || null;
    if (a && shift && a.indexOf('summon') === 0) return 'dismiss' + a.slice(6);
    return a;
  }

  function updateMove() {
    var h = q.held;
    q.move.x = (h.right ? 1 : 0) - (h.left ? 1 : 0);
    q.move.y = (h.down ? 1 : 0) - (h.up ? 1 : 0);
  }

  function releaseAll() {
    Object.keys(q.held).forEach(function (a) { PB.InputQueue.setHeld(q, a, false); });
    updateMove();
    rmb = null;
  }

  function gateUi() { var gt = PB.Input.gate; return !!(gt && gt.ui && gt.ui()); }
  function gateSim() { var gt = PB.Input.gate; return !gt || !gt.sim || gt.sim(); }

  // How a key code reads on screen: KeyQ -> Q, Digit1 -> 1, ArrowUp -> Up.
  var LABEL = { Space: 'Space', Tab: 'Tab', Escape: 'Esc', AltLeft: 'Alt', AltRight: 'Alt', ShiftLeft: 'Shift', ShiftRight: 'Shift',
                CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
                Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
                Mouse1: 'Middle mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5' };
  function keyName(code) {
    if (LABEL[code]) return LABEL[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Arrow/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
    return code;
  }
  // The first key on an action, as text ('' if none).
  function keyOf(action) { var c = codesFor(action); return c.length ? keyName(c[0]) : ''; }

  function codesFor(action) { var out = []; for (var c in KEYMAP) if (KEYMAP[c] === action && c !== 'Escape') out.push(c); return out; }

  // Puts `code` on `action`, replacing its keys. A key that already belonged to another action swaps: that action takes
  // this one's old key, so nothing is ever left unbound. Returns false for a reserved key.
  function bind(action, code) {
    if (!code || RESERVED.test(code) || !DEFAULTS_ACTIONS[action]) return false;
    var old = codesFor(action), other = KEYMAP[code];
    if (other === action && old.length === 1) return true;
    old.forEach(function (c) { delete KEYMAP[c]; });
    if (other && other !== action && old.length) KEYMAP[old[0]] = other;
    KEYMAP[code] = action;
    if (q) releaseAll();
    store();
    return true;
  }
  function resetBinds() { for (var c in KEYMAP) delete KEYMAP[c]; Object.assign(KEYMAP, DEFAULTS); if (q) releaseAll(); store(); }
  function store() {
    if (!storage) return;
    try { storage.setItem(STORE, JSON.stringify(KEYMAP)); } catch (_) { /* private mode: bindings last this session */ }
  }
  // A stored map is used only if it is sound: known actions, no reserved key but Esc, and every action still bound.
  function loadBinds(st) {
    storage = st || null;
    var m = null;
    try { m = st && JSON.parse(st.getItem(STORE)); } catch (_) { m = null; }
    if (!m || typeof m !== 'object') return false;
    var seen = {}, ok = true;
    for (var c in m) {
      if (!DEFAULTS_ACTIONS[m[c]] || (RESERVED.test(c) && c !== 'Escape')) ok = false;
      seen[m[c]] = true;
    }
    for (var a in DEFAULTS_ACTIONS) if (!seen[a]) ok = false;
    if (!ok) return false;
    for (var k in KEYMAP) delete KEYMAP[k];
    Object.assign(KEYMAP, m, { Escape: 'pause' });
    return true;
  }
  // The next key-down or middle/side mouse button goes to fn(code) instead of the game (Esc calls fn(null): cancelled).
  function listen(fn) { capture = fn; }

  function onKeyDown(e) {
    if (capture) {
      var fn = capture; capture = null;
      e.preventDefault(); e.pbCaptured = true;
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      fn(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (e.ctrlKey || e.metaKey) return; // leave browser shortcuts (reload, devtools) alone
    var a = actionFor(e.code, e.shiftKey);
    if (!a) return;
    e.preventDefault(); // Tab never moves focus, Space never scrolls, Alt never opens a menu
    if (e.repeat) return;
    down(a);
  }
  function down(a) {
    if (MOVE[a]) { PB.InputQueue.setHeld(q, a, true); updateMove(); return; }
    if (!gateSim()) return; // a menu is up and the sim is stopped: the press is the screen's, not the pack's
    PB.InputQueue.press(q, a);
    PB.InputQueue.setHeld(q, a, true);
  }

  function onKeyUp(e) { up(e.code); }
  function up(code) {
    var a = KEYMAP[code];
    if (!a) return;
    PB.InputQueue.setHeld(q, a, false);
    if (a.indexOf('summon') === 0) PB.InputQueue.setHeld(q, 'dismiss' + a.slice(6), false);
    updateMove();
  }

  function world(cx, cy) { var p = mapper.screenToWorld(cx, cy); return { x: p.x, y: p.y }; }

  function toUi(e) {
    if (!PB.UI || !mapper.screenToUI) return null;
    var u = mapper.screenToUI(e.clientX, e.clientY);
    PB.UI.pointer(u.x, u.y);
    return u;
  }

  // A middle or side mouse button acts as the key code Mouse<n>: bound actions press and hold as keys do, and the game's
  // own keys (pause, menus, mute) reach PB.Input.onCode. Its default (autoscroll, browser Back/Forward) is blocked.
  function auxDown(e) {
    e.preventDefault();
    var code = 'Mouse' + e.button;
    if (capture) { var fn = capture; capture = null; fn(code); return; }
    var a = actionFor(code, e.shiftKey);
    if (a) down(a);
    if (PB.Input.onCode) PB.Input.onCode(code);
  }

  function onMouseDown(e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (AUX[e.button]) { auxDown(e); return; }
    if (gateUi()) { var u = toUi(e); if (u && e.button === 0) PB.UI.click(u.x, u.y, { shift: e.shiftKey }); rmb = null; return; }
    if (e.button === 0) PB.InputQueue.setHeld(q, 'thornlash', true);
    else if (e.button === 2) rmb = { t: e.timeStamp, cx: e.clientX, cy: e.clientY, points: [world(e.clientX, e.clientY)] };
  }

  function onMouseMove(e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    toUi(e);
    if (!rmb) return;
    var p = world(e.clientX, e.clientY), last = rmb.points[rmb.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= SAMPLE_PX) rmb.points.push(p);
  }

  function onMouseUp(e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (AUX[e.button]) { e.preventDefault(); up('Mouse' + e.button); return; }
    if (e.button === 0) { PB.InputQueue.setHeld(q, 'thornlash', false); return; }
    if (gateUi()) { rmb = null; return; }
    if (e.button !== 2 || !rmb) return;
    var g = rmb; rmb = null;
    var moved = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
    if (moved <= CLICK_PX && e.timeStamp - g.t <= CLICK_MS) {
      PB.InputQueue.gesture(q, { kind: 'click', x: g.points[0].x, y: g.points[0].y });
      return;
    }
    var end = world(e.clientX, e.clientY), last = g.points[g.points.length - 1];
    if (end.x !== last.x || end.y !== last.y) g.points.push(end);
    // A stroke that never left the 12px start sample is a fumble, not a trail.
    if (g.points.length > 2 || (g.points.length === 2 && Math.hypot(end.x - g.points[0].x, end.y - g.points[0].y) >= SAMPLE_PX)) {
      PB.InputQueue.gesture(q, { kind: 'drag', x: g.points[0].x, y: g.points[0].y, points: g.points });
    }
  }

  // Binds listeners and returns a fresh queue. mapper.screenToWorld(clientX, clientY) -> {x, y}.
  function attach(canvas, m) {
    q = PB.InputQueue.create();
    mapper = m;
    rmb = null;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    canvas.addEventListener('mousedown', function (e) { if (canvas.focus) canvas.focus(); onMouseDown(e); });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('auxclick', function (e) { if (AUX[e.button]) e.preventDefault(); }); // no Back/Forward mid-hunt
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    PB.Input.queue = q;
    return q;
  }

  // Once per render frame: the camera moved, so re-aim at the world point under the still cursor.
  function refresh() {
    if (!q) return;
    var p = mapper.screenToWorld(mouse.x, mouse.y);
    q.aim.x = p.x; q.aim.y = p.y;
  }

  // A new field starts with no stale presses or gestures (held keys stay held).
  function reset() { if (!q) return; q.pending.length = 0; q.gestures.length = 0; rmb = null; }

  PB.Input = { KEYMAP: KEYMAP, DEFAULTS: DEFAULTS, actionFor: actionFor, codesFor: codesFor, bind: bind, resetBinds: resetBinds, loadBinds: loadBinds,
              keyName: keyName, keyOf: keyOf,
              onCode: null, listen: listen, listening: function () { return !!capture; }, reserved: function (c) { return RESERVED.test(c); }, attach: attach, refresh: refresh, reset: reset, releaseAll: function () { if (q) releaseAll(); }, queue: null, gate: null };
})(globalThis.PB = globalThis.PB || {});
