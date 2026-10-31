// Fusion table. Key = the two parent types sorted and joined with '+'. Fused summons carry both parents' tags.
// Every row carries the full body (hp, dmg, atk, speed, r, mass, range, ai) so World.spawnIndividual can spawn it.
(function (PB) {
  'use strict';
  PB.FUSIONS = {
    'raven+wolf':   { id: 'stormhound',   name: 'Storm Hound',    hp: 90,  dmg: [9, 13],  atk: 0.7, speed: 280, r: 12, mass: 1.2, range: 26, ai: 'flank', ability: 'Bite chains lightning to 2 Marked enemies within 160px; blinks to Marked targets.' },
    'bear+wolf':    { id: 'direwarg',     name: 'Dire Warg',      hp: 220, dmg: [16, 22], atk: 1.0, speed: 210, r: 17, mass: 2.5, range: 30, ai: 'flank', ability: 'Bite cleaves a 90deg arc; on kill howls: pack +15% move speed for 4s.' },
    'vine+wolf':    { id: 'thornpelt',    name: 'Thornpelt',      hp: 120, dmg: [8, 11],  atk: 0.8, speed: 220, r: 12, mass: 1.5, range: 26, ai: 'flank', ability: 'Reflects 30% of melee damage taken; leaves a bramble trail that slows 30% and poisons.' },
    'spirit+wolf':  { id: 'wraithwolf',   name: 'Wraith Wolf',    hp: 70,  dmg: [10, 14], atk: 0.8, speed: 260, r: 11, mass: 1.0, range: 26, ai: 'flank', ghost: true, ability: 'Phases through bodies; 25% of damage dealt heals the druid.' },
    'bear+raven':   { id: 'owlbear',      name: 'Owlbear',        hp: 260, dmg: [20, 28], atk: 1.3, speed: 170, r: 19, mass: 3.5, range: 32, ai: 'guard', ability: 'Leaps onto the densest cluster within 350px every 7s; landing slam blinds (enemies miss 50%) for 2s.' },
    'raven+vine':   { id: 'carrionbloom', name: 'Carrion Bloom',  hp: 110, dmg: [6, 9],   atk: 1.2, speed: 0,   r: 15, mass: 99, range: 260, ai: 'rooted', rooted: true, ability: 'Spits seeds (ranged 260px); enemies dying in range burst into 3 carrion crows for 6s.' },
    'raven+spirit': { id: 'omen',         name: 'Omen',           hp: 60,  dmg: [0, 0],   atk: 0,   speed: 220, r: 10, mass: 0.5, range: 260, ai: 'aura',  flying: true, aura: { radius: 260, markAll: 5, dmgInc: 0.15 }, ability: 'Every 5s Marks every enemy within 260px; Marked enemies take +15% from all sources.' },
    'bear+vine':    { id: 'rootwarden',   name: 'Rootwarden',     hp: 380, dmg: [14, 20], atk: 1.6, speed: 110, r: 22, mass: 5.0, range: 34, ai: 'guard', ability: 'Slam roots all enemies within 120px for 1.2s; plants a temporary vine sapling every 15s.' },
    'bear+spirit':  { id: 'eldersbear',   name: 'Elder Ursine',   hp: 320, dmg: [16, 22], atk: 1.4, speed: 150, r: 21, mass: 4.0, range: 34, ai: 'guard', aura: { radius: 200, dr: 0.25 }, ability: 'Aura: pack takes 25% less damage; roar every 10s fears non-elites for 1.5s.' },
    'spirit+vine':  { id: 'lifebloom',    name: 'Lifebloom',      hp: 140, dmg: [0, 0],   atk: 0,   speed: 0,   r: 15, mass: 99, range: 240, ai: 'rooted', rooted: true, aura: { radius: 240, regen: 8 }, ability: 'Beams 8 HP/s to the lowest-HP summon in range; revives one Den summon instantly every 30s.' }
  };
  // Same-type fusion: "Alpha" variant of the parent, data-driven.
  PB.ALPHA = {
    wolf:   { id: 'alphawolf',   name: 'Alpha Wolf',     mult: 1.6, ability: 'Wolves within 250px deal +20% damage and follow its target.' },
    raven:  { id: 'murder',      name: 'Murder',         mult: 1.6, ability: 'A swarm of 3 birds acting as one; each peck Marks.' },
    bear:   { id: 'greatbear',   name: 'Great Bear',     mult: 1.6, ability: 'Size +40%; maul knockback doubled; taunt radius 220px.' },
    vine:   { id: 'stranglegrove', name: 'Strangler Grove', mult: 1.6, ability: 'Range 220px; grabs two targets at once and pulls them in 60px.' },
    spirit: { id: 'twinspirit',  name: 'Twin Spirit',    mult: 1.6, ability: 'Emits both Oak (regen) and Wolverine (damage) auras.' }
  };
  PB.FUSION_COST = { cross: 2, alpha: 3 }; // Moonstones
})(globalThis.PB = globalThis.PB || {});
