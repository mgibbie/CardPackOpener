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
// Lab, nothing spent. Not here yet: research (the points a run's KOs give a family).

/** A run with nothing from the Lab. */
export const noMeta = () => ({ row: null, eff: { lab: {}, stats: {}, boosts: {}, perk: 0, charm: false, shinyMember: false }, excl: new Set(), master: false, candy: false, honeyAt: [200, 300], used: [] });
/** The run's row and what it gives. M: the 2D game's G.ExpMeta (with the Expedition save opened); o: { Sv: G.ExpSave,
 *  member: the League member played, boosts: the boosts spent on this run (spendBoosts) }. */
export function metaFor(M, o) {
	const row = M.rowNow(o.boosts || []);
	row[3] = o.member && o.Sv.has('league.shiny', String(o.member)) ? 1 : 0;   // (rowNow reads the 2D game's own run for this: there is none here)
	const eff = M.effects(row);
	const excl = new Set(M.UNLOCKS.filter((u) => !M.bought(u.id)).map((u) => u.id).concat(M.archived(eff.lab.archive)));
	return { row, eff, excl, master: !!eff.boosts.master, candy: !!eff.boosts.candy, honeyAt: (M.K.HONEY_AT || [200, 300]).slice(), used: (o.boosts || []).slice() };
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
/** A Lab level in this run. */
export const lab = (S, id) => (S.meta ? S.meta.eff.lab[id] || 0 : 0);
/** Is an item out of this run's pool? (Not bought yet, or archived.) */
export const excluded = (S, id) => !!(S.meta && S.meta.excl.has(id));
/** A boost of this run. */
export const boost = (S, id) => !!(S.meta && S.meta.eff.boosts[id]);
/** The run's first wild League member or shiny faints at once, with a Master Ball. -> true, once */
export function useMaster(S) { if (!S.meta || !S.meta.master) return false; S.meta.master = false; return true; }
