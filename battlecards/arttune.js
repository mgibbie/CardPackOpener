// arttune.js — dev editor for per-card art framing. Lists every card with real
// art; drag the live face/token previews to move the focal point, scroll (or
// +/-) to zoom past the cover fit. Writes battlecards/art_tuning.json through
// the local dev server (/dev/save); elsewhere Save falls back to clipboard.
// The previews render through the REAL painters (drawCardFace/drawBoardToken),
// so what you frame here is exactly what the game shows.
import { drawCardFace, drawBoardToken, preloadArt, hasArt, artIndexReady, ART_TUNING } from './cardart.js';

const TUNING_FILE = 'battlecards/art_tuning.json';
const $ = id => document.getElementById(id);
let cards = [];         // [{id, name, type, attack, health}] with art, name-sorted
let sel = null;         // selected card def

const r3 = v => Math.round(v * 1000) / 1000;
function cleaned() {
	const out = {};
	for (const [id, t] of Object.entries(ART_TUNING)) {
		if (!t) continue;
		const z = r3(Math.max(1, +t.z || 1)), fx = r3(t.fx ?? 0.5), fy = r3(t.fy ?? 0.5);
		if (z === 1 && fx === 0.5 && fy === 0.5) continue;
		out[id] = { z, fx, fy };
	}
	return out;
}
const entry = id => (ART_TUNING[id] = ART_TUNING[id] || { z: 1, fx: 0.5, fy: 0.5 });

function repaint() {
	if (!sel) return;
	const face = drawCardFace(sel);
	const fc = $('face');
	fc.getContext('2d').clearRect(0, 0, fc.width, fc.height);
	fc.getContext('2d').drawImage(face, 0, 0, fc.width, fc.height);
	const isCreature = sel.type === 'creature';
	$('tokenwrap').style.display = isCreature ? '' : 'none';
	if (isCreature) {
		const tok = drawBoardToken(sel, { attack: sel.attack, hp: sel.health, maxHealth: sel.health }, 0.625);
		const tc = $('token');
		tc.getContext('2d').clearRect(0, 0, tc.width, tc.height);
		tc.getContext('2d').drawImage(tok, 0, 0, tc.width, tc.height);
	}
	const t = ART_TUNING[sel.id];
	$('zoom').value = t?.z || 1;
	$('zoomval').textContent = (+(t?.z || 1)).toFixed(2);
	const c = cleaned();
	$('json').textContent = `"${sel.id}": ` + JSON.stringify(c[sel.id] || '(default framing)') + `\n${Object.keys(c).length} cards tuned`;
	const row = document.querySelector(`#list .row[data-id="${CSS.escape(sel.id)}"]`);
	row?.querySelector('.tuned')?.replaceChildren(c[sel.id] ? '●' : '');
}

async function select(def) {
	sel = def;
	document.querySelectorAll('#list .row.sel').forEach(r => r.classList.remove('sel'));
	const row = document.querySelector(`#list .row[data-id="${CSS.escape(def.id)}"]`);
	row?.classList.add('sel');
	row?.scrollIntoView({ block: 'nearest' });
	await preloadArt([def.id]);
	repaint();
}

function buildList(filter = '') {
	const q = filter.trim().toLowerCase();
	const list = $('list');
	list.innerHTML = '';
	const c = cleaned();
	for (const def of cards) {
		if (q && !def.name.toLowerCase().includes(q) && !def.id.includes(q)) continue;
		const row = document.createElement('div');
		row.className = 'row' + (sel?.id === def.id ? ' sel' : '');
		row.dataset.id = def.id;
		row.innerHTML = `<span class="tuned">${c[def.id] ? '●' : ''}</span> ${def.name} <div class="id">${def.id} · ${def.type}</div>`;
		row.addEventListener('click', () => select(def));
		list.appendChild(row);
	}
}

// ---------- pointer interaction on the previews ----------
function wirePreview(canvas) {
	let drag = null;
	canvas.addEventListener('pointerdown', e => {
		if (!sel) return;
		canvas.setPointerCapture(e.pointerId);
		drag = { x: e.clientX, y: e.clientY };
	});
	canvas.addEventListener('pointermove', e => {
		if (!drag || !sel) return;
		const t = entry(sel.id);
		// dragging carries the ART with the pointer: the focal point moves the
		// other way, scaled by the drawn art size so the motion tracks 1:1-ish
		const k = 1.2 / (canvas.getBoundingClientRect().width * Math.max(1, t.z));
		t.fx = Math.min(1, Math.max(0, t.fx - (e.clientX - drag.x) * k));
		t.fy = Math.min(1, Math.max(0, t.fy - (e.clientY - drag.y) * k));
		drag = { x: e.clientX, y: e.clientY };
		repaint();
	});
	canvas.addEventListener('pointerup', () => { drag = null; });
	canvas.addEventListener('wheel', e => {
		if (!sel) return;
		e.preventDefault();
		const t = entry(sel.id);
		t.z = Math.min(4, Math.max(1, t.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
		repaint();
	}, { passive: false });
}

// ---------- boot ----------
(async () => {
	const raw = await fetch('cards.json').then(r => r.json());
	const all = Array.isArray(raw) ? raw : raw.cards;
	await artIndexReady;
	cards = all.filter(c => c && c.id && hasArt(c.id))
		.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
	$('msg').textContent = `${cards.length} cards with art`;
	buildList();
	wirePreview($('face'));
	wirePreview($('token'));

	$('search').addEventListener('input', () => buildList($('search').value));
	$('zoom').addEventListener('input', () => { if (sel) { entry(sel.id).z = +$('zoom').value; repaint(); } });
	const step = dir => {
		const i = cards.findIndex(cd => cd.id === sel?.id);
		select(cards[(i + dir + cards.length) % cards.length]);
	};
	$('prev').addEventListener('click', () => step(-1));
	$('next').addEventListener('click', () => step(1));
	$('reset').addEventListener('click', () => { if (sel) { delete ART_TUNING[sel.id]; repaint(); } });
	$('copy').addEventListener('click', async () => {
		await navigator.clipboard.writeText(JSON.stringify(cleaned(), null, '\t'));
		$('msg').textContent = 'copied full tuning JSON';
	});
	$('save').addEventListener('click', async () => {
		const content = cleaned();
		try {
			const r = await fetch('/dev/save', { method: 'POST', body: JSON.stringify({ file: TUNING_FILE, content }) });
			if (!r.ok) throw new Error(await r.text());
			$('msg').textContent = `saved ${TUNING_FILE} (${Object.keys(content).length} cards)`;
		} catch (e) {
			await navigator.clipboard.writeText(JSON.stringify(content, null, '\t')).catch(() => {});
			$('msg').textContent = 'no dev server — JSON copied to clipboard instead';
		}
	});
	addEventListener('keydown', e => {
		if (!sel || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
		const t = entry(sel.id);
		const n = e.shiftKey ? 0.05 : 0.01;
		if (e.key === 'ArrowLeft') t.fx = Math.max(0, t.fx - n);
		else if (e.key === 'ArrowRight') t.fx = Math.min(1, t.fx + n);
		else if (e.key === 'ArrowUp') t.fy = Math.max(0, t.fy - n);
		else if (e.key === 'ArrowDown') t.fy = Math.min(1, t.fy + n);
		else if (e.key === '+' || e.key === '=') t.z = Math.min(4, t.z * 1.05);
		else if (e.key === '-') t.z = Math.max(1, t.z / 1.05);
		else return;
		e.preventDefault();
		repaint();
	});
	if (cards.length) select(cards[0]);
})();
