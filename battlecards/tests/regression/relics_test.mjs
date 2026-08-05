// Relic subsystem + Relic Vault: Relics scale with each Relic played (relicImprove),
// and Relic Vault makes your next Relic this turn cast twice.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_fill = { id: 't_fill', name: 'F', type: 'creature', cost: 1, attack: 1, health: 1 };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'demonhunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'demonhunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const enemy = (st, hp = 20) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 1, attack: 0, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const cast = (st, id) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, null, null, 0); };
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const spirits = (st) => st.players[0].board.filter(c => c.name === 'Spirit').length;

for (const id of ['relic_of_extinction', 'relic_of_phantasms', 'relic_of_dimensions', 'relic_vault']) ok(`${id} present`, cardsById[id], id);
ok('the 3 Relics are marked relic:true', ['relic_of_extinction', 'relic_of_phantasms', 'relic_of_dimensions'].every(id => cardsById[id].relic));

// Improve: each Relic played makes the NEXT Relic stronger (relicImprove counter)
{
	const st = game();
	ok('relicImprove starts at 0', (st.players[0].relicImprove || 0) === 0);
	cast(st, 'relic_of_phantasms'); // 1st relic: 2 Spirits, then improve -> 1
	ok('1st Relic of Phantasms summoned 2 Spirits', spirits(st) === 2, spirits(st));
	ok('relicImprove is now 1', st.players[0].relicImprove === 1, st.players[0].relicImprove);
	cast(st, 'relic_of_phantasms'); // 2nd relic: improved by 1 -> 3 Spirits (total 5)
	ok('2nd Relic summoned 3 Spirits (improved)', spirits(st) === 5, spirits(st));
	ok('relicImprove is now 2', st.players[0].relicImprove === 2, st.players[0].relicImprove);
}

// Improve is cross-Relic (a played Extinction improves a later Phantasms)
{
	const st = game(); const foe = enemy(st, 20);
	cast(st, 'relic_of_extinction'); // 2 hits of 1 -> foe takes 2; improve -> 1
	ok('1st Relic of Extinction dealt 2 (two 1-dmg hits)', foe.damage === 2, foe.damage);
	cast(st, 'relic_of_phantasms'); // improved by 1 -> 3 Spirits
	ok('a later Relic is improved by an earlier different Relic', spirits(st) === 3, spirits(st));
}

// Relic Vault: the next Relic this turn casts twice
{
	const st = game();
	const loc = placeLoc(st, 'relic_vault');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Relic Vault set the double-cast flag', st.players[0].nextRelicDoubleCast === true, st.players[0].nextRelicDoubleCast);
	cast(st, 'relic_of_phantasms'); // casts twice -> 2 + 2 = 4 Spirits
	ok('Relic Vault doubled the Relic (4 Spirits)', spirits(st) === 4, spirits(st));
	ok('the flag was consumed', st.players[0].nextRelicDoubleCast === false, st.players[0].nextRelicDoubleCast);
	ok('a doubled Relic still improves only once', st.players[0].relicImprove === 1, st.players[0].relicImprove);
	// only the NEXT relic benefits: a second relic is single-cast (improved to 3, not 6)
	cast(st, 'relic_of_phantasms');
	ok('the following Relic is single-cast again (3 Spirits added)', spirits(st) === 7, spirits(st));
}

// Relic Vault flag only lasts this turn
{
	const st = game();
	const loc = placeLoc(st, 'relic_vault');
	E.tapLand(st, 0, loc.uid, 0, null);
	E.endTurn(st); E.endTurn(st);
	ok('double-cast flag cleared by the new turn', !st.players[0].nextRelicDoubleCast, st.players[0].nextRelicDoubleCast);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
