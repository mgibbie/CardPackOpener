// Holy Avenger (paper, Artifact — Equipment, 3): Equipped creature has +3/+3
// & Taunt. Equip (1). Reuses the engine's MTG equipment system (p.artifacts +
// equip()); the key behaviour the user asked for is that when the equipped
// creature dies, the equipment DETACHES and stays in the artifacts zone so it
// can be re-equipped (death.js clears attachedTo).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const CARD = cardsById['holy_avenger'];
ok('card face: Equipment with +3/+3 & Taunt, Equip (1)',
	CARD && CARD.type === 'artifact' && CARD.cost === 3 && CARD.cardClass === 'neutral' && CARD.rarity === 'uncommon'
	&& CARD.equip && CARD.equip.cost === 1 && CARD.equip.attack === 3 && CARD.equip.health === 3 && (CARD.equip.keywords || []).includes('taunt'),
	CARD && CARD.equip);

function game() {
	const st = E.createGame(cardsById, seededRng(4), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0;
	return st;
}
const putCreature = (st, pi, id) => {
	const c = E.instantiate({ id, name: id, type: 'creature', cost: 1, rarity: 'basic', attack: 1, health: 2 }, pi);
	c.zone = 'board'; c.summonedThisTurn = false; st.players[pi].board.push(c); return c;
};

// full lifecycle: play -> equip -> holder dies (detach) -> re-equip elsewhere
{
	const st = game();
	const a = putCreature(st, 0, 'creaA');
	// play the artifact from hand -> it enters the artifacts zone
	const art = E.instantiate(CARD, 0); art.zone = 'hand'; st.players[0].hand.push(art);
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	const played = E.playCard(st, 0, art.uid, null, null, 0);
	ok('artifact plays into the artifacts zone', played && st.players[0].artifacts.some(x => x.uid === art.uid) && art.zone === 'artifact', [played, art.zone]);

	// equip to creature A
	const eq1 = E.equip(st, 0, art.uid, a.uid);
	ok('equip attaches to creature A', eq1 && art.attachedTo === a.uid, [eq1, art.attachedTo]);
	ok('A gains +3/+3 & Taunt while equipped', a.attack === 4 && E.hp(a) === 5 && a.keywords.includes('taunt'), [a.attack, E.hp(a), a.keywords]);

	// creature A dies
	a.damage = a.maxHealth; a.shield = false; E.sweepDeaths(st);
	ok('A is dead and off the board', !st.players[0].board.some(c => c.uid === a.uid));
	ok('equipment RETURNS to the artifacts zone on death (attachedTo cleared, still present)',
		st.players[0].artifacts.some(x => x.uid === art.uid) && art.attachedTo == null,
		[art.attachedTo, st.players[0].artifacts.map(x => x.name)]);

	// re-equip to a fresh creature B
	const bmon = putCreature(st, 0, 'creaB');
	st.players[0].mana.cur = 10;
	const eq2 = E.equip(st, 0, art.uid, bmon.uid);
	ok('re-equip the detached equipment onto creature B', eq2 && art.attachedTo === bmon.uid, [eq2, art.attachedTo]);
	ok('B gains +3/+3 & Taunt; the old (dead) holder is gone', bmon.attack === 4 && E.hp(bmon) === 5 && bmon.keywords.includes('taunt'), [bmon.attack, E.hp(bmon), bmon.keywords]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
