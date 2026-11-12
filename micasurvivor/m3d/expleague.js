// expleague.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): the Expedition League in a 3D run, on top of
// expedition.js and explevel.js. You play a League MEMBER: a family, from its first stage. Its stats come from the
// stage's real base stats; its KIT of four moves is learned at Lv 1 / 2 / 4 / 7 and owns the four move slots (so a new
// move only ever comes as a swap); it has a role (a small stat mod) and its final stage's ability for the whole run;
// it EVOLVES at the real level (two or more targets: that level's cards are the choice) and, once it can evolve no
// further, MATURES at Lv 24 and 44.
//
// The roster, the kits, the evolution levels, the stats' formulas and the roles are the 2D game's own
// (js/expedition/league.js and league-data.js), read as they are.
//
// 3D's own: a body here does not run at its species' speed (how it moves comes from its types: sim.js), so a stage's
// speed is a factor on the run speed, 1 at the League's baseline (105). When an evolution changes your types, how you
// move changes with them (a Charmeleon that becomes a Charizard can glide).
//
// Not here yet: Mega Evolution, the League's own moves on other members' cards, the wild encounters, the TM and
// Repertoire upgrades, which members you have (every member can be played here), a shiny's look.
import { tuneFor } from './sim.js';
import { say } from './expedition.js';

/** The 2D game's League, as this module reads it. G: its global with expedition/league-data.js and league.js loaded. */
export function leagueFrom(G) {
	const L = G.ExpLeague;
	return { K: L.K, BY: L.BY, FAM: L.FAM, statsOf: L.statsOf, nextOf: L.nextOf, evoLevel: L.evoLevel, finalsOf: L.finalsOf, factorOf: L.factorOf, abilityOf: (dex) => G.Abilities.of(dex) };
}
/** The member a species belongs to (its family's first stage), or Bulbasaur. */
export const memberOf = (LG, dex) => (LG.BY[dex] ? dex : LG.FAM[dex] && LG.BY[LG.FAM[dex]] ? LG.FAM[dex] : LG.K.DEFAULT);
const name = (S, dex) => { const m = S.data.mon(dex); return m ? m.name : '#' + dex; };

/** A move at its class's factor for the stage you are (a physical move on a special attacker is scaled down to it). */
function scaleMove(S, m) { if (m.dmg == null && !(m.x && m.x.b.dmg != null)) return; m.xk = S.X.G.factorOf(m.id, S.lg.st); if (m.x) S.L.M.refresh(S.w.pl, m); else m.dmg *= m.xk; }
/** The stage's body and stats on the player: types, size, HP, armour, attack, speed. prev: the stage it was. */
function become(S, d, prev) {
	const w = S.w, pl = w.pl, LG = S.X.G, st = LG.statsOf(d), base = S.data.mon(d);
	pl.mon = { ...base, hp: st.hp, atk: st.atk }; pl.r = S.data.radius(d);
	pl.baseAtk = st.atk;
	pl.maxHp = Math.max(1, pl.maxHp + st.hp - prev.hp); pl.hp = Math.min(pl.hp, pl.maxHp);
	pl.baseReduce = Math.max(0, pl.baseReduce - prev.taken + st.taken);
	pl.spdMul *= (st.spd / LG.K.SPD0) / (prev.spd / LG.K.SPD0);
	w.tune = tuneFor(pl.mon.types || []); w.fastK = undefined; w.fastTune = null;   // (its types decide how it moves)
	S.lg.st = st;
	for (const m of pl.moves) scaleMove(S, m);
	return st;
}
function learnKit(S, i) {
	const w = S.w, pl = w.pl, id = S.X.G.BY[S.lg.member].kit[i];
	if (!id || pl.moves.some((m) => m.id === id) || pl.moves.length >= S.L.K.MAX_MOVES) return false;
	const m = w.data.move(id); pl.moves.push(m);
	S.L.M.base(m); scaleMove(S, m);
	S.lg.kit = Math.max(S.lg.kit, i + 1);
	return true;
}
/** Make a run a League run: the member's first stage (the world was built as it), its role, the kit's first move. */
export function setupLeague(S, member) {
	const w = S.w, pl = w.pl, LG = S.X.G, m = LG.BY[member], K = LG.K;
	S.lg = { member, form: member, kit: 0, mat: 0, evo: 0, done: 1, pending: null, st: null, role: m.role, ability: pl.ability, log: [] };
	// (the world gave it the species' base-game HP and attack: the League's own take their place)
	const raw = S.data.mon(member);
	become(S, member, { hp: raw.hp, taken: 0, spd: K.SPD0 });
	pl.hp = pl.maxHp;
	const r = K.ROLE[m.role] || {};
	if (r.regen) pl.baseRegen += r.regen;
	if (r.atk) pl.atkMul *= 1 + r.atk;
	if (r.taken) pl.baseReduce += r.taken;
	if (r.spd) pl.spdMul *= 1 + r.spd;
	pl.moves.length = 0; w.orbs.length = 0;
	learnKit(S, 0);
	return S.lg;
}
/** Evolve into `to`: its body, types and stats; HP up to at least half, then 30 % more. */
export function evolve(S, to, lv) {
	const pl = S.w.pl, LG = S.X.G, G = S.lg; if (!G || LG.FAM[to] !== G.member || !S.data.mon(to)) return false;
	const from = G.form;
	become(S, to, G.st);
	pl.hp = Math.min(pl.maxHp, Math.max(pl.hp, pl.maxHp * LG.K.EVO_FLOOR) + pl.maxHp * LG.K.EVO_HEAL);
	G.form = to; G.evo++; G.pending = null; G.log.push([lv || pl.level, 'evo', to]);
	if (S.syncPerks) S.syncPerks();
	say(S, `${name(S, from)} evolved into ${name(S, to)}!`, 3);
	S.w.events.push({ k: 'evolve', from, to });
	return true;
}
function mature(S, lv) {
	const pl = S.w.pl, K = S.X.G.K, G = S.lg, add = Math.round(pl.maxHp * K.MATURE_K);
	G.mat++; pl.atkMul *= 1 + K.MATURE_K; pl.maxHp += add; pl.hp += add;
	G.log.push([lv, 'mat', G.mat]);
	say(S, `${name(S, G.form)} reached Maturity ${G.mat}!`, 3);
}
/** Every level reached since the last look: kit moves, an evolution (or a branch to choose), Maturity. */
export function processLeague(S) {
	const G = S.lg, pl = S.w.pl, LG = S.X.G, K = LG.K; if (!G || G.pending) return;
	const m = LG.BY[G.member];
	while (G.done < pl.level && !G.pending) {
		const lv = G.done + 1, ki = K.KIT_AT.indexOf(lv);
		if (ki > 0 && learnKit(S, ki)) { G.log.push([lv, 'kit', m.kit[ki]]); say(S, `Kit move: ${m.kit[ki]} (${ki + 1}/4)`, 2.6); }
		const nx = LG.nextOf(m, G.form);
		if (nx.length && lv >= LG.evoLevel(m, G.form)) {
			if (nx.length === 1) evolve(S, nx[0][0], lv);
			else { G.pending = { lv, opts: nx.map((q) => q[0]) }; G.done = lv; G.log.push([lv, 'branch', G.pending.opts.slice()]); return; }
		}
		if (!LG.nextOf(m, G.form).length && K.MATURE_AT.includes(lv)) mature(S, lv);
		G.done = lv;
	}
}
/** While a branch waits, the level's cards are the choice: one per form. null: no branch waiting. */
export function branchCards(S) {
	const G = S.lg, pl = S.w.pl, LG = S.X.G; if (!G || !G.pending) return null;
	return G.pending.opts.map((to) => {
		const st = LG.statsOf(to), p = S.data.mon(to);
		return { type: 'xevo', kind: 'evo', key: 'xevo:' + to, id: to, title: `${name(S, G.form)} > ${name(S, to)}`, tag: 'EVOLUTION', mtype: (p.types || [])[0], desc: `${(p.types || []).join(' / ')} · HP ${Math.round(pl.maxHp)} > ${Math.round(pl.maxHp + st.hp - G.st.hp)}`,
			apply: () => { evolve(S, to, G.pending ? G.pending.lv : pl.level); processLeague(S); } };
	});
}
/** Does this stage still evolve? (Eviolite asks.) */
export const canEvolve = (S) => !!(S.lg && S.X.G.nextOf(S.X.G.BY[S.lg.member], S.lg.form).length);
