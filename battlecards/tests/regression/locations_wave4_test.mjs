// Wave 20 locations: Forbidden Shrine (spend all mana, cast a random spell of that cost)
// + Spire of Solitude (summon a Demon with hand-size stats that attacks a random enemy minion).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (heroClass = 'mage', seed = 12) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: heroClass, name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = heroClass; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const putEnemyMinion = (st, atk = 2, hp = 3) => { const m = E.instantiate({ id: 'e_dummy', name: 'Dummy', type: 'creature', cost: 1, attack: atk, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };

for (const id of ['forbidden_shrine', 'spire_of_solitude']) ok(`${id} exists`, cardsById[id], id);

// Forbidden Shrine: spends all mana, then casts a random Mage spell of that cost
{
	const st = game('mage');
	st.players[0].mana.cur = 6;
	const loc = placeLoc(st, 'forbidden_shrine');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Forbidden Shrine spent all remaining mana', st.players[0].mana.cur === 0, st.players[0].mana.cur);
	// durability ticked down by 1 (3 -> 2)
	const onBoard = st.players[0].board.find(c => c.id === 'forbidden_shrine');
	ok('durability decremented after tap', !onBoard || onBoard.durability === 2, onBoard?.durability);
}
// With 0 mana it spends nothing and casts a 0-cost spell (or none) without crashing
{
	const st = game('mage');
	st.players[0].mana.cur = 0;
	const loc = placeLoc(st, 'forbidden_shrine');
	ok('tapping with 0 mana does not throw', (() => { try { E.tapLand(st, 0, loc.uid, 0, null); return true; } catch (e) { console.log(e); return false; } })());
}

// Spire of Solitude: summon a Demon sized to hand, it attacks a random enemy minion
{
	const st = game('warlock');
	// give the controller a 4-card hand -> a 4/4 Demon
	for (let i = 0; i < 4; i++) st.players[0].hand.push(E.instantiate({ id: 'h' + i, name: 'H', type: 'sorcery', cost: 0, effects: [] }, 0));
	const enemy = putEnemyMinion(st, 2, 3);
	const boardBefore = st.players[0].board.length;
	const loc = placeLoc(st, 'spire_of_solitude');
	E.tapLand(st, 0, loc.uid, 0, null);
	const demon = st.players[0].board.find(c => c.name === 'Solitary Demon');
	ok('Spire summoned a Demon', demon && demon.tribe === 'Demon', demon && [demon.attack, demon.tribe]);
	ok('Demon stats equal hand size (4/4)', demon && demon.attack === 4, demon?.attack);
	// It attacked the enemy minion: 4-attack demon vs 2/3 -> enemy dead, demon took 2
	ok('the Demon attacked the enemy minion (it died)', enemy.damage >= enemy.maxHealth || st.players[1].board.every(c => c.uid !== enemy.uid || c.damage >= c.maxHealth), [enemy.damage, enemy.maxHealth]);
	ok('the Demon took retaliation damage', demon && demon.damage === 2, demon?.damage);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
