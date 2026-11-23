// mmmode.js — MYSTERY MAZE on the board (owner, 2026-11-23; Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 7). The run is
// mm/turn.js (exact, action by action: everything moves when you do); this file is the page: Poketactica's own board
// drawn from what you have explored (walls as low blocks, water and lava as the terrain draws them), the camera on the
// leader, a bar with the floor, HP, belly, purse and bag, a minimap, and the leader's commands.
//   keyboard / pad: arrows step (two together: the diagonal between them) · Z attack the tile in front / take the stairs /
//                   take a shop's item · C moves · V the bag · X then a direction: turn on the spot · Enter the menu
//                   (wait a turn, tactics, pay, give up) · Q / E turn the board
//   touch: tap a tile next to you to step or strike; one further off to walk there; yourself for the menu; the bar's
//          buttons: Attack, Moves, Bag, Wait, Menu
// Walking into a wild Pokémon turns to face it and attacks. Walking into a wall only turns you.
// A run is { seed, dungeon, party, bag, stars, acts }: the leader's actions in order (replays, resume and spectating
// re-run them: stage 9).
import * as MM from './mm/turn.js';
import { DIR8, DIR8_KEYS, cheb, hitTiles8 } from './mm/shapes8.js';
import { ITEMS, itemName, usable, throwable, throwBlock, LOB_RANGE } from './mm/items.js';
import { TRAPS } from './mm/traps.js';
import { ATTACK_ID, moveFor, aimsOf, moveBlock } from './mm/combat.js';
import { aimsAtFoes, isFoe } from './mm/ai.js';
import { T_SHOP } from './mm/gen.js';
import { dungeonById } from './mm/dungeons.js';
import { slimFig } from './replay.js';

const STEP_S = 0.13, CHORD_MS = 45, ZOOM = 5, AUTO_S = 0.1;
const TACTIC_NAME = { follow: 'Stay close', hunt: 'Go after foes', away: 'Keep away', wait: 'Wait here' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** ctx: as tdmode.js's, plus onLost(fallen entry) (a figurine of yours is gone: bury it now) and onOver(run). */
export function createMmMode(ctx) {
	const { P, data, $ } = ctx;
	const M = { S: null, acts: [], seed: null, dungeon: null, party: [], bag: [], stars: 0, bar: null, seenN: -1, floor: 0, turn: false, aim: null, auto: null, tw: {}, pos: {}, msgs: [], chord: null, shownOver: false, buried: 0 };
	const nameOf = (sp) => (data.species[sp] || {}).name || sp;
	const moveName = (id) => (id === ATTACK_ID ? 'Attack' : (data.moves[id] || {}).name || id);
	const L = () => MM.leaderOf(M.S);
	const say = (t) => { M.msgs.push(t); if (M.msgs.length > 3) M.msgs.shift(); };

	// ---- the board: what has been explored. Walls stand one level up; unexplored ground is not there at all.
	function board() {
		const S = M.S, F = S.F, n = F.w * F.h, height = new Array(n).fill(null), ground = new Array(n).fill(null);
		let seen = 0;
		for (let i = 0; i < n; i++) {
			if (!S.seen[i]) continue;
			seen++;
			const k = F.terrain[i] & 3;
			height[i] = k === 0 ? 1 : 0;
			if (k >= 2) ground[i] = F.water ? 'water' : 'lava';
		}
		const map = { w: F.w, h: F.h, height, ground, theme: M.dungeon.theme || 'cave', base: { x: 0, y: 0 } };
		// (the page reads the rules' board for everything but the ground it draws)
		P.S = Object.assign(Object.create(S.B), { map });
		if (!P.disp) P.disp = { units: {}, geo: S.B.geo };
		ctx.buildScene(map);
		M.seenN = seen; M.floor = S.floorNo;
	}
	const seenCount = () => { let n = 0; for (const v of M.S.seen) if (v) n++; return n; };

	// ---- the units, as the page draws them: your party always, others while in sight; steps glide
	function sync() {
		const S = M.S, D = P.disp, now = performance.now() / 1000, F = S.F, vis = new Set(MM.sightNow(S)), shown = new Set();
		for (const u of S.units) {
			if (u.hp <= 0 || (u.side !== 'p' && !S.lit && !vis.has(u.y * F.w + u.x))) continue;
			shown.add(u.uid);
			const d = D.units[u.uid] || (D.units[u.uid] = { anim: 'Idle', t0: 0, flash: 0 });
			const tw = M.tw[u.uid];
			if (tw && now < tw.t1) { const k = (now - tw.t0) / (tw.t1 - tw.t0); d.wx = [tw.from[0] + (u.x - tw.from[0]) * k, tw.from[1] + (u.y - tw.from[1]) * k]; if (d.anim === 'Idle') d.anim = 'Walk'; }
			else { d.wx = null; delete M.tw[u.uid]; if (d.anim === 'Walk') d.anim = 'Idle'; }
			if (d.anim === 'Attack' && now - d.t0 > 0.4) d.anim = 'Idle';
			if (d.anim === 'Hurt' && now - d.t0 > 0.25) d.anim = 'Idle';
			if (d.anim === 'Idle' && (u.nap || u.status === 'slp')) d.anim = 'Sleep';
			else if (d.anim === 'Sleep' && !(u.nap || u.status === 'slp')) d.anim = 'Idle';
			d.x = u.x; d.y = u.y; d.hp = u.hp; d.facing = DIR8_KEYS[u.dir]; d.alive = true;
			M.pos[u.uid] = [u.x, u.y];
		}
		for (const uid of Object.keys(D.units)) if (!shown.has(uid)) delete D.units[uid];
	}

	// ---- the run's events, shown and said
	function play(evs) {
		const D = P.disp, now = performance.now() / 1000, S = M.S;
		const who = (uid) => { const u = MM.unit(S, uid); return u ? nameOf(u.species) : 'It'; };
		for (const e of evs) {
			const d = e.uid && D.units[e.uid];
			if (e.t === 'step' || e.t === 'moved' || e.t === 'warp') { if (M.pos[e.uid] && e.t === 'step') M.tw[e.uid] = { from: M.pos[e.uid], t0: now, t1: now + STEP_S }; M.pos[e.uid] = [e.x, e.y]; if (e.t === 'warp') say(who(e.uid) + ' was sent somewhere else!'); }
			else if (e.t === 'use') { if (d) { d.anim = 'Attack'; d.t0 = now; } const u = MM.unit(S, e.uid); if (u && e.move !== ATTACK_ID) { ctx.moveFx(e, u); say(who(e.uid) + ' used ' + moveName(e.move) + '!'); } }
			else if (e.t === 'hit') { const v = D.units[e.target]; if (v) { v.flash = 1; v.anim = 'Hurt'; v.t0 = now; } ctx.pop(e.target, '-' + e.dmg, e.crit ? '#ff7a5a' : e.eff > 1 ? '#ffd23c' : e.eff > 0 && e.eff < 1 ? '#b8c2c6' : '#ffffff'); if (e.target === S.leader) ctx.shake(0.25); }
			else if (e.t === 'hurt') { ctx.pop(e.uid, '-' + e.n, '#c8a0ff'); if (e.why === 'hunger' && e.uid === S.leader) say('You are starving!'); }
			else if (e.t === 'heal') ctx.pop(e.uid, '+' + e.n, '#7cf08a');
			else if (e.t === 'miss' && e.target) ctx.pop(e.target, 'Miss', '#cccccc');
			else if (e.t === 'immune') ctx.pop(e.uid, 'Immune', '#cccccc');
			else if (e.t === 'status') { ctx.pop(e.uid, e.st.toUpperCase(), '#e0b36b'); }
			else if (e.t === 'cured') ctx.pop(e.uid, 'Cured', '#7cf08a');
			else if (e.t === 'confused') ctx.pop(e.uid, 'CONFUSED', '#e0b36b');
			else if (e.t === 'boost') ctx.pop(e.uid, Object.entries(e.changes).map(([k, n]) => (n > 0 ? '+' : '') + n + ' ' + k.toUpperCase()).join(' '), Object.values(e.changes)[0] > 0 ? '#7cf08a' : '#e0b36b');
			else if (e.t === 'ko') { const at = M.pos[e.uid]; if (at) ctx.fx({ k: 'ring', at, r: 1, t: 0, dur: 0.4, color: '#ffffff' }); }
			else if (e.t === 'lost') { ctx.sfx.error(); if (e.recruit) say(nameOf(e.species) + ' fell.'); else { say(nameOf(e.species) + ' is gone for good.'); ctx.banner(nameOf(e.species) + ' is gone'); } }
			else if (e.t === 'leader') { say(who(e.uid) + ' leads now.'); ctx.banner(who(e.uid) + ' leads now'); }
			else if (e.t === 'floor') { ctx.banner(`${M.dungeon.name} · B${e.n}F`); M.msgs = []; M.tw = {}; M.pos = {}; }
			else if (e.t === 'pickup') { ctx.sfx.coin && ctx.sfx.coin(); say(e.id === 'stars' ? `Picked up ${e.n} stars.` : `Picked up ${itemName({ id: e.id, n: e.n })}.`); }
			else if (e.t === 'bagfull') say(`The bag is full: ${itemName({ id: e.id })} stays.`);
			else if (e.t === 'item') say(e.how === 'throw' ? `Threw ${itemName({ id: e.id })}.` : `Used ${itemName({ id: e.id })}.`);
			else if (e.t === 'nothing') say('Nothing happened.');
			else if (e.t === 'belly') say('Belly: ' + e.n + '.');
			else if (e.t === 'hungry') { ctx.sfx.error(); say(e.n ? 'Getting hungry… (belly ' + e.n + ')' : 'Your belly is empty!'); }
			else if (e.t === 'trap') { ctx.sfx.error(); say(e.dud ? `A ${TRAPS[e.kind].name}! …but nothing happened.` : `A ${TRAPS[e.kind].name}!`); ctx.shake(0.3); }
			else if (e.t === 'trapseen') say(`Found a ${TRAPS[e.kind].name}.`);
			else if (e.t === 'house') { ctx.banner('It\'s a Monster House!'); ctx.sfx.error(); ctx.shake(0.6); }
			else if (e.t === 'thief') { ctx.banner('Thief!'); ctx.sfx.error(); say('The shopkeeper is coming for you!'); }
			else if (e.t === 'angry') say('The shopkeeper is furious!');
			else if (e.t === 'take') say(`${itemName({ id: e.id })}: ${e.price} stars. You owe ${e.owed}.`);
			else if (e.t === 'paid') { ctx.sfx.coin && ctx.sfx.coin(); say(`Paid ${e.n} stars.`); }
			else if (e.t === 'putback') say(`Put back ${itemName({ id: e.id })}.`);
			else if (e.t === 'recruit') { ctx.sfx.coin && ctx.sfx.coin(); ctx.banner(nameOf(e.species) + (e.joined ? ' joined you!' : ' will wait outside')); say(nameOf(e.species) + (e.joined ? ' joined the party!' : ' wants to join: it waits outside.')); }
			else if (e.t === 'woke') ctx.pop(e.uid, '!', '#ffffff');
			else if (e.t === 'asleep' && e.uid === S.leader) say('Zzz…');
			else if (e.t === 'stumble') say('You stumble about, confused.');
			else if (e.t === 'sealed') say(who(e.uid) + '\'s ' + moveName(e.move) + ' is sealed!');
			else if (e.t === 'ppzero') say(who(e.uid) + '\'s ' + moveName(e.move) + ' lost its PP!');
			else if (e.t === 'sticky') say(`${itemName({ id: e.id })} turned sticky!`);
			else if (e.t === 'fell') say('You fell to the next floor!');
			else if (e.t === 'reveal') say('The whole floor is shown.');
			else if (e.t === 'tactic') say(who(e.uid) + ': ' + TACTIC_NAME[e.tactic] + '.');
			else if (e.t === 'level') { ctx.sfx.coin && ctx.sfx.coin(); ctx.pop(e.uid, 'Lv ' + e.level, '#ffd23c'); say(who(e.uid) + ' grew to Lv ' + e.level + (e.moves && e.moves.length ? ' and learned ' + e.moves.map(moveName).join(', ') : '') + '!'); }
			else if (e.t === 'bossdown') { ctx.banner(nameOf(e.species) + ' is down: the stairs are open'); ctx.sfx.coin && ctx.sfx.coin(); }
		}
		// a figurine of yours that fell is gone at once (the permanent-loss rule): the page buries it now
		while (M.buried < S.fallen.length) { if (ctx.onLost) ctx.onLost(S.fallen[M.buried]); M.buried++; }
	}

	// ---- one action of the leader's
	function act(a, quiet) {
		if (!M.S || M.S.over) return false;
		const ev = MM.act(M.S, a, data);
		if (ev[0] && ev[0].t === 'no') { if (!quiet) { ctx.sfx.error(); ctx.toast(cap(ev[0].why)); } return false; }
		M.acts.push(a);
		play(ev);
		refresh();
		if (M.S.over) over();
		return true;
	}
	function refresh() {
		const S = M.S;
		if (S.floorNo !== M.floor || seenCount() !== M.seenN) board();
		const u = L();
		if (u && !M.aim) P.cursor = { x: u.x, y: u.y };
		ctx.follow(true);
		sync(); draw();
	}

	// ---- the bar and the minimap
	function bar() {
		if (M.bar) return M.bar;
		const el = document.createElement('div');
		el.id = 'pt-mm'; el.className = 'bal-panel pt-mm'; el.hidden = true;
		el.addEventListener('click', (ev) => {
			const b = ev.target.closest('[data-act]'); if (!b || !M.S || M.S.over) return;
			ctx.sfx.press();
			if (P.menu) closeMenu();
			if (b.dataset.act === 'attack') confirm();
			else if (b.dataset.act === 'moves') openMoves();
			else if (b.dataset.act === 'bag') openBag();
			else if (b.dataset.act === 'wait') act({ t: 'pass' });
			else if (b.dataset.act === 'menu') openField();
		});
		document.body.appendChild(el);
		// the minimap: its own corner of the screen (top left), so no menu ever covers it
		M.mini = document.createElement('canvas');
		M.mini.id = 'mm-map'; M.mini.className = 'pt-mm-map'; M.mini.width = 112; M.mini.height = 64; M.mini.hidden = true;
		document.body.appendChild(M.mini);
		return (M.bar = el);
	}
	function drawBar() {
		const v = MM.view(M.S), el = bar(), u = L();
		const key = (k) => `<span class="bal-key">${k}</span>`;
		const party = v.units.filter((x) => x.side === 'p').map((x) => `<span class="pt-mm-chip${x.uid === v.leader ? ' is-lead' : ''}" data-uid="${x.uid}">${esc(nameOf(x.species))} <b>${x.hp}</b>/${x.maxHP}${x.status ? ' <i>' + x.status.toUpperCase() + '</i>' : ''}</span>`).join('');
		const html = `<div class="pt-mm-row"><span class="bal-badge bal-blue" id="mm-floor">${esc(v.dungeon)} · B${v.floor}F</span><span class="bal-badge ${v.belly <= 20 ? 'bal-red' : 'bal-green'}" id="mm-belly">🍎 ${v.belly}</span><span class="bal-badge bal-gold" id="mm-stars">★ ${v.stars}</span><span class="bal-badge bal-purple" id="mm-bag">🎒 ${v.bag.length}/20</span>${v.owed ? `<span class="bal-badge bal-orange" id="mm-owed">owe ${v.owed}</span>` : ''}${u ? `<span class="bal-badge bal-grey" id="mm-sp">SP ${u.sp}/${u.maxSP}</span>` : ''}</div>
			<div class="pt-mm-row" id="mm-party">${party}</div>
			<div class="pt-mm-msg" id="mm-msg">${M.msgs.map(esc).join('<br>')}</div>
			<div class="pt-mm-row"><button class="bal-btn bal-sm bal-red" data-act="attack">${underfoot()} ${key('Z')}</button><button class="bal-btn bal-sm bal-blue" data-act="moves">Moves ${key('C')}</button><button class="bal-btn bal-sm bal-purple" data-act="bag">Bag ${key('V')}</button><button class="bal-btn bal-sm bal-grey" data-act="wait">Wait</button><button class="bal-btn bal-sm bal-grey" data-act="menu">Menu</button></div>`;
		if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
		el.hidden = !!P.menu;   // (a menu takes the bar's place while it is open)
		M.mini.hidden = false;
		minimap(v);
	}
	/** What Z does where the leader stands. */
	function underfoot() {
		const S = M.S, u = L();
		if (!u) return 'Attack';
		if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) return 'Stairs';
		if (S.items.some((o) => o.shop && o.x === u.x && o.y === u.y)) return 'Take';
		return 'Attack';
	}
	function minimap(v) {
		const c = M.mini; if (!c) return;
		const g = c.getContext('2d'), k = 2;
		g.clearRect(0, 0, c.width, c.height);
		for (let i = 0; i < v.tiles.length; i++) {
			const t = v.tiles[i]; if (t <= 0) continue;
			g.fillStyle = t === 1 ? '#8f8a7c' : v.water ? '#4a8fe0' : '#e07a3a';
			g.fillRect((i % v.w) * k, Math.floor(i / v.w) * k, k, k);
		}
		const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(x * k - 1, y * k - 1, k + 2, k + 2); };
		for (const o of v.items) dot(o.x, o.y, '#5fe08a');
		for (const t of v.traps) dot(t.x, t.y, '#c070ff');
		if (v.stairs) dot(v.stairs[0], v.stairs[1], '#ffd23c');
		for (const u of v.units) dot(u.x, u.y, u.uid === v.leader ? '#ffffff' : u.side === 'p' ? '#9be7ff' : u.keeper && !u.hostile ? '#ffb36b' : '#ff5a5a');
	}
	/** Highlights: the stairs, items and shown traps on the ground; while aiming, where the move can go and what it would cover. */
	function draw() {
		const S = M.S, F = S.F, extra = [];
		const si = F.stairs[1] * F.w + F.stairs[0];
		if (S.seen[si]) extra.push([F.stairs[0], F.stairs[1], 0xffd23c]);
		for (const o of S.items) if (S.seen[o.y * F.w + o.x]) extra.push([o.x, o.y, o.shop ? 0xffa23c : 0x5fe08a]);
		for (const t of S.traps) if (t.seen) extra.push([t.x, t.y, 0xb04cff]);
		const hl = { extra };
		if (M.aim) { hl.aim = M.aim.aims; hl.area = M.aim.cover(M.aim.aims[M.aim.i]); P.cursor = { x: M.aim.aims[M.aim.i][0], y: M.aim.aims[M.aim.i][1] }; }
		P.hl = hl;
		ctx.rebuildOverlay();
		drawBar();
		const u = L();
		$('hint').innerHTML = S.over || !u ? '' : M.aim ? `<b>${esc(M.aim.title)}</b> · arrows: aim · Z: use · X: back` : M.turn ? 'Press a direction to turn that way · X: never mind' : hintHere(u);
	}
	function hintHere(u) {
		const S = M.S, here = S.items.find((o) => o.x === u.x && o.y === u.y);
		if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) return 'The stairs · Z: go down';
		if (here && here.shop) return `<b>${esc(itemName(here))}</b> · ${here.price} stars · Z: take it`;
		if (S.owed) return `You owe ${S.owed} stars · Enter: pay`;
		return '';
	}

	// ---- stepping
	const dirOf = (v) => DIR8.findIndex(([dx, dy]) => dx === v[0] && dy === v[1]);
	function go(v) {
		const d = dirOf(v), S = M.S, u = L();
		if (d < 0 || !u || S.over) return;
		if (M.aim) { aimMove(v); return; }
		M.auto = null;
		if (M.turn) { M.turn = false; act({ t: 'face', d }, true); return; }
		const o = MM.unitAt(S, u.x + v[0], u.y + v[1]);
		if (o && isFoe(u, o)) { if (u.dir !== d) act({ t: 'face', d }, true); act({ t: 'attack' }); return; }
		if (!act({ t: 'step', d }, true) && u.dir !== d) act({ t: 'face', d }, true);   // (a wall: just turn)
	}
	/** A direction pressed: wait a moment for a second one, and step between the two. */
	function dirInput(v) {
		if (M.chord) {
			clearTimeout(M.chord.t);
			const a = M.chord.v; M.chord = null;
			const sum = [Math.sign(a[0] + v[0]), Math.sign(a[1] + v[1])];
			if (sum[0] || sum[1]) go(sum);
			return;
		}
		M.chord = { v, t: setTimeout(() => { const c = M.chord; M.chord = null; if (c) go(c.v); }, CHORD_MS) };
	}
	/** Walking to a far tile, a step at a time: it stops the moment a foe comes into view or anything else happens. */
	function autoStep() {
		const A = M.auto, S = M.S, u = L();
		if (!A || !u || S.over || P.menu || M.aim) { M.auto = null; return; }
		const foes = () => S.units.filter((o) => isFoe(u, o) && P.disp.units[o.uid]).length;
		const dist = MM.walkMap(S.F, u, A.x, A.y), here = dist[u.y * S.F.w + u.x];
		if (here <= 0 || foes() > A.foes) { M.auto = null; return; }
		const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => MM.canWalk(S.F, u, k) && dist[(u.y + DIR8[k][1]) * S.F.w + u.x + DIR8[k][0]] === here - 1 && !MM.actBlock(S, { t: 'step', d: k }, data));
		const hp = u.hp;
		if (d == null || !act({ t: 'step', d }, true) || L() !== u || u.hp < hp || foes() > A.foes) M.auto = null;
	}

	// ---- aiming a move or a lobbed item
	function startAim(title, aims, cover, use, prefer) {
		if (!aims.length) { ctx.sfx.error(); ctx.toast('Nothing in reach'); return; }
		let i = prefer ? aims.findIndex(([x, y]) => prefer.some(([px, py]) => px === x && py === y)) : -1;
		if (i < 0) i = 0;
		M.aim = { title, aims, cover, use, i };
		P.mode = 'mm-aim';
		draw();
	}
	function aimMove(v) {
		const A = M.aim, [cx, cy] = A.aims[A.i];
		let best = -1, score = Infinity;
		A.aims.forEach(([x, y], k) => {
			const dx = x - cx, dy = y - cy, along = dx * v[0] + dy * v[1];
			if (k === A.i || along <= 0) return;
			const off = Math.abs(dx * v[1] - dy * v[0]), s = along + off * 2;
			if (s < score) { score = s; best = k; }
		});
		if (best >= 0) { A.i = best; ctx.sfx.tab && ctx.sfx.tab(); draw(); }
	}
	function endAim(use) {
		const A = M.aim; M.aim = null; P.mode = 'mm';
		if (use && A) A.use(A.aims[A.i]);
		else refresh();
	}

	// ---- menus (the battle's own command window)
	const closeMenu = () => { P.mode = 'mm'; ctx.setMenu(null); draw(); };
	const menu = (items, title) => { P.mode = 'mm-menu'; M.auto = null; ctx.setMenu(items, title); if (M.bar) M.bar.hidden = true; };
	function openMoves() {
		const S = M.S, u = L();
		const items = u.fig.equipped.map((id) => {
			const m = moveFor(u, id, data), why = (u.sealed || []).includes(id) ? 'It is sealed' : (u.pp[id] || 0) < 1 ? 'No PP left' : u.sp < m.spCost ? 'Not enough SP' : null;
			return { label: `${esc(moveName(id))} <small>${esc(m.type)} · PP ${u.pp[id] || 0} · SP ${m.spCost}</small>`, color: 'bal-blue', off: why, go: () => {
				ctx.setMenu(null);
				startAim(moveName(id), aimsOf(S.F, u, m), ([x, y]) => hitTiles8(S.F, m, u.x, u.y, x, y), ([x, y]) => act({ t: 'move', id, x, y }), aimsAtFoes(S, u, m));
			} };
		});
		items.push({ label: 'Attack <small>no cost · the tile in front</small>', color: 'bal-red', go: () => { closeMenu(); act({ t: 'attack' }); } });
		items.push({ label: 'Back', color: 'bal-grey', go: closeMenu });
		menu(items, `${nameOf(u.species)} · SP ${u.sp}/${u.maxSP}`);
	}
	function openBag() {
		const S = M.S;
		if (!S.bag.length) { ctx.toast('The bag is empty'); return; }
		const items = S.bag.map((it, slot) => ({ label: `${esc(itemName(it))}${it.sticky ? ' <small>sticky</small>' : ''}${it.unpaid ? ` <small>unpaid · ${it.unpaid}★</small>` : ''}`, color: it.sticky ? 'bal-grey' : 'bal-purple', go: () => openItem(slot) }));
		items.push({ label: 'Back', color: 'bal-grey', go: closeMenu });
		menu(items, `Bag ${S.bag.length}/20`);
	}
	function openItem(slot) {
		const S = M.S, it = S.bag[slot], d = ITEMS[it.id] || {}, u = L(), items = [];
		const onCarpet = !!(S.F.terrain[u.y * S.F.w + u.x] & T_SHOP);
		if (usable(it.id)) items.push({ label: d.group === 'orb' ? 'Use' : d.group === 'drink' ? 'Drink' : 'Eat', color: 'bal-green', off: it.sticky && 'It is sticky', go: () => { closeMenu(); act({ t: 'use', slot }); } });
		if (throwable(it.id)) items.push({ label: d.arc ? 'Throw <small>at a tile</small>' : 'Throw <small>the way you face</small>', color: 'bal-orange', off: it.sticky && 'It is sticky', go: () => {
			ctx.setMenu(null);
			if (!d.arc) { P.mode = 'mm'; act({ t: 'throw', slot }); return; }
			const aims = [];
			for (let y = u.y - LOB_RANGE; y <= u.y + LOB_RANGE; y++) for (let x = u.x - LOB_RANGE; x <= u.x + LOB_RANGE; x++) if (!throwBlock(S, u, it, x, y)) aims.push([x, y]);
			startAim('Throw ' + itemName({ id: it.id }), aims, (a) => [a], ([x, y]) => act({ t: 'throw', slot, x, y }), S.units.filter((o) => isFoe(u, o)).map((o) => [o.x, o.y]));
		} });
		if (it.unpaid) items.push({ label: 'Put back', color: 'bal-blue', off: !onCarpet && 'Stand on the shop\'s carpet', go: () => { closeMenu(); act({ t: 'putback', slot }); } });
		items.push({ label: 'Back', color: 'bal-grey', go: openBag });
		menu(items, `${itemName(it)} · ${d.note || ''}`);
	}
	function openField() {
		const S = M.S, u = L(), onStairs = u.x === S.F.stairs[0] && u.y === S.F.stairs[1];
		const items = [{ label: 'Wait a turn', color: 'bal-green', go: () => { closeMenu(); act({ t: 'pass' }); } }];
		if (onStairs) items.push({ label: 'Go down the stairs', color: 'bal-gold', go: () => { closeMenu(); act({ t: 'stairs' }); } });
		if (S.owed) items.push({ label: `Pay <small>${S.owed} of your ${S.stars} stars</small>`, color: 'bal-gold', off: S.stars < S.owed && 'Not enough stars', go: () => { closeMenu(); act({ t: 'pay' }); } });
		items.push({ label: 'Turn on the spot <small>then a direction</small>', color: 'bal-blue', go: () => { closeMenu(); M.turn = true; draw(); } });
		const partners = MM.partyOf(S).filter((p) => p !== u);
		if (partners.length) items.push({ label: 'Tactics', color: 'bal-blue', go: () => menu([...partners.map((p) => ({ label: `${esc(nameOf(p.species))} <small>${TACTIC_NAME[p.tactic]}</small>`, color: 'bal-blue', go: () => menu([...MM.TACTICS.map((t) => ({ label: TACTIC_NAME[t], color: t === p.tactic ? 'bal-green' : 'bal-blue', go: () => { closeMenu(); act({ t: 'tactic', uid: p.uid, tactic: t }); } })), { label: 'Back', color: 'bal-grey', go: openField }], nameOf(p.species)) })), { label: 'Back', color: 'bal-grey', go: openField }], 'Tactics') });
		if (ctx.help) items.push({ label: 'How to play', color: 'bal-grey', go: () => { closeMenu(); ctx.help(); } });
		items.push({ label: 'Give up <small>leave with nothing</small>', color: 'bal-red', go: () => menu([{ label: 'Give up', color: 'bal-red', go: () => { closeMenu(); act({ t: 'quit' }); } }, { label: 'Keep going', color: 'bal-green', go: closeMenu }], 'Give up? Everything found on this run is lost.') });
		items.push({ label: 'Close', color: 'bal-grey', go: closeMenu });
		menu(items, `${M.dungeon.name} · B${S.floorNo}F · turn ${S.turns}`);
	}
	/** Z: the stairs (asked first), a shop's item underfoot, or the plain Attack. */
	function confirm() {
		const S = M.S, u = L();
		if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) { menu([{ label: S.floorNo >= MM.lastFloor(S.dungeon) ? 'Take the stairs out' : 'Go down', color: 'bal-gold', go: () => { closeMenu(); act({ t: 'stairs' }); } }, { label: 'Stay', color: 'bal-grey', go: closeMenu }], 'The stairs'); return; }
		if (S.items.some((o) => o.shop && o.x === u.x && o.y === u.y)) { act({ t: 'take' }); return; }
		act({ t: 'attack' });
	}

	// ---- the end of a run
	function over() {
		if (M.shownOver) return;
		M.shownOver = true;
		ctx.setMenu(null); P.mode = 'mm'; M.aim = null; M.auto = null;
		draw();
		ctx.onOver({ S: M.S, dungeon: M.dungeon, seed: M.seed, party: M.party, acts: M.acts });
	}

	// ---- in and out
	/** A new run: a dungeon (or its id), the figurines going in (the first leads). opts: { seed, bag, stars } */
	function open(dungeon, party, opts = {}) {
		const d = typeof dungeon === 'string' ? dungeonById(dungeon) : dungeon;
		if (!d || !party.length) return false;
		Object.assign(M, { dungeon: d, seed: opts.seed || 'mm-' + Date.now().toString(36), party: party.slice(0, d.party || 4).map(slimFig), bag: (opts.bag || []).map((it) => ({ ...it })), stars: opts.stars | 0,
			acts: [], msgs: [], tw: {}, pos: {}, aim: null, auto: null, turn: false, shownOver: false, buried: 0, seenN: -1 });
		P.screen = 'mm'; P.mode = 'mm'; P.menu = null; P.sel = null;
		P.setup = null; P.actions = []; P.anims = []; P.busy = false; P.teamMap = null; P.online = null; P.disp = null;
		document.body.classList.add('pt-mming');
		$('result').hidden = true;
		M.S = MM.newRun(M.seed, { dungeon: d, party: M.party, bag: M.bag, stars: M.stars }, data);
		board();
		const u = L();
		P.cursor = { x: u.x, y: u.y };
		ctx.placeCam(); ctx.setZoom(ZOOM); ctx.follow(true);
		play(M.S.ev);
		sync(); draw();
		ctx.banner(`${d.name} · B1F`);
		return true;
	}
	function close() {
		document.body.classList.remove('pt-mming');
		if (M.bar) { M.bar.hidden = true; M.mini.hidden = true; }
		if (M.chord) { clearTimeout(M.chord.t); M.chord = null; }
		ctx.setMenu(null);
		P.hl = {}; M.S = null; M.aim = null; M.auto = null;
	}
	function frame(dt) {
		if (!M.S) return;
		if (M.auto) { M.auto.t = (M.auto.t || 0) + dt; if (M.auto.t >= AUTO_S) { M.auto.t = 0; autoStep(); } }
		sync();
	}
	function onAction(action, o = {}) {
		if (!M.S) return false;
		if (P.menu) {
			if (['up', 'down', 'left', 'right'].includes(action)) { ctx.menuMove(action === 'up' || action === 'left' ? -1 : 1); return true; }
			if (action === 'confirm') { if (!o.repeat) ctx.menuPick(); return true; }
			if (action === 'cancel' || action === 'menu') { if (!o.repeat) closeMenu(); return true; }
			return true;
		}
		if (M.S.over) return false;
		if (['up', 'down', 'left', 'right'].includes(action)) { dirInput(ctx.stepFor(action)); return true; }
		if (M.aim) {
			if (action === 'confirm') { if (!o.repeat) endAim(true); return true; }
			if (action === 'cancel' || action === 'menu') { if (!o.repeat) endAim(false); return true; }
			return true;
		}
		if (action === 'confirm') { if (!o.repeat) { ctx.sfx.press(); M.turn = false; confirm(); } return true; }
		if (action === 'cancel') { if (!o.repeat) { M.turn = !M.turn; draw(); } return true; }
		if (action === 'secondary') { if (!o.repeat) { ctx.sfx.press(); openMoves(); } return true; }
		if (action === 'context') { if (!o.repeat) { ctx.sfx.press(); openBag(); } return true; }
		if (action === 'menu') { if (!o.repeat) { ctx.sfx.press(); openField(); } return true; }
		return false;   // (Q / E: the page turns the board)
	}
	function tap(x, y) {
		const S = M.S, u = L();
		if (!S || !u) return;
		if (P.menu) { closeMenu(); return; }
		if (S.over) return;
		if (M.aim) { const k = M.aim.aims.findIndex(([ax, ay]) => ax === x && ay === y); if (k < 0) endAim(false); else if (k === M.aim.i) endAim(true); else { M.aim.i = k; draw(); } return; }
		const c = cheb(u.x, u.y, x, y);
		if (c === 0) { ctx.sfx.press(); if (underfoot() === 'Attack') openField(); else confirm(); return; }
		if (c === 1) { go([x - u.x, y - u.y]); return; }
		M.auto = { x, y, t: AUTO_S, foes: S.units.filter((o) => isFoe(u, o) && P.disp.units[o.uid]).length };
	}
	return { open, close, onAction, tap, frame, act, M, get active() { return P.screen === 'mm' && !!M.S; }, view: () => MM.view(M.S), hash: () => MM.hashOf(M.S), go };
}
