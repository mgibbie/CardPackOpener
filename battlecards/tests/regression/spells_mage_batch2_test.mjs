// Mage spell-import batch 2 — behavioral checks (Secret, portals, deathrattle-grant).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_min = { id: 't_min', name: 'M', type: 'creature', cost: 3, attack: 3, health: 3 };
cardsById.t_sec = { id: 't_sec', name: 'Sec', type: 'secret', cost: 3, cardClass: 'mage', tribe: 'Secret', secret: { trigger: 'enemy-attack', effects: [] } };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'mage'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const enemy = (st, atk = 3, hp = 5) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 1, attack: atk, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const friendly = (st, atk = 3, hp = 4) => { const m = E.instantiate({ id: 'f', name: 'F', type: 'creature', cost: 2, attack: atk, health: hp }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, target, null, 0); };

for (const id of ['hidden_objects', 'leyline_nexus', 'unstable_portal', 'volcanomancy', 'build_a_snowman', 'build_a_snowbrute', 'flame_ward', 'story_of_the_waygate', 'primordial_glyph']) ok(`${id} present`, cardsById[id], id);

// Leyline Nexus: draw a card that costs (2) less
{
	const st = game(); st.players[0].deck = ['t_min'];
	cast(st, 'leyline_nexus');
	const drawn = st.players[0].hand.find(c => c.id === 't_min');
	ok('Leyline Nexus drew a card costing 2 less (3 -> 1)', drawn && drawn.cost === 1, drawn && drawn.cost);
}

// Unstable Portal: add a random minion costing (3) less
{
	const st = game();
	cast(st, 'unstable_portal');
	const added = st.players[0].hand[st.players[0].hand.length - 1];
	ok('Unstable Portal added a minion', added && cardsById[added.id].type === 'creature', added && added.id);
	ok('the added minion costs 3 less than base', added && added.cost === Math.max(0, (cardsById[added.id].cost || 0) - 3), added && [cardsById[added.id]?.cost, added.cost]);
}

// Volcanomancy: grant a minion a Deathrattle (3 to all other minions when it dies)
{
	const st = game();
	const mine = friendly(st, 3, 3);
	const otherMine = friendly(st, 2, 5);
	const foe = enemy(st, 0, 5);
	cast(st, 'volcanomancy', { type: 'creature', uid: mine.uid, player: 0 });
	ok('Volcanomancy granted a Deathrattle', (mine.deathrattle || []).length > 0 && mine.keywords.includes('deathrattle'), mine.deathrattle);
	// kill it -> 3 to all OTHER minions
	mine.damage = mine.maxHealth; E.sweepDeaths(st);
	ok('on death: 3 to all other minions', otherMine.damage === 3 && foe.damage === 3, [otherMine.damage, foe.damage]);
}

// Build a Snowman: 3/3 Snowman (Freezes) + adds Build a Snowbrute
{
	const st = game();
	cast(st, 'build_a_snowman');
	ok('Build a Snowman: a 3/3 Snowman on board', st.players[0].board.some(c => c.name === 'Snowman' && c.attack === 3), st.players[0].board.map(c => c.name));
	ok('Build a Snowman: Snowbrute added to hand', st.players[0].hand.some(c => c.id === 'build_a_snowbrute'), st.players[0].hand.map(c => c.id));
}

// Flame Ward (Secret): after a minion attacks your hero, 3 to all enemy minions
{
	const st = game();
	cast(st, 'flame_ward');
	ok('Flame Ward is an active Secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
	// enemy minion attacks my hero -> secret fires
	st.current = 1;
	const attacker = enemy(st, 4, 5);
	const other = enemy(st, 2, 5);
	E.attack(st, 1, attacker.uid, { type: 'hero', player: 0 });
	ok('Flame Ward fired: 3 to all enemy minions', attacker.damage >= 3 && other.damage === 3, [attacker.damage, other.damage]);
	ok('Flame Ward left play after triggering', st.players[0].secrets.length === 0, st.players[0].secrets.length);
}

// Story of the Waygate: reduce cost of foreign (didn't-start-in-deck) hand cards by 1
{
	const st = game();
	const foreign = E.instantiate(cardsById.t_min, 0); foreign.zone = 'hand'; foreign.fromDeck = false; st.players[0].hand.push(foreign);
	cast(st, 'story_of_the_waygate');
	ok('Story of the Waygate discounted a foreign card (3 -> 2)', E.effectiveCost(st, 0, foreign) === 2, E.effectiveCost(st, 0, foreign));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
