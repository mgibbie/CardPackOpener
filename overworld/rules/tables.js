// rules/tables.js — the move families, ability tables, type chart, stat-change moves and stat stages.
// Moved VERBATIM out of overworld/battle.js (Poketactica stage 1, owner 2026-11-20): the overworld's battles and
// Poketactica read the SAME Pokémon rules from here. No DOM, no state, no randomness. battle.js imports them back.

// move-class lists that abilities key off
export const PUNCH_MOVES = new Set(['firepunch', 'icepunch', 'thunderpunch', 'machpunch', 'megapunch',
	'cometpunch', 'dizzypunch', 'drainpunch', 'dynamicpunch', 'focuspunch', 'hammerarm',
	'megakick', 'poweruppunch', 'shadowpunch', 'skyuppercut', 'bulletpunch', 'meteormash', 'plasmafists']);
export const BITE_MOVES = new Set(['bite', 'crunch', 'firefang', 'icefang', 'thunderfang', 'poisonfang',
	'hyperfang', 'superfang', 'psychicfangs', 'fishiousrend', 'jawlock']);
export const PULSE_MOVES = new Set(['waterpulse', 'darkpulse', 'dragonpulse', 'aurasphere', 'healpulse', 'originpulse', 'terrainpulse']);
export const BULLET_MOVES = new Set(['bulletseed', 'rockblast', 'iceball', 'octazooka', 'aurasphere',
	'barrage', 'eggbomb', 'electroball', 'energyball', 'focusblast', 'gyroball', 'mistball',
	'mudsport', 'seedbomb', 'shadowball', 'sludgebomb', 'weatherball', 'zapcannon', 'acidspray', 'pollenpuff']);
export const POWDER_MOVES = new Set(['poisonpowder', 'sleeppowder', 'stunspore', 'spore', 'cottonspore', 'ragepowder', 'magicpowder', 'powder']);
// pure type-power boosters (x1.5 on that element)
export const AB_TYPE_BOOST = { steelworker: 'Steel', dragonsmaw: 'Dragon', transistor: 'Electric', rockypayload: 'Rock' };
// -ate abilities: Normal moves convert and gain x1.2
export const AB_ATE = { aerilate: 'Flying', pixilate: 'Fairy', refrigerate: 'Ice', galvanize: 'Electric' };
// full-immunity absorbers beyond the classics
export const AB_ABSORB = {
	waterabsorb: { t: 'Water', heal: true }, dryskin: { t: 'Water', heal: true },
	voltabsorb: { t: 'Electric', heal: true }, eartheater: { t: 'Ground', heal: true },
	sapsipper: { t: 'Grass', boost: ['atk', 1] }, stormdrain: { t: 'Water', boost: ['spa', 1] },
	lightningrod: { t: 'Electric', boost: ['spa', 1] }, motordrive: { t: 'Electric', boost: ['spe', 1] },
	wellbakedbody: { t: 'Fire', boost: ['def', 2] },
};
// post-hit reactions on the defender (physical contact unless noted)
export const AB_ONHIT = {
	gooey: { drop: 'spe' }, tanglinghair: { drop: 'spe' }, cottondown: { drop: 'spe', anyHit: true },
	stamina: { self: ['def', 1], anyHit: true }, weakarmor: { selfMulti: { def: -1, spe: 2 } },
	justified: { self: ['atk', 1], type: 'Dark', anyHit: true },
	rattled: { self: ['spe', 1], types: ['Bug', 'Ghost', 'Dark'], anyHit: true },
	sandspit: { weather: 'sand', anyHit: true },
	cursedbody: { disable: true, anyHit: true, ch: 0.3 },
	ironbarbs: { chip: 8 }, roughskin: { chip: 8 },
	// all of these were inert — the table already had the shape they needed
	steamengine: { selfMulti: { spe: 6 }, types: ['Fire', 'Water'], anyHit: true },
	watercompaction: { selfMulti: { def: 2 }, type: 'Water', anyHit: true },
	electromorphosis: { charge: true, anyHit: true },
	windpower: { charge: true, anyHit: true, wind: true },
	seedsower: { terrain: 'grassy', anyHit: true },
	angershell: { selfMulti: { atk: 1, spa: 1, spe: 1, def: -1, spd: -1 }, anyHit: true, halfHp: true },
	grasspelt: {}, // no on-hit component; its Defense boost lives in statOf
	// Radical Ransei's custom abilities (the design wiki's text; all were inert, owner 2026-11-20)
	infuriate: { self: ['atk', 1], anyHit: true, cat: 'Physical' },
};
// moves that strike every opposing mon in a double battle
// the subset of spread moves that hit EVERYTHING adjacent — including the
// user's own partner. This is what finally gives TELEPATHY (dodge your ally's
// blast) something to protect against.
export const ALL_ADJACENT = new Set(['earthquake', 'magnitude', 'bulldoze', 'surf', 'discharge',
	'lavaplume', 'sludgewave', 'boomburst', 'petalblizzard']);
export const SPREAD_MOVES = new Set(['earthquake', 'rockslide', 'surf', 'blizzard', 'heatwave',
	'muddywater', 'dazzlinggleam', 'hypervoice', 'boomburst', 'discharge', 'lavaplume',
	'sludgewave', 'eruption', 'waterspout', 'icywind', 'snarl', 'swift', 'razorleaf',
	'twister', 'acid', 'bubble', 'powdersnow', 'airslash',
	// these hit everything too and were missing, so in doubles they struck one target
	'bulldoze', 'electroweb', 'strugglebug', 'petalblizzard', 'precipiceblades',
	'originpulse', 'diamondstorm', 'landswrath', 'glaciallance', 'makeitrain', 'parabolicharge']);
// High crit ratio (1/8) and guaranteed crits. NEITHER existed: critChance was a
// flat 1/16 for every move in the game, so 532 species learning a high-crit move
// by level-up got nothing for it.
export const HIGH_CRIT = new Set(['slash', 'razorleaf', 'crabhammer', 'stoneedge', 'nightslash',
	'crosschop', 'leafblade', 'aircutter', 'psychocut', 'shadowclaw', 'attackorder',
	'drillrun', 'karatechop', 'aeroblast', 'blazekick', 'poisontail', 'spacialrend',
	'snipeshot', 'stoneaxe', 'skyattack', 'razorwind', 'crosspoison', 'aquacutter']);
export const ALWAYS_CRIT = new Set(['frostbreath', 'stormthrow', 'wickedblow', 'surgingstrikes', 'flowertrick']);
// moves that never miss: no accuracy / evasion roll at all (Minimize, Double Team
// and Sand Attack can't touch them). moves_battle.json writes their accuracy as a
// plain 100, so the "--" in the games' data is restored here. They still can't
// reach a target hidden by Fly / Dig / Dive (VANISH_REACH).
export const NEVER_MISS = new Set(['aerialace', 'aurasphere', 'clearsmog', 'disarmingvoice', 'falsesurrender', 'feintattack',
	'magicalleaf', 'magnetbomb', 'shadowpunch', 'shockwave', 'smartstrike', 'swift', 'trumpcard', 'vitalthrow', 'bide', 'struggle',
	'roar', 'whirlwind', 'meanlook', 'block', 'spiderweb', 'transform', 'foresight', 'odorsleuth', 'miracleeye', 'perishsong', 'psychup']);
// two-turn moves whose charge turn hides the user, and the moves that can still
// reach each hiding place
export const VANISH_MOVES = new Set(['fly', 'bounce', 'dig', 'dive', 'skydrop', 'phantomforce', 'shadowforce']);
export const VANISH_REACH = {
	fly: ['gust', 'twister', 'thunder', 'hurricane', 'skyuppercut', 'smackdown', 'thousandarrows'],
	bounce: ['gust', 'twister', 'thunder', 'hurricane', 'skyuppercut', 'smackdown', 'thousandarrows'],
	skydrop: ['gust', 'twister', 'thunder', 'hurricane', 'skyuppercut', 'smackdown', 'thousandarrows'],
	dig: ['earthquake', 'magnitude', 'fissure'],
	dive: ['surf', 'whirlpool'],
	phantomforce: [],
	shadowforce: [],
};
export const SLICING_MOVES = new Set(['aerialace', 'aircutter', 'airslash', 'behemothblade', 'bitterblade',
	'crosspoison', 'cut', 'furycutter', 'kowtowcleave', 'leafblade', 'nightslash', 'psychocut',
	'razorleaf', 'razorshell', 'sacredsword', 'secretsword', 'slash', 'solarblade', 'stoneaxe',
	'xscissor', 'ceaselessedge', 'populationbomb', 'aquacutter', 'psyblade']);
// wind moves — WIND RIDER is immune to them, WIND POWER charges off them
export const WIND_MOVES = new Set(['gust', 'hurricane', 'twister', 'tailwind', 'whirlwind', 'aircutter',
	'bleakwindstorm', 'wildboltstorm', 'sandsearstorm', 'springtidestorm', 'icywind', 'petalblizzard',
	'blizzard', 'fairywind', 'heatwave']);
// HIDDEN POWER type from IVs (gen 3): the low bit of each IV, in the order
// hp/atk/def/spe/spa/spd, weighted 1/2/4/8/16/32, scaled across the 16 types.
export const HP_TYPES = ['Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
	'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark'];
export function hiddenPowerType(mon) {
	const iv = mon.ivs || {};
	const bit = k => (iv[k] ?? 15) & 1;
	const n = bit('hp') + 2 * bit('atk') + 4 * bit('def') + 8 * bit('spe') + 16 * bit('spa') + 32 * bit('spd');
	return HP_TYPES[Math.floor(n * 15 / 63)] || 'Dark';
}
export const SOUND_MOVES = new Set(['growl', 'roar', 'sing', 'supersonic', 'screech', 'snore',
	'uproar', 'hypervoice', 'grasswhistle', 'metalsound', 'healbell', 'perishsong',
	'bugbuzz', 'chatter', 'round', 'echoedvoice', 'boomburst', 'disarmingvoice']);

// ---------- type chart (attacking type -> non-neutral matchups) ----------
export const CHART = {
	Normal:   { Rock: 0.5, Ghost: 0, Steel: 0.5 },
	Fire:     { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
	Water:    { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
	Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
	Grass:    { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
	Ice:      { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
	Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
	Poison:   { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
	Ground:   { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
	Flying:   { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
	Psychic:  { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
	Bug:      { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
	Rock:     { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
	Ghost:    { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
	Dragon:   { Dragon: 2, Steel: 0.5, Fairy: 0 },
	Dark:     { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
	Steel:    { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
	Fairy:    { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};
export function effectiveness(moveType, defTypes) {
	let m = 1;
	for (const t of defTypes) m *= CHART[moveType]?.[t] ?? 1;
	return m;
}

// stat-stage moves: single {stat,d} or multi {stats:{...}}; foe = aims at target
export const STAT_MOVES = {
	// foe debuffs
	growl: { stat: 'atk', d: -1, foe: true }, tailwhip: { stat: 'def', d: -1, foe: true },
	leer: { stat: 'def', d: -1, foe: true }, stringshot: { stat: 'spe', d: -1, foe: true },
	scaryface: { stat: 'spe', d: -2, foe: true }, charm: { stat: 'atk', d: -2, foe: true },
	cottonspore: { stat: 'spe', d: -2, foe: true }, screech: { stat: 'def', d: -2, foe: true },
	metalsound: { stat: 'spd', d: -2, foe: true }, faketears: { stat: 'spd', d: -2, foe: true },
	featherdance: { stat: 'atk', d: -2, foe: true }, captivate: { stat: 'spa', d: -2, foe: true },
	eerieimpulse: { stat: 'spa', d: -2, foe: true }, confide: { stat: 'spa', d: -1, foe: true },
	babydolleyes: { stat: 'atk', d: -1, foe: true }, playnice: { stat: 'atk', d: -1, foe: true },
	sweetscent: { stat: 'eva', d: -1, foe: true }, tarshot: { stat: 'spe', d: -1, foe: true },
	tickle: { stats: { atk: -1, def: -1 }, foe: true },
	tearfullook: { stats: { atk: -1, spa: -1 }, foe: true },
	sandattack: { stat: 'acc', d: -1, foe: true }, smokescreen: { stat: 'acc', d: -1, foe: true },
	flash: { stat: 'acc', d: -1, foe: true }, kinesis: { stat: 'acc', d: -1, foe: true },
	// self boosts
	growth: { stat: 'spa', d: 1 }, harden: { stat: 'def', d: 1 },
	defensecurl: { stat: 'def', d: 1 }, withdraw: { stat: 'def', d: 1 },
	howl: { stat: 'atk', d: 1 }, sharpen: { stat: 'atk', d: 1 }, meditate: { stat: 'atk', d: 1 },
	agility: { stat: 'spe', d: 2 }, rockpolish: { stat: 'spe', d: 2 }, autotomize: { stat: 'spe', d: 2 },
	swordsdance: { stat: 'atk', d: 2 }, irondefense: { stat: 'def', d: 2 },
	victorydance: { stats: { atk: 1, def: 1, spe: 1 } }, shelter: { stat: 'def', d: 2 },
	barrier: { stat: 'def', d: 2 }, acidarmor: { stat: 'def', d: 2 },
	cottonguard: { stat: 'def', d: 3 }, amnesia: { stat: 'spd', d: 2 },
	tailglow: { stat: 'spa', d: 2 }, nastyplot: { stat: 'spa', d: 2 },
	doubleteam: { stat: 'eva', d: 1 }, minimize: { stat: 'eva', d: 1 },
	honeclaws: { stats: { atk: 1, acc: 1 } }, workup: { stats: { atk: 1, spa: 1 } },
	bulkup: { stats: { atk: 1, def: 1 } }, calmmind: { stats: { spa: 1, spd: 1 } },
	dragondance: { stats: { atk: 1, spe: 1 } }, shiftgear: { stats: { atk: 1, spe: 2 } },
	cosmicpower: { stats: { def: 1, spd: 1 } }, defendorder: { stats: { def: 1, spd: 1 } },
	coil: { stats: { atk: 1, def: 1, acc: 1 } },
	quiverdance: { stats: { spa: 1, spd: 1, spe: 1 } },
	curse: { stats: { atk: 1, def: 1, spe: -1 } }, // non-Ghost Curse
	shellsmash: { stats: { atk: 2, spa: 2, spe: 2, def: -1, spd: -1 } },
};

export const freshBoosts = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });
// mid-battle HP-threshold form changes, keyed by ability (Batch 3). Stance
// Change (Aegislash) and Hunger Switch (Morpeko) are event-driven, handled inline.
export const FORM_RULES = {
	zenmode:        { base: 'darmanitan', alt: 'darmanitan_zen',    hp: 0.5,  when: 'below', msg: 'entered Zen Mode' },
	schooling:      { base: 'wishiwashi', alt: 'wishiwashi_school', hp: 0.25, when: 'above', minLevel: 20, msg: 'formed a School' },
	powerconstruct: { base: 'zygarde',    alt: 'zygarde_complete',  hp: 0.5,  when: 'below', oneWay: true, msg: 'assembled into Complete Forme' },
};

export const stageMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
