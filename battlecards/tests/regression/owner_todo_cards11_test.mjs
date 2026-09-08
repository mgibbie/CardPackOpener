// Eleventh batch from the wiki's owner inbox (owner_todo), applied 2026-09-08.
//
//   Trained Armodon   -> add "Battlecry: Adapt"; retribe Elephant -> Beast.
//   Archers of Qarsi  -> retribe Snake Archer -> Naga Archer.
//
// Trained Armodon's new Battlecry is FIRED: playing it queues an Adapt pick
// (mode 'adapt') aimed at itself.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 17) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};

// ---------- Trained Armodon ----------
{
	const c = cardsById.trained_armodon;
	ok('Trained Armodon is now a Beast', c.tribe === 'Beast', c.tribe);
	ok('reads "Trample.\\nBattlecry: Adapt."', c.description === 'Trample.\nBattlecry: Adapt.', JSON.stringify(c.description));
	ok('keeps trample + gains battlecry', ['trample', 'battlecry'].every(k => (c.keywords || []).includes(k)), JSON.stringify(c.keywords));
	ok('battlecry is a self Adapt', c.effects?.[0]?.type === 'adapt' && c.effects?.[0]?.target === 'self', JSON.stringify(c.effects));

	// FIRE it: playing the Armodon queues an Adapt pick aimed at itself
	const st = game();
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	const before = (st.pickQueue || []).length;
	E.playCard(st, 0, sp.uid, null, null, 0);
	const q = (st.pickQueue || [])[before];
	ok('playing it queued an Adapt', !!q && q.mode === 'adapt', JSON.stringify(q && { mode: q.mode, ids: q.ids }));
	const armodon = st.players[0].board.find(x => x.id === 'trained_armodon');
	ok('the Adapt targets the Armodon itself', !!armodon && (q?.adaptUids || []).includes(armodon.uid), JSON.stringify([armodon?.uid, q?.adaptUids]));
	ok('the Adapt offers three options', Array.isArray(q?.ids) && q.ids.length === 3, JSON.stringify(q?.ids));
}

// ---------- Archers of Qarsi ----------
{
	const c = cardsById.archers_of_qarsi;
	ok('Archers of Qarsi is now a Naga Archer', c.tribe === 'Naga Archer', c.tribe);
	ok('keeps its Defender 5/2 body', c.attack === 5 && c.health === 2 && (c.keywords || []).includes('defender'),
		JSON.stringify([c.attack, c.health, c.keywords]));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
