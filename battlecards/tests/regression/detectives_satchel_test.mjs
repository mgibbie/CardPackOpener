// Detective's Satchel (paper, Artifact, 4): Battlecry: Investigate twice.
// {T}: If you've sacrificed a Clue this turn, create a 1/1 Mech with Taunt.
// The tap ability is adapted to an automatic ongoing trigger (the engine has
// no artifact-tap UI): whenever YOU sacrifice a Clue, summon the Mech.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const CARD = cardsById['detectives_satchel'];
ok('card face: artifact, cost 4, 2x investigate on play, ongoing on token-sacrificed',
	CARD && CARD.type === 'artifact' && CARD.cost === 4 && CARD.effects.length === 2
	&& CARD.effects.every(e => e.type === 'investigate')
	&& CARD.ongoing && CARD.ongoing.on === 'token-sacrificed' && CARD.ongoing.if.cardId === 'clue_token',
	CARD && CARD.ongoing);

const game = () => {
	const st = E.createGame(cardsById, seededRng(6), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0; return st;
};
const clues = (st, pi) => st.players[pi].artifacts.filter(a => a.id === 'clue_token');
const mechs = (st, pi) => st.players[pi].board.filter(c => (c.tribe || '').includes('Mech'));

// play the satchel -> Investigate twice = two Clue tokens
const st = game();
const art = E.instantiate(CARD, 0); art.zone = 'hand'; st.players[0].hand.push(art);
st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
const played = E.playCard(st, 0, art.uid, null, null, 0);
ok('satchel plays into the artifacts zone', played && st.players[0].artifacts.some(x => x.uid === art.uid));
ok('Battlecry: Investigate twice -> two Clue tokens', clues(st, 0).length === 2, clues(st, 0).length);
ok('no Mech yet (nothing sacrificed)', mechs(st, 0).length === 0);

// sacrifice one Clue -> the satchel's trigger summons a 1/1 Mech with Taunt
st.players[0].mana.cur = 10;
const c1 = clues(st, 0)[0];
const sac1 = E.sacrificeToken(st, 0, c1.uid);
ok('sacrificing a Clue succeeds', sac1);
ok('one Clue remains', clues(st, 0).length === 1, clues(st, 0).length);
const m = mechs(st, 0);
ok('a 1/1 Mech with Taunt was created', m.length === 1 && m[0].attack === 1 && E.hp(m[0]) === 1 && m[0].keywords.includes('taunt'), m.map(x => [x.attack, E.hp(x), x.keywords]));

// sacrifice the second Clue -> another Mech (each Clue sac triggers it)
st.players[0].mana.cur = 10;
const sac2 = E.sacrificeToken(st, 0, clues(st, 0)[0].uid);
ok('sacrificing the second Clue succeeds', sac2);
ok('a second Mech joins the board', mechs(st, 0).length === 2, mechs(st, 0).length);

// the trigger belongs to the satchel's controller: an enemy Clue sac makes no Mech for us
{
	const st2 = game();
	const a2 = E.instantiate(CARD, 0); a2.zone = 'hand'; st2.players[0].hand.push(a2);
	st2.players[0].mana.max = 10; st2.players[0].mana.cur = 10;
	E.playCard(st2, 0, a2.uid, null, null, 0);
	// give the OPPONENT a clue and have them sacrifice it on their turn
	E.execEffects(st2, 1, [{ type: 'investigate' }], null, null);
	st2.current = 1; st2.players[1].mana.max = 10; st2.players[1].mana.cur = 10;
	E.sacrificeToken(st2, 1, clues(st2, 1)[0].uid);
	ok('opponent sacrificing a Clue does NOT summon a Mech for the satchel owner', mechs(st2, 0).length === 0, mechs(st2, 0).length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
