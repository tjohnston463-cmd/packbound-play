// The wards. Each wood bites in an element. Gear answers it, up to 75, and a penalty applies before the cap
// so stacking past 75 still matters in the Terror. A deep-Moon elite can be warded in its own element.
// At 0 resist an elemental hit deals the same total it dealt before wards existed: only the split changes.
(function (PB) {
  'use strict';

  var ELEMENTS = ['blight', 'flame', 'frost', 'spark'];
  var NAMES = { blight: 'Blight', flame: 'Flame', frost: 'Frost', spark: 'Spark' };
  var COLOR = { blight: '#8fd34a', flame: '#ff7a3a', frost: '#9fd8ff', spark: '#f5e46a' };
  var ESSENCE = { rot: 'blight', ember: 'flame', frost: 'frost', storm: 'spark' };
  var ZONE = ['blight', 'flame', 'frost', 'spark', 'blight'];
  var CAP = 75, IN_SHARE = 0.4, PACK_SHARE = 0.22, TERROR_CUT = 40, SUNDER_CUT = 20, SUNDER_THROUGH = 0.2;
  var STAT = { blight: 'blightRes', flame: 'flameRes', frost: 'frostRes', spark: 'sparkRes' };
  var HELP = 'The wood bites in an element: blight, flame, frost or spark. Gear wards you, and 75 is the cap. A penalty, the Terror or the Cracked Moon, comes off before the cap, so extra wards still matter. From Moon 2 an elite can be warded in its own element, and a Terror champion always is. Aim the whip, curse with the spear, stand in Zeal, or spin a second time to crack the one in front of you. Fire melts frost. A living monolith cracks flame. Lightning seams a spark ward. The Cracked Moon lets a fifth of a warded hit through and sits your own wards 20 lower.';

  function elementOf(type) {
    var def = (PB.ENEMIES && PB.ENEMIES[type]) || (PB.BOSSES && PB.BOSSES[type]);
    return (def && ESSENCE[def.essence]) || null;
  }

  function zoneElement(world) {
    var d = world && world.dir;
    if (!d || d.zone == null || d.zone < 0) return null;
    return ZONE[d.zone] || null;
  }

  function monolithUp(world) {
    var ents = world.ents, i;
    for (i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.kind === 'summon' && !e.dead && e.type === 'monolith') return true;
    }
    return false;
  }

  // Gear, then the Terror, then the Cracked Moon, then the cap. Negative wards amplify.
  function resist(world, element) {
    if (!element) return 0;
    var st = (world.mods && world.mods.stats) || {};
    var v = (st[STAT[element]] || 0) + (st.allRes || 0);
    if (world.dir && world.dir.terror) v -= TERROR_CUT;
    if (world.mods && world.mods.behaviors && world.mods.behaviors.sunder) v -= SUNDER_CUT;
    if (v > CAP) v = CAP;
    if (v < -100) v = -100;
    return v;
  }

  function split(amount, share, factor) {
    var ele = Math.round(amount * share);
    var phys = amount - ele;
    var out = phys + Math.round(ele * factor);
    return out < 0 ? 0 : out;
  }

  function cracked(e, now) { return !!(e && e.ward && e.wardBreak > now); }

  // One body loses its ward for a few seconds. A second crack only extends the timer.
  function crack(world, e, dur) {
    if (!e || !e.ward) return false;
    var now = world.time || 0;
    if (e.wardBreak > now) { e.wardBreak = Math.max(e.wardBreak, now + dur); return false; }
    e.wardBreak = now + dur;
    PB.Events.emit(world.events, 'ward-break', { id: e.id, x: e.x, y: e.y, element: e.ward });
    return true;
  }

  // how: aim (the whip), line (spear, javelin, a dash), flame, arc (Zeal), spin, dash.
  function open(world, e, how) {
    if (!e || !e.ward) return false;
    var kind = PB.Classes.of(world.save).attack;
    if (how === 'flame') {
      if (e.ward === 'frost') return crack(world, e, 4);
      if (e.ward === 'flame' && monolithUp(world)) return crack(world, e, 4);
      return false;
    }
    if (how === 'spin') return crack(world, e, 6);
    if (how === 'dash') {
      if (kind === 'whirl') return (world.player.whirlN || 0) >= 2 ? crack(world, e, 6) : false;
      if (kind === 'fireball') return open(world, e, 'flame');
      return crack(world, e, 4);
    }
    if (how === 'aim' || how === 'line' || how === 'arc') return crack(world, e, 4);
    return false;
  }

  // Tag the calling's own swing. Zeal and Whirlwind stay physical; they answer a ward by cracking it.
  function arm(world, att) {
    if (!att) return att;
    var kind = PB.Classes.of(world.save).attack;
    att.element = null;
    att.eleShare = 0;
    att.elePierce = 0;
    if (kind === 'thornlash') { att.element = 'blight'; att.eleShare = 0.7; }
    else if (kind === 'bonespear') { att.element = zoneElement(world); att.eleShare = att.element ? 0.45 : 0; }
    else if (kind === 'fireball') { att.element = 'flame'; att.eleShare = 1; }
    else if (kind === 'fury') { att.element = 'spark'; att.eleShare = 1; att.elePierce = 0.35; }
    return att;
  }

  function mitigate(world, att, def, amount) {
    var none = { amount: amount, element: null, stopped: false };
    if (!att || !def || !(amount > 0)) return none;
    var element = att.element || null;
    var share = att.eleShare;
    if (att.team === 1) {
      if (!element) element = att.type ? elementOf(att.type) : null;
      if (!element && att.id != null && world.byId && world.byId[att.id]) element = world.byId[att.id].element || elementOf(world.byId[att.id].type);
      if (share == null) share = element ? IN_SHARE : 0;
    } else if (att.kind === 'summon') {
      element = zoneElement(world);
      share = element ? PACK_SHARE : 0;
    } else if (share == null) share = 0;
    if (!element || !(share > 0)) return none;
    var factor = 1, stopped = false;
    if (att.team === 1 && def.team === 0) {
      factor = 1 - resist(world, element) / 100;
    } else if (att.team === 0 && def.team === 1) {
      var immune = def.ward === element && !cracked(def, world.time || 0);
      if (immune) {
        var through = att.elePierce || 0;
        if (world.mods && world.mods.behaviors && world.mods.behaviors.sunder) through = Math.max(through, SUNDER_THROUGH);
        factor = through;
        stopped = through <= 0;
      }
    } else return none;
    var next = split(amount, share, factor);
    return { amount: next, element: element, stopped: !!(stopped && next === 0) };
  }

  // Moon 0 stays clean. Moon 2 wards about half the elites, by where they entered. A Terror champion is always warded.
  // A boss is never warded. Stone has no element.
  function stamp(e, dir) {
    if (!e) return e;
    var el = elementOf(e.type);
    if (e.element == null) e.element = el;
    if (!el || e.boss) { e.ward = null; return e; }
    var moon = dir && (dir.moon || 0);
    var elite = e.elite && e.elite.length;
    var on = false;
    if (dir && dir.terror && e.champion) on = true;
    else if (moon >= 2 && elite) on = (((e.spawnX | 0) + (e.spawnY | 0) + el.charCodeAt(0)) & 1) === 0;
    e.ward = on ? el : null;
    return e;
  }

  function attackNote(world) {
    var kind = world && world.save ? PB.Classes.of(world.save).attack : 'thornlash';
    if (kind === 'bonespear') return 'Curse strips';
    if (kind === 'fireball') return monolithUp(world) ? 'Flame · monolith cracks it' : 'Flame · melts frost';
    if (kind === 'zeal') return 'Zeal strips';
    if (kind === 'fury') return 'Spark seams';
    if (kind === 'whirl') return (world.player && (world.player.whirlN || 0) >= 2) ? 'Spin cracks' : '2nd spin cracks';
    return 'Aim strips';
  }

  function hudLine(world) {
    if (!world || !world.mods) return '';
    var parts = [attackNote(world)];
    for (var i = 0; i < ELEMENTS.length; i++) {
      var id = ELEMENTS[i];
      parts.push(NAMES[id] + ' ' + resist(world, id));
    }
    var tail = [];
    if (world.dir && world.dir.terror) tail.push('Terror -' + TERROR_CUT);
    if (world.mods.behaviors && world.mods.behaviors.sunder) tail.push('Cracked Moon -' + SUNDER_CUT);
    return parts.join(' · ') + (tail.length ? ' · ' + tail.join(' · ') : '');
  }

  PB.Wards = {
    ELEMENTS: ELEMENTS, NAMES: NAMES, COLOR: COLOR, CAP: CAP, IN_SHARE: IN_SHARE, PACK_SHARE: PACK_SHARE,
    TERROR_CUT: TERROR_CUT, SUNDER_CUT: SUNDER_CUT, SUNDER_THROUGH: SUNDER_THROUGH, HELP: HELP,
    elementOf: elementOf, zoneElement: zoneElement, resist: resist, mitigate: mitigate, stamp: stamp,
    crack: crack, open: open, arm: arm, hudLine: hudLine, monolithUp: monolithUp
  };
})(globalThis.PB = globalThis.PB || {});
