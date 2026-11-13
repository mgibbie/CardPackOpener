// micasurvivor_m3d_dive_light_test.mjs — MicaSurvivor 3D, Dive part 14 (Plans/MICASURVIVOR_3D_PLAN.md §5.67): the dark
// routes (micasurvivor/m3d/divelight.js), in node.
//   * each route's darkness is the 2D game's own (js/expedition/dive-art.js ROUTES' dim)
//   * a lit route keeps the 3D game's sky and fog
//   * the darker the route, the nearer the fog and the closer its colour to the route's; the screen's edges are tinted
//   node overworld/tests/micasurvivor_m3d_dive_light_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DIM, LK, lightOf } from '../../micasurvivor/m3d/divelight.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = { color: 0x9fc4e8, near: 26, far: 78 };

// the 2D game's numbers: each route's block in dive-art.js, and its dim
{
	const art = fs.readFileSync(path.join(HERE, '../../micasurvivor/js/expedition/dive-art.js'), 'utf8').split('\r\n').join('\n');
	const two = {};
	for (const r of Object.keys(DIM)) {
		const at = art.search(new RegExp('\n    ' + r + ': \{')), m = at < 0 ? null : /dim: (null|\[[^\]]*\])/.exec(art.slice(at));
		two[r] = m ? (m[1] === 'null' ? null : m[1].slice(1, -1).split(',').map(Number)) : undefined;
	}
	A(Object.keys(DIM).length === 9 && Object.keys(DIM).every((r) => JSON.stringify(two[r]) === JSON.stringify(DIM[r])), "each route's darkness is the 2D game's own (dive-art.js)", two);
	const render = fs.readFileSync(path.join(HERE, '../../micasurvivor/m3d/render.js'), 'utf8');
	A(/FOG0 = \{ color: 0x9fc4e8, near: 26, far: 78 \}/.test(render) && /const FOG = \{ color: new THREE\.Color\(0x9fc4e8\), near: 26, far: 78 \}/.test(render), "the sky and fog this test starts from are the renderer's");
}
// lit routes
for (const r of ['forest', 'canyon', 'origin', 'nowhere']) {
	const L = lightOf(r, BASE);
	A(L.color === BASE.color && L.near === BASE.near && L.far === BASE.far && L.vignette === null && L.dark === 0, `${r}: a lit route keeps the 3D game's sky and fog`, L);
}
// dark routes
{
	const order = ['ruins', 'grotto', 'reef', 'marsh', 'fungal', 'crater'], Ls = order.map((r) => lightOf(r, BASE));
	A(order.every((r, i) => !i || DIM[r][3] > DIM[order[i - 1]][3]), 'from the ruins\' shade to the crater\'s dark');
	A(Ls.every((L, i) => L.far < BASE.far && L.near < BASE.near && L.far > L.near && (!i || (L.far < Ls[i - 1].far && L.near < Ls[i - 1].near && L.dark > Ls[i - 1].dark))), 'the darker the route, the nearer the fog comes', Ls.map((L) => [Math.round(L.near), Math.round(L.far)]));
	const cr = lightOf('crater', BASE), ru = lightOf('ruins', BASE);
	A(cr.far >= LK.FAR && cr.far < 32 && cr.near >= LK.NEAR, `in the crater you see about ${Math.round(cr.far)} m (never nearer than the lamp's ${LK.FAR} m)`, cr);
	A(ru.far > 60, `in the ruins nearly as far as in the open (${Math.round(ru.far)} m)`, ru);
	const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
	A(Ls.every((L, i) => dist(rgb(L.color), DIM[order[i]]) < dist(rgb(BASE.color), DIM[order[i]])) && dist(rgb(cr.color), DIM.crater) < 30, "the air takes the route's colour (the crater's almost wholly)", rgb(cr.color));
	A(cr.vignette === `rgba(44,16,34,${+(0.74 * LK.VIGNETTE).toFixed(3)})` && ru.vignette.startsWith('rgba(22,18,26,0.09'), "the screen's edges are tinted with it, by the route's alpha", [cr.vignette, ru.vignette]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
