// poketactica_maze_moreheroes_test.mjs — MAZE BUILDER, MORE HEROES AND SOMETHING TO EARN WITH EACH (Plans/
// POKETACTICA_MODES_PLAN.md item B2; Tower Defense rules 21). "Five heroes, all open by wave 25." Two more (Koga, wave
// 30; Sabrina, wave 35), and with EACH hero, by the best wave cleared as that hero: a portrait frame (bronze 10, silver
// 20, gold 30) and a second deck (wave 15), chosen before the run and kept in its recipe.
// Pure: node only.   node overworld/tests/poketactica_maze_moreheroes_test.mjs
import * as TD from '../../poketactica/js/td/sim.js';
import * as C from '../../poketactica/js/td/cards.js';
import * as H from '../../poketactica/js/td/heroes.js';
import { MAZE_MAPS, TD_MAPS } from '../../poketactica/js/td/maps.js';
import { SHAPES } from '../../poketactica/js/td/maze.js';
import { tdRecipe, tdNewRun, validTdRecipe } from '../../poketactica/js/td/replay.js';
import { portraitProblems, portraitSvg } from '../../poketactica/js/td/portraits.js';
import { mazeRun } from '../../tools/poketactica/maze_auto.mjs';
import { loadData, squadAt } from '../../tools/poketactica/td_auto.mjs';
import { slimFig } from '../../poketactica/js/replay.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData(), FIELD = MAZE_MAPS[0], squad = squadAt(18, 4, data).map(slimFig);
const run = (hero, o = {}) => TD.newRun(o.seed || 'mh', { map: o.map || FIELD, squad, ...(hero ? { hero } : {}), ...(o.deck2 ? { deck2: true } : {}), ...(o.rev ? { rev: o.rev } : {}) }, data);
const key = (c) => c.shape + (c.bonus ? ':' + c.bonus : ''), J = JSON.stringify;

// ---------- the two that came
{
	const koga = H.heroById('koga'), sab = H.heroById('sabrina');
	A(TD.TD_RULES_REV >= 21 && H.MORE_HEROES_REV === 21 && koga && sab && koga.unlock === 30 && sab.unlock === 35 && koga.since === 21 && sab.since === 21, 'rules 21: Koga opens at wave 30 and Sabrina at 35');
	A(H.heroOpen(koga, 30) && !H.heroOpen(koga, 29) && H.heroOpen(sab, 35) && !H.heroOpen(sab, 34), 'they open by the best wave cleared in Maze Builder, as the others do');
	A(portraitProblems(H.HEROES.map((h) => h.id)).length === 0 && portraitSvg('koga').length > 500 && portraitSvg('sabrina').length > 500 && portraitSvg('koga') !== portraitSvg('sabrina'), 'each has a portrait drawn in code, 20 by 20', portraitProblems(H.HEROES.map((h) => h.id)));
	const k = run('koga'), s = run('sabrina');
	A(k.hero === 'koga' && k.passives.join() === 'venom' && k.deck.length === 13 && k.deck.some((c) => c.bonus === 'caltrops') && k.deck.some((c) => c.bonus === 'ninjaperch'), 'a run as Koga: Venom, his deck of 13 with Caltrops for the way and his own Ninja Perch', k.deck.map(key));
	A(s.hero === 'sabrina' && s.passives.join() === 'foresight' && s.deck.length === 13 && s.deck.some((c) => c.bonus === 'blue') && s.deck.some((c) => c.bonus === 'mindspire'), 'a run as Sabrina: Foresight, her deck of 13 with a Blue panel and her own Mind Spire', s.deck.map(key));
	const old = run('koga', { rev: 20 });
	A(!old.hero && !old.deck, 'a run recorded under rules 20 cannot be Koga\'s: it has no hero');
	A(run('koga', { map: TD_MAPS[0] }).hero == null, '(the Road has no heroes, as before)');
	// Venom is played: Poison moves 20% harder, a hold half a second longer
	A(H.PASSIVES.venom.type.Poison === 20 && H.PASSIVES.venom.holdTicks === 10 && H.typePerk(k, 'Poison') === 20 && H.perk(k, 'holdTicks') === 10 && H.typePerk(k, 'Fire') === 0, 'Venom: Poison moves 20% harder, and a hold 10 ticks (half a second) longer');
}
// ---------- a second deck with each hero
{
	A(H.DECK2_WAVE === 15 && H.HEROES.every((h) => h.deck2 && h.deck2.length >= 8 && h.deck2.length <= 16 && h.deck2Say && h.deck2Say.length > 15 && h.deck2.every((c) => SHAPES[c.shape] && (!c.bonus || (C.BONUS[c.bonus] && !C.BONUS[c.bonus].hero)))), 'every hero has a second deck of 8 to 16 real cards, and a line that says what it is');
	A(H.HEROES.every((h) => J(h.deck.map(key).sort()) !== J(h.deck2.map(key).sort())) && new Set(H.HEROES.map((h) => J(h.deck2.map(key).sort()))).size === H.HEROES.length, 'each second deck differs from the hero\'s first, and from every other hero\'s second');
	A(H.deck2Open(H.HEROES[0], 15) && !H.deck2Open(H.HEROES[0], 14) && !H.deck2Open(null, 99), 'it is earned at wave 15 AS that hero');
	for (const h of H.HEROES) {
		const a = run(h.id), b = run(h.id, { deck2: true });
		A(!a.deck2 && b.deck2 === true && J(b.deck.map(key).sort()) === J([...h.deck2, h.card].map(key).sort()) && b.passives.join() === h.passive, `${h.name}: a run begun with the second deck deals it, with the same passive and the hero's own card`, b.deck.map(key));
	}
	const old = run('brock', { deck2: true, rev: 20 });
	A(!old.deck2 && old.deck.length === 13, 'a run recorded under rules 20 has the first deck, whatever it is handed');
	// the recipe keeps it, and a replay is the same run
	const S = run('misty', { deck2: true, seed: 'rcp' });
	const rec = tdRecipe({ seed: 'rcp', mapId: FIELD.id, squad, inputs: [], end: 0, hero: 'misty', rev: S.rev, deck2: !!S.deck2 });
	const R = tdNewRun(rec, data);
	A(rec.deck2 === true && validTdRecipe(rec) && TD.hashOf(R) === TD.hashOf(S) && !('deck2' in tdRecipe({ seed: 'rcp', mapId: FIELD.id, squad, inputs: [], end: 0, hero: 'misty', rev: S.rev })), 'a run\'s recipe keeps "second deck", so its replay is the same run; a first-deck run has no such field');
}
// ---------- a frame with each hero
{
	A(J(H.FRAME_WAVES) === '[10,20,30]' && H.frameOf(0) === '' && H.frameOf(9) === '' && H.frameOf(10) === 'bronze' && H.frameOf(19) === 'bronze' && H.frameOf(20) === 'silver' && H.frameOf(30) === 'gold' && H.frameOf(99) === 'gold', 'a portrait frame: bronze at wave 10 as that hero, silver at 20, gold at 30');
}
// ---------- they can be played: the auto-builder, as each of the two and with a second deck
{
	const sq = squadAt(18, 12, data);
	for (const [id, d2] of [['koga', false], ['sabrina', false], ['brock', true]]) {
		const S = TD.newRun('auto-' + id, { map: FIELD, squad: sq.map(slimFig), hero: id, ...(d2 ? { deck2: true } : {}) }, data);
		void S;
	}
	const waves = ['koga', 'sabrina'].map((id) => [0, 1].map((k) => mazeRun('mh-auto-' + id + k, FIELD, sq, data, 120000, 'maze', null, id).wave));
	A(waves.every((w) => w.every((n) => n >= 6 && n <= 20)), `the auto-builder as Koga and as Sabrina, 12 at Lv 18 on Open Field: waves ${J(waves)} (the other heroes average 10 to 13)`, waves);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
