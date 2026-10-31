// Summon individuals: creation, XP, evolution, diet infusion, scars, effective stats.
(function (PB) {
  'use strict';
  var MAX_LEVEL = 20;

  // Tuned so a fresh character's two busiest summons reach Tier II by the first Mirewood clear (economy.test.js).
  function xpToNext(level) { return Math.round(12 * Math.pow(level, 1.4)); }

  function generateName(rng, type) {
    var parts = PB.NAME_PARTS[type] || PB.NAME_PARTS.wolf;
    return rng.pick(parts[0]) + rng.pick(parts[1]);
  }

  function newDeeds() {
    return { kills: 0, bossKills: 0, crits: 0, eaten: 0, rallies: 0, nearDeaths: 0, damageTaken: 0, choruses: 0, firstborn: false };
  }

  function createIndividual(save, type, rng) {
    var ind = {
      id: save.nextIndId++, type: type, name: generateName(rng, type), level: 1, xp: 0, tier: 1, branch: null,
      infusion: null, diet: { rot: 0, ember: 0, frost: 0, storm: 0, stone: 0 }, scars: [], deeds: newDeeds(), fusedFrom: null
    };
    if (!save.roster.length) ind.deeds.firstborn = true;
    save.roster.push(ind);
    checkScars(ind);
    return ind;
  }

  function addXp(ind, amount) {
    var gained = 0;
    if (ind.level >= MAX_LEVEL) return { levels: 0, evolveReady: canEvolve(ind) };
    ind.xp += amount;
    while (ind.level < MAX_LEVEL && ind.xp >= xpToNext(ind.level)) {
      ind.xp -= xpToNext(ind.level);
      ind.level++;
      gained++;
    }
    if (ind.level >= MAX_LEVEL) ind.xp = 0;
    return { levels: gained, evolveReady: canEvolve(ind) };
  }

  function isFused(ind) { return !!ind.fusedFrom; }

  function canEvolve(ind) {
    if (isFused(ind)) return false;
    if (ind.tier === 1) return ind.level >= PB.EVOLVE_LEVELS[2];
    if (ind.tier === 2) return ind.level >= PB.EVOLVE_LEVELS[3];
    return false;
  }

  // Ties break by PB.ESSENCES order; needs at least 10 eaten of the winner.
  function dominantEssence(diet) {
    var best = null, bestN = 9;
    for (var i = 0; i < PB.ESSENCES.length; i++) {
      var k = PB.ESSENCES[i];
      if ((diet[k] || 0) > bestN) { best = k; bestN = diet[k]; }
    }
    return best;
  }

  function evolve(ind, choice) {
    if (!canEvolve(ind)) return { ok: false, reason: 'not-ready' };
    if (ind.tier === 1) {
      if (choice !== 'A' && choice !== 'B') return { ok: false, reason: 'choice' };
      ind.branch = choice;
      ind.tier = 2;
    } else {
      ind.tier = 3;
      ind.infusion = dominantEssence(ind.diet);
    }
    return { ok: true, tier: ind.tier, name: branchName(ind) };
  }

  function branchName(ind) {
    if (ind.tier < 2 || !ind.branch) return null;
    var b = PB.EVOLUTIONS[ind.type][ind.branch];
    return ind.tier === 3 ? b.t3.name : b.t2.name;
  }

  function eat(ind, essence) {
    ind.diet[essence] = (ind.diet[essence] || 0) + 1;
    ind.deeds.eaten++;
  }

  // Grants any newly earned scars (max PB.MAX_SCARS, in PB.SCARS order). Returns ids granted.
  function checkScars(ind) {
    var granted = [];
    for (var i = 0; i < PB.SCARS.length && ind.scars.length < PB.MAX_SCARS; i++) {
      var s = PB.SCARS[i];
      if (ind.scars.indexOf(s.id) < 0 && s.test(ind.deeds)) { ind.scars.push(s.id); granted.push(s.id); }
    }
    return granted;
  }

  function baseDef(ind) {
    if (PB.SUMMONS[ind.type]) return PB.SUMMONS[ind.type];
    for (var k in PB.FUSIONS) if (PB.FUSIONS[k].id === ind.type) return PB.FUSIONS[k];
    for (var t in PB.ALPHA) if (PB.ALPHA[t].id === ind.type) {
      var p = PB.SUMMONS[t], a = PB.ALPHA[t];
      return { name: a.name, hp: p.hp * a.mult, dmg: [p.dmg[0] * a.mult, p.dmg[1] * a.mult], atk: p.atk, speed: p.speed, r: p.r * 1.25, mass: p.mass * 1.5, range: p.range, ai: p.ai, rooted: p.rooted, flying: p.flying, aura: p.aura };
    }
    throw new Error('unknown summon type ' + ind.type);
  }

  // Effective combat stats for an individual given global stat mods (percent values).
  function statsFor(ind, stats) {
    stats = stats || {};
    var d = baseDef(ind);
    var hpMul = 1 + 0.06 * (ind.level - 1), dmgMul = 1 + 0.05 * (ind.level - 1), crit = 0.05, evo = {}, k;
    dmgMul *= 1 + 0.08 * Math.floor(ind.level / 5); // a felt step at levels 5, 10, 15 and 20
    if (ind.branch && PB.EVOLUTIONS[ind.type]) {
      var br = PB.EVOLUTIONS[ind.type][ind.branch];
      var tiers = ind.tier >= 3 ? [br.t2, br.t3] : [br.t2];
      tiers.forEach(function (t) { hpMul *= t.mods.hp || 1; dmgMul *= t.mods.dmg || 1; crit += t.mods.crit || 0; for (k in t.mods) evo[k] = t.mods[k]; });
    }
    if (isFused(ind)) { var f = 1 + (stats.fusedStats || 0) / 100; hpMul *= f; dmgMul *= f; }
    if (ind.scars.indexOf('firstborn') >= 0) hpMul *= 1.1;
    if (ind.scars.indexOf('butcher') >= 0) crit += 0.05;
    hpMul *= 1 + (stats.packHp || 0) / 100;
    dmgMul *= 1 + (stats.levelSpike || 0) / 100; // the druid's own steps, every 5 levels
    var tags = tagsFor(ind);
    tags.forEach(function (t) { hpMul *= 1 + (stats[t + 'Hp'] || 0) / 100; dmgMul *= 1 + (stats[t + 'Dmg'] || 0) / 100; });
    // Auras are copied, never shared with the data table: Oak Sage, Wolverine, Bloodmoon and Hearthfire change them.
    var aura = null;
    if (d.aura) {
      aura = {};
      for (k in d.aura) aura[k] = d.aura[k];
      if (aura.radius) aura.radius *= 1 + (stats.auraRadius || 0) / 100;
      if (evo.regen) aura.regen = (aura.regen || 0) * evo.regen;
      if (evo.dmgAura) aura.dmgInc = evo.dmgAura;
      if (evo.leechAura) aura.leech = evo.leechAura;
    }
    var dr = (evo.dr || 0) + (ind.scars.indexOf('warden') >= 0 ? 0.10 : 0) + (ind.infusion === 'stone' ? 0.20 : 0);
    return {
      hp: Math.round(d.hp * hpMul), dmg: [d.dmg[0] * dmgMul, d.dmg[1] * dmgMul], atk: d.atk, speed: d.speed, r: d.r,
      mass: d.mass || 1, range: d.range || 20, ai: d.ai, flying: !!d.flying, rooted: !!d.rooted, aura: aura,
      critChance: crit, critMult: ind.scars.indexOf('bonebreaker') >= 0 ? 1.9 : 1.75, tags: tags, infusion: ind.infusion,
      dr: dr, evo: evo
    };
  }

  // Fused individuals carry every parent tag, so synergies keyed on 'wolf' still fire for a Storm Hound.
  function tagsFor(ind) {
    if (PB.SUMMONS[ind.type]) return [ind.type];
    if (ind.fusedFrom) {
      var t = [];
      ind.fusedFrom.forEach(function (p) { (p.tags || [p.type]).forEach(function (x) { if (t.indexOf(x) < 0) t.push(x); }); });
      return t;
    }
    return [ind.type];
  }

  PB.Evolution = {
    MAX_LEVEL: MAX_LEVEL, xpToNext: xpToNext, createIndividual: createIndividual, addXp: addXp, canEvolve: canEvolve,
    evolve: evolve, branchName: branchName, eat: eat, dominantEssence: dominantEssence, checkScars: checkScars,
    statsFor: statsFor, tagsFor: tagsFor, baseDef: baseDef, generateName: generateName, isFused: isFused, newDeeds: newDeeds
  };
})(globalThis.PB = globalThis.PB || {});
