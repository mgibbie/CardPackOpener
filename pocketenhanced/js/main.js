// Pocket Enhanced — the page. A sibling of Scoundrel and Pair of Pears: Micatro's look (font, palette, buttons,
// modals, swirling background, sounds) around this game's own rules (./engine/engine.js).
//
//   normal          : a match on this device against computer players. S (engine state) -> send(action) -> render(view)
//   ?replay=<code>  : read-only; a finished match rebuilt from its recipe, step by step
//   online          : a match the SERVER holds (server/pocket_pvp.mjs): this page has only its own seat's view, and
//                     send(action) is a request the server's engine accepts or refuses
//   ?spectate=<user>: read-only; a friend's live match, from the spectator views they publish (no hands)
//
// The table is drawn ONLY from engine.view() objects, so a player, a replay and (later) a spectator or an online
// seat all draw the same thing. Everything that can be pressed is a <button>: the mouse clicks it, and the keyboard
// (arrows / WASD, Z confirm, X back, C Execute, V inspect, Enter menu) and a controller move a focus ring over the
// same buttons (makePad, after Scoundrel's).
import * as E from './engine/engine.js';
import { effectiveness } from './engine/types.js';
import { CARDS, card } from './data/cards.js';
import { createSheen } from './sheen.js';
import { paintScenes } from './scene8.js';
import { nextAction } from './ai.js';
import { chooseAction } from './ai_search.js';
import { STARTERS, starterDeck } from './decks.js';
import { THEME_DECKS } from './data/theme_decks.js';
import { deckAdvice, finishDeck } from './deckhelp.js';
import { trainerByKey, trainerDeck, TRAINER_STARS, winPays, dayOf, TRAINERS } from './trainers.js';
import { SOLO_SETS, SOLO_TASKS } from './data/solo_battles.js';
import * as SO from './solo.js';
import * as DR from './draft.js';
import * as EV from './events.js';
import { setState, claimSets, setsDue, packsFor, SET_PRINTS, SET_DEX } from './setrewards.js';
import { EMBLEMS, emblemById, newEmblems } from './emblems.js';
import * as SV from './save.js';
import * as COLL from './collection.js';
import { cap, ty, en, tx, sprite, artHtml, face, lookOf, LOOK_NAME, ofType, stageOf, fitCards } from './cardface.js';
import { createSync, DECKS as DECK_KIND, SOLO as SOLO_KIND } from './colsync.js';
import { deckCode, readDeckCode } from './decklist.js';
import * as PT from './packtimer.js';
import * as Stars from '/site/stars.js';
import { SAY } from './say.js';
import { loadFont } from '../../micatro/js/ui/assets.js';
import { Background, C as BGC, hex } from '../../micatro/js/ui/gl.js';
import { sound } from '../../micatro/js/ui/sound.js';
import { esc } from '../../micatro/js/ui/markup.js';
import { buttonLabel } from '/site/gamepad.js';
import { startInput, keyLabel, isTyping } from '/site/input.js';
import { matchStats } from './matchstats.js';
import { observe } from '/site/machine.js';
import { packString, unpackString } from '/battlecards/codec.js';
import { askText, oskOpen } from '/site/osk.js';

const params = new URLSearchParams(location.search);
const FROM_OVERWORLD = params.has('direct');   // ?direct=1: opened from the overworld's card table
const REPLAY_PARAM = params.get('replay');
const SEED_PARAM = (params.get('seed') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);   // ?seed=X: new matches use that seed
const TRAINER = trainerByKey(params.get('trainer'));   // ?trainer=KANTO:boulder: a Gym Leader from the overworld (trainers.js)
const SPECTATE = (params.get('spectate') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
const SLOT = ['A', 'B'];
const RIVALS = ['Blue', 'Green', 'Silver'];
const STATUS_LABEL = { poisoned: 'PSN', asleep: 'SLP', paralyzed: 'PAR', burned: 'BRN', confused: 'CNF' };
const FX_LABEL = { reduceEx: 'takes less damage from Pokémon ex', retreatTrap: 'punishes a retreat', noWeakness: 'has no Weakness', preventSmall: 'small hits do nothing', preventFromBasic: 'Basic Pokémon cannot hurt it', attachSleep: 'Energy from the Energy Zone puts it to sleep', doom: 'damage is coming', preventDamage: 'takes no damage from attacks', vulnerable: 'takes more damage', thorns: 'hurts its attackers', costMore: 'attacks and retreat cost more', cantUse: "can't use one attack", atkPlus: 'one attack is stronger', smokescreen: 'may miss its attack', cantAttack: "can't attack", cantRetreat: "can't retreat", atkMinus: 'attacks weaker', reduce: 'takes less', prevent: 'protected' };

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const play = (name, pitch, vol) => { try { sound.play(name, pitch, vol); } catch (e) { /* sound is optional */ } };
const btn = (label, cls, fn, k) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; if (k) b.dataset.k = k; b.addEventListener('click', e => { play('button'); fn(e); }); return b; };
// ------------------------------------------------------------------ the match on the table
let MODE = 'normal';         // 'normal' | 'online' | 'replay' | 'spectate'
let G = null;                // normal: { config, actions, you }
let S = null;                // the engine state (normal and replay)
let V = null;                // the view on the table
let R = null;                // replay: { recipe, pos, pov, timer }
let aiTimer = 0, overShown = false, pad = null, bg = null;
let net = null, publisher = null, spec = null;
const live = { you: 0, status: 'connecting', watchers: 0, names: [] };   // spectate: whose seat is at the bottom, and the link's state; playing: who is watching
const ui = { cmds: [null, null], pick: null, setup: { active: [], bench: [] }, prevDmg: new Map(), showOriginal: !!SV.prefs().original, fast: false, big: null };
const stage = document.getElementById('stage');
const el = {};

const ON = { id: null, lobby: null, mid: 0, n: -1, seat: 0, timer: 0, busy: false, recipe: null, sig: '', sayK: 0, miss: 0 };   // (miss: syncs in a row with no answer: the Reconnecting banner)
let rejoinAsked = false;   // (the first main menu after the page opens goes straight back into a running online match)   // online: the lobby and the position's number
const playing = () => MODE === 'normal' || MODE === 'online';
const YOU = () => (MODE === 'normal' && G ? G.you : MODE === 'online' && ON.seat >= 0 ? ON.seat : null);
const pov = () => (MODE === 'replay' ? R.pov : MODE === 'spectate' ? live.you : YOU());
const viewLabel = v => (v.over ? 'Match over' : v.phase === 'setup' ? 'Setting up' : `Turn ${v.turn}${v.maxTurns ? ' of ' + v.maxTurns : ''} · ${v.players.map(p => p.points).join('–')}`);
const defx = new Map();
/** A Pokémon's card. One holding Memory Light also has the attacks of the cards under it (the view lists them as `extra`). */
const def = k => {
	const c = card(k.id); if (!k.extra || !k.extra.length) return c;
	const key = k.id + '|' + k.extra.join(';'); if (!defx.has(key)) defx.set(key, { ...c, attacks: [...c.attacks, ...k.extra.map(([i, n]) => card(i).attacks[n])] });
	return defx.get(key);
};
const at = (v, loc) => v.players[loc.seat][loc.zone][loc.idx];
const keyOf = loc => `p:${loc.seat}:${loc.zone}:${loc.idx}`;
const where = loc => (loc.zone === 'active' ? `Active ${SLOT[loc.idx]}` : `Bench ${loc.idx + 1}`);
const pokeLabel = (v, loc) => { const k = at(v, loc); return `${v.players[loc.seat].name}'s ${k ? def(k).name : '(empty)'} (${where(loc)})`; };
const myTurn = () => playing() && V && !V.over && V.phase === 'main' && V.current === YOU() && !V.pending;
const locsOf = (v, seat, zones = ['active', 'bench']) => zones.flatMap(zone => v.players[seat][zone].map((k, idx) => (k ? { seat, zone, idx } : null)).filter(Boolean));
const oppSeats = v => v.players.filter(p => p.seat !== pov() && !p.eliminated).map(p => p.seat);

/** Why this Pokémon cannot use this attack now, or null: the engine's attackBlock, read off a view. */
function attackWhy(v, seat, k, a) {
	const p = v.players[seat], c = def(k);
	if (p.turns === 0 && seat === v.first) return 'the player who goes first cannot attack on their first turn';
	if (c.fossil) return 'a fossil cannot attack';
	if (k.status.includes('asleep')) return `${c.name} is Asleep`;
	if (k.status.includes('paralyzed')) return `${c.name} is Paralyzed`;
	if (k.fx.some(f => f.k === 'cantAttack')) return `${c.name} can't attack this turn`;
	if (!E.canPay(k.provides || k.energy, E.lessCost(E.baseCost(k, a, p.deck), k.less || 0))) return 'not enough Energy';
	return null;
}
function targetsOf(v, me, a) {
	const out = [];
	if (a.target === 'none') return out;
	for (const q of v.players) {
		if (q.seat === me || q.eliminated) continue;
		if (a.target !== 'oppBench') out.push(...locsOf(v, q.seat, ['active']));
		if (a.target !== 'oppActive') out.push(...locsOf(v, q.seat, ['bench']));
	}
	return a.fx.some(f => f.k === 'snipe' && f.damaged) ? out.filter(l => at(v, l).dmg > 0) : out;   // (an attack that takes only a Pokémon with damage on it)
}

function persist() { if (MODE === 'normal' && G && S && !S.over) SV.saveRun(G.config, G.actions, G.you); }
/** Take an action as the player. A refused action changes nothing and says why. */
function send(a) {
	if (MODE === 'online') return sendOnline(a);
	if (MODE !== 'normal' || !S) return false;
	a = { ...a, seat: a.seat ?? YOU() };
	try { E.apply(S, a); } catch (e) {
		if (!e || !e.refused) throw e;
		S = E.replay(G.config, G.actions);   // a refusal leaves the match exactly as it was
		toast(cap(e.message) + '.'); play('cancel'); sync();
		return false;
	}
	G.actions.push(a); persist(); sync();
	return true;
}
function sync() { setView(S ? E.view(S, pov()) : null); tickAI(); }
/** Put a view on the table (from the local engine, the server, or a replay step). */
// ---- coin flips: each coin the match flips is tossed on screen, and the table is redrawn when it has landed ----
let coinQ = [], coinBusy = false;
const calm = () => { if (SV.prefs().calm) return true; try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
// ---- Options: text size and motion (owner's second improvement list, 2026-11-18: accessibility) ----
const TEXT_SIZES = [['m', 'Normal'], ['l', 'Large'], ['xl', 'Larger']];
const a11yClass = () => { const p = SV.prefs(); return (p.text === 'l' ? ' text-l' : p.text === 'xl' ? ' text-xl' : '') + (p.calm ? ' calm' : ''); };
function applyA11y() { stage.classList.remove('text-l', 'text-xl', 'calm'); for (const c of a11yClass().split(' ').filter(Boolean)) stage.classList.add(c); }
function settingsMenu() {
	const box = h('div', 'pe-list');
	const draw = () => {
		box.innerHTML = '';
		const p = SV.prefs();
		box.appendChild(h('div', 'pe-note', 'Text size <span class="muted">(menus, notes, messages and the close-up of a card)</span>'));
		const ts = h('div', 'pe-seg'); for (const [k, n] of TEXT_SIZES) ts.appendChild(btn(n, 'grey' + ((p.text || 'm') === k ? ' on' : ''), () => { SV.setPref('text', k); applyA11y(); draw(); pad && pad.refresh(true); }, 'text-' + k)); box.appendChild(ts);
		box.appendChild(h('div', 'pe-note', 'Motion <span class="muted">(attack effects, coin tosses, card shine and the rest. Your device\'s own reduce-motion setting is always followed.)</span>'));
		box.appendChild(btn(p.calm ? 'Reduce motion: <b>on</b>' : 'Reduce motion: off', 'grey' + (p.calm ? ' on' : ''), () => { SV.setPref('calm', !SV.prefs().calm); applyA11y(); draw(); pad && pad.refresh(true); }, 'calm'));
		box.appendChild(h('div', 'pe-note muted', 'Every Energy type has its own symbol as well as its colour; hold or hover one to read its name.'));
	};
	draw();
	modal(box, { title: 'Options' });
}
/** The coins flipped since the last view (none on the first view of a match, in fast mode, or when motion is to be reduced). */
function newCoins(v) {
	if (!v) { ui.coinN = null; return []; }
	// (by POSITION in the log, which only grows during a match. Not by a line's `n`: the engine's log() lets a line's own
	// count overwrite it (a draw of 1 card is n: 1), so `n` goes backwards and old lines read as new.)
	const last = v.log.length, from = ui.coinN;
	ui.coinN = last;
	if (from == null || last < from || ui.fast || calm()) return [];
	return v.log.slice(from).filter(e => e.k === 'coin').map(e => ({ heads: /HEADS\.?$/.test(e.msg), msg: e.msg.replace(/:\s*(HEADS|tails)\.?$/, '') }));
}
function runCoins() {
	const c = coinQ.shift();
	if (!c) { coinBusy = false; el.fx.classList.remove('coin'); el.fx.querySelectorAll('.pe-coinwrap').forEach(e => e.remove()); afterView(); tickAI(); return; }
	coinBusy = true; el.fx.classList.add('coin');
	const quick = coinQ.length >= 3, w = h('div', 'pe-coinwrap' + (quick ? ' quick' : ''));
	w.innerHTML = `<div class="pe-coin ${c.heads ? 'heads' : 'tails'}"><i class="h">★</i><i class="t">●</i></div><div class="res ${c.heads ? 'heads' : 'tails'}">${c.heads ? 'HEADS' : 'TAILS'}</div><div class="cap">${esc(c.msg)}</div>`;
	w.setAttribute('role', 'status'); w.setAttribute('aria-label', `${c.msg}: ${c.heads ? 'heads' : 'tails'}`);
	el.fx.querySelectorAll('.pe-coinwrap').forEach(e => e.remove()); el.fx.appendChild(w);
	play('cardSlide1');
	setTimeout(runCoins, quick ? 620 : 1250);
}
/** What happened since the table was last drawn, for the mat to show once: who attacked, where a Pokémon was Knocked Out,
 *  whether a turn began. Read from the log's own fields; nothing is shown when playing fast or with reduced motion. */
const FX = { n: null, turn: null, cards: new Map(), energy: new Map(), lunge: new Set(), ko: new Set(), hit: new Map(), on: false, banner: null };
// An attack's type, shown where it lands (owner's improvement list, 2026-11-18: "attack animations by type"): each of the
// eighteen types is one of seven shapes in its own colour (css/pocket.css .pe-hitfx).
const HIT_FX = { Fire: ['burst', '#ff7a2f'], Dragon: ['burst', '#c9a227'], Water: ['splash', '#3aa0ff'], Ice: ['splash', '#9ee7ff'], Electric: ['bolt', '#ffd43b'],
	Grass: ['leaves', '#5ccf5c'], Bug: ['leaves', '#a8c13a'], Poison: ['leaves', '#b562d6'], Psychic: ['rings', '#ff5fa2'], Ghost: ['rings', '#7d5fc9'], Fairy: ['rings', '#ffa3d9'],
	Fighting: ['impact', '#d4553a'], Rock: ['impact', '#b89a5a'], Ground: ['impact', '#c9a05c'], Normal: ['impact', '#e8e2d0'], Steel: ['impact', '#b8c4cf'], Dark: ['slash', '#6b5a8f'], Flying: ['slash', '#a5c6ff'] };
function takeFx() {
	FX.lunge = new Set(); FX.ko = new Set(); FX.hit = new Map(); FX.banner = null; FX.on = false; FX.sound = null;
	if (!V) { FX.n = null; return; }
	const last = V.log.length, from = FX.n, turn = FX.turn;   // (by position in the log, as newCoins: a line's `n` can go backwards, and old Knock Outs then played again)
	FX.n = last; FX.turn = V.turn;
	if (from == null || last < from) { FX.cards.clear(); FX.energy.clear(); return; }   // (another match: nothing carries over)
	if (ui.fast || calm() || MODE === 'replay') return;
	FX.on = true;
	for (const e of V.log.slice(from)) {
		if (e.k === 'attack' && e.slot != null) FX.lunge.add(keyOf({ seat: e.seat, zone: 'active', idx: e.slot }));
		else if (e.k === 'ko' && e.zone && e.idx != null) FX.ko.add(keyOf({ seat: e.seat, zone: e.zone, idx: e.idx }));
		else if (e.k === 'damage' && e.to && HIT_FX[e.type]) FX.hit.set(keyOf(e.to), e.type); }
	// (one sound for each kind of thing that happened, not one for each Pokémon)
	FX.sound = [...(FX.ko.size ? [['explosion1', 1.25, 0.45]] : []), ...(FX.lunge.size ? [['slice1', 0.9, 0.5]] : [])];
	{ const all = V.players.flatMap(p => [...p.active, ...p.bench]).filter(Boolean); if (all.some(k => FX.cards.has(k.uid) && FX.cards.get(k.uid) !== k.id)) FX.sound.push(['polychrome1', 1, 0.5]); else if (all.some(k => FX.energy.has(k.uid) && (k.energy || []).length > FX.energy.get(k.uid))) FX.sound.push(['chips1', 1.1, 0.45]); }
	if (V.phase === 'main' && !V.over && turn != null && V.turn !== turn) {
		FX.sound.push(['whoosh1', 1.15, 0.4]);
		const left = V.maxTurns ? V.maxTurns - V.turn : null, who = V.current === pov() ? 'Your turn' : `${V.players[V.current].name}'s turn`;
		FX.banner = who + (left != null && left <= 5 ? (left > 0 ? ` · ${left} turn${left > 1 ? 's' : ''} left` : ' · the last turn') : '');
	}
}
function showBanner(text, mine) {
	el.fx.querySelectorAll('.pe-turnfx').forEach(e => e.remove());
	const b = h('div', 'pe-turnfx' + (mine ? ' mine' : ''), esc(text)); b.setAttribute('role', 'status'); el.fx.appendChild(b);
	setTimeout(() => b.remove(), 1500);
}
function afterView() {
	takeFx();
	render();
	if (FX.banner) showBanner(FX.banner, V.current === pov());
	if (FX.sound) { for (const [name, pitch, vol] of FX.sound) play(name, pitch, vol); FX.sound = null; }
	if (playing() && V && V.over && !overShown) { overShown = true; finish(); }
}
function setView(v) {
	const coins = newCoins(v);
	V = v;
	if (V) for (const i of [0, 1]) { const q = ui.cmds[i], me = YOU() != null ? V.players[YOU()] : null, k = me && me.active[i]; if (q && (!k || k.uid !== q.uid || !myTurn() || attackWhy(V, YOU(), k, def(k).attacks[q.cmd.attack]))) ui.cmds[i] = null; }
	if (ui.pick && ui.pick.auto) ui.pick = null;
	if (V && V.over) { coinQ.length = 0; afterView(); return; }   // (the end of a match is never held back: its result and its replay are due now)
	if (coins.length) { coinQ.push(...coins); if (!coinBusy) runCoins(); return; }   // (the table is redrawn when they have landed)
	if (coinBusy) return;
	afterView();
}

// ------------------------------------------------------------------ computer players (the same actions as a person)
function actor() {
	if (!S || S.over) return null;
	if (S.pending) return S.pending.seat;
	if (S.phase === 'setup') { const w = S.players.filter(p => !p.setup && !p.eliminated); const p = w.find(q => q.ai) || w[0]; return p ? p.seat : null; }
	return S.current;
}
function tickAI() {
	clearTimeout(aiTimer); aiTimer = 0;
	const s = actor();
	if (MODE !== 'normal' || s == null || !S.players[s].ai) return;
	aiTimer = setTimeout(aiStep, ui.fast ? 0 : S.phase === 'setup' ? 60 : 650);
}
function aiStep() {
	aiTimer = 0;
	if (coinBusy) { aiTimer = setTimeout(aiStep, 150); return; }   // (a computer player waits for the coin like anyone else)
	const s = actor();
	if (MODE !== 'normal' || s == null || !S.players[s].ai) return;
	const banned = new Set();
	for (let t = 0; t < 60; t++) {
		// (the computer player looks ahead, except in a solo battle's Beginner and Intermediate tiers, which play by rules of thumb alone)
		const easy = /:[bi]\d+$/.test(G.config.solo || '') || G.config.bots === 'easy', a = (easy ? nextAction(E.view(S, s), banned) : chooseAction(S, s, banned)) || { t: 'execute', seat: s, commands: [null, null] };
		try { E.apply(S, a); G.actions.push(a); break; } catch (e) { if (!e || !e.refused) throw e; banned.add(JSON.stringify(a)); try { S = E.replay(G.config, G.actions); } catch (e2) { if (!e2 || !e2.refused) throw e2; /* a match that its recorded actions cannot rebuild (one set up by hand): the engine checks an action before it changes anything, so the state stands */ } }
	}
	persist(); sync();
}
const idle = () => !aiTimer && !coinBusy && (!S || S.over || MODE !== 'normal' || !S.players[actor()]?.ai);

// ------------------------------------------------------------------ the stage
let portrait = false;
function resize() {
	const vw = innerWidth, vh = innerHeight;
	portrait = vw < vh * 0.9;
	const W = portrait ? 820 : 1600, H = portrait ? 1500 : 900, scale = Math.min(vw / W, vh / H);
	stage.className = 'pe ' + (portrait ? 'portrait' : 'landscape') + a11yClass();
	stage.style.left = Math.round((vw - W * scale) / 2) + 'px';
	stage.style.top = Math.round((vh - H * scale) / 2) + 'px';
	stage.style.transform = `scale(${scale})`;
	if (V && el.table && stage.dataset.shape !== String(portrait)) { stage.dataset.shape = String(portrait); render(); }   // (card sizes follow the shape)
	stage.dataset.shape = String(portrait);
	if (pad) pad.refresh();
}
/** A card whose rules text does not fit (a long text, or a device whose font runs wide) has its text set tighter, step by
 *  step, until it does. Runs as cards are added to the page, before they are painted. */
function fitFaces() {
	paintScenes(stage);   // (the scenes of illustration and immersive cards that have just come onto the page)
	if (sheen) sheen.wake();   // (a card may have come on show: the inspect view, a pack's card turned over)
	fitCards(stage);
}
let sheen = null;
function build() {
	new MutationObserver(fitFaces).observe(stage, { childList: true, subtree: true });
	// (the card font arrives after the first cards are drawn: they are fitted again in it)
	if (document.fonts && document.fonts.ready) document.fonts.load('700 16px Cabin').then(() => { for (const f of stage.querySelectorAll('.f.pk[data-fit]')) { delete f.dataset.fit; delete f.dataset.tight; const n = f.querySelector('.hd .n'); if (n) { n.style.fontStretch = ''; n.style.transform = ''; } } fitFaces(); }).catch(() => { /* the fallback font stays */ });
	tipSetup();
	sheen = createSheen(stage);
	stage.innerHTML = '';
	el.table = h('div', 'pe-table'); el.modals = h('div', 'modal-layer'); el.toast = h('div', 'pe-banner'); el.toast.style.display = 'none'; el.fx = h('div', 'pe-fx');
	el.conn = h('div', 'pe-conn', 'Connection lost. Reconnecting…'); el.conn.setAttribute('role', 'status'); el.conn.hidden = true;
	stage.append(el.table, el.toast, el.fx, el.modals, el.conn);
}
let toastT = 0;
function toast(msg) { el.toast.textContent = msg; el.toast.style.display = ''; clearTimeout(toastT); toastT = setTimeout(() => { el.toast.style.display = 'none'; }, 3200); }

/** Card sizes on the table (the font size; a card is 10em wide): [Active, Bench, Bench on its own row]. */
function sizes(isMe, n, singles) {
	// The Bench is always BEHIND the Active Pokémon (owner, 2026-11-17): a row of its own on the far side of them from
	// the middle of the mat, as in Pocket itself; never beside them. So every layout is 'stack', and the sizes are what
	// the height of a side allows: the Active Pokémon as large as fits, the Bench smaller behind them.
	if (portrait) { if (isMe) return singles ? [18.6, 10.4, 'stack'] : [16.8, 10.8, 'stack']; return n <= 1 ? (singles ? [17.4, 10.4, 'stack'] : [16.8, 10.8, 'stack']) : n === 2 ? (singles ? [16, 8.6, 'stack'] : [16.8, 9.1, 'stack']) : [12.4, 5.8, 'stack']; }
	if (isMe) return [13, 6.6, 'stack'];
	return n <= 2 ? [12.2, 6, 'stack'] : singles ? [10.4, 7.2, 'stack'] : [9.4, 7.2, 'stack'];
}
const staging = () => playing() && !!V && V.phase === 'setup' && YOU() != null && !V.players[YOU()].setup;
/** During setup, my side of the mat as I have laid it out so far: the Basic Pokémon I chose stand in their slots. */
function stagedView(v, you) {
	const me = v.players[you], mk = (i, n) => { const id = me.hand[i], c = card(id); return { uid: -1 - n, id, cards: [id], dmg: 0, hp: c.hp || 0, energy: [], provides: [], status: [], fx: [], tool: null, retreat: c.retreat || 0, less: 0, extra: [], staged: i }; };
	const p = { ...me, active: me.active.map((_, n) => (ui.setup.active[n] != null ? mk(ui.setup.active[n], n) : null)), bench: me.bench.map((_, n) => (ui.setup.bench[n] != null ? mk(ui.setup.bench[n], 2 + n) : null)) };
	return { ...v, players: v.players.map(q => (q.seat === you ? p : q)) };
}
function unstage(i) { for (const z of ['active', 'bench']) { const n = ui.setup[z].indexOf(i); if (n >= 0) ui.setup[z].splice(n, 1); } }
/** Put hand card `i` into that slot (pushing the ones after it along; one pushed out of the Active slots goes to the Bench). */
function placeStaged(i, zone, idx) {
	unstage(i);
	const s = ui.setup, L = s[zone], me = V.players[YOU()], max = zone === 'active' ? me.active.length : me.bench.length;
	if (idx < L.length) L.splice(idx, 0, i); else L.push(i);
	while (L.length > max) { const out = L.pop(); if (zone === 'active' && s.bench.length < me.bench.length) s.bench.push(out); }
}
// dragging a Basic Pokémon from the hand to a slot (or one on the mat to another slot, or back to the hand)
let drag = null, dragEnd = 0;
// (A card in the hand takes the whole touch itself: left to the browser, a drag that leaves the hand at a slant is read as
// a sideways scroll and cancelled. So the hand's own sideways scroll is done here too: a touch that sets off mostly
// sideways scrolls the hand, any other picks the card up.)
function dragSetup(elm, i, pan) {
	elm.style.touchAction = 'none';
	elm.addEventListener('pointerdown', ev => { if (ev.button) return; drag = { i, pan: pan ? elm.closest('.pe-hand') : null, x: ev.clientX, y: ev.clientY, on: false, html: elm.outerHTML, w: elm.offsetWidth, hgt: elm.offsetHeight, ghost: null }; });
}
/** In my turn: a card in my hand, or one of my Pokémon, can be picked up and dropped where it is to go (as in Pocket). */
function dragTurn(elm, what, pan) {
	elm.style.touchAction = 'none';
	elm.addEventListener('pointerdown', ev => { if (ev.button || !myTurn() || ui.pick) return; drag = { ...what, turn: true, pan: pan ? elm.closest('.pe-hand') : null, x: ev.clientX, y: ev.clientY, on: false, html: elm.outerHTML, w: elm.offsetWidth, hgt: elm.offsetHeight, ghost: null }; });
}
const slotLoc = t => { const s = t && t.closest ? t.closest('[data-k^="p:"]') : null; if (!s) return null; const [, seat, zone, idx] = s.dataset.k.split(':'); return { seat: +seat, zone, idx: +idx }; };
const slotEl = loc => stage.querySelector(`[data-k="${keyOf(loc)}"]`);
/** Why this Active Pokémon cannot retreat now, or null. */
function retreatWhy(k) { const me = V.players[YOU()], c = def(k), cost = Math.max(0, (k.retreat ?? c.retreat) - me.flags.retreatLess); return c.fossil ? 'a Fossil cannot retreat' : me.flags.retreated ? 'you already retreated this turn' : (k.provides || k.energy).length < cost ? `retreating costs ${cost} Energy` : null; }
/** The attacks of my Active Pokémon `k` that can be used now on `loc` (an opponent's Pokémon). */
const attacksOn = (k, loc) => def(k).attacks.map((a, i) => ({ a, i })).filter(({ a }) => !attackWhy(V, YOU(), k, a) && (a.target === 'none' || targetsOf(V, YOU(), a).some(l => keyOf(l) === keyOf(loc))));
/** Where what is being dragged may be dropped: the slots' keys (and `mat`: anywhere on the table will do). */
function dropTargets(d) {
	const you = YOU(), me = V.players[you], keys = new Set(); let mat = false;
	if (d.hand != null) {
		const c = card(me.hand[d.hand]);
		if (isBasic(c)) for (const l of emptySlots(me, you)) keys.add(keyOf(l));
		else if (c.kind === 'pokemon') for (const l of locsOf(V, you)) { if (evolvesInto(at(V, l), c)) keys.add(keyOf(l)); }
		else mat = true;
	} else if (d.poke) {
		const k = at(V, d.poke);
		if (d.poke.zone === 'bench') for (const n of me.active.keys()) { if (!me.active[n] || !retreatWhy(me.active[n])) keys.add(keyOf({ seat: you, zone: 'active', idx: n })); }
		else { if (!retreatWhy(k)) for (const l of locsOf(V, you, ['bench'])) keys.add(keyOf(l)); for (const s of oppSeats(V)) for (const l of locsOf(V, s)) if (attacksOn(k, l).length) keys.add(keyOf(l)); }
	}
	return { keys, mat };
}
/** A choice that was just opened is answered at once if what was dropped on is one of its options. */
function autoPick(loc) { if (ui.pick && loc && ui.pick.keys.has(keyOf(loc))) { ui.pick.cb(loc); if (!ui.pick) render(); return true; } return false; }
function dropTurn(d, t) {
	if (!myTurn()) return;
	const you = YOU(), me = V.players[you], loc = slotLoc(t), onTable = !!(t && t.closest && t.closest('.pe-table') && !t.closest('.pe-hand') && !t.closest('.pe-cmd') && !t.closest('.pe-log'));
	if (d.hand != null) {   // a card from my hand, dropped on the table: played (on the slot or Pokémon it was dropped on, if that is one it can go to)
		const c = card(me.hand[d.hand]); if (!c || !onTable || !playable(c, me)) return;
		play('cardSlide1');
		if (isBasic(c)) pickBasicSlot(d.hand, c); else if (c.kind === 'pokemon') pickEvolve(d.hand, c); else playTrainer(d.hand, c);
		autoPick(loc); return;
	}
	const from = d.poke, k = at(V, from); if (!k || !loc || keyOf(from) === keyOf(loc)) return;
	if (loc.seat === you) {   // one of my own: a Benched Pokémon and an Active one change places (a retreat), or it moves up to an empty Active slot
		const a = from.zone === 'active' ? from : loc.zone === 'active' ? loc : null, b = from.zone === 'bench' ? from : loc.zone === 'bench' ? loc : null;
		if (!a || !b || !at(V, b)) return;
		if (!at(V, a)) { play('cardSlide1'); send({ t: 'promote', slot: a.idx, bench: b.idx }); return; }
		const why = retreatWhy(at(V, a)); if (why) { toast(cap(why) + '.'); return; }
		play('cardSlide1'); send({ t: 'retreat', slot: a.idx, bench: b.idx }); return;
	}
	if (from.zone !== 'active') return;   // an opponent's Pokémon: my Active Pokémon attacks it
	const ok = attacksOn(k, loc);
	if (!ok.length) { const any = def(k).attacks.map(a => attackWhy(V, you, k, a)).find(Boolean); toast(any ? `${def(k).name} cannot attack: ${any}.` : `${def(k).name} has no attack that can reach that Pokémon.`); return; }
	const go = i => { chooseAttack(from.idx, i); autoPick(loc); };
	if (ok.length === 1) { go(ok[0].i); return; }
	const list = h('div', 'pe-list');
	for (const { a, i } of ok) list.appendChild(btn(`${a.cost.map(x => en(x)).join('')} ${esc(a.name)} ${ty(a.combatType)} <span class="d">${a.damage || ''}</span>`, 'grey', () => { closeModal(); go(i); }, 'datk' + i));
	modal(list, { title: `${def(k).name}: which attack?` });
}
function dragMove(ev) {
	if (!drag) return;
	if (drag.scroll != null) { const sr = stage.getBoundingClientRect(); drag.pan.scrollLeft = drag.scroll - (ev.clientX - drag.x) / (sr.width / stage.offsetWidth || 1); ev.preventDefault(); return; }   // (the hand, scrolled by the finger)
	if (!drag.on) { if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 10) return;
		if (drag.pan && ev.pointerType !== 'mouse' && drag.pan.scrollWidth > drag.pan.clientWidth + 4 && Math.abs(ev.clientX - drag.x) > Math.abs(ev.clientY - drag.y) * 1.3) { drag.scroll = drag.pan.scrollLeft; return; }
		drag.on = true; drag.ghost = h('div', 'pe-ghost' + (drag.energy ? ' energy' : '')); drag.ghost.innerHTML = drag.html; stage.classList.add(drag.energy ? 'dragging-energy' : drag.turn ? 'dragging-card' : 'dragging'); if (drag.turn) { closeAll(); drag.to = dropTargets(drag); for (const key of drag.to.keys) { const e = stage.querySelector(`[data-k="${key}"]`); if (e) e.classList.add('can-drop'); } if (drag.to.mat) stage.classList.add('drop-mat'); play('cardSlide1', 1.2); } if (drag.energy) { closeAll(); if (ui.pick) { ui.pick = null; render(); } play('cardSlide1', 1.3); } }
	if (!drag.ghost.isConnected) el.fx.appendChild(drag.ghost);
	const r = stage.getBoundingClientRect(), sc = r.width / stage.offsetWidth || 1;
	drag.ghost.style.left = ((ev.clientX - r.left) / sc - drag.w / 2) + 'px'; drag.ghost.style.top = ((ev.clientY - r.top) / sc - drag.hgt / 2) + 'px';
	if (drag.turn) {   // (the slot or Pokémon under the card lights up if the card can go there)
		const loc = slotLoc(document.elementFromPoint(ev.clientX, ev.clientY)), over = loc && drag.to.keys.has(keyOf(loc)) ? slotEl(loc) : null;
		for (const e of stage.querySelectorAll('.pe-poke.drop')) if (e !== over) e.classList.remove('drop');
		if (over) over.classList.add('drop');
	}
	if (drag.energy) {   // (the Pokémon under the Energy lights up: that is where it would go)
		const t = document.elementFromPoint(ev.clientX, ev.clientY), over = energyTarget(t);
		for (const e of stage.querySelectorAll('.pe-poke.drop')) if (e !== over) e.classList.remove('drop');
		if (over) over.classList.add('drop');
	}
	ev.preventDefault();
}
/** The Pokémon of mine (not a Fossil) that an element belongs to, or null: where a dragged Energy may be dropped. */
function energyTarget(t) {
	const slot = t && t.closest ? t.closest(`[data-k^="p:${YOU()}:"]`) : null; if (!slot || !V) return null;
	const [, seat, zone, idx] = slot.dataset.k.split(':'), k = at(V, { seat: +seat, zone, idx: +idx });
	return k && !def(k).fossil ? slot : null;
}
function dragDrop(ev, cancel) {
	const d = drag; drag = null; if (!d) return;
	if (d.scroll != null) { dragEnd = performance.now(); return; }   // (it was a scroll of the hand: nothing is played, and the lift is not a press)
	stage.classList.remove('dragging', 'dragging-energy', 'dragging-card', 'drop-mat'); if (d.ghost) d.ghost.remove();
	for (const e of stage.querySelectorAll('.pe-poke.drop, .pe-poke.can-drop')) e.classList.remove('drop', 'can-drop');
	if (!d.on) return;
	dragEnd = performance.now();
	if (d.turn) { if (!cancel) dropTurn(d, document.elementFromPoint(ev.clientX, ev.clientY)); return; }
	if (d.energy) {
		// dropped on one of my Pokémon: it is attached there (anywhere else: nothing happens, the Energy stays in the zone)
		const slot = cancel ? null : energyTarget(document.elementFromPoint(ev.clientX, ev.clientY));
		if (slot && myTurn() && V.players[YOU()].zone.cur && !V.players[YOU()].flags.attached) { const [, seat, zone, idx] = slot.dataset.k.split(':'); attachTo({ seat: +seat, zone, idx: +idx }); }
		return;
	}
	if (cancel || !staging()) return;
	const t = document.elementFromPoint(ev.clientX, ev.clientY), slot = t && t.closest(`[data-k^="p:${YOU()}:"]`);
	if (slot) { const [, , zone, idx] = slot.dataset.k.split(':'); placeStaged(d.i, zone, +idx); play('cardSlide1'); }
	else if (t && t.closest('.pe-hand')) { unstage(d.i); play('cardSlide1'); }
	render();
}
stage.addEventListener('dragstart', ev => ev.preventDefault());   // (a card's picture must not start the browser's own image drag: that cancels ours)
addEventListener('pointermove', dragMove, { passive: false });
addEventListener('pointerup', ev => dragDrop(ev, false));
addEventListener('pointercancel', ev => dragDrop(ev, true));
function pokeEl(v, loc, fs, opts = {}) {
	const k = at(v, loc), b = h('button', 'pe-poke' + (fs < 12 ? ' tiny' : '')); b.type = 'button'; b.dataset.k = keyOf(loc); b.style.fontSize = fs + 'px';
	const legal = ui.pick && ui.pick.keys.has(keyOf(loc));
	const slot = loc.zone === 'active' ? `<span class="slot">${SLOT[loc.idx]}</span>` : '';
	if (!k) {
		b.classList.add('empty'); b.innerHTML = slot;
		if (legal) b.classList.add('can', 'legal'); else b.disabled = true;
		b.setAttribute('aria-label', `${v.players[loc.seat].name}'s empty ${where(loc)}`);
	} else {
		const c = def(k), left = Math.max(0, k.hp - k.dmg);
		b.classList.add('pf'); if (c.ex) b.classList.add('ex');
		b.style.setProperty('--c', `var(--t-${c.cardType || 'Colorless'})`);
		const st = k.status.map(s => `<b class="${s}">${STATUS_LABEL[s] || s}</b>`).join('') + (k.fx.length ? `<b class="fx" title="${esc(k.fx.map(f => FX_LABEL[f.k] || f.k).join(', '))}">FX</b>` : '');
		let badge = '';
		if (legal && ui.pick.attack && loc.seat !== pov()) { const t = effectiveness(E.typeOf(v.rules || 1, ui.pick.attack), c.combatTypes).total; if (t) badge = `<b class="fx" style="background:${t > 0 ? 'var(--green)' : 'var(--red)'}">${t > 0 ? '+' : ''}${t}</b>`; }
		b.dataset.tip = k.id;
		const pr = printOf(loc.seat, k.id), lookK = lookOf(pr); if (lookK) { b.classList.add('look-' + lookK); b.dataset.look = lookK; }   // (the printing its owner put in the deck)
		b.innerHTML = slot + `<span class="st">${st}${badge}</span>` + face(c, k, pr) + `<div class="ens">${k.energy.map(e => en(e)).join('')}</div>` + (k.tool ? `<span class="tl" title="${esc(toolNames(k))}">${esc(toolNames(k))}</span>` : '');
		b.setAttribute('aria-label', `${pokeLabel(v, loc)}, ${left} of ${k.hp} HP`);
		if (legal) b.classList.add('legal');
		const q = loc.zone === 'active' && loc.seat === YOU() ? ui.cmds[loc.idx] : null;
		if (q) { b.classList.add('queued'); b.dataset.q = def(k).attacks[q.cmd.attack].name; }
		const was = ui.prevDmg.get(k.uid);
		if (was != null && k.dmg > was && !opts.quiet) { b.classList.add('hit'); b.appendChild(h('div', 'dn', '-' + (k.dmg - was))); }
		if (FX.on && !opts.quiet) {   // (shown once: an evolution, Energy arriving, an attack going out)
			const pc = FX.cards.get(k.uid), pe = FX.energy.get(k.uid);
			if (pc != null && pc !== k.id) b.classList.add('evo');
			if (pe != null && (k.energy || []).length > pe) b.classList.add('gain');
			if (FX.lunge.has(keyOf(loc))) b.classList.add(loc.seat === pov() ? 'lunge-up' : 'lunge-down');
		}
	}
	if (k && k.staged != null) { b.classList.add('staged'); dragSetup(b, k.staged, false); }
	else if (k && !opts.quiet && loc.seat === YOU() && myTurn() && !ui.pick) dragTurn(b, { poke: loc }, false);   // (mine, in my turn: drag it to attack, to retreat, or up from the Bench)
	if ((v.spots || []).some(sp => sp.seat === loc.seat && sp.zone === loc.zone && sp.idx === loc.idx)) { b.classList.add('spot'); b.title = 'Damage is coming to this spot at the end of its owner\'s next turn'; }
	if (FX.on && !opts.quiet && FX.hit.has(keyOf(loc))) { const [shape, col] = HIT_FX[FX.hit.get(keyOf(loc))], fx = h('div', 'pe-hitfx ' + shape, '<i></i><i></i><i></i>'); fx.style.setProperty('--hc', col); fx.dataset.type = FX.hit.get(keyOf(loc)); b.appendChild(fx); }   // (where an attack landed, in its type's shape and colour)
	if (FX.on && !opts.quiet && FX.ko.has(keyOf(loc))) b.appendChild(h('div', 'pe-kofx', '<i></i><b>KO</b>'));   // (where a Pokémon was just Knocked Out)
	b.addEventListener('click', ev => onPoke(loc, ev));
	return b;
}
function headEl(v, p, fan) {
	const pts = Array.from({ length: v.points }, (_, i) => `<i class="pt ${i < p.points ? 'on' : ''}"></i>`).join('');
	return h('div', 'pe-head', `<span class="nm">${p.seat === YOU() && MODE !== 'replay' && emblemById(SV.prefs().emblem) ? emblemTag(emblemById(SV.prefs().emblem)) + ' ' : ''}${esc(p.name)}${p.ai ? ' <span class="muted who">(computer)</span>' : p.seat === YOU() ? ' <span class="muted who">(you)</span>' : ''}${p.eliminated ? ' — out' : ''}</span><span class="pts" title="${p.points} of ${v.points} points">${pts}</span>` +
		`<span class="cnt">${fan ? `<span class="backs" aria-hidden="true">${'<i class="cb"></i>'.repeat(Math.min(p.handCount, 10))}</span>` : ''}<span title="cards in hand">✋ ${p.handCount}</span><span title="cards in deck"><i class="cb"></i> ${p.deck}</span><span title="discard pile">♻ ${p.discard.length}</span>${p.guard ? `<span class="pe-guard" title="takes less damage from opposing attacks until their next turn">🛡−${p.guard}</span>` : ''}${p.zone.cur ? en(p.zone.cur) : ''}</span>`);
}
/** A player's head line, with their discard pile behind a button (a discard pile is public). */
function headWithDiscard(v, p, fan) {
	const head = headEl(v, p, fan), b = h('button', 'pe-disc', 'Discard'); b.type = 'button'; b.dataset.k = 'disc:' + p.seat; b.disabled = !p.discard.length;
	b.setAttribute('aria-label', `${p.name}'s discard pile, ${p.discard.length} cards`);
	b.addEventListener('click', () => {
		const grid = h('div', 'pe-grid');
		p.discard.forEach((id, i) => { const c = card(id), e = handCard(c, null, '', printOf(p.seat, id)); e.classList.add('small'); e.dataset.k = 'dc' + i; e.addEventListener('click', () => inspect(c, null, null, [], printOf(p.seat, id))); grid.appendChild(e); });
		modal(grid, { title: `${p.name}'s discard pile (${p.discard.length})` });
	});
	head.querySelector('.cnt').appendChild(b);
	return head;
}
/** A player's Pokémon: the two Active and the four Benched (an opponent's Bench sits behind their Active, away from the middle of the mat). */
function rowsEl(v, seat, [fa, fb, mode], flip) {
	const w = h('div', 'pe-rows ' + mode + (flip ? ' flip' : '')), a = h('div', 'pe-row act'), b = h('div', 'pe-row ben');
	for (const i of v.players[seat].active.keys()) a.appendChild(pokeEl(v, { seat, zone: 'active', idx: i }, fa));
	for (const i of v.players[seat].bench.keys()) b.appendChild(pokeEl(v, { seat, zone: 'bench', idx: i }, fb));
	w.append(a, b);
	return w;
}
// With several opponents their cards share the top of the mat. One opponent can be enlarged (the button on their name
// bar): that side takes most of the width and the others stand aside, until it is pressed again.
const canEnlarge = n => n >= 3 || (!portrait && n === 2);
const BIG = { p3: [450, [19, 10.4, 'stack'], [7.3, 3.3, 'stack']], l3: [600, [13.6, 4.5, 'stack'], [9.4, 4.3, 'stack']], l2: [700, [13.6, 4.5, 'stack'], [9.4, 7.2, 'stack']] };   // (an enlarged side: its Active Pokémon as tall as the side allows, its Bench smaller behind them)
function sideEl(v, p, n) {
	const d = h('div', 'pe-side' + (v.current === p.seat && v.phase === 'main' ? ' turn' : '') + (p.eliminated ? ' out' : ''));
	const head = headWithDiscard(v, p, n === 1);
	d.appendChild(head);
	const big = canEnlarge(n) && ui.big != null && v.players[ui.big] && ui.big !== pov() ? BIG[(portrait ? 'p' : 'l') + n] : null;
	let sz = sizes(false, n, v.singles);
	if (big) { const mine = ui.big === p.seat; sz = mine ? big[1] : big[2]; if (mine) { d.style.flex = `0 0 ${big[0]}px`; d.classList.add('big'); } else d.classList.add('aside'); }
	if (canEnlarge(n)) {
		const on = ui.big === p.seat, b = h('button', 'pe-disc pe-big', on ? '−' : '+'); b.type = 'button'; b.dataset.k = 'big:' + p.seat;
		b.setAttribute('aria-label', on ? `Show ${p.name}'s cards at the usual size` : `Enlarge ${p.name}'s cards`);
		b.addEventListener('click', () => { ui.big = on ? null : p.seat; play('button'); render(); });
		head.querySelector('.cnt').appendChild(b);
	}
	d.appendChild(rowsEl(v, p.seat, sz, true));
	return d;
}
/** A card as a button. `print`: the printing it is drawn as (a full-art, rainbow, gold... printing looks like one). */
function handCard(c, i, extra = '', print = null) {
	const look = lookOf(print), b = h('button', 'pe-card pf' + (c.ex ? ' ex' : '') + (look ? ' look-' + look : '')); b.type = 'button'; if (i != null) b.dataset.k = 'h:' + i;
	b.style.setProperty('--c', `var(--t-${c.kind === 'pokemon' ? c.cardType : 'Colorless'})`);
	b.innerHTML = face(c, null, print) + extra;
	b.setAttribute('aria-label', c.name);
	b.dataset.tip = c.id; if (look) b.dataset.look = look;
	return b;
}
// ---- the hover panel: a card under the mouse is shown beside it at a size that reads, in the standard frame with all
// of its text (a small card on the mat cannot be read, and a full-art card does not carry its rules text). A touch or
// a controller has the inspect view for this: pressing the card.
let tipEl = null, tipT = 0, tipFor = null;
function hideTip() { clearTimeout(tipT); tipFor = null; if (tipEl) tipEl.style.display = 'none'; }
function showTip(elm) {
	const c = card(elm.dataset.tip); if (!c || !elm.isConnected) return;
	if (!tipEl) { tipEl = h('div', 'pe-tip'); stage.appendChild(tipEl); }
	const k = elm.dataset.k && /^p:/.test(elm.dataset.k) && V ? (([, s2, z, n]) => (V.players[s2] && V.players[s2][z] ? V.players[s2][z][+n] : null))(elm.dataset.k.split(':')) : null;
	const d = k ? def(k) : c;
	tipEl.innerHTML = `<div class="pf${d.ex ? ' ex' : ''}" style="--c:var(--t-${d.kind === 'pokemon' || d.fossil ? d.cardType || 'Colorless' : 'Colorless'})">${face(d, k && d.kind !== 'pokemon' ? k : null)}</div>${elm.dataset.look ? `<div class="lk-name">${LOOK_NAME[elm.dataset.look]} printing</div>` : ''}`;
	tipEl.style.display = '';
	// (the stage is scaled to the window: place the panel in the stage's own units, on the side with more room)
	const sr = stage.getBoundingClientRect(), r = elm.getBoundingClientRect(), sc = sr.width / stage.offsetWidth || 1, W = tipEl.offsetWidth, H = tipEl.offsetHeight;
	const x0 = (r.left - sr.left) / sc, x1 = (r.right - sr.left) / sc, y = (r.top - sr.top) / sc + ((r.height / sc) - H) / 2;
	const right = x1 + 14 + W <= stage.offsetWidth, x = right ? x1 + 14 : Math.max(6, x0 - 14 - W);
	tipEl.style.left = Math.round(x) + 'px'; tipEl.style.top = Math.round(Math.max(6, Math.min(stage.offsetHeight - H - 6, y))) + 'px';
}
function tipSetup() {
	stage.addEventListener('pointerover', ev => {
		if (ev.pointerType !== 'mouse') return;
		const t = ev.target.closest && ev.target.closest('[data-tip]');
		if (t === tipFor) return;
		hideTip(); if (!t || drag) return;
		tipFor = t; tipT = setTimeout(() => { if (tipFor === t) showTip(t); }, 380);
	});
	for (const e of ['pointerdown', 'wheel', 'keydown']) window.addEventListener(e, hideTip, true);
	stage.addEventListener('pointerleave', hideTip);
}
/** A full hand overlaps like a held fan, as long as more than half of every card still shows; past that the row scrolls. */
function fanHand(hand) {
	const cs = [...hand.querySelectorAll('.pe-card')], n = cs.length; if (n < 2) return;
	const W = cs[0].offsetWidth, GAP = 8, step = (hand.clientWidth - 24 - W) / (n - 1);
	const fits = step >= W + GAP, tight = step < W * 0.56;
	if (!fits && !tight) cs.forEach((e, j) => { if (j) e.style.marginLeft = Math.round(step - W - GAP) + 'px'; });
	if (tight) return;   // (a hand too full to fan scrolls, flat)
	const mid = (n - 1) / 2, turn = Math.min(2.6, 9 / n);
	cs.forEach((e, j) => { const d = j - mid; e.style.rotate = (d * turn).toFixed(2) + 'deg'; e.style.translate = `0 ${(Math.abs(d) ** 1.6 * turn * 1.5).toFixed(1)}px`; });
}

/** On a phone the hand has the room the battle log had: the log opens from this button instead. */
function logBtn() {
	return btn('Log', 'grey pe-logbtn', () => {
		const l = h('div', 'pe-log pe-logfull'); l.setAttribute('aria-label', 'Battle log');
		for (const e of V.log) l.appendChild(h('div', e.k, esc(e.msg + (e.more ? ' ' + e.more : ''))));
		modal(l, { title: 'Battle log' }); l.scrollTop = l.scrollHeight;
	}, 'log');
}
// The page's two big flows as state machines, declared (site/machine.js: they watch, they change nothing).
//   pocket.page   what the page is doing: MODE and the four variables that must agree with it (G, S, V, R)
//   pocket.turn   where a match stands for me: what myTurn(), staging() and the checks on V.pending work out piecemeal
const PAGE_M = observe('pocket.page', {
	where: 'pocketenhanced/js/main.js',
	states: ['menu', 'match', 'online-lobby', 'online-match', 'replay', 'spectate'],
	read() {
		if (MODE === 'replay') return R ? 'replay' : 'illegal: replay mode with no replay loaded';
		if (MODE === 'spectate') return 'spectate';
		if (MODE === 'online') return V ? 'online-match' : 'online-lobby';
		if (MODE !== 'normal') return 'illegal: no such mode: ' + MODE;
		if (R) return 'illegal: a replay is loaded outside replay mode';
		if (!V) return G || S ? 'illegal: a game is held with nothing on the table' : 'menu';
		return G && S ? 'match' : 'illegal: a match is on the table with no game behind it';
	},
	detail: () => ({ mode: MODE, modals: mstack.length }),
});
const TURN_M = observe('pocket.turn', {
	where: 'pocketenhanced/js/main.js',
	states: ['no-match', 'watching', 'setup-placing', 'setup-waiting', 'my-turn', 'choosing', 'waiting', 'over'],
	read() {
		if (!V) return 'no-match';
		if (V.over) return 'over';
		const me = YOU(); if (me == null) return 'watching';
		if (V.phase === 'setup') return V.players[me].setup ? 'setup-waiting' : 'setup-placing';
		if (V.pending) return V.pending.seat === me ? 'choosing' : 'waiting';
		if (V.phase !== 'main') return 'illegal: no such phase: ' + V.phase;
		return V.current === me ? (ui.pick ? 'choosing' : 'my-turn') : 'waiting';
	},
	detail: () => (V ? { turn: V.turn, current: V.current, pending: V.pending ? V.pending.kind || true : null } : undefined),
});
function render() {
	PAGE_M.check(); TURN_M.check();
	const keepLog = el.log ? el.log.scrollTop + el.log.clientHeight >= el.log.scrollHeight - 30 : true, handX = el.hand ? el.hand.scrollLeft : 0;
	el.table.innerHTML = ''; el.log = el.hand = null;
	if (!V) {
		bg && bg.set({ new_colour: BGC.BLUE, special_colour: BGC.RED, tertiary_colour: [0.13, 0.16, 0.16, 1], contrast: 1.4 });
		if (MODE === 'spectate') {
			const w = h('div', 'pe-cmd pe-wait'); w.appendChild(h('h3', '', `Watching ${esc(SPECTATE)}`));
			w.appendChild(h('div', 'q', esc(SPEC_STATUS[live.status] || 'Connecting…')));
			const bar = h('div', 'bar'); bar.appendChild(btn('Leave', 'orange', () => leave(), 'leave')); w.appendChild(bar);
			el.table.appendChild(w);
		}
		if (pad) pad.refresh(); return;
	}
	const you = pov(), me = you != null ? V.players[you] : V.players[0], others = V.order.map(s => V.players[s]).filter(p => p.seat !== me.seat);
	const mine = playing() && you != null;
	// a choice the game is waiting on from me (who comes up from the Bench)
	if (mine && V.pending && V.pending.seat === you && V.pending.kind === 'handPick') {
		const sig = V.turn + ':' + V.log.length + ':' + (V.pending.cards || []).length;   // (a run of choices with nothing logged between them: the cards left tell them apart)
		if (ui.handPick !== sig) {
			ui.handPick = sig; closeAll();
			const grid = h('div', 'pe-grid'), may = V.pending.options || [];
			(V.pending.cards || []).forEach((id, n) => { const e = handCard(card(id), null); e.classList.add('small'); e.dataset.k = 'hp' + n; if (may.includes(n)) e.addEventListener('click', () => { closeAll(); send({ t: 'choose', pick: n }); }); else { e.classList.add('unowned'); e.setAttribute('aria-disabled', 'true'); } grid.appendChild(e); });
			const body = may.includes(-1) ? (() => { const box = h('div', ''); box.append(grid, btn('Done', 'blue', () => { closeAll(); send({ t: 'choose', pick: -1 }); }, 'hpdone')); return box; })() : grid;   // (-1: "that is all", where any number may be chosen)
			setTimeout(() => modal(body, { title: V.pending ? V.pending.msg : 'Choose a card', noClose: true }), 0);
		}
	} else if (mine && V.pending && V.pending.seat === you && V.pending.kind === 'confirm') {
		const sig = 'c' + V.turn + ':' + V.log.length;
		if (ui.handPick !== sig) {
			ui.handPick = sig; closeAll();
			const box = h('div', ''), grid = h('div', 'pe-grid'), bar = h('div', 'pe-seg');
			(V.pending.cards || []).forEach(id => { const e = handCard(card(id), null); e.classList.add('small'); e.disabled = true; grid.appendChild(e); });
			bar.append(btn('Yes', 'green', () => { closeAll(); send({ t: 'choose', pick: 1 }); }, 'yes'), btn('No', 'grey', () => { closeAll(); send({ t: 'choose', pick: 0 }); }, 'no'));
			if (grid.children.length) box.appendChild(grid); box.appendChild(bar);
			setTimeout(() => modal(box, { title: V.pending ? V.pending.msg : 'Choose', noClose: true }), 0);
		}
	} else if (mine && V.pending && V.pending.seat === you && V.pending.kind === 'pickTarget' && !ui.pick) {
		// damage nobody aimed (Glaceon ex at the Checkup, Darkrai ex when an effect attaches its Energy): I choose where it goes
		const locs = V.pending.locs || [];
		ui.pick = { auto: true, prompt: V.pending.msg || 'Choose an opposing Active Pokémon', keys: new Set(locs.map(keyOf)), cb: loc => { ui.pick = null; send({ t: 'choose', pick: locs.findIndex(l => keyOf(l) === keyOf(loc)) }); } };
	} else if (mine && V.pending && V.pending.seat === you && !ui.pick) {
		const slot = V.pending.slot;
		ui.pick = { auto: true, prompt: V.pending.msg || 'Choose a Benched Pokémon to move up', keys: new Set(V.pending.options.map(i => keyOf({ seat: you, zone: 'bench', idx: i }))), cb: loc => { ui.pick = null; send({ t: 'choose', pick: loc.idx }); }, slot };
	}
	// opponents
	const opps = h('div', 'pe-opps');
	for (const p of others) opps.appendChild(sideEl(V, p, others.length));
	// my side
	const mePanel = h('div', 'pe-me' + (V.current === me.seat && V.phase === 'main' ? ' turn' : '') + (V.singles ? ' singles' : ''));
	mePanel.appendChild(rowsEl(mine && staging() ? stagedView(V, you) : V, me.seat, sizes(true, 0, V.singles), false));
	mePanel.appendChild(headWithDiscard(V, me));
	const zone = h('div', 'pe-zone', 'Energy Zone');
	const zb = h('button', 'slot' + (mine && myTurn() && me.zone.cur && !me.flags.attached ? ' ready' : '')); zb.type = 'button'; zb.dataset.k = 'zone';
	zb.innerHTML = me.zone.cur ? en(me.zone.cur, 'big') + `<div>${me.zone.cur}</div>` : `<div class="muted">${me.flags.attached ? 'attached' : 'none'}</div>`;
	zb.disabled = !(mine && myTurn() && me.zone.cur && !me.flags.attached);
	zb.setAttribute('aria-label', me.zone.cur ? `Attach your ${me.zone.cur} Energy` : 'No Energy ready');
	zb.addEventListener('click', () => { if (performance.now() - dragEnd < 350) return; pickAttach(); });   // (pressing it still asks which Pokémon; so does a controller or the keyboard)
	// ...and it can be dragged onto a Pokémon, as in Pocket itself
	if (!zb.disabled) { zb.style.touchAction = 'none'; zb.classList.add('grab'); zb.addEventListener('pointerdown', ev => { if (ev.button) return; drag = { energy: true, x: ev.clientX, y: ev.clientY, on: false, html: en(me.zone.cur, 'big'), w: 76, hgt: 76, ghost: null }; }); }
	zone.appendChild(zb);
	zone.appendChild(h('div', 'muted', me.zone.next ? `next: ${en(me.zone.next)}` : ''));
	mePanel.appendChild(zone);
	// the hand
	const hand = h('div', 'pe-hand'); el.hand = hand;
	if (me.hand) me.hand.forEach((id, i) => {
		const c = card(id), stg = mine && staging();
		if (stg && (ui.setup.active.includes(i) || ui.setup.bench.includes(i))) return;   // (it stands on the mat now)
		const b = handCard(c, i, '', printOf(me.seat, id));
		if (mine && (myTurn() || (V.phase === 'setup' && !me.setup)) && playable(c, me)) { b.classList.add('playable'); if (stg) dragSetup(b, i, true); else if (myTurn() && !ui.pick) dragTurn(b, { hand: i }, true); }
		b.addEventListener('click', ev => onHand(i, ev));
		hand.appendChild(b);
	});
	else hand.appendChild(h('div', 'pe-note', `${esc(me.name)} holds ${me.handCount} card${me.handCount === 1 ? '' : 's'}.`));
	// commands
	const cmd = h('div', 'pe-cmd');
	if (mine && V.phase === 'main' && !V.over) {
		cmd.appendChild(h('h3', '', (V.current === you ? 'Your commands' : `${esc(V.players[V.current].name)}'s turn`) + (V.maxTurns ? ` <span class="muted pe-turnno">Turn ${V.turn} of ${V.maxTurns}</span>` : '')));   // (a match with a turn limit says where it stands)
		for (const i of me.active.keys()) {
			const k = me.active[i], q = ui.cmds[i];
			cmd.appendChild(h('div', 'q' + (q ? '' : ' pass'), `${V.singles ? 'Active' : 'Active ' + SLOT[i]}: ${k ? `<b>${esc(def(k).name)}</b> → ${q ? esc(q.text) : 'Pass'}` : '<span class="muted">empty</span>'}`));
		}
		const bar = h('div', 'bar');
		const exLabel = V.singles ? 'Pass turn' : 'Execute', ex = btn(exLabel, 'red exec', () => execute(), 'exec'); ex.disabled = !myTurn(); ex.setAttribute('aria-label', exLabel);
		bar.append(ex, logBtn(), btn('Menu', 'grey', () => optionsMenu(), 'menu'));
		if (MODE === 'online') bar.append(btn('Say', 'grey', () => sayMenu(), 'say'));
		if (myTurn() && me.flags.penny) bar.prepend(btn(`${me.flags.pennyBy || 'Penny'}: use ${card(me.flags.penny).name}`, 'blue', () => playTrainer(-1, card(me.flags.penny), true), 'penny'));
		cmd.appendChild(bar);
		cmd.appendChild(h('div', 'hint', (myTurn() && me.zone.cur && !me.flags.attached ? 'Drag your Energy onto a Pokémon (or press it, then the Pokémon). ' : '') + (myTurn() ? (V.singles ? 'Drag your Active Pokémon onto its target, or press it and choose an attack: it attacks at once and your turn ends. Cards from your hand can be dragged onto the mat. Pass turn ends your turn without attacking.' : 'Drag an Active Pokémon onto its target to attack (or press it). Cards from your hand can be dragged onto the mat. Execute resolves A, then B, and ends your turn.') : V.pending ? esc(`Waiting for ${V.players[V.pending.seat].name} to choose…`) : 'Waiting…') + (live.watchers ? ` <span class="pe-watch" title="${esc(live.names.join(', '))}">👁 ${live.watchers} watching</span>` : '')));
	} else {
		cmd.appendChild(h('h3', '', MODE === 'spectate' ? `Watching ${esc(SPECTATE)}` : MODE === 'replay' ? 'Replay' : V.over ? 'Match over' : 'Setting up'));
		cmd.appendChild(h('div', 'q', V.over ? esc(V.over.winner != null ? `${V.players[V.over.winner].name} wins — ${V.over.why}` : `No winner — ${V.over.why}`) : esc(viewLabel(V) + (V.phase === 'main' ? ` — ${V.players[V.current].name}'s turn` : ''))));
		if (MODE === 'spectate') cmd.appendChild(h('div', 'hint pe-spec', esc(SPEC_STATUS[live.status] || '') + ' You see what a spectator may: the table and the log, nobody\'s hand.'));
		const bar = h('div', 'bar');
		if (mine && V.phase === 'setup' && !me.setup) { const r = btn('Ready', 'green exec', () => finishSetup(), 'ready'); r.disabled = !ui.setup.active.length; bar.appendChild(r); }
		if (MODE === 'replay') cmd.appendChild(replayBar());
		else { bar.append(logBtn(), btn('Menu', 'grey', () => optionsMenu(), 'menu')); cmd.appendChild(bar); }
		if (mine && V.phase === 'setup' && !me.setup) cmd.appendChild(h('div', 'hint', (V.singles ? 'Drag a Basic Pokémon from your hand to your Active slot, and more to your Bench. Drag one back to your hand to take it back. Press a card to read it. Then Ready.' : 'Drag a Basic Pokémon from your hand to Active A or B, and more to your Bench. Drag one back to your hand to take it back. Press a card to read it. Then Ready.')));
	}
	// the log
	const log = h('div', 'pe-log'); el.log = log; log.setAttribute('aria-label', 'Battle log');
	for (const e of V.log) log.appendChild(h('div', e.k, esc(e.msg + (e.more ? ' ' + e.more : ''))));
	if (V.singles) opps.classList.add('singles');
	// singles: each player's deck stands beside their Active Pokémon, as on Pocket's mat (mine on my right, theirs on their right)
	if (V.singles && others.length === 1) for (const [p, box] of [[others[0], opps.firstChild], [me, mePanel]]) { const pile = h('div', 'pe-pile' + (p === me ? ' mine' : ''), `<i class="cb"></i><b>${p.deck}</b>`); pile.title = `${p.name}'s deck: ${p.deck} cards`; box.appendChild(pile); }
	{ const tk = taskList(); if (tk) cmd.prepend(tk); }
	{ const tip = coachTip(); if (tip) { const c = h('div', 'pe-coach', `<b>Guide</b> ${esc(tip)}`); c.setAttribute('role', 'status'); cmd.prepend(c); } }
	el.table.append(h('div', 'pe-mat n' + others.length + (V.singles ? ' singles' : '')), opps, mePanel, hand, cmd, log);
	// what the table is waiting for, said the way Pocket says it
	if (V.phase === 'setup' && !V.over) {
		if (mine && !me.setup && !ui.setup.active.length) el.table.appendChild(h('div', 'pe-bubble',   // (until an Active Pokémon is chosen: it asks for nothing after that)
 V.singles ? 'Please put a Basic Pokémon in your Active slot.' : 'Please put a Basic Pokémon in an Active slot.'));
		if (mine && V.first != null) el.table.appendChild(h('div', 'pe-first', V.first === you ? 'You are going first' : `${esc(V.players[V.first].name)} is going first`));
	}
	if (V.stadium) {   // the Stadium in play: one for the whole table, shown on the mat; press it to read it
		const sc = card(V.stadium.id), sb = h('button', 'pe-stadium', `<span class="tag">Stadium</span><b>${esc(sc.name)}</b><span class="by">${esc(V.players[V.stadium.seat].name)}</span>`); sb.type = 'button'; sb.dataset.k = 'stadium';
		sb.setAttribute('aria-label', `Stadium in play: ${sc.name}, played by ${V.players[V.stadium.seat].name}`); sb.addEventListener('click', () => inspect(sc, null, null, mine && myTurn() && STADIUM_USE.includes(sc.fx.k) && !me.flags.stadiumUsed ? [['Use', () => { closeAll(); if (sc.fx.k === 'stadiumSwapBasic' || sc.fx.k === 'stadiumSwapTool') stadiumSwap(sc); else send({ t: 'stadium' }); }, null, 'stadiumuse']] : [])); if (mine && myTurn() && STADIUM_USE.includes(sc.fx.k) && !me.flags.stadiumUsed) sb.classList.add('ready'); el.table.appendChild(sb);
	}
	fanHand(hand);
	if (ui.pick) {
		const pr = h('div', 'pe-prompt', `<span>${esc(ui.pick.prompt)}</span>`);
		if (!ui.pick.auto) pr.appendChild(btn('Cancel', 'grey', () => cancelPick(), 'cancelpick'));
		el.table.appendChild(pr);
	}
	if (keepLog) log.scrollTop = log.scrollHeight;
	hand.scrollLeft = handX;
	for (const p of V.players) for (const k of [...p.active, ...p.bench]) if (k) { ui.prevDmg.set(k.uid, k.dmg); FX.cards.set(k.uid, k.id); FX.energy.set(k.uid, (k.energy || []).length); }
	FX.lunge = new Set(); FX.ko = new Set(); FX.hit = new Map(); FX.on = false;   // (shown: a redraw of the same table does not play them again)
	bg && bg.set(V.over ? { new_colour: BGC.GOLD, special_colour: BGC.GREEN, contrast: 2 } : V.current === you && V.phase === 'main' ? { new_colour: hex('4f8fe8'), special_colour: hex('bfe3ff'), tertiary_colour: [0.16, 0.3, 0.6, 1], contrast: 1.3 } : { new_colour: hex('6f9df0'), special_colour: hex('b9c8ff'), tertiary_colour: [0.2, 0.3, 0.62, 1], contrast: 1.2 });
	if (pad) pad.refresh();
}

// ------------------------------------------------------------------ choosing things on the table
function pick(prompt, locs, cb, extra = {}) {
	if (!locs.length) { toast('There is nothing to choose for that.'); return; }
	// singles: an attack with only one possible target hits it, with nothing to choose (owner, 2026-11-18: "dont ask me to pick a
	// target for my attack because there is only one possibility")
	if (extra.attack && V && V.singles && locs.length === 1) { closeAll(); cb(locs[0]); return; }
	closeAll();
	ui.pick = { prompt, keys: new Set(locs.map(keyOf)), cb: loc => { ui.pick = null; cb(loc); }, ...extra };
	render();
}
function cancelPick() { if (ui.pick && !ui.pick.auto) { ui.pick = null; render(); } }
/** Was this press a finger? (A tap's click carries pointerType 'touch'; a keyboard's or a controller's has none.) */
const byFinger = ev => !!ev && ev.pointerType === 'touch';
function onPoke(loc, ev) {
	if (staging() && loc.seat === YOU()) {   // setup: a Pokémon I placed goes back to my hand
		if (performance.now() - dragEnd < 350) return;
		// (a press reads it, like one in the hand; it goes back by being dragged to the hand, or by the button under the card)
		const i = ui.setup[loc.zone][loc.idx], me = V.players[YOU()];
		// (on a touch screen a finger drags it back: the button is for a keyboard, a controller or a mouse. Owner, 2026-11-18, "yes to all")
		if (i != null) { const c = card(me.hand[i]); inspect(c, null, null, byFinger(ev) ? [] : [['Take back into my hand', () => { closeAll(); unstage(i); play('cardSlide1'); render(); }, '', 'stage:back']], printOf(YOU(), c.id)); }
		return;
	}
	if (performance.now() - dragEnd < 350) return;   // (the press that ended a drag)
	if (ui.pick) { if (ui.pick.keys.has(keyOf(loc))) { play('cardSlide1'); ui.pick.cb(loc); if (!ui.pick) render(); } else if (at(V, loc)) inspect(def(at(V, loc)), at(V, loc), loc); return; }
	const k = at(V, loc); if (!k) return;
	pokeMenu(loc);
}
const isBasic = c => (c.kind === 'pokemon' ? c.stage === 0 : !!c.fossil);
function playable(c, me) {
	if (V.phase === 'setup') return isBasic(c);
	if (isBasic(c)) return me.active.includes(null) || me.bench.includes(null);
	if (c.kind === 'pokemon') return [...me.active, ...me.bench].some(k => k && evolvesInto(k, c));
	return c.kind !== 'supporter' || (!me.flags.supporter && !me.noSupporter);
}
/** May this card be played onto that Pokémon to evolve it? (Eevee ex takes any card that evolves from Eevee.) */
function evolvesInto(k, c) { const d = def(k), ab = d.ability; return d.name === c.evolvesFrom || !!(ab && ab.fx.k === 'evolveAs' && ab.fx.name === c.evolvesFrom); }
const emptySlots = (me, you) => [...[...me.active.keys()].filter(n => !me.active[n]).map(idx => ({ seat: you, zone: 'active', idx })), ...me.bench.map((k, idx) => (k ? null : { seat: you, zone: 'bench', idx })).filter(Boolean)];
function pickBasicSlot(i, c) { const you = YOU(); pick(`Play ${c.name}: choose an empty slot`, emptySlots(V.players[you], you), to => send({ t: 'playBasic', hand: i, to: { zone: to.zone, idx: to.idx } })); }
function pickEvolve(i, c) { const you = YOU(); pick(`Evolve into ${c.name}: choose your ${c.evolvesFrom}`, locsOf(V, you).filter(l => evolvesInto(at(V, l), c)), l => send({ t: 'evolve', hand: i, at: l })); }
function onHand(i, ev) {
	const you = YOU(), me = you != null ? V.players[you] : null;
	if (!me || !me.hand) return;
	if (performance.now() - dragEnd < 350) return;   // (the press that ended a drag)
	const c = card(me.hand[i]);
	const acts = [];
	// Setup: a press only READS the card (owner, 2026-11-18: "tapping the card puts it in a active slots it should only be
	// drag and tapping a card should let me read it more up close"). It is placed by dragging it to a slot. The buttons
	// under the card do the same for a keyboard or a gamepad, which cannot drag.
	// On a touch screen these buttons are left off: a finger drags (owner, 2026-11-18, "yes to all" to hiding them there).
	if (playing() && V.phase === 'setup' && !me.setup && isBasic(c) && !byFinger(ev)) {
		const s = ui.setup, put = zone => () => { closeAll(); placeStaged(i, zone, s[zone].length); play('cardSlide1'); render(); };
		acts.push([V.singles ? 'Put in my Active slot' : 'Put in an Active slot', put('active'), s.active.length >= me.active.length ? (V.singles ? 'it is taken' : 'both are taken') : '', 'stage:active']);
		acts.push(['Put on my Bench', put('bench'), s.bench.length >= me.bench.length ? 'it is full' : '', 'stage:bench']);
	}
	if (myTurn()) {
		if (isBasic(c)) acts.push(['Play', () => pickBasicSlot(i, c)]);
		else if (c.kind === 'pokemon') acts.push(['Evolve', () => pickEvolve(i, c)]);
		else acts.push(['Play', () => playTrainer(i, c)]);
	}
	inspect(c, null, null, acts, printOf(YOU(), c.id));
}
function playTrainer(i, c, pen) {   // (pen: the effect Penny found, used as her effect; it is not a card in the hand)
	const you = YOU(), f = c.fx, go = args => send(pen ? { t: 'trainer', penny: true, args } : { t: 'trainer', hand: i, args });
	const own = locsOf(V, you), named = l => !f.names || f.names.includes(def(at(V, l)).name);
	if (f.k === 'healOne') pick(`${c.name}: choose one of your ${f.cure ? 'damaged or afflicted' : 'damaged'} ${f.stage ? 'Stage ' + f.stage + ' ' : ''}Pokémon`, own.filter(l => (at(V, l).dmg > 0 || (f.cure && at(V, l).status.length)) && (!f.type || ofType(def(at(V, l)), f.type)) && (!f.names || f.names.includes(def(at(V, l)).name)) && (f.stage == null || def(at(V, l)).stage === f.stage)), l => go({ at: l }));
	else if (f.k === 'healCureActive') pick(`${c.name}: choose one of your Pokémon in an Active slot`, own.filter(l => l.zone === 'active' && (at(V, l).dmg > 0 || at(V, l).status.length)), l => go({ at: l }));
	else if (f.k === 'healAllNamed') pick(`${c.name}: choose your damaged ${f.names.join(' or ')}`, own.filter(l => named(l) && at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'returnDamaged') pick(`${c.name}: choose one of your damaged ${f.type} Pokémon`, own.filter(l => ofType(def(at(V, l)), f.type) && at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'moveDamage') pick(`${c.name}: choose your damaged ${f.names.join(' or ')}`, own.filter(l => named(l) && at(V, l).dmg > 0), l => pick(`${c.name}: choose the opposing Active Pokémon that takes the damage`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])), t => go({ at: l, target: t })));
	else if (f.k === 'rareCandy') pick(`${c.name}: choose one of your Basic Pokémon`, own.filter(l => at(V, l).cards.length === 1 && def(at(V, l)).stage === 0 && at(V, l).turnPlayed !== V.turn), l => {
		const me = V.players[you], base = def(at(V, l)).name, grid = h('div', 'pe-grid');
		me.hand.forEach((id, n) => { const d = card(id); if (n === i || d.kind !== 'pokemon' || d.stage !== 2 || !CARDS.some(m => m.name === d.evolvesFrom && m.evolvesFrom === base)) return; const e = handCard(d, null); e.classList.add('small'); e.dataset.k = 'rc' + n; e.addEventListener('click', () => { closeAll(); go({ at: l, pick: n }); }); grid.appendChild(e); });
		if (!grid.children.length) { toast(`You have no Stage 2 card in your hand that evolves from ${base}.`); return; }
		modal(grid, { title: `${c.name}: evolve ${base} into…` });
	});
	else if (f.k === 'flipDiscardEnergy') pick(`${c.name}: choose an opposing Active Pokémon`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])), l => go({ target: l }));
	else if (f.k === 'flipAttach') pick(`${c.name}: choose one of your ${f.type} Pokémon`, own.filter(l => ofType(def(at(V, l)), f.type)), l => go({ at: l }));
	else if (f.k === 'returnActive' || f.k === 'gatherEnergy') pick(`${c.name}: choose your ${f.names.join(' or ')} in an Active slot`, own.filter(l => l.zone === 'active' && named(l)), l => go({ at: l }));
	else if (f.k === 'attachNamed') pick(`${c.name}: choose your ${f.names.join(' or ')}`, own.filter(named), l => go({ at: l }));
	else if (f.k === 'driveOff') pick(`${c.name}: choose an opposing Active Pokémon (its owner picks the replacement)`, oppSeats(V).filter(s => V.players[s].bench.some(Boolean)).flatMap(s => locsOf(V, s, ['active'])).filter(l => !f.basic || def(at(V, l)).stage === 0), l => go({ target: l }));
	else if (c.kind === 'tool') pick(`${c.name}: choose one of your Pokémon with room for a Pokémon Tool`, own.filter(l => { const k2 = at(V, l), ab2 = def(k2).ability; return !k2.tool || (!k2.tool2 && ab2 && ab2.fx.k === 'dualTools'); }), l => go({ at: l }));
	else if (f.k === 'attachDiscard' && f.ub) pick(`${c.name}: choose one of your Ultra Beasts`, own.filter(l => def(at(V, l)).ub), l => go({ at: l }));
	else if (f.k === 'attachDiscard') pick(`${c.name}: choose your ${f.names.join(' or ')}`, own.filter(named), l => go({ at: l }));
	else if (f.k === 'swapPokemon') {
		const me = V.players[you], grid = h('div', 'pe-grid');
		me.hand.forEach((id, n) => { const d = card(id); if (n === i || d.kind !== 'pokemon') return; const e = handCard(d, null); e.classList.add('small'); e.dataset.k = 'sw' + n; e.addEventListener('click', () => { closeAll(); go({ pick: n }); }); grid.appendChild(e); });
		if (!grid.children.length) { toast('You have no Pokémon in your hand to switch.'); return; }
		modal(grid, { title: `${c.name}: which Pokémon goes back into your deck?` });
	}
	else if (f.k === 'pullDamaged') pick(`${c.name}: choose an opponent's ${f.any ? '' : 'damaged '}Benched Pokémon`, oppSeats(V).flatMap(s => locsOf(V, s, ['bench'])).filter(l => f.any || at(V, l).dmg > 0),
		b => pick(`${c.name}: choose which of that player's Active Pokémon it trades places with`, locsOf(V, b.seat, ['active']), l => go({ target: l, bench: b.idx })));
	else if (f.k === 'moveEnergyAny') pick(`${c.name}: choose the Benched Pokémon to take an Energy from`, locsOf(V, you, ['bench']).filter(l => at(V, l).energy.length),
		b => pick(`${c.name}: choose your Pokémon in an Active slot to give it to`, locsOf(V, you, ['active']), l => {
			const es = at(V, b).energy; if (new Set(es).size < 2) { go({ bench: b.idx, at: l, energy: 0 }); return; }
			const list = h('div', 'pe-list'); [...new Set(es)].forEach(t => { const o = h('button', 'pe-opt', `${en(t)} ${t} Energy`); o.type = 'button'; o.dataset.k = 'me' + t; o.addEventListener('click', () => { closeAll(); go({ bench: b.idx, at: l, energy: es.indexOf(t) }); }); list.appendChild(o); });
			modal(list, { title: `${c.name}: which Energy?` });
		}));
	else if (f.k === 'moveEnergyTypes') pick(`${c.name}: choose the Benched Pokémon that gives a ${f.types.join(', ')} Energy`, own.filter(l => l.zone === 'bench' && at(V, l).energy.some(e => f.types.includes(e))), b => {
		const types = f.types.filter(t => at(V, b).energy.includes(t)), to = t => pick(`${c.name}: choose your Pokémon in an Active slot that takes the ${t} Energy`, own.filter(l => l.zone === 'active'), l => go({ bench: b.idx, type: t, at: l }));
		if (types.length === 1) { to(types[0]); return; }
		closeAll(); const list = h('div', 'pe-list'); for (const t of types) { const o = h('button', 'pe-opt', `${en(t)} ${esc(t)} Energy`); o.type = 'button'; o.dataset.k = 'et' + t; o.addEventListener('click', () => { closeAll(); to(t); }); list.appendChild(o); } modal(list, { title: `${c.name}: which Energy?` });
	});
	else if (f.k === 'discardOppEnergy') pick(`${c.name}: choose an opposing Active Pokémon with ${f.type} Energy`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])).filter(l => at(V, l).energy.includes(f.type)), l => go({ target: l }));
	else if (f.k === 'switchDamaged') pick(`${c.name}: choose your damaged Pokémon in an Active slot`, own.filter(l => l.zone === 'active' && at(V, l).dmg > 0), l => pick(`${c.name}: choose the Benched Pokémon that comes up`, own.filter(b => b.zone === 'bench'), b => go({ at: l, bench: b.idx })));
	else if (f.k === 'healActiveReturn') pick(`${c.name}: choose your damaged Pokémon in an Active slot`, own.filter(l => l.zone === 'active' && at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'healForEnergy') pick(`${c.name}: choose your damaged ${f.type} Pokémon with ${f.need} or more ${f.type} Energy`, own.filter(l => ofType(def(at(V, l)), f.type) && at(V, l).dmg > 0 && at(V, l).energy.filter(x => x === f.type).length >= f.need), l => go({ at: l }));
	else if (f.k === 'juggler') pick(`${c.name}: choose your Pokémon in an Active slot that takes your Bench's Energy`, own.filter(l => l.zone === 'active'), l => go({ at: l }));
	else if (f.k === 'discardOppRandomEnergy') pick(`${c.name}: choose an opposing Active Pokémon that has Energy`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])).filter(l => at(V, l).energy.length), l => go({ target: l }));
	else if (f.k === 'evolveFromDeckType' && f.maxHp) pick(`${c.name}: choose one of your ${f.type} Pokémon with ${f.maxHp} HP or less`, own.filter(l => ofType(def(at(V, l)), f.type) && at(V, l).hp <= f.maxHp), l => go({ at: l }));
	else if (f.k === 'evolveFromDeckType') pick(`${c.name}: choose one of your ${f.type} Pokémon (not one played this turn)`, own.filter(l => ofType(def(at(V, l)), f.type) && at(V, l).turnPlayed !== V.turn), l => go({ at: l }));
	else if (f.k === 'coinAttachBenchType') pick(`${c.name}: choose your Benched ${f.type} Pokémon that takes the Energy on heads`, own.filter(l => l.zone === 'bench' && ofType(def(at(V, l)), f.type)), l => go({ bench: l.idx }));
	else if (f.k === 'coinsDiscardEnergy') pick(`${c.name}: choose an opposing Active Pokémon that has Energy`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])).filter(l => at(V, l).energy.length), l => go({ target: l }));
	else if (f.k === 'attachDiscardActive') pick(`${c.name}: choose one of your ${f.type} Pokémon in an Active slot`, own.filter(l => l.zone === 'active' && ofType(def(at(V, l)), f.type)), l => go({ at: l }));
	else if (f.k === 'silver' || f.k === 'copycat' || f.k === 'discardAbilityEnergy' || f.k === 'oppDiscardTo' || f.k === 'thievingMachine' || f.k === 'gooRetreat' || f.k === 'bossBench' || (f.k === 'peekOrder' && f.opp)) chooseOpponent(`${c.name}: choose an opponent`, s => go({ opp: s }));
	else if (f.k === 'healNamedCure') pick(`${c.name}: choose your ${f.names.join(' or ')}`, own.filter(named), l => go({ at: l }));
	else if (f.k === 'moveAllToNamed') pick(`${c.name}: choose the Benched ${f.type} Pokémon whose ${f.type} Energy moves`, locsOf(V, you, ['bench']).filter(l => ofType(def(at(V, l)), f.type) && at(V, l).energy.includes(f.type)), b => go({ bench: b.idx }));
	else if (f.k === 'healFlips') pick(`${c.name}: choose one of your damaged Pokémon`, own.filter(l => at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'healForRandomEnergy') pick(`${c.name}: choose one of your damaged Pokémon that has Energy`, own.filter(l => at(V, l).dmg > 0 && at(V, l).energy.length), l => go({ at: l }));
	else if (f.k === 'cureActive') pick(`${c.name}: choose your Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => at(V, l).status.length), l => go({ slot: l.idx }));
	else if (f.k === 'attachZoneNamedN') pick(`${c.name}: choose your ${f.names.join(' or ')}`, own.filter(l => f.names.includes(def(at(V, l)).name)), l => go({ at: l }));
	else if (f.k === 'switchIfTypes') pick(`${c.name}: choose your Pokémon in an Active slot`, locsOf(V, you, ['active']), l => pick(`${c.name}: choose the Benched Pokémon that comes up`, locsOf(V, you, ['bench']), b => go({ slot: l.idx, bench: b.idx })));
	else if (f.k === 'masterPlan') pick(`${c.name}: choose an opposing Active Pokémon`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])), l => go({ target: l }));
	else if (f.k === 'moveOppEnergy') pick(`${c.name}: choose an opponent's Benched Pokémon that has Energy`, oppSeats(V).flatMap(s => locsOf(V, s, ['bench'])).filter(l => at(V, l).energy.length), b => pick(`${c.name}: choose which of that player's Active Pokémon takes the Energy`, locsOf(V, b.seat, ['active']), l => go({ target: l, bench: b.idx })));
	else if (f.k === 'switchActiveStage') pick(`${c.name}: choose your Stage ${f.stage} Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => def(at(V, l)).stage === f.stage), l => pick(`${c.name}: choose the Benched Pokémon that comes up`, locsOf(V, you, ['bench']), b => go({ slot: l.idx, bench: b.idx })));
	else if (f.k === 'attachZoneStage') pick(`${c.name}: choose one of your Stage ${f.stage} Pokémon`, own.filter(l => def(at(V, l)).stage === f.stage), l => go({ at: l }));
	else if (f.k === 'shuffleFuture') pick(`${c.name}: choose one of your Future Pokémon`, own.filter(l => def(at(V, l)).future), l => go({ at: l }));
	else if (f.k === 'returnTyped') pick(`${c.name}: choose one of your ${f.type} Pokémon that is not a Pokémon ex`, own.filter(l => ofType(def(at(V, l)), f.type) && !def(at(V, l)).ex), l => go({ at: l }));
	else if (f.k === 'fieldBlower') {
		const tools = V.players.filter(q => !q.eliminated).flatMap(q => locsOf(V, q.seat)).filter(l => at(V, l).tool), pickTool = () => pick(`${c.name}: choose the Pokémon whose Pokémon Tool is discarded`, tools, l => {
			const k2 = at(V, l); if (!k2.tool2) { go({ target: l }); return; }
			closeAll(); const list2 = h('div', 'pe-list');   // it holds two: which one?
			[k2.tool, k2.tool2].forEach((id, n) => { const o = h('button', 'pe-opt', esc(card(id).name)); o.type = 'button'; o.dataset.k = 'tl' + n; o.addEventListener('click', () => { closeAll(); go({ target: l, which: n }); }); list2.appendChild(o); });
			modal(list2, { title: `${c.name}: discard which Pokémon Tool?` });
		});
		if (V.stadium && tools.length) {
			closeAll(); const list = h('div', 'pe-list');
			[[`Discard a Pokémon Tool from a Pokémon`, pickTool], [`Discard the Stadium ${card(V.stadium.id).name}`, () => go({ stadium: true })]].forEach(([t, fn], n) => { const o = h('button', 'pe-opt', esc(t)); o.type = 'button'; o.dataset.k = 'one' + n; o.addEventListener('click', () => { closeAll(); fn(); }); list.appendChild(o); });
			modal(list, { title: `${c.name}: choose 1` });
		} else if (V.stadium) go({ stadium: true }); else pickTool();
	}
	else if (f.k === 'chooseOne') {
		closeAll(); const list = h('div', 'pe-list');
		[`Your Pokémon that evolve from ${f.from} do +${f.boost} damage this turn`, `Heal ${f.heal} damage from each of your Pokémon that evolves from ${f.from}`].forEach((t, n) => { const o = h('button', 'pe-opt', esc(t)); o.type = 'button'; o.dataset.k = 'one' + n; o.addEventListener('click', () => { closeAll(); go({ pick: n }); }); list.appendChild(o); });
		modal(list, { title: `${c.name}: choose 1` });
	}
	else if (f.k === 'revealHand' || f.k === 'redCard' || f.k === 'mars' || f.k === 'revealSupporters' || f.k === 'penny') chooseOpponent(`${c.name}: choose an opponent`, s => go({ opp: s }));
	else if (f.k === 'fluteBench') chooseOpponent(`${c.name}: choose an opponent`, s => {
		const q = V.players[s], grid = h('div', 'pe-grid'), full = !q.bench.includes(null);
		q.discard.forEach((id, n) => { const d = card(id); if (d.kind !== 'pokemon' || d.stage !== 0) return; const e = handCard(d, null); e.classList.add('small'); e.dataset.k = 'fl' + n; e.disabled = full; e.addEventListener('click', () => { closeAll(); go({ opp: s, pick: n }); }); grid.appendChild(e); });
		if (!grid.children.length) grid.appendChild(h('div', 'pe-note', `${esc(q.name)} has no Basic Pokémon in their discard pile.`));
		else if (full) grid.prepend(h('div', 'pe-note', `${esc(q.name)}'s Bench is full.`));
		modal(grid, { title: `${c.name}: which of ${q.name}'s Basic Pokémon comes back?` });
	});
	else { closeAll(); go({}); }
}
function chooseOpponent(title, cb) {
	const seats = oppSeats(V);
	if (seats.length === 1) { closeAll(); cb(seats[0]); return; }
	closeAll();
	const list = h('div', 'pe-list');
	for (const s of seats) { const p = V.players[s]; const o = h('button', 'pe-opt', `${esc(p.name)} <span class="why">${p.handCount} in hand · ${p.points} point${p.points === 1 ? '' : 's'}</span>`); o.type = 'button'; o.addEventListener('click', () => { closeAll(); cb(s); }); list.appendChild(o); }
	modal(list, { title });
}
/** Attach this turn's Energy to one of my Pokémon (asking first for a target, for an Ability that needs one). */
function attachTo(l) {
	const e = V.players[YOU()].zone.cur, ab = def(at(V, l)).ability, foes = oppSeats(V).flatMap(s => locsOf(V, s, ['active']));
	if (ab && ab.fx.k === 'attachPing' && ab.fx.type === e && foes.length > 1) pick(`${ab.name}: choose the opposing Active Pokémon that takes ${ab.fx.n} damage`, foes, t => send({ t: 'attach', at: l, target: t }));
	else send({ t: 'attach', at: l });
}
function pickAttach() {
	const you = YOU();
	const e = V.players[you].zone.cur;
	pick(`Attach your ${e} Energy: choose one of your Pokémon`, locsOf(V, you).filter(l => !def(at(V, l)).fossil), l => attachTo(l));
}
function describeCmd(k, cmd) {
	const a = def(k).attacks[cmd.attack];
	return a.name + (cmd.target ? ' → ' + pokeLabel(V, cmd.target) : '');
}
function chooseAttack(slot, i) {
	const you = YOU(), me = V.players[you], k = me.active[slot], a = def(k).attacks[i];
	const cmd = { attack: i, target: null, args: {} }, steps = [];
	const has = x => a.fx.some(f => f.k === x), bench = locsOf(V, you, ['bench']);
	if (a.target !== 'none') steps.push(next => pick(`${a.name} (${E.typeOf(V.rules || 1, a)}): choose a target`, targetsOf(V, you, a), loc => { cmd.target = loc; next(); }, { attack: a }));
	if (has('pullThenHit')) steps.push(next => { const bl = cmd.target ? locsOf(V, cmd.target.seat, ['bench']) : []; if (bl.length > 1) pick(`${a.name}: choose the Benched Pokémon that is pulled into that Active slot`, bl, loc => { cmd.args.pull = loc.idx; next(); }); else next(); });
	if (has('switchSelf') && a.fx.find(f => f.k === 'switchSelf').may) { if (bench.length) steps.push(next => {   // "you may switch": stay, or choose who comes up
		closeAll(); const list = h('div', 'pe-list');
		const stay = h('button', 'pe-opt', 'Stay in the Active slot'); stay.type = 'button'; stay.dataset.k = 'stay'; stay.addEventListener('click', () => { closeAll(); next(); });
		const go2 = h('button', 'pe-opt', 'Switch with a Benched Pokémon'); go2.type = 'button'; go2.dataset.k = 'swap'; go2.addEventListener('click', () => pick(`${a.name}: choose the Benched Pokémon to switch in`, bench, loc => { cmd.args.bench = loc.idx; next(); }));
		list.append(stay, go2); modal(list, { title: `${a.name}: switch out afterwards?` });
	}); }
	else if (has('switchSelf')) { const st = a.fx.find(f => f.k === 'switchSelf').type, fit = bench.filter(l => !st || ofType(def(at(V, l)), st)); if (fit.length) steps.push(next => pick(`${a.name}: choose the Benched ${st ? st + ' ' : ''}Pokémon to switch in`, fit, loc => { cmd.args.bench = loc.idx; next(); })); else if (!st) { toast(`${a.name} needs a Benched Pokémon to switch with.`); return; } }
	if (has('ownAnyDamage')) steps.push(next => pick(`${a.name}: choose one of your Pokémon to take its damage`, locsOf(V, you), loc => { cmd.args.own = loc; next(); }));
	if (has('ownBenchDamage') && bench.length) steps.push(next => pick(`${a.name}: choose one of your Benched Pokémon to take its damage`, bench, loc => { cmd.args.bench = loc.idx; next(); }));
	const fxOf = x => a.fx.find(f => f.k === x), oppBench = oppSeats(V).flatMap(s => locsOf(V, s, ['bench']));
	if (has('alsoBench') && oppBench.filter(l => !fxOf('alsoBench').damaged || at(V, l).dmg > 0).length) steps.push(next => pick(`${a.name}: choose the Benched Pokémon that takes ${fxOf('alsoBench').n} damage`, oppBench.filter(l => !fxOf('alsoBench').damaged || at(V, l).dmg > 0), loc => { cmd.args.also = loc; next(); }));
	if (has('attachZoneEach') && bench.length > fxOf('attachZoneEach').n) { cmd.args.spread = []; for (let n = 0; n < fxOf('attachZoneEach').n; n++) steps.push(next => pick(`${a.name}: choose a Benched Pokémon to attach to (${n + 1} of ${fxOf('attachZoneEach').n})`, bench.filter(l => !cmd.args.spread.includes(l.idx)), loc => { cmd.args.spread.push(loc.idx); next(); })); }
	if (has('attachZoneNamed')) { const fit = locsOf(V, you).filter(l => fxOf('attachZoneNamed').names.includes(def(at(V, l)).name)); if (fit.length > 1) steps.push(next => pick(`${a.name}: choose your ${fxOf('attachZoneNamed').names.join(' or ')}`, fit, loc => { cmd.args.at = loc; next(); })); }
	{ const az = a.fx.find(f => f.k === 'attachZone' && f.to === 'bench'), fit = az ? bench.filter(l => !az.basic || def(at(V, l)).stage === 0) : []; if (fit.length > 1) steps.push(next => pick(`${a.name}: choose the Benched ${az.basic ? 'Basic ' : ''}Pokémon to attach to`, fit, loc => { cmd.args.bench = loc.idx; next(); })); }
	if (has('attachZoneTypes')) { const fit = bench.filter(l => def(at(V, l)).stage === 0); if (fit.length > 1) { cmd.args.spread = []; fxOf('attachZoneTypes').types.forEach(t => steps.push(next => pick(`${a.name}: choose the Benched Basic Pokémon that takes the ${t} Energy`, fit, loc => { cmd.args.spread.push(loc.idx); next(); }))); } }
	if (has('attachZoneSpread')) { const f = fxOf('attachZoneSpread'), fit = locsOf(V, you).filter(l => ofType(def(at(V, l)), f.type)); if (fit.length > 1) { cmd.args.spreadLocs = []; for (let n = 0; n < f.n; n++) steps.push(next => pick(`${a.name}: choose your ${f.type} Pokémon for a ${f.type} Energy (${n + 1} of ${f.n})`, fit, loc => { cmd.args.spreadLocs.push(loc); next(); })); } }
	if (has('coinAttachBench') && bench.length > 1) steps.push(next => pick(`${a.name}: choose the Benched Pokémon that takes the Energy on heads`, bench, loc => { cmd.args.bench = loc.idx; next(); }));
	if (a.fx.some(f => f.k === 'shuffleSelfIntoDeck' && f.may)) steps.push(next => {
		closeAll(); const list = h('div', 'pe-list');
		[['Stay in play', false, 'keep'], ['Shuffle this Pokémon into your deck', true, 'shuf']].forEach(([t, v2, key]) => { const o = h('button', 'pe-opt', t); o.type = 'button'; o.dataset.k = key; o.addEventListener('click', () => { if (v2) cmd.args.shuffle = true; closeAll(); next(); }); list.appendChild(o); });
		modal(list, { title: `${a.name}: afterwards?` });
	});
	if (has('healOwn')) { const fit = locsOf(V, you).filter(l => at(V, l).dmg > 0); if (fit.length > 1) steps.push(next => pick(`${a.name}: choose one of your Pokémon to heal`, fit, loc => { cmd.args.own = loc; next(); })); else if (fit.length) cmd.args.own = fit[0]; }
	if (has('extraEnergyAlsoBench') && oppBench.length > fxOf('extraEnergyAlsoBench').count) { cmd.args.alsoList = []; for (let n = 0; n < fxOf('extraEnergyAlsoBench').count; n++) steps.push(next => pick(`${a.name}: choose a Benched Pokémon for its extra damage, if it has the Energy (${n + 1} of ${fxOf('extraEnergyAlsoBench').count})`, oppBench.filter(l => !cmd.args.alsoList.some(x => keyOf(x) === keyOf(l))), loc => { cmd.args.alsoList.push(loc); next(); })); }
	if (has('chooseStatus')) steps.push(next => {
		closeAll(); const list = h('div', 'pe-list');
		for (const st of fxOf('chooseStatus').list) { const o = h('button', 'pe-opt', cap(st)); o.type = 'button'; o.dataset.k = 'st' + st; o.addEventListener('click', () => { cmd.args.status = st; closeAll(); next(); }); list.appendChild(o); }
		modal(list, { title: `${a.name}: which Special Condition?` });
	});
	if (has('discardHandCost')) { const f = fxOf('discardHandCost'); if (me.hand.length < f.n) { toast(`${a.name} needs ${f.n} card${f.n > 1 ? 's' : ''} in your hand to discard.`); return; } if (me.hand.length > f.n) steps.push(next => {   // exactly that many: tick, then Done
		closeAll(); const chosen = new Set(), grid = h('div', 'pe-grid'), done = btn('Done', 'blue', () => { cmd.args.cards = [...chosen]; closeAll(); next(); }, 'dhdone'); done.disabled = true;
		me.hand.forEach((id, n) => { const e = handCard(card(id), null); e.classList.add('small'); e.dataset.k = 'dh' + n; e.addEventListener('click', () => { if (chosen.has(n)) chosen.delete(n); else if (chosen.size < f.n) chosen.add(n); e.classList.toggle('playable', chosen.has(n)); done.disabled = chosen.size !== f.n; }); grid.appendChild(e); });
		const box = h('div', ''); box.append(grid, done); modal(box, { title: `${a.name}: choose ${f.n} card${f.n > 1 ? 's' : ''} in your hand to discard` });
	}); }
	if (has('healBench')) { const fit = bench.filter(l => at(V, l).dmg > 0); if (fit.length > 1) steps.push(next => pick(`${a.name}: choose the Benched Pokémon to heal`, fit, loc => { cmd.args.bench = loc.idx; next(); })); else if (fit.length) cmd.args.bench = fit[0].idx; }
	if (has('discardToolsBonus')) { const f = fxOf('discardToolsBonus'), tools = me.hand.map((id, n) => (card(id).kind === 'tool' ? n : -1)).filter(n => n >= 0); if (tools.length) steps.push(next => {   // up to that many: tick, then Done
		closeAll(); const chosen = new Set(), list = h('div', 'pe-list');
		for (const n of tools) { const o = h('button', 'pe-opt', esc(card(me.hand[n]).name)); o.type = 'button'; o.dataset.k = 'dt' + n; o.addEventListener('click', () => { if (chosen.has(n)) chosen.delete(n); else if (chosen.size < f.max) chosen.add(n); o.classList.toggle('on', chosen.has(n)); }); list.appendChild(o); }
		const box = h('div', ''); box.append(list, btn('Done', 'blue', () => { cmd.args.tools = [...chosen]; closeAll(); next(); }, 'dtdone'));
		modal(box, { title: `${a.name}: discard up to ${f.max} Pokémon Tool cards from your hand (${f.per} damage each)` });
	}); }
	if ((has('moveAllEnergyToBench') || has('moveEnergyToBench') || has('moveRandomEnergyToBench') || has('attachRandomType')) && bench.length > 1) steps.push(next => pick(`${a.name}: choose the Benched Pokémon that takes this Pokémon's Energy`, bench, loc => { cmd.args.bench = loc.idx; next(); }));
	if (has('alsoAny')) steps.push(next => { const pool = cmd.target ? locsOf(V, cmd.target.seat).filter(l => !(l.zone === cmd.target.zone && l.idx === cmd.target.idx)) : []; if (pool.length > 1) pick(`${a.name}: choose the second Pokémon`, pool, loc => { cmd.args.also = loc; next(); }); else next(); });
	if (has('moveAllEnergySpread') && bench.length > 1) { cmd.args.spread = []; k.energy.forEach((t, n) => steps.push(next => pick(`${a.name}: choose the Benched Pokémon that takes the ${t} Energy (${n + 1} of ${k.energy.length})`, bench, loc => { cmd.args.spread[n] = loc.idx; next(); }))); }
	if (has('moveEnergyFreely')) steps.push(next => {   // Energy Blender: press an Energy, then the Pokémon it goes to; Done when finished
		const mine2 = locsOf(V, you).map(l => ({ l, name: def(at(V, l)).name, energy: at(V, l).energy.slice() })), moves = [];
		const draw2 = sel => {
			closeAll(); const box = h('div', ''), list = h('div', 'pe-list');
			mine2.forEach((m2, n) => {
				const row = h('div', 'pe-opt', `<b>${esc(m2.name)}</b> <span class="why">${m2.l.zone === 'active' ? 'Active ' + SLOT[m2.l.idx] : 'Bench ' + (m2.l.idx + 1)}</span> `);
				if (sel && sel.n !== n) { const to = btn('Move it here', 'green', () => { mine2[sel.n].energy.splice(mine2[sel.n].energy.indexOf(sel.t), 1); m2.energy.push(sel.t); moves.push([mine2[sel.n].l, sel.t, m2.l]); draw2(null); }, 'ebto' + n); row.appendChild(to); }
				else if (!sel) m2.energy.forEach((t, i) => { const eb = h('button', 'pe-chip', en(t)); eb.type = 'button'; eb.dataset.k = 'eb' + n + '_' + i; eb.setAttribute('aria-label', `${t} Energy on ${m2.name}`); eb.addEventListener('click', () => draw2({ n, t })); row.appendChild(eb); });
				list.appendChild(row);
			});
			box.append(list, btn(sel ? 'Cancel' : 'Done', sel ? 'grey' : 'blue', () => { if (sel) draw2(null); else { cmd.args.moves = moves; closeAll(); next(); } }, 'ebdone'));
			modal(box, { title: sel ? `${a.name}: where does the ${sel.t} Energy go?` : `${a.name}: move Energy among your Pokémon (${moves.length} moved)` });
		};
		draw2(null);
	});
	if (has('discardBenchBonus')) { const f = fxOf('discardBenchBonus'), fit = bench.filter(l => ofType(def(at(V, l)), f.type) && (!f.basic || def(at(V, l)).stage === 0)); if (fit.length) steps.push(next => {   // any number of them: tick, then Done
		closeAll(); const chosen = new Set(), list = h('div', 'pe-list');
		for (const l of fit) { const o = h('button', 'pe-opt', `${esc(def(at(V, l)).name)} <span class="why">Bench ${l.idx + 1}</span>`); o.type = 'button'; o.dataset.k = 'db' + l.idx; o.addEventListener('click', () => { if (chosen.has(l.idx)) chosen.delete(l.idx); else { if (f.max === 1) { chosen.clear(); list.querySelectorAll('.on').forEach(x => x.classList.remove('on')); } chosen.add(l.idx); } o.classList.toggle('on', chosen.has(l.idx)); }); list.appendChild(o); }
		const box = h('div', ''); box.append(list, btn('Done', 'blue', () => { cmd.args.discard = [...chosen]; closeAll(); next(); }, 'dbdone'));
		modal(box, { title: `${a.name}: discard any of your Benched ${f.type} Pokémon (+${f.bonus} each)` });
	}); }
	const cf = a.fx.find(f => f.k === 'copyAttack');
	if (cf && cf.own && !bench.some(l => !def(at(V, l)).ex)) { toast(`${a.name} needs a Benched Pokémon that is not a Pokémon ex.`); return; }
	if (cf) steps.push(next => pick(cf.own ? `${a.name}: choose one of your Benched Pokémon (not a Pokémon ex) whose attack to copy` : `${a.name}: choose an opposing ${cf.active ? 'Active ' : ''}Pokémon whose attack to copy`, cf.own ? bench.filter(l => !def(at(V, l)).ex) : oppSeats(V).flatMap(s => locsOf(V, s, cf.active ? ['active'] : ['active', 'bench'])), loc => {
		const list = h('div', 'pe-list');
		def(at(V, loc)).attacks.forEach((ca, n) => { const o = h('button', 'pe-opt', `${esc(ca.name)} ${ty(ca.combatType)} <span class="d">${ca.damage || ''}</span>`); o.type = 'button'; const ok = !ca.fx.some(f => f.k === 'copyAttack') && (cf.free || E.canPay(k.provides || k.energy, E.lessCost(ca.cost, k.less || 0))); o.disabled = !ok; if (!ok) o.insertAdjacentHTML('beforeend', '<span class="why">not enough Energy</span>'); o.addEventListener('click', () => { closeAll(); cmd.args.from = loc; cmd.args.attack = n; next(); }); list.appendChild(o); });
		modal(list, { title: `Copy which attack of ${def(at(V, loc)).name}?` });
	}));
	let n = 0;
	const next = () => {
		if (n < steps.length) { steps[n++](next); return; }
		ui.cmds[slot] = { uid: k.uid, cmd, text: describeCmd(k, cmd) }; play('cardSlide2'); closeAll();
		// singles: one Active Pokémon, so choosing its attack is the whole turn's command: it is carried out now, and the turn
		// ends (owner, 2026-11-18: "the attack should hit the 1 target right away and end the turn")
		if (V.singles) { sendCommands(); return; }
		render();
	};
	closeAll(); next();
}
const STADIUM_USE = ['stadiumCoinPokemon', 'stadiumBasicToHand', 'stadiumSwapBasic', 'stadiumSwapTool', 'stadiumReroll', 'stadiumCoinsDraw', 'stadiumCoinDraw'];   // Stadiums with a Use button
/** Area Zero: choose the Basic Pokémon in hand that goes into the deck. */
function stadiumSwap(sc) {
	const me = V.players[YOU()], grid = h('div', 'pe-grid');
	const any = sc.fx.k === 'stadiumSwapTool';   // (Kid's Room takes any card; Area Zero a Basic Pokémon)
	me.hand.forEach((id, n) => { const cd = card(id); if (!any && (cd.kind !== 'pokemon' || cd.stage !== 0)) return; const e = handCard(cd, null); e.classList.add('small'); e.dataset.k = 'sw' + n; e.addEventListener('click', () => { closeAll(); send({ t: 'stadium', hand: n }); }); grid.appendChild(e); });
	if (!grid.children.length) { toast(any ? 'You have no card in your hand.' : 'You have no Basic Pokémon in your hand.'); return; }
	modal(grid, { title: any ? `${sc.name}: switch which card for a random Pokémon Tool from your deck?` : `${sc.name}: shuffle which Basic Pokémon into your deck?` });
}
/** The names of a Pokémon's Tools (two on a Pokémon that may hold two). */
const toolNames = k => [k.tool, k.tool2].filter(Boolean).map(id => card(id).name).join(' + ');
function useAbility(loc) {
	const you = YOU(), k = at(V, loc), ab = def(k).ability, f = ab.fx, go = args => send({ t: 'ability', at: loc, args });
	const oa = oppSeats(V).flatMap(s => locsOf(V, s, ['active']));
	if (f.k === 'ping') pick(`${ab.name}: choose ${f.zone === 'active' ? 'an opposing Active' : 'any opposing'} Pokémon`, f.zone === 'active' ? oa : oppSeats(V).flatMap(s => locsOf(V, s)), l => go({ target: l }));
	else if (f.k === 'attachZoneAnyType') pick(`${ab.name}: choose one of your ${f.type} Pokémon`, locsOf(V, you).filter(l => ofType(def(at(V, l)), f.type)), l => go({ at: l }));
	else if (f.k === 'peekAny') {
		const list = h('div', 'pe-list');
		for (const q of V.players) { if (q.eliminated) continue; const o = h('button', 'pe-opt', `${esc(q.name)}${q.seat === you ? ' (you)' : ''} <span class="why">${q.deck} cards in deck</span>`); o.type = 'button'; o.dataset.k = 'pk' + q.seat; o.addEventListener('click', () => { closeAll(); go({ seat: q.seat }); }); list.appendChild(o); }
		modal(list, { title: `${ab.name}: whose deck?` });
	}
	else if (f.k === 'coinSleep' || f.k === 'poisonActive' || f.k === 'coinPoison') pick(`${ab.name}: choose an opposing Active Pokémon`, oa, l => go({ target: l }));
	else if (f.k === 'healActive') pick(`${ab.name}: choose one of your damaged Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'driveOff') pick(`${ab.name}: choose an opposing Active ${f.basic ? 'Basic ' : ''}Pokémon`, oa.filter(l => V.players[l.seat].bench.some(Boolean) && (!f.basic || def(at(V, l)).stage === 0)), l => go({ target: l }));
	else if (f.k === 'pullBenchBasic') pick(`${ab.name}: choose the opposing Active Pokémon that leaves`, oa, l => pick(`${ab.name}: choose that player's Benched Basic Pokémon to bring up`, locsOf(V, l.seat, ['bench']).filter(b => def(at(V, b)).stage === 0), b => go({ target: l, bench: b.idx })));
	else if (f.k === 'attachZoneActiveType') pick(`${ab.name}: choose one of your ${f.type} Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => ofType(def(at(V, l)), f.type)), l => go({ at: l }));
	else if (f.k === 'gatherFrom') pick(`${ab.name}: choose the Benched ${f.type} Pokémon whose ${f.type} Energy moves`, locsOf(V, you, ['bench']).filter(l => ofType(def(at(V, l)), f.type) && at(V, l).energy.includes(f.type)),
		b => pick(`${ab.name}: choose your Pokémon in an Active slot to give it to`, locsOf(V, you, ['active']), l => go({ bench: b.idx, at: l })));
	else if (f.k === 'coinPull') pick(`${ab.name}: choose an opponent's Benched Pokémon to bring up on heads`, oppSeats(V).flatMap(s => locsOf(V, s, ['bench'])), b => pick(`${ab.name}: choose which of that player's Active Pokémon it replaces`, locsOf(V, b.seat, ['active']), l => go({ target: l, bench: b.idx })));
	else if (f.k === 'millOpp' || f.k === 'portrait') chooseOpponent(`${ab.name}: choose an opponent`, s => go({ opp: s }));
	else if (f.k === 'switchActiveType') pick(`${ab.name}: choose your ${f.type} Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => ofType(def(at(V, l)), f.type)), l => pick(`${ab.name}: choose the Benched Pokémon that comes up`, locsOf(V, you, ['bench']), b => go({ slot: l.idx, bench: b.idx })));
	else if (f.k === 'toolsThenDiscardSelf') pick(`${ab.name}: choose an opposing Active Pokémon with a Pokémon Tool (${def(k).name} is then discarded)`, oa.filter(l => at(V, l).tool), l => go({ target: l }));
	else if (f.k === 'healExForEnergy') pick(`${ab.name}: choose your damaged Pokémon ex that has Energy`, locsOf(V, you).filter(l => def(at(V, l)).ex && at(V, l).dmg > 0 && at(V, l).energy.length), l => go({ at: l }));
	else if (f.k === 'statusActive') pick(`${ab.name}: choose an opposing Active Pokémon`, oa, l => go({ target: l }));
	else if (f.k === 'healAny') pick(`${ab.name}: choose one of your damaged Pokémon`, locsOf(V, you).filter(l => at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'pullDamaged') pick(`${ab.name}: choose an opponent's Benched Pokémon that has damage on it`, oppSeats(V).flatMap(s => locsOf(V, s, ['bench'])).filter(l => at(V, l).dmg > 0), b => pick(`${ab.name}: choose which of that player's Active Pokémon it replaces`, locsOf(V, b.seat, ['active']), l => go({ target: l, bench: b.idx })));
	else if (f.k === 'ubSwap') pick(`${ab.name}: choose your Ultra Beast in an Active slot`, locsOf(V, you, ['active']).filter(l => def(at(V, l)).ub), l => pick(`${ab.name}: choose your Benched Ultra Beast to bring up`, locsOf(V, you, ['bench']).filter(b => def(at(V, b)).ub), b => go({ slot: l.idx, bench: b.idx })));
	else if (f.k === 'benchSwap') pick(`${ab.name}: choose your Pokémon in an Active slot to trade places with`, locsOf(V, you, ['active']), l => go({ slot: l.idx }));
	else if (f.k === 'spyOps') chooseOpponent(`${ab.name}: choose an opponent`, s => go({ opp: s }));
	else if (f.k === 'benchAttachDiscard') pick(`${ab.name}: choose your ${f.type} Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => ofType(def(at(V, l)), f.type)), l => {
		const types = [...new Set(V.players[you].energyDiscard || [])]; if (types.length <= 1) { go({ slot: l.idx, type: types[0] }); return; }
		closeAll(); const list = h('div', 'pe-list');
		types.forEach((t, n) => { const o = h('button', 'pe-opt', `${en(t)} ${esc(t)} Energy`); o.type = 'button'; o.dataset.k = 'ed' + n; o.addEventListener('click', () => { closeAll(); go({ slot: l.idx, type: t }); }); list.appendChild(o); });
		modal(list, { title: `${ab.name}: attach which Energy from your discard pile?` });
	});
	else if (f.k === 'takeSome') pick(`${ab.name}: choose your damaged Pokémon in an Active slot; ${f.n} of its damage moves to ${def(k).name}`, locsOf(V, you, ['active']).filter(l => at(V, l).dmg > 0), l => go({ slot: l.idx }));
	else if (f.k === 'cureRandom') pick(`${ab.name}: choose your Pokémon in an Active slot that loses a random Special Condition`, locsOf(V, you, ['active']).filter(l => at(V, l).status.length), l => go({ slot: l.idx }));
	else if (f.k === 'takeDamage') pick(`${ab.name}: choose one of your damaged Pokémon; all its damage moves to ${def(k).name}`, locsOf(V, you).filter(l => at(V, l).uid !== k.uid && at(V, l).dmg > 0), l => go({ from: l }));
	else if (f.k === 'discardDraw') {
		const me = V.players[you], grid = h('div', 'pe-grid');
		me.hand.forEach((id, n) => { const e = handCard(card(id), null); e.classList.add('small'); e.dataset.k = 'dd' + n; e.addEventListener('click', () => { closeAll(); go({ hand: n }); }); grid.appendChild(e); });
		if (!grid.children.length) { toast('You have no card to discard.'); return; }
		modal(grid, { title: `${ab.name}: discard which card?` });
	}
	else if (f.k === 'moveEnergy') pick(`${ab.name}: choose the Benched ${f.type} Pokémon to take a ${f.type} Energy from`, locsOf(V, you, ['bench']).filter(l => ofType(def(at(V, l)), f.type) && at(V, l).energy.includes(f.type)),
		b => pick(`${ab.name}: choose your ${f.type} Pokémon in an Active slot to give it to`, locsOf(V, you, ['active']).filter(l => ofType(def(at(V, l)), f.type)), l => go({ bench: b.idx, at: l })));
	else { closeAll(); go({}); }
}
function pokeMenu(loc) {
	const you = YOU(), k = at(V, loc), c = def(k), acts = [];
	if (myTurn() && loc.seat === you) {
		const me = V.players[you];
		if (loc.zone === 'active') {
			c.attacks.forEach((a, i) => { const why = attackWhy(V, you, k, a) || (a.target !== 'none' && !targetsOf(V, you, a).length ? 'no legal target' : null); acts.push([`${a.cost.map(x => en(x)).join('')} ${esc(a.name)} ${ty(a.combatType)} <span class="d">${a.damage || ''}</span>`, () => chooseAttack(loc.idx, i), why, 'atk' + i]); });
			if (ui.cmds[loc.idx]) acts.push(['Pass instead (clear its command)', () => { ui.cmds[loc.idx] = null; closeAll(); render(); }]);
			if (!c.fossil && me.bench.some(Boolean)) { const cost = Math.max(0, (k.retreat ?? c.retreat) - me.flags.retreatLess); acts.push([`Retreat <span class="why">costs ${cost} Energy</span>`, () => pick(`Retreat ${c.name}: choose the Benched Pokémon to switch in`, locsOf(V, you, ['bench']), b => send({ t: 'retreat', slot: loc.idx, bench: b.idx })), me.flags.retreated ? 'already retreated this turn' : (k.provides || k.energy).length < cost ? 'not enough Energy' : null]); }
		} else for (const s of me.active.keys()) if (!me.active[s]) acts.push([V.singles ? 'Move up to your Active slot' : `Move up to Active ${SLOT[s]}`, () => { closeAll(); send({ t: 'promote', slot: s, bench: loc.idx }); }]);
		if (me.zone.cur && !me.flags.attached && !c.fossil) acts.push([`Attach ${en(me.zone.cur)} ${me.zone.cur} Energy`, () => { closeAll(); send({ t: 'attach', at: loc }); }]);
		if (c.ability && !c.ability.fx.passive) acts.push([`Use Ability: ${esc(c.ability.name)}`, () => useAbility(loc), k.abilityUsed === V.turn ? 'already used this turn' : c.ability.fx.active && loc.zone !== 'active' ? 'must be in an Active slot' : null]);
		if (c.fossil) acts.push(['Discard from play', () => { closeAll(); send({ t: 'discardFossil', at: loc }); }]);
	}
	inspect(c, k, loc, acts);
}
function finishSetup() {
	Promise.resolve(send({ t: 'setup', active: ui.setup.active.slice(), bench: ui.setup.bench.slice() })).then(ok => { if (ok) { ui.setup = { active: [], bench: [] }; render(); } });
}
/** Carry out the commands set for this turn, and end it. */
function sendCommands() { const cmds = [0, 1].map(i => (ui.cmds[i] ? ui.cmds[i].cmd : null)); closeAll(); return Promise.resolve(send({ t: 'execute', commands: cmds })).then(ok => { if (ok) { ui.cmds = [null, null]; play('whoosh'); render(); } else render(); }); }
function execute() {
	if (!myTurn()) return;
	const you = YOU(), me = V.players[you], cmds = [0, 1].map(i => (ui.cmds[i] ? ui.cmds[i].cmd : null));
	const could = [0, 1].some(i => !cmds[i] && me.active[i] && def(me.active[i]).attacks.some(a => !attackWhy(V, you, me.active[i], a) && (a.target === 'none' || targetsOf(V, you, a).length)));
	const go = () => sendCommands();
	if (!could) { go(); return; }
	// singles: this button is Pass turn (an attack has already ended the turn by itself)
	if (V.singles) { const box = h('div', '', `<div class="pe-note">${esc(def(me.active[0]).name)} could attack. Pass your turn without attacking?</div>`); box.appendChild(btn('Pass turn', 'red wide b-go', go, 'exec2')); modal(box, { title: 'Pass turn?' }); return; }
	const box = h('div', '', `<div class="pe-note">${[...me.active.keys()].map(i => `${V.singles ? 'Active' : 'Active ' + SLOT[i]}: ${me.active[i] ? esc(def(me.active[i]).name) + ' → ' + (ui.cmds[i] ? esc(ui.cmds[i].text) : '<b class="orange">Pass</b>') : 'empty'}`).join('<br>')}<br><br>An Active Pokémon that could attack is passing.</div>`);
	box.appendChild(btn('Execute', 'red wide b-go', go, 'exec2'));
	modal(box, { title: 'Execute?' });
}

// ------------------------------------------------------------------ a card, read closely
function inspect(c, k, loc, acts = [], print = null) {
	if (print == null && loc && k) print = printOf(loc.seat, k.id);   // (a Pokémon on the mat: the printing its owner put in the deck)
	const wrap = h('div', '');
	const body = h('div', 'pe-insp');
	const look = lookOf(print), big = h('div', 'big pf' + (c.ex ? ' ex' : '') + (look ? ' look-' + look : ''), face(c, k, print));
	big.style.setProperty('--c', `var(--t-${c.kind === 'pokemon' ? c.cardType : 'Colorless'})`);
	const info = h('div', 'info');
	const orig = (t, note) => (ui.showOriginal && t ? `<div class="orig">Original: ${tx(t)}${note ? `<br><span class="lbl">Why it differs: ${esc(note)}</span>` : ''}</div>` : '');
	let html = look ? `<div class="row"><span class="lbl">Printing</span> ${rarMark(COLL.printInfo(print).rarity)} ${LOOK_NAME[look]} <span class="lbl">(${esc(print)})</span></div>` : '';
	if (c.kind === 'pokemon') {
		html += `<div class="row">${stageOf(c)}${c.evolvesFrom ? ' · evolves from ' + esc(c.evolvesFrom) : ''} · ${k ? Math.max(0, k.hp - k.dmg) + ' / ' : ''}${c.hp} HP${c.ex ? ' · Pokémon ex: ${c.points} points' : ''}</div>`;
		html += `<div class="row"><span class="lbl">Card Type${c.cardType2 ? 's' : ''}</span> ${ty(c.cardType)}${c.cardType2 ? ' ' + ty(c.cardType2) + ' <span class="lbl">(it counts as both)</span>' : ''} <span class="lbl">(Energy and card effects)</span></div>`;
		html += `<div class="row"><span class="lbl">Combat Type${c.combatTypes.length > 1 ? 's' : ''}</span> ${c.combatTypes.map(ty).join(' ')} <span class="lbl">(what attacks are strong or weak against)</span></div>`;
		html += `<div class="row"><span class="lbl">Retreat</span> ${c.retreat}${c.weakness ? ` · <span class="lbl">printed Weakness ${esc(c.weakness)} (not used here)</span>` : ''}</div>`;
		if (k) for (const tid of [k.tool, k.tool2].filter(Boolean)) html += `<div class="row"><span class="lbl">Pokémon Tool</span> ${esc(card(tid).name)}: ${tx(card(tid).adapted)}</div>`;
		if (k) html += `<div class="row"><span class="lbl">Energy</span> ${k.energy.map(e => en(e)).join('') || 'none'}${k.status.length ? ` · ${k.status.map(cap).join(', ')}` : ''}${k.fx.length ? ` · ${k.fx.map(f => FX_LABEL[f.k] || f.k).join(', ')}` : ''}</div>`;
		if (c.ability) html += `<h4>Ability: ${esc(c.ability.name)}</h4><div>${tx(c.ability.adapted)}</div>${orig(c.ability.text, c.ability.note)}`;
		for (const a of c.attacks) html += `<h4>${a.cost.map(x => en(x)).join('')} ${esc(a.name)} ${a.damage ? `<span class="money">${a.damage}${a.damageMode === 'x' ? '×' : a.damageMode}</span>` : ''} ${ty(a.combatType)}</h4>${a.adapted ? `<div>${tx(a.adapted)}</div>` : ''}${orig(a.text, a.note)}`;
		if (c.fossil) html += `<div>${tx(c.adapted)}</div>${orig(c.text)}`;
	} else html += `<div>${tx(c.adapted)}</div>${orig(c.text, c.note)}`;
	if (loc) html += `<div class="row lbl" style="margin-top:8px">${esc(pokeLabel(V, loc))}</div>`;
	info.innerHTML = html;
	const side = h('div', 'side');
	body.append(big, side); wrap.appendChild(body);
	if (acts.length) {
		const list = h('div', 'pe-list'); side.appendChild(list);
		for (const [label, fn, why, k2] of acts) { const o = h('button', 'pe-opt', label + (why ? `<span class="why">${esc(why)}</span>` : '')); o.type = 'button'; if (k2) o.dataset.k = k2; o.disabled = !!why; o.addEventListener('click', () => { play('button'); fn(); }); list.appendChild(o); }
	}
	side.appendChild(info);
	const t = btn(ui.showOriginal ? 'Hide original card text' : 'Show original card text', 'grey wide', () => { ui.showOriginal = !ui.showOriginal; SV.setPref('original', ui.showOriginal); closeModal(); inspect(c, k, loc, acts, print); }, 'orig');
	t.style.marginTop = '10px'; wrap.appendChild(t);
	modal(wrap, {});
}

// ------------------------------------------------------------------ modals (Micatro's .modal / .modal-box)
const mstack = [];
function modal(content, { title, noClose = false, onClose } = {}) {
	const wrap = h('div', 'modal'), box = h('div', 'modal-box');
	if (title) box.appendChild(h('div', 'modal-title', esc(title)));
	box.appendChild(content);
	if (!noClose) box.appendChild(btn('Back', 'orange wide b-back', () => closeModal(), 'back'));
	wrap.appendChild(box);
	wrap.addEventListener('pointerdown', e => { if (e.target === wrap && !noClose) closeModal(); });
	el.modals.appendChild(wrap); el.modals.classList.add('open');
	mstack.push({ el: wrap, onClose, noClose });
	if (pad) pad.refresh(true);
	return wrap;
}
function closeModal() { const m = mstack.pop(); if (m) { m.el.remove(); if (m.onClose) m.onClose(); } el.modals.classList.toggle('open', mstack.length > 0); if (pad) pad.refresh(true); }
function closeAll() { while (mstack.length) closeModal(); }
const topModal = () => (mstack.length ? mstack[mstack.length - 1] : null);

const HOW = [
	'<b class="orange">The match.</b> 2 to 4 players, everyone against everyone. First to 3 points wins: knocking out a Pokémon is 1 point, a Pokémon ex 2. A player with no Pokémon left is out.',
	'<b class="orange">Your side.</b> Two Active Pokémon (A and B) and up to four on the Bench. Each turn you get one Energy from your Energy Zone, shared between both Active Pokémon.',
	'<b class="orange">Two kinds of type.</b> A Pokémon\'s <b>Card Type</b> is the card game\'s (it decides Energy and what cards affect it). Its <b>Combat Types</b> are the video games\' (Charizard is Fire and Flying). Every attack has a Combat Type too.',
	'<b class="orange">Effectiveness.</b> A super effective attack does <b>+20</b>, a resisted one <b>−20</b>, and there are no immunities. Against two types the results add, so +40 and −40 happen. Damage never goes below 0.',
	'<b class="orange">Execute.</b> Choose an attack and a target for each Active Pokémon (or let it pass), then press <b>Execute</b>. A resolves, then B, and your turn ends. If A knocks out B\'s target, B\'s attack fails: it does not pick a new one. <b>In a singles match</b> there is one Active Pokémon: choosing its attack carries it out at once (with only one target, there is nothing to choose) and your turn ends; <b>Pass turn</b> ends it without attacking.',
	'<b class="orange">Controls.</b> Mouse or touch; or arrows / WASD to move, Z to choose, X to go back, C to Execute, V to read a card, Enter for the menu. A controller works the same way.',
];
/** The guided first match: what to do next, said beside the commands. It reads the table as it stands; nothing is scripted. */
function coachTip() {
	if (MODE !== 'normal' || !G || !G.config.tutorial || !V) return null;
	const me = V.players[0], foe = V.players[1];
	if (V.over) return V.over.winner === 0 ? 'You won. That is the whole game: you are ready for a match of your own.' : 'That is the whole game. Start a match of your own from the menu whenever you like.';
	if (V.phase === 'setup') return me.setup ? `Waiting for ${foe.name} to finish setting up.` : !ui.setup.active.length ? 'Drag a Basic Pokémon from your hand to an Active slot, A or B: those are the ones that fight. Press a card to read it.' : 'Drag more Basic Pokémon to your Bench, in reserve. When you are happy, press Ready.';
	if (V.pending) return V.pending.seat === 0 ? 'The game is waiting for a choice from you: pick one of the lit-up options.' : `Waiting for ${foe.name} to choose.`;
	if (V.current !== 0) return `${foe.name} is taking a turn. Watch which of its Pokémon attacks which of yours.`;
	if (me.zone.cur && !me.flags.attached) return 'Each turn your Energy Zone makes one Energy. Drag the Energy orb onto the Pokémon to give it to (or press the orb, then the Pokémon): attacks cost Energy.';
	if (!ui.cmds.some(Boolean)) return 'Press an Active Pokémon to choose its attack and its target. Both of yours can attack each turn. If neither has enough Energy yet, just press Execute to pass.';
	return 'Press Execute: A attacks, then B, and your turn ends. Knock Out Pokémon to take points. Three points win.';
}
/** A solo battle's tasks beside the commands while it is played: what is done so far, and what was done in an earlier try. */
function taskList() {
	if (MODE !== 'normal' || !G || !G.config.solo || !V || !S || YOU() !== 0) return null;
	const sb = soloById(G.config.solo); if (!sb || !sb.text.length) return null;
	let now = []; try { now = SO.tasksDone(S, 0, G.config.players[0].deck, sb.text); } catch (e) { now = []; }
	const had = SV.solo().tasks[sb.id] || [], box = h('div', 'pe-tasks pe-livetasks');
	box.setAttribute('aria-label', 'Battle tasks');
	sb.text.forEach((t, i) => { const win = /^Win this battle/i.test(t), d = h('div', 'pe-task' + (now[i] ? ' done' : had[i] ? ' had' : ''), `${now[i] ? '✓' : had[i] ? '✓' : '○'} ${esc(t)}${!now[i] && had[i] ? ' <span class="muted">(done before)</span>' : !now[i] && win && !V.over ? ' <span class="muted">(at the end)</span>' : ''}`); box.appendChild(d); });
	return box;
}
/** Something happened that today's missions may count: note it, and pay for any mission it finishes. */
function dailyEvent(ev) {
	const r = SO.dailyAdd(SV.solo(), SO.dailyDay(Date.now()), ev);
	if (!SO.sameProgress(r.progress, SV.solo())) keepSolo(r.progress);
	if (r.done.length) { toast(`Daily mission done: ${r.done.join('; ')}. Claim its stars in Daily missions.`); play('coin1'); }
}
function dailyMenu() {
	const day = SO.dailyDay(Date.now()), box = h('div', '');
	const draw = () => {
		box.innerHTML = ''; const rows = SO.dailyState(SV.solo(), day), due = rows.filter(m => m.done && !m.paid).length;
		box.appendChild(h('div', 'pe-note', `Three missions a day, the same for everyone, ${starN(STAR)} for each. New ones at midnight (UTC).`));
		const list = h('div', 'pe-tasks');
		for (const m of rows) list.appendChild(h('div', 'pe-task' + (m.done ? ' done' : ''), `${m.done ? '✓' : '○'} ${esc(m.text)} <span class="muted">${m.have} / ${m.need}</span>${m.paid ? ' <b class="money">claimed</b>' : ''}`));
		box.appendChild(list);
		if (due) { const l = h('div', 'pe-list'); l.appendChild(btn(`Claim ${starN(due * SO.PACK_FOR_DAILY * STAR)}`, 'green big', () => { const c = SO.dailyClaim(SV.solo(), day); keepSolo(c.progress); if (c.packs) { toast(`+${starN(payStars(c.packs))}`); play('coin1'); } draw(); }, 'dclaim')); box.appendChild(l); }
		box.appendChild(h('div', 'pe-note pe-record', recordText(SV.record())));
		if (pad) pad.refresh();
	};
	draw();
	modal(box, { title: 'Daily missions' });
}
const recordText = r => (r.played ? `Your record on this device: <b>${r.won}</b> won, ${r.lost} lost${r.drawn ? `, ${r.drawn} drawn` : ''} of ${r.played} ${r.played === 1 ? 'match' : 'matches'}${r.online ? ` (${r.onlineWon} of ${r.online} online)` : ''}.` : 'Your record on this device: no matches finished yet.');
function startTutorial() { SV.setPref('tutored', true); startMatch(2, starterDeck(STARTERS[0].id), null, false, true, true); }
/** Trading is the site's one trading system, in the overworld's trade window: this says how to get there. */
function tradeInfo() {
	const box = h('div', '');
	box.appendChild(h('div', 'pe-note', `<p style="text-align:left;max-width:860px">Your Pocket Enhanced <b>cards and packs can be traded with a friend</b>, for theirs or for anything else on the site: Battlecards cards and packs, or POKéMON and items from the overworld.</p><p style="text-align:left;max-width:860px">Ask a friend from this game's <b>Trade</b> screen, or from the overworld: open <b>Friends</b> there, choose your friend, and pick <b>TRADE</b> (your cards are on the <b>PK CARDS</b> and <b>PK PACKS</b> tabs). Battlecards cards and packs can be offered from either. POKéMON and items can only be offered from the overworld. Nothing moves until you have both accepted.</p><p style="text-align:left;max-width:860px">${net && net.isLoggedIn() ? 'What you trade is taken from the collection on your account, so open this game signed in first if you have just pulled something new.' : 'Trading needs an account: sign in from the top bar first, so your collection is on your account.'}</p>`));
	const bar = h('div', 'pe-seg'); bar.appendChild(btn('Go to the overworld', 'green', () => { location.href = '/overworld/'; }, 'gotrade')); box.appendChild(bar);
	modal(box, { title: 'Trade' });
}
// ---- trading from this game: the site's one trading system (server/trade.mjs), for this game's cards and packs.
// (The same trade can be met from the overworld's trade window, where POKéMON, items and Battlecards cards can be offered too.)
const TR = { id: null, role: null, them: '', t: null, col: null, mine: null, timer: 0, wait: 0, closed: false, filter: '' };
const trCall = async (action, body) => { try { return await net.call(action, body || {}); } catch (e) { return null; } };
function tradeMenu() {
	if (!net || !net.isLoggedIn()) { tradeInfo(); return; }
	const box = h('div', ''); let alive = true, friends = null, asks = [];
	const draw = () => {
		box.innerHTML = '';
		box.appendChild(h('div', 'pe-note', 'Trade your cards and packs with a friend, for theirs or for anything else on the site. Nothing moves until you have both locked in.'));
		const list = h('div', 'pe-list');
		for (const a of asks) list.appendChild(btn(`<b>${esc(a.from)}</b> wants to trade <span class="muted">(accept)</span>`, 'green big', async () => { const r = await trCall('trade-open', { from: a.from }); if (r && r.tradeId) openTrade(r.tradeId, 'b', a.from); else toast((r && r.error) || 'That trade request has gone.'); }, 'tacc:' + a.from));
		if (!friends) list.appendChild(h('div', 'pe-note', 'Asking who your friends are…'));
		else if (!friends.length) list.appendChild(h('div', 'pe-note', 'You have no friends added yet. Add one from the top bar (the ⚙ in the corner), then come back.'));
		else for (const fr of friends) list.appendChild(btn(`Ask <b>${esc(fr.username)}</b> to trade <span class="muted">${fr.online ? '(online)' : '(not here now)'}</span>`, fr.online ? 'blue' : 'grey', () => askTrade(fr.username), 'task:' + fr.username));
		box.appendChild(list);
		const bar = h('div', 'pe-seg'); bar.appendChild(btn('How trading works', 'grey', () => tradeInfo(), 'tinfo')); box.appendChild(bar);
		if (pad) pad.refresh();
	};
	const poll = async () => {
		if (!alive || !box.isConnected) { alive = false; return; }
		const [fr, ch, mine] = await Promise.all([friends ? null : trCall('friends'), trCall('challenges'), trCall('trade-mine')]);
		if (!alive || !box.isConnected) return;
		if (mine && mine.tradeId && !TR.id) { openTrade(mine.tradeId, mine.role || 'a', mine.trade ? (mine.role === 'b' ? mine.trade.a : mine.trade.b) : ''); return; }   // (a window the other player has opened, or one I was in before a reload)
		if (fr && Array.isArray(fr.friends)) friends = fr.friends.slice().sort((x, y) => (y.online ? 1 : 0) - (x.online ? 1 : 0) || x.username.localeCompare(y.username));
		const next = ch && Array.isArray(ch.challenges) ? ch.challenges.filter(c => c.type === 'trade') : asks;
		if (JSON.stringify(next) !== JSON.stringify(asks) || fr) { asks = next; draw(); }
		setTimeout(poll, 2500);
	};
	const askTrade = async to => { const r = await trCall('challenge', { to, battleType: 'trade' }); toast(r && r.ok ? `Asked ${to}. The window opens when they accept (they have a minute).` : (r && r.error) || 'Could not ask.'); };
	draw();
	modal(box, { title: 'Trade', onClose: () => { alive = false; } });
	poll();   // (once the screen is up: it stops when the screen has gone)
}
const trOffer = () => ({ cards: { ...TR.mine.cards }, packs: TR.mine.bpacks, pk: { prints: { ...TR.mine.prints }, packs: TR.mine.packs }, pokemon: [], items: [] });
const offerText = o => { const out = []; if (!o) return out;
	for (const [id, n] of Object.entries((o.pk && o.pk.prints) || {})) { const p = COLL.printInfo(id); out.push(`${esc(p ? card(p.card).name : id)} ${p ? rarMark(p.rarity) : ''} ×${n}`); }
	if (o.pk && o.pk.packs) out.push(`${plural(o.pk.packs, 'pack')} of this game`);
	for (const [id, n] of Object.entries(o.cards || {})) out.push(`${esc(id.replace(/_/g, ' '))} ×${n} <span class="muted">(Battlecards)</span>`);
	if (o.packs) out.push(`${plural(o.packs, 'Battlecards pack')}`);
	for (const m of o.pokemon || []) out.push(`${esc(m.name || 'A POKéMON')} Lv.${m.level | 0} <span class="muted">(overworld)</span>`);
	for (const it of o.items || []) out.push(`${esc(String(it.id).replace(/_/g, ' '))} ×${it.count} <span class="muted">(overworld item)</span>`);
	return out; };
function openTrade(id, role, them) {
	closeAll(); clearTimeout(TR.timer);
	clearInterval(TR.tick);
	Object.assign(TR, { id, role, them, t: null, col: null, bc: null, mine: { prints: {}, packs: 0, cards: {}, bpacks: 0 }, closed: false, filter: '', synced: false, goAt: 0, scene: 0, tick: 0 });
	// It works as the site's other trade windows do (owner's improvement list, 2026-11-18: "Pocket's own Trade screen
	// matching the new window"): my offer | a line | theirs; LOCK IN each; a four-second countdown once both are locked in
	// (either can still back out); then a link-cable scene while it is carried out, and what each received.
	const box = h('div', 'pe-trade'); let last = '';
	const SCENE_MS = 4200;
	clearInterval(TR.tick); TR.tick = setInterval(() => { if (TR.id !== id) { clearInterval(TR.tick); return; } const n = box.querySelector('.pe-tcount b'); if (n && TR.goAt) n.textContent = String(Math.max(1, Math.ceil((TR.goAt - performance.now()) / 1000))); if (TR.scene && TR.t && TR.t.phase === 'done' && performance.now() - TR.scene >= SCENE_MS && box.querySelector('.pe-tscene')) { last = ''; draw(); } }, 150);
	const mineSide = () => (TR.role === 'a' ? 'A' : 'B'), my = k => (TR.t ? TR.t[k + mineSide()] : null), their = k => (TR.t ? TR.t[k + (mineSide() === 'A' ? 'B' : 'A')] : null);
	const push = async () => { const r = await trCall('trade-update', { id, offer: trOffer() }); if (r && r.trade) { TR.t = r.trade; draw(); } };
	const change = (pid, d) => {
		const bc = pid.startsWith('bc:'), id2 = bc ? pid.slice(3) : pid, packs = id2 === 'packs', src = bc ? TR.bc : TR.col, mineMap = bc ? TR.mine.cards : TR.mine.prints;
		const have = packs ? src.packs || 0 : (bc ? src.collection[id2] : src.prints[id2]) || 0, cur = packs ? (bc ? TR.mine.bpacks : TR.mine.packs) : mineMap[id2] || 0, n = Math.max(0, Math.min(have, cur + d)); if (n === cur) return;
		if (packs) { if (bc) TR.mine.bpacks = n; else TR.mine.packs = n; } else if (n) mineMap[id2] = n; else delete mineMap[id2];
		play('cardSlide1'); draw(); push();
	};
	const draw = () => {
		const t = TR.t, talking = !t || t.phase === 'talk';
		TR.goAt = t && t.goIn != null ? performance.now() + t.goIn : 0;
		if (t && t.phase !== 'talk' && t.phase !== 'cancelled' && !TR.scene) TR.scene = performance.now();
		const inScene = TR.scene && !(t && t.phase === 'done' && performance.now() - TR.scene >= SCENE_MS) && !(t && t.phase === 'cancelled');
		const sig = JSON.stringify([t && { ...t, goIn: t.goIn != null }, TR.mine, !!TR.col, !!TR.bc, TR.filter, inScene]); if (sig === last) return; last = sig;
		box.innerHTML = '';
		if (inScene) {
			// the link-cable scene: two handhelds, a cable, each bundle travelling along it
			const me = (net && net.myName()) || 'You';
			box.appendChild(h('div', 'pe-tscene', `<h4>Trading…</h4><div class="pe-cable" aria-hidden="true"><div class="u"><div class="s">${esc(me.slice(0, 10))}</div><i></i></div><div class="w"><span class="o">★</span><span class="n">★</span></div><div class="u"><div class="s">${esc(TR.them.slice(0, 10))}</div><i></i></div></div><div class="pe-note">${t && t.phase === 'wait' ? `Waiting for ${esc(TR.them)} to hand over…` : `${esc(me)} and ${esc(TR.them)} are trading. Do not close this page.`}</div>`));
			if (pad) pad.refresh();
			return;
		}
		if (t && t.phase === 'done') {
			const got = offerText(their('offer')), gave = offerText(my('offer'));
			box.appendChild(h('div', 'pe-tdone', `<h4>Trade complete!</h4><div class="pe-tcols"><div class="pe-tcol" data-k="tgot"><h4>You received</h4>${got.map(l => `<div>${l}</div>`).join('') || '<div class="muted">nothing</div>'}</div><div class="pe-tcol" data-k="tgave"><h4>${esc(TR.them)} received</h4>${gave.map(l => `<div>${l}</div>`).join('') || '<div class="muted">nothing</div>'}</div></div>`));
			const bar = h('div', 'pe-seg'); bar.appendChild(btn('Close', 'green big', () => closeTradeUI(), 'tclose')); box.appendChild(bar);
			if (pad) pad.refresh();
			return;
		}
		const status = !t ? 'Opening…' : t.phase === 'done' ? 'Trade complete!' : t.phase === 'cancelled' ? `Trade cancelled${t.why ? ': ' + t.why : ''}.` : t.phase !== 'talk' ? `Carrying the trade out${t.phase === 'wait' ? ` (waiting for ${TR.them} to hand over)` : ''}…` : TR.goAt ? 'Both locked in: either of you can still back out.' : their('accept') ? `${TR.them} has locked in. Check their side, then lock in.` : my('accept') ? `Waiting for ${TR.them} to lock in…` : 'Add what you offer, then Accept.';
		box.appendChild(h('div', 'pe-note pe-tstatus', esc(status)));
		const cols = h('div', 'pe-tcols');
		for (const [title, o, acc, k] of [['You offer', my('offer'), my('accept'), 'tmine'], [`${TR.them} offers`, their('offer'), their('accept'), 'ttheirs']]) {
			const lines = offerText(o), p = h('div', 'pe-tcol' + (acc ? ' ok' : ''), `<h4>${esc(title)}${acc ? ' <span class="pe-lk">LOCKED IN</span>' : ''}</h4>${lines.length ? lines.map(l => `<div>${l}</div>`).join('') : '<div class="muted">(nothing)</div>'}`); p.dataset.k = k; cols.appendChild(p);
		}
		box.appendChild(cols);
		if (TR.goAt) cols.appendChild(h('div', 'pe-tcount', `<b>${Math.max(1, Math.ceil((TR.goAt - performance.now()) / 1000))}</b>`));   // (on the line between the two offers)
		if (talking && TR.col) {
			const pick = h('div', 'pe-tpick'), row = (label, pid, have, cur) => { const r = h('div', 'pe-trow' + (cur ? ' on' : ''), `<span>${label}</span><span class="muted">have ${have}</span>`); const minus = btn('−', 'grey', () => change(pid, -1), 'tm:' + pid), plus = btn('+', 'grey', () => change(pid, 1), 'tp:' + pid); minus.disabled = !cur; plus.disabled = cur >= have; r.append(minus, h('b', '', String(cur)), plus); return r; };
			pick.appendChild(row('Packs to open', 'packs', TR.col.packs, TR.mine.packs));
			const all = Object.entries(TR.col.prints).map(([pid, n]) => { const p = COLL.printInfo(pid); return p ? { pid, n, name: card(p.card).name, rar: p.rarity } : null; }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name) || a.pid.localeCompare(b.pid));
			const shown = all.filter(x => TR.mine.prints[x.pid] || !TR.filter || x.name.toLowerCase().includes(TR.filter.toLowerCase()));
			const f = h('input', 'pe-search'); f.type = 'search'; f.placeholder = `Find one of your ${all.length} cards`; f.value = TR.filter; f.dataset.k = 'tfind'; f.setAttribute('aria-label', 'Find a card to offer'); f.addEventListener('input', () => { TR.filter = f.value; draw(); queueMicrotask(() => { const g = box.querySelector('[data-k="tfind"]'); if (g) { g.focus(); g.setSelectionRange(g.value.length, g.value.length); } }); });
			pick.appendChild(f);
			for (const x of shown.slice(0, 60)) pick.appendChild(row(`${esc(x.name)} ${rarMark(x.rar)} <span class="muted">${x.pid}</span>`, x.pid, x.n, TR.mine.prints[x.pid] || 0));
			if (shown.length > 60) pick.appendChild(h('div', 'pe-note', `${shown.length - 60} more: type part of a name to find one.`));
			// Battlecards cards and packs (the same account's): offered from here too
			if (TR.bc) {
				const nice = id => id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), bcAll = Object.entries(TR.bc.collection || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, name: nice(id) })).sort((a, b) => a.name.localeCompare(b.name));
				const bcShown = bcAll.filter(x => TR.mine.cards[x.id] || (TR.filter && x.name.toLowerCase().includes(TR.filter.toLowerCase())));
				pick.appendChild(h('div', 'pe-note pe-tbc', `Battlecards <span class="muted">(${bcAll.length} different cards: type a name above to find one)</span>`));
				pick.appendChild(row('Battlecards packs', 'bc:packs', TR.bc.packs || 0, TR.mine.bpacks));
				for (const x of bcShown.slice(0, 40)) pick.appendChild(row(`${esc(x.name)} <span class="muted">Battlecards</span>`, 'bc:' + x.id, x.n, TR.mine.cards[x.id] || 0));
			}
			box.appendChild(pick);
		} else if (talking) box.appendChild(h('div', 'pe-note', 'Reading your collection from your account…'));
		const bar = h('div', 'pe-seg');
		if (talking && t) { bar.appendChild(btn(my('accept') ? 'Unlock' : 'Lock in', my('accept') ? 'grey' : 'green big', async () => { const r = await trCall('trade-lock', { id, accepted: !my('accept'), count: true }); if (r && r.error && !r.trade) toast(r.error); if (r && r.trade) { TR.t = r.trade; if (r.error) toast(r.error); draw(); ended(); } }, 'tlock')); bar.appendChild(btn('Cancel trade', 'red', async () => { await trCall('trade-cancel', { id }); closeTradeUI(); }, 'tcancel')); }
		else if (t && (t.phase === 'done' || t.phase === 'cancelled')) bar.appendChild(btn('Close', 'grey', () => closeTradeUI(), 'tclose'));
		box.appendChild(bar);
		if (pad) pad.refresh();
	};
	// the trade is over (however this device learned of it): say so once, and bring the collection up to date with the account
	const ended = () => { const t = TR.t; if (!t || (t.phase !== 'done' && t.phase !== 'cancelled')) return false; if (!TR.synced) { TR.synced = true; play(t.phase === 'done' ? 'coin1' : 'cancel'); if (colSync) colSync.now(); } return true; };
	const closeTradeUI = () => { TR.closed = true; clearTimeout(TR.timer); clearInterval(TR.tick); TR.id = null; TR.goAt = 0; TR.scene = 0; if (colSync) colSync.now(); closeAll(); mainMenu(); };
	const poll = async () => {
		if (TR.closed || TR.id !== id) return;
		const r = await trCall('trade-poll', { id });
		if (TR.closed || TR.id !== id) return;
		if (r && r.gone) { TR.t = { ...(TR.t || {}), phase: 'cancelled', why: 'it has closed' }; draw(); return; }
		if (r && r.trade) { TR.t = r.trade; draw(); if (ended()) return; }
		TR.timer = setTimeout(poll, TR.goAt ? 400 : 900);   // (closer together during the countdown: the scene starts when it runs out)
	};
	trCall('pkcol-get').then(r => { if (TR.id !== id) return; TR.col = (r && r.col && COLL.cleanCollection(r.col)) || COLL.newCollection(); draw(); });
	trCall('state').then(r => { if (TR.id !== id || !r || !r.state) return; TR.bc = { collection: r.state.collection || {}, packs: r.state.packs || 0 }; draw(); });
	draw(); poll();
	modal(box, { title: `Trade with ${them}`, noClose: true });
}
function howTo() { modal(h('div', 'pe-note', HOW.map(x => `<p style="text-align:left;max-width:860px">${x}</p>`).join('')), { title: 'How to play' }); }

// ------------------------------------------------------------------ the collection: packs, cards owned, pack points
let COL = SV.collection(), packBtn = null, colSync = null, deckSync = null, soloSync = null;
/** Keep changed solo progress (and send it to the player's account). */
function keepSolo(p) { SV.setSolo(p); if (soloSync) soloSync.soon(); }
const SYNC_NOTE = { guest: 'Kept on this device. Sign in to keep it on your account.', syncing: 'Saving to your account…', saved: 'Saved to your account.', offline: 'Offline: kept on this device, and sent to your account when you are back.' };
const syncNote = () => `<span class="pe-sync" data-sync="${colSync ? colSync.status() : 'guest'}">${SYNC_NOTE[colSync ? colSync.status() : 'guest']}</span>`;
const deckNote = () => `<span class="pe-sync pe-dsync" data-sync="${deckSync ? deckSync.status() : 'guest'}">${SYNC_NOTE[deckSync ? deckSync.status() : 'guest'].replace('Sign in to keep it', 'Sign in to keep your decks')}</span>`;
const paintSync = () => { for (const e of document.querySelectorAll('.pe-sync')) { const y = e.classList.contains('pe-dsync') ? deckSync : e.classList.contains('pe-ssync') ? soloSync : colSync, s = y ? y.status() : 'guest'; e.dataset.sync = s; e.textContent = SYNC_NOTE[s]; } };
/** Save or delete one of the player's decks (and send the list to their account). -> why not, or null. */
function keepDeck(d) { const e = SV.saveDeck(d); if (!e && deckSync) deckSync.soon(); return e; }
function dropDeck(name) { SV.deleteDeck(name); if (deckSync) deckSync.soon(); }
/** Signed in: the collection lives on the account (colsync.js); what the account holds replaces the device's copy when they differ. */
/** Cards found on the journey (a Pokémon caught in the overworld can give its card): said once, when this game is next opened. */
function showFound() {
	let l = []; try { l = JSON.parse(localStorage.getItem('magepunk_pocket_found_v1') || '[]'); localStorage.removeItem('magepunk_pocket_found_v1'); } catch (e) { l = []; }
	const names = (Array.isArray(l) ? l : []).map(id => COLL.printInfo(id)).filter(Boolean).map(p => card(p.card).name);
	if (names.length) { COL = SV.collection(); packLabel(); toast(`Found on your journey: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}.`); }
	return names;
}
function startColSync() {
	if (!net) return;
	colSync = createSync({ call: (a, b) => net.call(a, b), user: () => (net.isLoggedIn() ? net.myName() : null), getLocal: () => COL,
		setLocal: c => { COL = c; SV.setCollection(COL); packLabel(); }, onStatus: paintSync });
	deckSync = createSync({ kind: DECK_KIND, call: (a, b) => net.call(a, b), user: () => (net.isLoggedIn() ? net.myName() : null), getLocal: () => SV.listDecks(), setLocal: l => { SV.setDecks(l); }, onStatus: paintSync });
	soloSync = createSync({ kind: SOLO_KIND, call: (a, b) => net.call(a, b), user: () => (net.isLoggedIn() ? net.myName() : null), getLocal: () => SV.solo(), setLocal: p => { SV.setSolo(p); }, onStatus: paintSync,
		// (the same reward claimed on two devices before either had synced was paid on both: this device gives its copy back)
		onAgree: (base, mine, theirs) => { const n = SO.paidTwice(base, mine, theirs) * STAR, take = Math.min(n, Stars.stars()); if (take > 0 && Stars.spend(take)) { starSync(); packLabel(); toast(`${starN(take)} taken back: that reward was already claimed on another device.`); } } });
	colSync.now(); deckSync.now(); soloSync.now(); starSync();
	document.addEventListener('visibilitychange', () => { if (!document.hidden) { colSync.now(); deckSync.now(); soloSync.now(); starSync(); packLabel(); } });
}
const STAR = Stars.STARS_PER_PACK, starN = n => `${n.toLocaleString('en-US')} ★`;
/** How many packs the player can open right now: the ones they hold, and the ones their stars would buy. */
const canOpen = () => COL.packs + Math.floor(Stars.stars() / STAR);
/** Whether a pack of this booster can be opened now: one of that booster in hand, a pack of any kind, or the stars for one. */
const canOpenOf = b => COLL.packsOf(COL, b) > 0 || canOpen() > 0;
const inHand = () => COL.packs + COLL.ownPacks(COL);
const walletText = () => `<b class="money pe-stars">${starN(Stars.stars())}</b>${inHand() ? ` · <b class="money">${plural(inHand(), 'pack')}</b> in hand` : ''}`;
let starTimer = 0;
/** Send the wallet to the account shortly (a signed-in player's stars are the same on every device, and in Pair of Pears). */
const starSync = () => { clearTimeout(starTimer); starTimer = setTimeout(async () => { if (net && net.isLoggedIn()) { await Stars.sync((a, b) => net.call(a, b)); packLabel(); } }, 900); };
/** Pay what used to be `packs` packs, in stars. -> the stars paid. */
function payStars(packs) { const n = Math.max(0, packs | 0) * STAR; if (n) { Stars.earn(n); starSync(); packLabel(); } return n; }
/** A pack to open: one in hand, or one bought now with stars. -> true if the collection now holds one. */
function buyPackIfNeeded(b) {
	if ((b && COLL.packsOf(COL, b) > 0) || COL.packs > 0) return true;
	if (!Stars.spend(STAR)) return false;
	COL = COLL.addPacks(COL, 1); SV.setCollection(COL); starSync(); return true;
}
const packLabel = () => { if (packBtn) packBtn.innerHTML = `Open packs <span class="muted">(${starN(Stars.stars())}${inHand() ? ' · ' + plural(inHand(), 'pack') : ''})</span>`; };
/** Keep a changed collection (Mew arrives with the last of the first 150). */
function saveCol(c) {
	const had = COLL.owned(c, COLL.SECRET);
	COL = COLL.claimSecrets(c); SV.setCollection(COL); packLabel(); if (colSync) colSync.soon(); emblemSoon();
	if (!had && COLL.owned(COL, COLL.SECRET)) toast('You own every Pokémon from 1 to 150: Mew joins your collection!');
	else { const due = setsDue(setState(COL, SV.solo())); if (due > 0 && due > setDueSaid) toast(`A set reward is ready: ${starN(due * STAR)} in Set rewards.`); setDueSaid = due; }
}
let setDueSaid = -1;   // (packs of set rewards waiting, when last said: a toast only when that grows)
/** Pack rolls: the page's own randomness; with ?seed= they repeat (so a test can open the same packs). */
function packRand() {
	if (!SEED_PARAM) return Math.random;
	let a = 0; for (const ch of SEED_PARAM + ':' + COL.opened) a = (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0;
	return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rarMark = r => `<span class="rar r${r}">${COLL.RARITY[r]}</span>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// ---- free packs that arrive with time (packtimer.js): on the account for a signed-in player, on the device for a guest
const INBOX = { st: null, at: 0, busy: false };   // what the account last said: { inbox, nextMs }, and when
const signedIn = () => !!(net && net.isLoggedIn());
const guestInbox = () => { const st = PT.accrue(SV.prefs().inbox, Date.now()); if (JSON.stringify(st) !== JSON.stringify(SV.prefs().inbox)) SV.setPref('inbox', st); return st; };
/** The inbox as it stands now: { inbox, nextMs } or null while the account has not answered. */
function inboxNow() {
	if (!signedIn()) { const st = guestInbox(); return { inbox: st.inbox, nextMs: PT.etaMs(st, Date.now()) }; }
	if (!INBOX.st) return null;
	const gone = Date.now() - INBOX.at; return { inbox: INBOX.st.inbox, nextMs: INBOX.st.nextMs == null ? null : Math.max(0, INBOX.st.nextMs - gone), stale: INBOX.st.nextMs != null && gone >= INBOX.st.nextMs };
}
async function loadInbox(redraw) {
	if (!signedIn() || INBOX.busy) return;
	INBOX.busy = true;
	try {
		// a claim this device sent and never heard back about is asked again first: the account answers it the same way
		const pend = SV.prefs().inboxClaim;
		if (typeof pend === 'string') { const r = await net.call('pkinbox-claim', { id: pend }).catch(() => null); if (r && !r.error) { SV.setPref('inboxClaim', null); if (r.claimed > 0) { toast(`+${starN(payStars(r.claimed))}`); } } }
		const g = await net.call('pkinbox-get', {}).catch(() => null);
		if (g && !g.error && Number.isInteger(g.inbox)) { INBOX.st = g; INBOX.at = Date.now(); }
	} finally { INBOX.busy = false; }
	if (redraw) redraw();
}
async function collectInbox(redraw) {
	if (!signedIn()) { const c = PT.claim(SV.prefs().inbox, Date.now()); SV.setPref('inbox', c.st); if (c.claimed > 0) { toast(`+${starN(payStars(c.claimed))}`); play('coin1'); } redraw && redraw(); return; }
	if (INBOX.busy) return;
	const a = new Uint32Array(2); try { crypto.getRandomValues(a); } catch (e) { a[0] = Date.now() >>> 0; a[1] = (Math.random() * 2 ** 32) >>> 0; }
	SV.setPref('inboxClaim', ('c' + a[0].toString(36) + a[1].toString(36)).slice(0, 20).padEnd(8, '0'));   // (kept until the answer is in: see loadInbox)
	await loadInbox(redraw); play('coin1');
}
function inboxRow(redraw) {
	const now = inboxNow(), row = h('div', 'pe-inbox');
	if (!now) { row.appendChild(h('span', 'muted', 'Free stars: asking your account…')); return row; }
	row.appendChild(h('span', '', `<b class="money">${starN(now.inbox * STAR)}</b> waiting · ${now.nextMs == null ? 'the inbox is full' : 'next in ' + PT.etaText(now.nextMs)}<br><span class="muted">${starN(STAR)} arrive every 12 hours (a pack's worth), up to ${PT.PACK_INBOX_CAP} times.${signedIn() ? '' : ' Kept on this device: sign in to keep them on your account.'}</span>`));
	const c = btn('Collect', 'green', () => collectInbox(redraw), 'inbox'); c.disabled = !(now.inbox > 0); row.appendChild(c);
	return row;
}
function packsMenu() {
	const box = h('div', '');
	const draw = () => {
		box.innerHTML = '';
		box.appendChild(inboxRow(draw));
		box.appendChild(h('div', 'pe-note', `${walletText()} · ${COL.points} pack points<br>A pack costs <b>${starN(STAR)}</b>. Stars come from finishing a match (${starN(COLL.PACK_FOR_MATCH * STAR)}, ${starN(COLL.PACK_FOR_WIN * STAR)} for a win), solo battles, missions, and Pair of Pears. Every pack opened is ${COLL.POINTS_PER_PACK} pack points, to exchange for a card you want in your Collection.`));
		const row = h('div', 'pe-packs');
		for (const b of COLL.BOOSTERS) {
			const p = h('button', 'pe-pack', `<span class="set">${esc(b.set)}</span><img src="/overworld/data/pokemon/s${b.dex * 32}.png" alt=""><span class="nm">${b.name}</span><span class="n5">${COLL.packsOf(COL, b.id) ? `<b class="have">×${COLL.packsOf(COL, b.id)}</b> in hand` : '5 cards'}</span>`);
			p.type = 'button'; p.dataset.k = 'pack' + b.id; p.style.setProperty('--c', `var(--t-${b.type})`); p.disabled = !canOpenOf(b.id); p.setAttribute('aria-label', `Open a ${b.name} pack${COLL.packsOf(COL, b.id) ? `, ${COLL.packsOf(COL, b.id)} in hand` : COL.packs ? '' : ' for ' + STAR + ' stars'}`);
			p.addEventListener('click', () => openOne(b, draw));
			row.appendChild(p);
		}
		box.appendChild(row);
		const bar = h('div', 'pe-seg'); bar.append(btn('Wonder Pick', 'purple', () => wonderMenu(draw), 'wonder'), btn('Collection', 'orange', () => collectionMenu(), 'collection')); box.appendChild(bar);
		if (pad) pad.refresh();
	};
	draw(); loadInbox(() => { if (box.isConnected) draw(); });
	modal(box, { title: 'Open packs' });
}
/** Wonder Pick: today's packs (the same for everyone), each seen face up. One pack buys one of a pack's five cards, chosen blind. */
const wonderUsed = day => COLL.wonderUsed(COL, day);   // (kept with the collection, so it follows the account to every device)
function wonderMenu(redraw) {
	const day = COLL.wonderDay(Date.now()), board = COLL.wonderBoard(day), box = h('div', '');
	const draw = () => {
		box.innerHTML = ''; const used = wonderUsed(day);
		box.appendChild(h('div', 'pe-note', `${walletText()} · Today's packs, opened by someone else. Choose a pack: its five cards are turned over and shuffled, and you keep the one you pick. A pick costs ${starN(COLL.WONDER_COST * STAR)} (or a pack in hand). New packs every day.`));
		board.forEach((w, i) => {
			const b = COLL.BOOSTERS.find(x => x.id === w.booster), row = h('div', 'pe-wonder'), cards = h('div', 'pe-pulls');
			for (const id of w.ids) { const p = COLL.printInfo(id), c = card(p.card), e = handCard(c, null, rarMark(p.rarity) + (COLL.owned(COL, p.card) ? '' : '<span class="new">NEW</span>'), id); e.classList.add('small', 'pe-pull', 'up', 'r' + p.rarity); if (/[SH]$|^CR$/.test(p.rarity)) e.classList.add('holo'); e.addEventListener('click', () => inspect(c)); cards.appendChild(e); }
			const go = btn(used.includes(i) ? 'Picked today' : `Pick one of these <span class="muted">(${COL.packs ? plural(COLL.WONDER_COST, 'pack') : starN(COLL.WONDER_COST * STAR)})</span>`, 'purple', () => wonderPickUI(day, i, w, draw), 'wpick' + i); go.disabled = used.includes(i) || canOpen() < COLL.WONDER_COST;
			row.append(h('div', 'pe-note', `<b>${esc(b.name)}</b> pack · ${esc(b.set)}`), cards, go); box.appendChild(row);
		});
		if (pad) pad.refresh();
	};
	draw();
	modal(box, { title: 'Wonder Pick', onClose: () => redraw && redraw() });
}
function wonderPickUI(day, i, w, redraw) {
	if (canOpen() < COLL.WONDER_COST) { toast(`A pick costs ${starN(COLL.WONDER_COST * STAR)}. Finish a match to earn some.`); return; }
	const box = h('div', ''), row = h('div', 'pe-pulls'), note = h('div', 'pe-note', 'The five cards are face down and shuffled. Press one to keep it.'); let done = false;
	w.ids.forEach((_, n) => {
		const e = h('button', 'pe-card pf small pe-pull down'); e.type = 'button'; e.dataset.k = 'wcard' + n; e.setAttribute('aria-label', 'A face-down card'); e.style.fontSize = '';
		e.addEventListener('click', () => {
			if (done) return; done = true;
			if (wonderUsed(day).includes(i) || !buyPackIfNeeded()) { toast('That pack cannot be picked from now.'); closeModal(); return; }   // (the pick is paid for now: a pack in hand, or its price in stars)
			const r = COLL.wonderPick(COL, w.ids, packRand(), day, i); if (!r) { toast('That pack cannot be picked from now.'); closeModal(); return; }
			saveCol(r.col); play('cardSlide2', 1.3); dailyEvent({ packs: 1 });
			// the card kept goes where the player pressed; the other four are shown around it, so the pick can be seen to be fair
			const rest = w.ids.map((id, k) => k).filter(k => k !== r.index), slots = [...row.children];
			slots.forEach((s, k) => { const id = s === e ? w.ids[r.index] : w.ids[rest.shift()], p = COLL.printInfo(id), c = card(p.card), f = handCard(c, null, rarMark(p.rarity) + (s === e && r.got.isNew ? '<span class="new">NEW</span>' : ''), id); f.classList.add('small', 'pe-pull', 'up', 'r' + p.rarity); if (s === e) f.classList.add('got'); else f.classList.add('missed'); f.dataset.k = 'wcard' + k; f.addEventListener('click', () => inspect(c)); s.replaceWith(f); });
			note.innerHTML = `You got <b class="money">${esc(card(r.got.card).name)}</b>${r.got.isNew ? ', new to your collection' : ''}.`;
			if (pad) pad.refresh(true);
		});
		row.appendChild(e);
	});
	box.append(row, note);
	modal(box, { title: 'Pick a card', onClose: () => redraw && redraw() });
}
// ---- opening a pack, after the Battlecards pack screen (battlecards/packs.js, which follows Hearthstone's):
//   the sealed pack rests beside a glowing ring. DROPPING it on the ring opens it (so does the Open button, and Space):
//   a drag that misses springs back and spends nothing, and nothing is spent until then. The pack tears with a flash and
//   its cards are dealt face down. A face-down card under the pointer glows in the colour of its rarity; pressing it (or
//   Space, for the next one) turns it over, and a star, shiny or crown card throws a ring of light and sparks (a crown
//   two). When all are turned, Space opens another.
const RARITY_GLOW = { '1D': '#cfd6dc', '2D': '#cfd6dc', '3D': '#6fb7ff', '4D': '#c08cff', '1F': '#9be8ff', '2F': '#9be8ff', '3F': '#9be8ff', '1S': '#ffd75e', '2S': '#ffb347', '3S': '#ff7ad9', '1H': '#7dffb0', '2H': '#7dffb0', CR: '#ffe14a', N: '#cfd6dc' };
const isBig = r => /[SH]$|^CR$/.test(r);
function openOne(b, redraw) {
	if (!canOpenOf(b.id)) { toast(`A pack costs ${starN(STAR)}. Finish a match to earn some.`); return; }
	const have = COLL.packsOf(COL, b.id) + COL.packs;
	const box = h('div', 'pe-open'), mat = h('div', 'pe-openmat'), fxl = h('div', 'pe-openfx'), note = h('div', 'pe-note', `Drag the pack onto the ring to open it <span class="muted">(${have ? have + ' in hand' : 'costs ' + starN(STAR)})</span>`), bar = h('div', 'pe-seg');
	const ring = h('div', 'pe-ring'), pack = h('button', 'pe-pack pe-sealed', `<span class="set">${esc(b.set)}</span><img src="/overworld/data/pokemon/s${b.dex * 32}.png" alt="" draggable="false"><span class="nm">${b.name}</span><span class="n5">${COLL.packSize(b.id) === 1 ? '1 card' : COLL.packSize(b.id) + ' cards'}</span>`);
	pack.type = 'button'; pack.dataset.k = 'sealed'; pack.style.setProperty('--c', `var(--t-${b.type})`); pack.setAttribute('aria-label', `A sealed ${b.name} pack: drag it onto the ring, or press Open the pack`);
	let phase = 'idle', r = null, row = null, all = null, again = null, wrap = null, dragP = null;
	const scale = () => stage.getBoundingClientRect().width / stage.offsetWidth || 1;
	const centre = e2 => { const q = e2.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; };
	const overRing = () => { const [px, py] = centre(pack), [rx, ry] = centre(ring); return Math.hypot(px - rx, py - ry) < ring.getBoundingClientRect().width * 0.55; };
	const put = (x, y, anim) => { pack.classList.toggle('back', !!anim); pack.style.transform = x || y ? `translate(${x}px, ${y}px)` : ''; };
	// ---- dragging the sealed pack (mouse, finger or pen); a press without a drag does nothing: only the drop opens it
	pack.style.touchAction = 'none';
	pack.addEventListener('pointerdown', ev => { if (phase !== 'idle' || ev.button) return; dragP = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; try { pack.setPointerCapture(ev.pointerId); } catch (e) { /* the drag still follows the window */ } pack.classList.add('held'); });
	pack.addEventListener('pointermove', ev => { if (!dragP || phase !== 'idle') return; const k = scale(); put((ev.clientX - dragP.x) / k, (ev.clientY - dragP.y) / k, false); const on = overRing(); ring.classList.toggle('armed', on); pack.classList.toggle('armed', on); });
	const drop = () => { if (!dragP) return; dragP = null; pack.classList.remove('held'); const on = phase === 'idle' && overRing(); ring.classList.remove('armed'); pack.classList.remove('armed'); if (on) tear(); else { put(0, 0, true); play('cardSlide2', 0.8); } };
	pack.addEventListener('pointerup', drop); pack.addEventListener('pointercancel', () => { if (dragP) { dragP = null; pack.classList.remove('held', 'armed'); ring.classList.remove('armed'); put(0, 0, true); } });
	// ---- the pack opens: this is where it is paid for
	function tear() {
		if (phase !== 'idle') return;
		if (!buyPackIfNeeded(b.id)) { put(0, 0, true); toast(`A pack costs ${starN(STAR)}. Finish a match to earn some.`); return; }   // (a pack in hand, or one bought now with stars)
		r = COLL.openPack(COL, b.id, packRand());
		if (!r) { put(0, 0, true); toast('That pack could not be opened.'); return; }
		saveCol(r.col); dailyEvent({ packs: 1 }); phase = 'tearing'; openBtn.disabled = true;
		const [px, py] = centre(pack), [rx, ry] = centre(ring), k = scale(), m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(pack.style.transform) || [0, 0, 0];
		put(+m[1] + (rx - px) / k, +m[2] + (ry - py) / k, true);   // (it settles on the ring)
		pack.classList.add('tear'); ring.classList.add('lit'); play('cardSlide1'); play('coin1', 0.8);
		setTimeout(() => { if (wrap && wrap.isConnected) reveal(); }, ui.fast ? 60 : 560);
	}
	const left = () => (row ? row.querySelectorAll('.pe-pull.down').length : 0);
	// a ring of light and sparks from a card (a star, a shiny, a crown)
	const shock = (e2, col) => {
		const q = e2.getBoundingClientRect(), f = fxl.getBoundingClientRect(), k = scale(), x = (q.left + q.width / 2 - f.left) / k, y = (q.top + q.height / 2 - f.top) / k;
		const ringEl = h('i', 'pe-shock'); ringEl.style.left = x + 'px'; ringEl.style.top = y + 'px'; ringEl.style.setProperty('--rc', col); fxl.appendChild(ringEl); setTimeout(() => ringEl.remove(), 800);
		for (let n = 0; n < 14; n++) { const a = (n / 14) * 6.283 + Math.random() * 0.4, d = 70 + Math.random() * 90, sp = h('i', 'pe-spark'); sp.style.left = x + 'px'; sp.style.top = y + 'px'; sp.style.setProperty('--rc', col); sp.style.setProperty('--dx', Math.cos(a) * d + 'px'); sp.style.setProperty('--dy', Math.sin(a) * d + 'px'); fxl.appendChild(sp); setTimeout(() => sp.remove(), 750); }
	};
	const flip = (e2, p, c) => {
		e2.classList.remove('down'); e2.classList.add('up'); e2.setAttribute('aria-label', `${c.name}${p.isNew ? ', new' : ''}`); play('cardSlide2', p.rarity.endsWith('D') ? 1 : 1.4);
		if (isBig(p.rarity)) { const col = RARITY_GLOW[p.rarity]; shock(e2, col); if (p.rarity === 'CR' || p.rarity === '3S') setTimeout(() => { if (e2.isConnected) shock(e2, col); }, 140); play('coin1', p.rarity === 'CR' ? 1.5 : 1.2); }
		if (!left()) { phase = 'done'; const fresh = r.pulls.filter(x => x.isNew).length; note.innerHTML = (fresh ? `<b class="money">${plural(fresh, 'new card')}</b> for your collection.` : 'No new cards this time: the copies still count for your decks.') + (canOpenOf(b.id) ? ' <span class="muted">Space opens another.</span>' : ''); all.disabled = true; if (pad) pad.refresh(true); }
	};
	function reveal() {
		phase = 'revealing'; mat.innerHTML = ''; mat.classList.add('dealt'); row = h('div', 'pe-pulls');
		note.innerHTML = (r.rare ? '<b class="money">A rare pack!</b> ' : '') + 'Press a card to turn it over <span class="muted">(or Space, for the next one)</span>.';
		r.pulls.forEach((p, i) => {
			const c = card(p.id), e2 = handCard(c, null, rarMark(p.rarity) + (p.isNew ? '<span class="new">NEW</span>' : ''), p.id); e2.classList.add('small', 'pe-pull', 'down', 'deal', 'r' + p.rarity); if (isBig(p.rarity)) e2.classList.add('holo'); e2.dataset.k = 'pull' + i; e2.setAttribute('aria-label', 'A face-down card');
			e2.style.setProperty('--rc', RARITY_GLOW[p.rarity] || '#cfd6dc'); e2.style.animationDelay = (ui.fast ? 0 : i * 90) + 'ms';
			e2.addEventListener('click', () => { if (e2.classList.contains('down')) flip(e2, p, c); else inspect(c, null, null, [], p.id); });
			row.appendChild(e2);
		});
		mat.append(row, fxl);
		all = btn('Turn all over', 'grey', () => { [...row.querySelectorAll('.pe-pull.down')].forEach(e2 => e2.click()); }, 'flipall');
		again = btn(`Open another <span class="muted">(${COLL.packsOf(COL, b.id) + COL.packs ? (COLL.packsOf(COL, b.id) + COL.packs) + ' in hand' : starN(STAR)})</span>`, 'green', () => { closeModal(); openOne(b, redraw); }, 'again'); again.disabled = !canOpenOf(b.id);
		bar.innerHTML = ''; bar.append(all, again);
		if (pad) pad.refresh(true);
	}
	// Space keeps the rhythm, as in Battlecards: open the pack, turn the next card, then open another
	const advance = () => { if (phase === 'idle') tear(); else if (phase === 'revealing') { const n = row.querySelector('.pe-pull.down'); if (n) n.click(); } else if (phase === 'done' && again && !again.disabled) again.click(); };
	const onKey = ev => { if ((ev.key === ' ' || ev.code === 'Space') && topModal() && topModal().el === wrap && !isTyping(document.activeElement)) { ev.preventDefault(); ev.stopPropagation(); advance(); } };
	addEventListener('keydown', onKey, true);
	const openBtn = btn('Open the pack', 'green', () => tear(), 'open');
	bar.append(openBtn);
	mat.append(ring, pack);
	box.append(mat, note, bar);
	wrap = modal(box, { title: `${b.name} pack`, onClose: () => { removeEventListener('keydown', onKey, true); if (redraw) redraw(); } });
}
// ---- dust: the account's (the dust Battlecards crafts with). The server spends and pays it (server/pocket_collection.mjs
// pkdust-*); here are the buttons. DUST is null for a guest, or until the account has answered.
let DUST = null;
const dustOn = () => !!(net && net.isLoggedIn());
const dustId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
/** One dust action, start to finish: what this device has not sent yet goes up first, the server does it, and the
 *  collection as the account now has it comes back down. -> the answer, or { error }. */
let dustBusy = false;
async function dustDo(action, body) {
	if (dustBusy) return { error: 'one at a time' }; dustBusy = true;
	try {
		if (colSync) await colSync.now();
		let r = null; try { r = await net.call(action, body || {}); } catch (e) { r = null; }
		if (!r) return { error: 'The account could not be reached. Nothing was spent.' };
		if (typeof r.dust === 'number') DUST = r.dust;
		if (colSync) await colSync.now();
		return r;
	} finally { dustBusy = false; }
}
function collectionMenu() {
	const st = { filter: 'All', show: 'all' }, box = h('div', '');
	if (dustOn()) dustDo('pkdust-settle').then(() => { if (box.isConnected) draw(); });   // (the balance; and anything a closed page left half done is finished)
	const FILTERS = ['All', 'Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless', 'Trainers'];
	const draw = () => {
		const y = box.querySelector('.pe-grid') ? box.querySelector('.pe-grid').scrollTop : 0;
		box.innerHTML = '';
		box.appendChild(h('div', 'pe-note pe-colhead', `<b class="money">${COLL.uniqueOwned(COL)} / ${CARDS.length}</b> cards · ${COL.points} pack points · ${walletText()}${dustOn() ? ` · <b class="money pe-dust" data-k="dust">${DUST == null ? '…' : DUST.toLocaleString()} dust</b>` : ''}<br>${syncNote()}`));
		const seg = h('div', 'pe-seg'); for (const f of FILTERS) seg.appendChild(btn(f, 'grey' + (st.filter === f ? ' on' : ''), () => { st.filter = f; draw(); pad && pad.refresh(true); }, 'f' + f)); box.appendChild(seg);
		const seg2 = h('div', 'pe-seg'); for (const [k, label] of [['all', 'Every card'], ['own', 'Owned'], ['lack', 'Not owned']]) seg2.appendChild(btn(label, 'grey' + (st.show === k ? ' on' : ''), () => { st.show = k; draw(); pad && pad.refresh(true); }, 's' + k));
		seg2.appendChild(btn('Open packs', 'red', () => packsMenu(), 'packs'));
		seg2.appendChild(btn('Set rewards', 'orange', () => setRewardsMenu(), 'setrewards'));
		seg2.appendChild(btn('Binder', 'orange', () => binderMenu(), 'binder'));
		// spare copies (past the two a deck holds) can all be broken down for dust at once
		{ const sp = COLL.spares(COL), copies = sp.list.reduce((a, x) => a + x[1], 0);
			if (dustOn() && copies) seg2.appendChild(btn(`Break down ${plural(copies, 'spare copy').replace('copys', 'copies')} <span class="muted">(+${sp.dust.toLocaleString()} dust)</span>`, 'grey', () => {
				const q = h('div', 'pe-list'); q.appendChild(h('div', 'pe-note', `You keep two of every printing (what a deck can hold). The <b>${copies}</b> beyond that become <b class="money">${sp.dust.toLocaleString()} dust</b>, for making cards here or in Battlecards. This cannot be undone.`));
				q.appendChild(btn(`Break them down for ${sp.dust.toLocaleString()} dust`, 'orange', async () => { closeModal(); const r = await dustDo('pkdust-break', { all: true, id: dustId() }); if (r.error) toast(r.error); else { play('coin1'); toast(`${r.broke} spare ${r.broke === 1 ? 'copy' : 'copies'} broken down: +${r.gained.toLocaleString()} dust.`); } draw(); }, 'breakall-yes'));
				q.appendChild(btn('Keep them', 'grey', () => closeModal(), 'breakall-no'));
				modal(q, { title: 'Break down spare copies' });
			}, 'breakall')); }
		box.appendChild(seg2);
		const grid = h('div', 'pe-grid pe-col');
		for (const c of CARDS) {
			if (st.filter === 'Trainers' ? c.kind === 'pokemon' : st.filter !== 'All' && !(c.kind === 'pokemon' && ofType(c, st.filter))) continue;
			const n = COLL.owned(COL, c.id); if (st.show === 'own' ? !n : st.show === 'lack' && n) continue;
			const best = n ? COLL.printInfo(COLL.bestPrint(COL, c.id)) : null;
			const e = handCard(c, null, n ? `<span class="have">×${n}</span>${best && !/D$|^N$/.test(best.rarity) ? rarMark(best.rarity) : ''}` : '', best ? best.id : null); e.classList.add('small'); if (!n) e.classList.add('lack'); else if (best && !/D$|^N$/.test(best.rarity)) e.classList.add('holo'); e.dataset.k = 'c' + c.id;
			e.setAttribute('aria-label', `${c.name}, ${n ? 'you own ' + n : 'not owned'}`);
			e.addEventListener('click', () => cardActions(c, best ? best.id : null, draw));
			grid.appendChild(e);
		}
		if (!grid.children.length) grid.appendChild(h('div', 'pe-note', 'No cards here.'));
		box.appendChild(grid); grid.scrollTop = y;
		if (pad) pad.refresh();
	};
	draw();
	modal(box, { title: 'Collection' });
}
/** What can be done with a card of the collection: exchange pack points for it, make a printing with dust, break a spare
 *  down (the collection and the binder). `shown`: the printing to show; `draw`: redraw the screen after. */
function cardActions(c, shown, draw) {
	const cost = COLL.exchangeCost(c.id), res = cost ? COLL.exchange(COL, c.id) : null;
	const acts = [[cost ? `Exchange ${cost} pack points for one` : 'Not found in packs or the exchange', () => { saveCol(res); play('cardSlide1'); closeModal(); toast(`${c.name} joins your collection.`); draw(); }, !cost ? (c.id === COLL.SECRET ? 'own every Pokémon from 1 to 150' : 'a promo card') : typeof res === 'string' ? res : '', 'exchange']];
	// dust: make any of this card's printings; break down a spare copy of one
	if (dustOn()) for (const pid of c.printings || []) {
		const p = COLL.printInfo(pid), price = p && COLL.craftCost(pid); if (!price) continue;
		const lk = lookOf(pid), what = `${rarMark(p.rarity)}${lk ? ' ' + LOOK_NAME[lk] : ''}`, have = COL.prints[pid] || 0;
		acts.push([`Make ${what} <span class="muted">${esc(pid)} (${price.toLocaleString()} dust${have ? ', you have ' + have : ''})</span>`, async () => { closeModal(); const r = await dustDo('pkdust-craft', { print: pid, id: dustId() }); if (r.error) toast(r.error); else { play('cardSlide1'); toast(`${c.name} ${COLL.RARITY[p.rarity]} made for ${price.toLocaleString()} dust.`); } draw(); }, DUST == null ? 'asking the account…' : DUST < price ? `you have ${DUST.toLocaleString()} dust` : have >= COLL.MAX_COPIES ? 'you cannot hold more' : '', 'craft:' + pid]);
		if (COLL.spareOf(COL, pid) > 0) acts.push([`Break down a spare ${what} <span class="muted">(+${COLL.dustValue(pid)} dust, ${COLL.spareOf(COL, pid)} spare)</span>`, async () => { closeModal(); const r = await dustDo('pkdust-break', { print: pid, n: 1, id: dustId() }); if (r.error) toast(r.error); else { play('coin1'); toast(`+${r.gained} dust.`); } draw(); }, '', 'break:' + pid]);
	}
	inspect(c, null, null, acts, shown);
}
/** Stars for a finished match (once per match: a reload does not pay again). -> how many stars. */
function payPacks(won, key) {
	if (SV.prefs().paid === key) return 0;
	SV.setPref('paid', key);
	return payStars(won ? COLL.PACK_FOR_WIN : COLL.PACK_FOR_MATCH);
}

function mainMenu() {
	closeAll();
	const box = h('div', 'pe-list'), saved = SV.loadRun();
	if (saved) box.appendChild(btn(`Continue match <span class="muted">(${esc(E.labelOf(saved.S))})</span>`, 'green big', () => resume(saved), 'continue'));
	if (!SV.prefs().tutored && !saved) box.appendChild(btn('Learn to play <span class="muted">(a guided first match)</span>', 'green big', () => startTutorial(), 'learn'));
	box.appendChild(btn('New match', 'blue big b-new', () => newMatchMenu(), 'new'));
	box.appendChild(btn(`Solo battles <span class="muted">(${Object.keys(SV.solo().cleared).length} / ${SOLO_ALL.length})</span>`, 'green big', () => soloMenu(), 'solo'));
	box.appendChild(btn('Play online', 'purple big', () => onlineMenu(), 'online'));
	rejoinOffer(box);
	packBtn = btn('', 'red', () => packsMenu(), 'packs'); packLabel(); box.appendChild(packBtn);
	box.appendChild(btn('Collection', 'orange', () => collectionMenu(), 'collection'));
	box.appendChild(btn('Deck builder', 'orange', () => deckBuilder(), 'decks'));
	{ const d = SO.dailyState(SV.solo(), SO.dailyDay(Date.now())), due = d.some(m => m.done && !m.paid); box.appendChild(btn(`Daily missions <span class="muted">(${d.filter(m => m.done).length} / ${d.length}${due ? ', stars to claim' : ''})</span>`, due ? 'green' : 'orange', () => dailyMenu(), 'daily')); }
	{ const run = draftRun(), live = run && !DR.over(run); box.appendChild(btn(`Draft ${live ? `<span class="muted">(match ${run.results.length + 1} of ${DR.DRAFT.MATCHES})</span>` : `<span class="muted">(${starN(DR.DRAFT.FEE)})</span>`}`, 'purple', () => draftMenu(), 'draft')); }
	{ const ev = EV.eventOf(Date.now()), wk = EV.weekOf(Date.now()), won = Array.from({ length: EV.EVENT_BATTLES }, (_, i) => !!SV.solo().paid[EV.eventKey(wk, i)]).filter(Boolean).length; box.appendChild(btn(`Weekly event: ${esc(ev.name)} <span class="muted">(${won} / ${EV.EVENT_BATTLES})</span>`, 'purple', () => eventMenu(), 'event')); }
	box.appendChild(btn('Deck missions', 'orange', () => missionsMenu(), 'missions'));
	{ const have = Object.keys(SV.solo().emblems || {}).length; box.appendChild(btn(`Emblems <span class="muted">(${have} / ${EMBLEMS.length})</span>`, 'orange', () => emblemsMenu(), 'emblems')); }
	{ const due = setsDue(setState(COL, SV.solo())); box.appendChild(btn(`Set rewards${due ? ` <span class="pe-due">${starN(due * STAR)} to claim</span>` : ''}`, 'orange', () => setRewardsMenu(), 'setrewards')); }
	box.appendChild(btn('Trade', 'orange', () => tradeMenu(), 'trade'));
	box.appendChild(btn('Match history', 'grey', () => replaysMenu(), 'replays'));
	box.appendChild(btn('Options', 'grey', () => settingsMenu(), 'options'));
	box.appendChild(btn('How to play', 'grey', () => howTo(), 'how'));
	if (SV.prefs().tutored || saved) box.appendChild(btn('Guided match', 'grey', () => startTutorial(), 'learn'));
	box.appendChild(h('div', 'pe-note', 'Pokémon TCG Pocket\'s Genetic Apex cards, for 2 to 4 players,<br>with two Active Pokémon and the video games\' type chart.'));
	// (opened from the overworld's card table in the Vermilion Pokémon Fan Club: the way back to it)
	if (FROM_OVERWORLD) { const a = h('a', 'pe-note pe-back', '← Back to the overworld'); a.href = '/overworld/'; a.dataset.k = 'back'; box.appendChild(a); }
	modal(box, { title: 'Pocket Enhanced', noClose: true });
}
// Which decks a player may play (owner, 2026-11-17): the four they start with, always; any other ready-made, theme or
// saved deck once they own its cards. (Computer players use any deck.)
let ownCache = null;
const nameCounts = () => { if (ownCache && ownCache.col === COL) return ownCache.m; const m = new Map(); for (const c of CARDS) { const n = COLL.owned(COL, c.id); if (n) m.set(c.name, (m.get(c.name) || 0) + n); } ownCache = { col: COL, m }; return m; };
function ownsDeck(deck) { const need = new Map(), have = nameCounts(); for (const id of deck) { const c = card(id); if (!c) return false; need.set(c.name, (need.get(c.name) || 0) + 1); } for (const [n, k] of need) if ((have.get(n) || 0) < k) return false; return true; }
/** A deck's chosen printings, as far as they are still owned (a printing traded away goes back to the standard card). */
const ownedPrints = prints => Object.fromEntries(Object.entries(prints || {}).filter(([, p]) => (COL.prints[p] || 0) > 0));
/** The printing a player at the table chose for a card (it is in the view: everyone sees it), or null for the standard card. */
const printOf = (seat, id) => (V && V.players[seat] && V.players[seat].prints && V.players[seat].prints[id]) || null;
const canPlay = d => COLL.START_DECKS.includes(d.id) || ownsDeck(d.get().deck);
/** Every ready-made and saved deck (the deck builder loads from these); allDecks() is the ones the player may play now. */
const everyDeck = () => [...SV.listDecks().map(d => ({ id: 'my:' + d.name, name: d.name + ' (yours)', get: () => ({ deck: d.deck.slice(), energy: d.energy.slice(), prints: ownedPrints(d.prints) }) })), ...STARTERS.map(s => ({ id: s.id, name: s.name, get: () => starterDeck(s.id) }))];
const allDecks = () => everyDeck().filter(canPlay);
const lockedNote = () => { const n = everyDeck().length - allDecks().length; return n ? h('div', 'pe-note pe-locked', `${plural(n, 'more ready-made deck')} and Pocket's own decks unlock as you collect their cards.`) : null; };
// A search box inside a menu that is redrawn as you type. The box itself is kept from one redraw to the next (a menu's
// state holds it), and takes the typing back before the next key can arrive, so no letter is lost while the list redraws.
function searchBox(st, key, draw, label) {
	let i = st['box:' + key];
	if (!i) {
		i = st['box:' + key] = h('input'); i.type = 'search'; i.maxLength = 30; i.value = st[key] || ''; i.placeholder = label; i.setAttribute('aria-label', label); i.dataset.k = 'q' + key; i.className = 'pe-search';
		i.addEventListener('input', () => { st[key] = i.value; st.typing = key; draw(); });
	}
	if (st.typing === key) { st.typing = null; queueMicrotask(() => { if (i.isConnected) i.focus(); }); }
	return i;
}
const SET_NAMES = [...SOLO_SETS.map(s => [s.code, s.set]), ['SP1', 'First Partners'], ['P-A', 'Promo-A'], ['P-B', 'Promo-B'], ['P-C', 'Promo-C']];
// Pocket's own decks (js/data/theme_decks.js): too many for a row of buttons, so they open by set.
const THEME_SETS = [...new Set(THEME_DECKS.map(t => t.set))];
const themeEntry = t => ({ id: t.id, name: t.name, get: () => ({ deck: t.cards.slice(), energy: t.energy.slice() }) });
/** Any deck at all, owned or not (a computer player's). */
const anyDeck = id => everyDeck().find(x => x.id === id) || themeEntry(THEME_DECKS.find(x => x.id === id));
const findDeck = id => { const d = allDecks().find(x => x.id === id); if (d) return d; const t = THEME_DECKS.find(x => x.id === id); return t && ownsDeck(t.cards) ? themeEntry(t) : null; };
function themePicker(box, st, draw, pick) {
	const mineT = THEME_DECKS.filter(t => ownsDeck(t.cards));   // (a theme deck is played once its cards are owned)
	const cur = mineT.find(t => t.id === st.deck); if (cur && st.tset === undefined) st.tset = cur.set;
	{ const ln = lockedNote(); if (ln) box.appendChild(ln); }
	if (!mineT.length) return;
	const row = h('div', 'pe-seg'); row.appendChild(btn(cur ? `Pocket's deck: ${esc(cur.name)} ${st.tset ? '▾' : '▸'}` : `Pocket's own decks you can play (${mineT.length} of ${THEME_DECKS.length}) ${st.tset ? '▾' : '▸'}`, 'grey' + (cur ? ' on' : ''), () => { st.tset = st.tset ? '' : (cur ? cur.set : THEME_SETS[0]); draw(); pad && pad.refresh(true); }, 'theme')); box.appendChild(row);
	if (!st.tset) return;
	const sets = h('div', 'pe-seg'); sets.style.maxWidth = '900px'; THEME_SETS.forEach((s, i) => sets.appendChild(btn(esc(s), 'grey' + (st.tset === s ? ' on' : ''), () => { st.tset = s; draw(); pad && pad.refresh(true); }, 'ts' + i))); box.appendChild(sets);
	const find = h('div', 'pe-seg'); find.appendChild(searchBox(st, 'tq', draw, 'Search Pocket\'s decks')); box.appendChild(find);
	const q = (st.tq || '').trim().toLowerCase();   // (a search looks through every set)
	const dk = h('div', 'pe-seg'); dk.style.maxWidth = '900px'; for (const t of mineT.filter(t => (q ? t.name.toLowerCase().includes(q) || t.cards.some(id => card(id).name.toLowerCase().includes(q)) : t.set === st.tset)).slice(0, 40)) dk.appendChild(btn(`${esc(t.name)} <small>${t.energy.map(esc).join(' / ')}</small>`, 'grey' + (st.deck === t.id ? ' on' : ''), () => { st.deck = t.id; pick && pick(t.id); draw(); pad && pad.refresh(true); }, 'd' + t.id)); box.appendChild(dk);
}
/** Singles or Doubles, asked wherever a battle is started (the last choice is kept). Singles is Pocket's own table: one
 *  Active Pokémon and a Bench of three. Doubles is this game's: two Active Pokémon and a Bench of four. */
function modeSeg(st, redraw) {
	const w = h('div', ''), seg = h('div', 'pe-seg');
	const paint = () => { for (const b of seg.children) b.classList.toggle('on', (b.dataset.k === 'msingles') === !!st.singles); note.innerHTML = st.singles ? '1 Active Pokémon and 3 on the Bench, as in Pokémon TCG Pocket.' : '2 Active Pokémon and 4 on the Bench: both attack each turn.'; };
	const set = v => { st.singles = v; SV.setPref('mode', v ? 'singles' : 'doubles'); if (redraw) redraw(); else paint(); pad && pad.refresh(true); };
	seg.append(btn('Singles', 'grey', () => set(true), 'msingles'), btn('Doubles', 'grey', () => set(false), 'mdoubles'));
	const note = h('div', 'pe-note pe-modenote'); w.append(seg, note); paint();
	return w;
}
/** How well the computer players play, asked where a match with them starts (the last choice is kept; Hard until one is made). */
function botSeg(st) {
	const w = h('div', ''), seg = h('div', 'pe-seg'), note = h('div', 'pe-note pe-botnote');
	const paint = () => { for (const b of seg.children) b.classList.toggle('on', (b.dataset.k === 'beasy') === !!st.easy); note.innerHTML = st.easy ? 'Easy: they play by simple habits, and do not think about your reply.' : 'Hard: they try each play in their head first, and pick the one that works out best.'; };
	const set = v => { st.easy = v; SV.setPref('bots', v ? 'easy' : 'hard'); paint(); pad && pad.refresh(true); };
	seg.append(btn('Easy', 'grey', () => set(true), 'beasy'), btn('Hard', 'grey', () => set(false), 'bhard'));
	w.append(seg, note); paint();
	return w;
}
function newMatchMenu() {
	const p = SV.prefs(), st = { n: [2, 3, 4].includes(p.players) ? p.players : 2, deck: p.deck || STARTERS[0].id, singles: p.mode === 'singles', easy: p.bots === 'easy' };
	const box = h('div', '');
	const draw = () => {
		box.innerHTML = '';
		const decks = allDecks(); if (!findDeck(st.deck)) st.deck = decks[0].id;
		box.appendChild(h('div', 'pe-note', 'Battle'));
		box.appendChild(modeSeg(st));
		box.appendChild(h('div', 'pe-note', 'Computer players'));
		box.appendChild(botSeg(st));
		box.appendChild(h('div', 'pe-note', 'Players'));
		const seg = h('div', 'pe-seg'); for (const n of [2, 3, 4]) seg.appendChild(btn(String(n), 'grey' + (st.n === n ? ' on' : ''), () => { st.n = n; draw(); pad && pad.refresh(true); }, 'n' + n)); box.appendChild(seg);
		box.appendChild(h('div', 'pe-note', 'Your deck'));
		const dk = h('div', 'pe-seg'); dk.style.maxWidth = '900px'; for (const d of decks) dk.appendChild(btn(esc(d.name), 'grey' + (st.deck === d.id ? ' on' : ''), () => { st.deck = d.id; draw(); pad && pad.refresh(true); }, 'd' + d.id)); box.appendChild(dk);
		themePicker(box, st, draw);
		box.appendChild(btn('Start', 'green big wide b-go', () => { SV.setPref('players', st.n); SV.setPref('deck', st.deck); startMatch(st.n, findDeck(st.deck).get(), null, st.singles, st.easy); }, 'start'));
	};
	draw();
	modal(box, { title: 'New match' });
}
// ------------------------------------------------------------------ solo battles and deck missions (solo.js)
const SOLO_ALL = SOLO_SETS.flatMap(s => s.tiers.flatMap(t => t.battles.map(b => ({ id: b.id, name: b.name, set: s.set, tier: t.name, energy: b.energy, deck: b.cards.split(','), tasks: b.tasks, text: b.tasks.map(i => SOLO_TASKS[i]) }))));
const soloById = id => SOLO_ALL.find(b => b.id === id) || null;
function soloMenu(at) {
	const p = SV.prefs(), st = { deck: p.deck || STARTERS[0].id, set: (at && at.set) || p.sset || SOLO_SETS[0].set, tier: (at && at.tier) || p.stier || '' };
	const box = h('div', '');
	const draw = () => {
		box.innerHTML = '';
		const prog = SV.solo(), decks = allDecks(); if (!findDeck(st.deck)) st.deck = decks[0].id;
		box.appendChild(h('div', 'pe-note', `<span class="pe-sync pe-ssync" data-sync="${soloSync ? soloSync.status() : 'guest'}">${SYNC_NOTE[soloSync ? soloSync.status() : 'guest'].replace('Sign in to keep it', 'Sign in to keep your progress')}</span>`));
		const set = SOLO_SETS.find(s => s.set === st.set) || SOLO_SETS[0], tier = set.tiers.find(t => t.name === st.tier) || set.tiers.find(t => t.battles.some(b => !prog.cleared[b.id])) || set.tiers[0];
		st.set = set.set; st.tier = tier.name;
		box.appendChild(h('div', 'pe-note', `Pokémon TCG Pocket's solo battles, against the decks it uses. <b>${Object.keys(prog.cleared).length}</b> of ${SOLO_ALL.length} cleared.<br>A first clear earns a pack, and so does doing all of a battle's tasks.`));
		// (the deck list is long: it stays folded until asked for, so the battles are in reach)
		const cur = h('div', 'pe-seg'); cur.appendChild(btn(`Your deck: <b>${esc(findDeck(st.deck).name)}</b> ${st.open ? '▾' : '▸'}`, 'orange', () => { st.open = !st.open; draw(); pad && pad.refresh(true); }, 'sdeck')); box.appendChild(cur);
		if (st.open) {
			const dk = h('div', 'pe-seg'); dk.style.maxWidth = '900px'; for (const d of decks) dk.appendChild(btn(esc(d.name), 'grey' + (st.deck === d.id ? ' on' : ''), () => { st.deck = d.id; SV.setPref('deck', d.id); draw(); pad && pad.refresh(true); }, 'd' + d.id)); box.appendChild(dk);
			themePicker(box, st, draw, id => SV.setPref('deck', id));
		}
		box.appendChild(h('div', 'pe-note', 'Set'));
		const ss = h('div', 'pe-seg'); ss.style.maxWidth = '900px'; SOLO_SETS.forEach((s, i) => { const all = s.tiers.flatMap(t => t.battles); ss.appendChild(btn(`${esc(s.set)} <small>${all.filter(b => prog.cleared[b.id]).length}/${all.length}</small>`, 'grey' + (s === set ? ' on' : ''), () => { st.set = s.set; st.tier = ''; SV.setPref('sset', s.set); draw(); pad && pad.refresh(true); }, 'ss' + i)); }); box.appendChild(ss);
		const ts = h('div', 'pe-seg'); set.tiers.forEach((t, i) => ts.appendChild(btn(`${esc(t.name)} <small>${t.battles.filter(b => prog.cleared[b.id]).length}/${t.battles.length}</small>`, 'grey' + (t === tier ? ' on' : ''), () => { st.tier = t.name; SV.setPref('stier', t.name); draw(); pad && pad.refresh(true); }, 'st' + i))); box.appendChild(ts);
		const list = h('div', 'pe-list');
		for (const b of tier.battles) { const had = prog.tasks[b.id] || []; list.appendChild(btn(`${prog.cleared[b.id] ? '✓ ' : ''}${esc(b.name)} <small>${b.energy.map(e => en(e)).join('')} tasks ${had.filter(Boolean).length}/${b.tasks.length}</small>`, prog.cleared[b.id] ? 'grey' : 'blue', () => soloBattle(b.id, st.deck), 'sb' + b.id)); }
		box.appendChild(list);
		if (pad) pad.refresh();
	};
	draw();
	modal(box, { title: 'Solo battles' });
}
function soloBattle(id, deckId) {
	const b = soloById(id), prog = SV.solo(), pickd = findDeck(deckId) || allDecks()[0], mine = pickd.get(), had = prog.tasks[id] || [];
	const box = h('div', '');
	box.appendChild(h('div', 'pe-note', `${esc(b.set)} · ${esc(b.tier)} · their Energy: ${b.energy.map(e => en(e)).join('')}${prog.cleared[id] ? ' · <b style="color:var(--green)">cleared</b>' : ''}<br>Your deck: <b>${esc(pickd.name)}</b>`));
	const tasks = h('div', 'pe-tasks');
	b.text.forEach((t, i) => { const fits = SO.deckFits(SO.parseTask(t), mine.deck); tasks.appendChild(h('div', 'pe-task' + (had[i] ? ' done' : ''), `${had[i] ? '✓' : '○'} ${esc(t)}${!had[i] && !fits ? ' <small class="red">(not with this deck)</small>' : ''}`)); });
	box.appendChild(tasks);
	const list = h('div', 'pe-list');
	const st = { singles: SV.prefs().mode === 'singles' };
	box.appendChild(modeSeg(st));
	list.appendChild(btn('Battle', 'green big b-go', () => startSolo(b, mine, null, st.singles), 'sgo'));
	box.appendChild(list);
	modal(box, { title: b.name });
}
function startSolo(b, mine, seed, singles) {
	seed = seed || SEED_PARAM || SV.randomSeed();
	const players = [{ name: (net && net.myName()) || 'Red', ai: false, ...mine }, { name: b.name.replace(/ Deck$/, '').slice(0, 24), ai: true, deck: b.deck.slice(), energy: b.energy.slice() }];
	const config = { seed, players, rules: E.RULES, solo: b.id, ...(singles ? { opts: { singles: true, maxTurns: 50 } } : {}) };   // (Pocket's solo battles allow 50 turns)   // (`solo`: which battle this is; the engine does not read it)
	begin({ config, actions: [], you: 0 }, E.createGame(config));
}
// ---- emblems (emblems.js): earned once, kept on the account in the solo progress ----
/** What the emblems are tested against: everything here is already kept by the game. */
function emblemCtx() {
	const rec = SV.record(), prog = SV.solo(), paid = SV.prefs().trainerPaid || {};
	return { won: rec.won, onlineWon: rec.onlineWon, typeWins: rec.types || {}, soloCleared: Object.keys(prog.cleared).length, soloTotal: SOLO_ALL.length,
		gymsBeaten: Object.keys(paid).filter(k => trainerByKey(k)).length, gymsTotal: TRAINERS.length,
		setsDone: Object.keys(prog.paid).filter(k => /^s:[\w-]+:100$/.test(k)).length, unique: COLL.uniqueOwned(COL), opened: COL.opened || 0, rating: SV.prefs().rankBest || 0 };
}
/** Note any emblem now met (said with a message unless the caller shows them itself) -> the ids newly earned. */
function checkEmblems(say = false) {
	const ids = newEmblems(SV.solo(), emblemCtx());
	if (!ids.length) return [];
	const p = SV.solo(); p.emblems = { ...(p.emblems || {}) }; for (const id of ids) p.emblems[id] = 1; keepSolo(p);
	play('coin1');
	if (say) toast(`Emblem earned: ${ids.map(id => emblemById(id).name).join(', ')}!`);
	return ids;
}
let emblemT = 0;
const emblemSoon = () => { clearTimeout(emblemT); emblemT = setTimeout(() => { if (!(MODE === 'normal' && G && !V?.over)) checkEmblems(true); }, 400); };
const emblemTag = e => `<span class="pe-emb" title="${esc(e.name)}">${esc(e.icon)}</span>`;
function emblemsMenu() {
	const box = h('div', '');
	const draw = () => {
		box.innerHTML = '';
		const have = SV.solo().emblems || {}, shown = SV.prefs().emblem;
		box.appendChild(h('div', 'pe-note', `${Object.keys(have).length} of ${EMBLEMS.length} earned. Choose an earned one to show beside your name.`));
		const grid = h('div', 'pe-list pe-emblems');
		for (const e of EMBLEMS) {
			const got = !!have[e.id], b = h('button', 'pe-opt pe-embrow' + (got ? ' got' : '') + (shown === e.id ? ' on' : ''), `${emblemTag(e)} <b>${esc(e.name)}</b>${shown === e.id ? ' <span class="muted">(shown)</span>' : ''}<span class="why">${got ? '✓ ' : ''}${esc(e.how)}</span>`);
			b.type = 'button'; b.dataset.k = 'em' + e.id; b.disabled = !got;
			b.addEventListener('click', () => { SV.setPref('emblem', shown === e.id ? '' : e.id); draw(); pad && pad.refresh(true); });
			grid.appendChild(b);
		}
		box.appendChild(grid);
	};
	draw();
	modal(box, { title: 'Emblems' });
}
/** The binder: a set's pages, every printing in its own place; one owned shows its art, one missing is a numbered
 *  silhouette. A tap: what can be done with it (cardActions: exchange, make with dust). (Owner's third improvement list,
 *  2026-11-18, "yes to all".) */
function binderMenu(set) {
	const sets = [...SET_PRINTS.keys()], st = { set: sets.includes(set) ? set : sets.includes(SV.prefs().binderSet) ? SV.prefs().binderSet : sets[0] };
	const box = h('div', '');
	const draw = () => {
		const y = box.querySelector('.pe-binder') ? box.querySelector('.pe-binder').scrollTop : 0;
		box.innerHTML = '';
		const seg = h('div', 'pe-seg'); seg.style.maxWidth = '1100px';
		for (const s of sets) seg.appendChild(btn(esc((SET_NAMES.find(x => x[0] === s) || [0, s])[1]), 'grey' + (st.set === s ? ' on' : ''), () => { st.set = s; SV.setPref('binderSet', s); draw(); pad && pad.refresh(true); }, 'bset' + s));
		box.appendChild(seg);
		const prints = SET_PRINTS.get(st.set) || [], dex = new Set(SET_DEX.get(st.set) || []), have = prints.filter(p => (COL.prints[p] || 0) > 0);
		box.appendChild(h('div', 'pe-note', `<b>${have.length} / ${prints.length}</b> printings · ◆ cards ${have.filter(p => dex.has(p)).length} / ${dex.size}`));
		const page = h('div', 'pe-binder');
		for (const p of prints) {
			const info = COLL.printInfo(p), c = info && card(info.card); if (!c) continue;
			const n = COL.prints[p] || 0, num = p.slice(p.lastIndexOf('-') + 1);
			let e;
			if (n) { e = handCard(c, null, `<span class="have">×${n}</span>${!/D$|^N$/.test(info.rarity) ? rarMark(info.rarity) : ''}`, p); e.classList.add('small'); if (!/D$|^N$/.test(info.rarity)) e.classList.add('holo'); }
			else { e = h('button', 'pe-slot', `<span class="num">${esc(num)}</span><span class="nm">${esc(c.name)}</span><span class="rar">${esc(COLL.RARITY[info.rarity] || '')}</span>`); e.type = 'button'; }
			e.dataset.k = 'bs' + p; e.setAttribute('aria-label', `${c.name}, number ${num}, ${n ? 'owned' : 'missing'}`);
			e.addEventListener('click', () => cardActions(c, p, draw));
			page.appendChild(e);
		}
		box.appendChild(page); page.scrollTop = y;
		if (pad) pad.refresh();
	};
	draw();
	modal(box, { title: 'Binder' });
}
/** Set rewards: each set's Pokédex (its ◆ cards), how much of it is owned, and the milestones it pays (setrewards.js). */
function setRewardsMenu() {
	const box = h('div', '');
	const draw = () => {
		box.innerHTML = '';
		const states = setState(COL, SV.solo()), due = setsDue(states);
		box.appendChild(h('div', 'pe-note', `Own a set's ◆ cards (any printing of each) to earn stars along the way: ${SO.SET_MILESTONES.map(([at, n]) => `${at}% ${starN(n * STAR)}`).join(' · ')}. Each is paid once.`));
		if (due) { const l = h('div', 'pe-list'); l.appendChild(btn(`Claim ${starN(due * STAR)}`, 'green big', () => { const c = claimSets(SV.solo(), setState(COL, SV.solo())); keepSolo(c.progress); setDueSaid = 0; toast(`+${starN(payStars(c.packs))}`); draw(); pad && pad.refresh(true); }, 'sclaim')); box.appendChild(l); }
		const list = h('div', 'pe-list pe-sets');
		for (const s of states) {
			const name = (SET_NAMES.find(x => x[0] === s.set) || [0, s.set])[1];
			const marks = SO.SET_MILESTONES.map(([at, n]) => `<span class="pe-ms${s.reached.includes(at) ? (s.due.includes(at) ? ' due' : ' paid') : ''}" title="${at}%: ${starN(n * STAR)}">${s.reached.includes(at) && !s.due.includes(at) ? '✓' : '○'} ${at}%</span>`).join(' ');
			const row = h('div', 'pe-mission pe-setrow' + (s.have === s.total ? ' done' : ''), `<b>${esc(name)}</b> <small class="muted">${esc(s.set)}</small><span class="why">${s.have} / ${s.total} · ${marks}</span><span class="pe-bar"><i style="width:${s.pct.toFixed(1)}%"></i></span>`);
			row.dataset.set = s.set; list.appendChild(row);
		}
		box.appendChild(list);
	};
	draw();
	modal(box, { title: 'Set rewards' });
}
function missionsMenu() {
	const st = { set: SV.prefs().mset || THEME_SETS[0] }, box = h('div', ''), own = id => COLL.ownedByName(COL, id);
	const draw = () => {
		box.innerHTML = '';
		const prog = SV.solo(), rows = THEME_DECKS.map(t => { const s = SO.missionState(t, own), had = prog.missions[t.id] || 0; return { t, s, had, due: ((s.highlight ? 1 : 0) | (s.all ? 2 : 0)) & ~had }; });
		const due = rows.filter(r => r.due), packs = due.reduce((n, r) => n + (r.due & 1 ? 1 : 0) + (r.due & 2 ? 1 : 0), 0);
		if (!THEME_SETS.includes(st.set)) st.set = THEME_SETS[0];
		box.appendChild(h('div', 'pe-note', `Each of Pocket's decks has two missions: own its highlight card, and own all 20 of its cards. Each earns a pack.<br>You can build <b class="pe-canbuild">${rows.filter(r => r.s.all).length}</b> of ${rows.length} from your collection.`));
		if (packs) { const l = h('div', 'pe-list'); l.appendChild(btn(`Claim ${starN(packs * STAR)}`, 'green big', () => { let p = SV.solo(), n = 0; for (const r of due) { const c = SO.claimMissions(p, r.t, r.s); p = c.progress; n += c.packs; } keepSolo(p); toast(`+${starN(payStars(n))}`); draw(); }, 'mclaim')); box.appendChild(l); }
		const ss = h('div', 'pe-seg'); ss.style.maxWidth = '900px'; THEME_SETS.forEach((s, i) => { const of = rows.filter(r => r.t.set === s); ss.appendChild(btn(`${esc(s)} <small>${of.filter(r => r.s.all).length}/${of.length}</small>`, 'grey' + (st.set === s ? ' on' : ''), () => { st.set = s; SV.setPref('mset', s); draw(); pad && pad.refresh(true); }, 'ms' + i)); }); box.appendChild(ss);
		const list = h('div', 'pe-list');
		for (const r of rows.filter(r => r.t.set === st.set)) {
			const { t, s } = r, hl = t.highlight ? t.highlight.map(id => card(id).name).join(', ') : '';
			const row = h('div', 'pe-mission' + (s.all ? ' done' : ''), `<b>${esc(t.name)}</b> <small>${t.energy.map(e => en(e)).join('')}</small><span class="why">${hl ? `${s.highlight ? '✓' : '○'} ${esc(hl)} · ` : ''}${s.all ? '✓' : '○'} ${s.have} / ${s.need} cards</span>`); row.dataset.k = 'mr' + t.id;
			list.appendChild(row);
			if (s.all && !SV.listDecks().some(d => d.deck.join() === t.cards.join())) list.appendChild(btn(`Add ${esc(t.name)} to my decks`, 'grey', () => { const e = keepDeck({ name: t.name.slice(0, 24), deck: t.cards.slice(), energy: t.energy.slice() }); toast(e ? cap(e) + '.' : `Saved "${t.name.slice(0, 24)}".`); draw(); }, 'ma' + t.id));
		}
		box.appendChild(list);
		if (pad) pad.refresh();
	};
	draw();
	modal(box, { title: 'Deck missions' });
}
function startMatch(n, mine, seed, singles, easy, tutorial) {
	seed = seed || SEED_PARAM || SV.randomSeed();
	// the computer players' decks: the ready-made ones and Pocket's own, in an order the seed decides
	const pool = [...STARTERS.map(s => s.id), ...THEME_DECKS.map(t => t.id)]; let x = 0; for (const ch of String(seed)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
	const mix = n => { let y = (x + Math.imul(n, 0x9e3779b9)) >>> 0; y ^= y >>> 16; y = Math.imul(y, 0x85ebca6b) >>> 0; y ^= y >>> 13; y = Math.imul(y, 0xc2b2ae35) >>> 0; return (y ^ (y >>> 16)) >>> 0; };   // (spread: seeds one letter apart are not neighbours in the list)
	const players = [{ name: (net && net.myName()) || 'Red', ai: false, ...mine }];   // (a name, not "You": the log says "Red draws a card")
	for (let i = 1; i < n; i++) players.push({ name: RIVALS[i - 1], ai: true, ...anyDeck(pool[mix(i) % pool.length]).get() });
	const config = { seed, players, rules: E.RULES, ...(singles ? { opts: { singles: true } } : {}), ...(easy ? { bots: 'easy' } : {}), ...(tutorial ? { tutorial: true } : {}) };   // (singles: one Active slot, a Bench of three, as in Pocket itself; bots: the easier computer player; tutorial: the guided first match)
	begin({ config, actions: [], you: 0 }, E.createGame(config));
}
/** A match against a Gym Leader from the overworld: my deck (the one last chosen), theirs by their type (trainers.js). */
// ---- Draft (draft.js): packs opened on the spot, a deck from them alone, three matches, stars by the wins ----
const DRAFT_KEY = 'magepunk_pocket_draft_v1';
const draftRun = () => { try { return DR.readRun(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')); } catch (e) { return null; } };
const keepDraft = r => { try { if (r) localStorage.setItem(DRAFT_KEY, JSON.stringify(r)); else localStorage.removeItem(DRAFT_KEY); } catch (e) { /* storage full: the run goes on in memory */ } };
function draftMenu() {
	const run = draftRun();
	if (run && !DR.over(run)) { draftDeckMenu(run); return; }
	const st = { booster: SV.prefs().draftBooster || DR.DRAFT_BOOSTERS[0].id };
	if (!DR.DRAFT_BOOSTERS.some(b => b.id === st.booster)) st.booster = DR.DRAFT_BOOSTERS[0].id;
	const box = h('div', '');
	const draw = () => {
		box.innerHTML = '';
		box.appendChild(h('div', 'pe-note', `Open ${DR.DRAFT.PACKS} packs on the spot, build a 20-card deck from them alone, and play ${DR.DRAFT.MATCHES} matches against computer players who drafted too.<br>Entry <b class="money">${starN(DR.DRAFT.FEE)}</b> · stars by wins: ${DR.DRAFT.PAY.map((n, i) => `${i} ${starN(n)}`).join(' · ')}<br><span class="muted">The drafted cards are for the run only; they do not join your collection.</span>`));
		if (run && DR.over(run)) box.appendChild(h('div', 'pe-note', `Your last draft: ${DR.wins(run)} win${DR.wins(run) === 1 ? '' : 's'}, ${starN(run.paid)}.`));
		box.appendChild(h('div', 'pe-note', 'Which packs'));
		const seg = h('div', 'pe-seg'); seg.style.maxWidth = '1000px';
		for (const b of DR.DRAFT_BOOSTERS) seg.appendChild(btn(esc(b.name), 'grey' + (st.booster === b.id ? ' on' : ''), () => { st.booster = b.id; SV.setPref('draftBooster', b.id); draw(); pad && pad.refresh(true); }, 'db' + b.id));
		box.appendChild(seg);
		const enough = Stars.stars() >= DR.DRAFT.FEE;
		const go = btn(`Enter <span class="muted">(${starN(DR.DRAFT.FEE)} · you have ${starN(Stars.stars())})</span>`, 'green big b-go', () => {
			if (!Stars.spend(DR.DRAFT.FEE)) { toast(`A draft costs ${starN(DR.DRAFT.FEE)}.`); return; }
			starSync(); packLabel();
			const r = DR.newRun(st.booster, SEED_PARAM ? SEED_PARAM + ':draft' : SV.randomSeed()); keepDraft(r); play('cardSlide2', 1.3); draftReveal(r);
		}, 'denter');
		go.disabled = !enough; box.appendChild(go);
		if (!enough) box.appendChild(h('div', 'pe-note muted', 'Not enough stars yet: matches, missions and solo battles pay them.'));
		if (pad) pad.refresh(true);
	};
	draw();
	modal(box, { title: 'Draft' });
}
function draftReveal(run) {
	const box = h('div', ''), grid = h('div', 'pe-grid pe-draftpool');
	box.appendChild(h('div', 'pe-note', `Your ${DR.DRAFT.PACKS} packs: ${run.pool.length} cards.`));
	for (const id of run.pool) { const e = handCard(card(id), null); e.classList.add('small'); grid.appendChild(e); }
	box.appendChild(grid);
	box.appendChild(btn('Build your deck', 'green big b-go', () => draftDeckMenu(run), 'dbuild'));
	closeAll(); modal(box, { title: 'Draft: your packs', noClose: true });
}
function draftDeckMenu(run0) {
	let run = run0;
	const st = { deck: run.deck.slice(), energy: run.energy.slice() }, box = h('div', '');
	const count = id => st.deck.filter(x => card(x).name === card(id).name).length;
	const save = () => { run = { ...run, deck: st.deck.slice(), energy: st.energy.slice() }; keepDraft(run); };
	const draw = () => {
		box.innerHTML = '';
		box.appendChild(h('div', 'pe-note', `Match ${run.results.length + 1} of ${DR.DRAFT.MATCHES}${run.results.length ? ` · so far: ${run.results.map(r => (r === 'won' ? 'W' : r === 'lost' ? 'L' : 'D')).join(' ')}` : ''}`));
		const db = h('div', 'pe-db'), pool = h('div', 'pool');
		for (const id of [...new Set(run.pool)].sort((a, b) => (card(a).kind === 'pokemon' ? 0 : 1) - (card(b).kind === 'pokemon' ? 0 : 1) || card(a).name.localeCompare(card(b).name))) {
			const n = count(id), have = DR.poolCount(run.pool, id);
			const b = handCard(card(id), null, (n ? `<span class="have">${n}</span>` : '') + `<span class="own">${have} in your packs</span>`); b.classList.add('small'); b.dataset.k = 'dc' + id;
			b.addEventListener('click', () => { if (st.deck.length >= 20) toast('A deck is 20 cards.'); else if (count(id) >= Math.min(2, have)) toast(have < 2 ? `Your packs hold ${have} ${card(id).name}.` : 'Two cards of a name at most.'); else { st.deck.push(id); save(); draw(); } });
			pool.appendChild(b);
		}
		const mine = h('div', 'mine');
		const es = h('div', 'pe-seg'); for (const e of ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal']) es.appendChild(btn(en(e), 'grey' + (st.energy.includes(e) ? ' on' : ''), () => { if (st.energy.includes(e)) st.energy = st.energy.filter(x => x !== e); else if (st.energy.length < 3) st.energy.push(e); else toast('Three Energy types at most.'); save(); draw(); }, 'de' + e));
		mine.appendChild(es);
		const err = DR.draftDeckError(run.pool, st.deck, st.energy);
		mine.appendChild(h('div', 'pe-note', `${st.deck.length} / 20 cards${err ? ` · <span class="red">${esc(err)}</span>` : ' · <span style="color:var(--green)">ready</span>'}`));
		const rows = h('div', 'rows'), seen = new Set();
		for (const id of st.deck.slice().sort((a, b) => card(a).name.localeCompare(card(b).name))) {
			const c = card(id); if (seen.has(c.name)) continue; seen.add(c.name);
			const r = h('button', 'rowb', `${esc(c.name)}<span class="x">×${count(id)} −</span>`); r.type = 'button'; r.dataset.k = 'dm' + id;
			r.addEventListener('click', () => { st.deck.splice(st.deck.findIndex(x => card(x).name === c.name), 1); save(); draw(); });
			rows.appendChild(r);
		}
		mine.appendChild(rows);
		const bar = h('div', 'pe-seg');
		if (st.deck.length < 20) bar.appendChild(btn('Finish this deck', 'blue', () => { const r = DR.poolDeck(run.pool, st.deck, st.energy); st.deck = r.deck; st.energy = r.energy; save(); draw(); toast(r.added.length ? `Added ${r.added.length} cards from your packs.` : 'Nothing more in your packs fits.'); }, 'dfinish'));
		bar.appendChild(btn('Clear', 'red', () => { st.deck = []; save(); draw(); }, 'dclear'));
		const play2 = btn(`Play match ${run.results.length + 1} of ${DR.DRAFT.MATCHES}`, 'green big b-go', () => { save(); startDraftMatch(run); }, 'dplay'); play2.disabled = !!err; bar.appendChild(play2);
		mine.appendChild(bar);
		db.append(pool, mine); box.appendChild(db);
		if (pad) pad.refresh();
	};
	draw();
	closeAll(); modal(box, { title: 'Draft: your deck' });
}
/** The draft's next match: my drafted deck against a computer player who drafted from the same packs. */
function startDraftMatch(run) {
	if (DR.draftDeckError(run.pool, run.deck, run.energy)) { draftDeckMenu(run); return; }
	const i = run.results.length, o = DR.opponent(run, i), p = SV.prefs();
	const config = { seed: SEED_PARAM ? SEED_PARAM + ':d' + i : SV.randomSeed(), players: [{ name: (net && net.myName()) || 'Red', ai: false, deck: run.deck.slice(), energy: run.energy.slice() }, { name: o.name, ai: true, deck: o.deck, energy: o.energy }],
		rules: E.RULES, draft: i, ...(p.mode === 'singles' ? { opts: { singles: true } } : {}) };
	begin({ config, actions: [], you: 0 }, E.createGame(config));
	toast(`Draft: match ${i + 1} of ${DR.DRAFT.MATCHES}.`);
}
// ---- the weekly event (events.js): one rule a week for everyone, three battles, a pack's stars for each first win ----
function eventMenu() {
	const now = Date.now(), ev = EV.eventOf(now), wk = EV.weekOf(now), opp = EV.eventOpponents(ev, wk), box = h('div', '');
	const st = { deck: SV.prefs().eventDeck || '' };
	const days = Math.max(1, Math.ceil((wk.ends - now) / 86400000));
	// my decks that keep the rule, and one built for it from my own cards (the deck helper: deckhelp.js)
	const fitting = () => {
		const list = allDecks().map(d => ({ id: d.id, name: d.name, ...d.get() })).filter(d => !E.deckError(d.deck, d.energy) && !EV.eventDeckError(ev, d.deck, d.energy));
		const allowed = id => { const c = card(id); return !ev.card || (c && ev.card(c)); };
		for (const t of ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal']) {
			if (list.some(d => d.id === 'ev:built')) break;
			const b = finishDeck([], [t], id => (allowed(id) ? COLL.ownedByName(COL, id) : 0));
			if (!E.deckError(b.deck, b.energy) && !EV.eventDeckError(ev, b.deck, b.energy)) list.push({ id: 'ev:built', name: `Built for this week from your cards (${t})`, deck: b.deck, energy: b.energy });
		}
		return list;
	};
	const draw = () => {
		box.innerHTML = '';
		const prog = SV.solo(), decks = fitting();
		if (!decks.some(d => d.id === st.deck)) st.deck = decks.length ? decks[0].id : '';
		box.appendChild(h('div', 'pe-note', `<b style="font-size:1.3em">${esc(ev.name)}</b><br>${esc(ev.rule)}<br><span class="muted">The same for everyone this week; a new rule in ${days} day${days === 1 ? '' : 's'}. Each battle's first win this week pays ${starN(STAR)}.</span>`));
		box.appendChild(h('div', 'pe-note', 'Your deck'));
		if (!decks.length) box.appendChild(h('div', 'pe-note red', 'None of your decks keeps this rule, and your cards cannot build one yet. Open packs, or build one in the Deck builder.'));
		const ds = h('div', 'pe-seg'); ds.style.maxWidth = '1000px';
		for (const d of decks) ds.appendChild(btn(esc(d.name), 'grey' + (st.deck === d.id ? ' on' : ''), () => { st.deck = d.id; SV.setPref('eventDeck', d.id); draw(); pad && pad.refresh(true); }, 'ed' + (d.id === 'ev:built' ? 'built' : d.id)));
		box.appendChild(ds);
		const list = h('div', 'pe-list');
		opp.forEach((o, i) => {
			const done = !!prog.paid[EV.eventKey(wk, i)];
			const b = btn(`${done ? '✓' : '○'} Battle ${i + 1}: <b>${esc(o.name)}</b> <span class="muted">${o.energy.map(e => en(e)).join('')}${done ? ' · paid this week' : ` · ${starN(STAR)}`}</span>`, done ? 'grey' : 'green', () => { const d = decks.find(x => x.id === st.deck); if (!d) { toast('Choose a deck that keeps the rule.'); return; } startEventMatch(ev, wk, i, o, d); }, 'eb' + i);
			b.disabled = !decks.length; list.appendChild(b);
		});
		box.appendChild(list);
		if (pad) pad.refresh(true);
	};
	draw();
	modal(box, { title: 'Weekly event' });
}
function startEventMatch(ev, wk, i, o, mine) {
	const p = SV.prefs(), opts = { ...EV.eventOpts(ev), ...(p.mode === 'singles' ? { singles: true } : {}) };
	const config = { seed: SEED_PARAM ? SEED_PARAM + ':e' + i : SV.randomSeed(), players: [{ name: (net && net.myName()) || 'Red', ai: false, deck: mine.deck.slice(), energy: mine.energy.slice() }, { name: o.name, ai: true, deck: o.deck.slice(), energy: o.energy.slice() }],
		rules: E.RULES, event: { id: ev.id, week: wk.key, i }, ...(Object.keys(opts).length ? { opts } : {}) };
	begin({ config, actions: [], you: 0 }, E.createGame(config));
	toast(`${ev.name}: battle ${i + 1}.`);
}
function startTrainerMatch(t) {
	const p = SV.prefs(), mine = (findDeck(p.deck) || allDecks()[0]).get(), theirs = trainerDeck(t);
	const config = { seed: SEED_PARAM || SV.randomSeed(), players: [{ name: (net && net.myName()) || 'Red', ai: false, ...mine }, { name: t.name, ai: true, deck: theirs.cards.slice(), energy: theirs.energy.slice() }],
		rules: E.RULES, trainer: t.key, ...(p.mode === 'singles' ? { opts: { singles: true } } : {}) };
	begin({ config, actions: [], you: 0 }, E.createGame(config));
	toast(`${t.name} challenges you to a card match!`);
}
function begin(g, state) {
	closeAll(); clearTimeout(aiTimer); aiTimer = 0; stopReplayTimer();
	MODE = 'normal'; G = g; S = state; R = null; overShown = false;
	ui.cmds = [null, null]; ui.pick = null; ui.setup = { active: [], bench: [] }; ui.prevDmg = new Map(); ui.coinN = null;
	persist(); sync();
	startPublishing();
}
// ------------------------------------------------------------------ friends watching (a signed-in player's match is live)
const SPEC_STATUS = { connecting: 'Connecting…', live: 'Live.', 'not-live': 'No match right now. Waiting for one to start…', over: 'That match is over. Waiting for the next one…', offline: 'Offline. Trying again…', login: 'Sign in to watch a friend\'s match.', forbidden: 'Only friends can watch.', full: 'That match has as many spectators as it can take.' };
/** What friends are sent: the spectator's view (no hand, no deck order), the seat to draw at the bottom, a short log. */
function snapshot() {
	if (MODE === 'online' && V) {   // the server's view of my seat, made public again: no hand, no private log text
		const v = { ...V, you: null, pending: V.pending ? { ...V.pending, options: null, cards: null } : null, players: V.players.map(p => ({ ...p, hand: null })), log: V.log.slice(-80).map(({ more, ...e }) => e) };
		return { game: 'pocket', n: ON.n, you: ON.seat, view: v };
	}
	if (MODE !== 'normal' || !S || !G) return null;
	const v = E.view(S, null);
	return { game: 'pocket', n: S.actions, you: G.you, view: { ...v, log: v.log.slice(-80) } };
}
function stopPublishing() { if (publisher) { try { publisher.stop(); } catch (e) { /* already stopped */ } publisher = null; } live.watchers = 0; live.names = []; }
function startPublishing() {
	stopPublishing();
	if (!net || !net.isLoggedIn()) return;
	try {
		publisher = net.startPublisher(() => snapshot(), () => 'Pocket Enhanced · ' + (V ? viewLabel(V) : '') + (MODE === 'online' ? ' · online' : ''));
		publisher.onWatchers((n, names) => { live.watchers = n; live.names = names || []; if (playing() && V) render(); });
	} catch (e) { publisher = null; }
}
function startSpectating() {
	closeAll(); clearTimeout(aiTimer); aiTimer = 0; stopReplayTimer(); stopPublishing();
	MODE = 'spectate'; G = S = V = R = null; ui.pick = null; ui.cmds = [null, null]; ui.prevDmg = new Map();
	live.status = net ? 'connecting' : 'offline'; render();
	if (!net) return;
	const go = () => {
		spec = net.startSpectate(SPECTATE, {
			onSnapshot: snap => {
				if (MODE !== 'spectate' || !snap || snap.game !== 'pocket' || !snap.view || !Array.isArray(snap.view.players)) return;
				if (!V || snap.n < (V.n || 0)) { ui.prevDmg = new Map(); closeAll(); }
				live.you = Number.isInteger(snap.you) && snap.view.players[snap.you] ? snap.you : 0; live.status = 'live';
				V = { ...snap.view, n: snap.n, you: null }; render();
			},
			onStatus: st => {
				if (MODE !== 'spectate') return;
				live.status = st; render();
				// a finished match: keep checking for the friend's next one
				if (st === 'over') setTimeout(() => { if (MODE !== 'spectate') return; try { spec && spec.stop(); } catch (e) { /* gone */ } go(); }, 5000);
			},
		});
	};
	go();
}
function resume(saved) { begin({ config: saved.recipe.config, actions: saved.recipe.actions.slice(), you: saved.recipe.you ?? 0 }, saved.S); }
function optionsMenu() {
	const box = h('div', 'pe-list');
	box.appendChild(btn('How to play', 'grey', () => howTo(), 'how'));
	box.appendChild(btn('Options', 'grey', () => settingsMenu(), 'options'));
	if (playing() && V && !V.over && YOU() != null && !V.players[YOU()].eliminated) box.appendChild(btn('Concede', 'red', () => { closeAll(); send({ t: 'concede' }); }, 'concede'));
	if (MODE === 'online' && V && V.over) box.appendChild(btn('Back to the lobby', 'blue', () => { closeAll(); showLobby(true); }, 'tolobby'));
	if (MODE === 'replay') box.appendChild(btn('Copy replay link', 'blue', () => shareReplay(R.recipe), 'share'));
	box.appendChild(btn('Leave to the menu', 'orange', () => { leave(); }, 'leave'));
	modal(box, { title: 'Menu' });
}
function leave() {
	if (MODE === 'spectate') { try { spec && spec.stop(); } catch (e) { /* gone */ } location.href = '/pocketenhanced/'; return; }
	if (MODE === 'online') { leaveOnline(true); return; }
	clearTimeout(aiTimer); aiTimer = 0; stopReplayTimer(); persist(); stopPublishing();
	MODE = 'normal'; G = S = V = R = null; ui.pick = null; render(); mainMenu();
}
function finish() {
	const online = MODE === 'online';
	if (!online) SV.clearRun();
	const w = V.over.winner, me = YOU(), summary = { players: V.players.map(p => ({ name: p.name, points: p.points })), winner: w != null ? V.players[w].name : null, turns: V.turn,
		// (match history: my seat and result, what kind of match, the deck I played)
		you: me, won: me == null ? null : w === me, kind: matchKind(online), deck: deckNameOf(online ? null : G.config.players[me] && G.config.players[me].deck) };
	const recipe = online ? ON.recipe : SV.recipeOf(G.config, G.actions);
	if (recipe) SV.addReplay(recipe.config, recipe.actions, summary);
	play(w === YOU() ? 'win' : 'negative');
	const earned = YOU() != null && (online || V.turn >= 3) ? payPacks(w === YOU(), online ? `o:${ON.id}:${ON.mid}` : `n:${G.config.seed}:${G.actions.length}`) : 0;
	if (publisher) { const p = publisher; publisher = null; setTimeout(() => { try { p.finish({ won: w === YOU() }).catch(() => {}); } catch (e) { /* offline */ } }, 1200); }
	// a solo battle: what it cleared, which tasks were done, and the packs for them (each paid once: solo.js)
	const sb = !online && G.config.solo && YOU() === 0 ? soloById(G.config.solo) : null; let soloNote = '';
	if (sb) {
		const r = SO.recordBattle(SV.solo(), sb, w === 0, SO.tasksDone(S, 0, G.config.players[0].deck, sb.text)), now = r.progress.tasks[sb.id] || [];
		keepSolo(r.progress); if (r.packs) payStars(r.packs);
		soloNote = `<div class="pe-tasks">${r.firstClear ? '<div class="pe-task done"><b class="money">First clear!</b></div>' : ''}${sb.text.map((t, i) => `<div class="pe-task${now[i] ? ' done' : ''}">${now[i] ? '✓' : '○'} ${esc(t)}${r.newTasks.includes(i) ? ' <b class="money">new</b>' : ''}</div>`).join('')}${r.packs ? `<div class="pe-task done"><b class="money pe-solo-earned">+${starN(r.packs * STAR)} for the battle</b></div>` : ''}</div>`;
	}
	// the record, and today's missions (a match counts whichever kind it was)
	const day = SO.dailyDay(Date.now()), missionsWas = YOU() != null ? SO.dailyState(SV.solo(), day) : [];
	if (YOU() != null) {
		const me = YOU(), mineDeck = (online ? null : G.config.players[me].deck) || null, named = mineDeck ? everyDeck().find(d => { const x = d.get().deck.slice().sort().join(), y = mineDeck.slice().sort().join(); return x === y; }) : null;
		const cfgP = ((online ? ON.recipe && ON.recipe.config : G.config) || { players: [] }).players[me] || {};
		SV.addResult({ result: w === me ? 'won' : w == null ? 'drawn' : 'lost', online, deck: named ? named.name.replace(/ \(yours\)$/, '') : online ? null : 'Another deck', energy: cfgP.energy });
		dailyEvent({ matches: 1, wins: w === me ? 1 : 0, kos: V.log.filter(e => e.k === 'ko' && e.seat !== me).length, evolves: V.log.filter(e => e.k === 'evolve' && e.seat === me).length, solo: sb ? 1 : 0, online: online ? 1 : 0 });
	}
	let draftNote = '', draftRunNow = null;
	if (!online && G.config.draft != null && YOU() === 0) {
		const run = draftRun();
		if (run && run.results.length === G.config.draft) {
			const r = DR.recordResult(run, w === 0 ? 'won' : w == null ? 'drawn' : 'lost'); keepDraft(r.run); draftRunNow = r.run;
			if (r.pay) { Stars.earn(r.pay); starSync(); packLabel(); }
			draftNote = DR.over(r.run) ? `<b class="money pe-draft-end">Draft over: ${DR.wins(r.run)} win${DR.wins(r.run) === 1 ? '' : 's'} of ${DR.DRAFT.MATCHES}: +${starN(r.pay)}</b>` : `<span class="pe-draft-end">Draft: ${DR.wins(r.run)} win${DR.wins(r.run) === 1 ? '' : 's'} so far, match ${r.run.results.length + 1} of ${DR.DRAFT.MATCHES} next.</span>`;
		}
	}
	let eventNote = '';
	if (!online && G.config.event && YOU() === 0) {
		const wk = { key: G.config.event.week }, k = EV.eventKey(wk, G.config.event.i), prog = SV.solo();
		if (w === 0 && !prog.paid[k]) { const p = { ...prog, paid: { ...prog.paid, [k]: 1 } }; keepSolo(p); payStars(1); eventNote = `<b class="money pe-event-end">Event battle ${G.config.event.i + 1} won: +${starN(STAR)}</b>`; }
		else if (w === 0) eventNote = '<span class="muted pe-event-end">Won again: this battle has paid this week.</span>';
		else eventNote = '<span class="muted pe-event-end">Not this time: try again, it pays the first win of the week.</span>';
	}
	let trainerNote = '';
	{ const t = !online && G.config.trainer ? trainerByKey(G.config.trainer) : null;
		if (t && YOU() === 0) {
			const paid = SV.prefs().trainerPaid || {};
			if (w === 0 && winPays(paid, t.key, Date.now())) { Stars.earn(TRAINER_STARS); starSync(); packLabel(); SV.setPref('trainerPaid', { ...paid, [t.key]: dayOf(Date.now()) }); trainerNote = `<b class="money pe-trainer-earned">${esc(t.name)}: +${starN(TRAINER_STARS)}</b>`; }
			else if (w === 0) trainerNote = `<span class="muted">${esc(t.name)} has paid today: come back tomorrow for more stars.</span>`;
			else trainerNote = `<span class="muted">${esc(t.name)} wins this time.</span>`;
		} }
	const emblemsNew = checkEmblems();
	const box = h('div', 'pe-end');
	box.appendChild(h('div', 'pe-note', `${esc(w != null ? V.players[w].name + ' wins' : 'Nobody wins')} — ${esc(V.over.why)}<br><br>${V.players.map(p => `${esc(p.name)}: ${p.points} point${p.points === 1 ? '' : 's'}`).join(' · ')}${earned ? `<br><br><b class="money pe-earned">+${starN(earned)}</b>` : ''}`));
	// how it went (owner, 2026-11-18, "a proper match end": the cards that did the work, the numbers, today's missions)
	if (YOU() != null) {
		const me = YOU(), ms = matchStats(V.log, V.players), mine = ms.seats[me], row = h('div', 'pe-endrow');
		// the card that did the most: its face, and what it did
		if (mine.mvp) {
			const myDeck = (!online && G.config.players[me].deck) || [], mvpCard = myDeck.map(id => card(id)).find(c2 => c2 && c2.name === mine.mvp.name) || CARDS.find(c2 => c2.name === mine.mvp.name);
			const m = h('div', 'pe-mvp'); m.dataset.k = 'mvp';
			if (mvpCard) { const f = handCard(mvpCard, null, '', printOf(me, mvpCard.id)); f.classList.add('small'); f.dataset.k = 'mvpcard'; f.addEventListener('click', () => inspect(mvpCard, null, null, [], printOf(me, mvpCard.id))); m.appendChild(f); }
			m.appendChild(h('div', 'pe-mvptext', `<span class="muted">Your best card</span><b>${esc(mine.mvp.name)}</b><span>${plural(mine.mvp.kos, 'Knock Out')} · ${mine.mvp.damage.toLocaleString()} damage · ${plural(mine.mvp.attacks, 'attack')}</span>`));
			row.appendChild(m);
		}
		const cell = (k, v, l) => `<div class="pe-stat" data-k="st-${k}"><b>${v}</b><span>${l}</span></div>`;
		row.appendChild(h('div', 'pe-stats', cell('turns', ms.turns, 'turns') + cell('kos', mine.kos, 'Knock Outs') + cell('lost', mine.lost, 'of yours lost') + cell('damage', mine.damage.toLocaleString(), 'damage dealt') + cell('attacks', mine.attacks, 'attacks')));
		box.appendChild(row);
		// today's missions, with what this match added
		const now = SO.dailyState(SV.solo(), day);
		if (now.length) {
			const mis = h('div', 'pe-endmis'); mis.dataset.k = 'endmissions';
			mis.innerHTML = `<div class="muted">Today's missions</div>` + now.map((q, i) => { const was = (missionsWas[i] && missionsWas[i].have) || 0, up = q.have - was; return `<div class="pe-mis${q.done ? ' done' : ''}${up > 0 ? ' up' : ''}"><span>${q.done ? '✓' : '○'} ${esc(q.text)}</span><i><u style="width:${Math.round(100 * q.have / q.need)}%"></u></i><b>${q.have} / ${q.need}${up > 0 ? ` <em>+${up}</em>` : ''}</b></div>`; }).join('');
			const due = now.filter(q => q.done && !q.paid).length;
			if (due) mis.appendChild(btn(`Claim ${plural(due, 'mission')}`, 'green', () => dailyMenu(), 'endclaim'));
			box.appendChild(mis);
		}
	}
	if (soloNote) box.appendChild(h('div', '', soloNote));
	if (trainerNote) box.appendChild(h('div', 'pe-note pe-trainer', trainerNote));
	for (const id of emblemsNew) { const e = emblemById(id); box.appendChild(h('div', 'pe-note pe-emblem-new', `${emblemTag(e)} Emblem earned: <b>${esc(e.name)}</b>`)); }
	if (draftNote) box.appendChild(h('div', 'pe-note pe-draftnote', draftNote));
	if (eventNote) box.appendChild(h('div', 'pe-note pe-eventnote', eventNote));
	const list = h('div', 'pe-list');
	if (online) {
		// play again at the same table: the host starts the next match, everyone else says they are ready for it
		const lb = ON.lobby, host = lb && net && lb.host === net.myName();
		if (lb && host) list.appendChild(btn('Play again', 'green big b-again', async () => { const r = await pk('start', { id: lb.id }); if (r && r.match) { closeAll(); onServer(r); } else { toast(r && r.error ? (/not everyone is ready/.test(r.error) ? 'Waiting for the others to press Play again.' : cap(r.error) + '.') : 'Could not reach the server.'); } }, 'again'));
		else if (lb) list.appendChild(btn('Play again', 'green big b-again', async () => { const r = await pk('update', { id: lb.id, ready: true }); if (r && r.lobby) { ON.lobby = r.lobby; closeAll(); showLobby(true); toast('Ready: the host starts the next match.'); } else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.'); }, 'again'));
		list.appendChild(btn('Back to the lobby', 'blue', () => { closeAll(); showLobby(true); }, 'tolobby'));
	}
	else if (sb) { list.appendChild(btn('Solo battles', 'green big b-again', () => soloMenu({ set: sb.set, tier: sb.tier }), 'solo')); list.appendChild(btn('Battle again', 'blue', () => soloBattle(sb.id, SV.prefs().deck), 'sagain')); }
	else if (G.config.draft != null) {   // (a draft's match: the next one, or a new draft; no rematch, the run moves on)
		const run = draftRunNow || draftRun();
		if (run && !DR.over(run)) list.appendChild(btn(`Next draft match <span class="muted">(${run.results.length + 1} of ${DR.DRAFT.MATCHES})</span>`, 'green big b-again', () => startDraftMatch(run), 'draftnext'));
		else list.appendChild(btn('Draft again', 'green big b-again', () => draftMenu(), 'draftagain'));
	}
	else if (G.config.event) { list.appendChild(btn('Weekly event', 'green big b-again', () => eventMenu(), 'eventback')); }
	else {
		// the same table again: the same decks and rules, a new shuffle
		if (G.config && !G.config.tutorial && YOU() === 0) list.appendChild(btn('Rematch <span class="muted">(the same decks)</span>', 'green big b-again', () => { const config = { ...G.config, seed: SV.randomSeed() }; begin({ config, actions: [], you: 0 }, E.createGame(config)); }, 'rematch'));
		list.appendChild(btn('New match', 'blue' + (G.config && !G.config.tutorial && YOU() === 0 ? '' : ' big b-again'), () => newMatchMenu(), 'new'));
	}
	if (canOpen() || inHand()) list.appendChild(btn(`Open packs <span class="muted">(${starN(Stars.stars())})</span>`, 'red', () => packsMenu(), 'packs'));
	if (recipe && !online) list.appendChild(btn('Watch the replay', 'grey', () => startReplay(recipe), 'watch'));
	if (online && ON.lobby && ON.lobby.tid) { const t = ON.lobby.tid; list.appendChild(btn('Back to the tournament', 'green big', () => { leaveOnline(true); tourOpen(t); }, 'totour')); }
	if (recipe) list.appendChild(btn('Copy replay link', 'grey', () => shareReplay(recipe), 'share'));
	if (!online && G.config.trainer) list.appendChild(btn('Back to the overworld', 'blue', () => { location.href = '/overworld/'; }, 'toworld'));
	list.appendChild(btn(online ? 'Leave the match' : 'Menu', 'orange', () => leave(), 'leave'));
	box.appendChild(list);
	modal(box, { title: w === YOU() ? 'You win!' : 'Match over', noClose: true });
}

// ------------------------------------------------------------------ online: a lobby by code, a match the server holds
const PKV = { pv: 28, ev: E.ENGINE_VERSION };
let pkFails = 0;
const pk = async (action, body = {}) => {
	// (a deck is checked against the collection on the account: what this device has pulled goes up first)
	if (body.deck && colSync) { try { await colSync.now(); } catch (e) { /* offline: the server says if the deck is not there */ } }
	let r = null; try { r = await net.call('pkpvp-' + action, { ...PKV, ...body }); } catch (e) { r = null; }
	// (four calls in a row with no answer while the device is online: said once to the site's error log, where a server that cannot keep up would show)
	if (r == null && navigator.onLine !== false) { if (++pkFails === 4 && window.reportErr) window.reportErr('pocket online: 4 server calls in a row got no answer (' + action + ')', 'pocketenhanced pk'); } else pkFails = 0;
	return r;
};
const deckById = id => (findDeck(id) || allDecks()[0]).get();
/** Ask a friend into the match I am hosting. */
async function inviteMenu() {
	const lb = ON.lobby; if (!lb) return;
	const box = h('div', 'pe-list'); box.appendChild(h('div', 'pe-note', 'Asking who your friends are…'));
	modal(box, { title: 'Invite a friend' });
	const r = await trCall('friends'); if (!box.isConnected) return;
	box.innerHTML = '';
	const fr = r && Array.isArray(r.friends) ? r.friends.slice().sort((x, y) => (y.online ? 1 : 0) - (x.online ? 1 : 0) || x.username.localeCompare(y.username)) : [];
	if (!fr.length) box.appendChild(h('div', 'pe-note', 'You have no friends added yet. Add one from the top bar (the ⚙ in the corner). The match code works for anyone meanwhile.'));
	for (const f of fr) box.appendChild(btn(`Invite <b>${esc(f.username)}</b> <span class="muted">${f.online ? '(online)' : '(not here now)'}</span>`, f.online ? 'blue' : 'grey', async () => { const v = await pk('invite', { id: lb.id, to: f.username }); toast(v && v.ok ? `Invited ${f.username}: it shows on their Play online screen for 5 minutes.` : v && v.error ? cap(v.error) + '.' : 'Could not reach the server.'); }, 'inv:' + f.username));
	if (pad) pad.refresh();
}
/** The season's leaderboard, and what the season pays. */
function rankBoard(R2) {
	const box = h('div', 'pe-list');
	box.appendChild(h('div', 'pe-note', R2.board.length ? `<table class="pe-board"><tr><th>#</th><th>Player</th><th>Rating</th><th>Matches</th></tr>${R2.board.map((r, i) => `<tr${net && r.name === net.myName() ? ' class="me"' : ''}><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.rating}</td><td>${r.games}</td></tr>`).join('')}</table>` : 'Nobody has played a ranked match this season yet.'));
	box.appendChild(h('div', 'pe-note', `At the end of each month, ${R2.min} or more ranked matches pays ${R2.pay.map(([from, n]) => `${starN(n)} from ${from}`).join(', ')}. Then ratings come halfway back to 1000.`));
	modal(box, { title: 'Ranked leaderboard' });
}
function onlineMenu() {
	if (!net || !net.isLoggedIn()) { modal(h('div', 'pe-note', 'Playing against other people needs an account.<br>Sign in from the top bar (the ⚙ in the corner), then come back here.<br><br>Matches against computer players need no account.'), { title: 'Play online' }); return; }
	const p = SV.prefs(), st = { size: [2, 3, 4].includes(p.osize) ? p.osize : 2, bots: 0, deck: p.deck || STARTERS[0].id, busy: false, singles: p.mode === 'singles', easy: p.bots === 'easy', rank: null };
	const box = h('div', '');
	// (my rating, and a season's stars paid the first time this is opened in a new month: said once)
	Promise.resolve(net.call('pkrank-get', {})).then(r => { if (!r || r.error) return; st.rank = r; { const b = Math.max(r.best || 0, r.rating || 0); if (b > (SV.prefs().rankBest || 0)) { SV.setPref('rankBest', b); emblemSoon(); } } if (r.paid) { toast(`Ranked season ${r.paid.season}: ${starN(r.paid.stars)} for where you finished.`); play('coin1'); starSync(); } if (box.isConnected) draw(); }).catch(() => {});
	const draw = () => {
		box.innerHTML = '';
		const decks = allDecks(); if (!findDeck(st.deck)) st.deck = decks[0].id;
		st.bots = Math.min(st.bots, st.size - 1);
		box.appendChild(h('div', 'pe-note', 'Your deck'));
		const dk = h('div', 'pe-seg'); dk.style.maxWidth = '900px'; for (const d of decks) dk.appendChild(btn(esc(d.name), 'grey' + (st.deck === d.id ? ' on' : ''), () => { st.deck = d.id; SV.setPref('deck', d.id); draw(); pad && pad.refresh(true); }, 'd' + d.id)); box.appendChild(dk);
		themePicker(box, st, draw, id => SV.setPref('deck', id));
		for (const v of st.invites || []) box.appendChild(btn(`<b>${esc(v.from)}</b> invites you to a match <span class="muted">(join with the deck above)</span>`, 'green big wide', async () => { const r = await pk('join', { code: v.code, ...deckById(st.deck) }); if (r && r.lobby) enterLobby(r.lobby); else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.'); }, 'ojoin:' + v.from));
		// the ranked ladder (server/pocket_rank.mjs): my rating this season, and the board
		if (st.rank) { const R2 = st.rank, mon = new Date(R2.season + '-01T00:00:00Z').toLocaleString('en', { month: 'long', timeZone: 'UTC' });
			const rk = h('div', 'pe-note pe-rank', `<b>Ranked</b> · ${esc(mon)} season · rating <b class="money" data-k="rating">${R2.rating}</b> ${R2.place ? `(#${R2.place})` : ''} · ${plural(R2.games, 'match').replace('matchs', 'matches')}${R2.games < R2.min ? ` <span class="muted">(${R2.min - R2.games} more for this season's stars)</span>` : ` <span class="muted">(this season's stars so far: ${starN(R2.payNow)})</span>`}<br><span class="muted">A match of two people and no computer players counts.</span>`);
			rk.appendChild(btn('Leaderboard', 'grey', () => rankBoard(R2), 'rankboard')); box.appendChild(rk); }
		box.appendChild(h('div', 'pe-note', 'Tournaments <span class="muted">(a bracket of 4 or 8; computer players fill the empty seats; stars for the top places)</span>'));
		{ const ts = h('div', 'pe-seg');
			if (SV.prefs().tour) ts.appendChild(btn('Back to your tournament', 'green', () => tourOpen(SV.prefs().tour), 'tback'));
			ts.appendChild(btn('Host a tournament of 4', 'purple', () => tourHost(4, st), 'thost4'));
			ts.appendChild(btn('Host one of 8', 'purple', () => tourHost(8, st), 'thost8'));
			ts.appendChild(btn('Join a tournament', 'blue', () => tourJoin(st), 'tjoin'));
			box.appendChild(ts); }
		box.appendChild(h('div', 'pe-note', 'Join a friend\'s match'));
		box.appendChild(btn('Enter a code', 'blue big wide b-go', async () => {
			const code = await askText({ title: 'The 5-letter match code', maxLength: 5, upper: true });
			if (!code) return;
			const r = await pk('join', { code: code.trim().toUpperCase(), ...deckById(st.deck) });
			if (r && r.lobby) enterLobby(r.lobby); else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.');
		}, 'join'));
		box.appendChild(h('div', 'pe-note', 'Or host one: seats, and how many of them are computer players'));
		box.appendChild(modeSeg(st));
		if (st.bots > 0) box.appendChild(botSeg(st));
		const seg = h('div', 'pe-seg'); for (const n of [2, 3, 4]) seg.appendChild(btn(n + ' seats', 'grey' + (st.size === n ? ' on' : ''), () => { st.size = n; draw(); pad && pad.refresh(true); }, 'os' + n)); box.appendChild(seg);
		const bs = h('div', 'pe-seg'); for (let n = 0; n < st.size; n++) bs.appendChild(btn(n === 0 ? 'no computer players' : n + ' computer', 'grey' + (st.bots === n ? ' on' : ''), () => { st.bots = n; draw(); pad && pad.refresh(true); }, 'ob' + n)); box.appendChild(bs);
		box.appendChild(btn('Host a match', 'green big wide', async () => {
			SV.setPref('osize', st.size);
			const r = await pk('create', { size: st.size, bots: st.bots, singles: !!st.singles, easy: !!st.easy && st.bots > 0, ...deckById(st.deck) });
			if (r && r.lobby) enterLobby(r.lobby);
			else if (r && r.id) { const m = await pk('mine'); if (m && m.lobby) enterLobby(m.lobby); else toast(cap(r.error) + '.'); }
			else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.');
		}, 'host'));
	};
	draw();
	modal(box, { title: 'Play online' });
	// (who has invited me: asked when the screen opens, and again while it stays open)
	const ask = async () => { if (!box.isConnected) return; const r = await pk('invites'); if (!box.isConnected) return; const next = r && Array.isArray(r.invites) ? r.invites : []; if (JSON.stringify(next) !== JSON.stringify(st.invites || [])) { st.invites = next; draw(); } setTimeout(ask, 4000); };
	ask();
	// a match this account is already in (a reload, another device): go straight back to it
	pk('mine').then(r => { if (r && r.lobby && MODE !== 'online') enterLobby(r.lobby); });
}
/** An online match this account is still in (the page was reloaded, the phone slept, another device): the first menu
 *  after the page opens goes straight back into a running one; any menu offers it as its top button. */
function rejoinOffer(box) {
	if (!net || !net.isLoggedIn() || MODE !== 'normal') return;
	const first = !rejoinAsked; rejoinAsked = true;
	pk('mine').then(r => {
		const lb = r && r.lobby;
		if (!lb || lb.over || !box.isConnected || MODE !== 'normal' || G) return;
		if (first && lb.started) { toast('Back to your online match.'); enterLobby(lb); return; }
		box.prepend(btn(lb.started ? `Back to your online match <span class="muted">(code ${esc(lb.code)})</span>` : `Back to your online lobby <span class="muted">(code ${esc(lb.code)})</span>`, 'green big', () => enterLobby(lb), 'rejoin'));
		if (pad) pad.refresh(true);
	});
}
/** The connection: after two syncs in a row with no answer, a banner says so; the first answer takes it away. */
function connState(ok) {
	if (ok) { if (ON.miss >= 2) toast('Connected again.'); ON.miss = 0; }
	else ON.miss++;
	if (el.conn) el.conn.hidden = !(MODE === 'online' && ON.miss >= 2);
}
// ---- tournaments (server/pocket_pvp.mjs pkpvp-t*): a bracket of 4 or 8; each pairing an ordinary online match ----
const TU = { timer: 0 };
async function tourHost(size, st) {
	const r = await pk('tcreate', { size, singles: !!st.singles, ...deckById(st.deck) });
	if (r && r.tour) tourScreen(r.tour); else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.');
}
async function tourJoin(st) {
	const code = await askText({ title: 'The 5-letter tournament code', maxLength: 5, upper: true });
	if (!code) return;
	const r = await pk('tjoin', { code: code.trim().toUpperCase(), ...deckById(st.deck) });
	if (r && r.tour) tourScreen(r.tour); else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.');
}
async function tourOpen(tid) {
	const r = await pk('tget', { tid });
	if (r && r.tour) tourScreen(r.tour);
	else { if (r && (r.closed || /not in that/.test(r.error || ''))) SV.setPref('tour', ''); toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.'); }
}
const roundName = (i, n) => (i === n - 1 ? 'Final' : i === n - 2 ? 'Semi-finals' : 'Quarter-finals');
function tourScreen(t0) {
	closeAll(); clearTimeout(TU.timer);
	SV.setPref('tour', t0.id);
	const box = h('div', 'pe-tour'), me = net && net.myName();
	let paidSaid = false;
	const draw = t => {
		box.innerHTML = '';
		box.appendChild(h('div', 'pe-note', `Tournament code<br><span style="font-size:52px;letter-spacing:8px;color:var(--money)" data-tcode="${esc(t.code)}">${esc(t.code)}</span><br>${t.size} seats${t.singles ? ' · singles' : ''}${t.state === 'lobby' ? ` · ${t.players.length} joined; the rest will be computer players` : ''}`));
		if (t.state === 'lobby') {
			const l = h('div', 'pe-list'); for (const n of t.players) l.appendChild(h('div', 'pe-opt', `${esc(n)}${n === t.host ? ' <span class="muted">(host)</span>' : ''}`)); box.appendChild(l);
			const bar = h('div', 'pe-seg');
			if (t.host === me) bar.appendChild(btn('Start the tournament', 'green big b-go', async () => { const r = await pk('tstart', { tid: t.id }); if (r && r.tour) { draw(r.tour); poll(true); } else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.'); }, 'tstart'));
			bar.appendChild(btn('Leave', 'red', async () => { await pk('tleave', { tid: t.id }); SV.setPref('tour', ''); closeAll(); onlineMenu(); }, 'tleave'));
			box.appendChild(bar);
			if (t.host !== me) box.appendChild(h('div', 'pe-note', 'The host starts the tournament.'));
		} else {
			const br = h('div', 'pe-bracket');
			t.rounds.forEach((r, i) => {
				const col = h('div', 'pe-round'); col.appendChild(h('div', 'pe-note', roundName(i, Math.log2(t.size))));
				for (const g of r) col.appendChild(h('div', 'pe-pair' + (g.a === me || g.b === me ? ' me' : ''), [g.a, g.b].map(n => `<div class="${g.winner === n ? 'won' : g.winner ? 'lost' : ''}">${esc(n)}${g.winner === n ? ' ✓' : ''}</div>`).join('') + (g.live ? '<span class="muted">playing…</span>' : '')));
				br.appendChild(col);
			});
			box.appendChild(br);
			if (t.state === 'over') {
				const place = t.placed[me], word = { 1: 'You won the tournament!', 2: 'Runner-up.', 3: 'Out in the semi-finals.' }[place] || 'The tournament is over.';
				box.appendChild(h('div', 'pe-note pe-tourend', `<b>${esc(word)}</b>${t.paid ? ` <b class="money">+${starN(t.paid)}</b>` : ''}`));
				if (t.paid && !paidSaid) { paidSaid = true; starSync(); }
				box.appendChild(btn('Done', 'orange', () => { SV.setPref('tour', ''); closeAll(); onlineMenu(); }, 'tdone'));
			} else if (t.out) box.appendChild(h('div', 'pe-note', 'You are out: watch how it ends, or leave.'));
			else if (!t.mine) box.appendChild(h('div', 'pe-note', 'Waiting for the other matches of this round…'));
			if (t.state !== 'over') box.appendChild(btn('Leave the tournament', 'red', async () => { await pk('tleave', { tid: t.id }); SV.setPref('tour', ''); closeAll(); onlineMenu(); }, 'tleave'));
		}
		if (pad) pad.refresh(true);
	};
	// asked every few seconds while this screen is up: a match of mine that is ready is entered at once
	const poll = async now => {
		clearTimeout(TU.timer);
		if (!now) { TU.timer = setTimeout(() => poll(true), 2500); return; }
		if (!box.isConnected || MODE === 'online') return;
		const r = await pk('tget', { tid: t0.id });
		if (!box.isConnected || MODE === 'online') return;
		if (r && r.tour) {
			draw(r.tour);
			if (r.tour.mine) { const m = await pk('sync', { id: r.tour.mine.lid, n: -1 }); if (m && m.lobby && m.lobby.tid === t0.id && m.lobby.started && !m.lobby.over) { toast('Your tournament match is ready.'); enterLobby(m.lobby); return; } }
		} else if (r && r.closed) { SV.setPref('tour', ''); draw({ ...t0, state: 'over', placed: {}, rounds: t0.rounds || [] }); return; }
		poll(false);
	};
	draw(t0);
	modal(box, { title: 'Tournament', onClose: () => clearTimeout(TU.timer) });
	poll(true);
}
function enterLobby(lobby) {
	closeAll(); clearTimeout(aiTimer); aiTimer = 0; stopReplayTimer(); stopPublishing();
	MODE = 'online'; G = S = V = R = null; overShown = false; ON.miss = 0; connState(true);
	ui.cmds = [null, null]; ui.pick = null; ui.setup = { active: [], bench: [] }; ui.prevDmg = new Map(); ui.coinN = null;
	Object.assign(ON, { id: lobby.id, lobby, mid: 0, n: -1, seat: -1, busy: false, recipe: null, sig: '' });
	render(); showLobby(true); pollOnline();
}
function showLobby(force) {
	const lb = ON.lobby; if (!lb) return;
	if (lb.tid) {   // (a tournament's match: played once; the tournament is where to go next)
		const sig = JSON.stringify(lb); if (!force && sig === ON.sig && topModal()) return; ON.sig = sig;
		closeAll();
		const box = h('div', 'pe-list');
		box.appendChild(h('div', 'pe-note', lb.over ? 'This tournament match is over.' : 'A tournament match.'));
		if (!lb.over) box.appendChild(btn('Back to the match', 'blue big b-go', () => closeAll(), 'toMatch'));
		box.appendChild(btn('Back to the tournament', 'green big', () => { const t = lb.tid; leaveOnline(true); tourOpen(t); }, 'totour'));
		modal(box, { title: 'Tournament match', noClose: true });
		return;
	}
	const sig = JSON.stringify(lb);
	if (!force && sig === ON.sig && topModal()) return;
	ON.sig = sig;
	closeAll();
	const me = net.myName(), host = lb.host === me, mine = lb.players.find(p => p.name === me) || {}, idle = !lb.started || lb.over;
	const box = h('div', '');
	box.appendChild(h('div', 'pe-note', `Match code<br><span style="font-size:64px;letter-spacing:8px;color:var(--money)" data-code="${esc(lb.code)}">${esc(lb.code)}</span><br>Anyone signed in can join with it.<br><b class="pe-lobbymode">${lb.singles ? 'Singles: 1 Active, 3 on the Bench' : 'Doubles: 2 Active, 4 on the Bench'}</b>`));
	const list = h('div', 'pe-list');
	for (const p of lb.players) list.appendChild(h('div', 'pe-opt', `${esc(p.name)}${p.name === lb.host ? ' <span class="muted">(host)</span>' : ''}<span class="why" style="color:${p.ready ? 'var(--green)' : '#f0b9b4'}">${p.away ? 'away' : p.ready ? 'ready' : 'not ready'}</span>`));
	for (let i = 0; i < lb.bots; i++) list.appendChild(h('div', 'pe-opt', `<span class="muted">Computer player</span><span class="why" style="color:var(--green)">ready</span>`));
	for (let i = lb.players.length + lb.bots; i < lb.size; i++) list.appendChild(h('div', 'pe-opt', '<span class="muted">Open seat…</span>'));
	box.appendChild(list);
	const bar = h('div', 'pe-seg'); bar.style.marginTop = '10px';
	const up = async body => { const r = await pk('update', { id: lb.id, ...body }); if (r && r.lobby) { ON.lobby = r.lobby; showLobby(); } else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.'); };
	if (idle) {
		if (host) {
			const seats = lb.players.length + lb.bots, ok = seats >= 2 && lb.players.every(p => p.ready);
			const s = btn(lb.over ? 'Start another match' : 'Start the match', 'green big b-go', async () => { const r = await pk('start', { id: lb.id }); if (r && r.match) onServer(r); else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.'); }, 'ostart'); s.disabled = !ok; bar.appendChild(s);
			if (lb.players.length + lb.bots < lb.size) bar.appendChild(btn('Add a computer player', 'grey', () => up({ bots: lb.bots + 1 }), 'obot+'));
			if (lb.bots > 0) bar.appendChild(btn('Remove one', 'grey', () => up({ bots: lb.bots - 1 }), 'obot-'));
			if (lb.players.length + lb.bots < lb.size) bar.appendChild(btn('Invite a friend', 'blue', () => inviteMenu(), 'oinvite'));
		} else bar.appendChild(btn(mine.ready ? 'Not ready' : 'Ready', mine.ready ? 'grey big' : 'green big b-go', () => up({ ready: !mine.ready }), 'oready'));
	} else bar.appendChild(btn('Back to the match', 'blue big b-go', () => closeAll(), 'toMatch'));
	bar.appendChild(btn('Leave', 'red', () => leaveOnline(true), 'oleave'));
	box.appendChild(bar);
	if (idle && !host) box.appendChild(h('div', 'pe-note', 'The host starts the match when everyone is ready.'));
	modal(box, { title: lb.over ? 'Match over — the lobby' : 'Online match', noClose: true });
}
/** A reply from the referee: the lobby, and (in a match) my seat's view when the position changed. */
/** A quick message from someone at the table: shown for a few seconds, and written in the log's place for screen readers. */
function showSay(s) {
	if (!SAY[s.i]) return;
	const mine = net && s.by === net.myName(), b = h('div', 'pe-say' + (mine ? ' mine' : ''), `<b>${esc(s.by)}</b> ${esc(SAY[s.i])}`); b.setAttribute('role', 'status');
	el.fx.querySelectorAll('.pe-say').forEach((e, i, all) => { if (all.length - i > 2) e.remove(); });
	el.fx.appendChild(b); if (!mine) play('highlight1', 1.2, 0.4);
	setTimeout(() => b.remove(), 4200);
}
function sayMenu() {
	const box = h('div', 'pe-list pe-saylist');
	SAY.forEach((t, i) => box.appendChild(btn(esc(t), 'grey', async () => { closeModal(); const r = await pk('say', { id: ON.id, i }); if (r && r.error) toast(/one message/.test(r.error) ? 'One message at a time.' : r.error); else onServer(r); }, 'say' + i)));
	modal(box, { title: 'Say' });
}
function onServer(r) {
	if (MODE !== 'online') return;
	if (!r) return;
	if (r.closed || (r.error && /closed|not in that match/.test(r.error))) { toast('That match has closed.'); leaveOnline(false); return; }
	if (r.error) { if (/out of date/.test(r.error)) toast('The game was updated: reload the page.'); return; }
	if (r.lobby) { ON.lobby = r.lobby; for (const s of r.lobby.says || []) if (s.k > ON.sayK) { ON.sayK = s.k; showSay(s); } }
	const m = r.match;
	if (m) {
		ON.seat = m.seat;
		if (m.recipe) ON.recipe = m.recipe;
		if (m.view && m.mid === ON.mid && m.n < ON.n) return;   // an older reply that arrived late: the table is already past it
		if (m.view) {
			const fresh = m.mid !== ON.mid || !V;   // a new match in the same lobby
			ON.mid = m.mid;
			if (fresh) { overShown = !!m.over && !!V; ui.prevDmg = new Map(); ui.cmds = [null, null]; ui.setup = { active: [], bench: [] }; ui.coinN = null; ON.recipe = m.recipe || null; if (!m.over) closeAll(); if (!publisher) startPublishing(); }
			ON.n = m.n;
			setView(m.view);
		}
	} else if (ON.lobby && !ON.lobby.started) { if (V) { V = null; ON.n = -1; render(); } showLobby(); }
	if (ON.lobby && ON.lobby.over && !topModal()) showLobby();
}
function pollOnline() {
	clearTimeout(ON.timer);
	if (MODE !== 'online') return;
	const wait = !V ? 1500 : myTurn() ? 2500 : 1100;
	ON.timer = setTimeout(async () => {
		if (MODE !== 'online') return;
		// (a hidden tab keeps polling: a player who looks away is still in the match, and the server's clock is running)
		if (!ON.busy) { try { const r = await pk('sync', { id: ON.id, n: ON.n }); connState(!!r); onServer(r); } catch (e) { console.warn('pocket: sync failed', e); } }
		pollOnline();
	}, wait);
}
// the phone wakes or the network comes back: ask at once instead of waiting out the timer
function pollSoon() { if (MODE === 'online' && !ON.busy) { clearTimeout(ON.timer); ON.timer = setTimeout(async () => { if (MODE !== 'online') return; try { const r = await pk('sync', { id: ON.id, n: ON.n }); connState(!!r); onServer(r); } catch (e) { /* the regular poll goes on */ } pollOnline(); }, 50); } }
if (typeof window !== 'undefined') { window.addEventListener('online', pollSoon); document.addEventListener('visibilitychange', () => { if (!document.hidden) pollSoon(); }); }
async function sendOnline(a) {
	if (ON.busy || !V) return false;
	ON.busy = true;
	const r = await pk('act', { id: ON.id, n: ON.n, a });
	ON.busy = false;
	if (!r) { toast('Could not reach the server. Try again.'); return false; }
	if (r.refused) { toast(cap(r.refused) + '.'); play('cancel'); }
	onServer(r);
	return !r.refused && !r.error;
}
function leaveOnline(tell) {
	clearTimeout(ON.timer); stopPublishing(); ON.miss = 0; if (el.conn) el.conn.hidden = true;
	const id = ON.id;
	if (tell && id && net) pk('leave', { id });
	Object.assign(ON, { id: null, lobby: null, mid: 0, n: -1, seat: -1, busy: false, recipe: null, sig: '' });
	MODE = 'normal'; G = S = V = R = null; ui.pick = null; render(); mainMenu();
}

// ------------------------------------------------------------------ replays
async function shareReplay(recipe) {
	try {
		const code = await packString(JSON.stringify(recipe)), url = location.origin + '/pocketenhanced/?replay=' + code;
		await navigator.clipboard.writeText(url); toast('Replay link copied.');
	} catch (e) { toast('Could not copy the link on this device.'); }
}
/** The name of the deck these cards are (one of mine, a starter, a theme deck), for the match history; online, the deck last chosen. */
function deckNameOf(cards) {
	const key = c => (c || []).slice().sort().join(',');
	if (cards && cards.length) { const k = key(cards); const d = allDecks().find(x => { try { return key(x.get().deck) === k; } catch (e) { return false; } }) || THEME_DECKS.find(t => key(t.cards) === k); if (d) return d.name; return ''; }
	return (findDeck(SV.prefs().deck) || {}).name || '';
}
/** What kind of match this was, for the match history. */
function matchKind(online) {
	if (online) return ON.lobby && ON.lobby.bots === 0 && ON.lobby.size === 2 ? 'Online (ranked)' : 'Online';
	const c = G && G.config || {};
	if (c.trainer) return 'Gym Leader ' + ((c.players && c.players[1] && c.players[1].name) || '');   // (a Gym Leader from the overworld: their name is the other seat's)
	if (c.solo) { const b = soloById(c.solo); return b ? 'Solo: ' + b.name : 'Solo battle'; }
	if (c.tutorial) return 'Tutorial';
	return 'Match';
}
/** One finished match in the history: who, the result, what kind, the deck, when. */
function historyRow(r) {
	const s = r.summary || {}, you = s.you, others = (s.players || []).filter((p, i) => i !== you), mine = you != null && s.players ? s.players[you] : null;
	const res = s.won === true ? '<b style="color:var(--green)">Win</b>' : s.won === false ? '<b style="color:#f0b9b4">Loss</b>' : esc(s.winner ? s.winner + ' won' : 'No winner');
	const pts = mine ? `${mine.points}–${others.map(p => p.points).join('–')}` : (s.players || []).map(p => p.points).join('–');
	const vs = others.length ? 'vs ' + others.map(p => p.name).join(', ') : '';
	const d = new Date(r.at), when = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	return `${res} ${esc(vs)} <span class="muted">${esc(pts)}</span><span class="why">${[s.kind, s.deck].filter(Boolean).map(esc).join(' · ')}${s.kind || s.deck ? ' · ' : ''}${esc(when)}</span>`;
}
function historyPick(r) {
	const box = h('div', 'pe-list');
	box.appendChild(h('div', 'pe-note', historyRow(r)));
	box.appendChild(btn('Watch the replay', 'green big b-go', () => { closeAll(); startReplay(r.recipe); }, 'hwatch'));
	box.appendChild(btn('Copy replay link', 'blue', () => shareReplay(r.recipe), 'hlink'));
	modal(box, { title: 'Match' });
}
function replaysMenu() {
	const list = h('div', 'pe-list'), all = SV.listReplays();
	{ const r = SV.record(), top = Object.entries(r.decks).filter(([, d]) => d.played > 0).sort((a, b) => b[1].played - a[1].played).slice(0, 4); list.appendChild(h('div', 'pe-note pe-record', recordText(r) + (top.length ? '<br>' + top.map(([n, d]) => `${esc(n)}: ${d.won} of ${d.played}`).join(' · ') : ''))); }
	if (!all.length) list.appendChild(h('div', 'pe-note', 'Finished matches are kept here (the last 20).'));
	all.forEach((r, i) => { const o = h('button', 'pe-opt pe-hist', historyRow(r)); o.type = 'button'; o.dataset.k = 'r' + i; o.addEventListener('click', () => historyPick(r)); list.appendChild(o); });
	modal(list, { title: 'Match history' });
}
function stopReplayTimer() { if (R && R.timer) { clearInterval(R.timer); R.timer = 0; } }
function startReplay(recipe) {
	const end = SV.rebuildRecipe(recipe);
	if (!end) { toast('That replay cannot be played by this version of the game.'); return false; }
	closeAll(); clearTimeout(aiTimer); aiTimer = 0; stopReplayTimer();
	stopPublishing();
	MODE = 'replay'; G = null; R = { recipe, pos: 0, pov: 0, timer: 0 };
	ui.cmds = [null, null]; ui.pick = null; ui.prevDmg = new Map();
	seek(0);
	return true;
}
function seek(pos) {
	const n = R.recipe.actions.length; pos = Math.max(0, Math.min(n, pos));
	if (S && pos === R.pos + 1 && S.actions === R.pos) E.apply(S, R.recipe.actions[R.pos]); else { S = E.replay(R.recipe.config, R.recipe.actions, pos); ui.prevDmg = new Map(); }
	R.pos = pos;
	if (pos >= n) stopReplayTimer();
	sync();
}
function replayBar() {
	const bar = h('div', 'pe-replaybar'), n = R.recipe.actions.length;
	bar.appendChild(btn('⏮', 'grey', () => seek(0), 'rb0'));
	bar.appendChild(btn('◀', 'grey', () => seek(R.pos - 1), 'rb1'));
	bar.appendChild(btn(R.timer ? 'Pause' : 'Play', 'blue', () => { if (R.timer) stopReplayTimer(); else { if (R.pos >= n) seek(0); R.timer = setInterval(() => seek(R.pos + 1), 700); } render(); }, 'rb2'));
	bar.appendChild(btn('▶', 'grey', () => seek(R.pos + 1), 'rb3'));
	bar.appendChild(btn('⏭', 'grey', () => seek(n), 'rb4'));
	const sl = h('input'); sl.type = 'range'; sl.min = 0; sl.max = n; sl.value = R.pos; sl.setAttribute('aria-label', 'Position in the replay'); sl.addEventListener('input', () => seek(+sl.value));
	bar.append(sl, h('span', '', `${R.pos} / ${n}`));
	bar.appendChild(btn(`View: ${esc(S.players[R.pov].name)}`, 'orange', () => { R.pov = (R.pov + 1) % S.players.length; sync(); }, 'rbpov'));
	bar.appendChild(btn('Menu', 'grey', () => optionsMenu(), 'menu'));
	return bar;
}

// ------------------------------------------------------------------ the deck builder
function deckBuilder(start) {
	// (a new deck starts from the first starter deck, as far as your collection covers it)
	const d = start || (SV.listDecks()[0] ? { ...SV.listDecks()[0] } : { name: 'My deck', ...starterDeck(STARTERS[0].id) }), kept = new Map();
	const st = { name: d.name, deck: start || SV.listDecks()[0] ? d.deck.slice() : d.deck.filter(id => { const n = (kept.get(id) || 0) + 1; kept.set(id, n); return n <= COLL.ownedByName(COL, id); }), energy: d.energy.slice(), filter: 'All', mine: false, q: '', set: 'All', prints: { ...ownedPrints(d.prints) } };
	const box = h('div', '');
	// the printings of a card that this player owns (the card's own first), and choosing one for the deck
	const printsOwned = id => card(id).printings.filter(p => (COL.prints[p] || 0) > 0);
	const printName = p => { const i = COLL.printInfo(p), k = lookOf(p); return `${i ? COLL.RARITY[i.rarity] || '' : ''} ${k ? LOOK_NAME[k] : 'Standard'}`.trim(); };
	const choosePrint = id => {
		const c = card(id), grid = h('div', 'pe-grid pe-printpick');
		for (const p of printsOwned(id)) {
			const e = handCard(c, null, rarMark(COLL.printInfo(p).rarity) + `<span class="own">${esc(printName(p))}</span>`, p); e.classList.add('small'); e.dataset.k = 'pp' + p; e.setAttribute('aria-label', `${c.name}, ${printName(p)}`);
			if ((st.prints[id] || id) === p) e.classList.add('chosen');
			e.addEventListener('click', () => { if (p === id) delete st.prints[id]; else st.prints[id] = p; closeModal(); draw(); toast(`${c.name}: ${printName(p)}.`); });
			grid.appendChild(e);
		}
		modal(grid, { title: `${c.name}: which printing is in this deck` });
	};
	const FILTERS = ['All', 'Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless', 'Trainers'];
	const ENERGY = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'];
	const count = id => st.deck.filter(x => card(x).name === card(id).name).length;
	const draw = () => {
		const poolY = box.querySelector('.pool') ? box.querySelector('.pool').scrollTop : 0;
		box.innerHTML = '';
		const seg = h('div', 'pe-seg'); for (const f of FILTERS) seg.appendChild(btn(f, 'grey' + (st.filter === f ? ' on' : ''), () => { st.filter = f; draw(); pad && pad.refresh(true); }, 'f' + f));
		seg.appendChild(btn(st.mine ? 'Showing: owned' : 'Showing: every card', 'orange', () => { st.mine = !st.mine; draw(); pad && pad.refresh(true); }, 'mine')); box.appendChild(seg);
		const row2 = h('div', 'pe-seg');
		row2.appendChild(btn(`Set: ${esc(st.set === 'All' ? 'every set' : (SET_NAMES.find(s => s[0] === st.set) || [0, st.set])[1])}`, 'grey' + (st.set !== 'All' ? ' on' : ''), () => { const l = h('div', 'pe-list'); for (const [code, name] of [['All', 'Every set'], ...SET_NAMES]) { const o = h('button', 'pe-opt', esc(name)); o.type = 'button'; o.dataset.k = 'set' + code; o.addEventListener('click', () => { closeModal(); st.set = code; draw(); }); l.appendChild(o); } modal(l, { title: 'Cards from which set?' }); }, 'set'));
		row2.appendChild(searchBox(st, 'q', draw, 'Search cards by name')); box.appendChild(row2);
		const ql = st.q.trim().toLowerCase();
		const db = h('div', 'pe-db'), pool = h('div', 'pool');
		for (const c of CARDS) {
			if (st.filter === 'Trainers' ? c.kind === 'pokemon' : st.filter !== 'All' && !(c.kind === 'pokemon' && ofType(c, st.filter))) continue;
			if ((st.set !== 'All' && c.set !== st.set) || (ql && !c.name.toLowerCase().includes(ql))) continue;
			const n = count(c.id), own = COLL.ownedByName(COL, c.id); if (st.mine && !own) continue;
			const b = handCard(c, null, (n ? `<span class="have">${n}</span>` : '') + `<span class="own">${own ? 'own ' + own : 'not owned'}</span>`); b.classList.add('small'); if (!own) b.classList.add('lack'); b.dataset.k = 'c' + c.id;
			b.addEventListener('click', () => { if (st.deck.length >= E.LIMITS.deck) toast('A deck is 20 cards.'); else if (count(c.id) >= E.LIMITS.copies) toast('Two cards of a name at most.'); else if (count(c.id) >= own) toast(own ? `You own ${own} ${c.name}. Open packs for another.` : `You do not own ${c.name}. Open packs, or exchange pack points in your Collection.`); else { st.deck.push(c.id); play('cardSlide1'); draw(); } });
			pool.appendChild(b);
		}
		const mine = h('div', 'mine');
		const name = h('input'); name.type = 'text'; name.maxLength = 24; name.value = st.name; name.setAttribute('aria-label', 'Deck name'); name.style.cssText = 'font:inherit;font-size:22px;padding:6px 10px;border-radius:10px;border:0'; name.addEventListener('input', () => { st.name = name.value; });
		mine.appendChild(name);
		const es = h('div', 'pe-seg'); for (const e of ENERGY) { const b = btn(en(e), 'grey' + (st.energy.includes(e) ? ' on' : ''), () => { if (st.energy.includes(e)) st.energy = st.energy.filter(x => x !== e); else if (st.energy.length < 3) st.energy.push(e); else toast('Three Energy types at most.'); draw(); }, 'e' + e); b.setAttribute('aria-label', e + ' Energy'); b.style.padding = '6px 9px'; es.appendChild(b); } mine.appendChild(es);
		const lack = COLL.missingFor(COL, st.deck);
		const err = E.deckError(st.deck, st.energy) || (lack.length ? `you do not own ${lack.map(m => (m.need - m.have > 1 ? `${m.need - m.have} ` : '') + m.name).slice(0, 3).join(', ')}${lack.length > 3 ? ` and ${lack.length - 3} more` : ''}` : null);
		mine.appendChild(h('div', 'pe-note', `${st.deck.length} / 20 cards${err ? ` · <span class="red">${esc(err)}</span>` : ' · <span style="color:var(--green)">legal</span>'}`));
		mine.appendChild(h('div', 'pe-note', deckNote()));
		// (what to look at in this deck: deckhelp.js, the first three)
		{ const adv = deckAdvice(st.deck, st.energy); if (adv.length) { const a = h('div', 'pe-note pe-advice'); a.setAttribute('role', 'status'); a.innerHTML = adv.slice(0, 3).map(t => '⚠ ' + esc(t)).join('<br>'); mine.appendChild(a); } }
		const rows = h('div', 'rows'), seen = new Set();
		for (const id of st.deck.slice().sort((a, b) => (card(a).kind === 'pokemon' ? 0 : 1) - (card(b).kind === 'pokemon' ? 0 : 1) || card(a).name.localeCompare(card(b).name))) {
			const c = card(id); if (seen.has(c.name)) continue; seen.add(c.name);
			const r = h('button', 'rowb', `${c.kind === 'pokemon' ? ty(c.cardType) : ''} ${esc(c.name)}<span class="x">×${count(id)} −</span>`); r.type = 'button'; r.dataset.k = 'm' + id; r.setAttribute('aria-label', `Remove one ${c.name}`);
			r.addEventListener('click', () => { const i = st.deck.findIndex(x => card(x).name === c.name); st.deck.splice(i, 1); if (!st.deck.includes(id)) delete st.prints[id]; draw(); });
			rows.appendChild(r);
			// (a card you own in more than one printing: which one this deck holds, and so which one is seen in a match)
			if (printsOwned(id).length > 1) { const pb = h('button', 'rowb prb', `<span class="muted">printing</span> ${esc(printName(st.prints[id] || id))} <span class="x">▸</span>`); pb.type = 'button'; pb.dataset.k = 'pr' + id; pb.setAttribute('aria-label', `Choose the printing of ${c.name}`); pb.addEventListener('click', () => choosePrint(id)); rows.appendChild(pb); }
		}
		mine.appendChild(rows);
		const bar = h('div', 'pe-seg');
		const sv = btn('Save deck', 'green', () => { const e = keepDeck(st); toast(e ? cap(e) + '.' : `Saved "${st.name}".`); draw(); }, 'save'); sv.disabled = !!err; bar.appendChild(sv);
		bar.appendChild(btn('Clear', 'red', () => { st.deck = []; st.prints = {}; draw(); }, 'clear'));
		if (st.deck.length < E.LIMITS.deck) bar.appendChild(btn('Finish this deck', 'blue', () => {
			const r = finishDeck(st.deck, st.energy, id => COLL.ownedByName(COL, id));
			if (!r.added.length) { toast('Nothing more you own fits this deck.'); return; }
			st.deck = r.deck; st.energy = r.energy; draw(); toast(`Added ${r.added.length} card${r.added.length === 1 ? '' : 's'} from your collection.`);
		}, 'finish'));
		bar.appendChild(btn('Load…', 'grey', () => { const l = h('div', 'pe-list'); for (const x of everyDeck()) { const o = h('button', 'pe-opt', esc(x.name)); o.type = 'button'; o.addEventListener('click', () => { const g = x.get(); closeModal(); st.deck = g.deck; st.energy = g.energy; st.prints = { ...(g.prints || {}) }; st.name = x.id.startsWith('my:') ? x.id.slice(3) : x.name + ' copy'; draw(); }); l.appendChild(o); if (x.id.startsWith('my:')) { const del = h('button', 'pe-opt', `Delete ${esc(x.id.slice(3))}`); del.type = 'button'; del.style.color = '#f0b9b4'; del.addEventListener('click', () => { dropDeck(x.id.slice(3)); closeModal(); toast('Deleted.'); }); l.appendChild(del); } } for (const s of THEME_SETS) { l.appendChild(h('div', 'pe-note', `Pocket's decks: ${esc(s)}`)); for (const t of THEME_DECKS.filter(t => t.set === s)) { const o = h('button', 'pe-opt', `${esc(t.name)} <small>${t.energy.map(esc).join(' / ')}</small>`); o.type = 'button'; o.dataset.k = 'l' + t.id; o.addEventListener('click', () => { closeModal(); st.deck = t.cards.slice(); st.energy = t.energy.slice(); st.name = t.name + ' copy'; draw(); }); l.appendChild(o); } } modal(l, { title: 'Load a deck' }); }, 'load'));
		const bar2 = h('div', 'pe-seg');
		bar2.appendChild(btn('Copy deck code', 'grey', async () => { const code = deckCode(st); try { await navigator.clipboard.writeText(code); toast('Deck code copied.'); } catch (e) { const i = h('input'); i.type = 'text'; i.readOnly = true; i.value = code; i.className = 'pe-search'; i.style.width = '100%'; modal(i, { title: 'Deck code' }); i.select(); } }, 'copycode'));
		bar2.appendChild(btn('Paste deck code', 'grey', () => {
			const w = h('div', 'pe-list'), i = h('input'); i.type = 'text'; i.className = 'pe-search'; i.placeholder = 'PE1:…'; i.setAttribute('aria-label', 'Deck code'); i.dataset.k = 'codein'; w.appendChild(i);
			w.appendChild(btn('Load this deck', 'green', () => { const r = readDeckCode(i.value); if (r.error) { toast(cap(r.error) + '.'); return; } closeModal(); st.deck = r.deck; st.energy = r.energy; st.prints = {}; st.name = 'Shared deck'; draw(); toast('Deck loaded.'); }, 'codeload'));
			modal(w, { title: 'Paste a deck code' }); setTimeout(() => i.focus(), 0);
		}, 'pastecode'));
		mine.appendChild(bar); mine.appendChild(bar2);
		db.append(pool, mine); box.appendChild(db);
		pool.scrollTop = poolY;
		if (pad) pad.refresh();
	};
	draw();
	modal(box, { title: 'Deck builder' });
}

// ------------------------------------------------------------------ keyboard + controller: a focus ring over the buttons
function makePad() {
	const ret = h('div', 'pad-reticle'); ret.style.display = 'none'; ret.style.position = 'fixed'; document.body.appendChild(ret);
	const hints = h('div'); hints.id = 'pad-hints'; hints.style.display = 'none'; document.body.appendChild(hints);
	let focus = null, focusKey = null, ringOn = false, kind = 'generic', src = 'pad', inp = null, startAlone = false;
	const shown = e => { if (e.disabled) return false; const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
	// (every control is a stop: buttons, the replay slider, and the text fields: a deck's name, the searches, a deck code)
	const isText = e => !!e && e.tagName === 'INPUT' && /^(text|search|)$/.test(e.type || '');
	const stops = () => { const m = topModal(); return [...(m ? m.el : el.table).querySelectorAll('button, input[type=range], input[type=text], input[type=search]')].filter(shown); };
	const center = e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
	function home(list) {
		const m = topModal();
		if (m) return list.find(e => e.matches('.pe-pull.down, .b-go, .b-again, .b-new, [data-k=continue], [data-k^=atk]')) || list[0];
		if (ui.pick) return list.find(e => e.classList.contains('legal')) || list[0];
		return list.find(e => e.dataset.k === 'ready') || list.find(e => e.classList.contains('playable')) || list.find(e => e.dataset.k === `p:${YOU()}:active:0`) || list.find(e => e.dataset.k === 'exec') || list[0];
	}
	function draw() {
		if (!ringOn || !focus || !focus.isConnected) { ret.style.display = 'none'; return; }
		const r = focus.getBoundingClientRect();
		Object.assign(ret.style, { display: '', left: (r.left - 6) + 'px', top: (r.top - 6) + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px' });
	}
	function setFocus(e) { focus = e || null; focusKey = focus ? focus.dataset.k || null : null; if (focus && ringOn) { try { focus.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (x) { /* old browsers */ } } draw(); }
	function ensure(reset) {
		const list = stops();
		if (!reset && focus && list.includes(focus)) { draw(); return; }
		// the table is redrawn after every action: the ring follows the same button by its key
		const same = !reset && focusKey ? list.find(e => e.dataset.k === focusKey) : null;
		setFocus(same || home(list));
	}
	function move(dir) {
		ringOn = true;
		const list = stops();
		if (!focus || !list.includes(focus)) { ensure(false); return; }
		const a = center(focus); let best = null, bd = Infinity;
		for (const e of list) {
			if (e === focus) continue;
			if ((dir === 'up' || dir === 'down') && e.parentElement === focus.parentElement && e.parentElement.classList.contains('pe-hand')) continue;   // (the hand is one row, though it is held as a fan: up and down leave it)
			const b = center(e), dx = b.x - a.x, dy = b.y - a.y;
			const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
			const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
			if (main <= 4) continue;
			const d = main + side * 2;
			if (d < bd) { bd = d; best = e; }
		}
		if (best) { setFocus(best); play('cardSlide2', 1.2, 0.5); }
	}
	const seen = () => ringOn && focus && focus.isConnected && stops().includes(focus);
	function confirm() {
		if (!seen()) { ringOn = true; ensure(false); return; }
		if (isText(focus)) {
			// a text field. A keyboard types in it (Enter or Esc comes back out to the ring); a controller gets the on-screen keyboard.
			const f = focus;
			if (src === 'key') { try { f.focus(); f.select(); } catch (e) { /* not focusable now */ } return; }
			askText({ title: f.getAttribute('aria-label') || f.placeholder || 'Enter text', initial: f.value, maxLength: f.maxLength > 0 ? f.maxLength : 200 }).then(v => { if (v != null && f.isConnected) { f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); } if (pad) pad.refresh(); });
			return;
		}
		focus.click();
	}
	function cancel() {
		const m = topModal();
		if (m) { if (!m.noClose) closeModal(); return; }
		if (ui.pick) cancelPick();
	}
	function inspectFocus() {
		if (topModal() || !seen() || !V) return;
		const k = focus.dataset.k || '';
		if (k.startsWith('h:')) { const me = V.players[pov()]; if (me && me.hand) inspect(card(me.hand[+k.slice(2)])); }
		else if (k.startsWith('p:')) { const [, s, z, i] = k.split(':'); const loc = { seat: +s, zone: z, idx: +i }; if (at(V, loc)) inspect(def(at(V, loc)), at(V, loc), loc); }
	}
	const lbl = a => (src === 'key' ? keyLabel(a) : buttonLabel(a, kind));
	const showHints = () => {
		hints.style.display = '';
		const k = a => `<span class="pk">${esc(lbl(a))}</span>`;
		hints.innerHTML = `${k('confirm')}Choose<span class="sep"></span>${k('cancel')}Back<span class="sep"></span>${k('secondary')}${V && V.singles ? 'Pass turn' : 'Execute'}<span class="sep"></span>${k('context')}Read card${src === 'pad' ? '<span class="sep"></span>' + k('menu') + 'Menu' : ''}`;
	};
	const menu = () => { if (topModal()) return; if (V) optionsMenu(); };
	const onAction = (a, info) => {
		if (oskOpen()) return false;   // the on-screen keyboard has the input
		src = info.source === 'key' ? 'key' : 'pad';
		if (['up', 'down', 'left', 'right'].includes(a)) {
			// a focused slider (the replay position) takes left / right itself
			if (seen() && focus.tagName === 'INPUT' && focus.type === 'range' && (a === 'left' || a === 'right')) { focus.value = +focus.value + (a === 'left' ? -1 : 1); focus.dispatchEvent(new Event('input')); showHints(); return true; }
			move(a); showHints(); return true;
		}
		if (a === 'confirm') confirm();
		else if (a === 'cancel') cancel();
		else if (a === 'secondary') { if (!topModal() && myTurn() && !ui.pick) execute(); }
		else if (a === 'context') inspectFocus();
		else if (a === 'menu') {
			// a controller's Start acts on its RELEASE, and only alone: Start + Select opens the Games switcher
			if (src === 'pad') { startAlone = !(inp && inp.held('select')); return true; }
			if (seen() || topModal()) confirm(); else menu();
		} else if (a === 'select') { startAlone = false; return true; }
		else return false;
		showHints();
		return true;
	};
	const onRelease = (a, info) => { if (a !== 'menu' || info.source !== 'pad') return; const go = startAlone && !info.forced; startAlone = false; if (go) { src = 'pad'; menu(); showHints(); } };
	try { inp = window.__pocketInput = startInput({ onAction, onRelease, pad: true, padOptions: { onConnect: info => { kind = (info && info.kind) || 'generic'; } } }); } catch (e) { /* no input support */ }
	addEventListener('keydown', ev => {
		if (oskOpen() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
		// typing in one of the game's text fields: Enter or Esc leaves the field and gives the keys back to the ring
		if (isText(ev.target) && stage.contains(ev.target) && (ev.key === 'Escape' || ev.key === 'Enter')) { ev.preventDefault(); ev.stopPropagation(); const k = ev.target.dataset.k; ev.target.blur(); ringOn = true; requestAnimationFrame(() => { const same = k ? stops().find(e => e.dataset.k === k) : null; if (same) setFocus(same); else ensure(false); showHints(); }); return; }
		if (isTyping(ev.target && ev.target.tagName ? ev.target : undefined)) return;
		if (ev.key === 'Escape') cancel();
	});
	addEventListener('pointerdown', () => { ringOn = false; draw(); hints.style.display = 'none'; }, true);
	addEventListener('resize', () => draw());
	return {
		refresh(reset) { if (ringOn) requestAnimationFrame(() => ensure(reset)); },
		get focus() { return focus; }, get ringOn() { return ringOn; },
	};
}

// ------------------------------------------------------------------ boot
let last = performance.now() / 1000;
function frame() { requestAnimationFrame(frame); const now = performance.now() / 1000, dt = Math.min(0.1, now - last); last = now; if (bg) { try { bg.draw(now, dt); } catch (e) { bg = null; } } }

window.__pocket = {
	ready: false,
	get mode() { return MODE; },
	view: () => V, state: () => S, ui: () => ui,
	act: a => send(a),
	start: (o = {}) => startMatch(o.players || 2, o.deckId ? findDeck(o.deckId).get() : o.deck ? { deck: o.deck, energy: o.energy } : starterDeck(o.starter || STARTERS[0].id), o.seed, !!o.singles, !!o.easy, !!o.tutorial),   // (deckId: a deck as the New match menu would take it, e.g. 'my:<name>')
	canPlay: id => !!findDeck(id), give: prints => { const p = { ...COL.prints }; for (const [id, n] of Object.entries(prints || {})) p[id] = (p[id] || 0) + n; saveCol({ ...COL, prints: p }); },   // (give: cards into the collection, for a test that needs a deck owned)
	showFound: () => showFound(),
	stars: () => Stars.stars(), earnStars: n => { Stars.earn(n); packLabel(); return Stars.stars(); },
	energy: t => en(t, 'big'),   // (an Energy sign as markup: for looking at all ten)
	coach: () => coachTip(), wonder: () => wonderMenu(), inbox: () => inboxNow(), say: s => showSay(s), trade: () => ({ id: TR.id, role: TR.role, them: TR.them, t: TR.t, mine: TR.mine, col: !!TR.col, scene: TR.scene ? Math.round(performance.now() - TR.scene) : 0, goAt: !!TR.goAt }),
	face: (id, print) => face(card(id), null, print), look: print => lookOf(print), ofType: (id, t) => ofType(card(id), t), sheen: () => (sheen ? { ok: sheen.ok(), live: sheen.live() } : null), tip: () => (tipEl && tipEl.style.display !== 'none' ? { text: tipEl.textContent, for: tipFor && tipFor.dataset.tip, w: tipEl.offsetWidth, x: tipEl.offsetLeft, y: tipEl.offsetTop } : null),   // (a card's face as markup: for looking at the art of every card)
	idle: () => idle(),
	fast: on => { ui.fast = on !== false; tickAI(); },
	coinBusy: () => coinBusy,
	engineState: () => S,   // (tests: the match itself, to arrange a position; then refresh)
	refresh: () => sync(),   // (redraw from the match as it stands: a test that changes the state directly calls this)
	testCoin: heads => { if (V) setView({ ...V, log: [...V.log, { n: (V.log.length ? V.log[V.log.length - 1].n : 0) + 1, turn: V.turn, k: 'coin', seat: null, msg: `A test coin: ${heads ? 'HEADS' : 'tails'}.` }] }); },   // (a coin through the same path a match's coins take)
	focus: () => (pad && pad.ringOn ? pad.focus : null),
	recipe: () => (MODE === 'replay' ? R.recipe : G ? SV.recipeOf(G.config, G.actions) : null),
	live: () => ({ ...live, publishing: !!publisher }),
	online: () => ({ id: ON.id, n: ON.n, seat: ON.seat, lobby: ON.lobby, busy: ON.busy }),
	replay: recipe => startReplay(recipe),
	seek: n => seek(n),
	menu: () => mainMenu(),
	collection: () => COL, owned: id => COLL.owned(COL, id), sync: () => (colSync ? colSync.status() : 'guest'), deckSync: () => (deckSync ? deckSync.status() : 'guest'), decks: () => SV.listDecks(),
	solo: () => SV.solo(), startSolo: (id, singles) => { const b = soloById(id); if (b) startSolo(b, starterDeck(STARTERS[0].id), null, !!singles); return !!b; }, soloSync: () => (soloSync ? soloSync.status() : 'guest'),
	saveDeck: d => keepDeck(d),   // (what the deck builder's Save button calls)
	engine: E,
};
// leaving the page mid-match: nothing is lost (the match is saved after every action), so no warning is needed
async function boot() {
	try { bg = new Background(document.getElementById('bg')); } catch (e) { bg = null; }
	try { await loadFont(); } catch (e) { /* the fallback font will do */ }
	build(); resize();
	addEventListener('resize', resize);
	if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
	requestAnimationFrame(frame);
	pad = makePad();
	document.getElementById('boot-loading')?.remove();
	try { net = await import('./net.js'); } catch (e) { console.warn('pocket: net unavailable', e); net = null; }
	startColSync();
	let shown = false;
	if (SPECTATE) { startSpectating(); shown = true; }
	else if (REPLAY_PARAM) { try { shown = startReplay(JSON.parse(await unpackString(REPLAY_PARAM))); } catch (e) { shown = false; } if (!shown) toast('That replay link could not be read.'); }
	if (!shown && TRAINER) { startTrainerMatch(TRAINER); shown = true; }
	if (!shown) mainMenu();
	showFound();   // (cards found in the overworld since this game was last open)
	window.__pocket.ready = true;
}
boot().catch(e => { console.error(e); const l = document.getElementById('boot-loading'); if (l) l.textContent = 'Pocket Enhanced failed to load: ' + e.message; });
