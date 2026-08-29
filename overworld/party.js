// party.js — the player's party, persisted in localStorage.
import { buildMon } from './battle.js';
import { safeLoad, safeSave } from './safestore.js';

const KEY = 'magepunk_party_v1';
const BOX_KEY = 'magepunk_box_v1';

function migrate(mon, data) {
	// older saves predate ivs/exp/gender/ability
	if (!mon.ivs) {
		const iv = () => Math.floor(Math.random() * 32);
		mon.ivs = { hp: iv(), atk: iv(), def: iv(), spa: iv(), spd: iv(), spe: iv() };
	}
	if (mon.exp == null) mon.exp = mon.level ** 3;
	if (mon.gender === undefined) mon.gender = Math.random() < 0.5 ? 'M' : 'F'; // null = genderless, keep it
	if (!mon.nature) { // natures/EVs postdate older saves
		const n = ['hardy', 'lonely', 'brave', 'adamant', 'naughty', 'bold', 'docile', 'relaxed', 'impish', 'lax',
			'timid', 'hasty', 'serious', 'jolly', 'naive', 'modest', 'mild', 'quiet', 'bashful', 'rash',
			'calm', 'gentle', 'sassy', 'careful', 'quirky'];
		mon.nature = n[Math.floor(Math.random() * n.length)];
	}
	if (!mon.evs) mon.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
	if (!mon.ability) {
		const opts = data?.abilities?.[mon.speciesId];
		if (opts?.length) mon.ability = opts[Math.floor(Math.random() * opts.length)];
	}
	return mon;
}

// returns the saved party, or null on a fresh save (main shows the starter picker)
export function loadParty(data) {
	const party = safeLoad(KEY, null);
	if (Array.isArray(party) && party.length && party[0] && party[0].stats) return party.map(m => migrate(m, data));
	return null;
}

export function createStarter(speciesId, data) {
	const party = [buildMon(speciesId, 5, data)];
	saveParty(party);
	return party;
}

// caught mon joins the party if there's room, else goes to the box
export function addCaught(party, mon) {
	mon.curHP = Math.max(1, mon.curHP);
	if (party.length < 6) {
		party.push(mon);
		saveParty(party);
		return 'party';
	}
	const box = safeLoad(BOX_KEY, []);
	const arr = Array.isArray(box) ? box : [];
	arr.push(mon);
	safeSave(BOX_KEY, arr);
	return 'box';
}

export function saveParty(party) {
	safeSave(KEY, party);
}

export function healParty(party) {
	for (const m of party) {
		m.curHP = m.maxHP;
		m.status = null;
		for (const mv of m.moves) mv.pp = mv.maxPp;
	}
	saveParty(party);
}

export function leadMon(party) {
	return party.find(m => m.curHP > 0) || null;
}
