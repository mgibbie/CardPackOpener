// pvp.js — the live PvP Pokemon battle screen. The server (via /api/mp) is
// authoritative: this view polls the match, animates the turn events it
// publishes, and submits the local player's action. Spectators get the same
// view with no input. Rendering reuses the battle UI components.
import { getImage } from './engine.js';
import * as UI from './battleui.js';
import * as MP from '../battlecards/mpmode.js';
import * as Chat from '../battlecards/chat.js';

export class Pvp {
	constructor() { this.active = null; this.sprites = new Map(); }

	get blocking() { return this.active != null; }

	async start(matchId, match, mySide, spectator, onEnd) {
		const a = this.active = {
			matchId, match, mySide, spectator: !!spectator, onEnd,
			phase: spectator ? 'watch' : 'menu',
			menuIdx: 0, moveIdx: 0, switchIdx: 0,
			evQueue: [], msg: match.events?.find(e => typeof e === 'string') || 'Battle start!', msgT: 0, msgHold: 1.0,
			seq: match.seq, hover: null, ui: [],
			shown: [this.hp(match, 0), this.hp(match, 1)],
			dispHP: [this.hp(match, 0), this.hp(match, 1)], // HP the bars are drainng toward, stepped per event
			t: 0, waiting: false, polling: true,
		};
		if (a.phase === 'menu') a.msg = `What will ${this.mine().name} do?`;
		await this.loadSprites(match);
		Chat.mount({ room: 'm:' + matchId, canPost: true }); // players + spectators
		this.pollLoop();
	}

	hp(match, s) { const sd = match.sides[s]; return sd.party[sd.active].curHP; }
	monAt(s) { const sd = this.active.match.sides[s]; return sd.party[sd.active]; }
	mine() { return this.monAt(this.active.spectator ? 0 : this.active.mySide); }
	theirs() { return this.monAt(this.active.spectator ? 1 : 1 - this.active.mySide); }
	bottomSide() { return this.active.spectator ? 0 : this.active.mySide; }

	async loadSprites(match) {
		// all sprites in ONE parallel round — the old nested for/await chain was up
		// to 24 sequential cross-origin fetches before the first battle frame drew
		const jobs = [];
		for (const sd of match.sides) for (const m of sd.party) {
			if (!m.sprite || this.sprites.has(m.sprite)) continue;
			this.sprites.set(m.sprite, null); // claim so duplicate mons don't double-fetch
			jobs.push(getImage('data/pokemon/' + m.sprite).catch(() => null)
				.then(img => {
					this.sprites.set(m.sprite, img);
					const back = m.sprite.replace(/\.(png|gif)$/, '-b.$1');
					if (!this.sprites.has(back)) {
						return getImage('data/pokemon/' + back).catch(() => img)
							.then(bimg => { this.sprites.set(back, bimg); });
					}
				}));
		}
		await Promise.all(jobs);
	}

	// ---------- networking ----------
	async pollLoop() {
		let errStreak = 0;
		while (this.active && this.active.polling) {
			// adaptive: poll fast while waiting on the opponent / spectating,
			// relax while you're the one deciding in a menu — and while the client
			// is busy ANIMATING the last update (nothing actionable can land then)
			const a = this.active;
			const fast = a.spectator || a.phase === 'wait';
			const base = fast ? 400 : a.phase === 'anim' ? 1500 : 1100;
			// exponential backoff on errors so a down server isn't hammered at 2.5Hz
			await new Promise(r => setTimeout(r, Math.min(8000, base * (1 << Math.min(errStreak, 4)))));
			if (!this.active || !this.active.polling) break;
			try {
				const data = await MP.call('match', { id: this.active.matchId });
				if (data.match) this.ingest(data.match);
				errStreak = 0;
			} catch (e) { errStreak++; }
		}
	}
	ingest(match) {
		const a = this.active;
		if (!a) return;
		if (match.seq !== a.seq) {
			a.seq = match.seq;
			const prevActive = a.match?.sides?.map(sd => sd.active);
			a.match = match;
			this.loadSprites(match);
			// play the turn IN ORDER: strings scroll as messages, {hit,side,dmg}
			// markers step the HP bars when reached — instead of both bars
			// snapping to the final result at once ("we moved at the same time")
			const evs = (match.events || []).slice();
			for (let s = 0; s < 2; s++) {
				// pre-turn HP = final HP with every queued damage marker undone
				let pre = this.hp(match, s);
				for (const e of evs) if (e && e.hit && e.side === s) pre += e.dmg;
				pre = Math.max(0, Math.min(this.monAt(s).maxHP, pre));
				a.dispHP[s] = pre;
				// resync the visible bar on a switch-in (different mon) or drift
				if (!prevActive || prevActive[s] !== match.sides[s].active
					|| Math.abs(a.shown[s] - pre) > 1) a.shown[s] = pre;
			}
			a.evQueue = evs;
			a.phase = 'anim';
			a.msgT = 0;
			a.msgHold = 0;
			a.waiting = false;
		} else {
			// keep names/hp fresh without disrupting the local menu
			a.match = match;
		}
		if (match.over && a.phase !== 'done' && a.phase !== 'anim') this.finish();
	}
	async submit(act) {
		const a = this.active;
		if (!a || a.spectator) return;
		a.waiting = true;
		a.phase = 'wait';
		a.msg = 'Waiting for your opponent…';
		try {
			const data = await MP.call('match-action', { id: a.matchId, act });
			if (data.match) this.ingest(data.match);
		} catch (e) { a.waiting = false; a.phase = 'menu'; }
	}
	finish() {
		const a = this.active;
		a.phase = 'done';
		a.polling = false;
	}
	quit() {
		const a = this.active;
		if (!a) return;
		const cb = a.onEnd, over = a.match.over, winner = a.match.winner, mine = a.mySide;
		a.polling = false;
		this.active = null;
		Chat.unmount();
		cb?.(over ? (winner === mine ? 'win' : 'loss') : 'left');
	}

	// ---------- update ----------
	update(dt) {
		const a = this.active;
		if (!a) return;
		a.t += dt;
		for (let s = 0; s < 2; s++) {
			const target = a.dispHP[s];
			a.shown[s] += (target - a.shown[s]) * Math.min(1, dt * 5);
			if (Math.abs(a.shown[s] - target) < 0.5) a.shown[s] = target;
		}
		if (a.phase === 'anim') {
			const settled = a.shown.every((v, s) => Math.abs(v - a.dispHP[s]) < 0.5);
			a.msgT += dt;
			if (a.msgT > a.msgHold && settled) {
				a.msgT = 0;
				const next = a.evQueue.shift();
				if (typeof next === 'string') { a.msg = next; a.msgHold = 1.0; }
				else if (next && next.hit) {
					// step this side's bar; the loop naturally waits for the drain
					const cap = this.monAt(next.side).maxHP;
					a.dispHP[next.side] = Math.max(0, Math.min(cap, a.dispHP[next.side] - next.dmg));
					a.msgHold = 0.25;
				} else if (next !== undefined) { a.msgHold = 0; } // unknown marker: skip
				else {
					// turn done — true up the bars and decide the next phase
					for (let s = 0; s < 2; s++) a.dispHP[s] = this.hp(a.match, s);
					if (a.match.over) { this.finish(); return; }
					if (a.match.needsSwitch && a.match.needsSwitch[a.mySide] && !a.spectator) {
						a.phase = 'switch'; a.switchIdx = 0; a.forcedSwitch = true;
						a.msg = `${this.mine().name} fainted! Choose your next POKeMON.`;
					} else if (a.spectator) {
						a.phase = 'watch'; a.msg = `${a.match.sides[0].name} vs ${a.match.sides[1].name}`;
					} else {
						a.phase = 'menu'; a.forcedSwitch = false;
						a.msg = `What will ${this.mine().name} do?`;
					}
				}
			}
		}
	}

	// ---------- input ----------
	key(k) {
		const a = this.active;
		if (!a) return;
		if (a.phase === 'done') { if (k === 'z' || k === 'Enter' || k === 'x') this.quit(); return; }
		if (a.spectator) { if (k === 'x') this.quit(); return; }
		if (a.phase === 'menu') {
			if (k === 'ArrowLeft' || k === 'ArrowRight') a.menuIdx ^= 1;
			if (k === 'ArrowUp' || k === 'ArrowDown') a.menuIdx ^= 2;
			if (k === 'z' || k === 'Enter') {
				if (a.menuIdx === 0) { a.phase = 'moves'; a.moveIdx = 0; }
				else if (a.menuIdx === 1) { a.phase = 'switch'; a.switchIdx = 0; }
				else if (a.menuIdx === 3) this.submit({ kind: 'forfeit' });
			}
		} else if (a.phase === 'moves') {
			const moves = this.mine().moves;
			if (k === 'ArrowUp' && a.moveIdx >= 2) a.moveIdx -= 2;
			if (k === 'ArrowDown' && a.moveIdx + 2 < moves.length) a.moveIdx += 2;
			if (k === 'ArrowLeft' && a.moveIdx % 2 === 1) a.moveIdx--;
			if (k === 'ArrowRight' && a.moveIdx % 2 === 0 && a.moveIdx + 1 < moves.length) a.moveIdx++;
			if (k === 'x') a.phase = 'menu';
			if (k === 'z' || k === 'Enter') { if ((moves[a.moveIdx]?.pp ?? 1) > 0) this.submit({ kind: 'move', moveIdx: a.moveIdx }); }
		} else if (a.phase === 'switch') {
			const bench = this.benchIdx();
			if (k === 'ArrowUp') a.switchIdx = (a.switchIdx + bench.length - 1) % bench.length;
			if (k === 'ArrowDown') a.switchIdx = (a.switchIdx + 1) % bench.length;
			if (k === 'x' && !a.forcedSwitch) a.phase = 'menu';
			if ((k === 'z' || k === 'Enter') && bench.length) {
				const pIdx = bench[a.switchIdx];
				this.submit({ kind: a.forcedSwitch ? 'replace' : 'switch', partyIdx: pIdx });
			}
		}
	}
	benchIdx() {
		const sd = this.active.match.sides[this.active.mySide];
		return sd.party.map((m, i) => i).filter(i => i !== sd.active && sd.party[i].curHP > 0);
	}
	hover(x, y) { const a = this.active; if (!a) return; a.hover = null; for (const b of a.ui) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) a.hover = b.id; }
	tap(x, y) {
		const a = this.active; if (!a) return;
		let hit = null; for (const b of a.ui) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) hit = b;
		if (!hit) { if (a.phase === 'anim') a.msgT = 9; return; }
		const [kind, arg] = hit.id.split(':');
		if (kind === 'adv') { a.msgT = 9; return; }
		if (kind === 'done') { this.quit(); return; }
		if (kind === 'menu') { a.menuIdx = +arg; this.key('z'); return; }
		if (kind === 'move') { a.moveIdx = +arg; this.key('z'); return; }
		if (kind === 'sw') { a.switchIdx = +arg; this.key('z'); return; }
		if (kind === 'back') this.key('x');
	}

	// ---------- draw ----------
	draw(ctx, W, H) {
		const a = this.active;
		if (!a) return;
		const { portrait, u, barY, barH } = UI.layout(W, H);
		a.ui = [];
		// static backdrop — cache the gradient instead of rebuilding it per frame
		if (!this._bg || this._bgH !== H) {
			this._bg = ctx.createLinearGradient(0, 0, 0, H);
			this._bg.addColorStop(0, '#7db8e0'); this._bg.addColorStop(0.55, '#b8d8b8'); this._bg.addColorStop(1, '#5f8f5f');
			this._bgH = H;
		}
		ctx.fillStyle = this._bg; ctx.fillRect(0, 0, W, H);

		const bottom = this.bottomSide(), top = 1 - bottom;
		this.drawMon(ctx, W, H, u, top, false);
		this.drawMon(ctx, W, H, u, bottom, true);

		UI.monPanel(ctx, this.withShown(top), 14 * u, 14 * u, 272 * u, u, { shownHP: a.shown[top], boosts: this.monAt(top).boosts });
		UI.teamDots(ctx, a.match.sides[top].party, this.monAt(top), 30 * u, 106 * u, u);
		const meY = barY - 118 * u;
		UI.monPanel(ctx, this.withShown(bottom), W - 14 * u - 300 * u, meY, 300 * u, u,
			{ shownHP: a.shown[bottom], boosts: this.monAt(bottom).boosts, showNumbers: true });
		UI.teamDots(ctx, a.match.sides[bottom].party, this.monAt(bottom),
			W - 14 * u - 10 * u - (a.match.sides[bottom].party.length - 1) * 18 * u - 6 * u, meY - 12 * u, u);

		UI.panel(ctx, 8 * u, barY, W - 16 * u, barH - 8 * u, 10 * u);
		const btn = (b, id) => { b.id = id; a.ui.push(b); UI.button(ctx, b, a.hover === id || b.kbSel, u); };

		if (portrait) {
			this.drawBarPortrait(ctx, a, W, H, u, barY, btn);
		} else if (a.phase === 'menu') {
			ctx.fillStyle = UI.C.text; ctx.font = `${Math.round(17 * u)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, W - 300 * u).slice(0, 3).forEach((l, i) => ctx.fillText(l, 24 * u, barY + 32 * u + i * 22 * u));
			['FIGHT', 'SWITCH', '', 'FORFEIT'].forEach((lab, i) => {
				if (!lab) return;
				const bw = 120 * u, bh = 44 * u;
				const x = W - 24 * u - (2 - i % 2) * (bw + 8 * u) + 8 * u;
				const y = barY + 10 * u + Math.floor(i / 2) * (bh + 8 * u);
				btn({ x, y, w: bw, h: bh, label: lab, big: true, center: true, kbSel: a.menuIdx === i }, 'menu:' + i);
			});
		} else if (a.phase === 'moves') {
			const moves = this.mine().moves, backW = 86 * u, bw = (W - 16 * u - backW - 40 * u) / 2, bh = 44 * u;
			moves.forEach((mv, i) => {
				btn({ x: 20 * u + (i % 2) * (bw + 8 * u), y: barY + 9 * u + Math.floor(i / 2) * (bh + 8 * u),
					w: bw, h: bh, label: mv.name.toUpperCase().slice(0, 16), sub: `PP ${mv.pp}/${mv.maxPp}`,
					subColor: mv.pp <= 0 ? UI.C.hpRed : UI.C.dim, right: mv.power ? `Pwr ${mv.power}` : (mv.category || ''),
					type: mv.type, disabled: mv.pp <= 0, kbSel: a.moveIdx === i }, 'move:' + i);
			});
			btn({ x: W - 8 * u - backW - 8 * u, y: barY + 9 * u, w: backW, h: 96 * u, label: 'BACK', center: true }, 'back');
		} else if (a.phase === 'switch') {
			const bench = this.benchIdx(), sd = a.match.sides[a.mySide];
			bench.slice(0, 3).forEach((pIdx, i) => {
				const m = sd.party[pIdx];
				btn({ x: 20 * u, y: barY + 9 * u + i * 32 * u, w: W * 0.58, h: 28 * u,
					label: `${m.name}  Lv${m.level}`, right: `${m.curHP}/${m.maxHP}`, kbSel: a.switchIdx === i }, 'sw:' + i);
			});
			if (!bench.length) { ctx.fillStyle = UI.C.dim; ctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`; ctx.fillText('No one else can fight!', 24 * u, barY + 34 * u); }
			if (!a.forcedSwitch) btn({ x: W - 8 * u - 94 * u, y: barY + 9 * u, w: 86 * u, h: 96 * u, label: 'BACK', center: true }, 'back');
		} else {
			// wait / anim / watch / done: message with a tap-to-advance hint
			ctx.fillStyle = UI.C.text; ctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, W - 70 * u).slice(0, 3).forEach((l, i) => ctx.fillText(l, 24 * u, barY + 34 * u + i * 24 * u));
			if (a.phase === 'anim' && Math.floor(a.t * 2) % 2 === 0) { ctx.fillStyle = UI.C.accent; ctx.fillText('▼', W - 34 * u, barY + 96 * u); }
			if (a.phase === 'done') btn({ x: W / 2 - 90 * u, y: barY + 60 * u, w: 180 * u, h: 40 * u, label: 'LEAVE', center: true }, 'done:0');
			a.ui.push({ id: 'adv:0', x: 0, y: 0, w: W, h: barY });
		}
	}

	// portrait control deck — mirrors battle.js drawBarPortrait (u is W/512 here,
	// so every button clears the 44 CSS px touch minimum; see battleui.layout)
	drawBarPortrait(ctx, a, W, H, u, barY, btn) {
		const pad = 14 * u, gap = 8 * u;
		const fullW = W - 2 * pad;
		if (a.phase === 'menu') {
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(19 * u)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, fullW - 20 * u).slice(0, 2).forEach((l, i) =>
				ctx.fillText(l, 24 * u, barY + 30 * u + i * 24 * u));
			const bw = (fullW - 10 * u) / 2, bh = 82 * u;
			['FIGHT', 'SWITCH', '', 'FORFEIT'].forEach((lab, i) => {
				if (!lab) return;
				btn({ x: pad + (i % 2) * (bw + 10 * u), y: barY + 74 * u + Math.floor(i / 2) * (bh + 10 * u),
					w: bw, h: bh, label: lab, big: true, center: true, kbSel: a.menuIdx === i }, 'menu:' + i);
			});
		} else if (a.phase === 'moves') {
			const bw = (fullW - gap) / 2, bh = 72 * u;
			this.mine().moves.forEach((mv, i) => {
				btn({
					x: pad + (i % 2) * (bw + gap), y: barY + 12 * u + Math.floor(i / 2) * (bh + gap),
					w: bw, h: bh, label: mv.name.toUpperCase().slice(0, 16),
					sub: `PP ${mv.pp}/${mv.maxPp}`, subColor: mv.pp <= 0 ? UI.C.hpRed : UI.C.dim,
					right: mv.power ? `Pwr ${mv.power}` : (mv.category || ''),
					type: mv.type, disabled: mv.pp <= 0, kbSel: a.moveIdx === i,
				}, 'move:' + i);
			});
			btn({ x: pad, y: barY + 12 * u + 2 * (bh + gap) + 6 * u, w: fullW, h: 60 * u, label: 'BACK', center: true }, 'back');
		} else if (a.phase === 'switch') {
			const bench = this.benchIdx(), sd = a.match.sides[a.mySide];
			bench.slice(0, 3).forEach((pIdx, i) => {
				const m = sd.party[pIdx];
				btn({ x: pad, y: barY + 12 * u + i * (58 * u + 6 * u), w: fullW, h: 58 * u,
					label: `${m.name}  Lv${m.level}`, right: `${m.curHP}/${m.maxHP}`, kbSel: a.switchIdx === i }, 'sw:' + i);
			});
			if (!bench.length) {
				ctx.fillStyle = UI.C.dim;
				ctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
				ctx.fillText('No one else can fight!', 24 * u, barY + 40 * u);
			}
			if (!a.forcedSwitch) btn({ x: pad, y: barY + 202 * u, w: fullW, h: 60 * u, label: 'BACK', center: true }, 'back');
		} else {
			// wait / anim / watch / done: message with a tap-to-advance hint
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(20 * u)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, fullW - 20 * u).slice(0, 4).forEach((l, i) =>
				ctx.fillText(l, 24 * u, barY + 38 * u + i * 27 * u));
			if (a.phase === 'anim' && Math.floor(a.t * 2) % 2 === 0) {
				ctx.fillStyle = UI.C.accent;
				ctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
				ctx.fillText('▼', W - 38 * u, H - 24 * u);
			}
			if (a.phase === 'done') btn({ x: pad, y: barY + 120 * u, w: fullW, h: 64 * u, label: 'LEAVE', center: true }, 'done:0');
			a.ui.push({ id: 'adv:0', x: 0, y: 0, w: W, h: barY });
		}
	}

	withShown(s) { const m = this.monAt(s); return m; }
	drawMon(ctx, W, H, u, s, near) {
		const a = this.active;
		const m = this.monAt(s);
		const { portrait, barY } = UI.layout(W, H);
		const pose = near
			? (portrait ? { x: W * 0.26, y: barY - 24 * u, scale: 3.8 * u } : { x: W * 0.235, y: H - 140 * u, scale: 4.2 * u })
			: (portrait ? { x: W * 0.68, y: barY * 0.40, scale: 3.1 * u } : { x: W * 0.70, y: H * 0.42, scale: 3.4 * u });
		const tc = UI.TYPE_COLORS[m.types[0]] || '#888';
		ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = tc;
		ctx.beginPath(); ctx.ellipse(pose.x, pose.y, 118 * u, 30 * u, 0, 0, Math.PI * 2); ctx.fill();
		ctx.globalAlpha = 0.5; ctx.fillStyle = 'rgba(40,70,50,0.8)';
		ctx.beginPath(); ctx.ellipse(pose.x, pose.y, 104 * u, 24 * u, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
		const key = near ? m.sprite.replace(/\.(png|gif)$/, '-b.$1') : m.sprite;
		const img = this.sprites.get(key) || this.sprites.get(m.sprite);
		if (m.curHP <= 0 || !img) return;
		const bob = Math.sin(a.t * 2.1 + (near ? 0 : 1.7)) * 2.5 * u;
		ctx.imageSmoothingEnabled = false;
		// Fit each sprite into the 96px standard box so mons draw at a consistent size
		// regardless of export resolution, then apply the species' battleScale for authentic
		// relative sizing (see battle.js drawSide). scaleBySprite is set by main.js on boot.
		const bScale = m.battleScale ?? this.scaleBySprite?.get(m.sprite) ?? 1;
		const norm = (96 / Math.max(img.width, img.height)) * bScale;
		const w = img.width * pose.scale * norm, h = img.height * pose.scale * norm;
		ctx.drawImage(img, pose.x - w / 2, pose.y + bob - h + 10 * u, w, h);
	}
}
