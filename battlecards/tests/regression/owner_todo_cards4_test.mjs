// Owner inbox: "Ambush Viper — give it Rush as well" (2026-08-31).
//
// A one-keyword change, but keywords are only real if the engine acts on them,
// so this plays the card and checks what it can actually do the turn it lands:
// Rush lets it hit a creature immediately, and NOT the face (that is Charge).
// Deathtouch has to survive the edit too.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 2) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2,
		[{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};

// ---------- card data ----------
{
	const c = cardsById.ambush_viper;
	ok('Ambush Viper has Deathtouch and Rush',
		(c.keywords || []).includes('deathtouch') && (c.keywords || []).includes('rush'), JSON.stringify(c.keywords));
	// the ampersand form: a minority house style (11 keyword-only cards use it,
	// e.g. 'Taunt & Divine Shield.') that the owner picked for this card
	ok('reads "Deathtouch & Rush."', c.description === 'Deathtouch & Rush.', c.description);
	ok('keyword order mirrors the text (house form)',
		JSON.stringify(c.keywords) === JSON.stringify(['deathtouch', 'rush']), JSON.stringify(c.keywords));
	ok('the rest of the card is unchanged',
		c.cost === 3 && c.attack === 2 && c.health === 1 && c.tribe === 'Beast',
		JSON.stringify([c.cost, c.attack, c.health, c.tribe]));
}

// ---------- what Rush actually buys it ----------
{
	const st = game();
	const wall = E.instantiate({ id: 't_wall', name: 'Wall', type: 'creature', cost: 3, attack: 1, health: 8 }, 1);
	wall.zone = 'board'; st.players[1].board.push(wall);

	const viper = E.instantiate(cardsById.ambush_viper, 0);
	viper.zone = 'hand'; st.players[0].hand.push(viper);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, viper.uid, null, null, 0);
	const onBoard = st.players[0].board.find(c => c.id === 'ambush_viper');
	ok('it resolved onto the board', !!onBoard);
	ok('and is summoning-sick, as any creature is', onBoard.sick === true, String(onBoard.sick));

	ok('Rush lets it attack the turn it lands', E.canAttackWith(st, 0, onBoard) === true);
	const targets = E.attackTargets(st, 0, onBoard);
	ok('the enemy creature is a legal attack', targets.some(t => t.uid === wall.uid),
		targets.map(t => t.type).join(','));
	ok('but NOT the enemy hero — Rush is not Charge',
		!targets.some(t => t.type === 'hero'), targets.map(t => t.type).join(','));

	// Deathtouch: 2 attack into an 8-health wall still kills it
	E.attack(st, 0, onBoard.uid, { type: 'creature', uid: wall.uid, player: 1 });
	E.sweepDeaths(st);
	ok('Deathtouch still kills whatever it hits',
		!st.players[1].board.some(c => c.uid === wall.uid),
		st.players[1].board.map(c => `${c.name} ${c.maxHealth - c.damage}hp`).join(','));
}

// ---------- a creature with neither keyword still can't attack ----------
// guards the assertion above: it passes because of Rush, not because the engine
// lets everything attack immediately
{
	const st = game();
	const plain = E.instantiate({ id: 't_plain', name: 'Plain', type: 'creature', cost: 2, attack: 2, health: 2 }, 0);
	plain.zone = 'hand'; st.players[0].hand.push(plain);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, plain.uid, null, null, 0);
	const p = st.players[0].board.find(c => c.id === 't_plain');
	ok('a plain creature cannot attack the turn it lands', E.canAttackWith(st, 0, p) === false);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
