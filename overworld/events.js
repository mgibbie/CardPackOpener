// events.js — story progression: a persisted flag/var store plus a cutscene
// interpreter. Cutscenes are opcode lists (data) — hand-authored or transpiled
// from the decomp map scripts. The interpreter is label-addressable with a call
// stack, so ported scripts' goto/call/return control flow works. While a
// cutscene runs it freezes player input and drives NPC/player movement + text.
import { safeLoad, safeSave } from './safestore.js';
import { STD_OF, STD_TEXT } from './crystal_stds.js';
import { SCENE_SET } from './crystal_scenes.js';
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

// ---------- object visibility ----------
// Crystal hides an object_event while its event flag is SET, and shows it while
// clear (engine/overworld/map_objects_2.asm, CheckObjectFlag: CHECK_FLAG, then
// `jr nz, .masked`; a flag of -1 means "always appear"). `clearevent` is how a
// set-piece delivers its cast.
//
// This port hid an object that had a flag AT ALL, whichever way the flag pointed
// — so every story NPC in the Crystal regions was deleted from the game for
// good. MISTY and the whole Cerulean Gym, and BLUE and his Viridian Gym guide,
// were among them, which made two Gen-2 Kanto badges UNOBTAINABLE and left RED
// sealed behind a gate wanting eight badges that could only ever reach six.
//
// Crystal only, deliberately. Reading the flag honestly needs the right STARTING
// state, and Crystal has one seeded from its own InitializeEventsScript
// (crystal_init_events.js) — which is what keeps Misty at the Cerulean Cape
// rather than in her gym on day one. FireRed and Emerald keep the blanket rule
// until their own initial-flag state is ported: their FLAG_HIDE_*,
// FLAG_DECORATION_* and FLAG_TEMP_* families gate ~2,400 objects that would
// otherwise all appear at once.
export function objectHiddenByFlag(ev, crystal) {
	const f = ev && ev.flag;
	if (!f || f === '0') return false;   // no flag: always visible
	if (!crystal) return true;           // FireRed / Emerald: unchanged for now
	return getFlag(f);                   // Crystal: hidden only while the flag is SET
}

// resolve a symbolic value (a var name, TRUE/FALSE, or a literal number)
// How a battle ended, as the decomp scripts name it (include/constants/battle.h).
// 188 branches across the ported scripts compare VAR_RESULT against these, and
// every one of them was dead: the symbol fell through to `Number(v)` -> NaN ->
// the raw string, so a numeric VAR_RESULT could never equal it. That was
// invisible while no scripted battle recorded an outcome; now that static wild
// battles run for real, the post-battle branches need to resolve.
const B_OUTCOME = {
	B_OUTCOME_WON: 1, B_OUTCOME_LOST: 2, B_OUTCOME_DREW: 3, B_OUTCOME_RAN: 4,
	B_OUTCOME_PLAYER_TELEPORTED: 5, B_OUTCOME_MON_FLED: 6, B_OUTCOME_CAUGHT: 7,
	B_OUTCOME_NO_SAFARI_BALLS: 8, B_OUTCOME_FORFEITED: 9, B_OUTCOME_MON_TELEPORTED: 10,
};
function resolveValue(v) {
	if (typeof v === 'number') return v;
	if (v === 'TRUE') return 1;
	if (v === 'FALSE') return 0;
	if (typeof v === 'string' && B_OUTCOME[v] !== undefined) return B_OUTCOME[v];
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
// The decomp keeps a library of shared scripts (Common_EventScript_*) that the
// transpile never emitted, so ~500 jumps across the three regions point at
// nothing. Dangling jumps are survivable now (see the `goto` case), but the
// most common ones carry real meaning, so give them a body rather than let the
// script skip a beat the player should see.
const COMMON_STUBS = {
	Common_EventScript_NopReturn: [{ op: 'return' }],
	EventScript_Return: [{ op: 'return' }],
	EventScript_ReleaseEnd: [{ op: 'release' }, { op: 'end' }],
	Common_EventScript_ShowBagIsFull: [{ op: 'msg', text: 'There is no room left in your BAG.' }, { op: 'return' }],
	Common_EventScript_BagIsFull: [{ op: 'msg', text: 'There is no room left in your BAG.' }, { op: 'return' }],
	// cosmetic text-window plumbing with nothing to show here
	EventScript_RestorePrevTextColor: [{ op: 'return' }],
	Common_EventScript_SaveGame: [{ op: 'return' }],
	// link-cable rooms: this port has its own multiplayer, so these are inert
	CableClub_EventScript_TradeCenter: [{ op: 'return' }],
	CableClub_EventScript_RecordCorner: [{ op: 'return' }],
	CableClub_EventScript_Colosseum: [{ op: 'return' }],
	// a static legendary you failed to catch, and the clean-up that removes it
	// from the map afterwards
	Common_EventScript_LegendaryFlewAway: [{ op: 'msg', text: 'The POKeMON flew away!' }, { op: 'return' }],
	Common_EventScript_RemoveStaticPokemon: [{ op: 'return' }],
	// engine plumbing with no counterpart here: fanfares, the nickname prompt,
	// rival sprite selection, the trendy-phrase and Briney/weather bookkeeping
	Common_EventScript_PlayGymBadgeFanfare: [{ op: 'return' }],
	Common_EventScript_NameReceivedPartyMon: [{ op: 'return' }],
	Common_EventScript_SetupRivalGfxId: [{ op: 'return' }],
	Common_EventScript_BufferTrendyPhrase: [{ op: 'return' }],
	Common_EventScript_UpdateBrineyLocation: [{ op: 'return' }],
	Common_EventScript_SetAbnormalWeather: [{ op: 'return' }],
	// a nurse reached through the shared script rather than the port's own
	// counter NPC still has to actually heal you
	Common_EventScript_PkmnCenterNurse: [{ op: 'special', name: 'HealPlayerParty' },
		{ op: 'msg', text: 'We restored your POKeMON to full health.' }, { op: 'return' }],
	EventScript_PkmnCenterNurse: [{ op: 'special', name: 'HealPlayerParty' },
		{ op: 'msg', text: 'We restored your POKeMON to full health.' }, { op: 'return' }],
};

// ---------- Crystal's shared scripts ----------
// Crystal factors its common NPCs through `jumpstd <StdScript>`, and the
// transpiler emits nothing for that op — so a label whose whole body is one
// jumpstd vanished from the script file and 237 objects and signs across Gen-2
// Kanto and Johto did nothing at all when talked to. Every bookshelf, every
// POKeMON CENTER and MART sign, every trash can, the Game Corner coin vendor.
//
// This is the same idea as COMMON_STUBS above, for the other decomp. The text
// ones come straight from pokecrystal's std_text.asm (crystal_stds.js); the rest
// are behavioural and get a body here.
const STD_BODY = {
	// the healing itself is a service tile (services.js), so talking to the nurse
	// from anywhere else just gets her line
	PokecenterNurseScript: [{ op: 'special', name: 'HealPlayerParty' },
		{ op: 'msg', text: 'We hope to see you again!' }, { op: 'end' }],
	// Crystal's button is a sound and nothing else; say something rather than
	// leave a dead tile
	ElevatorButtonScript: [{ op: 'msg', text: 'The ELEVATOR button is lit.' }, { op: 'end' }],
	HappinessCheckScript: [{ op: 'special', name: 'GetLeadMonFriendshipScore', store: 'VAR_RESULT' },
		{ op: 'msg', text: 'Your POKeMON looks happy to be with you!' }, { op: 'end' }],
	GameCornerCoinVendorScript: [{ op: 'msg', text: 'Care to buy some COINS for the GAME CORNER?' }, { op: 'end' }],
	Radio2Script: [{ op: 'msg', text: 'The RADIO is playing a cheerful POKeMON march.' }, { op: 'end' }],
	// StrengthBoulderScript / SmashRockScript are deliberately absent: those
	// objects are handled as HM field obstacles by items.js off their graphics_id,
	// which is the mechanism that actually moves and breaks them. Giving them a
	// talk script here would put a message in front of the HM prompt.
};
// the ops for a label the map script does not have, or null
export function crystalStd(label) {
	const std = STD_OF[label];
	if (!std) return null;
	if (STD_BODY[std]) return STD_BODY[std];
	const text = STD_TEXT[std];
	return text ? [{ op: 'msg', text }, { op: 'end' }] : null;
}

// ---------- Crystal scenes ----------
// A "scene" is Crystal's per-map story state, and its coord_events gate on it.
// Scripts move it with `setscene` / `setmapscene`, and THE TRANSPILER EMITS
// NEITHER — 163 scene ops across 85 maps, all dropped, so no scene in the game
// could ever arm or advance. Misty's date and the Power Plant guard's phone call
// both sit at scene 1 and were unreachable; Johto's scene-0 beats could never
// switch themselves off, which is what PLOT_ONESHOT was working around.
//
// crystal_scenes.js is the recovered table, keyed by the label the op sat in and
// lowered to the VAR_SCENE_<Map> vars coord_events already read. Applied on entry
// to a label — precise rather than approximate, because the transpiler keeps the
// decomp's sub-labels, so a setscene inside a conditional is keyed to its own
// `.Branch` and only fires when that branch is actually taken.
function applyScenes(label) {
	const sets = SCENE_SET[label];
	if (!sets) return;
	for (const [v, n] of sets) setVar(v, n);
}

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
		applyScenes(entryLabel);
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
		const ops = this.cur.program[label] || COMMON_STUBS[label];
		if (!ops) return false;
		applyScenes(label);
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
				case 'give': { const g = giveArgs(op); if (g.id) ctx.giveItem?.(g.id, g.n); break; }
				case 'takeitem': { const g = giveArgs(op); if (g.id) ctx.takeItem?.(g.id, g.n); break; }
				case 'givemon': ctx.giveMon?.(speciesId(op.species), resolveValue(op.level) || 5); break;
				// an EGG gift (Crystal's `giveegg`) — the mon arrives unhatched, so it
				// goes to the party/box as an egg with a step counter, not as a Pokémon
				case 'giveegg': ctx.giveEgg?.(speciesId(op.species), resolveValue(op.level) || 5); break;
				// a STATIC wild battle: Snorlax in the road, the Sudowoodo posing as a
				// tree, the Rocket-base Voltorb. Both transpilers lost these — FireRed's
				// `setwildbattle`/`dowildbattle` vanished outright and Crystal's
				// `loadwildmon`/`startbattle` became a `trainerbattle` with no trainer —
				// so the scripts ran the whole encounter and simply never fought. It
				// blocks like a trainer battle, because the script reads the outcome
				// afterwards and branches on it.
				case 'wildbattle':
					if (ctx.wildBattle?.(speciesId(op.species), resolveValue(op.level) || 5) === 'wait') {
						this._advance(); c.sub = { kind: 'battle' }; return;
					}
					break;
				case 'hideobj': { const a = this._actor(op.who); if (a) a.hidden = true; ctx.hideObj?.(op.who); break; }
				case 'showobj': { const a = this._actor(op.who); if (a) a.hidden = false; ctx.showObj?.(op.who); break; }
				case 'setobjxy': ctx.setObjXy?.(op.who, op.x, op.y); break;
			// script-run marts (department-store floors, the Battle Frontier mart,
			// most Johto/Kanto clerks): the transpile dropped the decomp's item-list
			// pointer, so this opens the standard shop. Waits like a message so the
			// rest of the clerk's script resumes when the counter closes.
			case 'openmart':
				if (ctx.openMart?.() === 'wait') { this._advance(); c.sub = { kind: 'special' }; return; }
				break;
				case 'setmetatile': ctx.setMetatile?.(op.x, op.y, op.tile, op.impassable); break;
				// Crystal's yes/no box. It writes its answer where the following
				// iftrue/iffalse reads it, so it lowers onto VAR_RESULT and the ordinary
				// var branch. Default YES before asking, so a context with no prompt
				// (a headless harness) takes the agreed path deterministically rather
				// than silently refusing — refusing is what the old mistranspile did,
				// and it is why the BICYCLE and the SUPER ROD could never be obtained.
				case 'prompt':
					setVar('VAR_RESULT', 1);
					if (ctx.prompt?.() === 'wait') { this._advance(); c.sub = { kind: 'special' }; return; }
					break;
				case 'special':
					if (ctx.special?.(op.name, op.store) === 'wait') { this._advance(); c.sub = { kind: 'special' }; return; }
					break;
				// A jump to a label this map doesn't define used to `continue`
				// without advancing — the same op re-ran until the loop guard
				// tripped, and the cutscene was left blocking FOREVER (a hard
				// freeze: input is swallowed while a cutscene runs). The
				// transpile leaves ~500 of these, mostly shared Common_* labels
				// that never got emitted. Treat a dangling jump as a no-op and
				// carry on with the rest of the script.
				case 'goto': if (!this._goto(op.label, false)) this._advance(); continue;
				case 'call': this._advance(); this._goto(op.label, true); continue;
				case 'return': if (c.frames.length) c.frames.pop(); continue;
				case 'end': return this._finish();
				case 'branch': {
					let hit;
					// `checkitem X` -> an ITEM condition. It used to transpile to a
					// byte-identical copy of the preceding `checkevent`, which the first
					// branch had already consumed, so the test was provably unreachable
					// and every "do you have item X" gate in the game was dead.
					if (op.cond.item != null) hit = !!ctx.hasItem?.(itemId(op.cond.item)) === !!op.cond.state;
					else if (op.cond.flag != null) hit = getFlag(op.cond.flag) === !!op.cond.state;
					else hit = cmp(getVar(op.cond.var), op.cond.cmp, resolveValue(op.cond.value));
					if (hit) {
						if (op.kind === 'call') { this._advance(); this._goto(op.label, true); }
						else if (!this._goto(op.label, false)) this._advance(); // dangling: don't spin
						continue;
					}
					break;
				}
				// The transpile mangles two warp shapes. Some lost the MAP_ prefix
				// (VERMILION_PORT) — fileFor() tolerates that. Others had their map
				// and warp-id SWAPPED, leaving a direction constant in `map` and the
				// real destination in `warp` (`warp UP, HALL_OF_FAME`); that stranded
				// the Fast Ship gangways, Lance's room and the Bug Contest gates.
				case 'warp': {
					let map = op.map, id = resolveValue(op.warp) || 0;
					if (WARP_NOT_A_MAP.test(String(map))) {
						if (typeof op.warp !== 'string' || WARP_NOT_A_MAP.test(op.warp)) return this._finish();
						map = op.warp; id = 0;
					}
					ctx.warp?.(map, id);
					return this._finish();
				}
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
		// Safety net: if we ever burn the whole budget, END the scene instead of
		// returning while still holding `blocking` — a stuck cutscene swallows
		// all input, which strands the player with no way out but a reload.
		if (this.cur && guard >= 100000) {
			console.warn('[plot] script exceeded its op budget — releasing the player');
			this._finish();
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
// Everything the ported scripts hand to the dialog box goes through here: NPC
// speech (via resolveText) and signposts alike, so a display quirk is fixed in
// one place. Exported for the sign path, which looks its text up directly.
export function normalizeText(s, ctx = {}) {
	if (typeof s !== 'string') return '...';
	s = s.replace(/\{PLAYER\}/g, ctx.playerName || 'PLAYER')
		.replace(/\{RIVAL\}/g, ctx.rivalName || 'RIVAL')
		.replace(/\{[^{}]*\}/g, '')          // drop any remaining control token, incl. arg'd ones like {PAUSE 0x56}
		// pokecrystal's charmap prints "#" as POKé, so the ported Johto strings
		// are full of "#MON" / "#DEX" / "# BALL". Expand before the é fold below.
		.replace(/#/g, 'POKé')
		// pokecrystal splices a runtime buffer in at '@' (the caught POKeMON's
		// name, a minute count, the day of the week). Nothing fills those here,
		// so they reached the player as a bare "@" — "Ah, so that is @?". Read
		// them as an elision rather than a glitch character.
		.replace(/@+/g, '...')
		.replace(/é/g, 'e').replace(/É/g, 'E') // POKéMON -> POKeMON, to match the game's font/convention
		.replace(/[ \t]+\n/g, '\n')          // trailing spaces left by a stripped inline code
		.replace(/\n{3,}/g, '\n\n');         // collapse gaps left where a code stood alone on a line
	s = s.trim();
	// the transpile dropped a leading name placeholder on a handful of lines,
	// leaving them opening on punctuation ("!\n\nUse these on your POKeDEX
	// quest!"). Put the name back rather than show the bare mark.
	if (/^[!,.?;:]/.test(s)) s = (ctx.playerName || 'PLAYER') + s;
	return s || '...';
}

// Directions and NONE are not destinations; they mark a warp whose fields the
// transpile shuffled (see the 'warp' case).
const WARP_NOT_A_MAP = /^(UP|DOWN|LEFT|RIGHT|NONE)$/;

// A `msg` whose label is in neither the map's strings nor _common used to fall
// through to the label ITSELF, so the NPC stood there and said
// "RadioTower1FLuckyNumberManDotDotDotText" out loud. Anything that still looks
// like an identifier — a dangling label, or a runtime buffer like gStringVar4
// that only the real GBA engine could fill — becomes an ellipsis instead. Most
// of these are silent-by-design lines anyway (Red's stare, the Dragon Shrine
// elder, the Lucky Number man's "...").
const LOOKS_LIKE_A_LABEL = /^[A-Za-z_.][A-Za-z0-9_.]*$/;
function resolveText(ctx, ref) {
	let s = ref;
	if (ctx.strings && ctx.strings[ref] != null) s = ctx.strings[ref];
	else if (ctx.common && ctx.common[ref] != null) s = ctx.common[ref];
	else if (typeof ref === 'string' && LOOKS_LIKE_A_LABEL.test(ref)) return '...';
	if (typeof s !== 'string') return '...';
	return normalizeText(s, ctx);
}

// Resolve a give/takeitem's real (item, count). The transpile SWAPPED the two
// fields for the "…and here's the message about it" macro — 37 of them (Erika's
// TM19, Misty's TM03, the Coin Case, the fossils…) carry the message label in
// `item` and the actual ITEM_ symbol in `count`. Detect that and swap back;
// otherwise read them straight. A count that isn't a number resolves to 1.
function giveArgs(op) {
	const swapped = typeof op.count === 'string' && /^ITEM_/.test(op.count);
	const id = itemId(swapped ? op.count : op.item);
	const n = swapped ? 1 : (Number.isFinite(+op.count) && +op.count > 0 ? +op.count : 1);
	return { id, n };
}

// ITEM_POKE_BALL -> pokeball ; SPECIES_BULBASAUR -> bulbasaur.
// Two malformed shapes still reach here:
//   • a TEXT label where the item belongs and NO usable count (the label spells
//     the item out, so recover it from "…Received<Thing>From…");
//   • a VAR_ symbol (a runtime-computed item, 24 of them) — unresolvable
//     statically, so hand back null and let the caller skip the give entirely.
export function itemId(sym) {
	if (typeof sym !== 'string') return sym;
	// A runtime item. The script sets the var to the real ITEM_ symbol immediately
	// before handing it over — every Game Corner prize and the Dojo reward work
	// this way — so read the var back instead of dropping the give on the floor.
	if (/^VAR_/.test(sym)) {
		const v = getVar(sym);
		return (typeof v === 'string' && /^ITEM_/.test(v)) ? itemId(v) : null;
	}
	// Placeholders the real engine fills from a table at run time — there is no
	// item behind the name, so hand back nothing rather than inventing one.
	if (/^(ITEM_FROM_MEM|REWARD_ITEM)$/.test(sym)) return null;
	if (/_Text_/.test(sym)) {
		const m = /(?:Received|Recovered|Obtained|Found)(?:A)?([A-Za-z0-9]+?)(?:From|By|$)/
			.exec(sym.split('_Text_')[1] || '');
		return m ? m[1].toLowerCase().replace(/[^a-z0-9]/g, '') : null;
	}
	return sym.replace(/^ITEM_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function speciesId(sym) {
	if (typeof sym !== 'string') return sym;
	// Same runtime-symbol trick as items: the Game Corner's Abra/Clefairy/Dratini/
	// Scyther/Porygon/Pinsir counter and Saffron's Dojo both pick the species into
	// a var first, so `givemon VAR_TEMP_1` has to read it back or hand over nothing.
	if (/^VAR_/.test(sym)) {
		const v = getVar(sym);
		return (typeof v === 'string' && /^SPECIES_/.test(v)) ? speciesId(v) : null;
	}
	return sym.replace(/^SPECIES_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
