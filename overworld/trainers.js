// trainers.js — trainer NPCs: sight lines, the "!" moment, walk-up, and
// engagement. Rosters come from trainers.json (FireRed decomp + Johto
// pokecrystal + hand-crafted gym leaders); fallback teams from class pools.
import { getJSON, getImage, META } from './engine.js';
import { buildMon } from './battle.js';
import { safeLoad, safeSave } from './safestore.js';

const FACE_OF = {
	MOVEMENT_TYPE_FACE_DOWN: 'down', MOVEMENT_TYPE_FACE_UP: 'up',
	MOVEMENT_TYPE_FACE_LEFT: 'left', MOVEMENT_TYPE_FACE_RIGHT: 'right',
	MOVEMENT_TYPE_FACE_DOWN_IF_FIELD_MOVES: 'down',
	MOVEMENT_TYPE_FACE_UP_IF_FIELD_MOVES: 'up',
	MOVEMENT_TYPE_FACE_LEFT_IF_FIELD_MOVES: 'left',
	MOVEMENT_TYPE_FACE_RIGHT_IF_FIELD_MOVES: 'right',
};
const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const DEFEATED_KEY = 'magepunk_defeated_v1';

// The Emerald sprite set was never imported, so Hoenn gym leaders (and some NPCs)
// have no people/*.png and would silently fail to spawn — leaving Hoenn gyms
// unbeatable. Fall back to a gender-appropriate generic so they render + battle.
// (gfx_map.json lives in the read-only owdata data, so this must live in code.)
export const SPRITE_FALLBACK = {
	OBJ_EVENT_GFX_ROXANNE: 'woman_1.png', OBJ_EVENT_GFX_FLANNERY: 'woman_2.png',
	OBJ_EVENT_GFX_WINONA: 'woman_3.png', OBJ_EVENT_GFX_LIZA: 'beauty.png',
	OBJ_EVENT_GFX_BRAWLY: 'cooltrainer_m.png', OBJ_EVENT_GFX_TATE: 'cooltrainer_m.png',
	OBJ_EVENT_GFX_WATTSON: 'gentleman.png', OBJ_EVENT_GFX_NORMAN: 'gentleman.png',
	OBJ_EVENT_GFX_JUAN: 'gentleman.png', OBJ_EVENT_GFX_WALLACE: 'gentleman.png',
};
export const spriteFor = (graphicsId, isTrainer) =>
	SPRITE_FALLBACK[graphicsId] || (isTrainer ? 'cooltrainer_m.png' : 'man.png');

// all battle-capable trainers, including talk-to ones (sight range 0 — gym
// leaders etc.). npcs.js excludes these; trainers.js renders them.
export function isTrainerEvent(ev) {
	// object_events are always objects; the Emerald (Hoenn) map parser omits the
	// `type` field entirely, so treat a missing type as 'object' (else no Hoenn
	// trainer — gym leaders included — would ever spawn)
	return (ev.type === 'object' || ev.type == null)
		&& (ev.trainer_type === 'TRAINER_TYPE_NORMAL' || ev.trainer_type === 'TRAINER_TYPE_SEE_ALL_DIRECTIONS')
		&& ev.script && ev.script !== '0x0';
}

class Trainer {
	constructor(ev, img) {
		this.ev = ev;
		this.img = img;
		this.frames = Math.floor(img.width / 16);
		this.tx = ev.x; this.ty = ev.y;
		this.px = ev.x * META; this.py = ev.y * META;
		this.facing = FACE_OF[ev.movement_type] || 'down';
		this.range = parseInt(ev.trainer_sight_or_berry_tree_id, 10) || 0;
		this.seeAll = ev.trainer_type === 'TRAINER_TYPE_SEE_ALL_DIRECTIONS';
		this.exclaim = 0;
	}

	draw(ctx, camX, camY) {
		const stills = { down: 0, up: 1, left: 2, right: 2 };
		let frame = stills[this.facing];
		if (frame >= this.frames) frame = 0;
		const x = Math.round(this.px - camX), y = Math.round(this.py - 16 - camY);
		ctx.save();
		if (this.facing === 'right') { ctx.translate(x + 16, y); ctx.scale(-1, 1); }
		else ctx.translate(x, y);
		ctx.drawImage(this.img, frame * 16, 0, 16, 32, 0, 0, 16, 32);
		ctx.restore();
		if (this.exclaim > 0) {
			ctx.fillStyle = '#fff';
			ctx.fillRect(x + 4, y - 11, 8, 10);
			ctx.strokeStyle = '#222';
			ctx.strokeRect(x + 4.5, y - 10.5, 7, 9);
			ctx.fillStyle = '#c02020';
			ctx.font = 'bold 9px monospace';
			ctx.fillText('!', x + 6, y - 3);
		}
	}
}

export class Trainers {
	constructor(world, player) {
		this.world = world;
		this.player = player;
		this.list = [];
		this.data = null;
		this.gfx = null;
		this.engagement = null; // { trainer, phase: 'exclaim'|'walk', t }
		this.onEngage = null;   // set by main.js
		this.spawnFlagged = null; // set by main.js: predicate to un-hide villain-grunt events during a beat
		{ const d = safeLoad(DEFEATED_KEY, []); this.defeated = new Set(Array.isArray(d) ? d : []); }
	}

	async init() {
		[this.data, this.gfx] = await Promise.all([
			getJSON('data/trainers.json'),
			getJSON('data/gfx_map.json'),
		]);
	}

	keyOf(t) {
		return `${this.world.current.map.id}:${t.ev.local_id || t.ev.script || `${t.ev.x},${t.ev.y}`}`;
	}

	isDefeated(t) { return this.defeated.has(this.keyOf(t)); }

	markDefeated(t) {
		this.defeated.add(this.keyOf(t));
		safeSave(DEFEATED_KEY, [...this.defeated]);
	}

	// battleable = flagged trainer event OR any NPC whose script has a roster
	// entry (gym leaders are TRAINER_TYPE_NONE but script-battled)
	claims(ev) {
		if (isTrainerEvent(ev)) return true;
		return (ev.type === 'object' || ev.type == null) && ev.script && this.data?.rosters?.[ev.script] != null;
	}

	async loadForMap() {
		this.list = [];
		this.engagement = null;
		const evs = this.world.current.map.object_events || [];
		await Promise.all(evs.map(async ev => {
			if (!this.claims(ev)) return;
			// hidden story trainers are skipped — EXCEPT villain grunts that the active
			// quest beat wants populating the dungeon (main.js sets spawnFlagged)
			const flagged = ev.flag && ev.flag !== '0';
			if (flagged && !(this.spawnFlagged && this.spawnFlagged(ev))) return;
			// gfx map first, then guess from the id (OBJ_EVENT_GFX_BROCK -> brock.png)
			const file = this.gfx[ev.graphics_id]
				|| (ev.graphics_id || '').replace('OBJ_EVENT_GFX_', '').toLowerCase() + '.png';
			let img = await getImage(`data/people/${file}`).catch(() => null);
			// missing sprite (e.g. Hoenn leaders) must NOT hide a battleable trainer
			if (!img) img = await getImage(`data/people/${spriteFor(ev.graphics_id, true)}`).catch(() => null);
			if (img) { const t = new Trainer(ev, img); if (flagged) t.villain = true; this.list.push(t); }
		}));
	}

	occupied(tx, ty) {
		// a defeated trainer no longer blocks its tile — so a beaten grunt can't wall
		// a dungeon corridor (checkSight already skips defeated, so no re-battle)
		return this.list.some(t => t.tx === tx && t.ty === ty && !this.isDefeated(t));
	}

	get engaging() { return this.engagement != null; }

	trainerAt(tx, ty) {
		return this.list.find(t => t.tx === tx && t.ty === ty) || null;
	}

	// talk-to engagement (Z in front of any trainer, incl. sight range 0)
	talkTo(t, playerFacing) {
		if (this.engagement) return;
		t.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[playerFacing] || t.facing;
		this.onEngage?.(t);
	}

	// called when the player finishes a step; true if a trainer spotted them
	checkSight(ptx, pty) {
		if (this.engagement) return true;
		for (const t of this.list) {
			if (t.range <= 0) continue; // talk-to trainers don't spot you
			if (this.isDefeated(t)) continue;
			const dirs = t.seeAll ? ['down', 'up', 'left', 'right'] : [t.facing];
			for (const dir of dirs) {
				const [dx, dy] = DIRS[dir];
				for (let i = 1; i <= t.range; i++) {
					const cx = t.tx + dx * i, cy = t.ty + dy * i;
					if (cx === ptx && cy === pty) {
						t.facing = dir;
						this.engagement = { trainer: t, phase: 'exclaim', t: 0, steps: i - 1, dir };
						t.exclaim = 0.9;
						return true;
					}
					if (!this.world.isPassable(cx, cy)) break; // wall blocks the view
				}
			}
		}
		return false;
	}

	update(dt) {
		for (const t of this.list) if (t.exclaim > 0) t.exclaim -= dt;
		const e = this.engagement;
		if (!e) return;
		e.t += dt;
		const t = e.trainer;
		if (e.phase === 'exclaim') {
			if (e.t > 0.9) { e.phase = 'walk'; e.t = 0; }
			return;
		}
		if (e.phase === 'walk') {
			if (e.steps <= 0) {
				// arrived: face the player, hand off to battle
				this.engagement = null;
				this.onEngage?.(t);
				return;
			}
			const [dx, dy] = DIRS[e.dir];
			const speed = META / 0.16; // ~FireRed approach pace
			t.px += dx * speed * dt;
			t.py += dy * speed * dt;
			const targetX = (t.tx + dx) * META, targetY = (t.ty + dy) * META;
			if ((dx && Math.abs(t.px - t.tx * META) >= META) || (dy && Math.abs(t.py - t.ty * META) >= META)) {
				t.tx += dx; t.ty += dy;
				t.px = t.tx * META; t.py = t.ty * META;
				e.steps--;
			}
		}
	}

	// team + display info for a trainer (buildParty/buildInfo port)
	buildBattle(t, data) {
		const script = t.ev.script && t.ev.script !== '0x0' ? t.ev.script : null;
		const roster = script ? this.data.rosters[script] : null;
		let party = [];
		if (roster?.party?.length) {
			party = roster.party.map(e => buildMon(e.s, e.l, data)).filter(Boolean);
		}
		if (!party.length) {
			const pool = this.data.classPools[t.ev.graphics_id] || this.data.defaultPool;
			const base = this.data.mapLevel[this.world.current.map.id] || 20;
			const n = 1 + Math.floor(Math.random() * 2);
			for (let i = 0; i < n; i++) {
				const s = pool[Math.floor(Math.random() * pool.length)];
				const lv = Math.max(5, base + Math.floor(Math.random() * 7) - 3);
				const mon = buildMon(s, lv, data);
				if (mon) party.push(mon);
			}
		}
		const className = roster?.class || this.data.classNames[t.ev.graphics_id] || 'Trainer';
		const name = roster?.name || '';
		const displayName = name ? `${className} ${name}` : className;
		const high = Math.max(5, ...party.map(m => m.level));
		return {
			party,
			info: {
				displayName,
				introQuote: roster?.introQuote || null,
				defeatText: roster?.defeatText || `${displayName} was defeated!`,
				money: high * 8,
			},
		};
	}

	draw(ctx, camX, camY) {
		// handled via main's y-sorted sprite list; kept for the ! overlay pass
	}
}
