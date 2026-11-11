// ai_no_self_lethal_test.mjs — the AI never pays Life / takes self-damage it can't survive.
//
// bug:1793655195054 — Final Fantasy Lorequest: Zenos yae Galvus and Xande each cast
// their Night's Whisper ("Draw two cards; deal 2 damage to your hero") at 2 HP and lost.
// bug:1794010089247 — Middle-earth: Lotho cast Lotho's Feed the Swarm ("Destroy an enemy
// creature. Take 2 damage.") at 2 life and eliminated himself.
// CAUSE: playableCards() only checked legality/targets; step() then played the most
// expensive card. Nothing compared the card's own-hero damage with the AI's life.
// FIX: ai.js selfLethal() — the damage an action deals to its own hero right now
// (own-hero / all-heroes / self-damage, armor soaks it unless it pierces) must stay
// below life, unless the same effects take every opponent's face to 0 first. Applied to
// hand cards, companion/command, hero powers, creature abilities, artifact and land taps.
// Card rules are unchanged: a HUMAN can still cast the spell at 2 life.
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._bear = { id: '_bear', name: 'Bear', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
byId._filler = { id: '_filler', name: 'Filler', type: 'creature', cost: 9, attack: 1, health: 1, rarity: 'common' };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

const AI_SEAT = 1, HUMAN = 0;
function game(life, armor = 0) {
	const st = E.createGame(byId, seededRng(11), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Zenos', power: null }]);
	st.current = AI_SEAT; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_filler', '_filler', '_filler', '_filler']; p.board = []; p.heroPowers = []; p.lands = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	st.players[AI_SEAT].life = life; st.players[AI_SEAT].armor = armor;
	st.players[HUMAN].life = 27;
	return st;
}
function give(st, pi, id) { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; }
function enemyBear(st) { const c = E.instantiate(byId._bear, HUMAN); c.zone = 'board'; c.sick = false; st.players[HUMAN].board.push(c); return c; }
// drive the AI's turn the way maybeRunAI does (stop before the turn flips)
function run(st, ticks = 20) {
	for (let i = 0; i < ticks; i++) {
		if (st.over) return;
		if (st.stack.length && st.priority != null && st.priority !== AI_SEAT) { E.resolveResponse(st, st.priority, 'pass'); continue; }
		if (!AI.step(st, AI_SEAT)) return;
	}
}
const inHand = (st, id) => st.players[AI_SEAT].hand.some(c => c.id === id);

for (const id of ['ff_e_zenos_5', 'ff_e_xande_11']) {
	// at 2 HP: casting is suicide -> hold it
	const st = game(2);
	give(st, AI_SEAT, id);
	run(st);
	ok(`${id} at 2 HP: AI does not cast it`, inHand(st, id) && !st.players[AI_SEAT].eliminated && !st.over, `life=${st.players[AI_SEAT].life} over=${st.over}`);
	// at 1 HP too
	const st1 = game(1);
	give(st1, AI_SEAT, id);
	run(st1);
	ok(`${id} at 1 HP: AI does not cast it`, inHand(st1, id) && !st1.over);
	// at 3 HP it survives -> may draw
	const st3 = game(3);
	give(st3, AI_SEAT, id);
	run(st3);
	ok(`${id} at 3 HP: AI casts it and lives on 1`, !inHand(st3, id) && st3.players[AI_SEAT].life === 1 && !st3.over, `life=${st3.players[AI_SEAT].life}`);
	// armor soaks unpierced self-damage: 2 HP + 1 armor survives
	const sta = game(2, 1);
	give(sta, AI_SEAT, id);
	run(sta);
	ok(`${id} at 2 HP + 1 armor: AI casts it (armor soaks 1)`, !inHand(sta, id) && sta.players[AI_SEAT].life === 1 && !sta.over, `life=${sta.players[AI_SEAT].life}`);
}

// the wubrg Night's Whisper "lose 2 Life" pierces: armor does not save it
{
	const st = game(2, 5);
	give(st, AI_SEAT, 'night_s_whisper');
	run(st);
	ok('Night\'s Whisper (pierce) at 2 HP + 5 armor: AI holds it', inHand(st, 'night_s_whisper') && !st.over);
}

// Lotho's Feed the Swarm at 2 life with a target: hold it
{
	const st = game(2);
	enemyBear(st);
	give(st, AI_SEAT, 'me_lo_feed');
	run(st);
	ok('Feed the Swarm at 2 life: AI does not cast it', inHand(st, 'me_lo_feed') && !st.over && st.players[HUMAN].board.length === 1, `over=${st.over}`);
	const st5 = game(5);
	enemyBear(st5);
	give(st5, AI_SEAT, 'me_lo_feed');
	run(st5);
	ok('Feed the Swarm at 5 life: AI casts it (destroys the Bear, lives on 3)', !inHand(st5, 'me_lo_feed') && st5.players[AI_SEAT].life === 3 && st5.players[HUMAN].board.length === 0, `life=${st5.players[AI_SEAT].life}`);
}

// a winning trade is still allowed: face damage that kills the opponent before the self-hit
{
	const st = game(2);
	st.players[HUMAN].life = 3;
	const eff = [{ type: 'damage', target: 'enemy-heroes', value: 3 }, { type: 'damage', target: 'own-hero', value: 2 }];
	ok('selfLethal: kill-first trade is not self-lethal', AI.selfLethal?.(st, AI_SEAT, eff) === false);
	ok('selfLethal: a mutual all-heroes hit is', AI.selfLethal?.(st, AI_SEAT, [{ type: 'damage', target: 'all-heroes', value: 3 }]) === true);
	ok('selfLethal: Life Tap hero power at 2 HP is', AI.selfLethal?.(st, AI_SEAT, [{ type: 'draw', value: 1 }, { type: 'damage', target: 'own-hero', value: 2 }]) === true);
}

// the card itself is unchanged: a human at 2 life can still cast Night's Whisper and dies
{
	const st = game(27);
	st.current = HUMAN; st.players[HUMAN].life = 2;
	const c = give(st, HUMAN, 'ff_e_zenos_5');
	const played = E.playCard(st, HUMAN, c.uid, null);
	for (let i = 0; i < 6 && st.stack.length && !st.over; i++) E.resolveResponse(st, st.priority ?? AI_SEAT, 'pass');
	ok('a human can still cast it at 2 life (card rules unchanged)', played && (st.players[HUMAN].life <= 0 || st.players[HUMAN].eliminated || st.over), `life=${st.players[HUMAN].life}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
