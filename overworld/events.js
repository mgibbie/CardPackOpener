// events.js — story progression: a persisted flag/var store plus a cutscene
// interpreter. Cutscenes are opcode lists (data) — hand-authored or transpiled
// from the decomp map scripts. The interpreter is label-addressable with a call
// stack, so ported scripts' goto/call/return control flow works. While a
// cutscene runs it freezes player input and drives NPC/player movement + text.
import { safeLoad, safeSave } from './safestore.js';
const KEY = 'magepunk_story';
const META = 16;
const STEP_TIME = { walk: 0.22, slow: 0.32, fast: 0.13, slide: 0.10, jump: 0.24, face: 0, noop: 0 };
const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

function load() {
	const d = safeLoad(KEY, null);
	return (d && typeof d === 'object') ? d : { flags: {}, vars: {} };
}
let store = load();
function save() { safeSave(KEY, store); }

export function getFlag(f) { return !!store.flags[f]; }
export function setFlag(f) { store.flags[f] = true; save(); }
export function clearFlag(f) { delete store.flags[f]; save(); }
export function getVar(v) { return store.vars[v] || 0; }
export function hasVar(v) { return Object.prototype.hasOwnProperty.call(store.vars, v); }
export function setVar(v, val) { store.vars[v] = val; save(); }
export function resetStory() { store = { flags: {}, vars: {} }; save(); }

// resolve a symbolic value (a var name, TRUE/FALSE, or a literal number)
function resolveValue(v) {
	if (typeof v === 'number') return v;
	if (v === 'TRUE') return 1;
	if (v === 'FALSE') return 0;
	if (typeof v === 'string' && /^VAR_/.test(v)) return getVar(v);
	const n = Number(v);
	return isNaN(n) ? v : n;
}
function cmp(a, op, b) {
	switch (op) {
		case 'eq': return a === b; case 'ne': return a !== b;
		case 'lt': return a < b; case 'le': return a <= b;
		case 'gt': return a > b; case 'ge': return a >= b;
	}
	return false;
}

// ctx bridges a cutscene to the game. Fields used:
//   dialog, player, npcById(localId), talker (the NPC being talked to, or null),
//   strings (label->string), playerName, giveItem, takeItem, giveMon, healParty,
//   warp(map, warpId), setMetatile, hideObj, showObj, setObjXy, startTrainer,
//   special(name, store), hud
export class Cutscene {
	constructor() { this.cur = null; }
	get blocking() { return this.cur != null; }

	// hand-authored linear list: run it as a one-label program
	start(steps, ctx, onDone) {
		this.run({ __entry__: steps }, '__entry__', ctx, onDone);
	}

	// run a label-addressable program (the transpiled map scripts)
	run(program, entryLabel, ctx, onDone) {
		const ops = program[entryLabel];
		if (!ops) { onDone?.(); return; }
		this.cur = { program, ctx, onDone, frames: [{ ops, i: 0 }], sub: null };
		this._enter();
	}

	stop() { this.cur = null; }
	_finish() { const cb = this.cur?.onDone; this.cur = null; cb?.(); }

	_frame() { const f = this.cur.frames; return f[f.length - 1]; }

	// advance the cursor past the current op, popping finished frames
	_advance() {
		const c = this.cur;
		if (!c) return;
		if (c.frames.length) this._frame().i++;
		while (c.frames.length && this._frame().i >= this._frame().ops.length) c.frames.pop();
	}

	// jump (replace current frame's ops) or call (push a frame) to a label
	_goto(label, isCall) {
		const ops = this.cur.program[label];
		if (!ops) return false;
		if (isCall) this.cur.frames.push({ ops, i: 0 });
		else { const fr = this._frame(); fr.ops = ops; fr.i = 0; }
		return true;
	}

	_actor(who) {
		const ctx = this.cur.ctx;
		if (who === 'LOCALID_PLAYER' || who === 'player' || who == null) return ctx.player;
		return ctx.npcById?.(who) || null;
	}

	// iterative interpreter: run instant ops until one waits (msg/move/wait) or
	// the program ends. Control flow mutates the frame stack; never recurses.
	_enter() {
		let guard = 0;
		while (this.cur && guard++ < 100000) {
			const c = this.cur;
			if (!c.frames.length) return this._finish();
			const fr = this._frame();
			if (fr.i >= fr.ops.length) { c.frames.pop(); continue; }
			const op = fr.ops[fr.i];
			const ctx = c.ctx;
			switch (op.op) {
				case 'lock': case 'release': case 'waitmove': case 'waitmsg':
				case 'closemsg': case 'waitstate': case 'fade': break;
				case 'faceplayer': if (ctx.talker && ctx.player) ctx.talker.facing = opposite(ctx.player.facing); break;
				case 'face': { const a = this._actor(op.who); if (a && op.dir) a.facing = op.dir; break; }
				case 'setflag': setFlag(op.flag); break;
				case 'clearflag': clearFlag(op.flag); break;
				case 'setvar': setVar(op.var, resolveValue(op.value)); break;
				case 'addvar': setVar(op.var, getVar(op.var) + resolveValue(op.value)); break;
				case 'copyvar': setVar(op.dst, resolveValue(op.src)); break;
				case 'setrespawn': break;
				case 'give': ctx.giveItem?.(itemId(op.item), op.count || 1); break;
				case 'takeitem': ctx.takeItem?.(itemId(op.item), op.count || 1); break;
				case 'givemon': ctx.giveMon?.(speciesId(op.species), resolveValue(op.level) || 5); break;
				case 'hideobj': { const a = this._actor(op.who); if (a) a.hidden = true; ctx.hideObj?.(op.who); break; }
				case 'showobj': { const a = this._actor(op.who); if (a) a.hidden = false; ctx.showObj?.(op.who); break; }
				case 'setobjxy': ctx.setObjXy?.(op.who, op.x, op.y); break;
				case 'setmetatile': ctx.setMetatile?.(op.x, op.y, op.tile, op.impassable); break;
				case 'special':
					if (ctx.special?.(op.name, op.store) === 'wait') { this._advance(); c.sub = { kind: 'special' }; return; }
					break;
				case 'goto': this._goto(op.label, false); continue; // no advance
				case 'call': this._advance(); this._goto(op.label, true); continue;
				case 'return': if (c.frames.length) c.frames.pop(); continue;
				case 'end': return this._finish();
				case 'branch': {
					let hit;
					if (op.cond.flag != null) hit = getFlag(op.cond.flag) === !!op.cond.state;
					else hit = cmp(getVar(op.cond.var), op.cond.cmp, resolveValue(op.cond.value));
					if (hit) {
						if (op.kind === 'call') { this._advance(); this._goto(op.label, true); }
						else this._goto(op.label, false);
						continue;
					}
					break;
				}
				case 'warp': ctx.warp?.(op.map, resolveValue(op.warp) || 0); return this._finish();
				case 'trainerbattle': {
					// trainerbattle_single is self-contained: intro text -> battle ->
					// (on win) defeat text -> optional post-battle script. Expand it
					// into a sub-sequence and run that.
					const a = op.args || [];
					const texts = a.filter(x => /_Text_/.test(x));
					const post = a.find(x => /_EventScript_/.test(x));
					const seq = [];
					if (texts[0]) seq.push({ op: 'msg', text: texts[0] });
					seq.push({ op: '__battle', trainer: a[0] });
					if (texts[1]) seq.push({ op: '__wontext', text: texts[1] });
					if (post) seq.push({ op: 'goto', label: post });
					seq.push({ op: 'return' });
					this._advance();
					c.program.__tb__ = seq; // held by reference once pushed (safe to overwrite)
					this._goto('__tb__', true);
					continue;
				}
				case '__battle':
					if (ctx.startBattle?.(op.trainer) === 'wait') { this._advance(); c.sub = { kind: 'battle' }; return; }
					break;
				case '__wontext':
					// only shown after a win; on a loss the script was already stopped
					if (getVar('VAR_RESULT') === 1) { ctx.dialog.open(resolveText(ctx, op.text)); this._advance(); c.sub = { kind: 'say' }; return; }
					break;
				case 'say': case 'msg': ctx.dialog.open(resolveText(ctx, op.text)); this._advance(); c.sub = { kind: 'say' }; return;
				case 'move': { const plan = this._planMove(op); if (plan) { this._advance(); c.sub = plan; return; } break; }
				case 'wait': this._advance(); c.sub = { kind: 'wait', left: (op.frames || 16) / 60 }; return;
				default: break;
			}
			this._advance();
		}
	}

	// a wait finished — resume the interpreter (cursor is already past the op)
	_resume() { const c = this.cur; if (c) { c.sub = null; this._enter(); } }

	_planMove(op) {
		const actor = this._actor(op.who);
		if (!actor) return null;
		let steps = op.steps;
		if (!steps && op.path) steps = op.path.map(d => ({ dir: d, mode: 'walk' }));
		if (!steps && op.dir && op.count) steps = Array(op.count).fill({ dir: op.dir, mode: 'walk' });
		if (!steps || !steps.length) return null;
		return { kind: 'move', actor, steps, k: 0, from: null };
	}

	update(dt) {
		const c = this.cur;
		if (!c || !c.sub) return;
		const s = c.sub;
		if (s.kind === 'say') { if (!c.ctx.dialog.blocking) this._resume(); return; }
		if (s.kind === 'special' || s.kind === 'battle') return; // resumed via resume()
		if (s.kind === 'wait') { s.left -= dt; if (s.left <= 0) this._resume(); return; }
		if (s.kind === 'move') {
			const actor = s.actor;
			if (s.from == null) {
				if (s.k >= s.steps.length) return this._resume();
				const st = s.steps[s.k];
				if (st.mode === 'face') { actor.facing = st.dir; s.k++; return; }
				if (st.mode === 'noop') { s.k++; return; }
				if (st.mode === 'delay') { s.from = 'delay'; s.t = 0; s.dur = (st.frames || 8) / 60; return; }
				if (st.mode === 'invisible') { actor.hidden = st.v; s.k++; return; }
				const [dx, dy] = DIRS[st.dir] || [0, 0];
				actor.facing = st.dir;
				s.from = [actor.tx, actor.ty];
				s.to = [actor.tx + dx, actor.ty + dy];
				s.t = 0; s.dur = STEP_TIME[st.mode] || STEP_TIME.walk;
				if (typeof actor.stepParity === 'number') actor.stepParity ^= 1;
				return;
			}
			if (s.from === 'delay') { s.t += dt; if (s.t >= s.dur) { s.k++; s.from = null; } return; }
			s.t += dt / (s.dur || STEP_TIME.walk);
			const p = Math.min(1, s.t);
			actor.px = s.from[0] * META + (s.to[0] - s.from[0]) * META * p;
			actor.py = s.from[1] * META + (s.to[1] - s.from[1]) * META * p;
			if (typeof actor.moving === 'boolean') actor.moving = p < 1;
			if (p >= 1) {
				actor.tx = s.to[0]; actor.ty = s.to[1];
				actor.px = actor.tx * META; actor.py = actor.ty * META;
				s.k++; s.from = null;
				if (s.k >= s.steps.length) this._resume();
			}
		}
	}

	// a special/trainerbattle that returned 'wait' resumes here when ready
	resume() { if (this.cur && this.cur.sub && (this.cur.sub.kind === 'special' || this.cur.sub.kind === 'battle')) this._resume(); }
}

function opposite(dir) { return { up: 'down', down: 'up', left: 'right', right: 'left' }[dir] || 'down'; }

// resolve a msg's text: the map's own strings first, then the shared common
// map (cross-map / gText labels), else the literal (hand-authored). Substitute
// the common {PLAYER}/{RIVAL} tokens.
function resolveText(ctx, ref) {
	let s = ref;
	if (ctx.strings && ctx.strings[ref] != null) s = ctx.strings[ref];
	else if (ctx.common && ctx.common[ref] != null) s = ctx.common[ref];
	if (typeof s !== 'string') return '...';
	s = s.replace(/\{PLAYER\}/g, ctx.playerName || 'PLAYER')
		.replace(/\{RIVAL\}/g, ctx.rivalName || 'RIVAL')
		.replace(/\{[^{}]*\}/g, '')          // drop any remaining control token, incl. arg'd ones like {PAUSE 0x56}
		.replace(/é/g, 'e').replace(/É/g, 'E') // POKéMON -> POKeMON, to match the game's font/convention
		.replace(/[ \t]+\n/g, '\n')          // trailing spaces left by a stripped inline code
		.replace(/\n{3,}/g, '\n\n');         // collapse gaps left where a code stood alone on a line
	return s.trim() || '...';
}

// ITEM_POKE_BALL -> pokeball ; SPECIES_BULBASAUR -> bulbasaur
function itemId(sym) {
	if (typeof sym !== 'string') return sym;
	return sym.replace(/^ITEM_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function speciesId(sym) {
	if (typeof sym !== 'string') return sym;
	return sym.replace(/^SPECIES_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
