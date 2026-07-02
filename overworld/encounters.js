// encounters.js — wild encounter triggers + the encounter overlay.
// Trigger chain mirrors the Lua game: finish a step on MB_TALL_GRASS ->
// rate roll (rate/100) -> weighted slot -> level in [min,max].
import { getJSON, getImage, VIEW_W, VIEW_H } from './engine.js';

export class Encounters {
	constructor() {
		this.data = null;
		this.species = null;
		this.active = null; // { name, level, img, phase, t }
	}

	async init() {
		[this.data, this.species] = await Promise.all([
			getJSON('data/encounters.json'),
			getJSON('data/species_index.json'),
		]);
	}

	// roll for an encounter; returns true if one started
	async check(mapId, world, tx, ty) {
		if (this.active) return false;
		if (!world.isTallGrass(tx, ty)) return false;
		const grp = this.data[mapId]?.land;
		if (!grp) return false;
		if (Math.random() * 100 > grp.rate) return false;

		const total = grp.slots.reduce((s, x) => s + x.w, 0);
		let r = Math.random() * total, slot = grp.slots[0];
		for (const s of grp.slots) { r -= s.w; if (r <= 0) { slot = s; break; } }

		const level = slot.min + Math.floor(Math.random() * (slot.max - slot.min + 1));
		const sp = this.species[slot.id];
		const img = sp?.sprite ? await getImage(`data/pokemon/${sp.sprite}`).catch(() => null) : null;
		this.active = {
			name: (sp?.name || slot.id).toUpperCase(),
			level, img,
			phase: 'flash', t: 0,
		};
		return true;
	}

	dismiss() {
		const a = this.active;
		if (!a) return;
		if (a.phase === 'show') { a.phase = 'out'; a.t = 0; }
		else if (a.phase !== 'out') a.dismissQueued = true; // pressed during flash/fade-in
	}

	get blocking() { return this.active != null; }

	update(dt) {
		const a = this.active;
		if (!a) return;
		a.t += dt;
		if (a.phase === 'flash' && a.t > 0.7) { a.phase = 'in'; a.t = 0; }
		else if (a.phase === 'in' && a.t > 0.35) { a.phase = 'show'; a.t = 0; }
		else if (a.phase === 'show' && a.dismissQueued && a.t > 0.4) { a.phase = 'out'; a.t = 0; }
		else if (a.phase === 'out' && a.t > 0.3) this.active = null;
	}

	draw(ctx) {
		const a = this.active;
		if (!a) return;
		if (a.phase === 'flash') {
			// GBA-style screen flashes
			const k = Math.floor(a.t / 0.12);
			if (k % 2 === 0) {
				ctx.fillStyle = 'rgba(255,255,255,0.85)';
				ctx.fillRect(0, 0, VIEW_W, VIEW_H);
			}
			return;
		}
		const fade = a.phase === 'in' ? a.t / 0.35 : a.phase === 'out' ? 1 - a.t / 0.3 : 1;
		ctx.fillStyle = `rgba(16,12,24,${0.92 * fade})`;
		ctx.fillRect(0, 0, VIEW_W, VIEW_H);
		if (fade < 0.6) return;

		if (a.img) {
			const w = Math.min(64, a.img.width), h = Math.min(64, a.img.height);
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(a.img, VIEW_W / 2 - w / 2, 22, w, h);
		}
		ctx.fillStyle = '#f4eede';
		ctx.font = '10px monospace';
		ctx.textAlign = 'center';
		ctx.fillText(`A wild ${a.name} appeared!`, VIEW_W / 2, 108);
		ctx.fillStyle = '#9d8fd4';
		ctx.fillText(`Lv ${a.level}  -  battles coming soon`, VIEW_W / 2, 124);
		ctx.fillText(`[Z] run away`, VIEW_W / 2, 140);
		ctx.textAlign = 'left';
	}
}
