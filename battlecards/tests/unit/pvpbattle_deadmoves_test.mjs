// pvpbattle_deadmoves_test.mjs — PvP twin of the overworld dead-moves fix.
// pvpbattle.js used to drop every power:0 damaging move into the status branch
// ('But nothing happened!'). This drives the pure-data engine directly and
// asserts the new FIXED / DYN / Bide / Present paths: exact level damage and
// halving, weight tiers via the snapshot's weightkg (old clients default 50kg),
// Counter/Mirror Coat retaliation off _lastTaken, Final Gambit's sacrifice,
// Bide's store-then-release, and that switch-in clears damage memory.
//   node battlecards/tests/unit/pvpbattle_deadmoves_test.mjs
import { createMatch, submitAction } from '../../pvpbattle.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const MOVES = {
	tackle: { type: 'Normal', power: 40, category: 'Physical' },
	watergun: { type: 'Water', power: 40, category: 'Special' },
	swordsdance: { type: 'Normal', power: 0, category: 'Status' },
	seismictoss: { type: 'Fighting', power: 0, category: 'Physical' },
	naturesmadness: { type: 'Fairy', power: 0, category: 'Special' },
	wringout: { type: 'Normal', power: 0, category: 'Special' },
	lowkick: { type: 'Fighting', power: 0, category: 'Physical' },
	counter: { type: 'Fighting', power: 0, category: 'Physical' },
	mirrorcoat: { type: 'Psychic', power: 0, category: 'Special' },
	finalgambit: { type: 'Fighting', power: 0, category: 'Special' },
	bide: { type: 'Normal', power: 0, category: 'Physical' },
	present: { type: 'Normal', power: 0, category: 'Physical' },
};
const mk = id => ({ id, name: id, pp: 30, maxPp: 30, acc: 100, priority: 0, ...MOVES[id] });
const mon = (name, moves, over = {}) => ({
	speciesId: name.toLowerCase(), name, level: 50, types: ['Normal'], sprite: 'x.png', weightkg: 50,
	stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
	maxHP: 5000, curHP: 5000, status: null, moves: moves.map(mk), ...over,
});
// side 0 is always faster (spe 100 vs 10), so its move resolves first
const fresh = (aMoves, bMoves, aOver = {}, bOver = {}) => createMatch('t', 'alice',
	[mon('ALPHA', aMoves, aOver)], 'bob',
	[mon('BRAVO', bMoves, { stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 10 }, ...bOver })]);
const turn = (st, aMove, bMove) => {
	submitAction(st, 0, { kind: 'move', moveIdx: aMove });
	submitAction(st, 1, { kind: 'move', moveIdx: bMove });
	return st.events;
};
const monOf = (st, s) => st.sides[s].party[st.sides[s].active];

const origRandom = Math.random;
Math.random = () => 0.5; // always hits, no crits, fixed damage roll, no status procs

// ---- fixed family + weight tiers + retaliation + sacrifice ----
{
	const st = fresh(['seismictoss', 'naturesmadness', 'wringout', 'lowkick', 'counter', 'mirrorcoat', 'finalgambit'],
		['tackle', 'watergun', 'swordsdance']);
	const a = monOf(st, 0), b = monOf(st, 1);

	turn(st, 0, 2); // Seismic Toss vs Swords Dance
	A(b.curHP === 5000 - 50, 'Seismic Toss deals exact level damage', 'hp=' + b.curHP);

	turn(st, 1, 2);
	A(b.curHP === 4950 - Math.floor(4950 / 2), "Nature's Madness halves the target", 'hp=' + b.curHP);

	const hpW = b.curHP; turn(st, 2, 2);
	A(b.curHP < hpW, 'Wring Out deals damage');

	b.weightkg = 460; b.curHP = b.maxHP;
	const h0 = b.curHP; turn(st, 3, 2); const dmgHeavy = h0 - b.curHP;
	b.weightkg = 6; b.curHP = b.maxHP;
	const h1 = b.curHP; turn(st, 3, 2); const dmgLight = h1 - b.curHP;
	A(dmgHeavy > dmgLight && dmgLight > 0, 'Low Kick scales with target weight', `heavy=${dmgHeavy} light=${dmgLight}`);

	b.curHP = b.maxHP;
	const evCold = turn(st, 4, 2); // Counter with no hit ever taken
	A(b.curHP === b.maxHP && evCold.includes('But it failed!'), 'Counter fails cold');

	const aHP0 = a.curHP; turn(st, 0, 0); // B tackles A (physical memory)
	const dTackle = aHP0 - a.curHP;
	const bHP0 = b.curHP; turn(st, 4, 2);
	A(dTackle > 0 && bHP0 - b.curHP === dTackle * 2, 'Counter pays back 2x the physical hit');

	const evMC = turn(st, 5, 2); // Mirror Coat vs the physical memory
	A(evMC.includes('But it failed!'), 'Mirror Coat ignores a physical hit');
	const aHP1 = a.curHP; turn(st, 0, 1); // B watergun (special memory)
	const dGun = aHP1 - a.curHP;
	const bHP1 = b.curHP; turn(st, 5, 2);
	A(dGun > 0 && bHP1 - b.curHP === dGun * 2, 'Mirror Coat pays back 2x the special hit');

	b.maxHP = 50000; b.curHP = 50000; // headroom so the sacrifice damage isn't clipped
	const aPaid = a.curHP, bHP2 = b.curHP;
	turn(st, 6, 2); // Final Gambit: single-mon side, so the user's side loses
	A(bHP2 - b.curHP === aPaid && a.curHP === 0, 'Final Gambit deals user-HP damage and faints the user');
	A(st.over && st.winner === 1, 'the sacrifice ends the match against the single-mon side');
}

// ---- bide + present + old-client weight default ----
{
	const st = fresh(['bide', 'present', 'lowkick'], ['tackle', 'swordsdance']);
	const a = monOf(st, 0), b = monOf(st, 1);

	const ev1 = turn(st, 0, 0); // Bide stores; B's tackle lands and accumulates
	const d1 = a.maxHP - a.curHP;
	A(ev1.some(e => typeof e === 'string' && /storing energy/.test(e)) && b.curHP === b.maxHP && d1 > 0,
		'Bide charges without dealing damage');
	const bHP = b.curHP; turn(st, 0, 1);
	A(bHP - b.curHP === d1 * 2 && a._bide === undefined, 'Bide releases 2x the damage taken');

	Math.random = () => 0; // forces the 20% gift branch (and still hits)
	const bLow = b.curHP; turn(st, 1, 1);
	A(b.curHP === Math.min(b.maxHP, bLow + Math.floor(b.maxHP / 4)), 'Present gift branch heals the target');
	Math.random = () => 0.5;
	const bHP3 = b.curHP; turn(st, 1, 1);
	A(bHP3 - b.curHP > 0, 'Present bomb branch deals damage');

	delete b.weightkg; // an old client's snapshot has no weight — engine defaults 50kg
	const bHP4 = b.curHP; turn(st, 2, 1);
	A(bHP4 - b.curHP > 0, 'Low Kick works against weightless old-client snapshots');
}

// ---- switch-in clears damage memory ----
{
	const st = createMatch('t2', 'alice',
		[mon('ALPHA', ['counter', 'seismictoss']), mon('ALT', ['seismictoss'])],
		'bob', [mon('BRAVO', ['tackle', 'swordsdance'], { stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 10 } })]);
	turn(st, 1, 0); // BRAVO's tackle gives ALPHA physical memory
	A(st.sides[0].party[0]._lastTaken?.amt > 0, 'damage memory recorded');
	submitAction(st, 0, { kind: 'switch', partyIdx: 1 });
	submitAction(st, 1, { kind: 'move', moveIdx: 1 });
	submitAction(st, 0, { kind: 'switch', partyIdx: 0 });
	submitAction(st, 1, { kind: 'move', moveIdx: 1 });
	A(st.sides[0].party[0]._lastTaken === undefined, 'switch-in clears damage memory');
	const st2ev = turn(st, 0, 1);
	A(st2ev.includes('But it failed!'), 'Counter fails cold after re-entry');
}

Math.random = origRandom;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
