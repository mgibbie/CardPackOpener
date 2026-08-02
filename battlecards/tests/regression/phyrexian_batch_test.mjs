// Five paper cards: Rothga (reveal Phyrexian -> next Beast +4/+4, Trample),
// Magmatic Scorchwing (Mountain-only -> 3 dmg; Firebreathing & Windfury),
// Blightwing Whelp (Poisonous & Windfury), Feywild Prankster (Choose One),
// Underbridge Warlock (Deathtouch; end of turn each opponent loses 5).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(cardsById, seededRng(13), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0; st.players[1].hand = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, id, over = {}) => { const c = E.instantiate({ ...cardsById[id], ...over }, pi); c.zone = 'board'; c.summonedThisTurn = false; st.players[pi].board.push(c); return c; };
const playFromHand = (st, id, target = null, choice = null) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, target, choice, 0); return st.players[0].board.find(x => x.id === id); };

// helper tribes
const phyrexianId = raw.cards.find(c => (c.tribe || '').includes('Phyrexian') && c.id !== 'rothga_bonded_engulfer')?.id || 'blightwing_whelp';
const beastId = raw.cards.find(c => (c.tribe || '').includes('Beast') && c.type === 'creature' && !c.keywords?.includes('battlecry') && (c.cost || 0) <= 3)?.id;

// ---- Blightwing Whelp: keywords ----
{
	const st = game();
	const w = playFromHand(st, 'blightwing_whelp');
	ok('Blightwing Whelp has Poisonous & Windfury', w && w.keywords.includes('poisonous') && w.keywords.includes('windfury'));
}

// ---- Rothga: reveal a Phyrexian -> the NEXT Beast played gains +4/+4 ----
{
	const st = game();
	// no Phyrexian in hand -> no reward
	const r1 = playFromHand(st, 'rothga_bonded_engulfer');
	ok('Rothga has Trample', r1 && r1.keywords.includes('trample'));
	ok('no Phyrexian revealed -> no next-Beast reward', !st.players[0].nextTribePlayReward);
	const beast1 = beastId ? playFromHand(st, beastId) : null;
	if (beastId) ok('a Beast played WITHOUT the reveal is unbuffed', beast1 && beast1.attack === cardsById[beastId].attack, [beast1 && beast1.attack, cardsById[beastId].attack]);

	const st2 = game();
	// hold a Phyrexian, then play Rothga -> reward armed
	const phyx = E.instantiate(cardsById[phyrexianId], 0); phyx.zone = 'hand'; st2.players[0].hand.push(phyx);
	playFromHand(st2, 'rothga_bonded_engulfer');
	ok('revealing a Phyrexian arms the next-Beast reward', st2.players[0].nextTribePlayReward && st2.players[0].nextTribePlayReward.tribe === 'Beast' && st2.players[0].nextTribePlayReward.attack === 4);
	if (beastId) {
		const beast2 = playFromHand(st2, beastId);
		ok('the next Beast gains +4/+4', beast2 && beast2.attack === cardsById[beastId].attack + 4 && E.hp(beast2) === cardsById[beastId].health + 4, [beast2 && beast2.attack, cardsById[beastId].attack]);
		ok('the reward is spent (only the next Beast)', !st2.players[0].nextTribePlayReward);
	}
}

// ---- Magmatic Scorchwing: Mountain-only condition + keywords ----
{
	const st = game();
	const foe = put(st, 1, 'blightwing_whelp'); // an enemy target
	// no lands -> condition false, target takes no damage
	const s1 = playFromHand(st, 'magmatic_scorchwing', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Scorchwing has Firebreathing & Windfury', s1 && s1.keywords.includes('firebreathing') && s1.keywords.includes('windfury'));
	ok('no Mountain -> Battlecry deals no damage', foe.damage === 0, foe.damage);

	// give player only a Mountain -> condition true, 3 damage lands
	const st2 = game();
	const foe2 = put(st2, 1, 'blightwing_whelp');
	st2.players[0].lands = [E.instantiate(cardsById['mountain'], 0)];
	playFromHand(st2, 'magmatic_scorchwing', { type: 'creature', uid: foe2.uid, player: 1 });
	ok('Mountain-only -> Battlecry deals 3 to the target', foe2.damage === 3, foe2.damage);

	// a non-Mountain land present -> condition false again
	const st3 = game();
	const foe3 = put(st3, 1, 'blightwing_whelp');
	st3.players[0].lands = [E.instantiate(cardsById['mountain'], 0), E.instantiate(cardsById['forest'], 0)];
	playFromHand(st3, 'magmatic_scorchwing', { type: 'creature', uid: foe3.uid, player: 1 });
	ok('Mountain + another land -> no damage', foe3.damage === 0, foe3.damage);
}

// ---- Feywild Prankster: Choose One ----
{
	// choice 0: swap Attack & Health of a target
	const st = game();
	const victim = put(st, 1, 'blightwing_whelp', { attack: 5, health: 1 }); // 5/1
	victim.maxHealth = 1; victim.attack = 5;
	playFromHand(st, 'feywild_prankster', { type: 'creature', uid: victim.uid, player: 1 }, 0);
	ok('Choose One (swap): the 5/1 target becomes 1/5', victim.attack === 1 && E.hp(victim) === 5, [victim.attack, E.hp(victim)]);

	// choice 1: deal 3 & give +3 Attack to a survivor
	const st2 = game();
	const big = put(st2, 1, 'blightwing_whelp', { attack: 2, health: 8 }); big.maxHealth = 8; big.attack = 2;
	playFromHand(st2, 'feywild_prankster', { type: 'creature', uid: big.uid, player: 1 }, 1);
	ok('Choose One (blast): target took 3 damage & gained +3 Attack', big.damage === 3 && big.attack === 5, [big.damage, big.attack]);
}

// ---- Underbridge Warlock: Deathtouch + end-of-turn drain ----
{
	const st = game();
	const uw = put(st, 0, 'underbridge_warlock');
	ok('Underbridge Warlock has Deathtouch', uw.keywords.includes('deathtouch'));
	const foeLife0 = st.players[1].life;
	E.endTurn(st); // end player 0's turn -> each opponent loses 5
	ok('at end of your turn each opponent loses 5 Life', st.players[1].life === foeLife0 - 5, [st.players[1].life, foeLife0]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
