// micasurvivor_shiny_roam_test.mjs — 2D Expedition: a roaming shiny does not stand still at a wall (micasurvivor/js/expedition/
// capture.js roam). The bug (found in #1022, 2026-11-09; redone on main 2026-11-14): a shiny walked straight at a target past a
// cliff, a wall or a tree and stood there, or jittered in a corner, until its next pick, 2.4-4.6 s later.
//   * walking into a wall, it picks a new heading within half a second
//   * wedged so that it barely moves (jittering), likewise
//   * in the open it keeps its heading (no needless picks)
//   node overworld/tests/micasurvivor_shiny_roam_test.mjs
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const G = loadG(['systems/expedition.js', 'expedition/save.js', 'expedition/meta.js', 'expedition/classic.js', 'expedition/items.js', 'expedition/capture.js']);
G.FX = { twinkle() { } };
const roam = G.ExpCap.roam;
A(typeof roam === 'function', 'capture.js lets the tests reach a shiny\'s walk');

/** A shiny at (0, 0) heading for (tx, ty) with `left` seconds before its next pick; the world: `wall(e)` -> blocked? */
function walk(tx, ty, left, wall, secs = 0.5) {
	let n = 0; const rng = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
	const e = { x: 0, y: 0, kx: 0, ky: 0, spd: 60, r: 6, flying: false, frozenT: 0, sleepT: 0, sparkT: 1, anim: { dir: 0, loop() { } }, xroam: { rng, t: left, tx, ty, ct: 0, cx: 0, cy: 0 } };
	G.World = { collide: wall };
	const pl = { x: 0, y: 0 }, picks = [];
	for (let i = 0; i < secs * 60; i++) { const before = e.xroam.tx + ',' + e.xroam.ty; roam.call(e, 1 / 60, pl); if (e.xroam.tx + ',' + e.xroam.ty !== before) picks.push(+(i / 60).toFixed(2)); }
	return { picks, x: e.x, y: e.y };
}
// a wall just east of it: it cannot go past x = 10
const wall = (e) => { if (e.x > 10) { e.x = 10; return true; } return false; };
const w1 = walk(400, 0, 4, wall);
A(w1.picks.length >= 1 && w1.picks[0] <= 0.5, 'its target past a wall: it picks a new heading within half a second (not 2.4-4.6 s later)', w1);
// wedged: every step is pushed most of the way back (a corner it jitters in)
const corner = (e) => { const d = Math.hypot(e.x, e.y); if (d > 2) { e.x *= 2 / d; e.y *= 2 / d; return true; } return false; };
const w2 = walk(400, 300, 4, corner);
A(w2.picks.length >= 1 && w2.picks[0] <= 0.5, 'wedged so that it barely moves: a new heading within half a second', w2);
// the open: it walks on for its time
const w3 = walk(400, 0, 4, () => false, 1.5);
A(w3.picks.length === 0 && w3.x > 30, 'in the open it keeps its heading and walks (no needless picks)', w3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
