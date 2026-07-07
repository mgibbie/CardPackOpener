// battle.js — the battle core: Gen-3 style damage math, type chart, stat
// stages, wild AI, run mechanics, and the GBA-layout battle scene.
// Stat/moveset formulas ported from pokemonBuilder.lua (IVs random, EVs 0,
// no natures; moveset = last 4 level-up moves at the mon's level).
import { getJSON, getImage, VIEW_W, VIEW_H } from './engine.js';
import * as Bag from './bag.js';
import * as UI from './battleui.js';
import { cry, sfx } from './sound.js';

const STRUGGLE = () => ({ id: 'struggle', name: 'Struggle', pp: 1, maxPp: 1 });

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
	sandattack: { stat: 'acc', d: -1, foe: true }, smokescreen: { stat: 'acc', d: -1, foe: true },
	flash: { stat: 'acc', d: -1, foe: true }, kinesis: { stat: 'acc', d: -1, foe: true },
	doubleteam: { stat: 'eva', d: 1, foe: false }, minimize: { stat: 'eva', d: 1, foe: false },
};

const freshBoosts = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });

const stageMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);

// ---------- move effects (statuses, secondaries, heal/drain/recoil/multi-hit) ----------
// status ids: brn, psn, par, slp, frz
const MOVE_FX = {
	// pure status infliction
	thunderwave: { status: 'par' }, stunspore: { status: 'par' }, glare: { status: 'par' },
	sleeppowder: { status: 'slp' }, spore: { status: 'slp' }, hypnosis: { status: 'slp' },
	sing: { status: 'slp' }, lovelykiss: { status: 'slp' }, grasswhistle: { status: 'slp' },
	poisonpowder: { status: 'psn' }, poisongas: { status: 'psn' },
	toxic: { status: 'psn', bad: true },
	willowisp: { status: 'brn' },
	// confusion, seeding, and side screens
	confuseray: { confuse: true }, supersonic: { confuse: true }, sweetkiss: { confuse: true },
	teeterdance: { confuse: true }, swagger: { confuse: true },
	confusion: { sec: { confuse: true, ch: 10 } }, psybeam: { sec: { confuse: true, ch: 10 } },
	dizzypunch: { sec: { confuse: true, ch: 20 } }, waterpulse: { sec: { confuse: true, ch: 20 } },
	dynamicpunch: { sec: { confuse: true, ch: 100 } }, signalbeam: { sec: { confuse: true, ch: 10 } },
	hurricane: { sec: { confuse: true, ch: 30 } },
	leechseed: { seed: true },
	reflect: { screen: 'reflect' }, lightscreen: { screen: 'light' },
	// secondary status/flinch chances on damaging moves
	ember: { sec: { status: 'brn', ch: 10 } }, flamethrower: { sec: { status: 'brn', ch: 10 } },
	fireblast: { sec: { status: 'brn', ch: 30 } }, firepunch: { sec: { status: 'brn', ch: 10 } },
	flamewheel: { sec: { status: 'brn', ch: 10 } }, heatwave: { sec: { status: 'brn', ch: 10 } },
	thundershock: { sec: { status: 'par', ch: 10 } }, thunderbolt: { sec: { status: 'par', ch: 10 } },
	thunder: { sec: { status: 'par', ch: 30 } }, thunderpunch: { sec: { status: 'par', ch: 10 } },
	spark: { sec: { status: 'par', ch: 30 } }, bodyslam: { sec: { status: 'par', ch: 30 } },
	lick: { sec: { status: 'par', ch: 30 } }, dragonbreath: { sec: { status: 'par', ch: 30 } },
	icebeam: { sec: { status: 'frz', ch: 10 } }, blizzard: { sec: { status: 'frz', ch: 10 } },
	icepunch: { sec: { status: 'frz', ch: 10 } }, powdersnow: { sec: { status: 'frz', ch: 10 } },
	poisonsting: { sec: { status: 'psn', ch: 30 } }, sludge: { sec: { status: 'psn', ch: 30 } },
	sludgebomb: { sec: { status: 'psn', ch: 30 } }, smog: { sec: { status: 'psn', ch: 40 } },
	poisonjab: { sec: { status: 'psn', ch: 30 } }, crosspoison: { sec: { status: 'psn', ch: 10 } },
	bite: { sec: { flinch: true, ch: 30 } }, headbutt: { sec: { flinch: true, ch: 30 } },
	rockslide: { sec: { flinch: true, ch: 30 } }, airslash: { sec: { flinch: true, ch: 30 } },
	ironhead: { sec: { flinch: true, ch: 30 } }, astonish: { sec: { flinch: true, ch: 30 } },
	zenheadbutt: { sec: { flinch: true, ch: 20 } }, darkpulse: { sec: { flinch: true, ch: 20 } },
	extrasensory: { sec: { flinch: true, ch: 10 } }, wingattack: {},
	// healing
	recover: { heal: 0.5 }, softboiled: { heal: 0.5 }, milkdrink: { heal: 0.5 },
	slackoff: { heal: 0.5 }, roost: { heal: 0.5 }, synthesis: { heal: 0.5 },
	morningsun: { heal: 0.5 }, moonlight: { heal: 0.5 }, shoreup: { heal: 0.5 },
	rest: { heal: 1, selfStatus: 'slp' },
	// drain / recoil / multi-hit
	absorb: { drain: 0.5 }, megadrain: { drain: 0.5 }, gigadrain: { drain: 0.5 },
	leechlife: { drain: 0.5 }, drainpunch: { drain: 0.5 }, dreameater: { drain: 0.5 },
	hornleech: { drain: 0.5 }, drainingkiss: { drain: 0.75 },
	doubleedge: { recoil: 1 / 3 }, takedown: { recoil: 0.25 }, submission: { recoil: 0.25 },
	flareblitz: { recoil: 1 / 3 }, bravebird: { recoil: 1 / 3 }, wildcharge: { recoil: 0.25 },
	headsmash: { recoil: 0.5 }, struggle: { recoil: 0.25 },
	doubleslap: { hits: [2, 5] }, furyattack: { hits: [2, 5] }, pinmissile: { hits: [2, 5] },
	furyswipes: { hits: [2, 5] }, spikecannon: { hits: [2, 5] }, barrage: { hits: [2, 5] },
	cometpunch: { hits: [2, 5] }, bulletseed: { hits: [2, 5] }, rockblast: { hits: [2, 5] },
	iciclespear: { hits: [2, 5] }, doublekick: { hits: [2, 2] }, bonemerang: { hits: [2, 2] },
	dualchop: { hits: [2, 2] }, doublehit: { hits: [2, 2] },
};

const STATUS_NAMES = { brn: 'BRN', psn: 'PSN', par: 'PAR', slp: 'SLP', frz: 'FRZ' };
const STATUS_APPLIED_MSG = {
	brn: 'was burned!', psn: 'was poisoned!', par: 'is paralyzed! It may be unable to move!',
	slp: 'fell asleep!', frz: 'was frozen solid!',
};
// type immunities to statuses (Gen3-ish)
const STATUS_IMMUNE = {
	brn: ['Fire'], frz: ['Ice'], psn: ['Poison', 'Steel'], par: [], slp: [],
};

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

// real exp yield when known (dex.json), else base-stat-total estimate
export function expGain(foe, data) {
	let yieldBase = data.extra?.[foe.speciesId]?.exp;
	if (!yieldBase) {
		const b = data.species[foe.speciesId]?.baseStats || {};
		const bst = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].reduce((s, k) => s + (b[k] || 50), 0);
		yieldBase = Math.floor(bst / 4);
	}
	return Math.max(1, Math.floor(yieldBase * foe.level / 7));
}

// ---------- battle scene ----------
const P = { box: '#f8f8e0', border: '#28283a', text: '#28283a', panel: '#203050', panelText: '#f8f8e0' };

export class Battle {
	constructor() {
		this.data = null;
		this.active = null;
	}

	async init() {
		const [species, moves, extra] = await Promise.all([
			getJSON('data/species_battle.json'),
			getJSON('data/moves_battle.json'),
			getJSON('data/species_extra.json').catch(() => ({})),
		]);
		this.data = { species, moves, extra };
		// the Love2D build's pixel font, so battle text matches the desktop game
		try {
			const f = new FontFace('m6x11plus', 'url(data/fonts/m6x11plus.ttf)');
			await f.load();
			document.fonts.add(f);
		} catch (e) { /* system monospace fallback */ }
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
			meBoosts: freshBoosts(),
			foeBoosts: freshBoosts(),
			meShownHP: playerMon.curHP, foeShownHP: foe.curHP,
			meScreens: { reflect: 0, light: 0 }, foeScreens: { reflect: 0, light: 0 },
			phase: 'flash', t: 0,
			menuIdx: 0, moveIdx: 0,
			queue: [],           // pending messages/actions
			msg: '', msgT: 0,
			runAttempts: 0,
			onEnd,
			result: null,
			caughtMon: null,
		};
		for (const m of party) this.clearVolatiles(m);
		this.pushMsg(`A wild ${foe.name} appeared!`, () => cry(foe.speciesId));
		this.pushMsg(`Go! ${playerMon.name}!`, () => { sfx('ball_open'); cry(playerMon.speciesId); });
	}

	// trainer battle: foeParty of mons, no running, no catching
	async startTrainer(party, foeParty, info, onEnd) {
		const playerMon = party.find(m => m.curHP > 0);
		if (!foeParty.length || !playerMon) { onEnd?.('escaped'); return; }
		const loadSprite = async (file, back) => {
			if (!file) return null;
			const name = back ? file.replace(/\.(png|gif)$/, '-b.$1') : file;
			return await getImage(`data/pokemon/${name}`).catch(() =>
				getImage(`data/pokemon/${file}`).catch(() => null));
		};
		const backSprites = new Map(), foeSprites = new Map();
		await Promise.all([
			...party.map(async m => backSprites.set(m, await loadSprite(m.sprite, true))),
			...foeParty.map(async m => foeSprites.set(m, await loadSprite(m.sprite, false))),
		]);
		const foe = foeParty[0];
		this.active = {
			party, me: playerMon, foe, backSprites, foeSprites,
			foes: foeParty, foeIdx: 0, isTrainer: true, info,
			foeImg: foeSprites.get(foe),
			meImg: backSprites.get(playerMon),
			meBoosts: freshBoosts(),
			foeBoosts: freshBoosts(),
			meShownHP: playerMon.curHP, foeShownHP: foe.curHP,
			meScreens: { reflect: 0, light: 0 }, foeScreens: { reflect: 0, light: 0 },
			phase: 'flash', t: 0,
			menuIdx: 0, moveIdx: 0,
			queue: [],
			msg: '', msgT: 0,
			runAttempts: 0,
			onEnd,
			result: null,
			caughtMon: null,
		};
		for (const m of party) this.clearVolatiles(m);
		this.pushMsg(`You are challenged by ${info.displayName}!`);
		this.pushMsg(`${info.displayName} sent out ${foe.name}!`, () => cry(foe.speciesId));
		this.pushMsg(`Go! ${playerMon.name}!`, () => { sfx('ball_open'); cry(playerMon.speciesId); });
	}

	get blocking() { return this.active != null; }

	pushMsg(text, fn) { this.active.queue.push({ text, fn }); }
	// queued sprite animation: the message queue pauses while it plays
	pushAnim(kind, side, dur, done, extra) { this.active.queue.push({ anim: { kind, side, dur, done, ...extra } }); }

	// floating combat text over a combatant ("-12", "+8"), positioned at draw time
	float(side, text, color) {
		(this.active.floaters ||= []).push({ side, text, color, t: 0 });
	}

	// ---------- turn resolution ----------
	statOf(mon, boosts, key) {
		let v = Math.floor(mon.stats[key] * stageMult(boosts[key]));
		if (key === 'atk' && mon.status === 'brn') v = Math.floor(v / 2);
		if (key === 'spe' && mon.status === 'par') v = Math.floor(v / 4);
		return Math.max(1, v);
	}

	applyStatus(target, st, bad) {
		if (target.status) { this.pushMsg('But it failed!'); return false; }
		if ((STATUS_IMMUNE[st] || []).some(t => target.types.includes(t))) {
			this.pushMsg(`It doesn't affect ${target.name}...`);
			return false;
		}
		target.status = st;
		if (st === 'slp') target.sleepTurns = 1 + Math.floor(Math.random() * 3);
		if (bad) { target.badPsn = true; target.toxicN = 1; }
		this.pushMsg(`${target.name} ${bad ? 'was badly poisoned!' : STATUS_APPLIED_MSG[st]}`);
		return true;
	}

	applyConfusion(target) {
		if (target.confuseTurns > 0) { this.pushMsg('But it failed!'); return; }
		target.confuseTurns = 2 + Math.floor(Math.random() * 4);
		this.pushMsg(`${target.name} became confused!`);
	}

	// battle-only conditions never leak into the save
	clearVolatiles(mon) {
		delete mon.confuseTurns;
		delete mon.seeded;
		delete mon.badPsn;
		delete mon.toxicN;
		mon.flinched = false;
	}

	// returns false if the user cannot act this turn (sleep/freeze/para/flinch/confusion)
	beforeMove(user, userBoosts, isFoe) {
		if (user.flinched) {
			user.flinched = false;
			this.pushMsg(`${user.name} flinched and couldn't move!`);
			return false;
		}
		if (user.confuseTurns > 0) {
			user.confuseTurns--;
			if (user.confuseTurns <= 0) {
				this.pushMsg(`${user.name} snapped out of its confusion!`);
			} else {
				this.pushMsg(`${user.name} is confused!`);
				if (Math.random() < 0.5) {
					// 40-power typeless self-hit off its own attack and defense
					const A = this.statOf(user, userBoosts || freshBoosts(), 'atk');
					const D = this.statOf(user, userBoosts || freshBoosts(), 'def');
					let dmg = Math.floor(Math.floor(Math.floor(2 * user.level / 5 + 2) * 40 * A / D) / 50) + 2;
					dmg = Math.max(1, Math.floor(dmg * (0.85 + Math.random() * 0.15)));
					this.pushMsg('It hurt itself in its confusion!', () => {
						sfx('hit_normal');
						user.curHP = Math.max(0, user.curHP - dmg);
						this.float(isFoe ? 'foe' : 'me', `-${dmg}`, '#ff7a6b');
					});
					return false;
				}
			}
		}
		if (user.status === 'slp') {
			if (--user.sleepTurns <= 0) {
				user.status = null;
				this.pushMsg(`${user.name} woke up!`);
			} else {
				this.pushMsg(`${user.name} is fast asleep.`);
				return false;
			}
		}
		if (user.status === 'frz') {
			if (Math.random() < 0.2) {
				user.status = null;
				this.pushMsg(`${user.name} thawed out!`);
			} else {
				this.pushMsg(`${user.name} is frozen solid!`);
				return false;
			}
		}
		if (user.status === 'par' && Math.random() < 0.25) {
			this.pushMsg(`${user.name} is fully paralyzed!`);
			return false;
		}
		return true;
	}

	useMove(user, userBoosts, target, targetBoosts, move, isFoe) {
		const a = this.active;
		const mv = this.data.moves[move.id] || {};
		const fx = MOVE_FX[move.id] || {};
		if (!this.beforeMove(user, userBoosts, isFoe)) return;
		move.pp = Math.max(0, move.pp - 1);
		this.pushMsg(`${user.name} used ${move.name}!`);

		const hitChance = (mv.acc ?? 100) * stageMult((userBoosts.acc || 0) - (targetBoosts.eva || 0));
		if ((mv.acc ?? 100) !== true && Math.random() * 100 > hitChance) {
			this.pushMsg(`${user.name}'s attack missed!`);
			return;
		}
		if (mv.category === 'Status') {
			if (fx.heal) {
				if (user.curHP >= user.maxHP) { this.pushMsg('But it failed!'); return; }
				const amt = Math.floor(user.maxHP * fx.heal);
				this.pushMsg(`${user.name} regained health!`, () => {
					user.curHP = Math.min(user.maxHP, user.curHP + amt);
					this.float(isFoe ? 'foe' : 'me', `+${amt}`, '#6be08a');
				});
				if (fx.selfStatus === 'slp') {
					user.status = 'slp';
					user.sleepTurns = 2;
					this.pushMsg(`${user.name} went to sleep!`);
				}
				return;
			}
			if (fx.status) { this.applyStatus(target, fx.status, fx.bad); return; }
			if (fx.confuse) { this.applyConfusion(target); return; }
			if (fx.seed) {
				if (target.types.includes('Grass')) { this.pushMsg(`It doesn't affect ${target.name}...`); return; }
				if (target.seeded) { this.pushMsg('But it failed!'); return; }
				target.seeded = true;
				this.pushMsg(`${target.name} was seeded!`);
				return;
			}
			if (fx.screen) {
				const side = isFoe ? a.foeScreens : a.meScreens;
				if (side[fx.screen] > 0) { this.pushMsg('But it failed!'); return; }
				side[fx.screen] = 5;
				this.pushMsg(fx.screen === 'reflect'
					? `${user.name} is protected by Reflect!`
					: `${user.name} is protected by Light Screen!`);
				return;
			}
			const eff = STAT_MOVES[move.id];
			if (eff) {
				const boosts = eff.foe ? targetBoosts : userBoosts;
				const who = eff.foe ? target : user;
				const before = boosts[eff.stat] ?? 0;
				boosts[eff.stat] = Math.max(-6, Math.min(6, before + eff.d));
				if (boosts[eff.stat] === before) { this.pushMsg('But it failed!'); return; }
				const dirWord = eff.d > 0 ? (eff.d > 1 ? 'rose sharply' : 'rose') : (eff.d < -1 ? 'fell harshly' : 'fell');
				const statWord = { atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', acc: 'accuracy', eva: 'evasiveness' }[eff.stat];
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
		const eff = effectiveness(mv.type, target.types);
		if (eff === 0) { this.pushMsg(`It doesn't affect ${target.name}...`); return; }
		const stab = user.types.includes(mv.type) ? 1.5 : 1;
		const nHits = fx.hits ? fx.hits[0] + Math.floor(Math.random() * (fx.hits[1] - fx.hits[0] + 1)) : 1;
		// Reflect / Light Screen on the defender's side halves the matching category
		const defScreens = isFoe ? a.meScreens : a.foeScreens;
		const screened = defScreens?.[phys ? 'reflect' : 'light'] > 0 ? 0.5 : 1;
		let total = 0, crits = 0;
		for (let h = 0; h < nHits; h++) {
			const crit = Math.random() < 1 / 16;
			if (crit) crits++;
			let dmg = Math.floor(Math.floor(Math.floor(2 * L / 5 + 2) * Pw * A / D) / 50) + 2;
			dmg = Math.max(1, Math.floor(dmg * (crit ? 2 : 1) * stab * eff * screened * (0.85 + Math.random() * 0.15)));
			total += dmg;
		}
		total = Math.min(total, target.curHP);
		const targetSide = isFoe ? 'me' : 'foe';
		this.pushAnim('lunge', isFoe ? 'foe' : 'me', 0.3);
		this.pushAnim('hit', targetSide, 0.4, null, { color: UI.TYPE_COLORS[mv.type] || '#e8e8e8' });
		this.pushMsg('', () => {
			sfx(eff > 1 ? 'hit_super' : eff < 1 ? 'hit_weak' : 'hit_normal');
			target.curHP = Math.max(0, target.curHP - total);
			this.float(targetSide, `-${total}`, crits ? '#ffd23f' : '#ff7a6b');
		});
		if (nHits > 1) this.pushMsg(`Hit ${nHits} time(s)!`);
		if (crits) this.pushMsg('A critical hit!');
		if (eff > 1) this.pushMsg("It's super effective!");
		if (eff < 1) this.pushMsg("It's not very effective...");
		if (fx.drain) {
			const healed = Math.max(1, Math.floor(total * fx.drain));
			this.pushMsg(`${target.name} had its energy drained!`, () => {
				user.curHP = Math.min(user.maxHP, user.curHP + healed);
				this.float(isFoe ? 'foe' : 'me', `+${healed}`, '#6be08a');
			});
		}
		if (fx.recoil) {
			const rec = Math.max(1, Math.floor(total * fx.recoil));
			this.pushMsg(`${user.name} is damaged by recoil!`, () => {
				user.curHP = Math.max(0, user.curHP - rec);
				this.float(isFoe ? 'foe' : 'me', `-${rec}`, '#ff7a6b');
			});
		}
		if (fx.sec && Math.random() * 100 < fx.sec.ch) {
			this.pushMsg('', () => {
				if (target.curHP <= 0) return;
				if (fx.sec.flinch) target.flinched = true; // only matters if it hasn't moved yet
				else if (fx.sec.confuse) {
					if (!(target.confuseTurns > 0)) {
						target.confuseTurns = 2 + Math.floor(Math.random() * 4);
						this.pushMsg(`${target.name} became confused!`);
					}
				} else if (!target.status && !(STATUS_IMMUNE[fx.sec.status] || []).some(t => target.types.includes(t))) {
					target.status = fx.sec.status;
					if (fx.sec.status === 'slp') target.sleepTurns = 1 + Math.floor(Math.random() * 3);
					this.pushMsg(`${target.name} ${STATUS_APPLIED_MSG[fx.sec.status]}`);
				}
			});
		}
	}

	// burn/poison chip, Toxic ramping, Leech Seed sap, screens wearing off
	endOfTurn() {
		const a = this.active;
		for (const mon of [a.me, a.foe]) {
			if (mon.curHP <= 0) continue;
			const side = mon === a.me ? 'me' : 'foe';
			if (mon.status === 'brn' || mon.status === 'psn') {
				const chip = mon.badPsn
					? Math.max(1, Math.floor(mon.maxHP / 16) * Math.min(15, mon.toxicN || 1))
					: Math.max(1, Math.floor(mon.maxHP / 8));
				if (mon.badPsn) mon.toxicN = (mon.toxicN || 1) + 1;
				this.pushMsg(`${mon.name} is hurt by its ${mon.status === 'brn' ? 'burn' : 'poison'}!`,
					() => {
						mon.curHP = Math.max(0, mon.curHP - chip);
						this.float(side, `-${chip}`, '#c98fe8');
					});
			}
			if (mon.seeded) {
				const other = mon === a.me ? a.foe : a.me;
				const sap = Math.max(1, Math.floor(mon.maxHP / 8));
				this.pushMsg(`${mon.name}'s health is sapped by Leech Seed!`, () => {
					mon.curHP = Math.max(0, mon.curHP - sap);
					this.float(side, `-${sap}`, '#8ad86b');
					if (other.curHP > 0) {
						other.curHP = Math.min(other.maxHP, other.curHP + sap);
						this.float(side === 'me' ? 'foe' : 'me', `+${sap}`, '#6be08a');
					}
				});
			}
		}
		// screens tick down per side
		for (const [side, screens, who] of [['me', a.meScreens, a.me], ['foe', a.foeScreens, a.foe]]) {
			for (const key of ['reflect', 'light']) {
				if (screens[key] > 0 && --screens[key] === 0) {
					this.pushMsg(`${who.name}'s ${key === 'reflect' ? 'Reflect' : 'Light Screen'} wore off!`);
				}
			}
		}
		// flinch never carries between turns
		a.me.flinched = false;
		a.foe.flinched = false;
	}

	// wild mons act at random; trainers prefer the strongest expected hit
	// (power x STAB x type effectiveness), with a dash of unpredictability
	chooseFoeMove() {
		const a = this.active;
		const usable = a.foe.moves.filter(m => m.pp > 0);
		if (!usable.length) return STRUGGLE();
		if (!a.isTrainer || Math.random() < 0.15) return usable[Math.floor(Math.random() * usable.length)];
		let best = null, bestScore = 0;
		for (const m of usable) {
			const mv = this.data.moves[m.id] || {};
			if (!mv.power) continue;
			const score = mv.power
				* (a.foe.types.includes(mv.type) ? 1.5 : 1)
				* effectiveness(mv.type, a.me.types);
			if (score > bestScore) { bestScore = score; best = m; }
		}
		return best || usable[Math.floor(Math.random() * usable.length)];
	}

	resolveTurn(myMove) {
		const a = this.active;
		const foeMove = this.chooseFoeMove();
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
		this.pushMsg('', () => {
			if (a.foe.curHP > 0 && a.me.curHP > 0) this.endOfTurn();
		});
		this.pushMsg('', () => this.checkFaints());
	}

	checkFaints() {
		const a = this.active;
		if (a.foe.curHP <= 0) {
			this.pushMsg(a.isTrainer ? `${a.foe.name} fainted!` : `The wild ${a.foe.name} fainted!`,
				() => cry(a.foe.speciesId));
			this.pushAnim('faint', 'foe', 0.7, () => { a.foeHidden = true; });
			this.grantExp();
		} else if (a.me.curHP <= 0) {
			this.pushMsg(`${a.me.name} fainted!`, () => { cry(a.me.speciesId); this.clearVolatiles(a.me); });
			this.pushAnim('faint', 'me', 0.7, () => { a.meHidden = true; });
			const next = a.party.find(m => m.curHP > 0);
			if (next) {
				this.pushMsg(`Go! ${next.name}!`, () => {
					sfx('ball_open'); cry(next.speciesId);
					a.me = next;
					a.meImg = a.backSprites.get(next);
					a.meBoosts = freshBoosts();
					a.meShownHP = next.curHP;
					a.meHidden = false;
				});
				this.pushAnim('enter', 'me', 0.4);
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
					// full moveset: the player picks what (if anything) to forget
					const name = this.data.moves[mid]?.name || mid;
					this.pushMsg(`${mon.name} wants to learn ${name}!`, () => {
						a.learn = { mid, name, mon };
						a.learnIdx = 0;
						a.phase = 'learn';
					});
				}
			}
		}
		// trainer battles continue to the next foe mon; wild battles are over
		this.pushMsg('', () => {
			const a2 = this.active;
			if (a2.isTrainer && a2.foeIdx + 1 < a2.foes.length) {
				a2.foeIdx++;
				const next = a2.foes[a2.foeIdx];
				this.pushMsg(`${a2.info.displayName} sent out ${next.name}!`, () => {
					cry(next.speciesId);
					a2.foe = next;
					a2.foeImg = a2.foeSprites.get(next);
					a2.foeBoosts = freshBoosts();
					a2.foeShownHP = next.curHP;
					a2.foeHidden = false;
				});
				this.pushAnim('enter', 'foe', 0.4);
			} else if (a2.isTrainer) {
				this.pushMsg(a2.info.defeatText);
				this.pushMsg(`You got $${a2.info.money} for winning!`, () => this.finish('victory'));
			} else {
				this.finish('victory');
			}
		});
	}

	// Gen3-style catch: HP factor + species rate x ball multiplier, 4 shakes
	throwBall(ballName = 'POKe BALL', ballMult = 1) {
		const a = this.active;
		this.pushMsg(`You threw a ${ballName}!`);
		this.pushAnim('ballthrow', 'foe', 0.55, () => { sfx('ball_open'); a.foeHidden = true; a.ballShown = true; });
		const rate = (this.data.extra?.[a.foe.speciesId]?.catch ?? 45) * ballMult;
		const statusBonus = a.foe.status === 'slp' || a.foe.status === 'frz' ? 2
			: a.foe.status ? 1.5 : 1;
		const f = Math.max(1, Math.floor((3 * a.foe.maxHP - 2 * a.foe.curHP) * rate * statusBonus / (3 * a.foe.maxHP)));
		const b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / f)));
		let shakes = 0;
		while (shakes < 4 && Math.floor(Math.random() * 65536) < b) shakes++;
		for (let i = 1; i <= Math.min(shakes, 3); i++) this.pushAnim('ballshake', 'foe', 0.7, () => sfx('ball_drop'));
		if (shakes >= 4) {
			this.pushAnim('ballcatch', 'foe', 0.5, () => sfx('ball_drop'));
			this.pushMsg(`Gotcha! ${a.foe.name} was caught!`, () => {
				a.caughtMon = a.foe;
				this.finish('caught');
			});
		} else {
			this.pushAnim('ballbreak', 'foe', 0.35, () => { sfx('ball_open'); a.foeHidden = false; a.ballShown = false; });
			this.pushMsg(`Oh no! The ${a.foe.name} broke free!`);
			this.pushMsg('', () => {
				this.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, this.chooseFoeMove(), true);
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
				this.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, this.chooseFoeMove(), true);
			});
			this.pushMsg('', () => this.checkFaints());
		}
	}

	finish(result) {
		const a = this.active;
		for (const m of a.party) this.clearVolatiles(m);
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
			// 2x2: FIGHT(0) BAG(1) / PKMN(2) RUN(3)
			if (k === 'ArrowLeft' || k === 'ArrowRight') a.menuIdx ^= 1;
			if (k === 'ArrowUp' || k === 'ArrowDown') a.menuIdx ^= 2;
			if (k === 'z' || k === 'Enter') {
				if (a.menuIdx === 0) {
					// out of PP everywhere: Struggle instead of a dead menu
					if (a.me.moves.every(m => m.pp <= 0)) {
						this.startQueue(() => {
							this.pushMsg(`${a.me.name} has no moves left!`);
							this.resolveTurn(STRUGGLE());
						});
					} else { a.phase = 'moves'; a.moveIdx = 0; }
				}
				else if (a.menuIdx === 1) { a.phase = 'bag'; a.bagIdx = 0; }
				else if (a.menuIdx === 2) {
					const options = a.party.filter(m => m !== a.me && m.curHP > 0);
					if (options.length) { a.phase = 'switch'; a.switchIdx = 0; }
				} else {
					if (a.isTrainer) this.startQueue(() => this.pushMsg("There's no running from a trainer battle!"));
					else this.startQueue(() => this.tryRun());
				}
			}
		} else if (a.phase === 'bag') {
			const items = this.bagItems();
			if (!items.length) { a.phase = 'menu'; return; }
			if (k === 'ArrowUp') a.bagIdx = (a.bagIdx + items.length - 1) % items.length;
			if (k === 'ArrowDown') a.bagIdx = (a.bagIdx + 1) % items.length;
			if (k === 'x') a.phase = 'menu';
			if (k === 'z' || k === 'Enter') this.useItem(items[a.bagIdx].id);
		} else if (a.phase === 'switch') {
			const options = a.party.filter(m => m !== a.me && m.curHP > 0);
			if (!options.length) { a.phase = 'menu'; return; }
			if (k === 'ArrowUp') a.switchIdx = (a.switchIdx + options.length - 1) % options.length;
			if (k === 'ArrowDown') a.switchIdx = (a.switchIdx + 1) % options.length;
			if (k === 'x') a.phase = 'menu';
			if (k === 'z' || k === 'Enter') this.switchTo(options[a.switchIdx]);
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
			} else if (a.phase === 'learn') {
			if (k === 'ArrowLeft' || k === 'ArrowUp') a.learnIdx = (a.learnIdx + 4) % 5;
			if (k === 'ArrowRight' || k === 'ArrowDown') a.learnIdx = (a.learnIdx + 1) % 5;
			if (k === 'z' || k === 'Enter') this.resolveLearn(a.learnIdx === 4 ? -1 : a.learnIdx);
		}
	}

	startQueue(fn) {
		const a = this.active;
		fn();
		a.phase = 'msg';
	}

	// choice: 0-3 = replace that move, -1 = give up on the new one
	resolveLearn(choice) {
		const a = this.active;
		const { mid, name, mon } = a.learn;
		if (choice >= 0) {
			const old = mon.moves[choice];
			mon.moves[choice] = makeMove(mid, this.data);
			a.queue.unshift({ text: `${mon.name} forgot ${old.name} and learned ${name}!` });
		} else {
			a.queue.unshift({ text: `${mon.name} gave up on learning ${name}.` });
		}
		a.learn = null;
		a.phase = 'msg';
		a.msgT = 99;
	}

	// usable battle items (balls only in wild battles)
	bagItems() {
		const a = this.active;
		return Object.entries(Bag.getBag())
			.filter(([id, n]) => n > 0 && Bag.ITEMS[id])
			.filter(([id]) => !(a.isTrainer && Bag.ITEMS[id].kind === 'ball'))
			.map(([id, n]) => ({ id, n, ...Bag.ITEMS[id] }));
	}

	// the foe gets its move after an item/switch (it costs the turn)
	foeFreeMove() {
		const a = this.active;
		this.pushMsg('', () => {
			if (a.foe.curHP <= 0 || a.me.curHP <= 0) return;
			this.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, this.chooseFoeMove(), true);
		});
		this.pushMsg('', () => {
			const a2 = this.active;
			if (a2.foe.curHP > 0 && a2.me.curHP > 0) this.endOfTurn();
		});
		this.pushMsg('', () => this.checkFaints());
	}

	useItem(itemId) {
		const a = this.active;
		const item = Bag.ITEMS[itemId];
		if (!item) return;
		if (item.kind === 'ball') {
			Bag.consume(itemId);
			this.startQueue(() => this.throwBall(item.name, item.mult || 1));
			return;
		}
		if (item.kind === 'ether') {
			if (a.me.moves.every(m => m.pp >= m.maxPp)) return; // nothing to restore
			Bag.consume(itemId);
			this.startQueue(() => {
				this.pushMsg(`You used an ${item.name}!`, () => {
					for (const m of a.me.moves) m.pp = Math.min(m.maxPp, m.pp + item.amount);
				});
				this.pushMsg(`${a.me.name}'s moves regained PP.`);
				this.foeFreeMove();
			});
			return;
		}
		if (item.kind === 'heal') {
			if (a.me.curHP >= a.me.maxHP) return; // nothing to heal, stay in bag
			Bag.consume(itemId);
			this.startQueue(() => {
				this.pushMsg(`You used a ${item.name}!`, () => {
					a.me.curHP = Math.min(a.me.maxHP, a.me.curHP + item.amount);
				});
				this.pushMsg(`${a.me.name}'s HP was restored.`);
				this.foeFreeMove();
			});
			return;
		}
		if (item.kind === 'revive') {
			const fainted = a.party.find(m => m.curHP <= 0);
			if (!fainted) return;
			Bag.consume(itemId);
			this.startQueue(() => {
				this.pushMsg(`You used a REVIVE!`, () => {
					fainted.curHP = Math.floor(fainted.maxHP / 2);
					fainted.status = null;
				});
				this.pushMsg(`${fainted.name} came back to its senses!`);
				this.foeFreeMove();
			});
		}
	}

	switchTo(mon) {
		const a = this.active;
		this.startQueue(() => {
			this.pushMsg(`Come back, ${a.me.name}!`, () => this.clearVolatiles(a.me));
			this.pushAnim('recall', 'me', 0.3, () => { a.meHidden = true; });
			this.pushMsg(`Go! ${mon.name}!`, () => {
				sfx('ball_open'); cry(mon.speciesId);
				a.me = mon;
				a.meImg = a.backSprites.get(mon);
				a.meBoosts = freshBoosts();
				a.meShownHP = mon.curHP;
				a.meHidden = false;
			});
			this.pushAnim('enter', 'me', 0.4);
			this.foeFreeMove();
		});
	}

	// ---------- update/draw ----------
	update(dt) {
		const a = this.active;
		if (!a) return;
		a.t += dt;
		a.introT = (a.introT || 0);
		if (a.phase !== 'flash') a.introT += dt;
		if (a.shakeT > 0) a.shakeT -= dt;
		// HP bar easing
		a.foeShownHP += (a.foe.curHP - a.foeShownHP) * Math.min(1, dt * 6);
		a.meShownHP += (a.me.curHP - a.meShownHP) * Math.min(1, dt * 6);
		if (Math.abs(a.foeShownHP - a.foe.curHP) < 0.5) a.foeShownHP = a.foe.curHP;
		if (Math.abs(a.meShownHP - a.me.curHP) < 0.5) a.meShownHP = a.me.curHP;

		if (a.phase === 'flash') {
			if (a.t > 0.6) { a.phase = 'msg'; }
			return;
		}
		// combat text + type-colored hit particles (positions resolve at draw)
		for (const f of a.floaters || []) f.t += dt;
		a.floaters = (a.floaters || []).filter(f => f.t < 1.1);
		for (const p of a.particles || []) {
			p.t += dt;
			p.dx += p.vx * dt; p.dy += p.vy * dt;
			p.vy += 260 * dt; // gravity, in u-units/s²
		}
		a.particles = (a.particles || []).filter(p => p.t < 0.6);

		// a playing sprite animation pauses the message queue
		if (a.fx) {
			a.fx.t += dt;
			if (a.fx.kind === 'hit' && a.fx.t < 0.15) a.shakeT = 0.15;
			if (a.fx.t >= a.fx.dur) {
				a.fx.done?.();
				a.fx = null;
			}
			return;
		}
		if (a.phase === 'msg') {
			// waiting for HP bars before advancing
			const settled = a.foeShownHP === a.foe.curHP && a.meShownHP === a.me.curHP;
			a.msgT += dt;
			if ((a.msgT > 1.1 || a.msgT >= 99) && settled) {
				const next = a.queue.shift();
				if (next) {
					if (next.anim) {
						a.fx = { ...next.anim, t: 0 };
						// a hit bursts type-colored sparks off the target
						if (a.fx.kind === 'hit' && a.fx.color) {
							a.particles ||= [];
							for (let i = 0; i < 16; i++) {
								const ang = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 160;
								a.particles.push({
									side: a.fx.side, color: a.fx.color, t: 0,
									dx: 0, dy: -60 - Math.random() * 40,
									vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60,
									r: 2.5 + Math.random() * 2.5,
								});
							}
						}
						a.msgT = 1.2;
						return;
					}
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

	// medium-fast exp progress within the current level
	expFrac(mon) {
		const cur = mon.level ** 3, next = (mon.level + 1) ** 3;
		return Math.max(0, Math.min(1, ((mon.exp ?? cur) - cur) / (next - cur)));
	}

	// ---------- full-resolution scene (Love2D-style presentation) ----------
	// sprite base positions + fx offsets; side: 'me' | 'foe'
	spritePose(a, side, W, H, u) {
		const bar = 124 * u;
		const base = side === 'foe'
			? { x: W * 0.70, y: H * 0.42, scale: 3.4 * u }
			: { x: W * 0.235, y: H - bar - 16 * u, scale: 4.2 * u };
		let dx = 0, dy = 0, alpha = 1, blink = false, wob = 0;
		// entry slide on battle start
		const k = Math.min(1, (a.introT || 0) / 0.6);
		dx += (side === 'foe' ? 1 : -1) * (1 - k) * W * 0.4;
		// idle bob
		dy += Math.sin(a.t * 2.1 + (side === 'foe' ? 1.7 : 0)) * 2.5 * u;
		const fx = a.fx;
		if (fx && fx.side === side) {
			const p = Math.min(1, fx.t / fx.dur);
			if (fx.kind === 'lunge') dx += Math.sin(Math.PI * p) * (side === 'foe' ? -1 : 1) * 34 * u;
			if (fx.kind === 'hit') blink = Math.floor(fx.t / 0.07) % 2 === 0;
			if (fx.kind === 'faint') { dy += p * 90 * u; alpha = 1 - p; }
			if (fx.kind === 'recall') { alpha = 1 - p; dy += p * 20 * u; }
			if (fx.kind === 'enter') { dx += (side === 'foe' ? 1 : -1) * (1 - p) * W * 0.3; alpha = p; }
			if (fx.kind === 'ballshake') wob = Math.sin(fx.t * Math.PI * 4) * 0.35;
		}
		return { ...base, dx, dy, alpha, blink, wob };
	}

	drawSide(ctx, a, side, W, H, u) {
		const mon = side === 'foe' ? a.foe : a.me;
		const img = side === 'foe' ? a.foeImg : a.meImg;
		const hidden = side === 'foe' ? a.foeHidden : a.meHidden;
		const pose = this.spritePose(a, side, W, H, u);
		// platform with a type glow (Love2D drawPokemonSprite)
		const tc = UI.TYPE_COLORS[mon.types[0]] || '#888';
		ctx.save();
		ctx.globalAlpha = 0.28;
		ctx.fillStyle = tc;
		ctx.beginPath(); ctx.ellipse(pose.x, pose.y, 118 * u, 30 * u, 0, 0, Math.PI * 2); ctx.fill();
		ctx.globalAlpha = 0.5;
		ctx.fillStyle = 'rgba(40,70,50,0.8)';
		ctx.beginPath(); ctx.ellipse(pose.x, pose.y, 104 * u, 24 * u, 0, 0, Math.PI * 2); ctx.fill();
		ctx.restore();
		// the ball, mid-catch
		const fx = a.fx;
		if (side === 'foe' && fx?.side === 'foe' && fx.kind === 'ballthrow') {
			const p = Math.min(1, fx.t / fx.dur);
			const sx = W * 0.3, sy = H * 0.65, ex = pose.x, ey = pose.y - 20 * u;
			const bx = sx + (ex - sx) * p, by = sy + (ey - sy) * p - Math.sin(Math.PI * p) * 120 * u;
			UI.drawBall(ctx, bx, by, 13 * u, p * 6);
		} else if (side === 'foe' && a.ballShown) {
			UI.drawBall(ctx, pose.x, pose.y - 12 * u, 13 * u, pose.wob);
			if (fx?.kind === 'ballcatch' && fx.side === 'foe') {
				const p = Math.min(1, fx.t / fx.dur);
				ctx.strokeStyle = `rgba(255,220,120,${1 - p})`;
				ctx.lineWidth = 3 * u;
				for (let i = 0; i < 5; i++) {
					const ang = i / 5 * Math.PI * 2 + p * 2;
					const r = (18 + p * 26) * u;
					ctx.beginPath();
					ctx.arc(pose.x + Math.cos(ang) * r, pose.y - 12 * u + Math.sin(ang) * r, 2.4 * u, 0, Math.PI * 2);
					ctx.stroke();
				}
			}
			if (fx?.kind === 'ballbreak' && fx.side === 'foe') {
				const p = Math.min(1, fx.t / fx.dur);
				ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - p)})`;
				ctx.beginPath(); ctx.arc(pose.x, pose.y - 12 * u, (10 + p * 60) * u, 0, Math.PI * 2); ctx.fill();
			}
		}
		if (!img || hidden || pose.blink) return;
		ctx.save();
		ctx.globalAlpha = pose.alpha;
		ctx.imageSmoothingEnabled = false;
		const w = img.width * pose.scale, h = img.height * pose.scale;
		ctx.drawImage(img, pose.x + pose.dx - w / 2, pose.y + pose.dy - h + 10 * u, w, h);
		ctx.restore();
	}

	draw(ctx, W, H) {
		const a = this.active;
		if (!a) return;
		const u = H / 480;
		this.ui = [];
		if (a.phase === 'flash') {
			const k = Math.floor(a.t / 0.1);
			ctx.fillStyle = k % 2 === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(10,8,18,0.9)';
			ctx.fillRect(0, 0, W, H);
			return;
		}
		ctx.save();
		if (a.shakeT > 0) ctx.translate((Math.random() - 0.5) * 8 * u, (Math.random() - 0.5) * 8 * u);
		// backdrop
		const g = ctx.createLinearGradient(0, 0, 0, H);
		g.addColorStop(0, '#7db8e0');
		g.addColorStop(0.55, '#b8d8b8');
		g.addColorStop(1, '#5f8f5f');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, W, H);

		this.drawSide(ctx, a, 'foe', W, H, u);
		this.drawSide(ctx, a, 'me', W, H, u);

		// hit sparks + floating combat text ride each combatant's pose
		for (const p of a.particles || []) {
			const pose = this.spritePose(a, p.side, W, H, u);
			ctx.globalAlpha = Math.max(0, 1 - p.t / 0.6);
			ctx.fillStyle = p.color;
			ctx.beginPath();
			ctx.arc(pose.x + p.dx * u, pose.y + p.dy * u, p.r * u, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
		for (const f of a.floaters || []) {
			const pose = this.spritePose(a, f.side, W, H, u);
			const y = pose.y - 130 * u - f.t * 50 * u;
			ctx.globalAlpha = Math.max(0, 1 - f.t);
			ctx.font = `${Math.round(26 * u)}px m6x11plus, monospace`;
			ctx.textAlign = 'center';
			ctx.lineWidth = 4 * u;
			ctx.strokeStyle = '#14100f';
			ctx.strokeText(f.text, pose.x, y);
			ctx.fillStyle = f.color || '#fff';
			ctx.fillText(f.text, pose.x, y);
			ctx.textAlign = 'left';
		}
		ctx.globalAlpha = 1;

		// info panels
		UI.monPanel(ctx, a.foe, 14 * u, 14 * u, 272 * u, u,
			{ shownHP: a.foeShownHP, boosts: a.foeBoosts });
		if (a.isTrainer) UI.teamDots(ctx, a.foes, a.foe, 30 * u, 106 * u, u);
		const meY = H - 124 * u - 112 * u;
		UI.monPanel(ctx, a.me, W - 14 * u - 300 * u, meY, 300 * u, u,
			{ shownHP: a.meShownHP, boosts: a.meBoosts, showXP: true, showNumbers: true, expFrac: this.expFrac(a.me) });
		// party dots sit in a row just above the panel's right edge
		UI.teamDots(ctx, a.party, a.me,
			W - 14 * u - 10 * u - (a.party.length - 1) * 18 * u - 6 * u, meY - 12 * u, u);

		// bottom bar
		const barY = H - 118 * u;
		UI.panel(ctx, 8 * u, barY, W - 16 * u, 110 * u, 10 * u);
		const hov = a.hover;
		const btn = (b, id) => { b.id = id; this.ui.push(b); UI.button(ctx, b, hov === id || b.kbSel, u); };

		if (a.phase === 'menu') {
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(17 * u)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, W - 300 * u).slice(0, 3).forEach((l, i) =>
				ctx.fillText(l, 24 * u, barY + 32 * u + i * 22 * u));
			const labels = ['FIGHT', 'BAG', 'PKMN', 'RUN'];
			labels.forEach((lab, i) => {
				const bw = 120 * u, bh = 44 * u;
				const x = W - 24 * u - (2 - i % 2) * (bw + 8 * u) + 8 * u;
				const y = barY + 10 * u + Math.floor(i / 2) * (bh + 8 * u);
				btn({ x, y, w: bw, h: bh, label: lab, big: true, center: true, kbSel: a.menuIdx === i }, 'menu:' + i);
			});
		} else if (a.phase === 'moves') {
			const backW = 86 * u;
			const bw = (W - 16 * u - backW - 40 * u) / 2, bh = 44 * u;
			a.me.moves.forEach((mv, i) => {
				const info = this.data.moves[mv.id] || {};
				const x = 20 * u + (i % 2) * (bw + 8 * u);
				const y = barY + 9 * u + Math.floor(i / 2) * (bh + 8 * u);
				btn({
					x, y, w: bw, h: bh, label: mv.name.toUpperCase().slice(0, 16),
					sub: `PP ${mv.pp}/${mv.maxPp}`, subColor: mv.pp === 0 ? UI.C.hpRed : UI.C.dim,
					right: info.power ? `Pwr ${info.power}` : (info.category || ''),
					type: info.type, disabled: mv.pp <= 0, kbSel: a.moveIdx === i,
				}, 'move:' + i);
			});
			btn({ x: W - 8 * u - backW - 8 * u, y: barY + 9 * u, w: backW, h: 96 * u, label: 'BACK', center: true }, 'back');
		} else if (a.phase === 'bag' || a.phase === 'switch') {
			const isBag = a.phase === 'bag';
			const rows = isBag ? this.bagItems()
				: a.party.filter(m => m !== a.me && m.curHP > 0);
			const idx = isBag ? a.bagIdx : a.switchIdx;
			const start = Math.max(0, Math.min(idx - 1, rows.length - 3));
			rows.slice(start, start + 3).forEach((r, i) => {
				const ri = start + i;
				const label = isBag ? `${r.name}  x${r.n}` : `${r.name}  Lv${r.level}`;
				btn({
					x: 20 * u, y: barY + 9 * u + i * 32 * u, w: W * 0.58, h: 28 * u, label,
					right: isBag ? '' : `${r.curHP}/${r.maxHP} HP`, kbSel: ri === idx,
				}, (isBag ? 'bag:' : 'switch:') + ri);
			});
			if (!rows.length) {
				ctx.fillStyle = UI.C.dim;
				ctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
				ctx.fillText(isBag ? 'The bag is empty.' : 'No one else can fight!', 24 * u, barY + 34 * u);
			}
			if (rows.length > 3) {
				btn({ x: W * 0.58 + 32 * u, y: barY + 9 * u, w: 40 * u, h: 44 * u, label: '▲', center: true }, 'scroll:-1');
				btn({ x: W * 0.58 + 32 * u, y: barY + 61 * u, w: 40 * u, h: 44 * u, label: '▼', center: true }, 'scroll:1');
			}
			btn({ x: W - 8 * u - 94 * u, y: barY + 9 * u, w: 86 * u, h: 96 * u, label: 'BACK', center: true }, 'back');
		} else if (a.phase === 'learn') {
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
			ctx.fillText(`Which move should be forgotten for ${a.learn.name}?`, 20 * u, barY + 20 * u);
			const backW = 96 * u;
			const bw = (W - 16 * u - backW - 44 * u) / 2, bh = 37 * u;
			a.learn.mon.moves.forEach((mv, i) => {
				const info = this.data.moves[mv.id] || {};
				btn({
					x: 20 * u + (i % 2) * (bw + 8 * u),
					y: barY + 28 * u + Math.floor(i / 2) * (bh + 7 * u),
					w: bw, h: bh, label: mv.name.toUpperCase().slice(0, 16),
					type: info.type, kbSel: a.learnIdx === i,
				}, 'learn:' + i);
			});
			btn({ x: W - 8 * u - backW - 8 * u, y: barY + 28 * u, w: backW, h: 2 * bh + 7 * u,
				label: 'GIVE UP', center: true, kbSel: a.learnIdx === 4 }, 'learn:skip');
		} else {
			// message phase (and 'done' fadeout)
			ctx.fillStyle = UI.C.text;
			ctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
			UI.wrap(ctx, a.msg, W - 70 * u).slice(0, 3).forEach((l, i) =>
				ctx.fillText(l, 24 * u, barY + 34 * u + i * 24 * u));
			if (a.phase === 'msg' && Math.floor(a.t * 2) % 2 === 0) {
				ctx.fillStyle = UI.C.accent;
				ctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
				ctx.fillText('▼', W - 34 * u, barY + 96 * u);
			}
			this.ui.push({ id: 'advance', x: 0, y: 0, w: W, h: H });
		}
		if (a.phase === 'done') {
			ctx.fillStyle = `rgba(8,6,14,${Math.min(0.85, (a.doneT || 0) * 1.4)})`;
			ctx.fillRect(0, 0, W, H);
		}
		ctx.restore();
	}

	// ---------- pointer input (tap/click + hover) ----------
	hover(x, y) {
		const a = this.active;
		if (!a) return;
		a.hover = null;
		for (const b of this.ui || []) {
			if (b.id !== 'advance' && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) a.hover = b.id;
		}
	}

	tap(x, y) {
		const a = this.active;
		if (!a) return;
		let hit = null;
		for (const b of this.ui || []) {
			if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) hit = b;
		}
		if (!hit) return;
		const [kind, arg] = hit.id.split(':');
		if (kind === 'advance') { if (a.phase === 'msg') a.msgT = 99; return; }
		if (kind === 'back') { this.key('x'); return; }
		if (kind === 'menu') { a.menuIdx = +arg; this.key('z'); return; }
		if (kind === 'move') { a.moveIdx = +arg; this.key('z'); return; }
		if (kind === 'bag') { a.bagIdx = +arg; this.key('z'); return; }
		if (kind === 'switch') { a.switchIdx = +arg; this.key('z'); return; }
		if (kind === 'learn') { this.resolveLearn(arg === 'skip' ? -1 : +arg); return; }
		if (kind === 'scroll') this.key(+arg > 0 ? 'ArrowDown' : 'ArrowUp');
	}
}
