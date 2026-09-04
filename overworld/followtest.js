// followtest.js — owner-only follower previewer. Opens a blank 10x10 grass arena
// (MAP_FOLLOWTEST) and lets the chosen sprite ACTUALLY follow you as you walk,
// cycling every species that has a walk sheet (data/pokemon_follow_index.json).
// Reached from the landing page's Explore tile → overworld/?followtest=1.
//   ?followtest=1                  # cycle all follower-sheet species
//   ?followtest=1&followset=a,b,c   # just these ids
//
// window.__followTest is set FIRST so savePos() no-ops while we're in the arena.
const FALLBACK = ['gigalion', 'twydra', 'catastropod', 'harvinger', 'moreel', 'novagon', 'darkjaws'];
const META = 48;

export function mount(ow) {
	window.__followTest = true;

	const p = new URLSearchParams(location.search);
	const custom = (p.get('followset') || '').split(',').map(s => s.trim()).filter(Boolean);
	let ids = custom.length ? custom : FALLBACK.slice();
	let i = 0;

	// warp into the arena; keep forcing followers ON + a spawned, visible follower
	// (some saves have followers disabled, which nulls it every frame)
	(async () => {
		try { await ow.moveToMap('FollowTest', 5, 5); } catch (e) { /* stay put if the arena fails */ }
		try { ow.Settings.set('followers', true); } catch (e) {}
		for (let t = 0; t < 20; t++) {                 // ensure the follower object exists, then park it a tile south
			try {
				if (!ow.follower) ow.refreshFollower();
				const f = ow.follower, pl = ow.player;
				if (f && pl) { f.id = ids[i]; f.tx = pl.tx; f.ty = pl.ty + 1; f.px = pl.tx * META; f.py = (pl.ty + 1) * META; f.facing = 'down'; break; }
			} catch (e) {}
			await new Promise(r => setTimeout(r, 150));
		}
		if (!custom.length) {
			try { const r = await fetch(new URL('data/pokemon_follow_index.json', location.href)); if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) ids = j; } } catch (e) {}
		}
		render();
	})();

	// bottom control bar — switch buttons + a small live status line
	const bar = document.createElement('div');
	bar.id = 'ft-bar';
	bar.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:400;display:flex;flex-direction:column;gap:4px;align-items:center;'
		+ 'background:rgba(18,14,30,0.92);color:#e9e4ff;border:1px solid #6a5f8a;border-radius:12px;padding:8px 12px;font:13px "Segoe UI",sans-serif;user-select:none';
	const rowTop = document.createElement('div'); rowTop.style.cssText = 'display:flex;gap:8px;align-items:center';
	const mkBtn = (txt, d) => { const b = document.createElement('button'); b.textContent = txt; b.tabIndex = -1;
		b.style.cssText = 'background:#2a2440;color:#e8e2f4;border:1px solid #6a5f8a;border-radius:8px;padding:8px 12px;font:14px sans-serif;cursor:pointer;min-width:44px';
		b.onclick = () => { step(d); render(); b.blur(); }; return b; };
	const name = document.createElement('div'); name.style.cssText = 'min-width:210px;text-align:center;font-weight:700;color:#ffd25f';
	rowTop.append(mkBtn('◀', -1), name, mkBtn('▶', 1));
	const status = document.createElement('div'); status.style.cssText = 'font-size:11px;color:#a99fc9';
	bar.append(rowTop, status);
	document.body.appendChild(bar);

	const step = d => { if (ids.length) i = (i + ids.length + d) % ids.length; };
	const render = () => { name.textContent = `${ids[i] || FALLBACK[0]}   (${i + 1}/${ids.length})`; };
	const onKey = e => {
		if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
		const j = e.shiftKey ? 25 : 1;
		if (e.key === ']' || e.key === '.') { step(j); render(); e.preventDefault(); }
		else if (e.key === '[' || e.key === ',') { step(-j); render(); e.preventDefault(); }
	};
	addEventListener('keydown', onKey);

	let raf;
	const tick = () => {
		try { if (ow.Settings.get && !ow.Settings.get('followers')) ow.Settings.set('followers', true); } catch (e) {}
		let f = ow.follower;
		if (!f) { try { ow.refreshFollower(); f = ow.follower; } catch (e) {} }
		const id = ids[i] || FALLBACK[0];
		if (f) f.id = id;
		// live readout so we can see what's actually happening on any session
		const sheet = ow.followSheet ? ow.followSheet(id) : null;
		const sheetState = sheet ? 'loaded' : (ow.followCache && ow.followCache.get(id) === 'none' ? 'mini-fallback' : 'loading');
		status.textContent = `follower: ${f ? 'yes' : 'NO'} · sprite: ${sheetState} · followers: ${(() => { try { return ow.Settings.get('followers') ? 'on' : 'OFF'; } catch { return '?'; } })()} · walk to trail`;
		raf = requestAnimationFrame(tick);
	};
	raf = requestAnimationFrame(tick);

	return { get ids() { return ids; }, get index() { return i; },
		stop: () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); bar.remove(); window.__followTest = false; } };
}
