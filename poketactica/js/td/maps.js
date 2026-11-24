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
	make({ id: 'td-loop', name: 'Meadow Loop', theme: 'meadow',
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
	make({ id: 'td-ridge', name: 'Switchback Ridge', theme: 'ruins',
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
	make({ id: 'td-twin', name: 'Twin Gates', theme: 'islands',
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
export const MAZE_MAPS = Object.freeze([
	Object.freeze({ id: 'mz-field', name: 'Open Field', theme: 'meadow',
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
	Object.freeze({ id: 'mz-pincer', name: 'Pincer', theme: 'ruins',
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
	Object.freeze({ id: 'mz-lake', name: 'Lakeside Ridge', theme: 'islands',
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
export const isMazeMap = (m) => !!(m && m.gates);
/** A Tower Defense map of either kind, by id. */
export const tdMapById = (id) => TD_MAPS.find((m) => m.id === id) || MAZE_MAPS.find((m) => m.id === id) || null;
