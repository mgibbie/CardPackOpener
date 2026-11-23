// poketactica_td_status_test.mjs — STATUS MOVES ON A TOWER (owner, 2026-11-23; TD_RULES_REV 9, td/effects.js). The status
// moves the battle rules gained in the sweep had no kind in Tower Defense, so a tower that knew only those never fired.
// The ones with something to do on a road now have one; each is run here in the real simulation.
//   node overworld/tests/poketactica_td_status_test.mjs
import * as TD from '../../poketactica/js/td/sim.js';
import { tdKind, TD_KINDS } from '../../poketactica/js/td/effects.js';
import { tdMapById } from '../../poketactica/js/td/maps.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const data = loadData();
const fig = (sp, lv, moves) => { let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-td' + lv, shinyRate: 0 }); f = equip({ ...f, pool: [...f.pool.filter((p) => !moves.includes(p.id)), ...moves.map((id) => ({ id, lv: 1, xp: 0 }))] }, moves); return { ...f, ability: null }; };
const LOOP = tdMapById('td-loop');
/** One tower with these moves beside the road, the first waves called; ticks run. -> { S, u (its unit), evs: every event } */
function play(moves, ticks = 700, o = {}) {
	const S = TD.newRun('tds', { map: LOOP, squad: [fig(o.sp || 'machamp', o.lv || 30, moves)], ...(o.rev ? { rev: o.rev } : {}) }, data);
	const evs = [];
	for (let i = 0; i < ticks && !S.over; i++) {
		TD.step(S, i === 0 ? [{ t: 'place', fig: 0, x: 5, y: 2 }, { t: 'call' }] : S.phase !== 'wave' && i % 40 === 0 ? [{ t: 'call' }] : [], data);
		for (const e of S.ev) evs.push({ ...e, tick: S.tick });
		if (o.each) o.each(S);
	}
	return { S, u: S.B.units.find((x) => x.uid === 't0'), evs };
}
const used = (r, id) => r.evs.filter((e) => e.t === 'use' && e.move === id).length;
const kind = (id, tdRev) => tdKind(id, B.moveOf({ fig: { pool: [{ id, lv: 1, xp: 0 }] } }, id, data), B.RULES_REV, tdRev);

// ---------- what each is, and was
{
	const now = { bellydrum: 'buff', focusenergy: 'buff', lockon: 'buff', soak: 'foe', gastroacid: 'foe', foresight: 'foe', meanlook: 'foe', spiderweb: 'foe', wish: 'sp', aquaring: 'sp', gravity: 'field', trickroom: 'field', metronome: 'damage', naturepower: 'damage' };
	const off = Object.entries(now).filter(([id, k]) => kind(id) !== k || kind(id, 8) !== 'none').map(([id]) => id + ': ' + kind(id) + ' / ' + kind(id, 8));
	A(!off.length && TD_KINDS.includes('field'), `${Object.keys(now).length} status moves have a use on a tower now, and had none under TD rev 8`, off);
	const still = ['protect', 'substitute', 'taunt', 'encore', 'disable', 'reflect', 'perishsong', 'destinybond', 'mist', 'attract'];
	A(still.every((id) => kind(id) === 'none'), 'what guards a unit or needs a foe that acts still has none (Protect, Substitute, Taunt, Encore, Reflect ...)', still.filter((id) => kind(id) !== 'none'));
}
// ---------- boosts
{
	let top = 0;
	const r = play(['bellydrum', 'karatechop'], 500, { each: (S) => { const u = S.B.units.find((x) => x.uid === 't0'); if (u) top = Math.max(top, u.boosts.atk); } });
	A(used(r, 'bellydrum') >= 1 && top === 6 && r.u.hp === r.u.maxHP, 'Belly Drum: the tower\'s Attack goes to +6 for a while (a tower has no HP to pay with)', [used(r, 'bellydrum'), top]);
	const f = play(['focusenergy', 'karatechop'], 600);
	A(used(f, 'focusenergy') === 1 && f.u.focus === true, 'Focus Energy is used once: it stays on');
	const l = play(['lockon', 'megakick'], 1500);
	A(used(l, 'lockon') >= 2 && used(l, 'megakick') >= 2, 'Lock-On is used again each time its sure hit has been spent', [used(l, 'lockon'), used(l, 'megakick')]);
}
// ---------- on an enemy
{
	let soaked = 0;
	const r = play(['soak'], 500, { each: (S) => { for (const e of S.enemies) { const v = S.B.units.find((x) => x.uid === e.uid); if (v && v.types.join() === 'Water') soaked++; } } });
	A(used(r, 'soak') >= 1 && soaked > 0, 'a tower that knows only Soak fires it: enemies turn Water type', [used(r, 'soak'), soaked]);
	const old = play(['soak'], 500, { rev: 8 });
	A(used(old, 'soak') === 0, 'a run recorded under TD rev 8 replays as it was played (it never fired)');
	let stopped = 0;
	const m = play(['meanlook'], 500, { each: (S) => { for (const e of S.enemies) if (e.stop > S.tick) stopped++; } });
	const st = m.evs.filter((e) => e.t === 'stopped');
	A(used(m, 'meanlook') >= 1 && st.length >= 1 && stopped > 0 && st.every((e) => e.ticks === TD.TRAP_TICKS), 'Mean Look: the enemy stops walking for 2 seconds', [used(m, 'meanlook'), st.length]);
	const byEnemy = {}; for (const e of st) (byEnemy[e.uid] = byEnemy[e.uid] || []).push(e.tick);
	A(Object.values(byEnemy).every((ts) => ts.every((t, i) => !i || t - ts[i - 1] >= 3 * TD.TRAP_TICKS)), 'and the same enemy cannot be stopped that way again for 6 seconds', byEnemy);
}
// ---------- SP, the field, Metronome
{
	const w = play(['wish', 'karatechop'], 900, { lv: 12 });
	A(used(w, 'wish') >= 1 && w.evs.some((e) => e.t === 'sp'), 'Wish gives the tower SP back, as the healing moves do', used(w, 'wish'));
	let on = 0, offAfter = false;
	const g = play(['gravity'], TD.WEATHER_TICKS + 500, { each: (S) => { if (B.fieldOn(S.B, 'gravity')) on++; } });
	const starts = g.evs.filter((e) => e.t === 'field' && e.on), ends = g.evs.filter((e) => e.t === 'field' && !e.on);
	offAfter = ends.length >= 1 && ends[0].tick - starts[0].tick === TD.WEATHER_TICKS;
	A(starts.length >= 1 && on > 0 && offAfter, 'Gravity is on for as long as a weather lasts, then off', [starts.length, ends.length, ends[0] && ends[0].tick - starts[0].tick]);
	const me = play(['metronome'], 500);
	A(used(me, 'metronome') >= 1 && me.evs.some((e) => e.t === 'calls') && me.evs.some((e) => e.t === 'hit'), 'Metronome fires as whatever move it turns into', used(me, 'metronome'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
