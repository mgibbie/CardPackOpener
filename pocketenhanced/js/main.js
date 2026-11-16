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
import { nextAction } from './ai.js';
import { STARTERS, starterDeck } from './decks.js';
import * as SV from './save.js';
import * as COLL from './collection.js';
import { cardArt } from './artconfig.js';
import { createSync, DECKS as DECK_KIND } from './colsync.js';
import { loadFont } from '../../micatro/js/ui/assets.js';
import { Background, C as BGC, hex } from '../../micatro/js/ui/gl.js';
import { sound } from '../../micatro/js/ui/sound.js';
import { esc } from '../../micatro/js/ui/markup.js';
import { buttonLabel } from '/site/gamepad.js';
import { startInput, keyLabel, isTyping } from '/site/input.js';
import { packString, unpackString } from '/battlecards/codec.js';
import { askText, oskOpen } from '/site/osk.js';

const params = new URLSearchParams(location.search);
const REPLAY_PARAM = params.get('replay');
const SEED_PARAM = (params.get('seed') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);   // ?seed=X: new matches use that seed
const SPECTATE = (params.get('spectate') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
const SLOT = ['A', 'B'];
const RIVALS = ['Blue', 'Green', 'Silver'];
const STATUS_LABEL = { poisoned: 'PSN', asleep: 'SLP', paralyzed: 'PAR', burned: 'BRN', confused: 'CNF' };
const FX_LABEL = { reduceEx: 'takes less damage from Pokémon ex', retreatTrap: 'punishes a retreat', noWeakness: 'has no Weakness', preventSmall: 'small hits do nothing', preventFromBasic: 'Basic Pokémon cannot hurt it', attachSleep: 'Energy from the Energy Zone puts it to sleep', doom: 'damage is coming', preventDamage: 'takes no damage from attacks', vulnerable: 'takes more damage', thorns: 'hurts its attackers', costMore: 'attacks and retreat cost more', cantUse: "can't use one attack", atkPlus: 'one attack is stronger', smokescreen: 'may miss its attack', cantAttack: "can't attack", cantRetreat: "can't retreat", atkMinus: 'attacks weaker', reduce: 'takes less', prevent: 'protected' };

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const play = (name, pitch, vol) => { try { sound.play(name, pitch, vol); } catch (e) { /* sound is optional */ } };
const btn = (label, cls, fn, k) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; if (k) b.dataset.k = k; b.addEventListener('click', e => { play('button'); fn(e); }); return b; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const ty = t => `<span class="ty" style="--c:var(--t-${t})">${t}</span>`;
const EICON = { Grass: 'M12 3C6 5 4 10 5 16l-2 4 2 1 2-4c6 1 11-2 12-9 0-3-3-5-7-5z', Fire: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 4 1-3 0-6 1-9z', Water: 'M12 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z',
	Lightning: 'M13 2 5 13h5l-1 9 9-12h-6z', Psychic: 'M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7zm10-4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', Fighting: 'M4 9h4V5h3v4h2V4h3v5h4v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z',
	Darkness: 'M15 3a9 9 0 1 0 6 13A8 8 0 0 1 15 3z', Metal: 'M12 2l9 5v10l-9 5-9-5V7z', Colorless: 'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z', Dragon: 'M4 4l8 4 8-4-3 8 3 8-8-4-8 4 3-8z' };
const en = (t, cls) => `<span class="en ${cls || ''}" style="--c:var(--t-${t})" title="${t}">${EICON[t] ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${EICON[t]}"/></svg>` : ''}</span>`;
const ELETTER = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', C: 'Colorless', N: 'Dragon' };
/** Card text for the page: escaped, with the card game's {R}-style Energy symbols drawn as pips. */
const tx = s => esc(s || '').replace(/\{([A-Z])\}/g, (m, l) => (ELETTER[l] ? en(ELETTER[l]) : m)).replace(/\{ex\}/g, '<i class="exm">ex</i>');
const sprite = c => (c.sprite ? `/overworld/data/pokemon/${c.sprite}` : c.dex ? `/overworld/data/pokemon/s${c.dex * 32}.png` : null);   // (a form has its own sprite)
const PEOPLE = { Erika: 'erika', Misty: 'misty', Blaine: 'blaine', Koga: 'koga', Giovanni: 'giovanni', Brock: 'brock', Sabrina: 'sabrina', 'Lt. Surge': 'lt_surge', "Professor's Research": 'prof_oak' };
const ITEMS = { 'Rocky Helmet': 'rocky_helmet', 'Lum Berry': 'lum_berry', Potion: 'potion', 'X Speed': 'x_speed', 'Hand Scope': 'scope_lens', 'Poké Ball': 'poke_ball', 'Helix Fossil': 'helix_fossil', 'Dome Fossil': 'dome_fossil', 'Old Amber': 'old_amber' };
// (your own picture for a card, if a folder is set in artconfig.js: it covers the default art, and steps aside if there is none)
const ART = cardArt();
const ownArt = c => (ART ? `<img class="own" src="${esc(ART.base + c.id + '.' + ART.ext)}" alt="" loading="lazy" onerror="this.remove()">` : '');
const artHtml = c => ownArt(c) + baseArt(c);
const baseArt = c => {
	if (c.kind !== 'pokemon' && PEOPLE[c.name]) return `<span class="person" style="background-image:url(/overworld/data/people/${PEOPLE[c.name]}.png)"></span>`;   // (the first frame of the walking sheet: facing us)
	if (c.kind !== 'pokemon' && ITEMS[c.name]) return `<img class="icon" src="/overworld/item_icons/${ITEMS[c.name]}.png" alt="" loading="lazy">`;
	const s = c.kind === 'pokemon' && !c.fossil ? sprite(c) : null; return s ? `<img src="${s}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'?'}))">` : `<span class="ph">${c.fossil ? '🦴' : c.kind === 'item' ? '🎒' : c.kind === 'supporter' ? '🧑' : '?'}</span>`; };

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

const ON = { id: null, lobby: null, mid: 0, n: -1, seat: 0, timer: 0, busy: false, recipe: null, sig: '' };   // online: the lobby and the position's number
const playing = () => MODE === 'normal' || MODE === 'online';
const YOU = () => (MODE === 'normal' && G ? G.you : MODE === 'online' && ON.seat >= 0 ? ON.seat : null);
const pov = () => (MODE === 'replay' ? R.pov : MODE === 'spectate' ? live.you : YOU());
const viewLabel = v => (v.over ? 'Match over' : v.phase === 'setup' ? 'Setting up' : `Turn ${v.turn} · ${v.players.map(p => p.points).join('–')}`);
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
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
/** The coins flipped since the last view (none on the first view of a match, in fast mode, or when motion is to be reduced). */
function newCoins(v) {
	if (!v) { ui.coinN = null; return []; }
	const last = v.log.length ? v.log[v.log.length - 1].n : 0, from = ui.coinN;
	ui.coinN = last;
	if (from == null || last < from || ui.fast || calm()) return [];
	return v.log.filter(e => e.n > from && e.k === 'coin').map(e => ({ heads: /HEADS\.?$/.test(e.msg), msg: e.msg.replace(/:\s*(HEADS|tails)\.?$/, '') }));
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
function afterView() {
	render();
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
		const a = nextAction(E.view(S, s), banned) || { t: 'execute', seat: s, commands: [null, null] };
		try { E.apply(S, a); G.actions.push(a); break; } catch (e) { if (!e || !e.refused) throw e; banned.add(JSON.stringify(a)); S = E.replay(G.config, G.actions); }
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
	stage.className = 'pe ' + (portrait ? 'portrait' : 'landscape');
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
	const faces = [...stage.querySelectorAll('.f.pk:not([data-fit])')]; if (!faces.length) return;
	for (let step = 1; step <= 4; step++) { const over = faces.filter(f => f.scrollHeight > f.clientHeight + 1); if (!over.length) break; for (const f of over) f.dataset.tight = step; }
	for (const f of faces) f.dataset.fit = '1';
}
function build() {
	new MutationObserver(fitFaces).observe(stage, { childList: true, subtree: true });
	stage.innerHTML = '';
	el.table = h('div', 'pe-table'); el.modals = h('div', 'modal-layer'); el.toast = h('div', 'pe-banner'); el.toast.style.display = 'none'; el.fx = h('div', 'pe-fx');
	stage.append(el.table, el.toast, el.fx, el.modals);
}
let toastT = 0;
function toast(msg) { el.toast.textContent = msg; el.toast.style.display = ''; clearTimeout(toastT); toastT = setTimeout(() => { el.toast.style.display = 'none'; }, 3200); }

// ---- card faces, laid out as Pocket's: stage, name and HP across the top, the art, the attacks, a footer. Sized in em: a card is 10em x 14em.
const stageOf = c => (c.fossil ? 'Fossil' : c.stage === 0 ? 'Basic' : 'Stage ' + c.stage);
const nameHtml = c => esc(c.name).replace(/ ex$/, ' <i class="exm">ex</i>');
function face(c, k) {
	if (c.kind !== 'pokemon' && !k) return `<div class="f tr ${c.kind}"><div class="hd"><span class="tag">${c.fossil ? 'Item · Fossil' : c.kind === 'tool' ? 'Pokémon Tool' : cap(c.kind)}</span></div><div class="n">${esc(c.name)}</div><div class="art">${artHtml(c)}</div><div class="tx">${tx(c.adapted || c.text)}</div></div>`;
	const hp = k ? k.hp : c.hp, left = k ? Math.max(0, k.hp - k.dmg) : hp, pct = Math.round(100 * left / hp);
	// (all the rules text is on the card: what the Ability does, each attack's Combat Type and what it does, as it plays here)
	const atks = (c.ability ? `<div class="atk ab"><span class="abt">Ability</span><span class="an">${esc(c.ability.name)}</span></div><div class="fx">${tx(c.ability.adapted || c.ability.text)}</div>` : '') +
		(c.attacks || []).map(a => `<div class="atk"><span class="co">${a.cost.map(x => en(x)).join('')}</span><span class="an">${esc(a.name)}</span><span class="d">${a.damage || ''}${a.damageMode === 'x' ? '×' : a.damageMode || ''}</span></div><div class="fx">${ty(a.combatType)} ${tx(a.adapted || a.text)}</div>`).join('') +
		(c.fossil ? `<div class="fx">${tx(c.adapted || c.text)}</div>` : '');
	return `<div class="f pk"><div class="hd"><span class="n">${nameHtml(c)}</span><span class="h"><small>HP</small><span class="hpn">${left}</span></span>${c.cardType ? en(c.cardType) : ''}</div>` +
		(k ? `<div class="hp ${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}"><i style="width:${pct}%"></i></div>` : '') +
		`<div class="art bg-${c.cardType || 'Colorless'}"><span class="tag">${stageOf(c)}</span>${artHtml(c)}</div><div class="atks">${atks}</div>` +
		`<div class="ft"><span class="rt">${c.retreat ? 'retreat ' + '<i class="rp"></i>'.repeat(c.retreat) : ''}</span><span class="ct">${(c.combatTypes || []).map(ty).join('')}</span></div></div>`;
}
/** Card sizes on the table (the font size; a card is 10em wide): [Active, Bench, Bench on its own row]. */
// The Active Pokémon are as large as the mat allows. Where a side has the height for it, its Bench stands beside them as a
// 2x2 block ('grid') instead of taking a row of its own ('stack'), which is what lets the Active cards grow.
function sizes(isMe, n) {
	if (isMe) return portrait ? [24, 13.9, 'grid'] : [18, 12.9, 'row'];
	if (portrait) return n <= 1 ? [24, 13.9, 'grid'] : n === 2 ? [19, 9.1, 'stack'] : [12.4, 5.8, 'stack'];
	return n <= 1 ? [17, 13.8, 'row'] : n === 2 ? [15, 8.3, 'grid'] : [9.4, 7.2, 'stack'];
}
const staging = () => playing() && !!V && V.phase === 'setup' && YOU() != null && !V.players[YOU()].setup;
/** During setup, my side of the mat as I have laid it out so far: the Basic Pokémon I chose stand in their slots. */
function stagedView(v, you) {
	const me = v.players[you], mk = (i, n) => { const id = me.hand[i], c = card(id); return { uid: -1 - n, id, cards: [id], dmg: 0, hp: c.hp || 0, energy: [], provides: [], status: [], fx: [], tool: null, retreat: c.retreat || 0, less: 0, extra: [], staged: i }; };
	const p = { ...me, active: [0, 1].map(n => (ui.setup.active[n] != null ? mk(ui.setup.active[n], n) : null)), bench: [0, 1, 2, 3].map(n => (ui.setup.bench[n] != null ? mk(ui.setup.bench[n], 2 + n) : null)) };
	return { ...v, players: v.players.map(q => (q.seat === you ? p : q)) };
}
function unstage(i) { for (const z of ['active', 'bench']) { const n = ui.setup[z].indexOf(i); if (n >= 0) ui.setup[z].splice(n, 1); } }
/** Put hand card `i` into that slot (pushing the ones after it along; one pushed out of the Active slots goes to the Bench). */
function placeStaged(i, zone, idx) {
	unstage(i);
	const s = ui.setup, L = s[zone], max = zone === 'active' ? 2 : 4;
	if (idx < L.length) L.splice(idx, 0, i); else L.push(i);
	while (L.length > max) { const out = L.pop(); if (zone === 'active' && s.bench.length < 4) s.bench.push(out); }
}
// dragging a Basic Pokémon from the hand to a slot (or one on the mat to another slot, or back to the hand)
let drag = null, dragEnd = 0;
function dragSetup(elm, i, pan) {
	elm.style.touchAction = pan ? 'pan-x' : 'none';
	elm.addEventListener('pointerdown', ev => { if (ev.button) return; drag = { i, x: ev.clientX, y: ev.clientY, on: false, html: elm.outerHTML, w: elm.offsetWidth, hgt: elm.offsetHeight, ghost: null }; });
}
function dragMove(ev) {
	if (!drag) return;
	if (!drag.on) { if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 10) return; drag.on = true; drag.ghost = h('div', 'pe-ghost'); drag.ghost.innerHTML = drag.html; stage.classList.add('dragging'); }
	if (!drag.ghost.isConnected) el.fx.appendChild(drag.ghost);
	const r = stage.getBoundingClientRect(), sc = r.width / stage.offsetWidth || 1;
	drag.ghost.style.left = ((ev.clientX - r.left) / sc - drag.w / 2) + 'px'; drag.ghost.style.top = ((ev.clientY - r.top) / sc - drag.hgt / 2) + 'px';
	ev.preventDefault();
}
function dragDrop(ev, cancel) {
	const d = drag; drag = null; if (!d) return;
	stage.classList.remove('dragging'); if (d.ghost) d.ghost.remove();
	if (!d.on) return;
	dragEnd = performance.now();
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
	const k = at(v, loc), b = h('button', 'pe-poke' + (fs < 14 ? ' tiny' : '')); b.type = 'button'; b.dataset.k = keyOf(loc); b.style.fontSize = fs + 'px';
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
		b.innerHTML = slot + `<span class="st">${st}${badge}</span>` + face(c, k) + `<div class="ens">${k.energy.map(e => en(e)).join('')}</div>` + (k.tool ? `<span class="tl" title="${esc(card(k.tool).name)}">${esc(card(k.tool).name)}</span>` : '');
		b.setAttribute('aria-label', `${pokeLabel(v, loc)}, ${left} of ${k.hp} HP`);
		if (legal) b.classList.add('legal');
		const q = loc.zone === 'active' && loc.seat === YOU() ? ui.cmds[loc.idx] : null;
		if (q) { b.classList.add('queued'); b.dataset.q = def(k).attacks[q.cmd.attack].name; }
		const was = ui.prevDmg.get(k.uid);
		if (was != null && k.dmg > was && !opts.quiet) { b.classList.add('hit'); b.appendChild(h('div', 'dn', '-' + (k.dmg - was))); }
	}
	if (k && k.staged != null) { b.classList.add('staged'); dragSetup(b, k.staged, false); }
	if ((v.spots || []).some(sp => sp.seat === loc.seat && sp.zone === loc.zone && sp.idx === loc.idx)) { b.classList.add('spot'); b.title = 'Damage is coming to this spot at the end of its owner\'s next turn'; }
	b.addEventListener('click', () => onPoke(loc));
	return b;
}
function headEl(v, p, fan) {
	const pts = Array.from({ length: v.points }, (_, i) => `<i class="pt ${i < p.points ? 'on' : ''}"></i>`).join('');
	return h('div', 'pe-head', `<span class="nm">${esc(p.name)}${p.ai ? ' <span class="muted who">(computer)</span>' : p.seat === YOU() ? ' <span class="muted who">(you)</span>' : ''}${p.eliminated ? ' — out' : ''}</span><span class="pts" title="${p.points} of ${v.points} points">${pts}</span>` +
		`<span class="cnt">${fan ? `<span class="backs" aria-hidden="true">${'<i class="cb"></i>'.repeat(Math.min(p.handCount, 10))}</span>` : ''}<span title="cards in hand">✋ ${p.handCount}</span><span title="cards in deck"><i class="cb"></i> ${p.deck}</span><span title="discard pile">♻ ${p.discard.length}</span>${p.guard ? `<span class="pe-guard" title="takes less damage from opposing attacks until their next turn">🛡−${p.guard}</span>` : ''}${p.zone.cur ? en(p.zone.cur) : ''}</span>`);
}
/** A player's head line, with their discard pile behind a button (a discard pile is public). */
function headWithDiscard(v, p, fan) {
	const head = headEl(v, p, fan), b = h('button', 'pe-disc', 'Discard'); b.type = 'button'; b.dataset.k = 'disc:' + p.seat; b.disabled = !p.discard.length;
	b.setAttribute('aria-label', `${p.name}'s discard pile, ${p.discard.length} cards`);
	b.addEventListener('click', () => {
		const grid = h('div', 'pe-grid');
		p.discard.forEach((id, i) => { const c = card(id), e = handCard(c, null); e.classList.add('small'); e.dataset.k = 'dc' + i; e.addEventListener('click', () => inspect(c)); grid.appendChild(e); });
		modal(grid, { title: `${p.name}'s discard pile (${p.discard.length})` });
	});
	head.querySelector('.cnt').appendChild(b);
	return head;
}
/** A player's Pokémon: the two Active and the four Benched (an opponent's Bench sits behind their Active, away from the middle of the mat). */
function rowsEl(v, seat, [fa, fb, mode], flip) {
	const w = h('div', 'pe-rows ' + mode + (flip ? ' flip' : '')), a = h('div', 'pe-row act'), b = h('div', 'pe-row ben');
	for (const i of [0, 1]) a.appendChild(pokeEl(v, { seat, zone: 'active', idx: i }, fa));
	for (let i = 0; i < 4; i++) b.appendChild(pokeEl(v, { seat, zone: 'bench', idx: i }, fb));
	w.append(a, b);
	return w;
}
// With several opponents their cards share the top of the mat. One opponent can be enlarged (the button on their name
// bar): that side takes most of the width and the others stand aside, until it is pressed again.
const canEnlarge = n => n >= 3 || (!portrait && n === 2);
const BIG = { p3: [450, [19, 10.4, 'stack'], [7.3, 3.3, 'stack']], l3: [600, [17, 8.2, 'grid'], [9.4, 4.3, 'stack']], l2: [700, [17, 8.2, 'grid'], [9.4, 7.2, 'stack']] };
function sideEl(v, p, n) {
	const d = h('div', 'pe-side' + (v.current === p.seat && v.phase === 'main' ? ' turn' : '') + (p.eliminated ? ' out' : ''));
	const head = headWithDiscard(v, p, n === 1);
	d.appendChild(head);
	const big = canEnlarge(n) && ui.big != null && v.players[ui.big] && ui.big !== pov() ? BIG[(portrait ? 'p' : 'l') + n] : null;
	let sz = sizes(false, n);
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
function handCard(c, i, extra = '') {
	const b = h('button', 'pe-card pf' + (c.ex ? ' ex' : '')); b.type = 'button'; if (i != null) b.dataset.k = 'h:' + i;
	b.style.setProperty('--c', `var(--t-${c.kind === 'pokemon' ? c.cardType : 'Colorless'})`);
	b.innerHTML = face(c) + extra;
	b.setAttribute('aria-label', c.name);
	return b;
}
/** A full hand overlaps like a held fan, as long as more than half of every card still shows; past that the row scrolls. */
function fanHand(hand) {
	const cs = [...hand.querySelectorAll('.pe-card')], n = cs.length; if (n < 2) return;
	const W = cs[0].offsetWidth, GAP = 8, step = (hand.clientWidth - 24 - W) / (n - 1);
	if (step >= W + GAP || step < W * 0.56) return;
	cs.forEach((e, j) => { if (j) e.style.marginLeft = Math.round(step - W - GAP) + 'px'; });
}

/** On a phone the hand has the room the battle log had: the log opens from this button instead. */
function logBtn() {
	return btn('Log', 'grey pe-logbtn', () => {
		const l = h('div', 'pe-log pe-logfull'); l.setAttribute('aria-label', 'Battle log');
		for (const e of V.log) l.appendChild(h('div', e.k, esc(e.msg + (e.more ? ' ' + e.more : ''))));
		modal(l, { title: 'Battle log' }); l.scrollTop = l.scrollHeight;
	}, 'log');
}
function render() {
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
			setTimeout(() => modal(grid, { title: V.pending ? V.pending.msg : 'Choose a card', noClose: true }), 0);
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
	const mePanel = h('div', 'pe-me' + (V.current === me.seat && V.phase === 'main' ? ' turn' : ''));
	mePanel.appendChild(rowsEl(mine && staging() ? stagedView(V, you) : V, me.seat, sizes(true), false));
	mePanel.appendChild(headWithDiscard(V, me));
	const zone = h('div', 'pe-zone', 'Energy Zone');
	const zb = h('button', 'slot' + (mine && myTurn() && me.zone.cur && !me.flags.attached ? ' ready' : '')); zb.type = 'button'; zb.dataset.k = 'zone';
	zb.innerHTML = me.zone.cur ? en(me.zone.cur, 'big') + `<div>${me.zone.cur}</div>` : `<div class="muted">${me.flags.attached ? 'attached' : 'none'}</div>`;
	zb.disabled = !(mine && myTurn() && me.zone.cur && !me.flags.attached);
	zb.setAttribute('aria-label', me.zone.cur ? `Attach your ${me.zone.cur} Energy` : 'No Energy ready');
	zb.addEventListener('click', () => pickAttach());
	zone.appendChild(zb);
	zone.appendChild(h('div', 'muted', me.zone.next ? `next: ${en(me.zone.next)}` : ''));
	mePanel.appendChild(zone);
	// the hand
	const hand = h('div', 'pe-hand'); el.hand = hand;
	if (me.hand) me.hand.forEach((id, i) => {
		const c = card(id), stg = mine && staging();
		if (stg && (ui.setup.active.includes(i) || ui.setup.bench.includes(i))) return;   // (it stands on the mat now)
		const b = handCard(c, i);
		if (mine && (myTurn() || (V.phase === 'setup' && !me.setup)) && playable(c, me)) { b.classList.add('playable'); if (stg) dragSetup(b, i, true); }
		b.addEventListener('click', () => onHand(i));
		hand.appendChild(b);
	});
	else hand.appendChild(h('div', 'pe-note', `${esc(me.name)} holds ${me.handCount} card${me.handCount === 1 ? '' : 's'}.`));
	// commands
	const cmd = h('div', 'pe-cmd');
	if (mine && V.phase === 'main' && !V.over) {
		cmd.appendChild(h('h3', '', V.current === you ? 'Your commands' : `${esc(V.players[V.current].name)}'s turn`));
		for (const i of [0, 1]) {
			const k = me.active[i], q = ui.cmds[i];
			cmd.appendChild(h('div', 'q' + (q ? '' : ' pass'), `Active ${SLOT[i]}: ${k ? `<b>${esc(def(k).name)}</b> → ${q ? esc(q.text) : 'Pass'}` : '<span class="muted">empty</span>'}`));
		}
		const bar = h('div', 'bar');
		const ex = btn('Execute', 'red exec', () => execute(), 'exec'); ex.disabled = !myTurn(); ex.setAttribute('aria-label', 'Execute');
		bar.append(ex, logBtn(), btn('Menu', 'grey', () => optionsMenu(), 'menu'));
		if (myTurn() && me.flags.penny) bar.prepend(btn(`${me.flags.pennyBy || 'Penny'}: use ${card(me.flags.penny).name}`, 'blue', () => playTrainer(-1, card(me.flags.penny), true), 'penny'));
		cmd.appendChild(bar);
		cmd.appendChild(h('div', 'hint', (myTurn() ? 'Press an Active Pokémon to choose its attack and target. Execute resolves A, then B, and ends your turn.' : V.pending ? esc(`Waiting for ${V.players[V.pending.seat].name} to choose…`) : 'Waiting…') + (live.watchers ? ` <span class="pe-watch" title="${esc(live.names.join(', '))}">👁 ${live.watchers} watching</span>` : '')));
	} else {
		cmd.appendChild(h('h3', '', MODE === 'spectate' ? `Watching ${esc(SPECTATE)}` : MODE === 'replay' ? 'Replay' : V.over ? 'Match over' : 'Setting up'));
		cmd.appendChild(h('div', 'q', V.over ? esc(V.over.winner != null ? `${V.players[V.over.winner].name} wins — ${V.over.why}` : `No winner — ${V.over.why}`) : esc(viewLabel(V) + (V.phase === 'main' ? ` — ${V.players[V.current].name}'s turn` : ''))));
		if (MODE === 'spectate') cmd.appendChild(h('div', 'hint pe-spec', esc(SPEC_STATUS[live.status] || '') + ' You see what a spectator may: the table and the log, nobody\'s hand.'));
		const bar = h('div', 'bar');
		if (mine && V.phase === 'setup' && !me.setup) { const r = btn('Ready', 'green exec', () => finishSetup(), 'ready'); r.disabled = !ui.setup.active.length; bar.appendChild(r); }
		if (MODE === 'replay') cmd.appendChild(replayBar());
		else { bar.append(logBtn(), btn('Menu', 'grey', () => optionsMenu(), 'menu')); cmd.appendChild(bar); }
		if (mine && V.phase === 'setup' && !me.setup) cmd.appendChild(h('div', 'hint', 'Press a Basic Pokémon in your hand, or drag it to a slot: the first two go to Active A and B, the rest to your Bench. Press one on the mat to take it back. Then Ready.'));
	}
	// the log
	const log = h('div', 'pe-log'); el.log = log; log.setAttribute('aria-label', 'Battle log');
	for (const e of V.log) log.appendChild(h('div', e.k, esc(e.msg + (e.more ? ' ' + e.more : ''))));
	el.table.append(h('div', 'pe-mat n' + others.length), opps, mePanel, hand, cmd, log);
	if (V.stadium) {   // the Stadium in play: one for the whole table, shown on the mat; press it to read it
		const sc = card(V.stadium.id), sb = h('button', 'pe-stadium', `<span class="tag">Stadium</span><b>${esc(sc.name)}</b><span class="by">${esc(V.players[V.stadium.seat].name)}</span>`); sb.type = 'button'; sb.dataset.k = 'stadium';
		sb.setAttribute('aria-label', `Stadium in play: ${sc.name}, played by ${V.players[V.stadium.seat].name}`); sb.addEventListener('click', () => inspect(sc, null, null, mine && myTurn() && sc.fx.k === 'stadiumCoinPokemon' && !me.flags.stadiumUsed ? [['Use', () => { closeAll(); send({ t: 'stadium' }); }, null, 'stadiumuse']] : [])); if (mine && myTurn() && sc.fx.k === 'stadiumCoinPokemon' && !me.flags.stadiumUsed) sb.classList.add('ready'); el.table.appendChild(sb);
	}
	fanHand(hand);
	if (ui.pick) {
		const pr = h('div', 'pe-prompt', `<span>${esc(ui.pick.prompt)}</span>`);
		if (!ui.pick.auto) pr.appendChild(btn('Cancel', 'grey', () => cancelPick(), 'cancelpick'));
		el.table.appendChild(pr);
	}
	if (keepLog) log.scrollTop = log.scrollHeight;
	hand.scrollLeft = handX;
	for (const p of V.players) for (const k of [...p.active, ...p.bench]) if (k) ui.prevDmg.set(k.uid, k.dmg);
	bg && bg.set(V.over ? { new_colour: BGC.GOLD, special_colour: BGC.GREEN, contrast: 2 } : V.current === you && V.phase === 'main' ? { new_colour: hex('2f6b5a'), special_colour: BGC.BLUE, contrast: 1.6 } : { new_colour: BGC.BLUE, special_colour: BGC.RED, tertiary_colour: [0.13, 0.16, 0.16, 1], contrast: 1.4 });
	if (pad) pad.refresh();
}

// ------------------------------------------------------------------ choosing things on the table
function pick(prompt, locs, cb, extra = {}) {
	if (!locs.length) { toast('There is nothing to choose for that.'); return; }
	closeAll();
	ui.pick = { prompt, keys: new Set(locs.map(keyOf)), cb: loc => { ui.pick = null; cb(loc); }, ...extra };
	render();
}
function cancelPick() { if (ui.pick && !ui.pick.auto) { ui.pick = null; render(); } }
function onPoke(loc) {
	if (staging() && loc.seat === YOU()) {   // setup: a Pokémon I placed goes back to my hand
		if (performance.now() - dragEnd < 350) return;
		const i = ui.setup[loc.zone][loc.idx]; if (i != null) { unstage(i); play('cardSlide1'); render(); }
		return;
	}
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
function onHand(i) {
	const you = YOU(), me = you != null ? V.players[you] : null;
	if (!me || !me.hand) return;
	const c = card(me.hand[i]);
	if (playing() && V.phase === 'setup' && !me.setup && isBasic(c)) {
		if (performance.now() - dragEnd < 350) return;   // (the press that ended a drag)
		const s = ui.setup, a = s.active.indexOf(i), b = s.bench.indexOf(i);
		if (a >= 0) s.active.splice(a, 1); else if (b >= 0) s.bench.splice(b, 1); else if (s.active.length < 2) s.active.push(i); else if (s.bench.length < 4) s.bench.push(i); else { toast('Your Active slots and Bench are full.'); return; }
		play('cardSlide1'); render(); return;
	}
	const acts = [];
	if (myTurn()) {
		if (isBasic(c)) acts.push(['Play', () => pick(`Play ${c.name}: choose an empty slot`, [...[0, 1].filter(n => !me.active[n]).map(idx => ({ seat: you, zone: 'active', idx })), ...me.bench.map((k, idx) => (k ? null : { seat: you, zone: 'bench', idx })).filter(Boolean)], to => send({ t: 'playBasic', hand: i, to: { zone: to.zone, idx: to.idx } }))]);
		else if (c.kind === 'pokemon') acts.push(['Evolve', () => pick(`Evolve into ${c.name}: choose your ${c.evolvesFrom}`, locsOf(V, you).filter(l => evolvesInto(at(V, l), c)), l => send({ t: 'evolve', hand: i, at: l }))]);
		else acts.push(['Play', () => playTrainer(i, c)]);
	}
	inspect(c, null, null, acts);
}
function playTrainer(i, c, pen) {   // (pen: the effect Penny found, used as her effect; it is not a card in the hand)
	const you = YOU(), f = c.fx, go = args => send(pen ? { t: 'trainer', penny: true, args } : { t: 'trainer', hand: i, args });
	const own = locsOf(V, you), named = l => !f.names || f.names.includes(def(at(V, l)).name);
	if (f.k === 'healOne') pick(`${c.name}: choose one of your ${f.cure ? 'damaged or afflicted' : 'damaged'} ${f.stage ? 'Stage ' + f.stage + ' ' : ''}Pokémon`, own.filter(l => (at(V, l).dmg > 0 || (f.cure && at(V, l).status.length)) && (!f.type || def(at(V, l)).cardType === f.type) && (!f.names || f.names.includes(def(at(V, l)).name)) && (f.stage == null || def(at(V, l)).stage === f.stage)), l => go({ at: l }));
	else if (f.k === 'healCureActive') pick(`${c.name}: choose one of your Pokémon in an Active slot`, own.filter(l => l.zone === 'active' && (at(V, l).dmg > 0 || at(V, l).status.length)), l => go({ at: l }));
	else if (f.k === 'healAllNamed') pick(`${c.name}: choose your damaged ${f.names.join(' or ')}`, own.filter(l => named(l) && at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'returnDamaged') pick(`${c.name}: choose one of your damaged ${f.type} Pokémon`, own.filter(l => def(at(V, l)).cardType === f.type && at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'moveDamage') pick(`${c.name}: choose your damaged ${f.names.join(' or ')}`, own.filter(l => named(l) && at(V, l).dmg > 0), l => pick(`${c.name}: choose the opposing Active Pokémon that takes the damage`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])), t => go({ at: l, target: t })));
	else if (f.k === 'rareCandy') pick(`${c.name}: choose one of your Basic Pokémon`, own.filter(l => at(V, l).cards.length === 1 && def(at(V, l)).stage === 0 && at(V, l).turnPlayed !== V.turn), l => {
		const me = V.players[you], base = def(at(V, l)).name, grid = h('div', 'pe-grid');
		me.hand.forEach((id, n) => { const d = card(id); if (n === i || d.kind !== 'pokemon' || d.stage !== 2 || !CARDS.some(m => m.name === d.evolvesFrom && m.evolvesFrom === base)) return; const e = handCard(d, null); e.classList.add('small'); e.dataset.k = 'rc' + n; e.addEventListener('click', () => { closeAll(); go({ at: l, pick: n }); }); grid.appendChild(e); });
		if (!grid.children.length) { toast(`You have no Stage 2 card in your hand that evolves from ${base}.`); return; }
		modal(grid, { title: `${c.name}: evolve ${base} into…` });
	});
	else if (f.k === 'flipDiscardEnergy') pick(`${c.name}: choose an opposing Active Pokémon`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])), l => go({ target: l }));
	else if (f.k === 'flipAttach') pick(`${c.name}: choose one of your ${f.type} Pokémon`, own.filter(l => def(at(V, l)).cardType === f.type), l => go({ at: l }));
	else if (f.k === 'returnActive' || f.k === 'gatherEnergy') pick(`${c.name}: choose your ${f.names.join(' or ')} in an Active slot`, own.filter(l => l.zone === 'active' && named(l)), l => go({ at: l }));
	else if (f.k === 'attachNamed') pick(`${c.name}: choose your ${f.names.join(' or ')}`, own.filter(named), l => go({ at: l }));
	else if (f.k === 'driveOff') pick(`${c.name}: choose an opposing Active Pokémon (its owner picks the replacement)`, oppSeats(V).filter(s => V.players[s].bench.some(Boolean)).flatMap(s => locsOf(V, s, ['active'])).filter(l => !f.basic || def(at(V, l)).stage === 0), l => go({ target: l }));
	else if (c.kind === 'tool') pick(`${c.name}: choose one of your Pokémon with no Pokémon Tool`, own.filter(l => !at(V, l).tool), l => go({ at: l }));
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
	else if (f.k === 'healForEnergy') pick(`${c.name}: choose your damaged ${f.type} Pokémon with ${f.need} or more ${f.type} Energy`, own.filter(l => def(at(V, l)).cardType === f.type && at(V, l).dmg > 0 && at(V, l).energy.filter(x => x === f.type).length >= f.need), l => go({ at: l }));
	else if (f.k === 'juggler') pick(`${c.name}: choose your Pokémon in an Active slot that takes your Bench's Energy`, own.filter(l => l.zone === 'active'), l => go({ at: l }));
	else if (f.k === 'discardOppRandomEnergy') pick(`${c.name}: choose an opposing Active Pokémon that has Energy`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])).filter(l => at(V, l).energy.length), l => go({ target: l }));
	else if (f.k === 'evolveFromDeckType') pick(`${c.name}: choose one of your ${f.type} Pokémon (not one played this turn)`, own.filter(l => def(at(V, l)).cardType === f.type && at(V, l).turnPlayed !== V.turn), l => go({ at: l }));
	else if (f.k === 'coinAttachBenchType') pick(`${c.name}: choose your Benched ${f.type} Pokémon that takes the Energy on heads`, own.filter(l => l.zone === 'bench' && def(at(V, l)).cardType === f.type), l => go({ bench: l.idx }));
	else if (f.k === 'coinsDiscardEnergy') pick(`${c.name}: choose an opposing Active Pokémon that has Energy`, oppSeats(V).flatMap(s => locsOf(V, s, ['active'])).filter(l => at(V, l).energy.length), l => go({ target: l }));
	else if (f.k === 'attachDiscardActive') pick(`${c.name}: choose one of your ${f.type} Pokémon in an Active slot`, own.filter(l => l.zone === 'active' && def(at(V, l)).cardType === f.type), l => go({ at: l }));
	else if (f.k === 'silver' || f.k === 'copycat' || f.k === 'discardAbilityEnergy' || (f.k === 'peekOrder' && f.opp)) chooseOpponent(`${c.name}: choose an opponent`, s => go({ opp: s }));
	else if (f.k === 'healNamedCure') pick(`${c.name}: choose your ${f.names.join(' or ')}`, own.filter(named), l => go({ at: l }));
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
function pickAttach() {
	const you = YOU();
	const e = V.players[you].zone.cur;
	pick(`Attach your ${e} Energy: choose one of your Pokémon`, locsOf(V, you).filter(l => !def(at(V, l)).fossil), l => {
		const ab = def(at(V, l)).ability, foes = oppSeats(V).flatMap(s => locsOf(V, s, ['active']));
		if (ab && ab.fx.k === 'attachPing' && ab.fx.type === e && foes.length > 1) pick(`${ab.name}: choose the opposing Active Pokémon that takes ${ab.fx.n} damage`, foes, t => send({ t: 'attach', at: l, target: t }));
		else send({ t: 'attach', at: l });
	});
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
	if (has('switchSelf') && a.fx.find(f => f.k === 'switchSelf').may) { if (bench.length) steps.push(next => {   // "you may switch": stay, or choose who comes up
		closeAll(); const list = h('div', 'pe-list');
		const stay = h('button', 'pe-opt', 'Stay in the Active slot'); stay.type = 'button'; stay.dataset.k = 'stay'; stay.addEventListener('click', () => { closeAll(); next(); });
		const go2 = h('button', 'pe-opt', 'Switch with a Benched Pokémon'); go2.type = 'button'; go2.dataset.k = 'swap'; go2.addEventListener('click', () => pick(`${a.name}: choose the Benched Pokémon to switch in`, bench, loc => { cmd.args.bench = loc.idx; next(); }));
		list.append(stay, go2); modal(list, { title: `${a.name}: switch out afterwards?` });
	}); }
	else if (has('switchSelf')) { const st = a.fx.find(f => f.k === 'switchSelf').type, fit = bench.filter(l => !st || def(at(V, l)).cardType === st); if (fit.length) steps.push(next => pick(`${a.name}: choose the Benched ${st ? st + ' ' : ''}Pokémon to switch in`, fit, loc => { cmd.args.bench = loc.idx; next(); })); else if (!st) { toast(`${a.name} needs a Benched Pokémon to switch with.`); return; } }
	if (has('ownAnyDamage')) steps.push(next => pick(`${a.name}: choose one of your Pokémon to take its damage`, locsOf(V, you), loc => { cmd.args.own = loc; next(); }));
	if (has('ownBenchDamage') && bench.length) steps.push(next => pick(`${a.name}: choose one of your Benched Pokémon to take its damage`, bench, loc => { cmd.args.bench = loc.idx; next(); }));
	const fxOf = x => a.fx.find(f => f.k === x), oppBench = oppSeats(V).flatMap(s => locsOf(V, s, ['bench']));
	if (has('alsoBench') && oppBench.length) steps.push(next => pick(`${a.name}: choose the Benched Pokémon that takes ${fxOf('alsoBench').n} damage`, oppBench, loc => { cmd.args.also = loc; next(); }));
	if (has('attachZoneEach') && bench.length > fxOf('attachZoneEach').n) { cmd.args.spread = []; for (let n = 0; n < fxOf('attachZoneEach').n; n++) steps.push(next => pick(`${a.name}: choose a Benched Pokémon to attach to (${n + 1} of ${fxOf('attachZoneEach').n})`, bench.filter(l => !cmd.args.spread.includes(l.idx)), loc => { cmd.args.spread.push(loc.idx); next(); })); }
	if (has('attachZoneNamed')) { const fit = locsOf(V, you).filter(l => fxOf('attachZoneNamed').names.includes(def(at(V, l)).name)); if (fit.length > 1) steps.push(next => pick(`${a.name}: choose your ${fxOf('attachZoneNamed').names.join(' or ')}`, fit, loc => { cmd.args.at = loc; next(); })); }
	{ const az = a.fx.find(f => f.k === 'attachZone' && f.to === 'bench'), fit = az ? bench.filter(l => !az.basic || def(at(V, l)).stage === 0) : []; if (fit.length > 1) steps.push(next => pick(`${a.name}: choose the Benched ${az.basic ? 'Basic ' : ''}Pokémon to attach to`, fit, loc => { cmd.args.bench = loc.idx; next(); })); }
	if (has('attachZoneTypes')) { const fit = bench.filter(l => def(at(V, l)).stage === 0); if (fit.length > 1) { cmd.args.spread = []; fxOf('attachZoneTypes').types.forEach(t => steps.push(next => pick(`${a.name}: choose the Benched Basic Pokémon that takes the ${t} Energy`, fit, loc => { cmd.args.spread.push(loc.idx); next(); }))); } }
	if (has('attachZoneSpread')) { const f = fxOf('attachZoneSpread'), fit = locsOf(V, you).filter(l => def(at(V, l)).cardType === f.type); if (fit.length > 1) { cmd.args.spreadLocs = []; for (let n = 0; n < f.n; n++) steps.push(next => pick(`${a.name}: choose your ${f.type} Pokémon for a ${f.type} Energy (${n + 1} of ${f.n})`, fit, loc => { cmd.args.spreadLocs.push(loc); next(); })); } }
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
	if (has('moveAllEnergyToBench') && bench.length > 1) steps.push(next => pick(`${a.name}: choose the Benched Pokémon that takes this Pokémon's Energy`, bench, loc => { cmd.args.bench = loc.idx; next(); }));
	if (has('discardBenchBonus')) { const f = fxOf('discardBenchBonus'), fit = bench.filter(l => def(at(V, l)).cardType === f.type); if (fit.length) steps.push(next => {   // any number of them: tick, then Done
		closeAll(); const chosen = new Set(), list = h('div', 'pe-list');
		for (const l of fit) { const o = h('button', 'pe-opt', `${esc(def(at(V, l)).name)} <span class="why">Bench ${l.idx + 1}</span>`); o.type = 'button'; o.dataset.k = 'db' + l.idx; o.addEventListener('click', () => { if (chosen.has(l.idx)) chosen.delete(l.idx); else chosen.add(l.idx); o.classList.toggle('on', chosen.has(l.idx)); }); list.appendChild(o); }
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
	const next = () => { if (n < steps.length) steps[n++](next); else { ui.cmds[slot] = { uid: k.uid, cmd, text: describeCmd(k, cmd) }; play('cardSlide2'); closeAll(); render(); } };
	closeAll(); next();
}
function useAbility(loc) {
	const you = YOU(), k = at(V, loc), ab = def(k).ability, f = ab.fx, go = args => send({ t: 'ability', at: loc, args });
	const oa = oppSeats(V).flatMap(s => locsOf(V, s, ['active']));
	if (f.k === 'ping') pick(`${ab.name}: choose ${f.zone === 'active' ? 'an opposing Active' : 'any opposing'} Pokémon`, f.zone === 'active' ? oa : oppSeats(V).flatMap(s => locsOf(V, s)), l => go({ target: l }));
	else if (f.k === 'attachZoneAnyType') pick(`${ab.name}: choose one of your ${f.type} Pokémon`, locsOf(V, you).filter(l => def(at(V, l)).cardType === f.type), l => go({ at: l }));
	else if (f.k === 'peekAny') {
		const list = h('div', 'pe-list');
		for (const q of V.players) { if (q.eliminated) continue; const o = h('button', 'pe-opt', `${esc(q.name)}${q.seat === you ? ' (you)' : ''} <span class="why">${q.deck} cards in deck</span>`); o.type = 'button'; o.dataset.k = 'pk' + q.seat; o.addEventListener('click', () => { closeAll(); go({ seat: q.seat }); }); list.appendChild(o); }
		modal(list, { title: `${ab.name}: whose deck?` });
	}
	else if (f.k === 'coinSleep' || f.k === 'poisonActive' || f.k === 'coinPoison') pick(`${ab.name}: choose an opposing Active Pokémon`, oa, l => go({ target: l }));
	else if (f.k === 'healActive') pick(`${ab.name}: choose one of your damaged Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'driveOff') pick(`${ab.name}: choose an opposing Active ${f.basic ? 'Basic ' : ''}Pokémon`, oa.filter(l => V.players[l.seat].bench.some(Boolean) && (!f.basic || def(at(V, l)).stage === 0)), l => go({ target: l }));
	else if (f.k === 'pullBenchBasic') pick(`${ab.name}: choose the opposing Active Pokémon that leaves`, oa, l => pick(`${ab.name}: choose that player's Benched Basic Pokémon to bring up`, locsOf(V, l.seat, ['bench']).filter(b => def(at(V, b)).stage === 0), b => go({ target: l, bench: b.idx })));
	else if (f.k === 'attachZoneActiveType') pick(`${ab.name}: choose one of your ${f.type} Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => def(at(V, l)).cardType === f.type), l => go({ at: l }));
	else if (f.k === 'gatherFrom') pick(`${ab.name}: choose the Benched ${f.type} Pokémon whose ${f.type} Energy moves`, locsOf(V, you, ['bench']).filter(l => def(at(V, l)).cardType === f.type && at(V, l).energy.includes(f.type)),
		b => pick(`${ab.name}: choose your Pokémon in an Active slot to give it to`, locsOf(V, you, ['active']), l => go({ bench: b.idx, at: l })));
	else if (f.k === 'coinPull') pick(`${ab.name}: choose an opponent's Benched Pokémon to bring up on heads`, oppSeats(V).flatMap(s => locsOf(V, s, ['bench'])), b => pick(`${ab.name}: choose which of that player's Active Pokémon it replaces`, locsOf(V, b.seat, ['active']), l => go({ target: l, bench: b.idx })));
	else if (f.k === 'millOpp' || f.k === 'portrait') chooseOpponent(`${ab.name}: choose an opponent`, s => go({ opp: s }));
	else if (f.k === 'switchActiveType') pick(`${ab.name}: choose your ${f.type} Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => def(at(V, l)).cardType === f.type), l => pick(`${ab.name}: choose the Benched Pokémon that comes up`, locsOf(V, you, ['bench']), b => go({ slot: l.idx, bench: b.idx })));
	else if (f.k === 'toolsThenDiscardSelf') pick(`${ab.name}: choose an opposing Active Pokémon with a Pokémon Tool (${def(k).name} is then discarded)`, oa.filter(l => at(V, l).tool), l => go({ target: l }));
	else if (f.k === 'healExForEnergy') pick(`${ab.name}: choose your damaged Pokémon ex that has Energy`, locsOf(V, you).filter(l => def(at(V, l)).ex && at(V, l).dmg > 0 && at(V, l).energy.length), l => go({ at: l }));
	else if (f.k === 'statusActive') pick(`${ab.name}: choose an opposing Active Pokémon`, oa, l => go({ target: l }));
	else if (f.k === 'healAny') pick(`${ab.name}: choose one of your damaged Pokémon`, locsOf(V, you).filter(l => at(V, l).dmg > 0), l => go({ at: l }));
	else if (f.k === 'pullDamaged') pick(`${ab.name}: choose an opponent's Benched Pokémon that has damage on it`, oppSeats(V).flatMap(s => locsOf(V, s, ['bench'])).filter(l => at(V, l).dmg > 0), b => pick(`${ab.name}: choose which of that player's Active Pokémon it replaces`, locsOf(V, b.seat, ['active']), l => go({ target: l, bench: b.idx })));
	else if (f.k === 'ubSwap') pick(`${ab.name}: choose your Ultra Beast in an Active slot`, locsOf(V, you, ['active']).filter(l => def(at(V, l)).ub), l => pick(`${ab.name}: choose your Benched Ultra Beast to bring up`, locsOf(V, you, ['bench']).filter(b => def(at(V, b)).ub), b => go({ slot: l.idx, bench: b.idx })));
	else if (f.k === 'benchSwap') pick(`${ab.name}: choose your Pokémon in an Active slot to trade places with`, locsOf(V, you, ['active']), l => go({ slot: l.idx }));
	else if (f.k === 'takeDamage') pick(`${ab.name}: choose one of your damaged Pokémon; all its damage moves to ${def(k).name}`, locsOf(V, you).filter(l => at(V, l).uid !== k.uid && at(V, l).dmg > 0), l => go({ from: l }));
	else if (f.k === 'discardDraw') {
		const me = V.players[you], grid = h('div', 'pe-grid');
		me.hand.forEach((id, n) => { const e = handCard(card(id), null); e.classList.add('small'); e.dataset.k = 'dd' + n; e.addEventListener('click', () => { closeAll(); go({ hand: n }); }); grid.appendChild(e); });
		if (!grid.children.length) { toast('You have no card to discard.'); return; }
		modal(grid, { title: `${ab.name}: discard which card?` });
	}
	else if (f.k === 'moveEnergy') pick(`${ab.name}: choose the Benched ${f.type} Pokémon to take a ${f.type} Energy from`, locsOf(V, you, ['bench']).filter(l => def(at(V, l)).cardType === f.type && at(V, l).energy.includes(f.type)),
		b => pick(`${ab.name}: choose your ${f.type} Pokémon in an Active slot to give it to`, locsOf(V, you, ['active']).filter(l => def(at(V, l)).cardType === f.type), l => go({ bench: b.idx, at: l })));
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
		} else for (const s of [0, 1]) if (!me.active[s]) acts.push([`Move up to Active ${SLOT[s]}`, () => { closeAll(); send({ t: 'promote', slot: s, bench: loc.idx }); }]);
		if (me.zone.cur && !me.flags.attached && !c.fossil) acts.push([`Attach ${en(me.zone.cur)} ${me.zone.cur} Energy`, () => { closeAll(); send({ t: 'attach', at: loc }); }]);
		if (c.ability && !c.ability.fx.passive) acts.push([`Use Ability: ${esc(c.ability.name)}`, () => useAbility(loc), k.abilityUsed === V.turn ? 'already used this turn' : c.ability.fx.active && loc.zone !== 'active' ? 'must be in an Active slot' : null]);
		if (c.fossil) acts.push(['Discard from play', () => { closeAll(); send({ t: 'discardFossil', at: loc }); }]);
	}
	inspect(c, k, loc, acts);
}
function finishSetup() {
	Promise.resolve(send({ t: 'setup', active: ui.setup.active.slice(), bench: ui.setup.bench.slice() })).then(ok => { if (ok) { ui.setup = { active: [], bench: [] }; render(); } });
}
function execute() {
	if (!myTurn()) return;
	const you = YOU(), me = V.players[you], cmds = [0, 1].map(i => (ui.cmds[i] ? ui.cmds[i].cmd : null));
	const could = [0, 1].some(i => !cmds[i] && me.active[i] && def(me.active[i]).attacks.some(a => !attackWhy(V, you, me.active[i], a) && (a.target === 'none' || targetsOf(V, you, a).length)));
	const go = () => { closeAll(); Promise.resolve(send({ t: 'execute', commands: cmds })).then(ok => { if (ok) { ui.cmds = [null, null]; play('whoosh'); render(); } }); };
	if (!could) { go(); return; }
	const box = h('div', '', `<div class="pe-note">${[0, 1].map(i => `Active ${SLOT[i]}: ${me.active[i] ? esc(def(me.active[i]).name) + ' → ' + (ui.cmds[i] ? esc(ui.cmds[i].text) : '<b class="orange">Pass</b>') : 'empty'}`).join('<br>')}<br><br>An Active Pokémon that could attack is passing.</div>`);
	box.appendChild(btn('Execute', 'red wide b-go', go, 'exec2'));
	modal(box, { title: 'Execute?' });
}

// ------------------------------------------------------------------ a card, read closely
function inspect(c, k, loc, acts = []) {
	const wrap = h('div', '');
	const body = h('div', 'pe-insp');
	const big = h('div', 'big pf' + (c.ex ? ' ex' : ''), face(c, k));
	big.style.setProperty('--c', `var(--t-${c.kind === 'pokemon' ? c.cardType : 'Colorless'})`);
	const info = h('div', 'info');
	const orig = (t, note) => (ui.showOriginal && t ? `<div class="orig">Original: ${tx(t)}${note ? `<br><span class="lbl">Why it differs: ${esc(note)}</span>` : ''}</div>` : '');
	let html = '';
	if (c.kind === 'pokemon') {
		html += `<div class="row">${stageOf(c)}${c.evolvesFrom ? ' · evolves from ' + esc(c.evolvesFrom) : ''} · ${k ? Math.max(0, k.hp - k.dmg) + ' / ' : ''}${c.hp} HP${c.ex ? ' · Pokémon ex: ${c.points} points' : ''}</div>`;
		html += `<div class="row"><span class="lbl">Card Type</span> ${ty(c.cardType)} <span class="lbl">(Energy and card effects)</span></div>`;
		html += `<div class="row"><span class="lbl">Combat Type${c.combatTypes.length > 1 ? 's' : ''}</span> ${c.combatTypes.map(ty).join(' ')} <span class="lbl">(what attacks are strong or weak against)</span></div>`;
		html += `<div class="row"><span class="lbl">Retreat</span> ${c.retreat}${c.weakness ? ` · <span class="lbl">printed Weakness ${esc(c.weakness)} (not used here)</span>` : ''}</div>`;
		if (k && k.tool) html += `<div class="row"><span class="lbl">Pokémon Tool</span> ${esc(card(k.tool).name)}: ${tx(card(k.tool).adapted)}</div>`;
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
	const t = btn(ui.showOriginal ? 'Hide original card text' : 'Show original card text', 'grey wide', () => { ui.showOriginal = !ui.showOriginal; SV.setPref('original', ui.showOriginal); closeModal(); inspect(c, k, loc, acts); }, 'orig');
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
	'<b class="orange">Execute.</b> Choose an attack and a target for each Active Pokémon (or let it pass), then press <b>Execute</b>. A resolves, then B, and your turn ends. If A knocks out B\'s target, B\'s attack fails: it does not pick a new one.',
	'<b class="orange">Controls.</b> Mouse or touch; or arrows / WASD to move, Z to choose, X to go back, C to Execute, V to read a card, Enter for the menu. A controller works the same way.',
];
function howTo() { modal(h('div', 'pe-note', HOW.map(x => `<p style="text-align:left;max-width:860px">${x}</p>`).join('')), { title: 'How to play' }); }

// ------------------------------------------------------------------ the collection: packs, cards owned, pack points
let COL = SV.collection(), packBtn = null, colSync = null, deckSync = null;
const SYNC_NOTE = { guest: 'Kept on this device. Sign in to keep it on your account.', syncing: 'Saving to your account…', saved: 'Saved to your account.', offline: 'Offline: kept on this device, and sent to your account when you are back.' };
const syncNote = () => `<span class="pe-sync" data-sync="${colSync ? colSync.status() : 'guest'}">${SYNC_NOTE[colSync ? colSync.status() : 'guest']}</span>`;
const deckNote = () => `<span class="pe-sync pe-dsync" data-sync="${deckSync ? deckSync.status() : 'guest'}">${SYNC_NOTE[deckSync ? deckSync.status() : 'guest'].replace('Sign in to keep it', 'Sign in to keep your decks')}</span>`;
const paintSync = () => { for (const e of document.querySelectorAll('.pe-sync')) { const y = e.classList.contains('pe-dsync') ? deckSync : colSync, s = y ? y.status() : 'guest'; e.dataset.sync = s; e.textContent = SYNC_NOTE[s]; } };
/** Save or delete one of the player's decks (and send the list to their account). -> why not, or null. */
function keepDeck(d) { const e = SV.saveDeck(d); if (!e && deckSync) deckSync.soon(); return e; }
function dropDeck(name) { SV.deleteDeck(name); if (deckSync) deckSync.soon(); }
/** Signed in: the collection lives on the account (colsync.js); what the account holds replaces the device's copy when they differ. */
function startColSync() {
	if (!net) return;
	colSync = createSync({ call: (a, b) => net.call(a, b), user: () => (net.isLoggedIn() ? net.myName() : null), getLocal: () => COL,
		setLocal: c => { COL = c; SV.setCollection(COL); packLabel(); }, onStatus: paintSync });
	deckSync = createSync({ kind: DECK_KIND, call: (a, b) => net.call(a, b), user: () => (net.isLoggedIn() ? net.myName() : null), getLocal: () => SV.listDecks(), setLocal: l => { SV.setDecks(l); }, onStatus: paintSync });
	colSync.now(); deckSync.now();
	document.addEventListener('visibilitychange', () => { if (!document.hidden) { colSync.now(); deckSync.now(); } });
}
const packLabel = () => { if (packBtn) packBtn.innerHTML = `Open packs <span class="muted">(${COL.packs})</span>`; };
/** Keep a changed collection (Mew arrives with the last of the first 150). */
function saveCol(c) {
	const had = COLL.owned(c, COLL.SECRET);
	COL = COLL.claimSecrets(c); SV.setCollection(COL); packLabel(); if (colSync) colSync.soon();
	if (!had && COLL.owned(COL, COLL.SECRET)) toast('You own every Pokémon from 1 to 150: Mew joins your collection!');
}
/** Pack rolls: the page's own randomness; with ?seed= they repeat (so a test can open the same packs). */
function packRand() {
	if (!SEED_PARAM) return Math.random;
	let a = 0; for (const ch of SEED_PARAM + ':' + COL.opened) a = (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0;
	return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rarMark = r => `<span class="rar r${r}">${COLL.RARITY[r]}</span>`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function packsMenu() {
	const box = h('div', '');
	const draw = () => {
		box.innerHTML = '';
		box.appendChild(h('div', 'pe-note', `<b class="money">${plural(COL.packs, 'pack')}</b> to open · ${COL.points} pack points<br>Finish a match for ${plural(COLL.PACK_FOR_MATCH, 'pack')}, win it for ${COLL.PACK_FOR_WIN}. Every pack opened is ${COLL.POINTS_PER_PACK} pack points, to exchange for a card you want in your Collection.`));
		const row = h('div', 'pe-packs');
		for (const b of COLL.BOOSTERS) {
			const p = h('button', 'pe-pack', `<span class="set">${esc(b.set)}</span><img src="/overworld/data/pokemon/s${b.dex * 32}.png" alt=""><span class="nm">${b.name}</span><span class="n5">5 cards</span>`);
			p.type = 'button'; p.dataset.k = 'pack' + b.id; p.style.setProperty('--c', `var(--t-${b.type})`); p.disabled = !COL.packs; p.setAttribute('aria-label', `Open a ${b.name} pack`);
			p.addEventListener('click', () => openOne(b, draw));
			row.appendChild(p);
		}
		box.appendChild(row);
		const bar = h('div', 'pe-seg'); bar.appendChild(btn('Collection', 'orange', () => collectionMenu(), 'collection')); box.appendChild(bar);
		if (pad) pad.refresh();
	};
	draw();
	modal(box, { title: 'Open packs' });
}
function openOne(b, redraw) {
	const r = COLL.openPack(COL, b.id, packRand());
	if (!r) { toast('You have no packs to open. Finish a match to earn one.'); return; }
	saveCol(r.col); play('cardSlide1');
	const box = h('div', ''), row = h('div', 'pe-pulls'), note = h('div', 'pe-note', r.rare ? '<b class="money">A rare pack!</b> Press a card to turn it over.' : 'Press a card to turn it over.'), bar = h('div', 'pe-seg');
	const left = () => row.querySelectorAll('.pe-pull.down').length;
	const flip = (e, p, c) => {
		e.classList.remove('down'); e.classList.add('up'); e.setAttribute('aria-label', `${c.name}${p.isNew ? ', new' : ''}`); play('cardSlide2', p.rarity.endsWith('D') ? 1 : 1.4);
		if (!left()) { const fresh = r.pulls.filter(x => x.isNew).length; note.innerHTML = fresh ? `<b class="money">${plural(fresh, 'new card')}</b> for your collection.` : 'No new cards this time: the copies still count for your decks.'; all.disabled = true; if (pad) pad.refresh(true); }
	};
	r.pulls.forEach((p, i) => {
		const c = card(p.id), e = handCard(c, null, rarMark(p.rarity) + (p.isNew ? '<span class="new">NEW</span>' : '')); e.classList.add('small', 'pe-pull', 'down', 'r' + p.rarity); if (/[SH]$|^CR$/.test(p.rarity)) e.classList.add('holo'); e.dataset.k = 'pull' + i; e.setAttribute('aria-label', 'A face-down card');
		e.addEventListener('click', () => { if (e.classList.contains('down')) flip(e, p, c); else inspect(c); });
		row.appendChild(e);
	});
	const all = btn('Turn all over', 'grey', () => { [...row.querySelectorAll('.pe-pull.down')].forEach(e => e.click()); }, 'flipall');
	const again = btn(`Open another <span class="muted">(${COL.packs} left)</span>`, 'green', () => { closeModal(); openOne(b, redraw); }, 'again'); again.disabled = !COL.packs;
	bar.append(all, again);
	box.append(row, note, bar);
	modal(box, { title: `${b.name} pack`, onClose: () => redraw && redraw() });
}
function collectionMenu() {
	const st = { filter: 'All', show: 'all' }, box = h('div', '');
	const FILTERS = ['All', 'Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless', 'Trainers'];
	const draw = () => {
		const y = box.querySelector('.pe-grid') ? box.querySelector('.pe-grid').scrollTop : 0;
		box.innerHTML = '';
		box.appendChild(h('div', 'pe-note pe-colhead', `<b class="money">${COLL.uniqueOwned(COL)} / ${CARDS.length}</b> cards · ${COL.points} pack points · ${plural(COL.packs, 'pack')} to open<br>${syncNote()}`));
		const seg = h('div', 'pe-seg'); for (const f of FILTERS) seg.appendChild(btn(f, 'grey' + (st.filter === f ? ' on' : ''), () => { st.filter = f; draw(); pad && pad.refresh(true); }, 'f' + f)); box.appendChild(seg);
		const seg2 = h('div', 'pe-seg'); for (const [k, label] of [['all', 'Every card'], ['own', 'Owned'], ['lack', 'Not owned']]) seg2.appendChild(btn(label, 'grey' + (st.show === k ? ' on' : ''), () => { st.show = k; draw(); pad && pad.refresh(true); }, 's' + k));
		seg2.appendChild(btn('Open packs', 'red', () => packsMenu(), 'packs')); box.appendChild(seg2);
		const grid = h('div', 'pe-grid pe-col');
		for (const c of CARDS) {
			if (st.filter === 'Trainers' ? c.kind === 'pokemon' : st.filter !== 'All' && !(c.kind === 'pokemon' && c.cardType === st.filter)) continue;
			const n = COLL.owned(COL, c.id); if (st.show === 'own' ? !n : st.show === 'lack' && n) continue;
			const best = n ? COLL.printInfo(COLL.bestPrint(COL, c.id)) : null;
			const e = handCard(c, null, n ? `<span class="have">×${n}</span>${best && !/D$|^N$/.test(best.rarity) ? rarMark(best.rarity) : ''}` : ''); e.classList.add('small'); if (!n) e.classList.add('lack'); else if (best && !/D$|^N$/.test(best.rarity)) e.classList.add('holo'); e.dataset.k = 'c' + c.id;
			e.setAttribute('aria-label', `${c.name}, ${n ? 'you own ' + n : 'not owned'}`);
			e.addEventListener('click', () => {
				const cost = COLL.exchangeCost(c.id), res = cost ? COLL.exchange(COL, c.id) : null;
				inspect(c, null, null, [[cost ? `Exchange ${cost} pack points for one` : 'Not found in packs or the exchange', () => { saveCol(res); play('cardSlide1'); closeModal(); toast(`${c.name} joins your collection.`); draw(); }, !cost ? (c.id === COLL.SECRET ? 'own every Pokémon from 1 to 150' : 'a promo card') : typeof res === 'string' ? res : '', 'exchange']]);
			});
			grid.appendChild(e);
		}
		if (!grid.children.length) grid.appendChild(h('div', 'pe-note', 'No cards here.'));
		box.appendChild(grid); grid.scrollTop = y;
		if (pad) pad.refresh();
	};
	draw();
	modal(box, { title: 'Collection' });
}
/** Packs for a finished match (once per match: a reload does not pay again). -> how many. */
function payPacks(won, key) {
	if (SV.prefs().paid === key) return 0;
	const n = won ? COLL.PACK_FOR_WIN : COLL.PACK_FOR_MATCH;
	SV.setPref('paid', key); saveCol(COLL.addPacks(COL, n));
	return n;
}

function mainMenu() {
	closeAll();
	const box = h('div', 'pe-list'), saved = SV.loadRun();
	if (saved) box.appendChild(btn(`Continue match <span class="muted">(${esc(E.labelOf(saved.S))})</span>`, 'green big', () => resume(saved), 'continue'));
	box.appendChild(btn('New match', 'blue big b-new', () => newMatchMenu(), 'new'));
	box.appendChild(btn('Play online', 'purple big', () => onlineMenu(), 'online'));
	packBtn = btn('', 'red', () => packsMenu(), 'packs'); packLabel(); box.appendChild(packBtn);
	box.appendChild(btn('Collection', 'orange', () => collectionMenu(), 'collection'));
	box.appendChild(btn('Deck builder', 'orange', () => deckBuilder(), 'decks'));
	box.appendChild(btn('Replays', 'grey', () => replaysMenu(), 'replays'));
	box.appendChild(btn('How to play', 'grey', () => howTo(), 'how'));
	box.appendChild(h('div', 'pe-note', 'Pokémon TCG Pocket\'s Genetic Apex cards, for 2 to 4 players,<br>with two Active Pokémon and the video games\' type chart.'));
	modal(box, { title: 'Pocket Enhanced', noClose: true });
}
const allDecks = () => [...SV.listDecks().map(d => ({ id: 'my:' + d.name, name: d.name + ' (yours)', get: () => ({ deck: d.deck.slice(), energy: d.energy.slice() }) })), ...STARTERS.map(s => ({ id: s.id, name: s.name, get: () => starterDeck(s.id) }))];
function newMatchMenu() {
	const p = SV.prefs(), st = { n: [2, 3, 4].includes(p.players) ? p.players : 2, deck: p.deck || STARTERS[0].id };
	const box = h('div', '');
	const draw = () => {
		box.innerHTML = '';
		const decks = allDecks(); if (!decks.some(d => d.id === st.deck)) st.deck = decks[0].id;
		box.appendChild(h('div', 'pe-note', 'Players'));
		const seg = h('div', 'pe-seg'); for (const n of [2, 3, 4]) seg.appendChild(btn(String(n), 'grey' + (st.n === n ? ' on' : ''), () => { st.n = n; draw(); pad && pad.refresh(true); }, 'n' + n)); box.appendChild(seg);
		box.appendChild(h('div', 'pe-note', 'Your deck'));
		const dk = h('div', 'pe-seg'); dk.style.maxWidth = '900px'; for (const d of decks) dk.appendChild(btn(esc(d.name), 'grey' + (st.deck === d.id ? ' on' : ''), () => { st.deck = d.id; draw(); pad && pad.refresh(true); }, 'd' + d.id)); box.appendChild(dk);
		box.appendChild(btn('Start', 'green big wide b-go', () => { SV.setPref('players', st.n); SV.setPref('deck', st.deck); startMatch(st.n, decks.find(d => d.id === st.deck).get()); }, 'start'));
	};
	draw();
	modal(box, { title: 'New match' });
}
function startMatch(n, mine, seed) {
	seed = seed || SEED_PARAM || SV.randomSeed();
	// the computer players' decks: the ready-made ones, in an order the seed decides
	const pool = STARTERS.map(s => s.id); let x = 0; for (const ch of String(seed)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
	const players = [{ name: (net && net.myName()) || 'Red', ai: false, ...mine }];   // (a name, not "You": the log says "Red draws a card")
	for (let i = 1; i < n; i++) players.push({ name: RIVALS[i - 1], ai: true, ...starterDeck(pool[(x + i * 3) % pool.length]) });
	begin({ config: { seed, players, rules: E.RULES }, actions: [], you: 0 }, E.createGame({ seed, players, rules: E.RULES }));
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
	const w = V.over.winner, summary = { players: V.players.map(p => ({ name: p.name, points: p.points })), winner: w != null ? V.players[w].name : null, turns: V.turn };
	const recipe = online ? ON.recipe : SV.recipeOf(G.config, G.actions);
	if (recipe) SV.addReplay(recipe.config, recipe.actions, summary);
	play(w === YOU() ? 'win' : 'negative');
	const earned = YOU() != null && (online || V.turn >= 3) ? payPacks(w === YOU(), online ? `o:${ON.id}:${ON.mid}` : `n:${G.config.seed}:${G.actions.length}`) : 0;
	if (publisher) { const p = publisher; publisher = null; setTimeout(() => { try { p.finish({ won: w === YOU() }).catch(() => {}); } catch (e) { /* offline */ } }, 1200); }
	const box = h('div', '');
	box.appendChild(h('div', 'pe-note', `${esc(w != null ? V.players[w].name + ' wins' : 'Nobody wins')} — ${esc(V.over.why)}<br><br>${V.players.map(p => `${esc(p.name)}: ${p.points} point${p.points === 1 ? '' : 's'}`).join(' · ')}${earned ? `<br><br><b class="money pe-earned">+${plural(earned, 'pack')}</b>` : ''}`));
	const list = h('div', 'pe-list');
	if (online) list.appendChild(btn('Back to the lobby', 'blue big b-again', () => { closeAll(); showLobby(true); }, 'tolobby'));
	else list.appendChild(btn('New match', 'blue big b-again', () => newMatchMenu(), 'new'));
	if (COL.packs) list.appendChild(btn(`Open packs <span class="muted">(${COL.packs})</span>`, 'red', () => packsMenu(), 'packs'));
	if (recipe && !online) list.appendChild(btn('Watch the replay', 'grey', () => startReplay(recipe), 'watch'));
	if (recipe) list.appendChild(btn('Copy replay link', 'grey', () => shareReplay(recipe), 'share'));
	list.appendChild(btn(online ? 'Leave the match' : 'Menu', 'orange', () => leave(), 'leave'));
	box.appendChild(list);
	modal(box, { title: w === YOU() ? 'You win!' : 'Match over', noClose: true });
}

// ------------------------------------------------------------------ online: a lobby by code, a match the server holds
const PKV = { pv: 16, ev: E.ENGINE_VERSION };
const pk = async (action, body = {}) => { try { return await net.call('pkpvp-' + action, { ...PKV, ...body }); } catch (e) { return null; } };
const deckById = id => (allDecks().find(d => d.id === id) || allDecks()[0]).get();
function onlineMenu() {
	if (!net || !net.isLoggedIn()) { modal(h('div', 'pe-note', 'Playing against other people needs an account.<br>Sign in from the top bar (the ⚙ in the corner), then come back here.<br><br>Matches against computer players need no account.'), { title: 'Play online' }); return; }
	const p = SV.prefs(), st = { size: [2, 3, 4].includes(p.osize) ? p.osize : 2, bots: 0, deck: p.deck || STARTERS[0].id, busy: false };
	const box = h('div', '');
	const draw = () => {
		box.innerHTML = '';
		const decks = allDecks(); if (!decks.some(d => d.id === st.deck)) st.deck = decks[0].id;
		st.bots = Math.min(st.bots, st.size - 1);
		box.appendChild(h('div', 'pe-note', 'Your deck'));
		const dk = h('div', 'pe-seg'); dk.style.maxWidth = '900px'; for (const d of decks) dk.appendChild(btn(esc(d.name), 'grey' + (st.deck === d.id ? ' on' : ''), () => { st.deck = d.id; SV.setPref('deck', d.id); draw(); pad && pad.refresh(true); }, 'd' + d.id)); box.appendChild(dk);
		box.appendChild(h('div', 'pe-note', 'Join a friend\'s match'));
		box.appendChild(btn('Enter a code', 'blue big wide b-go', async () => {
			const code = await askText({ title: 'The 5-letter match code', maxLength: 5, upper: true });
			if (!code) return;
			const r = await pk('join', { code: code.trim().toUpperCase(), ...deckById(st.deck) });
			if (r && r.lobby) enterLobby(r.lobby); else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.');
		}, 'join'));
		box.appendChild(h('div', 'pe-note', 'Or host one: seats, and how many of them are computer players'));
		const seg = h('div', 'pe-seg'); for (const n of [2, 3, 4]) seg.appendChild(btn(n + ' seats', 'grey' + (st.size === n ? ' on' : ''), () => { st.size = n; draw(); pad && pad.refresh(true); }, 'os' + n)); box.appendChild(seg);
		const bs = h('div', 'pe-seg'); for (let n = 0; n < st.size; n++) bs.appendChild(btn(n === 0 ? 'no computer players' : n + ' computer', 'grey' + (st.bots === n ? ' on' : ''), () => { st.bots = n; draw(); pad && pad.refresh(true); }, 'ob' + n)); box.appendChild(bs);
		box.appendChild(btn('Host a match', 'green big wide', async () => {
			SV.setPref('osize', st.size);
			const r = await pk('create', { size: st.size, bots: st.bots, ...deckById(st.deck) });
			if (r && r.lobby) enterLobby(r.lobby);
			else if (r && r.id) { const m = await pk('mine'); if (m && m.lobby) enterLobby(m.lobby); else toast(cap(r.error) + '.'); }
			else toast(r && r.error ? cap(r.error) + '.' : 'Could not reach the server.');
		}, 'host'));
	};
	draw();
	modal(box, { title: 'Play online' });
	// a match this account is already in (a reload, another device): go straight back to it
	pk('mine').then(r => { if (r && r.lobby && MODE !== 'online') enterLobby(r.lobby); });
}
function enterLobby(lobby) {
	closeAll(); clearTimeout(aiTimer); aiTimer = 0; stopReplayTimer(); stopPublishing();
	MODE = 'online'; G = S = V = R = null; overShown = false;
	ui.cmds = [null, null]; ui.pick = null; ui.setup = { active: [], bench: [] }; ui.prevDmg = new Map(); ui.coinN = null;
	Object.assign(ON, { id: lobby.id, lobby, mid: 0, n: -1, seat: -1, busy: false, recipe: null, sig: '' });
	render(); showLobby(true); pollOnline();
}
function showLobby(force) {
	const lb = ON.lobby; if (!lb) return;
	const sig = JSON.stringify(lb);
	if (!force && sig === ON.sig && topModal()) return;
	ON.sig = sig;
	closeAll();
	const me = net.myName(), host = lb.host === me, mine = lb.players.find(p => p.name === me) || {}, idle = !lb.started || lb.over;
	const box = h('div', '');
	box.appendChild(h('div', 'pe-note', `Match code<br><span style="font-size:64px;letter-spacing:8px;color:var(--money)" data-code="${esc(lb.code)}">${esc(lb.code)}</span><br>Anyone signed in can join with it.`));
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
		} else bar.appendChild(btn(mine.ready ? 'Not ready' : 'Ready', mine.ready ? 'grey big' : 'green big b-go', () => up({ ready: !mine.ready }), 'oready'));
	} else bar.appendChild(btn('Back to the match', 'blue big b-go', () => closeAll(), 'toMatch'));
	bar.appendChild(btn('Leave', 'red', () => leaveOnline(true), 'oleave'));
	box.appendChild(bar);
	if (idle && !host) box.appendChild(h('div', 'pe-note', 'The host starts the match when everyone is ready.'));
	modal(box, { title: lb.over ? 'Match over — the lobby' : 'Online match', noClose: true });
}
/** A reply from the referee: the lobby, and (in a match) my seat's view when the position changed. */
function onServer(r) {
	if (MODE !== 'online') return;
	if (!r) return;
	if (r.closed || (r.error && /closed|not in that match/.test(r.error))) { toast('That match has closed.'); leaveOnline(false); return; }
	if (r.error) { if (/out of date/.test(r.error)) toast('The game was updated: reload the page.'); return; }
	if (r.lobby) ON.lobby = r.lobby;
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
		if (!ON.busy) { try { onServer(await pk('sync', { id: ON.id, n: ON.n })); } catch (e) { console.warn('pocket: sync failed', e); } }
		pollOnline();
	}, wait);
}
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
	clearTimeout(ON.timer); stopPublishing();
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
function replaysMenu() {
	const list = h('div', 'pe-list'), all = SV.listReplays();
	if (!all.length) list.appendChild(h('div', 'pe-note', 'Finished matches are kept here (the last 12).'));
	all.forEach((r, i) => { const s = r.summary || {}; const o = h('button', 'pe-opt', `${esc((s.players || []).map(p => `${p.name} ${p.points}`).join(' · '))}<span class="why">${esc(s.winner ? s.winner + ' won' : 'no winner')} · ${new Date(r.at).toLocaleDateString()}</span>`); o.type = 'button'; o.dataset.k = 'r' + i; o.addEventListener('click', () => startReplay(r.recipe)); list.appendChild(o); });
	modal(list, { title: 'Replays' });
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
	const st = { name: d.name, deck: start || SV.listDecks()[0] ? d.deck.slice() : d.deck.filter(id => { const n = (kept.get(id) || 0) + 1; kept.set(id, n); return n <= COLL.ownedByName(COL, id); }), energy: d.energy.slice(), filter: 'All', mine: false };
	const box = h('div', '');
	const FILTERS = ['All', 'Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless', 'Trainers'];
	const ENERGY = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'];
	const count = id => st.deck.filter(x => card(x).name === card(id).name).length;
	const draw = () => {
		const poolY = box.querySelector('.pool') ? box.querySelector('.pool').scrollTop : 0;
		box.innerHTML = '';
		const seg = h('div', 'pe-seg'); for (const f of FILTERS) seg.appendChild(btn(f, 'grey' + (st.filter === f ? ' on' : ''), () => { st.filter = f; draw(); pad && pad.refresh(true); }, 'f' + f));
		seg.appendChild(btn(st.mine ? 'Showing: owned' : 'Showing: every card', 'orange', () => { st.mine = !st.mine; draw(); pad && pad.refresh(true); }, 'mine')); box.appendChild(seg);
		const db = h('div', 'pe-db'), pool = h('div', 'pool');
		for (const c of CARDS) {
			if (st.filter === 'Trainers' ? c.kind === 'pokemon' : st.filter !== 'All' && !(c.kind === 'pokemon' && c.cardType === st.filter)) continue;
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
		const rows = h('div', 'rows'), seen = new Set();
		for (const id of st.deck.slice().sort((a, b) => (card(a).kind === 'pokemon' ? 0 : 1) - (card(b).kind === 'pokemon' ? 0 : 1) || card(a).name.localeCompare(card(b).name))) {
			const c = card(id); if (seen.has(c.name)) continue; seen.add(c.name);
			const r = h('button', 'rowb', `${c.kind === 'pokemon' ? ty(c.cardType) : ''} ${esc(c.name)}<span class="x">×${count(id)} −</span>`); r.type = 'button'; r.dataset.k = 'm' + id; r.setAttribute('aria-label', `Remove one ${c.name}`);
			r.addEventListener('click', () => { const i = st.deck.findIndex(x => card(x).name === c.name); st.deck.splice(i, 1); draw(); });
			rows.appendChild(r);
		}
		mine.appendChild(rows);
		const bar = h('div', 'pe-seg');
		const sv = btn('Save deck', 'green', () => { const e = keepDeck(st); toast(e ? cap(e) + '.' : `Saved "${st.name}".`); draw(); }, 'save'); sv.disabled = !!err; bar.appendChild(sv);
		bar.appendChild(btn('Clear', 'red', () => { st.deck = []; draw(); }, 'clear'));
		bar.appendChild(btn('Load…', 'grey', () => { const l = h('div', 'pe-list'); for (const x of allDecks()) { const o = h('button', 'pe-opt', esc(x.name)); o.type = 'button'; o.addEventListener('click', () => { const g = x.get(); closeModal(); st.deck = g.deck; st.energy = g.energy; st.name = x.id.startsWith('my:') ? x.id.slice(3) : x.name + ' copy'; draw(); }); l.appendChild(o); if (x.id.startsWith('my:')) { const del = h('button', 'pe-opt', `Delete ${esc(x.id.slice(3))}`); del.type = 'button'; del.style.color = '#f0b9b4'; del.addEventListener('click', () => { dropDeck(x.id.slice(3)); closeModal(); toast('Deleted.'); }); l.appendChild(del); } } modal(l, { title: 'Load a deck' }); }, 'load'));
		mine.appendChild(bar);
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
	const stops = () => { const m = topModal(); return [...(m ? m.el : el.table).querySelectorAll('button, input[type=range]')].filter(shown); };
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
	function confirm() { if (!seen()) { ringOn = true; ensure(false); return; } focus.click(); }
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
		hints.innerHTML = `${k('confirm')}Choose<span class="sep"></span>${k('cancel')}Back<span class="sep"></span>${k('secondary')}Execute<span class="sep"></span>${k('context')}Read card${src === 'pad' ? '<span class="sep"></span>' + k('menu') + 'Menu' : ''}`;
	};
	const menu = () => { if (topModal()) return; if (V) optionsMenu(); };
	const onAction = (a, info) => {
		if (oskOpen()) return false;   // the on-screen keyboard has the input
		src = info.source === 'key' ? 'key' : 'pad';
		if (['up', 'down', 'left', 'right'].includes(a)) {
			// a focused slider (the replay position) takes left / right itself
			if (seen() && focus.tagName === 'INPUT' && (a === 'left' || a === 'right')) { focus.value = +focus.value + (a === 'left' ? -1 : 1); focus.dispatchEvent(new Event('input')); showHints(); return true; }
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
	addEventListener('keydown', ev => { if (oskOpen() || ev.ctrlKey || ev.metaKey || ev.altKey || isTyping(ev.target && ev.target.tagName ? ev.target : undefined)) return; if (ev.key === 'Escape') cancel(); });
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
	start: (o = {}) => startMatch(o.players || 2, o.deck ? { deck: o.deck, energy: o.energy } : starterDeck(o.starter || STARTERS[0].id), o.seed),
	idle: () => idle(),
	fast: on => { ui.fast = on !== false; tickAI(); },
	coinBusy: () => coinBusy,
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
	if (!shown) mainMenu();
	window.__pocket.ready = true;
}
boot().catch(e => { console.error(e); const l = document.getElementById('boot-loading'); if (l) l.textContent = 'Pocket Enhanced failed to load: ' + e.message; });
