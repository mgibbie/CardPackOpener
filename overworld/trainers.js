// trainers.js — trainer NPCs: sight lines, the "!" moment, walk-up, and
// engagement. Rosters come from trainers.json (FireRed decomp + Johto
// pokecrystal + hand-crafted gym leaders); fallback teams from class pools.
import { getJSON, getImage, META } from './engine.js';
import { buildMon } from './battle.js';

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

export function isTrainerEvent(ev) {
	return ev.type === 'object'
		&& (ev.trainer_type === 'TRAINER_TYPE_NORMAL' || ev.trainer_type === 'TRAINER_TYPE_SEE_ALL_DIRECTIONS')
		&& parseInt(ev.trainer_sight_or_berry_tree_id, 10) > 0;
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
		try { this.defeated = new Set(JSON.parse(localStorage.getItem(DEFEATED_KEY) || '[]')); }
		catch (e) { this.defeated = new Set(); }
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
		try { localStorage.setItem(DEFEATED_KEY, JSON.stringify([...this.defeated])); } catch (e) {}
	}

	async loadForMap() {
		this.list = [];
		this.engagement = null;
		const evs = this.world.current.map.object_events || [];
		await Promise.all(evs.map(async ev => {
			if (!isTrainerEvent(ev)) return;
			if (ev.flag && ev.flag !== '0') return;
			const file = this.gfx[ev.graphics_id];
			if (!file) return;
			const img = await getImage(`data/people/${file}`).catch(() => null);
			if (img) this.list.push(new Trainer(ev, img));
		}));
	}

	occupied(tx, ty) {
		return this.list.some(t => t.tx === tx && t.ty === ty);
	}

	get engaging() { return this.engagement != null; }

	// called when the player finishes a step; true if a trainer spotted them
	checkSight(ptx, pty) {
		if (this.engagement) return true;
		for (const t of this.list) {
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
				defeatText: roster?.defeatText || `${displayName} was defeated!`,
				money: high * 8,
			},
		};
	}

	draw(ctx, camX, camY) {
		// handled via main's y-sorted sprite list; kept for the ! overlay pass
	}
}
