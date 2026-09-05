// battle.js — the battle core: Gen-3 style damage math, type chart, stat
// stages, wild AI, run mechanics, and the GBA-layout battle scene.
// Stat/moveset formulas ported from pokemonBuilder.lua (IVs random, EVs 0,
// no natures; moveset = last 4 level-up moves at the mon's level).
import { getJSON, getImage, VIEW_W, VIEW_H } from './engine.js';
import * as Bag from './bag.js';
import * as UI from './battleui.js';
import { cry, sfx } from './sound.js';
import { animScale, charsPerSec } from './settings.js';
import { expForLevel, levelForExp, MAX_LEVEL, CLASSIC_MAX_LEVEL } from './badges.js';

const STRUGGLE = () => ({ id: 'struggle', name: 'Struggle', pp: 1, maxPp: 1 });
// move-class lists that abilities key off
const PUNCH_MOVES = new Set(['firepunch', 'icepunch', 'thunderpunch', 'machpunch', 'megapunch',
	'cometpunch', 'dizzypunch', 'drainpunch', 'dynamicpunch', 'focuspunch', 'hammerarm',
	'megakick', 'poweruppunch', 'shadowpunch', 'skyuppercut', 'bulletpunch', 'meteormash', 'plasmafists']);
const BITE_MOVES = new Set(['bite', 'crunch', 'firefang', 'icefang', 'thunderfang', 'poisonfang',
	'hyperfang', 'superfang', 'psychicfangs', 'fishiousrend', 'jawlock']);
const PULSE_MOVES = new Set(['waterpulse', 'darkpulse', 'dragonpulse', 'aurasphere', 'healpulse', 'originpulse', 'terrainpulse']);
const BULLET_MOVES = new Set(['bulletseed', 'rockblast', 'iceball', 'octazooka', 'aurasphere',
	'barrage', 'eggbomb', 'electroball', 'energyball', 'focusblast', 'gyroball', 'mistball',
	'mudsport', 'seedbomb', 'shadowball', 'sludgebomb', 'weatherball', 'zapcannon', 'acidspray', 'pollenpuff']);
const POWDER_MOVES = new Set(['poisonpowder', 'sleeppowder', 'stunspore', 'spore', 'cottonspore', 'ragepowder', 'magicpowder', 'powder']);
// pure type-power boosters (x1.5 on that element)
const AB_TYPE_BOOST = { steelworker: 'Steel', dragonsmaw: 'Dragon', transistor: 'Electric', rockypayload: 'Rock' };
// -ate abilities: Normal moves convert and gain x1.2
const AB_ATE = { aerilate: 'Flying', pixilate: 'Fairy', refrigerate: 'Ice', galvanize: 'Electric' };
// full-immunity absorbers beyond the classics
const AB_ABSORB = {
	waterabsorb: { t: 'Water', heal: true }, dryskin: { t: 'Water', heal: true },
	voltabsorb: { t: 'Electric', heal: true }, eartheater: { t: 'Ground', heal: true },
	sapsipper: { t: 'Grass', boost: ['atk', 1] }, stormdrain: { t: 'Water', boost: ['spa', 1] },
	lightningrod: { t: 'Electric', boost: ['spa', 1] }, motordrive: { t: 'Electric', boost: ['spe', 1] },
	wellbakedbody: { t: 'Fire', boost: ['def', 2] },
};
// post-hit reactions on the defender (physical contact unless noted)
const AB_ONHIT = {
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
};
// moves that strike every opposing mon in a double battle
// the subset of spread moves that hit EVERYTHING adjacent — including the
// user's own partner. This is what finally gives TELEPATHY (dodge your ally's
// blast) something to protect against.
const ALL_ADJACENT = new Set(['earthquake', 'magnitude', 'bulldoze', 'surf', 'discharge',
	'lavaplume', 'sludgewave', 'boomburst', 'petalblizzard']);
const SPREAD_MOVES = new Set(['earthquake', 'rockslide', 'surf', 'blizzard', 'heatwave',
	'muddywater', 'dazzlinggleam', 'hypervoice', 'boomburst', 'discharge', 'lavaplume',
	'sludgewave', 'eruption', 'waterspout', 'icywind', 'snarl', 'swift', 'razorleaf',
	'twister', 'acid', 'bubble', 'powdersnow', 'airslash',
	// these hit everything too and were missing, so in doubles they struck one target
	'bulldoze', 'electroweb', 'strugglebug', 'petalblizzard', 'precipiceblades',
	'originpulse', 'diamondstorm', 'landswrath', 'glaciallance', 'makeitrain', 'parabolicharge']);
// High crit ratio (1/8) and guaranteed crits. NEITHER existed: critChance was a
// flat 1/16 for every move in the game, so 532 species learning a high-crit move
// by level-up got nothing for it.
const HIGH_CRIT = new Set(['slash', 'razorleaf', 'crabhammer', 'stoneedge', 'nightslash',
	'crosschop', 'leafblade', 'aircutter', 'psychocut', 'shadowclaw', 'attackorder',
	'drillrun', 'karatechop', 'aeroblast', 'blazekick', 'poisontail', 'spacialrend',
	'snipeshot', 'stoneaxe', 'skyattack', 'razorwind', 'crosspoison', 'aquacutter']);
const ALWAYS_CRIT = new Set(['frostbreath', 'stormthrow', 'wickedblow', 'surgingstrikes', 'flowertrick']);
// two-turn moves whose charge turn hides the user, and the moves that can still
// reach each hiding place
const VANISH_MOVES = new Set(['fly', 'bounce', 'dig', 'dive', 'skydrop', 'phantomforce', 'shadowforce']);
const VANISH_REACH = {
	fly: ['gust', 'twister', 'thunder', 'hurricane', 'skyuppercut', 'smackdown', 'thousandarrows'],
	bounce: ['gust', 'twister', 'thunder', 'hurricane', 'skyuppercut', 'smackdown', 'thousandarrows'],
	skydrop: ['gust', 'twister', 'thunder', 'hurricane', 'skyuppercut', 'smackdown', 'thousandarrows'],
	dig: ['earthquake', 'magnitude', 'fissure'],
	dive: ['surf', 'whirlpool'],
	phantomforce: [],
	shadowforce: [],
};
const SLICING_MOVES = new Set(['aerialace', 'aircutter', 'airslash', 'behemothblade', 'bitterblade',
	'crosspoison', 'cut', 'furycutter', 'kowtowcleave', 'leafblade', 'nightslash', 'psychocut',
	'razorleaf', 'razorshell', 'sacredsword', 'secretsword', 'slash', 'solarblade', 'stoneaxe',
	'xscissor', 'ceaselessedge', 'populationbomb', 'aquacutter', 'psyblade']);
// wind moves — WIND RIDER is immune to them, WIND POWER charges off them
const WIND_MOVES = new Set(['gust', 'hurricane', 'twister', 'tailwind', 'whirlwind', 'aircutter',
	'bleakwindstorm', 'wildboltstorm', 'sandsearstorm', 'springtidestorm', 'icywind', 'petalblizzard',
	'blizzard', 'fairywind', 'heatwave']);
// HIDDEN POWER type from IVs (gen 3): the low bit of each IV, in the order
// hp/atk/def/spe/spa/spd, weighted 1/2/4/8/16/32, scaled across the 16 types.
const HP_TYPES = ['Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
	'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark'];
function hiddenPowerType(mon) {
	const iv = mon.ivs || {};
	const bit = k => (iv[k] ?? 15) & 1;
	const n = bit('hp') + 2 * bit('atk') + 4 * bit('def') + 8 * bit('spe') + 16 * bit('spa') + 32 * bit('spd');
	return HP_TYPES[Math.floor(n * 15 / 63)] || 'Dark';
}
const SOUND_MOVES = new Set(['growl', 'roar', 'sing', 'supersonic', 'screech', 'snore',
	'uproar', 'hypervoice', 'grasswhistle', 'metalsound', 'healbell', 'perishsong',
	'bugbuzz', 'chatter', 'round', 'echoedvoice', 'boomburst', 'disarmingvoice']);

// ---------- type chart (attacking type -> non-neutral matchups) ----------
const CHART = {
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
function effectiveness(moveType, defTypes) {
	let m = 1;
	for (const t of defTypes) m *= CHART[moveType]?.[t] ?? 1;
	return m;
}

// stat-stage moves: single {stat,d} or multi {stats:{...}}; foe = aims at target
const STAT_MOVES = {
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

const freshBoosts = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });
// mid-battle HP-threshold form changes, keyed by ability (Batch 3). Stance
// Change (Aegislash) and Hunger Switch (Morpeko) are event-driven, handled inline.
const FORM_RULES = {
	zenmode:        { base: 'darmanitan', alt: 'darmanitan_zen',    hp: 0.5,  when: 'below', msg: 'entered Zen Mode' },
	schooling:      { base: 'wishiwashi', alt: 'wishiwashi_school', hp: 0.25, when: 'above', minLevel: 20, msg: 'formed a School' },
	powerconstruct: { base: 'zygarde',    alt: 'zygarde_complete',  hp: 0.5,  when: 'below', oneWay: true, msg: 'assembled into Complete Forme' },
};

const stageMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);

// ---------- move effects (statuses, secondaries, heal/drain/recoil/multi-hit) ----------
// status ids: brn, psn, par, slp, frz
const MOVE_FX = {
	// pure status infliction
	thunderwave: { status: 'par' }, stunspore: { status: 'par' }, glare: { status: 'par' },
	sleeppowder: { status: 'slp' }, spore: { status: 'slp' }, hypnosis: { status: 'slp' },
	sing: { status: 'slp' }, lovelykiss: { status: 'slp' }, grasswhistle: { status: 'slp' }, darkvoid: { status: 'slp' },
	poisonpowder: { status: 'psn' }, poisongas: { status: 'psn' },
	toxic: { status: 'psn', bad: true },
	willowisp: { status: 'brn' },
	// confusion, seeding, and side screens
	confuseray: { confuse: true }, supersonic: { confuse: true }, sweetkiss: { confuse: true },
	teeterdance: { confuse: true }, attract: { attract: true },
	confusion: { sec: { confuse: true, ch: 10 } }, psybeam: { sec: { confuse: true, ch: 10 } },
	dizzypunch: { sec: { confuse: true, ch: 20 } }, waterpulse: { sec: { confuse: true, ch: 20 } },
	dynamicpunch: { sec: { confuse: true, ch: 100 } }, signalbeam: { sec: { confuse: true, ch: 10 } },
	hurricane: { sec: { confuse: true, ch: 30 } },
	leechseed: { seed: true },
	reflect: { screen: 'reflect' }, lightscreen: { screen: 'light' }, auroraveil: { screen: 'both' },
	// secondary status/flinch chances on damaging moves
	ember: { sec: { status: 'brn', ch: 10 } }, flamethrower: { sec: { status: 'brn', ch: 10 } },
	fireblast: { sec: { status: 'brn', ch: 30 } }, firepunch: { sec: { status: 'brn', ch: 10 } },
	flamewheel: { sec: { status: 'brn', ch: 10 } }, heatwave: { sec: { status: 'brn', ch: 10 } },
	thundershock: { sec: { status: 'par', ch: 10 } }, thunderbolt: { sec: { status: 'par', ch: 10 } },
	thunder: { sec: { status: 'par', ch: 30 } }, thunderpunch: { sec: { status: 'par', ch: 10 } },
	spark: { sec: { status: 'par', ch: 30 } }, bodyslam: { sec: { status: 'par', ch: 30 } },
	lick: { sec: { status: 'par', ch: 30 } }, dragonbreath: { sec: { status: 'par', ch: 30 } },
	icebeam: { sec: { status: 'frz', ch: 10 } }, blizzard: { sec: { status: 'frz', ch: 10 } },
	icepunch: { sec: { status: 'frz', ch: 10 } }, powdersnow: { sec: { status: 'frz', ch: 10 } },
	poisonsting: { sec: { status: 'psn', ch: 30 } }, sludge: { sec: { status: 'psn', ch: 30 } },
	sludgebomb: { sec: { status: 'psn', ch: 30 } }, smog: { sec: { status: 'psn', ch: 40 } },
	poisonjab: { sec: { status: 'psn', ch: 30 } }, crosspoison: { sec: { status: 'psn', ch: 10 } },
	fakeout: { sec: { flinch: true, ch: 100 }, firstTurn: true },
	bite: { sec: { flinch: true, ch: 30 } }, headbutt: { sec: { flinch: true, ch: 30 } },
	rockslide: { sec: { flinch: true, ch: 30 } }, airslash: { sec: { flinch: true, ch: 30 } },
	ironhead: { sec: { flinch: true, ch: 30 } }, astonish: { sec: { flinch: true, ch: 30 } },
	zenheadbutt: { sec: { flinch: true, ch: 20 } }, darkpulse: { sec: { flinch: true, ch: 20 } },
	extrasensory: { sec: { flinch: true, ch: 10 } }, wingattack: {},
	// healing
	recover: { heal: 0.5 }, softboiled: { heal: 0.5 }, milkdrink: { heal: 0.5 },
	slackoff: { heal: 0.5 }, roost: { heal: 0.5 }, synthesis: { heal: 0.5 },
	morningsun: { heal: 0.5 }, moonlight: { heal: 0.5 }, shoreup: { heal: 0.5 },
	rest: { heal: 1, selfStatus: 'slp' },
	// drain / recoil / multi-hit
	absorb: { drain: 0.5 }, megadrain: { drain: 0.5 }, gigadrain: { drain: 0.5 },
	leechlife: { drain: 0.5 }, drainpunch: { drain: 0.5 }, dreameater: { drain: 0.5 },
	hornleech: { drain: 0.5 }, drainingkiss: { drain: 0.75 },
	doubleedge: { recoil: 1 / 3 }, takedown: { recoil: 0.25 }, submission: { recoil: 0.25 },
	flareblitz: { recoil: 1 / 3 }, bravebird: { recoil: 1 / 3 }, wildcharge: { recoil: 0.25 },
	headsmash: { recoil: 0.5 }, struggle: { recoil: 0.25 },
	doubleslap: { hits: [2, 5] }, furyattack: { hits: [2, 5] }, pinmissile: { hits: [2, 5] },
	furyswipes: { hits: [2, 5] }, spikecannon: { hits: [2, 5] }, barrage: { hits: [2, 5] },
	cometpunch: { hits: [2, 5] }, bulletseed: { hits: [2, 5] }, rockblast: { hits: [2, 5] },
	iciclespear: { hits: [2, 5] }, doublekick: { hits: [2, 2] }, bonemerang: { hits: [2, 2] },
	dualchop: { hits: [2, 2] }, doublehit: { hits: [2, 2] },
	// secondary stat drops on damaging moves
	acid: { sec: { stat: 'spd', d: -1, ch: 10 } }, psychic: { sec: { stat: 'spd', d: -1, ch: 10 } },
	shadowball: { sec: { stat: 'spd', d: -1, ch: 20 } }, crunch: { sec: { stat: 'def', d: -1, ch: 20 } },
	aurorabeam: { sec: { stat: 'atk', d: -1, ch: 10 } }, bubblebeam: { sec: { stat: 'spe', d: -1, ch: 10 } },
	bubble: { sec: { stat: 'spe', d: -1, ch: 10 } }, constrict: { sec: { stat: 'spe', d: -1, ch: 10 } },
	icywind: { sec: { stat: 'spe', d: -1, ch: 100 } }, mudslap: { sec: { stat: 'acc', d: -1, ch: 100 } },
	mudshot: { sec: { stat: 'spe', d: -1, ch: 100 } }, muddywater: { sec: { stat: 'acc', d: -1, ch: 30 } },
	rocktomb: { sec: { stat: 'spe', d: -1, ch: 100 } }, lowsweep: { sec: { stat: 'spe', d: -1, ch: 100 } },
	bulldoze: { sec: { stat: 'spe', d: -1, ch: 100 } }, snarl: { sec: { stat: 'spa', d: -1, ch: 100 } },
	moonblast: { sec: { stat: 'spa', d: -1, ch: 30 } }, energyball: { sec: { stat: 'spd', d: -1, ch: 10 } },
	focusblast: { sec: { stat: 'spd', d: -1, ch: 10 } }, flashcannon: { sec: { stat: 'spd', d: -1, ch: 10 } },
	earthpower: { sec: { stat: 'spd', d: -1, ch: 10 } }, irontail: { sec: { stat: 'def', d: -1, ch: 30 } },
	poisonfang: { sec: { status: 'psn', bad: true, ch: 50 } },
	// self stat costs after the hit lands
	overheat: { selfDrop: { spa: -2 } }, dracometeor: { selfDrop: { spa: -2 } },
	leafstorm: { selfDrop: { spa: -2 } }, psychoboost: { selfDrop: { spa: -2 } },
	closecombat: { selfDrop: { def: -1, spd: -1 } }, superpower: { selfDrop: { atk: -1, def: -1 } },
	hammerarm: { selfDrop: { spe: -1 } },
	// ---- Upscale 5 Batch 2: canonical mechanics restored to damaging moves that
	// were doing plain damage only (all confirmed absent + present in the data). ----
	// burn secondaries
	scald: { sec: { status: 'brn', ch: 30 } }, sacredfire: { sec: { status: 'brn', ch: 50 } },
	blueflare: { sec: { status: 'brn', ch: 20 } }, pyroball: { sec: { status: 'brn', ch: 10 } },
	steameruption: { sec: { status: 'brn', ch: 30 } }, scorchingsands: { sec: { status: 'brn', ch: 30 } },
	inferno: { sec: { status: 'brn', ch: 100 } }, searingshot: { sec: { status: 'brn', ch: 30 } },
	// flinch secondaries
	waterfall: { sec: { flinch: true, ch: 20 } }, iciclecrash: { sec: { flinch: true, ch: 30 } },
	steamroller: { sec: { flinch: true, ch: 30 } }, boneclub: { sec: { flinch: true, ch: 10 } },
	heartstamp: { sec: { flinch: true, ch: 30 } }, needlearm: { sec: { flinch: true, ch: 30 } },
	dragonrush: { sec: { flinch: true, ch: 20 } }, stomp: { sec: { flinch: true, ch: 30 } },
	// para / poison / accuracy-drop / confuse secondaries
	nuzzle: { sec: { status: 'par', ch: 100 } }, boltstrike: { sec: { status: 'par', ch: 20 } },
	forcepalm: { sec: { status: 'par', ch: 30 } }, gunkshot: { sec: { status: 'psn', ch: 30 } },
	barbbarrage: { sec: { status: 'psn', ch: 50 } }, direclaw: { sec: { status: 'psn', ch: 50 } }, // direclaw picks psn/par/slp; psn-only approximation
	nightdaze: { sec: { stat: 'acc', d: -1, ch: 40 } }, mudbomb: { sec: { stat: 'acc', d: -1, ch: 30 } },
	mirrorshot: { sec: { stat: 'acc', d: -1, ch: 30 } }, leaftornado: { sec: { stat: 'acc', d: -1, ch: 50 } },
	axekick: { sec: { confuse: true, ch: 30 } }, rockclimb: { sec: { confuse: true, ch: 20 } }, // crash-on-miss deferred
	// self-boost after a damaging hit
	flamecharge: { postBoost: { spe: 1 } }, trailblaze: { postBoost: { spe: 1 } },
	poweruppunch: { postBoost: { atk: 1 } }, torchsong: { postBoost: { spa: 1 } },
	chargebeam: { postBoost: { spa: 1 }, postBoostCh: 70 }, fierydance: { postBoost: { spa: 1 }, postBoostCh: 50 },
	meteormash: { postBoost: { atk: 1 }, postBoostCh: 20 },
	// multi-hit (were hitting once)
	bonerush: { hits: [2, 5] }, tailslap: { hits: [2, 5] }, watershuriken: { hits: [2, 5] }, armthrust: { hits: [2, 5] },
	dragondarts: { hits: [2, 2] }, geargrind: { hits: [2, 2] }, dualwingbeat: { hits: [2, 2] },
	twineedle: { hits: [2, 2], sec: { status: 'psn', ch: 20 } }, doubleironbash: { hits: [2, 2], sec: { flinch: true, ch: 30 } },
	tripleaxel: { hits: [3, 3] }, triplekick: { hits: [3, 3] }, tripledive: { hits: [3, 3] }, // flat ×3 (ramping power not modeled)
	scaleshot: { hits: [5, 5], postBoost: { spe: 1 }, selfDrop: { def: -1 } },
	// recoil (were pure upside)
	woodhammer: { recoil: 1 / 3 }, wavecrash: { recoil: 1 / 3 }, headcharge: { recoil: 0.25 },
	volttackle: { recoil: 1 / 3, sec: { status: 'par', ch: 10 } }, lightofruin: { recoil: 0.5 },
	chloroblast: { recoil: 0.5 }, steelbeam: { recoil: 0.5 }, mindblown: { recoil: 0.5 }, // steelbeam/mindblown: damage-based ≈ (real: half max HP)
	// recharge (were pure upside)
	roaroftime: { recharge: true }, rockwrecker: { recharge: true }, prismaticlaser: { recharge: true },
	eternabeam: { recharge: true }, meteorassault: { recharge: true },
	// PIVOT: deal damage, then the user switches out (U-turn is on 228 species and
	// just dealt damage before). Reuses the mid-turn a.me/a.foe swap Baton Pass
	// proves safe; no boosts pass. Auto-picks the next healthy benchmon (matching
	// Baton Pass's convention — no mid-move switch-choice UI).
	uturn: { pivot: true }, voltswitch: { pivot: true }, flipturn: { pivot: true },
	// fixed damage + OHKO
	seismictoss: { fixed: 'level' }, nightshade: { fixed: 'level' },
	dragonrage: { fixed: 40 }, sonicboom: { fixed: 20 }, psywave: { fixed: 'psywave' },
	superfang: { fixed: 'half' }, endeavor: { fixed: 'endeavor' },
	naturesmadness: { fixed: 'half' }, ruination: { fixed: 'half' },
	finalgambit: { fixed: 'userHP', sacrifice: true },
	// retaliation: pay back the last hit taken (category-gated, else it fails)
	counter: { fixed: 'counter' }, mirrorcoat: { fixed: 'mirrorcoat' },
	metalburst: { fixed: 'metalburst' }, comeuppance: { fixed: 'metalburst' },
	bide: { chargeText: 'is storing energy!', fixed: 'bide' },
	fissure: { ohko: true }, guillotine: { ohko: true }, horndrill: { ohko: true }, sheercold: { ohko: true },
	// two-turn charge / recharge / self-KO
	fly: { chargeText: 'flew up high!' }, dig: { chargeText: 'burrowed underground!' },
	dive: { chargeText: 'hid underwater!' }, bounce: { chargeText: 'sprang up!' },
	solarbeam: { chargeText: 'absorbed light!' }, skyattack: { chargeText: 'became cloaked in a harsh light!' },
	razorwind: { chargeText: 'whipped up a whirlwind!' }, skullbash: { chargeText: 'lowered its head!' },
	// These SEVEN had power in the table and no entry here, so they resolved in a
	// single turn at full strength — SHADOW FORCE was a 120-BP one-turn Ghost move.
	phantomforce: { chargeText: 'vanished instantly!', vanish: true, breaksProtect: true },
	shadowforce: { chargeText: 'vanished instantly!', vanish: true, breaksProtect: true },
	skydrop: { chargeText: 'took its target into the sky!', vanish: true },
	meteorbeam: { chargeText: 'is overflowing with space power!', selfBoost: { spa: 1 } },
	electroshot: { chargeText: 'absorbed electricity!', selfBoost: { spa: 1 } },
	freezeshock: { chargeText: 'became cloaked in freezing air!' },
	iceburn: { chargeText: 'became cloaked in freezing air!' },
	// nothing in the game broke Protect before this
	feint: { breaksProtect: true }, hyperspacefury: { breaksProtect: true },
	hyperspacehole: { breaksProtect: true },
	// LOCK-IN: rampage for 2-3 turns, then reel from confusion. Without the
	// drawback these were strictly-better 120-BP moves with no cost at all.
	thrash: { lockIn: true }, outrage: { lockIn: true }, petaldance: { lockIn: true },
	ragingfury: { lockIn: true },
	// UPROAR locks in the same way but keeps everything awake instead
	uproar: { lockIn: true, noSleep: true },
	// FUTURE SIGHT / DOOM DESIRE landed instantly for 120/140. They are supposed to
	// arrive two turns later, which is the entire point of using one.
	futuresight: { delayed: 2 }, doomdesire: { delayed: 2 },
	hyperbeam: { recharge: true }, gigaimpact: { recharge: true }, blastburn: { recharge: true },
	hydrocannon: { recharge: true }, frenzyplant: { recharge: true },
	selfdestruct: { selfKO: true }, explosion: { selfKO: true },
	// partial trapping
	wrap: { trap: 'Wrap' }, bind: { trap: 'Bind' }, firespin: { trap: 'Fire Spin' },
	whirlpool: { trap: 'Whirlpool' }, clamp: { trap: 'Clamp' }, sandtomb: { trap: 'Sand Tomb' },
	// utility status moves
	protect: { protect: true }, detect: { protect: true },
	yawn: { yawn: true }, haze: { haze: true },
	roar: { blow: true }, whirlwind: { blow: true },
	healbell: { cureParty: true }, aromatherapy: { cureParty: true }, refresh: { cureSelf: true },
	aquaring: { regen: true }, ingrain: { regen: true },
	bellydrum: { bellydrum: true }, painsplit: { painsplit: true },
	swagger: { confuse: true, foeBoost: { atk: 2 } }, flatter: { confuse: true, foeBoost: { spa: 1 } },
	// formerly dead status moves (plan batch E)
	toxicthread: { status: 'psn', foeBoost: { spe: -1 } },
	corrosivegas: { corrode: true },
	chillyreception: { weather: 'hail' }, // the self-switch half is not modeled
	powershift: { ownSwap: ['atk', 'def'] },
	// weather + terrain + field effects
	raindance: { weather: 'rain' }, sunnyday: { weather: 'sun' }, sandstorm: { weather: 'sand' },
	hail: { weather: 'hail' }, snowscape: { weather: 'hail' }, thunderstorm: { weather: 'rain' },
	electricterrain: { terrain: 'electric' }, grassyterrain: { terrain: 'grassy' },
	mistyterrain: { terrain: 'misty' }, psychicterrain: { terrain: 'psychic' }, stickyterrain: { terrain: 'grassy' },
	trickroom: { field: 'trickRoom' }, gravity: { field: 'gravity' },
	tailwind: { side: 'tailwind', turns: 4 }, safeguard: { side: 'safeguard', turns: 5 },
	mist: { side: 'mist', turns: 5 }, luckychant: { side: 'luckychant', turns: 5 },
	mudsport: { field: 'mudSport' }, watersport: { field: 'waterSport' },
	// protect variants + endure
	kingsshield: { protect: true }, obstruct: { protect: true }, silktrap: { protect: true },
	spikyshield: { protect: true }, banefulbunker: { protect: true }, burningbulwark: { protect: true },
	matblock: { protect: true }, craftyshield: { protect: true },
	// REAL side guards now, not personal-Protect aliases: QUICK GUARD walls the
	// whole side against priority moves, WIDE GUARD against spread moves
	quickguard: { sideGuard: 'quick' }, wideguard: { sideGuard: 'wide' }, endure: { endure: true },
	// entry hazards
	spikes: { hazard: 'spikes' }, toxicspikes: { hazard: 'toxicspikes' },
	stealthrock: { hazard: 'stealthrock' }, stickyweb: { hazard: 'stickyweb' },
	defog: { clearHazards: 'both', foeBoost2: { eva: -1 } }, tidyup: { clearHazards: 'both', selfBoost: { atk: 1, spe: 1 } },
	courtchange: { swapHazards: true },
	// switching tricks + sacrifices
	batonpass: { batonPass: true }, shedtail: { batonPass: true },
	partingshot: { partingShot: true }, teleport: { fleeSelf: true },
	memento: { memento: true }, healingwish: { healingWish: true }, lunardance: { healingWish: true },
	revivalblessing: { revive: true },
	// restriction
	disable: { restrict: 'disable' }, encore: { restrict: 'encore' }, taunt: { restrict: 'taunt' },
	torment: { restrict: 'torment' },
	meanlook: { noSwitch: true }, block: { noSwitch: true }, spiderweb: { noSwitch: true },
	octolock: { noSwitch: true }, fairylock: { noSwitch: true },
	magnetrise: { magnetRise: true }, telekinesis: { telekinesis: true },
	// call another move
	metronome: { call: 'metronome' }, copycat: { call: 'copycat' }, mirrormove: { call: 'mirror' },
	assist: { call: 'assist' }, sleeptalk: { call: 'sleeptalk' }, naturepower: { call: 'nature' },
	mimic: { mimic: true }, sketch: { mimic: true },
	// boosts with costs / special boosts
	clangoroussoul: { boostCost: { stats: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, frac: 1 / 3 } },
	filletaway: { boostCost: { stats: { atk: 2, spa: 2, spe: 2 }, frac: 0.5 } },
	noretreat: { selfBoost: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } },
	geomancy: { chargeText: 'is absorbing power!', selfBoost: { spa: 2, spd: 2, spe: 2 }, statusCharge: true },
	takeheart: { selfBoost: { spa: 1, spd: 1 }, cureSelfToo: true },
	stuffcheeks: { selfBoost: { def: 2 } }, acupressure: { acupressure: true },
	nobleroar: { foeBoost2: { atk: -1, spa: -1 } },
	venomdrench: { foeBoost2: { atk: -1, spa: -1, spe: -1 }, needsPoisoned: true },
	spicyextract: { foeBoost2: { atk: 2, def: -2 } },
	focusenergy: { focusEnergy: true }, laserfocus: { laserFocus: true },
	lockon: { lockOn: true }, mindreader: { lockOn: true },
	foresight: { foresight: true }, odorsleuth: { foresight: true }, miracleeye: { foresight: true },
	// healing extras
	lifedew: { heal: 0.5 }, healorder: { heal: 0.5 }, junglehealing: { heal: 0.25, cureSelfToo: true },
	lunarblessing: { heal: 0.25, cureSelfToo: true },
	floralhealing: { healTarget: 0.5 }, healpulse: { healTarget: 0.5 },
	wish: { wish: true }, strengthsap: { strengthSap: true },
	purify: { purify: true }, psychoshift: { psychoShift: true },
	nightmare: { nightmare: true }, perishsong: { perishSong: true }, destinybond: { destinyBond: true },
	spite: { spite: true },
	// stat swapping / copying
	psychup: { psychUp: true }, heartswap: { swapBoosts: 'all' },
	guardswap: { swapBoosts: 'guard' }, powerswap: { swapBoosts: 'power' },
	speedswap: { statSwap: ['spe'] }, guardsplit: { statAvg: ['def', 'spd'] },
	powersplit: { statAvg: ['atk', 'spa'] }, powertrick: { ownSwap: ['atk', 'def'] },
	topsyturvy: { invertBoosts: true },
	// self / target transformation
	transform: { transform: true }, substitute: { substitute: true },
	conversion: { typeSelf: 'firstmove' }, conversion2: { typeSelf: 'random' },
	camouflage: { typeSelf: 'Normal' }, reflecttype: { typeSelf: 'copy' },
	soak: { typeTarget: ['Water'] }, magicpowder: { typeTarget: ['Psychic'] },
	trickortreat: { addType: 'Ghost' }, forestscurse: { addType: 'Grass' },
	stockpile: { stockpile: true }, spitup: { spitUp: true }, swallow: { swallow: true },
	charge: { chargeUp: true }, splash: { splashMsg: true },
	// This block used to be gated on "no held items / no allies in this game" —
	// BOTH premises are now false: doubles ship and held items ship. The
	// ally-support family below is implemented, EMBARGO and MAGIC ROOM ride the
	// central itemFx gate, WONDER ROOM rides the damage formula's defense pick.
	// What still says noop needs machinery this engine genuinely lacks: move
	// interception (snatch/magiccoat/powder), action re-ordering mid-turn
	// (afteryou/quash/instruct/mefirst), or berry-forcing (teatime).
	// electrify/iondeluge ride the useMove type-rewrite chain now, and
	// healblock gates the heal/drain paths.
	allyswitch: { allySwitch: true }, aromaticmist: { allyBoost: { spd: 1 } },
	helpinghand: { helpingHand: true }, followme: { centerTaunt: true },
	ragepowder: { centerTaunt: true }, spotlight: { centerTaunt: true },
	decorate: { allyBoost: { atk: 2, spa: 2 } }, gearup: { allyBoost: { atk: 1, spa: 1 } },
	magneticflux: { allyBoost: { def: 1, spd: 1 } }, flowershield: { allyBoost: { def: 1 } },
	rototiller: { allyBoost: { atk: 1, spa: 1 } },
	afteryou: { noop: true }, embargo: { embargo: true },
	bestow: { itemGive: true },
	instruct: { noop: true }, mefirst: { noop: true },
	quash: { noop: true }, recycle: { recycle: true },
	snatch: { noop: true }, switcheroo: { itemSwap: true },
	magiccoat: { noop: true }, powder: { noop: true },
	trick: { itemSwap: true }, knockoff: { knockOff: true },
	thief: { steal: true }, covet: { steal: true },
	// the party tricks are canon-cosmetic, so a festive line IS the faithful
	// model — except HAPPY HOUR, whose payout doubling is real (prizeMoney)
	celebrate: { festMsg: 'Congratulations!' }, holdhands: { festMsg: 'They held hands. How heartwarming!' },
	happyhour: { happyHour: true },
	// doubles support, unlocked by the side-mechanics work
	coaching: { allyBoost: { atk: 1, def: 1 } }, dragoncheer: { allyCrit: true },
	healblock: { healBlock: true }, imprison: { imprison: true }, grudge: { grudgeSelf: true },
	teatime: { teatime: true },
	electrify: { electrifyTarget: true }, iondeluge: { ionDeluge: true },
	magicroom: { field: 'magicRoom' }, wonderroom: { field: 'wonderRoom' },
	doodle: { abilityCopy: true }, roleplay: { abilityCopy: true },
	skillswap: { abilitySwap: true }, entrainment: { abilityGive: true },
	gastroacid: { abilitySuppress: true }, worryseed: { abilitySet: 'insomnia' },
	simplebeam: { abilitySet: 'simple' },
};

// ---------- move-animation archetypes ----------
// Every attack used to play the same lunge-plus-sparks. Moves now classify
// into archetypes: a BEAM pours across the field, a SHOT lobs and bursts, a
// SLASH rakes the target, other specials flash a BURST, and physical contact
// keeps the classic lunge (STRIKE). Status moves glow on the caster (BOOST /
// HEAL) or wash over the victim (DEBUFF). Classification is by id heuristic
// on purpose: ~900 moves, eight buckets, no hand table to rot.
const ANIM_BEAM = /beam|cannon|pulse|laser|flamethrower|hydropump|dragonbreath|thunderbolt|discharge|overheat|ray$/;
const ANIM_SLASH = /slash|razor|claw|blade|edge|scissor|scratch|fang|bite|crunch|chop|cut$|horn/;
const ANIM_SHOT = /ball$|bomb|sphere|shot$|seed|egg|missile|shuriken|dart|barrage|sludge|gunk|spit|web|blast|rockthrow|rockslide|mudslap/;
const targetSideOf = isFoe => (isFoe ? 'me' : 'foe');
function animArchFor(move, mv) {
	const id = move.id || '';
	if (ANIM_BEAM.test(id)) return 'beam';
	if (ANIM_SLASH.test(id)) return 'slash';
	if (ANIM_SHOT.test(id)) return 'shot';
	return mv.category === 'Special' ? 'burst' : 'strike';
}

// Per-terrain battle STAGE look (Batch A): sky = 3 gradient stops, ground = the
// lower band, plat = the platform disc under each mon. main.js battleStageNow()
// picks the terrain; night darkens it. Replaces the one flat sky for every fight.
const STAGE_PALETTES = {
	grass:  { sky: ['#7db8e0', '#bfe0bf', '#6aa05f'], ground: '#4e7a44', plat: 'rgba(40,70,50,0.85)' },
	forest: { sky: ['#5f8f7a', '#77a56f', '#3f6a3a'], ground: '#365f30', plat: 'rgba(28,52,32,0.88)' },
	cave:   { sky: ['#2a2636', '#39344a', '#211c2c'], ground: '#2b2436', plat: 'rgba(58,52,70,0.85)' },
	water:  { sky: ['#6fb0e0', '#8fcae8', '#3f7fb8'], ground: '#3a78b0', plat: 'rgba(40,92,132,0.72)' },
	sand:   { sky: ['#e6c98a', '#ecdca0', '#c9a25f'], ground: '#c4a05a', plat: 'rgba(150,120,70,0.85)' },
	city:   { sky: ['#9fb4c8', '#c0ccd6', '#8a8f98'], ground: '#7a7f88', plat: 'rgba(78,82,90,0.85)' },
	indoor: { sky: ['#8a7f9a', '#9c92ac', '#645a74'], ground: '#6a5f7a', plat: 'rgba(70,62,84,0.85)' },
};
const stagePalette = stage => STAGE_PALETTES[stage?.terrain] || STAGE_PALETTES.grass;

// moves whose power is computed from battle state; (battle, user, target,
// userBoosts, targetBoosts) => power. Falls back to data power when absent.
const hpScale = (u) => Math.max(1, Math.floor(150 * u.curHP / u.maxHP));
const pinchPower = (u) => {
	const x = Math.floor(u.curHP * 48 / u.maxHP);
	return x < 2 ? 200 : x < 5 ? 150 : x < 10 ? 100 : x < 17 ? 80 : x < 33 ? 40 : 20;
};
const posBoosts = (boosts) => Object.values(boosts).reduce((s, v) => s + Math.max(0, v || 0), 0);
const POWER_FX = {
	gyroball: (b, u, t, ub, tb) => Math.min(150, Math.floor(25 * b.statOf(t, tb, 'spe') / Math.max(1, b.statOf(u, ub, 'spe'))) + 1),
	electroball: (b, u, t, ub, tb) => {
		const r = b.statOf(u, ub, 'spe') / Math.max(1, b.statOf(t, tb, 'spe'));
		return r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40;
	},
	flail: (b, u) => pinchPower(u), reversal: (b, u) => pinchPower(u),
	eruption: (b, u) => hpScale(u), waterspout: (b, u) => hpScale(u), dragonenergy: (b, u) => hpScale(u),
	hex: (b, u, t) => t.status ? 130 : 65,
	facade: (b, u) => u.status ? 140 : 70,
	brine: (b, u, t) => t.curHP <= t.maxHP / 2 ? 130 : 65,
	storedpower: (b, u, t, ub) => 20 + 20 * posBoosts(ub),
	powertrip: (b, u, t, ub) => 20 + 20 * posBoosts(ub),
	punishment: (b, u, t, ub, tb) => Math.min(200, 60 + 20 * posBoosts(tb)),
	acrobatics: (b, u) => u.heldItem ? 55 : 110,
	knockoff: (b, u, t) => t.heldItem ? 97 : 65,
	smellingsalts: (b, u, t) => t.status === 'par' ? 140 : 70,
	wakeupslap: (b, u, t) => t.status === 'slp' ? 140 : 70,
	// The same conditional-doubler family as the four above, just never listed —
	// 321 species learn one of these by level-up and got a flat base power.
	// (stompingtantrum and retaliate are deliberately NOT here: they need
	// move-failure and ally-faint bookkeeping this engine doesn't record, and a
	// half-wired condition that never fires is the exact bug being swept up.)
	venoshock: (b, u, t) => (t.status === 'psn' || t.status === 'tox') ? 130 : 65,
	revenge: (b, u, t) => u.lastTaken?.turn === b.active?.turnCount ? 120 : 60,
	avalanche: (b, u, t) => u.lastTaken?.turn === b.active?.turnCount ? 120 : 60,
	payback: (b, u, t) => t.movedThisTurn ? 100 : 50,
	assurance: (b, u, t) => t.tookDamageThisTurn ? 120 : 60,
	// Last Resort is the reverse problem: it fired at 140 with none of its
	// "every other move used first" restriction. 0 power => the move fails.
	// RAMPING moves double every consecutive turn they connect. Without the ramp
	// Rollout and Fury Cutter were permanently 30/40-BP moves that never paid off
	// — 214 species learn one by level-up.
	rollout: (b, u) => 30 * Math.pow(2, Math.min(4, u.rampN || 0)) * (u.defenseCurl ? 2 : 1),
	iceball: (b, u) => 30 * Math.pow(2, Math.min(4, u.rampN || 0)) * (u.defenseCurl ? 2 : 1),
	furycutter: (b, u) => 40 * Math.pow(2, Math.min(3, u.rampN || 0)),
	lastresort: (b, u, t, ub, tb, mv) => {
		const others = (u.moves || []).filter(m => m.id !== mv?.id);
		return others.length && others.every(m => (u.usedMoves || []).includes(m.id)) ? 140 : 0;
	},
	// friendship-scaled, not flat: max 102 at 255 friendship (foes sit at the
	// wild-caught default of 70, i.e. 28 power — exactly as on cartridge)
	return: (b, u) => Math.max(1, Math.floor(((u.friend ?? 70) * 10) / 25)),
	frustration: (b, u) => Math.max(1, Math.floor(((255 - (u.friend ?? 70)) * 10) / 25)),
	veeveevolley: (b, u) => Math.max(1, Math.floor(((u.friend ?? 70) * 10) / 25)),
	pikapapow: (b, u) => Math.max(1, Math.floor(((u.friend ?? 70) * 10) / 25)),
	// scale with the TARGET's remaining HP (opposite of Flail)
	wringout: (b, u, t) => Math.max(1, Math.floor(120 * t.curHP / t.maxHP)),
	crushgrip: (b, u, t) => Math.max(1, Math.floor(120 * t.curHP / t.maxHP)),
	hardpress: (b, u, t) => Math.max(1, Math.floor(100 * t.curHP / t.maxHP)),
	// pp is already decremented for this use: 0 left => the 200-power last card
	trumpcard: (b, u, t, ub, tb, mv) => [200, 80, 60, 50][mv?.pp] ?? 40,
	magnitude: (b) => {
		const r = Math.random() * 100;
		const [m, p] = r < 5 ? [4, 10] : r < 15 ? [5, 30] : r < 35 ? [6, 50] : r < 65 ? [7, 70]
			: r < 85 ? [8, 90] : r < 95 ? [9, 110] : [10, 150];
		b.pushMsg(`Magnitude ${m}!`);
		return p;
	},
	// one combined hit standing in for the per-ally flurry
	beatup: (b, u) => b.partyOf(u).filter(m => m.curHP > 0 && !m.status)
		.reduce((s, m) => s + 5 + Math.floor((b.data.species[m.speciesId]?.baseStats?.atk || 50) / 10), 0) || 10,
	// target's weight sets the power
	lowkick: (b, u, t) => { const w = b.weightOf(t); return w < 10 ? 20 : w < 25 ? 40 : w < 50 ? 60 : w < 100 ? 80 : w < 200 ? 100 : 120; },
	grassknot: (b, u, t) => { const w = b.weightOf(t); return w < 10 ? 20 : w < 25 ? 40 : w < 50 ? 60 : w < 100 ? 80 : w < 200 ? 100 : 120; },
	// heavier user vs lighter target
	heavyslam: (b, u, t) => { const r = b.weightOf(t) / b.weightOf(u); return r > 0.5 ? 40 : r > 1 / 3 ? 60 : r > 0.25 ? 80 : r > 0.2 ? 100 : 120; },
	heatcrash: (b, u, t) => { const r = b.weightOf(t) / b.weightOf(u); return r > 0.5 ? 40 : r > 1 / 3 ? 60 : r > 0.25 ? 80 : r > 0.2 ? 100 : 120; },
	// held-item moves fail empty-handed (or under Klutz); the item is consumed post-gate
	fling: (b, u) => u.heldItem && b.abilityOf(u) !== 'klutz' ? 60 : 0,
	naturalgift: (b, u) => NATURAL_GIFT[u.heldItem] && b.abilityOf(u) !== 'klutz' ? 80 : 0,
	weatherball: (b) => b.weatherKind() ? 100 : 50,
	solarbeam: (b) => { const wk = b.weatherKind(); return wk && wk !== 'sun' ? 60 : 120; },
	solarblade: (b) => { const wk = b.weatherKind(); return wk && wk !== 'sun' ? 62 : 125; },
};
// Weather Ball takes on the weather's element
const WEATHERBALL_TYPE = { rain: 'Water', sun: 'Fire', sand: 'Rock', hail: 'Ice' };
// Natural Gift: the held berry sets the element (canonical types, gen-6 power 80)
const NATURAL_GIFT = {
	cheriberry: 'Fire', chestoberry: 'Water', pechaberry: 'Electric', rawstberry: 'Grass',
	aspearberry: 'Ice', oranberry: 'Poison', persimberry: 'Ground', lumberry: 'Flying',
	sitrusberry: 'Psychic',
};
// expected powers so the trainer AI can weigh dynamic-power moves it would
// otherwise skip (`if (!mv.power) continue`); situational ones (Counter, Bide,
// Final Gambit, Fling ...) stay unlisted — random-pick only, like before
const AI_EST_POWER = {
	seismictoss: 60, nightshade: 60, dragonrage: 45, sonicboom: 30, psywave: 50,
	superfang: 70, endeavor: 70, gyroball: 60, electroball: 70, flail: 50, reversal: 50,
	return: 102, frustration: 102, veeveevolley: 102, pikapapow: 102,
	wringout: 80, crushgrip: 80, hardpress: 70, magnitude: 71, beatup: 40, trumpcard: 40,
	lowkick: 60, grassknot: 60, heavyslam: 80, heatcrash: 80,
};

const STATUS_NAMES = { brn: 'BRN', psn: 'PSN', par: 'PAR', slp: 'SLP', frz: 'FRZ' };
const STATUS_APPLIED_MSG = {
	brn: 'was burned!', psn: 'was poisoned!', par: 'is paralyzed! It may be unable to move!',
	slp: 'fell asleep!', frz: 'was frozen solid!',
};
// type immunities to statuses (Gen3-ish)
const STATUS_IMMUNE = {
	brn: ['Fire'], frz: ['Ice'], psn: ['Poison', 'Steel'], par: [], slp: [],
};
// ability immunities to statuses (shared by direct status moves and secondaries)
const STATUS_IMMUNE_AB = {
	psn: ['immunity', 'pastelveil', 'purifyingsalt'],
	par: ['limber', 'purifyingsalt'],
	brn: ['waterveil', 'waterbubble', 'thermalexchange', 'purifyingsalt'],
	frz: ['magmaarmor', 'purifyingsalt'],
	slp: ['insomnia', 'vitalspirit', 'sweetveil', 'purifyingsalt'],
};

// ---------- mon construction (pokemonBuilder.lua port) ----------
function calcStat(base, iv, ev, level, isHP) {
	if (isHP) return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
	return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5;
}

// the 25 natures: +10% / −10% (the five up===dn ones are neutral)
export const NATURES = {
	hardy: ['atk', 'atk'], lonely: ['atk', 'def'], brave: ['atk', 'spe'], adamant: ['atk', 'spa'], naughty: ['atk', 'spd'],
	bold: ['def', 'atk'], docile: ['def', 'def'], relaxed: ['def', 'spe'], impish: ['def', 'spa'], lax: ['def', 'spd'],
	timid: ['spe', 'atk'], hasty: ['spe', 'def'], serious: ['spe', 'spe'], jolly: ['spe', 'spa'], naive: ['spe', 'spd'],
	modest: ['spa', 'atk'], mild: ['spa', 'def'], quiet: ['spa', 'spe'], bashful: ['spa', 'spa'], rash: ['spa', 'spd'],
	calm: ['spd', 'atk'], gentle: ['spd', 'def'], sassy: ['spd', 'spe'], careful: ['spd', 'spa'], quirky: ['spd', 'spd'],
};
const NATURE_NAMES = Object.keys(NATURES);

// opts (optional) carries the mon's { nature, evs } — absent keeps the old math
export function statsFor(sp, ivs, level, opts) {
	const b = sp.baseStats;
	const evs = opts?.evs || {};
	const st = {
		hp: calcStat(b.hp || 50, ivs.hp, evs.hp || 0, level, true),
		atk: calcStat(b.atk || 50, ivs.atk, evs.atk || 0, level, false),
		def: calcStat(b.def || 50, ivs.def, evs.def || 0, level, false),
		spa: calcStat(b.spa || 50, ivs.spa, evs.spa || 0, level, false),
		spd: calcStat(b.spd || 50, ivs.spd, evs.spd || 0, level, false),
		spe: calcStat(b.spe || 50, ivs.spe, evs.spe || 0, level, false),
	};
	const nat = NATURES[opts?.nature];
	if (nat && nat[0] !== nat[1]) {
		st[nat[0]] = Math.floor(st[nat[0]] * 1.1);
		st[nat[1]] = Math.floor(st[nat[1]] * 0.9);
	}
	return st;
}

export function makeMove(mid, data) {
	const mv = data.moves[mid] || { name: mid, category: 'Physical', power: 40, acc: 100, type: 'Normal', pp: 20, priority: 0 };
	return { id: mid, name: mv.name, pp: mv.pp, maxPp: mv.pp };
}

// real gender ratios (genders.json: male chance, -1 = genderless -> null)
export function rollGender(speciesId, data) {
	const g = data?.genders?.[speciesId];
	if (g === -1) return null;
	return Math.random() < (g == null ? 0.5 : g) ? 'M' : 'F';
}

export function buildMon(speciesId, level, data) {
	const sp = data.species[speciesId];
	if (!sp) return null;
	const iv = () => Math.floor(Math.random() * 32);
	const ivs = { hp: iv(), atk: iv(), def: iv(), spa: iv(), spd: iv(), spe: iv() };
	const nature = NATURE_NAMES[Math.floor(Math.random() * NATURE_NAMES.length)];
	const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
	const stats = statsFor(sp, ivs, level, { nature, evs });
	// last 4 level-up moves at this level, deduped (latest first)
	const learned = sp.learnset.filter(([lv]) => lv <= level);
	const seen = new Set(), moveIds = [];
	for (let i = learned.length - 1; i >= 0 && moveIds.length < 4; i--) {
		const mid = learned[i][1];
		if (!seen.has(mid)) { seen.add(mid); moveIds.push(mid); }
	}
	if (!moveIds.length) moveIds.push('tackle');
	const moves = moveIds.map(mid => makeMove(mid, data));
	return {
		speciesId, name: sp.name.toUpperCase(), level,
		nature, evs,
		// full-odds shiny roll (every mon source runs through here); the Shiny
		// Charm — a Pokédex milestone — triples it
		shiny: Math.random() < (Bag.count('shinycharm') > 0 ? 3 : 1) / 512,
		gender: rollGender(speciesId, data),
		ability: (() => { const opts = data.abilities?.[speciesId]; return opts?.length ? opts[Math.floor(Math.random() * opts.length)] : null; })(),
		friend: 70, // friendship: grows with wins/levels, some species evolve on it
		types: [...sp.types], ivs, stats, maxHP: stats.hp, curHP: stats.hp,
		exp: expForLevel(level), // medium-fast to 100, flat above (badges.js)
		moves, sprite: sp.sprite, num: sp.num,
	};
}

// real exp yield when known (dex.json), else base-stat-total estimate
export function expGain(foe, data) {
	let yieldBase = data.extra?.[foe.speciesId]?.exp;
	if (!yieldBase) {
		const b = data.species[foe.speciesId]?.baseStats || {};
		const bst = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].reduce((s, k) => s + (b[k] || 50), 0);
		yieldBase = Math.floor(bst / 4);
	}
	return Math.max(1, Math.floor(yieldBase * foe.level / 7));
}

// ---------- battle scene ----------
const P = { box: '#f8f8e0', border: '#28283a', text: '#28283a', panel: '#203050', panelText: '#f8f8e0' };

export class Battle {
	constructor() {
		this.data = null;
		this.active = null;
		// Overworld progression clamps this (see Badges.levelCap); every other
		// caller of this engine — PvP, the run modes, the arcade boxes — leaves it
		// at 100 and is unaffected.
		// No cap by default: the overworld sets its own via refreshLevelCap(), and
		// every other caller (PvP, the run modes, the Frontier) is uncapped. This has
		// to be MAX_LEVEL rather than 100 now that mons can exceed 100 — a Lv150 mon
		// in a PvP battle would otherwise sit permanently at the cap and never level.
		this.levelCap = MAX_LEVEL;
	}

	async init() {
		const [species, moves, extra, abilities, tmLearn, genders] = await Promise.all([
			getJSON('data/species_battle.json'),
			getJSON('data/moves_battle.json'),
			getJSON('data/species_extra.json').catch(() => ({})),
			getJSON('data/species_abilities.json').catch(() => ({})),
			getJSON('data/tm_learnsets.json').catch(() => ({})), // TM/tutor compat (gen_tm_learnsets.mjs)
			getJSON('data/genders.json').catch(() => ({})), // male-chance per species; -1 = genderless (gen_genders.mjs)
		]);
		// real per-species EV yields (gen_ev_yields.mjs, from pokeemerald); species
		// absent from it (fakemon, later gens) keep the highest-base-stat heuristic
		const [evYields, eggMoves] = await Promise.all([
			getJSON('data/ev_yields.json').catch(() => ({})),
			// true egg-move lists (gen_egg_moves.mjs) — read by daycare inheritance
			getJSON('data/egg_moves.json').catch(() => ({})),
		]);
		this.data = { species, moves, extra, abilities, tmLearn, genders, evYields, eggMoves };
		// the Love2D build's pixel font, so battle text matches the desktop game
		try {
			const f = new FontFace('m6x11plus', 'url(data/fonts/m6x11plus.ttf)');
			await f.load();
			document.fonts.add(f);
		} catch (e) { /* system monospace fallback */ }
	}

	// start a wild battle vs the party; onEnd(result) with
	// 'victory'|'defeat'|'escaped'|'caught'; second = {id, level} makes it
	// a wild DOUBLE battle when the party has two healthy mons
	async start(party, wildId, wildLevel, onEnd, second, opts) {
		this._starting = true; // block overworld movement immediately (before sprites load)
		// leave-and-resume: a restore snapshot supplies the mid-battle foe and
		// skips every fresh-encounter roll (held item, Synchronize, intro)
		const restore = opts?.restore || null;
		const foe = restore ? restore.foe : buildMon(wildId, wildLevel, this.data);
		if (foe && !restore && Math.random() < 0.15) {
			foe.heldItem = Bag.WILD_HELD[Math.floor(Math.random() * Bag.WILD_HELD.length)];
		}
		const playerMon = (restore && party[restore.meIdx]?.curHP > 0)
			? party[restore.meIdx] : party.find(m => m.curHP > 0);
		if (!foe || !playerMon) { this._starting = false; onEnd?.('escaped'); return; }
		// SYNCHRONIZE afield: with a Synchronize lead, half of wild encounters
		// share its nature — the classic nature-hunting tool, previously
		// battle-only. Stats are recomputed since the nature was already baked in.
		if (!restore && playerMon.ability === 'synchronize' && Math.random() < 0.5 && playerMon.nature) {
			foe.nature = playerMon.nature;
			foe.stats = statsFor(this.data.species[wildId], foe.ivs, foe.level, foe);
			foe.maxHP = foe.stats.hp; foe.curHP = foe.stats.hp;
		}
		const loadSprite = async (file, back) => {
			if (!file) return null;
			const name = back ? file.replace(/\.(png|gif)$/, '-b.$1') : file;
			return await getImage(`data/pokemon/${name}`).catch(() =>
				getImage(`data/pokemon/${file}`).catch(() => null));
		};
		this._loadSprite = loadSprite; // reused by mid-battle form changes (changeForm)
		// build the ally pair FIRST so every sprite — foe, allies, party backs —
		// loads in ONE parallel round (two serialized rounds doubled the frozen
		// pre-battle wait on cold caches)
		let foeAlly = null, meAlly = null;
		if (restore) {
			foeAlly = restore.foeAlly || null;
			meAlly = restore.meAllyIdx >= 0 && party[restore.meAllyIdx]?.curHP > 0 ? party[restore.meAllyIdx] : null;
			if (!foeAlly || !meAlly) { foeAlly = null; meAlly = null; }   // a half-pair can't resume as doubles
		} else if (second && party.filter(m => m.curHP > 0).length >= 2) {
			foeAlly = buildMon(second.id, second.level, this.data);
			meAlly = party.filter(m => m.curHP > 0)[1];
		}
		const backSprites = new Map();
		const [foeImg, foeAllyImg, meAllyImg] = await Promise.all([
			loadSprite(foe.sprite, false),
			foeAlly ? loadSprite(foeAlly.sprite, false) : null,
			meAlly ? loadSprite(meAlly.sprite, true) : null,
			...party.map(async m => backSprites.set(m, await loadSprite(m.sprite, true))),
		]);
		this.active = {
			double: !!foeAlly,
			meAlly, foeAlly, meAllyImg, foeAllyImg,
			meAllyBoosts: freshBoosts(), foeAllyBoosts: freshBoosts(),
			meAllyShownHP: meAlly?.curHP ?? 0, foeAllyShownHP: foeAlly?.curHP ?? 0,
			meAllyShownExp: meAlly ? (meAlly.exp ?? expForLevel(meAlly.level)) : 0,
			plans: [], actionFor: 0,
			party, me: playerMon, foe, foeImg, backSprites,
			meImg: backSprites.get(playerMon),
			meBoosts: freshBoosts(),
			foeBoosts: freshBoosts(),
			meShownHP: playerMon.curHP, foeShownHP: foe.curHP, meHidden: true, // revealed by the send-out ball throw
			meShownExp: playerMon.exp ?? expForLevel(playerMon.level),
			meScreens: { reflect: 0, light: 0 }, foeScreens: { reflect: 0, light: 0 },
			meSide: {}, foeSide: {},               // tailwind/safeguard/mist/luckychant turns
			meHazards: {}, foeHazards: {},         // spikes/toxicspikes/stealthrock/stickyweb
			meFuture: null, foeFuture: null,       // a pending FUTURE SIGHT / DOOM DESIRE
			// environmental weather arrives from the MAP (endless); moves/abilities
			// overwrite it with their own timed spells as usual
			weather: opts?.weather ? { kind: opts.weather, turns: Infinity } : null, terrain: null,
			stage: (this.stageOf && this.stageOf()) || { terrain: 'grass', night: false }, // visual backdrop/platform
			// the LIVE safari session object from main (balls decrement in place);
			// null everywhere but a Safari Zone encounter
			safari: opts?.safari || null,
			fieldFx: {},                           // trickRoom/gravity/mudSport/waterSport turns
			lastMove: {},                          // last move id per side
			phase: 'flash', t: 0,
			menuIdx: 0, moveIdx: 0,
			queue: [],           // pending messages/actions
			msg: '', msgT: 0,
			runAttempts: 0,
			onEnd,
			result: null,
			caughtMon: null,
			roamer: !!opts?.roamer, // a roaming legendary: flee-prone, wounds persist
		};
		if (opts?.roamer?.hp != null) foe.curHP = Math.max(1, Math.min(foe.maxHP, opts.roamer.hp | 0));
		if (opts?.roamer?.status) foe.status = opts.roamer.status;
		this._starting = false; // active now drives `blocking`
		if (restore) { this.applyRestore(restore); return; }
		for (const m of party) this.clearVolatiles(m);
		// the map's weather is worth a line — it changes the fight
		if (this.active.weather?.kind) {
			const wmsg = { rain: 'Rain pours down.', sandstorm: 'A sandstorm rages.', hail: 'Hail pelts down.', sun: 'The sunlight is harsh.' };
			this.pushMsg(wmsg[this.active.weather.kind] || '');
		}

		if (foeAlly) {
			this.pushMsg(`Wild ${foe.name} and ${foeAlly.name} appeared!`, () => cry(foe.speciesId));
			if (foe.shiny || foeAlly.shiny) this.pushMsg(`✨ It's SHINY! ✨`);
			this.pushMsg('', () => this.switchInAbility(this.active.foe, 'foe'));
			this.queueSendOut(`Go! ${playerMon.name} and ${meAlly.name}!`, playerMon, 'me');
			this.pushMsg('', () => this.switchInAbility(this.active.me, 'me'));
		} else {
			this.pushMsg(`A wild ${foe.name} appeared!`, () => cry(foe.speciesId));
			if (foe.shiny) this.pushMsg(`✨ It's SHINY! ✨`);
			this.pushMsg('', () => this.switchInAbility(this.active.foe, 'foe'));
			this.queueSendOut(`Go! ${playerMon.name}!`, playerMon, 'me');
			this.pushMsg('', () => this.switchInAbility(this.active.me, 'me'));
		}
	}

	// trainer battle: foeParty of mons, no running, no catching
	async startTrainer(party, foeParty, info, onEnd, opts) {
		const restore = opts?.restore || null;
		this._starting = true; // block overworld movement immediately (before sprites load)
		const playerMon = (restore && party[restore.meIdx]?.curHP > 0)
			? party[restore.meIdx] : party.find(m => m.curHP > 0);
		if (!foeParty.length || !playerMon) { this._starting = false; onEnd?.('escaped'); return; }
		const loadSprite = async (file, back) => {
			if (!file) return null;
			const name = back ? file.replace(/\.(png|gif)$/, '-b.$1') : file;
			return await getImage(`data/pokemon/${name}`).catch(() =>
				getImage(`data/pokemon/${file}`).catch(() => null));
		};
		this._loadSprite = loadSprite; // reused by mid-battle form changes (changeForm)
		const backSprites = new Map(), foeSprites = new Map();
		await Promise.all([
			...party.map(async m => backSprites.set(m, await loadSprite(m.sprite, true))),
			...foeParty.map(async m => foeSprites.set(m, await loadSprite(m.sprite, false))),
		]);
		const foe = foeParty[(restore?.foeIdx) || 0] || foeParty[0];
		const isDouble = foeParty.length >= 2 && /TWINS|COUPLE| & |SR\. AND JR/i.test(info.displayName || '');
		const meAlly = isDouble ? party.filter(m => m.curHP > 0)[1] || null : null;
		const foeAlly = isDouble ? foeParty[1] : null;
		this.active = {
			double: !!(isDouble && meAlly),
			meAlly: isDouble && meAlly ? meAlly : null,
			foeAlly: isDouble && meAlly ? foeAlly : null,
			meAllyImg: null, foeAllyImg: null,
			meAllyBoosts: freshBoosts(), foeAllyBoosts: freshBoosts(),
			meAllyShownHP: meAlly?.curHP ?? 0, foeAllyShownHP: foeAlly?.curHP ?? 0,
			meAllyShownExp: meAlly ? (meAlly.exp ?? expForLevel(meAlly.level)) : 0,
			plans: [], actionFor: 0,
			party, me: playerMon, foe, backSprites, foeSprites,
			foes: foeParty, foeIdx: (restore?.foeIdx) || 0, isTrainer: true, info,
			foeImg: foeSprites.get(foe),
			meImg: backSprites.get(playerMon),
			meBoosts: freshBoosts(),
			foeBoosts: freshBoosts(),
			meShownHP: playerMon.curHP, foeShownHP: foe.curHP, meHidden: true, // revealed by the send-out ball throw
			meShownExp: playerMon.exp ?? expForLevel(playerMon.level),
			meScreens: { reflect: 0, light: 0 }, foeScreens: { reflect: 0, light: 0 },
			meSide: {}, foeSide: {},               // tailwind/safeguard/mist/luckychant turns
			meHazards: {}, foeHazards: {},         // spikes/toxicspikes/stealthrock/stickyweb
			meFuture: null, foeFuture: null,       // a pending FUTURE SIGHT / DOOM DESIRE
			weather: info?.weather ? { kind: info.weather, turns: Infinity } : null, terrain: null,
			stage: (this.stageOf && this.stageOf()) || { terrain: 'grass', night: false }, // visual backdrop/platform
			fieldFx: {},                           // trickRoom/gravity/mudSport/waterSport turns
			lastMove: {},                          // last move id per side
			phase: 'flash', t: 0,
			menuIdx: 0, moveIdx: 0,
			queue: [],
			msg: '', msgT: 0,
			runAttempts: 0,
			onEnd,
			result: null,
			caughtMon: null,
		};
		this._starting = false; // active now drives `blocking`
		if (!restore) for (const m of party) this.clearVolatiles(m);
		if (this.active.double) {
			this.active.meAllyImg = backSprites.get(this.active.meAlly);
			this.active.foeAllyImg = foeSprites.get(this.active.foeAlly);
			this.active.foeIdx = 1; // both lead foes are out
		}
		if (restore) { this.applyRestore(restore); return; }
		this.pushMsg(`You are challenged by ${info.displayName}!`);
		this.pushMsg(`${info.displayName} sent out ${foe.name}${this.active.double ? ' and ' + this.active.foeAlly.name : ''}!`, () => cry(foe.speciesId));
		this.pushMsg('', () => this.switchInAbility(this.active.foe, 'foe'));
		this.queueSendOut(`Go! ${playerMon.name}!`, playerMon, 'me');
		this.pushMsg('', () => this.switchInAbility(this.active.me, 'me'));
	}

	get blocking() { return this.active != null || !!this._starting; }

	pushMsg(text, fn) { this.active.queue.push({ text, fn }); }
	// queued sprite animation: the message queue pauses while it plays
	// BATTLE ANIM scales every queued animation. Durations were hardcoded
	// literals, so there was no way to speed up or skip them while grinding.
	// 'off' still leaves a hair of time so the callback ordering is unchanged.
	pushAnim(kind, side, dur, done, extra) {
		const k = animScale();
		this.active.queue.push({ anim: { kind, side, dur: Math.max(0.01, dur * k), done, ...extra } });
	}

	// send a mon out with a thrown ball (Batch 5 sparkle): the name line, then a
	// ball arcs in from the trainer's corner, bursts open (cry + reveal), and the
	// mon slides in. Mirrors the capture ball on the player's side — before this
	// the player's mon just popped in. `assign` (optional) swaps a.me/images first.
	queueSendOut(text, mon, side = 'me', assign) {
		const a = this.active;
		const H = side === 'me' ? 'meHidden' : 'foeHidden';
		this.pushMsg(text, () => { assign?.(); a[H] = true; });
		this.pushAnim('sendthrow', side, 0.5, () => sfx('ball_open'));
		this.pushAnim('sendburst', side, 0.42, () => { a[H] = false; cry((mon || (side === 'me' ? a.me : a.foe))?.speciesId); });
		this.pushAnim('enter', side, 0.35);
	}

	// ---------- leave-and-resume ----------
	// A serializable picture of the fight, taken between actions (never the
	// message queue — callbacks can't survive a reload). main.js persists it
	// and rebuilds the battle through the normal start paths with
	// opts.restore, so sprites and images load the usual way and only STATE
	// is reapplied. Infinity survives as 'inf' (JSON drops it otherwise).
	snapshot() {
		const a = this.active;
		if (!a || a.phase === 'done' || !a.me || !a.foe || a.foe.curHP <= 0 || a.me.curHP <= 0) return null;
		const strip = m => {
			const seen = new WeakSet();   // per CALL — foes[i] and foe are the same object across calls
			return JSON.parse(JSON.stringify(m, (k, v) => {
				if (typeof v === 'function') return undefined;
				if (v && typeof v === 'object') {
					if (seen.has(v)) return undefined;   // any future live-ref cycle degrades, never throws
					seen.add(v);
				}
				return v;
			}));
		};
		return {
			v: 1, isTrainer: !!a.isTrainer, double: !!a.double,
			info: a.isTrainer ? strip(a.info) : null,
			foes: a.isTrainer ? a.foes.map(strip) : null,
			foeIdx: a.foeIdx || 0,
			foe: strip(a.foe), foeAlly: a.foeAlly ? strip(a.foeAlly) : null,
			meIdx: Math.max(0, a.party.indexOf(a.me)),
			meAllyIdx: a.meAlly ? a.party.indexOf(a.meAlly) : -1,
			boosts: { me: a.meBoosts, foe: a.foeBoosts, meAlly: a.meAllyBoosts, foeAlly: a.foeAllyBoosts },
			meScreens: a.meScreens, foeScreens: a.foeScreens,
			meSide: a.meSide, foeSide: a.foeSide,
			meHazards: a.meHazards, foeHazards: a.foeHazards,
			meFuture: a.meFuture, foeFuture: a.foeFuture,
			weather: a.weather ? { kind: a.weather.kind, turns: a.weather.turns === Infinity ? 'inf' : a.weather.turns } : null,
			terrain: a.terrain, fieldFx: a.fieldFx,
			turnCount: a.turnCount || 0, lastMove: a.lastMove, runAttempts: a.runAttempts || 0,
			safari: !!a.safari,
		};
	}
	// reapply the snapshot onto a freshly-built active. Switch-in abilities
	// deliberately do NOT re-fire (Intimidate already spoke last time).
	applyRestore(snap) {
		const a = this.active;
		const put = (dst, src) => { if (dst && src) Object.assign(dst, src); };
		put(a.meBoosts, snap.boosts?.me); put(a.foeBoosts, snap.boosts?.foe);
		put(a.meAllyBoosts, snap.boosts?.meAlly); put(a.foeAllyBoosts, snap.boosts?.foeAlly);
		put(a.meScreens, snap.meScreens); put(a.foeScreens, snap.foeScreens);
		put(a.meSide, snap.meSide); put(a.foeSide, snap.foeSide);
		put(a.meHazards, snap.meHazards); put(a.foeHazards, snap.foeHazards);
		put(a.fieldFx, snap.fieldFx);
		a.terrain = snap.terrain || null;
		a.weather = snap.weather ? { kind: snap.weather.kind, turns: snap.weather.turns === 'inf' ? Infinity : snap.weather.turns } : null;
		a.meFuture = snap.meFuture || null;
		a.foeFuture = snap.foeFuture || null;
		a.turnCount = snap.turnCount || 0;
		a.lastMove = snap.lastMove || {};
		a.runAttempts = snap.runAttempts || 0;
		a.meShownHP = a.me.curHP; a.foeShownHP = a.foe.curHP;
		a.meAllyShownHP = a.meAlly?.curHP ?? 0; a.foeAllyShownHP = a.foeAlly?.curHP ?? 0;
		a.meHidden = false; // a resumed battle skips the send-out that would reveal it
		this.pushMsg('The battle picks up right where it left off!');
	}

	// floating combat text over a combatant ("-12", "+8"), positioned at draw time
	float(side, text, color) {
		(this.active.floaters ||= []).push({ side, text, color, t: 0 });
	}

	// ---------- actors (doubles-aware helpers) ----------
	// ---------- mid-battle form changes (Upscale 5 Batch 3) ----------
	// Swap a battle mon to another form's species entry: recompute its stats from
	// the form's base stats (same level/IVs/EVs/nature), swap types + sprite, and
	// carry HP sensibly across a max-HP change (Zygarde-Complete gains the extra).
	changeForm(mon, formId, side, msg) {
		const sp = this.data.species[formId];
		if (!sp || (mon.form || mon.speciesId) === formId || mon.curHP <= 0) return false;
		mon.form = formId;
		const oldMax = mon.maxHP;
		mon.stats = statsFor(sp, mon.ivs, mon.level, { nature: mon.nature, evs: mon.evs });
		mon.types = [...sp.types];
		mon.maxHP = mon.stats.hp;
		if (mon.maxHP > oldMax) mon.curHP = Math.min(mon.maxHP, mon.curHP + (mon.maxHP - oldMax));
		else if (mon.curHP > mon.maxHP) mon.curHP = mon.maxHP;
		if (msg) this.pushMsg(msg);
		// best-effort sprite swap so the change reads on-screen
		if (sp.sprite && this._loadSprite) {
			this._loadSprite(sp.sprite, side === 'me').then(img => {
				const a = this.active; if (!a || !img) return; // keep the old sprite if the form has none
				if (side === 'me' && mon === a.me) a.meImg = img;
				else if (side === 'foe' && mon === a.foe) a.foeImg = img;
			}).catch(() => {});
		}
		return true;
	}
	// HP/level-threshold + weather forms, checked after damage and each end of turn
	checkFormTriggers() {
		const a = this.active;
		for (const mon of [a.me, a.foe, a.meAlly, a.foeAlly]) {
			if (!mon || mon.curHP <= 0) continue;
			const ab = this.abilityOf(mon), side = this.sideOfMon(mon);
			const rule = FORM_RULES[ab];
			if (rule && mon.speciesId === rule.base) {
				const cur = mon.form || mon.speciesId;
				const frac = mon.curHP / mon.maxHP;
				const wantAlt = (rule.when === 'below' ? frac <= rule.hp : frac > rule.hp) && (!rule.minLevel || mon.level >= rule.minLevel);
				if (wantAlt && cur !== rule.alt) this.changeForm(mon, rule.alt, side, `${mon.name} ${rule.msg}!`);
				else if (!wantAlt && cur !== rule.base && !rule.oneWay) this.changeForm(mon, rule.base, side, `${mon.name} returned to normal!`);
			}
			// FORECAST: Castform matches the sky (sun→Fire, rain→Water, hail→Ice)
			if (ab === 'forecast' && mon.speciesId === 'castform') {
				const want = { sun: 'castform_sunny', rain: 'castform_rainy', hail: 'castform_snowy' }[this.weatherKind()] || 'castform';
				if ((mon.form || mon.speciesId) !== want) this.changeForm(mon, want, side, `${mon.name} transformed with the weather!`);
			}
		}
	}

	actorMons() {
		const a = this.active;
		const out = [a.me, a.foe];
		if (a.double) {
			if (a.meAlly) out.splice(1, 0, a.meAlly);
			if (a.foeAlly) out.push(a.foeAlly);
		}
		return out.filter(m => m && m.curHP > 0);
	}
	sideOfMon(mon) {
		const a = this.active;
		return (mon === a.me || mon === a.meAlly) ? 'me' : 'foe';
	}
	// the full party behind a mon (wild foes fight alone) — Beat Up counts it
	partyOf(mon) {
		const a = this.active;
		return this.sideOfMon(mon) === 'me' ? a.party : (a.foes || [a.foe]);
	}
	// canonical weight in kg for the weight-based moves; fakemon default mid-tier
	weightOf(mon) {
		let w = this.data.species[mon.speciesId]?.weightkg || 50;
		// HEAVY METAL / LIGHT METAL were inert for want of this one line. They also
		// swing Heavy Slam, Heat Crash, Low Kick and Grass Knot, which all read
		// weightOf — four moves and two abilities on the same hook.
		const ab = this.abilityOf(mon);
		if (ab === 'heavymetal') w *= 2;
		else if (ab === 'lightmetal') w /= 2;
		return w;
	}
	// move-menu effectiveness hint vs the current foe (singles only — doubles
	// pick their target after the move, so a single hint would mislead)
	effHint(info) {
		const a = this.active;
		if (!a || a.double || !info.type || info.category === 'Status') return '';
		const e = effectiveness(info.type, a.foe.types);
		return e === 0 ? ' ×0' : e >= 4 ? ' ×4' : e >= 2 ? ' ×2' : e <= 0.25 ? ' ×¼' : e < 1 ? ' ×½' : '';
	}
	// move-menu damage forecast vs the current foe (singles only): a % range of the
	// foe's max HP, or KO? when the median estimate already finishes it. '' for
	// status / powerless moves. Uses the AI's real damage core (estimateDamage).
	dmgHint(mv) {
		const a = this.active;
		if (!a || a.double) return '';
		const info = this.data.moves[mv.id] || {};
		if (info.category === 'Status' || (!info.power && !AI_EST_POWER[mv.id])) return '';
		const est = this.estimateDamage(a.me, a.foe, mv, a.meBoosts, a.foeBoosts);
		if (est <= 0) return '';
		const hi = Math.round(100 * est / Math.max(1, a.foe.maxHP));
		if (hi >= 100) return ' · KO?';
		return ` · ~${Math.max(1, Math.round(hi * 0.85))}-${hi}%`;
	}
	// who acts first if the player picks this move: compares effective Speed with
	// the move's priority bracket (the foe's move is unknown, assumed priority 0),
	// honouring paralysis and Trick Room. Returns 'FIRST' | 'SECOND' | 'TIE' | ''.
	speedOrder(mv) {
		const a = this.active;
		if (!a || a.double) return '';
		const info = this.data.moves[mv.id] || {};
		const pr = info.priority || 0;
		if (pr > 0) return 'FIRST';
		if (pr < 0) return 'SECOND';
		const eff = mon => this.statOf(mon, this.boostsOf(mon), 'spe') * (mon.status === 'par' ? 0.5 : 1);
		const me = eff(a.me), foe = eff(a.foe);
		if (me === foe) return 'TIE';
		const meFaster = (a.fieldFx?.trickroom > 0) ? me < foe : me > foe; // Trick Room flips it
		return meFaster ? 'FIRST' : 'SECOND';
	}
	// the one-line speed forecast for the currently-highlighted move
	drawSpeedHint(ctx, a, x, y, ub) {
		const chooser = a.double ? this.chooser() : a.me;
		const mv = chooser?.moves?.[a.moveIdx];
		const so = mv ? this.speedOrder(mv) : '';
		if (!so) return;
		ctx.save();
		ctx.font = `${Math.round(12 * ub)}px m6x11plus, monospace`;
		ctx.fillStyle = so === 'FIRST' ? UI.C.statUp : so === 'SECOND' ? UI.C.hpRed : UI.C.dim;
		ctx.fillText(so === 'FIRST' ? '► You move first' : so === 'SECOND' ? '► Foe moves first' : '► Speed tie', x, y);
		ctx.restore();
	}
	// which slot (0 = lead, 1 = ally) a mon occupies — so double-battle animations
	// only move the mon that's actually acting
	slotOfMon(mon) {
		const a = this.active;
		return (mon === a.meAlly || mon === a.foeAlly) ? 1 : 0;
	}
	boostsOf(mon) {
		const a = this.active;
		if (mon === a.me) return a.meBoosts;
		if (mon === a.meAlly) return a.meAllyBoosts;
		if (mon === a.foeAlly) return a.foeAllyBoosts;
		return a.foeBoosts;
	}

	// ---------- held items ----------
	// a mon's live held-item effects (null under Klutz or when empty-handed)
	itemFx(mon) {
		if (!mon.heldItem || this.abilityOf(mon) === 'klutz') return null;
		// EMBARGO on the mon, or MAGIC ROOM over the field, silences the item —
		// one check covers every effect because every read comes through here
		if (mon.embargoTurns > 0 || (this.active?.fieldFx?.magicRoom || 0) > 0) return null;
		return Bag.ITEMS[mon.heldItem]?.held || null;
	}
	itemName(mon) { return Bag.ITEMS[mon.heldItem]?.name || mon.heldItem; }
	// Effective speed for turn order: base speed with Tailwind, Choice Scarf,
	// Unburden and Trick Room applied. Singles has always done all four inline;
	// the doubles sorter used RAW speed, so a player who set Trick Room in a
	// double got the OPPOSITE of what the message promised and a 4800-gold
	// Choice Scarf was dead weight. Shared so they cannot drift apart again.
	speedOf(mon) {
		const a = this.active;
		const side = this.sideOfMon(mon) === 'me' ? a.meSide : a.foeSide;
		let spe = this.statOf(mon, this.boostsOf(mon), 'spe') * (side?.tailwind > 0 ? 2 : 1);
		if (this.itemFx(mon)?.choice === 'spe') spe *= 1.5;
		if (mon.unburdened) spe *= 2;
		if (mon.status && this.abilityOf(mon) === 'quickfeet') spe *= 1.5;   // was inert: 16 species
		if (this.abilityOf(mon) === 'slushrush' && this.weatherKind() === 'hail') spe *= 2;
		if (this.abilityOf(mon) === 'surgesurfer' && a.terrain?.kind === 'electric') spe *= 2;
		return a.fieldFx?.trickRoom > 0 ? -spe : spe;
	}
	// AMULET COIN doubles a trainer's prize. It MUTATES info.money rather than
	// just dressing up the message, because the caller (startTrainerBattle in
	// main.js) credits info.money itself — boosting only the text would announce
	// money the player never receives. Idempotent: both the singles and doubles
	// victory paths call this, and a battle must not pay double twice.
	// The real games require the holder to have fought; there is no participation
	// tracking here, so anyone in the party counts.
	prizeMoney() {
		const a = this.active;
		if (!a?.info) return 0;
		if (!a.info._coinApplied) {
			a.info._coinApplied = true;
			const mult = Math.max(1, ...(a.party || []).map(m => (m && this.itemFx(m)?.moneyBoost) || 1));
			if (mult > 1) a.info.money = Math.round((a.info.money || 0) * mult);
			if (a.happyHour) a.info.money = (a.info.money || 0) * 2;   // HAPPY HOUR
		}
		return a.info.money || 0;
	}
	consumeItem(mon) {
		mon.consumedItem = mon.heldItem;
		mon.heldItem = null;
		if (this.abilityOf(mon) === 'unburden') mon.unburdened = true;
	}
	// berries fire on their thresholds; status berries on affliction
	checkBerry(mon, side) {
		const fx = this.itemFx(mon);
		if (!fx || mon.curHP <= 0) return;
		if ((fx.berryHeal || fx.berryHealFrac) && mon.curHP <= mon.maxHP / 2) {
			const ripe = this.abilityOf(mon) === 'ripen' ? 2 : 1;   // was inert: 3 species
			const amt = (fx.berryHeal || Math.floor(mon.maxHP * fx.berryHealFrac)) * ripe;
			this.pushMsg(`${mon.name} ate its ${this.itemName(mon)}!`, () => {
				mon.curHP = Math.min(mon.maxHP, mon.curHP + amt);
				this.float(side, `+${amt}`, '#6be08a');
				if (this.abilityOf(mon) === 'cheekpouch') {
					mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.floor(mon.maxHP / 3));
				}
			});
			this.consumeItem(mon);
		}
		// STARF BERRY: at a quarter HP it sharply raises one random stat. Its
		// payload was `held: {}` — a berry you could buy that did nothing.
		if (fx.starfBoost && mon.curHP <= mon.maxHP / 4) {
			const stats = ['atk', 'def', 'spa', 'spd', 'spe'];
			const stat = stats[Math.floor(Math.random() * stats.length)];
			const words = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
			const boosts = this.boostsOf(mon);
			this.pushMsg(`${mon.name} ate its ${this.itemName(mon)}!`, () => {
				boosts[stat] = Math.min(6, (boosts[stat] || 0) + fx.starfBoost);
			});
			this.pushMsg(`${mon.name}'s ${words[stat]} rose sharply!`);
			this.consumeItem(mon);
		}
		// LEPPA BERRY: restores PP to a move that has run dry. Held-item berries fire
		// on their own threshold, and "a move is empty" is this one's.
		if (fx.ppRestore) {
			const dry = (mon.moves || []).find(mv => mv.pp <= 0);
			if (dry) {
				const ripe = this.abilityOf(mon) === 'ripen' ? 2 : 1;
				this.pushMsg(`${mon.name}'s ${this.itemName(mon)} restored ${dry.name}'s PP!`, () => {
					dry.pp = Math.min(dry.maxPp, dry.pp + fx.ppRestore * ripe);
				});
				this.consumeItem(mon);
			}
		}
		if (fx.cure && (mon.status || mon.confuseTurns > 0)) {
			const cures = fx.cure === 'any'
				|| (fx.cure === 'confusion' && mon.confuseTurns > 0)
				|| fx.cure === mon.status;
			if (cures) {
				this.pushMsg(`${mon.name}'s ${this.itemName(mon)} cured it!`, () => {
					if (fx.cure === 'any' || fx.cure === mon.status) { mon.status = null; delete mon.badPsn; }
					if (fx.cure === 'any' || fx.cure === 'confusion') delete mon.confuseTurns;
				});
				this.consumeItem(mon);
			}
		}
	}

	// ---------- abilities ----------
	abilityOf(mon) { return mon.abilitySuppressed ? null : (mon.ability || null); }
	abilityName(id) { return this.data.abilities?._names?.[id] || (id || '').toUpperCase(); }
	// weather is nulled while a Cloud Nine / Air Lock mon is on the field
	weatherKind() {
		const a = this.active;
		if (!a?.weather) return null;
		for (const m of [a.me, a.foe]) {
			const ab = this.abilityOf(m);
			if (m.curHP > 0 && (ab === 'cloudnine' || ab === 'airlock')) return null;
		}
		return a.weather.kind;
	}
	// Why `mon` cannot leave the field, or null. This did not exist: `noSwitch`
	// was SET by Mean Look / Block / Spider Web / Octolock / Fairy Lock and read
	// by nothing, so all five announced "can no longer escape!" and then let you
	// walk away — and SHADOW TAG / ARENA TRAP / MAGNET PULL were inert for the
	// same reason. Ghosts, SUCTION CUPS, GUARD DOG, Run Away and a SHED SHELL are
	// the canonical outs.
	trappedBy(mon) {
		const a = this.active;
		if (!a || mon.curHP <= 0) return null;
		const ab = this.abilityOf(mon);
		if (mon.types.includes('Ghost') || ab === 'runaway' || ab === 'suctioncups' || ab === 'guarddog') return null;
		if (mon.heldItem === 'shedshell') return null;
		if (mon.noSwitch) return 'trapped';
		if (mon.trapTurns > 0) return mon.trapName || 'trapped';
		// an opposing ability can pin it
		const foes = this.sideOfMon(mon) === 'me' ? this.livingFoes() : this.livingMine();
		for (const f of foes) {
			const fa = this.abilityOf(f);
			if (fa === 'shadowtag' && ab !== 'shadowtag') return 'SHADOW TAG';
			if (fa === 'arenatrap' && !mon.types.includes('Flying') && ab !== 'levitate') return 'ARENA TRAP';
			if (fa === 'magnetpull' && mon.types.includes('Steel')) return 'MAGNET PULL';
		}
		return null;
	}
	// Move priority, shared by the singles and doubles resolvers (they each had
	// their own copy, which is how the doubles sorter drifted). Gale Wings,
	// Triage and Quick Draw were all inert because neither copy knew them.
	movePriority(mon, move) {
		const mv = this.data.moves[move.id] || {};
		const ab = this.abilityOf(mon);
		let p = mv.priority || 0;
		if (mv.category === 'Status' && ab === 'prankster') p += 1;
		if (ab === 'galewings' && mv.type === 'Flying' && mon.curHP === mon.maxHP) p += 1;
		if (ab === 'triage' && (MOVE_FX[move.id]?.heal || MOVE_FX[move.id]?.drain)) p += 3;
		if (ab === 'quickdraw' && mv.category !== 'Status' && Math.random() < 0.3) p += 1;
		return p;
	}
	// --- narrow accessors so the suites can assert these directly rather than
	// inferring them from damage rolls (both tables are module-private) ---
	hiddenPowerTypeOf(mon) { return hiddenPowerType(mon); }
	powerOf(id, user, target, ub, tb, move) {
		return POWER_FX[id] ? POWER_FX[id](this, user, target, ub, tb, move) : (this.data.moves[id]?.power || 0);
	}
	// Clear Body & friends refuse foe-inflicted stat drops
	canLowerStat(target, stat) {
		const ab = this.abilityOf(target);
		if (ab === 'clearbody' || ab === 'whitesmoke') return false;
		if (ab === 'keeneye' && stat === 'acc') return false;
		if (ab === 'hypercutter' && stat === 'atk') return false;
		if (ab === 'bigpecks' && stat === 'def') return false;       // was inert: 21 species
		if (ab === 'illuminate' && stat === 'acc') return false;     // gen-9 role; was inert: 10
		if (ab === 'mirrorarmor') return false;                      // bounced instead (see below)
		if (ab === 'guarddog' && stat === 'atk') return false;       // shrugs off Intimidate
		if (ab === 'fullmetalbody' || ab === 'whitesmoke') return false;
		return true;
	}
	// announce + apply an ability's switch-in effect
	switchInAbility(mon, side) {
		const a = this.active;
		mon.justSwitchedIn = true;   // STAKEOUT reads this; cleared at end of turn
		const ab = this.abilityOf(mon);
		if (!ab || mon.curHP <= 0) return;
		const other = side === 'me' ? a.foe : a.me;
		const otherBoosts = side === 'me' ? a.foeBoosts : a.meBoosts;
		if (ab === 'intimidate' && other.curHP > 0) {
			if (other.subHP > 0 || !this.canLowerStat(other, 'atk')) {
				this.pushMsg(`${mon.name}'s Intimidate failed to cow ${other.name}!`);
			} else {
				otherBoosts.atk = Math.max(-6, (otherBoosts.atk || 0) - 1);
				this.pushMsg(`${mon.name}'s Intimidate cut ${other.name}'s Attack!`);
			}
		}
		const weatherAb = { drizzle: 'rain', drought: 'sun', sandstream: 'sand', snowwarning: 'hail' }[ab];
		if (weatherAb && a.weather?.kind !== weatherAb) {
			a.weather = { kind: weatherAb, turns: 8 };
			this.pushMsg(`${mon.name}'s ${this.abilityName(ab)} kicked up the weather!`);
		}
		if (ab === 'download' && other.curHP > 0) {
			const boosts = side === 'me' ? a.meBoosts : a.foeBoosts;
			const key = other.stats.def < other.stats.spd ? 'atk' : 'spa';
			boosts[key] = Math.min(6, (boosts[key] || 0) + 1);
			this.pushMsg(`${mon.name}'s Download raised its ${key === 'atk' ? 'Attack' : 'Sp. Atk'}!`);
		}
		if (ab === 'trace' && other.ability) {
			this.snapAbility(mon);
			mon.ability = other.ability;
			this.pushMsg(`${mon.name} traced ${other.name}'s ${this.abilityName(other.ability)}!`);
		}
		// PROTOSYNTHESIS / QUARK DRIVE: the paradox pair. Each boosts its own best
		// stat while its field condition holds.
		const para = { protosynthesis: () => this.weatherKind() === 'sun', quarkdrive: () => a.terrain?.kind === 'electric' };
		if (para[ab]?.()) {
			const boosts = side === 'me' ? a.meBoosts : a.foeBoosts;
			const best = ['atk', 'def', 'spa', 'spd', 'spe']
				.reduce((b, k) => (mon.stats[k] || 0) > (mon.stats[b] || 0) ? k : b, 'atk');
			boosts[best] = Math.min(6, (boosts[best] || 0) + 1);
			this.pushMsg(`${mon.name}'s ${this.abilityName(ab)} boosted its ${best.toUpperCase()}!`);
		}
		// NEUTRALIZING GAS switches every OTHER ability off while it is on the field
		if (ab === 'neutralizinggas') {
			this.pushMsg(`${mon.name} released NEUTRALIZING GAS — abilities were suppressed!`);
			for (const m of this.actorMons()) if (m !== mon) m.abilitySuppressed = true;
		}
		// POWER OF ALCHEMY / RECEIVER inherit a fallen ally's ability
		if ((ab === 'powerofalchemy' || ab === 'receiver') && a.double) {
			const ally = side === 'me' ? a.meAlly : a.foeAlly;
			if (ally && ally.curHP <= 0 && ally.ability) {
				this.snapAbility(mon);
				mon.ability = ally.ability;
				this.pushMsg(`${mon.name} inherited ${this.abilityName(ally.ability)}!`);
			}
		}
		// doubles pick-me-ups that only ever help the partner
		if (a.double) {
			const ally = side === 'me' ? a.meAlly : a.foeAlly;
			if (ally && ally.curHP > 0) {
				if (ab === 'hospitality') {
					const heal = Math.max(1, Math.floor(ally.maxHP / 4));
					ally.curHP = Math.min(ally.maxHP, ally.curHP + heal);
					this.pushMsg(`${mon.name} showered ${ally.name} with HOSPITALITY!`);
				}
				if (ab === 'curiousmedicine') {
					const ab2 = this.boostsOf(ally);
					for (const k of Object.keys(ab2)) ab2[k] = 0;
					this.pushMsg(`${mon.name}'s CURIOUS MEDICINE reset ${ally.name}'s stats!`);
				}
				if (ab === 'costar') {
					const mine = this.boostsOf(mon), theirs = this.boostsOf(ally);
					for (const k of Object.keys(theirs)) mine[k] = theirs[k];
					this.pushMsg(`${mon.name} copied ${ally.name}'s stat changes!`);
				}
			}
		}
		// SUPERSWEET SYRUP / INTIMIDATE's cousin: a one-time evasion drop on entry
		if (ab === 'supersweetsyrup' && other.curHP > 0 && !mon._syrupUsed) {
			mon._syrupUsed = true;
			otherBoosts.eva = Math.max(-6, (otherBoosts.eva || 0) - 1);
			this.pushMsg(`${mon.name} coated the field in SUPERSWEET SYRUP!`);
		}
		// MIMICRY takes the terrain's type
		if (ab === 'mimicry' && a.terrain?.kind) {
			const T = { electric: 'Electric', grassy: 'Grass', misty: 'Fairy', psychic: 'Psychic' }[a.terrain.kind];
			if (T) { this.snapTypes(mon); mon.types = [T]; this.pushMsg(`${mon.name}'s MIMICRY made it ${T}-type!`); }
		}
		// scouting abilities — all three were inert (frisk 33 species, forewarn 8,
		// anticipation 17). They only ever tell you something, which is exactly
		// what makes them safe to add and useful to a player reading the log.
		if (ab === 'frisk' && other.curHP > 0 && other.heldItem) {
			this.pushMsg(`${mon.name} frisked ${other.name} and found its ${this.itemName(other)}!`);
		}
		if (ab === 'forewarn' && other.curHP > 0) {
			const best = (other.moves || []).reduce((b, m) =>
				((this.data.moves[m.id]?.power || 0) > (this.data.moves[b?.id]?.power || 0) ? m : b), null);
			if (best) this.pushMsg(`${mon.name}'s FOREWARN sensed ${other.name}'s ${best.name}!`);
		}
		if (ab === 'anticipation' && other.curHP > 0) {
			const scary = (other.moves || []).some(m => {
				const mv = this.data.moves[m.id] || {};
				return mv.power && effectiveness(mv.type, mon.types) > 1;
			});
			if (scary) this.pushMsg(`${mon.name} shuddered with ANTICIPATION!`);
		}
		if (ab === 'intrepidsword') {
			const boosts = side === 'me' ? a.meBoosts : a.foeBoosts;
			boosts.atk = Math.min(6, (boosts.atk || 0) + 1);
			this.pushMsg(`${mon.name}'s Intrepid Sword raised its Attack!`);
		}
		if (ab === 'dauntlessshield') {
			const boosts = side === 'me' ? a.meBoosts : a.foeBoosts;
			boosts.def = Math.min(6, (boosts.def || 0) + 1);
			this.pushMsg(`${mon.name}'s Dauntless Shield raised its Defense!`);
		}
		const surge = { electricsurge: 'electric', grassysurge: 'grassy', mistysurge: 'misty', psychicsurge: 'psychic' }[ab];
		if (surge && a.terrain?.kind !== surge) {
			a.terrain = { kind: surge, turns: 8 };
			this.pushMsg(`${mon.name}'s ${this.abilityName(ab)} charged the field!`);
		}
		if (ab === 'screencleaner') {
			a.meScreens = { reflect: 0, light: 0 };
			a.foeScreens = { reflect: 0, light: 0 };
			this.pushMsg(`${mon.name}'s Screen Cleaner swept the screens away!`);
		}
		if (ab === 'slowstart') {
			mon.slowStartT = 5;
			this.pushMsg(`${mon.name} can't get it going!`);
		}
		if (ab === 'pressure') this.pushMsg(`${mon.name} is exerting its Pressure!`);
		if (ab === 'unnerve') this.pushMsg(`${mon.name}'s Unnerve makes the foe nervous!`);
		if (ab === 'imposter' && other.curHP > 0) {
			this.snapStats(mon); this.snapTypes(mon);
			mon.stats = { ...other.stats, hp: mon.stats.hp };
			mon.types = [...other.types];
			mon.transformedMoves = mon.transformedMoves || mon.moves;
			mon.moves = other.moves.map(m2 => ({ id: m2.id, name: m2.name, pp: 5, maxPp: 5 }));
			this.pushMsg(`${mon.name}'s Imposter transformed it into ${other.name}!`);
		}
	}

	// ---------- turn resolution ----------
	statOf(mon, boosts, key) {
		let v = Math.floor(mon.stats[key] * stageMult(boosts[key]));
		const ab = this.abilityOf(mon);
		if (key === 'atk' && mon.status === 'brn' && ab !== 'guts') v = Math.floor(v / 2);
		if (key === 'atk' && mon.status && ab === 'guts') v = Math.floor(v * 1.5);
		// QUICK FEET ignores paralysis's own speed cut as well as taking the 1.5x
		// (see speedOf) — without this the ability was a net LOSS while statused
		if (key === 'spe' && mon.status === 'par' && ab !== 'quickfeet') v = Math.floor(v / 4);
		if (key === 'spe') {
			const wk = this.weatherKind?.();
			if (ab === 'swiftswim' && wk === 'rain') v *= 2;
			if (ab === 'chlorophyll' && wk === 'sun') v *= 2;
			if (ab === 'speedboost' && false) v = v; // speed boost is end-of-turn stages
		}
		const ifx = this.itemFx(mon);
		if (key === 'spd' && ifx?.assaultVest) v = Math.floor(v * 1.5);
		if ((key === 'def' || key === 'spd') && ifx?.eviolite
			&& this.data.extra?.[mon.speciesId]?.evos?.length) v = Math.floor(v * 1.5);
		return Math.max(1, v);
	}

	applyStatus(target, st, bad, source) {
		if (target.status) { this.pushMsg('But it failed!'); return false; }
		// CORROSION poisons even Steel and Poison types — the one ability that
		// overrides a type immunity, so it has to be checked before the type list
		const corroding = source && this.abilityOf(source) === 'corrosion' && (st === 'psn');
		if (!corroding && (STATUS_IMMUNE[st] || []).some(t => target.types.includes(t))) {
			this.pushMsg(`It doesn't affect ${target.name}...`);
			return false;
		}
		const tAb2 = this.abilityOf(target);
		// AROMA VEIL / FLOWER VEIL also cover the ally in a double battle
		const a2 = this.active;
		const guard = [target, a2?.double ? (target === a2.me ? a2.meAlly : target === a2.meAlly ? a2.me
			: target === a2.foe ? a2.foeAlly : target === a2.foeAlly ? a2.foe : null) : null]
			.filter(m => m && m.curHP > 0).map(m => this.abilityOf(m));
		if (guard.includes('flowerveil') && target.types.includes('Grass')) {
			this.pushMsg(`${target.name} is protected by FLOWER VEIL!`);
			return false;
		}
		if ((STATUS_IMMUNE_AB[st] || []).includes(tAb2)
			|| (tAb2 === 'leafguard' && this.weatherKind() === 'sun')
			|| (tAb2 === 'comatose')) {
			this.pushMsg(`${target.name}'s ${this.abilityName(tAb2)} prevents that!`);
			return false;
		}
		if (st === 'slp' && this.actorMons().some(m => m.lockMove === 'uproar')) {
			this.pushMsg('But the uproar kept it awake!');
			return false;
		}
		target.status = st;
		if (st === 'slp') target.sleepTurns = 1 + Math.floor(Math.random() * 3);
		if (bad) { target.badPsn = true; target.toxicN = 1; }
		this.pushMsg(`${target.name} ${bad ? 'was badly poisoned!' : STATUS_APPLIED_MSG[st]}`);
		// same visible-punch rule as stat stages: the ailment tag pops on the sprite
		this.float(this.sideOfMon(target), st.toUpperCase(), '#e0b36b');
		this.pushMsg('', () => this.checkBerry(target, target === this.active?.me ? 'me' : 'foe'));
		if (source && this.abilityOf(target) === 'synchronize' && ['brn', 'psn', 'par'].includes(st)) {
			this.pushMsg(`${target.name}'s Synchronize passed it back!`, () => {});
			this.applyStatus(source, st, bad, null);
		}
		return true;
	}

	applyConfusion(target) {
		if (this.abilityOf(target) === 'owntempo') { this.pushMsg(`${target.name}'s Own Tempo prevents confusion!`); return; }
		if (target.confuseTurns > 0) { this.pushMsg('But it failed!'); return; }
		target.confuseTurns = 2 + Math.floor(Math.random() * 4);
		this.pushMsg(`${target.name} became confused!`);
		this.pushMsg('', () => this.checkBerry(target, target === this.active?.me ? 'me' : 'foe'));
	}

	// stats/types/ability are saved with the mon, so in-battle mutations
	// (Transform, Trace, Power Trick, Soak, Skill Swap, ...) must snapshot the
	// originals first; clearVolatiles restores them when the mon leaves battle
	snapStats(mon) { if (!mon._origStats) mon._origStats = { ...mon.stats }; }
	snapTypes(mon) { if (!mon._origTypes) mon._origTypes = [...mon.types]; }
	snapAbility(mon) { if (!('_origAbility' in mon)) mon._origAbility = mon.ability; }

	// battle-only conditions never leak into the save
	clearVolatiles(mon, curing) {
		if (curing && this.abilityOf(mon) === 'naturalcure' && mon.status) mon.status = null;
		if (curing && this.abilityOf(mon) === 'regenerator' && mon.curHP > 0) {
			mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.floor(mon.maxHP / 3));
		}
		delete mon.confuseTurns;
		delete mon.lastTaken;
		delete mon.usedMoves;          // Last Resort re-arms on a switch, as it should
		delete mon.lockMove; delete mon.lockTurns; delete mon.rampN; delete mon.rampMove; delete mon.vanished;
		delete mon.movedThisTurn;
		delete mon.tookDamageThisTurn;
		delete mon.bideDmg;
		delete mon.healBlockTurns;
		delete mon.electrified;
		delete mon.imprisoning;
		delete mon.grudged;
		delete mon.exitUsed;
		delete mon.seeded;
		delete mon.badPsn;
		delete mon.toxicN;
		delete mon.chargeMove;
		delete mon.rechargeTurn;
		delete mon.trapTurns;
		delete mon.trapName;
		delete mon.drowsy;
		delete mon.aquaRing;
		delete mon.protectN;
		delete mon.protectedTurn;
		delete mon.subHP;
		delete mon.attracted;
		delete mon.focusEnergy;
		delete mon.embargoTurns;
		delete mon.laserFocus;
		delete mon.lockOn;
		delete mon.foresight;
		delete mon.nightmared;
		delete mon.perishN;
		delete mon.destinyBond;
		delete mon.disabledMove;
		delete mon.disableTurns;
		delete mon.encoreMove;
		delete mon.encoreTurns;
		delete mon.tauntTurns;
		delete mon.tormented;
		delete mon.noSwitch;
		delete mon.magnetRise;
		delete mon.telekinesis;
		delete mon.stockN;
		delete mon.chargedUp;
		delete mon.enduring;
		delete mon.abilitySuppressed;
		delete mon.flashFired;
		delete mon.loafed;
		delete mon.slowStartT;
		delete mon.disguiseBroken;
		delete mon.unburdened;
		delete mon.choiceLock;
		delete mon.faintCounted;
		if (mon.mimicSlot) {
			mon.moves[mon.mimicSlot.idx] = mon.mimicSlot.orig;
			delete mon.mimicSlot;
		}
		if (mon.transformedMoves) {
			mon.moves = mon.transformedMoves;
			delete mon.transformedMoves;
		}
		if (mon._origStats) { mon.stats = mon._origStats; delete mon._origStats; }
		if (mon._origTypes) { mon.types = mon._origTypes; delete mon._origTypes; }
		if ('_origAbility' in mon) { mon.ability = mon._origAbility; delete mon._origAbility; }
		delete mon.acted;
		mon.flinched = false;
	}

	// returns false if the user cannot act this turn (sleep/freeze/para/flinch/confusion)
	beforeMove(user, userBoosts, isFoe, move) {
		if (user.flinched) {
			user.flinched = false;
			this.pushMsg(`${user.name} flinched and couldn't move!`);
			return false;
		}
		if (user.rechargeTurn) {
			user.rechargeTurn = false;
			this.pushMsg(`${user.name} must recharge!`);
			return false;
		}
		if (this.abilityOf(user) === 'truant') {
			if (user.loafed) {
				user.loafed = false;
				this.pushMsg(`${user.name} is loafing around!`);
				return false;
			}
			user.loafed = true;
		}
		// sleep and freeze resolve before confusion/attract so a sleeping mon
		// can't burn confusion turns or hurt itself
		if (user.status === 'slp') {
			// EARLY BIRD burns sleep at double rate (was inert: 16 species)
			if (this.abilityOf(user) === 'earlybird') user.sleepTurns--;
			if (--user.sleepTurns <= 0) {
				user.status = null;
				this.pushMsg(`${user.name} woke up!`);
			} else {
				this.pushMsg(`${user.name} is fast asleep.`);
				// Sleep Talk (and Snore) still work while sleeping
				if (move?.id === 'sleeptalk' || move?.id === 'snore') return true;
				return false;
			}
		}
		if (user.status === 'frz') {
			if (Math.random() < 0.2) {
				user.status = null;
				this.pushMsg(`${user.name} thawed out!`);
			} else {
				this.pushMsg(`${user.name} is frozen solid!`);
				return false;
			}
		}
		if (user.confuseTurns > 0) {
			user.confuseTurns--;
			if (user.confuseTurns <= 0) {
				this.pushMsg(`${user.name} snapped out of its confusion!`);
			} else {
				this.pushMsg(`${user.name} is confused!`);
				if (Math.random() < 0.5) {
					// 40-power typeless self-hit off its own attack and defense
					const A = this.statOf(user, userBoosts || freshBoosts(), 'atk');
					const D = this.statOf(user, userBoosts || freshBoosts(), 'def');
					let dmg = Math.floor(Math.floor(Math.floor(2 * user.level / 5 + 2) * 40 * A / D) / 50) + 2;
					dmg = Math.max(1, Math.floor(dmg * (0.85 + Math.random() * 0.15)));
					this.pushMsg('It hurt itself in its confusion!', () => {
						sfx('hit_normal');
						user.curHP = Math.max(0, user.curHP - dmg);
						this.float(isFoe ? 'foe' : 'me', `-${dmg}`, '#ff7a6b');
					});
					return false;
				}
			}
		}
		if (user.attracted && Math.random() < 0.5) {
			this.pushMsg(`${user.name} is immobilized by love!`);
			return false;
		}
		if (user.status === 'par' && Math.random() < 0.25) {
			this.pushMsg(`${user.name} is fully paralyzed!`);
			return false;
		}
		return true;
	}

	useMove(user, userBoosts, target, targetBoosts, move, isFoe, opts = {}) {
		const a = this.active;
		let mv = this.data.moves[move.id] || {}; // -ate abilities reassign the type
		const fx = MOVE_FX[move.id] || {};
		// a move CALLED by Metronome/Copycat/Sleep Talk/etc. already passed the
		// caller's status checks — re-running them would block Sleep Talk outright
		// and double-roll paralysis/confusion
		if (!opts.called && !this.beforeMove(user, userBoosts, isFoe, move)) return;
		// Destiny Bond lasts until the user's next action; Fake Out only works
		// on the user's first action after entering the field
		user.destinyBond = fx.destinyBond ? user.destinyBond : false;
		user.grudged = fx.grudgeSelf ? user.grudged : false; // a grudge lasts until the next action
		const firstAction = !user.acted;
		user.acted = true;
		user.movedThisTurn = true;                      // Payback
		(user.usedMoves ||= []).push(move.id);          // Last Resort
		// STANCE CHANGE: Aegislash draws its blade for any attack, sheathes it on
		// King's Shield. Done up-front so the Blade Forme's stats apply to THIS move.
		if (this.abilityOf(user) === 'stancechange') {
			const cur = user.form || user.speciesId;
			if (move.id === 'kingsshield' && cur === 'aegislash_blade') {
				this.changeForm(user, 'aegislash', this.sideOfMon(user), `${user.name} returned to Shield Forme!`);
			} else if (move.id !== 'kingsshield' && (mv.category && mv.category !== 'Status') && cur === 'aegislash') {
				this.changeForm(user, 'aegislash_blade', this.sideOfMon(user), `${user.name} drew its blade! (Blade Forme)`);
			}
		}
		// DANCER: the other side's dancer copies any dance move right after it
		// resolves (queued behind the original; a copied dance never re-triggers)
		if (!opts.called && !a.double && /dance$/.test(move.id)) {
			const other = isFoe ? a.me : a.foe;
			if (other && other.curHP > 0 && this.abilityOf(other) === 'dancer') {
				this.pushMsg('', () => {
					if (other.curHP <= 0 || a.phase === 'done') return;
					this.pushMsg(`${other.name} danced along! (Dancer)`);
					const tgt = isFoe ? a.foe : a.me;
					this.useMove(other, this.boostsOf(other), tgt, this.boostsOf(tgt),
						{ id: move.id, name: move.name, pp: 1, maxPp: 1 }, !isFoe, { called: true });
				});
			}
		}
		if (fx.firstTurn && !firstAction) { this.pushMsg(`${user.name} used ${move.name}!`); this.pushMsg('But it failed!'); return; }
		move.pp = Math.max(0, move.pp - 1);
		// two-turn moves spend their first turn charging (PP refunded: one use, one PP)
		if (fx.chargeText && !user.chargeMove && !(move.id === 'solarbeam' && a.weather?.kind === 'sun')) {
			user.chargeMove = move.id;
			// FLY / DIG / DIVE / BOUNCE / PHANTOM FORCE are UNTARGETABLE while charging.
			// chargeMove was written and read for turn bookkeeping but never consulted
			// in the targeting path, so a charge turn just handed the foe a free hit.
			if (VANISH_MOVES.has(move.id) || fx.vanish) user.vanished = move.id;
			if (move.id === 'bide') user.bideDmg = 0;
			move.pp = Math.min(move.maxPp, move.pp + 1);
			this.pushMsg(`${user.name} ${fx.chargeText}`);
			return;
		}
		if (user.chargeMove === move.id) { user.chargeMove = null; user.vanished = null; }
		if (fx.delayed) {
			const sideKey = isFoe ? 'meFuture' : 'foeFuture';   // it lands on the TARGET's side
			if (a[sideKey]) { this.pushMsg('But it failed!'); return; }
			a[sideKey] = { move: move.id, name: move.name, turns: fx.delayed, user, level: user.level };
			this.pushMsg(`${user.name} foresaw an attack!`);
			return;
		}
		// LOCK-IN: begin a 2-3 turn rampage, or count down one already running
		if (fx.lockIn) {
			if (!user.lockMove) { user.lockMove = move.id; user.lockTurns = 1 + Math.floor(Math.random() * 2); }
		}
		// RAMP: consecutive uses of the same ramping move stack; anything else resets
		const RAMPING = ['rollout', 'iceball', 'furycutter'];
		if (RAMPING.includes(move.id)) {
			user.rampN = user.rampMove === move.id ? (user.rampN || 0) + 1 : 0;
			user.rampMove = move.id;
		} else { user.rampN = 0; user.rampMove = null; }
		if (this.itemFx(user)?.choice || this.abilityOf(user) === 'gorillatactics') user.choiceLock = move.id;
		// Geomancy charges then boosts (a status move with a charge turn)
		if (fx.statusCharge) {
			const boosts = userBoosts;
			for (const [st, d] of Object.entries(fx.selfBoost)) {
				boosts[st] = Math.max(-6, Math.min(6, (boosts[st] || 0) + d));
			}
			this.pushMsg(`${user.name}'s stats rose sharply!`);
			return;
		}
		// protect's streak resets whenever anything else is used
		if (!fx.protect) user.protectN = 0;
		this.pushMsg(`${user.name} used ${move.name}!`);
		a.lastMoveId = move.id;
		a.lastMove[isFoe ? 'foe' : 'me'] = move.id;

		// Protect/Detect blocks anything aimed at the protected side
		const aimsAtFoe = mv.category !== 'Status'
			|| !!(fx.status || fx.confuse || fx.seed || fx.yawn || fx.blow || STAT_MOVES[move.id]?.foe);
		// UNSEEN FIST punches straight through a Protect on contact
		if (aimsAtFoe && target.protectedTurn && !fx.breaksProtect
			&& !(this.abilityOf(user) === 'unseenfist' && mv.category === 'Physical')) {
			this.pushMsg(`${target.name} protected itself!`);
			return;
		}
		// the SIDE guards: QUICK GUARD walls priority, WIDE GUARD walls spread —
		// per side and per turn, which personal Protect never modelled
		if (aimsAtFoe && user !== target) {
			const tSide = this.sideOfMon(target) === 'me' ? a.meSide : a.foeSide;
			if ((tSide.quickGuard && this.movePriority(user, move) > 0)
				|| (tSide.wideGuard && opts?.spread)) {
				this.pushMsg(`${target.name} was protected by the guard!`);
				return;
			}
		}
		// --- ability gates that stop a move landing at all (all were inert) ---
		const defAb = this.abilityOf(target);
		// DAZZLING / QUEENLY MAJESTY / ARMOR TAIL refuse priority moves
		if (aimsAtFoe && (mv.priority || 0) > 0
			&& ['dazzling', 'queenlymajesty', 'armortail'].includes(defAb)) {
			this.pushMsg(`${target.name}'s ${this.abilityName(defAb)} blocked the move!`);
			return;
		}
		// WIND RIDER rides the gust instead of taking it
		if (aimsAtFoe && defAb === 'windrider' && WIND_MOVES.has(move.id)) {
			const wb = isFoe ? a.meBoosts : a.foeBoosts;
			wb.atk = Math.min(6, (wb.atk || 0) + 1);
			this.pushMsg(`${target.name} rode the wind — its Attack rose!`);
			return;
		}
		// GOOD AS GOLD shrugs off status moves entirely
		if (aimsAtFoe && mv.category === 'Status' && defAb === 'goodasgold') {
			this.pushMsg(`${target.name}'s GOOD AS GOLD blocked it!`);
			return;
		}
		// MAGIC BOUNCE / REBOUND send a status move straight back. MYCELIUM MIGHT
		// is the counter to that whole family, so it is checked first.
		if (aimsAtFoe && mv.category === 'Status' && this.abilityOf(user) !== 'myceliummight'
			&& (defAb === 'magicbounce' || defAb === 'rebound') && !opts.bounced) {
			this.pushMsg(`${target.name} bounced the move back!`, () => {
				this.useMove(target, targetBoosts, user, userBoosts, move, !isFoe, { bounced: true });
			});
			return;
		}
		// a substitute soaks status tricks aimed through it (sound bypasses)
		if (aimsAtFoe && mv.category === 'Status' && target.subHP > 0 && !SOUND_MOVES.has(move.id)) {
			this.pushMsg('But it failed!');
			return;
		}
		// Safeguard blocks statuses, Mist blocks stat drops, from the foe's side
		const targetSide2 = isFoe ? a.meSide : a.foeSide;
		if ((fx.status || fx.confuse || fx.yawn) && targetSide2?.safeguard > 0) {
			this.pushMsg(`${target.name} is protected by Safeguard!`);
			return;
		}
		if (STAT_MOVES[move.id]?.foe && targetSide2?.mist > 0) {
			this.pushMsg(`${target.name} is protected by the mist!`);
			return;
		}

		let hitChance = (mv.acc ?? 100) * stageMult((userBoosts.acc || 0) - (targetBoosts.eva || 0));
		if (a.fieldFx.gravity > 0) hitChance *= 5 / 3;
		const uAbAcc = this.abilityOf(user), tAbAcc = this.abilityOf(target);
		if (uAbAcc === 'compoundeyes') hitChance *= 1.3;
		if (uAbAcc === 'victorystar') hitChance *= 1.1;
		if (uAbAcc === 'hustle' && mv.category === 'Physical') hitChance *= 0.8;
		if (tAbAcc === 'sandveil' && this.weatherKind() === 'sand') hitChance *= 0.8;
		if (tAbAcc === 'snowcloak' && this.weatherKind() === 'hail') hitChance *= 0.8;
		if (tAbAcc === 'tangledfeet' && target.confuseTurns > 0) hitChance *= 0.5;
		if (tAbAcc === 'wonderskin' && mv.category === 'Status' && (mv.acc ?? 100) !== true) hitChance = Math.min(hitChance, 50);
		if (this.itemFx(user)?.accBoost) hitChance *= this.itemFx(user).accBoost;
		if (this.itemFx(target)?.evade) hitChance *= this.itemFx(target).evade;
		// weather rewrites some moves' accuracy outright
		const wkAcc = this.weatherKind();
		if (move.id === 'thunder' || move.id === 'hurricane') {
			if (wkAcc === 'rain') hitChance = 999;
			else if (wkAcc === 'sun') hitChance = Math.min(hitChance, 50);
		}
		if (move.id === 'blizzard' && wkAcc === 'hail') hitChance = 999;
		if (uAbAcc === 'noguard' || tAbAcc === 'noguard') hitChance = 999;
		const sureHit = user.lockOn || target.telekinesis > 0;
		if (user.lockOn) user.lockOn = false;
		// A target mid-charge is out of reach. Each hiding place has its own short
		// list of moves that can still reach it, which is the whole point of Dig
		// vs Earthquake. No-Guard and Lock-On still connect.
		if (aimsAtFoe && target.vanished && !sureHit && uAbAcc !== 'noguard') {
			if (!(VANISH_REACH[target.vanished] || []).includes(move.id)) {
				this.pushMsg(`${user.name}'s attack missed ${target.name}!`);
				return;
			}
		}
		if (!sureHit && (mv.acc ?? 100) !== true && aimsAtFoe && Math.random() * 100 > hitChance) {
			user.rampN = 0; user.rampMove = null;   // a miss breaks the Rollout chain
			this.pushMsg(`${user.name}'s attack missed!`);
			return;
		}
		if (mv.category === 'Status') {
			// status archetype: HEAL and self-BOOST glow on the caster, a move
			// aimed at the foe washes over them as a DEBUFF
			const sArch = fx.heal ? 'heal' : aimsAtFoe ? 'debuff' : 'boost';
			this.pushAnim(sArch, sArch === 'debuff' ? targetSideOf(isFoe) : (isFoe ? 'foe' : 'me'), 0.45, null,
				{ color: UI.TYPE_COLORS[mv.type] || '#e8e8e8', slot: this.slotOfMon(sArch === 'debuff' ? target : user) });
			if (fx.heal) {
				if (user.healBlockTurns > 0) { this.pushMsg(`${user.name} can't heal — Heal Block!`); return; }
				if (user.curHP >= user.maxHP) { this.pushMsg('But it failed!'); return; }
				const amt = Math.floor(user.maxHP * fx.heal);
				this.pushMsg(`${user.name} regained health!`, () => {
					user.curHP = Math.min(user.maxHP, user.curHP + amt);
					this.float(isFoe ? 'foe' : 'me', `+${amt}`, '#6be08a');
				});
				if (fx.selfStatus === 'slp') {
					user.status = 'slp';
					user.sleepTurns = 2;
					this.pushMsg(`${user.name} went to sleep!`);
				}
				return;
			}
			if (fx.status) {
				// typed status moves respect type immunity (Thunder Wave vs Ground)
				if (mv.type && effectiveness(mv.type, target.types) === 0) {
					this.pushMsg(`It doesn't affect ${target.name}...`);
					return;
				}
				// Toxic Thread-style riders: a stat change alongside the status
				if (fx.foeBoost) {
					const words = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
					for (const [st, d] of Object.entries(fx.foeBoost)) {
						targetBoosts[st] = Math.max(-6, Math.min(6, (targetBoosts[st] || 0) + d));
						this.pushMsg(`${target.name}'s ${words[st] || st} ${d > 0 ? 'rose' : 'fell'}!`);
					}
				}
				this.applyStatus(target, fx.status, fx.bad, user);
				return;
			}
			if (fx.confuse) {
				// Swagger/Flatter pump the target's stat before confusing it
				if (fx.foeBoost) {
					for (const [st, d] of Object.entries(fx.foeBoost)) {
						targetBoosts[st] = Math.max(-6, Math.min(6, (targetBoosts[st] || 0) + d));
					}
					this.pushMsg(`${target.name}'s ${Object.keys(fx.foeBoost)[0] === 'atk' ? 'Attack' : 'Sp. Atk'} rose sharply!`);
				}
				this.applyConfusion(target);
				return;
			}
			if (fx.sideGuard) {
				const side = this.sideOfMon(user) === 'me' ? a.meSide : a.foeSide;
				if (side[fx.sideGuard + 'Guard']) { this.pushMsg('But it failed!'); return; }
				side[fx.sideGuard + 'Guard'] = true;   // cleared at the top of every turn
				this.pushMsg(`${move.name} shielded ${user.name}'s side of the field!`);
				return;
			}
			if (fx.protect) {
				user.protectN = (user.protectN || 0) + 1;
				if (Math.random() < 1 / Math.pow(2, user.protectN - 1)) {
					user.protectedTurn = true;
					this.pushMsg(`${user.name} protected itself!`);
				} else {
					user.protectN = 0;
					this.pushMsg('But it failed!');
				}
				return;
			}
			if (fx.yawn) {
				if (target.status || target.drowsy) { this.pushMsg('But it failed!'); return; }
				target.drowsy = 2;
				this.pushMsg(`${target.name} grew drowsy!`);
				return;
			}
			if (fx.haze) {
				Object.assign(userBoosts, freshBoosts());
				Object.assign(targetBoosts, freshBoosts());
				this.pushMsg('All stat changes were eliminated!');
				return;
			}
			if (fx.blow) {
				if (a.isTrainer) { this.pushMsg('But it failed!'); return; }
				this.pushMsg(`${isFoe ? a.me.name : a.foe.name} was blown away!`, () => { sfx('flee'); this.finish('escaped'); });
				return;
			}
			if (fx.cureParty) {
				const mons = isFoe ? [a.foe] : a.party;
				this.pushMsg('A bell chimed — status problems were healed!', () => {
					for (const m of mons) { m.status = null; m.sleepTurns = 0; delete m.badPsn; delete m.toxicN; }
				});
				return;
			}
			if (fx.cureSelf) {
				if (!user.status) { this.pushMsg('But it failed!'); return; }
				this.pushMsg(`${user.name} shook off its status problem!`, () => {
					user.status = null; delete user.badPsn; delete user.toxicN;
				});
				return;
			}
			if (fx.regen) {
				if (user.aquaRing) { this.pushMsg('But it failed!'); return; }
				user.aquaRing = true;
				this.pushMsg(`${user.name} surrounded itself with restoring energy!`);
				return;
			}
			if (fx.bellydrum) {
				const cost = Math.floor(user.maxHP / 2);
				if (user.curHP <= cost) { this.pushMsg('But it failed!'); return; }
				this.pushMsg(`${user.name} cut its own HP and maximized its Attack!`, () => {
					user.curHP -= cost;
					this.float(isFoe ? 'foe' : 'me', `-${cost}`, '#ff7a6b');
					userBoosts.atk = 6;
				});
				return;
			}
			if (fx.painsplit) {
				this.pushMsg('The battlers shared their pain!', () => {
					const avg = Math.max(1, Math.floor((user.curHP + target.curHP) / 2));
					user.curHP = Math.min(user.maxHP, avg);
					target.curHP = Math.min(target.maxHP, avg);
				});
				return;
			}
			if (fx.seed) {
				if (target.types.includes('Grass')) { this.pushMsg(`It doesn't affect ${target.name}...`); return; }
				if (target.seeded) { this.pushMsg('But it failed!'); return; }
				target.seeded = true;
				this.pushMsg(`${target.name} was seeded!`);
				return;
			}
			if (fx.screen) {
				const side = isFoe ? a.foeScreens : a.meScreens;
				if (fx.screen === 'both') {
					if (side.reflect > 0 && side.light > 0) { this.pushMsg('But it failed!'); return; }
					side.reflect = Math.max(side.reflect || 0, 5);
					side.light = Math.max(side.light || 0, 5);
					this.pushMsg(`${user.name} is protected by Aurora Veil!`);
					return;
				}
				if (side[fx.screen] > 0) { this.pushMsg('But it failed!'); return; }
				side[fx.screen] = this.itemFx(user)?.screens8 ? 8 : 5;
				this.pushMsg(fx.screen === 'reflect'
					? `${user.name} is protected by Reflect!`
					: `${user.name} is protected by Light Screen!`);
				return;
			}
			if (fx.attract) {
				if (this.abilityOf(target) === 'oblivious') { this.pushMsg(`${target.name}'s Oblivious blocks it!`); return; }
				if (!user.gender || !target.gender || user.gender === target.gender || target.attracted) {
					this.pushMsg('But it failed!');
					return;
				}
				target.attracted = true;
				this.pushMsg(`${target.name} fell in love!`);
				return;
			}
			if (this.statusFx(fx, user, userBoosts, target, targetBoosts, move, isFoe)) return;
			const eff = STAT_MOVES[move.id];
			if (eff) {
				const boosts = eff.foe ? targetBoosts : userBoosts;
				const who = eff.foe ? target : user;
				const whoAb = this.abilityOf(who);
				let changes = eff.stats || { [eff.stat]: eff.d };
				if (whoAb === 'contrary') changes = Object.fromEntries(Object.entries(changes).map(([s2, d2]) => [s2, -d2]));
				if (whoAb === 'simple') changes = Object.fromEntries(Object.entries(changes).map(([s2, d2]) => [s2, d2 * 2]));
				if (eff.foe) {
					changes = Object.fromEntries(Object.entries(changes).filter(([st, d]) => d >= 0 || this.canLowerStat(target, st)));
					if (!Object.keys(changes).length) {
						this.pushMsg(`${target.name}'s ability protects its stats!`);
						return;
					}
				}
				const words = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', acc: 'accuracy', eva: 'evasiveness' };
				let any = false;
				for (const [st, d] of Object.entries(changes)) {
					const before = boosts[st] ?? 0;
					boosts[st] = Math.max(-6, Math.min(6, before + d));
					if (boosts[st] === before) continue;
					any = true;
					const dirWord = d > 0 ? (d > 1 ? 'rose sharply' : 'rose') : (d < -1 ? 'fell harshly' : 'fell');
					this.pushMsg(`${who.name}'s ${words[st]} ${dirWord}!`);
					// visible punch, same rule as the doubles/self path: the arrow pops
					// on the sprite so a buff/debuff turn doesn't read as nothing
					const arrows = { atk: 'ATK', def: 'DEF', spa: 'SP.A', spd: 'SP.D', spe: 'SPE', acc: 'ACC', eva: 'EVA' };
					sfx(d > 0 ? 'stat_up' : 'stat_dn');
					this.float(this.sideOfMon(who), `${arrows[st] || st}${d > 0 ? '↑' : '↓'}${Math.abs(d) > 1 ? Math.abs(d) : ''}`,
						d > 0 ? '#6be08a' : '#e0736b');
				}
				if (!any) this.pushMsg('But it failed!');
				// Defiant / Competitive punish foe-inflicted drops
				if (any && eff.foe) {
					const dAb2 = this.abilityOf(target);
					if (dAb2 === 'defiant' || dAb2 === 'competitive') {
						const key = dAb2 === 'defiant' ? 'atk' : 'spa';
						boosts[key] = Math.min(6, (boosts[key] || 0) + 2);
						this.pushMsg(`${target.name}'s ${this.abilityName(dAb2)} sharply raised its ${key === 'atk' ? 'Attack' : 'Sp. Atk'}!`);
					}
				}
				// OPPORTUNIST: the other side mirrors the SELF-boost as it lands
				// (the singles stat-move path — the fx path mirrors in applyBoosts)
				if (any && !eff.foe && !a.double) {
					const watcher = who === a.me ? a.foe : a.me;
					const wBoosts = targetBoosts; // the self-booster's opponent, both directions
					if (watcher && watcher.curHP > 0 && this.abilityOf(watcher) === 'opportunist') {
						this.pushMsg(`${watcher.name}'s Opportunist copies the boost!`);
						for (const [st, d] of Object.entries(changes)) {
							if (d > 0) wBoosts[st] = Math.max(-6, Math.min(6, (wBoosts[st] || 0) + d));
						}
					}
				}
			} else {
				this.pushMsg('But nothing happened!');
			}
			return;
		}
		// damage
		const uAb = this.abilityOf(user);
		// Mold Breaker pierces the defender's ability entirely
		const tAb = ['moldbreaker', 'teravolt', 'turboblaze'].includes(uAb) ? null : this.abilityOf(target);
		// -ate abilities turn Normal moves into their element
		// ELECTRIFY charged this user; ION DELUGE electrifies every Normal move
		// this turn — both apply before the -ate abilities can see the type
		if (user.electrified && mv.type !== 'Electric') mv = { ...mv, type: 'Electric' };
		else if ((a.fieldFx?.ionDeluge || 0) > 0 && mv.type === 'Normal') mv = { ...mv, type: 'Electric' };
		if (AB_ATE[uAb] && mv.type === 'Normal') mv = { ...mv, type: AB_ATE[uAb], atePower: true };
		// PROTEAN / LIBERO retype the user to whatever it is about to throw
		if ((uAb === 'protean' || uAb === 'libero') && mv.type && !user.types.includes(mv.type)) {
			this.snapTypes(user);
			user.types = [mv.type];
			this.pushMsg(`${user.name} became ${mv.type}-type!`);
		}
		const phys = mv.category === 'Physical';
		// Unaware ignores the other side's stat stages
		const aBoosts = tAb === 'unaware' ? freshBoosts() : userBoosts;
		const dBoosts = uAb === 'unaware' ? freshBoosts() : targetBoosts;
		let A = this.statOf(user, aBoosts, phys ? 'atk' : 'spa');
		// WONDER ROOM: while it holds, every hit is measured against the OTHER
		// defense (physical vs Sp. Def, special vs Defense)
		const wonderRoom = (a.fieldFx?.wonderRoom || 0) > 0;
		let D = this.statOf(target, dBoosts, phys === !wonderRoom ? 'def' : 'spd');
		if (phys && (uAb === 'hugepower' || uAb === 'purepower')) A *= 2;
		if (phys && uAb === 'hustle') A = Math.floor(A * 1.5);
		if (phys && tAb === 'marvelscale' && target.status) D = Math.floor(D * 1.5);
		// alt-stat damage: a few moves measure against a different stat than the
		// category implies. Applied AFTER the atk-modifying abilities above, so
		// e.g. Huge Power doesn't touch Body Press (it uses Defense, not Attack).
		if (move.id === 'bodypress') A = this.statOf(user, aBoosts, 'def');            // uses the USER's Defense
		else if (move.id === 'foulplay') A = this.statOf(target, dBoosts, 'atk');       // uses the TARGET's Attack
		if (move.id === 'psyshock' || move.id === 'psystrike' || move.id === 'secretsword') {
			D = this.statOf(target, dBoosts, 'def');                                    // Special move that hits Defense
		}
		// state-dependent power (Gyro Ball, Flail, Hex, Weather Ball, ...)
		const L = user.level;
		let Pw = mv.power || 0;
		if (POWER_FX[move.id]) Pw = POWER_FX[move.id](this, user, target, userBoosts, targetBoosts, move);
		if (move.id === 'weatherball' && WEATHERBALL_TYPE[this.weatherKind()]) {
			mv = { ...mv, type: WEATHERBALL_TYPE[this.weatherKind()] };
		}
		// HIDDEN POWER's type comes from the user's IVs. Without this it stayed
		// Normal for all 845 species that can be taught it — never STAB, never
		// coverage, strictly worse than filler. The gen-3 formula, unchanged.
		if (move.id === 'hiddenpower') mv = { ...mv, type: hiddenPowerType(user) };
		// move-retyping abilities (all inert): LIQUID VOICE makes sound moves Water,
		// ENERGIZATE turns Normal moves Electric and powers them up slightly
		if (uAb === 'liquidvoice' && SOUND_MOVES.has(move.id)) mv = { ...mv, type: 'Water' };
		if (uAb === 'energizate' && mv.type === 'Normal') mv = { ...mv, type: 'Electric' };
		// Present: usually a 40/80/120 bomb, sometimes a healing gift
		if (move.id === 'present') {
			if (Math.random() < 0.2) {
				this.pushMsg(`${target.name} received a gift!`, () => {
					const healed = Math.max(1, Math.floor(target.maxHP / 4));
					target.curHP = Math.min(target.maxHP, target.curHP + healed);
					this.float(isFoe ? 'me' : 'foe', `+${healed}`, '#6be08a');
				});
				return;
			}
			const r = Math.random();
			Pw = r < 0.5 ? 40 : r < 0.875 ? 80 : 120;
		}
		if (Pw <= 0 && !fx.fixed && !fx.ohko) { this.pushMsg('But nothing happened!'); return; }
		// the flung/gifted item is spent once the move is definitely happening
		if (move.id === 'fling') {
			this.pushMsg(`${user.name} flung its ${this.itemName(user)}!`);
			this.consumeItem(user);
		}
		if (move.id === 'naturalgift') {
			mv = { ...mv, type: NATURAL_GIFT[user.heldItem] || 'Normal' };
			this.consumeItem(user);
		}
		// absorbing / immune abilities take the hit instead
		if (tAb === 'levitate' && mv.type === 'Ground') { this.pushMsg(`${target.name} floats with Levitate!`); return; }
		const absorb = AB_ABSORB[tAb];
		if (absorb && mv.type === absorb.t) {
			this.pushMsg(`${target.name}'s ${this.abilityName(tAb)} absorbed it!`, () => {
				if (absorb.heal) target.curHP = Math.min(target.maxHP, target.curHP + Math.floor(target.maxHP / 4));
				if (absorb.boost) {
					const tb = isFoe ? a.meBoosts : a.foeBoosts;
					tb[absorb.boost[0]] = Math.min(6, (tb[absorb.boost[0]] || 0) + absorb.boost[1]);
				}
			});
			return;
		}
		if (tAb === 'bulletproof' && BULLET_MOVES.has(move.id)) { this.pushMsg(`${target.name}'s Bulletproof blocks it!`); return; }
		if (tAb === 'overcoat' && POWDER_MOVES.has(move.id)) { this.pushMsg(`${target.name}'s Overcoat blocks it!`); return; }
		if (tAb === 'flashfire' && mv.type === 'Fire') {
			target.flashFired = true;
			this.pushMsg(`${target.name}'s Flash Fire drank the flames!`);
			return;
		}
		if (tAb === 'soundproof' && SOUND_MOVES.has(move.id)) {
			this.pushMsg(`${target.name}'s Soundproof blocks it!`);
			return;
		}
		if (fx.selfKO && (uAb === 'damp' || tAb === 'damp')) { this.pushMsg('The Damp ability prevents explosions!'); return; }
		if (fx.ohko && tAb === 'sturdy') { this.pushMsg(`${target.name}'s Sturdy blocks one-hit KOs!`); return; }
		let eff = effectiveness(mv.type, target.types);
		if (eff === 0 && target.foresight) eff = 1;
		if (eff === 0 && uAb === 'scrappy' && (mv.type === 'Normal' || mv.type === 'Fighting')
			&& target.types.includes('Ghost')) eff = effectiveness(mv.type, target.types.filter(t => t !== 'Ghost'));
		if (eff === 0) { this.pushMsg(`It doesn't affect ${target.name}...`); return; }
		if (tAb === 'wonderguard' && eff <= 1) { this.pushMsg(`${target.name}'s Wonder Guard blocks it!`); return; }
		const stab = user.types.includes(mv.type) ? 1.5 : 1;
		const nHits = fx.hits ? (uAb === 'skilllink' ? fx.hits[1] : fx.hits[0] + Math.floor(Math.random() * (fx.hits[1] - fx.hits[0] + 1))) : 1;
		// Reflect / Light Screen on the defender's side halves the matching category
		const defScreens = isFoe ? a.meScreens : a.foeScreens;
		const screened = uAb === 'infiltrator' ? 1 : (defScreens?.[phys ? 'reflect' : 'light'] > 0 ? 0.5 : 1);
		// weather, terrain, and sport effects scale the elements
		let envMult = 1;
		const wk = a.weather?.kind;
		if (wk === 'rain') envMult *= mv.type === 'Water' ? 1.5 : mv.type === 'Fire' ? 0.5 : 1;
		if (wk === 'sun') envMult *= mv.type === 'Fire' ? 1.5 : mv.type === 'Water' ? 0.5 : 1;
		const tk = a.terrain?.kind;
		if (tk === 'electric' && mv.type === 'Electric') envMult *= 1.3;
		if (tk === 'grassy' && mv.type === 'Grass') envMult *= 1.3;
		if (tk === 'psychic' && mv.type === 'Psychic') envMult *= 1.3;
		if (tk === 'misty' && mv.type === 'Dragon') envMult *= 0.5;
		if (a.fieldFx.mudSport > 0 && mv.type === 'Electric') envMult *= 0.5;
		if (a.fieldFx.waterSport > 0 && mv.type === 'Fire') envMult *= 0.5;
		if (user.chargedUp && mv.type === 'Electric') { envMult *= 2; user.chargedUp = false; }
		// ability multipliers on the element and power
		const pinch = { overgrow: 'Grass', blaze: 'Fire', torrent: 'Water', swarm: 'Bug' };
		if (pinch[uAb] === mv.type && user.curHP <= Math.floor(user.maxHP / 3)) envMult *= 1.5;
		if (uAb === 'technician' && Pw <= 60) envMult *= 1.5;
		if (user.flashFired && mv.type === 'Fire') envMult *= 1.5;
		if (AB_TYPE_BOOST[uAb] === mv.type) envMult *= 1.5;
		if (mv.atePower) envMult *= 1.2;
		if (uAb === 'ironfist' && PUNCH_MOVES.has(move.id)) envMult *= 1.2;
		if (uAb === 'strongjaw' && BITE_MOVES.has(move.id)) envMult *= 1.5;
		if (uAb === 'megalauncher' && PULSE_MOVES.has(move.id)) envMult *= 1.5;
		if (uAb === 'reckless' && fx.recoil) envMult *= 1.2;
		if (uAb === 'sheerforce' && fx.sec) envMult *= 1.3;
		if (uAb === 'toughclaws' && phys) envMult *= 1.3;
		if (uAb === 'punkrock' && SOUND_MOVES.has(move.id)) envMult *= 1.3;
		if (uAb === 'sandforce' && this.weatherKind() === 'sand'
			&& ['Rock', 'Ground', 'Steel'].includes(mv.type)) envMult *= 1.3;
		if (uAb === 'solarpower' && !phys && this.weatherKind() === 'sun') envMult *= 1.5;
		if (uAb === 'flareboost' && !phys && user.status === 'brn') envMult *= 1.5;
		if (uAb === 'toxicboost' && phys && user.status === 'psn') envMult *= 1.5;
		if (uAb === 'defeatist' && user.curHP <= user.maxHP / 2) envMult *= 0.5;
		if (uAb === 'waterbubble' && mv.type === 'Water') envMult *= 2;
		if (uAb === 'rivalry' && user.gender && target.gender) envMult *= user.gender === target.gender ? 1.25 : 0.75;
		if (user.slowStartT > 0 && phys) envMult *= 0.5;
		// defender-side reducers
		if (tAb === 'thickfat' && (mv.type === 'Fire' || mv.type === 'Ice')) envMult *= 0.5;
		if (tAb === 'dryskin' && mv.type === 'Fire') envMult *= 1.25;
		if (tAb === 'heatproof' && mv.type === 'Fire') envMult *= 0.5;
		if (tAb === 'waterbubble' && mv.type === 'Fire') envMult *= 0.5;
		if (tAb === 'furcoat' && phys) envMult *= 0.5;
		if (tAb === 'icescales' && !phys) envMult *= 0.5;
		if (tAb === 'fluffy') envMult *= (phys ? 0.5 : 1) * (mv.type === 'Fire' ? 2 : 1);
		if (tAb === 'punkrock' && SOUND_MOVES.has(move.id)) envMult *= 0.5;
		if ((tAb === 'multiscale' || tAb === 'shadowshield') && target.curHP === target.maxHP) envMult *= 0.5;
		if (['filter', 'solidrock', 'prismarmor'].includes(tAb) && eff > 1) envMult *= 0.75;
		if (uAb === 'tintedlens' && eff < 1) envMult *= 2;
		if (uAb === 'expertbelt' && false) envMult *= 1; // held item, not ability
		if (uAb === 'adaptability' && user.types.includes(mv.type)) envMult *= 4 / 3; // stab 1.5 -> 2
		// held items scale damage
		const uItem = this.itemFx(user), tItem = this.itemFx(target);
		if (uItem?.typeBoost === mv.type) envMult *= 1.2;
		if (uItem?.choice === 'atk' && phys) envMult *= 1.5;
		if (uItem?.choice === 'spa' && !phys) envMult *= 1.5;
		if (uItem?.lifeOrb) envMult *= 1.3;
		if (uItem?.expertBelt && eff > 1) envMult *= 1.2;
		if (uItem?.catBoost === mv.category) envMult *= 1.1;
		// a spread move hitting more than one target is weaker per target — the
		// doubles resolver used to call useMove once per victim at FULL power,
		// so Earthquake hit both foes for 100% each
		if (opts.spread) envMult *= 0.75;
		if (user.helpingHand) envMult *= 1.5;   // one-shot, cleared after this move
		// ANALYTIC rewards moving last (was inert: 18 species)
		if (uAb === 'analytic' && target.movedThisTurn) envMult *= 1.3;
		if (uAb === 'sharpness' && SLICING_MOVES.has(move.id)) envMult *= 1.5;
		if (uAb === 'stakeout' && target.justSwitchedIn) envMult *= 2;
		if (uAb === 'neuroforce' && eff > 1) envMult *= 1.25;
		if (uAb === 'steelyspirit' && mv.type === 'Steel') envMult *= 1.5;
		// SUPREME OVERLORD grows with the graveyard behind you
		if (uAb === 'supremeoverlord') {
			const fallen = (this.sideOfMon(user) === 'me' ? a.party : (a.foes || [])).filter(m => m && m.curHP <= 0).length;
			envMult *= 1 + 0.1 * Math.min(5, fallen);
		}
		// AURAS are field-wide: any mon on either side projects them, and AURA
		// BREAK inverts whatever is running
		const auras = this.actorMons().map(m => this.abilityOf(m));
		if ((mv.type === 'Fairy' && auras.includes('fairyaura')) || (mv.type === 'Dark' && auras.includes('darkaura'))) {
			envMult *= auras.includes('aurabreak') ? 0.75 : 4 / 3;
		}
		// the RUIN quartet each weaken one stat for everyone else on the field
		const ruin = this.actorMons().filter(m => m !== user).map(m => this.abilityOf(m));
		if (phys && ruin.includes('tabletsofruin')) envMult *= 0.75;      // everyone's Attack
		if (!phys && ruin.includes('vesselofruin')) envMult *= 0.75;      // everyone's Sp. Atk
		if (phys && this.abilityOf(user) !== 'swordofruin' && this.actorMons().some(m => this.abilityOf(m) === 'swordofruin')) envMult *= 1.25;
		if (!phys && this.abilityOf(user) !== 'beadsofruin' && this.actorMons().some(m => this.abilityOf(m) === 'beadsofruin')) envMult *= 1.25;
		// GORILLA TACTICS: Choice Band's power without the item (it locks below)
		if (uAb === 'gorillatactics' && phys) envMult *= 1.5;
		// doubles support: an ally's BATTERY / POWER SPOT amplifies you
		if (a.double) {
			const uAlly = user === a.me ? a.meAlly : user === a.meAlly ? a.me
				: user === a.foe ? a.foeAlly : user === a.foeAlly ? a.foe : null;
			const aAb = uAlly && uAlly.curHP > 0 ? this.abilityOf(uAlly) : null;
			if (aAb === 'battery' && !phys) envMult *= 1.3;
			if (aAb === 'powerspot') envMult *= 1.3;
		}
		// FRIEND GUARD softens damage from the target's ALLY (doubles; was inert: 11)
		if (a.double) {
			const tAlly = target === a.me ? a.meAlly : target === a.meAlly ? a.me
				: target === a.foe ? a.foeAlly : target === a.foeAlly ? a.foe : null;
			if (tAlly && tAlly.curHP > 0 && this.abilityOf(tAlly) === 'friendguard') envMult *= 0.75;
		}
		// crit odds: Focus Energy 1/4, Laser Focus certain, Lucky Chant none
		const critBlocked = (isFoe ? a.meSide : a.foeSide)?.luckychant > 0
			|| tAb === 'battlearmor' || tAb === 'shellarmor';
		let critChance = critBlocked ? 0 : user.laserFocus ? 1 : user.focusEnergy ? 0.25 : 1 / 16;
		// HIGH-CRIT and ALWAYS-CRIT moves existed nowhere in the engine, yet 532
		// species learn one by level-up. Scope Lens / Super Luck were also weaker
		// than intended because they only ever raised the base 1/16.
		if (!critBlocked && uAb === 'merciless' && (target.status === 'psn' || target.status === 'tox')) critChance = 1;
		else if (!critBlocked && ALWAYS_CRIT.has(move.id)) critChance = 1;
		else if (!critBlocked && HIGH_CRIT.has(move.id)) critChance = Math.max(critChance, 1 / 8);
		if (!critBlocked && uAb === 'superluck') critChance = Math.max(critChance, 1 / 8);
		if (!critBlocked && this.itemFx(user)?.critBoost) critChance = Math.max(critChance, 1 / 8);
		const critMult = uAb === 'sniper' ? 2.5 : 2;
		user.laserFocus = false;
		let total = 0, crits = 0;
		if (fx.ohko) {
			// one-hit KO: never works upward in level
			if (target.level > user.level) { this.pushMsg(`It doesn't affect ${target.name}...`); return; }
			total = target.curHP;
			this.pushMsg("It's a one-hit KO!");
		} else if (fx.fixed) {
			total = fx.fixed === 'level' ? user.level
				: fx.fixed === 'half' ? Math.max(1, Math.floor(target.curHP / 2))
				: fx.fixed === 'psywave' ? Math.max(1, Math.floor(user.level * (0.5 + Math.random())))
				: fx.fixed === 'endeavor' ? Math.max(0, target.curHP - user.curHP)
				: fx.fixed === 'userHP' ? user.curHP
				: fx.fixed === 'counter' ? (user.lastTaken?.phys ? user.lastTaken.amt * 2 : 0)
				: fx.fixed === 'mirrorcoat' ? (user.lastTaken && !user.lastTaken.phys ? user.lastTaken.amt * 2 : 0)
				: fx.fixed === 'metalburst' ? (user.lastTaken ? Math.floor(user.lastTaken.amt * 1.5) : 0)
				: fx.fixed === 'bide' ? (user.bideDmg || 0) * 2
				: fx.fixed;
			if (fx.fixed === 'bide') delete user.bideDmg;
			if (total <= 0) { this.pushMsg('But it failed!'); return; }
		} else {
			for (let h = 0; h < nHits; h++) {
				const crit = Math.random() < critChance;
				if (crit) crits++;
				let dmg = Math.floor(Math.floor(Math.floor(2 * L / 5 + 2) * Pw * A / D) / 50) + 2;
				dmg = Math.max(1, Math.floor(dmg * (crit ? critMult : 1) * stab * eff * screened * envMult * (0.85 + Math.random() * 0.15)));
				total += dmg;
			}
		}
		// whether this hit lands on a substitute is known now: the sub then soaks
		// the damage AND shields the mon behind it from secondaries/item theft
		const hitsSub = target.subHP > 0 && !SOUND_MOVES.has(move.id) && uAb !== 'infiltrator';
		total = Math.min(total, hitsSub ? target.subHP : target.curHP);
		const targetSide = isFoe ? 'me' : 'foe';
		const atkSide = isFoe ? 'foe' : 'me';
		const arch = animArchFor(move, mv);
		const acolor = UI.TYPE_COLORS[mv.type] || '#e8e8e8';
		// contact archetypes keep the classic lunge; ranged ones stay planted
		if (arch === 'strike' || arch === 'slash') {
			this.pushAnim('lunge', atkSide, 0.3, null, { slot: this.slotOfMon(user) });
		}
		if (arch !== 'strike') {
			this.pushAnim(arch, targetSide, arch === 'slash' ? 0.35 : 0.4, null,
				{ color: acolor, slot: this.slotOfMon(target), fromSide: atkSide, fromSlot: this.slotOfMon(user) });
		}
		this.pushAnim('hit', targetSide, 0.4, null, { color: acolor, slot: this.slotOfMon(target) });
		this.pushMsg('', () => {
			sfx(eff > 1 ? 'hit_super' : eff < 1 ? 'hit_weak' : 'hit_normal');
			if (this.abilityOf(target) === 'disguise' && !target.disguiseBroken) {
				target.disguiseBroken = true;
				this.pushMsg(`${target.name}'s disguise served as a decoy!`);
				return;
			}
			if (hitsSub) {
				target.subHP -= total;
				if (target.subHP <= 0) {
					target.subHP = 0;
					this.pushMsg(`${target.name}'s substitute faded!`);
				} else {
					this.pushMsg('The substitute took the hit!');
				}
				return;
			}
			let dealt = total;
			if (target.enduring && dealt >= target.curHP) {
				dealt = target.curHP - 1;
				this.pushMsg(`${target.name} endured the hit!`);
			}
			// Focus Sash: survive from full HP, consuming the sash
			if (this.itemFx(target)?.sash && target.curHP === target.maxHP && dealt >= target.curHP) {
				dealt = target.curHP - 1;
				this.consumeItem(target);
				this.pushMsg(`${target.name} hung on with its Focus Sash!`);
			}
			// FOCUS BAND: unlike the Sash it is not consumed and does not need full
			// HP — it is a 1-in-10 reprieve from any lethal hit.
			else if (this.itemFx(target)?.focusBand && dealt >= target.curHP && Math.random() < 0.1) {
				dealt = target.curHP - 1;
				this.pushMsg(`${target.name} hung on using its FOCUS BAND!`);
			}
			target.curHP = Math.max(0, target.curHP - dealt);
			this.lastWasCrit = crits > 0;   // test surface for the crit-tier suite
			this.float(targetSide, `-${dealt}`, crits ? '#ffd23f' : '#ff7a6b');
			// damage memory for Counter / Mirror Coat / Metal Burst / Bide
			// (substitute and disguise hits returned above and don't count)
			// no `from` ref: nothing reads it, and a live mon reference makes the
			// mon graph CIRCULAR — snapshot() and saveParty would throw on it
			target.lastTaken = { amt: dealt, phys, turn: a.turnCount || 0 };
			target.tookDamageThisTurn = true;   // Assurance
			if (target.bideDmg != null) target.bideDmg += dealt;
			// GRUDGE: felled while bearing one, the killing move loses all its PP
			if (target.curHP <= 0 && target.grudged && move && move.pp != null) {
				this.pushMsg(`${target.name}'s GRUDGE drained all the PP\nfrom ${move.name}!`, () => { move.pp = 0; });
			}
			// PERISH BODY: a physical hit dooms striker and struck alike
			if (phys && target.curHP > 0 && user.curHP > 0 && this.abilityOf(target) === 'perishbody'
				&& !(user.perishN > 0) && !(target.perishN > 0)) {
				user.perishN = 4; target.perishN = 4;
				this.pushMsg(`${target.name}'s Perish Body dooms them BOTH —\nthree turns to live!`);
			}
			// EMERGENCY EXIT / WIMP OUT: crossing below half sends it packing (wild)
			{
				const abT = this.abilityOf(target);
				if ((abT === 'emergencyexit' || abT === 'wimpout') && !target.exitUsed
					&& target.curHP > 0 && target.curHP <= target.maxHP / 2 && target.curHP + dealt > target.maxHP / 2) {
					target.exitUsed = true;
					if (!a.isTrainer && !a.safari) {
						this.pushMsg(this.sideOfMon(target) === 'foe'
							? `${target.name} panicked and fled the fight!`
							: `${target.name} whisked you out of the battle!`,
							() => { sfx('flee'); this.finish('escaped'); });
					}
				}
			}
			// Moxie: a KO with a damaging move fires up the attacker
			if (target.curHP <= 0 && user.curHP > 0 && this.abilityOf(user) === 'moxie') {
				const ub2 = this.boostsOf(user);
				if ((ub2.atk || 0) < 6) {
					ub2.atk = Math.min(6, (ub2.atk || 0) + 1);
					this.pushMsg(`${user.name}'s Moxie boosted its Attack!`);
				}
			}
			// CHILLING NEIGH / GRIM NEIGH / SOUL HEART: Moxie's shape on other stats
			const NEIGH = { chillingneigh: 'atk', grimneigh: 'spa', soulheart: 'spa' };
			const neighStat = NEIGH[this.abilityOf(user)];
			if (target.curHP <= 0 && user.curHP > 0 && neighStat) {
				const ubn = this.boostsOf(user);
				if ((ubn[neighStat] || 0) < 6) {
					ubn[neighStat] = Math.min(6, (ubn[neighStat] || 0) + 1);
					this.pushMsg(`${user.name}'s ${this.abilityName(this.abilityOf(user))} rose its power!`);
				}
			}
			// INNARDS OUT pays the attacker back for the KO
			if (target.curHP <= 0 && user.curHP > 0 && this.abilityOf(target) === 'innardsout') {
				const back = Math.max(1, dealt);
				user.curHP = Math.max(0, user.curHP - back);
				this.pushMsg(`${user.name} was hit by ${target.name}'s INNARDS OUT!`);
			}
			// BEAST BOOST: same shape as Moxie but on the user's BEST stat (inert: 11)
			if (target.curHP <= 0 && user.curHP > 0 && this.abilityOf(user) === 'beastboost') {
				const ub3 = this.boostsOf(user);
				const best = ['atk', 'def', 'spa', 'spd', 'spe']
					.reduce((b, k) => (user.stats[k] || 0) > (user.stats[b] || 0) ? k : b, 'atk');
				if ((ub3[best] || 0) < 6) {
					ub3[best] = Math.min(6, (ub3[best] || 0) + 1);
					this.pushMsg(`${user.name}'s BEAST BOOST raised its ${best.toUpperCase()}!`);
				}
			}
			// on-hit reaction abilities (Stamina, Gooey, Justified, ...)
			const rAb = this.abilityOf(target);
			const rx = AB_ONHIT[rAb];
			if (rx && target.curHP > 0 && (rx.anyHit || phys)
				&& (!rx.type || mv.type === rx.type) && (!rx.types || rx.types.includes(mv.type))
				&& (!rx.wind || WIND_MOVES.has(move.id))
				&& (!rx.halfHp || target.curHP <= target.maxHP / 2)
				&& (rx.ch == null || Math.random() < rx.ch)) {
				const tb = isFoe ? a.meBoosts : a.foeBoosts;
				const ub = isFoe ? a.foeBoosts : a.meBoosts;
				if (rx.drop && this.canLowerStat(user, rx.drop)) {
					ub[rx.drop] = Math.max(-6, (ub[rx.drop] || 0) - 1);
					this.pushMsg(`${target.name}'s ${this.abilityName(rAb)} lowered ${user.name}'s stats!`);
				}
				if (rx.self) {
					tb[rx.self[0]] = Math.min(6, (tb[rx.self[0]] || 0) + rx.self[1]);
					this.pushMsg(`${target.name}'s ${this.abilityName(rAb)} raised its stats!`);
				}
				if (rx.selfMulti) {
					for (const [st, d] of Object.entries(rx.selfMulti)) tb[st] = Math.max(-6, Math.min(6, (tb[st] || 0) + d));
					this.pushMsg(`${target.name}'s ${this.abilityName(rAb)} triggered!`);
				}
				if (rx.chip && phys) {
					const chip = Math.max(1, Math.floor(user.maxHP / rx.chip));
					user.curHP = Math.max(0, user.curHP - chip);
					this.pushMsg(`${user.name} was hurt by ${this.abilityName(rAb)}!`);
				}
				if (rx.weather && a.weather?.kind !== rx.weather) {
					a.weather = { kind: rx.weather, turns: 5 };
					this.pushMsg(`${target.name}'s ${this.abilityName(rAb)} whipped up a storm!`);
				}
				if (rx.terrain && a.terrain?.kind !== rx.terrain) {
					a.terrain = { kind: rx.terrain, turns: 5 };
					this.pushMsg(`${target.name}'s ${this.abilityName(rAb)} changed the field!`);
				}
				// ELECTROMORPHOSIS / WIND POWER bank a charged Electric hit
				if (rx.charge && !target.chargedUp) {
					target.chargedUp = true;   // the same flag Charge sets; doubles Electric
					this.pushMsg(`${target.name} became charged!`);
				}
				if (rx.disable && !user.disabledMove) {
					user.disabledMove = move.id;
					user.disableTurns = 4;
					this.pushMsg(`${target.name}'s Cursed Body disabled the move!`);
				}
			}
			// Rocky Helmet + item aftermath on the attacker
			const tHeld = this.itemFx(target);
			if (phys && tHeld?.helmet && user.curHP > 0) {
				const chip = Math.max(1, Math.floor(user.maxHP / 6));
				user.curHP = Math.max(0, user.curHP - chip);
				this.pushMsg(`${user.name} was hurt by the Rocky Helmet!`);
			}
			const uHeld = this.itemFx(user);
			if (uHeld?.lifeOrb && user.curHP > 0 && this.abilityOf(user) !== 'magicguard') {
				const chip = Math.max(1, Math.floor(user.maxHP / 10));
				user.curHP = Math.max(0, user.curHP - chip);
				this.pushMsg(`${user.name} was hurt by its Life Orb!`);
			}
			if (uHeld?.shellBell && user.curHP > 0 && user.curHP < user.maxHP) {
				user.curHP = Math.min(user.maxHP, user.curHP + Math.max(1, Math.floor(dealt / 8)));
			}
			// STENCH flinches like a KING'S ROCK (was inert: 12 species)
			if (uAb === 'stench' && target.curHP > 0 && Math.random() < 0.1
				&& this.abilityOf(target) !== 'innerfocus') target.flinched = true;
			if (uHeld?.flinch10 && target.curHP > 0 && Math.random() < 0.1
				&& this.abilityOf(target) !== 'innerfocus') {
				target.flinched = true;
			}
			// threshold berries on the defender
			this.checkBerry(target, targetSide);
			// Berserk: crossing half HP fires up Sp. Atk; Anger Point maxes on crits
			if (rAb === 'berserk' && target.curHP > 0 && target.curHP < target.maxHP / 2
				&& target.curHP + dealt >= target.maxHP / 2) {
				const tb = isFoe ? a.meBoosts : a.foeBoosts;
				tb.spa = Math.min(6, (tb.spa || 0) + 1);
				this.pushMsg(`${target.name}'s Berserk raised its Sp. Atk!`);
			}
			if (rAb === 'angerpoint' && crits && target.curHP > 0) {
				const tb = isFoe ? a.meBoosts : a.foeBoosts;
				tb.atk = 6;
				this.pushMsg(`${target.name}'s Anger Point maxed its Attack!`);
			}
			// Aftermath: fainting to a contact move burns the attacker
			if (target.curHP <= 0 && this.abilityOf(target) === 'aftermath' && phys && this.abilityOf(user) !== 'damp') {
				const chip = Math.max(1, Math.floor(user.maxHP / 4));
				user.curHP = Math.max(0, user.curHP - chip);
				this.pushMsg(`${target.name}'s Aftermath hurt ${user.name}!`);
			}
			if (target.curHP <= 0 && target.destinyBond) {
				this.pushMsg(`${target.name} took ${user.name} down with it!`, () => { user.curHP = 0; });
			}
		});
		if (nHits > 1) this.pushMsg(`Hit ${nHits} time(s)!`);
		if (crits) this.pushMsg('A critical hit!');
		if (eff > 1) this.pushMsg("It's super effective!");
		// visual punch for the hit that's about to animate: crit = hard shake + white
		// flash, super-effective = medium shake + orange flash (consumed by the 'hit' anim)
		if (this.active && total > 0) {
			if (crits) this.active.hitPunch = { t: 0.34, mag: 14, flash: 'rgba(255,255,255,0.5)' };
			else if (eff > 1) this.active.hitPunch = { t: 0.3, mag: 11, flash: 'rgba(255,150,60,0.4)' };
		}
		// Weakness Policy: eating a super-effective hit sharply boosts both attacks
		if (eff > 1 && total > 0 && !hitsSub && target.curHP > 0 && this.itemFx(target)?.weakPolicy) {
			this.pushMsg(`${target.name}'s Weakness Policy sharply raised its stats!`, () => {
				target.heldItem = null;
				targetBoosts.atk = Math.min(6, (targetBoosts.atk || 0) + 2);
				targetBoosts.spa = Math.min(6, (targetBoosts.spa || 0) + 2);
			});
		}
		if (eff < 1) this.pushMsg("It's not very effective...");
		if (fx.drain) {
			const healed = Math.max(1, Math.floor(total * fx.drain));
			// LIQUID OOZE turns the drain against the attacker (was inert: 7 species)
			if (this.abilityOf(target) === 'liquidooze') {
				this.pushMsg(`${user.name} sucked up the LIQUID OOZE!`, () => {
					user.curHP = Math.max(0, user.curHP - healed);
					this.float(isFoe ? 'foe' : 'me', `-${healed}`, '#ff7a6b');
				});
			} else if (user.healBlockTurns > 0) {
				this.pushMsg(`${user.name} was prevented from draining by Heal Block!`);
			} else {
				this.pushMsg(`${target.name} had its energy drained!`, () => {
					user.curHP = Math.min(user.maxHP, user.curHP + healed);
					this.float(isFoe ? 'foe' : 'me', `+${healed}`, '#6be08a');
				});
			}
		}
		// RAPID SPIN / MORTAL SPIN: a damaging move that also frees the user. It
		// appeared NOWHERE in this file, so it landed as a plain 50-BP Normal hit
		// — while the foe AI rates hazards at 95 on turns 1-2 and lays them
		// aggressively. Removal was Defog-only, leaving Rock/Ice/Bug/Fire/Flying
		// teams with no answer at all.
		if ((move.id === 'rapidspin' || move.id === 'mortalspin') && user.curHP > 0) {
			const mine = isFoe ? 'foeHazards' : 'meHazards';
			const hadHazards = Object.values(a[mine] || {}).some(v => v > 0);
			a[mine] = {};
			if (user.trapTurns > 0) { user.trapTurns = 0; this.pushMsg(`${user.name} spun free of ${user.trapName}!`); }
			if (user.seeded) { delete user.seeded; this.pushMsg(`${user.name} shed the LEECH SEED!`); }
			if (hadHazards) this.pushMsg(`${user.name} blew away the hazards!`);
			if (move.id === 'rapidspin' && userBoosts) {
				userBoosts.spe = Math.max(-6, Math.min(6, (userBoosts.spe || 0) + 1));
				this.pushMsg(`${user.name}'s Speed rose!`);
			}
		}
		if (fx.recoil && uAb !== 'rockhead') {
			const rec = Math.max(1, Math.floor(total * fx.recoil));
			this.pushMsg(`${user.name} is damaged by recoil!`, () => {
				user.curHP = Math.max(0, user.curHP - rec);
				this.float(isFoe ? 'foe' : 'me', `-${rec}`, '#ff7a6b');
			});
		}
		// LONG REACH keeps its user out of contact range entirely (was inert: 4)
		if (phys && !hitsSub && uAb !== 'longreach') {
			this.pushMsg('', () => {
				if (target.curHP <= 0 || user.curHP <= 0) return;
				const dAb = this.abilityOf(target);
				const roll = Math.random();
				// POISON TOUCH poisons on the ATTACKER's contact (was inert: 20 species)
				if (this.abilityOf(user) === 'poisontouch' && Math.random() < 0.3 && !target.status
					&& target.curHP > 0 && !target.types.some(t => t === 'Poison' || t === 'Steel')) {
					target.status = 'psn';
					this.pushMsg(`${target.name} was poisoned by POISON TOUCH!`);
				}
				// MAGICIAN lifts the TARGET's item when it lands a hit (inert: 7)
				if (this.abilityOf(user) === 'magician' && target.heldItem && !user.heldItem
					&& this.abilityOf(target) !== 'stickyhold') {
					user.heldItem = target.heldItem; target.heldItem = null;
					this.pushMsg(`${user.name} magicked away the ${this.itemName(user)}!`);
				}
				// TOXIC CHAIN has a chance to badly poison on any hit (inert: 3)
				if (this.abilityOf(user) === 'toxicchain' && target.curHP > 0 && !target.status
					&& Math.random() < 0.3) {
					this.applyStatus(target, 'psn', true, user);
				}
				// PICKPOCKET lifts the attacker's item on contact (was inert: 16)
				if (dAb === 'pickpocket' && user.heldItem && !target.heldItem
					&& this.abilityOf(user) !== 'stickyhold') {
					target.heldItem = user.heldItem; user.heldItem = null;
					this.pushMsg(`${target.name} pickpocketed the ${this.itemName(target)}!`);
				}
				// MUMMY / LINGERING AROMA / WANDERING SPIRIT rewrite the attacker
				if ((dAb === 'mummy' || dAb === 'lingeringaroma') && this.abilityOf(user) !== dAb) {
					this.snapAbility(user);
					user.ability = dAb;
					this.pushMsg(`${user.name} was infected by ${this.abilityName(dAb)}!`);
				} else if (dAb === 'wanderingspirit' && this.abilityOf(user)) {
					const swap = this.abilityOf(user);
					this.snapAbility(user); this.snapAbility(target);
					user.ability = dAb; target.ability = swap;
					this.pushMsg(`${target.name} and ${user.name} swapped abilities!`);
				}
				if (dAb === 'colorchange' && target.curHP > 0 && mv.type && !target.types.includes(mv.type)) {
					this.snapTypes(target);
					target.types = [mv.type];
					this.pushMsg(`${target.name}'s COLOR CHANGE made it ${mv.type}-type!`);
				}
				if (dAb === 'toxicdebris' && target.curHP > 0) {
					const h = isFoe ? a.foeHazards : a.meHazards;
					if ((h.toxicspikes || 0) < 2) {
						h.toxicspikes = (h.toxicspikes || 0) + 1;
						this.pushMsg(`${target.name} scattered TOXIC DEBRIS!`);
					}
				}
				if (dAb === 'static' && roll < 0.3 && !user.status) {
					user.status = 'par';
					this.pushMsg(`${user.name} was paralyzed by Static!`);
				} else if (dAb === 'poisonpoint' && roll < 0.3 && !user.status) {
					user.status = 'psn';
					this.pushMsg(`${user.name} was poisoned by Poison Point!`);
				} else if (dAb === 'flamebody' && roll < 0.3 && !user.status) {
					user.status = 'brn';
					this.pushMsg(`${user.name} was burned by Flame Body!`);
				} else if (dAb === 'effectspore' && roll < 0.3 && !user.status) {
					user.status = ['psn', 'par', 'slp'][Math.floor(Math.random() * 3)];
					if (user.status === 'slp') user.sleepTurns = 2;
					this.pushMsg(`${user.name} was afflicted by Effect Spore!`);
				} else if (dAb === 'cutecharm' && roll < 0.3 && user.gender && target.gender
					&& user.gender !== target.gender && !user.attracted) {
					user.attracted = true;
					this.pushMsg(`${user.name} fell in love with Cute Charm!`);
				}
			});
		}
		if ((fx.knockOff || fx.steal) && !hitsSub) {
			this.pushMsg('', () => {
				if (target.curHP <= 0 || !target.heldItem) return;
				if (this.abilityOf(target) === 'stickyhold') {
					this.pushMsg(`${target.name}'s Sticky Hold kept its item!`);
					return;
				}
				if (fx.knockOff) {
					this.pushMsg(`${user.name} knocked off ${target.name}'s ${this.itemName(target)}!`, () => {
						target.heldItem = null;
						if (this.abilityOf(target) === 'unburden') target.unburdened = true;
					});
				} else if (!user.heldItem) {
					this.pushMsg(`${user.name} stole ${target.name}'s ${this.itemName(target)}!`, () => {
						user.heldItem = target.heldItem;
						target.heldItem = null;
						if (this.abilityOf(target) === 'unburden') target.unburdened = true;
					});
				}
			});
		}
		if (fx.trap) {
			this.pushMsg('', () => {
				if (target.curHP > 0 && !target.trapTurns) {
					target.trapTurns = 2 + Math.floor(Math.random() * 4);
					target.trapName = fx.trap;
					this.pushMsg(`${target.name} was trapped by ${fx.trap}!`);
				}
			});
		}
		if (fx.selfKO || fx.sacrifice) {
			this.pushMsg('', () => {
				user.curHP = 0;
				this.float(isFoe ? 'foe' : 'me', 'KO', '#ff7a6b');
			});
		}
		if (fx.recharge) this.pushMsg('', () => { user.rechargeTurn = true; });
		if (fx.selfDrop) {
			this.pushMsg('', () => {
				if (user.curHP <= 0) return;
				const words = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
				for (const [st, d] of Object.entries(fx.selfDrop)) {
					const before = userBoosts[st] ?? 0;
					userBoosts[st] = Math.max(-6, Math.min(6, before + d));
					if (userBoosts[st] !== before) {
						this.pushMsg(`${user.name}'s ${words[st]} ${d < -1 ? 'fell harshly' : 'fell'}!`);
					}
				}
			});
		}
		// self stat change AFTER a damaging hit lands (Flame Charge speed, Power-Up
		// Punch attack, Charge Beam 70% Sp. Atk, …). Optional postBoostCh (default
		// 100); Serene Grace doubles it. Positive rises, negative falls.
		const postCh = fx.postBoostCh == null ? 100 : fx.postBoostCh * (uAb === 'serenegrace' ? 2 : 1);
		if (fx.postBoost && Math.random() * 100 < postCh) {
			this.pushMsg('', () => {
				if (user.curHP <= 0) return;
				const words = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', acc: 'accuracy', eva: 'evasiveness' };
				for (const [st, d] of Object.entries(fx.postBoost)) {
					const before = userBoosts[st] ?? 0;
					userBoosts[st] = Math.max(-6, Math.min(6, before + d));
					if (userBoosts[st] !== before) {
						this.pushMsg(`${user.name}'s ${words[st]} ${d > 1 ? 'rose sharply' : d > 0 ? 'rose' : d < -1 ? 'fell harshly' : 'fell'}!`);
					}
				}
			});
		}
		const secCh = (fx.sec?.ch || 0) * (uAb === 'serenegrace' ? 2 : 1);
		if (fx.sec && !hitsSub && tAb !== 'shielddust' && uAb !== 'sheerforce' && Math.random() * 100 < secCh) {
			this.pushMsg('', () => {
				if (target.curHP <= 0) return;
				if (fx.sec.flinch) {
					if (this.abilityOf(target) !== 'innerfocus') {
						target.flinched = true;
						// STEADFAST turns every flinch into speed (was inert: 15 species)
						if (this.abilityOf(target) === 'steadfast' && targetBoosts) {
							targetBoosts.spe = Math.max(-6, Math.min(6, (targetBoosts.spe || 0) + 1));
							this.pushMsg(`${target.name}'s STEADFAST raised its Speed!`);
						}
					}
				}
				else if (fx.sec.stat) {
					if (!this.canLowerStat(target, fx.sec.stat)) return;
					const before = targetBoosts[fx.sec.stat] ?? 0;
					targetBoosts[fx.sec.stat] = Math.max(-6, Math.min(6, before + fx.sec.d));
					if (targetBoosts[fx.sec.stat] !== before) {
						const words = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', acc: 'accuracy' };
						this.pushMsg(`${target.name}'s ${words[fx.sec.stat]} fell!`);
					}
				} else if (fx.sec.confuse) {
					if (!(target.confuseTurns > 0)) {
						target.confuseTurns = 2 + Math.floor(Math.random() * 4);
						this.pushMsg(`${target.name} became confused!`);
					}
				} else if (!target.status
					&& !(STATUS_IMMUNE[fx.sec.status] || []).some(t => target.types.includes(t))
					&& !(STATUS_IMMUNE_AB[fx.sec.status] || []).includes(this.abilityOf(target))
					&& !(this.abilityOf(target) === 'leafguard' && this.weatherKind() === 'sun')
					&& this.abilityOf(target) !== 'comatose') {
					target.status = fx.sec.status;
					if (fx.sec.status === 'slp') target.sleepTurns = 1 + Math.floor(Math.random() * 3);
					if (fx.sec.bad) { target.badPsn = true; target.toxicN = 1; }
					this.pushMsg(`${target.name} ${fx.sec.bad ? 'was badly poisoned!' : STATUS_APPLIED_MSG[fx.sec.status]}`);
				}
			});
		}
		// PIVOT (U-turn / Volt Switch / Flip Turn): after the damage, the user
		// switches out to a healthy benchmon. Mirrors the Baton Pass swap (which
		// proves a mid-turn a.me/a.foe change is safe — later moves read them live)
		// but passes NO boosts. Only when a replacement exists.
		if (fx.pivot) {
			this.pushMsg('', () => {
				if (user.curHP <= 0) return;
				if (!isFoe) {
					const next = a.party.find(m => m !== user && m.curHP > 0);
					if (!next) return;
					this.pushMsg(`${user.name} went back!`, () => {
						this.clearVolatiles(user);
						a.me = next; a.meImg = a.backSprites.get(next);
						Object.assign(a.meBoosts, freshBoosts());
						a.meShownHP = next.curHP; a.meHidden = false;
					});
					this.pushAnim('enter', 'me', 0.4);
					this.pushMsg('', () => { cry(a.me.speciesId); this.applyHazards(a.me, 'me'); });
				} else if (a.isTrainer && a.foes) {
					let idx = -1;
					for (let i = 0; i < a.foes.length; i++) if (a.foes[i] !== a.foe && a.foes[i].curHP > 0) { idx = i; break; }
					if (idx < 0) return;
					const next = a.foes[idx];
					this.pushMsg(`${a.info.displayName} withdrew ${a.foe.name}!`, () => {
						this.clearVolatiles(a.foe);
						a.foe = next; a.foeIdx = idx; a.foeImg = a.foeSprites.get(next);
						Object.assign(a.foeBoosts, freshBoosts());
						a.foeShownHP = next.curHP; a.foeHidden = false;
					});
					this.pushAnim('enter', 'foe', 0.4);
					this.pushMsg('', () => { cry(a.foe.speciesId); this.applyHazards(a.foe, 'foe'); });
				}
			});
		}
	}

	// burn/poison chip, Toxic ramping, Leech Seed sap, screens wearing off
	endOfTurn() {
		const a = this.active;
		for (const mon of this.actorMons()) {
			if (mon.curHP <= 0) continue;
			const side = this.sideOfMon(mon);
			if (mon.status === 'psn' && this.abilityOf(mon) === 'poisonheal') {
				if (mon.curHP < mon.maxHP) {
					this.pushMsg(`${mon.name}'s Poison Heal restored HP!`, () => {
						mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.max(1, Math.floor(mon.maxHP / 8)));
					});
				}
			} else if ((mon.status === 'brn' || mon.status === 'psn') && this.abilityOf(mon) !== 'magicguard') {
				const chip = mon.badPsn
					? Math.max(1, Math.floor(mon.maxHP / 16) * Math.min(15, mon.toxicN || 1))
					: Math.max(1, Math.floor(mon.maxHP / 8));
				if (mon.badPsn) mon.toxicN = (mon.toxicN || 1) + 1;
				this.pushMsg(`${mon.name} is hurt by its ${mon.status === 'brn' ? 'burn' : 'poison'}!`,
					() => {
						mon.curHP = Math.max(0, mon.curHP - chip);
						this.float(side, `-${chip}`, '#c98fe8');
					});
			}
			if (mon.seeded && this.abilityOf(mon) !== 'magicguard') {
				const other = this.sideOfMon(mon) === 'me' ? a.foe : a.me;
				const sap = Math.max(1, Math.floor(mon.maxHP / 8));
				this.pushMsg(`${mon.name}'s health is sapped by Leech Seed!`, () => {
					mon.curHP = Math.max(0, mon.curHP - sap);
					this.float(side, `-${sap}`, '#8ad86b');
					if (other.curHP > 0) {
						other.curHP = Math.min(other.maxHP, other.curHP + sap);
						this.float(side === 'me' ? 'foe' : 'me', `+${sap}`, '#6be08a');
					}
				});
			}
		}
		// ALLIES BELONG HERE TOO. This used to iterate [a.me, a.foe], so in a double
		// battle neither ally ever had protectedTurn cleared — one successful
		// Protect made that ally permanently untargetable (the check at the top of
		// useMove), and since you can't flee a trainer battle, the fight was
		// unwinnable. Allies were also missing Wrap chip, Yawn and Aqua Ring.
		for (const mon of this.actorMons()) {
			if (mon.curHP <= 0) continue;
			const side = this.sideOfMon(mon);
			if (mon.trapTurns > 0 && this.abilityOf(mon) !== 'magicguard') {
				const chip = Math.max(1, Math.floor(mon.maxHP / 16));
				this.pushMsg(`${mon.name} is hurt by ${mon.trapName}!`, () => {
					mon.curHP = Math.max(0, mon.curHP - chip);
					this.float(side, `-${chip}`, '#e8b16b');
				});
				if (--mon.trapTurns <= 0) this.pushMsg(`${mon.name} was freed from ${mon.trapName}!`);
			}
			if (mon.drowsy && --mon.drowsy <= 0) {
				delete mon.drowsy;
				if (!mon.status) {
					mon.status = 'slp';
					mon.sleepTurns = 1 + Math.floor(Math.random() * 3);
					this.pushMsg(`${mon.name} fell asleep!`);
				}
			}
			if (mon.aquaRing && mon.curHP < mon.maxHP) {
				const heal = Math.max(1, Math.floor(mon.maxHP / 16));
				this.pushMsg(`A veil of water restored ${mon.name}'s HP!`, () => {
					mon.curHP = Math.min(mon.maxHP, mon.curHP + heal);
					this.float(side, `+${heal}`, '#6be08a');
				});
			}
			mon.protectedTurn = false;
			// per-turn bookkeeping the conditional-power moves read (Payback,
			// Assurance). Cleared here so "this turn" means the turn just played.
			mon.movedThisTurn = false;
			mon.tookDamageThisTurn = false;
			mon.helpingHand = false;        // one turn only
			mon.justSwitchedIn = false;     // STAKEOUT only gets the turn you arrive
			// a rampage runs down and then costs you: this drawback is the entire
			// reason Outrage and Thrash are not just better moves
			if (mon.lockMove && --mon.lockTurns <= 0) {
				const wasUproar = mon.lockMove === 'uproar';
				mon.lockMove = null; mon.lockTurns = 0;
				if (wasUproar) this.pushMsg(`${mon.name} calmed down.`);
				else {
					this.pushMsg(`${mon.name} tired itself out!`);
					this.applyConfusion(mon);
				}
			}
			mon.centerOfAttention = false;  // Follow Me / Rage Powder / Spotlight
			// WHITE HERB / MENTAL HERB. Both shipped with a payload nothing read.
			// They resolve HERE rather than at each trigger: stats are lowered from
			// a dozen places and a check bolted onto some of them is exactly the
			// half-wired kind of item this sweep exists to remove. End of turn
			// always fires, at the cost of one turn's delay.
			const herb = this.itemFx(mon);
			if (herb?.whiteHerb) {
				const b = this.boostsOf(mon);
				const lowered = Object.keys(b).filter(k => b[k] < 0);
				if (lowered.length) {
					for (const k of lowered) b[k] = 0;
					this.pushMsg(`${mon.name}'s WHITE HERB restored its stats!`);
					this.consumeItem(mon);
				}
			}
			// HEALER: a chance to cure its ally's status each turn (doubles; inert: 11)
			if (this.abilityOf(mon) === 'healer' && a.double) {
				const ally = mon === a.me ? a.meAlly : mon === a.meAlly ? a.me
					: mon === a.foe ? a.foeAlly : mon === a.foeAlly ? a.foe : null;
				if (ally && ally.curHP > 0 && ally.status && Math.random() < 0.3) {
					ally.status = null; ally.sleepTurns = 0;
					this.pushMsg(`${mon.name}'s HEALER cured ${ally.name}!`);
				}
			}
			if (herb?.mentalHerb && (mon.attracted || mon.tauntTurns > 0 || mon.encoreTurns > 0 || mon.tormented)) {
				mon.attracted = false; mon.tauntTurns = 0; mon.encoreTurns = 0; mon.tormented = false;
				this.pushMsg(`${mon.name} used its MENTAL HERB to snap out of it!`);
				this.consumeItem(mon);
			}
			if (mon.embargoTurns > 0 && --mon.embargoTurns === 0) {
				this.pushMsg(`${mon.name} can use items again!`);
			}
			if (mon.healBlockTurns > 0 && --mon.healBlockTurns === 0) {
				this.pushMsg(`${mon.name}'s Heal Block wore off!`);
			}
			mon.electrified = false; // Electrify lasts one turn
		}
		this.active.fieldFx.ionDeluge = 0; // Ion Deluge is this-turn-only
		// a foreseen attack arrives. It used to be a flat 35% of the victim's max
		// HP — typeless, statless, un-dodgeable by a Dark type. It is a REAL typed
		// special hit now (Psychic; DOOM DESIRE is Steel), computed from the stats
		// the caster had when it foresaw — so it still lands right if the caster
		// has since switched or fainted. Falls back to the flat cut only for a
		// snapshot from before this change.
		for (const [key, victimOf] of [['meFuture', () => a.me], ['foeFuture', () => a.foe]]) {
			const f = a[key];
			if (!f) continue;
			if (--f.turns > 0) continue;
			a[key] = null;
			const victim = victimOf();
			if (!victim || victim.curHP <= 0) continue;
			let dmg;
			if (f.user?.stats?.spa) {
				const type = f.move === 'doomdesire' ? 'Steel' : 'Psychic';
				const pw = f.move === 'doomdesire' ? 140 : 120;
				const D = Math.max(1, victim.stats?.spd || 1);
				const base = Math.floor(Math.floor(Math.floor(2 * (f.level || 50) / 5 + 2) * pw * f.user.stats.spa / D) / 50) + 2;
				const eff = effectiveness(type, victim.types);
				if (eff === 0) { this.pushMsg(`${f.name} failed to affect ${victim.name}!`); continue; }
				dmg = Math.max(1, Math.floor(base * (f.user.types?.includes(type) ? 1.5 : 1) * eff));
			} else {
				dmg = Math.max(1, Math.floor(victim.maxHP * 0.35));
			}
			this.pushMsg(`${victim.name} took the ${f.name} attack!`, () => {
				victim.curHP = Math.max(0, victim.curHP - dmg);
				this.float(victim === a.me ? 'me' : 'foe', `-${dmg}`, '#c9a0ff');
			});
		}
		// screens tick down per side
		for (const [side, screens, who] of [['me', a.meScreens, a.me], ['foe', a.foeScreens, a.foe]]) {
			for (const key of ['reflect', 'light']) {
				if (screens[key] > 0 && --screens[key] === 0) {
					this.pushMsg(`${who.name}'s ${key === 'reflect' ? 'Reflect' : 'Light Screen'} wore off!`);
				}
			}
		}
		// weather: chip + countdown
		if (a.weather) {
			const wk2 = this.weatherKind();
			for (const mon of this.actorMons()) {
				if (mon.curHP <= 0) continue;
				const side = mon === a.me ? 'me' : 'foe';
				const ab3 = this.abilityOf(mon);
				const immuneSand = ['Rock', 'Ground', 'Steel'].some(t => mon.types.includes(t))
					|| ab3 === 'sandveil' || ab3 === 'sandforce' || ab3 === 'sandrush';
				const immuneChip = ab3 === 'magicguard' || ab3 === 'overcoat' || ab3 === 'icebody' || ab3 === 'snowcloak';
				if (!immuneChip && ((wk2 === 'sand' && !immuneSand) || (wk2 === 'hail' && !mon.types.includes('Ice')))) {
					const chip = Math.max(1, Math.floor(mon.maxHP / 16));
					this.pushMsg(`${mon.name} is buffeted by the ${wk2 === 'sand' ? 'sandstorm' : 'hail'}!`, () => {
						mon.curHP = Math.max(0, mon.curHP - chip);
						this.float(side, `-${chip}`, '#d8cf9a');
					});
				}
			}
			if (--a.weather.turns <= 0) {
				this.pushMsg('The weather returned to normal.');
				a.weather = null;
			}
		}
		// grassy terrain heals; terrains fade
		if (a.terrain) {
			if (a.terrain.kind === 'grassy') {
				for (const mon of this.actorMons()) {
					if (mon.curHP > 0 && mon.curHP < mon.maxHP) {
						const heal = Math.max(1, Math.floor(mon.maxHP / 16));
						this.pushMsg('', () => {
							mon.curHP = Math.min(mon.maxHP, mon.curHP + heal);
							this.float(mon === a.me ? 'me' : 'foe', `+${heal}`, '#6be08a');
						});
					}
				}
			}
			if (--a.terrain.turns <= 0) a.terrain = null;
		}
		for (const key of Object.keys(a.fieldFx)) {
			if (a.fieldFx[key] > 0 && --a.fieldFx[key] === 0) this.pushMsg('The field effect wore off!');
		}
		// per-side effects: wish lands, timers fade
		for (const [sname, s, active] of [['me', a.meSide, a.me], ['foe', a.foeSide, a.foe]]) {
			if (s.wishT > 0 && --s.wishT === 0 && active.curHP > 0) {
				this.pushMsg(`${active.name}'s wish came true!`, () => {
					active.curHP = Math.min(active.maxHP, active.curHP + s.wishAmt);
					this.float(sname, `+${s.wishAmt}`, '#6be08a');
				});
			}
			for (const key of ['tailwind', 'safeguard', 'mist', 'luckychant']) {
				if (s[key] > 0) s[key]--;
			}
		}
		// per-mon countdowns
		for (const mon of this.actorMons()) {
			const side = this.sideOfMon(mon);
			if (mon.curHP <= 0) continue;
			if (mon.nightmared && mon.status === 'slp') {
				const chip = Math.max(1, Math.floor(mon.maxHP / 4));
				this.pushMsg(`${mon.name} is locked in a nightmare!`, () => {
					mon.curHP = Math.max(0, mon.curHP - chip);
					this.float(side, `-${chip}`, '#c98fe8');
				});
			} else if (mon.nightmared) delete mon.nightmared;
			if (mon.perishN > 0) {
				mon.perishN--;
				this.pushMsg(`${mon.name}'s perish count fell to ${mon.perishN}!`, () => {
					if (mon.perishN <= 0) mon.curHP = 0;
				});
			}
			if (mon.disableTurns > 0 && --mon.disableTurns === 0) delete mon.disabledMove;
			if (mon.encoreTurns > 0 && --mon.encoreTurns === 0) delete mon.encoreMove;
			if (mon.tauntTurns > 0) mon.tauntTurns--;
			if (mon.magnetRise > 0) mon.magnetRise--;
			if (mon.telekinesis > 0) mon.telekinesis--;
			mon.enduring = false;
			const ab = this.abilityOf(mon);
			const boosts = this.boostsOf(mon);
			if (ab === 'speedboost') {
				boosts.spe = Math.min(6, (boosts.spe || 0) + 1);
				this.pushMsg(`${mon.name}'s Speed Boost raised its Speed!`);
			}
			// HUNGER SWITCH: Morpeko flips Full Belly ↔ Hangry every end of turn
			if (ab === 'hungerswitch' && (mon.speciesId === 'morpeko' || mon.form === 'morpeko_hangry')) {
				const want = (mon.form || mon.speciesId) === 'morpeko_hangry' ? 'morpeko' : 'morpeko_hangry';
				this.changeForm(mon, want, this.sideOfMon(mon),
					want === 'morpeko_hangry' ? `${mon.name} got hangry!` : `${mon.name} calmed down.`);
			}
			if (ab === 'raindish' && this.weatherKind() === 'rain' && mon.curHP < mon.maxHP) {
				this.pushMsg(`${mon.name}'s Rain Dish restored a little HP!`, () => {
					mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.max(1, Math.floor(mon.maxHP / 16)));
				});
			}
			if (ab === 'icebody' && this.weatherKind() === 'hail' && mon.curHP < mon.maxHP) {
				this.pushMsg(`${mon.name}'s Ice Body restored a little HP!`, () => {
					mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.max(1, Math.floor(mon.maxHP / 16)));
				});
			}
			if (ab === 'shedskin' && mon.status && Math.random() < 0.3) {
				this.pushMsg(`${mon.name}'s Shed Skin cured its status!`, () => {
					mon.status = null; delete mon.badPsn; delete mon.toxicN;
				});
			}
			if (ab === 'hydration' && mon.status && this.weatherKind() === 'rain') {
				this.pushMsg(`${mon.name}'s Hydration cured its status!`, () => { mon.status = null; });
			}
			if (ab === 'baddreams') {
				const other = this.sideOfMon(mon) === 'me' ? a.foe : a.me;
				if (other.curHP > 0 && other.status === 'slp') {
					this.pushMsg(`${other.name} is tormented by Bad Dreams!`, () => {
						other.curHP = Math.max(0, other.curHP - Math.max(1, Math.floor(other.maxHP / 8)));
					});
				}
			}
			if (ab === 'moody') {
				const stats = ['atk', 'def', 'spa', 'spd', 'spe'];
				const up = stats[Math.floor(Math.random() * 5)];
				let down = stats[Math.floor(Math.random() * 5)];
				if (down === up) down = stats[(stats.indexOf(up) + 1) % 5];
				boosts[up] = Math.min(6, (boosts[up] || 0) + 2);
				boosts[down] = Math.max(-6, (boosts[down] || 0) - 1);
				this.pushMsg(`${mon.name}'s Moody juggled its stats!`);
			}
			if (ab === 'solarpower' && this.weatherKind() === 'sun') {
				this.pushMsg(`${mon.name} is worn down by Solar Power!`, () => {
					mon.curHP = Math.max(0, mon.curHP - Math.max(1, Math.floor(mon.maxHP / 8)));
				});
			}
			if (ab === 'dryskin') {
				const wk3 = this.weatherKind();
				if (wk3 === 'rain' && mon.curHP < mon.maxHP) {
					this.pushMsg(`${mon.name}'s Dry Skin drank the rain!`, () => {
						mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.max(1, Math.floor(mon.maxHP / 8)));
					});
				} else if (wk3 === 'sun') {
					this.pushMsg(`${mon.name}'s Dry Skin cracked in the sun!`, () => {
						mon.curHP = Math.max(0, mon.curHP - Math.max(1, Math.floor(mon.maxHP / 8)));
					});
				}
			}
			if (mon.slowStartT > 0 && --mon.slowStartT === 0) {
				this.pushMsg(`${mon.name} finally got its act together!`);
			}
			const held = this.itemFx(mon);
			if (held?.endHealFrac && mon.curHP < mon.maxHP) {
				this.pushMsg(`${mon.name} restored a little HP with its ${this.itemName(mon)}!`, () => {
					mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.max(1, Math.floor(mon.maxHP * held.endHealFrac)));
				});
			}
			if (held?.sludge) {
				if (mon.types.includes('Poison')) {
					if (mon.curHP < mon.maxHP) {
						this.pushMsg(`${mon.name} sipped its Black Sludge!`, () => {
							mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.max(1, Math.floor(mon.maxHP / 16)));
						});
					}
				} else if (this.abilityOf(mon) !== 'magicguard') {
					this.pushMsg(`${mon.name} is hurt by its Black Sludge!`, () => {
						mon.curHP = Math.max(0, mon.curHP - Math.max(1, Math.floor(mon.maxHP / 8)));
					});
				}
			}
			if (ab === 'harvest' && !mon.heldItem && mon.consumedItem
				&& /berry/.test(mon.consumedItem) && Math.random() < 0.5) {
				mon.heldItem = mon.consumedItem;
				mon.consumedItem = null;
				this.pushMsg(`${mon.name}'s Harvest regrew its berry!`);
			}
		}
		this.pushMsg('', () => this.checkFaints());
		// a ROAMING legendary bolts at the end of most turns — trap it or catch it
		// fast. Mean Look / trapping holds it in place like the classics.
		if (a.roamer && Math.random() < 0.5) {
			this.pushMsg('', () => {
				if (a.foe.curHP <= 0 || a.caughtMon || a.phase === 'done') return;
				if (this.trappedBy(a.foe)) { this.pushMsg(`${a.foe.name} strains to escape, but can't flee!`); return; }
				this.pushMsg(`The roaming ${a.foe.name} got away!`, () => { sfx('flee'); this.finish('escaped'); });
			});
		}
		// flinch never carries between turns
		for (const m of [a.me, a.foe, a.meAlly, a.foeAlly]) if (m) m.flinched = false;
	}

	// Disable/Encore/Taunt/Torment restrictions, shared by the menu and the AI
	moveUsable(mon, m, side) {
		if (m.pp <= 0) return false;
		if (this.itemFx(mon)?.assaultVest && this.data.moves[m.id]?.category === 'Status') return false;
		if (mon.choiceLock && this.itemFx(mon)?.choice && m.id !== mon.choiceLock) return false;
		if (mon.disabledMove === m.id) return false;
		if (mon.encoreMove && m.id !== mon.encoreMove) return false;
		// mid-rampage you get no say — same shape as Encore
		if (mon.lockMove && m.id !== mon.lockMove) return false;
		// GORILLA TACTICS locks you in like a Choice item, without the item
		if (mon.choiceLock && this.abilityOf(mon) === 'gorillatactics' && m.id !== mon.choiceLock) return false;
		if (mon.tauntTurns > 0 && (this.data.moves[m.id]?.category === 'Status')) return false;
		if (mon.tormented && this.active?.lastMove[side] === m.id) return false;
		// IMPRISON: an opposing sealer forbids every move it also knows
		{
			const a = this.active;
			if (a) {
				const opps = side === 'me' ? [a.foe, a.foeAlly] : [a.me, a.meAlly];
				if (opps.some(o => o && o.curHP > 0 && o.imprisoning && (o.moves || []).some(om => om.id === m.id))) return false;
			}
		}
		return true;
	}

	// wild mons act at random; trainers prefer the strongest expected hit
	// (power x STAB x type effectiveness), with a dash of unpredictability
	// heuristic worth of a status move for the foe right now (0 = don't pick it):
	// hazards and setup early, status on a healthy target, healing under half,
	// no re-laying / re-statusing / re-screening
	statusMoveValue(m) {
		const a = this.active;
		const fx = MOVE_FX[m.id] || {};
		const st = STAT_MOVES[m.id];
		const early = (a.turnCount || 0) < 2;
		if (fx.hazard) {
			const laid = a.meHazards[fx.hazard] || 0;
			const cap = fx.hazard === 'spikes' ? 3 : fx.hazard === 'toxicspikes' ? 2 : 1;
			return laid >= cap ? 0 : (early ? 95 : 45);
		}
		if (fx.status) return !a.me.status && a.me.curHP > a.me.maxHP * 0.6 ? 85 : 0;
		if (fx.heal) return a.foe.curHP < a.foe.maxHP * 0.5 ? 90 : 0;
		if (fx.weather) return a.weather?.kind === fx.weather ? 0 : 55;
		if (fx.terrain) return a.terrain?.kind === fx.terrain ? 0 : 50;
		if (fx.screen) return ((fx.screen === 'light' ? a.foeScreens.light : a.foeScreens.reflect) > 0) ? 0 : 60;
		if (st && !st.foe) {
			const key = st.stat || Object.keys(st.stats || {})[0];
			if (!key || (a.foeBoosts[key] || 0) >= 2) return 0; // already set up
			return a.foe.curHP > a.foe.maxHP * 0.7 ? (early ? 80 : 40) : 0;
		}
		if (st && st.foe) return early ? 30 : 15;
		// A status move the engine has NO model for scores nothing. The old
		// default of 20 meant "an unknown trick is probably worth something" —
		// tolerable while damage scores were raw-power-sized, but on the percent
		// scale it let SPLASH outbid an honest chip hit from a weak attacker.
		if (fx.noop || fx.splashMsg || fx.festMsg || fx.happyHour || (!Object.keys(fx).length && !st)) return 0;
		return fx.protect || fx.selfKO ? 0 : 20;
	}

	// `user`/`target` default to the singles pair. Doubles used to bypass this
	// entirely and pick uniformly at random — a gym-tier double trainer would
	// happily spam Splash — even though the comment above the code claimed "each
	// foe picks its strongest move". Passing the actor in lets both use it.
	chooseFoeMove(user = this.active.foe, target = this.active.me) {
		const a = this.active;
		if (user.chargeMove) {
			return user.moves.find(m => m.id === user.chargeMove) || STRUGGLE();
		}
		// mid-rampage the AI has no choice either
		if (user.lockMove) return user.moves.find(m => m.id === user.lockMove) || STRUGGLE();
		const usable = user.moves.filter(m => this.moveUsable(user, m, 'foe'));
		if (!usable.length) return STRUGGLE();
		// wild mons are random; route trainers keep a 15% wobble; boss-tier
		// trainers (info.boss) always play the scored line
		const boss = a.isTrainer && a.info?.boss;
		if (!a.isTrainer || (!boss && Math.random() < 0.15)) return usable[Math.floor(Math.random() * usable.length)];
		let best = null, bestScore = 0;
		for (const m of usable) {
			const mv = this.data.moves[m.id] || {};
			const pw = mv.power || AI_EST_POWER[m.id] || 0;
			let score;
			if (!pw) {
				score = this.statusMoveValue(m) * (boss ? 1 : 0.6); // route trainers value tricks less
				if (score <= 0) continue;
			} else {
				// ability-aware: don't walk into full immunities the player can see
				const defAb = this.abilityOf(target);
				if (defAb === 'levitate' && mv.type === 'Ground') continue;
				if (AB_ABSORB[defAb]?.t === mv.type) continue;
				if (defAb === 'flashfire' && mv.type === 'Fire') continue;
				// Score by the SHARE of the target this would remove — computed
				// damage, so stages and stat spreads finally matter — and treat a
				// guaranteed finish as beyond price: nothing else compares, and
				// among lethal moves the one that strikes first (priority) wins.
				// The ×1.5 keeps damage comparable to the statusMoveValue scale
				// (tuned against the old raw-power scores): a boss still opens with
				// its 85-point status unless it can remove ~57%+, a route trainer's
				// 0.6× status discount still loses to a solid neutral hit.
				const est = this.estimateDamage(user, target, m);
				score = Math.min(150, 100 * est / Math.max(1, target.maxHP)) * 1.5;
				if (est >= target.curHP) score = 1000 + (mv.priority || 0) * 10 + score / 10;
			}
			if (score > bestScore) { bestScore = score; best = m; }
		}
		return best || usable[Math.floor(Math.random() * usable.length)];
	}

	// What a move would actually DO: the real damage core — level, the right
	// attack against the right defense, stat stages, STAB, effectiveness — minus
	// only the random roll. The AI used to rank on RAW BASE POWER, which ignores
	// every stat in the game: a boss would pick its resisted 120-power STAB over
	// the neutral coverage move that wins, and never recognised a finishable
	// target. Optional boost args let matchupScore rate a BENCHED candidate
	// (boostsOf falls through to the active foe's stages, which a bench mon
	// doesn't have).
	estimateDamage(user, target, m, ub, tb) {
		const mv = this.data.moves[m.id] || {};
		const pw = mv.power || AI_EST_POWER[m.id] || 0;
		if (!pw) return 0;
		const phys = (mv.category || 'Physical') === 'Physical';
		const A = this.statOf(user, ub || this.boostsOf(user), phys ? 'atk' : 'spa');
		const D = Math.max(1, this.statOf(target, tb || this.boostsOf(target), phys ? 'def' : 'spd'));
		const stabEff = (user.types.includes(mv.type) ? 1.5 : 1) * effectiveness(mv.type, target.types);
		const base = Math.floor(Math.floor(Math.floor(2 * user.level / 5 + 2) * pw * A / D) / 50) + 2;
		// a mon with no usable stat line (imported data can be sparse) falls back
		// to raw power as the damage stand-in rather than poisoning every
		// comparison with NaN — NaN never wins a `>`, so the AI would go random
		return Number.isFinite(base) ? Math.floor(base * stabEff) : Math.floor(pw * stabEff);
	}

	// how well candidate `c` lines up against the player's active mon: the share
	// of the target its best hit removes, minus how hard it gets hit back. Both
	// sides are ESTIMATED damage now (see estimateDamage) — the old version
	// compared base powers, so a bench mon with a huge move and no Attack stat
	// looked like a wall answer.
	matchupScore(c, target) {
		const fresh = freshBoosts();
		let off = 0;
		for (const m of c.moves) off = Math.max(off, this.estimateDamage(c, target, m, fresh, this.boostsOf(target)));
		let danger = 0;
		for (const m of target.moves) danger = Math.max(danger, this.estimateDamage(target, c, m, this.boostsOf(target), fresh));
		return 100 * off / Math.max(1, target.maxHP) - 40 * danger / Math.max(1, c.maxHP);
	}

	// boss-tier counter-switch: hard-countered (nothing lands >0.5x AND the
	// player hits us 2x+) and a meaningfully better answer is on the bench.
	// Cooldown keeps it from ping-ponging. Returns the bench index or -1.
	shouldFoeSwitch() {
		const a = this.active;
		if (!a.isTrainer || !a.info?.boss || a.double) return -1;
		if ((a.foeSwitchCd || 0) > 0) return -1;
		let ourBest = 0;
		for (const m of a.foe.moves) {
			const mv = this.data.moves[m.id] || {};
			if (mv.power || AI_EST_POWER[m.id]) ourBest = Math.max(ourBest, effectiveness(mv.type, a.me.types));
		}
		let theirBest = 0;
		for (const m of a.me.moves) {
			const mv = this.data.moves[m.id] || {};
			if (mv.power) theirBest = Math.max(theirBest, effectiveness(mv.type, a.foe.types));
		}
		if (ourBest > 0.5 || theirBest < 2) return -1;
		let best = -1, bestScore = this.matchupScore(a.foe, a.me) + 20;
		for (let i = 0; i < a.foes.length; i++) {
			const c = a.foes[i];
			if (c === a.foe || c.curHP <= 0) continue;
			const s = this.matchupScore(c, a.me);
			if (s > bestScore) { bestScore = s; best = i; }
		}
		return best;
	}

	resolveTurn(myMove) {
		const a = this.active;
		a.turnCount = (a.turnCount || 0) + 1;
		a.meSide.quickGuard = a.meSide.wideGuard = a.foeSide.quickGuard = a.foeSide.wideGuard = false;
		if (a.foeSwitchCd > 0) a.foeSwitchCd--;
		// boss counter-switch: replaces the foe's move and resolves first (like
		// any trainer switch), so your move hits the incoming mon
		const swIdx = a.foe.chargeMove ? -1 : this.shouldFoeSwitch();
		if (swIdx >= 0) {
			const next = a.foes[swIdx];
			a.foeSwitchCd = 3;
			this.pushMsg(`${a.info.displayName} withdrew ${a.foe.name}!`, () => this.clearVolatiles(a.foe));
			this.pushAnim('recall', 'foe', 0.4, () => { a.foeHidden = true; });
			this.pushMsg(`${a.info.displayName} sent out ${next.name}!`, () => {
				cry(next.speciesId);
				a.foe = next;
				a.foeIdx = swIdx;
				a.foeImg = a.foeSprites.get(next);
				a.foeBoosts = freshBoosts();
				a.foeShownHP = next.curHP;
				a.foeHidden = false;
			});
			this.pushAnim('enter', 'foe', 0.4);
			this.pushMsg('', () => { this.applyHazards(a.foe, 'foe'); this.switchInAbility(a.foe, 'foe'); });
			this.pushMsg('', () => { if (a.me.curHP > 0 && a.foe.curHP > 0) this.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, myMove, false); });
			this.pushMsg('', () => { if (a.foe.curHP > 0 && a.me.curHP > 0) this.endOfTurn(); });
			this.pushMsg('', () => this.checkFaints());
			return;
		}
		// boss potion: once per battle at low HP, in place of the foe's move
		let foePotion = false;
		if (a.isTrainer && a.info?.boss && !a.foePotionUsed && !a.foe.chargeMove
			&& a.foe.curHP > 0 && a.foe.curHP <= a.foe.maxHP * 0.25) {
			a.foePotionUsed = true;
			foePotion = true;
		}
		const foeMove = this.chooseFoeMove();
		// Prankster: status moves gain +1 priority
		const myPrio = this.movePriority(a.me, myMove);
		const foePrio = this.movePriority(a.foe, foeMove);
		let mySpe = this.statOf(a.me, a.meBoosts, 'spe') * (a.meSide?.tailwind > 0 ? 2 : 1);
		let foeSpe = this.statOf(a.foe, a.foeBoosts, 'spe') * (a.foeSide?.tailwind > 0 ? 2 : 1);
		if (this.itemFx(a.me)?.choice === 'spe') mySpe *= 1.5;
		if (this.itemFx(a.foe)?.choice === 'spe') foeSpe *= 1.5;
		if (a.me.unburdened) mySpe *= 2;
		if (a.foe.unburdened) foeSpe *= 2;
		// Trick Room inverts speed order; Quick Claw jumps the speed bracket even
		// then (it never outruns higher move priority)
		if (a.fieldFx.trickRoom > 0) { mySpe = -mySpe; foeSpe = -foeSpe; }
		const myQC = !!this.itemFx(a.me)?.quickClaw && Math.random() < 0.2;
		const foeQC = !!this.itemFx(a.foe)?.quickClaw && Math.random() < 0.2;
		// STALL waits for everyone else inside its priority bracket
		const myStall = this.abilityOf(a.me) === 'stall', foeStall = this.abilityOf(a.foe) === 'stall';
		const meFirst = myPrio !== foePrio ? myPrio > foePrio
			: myStall !== foeStall ? foeStall
			: myQC !== foeQC ? myQC
			: (mySpe === foeSpe ? Math.random() < 0.5 : mySpe > foeSpe);

		const myAct = () => this.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, myMove, false);
		const foeAct = foePotion
			? () => this.pushMsg(`${a.info.displayName} used a HYPER POTION on ${a.foe.name}!`, () => {
				// half the mon's own health, floored at the old flat 120 — a flat
				// number meant a Lv255 ace "healed" a sliver and the whole beat
				// read as broken, while its Sitrus Berry out-healed the trainer
				a.foe.curHP = Math.min(a.foe.maxHP, a.foe.curHP + Math.max(120, Math.floor(a.foe.maxHP / 2)));
			})
			: () => this.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, foeMove, true);
		// a trainer's item use preempts moves, like the real games
		const [first, second] = (meFirst && !foePotion) ? [myAct, foeAct] : [foeAct, myAct];

		first();
		this.pushMsg('', () => {
			if (a.foe.curHP > 0 && a.me.curHP > 0) second();
		});
		this.pushMsg('', () => {
			if (a.foe.curHP > 0 && a.me.curHP > 0) this.endOfTurn();
		});
		this.pushMsg('', () => this.checkFaints());
	}

	checkFaints() {
		const a = this.active;
		this.checkFormTriggers(); // HP dropped past a threshold → Zen Mode / Schooling / Power Construct
		const meDown = a.me.curHP <= 0;
		if (a.foe.curHP <= 0) {
			this.pushMsg(a.isTrainer ? `${a.foe.name} fainted!` : `The wild ${a.foe.name} fainted!`,
				() => cry(a.foe.speciesId));
			this.pushAnim('faint', 'foe', 0.7, () => { a.foeHidden = true; });
			this.grantExp();
		}
		if (meDown) {
			this.pushMsg(`${a.me.name} fainted!`, () => { cry(a.me.speciesId); this.clearVolatiles(a.me, true); });
			this.pushAnim('faint', 'me', 0.7, () => { a.meHidden = true; });
			const next = a.party.find(m => m.curHP > 0);
			if (next) {
				this.queueSendOut(`Go! ${next.name}!`, next, 'me', () => {
					a.me = next;
					a.meImg = a.backSprites.get(next);
					a.meBoosts = freshBoosts();
					a.meShownHP = next.curHP;
					if (a.healingWish) {
						a.healingWish = false;
						next.curHP = next.maxHP;
						next.status = null;
					}
				});
				this.pushMsg('', () => { this.applyHazards(a.me, 'me'); this.switchInAbility(a.me, 'me'); });
			} else {
				this.pushMsg('You blacked out...', () => this.finish('defeat'));
			}
		}
	}

	// exp -> level ups -> stat recalc -> move learning (medium-fast curve).
	// In a double battle every active mon on your side shares the yield.
	// The AWARD half of grantExp, tail-free: who earns what from this foe.
	// Split out so CATCHING can pay experience too — grantExp's tail assumes a KO
	// and decides whether the battle is over (finish / send the next trainer mon),
	// which is exactly wrong after a successful ball. Reusing the whole function
	// there turned every catch into a phantom 'victory'.
	awardBattleExp(fallen) {
		const a = this.active;
		const gain = expGain(fallen || a.foe, this.data);
		const winners = a.double
			? [a.me, a.meAlly].filter(m => m && m.curHP > 0)
			: [a.me.curHP > 0 ? a.me : (a.meAlly?.curHP > 0 ? a.meAlly : a.me)].filter(Boolean);
		// LUCKY EGG multiplies its holder's own share (and only its own)
		const heldOf = m => Bag.ITEMS[m?.heldItem]?.held || null;
		const share = m => Math.max(1, Math.round(gain * (heldOf(m)?.expBoost || 1)));
		for (const mon of winners) { this.awardExp(mon, share(mon)); this.awardEvs(mon, fallen || a.foe); }
		// EXP. SHARE: a benched party member holding one earns HALF, and takes
		// nothing away from the POKeMON that actually fought. Exp is per-active
		// here — there is no party-wide default — so without this the item does
		// nothing at all. The level cap still applies: awardExp clamps.
		for (const mon of a.party) {
			if (!mon || mon.curHP <= 0 || winners.includes(mon)) continue;
			if (!heldOf(mon)?.expShare) continue;
			this.awardExp(mon, Math.max(1, Math.round(share(mon) / 2)));
		}
	}

	grantExp(fallen) {
		this.awardBattleExp(fallen);
		const a = this.active;
		// trainer battles continue to the next foe mon; wild battles are over
		this.pushMsg('', () => {
			const a2 = this.active;
			// DOUBLES STOP HERE. checkFaintsD owns both halves of this decision:
			// it refills the emptied slot from the bench and, only once
			// livingFoes()/livingMine() is empty, ends the battle. Running this
			// singles-shaped tail as well ended a WILD double the instant one of
			// the two wild POKeMON fainted — reported by a tester, reproduced in
			// doubles_test before the fix. (Trainer doubles were unaffected: they
			// went down the cursor branch, which refilled rather than finishing.)
			if (a2.double) return;
			// Singles pick alive-aware — mid-battle boss switches break the party
			// order — with bosses sending their best matchup and route trainers
			// keeping party order.
			const alive = a2.isTrainer ? a2.foes.filter(m => m !== a2.foe && m.curHP > 0) : [];
			if (a2.isTrainer && alive.length) {
				const next = a2.info?.boss && alive.length > 1
					? alive.reduce((x, y) => this.matchupScore(y, a2.me) > this.matchupScore(x, a2.me) ? y : x)
					: alive[0];
				a2.foeIdx = a2.foes.indexOf(next);
				this.pushMsg(`${a2.info.displayName} sent out ${next.name}!`, () => {
					cry(next.speciesId);
					a2.foe = next;
					a2.foeImg = a2.foeSprites.get(next);
					a2.foeBoosts = freshBoosts();
					a2.foeShownHP = next.curHP;
					a2.foeHidden = false;
				});
				this.pushAnim('enter', 'foe', 0.4);
				this.pushMsg('', () => { this.applyHazards(a2.foe, 'foe'); this.switchInAbility(a2.foe, 'foe'); });
			} else if (a2.isTrainer) {
				this.pushMsg(a2.info.defeatText);
				this.pushMsg(`You got $${this.prizeMoney()} for winning!`, () => this.finish('victory'));
			} else {
				this.finish('victory');
			}
		});
	}

	// EVs: defeating a species pays +2 effort in its HIGHEST base stat (a simple
	// stand-in for per-species yield tables), capped 252 per stat / 510 total.
	// Stats fold the effort in silently at the next level-up recalc or vitamin.
	awardEvs(mon, fallen) {
		const b = this.data.species[fallen?.speciesId]?.baseStats;
		if (!b) return;
		mon.evs = mon.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
		let total = Object.values(mon.evs).reduce((x, y) => x + y, 0);
		if (total >= 510) return;
		const brace = this.itemFx(mon)?.evBoost || 1;   // MACHO BRACE doubles earned EVs
		// The REAL per-species yield when the table knows the species — so a Zubat
		// trains Speed and a Shuckle trains defenses, and targeted EV training by
		// picking opponents finally works. The old rule (+2 to the fallen mon's
		// highest base stat) stays as the fallback for species outside the table.
		const yields = this.data.evYields?.[fallen?.speciesId];
		const entries = yields
			? Object.entries(yields).filter(([, n]) => n > 0)
			: [[['hp', 'atk', 'def', 'spa', 'spd', 'spe'].reduce((a2, k) => (b[k] || 0) > (b[a2] || 0) ? k : a2, 'hp'), 2]];
		for (const [stat, n] of entries) {
			if (total >= 510) break;
			const gain = Math.min(n * brace, 510 - total, 252 - (mon.evs[stat] || 0));
			if (gain <= 0) continue;
			mon.evs[stat] = (mon.evs[stat] || 0) + gain;
			total += gain;
		}
	}

	// give one mon its exp, handle level-ups (stat recalc + move learning)
	awardExp(mon, gain) {
		const a = this.active;
		mon.exp = (mon.exp ?? expForLevel(mon.level)) + gain;
		// SOOTHE BELL multiplies every friendship gain its holder earns. Friendship
		// drives the friendship evolutions in evolution.js, so this is the item's
		// whole point — without it the bell did nothing at all.
		const bell = this.itemFx(mon)?.friendBoost || 1;
		mon.friend = Math.min(255, (mon.friend ?? 70) + 2 * bell);
		this.pushMsg(`${mon.name} gained ${gain} EXP!`);
		const sp = this.data.species[mon.speciesId];
		const cap = Math.max(1, this.levelCap || CLASSIC_MAX_LEVEL);
		while (mon.level < Math.min(MAX_LEVEL, cap) && mon.exp >= expForLevel(mon.level + 1)) {
			mon.level++;
			mon.friend = Math.min(255, (mon.friend ?? 70) + 1 * bell);
			const lvl = mon.level;
			this.pushMsg(`${mon.name} grew to Lv${lvl}!`, () => {
				sfx('levelup');
				const ivs = mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
				const oldMax = mon.maxHP;
				const before = { ...mon.stats };
				mon.stats = statsFor(sp, ivs, lvl, mon);
				// the level-up recalc is the new canonical statline — don't let a
				// Transform-snapshot restore roll it back after the battle
				if (mon._origStats) mon._origStats = { ...mon.stats };
				mon.maxHP = mon.stats.hp;
				mon.curHP = Math.min(mon.maxHP, mon.curHP + (mon.maxHP - oldMax));
				if (mon === a.me) a.meShownHP = mon.curHP;
				else if (mon === a.meAlly) a.meAllyShownHP = mon.curHP;
				// the stat-gain window, GBA style — leveling used to recalc silently,
				// which made growth weightless. Queued from inside the callback so it
				// reads the freshly computed statline.
				const gain = k => (mon.stats[k] || 0) - (before[k] || 0);
				this.pushMsg(`HP +${gain('hp')}  ATK +${gain('atk')}  DEF +${gain('def')}\nSP.A +${gain('spa')}  SP.D +${gain('spd')}  SPE +${gain('spe')}`);
			});
			for (const [lv, mid] of sp.learnset) {
				if (lv !== lvl || mon.moves.some(m => m.id === mid)) continue;
				if (mon.moves.length < 4) {
					this.pushMsg(`${mon.name} learned ${this.data.moves[mid]?.name || mid}!`,
						() => mon.moves.push(makeMove(mid, this.data)));
				} else {
					const name = this.data.moves[mid]?.name || mid;
					this.pushMsg(`${mon.name} wants to learn ${name}!`, () => {
						a.learn = { mid, name, mon };
						a.learnIdx = 0;
						a.phase = 'learn';
					});
				}
			}
		}
		// Having grown as far as the cap allows, hold EXP one point short of the
		// next level: nothing is thrown away, nothing banks into a windfall, and
		// the moment the cap lifts this mon levels on its next battle. Runs AFTER
		// the loop so a mon that levels INTO the cap is caught too. Mons already
		// above the cap (gifts, trades) are never de-levelled.
		if (mon.level >= cap && mon.level < MAX_LEVEL && mon.exp >= expForLevel(mon.level + 1)) {
			mon.exp = expForLevel(mon.level + 1) - 1;
			this.pushMsg(`${mon.name} is at the LEVEL CAP!`);
		}
	}

	// Gen3-style catch: HP factor + species rate x ball multiplier, 4 shakes
	throwBall(ballName = 'POKe BALL', ballMult = 1) {
		const a = this.active;
		this.pushMsg(`You threw a ${ballName}!`);
		this.pushAnim('ballthrow', 'foe', 0.55, () => { sfx('ball_open'); a.foeHidden = true; a.ballShown = true; });
		const rate = (this.data.extra?.[a.foe.speciesId]?.catch ?? 45) * ballMult;
		const statusBonus = a.foe.status === 'slp' || a.foe.status === 'frz' ? 2
			: a.foe.status ? 1.5 : 1;
		const f = Math.max(1, Math.floor((3 * a.foe.maxHP - 2 * a.foe.curHP) * rate * statusBonus / (3 * a.foe.maxHP)));
		const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / f)));
		let shakes = 0;
		while (shakes < 4 && Math.floor(Math.random() * 65536) < b) shakes++;
		for (let i = 1; i <= Math.min(shakes, 3); i++) this.pushAnim('ballshake', 'foe', 0.7, () => sfx('ball_drop'));
		if (shakes >= 4) {
			this.pushAnim('ballcatch', 'foe', 0.5, () => sfx('ball_drop'));
			this.pushMsg(`Gotcha! ${a.foe.name} was caught!`, () => { sfx('fanfare_capture'); a.caughtMon = a.foe; });
			// Catching pays experience like a KO (the Gen-6 rule). It used to pay
			// nothing, which quietly taught players that catching is bad for training.
			// The AWARD half only — grantExp's tail decides "is the battle over" on
			// KO logic and would report this catch as a victory.
			this.awardBattleExp();
			this.pushMsg('', () => this.finish('caught'));
		} else {
			this.pushAnim('ballbreak', 'foe', 0.35, () => { sfx('ball_open'); a.foeHidden = false; a.ballShown = false; });
			this.pushMsg(`Oh no! The ${a.foe.name} broke free!`);
			this.pushMsg('', () => {
				this.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, this.chooseFoeMove(), true);
			});
			this.pushMsg('', () => this.checkFaints());
		}
	}

	// ---------- SAFARI GAME ----------
	// No fighting in the Safari Zone: you throw BALLS, BAIT and ROCKS while the
	// wild mon decides each turn whether to bolt. Bait halves the catch odds but
	// also halves the flee odds; a rock doubles both — the classic tension. The
	// foe never attacks, and its HP stays full, which is exactly why safari
	// catches feel like gambling.
	safariBall() {
		const a = this.active, sess = a.safari;
		if (sess.balls <= 0) { this.pushMsg('No SAFARI BALLS left!'); return; }
		sess.balls--;
		this.pushMsg(`You threw a SAFARI BALL! (${sess.balls} left)`);
		this.pushAnim('ballthrow', 'foe', 0.55, () => { sfx('ball_open'); a.foeHidden = true; a.ballShown = true; });
		const mood = a.safariMood?.kind;
		// Safari Ball = 1.5x, bait/rock swing the factor the way gen 3 swings it
		const rate = (this.data.extra?.[a.foe.speciesId]?.catch ?? 45) * 1.5
			* (mood === 'angry' ? 2 : mood === 'eating' ? 0.5 : 1);
		const f = Math.max(1, Math.floor((3 * a.foe.maxHP - 2 * a.foe.curHP) * rate / (3 * a.foe.maxHP)));
		const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / f)));
		let shakes = 0;
		while (shakes < 4 && Math.floor(Math.random() * 65536) < b) shakes++;
		for (let i = 1; i <= Math.min(shakes, 3); i++) this.pushAnim('ballshake', 'foe', 0.7, () => sfx('ball_drop'));
		if (shakes >= 4) {
			this.pushAnim('ballcatch', 'foe', 0.5, () => sfx('ball_drop'));
			this.pushMsg(`Gotcha! ${a.foe.name} was caught!`, () => { sfx('fanfare_capture'); a.caughtMon = a.foe; });
			this.awardBattleExp();
			this.pushMsg('', () => this.finish('caught'));
		} else {
			this.pushAnim('ballbreak', 'foe', 0.35, () => { sfx('ball_open'); a.foeHidden = false; a.ballShown = false; });
			this.pushMsg(`Oh no! The ${a.foe.name} broke free!`);
			this.safariFoeTurn();
		}
	}
	safariBait() {
		const a = this.active;
		a.safariMood = { kind: 'eating', turns: 2 + Math.floor(Math.random() * 5) };
		this.pushMsg('You tossed some bait.');
		this.pushMsg(`The wild ${a.foe.name} is eating!`);
		this.safariFoeTurn();
	}
	safariRock() {
		const a = this.active;
		a.safariMood = { kind: 'angry', turns: 2 + Math.floor(Math.random() * 5) };
		this.pushMsg('You threw a rock.');
		this.pushMsg(`The wild ${a.foe.name} is angry!`);
		this.safariFoeTurn();
	}
	// the wild mon's whole turn: tick the mood, then roll to bolt. Rare species
	// (low catch rate) bolt sooner — Chansey energy; commons hang around.
	safariFoeTurn() {
		const a = this.active;
		this.pushMsg('', () => {
			const catchRate = this.data.extra?.[a.foe.speciesId]?.catch ?? 45;
			let flee = catchRate <= 30 ? 0.4 : catchRate <= 75 ? 0.25 : 0.12;
			const mood = a.safariMood;
			if (mood?.kind === 'eating') flee *= 0.5;
			if (mood?.kind === 'angry') flee *= 2;
			if (mood && --mood.turns <= 0) {
				a.safariMood = null;
				this.pushMsg(mood.kind === 'eating'
					? `The wild ${a.foe.name} finished eating.`
					: `The wild ${a.foe.name} calmed down.`);
			}
			if (Math.random() < flee) {
				this.pushMsg(`The wild ${a.foe.name} fled!`, () => { sfx('flee'); this.finish('escaped'); });
			} else if (a.safari.balls <= 0) {
				this.pushMsg('PA: You are out of SAFARI BALLS!', () => { sfx('flee'); this.finish('escaped'); });
			} else {
				this.pushMsg(`The wild ${a.foe.name} is watching carefully...`);
			}
		});
	}

	tryRun() {
		const a = this.active;
		a.runAttempts++;
		const mySpe = a.me.stats.spe, foeSpe = a.foe.stats.spe;
		// SMOKE BALL is a guaranteed escape from a wild battle, like Run Away —
		// tryRun is only reachable from wild encounters, so it cannot skip trainers.
		const pinned = this.trappedBy(a.me);
		let ok = !pinned && (mySpe >= foeSpe || this.abilityOf(a.me) === 'runaway'
			|| !!this.itemFx(a.me)?.fleeAlways);
		if (!ok) {
			const f = (Math.floor(mySpe * 128 / foeSpe) + 30 * a.runAttempts) % 256;
			ok = Math.floor(Math.random() * 256) < f;
		}
		if (ok) this.pushMsg('Got away safely!', () => { sfx('flee'); this.finish('escaped'); });
		else {
			this.pushMsg("Can't escape!");
			this.pushMsg('', () => {
				this.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, this.chooseFoeMove(), true);
			});
			this.pushMsg('', () => this.checkFaints());
		}
	}

	finish(result) {
		const a = this.active;
		// a triumphant fanfare on a win (wild + trainer) — every other big beat
		// already had one; victory was silent
		if (result === 'victory') sfx('fanfare_victory');
		for (const m of a.party) this.clearVolatiles(m, true);
		a.result = result;
		a.phase = 'done';
	}

	// ---------- input ----------
	key(k) {
		const a = this.active;
		if (!a) return;
		// the little sounds: menus tick, confirm and cancel; text advances blip
		if (['menu', 'moves', 'bag', 'switch', 'target', 'learn'].includes(a.phase)) {
			if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) sfx('ui_move');
			else if (k === 'z' || k === 'Enter') sfx('ui_select');
			else if (k === 'x') sfx('ui_cancel');
		}
		// advance message
		if (a.phase === 'msg' && (k === 'z' || k === 'Enter')) { sfx('text_tick'); this.fastForward(); return; }
		if (a.phase === 'menu') {
			// SAFARI GAME: the whole menu is BALL/BAIT/ROCK/RUN — no fighting, no
			// bag, no switching. R throws a ball, same shortcut as a normal capture.
			if (a.safari) {
				if (k === 'r') { this.startQueue(() => this.safariBall()); return; }
				if (k === 'ArrowLeft' || k === 'ArrowRight') a.menuIdx ^= 1;
				if (k === 'ArrowUp' || k === 'ArrowDown') a.menuIdx ^= 2;
				if (k === 'z' || k === 'Enter') {
					if (a.menuIdx === 0) this.startQueue(() => this.safariBall());
					else if (a.menuIdx === 1) this.startQueue(() => this.safariBait());
					else if (a.menuIdx === 2) this.startQueue(() => this.safariRock());
					else this.startQueue(() => this.pushMsg('Got away safely!', () => { sfx('flee'); this.finish('escaped'); }));
				}
				return;
			}
			// R re-throws the ball you last used. A break-free used to send you
			// back through BAG -> scroll the flat list -> find it -> confirm, on
			// every single throw of a long capture.
			if (k === 'r' && !a.isTrainer && a.lastBall && Bag.count(a.lastBall) > 0
				&& (!a.double || a.actionFor === 0)) {
				this.useItem(a.lastBall);
				return;
			}
			// 2x2: FIGHT(0) BAG(1) / PKMN(2) RUN(3)
			if (k === 'ArrowLeft' || k === 'ArrowRight') a.menuIdx ^= 1;
			if (k === 'ArrowUp' || k === 'ArrowDown') a.menuIdx ^= 2;
			if (k === 'z' || k === 'Enter') {
				if (a.menuIdx === 0) {
					const who = a.double ? this.chooser() : a.me;
					// out of PP everywhere: Struggle instead of a dead menu
					if (who.moves.every(m => m.pp <= 0)) {
						if (a.double) this.planMove(STRUGGLE());
						else {
							this.startQueue(() => {
								this.pushMsg(`${a.me.name} has no moves left!`);
								this.resolveTurn(STRUGGLE());
							});
						}
					} else { a.phase = 'moves'; a.moveIdx = 0; a.swapFrom = null; }
				}
				else if (a.menuIdx === 1) { if (!a.double || a.actionFor === 0) { a.phase = 'bag'; a.bagIdx = 0; } }
				else if (a.menuIdx === 2) {
					// switchTo only swaps the lead slot, so like bag it is the lead's action
					const options = a.party.filter(m => m !== a.me && m !== a.meAlly && m.curHP > 0);
					const pinned = this.trappedBy(a.actionFor === 1 && a.meAlly ? a.meAlly : a.me);
					if (pinned) this.startQueue(() => this.pushMsg(`Can't switch — held by ${pinned}!`));
					else if (options.length && (!a.double || a.actionFor === 0)) { a.phase = 'switch'; a.switchIdx = 0; }
				} else {
					if (a.isTrainer) this.startQueue(() => this.pushMsg("There's no running from a trainer battle!"));
					else this.startQueue(() => this.tryRun());
				}
			}
		} else if (a.phase === 'bag') {
			const items = this.bagItems();
			if (!items.length) { a.phase = 'menu'; return; }
			if (k === 'ArrowUp') a.bagIdx = (a.bagIdx + items.length - 1) % items.length;
			if (k === 'ArrowDown') a.bagIdx = (a.bagIdx + 1) % items.length;
			if (k === 'x') a.phase = 'menu';
			if (k === 'z' || k === 'Enter') this.useItem(items[a.bagIdx].id);
		} else if (a.phase === 'switch') {
			const options = a.party.filter(m => m !== a.me && m !== a.meAlly && m.curHP > 0);
			if (!options.length) { a.phase = 'menu'; return; }
			if (k === 'ArrowUp') a.switchIdx = (a.switchIdx + options.length - 1) % options.length;
			if (k === 'ArrowDown') a.switchIdx = (a.switchIdx + 1) % options.length;
			if (k === 'x') a.phase = 'menu';
			if (k === 'z' || k === 'Enter') this.switchTo(options[a.switchIdx]);
		} else if (a.phase === 'moves') {
			const who = a.double ? this.chooser() : a.me;
			const n = who.moves.length;
			if (k === 'ArrowUp' && a.moveIdx >= 2) a.moveIdx -= 2;
			if (k === 'ArrowDown' && a.moveIdx + 2 < n) a.moveIdx += 2;
			if (k === 'ArrowLeft' && a.moveIdx % 2 === 1) a.moveIdx--;
			if (k === 'ArrowRight' && a.moveIdx % 2 === 0 && a.moveIdx + 1 < n) a.moveIdx++;
			// S arms slot-swapping on the highlighted move; choosing another slot
			// swaps them (same slot or X cancels). The order lives on the mon, so
			// it carries out of battle and into every later fight.
			if (k === 's') { a.swapFrom = a.swapFrom == null ? a.moveIdx : null; sfx('ui_select'); return; }
			if (k === 'x') {
				if (a.swapFrom != null) { a.swapFrom = null; sfx('ui_cancel'); return; }
				a.phase = 'menu';
			}
			if (k === 'z' || k === 'Enter') {
				if (a.swapFrom != null) {
					const from = a.swapFrom;
					a.swapFrom = null;
					if (from !== a.moveIdx && who.moves[from] && who.moves[a.moveIdx]) {
						[who.moves[from], who.moves[a.moveIdx]] = [who.moves[a.moveIdx], who.moves[from]];
						sfx('ui_select');
					}
					return;
				}
				const mv = who.moves[a.moveIdx];
				if (this.moveUsable(who, mv, 'me')) {
					if (a.double) this.planMove(mv);
					else this.startQueue(() => this.resolveTurn(mv));
				} else {
					// silent no-op on a blocked move reads as a missed tap — say why
					this.startQueue(() => this.pushMsg(mv.pp <= 0
						? `There's no PP left for ${mv.name}!`
						: `${mv.name} can't be used right now!`));
				}
			}
		} else if (a.phase === 'target') {
			const foes = this.livingFoes();
			if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
				a.targetIdx = (a.targetIdx + 1) % foes.length;
			}
			if (k === 'x') { a.phase = 'moves'; a.pendingPlan = null; }
			if (k === 'z' || k === 'Enter') {
				const plan = a.pendingPlan;
				a.pendingPlan = null;
				this.pushPlan({ ...plan, target: foes[a.targetIdx] || foes[0] });
			}
			} else if (a.phase === 'learn') {
			if (k === 'ArrowLeft' || k === 'ArrowUp') a.learnIdx = (a.learnIdx + 4) % 5;
			if (k === 'ArrowRight' || k === 'ArrowDown') a.learnIdx = (a.learnIdx + 1) % 5;
			if (k === 'z' || k === 'Enter') this.resolveLearn(a.learnIdx === 4 ? -1 : a.learnIdx);
		}
	}

	startQueue(fn) {
		const a = this.active;
		fn();
		a.phase = 'msg';
	}

	// ---------- extended status-move systems ----------
	// handles every classified MOVE_FX kind; returns true when the move is done
	statusFx(fx, user, userBoosts, target, targetBoosts, move, isFoe) {
		const a = this.active;
		const mySide = isFoe ? 'foe' : 'me';
		// Corrosive Gas: melt the target's held item (no damage)
		if (fx.corrode) {
			if (!target.heldItem) { this.pushMsg('But it failed!'); return true; }
			if (this.abilityOf(target) === 'stickyhold') { this.pushMsg(`${target.name}'s Sticky Hold kept its item!`); return true; }
			this.pushMsg(`Corrosive gas melted ${target.name}'s ${this.itemName(target)}!`, () => {
				target.heldItem = null;
				if (this.abilityOf(target) === 'unburden') target.unburdened = true;
			});
			return true;
		}
		const sideOf = s => s === 'me' ? a.meSide : a.foeSide;
		const hazardsOf = s => s === 'me' ? a.meHazards : a.foeHazards;
		const boostWords = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', acc: 'accuracy', eva: 'evasiveness' };
		const applyBoosts = (boosts, who, stats, copied) => {
			const ab4 = this.abilityOf(who);
			const arrows = { atk: 'ATK', def: 'DEF', spa: 'SP.A', spd: 'SP.D', spe: 'SPE', acc: 'ACC', eva: 'EVA' };
			const gains = {};
			for (let [st, d] of Object.entries(stats)) {
				if (ab4 === 'contrary') d = -d;
				if (ab4 === 'simple') d *= 2;
				const before = boosts[st] ?? 0;
				boosts[st] = Math.max(-6, Math.min(6, before + d));
				if (boosts[st] !== before) {
					if (boosts[st] > before) gains[st] = boosts[st] - before;
					this.pushMsg(`${who.name}'s ${boostWords[st]} ${d > 1 ? 'rose sharply' : d > 0 ? 'rose' : d < -1 ? 'fell harshly' : 'fell'}!`);
					// visible punch: the text line alone made buff turns read as
					// nothing happening — float the arrow on the sprite too
					sfx(d > 0 ? 'stat_up' : 'stat_dn');
					this.float(this.sideOfMon(who), `${arrows[st] || st}${d > 0 ? '↑' : '↓'}${Math.abs(d) > 1 ? Math.abs(d) : ''}`,
						d > 0 ? '#6be08a' : '#e0736b');
				}
			}
			// OPPORTUNIST: the other side's watcher mirrors stat GAINS as they land
			// (never re-copies a copy, so two Opportunists can't ping-pong)
			if (!copied && Object.keys(gains).length && !a.double) {
				const opp = this.sideOfMon(who) === 'me' ? a.foe : a.me;
				if (opp && opp.curHP > 0 && this.abilityOf(opp) === 'opportunist') {
					this.pushMsg(`${opp.name}'s Opportunist copies the boost!`);
					applyBoosts(this.boostsOf(opp), opp, gains, true);
				}
			}
		};

		// ---- ally support (doubles) ----
		// The ally of whoever used the move; null in a single battle, where all of
		// these correctly fail.
		const allyOf = (mon) => {
			if (!a.double) return null;
			if (mon === a.me) return a.meAlly; if (mon === a.meAlly) return a.me;
			if (mon === a.foe) return a.foeAlly; if (mon === a.foeAlly) return a.foe;
			return null;
		};
		if (fx.helpingHand) {
			const ally = allyOf(user);
			if (!ally || ally.curHP <= 0) { this.pushMsg('But it failed!'); return true; }
			ally.helpingHand = true;   // consumed by the damage calc this turn
			this.pushMsg(`${user.name} is ready to help ${ally.name}!`);
			return true;
		}
		if (fx.centerTaunt) {
			if (!a.double) { this.pushMsg('But it failed!'); return true; }
			user.centerOfAttention = true;
			this.pushMsg(`${user.name} became the center of attention!`);
			return true;
		}
		if (fx.allySwitch) {
			const ally = allyOf(user);
			if (!ally || ally.curHP <= 0) { this.pushMsg('But it failed!'); return true; }
			if (user === a.me || user === a.meAlly) [a.me, a.meAlly] = [a.meAlly, a.me];
			else [a.foe, a.foeAlly] = [a.foeAlly, a.foe];
			this.pushMsg(`${user.name} and ${ally.name} switched places!`);
			return true;
		}
		if (fx.allyBoost) {
			const ally = allyOf(user);
			if (!ally || ally.curHP <= 0) { this.pushMsg('But it failed!'); return true; }
			const b = this.boostsOf(ally);
			for (const [st, d] of Object.entries(fx.allyBoost)) {
				b[st] = Math.max(-6, Math.min(6, (b[st] || 0) + d));
			}
			this.pushMsg(`${ally.name}'s stats rose!`);
			return true;
		}
		if (fx.allyCrit) {
			// DRAGON CHEER: the partner rides the Focus Energy machinery
			const ally = allyOf(user);
			if (!ally || ally.curHP <= 0 || ally.focusEnergy) { this.pushMsg('But it failed!'); return true; }
			ally.focusEnergy = true;
			this.pushMsg(`${user.name}'s cheer fired ${ally.name} up!`);
			return true;
		}
		if (fx.festMsg) { this.pushMsg(fx.festMsg); return true; }
		if (fx.happyHour) {
			this.pushMsg('Everyone is caught up in the happy atmosphere!', () => { a.happyHour = true; });
			return true;
		}
		if (fx.embargo) {
			if (target.embargoTurns > 0) { this.pushMsg('But it failed!'); return true; }
			target.embargoTurns = 5;
			this.pushMsg(`${target.name} can't use items anymore!`);
			return true;
		}
		if (fx.healBlock) {
			if (target.healBlockTurns > 0) { this.pushMsg('But it failed!'); return true; }
			target.healBlockTurns = 5;
			this.pushMsg(`${target.name} was prevented from healing!`);
			return true;
		}
		if (fx.imprison) {
			if (user.imprisoning) { this.pushMsg('But it failed!'); return true; }
			user.imprisoning = true;
			this.pushMsg(`${user.name} sealed the moves it knows —\nits foes can't use them!`);
			return true;
		}
		if (fx.grudgeSelf) {
			user.grudged = true;
			this.pushMsg(`${user.name} wants its foe to bear a GRUDGE!`);
			return true;
		}
		if (fx.teatime) {
			const eaters = this.actorMons().filter(m => m.heldItem && /berry$/.test(m.heldItem) && Bag.ITEMS[m.heldItem]?.held);
			this.pushMsg(eaters.length ? 'Tea time! Everyone dug into their berries!' : 'But nothing happened!');
			for (const m of eaters) {
				const held = Bag.ITEMS[m.heldItem].held;
				this.pushMsg(`${m.name} ate its ${Bag.ITEMS[m.heldItem].name}!`, () => {
					if (held.berryHeal) m.curHP = Math.min(m.maxHP, m.curHP + held.berryHeal);
					if (held.berryHealFrac) m.curHP = Math.min(m.maxHP, m.curHP + Math.max(1, Math.floor(m.maxHP * held.berryHealFrac)));
					if (held.cure) {
						if (held.cure === 'any' || held.cure === m.status) { m.status = null; delete m.badPsn; delete m.toxicN; }
						if (held.cure === 'any' || held.cure === 'confusion') delete m.confuseTurns;
					}
					if (held.ppRestore) { const mv = (m.moves || []).find(x => x.pp < x.maxPp); if (mv) mv.pp = Math.min(mv.maxPp, mv.pp + held.ppRestore); }
					m.heldItem = null;
					if (this.abilityOf(m) === 'unburden') m.unburdened = true;
				});
			}
			return true;
		}
		if (fx.electrifyTarget) {
			target.electrified = true; // consumed by the type-rewrite chain, cleared each turn
			this.pushMsg(`${target.name}'s moves were electrified!`);
			return true;
		}
		if (fx.ionDeluge) {
			a.fieldFx.ionDeluge = 1; // this turn only
			this.pushMsg('A deluge of ions showers the battlefield!\nNormal moves turn Electric!');
			return true;
		}
		if (fx.noop) { this.pushMsg('But it failed!'); return true; }
		if (fx.itemSwap) {
			if (this.abilityOf(target) === 'stickyhold' || (!user.heldItem && !target.heldItem)) {
				this.pushMsg('But it failed!');
				return true;
			}
			const t = user.heldItem || null;
			user.heldItem = target.heldItem || null;
			target.heldItem = t;
			this.pushMsg(`${user.name} swapped items with ${target.name}!`);
			return true;
		}
		if (fx.itemGive) {
			if (user.heldItem && !target.heldItem) {
				target.heldItem = user.heldItem;
				user.heldItem = null;
				this.pushMsg(`${user.name} bestowed its item on ${target.name}!`);
			} else this.pushMsg('But it failed!');
			return true;
		}
		if (fx.recycle) {
			if (!user.consumedItem || user.heldItem) { this.pushMsg('But it failed!'); return true; }
			user.heldItem = user.consumedItem;
			user.consumedItem = null;
			this.pushMsg(`${user.name} recycled its ${this.itemName(user)}!`);
			return true;
		}
		if (fx.splashMsg) { this.pushMsg('But nothing happened!'); return true; }
		if (fx.weather) {
			const names = { rain: 'It started to rain!', sun: 'The sunlight turned harsh!', sand: 'A sandstorm brewed!', hail: 'It started to hail!' };
			if (a.weather?.kind === fx.weather) { this.pushMsg('But it failed!'); return true; }
			a.weather = { kind: fx.weather, turns: 5 };
			this.pushMsg(names[fx.weather]);
			return true;
		}
		if (fx.terrain) {
			if (a.terrain?.kind === fx.terrain) { this.pushMsg('But it failed!'); return true; }
			a.terrain = { kind: fx.terrain, turns: 5 };
			this.pushMsg(`The battlefield became ${fx.terrain}!`);
			return true;
		}
		if (fx.field) {
			if (a.fieldFx[fx.field] > 0) { a.fieldFx[fx.field] = 0; this.pushMsg('The effect wore off!'); return true; }
			a.fieldFx[fx.field] = 5;
			this.pushMsg({ trickRoom: `${user.name} twisted the dimensions!`, gravity: 'Gravity intensified!',
				mudSport: 'Electric moves were weakened!', waterSport: 'Fire moves were weakened!',
				magicRoom: 'Items lost their power!', wonderRoom: 'Defense and Sp. Def swapped for everyone!' }[fx.field]);
			return true;
		}
		if (fx.side) {
			const s = sideOf(mySide);
			if (s[fx.side] > 0) { this.pushMsg('But it failed!'); return true; }
			s[fx.side] = fx.turns;
			this.pushMsg({ tailwind: `A tailwind blew from behind ${user.name}!`, safeguard: `${user.name}'s side became cloaked in a veil!`,
				mist: `${user.name}'s side became shrouded in mist!`, luckychant: `A chant shielded ${user.name}'s side from critical hits!` }[fx.side]);
			return true;
		}
		if (fx.endure) {
			user.protectN = (user.protectN || 0) + 1;
			if (Math.random() < 1 / Math.pow(2, user.protectN - 1)) {
				user.enduring = true;
				this.pushMsg(`${user.name} braced itself!`);
			} else { user.protectN = 0; this.pushMsg('But it failed!'); }
			return true;
		}
		if (fx.hazard) {
			const h = hazardsOf(isFoe ? 'me' : 'foe');
			const max = { spikes: 3, toxicspikes: 2, stealthrock: 1, stickyweb: 1 }[fx.hazard];
			if ((h[fx.hazard] || 0) >= max) { this.pushMsg('But it failed!'); return true; }
			h[fx.hazard] = (h[fx.hazard] || 0) + 1;
			this.pushMsg('Hazards were scattered around the opposing side!');
			return true;
		}
		if (fx.clearHazards) {
			a.meHazards = {}; a.foeHazards = {};
			if (fx.foeBoost2) applyBoosts(targetBoosts, target, fx.foeBoost2);
			if (fx.selfBoost) applyBoosts(userBoosts, user, fx.selfBoost);
			this.pushMsg('The field was cleared!');
			return true;
		}
		if (fx.swapHazards) {
			[a.meHazards, a.foeHazards] = [a.foeHazards, a.meHazards];
			this.pushMsg('The battlefield sides were swapped!');
			return true;
		}
		if (fx.batonPass) {
			if (isFoe) { this.pushMsg('But it failed!'); return true; }
			const next = a.party.find(m => m !== user && m.curHP > 0);
			if (!next) { this.pushMsg('But it failed!'); return true; }
			this.pushMsg(`${user.name} passed the baton!`, () => {
				const keep = { boosts: { ...userBoosts }, subHP: user.subHP, focusEnergy: user.focusEnergy, perishN: user.perishN };
				this.clearVolatiles(user);
				a.me = next;
				a.meImg = a.backSprites.get(next);
				Object.assign(a.meBoosts, keep.boosts);
				if (keep.subHP) next.subHP = keep.subHP;
				if (keep.focusEnergy) next.focusEnergy = true;
				if (keep.perishN) next.perishN = keep.perishN;
				a.meShownHP = next.curHP;
				a.meHidden = false;
			});
			this.pushAnim('enter', 'me', 0.4);
			this.pushMsg('', () => { cry(a.me.speciesId); this.applyHazards(a.me, 'me'); });
			return true;
		}
		if (fx.partingShot) {
			applyBoosts(targetBoosts, target, { atk: -1, spa: -1 });
			if (!isFoe) {
				const next = a.party.find(m => m !== user && m.curHP > 0);
				if (next) {
					this.pushMsg(`${user.name} switched out!`, () => {
						this.clearVolatiles(user);
						a.me = next;
						a.meImg = a.backSprites.get(next);
						Object.assign(a.meBoosts, freshBoosts());
						a.meShownHP = next.curHP;
						a.meHidden = false;
					});
					this.pushAnim('enter', 'me', 0.4);
					this.pushMsg('', () => { cry(a.me.speciesId); this.applyHazards(a.me, 'me'); });
				}
			}
			return true;
		}
		if (fx.fleeSelf) {
			if (a.isTrainer) { this.pushMsg('But it failed!'); return true; }
			this.pushMsg(`${user.name} fled the battle!`, () => { sfx('flee'); this.finish('escaped'); });
			return true;
		}
		if (fx.memento) {
			applyBoosts(targetBoosts, target, { atk: -2, spa: -2 });
			this.pushMsg(`${user.name} gave everything it had!`, () => { user.curHP = 0; });
			this.pushMsg('', () => this.checkFaints());
			return true;
		}
		if (fx.healingWish) {
			if (isFoe || !a.party.find(m => m !== user && m.curHP > 0)) { this.pushMsg('But it failed!'); return true; }
			this.pushMsg(`${user.name} made a healing wish!`, () => { user.curHP = 0; a.healingWish = true; });
			this.pushMsg('', () => this.checkFaints());
			return true;
		}
		if (fx.revive) {
			const fainted = isFoe ? null : a.party.find(m => m.curHP <= 0);
			if (!fainted) { this.pushMsg('But it failed!'); return true; }
			this.pushMsg(`${fainted.name} was revived!`, () => {
				fainted.curHP = Math.floor(fainted.maxHP / 2);
				fainted.status = null;
			});
			return true;
		}
		if (fx.restrict) {
			// AROMA VEIL covers the holder AND its partner (was inert: 10 species)
			const veil = [target, a.double ? (target === a.me ? a.meAlly : target === a.meAlly ? a.me
				: target === a.foe ? a.foeAlly : target === a.foeAlly ? a.foe : null) : null]
				.filter(m => m && m.curHP > 0).some(m => this.abilityOf(m) === 'aromaveil');
			if (veil) { this.pushMsg(`${target.name} is protected by AROMA VEIL!`); return true; }
			const lastId = a.lastMove[isFoe ? 'me' : 'foe'];
			if (fx.restrict === 'disable') {
				if (!lastId || target.disabledMove) { this.pushMsg('But it failed!'); return true; }
				target.disabledMove = lastId; target.disableTurns = 4;
				this.pushMsg(`${target.name}'s move was disabled!`);
			} else if (fx.restrict === 'encore') {
				if (!lastId || target.encoreMove) { this.pushMsg('But it failed!'); return true; }
				target.encoreMove = lastId; target.encoreTurns = 3;
				this.pushMsg(`${target.name} received an encore!`);
			} else if (fx.restrict === 'taunt') {
				if (target.tauntTurns > 0) { this.pushMsg('But it failed!'); return true; }
				target.tauntTurns = 3;
				this.pushMsg(`${target.name} fell for the taunt!`);
			} else {
				if (target.tormented) { this.pushMsg('But it failed!'); return true; }
				target.tormented = true;
				this.pushMsg(`${target.name} was subjected to torment!`);
			}
			return true;
		}
		if (fx.noSwitch) {
			target.noSwitch = true;
			this.pushMsg(`${target.name} can no longer escape!`);
			return true;
		}
		if (fx.magnetRise) { user.magnetRise = 5; this.pushMsg(`${user.name} levitated with electromagnetism!`); return true; }
		if (fx.telekinesis) { target.telekinesis = 3; this.pushMsg(`${target.name} was hurled into the air!`); return true; }
		if (fx.call) {
			let id = null;
			if (fx.call === 'metronome') {
				const pool = Object.keys(this.data.moves).filter(k => k !== 'metronome' && k !== 'struggle');
				id = pool[Math.floor(Math.random() * pool.length)];
			} else if (fx.call === 'copycat') id = a.lastMoveId;
			else if (fx.call === 'mirror') id = a.lastMove[isFoe ? 'me' : 'foe'];
			else if (fx.call === 'assist') {
				const pool = (isFoe ? [] : a.party.filter(m => m !== user)).flatMap(m => m.moves.map(mv2 => mv2.id));
				id = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
			} else if (fx.call === 'sleeptalk') {
				const pool = user.moves.filter(m2 => m2.id !== 'sleeptalk');
				id = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
			} else if (fx.call === 'nature') id = this.data.moves.triattack ? 'triattack' : 'swift';
			if (!id || MOVE_FX[id]?.call) { this.pushMsg('But it failed!'); return true; }
			const called = makeMove(id, this.data);
			this.pushMsg('', () => this.useMove(user, userBoosts, target, targetBoosts, called, isFoe, { called: true }));
			return true;
		}
		if (fx.mimic) {
			const lastId = a.lastMove[isFoe ? 'me' : 'foe'];
			if (!lastId || user.moves.some(m2 => m2.id === lastId)) { this.pushMsg('But it failed!'); return true; }
			const idx = user.moves.indexOf(move);
			if (idx < 0) { this.pushMsg('But it failed!'); return true; }
			if (!user.mimicSlot) user.mimicSlot = { idx, orig: move };
			user.moves[idx] = makeMove(lastId, this.data);
			this.pushMsg(`${user.name} mimicked the move!`);
			return true;
		}
		if (fx.boostCost) {
			const cost = Math.floor(user.maxHP * fx.boostCost.frac);
			if (user.curHP <= cost) { this.pushMsg('But it failed!'); return true; }
			this.pushMsg(`${user.name} paid with its vitality!`, () => {
				user.curHP -= cost;
				this.float(mySide, `-${cost}`, '#ff7a6b');
			});
			applyBoosts(userBoosts, user, fx.boostCost.stats);
			return true;
		}
		if (fx.selfBoost || fx.foeBoost2 || fx.cureSelfToo) {
			if (fx.needsPoisoned && target.status !== 'psn') { this.pushMsg('But it failed!'); return true; }
			if (fx.selfBoost) applyBoosts(userBoosts, user, fx.selfBoost);
			if (fx.foeBoost2) applyBoosts(targetBoosts, target, fx.foeBoost2);
			if (fx.cureSelfToo && user.status) {
				this.pushMsg(`${user.name} shook off its status!`, () => { user.status = null; delete user.badPsn; delete user.toxicN; });
			}
			if (fx.heal) {
				if (user.healBlockTurns > 0) { this.pushMsg(`${user.name} can't heal — Heal Block!`); return true; }
				const amt = Math.floor(user.maxHP * fx.heal);
				this.pushMsg(`${user.name} regained health!`, () => {
					user.curHP = Math.min(user.maxHP, user.curHP + amt);
					this.float(mySide, `+${amt}`, '#6be08a');
				});
			}
			return true;
		}
		if (fx.acupressure) {
			const stats = ['atk', 'def', 'spa', 'spd', 'spe'];
			applyBoosts(userBoosts, user, { [stats[Math.floor(Math.random() * stats.length)]]: 2 });
			return true;
		}
		if (fx.focusEnergy) { user.focusEnergy = true; this.pushMsg(`${user.name} is getting pumped!`); return true; }
		if (fx.laserFocus) { user.laserFocus = true; this.pushMsg(`${user.name} concentrated intensely!`); return true; }
		if (fx.lockOn) { user.lockOn = true; this.pushMsg(`${user.name} took aim at ${target.name}!`); return true; }
		if (fx.foresight) { target.foresight = true; this.pushMsg(`${user.name} identified ${target.name}!`); return true; }
		if (fx.healTarget) {
			const amt = Math.floor(target.maxHP * fx.healTarget);
			this.pushMsg(`${target.name}'s HP was restored.`, () => {
				target.curHP = Math.min(target.maxHP, target.curHP + amt);
				this.float(isFoe ? 'me' : 'foe', `+${amt}`, '#6be08a');
			});
			return true;
		}
		if (fx.wish) {
			const s = sideOf(mySide);
			if (s.wishT > 0) { this.pushMsg('But it failed!'); return true; }
			s.wishT = 2; s.wishAmt = Math.floor(user.maxHP / 2);
			this.pushMsg(`${user.name} made a wish!`);
			return true;
		}
		if (fx.strengthSap) {
			const amt = this.statOf(target, targetBoosts, 'atk');
			applyBoosts(targetBoosts, target, { atk: -1 });
			this.pushMsg(`${user.name} drained ${target.name}'s strength!`, () => {
				user.curHP = Math.min(user.maxHP, user.curHP + amt);
				this.float(mySide, `+${amt}`, '#6be08a');
			});
			return true;
		}
		if (fx.purify) {
			if (!target.status) { this.pushMsg('But it failed!'); return true; }
			this.pushMsg(`${target.name} was purified!`, () => {
				target.status = null; delete target.badPsn;
				user.curHP = Math.min(user.maxHP, user.curHP + Math.floor(user.maxHP / 2));
			});
			return true;
		}
		if (fx.psychoShift) {
			if (!user.status || target.status) { this.pushMsg('But it failed!'); return true; }
			this.pushMsg(`${user.name} shifted its status onto ${target.name}!`, () => {
				target.status = user.status;
				user.status = null;
			});
			return true;
		}
		if (fx.nightmare) {
			if (target.status !== 'slp' || target.nightmared) { this.pushMsg('But it failed!'); return true; }
			target.nightmared = true;
			this.pushMsg(`${target.name} began having a nightmare!`);
			return true;
		}
		if (fx.perishSong) {
			for (const m of [user, target]) if (!m.perishN) m.perishN = 3;
			this.pushMsg('All battlers will faint in three turns!');
			return true;
		}
		if (fx.destinyBond) { user.destinyBond = true; this.pushMsg(`${user.name} is trying to take its foe down with it!`); return true; }
		if (fx.spite) {
			const lastId = a.lastMove[isFoe ? 'me' : 'foe'];
			const mv2 = lastId && target.moves.find(m2 => m2.id === lastId);
			if (!mv2 || mv2.pp <= 0) { this.pushMsg('But it failed!'); return true; }
			mv2.pp = Math.max(0, mv2.pp - 4);
			this.pushMsg(`${target.name}'s move lost PP!`);
			return true;
		}
		if (fx.psychUp) {
			Object.assign(userBoosts, { ...targetBoosts });
			this.pushMsg(`${user.name} copied ${target.name}'s stat changes!`);
			return true;
		}
		if (fx.swapBoosts) {
			const keys = fx.swapBoosts === 'all' ? Object.keys(userBoosts)
				: fx.swapBoosts === 'guard' ? ['def', 'spd'] : ['atk', 'spa'];
			for (const k of keys) {
				const t = userBoosts[k] || 0;
				userBoosts[k] = targetBoosts[k] || 0;
				targetBoosts[k] = t;
			}
			this.pushMsg('Stat changes were swapped!');
			return true;
		}
		if (fx.statSwap) {
			this.snapStats(user); this.snapStats(target);
			for (const k of fx.statSwap) {
				const t = user.stats[k];
				user.stats[k] = target.stats[k];
				target.stats[k] = t;
			}
			this.pushMsg('Stats were swapped!');
			return true;
		}
		if (fx.statAvg) {
			this.snapStats(user); this.snapStats(target);
			for (const k of fx.statAvg) {
				const avg = Math.floor((user.stats[k] + target.stats[k]) / 2);
				user.stats[k] = avg; target.stats[k] = avg;
			}
			this.pushMsg('The battlers shared their strengths!');
			return true;
		}
		if (fx.ownSwap) {
			this.snapStats(user);
			const [k1, k2] = fx.ownSwap;
			const t = user.stats[k1];
			user.stats[k1] = user.stats[k2];
			user.stats[k2] = t;
			this.pushMsg(`${user.name} swapped its stats!`);
			return true;
		}
		if (fx.invertBoosts) {
			for (const k of Object.keys(targetBoosts)) targetBoosts[k] = -(targetBoosts[k] || 0);
			this.pushMsg(`${target.name}'s stat changes were turned upside down!`);
			return true;
		}
		if (fx.transform) {
			this.snapStats(user); this.snapTypes(user);
			user.stats = { ...target.stats, hp: user.stats.hp };
			user.types = [...target.types];
			user.transformedMoves = user.transformedMoves || user.moves;
			user.moves = target.moves.map(m2 => ({ id: m2.id, name: m2.name, pp: 5, maxPp: 5 }));
			this.pushMsg(`${user.name} transformed into ${target.name}!`);
			return true;
		}
		if (fx.substitute) {
			const cost = Math.floor(user.maxHP / 4);
			if (user.subHP > 0 || user.curHP <= cost) { this.pushMsg('But it failed!'); return true; }
			this.pushMsg(`${user.name} put up a substitute!`, () => {
				user.curHP -= cost;
				user.subHP = cost;
				this.float(mySide, `-${cost}`, '#ff7a6b');
			});
			return true;
		}
		if (fx.typeSelf) {
			this.snapTypes(user);
			user.types = fx.typeSelf === 'firstmove' ? [this.data.moves[user.moves[0]?.id]?.type || 'Normal']
				: fx.typeSelf === 'copy' ? [...target.types]
				: fx.typeSelf === 'random' ? [Object.keys(CHART)[Math.floor(Math.random() * 18)]]
				: [fx.typeSelf];
			this.pushMsg(`${user.name} became ${user.types.join('/')} type!`);
			return true;
		}
		if (fx.typeTarget) { this.snapTypes(target); target.types = [...fx.typeTarget]; this.pushMsg(`${target.name} became ${fx.typeTarget[0]} type!`); return true; }
		if (fx.addType) {
			this.snapTypes(target);
			if (!target.types.includes(fx.addType)) target.types = [...target.types, fx.addType];
			this.pushMsg(`${fx.addType} was added to ${target.name}!`);
			return true;
		}
		if (fx.stockpile) {
			if ((user.stockN || 0) >= 3) { this.pushMsg('But it failed!'); return true; }
			user.stockN = (user.stockN || 0) + 1;
			applyBoosts(userBoosts, user, { def: 1, spd: 1 });
			this.pushMsg(`${user.name} stockpiled ${user.stockN}!`);
			return true;
		}
		if (fx.spitUp || fx.swallow) {
			if (!user.stockN) { this.pushMsg('But it failed!'); return true; }
			if (fx.spitUp) {
				const dmg = Math.min(target.curHP, 30 * user.stockN + Math.floor(user.level * user.stockN / 2));
				this.pushMsg(`${user.name} spat up its power!`, () => {
					sfx('hit_normal');
					target.curHP = Math.max(0, target.curHP - dmg);
					this.float(isFoe ? 'me' : 'foe', `-${dmg}`, '#ff7a6b');
				});
			} else {
				const amt = Math.floor(user.maxHP * [0.25, 0.5, 1][user.stockN - 1]);
				this.pushMsg(`${user.name} swallowed its power!`, () => {
					user.curHP = Math.min(user.maxHP, user.curHP + amt);
					this.float(mySide, `+${amt}`, '#6be08a');
				});
			}
			user.stockN = 0;
			return true;
		}
		if (fx.chargeUp) {
			user.chargedUp = true;
			applyBoosts(userBoosts, user, { spd: 1 });
			this.pushMsg(`${user.name} began charging power!`);
			return true;
		}
		if (fx.abilityCopy) {
			if (!target.ability) { this.pushMsg('But it failed!'); return true; }
			this.snapAbility(user);
			user.ability = target.ability;
			this.pushMsg(`${user.name} copied ${target.name}'s ability!`);
			return true;
		}
		if (fx.abilitySwap) {
			this.snapAbility(user); this.snapAbility(target);
			const t = user.ability;
			user.ability = target.ability;
			target.ability = t;
			this.pushMsg('The battlers swapped abilities!');
			return true;
		}
		if (fx.abilityGive) { this.snapAbility(target); target.ability = user.ability; this.pushMsg(`${target.name}'s ability changed!`); return true; }
		if (fx.abilitySuppress) { target.abilitySuppressed = true; this.pushMsg(`${target.name}'s ability was suppressed!`); return true; }
		if (fx.abilitySet) { this.snapAbility(target); target.ability = fx.abilitySet; this.pushMsg(`${target.name}'s ability changed!`); return true; }
		return false;
	}

	// entry hazards greet whoever switches in on that side
	applyHazards(mon, side) {
		const a = this.active;
		const h = side === 'me' ? a.meHazards : a.foeHazards;
		if (!h || mon.curHP <= 0) return;
		if (this.itemFx(mon)?.bootsGuard) return; // Heavy-Duty Boots: entry hazards don't bite
		const grounded = !mon.types.includes('Flying');
		if (h.stealthrock) {
			const eff = effectiveness('Rock', mon.types);
			const dmg = Math.max(1, Math.floor(mon.maxHP * eff / 8));
			this.pushMsg(`Pointed stones dug into ${mon.name}!`, () => {
				mon.curHP = Math.max(0, mon.curHP - dmg);
				this.float(side, `-${dmg}`, '#e8b16b');
			});
		}
		if (h.spikes && grounded) {
			const frac = [1 / 8, 1 / 6, 1 / 4][Math.min(2, h.spikes - 1)];
			const dmg = Math.max(1, Math.floor(mon.maxHP * frac));
			this.pushMsg(`${mon.name} was hurt by spikes!`, () => {
				mon.curHP = Math.max(0, mon.curHP - dmg);
				this.float(side, `-${dmg}`, '#e8b16b');
			});
		}
		if (h.toxicspikes && grounded) {
			if (mon.types.includes('Poison')) {
				h.toxicspikes = 0;
				this.pushMsg(`${mon.name} absorbed the toxic spikes!`);
			} else if (!mon.status && !mon.types.includes('Steel')) {
				mon.status = 'psn';
				if (h.toxicspikes >= 2) { mon.badPsn = true; mon.toxicN = 1; }
				this.pushMsg(`${mon.name} was poisoned by toxic spikes!`);
			}
		}
		if (h.stickyweb && grounded) {
			const boosts = side === 'me' ? a.meBoosts : a.foeBoosts;
			boosts.spe = Math.max(-6, (boosts.spe || 0) - 1);
			this.pushMsg(`${mon.name} was caught in a sticky web!`);
		}
		this.pushMsg('', () => this.checkFaints());
	}

	// ---------- doubles turn flow ----------
	chooser() {
		const a = this.active;
		return a.actionFor === 1 ? a.meAlly : a.me;
	}
	chooserBoosts() {
		const a = this.active;
		return a.actionFor === 1 ? a.meAllyBoosts : a.meBoosts;
	}
	livingFoes() {
		const a = this.active;
		return [a.foe, a.foeAlly].filter(m => m && m.curHP > 0);
	}
	livingMine() {
		const a = this.active;
		return [a.me, a.meAlly].filter(m => m && m.curHP > 0);
	}
	// a move was picked for the current chooser; queue it (asking for a
	// target first when both foes stand)
	planMove(mv) {
		const a = this.active;
		const foes = this.livingFoes();
		const info = this.data.moves[mv.id] || {};
		const needsTarget = info.category !== 'Status' && foes.length > 1 && !SPREAD_MOVES.has(mv.id);
		if (needsTarget) {
			a.pendingPlan = { user: this.chooser(), boosts: this.chooserBoosts(), move: mv };
			a.phase = 'target';
			a.targetIdx = 0;
			return;
		}
		this.pushPlan({ user: this.chooser(), boosts: this.chooserBoosts(), move: mv, target: foes[0] });
	}
	pushPlan(plan) {
		const a = this.active;
		a.plans.push(plan);
		if (a.actionFor === 0 && a.meAlly && a.meAlly.curHP > 0) {
			a.actionFor = 1;
			a.phase = 'menu';
			a.menuIdx = 0;
			a.msg = `What will ${a.meAlly.name} do?`;
		} else {
			this.startQueue(() => this.resolveDoubleTurn());
		}
	}
	resolveDoubleTurn() {
		const a = this.active;
		a.meSide.quickGuard = a.meSide.wideGuard = a.foeSide.quickGuard = a.foeSide.wideGuard = false;
		const acts = [...a.plans];
		a.plans = [];
		a.actionFor = 0;
		a.turnCount = (a.turnCount || 0) + 1;   // doubles never counted turns; Revenge/Avalanche read it
		// each foe picks its best target, then its best move against that target
		for (const foeMon of this.livingFoes()) {
			const mine = this.livingMine();
			// aim at the target this foe matches up best against, then pick the
			// move for THAT target (was: uniformly random move at a random target)
			const target = mine.length
				? mine.reduce((best, m) => this.matchupScore(foeMon, m) > this.matchupScore(foeMon, best) ? m : best, mine[0])
				: a.me;
			acts.push({
				user: foeMon, boosts: this.boostsOf(foeMon), move: this.chooseFoeMove(foeMon, target), target,
			});
		}
		// speed order with priority (Prankster: +1 on status moves)
		const actPrio = act => this.movePriority(act.user, act.move);
		// Quick Claw jumps the speed bracket but never beats higher priority —
		// rolled once per actor per turn, as in singles.
		const qc = new Map(acts.map(x => [x, !!this.itemFx(x.user)?.quickClaw && Math.random() < 0.2]));
		acts.sort((p, q) => {
			const pp = actPrio(p);
			const qp = actPrio(q);
			if (pp !== qp) return qp - pp;
			if (qc.get(p) !== qc.get(q)) return qc.get(p) ? -1 : 1;
			return this.speedOf(q.user) - this.speedOf(p.user);
		});
		for (const act of acts) {
			this.pushMsg('', () => {
				if (act.user.curHP <= 0) return;
				const isFoe = this.sideOfMon(act.user) === 'foe';
				// retarget if the intended victim already dropped
				let tgt = act.target;
				if (!tgt || tgt.curHP <= 0) {
					const pool = isFoe ? this.livingMine() : this.livingFoes();
					tgt = pool[0];
				}
				if (!tgt) return;
				const spread = SPREAD_MOVES.has(act.move.id);
				// Follow Me / Rage Powder / Spotlight pull single-target moves onto
				// the mon that used them
				// STALWART / PROPELLER TAIL ignore redirection and hit what they aimed at
				const ignoresPull = ['stalwart', 'propellertail'].includes(this.abilityOf(act.user));
				if (!spread && !ignoresPull) {
					const pool = isFoe ? this.livingMine() : this.livingFoes();
					const magnet = pool.find(m => m.centerOfAttention);
					if (magnet && (this.data.moves[act.move.id]?.category !== 'Status')) tgt = magnet;
				}
				const victims = spread ? (isFoe ? this.livingMine() : this.livingFoes()) : [tgt];
				// Earthquake and its family hit EVERYTHING adjacent — your own partner
				// included, exactly the cost that balances a spread move. TELEPATHY on
				// the partner finally has a job: it sidesteps the ally's blast.
				if (spread && ALL_ADJACENT.has(act.move.id)) {
					const partner = (isFoe ? [a.foe, a.foeAlly] : [a.me, a.meAlly])
						.find(m => m && m !== act.user && m.curHP > 0);
					if (partner && this.abilityOf(partner) !== 'telepathy') victims.push(partner);
				}
				for (const v of victims) {
					this.useMove(act.user, this.boostsOf(act.user), v, this.boostsOf(v), act.move, isFoe,
						{ spread: victims.length > 1 });
				}
			});
			this.pushMsg('', () => this.checkFaintsD());
		}
		this.pushMsg('', () => {
			if (this.livingFoes().length && this.livingMine().length) this.endOfTurn();
		});
		this.pushMsg('', () => this.checkFaintsD());
	}
	checkFaintsD() {
		const a = this.active;
		if (!a || !a.double) { this.checkFaints(); return; }
		for (const slot of ['foe', 'foeAlly']) {
			const mon = a[slot];
			if (mon && mon.curHP <= 0 && !mon.faintCounted) {
				mon.faintCounted = true;
				this.pushMsg(`${mon.name} fainted!`, () => cry(mon.speciesId));
				this.grantExp(mon);
				// a trainer's bench refills the slot; the wild just thins out
				this.pushMsg('', () => {
					if (a.isTrainer) {
						const next = a.foes.find(m => m.curHP > 0 && m !== a.foe && m !== a.foeAlly);
						if (next) {
							a[slot] = next;
							a[slot === 'foe' ? 'foeImg' : 'foeAllyImg'] = a.foeSprites.get(next);
							const b = slot === 'foe' ? a.foeBoosts : a.foeAllyBoosts;
							Object.assign(b, freshBoosts());
							a[slot === 'foe' ? 'foeShownHP' : 'foeAllyShownHP'] = next.curHP;
							this.pushMsg(`${a.info.displayName} sent out ${next.name}!`, () => cry(next.speciesId));
						} else if (slot === 'foeAlly') a.foeAlly = null;
					} else if (slot === 'foeAlly') a.foeAlly = null;
				});
			}
		}
		for (const slot of ['me', 'meAlly']) {
			const mon = a[slot];
			if (mon && mon.curHP <= 0 && !mon.faintCounted) {
				mon.faintCounted = true;
				this.pushMsg(`${mon.name} fainted!`, () => { cry(mon.speciesId); this.clearVolatiles(mon, true); });
				this.pushMsg('', () => {
					const next = a.party.find(m => m.curHP > 0 && m !== a.me && m !== a.meAlly);
					if (next) {
						a[slot] = next;
						a[slot === 'me' ? 'meImg' : 'meAllyImg'] = a.backSprites.get(next);
						const b = slot === 'me' ? a.meBoosts : a.meAllyBoosts;
						Object.assign(b, freshBoosts());
						a[slot === 'me' ? 'meShownHP' : 'meAllyShownHP'] = next.curHP;
						this.pushMsg(`Go! ${next.name}!`, () => { sfx('ball_open'); cry(next.speciesId); });
					} else if (slot === 'meAlly') a.meAlly = null;
				});
			}
		}
		this.pushMsg('', () => {
			if (!this.livingFoes().length) {
				const more = a.isTrainer && a.foes.some(m => m.curHP > 0);
				if (!more) {
					if (a.isTrainer) {
						this.pushMsg(a.info.defeatText);
						this.pushMsg(`You got $${this.prizeMoney()} for winning!`, () => this.finish('victory'));
					} else this.finish('victory');
				}
			} else if (!this.livingMine().length) {
				this.pushMsg('You blacked out...', () => this.finish('defeat'));
			}
		});
	}

	// choice: 0-3 = replace that move, -1 = give up on the new one
	resolveLearn(choice) {
		const a = this.active;
		const { mid, name, mon } = a.learn;
		if (choice >= 0) {
			const old = mon.moves[choice];
			mon.moves[choice] = makeMove(mid, this.data);
			a.queue.unshift({ text: `${mon.name} forgot ${old.name} and learned ${name}!` });
		} else {
			a.queue.unshift({ text: `${mon.name} gave up on learning ${name}.` });
		}
		a.learn = null;
		a.phase = 'msg';
		a.msgT = 99;
	}

	// usable battle items (balls only in wild battles)
	bagItems() {
		const a = this.active;
		const rank = it => (!a.isTrainer && it.kind === 'ball') ? 0
			: ['heal', 'revive', 'cure', 'ether'].includes(it.kind) ? 1 : 2;
		return Object.entries(Bag.getBag())
			.filter(([id, n]) => n > 0 && Bag.ITEMS[id])
			.filter(([id]) => !(a.isTrainer && Bag.ITEMS[id].kind === 'ball'))
			.map(([id, n]) => ({ id, n, ...Bag.ITEMS[id] }))
			// the battle bag shows 2-3 rows: balls first in a wild fight, then
			// medicine, then everything else. It used to be raw insertion order.
			.sort((x, y) => rank(x) - rank(y) || String(x.name).localeCompare(String(y.name)));
	}

	// the foe gets its move after an item/switch (it costs the turn)
	foeFreeMove() {
		const a = this.active;
		this.pushMsg('', () => {
			if (a.foe.curHP <= 0 || a.me.curHP <= 0) return;
			this.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, this.chooseFoeMove(), true);
		});
		this.pushMsg('', () => {
			const a2 = this.active;
			if (a2.foe.curHP > 0 && a2.me.curHP > 0) this.endOfTurn();
		});
		this.pushMsg('', () => this.checkFaints());
	}

	useItem(itemId) {
		const a = this.active;
		const item = Bag.ITEMS[itemId];
		if (!item) return;
		if (item.kind === 'ball') {
			a.lastBall = itemId;          // R re-throws it; see the battle key handler
			Bag.consume(itemId);
			this.startQueue(() => this.throwBall(item.name, item.mult || 1));
			return;
		}
		if (item.kind === 'ether') {
			if (a.me.moves.every(m => m.pp >= m.maxPp)) return; // nothing to restore
			Bag.consume(itemId);
			this.startQueue(() => {
				this.pushMsg(`You used an ${item.name}!`, () => {
					for (const m of a.me.moves) m.pp = Math.min(m.maxPp, m.pp + item.amount);
				});
				this.pushMsg(`${a.me.name}'s moves regained PP.`);
				this.foeFreeMove();
			});
			return;
		}
		if (item.kind === 'heal') {
			if (a.me.curHP >= a.me.maxHP) return; // nothing to heal, stay in bag
			Bag.consume(itemId);
			this.startQueue(() => {
				this.pushMsg(`You used a ${item.name}!`, () => {
					a.me.curHP = Math.min(a.me.maxHP, a.me.curHP + item.amount);
				});
				this.pushMsg(`${a.me.name}'s HP was restored.`);
				this.foeFreeMove();
			});
			return;
		}
		if (item.kind === 'revive') {
			const fainted = a.party.find(m => m.curHP <= 0);
			if (!fainted) return;
			Bag.consume(itemId);
			this.startQueue(() => {
				this.pushMsg(`You used a REVIVE!`, () => {
					fainted.curHP = Math.floor(fainted.maxHP / 2);
					fainted.status = null;
				});
				this.pushMsg(`${fainted.name} came back to its senses!`);
				this.foeFreeMove();
			});
			return;
		}
		// STATUS CURES. The battle bag has always LISTED these as rank-1 medicine,
		// and selecting one silently did nothing — there was simply no branch for
		// the kind. ANTIDOTE and friends bite only on their own ailment; FULL HEAL
		// (cures 'any') also lifts confusion, as it does in the real games.
		if (item.kind === 'cure') {
			const cures = a.me.status && (item.cures === 'any' || a.me.status === item.cures);
			const uncon = item.cures === 'any' && a.me.confuseTurns > 0;
			if (!cures && !uncon) return;           // wrong medicine: stay in the bag
			Bag.consume(itemId);
			this.startQueue(() => {
				this.pushMsg(`You used a ${item.name}!`, () => {
					if (cures) a.me.status = null;
					if (uncon) a.me.confuseTurns = 0;
				});
				this.pushMsg(`${a.me.name} was cured!`);
				this.foeFreeMove();
			});
			return;
		}
		// X ITEMS — the Gen-3 in-battle boosters, previously `kind:'misc'` with no
		// mechanic. A stat one raises its stage (+1, GBA rules); DIRE HIT is Focus
		// Energy in a bottle; GUARD SPEC. lays your side's Mist. All spend the turn.
		if (item.kind === 'xitem') {
			const words = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', acc: 'accuracy' };
			if (item.boost) {
				const [stat, d] = Object.entries(item.boost)[0];
				if ((a.meBoosts[stat] || 0) >= 6) return;   // won't go any higher
				Bag.consume(itemId);
				this.startQueue(() => {
					this.pushMsg(`You used the ${item.name}!`, () => {
						a.meBoosts[stat] = Math.min(6, (a.meBoosts[stat] || 0) + d);
					});
					this.pushMsg(`${a.me.name}'s ${words[stat]} rose!`);
					this.foeFreeMove();
				});
			} else if (item.crit) {
				if (a.me.focusEnergy) return;
				Bag.consume(itemId);
				this.startQueue(() => {
					this.pushMsg(`You used the ${item.name}!`, () => { a.me.focusEnergy = true; });
					this.pushMsg(`${a.me.name} is getting pumped!`);
					this.foeFreeMove();
				});
			} else if (item.guard) {
				if ((a.meSide.mist || 0) > 0) return;
				Bag.consume(itemId);
				this.startQueue(() => {
					this.pushMsg(`You used the ${item.name}!`, () => { a.meSide.mist = 5; });
					this.pushMsg(`Your team became shrouded in mist!`);
					this.foeFreeMove();
				});
			}
			return;
		}
	}

	switchTo(mon) {
		const a = this.active;
		if (mon === a.me || mon === a.meAlly || mon.curHP <= 0) return;
		this.startQueue(() => {
			this.pushMsg(`Come back, ${a.me.name}!`, () => this.clearVolatiles(a.me, true));
			this.pushAnim('recall', 'me', 0.3, () => { a.meHidden = true; });
			this.queueSendOut(`Go! ${mon.name}!`, mon, 'me', () => {
				a.me = mon;
				a.meImg = a.backSprites.get(mon);
				a.meBoosts = freshBoosts();
				a.meShownHP = mon.curHP;
				if (a.healingWish) {
					a.healingWish = false;
					mon.curHP = mon.maxHP;
					mon.status = null;
				}
			});
			this.pushMsg('', () => { this.applyHazards(a.me, 'me'); this.switchInAbility(a.me, 'me'); });
			this.foeFreeMove();
		});
	}

	// ---------- update/draw ----------
	update(dt) {
		const a = this.active;
		if (!a) return;
		a.t += dt;
		// the iconic low-HP warning beep — re-fired on a timer while the player's
		// lead mon sits in the red (curHP <= 20%), silenced the instant it recovers
		const meFrac = a.me && a.me.maxHP ? a.me.curHP / a.me.maxHP : 1;
		if (a.phase !== 'done' && a.me?.curHP > 0 && meFrac <= 0.2) {
			a.lowHpBeepT = (a.lowHpBeepT || 0) - dt;
			if (a.lowHpBeepT <= 0) { sfx('lowhp'); a.lowHpBeepT = 0.6; }
		} else a.lowHpBeepT = 0;
		a.introT = (a.introT || 0);
		if (a.phase !== 'flash') a.introT += dt;
		if (a.shakeT > 0) a.shakeT -= dt;
		if (a.flash) { a.flash.t -= dt; if (a.flash.t <= 0) a.flash = null; } // crit/super-effective screen flash
		// HP bar easing
		a.foeShownHP += (a.foe.curHP - a.foeShownHP) * Math.min(1, dt * 6);
		a.meShownHP += (a.me.curHP - a.meShownHP) * Math.min(1, dt * 6);
		if (Math.abs(a.foeShownHP - a.foe.curHP) < 0.5) a.foeShownHP = a.foe.curHP;
		if (Math.abs(a.meShownHP - a.me.curHP) < 0.5) a.meShownHP = a.me.curHP;
		if (a.foeAlly) a.foeAllyShownHP += (a.foeAlly.curHP - (a.foeAllyShownHP || 0)) * Math.min(1, dt * 6);
		if (a.meAlly) a.meAllyShownHP += (a.meAlly.curHP - (a.meAllyShownHP || 0)) * Math.min(1, dt * 6);
		// EXP bar easing: the shown value crawls up to the real exp so you see it
		// fill (and wrap across level-ups) instead of jumping; snaps on a mon swap
		const easeExp = (mon, key, tag) => {
			if (!mon) return;
			const real = mon.exp ?? expForLevel(mon.level);
			if (a[tag] !== mon) { a[tag] = mon; a[key] = real; }
			else if (a[key] == null || a[key] > real) a[key] = real;
			else if (a[key] < real) a[key] = Math.min(real, a[key] + (real - a[key]) * Math.min(1, dt * 2.2) + 4 * dt);
		};
		easeExp(a.me, 'meShownExp', '_expMon');
		if (a.double) easeExp(a.meAlly, 'meAllyShownExp', '_expAlly');

		if (a.phase === 'flash') {
			if (a.t > 0.6) { a.phase = 'msg'; }
			return;
		}
		// combat text + type-colored hit particles (positions resolve at draw)
		for (const f of a.floaters || []) f.t += dt;
		a.floaters = (a.floaters || []).filter(f => f.t < 1.1);
		for (const p of a.particles || []) {
			p.t += dt;
			p.dx += p.vx * dt; p.dy += p.vy * dt;
			p.vy += 260 * dt; // gravity, in u-units/s²
		}
		a.particles = (a.particles || []).filter(p => p.t < 0.6);

		// a playing sprite animation pauses the message queue
		if (a.fx) {
			a.fx.t += dt;
			if (a.fx.kind === 'hit' && a.fx.t < 0.15) {
				const hp = a.hitPunch; // crit/super-effective punch set at damage time
				a.shakeT = hp ? hp.t : 0.15; a.shakeMag = hp ? hp.mag : 8;
				if (hp && hp.flash) a.flash = { t: 0.26, dur: 0.26, color: hp.flash };
				a.hitPunch = null;
			}
			if (a.fx.t >= a.fx.dur) {
				a.fx.done?.();
				a.fx = null;
			}
			return;
		}
		if (a.phase === 'msg') {
			// waiting for HP bars before advancing
			const settled = a.foeShownHP === a.foe.curHP && a.meShownHP === a.me.curHP;
			a.msgT += dt;
			// The auto-advance dwell follows the player's TEXT SPEED. It was a hard
			// 1.1 s per line whatever the setting — the one knob that exists to kill
			// the grind tax, and battle never read it. `instant` all but removes the
			// wait (a beat remains so a line can't vanish before the eye lands on
			// it); slow readers get a little longer than the old default.
			const cps = charsPerSec();
			const dwell = cps === Infinity ? 0.2 : Math.min(1.6, Math.max(0.45, 48 / cps));
			if ((a.msgT > dwell || a.msgT >= 99) && settled) {
				const next = a.queue.shift();
				if (next) {
					if (next.anim) {
						a.fx = { ...next.anim, t: 0 };
						// a hit bursts type-colored sparks off the target
						if (a.fx.kind === 'hit' && a.fx.color) {
							a.particles ||= [];
							for (let i = 0; i < 16; i++) {
								const ang = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 160;
								a.particles.push({
									side: a.fx.side, color: a.fx.color, t: 0,
									dx: 0, dy: -60 - Math.random() * 40,
									vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60,
									r: 2.5 + Math.random() * 2.5,
								});
							}
						}
						if (a.fx.kind === 'faint') sfx('faint');
					// status archetypes ride the same particle system: BOOST/HEAL
						// sparkles rise off the caster, DEBUFF motes sink onto the victim
						if (a.fx.kind === 'boost' || a.fx.kind === 'heal') {
							a.particles ||= [];
							for (let i = 0; i < 14; i++) {
								a.particles.push({
									side: a.fx.side, color: a.fx.kind === 'heal' ? '#7ce8a0' : a.fx.color, t: 0,
									dx: -40 + Math.random() * 80, dy: -10 - Math.random() * 50,
									vx: (Math.random() - 0.5) * 30, vy: -420 - Math.random() * 120,
									r: 2 + Math.random() * 2.5,
								});
							}
						}
						if (a.fx.kind === 'debuff') {
							a.particles ||= [];
							for (let i = 0; i < 14; i++) {
								a.particles.push({
									side: a.fx.side, color: a.fx.color, t: 0,
									dx: -50 + Math.random() * 100, dy: -150 - Math.random() * 40,
									vx: 0, vy: 60 + Math.random() * 80,
									r: 2 + Math.random() * 2.5,
								});
							}
						}
						a.msgT = 1.2;
						return;
					}
					next.fn?.();
					if (next.text) { a.msg = next.text; a.msgT = 0; }
					else a.msgT = 1.2; // silent action; move on quickly
			} else if (a.phase !== 'done') {
					if (a.double) {
						a.actionFor = 0;
						a.phase = 'menu';
						a.menuIdx = 0;
						a.msg = `What will ${a.me.name} do?`;
					} else if (a.me.chargeMove && a.me.curHP > 0) {
						const mv = a.me.moves.find(m => m.id === a.me.chargeMove) || STRUGGLE();
						this.startQueue(() => this.resolveTurn(mv));
					} else {
						a.phase = 'menu';
						a.msg = a.safari ? `SAFARI BALLS: ${a.safari.balls} — what will you do?`
							: `What will ${a.me.name} do?`;
					}
				}
			}
			return;
		}
		if (a.phase === 'done') {
			a.doneT = (a.doneT || 0) + dt;
			if (a.doneT > 0.8) {
				const cb = a.onEnd, res = a.result;
				this.lastCaught = a.caughtMon;
				this.lastFoe = a.foe; // roamers read their surviving HP from here
				this.active = null;
				this.endSpec = null;   // main.js: nothing left to resume
				cb?.(res);
			}
		}
	}

	// medium-fast exp progress within the current level
	expFrac(mon) {
		const cur = expForLevel(mon.level), next = expForLevel(mon.level + 1);
		return Math.max(0, Math.min(1, ((mon.exp ?? cur) - cur) / (next - cur)));
	}
	// progress for an animated exp value: derive the level it belongs to so the
	// bar fills to full, then wraps to empty and keeps going across level-ups
	expFracFor(mon, exp) {
		let lvl = mon.level;
		lvl = levelForExp(exp);
		const cur = expForLevel(lvl), next = expForLevel(lvl + 1);
		return Math.max(0, Math.min(1, (exp - cur) / (next - cur)));
	}

	// ---------- full-resolution scene (Love2D-style presentation) ----------
	// sprite base positions + fx offsets; side: 'me' | 'foe'
	spritePose(a, side, W, H, u, slot = 0) {
		const { portrait, compact, barY } = UI.layout(W, H);
		const off = a.double ? (slot === 0 ? -0.08 : 0.1) * W : 0;
		const shrink = a.double ? 0.8 : 1;
		// positions hang off the scene area (0..barY), not the full canvas — on
		// the classic 3:2 frame barY - 22u equals the old H - 140u exactly, and
		// it stays correct when the bar grows (portrait deck, landscape phones).
		// compact (wide-short landscape phone): sprites shrink a notch and move
		// toward the middle so they clear the corner info panels
		const base = side === 'foe'
			? (portrait
				? { x: W * 0.68 + off, y: barY * 0.40, scale: 3.1 * u * shrink }
				: { x: W * (compact ? 0.62 : 0.70) + off, y: H * 0.42, scale: (compact ? 2.8 : 3.4) * u * shrink })
			: (portrait
				? { x: W * 0.26 + off, y: barY - 24 * u, scale: 3.8 * u * shrink }
				: { x: W * (compact ? 0.30 : 0.235) + off, y: barY - (compact ? 16 : 22) * u, scale: (compact ? 3.2 : 4.2) * u * shrink });
		let dx = 0, dy = 0, alpha = 1, blink = false, wob = 0;
		// entry slide on battle start
		const k = Math.min(1, (a.introT || 0) / 0.6);
		dx += (side === 'foe' ? 1 : -1) * (1 - k) * W * 0.4;
		// idle bob
		dy += Math.sin(a.t * 2.1 + (side === 'foe' ? 1.7 : 0)) * 2.5 * u;
		const fx = a.fx;
		// in doubles, an fx tagged with a slot only moves that mon (fx.slot == null = whole side)
		if (fx && fx.side === side && (fx.slot == null || fx.slot === slot)) {
			const p = Math.min(1, fx.t / fx.dur);
			if (fx.kind === 'lunge') dx += Math.sin(Math.PI * p) * (side === 'foe' ? -1 : 1) * 34 * u;
			if (fx.kind === 'hit') blink = Math.floor(fx.t / 0.07) % 2 === 0;
			if (fx.kind === 'faint') { dy += p * 90 * u; alpha = 1 - p; }
			if (fx.kind === 'recall') { alpha = 1 - p; dy += p * 20 * u; }
			if (fx.kind === 'enter') { dx += (side === 'foe' ? 1 : -1) * (1 - p) * W * 0.3; alpha = p; }
			if (fx.kind === 'ballshake') wob = Math.sin(fx.t * Math.PI * 4) * 0.35;
		}
		return { ...base, dx, dy, alpha, blink, wob };
	}

	// ---------- move-animation overlays ----------
	// The travel-and-impact halves of the damage archetypes, drawn OVER the
	// sprites. BOOST/HEAL/DEBUFF ride the particle system instead, and STRIKE
	// is the classic lunge + hit, so only four kinds render here.
	drawMoveFx(ctx, a, W, H, u) {
		const fx = a.fx;
		if (!fx || !['beam', 'shot', 'slash', 'burst'].includes(fx.kind)) return;
		const p = Math.min(1, fx.t / fx.dur);
		const to = this.spritePose(a, fx.side, W, H, u, fx.slot || 0);
		const tx = to.x, ty = to.y - 46 * u;
		ctx.save();
		if (fx.kind === 'beam' || fx.kind === 'shot') {
			const from = this.spritePose(a, fx.fromSide || (fx.side === 'me' ? 'foe' : 'me'), W, H, u, fx.fromSlot || 0);
			const sx = from.x, sy = from.y - 46 * u;
			if (fx.kind === 'beam') {
				// a wide glow and a hot white core, pulsing while it pours
				const wPulse = (1 + 0.35 * Math.sin(fx.t * 40)) * Math.sin(Math.PI * Math.min(1, p * 1.15));
				ctx.lineCap = 'round';
				ctx.globalAlpha = 0.45 * Math.max(0, wPulse);
				ctx.strokeStyle = fx.color; ctx.lineWidth = Math.max(0.1, 16 * u * wPulse);
				ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
				ctx.globalAlpha = 0.9 * Math.max(0, wPulse);
				ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.1, 5 * u * wPulse);
				ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
			} else {
				// a lobbed projectile with a short fading tail
				for (let i = 3; i >= 0; i--) {
					const q = Math.max(0, p - i * 0.05);
					const bx = sx + (tx - sx) * q, by = sy + (ty - sy) * q - Math.sin(Math.PI * q) * 90 * u;
					ctx.globalAlpha = i ? 0.16 * (4 - i) : 0.95;
					ctx.fillStyle = i ? fx.color : '#ffffff';
					ctx.beginPath(); ctx.arc(bx, by, (i ? 7 : 9) * u, 0, Math.PI * 2); ctx.fill();
					if (!i) { ctx.globalAlpha = 0.6; ctx.strokeStyle = fx.color; ctx.lineWidth = 3 * u; ctx.stroke(); }
				}
			}
		} else if (fx.kind === 'slash') {
			// three rake-marks appear one after another across the target
			ctx.lineCap = 'round';
			for (let i = 0; i < 3; i++) {
				const start = i * 0.22, seg = Math.max(0, Math.min(1, (p - start) / 0.3));
				if (seg <= 0) continue;
				const ox = (i - 1) * 26 * u;
				const fade = 0.9 * (1 - Math.max(0, p - 0.7) / 0.3);
				ctx.globalAlpha = Math.max(0, fade);
				ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5 * u;
				ctx.beginPath();
				ctx.moveTo(tx + ox - 30 * u, ty - 44 * u);
				ctx.lineTo(tx + ox - 30 * u + 60 * u * seg, ty - 44 * u + 88 * u * seg);
				ctx.stroke();
				ctx.globalAlpha = Math.max(0, fade * 0.55);
				ctx.strokeStyle = fx.color; ctx.lineWidth = 9 * u; ctx.stroke();
			}
		} else {   // burst: a flash and an expanding ring on the target
			const r = (14 + p * 80) * u;
			ctx.globalAlpha = 0.55 * (1 - p);
			ctx.fillStyle = fx.color;
			ctx.beginPath(); ctx.arc(tx, ty, r * 0.55, 0, Math.PI * 2); ctx.fill();
			ctx.globalAlpha = 0.85 * (1 - p);
			ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4 * u;
			ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.stroke();
		}
		ctx.restore();
		ctx.globalAlpha = 1;
	}

	// per-terrain backdrop: sky gradient + a ground band for depth + a night wash,
	// cached to an offscreen canvas keyed by terrain|night|size (Batch A)
	drawStage(ctx, stage, W, H) {
		const P = stagePalette(stage);
		const night = !!(stage && stage.night);
		const key = (stage?.terrain || 'grass') + '|' + night + '|' + W + 'x' + H;
		if (!this._stage || this._stage.key !== key) {
			const cv = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
			if (!cv) { this._stage = { key, cv: null, P, night }; }
			else {
				cv.width = W; cv.height = H;
				const c = cv.getContext('2d');
				const g = c.createLinearGradient(0, 0, 0, H);
				g.addColorStop(0, P.sky[0]); g.addColorStop(0.55, P.sky[1]); g.addColorStop(1, P.sky[2]);
				c.fillStyle = g; c.fillRect(0, 0, W, H);
				const gy = Math.round(H * 0.64);                     // horizon
				c.fillStyle = P.ground; c.fillRect(0, gy, W, H - gy);
				c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(0, gy - 2, W, 2);
				if (night) { c.fillStyle = 'rgba(18,22,55,0.4)'; c.fillRect(0, 0, W, H); }
				this._stage = { key, cv, P, night };
			}
		}
		if (this._stage.cv) ctx.drawImage(this._stage.cv, 0, 0);
		else { ctx.fillStyle = P.sky[1]; ctx.fillRect(0, 0, W, H); } // headless fallback
	}
	// subtle per-terrain atmosphere behind the mons (pollen / dust / sparkles) — Batch B
	drawStageAmbient(ctx, stage, W, H, u) {
		const spec = {
			grass:  { c: 'rgba(222,240,150,0.5)',  rise: true,  n: 14 },
			forest: { c: 'rgba(190,225,150,0.45)', rise: false, n: 16 },
			cave:   { c: 'rgba(150,150,175,0.28)', rise: false, n: 12 },
			water:  { c: 'rgba(222,240,255,0.55)', rise: true,  n: 12 },
			sand:   { c: 'rgba(212,190,130,0.35)', rise: false, n: 14 },
			city:   { c: 'rgba(205,205,215,0.22)', rise: false, n: 8 },
			indoor: { c: 'rgba(212,202,222,0.22)', rise: false, n: 8 },
		}[stage?.terrain || 'grass'];
		if (!spec) return;
		const T = (typeof performance !== 'undefined' ? performance.now() : 0) * 0.001;
		ctx.save(); ctx.fillStyle = spec.c;
		for (let i = 0; i < spec.n; i++) {
			const sx = (i * 173.3) % W;
			const prog = (T * 20 + i * 60) % (H + 40);
			const y = spec.rise ? H - prog : prog - 20;
			const x = (sx + Math.sin(T * 0.4 + i) * 22 * u + W) % W;
			ctx.beginPath(); ctx.arc(x, y, (1.2 + (i % 3) * 0.5) * u, 0, Math.PI * 2); ctx.fill();
		}
		ctx.restore();
	}
	// real in-battle weather (was a flat tint + label only) — Batch B
	drawBattleWeather(ctx, kind, W, H, u) {
		const T = (typeof performance !== 'undefined' ? performance.now() : 0) * 0.001;
		ctx.save();
		if (kind === 'rain') {
			ctx.strokeStyle = 'rgba(185,210,255,0.5)'; ctx.lineWidth = 1.5 * u;
			for (let i = 0; i < 70; i++) {
				const y = ((T * (900 + (i % 5) * 120) + i * 53) % (H + 40)) - 20;
				const x = ((i * 137.5) + y * 0.35) % W;
				ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6 * u, y + 16 * u); ctx.stroke();
			}
		} else if (kind === 'hail') {
			ctx.fillStyle = 'rgba(228,242,255,0.9)';
			for (let i = 0; i < 55; i++) {
				const y = ((T * (260 + (i % 4) * 60) + i * 41) % (H + 20)) - 10;
				const x = ((i * 149) + Math.sin((T + i) * 2) * 8 * u + W) % W;
				ctx.beginPath(); ctx.arc(x, y, 2.2 * u, 0, Math.PI * 2); ctx.fill();
			}
		} else if (kind === 'sand') {
			ctx.fillStyle = 'rgba(222,196,120,0.42)';
			for (let i = 0; i < 60; i++) {
				const x = ((T * (700 + (i % 6) * 90) + i * 71) % (W + 40)) - 20;
				const y = ((i * 97) + Math.sin(T * 2 + i) * 6 * u + H) % H;
				ctx.fillRect(x, y, 12 * u, 1.5 * u);
			}
		} else if (kind === 'sun') {
			ctx.globalAlpha = 0.1 + 0.03 * Math.sin(T * 0.8);
			ctx.fillStyle = 'rgba(255,235,150,1)';
			ctx.translate(W * 0.15, 0); ctx.rotate(0.5);
			for (let i = 0; i < 5; i++) ctx.fillRect(i * 90 * u - 100, -200, 26 * u, H + 400);
			ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
		}
		ctx.globalAlpha = 1; ctx.fillStyle = UI.C.dim;
		ctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`; ctx.textAlign = 'center';
		ctx.fillText({ rain: '☔ RAIN', sun: '☀ HARSH SUNLIGHT', sand: '≋ SANDSTORM', hail: '❄ HAIL' }[kind] || '', W / 2, 22 * u);
		ctx.textAlign = 'left';
		ctx.restore();
	}
	drawSide(ctx, a, side, W, H, u, slot = 0) {
		const mon = slot === 1 ? (side === 'foe' ? a.foeAlly : a.meAlly)
			: (side === 'foe' ? a.foe : a.me);
		const img = slot === 1 ? (side === 'foe' ? a.foeAllyImg : a.meAllyImg)
			: (side === 'foe' ? a.foeImg : a.meImg);
		const hidden = slot === 1 ? false : (side === 'foe' ? a.foeHidden : a.meHidden);
		if (!mon || mon.curHP <= 0) return;
		const pose = this.spritePose(a, side, W, H, u, slot);
		// platform with a type glow (Love2D drawPokemonSprite)
		const tc = UI.TYPE_COLORS[mon.types[0]] || '#888';
		ctx.save();
		ctx.globalAlpha = 0.28;
		ctx.fillStyle = tc;
		ctx.beginPath(); ctx.ellipse(pose.x, pose.y, 118 * u, 30 * u, 0, 0, Math.PI * 2); ctx.fill();
		ctx.globalAlpha = 0.5;
		ctx.fillStyle = stagePalette(a.stage).plat; // platform disc tinted to the terrain
		ctx.beginPath(); ctx.ellipse(pose.x, pose.y, 104 * u, 24 * u, 0, 0, Math.PI * 2); ctx.fill();
		ctx.restore();
		// the ball, mid-catch
		const fx = a.fx;
		if (side === 'foe' && fx?.side === 'foe' && fx.kind === 'ballthrow') {
			const p = Math.min(1, fx.t / fx.dur);
			const sx = W * 0.3, sy = H * 0.65, ex = pose.x, ey = pose.y - 20 * u;
			const bx = sx + (ex - sx) * p, by = sy + (ey - sy) * p - Math.sin(Math.PI * p) * 120 * u;
			UI.drawBall(ctx, bx, by, 13 * u, p * 6);
		} else if (side === 'foe' && a.ballShown) {
			UI.drawBall(ctx, pose.x, pose.y - 12 * u, 13 * u, pose.wob);
			if (fx?.kind === 'ballcatch' && fx.side === 'foe') {
				const p = Math.min(1, fx.t / fx.dur);
				ctx.strokeStyle = `rgba(255,220,120,${1 - p})`;
				ctx.lineWidth = 3 * u;
				for (let i = 0; i < 5; i++) {
					const ang = i / 5 * Math.PI * 2 + p * 2;
					const r = (18 + p * 26) * u;
					ctx.beginPath();
					ctx.arc(pose.x + Math.cos(ang) * r, pose.y - 12 * u + Math.sin(ang) * r, 2.4 * u, 0, Math.PI * 2);
					ctx.stroke();
				}
			}
			if (fx?.kind === 'ballbreak' && fx.side === 'foe') {
				const p = Math.min(1, fx.t / fx.dur);
				ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - p)})`;
				ctx.beginPath(); ctx.arc(pose.x, pose.y - 12 * u, (10 + p * 60) * u, 0, Math.PI * 2); ctx.fill();
			}
		}
		// the player's SEND-OUT ball (Batch 5): arcs from the trainer's corner, then
		// bursts open in a flash + ring as the mon appears (drawn while it's hidden)
		if (side === 'me' && fx?.side === 'me' && fx.kind === 'sendthrow') {
			const p = Math.min(1, fx.t / fx.dur);
			const sx = W * 0.1, sy = H * 0.72, ex = pose.x, ey = pose.y - 12 * u;
			const bx = sx + (ex - sx) * p, by = sy + (ey - sy) * p - Math.sin(Math.PI * p) * 130 * u;
			UI.drawBall(ctx, bx, by, 12 * u, p * 8);
		} else if (side === 'me' && fx?.side === 'me' && fx.kind === 'sendburst') {
			const p = Math.min(1, fx.t / fx.dur);
			ctx.save();
			ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - p)})`;
			ctx.beginPath(); ctx.arc(pose.x, pose.y - 14 * u, (8 + p * 68) * u, 0, Math.PI * 2); ctx.fill();
			ctx.strokeStyle = `rgba(255,235,150,${0.9 * (1 - p)})`; ctx.lineWidth = 3 * u;
			ctx.beginPath(); ctx.arc(pose.x, pose.y - 14 * u, (10 + p * 84) * u, 0, Math.PI * 2); ctx.stroke();
			ctx.restore();
		}
		if (!img || hidden || pose.blink) return;
		ctx.save();
		ctx.globalAlpha = pose.alpha;
		if (mon.shiny) ctx.filter = 'hue-rotate(150deg) saturate(1.3)'; // shiny palette shift
		ctx.imageSmoothingEnabled = false;
		// Normalize to the 96px standard canvas. Sprites were exported at wildly varying
		// native sizes (~12px crops up to 256px Gen-9 art); a fixed scale on raw dims made
		// big-canvas mons render ~2.7x too large and tiny crops render as dots. Fitting each
		// sprite into a 96-box (contain) draws every mon at a consistent battle size, and
		// keeps bottom-anchoring consistent so feet sit on the platform. `battleScale` then
		// restores authentic relative size per species (Diglett small, Wailord huge); absent = 1.
		const bScale = this.data.species[mon.speciesId]?.battleScale || 1;
		// per-species sprite tuning (sprite_tuning.json): `crop` is the measured
		// visible-pixel box ([x,y,w,h] as canvas fractions, from sprite-audit) —
		// sprites exported with big transparent margins normalize and anchor by
		// their VISIBLE pixels, so they draw at intended size, feet on the
		// platform, centred. s/x/y are hand tweaks on top (spritetune overlay).
		const tune = UI.SPRITE_TUNING[mon.speciesId]?.[side === 'foe' ? 'front' : 'back'];
		const cb = tune?.crop;
		const em = cb ? Math.max(img.width * cb[2], img.height * cb[3]) : Math.max(img.width, img.height);
		const norm = (96 / em) * bScale * (tune?.s || 1);
		const w = img.width * pose.scale * norm, h = img.height * pose.scale * norm;
		const ax = cb ? (cb[0] + cb[2] / 2) * w : w / 2; // anchor: visible bottom-centre
		const ay = cb ? (cb[1] + cb[3]) * h : h;
		ctx.drawImage(img, pose.x + pose.dx - ax + (tune?.x || 0) * u, pose.y + pose.dy - ay + (10 + (tune?.y || 0)) * u, w, h);
		ctx.restore();
		if (mon.shiny) {
			// golden twinkles orbit a shiny so it reads at a glance
			const t = performance.now() / 1000;
			ctx.save();
			ctx.fillStyle = 'rgba(255,230,140,0.9)';
			for (let i = 0; i < 3; i++) {
				const tw = (Math.sin(t * 2.1 + i * 2.6) + 1) / 2;
				const ang = t * 0.7 + i * (Math.PI * 2 / 3);
				const cx2 = pose.x + pose.dx + Math.cos(ang) * 52 * u;
				const cy2 = pose.y + pose.dy - 46 * u + Math.sin(ang * 1.3) * 26 * u;
				const r = (1.2 + tw * 2.4) * u;
				ctx.beginPath();
				ctx.moveTo(cx2, cy2 - r); ctx.lineTo(cx2 + r * 0.35, cy2 - r * 0.35);
				ctx.lineTo(cx2 + r, cy2); ctx.lineTo(cx2 + r * 0.35, cy2 + r * 0.35);
				ctx.lineTo(cx2, cy2 + r); ctx.lineTo(cx2 - r * 0.35, cy2 + r * 0.35);
				ctx.lineTo(cx2 - r, cy2); ctx.lineTo(cx2 - r * 0.35, cy2 - r * 0.35);
				ctx.closePath(); ctx.fill();
			}
			ctx.restore();
		}
	}

	draw(ctx, W, H) {
		const a = this.active;
		if (!a) return;
		// ub scales the bottom bar only (== u everywhere except wide-short
		// landscape-phone canvases, where `compact` is also set — battleui.layout)
		const { portrait, compact, u, ubar: ub, barY, barH } = UI.layout(W, H);
		this.ui = [];
		if (a.phase === 'flash') {
			// battle-start burst: dark field + a quick opening flash + expanding rings
			// (was a 2-frame black/white strobe)
			const p = Math.min(1, a.t / 0.6);
			ctx.fillStyle = '#0b0914'; ctx.fillRect(0, 0, W, H);
			const cx = W / 2, cy = H * 0.44;
			ctx.save(); ctx.lineWidth = 5 * u;
			for (let i = 0; i < 3; i++) {
				const rp = p - i * 0.12; if (rp <= 0) continue;
				ctx.globalAlpha = Math.max(0, 0.7 - rp);
				ctx.strokeStyle = i % 2 ? '#9cc0ff' : '#ffffff';
				ctx.beginPath(); ctx.arc(cx, cy, rp * W * 0.9, 0, Math.PI * 2); ctx.stroke();
			}
			ctx.restore();
			ctx.globalAlpha = Math.max(0, 1 - p * 3); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
			return;
		}
		ctx.save();
		if (a.shakeT > 0) { const m = (a.shakeMag || 8) * u; ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m); }
		// per-terrain backdrop (cached offscreen — rebuilt only when stage/size changes)
		this.drawStage(ctx, a.stage, W, H);
		this.drawStageAmbient(ctx, a.stage, W, H, u); // subtle drifting motes behind the mons

		if (a.weather) { // colour wash behind the combatants; the particles + label sit in front
			ctx.fillStyle = { rain: 'rgba(70,110,200,0.18)', sun: 'rgba(255,190,80,0.16)',
				sand: 'rgba(200,170,90,0.2)', hail: 'rgba(180,220,255,0.18)' }[a.weather.kind] || 'transparent';
			ctx.fillRect(0, 0, W, H);
		}
		this.drawSide(ctx, a, 'foe', W, H, u);
		this.drawSide(ctx, a, 'me', W, H, u);
		if (a.double) {
			this.drawSide(ctx, a, 'foe', W, H, u, 1);
			this.drawSide(ctx, a, 'me', W, H, u, 1);
		}
		this.drawMoveFx(ctx, a, W, H, u);
		if (a.weather) this.drawBattleWeather(ctx, a.weather.kind, W, H, u); // rain/hail/sand/sun in front + label
		if (a.flash) { ctx.save(); ctx.globalAlpha = Math.max(0, a.flash.t / a.flash.dur); ctx.fillStyle = a.flash.color; ctx.fillRect(0, 0, W, H); ctx.restore(); } // crit/super-effective punch

		// hit sparks + floating combat text ride each combatant's pose
		for (const p of a.particles || []) {
			const pose = this.spritePose(a, p.side, W, H, u);
			ctx.globalAlpha = Math.max(0, 1 - p.t / 0.6);
			ctx.fillStyle = p.color;
			ctx.beginPath();
			ctx.arc(pose.x + p.dx * u, pose.y + p.dy * u, p.r * u, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
		for (const f of a.floaters || []) {
			const pose = this.spritePose(a, f.side, W, H, u);
			const y = pose.y - 130 * u - f.t * 50 * u;
			ctx.globalAlpha = Math.max(0, 1 - f.t);
			ctx.font = `${Math.round(26 * u)}px m6x11plus, monospace`;
			ctx.textAlign = 'center';
			ctx.lineWidth = 4 * u;
			ctx.strokeStyle = '#14100f';
			ctx.strokeText(f.text, pose.x, y);
			ctx.fillStyle = f.color || '#fff';
			ctx.fillText(f.text, pose.x, y);
			ctx.textAlign = 'left';
		}
		ctx.globalAlpha = 1;

		// info panels (allies get compact ones)
		if (a.double && a.foeAlly && a.foeAlly.curHP > 0) {
			a.foeAllyShownHP = a.foeAllyShownHP ?? a.foeAlly.curHP;
			UI.monPanel(ctx, a.foeAlly, 14 * u, 102 * u, 230 * u, u,
				{ shownHP: a.foeAllyShownHP, boosts: a.foeAllyBoosts });
		}
		if (a.double && a.meAlly && a.meAlly.curHP > 0) {
			const myY = barY - 118 * u;
			// portrait has no width for two side-by-side panels — the ally goes left
			UI.monPanel(ctx, a.meAlly, portrait ? 14 * u : W - 14 * u - 300 * u - 246 * u, myY, 230 * u, u,
				{ shownHP: a.meAllyShownHP ?? a.meAlly.curHP, boosts: a.meAllyBoosts, showNumbers: true,
					showXP: true, expFrac: this.expFracFor(a.meAlly, a.meAllyShownExp ?? (a.meAlly.exp ?? expForLevel(a.meAlly.level))) });
		}
		UI.monPanel(ctx, a.foe, 14 * u, 14 * u, 272 * u, u,
			{ shownHP: a.foeShownHP, boosts: a.foeBoosts, abilityName: this.abilityName(a.foe.ability),
				itemName: a.foe.heldItem ? this.itemName(a.foe) : null });
		if (a.isTrainer) UI.teamDots(ctx, a.foes, a.foe, 30 * u, 106 * u, u);
		const meY = barY - 118 * u;
		UI.monPanel(ctx, a.me, W - 14 * u - 300 * u, meY, 300 * u, u,
			{ shownHP: a.meShownHP, boosts: a.meBoosts, showXP: true, showNumbers: true,
				expFrac: this.expFracFor(a.me, a.meShownExp ?? (a.me.exp ?? expForLevel(a.me.level))), abilityName: this.abilityName(a.me.ability),
				itemName: a.me.heldItem ? this.itemName(a.me) : null,
				// low-HP red-bar pulse (pairs with the beep in update)
				pulse: (a.me.curHP > 0 && a.me.curHP / a.me.maxHP <= 0.2) ? (0.5 + 0.5 * Math.sin(a.t * 9)) : 0 });
		// party dots sit in a row just above the panel's right edge
		UI.teamDots(ctx, a.party, a.me,
			W - 14 * u - 10 * u - (a.party.length - 1) * 18 * u - 6 * u, meY - 12 * u, u);

		// bottom bar
		UI.panel(ctx, 8 * ub, barY, W - 16 * ub, barH - 8 * ub, 10 * ub);
		const hov = a.hover;
		const btn = (b, id) => { b.id = id; this.ui.push(b); UI.button(ctx, b, hov === id || b.kbSel, ub); };

		if (portrait) {
			this.drawBarPortrait(ctx, a, W, H, u, barY, btn);
		} else if (a.phase === 'menu') {
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(17 * ub)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, W - 300 * ub).slice(0, 3).forEach((l, i) =>
				ctx.fillText(l, 24 * ub, barY + 32 * ub + i * 22 * ub));
			const labels = a.safari ? ['BALL', 'BAIT', 'ROCK', 'RUN'] : ['FIGHT', 'BAG', 'PKMN', 'RUN'];
			labels.forEach((lab, i) => {
				const bw = 120 * ub, bh = 44 * ub;
				const x = W - 24 * ub - (2 - i % 2) * (bw + 8 * ub) + 8 * ub;
				const y = barY + 10 * ub + Math.floor(i / 2) * (bh + 8 * ub);
				btn({ x, y, w: bw, h: bh, label: lab, big: true, center: true, kbSel: a.menuIdx === i }, 'menu:' + i);
			});
		} else if (a.phase === 'moves') {
			const backW = 86 * ub;
			const bw = (W - 16 * ub - backW - 40 * ub) / 2, bh = 44 * ub;
			(a.double ? this.chooser() : a.me).moves.forEach((mv, i) => {
				const info = this.data.moves[mv.id] || {};
				const x = 20 * ub + (i % 2) * (bw + 8 * ub);
				const y = barY + 9 * ub + Math.floor(i / 2) * (bh + 8 * ub);
				btn({
					x, y, w: bw, h: bh,
					label: (a.swapFrom === i ? '⇄ ' : '') + mv.name.toUpperCase().slice(0, 16),
					sub: a.swapFrom === i ? 'SWAPPING...' : `PP ${mv.pp}/${mv.maxPp}${this.dmgHint(mv)}`,
					subColor: mv.pp === 0 ? UI.C.hpRed : UI.C.dim,
					right: (info.power ? `Pwr ${info.power}` : (info.category || '')) + this.effHint(info),
					// while a swap is armed every slot is a valid target — no gray-out
					type: info.type, disabled: a.swapFrom == null && !this.moveUsable(a.double ? this.chooser() : a.me, mv, 'me'),
					kbSel: a.moveIdx === i,
				}, 'move:' + i);
			});
			this.drawSpeedHint(ctx, a, 20 * ub, barY + barH - 6 * ub, ub);
			btn({ x: W - 8 * ub - backW - 8 * ub, y: barY + 9 * ub, w: backW, h: 44 * ub, label: 'BACK', center: true }, 'back');
			btn({ x: W - 8 * ub - backW - 8 * ub, y: barY + 61 * ub, w: backW, h: 44 * ub,
				label: a.swapFrom != null ? 'CANCEL' : 'SWAP', center: true, kbSel: a.swapFrom != null }, 'swapbtn');
		} else if (a.phase === 'target') {
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(16 * ub)}px m6x11plus, monospace`;
			ctx.fillText('Attack which foe?', 24 * ub, barY + 30 * ub);
			this.livingFoes().forEach((f, i) => {
				btn({
					x: 24 * ub + i * 250 * ub, y: barY + 44 * ub, w: 236 * ub, h: 52 * ub,
					label: `${f.name}  ${f.curHP}/${f.maxHP}`, center: true, kbSel: a.targetIdx === i,
				}, 'target:' + i);
			});
			btn({ x: W - 8 * ub - 94 * ub, y: barY + 9 * ub, w: 86 * ub, h: 96 * ub, label: 'BACK', center: true }, 'back');
		} else if (a.phase === 'bag' || a.phase === 'switch') {
			const isBag = a.phase === 'bag';
			const rows = isBag ? this.bagItems()
				: a.party.filter(m => m !== a.me && m !== a.meAlly && m.curHP > 0);
			const idx = isBag ? a.bagIdx : a.switchIdx;
			// compact landscape: two 44px thumb rows instead of three 29px ones —
			// three tall rows can't fit the bar, so the scroll window shrinks
			const vis = compact ? 2 : 3;
			const rh = compact ? 44 * ub : 28 * ub;
			const rstep = compact ? rh + 6 * ub : 32 * ub;
			const start = Math.max(0, Math.min(idx - 1, rows.length - vis));
			rows.slice(start, start + vis).forEach((r, i) => {
				const ri = start + i;
				const label = isBag ? `${r.name}  x${r.n}` : `${r.name}  Lv${r.level}`;
				btn({
					x: 20 * ub, y: barY + 9 * ub + i * rstep, w: W * 0.58, h: rh, label,
					right: isBag ? '' : `${r.curHP}/${r.maxHP} HP`, kbSel: ri === idx,
				}, (isBag ? 'bag:' : 'switch:') + ri);
			});
			if (!rows.length) {
				ctx.fillStyle = UI.C.dim;
				ctx.font = `${Math.round(15 * ub)}px m6x11plus, monospace`;
				ctx.fillText(isBag ? 'The bag is empty.' : 'No one else can fight!', 24 * ub, barY + 34 * ub);
			}
			if (rows.length > vis) {
				btn({ x: W * 0.58 + 32 * ub, y: barY + 9 * ub, w: 40 * ub, h: 44 * ub, label: '▲', center: true }, 'scroll:-1');
				btn({ x: W * 0.58 + 32 * ub, y: barY + 61 * ub, w: 40 * ub, h: 44 * ub, label: '▼', center: true }, 'scroll:1');
			}
			btn({ x: W - 8 * ub - 94 * ub, y: barY + 9 * ub, w: 86 * ub, h: 96 * ub, label: 'BACK', center: true }, 'back');
		} else if (a.phase === 'learn') {
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(15 * ub)}px m6x11plus, monospace`;
			ctx.fillText(`Which move should be forgotten for ${a.learn.name}?`, 20 * ub, barY + 20 * ub);
			const backW = 96 * ub;
			const bw = (W - 16 * ub - backW - 44 * ub) / 2, bh = 37 * ub;
			a.learn.mon.moves.forEach((mv, i) => {
				const info = this.data.moves[mv.id] || {};
				btn({
					x: 20 * ub + (i % 2) * (bw + 8 * ub),
					y: barY + 28 * ub + Math.floor(i / 2) * (bh + 7 * ub),
					w: bw, h: bh, label: mv.name.toUpperCase().slice(0, 16),
					type: info.type, kbSel: a.learnIdx === i,
				}, 'learn:' + i);
			});
			btn({ x: W - 8 * ub - backW - 8 * ub, y: barY + 28 * ub, w: backW, h: 2 * bh + 7 * ub,
				label: 'GIVE UP', center: true, kbSel: a.learnIdx === 4 }, 'learn:skip');
		} else {
			// message phase (and 'done' fadeout)
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(18 * ub)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, W - 70 * ub).slice(0, 3).forEach((l, i) =>
				ctx.fillText(l, 24 * ub, barY + 34 * ub + i * 24 * ub));
			if (a.phase === 'msg' && Math.floor(a.t * 2) % 2 === 0) {
				ctx.fillStyle = UI.C.accent;
				ctx.font = `${Math.round(16 * ub)}px m6x11plus, monospace`;
				ctx.fillText('▼', W - 34 * ub, barY + 96 * ub);
			}
			this.ui.push({ id: 'advance', x: 0, y: 0, w: W, h: H });
		}
		if (a.phase === 'done') {
			ctx.fillStyle = `rgba(8,6,14,${Math.min(0.85, (a.doneT || 0) * 1.4)})`;
			ctx.fillRect(0, 0, W, H);
		}
		ctx.restore();
	}

	// The portrait control deck: same phases as the landscape bar, laid out as
	// full-width thumb rows/grids (u is W/512 here — see battleui.layout — so
	// every button clears the 44 CSS px touch minimum on a 390px-wide phone).
	drawBarPortrait(ctx, a, W, H, u, barY, btn) {
		const pad = 14 * u, gap = 8 * u;
		const fullW = W - 2 * pad;
		if (a.phase === 'menu') {
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(19 * u)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, fullW - 20 * u).slice(0, 2).forEach((l, i) =>
				ctx.fillText(l, 24 * u, barY + 30 * u + i * 24 * u));
			const bw = (fullW - 10 * u) / 2, bh = 82 * u;
			(a.safari ? ['BALL', 'BAIT', 'ROCK', 'RUN'] : ['FIGHT', 'BAG', 'PKMN', 'RUN']).forEach((lab, i) => {
				btn({ x: pad + (i % 2) * (bw + 10 * u), y: barY + 74 * u + Math.floor(i / 2) * (bh + 10 * u),
					w: bw, h: bh, label: lab, big: true, center: true, kbSel: a.menuIdx === i }, 'menu:' + i);
			});
		} else if (a.phase === 'moves') {
			const bw = (fullW - gap) / 2, bh = 72 * u;
			(a.double ? this.chooser() : a.me).moves.forEach((mv, i) => {
				const info = this.data.moves[mv.id] || {};
				btn({
					x: pad + (i % 2) * (bw + gap), y: barY + 12 * u + Math.floor(i / 2) * (bh + gap),
					w: bw, h: bh,
					label: (a.swapFrom === i ? '⇄ ' : '') + mv.name.toUpperCase().slice(0, 16),
					sub: a.swapFrom === i ? 'SWAPPING...' : `PP ${mv.pp}/${mv.maxPp}${this.dmgHint(mv)}`,
					subColor: mv.pp === 0 ? UI.C.hpRed : UI.C.dim,
					right: (info.power ? `Pwr ${info.power}` : (info.category || '')) + this.effHint(info),
					type: info.type, disabled: a.swapFrom == null && !this.moveUsable(a.double ? this.chooser() : a.me, mv, 'me'),
					kbSel: a.moveIdx === i,
				}, 'move:' + i);
			});
			const rowY = barY + 12 * u + 2 * (bh + gap) + 6 * u;
			btn({ x: pad, y: rowY, w: (fullW - gap) / 2, h: 60 * u, label: 'BACK', center: true }, 'back');
			btn({ x: pad + (fullW + gap) / 2, y: rowY, w: (fullW - gap) / 2, h: 60 * u,
				label: a.swapFrom != null ? 'CANCEL' : 'SWAP', center: true, kbSel: a.swapFrom != null }, 'swapbtn');
			this.drawSpeedHint(ctx, a, pad, rowY + 60 * u + 16 * u, u);
		} else if (a.phase === 'target') {
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
			ctx.fillText('Attack which foe?', 24 * u, barY + 28 * u);
			this.livingFoes().forEach((f, i) => {
				btn({ x: pad, y: barY + 42 * u + i * (64 * u + gap), w: fullW, h: 64 * u,
					label: `${f.name}  ${f.curHP}/${f.maxHP}`, center: true, kbSel: a.targetIdx === i }, 'target:' + i);
			});
			btn({ x: pad, y: barY + 196 * u, w: fullW, h: 60 * u, label: 'BACK', center: true }, 'back');
		} else if (a.phase === 'bag' || a.phase === 'switch') {
			const isBag = a.phase === 'bag';
			const rows = isBag ? this.bagItems() : a.party.filter(m => m !== a.me && m !== a.meAlly && m.curHP > 0);
			const idx = isBag ? a.bagIdx : a.switchIdx;
			const start = Math.max(0, Math.min(idx - 1, rows.length - 3));
			const arrows = rows.length > 3;
			const rw = fullW - (arrows ? 72 * u : 0);
			rows.slice(start, start + 3).forEach((r, i) => {
				const ri = start + i;
				const label = isBag ? `${r.name}  x${r.n}` : `${r.name}  Lv${r.level}`;
				btn({ x: pad, y: barY + 12 * u + i * (59 * u + 6 * u), w: rw, h: 59 * u, label,
					right: isBag ? '' : `${r.curHP}/${r.maxHP} HP`, kbSel: ri === idx }, (isBag ? 'bag:' : 'switch:') + ri);
			});
			if (!rows.length) {
				ctx.fillStyle = UI.C.dim;
				ctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
				ctx.fillText(isBag ? 'The bag is empty.' : 'No one else can fight!', 24 * u, barY + 40 * u);
			}
			if (arrows) {
				btn({ x: W - pad - 64 * u, y: barY + 12 * u, w: 64 * u, h: 90 * u, label: '▲', center: true }, 'scroll:-1');
				btn({ x: W - pad - 64 * u, y: barY + 108 * u, w: 64 * u, h: 90 * u, label: '▼', center: true }, 'scroll:1');
			}
			btn({ x: pad, y: barY + 203 * u, w: fullW, h: 59 * u, label: 'BACK', center: true }, 'back');
		} else if (a.phase === 'learn') {
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
			UI.wrap(ctx, `Which move should be forgotten for ${a.learn.name}?`, fullW).slice(0, 2).forEach((l, i) =>
				ctx.fillText(l, 20 * u, barY + 22 * u + i * 17 * u));
			const bw = (fullW - gap) / 2, bh = 54 * u;
			a.learn.mon.moves.forEach((mv, i) => {
				const info = this.data.moves[mv.id] || {};
				btn({ x: pad + (i % 2) * (bw + gap), y: barY + 58 * u + Math.floor(i / 2) * (bh + 7 * u),
					w: bw, h: bh, label: mv.name.toUpperCase().slice(0, 16), type: info.type, kbSel: a.learnIdx === i }, 'learn:' + i);
			});
			btn({ x: pad, y: barY + 58 * u + 2 * (bh + 7 * u) + 4 * u, w: fullW, h: 54 * u,
				label: 'GIVE UP', center: true, kbSel: a.learnIdx === 4 }, 'learn:skip');
		} else {
			// message phase (and 'done' fadeout)
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(20 * u)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, fullW - 20 * u).slice(0, 4).forEach((l, i) =>
				ctx.fillText(l, 24 * u, barY + 38 * u + i * 27 * u));
			if (a.phase === 'msg' && Math.floor(a.t * 2) % 2 === 0) {
				ctx.fillStyle = UI.C.accent;
				ctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
				ctx.fillText('▼', W - 38 * u, H - 24 * u);
			}
			this.ui.push({ id: 'advance', x: 0, y: 0, w: W, h: H });
		}
	}

	// ---------- pointer input (tap/click + hover) ----------
	hover(x, y) {
		const a = this.active;
		if (!a) return;
		a.hover = null;
		for (const b of this.ui || []) {
			if (b.id !== 'advance' && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) a.hover = b.id;
		}
	}

	// tap/Z while a turn plays out: finish the current animation stage, snap the
	// HP-bar easing, and release the message hold. The blinking ▼ always
	// advertised tap-to-advance, but two hidden gates (a playing fx and the
	// bar ease) used to swallow the tap — each turn had ~2.4s of dead time no
	// amount of tapping could shorten.
	fastForward() {
		const a = this.active;
		if (!a) return;
		if (a.fx) {
			const fx = a.fx;
			a.fx = null; // clear FIRST: fx.done() may queue the next stage
			fx.t = fx.dur;
			fx.done?.();
		}
		a.foeShownHP = a.foe.curHP;
		a.meShownHP = a.me.curHP;
		if (a.foeAlly) a.foeAllyShownHP = a.foeAlly.curHP;
		if (a.meAlly) a.meAllyShownHP = a.meAlly.curHP;
		if (a.phase === 'msg') a.msgT = 99;
	}

	tap(x, y) {
		const a = this.active;
		if (!a) return;
		let hit = null;
		for (const b of this.ui || []) {
			if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) hit = b;
		}
		if (!hit) return;
		const [kind, arg] = hit.id.split(':');
		if (kind === 'advance') { this.fastForward(); return; }
		if (kind === 'back') { this.key('x'); return; }
		if (kind === 'menu') { a.menuIdx = +arg; this.key('z'); return; }
		if (kind === 'move') { a.moveIdx = +arg; this.key('z'); return; }
		if (kind === 'swapbtn') { this.key('s'); return; }
		if (kind === 'target') { a.targetIdx = +arg; this.key('z'); return; }
		if (kind === 'bag') { a.bagIdx = +arg; this.key('z'); return; }
		if (kind === 'switch') { a.switchIdx = +arg; this.key('z'); return; }
		if (kind === 'learn') { this.resolveLearn(arg === 'skip' ? -1 : +arg); return; }
		if (kind === 'scroll') this.key(+arg > 0 ? 'ArrowDown' : 'ArrowUp');
	}
}
