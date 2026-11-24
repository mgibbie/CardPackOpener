// mm/items.js — Mystery Maze's items (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md, "Items, belly, traps, shops"; the original's
// groups, Plans/PMD_SYSTEMS_SPEC.md section 5). What each does when the leader USES it (eats, drinks, breaks an orb) and
// when it is THROWN at someone: a berry thrown at a partner heals it, a Sleep Seed thrown at a foe puts it to sleep.
//   food      Apple, Big Apple (belly); Grimy Food (a little belly and a bad turn)
//   berries   Oran, Sitrus (HP); Pecha, Cheri, Rawst, Chesto (a status). No Reviver Seed: a knockout is final (owner).
//   seeds     Blast (hurts the foe in front), Sleep, Stun, Warp, Quick
//   orbs      Escape (leave with everything), Luminous (the map), Petrify, Slumber (the room's foes), Trawl (the floor's items)
//   thrown    Gravelrock (lobbed at a tile), Iron Thorn (flies straight); they come in handfuls
//   drinks    Elixir, Max Elixir (PP)
//   stars     piles of stars: the only currency (every item has a shop price in stars)
// A bag slot is { id, n?, sticky? }; a sticky item can't be used or thrown until it is carried out and cleaned.
// T is the run's toolkit (mm/turn.js). Pure: node-tested (overworld/tests/poketactica_mm_items_test.mjs).
import { DIR8, canStep8, cheb, clearTo, sightTiles } from './shapes8.js';
import { NO_ROOM } from './gen.js';

export const BAG_MAX = 20;
export const BELLY_MAX = 1000, BELLY_STEP = 1;      // in tenths: a full belly lasts 1,000 of the leader's actions
export const THROW_RANGE = 10, LOB_RANGE = 6;
export const HASTE_TURNS = [8, 10], SLOW_TURNS = [6, 8];   // (the original's ranges; the top is not included)

export const ITEMS = Object.freeze({
	apple: { price: 20, name: 'Wax Apple', group: 'food', belly: 500, note: 'Fills the belly by 50.' },
	bigapple: { price: 50, name: 'Big Wax Apple', group: 'food', belly: 1000, note: 'Fills the belly.' },
	grimyfood: { price: 1, name: 'Grimy Wax', group: 'food', belly: 300, grimy: true, note: 'Fills the belly by 30, and does something nasty.' },
	oran: { price: 30, name: 'Oran Bead', group: 'berry', heal: 0.5, belly: 50, note: 'Heals half of all HP.' },
	sitrus: { price: 80, name: 'Sitrus Bead', group: 'berry', heal: 1, belly: 50, note: 'Heals all HP.' },
	pecha: { price: 20, name: 'Pecha Bead', group: 'berry', cure: ['psn', 'tox'], belly: 50, note: 'Cures poison.' },
	cheri: { price: 20, name: 'Cheri Bead', group: 'berry', cure: ['par'], belly: 50, note: 'Cures paralysis.' },
	rawst: { price: 20, name: 'Rawst Bead', group: 'berry', cure: ['brn'], belly: 50, note: 'Cures a burn.' },
	chesto: { price: 20, name: 'Chesto Bead', group: 'berry', cure: ['slp'], belly: 50, note: 'Wakes the sleeper.' },
	blastseed: { price: 60, name: 'Blast Pellet', group: 'seed', blast: 0.3, belly: 50, note: 'Eaten: a blast at the foe in front. Thrown: a smaller one.' },
	sleepseed: { price: 50, name: 'Sleep Pellet', group: 'seed', status: 'slp', belly: 50, note: 'Whoever eats it, or is hit by it, falls asleep.' },
	stunseed: { price: 50, name: 'Stun Pellet', group: 'seed', status: 'par', belly: 50, note: 'Whoever eats it, or is hit by it, is paralysed.' },
	warpseed: { price: 40, name: 'Warp Pellet', group: 'seed', warp: true, belly: 50, note: 'Whoever eats it, or is hit by it, is sent somewhere else on the floor.' },
	quickseed: { price: 60, name: 'Quick Pellet', group: 'seed', haste: true, belly: 50, note: 'Two turns to everyone else\'s one, for a while.' },
	escapeorb: { price: 150, name: 'Escape Marble', group: 'orb', escape: true, note: 'Leave the dungeon now, with everything you carry.' },
	luminousorb: { price: 80, name: 'Luminous Marble', group: 'orb', reveal: true, note: 'Shows the whole floor.' },
	petrifyorb: { price: 120, name: 'Petrify Marble', group: 'orb', room: 'stone', note: 'Every foe in sight turns to stone until something hits it.' },
	slumberorb: { price: 120, name: 'Slumber Marble', group: 'orb', room: 'slp', note: 'Every foe in sight falls asleep.' },
	trawlorb: { price: 100, name: 'Trawl Marble', group: 'orb', trawl: true, note: 'Pulls every item on the floor to your feet.' },
	gravelrock: { price: 4, name: 'Gravel Chip', group: 'thrown', arc: true, dmg: 0.15, stack: true, note: 'Lobbed at a tile in sight, over anyone in the way.' },
	ironthorn: { price: 5, name: 'Iron Tack', group: 'thrown', dmg: 0.12, stack: true, note: 'Thrown straight ahead at the first Pokémon in its way.' },
	elixir: { price: 150, name: 'Joint Oil', group: 'drink', pp: 10, note: 'Gives 10 PP back to every move.' },
	maxelixir: { price: 400, name: 'Max Joint Oil', group: 'drink', pp: 999, note: 'Gives all PP back.' },
	stars: { name: 'Stars', group: 'stars', note: 'A pile of stars.' },
});
/** A shop's price in stars for an item (a handful: each one). */
export const priceOf = (it) => ((ITEMS[it.id] && ITEMS[it.id].price) || 10) * (it.n || 1);
export const itemName = (it) => { const d = ITEMS[it.id]; return (d ? d.name : it.id) + (it.n > 1 ? ' x' + it.n : ''); };
/** Can it be thrown at all? (Everything but stars; an orb or a drink thrown is only lost.) */
export const throwable = (id) => !!ITEMS[id] && id !== 'stars';
/** Can the leader use it (eat it, drink it, break it)? Thrown things are only for throwing. */
export const usable = (id) => !!ITEMS[id] && !['thrown', 'stars'].includes(ITEMS[id].group);

/** An item from a floor's list ([{ id, w }]) for a floor tile: stars come as a pile, thrown things as a handful; some are sticky. */
export function rollItem(list, T, floorNo, sticky = 0) {
	const total = list.reduce((a, e) => a + (e.w || 1), 0);
	let r = T.roll(total), pick = list[0];
	for (const e of list) { r -= e.w || 1; if (r < 0) { pick = e; break; } }
	const d = ITEMS[pick.id], it = { id: pick.id };
	if (pick.id === 'stars') it.n = 5 + T.roll(10 + 4 * floorNo);
	else if (d && d.stack) it.n = 3 + T.roll(4);
	if (pick.id !== 'stars' && T.roll(100) < sticky) it.sticky = true;
	return it;
}

const fill = (S, n, T) => { const b = Math.min(BELLY_MAX, S.belly + n); if (b !== S.belly) { S.belly = b; T.ev({ t: 'belly', n: Math.floor(b / 10) }); } };
function cure(u, list, T) {
	if (u.status && list.includes(u.status)) { T.ev({ t: 'cured', uid: u.uid, st: u.status }); u.status = null; u.sleepTurns = 0; u.chip = 0; return true; }
	if (list.includes('slp') && u.nap) { u.nap = false; u.stone = false; T.ev({ t: 'woke', uid: u.uid }); return true; }
	return false;
}
/** What an item does to whoever takes it in: the eater, or the Pokémon it was thrown at. -> did it do anything */
function affect(S, u, d, T, thrown) {
	let did = false;
	if (d.heal && u.hp < u.maxHP) { T.heal(u, Math.ceil(u.maxHP * d.heal)); did = true; }
	if (d.cure) did = cure(u, d.cure, T) || did;
	if (d.status) did = T.status(u, d.status) || did;
	if (d.warp) { T.warp(u); did = true; }
	if (d.haste) { T.speed(u, 1, HASTE_TURNS[0] + T.roll(HASTE_TURNS[1] - HASTE_TURNS[0])); did = true; }
	if (d.dmg) { T.hurt(u, Math.max(1, Math.floor(u.maxHP * d.dmg)), 'thrown'); did = true; }
	if (d.blast && thrown) { T.hurt(u, Math.max(1, Math.floor(u.maxHP * d.blast / 2)), 'blast'); did = true; }
	if (d.grimy) { T.status(u, ['psn', 'par', 'brn'][T.roll(3)]); did = true; }
	return did;
}

/** The leader uses an item (already taken out of the bag). */
export function useItem(S, u, it, T) {
	const d = ITEMS[it.id], F = S.F;
	T.ev({ t: 'item', uid: u.uid, id: it.id, how: 'use' });
	let did = affect(S, u, d, T, false);
	if (d.belly) { fill(S, d.belly, T); did = true; }
	if (d.blast) {   // (eaten: fire out of the mouth at whoever is in front)
		const v = canStep8(F, u.x, u.y, u.dir) ? T.unitAt(u.x + DIR8[u.dir][0], u.y + DIR8[u.dir][1]) : null;
		if (v) { T.hurt(v, Math.max(1, Math.floor(v.maxHP * d.blast)), 'blast'); did = true; }
	}
	if (d.pp) { for (const id of Object.keys(u.pp)) { const max = T.maxPP(id); if (u.pp[id] < max) { u.pp[id] = Math.min(max, u.pp[id] + d.pp); did = true; } } if (did) T.ev({ t: 'pp', uid: u.uid }); }
	if (d.escape) { S.over = { won: false, escaped: true, floor: S.floorNo }; T.ev({ t: 'over', won: false, escaped: true }); return; }
	if (d.reveal) { S.seen.fill(1); S.lit = true; T.ev({ t: 'reveal' }); did = true; }
	if (d.room) {
		const see = new Set(sightTiles(F, u.x, u.y, 2).map(([x, y]) => y * F.w + x));
		for (const v of S.units.filter((o) => o.hp > 0 && o.side !== u.side && see.has(o.y * F.w + o.x))) {
			if (d.room === 'stone') { v.nap = true; v.stone = true; T.ev({ t: 'stone', uid: v.uid }); did = true; } else did = T.status(v, d.room) || did;
		}
	}
	if (d.trawl) {
		// every free item on the floor comes to the open tiles nearest the leader
		const spots = [];
		for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
			const x = u.x + dx, y = u.y + dy;
			if (cheb(u.x, u.y, x, y) === r && T.canEnter(u, x, y) && F.room[y * F.w + x] !== NO_ROOM && clearTo(F, 'beam', u.x, u.y, x, y)) spots.push([x, y]);
		}
		const free = (x, y) => !S.items.some((o) => o.x === x && o.y === y && o.near);
		for (const o of S.items) {
			if (o.shop) continue;
			const s = spots.find(([x, y]) => free(x, y));
			if (!s) break;
			o.x = s[0]; o.y = s[1]; o.near = true; did = true;
		}
		for (const o of S.items) delete o.near;
		T.ev({ t: 'trawl' });
	}
	if (!did) T.ev({ t: 'nothing', uid: u.uid });
}

/**
 * The leader throws an item. A lobbed one (Gravelrock) lands on the aimed tile; anything else flies straight the way the
 * leader faces, up to 10 tiles, and hits the first Pokémon in its way. One that hits nobody lands on the floor if there
 * is room for it. it: one of the thing ({ id, sticky? })
 */
export function throwItem(S, u, it, x, y, T) {
	const d = ITEMS[it.id], F = S.F;
	T.ev({ t: 'item', uid: u.uid, id: it.id, how: 'throw' });
	let v = null, lx = u.x, ly = u.y;
	if (d.arc) { lx = x; ly = y; v = T.unitAt(x, y); }
	else {
		for (let i = 0; i < THROW_RANGE; i++) {
			if (!canStep8(F, lx, ly, u.dir)) break;
			lx += DIR8[u.dir][0]; ly += DIR8[u.dir][1];
			v = T.unitAt(lx, ly);
			if (v) break;
		}
	}
	T.ev({ t: 'thrown', id: it.id, x: lx, y: ly, hit: v ? v.uid : null });
	if (v) { if (!affect(S, v, d, T, true)) T.ev({ t: 'nothing', uid: v.uid }); return; }
	if ((lx !== u.x || ly !== u.y) && (F.terrain[ly * F.w + lx] & 3) === 1 && !S.items.some((o) => o.x === lx && o.y === ly)) S.items.push({ x: lx, y: ly, id: it.id, ...(it.sticky ? { sticky: true } : {}), ...(d.stack ? { n: 1 } : {}) });
}
/** Why the leader can't throw this there, or null (a lobbed item needs a tile it can reach). */
export function throwBlock(S, u, it, x, y) {
	if (!throwable(it.id)) return 'not for throwing';
	if (!ITEMS[it.id].arc) return null;
	if (!Number.isInteger(x) || !Number.isInteger(y)) return 'pick a tile';
	const c = cheb(u.x, u.y, x, y);
	if (c < 1 || c > LOB_RANGE || !clearTo(S.F, 'lob', u.x, u.y, x, y)) return 'out of reach';
	return null;
}
