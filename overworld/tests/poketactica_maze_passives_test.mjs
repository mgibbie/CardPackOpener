// poketactica_maze_passives_test.mjs — MAZE BUILDER, PASSIVE RARITY AND PAIRS (Plans/POKETACTICA_MODES_PLAN.md item B3;
// Tower Defense rules 22). "31 passives, mostly flat bonuses." Five RARE passives are offered from boss wave 20 on, less
// often than the rest; and six PAIRS of the common ones are more together: a run that holds both halves gets the pair's
// own bonus on top.
// Pure: node only.   node overworld/tests/poketactica_maze_passives_test.mjs
import * as TD from '../../poketactica/js/td/sim.js';
import * as H from '../../poketactica/js/td/heroes.js';
import { MAZE_MAPS } from '../../poketactica/js/td/maps.js';
import { loadData, squadAt } from '../../tools/poketactica/td_auto.mjs';
import { slimFig } from '../../poketactica/js/replay.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData(), FIELD = MAZE_MAPS[0], squad = squadAt(18, 4, data).map(slimFig);
const run = (hero = 'brock', o = {}) => TD.newRun(o.seed || 'ps', { map: FIELD, squad, hero, ...(o.rev ? { rev: o.rev } : {}) }, data);
const withP = (ids, o) => { const S = run('brock', o); S.passives.push(...ids); return S; };
const J = JSON.stringify;

// ---------- rarity
{
	A(TD.TD_RULES_REV >= 22 && H.PASSIVE_REV === 22 && J(H.RARES) === '["warchest","overclock","fortress","architect","ironwill"]', 'rules 22: five rare passives');
	A(H.RARES.every((id) => H.PASSIVES[id].name && H.PASSIVES[id].text.length > 20 && !H.SHARED.includes(id) && H.HEROES.every((h) => !h.pool.includes(id) && h.passive !== id)), 'each is named and explained, and is in nobody\'s own list: it comes only as a rare offer');
	A(H.rarityOf('rocksolid') === 'signature' && H.rarityOf('venom') === 'signature' && H.rarityOf('rock') === 'badge' && H.rarityOf('purse') === 'common' && H.rarityOf('overclock') === 'rare' && H.HEROES.every((h) => H.rarityOf(h.passive) === 'signature'), 'a passive is a signature, a type badge, common or rare');
	A(H.heroProblems(() => true).length === 0, 'the heroes\' data is sound (every signature is in the signatures\' list)', H.heroProblems(() => true));
	// each rare one does what it says, in the numbers the others are made of
	const v0 = TD.view(run());
	const wc = withP(['warchest']), oc = withP(['overclock']), ar = TD.view(withP(['architect'])), iw = withP(['ironwill']);
	A(H.perk(wc, 'waveGold') === 6 && H.perk(wc, 'koGold') === 1 && H.perk(oc, 'cdPct') === 15 && H.perk(withP(['quick']), 'cdPct') === 8, 'War Chest: 6 gold a wave and 1 a knockout. Overclock: moves 15% sooner (Quick Hands gives 8%)');
	A(ar.handMax === v0.handMax + 2 && ar.drawCost === v0.drawCost - 2 && H.perk(withP(['architect']), 'deal') === 1, 'Architect: a hand of 2 more, a card 2 less, one more dealt a round', [v0.handMax, ar.handMax, v0.drawCost, ar.drawCost]);
	A(H.perk(iw, 'holdTicks') === 30 && H.perk(iw, 'spPct') === 25 && H.perk(withP(['fortress']), 'lives') === 5, 'Iron Will: a hold 30 ticks longer and SP a quarter faster. Fortress: 5 lives');
}
// ---------- when a rare one is offered
{
	const offers = (rev, from, to) => { const out = []; for (let k = 0; k < 40; k++) for (let n = from; n <= to; n += 10) out.push(H.perksOf('of' + k, n, 'brock', ['rocksolid'], rev)); return out; };
	const early = offers(22, 10, 10), late = offers(22, 20, 60), old = offers(21, 20, 60);
	const rareIn = (list) => list.filter((o) => o.some((id) => H.PASSIVES[id].rare)).length;
	A(rareIn(early) === 0, 'at boss wave 10 no rare passive is ever offered (40 runs)');
	A(rareIn(late) > late.length * 0.2 && rareIn(late) < late.length * 0.5 && late.every((o) => o.filter((id) => H.PASSIVES[id].rare).length <= 1 && o.length === 3 && new Set(o).size === 3), `from boss wave 20 about ${H.RARE_CHANCE} offers in 100 hold one rare passive (${rareIn(late)} of ${late.length}), never two, in the shared place`, rareIn(late));
	A(rareIn(old) === 0, 'a run recorded under rules 21 is never offered one');
	// the hero's own two are what they were: the rare one takes the SHARED place only
	const same = late.every((o, i) => J(o.slice(0, 2)) === J(old[i].slice(0, 2)));
	A(same, 'the two from the hero\'s own list are the two they would have been: only the shared place changes');
	// one already held is not offered again
	const held = []; for (let k = 0; k < 60; k++) held.push(...H.perksOf('h' + k, 30, 'brock', ['rocksolid', ...H.RARES.slice(0, 4)], 22));
	A(!held.some((id) => H.RARES.slice(0, 4).includes(id)) && held.includes('ironwill'), 'a rare passive already held is not offered again; the one left still is');
}
// ---------- pairs
{
	A(H.PAIRS.length === 6 && H.PAIRS.every((p) => p.ids.length === 2 && p.ids.every((id) => H.SHARED.includes(id)) && p.name && p.text.length > 15) && new Set(H.PAIRS.flatMap((p) => p.ids)).size === 12, 'six pairs, each two of everyone\'s passives, and no passive in two pairs', H.PAIRS.map((p) => p.ids));
	const half = withP(['purse']), whole = withP(['purse', 'bounty']), old = withP(['purse', 'bounty'], { rev: 21 });
	A(H.perk(half, 'waveGold') === 4 && H.perk(whole, 'waveGold') === 7 && H.perk(old, 'waveGold') === 4, 'Deep Pockets alone: 4 gold a wave. With Bounty (Treasury): 7. Under rules 21: still 4', [H.perk(half, 'waveGold'), H.perk(whole, 'waveGold'), H.perk(old, 'waveGold')]);
	A(J(H.pairsOf(whole).map((p) => p.id)) === '["treasury"]' && H.pairsOf(half).length === 0 && H.pairsOf(old).length === 0, 'the run holds the pair only with both halves');
	A(H.pairWith(half, 'bounty') && H.pairWith(half, 'bounty').id === 'treasury' && H.pairWith(half, 'heart') === null && H.pairWith(whole, 'bounty') === null && H.pairFor('grip').id === 'standfast' && H.pairFor('rock') === null, 'an offer can tell when a passive would finish a pair (Bounty, with Deep Pockets held)');
	// each pair's bonus is played through the same numbers
	const v0 = TD.view(run());
	const fh = TD.view(withP(['dealer', 'bighand'])), fm = TD.view(withP(['recruiter', 'crane'])), sv = TD.view(withP(['scrap', 'bargain']));
	A(fh.drawCost === v0.drawCost - 2 && fm.placeCost === v0.placeCost - 5 - 3 && sv.discardGold === v0.discardGold + 3 + 2 && sv.drawCost === v0.drawCost - 3, 'Full House: a card 2 less. Foreman: a figurine 3 less still. Salvage: a discard 2 more still', [v0.drawCost, fh.drawCost, v0.placeCost, fm.placeCost, v0.discardGold, sv.discardGold]);
	A(H.perk(withP(['focus', 'quick']), 'cdPct') === 8 + 6 && H.perk(withP(['grip', 'heart']), 'holdTicks') === 20 + 10, 'Flow: moves 6% sooner still. Stand Fast: a hold half a second longer still');
	// two pairs at once
	const two = withP(['purse', 'bounty', 'focus', 'quick']);
	A(H.pairsOf(two).length === 2 && H.perk(two, 'waveGold') === 7 && H.perk(two, 'cdPct') === 14, 'two pairs held at once both count');
}
// ---------- a run that takes a perk still works, and replays the same
{
	const a = run('lance', { seed: 'same' }), b = run('lance', { seed: 'same' });
	A(TD.hashOf(a) === TD.hashOf(b), 'the same seed is the same run');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
