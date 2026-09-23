// ugluk_door_test.mjs — Uglúk's Door of Destinies buffs the creature that
// arrived, not the entire board.
//
// Reported: "Ugluk is broken with his card that gives all creatures plus 1 plus
// 1 when a creature enters. It was triggering twice too."
//
// THE ENGINE WAS CORRECT. `creature-played` fires exactly once per creature you
// play, and tokens summoned by a Battlecry correctly do NOT count as played —
// both verified before changing anything. The "twice" is middleearth.js:136:
// enemy decks are built as TWO copies of each of their 15 cards, so both Doors
// are on the field and every creature played pumped the board twice.
//
// What was actually wrong was the card. Across all 21 enemy commanders, exactly
// one other deck carries a board-wide stacking anthem and every one of them
// carries only ONE. Uglúk carried three axes:
//   - Door of Destinies x2   +1/+1 to the whole board per creature played
//   - Fires of Mount Doom x2 +1/+0 to the whole board per attack
//   - "Whip Them On" (2)     +1/+0 to the whole board, repeatable every turn
// and he is a rung-B Lieutenant, fought at 3-6 wins, not a final boss. Playing a
// creature is the most common action in the game, so the Door was the quadratic
// term: it is the one that came down.
//
// He KEEPS the anthem hero power and Fires — that is his identity, and he is
// still the only enemy of the 21 with an anthem hero power.
//
//   node battlecards/tests/regression/ugluk_door_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._g = { id: '_g', name: 'Grunt', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

const ME = 0;
function game() {
	const st = E.createGame(byId, seededRng(11), null, 2,
		[{ id: 'warrior', name: 'You', power: null }, { id: 'warrior', name: 'Foe', power: null }]);
	st.current = ME; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
}
const onBoard = (st, id) => { const c = E.instantiate(byId[id], ME); c.zone = 'board'; c.sick = false; st.players[ME].board.push(c); return c; };
const play = (st, id) => { const c = E.instantiate(byId[id], ME); st.players[ME].hand.push(c); E.playCard(st, ME, c.uid, null, null); return c; };
const stats = c => `${c.attack}/${c.maxHealth}`;

// ---------- the card says what it does ----------
{
	const def = byId.me_ug_art;
	ok('the Door exists', !!def);
	ok('its text promises the creature, not the board',
		/give it \+1\/\+1/i.test(def.description || ''), def && def.description);
	ok('and no longer promises the board', !/your creatures/i.test(def.description || ''), def && def.description);
}

// ---------- ONE Door: only the arrival grows ----------
{
	const st = game();
	const bystander = onBoard(st, '_g');
	play(st, 'me_ug_art');
	const fresh = play(st, '_g');
	ok('the creature that arrived got +1/+1', stats(fresh) === '2/2', stats(fresh));
	ok('the creature already on board did NOT', stats(bystander) === '1/1', stats(bystander));
}

// ---------- TWO Doors, the way the deck actually ships ----------
{
	const st = game();
	const bystander = onBoard(st, '_g');
	play(st, 'me_ug_art'); play(st, 'me_ug_art');
	ok('the deck really does run two', st.players[ME].artifacts.filter(a => a.id === 'me_ug_art').length === 2);
	const fresh = play(st, '_g');
	ok('two Doors stack on the arrival (+2/+2)', stats(fresh) === '3/3', stats(fresh));
	ok('the board still does not snowball', stats(bystander) === '1/1', stats(bystander));
	// the old card turned a 1/1 bystander into a 3/3 off ONE creature played, and
	// kept compounding every play after that
	const second = play(st, '_g');
	ok('a second play does not re-buff the first', stats(fresh) === '3/3', stats(fresh));
	ok('it buffs only itself', stats(second) === '3/3', stats(second));
}

// ---------- tokens are summoned, not played (unchanged, and asserted so it stays that way) ----------
{
	const st = game();
	play(st, 'me_ug_art');
	// Siege-Gang Commander: "Battlecry: Summon two 1/1 Uruk Grunts."
	play(st, 'me_ug_siegegang');
	const toks = st.players[ME].board.filter(c => c.name === 'Uruk Grunt');
	ok('its Battlecry tokens arrived', toks.length === 2, 'got ' + toks.length);
	ok('and they did NOT each count as a creature played', toks.every(t => stats(t) === '1/1'),
		toks.map(stats).join(','));
}

// ---------- the invariant across every enemy commander ----------
{
	const wide = {};
	for (const c of raw.cards) {
		if (c.meSide !== 'enemy' || c.token) continue;
		for (const trig of [].concat(c.ongoing || [], c.ongoings || [])) {
			for (const e of (trig.effects || [])) {
				if (e.type === 'buff' && /friendly-creatures/.test(e.target || '')) (wide[c.meDeck] = wide[c.meDeck] || []).push(c.name);
			}
		}
	}
	const over = Object.entries(wide).filter(([, v]) => v.length > 1);
	ok('no enemy deck carries more than one board-wide stacking anthem',
		over.length === 0, over.map(([d, v]) => `${d}: ${v.join(' + ')}`).join(' | '));
	ok('Uglúk keeps exactly one (Fires of Mount Doom)',
		(wide['Uglúk'] || []).length === 1, JSON.stringify(wide['Uglúk'] || []));
	// The Great Goblin runs his own weaker Door (+1/+0) and only that one anthem,
	// so he was never the outlier and must not be collateral damage. No `||`
	// fallback here: a missing card has to fail, not pass by default.
	const gg = byId.me_gg_art;
	ok("The Great Goblin's own Door still exists", !!gg);
	ok('...and still reads board-wide, untouched',
		!!gg && /your creatures/i.test(gg.description || ''), gg && gg.description);
	ok('...and is the weaker +1/+0 version', !!gg && /\+1\/\+0/.test(gg.description || ''), gg && gg.description);
}

// ---------- it still plays without throwing, in a real game loop ----------
{
	const st = game();
	let threw = null;
	try {
		play(st, 'me_ug_art');
		for (let i = 0; i < 6; i++) play(st, '_g');
		E.endTurn(st, ME);
	} catch (e) { threw = e.message; }
	ok('six creatures and an end of turn, no throw', threw === null, threw);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
