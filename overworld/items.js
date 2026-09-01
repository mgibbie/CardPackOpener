// items.js — overworld pickups: item balls (object_events), hidden items
// (bg_events), Emerald berry trees, and Crystal fruit trees. Port of
// MapItems.lua + MapTrees.lua; collected state persists in localStorage.
import { getJSON, getImage, META } from './engine.js';
import * as Bag from './bag.js';
import { safeLoad, safeSave } from './safestore.js';

const COLLECTED_KEY = 'magepunk_collected_v1';
const BERRY_KEY = 'magepunk_berrytimes_v1'; // tree key -> last-harvest timestamp (24h regrowth)
const HARVEST_AMOUNT = 2;

// "<Map>_EventScript_ItemRareCandy2" -> ["rarecandy", "Rare Candy"]
function parseBallScript(script) {
	const m = /_EventScript_Item(.+)$/.exec(script || '');
	if (!m) return null;
	// The trailing-digit strip disambiguates repeats ("ItemRareCandy2" -> rarecandy).
	// For a TM or HM the digits ARE the identity, so stripping them produced the id
	// "tm" — an unsellable junk item that teaches nothing (tmMoveId needs tm<n>).
	// 29 balls were affected, including HM07 WATERFALL in Icefall Cave.
	const camel = /^(TM|HM)\d+$/i.test(m[1]) ? m[1] : m[1].replace(/\d+$/, '');
	const id = camel.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (!id) return null;
	const pretty = camel.replace(/([a-z])([A-Z])/g, '$1 $2');
	return [id, pretty];
}

// Crystal writes an item ball's script as <Map><Item> — "RockTunnel1FElixer",
// "Route12Nugget" — with no _EventScript_Item marker for parseBallScript to find.
// The map stem is the only thing that says where the map name ends, so it is
// passed in; a JohKanto map carries Crystal's own (unprefixed) name in the script,
// so both spellings are tried.
//
// The three starter balls in Elm's lab are POKE_BALLs too and must NOT become
// items: picking up a "Cyndaquil" would put a junk id in the bag.
const STARTER_BALLS = /^(Cyndaquil|Totodile|Chikorita)PokeBallScript$/;
function parseCrystalBall(script, stem) {
	if (!script || STARTER_BALLS.test(script)) return null;
	let tail = script;
	for (const pre of [stem, String(stem).replace(/^JohKanto/, '')]) {
		if (pre && tail.startsWith(pre)) { tail = tail.slice(pre.length); break; }
	}
	tail = tail.replace(/Script$/, '');
	if (!tail || tail === script) return null;       // nothing stripped: not this form
	const id = tail.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (!id) return null;
	return [id, tail.replace(/([a-z])([A-Z])/g, '$1 $2')];
}

// "ITEM_RARE_CANDY" -> ["rarecandy", "Rare Candy"]
function parseItemConst(c) {
	if (!c || c === 'ITEM_NONE') return null;
	const body = c.replace(/^ITEM_/, '');
	const id = body.toLowerCase().replace(/[^a-z0-9]/g, '');
	const pretty = body.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
	return [id, pretty];
}

// "BERRY_TREE_ROUTE_102_ORAN" / "..._CHERI_1" -> "oranberry"
function emeraldBerry(treeId) {
	if (!treeId || treeId === '0') return null;
	const s = String(treeId).replace(/_\d+$/, '');
	const m = /_([A-Za-z]+)$/.exec(s);
	return m ? m[1].toLowerCase() + 'berry' : null;
}

const berryPretty = id => id.replace(/berry$/, ' Berry').replace(/^./, c => c.toUpperCase());

// HM-terrain obstacles seeded in code at progression chokepoints (Ilex Cut, Fiery
// Path rock, etc.) — map data is read-only so these can't live in the map JSON.
// Filled by the per-region blocker passes; keys are MAP_ ids.
const CODE_FIELD_OBJS = {
	// Ilex Forest: the single-tile CUT gap that gates the road south to Goldenrod
	// (Cut is badge-gated at 2 badges in Johto — HM_GATE). No CUTTABLE_TREE exists in
	// this map's data, so it's seeded here.
	MAP_ILEX_FOREST: [{ tx: 8, ty: 25, kind: 'cut' }],
};

export class Items {
	constructor(world) {
		this.world = world;
		this.balls = [];
		this.trees = [];
		this.fieldObjs = [];
		this.fruitMap = {};
		this.ballImg = null;
		{ const c = safeLoad(COLLECTED_KEY, []); this.collected = new Set(Array.isArray(c) ? c : []); }
		{ const b = safeLoad(BERRY_KEY, {}); this.berryTimes = (b && typeof b === 'object' && !Array.isArray(b)) ? b : {}; }
	}

	async init() {
		this.fruitMap = await getJSON('data/berry_trees.json').catch(() => ({}));
		this.ballImg = await getImage('data/npcs/pokeball.png').catch(() => null);
	}

	markCollected(key) {
		this.collected.add(key);
		safeSave(COLLECTED_KEY, [...this.collected]);
	}

	// a berry tree is bare for 24h after each pick, then bears fruit again
	berryHarvested(key) {
		const ts = this.berryTimes[key];
		return !!ts && Date.now() - ts < 24 * 3600 * 1000;
	}
	markHarvested(key) {
		this.berryTimes[key] = Date.now();
		safeSave(BERRY_KEY, this.berryTimes);
	}

	keyFor(prefix, ev) {
		const f = ev.flag;
		if (f && f !== '0') return prefix + f;
		return `${prefix}${this.world.current.map.id}_${ev.x}_${ev.y}`;
	}

	loadForMap() {
		this.balls = [];
		this.trees = [];
		this.fieldObjs = []; // smashable rocks / cuttable trees (respawn per visit)
		const map = this.world.current.map;
		for (const o of map.object_events || []) {
			const g = String(o.graphics_id || '');
			// The three decomps spell these differently and only the pokeemerald
			// names were matched, so every FireRed/Emerald-styled obstacle was
			// inert scenery: 97 ROCK_SMASH_ROCKs (all of Cerulean Cave, Mt. Ember)
			// and 55 CUT_TREEs (Celadon Gym's own puzzle among them) ignored the
			// HM entirely. Accept either spelling.
			if (g.includes('BREAKABLE_ROCK') || g.includes('ROCK_SMASH')) {
				this.fieldObjs.push({ tx: +o.x, ty: +o.y, kind: 'rock' });
				continue;
			}
			if (g.includes('CUTTABLE_TREE') || g.includes('CUT_TREE')) {
				this.fieldObjs.push({ tx: +o.x, ty: +o.y, kind: 'cut' });
				continue;
			}
			if (g.includes('BOULDER')) {
				this.fieldObjs.push({ tx: +o.x, ty: +o.y, kind: 'boulder' });
				continue;
			}
			// POKE_BALL is Crystal's spelling. items.js only ever matched ITEM_BALL, so
			// all 180 of JohKanto's and Johto's item balls were walked straight past —
			// two whole regions with no overworld items at all.
			if (g.includes('ITEM_BALL') || g.includes('POKE_BALL')) {
				const parsed = parseBallScript(o.script) || parseCrystalBall(o.script, this.world.current.name);
				if (!parsed) continue;
				const key = this.keyFor('', o);
				if (this.collected.has(key)) continue;
				this.balls.push({ tx: +o.x, ty: +o.y, id: parsed[0], pretty: parsed[1], key, hidden: false });
			} else if (g.includes('BERRY_TREE') || g.includes('FRUIT_TREE')) {
				const item = g.includes('BERRY_TREE')
					? emeraldBerry(o.trainer_sight_or_berry_tree_id)
					: this.fruitMap[o.script || ''];
				if (!item) continue;
				const key = this.keyFor('tree_', o);
				// berries REGROW: harvested state comes from a 24h timestamp, not
				// the permanent collected set (legacy entries there are ignored,
				// so pre-regrowth harvests come back on the next visit)
				this.trees.push({ tx: +o.x, ty: +o.y, item, name: berryPretty(item), key, harvested: this.berryHarvested(key) });
			}
		}
		// authentic HM-terrain chokepoints injected in code (map data is read-only):
		// cut trees / rocks / boulders at progression gates, cleared by the usual HMs
		for (const o of CODE_FIELD_OBJS[map.id] || []) this.fieldObjs.push({ tx: o.tx, ty: o.ty, kind: o.kind });
		for (const b of map.bg_events || []) {
			if (b.type !== 'hidden_item') continue;
			const parsed = parseItemConst(b.item);
			if (!parsed) continue;
			const key = this.keyFor('', b);
			if (this.collected.has(key)) continue;
			this.balls.push({ tx: +b.x, ty: +b.y, id: parsed[0], pretty: parsed[1], key, hidden: true });
		}
	}

	// pickup / harvest at a tile; returns a message or null
	interactAt(tx, ty) {
		const i = this.balls.findIndex(b => b.tx === tx && b.ty === ty);
		if (i >= 0) {
			const b = this.balls[i];
			this.balls.splice(i, 1);
			this.markCollected(b.key);
			Bag.addItem(b.id);
			Bag.registerName(b.id, b.pretty.toUpperCase());
			return `Found ${b.pretty.toUpperCase()}!`;
		}
		const t = this.trees.find(t => t.tx === tx && t.ty === ty);
		if (t) {
			if (t.harvested) return 'The tree is bare. (Berries regrow in a day.)';
			t.harvested = true;
			this.markHarvested(t.key);
			Bag.addItem(t.item, HARVEST_AMOUNT);
			Bag.registerName(t.item, t.name.toUpperCase());
			return `Picked ${HARVEST_AMOUNT} ${t.name.toUpperCase()}!`;
		}
		return null;
	}

	// visible balls, berry trees, and field obstacles are solid
	occupied(tx, ty) {
		return this.balls.some(b => !b.hidden && b.tx === tx && b.ty === ty)
			|| this.trees.some(t => t.tx === tx && t.ty === ty)
			|| this.fieldObjs.some(o => o.tx === tx && o.ty === ty);
	}

	fieldObjAt(tx, ty) {
		return this.fieldObjs.find(o => o.tx === tx && o.ty === ty) || null;
	}
	removeFieldObj(obj) {
		const i = this.fieldObjs.indexOf(obj);
		if (i >= 0) this.fieldObjs.splice(i, 1);
	}
	moveFieldObj(obj, tx, ty) {
		obj.tx = tx; obj.ty = ty;
	}

	draw(ctx, camX, camY) {
		for (const o of this.fieldObjs) {
			const x = o.tx * META - camX, y = o.ty * META - camY;
			if (o.kind === 'boulder') {
				// a big rounded strength boulder filling the tile
				ctx.fillStyle = '#8c837a';
				ctx.beginPath(); ctx.ellipse(x + 8, y + 9, 7.5, 7, 0, 0, Math.PI * 2); ctx.fill();
				ctx.fillStyle = '#a39a90';
				ctx.beginPath(); ctx.ellipse(x + 6, y + 6, 3, 2.5, 0, 0, Math.PI * 2); ctx.fill();
				ctx.fillStyle = '#6d665e';
				ctx.beginPath(); ctx.ellipse(x + 10, y + 12, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
				ctx.strokeStyle = '#544e47';
				ctx.lineWidth = 1;
				ctx.beginPath(); ctx.ellipse(x + 8, y + 9, 7.5, 7, 0, 0, Math.PI * 2); ctx.stroke();
			} else if (o.kind === 'rock') {
				// cracked boulder
				ctx.fillStyle = '#9a938a';
				ctx.beginPath(); ctx.ellipse(x + 8, y + 9, 6.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
				ctx.fillStyle = '#7d766d';
				ctx.beginPath(); ctx.ellipse(x + 6, y + 11, 3, 2.2, 0, 0, Math.PI * 2); ctx.fill();
				ctx.strokeStyle = '#5e574f';
				ctx.beginPath(); ctx.moveTo(x + 8, y + 4); ctx.lineTo(x + 6, y + 8); ctx.lineTo(x + 9, y + 12); ctx.stroke();
			} else {
				// scrawny cuttable tree
				ctx.fillStyle = '#6b4a26';
				ctx.fillRect(x + 7, y + 8, 3, 7);
				ctx.fillStyle = '#4f9c3f';
				ctx.beginPath(); ctx.ellipse(x + 8, y + 6, 5.5, 5, 0, 0, Math.PI * 2); ctx.fill();
				ctx.strokeStyle = '#356b2a';
				ctx.stroke();
			}
		}
		for (const b of this.balls) {
			if (b.hidden) continue;
			const x = b.tx * META - camX, y = b.ty * META - camY;
			if (this.ballImg) ctx.drawImage(this.ballImg, x, y, 16, 16);
			else { ctx.fillStyle = '#e04040'; ctx.fillRect(x + 4, y + 4, 8, 8); }
		}
		for (const t of this.trees) {
			const x = t.tx * META - camX, y = t.ty * META - camY;
			// trunk + canopy
			ctx.fillStyle = '#734d29';
			ctx.fillRect(x + 6, y + 9, 4, 6);
			ctx.fillStyle = '#298c38';
			ctx.beginPath();
			ctx.ellipse(x + 8, y + 6, 7, 6, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = '#1a6b29';
			ctx.stroke();
			if (!t.harvested) {
				ctx.fillStyle = '#e6404d';
				for (const [bx, by] of [[5, 6], [11, 5], [8, 9]]) {
					ctx.beginPath();
					ctx.arc(x + bx, y + by, 1.4, 0, Math.PI * 2);
					ctx.fill();
				}
			}
		}
	}
}
