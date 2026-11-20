// progress.js — what a battle does to the player's FIGURINE collection (stage 5). Pure: the page passes the battle's
// results (engine/battle.js results()) and the seeded rng; this returns the grown collection and a report to show.
//   - every figurine that fought keeps its EXP (won or lost: Disgaea's way) -> levels, new moves into its pool
//   - move XP onto each move it used (figurine.js gainMoveXp; move levels 1-99)
//   - a Pokémon caught on the base tile becomes the player's figurine (a new id: it is a new object)
//   - a WIN pays the Bonus Gauge up to its level: stars (the page banks them: site/stars.js), EXP and move XP spread over
//     the team, figurines (a species from this map's wild ones; rarer = higher level and a better shiny chance); items and
//     card packs are listed as owed (stage 5b pays them)
import { gainExp, gainMoveXp, makeFigurine } from './figurine.js';
import { addFig } from './figcol.js';

/**
 * col: the collection; team: { uid -> figurine id } (the battle's player units); res: battle results();
 * opts: { data, rng, wildSpecies: [species ids on this map], seed }
 * -> { col, report: { levels: [{ id, species, from, to, newMoves }], caught: [fig], stars, owed: [reward], figurines: [fig] } }
 */
export function applyResults(col, team, res, opts) {
	const { data, rng, wildSpecies = [], seed = 'b' } = opts;
	let figs = { ...col.figs };
	const report = { levels: [], caught: [], stars: 0, owed: [], figurines: [] };
	const grow = (id, exp) => {
		const f = figs[id]; if (!f || !(exp > 0)) return;
		const g = gainExp(f, exp, data);
		figs[id] = g.fig;
		const r = report.levels.find((x) => x.id === id);
		if (r) { r.to = g.fig.level; r.newMoves.push(...g.newMoves); } else report.levels.push({ id, species: f.species, from: f.level, to: g.fig.level, newMoves: [...g.newMoves] });
	};
	// EXP earned in the battle (by the unit that knocked foes out)
	for (const [uid, exp] of Object.entries(res.exp || {})) if (team[uid]) grow(team[uid], exp);
	// move XP per unit and move
	for (const [k, xp] of Object.entries(res.moveXp || {})) {
		const [uid, mid] = k.split(':'), id = team[uid];
		if (id && figs[id]) figs[id] = gainMoveXp(figs[id], mid, xp);
	}
	// catches: a new figurine each (its own id)
	let col2 = { ...col, figs };
	for (const [i, f] of (res.captured || []).entries()) {
		const fig = { ...f, id: (f.species + '-cap-' + seed + '-' + i).replace(/[^a-z0-9_-]/g, '').slice(0, 60), from: 'capture' };
		col2 = addFig(col2, fig);
		report.caught.push(fig);
	}
	figs = col2.figs;
	// the Bonus Gauge (only a win pays it: battle.js bonusPayout)
	const ids = Object.values(team).filter((id) => figs[id]);
	const teamLv = ids.length ? Math.round(ids.reduce((a, id) => a + figs[id].level, 0) / ids.length) : 5;
	for (const [i, b] of (res.bonus || []).entries()) {
		if (b.kind === 'stars') report.stars += b.n;
		else if (b.kind === 'exp' && ids.length) for (const id of ids) grow(id, Math.floor(b.n / ids.length));
		else if (b.kind === 'moveXp' && ids.length) for (const id of ids) for (const mid of figs[id].equipped) figs[id] = gainMoveXp(figs[id], mid, Math.floor(b.n / ids.length));
		else if (b.kind === 'figurine' && wildSpecies.length) {
			const sp = wildSpecies[Math.floor(rng() * wildSpecies.length)];
			const lv = Math.max(1, Math.round(teamLv * (b.rarity === 'rare' ? 1.15 : b.rarity === 'uncommon' ? 1.05 : 0.95)));
			const fig = { ...makeFigurine(sp, lv, rng, data, { id: (sp + '-bonus-' + seed + '-' + i).replace(/[^a-z0-9_-]/g, '').slice(0, 60), shinyRate: b.rarity === 'rare' ? 1 / 64 : 1 / 512 }), from: 'bonus' };
			col2 = addFig({ ...col2, figs }, fig); figs = col2.figs;
			report.figurines.push(fig);
		} else if (b.kind === 'item' || b.kind === 'pack') report.owed.push(b);
	}
	return { col: { ...col2, figs }, report };
}

/** The battle for a team: Training Grounds' wild Pokémon at the team's level (until the campaign's maps). */
export function wildLevelFor(teamFigs) {
	const lv = teamFigs.length ? teamFigs.reduce((a, f) => a + f.level, 0) / teamFigs.length : 5;
	return Math.max(2, Math.round(lv * 0.92));
}
