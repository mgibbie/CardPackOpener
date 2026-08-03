// Group F wave 1 — static passives / auras. These vanilla stat-sticks carried an
// aura in their real text but no `aura` field. All wire through the existing
// recomputeAuras system (tribe / adjacent / others / keyword grants).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 38) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	return st;
};
// put in board ORDER (auras & adjacency depend on index)
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const hasKw = (c) => (c.keywords || []).concat(c.auraKeywords || []);
const kw = (c, k) => hasKw(c).includes(k);

// data sanity
for (const [id, on] of [['emerald_grove_tiger', 'tribe'], ['phalanx_beetle', 'adjacent'], ['siegebreaker', 'others'], ['sneaky_devil', 'others'], ['battleground_battlemaster', 'adjacent'], ['wee_spellstopper', 'adjacent'], ['robes_of_protection', 'keywords']])
	ok(`${id} carries an aura`, !!cardsById[id].aura, id);
ok('Siegebreaker kept its own Taunt', (cardsById.siegebreaker.keywords || []).includes('taunt'));
ok('Sneaky Devil kept its own Stealth', (cardsById.sneaky_devil.keywords || []).includes('stealth'));

// Emerald Grove Tiger: your Plants have Taunt (non-Plants unaffected)
{
	const st = game();
	put(st, 0, 'emerald_grove_tiger');
	const plant = put(st, 0, null, dummy(1, 1, 'Plant', { tribe: 'Plant' }));
	const nonplant = put(st, 0, null, dummy(1, 1, 'Golem', { tribe: 'Mech' }));
	E.recomputeAuras(st);
	ok('a friendly Plant gains Taunt', kw(plant, 'taunt'), hasKw(plant));
	ok('a non-Plant does NOT gain Taunt', !kw(nonplant, 'taunt'), hasKw(nonplant));
}

// Phalanx Beetle: only ADJACENT creatures get Taunt
{
	const st = game();
	const left = put(st, 0, null, dummy(1, 1, 'Left'));
	put(st, 0, 'phalanx_beetle'); // index 1
	const right = put(st, 0, null, dummy(1, 1, 'Right'));
	const far = put(st, 0, null, dummy(1, 1, 'Far')); // index 3, not adjacent
	E.recomputeAuras(st);
	ok('the left neighbour gets Taunt', kw(left, 'taunt'));
	ok('the right neighbour gets Taunt', kw(right, 'taunt'));
	ok('a non-adjacent minion does NOT get Taunt', !kw(far, 'taunt'), hasKw(far));
}

// Siegebreaker: your OTHER Demons +1 Attack (not itself, not non-Demons)
{
	const st = game();
	const sb = put(st, 0, 'siegebreaker'); // 5/8, Taunt
	const demon = put(st, 0, null, dummy(3, 3, 'Imp', { tribe: 'Demon' }));
	const nondemon = put(st, 0, null, dummy(3, 3, 'Wisp', { tribe: 'Elemental' }));
	E.recomputeAuras(st);
	ok('another friendly Demon gets +1 Attack', demon.attack === 4, demon.attack);
	ok('a non-Demon is unbuffed', nondemon.attack === 3, nondemon.attack);
	ok('Siegebreaker does not buff itself (others)', sb.attack === 5, sb.attack);
	ok('Siegebreaker is a Taunt', kw(sb, 'taunt'));
}

// Sneaky Devil: your other creatures +1 Attack, and it is Stealthed
{
	const st = game();
	const sd = put(st, 0, 'sneaky_devil');
	const ally = put(st, 0, null, dummy(2, 2, 'Ally'));
	E.recomputeAuras(st);
	ok('Sneaky Devil buffs another creature +1 Attack', ally.attack === 3, ally.attack);
	ok('Sneaky Devil is Stealthed', kw(sd, 'stealth'));
}

// Battleground Battlemaster: adjacent Windfury; Wee Spellstopper: adjacent Elusive
{
	const st = game();
	const a = put(st, 0, null, dummy(1, 1, 'A'));
	put(st, 0, 'battleground_battlemaster');
	const b = put(st, 0, null, dummy(1, 1, 'B'));
	E.recomputeAuras(st);
	ok('adjacent minion gets Windfury', kw(a, 'windfury') && kw(b, 'windfury'), [hasKw(a), hasKw(b)]);
}
{
	const st = game();
	const a = put(st, 0, null, dummy(1, 1, 'A'));
	put(st, 0, 'wee_spellstopper');
	const b = put(st, 0, null, dummy(1, 1, 'B'));
	const far = put(st, 0, null, dummy(1, 1, 'Far'));
	E.recomputeAuras(st);
	ok('adjacent minion gets Elusive', kw(a, 'elusive') && kw(b, 'elusive'));
	ok('non-adjacent minion does not', !kw(far, 'elusive'));
}

// Robes of Protection: ALL your creatures (incl. itself) get Elusive
{
	const st = game();
	const robes = put(st, 0, 'robes_of_protection');
	const ally = put(st, 0, null, dummy(1, 1, 'Ally'));
	const foe = put(st, 1, null, dummy(1, 1, 'Foe'));
	E.recomputeAuras(st);
	ok('a friendly creature gets Elusive', kw(ally, 'elusive'));
	ok('Robes itself is Elusive (not `others`)', kw(robes, 'elusive'));
	ok('the enemy creature is NOT Elusive', !kw(foe, 'elusive'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
