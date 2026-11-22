// poketactica_spwalk_test.mjs — SP from walking (owner, 2026-11-22: "SP should refill slowly from moving. each tile
// traversed can recover 2% SP rounded up"): a walk of n tiles gives back n x ceil(2% of max SP), capped at the max; Undo
// takes it back; the enemy and PvP seats walk by the same rule; a battle from before the rule (no setup.rev) replays by
// the old rules, so saved battles and old replays play exactly as they were played. Pure: node only.
//   node overworld/tests/poketactica_spwalk_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { arenaById, matchSetup } from '../../poketactica/js/arenas.js';
import { recipeOf, replayTo } from '../../poketactica/js/replay.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };
const fig = (sp, lv, seed) => makeFigurine(sp, lv, makeRng(seed || sp), data, { id: sp + '-' + (seed || 'x'), shinyRate: 0 });
const W = 10, H = 10;
const map = () => ({ w: W, h: H, height: Array(W * H).fill(0), base: { x: 0, y: 9 } });
const setupOf = (rev, enemy = [{ fig: fig('rattata', 5), x: 9, y: 0, ai: 'hold' }]) => ({ map: map(), player: [fig('pikachu', 30, 'p1'), fig('machamp', 60, 'p2')], enemy, ...(rev ? { rev } : {}) });
const walk = (S, uid, x, y) => B.act(S, { t: 'move', uid, x, y }, data);

try {
	A(B.RULES_REV >= 2 && B.SP_WALK === 0.02, 'the rule: 2% of max SP per tile walked (rules rev 2 and up)');
	// ---- the numbers
	let S = B.newBattle('spw-1', setupOf(B.RULES_REV), data);
	B.act(S, { t: 'deploy', uid: 'p0' }, data);
	const u = B.unit(S, 'p0'), per = Math.ceil(u.maxSP * 0.02);
	A(per >= 1 && per === Math.ceil(u.maxSP / 50), `max SP ${u.maxSP}: ${per} per tile (2%, rounded up)`);
	u.sp = 0;
	const steps = Math.min(3, B.moveNow(S, u));
	let r = walk(S, 'p0', 0, 9 - steps);
	A(r.ok && u.sp === steps * per, `a walk of ${steps} tiles gives back ${steps * per} SP`, [u.sp, r.why]);
	const mv = r.events.find((e) => e.t === 'move');
	A(mv && mv.sp === steps * per, 'the move event says how much (the page pops "+N SP")', mv);
	r = B.act(S, { t: 'undo', uid: 'p0' }, data);
	A(r.ok && u.sp === 0 && u.x === 0 && u.y === 9, 'Undo takes the walk back, and its SP with it');
	// counting tiles walked, not distance: around a wall the path is longer
	{
		const m = map(); for (let y = 7; y <= 9; y++) m.height[y * W + 1] = 9;   // a wall at x = 1 from y 7 down (round it: 8 tiles)
		const S2 = B.newBattle('spw-wall', { ...setupOf(B.RULES_REV), map: m }, data);
		B.act(S2, { t: 'deploy', uid: 'p1' }, data);
		const v = B.unit(S2, 'p1'); v.sp = 0; v.move = 8; v.jump = 2;
		const per2 = Math.ceil(v.maxSP * 0.02);
		r = walk(S2, 'p1', 2, 9);
		const tiles = r.events.find((e) => e.t === 'move').path.length - 1;
		A(r.ok && tiles > 2 && v.sp === tiles * per2, `round a wall: ${tiles} tiles walked (2 apart as the crow flies) -> ${tiles * per2} SP`, [tiles, v.sp]);
	}
	// never past the max
	{
		const S3 = B.newBattle('spw-max', setupOf(B.RULES_REV), data);
		B.act(S3, { t: 'deploy', uid: 'p0' }, data);
		const v = B.unit(S3, 'p0'); v.sp = v.maxSP - 1;
		walk(S3, 'p0', 0, 6);
		A(v.sp === v.maxSP, 'SP stops at its max', [v.sp, v.maxSP]);
		v.sp = v.maxSP; B.act(S3, { t: 'undo', uid: 'p0' }, data);
		A(v.sp === v.maxSP - 1, 'and an Undo puts back exactly what it had');
	}
	// ---- the enemy walks by the same rule
	{
		const S4 = B.newBattle('spw-foe', setupOf(B.RULES_REV, [{ fig: fig('rattata', 5), x: 9, y: 0, ai: 'aggro' }]), data);
		B.act(S4, { t: 'deploy', uid: 'p0' }, data);
		const e = S4.units.find((x) => x.side === 'e'); e.sp = 0;
		const r4 = B.act(S4, { t: 'end' }, data);
		const m4 = r4.events.find((x) => x.t === 'move' && x.uid === e.uid);
		A(m4 && m4.sp > 0 && e.sp >= m4.sp - 0, 'a foe that walks gets SP back too', [m4, e.sp]);
	}
	// the enemy AI knows it: out of SP for every attack, it walks (as far as it can) instead of standing still; with SP, it
	// attacks as before
	{
		const S7 = B.newBattle('spw-ai', setupOf(B.RULES_REV, [{ fig: fig('rattata', 20), x: 1, y: 8, ai: 'aggro' }]), data);
		B.act(S7, { t: 'deploy', uid: 'p1' }, data);
		const e = S7.units.find((x) => x.side === 'e'); e.sp = 0;
		const r7 = B.act(S7, { t: 'end' }, data);
		const m7 = r7.events.find((x) => x.t === 'move' && x.uid === e.uid);
		A(m7 && m7.path.length - 1 >= B.moveNow(S7, e) - 1 && m7.sp > 0 && !r7.events.some((x) => x.t === 'queue' && x.uid === e.uid), 'a foe with no SP for any attack takes a long walk to win SP back (no attack)', m7);
		const S8 = B.newBattle('spw-ai2', setupOf(B.RULES_REV, [{ fig: fig('rattata', 20), x: 1, y: 8, ai: 'aggro' }]), data);
		B.act(S8, { t: 'deploy', uid: 'p1' }, data);
		const r8 = B.act(S8, { t: 'end' }, data);
		A(r8.events.some((x) => x.t === 'queue' && x.uid === S8.units.find((u) => u.side === 'e').uid), 'with SP it attacks as before');
		const S9 = B.newBattle('spw-ai3', setupOf(null, [{ fig: fig('rattata', 20), x: 1, y: 8, ai: 'aggro' }]), data);
		B.act(S9, { t: 'deploy', uid: 'p1' }, data);
		S9.units.find((x) => x.side === 'e').sp = 0;
		const r9 = B.act(S9, { t: 'end' }, data);
		const m9 = r9.events.find((x) => x.t === 'move' && x.uid === S9.units.find((u) => u.side === 'e').uid);
		A(!m9 || m9.path.length - 1 <= 1, 'in a battle from before the rule it does what it did then (no SP walk)', m9);
	}
	// ---- PvP seats
	{
		const ms = matchSetup({ arena: 'plateau', lv: 50, seats: [{ name: 'a', team: [fig('pikachu', 10, 'x')] }, { name: 'b', team: [fig('eevee', 10, 'y')] }] }, 'seed', data, makeFigurine, makeRng);
		A(ms.rev === B.RULES_REV, 'an online match is made on the current rules');
		const S5 = B.newBattle('spw-pvp', ms, data);
		B.act(S5, { t: 'deploy', uid: 'a0', by: 'a' }, data);
		const v = B.unit(S5, 'a0'); v.sp = 0;
		r = B.act(S5, { t: 'move', uid: 'a0', x: 0, y: 7, by: 'a' }, data);
		A(r.ok && v.sp === 2 * Math.ceil(v.maxSP * 0.02), 'a PvP figurine regains SP walking');
	}
	// ---- older battles keep the old rules (a saved battle resumes, an old replay plays, exactly as before)
	{
		const S6 = B.newBattle('spw-old', setupOf(null), data);
		B.act(S6, { t: 'deploy', uid: 'p0' }, data);
		const v = B.unit(S6, 'p0'); v.sp = 0;
		walk(S6, 'p0', 0, 6);
		A(v.sp === 0 && S6.rev === 1, 'a battle from before the rule (no setup.rev): no SP from walking');
		const acts = [{ t: 'deploy', uid: 'p0' }, { t: 'move', uid: 'p0', x: 0, y: 6 }, { t: 'end' }];
		const rec = recipeOf('spw-rec', setupOf(B.RULES_REV), acts);
		A(rec.setup.rev === B.RULES_REV && JSON.stringify(B.view(replayTo(rec, 3, data))) === JSON.stringify(B.view(B.replay('spw-rec', setupOf(B.RULES_REV), acts, data))), "a replay keeps its rules' rev and replays the same");
		A(recipeOf('x', setupOf(null), acts).setup.rev === undefined, 'an old recipe stays an old recipe');
	}
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
