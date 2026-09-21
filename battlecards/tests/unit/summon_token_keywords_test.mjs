// summon_token_keywords_test.mjs — a summoned token must actually HAVE the
// keywords its card text promises.
//
// The Hearthstone importer parsed "Create three 3/1 Undead creature tokens with
// Lifesteal" by taking everything after the stats as the token's NAME. The result
// was a vanilla body called "Undead with Lifesteal that attack it" — the word
// Lifesteal appeared on screen, and the token did not have it. 17 cards shipped
// this way (Taunt, Divine Shield, Rush, Reborn, Poisonous, Elusive, Lifesteal,
// Charge), which is a quiet source of "combat doesn't match what the card says":
// a token that should Taunt does not block, one that should have Divine Shield
// eats the first hit.
//
// Reported from production as part of "asymmetric or phantom combat" and
// "displayed stats and keyword badges become stale".
//
//   node battlecards/tests/unit/summon_token_keywords_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const KNOWN = new Set(Object.values(E.KW));

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

// every summon effect anywhere in a card definition
function summons(card) {
	const out = [];
	const walk = list => {
		for (const e of (list || [])) {
			if (e && e.type === 'summon') out.push(e);
			for (const k of ['then', 'else', 'effects']) if (e && Array.isArray(e[k])) walk(e[k]);
		}
	};
	walk(card.effects);
	if (card.ongoing) walk(card.ongoing.effects);
	if (card.deathrattle) walk(card.deathrattle);
	return out;
}

const offenders = [];
for (const card of raw.cards) {
	for (const e of summons(card)) {
		if (typeof e.name !== 'string') continue;
		const m = e.name.match(/^(.*?) with (.+)$/i);
		if (!m) continue;
		// does the clause after "with" name keywords the engine actually knows?
		const parts = m[2].split(/,| and /i)
			.map(s => s.trim().toLowerCase().replace(/[^a-z ]/g, '').replace(/ +/g, '_'))
			.filter(Boolean);
		if (!parts.length || !parts.every(k => KNOWN.has(k))) continue;   // prose, not keywords — left alone on purpose
		const have = (e.keywords || []).map(String);
		const missing = parts.filter(k => !have.includes(k));
		if (missing.length) offenders.push(`${card.id}: token "${e.name}" promises ${missing.join('+')} but keywords=${JSON.stringify(e.keywords || null)}`);
	}
}
ok('no summoned token names a keyword it does not have', offenders.length === 0,
	'\n    ' + offenders.slice(0, 12).join('\n    '));

// the specific cards repaired, spot-checked so a bad re-import is loud
const expect = {
	emergency_surgery: ['lifesteal'],
	giggling_inventor: ['taunt', 'divine_shield'],
	imported_tarantula: ['poisonous', 'rush'],
	libram_of_hope: ['taunt', 'divine_shield'],
	blood_in_the_water: ['rush'],
	dreadhound_handler: ['reborn'],
};
for (const [id, kws] of Object.entries(expect)) {
	const card = raw.cards.find(c => c.id === id);
	ok(id + ' exists', !!card);
	if (!card) continue;
	const tok = summons(card)[0];
	ok(id + ' summons a token', !!tok);
	if (!tok) continue;
	for (const k of kws) ok(`${id}'s token has ${k}`, (tok.keywords || []).includes(k), JSON.stringify(tok));
	ok(id + "'s token name is not a description fragment", !/ with /i.test(tok.name || ''), tok.name);
}

// and every keyword we do set must be one the engine understands
const unknown = [];
for (const card of raw.cards) for (const e of summons(card)) for (const k of (e.keywords || []))
	if (!KNOWN.has(k)) unknown.push(`${card.id}: ${k}`);
ok('every summoned-token keyword is one the engine knows', unknown.length === 0, unknown.slice(0, 8).join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
