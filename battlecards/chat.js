// chat.js — a shared in-battle chat + emote overlay, used by both the card
// duels (game.js) and the Pokemon battles (overworld/pvp.js), for players and
// spectators alike. Pure DOM overlay so it floats over any canvas. Rooms are
// keyed server-side: 'm:<matchId>' for a match, 'u:<user>' for a solo run.
//
// Messages fade out on their own so they never clutter the board, the log is
// click-through (the game is playable behind it), and the whole thing collapses
// to a small pill you can toggle.
import * as MP from './mpmode.js';

// Hearthstone-style quick emotes; id must be in the server's EMOTES set
export const EMOTES = {
	greetings: { icon: '👋', label: 'Greetings!' },
	well_played: { icon: '👍', label: 'Well played!' },
	thanks: { icon: '🙏', label: 'Thanks!' },
	wow: { icon: '😮', label: 'Wow!' },
	oops: { icon: '😅', label: 'Oops.' },
	threaten: { icon: '😠', label: "You'll pay for that!" },
	laugh: { icon: '😂', label: 'Haha!' },
	gg: { icon: '🎉', label: 'Good game!' },
};
const BAR = ['greetings', 'well_played', 'thanks', 'wow', 'oops', 'threaten', 'gg'];
const FADE_AFTER = 8000, FADE_DUR = 800; // a message lingers 8s, then fades over 0.8s

let el = null, timer = null, room = null, me = null, seen = new Set(), lastTs = 0, poll = 1500;

const STYLE = `
#mp-chat{position:fixed;left:10px;bottom:10px;width:290px;max-width:44vw;z-index:9000;
 font-family:'m6x11plus',monospace,sans-serif;color:#f2f2f6;pointer-events:none;}
#mp-chat *{box-sizing:border-box;}
#mp-chat .mc-log{display:flex;flex-direction:column;gap:3px;margin-bottom:6px;max-height:34vh;
 overflow:hidden;pointer-events:none;}  /* click-through: never blocks the game */
#mp-chat .mc-row{background:rgba(20,16,32,0.72);border:1px solid rgba(120,110,160,0.4);
 border-radius:9px;padding:4px 9px;font-size:13px;line-height:1.25;animation:mcpop .18s ease;
 word-break:break-word;transition:opacity .8s ease;}
#mp-chat .mc-row.mc-fade{opacity:0;}
#mp-chat .mc-row.mine{background:rgba(40,52,80,0.78);}
#mp-chat .mc-row.emote{font-size:15px;}
#mp-chat .mc-who{color:#9fd0ff;font-weight:bold;margin-right:5px;}
#mp-chat .mc-row.mine .mc-who{color:#ffd27a;}
#mp-chat .mc-emoji{font-size:19px;margin-right:5px;vertical-align:-2px;}
#mp-chat .mc-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;pointer-events:auto;}
#mp-chat .mc-min{background:rgba(28,22,42,0.92);border:1px solid rgba(140,120,180,0.6);border-radius:8px;
 color:#cfc6e6;font-size:15px;height:34px;min-width:34px;cursor:pointer;padding:0 8px;line-height:1;flex:none;}
#mp-chat .mc-min:hover{background:rgba(60,50,90,0.95);}
#mp-chat .mc-min.flash{color:#ffd27a;border-color:#ffd27a;}
#mp-chat .mc-em{background:rgba(28,22,42,0.85);border:1px solid rgba(140,120,180,0.5);border-radius:8px;
 font-size:19px;width:36px;height:34px;cursor:pointer;padding:0;line-height:1;}
#mp-chat .mc-em:hover{background:rgba(60,50,90,0.95);}
#mp-chat .mc-input{flex:1;min-width:100px;height:34px;background:rgba(20,16,32,0.85);
 border:1px solid rgba(140,120,180,0.5);border-radius:8px;color:#fff;padding:2px 8px;font:inherit;font-size:13px;}
#mp-chat.min .mc-log{display:none;}
#mp-chat.min .mc-bar > *:not(.mc-min){display:none;}  /* collapsed: just the pill */
@keyframes mcpop{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@media(max-width:640px){#mp-chat{width:210px;}#mp-chat .mc-em{width:32px;height:30px;font-size:17px;}}
`;

function ensureStyle() {
	if (document.getElementById('mp-chat-style')) return;
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
		const key = m.ts + ':' + m.from;
		if (seen.has(key)) continue;
		seen.add(key);
		lastTs = Math.max(lastTs, m.ts);
		added = true;
		const row = document.createElement('div');
		row.className = 'mc-row' + (m.from === me ? ' mine' : '') + (m.emote ? ' emote' : '');
		const who = `<span class="mc-who">${esc(m.from)}</span>`;
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

function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

export function send(text, emote) {
	if (!room) return;
	MP.call('chat-post', { room, text, emote }).catch(() => {});
}

async function tick() {
	if (!room) return;
	try {
		const data = await MP.call('chat-get', { room, since: lastTs });
		if (data && data.messages) render(data.messages);
	} catch (e) {}
}

function setMin(min) {
	el.classList.toggle('min', min);
	const b = el.querySelector('.mc-min');
	b.textContent = min ? '💬' : '▾';
	b.title = min ? 'show chat' : 'minimise chat';
	if (!min) b.classList.remove('flash');
}

// mount the overlay for a room. canPost=false gives a read-only log.
export function mount({ room: r, canPost = true } = {}) {
	if (el) unmount();
	ensureStyle();
	room = r;
	me = MP.cachedState()?.username || null;
	seen = new Set(); lastTs = 0;
	el = document.createElement('div');
	el.id = 'mp-chat';
	el.innerHTML = `<div class="mc-log"></div><div class="mc-bar"><button class="mc-min" title="minimise chat">▾</button></div>`;
	const bar = el.querySelector('.mc-bar');
	if (canPost) {
		for (const id of BAR) {
			const b = document.createElement('button');
			b.className = 'mc-em'; b.textContent = EMOTES[id].icon; b.title = EMOTES[id].label;
			b.addEventListener('click', () => send('', id));
			bar.appendChild(b);
		}
		const input = document.createElement('input');
		input.className = 'mc-input'; input.maxLength = 140; input.placeholder = 'Say something…';
		input.addEventListener('keydown', ev => {
			ev.stopPropagation(); // don't let the game read battle keys while typing
			if (ev.key === 'Enter' && input.value.trim()) { send(input.value.trim()); input.value = ''; }
		});
		bar.appendChild(input);
	}
	el.querySelector('.mc-min').addEventListener('click', () => setMin(!el.classList.contains('min')));
	document.body.appendChild(el);
	tick();
	timer = setInterval(tick, poll);
}

export function unmount() {
	if (timer) clearInterval(timer);
	timer = null;
	if (el && el.parentNode) el.parentNode.removeChild(el);
	el = null; room = null; seen = new Set(); lastTs = 0;
}

export function active() { return !!el; }
