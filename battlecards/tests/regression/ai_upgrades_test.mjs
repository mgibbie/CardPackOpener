// ai_upgrades_test.mjs — the 2026-08 AI upgrades: secrets probing, targeted
// activated abilities, scored tap targets, combo sequencing, shield pings,
// and the curve-aware mulligan.
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const mk = (def, pi, zone) => { const c = E.instantiate(def, pi); c.zone = zone; return c; };
const fresh = () => {
	const st = E.createGame(cardsById, seededRng(7), null, 2,
		[{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 1;
	for (const p of st.players) { p.hand = []; p.deck = []; }
	st.players[1].mana.max = 10; st.players[1].mana.cur = 10;
	return st;
};
const vanilla = (over = {}) => ({ id: 'tv', name: 'TV', type: 'creature', cost: 2, rarity: 'basic', attack: 2, health: 2, ...over });

// ---- mulligan: curve-aware tosses ----
{
	const hand = [
		mk(vanilla({ id: 'a', cost: 1 }), 1, 'hand'),
		mk(vanilla({ id: 'b', cost: 3 }), 1, 'hand'),
		mk(vanilla({ id: 'c', cost: 6 }), 1, 'hand'),
		mk(vanilla({ id: 'coin', cost: 0, type: 'sorcery' }), 1, 'hand'),
	];
	const toss = AI.mulliganTossUids(hand);
	ok('mulligan: tosses the 6-drop, keeps the curve + Coin',
		toss.length === 1 && toss[0] === hand[2].uid, JSON.stringify(toss));
	const clunky = [
		mk(vanilla({ id: 'd', cost: 4 }), 1, 'hand'),
		mk(vanilla({ id: 'e', cost: 4 }), 1, 'hand'),
		mk(vanilla({ id: 'f', cost: 3 }), 1, 'hand'),
	];
	const toss2 = AI.mulliganTossUids(clunky);
	ok('mulligan: no early game -> the 4-drops go too, the 3-drop stays',
		toss2.length === 2 && !toss2.includes(clunky[2].uid), JSON.stringify(toss2));
	ok('mulligan: a good curve keeps everything', AI.mulliganTossUids([
		mk(vanilla({ id: 'g', cost: 1 }), 1, 'hand'), mk(vanilla({ id: 'h', cost: 3 }), 1, 'hand')]).length === 0);
}

// ---- secrets probe: cheapest attacker leads when a defender has secrets ----
{
	const st = fresh();
	const small = mk(vanilla({ id: 'small', attack: 1, health: 1 }), 1, 'board');
	const big = mk(vanilla({ id: 'big', attack: 6, health: 6 }), 1, 'board');
	ok('probe: normal order untouched without secrets',
		AI.attackProbeOrder(st, 1, [big, small])[0] === big);
	st.players[0].secrets = [{ id: 'dummy_secret' }];
	ok('probe: the 1/1 leads into a secret-holding defender',
		AI.attackProbeOrder(st, 1, [big, small])[0] === small);
	st.players[0].secrets = [];
	st.players[0].traps = [{ id: 'dummy_trap' }];
	ok('probe: traps count too', AI.attackProbeOrder(st, 1, [big, small])[0] === small);
	st.players[0].eliminated = true;
	ok('probe: an eliminated seat\'s leftovers are ignored',
		AI.attackProbeOrder(st, 1, [big, small])[0] === big);
}

// ---- pickTarget: a boost/buff effect aims at OUR side, damage at theirs ----
{
	const st = fresh();
	const mine = mk(vanilla({ id: 'mine', attack: 4, health: 4 }), 1, 'board');
	const theirs = mk(vanilla({ id: 'theirs', attack: 5, health: 5 }), 0, 'board');
	st.players[1].board.push(mine);
	st.players[0].board.push(theirs);
	const legal = [
		{ type: 'creature', player: 1, uid: mine.uid },
		{ type: 'creature', player: 0, uid: theirs.uid },
	];
	const boost = AI.pickFromLegal(st, 1, [{ type: 'boost' }], legal);
	ok('boost lands on our own creature', boost && boost.player === 1 && boost.uid === mine.uid, JSON.stringify(boost));
	const zap = AI.pickFromLegal(st, 1, [{ type: 'damage', value: 2 }], legal);
	ok('a hostile tap aims at their creature', zap && zap.player === 0, JSON.stringify(zap));
	const buff = AI.pickTarget(st, 1, { id: 'x:ability', type: 'sorcery', effects: [{ type: 'buff', attack: 1, health: 1, target: 'creature' }] });
	ok('buff lands on our own creature', buff && buff.player === 1, JSON.stringify(buff));
	const dmg = AI.pickTarget(st, 1, { id: 'y:ability', type: 'sorcery', effects: [{ type: 'damage', value: 2, target: 'creature' }] });
	ok('damage aims at the enemy threat', dmg && dmg.player === 0, JSON.stringify(dmg));
}

// ---- targeted activated ability: the AI now uses it (at the right side) ----
{
	const st = fresh();
	const priest = mk({ ...vanilla({ id: 'test_battlepriest', attack: 1, health: 4 }), activated: cardsById.abzan_battlepriest.activated }, 1, 'board');
	priest.sick = false;
	const buddy = mk(vanilla({ id: 'buddy', attack: 3, health: 3 }), 1, 'board');
	st.players[1].board.push(priest, buddy);
	let buffed = false;
	for (let i = 0; i < 30; i++) {
		const before = buddy.attack + (priest.attack || 0);
		const acted = AI.step(st, 1);
		if (buddy.attack > 3 || priest.attack > 1) { buffed = true; break; }
		if (!acted) break;
	}
	ok('the AI fires a targeted activated ability on its own side', buffed,
		JSON.stringify({ buddy: buddy.attack, priest: priest.attack }));
	ok('nothing on the enemy side got the buff', !st.players[0].board.some(c => c.attack > (cardsById[c.id]?.attack ?? 99)));
}

// ---- combo sequencing: a non-combo card leads, the combo card follows ----
{
	const st = fresh();
	st.players[1].mana.max = 4; st.players[1].mana.cur = 4; // too poor to detour into land development
	const lead = mk(vanilla({ id: 'lead', cost: 1, attack: 1, health: 1 }), 1, 'hand');
	const combo = mk({ ...vanilla({ id: 'combo_guy', cost: 3, attack: 2, health: 2 }), combo: [{ type: 'draw', value: 1 }] }, 1, 'hand');
	st.players[1].hand.push(combo, lead); // combo first in hand AND pricier — old AI led with it
	const seen = [];
	for (let i = 0; i < 20; i++) {
		const acted = AI.step(st, 1);
		for (const c of st.players[1].board) if (!seen.includes(c.id)) seen.push(c.id);
		if (seen.includes('combo_guy') || !acted) break;
	}
	ok('the cheap non-combo card hits the board first', seen[0] === 'lead', JSON.stringify(seen));
	ok('the combo card follows once its line is live', seen.includes('combo_guy'), JSON.stringify(seen));
}

// ---- shield ping: a 1-attack body pops a big Divine Shield threat ----
{
	const st = fresh();
	const pinger = mk(vanilla({ id: 'pinger', attack: 1, health: 1 }), 1, 'board');
	pinger.sick = false;
	st.players[1].board.push(pinger);
	const bomb = mk(vanilla({ id: 'bomb', attack: 6, health: 6 }), 0, 'board');
	bomb.shield = true;
	st.players[0].board.push(bomb);
	for (let i = 0; i < 20; i++) { if (!AI.step(st, 1)) break; }
	ok('the cheap body broke the Divine Shield instead of going face', bomb.shield === false,
		JSON.stringify({ shield: bomb.shield, life: st.players[0].life }));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
