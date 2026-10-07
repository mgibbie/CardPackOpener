// items.js — overworld pickups: item balls (object_events), hidden items
// (bg_events), Emerald berry trees, and Crystal fruit trees. Port of
// MapItems.lua + MapTrees.lua; collected state persists in localStorage.
import { getJSON, getImage, META } from './engine.js';
import { objectHiddenByFlag, setFlag, getStoredFlag } from './events.js';
import { parseBallScript, parseCrystalBall, parseItemConst } from './ball_parse.js';
import * as Bag from './bag.js';
import { safeLoad, safeSave } from './safestore.js';

// Does items.js own this object outright, by its graphics id? Item balls, berry
// and fruit trees, and the three HM obstacles — it draws and drives them, so
// nobody else should.
//
// EXPORTED because npcs.js has to ask the SAME question, and for a long time it
// asked a slightly different one: its own list matched CUTTABLE_TREE and
// BREAKABLE_ROCK but not the CUT_TREE / ROCK_SMASH_ROCK spellings, and not
// Crystal's plain _ROCK. That drift is what made the two files disagree about
// who owns 400-odd objects — harmless only while a blanket flag rule happened to
// hide them all. One predicate, one answer.
export function itemsOwns(graphicsId) {
	const g = String(graphicsId || '');
	return g.includes('BREAKABLE_ROCK') || g.includes('ROCK_SMASH') || /_ROCK$/.test(g)
		|| g.includes('CUTTABLE_TREE') || g.includes('CUT_TREE')
		|| g.includes('BOULDER')
		|| g.includes('ITEM_BALL') || g.includes('POKE_BALL')
		|| g.includes('BERRY_TREE') || g.includes('FRUIT_TREE');
}

const COLLECTED_KEY = 'magepunk_collected_v1';
const BERRY_KEY = 'magepunk_berrytimes_v1'; // tree key -> last-harvest timestamp (24h regrowth)
const HARVEST_AMOUNT = 2;

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
// (Ilex Forest's CUT gap used to be seeded here as a tree OBJECT over the map's
// solid tree tile: cutting removed the object and left the tile, so the road
// south stayed shut — 2026-10-02. It is a Crystal block tree, in cut_blocks.json.)
const CODE_FIELD_OBJS = {};

// an object's hide flag, as a story flag name (or null)
const storyFlag = f => (f && f !== '0' && /^(FLAG_|EVENT_)/.test(f)) ? f : null;

export class Items {
	constructor(world) {
		this.world = world;
		this.balls = [];
		this.trees = [];
		this.fieldObjs = [];
		this.fruitMap = {};
		this.ballImg = null;
		this.reloadCollected();
	}

	// collected balls/hidden items + berry timers live in localStorage; these are
	// only caches. Every change re-reads storage first and applies its own delta,
	// so a record that changed underneath (a sync, another tab) is never written
	// back stale (rebase-on-write, as trainers.js since #647).
	// mutators UNION storage into the cache (collected items and berry timers
	// only grow): a record that grew underneath is picked up, and nothing this
	// tab holds is dropped when storage can't be read (full / blocked storage)
	mergeCollected() {
		const c = safeLoad(COLLECTED_KEY, []); if (Array.isArray(c)) for (const k of c) this.collected.add(k);
		const b = safeLoad(BERRY_KEY, {});
		if (b && typeof b === 'object' && !Array.isArray(b)) for (const [k, t] of Object.entries(b)) if (!(k in this.berryTimes) || t > this.berryTimes[k]) this.berryTimes[k] = t;
	}
	reloadCollected() {
		const c = safeLoad(COLLECTED_KEY, []); this.collected = new Set(Array.isArray(c) ? c : []);
		const b = safeLoad(BERRY_KEY, {}); this.berryTimes = (b && typeof b === 'object' && !Array.isArray(b)) ? b : {};
	}

	async init() {
		this.fruitMap = await getJSON('data/berry_trees.json').catch(() => ({}));
		// Crystal's CUT trees are painted into the map blocks, not objects
		// (tools/gen_cut_blocks.mjs): { MAP_ID: [[x, y, treeValue, cutValue]] }
		this.cutBlocks = (await getJSON('cut_blocks.json').catch(() => null))?.maps || {};
		await this.healPickupFlags();
		// item balls are drawn procedurally now (drawBall) — the old data/npcs/pokeball.png
		// was a lumpy off-centre blob with no band/button
	}

	// SELF-HEAL for saves from before pickups set their story flag: a pickup ball
	// already in the collected record gets its hide flag set in the story. Only
	// PLAIN pickup balls (tools/gen_ball_flags.mjs -> ball_flags.json) — a SCRIPTED
	// ball's flag must not be set from the collected record, which holds old junk
	// pickups of scripted balls that are meant to come back (items.js loadForMap).
	async healPickupFlags() {
		const list = (await getJSON('ball_flags.json').catch(() => null))?.flags;
		if (!Array.isArray(list)) return 0;
		const pickup = new Set(list);
		let n = 0;
		for (const k of this.collected) if (pickup.has(k) && !getStoredFlag(k)) { setFlag(k); n++; }
		return n;
	}

	markCollected(key) {
		this.mergeCollected();
		this.collected.add(key);
		safeSave(COLLECTED_KEY, [...this.collected]);
	}

	// a berry tree is bare for 24h after each pick, then bears fruit again
	berryHarvested(key) {
		const ts = this.berryTimes[key];
		return !!ts && Date.now() - ts < 24 * 3600 * 1000;
	}
	markHarvested(key) {
		this.mergeCollected();
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
		// (see itemsOwns below — npcs.js asks the same question through it)
		for (const o of map.object_events || []) {
			const g = String(o.graphics_id || '');
			// The three decomps spell these differently and only the pokeemerald
			// names were matched, so every FireRed/Emerald-styled obstacle was
			// inert scenery: 97 ROCK_SMASH_ROCKs (all of Cerulean Cave, Mt. Ember)
			// and 55 CUT_TREEs (Celadon Gym's own puzzle among them) ignored the
			// HM entirely. Accept either spelling.
			// ...and Crystal's spelling is a plain `OBJ_EVENT_GFX_ROCK`, which matched
			// neither, so 15 smashable rocks across Gen-2 Kanto and Johto were inert
			// scenery. Anchored so it cannot catch OBJ_EVENT_GFX_ROCKET.
			if (g.includes('BREAKABLE_ROCK') || g.includes('ROCK_SMASH') || /_ROCK$/.test(g)) {
				this.fieldObjs.push({ tx: +o.x, ty: +o.y, kind: 'rock' });
				continue;
			}
			if (g.includes('CUTTABLE_TREE') || g.includes('CUT_TREE')) {
				this.fieldObjs.push({ tx: +o.x, ty: +o.y, kind: 'cut' });
				continue;
			}
			if (g.includes('BOULDER')) {
				// a boulder that has fallen to the floor below (or not fallen here yet)
				// is hidden by its flag: Seafoam's lower floors showed every boulder
				if (objectHiddenByFlag(o, !!map._crystal_tileset)) continue;
				// FRLG keeps the flag that reveals it on the floor BELOW in the
				// object's trainer_type (GetBoulderRevealFlagByLocalIdAndMap)
				const reveal = /^FLAG_/.test(o.trainer_type || '') ? o.trainer_type : null;
				this.fieldObjs.push({ tx: +o.x, ty: +o.y, kind: 'boulder', flag: /^FLAG_/.test(o.flag || '') ? o.flag : null, reveal });
				continue;
			}
			// POKE_BALL is Crystal's spelling. items.js only ever matched ITEM_BALL, so
			// all 180 of JohKanto's and Johto's item balls were walked straight past —
			// two whole regions with no overworld items at all.
			if (g.includes('ITEM_BALL') || g.includes('POKE_BALL')) {
				// balls carry hide-flags too (scene props, story rewards): a flagged
				// ball must not sit there grabbable — Birch's bag-scene starter
				// balls were stacked three-deep on the lab floor
				if (objectHiddenByFlag(o, !!map._crystal_tileset)) continue;
				// Crystal names an item ball's script <Map><Item>; that guess is only
				// valid on a Crystal map. Applied to Emerald/FireRed it turned EVERY
				// scripted ball into a junk pickup named after its script: Aqua
				// Hideout's Electrodes ("Found _EVENT SCRIPT_ELECTRODE2!", 2026-10-01),
				// the Power Plant Electrodes, the Rocket Hideout SILPH SCOPE and LIFT
				// KEY, the EEVEE / BELDUM / Dojo gift balls.
				const crystal = !!map._crystal_tileset;
				const parsed = parseBallScript(o.script) || (crystal ? parseCrystalBall(o.script, this.world.current.name) : null);
				if (!parsed) {
					// not an item pickup: a SCRIPTED ball. Talking to it runs its own
					// authored script (an encounter, a gift, a key item); the script's
					// hide (removeobject) takes it away. Never minted as an item.
					if (!crystal && o.script && o.script !== '0x0') {
						const key = this.keyFor('', o);
						// LEGACY: before scripted balls, New Mauville's Voltorbs were a one-off
						// ambush that recorded a FOUGHT ball in `collected` (not its hide flag).
						// Those stay gone. Every other scripted ball found in `collected` got
						// there as a junk pickup (no battle, no item, no flag), so it comes
						// back to be used properly.
						if (/EventScript_Voltorb\d+$/.test(o.script) && this.collected.has(key)) continue;
						this.balls.push({ tx: +o.x, ty: +o.y, scripted: true, ev: o, script: o.script, key, hidden: false });
					}
					continue;
				}
				const key = this.keyFor('', o);
				if (this.collected.has(key)) continue;
				this.balls.push({ tx: +o.x, ty: +o.y, id: parsed[0], pretty: parsed[1], key, hidden: false, flag: storyFlag(o.flag) });
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
		// Crystal block trees: the tile IS the tree (drawn by the map), so CUT has to
		// swap the tile, not just drop an object. Like every cut tree they grow back
		// on the next visit — the cached layout was edited, so put the tree back.
		for (const [tx, ty, tree, cut] of (this.cutBlocks && this.cutBlocks[map.id]) || []) {
			if (this.world.gridAt(tx, ty) !== tree) this.world.setGridValue(tx, ty, tree);
			this.fieldObjs.push({ tx, ty, kind: 'cut', tile: true, cutTo: cut });
		}
		for (const b of map.bg_events || []) {
			if (b.type !== 'hidden_item') continue;
			const parsed = parseItemConst(b.item);
			if (!parsed) continue;
			const key = this.keyFor('', b);
			if (this.collected.has(key)) continue;
			this.balls.push({ tx: +b.x, ty: +b.y, id: parsed[0], pretty: parsed[1], key, hidden: true, flag: storyFlag(b.flag) });
		}
	}

	// a scripted ball at this tile (its script is run by the host, ow_input.js)
	scriptedAt(tx, ty) {
		return this.balls.find(b => b.scripted && !b.hidden && b.tx === tx && b.ty === ty) || null;
	}
	// the scripted balls, for scripts that address them (removeobject VAR_LAST_TALKED)
	scriptedBalls() { return this.balls.filter(b => b.scripted); }

	// pickup / harvest at a tile; returns a message or null
	// opts.skipHidden: leave hidden items alone (someone is standing on the tile)
	interactAt(tx, ty, opts) {
		const i = this.balls.findIndex(b => !b.scripted && b.tx === tx && b.ty === ty && !(opts && opts.skipHidden && b.hidden));
		if (i >= 0) {
			const b = this.balls[i];
			this.balls.splice(i, 1);
			this.markCollected(b.key);
			// the decomp's pickup (finditem + removeobject) also SETS the ball's hide
			// flag in the story — and story scripts read it: Cinnabar's gym door
			// unlocks only when FLAG_HIDE_POKEMON_MANSION_B1F_SECRET_KEY is set
			// (2026-10-04: Instinct had the key in the bag and a locked door)
			if (b.flag) setFlag(b.flag);
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
		// a block tree: cutting it swaps in the replacement (walkable) tile
		if (obj && obj.cutTo != null) this.world.setGridValue(obj.tx, obj.ty, obj.cutTo);
	}
	moveFieldObj(obj, tx, ty) {
		obj.tx = tx; obj.ty = ty;
	}

	// a crisp procedural Poké Ball (red top / white bottom / black band + button),
	// drawn like the boulders/trees — replaces the old blurry npcs/pokeball.png blob
	drawBall(ctx, x, y) {
		const cx = x + 8, cy = y + 9, r = 5.5;
		ctx.save();
		ctx.fillStyle = '#f6f6f6'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
		ctx.beginPath(); ctx.rect(cx - r - 1, cy - r - 1, (r + 1) * 2, r + 1); ctx.clip();
		ctx.fillStyle = '#e23b32'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
		ctx.restore();
		ctx.strokeStyle = '#17171d'; ctx.lineWidth = 1.4;
		ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
		ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
		ctx.fillStyle = '#17171d'; ctx.beginPath(); ctx.arc(cx, cy, 1.9, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = '#f6f6f6'; ctx.beginPath(); ctx.arc(cx, cy, 0.9, 0, Math.PI * 2); ctx.fill();
	}
	draw(ctx, camX, camY) {
		for (const o of this.fieldObjs) {
			if (o.tile) continue;   // a block tree: the map tile already draws it
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
			this.drawBall(ctx, x, y);
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
