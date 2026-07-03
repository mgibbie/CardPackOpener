// battle.js — the battle core: Gen-3 style damage math, type chart, stat
// stages, wild AI, run mechanics, and the GBA-layout battle scene.
// Stat/moveset formulas ported from pokemonBuilder.lua (IVs random, EVs 0,
// no natures; moveset = last 4 level-up moves at the mon's level).
import { getJSON, getImage, VIEW_W, VIEW_H } from './engine.js';

// ---------- type chart (attacking type -> non-neutral matchups) ----------
const CHART = {
	Normal:   { Rock: 0.5, Ghost: 0, Steel: 0.5 },
	Fire:     { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
	Water:    { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
	Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
	Grass:    { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
	Ice:      { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
	Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
	Poison:   { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
	Ground:   { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
	Flying:   { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
	Psychic:  { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
	Bug:      { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
	Rock:     { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
	Ghost:    { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
	Dragon:   { Dragon: 2, Steel: 0.5, Fairy: 0 },
	Dark:     { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
	Steel:    { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
	Fairy:    { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};
function effectiveness(moveType, defTypes) {
	let m = 1;
	for (const t of defTypes) m *= CHART[moveType]?.[t] ?? 1;
	return m;
}

// simple stat-stage effects for common status moves (rest print no-effect)
const STAT_MOVES = {
	growl: { stat: 'atk', d: -1, foe: true }, tailwhip: { stat: 'def', d: -1, foe: true },
	leer: { stat: 'def', d: -1, foe: true }, stringshot: { stat: 'spe', d: -1, foe: true },
	scaryface: { stat: 'spe', d: -2, foe: true }, charm: { stat: 'atk', d: -2, foe: true },
	growth: { stat: 'spa', d: 1, foe: false }, harden: { stat: 'def', d: 1, foe: false },
	defensecurl: { stat: 'def', d: 1, foe: false }, withdraw: { stat: 'def', d: 1, foe: false },
	howl: { stat: 'atk', d: 1, foe: false }, sharpen: { stat: 'atk', d: 1, foe: false },
	meditate: { stat: 'atk', d: 1, foe: false }, agility: { stat: 'spe', d: 2, foe: false },
	swordsdance: { stat: 'atk', d: 2, foe: false }, irondefense: { stat: 'def', d: 2, foe: false },
	tailglow: { stat: 'spa', d: 2, foe: false }, nastyplot: { stat: 'spa', d: 2, foe: false },
};

const stageMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);

// ---------- mon construction (pokemonBuilder.lua port) ----------
function calcStat(base, iv, ev, level, isHP) {
	if (isHP) return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
	return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5;
}

export function statsFor(sp, ivs, level) {
	const b = sp.baseStats;
	return {
		hp: calcStat(b.hp || 50, ivs.hp, 0, level, true),
		atk: calcStat(b.atk || 50, ivs.atk, 0, level, false),
		def: calcStat(b.def || 50, ivs.def, 0, level, false),
		spa: calcStat(b.spa || 50, ivs.spa, 0, level, false),
		spd: calcStat(b.spd || 50, ivs.spd, 0, level, false),
		spe: calcStat(b.spe || 50, ivs.spe, 0, level, false),
	};
}

export function makeMove(mid, data) {
	const mv = data.moves[mid] || { name: mid, category: 'Physical', power: 40, acc: 100, type: 'Normal', pp: 20, priority: 0 };
	return { id: mid, name: mv.name, pp: mv.pp, maxPp: mv.pp };
}

export function buildMon(speciesId, level, data) {
	const sp = data.species[speciesId];
	if (!sp) return null;
	const iv = () => Math.floor(Math.random() * 32);
	const ivs = { hp: iv(), atk: iv(), def: iv(), spa: iv(), spd: iv(), spe: iv() };
	const stats = statsFor(sp, ivs, level);
	// last 4 level-up moves at this level, deduped (latest first)
	const learned = sp.learnset.filter(([lv]) => lv <= level);
	const seen = new Set(), moveIds = [];
	for (let i = learned.length - 1; i >= 0 && moveIds.length < 4; i--) {
		const mid = learned[i][1];
		if (!seen.has(mid)) { seen.add(mid); moveIds.push(mid); }
	}
	if (!moveIds.length) moveIds.push('tackle');
	const moves = moveIds.map(mid => makeMove(mid, data));
	return {
		speciesId, name: sp.name.toUpperCase(), level,
		types: sp.types, ivs, stats, maxHP: stats.hp, curHP: stats.hp,
		exp: level ** 3, // medium-fast growth curve
		moves, sprite: sp.sprite, num: sp.num,
	};
}

// exp yield estimated from base stat total (we have no per-species yield data)
export function expGain(foe, data) {
	const b = data.species[foe.speciesId]?.baseStats || {};
	const bst = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].reduce((s, k) => s + (b[k] || 50), 0);
	return Math.max(1, Math.floor(Math.round(bst * 0.3) * foe.level / 7));
}

// ---------- battle scene ----------
const P = { box: '#f8f8e0', border: '#28283a', text: '#28283a', panel: '#203050', panelText: '#f8f8e0' };

export class Battle {
	constructor() {
		this.data = null;
		this.active = null;
	}

	async init() {
		const [species, moves] = await Promise.all([
			getJSON('data/species_battle.json'),
			getJSON('data/moves_battle.json'),
		]);
		this.data = { species, moves };
	}

	// start a wild battle vs the party; onEnd(result) with
	// 'victory'|'defeat'|'escaped'|'caught'
	async start(party, wildId, wildLevel, onEnd) {
		const foe = buildMon(wildId, wildLevel, this.data);
		const playerMon = party.find(m => m.curHP > 0);
		if (!foe || !playerMon) { onEnd?.('escaped'); return; }
		const loadSprite = async (file, back) => {
			if (!file) return null;
			const name = back ? file.replace(/\.(png|gif)$/, '-b.$1') : file;
			return await getImage(`data/pokemon/${name}`).catch(() =>
				getImage(`data/pokemon/${file}`).catch(() => null));
		};
		const backSprites = new Map();
		const [foeImg] = await Promise.all([
			loadSprite(foe.sprite, false),
			...party.map(async m => backSprites.set(m, await loadSprite(m.sprite, true))),
		]);
		this.active = {
			party, me: playerMon, foe, foeImg, backSprites,
			meImg: backSprites.get(playerMon),
			meBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
			foeBoosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
			meShownHP: playerMon.curHP, foeShownHP: foe.curHP,
			phase: 'flash', t: 0,
			menuIdx: 0, moveIdx: 0,
			queue: [],           // pending messages/actions
			msg: '', msgT: 0,
			runAttempts: 0,
			onEnd,
			result: null,
			caughtMon: null,
		};
		this.pushMsg(`A wild ${foe.name} appeared!`);
		this.pushMsg(`Go! ${playerMon.name}!`);
	}

	get blocking() { return this.active != null; }

	pushMsg(text, fn) { this.active.queue.push({ text, fn }); }

	// ---------- turn resolution ----------
	statOf(mon, boosts, key) { return Math.max(1, Math.floor(mon.stats[key] * stageMult(boosts[key]))); }

	useMove(user, userBoosts, target, targetBoosts, move, isFoe) {
		const a = this.active;
		const mv = this.data.moves[move.id] || {};
		move.pp = Math.max(0, move.pp - 1);
		this.pushMsg(`${user.name} used ${move.name}!`);

		if ((mv.acc ?? 100) !== true && Math.random() * 100 > (mv.acc ?? 100)) {
			this.pushMsg(`${user.name}'s attack missed!`);
			return;
		}
		if (mv.category === 'Status') {
			const eff = STAT_MOVES[move.id];
			if (eff) {
				const boosts = eff.foe ? targetBoosts : userBoosts;
				const who = eff.foe ? target : user;
				const before = boosts[eff.stat] ?? 0;
				boosts[eff.stat] = Math.max(-6, Math.min(6, before + eff.d));
				if (boosts[eff.stat] === before) { this.pushMsg('But it failed!'); return; }
				const dirWord = eff.d > 0 ? (eff.d > 1 ? 'rose sharply' : 'rose') : (eff.d < -1 ? 'fell harshly' : 'fell');
				const statWord = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' }[eff.stat];
				this.pushMsg(`${who.name}'s ${statWord} ${dirWord}!`);
			} else {
				this.pushMsg('But nothing happened!');
			}
			return;
		}
		// damage
		const phys = mv.category === 'Physical';
		const A = this.statOf(user, userBoosts, phys ? 'atk' : 'spa');
		const D = this.statOf(target, targetBoosts, phys ? 'def' : 'spd');
		const L = user.level, Pw = mv.power || 0;
		if (Pw <= 0) { this.pushMsg('But nothing happened!'); return; }
		const crit = Math.random() < 1 / 16;
		const stab = user.types.includes(mv.type) ? 1.5 : 1;
		const eff = effectiveness(mv.type, target.types);
		let dmg = Math.floor(Math.floor(Math.floor(2 * L / 5 + 2) * Pw * A / D) / 50) + 2;
		dmg = Math.floor(dmg * (crit ? 2 : 1) * stab * eff * (0.85 + Math.random() * 0.15));
		if (eff === 0) { this.pushMsg(`It doesn't affect ${target.name}...`); return; }
		dmg = Math.max(1, dmg);
		this.pushMsg('', () => { target.curHP = Math.max(0, target.curHP - dmg); });
		if (crit) this.pushMsg('A critical hit!');
		if (eff > 1) this.pushMsg("It's super effective!");
		if (eff < 1) this.pushMsg("It's not very effective...");
	}

	resolveTurn(myMove) {
		const a = this.active;
		const foeMoves = a.foe.moves.filter(m => m.pp > 0);
		const foeMove = foeMoves.length ? foeMoves[Math.floor(Math.random() * foeMoves.length)] : { id: 'struggle', name: 'Struggle', pp: 1 };
		const myPrio = this.data.moves[myMove.id]?.priority || 0;
		const foePrio = this.data.moves[foeMove.id]?.priority || 0;
		const mySpe = this.statOf(a.me, a.meBoosts, 'spe');
		const foeSpe = this.statOf(a.foe, a.foeBoosts, 'spe');
		const meFirst = myPrio !== foePrio ? myPrio > foePrio : (mySpe === foeSpe ? Math.random() < 0.5 : mySpe > foeSpe);

		const actions = meFirst
			? [[a.me, a.meBoosts, a.foe, a.foeBoosts, myMove, false], [a.foe, a.foeBoosts, a.me, a.meBoosts, foeMove, true]]
			: [[a.foe, a.foeBoosts, a.me, a.meBoosts, foeMove, true], [a.me, a.meBoosts, a.foe, a.foeBoosts, myMove, false]];

		this.useMove(...actions[0]);
		this.pushMsg('', () => {
			if (a.foe.curHP > 0 && a.me.curHP > 0) this.useMove(...actions[1]);
		});
		this.pushMsg('', () => this.checkFaints());
	}

	checkFaints() {
		const a = this.active;
		if (a.foe.curHP <= 0) {
			this.pushMsg(`The wild ${a.foe.name} fainted!`);
			this.grantExp();
		} else if (a.me.curHP <= 0) {
			this.pushMsg(`${a.me.name} fainted!`);
			const next = a.party.find(m => m.curHP > 0);
			if (next) {
				this.pushMsg(`Go! ${next.name}!`, () => {
					a.me = next;
					a.meImg = a.backSprites.get(next);
					a.meBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
					a.meShownHP = next.curHP;
				});
			} else {
				this.pushMsg('You blacked out...', () => this.finish('defeat'));
			}
		}
	}

	// exp -> level ups -> stat recalc -> move learning (medium-fast curve)
	grantExp() {
		const a = this.active;
		const mon = a.me;
		const gain = expGain(a.foe, this.data);
		mon.exp = (mon.exp ?? mon.level ** 3) + gain;
		this.pushMsg(`${mon.name} gained ${gain} EXP!`);
		const sp = this.data.species[mon.speciesId];
		while (mon.level < 100 && mon.exp >= (mon.level + 1) ** 3) {
			mon.level++;
			const lvl = mon.level;
			this.pushMsg(`${mon.name} grew to Lv${lvl}!`, () => {
				const ivs = mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
				const oldMax = mon.maxHP;
				mon.stats = statsFor(sp, ivs, lvl);
				mon.maxHP = mon.stats.hp;
				mon.curHP = Math.min(mon.maxHP, mon.curHP + (mon.maxHP - oldMax));
				a.meShownHP = mon.curHP;
			});
			for (const [lv, mid] of sp.learnset) {
				if (lv !== lvl || mon.moves.some(m => m.id === mid)) continue;
				if (mon.moves.length < 4) {
					this.pushMsg(`${mon.name} learned ${this.data.moves[mid]?.name || mid}!`,
						() => mon.moves.push(makeMove(mid, this.data)));
				} else {
					const old = mon.moves[0];
					this.pushMsg(`${mon.name} forgot ${old.name} and learned ${this.data.moves[mid]?.name || mid}!`,
						() => { mon.moves.shift(); mon.moves.push(makeMove(mid, this.data)); });
				}
			}
		}
		this.pushMsg('', () => this.finish('victory'));
	}

	// Gen3-style catch: HP factor + flat species rate, 4 shake checks
	throwBall() {
		const a = this.active;
		this.pushMsg('You threw a POKe BALL!');
		const rate = 190; // flat until per-species catch rates are sourced
		const f = Math.max(1, Math.floor((3 * a.foe.maxHP - 2 * a.foe.curHP) * rate / (3 * a.foe.maxHP)));
		const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / f)));
		let shakes = 0;
		while (shakes < 4 && Math.floor(Math.random() * 65536) < b) shakes++;
		for (let i = 1; i <= Math.min(shakes, 3); i++) this.pushMsg('...' + '*'.repeat(i));
		if (shakes >= 4) {
			this.pushMsg(`Gotcha! ${a.foe.name} was caught!`, () => {
				a.caughtMon = a.foe;
				this.finish('caught');
			});
		} else {
			this.pushMsg(`Oh no! The ${a.foe.name} broke free!`);
			this.pushMsg('', () => {
				const foeMoves = a.foe.moves.filter(m => m.pp > 0);
				if (foeMoves.length) this.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, foeMoves[Math.floor(Math.random() * foeMoves.length)], true);
			});
			this.pushMsg('', () => this.checkFaints());
		}
	}

	tryRun() {
		const a = this.active;
		a.runAttempts++;
		const mySpe = a.me.stats.spe, foeSpe = a.foe.stats.spe;
		let ok = mySpe >= foeSpe;
		if (!ok) {
			const f = (Math.floor(mySpe * 128 / foeSpe) + 30 * a.runAttempts) % 256;
			ok = Math.floor(Math.random() * 256) < f;
		}
		if (ok) this.pushMsg('Got away safely!', () => this.finish('escaped'));
		else {
			this.pushMsg("Can't escape!");
			this.pushMsg('', () => {
				const foeMoves = a.foe.moves.filter(m => m.pp > 0);
				if (foeMoves.length) this.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, foeMoves[Math.floor(Math.random() * foeMoves.length)], true);
			});
			this.pushMsg('', () => this.checkFaints());
		}
	}

	finish(result) {
		const a = this.active;
		a.result = result;
		a.phase = 'done';
	}

	// ---------- input ----------
	key(k) {
		const a = this.active;
		if (!a) return;
		// advance message
		if (a.phase === 'msg' && (k === 'z' || k === 'Enter')) { a.msgT = 99; return; }
		if (a.phase === 'menu') {
			if (k === 'ArrowLeft') a.menuIdx = (a.menuIdx + 2) % 3;
			if (k === 'ArrowRight') a.menuIdx = (a.menuIdx + 1) % 3;
			if (k === 'z' || k === 'Enter') {
				if (a.menuIdx === 0) { a.phase = 'moves'; a.moveIdx = 0; }
				else if (a.menuIdx === 1) this.startQueue(() => this.throwBall());
				else this.startQueue(() => this.tryRun());
			}
		} else if (a.phase === 'moves') {
			const n = a.me.moves.length;
			if (k === 'ArrowUp' && a.moveIdx >= 2) a.moveIdx -= 2;
			if (k === 'ArrowDown' && a.moveIdx + 2 < n) a.moveIdx += 2;
			if (k === 'ArrowLeft' && a.moveIdx % 2 === 1) a.moveIdx--;
			if (k === 'ArrowRight' && a.moveIdx % 2 === 0 && a.moveIdx + 1 < n) a.moveIdx++;
			if (k === 'x') a.phase = 'menu';
			if (k === 'z' || k === 'Enter') {
				const mv = a.me.moves[a.moveIdx];
				if (mv.pp > 0) this.startQueue(() => this.resolveTurn(mv));
			}
		}
	}

	startQueue(fn) {
		const a = this.active;
		fn();
		a.phase = 'msg';
	}

	// ---------- update/draw ----------
	update(dt) {
		const a = this.active;
		if (!a) return;
		a.t += dt;
		// HP bar easing
		a.foeShownHP += (a.foe.curHP - a.foeShownHP) * Math.min(1, dt * 6);
		a.meShownHP += (a.me.curHP - a.meShownHP) * Math.min(1, dt * 6);
		if (Math.abs(a.foeShownHP - a.foe.curHP) < 0.5) a.foeShownHP = a.foe.curHP;
		if (Math.abs(a.meShownHP - a.me.curHP) < 0.5) a.meShownHP = a.me.curHP;

		if (a.phase === 'flash') {
			if (a.t > 0.7) { a.phase = 'msg'; }
			return;
		}
		if (a.phase === 'msg') {
			// waiting for HP bars before advancing
			const settled = a.foeShownHP === a.foe.curHP && a.meShownHP === a.me.curHP;
			a.msgT += dt;
			if ((a.msgT > 1.1 || a.msgT >= 99) && settled) {
				const next = a.queue.shift();
				if (next) {
					next.fn?.();
					if (next.text) { a.msg = next.text; a.msgT = 0; }
					else a.msgT = 1.2; // silent action; move on quickly
				} else if (a.phase !== 'done') {
					a.phase = 'menu';
					a.msg = `What will ${a.me.name} do?`;
				}
			}
			return;
		}
		if (a.phase === 'done') {
			a.doneT = (a.doneT || 0) + dt;
			if (a.doneT > 0.8) {
				const cb = a.onEnd, res = a.result;
				this.lastCaught = a.caughtMon;
				this.active = null;
				cb?.(res);
			}
		}
	}

	drawHPBar(ctx, x, y, w, shown, max) {
		const frac = Math.max(0, shown / max);
		ctx.fillStyle = '#58585a';
		ctx.fillRect(x - 1, y - 1, w + 2, 5);
		ctx.fillStyle = frac > 0.5 ? '#40c860' : frac > 0.2 ? '#f0c020' : '#e83020';
		ctx.fillRect(x, y, Math.round(w * frac), 3);
	}

	draw(ctx) {
		const a = this.active;
		if (!a) return;
		if (a.phase === 'flash') {
			const k = Math.floor(a.t / 0.12);
			if (k % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
			return;
		}
		// backdrop
		const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
		g.addColorStop(0, '#a8d8f0');
		g.addColorStop(1, '#e8f0d8');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, VIEW_W, VIEW_H - 44);
		// ground ellipses
		ctx.fillStyle = 'rgba(120,160,90,0.55)';
		ctx.beginPath(); ctx.ellipse(178, 72, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
		ctx.beginPath(); ctx.ellipse(56, 112, 48, 13, 0, 0, Math.PI * 2); ctx.fill();

		ctx.imageSmoothingEnabled = false;
		if (a.foeImg) {
			const s = Math.min(56, a.foeImg.width);
			ctx.drawImage(a.foeImg, 178 - s / 2, 72 - s + 6, s, s * (a.foeImg.height / a.foeImg.width));
		}
		if (a.meImg) {
			const s = Math.min(60, a.meImg.width);
			ctx.drawImage(a.meImg, 56 - s / 2, 112 - s + 8, s, s * (a.meImg.height / a.meImg.width));
		}

		ctx.font = '8px monospace';
		// foe info box (top-left)
		ctx.fillStyle = P.box; ctx.strokeStyle = P.border;
		ctx.fillRect(6, 8, 96, 26); ctx.strokeRect(6.5, 8.5, 95, 25);
		ctx.fillStyle = P.text;
		ctx.fillText(a.foe.name, 10, 17);
		ctx.fillText(`Lv${a.foe.level}`, 78, 17);
		this.drawHPBar(ctx, 26, 25, 66, a.foeShownHP, a.foe.maxHP);
		ctx.fillText('HP', 10, 29);
		// my info box (mid-right, above the message panel)
		ctx.fillStyle = P.box;
		ctx.fillRect(136, 78, 100, 34); ctx.strokeRect(136.5, 78.5, 99, 33);
		ctx.fillStyle = P.text;
		ctx.fillText(a.me.name, 140, 87);
		ctx.fillText(`Lv${a.me.level}`, 212, 87);
		this.drawHPBar(ctx, 156, 94, 70, a.meShownHP, a.me.maxHP);
		ctx.fillText('HP', 140, 98);
		ctx.fillText(`${Math.round(a.meShownHP)}/${a.me.maxHP}`, 168, 107);

		// message panel
		ctx.fillStyle = P.panel;
		ctx.fillRect(0, VIEW_H - 44, VIEW_W, 44);
		ctx.strokeStyle = '#8fa8d0';
		ctx.strokeRect(2.5, VIEW_H - 41.5, VIEW_W - 5, 39);
		ctx.fillStyle = P.panelText;

		if (a.phase === 'moves') {
			a.me.moves.forEach((mv, i) => {
				const x = 12 + (i % 2) * 112, y = VIEW_H - 28 + Math.floor(i / 2) * 14;
				if (i === a.moveIdx) ctx.fillText('>', x - 8, y);
				ctx.fillText(mv.name.toUpperCase().slice(0, 12), x, y);
			});
			const sel = a.me.moves[a.moveIdx];
			const mv = this.data.moves[sel.id];
			ctx.fillText(`PP ${sel.pp}/${sel.maxPp}  ${mv?.type || ''}`, 12, VIEW_H - 4 + 0);
		} else if (a.phase === 'menu') {
			ctx.fillText(a.msg, 10, VIEW_H - 26);
			ctx.fillText(a.menuIdx === 0 ? '> FIGHT' : '  FIGHT', 130, VIEW_H - 30);
			ctx.fillText(a.menuIdx === 1 ? '> BALL' : '  BALL', 186, VIEW_H - 30);
			ctx.fillText(a.menuIdx === 2 ? '> RUN' : '  RUN', 130, VIEW_H - 16);
		} else {
			// wrap message to two lines
			const words = a.msg.split(' ');
			let line = '', lines = [];
			for (const w of words) {
				if ((line + w).length > 36) { lines.push(line); line = w + ' '; }
				else line += w + ' ';
			}
			lines.push(line);
			lines.slice(0, 2).forEach((l, i) => ctx.fillText(l.trim(), 10, VIEW_H - 28 + i * 12));
		}
	}
}
