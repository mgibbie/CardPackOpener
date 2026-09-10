// Escape from the Violet Hold spells — the last 14 HS constructed spells that
// had never been imported. Every card is PLAYED here and judged by what it did
// to the state, never by reading cards.json.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_vanilla = { id: 't_vanilla', name: 'Vanilla', type: 'creature', cost: 1, attack: 1, health: 1, description: 'test' };
cardsById.t_pirate = { id: 't_pirate', name: 'Test Pirate', type: 'creature', cost: 1, attack: 1, health: 1, tribe: 'Pirate', description: 'test' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 11, cls = 'warrior') => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2,
		[{ id: cls, name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; p.life = 30; }
	st.players[0].heroClass = cls;
	st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};
const give = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const cast = (st, id, target = null) => {
	const c = give(st, 0, id);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, c.uid, target, null, 0);
	return c;
};
const put = (st, pi, id, opts = {}) => {
	const c = E.instantiate(cardsById[id], pi);
	c.zone = 'board'; c.sick = false;
	if (opts.keywords) { c.keywords = [...opts.keywords]; c.stealthed = opts.keywords.includes('stealth'); }
	if (opts.attack != null) c.attack = opts.attack;
	st.players[pi].board.push(c);
	E.recomputeAuras(st);
	return c;
};
const count = (st, pi, name) => st.players[pi].board.filter(c => c.name === name).length;

for (const id of ['land_ho', 'hook_n_heave', 'follow_the_fuse', 'haunt', 'follow_the_ghosts', 'slime_em',
	'follow_the_footsteps', 'silent_strike', 'tricks_of_the_trade', 'follow_the_evidence', 'frame_job',
	'harsh_sentence', 'soul_immolation', 'desperate_bribe', 'cap_cannoneer', 'cap_spooky_ghost',
	'cap_impformant', 'collapsing_star'])
	ok(`${id} exists`, cardsById[id], id);

// --- Warrior: Land Ho! — draw 2, two Cannoneers ---------------------------
{
	const st = game();
	st.players[0].deck = ['t_vanilla', 't_vanilla', 't_vanilla'];
	const before = st.players[0].hand.length;
	cast(st, 'land_ho');
	ok('Land Ho! drew two cards', st.players[0].hand.length === before + 2, st.players[0].hand.length);
	ok('Land Ho! made two Cannoneers', count(st, 0, 'Cannoneer') === 2, count(st, 0, 'Cannoneer'));
}
// a Cannoneer pings a random enemy at end of turn
{
	const st = game();
	put(st, 0, 'cap_cannoneer');
	const foe = put(st, 1, 't_vanilla', { attack: 0 });
	const life = st.players[1].life;
	E.endTurn(st);
	ok('Cannoneer pinged an enemy at end of turn',
		st.players[1].life < life || foe.damage > 0 || foe.zone === 'gone', `${st.players[1].life} ${foe.damage}`);
}
// --- Warrior: Hook n' Heave — Discover a Pirate + two Cannoneers ----------
{
	const st = game();
	cast(st, 'hook_n_heave');
	ok('Hook n\' Heave opened a Discover', st.pickQueue.length === 1, st.pickQueue.length);
	const offered = st.pickQueue[0].ids.map(i => cardsById[i]);
	ok('every Discover option is a Pirate', offered.length > 0 && offered.every(d => (d.tribe || '').includes('Pirate')),
		offered.map(d => `${d.name}:${d.tribe}`).join(','));
	E.resolvePick(st, st.pickQueue[0].ids[0]);
	ok('Hook n\' Heave made two Cannoneers', count(st, 0, 'Cannoneer') === 2, count(st, 0, 'Cannoneer'));
}
// --- Warrior: Follow the Fuse — damage + the Pirate-only chain ------------
{
	const st = game();
	const foe = put(st, 1, 't_vanilla', { attack: 0 });
	const pirate = give(st, 0, 't_pirate');
	const plain = give(st, 0, 't_vanilla');
	const life = st.players[1].life;
	cast(st, 'follow_the_fuse');
	ok('Follow the Fuse dealt 2 to a random enemy',
		foe.damage === 2 || st.players[1].life === life - 2, `${foe.damage} ${st.players[1].life}`);
	ok('the mark went on the Pirate', pirate.followEcho === 'follow_the_fuse', pirate.followEcho);
	ok('the non-Pirate was never marked', !plain.followEcho, plain.followEcho);
	// playing the marked Pirate re-fires the spell AND passes the mark along
	const foe2 = put(st, 1, 't_vanilla', { attack: 0 });
	const life2 = st.players[1].life, dmg2 = foe.damage + foe2.damage;
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, pirate.uid, null, null, 0);
	ok('playing the marked Pirate re-fired the 2 damage',
		st.players[1].life < life2 || foe.damage + foe2.damage > dmg2, `${st.players[1].life} ${foe.damage + foe2.damage}`);
	ok('the mark was consumed by playing it', !pirate.followEcho, pirate.followEcho);
}
// the Follow mark only lasts the turn it was given
{
	const st = game();
	put(st, 1, 't_vanilla', { attack: 0 });
	const pirate = give(st, 0, 't_pirate');
	cast(st, 'follow_the_fuse');
	ok('marked before end of turn', pirate.followEcho === 'follow_the_fuse');
	E.endTurn(st);
	ok('the Follow mark is cleared at end of turn', !pirate.followEcho, pirate.followEcho);
}
// --- Priest: Haunt --------------------------------------------------------
{
	const st = game(11, 'priest');
	const m = put(st, 0, 't_vanilla');
	const a0 = m.attack, h0 = E.hp(m);
	cast(st, 'haunt', { type: 'creature', uid: m.uid, player: 0 });
	ok('Haunt gave +2 Attack', m.attack === a0 + 2, m.attack);
	ok('Haunt gave +3 Health', E.hp(m) === h0 + 3, E.hp(m));
	ok('Haunt granted Reborn', m.keywords.includes('reborn'), m.keywords.join(','));
	ok('Haunt granted Taunt', m.keywords.includes('taunt'), m.keywords.join(','));
}
// --- Priest: Follow the Ghosts -------------------------------------------
{
	const st = game(11, 'priest');
	const other = give(st, 0, 't_vanilla');
	cast(st, 'follow_the_ghosts');
	ok('Follow the Ghosts summoned a Spooky Ghost', count(st, 0, 'Spooky Ghost') === 1, count(st, 0, 'Spooky Ghost'));
	const ghost = st.players[0].board.find(c => c.name === 'Spooky Ghost');
	ok('the Ghost has Reborn', ghost && ghost.keywords.includes('reborn'), ghost && ghost.keywords.join(','));
	ok('a card in hand got the mark', other.followEcho === 'follow_the_ghosts', other.followEcho);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, other.uid, null, null, 0);
	ok('playing the marked card summoned a second Ghost', count(st, 0, 'Spooky Ghost') === 2, count(st, 0, 'Spooky Ghost'));
}
// --- Priest: Slime 'em! ---------------------------------------------------
{
	const st = game(11, 'priest');
	put(st, 0, 't_vanilla'); put(st, 0, 't_vanilla'); put(st, 1, 't_vanilla');
	const h1 = st.players[1].hand.length;
	cast(st, 'slime_em');
	ok('Slime \'em! destroyed every creature',
		st.players[0].board.filter(c => c.type === 'creature' && !E.isDead(c)).length === 0
		&& st.players[1].board.filter(c => c.type === 'creature' && !E.isDead(c)).length === 0,
		`${st.players[0].board.length}/${st.players[1].board.length}`);
	const mine = st.players[0].hand.find(c => c.name === 'Slimed');
	ok('you got a resummon spell', !!mine, st.players[0].hand.map(c => c.name).join(','));
	ok('the resummon spell costs (3)', mine && mine.cost === 3, mine && mine.cost);
	ok('the opponent got one too', st.players[1].hand.length === h1 + 1, st.players[1].hand.length);
	// and it actually brings your own board back
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, mine.uid, null, null, 0);
	ok('the resummon spell rebuilt your side', st.players[0].board.filter(c => !E.isDead(c)).length === 2,
		st.players[0].board.length);
}
// --- Rogue: Follow the Footsteps -----------------------------------------
{
	const st = game(11, 'rogue');
	cast(st, 'follow_the_footsteps');
	ok('Follow the Footsteps opened a Discover', st.pickQueue.length === 1, st.pickQueue.length);
	const offered = st.pickQueue[0].ids.map(i => cardsById[i]);
	ok('every option has Stealth', offered.length > 0 && offered.every(d => (d.keywords || []).includes('stealth')),
		offered.map(d => d.name).join(','));
	E.resolvePick(st, st.pickQueue[0].ids[0]);
	const got = st.players[0].hand[st.players[0].hand.length - 1];
	ok('the discovered card carries the mark', got && got.followEcho === 'follow_the_footsteps', got && got.followEcho);
}
// --- Rogue: Silent Strike -------------------------------------------------
{
	const st = game(11, 'rogue');
	const m = put(st, 0, 't_vanilla', { keywords: ['stealth'], attack: 2 });
	const foe = put(st, 1, 't_vanilla', { attack: 0 });
	cast(st, 'silent_strike', { type: 'creature', uid: m.uid, player: 0 });
	ok('Silent Strike gave +3 Attack', m.attack === 5, m.attack);
	ok('a Stealthed target shot an enemy creature for its Attack', foe.damage === 5 || E.isDead(foe), foe.damage);
}
{
	const st = game(11, 'rogue');
	const m = put(st, 0, 't_vanilla', { attack: 2 });        // NOT stealthed
	const foe = put(st, 1, 't_vanilla', { attack: 0 });
	cast(st, 'silent_strike', { type: 'creature', uid: m.uid, player: 0 });
	ok('an unstealthed target still gets +3 Attack', m.attack === 5, m.attack);
	ok('but deals no damage', foe.damage === 0, foe.damage);
}
// --- Rogue: Tricks of the Trade ------------------------------------------
{
	const st = game(11, 'rogue');
	const foe = put(st, 1, 't_vanilla', { attack: 0, health: 9 });
	cast(st, 'tricks_of_the_trade', { type: 'creature', uid: foe.uid, player: 1 });
	ok('unarmed Tricks deals 1', foe.damage === 1, foe.damage);
}
{
	const st = game(11, 'rogue');
	const foe = put(st, 1, 't_vanilla', { attack: 0, health: 9 });
	const trick = give(st, 0, 'tricks_of_the_trade');
	const sneak = put(st, 0, 't_vanilla', { keywords: ['stealth'], attack: 1 });
	E.attack(st, 0, sneak.uid, { type: 'hero', player: 1 });
	ok('a Stealthed attack armed the held card', trick.stealthAttackedWhileHeld === 1, trick.stealthAttackedWhileHeld);
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, trick.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('armed Tricks deals 3 instead', foe.damage === 3, foe.damage);
}
// --- Warlock: Follow the Evidence + the Imp-formant -----------------------
{
	const st = game(11, 'warlock');
	const other = give(st, 0, 't_vanilla');
	cast(st, 'follow_the_evidence');
	ok('an Imp-formant went into the opponent deck', st.players[1].deck.filter(i => i === 'cap_impformant').length === 1,
		st.players[1].deck.join(','));
	ok('a card in hand got the mark', other.followEcho === 'follow_the_evidence', other.followEcho);
	// when the OPPONENT draws it, it summons for YOU
	st.players[1].deck = ['cap_impformant'];
	E.drawCards(st, 1, 1);
	ok('the drawn Imp-formant summoned for its Warlock, not the drawer',
		count(st, 0, 'Imp-formant') === 1 && count(st, 1, 'Imp-formant') === 0,
		`${count(st, 0, 'Imp-formant')}/${count(st, 1, 'Imp-formant')}`);
	const imp = st.players[0].board.find(c => c.name === 'Imp-formant');
	ok('the Imp-formant has Lifesteal', imp && imp.keywords.includes('lifesteal'), imp && imp.keywords.join(','));
}
// --- Warlock: Harsh Sentence ---------------------------------------------
{
	const st = game(11, 'warlock');
	cast(st, 'harsh_sentence');
	ok('two Imp-formants went into the opponent deck',
		st.players[1].deck.filter(i => i === 'cap_impformant').length === 2, st.players[1].deck.join(','));
	ok('the opponent creature tax is armed for next turn',
		st.players[1].enemyMinionTaxAmount === 2 && st.players[1].enemyMinionTaxTurn === st.turnNumber + 1,
		`${st.players[1].enemyMinionTaxAmount}@${st.players[1].enemyMinionTaxTurn}`);
	// and it really bites: a creature costs (2) more on their turn
	E.endTurn(st);
	const c = E.instantiate(cardsById.t_vanilla, 1); c.zone = 'hand'; st.players[1].hand.push(c);
	ok('their creature costs (2) more', E.effectiveCost(st, 1, c) === (cardsById.t_vanilla.cost || 0) + 2,
		E.effectiveCost(st, 1, c));
}
// --- Warlock: Frame Job ---------------------------------------------------
{
	const st = game(11, 'warlock');
	const a = put(st, 1, 't_vanilla'), b = put(st, 1, 't_vanilla');
	st.players[1].deck = ['t_vanilla', 't_pirate', 'cap_cannoneer', 'relic_miner'];
	cast(st, 'frame_job');
	ok('Frame Job destroyed two enemy creatures',
		[a, b].every(c => E.isDead(c) || c.zone === 'gone'), `${a.zone}/${b.zone}`);
	ok('Frame Job opened a Discover on the enemy deck', st.pickQueue.length === 1, st.pickQueue.length);
	const chosen = st.pickQueue[0].ids[1] ?? st.pickQueue[0].ids[0];
	const handBefore = st.players[0].hand.length;
	E.resolvePick(st, chosen);
	ok('the pick was moved to the top of their deck (deck.pop draws)',
		st.players[1].deck[st.players[1].deck.length - 1] === chosen, st.players[1].deck.join(','));
	ok('the pick did NOT join your hand', st.players[0].hand.length === handBefore, st.players[0].hand.length);
}
// --- Demon Hunter: Soul Immolation ---------------------------------------
{
	const st = game(11, 'demonhunter');
	const before = st.players[0].heroPowers.length;
	cast(st, 'soul_immolation');
	const power = st.players[0].heroPowers.find(h => h.id === 'collapsing_star');
	ok('Soul Immolation added Collapsing Star', !!power && st.players[0].heroPowers.length === before + 1,
		st.players[0].heroPowers.map(h => h.id).join(','));
	const dmg = () => (power.power.effects.find(e => e.type === 'random-damage') || {}).value;
	ok('Collapsing Star starts at 1 damage', dmg() === 1, dmg());
	cast(st, 'soul_immolation');
	ok('a second cast sharpened it to 2 instead of adding a copy',
		dmg() === 2 && st.players[0].heroPowers.filter(h => h.id === 'collapsing_star').length === 1, dmg());
	// the sharpening must NOT leak into the shared card def (instantiate shares power by ref)
	const fresh = game(11, 'demonhunter');
	cast(fresh, 'soul_immolation');
	const fp = fresh.players[0].heroPowers.find(h => h.id === 'collapsing_star');
	ok('a later game still starts Collapsing Star at 1',
		(fp.power.effects.find(e => e.type === 'random-damage') || {}).value === 1,
		(fp.power.effects.find(e => e.type === 'random-damage') || {}).value);
	// summoning a Demon refreshes it
	power.usedThisTurn = true;
	E.summon(st, 0, cardsById.cap_impformant);   // a Demon
	ok('summoning a Demon refreshed Collapsing Star', power.usedThisTurn === false, power.usedThisTurn);
}
// --- Shaman: Desperate Bribe ---------------------------------------------
{
	const st = game(11, 'shaman');
	cast(st, 'desperate_bribe');
	ok('the opponent got two creatures', st.players[1].board.filter(c => !E.isDead(c)).length === 2,
		st.players[1].board.length);
	ok('their creatures cost (2)', st.players[1].board.every(c => (c.cost || 0) === 2),
		st.players[1].board.map(c => c.cost).join(','));
	ok('you got two creatures too', st.players[0].board.filter(c => !E.isDead(c)).length === 2,
		st.players[0].board.length);
	ok('but yours were upgraded a rung, to (3)', st.players[0].board.every(c => (c.cost || 0) === 3),
		st.players[0].board.map(c => c.cost).join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
