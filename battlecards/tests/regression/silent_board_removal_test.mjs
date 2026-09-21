// silent_board_removal_test.mjs — a creature may never leave the board because a
// replacement could not be built.
//
// Reported: "Mosh'Ogg Enforcer disappears after being played. Reproduced twice.
// Mana was spent and the creature appeared in the engine board list. On the next
// turn it vanished without combat, removal, death, return-to-hand, or a
// corresponding log event."
//
// The card is a plain 2/14 Taunt + Divine Shield with no ongoing effect, so
// nothing in its own definition explains it. Auditing all 33 board-removal sites
// in the engine turned up THREE with the same shape:
//
//     owner.board = owner.board.filter(...)      // always
//     const def = state.cardsById[c.id];
//     if (def) { ...put it back in hand / summon the merge... }   // maybe
//
// The removal is unconditional; the replacement is not. When the def is missing,
// the creature is deleted outright — no graveyard, no event, nothing in its
// place. That is precisely "vanished with no log event".
//
//   merge-if-two      (Blood of the Ancient One) — fires at END OF TURN, which is
//                     why "on the next turn" fits; it deletes TWO creatures.
//   Kodo Hide Whip    — bounce-to-hand after a hero attack.
//   bounce-attacker   — bounce the attacking creature.
//
// This does NOT prove any of them is Mosh'Ogg's cause — its id is in cardsById,
// so it should find a def. It closes a real silent-deletion class, and the
// board-vanish detector added alongside will name the true cause next time.
//
//   node battlecards/tests/regression/silent_board_removal_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

const ME = 0;
function game() {
	const st = E.createGame(byId, seededRng(9), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Foe', power: null }]);
	st.current = ME; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
}

// ---------- source: no site removes before it can replace ----------
{
	const files = ['engine/effects/handlers-summon.js', 'engine/effects/handlers-triggers.js'];
	for (const f of files) {
		const src = fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
		const lines = src.split('\n');
		const offenders = [];
		lines.forEach((l, i) => {
			if (!/\.board\s*=\s*.*\.filter\(/.test(l)) return;
			const after = lines.slice(i + 1, i + 7).join('\n');
			// a bare `if (def)` AFTER the removal is the bug shape
			if (/if \((def|base)\)/.test(after)) offenders.push(`${f}:${i + 1}`);
		});
		ok(`${f} never removes before it can replace`, offenders.length === 0, offenders.join(', '));
	}
}

// ---------- merge-if-two keeps the creatures when the merge target is missing ----------
{
	const st = game();
	const def = { id: '_anc', name: 'Ancient', type: 'creature', cost: 4, attack: 4, health: 4, rarity: 'common' };
	byId._anc = def;
	const a = E.instantiate(def, ME), b = E.instantiate(def, ME);
	a.zone = b.zone = 'board'; st.players[ME].board.push(a, b);
	ok('setup: two copies are on the board', st.players[ME].board.length === 2);
	// the merge target id does NOT exist in cardsById — the condition that deleted them
	E.execEffects(st, ME, [{ type: 'merge-if-two', id: '_missing_token_id' }], null, a);
	const left = st.players[ME].board.filter(c => !E.isDead(c));
	ok('an unbuildable merge leaves BOTH creatures alone', left.length === 2,
		'board: ' + st.players[ME].board.map(c => c.name).join(',') + ` (${left.length} alive)`);
}

// ---------- and a real merge still works ----------
{
	const st = game();
	const def = { id: '_anc2', name: 'Ancient2', type: 'creature', cost: 4, attack: 4, health: 4, rarity: 'common' };
	const big = { id: '_big2', name: 'Huge', type: 'creature', cost: 8, attack: 9, health: 9, rarity: 'common' };
	byId._anc2 = def; byId._big2 = big;
	const a = E.instantiate(def, ME), b = E.instantiate(def, ME);
	a.zone = b.zone = 'board'; st.players[ME].board.push(a, b);
	E.execEffects(st, ME, [{ type: 'merge-if-two', id: '_big2' }], null, a);
	const names = st.players[ME].board.filter(c => !E.isDead(c)).map(c => c.name);
	ok('a buildable merge still merges', names.length === 1 && names[0] === 'Huge', names.join(','));
}

// ---------- the detector exists and is wired ----------
{
	const g = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
	ok('a board-vanish detector exists', /\[board-vanish\]/.test(g));
	ok('it is driven from pump, against the events of that batch', /checkBoardDepartures\(accounted\)/.test(g));
	ok('and its log is readable from the test hook', /get boardVanishLog\(\)/.test(g));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
