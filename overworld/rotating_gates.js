// rotating_gates.js — pokeemerald's rotating gate puzzles (src/rotating_gate.c):
// FORTREE GYM (in front of WINONA) and TRICK HOUSE PUZZLE 6.
//
// Both maps' ON_TRANSITION runs `special RotatingGate_InitPuzzle`, and the gates
// themselves are C: sprites the map does not know about, and a collision check the
// player's movement runs (field_player_avatar.c CheckForObjectEventCollision ->
// CheckForRotatingGatePuzzleCollision). None of it was ported, so the gates did not
// exist: no arms drawn, nothing in the way, and both puzzles were open floor.
//
// HOW A GATE WORKS. A gate's pivot sits on a tile CORNER — the top-left corner of
// tile (x, y) — and its arms (one or two tiles long) lie along tile EDGES. So an arm
// never fills a tile; it blocks the step that crosses the edge it lies on. Walking
// into an arm pushes it: the gate turns a quarter (clockwise or anticlockwise, by
// which side of the pivot you pushed) and you walk on through — unless one of its
// arms would sweep through a wall (map collision 1), in which case it does not turn
// and you are stopped.
//
// STATE. Each gate's orientation is a byte in the temp vars (VAR_TEMP_0 up, two
// gates a var), reset to the puzzle's start by InitPuzzle every time the map is
// entered. Temp vars clear on every warp, so on BOTH maps the gates are back in
// their original layout whenever you come in, and keep their turns while you stay
// (a trainer battle included: the map is not re-entered).
//
// Coordinates are map-local (the decomp adds MAP_OFFSET to both sides).

const GATE_SHAPE = { L1: 0, L2: 1, L3: 2, L4: 3, T1: 4, T2: 5, T3: 6, T4: 7 };
const SHAPE_NAME = ['l1', 'l2', 'l3', 'l4', 't1', 't2', 't3', 't4'];
const O0 = 0, O90 = 1, O180 = 2, O270 = 3;

// sRotatingGate_FortreePuzzleConfig / sRotatingGate_TrickHousePuzzleConfig
export const FORTREE_GATES = [
	{ x: 6, y: 7, shape: GATE_SHAPE.T2, orientation: O90 },
	{ x: 9, y: 15, shape: GATE_SHAPE.T2, orientation: O180 },
	{ x: 3, y: 19, shape: GATE_SHAPE.T2, orientation: O90 },
	{ x: 2, y: 6, shape: GATE_SHAPE.T1, orientation: O90 },
	{ x: 9, y: 12, shape: GATE_SHAPE.T1, orientation: O0 },
	{ x: 6, y: 23, shape: GATE_SHAPE.T1, orientation: O0 },
	{ x: 12, y: 22, shape: GATE_SHAPE.T1, orientation: O0 },
	{ x: 6, y: 3, shape: GATE_SHAPE.L4, orientation: O180 },
];
export const TRICK_HOUSE_GATES = [
	{ x: 14, y: 5, shape: GATE_SHAPE.T1, orientation: O90 },
	{ x: 10, y: 6, shape: GATE_SHAPE.L2, orientation: O180 },
	{ x: 6, y: 6, shape: GATE_SHAPE.L4, orientation: O90 },
	{ x: 14, y: 8, shape: GATE_SHAPE.T1, orientation: O90 },
	{ x: 3, y: 10, shape: GATE_SHAPE.L3, orientation: O270 },
	{ x: 9, y: 14, shape: GATE_SHAPE.L1, orientation: O90 },
	{ x: 3, y: 15, shape: GATE_SHAPE.T3, orientation: O0 },
	{ x: 2, y: 17, shape: GATE_SHAPE.L2, orientation: O180 },
	{ x: 12, y: 18, shape: GATE_SHAPE.T3, orientation: O270 },
	{ x: 5, y: 18, shape: GATE_SHAPE.L4, orientation: O90 },
	{ x: 10, y: 19, shape: GATE_SHAPE.L3, orientation: O180 },
];
// GetCurrentMapRotatingGatePuzzleType (the Hoenn2_ copy of the gym is the same room)
const PUZZLES = {
	FortreeCity_Gym: FORTREE_GATES, Hoenn2_FortreeCity_Gym: FORTREE_GATES,
	Route110_TrickHousePuzzle6: TRICK_HOUSE_GATES, Hoenn2_Route110_TrickHousePuzzle6: TRICK_HOUSE_GATES,
};
export const puzzleFor = mapName => PUZZLES[mapName] || null;

// sRotatingGate_ArmLayout: per shape, [north short, north long, east.., south.., west..]
const ARM_LAYOUT = [
	[1, 0, 1, 0, 0, 0, 0, 0], [1, 1, 1, 0, 0, 0, 0, 0], [1, 0, 1, 1, 0, 0, 0, 0], [1, 1, 1, 1, 0, 0, 0, 0],
	[1, 0, 1, 0, 1, 0, 0, 0], [1, 1, 1, 0, 1, 0, 0, 0], [1, 0, 1, 1, 1, 0, 0, 0], [1, 0, 1, 0, 1, 1, 0, 0],
];
const ROTATE_ANTICLOCKWISE = 1, ROTATE_CLOCKWISE = 2;
const NONE = 255;
const ROT = (dir, arm, long) => (dir << 4) | (arm << 1) | long;
const CW = (arm, long) => ROT(ROTATE_CLOCKWISE, arm, long), ACW = (arm, long) => ROT(ROTATE_ANTICLOCKWISE, arm, long);
const N = 0, E = 1, S = 2, W = 3;
// sRotatingGate_RotationInfo*: what a step into each square of the gate's 4x4
// (pivot - 2 .. pivot + 1) pushes, by the direction walked
const ROTATION_INFO = {
	up: [NONE, NONE, NONE, NONE, CW(W, 1), CW(W, 0), ACW(E, 0), ACW(E, 1), NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE],
	down: [NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE, ACW(W, 1), ACW(W, 0), CW(E, 0), CW(E, 1), NONE, NONE, NONE, NONE],
	left: [NONE, ACW(N, 1), NONE, NONE, NONE, ACW(N, 0), NONE, NONE, NONE, CW(S, 0), NONE, NONE, NONE, CW(S, 1), NONE, NONE],
	right: [NONE, NONE, CW(N, 1), NONE, NONE, NONE, CW(N, 0), NONE, NONE, NONE, ACW(S, 0), NONE, NONE, NONE, ACW(S, 1), NONE],
};
// sRotatingGate_ArmPositions*Rotation: the cells an arm sweeps through as it turns
const ARM_POS_CW = [[0, -1], [1, -2], [0, 0], [1, 0], [-1, 0], [-1, 1], [-1, -1], [-2, -1]];
const ARM_POS_ACW = [[-1, -1], [-1, -2], [0, -1], [1, -1], [0, 0], [0, 1], [-1, 0], [-2, 0]];

// the orientation bytes: gate i is byte (i & 1) of VAR_TEMP_(i >> 1), low byte first
const tempVar = i => 'VAR_TEMP_' + (i >> 1).toString(16).toUpperCase();
export function getOrientation(story, i) {
	const v = story.getVar(tempVar(i)) | 0;
	return (i & 1 ? v >> 8 : v) & 0xFF;
}
function setOrientation(story, i, o) {
	const v = story.getVar(tempVar(i)) | 0;
	story.setVar(tempVar(i), i & 1 ? (v & 0x00FF) | ((o & 0xFF) << 8) : (v & 0xFF00) | (o & 0xFF));
}

// RotatingGate_InitPuzzle -> RotatingGate_ResetAllGateOrientations
export function initPuzzle(story, mapName) {
	const gates = puzzleFor(mapName);
	if (!gates) return false;
	gates.forEach((g, i) => setOrientation(story, i, g.orientation));
	anims.length = 0;
	return true;
}

function hasArm(story, gates, i, armInfo) {
	const arm = armInfo >> 1, isLong = armInfo & 1;
	const armOrientation = (arm - getOrientation(story, i) + 4) % 4;
	return !!ARM_LAYOUT[gates[i].shape][armOrientation * 2 + isLong];
}
// RotatingGate_CanRotate. collisionAt(x, y) -> the map's collision (0..3). The
// vanilla game only treats collision 1 as a wall here (the decomp's BUGFIX would
// take any non-zero); the layouts' walls are 1.
function canRotate(story, gates, i, dir, collisionAt) {
	const pos = dir === ROTATE_ANTICLOCKWISE ? ARM_POS_ACW : dir === ROTATE_CLOCKWISE ? ARM_POS_CW : null;
	if (!pos) return false;
	const o = getOrientation(story, i), g = gates[i];
	for (let a = N; a <= W; a++) {
		for (let j = 0; j < 2; j++) {
			if (!ARM_LAYOUT[g.shape][2 * a + j]) continue;
			const [dx, dy] = pos[2 * ((o + a) % 4) + j];
			if (collisionAt(g.x + dx, g.y + dy) === 1) return false;
		}
	}
	return true;
}
function rotate(story, i, dir) {
	const o = getOrientation(story, i);
	setOrientation(story, i, dir === ROTATE_ANTICLOCKWISE ? (o ? o - 1 : O270) : (o + 1) % 4);
}

// the gate turns you see: { gate, from, dir, t0, ms }
const anims = [];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// CheckForRotatingGatePuzzleCollision, for a step `dir` (up/down/left/right) onto
// (x, y). Turns the gate it pushes. True = the step is blocked. `fast` is the
// bike's quicker turn (the *Faster affine anims).
export function checkGateCollision(story, mapName, dir, x, y, collisionAt, { fast = false, animate = true } = {}) {
	const gates = puzzleFor(mapName);
	const info = ROTATION_INFO[dir];
	if (!gates || !info) return false;
	for (let i = 0; i < gates.length; i++) {
		const gx = gates[i].x, gy = gates[i].y;
		if (!(gx - 2 <= x && x <= gx + 1 && gy - 2 <= y && y <= gy + 1)) continue;
		const r = info[(y - gy + 2) * 4 + (x - gx + 2)];
		if (r === NONE) continue;
		const rotDir = r >> 4, armInfo = r & 0xF;
		if (!hasArm(story, gates, i, armInfo)) continue;
		if (!canRotate(story, gates, i, rotDir, collisionAt)) return true;
		if (animate) {
			for (let k = anims.length - 1; k >= 0; k--) if (anims[k].gate === i) anims.splice(k, 1);
			anims.push({ gate: i, from: getOrientation(story, i), dir: rotDir, t0: now(), ms: fast ? 133 : 267 });
		}
		rotate(story, i, rotDir);
		return false;
	}
	return false;
}

// the arms each gate has right now, as edges: [{ gate, x0, y0, x1, y1 }] in tile
// units from the pivot corner (debug / tests)
export function gateArms(story, mapName) {
	const gates = puzzleFor(mapName);
	if (!gates) return [];
	const out = [];
	const UNIT = [[0, -1], [1, 0], [0, 1], [-1, 0]];
	gates.forEach((g, i) => {
		const o = getOrientation(story, i);
		for (let a = 0; a < 4; a++) {
			const len = ARM_LAYOUT[g.shape][2 * a + 1] ? 2 : ARM_LAYOUT[g.shape][2 * a] ? 1 : 0;
			if (!len) continue;
			const [ux, uy] = UNIT[(a + o) % 4];
			out.push({ gate: i, x0: g.x, y0: g.y, x1: g.x + ux * len, y1: g.y + uy * len });
		}
	});
	return out;
}

// --- drawing: the decomp's own gate pictures (graphics/rotating_gates, in fx/) ---
const imgs = {};
export function drawGates(ctx, camX, camY, story, mapName, getImage, META = 16) {
	const gates = puzzleFor(mapName);
	if (!gates) return;
	const t = now();
	gates.forEach((g, i) => {
		const name = SHAPE_NAME[g.shape];
		if (!(name in imgs)) { imgs[name] = null; getImage(`fx/rotating_gates/${name}.png`).then(im => { imgs[name] = im; }).catch(() => {}); }
		const im = imgs[name];
		if (!im) return;
		const px = g.x * META - camX, py = g.y * META - camY;
		if (px < -48 || py < -48 || px > ctx.canvas.width + 48 || py > ctx.canvas.height + 48) return;
		let quarter = getOrientation(story, i);
		const an = anims.find(a => a.gate === i);
		if (an) {
			const k = Math.min(1, (t - an.t0) / an.ms);
			if (k >= 1) anims.splice(anims.indexOf(an), 1);
			else quarter = an.from + (an.dir === ROTATE_CLOCKWISE ? k : -k);
		}
		ctx.save();
		ctx.imageSmoothingEnabled = false;
		ctx.translate(px, py);
		ctx.rotate(quarter * Math.PI / 2);   // orientation N = N quarter turns clockwise
		ctx.drawImage(im, -im.width / 2, -im.height / 2);
		ctx.restore();
	});
}
