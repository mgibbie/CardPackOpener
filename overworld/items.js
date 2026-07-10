// items.js — overworld pickups: item balls (object_events), hidden items
// (bg_events), Emerald berry trees, and Crystal fruit trees. Port of
// MapItems.lua + MapTrees.lua; collected state persists in localStorage.
import { getJSON, getImage, META } from './engine.js';
import * as Bag from './bag.js';

const COLLECTED_KEY = 'magepunk_collected_v1';
const HARVEST_AMOUNT = 2;

// "<Map>_EventScript_ItemRareCandy2" -> ["rarecandy", "Rare Candy"]
function parseBallScript(script) {
	const m = /_EventScript_Item(.+)$/.exec(script || '');
	if (!m) return null;
	const camel = m[1].replace(/\d+$/, '');
	const id = camel.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (!id) return null;
	const pretty = camel.replace(/([a-z])([A-Z])/g, '$1 $2');
	return [id, pretty];
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

export class Items {
	constructor(world) {
		this.world = world;
		this.balls = [];
		this.trees = [];
		this.fieldObjs = [];
		this.fruitMap = {};
		this.ballImg = null;
		try { this.collected = new Set(JSON.parse(localStorage.getItem(COLLECTED_KEY) || '[]')); }
		catch (e) { this.collected = new Set(); }
	}

	async init() {
		this.fruitMap = await getJSON('data/berry_trees.json').catch(() => ({}));
		this.ballImg = await getImage('data/npcs/pokeball.png').catch(() => null);
	}

	markCollected(key) {
		this.collected.add(key);
		try { localStorage.setItem(COLLECTED_KEY, JSON.stringify([...this.collected])); } catch (e) {}
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
			if (g.includes('BREAKABLE_ROCK')) {
				this.fieldObjs.push({ tx: +o.x, ty: +o.y, kind: 'rock' });
				continue;
			}
			if (g.includes('CUTTABLE_TREE')) {
				this.fieldObjs.push({ tx: +o.x, ty: +o.y, kind: 'cut' });
				continue;
			}
			if (g.includes('ITEM_BALL')) {
				const parsed = parseBallScript(o.script);
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
				this.trees.push({ tx: +o.x, ty: +o.y, item, name: berryPretty(item), key, harvested: this.collected.has(key) });
			}
		}
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
			if (t.harvested) return 'The tree is bare.';
			t.harvested = true;
			this.markCollected(t.key);
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

	draw(ctx, camX, camY) {
		for (const o of this.fieldObjs) {
			const x = o.tx * META - camX, y = o.ty * META - camY;
			if (o.kind === 'rock') {
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
