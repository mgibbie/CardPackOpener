// Twenty-sixth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Barbtooth Wurm -> retribe Beast; add "Constellation: Discover a Green card".
//   Beast Within   -> "Destroy target creature. Create a 1/1 Beast for its controller."
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 57) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- Barbtooth Wurm: Constellation: Discover a Green card ----------
{
	const c = cardsById.barbtooth_wurm;
	ok('Barbtooth Wurm is a Beast', c.tribe === 'Beast', c.tribe);
	ok('reads "Trample.\\nConstellation: Discover a Green card."', c.description === 'Trample.\nConstellation: Discover a Green card.', JSON.stringify(c.description));
	ok('Constellation discovers from the Forest (green) pool', c.ongoing?.on === 'enchantment-played' && c.ongoing.effects[0].type === 'discover' && c.ongoing.effects[0].landSet === 'Forest', JSON.stringify(c.ongoing));
	const st = game();
	put(st, 0, E.instantiate(c, 0));
	const before = (st.pickQueue || []).length;
	E.fireOngoing(st, 0, 'enchantment-played', {});
	const q = (st.pickQueue || [])[before];
	ok('Constellation queued a Discover', !!q && q.discover === true && q.ids?.length > 0, JSON.stringify(q && q.ids));
	ok('every offered card is a Green (Forest-pool) card', (q?.ids || []).every(id => cardsById[id]?.landSet === 'Forest'), JSON.stringify((q?.ids || []).map(id => cardsById[id]?.landSet)));
}

// ---------- Beast Within: destroy a creature, give ITS controller a 1/1 Beast ----------
{
	const c = cardsById.beast_within;
	ok('reads "Destroy target creature. Create a 1/1 Beast for its controller."', c.description === 'Destroy target creature. Create a 1/1 Beast for its controller.', JSON.stringify(c.description));
	// cast on an ENEMY creature -> it dies, the OPPONENT gets the 1/1 Beast
	const st = game();
	const foe = put(st, 1, E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 4, attack: 5, health: 5 }, 1));
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('the target creature was destroyed', !st.players[1].board.some(x => x.uid === foe.uid && !E.isDead(x)), st.players[1].board.map(x => x.id));
	const beast = st.players[1].board.find(x => (x.tribe || '').includes('Beast') && x.attack === 1 && x.maxHealth === 1 && !E.isDead(x));
	ok('the destroyed creature\'s controller (opponent) got a 1/1 Beast', !!beast, st.players[1].board.map(x => x.id + ' ' + x.attack + '/' + x.maxHealth));
	ok('the caster did NOT get the Beast', !st.players[0].board.some(x => (x.tribe || '').includes('Beast')), st.players[0].board.map(x => x.id));
}

// ---------- Beast Within on your OWN creature -> YOU get the Beast ----------
{
	const st = game();
	const mine = put(st, 0, E.instantiate({ id: 'm', name: 'M', type: 'creature', cost: 4, attack: 5, health: 5 }, 0));
	const sp = E.instantiate(cardsById.beast_within, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: mine.uid, player: 0 }, null, 0);
	ok('destroying your own creature gives YOU the 1/1 Beast', st.players[0].board.some(x => (x.tribe || '').includes('Beast') && x.attack === 1 && !E.isDead(x)), st.players[0].board.map(x => x.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
