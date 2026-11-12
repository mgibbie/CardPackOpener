// micasurvivor_m3d_explevel_test.mjs — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): an Expedition run's own
// level-ups (micasurvivor/m3d/explevel.js), in node, with the 2D game's tables and functions. The state checks of the
// 2D suite micasurvivor_expedition_levelups_test.mjs, made of the 3D run.
//   * the XP curve is Expedition's (2 x (8 + 5.5 L + L^1.8)), not the base game's
//   * rarity: the 2D odds; Rare and above are gated by your level, luck and zone
//   * a level's cards: three, a move card always among them and first, from the run's own seeded stream
//   * a move's levels: 1 to 8, + 8 % damage a level, plus the card's rolls; at 8 it is offered no more
//   * a free slot is offered a move of your types; with four, a rare swap card replaces your lowest-level move in place
//   * vitamins: three slots, ten levels, a card's rarity multiplies the level; each stat lands where it acts (damage by
//     class and type, armour, HP, speed, cooldown, crit, regeneration, XP, reach, luck, projectiles, area, duration,
//     status chance)
//   * in a fight: a dodge (never above 40 %), the shield that soaks a hit and is back 4 s later, lifesteal paid back
//     slowly, the Cursed Incense's tougher enemies
//   * Training when nothing else is left: less each time, never under a third
//   * the tools: Refresh twice, Skip twice (10 x zone of the run's money), Banish once
//   * in the run: a level-up stops the fight until a card is taken
//   node overworld/tests/micasurvivor_m3d_explevel_test.mjs
import { dataFrom, drop, hazard, choose, xpFor, CK, U } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun, spawn } from '../../micasurvivor/m3d/expedition.js';
import { offerCards, candidates, moveCands, swapOut, trainCards, total, levelOf, refresh, skip, banish } from '../../micasurvivor/m3d/explevel.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const G = loadG(), data = dataFrom(G), X = expFrom(G), L = X.L, K = L.K;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const run = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 6, moves: ['ember'], weather: false, ...o }); S.plan.events = []; S.acc = -1e9; return S; };
const steps = (S, sec) => { for (let i = 0, n = Math.round(sec * 60); i < n; i++) { S.acc = -1e9; stepRun(S, null); } return S; };
const take = (S, id, ti = 0) => L.I.takeVitamin(S.w.pl, id, ti);
const mv = (S, id) => S.w.pl.moves.find((m) => m.id === id);

// ---------------------------------------------------------------- the curve and the odds
{
	const S = run(), pl = S.w.pl;
	const want = (lv) => Math.round(2 * (8 + 5.5 * lv + Math.pow(lv, 1.8)));
	A(pl.xpNext === want(1) && L.need(10) === want(10) && L.need(1) !== xpFor(1) && G.ExpLevel.need(25) === L.need(25), `the XP a level needs is Expedition's curve (${want(1)} for level 2, ${want(10)} at level 10), not the base game's (${xpFor(1)})`, [pl.xpNext, want(1)]);
	const s = pl.s; drop(S.w, 'xp', s.x, s.y + 0.5, s.z, want(1) + want(2) + 5); steps(S, 0.2);
	A(pl.level === 3 && pl.pending === 2 && pl.choices && pl.choices.length === 3, 'enough XP for two levels: the first level-up is up, three cards, and the fight waits', [pl.level, pl.pending]);
	const t = S.w.t; steps(S, 0.5);
	A(S.w.t === t, 'nothing moves while you choose');
	choose(S.w, 0); stepRun(S, null);
	A(pl.pending === 1 && pl.xpNext === want(3) && pl.choices && pl.choices.length === 3, 'one taken: the second level\'s cards come up at once, and the next level needs the curve\'s ' + want(3));
	choose(S.w, 0); steps(S, 0.2);
	A(S.w.t > t && !pl.choices && S.lv.log.length === 2, 'both taken: the fight goes on');
	const o1 = L.odds({ level: 1, luck: 0, zone: 1 }), o2 = L.odds({ level: 30, luck: 0, zone: 3 }), o3 = L.odds({ level: 30, luck: 100, zone: 3 });
	A(o1[2] === 0 && o1[3] === 0 && o1[4] === 0 && near(o1[0] + o1[1], 1) && near(o1[0], 70 / 94), `at level 1 in zone 1 a card is Common (${(o1[0] * 100).toFixed(0)} %) or Uncommon, never more`, o1);
	A(o2[2] > 0 && o2[3] > 0 && o2[4] > 0 && near(o2[4], 0.12 / 100.02, 0.01) && o3[4] > o2[4] * 10, `at level 30 in zone 3 every rarity is open (Legendary ${(o2[4] * 100).toFixed(2)} %); 100 luck makes it ${(o3[4] / o2[4]).toFixed(0)} times as likely`, [o2, o3]);
}

// ---------------------------------------------------------------- the deal
{
	const deal = (seed, o = {}) => { const S = run({ seed, ...o }); S.w.pl.level = o.level || 5; return offerCards(S); };
	const a = deal(11), b = deal(11), c = deal(12);
	const sig = (cs) => cs.map((q) => q.key + '/' + q.tier + '/' + (q.rolls || []).join('+')).join(' ');
	A(a.length === 3 && sig(a) === sig(b) && sig(a) !== sig(c), 'a level\'s three cards come from the run\'s seed: the same run the same cards, another run others', [sig(a), sig(c)]);
	let always = true, first = true, tiers = [0, 0, 0, 0, 0], n = 0, kinds = new Set();
	for (let seed = 1; seed <= 300; seed++) { const cs = deal(seed, { level: 30 }); if (!cs.some((q) => q.kind === 'move')) always = false; if (cs[0].kind !== 'move') first = false; for (const q of cs) { tiers[q.tier]++; n++; kinds.add(q.kind + ':' + q.type); } if (new Set(cs.map((q) => q.key)).size !== cs.length) always = false; }
	const odds = L.odds({ level: 30, luck: 0, zone: 1 });
	A(always && first, 'over 300 runs: a move card is always among the three, and first; no card twice');
	A(near(tiers[0] / n, odds[0], 0.08) && near(tiers[1] / n, odds[1], 0.2) && tiers[2] > 0, `their rarities follow the odds (Common ${(tiers[0] / n * 100).toFixed(0)} % of ${n}, expected ${(odds[0] * 100).toFixed(0)} %)`, tiers);
	A(kinds.has('move:up') && kinds.has('move:new') && kinds.has('vit:new'), 'with one move and no vitamins: a move\'s next level, new moves, new vitamins', [...kinds]);
	const S = run(), W = K.W, cs = candidates(S), sum = (k) => cs.filter((q) => q.key.startsWith(k)).reduce((x, q) => x + q.w, 0);
	A(sum('up:') === W.up && cs.filter((q) => q.key.startsWith('new:')).every((q) => q.w === W.newMove) && cs.filter((q) => q.key.startsWith('vit:')).length === 21 && cs.filter((q) => q.key.startsWith('vit:')).every((q) => q.w === W.newVit), `the weights are the 2D game's: a move's level ${W.up}, a new move ${W.newMove}, a new vitamin ${W.newVit} (all 21 on offer)`);
}

// ---------------------------------------------------------------- a move's levels
{
	const S = run({ moves: [['ember', 3], 'tackle'] }), pl = S.w.pl, e = mv(S, 'ember'), t = mv(S, 'tackle'), b = e.x.b.dmg;
	A(levelOf(e) === 3 && levelOf(t) === 1 && near(e.dmg, b * (1 + 0.08 * 2)) && pl.moves.length === 2, `a move given at level 3 starts there: + 16 % damage (${e.dmg.toFixed(2)} from ${b.toFixed(2)})`);
	const card = candidates(S).find((q) => q.key === 'up:ember').make(0, () => 0.01);
	A(card.type === 'up' && card.rolls.length === L.MK.ROLLS && /Lv 3 > 4/.test(card.tag) && /\+8% damage/.test(card.desc), `its card: "${card.tag}", ${card.desc}`, card);
	const cd0 = e.cd, r = Object.fromEntries(card.rolls); card.apply();
	A(levelOf(e) === 4 && near(e.dmg, b * (1 + 0.08 * 3) * (1 + (r.dmg || 0))) && near(e.cd, e.x.b.cd * Math.max(L.MK.CD_FLOOR, 1 - (r.cd || 0))) && e.cd <= cd0 && S.lv.log[0][1] === 'up', `taken: level 4, the level's 8 % and the card's rolls (${card.rolls.map((q) => q.join(' ')).join(', ')})`, [e.dmg, e.cd]);
	const epic = candidates(S).find((q) => q.key === 'up:ember').make(3, () => 0.5);
	A(epic.rolls.length === L.MK.ROLLS_EPIC && epic.rarName === 'epic' && epic.rolls.every(([k, v]) => k === 'count' ? v === 2 : near(v, Math.min(k === 'cd' ? L.MK.ROLL.cdMax : 9, L.MK.ROLL[k] * L.RAR_MUL[3]))), `an Epic card has three rolls, each ${L.RAR_MUL[3]} times a Common's`, epic.rolls);
	while (levelOf(e) < 8) L.M.levelUp(pl, e, []);
	A(!candidates(S).some((q) => q.key === 'up:ember') && candidates(S).some((q) => q.key === 'up:tackle') && L.M.levelUp(pl, e, []) === false, 'at level 8 a move is offered no more');
}

// ---------------------------------------------------------------- new moves and swaps
{
	const S = run({ dex: 6 }), pl = S.w.pl, cands = moveCands(S);
	const types = cands.map((id) => L.def(id).type), expOnes = cands.filter((id) => G.ExpMoves.isExpMove(id));
	A(cands.length > 5 && types.every((t) => ['fire', 'flying'].includes(t)) && !cands.includes('ember') && expOnes.length >= 1, `a Charizard can learn ${cands.length} moves: Fire and Flying ones only, Expedition's own among them (${expOnes.join(', ')})`, cands);
	const nc = candidates(S).find((q) => q.key === 'new:' + cands[0]).make(2, () => 0.3);
	nc.apply();
	const m = mv(S, cands[0]);
	A(pl.moves.length === 2 && m && levelOf(m) === 1 && nc.rolls.length === 2 && Object.values(m.x.r).some((v) => v > 0), 'a new move at Rare comes at level 1 with a level\'s worth of rolls already on it', [nc.rolls, m && m.x.r]);
	// one buff or weather move at most
	const S2 = run({ dex: 6, moves: ['ember', 'sunny-day'] });
	A(!moveCands(S2).some((id) => ['buff', 'weather'].includes(L.def(id).kind)) && moveCands(S).some((id) => ['buff', 'weather'].includes(L.def(id).kind)), 'with a buff or weather move already, no other is offered');
	// four moves: swaps
	const four = moveCands(S).slice(0, 2), S4 = run({ dex: 6, moves: [['ember', 4], ['wing-attack', 2], four[0] === 'wing-attack' ? four[1] : four[0], ['flamethrower', 3]].map((q) => q) });
	const p4 = S4.w.pl, low = swapOut(S4), cs = candidates(S4), sw = cs.filter((q) => q.key.startsWith('swap:'));
	A(p4.moves.length === 4 && !cs.some((q) => q.key.startsWith('new:')) && sw.length > 0 && near(sw.reduce((a, q) => a + q.w, 0), K.W.swap) && low === p4.moves[2] && levelOf(low) === 1, `with four moves no new one is offered: swap cards instead, rare (their whole weight ${K.W.swap} against ${K.W.up} for each move's level), for your lowest-level move (${low.id})`, [p4.moves.map((q) => q.id + levelOf(q)), sw.length]);
	S4.w.orbs.push({ mid: low.id }, { mid: 'ember' });
	const card = sw[0].make(0, () => 0.5), incoming = card.id; card.apply();
	A(card.type === 'swap' && card.swapOut === low.id && p4.moves.length === 4 && p4.moves[2].id === incoming && !p4.moves.includes(low) && S4.w.orbs.length === 1 && S4.lv.log[0][1] === 'swap', `taken: ${incoming} is in ${low.id}'s slot, the other three where they were`, p4.moves.map((q) => q.id));
}

// ---------------------------------------------------------------- vitamins
{
	const S = run({ moves: ['ember', 'tackle', 'swift'] }), pl = S.w.pl, e = mv(S, 'ember'), t = mv(S, 'tackle'), sw = mv(S, 'swift');
	const e0 = e.dmg, t0 = t.dmg, hp0 = pl.maxHp, cd0 = pl.cdMul, sp0 = pl.spdMul, mg0 = pl.magnet, xp0 = pl.xpMul;
	take(S, 'protein');
	A(near(t.dmg, t0 * 1.10) && e.dmg === e0 && near(total(S, 'phys'), 0.10), 'Protein: + 10 % to physical moves (Tackle), nothing to special ones (Ember)', [t.dmg / t0, e.dmg / e0]);
	take(S, 'calcium', 3);
	A(near(e.dmg, e0 * (1 + 0.10 * 1.75)) && near(t.dmg, t0 * 1.10), `Calcium from an Epic card: + ${(10 * 1.75).toFixed(1)} % to special moves`, e.dmg / e0);
	take(S, 'hpup');
	A(pl.maxHp === hp0 + 18 && pl.xv.length === 3 && !candidates(S).some((q) => q.key.startsWith('vit:') && !['vit:protein', 'vit:calcium', 'vit:hpup'].includes(q.key)) && take(S, 'iron') === null, 'HP Up: + 18 max HP. Three vitamins fill the three slots: no fourth is offered or can be taken');
	take(S, 'protein'); take(S, 'protein');
	A(L.I.vitOf(pl, 'protein').lvl === 3 && near(t.dmg, t0 * 1.30), 'a vitamin you have goes up a level each time: three Proteins, + 30 % (they add)');
	for (let i = 0; i < 12; i++) take(S, 'protein');
	A(L.I.vitOf(pl, 'protein').lvl === 10 && !candidates(S).some((q) => q.key === 'vit:protein') && candidates(S).some((q) => q.key === 'vit:hpup' && q.w === K.W.vitUp), 'a vitamin stops at level 10, and is offered no more');
	// each stat lands where it acts
	const each = (id, n = 1) => { const R = run({ moves: ['ember', 'tackle', 'swift', 'thunder'] }); for (let i = 0; i < n; i++) take(R, id); return R; };
	const base = each('nugget', 0).w.pl;
	let R = each('iron'); A(near(R.w.pl.baseReduce, 0.05), 'Iron: 5 armour, 5 % less damage taken');
	R = each('iron', 10); for (let i = 0; i < 3; i++) R.w.pl.xtr.n; A(near(R.w.pl.baseReduce, 0.5), 'armour stops at 50 %');
	R = each('carbos'); A(near(R.w.pl.spdMul, sp0 * 1.07), 'Carbos: + 7 % speed');
	R = each('ether'); A(near(R.w.pl.cdMul, cd0 / 1.08), 'Ether: + 8 % attack speed (cooldowns ÷ 1.08)');
	R = each('direhit'); A(near(R.w.pl.crit, base.crit + 0.05), 'Dire Hit: + 5 % crit');
	R = each('moomoo'); A(near(R.w.pl.baseRegen, base.baseRegen + 0.5), 'Moomoo Milk: + 0.5 HP a second');
	R = each('expshare'); A(near(R.w.pl.xpMul, xp0 * 1.06), 'Exp. Share: + 6 % XP');
	R = each('itemfinder'); A(near(R.w.pl.magnet, mg0 * 1.15), 'Itemfinder: + 15 % pickup reach');
	R = each('luckypunch'); A(R.w.pl.xluck === 8 && L.odds({ level: 20, luck: 8, zone: 1 })[1] > L.odds({ level: 20, luck: 0, zone: 1 })[1], 'Lucky Punch: + 8 luck, and luck lifts the cards\' rarity');
	R = each('ppup', 2); A(mv(R, 'swift').count === mv(S, 'swift').count + 1 && mv(each('ppup'), 'swift').count === sw.count, 'PP Up: half a projectile a level (two levels: Swift fires one more)');
	R = each('xspeed'); A(near(mv(R, 'ember').speed, mv(base ? each('nugget', 0) : R, 'ember').speed * 1.12), 'X Speed: + 12 % projectile speed');
	R = each('bigmushroom'); A(near(mv(R, 'tackle').radius, mv(each('nugget', 0), 'tackle').radius * 1.08), 'Big Mushroom: + 8 % area');
	R = each('xaccuracy'); A(near(mv(R, 'thunder').ccp, mv(each('nugget', 0), 'thunder').ccp * 1.12), 'X Accuracy: + 12 % chance of a state (Thunder\'s paralysis)');
	const Sb = run({ moves: ['ember', 'swords-dance'] }), d0 = mv(Sb, 'swords-dance').dur; take(Sb, 'ppmax');
	A(d0 > 0 && near(mv(Sb, 'swords-dance').dur, d0 * 1.10), 'PP Max: + 10 % duration (Swords Dance)');
	R = each('nugget'); A(near(R.w.pl.coinMul, 1.10), 'Nugget: + 10 % of the run\'s money');
}

// ---------------------------------------------------------------- the stats that act in a fight
{
	const hit = (S, dmg = 40) => { const s = S.w.pl.s, hp = S.w.pl.hp; S.w.pl.invuln = 0; hazard(S.w, { kind: 'zone', x: s.x, y: s.y, z: s.z, r: 3, delay: 0, dmg, type: null }); steps(S, 0.05); return hp - S.w.pl.hp; };
	const tough = () => { const R = run(); R.w.pl.maxHp = R.w.pl.hp = 1e6; steps(R, 0.1); return R; };
	const S = tough();
	const plain = hit(S);
	A(plain === 40, 'a mark on the ground for 40 takes 40');
	take(S, 'zinc'); steps(S, 4.1);
	A(S.w.pl.xproc.shield === 12, 'Zinc: a shield of 12, up after 4 s unhurt');
	const d1 = hit(S), d2 = hit(S);
	A(near(d1, 28, 0.02) && near(d2, 40, 0.02) && S.w.pl.xproc.shield === 0, `the shield soaks the first 12 of a hit (${d1.toFixed(0)} taken), and is then spent (${d2.toFixed(0)})`, [d1, d2]);
	steps(S, 3); const early = S.w.pl.xproc.shield; steps(S, 1.2);
	A(early === 0 && S.w.pl.xproc.shield === 12, '4 s after the last hit it is back');
	const small = hit(S, 8);
	A(small === 0 && near(S.w.pl.xproc.shield, 4), 'a hit smaller than the shield does nothing to you');
	// a dodge
	const D = tough(); for (let i = 0; i < 10; i++) take(D, 'xdefense');
	let dodged = 0; for (let i = 0; i < 400; i++) if (hit(D, 5) === 0) dodged++;
	A(near(total(D, 'evade'), 0.35) && near(dodged / 400, 0.35, 0.2), `X Defense at level 10: 35 % of hits dodged (${dodged} of 400)`);
	D.w.pl.xv.find((q) => q.id === 'xdefense').v = 0.9;   // (far more evasion than a run can reach)
	dodged = 0; for (let i = 0; i < 400; i++) if (hit(D, 5) === 0) dodged++;
	A(near(dodged / 400, 0.4, 0.2) && dodged < 400 * 0.55, `however much evasion, never more than 40 % (${dodged} of 400)`);
	// lifesteal
	const Ls = run(); steps(Ls, 0.1); take(Ls, 'energyroot'); const pl = Ls.w.pl; pl.maxHp = 200; pl.hp = 100;
	Ls.w.hooks.dealt(Ls.w, 500);
	A(near(pl.xproc.steal, 5), 'Energy Root: 1 % of the damage you do is banked (500 done, 5 banked)');
	Ls.w.hooks.dealt(Ls.w, 5000);
	A(near(pl.xproc.steal, 10), '…never more than 5 % of your HP at once');
	steps(Ls, 0.5);
	A(near(pl.hp, 105, 0.01), `and it is paid back at 5 % of your HP a second (${(pl.hp - 100).toFixed(1)} in half a second)`, pl.hp);
	// the curse
	const C = run(); steps(C, 0.1); const dex = C.plan.cards[0], a = spawn(C, dex, C.w.pl.s.x + 8, C.w.pl.s.z), xp0 = C.w.pl.xpMul;
	take(C, 'cursed'); take(C, 'cursed');
	const b = spawn(C, dex, C.w.pl.s.x + 8, C.w.pl.s.z);
	A(near(b.maxHp / a.maxHp, 1.24, 0.01) && near(b.dmg / a.dmg, 1.24) && near(C.w.pl.xpMul, xp0 * 1.12) && near(C.w.pl.coinMul, 1.12), 'Cursed Incense, two levels: enemies have 24 % more HP and damage; you get 12 % more XP and money', [b.maxHp / a.maxHp, C.w.pl.xpMul]);
}

// ---------------------------------------------------------------- Training
{
	const S = run(), pl = S.w.pl, [dmg, hp, rest] = trainCards(S), atk0 = pl.atkMul, hp0 = pl.maxHp;
	dmg.apply(); A(near(pl.atkMul, atk0 * 1.04) && pl.xtr.n === 1, 'Training: + 4 % damage');
	const [, hp2] = trainCards(S); hp2.apply();
	A(pl.maxHp === hp0 + Math.round(10 / 1.15) && /\+9 max HP/.test(hp2.desc), `the second is worth less (+ ${Math.round(10 / 1.15)} HP, not 10)`, hp2.desc);
	pl.xtr.n = 40; const [d3] = trainCards(S);
	A(/\+1\.3% damage/.test(d3.desc), 'but never under a third of the first (' + d3.desc + ')');
	pl.hp = 10; rest.apply(); A(near(pl.hp, 10 + pl.maxHp * 0.4), 'a rest heals 40 %');
	// when there is nothing left to offer
	for (const m of pl.moves) while (levelOf(m) < 8) L.M.levelUp(pl, m, []);
	for (const id of ['protein', 'calcium', 'iron']) for (let i = 0; i < 10; i++) take(S, id);
	const full = run({ moves: ['ember', 'flamethrower', 'wing-attack', 'fire-spin'] }); for (const m of full.w.pl.moves) while (levelOf(m) < 8) L.M.levelUp(full.w.pl, m, []);
	for (const id of ['protein', 'calcium', 'iron']) for (let i = 0; i < 10; i++) take(full, id);
	const left = offerCards(full);
	A(left.length >= 1 && left.every((q) => q.kind === 'train' || q.type === 'swap'), 'everything at its top: only a swap, or Training, is left to offer', left.map((q) => q.key));
}

// ---------------------------------------------------------------- the tools
{
	const S = run({ seed: 5 }), pl = S.w.pl, s = pl.s;
	A(S.lv.refreshes === 2 && S.lv.skips === 2 && S.lv.bans === 1 && !refresh(S) && !skip(S) && !banish(S, 0), 'a run has two Refreshes, two Skips and one Banish; with no cards up they do nothing');
	drop(S.w, 'xp', s.x, s.y + 0.5, s.z, 400); steps(S, 0.2);
	const k0 = pl.choices.map((q) => q.key).join(), pend = pl.pending;
	A(refresh(S) && pl.choices.map((q) => q.key).join() !== k0 && pl.choices.length === 3 && pl.pending === pend, 'Refresh: three other cards for the same level');
	A(refresh(S) && !refresh(S) && S.lv.refreshes === 0, 'twice, then no more');
	const i = pl.choices.findIndex((q) => q.xban), gone = pl.choices[i].xban;
	A(banish(S, i) && S.lv.bans === 0 && S.lv.banned.has(gone) && !candidates(S).some((q) => q.key === 'new:' + gone || q.key === 'vit:' + gone.slice(2)) && !banish(S, pl.choices.findIndex((q) => q.xban)), `Banish: ${gone} is never offered again this run; once`);
	const up = pl.choices.findIndex((q) => q.type === 'up' && q.kind === 'move');
	A(up < 0 || !pl.choices[up].xban, 'a move you already have cannot be banished');
	const lv = pl.level;
	A(skip(S) && S.lv.coins === 10 && pl.pending === pend - 1 && pl.level === lv && S.lv.log.some((q) => q[1] === 'skip'), 'Skip: no card, 10 of the run\'s money in zone 1');
	S.zone = 3; stepRun(S, null);
	A(pl.choices && skip(S) && S.lv.coins === 40 && !skip(S), 'in zone 3 a Skip pays 30; twice, then no more', [S.lv.coins, S.lv.skips]);
	S.zone = 1;
}

// ---------------------------------------------------------------- the base game's level-ups stay where they were
{
	const S = newRun(data, X, { seed: 7, dex: 6, moves: [['ember', 2]], levels: false });
	A(!S.lv && S.w.pl.xpNext === xpFor(1) && !S.w.offerCards && S.w.pl.moves[0].lvl === 2, 'a run asked for without them keeps the base game\'s curve and cards');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
