// Group F wave 3 — hero & weapon auras. New board-summed bonuses in
// heroAttackValue(state, p): heroAura (hero +Attack, usually gated to your turn)
// and weaponAura (your weapon has +Attack). Reuses heroWindfury (Azshara) for
// Inara, and temp-stealth-self (Coppertail) for Spirit of the Team's battlecry.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 40) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'warrior', name: 'M', power: null }, { id: 'warrior', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = []; st.players[0].life = 30; st.players[1].life = 30;
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const HAV = (st, pi) => E.heroAttackValue(st, st.players[pi]);

// data sanity
ok('Spiderling: heroAura +1 yourTurn', cardsById.spiderling.heroAura?.attack === 1 && cardsById.spiderling.heroAura.yourTurn === true);
ok('Inara: heroAura +2 yourTurn + heroWindfury', cardsById.inara_stormcrash.heroAura?.attack === 2 && cardsById.inara_stormcrash.heroWindfury === true);
ok('Spirit of the Team: heroAura +2 + temp-stealth-self battlecry', cardsById.spirit_of_the_team.heroAura?.attack === 2 && cardsById.spirit_of_the_team.effects?.[0]?.type === 'temp-stealth-self');
ok('Vulpera Toxinblade: weaponAura +2', cardsById.vulpera_toxinblade.weaponAura?.attack === 2);

// Spiderling: +1 hero Attack on your turn, nothing on the opponent's
{
	const st = game();
	put(st, 0, 'spiderling');
	st.current = 0;
	ok('on your turn the weaponless hero has 1 Attack', HAV(st, 0) === 1, HAV(st, 0));
	ok('and can swing (temp/aura attack lets a weaponless hero attack)', E.canHeroAttack(st, 0));
	st.current = 1;
	ok('off-turn the aura gives nothing', HAV(st, 0) === 0, HAV(st, 0));
}

// Inara Stormcrash: +2 Attack AND hero Windfury (two swings) on your turn
{
	const st = game();
	put(st, 0, 'inara_stormcrash');
	st.current = 0; st.players[0].heroAttacksUsed = 0;
	ok('hero has +2 Attack on your turn', HAV(st, 0) === 2, HAV(st, 0));
	ok('hero can attack (1st swing)', E.canHeroAttack(st, 0));
	st.players[0].heroAttacksUsed = 1;
	ok('hero Windfury allows a 2nd swing', E.canHeroAttack(st, 0));
	st.players[0].heroAttacksUsed = 2;
	ok('but not a 3rd', !E.canHeroAttack(st, 0));
	st.current = 1;
	ok('off-turn Inara grants no hero Attack', HAV(st, 0) === 0, HAV(st, 0));
}

// Spirit of the Team: battlecry Stealths itself for a turn; hero +2 on your turn
{
	const st = game();
	const spirit = E.instantiate(cardsById.spirit_of_the_team, 0); spirit.zone = 'hand'; st.players[0].hand.push(spirit);
	st.current = 0;
	E.playCard(st, 0, spirit.uid, null, null, 0);
	const onBoard = st.players[0].board.find(c => c.id === 'spirit_of_the_team');
	ok('Spirit is Stealthed after its battlecry', onBoard && onBoard.stealthed === true && onBoard.tempStealth === true);
	ok('hero gains +2 Attack from Spirit on your turn', HAV(st, 0) === 2, HAV(st, 0));
}

// Vulpera Toxinblade: your weapon has +2 Attack (only matters with a weapon)
{
	const st = game();
	put(st, 0, 'vulpera_toxinblade');
	st.current = 0;
	ok('no weapon: the aura contributes nothing', HAV(st, 0) === 0, HAV(st, 0));
	st.players[0].weapon = { id: 'wpn', name: 'Blade', type: 'weapon', attack: 3, durability: 2, keywords: [] };
	ok('with a 3-Attack weapon, Vulpera makes it hit for 5', HAV(st, 0) === 5, HAV(st, 0));
	// the buff is an aura — remove Vulpera and the weapon drops back to 3
	st.players[0].board = st.players[0].board.filter(c => c.id !== 'vulpera_toxinblade');
	ok('remove Vulpera and the weapon is back to 3', HAV(st, 0) === 3, HAV(st, 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
