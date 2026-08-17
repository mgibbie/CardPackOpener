// npcs.js — overworld NPCs from map object_events: sprites, facing, wander AI,
// collision. Sprite sheets share the player's frame layout (16x32 frames:
// 0 down, 1 up, 2 left stills; 3-8 walk pairs; right = mirrored left).
// Sight-range trainers are excluded here — trainers.js owns them.
import { getJSON, getImage, META } from './engine.js';
import { isTrainerEvent, spritePath } from './trainers.js';

const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const NPC_SPEED = 60; // px/s — NPCs stroll

const FACE_OF = {
	MOVEMENT_TYPE_FACE_DOWN: 'down', MOVEMENT_TYPE_FACE_UP: 'up',
	MOVEMENT_TYPE_FACE_LEFT: 'left', MOVEMENT_TYPE_FACE_RIGHT: 'right',
};

function facesFor(movementType) {
	// FACE_DOWN_AND_UP etc. / LOOK_AROUND -> the set of directions to turn among
	const m = movementType.replace('MOVEMENT_TYPE_', '');
	if (m === 'LOOK_AROUND' || m.startsWith('ROTATE')) return ['down', 'up', 'left', 'right'];
	if (m.startsWith('FACE_') && m.includes('_AND_')) {
		return m.replace('FACE_', '').split('_AND_').map(s => s.toLowerCase());
	}
	return null;
}

class NPC {
	constructor(ev, img) {
		this.ev = ev;
		this.img = img;
		this.frames = Math.floor(img.width / 16);
		this.homeX = ev.x; this.homeY = ev.y;
		this.tx = ev.x; this.ty = ev.y;
		this.px = ev.x * META; this.py = ev.y * META;
		this.rangeX = Math.max(0, (ev.movement_range_x || 1) - 1);
		this.rangeY = Math.max(0, (ev.movement_range_y || 1) - 1);
		const mt = ev.movement_type || 'MOVEMENT_TYPE_FACE_DOWN';
		this.facing = FACE_OF[mt] || 'down';
		this.turnFaces = facesFor(mt);
		this.wander = mt.includes('WANDER');
		this.axis = mt.includes('LEFT_AND_RIGHT') ? 'x' : mt.includes('UP_AND_DOWN') ? 'y' : null;
		this.moving = false;
		this.moveFrom = null; this.moveTo = null; this.moveT = 0;
		this.timer = 1 + Math.random() * 2;
		this.stepParity = 0;
	}

	canStep(nx, ny, ctx) {
		if (Math.abs(nx - this.homeX) > this.rangeX || Math.abs(ny - this.homeY) > this.rangeY) return false;
		if (!ctx.world.isPassable(nx, ny)) return false;
		if (ctx.world.warpAt(nx, ny)) return false; // don't wander into doors
		if (ctx.occupied(nx, ny, this)) return false;
		return true;
	}

	update(dt, ctx) {
		if (this.moving) {
			this.moveT += (NPC_SPEED * dt) / META;
			if (this.moveT >= 1) {
				this.px = this.moveTo[0]; this.py = this.moveTo[1];
				this.moving = false;
			} else {
				this.px = this.moveFrom[0] + (this.moveTo[0] - this.moveFrom[0]) * this.moveT;
				this.py = this.moveFrom[1] + (this.moveTo[1] - this.moveFrom[1]) * this.moveT;
			}
			return;
		}
		this.timer -= dt;
		if (this.timer > 0) return;
		this.timer = 1 + Math.random() * 2.5;

		if (this.wander) {
			let dirs = Object.keys(DIRS);
			if (this.axis === 'x') dirs = ['left', 'right'];
			if (this.axis === 'y') dirs = ['up', 'down'];
			const dir = dirs[Math.floor(Math.random() * dirs.length)];
			this.facing = dir;
			const [dx, dy] = DIRS[dir];
			const nx = this.tx + dx, ny = this.ty + dy;
			if (this.canStep(nx, ny, ctx)) {
				this.moveFrom = [this.px, this.py];
				this.moveTo = [nx * META, ny * META];
				this.moveT = 0;
				this.moving = true;
				this.tx = nx; this.ty = ny;
				this.stepParity ^= 1;
			}
		} else if (this.turnFaces) {
			this.facing = this.turnFaces[Math.floor(Math.random() * this.turnFaces.length)];
		}
	}

	draw(ctx2d, camX, camY) {
		if (this.hidden) return; // hidden by a script (removeobject/set_invisible)
		const stills = { down: 0, up: 1, left: 2, right: 2 };
		const walks = { down: [3, 4], up: [5, 6], left: [7, 8], right: [7, 8] };
		let frame = stills[this.facing];
		if (this.moving && this.frames >= 9 && this.moveT < 0.5) frame = walks[this.facing][this.stepParity];
		if (frame >= this.frames) frame = 0;
		const x = Math.round(this.px - camX), y = Math.round(this.py - 16 - camY);
		const mirror = this.facing === 'right';
		ctx2d.save();
		if (mirror) { ctx2d.translate(x + 16, y); ctx2d.scale(-1, 1); }
		else ctx2d.translate(x, y);
		ctx2d.drawImage(this.img, frame * 16, 0, 16, 32, 0, 0, 16, 32);
		ctx2d.restore();
	}
}

export class NPCs {
	constructor(world, player) {
		this.world = world;
		this.player = player;
		this.list = [];
		this.gfx = null;
	}

	async init() {
		this.gfx = await getJSON('data/gfx_map.json');
	}

	async loadForMap() {
		this.list = [];
		const evs = this.world.current.map.object_events || [];
		await Promise.all(evs.map(async ev => {
			if (ev.type != null && ev.type !== 'object') return; // Emerald maps omit `type` — treat missing as object (else no Hoenn NPCs)
			if (ev.flag && ev.flag !== '0') return;        // hidden-by-flag (story NPCs)
			if (isTrainerEvent(ev)) return;                // trainers.js renders these
			if (/BREAKABLE_ROCK|CUTTABLE_TREE|ITEM_BALL|BERRY_TREE|FRUIT_TREE|BOULDER/.test(ev.graphics_id || '')) return; // items.js owns these
			const file = this.gfx[ev.graphics_id]
				|| (ev.graphics_id || '').replace('OBJ_EVENT_GFX_', '').toLowerCase() + '.png';
			let img = await getImage(`data/people/${file}`).catch(() => null);
			if (!img) img = await getImage(spritePath(ev.graphics_id, false)).catch(() => null);
			if (img) this.list.push(new NPC(ev, img));
		}));
	}

	// tile occupied by an NPC (current tile or the one it's stepping into)?
	occupied(tx, ty, self = null) {
		if (this.player && this.player.tx === tx && this.player.ty === ty) return true;
		return this.list.some(n => n !== self && n.tx === tx && n.ty === ty);
	}

	npcBlocks(tx, ty) {
		return this.list.some(n => !n.hidden && n.tx === tx && n.ty === ty);
	}

	update(dt) {
		const ctx = { world: this.world, occupied: (x, y, s) => this.occupied(x, y, s) };
		for (const n of this.list) n.update(dt, ctx);
	}
}
