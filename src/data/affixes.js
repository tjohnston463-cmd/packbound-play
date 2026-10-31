// Affixes. kind 'behavior' changes HOW summons act (read by sim through world.mods.behaviors[id]);
// kind 'stat' is a number summed into world.mods.stats[stat]. group: at most one affix per group per item.
(function (PB) {
  'use strict';
  PB.AFFIXES = [
    // ---- behavior (prefixes) ----
    { id: 'leaping',    kind: 'behavior', group: 'wolfmove',  slots: ['staff', 'pelt', 'charm'], ilvl: 1,  name: 'Leaping',    v: [240, 320], text: 'Wolves leap at prey up to {v}px away, knocking it down for 0.4s.' },
    { id: 'predatory',  kind: 'behavior', group: 'wolftarget',slots: ['staff', 'mask', 'charm'], ilvl: 4,  name: 'Predatory',  v: [8, 14],    text: 'Wolves hunt the weakest enemy within 400px and execute targets below {v}% HP.' },
    { id: 'howling',    kind: 'behavior', group: 'wolfproc',  slots: ['mask', 'charm'],          ilvl: 3,  name: 'Howling',    v: [8, 12],    text: 'Wolf crits howl: summons within 250px gain +{v}% attack speed for 3s (stacks 3).' },
    { id: 'swarming',   kind: 'behavior', group: 'cap',       slots: ['talisman', 'charm'],      ilvl: 6,  name: 'Swarming',   v: [2, 2],     text: 'Wolf cap +{v}, but wolves have 25% less life.' },
    { id: 'splitting',  kind: 'behavior', group: 'ravenproc', slots: ['mask', 'charm'],          ilvl: 2,  name: 'Splitting',  v: [6, 8],     text: 'A raven that lands a killing peck splits into 2 ravenlings for {v}s.' },
    { id: 'migratory',  kind: 'behavior', group: 'ravenmove', slots: ['staff', 'mask'],          ilvl: 5,  name: 'Migratory',  v: [1, 1],     text: 'Ravens circle your Focus target instead of you, Marking every enemy they fly over.' },
    { id: 'hoarding',   kind: 'behavior', group: 'ravenmove2',slots: ['talisman', 'charm'],      ilvl: 1,  name: 'Hoarding',   v: [1, 1],     text: 'Idle ravens fetch dropped loot and Moonstones to you.' },
    { id: 'volatile',   kind: 'behavior', group: 'mark',      slots: ['staff', 'charm'],         ilvl: 7,  name: 'Volatile',   v: [30, 45],   text: 'Marked enemies explode on death for {v}% of their max life to nearby enemies.' },
    { id: 'thunderous', kind: 'behavior', group: 'bearproc',  slots: ['pelt', 'charm'],          ilvl: 4,  name: 'Thunderous', v: [80, 120],  text: 'Bear mauls send a shockwave ring ({v}px) dealing 50% damage.' },
    { id: 'tethered',   kind: 'behavior', group: 'bearmove',  slots: ['pelt', 'talisman'],       ilvl: 3,  name: 'Tethered',   v: [25, 35],   text: '{v}% of damage you take goes to your bear instead; the bear is yanked to you beyond 300px.' },
    { id: 'grafted',    kind: 'behavior', group: 'vinemove',  slots: ['staff', 'talisman'],      ilvl: 8,  name: 'Grafted',    v: [1, 1],     text: 'Your newest vine grows on your bear\'s back and travels with it.' },
    { id: 'burrowing',  kind: 'behavior', group: 'vinemove',  slots: ['staff', 'charm'],         ilvl: 5,  name: 'Burrowing',  v: [8, 12],    text: 'Every {v}s each vine tunnels to the densest enemy cluster within 400px.' },
    { id: 'sentinel',   kind: 'behavior', group: 'ravenmove', slots: ['mask', 'talisman'],       ilvl: 6,  name: 'Sentinel',   v: [40, 60],   text: 'Ravens perch on vines: +{v}% vine range and the vine fires feathers.' },
    { id: 'rootbound',  kind: 'behavior', group: 'spirit',    slots: ['mask', 'talisman'],       ilvl: 4,  name: 'Rootbound',  v: [80, 100],  text: 'Spirits plant where summoned: immobile, but aura radius +{v}%.' },
    { id: 'ghostly',    kind: 'behavior', group: 'packmove',  slots: ['pelt', 'mask'],           ilvl: 5,  name: 'Ghostly',    v: [10, 15],   text: 'Summons pass through enemies and gain +{v}% move speed.' },
    { id: 'shepherds',  kind: 'behavior', group: 'packmove',  slots: ['pelt', 'talisman'],       ilvl: 2,  name: "Shepherd's", v: [20, 30],   text: 'Summons never stray beyond 200px of you, but take {v}% less damage.' },
    { id: 'feral',      kind: 'behavior', group: 'packmind',  slots: ['staff', 'mask'],          ilvl: 6,  name: 'Feral',      v: [20, 30],   text: 'Summons ignore Focus and Hold, but deal +{v}% damage.' },
    { id: 'martyrs',    kind: 'behavior', group: 'death',     slots: ['pelt', 'charm'],          ilvl: 3,  name: "Martyr's",   v: [40, 60],   text: 'A dying summon bursts for {v}% of its max life and heals nearby summons for the same.' },
    { id: 'carrion',    kind: 'behavior', group: 'eat',       slots: ['mask', 'charm'],          ilvl: 1,  name: 'Carrion',    v: [8, 12],    text: 'Summons eat corpses they pass instantly, healing {v}% life each.' },
    { id: 'stampeding', kind: 'behavior', group: 'rally',     slots: ['staff', 'pelt'],          ilvl: 7,  name: 'Stampeding', v: [60, 90],   text: 'Rally becomes a charge: summons trample through enemies to you for {v}% damage.' },
    { id: 'echoing',    kind: 'behavior', group: 'cmd',       slots: ['staff', 'talisman'],      ilvl: 9,  name: 'Echoing',    v: [1, 1],     text: 'Focus also taunts the target; Rally also Howls.' },
    { id: 'hivemind',   kind: 'behavior', group: 'hp',        slots: ['talisman'],               ilvl: 10, name: 'Hivemind',   v: [10, 15],   text: 'All summons share one life pool (+{v}%); damage spreads across the pack.' },
    { id: 'bloodbound', kind: 'behavior', group: 'cost',      slots: ['staff', 'talisman'],      ilvl: 8,  name: 'Bloodbound', v: [20, 30],   text: 'Summoning costs Life instead of Spirit; summons deal +{v}% damage.' },
    { id: 'mirrored',   kind: 'behavior', group: 'skin',      slots: ['mask'],                   ilvl: 9,  name: 'Mirrored',   v: [6, 8],     text: 'Leaving Skinwalk leaves an echo of that summon fighting for {v}s.' },
    // ---- stat (suffixes) ----
    { id: 'of_fang',    kind: 'stat', stat: 'wolfDmg',     group: 's_wolf',   slots: ['staff', 'charm', 'pelt'], ilvl: 1, name: 'of the Fang',   v: [10, 30], text: '+{v}% wolf damage' },
    { id: 'of_wing',    kind: 'stat', stat: 'ravenDmg',    group: 's_raven',  slots: ['staff', 'charm', 'mask'], ilvl: 1, name: 'of the Wing',   v: [10, 30], text: '+{v}% raven damage' },
    { id: 'of_ursa',    kind: 'stat', stat: 'bearHp',      group: 's_bear',   slots: ['pelt', 'charm'],          ilvl: 1, name: 'of Ursa',       v: [15, 40], text: '+{v}% bear life' },
    { id: 'of_grove',   kind: 'stat', stat: 'vineDmg',     group: 's_vine',   slots: ['staff', 'charm'],         ilvl: 1, name: 'of the Grove',  v: [10, 30], text: '+{v}% vine damage' },
    { id: 'of_hearth',  kind: 'stat', stat: 'auraRadius',  group: 's_spirit', slots: ['mask', 'talisman'],       ilvl: 1, name: 'of the Hearth', v: [10, 25], text: '+{v}% aura radius' },
    { id: 'of_moon',    kind: 'stat', stat: 'spiritRegen', group: 's_regen',  slots: ['mask', 'talisman', 'charm'], ilvl: 1, name: 'of the Moon', v: [10, 40], text: '+{v}% Spirit regeneration' },
    { id: 'of_plenty',  kind: 'stat', stat: 'summonCap',   group: 's_cap',    slots: ['talisman'],               ilvl: 12, name: 'of Plenty',    v: [1, 1],   text: '+{v} to every summon cap' },
    { id: 'of_bark',    kind: 'stat', stat: 'armor',       group: 's_armor',  slots: ['pelt', 'mask'],           ilvl: 1, name: 'of Bark',       v: [5, 20],  text: '+{v}% damage reduction (druid)' },
    { id: 'of_hunger',  kind: 'stat', stat: 'packLeech',   group: 's_leech',  slots: ['staff', 'charm'],         ilvl: 4, name: 'of Hunger',     v: [2, 5],   text: 'Summons leech {v}% of damage as life' },
    { id: 'of_haste',   kind: 'stat', stat: 'packAtkSpd',  group: 's_aspd',   slots: ['staff', 'charm', 'mask'], ilvl: 3, name: 'of Haste',      v: [5, 15],  text: '+{v}% summon attack speed' },
    { id: 'of_vigor',   kind: 'stat', stat: 'packHp',      group: 's_hp',     slots: ['pelt', 'talisman', 'charm'], ilvl: 1, name: 'of Vigor',  v: [8, 25],  text: '+{v}% summon life' },
    { id: 'of_command', kind: 'stat', stat: 'cmdCdr',      group: 's_cdr',    slots: ['staff', 'mask'],          ilvl: 5, name: 'of Command',    v: [5, 15],  text: '{v}% faster command cooldowns' },
    { id: 'of_finding', kind: 'stat', stat: 'magicFind',   group: 's_mf',     slots: ['mask', 'charm', 'talisman'], ilvl: 1, name: 'of Finding',  v: [10, 40], text: '+{v}% chance of better loot' },
    { id: 'of_crush',   kind: 'stat', stat: 'crush',       group: 's_crush',  slots: ['staff', 'pelt', 'charm'], ilvl: 6, name: 'of Crushing', v: [8, 18], text: 'Your hits crush {v}% of an elite, champion or boss\'s current life' },
    { id: 'of_strike',  kind: 'stat', stat: 'deadly',      group: 's_deadly', slots: ['staff', 'mask', 'charm'], ilvl: 5, name: 'of Striking', v: [8, 20], text: '{v}% chance your hits strike twice as hard' },
    { id: 'of_vein',    kind: 'stat', stat: 'lifeLeech',   group: 's_vein',   slots: ['staff', 'pelt', 'charm'], ilvl: 4, name: 'of the Vein', v: [2, 6], text: 'Your hits return {v}% of damage as life' },
    { id: 'of_well',    kind: 'stat', stat: 'spiritLeech', group: 's_well',   slots: ['mask', 'talisman', 'charm'], ilvl: 4, name: 'of the Well', v: [2, 6], text: 'Your hits return {v}% of damage as Spirit' }
  ];
  PB.AFFIX_BY_ID = {};
  PB.AFFIXES.forEach(function (a) { PB.AFFIX_BY_ID[a.id] = a; });
})(globalThis.PB = globalThis.PB || {});
