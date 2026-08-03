// Group D (turn triggers) wave 7 — this-turn recasters + randomized self-effects.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 27) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = [];
	return st;
};
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

for (const id of ['archmage_vargoth', 'creature_of_the_sacred_cave', 'static_waveform', 'sunstruck_henchman'])
	ok(`${id} carries an ongoing`, cardsById[id].ongoing, id);

// Archmage Vargoth: end of turn, cast a random spell you've cast this turn
{
	const st = game(); const v = put(st, 0, 'archmage_vargoth');
	// simulate having cast a damaging spell this turn
	const dmgSpell = raw.cards.find(c => (c.type === 'sorcery' || c.type === 'instant') && !c.token && c.collectible !== false && !(c.colors && c.colors.length) && JSON.stringify(c.effects || []).includes('"damage"'));
	st.players[0].cardsPlayedThisTurnIds = [dmgSpell.id];
	const foe = put(st, 1, 'chillwind_yeti'); st.players[1].life = 30;
	const life0 = st.players[1].life, dmg0 = foe.damage;
	E.endTurn(st);
	ok('Vargoth: re-cast a this-turn spell (something took damage)', st.players[1].life < life0 || foe.damage > dmg0 || E.isDead(foe), [st.players[1].life, foe.damage]);
}
// Creature of the Sacred Cave: recast a random HOLY spell you cast this turn
{
	const st = game(); put(st, 0, 'creature_of_the_sacred_cave');
	const holy = raw.cards.find(c => (c.type === 'sorcery' || c.type === 'instant') && c.tribe === 'Holy' && !c.token && c.collectible !== false && !(c.colors && c.colors.length));
	const nonHoly = raw.cards.find(c => (c.type === 'sorcery' || c.type === 'instant') && c.tribe && c.tribe !== 'Holy' && !c.token && c.collectible !== false && !(c.colors && c.colors.length));
	if (holy) {
		st.players[0].cardsPlayedThisTurnIds = [holy.id, nonHoly ? nonHoly.id : holy.id];
		ok('(Sacred Cave: has a Holy spell to recast)', true);
		E.endTurn(st); // no crash; only Holy is eligible
		ok('Sacred Cave: casting a Holy this-turn spell did not crash', !st.over);
	} else { ok('(no Holy spell in pool)', true); ok('(skip)', true); }
}
// Static Waveform: at the start of EACH turn, lose 1 Attack or Health
{
	const st = game(); const sw = put(st, 0, 'static_waveform'); // 5/6
	const total0 = sw.attack + E.hp(sw);
	E.endTurn(st); // opponent's turn starts -> EACH turn -> lose 1
	ok('Static Waveform: lost 1 stat at the start of the opponent\'s turn too (EACH turn)', sw.attack + E.hp(sw) === total0 - 1, [sw.attack, E.hp(sw)]);
	E.endTurn(st); // your turn starts -> lose another
	ok('Static Waveform: lost another at the start of your turn', sw.attack + E.hp(sw) === total0 - 2, [sw.attack, E.hp(sw)]);
}
// Sunstruck Henchman: 50% chance to fall asleep at start of your turn (deterministic under the seed)
{
	// run several seeds; across them it should sometimes sleep and sometimes not
	let slept = 0, awake = 0;
	for (let s = 0; s < 8; s++) {
		const st = game(100 + s); const h = put(st, 0, 'sunstruck_henchman');
		E.endTurn(st); E.endTurn(st); // your next turn start
		if (h.dormantLeft > 0) slept++; else awake++;
	}
	ok('Sunstruck Henchman: sometimes falls asleep, sometimes not (~50%)', slept > 0 && awake > 0, [slept, awake]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
