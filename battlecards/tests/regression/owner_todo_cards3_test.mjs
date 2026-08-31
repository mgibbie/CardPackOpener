// Third batch of card changes filed from the wiki's owner inbox (owner_todo),
// applied 2026-08-31.
//
//   Giant Growth      -> wording only ("gets" -> "gains"); already correct
//   Nature's Claim    -> "its controller gains 4 Life" now pays only the owner
//                        of the destroyed permanent (new healOwner option)
//   Elvish Visionary  -> Battlecry AND Deathrattle draw
//   Ambush Viper      -> tribe Snake -> Beast
//   Naturalize        -> unchanged; see the note at the bottom
//
// Behaviour is executed, not inspected — the first batch shipped a Deathrattle
// that looked right in JSON and did nothing.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 3, players = 2) => {
	const heroes = Array.from({ length: players }, (_, i) => ({ id: 'mage', name: 'P' + i, power: null }));
	const st = E.createGame(cardsById, seededRng(seed), null, players, heroes);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const cast = (st, id, target) => {
	const c = E.instantiate(cardsById[id], 0);
	c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10;
	E.playCard(st, 0, c.uid, target, null, 0);
	return c;
};

// ---------- Giant Growth ----------
{
	const c = cardsById.giant_growth;
	ok('Giant Growth reads "gains +3/+3 until end of turn"',
		c.description === 'Target creature gains +3/+3 until end of turn.', c.description);

	const st = game();
	const dummy = E.instantiate({ id: 't_d', name: 'D', type: 'creature', cost: 1, attack: 1, health: 1 }, 0);
	dummy.zone = 'board'; st.players[0].board.push(dummy);
	cast(st, 'giant_growth', { type: 'creature', uid: dummy.uid });
	ok('it actually grants +3/+3', dummy.attack === 4 && dummy.maxHealth === 4, `${dummy.attack}/${dummy.maxHealth}`);
	ok('and the buff is marked temporary', dummy.tempAttack === 3 && dummy.tempHealth === 3,
		`temp ${dummy.tempAttack}/${dummy.tempHealth}`);
}

// ---------- Nature's Claim ----------
{
	const c = cardsById.natures_claim;
	const fx = (c.effects || [])[0];
	ok('Nature\'s Claim heals via healOwner', fx?.type === 'destroy-art-ench' && fx.healOwner === 4, JSON.stringify(c.effects));
	ok('it no longer blanket-heals every opponent',
		!(c.effects || []).some(e => e.type === 'heal' && e.target === 'enemy-heroes'), JSON.stringify(c.effects));
	ok('text says "gains 4 Life"', /Its controller gains 4 Life\./.test(c.description), c.description);

	// three players: destroying ONE opponent's artifact must heal only that
	// opponent. The old effect paid every enemy, which is wrong in a free-for-all.
	const st = game(5, 3);
	const art = E.instantiate({ id: 't_art', name: 'Art', type: 'artifact', cost: 1 }, 1);
	st.players[1].artifacts.push(art);
	const life = st.players.map(p => p.life);
	cast(st, 'natures_claim');
	ok('the artifact was destroyed', st.players[1].artifacts.length === 0, String(st.players[1].artifacts.length));
	ok('its controller gained 4 Life', st.players[1].life === life[1] + 4, `${life[1]} -> ${st.players[1].life}`);
	ok('the OTHER opponent gained nothing', st.players[2].life === life[2], `${life[2]} -> ${st.players[2].life}`);
	ok('the caster gained nothing', st.players[0].life === life[0], `${life[0]} -> ${st.players[0].life}`);
}

// ---------- Elvish Visionary ----------
{
	const c = cardsById.elvish_visionary;
	ok('Elvish Visionary has both keywords',
		(c.keywords || []).includes('battlecry') && (c.keywords || []).includes('deathrattle'), JSON.stringify(c.keywords));
	ok('reads "Battlecry & Deathrattle: Draw a card."',
		c.description === 'Battlecry & Deathrattle: Draw a card.', c.description);

	const st = game(9);
	st.players[0].deck = ['giant_growth', 'giant_growth', 'giant_growth', 'giant_growth'];
	const handBefore = st.players[0].hand.length;
	const v = cast(st, 'elvish_visionary');
	ok('the Battlecry drew a card', st.players[0].hand.length === handBefore + 1,
		`${handBefore} -> ${st.players[0].hand.length}`);
	const midHand = st.players[0].hand.length;
	v.damage = v.maxHealth;
	E.sweepDeaths(st);
	ok('and the Deathrattle drew another', st.players[0].hand.length === midHand + 1,
		`${midHand} -> ${st.players[0].hand.length}`);
}

// ---------- Ambush Viper ----------
{
	const c = cardsById.ambush_viper;
	ok('Ambush Viper is a Beast', c.tribe === 'Beast', c.tribe);
	ok('it keeps Deathtouch and its stats',
		(c.keywords || []).includes('deathtouch') && c.cost === 3 && c.attack === 2 && c.health === 1,
		JSON.stringify([c.cost, c.attack, c.health, c.keywords]));
}

// ---------- Naturalize (deliberately unchanged) ----------
// The note asked for "Destroy TARGET artifact or enchantment". The engine has no
// board-permanent targeting UI, so destroy-art-ench picks at random from a scope,
// and all 14 cards that use it are enemy-scoped with the same house wording.
// Widening just this one to scope:'all' would make a removal spell able to blow
// up your own permanents at random — strictly worse. Pinned so the convention is
// a decision on the record rather than an oversight.
{
	const c = cardsById.naturalize;
	ok('Naturalize is still enemy-scoped', (c.effects || [])[0]?.scope === undefined, JSON.stringify(c.effects));
	ok('and keeps the house wording shared by its 13 siblings',
		c.description === 'Destroy an enemy artifact or enchantment.', c.description);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
