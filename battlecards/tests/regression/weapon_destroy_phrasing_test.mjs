// weapon_destroy_phrasing_test.mjs (2026-09-08)
//
// Owner ruling: every card that DESTROYS a weapon phrases it like Axebane Beast
// — "Destroy target Hero Weapon." (the term is "Hero Weapon", not "opponent's
// weapon"). Guards the convention so new destroy-weapon cards stay consistent.
// (Cards that destroy your OWN weapon — effect `own:true` — are a different
// action and are exempt; degrade/steal effects aren't "destroy" and aren't
// checked.)
import fs from 'fs';

const cards = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url))).cards;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

// find a destroy-weapon effect anywhere in a card's effect trees
const findDW = (c) => {
	let found = null;
	const walk = x => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x.type === 'destroy-weapon') found = x; for (const k in x) walk(x[k]); } };
	walk({ effects: c.effects, battlecry: c.battlecry, ongoing: c.ongoing, ongoings: c.ongoings, deathrattle: c.deathrattle, taps: c.taps, activated: c.activated });
	return found;
};

const targetDestroyers = cards.filter(c => { const e = findDW(c); return e && !e.own; });
ok('there are destroy-target-weapon cards to check', targetDestroyers.length >= 7, targetDestroyers.length);

const wrong = targetDestroyers.filter(c => !/Destroy target Hero Weapon/.test(c.description || '') || /opponent.?s weapon/i.test(c.description || ''));
ok('every destroy-target-weapon card reads "Destroy target Hero Weapon"', wrong.length === 0, wrong.map(c => c.id + ': ' + JSON.stringify(c.description)));

// spot-anchor: Axebane Beast (the model) and Axebane Stag (the one that drifted)
const byId = Object.fromEntries(cards.map(c => [c.id, c]));
ok('Axebane Beast is the canonical phrasing', /Battlecry: Destroy target Hero Weapon\./.test(byId.axebane_beast.description));
ok('Axebane Stag matches Axebane Beast phrasing', /Battlecry: Destroy target Hero Weapon\./.test(byId.axebane_stag.description));

// no card should carry the retired "opponent's weapon" wording for a DESTROY
ok('no destroy-weapon card still says "opponent\'s weapon"', !targetDestroyers.some(c => /opponent.?s weapon/i.test(c.description || '')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
