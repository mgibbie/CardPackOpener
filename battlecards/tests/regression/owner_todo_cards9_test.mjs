// Ninth batch from the wiki's owner inbox (owner_todo), applied 2026-09-08.
//
//   Reito Sentinel -> battlecry should read "Battlecry: Target player mills 3";
//                     tribe should be "Mech Construct".
//
// This also fixes a latent bug: the old effect was an untargeted {mill} (which
// mills the CASTER) while the text claimed "The enemy mills three cards". The
// new {target-player, action:'mill'} shape mills the chosen opponent (auto in
// 1v1). The battlecry is FIRED and we assert the OPPONENT's deck shrinks by 3
// while the caster's own deck is untouched.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 13) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};

{
	const c = cardsById.reito_sentinel;
	ok('Reito Sentinel tribe is "Mech Construct"', c.tribe === 'Mech Construct', c.tribe);
	ok('reads "Defender.\\nBattlecry: Target player mills 3."',
		c.description === 'Defender.\nBattlecry: Target player mills 3.', JSON.stringify(c.description));
	ok('keeps defender + battlecry', ['defender', 'battlecry'].every(k => (c.keywords || []).includes(k)), JSON.stringify(c.keywords));
	ok('effect is a target-player mill 3', Array.isArray(c.effects) && c.effects[0]?.type === 'target-player'
		&& c.effects[0]?.action === 'mill' && c.effects[0]?.value === 3, JSON.stringify(c.effects));

	// FIRE the battlecry (1v1 -> auto-targets the sole opponent)
	const st = game();
	st.players[0].deck = ['a', 'b', 'c', 'd', 'e', 'f'];        // caster's own deck (should NOT shrink)
	st.players[1].deck = ['q', 'r', 's', 't', 'u', 'v', 'w'];   // opponent's deck (mills 3)
	const myBefore = st.players[0].deck.length, foeBefore = st.players[1].deck.length;
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, null, null, 0);
	ok('the opponent milled exactly 3', st.players[1].deck.length === foeBefore - 3, [foeBefore, st.players[1].deck.length]);
	ok('the caster\'s own deck was untouched (old self-mill bug fixed)', st.players[0].deck.length === myBefore, [myBefore, st.players[0].deck.length]);
	ok('Reito Sentinel is on the board with Defender', st.players[0].board.some(x => x.id === 'reito_sentinel' && (x.keywords || []).includes('defender')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
