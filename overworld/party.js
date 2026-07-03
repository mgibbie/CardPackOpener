// party.js — the player's party, persisted in localStorage.
import { buildMon } from './battle.js';

const KEY = 'magepunk_party_v1';
const BOX_KEY = 'magepunk_box_v1';

function migrate(mon) {
	// older saves predate ivs/exp
	if (!mon.ivs) {
		const iv = () => Math.floor(Math.random() * 32);
		mon.ivs = { hp: iv(), atk: iv(), def: iv(), spa: iv(), spd: iv(), spe: iv() };
	}
	if (mon.exp == null) mon.exp = mon.level ** 3;
	return mon;
}

export function loadParty(data) {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const party = JSON.parse(raw);
			if (Array.isArray(party) && party.length && party[0].stats) return party.map(migrate);
		}
	} catch (e) { /* fall through to starter */ }
	const starter = buildMon('charmander', 10, data);
	const party = [starter];
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
	try {
		const box = JSON.parse(localStorage.getItem(BOX_KEY) || '[]');
		box.push(mon);
		localStorage.setItem(BOX_KEY, JSON.stringify(box));
	} catch (e) { /* private mode */ }
	return 'box';
}

export function saveParty(party) {
	try { localStorage.setItem(KEY, JSON.stringify(party)); } catch (e) { /* private mode */ }
}

export function healParty(party) {
	for (const m of party) {
		m.curHP = m.maxHP;
		for (const mv of m.moves) mv.pp = mv.maxPp;
	}
	saveParty(party);
}

export function leadMon(party) {
	return party.find(m => m.curHP > 0) || null;
}
