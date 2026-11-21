// nav.js — spatial focus for the camp's screens: the arrows (and the d-pad) move the focus to the nearest button the way
// they point ON SCREEN, so a grid of figurine cards, a row of tabs and a column of menu buttons all move the same way
// without each screen wiring its own order. Pure: node-tested (overworld/tests/poketactica_ui_test.mjs).

/**
 * The next focus from `from` going `dir` ('up' | 'down' | 'left' | 'right') among `rects` ({ x, y, w, h }, screen px).
 * A candidate must lie that way (its centre past the current one's centre on that axis); the nearest wins, a sideways
 * offset counting double, so a step goes to the neighbour in the same row or column before one further across.
 * Nothing that way -> `from` (the focus stays).
 */
export function spatialNext(rects, from, dir) {
	const a = rects[from];
	if (!a) return rects.length ? 0 : -1;
	const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
	const [ax, ay] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] || [0, 0];
	let best = from, bestScore = Infinity;
	rects.forEach((r, i) => {
		if (i === from || !r || !(r.w > 0 && r.h > 0)) return;
		const dx = r.x + r.w / 2 - cx, dy = r.y + r.h / 2 - cy;
		const along = dx * ax + dy * ay;
		if (along <= 1) return;
		// the gap between the edges along the way (a tall card next to a short one still counts as adjacent)
		const gap = ax ? Math.max(0, ax > 0 ? r.x - (a.x + a.w) : a.x - (r.x + r.w)) : Math.max(0, ay > 0 ? r.y - (a.y + a.h) : a.y - (r.y + r.h));
		const overlap = ax ? Math.min(a.y + a.h, r.y + r.h) - Math.max(a.y, r.y) : Math.min(a.x + a.w, r.x + r.w) - Math.max(a.x, r.x);
		const off = Math.abs(ax ? dy : dx), across = overlap > 0 ? 0 : off;
		const score = gap + along * 0.1 + across * 2 + off * 0.05;   // (two that both line up: the more centred one)
		if (score < bestScore) { bestScore = score; best = i; }
	});
	return best;
}
