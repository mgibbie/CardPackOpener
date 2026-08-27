// daycare.js — deposit up to two Pokémon; they gain EXP per walked step, and a
// compatible pair (opposite genders, or a Ditto) lays an Egg that hatches into
// the mother's base-form baby after more steps. State persists in localStorage.
import { buildMon, statsFor } from './battle.js';
import { safeLoad, safeSave } from './safestore.js';

const KEY = 'magepunk_daycare';
const EGG_LAY_STEPS = 128;   // both slots filled -> egg appears
const EGG_HATCH_STEPS = 160; // egg incubates while you walk
const WITHDRAW_BASE = 100;   // + 100 per level gained

function fresh() { return { slots: [null, null], breedSteps: 0, egg: null }; }
function load() {
	const d = safeLoad(KEY, null);
	return (d && Array.isArray(d.slots)) ? d : fresh();
}
function save(d) { safeSave(KEY, d); }

let state = load();
export function get() { return state; }
export function reset() { state = fresh(); save(state); }

const isDitto = m => m && m.speciesId === 'ditto';
const norm = g => (g === 'M' || g === 'F') ? g : null;

// base-form (lowest pre-evolution) of a species, via a reverse map of evos
let prevoMap = null;
function baseForm(speciesId, data) {
	if (!prevoMap) {
		prevoMap = {};
		for (const [src, e] of Object.entries(data.extra || {})) {
			for (const ev of e.evos || []) prevoMap[ev.target] = src;
		}
	}
	let cur = speciesId, guard = 0;
	while (prevoMap[cur] && data.species[prevoMap[cur]] && guard++ < 10) cur = prevoMap[cur];
	return cur;
}

// two parents can breed if not both Ditto and (a Ditto is present or genders differ)
export function compatible(a, b) {
	if (!a || !b) return false;
	if (isDitto(a) && isDitto(b)) return false;
	if (isDitto(a) || isDitto(b)) return true;
	const ga = norm(a.gender), gb = norm(b.gender);
	return ga && gb && ga !== gb;
}

// the egg's species: the non-Ditto mother's base form (or the non-Ditto parent
// when a Ditto is involved)
function eggSpecies(data) {
	const [a, b] = state.slots;
	if (!a || !b) return null;
	let mother = null;
	if (isDitto(a)) mother = b;
	else if (isDitto(b)) mother = a;
	else mother = norm(a.gender) === 'F' ? a : b;
	return baseForm(mother.speciesId, data);
}

export function canDeposit() { return state.slots.some(s => !s); }
export function deposit(mon) {
	const i = state.slots.findIndex(s => !s);
	if (i < 0) return false;
	state.slots[i] = mon;
	save(state);
	return true;
}

// levels a deposited mon has gained since deposit (its exp advanced by steps)
function levelFor(mon) {
	let lvl = mon.level;
	while (lvl < 100 && (mon.exp ?? lvl ** 3) >= (lvl + 1) ** 3) lvl++;
	return lvl;
}
export function withdrawInfo(slot, data) {
	const mon = state.slots[slot];
	if (!mon) return null;
	return { name: mon.name, from: mon.level, to: levelFor(mon), cost: WITHDRAW_BASE + (levelFor(mon) - mon.level) * 100 };
}
// returns the recomputed mon (level/stats applied) or null; caller pays the fee
export function withdraw(slot, data) {
	const mon = state.slots[slot];
	if (!mon) return null;
	const newLvl = levelFor(mon);
	if (newLvl !== mon.level) {
		const sp = data.species[mon.speciesId];
		const dmg = mon.maxHP - mon.curHP;
		mon.level = newLvl;
		mon.stats = statsFor(sp, mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, newLvl, mon);
		mon.maxHP = mon.stats.hp;
		mon.curHP = Math.max(1, mon.maxHP - dmg);
	}
	state.slots[slot] = null;
	save(state);
	return mon;
}

// called once per walked step: accrue EXP to deposits, advance breeding/hatching
export function step(data, onHatch) {
	let dirty = false;
	for (const mon of state.slots) {
		if (mon) { mon.exp = (mon.exp ?? mon.level ** 3) + 1; dirty = true; }
	}
	// egg production while a compatible pair is in
	if (!state.egg && compatible(state.slots[0], state.slots[1])) {
		state.breedSteps++;
		if (state.breedSteps >= EGG_LAY_STEPS) {
			const sp = eggSpecies(data);
			if (sp) { state.egg = { speciesId: sp, hatch: EGG_HATCH_STEPS, ready: false }; state.breedSteps = 0; }
		}
		dirty = true;
	}
	// incubate a laid egg
	if (state.egg && !state.egg.ready) {
		state.egg.hatch--;
		if (state.egg.hatch <= 0) { state.egg.ready = true; onHatch?.(); }
		dirty = true;
	}
	if (dirty) save(state);
}

export function hasReadyEgg() { return !!(state.egg && state.egg.ready); }
export function eggPending() { return !!(state.egg && !state.egg.ready); }
// build the hatched baby (level 5) and clear the egg
export function collectEgg(data) {
	if (!hasReadyEgg()) return null;
	const baby = buildMon(state.egg.speciesId, 5, data);
	state.egg = null;
	save(state);
	if (baby) baby.friend = 120; // hatched mons start friendly
	return baby;
}
