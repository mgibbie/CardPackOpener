// Wave 34: Tiny Pal — Battlecry choose an elemental ammunition; after your hero
// attacks the loaded element fires and the ammo rotates to a different one.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 4) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'shaman', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'shaman'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equipChoice = (st, choice) => { const w = E.instantiate(cardsById.tiny_pal, 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, choice, 0); return st.players[0].weapon; };
const enemyMinions = (st, n, hp = 4) => { const arr = []; for (let i = 0; i < n; i++) { const m = E.instantiate({ id: 'e' + i, name: 'Ox', type: 'creature', cost: 1, attack: 0, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); arr.push(m); } return arr; };
const swing = (st) => { st.players[0].heroAttacksUsed = 0; E.heroAttack(st, 0, { type: 'hero', player: 1 }); };

ok('tiny_pal exists', cardsById.tiny_pal);
ok('tiny_pal has 4 ammunition choices', (cardsById.tiny_pal.choices || []).length === 4);

// Fire (choice 0): after attack, deal 1 to all enemies; ammo then rotates
{
	const st = game();
	const w = equipChoice(st, 0);
	ok('Fire ammo loaded', w.ammo === 'fire', w.ammo);
	const foes = enemyMinions(st, 1, 4);
	const heroLife = st.players[1].life;
	swing(st);
	ok('Fire: enemy hero took the attack (2) plus 1 AoE', st.players[1].life === heroLife - 3, [heroLife, st.players[1].life]);
	ok('Fire: enemy minion took 1 AoE', foes[0].damage === 1, foes[0].damage);
	ok('ammo rotated to a different element after attacking', st.players[0].weapon.ammo !== 'fire', st.players[0].weapon.ammo);
}

// Frost (choice 1): after attack, Freeze 2 random enemies
{
	const st = game();
	equipChoice(st, 1);
	enemyMinions(st, 3, 4);
	swing(st);
	const frozen = st.players[1].board.filter(c => c.frozen).length;
	ok('Frost: froze 2 enemy minions', frozen === 2, frozen);
}

// Earth (choice 2): after attack, summon a random 3-Cost minion with Taunt
{
	const st = game();
	equipChoice(st, 2);
	const before = st.players[0].board.filter(c => c.type === 'creature').length;
	swing(st);
	const mine = st.players[0].board.filter(c => c.type === 'creature');
	ok('Earth: summoned a minion', mine.length === before + 1, [before, mine.length]);
	const summoned = mine[mine.length - 1];
	ok('Earth: it costs 3 and has Taunt', summoned && cardsById[summoned.id].cost === 3 && summoned.keywords.includes('taunt'), summoned && [cardsById[summoned.id]?.cost, summoned.keywords]);
}

// Air (choice 3): after attack, get a random Battlecry minion that costs (2) less
{
	const st = game();
	equipChoice(st, 3);
	const handBefore = st.players[0].hand.length;
	swing(st);
	const got = st.players[0].hand[st.players[0].hand.length - 1];
	ok('Air: added a card to hand', st.players[0].hand.length === handBefore + 1, [handBefore, st.players[0].hand.length]);
	ok('Air: it is a Battlecry minion', got && got.type === 'creature' && (got.keywords || []).includes('battlecry'), got && [got.type, got.keywords]);
	ok('Air: it costs 2 less than its base', got && got.cost === Math.max(0, (cardsById[got.id].cost || 0) - 2), got && [cardsById[got.id]?.cost, got.cost]);
}

// Rotation never repeats the current element and cycles across attacks
{
	const st = game();
	equipChoice(st, 0);
	const seen = new Set(['fire']);
	for (let i = 0; i < 3; i++) { if (!st.players[0].weapon) break; const prev = st.players[0].weapon.ammo; swing(st); if (!st.players[0].weapon) break; const now = st.players[0].weapon.ammo; ok(`swing ${i}: ammo changed`, now !== prev, [prev, now]); seen.add(now); }
	ok('multiple distinct ammos were cycled', seen.size >= 2, [...seen]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
