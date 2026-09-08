// Sixteenth batch from the wiki's owner inbox / direct owner request,
// applied 2026-09-08.
//
//   Mistweaver Ronin: wire the keywords its text already names —
//   "Bushido, Windfury, Bash & Meteoric." (only `windfury` was wired).
//
// NEW keyword Bash = Meteoric for ARTIFACTS: attack enemy artifacts as if they
// were 1/1 creatures (KW.BASH + glossary + attackTargets + the shared
// resolveCombat 1/1 branch). Bushido (glossary-defined, previously unwired):
// gains +1/+1 whenever it attacks. Both are FIRED here.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 27) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const ronin = (st) => { const r = E.instantiate(cardsById.mistweaver_ronin, 0); r.zone = 'board'; r.sick = false; st.players[0].board.push(r); return r; };
const foeArtifact = (st) => { const a = E.instantiate({ id: 'art', name: 'Art', type: 'artifact', cost: 2 }, 1); st.players[1].artifacts.push(a); return a; };
const foeEnch = (st) => { const e = E.instantiate({ id: 'ench', name: 'Ench', type: 'enchantment', cost: 2 }, 1); st.players[1].enchantments.push(e); return e; };

// ---------- wiring ----------
{
	const c = cardsById.mistweaver_ronin;
	ok('Mistweaver Ronin keywords match its text', JSON.stringify(c.keywords) === JSON.stringify(['bushido', 'windfury', 'bash', 'meteoric']), JSON.stringify(c.keywords));
	ok('description reads "Bushido, Windfury, Bash & Meteoric."', c.description === 'Bushido, Windfury, Bash & Meteoric.', JSON.stringify(c.description));
}

// ---------- attackTargets offers enemy artifacts (Bash) + enchantments (Meteoric) ----------
{
	const st = game();
	const r = ronin(st);
	const art = foeArtifact(st);
	const ench = foeEnch(st);
	E.recomputeAuras(st);
	const t = E.attackTargets(st, 0, r);
	ok('Bash offers the enemy artifact', t.some(x => x.type === 'artifact' && x.uid === art.uid), JSON.stringify(t));
	ok('Meteoric offers the enemy enchantment', t.some(x => x.type === 'enchantment' && x.uid === ench.uid), JSON.stringify(t));
}

// ---------- a plain creature gets no artifact targets ----------
{
	const st = game();
	const plain = E.instantiate({ id: 'p', name: 'Plain', type: 'creature', cost: 2, attack: 3, health: 3 }, 0);
	plain.zone = 'board'; plain.sick = false; st.players[0].board.push(plain);
	foeArtifact(st); E.recomputeAuras(st);
	ok('a non-Bash creature is offered no artifact targets', !E.attackTargets(st, 0, plain).some(x => x.type === 'artifact'));
}

// ---------- FIRE Bash (+ Bushido on the same swing) ----------
{
	const st = game();
	const r = ronin(st);          // 3/5, Bushido/Windfury/Bash/Meteoric
	const art = foeArtifact(st);
	E.recomputeAuras(st);
	E.attack(st, 0, r.uid, { type: 'artifact', uid: art.uid, player: 1 });
	ok('Bash destroyed the enemy artifact', !st.players[1].artifacts.some(x => x.uid === art.uid), st.players[1].artifacts.length);
	ok('Bushido grew the Ronin +1/+1 on the attack (now 4/6)', r.attack === 4 && r.maxHealth === 6, [r.attack, r.maxHealth]);
	ok('the 1/1 artifact dealt 1 back', r.damage === 1, ['damage', r.damage]);
}

// ---------- FIRE Bushido in isolation (attack the hero) ----------
{
	const st = game();
	const r = ronin(st);
	E.attack(st, 0, r.uid, { type: 'hero', player: 1 });
	ok('Bushido: +1/+1 on attacking the hero (4/6), no retaliation', r.attack === 4 && r.maxHealth === 6 && r.damage === 0, [r.attack, r.maxHealth, r.damage]);
}

// ---------- Meteoric still works on this card (enchantment) ----------
{
	const st = game();
	const r = ronin(st);
	const ench = foeEnch(st);
	E.recomputeAuras(st);
	E.attack(st, 0, r.uid, { type: 'enchantment', uid: ench.uid, player: 1 });
	ok('Meteoric destroyed the enemy enchantment', !st.players[1].enchantments.some(x => x.uid === ench.uid), st.players[1].enchantments.length);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
