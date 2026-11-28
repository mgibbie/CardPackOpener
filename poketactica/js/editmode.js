// editmode.js — the MAP MAKER on the board (owner, 2026-11-22: "Map editor"). The map is drawn exactly as it will be
// played (the same board, its PvP seats marked); a cursor and a tool change it a tile at a time. Made maps are Versus
// arenas only (owner, 2026-11-22: no solo play on them). The model and its checks are editor.js; this file is the page:
// input, the tool bar, the editor's menu, saving, sharing, and taking the map to Versus.
//   keyboard / pad: arrows move the cursor · Z use the tool · C next tool · V the tool's next option (ground kind, Geo
//   colour, a foe's level) · X undo · Enter (Start) the menu: Versus on this map, save, share, rename, theme, size, the
//   foe's Pokémon and behaviour, leave · Q / E turn the board
//   touch: tap a tile to use the tool there; tap a tool or the option on the bar; the Menu button
import { TOOLS, GROUND_KEYS, GEO_KEYS, THEME_KEYS, AI_KEYS, FOE_LV_MAX, apply, resize, problems, cleanMap, newMap, asBoard, saveBlock, shareCheck, tdOf, tdProblems } from './editor.js';
import { GROUND_CHAR, campaignSetup } from './campaign.js';
import { askText } from '/site/osk.js';

export const MAPS_KEY = 'magepunk_poketactica_maps_v1', MAPS_MAX = 30;
const GROUND_LABEL = { '.': 'theme ground', ...GROUND_CHAR };
const GEO_LABEL = { '.': 'no colour', r: 'red', b: 'blue', p: 'purple', o: 'orange', c: 'cyan', y: 'yellow', g: 'green' };
const SEAT_HEX = [0x4fa3ff, 0xfe5f55, 0x3fd36b, 0xf5c542];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- this device's made maps: [{ id, map, at, code? }]
export function loadMaps(LS = globalThis.localStorage) {
	try { const a = JSON.parse(LS.getItem(MAPS_KEY) || '[]'); return Array.isArray(a) ? a.map((e) => e && typeof e.id === 'string' ? { id: e.id, map: cleanMap(e.map), at: +e.at || 0, ...(e.code ? { code: String(e.code) } : {}) } : null).filter((e) => e && e.map).slice(0, MAPS_MAX) : []; } catch { return []; }
}
export function saveMaps(list, LS = globalThis.localStorage) { try { LS.setItem(MAPS_KEY, JSON.stringify(list.slice(0, MAPS_MAX))); return true; } catch { return false; } }

/** ctx: { P, B, data, $, sfx, toast, banner, buildScene, rebuildOverlay, placeCam, setZoom, follow, stepFor, setMenu, menuMove,
 *  menuPick, versusOn(mapId), camp(), call(action, body), signedIn() } */
export function createEditMode(ctx) {
	const { P, B, data, $ } = ctx;
	const E = { m: null, id: null, tool: 0, opt: { ground: 1, geo: 1, foe: { sp: 'rattata', lv: 5, ai: 'aggro' } }, undo: [], dirty: false, bar: null };
	const tool = () => TOOLS[E.tool];
	const known = (sp) => !!data.species[sp];

	function bar() {
		if (E.bar) return E.bar;
		const el = document.createElement('div');
		el.id = 'pt-edit'; el.className = 'bal-panel pt-edit'; el.hidden = true;
		el.addEventListener('click', (ev) => {
			const b = ev.target.closest('[data-tool],[data-opt],[data-act]'); if (!b) return;
			ctx.sfx.press();
			if (b.dataset.tool != null) { E.tool = +b.dataset.tool; draw(); }
			else if (b.dataset.opt != null) nextOpt(+b.dataset.opt || 1);
			else if (b.dataset.act === 'menu') openMenu();
			else if (b.dataset.act === 'undo') undo();
		});
		document.body.appendChild(el);
		return (E.bar = el);
	}
	const optLabel = () => {
		const t = tool().id;
		if (t === 'ground') return GROUND_LABEL[GROUND_KEYS[E.opt.ground]];
		if (t === 'geo') return GEO_LABEL[GEO_KEYS[E.opt.geo]];
		if (t === 'foe') { const f = E.opt.foe; return `${(data.species[f.sp] || {}).name || f.sp} Lv ${f.lv} · ${f.ai}`; }
		return '';
	};
	function drawBar() {
		const el = bar(), probs = problems(E.m);
		el.innerHTML = `<div class="pt-edit-row"><b class="pt-edit-name">${esc(E.m.name)}${E.dirty ? ' •' : ''}</b><span class="bal-muted">${E.m.rows[0].length}×${E.m.rows.length} · ${esc(E.m.theme)}</span>
			<button class="bal-btn bal-sm bal-grey" data-act="undo" ${E.undo.length ? '' : 'disabled'}>Undo <span class="bal-key">X</span></button><button class="bal-btn bal-sm bal-purple" data-act="menu">Menu <span class="bal-key">⏎</span></button></div>
			<div class="pt-edit-tools">${TOOLS.map((t, i) => `<button class="bal-btn bal-sm ${i === E.tool ? 'bal-orange' : 'bal-grey'}" data-tool="${i}">${esc(t.name)}</button>`).join('')}</div>
			${optLabel() ? `<div class="pt-edit-opt"><button class="bal-btn bal-sm bal-blue" data-opt="-1">◀</button><span>${esc(optLabel())}</span><button class="bal-btn bal-sm bal-blue" data-opt="1">▶ <span class="bal-key">V</span></button></div>` : ''}
			<div class="pt-edit-say bal-muted">${esc(tool().say)} · <span class="bal-key">C</span> next tool</div>
			${probs.length ? `<div class="pt-edit-warn">⚠ ${esc(probs[0])}</div>` : `<div class="pt-edit-ok">✓ a Versus arena for ${E.m.seats.length === 2 ? '2' : '2-' + E.m.seats.length}${E.m.foes.length ? ' · ' + E.m.foes.length + ' wild' : ''}</div>`}
			${E.m.td ? `<div class="pt-edit-td ${tdProblems(E.m, 'maze').length ? 'pt-edit-warn' : 'pt-edit-ok'}" id="edit-td">${tdProblems(E.m, 'maze').length ? '⚠ Tower Defense: ' + esc(tdProblems(E.m, 'maze')[0]) : '✓ a Maze Builder map' + (tdProblems(E.m, 'road').length ? ' · Road: ' + esc(tdProblems(E.m, 'road')[0]) : ' · and a Road map')}</div>` : ''}`;
		el.hidden = false;
	}
	/** The board: the map built as a battle (empty), its seats marked. */
	function draw(rebuild) {
		if (rebuild) {
			const setup = { ...campaignSetup(asBoard(E.m), [], data, 'edit'), rev: B.RULES_REV, noBonus: true };
			P.S = B.newBattle('edit', setup, data); P.setup = setup; P.actions = []; P.anims = []; P.disp = null; P.busy = false;
			ctx.buildScene(P.S.map);
		}
		// (plan item K1) the Tower Defense marks: gates in red, the base in gold
		const td = tdOf(E.m);
		P.hl = { extra: [...(E.m.seats || []).map(([x, y], i) => [x, y, SEAT_HEX[i]]), ...td.gates.map(([x, y]) => [x, y, 0xff5a5a]), ...(td.base ? [[td.base[0], td.base[1], 0xffd23c]] : [])] };
		P.marks = [...td.gates.map(([x, y], i) => ({ x, y, text: String(i + 1), color: '#ff8a8a', sub: 'TD gate' })), ...(td.base ? [{ x: td.base[0], y: td.base[1], text: '★', color: '#ffd23c', sub: 'TD base' }] : [])];
		ctx.rebuildOverlay();
		drawBar();
		$('hint').innerHTML = '';
	}
	function change(res) {
		if (res.why) { ctx.sfx.error(); ctx.toast(res.why); return false; }
		E.undo.push(E.m); if (E.undo.length > 60) E.undo.shift();
		E.m = res.map; E.dirty = true;
		draw(true);
		return true;
	}
	function undo() { if (!E.undo.length) { ctx.sfx.error(); return; } E.m = E.undo.pop(); E.dirty = true; draw(true); }
	function useTool(x, y) {
		const t = tool().id;
		change(apply(E.m, t, x, y, { ground: GROUND_KEYS[E.opt.ground], geo: GEO_KEYS[E.opt.geo], foe: E.opt.foe }));
	}
	function nextOpt(d = 1) {
		const t = tool().id;
		if (t === 'ground') E.opt.ground = (E.opt.ground + d + GROUND_KEYS.length) % GROUND_KEYS.length;
		else if (t === 'geo') E.opt.geo = (E.opt.geo + d + GEO_KEYS.length) % GEO_KEYS.length;
		else if (t === 'foe') { const lv = E.opt.foe.lv + 5 * d; E.opt.foe.lv = lv > FOE_LV_MAX ? 5 : lv < 1 ? FOE_LV_MAX : lv; }
		else { ctx.sfx.error(); return; }
		drawBar();
	}

	// ---- the menu (the battle's own command window: arrows / Z / taps)
	function openMenu() {
		const m = E.m, probs = problems(m), on = ctx.signedIn(), noSave = saveBlock(m);
		P.mode = 'edit-menu';
		const items = [
			{ label: `Versus on this map <small>${probs.length ? 'not an arena yet (see the bar)' : on ? 'make a match on it' : 'sign in to play online'}</small>`, color: 'bal-orange', off: (probs.length && probs[0]) || (!on && 'Sign in (the top bar) to play Versus'), go: () => { if (!save(true)) return; close(); ctx.versusOn(E.id); } },
			{ label: `Save${noSave ? ' <small>needs 2 PvP bases</small>' : ''}`, color: 'bal-green', off: noSave && 'Can\'t save: ' + noSave, go: () => { save(); closeMenu(); } },
			{ label: `Share code <small>${noSave ? 'needs 2 PvP bases' : ctx.signedIn() ? 'friends load it with the code' : 'sign in to share'}</small>`, color: 'bal-blue', off: (noSave && 'Can\'t share: ' + noSave) || (!ctx.signedIn() && 'Sign in (the top bar) to share maps'), go: () => shareAsk() },
			{ label: 'Rename', color: 'bal-grey', go: async () => { closeMenu(); const n = await askText({ title: 'Name this map', initial: m.name, maxLength: 24 }); if (n && n.trim()) { change({ map: { ...E.m, name: n.trim().slice(0, 24) } }); } } },
			{ label: `Theme <small>${m.theme}</small>`, color: 'bal-grey', go: () => { const i = THEME_KEYS.indexOf(m.theme); change({ map: { ...E.m, theme: THEME_KEYS[(i + 1) % THEME_KEYS.length] } }); openMenu(); } },
			{ label: 'Wider', color: 'bal-grey', go: () => { change(resize(E.m, 1, 0)); openMenu(); } },
			{ label: 'Narrower', color: 'bal-grey', go: () => { change(resize(E.m, -1, 0)); openMenu(); } },
			{ label: 'Taller', color: 'bal-grey', go: () => { change(resize(E.m, 0, 1)); openMenu(); } },
			{ label: 'Shorter', color: 'bal-grey', go: () => { change(resize(E.m, 0, -1)); openMenu(); } },
			{ label: `Foe's Pokémon <small>${(data.species[E.opt.foe.sp] || {}).name || E.opt.foe.sp}</small>`, color: 'bal-grey', go: () => pickSpecies() },
			{ label: `Foe's behaviour <small>${E.opt.foe.ai}</small>`, color: 'bal-grey', go: () => { E.opt.foe.ai = AI_KEYS[(AI_KEYS.indexOf(E.opt.foe.ai) + 1) % AI_KEYS.length]; drawBar(); openMenu(); } },
			// (a map with under 2 PvP bases is never saved: leaving it drops the changes, and says so)
			{ label: E.dirty && noSave ? 'Leave without saving <small>a map needs 2 PvP bases, or a TD base and a gate, to save</small>' : 'Leave', color: 'bal-red', go: () => { if (E.dirty && !noSave) save(); else if (E.dirty) ctx.toast('Not saved: ' + noSave); close(); ctx.camp('maps'); } },
		];
		ctx.setMenu(items, 'Map maker');
	}
	function closeMenu() { P.mode = 'edit'; ctx.setMenu(null); drawBar(); }
	async function pickSpecies() {
		closeMenu();
		const q = await askText({ title: 'Which Pokémon? (its name)', initial: '', maxLength: 20 });
		if (!q) return;
		const want = q.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
		const hit = Object.entries(data.species).find(([id, s]) => id === want || String(s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === want)
			|| Object.entries(data.species).find(([id, s]) => String(s.name || id).toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(want));
		if (!hit) { ctx.sfx.error(); ctx.toast('No Pokémon called ' + q); return; }
		E.opt.foe.sp = hit[0]; E.tool = TOOLS.findIndex((t) => t.id === 'foe'); drawBar();
		ctx.toast((hit[1].name || hit[0]) + ': Z places it');
	}
	function save(quiet) {
		const no = saveBlock(E.m);
		if (no) { ctx.sfx.error(); ctx.toast('Can\'t save: ' + no); return false; }
		const list = loadMaps().filter((e) => e.id !== E.id);
		const prev = loadMaps().find((e) => e.id === E.id);
		list.unshift({ id: E.id, map: E.m, at: Date.now(), ...(prev && prev.code && !E.dirty ? { code: prev.code } : {}) });
		if (!saveMaps(list)) { ctx.toast('Could not save on this device'); return false; }
		E.dirty = false; drawBar();
		if (!quiet) ctx.toast('Saved: ' + E.m.name);
		return true;
	}
	/** THE CHECK BEFORE SHARING (plan item K2; editor.js shareCheck): what is wrong, in words. A map that cannot be played is
	 *  not shared; one that only has a surprise on it is, once it has been said. */
	function shareAsk() {
		const nameOf = (id) => (data.species[id] || {}).name || id;
		const c = shareCheck(E.m, nameOf);
		if (!c.stops.length && !c.warns.length) return share();
		P.mode = 'edit-menu';
		const line = (t, bad) => ({ label: `${bad ? '✖' : '⚠'} ${esc(t)}`, color: bad ? 'bal-red' : 'bal-gold', go: () => {} });
		ctx.setMenu([...c.stops.map((t) => line(t, true)), ...c.warns.map((t) => line(t, false)),
			...(c.stops.length ? [] : [{ label: 'Share it anyway', color: 'bal-blue', go: () => share() }]),
			{ label: 'Back to the map', color: 'bal-green', go: () => closeMenu() }],
		c.stops.length ? 'Not ready to share: ' + c.stops.length + ' thing' + (c.stops.length === 1 ? '' : 's') + ' to mend' : 'Before you share: ' + c.warns.length + ' thing' + (c.warns.length === 1 ? '' : 's') + ' to know');
	}
	async function share() {
		closeMenu(); if (!save(true)) return;
		const r = await ctx.call('ptmap-put', { map: E.m });
		if (!r || !r.code) { ctx.toast((r && r.error) || 'Could not share: try again'); return; }
		const list = loadMaps(); const e = list.find((x) => x.id === E.id); if (e) { e.code = r.code; saveMaps(list); }
		try { await navigator.clipboard.writeText(r.code); } catch { /* the code is on screen */ }
		ctx.toast('Map code ' + r.code + ' (copied): friends load it in Map maker');
	}

	// ---- in and out
	/** entry: a saved map ({ id, map }), or null for a new one, size = { w, h } (8 x 8 when not given). */
	function open(entry, size) {
		const fresh = () => newMap('My map', size && size.w, size && size.h);
		E.m = cleanMap(entry && entry.map ? entry.map : fresh(), known) || fresh();
		E.id = (entry && entry.id) || 'm' + Date.now().toString(36);
		E.undo = []; E.dirty = !(entry && entry.id);
		P.screen = 'editor'; P.mode = 'edit'; P.menu = null; P.sel = null;
		document.body.classList.add('pt-editing');
		$('result').hidden = true; $('unit').hidden = true;
		const s0 = E.m.seats[0] || [0, 0];
		P.cursor = { x: s0[0], y: s0[1] };
		draw(true);
		ctx.placeCam(); ctx.setZoom(1);
		ctx.banner(E.m.name);
	}
	function close() {
		document.body.classList.remove('pt-editing');
		if (E.bar) E.bar.hidden = true;
		ctx.setMenu(null);
		P.hl = {}; P.marks = null;
	}
	function onAction(action, o = {}) {
		if (P.menu) {
			if (['up', 'down', 'left', 'right'].includes(action)) { ctx.menuMove(action === 'up' || action === 'left' ? -1 : 1); return true; }
			if (action === 'confirm') { if (!o.repeat) ctx.menuPick(); return true; }
			if (action === 'cancel' || action === 'menu') { closeMenu(); return true; }
			return true;
		}
		if (['up', 'down', 'left', 'right'].includes(action)) {
			const [dx, dy] = ctx.stepFor(action), w = E.m.rows[0].length, h = E.m.rows.length;
			P.cursor = { x: Math.max(0, Math.min(w - 1, P.cursor.x + dx)), y: Math.max(0, Math.min(h - 1, P.cursor.y + dy)) };
			ctx.follow(); ctx.rebuildOverlay(); return true;
		}
		if (action === 'confirm') { useTool(P.cursor.x, P.cursor.y); return true; }
		if (action === 'cancel') { if (!o.repeat) undo(); return true; }
		if (action === 'secondary') { E.tool = (E.tool + 1) % TOOLS.length; ctx.sfx.tab && ctx.sfx.tab(); drawBar(); return true; }
		if (action === 'context') { nextOpt(1); return true; }
		if (action === 'menu') { ctx.sfx.press(); openMenu(); return true; }
		return false;   // (Q / E: the page turns the board)
	}
	function tap(x, y) { if (P.menu) closeMenu(); P.cursor = { x, y }; useTool(x, y); }
	return { open, close, onAction, tap, get active() { return P.screen === 'editor'; }, E, shareAsk };
}
