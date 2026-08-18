// Magnetic keyword: a Magnetic creature dropped onto a friendly Mech merges its stats
// and text onto that Mech instead of entering play. Regression coverage for:
//   - 6 minions that named "Magnetic" in their text but were missing the `magnetic` flag
//   - `magnetizeTribes`: cards that "can Magnetize to <tribe> as well as Mechs"
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(cardsById, seededRng(7), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.life = 30; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const toHand = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
// a bare board creature of the given stats/tribe (so tests don't depend on a specific card)
const putMon = (st, pi, { attack = 2, health = 5, tribe = 'Mech' }) => {
	const c = E.instantiate({ id: '_t_mon', name: 'T', type: 'creature', cost: 1, attack, health, tribe, rarity: 'common' }, pi);
	c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c;
};
const magnetizeOnto = (st, pi, handCard, mech) =>
	E.playCard(st, pi, handCard.uid, { type: 'creature', uid: mech.uid, player: pi });

// ---------- data sanity ----------
for (const id of ['skaterbot', 'treetech_jungledrone', 'dinotomaton', 'gogogo_goram', 'diving_rig', 'furious_furnace'])
	ok(`${id} has magnetic flag`, cardsById[id]?.magnetic === true);
ok('diving_rig magnetizes to Pirate', JSON.stringify(cardsById.diving_rig?.magnetizeTribes) === JSON.stringify(['Mech', 'Pirate']));
ok('prosthetic_hand magnetizes to Undead', cardsById.prosthetic_hand?.magnetizeTribes?.includes('Undead'));
ok('windsoul_automaton magnetizes to Totem', cardsById.windsoul_automaton?.magnetizeTribes?.includes('Totem'));
ok('absorbent_parasite magnetizes to Beast', cardsById.absorbent_parasite?.magnetizeTribes?.includes('Beast'));

// ---------- merge onto a Mech (stats + keyword transfer) ----------
{
	const st = game();
	const mech = putMon(st, 0, { attack: 2, health: 5, tribe: 'Mech' });
	const sk = toHand(st, 0, 'skaterbot'); // Mech, Rush, now magnetic
	const before = st.players[0].board.length;
	magnetizeOnto(st, 0, sk, mech);
	ok('skaterbot merged (board size unchanged)', st.players[0].board.length === before);
	ok('mech gained skaterbot attack', mech.attack === 2 + cardsById.skaterbot.attack);
	ok('mech gained Rush from skaterbot', mech.keywords.includes('rush'));
	ok('skaterbot left hand', !st.players[0].hand.some(c => c.uid === sk.uid));
}

// ---------- magnetic onto a NON-Mech friendly: plays as a normal minion ----------
{
	const st = game();
	const beast = putMon(st, 0, { attack: 2, health: 3, tribe: 'Beast' });
	const sk = toHand(st, 0, 'skaterbot');
	magnetizeOnto(st, 0, sk, beast);
	ok('skaterbot did NOT merge onto a Beast (default Mech-only)', st.players[0].board.length === 2);
	ok('beast unchanged', beast.attack === 2);
}

// ---------- magnetizeTribes: diving_rig merges onto a Pirate AND a Mech ----------
{
	const st = game();
	const pirate = putMon(st, 0, { attack: 1, health: 6, tribe: 'Pirate' });
	const rig = toHand(st, 0, 'diving_rig');
	magnetizeOnto(st, 0, rig, pirate);
	ok('diving_rig merged onto a Pirate', st.players[0].board.length === 1 && pirate.attack === 1 + cardsById.diving_rig.attack);
}
{
	const st = game();
	const mech = putMon(st, 0, { attack: 1, health: 6, tribe: 'Mech' });
	const rig = toHand(st, 0, 'diving_rig');
	magnetizeOnto(st, 0, rig, mech);
	ok('diving_rig still merges onto a Mech', st.players[0].board.length === 1 && mech.attack === 1 + cardsById.diving_rig.attack);
}

// ---------- a default-tribe magnetic card does NOT merge onto a Pirate ----------
{
	const st = game();
	const pirate = putMon(st, 0, { attack: 1, health: 6, tribe: 'Pirate' });
	const mod = toHand(st, 0, 'annoy_o_module'); // Mech, magnetic, no magnetizeTribes
	magnetizeOnto(st, 0, mod, pirate);
	ok('annoy_o_module did NOT merge onto a Pirate', st.players[0].board.length === 2);
}

console.log(`${pass}/${pass + fail} magnetic checks passed`);
process.exit(fail ? 1 : 0);
