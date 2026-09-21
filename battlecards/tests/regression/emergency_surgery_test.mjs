// emergency_surgery_test.mjs — "tokens that attack it" must actually attack it,
// and must not be stuck afterwards.
//
// Reported: "Emergency Surgery tokens are attack-locked. Its 3/1 tokens could
// attack only the creature designated by the spell. After that creature died,
// the tokens could not attack face or another creature, stranding 9 damage."
//
// The card reads: "Choose a creature an opponent controls. Create three 3/1
// Undead creature tokens with Lifesteal that attack it."
//
// WHAT WAS ACTUALLY WRONG. The card shipped as a plain `summon` with the entire
// clause stuffed into the token's NAME — "Undead with Lifesteal that attack it" —
// so it had no targeting, no Lifesteal and no attack. (#519 recovered the name
// and the keyword.) There is no forced-attack mechanic anywhere in the engine, so
// nothing was ever locking those tokens; the "locked" half is best explained by
// the short-drag/click misclassification fixed in #518, where the highlighted
// designated creature was the one easy target.
//
// FIX: a generalised `summon-attackers` effect (the shape bubba-hounds already
// hard-coded), plus a CHOSEN entry so the spell asks for its victim. The tokens
// swing at the chosen creature while it lives and are ORDINARY creatures after —
// never locked to a dead target.
//
//   node battlecards/tests/regression/emergency_surgery_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._beef = { id: '_beef', name: 'Beef', type: 'creature', cost: 5, attack: 4, health: 12, rarity: 'common' };
byId._twig = { id: '_twig', name: 'Twig', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
// 0 attack: it hits back for nothing, so the tokens SURVIVE and can be inspected.
// Against the 4/12 they all trade themselves, which is correct combat, not a bug.
byId._wall = { id: '_wall', name: 'Wall', type: 'creature', cost: 2, attack: 0, health: 40, rarity: 'common' };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

const ME = 0, FOE = 1;
function game() {
	const st = E.createGame(byId, seededRng(5), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Foe', power: null }]);
	st.current = ME; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const card = () => byId.emergency_surgery;

// ---------- the card asks for a victim ----------
{
	const st = game();
	put(st, FOE, '_beef');
	const spec = E.targetSpec(st, ME, E.instantiate(card(), ME));
	ok('the spell asks you to choose a creature', !!spec, JSON.stringify(spec));
	ok('and the choice is required', !!(spec && spec.required), JSON.stringify(spec));
	const legal = spec ? E.legalTargets(st, ME, spec) : [];
	ok('an enemy creature is a legal victim', legal.length > 0, 'legal: ' + legal.length);
}

// ---------- the tokens arrive AND attack the chosen creature ----------
{
	const st = game();
	const victim = put(st, FOE, '_beef');          // 4/12: survives 9 damage
	const foeLifeBefore = st.players[FOE].life;
	E.execEffects(st, ME, card().effects, { type: 'creature', uid: victim.uid, player: FOE }, null);
	ok('the chosen creature took all 9', E.hp(victim) === 12 - 9, 'hp ' + E.hp(victim));
	ok('the enemy HERO was not hit', st.players[FOE].life === foeLifeBefore, `${st.players[FOE].life} vs ${foeLifeBefore}`);
	// 3/1s into a 4/12 all die on the swing back — correct combat, not a lock
	ok('they traded themselves into it', st.players[ME].board.filter(c => c.name === 'Undead' && !E.isDead(c)).length === 0,
		st.players[ME].board.map(c => c.name).join(','));
}

// ---------- inspect the tokens themselves, against a victim that cannot hit back ----------
{
	const st = game();
	const wall = put(st, FOE, '_wall');
	E.execEffects(st, ME, card().effects, { type: 'creature', uid: wall.uid, player: FOE }, null);
	const toks = st.players[ME].board.filter(c => c.name === 'Undead' && !E.isDead(c));
	ok('three tokens arrive', toks.length === 3, 'got ' + toks.length);
	ok('they are 3/1', toks.every(t => t.attack === 3 && t.maxHealth === 1), toks.map(t => `${t.attack}/${t.maxHealth}`).join(','));
	ok('they have Lifesteal', toks.every(t => E.has(t, 'lifesteal')), JSON.stringify(toks[0] && toks[0].keywords));
	ok('their text says so', /Lifesteal/i.test((toks[0] || {}).description || ''), (toks[0] || {}).description);
	ok('all nine damage landed on the chosen creature', E.hp(wall) === 40 - 9, 'hp ' + E.hp(wall));
}

// ---------- the victim dying does NOT strand the rest ----------
{
	const st = game();
	const victim = put(st, FOE, '_twig');          // 1/1: dies to the first token
	E.execEffects(st, ME, card().effects, { type: 'creature', uid: victim.uid, player: FOE }, null);
	const toks = st.players[ME].board.filter(c => c.name === 'Undead');
	// the token that kills the 1/1 takes 1 back and dies with it; the other two never
	// swing (their quarry is already gone) and simply stay on the board
	ok('the tokens that never swung survive', toks.filter(t => !E.isDead(t)).length === 2, 'got ' + toks.length);
	ok('the victim is gone', st.players[FOE].board.every(c => E.isDead(c) || c.name !== 'Twig'),
		st.players[FOE].board.map(c => c.name).join(','));
	// the survivors must be ordinary creatures — nothing keeps them pointed at a corpse
	st.current = ME;
	const other = put(st, FOE, '_beef');
	const freeToAct = toks.filter(t => !E.isDead(t)).map(t => {
		t.sick = false; t.attacksUsed = 0;                 // next turn: they are just creatures
		const targets = E.attackTargets(st, ME, t);
		return { hero: targets.some(x => x.type === 'hero'), creature: targets.some(x => x.type === 'creature') };
	});
	ok('a surviving token can attack the FACE next turn', freeToAct.every(f => f.hero), JSON.stringify(freeToAct));
	ok('...and other creatures too', freeToAct.every(f => f.creature), JSON.stringify(freeToAct));
	ok('nothing in the engine locks an attacker to one target',
		!/mustAttack|forcedAttack|lockedTarget/.test(fs.readFileSync(new URL('../../engine/core.js', import.meta.url), 'utf8')));
}

// ---------- Lifesteal actually heals you ----------
{
	const st = game();
	st.players[ME].life = 20;
	const victim = put(st, FOE, '_beef');
	E.execEffects(st, ME, card().effects, { type: 'creature', uid: victim.uid, player: FOE }, null);
	ok('Lifesteal healed the caster for the damage dealt', st.players[ME].life > 20, 'life ' + st.players[ME].life);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
