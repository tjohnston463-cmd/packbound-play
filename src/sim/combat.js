// Pure hit resolution. Synergy rules are data: each rule may adjust the mods object for one hit.
(function (PB) {
  'use strict';

  function hasTag(ent, tag) { return !!(ent.tags && ent.tags.indexOf(tag) >= 0); }
  var TACTICS_BASE = 3; // innate Pack Tactics; skill ranks add on top

  // Order matters only for documentation; every rule is additive (inc) or multiplicative (more).
  PB.SYNERGY_RULES = [
    { id: 'mark',       text: 'Any hit on a Marked target: +10% damage (+markDmg from Keen Eyes).',
      when: function (a, d) { return d.marked > 0; },
      apply: function (m, a, d, ctx) { m.inc += 0.10 + (ctx.stats.markDmg || 0) / 100; } },
    { id: 'markcrit',   text: 'Wolves vs Marked: +30% crit chance, plus 5% per rank of Keen Eyes, and crit multiplier at least 2.0.',
      when: function (a, d) { return d.marked > 0 && hasTag(a, 'wolf'); },
      apply: function (m, a, d, ctx) { m.critChance += 0.30 + (ctx.stats.markCrit || 0) / 100; m.critMult = Math.max(m.critMult, 2.0); } },
    { id: 'pinned',     text: 'Bears vs Rooted: x1.5 damage, plus 10% per rank of Blight (the maul pins).',
      when: function (a, d) { return d.rooted > 0 && hasTag(a, 'bear'); },
      apply: function (m, a, d, ctx) { m.more *= 1.5 * (1 + (ctx.stats.rootDmg || 0) / 100); } },
    { id: 'tactics',    text: 'Wolves: +3% per other living wolf, +3% more per Pack Tactics rank.',
      when: function (a) { return hasTag(a, 'wolf'); },
      apply: function (m, a, d, ctx) { m.inc += ((TACTICS_BASE + (ctx.stats.packTactics || 0)) / 100) * Math.max(0, (ctx.wolvesAlive || 0) - 1); } },
    { id: 'frenzy',     text: 'Frenzy active: x1.15 damage for all summons.',
      when: function (a, d, ctx) { return ctx.frenzy && a.team === 0 && a.kind === 'summon'; },
      apply: function (m) { m.more *= 1.15; } },
    { id: 'howl',       text: 'Howl active: +25% damage for all summons, plus 8% per rank of Pack Tactics.',
      when: function (a, d, ctx) { return ctx.howl && a.team === 0 && a.kind === 'summon'; },
      apply: function (m, a, d, ctx) { m.inc += 0.25 + (ctx.stats.howlDmg || 0) / 100; } },
    { id: 'encircled',  text: 'Target inside an Encircle ring: +15% damage.',
      when: function (a, d) { return d.encircled > 0; },
      apply: function (m) { m.inc += 0.15; } },
    { id: 'aura',       text: 'Attacker inside a damage aura: +aura dmgInc.',
      when: function (a) { return (a.auraDmgInc || 0) > 0; },
      apply: function (m, a) { m.inc += a.auraDmgInc; } },
    { id: 'omen',       text: 'Omen in the field: Marked enemies take +15% from all sources.',
      when: function (a, d, ctx) { return !!ctx.omen && d.marked > 0; },
      apply: function (m) { m.inc += 0.15; } },
    { id: 'alpha',      text: 'Wolves within 250px of an Alpha Wolf: +20% damage.',
      when: function (a) { return (a.alphaInc || 0) > 0; },
      apply: function (m, a) { m.inc += a.alphaInc; } },
    { id: 'bearguard',  text: 'Bear guard: a summon within 120px of a bear takes 15% less damage, plus 5% per rank of Ursine Might (caps at 50%).',
      when: function (a, d, ctx) { return !!ctx.bearGuard; },
      apply: function (m, a, d, ctx) { m.more *= 1 - Math.min(0.5, 0.15 + (ctx.stats.bearGuard || 0) / 100); } },
    { id: 'skinwalk',   text: 'The possessed summon: +30% damage (+10% per Skinwalker rank).',
      when: function (a) { return (a.skinInc || 0) > 0; },
      apply: function (m, a) { m.inc += a.skinInc; } },
    { id: 'rage',       text: 'Berserker: up to +100% damage as its life falls.',
      when: function (a) { return !!(a.evo && a.evo.rage && a.maxHp > 0); },
      apply: function (m, a) { m.inc += Math.max(0, Math.min(1, 1 - a.hp / a.maxHp)); } },
    { id: 'feral',      text: 'Feral affix: summons deal +v% damage (more).',
      when: function (a, d, ctx) { return !!(ctx.behaviors && ctx.behaviors.feral) && a.team === 0 && a.kind === 'summon'; },
      apply: function (m, a, d, ctx) { m.more *= 1 + ctx.behaviors.feral / 100; } },
    { id: 'bloodbound', text: 'Bloodbound affix: summons deal +v% damage.',
      when: function (a, d, ctx) { return !!(ctx.behaviors && ctx.behaviors.bloodbound) && a.team === 0 && a.kind === 'summon'; },
      apply: function (m, a, d, ctx) { m.inc += ctx.behaviors.bloodbound / 100; } },
    { id: 'enraged',    text: "Ursa's Lullaby: a bear waking from its sleep deals x1.5 damage for 8s.",
      when: function (a) { return (a.enrageT || 0) > 0; },
      apply: function (m) { m.more *= 1.5; } },
    { id: 'echoes',     text: 'Echoes: +2% summon damage per Enshrined Echo.',
      when: function (a, d, ctx) { return (ctx.stats.packDmgEcho || 0) > 0 && a.team === 0 && a.kind === 'summon'; },
      apply: function (m, a, d, ctx) { m.inc += ctx.stats.packDmgEcho / 100; } },
    { id: 'lashed',     text: 'Thornlash: a summon hitting a lashed enemy deals +50% damage for 2s. The whip tells the pack where to bite.',
      when: function (a, d) { return (d.lashed || 0) > 0 && a.team === 0 && a.kind === 'summon'; },
      apply: function (m) { m.more *= 1.5; } },
    { id: 'quarry',     text: 'The wood\'s quarry takes +20% damage from you and the pack.',
      when: function (a, d, ctx) { return !!ctx.quarry && a.team === 0; },
      apply: function (m) { m.inc += 0.20; } },
    { id: 'execute',    text: 'Bloodscent: summons deal +8% damage per rank to an enemy under half life.',
      when: function (a, d, ctx) { return (ctx.stats.execute || 0) > 0 && a.team === 0 && a.kind === 'summon' && d.maxHp > 0 && d.hp < d.maxHp * 0.5; },
      apply: function (m, a, d, ctx) { m.inc += ctx.stats.execute / 100; } },
    { id: 'kingslayer', text: 'Kingslayer scar: +20% damage vs bosses.',
      when: function (a, d) { return !!(d.boss && a.scars && a.scars.indexOf('kingslayer') >= 0); },
      apply: function (m) { m.inc += 0.20; } },
    { id: 'grovecombat', text: 'Combat Shrine: you and the pack deal +20% damage while it lasts.',
      when: function (a, d, ctx) { return !!(ctx.boon && ctx.boon.dmg) && a.team === 0; },
      apply: function (m, a, d, ctx) { m.more *= 1 + ctx.boon.dmg; } },
    { id: 'grovemonster', text: 'Monster Shrine: enemies deal +25% damage while the wood is turned.',
      when: function (a, d, ctx) { return !!(ctx.boon && ctx.boon.enemyDmg) && a.team === 1; },
      apply: function (m, a, d, ctx) { m.more *= 1 + ctx.boon.enemyDmg; } },
    { id: 'grovegreed', text: 'Greed Shrine: you and the pack take +12% damage until the wave ends.',
      when: function (a, d, ctx) { return !!(ctx.boon && ctx.boon.taken) && d.team === 0; },
      apply: function (m, a, d, ctx) { m.more *= 1 + ctx.boon.taken; } }
  ];

  // attacker: {dmg:[min,max], inc, more, critChance, critMult, tags, team, kind, auraDmgInc}
  // defender: {dr, marked, rooted, encircled, boss}
  // ctx: {stats, wolvesAlive, frenzy, howl, extraDr (Elder Ursine), omen, bearGuard}
  function computeHit(attacker, defender, ctx, rng) {
    ctx = ctx || { stats: {} };
    ctx.stats = ctx.stats || {};
    var m = {
      inc: attacker.inc || 0,
      more: attacker.more || 1,
      critChance: attacker.critChance != null ? attacker.critChance : 0.05,
      critMult: attacker.critMult || 1.75,
      rules: []
    };
    for (var i = 0; i < PB.SYNERGY_RULES.length; i++) {
      var rule = PB.SYNERGY_RULES[i];
      if (rule.when(attacker, defender, ctx)) { rule.apply(m, attacker, defender, ctx); m.rules.push(rule.id); }
    }
    var base = rng.range(attacker.dmg[0], attacker.dmg[1]);
    var crit = rng.chance(Math.min(m.critChance, 0.95));
    var raw = base * (1 + m.inc) * m.more * (crit ? m.critMult : 1);
    var dr = Math.min(0.9, Math.max(0, (defender.dr || 0) + (ctx.extraDr || 0)));
    return { amount: Math.max(1, Math.round(raw * (1 - dr))), crit: crit, rules: m.rules };
  }

  // Chorus: 3+ distinct summon tags hit the same target within CHORUS_WINDOW seconds.
  var CHORUS_WINDOW = 1.0;
  function recordChorusHit(target, tag, now) {
    var h = target.chorus || (target.chorus = {});
    h[tag] = now;
    var n = 0;
    for (var k in h) if (now - h[k] <= CHORUS_WINDOW) n++;
    if (n >= 3 && (!target.chorusCd || now >= target.chorusCd)) {
      target.chorusCd = now + 2.0; // a target can only Chorus every 2s
      return n;
    }
    return 0;
  }

  PB.Combat = { computeHit: computeHit, recordChorusHit: recordChorusHit, hasTag: hasTag, CHORUS_WINDOW: CHORUS_WINDOW };
})(globalThis.PB = globalThis.PB || {});
