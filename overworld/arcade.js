// arcade.js — arcade-box objects placed programmatically per map id (ported
// from Magepunk66 MapObjects.lua). Mirrors services.js: per-map sprite + a
// solid, interactable footprint. Route 1's box launches PokéChess; Pallet
// Town's launches Pair of Pears (/pairofpears/); the Celadon Game Corner's
// MICATRO cabinet launches the poker roguelike (/micatro/).
import { getImage, META } from './engine.js';

// each box: base tile (bx,by) is the tile the player faces from below; the
// sprite is 2 tiles tall so it also occupies (bx,by-1). `kind` selects what
// interacting does (handled in main.js interact()).
const BOXES = {
	MAP_ROUTE1: { kind: 'pokechess', tx: 10, ty: 20 },
	MAP_PALLET_TOWN: { kind: 'pears', tx: 12, ty: 7 }, // north of the player's spawn
	// the Game Corner lobby, at the right end of the prize counter: the cabinet's top
	// half stands on the counter's end tile (already solid) so only (9,4) is newly
	// blocked; it's played from (9,5). The 2-row lobby aisle (rows 4-5) stays open,
	// and no NPC, hidden item, sign or the Rocket Grunt's exit walk touches it.
	MAP_CELADON_CITY_GAME_CORNER: { kind: 'micatro', tx: 9, ty: 4 },
};
// a kind with its own cabinet art (git-tracked under overworld/fx/); others use
// the generic data/npcs/arcadebox.png. w = the sprite's pixel width (32 tall).
const KIND_SPRITES = {
	micatro: { img: 'micatrobox', src: 'fx/micatrobox.png', w: 20 },
};

function specFor(mapId) {
	const b = BOXES[mapId];
	if (!b) return null;
	return {
		sprites: [{ img: KIND_SPRITES[b.kind] ? KIND_SPRITES[b.kind].img : 'arcadebox', w: KIND_SPRITES[b.kind]?.w || 16, tx: b.tx, ty: b.ty }],
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
		for (const k of Object.values(KIND_SPRITES)) this.imgs[k.img] = await getImage(k.src).catch(() => null);
	}

	loadForMap() {
		this.spec = specFor(this.world.current.map.id);
	}

	// 'pokechess' | 'pears' | 'micatro' | null at a tile
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
			const img = this.imgs[s.img] || this.imgs.arcadebox; // missing custom art → the generic box
			if (!img) continue;
			const w = img === this.imgs[s.img] ? (s.w || 16) : 16;
			ctx.drawImage(img, 0, 0, w, 32, s.tx * META - (w - 16) / 2 - camX, s.ty * META - 16 - camY, w, 32);
		}
	}
}
