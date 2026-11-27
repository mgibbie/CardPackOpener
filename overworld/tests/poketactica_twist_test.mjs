// poketactica_twist_test.mjs — THE DUNGEON's FLOORS WITH A TWIST (Plans/POKETACTICA_MODES_PLAN.md item D1). "Every floor
// between bosses is the same fight, deeper." Every third floor that is not a boss floor is a Geo floor, a one-type floor
// or a treasure floor (a foe that runs). Only a run begun with twists has them.
// Pure: node only.   node overworld/tests/poketactica_twist_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as D from '../../poketactica/js/dungeon.js';
import { campaignSetup } from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { FLEE_TURN } from '../../poketactica/js/engine/ai.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const team = STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 30, makeRng('tw' + i), data, { id: 'tw-' + i, shinyRate: 0 }));
const SEEDS = ['twa1', 'twb2', 'twc3', 'twd4', 'twe5', 'twf6', 'twg7', 'twh8'];
const find = (kind) => { for (const s of SEEDS) for (let f = 3; f <= 60; f += 3) if (D.twistOf(s, f) === kind) return { s, f }; return null; };

// ---------- which floors
{
	A(D.newRun(1, 123456).seed.startsWith('tw') && D.hasTwists(D.newRun().seed) && !D.hasTwists('r1abc') && !D.hasTwists('iwabc'), 'a new run has twist floors (its seed says so); a run begun before, and an Item World dive, do not');
	const kinds = {}; let off = 0;
	for (const s of SEEDS) for (let f = 1; f <= 60; f++) { const k = D.twistOf(s, f); if (k) { kinds[k] = (kinds[k] || 0) + 1; if (f % 3 || f % 10 === 0) off++; } else if (f % 3 === 0 && f % 10 !== 0) off++; }
	A(off === 0 && Object.keys(kinds).sort().join() === 'geo,treasure,type' && Object.values(kinds).every((n) => n > 20), 'every third floor that is not a boss floor has a twist; the three kinds all come up', kinds);
	A(D.twistOf('r1abc', 3) === null && D.twistOf('twa1', 30) === null && D.twistOf('twa1', 1) === null, 'never under an older run, on a boss floor, or on floor 1');
	const old = D.genFloor('r1abc', 3, data);
	A(!old.twist && !/treasure|Every foe here|Nearly every/.test(old.tip), 'an older run\'s floor 3 is the plain floor it was');
	A(JSON.stringify(D.genFloor('twa1', 4, data)) === JSON.stringify(D.genFloor('twa1', 4, data)) && !D.genFloor('twa1', 4, data).twist, 'a floor between twists is plain, and the same each time it is made');
}
// ---------- every twist floor is a floor the engine builds
{
	const bad = []; let n = 0;
	for (const s of SEEDS) for (let f = 3; f <= 60; f += 3) {
		const m = D.genFloor(s, f, data); if (!m.twist) continue; n++;
		try { const S = B.newBattle('t-' + s + f, campaignSetup(m, team, data, 't-' + s + f), data); if (S.units.filter((u) => u.side === 'e').length !== m.foes.length) bad.push(s + f); } catch (e) { bad.push(s + f + ': ' + e.message); }
		if (!m.name.includes(D.TWISTS[m.twist].name) || m.tip.length < 60) bad.push(s + f + ': not said');
	}
	A(n > 100 && bad.length === 0, `${n} twist floors: the engine builds each, and each says its twist in its name and its tip`, bad.slice(0, 5));
}
// ---------- the Geo floor
{
	const { s, f } = find('geo'), m = D.genFloor(s, f, data);
	const tiles = m.rows.join('').split('').filter((c) => c !== '#').length, col = m.geo.map((r, y) => [...r].filter((c, x) => c !== '.' && m.rows[y][x] !== '#').length).reduce((a, b) => a + b, 0);
	A(m.twist === 'geo' && col === tiles && new Set(m.geo.join('')).size >= 1 && !m.geo.join('').includes('.') === (m.rows.join('').indexOf('#') < 0), `the Geo floor (${s} floor ${f}): every one of its ${tiles} tiles is coloured`, [col, tiles]);
	A(m.symbols.every((g) => m.geo[g.y][g.x] !== '.') && m.foes.length >= 3, 'its symbols sit on colour, and its foes are the floor\'s');
}
// ---------- the one-type floor
{
	const { s, f } = find('type'), m = D.genFloor(s, f, data);
	A(m.twist === 'type' && m.twistType && m.foes.every((x) => data.species[x.sp].types.includes(m.twistType)) && m.tip.startsWith(`Every foe here is a ${m.twistType} type.`), `the one-type floor (${s} floor ${f}): every foe is ${m.twistType}, and the tip says so`, m.foes.map((x) => x.sp));
	A(m.foes.every((x) => x.lv === D.floorLevel(f)), 'at the floor\'s own level');
}
// ---------- the treasure floor: a foe that runs
{
	const { s, f } = find('treasure'), m = D.genFloor(s, f, data);
	const tr = m.foes.filter((x) => x.treasure);
	A(m.twist === 'treasure' && tr.length === 1 && tr[0].ai === 'flee' && m.tip.includes(D.treasureStars(f) + ' ★ more') && D.treasureStars(f) === D.floorStars(f) && FLEE_TURN === D.FLEE_TURN, `the treasure floor (${s} floor ${f}): one treasure foe, worth the floor's stars again (${D.treasureStars(f)})`);
	const S = B.newBattle('tr', campaignSetup(m, team, data, 'tr'), data);
	const u = S.units.find((x) => x.treasure), p = S.units.find((x) => x.side === 'p');
	A(u && u.ai === 'flee' && S.units.filter((x) => x.treasure).length === 1, 'in the battle it is marked, and it is the only one');
	const base = S.map.base;
	A(B.act(S, { t: 'deploy', uid: p.uid }, data).ok, 'one figurine goes out');
	const hp0 = p.hp, at = [];
	let fledAt = 0;
	for (let t = 0; t < 8 && !S.over && !fledAt; t++) {
		const d0 = Math.abs(u.x - p.x) + Math.abs(u.y - p.y), turn = S.turn;
		const r = B.act(S, { t: 'end' }, data);
		if (r.events.some((e) => e.t === 'fled' && e.uid === u.uid)) fledAt = turn;
		else at.push([d0, Math.abs(u.x - p.x) + Math.abs(u.y - p.y)]);
	}
	A(at.length > 0 && at.every(([a, b]) => b >= a), 'each turn it ends no nearer to the figurine than it began (it runs)', at);
	A(fledAt === FLEE_TURN && u.fled && u.hp === 0 && u.x === null, `when turn ${FLEE_TURN} comes round it is gone`, [fledAt, u.fled, u.hp]);
	A(!S.over && S.units.some((x) => x.side === 'e' && x.hp > 0), 'the battle goes on against the others');
	void base; void hp0;
	// it never attacks: a battle with ONLY the treasure foe ends won when it runs
	const one = { ...m, foes: [tr[0]] }, S2 = B.newBattle('tr2', campaignSetup(one, team, data, 'tr2'), data), p2 = S2.units.find((x) => x.side === 'p');
	B.act(S2, { t: 'deploy', uid: p2.uid }, data);
	let hurt = false;
	for (let t = 0; t < 8 && !S2.over; t++) { const r = B.act(S2, { t: 'end' }, data); if (r.events.some((e) => e.t === 'attack' || e.t === 'hit' || e.t === 'damage')) hurt = true; }
	A(S2.over === 'won' && !hurt && p2.hp === p2.maxHP, 'alone on a floor: it never attacks, and when it runs the floor is won', [S2.over, p2.hp, p2.maxHP]);
}
// ---------- the page: the stars and the words
{
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8'), hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8');
	A(/fl\.treasure = tr\.fled \? 0 : treasureStars\(m\.floor\); fl\.stars \+= fl\.treasure;/.test(main) && /id="r-treasure"/.test(main), 'a treasure foe knocked out pays the floor\'s stars again; one that ran pays nothing; the result says which');
	A(/e\.t === 'fled' && u\) u\.alive = false/.test(main) && /The treasure foe got away!/.test(main), 'the board shows it go');
	A(/id="floor-twist"/.test(hub) && /twistOf\(run\.seed, f\)/.test(hub), 'the Dungeon screen says a floor\'s twist before it is entered');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
