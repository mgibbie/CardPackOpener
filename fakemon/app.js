// fakemon/app.js — the owner's Fakemon page: every fakemon (dex num <= 0) with its sprite, stats, moves, abilities and
// evolutions, every place it is actually placed in the game (fakemon/placements.json, tools/gen_fakemon_placements.mjs),
// and a box beside each place to put another Pokémon there instead. The table it edits is overworld/species_swaps.js's;
// Save sends it to the server (tuning-save, kind 'species': the server checks the account, not this page).
import * as MP from '/battlecards/mpmode.js';
import { SWAPS, setLocal, refresh } from '/overworld/species_swaps.js';
import { applyFakemonEvos } from '/overworld/fakemon_evos.js';   // (the evolutions the game lays over species_extra at load)

const OWNER = 'mgibbie', D = '/overworld/data/';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function requireOwner() {
	if (!MP.requireLogin()) return false;
	try { const r = await MP.call('state'); if ((r?.state?.username || '') === OWNER) return true; } catch { /* locked */ }
	document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#e8e2f4;font:16px \'Segoe UI\',sans-serif;">'
		+ '<div style="text-align:center;">🔒 The Fakemon page is an owner tool.<br><br><a href="/" style="color:#9d8fd4;">← back home</a></div></div>';
	return false;
}

let SP = {}, AB = {}, ABN = {}, EX = {}, MV = {}, PL = {}, ids = [], sel = null, saved = {}, work = {}, busy = false, evoFrom = {};
const source = (n) => (n >= -78 ? 'CAP' : n >= -265 ? 'Uranium' : 'Radical Ransei');
const sprite = (id, back) => D + 'pokemon/' + String(SP[id]?.sprite || '').replace(/\.png$/, back ? '-b.png' : '.png');
const name = (id) => SP[id]?.name || id;
const moveName = (m) => MV[m]?.name || m;
const abName = (a) => { const n = ABN[a] || String(a); return n === String(a) ? n.replace(/^[a-z]/, (c) => c.toUpperCase()) : n; };   // (the names table gives some back as their bare id: capitalise those)
const dirty = () => JSON.stringify(Object.entries(work).sort()) !== JSON.stringify(Object.entries(saved).sort());
const swapsOf = (id) => (work['all:' + id] ? 1 : 0) + (PL[id] || []).filter((p) => p.key && work[p.key]).length;
const EVO = (e) => EVO1(e) + (e.time ? ' (' + e.time + ' only)' : '') + (e.was ? ' — in its own game: ' + e.was : '');
const EVO1 = (e) => (e.type === 'level' ? 'at level ' + e.param : e.type === 'item' ? 'with ' + String(e.param).replace(/_/g, ' ').toLowerCase() : e.type === 'friendship' ? 'with high friendship' : e.type + (e.param ? ' ' + e.param : ''));

function status(text, err) {
	const n = Object.keys(work).length;
	$('status').textContent = text || (dirty() ? 'Unsaved changes. ' : '') + (n ? n + (n === 1 ? ' swap' : ' swaps') + ' in all.' : 'No swaps: every fakemon appears where it is placed.');
	$('status').className = 'txt' + (err ? ' err' : '');
	$('save').disabled = busy || !dirty(); $('revert').hidden = !dirty();
}
function matches(id) {
	const s = SP[id], f = $('filter').value, q = $('q').value.trim().toLowerCase(), n = (PL[id] || []).length;
	if (f === 'placed' && !n) return false; if (f === 'rift' && n) return false; if (f === 'swapped' && !swapsOf(id)) return false;
	if ((f === 'cap' || f === 'uranium' || f === 'ransei') && !source(s.num).toLowerCase().includes(f)) return false;
	if (!q) return true;
	return (id + ' ' + s.name + ' ' + (s.types || []).join(' ') + ' ' + (AB[id] || []).map(abName).join(' ') + ' ' + (s.learnset || []).map((m) => moveName(m[1])).join(' ')).toLowerCase().includes(q);
}
function list() {
	const rows = ids.filter(matches);
	$('list').innerHTML = rows.map((id) => { const n = (PL[id] || []).length, w = swapsOf(id); return `<div class="item${id === sel ? ' on' : ''}" data-id="${esc(id)}"><img loading="lazy" src="${esc(sprite(id))}" alt=""><span class="nm">${esc(name(id))}</span>${w ? `<span class="sw">${w} ⇄</span>` : ''}<span class="n${n ? '' : ' none'}">${n ? n + (n === 1 ? ' place' : ' places') : 'rift'}</span></div>`; }).join('') || '<div class="hint" style="padding:12px">Nothing matches.</div>';
	$('sum').textContent = rows.length + ' of ' + ids.length;
}
const box = (key, val) => `<input type="text" class="to${val ? ' set' : ''}" list="dl-species" data-k="${esc(key)}" placeholder="itself" value="${esc(val || '')}"><button class="x" data-x="${esc(key)}" ${val ? '' : 'style="visibility:hidden"'} title="put it back">✕</button>`;
function detail() {
	const id = sel, s = SP[id]; if (!s) { $('main').innerHTML = '<div class="hint">Pick a fakemon on the left.</div>'; return; }
	const st = s.baseStats || {}, order = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'], total = order.reduce((a, k) => a + (st[k] || 0), 0);
	const ex = EX[id] || {}, evos = ex.evos || [], from = evoFrom[id] || [], pl = PL[id] || [], learn = ex.learn || [];
	const evoChip = (o, txt) => `<span class="evo" data-go="${esc(o)}"><img src="${esc(sprite(o))}" alt=""><span><b>${esc(name(o))}</b> <span class="hint">${esc(txt)}</span></span></span>`;
	const group = {}; for (const p of pl) (group[p.k] = group[p.k] || []).push(p);
	const KT = { wild: 'In the wild', trainer: 'On trainers', gift: 'Gifts, trades and scripted battles', code: 'Named in the game\'s hand-written lists' };
	let h = `<div class="top"><div class="art"><img src="${esc(sprite(id))}" alt="front"><img src="${esc(sprite(id, true))}" alt="back" onerror="this.style.display='none'"></div><div>`
		+ `<h1>${esc(s.name)}</h1><div class="hint">${esc(id)} · dex ${s.num}</div><div style="margin:8px 0">${(s.types || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}<span class="chip src">${esc(source(s.num))}</span></div>`
		+ `<div><b>Abilities:</b> ${(AB[id] || []).map((a) => esc(abName(a))).join(', ') || '<span class="hint">none recorded</span>'}</div></div></div>`;
	h += `<h2>Base stats<small>total ${total}</small></h2><table>${order.map((k) => `<tr><th>${k.toUpperCase()}</th><td>${st[k] || 0}</td><td><div class="statbar"><span style="width:${Math.min(100, (st[k] || 0) / 2)}%"></span></div></td></tr>`).join('')}</table>`;
	h += '<h2>Evolution</h2>' + (from.length || evos.length
		? '<div>' + from.map((f) => evoChip(f.id, 'evolves into this ' + EVO(f.e))).join('') + evos.map((e) => (SP[e.target] ? evoChip(e.target, EVO(e)) : `<span class="hint">${esc(e.target)} ${esc(EVO(e))} (not in the game)</span>`)).join('') + '</div>'
		: '<div class="hint">It does not evolve, and nothing evolves into it.</div>');
	h += `<h2>Level-up moves<small>${(s.learnset || []).length}</small></h2>` + ((s.learnset || []).length ? `<div class="moves">${s.learnset.map((m) => `<div><span class="lv">${m[0]}</span>${esc(moveName(m[1]))}</div>`).join('')}</div>` : '<div class="hint">None: it cannot appear in the rift, and a battle would give it no moves.</div>');
	h += `<h2>TM, tutor and egg moves<small>${learn.length}</small></h2>` + (learn.length ? `<div class="hint">${learn.map((m) => esc(moveName(m))).join(', ')}</div>` : '<div class="hint">None of its own recorded: a TM works on it when the move is its type or Normal.</div>');
	h += `<h2>Where it is placed<small>${pl.length}</small></h2>`
		+ `<div class="everywhere"><b>Everywhere it would appear</b><span class="hint">in the wild (the rift too) and on trainers, put this instead:</span>${box('all:' + id, work['all:' + id])}</div>`;
	for (const k of Object.keys(KT)) if (group[k]) h += `<h2 style="font-size:13.5px">${KT[k]}<small>${group[k].length}</small></h2><table class="pl">${group[k].map((p) => `<tr><td><b>${esc(p.where)}</b></td><td class="how">${esc(p.how || '')}</td><td>${p.lv ? 'Lv ' + esc(p.lv) : ''}</td><td>${p.key ? box(p.key, work[p.key]) : ''}</td></tr>`).join('')}</table>`;
	h += `<div class="hint" style="margin-top:12px">${(s.learnset || []).length ? 'Also, like every fakemon with moves: the <b>Ransei rift</b> (after a region\'s Champion, 1 wild battle in 20 becomes a random fakemon) and the <b>Battle Frontier\'s</b> random pool.' : ''}${pl.length ? '' : ' It has no place of its own in any table, trainer or script.'}</div>`;
	$('main').innerHTML = h; $('main').scrollTop = 0;
}
/** Set (or with '' clear) a swap. -> false when the value is not a species the game has. */
function setSwap(key, raw) {
	const v = String(raw || '').trim().toLowerCase();
	if (!v) { delete work[key]; return true; }
	const id = SP[v] ? v : Object.keys(SP).find((k) => SP[k].name.toLowerCase() === v);
	if (!id) return false;
	if (key === 'all:' + id) { delete work[key]; return true; }
	work[key] = id; return true;
}
async function save() {
	if (busy || !dirty()) return;
	busy = true; status('Saving…');
	try {
		const r = await MP.call('tuning-save', { kind: 'species', content: work });
		if (!r || !r.ok) throw new Error(r && r.error || 'the server refused it');
		saved = { ...work }; setLocal(saved); busy = false; status('Saved. Players get it within a few minutes.');
	} catch (e) { busy = false; status('Not saved: ' + (e && e.message || e), true); }
}
const show = (id) => { sel = id; list(); detail(); try { history.replaceState(null, '', '#' + id); } catch { /* fine */ } };

async function start() {
	if (!(await requireOwner())) return;
	const get = (f) => fetch(D + f).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
	const [sp, ab, ex, mv, pl] = await Promise.all([get('species_battle.json'), get('species_abilities.json'), get('species_extra.json'), get('moves_battle.json'), fetch('./placements.json').then((r) => r.json()), refresh(true)]);
	SP = sp; AB = ab; ABN = ab._names || {}; MV = mv; PL = pl.placements || {};
	{ const d = { species: sp, extra: ex }; applyFakemonEvos(d); EX = d.extra; }
	ids = Object.keys(SP).filter((id) => (SP[id].num || 0) <= 0).sort((a, b) => SP[b].num - SP[a].num);
	for (const [id, x] of Object.entries(EX)) for (const e of (x && x.evos) || []) if (SP[e.target] && (SP[e.target].num || 0) <= 0) (evoFrom[e.target] = evoFrom[e.target] || []).push({ id, e });
	saved = { ...SWAPS }; work = { ...SWAPS };
	$('dl-species').innerHTML = Object.keys(SP).sort().map((id) => `<option value="${esc(id)}">${esc(SP[id].name)}</option>`).join('');
	$('q').addEventListener('input', list); $('filter').addEventListener('change', list);
	$('list').addEventListener('click', (e) => { const it = e.target.closest('.item'); if (it) show(it.dataset.id); });
	$('main').addEventListener('click', (e) => {
		const go = e.target.closest('[data-go]'); if (go && SP[go.dataset.go]) { show(go.dataset.go); return; }
		const x = e.target.closest('button.x'); if (x) { delete work[x.dataset.x]; list(); detail(); status(); }
	});
	$('main').addEventListener('change', (e) => {
		const inp = e.target.closest('input.to'); if (!inp) return;
		if (!setSwap(inp.dataset.k, inp.value)) { inp.classList.add('bad'); status('"' + inp.value + '" is not a Pokémon the game has. Pick one from the list.', true); return; }
		list(); detail(); status();
	});
	$('save').addEventListener('click', save);
	$('revert').addEventListener('click', () => { work = { ...saved }; list(); detail(); status(); });
	addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
	$('app').hidden = false;
	const want = decodeURIComponent(location.hash.slice(1));
	show(SP[want] && (SP[want].num || 0) <= 0 ? want : ids.find((id) => (PL[id] || []).length) || ids[0]); status();
	// (for the tests)
	window.__fakemon = { ids: () => ids.slice(), placements: (id) => PL[id] || [], show, set: (k, v) => { const ok = setSwap(k, v); list(); detail(); status(); return ok; }, work: () => ({ ...work }), dirty, save, sel: () => sel };
}
start();
