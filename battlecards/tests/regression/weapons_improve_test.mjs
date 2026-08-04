// Missing HS weapons — "improve" instruments (Festival of Legends). Each has an
// ongoing that ticks source.improveCount on a matching action while equipped, and
// a Deathrattle whose number scales by improveCount (improveScaled: stats|count|value).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 49) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, cost = 1, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const playDef = (st, def) => { cardsById[def.id] = def; const c = E.instantiate(def, 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, null, null, 0); };
const spell = (id, cost, extra = {}) => ({ id, name: id, type: 'sorcery', cost, rarity: 'basic', effects: [{ type: 'armor', value: 0 }], ...extra });

const INSTR = ['disco_maul', 'timber_tambourine', 'glaivetar', 'record_scratcher', 'kodohide_drumkit', 'jazz_bass', 'jungle_jammer'];
for (const id of INSTR) ok(`${id} exists with an improve ongoing + Deathrattle`, cardsById[id]?.ongoing?.effects?.[0]?.type === 'improve-tick' && cardsById[id]?.deathrattle, id);

// Disco Maul: base Deathrattle = +1/+1; after playing 2 minions = +3/+3
{
	const st = game(); const target = put(st, 0, dummy(2, 2, 'T'));
	const w = equip(st, 'disco_maul');
	playDef(st, dummy(0, 1, 'A')); playDef(st, dummy(0, 1, 'B')); // two minions played while equipped
	ok('Disco Maul ticked improveCount to 2', w.improveCount === 2, w.improveCount);
	const before = st.players[0].board.reduce((s, c) => s + c.attack + E.hp(c), 0);
	E.breakWeapon(st, 0);
	const after = st.players[0].board.reduce((s, c) => s + c.attack + E.hp(c), 0);
	ok('Disco Maul deathrattle gave +3/+3 (scaled by improveCount)', after - before === 6, after - before);
}
// Disco Maul with NO improve = +1/+1
{
	const st = game(); put(st, 0, dummy(2, 2, 'T'));
	equip(st, 'disco_maul');
	const before = st.players[0].board.reduce((s, c) => s + c.attack + E.hp(c), 0);
	E.breakWeapon(st, 0);
	const after = st.players[0].board.reduce((s, c) => s + c.attack + E.hp(c), 0);
	ok('Disco Maul unimproved deathrattle = +1/+1', after - before === 2, after - before);
}
// Timber Tambourine: play two 5-cost cards → Deathrattle summons 1+2 = 3 Ancients
{
	const st = game(); const w = equip(st, 'timber_tambourine');
	playDef(st, spell('big1', 5)); playDef(st, spell('big2', 5)); // two 5-cost spells
	ok('Timber Tambourine ticked on 5-Cost cards', w.improveCount === 2, w.improveCount);
	const before = st.players[0].board.length;
	E.breakWeapon(st, 0);
	ok('Timber Tambourine summoned 3 Ancients (1 + 2 improve)', st.players[0].board.length === before + 3 && st.players[0].board.filter(c => c.attack === 5 && E.hp(c) === 5).length >= 3, st.players[0].board.length - before);
}
// Timber Tambourine ignores cheap cards (minCost gate)
{
	const st = game(); const w = equip(st, 'timber_tambourine');
	playDef(st, spell('cheap', 2));
	ok('Timber Tambourine did NOT tick on a 2-Cost card', (w.improveCount || 0) === 0, w.improveCount);
}
// Jungle Jammer: cast 2 spells → Deathrattle summons 1+2 = 3 random 1-Cost Beasts
{
	const st = game(); const w = equip(st, 'jungle_jammer');
	playDef(st, spell('s1', 1)); playDef(st, spell('s2', 1));
	ok('Jungle Jammer ticked on spells cast', w.improveCount === 2, w.improveCount);
	const before = st.players[0].board.length;
	E.breakWeapon(st, 0);
	ok('Jungle Jammer summoned 3 minions', st.players[0].board.length === before + 3, st.players[0].board.length - before);
}
// Jazz Bass: base Deathrattle discounts your next spell by (1)
{
	const st = game(); equip(st, 'jazz_bass');
	E.breakWeapon(st, 0);
	ok('Jazz Bass deathrattle set nextSpellDiscount to 1', st.players[0].nextSpellDiscount === 1, st.players[0].nextSpellDiscount);
}

// crash-check all 7 (equip + break with a friendly + enemy minion present)
{
	let crashed = [];
	for (const id of INSTR) {
		try {
			const st = game(); st.debug = { strictEffects: true };
			put(st, 0, dummy(2, 3, 'Fr')); put(st, 1, dummy(0, 4, 'Foe'));
			equip(st, id); E.breakWeapon(st, 0);
		} catch (e) { crashed.push(id + ':' + (e.message || e).slice(0, 60)); }
	}
	ok('all 7 instruments equip + break without crashing', crashed.length === 0, crashed);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
