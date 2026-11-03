// evolution.js — post-battle level-up evolutions with the classic flashing
// sprite sequence. Keeps IVs/exp/moves/damage; stats recalc for the new species.
import { getImage, VIEW_W, VIEW_H } from './engine.js';
import { statsFor } from './battle.js';
import * as Clock from './clock.js';
import { sfx } from './sound.js';
import * as Bag from './bag.js';
import { pickEvo, charmRegion } from './regional_forms.js';

// Is a level-up-style evolution's condition met? (item evolutions go through the
// bag, not here). `move`/`crits`/`damage` are the regional lines' methods
// (regional_forms.js REGIONAL_EVOS).
export function levelEvoReady(mon, e) {
	switch (e.type) {
		case 'level': return mon.level >= e.param;
		case 'friendship': return (mon.friend ?? 70) >= (e.param || 220);
		case 'move': return (mon.moves || []).some(m => m.id === e.param);
		case 'crits': return (mon.battleCrits || 0) >= e.param;
		case 'damage': return mon.curHP > 0 && (mon.maxHP - mon.curHP) >= e.param;
		default: return false;
	}
}

export class Evolution {
	constructor() {
		this.queue = [];
		this.cur = null; // { mon, target, sp, oldImg, newImg, phase, t }
		this.onDone = null;
	}

	get blocking() { return this.cur != null || this.queue.length > 0; }

	// scan the party for pending level/friendship evolutions and start the
	// sequence. Time-gated evos (Eevee->Espeon by day / Umbreon by night) only
	// fire when the clock's phase matches evo.time.
	async check(party, data) {
		const timeOk = e => !e.time || (e.time === 'day' ? Clock.isDay() : Clock.isNight());
		for (const mon of party) {
			if (mon.heldItem === 'everstone') continue; // EVERSTONE halts natural level/friendship evolution
			const evos = data.extra?.[mon.speciesId]?.evos || [];
			// a held ALOLA / GALAR / HISUI CHARM selects the regional branch; a tie
			// left after that is broken canonically (evo_pick.js), not by list order
			const evo = pickEvo(mon, evos, data, e => timeOk(e) && levelEvoReady(mon, e), charmRegion(mon, Bag.ITEMS),
				{ isNight: Clock.isNight() });
			if (evo) this.queue.push({ mon, target: evo.target });
		}
		// the crit count is one battle's; it must not carry into the next check
		for (const mon of party) delete mon.battleCrits;
		if (this.queue.length && !this.cur) this.next(data);
	}

	// an evolution item was used on this mon: run the sequence right away
	evolveNow(mon, target, data) {
		if (!data.species[target]) return false;
		this.queue.push({ mon, target });
		if (!this.cur) this.next(data);
		return true;
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
		this.cur = { ...item, sp, data, oldImg, newImg,
			oldScale: data.species[item.mon.speciesId]?.battleScale || 1,
			newScale: sp.battleScale || 1,
			phase: 'intro', t: 0 };
	}

	apply() {
		const { mon, target, sp } = this.cur;
		this.cur.oldName = mon.name;
		const damage = mon.maxHP - mon.curHP;
		const oldId = mon.speciesId;
		mon.speciesId = target;
		// the ability follows the species: Pikachu's STATIC becomes Alolan Raichu's
		// SURGE SURFER (same slot), unless the old one is also legal for the new species
		const abs = this.cur.data?.abilities || {};
		const newAbs = abs[target] || [];
		if (mon.ability && newAbs.length && !newAbs.includes(mon.ability)) {
			const slot = (abs[oldId] || []).indexOf(mon.ability);
			mon.ability = newAbs[Math.min(Math.max(slot, 0), newAbs.length - 1)];
		}
		mon.name = sp.name.toUpperCase();
		mon.types = sp.types;
		mon.sprite = sp.sprite;
		mon.num = sp.num;
		const ivs = mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
		mon.stats = statsFor(sp, ivs, mon.level, mon);
		mon.maxHP = mon.stats.hp;
		mon.curHP = Math.max(1, mon.maxHP - damage);
		this.onEvolved?.(this.cur.oldName, mon.name, mon);
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
		else if (c.phase === 'flash' && c.t > 2.4) { this.apply(); sfx('fanfare_evolve'); c.phase = 'done'; c.t = 0; }
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
			// fit into a 64px box (contain), then apply the species' battleScale so the mon
			// visibly grows/shrinks across the evolution. Bottom-anchor at a fixed feet line
			// and clamp so a big mon (up to 1.9x) never pokes above the top of the small view.
			const bScale = img === c.newImg ? c.newScale : c.oldScale;
			const baseline = VIEW_H - 62, topMargin = 8;
			let nz = (64 / Math.max(img.width, img.height)) * bScale;
			let dw = img.width * nz, dh = img.height * nz;
			if (baseline - dh < topMargin) { const k = (baseline - topMargin) / dh; dw *= k; dh *= k; }
			const x = VIEW_W / 2 - dw / 2, y = baseline - dh;
			if (white) {
				ctx.globalAlpha = 0.6 + 0.4 * Math.sin(c.t * 20);
			}
			ctx.drawImage(img, x, y, dw, dh);
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
