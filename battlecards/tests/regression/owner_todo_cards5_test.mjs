// Fifth batch of card changes filed from the wiki's owner inbox (owner_todo),
// applied 2026-09-05.
//
//   Reska, the Relic Wrangler -> line break after "Rush & Trample." before the
//                                "Costs 1 less…" clause (wording/layout only)
//   Avengers Tower (mv_cap_10) -> its {T}{T} tap now also Assembles & Advances
//                                 (was just "Gain 3 Armor")
//
// Behaviour is executed, not inspected — a text-only claim would hide a tap that
// no-ops.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 4, players = 2) => {
	const heroes = Array.from({ length: players }, (_, i) => ({ id: 'mage', name: 'P' + i, power: null }));
	const st = E.createGame(cardsById, seededRng(seed), null, players, heroes);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};

// ---------- Reska, the Relic Wrangler ----------
{
	const c = cardsById.reska_the_relic_wrangler;
	ok('Reska reads with the line break after "Rush & Trample."',
		c.description === 'Rush & Trample.\nCosts 1 less for each creature in your graveyard.\nDeathrattle: Excavate twice & Loot twice.',
		JSON.stringify(c.description));
	// the mechanics are untouched — sanity-check they survived the text edit
	ok('Reska keeps rush/trample/deathrattle + its Deathrattle',
		['rush', 'trample', 'deathrattle'].every(k => (c.keywords || []).includes(k)) && (c.deathrattle || []).length === 3,
		JSON.stringify([c.keywords, c.deathrattle]));
}

// ---------- Avengers Tower ----------
{
	const c = cardsById.mv_cap_10;
	ok('Avengers Tower reads "{T}{T}: Gain 3 Armor, Assemble & Advance."',
		c.description === 'Durability 3. {T}{T}: Gain 3 Armor, Assemble & Advance.', JSON.stringify(c.description));
	const eff = c.taps?.[0]?.effects || [];
	ok('its tap has armor+assemble+advance effects',
		eff.length === 3 && eff[0].type === 'armor' && eff[0].value === 3 && eff[1].type === 'assemble' && eff[2].type === 'advance',
		JSON.stringify(eff));

	// FIRE it: tapping the location gains 3 Armor and queues an Assemble + an Advance
	const st = game();
	const loc = E.instantiate(cardsById.mv_cap_10, 0);
	loc.zone = 'board'; loc.sick = false; loc.tapped = false;
	st.players[0].board.push(loc);
	E.recomputeAuras(st);
	const armorBefore = st.players[0].armor || 0;
	const used = E.tapLand(st, 0, loc.uid, 0, null);
	ok('the tower tap succeeded', used === true, used);
	ok('tapping it gained 3 Armor', (st.players[0].armor || 0) === armorBefore + 3, [armorBefore, st.players[0].armor]);
	const modes = (st.pickQueue || []).map(q => q.mode);
	ok('it queued an Assemble', modes.includes('assemble'), JSON.stringify(modes));
	ok('it queued an Advance', modes.includes('advance'), JSON.stringify(modes));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
