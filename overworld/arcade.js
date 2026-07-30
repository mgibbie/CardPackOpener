// arcade.js — arcade-box objects placed programmatically per map id (ported
// from Magepunk66 MapObjects.lua). Mirrors services.js: per-map sprite + a
// solid, interactable footprint. Route 1's box launches PokéChess; Pallet
// Town's box is a placeholder for now.
import { getImage, META } from './engine.js';

// each box: base tile (bx,by) is the tile the player faces from below; the
// sprite is 2 tiles tall so it also occupies (bx,by-1). `kind` selects what
// interacting does (handled in main.js interact()).
const BOXES = {
	MAP_ROUTE1: { kind: 'pokechess', tx: 10, ty: 20 },
	MAP_PALLET_TOWN: { kind: 'pears', tx: 12, ty: 10 },
};

function specFor(mapId) {
	const b = BOXES[mapId];
	if (!b) return null;
	return {
		sprites: [{ img: 'arcadebox', tx: b.tx, ty: b.ty }],
		zones: [{ kind: b.kind, tiles: [[b.tx, b.ty]] }],
		solid: [[b.tx, b.ty], [b.tx, b.ty - 1]],
	};
}

export class Arcade {
	constructor(world) {
		this.world = world;
		this.spec = null;
		this.imgs = {};
	}

	async init() {
		this.imgs.arcadebox = await getImage('data/npcs/arcadebox.png').catch(() => null);
	}

	loadForMap() {
		this.spec = specFor(this.world.current.map.id);
	}

	// 'pokechess' | 'pears' | null at a tile
	kindAt(tx, ty) {
		if (!this.spec) return null;
		for (const z of this.spec.zones) if (z.tiles.some(([x, y]) => x === tx && y === ty)) return z.kind;
		return null;
	}

	blocks(tx, ty) {
		return !!this.spec && this.spec.solid.some(([x, y]) => x === tx && y === ty);
	}

	draw(ctx, camX, camY) {
		if (!this.spec) return;
		for (const s of this.spec.sprites) {
			const img = this.imgs[s.img];
			if (!img) continue;
			ctx.drawImage(img, 0, 0, 16, 32, s.tx * META - camX, s.ty * META - 16 - camY, 16, 32);
		}
	}
}
