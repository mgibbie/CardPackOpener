// micasurvivor_m3d_expformes_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.48): the regional
// formes and the Megas as enemies (the 2D game's U3: js/data/forms.js, js/systems/forms.js), in node, with the 2D
// game's own data read as it is.
//   * the 3D side loads them: 58 formes in the League's families, 95 Megas that can be met
//   * zone 3's plan has its Mega elite, and the run brings it: an elite of 8 × the life, 1.3 × the size, named in English
//   * Survival: from 15:00 every segment has a Mega elite, and a milestone boss is sometimes a Mega
//   * the League: a run can start as a forme (Alolan Vulpix), evolves along the forme's own line, and a line with a
//     forme at its end offers the choice (Pikachu: Raichu or Alolan Raichu)
//   * a forme's Ultimate is its own first type's
//   node overworld/tests/micasurvivor_m3d_expformes_test.mjs
import { dataFrom } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun, fire } from '../../micasurvivor/m3d/expedition.js';
import { branchCards, processLeague, canEvolve } from '../../micasurvivor/m3d/expleague.js';
import { codeOf, typeCode, ultView } from '../../micasurvivor/m3d/expult.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };

const G = loadG(), data = dataFrom(G), X = expFrom(G), LG = G.ExpLeague;
const mk = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 4, league: true, weather: false, autoPick: 0, ...o }); S.plan.events = []; S.acc = -1e9; stepRun(S, null); return S; };

// ---------------------------------------------------------------- the data
{
	const foes = G.Megas.foes();
	A(G.FORMS.length === 58 && foes.length >= 90 && G.FORMS.every((p) => LG.FAM[p.dex] && LG.BY[LG.FAM[p.dex]]), `the 3D side has the 58 regional formes, each in a League family, and ${foes.length} Megas that can be met`);
	A(data.mon(10103).name === 'Alolan Vulpix' && data.mon(10100).name === 'Alolan Raichu' && /^Mega /.test(data.mon(foes[0]).name) && G.FORMS.concat(G.Megas.LIST).every((p) => !/ de (Alola|Galar|Hisui|Paldea)|^Mega-|Primigenio/.test(p.name)), 'they are named in English here (Alolan Vulpix, Mega …)', G.FORMS.concat(G.Megas.LIST).filter((p) => / de (Alola|Galar|Hisui|Paldea)|^Mega-|Primigenio/.test(p.name)).map((p) => p.name).slice(0, 5));
	const META = G.SPRITE_META;
	A(foes.every((d) => META[d] && META[d].a && META[d].a.Walk) && G.FORMS.every((p) => META[p.dex] && META[p.dex].a && META[p.dex].a.Walk), 'every one of them has a walking sheet to be drawn with');
}

// ---------------------------------------------------------------- zone 3's Mega elite
{
	const seen = new Set(); let all = true;
	for (let seed = 1; seed <= 40; seed++) { const ev = X.plan(seed, 'viridian', 3, 'normal').events.filter((e) => e.mega); if (ev.length !== 1 || ev[0].kind !== 'elite' || !G.Megas.BY[ev[0].dex[0]]) all = false; else seen.add(ev[0].dex[0]); }
	A(all && seen.size >= 20 && !X.plan(7, 'viridian', 2, 'normal').events.some((e) => e.mega), `zone 3's plan has one Mega elite (${seen.size} different Megas over 40 seeds); zones 1 and 2 have none`);
	const S = mk(), ev = X.plan(7, 'viridian', 3, 'normal').events.find((e) => e.mega), n0 = S.w.enemies.length;
	const plain = fire(S, { at: 0, kind: 'elite', n: 1, dex: [G.Megas.BY[ev.dex[0]].sp], seed: 5 }), el = S.w.enemies[S.w.enemies.length - 1];
	const entry = fire(S, ev), e = S.w.enemies[S.w.enemies.length - 1];
	A(entry.spawned === 1 && S.w.enemies.length === n0 + 2 && e.dex === ev.dex[0] && e.xk === 'elite' && e.scale === X.K.MEGA.scale && e.scale === 1.3 && S.specials.has(e.id), 'the run brings it: the Mega itself, an elite, 1.3 × the size', [e.dex, e.xk, e.scale]);
	A(plain.spawned === 1 && e.maxHp > el.maxHp && X.K.MEGA.hp === 8 && X.K.ELITE.hp < X.K.MEGA.hp, `with 8 × the life (more than a plain elite of its species: ${e.maxHp} against ${el.maxHp})`);
	A(S.says.some((q) => q.text === `A wild ${data.mon(e.dex).name} appears!`) && /^A wild Mega /.test(S.says[S.says.length - 1].text), 'and the run says so, by its name', S.says);
	A(e.types.join() === G.Megas.BY[e.dex].types.join() && e.cr > 0, 'it has the Mega\'s own types');
}

// ---------------------------------------------------------------- Survival
{
	const V = X.V, K = V.K;
	const early = V.segPlan(7, 'viridian', 1, 'normal'), late = [3, 4, 5, 6].map((g) => V.segPlan(7, 'viridian', g, 'normal'));
	A(K.MEGA_FROM === 900 && !early.some((e) => e.mega) && late.every((seg) => seg.filter((e) => e.mega && e.kind === 'elite' && G.Megas.BY[e.dex[0]]).length === 1), 'Survival: no Mega before 15:00; from then every 5:00 segment has its Mega elite');
	let megaBoss = 0, n = 0;
	for (let seed = 1; seed <= 30; seed++) for (let k = 6; k <= 12; k++) { const m = V.milestone(k, 'viridian', seed); if (m.legend || m.mewtwo) continue; n++; if (G.Megas.BY[m.dex]) megaBoss++; }
	A(megaBoss > n * 0.15 && megaBoss < n * 0.45 && K.MEGA_BOSS_P === 0.3, `…and a milestone boss that is no legendary is a Mega about 30 % of the time (${megaBoss} of ${n})`);
	const S = mk({ mode: 'survival' }), ev = late[0].find((e) => e.mega), entry = fire(S, ev), e = S.w.enemies[S.w.enemies.length - 1];
	A(!!S.surv && entry.spawned === 1 && e.dex === ev.dex[0] && e.xk === 'elite', 'a Survival run brings its Mega elite the same way');
}

// ---------------------------------------------------------------- the League's formes
{
	const AV = 10103, AN = 10104, AR = 10100;
	const S = mk({ dex: 37, form: AV });
	A(S.lg.member === 37 && S.lg.form === AV && S.w.pl.mon.name === 'Alolan Vulpix' && S.w.pl.mon.types.join() === 'ice', 'a run can start as a forme: Vulpix\'s family as Alolan Vulpix (Ice)', [S.lg.form, S.w.pl.mon.name]);
	A(canEvolve(S) && LG.nextOf(LG.BY[37], AV).map((q) => q[0] || q).join() === String(AN), 'it evolves along the forme\'s own line (into Alolan Ninetales, not Ninetales)', LG.nextOf(LG.BY[37], AV));
	A(codeOf(S) === typeCode(X.Uu, 'ice') && ultView(S).name === 'Absolute Zero', 'its Ultimate is its own first type\'s (Ice: Absolute Zero), not the species\'');
	const P = mk({ dex: 172, form: 25 });   // (Pikachu: Raichu or Alolan Raichu at 36)
	const nx = LG.nextOf(LG.BY[172], 25).map((q) => q[0] || q);
	A(nx.includes(26) && nx.includes(AR), 'a line with a forme at its end has both ways on: Pikachu into Raichu or Alolan Raichu', nx);
	P.w.pl.level = 36; processLeague(P);
	const cards = branchCards(P) || [];
	A(cards.length >= 2 && cards.some((c) => /Alolan Raichu/.test(c.title)) && cards.some((c) => / > Raichu|Raichu$/.test(c.title) && !/Alolan/.test(c.title)), 'at its level the cards offer the choice, by name', cards.map((c) => c.title));
	const pick = cards.find((c) => /Alolan Raichu/.test(c.title)); if (pick) pick.apply(P.w, P.w.pl);
	A(P.lg.form === AR && P.w.pl.mon.name === 'Alolan Raichu' && P.w.pl.mon.types.join() === 'electric,psychic', 'chosen: you are Alolan Raichu (Electric / Psychic)', [P.lg.form, P.w.pl.mon.name, P.w.pl.mon.types]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
