// Targeted artifact/enchantment destruction — the "make Naturalize work"
// follow-up to owner to-do batch 3.
//
// destroy-art-ench (14 cards) picks at RANDOM from a scope because it predates
// permanent targeting. But the targeting service already grew a 'permanent'
// kind for bounce (Kor Skyfisher / Boomerang / Into the Roil): legalTargets
// enumerates artifacts, enchantments and walkers, and the board UI already
// lights any legal permanent for a pending spell. So this adds only the destroy
// half — a 'destroy-permanent' effect plus a filter narrowing 'permanent' to
// the two zones — and points Naturalize and Nature's Claim at it.
//
// What matters here: a creature must never be offered as a Naturalize target,
// the spell must be UNPLAYABLE with nothing to hit (MTG's rule, and what
// canPlay already does for a required target), and the AI must be able to
// pick a target without any special-casing.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 4, players = 2) => {
	const heroes = Array.from({ length: players }, (_, i) => ({ id: 'mage', name: 'P' + i, power: null }));
	const st = E.createGame(cardsById, seededRng(seed), null, players, heroes);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const ART = { id: 't_art', name: 'Test Artifact', type: 'artifact', cost: 2 };
const ENCH = { id: 't_ench', name: 'Test Enchantment', type: 'enchantment', cost: 2 };
const DUDE = { id: 't_dude', name: 'Dude', type: 'creature', cost: 2, attack: 2, health: 3 };
const put = (st, pi, def, zone) => { const c = E.instantiate(def, pi); st.players[pi][zone].push(c); return c; };
const inHand = (st, id) => { const c = E.instantiate(cardsById[id], 0); c.zone = 'hand'; st.players[0].hand.push(c); return c; };

// ---------- card data ----------
for (const id of ['naturalize', 'natures_claim']) {
	const c = cardsById[id];
	const fx = (c.effects || [])[0];
	ok(`${id} uses targeted destruction`, fx?.type === 'destroy-permanent' && fx.target === 'artifact-or-enchantment', JSON.stringify(c.effects));
	ok(`${id} says "target"`, /Destroy target artifact or enchantment\./.test(c.description), c.description);
}
ok("Nature's Claim still heals the controller", cardsById.natures_claim.effects[0].healOwner === 4);

// ---------- what is offered as a target ----------
{
	const st = game();
	const art = put(st, 1, ART, 'artifacts');
	const ench = put(st, 0, ENCH, 'enchantments');
	const mine = put(st, 0, DUDE, 'board');
	const theirs = put(st, 1, DUDE, 'board');
	const nat = inHand(st, 'naturalize');
	const spec = E.targetSpec(st, 0, nat);
	ok('Naturalize needs a target', !!spec && spec.required === true, JSON.stringify(spec && { t: spec.targets, r: spec.required }));
	ok('and describes it', spec.why === 'an artifact or enchantment', spec.why);
	const legal = E.legalTargets(st, 0, spec);
	const uids = legal.map(t => t.uid);
	ok('an enemy artifact is targetable', uids.includes(art.uid));
	ok('your own enchantment is targetable too', uids.includes(ench.uid), 'MTG: "target", not "target enemy"');
	ok('creatures are NOT offered', !uids.includes(mine.uid) && !uids.includes(theirs.uid),
		legal.map(t => t.type).join(','));
	ok('every offer is an artifact or enchantment',
		legal.every(t => t.type === 'artifact' || t.type === 'enchantment'), legal.map(t => t.type).join(','));
}

// ---------- it destroys what you picked ----------
{
	const st = game();
	const a1 = put(st, 1, ART, 'artifacts');
	const a2 = put(st, 1, ART, 'artifacts');
	const nat = inHand(st, 'naturalize');
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, nat.uid, { type: 'artifact', uid: a2.uid, player: 1 }, null, 0);
	const left = st.players[1].artifacts.map(c => c.uid);
	ok('the CHOSEN artifact died', !left.includes(a2.uid), JSON.stringify(left));
	ok('the other one survived — not random any more', left.includes(a1.uid), JSON.stringify(left));
}

// ---------- Nature's Claim heals whoever owned it ----------
{
	const st = game(6, 3);
	const mineArt = put(st, 0, ART, 'artifacts');
	put(st, 2, ART, 'artifacts');
	const life = st.players.map(p => p.life);
	const nc = inHand(st, 'natures_claim');
	// deliberately blow up your OWN artifact: that is the MTG use of this card
	E.playCard(st, 0, nc.uid, { type: 'artifact', uid: mineArt.uid, player: 0 }, null, 0);
	ok('your own artifact was destroyed', st.players[0].artifacts.length === 0);
	ok('YOU gained the 4 Life', st.players[0].life === life[0] + 4, `${life[0]} -> ${st.players[0].life}`);
	ok('no opponent gained life', st.players[1].life === life[1] && st.players[2].life === life[2],
		`${st.players[1].life}/${st.players[2].life}`);
}

// ---------- unplayable with nothing to destroy ----------
{
	const st = game();
	put(st, 1, DUDE, 'board'); // a creature is not a legal target
	const nat = inHand(st, 'naturalize');
	st.players[0].mana.cur = 10;
	ok('Naturalize is unplayable with no artifact or enchantment in play',
		E.canPlay(st, 0, nat) === false);
	put(st, 1, ENCH, 'enchantments');
	ok('and becomes playable once one exists', E.canPlay(st, 0, nat) === true);
}

// ---------- the AI can use it ----------
{
	const st = game(8);
	put(st, 1, ART, 'artifacts');
	const nat = inHand(st, 'naturalize');
	const spec = E.targetSpec(st, 0, nat);
	const legal = E.legalTargets(st, 0, spec);
	ok('the AI has a legal target to choose from (no special-casing needed)', legal.length === 1, String(legal.length));
}

// ---------- the sweep: the rest of the artifact removal ----------
// Nine more cards carried the house workaround wording ("an ENEMY artifact or
// enchantment") only because targeting was impossible. Three did not, and stay
// random: Abzan Advantage says "random" in its own text, Return to Dust hits
// up to TWO (the engine targets one), and Pulverize hits ALL artifacts.
{
	const SWEPT = ['disenchant', 'kor_sanctifiers', 'fragmentize', 'smash_to_smithereens',
		'shatter', 'smelt', 'reclamation_sage', 'slice_in_twain', 'revoke_existence'];
	for (const id of SWEPT) {
		const c = cardsById[id];
		const fx = (c.effects || []).find(e => e.type === 'destroy-permanent');
		ok(`${id} targets`, !!fx, JSON.stringify(c.effects));
		ok(`${id} says "target"`, /\btarget\b/.test(c.description), c.description);
		ok(`${id} no longer says "enemy"`, !/an enemy artifact|an enemy enchantment/.test(c.description), c.description);
	}
	const stillRandom = raw.cards.filter(c => JSON.stringify(c.effects || []).includes('destroy-art-ench'));
	ok('exactly three stay random by design', stillRandom.length === 3, stillRandom.map(c => c.id).join(','));
	ok('and they are the right three',
		['abzan_advantage', 'pulverize', 'return_to_dust'].every(id => stillRandom.some(c => c.id === id)),
		stillRandom.map(c => c.id).join(','));
}

// Shatter is artifact-only: an enchantment must not be offered
{
	const st = game();
	const art = put(st, 1, ART, 'artifacts');
	put(st, 1, ENCH, 'enchantments');
	const sh = inHand(st, 'shatter');
	const spec = E.targetSpec(st, 0, sh);
	ok('Shatter asks for an artifact', spec.why === 'an artifact', spec.why);
	const legal = E.legalTargets(st, 0, spec);
	ok('and only the artifact is legal', legal.length === 1 && legal[0].uid === art.uid,
		legal.map(t => t.type).join(','));
}

// Revoke Existence exiles rather than destroys
{
	const st = game();
	const art = put(st, 1, ART, 'artifacts');
	const re = inHand(st, 'revoke_existence');
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, re.uid, { type: 'artifact', uid: art.uid, player: 1 }, null, 0);
	ok('the artifact left play', st.players[1].artifacts.length === 0);
	ok('it went to exile, not the graveyard',
		st.players[1].exile.some(c => c.uid === art.uid) && !st.players[1].graveyard.some(c => c.uid === art.uid),
		`exile ${st.players[1].exile.length} / grave ${st.players[1].graveyard.length}`);
}

// riders still fire alongside the targeted destroy
{
	const st = game();
	const art = put(st, 1, ART, 'artifacts');
	st.players[0].deck = ['naturalize', 'naturalize'];
	const sl = inHand(st, 'slice_in_twain');
	const handBefore = st.players[0].hand.length;   // counted WITH the spell still in hand
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, sl.uid, { type: 'artifact', uid: art.uid, player: 1 }, null, 0);
	ok('Slice in Twain destroyed the artifact', st.players[1].artifacts.length === 0);
	// the spell leaves hand and the draw replaces it, so the count holds steady
	ok('and still drew a card', st.players[0].hand.length === handBefore,
		`${handBefore} -> ${st.players[0].hand.length}`);
	ok('the drawn card is the one from the deck', st.players[0].hand.some(c => c.id === 'naturalize'),
		st.players[0].hand.map(c => c.id).join(','));
}

// a Battlecry creature may be played with nothing to destroy (it just fizzles)
{
	const st = game();
	const sage = inHand(st, 'reclamation_sage');
	st.players[0].mana.cur = 10;
	const spec = E.targetSpec(st, 0, sage);
	ok('Reclamation Sage\'s target is optional', spec && spec.required === false, JSON.stringify(spec && spec.required));
	ok('so it is playable with no artifact in play', E.canPlay(st, 0, sage) === true);
	E.playCard(st, 0, sage.uid, null, null, 0);
	ok('and it resolves onto the board', st.players[0].board.some(c => c.id === 'reclamation_sage'),
		st.players[0].board.map(c => c.id).join(','));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
