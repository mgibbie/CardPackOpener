// poketactica_maze_heroes_test.mjs — Tower Defense, MAZE BUILDER: HEROES (owner, 2026-11-24: "play as different
// characters ... different starting decks of block cards & offered different passives. Use characters from Pokémon like
// Brock & Lance"). Five heroes; each one's own deck in place of the shared bag (reward cards join it); a signature
// passive from the start and a pick of three after every boss wave; Brock free, the others opened by waves cleared.
// Every passive is PLAYED here, not just listed. A run with no hero plays exactly as before (pinned fingerprints).
//   node overworld/tests/poketactica_maze_heroes_test.mjs
import * as TD from '../../poketactica/js/td/sim.js';
import * as C from '../../poketactica/js/td/cards.js';
import * as H from '../../poketactica/js/td/heroes.js';
import { MAZE_MAPS as BIG_MAPS, MAZE_MAPS_SMALL as MAZE_MAPS } from '../../poketactica/js/td/maps.js';   // (the small maps: the fixtures these checks were written on; the big ones: poketactica_maze_big_test.mjs)
import { tdRecipe, validTdRecipe, tdRunTo } from '../../poketactica/js/td/replay.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';
import { loadData, squadAt } from '../../tools/poketactica/td_auto.mjs';
import { mazeRun } from '../../tools/poketactica/maze_auto.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
const J = JSON.stringify;
const FIELD = MAZE_MAPS[0];
const fig = (sp, lv, moves) => { let f = makeFigurine(sp, lv, makeRng('hero' + sp), data, { id: 'hero-' + sp, shinyRate: 0 }); if (moves) f = equip({ ...f, pool: [...f.pool.filter((p) => !moves.includes(p.id)), ...moves.map((id) => ({ id, lv: 1, xp: 0 }))] }, moves); return { ...f, ability: null, held: null }; };
const run = (hero, o = {}) => TD.newRun(o.seed || 'heroes', { map: o.map || FIELD, squad: o.squad || [fig('blastoise', 60, ['watergun']), fig('pikachu', 60, ['thundershock'])], ...(hero ? { hero } : {}), ...(o.startWave ? { startWave: o.startWave } : {}), ...(o.rev ? { rev: o.rev } : {}) }, data);
const ap = (S, a) => TD.applyInput(S, a, data);
const lay = (S, shape, turns, x, y) => { const c = C.addCard(S, shape); return ap(S, { t: 'block', card: c.id, turns, x, y }); };
const key = (c) => c.shape + (c.bonus ? ':' + c.bonus : '');
const wave = (S, each) => { ap(S, { t: 'call' }); for (let i = 0; i < 20 * 240 && !S.over && (S.phase === 'wave' || i < 2); i++) { TD.step(S, [], data); if (each) each(S); } return S; };

// ---------- the roster
{
	A(H.heroProblems((b) => C.BONUSES.includes(b)).length === 0, 'the hero data is sound: every deck card a real shape, every passive known', H.heroProblems((b) => C.BONUSES.includes(b)));
	A(H.HEROES.map((h) => h.id).join() === 'brock,misty,surge,erika,lance' && H.HEROES.map((h) => h.unlock).join() === '0,10,15,20,25', 'five heroes: Brock free; Misty, Lt. Surge, Erika and Lance open at waves 10, 15, 20, 25');
	A(H.heroOpen(H.heroById('brock'), 0) && !H.heroOpen(H.heroById('misty'), 9) && H.heroOpen(H.heroById('misty'), 10) && !H.heroOpen(H.heroById('lance'), 24) && H.heroOpen(H.heroById('lance'), 25), 'a hero opens when its wave has been cleared in Maze Builder');
	A(new Set(H.HEROES.map((h) => h.passive)).size === 5 && new Set(H.HEROES.map((h) => J(h.deck.map(key).sort()))).size === 5 && H.HEROES.every((h) => h.say && h.title && h.art), 'each has a deck and a signature passive of its own, a title, a line and a picture');
	A(Object.values(H.PASSIVES).every((p) => p.name && p.text) && Object.keys(H.PASSIVES).length >= 30, 'every passive has a name and says what it does', Object.keys(H.PASSIVES).length);
}
// ---------- the deck
for (const h of H.HEROES) {
	const S = run(h.id), n = h.deck.length, got = S.hand.map(key);
	while (got.length < n) got.push(key(C.drawCard(S)));
	const again = []; for (let i = 0; i < n; i++) again.push(key(C.drawCard(S)));
	A(S.hero === h.id && S.passives.join() === h.passive && J([...got].sort()) === J(h.deck.map(key).sort()) && J([...again].sort()) === J(h.deck.map(key).sort()) && J(again) !== J(got), `${h.name}: the run deals ${h.name}'s own ${n} cards, each once, then the same deck shuffled again`, got);
	A(J(run(h.id).hand.map(key)) === J(run(h.id).hand.map(key)) && J(run(h.id, { seed: 'other' }).bag) !== J(run(h.id).bag), `${h.name}: the same seed deals the same hand`);
}
{
	const S = run('brock'), n = S.deck.length;
	S.pick = { pick: 2, opts: [{ k: 'bonus', shape: 'T', bonus: 'ice' }, { k: 'cards', n: 2 }] };
	ap(S, { t: 'pick', i: 0 }); ap(S, { t: 'pick', i: 1, shapes: ['one', 'S'] });
	A(S.deck.length === n + 3 && S.deck.slice(-3).map(key).join() === 'T:ice,one,S', 'reward cards join the hero\'s deck for the rest of the run', S.deck.slice(-3));
	S.bag = []; const next = []; for (let i = 0; i < n + 3; i++) next.push(key(C.drawCard(S)));
	A(next.includes('T:ice') && next.filter((k) => k === 'one').length === 1, 'and come round again with it, bonus and all');
	const P = run(null); P.pick = { pick: 1, opts: [{ k: 'bonus', shape: 'T', bonus: 'ice' }] }; ap(P, { t: 'pick', i: 0 });
	A(!P.deck && !P.hero && !P.passives, 'a run with no hero has no deck: the shared bag, as before');
}
// ---------- the five signatures, played
{
	const B = run('brock'), W = FIELD.rows[0].length;
	lay(B, 'O', 0, 5, 0); lay(B, 'L', 0, 8, 0); lay(B, 'I', 1, 2, 5);
	A(B.B.map.height[0 * W + 5] === 2 && B.B.map.height[5 * W + 2] === 2 && B.B.map.height[0 * W + 8] === 1, 'Brock, Rock Solid: his O and I blocks are two levels up; an L is one');
	const N = run(null); lay(N, 'O', 0, 5, 0);
	A(N.B.map.height[0 * W + 5] === 1 && ap(B, { t: 'unblock', id: 'b0' }) === null && B.B.map.height[0 * W + 5] === 0, 'without him an O is one level; taken back, his goes flat again');

	const M = run('misty'), g = M.gold;
	ap(M, { t: 'discard', card: M.hand[0].id }); ap(M, { t: 'discard', card: M.hand[0].id }); M.gold = g;   // (room in the hand for two)
	A(TD.view(M).drawCost === 0 && ap(M, { t: 'draw' }) === null && M.gold === g && TD.view(M).drawCost === 10 && ap(M, { t: 'draw' }) === null && M.gold === g - 10, 'Misty, Cascade: the first extra card of a round is free; the next costs as ever');

	const E = run('erika');
	A(E.hand.length === 6 && TD.view(E).handMax === 8, 'Erika, Garden: six cards to start, and a hand of 8');
	lay(E, 'I', 1, 4, 0); ap(E, { t: 'place', fig: 0, x: 4, y: 2 }); const eh = E.hand.length; wave(E);
	A(E.cleared === 1 && E.hand.length === Math.min(8, eh + 4), 'and 4 cards a round', [eh, E.hand.length]);

	const cds = (hero) => { const S = run(hero); lay(S, 'I', 1, 4, 0); ap(S, { t: 'place', fig: 0, x: 4, y: 2 }); let cd = 0; wave(S, (R) => { const t = R.towers[0]; if (!cd && t.cd.watergun > R.tick) cd = t.cd.watergun - R.tick; }); return cd; };
	const plain = cds(null), fast = cds('surge');
	A(plain > 0 && fast === Math.max(4, Math.floor(plain * 88 / 100)) && fast < plain, 'Lt. Surge, Lightning Tempo: a move comes back 12% sooner', [plain, fast]);

	const gold = (hero) => { const S = run(hero); lay(S, 'I', 1, 4, 0); ap(S, { t: 'place', fig: 0, x: 4, y: 2 }); const g0 = S.gold; wave(S); return [S.cleared, S.gold - g0 - S.kills, S.lives]; };
	const gp = gold(null), gl = gold('lance');
	A(gp[0] === 1 && gl[0] === 1 && gp[2] === gl[2] && gl[1] === gp[1] + 3, 'Lance, Champion\'s Purse: 3 more gold for a wave cleared', [gp, gl]);
}
// ---------- a boss wave: the pick of three passives
{
	const strong = [fig('blastoise', 90, ['surf', 'watergun']), fig('pikachu', 90, ['thunderbolt']), fig('charizard', 90, ['flamethrower'])];
	const S = run('lance', { startWave: 10, squad: strong });
	lay(S, 'I', 1, 4, 0); lay(S, 'three', 1, 4, 4); S.gold = 500;
	ap(S, { t: 'place', fig: 0, x: 4, y: 2 }); ap(S, { t: 'place', fig: 1, x: 4, y: 3 }); ap(S, { t: 'place', fig: 2, x: 4, y: 4 });
	const g0 = S.gold; wave(S);
	const lance = H.heroById('lance');
	A(S.cleared === 10 && S.perks && S.perks.length === 3 && S.perks.filter((id) => lance.pool.includes(id)).length >= 2 && S.perks.every((id) => lance.pool.includes(id) || H.SHARED.includes(id)) && new Set(S.perks).size === 3 && !S.perks.includes('champion'), 'after a boss wave the hero is offered three passives: at least two from their own list, the rest from everyone\'s', { cleared: S.cleared, perks: S.perks, lives: S.lives });
	A(S.gold - g0 - S.kills * 1 >= 10 + 10 + 3 + 15, 'and Lance\'s boss wave paid 15 gold more', S.gold - g0);
	A(J(TD.view(S).perks) === J(S.perks) && J(H.perksOf('heroes', 10, 'lance', ['champion'])) === J(S.perks), 'the offer is the seed\'s: the same in the view, and worked out again');
	while (S.pick) ap(S, { t: 'pick', i: S.pick.opts.findIndex((o) => o && o.k !== 'cards') });
	A(ap(S, { t: 'call' }) === 'pick a passive first' && ap(S, { t: 'perk', i: 7 }) === 'no such passive', 'the next wave waits for the pick');
	const took = S.perks[1], snap = JSON.parse(J(TD.toSnapshot(S)));
	A(ap(S, { t: 'perk', i: 1 }) === null && S.passives.join() === 'champion,' + took && S.perks === null && ap(S, { t: 'perk', i: 0 }) === 'no such passive' && ap(S, { t: 'call' }) === null, 'picked: it is the run\'s for good; one pick; the wave can be called', S.passives);
	const R = TD.fromSnapshot(snap); ap(R, { t: 'perk', i: 1 }); ap(R, { t: 'call' });
	A(TD.hashOf(R) === TD.hashOf(S), 'a snapshot taken with the pick waiting plays on to the same run');
	A(!H.perksOf('heroes', 20, 'lance', S.passives).includes(took) && H.perksOf('x', 10, 'lance', [...lance.pool, ...H.SHARED]).length === 0 && H.perksOf('x', 10, 'nobody', []).length === 0, 'a passive is never offered twice; when the lists run out, nothing is offered');
	const N = run(null, { startWave: 10, squad: strong }); lay(N, 'I', 1, 4, 0); lay(N, 'three', 1, 4, 4); N.gold = 500; ap(N, { t: 'place', fig: 0, x: 4, y: 2 }); ap(N, { t: 'place', fig: 1, x: 4, y: 3 }); ap(N, { t: 'place', fig: 2, x: 4, y: 4 }); wave(N);
	A(N.cleared === 10 && !N.perks && N.pick, 'a run with no hero is offered none (its rewards as before)');
}
// ---------- every other passive, played
{
	const base = () => { const S = run('brock'); return S; };
	const withP = (...ids) => { const S = base(); S.passives.push(...ids); return S; };
	// type badges: a hit of that type lands 15% harder
	// (wave 8's enemies against a Lv 30 Blastoise: they take more than one hit)
	const tough = (id) => { const R = run('brock', { startWave: 8, squad: [fig('blastoise', 30, ['watergun'])] }); R.passives.push(id); return R; };
	const S = tough('water'); lay(S, 'I', 1, 4, 0); ap(S, { t: 'place', fig: 0, x: 4, y: 2 });
	let ok = 0, bad = 0, last = null;
	wave(S, (R) => { for (const e of R.ev) { if (e.t === 'hit') last = e; else if (e.t === 'hurt' && e.why === 'badge') { if (last && last.type === 'Water' && e.uid === last.target && e.n === Math.min(last.hp, Math.floor(last.dmg * 15 / 100))) ok++; else bad++; } } });
	A(ok >= 2 && bad === 0, 'Water Badge: each Water hit lands 15% harder (the extra is a hit\'s own, on the one it hit)', { ok, bad });
	const E = tough('electric'); lay(E, 'I', 1, 4, 0); ap(E, { t: 'place', fig: 0, x: 4, y: 2 }); let other = 0; wave(E, (R) => { for (const e of R.ev) if (e.t === 'hurt' && e.why === 'badge') other++; });
	A(other === 0, 'an Electric Badge does nothing for a Water move');
	A(Object.entries(H.PASSIVES).filter(([, p]) => p.type).every(([, p]) => Object.values(p.type)[0] === 15 && data.moves && Object.keys(p.type).length === 1) && Object.entries(H.PASSIVES).filter(([, p]) => p.type).length === 14, 'fourteen type badges, 15% each');
	// gold
	const g = (ids) => { const R = withP(...ids); lay(R, 'I', 1, 4, 0); ap(R, { t: 'place', fig: 0, x: 4, y: 2 }); const g0 = R.gold; wave(R); return [R.gold - g0, R.kills]; };
	const g0 = g([]), gp = g(['purse']), gb = g(['bounty']);
	A(gp[0] === g0[0] + 4 && gb[0] === g0[0] + gb[1] && gb[1] === g0[1] && gb[1] > 0, 'Deep Pockets: 4 more gold a wave. Bounty: 1 more a knockout', [g0, gp, gb]);
	// cards and prices
	const v0 = TD.view(base()), v = TD.view(withP('bighand', 'bargain', 'recruiter', 'crane'));
	A(v.handMax === v0.handMax + 2 && v.drawCost === v0.drawCost - 3 && v.placeCost === v0.placeCost - 5 && v.liftCost === v0.liftCost - 10, 'Big Hand, Bargain, Recruiter, Crane: a hand of 2 more; a card 3 less; a figurine 5 less; Lift 10 less', [v0.handMax, v.handMax, v.drawCost, v.placeCost, v.liftCost]);
	const D = withP('dealer'); lay(D, 'I', 1, 4, 0); ap(D, { t: 'place', fig: 0, x: 4, y: 2 }); while (D.hand.length > 1) ap(D, { t: 'discard', card: D.hand[0].id }); wave(D);
	A(D.hand.length === 1 + 4, 'Dealer: 4 cards a round', D.hand.length);
	const Sc = withP('scrap'), sg = Sc.gold; ap(Sc, { t: 'discard', card: Sc.hand[0].id });
	A(Sc.gold === sg + 5, 'Scrap: a discard pays 5');
	const Pl = withP('recruiter'); lay(Pl, 'I', 1, 4, 0); const pg = Pl.gold; ap(Pl, { t: 'place', fig: 0, x: 4, y: 2 });
	A(pg - Pl.gold === 15 && Pl.towers[0].cost === 15, 'Recruiter: the first figurine costs 15 (and its recall pays by that)');
	// lives
	const Hh = base(); Hh.perks = ['heart']; Hh.lives = 18; ap(Hh, { t: 'perk', i: 0 });
	A(Hh.lives === 21 && TD.maxLives(Hh) === 23 && TD.view(Hh).maxLives === 23, 'Big Heart: 3 lives at once, and the limit is 23');
	Hh.pick = { pick: 1, opts: [{ k: 'life' }] }; Hh.lives = 23; ap(Hh, { t: 'pick', i: 0 });
	A(Hh.lives === 23, 'never past it');
	// moves and SP
	const cd = (ids) => { const R = withP(...ids); lay(R, 'L', 0, 8, 0); ap(R, { t: 'place', fig: 0, x: 8, y: 1 }); let c = 0; wave(R, (X) => { const t = X.towers[0]; if (!c && t && t.cd.watergun > X.tick) c = t.cd.watergun - X.tick; }); return c; };
	const c0 = cd([]), c1 = cd(['quick']);
	A(c0 > 0 && c1 === Math.max(4, Math.floor(c0 * 92 / 100)), 'Quick Hands: a move comes back 8% sooner', [c0, c1]);
	const sp = (ids) => { const R = withP(...ids); lay(R, 'L', 0, 8, 0); ap(R, { t: 'place', fig: 0, x: 8, y: 1 }); const u = R.B.units.find((x) => x.uid === 't0'); u.sp = 0; for (let i = 0; i < 100; i++) TD.step(R, [], data); return [u.sp, u.maxSP]; };
	const s0 = sp([]), s1 = sp(['focus']);
	A(s0[0] > 0 && s1[0] > s0[0] && Math.abs(s1[0] - s0[0] * 1.5) <= 2, 'Focus: SP comes back half as fast again', [s0, s1]);
	// the hold limit
	const hold = (ids) => { const R = withP(...ids); ap(R, { t: 'call' }); while (!R.enemies.length) TD.step(R, [], data); const e = R.enemies[0]; let n = 0; for (let i = 0; i < 200; i++) { e.stop = R.tick + 1000; const d = e.d; TD.step(R, [], data); if (e.d > d) break; n++; } return n; };
	A(hold([]) === 59 && hold(['grip']) === 79, 'Grip: an enemy can be held for 4 seconds, not 3', [hold([]), hold(['grip'])]);
	const played = new Set(['rocksolid', 'cascade', 'tempo', 'garden', 'champion', 'purse', 'bounty', 'bighand', 'dealer', 'bargain', 'recruiter', 'crane', 'scrap', 'heart', 'focus', 'grip', 'quick']);
	A(Object.keys(H.PASSIVES).every((id) => played.has(id) || H.PASSIVES[id].type), 'every passive in the game is played above (or is a type badge)', Object.keys(H.PASSIVES).filter((id) => !played.has(id) && !H.PASSIVES[id].type));
}
// ---------- replays; old runs
{
	const S = run('misty', { map: BIG_MAPS[0] }), inputs = [];   // (a recipe names its map by id: today's rules play the big one)
	const ord = (a) => { const why = ap(S, a); if (!why) inputs.push([S.tick, a]); return why; };
	ord({ t: 'draw' }); ord({ t: 'block', card: S.hand.find((c) => c.shape === 'three').id, turns: 1, x: 4, y: 0 }); ord({ t: 'place', fig: 0, x: 4, y: 1 }); ord({ t: 'call' });
	for (let i = 0; i < 20 * 120 && (S.phase === 'wave' || S.wave < 1); i++) TD.step(S, [], data);
	ord({ t: 'pick', i: S.pick.opts.findIndex((o) => o && o.k !== 'cards') });
	const rec = tdRecipe({ seed: 'heroes', mapId: FIELD.id, squad: S.squad, inputs, end: S.tick, wave: S.cleared, hero: 'misty' });
	A(validTdRecipe(rec) && rec.hero === 'misty' && rec.rev === TD.TD_RULES_REV && /Maze Builder · Open Field · Misty · wave 1/.test(rec.label), 'a hero run\'s recipe names its hero', rec.label);
	A(TD.hashOf(tdRunTo(rec, null, data)) === TD.hashOf(S), 'and replays to the very same run');
	A(!validTdRecipe({ ...rec, hero: 'giovanni' }) && validTdRecipe({ ...rec, hero: undefined }), 'a recipe with a hero that does not exist is refused');
	const old = run('misty', { rev: 12 });
	A(!old.hero && !old.deck && old.hand.length === 5, 'a run recorded under rules 12 has no hero, whatever is asked: it replays as it was played');
	// the fingerprints of three no-hero runs, recorded before heroes existed
	const PIN = [['mz-field', 3851, 7, '04e7b055'], ['mz-pincer', 4598, 9, 'c4188002'], ['mz-lake', 6000, 9, '8fb8504a']];
	const got = MAZE_MAPS.map((m) => { const r = mazeRun('hero-pin', m, squadAt(18, 12, data), data, 6000, 'maze', null, null, 13); return [m.id, r.ticks, r.wave, r.hash]; });
	A(J(got) === J(PIN), 'a run with no hero, under rules 13, plays tick for tick as it did before heroes and before the enemy kinds (three maps, by fingerprint)', got);
	const a = mazeRun('h-auto', FIELD, squadAt(18, 12, data), data, 6000, 'maze', null, 'brock'), b = mazeRun('h-auto', FIELD, squadAt(18, 12, data), data, 6000, 'maze', null, 'brock'), c = mazeRun('h-auto', FIELD, squadAt(18, 12, data), data, 6000, 'maze', null, 'lance');
	A(a.hash === b.hash && a.hash !== c.hash, 'the same hero and seed, the same run; another hero, another run');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
