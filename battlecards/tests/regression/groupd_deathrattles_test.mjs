// Group D — deathrattle-based "turn" cards. Most were already implemented; the
// fix here is Dark Iron Harbinger summoning a REAL Doomsayer (with its start-of-turn
// destroy-all ability) instead of an ability-less 0/7 named "Doomsayer...".
import fs from 'fs';
import * as E from '../../engine.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 31) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'warlock', name: 'W', power: null }, { id: 'mage', name: 'M', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = ['wolfrider']; st.players[1].deck = ['wolfrider'];
	st.players[0].board = []; st.players[1].board = [];
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const minions = (st, pi) => st.players[pi].board.filter(c => !E.isDead(c) && c.type !== 'location');
const kill = (st, c) => { c.damage = c.maxHealth + 99; E.sweepDeaths(st); };

// the others were already implemented — sanity check their deathrattle data
ok('Dreadsteed deathrattle installs an end-of-turn resummon emblem', JSON.stringify(cardsById['dreadsteed'].deathrattle).includes('every-turn-end') && JSON.stringify(cardsById['dreadsteed'].deathrattle).includes('dreadsteed'));
ok('Everburning Phoenix deathrattle conjures another at end of turn', JSON.stringify(cardsById['everburning_phoenix'].deathrattle).includes('conjure-id-endturn'));
ok('Tunnel Terror deathrattle: two temporary 2-cost minions', JSON.stringify(cardsById['tunnel_terror'].deathrattle).includes('makeTemporary'));
ok('Nythendra deathrattle: split into Beetles', JSON.stringify(cardsById['nythendra'].deathrattle).includes('nythendra-split'));

// Dark Iron Harbinger: deathrattle now summons the REAL Doomsayer
ok('Dark Iron Harbinger deathrattle summons summonId doomsayer', JSON.stringify(cardsById['dark_iron_harbinger'].deathrattle).includes('"summonId": "doomsayer"') || cardsById['dark_iron_harbinger'].deathrattle.some(d => d.summonId === 'doomsayer'));
{
	const st = game(); const h = put(st, 0, 'dark_iron_harbinger'); // 7/4
	const buddy = put(st, 0, null, { id: 'bud', name: 'Buddy', type: 'creature', cost: 2, rarity: 'basic', attack: 2, health: 3 });
	const foe = put(st, 1, null, { id: 'foe', name: 'Foe', type: 'creature', cost: 2, rarity: 'basic', attack: 2, health: 3 });
	kill(st, h);
	const ds = st.players[0].board.find(c => c.id === 'doomsayer');
	ok('a real Doomsayer (0/7) was summoned', ds && ds.attack === 0 && E.hp(ds) === 7 && ds.ongoing && ds.ongoing.on === 'turn-start', ds && [ds.attack, E.hp(ds), ds.ongoing]);
	// round-trip to your next turn start -> Doomsayer destroys ALL creatures
	E.endTurn(st); E.endTurn(st);
	ok('at the start of your turn, the Doomsayer destroyed ALL creatures', minions(st, 0).length === 0 && minions(st, 1).length === 0, [minions(st, 0).map(c => c.id), minions(st, 1).map(c => c.id)]);
}

// Dreadsteed end-to-end: dies -> at end of turn, a new Dreadsteed returns
{
	const st = game(); const d = put(st, 0, 'dreadsteed');
	kill(st, d);
	ok('Dreadsteed is gone right after dying', !st.players[0].board.some(c => c.id === 'dreadsteed' && !E.isDead(c)));
	E.endTurn(st); // end of your turn -> the rebirth emblem resummons it
	ok('Dreadsteed returned at the end of your turn', st.players[0].board.some(c => c.id === 'dreadsteed' && !E.isDead(c)), minions(st, 0).map(c => c.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
