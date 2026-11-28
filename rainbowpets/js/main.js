// Rainbow Pets — the page (game by Daniel Espinoza; the rules are rules.js). Micatro's look: its swirling background,
// font, buttons and sounds. One table renderer, drawn ONLY from a seat's view (rules.js view()), for every mode:
//   normal      : the menu; a match against the computer on this device (Quick Match, the Painter's Path), or an online
//                 match the server plays (server/rpets_pvp.mjs); friends watch it live (publish-rpets)
//   ?spectate=u : read-only, a friend's published view
//   ?replay=<p> : read-only, a finished match re-played from its recipe (save.js packReplay), with clip links (&t=)
// Keyboard, controller and touch: every control is a button on the page; the arrows / stick move a focus ring between
// them (site/input.js + poketactica/js/nav.js spatialNext), Z presses, X steps back, Enter opens the menu, C passes.
import * as R from './rules.js';
import { choose } from './ai.js';
import * as SV from './save.js';
import * as SOLO from './solo.js';
import { petSvg } from './art.js';
import * as Stars from '/site/stars.js';
import { startInput } from '/site/input.js';
import { clipStart, copyClip } from '/site/clip.js';
import { askText } from '/site/osk.js';
import { spatialNext } from '/poketactica/js/nav.js';
import { Background, C as BGC, hex } from '../../micatro/js/ui/gl.js';
import { sound } from '../../micatro/js/ui/sound.js';
import { loadFont } from '../../micatro/js/ui/assets.js';

const params = new URLSearchParams(location.search);
const SPECTATE = (params.get('spectate') || '').trim().toLowerCase();
const REPLAY = params.get('replay') ? SV.unpackReplay(params.get('replay')) : null;
const MODE = params.get('replay') ? 'replay' : SPECTATE ? 'spectate' : 'normal';
export const ONLINE_WIN = 20;   // (stars for winning an online match)
const CPU_STEP_MS = 650;

const app = document.getElementById('app');
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const btn = (label, cls, fn) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', (e) => { sound.play('button'); fn(e); }); return b; };
const CN = R.COLOR_NAME, CH = R.COLOR_HEX;
let net = null;
let bg = null;

// ------------------------------------------------------------------ the state of the page
// M: the match on the table. { kind: 'local' | 'online' | 'replay' | 'spectate', V (the view drawn), seat (mine),
//   S (local / replay: the whole match), setup, actions, mode ('quick' | 'path'), stage, lid (online), n (online) }
let M = null;
let sel = null;          // what the player has picked: { k: 'card', card } | { k: 'pet', uid } | { k: 'throw', from, slot } | { k: 'extra', uid }
let info = null;         // the Pet shown in the side panel
let publisher = null, overShown = false, paid = false;
const feedLines = [];

// ------------------------------------------------------------------ words
const petName = (V, uid) => (V.pets[uid] ? V.pets[uid].name : 'a Pet');
// ("You" only to the one playing: a spectator gets the player's own view, and reads the player's name instead)
const playing = () => !!M && (M.kind === 'local' || M.kind === 'online');
const isYou = (V, s) => playing() && !!s && s === V.me;
const seatName = (V, s) => { const p = V.players.find((x) => x.seat === s); return p ? (isYou(V, p.seat) ? 'You' : p.name) : '?'; };
// (Tag-Team: the seats playing together; a partner's Pets are played as your own)
const sideOfV = (V, s) => (V.teams && V.teams.find((t) => t.includes(s))) || [s];
const isAlly = (V, s) => !!V.me && !!s && sideOfV(V, V.me).includes(s);
const isPartner = (V, s) => !!V.teams && s !== V.me && isAlly(V, s);
const teamName = (V, seats) => seats.map((s) => seatName(V, s)).join(' & ');
const iWon = (V) => R.wonBy(V.over, V.me);
/** Who won, in words (a team's names in Tag-Team). */
const winnerName = (V) => (V.over.winners && V.over.winners.length ? teamName(V, V.over.winners) : seatName(V, V.over.winner));
const winVerb = (V) => (V.over.winners && V.over.winners.length > 1) || isYou(V, V.over.winner) ? 'win' : 'wins';
const whose = (V, uid) => { const o = V.pets[uid] && V.pets[uid].owner; return isYou(V, o) ? 'your' : seatName(V, o) + "'s"; };
function say(V, e) {
	const c = e.c ? CN[e.c] : '';
	switch (e.t) {
		case 'paint': return `${seatName(V, e.seat)} painted ${petName(V, e.uid)} ${c}`;
		case 'move': return `${seatName(V, e.seat)} moved ${petName(V, e.uid)} to the ${CN[e.to]} spot` + (e.covers ? `, covering ${petName(V, e.covers)}` : '');
		case 'throw': return `${petName(V, e.uid)} threw ${c} at ${whose(V, e.to)} ${petName(V, e.to)}`;
		case 'splat': return `Splat! ${petName(V, e.uid)} is ${V.pets[e.uid] ? V.pets[e.uid].shade : ''} now`;
		case 'paper': return `"Not so fast!" ${seatName(V, e.seat)} blocked it with a Newspaper`;
		case 'wipe': return `${petName(V, e.uid)} was wiped out!`;
		case 'shift': return `${petName(V, e.uid)} moved to the ${CN[e.to]} spot`;
		case 'back': return `${petName(V, e.uid)} went back to the Palette`;
		case 'extra': return `${petName(V, e.uid)} came onto the Palette`;
		case 'heal': return `${petName(V, e.uid)} was healed`;
		case 'healall': return `${seatName(V, e.seat)}'s Pets healed`;
		case 'pass': return e.auto ? null : `${seatName(V, e.seat)} passed`;
		case 'turn': return `— ${seatName(V, e.seat) === 'You' ? 'Your' : seatName(V, e.seat) + "'s"} turn (${e.turn}) —`;
		case 'out': return `${seatName(V, e.seat)} ${isYou(V, e.seat) ? 'are' : 'is'} out`;
		case 'concede': return `${seatName(V, e.seat)} left the match`;
		case 'stalemate': return 'The decks are spent: a stalemate';
		case 'over': return e.team && e.team.length ? `${teamName(V, e.team)} win!` : e.seat ? `${seatName(V, e.seat)} ${isYou(V, e.seat) ? 'win' : 'wins'}!` : 'A draw!';
		case 'miss': return 'The throw missed';
		default: return null;
	}
}
const SOUND_OF = { paint: 'cardSlide1', move: 'cardFan2', throw: 'whoosh1', splat: 'chips1', paper: 'paper1', wipe: 'crumple1', shift: 'cardSlide2', back: 'cardSlide2', extra: 'cardSlide1', heal: 'holo1', over: 'win' };
let lastLogN = -1;
/** New lines of the match's log: into the feed, with a sound and a toast for the big ones. */
function playLog(V, quiet) {
	if (lastLogN < 0) { lastLogN = V.n; return; }
	for (const e of V.log) {
		if (e.n <= lastLogN) continue;
		const line = say(V, e); if (line) { feedLines.unshift(line); if (feedLines.length > 40) feedLines.pop(); }
		if (quiet) continue;
		if (SOUND_OF[e.t]) sound.play(SOUND_OF[e.t]);
		if (e.t === 'wipe') toast(`${petName(V, e.uid)} wiped out!`);
		if (e.t === 'paper') toast('Not so fast! 📰');
	}
	lastLogN = V.n;
}
let toastT = null;
function toast(text) {
	let t = document.querySelector('.rp-toast'); if (!t) { t = h('div', 'rp-toast'); document.body.appendChild(t); }
	t.textContent = text; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
}

// ------------------------------------------------------------------ the top row
function top(right = []) {
	const bar = h('div', 'rp-top');
	bar.appendChild(h('div', 'rp-title', '<span class="r1">Rain</span><span class="r2">bow</span> <span class="r4">P</span><span class="r5">e</span><span class="r6">ts</span>'));
	bar.appendChild(h('div', 'rp-wallet', `★ <span class="gold" id="rp-stars">${Stars.stars()}</span>`));
	for (const r of right) bar.appendChild(r);
	return bar;
}
const screen = (title, kids = [], right = []) => {
	app.innerHTML = '';
	app.appendChild(top(right));
	const s = h('div', 'rp-screen');
	if (title) s.appendChild(h('h2', '', title));
	for (const k of kids) if (k) s.appendChild(k);
	app.appendChild(s);
	focusFirst();
	return s;
};

// ------------------------------------------------------------------ menu
function menu() {
	M = null; sel = null; stopPublisher(); stopOnline();
	if (bg) bg.set({ new_colour: hex('3b2d5c'), special_colour: BGC.GOLD, contrast: 1.3 });
	const run = SV.loadRun(), st = SV.stats();
	const m = h('div', 'rp-menu');
	if (run) m.appendChild(btn('▶ Continue<small>your match on this device</small>', 'green b-resume', () => resumeLocal(run)));
	m.appendChild(btn('Quick Match<small>you against 1 to 3 computer painters</small>', 'blue b-quick', () => quickSetup()));
	m.appendChild(btn(`Painter's Path<small>${SV.pathCleared().length} of ${SOLO.PATH.length} cleared</small>`, 'orange b-path', () => pathScreen()));
	m.appendChild(btn(`Play Online<small>${net && net.isLoggedIn() ? '2 to 4 friends, with a code' : 'sign in (the top bar) to play friends'}</small>`, 'red b-online', () => onlineScreen()));
	m.appendChild(btn('Replays<small>your last matches</small>', 'grey b-replays', () => replaysScreen()));
	m.appendChild(btn('How to Play<small>the rules</small>', 'grey b-howto', () => howTo()));
	const credit = h('div', 'rp-credit', `A game by <b>Daniel Espinoza</b>. Every Pet was made by a young artist, named on its card.<br><span class="muted">${st.played} played · ${st.won} won · stars won here go in your star wallet</span>`);
	screen('', [credit, m]);
}

// ------------------------------------------------------------------ how to play
function howTo(back = menu) {
	const d = h('div', 'rp-panel rp-howto', `
		<h3>Goal</h3><p>Put 3 of your Pets on the Canvas at the same time, or wipe out all your Rivals' Pets.</p>
		<h3>Your turn</h3><ul><li>You draw 1 Color Card.</li><li>Then up to 3 actions, each once: <b>Paint</b> 1 of your Pets with a card from your hand, <b>Move</b> 1 of your Pets from your Palette to the Canvas, and let 1 of your Pets <b>Throw</b> a color.</li><li>Your turn ends after all 3, or when you pass (C).</li></ul>
		<h3>Tag-Team (2v2)</h3><p>Two teams of 2. Partners take their turns one after the other and play each other's Pets as their own. Each partner paints 1 and throws 1, but the team moves only 1 Pet a team turn. 3 of the team's Pets on the Canvas wins.</p>
		<h3>Colors</h3><ul><li>A Pet's <b>true color</b> is the mix of its 2 color symbols: red + yellow = orange, yellow + blue = green, red + blue = purple. Colors two steps apart on the wheel make the one between (orange + green = yellow).</li><li>A Pet can move to the Canvas spot of its true color, covering whoever is there.</li><li><b>Opposite Colors</b> (red-green, orange-blue, yellow-purple, white-black) on one Pet wipe it out.</li></ul>
		<h3>Throwing</h3><ul><li>A Pet with a Color Card on it can throw the top card at another Pet. From your Palette it can only reach the Canvas or your own Palette; from the Canvas, any Pet.</li><li>A Pet on the Canvas whose color changes moves to its new color's spot, or back to its Palette.</li><li>A <b>Newspaper</b> 📰 blocks a throw at any Pet, on anyone's turn.</li></ul>
		<h3>Controls</h3><p>Tap or click. Keyboard: arrows move, Z picks, X steps back, C passes, V reads a Pet, Enter is the menu. A controller works the same way.</p>
		<p class="muted">Where the rulebook is silent this game chooses: colors next to each other on the wheel (or with white or black) make no Canvas color; a full Palette is covered from the left; the deck is 4 of each rainbow color, 2 white, 2 black, 2 Newspapers; when every deck is empty the match ends after 10 more rounds (most Pets on the Canvas wins). Pet Powers (the full game) are not played yet.</p>`);
	screen('How to Play', [d, btn('Back', 'grey b-back', back)]);
}

// ------------------------------------------------------------------ choosing a team
/** The team picker: 3 to 5 Pets (the first 3 start on the Palette). go(team) when ready. */
function teamPicker(title, go, { back = menu, extra = null, startLabel = 'Start' } = {}) {
	let team = SV.lastTeam().filter((id) => R.petById(id));
	const grid = h('div', 'rp-picker'), count = h('div', 'rp-banner');
	const draw = () => {
		grid.innerHTML = '';
		for (const p of R.PETS) {
			const k = team.indexOf(p.id), m = R.mix(p.c[0], p.c[1]);
			const b = petCard({ uid: p.id, id: p.id, name: p.name, by: p.by, colors: p.c.slice(), stacks: [0, 0], color: m.c, hue: m.hex, shade: m.name }, 'sm rp-nav rp-pick' + (k >= 0 ? ' is-sel' : ''), () => {
				team = k >= 0 ? team.filter((x) => x !== p.id) : team.length < R.TEAM_MAX ? [...team, p.id] : team;
				draw();
			});
			if (k >= 0) b.appendChild(h('span', 'rp-order', String(k + 1)));
			grid.appendChild(b);
		}
		count.textContent = `${team.length} picked · ${R.TEAM_MIN} to ${R.TEAM_MAX}: the first 3 start on your Palette, the rest wait as Extra Pets`;
		startB.disabled = team.length < R.TEAM_MIN;
	};
	const startB = btn(startLabel, 'green b-start', () => { if (team.length < R.TEAM_MIN) return; SV.saveTeam(team); go(team); });
	const row = h('div', 'rp-row');
	row.append(btn('Random', 'orange b-random', () => { const pool = R.PETS.map((p) => p.id); team = []; while (team.length < 4) { const x = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; team.push(x); } draw(); }), btn('Back', 'grey b-back', back), startB);
	screen(title, [extra, count, row, grid]);
	draw();
}

// ------------------------------------------------------------------ Quick Match
const quick = { rivals: 1, level: 'normal', opts: {} };   // (rivals: 1 to 3, or 'tag': you and a computer partner against 2)
function optionsBox(o) {
	const box = h('div', 'rp-row rp-chooser');
	for (const k of R.OPTION_KEYS) {
		const b = btn(`<span class="rp-opt">${esc(R.OPTIONS[k].name)}<small>${esc(R.OPTIONS[k].say)}</small></span>`, 'grey small b-opt-' + k + (o[k] ? ' on' : ''), () => { o[k] = !o[k]; b.classList.toggle('on', !!o[k]); });
		box.appendChild(b);
	}
	return box;
}
function quickSetup() {
	const box = h('div', 'rp-panel');
	const rivals = h('div', 'rp-row rp-chooser'), lv = h('div', 'rp-row rp-chooser');
	const pick = (row, vals, cur, set, label) => { row.innerHTML = ''; row.appendChild(h('span', '', label)); for (const [v, t] of vals) { const b = btn(t, 'grey small' + (cur() === v ? ' on' : ''), () => { set(v); pick(row, vals, cur, set, label); }); row.appendChild(b); } };
	pick(rivals, [[1, '1 Rival'], [2, '2 Rivals'], [3, '3 Rivals'], ['tag', 'Tag-Team 2v2']], () => quick.rivals, (v) => { quick.rivals = v; }, 'Against: ');
	pick(lv, [['easy', 'Easy'], ['normal', 'Normal']], () => quick.level, (v) => { quick.level = v; }, 'Computer: ');
	box.append(rivals, lv, h('div', 'muted', 'Optional rules (from the rulebook):'), optionsBox(quick.opts));
	teamPicker('Quick Match', (team) => {
		const names = SOLO.COMPUTER_NAMES.slice(), used = new Set(team), seats = [{ name: myName(), pets: team }];
		const tag = quick.rivals === 'tag';
		for (let i = 0; i < (tag ? 3 : quick.rivals); i++) seats.push({ name: names[i], pets: randomTeam(used), cpu: quick.level });
		startLocal({ seed: 'q' + Date.now().toString(36), seats, opts: { ...quick.opts }, ...(tag ? { tagTeam: true } : {}) }, { mode: 'quick' });
	}, { extra: box });
}
function randomTeam(used, n = 4) {
	const pool = R.PETS.map((p) => p.id).filter((x) => !used.has(x)), out = [];
	while (out.length < n && pool.length) { const x = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; out.push(x); used.add(x); }
	return out;
}
const myName = () => (net && net.myName && net.myName()) || 'You';

// ------------------------------------------------------------------ the Painter's Path
function pathScreen() {
	const cleared = SV.pathCleared(), list = h('div', 'rp-path');
	SOLO.PATH.forEach((s, i) => {
		const open = SOLO.stageOpen(s.id, cleared), done = cleared.includes(s.id);
		const b = btn(`<span class="rp-stage-n">${i + 1}</span><span style="flex:1">${esc(s.name)}<small>${esc(s.say)} · ${s.foes.map((f) => esc(f.name) + (f.cpu === 'easy' ? ' (easy)' : '')).join(', ')}</small></span><span class="gold">${done ? '✓ ' + SOLO.PATH_REPEAT : s.stars} ★</span>`, (done ? 'green' : open ? 'blue' : 'grey') + ' rp-stage b-stage-' + s.id, () => {
			if (!open) { toast('Win the match before it first'); return; }
			teamPicker(s.name, (team) => startLocal({ seed: 'path-' + s.id + '-' + Date.now().toString(36), seats: [{ name: myName(), pets: team }, ...s.foes.map((f) => ({ name: f.name, pets: f.pets.slice(), cpu: f.cpu }))], opts: { ...s.opts } }, { mode: 'path', stage: s.id }), { back: pathScreen, extra: h('div', 'rp-banner', esc(s.say)) });
		});
		b.disabled = !open;
		list.appendChild(b);
	});
	screen("Painter's Path", [h('div', 'rp-credit', 'Eight matches against named painters. A first win pays the stage\'s stars; a win after that pays ' + SOLO.PATH_REPEAT + '.'), list, btn('Back', 'grey b-back', menu)]);
}

// ------------------------------------------------------------------ a match on this device
function startLocal(setup, more) {
	const S = R.newMatch(setup);
	if (!S) { toast('That match could not be set up'); return; }
	M = { kind: 'local', S, setup, actions: [], seat: 'a', mode: more.mode, stage: more.stage || null };
	lastLogN = -1; feedLines.length = 0; overShown = false; paid = false;
	SV.saveRun({ setup, actions: [], mode: M.mode, stage: M.stage });
	refresh();
	startBroadcast();
	cpuSoon();
}
function resumeLocal(run) {
	const S = R.replay({ setup: run.setup, actions: run.actions });
	if (!S || S.over) { SV.clearRun(); menu(); return; }
	M = { kind: 'local', S, setup: run.setup, actions: run.actions.slice(), seat: 'a', mode: run.mode || 'quick', stage: run.stage || null };
	lastLogN = -1; feedLines.length = 0; overShown = false; paid = false;
	refresh(true);
	startBroadcast();
	cpuSoon();
}
let cpuTimer = null;
function cpuSoon() {
	clearTimeout(cpuTimer);
	if (!M || M.kind !== 'local' || M.S.over) return;
	const seat = R.toAct(M.S), P = seat && R.playerOf(M.S, seat);
	if (!P || !P.cpu) return;
	cpuTimer = setTimeout(() => {
		if (!M || M.kind !== 'local') return;
		const s2 = R.toAct(M.S), Q = s2 && R.playerOf(M.S, s2);
		if (!Q || !Q.cpu) return;
		const a = choose(M.S, s2, Q.cpu) || (M.S.pending ? { t: 'let' } : { t: 'pass' });
		localAct(s2, a);
	}, CPU_STEP_MS);
}
function localAct(seat, a) {
	const why = R.act(M.S, seat, a);
	if (why) return why;
	M.actions.push([seat, a]);
	if (!M.S.over) SV.saveRun({ setup: M.setup, actions: M.actions, mode: M.mode, stage: M.stage });
	refresh();
	cpuSoon();
	return null;
}

// ------------------------------------------------------------------ an action from the player
async function doAct(a) {
	if (!M || (M.kind !== 'local' && M.kind !== 'online')) return;
	sel = null;
	const why = M.kind === 'local' ? localAct(M.seat, a) : await onlineAct(a);
	if (why) { toast(why[0].toUpperCase() + why.slice(1)); sound.play('cancel'); refresh(); }
}

// ------------------------------------------------------------------ drawing the table
const V_ = () => (M ? (M.kind === 'local' || M.kind === 'replay' ? R.view(M.S, M.kind === 'replay' ? null : M.seat) : M.V) : null);
/** What may be done now, read from the view (rules.js fromView): an online page has only its view. */
const legalNow = (V) => (V && V.me && !V.over ? R.legal(R.fromView(V), V.me) : []);
function petCard(pv, cls, onClick) {
	const b = h('button', 'rp-pet ' + (cls || ''));
	b.type = 'button';
	b.dataset.uid = pv.uid;
	b.style.setProperty('--hue', pv.hue || '#999');
	const syms = h('div', 'rp-syms');
	for (const k of [0, 1]) {
		const s = h('span', 'rp-sym', pv.stacks[k] ? `<span class="n">${pv.stacks[k]}</span>` : '');
		s.style.background = CH[pv.colors[k]];
		s.dataset.slot = k; s.dataset.sym = pv.uid + ':' + k;
		syms.appendChild(s);
	}
	b.appendChild(syms);
	b.appendChild(h('div', 'rp-art', petSvg(R.petById(pv.id) ? R.petById(pv.id).n : 0, pv.hue)));
	b.appendChild(h('div', 'rp-tc', esc(pv.shade || '')));
	b.appendChild(h('div', 'rp-name', esc(pv.name)));
	b.appendChild(h('div', 'rp-by', 'by ' + esc(pv.by)));
	b.title = `${pv.name} by ${pv.by}: ${pv.shade}`;
	if (onClick) b.addEventListener('click', (e) => { sound.play('button'); onClick(e); });
	return b;
}
function refresh(instant) {
	const V = V_();
	if (!V) return;
	playLog(V, instant);
	render(V);
	afterChange(V);
}
function render(V) {
	app.innerHTML = '';
	const right = [];
	if (M.kind === 'local' || M.kind === 'online') right.push(btn('Menu <span class="bal-key">⏎</span>', 'grey small b-menu', () => fieldMenu()));
	if (M.kind === 'spectate' || M.kind === 'replay') right.push(btn('Main menu', 'grey small b-home', () => { location.href = '/rainbowpets/'; }));
	app.appendChild(top(right));
	if (M.kind === 'spectate') app.appendChild(h('div', 'rp-banner', `Watching <b>${esc(SPECTATE)}</b>` + (specStatus ? ' · ' + esc(specStatus) : '')));
	const legal = M.kind === 'local' || M.kind === 'online' ? legalNow(V) : [];
	const can = (pred) => legal.some(pred);
	if (V.teams) app.appendChild(h('div', 'rp-banner rp-teams', 'Tag-Team · ' + V.teams.map((t) => `<b>${esc(teamName(V, t))}</b> ${V.players.find((p) => p.seat === t[0]).sideOnCanvas}/3`).join(' vs ')));
	const T = h('div', 'rp-table');
	// rivals (and a Tag-Team partner, first)
	const rivals = h('div', 'rp-rivals');
	const others = V.players.filter((P) => P.seat !== V.me || !V.me).sort((x, y) => (isPartner(V, y.seat) ? 1 : 0) - (isPartner(V, x.seat) ? 1 : 0));
	for (const P of others) rivals.appendChild(board(V, P, legal, true));
	T.appendChild(rivals);
	// the Canvas
	const cw = h('div', 'rp-canvas-wrap'), cv = h('div', 'rp-canvas');
	cv.appendChild(h('div', 'rp-wheel'));
	R.WHEEL.forEach((c, i) => {
		const ang = (-90 + i * 60) * Math.PI / 180, x = 50 + Math.cos(ang) * 34, y = 50 + Math.sin(ang) * 34;   // (radius 34%: six spots 24% wide fit inside the square)
		const spot = h('div', 'rp-cspot');
		spot.style.left = x + '%'; spot.style.top = y + '%'; spot.style.setProperty('--spot', CH[c]);
		spot.dataset.spot = c;
		const stack = V.canvas[c], topUid = stack[stack.length - 1];
		if (topUid) spot.appendChild(petNode(V, topUid, legal, 'sm'));
		if (stack.length > 1) spot.appendChild(h('span', 'rp-under', '+' + (stack.length - 1) + ' under'));
		spot.appendChild(h('span', 'rp-cspot-lbl', CN[c]));
		cv.appendChild(spot);
	});
	const mid = h('div', 'rp-canvas-mid', V.over ? '' : `Turn ${V.turn}<br>${isYou(V, V.cur) ? 'Your' : esc(seatName(V, V.cur)) + "'s"} turn`);
	cv.appendChild(mid);
	cw.appendChild(cv);
	T.appendChild(cw);
	// side: info + feed
	const side = h('div', 'rp-side');
	side.appendChild(h('div', 'rp-panel rp-info', infoHtml(V)));
	const feed = h('div', 'rp-panel rp-feed'); for (const l of feedLines.slice(0, 14)) feed.appendChild(h('div', '', esc(l)));
	side.appendChild(feed);
	T.appendChild(side);
	// me
	const meBox = h('div', 'rp-me');
	const mine = V.players.find((p) => p.seat === V.me);
	if (mine) meBox.appendChild(board(V, mine, legal, false));
	if (mine && mine.hand) {
		const hand = h('div', 'rp-hand');
		for (const c of mine.hand) {
			const b = h('button', 'rp-card rp-nav' + (c.c === 'N' ? ' news' : '') + (sel && sel.k === 'card' && sel.card === c.id ? ' is-sel' : ''), c.c === 'N' ? 'News' : CN[c.c]);
			b.type = 'button'; b.dataset.card = c.id; b.style.setProperty('--c', CH[c.c] || '#999');
			if (c.c === 'W') b.style.color = '#2a2530';
			b.addEventListener('click', () => { sound.play('cardSlide1'); sel = sel && sel.card === c.id ? null : { k: 'card', card: c.id }; render(V); focusEl(`.rp-card[data-card="${c.id}"]`); });
			hand.appendChild(b);
		}
		meBox.appendChild(hand);
	}
	// the bar: what is used, what the selection can do, pass
	const bar = h('div', 'rp-bar');
	if (M.kind === 'local' || M.kind === 'online') {
		const myTurn = V.cur === V.me && !V.pending && !V.over;
		for (const k of R.ACTIONS) bar.appendChild(h('span', 'rp-act' + (V.used[k] ? ' used' : ''), { paint: '🖌 Paint', move: '➜ Move', throw: '💦 Throw' }[k]));
		if (sel && sel.k === 'pet' && can((a) => a.t === 'move' && a.pet === sel.uid)) bar.appendChild(btn('Move to the Canvas', 'green b-move', () => doAct({ t: 'move', pet: sel.uid })));
		if (sel) bar.appendChild(btn('Cancel <span class="bal-key">X</span>', 'grey small b-cancel', () => { sel = null; render(V); }));
		const pb = btn('Pass <span class="bal-key">C</span>', 'red b-pass', () => doAct({ t: 'pass' }));
		pb.disabled = !myTurn;
		bar.appendChild(pb);
	}
	meBox.appendChild(bar);
	meBox.appendChild(h('div', 'rp-hint', esc(hint(V, legal))));
	T.appendChild(meBox);
	app.appendChild(T);
	if (M.kind === 'replay') app.appendChild(replayBar());
	if (bg) bg.set(V.over ? { new_colour: iWon(V) ? BGC.GOLD : hex('3a2430'), special_colour: BGC.GREEN, contrast: 1.8 } : V.cur === V.me ? { new_colour: hex('3b2d5c'), special_colour: BGC.GREEN, contrast: 1.4 } : { new_colour: hex('2c2a45'), special_colour: BGC.BLUE, contrast: 1.1 });
	restoreFocus();
}
function board(V, P, legal, small) {
	const b = h('div', 'rp-panel rp-board' + (V.cur === P.seat && !V.over ? ' is-turn' : '') + (P.out ? ' is-out' : '') + (isPartner(V, P.seat) ? ' is-partner' : ''));
	b.dataset.seat = P.seat;
	const head = h('div', 'rp-board-head', `<b>${esc(isYou(V, P.seat) ? 'You' : P.name)}</b>${isPartner(V, P.seat) ? ' <span class="rp-tag">your partner</span>' : ''}${P.cpu ? ' <span class="muted">(computer' + (P.cpu === 'easy' ? ', easy' : '') + ')</span>' : ''}`);
	head.appendChild(h('span', 'rp-counts', `🖼 ${V.teams ? P.onCanvas + ' (team ' + P.sideOnCanvas + '/3)' : P.onCanvas + '/3'} · 🂠 ${P.deck} · ✋ ${P.handN} · 🗑 ${P.scrap.length}${P.out ? ' · OUT' : ''}`));
	b.appendChild(head);
	if (!small || true) {
		const pal = h('div', 'rp-palette');
		P.palette.forEach((st, i) => {
			const box = h('div', 'rp-spotbox');
			if (st.length) { box.appendChild(petNode(V, st[st.length - 1], legal, small ? 'sm' : '')); if (st.length > 1) box.appendChild(h('span', 'rp-under', '+' + (st.length - 1))); }
			else {
				const target = sel && sel.k === 'extra' && legal.some((a) => a.t === 'extra' && a.pet === sel.uid && a.spot === i);
				const o = h('button', 'rp-open' + (target ? ' is-target rp-nav' : ''), target ? 'Put it here' : 'open');
				o.type = 'button'; o.dataset.spot = i;
				if (small) o.style.setProperty('--cw', '74px');
				if (target) o.addEventListener('click', () => doAct({ t: 'extra', pet: sel.uid, spot: i }));
				box.appendChild(o);
			}
			pal.appendChild(box);
		});
		b.appendChild(pal);
	}
	if (P.extra.length || P.wiped.length) {
		const ex = h('div', 'rp-extras', '<span class="muted">Extra:</span>');
		for (const u of P.extra) ex.appendChild(chip(V, u, legal, false));
		if (P.wiped.length) ex.appendChild(h('span', 'muted', ' Wiped out:'));
		for (const u of P.wiped) ex.appendChild(chip(V, u, legal, true));
		b.appendChild(ex);
	}
	return b;
}
function chip(V, u, legal, wiped) {
	const pv = V.pets[u], mine = isAlly(V, pv.owner);
	const healCard = sel && sel.k === 'card' && legal.find((a) => a.t === 'heal' && a.pet === u && a.card === sel.card);
	const c = h('button', 'rp-chip rp-nav' + (wiped ? ' wiped' : '') + (sel && sel.k === 'extra' && sel.uid === u ? ' is-sel' : '') + (healCard ? ' is-target' : ''), petSvg(R.petById(pv.id).n, pv.hue, { wiped, size: 26 }) + esc(pv.name));
	c.type = 'button'; c.dataset.uid = u;
	c.addEventListener('click', () => {
		sound.play('button');
		info = u;
		if (healCard) { doAct(healCard); return; }
		if (mine && !wiped && legal.some((a) => a.t === 'extra' && a.pet === u)) { sel = sel && sel.uid === u ? null : { k: 'extra', uid: u }; }
		render(V);
	});
	return c;
}
/** A Pet on the table: a card whose symbols are buttons when they can be painted, thrown from or thrown at. */
function petNode(V, uid, legal, size) {
	const pv = V.pets[uid], mine = isAlly(V, pv.owner);
	const card = petCard(pv, (size || '') + ' rp-nav' + (mine ? ' is-mine' : '') + (sel && (sel.uid === uid || sel.from === uid) ? ' is-sel' : ''), null);
	const paintTo = (k) => sel && sel.k === 'card' && legal.find((a) => a.t === 'paint' && a.pet === uid && a.slot === k && a.card === sel.card);
	const throwTo = (k) => sel && sel.k === 'throw' && legal.find((a) => a.t === 'throw' && a.from === sel.from && a.slot === sel.slot && a.to === uid && a.toSlot === k);
	const throwFrom = (k) => mine && legal.some((a) => a.t === 'throw' && a.from === uid && a.slot === k);
	let target = false;
	card.querySelectorAll('.rp-sym').forEach((s) => {
		const k = +s.dataset.slot;
		if (paintTo(k) || throwTo(k)) { s.classList.add('is-target'); target = true; }
		else if (throwFrom(k) && !(sel && sel.k === 'card')) s.classList.add('is-src');
		if (sel && sel.k === 'throw' && sel.from === uid && sel.slot === k) s.classList.add('is-src');
	});
	if (target) card.classList.add('is-target');
	card.addEventListener('click', (e) => {
		info = uid;
		const symEl = e.target.closest('.rp-sym');
		let k = symEl ? +symEl.dataset.slot : null;
		// a click on the card (not a symbol): the only symbol that would do something, if just one would
		if (k == null) { const ks = [0, 1].filter((j) => paintTo(j) || throwTo(j)); if (ks.length === 1) k = ks[0]; else if (ks.length === 2) k = null; }
		const p = k != null && paintTo(k), t = k != null && throwTo(k);
		if (p) { sound.play('cardSlide1'); doAct(p); return; }
		if (t) { sound.play('whoosh1'); doAct(t); return; }
		if (symEl && throwFrom(k)) { sel = { k: 'throw', from: uid, slot: k }; sound.play('button'); render(V); return; }
		if (mine && !(sel && (sel.k === 'card' || sel.k === 'throw'))) { sel = sel && sel.k === 'pet' && sel.uid === uid ? null : { k: 'pet', uid }; render(V); return; }
		render(V);
	});
	return card;
}
function infoHtml(V) {
	const u = info && V.pets[info] ? info : sel && (sel.uid || sel.from);
	if (!u || !V.pets[u]) return `<h4>Your move</h4><div class="muted">${V.me ? 'Pick a card from your hand, or one of your Pets.' : 'Watching.'}</div>`;
	const p = V.pets[u], d = R.petById(p.id);
	return `<h4>${esc(p.name)}</h4><div class="muted">by ${esc(p.by)} · ${esc(seatName(V, p.owner))}</div>
		<div>Printed: ${d.c.map((c) => CN[c]).join(' + ')}</div><div>Now: ${p.colors.map((c) => CN[c]).join(' + ')} = <b style="color:${esc(p.hue)}">${esc(p.shade)}</b></div>
		<div class="muted">${p.color ? 'It can go to the ' + CN[p.color] + ' spot.' : 'No Canvas spot is that color.'}</div>${d.blurb ? '<div class="muted">' + esc(d.blurb) + '</div>' : ''}`;
}
function hint(V, legal) {
	if (V.over) return V.over.winner ? (iWon(V) && playing() ? 'You win!' : winnerName(V) + ' ' + winVerb(V) + '.') : 'A draw.';
	if (M.kind === 'replay' || M.kind === 'spectate') return '';
	if (V.pending) return V.pending.ask === V.me ? 'A throw is coming: use a Newspaper?' : `Waiting: ${seatName(V, V.pending.ask)} may block a throw`;
	if (V.cur !== V.me) return isPartner(V, V.cur) ? `Your partner ${seatName(V, V.cur)} is playing…` : `${seatName(V, V.cur)} is playing…`;
	if (sel && sel.k === 'card') return legal.some((a) => (a.t === 'paint' || a.t === 'heal') && a.card === sel.card) ? 'Now pick a color symbol on 1 of your Pets (green rings).' : 'That card cannot be painted now.';
	if (sel && sel.k === 'throw') return 'Throw it at which symbol? (green rings)';
	if (sel && sel.k === 'extra') return 'Put it on an open Palette spot.';
	if (sel && sel.k === 'pet') return legal.some((a) => a.t === 'move' && a.pet === sel.uid) ? 'Move it to the Canvas, or pick a yellow-ringed symbol to throw from.' : 'A yellow-ringed symbol can throw its color.';
	return 'Pick a card to paint with, a Pet to move, or a yellow-ringed symbol to throw. C passes.';
}
/** After the view changed: the Newspaper question, the end, stars, the replay, the live push. */
function afterChange(V) {
	if (publisher && publisher.touch) publisher.touch();
	if (V.pending && V.pending.ask === V.me && (M.kind === 'local' || M.kind === 'online')) newspaperAsk(V);
	if (V.over && !overShown && M.kind !== 'replay') { overShown = true; setTimeout(() => endScreen(V), 900); }
}
function newspaperAsk(V) {
	if (document.querySelector('.rp-modal-bg')) return;
	const me = V.players.find((p) => p.seat === V.me), news = me && me.hand && me.hand.find((c) => c.c === 'N');
	const pd = V.pending, tgt = V.pets[pd.to];
	const bgEl = h('div', 'rp-modal-bg'), m = h('div', 'rp-panel rp-modal');
	m.append(h('h3', '', 'A throw is coming!'), h('div', '', `${esc(seatName(V, pd.by))} threw <b style="color:${CH[pd.c]}">${CN[pd.c]}</b> at ${esc(whose(V, pd.to))} ${esc(tgt ? tgt.name : 'Pet')}.`));
	const row = h('div', 'rp-row');
	if (news) row.appendChild(btn('Not so fast! 📰', 'red big b-paper', () => { bgEl.remove(); doAct({ t: 'paper', card: news.id }); }));
	row.appendChild(btn('Let it land', 'grey b-let', () => { bgEl.remove(); doAct({ t: 'let' }); }));
	m.appendChild(row); bgEl.appendChild(m); document.body.appendChild(bgEl);
	focusFirst(bgEl);
}

// ------------------------------------------------------------------ the end
function endScreen(V) {
	const won = iWon(V);
	let earned = 0;
	if (!paid && (M.kind === 'local' || M.kind === 'online')) {
		paid = true;
		SV.recordMatch(won);
		if (won) {
			if (M.kind === 'online') earned = ONLINE_WIN;
			else { const st = M.stage && SOLO.stageById(M.stage), cleared = SV.pathCleared(); earned = SOLO.winStars(M.mode, M.setup.seats.filter((s, i) => s.cpu && !isAlly(V, R.SEATS[i])).map((s) => s.cpu), st, cleared); if (st) SV.markCleared(st.id); }   // (the Rivals' levels: a Tag-Team partner adds nothing)
			bankStars(earned);
		}
		if (M.kind === 'local') SV.clearRun();
	}
	const recipe = M.kind === 'local' ? { setup: M.setup, actions: M.actions } : M.recipe || null;
	const param = recipe ? SV.packReplay(recipe) : M.kind === 'spectate' ? M.replay || null : null;
	if (param && (M.kind === 'local' || M.kind === 'online')) SV.addReplay({ p: param, won, how: V.over.how, players: V.players.map((p) => p.name), turns: V.turn });
	if (publisher) { const p = publisher; publisher = null; if (p.endRun) p.endRun(); setTimeout(() => p.finish({ won, replay: param }).catch(() => {}), 1200); }
	const how = { canvas: '3 Pets on the Canvas', wipe: V.teams ? 'every Rival Pet wiped out' : 'every Rival wiped out', deck: 'a Rival ran out of cards', stalemate: 'a stalemate', concede: 'a Rival left' }[V.over.how] || V.over.how;
	const bgEl = h('div', 'rp-modal-bg'), m = h('div', 'rp-panel rp-modal');
	m.append(h('h3', '', V.over.winner ? (won && playing() ? (V.teams ? 'You and ' + esc(teamName(V, V.over.winners.filter((s) => s !== V.me))) + ' win!' : 'You win!') : esc(winnerName(V)) + ' ' + winVerb(V)) : 'A draw'), h('div', 'muted', esc(how) + ` · turn ${V.turn}`));
	if (earned) m.appendChild(h('div', 'gold', `+${earned} ★ · ${Stars.stars()} in your star wallet`));
	const row = h('div', 'rp-row');
	if (param) row.appendChild(btn('Watch the replay', 'blue b-watch', () => { location.href = SV.replayUrl(param); }));
	if (M.kind === 'spectate') { /* (a watcher: the replay, or the menu) */ }
	else if (M.kind === 'online') row.appendChild(btn('Back to the lobby', 'green b-lobby', () => { bgEl.remove(); lobbyScreen(); }));
	else if (M.mode === 'path') row.appendChild(btn("Painter's Path", 'green b-again', () => { bgEl.remove(); pathScreen(); }));
	else row.appendChild(btn('Play again', 'green b-again', () => { bgEl.remove(); quickSetup(); }));
	row.appendChild(btn('Main menu', 'grey b-menu-end', () => { bgEl.remove(); menu(); }));
	m.appendChild(row); bgEl.appendChild(m); document.body.appendChild(bgEl);
	sound.play(won && playing() ? 'win' : 'crumpleLong1');
	focusFirst(bgEl);
}
function bankStars(n) {
	if (!n) return;
	Stars.earn(n);
	if (net && net.isLoggedIn && net.isLoggedIn()) Stars.sync((a, b) => net.call(a, b)).catch(() => {});
	const w = document.getElementById('rp-stars'); if (w) w.textContent = Stars.stars();
}

// ------------------------------------------------------------------ the field menu
function fieldMenu() {
	if (document.querySelector('.rp-modal-bg')) return;
	const bgEl = h('div', 'rp-modal-bg'), m = h('div', 'rp-panel rp-modal');
	m.appendChild(h('h3', '', 'Menu'));
	const row = h('div', 'rp-row');
	row.append(btn('Resume', 'green b-resume-m', () => bgEl.remove()), btn('How to play', 'grey b-howto-m', () => { bgEl.remove(); const back = () => refresh(true); howTo(back); }),
		btn(M && M.kind === 'online' ? 'Leave the match' : 'Give up', 'red b-giveup', () => { bgEl.remove(); giveUp(); }), btn('Main menu', 'grey b-menu-m', () => { bgEl.remove(); if (M && M.kind === 'local' && !M.S.over) toast('Your match waits under Continue'); menu(); }));
	m.appendChild(row); bgEl.appendChild(m); document.body.appendChild(bgEl);
	bgEl.addEventListener('click', (e) => { if (e.target === bgEl) bgEl.remove(); });
	focusFirst(bgEl);
}
function giveUp() {
	if (!M) return;
	if (M.kind === 'local') { if (!M.S.over) localAct(M.seat, { t: 'concede' }); }
	else if (M.kind === 'online') { net.call('rpvp-leave', { pv: RPVP, id: M.lid }).catch(() => {}); }
}

// ------------------------------------------------------------------ live: friends watch (publish-rpets) and bets
function startBroadcast() {
	stopPublisher();
	if (MODE !== 'normal' || !net || !net.isLoggedIn()) return;
	// (the end is HELD when it happens: its last push goes out after the player may be on the menu or in a new match,
	// so it must not read the table then; Pair of Pears learned this the hard way)
	let ended = null;
	const live = () => (M && (M.kind === 'local' || M.kind === 'online') ? V_() : null);
	const view = () => (ended ? ended.view : live());
	const label = () => { if (ended) return ended.label; const V = view(); if (!V) return 'Rainbow Pets'; if (V.over) return V.over.winner ? (V.over.winners && V.over.winners.length ? V.over.winners.map((s) => V.players.find((p) => p.seat === s).name).join(' & ') : seatName(V, V.over.winner)) + ' won' : 'A draw';
		if (V.teams) return `Turn ${V.turn} · ` + V.teams.map((t) => t.map((s) => V.players.find((p) => p.seat === s).name).join(' & ') + ` ${V.players.find((p) => p.seat === t[0]).sideOnCanvas}/3`).join(' · ');
		return `Turn ${V.turn} · ` + V.players.filter((p) => !p.out).map((p) => `${p.name} ${p.onCanvas}/3`).join(' · '); };
	// (spectator bets, server/bets.mjs MARK.rpets: the match is its seed; betting closes at turn 4; my win wins)
	const bet = () => { if (ended) return ended.bet; const V = view(); if (!V) return null; return { run: String(V.seed), prog: V.turn, res: V.over ? (iWon(V) ? 'win' : V.over.winner ? 'lose' : 'draw') : null }; };
	publisher = net.startPublisher(view, label, { bet });
	publisher.endRun = () => { const V = live(); if (ended || !V) return; const lb = label(); ended = { view: JSON.parse(JSON.stringify(V)), label: lb, bet: { run: String(V.seed), prog: V.turn, res: V.over && V.over.winner ? (iWon(V) ? 'win' : 'lose') : 'draw' } }; };
}
function stopPublisher() { if (publisher) { try { publisher.stop(); } catch (e) { /* gone */ } publisher = null; } }

// ------------------------------------------------------------------ online (server/rpets_pvp.mjs)
const RPVP = 1;   // (server/rpets_pvp.mjs RPVP_PROTOCOL)
let lobby = null, pollT = null;
function stopOnline() { clearTimeout(pollT); pollT = null; }
async function onlineScreen() {
	if (!net || !net.isLoggedIn()) { screen('Play Online', [h('div', 'rp-credit', 'Sign in with the top bar to play friends online. Each player brings 3 to 5 Pets; the server deals, keeps everyone\'s hand secret, and plays any computer seats.'), btn('Back', 'grey b-back', menu)]); return; }
	const r = await net.call('rpvp-mine', { pv: RPVP }).catch(() => ({}));
	if (r && r.lobby) { lobby = r.lobby; lobbyScreen(); return; }
	const o = { size: 2, cpus: 0, level: 'normal', opts: {}, tag: false, split: 'together' };
	const box = h('div', 'rp-panel');
	const sizeRow = h('div', 'rp-row rp-chooser'), cpuRow = h('div', 'rp-row rp-chooser');
	const draw = () => {
		sizeRow.innerHTML = '<span>Players: </span>'; cpuRow.innerHTML = '<span>Computer seats: </span>';
		for (const n of [2, 3, 4]) sizeRow.appendChild(btn(n + '', 'grey small b-size-' + n + (o.size === n && !o.tag ? ' on' : ''), () => { o.size = n; o.tag = false; o.cpus = Math.min(o.cpus, n - 1); draw(); }));
		sizeRow.appendChild(btn('Tag-Team 2v2', 'grey small b-tag' + (o.tag ? ' on' : ''), () => { o.tag = true; o.size = 4; draw(); }));
		if (o.tag) for (const [v, t] of [['together', 'Friends together'], ['apart', 'Friends against each other']]) sizeRow.appendChild(btn(t, 'grey small b-split-' + v + (o.split === v ? ' on' : ''), () => { o.split = v; draw(); }));
		for (let n = 0; n < o.size; n++) cpuRow.appendChild(btn(n + '', 'grey small b-cpus-' + n + (o.cpus === n ? ' on' : ''), () => { o.cpus = n; draw(); }));
	};
	draw();
	box.append(sizeRow, cpuRow, h('div', 'muted', 'Optional rules:'), optionsBox(o.opts));
	const row = h('div', 'rp-row');
	row.append(btn('Make a match', 'green b-create', () => teamPicker('Your team', async (team) => {
		const res = await net.call('rpvp-create', { pv: RPVP, size: o.size, cpus: o.cpus, level: o.level, opts: o.opts, team, ...(o.tag ? { tag: true, split: o.split } : {}) }).catch((e) => ({ error: String(e && e.message || e) }));
		if (res.error) { toast(res.error); onlineScreen(); return; }
		lobby = res.lobby; lobbyScreen();
	}, { back: onlineScreen, startLabel: 'Make the match' })),
	btn('Join with a code', 'blue b-join', async () => {
		const code = await askText({ title: 'The 5-letter match code', maxLength: 5, upper: true, charset: 'code' });
		if (!code) return;
		teamPicker('Your team', async (team) => {
			const res = await net.call('rpvp-join', { pv: RPVP, code: code.trim().toUpperCase(), team }).catch((e) => ({ error: String(e && e.message || e) }));
			if (res.error) { toast(res.error); onlineScreen(); return; }
			lobby = res.lobby; lobbyScreen();
		}, { back: onlineScreen, startLabel: 'Join' });
	}), btn('Back', 'grey b-back', menu));
	screen('Play Online', [box, row]);
}
function lobbyScreen() {
	if (!lobby) { onlineScreen(); return; }
	M = null;
	const me = net.myName(), isHost = lobby.host === me, mine = lobby.players.find((p) => p.name === me);
	const list = h('div', 'rp-panel', `<div class="rp-banner">Code: <b style="font-size:30px;letter-spacing:.12em">${esc(lobby.code)}</b> · ${lobby.tag ? 'Tag-Team 2v2 (' + (lobby.split === 'apart' ? 'friends against each other' : 'friends together') + ')' : lobby.size + ' players'}${lobby.cpus ? ' (' + lobby.cpus + ' computer)' : ''}${Object.keys(lobby.opts).length ? ' · ' + Object.keys(lobby.opts).map((k) => esc(R.OPTIONS[k].name)).join(', ') : ''}</div>`);
	for (const p of lobby.players) list.appendChild(h('div', '', `${esc(p.name)}${p.name === lobby.host ? ' (host)' : ''} · ${p.team} Pets · ${p.ready ? '✓ ready' : 'not ready'}${p.away ? ' · away' : ''}`));
	for (let i = 0; i < lobby.cpus; i++) list.appendChild(h('div', 'muted', 'A computer painter'));
	const open = lobby.size - lobby.cpus - lobby.players.length;
	if (open > 0) list.appendChild(h('div', 'muted', `Waiting for ${open} more: share the code`));
	if (lobby.tag) {   // (who partners whom: the server seats them the same way, server/rpets_pvp.mjs tagSeats)
		const order = lobby.split === 'apart' ? [0, 2, 1, 3] : [0, 1, 2, 3], slots = [null, null, null, null];
		for (let i = 0; i < 4 - lobby.cpus; i++) slots[order[i]] = lobby.players[i] ? lobby.players[i].name : 'an open seat';   // (an open seat is a friend still to come)
		for (let i = 0; i < 4; i++) if (!slots[i]) slots[i] = 'a computer';
		const nm = (x) => esc(x || 'an open seat');
		list.appendChild(h('div', 'rp-banner rp-teams', `Team 1: <b>${nm(slots[0])} & ${nm(slots[1])}</b> · Team 2: <b>${nm(slots[2])} & ${nm(slots[3])}</b>`));
	}
	const row = h('div', 'rp-row');
	if (isHost && lobby.tag) row.appendChild(btn(lobby.split === 'apart' ? 'Friends together' : 'Friends against each other', 'grey small b-split', async () => { const r = await net.call('rpvp-update', { pv: RPVP, id: lobby.id, split: lobby.split === 'apart' ? 'together' : 'apart' }).catch(() => ({})); if (r.lobby) { lobby = r.lobby; lobbyScreen(); } }));
	if (!isHost && mine) row.appendChild(btn(mine.ready ? 'Not ready' : 'Ready', mine.ready ? 'grey b-unready' : 'green b-ready', async () => { const r = await net.call('rpvp-update', { pv: RPVP, id: lobby.id, ready: !mine.ready }).catch(() => ({})); if (r.lobby) { lobby = r.lobby; lobbyScreen(); } }));
	if (isHost) { const s = btn('Start', 'green b-start-online', async () => { const r = await net.call('rpvp-start', { pv: RPVP, id: lobby.id }).catch((e) => ({ error: String(e) })); if (r.error) toast(r.error); else { lobby = r.lobby; poll(); } }); row.appendChild(s); }
	row.appendChild(btn('Leave', 'red b-leave', async () => { await net.call('rpvp-leave', { pv: RPVP, id: lobby.id }).catch(() => {}); lobby = null; stopOnline(); menu(); }));
	screen('Online match', [list, row]);
	poll();
}
async function poll() {
	stopOnline();
	if (!lobby) return;
	const r = await net.call('rpvp-sync', { pv: RPVP, id: lobby.id, n: M && M.kind === 'online' ? M.n : -1 }).catch(() => null);
	if (r && r.lobby) lobby = r.lobby;
	if (r && r.error && r.closed) { lobby = null; toast('That match is closed'); menu(); return; }
	// (a finished match is shown only to a page that was in it: back in the lobby, the last match stays over and done)
	if (r && r.match && !(r.match.over && (!M || M.kind !== 'online' || M.mid !== r.match.mid))) takeMatch(r.match);
	else if (r && r.lobby && (!M || M.kind !== 'online') && !document.querySelector('.rp-picker')) redrawLobby();
	pollT = setTimeout(poll, M && M.kind === 'online' && M.V && M.V.toAct === M.seat ? 3000 : 1500);
}
let lobbyStamp = '';
function redrawLobby() { const s = JSON.stringify(lobby); if (s === lobbyStamp) return; lobbyStamp = s; if (!M) { clearTimeout(pollT); lobbyScreen(); } }
function takeMatch(m) {
	if (!M || M.kind !== 'online' || M.mid !== m.mid) { M = { kind: 'online', lid: lobby.id, mid: m.mid, seat: m.seat, V: null, n: -1, recipe: null }; lastLogN = -1; feedLines.length = 0; overShown = false; paid = false; startBroadcast(); }
	M.n = m.n;
	if (m.recipe) M.recipe = m.recipe;
	if (m.view) { M.V = m.view; refresh(); }
}
async function onlineAct(a) {
	const r = await net.call('rpvp-act', { pv: RPVP, id: M.lid, n: -1, a }).catch((e) => ({ error: String(e && e.message || e) }));
	if (r && r.match) takeMatch({ ...r.match, view: r.match.view || null });
	return (r && (r.refused || r.error)) || null;
}

// ------------------------------------------------------------------ replays
function replaysScreen() {
	const list = h('div', 'rp-replays');
	const rs = SV.listReplays();
	if (!rs.length) list.appendChild(h('div', 'muted', 'No matches yet. A finished match is kept here (the last 10).'));
	for (const r of rs) list.appendChild(btn(`${r.won ? '🏆' : '·'} ${esc(r.players.join(' vs '))} <small>${esc(r.how)} · turn ${r.turns} · ${new Date(r.when).toLocaleDateString()}</small>`, 'grey rp-stage b-rp-open', () => { location.href = SV.replayUrl(r.p); }));
	screen('Replays', [list, btn('Back', 'grey b-back', menu)]);
}
const RP = { k: 0, total: 0, playing: false, timer: null, speed: 1 };
function startReplay() {
	if (!REPLAY || !R.newMatch(REPLAY.setup)) { screen('Replay', [h('div', 'rp-credit', 'That replay could not be read.'), btn('Main menu', 'grey b-home', () => { location.href = '/rainbowpets/'; })]); return; }
	RP.total = REPLAY.actions.length;
	M = { kind: 'replay', S: null, setup: REPLAY.setup, actions: REPLAY.actions, seat: null };
	goReplay(clipStart(RP.total) || 0);
	window.__rpets.replayTo = (k) => goReplay(k);
	window.__rpets.replayTotal = RP.total;
	window.__rpets.replayAt = () => RP.k;
}
function goReplay(k) {
	RP.k = Math.max(0, Math.min(RP.total, k));
	M.S = R.replay({ setup: REPLAY.setup, actions: REPLAY.actions }, RP.k);
	lastLogN = -1; feedLines.length = 0;
	const V = R.view(M.S, null);
	for (const e of V.log) { const l = say(V, e); if (l) feedLines.unshift(l); }
	lastLogN = V.n;
	render(V);
}
function replayBar() {
	const bar = h('div', 'rp-replay-bar rp-panel');
	const tick = () => { if (!RP.playing) return; if (RP.k >= RP.total) { RP.playing = false; render(R.view(M.S, null)); return; } goReplay(RP.k + 1); RP.timer = setTimeout(tick, 900 / RP.speed); };
	bar.append(btn('⏮', 'grey small b-rp-start', () => goReplay(0)), btn('◀', 'grey small b-rp-back', () => goReplay(RP.k - 1)),
		btn(RP.playing ? '⏸ Pause' : '▶ Play', 'green small b-rp-play', () => { RP.playing = !RP.playing; clearTimeout(RP.timer); if (RP.playing) tick(); else render(R.view(M.S, null)); }),
		btn('▶|', 'grey small b-rp-step', () => goReplay(RP.k + 1)), btn('×' + RP.speed, 'orange small b-rp-speed', () => { RP.speed = RP.speed >= 8 ? 1 : RP.speed * 2; render(R.view(M.S, null)); }),
		btn('🔗 Moment', 'grey small b-rp-clip', async () => { await copyClip(RP.k); toast('Link to this moment copied'); }),
		h('span', 'rp-banner', `Replay · move ${RP.k} / ${RP.total}`));
	return bar;
}

// ------------------------------------------------------------------ spectating
let specStatus = '';
const SPEC_WORDS = { connecting: 'connecting', live: 'live', 'not-live': 'not playing right now', full: 'too many watching', over: 'the match is over', forbidden: 'only their friends can watch', login: 'sign in to watch', offline: 'offline, retrying' };
function startSpectating() {
	M = { kind: 'spectate', V: null, seat: null };
	screen('', [h('div', 'rp-credit', `Waiting for <b>${esc(SPECTATE)}</b>'s match…`)]);
	if (!net) return;
	let spec = null;
	const go = () => {
		spec = net.startSpectate(SPECTATE, {
			onSnapshot: (snap, meta) => {
				if (!snap || snap.game !== 'rpets') return;
				// (a new match by the same player: its own feed, and its own end screen)
				if (!M.V || M.V.seed !== snap.seed) { lastLogN = -1; feedLines.length = 0; overShown = false; M.replay = null; const m = document.querySelector('.rp-modal-bg'); if (m) m.remove(); }
				if (meta && meta.replay) M.replay = meta.replay;
				M.V = snap; refresh();
			},
			onStatus: (st, inf) => { specStatus = SPEC_WORDS[st] || ''; if (st === 'over' && inf && inf.replay) { M.replay = inf.replay; } if (st === 'over') setTimeout(() => { if (spec) spec.stop(); go(); }, 6000); if (M.V) render(M.V); },
		});
	};
	go();
}

// ------------------------------------------------------------------ keyboard + controller + focus ring
let focusSel = null;
const navEls = (root = document) => { const m = document.querySelector('.rp-modal-bg'); const base = m || root; return [...base.querySelectorAll('button:not([disabled]), .rp-sym.is-target, .rp-sym.is-src')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && !e.closest('[hidden]') && !e.closest('#mp-topbar'); }); };
function setFocus(el) { for (const e of document.querySelectorAll('[data-focus]')) e.removeAttribute('data-focus'); if (!el) return; el.setAttribute('data-focus', ''); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); focusSel = keyOf(el); }
const keyOf = (el) => (el.dataset.sym ? `.rp-sym[data-sym="${el.dataset.sym}"]` : el.dataset.card ? `.rp-card[data-card="${el.dataset.card}"]` : el.dataset.uid ? `[data-uid="${el.dataset.uid}"]` : el.dataset.spot != null ? `.rp-open[data-spot="${el.dataset.spot}"]` : el.className.split(' ').find((c) => c.startsWith('b-')) ? '.' + el.className.split(' ').find((c) => c.startsWith('b-')) : null);
function focusEl(q) { const el = q && document.querySelector(q); if (el) setFocus(el); }
function focusFirst(root) { if (!padUsed) return; const els = navEls(root || document); if (els.length) setFocus(els[0]); }
function restoreFocus() { if (!padUsed) return; const el = focusSel && document.querySelector(focusSel); if (el && navEls().includes(el)) setFocus(el); else focusFirst(); }
let padUsed = false;
function onAction(action, o = {}) {
	if (o.repeat && (action === 'confirm' || action === 'cancel')) return true;
	const els = navEls(), cur = document.querySelector('[data-focus]');
	if (['up', 'down', 'left', 'right'].includes(action)) {
		padUsed = true;
		if (!cur || !els.includes(cur)) { if (els.length) setFocus(els[0]); return true; }
		const rects = els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
		const j = spatialNext(rects, els.indexOf(cur), action);
		if (j >= 0) setFocus(els[j]);
		return true;
	}
	if (action === 'confirm') { padUsed = true; if (cur && els.includes(cur)) cur.click(); else if (els.length) setFocus(els[0]); return true; }
	if (action === 'cancel') {
		const m = document.querySelector('.rp-modal-bg');
		if (m && !m.querySelector('.b-paper, .b-let, .b-watch')) { m.remove(); return true; }
		if (sel) { sel = null; const V = V_(); if (V) render(V); return true; }
		const back = document.querySelector('.b-back'); if (back) { back.click(); return true; }
		return false;
	}
	if (action === 'secondary') { const p = document.querySelector('.b-pass:not([disabled])'); if (p) p.click(); return true; }
	if (action === 'menu') { if (M && (M.kind === 'local' || M.kind === 'online')) fieldMenu(); return true; }
	if (action === 'context') { if (cur && cur.dataset.uid) { info = cur.dataset.uid; const V = V_(); if (V) render(V); } return true; }
	return false;
}

// ------------------------------------------------------------------ boot
window.__rpets = { ready: false, R, get M() { return M; }, view: () => V_(), act: (a) => doAct(a), wallet: () => Stars.stars(), menu, startLocal, refresh: () => refresh(), get sel() { return sel; } };
let last = performance.now() / 1000;
function frame() { requestAnimationFrame(frame); const now = performance.now() / 1000, dt = Math.min(0.1, now - last); last = now; if (bg) bg.draw(now, dt); }
(async function boot() {
	try { bg = new Background(document.getElementById('bg')); } catch (e) { bg = null; }
	await loadFont().catch(() => {});
	try { net = await import('./net.js'); } catch (e) { net = null; }
	document.getElementById('boot-loading').remove();
	// (a signed-in player's wallet is the account's: stars won on another device show here from the start)
	if (net && net.isLoggedIn()) Stars.sync((a, b) => net.call(a, b)).then(() => { const w = document.getElementById('rp-stars'); if (w) w.textContent = Stars.stars(); }).catch(() => {});
	requestAnimationFrame(frame);
	window.__rpetsInput = startInput({ onAction, pad: true });
	addEventListener('pointerdown', () => { padUsed = false; for (const e of document.querySelectorAll('[data-focus]')) e.removeAttribute('data-focus'); }, true);
	if (MODE === 'replay') startReplay();
	else if (MODE === 'spectate') startSpectating();
	else menu();
	window.__rpets.ready = true;
})();
