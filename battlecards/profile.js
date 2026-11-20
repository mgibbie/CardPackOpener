// profile.js — a small player-profile popup. Click a name (watcher list, chat)
// to see their public profile: online status + current activity, a few public
// stats, and an Add-friend button. Fetches the server's SAFE pubprofile subset
// (never the collection/deck contents). Pure DOM overlay; used by game.js + chat.js.
import * as MP from './mpmode.js';

const CARD_MODE = { dungeon: 'a Dungeon run', heist: 'a Heist run', tombs: 'a Tombs run', duels: 'a Duels run', arena: 'an Arena run', lorequest: 'a Lorequest run', middleearth: 'a Middle-earth run', pvp: 'a card duel', battle: 'a card battle' };
function activityText(p) {
	const st = p.status || '';
	if (st.startsWith('card:')) { const m = st.slice(5); return 'in ' + (CARD_MODE[m] || 'a card game') + (p.region ? ' · ' + p.region : ''); }
	if (st.startsWith('battling:')) return 'in a Pokémon battle';
	if (st.startsWith('micatro:')) { const l = p.region || st.slice(8); return 'playing Micatro' + (l ? ' · ' + l : ''); }
	if (st.startsWith('visiting:')) return 'exploring the world';
	return p.online ? 'online' : 'offline';
}
// Balatro's button sounds (the site's UI kit, site/ui/sfx.js), loaded when a profile first opens (Battlecards imports
// this module at boot). The popup opens on a press, so the kit is already unlocked by the time its buttons are used.
let sfxMod = null;
const loadSfx = () => (sfxMod = sfxMod || import('../site/ui/sfx.js').catch(() => null));
const sound = name => { loadSfx().then(m => { try { m && m.sfx[name](); } catch (e) {} }); };
const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };

const STYLE = `
/* the Balatro look (site/ui/balatro.css tokens, literal fallbacks): the kit's dialog box (light outline, dark lip),
   stats in wells, Add friend a blue kit button, close the orange Back, the m6x11 font */
#mp-profile{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;
 background:rgba(15,22,24,0.55);font-family:var(--bal-font,'m6x11','m6x11plus',monospace);}
#mp-profile .mpp-card{position:relative;width:min(340px,90vw);box-sizing:border-box;background:var(--bal-panel,#3a4b4f);color:#fff;font-size:20px;line-height:1.15;
 border-radius:20px;padding:20px 18px 16px;box-shadow:0 10px 0 var(--bal-panel-dd,#1f2a2c),inset 0 0 0 4px var(--bal-outline-light,#bfc7d5);}
#mp-profile .mpp-x{position:absolute;top:12px;right:12px;width:36px;height:36px;padding:0;border:0;border-radius:9px;background:var(--bal-orange,#fda200);
 box-shadow:0 4px 0 var(--bal-orange-d,#c27c00);color:#fff;font-family:inherit;font-size:20px;line-height:1;cursor:pointer;text-shadow:0 2px 0 rgba(0,0,0,.3);}
#mp-profile .mpp-x:hover{filter:brightness(1.1);}
#mp-profile .mpp-x:active{transform:translateY(3px);box-shadow:0 1px 0 var(--bal-orange-d,#c27c00);}
#mp-profile .mpp-name{font-size:32px;display:flex;align-items:center;gap:8px;padding-right:40px;text-shadow:0 3px 0 rgba(0,0,0,.35);}
#mp-profile .mpp-you{font-size:18px;color:var(--bal-text-muted,#9fb0b3);text-shadow:none;}
#mp-profile .mpp-dot{width:11px;height:11px;border-radius:50%;background:#6b7a7d;flex:none;}
#mp-profile .mpp-dot.on{background:var(--bal-green,#4bc292);box-shadow:0 0 6px var(--bal-green,#4bc292);}
#mp-profile .mpp-act{color:#9fd3ff;font-size:19px;margin:4px 0 14px;}
#mp-profile .mpp-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;text-align:center;margin-bottom:12px;}
#mp-profile .mpp-stats > div{background:var(--bal-panel-dd,#1f2a2c);border-radius:10px;padding:7px 2px 5px;}
#mp-profile .mpp-stats b{display:block;font-weight:normal;font-size:22px;color:var(--bal-money,#f3b958);}
#mp-profile .mpp-stats span{font-size:14px;color:var(--bal-text-muted,#9fb0b3);}
#mp-profile .mpp-since{font-size:16px;color:var(--bal-text-muted,#9fb0b3);margin-bottom:14px;}
#mp-profile .mpp-actions{min-height:34px;}
#mp-profile .mpp-add{width:100%;padding:10px 9px 8px;margin-bottom:4px;border:none;border-radius:10px;background:var(--bal-blue,#009dff);box-shadow:0 4px 0 var(--bal-blue-d,#0076c2);
 color:#fff;font-family:inherit;font-size:22px;line-height:1;cursor:pointer;text-shadow:0 2px 0 rgba(0,0,0,.3);}
#mp-profile .mpp-add:hover:not(:disabled){filter:brightness(1.1);}
#mp-profile .mpp-add:active:not(:disabled){transform:translateY(3px);box-shadow:0 1px 0 var(--bal-blue-d,#0076c2);}
#mp-profile .mpp-add:disabled{background:var(--bal-disabled,#59676a);box-shadow:0 4px 0 var(--bal-disabled-d,#3d4749);color:var(--bal-disabled-text,#b9c3c5);cursor:default;}
#mp-profile .mpp-friend{color:var(--bal-green,#4bc292);font-size:20px;}
#mp-profile button:focus-visible{outline:3px solid #fff;outline-offset:2px;}
.mpp-link{text-decoration:underline;text-underline-offset:2px;cursor:pointer;}
`;
function ensureStyle() {
	if (document.getElementById('mp-profile-style')) return;
	// the kit's tokens + the m6x11 font (its classes are all prefixed: loading it changes nothing else on the page)
	if (!document.querySelector('link[href*="/site/ui/balatro.css"]')) {
		const k = document.createElement('link'); k.rel = 'stylesheet'; k.href = '/site/ui/balatro.css'; document.head.appendChild(k);
	}
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
	// close plays Balatro's back sound, Add friend the button press
	el.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b && !b.disabled) sound(b.classList.contains('mpp-x') ? 'back' : 'press'); }, true);
	loadSfx(); sound('open');
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
