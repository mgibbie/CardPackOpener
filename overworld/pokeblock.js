// pokeblock.js — POKeBLOCKS, faithful to pokeemerald (no DOM; node-testable).
//
//   blending   berry_blender.c CalculatePokeblock / CalculatePokeblockColor and
//              the NPC berries (SetOpponentsBerryData)
//   the case   pokeblock.c: 40 slots (POKEBLOCKS_COUNT), first free slot,
//              GetHighestPokeblocksFlavorLevel / GetPokeblocksFeel, the names
//   feeding    use_pokeblock.c AddPokeblockToConditions +
//              CalculatePokeblockEffectiveness, with pokeblock.c PokeblockGetGain
//              and gPokeblockFlavorCompatibilityTable (the nature's liked /
//              disliked flavor turns ±10% of that flavor's gain)
//   feeders    safari_zone.c: up to 10 POKeBLOCK FEEDERS, 100 steps each; a
//              wild mon within 5 tiles takes a nature that likes the block 80% of
//              the time (wild_encounter.c PickWildMonNature)
//
// Condition lives on the mon as mon.contest = { cool, beauty, cute, smart, tough,
// sheen } (the contest engine reads it). Berry data: overworld/pokeblock_data.json
// (tools/gen_pokeblock_data.mjs).
import { safeLoad, safeSave } from './safestore.js';

export const FLAVORS = ['spicy', 'dry', 'sweet', 'bitter', 'sour'];
// CONDITION_* <- FLAVOR_* (use_pokeblock.c sConditionToFlavor)
export const FLAVOR_TO_CONDITION = { spicy: 'cool', dry: 'beauty', sweet: 'cute', bitter: 'smart', sour: 'tough' };
// PBLOCK_CLR_* (include/pokeblock.h)
export const CLR = { NONE: 0, RED: 1, BLUE: 2, PINK: 3, GREEN: 4, YELLOW: 5, PURPLE: 6, INDIGO: 7, BROWN: 8, LITE_BLUE: 9, OLIVE: 10, GRAY: 11, BLACK: 12, WHITE: 13, GOLD: 14 };
export const COLOR_NAMES = [null, 'RED', 'BLUE', 'PINK', 'GREEN', 'YELLOW', 'PURPLE', 'INDIGO', 'BROWN', 'LITEBLUE', 'OLIVE', 'GRAY', 'BLACK', 'WHITE', 'GOLD'];
export const pokeblockName = c => (COLOR_NAMES[c] ? `${COLOR_NAMES[c]} POKeBLOCK` : '');
export const POKEBLOCKS_COUNT = 40;
export const POKEBLOCK_MAX_FEEL = 99;
export const MAX_CONDITION = 255, MAX_SHEEN = 255;

// the 25 natures in the decomp's order, and their flavor relation
// (gPokeblockFlavorCompatibilityTable: spicy, dry, sweet, bitter, sour)
export const NATURE_ORDER = ['hardy', 'lonely', 'brave', 'adamant', 'naughty', 'bold', 'docile', 'relaxed', 'impish', 'lax',
	'timid', 'hasty', 'serious', 'jolly', 'naive', 'modest', 'mild', 'quiet', 'bashful', 'rash', 'calm', 'gentle', 'sassy', 'careful', 'quirky'];
const COMPAT = [
	[0, 0, 0, 0, 0], [1, 0, 0, 0, -1], [1, 0, -1, 0, 0], [1, -1, 0, 0, 0], [1, 0, 0, -1, 0],
	[-1, 0, 0, 0, 1], [0, 0, 0, 0, 0], [0, 0, -1, 0, 1], [0, -1, 0, 0, 1], [0, 0, 0, -1, 1],
	[-1, 0, 1, 0, 0], [0, 0, 1, 0, -1], [0, 0, 0, 0, 0], [0, -1, 1, 0, 0], [0, 0, 1, -1, 0],
	[-1, 1, 0, 0, 0], [0, 1, 0, 0, -1], [0, 1, -1, 0, 0], [0, 0, 0, 0, 0], [0, 1, 0, -1, 0],
	[-1, 0, 0, 1, 0], [0, 0, 0, 1, -1], [0, 0, -1, 1, 0], [0, -1, 0, 1, 0], [0, 0, 0, 0, 0],
];
// a mon without a nature (older saves) relates to no flavor, like HARDY
const natureIdx = n => Math.max(0, NATURE_ORDER.indexOf(String(n || 'hardy').toLowerCase()));
export const flavorRelation = (nature, flavor) => COMPAT[natureIdx(nature)][flavor];

// ---------- data ----------
let DATA = { berries: [] };
export function initPokeblockData(d) { if (d && Array.isArray(d.berries)) DATA = d; }
export const berries = () => DATA.berries;
export const dataString = label => DATA.strings?.[label] || null;
// ITEM_TO_BERRY: 1-based berry number for an item id ('cheriberry' -> 1), 0 if none
export function berryNum(itemId) { const i = DATA.berries.findIndex(b => b.id === itemId); return i + 1; }
export function berryInfo(itemId) { return DATA.berries[berryNum(itemId) - 1] || null; }
export const isBlendable = itemId => berryNum(itemId) > 0;

// ---------- blending ----------
// a BlenderBerry: { itemId, name, flavors: [5 flavors, feel] }
export function toBlenderBerry(itemId) {
	const b = berryInfo(itemId);
	if (!b) return null;
	return { itemId, name: b.name, flavors: [...b.flavors, b.smoothness] };
}

// SetOpponentsBerryData: the NPCs' berries for the player's berry.
// NUM_NPC_BERRIES = ITEM_TO_BERRY(ITEM_ASPEAR_BERRY) = 5; ids are berry numbers - 1
const NUM_NPC_BERRIES = 5;
const CHERI = 0, CHESTO = 1, PECHA = 2, RAWST = 3, ASPEAR = 4;
const OPPONENT_BERRY_SETS = [
	[ASPEAR, RAWST, PECHA], [CHERI, ASPEAR, RAWST], [CHESTO, CHERI, ASPEAR], [PECHA, CHESTO, CHERI], [RAWST, PECHA, CHESTO],
	[CHERI, PECHA, RAWST], [CHESTO, RAWST, ASPEAR], [PECHA, ASPEAR, CHERI], [RAWST, CHERI, CHESTO], [ASPEAR, CHESTO, PECHA],
];
// SPELON, PAMTRE, WATMEL, DURIN, BELUE (berry numbers 31-35) - 1
const BERRY_MASTER_BERRIES = [30, 31, 32, 33, 34];
const SPELON_NUM = 31, ENIGMA_NUM = 43;
// -> item ids of the NPCs' berries, player first excluded
export function opponentBerries(playerItemId, numPlayers, blendMaster) {
	const num = berryNum(playerItemId);
	let setId;
	if (num === ENIGMA_NUM) {
		const fl = toBlenderBerry(playerItemId).flavors;
		setId = 0;
		for (let i = 0; i < 5; i++) if (fl[setId] > fl[i]) setId = i;
		setId += NUM_NPC_BERRIES;
	} else {
		setId = num - 1;
		if (setId >= NUM_NPC_BERRIES) setId = (setId % NUM_NPC_BERRIES) + NUM_NPC_BERRIES;
	}
	const out = [];
	for (let i = 0; i < numPlayers - 1; i++) {
		let id = OPPONENT_BERRY_SETS[setId][i];
		if (blendMaster) {
			// u16 arithmetic: a berry below SPELON wraps far past the table
			const diff = (num - SPELON_NUM) & 0xffff;
			setId %= BERRY_MASTER_BERRIES.length;
			id = BERRY_MASTER_BERRIES[setId];
			if (diff < BERRY_MASTER_BERRIES.length) id -= BERRY_MASTER_BERRIES.length;
		}
		out.push(DATA.berries[id].id);
	}
	return out;
}

// CalculatePokeblockColor (the upper 16 bits it returns are ignored by its caller)
export function pokeblockColor(blendBerries, flavors, numNegatives) {
	const zero = flavors.slice(0, 5).filter(f => f === 0).length;
	if (zero === 5 || numNegatives > 3) return CLR.BLACK;
	for (let i = 0; i < blendBerries.length; i++) for (let j = 0; j < blendBerries.length; j++) {
		if (i !== j && blendBerries[i].itemId === blendBerries[j].itemId) return CLR.BLACK;
	}
	const present = [];
	for (let i = 0; i < 5; i++) if (flavors[i] > 0) present.push(i);
	const n = present.length;
	if (n > 3) return CLR.WHITE;
	if (n === 3) return CLR.GRAY;
	for (let i = 0; i < 5; i++) if (flavors[i] > 50) return CLR.GOLD;
	if (n === 1) return [CLR.RED, CLR.BLUE, CLR.PINK, CLR.GREEN, CLR.YELLOW][present[0]];
	if (n === 2) {
		const strong = flavors[present[0]] >= flavors[present[1]] ? present[0] : present[1];
		return [CLR.PURPLE, CLR.INDIGO, CLR.BROWN, CLR.LITE_BLUE, CLR.OLIVE][strong];
	}
	return CLR.NONE;
}

// sBlackPokeblockFlavorFlags: bit i = flavor i gets 2
const BLACK_FLAVOR_FLAGS = [
	(1 << 4) | (1 << 3) | (1 << 2), (1 << 4) | (1 << 2) | (1 << 1), (1 << 4) | (1 << 1) | (1 << 0),
	(1 << 4) | (1 << 3) | (1 << 1), (1 << 4) | (1 << 3) | (1 << 0), (1 << 3) | (1 << 2) | (1 << 1),
	(1 << 3) | (1 << 2) | (1 << 0), (1 << 3) | (1 << 1) | (1 << 0), (1 << 2) | (1 << 1) | (1 << 0),
	(1 << 4) | (1 << 2) | (1 << 0),
];
// CalculatePokeblock. rand16: () => 0..65535 (the decomp's Random()), used only
// for a BLACK block. -> { color, spicy, dry, sweet, bitter, sour, feel }
export function calculatePokeblock(blendBerries, maxRPM, rand16 = () => Math.floor(Math.random() * 65536)) {
	const numPlayers = blendBerries.length;
	const f = [0, 0, 0, 0, 0, 0];
	for (const b of blendBerries) for (let j = 0; j < 6; j++) f[j] += b.flavors[j];
	// each total minus the next one (order matters, and sour wraps to spicy)
	const first = f[0];
	f[0] -= f[1]; f[1] -= f[2]; f[2] -= f[3]; f[3] -= f[4]; f[4] -= first;
	let negatives = 0;
	for (let i = 0; i < 5; i++) if (f[i] < 0) { f[i] = 0; negatives++; }
	for (let i = 0; i < 5; i++) if (f[i] > 0) f[i] = f[i] < negatives ? 0 : f[i] - negatives;
	// the max RPM factor, rounded
	const mult = Math.floor(maxRPM / 333) + 100;
	for (let i = 0; i < 5; i++) {
		let v = Math.trunc((f[i] * mult) / 10);
		const rem = v % 10;
		v = Math.trunc(v / 10);
		if (rem > 4) v++;
		f[i] = v;
	}
	const color = pokeblockColor(blendBerries, f, negatives);
	f[5] = Math.trunc(f[5] / numPlayers) - numPlayers;
	if (f[5] < 0) f[5] = 0;
	if (color === CLR.BLACK) {
		const flags = BLACK_FLAVOR_FLAGS[rand16() % BLACK_FLAVOR_FLAGS.length];
		for (let i = 0; i < 5; i++) f[i] = (flags >> i) & 1 ? 2 : 0;
	}
	for (let i = 0; i < 6; i++) if (f[i] > 255) f[i] = 255;
	return { color, spicy: f[0], dry: f[1], sweet: f[2], bitter: f[3], sour: f[4], feel: f[5] };
}
export const flavorsOf = b => [b.spicy, b.dry, b.sweet, b.bitter, b.sour];
export const highestFlavorLevel = b => Math.max(...flavorsOf(b));
export const pokeblockFeel = b => Math.min(b.feel, POKEBLOCK_MAX_FEEL);
// PrintMadePokeblockString
export const madeText = b => `${pokeblockName(b.color)} was made!\nThe level is ${highestFlavorLevel(b)}, and the feel is ${pokeblockFeel(b)}.`;

// ---------- feeding ----------
// PokeblockGetGain: + liked, - disliked (sum of flavor x relation)
export function pokeblockGain(nature, b) {
	const fl = flavorsOf(b);
	let g = 0;
	for (let i = 0; i < 5; i++) if (fl[i] > 0) g += fl[i] * flavorRelation(nature, i);
	return g;
}
export function cond(mon) {
	if (!mon.contest) mon.contest = { cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0, sheen: 0 };
	for (const k of ['cool', 'beauty', 'cute', 'smart', 'tough', 'sheen']) mon.contest[k] = mon.contest[k] | 0;
	return mon.contest;
}
export const sheenMaxed = mon => cond(mon).sheen >= MAX_SHEEN;
// the condition order the results screen prints in (CONDITION_COOL..TOUGH)
export const CONDITIONS = ['cool', 'beauty', 'cute', 'smart', 'tough'];
export const CONDITION_NAMES = { cool: 'Coolness', beauty: 'Beauty', cute: 'Cuteness', smart: 'Smartness', tough: 'Toughness' };
// feed a block (use_pokeblock.c). -> null when its sheen is maxed ("It won't eat
// anymore…"), else { gain, ate, enhancements: {cool..tough: delta}, lines }
export function feedPokeblock(mon, b) {
	const c = cond(mon);
	if (c.sheen >= MAX_SHEEN) return null;
	const gain = pokeblockGain(mon.nature, b);
	const boosts = {};
	for (const [flavor, condition] of Object.entries(FLAVOR_TO_CONDITION)) boosts[condition] = b[flavor];
	const dir = gain > 0 ? 1 : gain < 0 ? -1 : 0;
	if (dir) {
		for (const [flavor, condition] of Object.entries(FLAVOR_TO_CONDITION)) {
			const amount = boosts[condition];
			let boost = Math.trunc(amount / 10);
			if (amount % 10 >= 5) boost++;
			const rel = flavorRelation(mon.nature, FLAVORS.indexOf(flavor));
			if (rel === dir) boosts[condition] += boost * rel;
		}
	}
	const enhancements = {};
	for (const k of CONDITIONS) {
		const before = c[k];
		c[k] = Math.max(0, Math.min(MAX_CONDITION, before + boosts[k]));
		enhancements[k] = c[k] - before;
	}
	c.sheen = Math.min(MAX_SHEEN, c.sheen + b.feel);
	const name = mon.nickname || mon.name;
	const ate = gain === 0 ? `${name} ate the\n${pokeblockName(b.color)}.`
		: gain > 0 ? `${name} happily ate the\n${pokeblockName(b.color)}.`
			: `${name} disdainfully ate the\n${pokeblockName(b.color)}.`;
	// BufferEnhancedText: one line per condition that moved (up or down)
	const lines = CONDITIONS.filter(k => enhancements[k] !== 0).map(k => `${CONDITION_NAMES[k]} was enhanced!`);
	if (!lines.length) lines.push('Nothing changed!');
	return { gain, ate, enhancements, lines };
}

// ---------- the POKeBLOCK CASE (gSaveBlock1Ptr->pokeblocks[40]) ----------
export const CASE_KEY = 'magepunk_pokeblocks_v1';
export function loadCase() {
	const raw = safeLoad(CASE_KEY, null);
	const slots = Array.isArray(raw) ? raw.slice(0, POKEBLOCKS_COUNT) : [];
	while (slots.length < POKEBLOCKS_COUNT) slots.push(null);
	return slots.map(s => (s && s.color ? s : null));
}
export function saveCase(slots) { safeSave(CASE_KEY, slots.map(s => s || null)); }
// GetFirstFreePokeblockSlot: -1 when full
export function firstFreeSlot(slots = loadCase()) { return slots.findIndex(s => !s); }
export function addPokeblock(b) {
	const slots = loadCase();
	const i = firstFreeSlot(slots);
	if (i < 0) return false;
	slots[i] = { color: b.color, spicy: b.spicy, dry: b.dry, sweet: b.sweet, bitter: b.bitter, sour: b.sour, feel: b.feel };
	saveCase(slots);
	return true;
}
export function removePokeblock(i) {
	const slots = loadCase();
	if (!slots[i]) return false;
	slots[i] = null;
	saveCase(slots);
	return true;
}
// the case's list (CompactPokeblockSlots + the menu): filled slots in order
export const caseList = (slots = loadCase()) => slots.map((b, i) => (b ? { slot: i, ...b } : null)).filter(Boolean);

// ---------- POKeBLOCK FEEDERS (safari_zone.c) ----------
const NUM_FEEDERS = 10, FEEDER_STEPS = 100;
let feeders = [];   // { mapId, x, y, stepCounter, pokeblock } — EWRAM: gone on reload, like the GBA's
export const resetFeeders = () => { feeders = []; };
export function feederAt(mapId, x, y) { return feeders.findIndex(f => f.mapId === mapId && f.x === x && f.y === y); }
export const feederBlock = i => feeders[i]?.pokeblock || null;
export function placeFeeder(mapId, x, y, b) {
	// SafariZoneActivatePokeblockFeeder: the first empty feeder
	let i = feeders.findIndex(f => !f);
	if (i < 0) { if (feeders.length >= NUM_FEEDERS) return false; i = feeders.length; }
	feeders[i] = { mapId, x, y, stepCounter: FEEDER_STEPS, pokeblock: { ...b } };
	return true;
}
// DecrementFeederStepCounters: one per Safari step
export function feederStep() {
	feeders = feeders.map(f => (f && --f.stepCounter > 0 ? f : null));
	while (feeders.length && !feeders[feeders.length - 1]) feeders.pop();
}
// GetPokeblockFeederWithinRange: the first feeder on this map within 5 tiles
export function feederInRange(mapId, x, y) {
	for (const f of feeders) if (f && f.mapId === mapId && Math.abs(x - f.x) + Math.abs(y - f.y) <= 5) return f.pokeblock;
	return null;
}
// PickWildMonNature's feeder branch: null when it falls through to the usual roll
export function feederNature(block, rand16 = () => Math.floor(Math.random() * 65536)) {
	if (!block || rand16() % 100 >= 80) return null;
	const order = NATURE_ORDER.map((_, i) => i);
	for (let i = 0; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
		if (rand16() & 1) [order[i], order[j]] = [order[j], order[i]];
	}
	for (const n of order) if (pokeblockGain(NATURE_ORDER[n], block) > 0) return NATURE_ORDER[n];
	return null;
}
