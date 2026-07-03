// encounters.js — wild encounter rolls. Trigger chain mirrors the Lua game:
// finish a step on MB_TALL_GRASS -> rate roll (rate/100) -> weighted slot ->
// level in [min,max]. The battle scene takes it from there.
import { getJSON } from './engine.js';

export class Encounters {
	constructor() {
		this.data = null;
		this.species = null;
	}

	async init() {
		[this.data, this.species] = await Promise.all([
			getJSON('data/encounters.json'),
			getJSON('data/species_index.json'),
		]);
	}

	// roll for an encounter; returns { id, level } or null
	roll(mapId, world, tx, ty) {
		if (!world.isTallGrass(tx, ty)) return null;
		const grp = this.data[mapId]?.land;
		if (!grp) return null;
		if (Math.random() * 100 > grp.rate) return null;

		const total = grp.slots.reduce((s, x) => s + x.w, 0);
		let r = Math.random() * total, slot = grp.slots[0];
		for (const s of grp.slots) { r -= s.w; if (r <= 0) { slot = s; break; } }

		const level = slot.min + Math.floor(Math.random() * (slot.max - slot.min + 1));
		return { id: slot.id, level };
	}
}
