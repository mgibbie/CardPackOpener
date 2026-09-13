// Forty-ninth batch from the wiki's owner inbox (owner_todo), 2026-09-13.
//   wastes_ornithopter      -> retribe Thopter -> Mech; lord aura now "Your other
//                              Mechs have +1 Attack." (keeps Elusive)
//   wastes_lightning_greaves -> Sorcery -> Equipment (artifact + equip payload)
//                              granting Rush; Equip (0)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.graveyard = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};
const mk = (st, pi, tribe, atk = 2, hp = 2) => { const c = E.instantiate({ id: 't_' + tribe + atk + hp, name: 'T', type: 'creature', cost: 2, attack: atk, health: hp, tribe }, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };

// ---------- Ornithopter: Mech lord ----------
{
	const def = cardsById.wastes_ornithopter;
	ok('Ornithopter tribe is Mech', def.tribe === 'Mech', def.tribe);
	ok('Ornithopter text reads "Elusive.\\nYour other Mechs have +1 Attack."', def.description === 'Elusive.\nYour other Mechs have +1 Attack.', JSON.stringify(def.description));
	ok('Ornithopter keeps Elusive', (def.keywords || []).includes('elusive'), JSON.stringify(def.keywords));
	ok('Ornithopter aura targets other Mechs +1 Attack', def.aura && def.aura.tribe === 'Mech' && def.aura.attack === 1 && def.aura.others === true, JSON.stringify(def.aura));

	const st = game(1);
	const otherMech = mk(st, 0, 'Mech', 2, 2);
	const beast = mk(st, 0, 'Beast', 2, 2);
	const orn = E.instantiate(def, 0); orn.zone = 'board'; orn.sick = false; st.players[0].board.push(orn);
	E.recomputeAuras(st);
	ok('another friendly Mech gets +1 Attack (2 -> 3)', otherMech.attack === 3, otherMech.attack);
	ok('a non-Mech is unaffected (2)', beast.attack === 2, beast.attack);
	ok('Ornithopter does not buff itself (others: true)', orn.attack === 0, orn.attack);
}

// ---------- Lightning Greaves: Equipment granting Rush ----------
{
	const def = cardsById.wastes_lightning_greaves;
	ok('Lightning Greaves is an artifact (Equipment), not a sorcery', def.type === 'artifact', def.type);
	ok('Lightning Greaves has an equip payload granting Rush', def.equip && (def.equip.keywords || []).includes('rush'), JSON.stringify(def.equip));
	ok('Lightning Greaves equips for 0', def.equip && def.equip.cost === 0, def.equip && def.equip.cost);
	ok('Lightning Greaves has no leftover spell effects', def.effects === undefined, JSON.stringify(def.effects));
	ok('Lightning Greaves text is the Equipment format', def.description === 'Equipped creature has Rush.\nEquip (0).', JSON.stringify(def.description));

	// FIRE: play it (-> artifact zone), then equip a creature -> it gains Rush
	const st = game(2);
	const cr = mk(st, 0, 'Beast', 3, 3);
	const g = E.instantiate(def, 0); g.zone = 'hand'; st.players[0].hand.push(g);
	E.playCard(st, 0, g.uid, null, null, 0);
	const inPlay = st.players[0].artifacts.find(a => a.id === 'wastes_lightning_greaves');
	ok('played into the artifact zone', !!inPlay, st.players[0].artifacts.map(a => a.id));
	ok('it can be equipped', inPlay && E.canEquip(st, 0, inPlay.uid), inPlay && inPlay.uid);
	const okEquip = E.equip(st, 0, inPlay.uid, cr.uid); E.recomputeAuras(st);
	ok('equip succeeds and attaches to the creature', okEquip && inPlay.attachedTo === cr.uid, [okEquip, inPlay.attachedTo, cr.uid]);
	ok('the equipped creature gains Rush', (cr.keywords || []).includes('rush'), JSON.stringify(cr.keywords));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
