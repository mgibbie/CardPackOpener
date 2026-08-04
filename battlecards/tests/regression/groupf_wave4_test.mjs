// Group F wave 4 (tail) — Whirlwind Tempest (your Windfury creatures get
// Mega-Windfury) and Glinda Crowskin (minions in your hand have Echo).
//
// Documented SKIPS (need a bespoke mechanism, not wiring): ogre_gang_rider
// (50% attack-replacement) and the MTG-Cascade cards (fandral_staghelm,
// the_first_sliver, nak_stormspell_sneak).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 41) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.attacksUsed = 0; st.players[pi].board.push(c); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const hasK = (c, k) => (c.keywords || []).includes(k);

// data sanity
ok('Whirlwind Tempest: hasWindfury aura granting mega_windfury', cardsById.whirlwind_tempest.aura?.hasWindfury === true && cardsById.whirlwind_tempest.aura.keywords?.includes('mega_windfury'));
ok('Glinda Crowskin: handMinionEcho flag', cardsById.glinda_crowskin.handMinionEcho === true);

// Whirlwind Tempest: your Windfury creatures gain Mega-Windfury (4 attacks)
{
	const st = game();
	put(st, 0, 'whirlwind_tempest');
	const wf = put(st, 0, null, dummy(2, 5, 'WF', { keywords: ['windfury'] }));
	const plain = put(st, 0, null, dummy(2, 5, 'Plain'));
	E.recomputeAuras(st);
	ok('a friendly Windfury creature gains mega_windfury', hasK(wf, 'mega_windfury'), wf.keywords);
	ok('a non-Windfury creature does not', !hasK(plain, 'mega_windfury'), plain.keywords);
	st.current = 0;
	wf.attacksUsed = 3;
	ok('Mega-Windfury allows a 4th attack', E.canAttackWith(st, 0, wf), wf.attacksUsed);
	wf.attacksUsed = 4;
	ok('but not a 5th', !E.canAttackWith(st, 0, wf));
	// without the Tempest, the same creature is plain Windfury (max 2)
	st.players[0].board = st.players[0].board.filter(c => c.id !== 'whirlwind_tempest');
	E.recomputeAuras(st);
	ok('remove the Tempest → mega_windfury retracts', !hasK(wf, 'mega_windfury'), wf.keywords);
	wf.attacksUsed = 2;
	ok('now it caps at 2 attacks (plain Windfury)', !E.canAttackWith(st, 0, wf));
}

// Glinda Crowskin: playing a minion from hand leaves an Echo ghost copy
{
	const st = game();
	put(st, 0, 'glinda_crowskin');
	const m = E.instantiate(dummy(1, 1, 'Grunt'), 0); m.zone = 'hand'; st.players[0].hand.push(m);
	cardsById.dm_Grunt = dummy(1, 1, 'Grunt'); // register so the ghost copy can instantiate
	st.current = 0;
	E.playCard(st, 0, m.uid, null, null, 0);
	const ghost = st.players[0].hand.find(c => c.id === 'dm_Grunt' && c.echoGhost);
	ok('a minion played under Glinda leaves an Echo ghost in hand', !!ghost, st.players[0].hand.map(c => [c.id, c.echoGhost]));
	ok('the original minion is on the board', st.players[0].board.some(c => c.id === 'dm_Grunt'));
}
// Glinda does NOT give spells Echo
{
	const st = game();
	put(st, 0, 'glinda_crowskin');
	const sp = { id: 't_spell', name: 'Sp', type: 'sorcery', cost: 0, rarity: 'basic', effects: [{ type: 'armor', value: 1 }] };
	cardsById.t_spell = sp;
	const c = E.instantiate(sp, 0); c.zone = 'hand'; st.players[0].hand.push(c);
	E.playCard(st, 0, c.uid, null, null, 0);
	ok('a spell under Glinda leaves NO ghost (minions only)', !st.players[0].hand.some(x => x.id === 't_spell'), st.players[0].hand.map(x => x.id));
}
// no Glinda → no echo
{
	const st = game();
	const m = E.instantiate(dummy(1, 1, 'Solo'), 0); m.zone = 'hand'; st.players[0].hand.push(m);
	cardsById.dm_Solo = dummy(1, 1, 'Solo');
	st.current = 0;
	E.playCard(st, 0, m.uid, null, null, 0);
	ok('without Glinda, a played minion leaves no ghost', !st.players[0].hand.some(c => c.echoGhost));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
