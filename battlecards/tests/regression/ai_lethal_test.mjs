// ai_lethal_test.mjs — the AI must take a lethal it can actually see.
//
// Reported from production: "AI repeatedly passes with lethal available.
// Elspeth passed four consecutive turns with 28-50+ attack against 14 or less
// life. Nissa and Karn also passed with obvious lethal."
//
// CAUSE. The per-attacker check compared ONE creature's attack to a hero's life:
//     const lethal = heroTs.find(t => state.players[t.player].life <= a.attack);
// A wide board never satisfied it — five 6/6s against a hero on 14 has no single
// lethal attacker. Play fell through to the value logic, and because
// attackTargets offers enemy PLANESWALKERS alongside the hero when no taunt is
// up, `best = walkerTs[0]` sent everything at the planeswalker instead. Every
// Lorequest run has a player planeswalker, which is why all three reports were
// Lorequest characters.
//
// FIX: a lethal sweep over the whole ready board before the value logic, summing
// only the damage that can actually reach each hero (a Taunt-walled attacker has
// no hero target and contributes nothing) and counting armor.
//
//   node battlecards/tests/regression/ai_lethal_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._big = { id: '_big', name: 'Bruiser', type: 'creature', cost: 5, attack: 6, health: 6, rarity: 'common' };
// health 40 on purpose: 5x6 cannot break it this turn. An 8-health wall was the
// first version of this fixture and the AI rightly smashed through it and THEN
// had real lethal — correct play, a wrong expectation.
byId._wall = { id: '_wall', name: 'Wall', type: 'creature', cost: 2, attack: 0, health: 40, rarity: 'common', keywords: ['taunt'] };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

const AI_SEAT = 1, HUMAN = 0;
function game() {
	const st = E.createGame(byId, seededRng(7), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Elspeth', power: null }]);
	st.current = AI_SEAT; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 0, max: 10, bonus: 0 }; }
	return st;
}
// put `n` ready 6/6s on the AI board
function army(st, n) {
	for (let i = 0; i < n; i++) {
		const c = E.instantiate(byId._big, AI_SEAT);
		c.zone = 'board'; c.sick = false; c.attacksUsed = 0;
		st.players[AI_SEAT].board.push(c);
	}
}
// drive the AI the way maybeRunAI does, for a whole turn
function playTurn(st, ticks = 30) {
	for (let i = 0; i < ticks; i++) {
		if (st.over) return;
		const before = st.turnNumber + ':' + st.current;
		if (!AI.step(st, st.current)) { E.endTurn(st); return; }
		if (before !== st.turnNumber + ':' + st.current) return;
	}
}

// ---------- source ----------
{
	const ai = fs.readFileSync(new URL('../../ai.js', import.meta.url), 'utf8');
	ok('the AI carries a whole-board lethal sweep', /LETHAL SWEEP/.test(ai));
	ok('and it counts armor, not just life', /\(d\.life \|\| 0\) \+ \(d\.armor \|\| 0\)/.test(ai));
}

// ---------- the reported shape: wide board, low hero, player planeswalker ----------
{
	const st = game();
	army(st, 5);                                  // 30 attack
	st.players[HUMAN].life = 14;
	// loyalty 60 on purpose: 5x6 cannot kill it, so EVERY attacker is absorbed and
	// nothing reaches the face. A 7-loyalty walker died mid-turn and the leftover
	// attackers found the hero anyway — which is why the first version of this test
	// passed against the unfixed AI. The report was four CONSECUTIVE turns, i.e. a
	// walker that soaks the whole board every turn.
	st.players[HUMAN].planeswalkers.push({ uid: 'pw1', id: 'elspeth', name: 'Gideon', loyalty: 60, abilities: [] });
	ok('setup: no single attacker is lethal on its own', 6 < 14);
	ok('setup: the human has a planeswalker to distract the AI', st.players[HUMAN].planeswalkers.length === 1);
	playTurn(st);
	ok('the AI kills through the planeswalker distraction',
		st.over || st.players[HUMAN].life <= 0,
		`life ${st.players[HUMAN].life}, walker loyalty ${st.players[HUMAN].planeswalkers[0]?.loyalty}, over=${st.over}`);
}

// ---------- armor must be counted, or the AI "wins" into a survivor ----------
{
	const st = game();
	army(st, 3);                                  // 18 attack
	st.players[HUMAN].life = 14; st.players[HUMAN].armor = 10;   // 24 effective: NOT lethal
	playTurn(st);
	ok('a board short of lethal through armor does not pretend otherwise',
		!st.over && (st.players[HUMAN].life > 0 || st.players[HUMAN].armor > 0),
		`life ${st.players[HUMAN].life} armor ${st.players[HUMAN].armor} over=${st.over}`);
}
{
	const st = game();
	army(st, 5);                                  // 30 attack
	st.players[HUMAN].life = 14; st.players[HUMAN].armor = 10;   // 24 effective: lethal
	playTurn(st);
	ok('a board that IS lethal through armor takes it',
		st.over || st.players[HUMAN].life <= 0,
		`life ${st.players[HUMAN].life} armor ${st.players[HUMAN].armor} over=${st.over}`);
}

// ---------- a Taunt wall means those attackers cannot reach: no false lethal ----------
{
	const st = game();
	army(st, 5);
	st.players[HUMAN].life = 14;
	const w = E.instantiate(byId._wall, HUMAN); w.zone = 'board'; st.players[HUMAN].board.push(w);
	playTurn(st);
	ok('an unbreakable Taunt wall is not mistaken for lethal', !st.over && st.players[HUMAN].life > 0,
		`life ${st.players[HUMAN].life} over=${st.over}`);
}

// ---------- and the ordinary single-attacker lethal still works ----------
{
	const st = game();
	army(st, 1);
	st.players[HUMAN].life = 5;
	playTurn(st);
	ok('a single lethal attacker still goes face', st.over || st.players[HUMAN].life <= 0,
		`life ${st.players[HUMAN].life} over=${st.over}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
