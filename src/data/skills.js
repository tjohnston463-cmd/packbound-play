// Skill tree: 3 trees x 4 tiers. A tier unlocks when that tree has TIER_REQ[tier] points spent.
// effect(rank) returns stat deltas merged into world.mods.stats (behaviors as booleans in .behaviors).
(function (PB) {
  'use strict';
  PB.SKILL_TREES = ['fang', 'wingroot', 'command'];
  PB.SKILL_TIER_REQ = [0, 0, 3, 6, 10]; // index = tier (1..4)
  PB.SKILLS = [
    // Fang: wolves and bear
    { id: 'packsize',   tree: 'fang', tier: 1, max: 3, name: 'Call of the Pack',  text: '+1 wolf cap per rank. Each rank also adds 4% wolf damage, so the first point hits before the extra wolf is out.', effect: function (r) { return { wolfCap: r, wolfDmg: 4 * r }; } },
    { id: 'thickfur',   tree: 'fang', tier: 1, max: 5, name: 'Thick Fur',         text: '+8% summon life per rank', effect: function (r) { return { packHp: 8 * r }; } },
    { id: 'tactics',    tree: 'fang', tier: 2, max: 3, req: ['packsize'], name: 'Pack Tactics', text: 'Wolves +3% damage per other wolf alive, per rank. Each rank also adds 8% to Howl.', effect: function (r) { return { packTactics: 3 * r }; } },
    { id: 'ursine',     tree: 'fang', tier: 2, max: 3, req: ['thickfur'], name: 'Ursine Might', text: '+15% bear life and damage per rank; rank 3: second bear. Each rank also adds 5% to Bear guard.', effect: function (r) { return { bearHp: 15 * r, bearDmg: 15 * r, bearCap: r >= 3 ? 1 : 0 }; } },
    { id: 'lunge',      tree: 'fang', tier: 3, max: 1, req: ['tactics'], name: 'Lunge', text: 'Wolves lunge 180px and knock down for 0.3s', effect: function () { return { behaviors: { lunge: 1 } }; } },
    { id: 'maul',       tree: 'fang', tier: 3, max: 1, req: ['ursine'], name: 'Crushing Maul', text: 'Bear hits stun for 0.5s', effect: function () { return { behaviors: { maulstun: 1 } }; } },
    { id: 'bloodscent', tree: 'fang', tier: 3, max: 3, name: 'Bloodscent', text: '+10% summon speed per rank toward enemies under half life. Each rank also adds 8% damage against those enemies.', effect: function (r) { return { bloodscent: 10 * r, execute: 8 * r }; } },
    { id: 'lordfangs',  tree: 'fang', tier: 4, max: 1, req: ['lunge'], name: 'Lord of Fangs', text: 'KEYSTONE: wolf cap doubled and wolves cost half; a called wolf fades back to the roster after 30s (same individual, no Den time, deeds kept)', effect: function () { return { behaviors: { lordfangs: 1 } }; } },
    // Wing & Root: ravens and vines
    { id: 'flock',      tree: 'wingroot', tier: 1, max: 3, name: 'Flock',        text: '+2 raven cap per rank', effect: function (r) { return { ravenCap: 2 * r }; } },
    { id: 'deeproots',  tree: 'wingroot', tier: 1, max: 3, name: 'Deep Roots',   text: '+0.3s vine root per rank', effect: function (r) { return { rootDur: 0.3 * r }; } },
    { id: 'keeneyes',   tree: 'wingroot', tier: 2, max: 3, req: ['flock'], name: 'Keen Eyes', text: 'Mark lasts +2s and Marked take +5% damage per rank. Each rank also adds 5% crit chance for wolves against Marked foes.', effect: function (r) { return { markDur: 2 * r, markDmg: 5 * r }; } },
    { id: 'blight',     tree: 'wingroot', tier: 2, max: 3, req: ['deeproots'], name: 'Blight', text: '+25% poison damage per rank. Each rank also adds 10% damage for bears against Rooted foes.', effect: function (r) { return { poisonDmg: 25 * r }; } },
    { id: 'feast',      tree: 'wingroot', tier: 3, max: 1, name: 'Carrion Feast', text: 'Eating corpses grants double summon XP', effect: function () { return { behaviors: { feast: 1 } }; } },
    { id: 'overgrowth', tree: 'wingroot', tier: 3, max: 2, req: ['blight'], name: 'Overgrowth', text: '+1 vine cap per rank', effect: function (r) { return { vineCap: r }; } },
    { id: 'volley',     tree: 'wingroot', tier: 3, max: 1, req: ['keeneyes'], name: 'Murder of Crows', text: 'Ravens attack in synchronized volleys: +40% raven damage', effect: function () { return { ravenDmg: 40 }; } },
    { id: 'greenbelow', tree: 'wingroot', tier: 4, max: 1, req: ['overgrowth'], name: 'The Green Below', text: 'KEYSTONE: a temporary vine sprouts wherever an elite dies or is rooted', effect: function () { return { behaviors: { greenbelow: 1 } }; } },
    // Command: spirits, commands, fusion, skinwalk
    { id: 'wellspring', tree: 'command', tier: 1, max: 5, name: 'Wellspring', text: '+10% Spirit regen per rank. Each rank also adds 5% Chorus burst damage.', effect: function (r) { return { spiritRegen: 10 * r }; } },
    { id: 'cmdecho',    tree: 'command', tier: 1, max: 3, name: 'Clear Voice', text: '8% faster command cooldowns per rank', effect: function (r) { return { cmdCdr: 8 * r }; } },
    { id: 'hearth',     tree: 'command', tier: 2, max: 3, req: ['wellspring'], name: 'Hearthfire', text: '+15% aura radius per rank', effect: function (r) { return { auraRadius: 15 * r }; } },
    { id: 'rallyshield',tree: 'command', tier: 2, max: 3, req: ['cmdecho'], name: 'Rally Shield', text: 'Rally shield +10% of max life per rank (20% base: 30/40/50%)', effect: function (r) { return { rallyShield: 10 * r }; } },
    { id: 'skinwalker', tree: 'command', tier: 3, max: 3, name: 'Skinwalker', text: '+4s Skinwalk and +10% possessed damage per rank', effect: function (r) { return { skinDur: 4 * r, skinDmg: 10 * r }; } },
    { id: 'fusionlore', tree: 'command', tier: 3, max: 3, req: ['hearth'], name: 'Fusion Lore', text: '+10% fused summon stats per rank; rank 3: +1 fusion slot', effect: function (r) { return { fusedStats: 10 * r, fusionSlots: r >= 3 ? 1 : 0 }; } },
    { id: 'chorus',     tree: 'command', tier: 3, max: 3, req: ['rallyshield'], name: 'Chorus Master', text: '+20% Chorus burst damage per rank', effect: function (r) { return { chorusDmg: 20 * r }; } },
    { id: 'eternal',    tree: 'command', tier: 4, max: 1, req: ['fusionlore'], name: 'Wild Hunt Eternal', text: 'KEYSTONE: the Wild Hunt calls every Echo you own; refunds 30% Chorus', effect: function () { return { behaviors: { eternal: 1 } }; } }
  ];
  PB.SKILL_BY_ID = {};
  PB.SKILLS.forEach(function (s) { PB.SKILL_BY_ID[s.id] = s; });
})(globalThis.PB = globalThis.PB || {});
