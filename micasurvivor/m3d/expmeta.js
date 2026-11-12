// expmeta.js — MicaSurvivor 3D, going live (Plans/MICASURVIVOR_3D_PLAN.md §5.42): what the LAB gives a 3D run. In the 2D
// game a run starts with a ROW read from your save (js/expedition/meta.js rowNow / effects): your Lab's levels, your
// shiny perks, and the boosts you armed. A 3D run now starts with the same row, read by the 2D game's own code:
//
//   the Lab      + uses of Refresh / Skip / Banish; + vitamin slots; a fourth card at each level; a Max Revive to start
//                with; a third Support Alpha slot; your Archive (items you keep out of the pool)
//   the items    the 25 the Lab sells stay out of a run's pool until you have bought them
//   shiny perks  + luck, + XP, a Shiny Charm every run, + damage (and more as your League's shiny member)
//   boosts       spent when the run starts (as in 2D): Rare Candy (+2 levels), Lucky Egg (+25 % XP), Amulet Coin
//                (+50 % money), Honey (an extra alpha in each zone), Dawn Stone (a shiny in zone 1), Master Ball (your
//                first wild League member or shiny faints at once)
//
// Pure: the page hands in the 2D game's Lab (G.ExpMeta) and the opened save. A practice run has no row: nothing of the
// Lab, nothing spent.
//
// RESEARCH: each KO gives its Pokémon's family points (1; an elite 2, a summoner 4, an alpha 5, a boss 10), a freed cage
// 25; the Lab's "Research" adds 25 % a level. A family researched to its need gives you its avatar. (The 2D game's
// numbers: meta.js K.RS; the page writes them with the run: expsave.js.)

/** A run with nothing from the Lab. */
export const noMeta = () => ({ rs: {}, RS: { ko: 1, elite: 2, summoner: 4, alpha: 5, boss: 10, cage: 25, LAB: 0.25 }, row: null, eff: { lab: {}, stats: {}, boosts: {}, perk: 0, charm: false, shinyMember: false }, excl: new Set(), master: false, candy: false, honeyAt: [200, 300], used: [] });
/** The run's row and what it gives. M: the 2D game's G.ExpMeta (with the Expedition save opened); o: { Sv: G.ExpSave,
 *  member: the League member played, boosts: the boosts spent on this run (spendBoosts) }. */
export function metaFor(M, o) {
	const row = M.rowNow(o.boosts || []);
	row[3] = o.member && o.Sv.has('league.shiny', String(o.member)) ? 1 : 0;   // (rowNow reads the 2D game's own run for this: there is none here)
	const eff = M.effects(row);
	const excl = new Set(M.UNLOCKS.filter((u) => !M.bought(u.id)).map((u) => u.id).concat(M.archived(eff.lab.archive)));
	return { rs: {}, RS: { ...M.K.RS }, row, eff, excl, master: !!eff.boosts.master, candy: !!eff.boosts.candy, honeyAt: (M.K.HONEY_AT || [200, 300]).slice(), used: (o.boosts || []).slice() };
}
/** The boosts armed for the next run that you still have: spent now (the 2D game's keys), and the arming cleared.
 *  dev: this browser's id; store: localStorage. -> their ids */
export function spendBoosts(M, Sv, dev, store) {
	const use = M.armed().filter((id) => M.boostHave(id) > 0);
	for (const id of use) Sv.bump('bu.' + id + '.' + dev, 1);
	try { store.setItem('micasurvivorexp_boosts', '[]'); } catch (e) { /* the pick is a convenience */ }
	if (use.length) Sv.commit();
	return use;
}
/** A KO's research, to its family. ko: { boss, xk, dex } (combat.js w.kos). */
export function researchKo(S, ko) {
	const m = S.meta, fam = m && S.X.G ? S.X.G.FAM[ko.dex] : 0; if (!fam) return 0;
	const R = m.RS, pts = ko.boss || ko.xk === 'guardian' || ko.xk === 'legend' ? R.boss : ko.xk === 'alpha' || ko.xk === 'totem' ? R.alpha : ko.xk === 'summoner' ? R.summoner : ko.xk === 'elite' ? R.elite : R.ko;
	m.rs[fam] = (m.rs[fam] || 0) + pts; return pts;
}
/** A freed cage's research, to its Pokémon's family. */
export function researchCage(S, dex) { const m = S.meta, fam = m && S.X.G ? S.X.G.FAM[dex] : 0; if (!fam) return 0; m.rs[fam] = (m.rs[fam] || 0) + m.RS.cage; return m.RS.cage; }
/** What the run's research adds to each family: [[family, points]], with the Lab's "Research" counted. */
export function researchOf(S) { const m = S.meta; if (!m) return []; const k = 1 + m.RS.LAB * (m.eff.lab.research || 0); return Object.keys(m.rs).map((fam) => [+fam, Math.round(m.rs[fam] * k)]).filter((q) => q[1] > 0); }
/** A Lab level in this run. */
export const lab = (S, id) => (S.meta ? S.meta.eff.lab[id] || 0 : 0);
/** Is an item out of this run's pool? (Not bought yet, or archived.) */
export const excluded = (S, id) => !!(S.meta && S.meta.excl.has(id));
/** A boost of this run. */
export const boost = (S, id) => !!(S.meta && S.meta.eff.boosts[id]);
/** The run's first wild League member or shiny faints at once, with a Master Ball. -> true, once */
export function useMaster(S) { if (!S.meta || !S.meta.master) return false; S.meta.master = false; return true; }
