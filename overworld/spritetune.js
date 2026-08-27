// spritetune.js — dev overlay for tuning per-species battle sprite size and
// position. Open the overworld with ?spritetune=1: pick a species and it
// battles ITSELF, so the front (foe) and back (player) sprites are both on
// screen; sliders write straight into battleui's live SPRITE_TUNING map, so
// every nudge shows in the real battle renderer next frame. Save writes the
// committed overworld/sprite_tuning.json through the local dev server
// (mp-dev-server /dev/save); elsewhere it falls back to copy-to-clipboard.
import { SPRITE_TUNING } from './battleui.js';
import { buildMon } from './battle.js';
import * as MP from '../battlecards/mpmode.js';

const TUNING_FILE = 'overworld/sprite_tuning.json';
const AXES = [
	['s', 'scale', 0.3, 3, 0.01, 1],
	['x', 'x', -60, 60, 1, 0],
	['y', 'y', -60, 60, 1, 0],
];

// drop default-valued axes / empty sides / empty species so the file stays
// sparse — but always carry the measured `crop` box through (sprite-audit
// generates it; the sliders only edit s/x/y on top)
function cleaned() {
	const out = {};
	for (const [id, sides] of Object.entries(SPRITE_TUNING)) {
		const e = {};
		for (const side of ['front', 'back']) {
			const t = sides?.[side];
			if (!t) continue;
			const s = {};
			if (t.crop) s.crop = t.crop;
			for (const [k, , , , , dflt] of AXES) {
				const v = +t[k];
				if (Number.isFinite(v) && v !== dflt) s[k] = v;
			}
			if (Object.keys(s).length) e[side] = s;
		}
		if (Object.keys(e).length) out[id] = e;
	}
	return out;
}

export function mount(ow) {
	const battle = ow.battle;
	const speciesIds = () => Object.keys(battle.data?.species || {}).sort();
	let current = null;

	const panel = document.createElement('div');
	panel.id = 'spritetune';
	panel.style.cssText = 'position:fixed;top:56px;right:8px;z-index:200;width:min(270px, calc(100vw - 16px));max-height:calc(100vh - 70px);'
		+ 'overflow-y:auto;background:rgba(16,12,28,0.95);border:1px solid #6a5f8a;border-radius:12px;'
		+ 'padding:12px;color:#e8e2f4;font:12px "Segoe UI",sans-serif;user-select:none;touch-action:pan-y;';
	panel.innerHTML = `
		<div style="font-weight:700;letter-spacing:1px;margin-bottom:8px;">SPRITE TUNER</div>
		<div style="display:flex;gap:6px;margin-bottom:6px;">
			<input id="st-species" list="st-list" placeholder="species id…" style="flex:1;min-width:0;background:#241b38;color:#e8e2f4;border:1px solid #4a3f6b;border-radius:6px;padding:4px 6px;">
			<datalist id="st-list"></datalist>
			<input id="st-level" type="number" value="50" min="1" max="100" style="width:52px;background:#241b38;color:#e8e2f4;border:1px solid #4a3f6b;border-radius:6px;padding:4px;">
		</div>
		<div style="display:flex;gap:6px;margin-bottom:10px;">
			<button id="st-prev" class="st-btn">◀</button>
			<button id="st-go" class="st-btn" style="flex:1;">PREVIEW</button>
			<button id="st-next" class="st-btn">▶</button>
		</div>
		<div id="st-sliders"></div>
		<pre id="st-json" style="background:#100c1e;border:1px solid #352c52;border-radius:6px;padding:6px;white-space:pre-wrap;word-break:break-all;min-height:34px;margin:8px 0;"></pre>
		<div style="display:flex;gap:6px;">
			<button id="st-reset" class="st-btn">Reset</button>
			<button id="st-copy" class="st-btn">Copy all</button>
			<button id="st-save" class="st-btn" style="flex:1;background:#6b4fd4;">Save</button>
		</div>
		<div id="st-msg" style="margin-top:6px;min-height:14px;color:#9fd8b0;"></div>`;
	const style = document.createElement('style');
	style.textContent = '#spritetune .st-btn{background:#2a2440;color:#e8e2f4;border:1px solid #6a5f8a;border-radius:6px;padding:6px 10px;cursor:pointer;}'
		+ '#spritetune .st-btn:hover{background:#3a3258;}'
		+ '#spritetune input[type=range]{width:100%;margin:0;}';
	document.head.appendChild(style);
	document.body.appendChild(panel);
	const $ = id => panel.querySelector('#' + id);

	// sliders for front + back
	const sliders = {}; // 'front.s' -> {range, num}
	const box = $('st-sliders');
	for (const side of ['front', 'back']) {
		const head = document.createElement('div');
		head.style.cssText = 'font-weight:700;margin:6px 0 2px;color:#ffd25f;';
		head.textContent = side === 'front' ? 'FRONT (foe)' : 'BACK (you)';
		box.appendChild(head);
		for (const [key, label, min, max, step, dflt] of AXES) {
			const row = document.createElement('div');
			row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;';
			row.innerHTML = `<span style="width:36px;opacity:0.75;">${label}</span>`
				+ `<input type="range" min="${min}" max="${max}" step="${step}" value="${dflt}">`
				+ `<input type="number" min="${min}" max="${max}" step="${step}" value="${dflt}" style="width:56px;background:#241b38;color:#e8e2f4;border:1px solid #4a3f6b;border-radius:4px;padding:2px;">`;
			const [range, num] = row.querySelectorAll('input');
			const apply = v => {
				if (!current) return;
				const val = +v;
				range.value = num.value = val;
				const e = (SPRITE_TUNING[current] = SPRITE_TUNING[current] || {});
				const t = (e[side] = e[side] || {});
				t[key] = val;
				refreshJson();
			};
			range.addEventListener('input', () => apply(range.value));
			num.addEventListener('input', () => apply(num.value));
			sliders[side + '.' + key] = { range, num, dflt };
			box.appendChild(row);
		}
	}

	function refreshJson() {
		const c = cleaned();
		$('st-json').textContent = current
			? `"${current}": ` + JSON.stringify(c[current] || {})
			: `${Object.keys(c).length} species tuned`;
	}
	function loadSliders(id) {
		for (const side of ['front', 'back']) {
			for (const [key] of AXES) {
				const s = sliders[side + '.' + key];
				const v = SPRITE_TUNING[id]?.[side]?.[key];
				s.range.value = s.num.value = Number.isFinite(+v) ? +v : s.dflt;
			}
		}
		refreshJson();
	}

	async function preview(id) {
		if (!battle.data?.species?.[id]) { $('st-msg').textContent = 'unknown species: ' + id; return; }
		current = id;
		$('st-species').value = id;
		loadSliders(id);
		$('st-msg').textContent = '';
		const level = Math.max(1, Math.min(100, +$('st-level').value || 50));
		const mon = buildMon(id, level, battle.data);
		if (battle.active) battle.active = null; // drop any current preview battle
		battle.start([mon], id, level, () => {});
	}

	function step(dir) {
		const ids = speciesIds();
		if (!ids.length) return;
		const i = Math.max(0, ids.indexOf(current ?? ids[0]));
		preview(ids[(i + dir + ids.length) % ids.length]);
	}

	$('st-go').addEventListener('click', () => preview($('st-species').value.trim()));
	$('st-species').addEventListener('change', () => preview($('st-species').value.trim()));
	$('st-prev').addEventListener('click', () => step(-1));
	$('st-next').addEventListener('click', () => step(1));
	$('st-reset').addEventListener('click', () => { if (current) { delete SPRITE_TUNING[current]; loadSliders(current); } });
	$('st-copy').addEventListener('click', async () => {
		await navigator.clipboard.writeText(JSON.stringify(cleaned(), null, '\t'));
		$('st-msg').textContent = 'copied full tuning JSON';
	});
	$('st-save').addEventListener('click', async () => {
		const content = cleaned();
		try {
			// local dev server: write straight into the repo
			const r = await fetch('/dev/save', { method: 'POST', body: JSON.stringify({ file: TUNING_FILE, content }) });
			if (!r.ok) throw new Error(await r.text());
			$('st-msg').textContent = `saved ${TUNING_FILE} (${Object.keys(content).length} species)`;
		} catch (e) {
			// live site: save ONLY what differs from the committed file — after a
			// fold the override count reads 0 instead of re-uploading all species
			try {
				let committed = {};
				try { committed = await fetch('/overworld/sprite_tuning.json', { cache: 'reload' }).then(r => (r.ok ? r.json() : {})); } catch (e3) {}
				const delta = {};
				for (const [id, t] of Object.entries(content)) if (JSON.stringify(committed[id]) !== JSON.stringify(t)) delta[id] = t;
				const r = await MP.call('tuning-save', { kind: 'sprite', content: delta });
				$('st-msg').textContent = `saved LIVE ✓ (${r.count} change${r.count === 1 ? '' : 's'} as a server override)`;
			} catch (e2) {
				await navigator.clipboard.writeText(JSON.stringify(content, null, '\t')).catch(() => {});
				$('st-msg').textContent = 'save failed (' + String(e2.message || e2).slice(0, 50) + ') — JSON copied to clipboard';
			}
		}
	});

	// species list once battle data is up (main.js boots it async)
	const fill = () => {
		const ids = speciesIds();
		if (!ids.length) { setTimeout(fill, 400); return; }
		$('st-list').innerHTML = ids.map(id => `<option value="${id}">`).join('');
		$('st-msg').textContent = `${ids.length} species — pick one and PREVIEW`;
	};
	fill();
	refreshJson();
}
