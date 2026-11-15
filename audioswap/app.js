// audioswap/app.js — the owner's Audio Swap page: every place a game plays audio, what it plays, and a box to play
// something else there. The table it edits is site/audioswap.js's ("<kind>:<id>" -> replacement); Save sends it to the
// server (tuning-save, kind 'audio': the server checks the account, not this page), and every game reads it back.
//
// A place is { key, what, own, opts, url }:  key  the swap's key;  what  its name for a person;  own  what the game
// plays there by itself;  opts  the list its replacement comes from;  url(v)  a file to preview v with (or null: the
// game makes that sound with a synthesizer, and there is nothing to play here).
import * as MP from '/battlecards/mpmode.js';
import { SWAPS, SILENT, setLocal, refresh } from '/site/audioswap.js';
import { BATTLE_THEMES, EVENT_THEMES } from '/overworld/bgm_themes.js';

const OWNER = 'mgibbie', MAX_ROWS = 250;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SILENCE = '(silence)';

// owner-only, as the other owner tools: the username is the SERVER's (action 'state' reads it from the token)
async function requireOwner() {
	if (!MP.requireLogin()) return false;
	try { const r = await MP.call('state'); if ((r?.state?.username || '') === OWNER) return true; } catch { /* locked */ }
	document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#e8e2f4;font:16px \'Segoe UI\',sans-serif;">'
		+ '<div style="text-align:center;">🔒 Audio Swap is an owner tool.<br><br><a href="/" style="color:#9d8fd4;">← back home</a></div></div>';
	return false;
}

const ROLE = { wild: 'Wild battle', wildNight: 'Wild battle at night', trainer: 'Trainer battle', gym: 'Gym Leader', kantoWild: 'Wild battle (JohKanto)', kantoTrainer: 'Trainer battle (JohKanto)', kantoGym: 'Gym Leader (JohKanto)', elite: 'Elite Four', champion: 'Champion', rival: 'Rival', evil: 'Villain team grunt', evilboss: 'Villain team boss', legendary: 'Legendary', regi: 'Regi / second legendary theme', surf: 'Surfing', bike: 'Cycling' };
const GAME = { crystal: 'Johto (Crystal)', firered: 'Kanto (FireRed)', emerald: 'Hoenn (Emerald)' };
const mapName = (id) => id.replace(/^MAP_/, '').toLowerCase().replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());

let TABS = [], tab = 0, saved = {}, work = {}, busy = false;
const player = new Audio(); let playing = null;
function preview(url, btn) {
	if (playing === btn) { player.pause(); playing = null; btn.textContent = '▶'; return; }
	if (playing) playing.textContent = '▶';
	if (!url) return;
	player.src = url; player.currentTime = 0; player.volume = 0.6; player.play().catch(() => { btn.textContent = '✖'; });
	playing = btn; btn.textContent = '■';
}
player.addEventListener('ended', () => { if (playing) playing.textContent = '▶'; playing = null; });

function build(idx, musicMap) {
	const owTrack = (k) => (idx.ow.extra.includes(k) ? '/overworld/bgm_extra/' : '/overworld/data/sounds/bgm/') + k + '.ogg';
	const owSfx = (n) => '/overworld/data/sounds/sfx/' + n + '.ogg', mtSnd = (n) => '/micatro/assets/sounds/' + n + '.ogg';
	const bgm = { id: 'ow-bgm', vals: idx.ow.bgm, url: owTrack }, osfx = { id: 'ow-sfx', vals: idx.ow.sfx, url: owSfx };
	const msnd = { id: 'mt-snd', vals: idx.mt.sounds, url: mtSnd };
	const mmus = { id: 'mt-mus', vals: ['base', ...idx.ow.bgm.map(owTrack)], url: (v) => (v === 'base' ? mtSnd('music1') : v.charAt(0) === '/' ? v : null) };
	const msm = { id: 'ms-mus', vals: idx.ms.music, url: () => null }, mss = { id: 'ms-sfx', vals: idx.ms.sfx, url: () => null }, bcs = { id: 'bc-sfx', vals: idx.bc.sfx, url: () => null };
	const place = (key, what, own, o) => ({ key, what, own, opts: o });
	const themes = [];
	for (const g of Object.keys(BATTLE_THEMES)) themes.push({ title: GAME[g] || g, rows: Object.keys(BATTLE_THEMES[g]).map((r) => place('ow.theme:' + g + '.' + r, ROLE[r] || r, BATTLE_THEMES[g][r], bgm)) });
	themes.push({ title: 'Events', rows: Object.keys(EVENT_THEMES).map((e) => place('ow.event:' + e, e === 'blender' ? 'Berry Blender' : 'Contest stage', EVENT_THEMES[e], bgm)) });
	const maps = Object.keys(musicMap).sort().map((id) => place('ow.map:' + id, mapName(id), musicMap[id], bgm));
	return [
		{ name: 'Overworld: battle & field themes', hint: 'What plays in a battle, on the water and on the bike, for each region\'s soundtrack. A place uses the soundtrack of the map you are on.', secs: themes },
		{ name: 'Overworld: map music', hint: 'One row per map. Filter by a map or a track name.', secs: [{ title: 'Maps', rows: maps }] },
		{ name: 'Overworld: tracks everywhere', hint: 'Replace a track wherever it would play: every map and battle that uses it. A place\'s own swap is applied first, this after.', secs: [{ title: 'Tracks', rows: idx.ow.bgm.map((k) => place('ow.bgm:' + k, k, k, bgm)) }] },
		{ name: 'Overworld: sound effects', hint: 'The effect files the overworld and its battles play.', secs: [{ title: 'Effects', rows: idx.ow.sfx.map((n) => place('ow.sfx:' + n, n, n, osfx)) }] },
		{ name: 'Micatro · Scoundrel · Pair of Pears', hint: 'These three share one sound set. Their music can be any overworld track.', secs: [
			{ title: 'Music', rows: [place('mt.music:base', 'Micatro and Scoundrel: the music loop', 'base', mmus), place('mt.music:pears_meadows', 'Pair of Pears: the meadows theme', 'pears_meadows', mmus)] },
			{ title: 'Sounds', rows: idx.mt.sounds.map((n) => place('mt.sound:' + n, n, n, msnd)) }] },
		{ name: 'MicaSurvivor (2D and 3D)', hint: 'Its music and effects are made by a synthesizer, so a place can take another of its own songs or effects; there is no file to preview here.', secs: [
			{ title: 'Songs', rows: idx.ms.music.map((n) => place('ms.music:' + n, n, n, msm)) }, { title: 'Effects', rows: idx.ms.sfx.map((n) => place('ms.sfx:' + n, n, n, mss)) }] },
		{ name: 'Battlecards', hint: 'Its effects are made by a synthesizer, so an effect can take another of its own; there is no file to preview here. It has no music.', secs: [{ title: 'Effects', rows: idx.bc.sfx.map((n) => place('bc.sfx:' + n, n, n, bcs)) }] },
	];
}

const allRows = (t) => t.secs.flatMap((s) => s.rows);
const shown = (v) => (v === SILENT ? SILENCE : v);
const typed = (s) => { s = String(s || '').trim(); return s === SILENCE || s.toLowerCase() === 'silence' ? SILENT : s; };
const valid = (row, v) => v === SILENT || row.opts.vals.includes(v);
const dirty = () => JSON.stringify(Object.entries(work).sort()) !== JSON.stringify(Object.entries(saved).sort());

function status(text, err) {
	const n = Object.keys(work).length;
	$('status').textContent = text || (dirty() ? 'Unsaved changes. ' : '') + (n ? n + (n === 1 ? ' swap' : ' swaps') + ' in all.' : 'No swaps: every game plays its own audio.');
	$('status').className = 'txt' + (err ? ' err' : '');
	$('save').disabled = busy || !dirty(); $('revert').hidden = !dirty();
}
function tabs() {
	$('tabs').innerHTML = TABS.map((t, i) => { const n = allRows(t).filter((r) => work[r.key] != null).length; return `<button data-i="${i}" class="${i === tab ? 'on' : ''}">${esc(t.name)}${n ? `<span class="n">${n}</span>` : ''}</button>`; }).join('');
}
function list() {
	const t = TABS[tab], q = $('q').value.trim().toLowerCase(), only = $('only').checked;
	let n = 0, total = 0, html = `<div class="hint">${esc(t.hint)}</div>`;
	for (const s of t.secs) {
		const rows = s.rows.filter((r) => (!only || work[r.key] != null) && (!q || (r.what + ' ' + (r.own || '') + ' ' + (work[r.key] || '') + ' ' + r.key).toLowerCase().includes(q)));
		total += rows.length; if (!rows.length) continue;
		html += `<div class="sec">${esc(s.title)}<small>${rows.length}</small></div>`;
		for (const r of rows) {
			if (n >= MAX_ROWS) break; n++;
			const v = work[r.key], canPlay = (x) => !!(x && x !== SILENT && r.opts.url(x));
			html += `<div class="row" data-k="${esc(r.key)}"><span class="what">${esc(r.what)}</span>`
				+ `<span class="own${r.own ? '' : ' none'}">${esc(r.own || 'no music')}</span>`
				+ `<button class="play" data-p="own" ${canPlay(r.own) ? '' : 'disabled'}>▶</button>`
				+ `<input type="text" class="to${v != null ? ' set' : ''}" list="dl-${r.opts.id}" placeholder="the game's own" value="${esc(v != null ? shown(v) : '')}">`
				+ `<button class="play" data-p="to" ${canPlay(v) ? '' : 'disabled'}>▶</button>`
				+ `<button class="x" ${v != null ? '' : 'style="visibility:hidden"'} title="give it back to the game">✕</button></div>`;
		}
	}
	if (total > n) html += `<div class="more">Showing ${n} of ${total}. Filter to narrow it down.</div>`;
	if (!total) html += '<div class="more">Nothing matches.</div>';
	$('list').innerHTML = html; $('shown').textContent = total + (total === 1 ? ' place' : ' places');
}
const rowOf = (key) => { for (const t of TABS) for (const r of allRows(t)) if (r.key === key) return r; return null; };
/** Set (or with '' clear) a place's replacement. -> false when the value is not one this place can take. */
function setSwap(key, raw) {
	const r = rowOf(key), v = typed(raw); if (!r) return false;
	if (!v || v === r.own) { delete work[key]; return true; }
	if (!valid(r, v)) return false;
	work[key] = v; return true;
}
async function save() {
	if (busy || !dirty()) return;
	busy = true; status('Saving…');
	try {
		const r = await MP.call('tuning-save', { kind: 'audio', content: work });
		if (!r || !r.ok) throw new Error(r && r.error || 'the server refused it');
		saved = { ...work }; setLocal(saved); busy = false; status('Saved. Players get it within a few minutes.');
	} catch (e) { busy = false; status('Not saved: ' + (e && e.message || e), true); }
	tabs();
}

async function start() {
	if (!(await requireOwner())) return;
	const [idx, musicMap] = await Promise.all([fetch('./audio_index.json').then((r) => r.json()), fetch('/overworld/data/music_map.json').then((r) => r.json()).catch(() => ({})), refresh(true)]);
	TABS = build(idx, musicMap); saved = { ...SWAPS }; work = { ...SWAPS };
	const seen = new Set();
	$('lists').innerHTML = TABS.flatMap(allRows).map((r) => r.opts).filter((o) => !seen.has(o.id) && seen.add(o.id))
		.map((o) => `<datalist id="dl-${o.id}"><option value="${SILENCE}"></option>${o.vals.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`).join('');
	$('tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; tab = +b.dataset.i; tabs(); list(); });
	$('q').addEventListener('input', list); $('only').addEventListener('change', list);
	$('list').addEventListener('change', (e) => {
		const inp = e.target.closest('input.to'); if (!inp) return;
		const row = inp.closest('.row'), ok = setSwap(row.dataset.k, inp.value);
		if (!ok) { inp.classList.add('bad'); status('"' + inp.value + '" is not one of this place\'s choices. Pick one from the list.', true); return; }
		tabs(); list(); status();
	});
	$('list').addEventListener('click', (e) => {
		const row = e.target.closest('.row'); if (!row) return; const r = rowOf(row.dataset.k);
		if (e.target.closest('button.x')) { delete work[r.key]; tabs(); list(); status(); return; }
		const p = e.target.closest('button.play'); if (p) { const v = p.dataset.p === 'own' ? r.own : work[r.key]; preview(v && v !== SILENT ? r.opts.url(v) : null, p); }
	});
	$('save').addEventListener('click', save);
	$('revert').addEventListener('click', () => { work = { ...saved }; tabs(); list(); status(); });
	addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
	$('app').hidden = false; $('msg').hidden = false; tabs(); list(); status();
	// (for the tests)
	window.__audioswap = { tabs: () => TABS.map((t) => ({ name: t.name, rows: allRows(t).length })), row: rowOf, set: (k, v) => { const ok = setSwap(k, v); tabs(); list(); status(); return ok; }, work: () => ({ ...work }), saved: () => ({ ...saved }), save, dirty, go: (i) => { tab = i; tabs(); list(); } };
}
start();
