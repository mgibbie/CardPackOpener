// followtest.js — owner-only follower previewer. Opens a blank 10x10 grass arena
// (MAP_FOLLOWTEST) and lets the chosen sprite ACTUALLY follow you as you walk,
// cycling every species that has a walk sheet (data/pokemon_follow_index.json).
// Reached from the landing page's Explore tile → overworld/?followtest=1.
//   ?followtest=1                  # cycle all follower-sheet species
//   ?followtest=1&followset=a,b,c   # just these ids
//
// window.__followTest is set FIRST so savePos() no-ops while we're in the arena —
// the arena must never become your persisted position.
const FALLBACK = ['gigalion', 'twydra', 'catastropod', 'harvinger', 'moreel', 'novagon', 'darkjaws'];
const META = 48; // tile size (matches engine META)

export function mount(ow) {
	window.__followTest = true; // gate savePos before any warp happens

	const p = new URLSearchParams(location.search);
	const custom = (p.get('followset') || '').split(',').map(s => s.trim()).filter(Boolean);
	let ids = custom.length ? custom : FALLBACK.slice();
	let i = 0;

	// warp into the blank grass arena, spawn the follower a step behind so it's
	// visible immediately, then load the full species index
	(async () => {
		try { await ow.moveToMap('FollowTest', 5, 5); } catch (e) { /* stay put if the arena fails to load */ }
		try {
			ow.Settings.set('followers', true); ow.refreshFollower();
			const f = ow.follower, pl = ow.player;             // drop it one tile south so it isn't hidden under you
			if (f && pl) { f.tx = pl.tx; f.ty = pl.ty + 1; f.px = pl.tx * META; f.py = (pl.ty + 1) * META; f.facing = 'down'; }
		} catch (e) { /* ignore */ }
		if (!custom.length) {
			try {
				const r = await fetch(new URL('data/pokemon_follow_index.json', location.href));
				if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) ids = j; }
			} catch (e) { /* fall back to the built-in set */ }
		}
		render();
	})();

	// a slim control bar at the bottom — SWITCH controls only; the mon itself is in
	// the world, not in here
	const bar = document.createElement('div');
	bar.id = 'ft-bar';
	bar.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:400;display:flex;gap:8px;align-items:center;'
		+ 'background:rgba(18,14,30,0.92);color:#e9e4ff;border:1px solid #6a5f8a;border-radius:12px;padding:8px 12px;font:13px "Segoe UI",sans-serif;user-select:none';
	const mkBtn = (txt, d) => {
		const b = document.createElement('button');
		b.textContent = txt;
		b.style.cssText = 'background:#2a2440;color:#e8e2f4;border:1px solid #6a5f8a;border-radius:8px;padding:8px 12px;font:14px "Segoe UI",sans-serif;cursor:pointer;min-width:44px';
		b.tabIndex = -1;                                       // never steal the arrow keys from the game
		b.onclick = () => { step(d); render(); b.blur(); };
		return b;
	};
	const prev = mkBtn('◀', -1), next = mkBtn('▶', 1);
	const name = document.createElement('div');
	name.style.cssText = 'min-width:200px;text-align:center;font-weight:700;color:#ffd25f';
	const hint = document.createElement('div');
	hint.style.cssText = 'color:#a99fc9;font-size:11px;margin-left:4px';
	hint.textContent = 'walk — it follows · [ ] or ◀ ▶ · Shift = ×25';
	bar.append(prev, name, next, hint);
	document.body.appendChild(bar);

	const step = d => { if (ids.length) i = (i + ids.length + d) % ids.length; };
	const render = () => {
		const id = ids[i] || FALLBACK[0];
		const f = ow.follower; if (f) f.id = id;              // the live, trailing follower becomes this species
		name.textContent = `${id}   (${i + 1}/${ids.length})`;
	};
	const onKey = e => {
		if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
		const j = e.shiftKey ? 25 : 1;
		if (e.key === ']' || e.key === '.') { step(j); render(); e.preventDefault(); }
		else if (e.key === '[' || e.key === ',') { step(-j); render(); e.preventDefault(); }
	};
	addEventListener('keydown', onKey);

	// keep the follower pinned to the selection every frame (the game's own
	// refreshFollower would otherwise reset it to your party lead on any refresh)
	let raf;
	const tick = () => { const f = ow.follower; if (f && ids[i]) f.id = ids[i]; raf = requestAnimationFrame(tick); };
	raf = requestAnimationFrame(tick);

	return {
		get ids() { return ids; }, get index() { return i; },
		stop: () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); bar.remove(); window.__followTest = false; },
	};
}
