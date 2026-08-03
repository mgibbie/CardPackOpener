// Group B — Titans (wave 3a): Aman'Thul (added) + The Primus.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'priest', name: 'P', power: null }, { id: 'deathknight', name: 'D', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[1].mana.max = 10; st.players[1].mana.cur = 10;
	return st;
};
const putBoard = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); return c; };
const dummyDef = (a, h, name = 'D') => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h });

ok('Aman\'Thul added (3/10 Titan, 3 abilities)', cardsById['amanthul'] && cardsById['amanthul'].titan && cardsById['amanthul'].attack === 3 && cardsById['amanthul'].health === 10 && cardsById['amanthul'].activated.length === 3);
ok('The Primus is a 7/9 Titan with 3 abilities', cardsById['the_primus'].titan && cardsById['the_primus'].attack === 7 && cardsById['the_primus'].activated.length === 3);

// ---------- Aman'Thul: Shape the Stars (copy +2/+2, non-Titan only) ----------
{
	const st = game();
	const am = putBoard(st, 0, 'amanthul');
	const other = putBoard(st, 0, 'khazgoroth'); // a second Titan -> not a legal target
	const victim = putBoard(st, 1, 'chillwind_yeti'); // a real registered 4/5 minion (copy reads its def)
	const spec = E.abilitySpec(st, 0, am, 0);
	const legal = E.legalTargets(st, 0, spec).filter(t => t.type === 'creature');
	ok('Shape the Stars can target the normal minion', legal.some(t => t.uid === victim.uid));
	ok('Shape the Stars CANNOT target a Titan (non-Titan only)', !legal.some(t => t.uid === am.uid || t.uid === other.uid), legal.map(t => t.uid));
	E.activateAbility(st, 0, am.uid, 0, { type: 'creature', uid: victim.uid, player: 1 });
	const copy = st.players[0].board.find(c => c.id === 'chillwind_yeti');
	ok('summoned a copy on your side with +2/+2 (Yeti 4/5 -> 6/7)', copy && copy.attack === 6 && E.hp(copy) === 7, copy && [copy.attack, E.hp(copy)]);
	ok('passive queued a Discover of a Legendary minion', st.pickQueue.length && st.pickQueue[st.pickQueue.length - 1].ids.every(id => cardsById[id].rarity === 'legendary' && cardsById[id].type === 'creature'));
}

// ---------- Aman'Thul: Strike from History removes two enemy minions ----------
{
	const st = game();
	const am = putBoard(st, 0, 'amanthul');
	const a = putBoard(st, 1, null, dummyDef(2, 2, 'A'));
	const b = putBoard(st, 1, null, dummyDef(2, 2, 'B'));
	E.activateAbility(st, 0, am.uid, 1, { type: 'creature', uid: a.uid, player: 1 });
	ok('Strike from History removed BOTH enemy minions (chosen + one other)', st.players[1].board.filter(c => c.type === 'creature').length === 0 && st.players[1].exile.length === 2, st.players[1].board.length);
}

// ---------- Aman'Thul: Vision of Heroes = random 6-cost with Taunt + Lifesteal ----------
{
	const st = game();
	const am = putBoard(st, 0, 'amanthul');
	const board0 = st.players[0].board.length;
	E.activateAbility(st, 0, am.uid, 2, null);
	const summoned = st.players[0].board.find(c => c !== am && (cardsById[c.id]?.cost === 6) && c.keywords.includes('taunt'));
	ok('Vision of Heroes: a 6-Cost minion with Taunt + Lifesteal', summoned && summoned.keywords.includes('lifesteal') && summoned.keywords.includes('taunt'), summoned && summoned.id);
}

// ---------- The Primus: Runes of Blood (destroy enemy, self + hero gain its Health) ----------
{
	const st = game();
	const pr = putBoard(st, 0, 'the_primus'); // 7/9
	st.players[0].life = 20;
	const foe = putBoard(st, 1, null, dummyDef(3, 8, 'Foe')); // 8 Health
	const hp0 = E.hp(pr), atk0 = pr.attack;
	E.activateAbility(st, 0, pr.uid, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Runes of Blood destroyed the enemy minion', E.isDead(foe) || !st.players[1].board.includes(foe));
	ok('the Primus gained its Health (+8, Attack unchanged)', E.hp(pr) === hp0 + 8 && pr.attack === atk0, [E.hp(pr), pr.attack]);
	ok('your hero also gained its Health (+8)', st.players[0].life === 28, st.players[0].life);
}

// ---------- The Primus: Runes of the Unholy = two 3/3 Undead with Taunt + Reborn ----------
{
	const st = game();
	const pr = putBoard(st, 0, 'the_primus');
	E.activateAbility(st, 0, pr.uid, 1, null);
	const undead = st.players[0].board.filter(c => c.name === 'Undead');
	ok('Runes of the Unholy summoned two 3/3 Undead with Taunt + Reborn', undead.length === 2 && undead.every(c => c.attack === 3 && E.hp(c) === 3 && c.keywords.includes('taunt') && c.keywords.includes('reborn')), undead.length);
}

// ---------- The Primus: Runes of Frost = next spell costs (3) less ----------
{
	const st = game();
	const pr = putBoard(st, 0, 'the_primus');
	E.activateAbility(st, 0, pr.uid, 2, null);
	const spell = E.instantiate({ id: 'sp', name: 'Sp', type: 'sorcery', cost: 5, rarity: 'common', effects: [] }, 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	ok('Runes of Frost: next spell costs (3) less (5 -> 2)', E.effectiveCost(st, 0, spell) === 2, E.effectiveCost(st, 0, spell));
	ok('passive queued a Discover (Death Knight card)', st.pickQueue.length && st.pickQueue[st.pickQueue.length - 1].ids.every(id => (cardsById[id].cardClass || '') === 'deathknight'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
