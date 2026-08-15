// profile.js — a small player-profile popup. Click a name (watcher list, chat)
// to see their public profile: online status + current activity, a few public
// stats, and an Add-friend button. Fetches the server's SAFE pubprofile subset
// (never the collection/deck contents). Pure DOM overlay; used by game.js + chat.js.
import * as MP from './mpmode.js';

const CARD_MODE = { dungeon: 'a Dungeon run', heist: 'a Heist run', tombs: 'a Tombs run', duels: 'a Duels run', arena: 'an Arena run', pvp: 'a card duel', battle: 'a card battle' };
function activityText(p) {
	const st = p.status || '';
	if (st.startsWith('card:')) { const m = st.slice(5); return 'in ' + (CARD_MODE[m] || 'a card game') + (p.region ? ' · ' + p.region : ''); }
	if (st.startsWith('battling:')) return 'in a Pokémon battle';
	if (st.startsWith('visiting:')) return 'exploring the world';
	return p.online ? 'online' : 'offline';
}
const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };

const STYLE = `
#mp-profile{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;
 background:rgba(4,6,16,0.62);font-family:'Segoe UI',system-ui,sans-serif;}
#mp-profile .mpp-card{position:relative;width:min(320px,90vw);background:#171326;color:#eae6f6;
 border:1px solid #3a2f56;border-radius:16px;padding:22px 20px 18px;box-shadow:0 24px 70px rgba(0,0,0,.6);}
#mp-profile .mpp-x{position:absolute;top:10px;right:12px;background:none;border:none;color:#9a8fbf;font-size:16px;cursor:pointer;}
#mp-profile .mpp-x:hover{color:#fff;}
#mp-profile .mpp-name{font-size:1.35rem;font-weight:800;display:flex;align-items:center;gap:8px;}
#mp-profile .mpp-you{font-size:.8rem;color:#9a8fbf;font-weight:600;}
#mp-profile .mpp-dot{width:9px;height:9px;border-radius:50%;background:#5a5a6a;flex:none;}
#mp-profile .mpp-dot.on{background:#6bd6a0;box-shadow:0 0 6px #6bd6a0;}
#mp-profile .mpp-act{color:#c9b8ff;font-size:.9rem;margin:4px 0 14px;}
#mp-profile .mpp-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;text-align:center;margin-bottom:12px;}
#mp-profile .mpp-stats > div{background:#211a38;border:1px solid #33294f;border-radius:9px;padding:7px 2px;}
#mp-profile .mpp-stats b{display:block;font-size:1.05rem;color:#ffcf6b;}
#mp-profile .mpp-stats span{font-size:.62rem;color:#9a8fbf;text-transform:uppercase;letter-spacing:.4px;}
#mp-profile .mpp-since{font-size:.76rem;color:#9a8fbf;margin-bottom:14px;}
#mp-profile .mpp-actions{min-height:34px;}
#mp-profile .mpp-add{width:100%;padding:9px;border:none;border-radius:9px;background:#6b4fd4;color:#fff;font:inherit;font-weight:700;cursor:pointer;}
#mp-profile .mpp-add:hover:not(:disabled){background:#7d63e6;}
#mp-profile .mpp-add:disabled{opacity:.7;cursor:default;}
#mp-profile .mpp-friend{color:#6bd6a0;font-weight:700;font-size:.9rem;}
.mpp-link{text-decoration:underline;text-underline-offset:2px;cursor:pointer;}
`;
function ensureStyle() {
	if (document.getElementById('mp-profile-style')) return;
	const s = document.createElement('style'); s.id = 'mp-profile-style'; s.textContent = STYLE;
	document.head.appendChild(s);
}

export async function openProfile(username) {
	if (!username) return;
	ensureStyle();
	document.getElementById('mp-profile')?.remove();
	const el = document.createElement('div');
	el.id = 'mp-profile';
	el.innerHTML = `<div class="mpp-card"><button class="mpp-x" title="Close">✕</button><div class="mpp-body">Loading ${esc(username)}…</div></div>`;
	el.addEventListener('click', e => { if (e.target === el) el.remove(); });
	el.querySelector('.mpp-x').addEventListener('click', () => el.remove());
	document.body.appendChild(el);
	const onEsc = e => { if (e.key === 'Escape') { el.remove(); removeEventListener('keydown', onEsc); } };
	addEventListener('keydown', onEsc);

	let data; try { data = await MP.call('pubprofile', { username }); } catch { data = null; }
	if (!document.body.contains(el)) return; // closed while loading
	const body = el.querySelector('.mpp-body');
	const p = data && data.profile;
	if (!p) { body.textContent = data && data.error ? data.error : 'Could not load that profile.'; return; }
	const since = p.created ? new Date(p.created).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '—';
	body.innerHTML = `
		<div class="mpp-name"><span class="mpp-dot${p.online ? ' on' : ''}"></span>${esc(p.username)}${p.isYou ? ' <span class="mpp-you">(you)</span>' : ''}</div>
		<div class="mpp-act">${esc(activityText(p))}</div>
		<div class="mpp-stats">
			<div><b>${p.wins | 0}</b><span>wins</span></div>
			<div><b>${p.runs | 0}</b><span>runs</span></div>
			<div><b>${p.packsOpened | 0}</b><span>packs</span></div>
			<div><b>${p.uniqueCards | 0}</b><span>cards</span></div>
			<div><b>${p.deckCount | 0}</b><span>decks</span></div>
		</div>
		<div class="mpp-since">Member since ${esc(since)}</div>
		<div class="mpp-actions"></div>`;
	const actions = body.querySelector('.mpp-actions');
	if (p.isFriend) actions.innerHTML = '<span class="mpp-friend">✓ Already friends</span>';
	else if (!p.isYou) {
		const add = document.createElement('button'); add.className = 'mpp-add'; add.textContent = '+ Add friend';
		add.addEventListener('click', async () => {
			add.disabled = true; add.textContent = 'Adding…';
			let r; try { r = await MP.call('add-friend', { username: p.username }); } catch { r = null; }
			add.textContent = r && r.added ? '✓ Friend added' : (r && r.error) || 'Could not add';
		});
		actions.appendChild(add);
	}
}
