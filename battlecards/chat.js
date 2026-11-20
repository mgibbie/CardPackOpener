// chat.js — a shared in-battle chat + emote overlay, used by both the card
// duels (game.js) and the Pokemon battles (overworld/pvp.js), for players and
// spectators alike. Pure DOM overlay so it floats over any canvas. Rooms are
// keyed server-side: 'm:<matchId>' for a match, 'u:<user>' for a solo run.
//
// Messages fade out on their own so they never clutter the board, the log is
// click-through (the game is playable behind it), and the whole thing collapses
// to a small pill you can toggle.
import * as MP from './mpmode.js';
import { openProfile } from './profile.js';

// Hearthstone-style quick emotes; id must be in the server's EMOTES set
export const EMOTES = {
	greetings: { icon: '👋', label: 'Greetings!' },
	well_played: { icon: '👍', label: 'Well played!' },
	thanks: { icon: '🙏', label: 'Thanks!' },
	wow: { icon: '😮', label: 'Wow!' },
	oops: { icon: '😅', label: 'Oops.' },
	threaten: { icon: '😠', label: "You'll pay for that!" },
	laugh: { icon: '😂', label: 'Haha!' },
	clap: { icon: '👏', label: 'Bravo!' },
	fire: { icon: '🔥', label: 'On fire!' },
	heart: { icon: '❤️', label: 'Nice one!' },
	cry: { icon: '😭', label: 'So close!' },
	gg: { icon: '🎉', label: 'Good game!' },
};
const BAR = ['greetings', 'well_played', 'thanks', 'wow', 'oops', 'threaten', 'laugh', 'clap', 'fire', 'heart', 'gg'];
const FADE_AFTER = 8000, FADE_DUR = 800; // a message lingers 8s, then fades over 0.8s

let el = null, timer = null, room = null, specRoom = null, me = null, seen = new Set(), lastTs = 0, lastSpecTs = 0;
// POLL CADENCE. Every chat-get is a paid server request, and the chat starts (and
// mostly stays) minimised to its 💬 pill: polling that every 1.5 s cost ~40 calls a
// minute in every battle, Micatro run and spectate view to light up a pill nobody had
// opened. So: fast only while the log is OPEN and the tab visible; minimised or hidden,
// one poll every POLL_SLOW (the pill still flashes on a new message within that time);
// opening it (or coming back to the tab with it open) polls at once.
export const POLL_OPEN = 1500, POLL_SLOW = 12_000;
let busy = false, rewake = false, gen = 0;   // gen: a remount retires the old mount's loop
const pollDelay = () => (!el || el.classList.contains('min') || document.hidden) ? POLL_SLOW : POLL_OPEN;
// when false, the next poll's messages are absorbed silently (marked seen) instead
// of shown — so a fresh mount or a new game starts with an empty log, no backlog
let primed = true;

const STYLE = `
/* the Balatro look (site/ui/balatro.css tokens, literal fallbacks): grey-green message chips, the kit's chunky grey
   buttons standing on a darker lip, the m6x11 font. The boxes keep their old sizes (the lip is a shadow: it takes no
   room), so nothing a game lays out around the chat moves. */
#mp-chat{position:fixed;left:10px;bottom:66px;width:290px;max-width:44vw;z-index:9000;
 font-family:var(--bal-font,'m6x11','m6x11plus',monospace);color:#fff;pointer-events:none;}
 /* bottom:66px — the mana HUD owns the bottom-left corner; the chat stacks above it */
#mp-chat *{box-sizing:border-box;}
#mp-chat .mc-log{display:flex;flex-direction:column;gap:4px;margin-bottom:6px;max-height:34vh;
 overflow:hidden;pointer-events:none;}  /* click-through: never blocks the game */
#mp-chat .mc-row{background:rgba(58,75,79,0.92);border-radius:10px;padding:5px 10px 3px;font-size:17px;line-height:1.1;
 box-shadow:0 3px 0 rgba(31,42,44,0.9);text-shadow:0 2px 0 rgba(0,0,0,.3);animation:mcpop .18s ease;
 word-break:break-word;transition:opacity .8s ease;}
#mp-chat .mc-row.mc-fade{opacity:0;}
#mp-chat .mc-row.mine{background:rgba(0,118,194,0.9);box-shadow:0 3px 0 rgba(0,80,132,0.9);}
#mp-chat .mc-row.spec{background:rgba(107,69,133,0.9);box-shadow:0 3px 0 rgba(70,44,88,0.9);}
#mp-chat .mc-eye{margin-right:4px;opacity:.85;}
#mp-chat .mc-row.emote{font-size:18px;}
#mp-chat .mc-who{color:#9fd3ff;margin-right:6px;pointer-events:auto;cursor:pointer;}
#mp-chat .mc-who:hover{text-decoration:underline;}
#mp-chat .mc-row.mine .mc-who{color:var(--bal-money,#f3b958);}
#mp-chat .mc-emoji{font-size:19px;margin-right:5px;vertical-align:-2px;}
#mp-chat .mc-bar{display:flex;flex-wrap:wrap;align-items:center;gap:5px;pointer-events:auto;}
#mp-chat .mc-min, #mp-chat .mc-em{background:var(--bal-grey,#5f7377);border:0;border-radius:9px;box-shadow:0 4px 0 var(--bal-grey-d,#435357);
 color:#fff;cursor:pointer;line-height:1;flex:none;touch-action:manipulation;transition:transform .06s,box-shadow .06s,filter .1s;}
#mp-chat .mc-min{font-family:inherit;font-size:18px;height:34px;min-width:34px;padding:0 8px;text-shadow:0 2px 0 rgba(0,0,0,.3);}
#mp-chat .mc-em{font-size:19px;width:36px;height:34px;padding:0;}
#mp-chat .mc-min:hover, #mp-chat .mc-em:hover{filter:brightness(1.1);}
#mp-chat .mc-min:active, #mp-chat .mc-em:active{transform:translateY(3px);box-shadow:0 1px 0 var(--bal-grey-d,#435357);}
#mp-chat .mc-min.flash{background:var(--bal-attn,#ff9a00);box-shadow:0 4px 0 var(--bal-orange-d,#c27c00);}
#mp-chat .mc-input{flex:1;min-width:100px;height:34px;background:var(--bal-panel-dd,#1f2a2c);
 border:3px solid var(--bal-outline-light,#bfc7d5);border-radius:9px;color:#fff;padding:3px 8px 1px;font:inherit;font-size:17px;}
#mp-chat .mc-input:focus{outline:none;border-color:#fff;}
#mp-chat .mc-input::placeholder{color:var(--bal-text-muted,#9fb0b3);}
#mp-chat.min .mc-log{display:none;}
#mp-chat.min .mc-bar > *:not(.mc-min){display:none;}  /* collapsed: just the pill */
/* While the card inspector is open it owns this corner: the panel is fixed at
   left:24px and on a short screen (1280x720) a tall card reaches down into the
   chat. The chat lives at z-index 9000 while the whole game UI is 8-60, so its
   emote bar (pointer-events:auto) sat ON TOP of the inspector's Play button and
   swallowed the click. Yield below the panel instead of re-ordering the app. */
#mp-chat.mc-yield{z-index:6;}
@keyframes mcpop{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@media(max-width:640px){#mp-chat{width:210px;}#mp-chat .mc-em{width:32px;height:30px;font-size:17px;}}
`;

// Balatro's button sounds (the site's UI kit, site/ui/sfx.js), loaded when the chat first mounts rather than with this
// module (the Overworld and Battlecards import it at boot). The kit unlocks audio on the next press, so the first tap sounds.
let sfxMod = null;
const loadSfx = () => (sfxMod = sfxMod || import('../site/ui/sfx.js').catch(() => null));
const sound = name => { loadSfx().then(m => { try { m && m.sfx[name](); } catch (e) {} }); };

function ensureStyle() {
	if (document.getElementById('mp-chat-style')) return;
	// the kit's tokens + the m6x11 font (its classes are all prefixed: loading it changes nothing else on the page)
	if (!document.querySelector('link[href*="/site/ui/balatro.css"]')) {
		const k = document.createElement('link'); k.rel = 'stylesheet'; k.href = '/site/ui/balatro.css'; document.head.appendChild(k);
	}
	const s = document.createElement('style');
	s.id = 'mp-chat-style';
	s.textContent = STYLE;
	document.head.appendChild(s);
}

// each message lingers, then fades and removes itself so the log stays clean
function fadeRow(row) {
	row._t1 = setTimeout(() => {
		row.classList.add('mc-fade');
		row._t2 = setTimeout(() => { if (row.parentNode) row.remove(); }, FADE_DUR);
	}, FADE_AFTER);
}

function render(messages) {
	if (!el) return;
	const log = el.querySelector('.mc-log');
	let added = false;
	for (const m of messages) {
		// dedup per-room (spectator vs players); include the body so two distinct
		// messages from one user on the same ms don't collide (one silently dropped)
		const key = (m._spec ? 's:' : 'p:') + m.ts + ':' + m.from + ':' + (m.emote || m.text || '');
		if (seen.has(key)) continue;
		if (seen.size > 400) seen.clear(); // the lastTs/lastSpecTs cursors already prevent re-fetch, so this can't re-show
		seen.add(key);
		if (m._spec) lastSpecTs = Math.max(lastSpecTs, m.ts); else lastTs = Math.max(lastTs, m.ts);
		added = true;
		const row = document.createElement('div');
		row.className = 'mc-row' + (m.from === me ? ' mine' : '') + (m.emote ? ' emote' : '') + (m._spec ? ' spec' : '');
		const who = `${m._spec ? '<span class="mc-eye" title="spectators only">👁</span>' : ''}<span class="mc-who" data-user="${esc(m.from)}" title="View ${esc(m.from)}'s profile">${esc(m.from)}</span>`;
		if (m.emote) {
			const e = EMOTES[m.emote] || { icon: '💬', label: m.emote };
			row.innerHTML = `${who}<span class="mc-emoji">${e.icon}</span>${esc(e.label)}`;
		} else {
			row.innerHTML = `${who}${esc(m.text)}`;
		}
		log.appendChild(row);
		fadeRow(row);
	}
	while (log.children.length > 6) log.removeChild(log.firstChild);
	if (added && el.classList.contains('min')) el.querySelector('.mc-min')?.classList.add('flash');
}

// textContent→innerHTML escapes & < > but NOT quotes; escape those too so a value
// is safe in a double-quoted attribute context (e.g. data-user="…"), not just element text
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

export function send(text, emote) {
	const target = specRoom || room; // spectators post to their OWN room — the players never see it, other spectators do
	if (!target) return;
	MP.call('chat-post', { room: target, text, emote }).catch(() => {});
}

// absorb a batch without showing it: mark every message seen + advance the room's cursor
function absorb(messages, isSpec) {
	for (const m of messages) {
		seen.add((isSpec ? 's:' : 'p:') + m.ts + ':' + m.from);
		if (isSpec) lastSpecTs = Math.max(lastSpecTs, m.ts); else lastTs = Math.max(lastTs, m.ts);
	}
}

async function tick() {
	if (!room) return;
	const first = !primed; // swallow each room's pre-game backlog on the first poll
	try {
		const d = await MP.call('chat-get', { room, since: lastTs });
		if (d && d.messages) first ? absorb(d.messages, false) : render(d.messages);
	} catch (e) {}
	if (specRoom) { // a spectator also reads/writes the spectator-only room
		try {
			const d = await MP.call('chat-get', { room: specRoom, since: lastSpecTs });
			if (d && d.messages) { const m = d.messages.map(x => ({ ...x, _spec: true })); first ? absorb(m, true) : render(m); }
		} catch (e) {}
	}
	primed = true;
}

function setMin(min) {
	el.classList.toggle('min', min);
	const b = el.querySelector('.mc-min');
	b.textContent = min ? '💬' : '▾';
	b.title = min ? 'show chat' : 'minimise chat';
	if (!min) { b.classList.remove('flash'); wake(); }   // opened: catch up now, then poll fast
}

// the self-rescheduling poll loop (not setInterval: an async tick on a slow link
// otherwise stacks overlapping requests, since an interval doesn't wait for the
// previous poll to finish). Each tick picks its next delay from pollDelay().
async function loop() {
	timer = null;
	if (!el) return;
	const g = gen;
	busy = true;
	await tick().catch(() => {});
	if (g !== gen) return;   // unmounted (or remounted) meanwhile: that mount runs its own loop
	busy = false;
	if (!el) return;
	if (rewake) { rewake = false; loop(); return; }
	timer = setTimeout(loop, pollDelay());
}
// poll now instead of waiting out a slow timer (a poll in flight re-runs once it lands)
function wake() {
	if (!el || !room) return;
	if (busy) { rewake = true; return; }
	if (timer) clearTimeout(timer);
	loop();
}
function onVisible() { if (!document.hidden && el && !el.classList.contains('min')) wake(); }

// mount the overlay. canPost=false gives a read-only log (players' chat). Pass
// specRoom to run in SPECTATOR mode: both text AND emotes post to the
// spectator-only room (visible to other spectators, never the players); the
// players' room (read-only) and the spectator room (read/write) are both shown,
// with spectator messages tagged 👁.
export function mount({ room: r, canPost = true, specRoom: sr = null } = {}) {
	if (el) unmount();
	ensureStyle();
	room = r;
	specRoom = sr;
	me = MP.cachedState()?.username || null;
	seen = new Set(); lastTs = 0; lastSpecTs = 0; primed = false; // hide whatever history already exists
	el = document.createElement('div');
	el.id = 'mp-chat';
	el.innerHTML = `<div class="mc-log"></div><div class="mc-bar"><button class="mc-min" title="minimise chat">▾</button></div>`;
	const bar = el.querySelector('.mc-bar');
	const spectator = !!specRoom;
	if (canPost || spectator) {
		for (const id of BAR) {
			const b = document.createElement('button');
			b.className = 'mc-em'; b.textContent = EMOTES[id].icon;
			b.title = spectator ? EMOTES[id].label + ' (spectators only)' : EMOTES[id].label;
			b.addEventListener('click', () => send('', id));
			bar.appendChild(b);
		}
		const input = document.createElement('input');
		input.className = 'mc-input'; input.maxLength = 140;
		input.placeholder = spectator ? 'Chat with other spectators…' : 'Say something…';
		input.addEventListener('keydown', ev => {
			ev.stopPropagation(); // don't let the game read battle keys while typing
			if (ev.key === 'Enter' && input.value.trim()) { send(input.value.trim()); input.value = ''; }
		});
		bar.appendChild(input);
	}
	el.querySelector('.mc-min').addEventListener('click', () => setMin(!el.classList.contains('min')));
	// click a chat author's name → their profile popup
	el.addEventListener('click', e => { const w = e.target.closest('.mc-who[data-user]'); if (w && w.dataset.user) openProfile(w.dataset.user); });
	// every chat button (the pill, an emote) presses with Balatro's button sound
	el.addEventListener('click', e => { if (e.target.closest('button')) sound('press'); }, true);
	loadSfx();
	document.body.appendChild(el);
	// start as just the 💬 pill on every screen — the expanded emote tray +
	// input cluttered the board's bottom-left (it flashes on new messages;
	// one tap expands)
	setMin(true);
	gen++; busy = false; rewake = false;
	document.addEventListener('visibilitychange', onVisible);
	loop();   // the first poll primes the room (absorbs its backlog) at once
}

export function unmount() {
	if (timer) clearTimeout(timer);
	timer = null; rewake = false; busy = false; gen++;
	document.removeEventListener('visibilitychange', onVisible);
	if (el && el.parentNode) el.parentNode.removeChild(el);
	el = null; room = null; specRoom = null; seen = new Set(); lastTs = 0; lastSpecTs = 0;
}

// wipe the visible log (e.g. when a new game starts). Re-arms priming so the next
// poll silently absorbs any pre-game messages instead of showing them.
export function clear() {
	if (!el) return;
	const log = el.querySelector('.mc-log');
	if (log) for (const row of [...log.children]) {
		clearTimeout(row._t1);
		clearTimeout(row._t2);
		row.remove();
	}
	primed = false;
	el.querySelector('.mc-min')?.classList.remove('flash');
	wake();   // prime at once: on the slow cadence, the new game's first messages would otherwise be swallowed as backlog
}

export function active() { return !!el; }
