// factoryspec.js — read-only spectator view of a friend's BATTLE FRONTIER run,
// mirroring the Battlecards solo-run spectate. The runner publishes a lean board
// snapshot to the relay (~1.2s); this polls it (friend-gated server-side) and draws
// a scoreboard with the battle UI components — both active mons, HP (eased toward the
// snapshot), team dots, and the current message. No input beyond leaving.
import * as UI from './battleui.js';
import * as MP from '../battlecards/mpmode.js';
import * as Chat from '../battlecards/chat.js';

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
				if (data && data.unchanged) { this.active.watchers = data.watchers || this.active.watchers; if (data.over) this.markOver(); continue; }
				if (data) this.ingest(data);
			} catch (e) { }
		}
	}
	ingest(data) {
		const a = this.active; if (!a) return;
		a.seq = data.seq ?? a.seq;
		a.watchers = data.watchers || 0;
		const snap = a.snap = data.snapshot || null;
		if (snap && snap.me && snap.foe) {
			a.msg = snap.msg || `${snap.me.name} vs ${snap.foe.name}`;
			if (a.lastMe !== snap.me.name) { a.shownMe = snap.me.curHP; a.lastMe = snap.me.name; }
			if (a.lastFoe !== snap.foe.name) { a.shownFoe = snap.foe.curHP; a.lastFoe = snap.foe.name; }
		} else if (snap) {
			a.msg = 'Between battles…';
		}
		if (data.over) this.markOver();
	}
	markOver() { const a = this.active; if (a) { a.over = true; a.msg = `${a.runner}’s run has ended.`; } }
	quit() { const a = this.active; if (!a) return; a.polling = false; this.active = null; if (Chat.active()) Chat.unmount(); a.onEnd?.(); }

	update(dt) {
		const a = this.active; if (!a) return;
		a.t += dt;
		const ease = (cur, target) => { const n = cur + (target - cur) * Math.min(1, dt * 5); return Math.abs(n - target) < 0.5 ? target : n; };
		if (a.snap?.me) a.shownMe = ease(a.shownMe, a.snap.me.curHP);
		if (a.snap?.foe) a.shownFoe = ease(a.shownFoe, a.snap.foe.curHP);
	}

	key(k) { if (k === 'x' || k === 'Escape' || (this.active?.over && (k === 'z' || k === 'Enter'))) this.quit(); }
	tap() { /* tapping the screen does nothing for a spectator */ }
	hover() { }

	draw(ctx, W, H) {
		const a = this.active; if (!a) return;
		const u = H / 480, snap = a.snap;
		const g = ctx.createLinearGradient(0, 0, 0, H);
		g.addColorStop(0, '#2a3a5a'); g.addColorStop(1, '#16273f');
		ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

		ctx.fillStyle = UI.C.accent; ctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		ctx.fillText(`\u{1F441} Watching ${a.runner}`, 16 * u, 28 * u);
		if (snap) {
			ctx.fillStyle = UI.C.dim; ctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
			ctx.fillText(`${snap.facility || 'BATTLE FRONTIER'}  ·  streak ${snap.streak || 0}  ·  ${a.watchers} watching`, 16 * u, 48 * u);
		}
		if (snap && snap.me && snap.foe) {
			UI.monPanel(ctx, snap.foe, 14 * u, 66 * u, 300 * u, u, { shownHP: a.shownFoe, boosts: snap.foeBoosts });
			UI.teamDots(ctx, snap.foeTeam || [], null, 30 * u, 158 * u, u);
			const meY = H - 210 * u;
			UI.monPanel(ctx, snap.me, W - 14 * u - 300 * u, meY, 300 * u, u, { shownHP: a.shownMe, boosts: snap.meBoosts, showNumbers: true });
			UI.teamDots(ctx, snap.meTeam || [], null, W - 14 * u - 120 * u, meY - 12 * u, u);
		}
		const barY = H - 118 * u;
		UI.panel(ctx, 8 * u, barY, W - 16 * u, 110 * u, 10 * u);
		ctx.fillStyle = UI.C.text; ctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
		UI.wrap(ctx, a.msg, W - 70 * u).slice(0, 3).forEach((l, i) => ctx.fillText(l, 24 * u, barY + 34 * u + i * 24 * u));
		ctx.fillStyle = UI.C.dim; ctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		ctx.fillText(a.over ? 'X = leave' : 'X = stop watching', 24 * u, barY + 98 * u);
	}
}
