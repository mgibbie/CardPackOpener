// Fourteenth batch from the wiki's owner inbox (owner_todo), applied 2026-09-08.
// All three are Forest pool cards gaining green-pie triggered abilities.
//
//   Brushstrider        -> add "Coven: Chromatic" (conditional keyword grant).
//   Garruk's Companion  -> add "Inspire: Gain +1/+1".
//   Bassara Tower Archer-> add "Spellburst: Draw two cards".
//
// "Coven: Chromatic" is the first card to use the `while:'coven'` condKeyword
// path (implemented in auras.js but previously unused). All three are FIRED:
//   - Coven:     Chromatic is granted only while 3+ distinct Attack values stand.
//   - Inspire:   a hero-power-used event grows the Companion +1/+1.
//   - Spellburst: the first spell-played draws two (and only the first).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 23) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = ['x', 'y', 'z']; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const put = (st, pi, atk, hp, inst) => { const c = inst || E.instantiate({ id: 'd' + atk + hp, name: 'D', type: 'creature', cost: 1, attack: atk, health: hp }, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };

// ---------- Brushstrider: Coven: Chromatic ----------
{
	const c = cardsById.brushstrider;
	ok('Brushstrider reads "Rush.\\nCoven: Chromatic."', c.description === 'Rush.\nCoven: Chromatic.', JSON.stringify(c.description));
	ok('condKeyword grants Chromatic while Coven', c.condKeyword?.keyword === 'chromatic' && c.condKeyword?.while === 'coven', JSON.stringify(c.condKeyword));

	const st = game();
	const brush = put(st, 0, 3, 1, E.instantiate(c, 0)); // attack 3
	const a = put(st, 0, 1, 1); // attack 1
	const b = put(st, 0, 2, 2); // attack 2  -> {3,1,2} = 3 distinct -> Coven ON
	E.recomputeAuras(st);
	ok('Coven ON (3 distinct Attacks): Brushstrider has Chromatic', brush.keywords.includes('chromatic'), JSON.stringify(brush.keywords));
	// drop to 2 distinct Attacks -> Coven OFF -> Chromatic retracts
	st.players[0].board = st.players[0].board.filter(x => x !== b);
	E.recomputeAuras(st);
	ok('Coven OFF (2 distinct Attacks): Chromatic retracted', !brush.keywords.includes('chromatic'), JSON.stringify(brush.keywords));
	ok('Rush is never lost (native keyword)', brush.keywords.includes('rush'), JSON.stringify(brush.keywords));
}

// ---------- Garruk's Companion: Inspire: Gain +1/+1 ----------
{
	const c = cardsById.garruk_s_companion;
	ok('Garruk\'s Companion reads "Trample.\\nInspire: Gain +1/+1."', c.description === 'Trample.\nInspire: Gain +1/+1.', JSON.stringify(c.description));
	ok('ongoing fires on hero-power-used -> buff-self +1/+1',
		c.ongoing?.on === 'hero-power-used' && c.ongoing?.effects?.[0]?.type === 'buff-self'
		&& c.ongoing.effects[0].attack === 1 && c.ongoing.effects[0].health === 1, JSON.stringify(c.ongoing));

	const st = game();
	const comp = put(st, 0, 3, 2, E.instantiate(c, 0)); // base 3/2
	E.fireOngoing(st, 0, 'hero-power-used', {});
	ok('Inspire grew the Companion to 4/3', comp.attack === 4 && comp.maxHealth === 3, [comp.attack, comp.maxHealth]);
}

// ---------- Bassara Tower Archer: Spellburst: Draw two cards ----------
{
	const c = cardsById.bassara_tower_archer;
	ok('Bassara Tower Archer reads "Hexproof.\\nSpellburst: Draw two cards."', c.description === 'Hexproof.\nSpellburst: Draw two cards.', JSON.stringify(c.description));
	ok('ongoing fires once on spell-played -> draw 2',
		c.ongoing?.on === 'spell-played' && c.ongoing?.once === true && c.ongoing?.effects?.[0]?.type === 'draw' && c.ongoing.effects[0].value === 2, JSON.stringify(c.ongoing));

	const st = game();
	st.players[0].deck = ['tomb_spider', 'harvest_golem', 'loot_hoarder']; // real ids so draw can instantiate
	put(st, 0, 2, 1, E.instantiate(c, 0));
	const handBefore = st.players[0].hand.length, deckBefore = st.players[0].deck.length; // 0 / 3
	E.fireOngoing(st, 0, 'spell-played', {});
	ok('Spellburst drew two cards', st.players[0].hand.length === handBefore + 2 && st.players[0].deck.length === deckBefore - 2,
		JSON.stringify([st.players[0].hand.length, st.players[0].deck.length]));
	// once:true -> a second spell does NOT draw again
	const handMid = st.players[0].hand.length;
	E.fireOngoing(st, 0, 'spell-played', {});
	ok('Spellburst is once-only (second spell draws nothing)', st.players[0].hand.length === handMid, [handMid, st.players[0].hand.length]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
