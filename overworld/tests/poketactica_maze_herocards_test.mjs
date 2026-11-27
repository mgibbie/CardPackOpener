// poketactica_maze_herocards_test.mjs — MAZE BUILDER, HERO CARDS (Plans/POKETACTICA_MODES_PLAN.md item B1; Tower Defense
// rules 20). "Heroes differ by deck mix and a passive." Each hero's deck now holds one card of a kind ONLY that hero has:
// Brock's Bastion, Misty's Tide Pool, Lt. Surge's Dynamo, Erika's Trellis, Lance's Dragon Spire. Each is made of what
// the other kinds already do (a height, a ground, a panel, an aura), put together or made stronger.
// Pure: node only.   node overworld/tests/poketactica_maze_herocards_test.mjs
import * as TD from '../../poketactica/js/td/sim.js';
import * as C from '../../poketactica/js/td/cards.js';
import * as H from '../../poketactica/js/td/heroes.js';
import { MAZE_MAPS } from '../../poketactica/js/td/maps.js';
import * as Geo from '../../poketactica/js/engine/geo.js';
import { loadData, squadAt } from '../../tools/poketactica/td_auto.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData(), FIELD = MAZE_MAPS[0];
const run = (hero, o = {}) => TD.newRun(o.seed || 'hc', { map: FIELD, squad: squadAt(18, 4, data), ...(hero ? { hero } : {}), ...(o.rev ? { rev: o.rev } : {}) }, data);
const ap = (S, a) => TD.applyInput(S, a, data);

// ---------- the table
A(TD.TD_RULES_REV >= 20 && H.HERO_CARD_REV === 20 && JSON.stringify(C.HERO_BONUSES) === '["bastion","tidepool","dynamo","trellis","dragonspire","ninjaperch","mindspire"]', 'rules 20: a hero card each (seven, with the two heroes of rules 21)');
A(H.HEROES.every((h) => h.card && C.BONUS[h.card.bonus] && C.BONUS[h.card.bonus].hero === h.id && C.BONUS[h.card.bonus].name && C.BONUS[h.card.bonus].text.length > 20) && new Set(H.HEROES.map((h) => h.card.bonus)).size === H.HEROES.length, 'every hero has a card of a kind that is theirs alone, named and explained', H.HEROES.map((h) => [h.id, h.card]));
A(C.HERO_BONUSES.every((k) => !C.BONUSES.includes(k)) && C.bonusesAt(22).length === 11 && !C.bonusesAt(23).some((k) => C.BONUS[k].hero) && !C.bonusesAt(20).some((k) => C.BONUS[k].hero) && !C.bonusesAt(13).some((k) => C.BONUS[k].hero), 'no reward ever offers one: the kinds a reward may hold are the eleven there were');
A(H.heroProblems((k) => !!C.BONUS[k]).length === 0, 'the heroes\' data is still sound (decks of 8 to 16, known shapes and passives)', H.heroProblems((k) => !!C.BONUS[k]));

// ---------- in the deck, and only in theirs
for (const h of H.HEROES) {
	const S = run(h.id), old = run(h.id, { rev: 19 });
	const mine = S.deck.filter((c) => c.bonus === h.card.bonus), others = S.deck.filter((c) => c.bonus && C.BONUS[c.bonus].hero && C.BONUS[c.bonus].hero !== h.id);
	A(S.deck.length === h.deck.length + 1 && mine.length === 1 && mine[0].shape === h.card.shape && others.length === 0, `${h.name}: one ${C.BONUS[h.card.bonus].name} in the deck, and no other hero's card`, S.deck.map((c) => c.bonus || '').filter(Boolean));
	if (h.since > 19) A(!old.hero && !old.deck, `${h.name} came with rules ${h.since}: a run recorded under rules 19 has no such hero`);
	else A(old.deck.length === h.deck.length && !old.deck.some((c) => c.bonus && C.BONUS[c.bonus].hero), `${h.name}: a run recorded under rules 19 has the deck without it`);
}
A(!run(null).deck || !run(null).deck.some((c) => c.bonus && C.BONUS[c.bonus].hero), 'a run with no hero has none');
// no reward offers a hero card, over many waves
{
	const S = run('brock'); let seen = 0, n = 0;
	for (let w = 1; w <= 60; w++) for (const o of C.withDeckOffer(C.rewardsOf('offers', w, w % 10 === 0, false, C.bonusesAt(S.rev)), 'offers', w, w % 10 === 0, S.deck, C.bonusesAt(S.rev)).opts) { n++; if (o && o.bonus && C.BONUS[o.bonus].hero) seen++; }
	A(n > 100 && seen === 0, `60 waves of rewards (${n} offers): none is a hero card`, seen);
}
/** A plain one-tile block laid touching a block (an aura reaches the RAISED tiles beside it). -> the tile index, or -1 */
function beside(S, cells) { const W = S.B.map.w; for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (cells.some(([a, b]) => a === x + dx && b === y + dy) || TD.blockWhy(S, 'one', 0, x + dx, y + dy)) continue; const c = C.addCard(S, 'one'); if (!ap(S, { t: 'block', card: c.id, turns: 0, x: x + dx, y: y + dy })) return (y + dy) * W + x + dx; } return -1; }
// ---------- laid, each does what it says
/** A run as `hero` with the hero's card in hand, laid on open ground off the way. -> { S, block, cells } */
function laid(hero) {
	const S = run(hero), h = H.heroById(hero);
	S.gold = 999;
	S.hand = []; const c = C.addCard(S, h.card.shape, h.card.bonus);
	const W = S.B.map.w, Hh = S.B.map.h;
	for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) for (let t = 0; t < 4; t++) {
		if (TD.blockWhy(S, h.card.shape, t, x, y)) continue;
		const err = ap(S, { t: 'block', card: c.id, turns: t, x, y });
		if (!err) { const b = S.blocks[S.blocks.length - 1]; return { S, b, cells: b.cells }; }
	}
	return { S, b: null, cells: [] };
}
{
	const { S, b, cells } = laid('brock'), W = S.B.map.w;
	A(b && b.bonus === 'bastion' && cells.every(([x, y]) => S.B.map.height[y * W + x] === 3), 'a Bastion stands three levels up (a plain block one, a Tall block two)', b && cells.map(([x, y]) => S.B.map.height[y * W + x]));
}
{
	const { S, b, cells } = laid('misty'), W = S.B.map.w, at = beside(S, cells);
	A(b && cells.every(([x, y]) => S.B.map.ground[y * W + x] === 'water') && at >= 0 && S.aura && S.aura[at] === 10, 'a Tide Pool is water to stand on, and a block touching it is in its +10% aura', b && [cells.map(([x, y]) => S.B.map.ground[y * W + x]), S.aura]);
}
{
	const { S, b, cells } = laid('surge'), at = beside(S, cells);
	A(b && at >= 0 && S.aura && S.aura[at] === 25 && 25 <= C.AURA_MAX, 'a Dynamo\'s aura is +25% (a Beacon\'s is +15%), within the cap of ' + C.AURA_MAX, S.aura);
}
{
	const { S, b, cells } = laid('erika'), W = S.B.map.w;
	A(b && cells.every(([x, y]) => S.B.map.ground[y * W + x] === 'tallgrass' && S.B.map.height[y * W + x] === 2), 'a Trellis is tall grass, and two levels up', b && cells.map(([x, y]) => [S.B.map.ground[y * W + x], S.B.map.height[y * W + x]]));
}
{
	const { S, b, cells } = laid('lance'), W = S.B.map.w;
	A(b && cells.every(([x, y]) => S.B.map.height[y * W + x] === 2 && Geo.colorAt(S.B, x, y) === 'purple') && Geo.effectsAt(S.B, cells[0][0], cells[0][1]).some((e) => e.k === 'noMiss'), 'a Dragon Spire is two levels up and a purple panel: moves used from it never miss', b && cells.map(([x, y]) => [S.B.map.height[y * W + x], Geo.colorAt(S.B, x, y)]));
}
// ---------- taken back, the ground is as it was
{
	const { S, b, cells } = laid('erika'), W = S.B.map.w;
	const err = ap(S, { t: 'unblock', id: b.id });
	A(!err && cells.every(([x, y]) => S.B.map.height[y * W + x] === 0 && S.B.map.ground[y * W + x] !== 'tallgrass'), 'a Trellis taken back the same round leaves the ground as it was', [err, cells.map(([x, y]) => [S.B.map.height[y * W + x], S.B.map.ground[y * W + x]])]);
}
// ---------- the same run twice
{
	const a = run('lance', { seed: 'same' }), b = run('lance', { seed: 'same' });
	A(TD.hashOf(a) === TD.hashOf(b), 'the same seed deals the same deck');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
