// mm/traps.js — Mystery Maze's traps (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md; the original's list and rules,
// Plans/PMD_SYSTEMS_SPEC.md 5.4 - 5.6). 19 of the original's 20 (Trip waits until items can be dropped).
//   - hidden until stepped on or shown: the leader's plain Attack shows a trap on the tile in front; a Wonder Tile is
//     never hidden
//   - the LEADER springs any trap it steps on (a hidden one has a 15% chance of doing nothing); a PARTNER only one that is
//     already showing; WILD Pokémon never
//   - damage is a share of max HP (the original's are fixed numbers on a smaller scale)
// A trap is { x, y, kind, seen }. T is the run's toolkit (mm/turn.js). Pure: node-tested (poketactica_mm_items_test.mjs).
import { DIR8, canStep8, cheb, sightTiles } from './shapes8.js';
import { ITEMS, SLOW_TURNS } from './items.js';

export const MISFIRE = 15;   // % that a hidden trap does nothing
export const TRAPS = Object.freeze({
	mud: { name: 'Mud Trap', note: 'Lowers one of Attack, Sp. Atk, Defense or Sp. Def.' },
	sticky: { name: 'Sticky Trap', note: 'Makes one item in the bag sticky.' },
	grimy: { name: 'Grimy Trap', note: 'May spoil the food in the bag.' },
	summon: { name: 'Summon Trap', note: 'Calls 2 to 4 wild Pokémon. Works once.', once: true },
	pitfall: { name: 'Pitfall Trap', note: 'Drops the party to the next floor.' },
	warp: { name: 'Warp Trap', note: 'Sends you somewhere else on the floor.' },
	gust: { name: 'Gust Trap', note: 'Blows you away.' },
	spin: { name: 'Spin Trap', note: 'Confuses.' },
	slumber: { name: 'Slumber Trap', note: 'Puts you to sleep.' },
	slow: { name: 'Slow Trap', note: 'Half your turns, for a while.' },
	seal: { name: 'Seal Trap', note: 'Seals one move until the next floor.' },
	poison: { name: 'Poison Trap', note: 'Poisons.' },
	selfdestruct: { name: 'Selfdestruct Trap', note: 'A blast: everyone next to it loses half their HP. Works once.', once: true },
	explosion: { name: 'Explosion Trap', note: 'A big blast: everyone within 2 tiles loses half their HP. Works once.', once: true },
	ppzero: { name: 'PP-Zero Trap', note: 'Empties one move\'s PP.' },
	chestnut: { name: 'Chestnut Trap', note: 'Chestnuts fall: a little damage.' },
	spike: { name: 'Spike Trap', note: 'Spikes: some damage.' },
	wonder: { name: 'Wonder Tile', note: 'Puts every stat change back to normal.', shown: true },
	pokemon: { name: 'Pokémon Trap', note: 'The items nearby turn into wild Pokémon. Works once.', once: true },
});
export const TRAP_DMG = Object.freeze({ chestnut: 0.06, spike: 0.12, gust: 0.03, pitfall: 0.03 });

/** A trap kind from a floor's list ([{ id, w }]). */
export function rollTrap(list, T) {
	const total = list.reduce((a, e) => a + (e.w || 1), 0);
	let r = T.roll(total), pick = list[0];
	for (const e of list) { r -= e.w || 1; if (r < 0) { pick = e; break; } }
	return pick.id;
}

/**
 * A party member has stepped onto a trap. -> did it go off. (The caller checked who it is: the leader always, a partner
 * only when the trap was showing.)
 */
export function springTrap(S, u, trap, T) {
	const hidden = !trap.seen, def = TRAPS[trap.kind], F = S.F;
	trap.seen = true;
	if (hidden && !def.shown && T.roll(100) < MISFIRE) { T.ev({ t: 'trap', kind: trap.kind, x: trap.x, y: trap.y, uid: u.uid, dud: true }); return false; }
	T.ev({ t: 'trap', kind: trap.kind, x: trap.x, y: trap.y, uid: u.uid });
	const gone = () => { const i = S.traps.indexOf(trap); if (i >= 0) S.traps.splice(i, 1); };
	const near = (r) => S.units.filter((o) => o.hp > 0 && cheb(o.x, o.y, trap.x, trap.y) <= r);
	switch (trap.kind) {
		case 'mud': T.boost(u, { [['atk', 'spa', 'def', 'spd'][T.roll(4)]]: -1 }); break;
		case 'sticky': {
			const clean = S.bag.filter((it) => !it.sticky);
			if (clean.length) { const it = clean[T.roll(clean.length)]; it.sticky = true; T.ev({ t: 'sticky', id: it.id }); }
			break;
		}
		case 'grimy':
			for (const it of S.bag) if (ITEMS[it.id] && ITEMS[it.id].group === 'food' && it.id !== 'grimyfood' && T.roll(100) < 30) { T.ev({ t: 'grimy', id: it.id }); it.id = 'grimyfood'; }
			break;
		case 'summon': {
			let n = T.roll(3) + 2;
			for (let d = 0; d < 8 && n > 0; d++) {
				const x = u.x + DIR8[d][0], y = u.y + DIR8[d][1];
				if (!canStep8(F, u.x, u.y, d) || (F.terrain[y * F.w + x] & 3) !== 1 || T.unitAt(x, y)) continue;
				if (T.spawn(x, y)) n--;
			}
			gone();
			break;
		}
		case 'pitfall': T.hurt(u, Math.max(1, Math.floor(u.maxHP * TRAP_DMG.pitfall)), 'pitfall'); if (u.hp > 0) T.fall(); break;
		case 'warp': T.warp(u); break;
		case 'gust': {
			const d = T.roll(8);
			let x = u.x, y = u.y;
			for (let i = 0; i < 10; i++) {
				const nx = x + DIR8[d][0], ny = y + DIR8[d][1];
				if (!canStep8(F, x, y, d) || !T.canEnter(u, nx, ny) || T.unitAt(nx, ny)) break;
				x = nx; y = ny;
			}
			if (x !== u.x || y !== u.y) T.place(u, x, y);
			T.hurt(u, Math.max(1, Math.floor(u.maxHP * TRAP_DMG.gust)), 'gust');
			break;
		}
		case 'spin': if (!u.confused) { u.confused = 3 + T.roll(4); T.ev({ t: 'confused', uid: u.uid }); } break;
		case 'slumber': T.status(u, 'slp'); break;
		case 'slow': T.speed(u, -1, SLOW_TURNS[0] + T.roll(SLOW_TURNS[1] - SLOW_TURNS[0])); break;
		case 'seal': {
			const open = u.fig.equipped.filter((id) => !(u.sealed || []).includes(id));
			if (open.length) { const id = open[T.roll(open.length)]; u.sealed = [...(u.sealed || []), id]; T.ev({ t: 'sealed', uid: u.uid, move: id }); }
			break;
		}
		case 'poison': T.status(u, 'psn'); break;
		case 'selfdestruct': case 'explosion':
			for (const o of near(trap.kind === 'explosion' ? 2 : 1)) T.hurt(o, Math.max(1, Math.floor(o.hp / 2)), 'blast');
			gone();
			break;
		case 'ppzero': {
			const left = u.fig.equipped.filter((id) => (u.pp[id] || 0) > 0);
			if (left.length) { const id = left[T.roll(left.length)]; u.pp[id] = 0; T.ev({ t: 'ppzero', uid: u.uid, move: id }); }
			break;
		}
		case 'chestnut': case 'spike': T.hurt(u, Math.max(1, Math.floor(u.maxHP * TRAP_DMG[trap.kind])), trap.kind); break;
		case 'wonder': for (const k of Object.keys(u.boosts)) u.boosts[k] = 0; T.ev({ t: 'reset', uid: u.uid }); break;
		case 'pokemon': {
			const see = new Set(sightTiles(F, trap.x, trap.y, 2).map(([x, y]) => y * F.w + x));
			for (let i = S.items.length - 1; i >= 0; i--) {
				const o = S.items[i];
				if (o.shop || !see.has(o.y * F.w + o.x) || T.unitAt(o.x, o.y)) continue;
				if (T.spawn(o.x, o.y)) S.items.splice(i, 1);
			}
			gone();
			break;
		}
		default: break;
	}
	return true;
}
