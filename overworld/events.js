// events.js — story progression: a persisted flag/var store plus a cutscene
// interpreter. Cutscenes are opcode lists (data), so they can be hand-authored
// or transpiled from the decomp map scripts. While a cutscene runs it blocks
// player input and drives NPC/player movement and dialogue.
const KEY = 'magepunk_story';
const META = 16;
const STEP_TIME = 0.22; // seconds per tile of scripted movement
const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

function load() {
	try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d === 'object') return d; } catch (e) {}
	return { flags: {}, vars: {} };
}
let store = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

export function getFlag(f) { return !!store.flags[f]; }
export function setFlag(f) { store.flags[f] = true; save(); }
export function clearFlag(f) { delete store.flags[f]; save(); }
export function getVar(v) { return store.vars[v] || 0; }
export function setVar(v, val) { store.vars[v] = val; save(); }
export function resetStory() { store = { flags: {}, vars: {} }; save(); }

// ctx bridges the cutscene to the game: { dialog, player, npcById(id), giveItem,
// giveMon, healParty, hud }. Steps are plain objects; see the opcodes below.
export class Cutscene {
	constructor() { this.cur = null; }
	get blocking() { return this.cur != null; }

	// run an opcode list; onDone fires when it finishes
	start(steps, ctx, onDone) {
		this.cur = { steps, ctx, i: 0, sub: null, t: 0, onDone };
		this._enter();
	}

	_finish() {
		const cb = this.cur?.onDone;
		this.cur = null;
		cb?.();
	}

	// cancel a running cutscene without firing its onDone (e.g. skip)
	stop() { this.cur = null; }

	// begin the step at the cursor; instant steps apply and auto-advance
	_enter() {
		const c = this.cur;
		if (!c) return;
		if (c.i >= c.steps.length) { this._finish(); return; }
		const s = c.steps[c.i];
		const ctx = c.ctx;
		c.sub = null; c.t = 0;
		switch (s.op) {
			case 'setflag': setFlag(s.flag); return this._advance();
			case 'clearflag': clearFlag(s.flag); return this._advance();
			case 'setvar': setVar(s.var, s.value); return this._advance();
			case 'give': ctx.giveItem?.(s.item, s.count || 1); return this._advance();
			case 'givemon': ctx.giveMon?.(s.species, s.level || 5); return this._advance();
			case 'heal': ctx.healParty?.(); return this._advance();
			case 'hud': if (s.text) ctx.hud?.(s.text); return this._advance();
			case 'face': { const a = this._actor(s.who); if (a) a.facing = s.dir; return this._advance(); }
			case 'if': {
				// branch: run one of two sub-lists based on a flag
				const branch = getFlag(s.flag) ? (s.then || []) : (s.else || []);
				c.steps = [...c.steps.slice(0, c.i + 1), ...branch, ...c.steps.slice(c.i + 1)];
				return this._advance();
			}
			case 'say':
				ctx.dialog.open(s.text);
				return; // waits in update() for the dialog to close
			case 'move':
				c.sub = this._planMove(s);
				if (!c.sub) return this._advance();
				return;
			case 'wait':
				c.sub = { kind: 'wait', left: s.sec || 0.4 };
				return;
			default:
				return this._advance();
		}
	}

	_advance() { if (this.cur) { this.cur.i++; this._enter(); } }

	_actor(who) {
		const ctx = this.cur.ctx;
		if (who === 'player') return ctx.player;
		return ctx.npcById?.(who) || null;
	}

	// build a tile-by-tile movement plan from a path of directions or a delta
	_planMove(s) {
		const actor = this._actor(s.who);
		if (!actor) return null;
		let path = s.path;
		if (!path && s.dir && s.steps) path = Array(s.steps).fill(s.dir);
		if (!path || !path.length) return null;
		return { kind: 'move', actor, path, k: 0, from: null };
	}

	update(dt) {
		const c = this.cur;
		if (!c) return;
		// a 'say' step waits for the dialog to be dismissed
		const s = c.steps[c.i];
		if (s && s.op === 'say') {
			if (!c.ctx.dialog.blocking) this._advance();
			return;
		}
		if (!c.sub) return;
		if (c.sub.kind === 'wait') {
			c.sub.left -= dt;
			if (c.sub.left <= 0) this._advance();
			return;
		}
		if (c.sub.kind === 'move') {
			const mv = c.sub;
			const actor = mv.actor;
			if (mv.from == null) {
				// start the next tile of the path
				if (mv.k >= mv.path.length) return this._advance();
				const dir = mv.path[mv.k];
				const [dx, dy] = DIRS[dir] || [0, 0];
				actor.facing = dir;
				mv.from = [actor.tx, actor.ty];
				mv.to = [actor.tx + dx, actor.ty + dy];
				mv.t = 0;
				if (typeof actor.stepParity === 'number') actor.stepParity ^= 1;
			}
			mv.t += dt / STEP_TIME;
			const p = Math.min(1, mv.t);
			actor.px = mv.from[0] * META + (mv.to[0] - mv.from[0]) * META * p;
			actor.py = mv.from[1] * META + (mv.to[1] - mv.from[1]) * META * p;
			if (typeof actor.moving === 'boolean') actor.moving = p < 1;
			if (p >= 1) {
				actor.tx = mv.to[0]; actor.ty = mv.to[1];
				actor.px = actor.tx * META; actor.py = actor.ty * META;
				mv.k++; mv.from = null;
				if (mv.k >= mv.path.length) this._advance();
			}
		}
	}
}
