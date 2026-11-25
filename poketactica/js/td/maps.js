// td/maps.js — the Tower Defense maps (owner, 2026-11-23: 3 hand-built at launch; Map Maker paths later). Each is a board
// in the campaign's map format (rows of heights, ground, theme) plus its PATHS: from each gate to the base, drawn here as
// corner points and walked out tile by tile. The road is dirt; everything else takes a tower.
//   rows: '.' height 0, '1'-'9' a height, '#' no tile.   ground letters: campaign.js GROUND_CHAR.
const walk = (pts) => {
	const out = [[...pts[0]]];
	for (let i = 1; i < pts.length; i++) {
		let [x, y] = out[out.length - 1];
		const [tx, ty] = pts[i];
		while (x !== tx || y !== ty) { if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); out.push([x, y]); }
	}
	return out;
};
/** The road onto the ground rows (dirt), so the path shows on any theme. */
function make(m) {
	const paths = m.corners.map(walk), ground = m.ground.map((r) => r.split(''));
	for (const p of paths) for (const [x, y] of p) ground[y][x] = 'd';
	const { corners, ...rest } = m;
	return Object.freeze({ ...rest, ground: ground.map((r) => r.join('')), paths, base: paths[0][paths[0].length - 1] });
}

export const TD_MAPS = Object.freeze([
	make({ id: 'td-loop', scenery: 'woods', name: 'Meadow Loop', theme: 'meadow',
		tip: 'One road that doubles back twice. The low hills between its lanes reach two lanes at once.',
		rows: [
			'............',
			'............',
			'............',
			'...11111....',
			'...12221....',
			'............',
			'....1111....',
			'....1221....',
			'............',
			'............',
		],
		ground: [
			'gggggggggggg',
			'gggggggggggg',
			'ggtggggggtgg',
			'gggsssssgggg',
			'gggsssssgggg',
			'gggggggggggg',
			'ggggssssgggg',
			'ggggssssgwwg',
			'gggggggggggg',
			'ggtggggggggg',
		],
		corners: [[[0, 1], [10, 1], [10, 5], [1, 5], [1, 8], [11, 8]]] }),
	make({ id: 'td-ridge', scenery: 'crags', name: 'Switchback Ridge', theme: 'ruins',
		tip: 'A long climb back and forth. The ridges between the lanes are high ground: +10% damage a level.',
		rows: [
			'................',
			'..2...2...2...1.',
			'..2...2...2...1.',
			'..3...3...3...1.',
			'..3...3...3.....',
			'..3...3...3.....',
			'..3...3...3.....',
			'..3...3...3.....',
			'..2...2...2.....',
			'..2...2...2.....',
			'..1...1...1.....',
			'................',
		],
		ground: [
			'ssssssssssssssss',
			'ssssssssssssssss',
			'ssssssssssssssss',
			'ssssssssssssssss',
			'sssssssssssstsss',
			'ssssssssssssssss',
			'ssssssssssssssss',
			'sssssssssssstsss',
			'ssssssssssssssss',
			'ssssssssssssssss',
			'ssssssssssssssss',
			'ssssssssssssssss',
		],
		corners: [[[0, 0], [0, 11], [4, 11], [4, 0], [8, 0], [8, 11], [12, 11], [12, 0], [15, 0], [15, 6]]] }),
	make({ id: 'td-twin', scenery: 'lake', name: 'Twin Gates', theme: 'islands',
		tip: 'Two gates, two roads that meet before your base. Hold the crossing, or split your squad.',
		rows: [
			'..............',
			'..............',
			'..............',
			'..11..........',
			'..11...22.....',
			'.......22.....',
			'..11...22.....',
			'..11..........',
			'..............',
			'..............',
			'..............',
		],
		ground: [
			'aaaaaaaaaaaaaa',
			'aaaaaaaaaaaaaa',
			'aaaaaaaaaaaaaa',
			'aassaaaaawwaaa',
			'aassaaassawaaa',
			'aaaaaaassaaaaa',
			'aassaaassawaaa',
			'aassaaaaawwaaa',
			'aaaaaaaaaaaaaa',
			'aaaaaaaaaaaaaa',
			'aaaaaaaaaaaaaa',
		],
		corners: [[[0, 1], [5, 1], [5, 5], [6, 5], [6, 3], [10, 3], [10, 5], [13, 5]], [[0, 9], [5, 9], [5, 5], [6, 5], [6, 7], [10, 7], [10, 5], [13, 5]]] }),
]);

// ---------------------------------------------------------------- MAZE BUILDER (owner, 2026-11-24; Plans/POKETACTICA_MAZE_BUILDER_PLAN.md)
// No road: `gates` and a `base`. Enemies walk the shortest way over flat ground; the player bends it with blocks
// (td/maze.js). A raised tile ('1'-'9') is a rock: no way through, and a figurine may stand on it. Water is no way
// through and takes nothing. Every map needs `ground` (terrain blocks change it).
// THE SIZE (owner, 2026-11-25: "the maps are too small in maze builder make them 4x the size"): the maps below are drawn
// small, as they were first played (MAZE_MAPS_SMALL), and every tile of one is laid out as 2 by 2 for the maps the game
// plays today (MAZE_MAPS: twice as wide and twice as deep, four times the ground). A gate or a base on the far edge stays
// on the far edge. A run or replay recorded before TD_RULES_REV 16 plays on the small one (tdMapById's rev).
export const BIG_MAPS_REV = 16, MAP_SCALE = 2;
function big(m) {
	const k = MAP_SCALE, w = m.rows[0].length, h = m.rows.length;
	const wide = (rows) => rows.flatMap((r) => { const line = r.split('').map((c) => c.repeat(k)).join(''); return Array.from({ length: k }, () => line); });
	const at = ([x, y]) => [x * k + (x >= w / 2 ? k - 1 : 0), y * k + (y >= h / 2 ? k - 1 : 0)];
	return Object.freeze({ ...m, big: true, rows: wide(m.rows), ground: wide(m.ground), gates: m.gates.map(at), base: at(m.base), ...(m.bases ? { bases: m.bases.map(at) } : {}) });
}
export const MAZE_MAPS_SMALL = Object.freeze([
	Object.freeze({ id: 'mz-field', scenery: 'woods', name: 'Open Field', theme: 'meadow',
		tip: 'One gate, one base and open ground. Fold the way back and forth with your blocks, and stand your figurines on them.',
		rows: [
			'............',
			'............',
			'...1........',
			'............',
			'............',
			'............',
			'........1...',
			'............',
			'............',
		],
		ground: [
			'gggggggggggg',
			'ggggggggtggg',
			'gggsgggggggg',
			'gggggggggggg',
			'gggggggggggg',
			'gggggggggggg',
			'gtggggggsggg',
			'gggggggggggg',
			'gggggggggggg',
		],
		gates: [[0, 4]], base: [11, 4] }),
	Object.freeze({ id: 'mz-pincer', scenery: 'crags', name: 'Pincer', theme: 'ruins',
		tip: 'Two gates, top and bottom, closing on your base. Every block changes two ways at once.',
		rows: [
			'.............',
			'.............',
			'......1......',
			'.............',
			'.............',
			'.............',
			'.............',
			'.............',
			'......1......',
			'.............',
			'.............',
		],
		ground: [
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
		],
		gates: [[1, 0], [1, 10]], base: [12, 5] }),
	Object.freeze({ id: 'mz-lake', scenery: 'lake', name: 'Lakeside Ridge', theme: 'islands',
		tip: 'A wide field. The lake and the ridge already bend the way: build on that. Water and Ice blocks suit the shore.',
		rows: [
			'................',
			'................',
			'.....1..........',
			'.....1..........',
			'.....1..........',
			'................',
			'..........1.....',
			'..........1.....',
			'................',
			'................',
		],
		ground: [
			'aaaaaaaaaaaaaaaa',
			'aaaaaaaaaaaaaaaa',
			'aaaaasaaaaaaaaaa',
			'aaaaasaawwwaaaaa',
			'aaaaasaawwwaaaaa',
			'aaaaaaaaawwaaaaa',
			'aaaaaaaaaasaaaaa',
			'aaaaaaaaaasaaaaa',
			'aaaaaaaaaaaaaaaa',
			'aaaaaaaaaaaaaaaa',
		],
		gates: [[0, 2]], base: [15, 7] }),
]);
// MORE MAPS (the improvement plan, item 14), each with a rule of its own. They were never played small: drawn at the
// small size like the first three and laid out 2 by 2 the same way.
//   mz-ford    a flooded middle: the water leaves two fords, and no block goes on water
//   mz-keeps   TWO BASES (`bases`): the enemies of a wave are split between them, and both must stay reachable
//   mz-drift   a MOVING GATE (`shift`): each wave comes through the next of its gates in turn; all must stay open
const MORE_MAPS_SMALL = Object.freeze([
	Object.freeze({ id: 'mz-ford', scenery: 'lake', name: 'Drowned Crossing', theme: 'islands', rule: 'A flooded middle',
		tip: 'The middle is under water: two fords are the only ways across, and no block goes on water. Shut neither, and make each one long.',
		rows: [
			'..............',
			'..............',
			'..............',
			'..............',
			'..............',
			'..............',
			'..............',
			'..............',
			'..............',
			'..............',
		],
		ground: [
			'aaaaaawwaaaaaa',
			'aaaaaawwaaaaaa',
			'aaaaaaaaaaaaaa',
			'aaaaaawwaaaaaa',
			'aaaaaawwaaaaaa',
			'aaaaaawwaaaaaa',
			'aaaaaawwaaaaaa',
			'aaaaaaaaaaaaaa',
			'aaaaaawwaaaaaa',
			'aaaaaawwaaaaaa',
		],
		gates: [[0, 4]], base: [13, 5] }),
	Object.freeze({ id: 'mz-keeps', scenery: 'crags', name: 'Twin Keeps', theme: 'ruins', rule: 'Two bases',
		tip: 'Two bases, one gate. Each wave splits between them, and neither may be walled off. One maze near the gate serves both; two serve each better.',
		rows: [
			'.............',
			'.............',
			'.............',
			'......1......',
			'.............',
			'.............',
			'.............',
			'......1......',
			'.............',
			'.............',
			'.............',
		],
		ground: [
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
			'sssssssssssss',
		],
		gates: [[0, 5]], base: [11, 0], bases: [[11, 0], [11, 10]] }),
	Object.freeze({ id: 'mz-drift', scenery: 'woods', name: 'Wandering Gate', theme: 'meadow', rule: 'A moving gate',
		tip: 'Three gates, one open at a time: each wave comes through the next. The bar says which. Build where their ways meet.',
		rows: [
			'..............',
			'..............',
			'..............',
			'.......1......',
			'..............',
			'..............',
			'.......1......',
			'..............',
			'..............',
			'..............',
		],
		ground: [
			'gggggggggggggg',
			'gggggggggggggg',
			'ggggggggggtggg',
			'gggggggsgggggg',
			'gggggggggggggg',
			'gggggggggggggg',
			'gggggggsgggggg',
			'ggtggggggggggg',
			'gggggggggggggg',
			'gggggggggggggg',
		],
		gates: [[0, 0], [0, 5], [0, 9]], shift: true, base: [13, 5] }),
]);
export const MAZE_MAPS = Object.freeze([...MAZE_MAPS_SMALL, ...MORE_MAPS_SMALL].map(big));
/** A map's lanes: one a gate, or (two bases) one a gate and base. -> { gates: [[x, y]], bases: [[x, y]] | null } */
export function lanesOf(m) {
	if (!m.bases) return { gates: m.gates.map(([x, y]) => [x, y]), bases: null };
	const gates = [], bases = [];
	for (const b of m.bases) for (const g of m.gates) { gates.push([g[0], g[1]]); bases.push([b[0], b[1]]); }
	return { gates, bases };
}
export const isMazeMap = (m) => !!(m && m.gates);
/** A Tower Defense map of either kind, by id; rev: as a run of that rules revision knew it (a Maze Builder map before 16: the small one). */
export const tdMapById = (id, rev) => TD_MAPS.find((m) => m.id === id) || (rev > 0 && rev < BIG_MAPS_REV ? MAZE_MAPS_SMALL : MAZE_MAPS).find((m) => m.id === id) || null;
