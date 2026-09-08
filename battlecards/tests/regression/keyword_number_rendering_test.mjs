// keyword_number_rendering_test.mjs (2026-09-08)
//
// Owner requests on keyword text rendering:
//  - a keyword's numeric magnitude bolds WITH it: "Medic 1", "Regenerate 3",
//    "Spell Damage +2" (the school prefix already bolds from a prior batch).
//  - Ward's number is a MANA COST, so it renders as a mana pip "(N)" — a circle,
//    not a bold number. Every card that shows "Ward (N)" must actually carry
//    ward:{mana:N} (several were inert: bare-number ward spreads to {}, and two
//    had no ward field at all).
import fs from 'fs';
import { segmentKeywords, richTokens } from '../../keywords.js';

const cards = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url))).cards;
const byId = Object.fromEntries(cards.map(c => [c.id, c]));
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const bold = t => segmentKeywords(t).filter(s => s.bold).map(s => s.text);
const pips = t => richTokens(t).filter(k => k.kind === 'sym').map(k => k.key + ':' + k.label);

// ---------- numeric magnitude bolds with the keyword ----------
ok('Medic 1 bolds the number', bold('Medic 1 & Rush.').includes('Medic 1'), JSON.stringify(bold('Medic 1 & Rush.')));
ok('Regenerate 3 bolds the number', bold('Trample & Regenerate 3.').includes('Regenerate 3'));
ok('Spell Damage +2 bolds the modifier', bold('Spell Damage +2.').includes('Spell Damage +2'));
ok('Fire Spell Damage+2 bolds school + modifier', bold('Fire Spell Damage+2.').includes('Fire Spell Damage+2'));
ok('a bare number after a non-keyword is NOT bolded', !bold('Deal 3 damage.').some(s => /3/.test(s)), JSON.stringify(bold('Deal 3 damage.')));

// ---------- Ward's number is a mana pip, not a bold digit ----------
ok('Ward (2): "Ward" bolds but the digit does not', bold('Rush & Ward (2).').includes('Ward') && !bold('Rush & Ward (2).').some(s => /\d/.test(s)), JSON.stringify(bold('Rush & Ward (2).')));
ok('Ward (2): the 2 renders as a mana pip', pips('Rush & Ward (2).').includes('N:2'), JSON.stringify(pips('Rush & Ward (2).')));

// ---------- every "Ward (N)" card carries a matching ward:{mana:N} ----------
{
	const wardCards = cards.filter(c => /Ward \(\d+\)/.test(c.description || ''));
	ok('there are Ward-pip cards to check', wardCards.length >= 7, wardCards.length);
	const bad = wardCards.filter(c => { const n = +c.description.match(/Ward \((\d+)\)/)[1]; return !c.ward || c.ward.mana !== n; });
	ok('every Ward (N) card has ward:{mana:N}', bad.length === 0, bad.map(c => c.id).join(', '));
	// the ones that were inert before are now real
	for (const id of ['talion_s_throneguard', 'crosis_the_purger', 'lemon_magician_girl', 'roaming_throne', 'scragnoth'])
		ok(`${id} ward is now {mana:N}`, byId[id] && byId[id].ward && typeof byId[id].ward.mana === 'number', JSON.stringify(byId[id]?.ward));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
