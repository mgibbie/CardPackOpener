// Across the Timeways locations — Past→Present→Future chains (advance-location)
// + Hedge Maze (trigger-one-deathrattle).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 50) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const placeLoc = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'board'; c.sick = false; c.tapped = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };
const locOf = (st, uid) => st.players[0].board.find(c => c.uid === uid);

for (const id of ['past_silvermoon', 'present_silvermoon', 'future_silvermoon', 'past_gnomeregan', 'present_gnomeregan', 'future_gnomeregan', 'hedge_maze'])
	ok(`${id} exists as a location`, cardsById[id]?.type === 'location', id);
ok('Present/Future tokens are uncollectible', cardsById.present_silvermoon.collectible === false && cardsById.future_gnomeregan.collectible === false);

// Past Silvermoon: deal 5 to a random enemy minion, then Advance to the present
{
	const st = game(); const foe = put(st, 1, dummy(0, 8, 'Foe'));
	const loc = placeLoc(st, 'past_silvermoon');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Past Silvermoon dealt 5 to an enemy minion', foe.damage === 5, foe.damage);
	ok('Past Silvermoon advanced to Present Silvermoon (same slot)', locOf(st, loc.uid)?.id === 'present_silvermoon', locOf(st, loc.uid)?.id);
}
// Present Silvermoon: 5 to a random enemy minion, excess to enemy hero; advance to future
{
	const st = game(); const foe = put(st, 1, dummy(0, 3, 'Foe')); // 3 health → 3 dealt, 2 excess
	const loc = placeLoc(st, 'present_silvermoon');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Present Silvermoon: excess damage hit the enemy hero (2)', st.players[1].life === 28, st.players[1].life);
	ok('Present Silvermoon advanced to Future Silvermoon', locOf(st, loc.uid)?.id === 'future_silvermoon', locOf(st, loc.uid)?.id);
}
// Future Silvermoon: hits the LOWEST-Health enemy minion, excess to hero
{
	const st = game(); const big = put(st, 1, dummy(0, 8, 'Big')); const low = put(st, 1, dummy(0, 3, 'Low'));
	const loc = placeLoc(st, 'future_silvermoon');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Future Silvermoon hit the lowest-Health minion', low.damage === 5 && big.damage === 0, [low.damage, big.damage]);
	ok('Future Silvermoon spilled 2 excess to the enemy hero', st.players[1].life === 28, st.players[1].life);
	ok('Future Silvermoon does NOT advance further', locOf(st, loc.uid)?.id === 'future_silvermoon');
}
// Past Gnomeregan: give a minion +2/+1, advance to present
{
	const st = game(); const m = put(st, 0, dummy(2, 2, 'M'));
	const loc = placeLoc(st, 'past_gnomeregan');
	E.tapLand(st, 0, loc.uid, 0, { type: 'creature', uid: m.uid, player: 0 });
	ok('Past Gnomeregan gave the minion +2/+1', m.attack === 4 && E.hp(m) === 3, [m.attack, E.hp(m)]);
	ok('Past Gnomeregan advanced to Present Gnomeregan', locOf(st, loc.uid)?.id === 'present_gnomeregan', locOf(st, loc.uid)?.id);
}
// Present Gnomeregan: +2/+1 AND grant a Deathrattle (deal 2 to enemy hero)
{
	const st = game(); const m = put(st, 0, dummy(2, 1, 'M'));
	const loc = placeLoc(st, 'present_gnomeregan');
	E.tapLand(st, 0, loc.uid, 0, { type: 'creature', uid: m.uid, player: 0 });
	ok('Present Gnomeregan gave +2/+1', m.attack === 4, m.attack);
	ok('Present Gnomeregan granted a Deathrattle', (m.keywords || []).includes('deathrattle') && (m.deathrattle || []).length > 0);
	// kill it (m attacks into a 6/6) → deathrattle deals 2 to enemy hero
	const wall = put(st, 1, dummy(6, 6, 'Wall')); st.current = 0; m.attacksUsed = 0;
	E.attack(st, 0, m.uid, { type: 'creature', uid: wall.uid, player: 1 });
	ok('the buffed minion died to combat', E.isDead(m), [m.attack, E.hp(m), m.damage]);
	ok('the granted Deathrattle dealt 2 to the enemy hero', st.players[1].life === 28, st.players[1].life);
}
// Future Gnomeregan: +2/+1, Divine Shield, and the Deathrattle
{
	const st = game(); const m = put(st, 0, dummy(2, 2, 'M'));
	const loc = placeLoc(st, 'future_gnomeregan');
	E.tapLand(st, 0, loc.uid, 0, { type: 'creature', uid: m.uid, player: 0 });
	ok('Future Gnomeregan gave +2/+1 and Divine Shield', m.attack === 4 && (m.keywords || []).includes('divine_shield') && m.shield === true, [m.attack, m.keywords, m.shield]);
	ok('Future Gnomeregan granted the Deathrattle', (m.deathrattle || []).length > 0);
}
// Hedge Maze: trigger a friendly minion's Deathrattle
{
	const st = game();
	put(st, 0, dummy(2, 2, 'DR', { keywords: ['deathrattle'], deathrattle: [{ type: 'damage', value: 3, target: 'enemy-hero' }] }));
	const loc = placeLoc(st, 'hedge_maze');
	E.tapLand(st, 0, loc.uid, 0, null);
	ok('Hedge Maze triggered a friendly Deathrattle (enemy hero -3)', st.players[1].life === 27, st.players[1].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
