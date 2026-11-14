// micasurvivor_m3d_dive_test.mjs — MicaSurvivor 3D, Dive (Plans/MICASURVIVOR_3D_PLAN.md §5.54): a Dive run, floor by
// floor (micasurvivor/m3d/dive.js), in node, with the 2D game's OWN rules (js/expedition/dive.js) read as they are.
//   * the rules are the 2D game's: its numbers, its species curve, its guardians, its streams
//   * a floor holds the foes the 2D game puts on it (same seed, route, floor: same species, same elites), with the 2D
//     game's HP and damage; alphas and guardians are the 2D game's multiples of them
//   * the groups sleep until you come close or hit one; a waking group wakes its neighbours, not the whole floor
//   * the stairs take you down; an alpha seals them; its fall secures the loot (to floor 25); a guardian banks all
//     and saves the stage
//   * loot is at stake until it is secured; a faint keeps the bank and a quarter of the stake; the rope keeps all
//   * the lost Pokémon follows you once reached and is rescued when you leave the floor with it
//   * pressure: after the grace, packs arrive, awake, worth no loot
//   * Megas below floor 30, legendaries from floor 26 (never more than the pity apart)
//   * the same inputs give the same run
//   node overworld/tests/micasurvivor_m3d_dive_test.mjs
import { rulesFrom, newDive, stepDive, spawnFoe, payOf, hudLine, result, reinforce } from '../../micasurvivor/m3d/dive.js';
import { dataFrom, hashWorld, CK } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { CELL, noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), E = G.ExpDive, K = E.K;
const run = (o = {}) => newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, moves: ['ember'], autoPick: 0, ...o });
const steps = (S, sec, input) => { for (let i = 0, n = Math.round(sec * 60); i < n && !S.ended; i++) stepDive(S, input || noInput()); };
const put = (S, x, z) => { const s = S.w.pl.s; s.x = x; s.z = z; s.y = 0; s.vx = s.vy = s.vz = 0; s.grounded = true; };
const safe = (S) => { S.w.pl.invuln = 1e9; S.w.pl.maxHp = S.w.pl.hp = 1e9; };   // (the fight is not this test's subject)
const kill = (S, e) => { e.hp = 1e-6; e.shield = 0; e.poison = 1; e.poisonT = 1; e.poisonTick = 0; };   // (it falls on the next tick, inside the fight: a KO like any other)
const toStairs = (S) => put(S, S.w.room.stairs[0], S.w.room.stairs[2]);
const quiet = (S) => { for (const e of S.w.enemies) if (e !== S.boss) e.dead = true; };   // (clear the floor's small fry without loot)

A(!!R && R.K === K && R.target(10) === E.target(10) && R.guardianOf('forest', 25) === 251 && R.nameOf('forest') === 'Mossy Woods', 'the 3D game reads the 2D game\'s own Dive rules: its numbers, its species curve, its guardians; a route\'s name in English', R && R.nameOf('forest'));
A(near(G.Enemies.scale(130).hp, (1 + 130 / 95) * G.Types.ENEMY_HP, 1e-9) && G.Types.ENEMY_HP === 1.05 &&   /* (+ 5 % on every enemy's HP: for STAB, 2026-11-14) */ near(G.Enemies.scale(130).dmg, 1 + 130 / 420, 1e-9) && K.HP_K === 3.3 && K.DMG_K === CK.DMG_K, '(the base curves the 3D fight scales a foe by are the 2D game\'s)');

// ---------------------------------------------------------------- the 2D game's floor, said again on its own
const draw = (P, r) => { const v = r() * P.sum; for (const [d, c] of P.list) if (c >= v) return d; return P.list[P.list.length - 1][0]; };
function floor2D(seed, route, f) {
	const L = G.DiveGen.layout({ seed, route, floor: f }), rng = (k) => G.DLC.rng(G.DiveGen.seedOf(seed, route, f, k));
	const r = rng(0xD1), P = E.pool(route, f), er = rng(0xE17E), n = Math.min(K.GROUP[1], K.GROUP[0] + Math.floor(f / 8)), out = [];
	for (const g of L.groups) {
		const k = Math.max(1, n + (g.guard ? K.GUARD_PLUS : 0) + Math.floor(r() * 3) - 1), list = [];
		for (let i = 0; i < k; i++) { r(); if (i) r(); const dex = draw(P, r); let aff = null; if (f >= K.ELITE.from && er() < Math.min(K.ELITE.max, K.ELITE.p0 + K.ELITE.per * (f - K.ELITE.from))) aff = ['swift', 'tough', 'rage'][Math.floor(er() * 3)]; list.push([dex, aff]); }
		out.push(list);
	}
	return { L, groups: out };
}
const hp2D = (dex, f, k = 1) => { const teff = f * K.T_PER_FLOOR, ti = Math.max(0, Math.min(5, Math.floor((E.target(f) - 260) / K.TIER_BST) + (f >= K.DEEP.tierAt ? 1 : 0))); const def = data.defFor(dex, ti); return { hp: Math.round(def.hp * G.Enemies.scale(teff).hp * (K.HP_K + Math.min(1.7, teff / 210)) * k * (1 + K.DEEP.hp * Math.max(0, f - K.DEEP.from))), dmg: def.dmg * G.Enemies.scale(teff).dmg * K.DMG_K * (1 + K.DEEP.dmg * Math.max(0, f - K.DEEP.from)), xp: Math.round(def.xp * K.XP_K) }; };

// ---------------------------------------------------------------- floor 1
{
	const S = run({ moves: [] }), F = floor2D(7, 'forest', 1), w = S.w;   // (no move: only what this block does touches a foe)
	A(S.floor === 1 && S.route === 'forest' && w.room.dive && w.room.floor === 1 && S.says.some((x) => x.text === '— Floor 1 · Mossy Woods —'), 'a Dive begins on floor 1 of its route, in the floor\'s room, and says where you are', S.says);
	A(JSON.stringify(S.groups.map((g) => g.list.map((e) => e.dex))) === JSON.stringify(F.groups.map((g) => g.map((x) => x[0]))) && S.groups.length === F.L.groups.length, `the floor holds the foes the 2D game puts on it: ${S.groups.length} groups, ${w.enemies.length} foes, the same species in the same order`, [S.groups.map((g) => g.list.map((e) => e.dex)), F.groups]);
	const e = S.groups[0].list[0], ex = hp2D(e.dex, 1);
	A(e.maxHp === ex.hp && near(e.dmg, ex.dmg, 1e-6) && e.xp === ex.xp, `a foe has the 2D game's HP, damage and XP for its floor (${name(e.dex)}: ${e.maxHp} HP)`, [e.maxHp, e.dmg, e.xp, ex]);
	const room = w.room, onFloor = w.enemies.every((q) => { const i = Math.floor(q.a.z / CELL) * room.w + Math.floor(q.a.x / CELL); return room.cells[i] < room.rimH && (q.fly || !room.water.has(i)); });
	A(onFloor && S.groups.every((g) => g.list.every((q) => Math.hypot(q.a.x - g.at[0], q.a.z - g.at[1]) <= 41 * CELL / 32)), 'every foe stands on the floor (none in rock, no walker in a pool), within its group\'s spread');
	A(S.stray && !S.stray.follow && S.stray.x === room.rescue[0] && S.stray.z === room.rescue[2] && R.strays('forest', 1).includes(S.stray.dex), `the floor's lost Pokémon (${name(S.stray.dex)}) waits where the layout put it`);
	// asleep
	const at0 = w.enemies.map((q) => [q.a.x, q.a.z]);
	steps(S, 10);
	A(S.groups.every((g) => !g.awake) && w.enemies.every((q, i) => q.a.x === at0[i][0] && q.a.z === at0[i][1]) && w.pl.hp === w.pl.maxHp && w.stats.taken === 0, 'left alone the groups sleep: ten seconds on, nobody has moved and nothing has touched you');
	// come close
	safe(S);
	const g0 = S.groups[0], gd = (a, b) => Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) / CELL;
	const close = S.groups.filter((g) => gd(g, g0) < K.WAKE_R);   // (you stand on g0: these hear YOU)
	const nearG = S.groups.filter((g) => !close.includes(g) && close.some((c) => gd(g, c) < K.WAKE_CHAIN)), far = S.groups.filter((g) => !close.includes(g) && !nearG.includes(g));
	put(S, g0.at[0], g0.at[1]); steps(S, 1 / 60);
	A(g0.awake && g0.list.every((q) => !q.dummy) && close.every((g) => g.awake) && nearG.some((g) => g.awake) && far.length > 0 && far.every((g) => !g.awake), `come within ${K.WAKE_R} tiles of a group and it wakes (${close.length} here), and a waking group wakes those within ${K.WAKE_CHAIN} tiles of it, one hop (${nearG.filter((g) => g.awake).length} more); the ${far.length} farther ones sleep on`, [nearG.length, far.length, S.groups.map((g) => g.awake)]);
	steps(S, 2);
	A(g0.list.some((q, i) => !q.dead && Math.hypot(q.a.x - at0[w.enemies.indexOf(q)][0], q.a.z - at0[w.enemies.indexOf(q)][1]) > 0.5) || g0.list.every((q) => q.dead), 'an awake group comes for you');
	// a hit wakes
	const gh = far.find((g) => !g.awake);
	gh.list[0].hp -= 1; steps(S, 1 / 60);
	A(gh.awake, 'hit one of a sleeping group and the group wakes');
	// loot
	const st0 = S.stake, k0 = S.kills, victim = S.groups.find((g) => !g.awake).list[0];
	kill(S, victim); steps(S, 1 / 60);
	A(S.kills === k0 + 1 && near(S.stake - st0, K.LOOT.ko + K.LOOT.koPer * 1) && S.bank === 0, `a KO puts loot at stake (${(K.LOOT.ko + K.LOOT.koPer).toFixed(2)} on floor 1), none of it secured`, [S.stake - st0, S.bank]);
	// the stairs
	const st1 = S.stake, h1 = [room.spawn[0], room.spawn[2]];
	toStairs(S); steps(S, K.STAIRS_T - 0.1);
	A(S.floor === 1, `standing on the stairs for less than ${K.STAIRS_T} s does nothing yet`);
	steps(S, 0.2);
	const F2 = floor2D(7, 'forest', 2);
	A(S.floor === 2 && w.room.floor === 2 && w.room !== room && Math.hypot(w.pl.s.x - w.room.spawn[0], w.pl.s.z - w.room.spawn[2]) < 1 && JSON.stringify(S.groups.map((g) => g.list.map((q) => q.dex))) === JSON.stringify(F2.groups.map((g) => g.map((x) => x[0]))), 'then you are on floor 2: its room, its own foes, you where it begins; nothing of floor 1 came along', [S.floor, h1]);
	A(near(S.stake - st1, K.LOOT.floor + K.LOOT.floorPer * 1) && S.deepest === 2 && S.groups.every((g) => !g.awake), 'a floor cleared is loot at stake too; the new floor sleeps');
	A(/^FLOOR 2 · 0 secured · \d+ at stake · STAIRS \d+ m( · ₽ \d+)?$/.test(hudLine(S)), 'the HUD line: the floor, the loot secured and at stake, how far the stairs are', hudLine(S));
}
function name(dex) { return data.mon(dex).name; }

// ---------------------------------------------------------------- elites
{
	let n = 0, n2 = 0, ok = true, tough = null;
	for (const f of [6, 12, 20]) { const S = run({ start: f }), F = floor2D(7, 'forest', f); S.groups.forEach((g, gi) => g.list.forEach((e, i) => { const want = F.groups[gi][i][1]; if (want) n2++; if (e.xaff) { n++; if (e.xaff === 'tough' && !tough) tough = [e, f]; } if ((e.xaff || null) !== want) ok = false; })); }
	A(ok && n === n2 && n > 0, `from floor ${K.ELITE.from} some foes are elites, the same ones as in the 2D game (${n} on floors 6, 12 and 20)`, [n, n2]);
	if (tough) { const [e, f] = tough, ex = hp2D(e.dex, f); A(e.maxHp === Math.round(ex.hp * K.ELITE.tough) && e.xp === Math.round(ex.xp * K.ELITE.xp) && e.scale === K.ELITE.scale, `a tough elite has ×${K.ELITE.tough} HP, is bigger, and is worth ×${K.ELITE.xp} XP`, [e.maxHp, ex]); }
	else A(true, '(no tough elite on those floors to measure)');
}

// ---------------------------------------------------------------- an alpha's floor
{
	const S = run({ start: 5 }), w = S.w; safe(S);
	const b = S.boss, exA = hp2D(b.dex, 5, K.ALPHA.hp);
	A(S.cadence.arena && b && b.xk === 'alpha' && S.sealed && b.maxHp === exA.hp && near(b.dmg, exA.dmg * K.ALPHA.dmg, 1e-6) && b.scale === K.ALPHA.scale && !b.dummy && S.says.some((x) => /alpha/i.test(x.text)), `floor 5 has an alpha by the stairs (${name(b.dex)}, ×${K.ALPHA.hp} HP, awake); the stairs are sealed`, [b.maxHp, exA]);
	quiet(S); S.stake = 10;
	toStairs(S); steps(S, 2);
	A(S.floor === 5 && S.says.length === 0, 'you cannot go down while it stands');
	{ const T = run({ start: 5 }); safe(T); toStairs(T); stepDive(T, noInput()); A(T.says.some((x) => x.text === 'The stairs are sealed'), '…and the game says the stairs are sealed', T.says); }
	put(S, w.room.spawn[0], w.room.spawn[2]);
	kill(S, b); steps(S, 1 / 60);
	const got = K.LOOT.alpha + K.LOOT.alphaPer * 5 + K.LOOT.ko + K.LOOT.koPer * 5;
	A(!S.sealed && S.alphas === 1 && S.stake === 0 && near(S.bank, 10 + got) && S.says.some((x) => x.text === 'Alpha defeated! Loot secured'), 'the alpha falls: the stairs open and everything at stake is SECURED', [S.bank, S.stake, got]);
	toStairs(S); steps(S, K.STAIRS_T + 0.1);
	A(S.floor === 6, '…and the stairs take you down');
	// past floor 25 an alpha no longer secures
	const D = run({ start: 30 }); safe(D); quiet(D); D.stake = 10; kill(D, D.boss); steps(D, 1 / 60);
	A(D.alphas === 1 && D.bank === 0 && D.stake > 10 && !D.sealed && D.says.some((x) => x.text === 'Alpha defeated! The stairs are clear'), 'below floor 25 an alpha only opens the stairs: the loot stays at stake', [D.bank, D.stake]);
}

// ---------------------------------------------------------------- a guardian's floor
{
	const S = run({ start: 25 }), w = S.w; safe(S);
	const b = S.boss, ex = hp2D(251, 25, K.GUARD.hp);
	A(S.cadence.guardian && b && b.dex === 251 && b.boss && b.xk === 'guardian' && b.maxHp === ex.hp && S.sealed && S.groups.length === 0 && !S.stray, `floor 25 is the guardian's: Celebi alone, a boss with ×${K.GUARD.hp} HP (${b.maxHp}); no groups, no lost Pokémon`, [b && b.maxHp, ex.hp]);
	A(run({ start: 50 }).boss.dex === E.GUARDIANS.forest[1] && run({ route: 'reef', start: 25 }).boss.dex === E.GUARDIANS.reef[0], 'each route has its guardians, in turn every 25 floors');
	{ const p = w.room.dive.path[8]; put(S, (p[0] + 0.5) * CELL, (p[1] + 0.5) * CELL); }   // (off the rope's circle)
	steps(S, 60);
	A(!S.ended && w.enemies.length === 1, 'no reinforcements come on a guardian\'s floor');
	S.stake = 33; kill(S, b); steps(S, 1 / 60);
	A(S.guardians === 1 && !S.sealed && S.stake === 0 && near(S.bank, 33 + K.LOOT.guard + K.LOOT.guardPer * 25 + K.LOOT.ko + K.LOOT.koPer * 25) && S.stage === 26 && S.says.some((x) => x.text === 'Guardian defeated! Stage saved'), 'the guardian falls: everything is banked and the stage (floor 26) is saved', [S.bank, S.stage]);
	A(result(S).stage === 26, 'the result carries the stage for the save');
}

// ---------------------------------------------------------------- the lost Pokémon
{
	const S = run(), w = S.w; safe(S); quiet(S);
	const lo = S.stray, dex = lo.dex;
	put(S, lo.x + 1, lo.z); steps(S, 1 / 60);
	A(lo.follow && !lo.done && S.rescued.length === 0, 'reach the lost Pokémon and it follows you (not rescued yet)');
	toStairs(S); steps(S, 0.2);
	A(Math.hypot(lo.x - w.pl.s.x, lo.z - w.pl.s.z) < R.ESCORT.R * CELL, 'it keeps up with you');
	const st = S.stake; steps(S, K.STAIRS_T + 0.1);
	A(S.floor === 2 && S.rescued.join() === String(dex) && near(S.stake - st, K.LOOT.rescue + K.LOOT.rescuePer * 1 + K.LOOT.floor + K.LOOT.floorPer * 1) && S.stray !== lo, `leave the floor with it and it is rescued: loot at stake (${K.LOOT.rescue + K.LOOT.rescuePer})`, [S.rescued, S.stake - st]);
	// one you never reached stays lost
	const T = run(); safe(T); quiet(T); toStairs(T); steps(T, K.STAIRS_T + 0.1);
	A(T.floor === 2 && T.rescued.length === 0, 'one you never reached stays lost');
	// rescued counts only once banked, on a faint
	S.w.pl.dead = true; S.w.pl.hp = 0; S.w.pl.invuln = 0; steps(S, 1 / 60);
	A(S.ended && S.lost && result(S).parts.rescued === 0, 'faint before an alpha secures it and the rescue is lost with the stake\'s three quarters');
}

// ---------------------------------------------------------------- the rope, the faint, the pay
{
	const S = run({ start: 10 }), w = S.w; safe(S); quiet(S);
	A(S.cadence.rope && !run({ start: 9 }).cadence.rope, 'floor 10 is a rope floor (floor 9 is not)');
	S.bank = 40; S.stake = 21.7;
	steps(S, K.ROPE_T - 0.5, { mx: 0, mz: 0, jump: false, crouch: false });
	A(!S.ended && S.ropeT > 0 && /ROPE/.test(hudLine(S)), 'stand still where you arrived and the Escape Rope counts');
	steps(S, 0.2, { mx: 1, mz: 0, jump: false, crouch: false });
	A(S.ropeT === 0 && !S.ended, 'moving cancels it');
	put(S, w.room.spawn[0], w.room.spawn[2]);
	steps(S, K.ROPE_T + 0.2);
	const r = result(S);
	A(S.ended && S.escaped && !S.lost && payOf(S) === 61 && r.won && r.parts.divePay === 61 && r.parts.escaped && r.lines.includes('You escaped: you keep all the loot'), `hold still ${K.ROPE_T} s and you escape with everything: the bank and the whole stake (40 + 21.7 pays 61)`, [payOf(S), r.lines]);
	const F = run({ start: 3 }); F.bank = 40; F.stake = 21.7; F.w.pl.dead = true; steps(F, 1 / 60);
	const rf = result(F);
	A(F.ended && F.lost && !F.escaped && payOf(F) === Math.floor(40 + 21.7 * K.FAINT_KEEP) && !rf.won && rf.lines.includes('You fell: you keep what was secured and a quarter of the rest') && rf.parts.floor === 3 && rf.parts.start === 3, `faint and you keep the bank and a quarter of the stake (pays ${Math.floor(40 + 21.7 * K.FAINT_KEEP)})`, [payOf(F), rf.lines]);
	const n0 = F.w.t; steps(F, 1); A(F.w.t === n0, 'an ended run does not go on');
}

// ---------------------------------------------------------------- pressure
{
	const S = run({ moves: [] }), w = S.w; safe(S);
	const n0 = w.enemies.length;
	steps(S, K.REIN.grace - 1);
	A(w.enemies.length === n0, `for ${K.REIN.grace} s after you arrive nobody else comes`);
	steps(S, 1.5);
	const pack = w.enemies.filter((e) => e.xrein), s = w.pl.s;
	A(pack.length === Math.min(K.REIN.max, K.REIN.n) && pack.every((e) => !e.dummy) && S.says.length >= 0 && pack.every((e) => Math.hypot(e.a.x - s.x, e.a.z - s.z) < (K.REIN.far + 2) * CELL), `then a pack of ${pack.length} arrives, awake, within ${K.REIN.far} tiles`, pack.map((e) => Math.hypot(e.a.x - s.x, e.a.z - s.z) / CELL));
	const st = S.stake; kill(S, pack[0]); steps(S, 1 / 60);
	A(S.stake === st && S.kills === 1, 'a reinforcement is worth no loot');
	steps(S, K.REIN.every + 0.5);
	A(w.enemies.filter((e) => e.xrein && !e.dead).length > pack.length - 1, 'and more keep coming');
	const T = run(); for (let i = 0; i < 30; i++) reinforce(T);
	A(T.w.enemies.length <= K.REIN.cap + K.REIN.max, `never past ${K.REIN.cap} foes on the floor`, T.w.enemies.length);
}

// ---------------------------------------------------------------- Megas and legendaries
{
	let megaF = 0; for (let f = 31; f < 60 && !megaF; f++) if (f % 5 && E.megaRoll(7, 'forest', f).elite) megaF = f;
	const S = run({ start: megaF }), mega = S.w.enemies.find((e) => S.tags.get(e.id) === 'mega');
	A(megaF > 30 && mega && mega.dex === E.megaRoll(7, 'forest', megaF).dex && !mega.dummy && mega.scale === K.ALPHA.scale && S.says.some((x) => /^A wild Mega /.test(x.text)), `below floor ${K.MEGA.from} a floor may hold a Mega, the 2D game's draw (floor ${megaF}: ${mega ? name(mega.dex) : '?'}), awake and alpha-sized`, megaF);
	A(!run({ start: 20 }).w.enemies.some((e) => name(e.dex).startsWith('Mega ')), 'never above it');
	safe(S); const st = S.stake; kill(S, mega); steps(S, 1 / 60);
	A(near(S.stake - st, K.LOOT.alpha + K.LOOT.alphaPer * megaF + K.LOOT.ko + K.LOOT.koPer * megaF), 'a Mega pays an alpha\'s loot');
	// legendaries: walk floors 26 to 40, never more than the pity apart
	const D = run({ start: 26 }); safe(D);
	let gap = 0, worst = 0, seen = 0, legendOk = true;
	for (let f = 26; f <= 40; f++) {
		const lg = D.w.enemies.find((e) => D.tags.get(e.id) === 'legend');
		if (lg) { seen++; gap = 0; if (!E.legendPool().includes(lg.dex) || lg.xk !== 'legend' || lg.maxHp !== hp2D(lg.dex, f, K.LEGEND.hp).hp) legendOk = false; } else if (f % 25) { gap++; worst = Math.max(worst, gap); }
		if (D.boss) kill(D, D.boss);
		steps(D, 1 / 60); toStairs(D); steps(D, K.STAIRS_T + 0.1);
	}
	A(D.floor === 41 && seen >= 3 && worst <= K.LEGEND.pity && legendOk, `from floor ${K.LEGEND.from} legendaries appear (${seen} on floors 26 to 40), never more than ${K.LEGEND.pity} floors apart, none of them a guardian, ×${K.LEGEND.hp} HP`, [seen, worst, D.floor]);
}

// ---------------------------------------------------------------- your Pokémon grows; the same inputs, the same run
{
	const play = () => { const S = run({ start: 2 }); S.w.pl.maxHp = S.w.pl.hp = 1e9; const g = S.groups[0]; put(S, g.at[0], g.at[1]); steps(S, 20); return S; };
	const a = play(), b = play();
	A(a.kills > 0 && a.w.pl.level > 1 && a.stake > 0, `a fight on floor 2: ${a.kills} KOs in 20 s, level ${a.w.pl.level}, ${a.stake.toFixed(2)} at stake (your Pokémon levels up as in an Expedition)`, [a.kills, a.w.pl.level]);
	A(hashWorld(a.w) === hashWorld(b.w) && a.kills === b.kills && a.stake === b.stake, 'the same seed and the same inputs give the same run');
	A(hashWorld(run({ seed: 8, start: 2 }).w) !== hashWorld(run({ start: 2 }).w), 'another seed, another dive');
	const sp = run(); const e = spawnFoe(sp, 25, sp.w.room.spawn[0], sp.w.room.spawn[2], { alpha: true });
	A(e && e.xk === 'alpha' && !e.dummy, '(spawnFoe: a foe made by hand is awake)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
