// allowed_basics_test.mjs — color-locked basics for run modes (Lorequest).
// player.allowedBasics pins a player to its character's color identity:
// availableLands filters the land shop AND the AI's buy list, buyLand refuses
// off-color ids outright, and the restriction survives a snapshot round-trip.
// Also checks the Lorequest derivation against the real deck data — the two
// canonical cases: Karn (colorless) -> Wastes only, Chandra (R) -> Mountain+Wastes.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { toSnapshot, fromSnapshot } from '../../engine/serialize.js';
import * as Lorequest from '../../lorequest.js';
import * as Duels from '../../duels.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const ids = defs => defs.map(d => d.id).sort().join(',');

// --- Lorequest identity derivation (the user's two canonical examples) ---
{
	ok('Karn (colorless) gets only Wastes', Lorequest.allowedBasics(byId, 'Karn').sort().join(',') === 'wastes');
	ok('Chandra (R) gets Mountain + Wastes', Lorequest.allowedBasics(byId, 'Chandra').sort().join(',') === 'mountain,wastes');
	ok('Nicol Bolas (UBR) gets his three + Wastes',
		Lorequest.allowedBasics(byId, 'Nicol Bolas').sort().join(',') === 'island,mountain,swamp,wastes');
	// every one of the 37 characters derives a sane list (wastes always present)
	const all = [...Lorequest.PLANESWALKERS, ...Lorequest.BOSSES];
	ok('all 37 characters include Wastes and only real basics', all.every(ch => {
		const b = Lorequest.allowedBasics(byId, ch);
		return b.includes('wastes') && b.every(id => ['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes'].includes(id));
	}));
}

// --- the sibling modes (colors backfilled from Scryfall color_identity) ---
{
	const basics = (tag, ch) => Duels.allowedBasicsFor(byId, tag, ch).sort().join(',');
	ok('ME: Gimli (mono-R) gets Mountain + Wastes', basics('meDeck', 'Gimli') === 'mountain,wastes');
	ok('SC: Jaheira (mono-G) gets Forest + Wastes', basics('scDeck', 'Jaheira') === 'forest,wastes');
	ok('FF: Sephiroth (mono-B) gets Swamp + Wastes', basics('ffDeck', 'Sephiroth, One-Winged Angel') === 'swamp,wastes');
	ok('MV: Captain America (mono-W) gets Plains + Wastes', basics('mvDeck', 'Captain America') === 'plains,wastes');
	// every character in every sibling mode has a REAL color identity — no one
	// collapsed to wastes-only from a failed Scryfall backfill
	const VALID = ['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes'];
	for (const tag of ['meDeck', 'scDeck', 'ffDeck', 'mvDeck']) {
		const chars = [...new Set(Object.values(byId).filter(d => d[tag]).map(d => d[tag]))];
		ok(`${tag}: all ${chars.length} characters derive colored, valid identities`, chars.every(ch => {
			const b = Duels.allowedBasicsFor(byId, tag, ch);
			return b.length >= 2 && b.includes('wastes') && b.every(id => VALID.includes(id));
		}));
	}
}

// --- engine enforcement ---
{
	const state = E.createGame(byId, seededRng(7), null, 2);
	ok('unrestricted: all six basics offered', E.availableLands(state, 0).length === 6);

	state.players[0].allowedBasics = ['mountain', 'wastes']; // Chandra's lock
	ok('restricted: only the allowed basics offered', ids(E.availableLands(state, 0)) === 'mountain,wastes');
	ok('the other player is unaffected', E.availableLands(state, 1).length === 6);

	state.players[0].mana.cur = 10;
	ok('buyLand refuses an off-color basic', E.buyLand(state, 0, 'forest') === false);
	ok('buyLand allows an on-color basic', E.buyLand(state, 0, 'mountain') === true);
	ok('the bought land landed', state.players[0].lands.some(l => l.id === 'mountain'));

	// the lock rides the player through a snapshot round-trip (mid-run resume)
	const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state))), byId);
	ok('allowedBasics survives snapshot -> resume', ids(E.availableLands(back, 0)) === 'mountain,wastes');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
