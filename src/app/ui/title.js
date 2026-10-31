// Title (spec §16): a moonlit forest ridge with six silhouette wolves running along it (the real wolf run-cycle
// frames, blacked out), parallax hills and drifting mist, the PACKBOUND logo with a claw-scratch underline, and the
// menu. "Click to wake the pack" shows until the first gesture has started audio.
(function (PB) {
  'use strict';
  var LW = 1280, LH = 720, RIDGE = 470;
  var T = { t: 0, stars: null, sil: null, confirmT: 0 };

  function lcg(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function stars() {
    if (T.stars) return T.stars;
    var r = lcg(77), out = [];
    for (var i = 0; i < 140; i++) out.push({ x: r() * LW, y: r() * 380, s: r() < 0.1 ? 2 : 1, tw: r() * 6.28 });
    return (T.stars = out);
  }

  function hill(x, layer) { // smooth deterministic hill profile
    return Math.sin(x * 0.004 + layer * 1.7) * 26 + Math.sin(x * 0.011 + layer * 4.1) * 12 + Math.sin(x * 0.0017 + layer) * 30;
  }

  function ridgeY(x) { return RIDGE + Math.sin(x * 0.006) * 10 + Math.sin(x * 0.017 + 1) * 4; }

  // The wolf sheet with every pixel blacked out (made once, in the browser only).
  function silhouette() {
    var atlas = PB.Render.atlas && PB.Render.atlas(), sp = atlas && atlas.bodies && atlas.bodies.wolf;
    if (T.sil !== null && (!T.sil || T.sil.src === sp)) return T.sil; // re-made when the wolf's sculpt lands
    if (!sp || typeof document === 'undefined') return (T.sil = false);
    var c = document.createElement('canvas'); c.width = sp.sheet.width; c.height = sp.sheet.height;
    var g = c.getContext('2d');
    g.drawImage(sp.sheet, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#05070c'; g.fillRect(0, 0, c.width, c.height);
    T.sil = { sheet: c, size: sp.size, cell: sp.cell, frames: sp.frames, src: sp };
    return T.sil;
  }

  function drawScene(g, t) {
    var sky = g.createLinearGradient(0, 0, 0, LH);
    sky.addColorStop(0, '#0a1024'); sky.addColorStop(0.55, '#1b2a4a'); sky.addColorStop(1, '#0b0f18');
    g.fillStyle = sky; g.fillRect(0, 0, LW, LH);
    stars().forEach(function (s) { g.globalAlpha = 0.45 + 0.4 * Math.sin(t * 1.3 + s.tw); g.fillStyle = '#dfe8ff'; g.fillRect(s.x, s.y, s.s, s.s); });
    g.globalAlpha = 1;
    var mx = 1090, my = 150, glow = g.createRadialGradient(mx, my, 20, mx, my, 220);
    glow.addColorStop(0, 'rgba(220,232,255,0.55)'); glow.addColorStop(1, 'rgba(220,232,255,0)');
    g.fillStyle = glow; g.fillRect(mx - 220, my - 220, 440, 440);
    g.fillStyle = '#eef3ff'; g.beginPath(); g.arc(mx, my, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(180,195,225,0.35)'; g.beginPath(); g.arc(mx - 18, my - 10, 14, 0, Math.PI * 2); g.arc(mx + 22, my + 18, 9, 0, Math.PI * 2); g.fill();
    var layers = [['#18233d', 330, 6], ['#121a2e', 380, 14], ['#0c1222', 430, 26]];
    layers.forEach(function (L, li) { // far hills drift slower than near ones
      var off = (t * L[2]) % 2000;
      g.fillStyle = L[0]; g.beginPath(); g.moveTo(0, LH);
      for (var x = 0; x <= LW; x += 16) g.lineTo(x, L[1] + hill(x + off, li));
      g.lineTo(LW, LH); g.closePath(); g.fill();
      if (li === 1) { // pine teeth on the middle layer
        g.fillStyle = '#0f1628';
        for (var px = -((t * L[2]) % 46); px < LW; px += 46) { var by = L[1] + hill(px + off, li); g.beginPath(); g.moveTo(px - 9, by + 4); g.lineTo(px, by - 34); g.lineTo(px + 9, by + 4); g.fill(); }
      }
    });
    g.fillStyle = '#05070c'; g.beginPath(); g.moveTo(0, LH);
    for (var rx = 0; rx <= LW; rx += 10) g.lineTo(rx, ridgeY(rx));
    g.lineTo(LW, LH); g.closePath(); g.fill();
    drawWolves(g, t);
    for (var m = 0; m < 7; m++) { // mist bands, two speeds
      var sp = m % 2 ? 18 : 30, mxp = ((m * 260 + t * sp) % (LW + 600)) - 300, myp = RIDGE + 10 + (m % 3) * 40;
      var mg = g.createRadialGradient(0, 0, 10, 0, 0, 260);
      mg.addColorStop(0, 'rgba(170,190,225,0.16)'); mg.addColorStop(1, 'rgba(170,190,225,0)');
      g.save(); g.translate(mxp, myp); g.scale(1, 0.4); g.fillStyle = mg; g.fillRect(-260, -260, 520, 520); g.restore();
    }
  }

  function drawWolves(g, t) {
    var sil = silhouette();
    for (var i = 0; i < 6; i++) {
      var span = LW + 240, x = ((t * 150 + i * 70 + (i % 2) * 25) % span) - 120, y = ridgeY(x) - 13 - (i % 3) * 2;
      var bound = Math.abs(Math.sin(t * 9 + i)) * 3;
      if (sil) {
        var fr = Math.floor((t * 11 * sil.frames / 8 + i * 0.37) % sil.frames), k = 2.4;
        g.drawImage(sil.sheet, fr * sil.cell, 0, sil.cell, sil.cell, x - sil.size * k / 2, y - sil.size * k / 2 - bound, sil.size * k, sil.size * k);
      } else {
        g.fillStyle = '#05070c'; g.beginPath(); g.ellipse(x, y - bound, 22, 9, 0, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function drawLogo(g, UI, t) {
    var cx = LW / 2, y = 120;
    g.save();
    g.shadowColor = 'rgba(160,190,255,0.55)'; g.shadowBlur = 24;
    UI.text(g, 'PACKBOUND', cx, y, 'bold 92px ' + UI.FACE, '#efe6cc', 'center');
    g.restore();
    g.strokeStyle = '#e8873a'; g.lineCap = 'round';
    for (var i = 0; i < 3; i++) { // the claw scratch: three slashes that taper
      var x0 = cx - 230 + i * 18, yy = y + 104 + i * 7;
      g.lineWidth = 4 - i; g.beginPath(); g.moveTo(x0, yy); g.quadraticCurveTo(cx, yy - 10 + i * 3, cx + 230 - i * 22, yy - 4); g.stroke();
    }
    UI.text(g, 'You do not fight. You conduct.', cx, y + 128, 'italic 18px ' + UI.FACE, 'rgba(239,230,204,0.75)', 'center');
    void t;
  }

  PB.Screens = PB.Screens || {};
  PB.Screens.title = {
    pausesSim: true,
    enter: function () { T.confirmT = 0; },
    draw: function (g, G, dt) {
      var UI = PB.UI, cx = LW / 2;
      T.t += dt || 0; if (T.confirmT > 0) T.confirmT -= dt || 0;
      drawScene(g, T.t);
      drawLogo(g, UI, T.t);
      var has = PB.Game.hasSave(), y = 330, bw = 260, bh = 44, gap = 54;
      if (has && UI.button(g, 'continue', { x: cx - bw / 2, y: y, w: bw, h: bh }, 'Continue', { tone: 'moss', size: 18,
        sub: 'Level ' + G.save.player.level + ' · ' + G.save.roster.length + ' in the pack' })) PB.Game.continueGame();
      if (has) y += gap;
      var label = T.confirmT > 0 ? 'Abandon your pack? Click again' : 'New Hunt';
      if (UI.button(g, 'newhunt', { x: cx - bw / 2, y: y, w: bw, h: bh }, label, { size: 18, active: T.confirmT > 0 })) {
        if (has && T.confirmT <= 0) T.confirmT = 3;
        else PB.Game.newHunt();
      }
      if (UI.button(g, 'settings', { x: cx - bw / 2, y: y + gap, w: bw / 2 - 5, h: 38 }, 'Settings')) PB.Game.open('pause', { tab: 'settings' });
      if (UI.button(g, 'help', { x: cx + 5, y: y + gap, w: bw / 2 - 5, h: 38 }, 'Help')) PB.Game.open('pause', { tab: 'controls' });
      if (!PB.Audio.ready()) {
        g.globalAlpha = 0.55 + 0.45 * Math.sin(T.t * 3);
        UI.text(g, 'Click to wake the pack', cx, LH - 70, UI.font(18, true), UI.C.moon, 'center');
        g.globalAlpha = 1;
      }
      if (G.loadNote) UI.text(g, G.loadNote, cx, LH - 40, UI.font(13), UI.C.red, 'center');
      UI.text(g, 'Esc pauses in the hunt · everything is drawn and synthesized in your browser', cx, LH - 22, UI.font(11), UI.C.faint, 'center');
    }
  };
  PB.Title = { state: T, drawScene: drawScene };
})(globalThis.PB = globalThis.PB || {});
