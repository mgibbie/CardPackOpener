// followtest.js — owner-only follower previewer. Opens a blank 10x10 grass arena
// (MAP_FOLLOWTEST) and lets the chosen sprite ACTUALLY follow you as you walk.
// Pick from a grouped dropdown (our AI test fakemon in their own section, then
// every species with a walk sheet) or step with ◀ ▶ / [ ]. Reached from the
// landing page's Explore tile → overworld/?followtest=1.  ?followset=a,b,c limits.
//
// window.__followTest is set FIRST so savePos() no-ops while we're in the arena.
const FALLBACK = ['gigalion', 'twydra', 'catastropod', 'harvinger', 'moreel', 'novagon', 'darkjaws'];
const META = 48;

export function mount(ow) {
	window.__followTest = true;

	const p = new URLSearchParams(location.search);
	const custom = (p.get('followset') || '').split(',').map(s => s.trim()).filter(Boolean);
	let ids = custom.length ? custom : FALLBACK.slice();   // the full cycle list (arrows/keys)
	let aiIds = FALLBACK.slice();                           // the AI test set (its own dropdown section)
	let i = 0;

	// warp in, force a party-independent follower (parked a tile south), load indexes
	(async () => {
		try { await ow.moveToMap('FollowTest', 5, 5); } catch (e) {}
		try { ow.Settings.set('followers', true); } catch (e) {}
		for (let t = 0; t < 20; t++) {
			try {
				ow.setFollowerSpecies(ids[i]);
				const f = ow.follower, pl = ow.player;
				if (f && pl) { f.tx = pl.tx; f.ty = pl.ty + 1; f.px = pl.tx * META; f.py = (pl.ty + 1) * META; f.facing = 'down'; break; }
			} catch (e) {}
			await new Promise(r => setTimeout(r, 150));
		}
		if (!custom.length) {
			const grab = async (u, d) => { try { const r = await fetch(new URL(u, location.href)); if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) return j; } } catch (e) {} return d; };
			ids = await grab('data/pokemon_follow_index.json', ids);
			aiIds = await grab('data/pokemon_follow_ai_index.json', aiIds);
		}
		buildSelect(); render();
	})();

	// ---- control bar: [◀] [dropdown] [▶] + status ----
	const bar = document.createElement('div');
	bar.id = 'ft-bar';
	bar.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:400;display:flex;flex-direction:column;gap:6px;align-items:center;'
		+ 'background:rgba(18,14,30,0.94);color:#e9e4ff;border:1px solid #6a5f8a;border-radius:12px;padding:8px 12px;font:13px "Segoe UI",sans-serif;user-select:none';
	const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;align-items:center';
	const mkBtn = (txt, d) => { const b = document.createElement('button'); b.textContent = txt; b.tabIndex = -1;
		b.style.cssText = 'background:#2a2440;color:#e8e2f4;border:1px solid #6a5f8a;border-radius:8px;padding:8px 12px;font:14px sans-serif;cursor:pointer;min-width:44px';
		b.onclick = () => { step(d); render(); b.blur(); }; return b; };
	const sel = document.createElement('select');
	sel.style.cssText = 'background:#241b38;color:#e8e2f4;border:1px solid #6a5f8a;border-radius:8px;padding:7px 8px;font:13px "Segoe UI",sans-serif;min-width:230px;max-width:60vw';
	sel.onchange = () => { const id = sel.value; const at = ids.indexOf(id); if (at >= 0) i = at; pin(id); sel.blur(); render(); };
	row.append(mkBtn('◀', -1), sel, mkBtn('▶', 1));
	const status = document.createElement('div'); status.style.cssText = 'font-size:11px;color:#a99fc9';
	bar.append(row, status);
	document.body.appendChild(bar);

	const opt = id => { const o = document.createElement('option'); o.value = id; o.textContent = id; return o; };
	function buildSelect() {
		sel.innerHTML = '';
		if (aiIds.length) {
			const g = document.createElement('optgroup'); g.label = `★ Testing — new fakemon (${aiIds.length})`;
			aiIds.forEach(id => g.appendChild(opt(id))); sel.appendChild(g);
		}
		const g2 = document.createElement('optgroup'); g2.label = `All species (${ids.length})`;
		ids.forEach(id => g2.appendChild(opt(id))); sel.appendChild(g2);
	}
	const pin = id => { try { if (ow.follower) ow.follower.id = id; else ow.setFollowerSpecies(id); } catch (e) {} };
	const step = d => { if (ids.length) i = (i + ids.length + d) % ids.length; };
	const render = () => { const id = ids[i] || FALLBACK[0]; if (sel.value !== id) sel.value = id; pin(id); };

	const onKey = e => {
		if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; // don't hijack the open dropdown
		const j = e.shiftKey ? 25 : 1;
		if (e.key === ']' || e.key === '.') { step(j); render(); e.preventDefault(); }
		else if (e.key === '[' || e.key === ',') { step(-j); render(); e.preventDefault(); }
	};
	addEventListener('keydown', onKey);

	let raf;
	const tick = () => {
		try { if (ow.Settings.get && !ow.Settings.get('followers')) ow.Settings.set('followers', true); } catch (e) {}
		const id = ids[i] || FALLBACK[0];
		if (!ow.follower) { try { ow.setFollowerSpecies(id); } catch (e) {} } else ow.follower.id = id;
		const sheet = ow.followSheet ? ow.followSheet(id) : null;
		const sState = sheet ? 'loaded' : (ow.followCache && ow.followCache.get(id) === 'none' ? 'mini' : 'loading');
		status.textContent = `follower: ${ow.follower ? 'yes' : 'NO'} · sprite: ${sState} · walk to trail`;
		raf = requestAnimationFrame(tick);
	};
	raf = requestAnimationFrame(tick);

	return { get ids() { return ids; }, get aiIds() { return aiIds; }, get index() { return i; },
		stop: () => { cancelAnimationFrame(raf); removeEventListener('keydown', onKey); bar.remove(); window.__followTest = false; } };
}
