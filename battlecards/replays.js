// replays.js — the saved-replays list. Reads the local tape ring buffer
// (replayrec.js), lets you watch (→ index.html?replay=<id>), delete, copy a
// shareable code, or import a code someone pasted. No network, no login.
import * as Rec from './replayrec.js';

const $ = id => document.getElementById(id);
const MODE_ICON = { solo: '⚔️', ai: '🤖', multiplayer: '🌐', dungeon: '🏰', heist: '💰', tombs: '⚰️', duels: '🎲', arena: '🛡️', lorequest: '📖' };
const MODE_NAME = { solo: 'Quick Match', ai: 'Ranked AI', multiplayer: 'PvP Duel', dungeon: 'Dungeon', heist: 'Heist', tombs: 'Tombs', duels: 'Duels', arena: 'Arena', lorequest: 'Lorequest' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function status(msg) { $('status').textContent = msg || ''; clearTimeout(status._t); if (msg) status._t = setTimeout(() => { if ($('status').textContent === msg) $('status').textContent = ''; }, 3000); }

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
			const shareId = await Rec.uploadReplay(id);
			btn.disabled = false; btn.textContent = '🔗 Share';
			if (shareId) {
				const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html?rshare=' + shareId;
				try { await navigator.clipboard.writeText(url); status('Share link copied — anyone can open it.'); }
				catch { prompt('Copy this replay link:', url); }
				return;
			}
			const code = Rec.exportCode(id);
			if (!code) { status('Could not read that replay.'); return; }
			try { await navigator.clipboard.writeText(code); status('Copied a replay CODE — others paste it via Import. (Log in for a short link.)'); }
			catch { prompt('Copy this replay code:', code); }
		};
		row.querySelector('.rp-del').onclick = () => { Rec.deleteReplay(id); render(); status('Replay deleted.'); };
		list.appendChild(row);
	}
}

$('import-btn').onclick = async () => {
	const raw = prompt('Paste a replay code to add it to your list:');
	if (!raw) return;
	const id = await Rec.importCode(raw.trim());
	if (id) { render(); status('Replay imported — hit Watch to view it.'); }
	else status("That doesn't look like a valid replay code.");
};
$('clear-btn').onclick = () => {
	if (!Rec.listReplays().length) return;
	if (confirm('Delete all saved replays on this device?')) { Rec.clearReplays(); render(); status('All replays cleared.'); }
};

render();
