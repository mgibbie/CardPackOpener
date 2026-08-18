// Venture into the Dungeon (the "Advance" mechanic). A player enters a chosen dungeon and
// advances one room per venture; branch rooms offer a pick; the last room is a payoff and
// completes the dungeon. Covers the 3 AFR dungeons end-to-end + Abzan Runemark's Inspire:Advance.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._c = { id: '_c', name: 'C', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(byId, seededRng(5), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = ['_c', '_c', '_c', '_c', '_c']; p.board = []; p.life = 30; }
	st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};
const putC = (st, pi, a = 2, h = 2) => { const c = E.instantiate({ id: '_c', name: 'C', type: 'creature', cost: 1, attack: a, health: h, rarity: 'common' }, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const toHand = (st, id) => { const c = E.instantiate(byId[id], 0); c.zone = 'hand'; st.players[0].hand.push(c); return c; };
const play = (st, id, t) => E.playCard(st, 0, st.players[0].hand.find(x => x.id === id).uid, t || null);
// venture + resolve any queued dungeon/room pick with `choice`; single-next rooms auto-advance
const adv = (st, pi, choice) => { E.venture(st, pi); if (st.pickQueue.length && st.pickQueue[0].venture && st.pickQueue[0].player === pi) E.resolvePick(st, choice); st.scryQueue.length = 0; };

// ---------- data sanity ----------
ok('3 dungeons exist', Object.keys(E.DUNGEONS).length === 3);
for (const [id, exp] of [['lost_mine', 7], ['tomb', 5], ['mad_mage', 9]]) {
	const d = E.DUNGEONS[id];
	ok(`${id} has ${exp} rooms + a start`, Object.keys(d.rooms).length === exp && d.rooms[d.start]);
	ok(`${id} final room has no exits`, Object.values(d.rooms).some(r => (r.next || []).length === 0));
}

// ---------- enter flow ----------
{
	const st = game();
	E.venture(st, 0);
	ok('venture with no dungeon queues an enter pick (3 dungeons)', st.pickQueue[0]?.venture === 'enter' && st.pickQueue[0].ids.length === 3);
	E.resolvePick(st, 'lost_mine');
	ok('entered Lost Mine at its start room', st.players[0].dungeon?.id === 'lost_mine' && st.players[0].dungeon?.room === 'cave_entrance');
	ok('Cave Entrance fired Scry 1', st.scryQueue.length === 1);
}

// ---------- walk Lost Mine to the payoff (Draw) + completion ----------
{
	const st = game();
	adv(st, 0, 'lost_mine');        // enter -> cave_entrance (scry)
	adv(st, 0, 'goblin_lair');      // -> goblin_lair (summon a 1/1 Goblin)
	ok('Goblin Lair summoned a Goblin', st.players[0].board.some(c => c.name === 'Goblin'));
	adv(st, 0, 'storeroom');        // -> storeroom (bolster the Goblin to 2/2)
	ok('Storeroom bolstered a creature', st.players[0].board.some(c => c.name === 'Goblin' && c.attack === 2));
	const h = st.players[0].hand.length;
	adv(st, 0, null);               // storeroom -> temple_of_dumathoin (draw) = final
	ok('Temple of Dumathoin drew a card', st.players[0].hand.length === h + 1);
	ok('Lost Mine completed + marker cleared', st.players[0].dungeon === null && st.players[0].completedDungeons.includes('lost_mine'));
}

// ---------- walk Tomb to The Atropal ----------
{
	const st = game();
	adv(st, 0, 'tomb');             // enter -> trapped_entry (all lose 1)
	adv(st, 0, 'veils_of_fear');    // -> veils_of_fear (discard) [single from here on]
	adv(st, 0, null);               // -> sandfall_cell (all lose 2)
	adv(st, 0, null);               // -> cradle (The Atropal) = final
	const atr = st.players[0].board.find(c => c.name === 'The Atropal');
	ok('Cradle created The Atropal 4/4', !!atr && atr.attack === 4 && E.hp(atr) === 4);
	ok('The Atropal has Deathtouch', !!atr && atr.keywords.includes('deathtouch'));
	ok('Tomb completed', st.players[0].completedDungeons.includes('tomb'));
}

// ---------- walk Mad Mage to the draw-3 payoff + a fresh venture starts a new dungeon ----------
{
	const st = game(); st.players[0].deck = Array(12).fill('_c');
	adv(st, 0, 'mad_mage');         // enter -> yawning_portal (heal)
	adv(st, 0, null);               // -> dungeon_level (scry) [branch]
	adv(st, 0, 'goblin_bazaar');    // -> goblin_bazaar (coin)
	adv(st, 0, null);               // -> lost_level (scry) [branch]
	adv(st, 0, 'runestone_caverns');// -> runestone_caverns (draw 2)
	adv(st, 0, null);               // -> deep_mines (scry)
	const h = st.players[0].hand.length;
	adv(st, 0, null);               // -> mad_wizards_lair (draw 3) = final
	ok('Mad Wizard\'s Lair drew 3', st.players[0].hand.length === h + 3);
	ok('Mad Mage completed', st.players[0].dungeon === null && st.players[0].completedDungeons.includes('mad_mage'));
	E.venture(st, 0);
	ok('a fresh venture starts a NEW dungeon (enter pick again)', st.pickQueue[0]?.venture === 'enter');
}

// ---------- Abzan Runemark: Inspire: Advance (venture on hero power) ----------
{
	const st = game();
	const a = putC(st, 0, 2, 2);
	toHand(st, 'abzan_runemark');
	play(st, 'abzan_runemark', { type: 'creature', uid: a.uid, player: 0 });
	ok('Runemark attached an Inspire ongoing', a.ongoing?.on === 'hero-power-used');
	E.fireOngoing(st, 0, 'hero-power-used', {}); // simulate using a hero power (Inspire)
	ok('Inspire: Advance → the enchanted creature ventured', st.pickQueue.some(q => q.venture === 'enter'));
}

console.log(`${pass}/${pass + fail} dungeon checks passed`);
process.exit(fail ? 1 : 0);
