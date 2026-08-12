// site/topbar.js — the shared Magepunk top bar + social inbox.
//
// Drop `<script type="module" src="/site/topbar.js"></script>` on any content
// page. It injects a consistent bar (⚙️ Magepunk wordmark home-link + account
// area) and, when logged in, an inbox bell that opens a slide-in panel with:
//   • Alerts   — incoming battle challenges (card duels launch here; Pokémon
//                and trades route into the Overworld where the party/renderer live)
//   • Friends  — your friends with presence + "Card battle" / "Message" actions
//   • Messages — per-friend DM threads over the u:<name> chat rooms
//
// All server calls go through the existing /api/mp backend via mpmode.js, using
// the same action signatures the Overworld already uses, so the flow is proven.
import * as MP from '/battlecards/mpmode.js';

const CARD_DUEL = id => '/battlecards/?cardpvp=' + encodeURIComponent(id) + '&mp=1';
const SEEN_KEY = 'mp_inbox_seen_v1';
// full-screen apps (the game, the Overworld) opt into a small floating widget
// via <meta name="mp-topbar" content="compact"> instead of the full bar
const COMPACT = document.querySelector('meta[name="mp-topbar"]')?.content === 'compact';
const PACK_TIMER_MS = 12 * 60 * 60 * 1000; // client mirror of the backend cadence
const fmtDur = ms => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- styles (injected once) ----------
function injectStyles() {
	if ($('#mp-topbar-style')) return;
	const s = el('style'); s.id = 'mp-topbar-style';
	s.textContent = `
	#mp-topbar { --tb-panel:#1a2140; --tb-panel2:#212a52; --tb-border:#2e3a63; --tb-text:#e8eaf6; --tb-muted:#9aa3c8; --tb-gold:#ffcf6b; --tb-blue:#6ea8ff; --tb-green:#6bd6a0; --tb-shadow:0 10px 30px rgba(0,0,0,.35);
		display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 18px; font-family:'Segoe UI',system-ui,sans-serif; position:relative; z-index:40; }
	@media (prefers-color-scheme: light){ #mp-topbar{ --tb-panel:#fff; --tb-panel2:#f3f5ff; --tb-border:#dde1f2; --tb-text:#1b2038; --tb-muted:#5a6288; --tb-gold:#b7791f; --tb-blue:#2b6cb0; --tb-green:#1f9d63; --tb-shadow:0 8px 24px rgba(40,50,90,.12); } }
	:root[data-theme="dark"] #mp-topbar{ --tb-panel:#1a2140; --tb-panel2:#212a52; --tb-border:#2e3a63; --tb-text:#e8eaf6; --tb-muted:#9aa3c8; --tb-gold:#ffcf6b; --tb-blue:#6ea8ff; --tb-green:#6bd6a0; --tb-shadow:0 10px 30px rgba(0,0,0,.35); }
	:root[data-theme="light"] #mp-topbar{ --tb-panel:#fff; --tb-panel2:#f3f5ff; --tb-border:#dde1f2; --tb-text:#1b2038; --tb-muted:#5a6288; --tb-gold:#b7791f; --tb-blue:#2b6cb0; --tb-green:#1f9d63; --tb-shadow:0 8px 24px rgba(40,50,90,.12); }
	#mp-topbar a{ color:inherit; text-decoration:none; }
	#mp-topbar .tb-brand{ display:inline-flex; align-items:center; gap:9px; font-weight:800; letter-spacing:.3px; color:var(--tb-text); font-size:1.02rem; }
	#mp-topbar .tb-brand .cog{ font-size:1.2rem; }
	#mp-topbar .tb-right{ display:flex; align-items:center; gap:9px; font-size:.9rem; }
	#mp-topbar .tb-login{ background:linear-gradient(180deg,var(--tb-blue),color-mix(in srgb,var(--tb-blue) 82%,#000)); color:#fff; padding:7px 15px; border-radius:9px; font-weight:600; box-shadow:var(--tb-shadow); }
	#mp-topbar .tb-login:hover{ filter:brightness(1.08); }
	#mp-topbar .tb-chip{ display:inline-flex; align-items:center; gap:6px; background:var(--tb-panel); color:var(--tb-gold); border:1px solid var(--tb-border); padding:7px 14px; border-radius:9px; font-weight:600; }
	#mp-topbar .tb-chip:hover{ background:var(--tb-panel2); }
	#mp-topbar .tb-bell{ position:relative; background:var(--tb-panel); border:1px solid var(--tb-border); color:var(--tb-text); width:38px; height:38px; border-radius:10px; font-size:1.05rem; cursor:pointer; display:grid; place-items:center; }
	#mp-topbar .tb-bell:hover{ background:var(--tb-panel2); border-color:var(--tb-blue); }
	#mp-topbar .tb-badge{ position:absolute; top:-6px; right:-6px; min-width:18px; height:18px; padding:0 5px; border-radius:999px; background:#e5484d; color:#fff; font-size:.68rem; font-weight:800; display:none; align-items:center; justify-content:center; }
	#mp-topbar .tb-badge.show{ display:flex; }

	/* compact floating widget for full-screen apps (game / Overworld) */
	#mp-topbar.tb-compact{ position:fixed; top:10px; right:10px; padding:0; width:auto; background:none; z-index:55; }
	#mp-topbar.tb-compact .tb-right{ gap:7px; }
	#mp-topbar.tb-compact .tb-mini{ width:38px; height:38px; display:grid; place-items:center; border-radius:10px; font-size:1.05rem; text-decoration:none;
		background:color-mix(in srgb, var(--tb-panel) 82%, transparent); border:1px solid var(--tb-border); color:var(--tb-text); backdrop-filter:blur(6px); box-shadow:var(--tb-shadow); position:relative; cursor:pointer; }
	#mp-topbar.tb-compact .tb-mini:hover{ background:var(--tb-panel); border-color:var(--tb-blue); }

	#mp-inbox-overlay{ position:fixed; inset:0; background:rgba(4,7,18,.5); z-index:60; display:none; }
	#mp-inbox-overlay.open{ display:block; }
	#mp-inbox{ position:fixed; top:0; right:0; height:100%; width:min(400px,100vw); background:var(--pnl,#141a35); color:var(--txt,#e8eaf6);
		border-left:1px solid var(--bd,#2e3a63); box-shadow:-14px 0 40px rgba(0,0,0,.4); z-index:61; transform:translateX(100%); transition:transform .22s ease;
		display:flex; flex-direction:column; font-family:'Segoe UI',system-ui,sans-serif;
		--pnl:#141a35; --pnl2:#1a2140; --bd:#2e3a63; --txt:#e8eaf6; --muted:#9aa3c8; --gold:#ffcf6b; --blue:#6ea8ff; --green:#6bd6a0; }
	@media (prefers-color-scheme: light){ #mp-inbox{ --pnl:#fff; --pnl2:#f3f5ff; --bd:#dde1f2; --txt:#1b2038; --muted:#5a6288; --gold:#b7791f; --blue:#2b6cb0; --green:#1f9d63; } }
	:root[data-theme="light"] #mp-inbox{ --pnl:#fff; --pnl2:#f3f5ff; --bd:#dde1f2; --txt:#1b2038; --muted:#5a6288; --gold:#b7791f; --blue:#2b6cb0; --green:#1f9d63; }
	:root[data-theme="dark"] #mp-inbox{ --pnl:#141a35; --pnl2:#1a2140; --bd:#2e3a63; --txt:#e8eaf6; --muted:#9aa3c8; --gold:#ffcf6b; --blue:#6ea8ff; --green:#6bd6a0; }
	#mp-inbox.open{ transform:translateX(0); }
	#mp-inbox .ib-head{ display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--bd); }
	#mp-inbox .ib-head h2{ font-size:1.12rem; font-weight:800; }
	#mp-inbox .ib-close{ background:none; border:none; color:var(--muted); font-size:1.4rem; cursor:pointer; line-height:1; }
	#mp-inbox .ib-close:hover{ color:var(--txt); }
	#mp-inbox .ib-tabs{ display:flex; gap:4px; padding:10px 12px 0; }
	#mp-inbox .ib-tab{ flex:1; background:none; border:none; color:var(--muted); font:inherit; font-weight:700; font-size:.86rem; padding:9px 6px; border-radius:9px 9px 0 0; cursor:pointer; position:relative; }
	#mp-inbox .ib-tab.active{ color:var(--txt); background:var(--pnl2); }
	#mp-inbox .ib-tab .dot{ display:inline-block; min-width:16px; height:16px; padding:0 4px; margin-left:5px; border-radius:999px; background:#e5484d; color:#fff; font-size:.62rem; font-weight:800; line-height:16px; }
	#mp-inbox .ib-tab .dot[hidden]{ display:none; } /* beat display:inline-block so [hidden] hides */
	#mp-inbox .ib-body{ flex:1; overflow-y:auto; padding:14px; }
	#mp-inbox .ib-empty{ color:var(--muted); text-align:center; padding:40px 20px; font-size:.9rem; }
	#mp-inbox .row{ display:flex; align-items:center; gap:11px; padding:12px; border:1px solid var(--bd); border-radius:12px; background:var(--pnl2); margin-bottom:10px; }
	#mp-inbox .row .av{ width:38px; height:38px; border-radius:50%; background:var(--pnl); border:1px solid var(--bd); display:grid; place-items:center; font-size:1.1rem; flex-shrink:0; position:relative; }
	#mp-inbox .row .av .pres{ position:absolute; bottom:-1px; right:-1px; width:11px; height:11px; border-radius:50%; background:#5a6478; border:2px solid var(--pnl2); }
	#mp-inbox .row .av .pres.on{ background:var(--green); }
	#mp-inbox .row .meta{ flex:1; min-width:0; }
	#mp-inbox .row .meta .name{ font-weight:700; }
	#mp-inbox .row .meta .sub{ color:var(--muted); font-size:.8rem; margin-top:1px; }
	#mp-inbox .row .acts{ display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
	#mp-inbox button.mini{ background:var(--pnl); border:1px solid var(--bd); color:var(--txt); font:inherit; font-size:.78rem; font-weight:700; padding:6px 10px; border-radius:8px; cursor:pointer; white-space:nowrap; }
	#mp-inbox button.mini:hover{ border-color:var(--blue); }
	#mp-inbox button.mini.primary{ background:linear-gradient(180deg,var(--gold),color-mix(in srgb,var(--gold) 80%,#000)); color:#0c1122; border-color:transparent; }
	#mp-inbox button.mini.danger{ color:#ff8a8a; }
	#mp-inbox .note{ color:var(--muted); font-size:.8rem; margin:2px 0 12px; line-height:1.4; }
	#mp-inbox .thread{ display:flex; flex-direction:column; height:100%; }
	#mp-inbox .thread .back{ background:none; border:none; color:var(--blue); font:inherit; font-weight:700; cursor:pointer; padding:0 0 10px; text-align:left; }
	#mp-inbox .thread .msgs{ flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding:4px 2px; }
	#mp-inbox .bubble{ max-width:80%; padding:8px 12px; border-radius:12px; font-size:.88rem; line-height:1.35; word-wrap:break-word; }
	#mp-inbox .bubble.them{ align-self:flex-start; background:var(--pnl2); border:1px solid var(--bd); }
	#mp-inbox .bubble.me{ align-self:flex-end; background:linear-gradient(180deg,var(--blue),color-mix(in srgb,var(--blue) 82%,#000)); color:#fff; }
	#mp-inbox .composer{ display:flex; gap:8px; padding-top:10px; border-top:1px solid var(--bd); margin-top:8px; }
	#mp-inbox .composer input{ flex:1; background:var(--pnl); border:1px solid var(--bd); color:var(--txt); border-radius:9px; padding:9px 12px; font:inherit; }
	#mp-inbox .composer button{ background:var(--blue); color:#fff; border:none; border-radius:9px; padding:0 15px; font:inherit; font-weight:700; cursor:pointer; }
	#mp-inbox .toast{ position:absolute; bottom:14px; left:14px; right:14px; background:var(--pnl2); border:1px solid var(--bd); border-radius:10px; padding:12px 14px; font-size:.86rem; box-shadow:var(--tb-shadow); display:none; }
	#mp-inbox .toast.show{ display:block; }

	/* Packs tab */
	#mp-inbox .pk-hero{ text-align:center; padding:16px 0 6px; }
	#mp-inbox .pk-count{ font-size:2.4rem; font-weight:900; color:var(--gold); }
	#mp-inbox .pk-count .pk-cap{ color:var(--muted); font-size:1.2rem; font-weight:700; }
	#mp-inbox .pk-sub{ color:var(--muted); font-size:.86rem; margin-top:2px; }
	#mp-inbox .pk-bar{ height:12px; border-radius:999px; background:var(--pnl2); border:1px solid var(--bd); overflow:hidden; margin:16px 0 8px; }
	#mp-inbox .pk-fill{ height:100%; background:linear-gradient(90deg,var(--blue),var(--gold)); border-radius:999px; transition:width .5s ease; }
	#mp-inbox .pk-eta{ text-align:center; color:var(--muted); font-size:.9rem; }
	#mp-inbox .pk-eta b{ color:var(--txt); font-variant-numeric:tabular-nums; }
	#mp-inbox .pk-open{ display:block; text-align:center; color:var(--blue); font-weight:700; font-size:.86rem; margin-top:16px; }
	#mp-inbox .pk-open:hover{ text-decoration:underline; }
	#mp-inbox .pk-note{ color:var(--muted); font-size:.78rem; text-align:center; margin-top:14px; line-height:1.4; }

	/* small deck-picker dialog */
	#mp-deckpick{ position:fixed; inset:0; z-index:70; background:rgba(4,7,18,.55); display:none; align-items:center; justify-content:center; padding:20px; }
	#mp-deckpick.open{ display:flex; }
	#mp-deckpick .box{ background:var(--pnl,#141a35); color:var(--txt,#e8eaf6); border:1px solid var(--bd,#2e3a63); border-radius:16px; padding:20px; width:min(380px,100%); box-shadow:0 20px 60px rgba(0,0,0,.5);
		--pnl:#141a35; --pnl2:#1a2140; --bd:#2e3a63; --txt:#e8eaf6; --muted:#9aa3c8; --blue:#6ea8ff; }
	:root[data-theme="light"] #mp-deckpick .box{ --pnl:#fff; --pnl2:#f3f5ff; --bd:#dde1f2; --txt:#1b2038; --muted:#5a6288; --blue:#2b6cb0; }
	#mp-deckpick h3{ font-size:1.1rem; font-weight:800; margin-bottom:12px; }
	#mp-deckpick .dk{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 13px; border:1px solid var(--bd); border-radius:10px; background:var(--pnl2); margin-bottom:8px; cursor:pointer; }
	#mp-deckpick .dk:hover{ border-color:var(--blue); }
	#mp-deckpick .dk .cls{ color:var(--muted); font-size:.8rem; text-transform:capitalize; }
	#mp-deckpick .cancel{ width:100%; margin-top:6px; background:none; border:1px solid var(--bd); color:var(--muted); border-radius:9px; padding:9px; font:inherit; cursor:pointer; }
	`;
	document.head.appendChild(s);
}

// ---------- state ----------
let state = { challenges: [], friends: [], presence: {}, inbox: [], me: null, waitingOn: null, view: 'alerts', thread: null };
let pollTimer = null, waitTimer = null;

function seenTs() { try { return +localStorage.getItem(SEEN_KEY) || 0; } catch { return 0; } }
function markSeen() { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch {} }

// ---------- top bar ----------
function buildBar() {
	injectStyles();
	let bar = $('#mp-topbar');
	if (!bar) { bar = el('div'); bar.id = 'mp-topbar'; document.body.insertBefore(bar, document.body.firstChild); }
	const loggedIn = MP.hasToken();
	const name = MP.cachedState()?.username || 'Account';
	if (COMPACT) {
		// a small floating cluster (home + inbox) that never covers gameplay
		bar.classList.add('tb-compact');
		bar.innerHTML = `<div class="tb-right">
			<a class="tb-mini" href="/" title="Magepunk home">⚙️</a>
			${loggedIn ? `<button class="tb-mini" id="tb-bell" title="Inbox">🔔<span class="tb-badge" id="tb-badge">0</span></button>` : ''}
		</div>`;
	} else {
		bar.innerHTML = `
			<a class="tb-brand" href="/"><span class="cog">⚙️</span> Magepunk</a>
			<div class="tb-right">
				${loggedIn
					? `<button class="tb-bell" id="tb-bell" title="Inbox">🔔<span class="tb-badge" id="tb-badge">0</span></button>
					   <a class="tb-chip" href="/profile/" title="Your profile">👤 ${esc(name)}</a>`
					: `<a class="tb-login" href="/login/?next=${encodeURIComponent(location.pathname + location.search)}">Log in</a>`}
			</div>`;
	}
	if (loggedIn) $('#tb-bell', bar)?.addEventListener('click', openInbox);
}

function setBadge(n) {
	const b = $('#tb-badge'); if (!b) return;
	b.textContent = n > 9 ? '9+' : String(n);
	b.classList.toggle('show', n > 0);
}

// ---------- background poll (badge only) ----------
function applyPackTimer(pk) {
	if (!pk) return;
	state.packInbox = pk.packInbox || 0;
	state.packCap = pk.packCap || 120;
	state.packEtaTarget = pk.nextPackMs == null ? null : Date.now() + pk.nextPackMs;
}
function badgeCount() {
	return (state.challenges?.length || 0) + (state.unread || 0) + ((state.packInbox || 0) > 0 ? 1 : 0);
}
async function poll() {
	if (!MP.hasToken()) return;
	try {
		const [ch, msg, pk] = await Promise.all([
			MP.call('challenges').catch(() => ({ challenges: [] })),
			MP.call('chat-get', { room: 'u:' + (MP.cachedState()?.username || '') }).catch(() => ({ messages: [] })),
			MP.call('pack-timer').catch(() => null),
		]);
		state.challenges = ch.challenges || [];
		const unread = (msg.messages || []).filter(m => m.ts > seenTs() && m.from !== MP.cachedState()?.username);
		state.unread = unread.length;
		applyPackTimer(pk);
		setBadge(badgeCount());
	} catch (e) {}
}

// ---------- inbox panel ----------
function ensurePanel() {
	if ($('#mp-inbox')) return;
	const ov = el('div'); ov.id = 'mp-inbox-overlay'; ov.addEventListener('click', closeInbox);
	const panel = el('div'); panel.id = 'mp-inbox';
	panel.innerHTML = `
		<div class="ib-head"><h2>Inbox</h2><button class="ib-close" id="ib-close" title="Close">×</button></div>
		<div class="ib-tabs">
			<button class="ib-tab active" data-view="alerts">Alerts <span class="dot" id="dot-alerts" hidden></span></button>
			<button class="ib-tab" data-view="packs">Packs <span class="dot" id="dot-packs" hidden></span></button>
			<button class="ib-tab" data-view="friends">Friends</button>
			<button class="ib-tab" data-view="messages">Messages <span class="dot" id="dot-messages" hidden></span></button>
		</div>
		<div class="ib-body" id="ib-body"></div>
		<div class="toast" id="ib-toast"></div>`;
	document.body.appendChild(ov); document.body.appendChild(panel);
	$('#ib-close', panel).addEventListener('click', closeInbox);
	panel.querySelectorAll('.ib-tab').forEach(t => t.addEventListener('click', () => { state.view = t.dataset.view; state.thread = null; renderTabs(); renderBody(); }));

	// deck picker
	const dp = el('div'); dp.id = 'mp-deckpick';
	dp.innerHTML = `<div class="box"><h3 id="dp-title">Pick a deck</h3><div id="dp-list"></div><button class="cancel" id="dp-cancel">Cancel</button></div>`;
	document.body.appendChild(dp);
	dp.addEventListener('click', e => { if (e.target === dp) dp.classList.remove('open'); });
	$('#dp-cancel', dp).addEventListener('click', () => dp.classList.remove('open'));
}

function toast(msg) {
	const t = $('#ib-toast'); if (!t) return;
	t.textContent = msg; t.classList.add('show');
	clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200);
}

async function openInbox() {
	ensurePanel();
	state.me = MP.cachedState()?.username || null;
	$('#mp-inbox-overlay').classList.add('open');
	requestAnimationFrame(() => $('#mp-inbox').classList.add('open'));
	await refreshData();
	renderTabs(); renderBody();
}
function closeInbox() {
	$('#mp-inbox')?.classList.remove('open');
	$('#mp-inbox-overlay')?.classList.remove('open');
	clearInterval(state.packTicker); state.packTicker = null;
	if (state.view === 'messages') { markSeen(); poll(); }
}

async function refreshData() {
	const room = 'u:' + (state.me || '');
	try {
		const [ch, fr, msg, pk] = await Promise.all([
			MP.call('challenges').catch(() => ({ challenges: [] })),
			MP.call('friends').catch(() => ({ friends: [] })),
			MP.call('chat-get', { room }).catch(() => ({ messages: [] })),
			MP.call('pack-timer').catch(() => null),
		]);
		state.challenges = ch.challenges || [];
		state.friends = (fr.friends || []).map(f => typeof f === 'string' ? { username: f } : f);
		state.inbox = msg.messages || [];
		applyPackTimer(pk);
		// presence: prefer inline on friends payload, else ask
		if (!state.friends.some(f => 'online' in f)) {
			try { const pr = await MP.call('presence', { who: state.friends.map(f => f.username) }); state.presence = pr.presence || pr.online || {}; } catch {}
		}
	} catch (e) {}
}

function isOnline(f) {
	if ('online' in f) return !!f.online;
	const p = state.presence[f.username];
	return p === true || (p && (p.online || (p.ts && Date.now() - p.ts < 45000)));
}

function renderTabs() {
	document.querySelectorAll('#mp-inbox .ib-tab').forEach(t => t.classList.toggle('active', t.dataset.view === state.view));
	const da = $('#dot-alerts'), dm = $('#dot-messages'), dp = $('#dot-packs');
	if (da) { da.textContent = state.challenges.length; da.hidden = !state.challenges.length; }
	const unread = state.inbox.filter(m => m.ts > seenTs() && m.from !== state.me).length;
	if (dm) { dm.textContent = unread; dm.hidden = !unread; }
	if (dp) { dp.textContent = state.packInbox || 0; dp.hidden = !(state.packInbox > 0); }
}

function renderBody() {
	clearInterval(state.packTicker); state.packTicker = null; // stop the countdown when leaving Packs
	const body = $('#ib-body'); if (!body) return;
	if (state.thread) return renderThread(body, state.thread);
	if (state.view === 'alerts') return renderAlerts(body);
	if (state.view === 'packs') return renderPacks(body);
	if (state.view === 'friends') return renderFriends(body);
	if (state.view === 'messages') return renderMessages(body);
}

// ----- Packs (the 12-hour free-pack inbox) -----
function packEta() { return state.packEtaTarget == null ? null : Math.max(0, state.packEtaTarget - Date.now()); }
function renderPacks(body) {
	const inbox = state.packInbox || 0, cap = state.packCap || 120;
	const eta = packEta(), full = eta == null;
	const pct = full ? 100 : Math.max(0, Math.min(100, (1 - eta / PACK_TIMER_MS) * 100));
	body.innerHTML = `
		<div class="pk-hero"><div class="pk-count">📦 ${inbox}<span class="pk-cap"> / ${cap}</span></div><div class="pk-sub">free packs waiting in your inbox</div></div>
		<div class="pk-bar"><div class="pk-fill" id="pk-fill" style="width:${pct}%"></div></div>
		<div class="pk-eta" id="pk-eta">${full ? '⛔ Inbox full — collect to keep earning' : 'Next pack in <b>' + fmtDur(eta) + '</b>'}</div>`;
	const collect = el('button', 'mini primary', inbox > 0 ? `Collect ${inbox} pack${inbox === 1 ? '' : 's'}` : 'Nothing to collect yet');
	collect.style.width = '100%'; collect.style.marginTop = '16px';
	if (inbox <= 0) { collect.disabled = true; collect.classList.remove('primary'); collect.style.opacity = '.6'; }
	collect.addEventListener('click', collectPacks);
	body.appendChild(collect);
	const open = el('a', 'pk-open', 'Open your packs →'); open.href = '/battlecards/packs.html';
	body.appendChild(open);
	body.appendChild(el('div', 'pk-note', 'You earn one free pack every 12 hours, up to ' + cap + '. Collect them here, then crack them open on the Packs screen.'));
	// live countdown
	clearInterval(state.packTicker);
	state.packTicker = setInterval(() => {
		const e = packEta();
		if (e == null) return;
		const f = $('#pk-fill'), t = $('#pk-eta');
		if (!f || !t) { clearInterval(state.packTicker); return; }
		f.style.width = Math.max(0, Math.min(100, (1 - e / PACK_TIMER_MS) * 100)) + '%';
		t.innerHTML = 'Next pack in <b>' + fmtDur(e) + '</b>';
		if (e <= 0) { clearInterval(state.packTicker); poll().then(() => { if (state.view === 'packs' && $('#ib-body')) renderPacks($('#ib-body')); renderTabs(); }); } // a pack just dropped
	}, 1000);
}
async function collectPacks() {
	try {
		const r = await MP.call('claim-packs');
		if (r.error) { toast(r.error); return; }
		toast(`Collected ${r.claimed} pack${r.claimed === 1 ? '' : 's'}! Open them on the Packs screen.`);
		if (r.state) applyPackTimer(r.state);
		setBadge(badgeCount()); renderTabs();
		if (state.view === 'packs' && $('#ib-body')) renderPacks($('#ib-body'));
	} catch { toast('Could not collect.'); }
}

// ----- Alerts (challenges) -----
function renderAlerts(body) {
	body.innerHTML = '';
	if (state.waitingOn) {
		const w = el('div', 'row');
		w.innerHTML = `<div class="av">⏳</div><div class="meta"><div class="name">Waiting for ${esc(state.waitingOn)}…</div><div class="sub">They'll get your card-battle challenge. This launches when they accept.</div></div>`;
		body.appendChild(w);
	}
	if (!state.challenges.length && !state.waitingOn) {
		body.appendChild(el('div', 'ib-empty', 'No challenges right now.<br>Challenge a friend from the Friends tab.'));
		return;
	}
	for (const c of state.challenges) {
		const kind = c.type === 'card' ? 'a card battle' : c.type === 'trade' ? 'a trade' : 'a Pokémon battle';
		const glyph = c.type === 'card' ? '🃏' : c.type === 'trade' ? '🤝' : '⚔️';
		const row = el('div', 'row');
		row.innerHTML = `<div class="av">${glyph}</div>
			<div class="meta"><div class="name">${esc(c.from)}</div><div class="sub">challenges you to ${kind}</div></div>
			<div class="acts"></div>`;
		const acts = $('.acts', row);
		if (c.type === 'card') {
			const accept = el('button', 'mini primary', 'Accept'); accept.addEventListener('click', () => acceptCard(c.from)); acts.appendChild(accept);
		} else {
			const go = el('button', 'mini primary', 'Open in Overworld'); go.addEventListener('click', () => { location.href = '/overworld/?mp=1'; }); acts.appendChild(go);
		}
		const dec = el('button', 'mini danger', 'Decline'); dec.addEventListener('click', () => declineChallenge(c.from)); acts.appendChild(dec);
		body.appendChild(row);
	}
}

// ----- Friends -----
function renderFriends(body) {
	body.innerHTML = '';
	if (!state.friends.length) {
		body.appendChild(el('div', 'ib-empty', 'No friends yet.<br>Add friends in the Overworld to battle and message them.'));
		return;
	}
	body.appendChild(el('div', 'note', 'Card battles launch right here. Pokémon battles open in the Overworld, where your team lives.'));
	for (const f of state.friends) {
		const on = isOnline(f);
		const row = el('div', 'row');
		row.innerHTML = `<div class="av">👤<span class="pres ${on ? 'on' : ''}" title="${on ? 'online' : 'offline'}"></span></div>
			<div class="meta"><div class="name">${esc(f.username)}</div><div class="sub">${on ? 'online' : 'offline'}</div></div>
			<div class="acts"></div>`;
		const acts = $('.acts', row);
		const card = el('button', 'mini', '⚔ Cards'); card.addEventListener('click', () => challengeCard(f.username)); acts.appendChild(card);
		const msg = el('button', 'mini', '💬'); msg.title = 'Message'; msg.addEventListener('click', () => openThread(f.username)); acts.appendChild(msg);
		body.appendChild(row);
	}
}

// ----- Messages (thread list) -----
function renderMessages(body) {
	body.innerHTML = '';
	// group inbox by the other party
	const threads = new Map();
	for (const m of state.inbox) {
		const other = m.from === state.me ? (m.to || '?') : m.from;
		if (!threads.has(other)) threads.set(other, []);
		threads.get(other).push(m);
	}
	// also list all friends so you can start a new thread
	for (const f of state.friends) if (!threads.has(f.username)) threads.set(f.username, []);
	if (!threads.size) { body.appendChild(el('div', 'ib-empty', 'No messages yet.<br>Say hi to a friend from the Friends tab.')); return; }
	for (const [other, msgs] of threads) {
		const last = msgs[msgs.length - 1];
		const unread = msgs.some(m => m.ts > seenTs() && m.from !== state.me);
		const row = el('div', 'row');
		row.style.cursor = 'pointer';
		row.innerHTML = `<div class="av">👤</div>
			<div class="meta"><div class="name">${esc(other)}${unread ? ' <span style="color:var(--green)">•</span>' : ''}</div>
			<div class="sub">${last ? esc((last.from === state.me ? 'You: ' : '') + (last.text || last.emote || '')).slice(0, 46) : 'No messages yet'}</div></div>`;
		row.addEventListener('click', () => openThread(other));
		body.appendChild(row);
	}
}

// ----- a single DM thread -----
// A conversation lives in two rooms: messages the friend sent me are in u:<me>,
// messages I sent are in u:<other> (both readable by both friends). Merge them.
async function loadThread(other) {
	const [mine, theirs] = await Promise.all([
		MP.call('chat-get', { room: 'u:' + state.me }).catch(() => ({ messages: [] })),
		MP.call('chat-get', { room: 'u:' + other }).catch(() => ({ messages: [] })),
	]);
	state.inbox = mine.messages || state.inbox; // keep the badge/preview source fresh
	const incoming = (mine.messages || []).filter(m => m.from === other).map(m => ({ ...m, dir: 'them' }));
	const sent = (theirs.messages || []).filter(m => m.from === state.me).map(m => ({ ...m, dir: 'me' }));
	return [...incoming, ...sent].sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
async function openThread(other) {
	state.thread = other;
	state.threadMsgs = await loadThread(other);
	renderBody(); markSeen(); renderTabs();
}
function renderThread(body, other) {
	body.innerHTML = '';
	const wrap = el('div', 'thread');
	const back = el('button', 'back', '← All messages'); back.addEventListener('click', () => { state.thread = null; state.threadMsgs = null; renderBody(); });
	const msgs = el('div', 'msgs');
	const conv = state.threadMsgs || [];
	if (!conv.length) msgs.appendChild(el('div', 'ib-empty', 'No messages yet. Say hi!'));
	for (const m of conv) msgs.appendChild(el('div', 'bubble ' + (m.dir === 'me' ? 'me' : 'them'), esc(m.text || m.emote || '')));
	const comp = el('div', 'composer');
	comp.innerHTML = `<input type="text" maxlength="140" placeholder="Message ${esc(other)}…"><button>Send</button>`;
	const input = $('input', comp), send = $('button', comp);
	const doSend = async () => {
		const text = input.value.trim(); if (!text) return;
		input.value = '';
		try {
			await MP.call('chat-post', { room: 'u:' + other, text });   // lands in the friend's inbox room
			(state.threadMsgs = state.threadMsgs || []).push({ from: state.me, text, ts: Date.now(), dir: 'me' }); // optimistic echo
			renderThread(body, other);
		} catch { toast('Could not send.'); }
	};
	send.addEventListener('click', doSend);
	input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
	wrap.appendChild(back); wrap.appendChild(msgs); wrap.appendChild(comp);
	body.appendChild(wrap);
	msgs.scrollTop = msgs.scrollHeight;
	setTimeout(() => input.focus(), 50);
}

// ---------- deck picker ----------
function pickDeck(title, onPick) {
	const decks = (MP.cachedState()?.decks) || [];
	const dp = $('#mp-deckpick'); const list = $('#dp-list');
	$('#dp-title').textContent = title;
	list.innerHTML = '';
	if (!decks.length) {
		list.innerHTML = `<div class="note" style="color:var(--muted);font-size:.86rem;line-height:1.5">You don't have a battle deck yet.</div>`;
		const b = el('button', 'dk'); b.innerHTML = `<span>🛠️ Build a deck</span><span class="cls">Deck Builder →</span>`;
		b.addEventListener('click', () => { location.href = '/battlecards/deck.html'; });
		list.appendChild(b);
	} else {
		for (const d of decks) {
			const b = el('button', 'dk');
			b.innerHTML = `<span>${esc(d.name || 'Deck')}</span><span class="cls">${esc(d.classId || '')}</span>`;
			b.addEventListener('click', () => { dp.classList.remove('open'); onPick(d); });
			list.appendChild(b);
		}
	}
	dp.classList.add('open');
}

// ---------- challenge / accept actions ----------
async function challengeCard(to) {
	// make sure decks are fresh
	try { await MP.freshState(); } catch {}
	pickDeck('Pick a deck to battle with', async (d) => {
		try {
			await MP.call('challenge', { to, battleType: 'card', party: { deck: d.cards, classId: d.classId, commander: d.commander || null, companion: d.companion || null } });
			state.waitingOn = to; state.view = 'alerts'; renderTabs(); renderBody();
			startWaitForAccept();
			toast('Challenge sent to ' + to + '.');
		} catch { toast('Could not send the challenge.'); }
	});
}

function startWaitForAccept() {
	clearInterval(waitTimer);
	const t0 = Date.now();
	waitTimer = setInterval(async () => {
		if (Date.now() - t0 > 60000) { clearInterval(waitTimer); state.waitingOn = null; if ($('#mp-inbox')?.classList.contains('open')) renderBody(); return; }
		try {
			const mm = await MP.call('my-match');
			if (mm && mm.matchId) { clearInterval(waitTimer); if (mm.type === 'card') location.href = CARD_DUEL(mm.matchId); else location.href = '/overworld/?mp=1'; }
		} catch {}
	}, 2500);
}

async function acceptCard(from) {
	try { await MP.freshState(); } catch {}
	pickDeck('Pick a deck to battle with', async (d) => {
		try {
			const data = await MP.call('accept-challenge', { from, battleType: 'card', party: { deck: d.cards, classId: d.classId, commander: d.commander || null, companion: d.companion || null } });
			if (data.error) { toast(data.error); return; }
			location.href = CARD_DUEL(data.matchId);
		} catch { toast('Could not accept.'); }
	});
}

async function declineChallenge(from) {
	try { await MP.call('decline-challenge', { from }); } catch {}
	state.challenges = state.challenges.filter(c => c.from !== from);
	renderTabs(); renderBody(); poll();
}

// ---------- boot ----------
function start() {
	buildBar();
	if (!MP.hasToken()) return;
	poll();
	pollTimer = setInterval(poll, 12000);
	document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

export { openInbox };
