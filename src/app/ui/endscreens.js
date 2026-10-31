// Victory and Game Over (spec §16). Victory: the boss has fallen (slow motion, then the loot shower pulls the drops
// in), and a summary shows kills, Choruses, scars earned, the MVP by damage and the loot this zone gave; Continue goes on to the next zone,
// or back to camp, or Keep hunting here returns to the cleared field (Pause > Leave brings Victory back). Game Over ("The pack scatters"): the field desaturates, the run's stats and "The pack remembers:"
// with the deeds and scars of this attempt, then Return to Hearthgrove. Items, XP and roster are always kept.
(function (PB) {
  'use strict';
  var LW = 1280, LH = 720;

  // What this attempt did, from G.run (filled by Game.onEvent) and the deeds the save gained since the zone began.
  function summary(G) {
    var run = G.run || { kills: 0, choruses: 0, scars: [], dmg: {}, deeds0: {}, loot: [], moonstones: 0, leftBehind: 0 }, save = G.save, best = null, lines = [];
    for (var id in run.dmg) if (!best || run.dmg[id] > run.dmg[best]) best = id;
    var mvp = null;
    save.roster.forEach(function (ind) {
      if (String(ind.id) === best) mvp = { name: ind.name, type: ind.type, dmg: Math.round(run.dmg[best]) };
      var d0 = (run.deeds0 || {})[ind.id], d = ind.deeds;
      if (!d0) return;
      var parts = [], n = function (v, one, many) { return v + ' ' + (v === 1 ? one : many); };
      if (d.kills > d0.kills) parts.push(n(d.kills - d0.kills, 'kill', 'kills'));
      if (d.crits > d0.crits) parts.push(n(d.crits - d0.crits, 'crit', 'crits'));
      if (d.eaten > d0.eaten) parts.push(n(d.eaten - d0.eaten, 'meal', 'meals'));
      if (d.choruses > d0.choruses) parts.push(n(d.choruses - d0.choruses, 'chorus', 'choruses'));
      if (parts.length) lines.push({ name: ind.name, text: parts.join(', '), n: d.kills - d0.kills });
    });
    lines.sort(function (a, b) { return b.n - a.n; });
    return { kills: run.kills, choruses: run.choruses, scars: run.scars.slice(), mvp: mvp, loot: (run.loot || []).slice(), moonstones: run.moonstones || 0, runes: run.runes || 0, leftBehind: run.leftBehind || 0, deeds: lines.slice(0, 6), seconds: Math.floor(G.world ? G.world.time : 0), total: save.stats.playSeconds || 0 };
  }

  function clock(sec) { sec = Math.floor(sec || 0); var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = ('0' + sec % 60).slice(-2); return h ? h + ':' + ('0' + m).slice(-2) + ':' + s : m + ':' + s; }

  // Things waiting at camp after a clear: summons ready to evolve, unspent skill points, a first clear of this zone.
  function campWork(G, zone) {
    var save = G.save, ready = save.roster.filter(function (x) { return PB.Evolution.canEvolve(x); }).length;
    var points = PB.Skills.pointsTotal(save.player) - PB.Skills.spent(save.player.skills), first = !G.run || !G.run.clearedBefore;
    var parts = [];
    if (ready) parts.push(ready + ' to evolve');
    if (points > 0) parts.push(points + (points === 1 ? ' skill point' : ' skill points'));
    return { any: ready > 0 || points > 0 || first, text: parts.join(', '), zone: zone };
  }

  function stats(g, UI, sm, y) {
    var C = UI.C, cols = [['Kills', sm.kills], ['Choruses', sm.choruses], ['Scars earned', sm.scars.length], ['Time', Math.floor(sm.seconds / 60) + ':' + ('0' + sm.seconds % 60).slice(-2)]];
    cols.forEach(function (c, i) {
      var x = LW / 2 - 300 + i * 200;
      UI.text(g, String(c[1]), x, y, UI.font(28, true), C.bone, 'center');
      UI.text(g, c[0], x, y + 34, UI.font(13), C.dim, 'center');
    });
    if (sm.total !== undefined) UI.text(g, 'Hunted ' + clock(sm.total) + ' in all', LW / 2, y + 58, UI.font(12), C.dim, 'center');
  }

  function remembers(g, UI, sm, y, max) {
    var C = UI.C;
    UI.text(g, 'The pack remembers:', LW / 2, y, UI.font(16, true), C.gold, 'center');
    var rows = sm.scars.map(function (s) { return { text: s, color: '#ffb0a0' }; })
      .concat(sm.deeds.map(function (d) { return { text: d.name + ': ' + d.text, color: C.bone }; }));
    if (!rows.length) rows.push({ text: 'a hard night, and nothing more', color: C.dim });
    rows.slice(0, max || 8).forEach(function (r, i) { UI.text(g, r.text, LW / 2, y + 28 + i * 20, UI.font(14), r.color, 'center'); });
  }

  function rarityColor(r) { for (var i = 0; i < PB.RARITIES.length; i++) if (PB.RARITIES[i].id === r) return PB.RARITIES[i].color; return '#d8d8d8'; }
  var RANK = { unique: 0, rare: 1, magic: 2, normal: 3 };

  // The right-hand column of Victory: every item picked up this zone (the boss's shower too), best first, in rarity
  // colours; the Moonstones; and what a full bag left behind.
  function loot(g, UI, sm, x, y) {
    var C = UI.C, items = (sm.loot || []).slice().sort(function (a, b) { return (RANK[a.rarity] || 3) - (RANK[b.rarity] || 3); }), MAX = 14;
    UI.text(g, 'Loot this zone', x, y, UI.font(16, true), C.gold);
    if (!items.length) UI.text(g, 'No items this time', x, y + 28, UI.font(14), C.dim);
    items.slice(0, MAX).forEach(function (it, i) { UI.text(g, it.name, x, y + 28 + i * 20, UI.font(14), rarityColor(it.rarity)); });
    var yy = y + 28 + Math.max(1, Math.min(items.length, MAX)) * 20 + 6;
    if (items.length > MAX) { UI.text(g, '+' + (items.length - MAX) + ' more in your bag', x, yy, UI.font(13), C.dim); yy += 20; }
    if (sm.moonstones) { UI.text(g, '+' + sm.moonstones + ' Moonstones', x, yy, UI.font(14), C.moon); yy += 20; }
    if (sm.runes) { UI.text(g, '+' + sm.runes + (sm.runes === 1 ? ' Rune' : ' Runes'), x, yy, UI.font(14), '#7dcca0'); yy += 20; }
    if (sm.leftBehind) UI.text(g, sm.leftBehind + ' left behind: the bag was full', x, yy, UI.font(13), C.red);
  }

  PB.Screens = PB.Screens || {};
  PB.Screens.gameover = {
    pausesSim: true,
    enter: function (G) { G.endSummary = summary(G); if (PB.Audio.ready()) PB.Audio.play('scatter'); },
    draw: function (g, G) {
      var UI = PB.UI, sm = G.endSummary || summary(G);
      g.save(); g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, LW, LH); g.restore();
      UI.dim(g, 0.55);
      g.save(); g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 16;
      UI.text(g, 'The pack scatters', LW / 2, 110, 'bold 54px ' + UI.FACE, UI.C.bone, 'center'); g.restore();
      var dz = G.world && G.world.dir, z = '';
      if (dz) z = PB.ZONES[dz.zone].name + (dz.wave > PB.Waves.WAVES_PER_ZONE ? ', fighting ' + PB.BOSSES[PB.ZONES[dz.zone].boss].name : ', wave ' + dz.wave);
      UI.text(g, z + ' · you keep every item, level and summon', LW / 2, 178, UI.font(15), UI.C.dim, 'center');
      stats(g, UI, sm, 230);
      remembers(g, UI, sm, 330);
      if (UI.button(g, 'return', { x: LW / 2 - 140, y: 560, w: 280, h: 48 }, 'Return to Hearthgrove', { size: 17, tone: 'moss' })) PB.Game.toCamp();
    }
  };

  PB.Screens.victory = {
    pausesSim: true,
    enter: function (G) { G.endSummary = summary(G); },
    draw: function (g, G) {
      var UI = PB.UI, C = UI.C, sm = G.endSummary || summary(G), d = G.world && G.world.dir, zone = d ? d.zone : 0, last = PB.ZONES.length - 1;
      UI.dim(g, 0.72);
      var boss = PB.BOSSES[PB.ZONES[zone].boss].name;
      g.save(); g.shadowColor = 'rgba(255,200,120,0.7)'; g.shadowBlur = 24;
      UI.text(g, boss + ' falls', LW / 2, 96, 'bold 52px ' + UI.FACE, C.gold, 'center'); g.restore();
      UI.text(g, PB.ZONES[zone].name + ' is cleared' + (d && d.moon ? ' at Moon ' + d.moon : ''), LW / 2, 162, UI.font(16), C.bone, 'center');
      stats(g, UI, sm, 214);
      if (sm.mvp) {
        UI.sprite(g, sm.mvp.type, LW / 2 - 150, 340, 64);
        UI.text(g, 'MVP: ' + sm.mvp.name, LW / 2 - 100, 318, UI.font(20, true), C.gold);
        UI.text(g, sm.mvp.dmg + ' damage this zone', LW / 2 - 100, 346, UI.font(14), C.dim);
      } else UI.text(g, 'MVP: the ' + PB.Classes.of(G.save).title, LW / 2, 330, UI.font(18, true), C.gold, 'center');
      remembers(g, UI, sm, 400, 7); // 7 rows end at y 548, clear of the camp line at 576
      loot(g, UI, sm, LW - 250, 214);
      var save = G.save, next = Math.min(save.progress.unlockedZone, last), moon = d ? d.moon : 0;
      if (zone === last) moon = Math.min(moon + 1, save.progress.bestMoon + 1);
      var wantZone = zone === last ? zone : next, wantName = (PB.ENEMIES[PB.Waves.quarry(wantZone, moon)] || {}).name || '';
      UI.text(g, 'Next, the wood wants ' + wantName, LW / 2, 188, UI.font(14), C.dim, 'center');
      var label = zone === last ? 'Hunt at Moon ' + moon : 'Hunt next: ' + PB.ZONES[next].name, work = campWork(G, zone);
      // With work waiting at camp (a first clear, a summon ready to evolve, unspent points) Hearthgrove is the primary
      // (left, bright) button; otherwise hunting on is.
      var left = { x: LW / 2 - 300, y: 600, w: 280, h: 46 }, right = { x: LW / 2 + 20, y: 600, w: 280, h: 46 };
      if (work.any && work.text) UI.text(g, 'Waiting at camp: ' + work.text, LW / 2, 576, UI.font(13), C.gold, 'center');
      if (UI.button(g, 'next', work.any ? right : left, label, { size: 16, tone: work.any ? 'moss' : undefined })) PB.Game.startZone(next, moon);
      if (UI.button(g, 'camp', work.any ? left : right, 'Return to Hearthgrove', { size: 16, tone: work.any ? undefined : 'moss' })) PB.Game.toCamp();
      // Stay in the cleared zone (pick up loot, finish stragglers); Leave in Pause brings this screen back.
      if (G.world && G.world.player.hp > 0 && UI.button(g, 'stay', { x: LW / 2 - 140, y: 656, w: 280, h: 42 }, 'Keep hunting here', { size: 14, sub: 'leave later from Esc' })) PB.Game.close();
    }
  };
  PB.EndUI = { summary: summary, campWork: campWork, clock: clock };
})(globalThis.PB = globalThis.PB || {});
