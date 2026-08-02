// Detective's Satchel (paper, Artifact, 4): Battlecry: Investigate twice.
// {T}: If you've sacrificed a Clue this turn, create a 1/1 Mech with Taunt.
// This exercises the real artifact tap ability (canTapArtifact / tapArtifact):
// it is gated on having sacrificed a Clue this turn, taps once, and untaps at
// the owner's next turn.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const CARD = cardsById['detectives_satchel'];
ok('card face: artifact, cost 4, 2x investigate on play, {T} ability gated on clue sac',
	CARD && CARD.type === 'artifact' && CARD.cost === 4 && CARD.effects.length === 2 && CARD.effects.every(e => e.type === 'investigate')
	&& CARD.tapAbility && CARD.tapAbility.condition.sacrificedThisTurn === 'clue_token' && !CARD.ongoing,
	CARD && CARD.tapAbility);

const game = () => {
	const st = E.createGame(cardsById, seededRng(6), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0; return st;
};
const clues = (st, pi) => st.players[pi].artifacts.filter(a => a.id === 'clue_token');
const mechs = (st, pi) => st.players[pi].board.filter(c => (c.tribe || '').includes('Mech'));

const st = game();
const art = E.instantiate(CARD, 0); art.zone = 'hand'; st.players[0].hand.push(art);
st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
E.playCard(st, 0, art.uid, null, null, 0);
const satchel = st.players[0].artifacts.find(a => a.id === 'detectives_satchel');

ok('Battlecry: Investigate twice -> two Clue tokens', clues(st, 0).length === 2, clues(st, 0).length);
ok('the satchel enters untapped', satchel && satchel.tapped === false, satchel && satchel.tapped);
ok('CANNOT tap yet (no Clue sacrificed this turn)', E.canTapArtifact(st, 0, satchel.uid) === false);
ok('tapping now is a no-op (condition unmet)', E.tapArtifact(st, 0, satchel.uid, null) === false && mechs(st, 0).length === 0);

// sacrifice a Clue -> now the tap is enabled
st.players[0].mana.cur = 10;
E.sacrificeToken(st, 0, clues(st, 0)[0].uid);
ok('after sacrificing a Clue, the tap ability is available', E.canTapArtifact(st, 0, satchel.uid) === true);

// tap it -> a 1/1 Mech with Taunt; the artifact is now tapped
const tapped = E.tapArtifact(st, 0, satchel.uid, null);
const m = mechs(st, 0);
ok('tap creates a 1/1 Mech with Taunt', tapped && m.length === 1 && m[0].attack === 1 && E.hp(m[0]) === 1 && m[0].keywords.includes('taunt'), m.map(x => [x.attack, E.hp(x), x.keywords]));
ok('the satchel is now tapped', satchel.tapped === true);
ok('CANNOT tap again this turn (already tapped)', E.canTapArtifact(st, 0, satchel.uid) === false);

// a second Clue sac does not sneak in a second Mech while tapped
st.players[0].mana.cur = 10;
E.sacrificeToken(st, 0, clues(st, 0)[0].uid);
ok('still tapped -> no second Mech this turn', mechs(st, 0).length === 1, mechs(st, 0).length);

// end your turn and come back around: the satchel untaps, the tracker resets
E.endTurn(st);            // -> opponent's turn
E.endTurn(st);            // -> back to player 0 (start-of-turn untaps artifacts)
ok('the satchel untaps at your next turn', satchel.tapped === false);
ok('the "sacrificed a Clue this turn" tracker reset -> tap gated again', E.canTapArtifact(st, 0, satchel.uid) === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
