// evolution.js — post-battle level-up evolutions with the classic flashing
// sprite sequence. Keeps IVs/exp/moves/damage; stats recalc for the new species.
import { getImage, VIEW_W, VIEW_H } from './engine.js';
import { statsFor } from './battle.js';

export class Evolution {
	constructor() {
		this.queue = [];
		this.cur = null; // { mon, target, sp, oldImg, newImg, phase, t }
		this.onDone = null;
	}

	get blocking() { return this.cur != null || this.queue.length > 0; }

	// scan the party for pending level evolutions and start the sequence
	async check(party, data) {
		for (const mon of party) {
			const evos = data.extra?.[mon.speciesId]?.evos || [];
			const evo = evos.find(e => e.type === 'level' && mon.level >= e.param && data.species[e.target]);
			if (evo) this.queue.push({ mon, target: evo.target });
		}
		if (this.queue.length && !this.cur) this.next(data);
	}

	async next(data) {
		const item = this.queue.shift();
		if (!item) {
			this.cur = null;
			this.onDone?.();
			return;
		}
		const sp = data.species[item.target];
		const [oldImg, newImg] = await Promise.all([
			getImage(`data/pokemon/${data.species[item.mon.speciesId]?.sprite}`).catch(() => null),
			getImage(`data/pokemon/${sp.sprite}`).catch(() => null),
		]);
		this.cur = { ...item, sp, data, oldImg, newImg, phase: 'intro', t: 0 };
	}

	apply() {
		const { mon, target, sp } = this.cur;
		this.cur.oldName = mon.name;
		const damage = mon.maxHP - mon.curHP;
		mon.speciesId = target;
		mon.name = sp.name.toUpperCase();
		mon.types = sp.types;
		mon.sprite = sp.sprite;
		mon.num = sp.num;
		const ivs = mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
		mon.stats = statsFor(sp, ivs, mon.level);
		mon.maxHP = mon.stats.hp;
		mon.curHP = Math.max(1, mon.maxHP - damage);
	}

	key(k) {
		const c = this.cur;
		if (!c) return;
		if ((k === 'z' || k === 'Enter') && (c.phase === 'intro' || c.phase === 'done')) c.t = 99;
	}

	update(dt) {
		const c = this.cur;
		if (!c) return;
		c.t += dt;
		if (c.phase === 'intro' && c.t > 1.6) { c.phase = 'flash'; c.t = 0; }
		else if (c.phase === 'flash' && c.t > 2.4) { this.apply(); c.phase = 'done'; c.t = 0; }
		else if (c.phase === 'done' && c.t > 1.8) {
			const data = c.data;
			this.cur = null;
			this.next(data);
		}
	}

	draw(ctx) {
		const c = this.cur;
		if (!c) return;
		ctx.fillStyle = '#101018';
		ctx.fillRect(0, 0, VIEW_W, VIEW_H);
		ctx.imageSmoothingEnabled = false;

		// sprite: old, flashing alternation, then new
		let img = c.phase === 'done' ? c.newImg : c.oldImg;
		let white = false;
		if (c.phase === 'flash') {
			const k = Math.floor(c.t / 0.22);
			img = k % 2 === 0 ? c.oldImg : c.newImg;
			white = true;
		}
		if (img) {
			const s = 64;
			const x = VIEW_W / 2 - s / 2, y = 30;
			if (white) {
				ctx.globalAlpha = 0.6 + 0.4 * Math.sin(c.t * 20);
			}
			ctx.drawImage(img, x, y, s, s * (img.height / img.width));
			ctx.globalAlpha = 1;
		}

		ctx.fillStyle = '#f8f8e0';
		ctx.fillRect(4, VIEW_H - 42, VIEW_W - 8, 38);
		ctx.strokeStyle = '#28283a';
		ctx.strokeRect(5, VIEW_H - 41, VIEW_W - 10, 36);
		ctx.fillStyle = '#28283a';
		ctx.font = '8px monospace';
		if (c.phase === 'intro') ctx.fillText(`What? ${c.mon.name} is evolving!`, 12, VIEW_H - 24);
		else if (c.phase === 'flash') ctx.fillText('...', 12, VIEW_H - 24);
		else ctx.fillText(`${c.oldName} evolved into ${c.sp.name.toUpperCase()}!`, 12, VIEW_H - 24);
	}
}
