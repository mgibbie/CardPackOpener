// monsters.js — show the Pokémon in your party + PC boxes (from the Overworld).
// The party/box live in localStorage on this device (same origin as /overworld/),
// so no login or network is needed. Sprites come from the overworld data offload.
const $ = id => document.getElementById(id);
const PARTY_KEY = 'magepunk_party_v1';
const BOX_KEY = 'magepunk_box_v1';
const SPRITE_BASE = '/overworld/data/pokemon/'; // 302s to the owdata offload
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// same palette the overworld battle UI uses (battleui.js TYPE_COLORS)
const TYPE_COLORS = {
	Normal: '#a8a090', Fire: '#f08030', Water: '#6890f0', Electric: '#f8d030',
	Grass: '#78c850', Ice: '#98d8d8', Fighting: '#c03028', Poison: '#a040a0',
	Ground: '#e0c068', Flying: '#a890f0', Psychic: '#f85888', Bug: '#a8b820',
	Rock: '#b8a038', Ghost: '#705898', Dragon: '#7038f8', Dark: '#705848',
	Steel: '#b8b8d0', Fairy: '#ee99ac',
};

function loadArr(key) {
	try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(v) ? v : []; }
	catch { return []; }
}

function monCard(mon) {
	const name = esc(mon.nickname || mon.name || 'Unknown');
	const maxHP = mon.maxHP || (mon.stats && mon.stats.hp) || 1;
	const curHP = Math.max(0, mon.curHP == null ? maxHP : mon.curHP);
	const pct = Math.max(0, Math.min(100, Math.round((curHP / maxHP) * 100)));
	const hpColor = pct > 50 ? 'var(--green)' : pct > 20 ? '#e6cc33' : '#e64d4d';
	const types = (mon.types || []).map(t => `<span class="t" style="background:${TYPE_COLORS[t] || '#888'}">${esc(String(t).toUpperCase())}</span>`).join('');
	const g = mon.gender === 'M' ? '<span class="g m" title="Male">♂</span>' : mon.gender === 'F' ? '<span class="g f" title="Female">♀</span>' : '';
	const dex = mon.num ? `<span class="dex">#${String(mon.num).padStart(3, '0')}</span>` : '';
	const div = document.createElement('div');
	div.className = 'mon' + (curHP <= 0 ? ' fainted' : '');
	div.innerHTML = `<div class="sprite">${mon.sprite ? `<img alt="${name}" loading="lazy" src="${SPRITE_BASE}${esc(mon.sprite)}">` : '❔'}</div>`
		+ `<div class="info">`
		+ `<div class="nm">${name} <span class="lv">Lv.${mon.level ?? '?'}</span> ${g}</div>`
		+ `<div class="types">${types || dex}</div>`
		+ `<div class="hp"><span style="width:${pct}%;background:${hpColor}"></span></div>`
		+ `<div class="hpn">${curHP} / ${maxHP} HP${dex && types ? ' · ' + dex.replace(/<[^>]+>/g, '') : ''}</div>`
		+ (mon.ability ? `<div class="ab" title="Ability">✦ ${esc(mon.ability)}</div>` : '')
		+ `</div>`;
	// a broken/absent sprite falls back to a placeholder glyph
	const img = div.querySelector('img');
	if (img) img.addEventListener('error', () => { img.replaceWith(document.createTextNode('❔')); }, { once: true });
	return div;
}

function section(title, mons, extra) {
	const label = document.createElement('div');
	label.className = 'section-label';
	label.innerHTML = `${esc(title)} <span class="count">${mons.length}${extra || ''}</span>`;
	const grid = document.createElement('div');
	grid.className = 'mon-grid';
	for (const m of mons) grid.appendChild(monCard(m));
	const frag = document.createDocumentFragment();
	frag.appendChild(label); frag.appendChild(grid);
	return frag;
}

function render() {
	const content = $('content');
	const party = loadArr(PARTY_KEY);
	const box = loadArr(BOX_KEY);
	content.innerHTML = '';
	if (!party.length && !box.length) {
		content.innerHTML = `<div class="empty">You haven't caught any monsters yet.<br>Head into the <a href="/overworld/">Overworld</a>, pick a starter, and start your adventure.</div>`;
		return;
	}
	if (party.length) content.appendChild(section('Party', party, ' / 6'));
	content.appendChild(section('PC Boxes', box));
}

render();
