// Pocket Enhanced — the page. A sibling of Scoundrel and Pair of Pears: Micatro's look (font, palette, buttons,
// modals, swirling background, sounds) around this game's own rules (./engine/engine.js).
//
//   normal          : a match on this device against computer players. S (engine state) -> send(action) -> render(view)
//   ?replay=<code>  : read-only; a finished match rebuilt from its recipe, step by step
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
import { loadFont } from '../../micatro/js/ui/assets.js';
import { Background, C as BGC, hex } from '../../micatro/js/ui/gl.js';
import { sound } from '../../micatro/js/ui/sound.js';
import { esc } from '../../micatro/js/ui/markup.js';
import { buttonLabel } from '/site/gamepad.js';
import { startInput, keyLabel, isTyping } from '/site/input.js';
import { packString, unpackString } from '/battlecards/codec.js';

const params = new URLSearchParams(location.search);
const REPLAY_PARAM = params.get('replay');
const SEED_PARAM = (params.get('seed') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);   // ?seed=X: new matches use that seed
const SPECTATE = (params.get('spectate') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
const SLOT = ['A', 'B'];
const RIVALS = ['Blue', 'Green', 'Silver'];
const STATUS_LABEL = { poisoned: 'PSN', asleep: 'SLP', paralyzed: 'PAR' };
const FX_LABEL = { cantAttack: "can't attack", cantRetreat: "can't retreat", atkMinus: 'attacks weaker', reduce: 'takes less', prevent: 'protected' };

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const play = (name, pitch, vol) => { try { sound.play(name, pitch, vol); } catch (e) { /* sound is optional */ } };
const btn = (label, cls, fn, k) => { const b = h('button', 'btn ' + cls, label); b.type = 'button'; if (k) b.dataset.k = k; b.addEventListener('click', e => { play('button'); fn(e); }); return b; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const ty = t => `<span class="ty" style="--c:var(--t-${t})">${t}</span>`;
const en = (t, cls) => `<span class="en ${cls || ''}" style="--c:var(--t-${t})" title="${t}"></span>`;
const ELETTER = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', C: 'Colorless', N: 'Dragon' };
/** Card text for the page: escaped, with the card game's {R}-style Energy symbols drawn as pips. */
const tx = s => esc(s || '').replace(/\{([A-Z])\}/g, (m, l) => (ELETTER[l] ? en(ELETTER[l]) : m));
const sprite = c => (c.dex ? `/overworld/data/pokemon/s${c.dex * 32}.png` : null);
const artHtml = c => { const s = c.kind === 'pokemon' && !c.fossil ? sprite(c) : null; return s ? `<img src="${s}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'?'}))">` : `<span class="ph">${c.fossil ? '🦴' : c.kind === 'item' ? '🎒' : c.kind === 'supporter' ? '🧑' : '?'}</span>`; };

// ------------------------------------------------------------------ the match on the table
let MODE = 'normal';         // 'normal' | 'replay' | 'spectate'
let G = null;                // normal: { config, actions, you }
let S = null;                // the engine state (normal and replay)
let V = null;                // the view on the table
let R = null;                // replay: { recipe, pos, pov, timer }
let aiTimer = 0, overShown = false, pad = null, bg = null;
let net = null, publisher = null, spec = null;
const live = { you: 0, status: 'connecting', watchers: 0, names: [] };   // spectate: whose seat is at the bottom, and the link's state; playing: who is watching
const ui = { cmds: [null, null], pick: null, setup: { active: [], bench: [] }, prevDmg: new Map(), showOriginal: !!SV.prefs().original, fast: false };
const stage = document.getElementById('stage');
const el = {};

const YOU = () => (MODE === 'normal' && G ? G.you : null);
const pov = () => (MODE === 'replay' ? R.pov : MODE === 'spectate' ? live.you : YOU());
const viewLabel = v => (v.over ? 'Match over' : v.phase === 'setup' ? 'Setting up' : `Turn ${v.turn} · ${v.players.map(p => p.points).join('–')}`);
const def = k => card(k.id);
const at = (v, loc) => v.players[loc.seat][loc.zone][loc.idx];
const keyOf = loc => `p:${loc.seat}:${loc.zone}:${loc.idx}`;
const where = loc => (loc.zone === 'active' ? `Active ${SLOT[loc.idx]}` : `Bench ${loc.idx + 1}`);
const pokeLabel = (v, loc) => { const k = at(v, loc); return `${v.players[loc.seat].name}'s ${k ? def(k).name : '(empty)'} (${where(loc)})`; };
const myTurn = () => MODE === 'normal' && V && !V.over && V.phase === 'main' && V.current === YOU() && !V.pending;
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
	if (!E.canPay(k.energy, a.cost)) return 'not enough Energy';
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
	return out;
}

function persist() { if (MODE === 'normal' && G && S && !S.over) SV.saveRun(G.config, G.actions, G.you); }
/** Take an action as the player. A refused action changes nothing and says why. */
function send(a) {
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
function sync() {
	V = S ? E.view(S, pov()) : null;
	if (V) for (const i of [0, 1]) { const q = ui.cmds[i], me = YOU() != null ? V.players[YOU()] : null, k = me && me.active[i]; if (q && (!k || k.uid !== q.uid || !myTurn() || attackWhy(V, YOU(), k, def(k).attacks[q.cmd.attack]))) ui.cmds[i] = null; }
	if (ui.pick && ui.pick.auto) ui.pick = null;
	render();
	if (MODE === 'normal' && S && S.over && !overShown) { overShown = true; finish(); }
	tickAI();
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
	const s = actor();
	if (MODE !== 'normal' || s == null || !S.players[s].ai) return;
	const banned = new Set();
	for (let t = 0; t < 60; t++) {
		const a = nextAction(E.view(S, s), banned) || { t: 'execute', seat: s, commands: [null, null] };
		try { E.apply(S, a); G.actions.push(a); break; } catch (e) { if (!e || !e.refused) throw e; banned.add(JSON.stringify(a)); S = E.replay(G.config, G.actions); }
	}
	persist(); sync();
}
const idle = () => !aiTimer && (!S || S.over || MODE !== 'normal' || !S.players[actor()]?.ai);

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
	if (pad) pad.refresh();
}
function build() {
	stage.innerHTML = '';
	el.table = h('div', 'pe-table'); el.modals = h('div', 'modal-layer'); el.toast = h('div', 'pe-banner'); el.toast.style.display = 'none';
	stage.append(el.table, el.toast, el.modals);
}
let toastT = 0;
function toast(msg) { el.toast.textContent = msg; el.toast.style.display = ''; clearTimeout(toastT); toastT = setTimeout(() => { el.toast.style.display = 'none'; }, 3200); }

function pokeEl(v, loc, size, opts = {}) {
	const k = at(v, loc), b = h('button', 'pe-poke ' + size); b.type = 'button'; b.dataset.k = keyOf(loc);
	const legal = ui.pick && ui.pick.keys.has(keyOf(loc));
	if (!k) {
		b.classList.add('empty'); b.innerHTML = `<span class="slot">${loc.zone === 'active' ? SLOT[loc.idx] : ''}</span>`;
		if (legal) b.classList.add('can', 'legal'); else b.disabled = true;
		b.setAttribute('aria-label', `${v.players[loc.seat].name}'s empty ${where(loc)}`);
	} else {
		const c = def(k), left = Math.max(0, k.hp - k.dmg), pct = Math.round(100 * left / k.hp);
		b.style.setProperty('--c', `var(--t-${c.cardType})`);
		const st = k.status.map(s => `<b class="${s}">${STATUS_LABEL[s] || s}</b>`).join('') + (k.fx.length ? `<b class="fx" title="${esc(k.fx.map(f => FX_LABEL[f.k] || f.k).join(', '))}">FX</b>` : '');
		let badge = '';
		if (legal && ui.pick.attack && loc.seat !== pov()) { const t = effectiveness(ui.pick.attack.combatType, c.combatTypes).total; if (t) badge = `<b class="fx" style="background:${t > 0 ? 'var(--green)' : 'var(--red)'}">${t > 0 ? '+' : ''}${t}</b>`; }
		b.innerHTML = `<span class="slot">${loc.zone === 'active' ? SLOT[loc.idx] : ''}</span><span class="st">${st}${badge}</span><div class="art">${artHtml(c)}</div><div class="nm">${esc(c.name)}</div>` +
			`<div class="hp ${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}"><i style="width:${pct}%"></i></div><div class="hpn">${left}/${k.hp}</div><div class="ens">${k.energy.map(e => en(e)).join('')}</div>`;
		b.setAttribute('aria-label', `${pokeLabel(v, loc)}, ${left} of ${k.hp} HP`);
		if (legal) b.classList.add('legal');
		const q = loc.zone === 'active' && loc.seat === YOU() ? ui.cmds[loc.idx] : null;
		if (q) { b.classList.add('queued'); b.dataset.q = def(k).attacks[q.cmd.attack].name; }
		const was = ui.prevDmg.get(k.uid);
		if (was != null && k.dmg > was && !opts.quiet) { b.classList.add('hit'); b.appendChild(h('div', 'dn', '-' + (k.dmg - was))); }
	}
	b.addEventListener('click', () => onPoke(loc));
	return b;
}
function headEl(v, p) {
	const pts = Array.from({ length: v.points }, (_, i) => `<i class="pt ${i < p.points ? 'on' : ''}"></i>`).join('');
	return h('div', 'pe-head', `<span class="nm">${esc(p.name)}${p.ai ? ' <span class="muted">(computer)</span>' : p.seat === YOU() ? ' <span class="muted">(you)</span>' : ''}${p.eliminated ? ' — out' : ''}</span><span class="pts" title="${p.points} of ${v.points} points">${pts}</span>` +
		`<span class="cnt"><span title="cards in hand">✋ ${p.handCount}</span><span title="cards in deck">🂠 ${p.deck}</span><span title="discard pile">♻ ${p.discard.length}</span>${p.zone.cur ? en(p.zone.cur) : ''}</span>`);
}
function sideEl(v, p, n) {
	const d = h('div', 'pe-side' + (v.current === p.seat && v.phase === 'main' ? ' turn' : '') + (p.eliminated ? ' out' : ''));
	d.appendChild(headEl(v, p));
	const big = n >= 3 || portrait ? 'sm' : 'md', small = n >= 3 || (portrait && n >= 2) ? 'xs' : 'sm';
	const row = h('div', 'pe-row');
	for (const i of [0, 1]) row.appendChild(pokeEl(v, { seat: p.seat, zone: 'active', idx: i }, big));
	row.appendChild(h('span', 'gap'));
	for (let i = 0; i < 4; i++) row.appendChild(pokeEl(v, { seat: p.seat, zone: 'bench', idx: i }, small));
	d.appendChild(row);
	return d;
}
function handCard(c, i, extra = '') {
	const b = h('button', 'pe-card'); b.type = 'button'; if (i != null) b.dataset.k = 'h:' + i;
	b.style.setProperty('--c', `var(--t-${c.kind === 'pokemon' ? c.cardType : c.kind === 'supporter' ? 'Fighting' : 'Water'})`);
	const sub = c.kind === 'pokemon' ? (c.stage === 0 ? 'Basic' : `Stage ${c.stage} · from ${esc(c.evolvesFrom)}`) : c.fossil ? 'Item · fossil' : cap(c.kind);
	const body = c.kind === 'pokemon'
		? c.attacks.map(a => `<div class="atk">${a.cost.map(x => en(x)).join('')}<span>${esc(a.name)}</span><span class="d">${a.damage || ''}${a.damageMode === 'plus' ? '+' : a.damageMode === 'times' ? '×' : ''}</span></div>`).join('') + (c.ability ? `<div class="tx">Ability: ${esc(c.ability.name)}</div>` : '')
		: `<div class="tx">${tx(c.adapted || c.text)}</div>`;
	b.innerHTML = `<div class="top"><span class="n">${esc(c.name)}</span>${c.hp ? `<span class="h">${c.hp}</span>` : ''}</div><div class="sub">${sub}</div><div class="art">${artHtml(c)}</div>${body}${extra}`;
	b.setAttribute('aria-label', c.name);
	return b;
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
	const mine = MODE === 'normal' && you != null;
	// a choice the game is waiting on from me (who comes up from the Bench)
	if (mine && V.pending && V.pending.seat === you && !ui.pick) {
		const slot = V.pending.slot;
		ui.pick = { auto: true, prompt: V.pending.msg || 'Choose a Benched Pokémon to move up', keys: new Set(V.pending.options.map(i => keyOf({ seat: you, zone: 'bench', idx: i }))), cb: loc => { ui.pick = null; send({ t: 'choose', pick: loc.idx }); }, slot };
	}
	// opponents
	const opps = h('div', 'pe-opps');
	for (const p of others) opps.appendChild(sideEl(V, p, others.length));
	// my side
	const mePanel = h('div', 'pe-me' + (V.current === me.seat && V.phase === 'main' ? ' turn' : ''));
	mePanel.appendChild(headEl(V, me));
	const row = h('div', 'pe-row');
	for (const i of [0, 1]) row.appendChild(pokeEl(V, { seat: me.seat, zone: 'active', idx: i }, ''));
	row.appendChild(h('span', 'gap'));
	for (let i = 0; i < 4; i++) row.appendChild(pokeEl(V, { seat: me.seat, zone: 'bench', idx: i }, 'md'));
	mePanel.appendChild(row);
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
		const c = card(id), inA = ui.setup.active.indexOf(i), inB = ui.setup.bench.indexOf(i);
		const tag = V.phase === 'setup' && !me.setup ? (inA >= 0 ? `<span class="have">Active ${SLOT[inA]}</span>` : inB >= 0 ? '<span class="have">Bench</span>' : '') : '';
		const b = handCard(c, i, tag);
		if (mine && (myTurn() || (V.phase === 'setup' && !me.setup)) && playable(c, me)) b.classList.add('playable');
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
		bar.append(ex, btn('Menu', 'grey', () => optionsMenu(), 'menu'));
		cmd.appendChild(bar);
		cmd.appendChild(h('div', 'hint', (myTurn() ? 'Press an Active Pokémon to choose its attack and target. Execute resolves A, then B, and ends your turn.' : V.pending ? esc(`Waiting for ${V.players[V.pending.seat].name} to choose…`) : 'Waiting…') + (live.watchers ? ` <span class="pe-watch" title="${esc(live.names.join(', '))}">👁 ${live.watchers} watching</span>` : '')));
	} else {
		cmd.appendChild(h('h3', '', MODE === 'spectate' ? `Watching ${esc(SPECTATE)}` : MODE === 'replay' ? 'Replay' : V.over ? 'Match over' : 'Setting up'));
		cmd.appendChild(h('div', 'q', V.over ? esc(V.over.winner != null ? `${V.players[V.over.winner].name} wins — ${V.over.why}` : `No winner — ${V.over.why}`) : esc(viewLabel(V) + (V.phase === 'main' ? ` — ${V.players[V.current].name}'s turn` : ''))));
		if (MODE === 'spectate') cmd.appendChild(h('div', 'hint pe-spec', esc(SPEC_STATUS[live.status] || '') + ' You see what a spectator may: the table and the log, nobody\'s hand.'));
		const bar = h('div', 'bar');
		if (mine && V.phase === 'setup' && !me.setup) { const r = btn('Ready', 'green exec', () => finishSetup(), 'ready'); r.disabled = !ui.setup.active.length; bar.appendChild(r); }
		if (MODE === 'replay') cmd.appendChild(replayBar());
		else { bar.appendChild(btn('Menu', 'grey', () => optionsMenu(), 'menu')); cmd.appendChild(bar); }
		if (mine && V.phase === 'setup' && !me.setup) cmd.appendChild(h('div', 'hint', 'Press Basic Pokémon in your hand: the first two go to Active A and B, the rest to your Bench. Then Ready.'));
	}
	// the log
	const log = h('div', 'pe-log'); el.log = log; log.setAttribute('aria-label', 'Battle log');
	for (const e of V.log) log.appendChild(h('div', e.k, esc(e.msg)));
	el.table.append(opps, mePanel, hand, cmd, log);
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
	if (ui.pick) { if (ui.pick.keys.has(keyOf(loc))) { play('cardSlide1'); ui.pick.cb(loc); if (!ui.pick) render(); } else if (at(V, loc)) inspect(def(at(V, loc)), at(V, loc), loc); return; }
	const k = at(V, loc); if (!k) return;
	pokeMenu(loc);
}
const isBasic = c => (c.kind === 'pokemon' ? c.stage === 0 : !!c.fossil);
function playable(c, me) {
	if (V.phase === 'setup') return isBasic(c);
	if (isBasic(c)) return me.active.includes(null) || me.bench.includes(null);
	if (c.kind === 'pokemon') return [...me.active, ...me.bench].some(k => k && def(k).name === c.evolvesFrom);
	return c.kind !== 'supporter' || (!me.flags.supporter && !me.noSupporter);
}
function onHand(i) {
	const you = YOU(), me = you != null ? V.players[you] : null;
	if (!me || !me.hand) return;
	const c = card(me.hand[i]);
	if (MODE === 'normal' && V.phase === 'setup' && !me.setup && isBasic(c)) {
		const s = ui.setup, a = s.active.indexOf(i), b = s.bench.indexOf(i);
		if (a >= 0) s.active.splice(a, 1); else if (b >= 0) s.bench.splice(b, 1); else if (s.active.length < 2) s.active.push(i); else if (s.bench.length < 4) s.bench.push(i);
		play('cardSlide1'); render(); return;
	}
	const acts = [];
	if (myTurn()) {
		if (isBasic(c)) acts.push(['Play', () => pick(`Play ${c.name}: choose an empty slot`, [...[0, 1].filter(n => !me.active[n]).map(idx => ({ seat: you, zone: 'active', idx })), ...me.bench.map((k, idx) => (k ? null : { seat: you, zone: 'bench', idx })).filter(Boolean)], to => send({ t: 'playBasic', hand: i, to: { zone: to.zone, idx: to.idx } }))]);
		else if (c.kind === 'pokemon') acts.push(['Evolve', () => pick(`Evolve into ${c.name}: choose your ${c.evolvesFrom}`, locsOf(V, you).filter(l => def(at(V, l)).name === c.evolvesFrom), l => send({ t: 'evolve', hand: i, at: l }))]);
		else acts.push(['Play', () => playTrainer(i, c)]);
	}
	inspect(c, null, null, acts);
}
function playTrainer(i, c) {
	const you = YOU(), f = c.fx, go = args => send({ t: 'trainer', hand: i, args });
	const own = locsOf(V, you), named = l => !f.names || f.names.includes(def(at(V, l)).name);
	if (f.k === 'healOne') pick(`${c.name}: choose one of your damaged Pokémon`, own.filter(l => at(V, l).dmg > 0 && (!f.type || def(at(V, l)).cardType === f.type)), l => go({ at: l }));
	else if (f.k === 'flipAttach') pick(`${c.name}: choose one of your ${f.type} Pokémon`, own.filter(l => def(at(V, l)).cardType === f.type), l => go({ at: l }));
	else if (f.k === 'returnActive' || f.k === 'gatherEnergy') pick(`${c.name}: choose your ${f.names.join(' or ')} in an Active slot`, own.filter(l => l.zone === 'active' && named(l)), l => go({ at: l }));
	else if (f.k === 'attachNamed') pick(`${c.name}: choose your ${f.names.join(' or ')}`, own.filter(named), l => go({ at: l }));
	else if (f.k === 'driveOff') pick(`${c.name}: choose an opposing Active Pokémon (its owner picks the replacement)`, oppSeats(V).filter(s => V.players[s].bench.some(Boolean)).flatMap(s => locsOf(V, s, ['active'])), l => go({ target: l }));
	else if (f.k === 'revealHand' || f.k === 'redCard') chooseOpponent(`${c.name}: choose an opponent`, s => go({ opp: s }));
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
	pick(`Attach your ${V.players[you].zone.cur} Energy: choose one of your Pokémon`, locsOf(V, you).filter(l => !def(at(V, l)).fossil), l => send({ t: 'attach', at: l }));
}
function describeCmd(k, cmd) {
	const a = def(k).attacks[cmd.attack];
	return a.name + (cmd.target ? ' → ' + pokeLabel(V, cmd.target) : '');
}
function chooseAttack(slot, i) {
	const you = YOU(), me = V.players[you], k = me.active[slot], a = def(k).attacks[i];
	const cmd = { attack: i, target: null, args: {} }, steps = [];
	const has = x => a.fx.some(f => f.k === x), bench = locsOf(V, you, ['bench']);
	if (a.target !== 'none') steps.push(next => pick(`${a.name} (${a.combatType}): choose a target`, targetsOf(V, you, a), loc => { cmd.target = loc; next(); }, { attack: a }));
	if (has('switchSelf')) { if (!bench.length) { toast(`${a.name} needs a Benched Pokémon to switch with.`); return; } steps.push(next => pick(`${a.name}: choose the Benched Pokémon to switch in`, bench, loc => { cmd.args.bench = loc.idx; next(); })); }
	if (has('ownBenchDamage') && bench.length) steps.push(next => pick(`${a.name}: choose one of your Benched Pokémon to take its damage`, bench, loc => { cmd.args.bench = loc.idx; next(); }));
	if (has('copyAttack')) steps.push(next => pick(`${a.name}: choose an opposing Pokémon whose attack to copy`, oppSeats(V).flatMap(s => locsOf(V, s)), loc => {
		const list = h('div', 'pe-list');
		def(at(V, loc)).attacks.forEach((ca, n) => { const o = h('button', 'pe-opt', `${esc(ca.name)} ${ty(ca.combatType)} <span class="d">${ca.damage || ''}</span>`); o.type = 'button'; const ok = !ca.fx.some(f => f.k === 'copyAttack') && E.canPay(k.energy, ca.cost); o.disabled = !ok; if (!ok) o.insertAdjacentHTML('beforeend', '<span class="why">not enough Energy</span>'); o.addEventListener('click', () => { closeAll(); cmd.args.from = loc; cmd.args.attack = n; next(); }); list.appendChild(o); });
		modal(list, { title: `Copy which attack of ${def(at(V, loc)).name}?` });
	}));
	let n = 0;
	const next = () => { if (n < steps.length) steps[n++](next); else { ui.cmds[slot] = { uid: k.uid, cmd, text: describeCmd(k, cmd) }; play('cardSlide2'); closeAll(); render(); } };
	closeAll(); next();
}
function useAbility(loc) {
	const you = YOU(), k = at(V, loc), ab = def(k).ability, f = ab.fx, go = args => send({ t: 'ability', at: loc, args });
	const oa = oppSeats(V).flatMap(s => locsOf(V, s, ['active']));
	if (f.k === 'ping') pick(`${ab.name}: choose any opposing Pokémon`, oppSeats(V).flatMap(s => locsOf(V, s)), l => go({ target: l }));
	else if (f.k === 'coinSleep' || f.k === 'poisonActive') pick(`${ab.name}: choose an opposing Active Pokémon`, oa, l => go({ target: l }));
	else if (f.k === 'driveOff') pick(`${ab.name}: choose an opposing Active Pokémon`, oa.filter(l => V.players[l.seat].bench.some(Boolean)), l => go({ target: l }));
	else if (f.k === 'pullBenchBasic') pick(`${ab.name}: choose the opposing Active Pokémon that leaves`, oa, l => pick(`${ab.name}: choose that player's Benched Basic Pokémon to bring up`, locsOf(V, l.seat, ['bench']).filter(b => def(at(V, b)).stage === 0), b => go({ target: l, bench: b.idx })));
	else if (f.k === 'attachZoneActiveType') pick(`${ab.name}: choose one of your ${f.type} Pokémon in an Active slot`, locsOf(V, you, ['active']).filter(l => def(at(V, l)).cardType === f.type), l => go({ at: l }));
	else { closeAll(); go({}); }
}
function pokeMenu(loc) {
	const you = YOU(), k = at(V, loc), c = def(k), acts = [];
	if (myTurn() && loc.seat === you) {
		const me = V.players[you];
		if (loc.zone === 'active') {
			c.attacks.forEach((a, i) => { const why = attackWhy(V, you, k, a) || (a.target !== 'none' && !targetsOf(V, you, a).length ? 'no legal target' : null); acts.push([`${a.cost.map(x => en(x)).join('')} ${esc(a.name)} ${ty(a.combatType)} <span class="d">${a.damage || ''}</span>`, () => chooseAttack(loc.idx, i), why, 'atk' + i]); });
			if (ui.cmds[loc.idx]) acts.push(['Pass instead (clear its command)', () => { ui.cmds[loc.idx] = null; closeAll(); render(); }]);
			if (!c.fossil && me.bench.some(Boolean)) { const cost = Math.max(0, c.retreat - me.flags.retreatLess); acts.push([`Retreat <span class="why">costs ${cost} Energy</span>`, () => pick(`Retreat ${c.name}: choose the Benched Pokémon to switch in`, locsOf(V, you, ['bench']), b => send({ t: 'retreat', slot: loc.idx, bench: b.idx })), me.flags.retreated ? 'already retreated this turn' : k.energy.length < cost ? 'not enough Energy' : null]); }
		} else for (const s of [0, 1]) if (!me.active[s]) acts.push([`Move up to Active ${SLOT[s]}`, () => { closeAll(); send({ t: 'promote', slot: s, bench: loc.idx }); }]);
		if (me.zone.cur && !me.flags.attached && !c.fossil) acts.push([`Attach ${en(me.zone.cur)} ${me.zone.cur} Energy`, () => { closeAll(); send({ t: 'attach', at: loc }); }]);
		if (c.ability && !c.ability.fx.passive) acts.push([`Use Ability: ${esc(c.ability.name)}`, () => useAbility(loc), k.abilityUsed === V.turn ? 'already used this turn' : c.ability.fx.active && loc.zone !== 'active' ? 'must be in an Active slot' : null]);
		if (c.fossil) acts.push(['Discard from play', () => { closeAll(); send({ t: 'discardFossil', at: loc }); }]);
	}
	inspect(c, k, loc, acts);
}
function finishSetup() {
	if (send({ t: 'setup', active: ui.setup.active.slice(), bench: ui.setup.bench.slice() })) ui.setup = { active: [], bench: [] };
}
function execute() {
	if (!myTurn()) return;
	const you = YOU(), me = V.players[you], cmds = [0, 1].map(i => (ui.cmds[i] ? ui.cmds[i].cmd : null));
	const could = [0, 1].some(i => !cmds[i] && me.active[i] && def(me.active[i]).attacks.some(a => !attackWhy(V, you, me.active[i], a) && (a.target === 'none' || targetsOf(V, you, a).length)));
	const go = () => { closeAll(); if (send({ t: 'execute', commands: cmds })) { ui.cmds = [null, null]; play('whoosh'); render(); } };
	if (!could) { go(); return; }
	const box = h('div', '', `<div class="pe-note">${[0, 1].map(i => `Active ${SLOT[i]}: ${me.active[i] ? esc(def(me.active[i]).name) + ' → ' + (ui.cmds[i] ? esc(ui.cmds[i].text) : '<b class="orange">Pass</b>') : 'empty'}`).join('<br>')}<br><br>An Active Pokémon that could attack is passing.</div>`);
	box.appendChild(btn('Execute', 'red wide b-go', go, 'exec2'));
	modal(box, { title: 'Execute?' });
}

// ------------------------------------------------------------------ a card, read closely
function inspect(c, k, loc, acts = []) {
	const wrap = h('div', '');
	const body = h('div', 'pe-insp');
	const big = h('div', 'big', `<div style="font-size:26px">${esc(c.name)}</div><div class="art">${artHtml(c)}</div>` +
		(c.kind === 'pokemon' ? `<div>${c.fossil ? 'Fossil' : c.stage === 0 ? 'Basic' : 'Stage ' + c.stage}${c.evolvesFrom ? ' · evolves from ' + esc(c.evolvesFrom) : ''}</div><div style="font-size:24px;color:#b3261e">${k ? Math.max(0, k.hp - k.dmg) + ' / ' : ''}${c.hp} HP</div>${c.ex ? '<div>Pokémon ex · 2 points</div>' : ''}` : `<div>${c.fossil ? 'Item · fossil' : cap(c.kind)}</div>`));
	big.style.setProperty('--c', `var(--t-${c.kind === 'pokemon' ? c.cardType : 'Colorless'})`);
	const info = h('div', 'info');
	const orig = t => (ui.showOriginal && t ? `<div class="orig">Original: ${tx(t)}</div>` : '');
	let html = '';
	if (c.kind === 'pokemon') {
		html += `<div class="row"><span class="lbl">Card Type</span> ${ty(c.cardType)} <span class="lbl">(Energy and card effects)</span></div>`;
		html += `<div class="row"><span class="lbl">Combat Type${c.combatTypes.length > 1 ? 's' : ''}</span> ${c.combatTypes.map(ty).join(' ')} <span class="lbl">(what attacks are strong or weak against)</span></div>`;
		html += `<div class="row"><span class="lbl">Retreat</span> ${c.retreat}${c.weakness ? ` · <span class="lbl">printed Weakness ${esc(c.weakness)} (not used here)</span>` : ''}</div>`;
		if (k) html += `<div class="row"><span class="lbl">Energy</span> ${k.energy.map(e => en(e)).join('') || 'none'}${k.status.length ? ` · ${k.status.map(cap).join(', ')}` : ''}${k.fx.length ? ` · ${k.fx.map(f => FX_LABEL[f.k] || f.k).join(', ')}` : ''}</div>`;
		if (c.ability) html += `<h4>Ability: ${esc(c.ability.name)}</h4><div>${tx(c.ability.adapted)}</div>${orig(c.ability.text)}`;
		for (const a of c.attacks) html += `<h4>${a.cost.map(x => en(x)).join('')} ${esc(a.name)} ${a.damage ? `<span class="money">${a.damage}${a.damageMode === 'plus' ? '+' : a.damageMode === 'times' ? '×' : ''}</span>` : ''} ${ty(a.combatType)}</h4>${a.adapted ? `<div>${tx(a.adapted)}</div>` : ''}${orig(a.text)}`;
		if (c.fossil) html += `<div>${tx(c.adapted)}</div>${orig(c.text)}`;
	} else html += `<div>${tx(c.adapted)}</div>${orig(c.text)}`;
	if (loc) html += `<div class="row lbl" style="margin-top:8px">${esc(pokeLabel(V, loc))}</div>`;
	info.innerHTML = html;
	body.append(big, info); wrap.appendChild(body);
	if (acts.length) {
		const list = h('div', 'pe-list'); list.style.marginTop = '10px';
		for (const [label, fn, why, k2] of acts) { const o = h('button', 'pe-opt', label + (why ? `<span class="why">${esc(why)}</span>` : '')); o.type = 'button'; if (k2) o.dataset.k = k2; o.disabled = !!why; o.addEventListener('click', () => { play('button'); fn(); }); list.appendChild(o); }
		wrap.appendChild(list);
	}
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

function mainMenu() {
	closeAll();
	const box = h('div', 'pe-list'), saved = SV.loadRun();
	if (saved) box.appendChild(btn(`Continue match <span class="muted">(${esc(E.labelOf(saved.S))})</span>`, 'green big', () => resume(saved), 'continue'));
	box.appendChild(btn('New match', 'blue big b-new', () => newMatchMenu(), 'new'));
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
	begin({ config: { seed, players }, actions: [], you: 0 }, E.createGame({ seed, players }));
}
function begin(g, state) {
	closeAll(); clearTimeout(aiTimer); aiTimer = 0; stopReplayTimer();
	MODE = 'normal'; G = g; S = state; R = null; overShown = false;
	ui.cmds = [null, null]; ui.pick = null; ui.setup = { active: [], bench: [] }; ui.prevDmg = new Map();
	persist(); sync();
	startPublishing();
}
// ------------------------------------------------------------------ friends watching (a signed-in player's match is live)
const SPEC_STATUS = { connecting: 'Connecting…', live: 'Live.', 'not-live': 'No match right now. Waiting for one to start…', over: 'That match is over. Waiting for the next one…', offline: 'Offline. Trying again…', login: 'Sign in to watch a friend\'s match.', forbidden: 'Only friends can watch.', full: 'That match has as many spectators as it can take.' };
/** What friends are sent: the spectator's view (no hand, no deck order), the seat to draw at the bottom, a short log. */
function snapshot() {
	if (MODE !== 'normal' || !S || !G) return null;
	const v = E.view(S, null);
	return { game: 'pocket', n: S.actions, you: G.you, view: { ...v, log: v.log.slice(-80) } };
}
function stopPublishing() { if (publisher) { try { publisher.stop(); } catch (e) { /* already stopped */ } publisher = null; } live.watchers = 0; live.names = []; }
function startPublishing() {
	stopPublishing();
	if (!net || !net.isLoggedIn()) return;
	try {
		publisher = net.startPublisher(() => snapshot(), () => 'Pocket Enhanced · ' + (S ? E.labelOf(S) : ''));
		publisher.onWatchers((n, names) => { live.watchers = n; live.names = names || []; if (MODE === 'normal' && V) render(); });
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
	if (MODE === 'normal' && S && !S.over && YOU() != null && !S.players[YOU()].eliminated) box.appendChild(btn('Concede', 'red', () => { closeAll(); send({ t: 'concede' }); }, 'concede'));
	if (MODE === 'replay') box.appendChild(btn('Copy replay link', 'blue', () => shareReplay(R.recipe), 'share'));
	box.appendChild(btn('Leave to the menu', 'orange', () => { leave(); }, 'leave'));
	modal(box, { title: 'Menu' });
}
function leave() {
	if (MODE === 'spectate') { try { spec && spec.stop(); } catch (e) { /* gone */ } location.href = '/pocketenhanced/'; return; }
	clearTimeout(aiTimer); aiTimer = 0; stopReplayTimer(); persist(); stopPublishing();
	MODE = 'normal'; G = S = V = R = null; ui.pick = null; render(); mainMenu();
}
function finish() {
	SV.clearRun();
	const w = S.over.winner, summary = { players: S.players.map(p => ({ name: p.name, points: p.points })), winner: w != null ? S.players[w].name : null, turns: S.turn };
	SV.addReplay(G.config, G.actions, summary);
	play(w === YOU() ? 'win' : 'negative');
	if (publisher) { const p = publisher; publisher = null; setTimeout(() => { try { p.finish({ won: w === YOU() }).catch(() => {}); } catch (e) { /* offline */ } }, 1200); }
	const box = h('div', '');
	box.appendChild(h('div', 'pe-note', `${esc(w != null ? S.players[w].name + ' wins' : 'Nobody wins')} — ${esc(S.over.why)}<br><br>${S.players.map(p => `${esc(p.name)}: ${p.points} point${p.points === 1 ? '' : 's'}`).join(' · ')}`));
	const list = h('div', 'pe-list');
	const recipe = SV.recipeOf(G.config, G.actions);
	list.appendChild(btn('New match', 'blue big b-again', () => newMatchMenu(), 'new'));
	list.appendChild(btn('Watch the replay', 'grey', () => startReplay(recipe), 'watch'));
	list.appendChild(btn('Copy replay link', 'grey', () => shareReplay(recipe), 'share'));
	list.appendChild(btn('Menu', 'orange', () => leave(), 'leave'));
	box.appendChild(list);
	modal(box, { title: w === YOU() ? 'You win!' : 'Match over', noClose: true });
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
	const d = start || { name: 'My deck', ...starterDeck(STARTERS[0].id) };
	const st = { name: d.name, deck: d.deck.slice(), energy: d.energy.slice(), filter: 'All' };
	const box = h('div', '');
	const FILTERS = ['All', 'Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless', 'Trainers'];
	const ENERGY = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'];
	const count = id => st.deck.filter(x => card(x).name === card(id).name).length;
	const draw = () => {
		const poolY = box.querySelector('.pool') ? box.querySelector('.pool').scrollTop : 0;
		box.innerHTML = '';
		const seg = h('div', 'pe-seg'); for (const f of FILTERS) seg.appendChild(btn(f, 'grey' + (st.filter === f ? ' on' : ''), () => { st.filter = f; draw(); pad && pad.refresh(true); }, 'f' + f)); box.appendChild(seg);
		const db = h('div', 'pe-db'), pool = h('div', 'pool');
		for (const c of CARDS) {
			if (st.filter === 'Trainers' ? c.kind === 'pokemon' : st.filter !== 'All' && !(c.kind === 'pokemon' && c.cardType === st.filter)) continue;
			const n = count(c.id), b = handCard(c, null, n ? `<span class="have">${n}</span>` : ''); b.classList.add('small'); b.dataset.k = 'c' + c.id;
			b.addEventListener('click', () => { if (st.deck.length >= E.LIMITS.deck) toast('A deck is 20 cards.'); else if (count(c.id) >= E.LIMITS.copies) toast('Two cards of a name at most.'); else { st.deck.push(c.id); play('cardSlide1'); draw(); } });
			pool.appendChild(b);
		}
		const mine = h('div', 'mine');
		const name = h('input'); name.type = 'text'; name.maxLength = 24; name.value = st.name; name.setAttribute('aria-label', 'Deck name'); name.style.cssText = 'font:inherit;font-size:22px;padding:6px 10px;border-radius:10px;border:0'; name.addEventListener('input', () => { st.name = name.value; });
		mine.appendChild(name);
		const es = h('div', 'pe-seg'); for (const e of ENERGY) { const b = btn(en(e), 'grey' + (st.energy.includes(e) ? ' on' : ''), () => { if (st.energy.includes(e)) st.energy = st.energy.filter(x => x !== e); else if (st.energy.length < 3) st.energy.push(e); else toast('Three Energy types at most.'); draw(); }, 'e' + e); b.setAttribute('aria-label', e + ' Energy'); b.style.padding = '6px 9px'; es.appendChild(b); } mine.appendChild(es);
		const err = E.deckError(st.deck, st.energy);
		mine.appendChild(h('div', 'pe-note', `${st.deck.length} / 20 cards${err ? ` · <span class="red">${esc(err)}</span>` : ' · <span style="color:var(--green)">legal</span>'}`));
		const rows = h('div', 'rows'), seen = new Set();
		for (const id of st.deck.slice().sort((a, b) => (card(a).kind === 'pokemon' ? 0 : 1) - (card(b).kind === 'pokemon' ? 0 : 1) || card(a).name.localeCompare(card(b).name))) {
			const c = card(id); if (seen.has(c.name)) continue; seen.add(c.name);
			const r = h('button', 'rowb', `${c.kind === 'pokemon' ? ty(c.cardType) : ''} ${esc(c.name)}<span class="x">×${count(id)} −</span>`); r.type = 'button'; r.dataset.k = 'm' + id; r.setAttribute('aria-label', `Remove one ${c.name}`);
			r.addEventListener('click', () => { const i = st.deck.findIndex(x => card(x).name === c.name); st.deck.splice(i, 1); draw(); });
			rows.appendChild(r);
		}
		mine.appendChild(rows);
		const bar = h('div', 'pe-seg');
		const sv = btn('Save deck', 'green', () => { const e = SV.saveDeck(st); toast(e ? cap(e) + '.' : `Saved "${st.name}".`); draw(); }, 'save'); sv.disabled = !!err; bar.appendChild(sv);
		bar.appendChild(btn('Clear', 'red', () => { st.deck = []; draw(); }, 'clear'));
		bar.appendChild(btn('Load…', 'grey', () => { const l = h('div', 'pe-list'); for (const x of allDecks()) { const o = h('button', 'pe-opt', esc(x.name)); o.type = 'button'; o.addEventListener('click', () => { const g = x.get(); closeModal(); st.deck = g.deck; st.energy = g.energy; st.name = x.id.startsWith('my:') ? x.id.slice(3) : x.name + ' copy'; draw(); }); l.appendChild(o); if (x.id.startsWith('my:')) { const del = h('button', 'pe-opt', `Delete ${esc(x.id.slice(3))}`); del.type = 'button'; del.style.color = '#f0b9b4'; del.addEventListener('click', () => { SV.deleteDeck(x.id.slice(3)); closeModal(); toast('Deleted.'); }); l.appendChild(del); } } modal(l, { title: 'Load a deck' }); }, 'load'));
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
		if (m) return list.find(e => e.matches('.b-go, .b-again, .b-new, [data-k=continue], [data-k^=atk]')) || list[0];
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
	addEventListener('keydown', ev => { if (ev.ctrlKey || ev.metaKey || ev.altKey || isTyping(ev.target && ev.target.tagName ? ev.target : undefined)) return; if (ev.key === 'Escape') cancel(); });
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
	focus: () => (pad && pad.ringOn ? pad.focus : null),
	recipe: () => (MODE === 'replay' ? R.recipe : G ? SV.recipeOf(G.config, G.actions) : null),
	live: () => ({ ...live, publishing: !!publisher }),
	replay: recipe => startReplay(recipe),
	seek: n => seek(n),
	menu: () => mainMenu(),
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
	let shown = false;
	if (SPECTATE) { startSpectating(); shown = true; }
	else if (REPLAY_PARAM) { try { shown = startReplay(JSON.parse(await unpackString(REPLAY_PARAM))); } catch (e) { shown = false; } if (!shown) toast('That replay link could not be read.'); }
	if (!shown) mainMenu();
	window.__pocket.ready = true;
}
boot().catch(e => { console.error(e); const l = document.getElementById('boot-loading'); if (l) l.textContent = 'Pocket Enhanced failed to load: ' + e.message; });
