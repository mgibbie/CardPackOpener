// Magnetic keyword: a Magnetic creature dropped onto a friendly Mech merges its stats
// and text onto that Mech instead of entering play. Regression coverage for:
//   - 6 minions that named "Magnetic" in their text but were missing the `magnetic` flag
//   - `magnetizeTribes`: cards that "can Magnetize to <tribe> as well as Mechs"
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
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

// ---------- generated Magnetic tokens are actually Magnetic ----------
// drone_deconstructor (1/2 Mech): Battlecry adds the real ttn_sparkbot token (magnetic)
{
	const st = game();
	const dd = toHand(st, 0, 'drone_deconstructor');
	E.playCard(st, 0, dd.uid);
	const spark = st.players[0].hand.find(c => c.id === 'ttn_sparkbot');
	ok('drone_deconstructor generates a Sparkbot', !!spark);
	ok('its Sparkbot has the magnetic flag', spark?.magnetic === true);
	const mech = putMon(st, 0, { attack: 2, health: 6, tribe: 'Mech' });
	const before = st.players[0].board.length;
	magnetizeOnto(st, 0, spark, mech);
	ok('its Sparkbot merges onto a Mech', st.players[0].board.length === before && mech.attack === 3);
}
// from_the_scrapheap: add-token with count:3 and keywords:['magnetic'] (the flag must be set)
{
	const st = game();
	const scrap = toHand(st, 0, 'from_the_scrapheap');
	E.playCard(st, 0, scrap.uid);
	const sparks = st.players[0].hand.filter(c => /sparkbot/i.test(c.name));
	ok('from_the_scrapheap generates THREE tokens (count honored)', sparks.length === 3);
	ok('all three are magnetic', sparks.length === 3 && sparks.every(c => c.magnetic === true));
	ok("'magnetic' is not left as a bogus keyword", sparks.every(c => !c.keywords.includes('magnetic')));
	const mech = putMon(st, 0, { attack: 2, health: 6, tribe: 'Mech' });
	const before = st.players[0].board.length;
	const sparkAtk = sparks[0].attack; // from_the_scrapheap's withGift can raise it above the base 1
	magnetizeOnto(st, 0, sparks[0], mech);
	ok('a generated Sparkbot merges onto a Mech', st.players[0].board.length === before && mech.attack === 2 + sparkAtk);
}
// the_badlands_bandits: count:8 must produce eight tokens (was dropping to one)
{
	const st = game();
	const bb = toHand(st, 0, 'the_badlands_bandits');
	E.playCard(st, 0, bb.uid);
	ok('the_badlands_bandits generates EIGHT tokens', st.players[0].hand.filter(c => /bandit/i.test(c.name)).length === 8);
}

// ---------- the AI magnetizes onto its own Mechs ----------
const runAI = st => { for (let i = 0; i < 10 && st.current === 0 && st.players[0].hand.length; i++) AI.step(st, 0); };

// Cap mana just above the card cost so the AI doesn't spend the scenario ramping (with
// LAND_COST+3 spare mana and no lands it would develop basics instead of casting) — this
// isolates the magnetize/body DECISION, which is what these three cases exercise.
const noRampMana = st => { st.players[0].mana.cur = st.players[0].mana.max = 5; };

// value case: a keyword-granting magnetic minion fuses onto the AI's Mech
{
	const st = game(); noRampMana(st);
	const mech = putMon(st, 0, { attack: 3, health: 4, tribe: 'Mech' }); mech.sick = true;
	toHand(st, 0, 'annoy_o_module'); // magnetic: divine_shield + taunt
	runAI(st);
	ok('AI magnetized a keyword minion (board stayed 1)', st.players[0].board.length === 1);
	ok('AI Mech gained the merged attack', st.players[0].board[0].attack === 3 + cardsById.annoy_o_module.attack);
	ok('AI Mech gained Divine Shield', st.players[0].board[0].shield === true);
}

// body case: a vanilla stat-stick (no keyword) onto an unshielded Mech → develop a second body
{
	const st = game(); noRampMana(st);
	cardsById._mag_vanilla = { id: '_mag_vanilla', name: 'Vanilla Bot', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Mech', magnetic: true, rarity: 'common', description: 'test' };
	const mech = putMon(st, 0, { attack: 2, health: 2, tribe: 'Mech' }); mech.sick = true;
	toHand(st, 0, '_mag_vanilla');
	runAI(st);
	ok('AI played a vanilla magnetic as a body (board grew to 2)', st.players[0].board.length === 2);
}

// no target: no friendly Mech → plays as a normal body
{
	const st = game(); noRampMana(st);
	const beast = putMon(st, 0, { attack: 2, health: 2, tribe: 'Beast' }); beast.sick = true;
	toHand(st, 0, 'skaterbot');
	runAI(st);
	ok('AI played magnetic as a body with no Mech (board grew to 2)', st.players[0].board.length === 2);
}

console.log(`${pass}/${pass + fail} magnetic checks passed`);
process.exit(fail ? 1 : 0);
