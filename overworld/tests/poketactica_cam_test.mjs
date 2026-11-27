// poketactica_cam_test.mjs — FEEL: THE CAMERA EASES WHEREVER IT FOLLOWS (Plans/POKETACTICA_MODES_PLAN.md item A7;
// poketactica/js/cam.js). Zoomed in, a battle's view (and Tower Defense's, and the Map Maker's) used to CUT to the cursor
// when it left the middle of the screen; it glides there now, as Mystery Maze's does. And Settings has an animation speed.
// Pure: node only.   node overworld/tests/poketactica_cam_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { easePan, animSpeed, ANIM_SPEEDS, CAM_RATE, CAM_CUT, CAM_NEAR } from '../../poketactica/js/cam.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };

// ---------- the glide
{
	const from = { x: 0, z: 0 }, to = { x: 3, z: 0 };
	const one = easePan(from, to, 1 / 60);
	A(!one.done && one.pan.x > 0.5 && one.pan.x < 1.2 && one.pan.z === 0, `one frame at 60 a second covers about a quarter of the way (${one.pan.x.toFixed(2)} of 3 tiles): it does not cut`, one);
	let p = from, frames = 0, last = 0, mono = true;
	for (; frames < 200; frames++) { const r = easePan(p, to, 1 / 60); if (r.pan.x < last) mono = false; last = r.pan.x; p = r.pan; if (r.done) break; }
	A(p.x === 3 && p.z === 0 && frames > 8 && frames < 40 && mono, `it arrives in ${frames} frames (about ${(frames / 60).toFixed(2)} s), never going back, and ends exactly there`, [frames, p]);
	A(from.x === 0 && to.x === 3, 'what it is handed is not changed');
	// a slow frame is capped, so a stutter is not a jump across the board
	const slow = easePan(from, to, 2);
	A(slow.pan.x < 3 && slow.pan.x === easePan(from, to, 0.1).pan.x, 'a long frame moves no further than a tenth of a second would');
	// far away: it cuts (a new board, the far end of a big map)
	const cut = easePan(from, { x: CAM_CUT + 0.5, z: 0 }, 1 / 60), near = easePan(from, { x: CAM_CUT - 0.5, z: 0 }, 1 / 60);
	A(cut.done && cut.pan.x === CAM_CUT + 0.5 && !near.done && near.pan.x < CAM_CUT - 0.5, `more than ${CAM_CUT} tiles away it cuts; nearer it glides`);
	// tiles of any size: the cut is counted in tiles
	const big = easePan(from, { x: 30, z: 0 }, 1 / 60, 10);
	A(!big.done && big.pan.x > 5 && big.pan.x < 12, 'with tiles 10 units wide, 3 tiles away still glides (the cut is counted in tiles)');
	// already there
	A(easePan({ x: 3, z: 0 }, to, 1 / 60).done && easePan({ x: 3 - CAM_NEAR / 2, z: 0 }, to, 1 / 60).pan.x === 3, 'there, or as good as there: it is done');
	A(CAM_RATE === 16, 'at Mystery Maze\'s own rate');
}
// ---------- the animation speed
{
	A(animSpeed(null) === 1 && animSpeed(undefined) === 1 && animSpeed('nonsense') === 1 && animSpeed('quick') === 1.5 && animSpeed('slow') === 0.7 && Object.keys(ANIM_SPEEDS).length === 2, 'normal, quicker (half as fast again), slower (0.7); a value this build does not know is normal');
}
// ---------- the page
{
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8'), hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8');
	A(/function follow\(centre, snap\)/.test(main) && /if \(snap \|\| reducedMotion\(\)\) \{ P\.panTo = null; P\.pan = to;/.test(main) && /P\.panTo = to;/.test(main), 'following the cursor sets where the view is going; it cuts only when told to, or with reduced motion');
	A(/stepAnims\(dt\);\s*camEase\(dt\);/.test(main) && /const r = easePan\(P\.pan, P\.panTo, dt, CELL\);/.test(main), 'the frame steps the glide');
	A((main.match(/P\.panTo = null;/g) || []).length >= 5, 'a drag, a zoom, Mystery Maze\'s own steering and arriving all end a glide');
	A(/follow\(false, true\); previewArea\(\)/.test(main), 'a test\'s cursor is placed at once (tests read the screen straight after)');
	A(/\* animSpeed\(P\.animSpeed\)/.test(main) && /name: 'Animation speed', where: 'Battles'/.test(hub) && /P\.animSpeed = lsGet\(ANIM_KEY\)/.test(main), 'Settings has the animation speed, and the battle\'s clock reads it');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
