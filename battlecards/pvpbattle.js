// pvpbattle.js — a compact, self-contained, deterministic-per-call Pokemon
// battle engine for live PvP. It is PURE DATA (no images/DOM), so the Netlify
// function bundles it and resolves turns server-authoritatively while both
// clients just submit actions and render the published state.
//
// A "mon" snapshot carries everything a turn needs:
//   { speciesId, name, level, types:[..], sprite,
//     stats:{hp,atk,def,spa,spd,spe}, maxHP, curHP, status, boosts:{...},
//     moves:[{ id, name, pp, maxPp, type, power, category, acc, priority }] }

const CHART = {
	Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
	Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
	Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
	Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
	Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
	Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
	Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
	Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
	Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
	Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
	Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
	Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
	Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
	Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
	Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
	Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
	Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
	Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};
function effectiveness(type, defTypes) {
	let m = 1;
	for (const t of defTypes) m *= CHART[type]?.[t] ?? 1;
	return m;
}
const stageMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
const freshBoosts = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });

// compact status-move / secondary table (by move id)
const FX = {
	thunderwave: { status: 'par' }, stunspore: { status: 'par' }, glare: { status: 'par' },
	sleeppowder: { status: 'slp' }, spore: { status: 'slp' }, hypnosis: { status: 'slp' }, sing: { status: 'slp' },
	poisonpowder: { status: 'psn' }, toxic: { status: 'psn' }, willowisp: { status: 'brn' },
	growl: { boost: { atk: -1 }, foe: true }, leer: { boost: { def: -1 }, foe: true },
	tailwhip: { boost: { def: -1 }, foe: true }, stringshot: { boost: { spe: -1 }, foe: true },
	screech: { boost: { def: -2 }, foe: true }, sandattack: { boost: { acc: -1 }, foe: true },
	swordsdance: { boost: { atk: 2 } }, dragondance: { boost: { atk: 1, spe: 1 } },
	nastyplot: { boost: { spa: 2 } }, calmmind: { boost: { spa: 1, spd: 1 } },
	agility: { boost: { spe: 2 } }, irondefense: { boost: { def: 2 } }, amnesia: { boost: { spd: 2 } },
	recover: { heal: 0.5 }, roost: { heal: 0.5 }, softboiled: { heal: 0.5 }, synthesis: { heal: 0.5 },
	ember: { sec: { status: 'brn', ch: 10 } }, flamethrower: { sec: { status: 'brn', ch: 10 } },
	thunderbolt: { sec: { status: 'par', ch: 10 } }, thunder: { sec: { status: 'par', ch: 30 } },
	icebeam: { sec: { status: 'frz', ch: 10 } }, bodyslam: { sec: { status: 'par', ch: 30 } },
	sludgebomb: { sec: { status: 'psn', ch: 30 } }, firepunch: { sec: { status: 'brn', ch: 10 } },
};
const STATUS_MSG = { brn: 'was burned!', psn: 'was poisoned!', par: 'is paralyzed!', slp: 'fell asleep!', frz: 'was frozen solid!' };
const STATUS_IMMUNE = { brn: ['Fire'], frz: ['Ice'], psn: ['Poison', 'Steel'], par: [], slp: [] };

// ---------- match lifecycle ----------
export function createMatch(id, hostName, hostParty, guestName, guestParty) {
	const side = (name, party) => ({
		name,
		party: party.map(m => ({ ...m, boosts: freshBoosts(), status: m.status || null })),
		active: 0,
	});
	return {
		id, type: 'pokemon',
		sides: [side(hostName, hostParty), side(guestName, guestParty)],
		turn: 1, seq: 1,
		actions: [null, null],   // this turn's submitted action per side
		events: [`${hostName} and ${guestName} face off!`],
		over: false, winner: null,
		lastActive: 0,
	};
}

const activeMon = (state, s) => state.sides[s].party[state.sides[s].active];
const statOf = (mon, key) => {
	let v = Math.floor(mon.stats[key] * stageMult(mon.boosts[key] || 0));
	if (key === 'atk' && mon.status === 'brn') v = Math.floor(v / 2);
	if (key === 'spe' && mon.status === 'par') v = Math.floor(v / 4);
	return Math.max(1, v);
};

// submit one side's action; resolve the turn once both are in
export function submitAction(state, s, action) {
	if (state.over) return state;
	if (state.actions[s]) return state; // already chose
	state.actions[s] = action;
	if (state.actions[0] && state.actions[1]) resolveTurn(state);
	return state;
}

function faintCheck(state, ev) {
	for (let s = 0; s < 2; s++) {
		const mon = activeMon(state, s);
		if (mon.curHP <= 0 && !mon._fainted) {
			mon._fainted = true;
			ev.push(`${mon.name} fainted!`);
		}
	}
	// a side with no living mon loses
	for (let s = 0; s < 2; s++) {
		if (state.sides[s].party.every(m => m.curHP <= 0)) {
			state.over = true;
			state.winner = 1 - s;
			ev.push(`${state.sides[1 - s].name} wins!`);
		}
	}
}

function doMove(state, atkS, ev) {
	const defS = 1 - atkS;
	const user = activeMon(state, atkS);
	const target = activeMon(state, defS);
	const action = state.actions[atkS];
	if (user.curHP <= 0 || target.curHP <= 0 || state.over) return;
	const move = user.moves[action.moveIdx];
	if (!move) return;
	// status gates
	if (user.status === 'frz') { if (Math.random() < 0.8) { ev.push(`${user.name} is frozen solid!`); return; } user.status = null; ev.push(`${user.name} thawed out!`); }
	if (user.status === 'slp') { if (Math.random() < 0.66) { ev.push(`${user.name} is fast asleep.`); return; } user.status = null; ev.push(`${user.name} woke up!`); }
	if (user.status === 'par' && Math.random() < 0.25) { ev.push(`${user.name} is paralyzed! It can't move!`); return; }
	if (move.pp > 0) move.pp--;
	ev.push(`${user.name} used ${move.name}!`);
	const fx = FX[move.id] || {};
	// accuracy
	if ((move.acc ?? 100) !== true && Math.random() * 100 > (move.acc ?? 100) * stageMult((user.boosts.acc || 0) - (target.boosts.eva || 0))) {
		ev.push(`${user.name}'s attack missed!`);
		return;
	}
	if (move.category === 'Status' || !move.power) {
		if (fx.heal) {
			const amt = Math.floor(user.maxHP * fx.heal);
			user.curHP = Math.min(user.maxHP, user.curHP + amt);
			ev.push(`${user.name} regained health!`);
		} else if (fx.status) {
			applyStatus(target, fx.status, ev);
		} else if (fx.boost) {
			const who = fx.foe ? target : user;
			for (const [st, d] of Object.entries(fx.boost)) who.boosts[st] = Math.max(-6, Math.min(6, (who.boosts[st] || 0) + d));
			ev.push(`${who.name}'s stats ${Object.values(fx.boost)[0] > 0 ? 'rose' : 'fell'}!`);
		} else {
			ev.push('But nothing happened!');
		}
		return;
	}
	// damage
	const phys = move.category === 'Physical';
	const A = statOf(user, phys ? 'atk' : 'spa');
	const D = statOf(target, phys ? 'def' : 'spd');
	const eff = effectiveness(move.type, target.types);
	if (eff === 0) { ev.push(`It doesn't affect ${target.name}...`); return; }
	const stab = user.types.includes(move.type) ? 1.5 : 1;
	const crit = Math.random() < 1 / 16;
	let dmg = Math.floor(Math.floor(Math.floor(2 * user.level / 5 + 2) * move.power * A / D) / 50) + 2;
	dmg = Math.max(1, Math.floor(dmg * (crit ? 2 : 1) * stab * eff * (0.85 + Math.random() * 0.15)));
	dmg = Math.min(dmg, target.curHP);
	target.curHP -= dmg;
	ev.push({ hit: true, side: defS, dmg, name: target.name });
	if (crit) ev.push('A critical hit!');
	if (eff > 1) ev.push("It's super effective!");
	if (eff < 1) ev.push("It's not very effective...");
	if (fx.sec && target.curHP > 0 && Math.random() * 100 < fx.sec.ch) applyStatus(target, fx.sec.status, ev);
}

function applyStatus(mon, st, ev) {
	if (mon.status) { ev.push('But it failed!'); return; }
	if ((STATUS_IMMUNE[st] || []).some(t => mon.types.includes(t))) { ev.push(`It doesn't affect ${mon.name}...`); return; }
	mon.status = st;
	if (st === 'slp') mon._sleep = 1 + Math.floor(Math.random() * 3);
	ev.push(`${mon.name} ${STATUS_MSG[st]}`);
}

function resolveTurn(state) {
	const ev = [];
	// switches resolve first, then moves in speed/priority order
	for (let s = 0; s < 2; s++) {
		const a = state.actions[s];
		if (a?.kind === 'switch') {
			const to = state.sides[s].party[a.partyIdx];
			if (to && to.curHP > 0 && a.partyIdx !== state.sides[s].active) {
				activeMon(state, s).boosts = freshBoosts();
				state.sides[s].active = a.partyIdx;
				ev.push(`${state.sides[s].name} sent out ${to.name}!`);
			}
		}
	}
	// determine move order
	const movers = [0, 1].filter(s => state.actions[s]?.kind === 'move');
	movers.sort((x, y) => {
		const mx = activeMon(state, x).moves[state.actions[x].moveIdx] || {};
		const my = activeMon(state, y).moves[state.actions[y].moveIdx] || {};
		const px = mx.priority || 0, py = my.priority || 0;
		if (px !== py) return py - px;
		const sx = statOf(activeMon(state, x), 'spe'), sy = statOf(activeMon(state, y), 'spe');
		return sx === sy ? (Math.random() < 0.5 ? -1 : 1) : sy - sx;
	});
	for (const s of movers) { doMove(state, s, ev); faintCheck(state, ev); if (state.over) break; }
	// end-of-turn: burn/poison chip
	if (!state.over) {
		for (let s = 0; s < 2; s++) {
			const mon = activeMon(state, s);
			if (mon.curHP > 0 && (mon.status === 'brn' || mon.status === 'psn')) {
				const chip = Math.max(1, Math.floor(mon.maxHP / 8));
				mon.curHP = Math.max(0, mon.curHP - chip);
				ev.push({ hit: true, side: s, dmg: chip, name: mon.name });
				ev.push(`${mon.name} is hurt by its ${mon.status === 'brn' ? 'burn' : 'poison'}!`);
			}
		}
		faintCheck(state, ev);
	}
	state.actions = [null, null];
	state.turn++;
	state.seq++;
	state.events = ev;
	// a fainted active with living bench must be replaced before the next turn
	for (let s = 0; s < 2; s++) {
		const mon = activeMon(state, s);
		if (mon.curHP <= 0 && !state.over) state.needsSwitch = state.needsSwitch || {};
		if (mon.curHP <= 0 && !state.over) state.needsSwitch[s] = true;
	}
	if (state.needsSwitch) for (const k of Object.keys(state.needsSwitch)) if (activeMon(state, +k).curHP > 0) delete state.needsSwitch[k];
}

// force-replace a fainted active (its own "action" outside the normal flow)
export function replaceFainted(state, s, partyIdx) {
	if (state.over) return state;
	const to = state.sides[s].party[partyIdx];
	if (!to || to.curHP <= 0) return state;
	state.sides[s].active = partyIdx;
	to.boosts = freshBoosts();
	if (state.needsSwitch) delete state.needsSwitch[s];
	if (state.needsSwitch && !Object.keys(state.needsSwitch).length) state.needsSwitch = null;
	state.events = [`${state.sides[s].name} sent out ${to.name}!`];
	state.seq++;
	return state;
}

// which side index a username is on (or -1 for spectators)
export function sideOf(state, name) {
	return state.sides.findIndex(sd => sd.name === name);
}
