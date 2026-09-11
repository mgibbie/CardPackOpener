// replays.js — the saved-replays list. Reads the local tape ring buffer
// (replayrec.js), lets you watch (→ index.html?replay=<id>), delete, copy a
// shareable code, or import a code someone pasted. No network, no login.
import * as Rec from './replayrec.js';

const $ = id => document.getElementById(id);
const MODE_ICON = { solo: '⚔️', ai: '🤖', multiplayer: '🌐', dungeon: '🏰', heist: '💰', tombs: '⚰️', duels: '🎲', arena: '🛡️', lorequest: '📖', middleearth: '💍' };
const MODE_NAME = { solo: 'Quick Match', ai: 'Ranked AI', multiplayer: 'PvP Duel', dungeon: 'Dungeon', heist: 'Heist', tombs: 'Tombs', duels: 'Duels', arena: 'Arena', lorequest: 'Lorequest', middleearth: 'Middle-earth' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function status(msg) { $('status').textContent = msg || ''; clearTimeout(status._t); if (msg) status._t = setTimeout(() => { if ($('status').textContent === msg) $('status').textContent = ''; }, 3000); }

// The slim/repack machinery diffs cards against their defs — it needs the card
// db, which this page doesn't otherwise load. Without it, sharing an old fat
// replay from HERE silently skipped the repack, blew the upload cap, and fell
// back to the gigantic code (the user's 413). Lazy-load it on first use.
let _cardsP = null;
function ensureCards() {
	if (!_cardsP) _cardsP = fetch('cards.json').then(r => r.json()).then(d => {
		const byId = {};
		for (const c of d.cards) byId[c.id] = c;
		Rec.setCards(byId);
	}).catch(() => { _cardsP = null; });
	return _cardsP;
}

function ago(ts) {
	if (!ts) return '';
	const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}
function matchup(meta) {
	const h = meta.heroes || [];
	if (h.length === 2 && (h[0].classId || h[1].classId)) {
		const cap = c => c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Unknown';
		return `You (${cap(h[0].classId)}) vs ${cap(h[1].classId)}`;
	}
	if (meta.players > 2) return `${meta.players}-player free-for-all`;
	return '';
}

function render() {
	const list = $('list');
	const reps = Rec.listReplays();
	if (!reps.length) {
		list.innerHTML = '<div class="empty">No replays yet.<br>Finish a game in <a href="index.html">Quick Match</a> or any run mode and it will show up here to rewatch.</div>';
		return;
	}
	list.innerHTML = '';
	for (const { id, meta } of reps) {
		const mode = meta.mode || 'solo';
		const result = meta.result || 'draw';
		const badge = result === 'win' ? '<span class="badge win">Victory</span>'
			: result === 'loss' ? '<span class="badge loss">Defeat</span>' : '<span class="badge draw">Draw</span>';
		const sub = [matchup(meta), `${meta.frames || 0} moments`, ago(meta.when)].filter(Boolean).join(' · ');
		const row = document.createElement('div');
		row.className = 'rep';
		row.innerHTML = `<div class="rp-icon">${MODE_ICON[mode] || '🎬'}</div>`
			+ `<div class="rp-main"><div class="rp-title">${esc(MODE_NAME[mode] || mode)}${meta.imported ? ' <span class="badge draw">Imported</span>' : ''} ${badge}</div>`
			+ `<div class="rp-sub">${esc(sub)}</div></div>`
			+ `<div class="rp-actions">`
			+ `<button class="rp-watch">▶ Watch</button>`
			+ `<button class="rp-share">🔗 Share</button>`
			+ `<button class="rp-del" title="Delete this replay">🗑</button></div>`;
		row.querySelector('.rp-watch').onclick = () => { location.href = 'index.html?replay=' + encodeURIComponent(id); };
		row.querySelector('.rp-share').onclick = async (e) => {
			const btn = e.currentTarget; btn.disabled = true; btn.textContent = '…';
			// prefer a one-click share LINK (upload); fall back to the paste-able code when logged out
			await ensureCards(); // old fat tapes re-slim in place before the upload
			const shareId = await Rec.uploadReplay(id);
			btn.disabled = false; btn.textContent = '🔗 Share';
			if (shareId) {
				const url = location.origin + '/r/' + shareId;
				try { await navigator.clipboard.writeText(url); status('Share link copied — anyone can open it.'); }
				catch { prompt('Copy this replay link:', url); }
				return;
			}
			const code = Rec.exportCode(id);
			if (!code) { status('Could not read that replay.'); return; }
			const why = code.length > 1_400_000 ? 'This replay is too large for a short link — copied the full code instead (others paste it via Import).'
				: 'Copied a replay CODE — others paste it via Import. (Log in for a short link.)';
			try { await navigator.clipboard.writeText(code); status(why); }
			catch { prompt('Copy this replay code:', code); }
		};
		row.querySelector('.rp-del').onclick = () => { Rec.deleteReplay(id); render(); status('Replay deleted.'); };
		list.appendChild(row);
	}
}

$('import-btn').onclick = async () => {
	const raw = prompt('Paste a replay code to add it to your list:');
	if (!raw) return;
	await ensureCards(); // a pasted fat code re-saves slim
	const id = await Rec.importCode(raw.trim());
	if (id) { render(); status('Replay imported — hit Watch to view it.'); }
	else status("That doesn't look like a valid replay code.");
};
$('clear-btn').onclick = () => {
	if (!Rec.listReplays().length) return;
	if (confirm('Delete all saved replays on this device?')) { Rec.clearReplays(); render(); status('All replays cleared.'); }
};

render();
