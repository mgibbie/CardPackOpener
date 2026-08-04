// Wave 39 (locations): Zuramat's Prison — discard a card to summon a 5/5 Taunt;
// Deathrattle frees Zuramat the Obliterator, who replays discarded cards at end of turn.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.z_minion = { id: 'z_minion', name: 'Grunt', type: 'creature', cost: 3, attack: 3, health: 3 };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 5) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'mage'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const addHand = (st, id) => { const m = E.instantiate(cardsById[id], 0); m.zone = 'hand'; st.players[0].hand.push(m); return m; };

for (const id of ['zuramats_prison', 'zuramat_obliterator']) ok(`${id} exists`, cardsById[id], id);

// Tap: discard a card (remembered) and summon a 5/5 Taunt
{
	const st = game();
	addHand(st, 'z_minion');
	const loc = placeLoc(st, 'zuramats_prison');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('the hand card was discarded', st.players[0].hand.length === 0, st.players[0].hand.length);
	ok('the discard was remembered by the Prison', (st.players[0].prisonDiscarded || []).includes('z_minion'), st.players[0].prisonDiscarded);
	const guard = st.players[0].board.find(c => c.id === 'token_void_guardian');
	ok('summoned a 5/5 Taunt', guard && guard.attack === 5 && E.hp(guard) === 5 && guard.keywords.includes('taunt'), guard && [guard.attack, E.hp(guard), guard.keywords]);
}

// Deathrattle summons Zuramat the Obliterator
{
	const st = game();
	const loc = placeLoc(st, 'zuramats_prison');
	loc.doomed = true;
	E.sweepDeaths(st);
	const zu = st.players[0].board.find(c => c.id === 'zuramat_obliterator');
	ok('Deathrattle freed Zuramat (8/8)', zu && zu.attack === 8 && E.hp(zu) === 8, zu && [zu.attack, E.hp(zu)]);
}

// Zuramat replays a discarded card at end of your turn (each once)
{
	const st = game();
	const zu = E.instantiate(cardsById.zuramat_obliterator, 0); zu.zone = 'board'; zu.sick = false; st.players[0].board.push(zu); E.recomputeAuras(st);
	st.players[0].prisonDiscarded = ['z_minion'];
	const before = st.players[0].board.filter(c => c.id === 'z_minion').length;
	E.endTurn(st); // player 0's turn ends -> Zuramat fires
	ok('Zuramat played the discarded minion at end of turn', st.players[0].board.filter(c => c.id === 'z_minion').length === before + 1, [before, st.players[0].board.filter(c => c.id === 'z_minion').length]);
	ok('the played card was removed from the pool (each once)', (st.players[0].prisonDiscarded || []).length === 0, st.players[0].prisonDiscarded);
}

// With an empty pool, Zuramat does nothing
{
	const st = game();
	const zu = E.instantiate(cardsById.zuramat_obliterator, 0); zu.zone = 'board'; zu.sick = false; st.players[0].board.push(zu); E.recomputeAuras(st);
	st.players[0].prisonDiscarded = [];
	const before = st.players[0].board.length;
	ok('empty pool: end of turn does not throw and summons nothing', (() => { try { E.endTurn(st); return st.players[0].board.filter(c => c.id !== 'zuramat_obliterator').length === before - 1; } catch (e) { console.log(e); return false; } })());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
