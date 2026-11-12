// micasurvivor_m3d_expperks_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.49): the upgrades
// bought for a Pokémon's family, on a 3D run (micasurvivor/m3d/expperks.js), in node, with the 2D game's OWN table
// (js/data/upgrades.js) and families (js/data/families.js) read as they are.
//   * the levels are the family's: the best of each among its stages; a hand-edited level gives no more than the max
//   * a run starts with their stats: HP, damage, speed, cooldown, defence, regen, reach, XP, crit, size
//   * + Refresh and + Banish (never above the cap); the vetoed moves never come on the cards
//   * Second chance: when you fall you are back at full HP, 2.5 s unhurt, what is near is thrown back; a heart a level
//   * the TM: the move you picked in place of the kit's first (a pick that is not allowed: the kit's own);
//     Repertoire: the kit's second move from level 1
//   * a save with no upgrades, and a run given none, is the run as it was
//   node overworld/tests/micasurvivor_m3d_expperks_test.mjs
import { dataFrom, addEnemy, attackOf, hashWorld, canFire, U } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun } from '../../micasurvivor/m3d/expedition.js';
import { offerCards, moveCands } from '../../micasurvivor/m3d/explevel.js';
import { processLeague } from '../../micasurvivor/m3d/expleague.js';
import { levelsOf, familyPick, tmPool, perksOf } from '../../micasurvivor/m3d/expperks.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

const G = loadG(), data = dataFrom(G), X = expFrom(G), LG = G.ExpLeague;
const mk = (perks, o = {}) => { const S = newRun(data, X, { seed: 7, dex: 4, league: true, weather: false, autoPick: 0, perks, ...o }); S.plan.events = []; return S; };
const step = (S, n = 1) => { for (let i = 0; i < n; i++) { S.acc = -1e9; stepRun(S, null); } };

// ---------------------------------------------------------------- the levels are the family's
{
	const base = { pupg: { 4: { hp: 3, atk: 2 }, 5: { hp: 5, crit: 2, bogus: 4 }, 6: { atk: 1, spd: '3', regen: -2 }, 7: { hp: 9 } } };
	const lv = levelsOf(G, base, 5);
	A(lv.hp === 5 && lv.atk === 2 && lv.crit === 2 && lv.spd === 3 && !lv.regen && levelsOf(G, base, 4).hp === 5 && levelsOf(G, base, 6).hp === 5, 'the levels that count are the family\'s: the best of each among its stages (Charmander, Charmeleon and Charizard read the same)', lv);
	A(levelsOf(G, base, 7).hp === 9 && levelsOf(G, base, 1).hp === undefined && Object.keys(levelsOf(G, null, 4)).length === 0 && Object.keys(levelsOf(G, {}, 4)).length === 0, 'another family has its own; no save, or a save with none: none');
	const P = perksOf(G, base, 4);
	A(P.hp === 40 && near(P.atkMul, 1.08) && near(P.spdMul, 1.09) && near(P.crit, 0.06) && P.cdMul === 1 && P.startMoves === 1 && P.revives === 0 && P.tmMove === null && P.banned.length === 0, 'they become the 2D game\'s own perks (5 Vitality: + 40 HP; 2 Strength: + 8 %; 3 Stride: + 9 %; 2 crit: + 6 %)', P);
	const edited = perksOf(G, { pupg: { 4: { hp: 999, revive: 50, ban: 99 } } }, 4);
	A(edited.hp === 80 && edited.revives === 2 && edited.bans === 3, 'a hand-edited level gives no more than the upgrade\'s max (Vitality 10, Second chance 2, Veto 3)', edited);
	A(perksOf(G, null, 4) === null, 'no base save to read: nothing');
	A(familyPick(G, { ptm: { 5: 'slash' } }, 'ptm', 4) === 'slash' && familyPick(G, { ptm: { 4: 'ember', 5: 'slash' } }, 'ptm', 4) === 'ember' && familyPick(G, { pban: { 4: [], 6: ['tackle'] } }, 'pban', 4)[0] === 'tackle', 'a pick (the TM\'s move, the vetoes) is the stage\'s own, else another stage\'s of its family');
}

// ---------------------------------------------------------------- a run starts with their stats
{
	const base = { pupg: { 4: { hp: 5, atk: 10, spd: 4, cd: 8, def: 3, regen: 5, magnet: 2, xp: 4, crit: 3, size: 2, coins: 8 } } };
	const P = perksOf(G, base, 4), S0 = mk(null), S = mk(P), a = S0.w.pl, b = S.w.pl;
	A(!S0.up && !!S.up, 'a run given the upgrades keeps them (a run given none has none)');
	A(b.maxHp === a.maxHp + 40 && b.hp === b.maxHp, `Vitality 5: + 40 HP (${a.maxHp} -> ${b.maxHp})`);
	A(near(attackOf(b) / attackOf(a), 1.4) && near(b.atkMul / a.atkMul, 1.4), 'Strength 10: + 40 % damage');
	A(near(b.spdMul / a.spdMul, 1.12) && near(b.cdMul / a.cdMul, 0.76), 'Stride 4: + 12 % speed; Reflexes 8: cooldowns × 0.76');
	A(near(b.baseReduce - a.baseReduce, 0.06) && near(b.baseRegen - a.baseRegen, 1), 'Shell 3: + 6 % defence; Synthesis 5: + 1 HP/s');
	A(near(b.magnet / a.magnet, 1.24) && near(b.xpMul / a.xpMul, 1.2) && near(b.crit - a.crit, 0.09), 'Magnet 2: + 24 % reach; Wisdom 4: + 20 % XP; Critical Hit 3: + 9 %');
	A(near(b.sizePerk, 1.16) && a.sizePerk === undefined, 'Calibre 2: your moves are 16 % bigger');
	// it lasts through an evolution, and Fortune changes nothing here
	b.level = 16; a.level = 16; processLeague(S); processLeague(S0);
	A(S.lg.form === 5 && S0.lg.form === 5 && b.maxHp === a.maxHp + 40 && near(attackOf(b) / attackOf(a), 1.4), 'evolved (Charmeleon): the upgrades are still on top');
	const F = mk(perksOf(G, { pupg: { 4: { coins: 8 } } }, 4)), N = mk(null);
	step(F, 120); step(N, 120);
	A(hashWorld(F.w) === hashWorld(N.w) && F.w.pl.maxHp === N.w.pl.maxHp, 'Fortune does nothing in an Expedition run (as in 2D: its pay is the Expedition\'s own)');
}

// ---------------------------------------------------------------- the tools, and the vetoes
{
	const K = X.L.K, kit = LG.BY[4].kit;
	const pool = moveCands(mk(null));   // (the moves a level-up can offer this Charmander)
	const veto = pool.slice(0, 2);
	const S = mk(perksOf(G, { pupg: { 5: { reroll: 3, ban: 2 } }, pban: { 4: veto.concat(['never-used']) } }, 4));
	A(S.lv.refreshes === K.REFRESH + 3 && S.lv.bans === K.BANISH + 2, `Card change 3: ${K.REFRESH + 3} Refreshes; Veto 2: ${K.BANISH + 2} Banishes`, [S.lv.refreshes, S.lv.bans]);
	A(veto.length === 2 && veto.every((id) => S.lv.banned.has(id)) && !S.lv.banned.has('never-used'), 'the moves you vetoed are out (as many as the Veto levels you have: two of three)', [...S.lv.banned]);
	const left = moveCands(S); let came = 0, cards = 0;
	for (let i = 0; i < 300; i++) for (const c of offerCards(S)) { cards++; if (veto.some((id) => JSON.stringify([c.key, c.id, c.move]).includes('"' + id + '"') || String(c.key).endsWith(':' + id))) came++; }
	A(left.length === pool.length - 2 && !left.some((id) => veto.includes(id)) && came === 0 && cards >= 600, `…and never come on the cards (${pool.length} moves could be offered, ${left.length} now; ${cards} cards dealt, none of the two)`, [came, cards, veto, left.length, pool.length]);
	const cap = mk(perksOf(G, { pupg: { 4: { reroll: 5, ban: 3 } } }, 4), { meta: { rs: {}, RS: {}, row: null, eff: { lab: { refresh: 4, banish: 5, skip: 0, vitamins: 0, option: 0, revive: 0, research: 0, support: 0, archive: 0 }, stats: {}, boosts: {}, perk: 0, charm: false, shinyMember: false }, excl: new Set(), master: false, candy: false } });
	A(cap.lv.refreshes === K.TOOL_MAX && cap.lv.bans === K.TOOL_MAX && K.TOOL_MAX === 6, 'with the Lab\'s levels too: never above six of each');
}

// ---------------------------------------------------------------- Second chance
{
	const S = mk(perksOf(G, { pupg: { 6: { revive: 2 } } }, 4)), w = S.w, pl = w.pl;
	step(S, 2);
	const e = addEnemy(w, 19, pl.s.x + 3, pl.s.z, { dummy: true, hp: 1e6 }), far = addEnemy(w, 19, pl.s.x + 20, pl.s.z, { dummy: true, hp: 1e6 });
	A(S.up.revives === 2, 'Second chance 2: two hearts');
	pl.hp = 0; const saved = w.hooks.ko(w);
	const ev = w.events.find((q) => q.k === 'secondchance');
	A(saved === true && pl.hp === pl.maxHp && pl.invuln === 2.5 && S.up.revives === 1 && ev && ev.left === 1 && near(ev.r, 260 * U), 'you fall: back at full HP, 2.5 s unhurt, a heart spent (the page is told)');
	A(e.a.kx > 0 && far.a.kx === 0, '…and what is within 260 px is thrown back (not what is farther)', [e.a.kx, far.a.kx]);
	pl.hp = 0; A(w.hooks.ko(w) === true && S.up.revives === 0 && S.up.used === 2, 'the second heart, the same');
	pl.hp = 0; A(!w.hooks.ko(w), 'with none left you fall');
	// in the run itself: a hit that would finish you does not end it
	const R = mk(perksOf(G, { pupg: { 4: { revive: 1 } } }, 4)); step(R, 2);
	R.w.pl.invuln = 0; R.w.pl.hp = 1; const foe = addEnemy(R.w, 19, R.w.pl.s.x + 0.3, R.w.pl.s.z, { dmg: 1e4 }); foe.dmg = 1e6;
	let n = 0; while (R.up.revives > 0 && !R.ended && n++ < 300) step(R);
	A(!R.ended && !R.w.pl.dead && R.up.revives === 0 && R.w.pl.hp > 1, 'in a run: the hit that would have ended it is survived', [R.ended, R.w.pl.hp, n]);
	const N = mk(null); step(N, 2); N.w.pl.hp = 0;
	A(!N.w.hooks.ko(N.w), 'without the upgrade: nothing saves you');
}

// ---------------------------------------------------------------- the TM, and Repertoire
{
	const kit = LG.BY[4].kit, pool = tmPool(G, 4), pick = pool.find((id) => !kit.includes(id) && canFire(data.moveDef(id).kind) && data.moveDef(id).type === 'normal');
	A(pool.length > 5 && pool.every((id) => { const d = data.moveDef(id); return d.kind !== 'buff' && (d.type === 'fire' || d.type === 'normal'); }) && tmPool(G, 151).length > pool.length, 'the TM\'s moves for Charmander: Fire and Normal, no support moves (Mew: every one)');
	const plain = mk(null);
	A(plain.w.pl.moves.map((m) => m.id).join() === kit[0], `without it: the kit's first move (${kit[0]})`);
	const T = mk(perksOf(G, { pupg: { 4: { tm: 1 } }, ptm: { 5: pick } }, 4));
	A(T.w.pl.moves.map((m) => m.id).join() === pick && T.lg.kit === 1 && T.lg.tm === pick && T.lg.log.some((q) => q[1] === 'tm' && q[2] === pick), `the TM: you start with the move you picked (${pick}) in place of the kit's first`, T.w.pl.moves.map((m) => m.id));
	const lv2 = LG.K.KIT_AT ? LG.K.KIT_AT[1] : 0; T.w.pl.level = 60; processLeague(T);
	A(kit.slice(1).every((id) => T.w.pl.moves.some((m) => m.id === id)) && !T.w.pl.moves.some((m) => m.id === kit[0]), '…and the rest of the kit still comes at its levels (the first one never does)', T.w.pl.moves.map((m) => m.id));
	const noTm = mk(perksOf(G, { pupg: { 4: {} }, ptm: { 4: pick } }, 4));
	A(noTm.w.pl.moves[0].id === kit[0], 'a pick without the TM bought: the kit\'s first');
	const bad = mk(perksOf(G, { pupg: { 4: { tm: 1 } }, ptm: { 4: 'surf' } }, 4));
	A(perksOf(G, { pupg: { 4: { tm: 1 } }, ptm: { 4: 'surf' } }, 4).tmMove === null && bad.w.pl.moves[0].id === kit[0], 'a pick that is not one of its moves (a Water move): the kit\'s first');
	const Rp = mk(perksOf(G, { pupg: { 4: { moves: 1 } } }, 4));
	A(Rp.w.pl.moves.map((m) => m.id).join() === kit.slice(0, 2).join() && Rp.lg.kit === 2, `Repertoire: the kit's second move from level 1 (${kit.slice(0, 2).join(', ')})`, Rp.w.pl.moves.map((m) => m.id));
	const both = mk(perksOf(G, { pupg: { 4: { moves: 1, tm: 1 } }, ptm: { 4: pick } }, 4));
	A(both.w.pl.moves.map((m) => m.id).join() === [pick, kit[1]].join(), 'both: the TM\'s move and the kit\'s second');
}

// ---------------------------------------------------------------- nothing bought: the run as it was
{
	const a = mk(null), b = mk(perksOf(G, { pupg: {} }, 4)), c = mk(perksOf(G, { owned: { 4: {} } }, 4));
	step(a, 200); step(b, 200); step(c, 200);
	A(hashWorld(a.w) === hashWorld(b.w) && hashWorld(a.w) === hashWorld(c.w) && a.w.pl.maxHp === b.w.pl.maxHp && b.lv.refreshes === a.lv.refreshes, 'a save with no upgrades gives the same run, to the last number');
	const g = newRun(data, X, { seed: 7, dex: 4, league: true, weather: false, guest: true, perks: perksOf(G, { pupg: { 4: { hp: 5 } } }, 4) });
	A(!g.up, 'a co-op guest\'s side takes none');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
