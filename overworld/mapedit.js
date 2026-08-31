// mapedit.js — owner-only tile editor for the ported overworld maps.
//
// Open any map with ?mapedit=1. The gate is in main.js and is verified
// SERVER-side (the username comes off the token, not localStorage), so this
// module is only ever imported for the owner.
//
// It edits the LIVE layout: painting calls world.setGridValue, which rewrites
// the cell and repaints it into the map's cached canvases, so what you see is
// the real renderer with the real tilesets — not a preview that might lie.
// Walking around works normally, so you scroll the map by moving the player.
//
// A map-grid cell is one u16: metatile id (0x03FF) | collision (0x0C00) |
// elevation (0xF000). The palette draws every metatile the map's tileset pair
// can address; collision and elevation are edited alongside, or left alone.
//
// Saving writes overworld/data/layouts/<LAYOUT_ID>.json through the local dev
// server (mp-dev-server /dev/save-layout). That tree is gitignored and deploys
// separately, so after saving:
//   npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true
// Off the dev server there is no write endpoint, so Export downloads the file
// instead and you drop it in by hand.
import { GRID, metatileCount, drawMetatileTo, META } from './engine.js';

const PAL_COLS = 8;         // metatiles per palette row
const PAL_CELL = 24;        // px per palette cell (metatiles are 16px, so 1.5x)
const UNDO_LIMIT = 200;

export function mount(ow) {
	const world = ow.world;
	let tool = 'paint';        // paint | fill | rect | pick
	let sel = 0;               // selected metatile id
	let collisionMode = 'keep'; // keep | pass | block
	let elevMode = 'keep';     // keep | <0-15>
	let showGrid = true, showCollision = false;
	let undo = [], redo = [];
	let stroke = null;          // cells changed since pointerdown
	let rectAnchor = null;
	let mapName = null, palTs = null;

	// ---------- panel ----------
	const panel = document.createElement('div');
	panel.id = 'mapedit';
	panel.style.cssText = 'position:fixed;top:56px;right:8px;z-index:200;width:min(272px, calc(100vw - 16px));'
		+ 'max-height:calc(100vh - 70px);overflow-y:auto;background:rgba(16,12,28,0.96);border:1px solid #6a5f8a;'
		+ 'border-radius:12px;padding:12px;color:#e8e2f4;font:12px "Segoe UI",sans-serif;user-select:none;touch-action:pan-y;';
	panel.innerHTML = `
		<div style="font-weight:700;letter-spacing:1px;margin-bottom:6px;">MAP EDITOR</div>
		<div style="display:flex;gap:4px;margin-bottom:5px;">
			<select id="me-region" style="flex:1;min-width:0;background:#241b38;color:#e8e2f4;border:1px solid #4a3f6b;border-radius:6px;padding:3px;"></select>
		</div>
		<div style="display:flex;gap:4px;margin-bottom:5px;">
			<select id="me-mapsel" style="flex:1;min-width:0;background:#241b38;color:#e8e2f4;border:1px solid #4a3f6b;border-radius:6px;padding:3px;"></select>
		</div>
		<input id="me-filter" placeholder="filter maps…" style="width:100%;box-sizing:border-box;margin-bottom:6px;background:#241b38;color:#e8e2f4;border:1px solid #4a3f6b;border-radius:6px;padding:3px 6px;">
		<div id="me-map" style="color:#9d92bd;margin-bottom:8px;font-size:11px;">…</div>
		<div style="display:flex;gap:4px;margin-bottom:8px;">
			<button class="me-btn me-tool" data-tool="paint">Paint</button>
			<button class="me-btn me-tool" data-tool="fill">Fill</button>
			<button class="me-btn me-tool" data-tool="rect">Rect</button>
			<button class="me-btn me-tool" data-tool="pick">Pick</button>
		</div>
		<div style="margin-bottom:6px;">
			<div style="color:#9d92bd;margin-bottom:3px;">Collision</div>
			<div style="display:flex;gap:4px;">
				<button class="me-btn me-col" data-col="keep">Keep</button>
				<button class="me-btn me-col" data-col="pass">Walk</button>
				<button class="me-btn me-col" data-col="block">Block</button>
			</div>
		</div>
		<div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">
			<span style="color:#9d92bd;">Elevation</span>
			<select id="me-elev" style="flex:1;background:#241b38;color:#e8e2f4;border:1px solid #4a3f6b;border-radius:6px;padding:3px;">
				<option value="keep">keep</option>
			</select>
		</div>
		<div style="display:flex;gap:10px;margin-bottom:8px;font-size:11px;flex-wrap:wrap;">
			<label><input type="checkbox" id="me-grid" checked> grid</label>
			<label><input type="checkbox" id="me-coll"> collision</label>
			<label><input type="checkbox" id="me-ents" checked> NPCs</label>
		</div>
		<div style="color:#9d92bd;margin-bottom:3px;">Metatiles — <span id="me-sel">0</span></div>
		<div id="me-palwrap" style="max-height:230px;overflow-y:auto;border:1px solid #4a3f6b;border-radius:8px;background:#120d20;">
			<canvas id="me-pal" style="display:block;image-rendering:pixelated;cursor:crosshair;"></canvas>
		</div>
		<div style="display:flex;gap:4px;margin:8px 0;">
			<button class="me-btn" id="me-undo">Undo</button>
			<button class="me-btn" id="me-redo">Redo</button>
		</div>
		<div style="display:flex;gap:4px;">
			<button class="me-btn" id="me-save" style="flex:1;">Save</button>
			<button class="me-btn" id="me-export">Export</button>
		</div>
		<div id="me-msg" style="margin-top:8px;color:#ffd25f;min-height:30px;font-size:11px;"></div>
		<style>
			.me-btn{flex:1;background:#2c2145;color:#e8e2f4;border:1px solid #4a3f6b;border-radius:6px;padding:4px 2px;cursor:pointer;font:11px "Segoe UI",sans-serif;}
			.me-btn:hover{background:#3a2c5c;}
			.me-btn.on{background:#5b4a8f;border-color:#9d8ad6;}
		</style>`;
	document.body.appendChild(panel);
	const $ = id => panel.querySelector('#' + id);
	const msg = t => { $('me-msg').textContent = t; };

	// tile highlight that rides over the game canvas
	const cursor = document.createElement('div');
	cursor.style.cssText = 'position:fixed;pointer-events:none;z-index:190;border:2px solid #ffd25f;'
		+ 'box-shadow:0 0 0 1px rgba(0,0,0,0.6);display:none;';
	document.body.appendChild(cursor);

	const elevSel = $('me-elev');
	for (let e = 0; e <= 15; e++) {
		const o = document.createElement('option');
		o.value = String(e); o.textContent = String(e);
		elevSel.appendChild(o);
	}

	// ---------- viewer mode: no player, camera we drive ----------
	ow.editView.on = true;
	ow.editView.entities = true;
	function centreCam() {
		const lay = world.current?.layout;
		if (!lay) return;
		const [vw, vh] = ow.viewSize();
		ow.editView.cam = [Math.round(lay.width * META / 2 - vw / 2), Math.round(lay.height * META / 2 - vh / 2)];
	}
	// keep at least half a screen of the map on screen, so panning can't lose it
	function clampCam() {
		const lay = world.current?.layout;
		if (!lay || !ow.editView.cam) return;
		const [vw, vh] = ow.viewSize();
		const c = ow.editView.cam;
		c[0] = Math.max(-vw / 2, Math.min(lay.width * META - vw / 2, c[0]));
		c[1] = Math.max(-vh / 2, Math.min(lay.height * META - vh / 2, c[1]));
	}
	const panBy = (dx, dy) => { if (ow.editView.cam) { ow.editView.cam[0] += dx; ow.editView.cam[1] += dy; clampCam(); drawOverlay(); } };
	$('me-ents').addEventListener('change', e => { ow.editView.entities = e.target.checked; });

	// ---------- region / map pickers ----------
	let regions = {};
	const regionSel = $('me-region'), mapSel = $('me-mapsel'), filter = $('me-filter');
	// the four shipped regions first, then any cloned region, then the leftovers
	const ORDER = ['KANTO', 'JOHTO', 'HOENN', 'JOHKANTO'];
	const sortRegions = keys => [
		...ORDER.filter(k => keys.includes(k)),
		...keys.filter(k => !ORDER.includes(k) && k !== 'OTHER').sort(),
		...(keys.includes('OTHER') ? ['OTHER'] : []),
	];
	function fillMaps() {
		const list = regions[regionSel.value] || [];
		const q = filter.value.trim().toLowerCase();
		const shown = q ? list.filter(m => m.name.toLowerCase().includes(q)) : list;
		mapSel.innerHTML = '';
		for (const m of shown.slice(0, 600)) {
			const o = document.createElement('option');
			o.value = m.name; o.textContent = m.name;
			mapSel.appendChild(o);
		}
		if (shown.length > 600) {
			const o = document.createElement('option');
			o.disabled = true; o.textContent = `…${shown.length - 600} more — type to filter`;
			mapSel.appendChild(o);
		}
		if (world.current && shown.some(m => m.name === world.current.name)) mapSel.value = world.current.name;
	}
	fetch('./map_regions.json').then(r => r.json()).then(j => {
		regions = j;
		for (const k of sortRegions(Object.keys(j))) {
			const o = document.createElement('option');
			o.value = k;
			o.textContent = `${k} (${j[k].length})`;
			regionSel.appendChild(o);
		}
		// open on whichever region holds the map we booted into
		const here = world.current?.name;
		const owner = Object.keys(j).find(k => j[k].some(m => m.name === here));
		regionSel.value = owner || 'KANTO';
		fillMaps();
	}).catch(e => msg('map_regions.json missing — run tools/gen_map_regions.mjs'));
	regionSel.addEventListener('change', () => { filter.value = ''; fillMaps(); });
	filter.addEventListener('input', fillMaps);
	mapSel.addEventListener('change', async () => {
		const name = mapSel.value;
		if (!name || name === world.current?.name) return;
		msg('loading ' + name + '…');
		await ow.editLoadMap(name);
		centreCam();
		msg('editing ' + name);
	});

	const setActive = (cls, attr, val) => {
		for (const b of panel.querySelectorAll('.' + cls)) b.classList.toggle('on', b.dataset[attr] === val);
	};
	setActive('me-tool', 'tool', tool);
	setActive('me-col', 'col', collisionMode);
	for (const b of panel.querySelectorAll('.me-tool')) b.addEventListener('click', () => { tool = b.dataset.tool; setActive('me-tool', 'tool', tool); });
	for (const b of panel.querySelectorAll('.me-col')) b.addEventListener('click', () => { collisionMode = b.dataset.col; setActive('me-col', 'col', collisionMode); });
	elevSel.addEventListener('change', () => { elevMode = elevSel.value; });
	$('me-grid').addEventListener('change', e => { showGrid = e.target.checked; drawOverlay(); });
	$('me-coll').addEventListener('change', e => { showCollision = e.target.checked; drawOverlay(); });

	// ---------- palette ----------
	const palCanvas = $('me-pal');
	function buildPalette() {
		const ts = world.current?.ts;
		if (!ts) return;
		palTs = ts;
		const n = metatileCount(ts);
		const rows = Math.ceil(n / PAL_COLS);
		// draw at native 16px then upscale via CSS, so the pixels stay crisp
		palCanvas.width = PAL_COLS * META;
		palCanvas.height = rows * META;
		palCanvas.style.width = (PAL_COLS * PAL_CELL) + 'px';
		palCanvas.style.height = (rows * PAL_CELL) + 'px';
		const ctx = palCanvas.getContext('2d');
		ctx.clearRect(0, 0, palCanvas.width, palCanvas.height);
		for (let i = 0; i < n; i++) {
			const x = (i % PAL_COLS) * META, y = ((i / PAL_COLS) | 0) * META;
			// bottom and top layers composited into the one context
			drawMetatileTo(ctx, ctx, ts, i, x, y);
		}
		markSel();
	}
	// selection ring drawn as a DOM box over the palette (keeps the canvas pure,
	// so re-selecting never forces a full repaint of ~1000 metatiles)
	const palRing = document.createElement('div');
	palRing.style.cssText = 'position:absolute;pointer-events:none;border:2px solid #ffd25f;box-sizing:border-box;';
	$('me-palwrap').style.position = 'relative';
	$('me-palwrap').appendChild(palRing);
	function markSel() {
		palRing.style.left = ((sel % PAL_COLS) * PAL_CELL) + 'px';
		palRing.style.top = (((sel / PAL_COLS) | 0) * PAL_CELL) + 'px';
		palRing.style.width = PAL_CELL + 'px';
		palRing.style.height = PAL_CELL + 'px';
		$('me-sel').textContent = `${sel} (0x${sel.toString(16).toUpperCase()})`;
	}
	palCanvas.addEventListener('pointerdown', e => {
		const r = palCanvas.getBoundingClientRect();
		const cx = Math.floor((e.clientX - r.left) / PAL_CELL);
		const cy = Math.floor((e.clientY - r.top) / PAL_CELL);
		const id = cy * PAL_COLS + cx;
		if (id >= 0 && id < metatileCount(world.current?.ts)) { sel = id; markSel(); }
	});

	// ---------- grid / collision overlay ----------
	// A canvas pinned over the game screen. Drawn from the same camera the world
	// uses, so the lines land exactly on tile seams at any zoom.
	const screen = document.getElementById('screen');
	const overlay = document.createElement('canvas');
	overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:185;';
	document.body.appendChild(overlay);
	function overlayFit() {
		const r = screen.getBoundingClientRect();
		overlay.style.left = r.left + 'px'; overlay.style.top = r.top + 'px';
		overlay.style.width = r.width + 'px'; overlay.style.height = r.height + 'px';
		overlay.width = Math.max(1, Math.round(r.width));
		overlay.height = Math.max(1, Math.round(r.height));
	}
	function drawOverlay() {
		overlayFit();
		const ctx = overlay.getContext('2d');
		ctx.clearRect(0, 0, overlay.width, overlay.height);
		const lay = world.current?.layout;
		if (!lay || (!showGrid && !showCollision)) return;
		const [camX, camY] = ow.cameraPos();
		const r = screen.getBoundingClientRect();
		const scale = r.width / ow.viewSize()[0];
		const t2s = (tx, ty) => [(tx * META - camX) * scale, (ty * META - camY) * scale];
		const step = META * scale;
		const x0 = Math.max(0, Math.floor(camX / META)), y0 = Math.max(0, Math.floor(camY / META));
		const x1 = Math.min(lay.width, x0 + Math.ceil(overlay.width / step) + 2);
		const y1 = Math.min(lay.height, y0 + Math.ceil(overlay.height / step) + 2);
		if (showCollision) {
			for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
				const v = lay.map[ty]?.[tx];
				if (v == null || !(v & GRID.COLLISION)) continue;
				const [sx, sy] = t2s(tx, ty);
				ctx.fillStyle = 'rgba(255,60,60,0.32)';
				ctx.fillRect(sx, sy, step, step);
			}
		}
		if (showGrid) {
			ctx.strokeStyle = 'rgba(255,255,255,0.18)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			for (let tx = x0; tx <= x1; tx++) { const [sx] = t2s(tx, 0); ctx.moveTo(sx, 0); ctx.lineTo(sx, overlay.height); }
			for (let ty = y0; ty <= y1; ty++) { const [, sy] = t2s(0, ty); ctx.moveTo(0, sy); ctx.lineTo(overlay.width, sy); }
			ctx.stroke();
		}
	}

	// ---------- screen -> tile ----------
	function tileAt(e) {
		const r = screen.getBoundingClientRect();
		const [vw, vh] = ow.viewSize();
		const lx = (e.clientX - r.left) / r.width * vw;
		const ly = (e.clientY - r.top) / r.height * vh;
		const [camX, camY] = ow.cameraPos();
		return [Math.floor((lx + camX) / META), Math.floor((ly + camY) / META)];
	}
	const inBounds = (tx, ty) => {
		const lay = world.current?.layout;
		return !!lay && tx >= 0 && ty >= 0 && tx < lay.width && ty < lay.height;
	};

	// ---------- editing ----------
	// Compose the u16 the tools write: the selected metatile, plus collision and
	// elevation either carried over from the cell or overridden.
	function valueFor(prev) {
		let v = sel & GRID.METATILE;
		v |= collisionMode === 'keep' ? (prev & GRID.COLLISION) : (collisionMode === 'block' ? GRID.COLLISION : 0);
		v |= elevMode === 'keep' ? (prev & GRID.ELEVATION) : ((+elevMode << GRID.ELEVATION_SHIFT) & GRID.ELEVATION);
		return v & 0xFFFF;
	}
	function put(tx, ty, v) {
		if (!inBounds(tx, ty)) return;
		const prev = world.current.layout.map[ty][tx] ?? 0;
		if (prev === v) return;
		world.setGridValue(tx, ty, v);
		if (stroke) stroke.push([tx, ty, prev, v]);
	}
	const paint = (tx, ty) => { if (inBounds(tx, ty)) put(tx, ty, valueFor(world.current.layout.map[ty][tx] ?? 0)); };

	function fill(tx, ty) {
		const lay = world.current.layout;
		const target = lay.map[ty]?.[tx];
		if (target == null) return;
		const targetId = target & GRID.METATILE;
		if ((valueFor(target) & GRID.METATILE) === targetId && collisionMode === 'keep' && elevMode === 'keep') return;
		// 4-way flood over cells sharing the starting metatile id
		const q = [[tx, ty]], done = new Set();
		while (q.length) {
			const [x, y] = q.pop();
			const k = y * lay.width + x;
			if (done.has(k) || !inBounds(x, y)) continue;
			const cur = lay.map[y][x];
			if ((cur & GRID.METATILE) !== targetId) continue;
			done.add(k);
			put(x, y, valueFor(cur));
			q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
			if (done.size > 40000) break; // runaway guard on a huge route
		}
	}
	function rect(ax, ay, bx, by) {
		const lay = world.current.layout;
		for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++)
			for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++)
				if (inBounds(x, y)) put(x, y, valueFor(lay.map[y][x] ?? 0));
	}

	function beginStroke() { stroke = []; }
	function endStroke() {
		if (stroke && stroke.length) {
			undo.push(stroke);
			if (undo.length > UNDO_LIMIT) undo.shift();
			redo = [];
			msg(`${stroke.length} tile${stroke.length === 1 ? '' : 's'} changed`);
		}
		stroke = null;
		drawOverlay();
	}
	function applyBatch(batch, useNext) {
		for (const [tx, ty, prev, next] of batch) world.setGridValue(tx, ty, useNext ? next : prev);
		drawOverlay();
	}

	// ---------- pointer on the game screen ----------
	// Capture phase + stopPropagation: the game's own handlers on this canvas
	// advance dialogs and press menu buttons, and we don't want a paint stroke
	// doing that too.
	let painting = false;
	const onDown = e => {
		if (!world.current) return;
		e.stopPropagation(); e.preventDefault();
		const [tx, ty] = tileAt(e);
		if (!inBounds(tx, ty)) return;
		if (tool === 'pick') { sel = (world.current.layout.map[ty][tx] ?? 0) & GRID.METATILE; markSel(); return; }
		if (tool === 'rect') { rectAnchor = [tx, ty]; msg(`rect from ${tx},${ty}…`); return; }
		painting = true;
		beginStroke();
		if (tool === 'fill') { fill(tx, ty); endStroke(); painting = false; }
		else paint(tx, ty);
	};
	const onMove = e => {
		if (!world.current) return;
		const [tx, ty] = tileAt(e);
		// hover box
		if (inBounds(tx, ty)) {
			const r = screen.getBoundingClientRect();
			const [vw] = ow.viewSize();
			const scale = r.width / vw;
			const [camX, camY] = ow.cameraPos();
			cursor.style.display = 'block';
			cursor.style.left = (r.left + (tx * META - camX) * scale) + 'px';
			cursor.style.top = (r.top + (ty * META - camY) * scale) + 'px';
			cursor.style.width = (META * scale) + 'px';
			cursor.style.height = (META * scale) + 'px';
			const v = world.current.layout.map[ty][tx] ?? 0;
			$('me-map').textContent = `${world.current.name}  ${world.current.layout.width}x${world.current.layout.height}`
				+ `   @${tx},${ty}  id ${v & GRID.METATILE}`
				+ `  ${(v & GRID.COLLISION) ? 'BLOCK' : 'walk'}  elev ${(v & GRID.ELEVATION) >> GRID.ELEVATION_SHIFT}`;
		} else cursor.style.display = 'none';
		if (!painting || tool !== 'paint') return;
		e.stopPropagation();
		paint(tx, ty);
	};
	const onUp = e => {
		if (tool === 'rect' && rectAnchor) {
			const [tx, ty] = tileAt(e);
			beginStroke();
			rect(rectAnchor[0], rectAnchor[1], tx, ty);
			endStroke();
			rectAnchor = null;
			return;
		}
		if (!painting) return;
		painting = false;
		endStroke();
	};
	// Pan with the RIGHT or MIDDLE button (left paints), and with the arrow keys —
	// the player is frozen in edit mode, so those are free.
	let panning = null;
	screen.addEventListener('contextmenu', e => e.preventDefault());
	screen.addEventListener('pointerdown', e => {
		if (e.button !== 1 && e.button !== 2) return;
		e.stopPropagation(); e.preventDefault();
		panning = [e.clientX, e.clientY];
	}, true);
	window.addEventListener('pointermove', e => {
		if (!panning) return;
		const r = screen.getBoundingClientRect();
		const scale = r.width / ow.viewSize()[0];
		panBy(-(e.clientX - panning[0]) / scale, -(e.clientY - panning[1]) / scale);
		panning = [e.clientX, e.clientY];
	});
	window.addEventListener('pointerup', () => { panning = null; });
	window.addEventListener('keydown', e => {
		if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
		const step = (e.shiftKey ? 4 : 1) * META;
		const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
		if (!d) return;
		e.preventDefault();
		panBy(d[0], d[1]);
	});

	screen.addEventListener('pointerdown', onDown, true);
	screen.addEventListener('pointermove', onMove, true);
	screen.addEventListener('pointerup', onUp, true);
	screen.addEventListener('pointerleave', () => { cursor.style.display = 'none'; });

	$('me-undo').addEventListener('click', () => {
		const b = undo.pop();
		if (!b) return msg('nothing to undo');
		applyBatch(b, false); redo.push(b); msg(`undid ${b.length}`);
	});
	$('me-redo').addEventListener('click', () => {
		const b = redo.pop();
		if (!b) return msg('nothing to redo');
		applyBatch(b, true); undo.push(b); msg(`redid ${b.length}`);
	});
	window.addEventListener('keydown', e => {
		if (!(e.ctrlKey || e.metaKey)) return;
		if (e.key === 'z') { e.preventDefault(); $('me-undo').click(); }
		if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); $('me-redo').click(); }
	});

	// ---------- save / export ----------
	// The layout file is exactly what the loader reads back, so write the whole
	// object rather than a patch — no merge step to get wrong later.
	const layoutFile = () => `overworld/data/layouts/${world.current.layout.id}.json`;
	$('me-save').addEventListener('click', async () => {
		const lay = world.current?.layout;
		if (!lay) return msg('no map loaded');
		try {
			const r = await fetch('/dev/save-layout', {
				method: 'POST',
				body: JSON.stringify({ file: layoutFile(), content: lay }),
			});
			if (!r.ok) throw new Error(await r.text());
			msg(`saved ${lay.id}.json — deploy overworld/data to owdata to publish`);
		} catch (e) {
			msg('no dev server (' + String(e.message || e).slice(0, 40) + ') — use Export');
		}
	});
	$('me-export').addEventListener('click', () => {
		const lay = world.current?.layout;
		if (!lay) return msg('no map loaded');
		const blob = new Blob([JSON.stringify(lay)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = lay.id + '.json';
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 5000);
		msg(`exported ${lay.id}.json → drop it in overworld/data/layouts/`);
	});

	// ---------- keep in step with the world ----------
	// The palette belongs to the map's tileset pair, so rebuild it whenever you
	// walk somewhere with different tilesets; the overlay follows the camera.
	const poll = setInterval(() => {
		if (!world.current) return;
		if (world.current.name !== mapName || world.current.ts !== palTs) {
			mapName = world.current.name;
			buildPalette();
			const lay = world.current.layout;
			$('me-map').textContent = `${mapName}  ${lay.width}x${lay.height}`;
			undo = []; redo = [];
			if (!ow.editView.cam) centreCam();
			clampCam();
			if (mapSel.value !== mapName) fillMaps();
		}
		drawOverlay();
	}, 120);
	window.addEventListener('resize', drawOverlay);

	centreCam();
	msg('left-drag paints · right-drag or arrows pan · Ctrl+Z undoes');
	return {
		// test surface
		get sel() { return sel; }, set sel(v) { sel = v; markSel(); },
		get tool() { return tool; }, set tool(v) { tool = v; setActive('me-tool', 'tool', tool); },
		set collision(v) { collisionMode = v; setActive('me-col', 'col', v); },
		set elevation(v) { elevMode = v; },
		paintAt: (tx, ty) => { beginStroke(); paint(tx, ty); endStroke(); },
		fillAt: (tx, ty) => { beginStroke(); fill(tx, ty); endStroke(); },
		rectAt: (a, b, c, d) => { beginStroke(); rect(a, b, c, d); endStroke(); },
		undoOnce: () => $('me-undo').click(),
		redoOnce: () => $('me-redo').click(),
		layoutFile,
		paletteSize: () => metatileCount(world.current?.ts),
		valueFor,
		centreCam, panBy,
		regionsLoaded: () => Object.keys(regions),
		mapsShown: () => [...mapSel.options].map(o => o.value).filter(Boolean),
		selectRegion: r => { regionSel.value = r; fillMaps(); },
		openMap: async name => { mapSel.value = name; await ow.editLoadMap(name); centreCam(); },
		destroy() {
			clearInterval(poll);
			ow.editView.on = false; ow.editView.cam = null;  // hand the camera back to the player
			panel.remove(); overlay.remove(); cursor.remove();
		},
	};
}
