// factoryspec.js — read-only spectator view of a friend's BATTLE FRONTIER run,
// mirroring the Battlecards solo-run spectate. The runner publishes a lean board
// snapshot to the relay (~1.2s); this polls it (friend-gated server-side) and draws
// a scoreboard with the battle UI components — both active mons, HP (eased toward the
// snapshot), team dots, and the current message. No input beyond leaving.
import * as UI from './battleui.js';
import * as MP from '../battlecards/mpmode.js';
import * as Chat from '../battlecards/chat.js';
import { copyClip, floatingClipButton } from '../site/clip.js';

export class FactorySpec {
	constructor() { this.active = null; }
	get blocking() { return this.active != null; }

	start(runner, onEnd) {
		this.active = {
			runner, onEnd, snap: null, seq: -1, over: false, watchers: 0,
			msg: `Loading ${runner}’s run…`, t: 0, polling: true,
			shownMe: 0, shownFoe: 0, lastMe: null, lastFoe: null,
		};
		// spectator chat: read the runner's room, chat with other spectators (spec room)
		Chat.mount({ room: 'u:' + runner, canPost: false, specRoom: 'spec:' + runner });
		this.pollLoop();
	}
	async pollLoop() {
		while (this.active && this.active.polling) {
			await new Promise(r => setTimeout(r, 1000));
			if (!this.active || !this.active.polling) break;
			try {
				const data = await MP.call('factory-state', { username: this.active.runner, seq: this.active.seq });
				if (!this.active) break;
				if (data && data.error) { this.active.msg = `You can only watch a friend.`; this.active.over = true; continue; }
				if (data && data.full) { this.active.msg = `This run is full (max ${data.max} watchers).`; this.active.over = true; continue; }
				if (data && data.unchanged) { this.active.watchers = data.watchers || this.active.watchers; if (data.replay) this.active.replay = String(data.replay); if (data.over) this.markOver(); continue; }
				if (data && data.snapshot == null && !data.seq && this.active.battleOver) continue;   // (between battles: nothing published yet)
				if (data) this.ingest(data);
			} catch (e) { }
		}
	}
	ingest(data) {
		const a = this.active; if (!a) return;
		a.seq = data.seq ?? a.seq;
		a.watchers = data.watchers || 0;
		const snap = a.snap = data.snapshot || null;
		if (snap) a.kind = snap.kind || 'frontier';   // (kept: the last push of a battle has no snapshot)
		if (snap && snap.me && snap.foe) {
			a.msg = snap.msg || `${snap.me.name} vs ${snap.foe.name}`;
			if (a.lastMe !== snap.me.name) { a.shownMe = snap.me.curHP; a.lastMe = snap.me.name; }
			if (a.lastFoe !== snap.foe.name) { a.shownFoe = snap.foe.curHP; a.lastFoe = snap.foe.name; }
		} else if (snap) {
			a.msg = 'Between battles…';
		}
		if (data.replay && /^[a-f0-9]{8,20}$/.test(String(data.replay))) a.replay = String(data.replay);   // (the battle that ended, kept as a replay)
		if (data.over) this.markOver(); else if (a.over && a.battleOver) { a.over = false; a.battleOver = false; a.replay = null; }   // (the next battle after one that ended)
	}
	// a Frontier run that ends is over; an ordinary battle that ends leaves the spectator waiting for the next one
	markOver() { const a = this.active; if (!a) return; if (a.kind === 'battle' || a.battleOver) { a.battleOver = true; a.over = true; a.msg = `${a.runner}’s battle is over. Waiting for the next one…`; return; } a.over = true; a.msg = `${a.runner}’s run has ended.`; }
	quit() { const a = this.active; if (!a) return; a.polling = false; if (a.clipBtn) a.clipBtn.remove(); this.active = null; if (Chat.active()) Chat.unmount(); a.onEnd?.(); }

	// ---- a REPLAY (ow_battletape.js): the frames of a tape, played in time. Z plays / pauses, ◄ ► step a frame, ▲ ▼
	// change the speed, X leaves.
	// CLIPS (owner, 2026-11-19): a tape kept on the account (tape.id) can be linked at a moment: /overworld/?owreplay=<id>&t=<frame>;
	// `startAt` (that frame) opens it paused there. C, or the 🔗 button over the board, copies a link to the frame on screen.
	playTape(tape, onEnd, startAt) {
		if (this.active) this.quit();
		this.active = { runner: '', onEnd, snap: null, seq: -1, over: false, watchers: 0, msg: tape.label || 'Replay', t: 0, polling: false,
			shownMe: 0, shownFoe: 0, lastMe: null, lastFoe: null, tape, i: -1, clock: 0, playing: true, speed: 1 };
		this.tapeTo(0);
		if (startAt > 0) { this.active.playing = false; this.tapeTo(startAt); }
		if (tape.id) this.active.clipBtn = floatingClipButton(() => (this.active ? this.active.i : 0), { id: 'ow-clip', getExtra: () => ({ owreplay: tape.id, watchfactory: null, journey: null }) });
	}
	copyMoment() { const a = this.active; if (a && a.tape && a.tape.id) return copyClip(a.i, { owreplay: a.tape.id, watchfactory: null, journey: null }); return null; }
	tapeTo(i) {
		const a = this.active; if (!a || !a.tape) return;
		const f = a.tape.frames; i = Math.max(0, Math.min(f.length - 1, i)); if (i === a.i) return;
		a.i = i; a.clock = f[i].t; this.ingest({ snapshot: f[i].s, seq: i, watchers: 0, over: false });
		if (i === f.length - 1) { a.playing = false; a.msg = (f[i].s && f[i].s.msg) || 'The end of the replay.'; }
	}
	async watchReplay(id) {
		const a = this.active; if (!a) return;
		a.msg = 'Loading the replay…';
		const T = await import('./ow_battletape.js'), tape = await T.fetchTape(id);
		if (!this.active) return;
		if (!tape) { this.active.msg = 'That replay could not be loaded.'; return; }
		tape.id = tape.id || id;
		const back = a.onEnd; a.onEnd = null; this.quit();
		this.playTape(tape, back);
	}

	update(dt) {
		const a = this.active; if (!a) return;
		a.t += dt;
		const ease = (cur, target) => { const n = cur + (target - cur) * Math.min(1, dt * 5); return Math.abs(n - target) < 0.5 ? target : n; };
		if (a.tape && a.playing) { a.clock += dt * 1000 * a.speed; const f = a.tape.frames; let j = a.i; while (j + 1 < f.length && f[j + 1].t <= a.clock) j++; if (j !== a.i) this.tapeTo(j); }
		if (a.snap?.me) a.shownMe = ease(a.shownMe, a.snap.me.curHP);
		if (a.snap?.foe) a.shownFoe = ease(a.shownFoe, a.snap.foe.curHP);
	}

	key(k) {
		const a = this.active; if (!a) return;
		if (a.tape) {
			if (k === 'x' || k === 'Escape') this.quit();
			else if (k === 'z' || k === 'Enter') { if (a.i >= a.tape.frames.length - 1) this.tapeTo(0); a.playing = !a.playing; }
			else if (k === 'ArrowRight') { a.playing = false; this.tapeTo(a.i + 1); }
			else if (k === 'ArrowLeft') { a.playing = false; this.tapeTo(a.i - 1); }
			else if (k === 'ArrowUp') a.speed = Math.min(8, a.speed * 2);
			else if (k === 'ArrowDown') a.speed = Math.max(0.5, a.speed / 2);
			else if (k === 'c' && a.tape.id) { this.copyMoment(); a.msg = 'Link to this moment copied.'; }
			return;
		}
		if (a.over && a.replay && (k === 'z' || k === 'Enter')) { this.watchReplay(a.replay); return; }   // (the battle that ended, again)
		if (k === 'x' || k === 'Escape' || (a.over && !a.battleOver && (k === 'z' || k === 'Enter'))) this.quit();
	}
	tap() { if (this.active && (this.active.tape || (this.active.over && this.active.replay))) this.key('z'); }   // (a tap plays / pauses a replay, or opens the one a battle left)
	hover() { }

	draw(ctx, W, H) {
		const a = this.active; if (!a) return;
		drawBattleBoard(ctx, W, H, a.snap, {
			title: a.tape ? `\u25B6 Replay  ·  ${a.tape.label || ''}` : `\u{1F441} Watching ${a.runner}`,
			watchers: a.watchers, msg: a.msg, shownMe: a.shownMe, shownFoe: a.shownFoe,
			hint: a.tape ? `${a.playing ? 'Z = pause' : 'Z = play'}  ·  \u25C4 \u25BA step  ·  \u25B2 \u25BC speed \u00D7${a.speed}  ·  ${a.i + 1} / ${a.tape.frames.length}${a.tape.id ? '  ·  C = link here' : ''}  ·  X = leave` : a.over && a.replay ? 'Z = watch the replay  ·  X = leave' : a.over ? 'X = leave' : 'X = stop watching',
		});
	}
}

/** A battle board as a spectator sees it: both Pokémon, their HP and teams, and the message line. The battle spectator
 *  above draws it, and so do the overworld's live follow and journey replays (ow_scenes.js 'battle'), from the same
 *  snapshot (ow_frontier.js factorySnapshot, ow_battletape.js pvpSnapshot). o: { title, watchers, msg, shownMe, shownFoe,
 *  hint }, all optional (without an eased HP the snapshot's own is shown). */
export function drawBattleBoard(ctx, W, H, snap, o = {}) {
	const u = H / 480;
	const g = ctx.createLinearGradient(0, 0, 0, H);
	g.addColorStop(0, '#2a3a5a'); g.addColorStop(1, '#16273f');
	ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

	if (o.title) { ctx.fillStyle = UI.C.accent; ctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`; ctx.fillText(o.title, 16 * u, 28 * u); }
	if (snap) {
		const w = o.watchers != null ? `  ·  ${o.watchers} watching` : '';
		ctx.fillStyle = UI.C.dim; ctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		ctx.fillText(snap.kind === 'battle' || snap.kind === 'pvp' ? `${snap.facility || 'Battle'}${w}` : `${snap.facility || 'BATTLE FRONTIER'}  ·  streak ${snap.streak || 0}${w}`, 16 * u, 48 * u);
	}
	if (snap && snap.me && snap.foe) {
		UI.monPanel(ctx, snap.foe, 14 * u, 66 * u, 300 * u, u, { shownHP: o.shownFoe ?? snap.foe.curHP, boosts: snap.foeBoosts });
		UI.teamDots(ctx, snap.foeTeam || [], null, 30 * u, 158 * u, u);
		const meY = H - 210 * u;
		UI.monPanel(ctx, snap.me, W - 14 * u - 300 * u, meY, 300 * u, u, { shownHP: o.shownMe ?? snap.me.curHP, boosts: snap.meBoosts, showNumbers: true });
		UI.teamDots(ctx, snap.meTeam || [], null, W - 14 * u - 120 * u, meY - 12 * u, u);
	}
	const barY = H - 118 * u;
	UI.panel(ctx, 8 * u, barY, W - 16 * u, 110 * u, 10 * u);
	ctx.fillStyle = UI.C.text; ctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
	const msg = o.msg ?? (snap && snap.msg) ?? '';
	UI.wrap(ctx, msg || (snap && snap.me && snap.foe ? `${snap.me.name} vs ${snap.foe.name}` : ''), W - 70 * u).slice(0, 3).forEach((l, i) => ctx.fillText(l, 24 * u, barY + 34 * u + i * 24 * u));
	if (o.hint) { ctx.fillStyle = UI.C.dim; ctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`; ctx.fillText(o.hint, 24 * u, barY + 98 * u); }
}
