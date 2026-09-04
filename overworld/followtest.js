// followtest.js — owner-only follower preview (mounted by ?followtest=1 for the
// mgibbie account). Cycle the trailing follower through the AI-generated walk
// sheets (data/pokemon_follow/<id>.png) and eyeball them: it pins the in-world
// follower to the chosen sprite so it trails you as you walk, and shows an overlay
// with an animated preview of all four directions.
//   ?followtest=1                       # the default AI-generated set
//   ?followtest=1&followset=a,b,c        # any species ids you want to review
const DEFAULT_SET = ['gigalion', 'twydra', 'catastropod', 'harvinger', 'moreel', 'novagon', 'darkjaws'];
const DIRS = ['down', 'left', 'right', 'up'], ROW = { down: 0, left: 1, right: 2, up: 3 };

export function mount(ow) {
	const p = new URLSearchParams(location.search);
	const custom = (p.get('followset') || '').split(',').map(s => s.trim()).filter(Boolean);
	const ids = custom.length ? custom : DEFAULT_SET.slice();
	let i = 0;

	// make sure a follower actually spawns to trail the player
	try { ow.Settings.set('followers', true); ow.refreshFollower(); } catch (e) { /* overlay still works */ }

	const box = document.createElement('div');
	box.style.cssText = 'position:fixed;left:12px;top:12px;z-index:400;background:rgba(18,14,30,0.92);color:#e9e4ff;'
		+ 'border:1px solid #6a5f8a;border-radius:10px;padding:10px 12px;font:12px Consolas,monospace;user-select:none;min-width:288px';
	const label = document.createElement('div'); label.style.cssText = 'font-weight:700;margin-bottom:4px;color:#ffd25f';
	const sub = document.createElement('div'); sub.style.cssText = 'color:#a99fc9;margin-bottom:8px';
	sub.textContent = '[ or , = prev   ·   ] or . = next   ·   walk to see it trail';
	const cv = document.createElement('canvas');
	cv.width = 300; cv.height = 80;
	cv.style.cssText = 'image-rendering:pixelated;background:#0d0b16;border-radius:6px;display:block';
	box.append(label, sub, cv);
	document.body.appendChild(box);
	const cx = cv.getContext('2d');

	const step = d => { i = (i + ids.length + d) % ids.length; };
	addEventListener('keydown', e => {
		if (e.key === ']' || e.key === '.') { step(1); e.preventDefault(); }
		else if (e.key === '[' || e.key === ',') { step(-1); e.preventDefault(); }
	});

	let raf;
	const tick = () => {
		const id = ids[i];
		const f = ow.follower; if (f) f.id = id;               // pin the live follower to the chosen sprite
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
	return { ids, stop: () => { cancelAnimationFrame(raf); box.remove(); } };
}
