// expperks.js — MicaSurvivor 3D, Expedition: the upgrades you bought for your Pokémon (the 2D game's "Upgrades" screen).
//
// They are per FAMILY (the best level of each among its stages) and live in the base save, which the 3D page reads and
// never writes. The levels become the 2D game's own perks (js/data/upgrades.js: G.Upgrades.perks), and a run starts
// with them as a 2D Expedition run does:
//   Vitality + 8 HP · Strength + 4 % damage · Stride + 3 % speed · Reflexes - 3 % cooldown · Shell + 2 % defence ·
//   Synthesis + 0.2 HP/s · Magnet + 12 % reach · Wisdom + 5 % XP · Critical Hit + 3 % · Calibre + 8 % size (a level each)
//   Card change: + 1 Refresh a level · Veto: + 1 Banish a level, and the moves you vetoed never come on the cards
//   Second chance: a heart a level: when you fall you are back at full HP, 2.5 s unhurt, and what is near is thrown back
//   TM: the League kit's first move is the move you picked · Repertoire: the kit's second move from level 1
// Fortune (+ 8 % Pokémonedas) does nothing in an Expedition run, in 2D either: its pay is the Expedition's own.
// Pure: no DOM, no clock.
import { U } from './combat.js';
import { knock } from './actors.js';

const num = (v) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
const famOf = (G, dex) => (G.Families ? G.Families.membersOf(dex) : [+dex]);
/** The upgrade levels that count for `dex`: per family, the best of each among its stages (the 2D game's levelsOf). */
export function levelsOf(G, base, dex) {
	const out = {};
	if (!base || !base.pupg) return out;
	for (const d of famOf(G, dex)) { const u = base.pupg[d]; if (u) for (const id in u) out[id] = Math.max(out[id] || 0, num(u[id])); }
	return out;
}
/** A per-Pokémon pick (`ptm` the TM's move, `pban` the vetoes): its own, else the first of its family's that has one. */
export function familyPick(G, base, field, dex) {
	const m = base && base[field]; if (!m) return undefined;
	const has = (v) => v != null && (!Array.isArray(v) || v.length);
	if (has(m[dex])) return m[dex];
	for (const d of famOf(G, dex)) if (has(m[d])) return m[d];
	return undefined;
}
/** The moves a TM can pick for `dex` (the 2D game's tmPool): its types' and the Normal ones (Mew: all), no support moves. */
export function tmPool(G, dex) {
	const mon = G.DEX_BY[dex]; if (!mon) return [];
	return G.Moves.ALL.filter((m) => m.kind !== 'buff' && (+dex === 151 || m.type === 'normal' || mon.types.includes(m.type))).map((m) => m.id);
}
/** What a run of `dex` starts with, from the base save as read: the 2D game's perks, the TM's move (or null), the vetoed
 *  moves. null when there is nothing to read it with. */
export function perksOf(G, base, dex) {
	if (!G.Upgrades || !base) return null;
	const lv = levelsOf(G, base, dex), P = G.Upgrades.perks(lv);
	const tm = P.tm ? familyPick(G, base, 'ptm', dex) : null, bans = familyPick(G, base, 'pban', dex);
	return { ...P, levels: lv, tmMove: tm && tmPool(G, dex).includes(tm) ? tm : null, banned: (Array.isArray(bans) ? bans : []).slice(0, P.bans).map(String) };
}

/** Put the perks' stats on the player the fight was built with (before the run's levels and its League are set up). */
export function applyPerks(S, P) {
	const pl = S.w.pl; if (!P) return null;
	S.up = { ...P, revives: P.revives | 0, used: 0 };
	pl.maxHp += P.hp || 0; pl.hp = pl.maxHp;
	pl.atkMul *= P.atkMul || 1; pl.spdMul *= P.spdMul || 1; pl.cdMul *= P.cdMul || 1;
	pl.baseReduce += P.dmgReduce || 0; pl.baseRegen += P.regen || 0;
	pl.magnet *= P.magnetMul || 1; pl.xpMul *= P.xpMul || 1; pl.crit += P.crit || 0;
	pl.sizePerk = P.size || 1;
	return S.up;
}
/** After the run's levels are set up: the tools the perks add (never above the 2D game's cap), the vetoed moves, and
 *  the second chance, asked after every item that could have saved you. */
export function perkTools(S) {
	const P = S.up, w = S.w, pl = w.pl; if (!P) return;
	if (S.lv) {
		const K = S.L.K, cap = K.TOOL_MAX || 6;
		S.lv.refreshes = Math.min(cap, S.lv.refreshes + (P.rerolls | 0));
		S.lv.bans = Math.min(cap, S.lv.bans + (P.bans | 0));
		for (const id of P.banned || []) S.lv.banned.add(id);
	}
	if (P.revives > 0) {
		const hooks = w.hooks || (w.hooks = {}), prev = hooks.ko;
		hooks.ko = (ww) => {
			if (prev && prev(ww)) return true;
			if (!(S.up.revives > 0)) return false;
			S.up.revives--; S.up.used++;
			pl.hp = pl.maxHp; pl.invuln = 2.5;
			const R = 260 * U;
			for (const e of ww.enemies) { if (e.dead || e.boss) continue; const dx = e.a.x - pl.s.x, dz = e.a.z - pl.s.z, d = Math.hypot(dx, dz); if (d < R) knock(e.a, (d > 1e-6 ? dx / d : 1) * 500 * U, (d > 1e-6 ? dz / d : 0) * 500 * U); }
			ww.events.push({ k: 'secondchance', left: S.up.revives, x: pl.s.x, y: pl.s.y, z: pl.s.z, r: R });
			return true;
		};
	}
}
