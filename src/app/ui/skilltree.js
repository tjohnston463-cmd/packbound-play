// Skill tree (K; spec §13, §16): three columns (Fang, Wing & Root, Command), four tiers of node circles with lines to
// their parents and rank pips. Available nodes glow, locked ones say what they need. A click calls Skills.allocate and
// the mods apply at once; Respec (Skills.respec) is free, at camp only. The sim pauses.
(function (PB) {
  'use strict';
  var LW = 1280, PX = 60, PY = 40, PW = 1160, PH = 640, COL_W = 380, TIER_Y = [0, 150, 270, 390, 510];
  var TREE_NAME = { fang: 'Fang', wingroot: 'Wing & Root', command: 'Command' };
  var TREE_TEXT = { fang: 'wolves and the bear', wingroot: 'ravens and vines', command: 'spirits, orders, fusion' };

  function layout() {
    var pos = {};
    PB.SKILL_TREES.forEach(function (tree, ti) {
      for (var tier = 1; tier <= 4; tier++) {
        var nodes = PB.SKILLS.filter(function (n) { return n.tree === tree && n.tier === tier; });
        nodes = nodes.map(function (n, i) { var par = n.req && pos[n.req[0]]; return { n: n, k: par ? par.x : 1e9 + i }; }) // children sit under their parents
          .sort(function (a, b) { return a.k - b.k; }).map(function (o) { return o.n; });
        nodes.forEach(function (n, i) { pos[n.id] = { x: PX + 20 + ti * COL_W + COL_W / 2 + (i - (nodes.length - 1) / 2) * 112, y: PY + TIER_Y[tier] }; });
      }
    });
    return pos;
  }

  function verdict(player, node) {
    var r = PB.Skills.canAllocate(player, node.id);
    if (r.reason === 'tier') { r.need = PB.SKILL_TIER_REQ[node.tier]; r.tree = node.tree; }
    return r;
  }

  function draw(g, G) {
    var UI = PB.UI, C = UI.C, p = G.save.player, pos = layout(), left = PB.Skills.pointsTotal(p) - PB.Skills.spent(p.skills);
    UI.dim(g, 0.78);
    UI.panel(g, PX, PY, PW, PH, { title: 'Skill Tree' });
    UI.text(g, left + ' point' + (left === 1 ? '' : 's') + ' to spend', PX + 30, PY + 14, UI.font(15, true), left ? C.gold : C.dim);
    UI.text(g, 'A tier opens at 0 / 3 / 6 / 10 points in its tree', PX + PW - 30, PY + 14, UI.font(12), C.dim, 'right');
    PB.SKILL_TREES.forEach(function (tree, ti) {
      var cx = PX + 20 + ti * COL_W + COL_W / 2;
      UI.text(g, TREE_NAME[tree] + '  (' + PB.Skills.spentIn(p.skills, tree) + ')', cx, PY + 50, UI.font(17, true), C.bone, 'center');
      UI.text(g, TREE_TEXT[tree], cx, PY + 72, UI.font(12), C.dim, 'center');
    });
    g.lineWidth = 2;
    PB.SKILLS.forEach(function (n) { // parent lines first
      (n.req || []).forEach(function (rid) {
        var a = pos[rid], b = pos[n.id];
        g.strokeStyle = p.skills[rid] ? 'rgba(232,135,58,0.7)' : 'rgba(176,142,84,0.25)';
        g.beginPath(); g.moveTo(a.x, a.y + 26); g.lineTo(b.x, b.y - 26); g.stroke();
      });
    });
    PB.SKILLS.forEach(function (n) {
      var at = pos[n.id], rank = p.skills[n.id] || 0, v = verdict(p, n), r = { x: at.x - 28, y: at.y - 28, w: 56, h: 56 }, hot = UI.hover(r);
      var key = n.tier === 4;
      if (v.ok) { g.shadowColor = 'rgba(255,214,120,0.9)'; g.shadowBlur = 16 + 6 * Math.sin(UI.t * 4); }
      g.fillStyle = rank ? 'rgba(90,60,24,0.98)' : v.ok ? 'rgba(40,46,30,0.98)' : 'rgba(20,22,20,0.98)';
      g.beginPath(); if (key) { g.moveTo(at.x, at.y - 30); g.lineTo(at.x + 30, at.y); g.lineTo(at.x, at.y + 30); g.lineTo(at.x - 30, at.y); g.closePath(); } else g.arc(at.x, at.y, 26, 0, Math.PI * 2);
      g.fill(); g.shadowBlur = 0; g.shadowColor = 'transparent';
      g.strokeStyle = rank >= n.max ? C.gold : rank ? C.ember : v.ok ? C.moss : 'rgba(120,120,120,0.5)'; g.lineWidth = hot ? 3 : 2; g.stroke();
      UI.text(g, rank + '/' + n.max, at.x, at.y - 7, UI.font(13, true), rank ? C.gold : v.ok ? C.bone : C.faint, 'center');
      for (var k = 0; k < n.max; k++) { g.fillStyle = k < rank ? C.gold : 'rgba(255,255,255,0.15)'; g.fillRect(at.x - n.max * 5 + k * 10 + 1, at.y + 30, 8, 4); }
      UI.text(g, n.name, at.x, at.y + 38, UI.font(12), v.ok || rank ? C.bone : C.dim, 'center');
      if (hot) {
        var lines = [{ text: n.name + (key ? ' (Keystone)' : ''), color: C.gold }, { text: n.text }, { text: 'Rank ' + rank + ' / ' + n.max, color: C.dim }];
        if (!v.ok && v.reason !== 'max') lines.push({ text: UI.why(v), color: C.red });
        else if (v.ok) lines.push({ text: 'Click to learn', color: C.green });
        UI.setTip(lines, at.x, at.y - 32);
      }
      if (UI.hotspot('skill-' + n.id, r)) {
        var res = verdict(p, n);
        if (res.ok) { PB.Skills.allocate(p, n.id); PB.Game.afterSaveChange(); }
        else UI.flashReason(UI.why(res), at.x, at.y - 34);
      }
    });
    var by = PY + PH - 50, inCamp = !G.world;
    if (UI.button(g, 'respec', { x: LW / 2 - 230, y: by, w: 200, h: 36 }, 'Respec (free)', { disabled: !inCamp, reason: UI.why({ reason: 'camp' }) })) {
      PB.Skills.respec(p); PB.Game.afterSaveChange(); PB.Game.toast('Skill points refunded');
    }
    if (UI.button(g, 'skills-close', { x: LW / 2 + 30, y: by, w: 200, h: 36 }, 'Close (' + PB.Input.keyOf('skills') + ')', { tone: 'moss' })) PB.Game.close();
  }

  PB.Screens = PB.Screens || {};
  PB.Screens.skills = { pausesSim: true, draw: draw };
  PB.SkillUI = { layout: layout };
})(globalThis.PB = globalThis.PB || {});
