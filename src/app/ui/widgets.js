// Canvas UI kit (spec §16): panels, buttons, sliders, tooltips and cached text, all in the 1280x720 logical view.
// Immediate mode: a screen draws its widgets every frame and a button reports a click that landed inside it this
// frame. input.js feeds PB.UI.pointer/click in UI coordinates. PB.UI.buttons maps every button id drawn this frame to
// its rect, so PB_DEBUG.button(id) lets the playtest click the real UI.
(function (PB) {
  'use strict';
  // A book serif (Palatino on Windows and Mac, Georgia as the fallback) and a bronze-on-dark-stone palette.
  var FACE = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
  var C = { bone: '#efe6cc', dim: 'rgba(239,230,204,0.6)', faint: 'rgba(239,230,204,0.32)', moss: '#7fae5a', ember: '#e8873a',
            gold: '#ffd678', red: '#ff6a5a', blue: '#8fb8ff', green: '#8fe07a', ink: '#07090b', panel: 'rgba(17,15,13,0.95)',
            edge: 'rgba(176,142,84,0.75)', bronze: '#b08e54', moon: '#cfe0ff' };
  var CACHE_MAX = 3000;
  var U = { C: C, mouse: { x: -1, y: -1, down: false }, pending: [], clicks: [], buttons: {}, tip: null, flash: null, t: 0,
            hoverEase: {}, dt: 0, cache: {}, cacheN: 0, LW: 1280, LH: 720 };

  function font(px, bold) { return (bold ? 'bold ' : '') + px + 'px ' + FACE; }
  function pointer(x, y) { U.mouse.x = x; U.mouse.y = y; }
  function click(x, y, opts) {
    U.pending.push({ x: x, y: y, button: (opts && opts.button) || 0, shift: !!(opts && opts.shift), used: false });
    pointer(x, y);
  }

  // Start of a UI frame: this frame's clicks are the ones queued since the last frame.
  function beginFrame(dt) {
    U.dt = dt || 0;
    U.clicks = U.pending; U.pending = []; U.buttons = {}; U.tip = null; U.t += dt || 0;
    if (U.flash) { U.flash.t -= dt || 0; if (U.flash.t <= 0) U.flash = null; }
  }

  function inRect(r, x, y) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
  function hover(r) { return inRect(r, U.mouse.x, U.mouse.y); }

  // The first unused click inside r (any button unless one is named), marked used.
  function takeClick(r, button) {
    for (var i = 0; i < U.clicks.length; i++) {
      var c = U.clicks[i];
      if (!c.used && inRect(r, c.x, c.y) && (button === undefined || c.button === button)) { c.used = true; return c; }
    }
    return null;
  }
  function unusedClick() { for (var i = 0; i < U.clicks.length; i++) if (!U.clicks[i].used) return U.clicks[i]; return null; }

  function measure(g, str, f) {
    var key = f + '|' + str, w = U.cache[key];
    if (w === undefined) {
      if (U.cacheN >= CACHE_MAX) { U.cache = {}; U.cacheN = 0; }
      g.font = f; w = U.cache[key] = g.measureText(str).width; U.cacheN++;
    }
    return w;
  }

  // align: 'left' | 'center' | 'right'; y is the top of the line.
  function text(g, str, x, y, f, color, align) {
    str = String(str);
    var w = measure(g, str, f);
    g.font = f; g.fillStyle = color || C.bone; g.textAlign = 'left'; g.textBaseline = 'top';
    var x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.fillText(str, x0, y);
    return w;
  }

  function wrap(g, str, f, maxW) {
    var words = String(str).split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var next = cur ? cur + ' ' + words[i] : words[i];
      if (cur && measure(g, next, f) > maxW) { lines.push(cur); cur = words[i]; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  // style: {fill, edge, title, glow}
  // A dark stone slab framed in bronze: an outer black line, the bronze rim, an inner highlight and corner studs.
  function panel(g, x, y, w, h, style) {
    style = style || {};
    if (style.glow) { g.shadowColor = style.glow; g.shadowBlur = 18; }
    roundRect(g, x, y, w, h, 4);
    if (style.fill) g.fillStyle = style.fill;
    else { var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(30,27,23,0.96)'); gr.addColorStop(1, 'rgba(12,11,9,0.96)'); g.fillStyle = gr; }
    g.fill();
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 4; g.stroke();
    g.strokeStyle = style.edge || C.edge; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = 'rgba(255,235,190,0.08)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + 6, y + 3.5); g.lineTo(x + w - 6, y + 3.5); g.stroke();
    if (w > 60 && h > 40) {
      g.fillStyle = style.edge || C.edge;
      [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 2, 0, Math.PI * 2); g.fill(); });
    }
    if (style.title) {
      g.save(); g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 6;
      text(g, style.title, x + w / 2, y + 9, font(19, true), C.gold, 'center'); g.restore();
      var lg = g.createLinearGradient(x + w / 2 - 90, 0, x + w / 2 + 90, 0);
      lg.addColorStop(0, 'rgba(176,142,84,0)'); lg.addColorStop(0.5, 'rgba(176,142,84,0.85)'); lg.addColorStop(1, 'rgba(176,142,84,0)');
      g.strokeStyle = lg; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + w / 2 - 90, y + 35); g.lineTo(x + w / 2 + 90, y + 35); g.stroke();
    }
  }

  // state: {disabled, reason, active, tone: 'ember' | 'moss' | 'moon', size, sub}. Returns true on a click.
  function button(g, id, r, label, state) {
    state = state || {};
    U.buttons[id] = { x: r.x, y: r.y, w: r.w, h: r.h, disabled: !!state.disabled };
    var hot = hover(r), tone = state.tone === 'moss' ? C.moss : state.tone === 'moon' ? C.moon : C.ember;
    var hoverFade = U.hoverEase[id] = PB.Graphics.ease(U.hoverEase[id] || 0, hot && !state.disabled ? 1 : 0, 14, U.dt);
    roundRect(g, r.x, r.y, r.w, r.h, 3);
    if (state.disabled) g.fillStyle = 'rgba(28,27,25,0.8)';
    else if (state.active) g.fillStyle = 'rgba(120,70,30,0.6)';
    else { var bg = g.createLinearGradient(0, r.y, 0, r.y + r.h); bg.addColorStop(0, hot ? '#3e3628' : '#2c2820'); bg.addColorStop(1, hot ? '#1e1a14' : '#141210'); g.fillStyle = bg; }
    g.fill();
    if (hoverFade > 0.01) { g.globalAlpha = hoverFade * 0.14; g.fillStyle = tone; g.fill(); g.globalAlpha = 1; }
    g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 3.5; g.stroke();
    g.strokeStyle = state.disabled ? 'rgba(120,120,120,0.45)' : hot || state.active ? tone : C.edge;
    g.lineWidth = hot ? 2 : 1.4; g.stroke();
    var f = font(state.size || 15, true), col = state.disabled ? 'rgba(239,230,204,0.4)' : hot ? '#fff6dc' : C.bone;
    var ty = r.y + r.h / 2 - (state.size || 15) * 0.6 - (state.sub ? 6 : 0);
    text(g, label, r.x + r.w / 2, ty, f, col, 'center');
    if (state.sub) text(g, state.sub, r.x + r.w / 2, ty + (state.size || 15) + 2, font(11), state.disabled ? C.faint : C.dim, 'center');
    if (hot && state.disabled && state.reason) setTip([{ text: state.reason, color: C.red }], r.x + r.w / 2, r.y - 6);
    var c = takeClick(r);
    if (!c) return false;
    if (state.disabled) { if (state.reason) flashReason(state.reason, r.x + r.w / 2, r.y - 8); return false; }
    return true;
  }

  // A horizontal 0..1 slider; a click sets the value by its x. Returns the (possibly new) value.
  function slider(g, id, r, value, label) {
    U.buttons[id] = { x: r.x, y: r.y, w: r.w, h: r.h };
    var c = takeClick(r);
    if (c) value = Math.max(0, Math.min(1, Math.round((c.x - r.x) / r.w * 20) / 20));
    text(g, label, r.x, r.y - 18, font(13), C.bone);
    text(g, Math.round(value * 100) + '%', r.x + r.w, r.y - 18, font(13), C.dim, 'right');
    g.fillStyle = 'rgba(8,7,6,0.95)'; g.fillRect(r.x - 1, r.y + r.h / 2 - 4, r.w + 2, 8);
    g.fillStyle = C.bronze; g.fillRect(r.x, r.y + r.h / 2 - 3, r.w * value, 6);
    g.fillStyle = hover(r) ? '#fff6dc' : C.bone;
    g.beginPath(); g.arc(r.x + r.w * value, r.y + r.h / 2, 7, 0, Math.PI * 2); g.fill();
    return value;
  }

  // lines: strings, {text, color} or arrays of such spans (one row of colored spans, wrapped as one string).
  function layoutTip(g, lines, maxW) {
    var out = [], f = font(13);
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i], spans = Array.isArray(L) ? L : [typeof L === 'string' ? { text: L } : L];
      var color = spans[0].color || C.bone, joined = spans.map(function (s) { return s.text; }).join('');
      if (spans.length > 1 && measure(g, joined, f) <= maxW) { out.push(spans); continue; }
      wrap(g, joined, f, maxW).forEach(function (w) { out.push([{ text: w, color: color }]); });
    }
    return out;
  }

  function tooltip(g, lines, x, y, opts) {
    opts = opts || {};
    var maxW = opts.width || 330, f = font(13), rows = layoutTip(g, lines, maxW), w = 0, i, k;
    for (i = 0; i < rows.length; i++) { var rw = 0; for (k = 0; k < rows[i].length; k++) rw += measure(g, rows[i][k].text, f); w = Math.max(w, rw); }
    var h = rows.length * 17 + 14, bx = Math.max(6, Math.min(U.LW - w - 26, x - (w + 20) / 2)), by = y - h;
    if (by < 6) by = Math.min(U.LH - h - 6, y + 28);
    panel(g, bx, by, w + 20, h, { fill: 'rgba(8,7,6,0.95)', edge: opts.edge || C.edge });
    for (i = 0; i < rows.length; i++) {
      var cx = bx + 10;
      for (k = 0; k < rows[i].length; k++) cx += text(g, rows[i][k].text, cx, by + 7 + i * 17, f, rows[i][k].color || C.bone);
    }
  }

  // The tooltip drawn on top at the end of this frame (the last one set wins).
  function setTip(lines, x, y, opts) { U.tip = { lines: lines, x: x, y: y, opts: opts }; }
  // A failed action's reason, in red, for 2.2 s.
  function flashReason(textStr, x, y) { U.flash = { text: textStr, x: x, y: y, t: 2.2, color: C.red }; }

  function drawOverlay(g) {
    if (U.tip) tooltip(g, U.tip.lines, U.tip.x, U.tip.y, U.tip.opts);
    if (U.flash) {
      g.globalAlpha = Math.min(1, U.flash.t / 0.4);
      tooltip(g, [{ text: U.flash.text, color: C.red }], U.flash.x, U.flash.y, { edge: 'rgba(255,106,90,0.8)' });
      g.globalAlpha = 1;
    }
  }

  // An invisible click area (a summon by the fire, a grid cell). Recorded in buttons like a button.
  function hotspot(id, r) { U.buttons[id] = { x: r.x, y: r.y, w: r.w, h: r.h }; return takeClick(r); }

  // A failed sim call's reason as the sentence the red tooltip shows.
  var TREE_NAME = { fang: 'Fang', wingroot: 'Wing & Root', command: 'Command' };
  function why(r) {
    if (!r || r.ok) return '';
    switch (r.reason) {
      case 'moonstones': return 'Needs ' + r.cost + ' Moonstones';
      case 'rank': return 'Tier II required';
      case 'already-fused': return 'A bonded fusion cannot fuse again';
      case 'slots': return 'No free fusion slot (a 2nd at level 15; Fusion Lore rank 3 adds one)';
      case 'no-recipe': return 'These two cannot fuse';
      case 'same-individual': return 'Pick two different summons';
      case 'missing': return 'Not in the roster any more';
      case 'max': return 'Already at max rank';
      case 'points': return 'No skill points left (one per level, one per first boss kill)';
      case 'requires': return 'Requires ' + (PB.SKILL_BY_ID[r.node] ? PB.SKILL_BY_ID[r.node].name : r.node);
      case 'tier': return 'Needs ' + r.need + ' points spent in ' + ((PB.TREE_NAME && PB.TREE_NAME[r.tree]) || TREE_NAME[r.tree] || r.tree);
      case 'class': return 'That skill belongs to another calling';
      case 'equipped': return 'Unequip it first';
      case 'slot': return 'That does not fit there';
      case 'level': return 'Needs level ' + (r.need || 20);
      case 'not-ready': return r.need ? 'Needs level ' + r.need : 'Not ready to evolve';
      case 'far': return 'Walk to the shrine';
      case 'no-shrine': return 'No shrine here';
      case 'camp': return 'Only at camp (Hearthgrove)';
      default: return String(r.reason);
    }
  }

  // A summon or enemy portrait from the sprite atlas (first run frame, the idle pose). opts: {alpha, face, white}
  function sprite(g, type, x, y, size, opts) {
    opts = opts || {};
    var atlas = PB.Render && PB.Render.atlas && PB.Render.atlas(), sp = atlas && atlas.bodies && atlas.bodies[type];
    g.globalAlpha = opts.alpha === undefined ? 1 : opts.alpha;
    if (sp) {
      var sheet = opts.white ? sp.white : sp.sheet, fr = opts.frame || 0;
      if (opts.face < 0) { g.save(); g.translate(x, y); g.scale(-1, 1); g.drawImage(sheet, fr * sp.cell, 0, sp.cell, sp.cell, -size / 2, -size / 2, size, size); g.restore(); }
      else g.drawImage(sheet, fr * sp.cell, 0, sp.cell, sp.cell, x - size / 2, y - size / 2, size, size);
    } else { g.fillStyle = '#a9b4bf'; g.beginPath(); g.arc(x, y, size / 4, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }

  // Dim the view behind a modal screen.
  function dim(g, a) { g.fillStyle = 'rgba(4,6,8,' + (a === undefined ? 0.72 : a) + ')'; g.fillRect(0, 0, U.LW, U.LH); }

  U.font = font; U.pointer = pointer; U.click = click; U.beginFrame = beginFrame; U.inRect = inRect; U.hover = hover;
  U.takeClick = takeClick; U.unusedClick = unusedClick; U.measure = measure; U.text = text; U.wrap = wrap; U.panel = panel;
  U.button = button; U.slider = slider; U.tooltip = tooltip; U.setTip = setTip; U.flashReason = flashReason;
  U.drawOverlay = drawOverlay; U.dim = dim; U.hotspot = hotspot; U.why = why; U.sprite = sprite; U.roundRect = roundRect; U.FACE = FACE;
  PB.UI = U;
})(globalThis.PB = globalThis.PB || {});
