// poketactica_mm_house_test.mjs — MYSTERY MAZE, Monster Houses, shops and recruiting (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md
// stage 6; the original's rules, Plans/PMD_SYSTEMS_SPEC.md 3.5, 5.3, 7.3). Pure: node only.
//   node overworld/tests/poketactica_mm_house_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR, T_SHOP, T_MONSTER_HOUSE, NO_ROOM } from '../../poketactica/js/mm/gen.js';
import { DIR8, cheb } from '../../poketactica/js/mm/shapes8.js';
import { ITEMS, priceOf } from '../../poketactica/js/mm/items.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 30, moves) => {
	let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-mm' + lv, shinyRate: 0 });
	if (moves) { const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))]; f = equip({ ...f, pool }, moves); }
	return f;
};
const PROPS = { layout: 0, roomDensity: 7, floorConnectivity: 15, enemyDensity: 4, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 5, trapDensity: 0, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const WILD = [{ species: 'rattata', level: 4, w: 1 }];
const GOODS = ['apple', 'oran', 'sleepseed', 'ironthorn', 'escapeorb', 'stars'].map((id) => ({ id, w: 1 }));
const dungeon = (props = {}, more = {}, floors = 2) => ({ id: 'test', name: 'Test Cave', party: 4, floors: Array.from({ length: floors }, () => ({ props: { ...PROPS, ...props }, water: false, vis: 0, wild: WILD, items: GOODS, traps: [], ...more })) });
const L = (S) => MM.leaderOf(S);
const act = (S, a) => MM.act(S, a, data);
const of = (e, t) => e.filter((v) => v.t === t);
function arena(party = [fig('pikachu', 30, ['thundershock', 'tackle'])], more = {}, seed = 'arena') {
	const S = MM.newRun(seed, { dungeon: dungeon({}, { wild: [], items: [] }), party, ...more }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	MM.partyOf(S).forEach((u, i) => { u.x = 20 - i; u.y = 15; });
	act(S, { t: 'face', d: 2 });
	S.F.stairs = [50, 28];
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	return S;
}
const wild = (S, sp, lv, x, y, more = {}) => Object.assign(MM.addWild(S, sp, lv, x, y, data), { nap: true }, more);
/** Walk the leader to a tile by the shortest way (attacking nothing). */
function walkTo(S, x, y, each) {
	for (let n = 0; n < 300 && !S.over; n++) {
		const u = L(S), dist = MM.walkMap(S.F, u, x, y), here = dist[u.y * W + u.x];
		if (here <= 0) break;
		const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => MM.canWalk(S.F, u, k) && dist[(u.y + DIR8[k][1]) * W + u.x + DIR8[k][0]] === here - 1 && !MM.actBlock(S, { t: 'step', d: k }, data));
		const e = act(S, d != null ? { t: 'step', d } : { t: 'pass' });
		if (each && each(e) === false) break;
	}
	return L(S).x === x && L(S).y === y;
}

// ================================================================ Monster Houses
{
	// a floor that has one
	let S = null;
	for (let k = 0; k < 20 && !S; k++) { const T = MM.newRun('mh' + k, { dungeon: dungeon({ monsterHouseChance: 100 }), party: [fig('pikachu', 60)] }, data); if (T.F.mh !== NO_ROOM && !T.house) S = T; }
	const tiles = [];
	for (let i = 0; i < W * H; i++) if ((S.F.terrain[i] & T_MONSTER_HOUSE) && (S.F.terrain[i] & 3) === T_FLOOR) tiles.push(i);
	A(S && tiles.length >= 12 && S.house === false, 'a floor with a Monster House: a room that looks like any other, quiet until someone steps in', tiles.length);
	const before = MM.wildOf(S).length;
	let drop = null;
	const edge = tiles.map((i) => [i % W, (i / W) | 0]).sort((a, b) => MM.walkMap(S.F, L(S), a[0], a[1])[L(S).y * W + L(S).x] - MM.walkMap(S.F, L(S), b[0], b[1])[L(S).y * W + L(S).x])[0];
	for (const u of MM.wildOf(S)) { u.nap = true; u.stone = true; }   // (so the walk there is quiet)
	const n0 = MM.wildOf(S).length;
	walkTo(S, edge[0], edge[1], (e) => { if (of(e, 'house').length) { drop = e; return false; } return true; });
	const came = drop ? of(drop, 'spawn') : [];
	A(drop && S.house && came.length >= 8 && came.length <= 11 && MM.wildOf(S).length === n0 + came.length && came.every((v) => (S.F.terrain[v.y * W + v.x] & T_MONSTER_HOUSE) && cheb(v.x, v.y, L(S).x, L(S).y) <= 5) && came.every((v) => !MM.unit(S, v.uid) || !MM.unit(S, v.uid).nap), `stepping in: ${came.length} wild Pokémon drop round you, awake (8 to 11, within 4 tiles, inside the house)`, [before, came.length]);
	let again = 0;
	for (let k = 0; k < 6 && !S.over; k++) again += of(act(S, { t: 'pass' }), 'house').length;
	A(again === 0, 'it happens once a floor');
	// the one-room floor: you start inside it
	const one = MM.newRun('oneroom', { dungeon: dungeon({ layout: 2 }), party: [fig('pikachu', 60)] }, data);
	A(one.house === true && one.F.mh === 0 && MM.wildOf(one).length >= 10, 'a one-room floor is all Monster House: it wakes the moment you arrive', MM.wildOf(one).length);
	// a partner sets it off too; no list, no house
	const P = arena([fig('pikachu'), fig('rattata')]);
	P.dungeon.floors[0].wild = WILD;
	for (let y = 10; y <= 20; y++) for (let x = 10; x <= 17; x++) P.F.terrain[y * W + x] |= T_MONSTER_HOUSE;
	const p = P.units[1];
	p.x = 18; p.y = 15; L(P).x = 16; L(P).y = 13;
	const e = act(P, { t: 'pass' });
	A(P.house && of(e, 'house')[0].uid === 'p1', 'a partner stepping in sets it off as well');
	const N = arena();
	for (let y = 10; y <= 20; y++) for (let x = 21; x <= 30; x++) N.F.terrain[y * W + x] |= T_MONSTER_HOUSE;
	A(of(act(N, { t: 'step', d: 2 }), 'house').length === 0 && !N.house, 'a floor with no wild list has no Monster House to wake');
}

// ================================================================ shops
{
	let S = null;
	for (let k = 0; k < 20 && !S; k++) { const T = MM.newRun('shop' + k, { dungeon: dungeon({ kecleonShopChance: 100 }), party: [fig('pikachu', 60)], stars: 500 }, data); if (T.F.shop && T.items.some((o) => o.shop)) S = T; }
	const goods = S.items.filter((o) => o.shop), keeper = S.units.find((u) => u.keeper);
	A(goods.length >= 1 && goods.length <= 9 && goods.every((o) => (S.F.terrain[o.y * W + o.x] & T_SHOP) && o.price === priceOf(o) && o.price > 0 && o.id !== 'stars' && !o.sticky) && S.items.filter((o) => !o.shop).every((o) => !(S.F.terrain[o.y * W + o.x] & T_SHOP)), `a shop: ${goods.length} priced items on its carpet (no stars, nothing sticky)`);
	A(keeper && keeper.species === 'kecleon' && keeper.level === 90 && !keeper.hostile && keeper.x === S.F.keeper[0] && S.stars === 500, 'its keeper stands by: far stronger than anything on the floor; the stars you brought are in your purse');
	for (const u of MM.wildOf(S)) if (!u.keeper) { u.nap = true; u.stone = true; }
	const kx = keeper.x, ky = keeper.y, g = goods[0];
	const ok = walkTo(S, g.x, g.y);
	A(ok && S.items.includes(g) && S.bag.length === 0 && keeper.x === kx && keeper.y === ky && keeper.hp === keeper.maxHP, 'walking over a shop\'s item does not take it; the keeper minds its shop');
	const v = MM.view(S);
	A(v.items.find((o) => o.x === g.x && o.y === g.y).price === g.price && v.units.find((u) => u.uid === keeper.uid).keeper === true && v.owed === 0, 'the price shows');
	const turns = S.turns;
	const e = act(S, { t: 'take' });
	A(of(e, 'take')[0].price === g.price && S.owed === g.price && S.bag[0].unpaid === g.price && !S.items.includes(g) && S.turns === turns && act(S, { t: 'take' })[0].why === 'nothing for sale here', 'take: it is in the bag and you owe its price (no time passes)', S.bag);
	const back = act(S, { t: 'putback', slot: 0 });
	A(of(back, 'putback').length === 1 && S.owed === 0 && S.bag.length === 0 && S.items.some((o) => o.shop && o.x === g.x && o.y === g.y && o.price === g.price), 'putback: it lies on the carpet again and you owe nothing');
	act(S, { t: 'take' });
	S.stars = g.price - 1;
	const poor = act(S, { t: 'pay' })[0].why;
	S.stars = 500;
	const paid = act(S, { t: 'pay' });
	A(poor === 'not enough stars' && of(paid, 'paid')[0].n === g.price && S.stars === 500 - g.price && S.owed === 0 && !S.bag[0].unpaid && act(S, { t: 'pay' })[0].why === 'nothing to pay', 'pay: in stars, if you have them');
	let thief = 0;
	walkTo(S, S.F.stairs[0], S.F.stairs[1], (ev) => { thief += of(ev, 'thief').length; });
	A(thief === 0 && !S.thief && !keeper.hostile, 'paid up, you walk out and nobody minds');
}
{
	// theft, on a hand-made shop: a 3 x 3 carpet east of the leader, the keeper south of it
	const shop = (party, more) => {
		const S = arena(party, more);
		for (let y = 14; y <= 16; y++) for (let x = 22; x <= 24; x++) S.F.terrain[y * W + x] |= T_SHOP;
		S.items.push({ x: 22, y: 15, id: 'escapeorb', shop: true, price: 150 }, { x: 23, y: 15, id: 'oran', shop: true, price: 30 }, { x: 24, y: 15, id: 'apple', shop: true, price: 20 });
		const k = Object.assign(MM.addWild(S, 'kecleon', 90, 23, 18, data), { keeper: true, hostile: false, nap: false });
		return { S, k };
	};
	let { S, k } = shop();
	act(S, { t: 'step', d: 2 }); act(S, { t: 'step', d: 2 });
	act(S, { t: 'take' });
	const calm = !k.hostile && k.x === 23 && k.y === 18;
	const out = act(S, { t: 'step', d: 6 });
	A(calm && of(out, 'thief').length === 1 && S.thief && k.hostile && k.stage === 2 && S.owed === 0 && !S.bag[0].unpaid && S.items.every((o) => !o.shop), 'step off the carpet owing and you are a thief: the keeper turns on you, at double speed; nothing is for sale any more');
	let spawns = [], closer = cheb(k.x, k.y, L(S).x, L(S).y);
	L(S).maxHP = L(S).hp = 99999;   // (to live long enough to count them)
	for (let n = 0; n < 12 && !S.over; n++) spawns.push(...of(act(S, { t: 'step', d: 6 }), 'spawn').map((v) => MM.unit(S, v.uid)));
	A(spawns.length >= 2 && spawns.every((u) => u && u.keeper && u.hostile && u.species === 'kecleon') && (S.over || cheb(k.x, k.y, L(S).x, L(S).y) <= Math.max(1, closer)), 'and more keepers arrive every 5 turns, with no limit', spawns.length);
	// hit the keeper
	({ S, k } = shop());
	S.items.length = 0;
	L(S).x = 23; L(S).y = 17; act(S, { t: 'face', d: 4 });
	let angry = [];
	for (let n = 0; n < 6 && !angry.length && !S.over; n++) angry = of(act(S, { t: 'attack' }), 'angry');
	A(angry.length === 1 && k.hostile && !S.thief, 'hit the keeper and it turns on you too');
	// partners leave it alone
	({ S, k } = shop([fig('pikachu'), fig('rattata'), fig('squirtle')]));
	S.units[1].x = 22; S.units[1].y = 18; S.units[2].x = 24; S.units[2].y = 18;
	for (const u of S.units.slice(1, 3)) u.tactic = 'wait';
	for (let n = 0; n < 12; n++) act(S, { t: 'pass' });
	A(k.hp === k.maxHP && !k.hostile, 'partners standing next to a peaceful keeper leave it alone');
	// leaving by orb with unpaid goods
	({ S, k } = shop(undefined, { bag: [{ id: 'escapeorb' }] }));
	act(S, { t: 'step', d: 2 }); act(S, { t: 'step', d: 2 }); act(S, { t: 'step', d: 2 });
	act(S, { t: 'take' });
	act(S, { t: 'use', slot: 0 });
	A(S.over && S.over.escaped && S.bag.length === 0, 'escaping with unpaid goods leaves them behind', S.bag);
	// eaten on the carpet: still owed
	({ S, k } = shop());
	act(S, { t: 'step', d: 2 }); act(S, { t: 'step', d: 2 }); act(S, { t: 'step', d: 2 });
	act(S, { t: 'take' });
	act(S, { t: 'use', slot: 0 });
	A(S.owed === 30 && S.bag.length === 0 && !S.thief, 'an unpaid berry eaten on the carpet is still owed for');
}

// ================================================================ recruiting
{
	A(MM.recruitRate('rattata', data) === 120 && MM.recruitRate('mewtwo', data) === 5 && MM.recruitBonus(29) === 0 && MM.recruitBonus(30) === 50 && MM.recruitBonus(55) === 100 && MM.recruitBonus(999) === 240, 'the chance: from the catch rate (Rattata 12%, Mewtwo 0.5%), plus the original\'s bonus for the leader\'s level (none below 30)');
	const tryOne = (seed, opt = {}) => {
		const S = arena(opt.party || [fig('pikachu', opt.lv || 30, ['thundershock', 'tackle'])], {}, seed);
		if (opt.cap) S.dungeon.party = opt.cap;
		if (opt.floor) Object.assign(S.dungeon.floors[0], opt.floor);
		const v = wild(S, opt.species || 'rattata', 2, opt.far ? 23 : 21, 15);
		if (opt.keeper) Object.assign(v, { keeper: true, hostile: true });
		v.hp = 1;
		let ev = [];
		for (let n = 0; n < 8 && v.hp > 0 && v.side !== 'p'; n++) ev.push(...act(S, opt.far ? { t: 'move', id: 'thundershock', x: 23, y: 15 } : opt.partner ? { t: 'pass' } : { t: 'attack' }));
		return { S, v, ev, rec: of(ev, 'recruit')[0] || null };
	};
	let joins = 0, n = 0, first = null;
	for (let k = 0; k < 400; k++) { const r = tryOne('rec' + k); n++; if (r.rec) { joins++; first = first || r; } }
	A(joins / n > 0.11 && joins / n < 0.24, 'a Lv 30 leader knocking out Rattata from beside it: about 17 in 100 ask to join', [joins, n]);
	let low = 0;
	for (let k = 0; k < 400; k++) if (tryOne('low' + k, { lv: 20 }).rec) low++;
	A(low / 400 > 0.07 && low / 400 < 0.17 && low < joins, 'below Lv 30 only the species\' own chance (12)', low);
	let far = 0, partner = 0, keeper = 0, off = 0;
	for (let k = 0; k < 150; k++) {
		if (tryOne('far' + k, { far: true }).rec) far++;
		const pr = tryOne('par' + k, { partner: true, party: [fig('pikachu', 30), fig('machop', 60)] });
		if (pr.rec) partner++;
		if (tryOne('kee' + k, { keeper: true, species: 'kecleon' }).rec) keeper++;
		if (tryOne('off' + k, { floor: { noRecruit: true } }).rec) off++;
	}
	A(far === 0 && partner === 0 && keeper === 0 && off === 0, 'never from a distance, never for a partner\'s knockout, never a shopkeeper, never on a floor that forbids it', [far, partner, keeper, off]);
	// one that joined
	const { S, v, rec } = first;
	A(rec.joined === true && v.side === 'p' && v.hp === v.maxHP && v.tactic === 'follow' && MM.partyOf(S).includes(v) && S.recruits.length === 1 && S.recruits[0].fig.species === 'rattata' && MM.view(S).recruits.join() === 'rattata' && !S.fallen.length, 'it joins the party at full health and is listed among the recruits', rec);
	for (let k = 0; k < 6; k++) act(S, { t: 'step', d: 4 });
	A(cheb(v.x, v.y, L(S).x, L(S).y) <= 2, 'and follows like any partner');
	MM.hurt(S, v, 9999, 'test');
	A(!MM.unit(S, v.uid) && S.recruits.length === 0 && S.fallen.length === 0, 'a recruit that faints is simply gone: not one of your fallen figurines');
	// REGRESSION (found by tools/poketactica/mm_explore.mjs, 2026-11-23): a recruit that had come to lead and then fainted
	// left the run with no leader at all, and the next turn threw. Whoever leads, the next one takes over.
	{
		let r = null;
		for (let k = 0; k < 400 && !r; k++) { const x = tryOne('lead' + k, { party: [fig('pikachu', 30, ['thundershock', 'tackle']), fig('eevee', 30)] }); if (x.rec && x.rec.joined) r = x; }
		const R = r.S, rec = r.v, own = R.units.find((u) => u.uid === 'p1');
		own.tactic = 'wait';
		MM.hurt(R, L(R), 99999, 'test');   // (the leader falls: the next in the party leads)
		const order = MM.partyOf(R).map((u) => u.uid);
		// make the recruit the leader by felling whoever is ahead of it
		while (R.leader !== rec.uid && !R.over) MM.hurt(R, L(R), 99999, 'test');
		const led = R.leader === rec.uid && !R.over;
		const left = MM.partyOf(R).length;
		MM.hurt(R, rec, 99999, 'test');
		let threw = null, ev = [];
		try { ev = act(R, { t: 'pass' }); } catch (e) { threw = e.message; }
		A(order.includes(rec.uid) && (led || left === 0) && !threw && (R.over ? R.over.won === false && !MM.leaderOf(R) : !!MM.leaderOf(R) && MM.leaderOf(R).hp > 0) && R.recruits.length === 0, 'a recruit that came to lead and then faints: the next one leads, or with nobody left the run is lost (it used to be left leaderless)', { threw, over: R.over, leader: R.leader, left });
		A(R.over ? ev[0].t === 'no' : ev.some((v) => v.t === 'pass'), 'and the run carries on, or is properly over');
	}
	// no room
	let full = null;
	for (let k = 0; k < 400 && !full; k++) { const r = tryOne('full' + k, { cap: 1 }); if (r.rec) full = r; }
	A(full && full.rec.joined === false && !MM.unit(full.S, full.v.uid) && full.S.recruits.length === 1 && MM.partyOf(full.S).length === 1, 'with the party full it waits outside: listed, not on the floor');
}

// ================================================================ exact
{
	const play = (seed) => {
		const S = MM.newRun(seed, { dungeon: dungeon({ kecleonShopChance: 100, monsterHouseChance: 50 }, {}, 4), party: [fig('pikachu', 60, ['thundershock']), fig('squirtle', 60)], stars: 200 }, data);
		const acts = [];
		for (let k = 0; k < 500 && !S.over; k++) {
			const u = L(S);
			let a;
			const g = S.items.find((o) => o.shop && o.x === u.x && o.y === u.y);
			if (g && S.bag.length < 20 && S.stars >= S.owed + g.price) { acts.push({ t: 'take' }); act(S, { t: 'take' }); acts.push({ t: 'pay' }); act(S, { t: 'pay' }); }
			if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) a = { t: 'stairs' };
			else {
				const shopItem = S.items.find((o) => o.shop && S.seen[o.y * W + o.x] && S.stars >= o.price);
				const goal = shopItem || { x: S.F.stairs[0], y: S.F.stairs[1] };
				const dist = MM.walkMap(S.F, u, goal.x, goal.y), here = dist[u.y * W + u.x];
				const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k2) => MM.canWalk(S.F, u, k2) && dist[(u.y + DIR8[k2][1]) * W + u.x + DIR8[k2][0]] === here - 1);
				if (d == null) a = { t: 'pass' };
				else if (MM.actBlock(S, { t: 'step', d }, data)) { if (u.dir !== d) { acts.push({ t: 'face', d }); act(S, { t: 'face', d }); } a = { t: 'attack' }; }
				else a = { t: 'step', d };
			}
			acts.push(a);
			act(S, a);
		}
		return { S, acts };
	};
	const one = play('exact-house'), two = play('exact-house');
	const bought = one.acts.filter((a) => a.t === 'pay').length;
	A(one.acts.length > 100 && MM.hashOf(one.S) === MM.hashOf(two.S), `a run through shops and Monster Houses replays the same (${one.acts.length} actions, floor ${one.S.floorNo}, ${bought} bought, ${one.S.recruits.length} recruited${one.S.over ? ', over' : ''})`);
	const fresh = MM.newRun('exact-house', { dungeon: dungeon({ kecleonShopChance: 100, monsterHouseChance: 50 }, {}, 4), party: [fig('pikachu', 60, ['thundershock']), fig('squirtle', 60)], stars: 200 }, data);
	const half = one.acts.length >> 1;
	let mid = null;
	one.acts.forEach((a, i) => { if (i === half) mid = MM.toSnapshot(fresh); act(fresh, a); });
	const again = MM.fromSnapshot(JSON.parse(JSON.stringify(mid)), data);
	one.acts.slice(half).forEach((a) => act(again, a));
	A(MM.hashOf(fresh) === MM.hashOf(one.S) && MM.hashOf(again) === MM.hashOf(one.S), 'and from a snapshot taken half way');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
