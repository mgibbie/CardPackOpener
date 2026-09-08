// Eighteenth batch (2026-09-08): finish wiring Pyrog.
//
// Pyrog's text — "Fire Spell Damage+2. Sanguine, Impulsive, Reborn & Bash." —
// had an empty keywords array (all four inert) and a GENERIC spell-damage static
// (all spells) despite claiming Fire-only. Fixed:
//   keywords -> [sanguine, impulsive, reborn, bash]
//   static   -> {type:'spell-damage-Fire', value:2}  (Fire-school only)
//
// FIRED: Fire spells get +2 while non-Fire spells get nothing; Bash destroys an
// enemy artifact; Reborn returns it at 1 Health.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 31) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const pyrog = (st) => { const c = E.instantiate(cardsById.pyrog, 0); c.zone = 'board'; c.sick = false; st.players[0].board.push(c); return c; };
const enemyCreature = (st, hp) => { const c = E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 1, attack: 0, health: hp }, 1); c.zone = 'board'; st.players[1].board.push(c); return c; };
const castAt = (st, school, tgtUid) => { const sp = E.instantiate({ id: 'z', name: 'Z', type: 'sorcery', tribe: school, cost: 1, effects: [{ type: 'damage', value: 2, target: 'creature' }] }, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10; E.playCard(st, 0, sp.uid, { type: 'creature', uid: tgtUid, player: 1 }, null, 0); };

// ---------- wiring ----------
{
	const c = cardsById.pyrog;
	ok('Pyrog keywords are [sanguine, impulsive, reborn, bash]', JSON.stringify(c.keywords) === JSON.stringify(['sanguine', 'impulsive', 'reborn', 'bash']), JSON.stringify(c.keywords));
	ok('Pyrog static is Fire-school Spell Damage +2', c.static?.type === 'spell-damage-Fire' && c.static?.value === 2, JSON.stringify(c.static));
}

// ---------- Fire-school Spell Damage: Fire spells +2, others +0 ----------
{
	const st = game(); pyrog(st);
	const foe = enemyCreature(st, 9);
	castAt(st, 'Fire', foe.uid);
	ok('a Fire spell gets +2 (2 -> 4)', foe.damage === 4, ['fire dmg', foe.damage]);
}
{
	const st = game(); pyrog(st);
	const foe = enemyCreature(st, 9);
	castAt(st, 'Frost', foe.uid);
	ok('a non-Fire (Frost) spell gets no bonus (still 2)', foe.damage === 2, ['frost dmg', foe.damage]);
}

// ---------- Bash: attack an enemy artifact ----------
{
	const st = game();
	const p = pyrog(st);
	const art = E.instantiate({ id: 'art', name: 'Art', type: 'artifact', cost: 2 }, 1); st.players[1].artifacts.push(art);
	E.recomputeAuras(st);
	ok('Bash offers the enemy artifact', E.attackTargets(st, 0, p).some(t => t.type === 'artifact' && t.uid === art.uid));
	E.attack(st, 0, p.uid, { type: 'artifact', uid: art.uid, player: 1 });
	ok('Bash destroyed the artifact', !st.players[1].artifacts.some(x => x.uid === art.uid), st.players[1].artifacts.length);
}

// ---------- Reborn: first death returns it at 1 Health ----------
{
	const st = game();
	const p = pyrog(st); // 8/5
	p.damage = p.maxHealth; // lethal
	E.sweepDeaths(st);
	const back = st.players[0].board.find(x => x.id === 'pyrog');
	ok('Reborn returned Pyrog to the board', !!back, st.players[0].board.map(x => x.id));
	ok('Reborn returned it at 1 Health', !!back && (back.maxHealth - back.damage) === 1, back && [back.maxHealth, back.damage]);
	ok('Reborn was consumed (removed from keywords)', !!back && !back.keywords.includes('reborn'), back && back.keywords);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
