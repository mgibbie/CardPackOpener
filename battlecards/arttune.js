// arttune.js — dev editor for per-card art framing. Lists every card with real
// art; drag the live face/token previews to move the focal point, scroll (or
// +/-) to zoom past the cover fit. Writes battlecards/art_tuning.json through
// the local dev server (/dev/save); elsewhere Save falls back to clipboard.
// The previews render through the REAL painters (drawCardFace/drawBoardToken),
// so what you frame here is exactly what the game shows.
import { drawCardFace, drawBoardToken, preloadArt, hasArt, artIndexReady, ART_TUNING, setArtOverride } from './cardart.js';
import * as MP from './mpmode.js';

const TUNING_FILE = 'battlecards/art_tuning.json';
const OWNER = 'mgibbie';

// owner-only: the tuner reframes/replaces live game art. No token bounces to
// the login door; any other account gets a polite lock screen. The username is
// verified SERVER-side (action 'state' derives it from the token) — a spoofed
// localStorage state doesn't pass.
async function requireOwner() {
	if (!MP.requireLogin()) return false;
	try {
		const r = await MP.call('state');
		if ((r?.state?.username || '') === OWNER) return true;
	} catch (e) {}
	document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#e8e2f4;font:16px \'Segoe UI\',sans-serif;">'
		+ '<div style="text-align:center;">🔒 The Art Tuner is an owner tool.<br><br><a href="/" style="color:#9d8fd4;">← back home</a></div></div>';
	return false;
}
const $ = id => document.getElementById(id);
let cards = [];         // every card def, name-sorted (art-less ones can be given art)
let sel = null;         // selected card def
const pendingArt = new Map(); // id -> jpeg dataURL, previewed live, written on Save

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
	$('artstate').textContent = pendingArt.has(sel.id) ? '● new image — unsaved'
		: pendingArt.size ? `${pendingArt.size} unsaved image${pendingArt.size > 1 ? 's' : ''} on other cards` : '';
}

// normalize an uploaded image to the pipeline's format (jpg, max side 768),
// preview it through the REAL art cache, and queue it for Save
async function replaceArt(file) {
	if (!sel || !file || !file.type.startsWith('image/')) return;
	const bmp = await createImageBitmap(file);
	const k = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
	const cv = document.createElement('canvas');
	cv.width = Math.round(bmp.width * k);
	cv.height = Math.round(bmp.height * k);
	cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
	const dataUrl = cv.toDataURL('image/jpeg', 0.9);
	const img = new Image();
	img.src = dataUrl;
	await img.decode();
	pendingArt.set(sel.id, dataUrl);
	setArtOverride(sel.id, img); // the preview now paints exactly what Save writes
	document.querySelector(`#list .row[data-id="${CSS.escape(sel.id)}"]`)?.classList.remove('noart');
	repaint();
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

// Cap the rendered rows: the full set is 11.6k, and building that many DOM
// nodes froze phones for seconds (which also made the search box feel dead).
const LIST_CAP = 400;
function buildList(filter = '') {
	const q = filter.trim().toLowerCase();
	const list = $('list');
	list.innerHTML = '';
	const c = cleaned();
	let shown = 0, matched = 0;
	for (const def of cards) {
		if (q && !def.name.toLowerCase().includes(q) && !def.id.includes(q)) continue;
		matched++;
		if (shown >= LIST_CAP) continue;
		shown++;
		const noart = !hasArt(def.id) && !pendingArt.has(def.id);
		const row = document.createElement('div');
		row.className = 'row' + (sel?.id === def.id ? ' sel' : '') + (noart ? ' noart' : '');
		row.dataset.id = def.id;
		row.innerHTML = `<span class="tuned">${c[def.id] ? '●' : ''}</span> ${def.name} <div class="id">${def.id} · ${def.type}</div>`;
		row.addEventListener('click', () => select(def));
		list.appendChild(row);
	}
	if (matched > shown) {
		const more = document.createElement('div');
		more.className = 'row';
		more.style.opacity = '0.6';
		more.textContent = `…${matched - shown} more — type to narrow`;
		list.appendChild(more);
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
	// wire the UI FIRST so the page is responsive (and failures visible) while
	// the 6.6MB card DB + art index stream in — on phones that load takes a
	// while, and a dead search box reads as "broken"
	$('search').addEventListener('input', () => buildList($('search').value));
	$('msg').textContent = 'checking access…';
	if (!await requireOwner()) return;
	$('msg').textContent = 'loading the card database…';
	try {
		const raw = await fetch('cards.json').then(r => r.json());
		const all = Array.isArray(raw) ? raw : raw.cards;
		await artIndexReady;
		cards = all.filter(c => c && c.id)
			.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
	} catch (e) {
		$('msg').textContent = 'failed to load the card database: ' + String(e.message || e).slice(0, 80);
		return;
	}
	const withArt = cards.filter(c => hasArt(c.id)).length;
	$('msg').textContent = `${cards.length} cards (${withArt} with art)`;
	buildList($('search').value);
	wirePreview($('face'));
	wirePreview($('token'));

	// replacement images: picker button or drop a file on a preview
	$('upload').addEventListener('click', () => $('file').click());
	$('file').addEventListener('change', () => { replaceArt($('file').files[0]); $('file').value = ''; });
	for (const cv of [$('face'), $('token')]) {
		cv.addEventListener('dragover', e => e.preventDefault());
		cv.addEventListener('drop', e => { e.preventDefault(); replaceArt(e.dataTransfer.files?.[0]); });
	}
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
		// replacement images first (each write also bumps the id's ART_REVS
		// cache-bust so the CDN can't serve the stale image after a deploy)
		let artMsg = '';
		if (pendingArt.size) {
			let savedDev = 0, savedLive = 0;
			for (const [id, dataUrl] of [...pendingArt]) {
				try {
					// local dev server: write straight into battlecards/art/
					const r = await fetch('/dev/save-art', { method: 'POST', body: JSON.stringify({ id, dataUrl }) });
					if (!r.ok) throw new Error(await r.text());
					pendingArt.delete(id);
					savedDev++;
				} catch (devErr) {
					// live site: store as a server override — every client picks it
					// up at boot (tuning-get lists it, art-fetch serves it) until a
					// dev session folds it into the repo (pull-live-tuning)
					try {
						await MP.call('art-save', { id, dataUrl });
						pendingArt.delete(id);
						savedLive++;
					} catch (e) {
						artMsg = ` · image save FAILED (${id}): ${String(e.message || e).slice(0, 80)}`;
						break;
					}
				}
			}
			if (savedDev) artMsg = ` · ${savedDev} image${savedDev > 1 ? 's' : ''} written — deploy art with: npm run deploy-art` + artMsg;
			if (savedLive) artMsg = ` · ${savedLive} image${savedLive > 1 ? 's' : ''} saved LIVE ✓ (fold into the repo later)` + artMsg;
		}
		const content = cleaned();
		try {
			// local dev server: write straight into the repo
			const r = await fetch('/dev/save', { method: 'POST', body: JSON.stringify({ file: TUNING_FILE, content }) });
			if (!r.ok) throw new Error(await r.text());
			$('msg').textContent = `saved ${TUNING_FILE} (${Object.keys(content).length} cards)` + artMsg;
		} catch (e) {
			// live site: save as a server override — takes effect for everyone
			// immediately (tuning-get merges it over the committed file)
			try {
				const r = await MP.call('tuning-save', { kind: 'art', content });
				$('msg').textContent = `saved LIVE ✓ (${r.count} cards as a server override)` + artMsg;
			} catch (e2) {
				await navigator.clipboard.writeText(JSON.stringify(content, null, '\t')).catch(() => {});
				$('msg').textContent = 'save failed (' + String(e2.message || e2).slice(0, 60) + ') — JSON copied to clipboard' + artMsg;
			}
		}
		repaint();
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
