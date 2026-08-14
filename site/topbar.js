// site/topbar.js — the shared Magepunk top bar + social inbox.
//
// Drop `<script type="module" src="/site/topbar.js"></script>` on any content
// page. It injects a consistent bar (⚙️ Magepunk wordmark home-link + account
// area) and, when logged in, an inbox bell that opens a slide-in panel with:
//   • Alerts   — incoming battle challenges. Card duels launch here; Pokémon
//                challenges are accepted here too (your saved team is read from
//                localStorage) and the match opens in the Overworld to render.
//                Trades route into the Overworld where the trade UI lives.
//   • Friends  — your friends with presence + "Card"/"Pokémon" challenge + "Message",
//                and a "Watch" button to spectate a friend who's live in a battle
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
	#mp-topbar.tb-compact{ position:fixed; top:max(10px, env(safe-area-inset-top)); right:max(10px, env(safe-area-inset-right)); padding:0; width:auto; background:none; z-index:55; }
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
	#mp-inbox .row .meta .name .live{ color:#ff5470; font-size:.64rem; font-weight:800; letter-spacing:.5px; vertical-align:middle; margin-left:6px; animation:mp-livepulse 1.6s ease-in-out infinite; }
	@keyframes mp-livepulse{ 0%,100%{opacity:1} 50%{opacity:.4} }
	@media (prefers-reduced-motion: reduce){ #mp-inbox .row .meta .name .live{ animation:none; } }
	#mp-inbox .row .acts{ display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
	#mp-inbox button.mini{ background:var(--pnl); border:1px solid var(--bd); color:var(--txt); font:inherit; font-size:.78rem; font-weight:700; padding:6px 10px; border-radius:8px; cursor:pointer; white-space:nowrap; }
	#mp-inbox button.mini:hover{ border-color:var(--blue); }
	#mp-inbox button.mini.primary{ background:linear-gradient(180deg,var(--gold),color-mix(in srgb,var(--gold) 80%,#000)); color:#0c1122; border-color:transparent; }
	#mp-inbox button.mini.danger{ color:#ff8a8a; }
	#mp-inbox .note{ color:var(--muted); font-size:.8rem; margin:2px 0 12px; line-height:1.4; }
	#mp-inbox .addf{ display:flex; gap:8px; margin-bottom:10px; }
	#mp-inbox .addf input{ flex:1; min-width:0; background:var(--pnl); border:1px solid var(--bd); color:var(--txt); border-radius:8px; padding:8px 11px; font:inherit; font-size:.86rem; }
	#mp-inbox .addf input:focus{ outline:none; border-color:var(--blue); }
	#mp-inbox .addf button{ white-space:nowrap; }
	#mp-inbox .mycode{ color:var(--muted); font-size:.8rem; margin:-2px 0 12px; line-height:1.4; }
	#mp-inbox .mycode b{ color:var(--gold); letter-spacing:2px; font-size:.9rem; }
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

	/* Quests tab */
	#mp-inbox .quest{ border:1px solid var(--bd); border-radius:12px; background:var(--pnl2); padding:13px 14px; margin-bottom:10px; }
	#mp-inbox .quest.claimed{ opacity:.55; }
	#mp-inbox .q-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
	#mp-inbox .q-label{ font-weight:700; font-size:.94rem; line-height:1.3; }
	#mp-inbox .q-reward{ flex-shrink:0; color:var(--gold); font-weight:800; font-size:.86rem; }
	#mp-inbox .q-bar{ height:8px; border-radius:999px; background:var(--pnl); border:1px solid var(--bd); overflow:hidden; margin:10px 0 8px; }
	#mp-inbox .q-fill{ height:100%; background:linear-gradient(90deg,var(--blue),var(--green)); border-radius:999px; transition:width .4s ease; }
	#mp-inbox .q-foot{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
	#mp-inbox .q-prog{ color:var(--muted); font-size:.82rem; font-variant-numeric:tabular-nums; }
	#mp-inbox .q-todo{ color:var(--muted); font-size:.78rem; }
	#mp-inbox .q-claimed{ color:var(--green); font-size:.82rem; font-weight:700; }
	#mp-inbox .quest .mini{ padding:5px 14px; }

	/* daily streak banner */
	#mp-inbox .streak{ border:1px solid color-mix(in srgb, var(--gold) 40%, var(--bd)); border-radius:14px; padding:14px; margin-bottom:14px;
		background:linear-gradient(150deg, color-mix(in srgb, var(--gold) 12%, var(--pnl2)), var(--pnl2)); }
	#mp-inbox .streak.claimed{ opacity:.8; border-color:var(--bd); background:var(--pnl2); }
	#mp-inbox .st-top{ display:flex; align-items:center; gap:12px; }
	#mp-inbox .st-flame{ font-size:1.5rem; }
	#mp-inbox .st-flame b{ color:var(--gold); font-size:1.7rem; }
	#mp-inbox .st-name{ font-weight:800; font-size:1rem; }
	#mp-inbox .st-sub{ color:var(--muted); font-size:.82rem; margin-top:1px; }
	#mp-inbox .st-week{ display:flex; gap:6px; margin:12px 0; }
	#mp-inbox .st-week .sd{ flex:1; height:8px; border-radius:999px; background:var(--pnl); border:1px solid var(--bd); }
	#mp-inbox .st-week .sd.on{ background:linear-gradient(90deg,var(--gold),color-mix(in srgb,var(--gold) 70%,#e5843d)); border-color:transparent; }
	#mp-inbox .st-week .sd.milestone{ position:relative; }
	#mp-inbox .st-week .sd.milestone::after{ content:'★'; position:absolute; top:-13px; left:50%; transform:translateX(-50%); font-size:9px; color:var(--gold); }
	#mp-inbox .st-done{ display:block; text-align:center; color:var(--green); font-size:.86rem; font-weight:600; }
	#mp-inbox .st-done b{ font-variant-numeric:tabular-nums; }

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

	/* ---- accessibility ---- */
	/* a clear keyboard focus ring on every interactive element, site-wide */
	a:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline:2px solid #6ea8ff; outline-offset:2px; border-radius:6px; }
	#mp-inbox .ib-tab[aria-selected="true"]{ color:var(--txt); background:var(--pnl2); }
	/* honor reduced-motion for the panel slide + all component transitions */
	@media (prefers-reduced-motion: reduce){
		#mp-inbox{ transition:none; }
		#mp-topbar *, #mp-inbox *, #mp-deckpick *{ transition:none !important; animation:none !important; }
	}
	`;
	document.head.appendChild(s);
}

// ---------- state ----------
let state = { challenges: [], friends: [], presence: {}, inbox: [], me: null, waitingOn: null, waitingType: null, view: 'alerts', thread: null };
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
			${loggedIn ? `<button class="tb-mini" id="tb-bell" title="Inbox" aria-label="Open inbox" aria-haspopup="dialog">🔔<span class="tb-badge" id="tb-badge" aria-hidden="true">0</span></button>` : ''}
		</div>`;
	} else {
		bar.innerHTML = `
			<a class="tb-brand" href="/"><span class="cog">⚙️</span> Magepunk</a>
			<div class="tb-right">
				${loggedIn
					? `<button class="tb-bell" id="tb-bell" title="Inbox" aria-label="Open inbox" aria-haspopup="dialog">🔔<span class="tb-badge" id="tb-badge" aria-hidden="true">0</span></button>
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
	if ('featuredClaimed' in pk) state.featuredClaimed = pk.featuredClaimed; // Card of the Week claim state
}
function claimableQuests() { return (state.quests || []).filter(q => !q.claimed && q.progress >= q.target).length; }
function streakClaimable() { return state.streak && !state.streak.claimedToday ? 1 : 0; }
function featuredClaimable() { return MP.hasToken() && state.featuredClaimed === false; } // this week's free card uncollected
function badgeCount() {
	return (state.challenges?.length || 0) + (state.unread || 0) + ((state.packInbox || 0) > 0 ? 1 : 0) + claimableQuests() + streakClaimable() + (featuredClaimable() ? 1 : 0);
}
async function poll() {
	if (!MP.hasToken()) return;
	try {
		const [ch, msg, pk, qs] = await Promise.all([
			MP.call('challenges').catch(() => ({ challenges: [] })),
			MP.call('chat-get', { room: 'u:' + (MP.cachedState()?.username || '') }).catch(() => ({ messages: [] })),
			MP.call('pack-timer').catch(() => null),
			MP.call('quests').catch(() => null),
		]);
		state.challenges = ch.challenges || [];
		const unread = (msg.messages || []).filter(m => m.ts > seenTs() && m.from !== MP.cachedState()?.username);
		state.unread = unread.length;
		applyPackTimer(pk);
		if (qs) { state.quests = qs.quests || []; state.questReset = qs.resetsInMs; state.streak = qs.streak || null; }
		setBadge(badgeCount());
	} catch (e) {}
}

// ---------- inbox panel ----------
function ensurePanel() {
	if ($('#mp-inbox')) return;
	const ov = el('div'); ov.id = 'mp-inbox-overlay'; ov.addEventListener('click', closeInbox);
	const panel = el('div'); panel.id = 'mp-inbox';
	panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Inbox');
	panel.innerHTML = `
		<div class="ib-head"><h2 id="ib-title">Inbox</h2><button class="ib-close" id="ib-close" title="Close" aria-label="Close inbox">×</button></div>
		<div class="ib-tabs" role="tablist" aria-label="Inbox sections">
			<button class="ib-tab active" data-view="alerts" role="tab" aria-selected="true">Alerts <span class="dot" id="dot-alerts" hidden></span></button>
			<button class="ib-tab" data-view="quests" role="tab" aria-selected="false" tabindex="-1">Quests <span class="dot" id="dot-quests" hidden></span></button>
			<button class="ib-tab" data-view="packs" role="tab" aria-selected="false" tabindex="-1">Packs <span class="dot" id="dot-packs" hidden></span></button>
			<button class="ib-tab" data-view="friends" role="tab" aria-selected="false" tabindex="-1">Friends</button>
			<button class="ib-tab" data-view="messages" role="tab" aria-selected="false" tabindex="-1">Messages <span class="dot" id="dot-messages" hidden></span></button>
		</div>
		<div class="ib-body" id="ib-body" role="region" aria-live="polite"></div>
		<div class="toast" id="ib-toast" role="status" aria-live="polite"></div>`;
	document.body.appendChild(ov); document.body.appendChild(panel);
	$('#ib-close', panel).addEventListener('click', closeInbox);
	const tabs = [...panel.querySelectorAll('.ib-tab')];
	const goTab = t => { state.view = t.dataset.view; state.thread = null; renderTabs(); renderBody(); t.focus(); };
	tabs.forEach(t => t.addEventListener('click', () => goTab(t)));
	// arrow-key navigation between tabs (WAI-ARIA tablist pattern)
	panel.querySelector('.ib-tabs').addEventListener('keydown', e => {
		const i = tabs.indexOf(document.activeElement);
		if (i < 0) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); goTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]); }
		else if (e.key === 'Home') { e.preventDefault(); goTab(tabs[0]); }
		else if (e.key === 'End') { e.preventDefault(); goTab(tabs[tabs.length - 1]); }
	});
	// Escape closes the inbox from anywhere inside it
	panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeInbox(); } });

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
	state._returnFocus = document.activeElement; // return focus here on close (the bell)
	$('#mp-inbox-overlay').classList.add('open');
	requestAnimationFrame(() => $('#mp-inbox').classList.add('open'));
	$('#ib-close')?.focus(); // move keyboard focus into the dialog
	await refreshData();
	renderTabs(); renderBody();
}
function closeInbox() {
	$('#mp-inbox')?.classList.remove('open');
	$('#mp-inbox-overlay')?.classList.remove('open');
	clearInterval(state.packTicker); state.packTicker = null;
	clearInterval(state.friendsTicker); state.friendsTicker = null;
	if (state.view === 'messages') { markSeen(); poll(); }
	const back = state._returnFocus; state._returnFocus = null;
	if (back && back.focus) back.focus(); else $('#tb-bell')?.focus();
}

async function refreshData() {
	const room = 'u:' + (state.me || '');
	try {
		const [ch, fr, msg, pk, qs] = await Promise.all([
			MP.call('challenges').catch(() => ({ challenges: [] })),
			MP.call('friends').catch(() => ({ friends: [] })),
			MP.call('chat-get', { room }).catch(() => ({ messages: [] })),
			MP.call('pack-timer').catch(() => null),
			MP.call('quests').catch(() => null),
		]);
		state.challenges = ch.challenges || [];
		state.friends = (fr.friends || []).map(f => typeof f === 'string' ? { username: f } : f);
		state.myFriendCode = fr.friendCode || MP.cachedState()?.friendCode || state.myFriendCode || null;
		state.inbox = msg.messages || [];
		applyPackTimer(pk);
		if (qs) { state.quests = qs.quests || []; state.questReset = qs.resetsInMs; state.streak = qs.streak || null; }
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
	document.querySelectorAll('#mp-inbox .ib-tab').forEach(t => {
		const on = t.dataset.view === state.view;
		t.classList.toggle('active', on);
		t.setAttribute('aria-selected', on ? 'true' : 'false');
		t.tabIndex = on ? 0 : -1;
	});
	const da = $('#dot-alerts'), dm = $('#dot-messages'), dp = $('#dot-packs');
	const alertsN = state.challenges.length + (featuredClaimable() ? 1 : 0);
	if (da) { da.textContent = alertsN; da.hidden = !alertsN; }
	const unread = state.inbox.filter(m => m.ts > seenTs() && m.from !== state.me).length;
	if (dm) { dm.textContent = unread; dm.hidden = !unread; }
	if (dp) { dp.textContent = state.packInbox || 0; dp.hidden = !(state.packInbox > 0); }
	const dq = $('#dot-quests'); const cq = claimableQuests();
	if (dq) { dq.textContent = cq; dq.hidden = !cq; }
}

function renderBody() {
	clearInterval(state.packTicker); state.packTicker = null; // stop the countdown when leaving Packs
	clearInterval(state.friendsTicker); state.friendsTicker = null; // stop live-status polling when leaving Friends
	const body = $('#ib-body'); if (!body) return;
	if (state.thread) return renderThread(body, state.thread);
	if (state.view === 'alerts') return renderAlerts(body);
	if (state.view === 'quests') return renderQuests(body);
	if (state.view === 'packs') return renderPacks(body);
	if (state.view === 'friends') return renderFriends(body);
	if (state.view === 'messages') return renderMessages(body);
}

// ----- Daily quests + streak -----
function renderStreak(body) {
	const s = state.streak; if (!s) return;
	const banner = el('div', 'streak' + (s.claimedToday ? ' claimed' : ''));
	const weekDay = ((s.count || 0) % 7) || (s.count ? 7 : 0); // 0..7 within the current week
	const dots = Array.from({ length: 7 }, (_, i) => `<span class="sd${i < weekDay ? ' on' : ''}${(i + 1) === 7 ? ' milestone' : ''}"></span>`).join('');
	banner.innerHTML = `
		<div class="st-top"><div class="st-flame">🔥 <b>${s.count || 0}</b></div><div class="st-txt"><div class="st-name">Daily streak</div><div class="st-sub">${s.count ? `${s.count}-day streak` : 'Start your streak today'}</div></div></div>
		<div class="st-week">${dots}</div>`;
	const act = el('div', 'st-act');
	if (s.claimedToday) act.innerHTML = `<span class="st-done">✓ Claimed — back in <b>${state.questReset != null ? fmtDur(state.questReset).slice(0, 5) : '—'}</b></span>`;
	else { const b = el('button', 'mini primary', `Claim daily reward · 📦 ${s.nextReward}`); b.style.width = '100%'; b.addEventListener('click', streakClaim); act.appendChild(b); }
	banner.appendChild(act);
	body.appendChild(banner);
}
async function streakClaim() {
	try {
		const r = await MP.call('streak-claim');
		if (r.error) { if (r.streak) state.streak = r.streak; toast(r.error); renderTabs(); if ($('#ib-body')) renderQuests($('#ib-body')); return; }
		state.streak = r.streak || state.streak;
		if (r.packInbox != null) state.packInbox = r.packInbox;
		toast(`🔥 ${state.streak.count}-day streak! +${r.reward} pack${r.reward === 1 ? '' : 's'} in your inbox.`);
		setBadge(badgeCount()); renderTabs();
		if (state.view === 'quests' && $('#ib-body')) renderQuests($('#ib-body'));
	} catch { toast('Could not claim.'); }
}
function renderQuests(body) {
	body.innerHTML = '';
	renderStreak(body);
	const quests = state.quests || [];
	const resetTxt = state.questReset != null ? fmtDur(state.questReset).slice(0, 5) : '—';
	body.appendChild(el('div', 'note', `Four fresh quests every day — new ones in <b>${resetTxt}</b>. Rewards drop into your pack inbox.`));
	if (!quests.length) { body.appendChild(el('div', 'ib-empty', 'Loading your quests…')); return; }
	for (const q of quests) {
		const done = q.progress >= q.target;
		const row = el('div', 'quest' + (q.claimed ? ' claimed' : ''));
		const pct = Math.max(0, Math.min(100, (q.progress / q.target) * 100));
		row.innerHTML = `
			<div class="q-top"><div class="q-label">${esc(q.label)}</div><div class="q-reward">📦 ${q.reward}</div></div>
			<div class="q-bar"><div class="q-fill" style="width:${pct}%"></div></div>
			<div class="q-foot"><span class="q-prog">${q.progress} / ${q.target}</span></div>`;
		const foot = $('.q-foot', row);
		if (q.claimed) foot.appendChild(el('span', 'q-claimed', '✓ Claimed'));
		else if (done) { const b = el('button', 'mini primary', 'Claim'); b.addEventListener('click', () => claimQuest(q.id)); foot.appendChild(b); }
		else foot.appendChild(el('span', 'q-todo', 'In progress'));
		body.appendChild(row);
	}
}
async function claimQuest(id) {
	try {
		const r = await MP.call('claim-quest', { id });
		if (r.error) { toast(r.error); return; }
		state.quests = r.quests || state.quests;
		if (r.packInbox != null) state.packInbox = r.packInbox;
		toast(`Quest complete! +${r.reward} pack${r.reward === 1 ? '' : 's'} in your inbox.`);
		setBadge(badgeCount()); renderTabs();
		if (state.view === 'quests' && $('#ib-body')) renderQuests($('#ib-body'));
	} catch { toast('Could not claim.'); }
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
		const kindTxt = state.waitingType === 'pokemon' ? 'Pokémon-battle' : 'card-battle';
		w.innerHTML = `<div class="av">⏳</div><div class="meta"><div class="name">Waiting for ${esc(state.waitingOn)}…</div><div class="sub">They'll get your ${kindTxt} challenge. This launches when they accept.</div></div>`;
		body.appendChild(w);
	}
	if (featuredClaimable()) {
		const f = el('div', 'row');
		f.innerHTML = `<div class="av">🃏</div><div class="meta"><div class="name">Free Card of the Week</div><div class="sub">A legendary is waiting — collect it on the Battlecards screen.</div></div><div class="acts"></div>`;
		const go = el('button', 'mini primary', 'Collect'); go.addEventListener('click', () => { location.href = '/battlecards/start.html'; });
		$('.acts', f).appendChild(go);
		body.appendChild(f);
	}
	if (!state.challenges.length && !state.waitingOn && !featuredClaimable()) {
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
		} else if (c.type === 'pokemon') {
			const accept = el('button', 'mini primary', 'Accept'); accept.addEventListener('click', () => acceptPokemon(c.from)); acts.appendChild(accept);
		} else {
			const go = el('button', 'mini primary', 'Open in Overworld'); go.addEventListener('click', () => { location.href = '/overworld/?mp=1'; }); acts.appendChild(go);
		}
		const dec = el('button', 'mini danger', 'Decline'); dec.addEventListener('click', () => declineChallenge(c.from)); acts.appendChild(dec);
		body.appendChild(row);
	}
}

// add a friend from the inbox (no Overworld needed). One input takes either a
// username or a 6-letter friend code; we try the likely reading first and fall
// back to the other so a 6-letter username still resolves.
async function addFriend(raw) {
	const v = (raw || '').trim();
	if (!v) return;
	const looksCode = /^[A-Za-z]{6}$/.test(v);
	const attempts = looksCode ? [{ code: v }, { username: v }] : [{ username: v }, { code: v }];
	for (const payload of attempts) {
		let r;
		try { r = await MP.call('add-friend', payload); } catch { continue; }
		if (r && !r.error) {
			toast('Added ' + (r.added || v) + '!');
			state.myFriendCode = MP.cachedState()?.friendCode || state.myFriendCode;
			await refreshData();
			if (state.view === 'friends' && $('#mp-inbox')?.classList.contains('open')) renderBody();
			return;
		}
	}
	toast('No player found with that username or code.');
}

// ----- Friends -----
// A friend's live activity is read from their presence `status` (set by the
// Overworld heartbeat / the card client's publish-cardstate):
//   battling:<matchId> → in a Pokémon battle (spectate via the Overworld)
//   card:<mode>        → in a card duel / run (spectate on the Battlecards page)
const CARD_MODE_LABEL = { dungeon: 'a dungeon run', pvp: 'a card duel', battle: 'a card battle', heist: 'a Heist run', tombs: 'a Tombs run', duels: 'a Duels run' };
function friendActivity(f) {
	const st = f.status || '';
	if (st.startsWith('battling:')) return { live: true, kind: 'pokemon', matchId: st.slice('battling:'.length), label: 'in a Pokémon battle' };
	if (st.startsWith('card:')) { const m = st.slice('card:'.length); return { live: true, kind: 'card', label: 'in ' + (CARD_MODE_LABEL[m] || 'a card game') }; }
	if (st.startsWith('visiting:')) return { live: false, kind: null, label: 'exploring' };
	return { live: false, kind: null, label: isOnline(f) ? 'online' : 'offline' };
}
// route to the right spectator view for a live friend
function watchFriend(f) {
	const act = friendActivity(f);
	if (act.kind === 'pokemon') { if (!act.matchId) { toast('Their battle just ended.'); return; } location.href = '/overworld/?mp=1&watch=' + encodeURIComponent(act.matchId); }
	else if (act.kind === 'card') location.href = '/battlecards/?spectate=' + encodeURIComponent(f.username) + '&mp=1';
	else toast(f.username + ' isn\'t in a battle right now.');
}
// While the Friends tab is open, re-poll presence so a friend going live (or a
// battle ending) shows up without reopening the panel. Only re-renders when a
// status/online bit actually flips, so the list doesn't churn under the cursor.
function friendsSig() { return state.friends.map(f => `${f.username}:${f.status || ''}:${isOnline(f) ? 1 : 0}`).join('|'); }
function ensureFriendsAuto() {
	if (state.friendsTicker) return;
	state._friendsSig = friendsSig();
	state.friendsTicker = setInterval(friendsAutoTick, 8000);
}
async function friendsAutoTick() {
	// bail (and stop) if we've navigated away or closed the inbox
	if (state.view !== 'friends' || state.thread || !$('#mp-inbox')?.classList.contains('open')) { clearInterval(state.friendsTicker); state.friendsTicker = null; return; }
	let fr;
	try { fr = await MP.call('friends'); } catch { return; }
	state.friends = (fr.friends || []).map(f => typeof f === 'string' ? { username: f } : f);
	if (fr.friendCode) state.myFriendCode = fr.friendCode;
	if (!state.friends.some(f => 'online' in f)) {
		try { const pr = await MP.call('presence', { who: state.friends.map(f => f.username) }); state.presence = pr.presence || pr.online || {}; } catch {}
	}
	const sig = friendsSig();
	if (sig === state._friendsSig) return; // nothing changed → leave the DOM alone
	state._friendsSig = sig;
	const body = $('#ib-body'); if (body && state.view === 'friends' && !state.thread) renderFriends(body);
}
function renderFriends(body) {
	body.innerHTML = '';
	ensureFriendsAuto();
	// add-a-friend row (works without ever opening the Overworld)
	const add = el('div', 'addf');
	add.innerHTML = `<input type="text" maxlength="24" placeholder="Add by username or friend code" aria-label="Add a friend by username or friend code" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="mini primary">Add</button>`;
	const input = $('input', add), addBtn = $('button', add);
	const submit = () => { const v = input.value.trim(); if (v) { input.value = ''; addFriend(v); } };
	addBtn.addEventListener('click', submit);
	input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
	body.appendChild(add);
	if (state.myFriendCode) {
		const mc = el('div', 'mycode'); mc.innerHTML = `Your friend code: <b>${esc(state.myFriendCode)}</b> — share it so others can add you.`;
		body.appendChild(mc);
	}
	if (!state.friends.length) {
		body.appendChild(el('div', 'ib-empty', 'No friends yet.<br>Add someone above by username or friend code.'));
		return;
	}
	body.appendChild(el('div', 'note', 'Challenge friends to card or Pokémon battles, or Watch one who\'s live. Card duels launch on the spot; Pokémon battles open in the Overworld.'));
	for (const f of state.friends) {
		const on = isOnline(f);
		const act = friendActivity(f);
		const row = el('div', 'row');
		row.innerHTML = `<div class="av">👤<span class="pres ${on ? 'on' : ''}" title="${on ? 'online' : 'offline'}"></span></div>
			<div class="meta"><div class="name">${esc(f.username)}${act.live ? ' <span class="live">● LIVE</span>' : ''}</div><div class="sub">${esc(act.label)}</div></div>
			<div class="acts"></div>`;
		const acts = $('.acts', row);
		if (act.live) {
			// mid-match: you can't challenge them, but you can watch
			const watch = el('button', 'mini primary', '👁 Watch'); watch.title = 'Spectate'; watch.addEventListener('click', () => watchFriend(f)); acts.appendChild(watch);
		} else {
			const card = el('button', 'mini', '🃏'); card.title = 'Card battle'; card.addEventListener('click', () => challengeCard(f.username)); acts.appendChild(card);
			const poke = el('button', 'mini', '⚔'); poke.title = 'Pokémon battle'; poke.addEventListener('click', () => challengePokemon(f.username)); acts.appendChild(poke);
		}
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

// ---------- Pokémon party snapshot (standalone) ----------
// Rebuild the self-contained party the PvP engine needs — byte-for-byte the same
// shape the Overworld's pvpParty() builds — straight from the team saved in
// localStorage, so a Pokémon challenge can be sent/accepted without opening the
// Overworld. Move power/type/category/acc/priority are enriched from the battle
// move table (the same file the game itself fetches; served cross-origin from the
// offloaded overworld-data project with CORS, so a plain fetch here works).
const POKE_PARTY_KEY = 'magepunk_party_v1';
let _moveTable = null;
async function moveTable() {
	if (_moveTable) return _moveTable;
	try { _moveTable = await fetch('/overworld/data/moves_battle.json').then(r => r.ok ? r.json() : {}); }
	catch { _moveTable = {}; }
	return _moveTable;
}
async function pokeParty() {
	let raw;
	try { raw = localStorage.getItem(POKE_PARTY_KEY); } catch { return null; }
	if (!raw) return null;
	let party;
	try { party = JSON.parse(raw); } catch { return null; }
	if (!Array.isArray(party) || !party.length || !party[0]?.stats) return null;
	const healthy = party.filter(m => m && m.curHP > 0).slice(0, 6);
	if (!healthy.length) return null;
	const moves = await moveTable();
	return healthy.map(m => ({
		speciesId: m.speciesId, name: m.name, level: m.level, types: m.types, sprite: m.sprite,
		stats: { ...m.stats }, maxHP: m.maxHP, curHP: m.curHP, status: m.status || null,
		moves: (m.moves || []).map(mv => {
			const info = moves[mv.id] || {};
			return { id: mv.id, name: mv.name, pp: mv.pp, maxPp: mv.maxPp,
				type: info.type || 'Normal', power: info.power || 0,
				category: info.category || 'Status', acc: info.acc ?? 100, priority: info.priority || 0 };
		}),
	}));
}

// ---------- challenge / accept actions ----------
async function challengeCard(to) {
	// make sure decks are fresh
	try { await MP.freshState(); } catch {}
	pickDeck('Pick a deck to battle with', async (d) => {
		try {
			await MP.call('challenge', { to, battleType: 'card', party: { deck: d.cards, classId: d.classId, commander: d.commander || null, companion: d.companion || null } });
			state.waitingOn = to; state.waitingType = 'card'; state.view = 'alerts'; renderTabs(); renderBody();
			startWaitForAccept();
			toast('Challenge sent to ' + to + '.');
		} catch { toast('Could not send the challenge.'); }
	});
}

// send a Pokémon challenge from anywhere: build the party from the saved team,
// then wait for the accept just like a card duel (it launches in the Overworld).
async function challengePokemon(to) {
	const snap = await pokeParty();
	if (!snap || !snap.length) { toast('Set up a healthy team in the Overworld first.'); return; }
	try {
		await MP.call('challenge', { to, battleType: 'pokemon', party: snap });
		state.waitingOn = to; state.waitingType = 'pokemon'; state.view = 'alerts'; renderTabs(); renderBody();
		startWaitForAccept();
		toast('Pokémon challenge sent to ' + to + '.');
	} catch { toast('Could not send the challenge.'); }
}

function startWaitForAccept() {
	clearInterval(waitTimer);
	const t0 = Date.now();
	waitTimer = setInterval(async () => {
		if (Date.now() - t0 > 60000) { clearInterval(waitTimer); state.waitingOn = null; state.waitingType = null; if ($('#mp-inbox')?.classList.contains('open')) renderBody(); return; }
		try {
			const mm = await MP.call('my-match');
			if (mm && mm.matchId) {
				clearInterval(waitTimer);
				// card duels run on the Battlecards page; Pokémon matches render in the
				// Overworld — pass the id so it enters the battle directly (no rejoin prompt)
				if (mm.type === 'card') location.href = CARD_DUEL(mm.matchId);
				else location.href = '/overworld/?mp=1&battle=' + encodeURIComponent(mm.matchId);
			}
		} catch {}
	}, 2500);
}

// accept an incoming Pokémon challenge standalone: send our saved team, then the
// server mints the match and we open the Overworld straight into it.
async function acceptPokemon(from) {
	const snap = await pokeParty();
	if (!snap || !snap.length) { toast('Set up a healthy team in the Overworld first.'); location.href = '/overworld/?mp=1'; return; }
	try {
		const data = await MP.call('accept-challenge', { from, battleType: 'pokemon', party: snap });
		if (data.error) { toast(data.error); return; }
		location.href = '/overworld/?mp=1&battle=' + encodeURIComponent(data.matchId);
	} catch { toast('Could not accept.'); }
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

// ---------- analytics beacon (cookieless, no PII) ----------
// One page-open hit with a coarse mode label so we can see what people use.
function analyticsLabel() {
	const p = (location.pathname || '/').replace(/\/+$/, '') || '/';
	const q = new URLSearchParams(location.search);
	if (p === '/' || p === '/index.html') return 'home';
	if (p.includes('/battlecards')) {
		if (q.has('cardpvp')) return 'bc:duel';
		if (q.has('aimatch')) return 'bc:ai';
		if (q.has('spectate') || q.has('watch')) return 'bc:spectate';
		for (const m of ['dungeon', 'heist', 'tombs', 'duels']) if (q.has(m)) return 'bc:' + m;
		if (p.includes('deck')) return 'bc:deck';
		if (p.includes('packs')) return 'bc:packs';
		if (p.includes('viewer')) return 'bc:gallery';
		if (p.includes('start')) return 'bc:start';
		if (q.has('players')) return 'bc:quickmatch';
		return 'bc';
	}
	if (p.includes('/overworld')) return q.has('battle') ? 'ow:battle' : q.has('watch') ? 'ow:spectate' : 'overworld';
	if (p.includes('/collection')) return 'collection';
	if (p.includes('/designwiki')) return 'wiki';
	if (p.includes('/learn')) return 'learn';
	if (p.includes('news')) return 'news';
	if (p.includes('/profile')) return 'profile';
	return p.split('/').filter(Boolean)[0] || 'other';
}
function sendHit() {
	try {
		const body = JSON.stringify({ action: 'hit', ev: analyticsLabel() });
		if (navigator.sendBeacon) navigator.sendBeacon('/api/mp', new Blob([body], { type: 'application/json' }));
		else fetch('/api/mp', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
	} catch {}
}

// ---------- boot ----------
function start() {
	buildBar();
	sendHit(); // count this page open (fires for logged-out visitors too)
	if (!MP.hasToken()) return;
	poll();
	pollTimer = setInterval(poll, 12000);
	document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

export { openInbox };
