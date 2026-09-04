// followtest.js — owner-only follower previewer. Opens a blank 10x10 grass arena
// (MAP_FOLLOWTEST) and lets you walk while cycling the trailing follower through
// every species that has a walk sheet (data/pokemon_follow_index.json). Reached
// from the landing page's Explore section (owner tile → overworld/?followtest=1).
//   ?followtest=1                  # cycle all follower-sheet species
//   ?followtest=1&followset=a,b,c   # just these ids
//
// window.__followTest is set FIRST so savePos() no-ops while we're in the arena —
// the arena must never become your persisted position (a normal reload returns
// you to wherever you really were).
const FALLBACK = ['gigalion', 'twydra', 'catastropod', 'harvinger', 'moreel', 'novagon', 'darkjaws'];
const DIRS = ['down', 'left', 'right', 'up'], ROW = { down: 0, left: 1, right: 2, up: 3 };

export function mount(ow) {
	window.__followTest = true; // gate savePos before any warp happens

	const p = new URLSearchParams(location.search);
	const custom = (p.get('followset') || '').split(',').map(s => s.trim()).filter(Boolean);
	let ids = custom.length ? custom : FALLBACK.slice();
	let i = 0;

	// warp into the blank grass arena, then load the full species index
	(async () => {
		try { await ow.moveToMap('FollowTest', 5, 5); } catch (e) { /* stay put if the arena fails to load */ }
		try { ow.Settings.set('followers', true); ow.refreshFollower(); } catch (e) { /* overlay still works */ }
		if (!custom.length) {
			try {
				const r = await fetch(new URL('data/pokemon_follow_index.json', location.href));
				if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) ids = j; }
			} catch (e) { /* fall back to the built-in set */ }
		}
	})();

	// overlay
	const box = document.createElement('div');
	box.id = 'ft-overlay';
	box.style.cssText = 'position:fixed;left:12px;top:12px;z-index:400;background:rgba(18,14,30,0.92);color:#e9e4ff;'
		+ 'border:1px solid #6a5f8a;border-radius:10px;padding:10px 12px;font:12px Consolas,monospace;user-select:none;min-width:300px';
	const label = document.createElement('div'); label.style.cssText = 'font-weight:700;margin-bottom:4px;color:#ffd25f';
	const sub = document.createElement('div'); sub.style.cssText = 'color:#a99fc9;margin-bottom:8px';
	sub.textContent = '[ / ] step · SHIFT+[ / ] jump 25 · arrows walk';
	const cv = document.createElement('canvas');
	cv.width = 300; cv.height = 80;
	cv.style.cssText = 'image-rendering:pixelated;background:#0d0b16;border-radius:6px;display:block';
	box.append(label, sub, cv);
	document.body.appendChild(box);
	const cx = cv.getContext('2d');

	const step = d => { if (ids.length) i = (i + ids.length + d) % ids.length; };
	const onKey = e => {
		const j = e.shiftKey ? 25 : 1;
		if (e.key === ']' || e.key === '.') { step(j); e.preventDefault(); }
		else if (e.key === '[' || e.key === ',') { step(-j); e.preventDefault(); }
	};
	addEventListener('keydown', onKey);

	let raf;
	const tick = () => {
		const id = ids[i] || FALLBACK[0];
		const f = ow.follower; if (f) f.id = id;                 // pin the live follower to the chosen sprite
		label.textContent = `FOLLOWER TEST  ${i + 1}/${ids.length}  —  ${id}`;
		const img = ow.followSheet(id);
		cx.clearRect(0, 0, cv.width, cv.height);
		cx.imageSmoothingEnabled = false;
		if (img) {
			const frame = Math.floor(performance.now() / 180) % 4;   // animate across the 4 walk columns
			DIRS.forEach((dir, d) => cx.drawImage(img, frame * 32, ROW[dir] * 32, 32, 32, 8 + d * 73, 8, 64, 64));
		} else {
			cx.fillStyle = '#a99fc9'; cx.font = '12px monospace'; cx.fillText('loading ' + id + '…', 10, 42);
		}
		raf = requestAnimationFrame(tick);
	};
	raf = requestAnimationFrame(tick);
	return { get ids() { return ids; }, get index() { return i; }, stop: () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); box.remove(); window.__followTest = false; } };
}
