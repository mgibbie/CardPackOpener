// party.js — the player's party, persisted in localStorage.
import { buildMon } from './battle.js';

const KEY = 'magepunk_party_v1';

export function loadParty(data) {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const party = JSON.parse(raw);
			if (Array.isArray(party) && party.length && party[0].stats) return party;
		}
	} catch (e) { /* fall through to starter */ }
	const starter = buildMon('charmander', 10, data);
	const party = [starter];
	saveParty(party);
	return party;
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
