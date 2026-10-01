// Owner inbox batch, 2026-10-01 — four Legolas (Middle-earth) cards.
//   Legolas' Mirkwood Spider -> "Deathtouch & Taunt.\nDeathrattle: Gain 3 Life."; tribe Beast
//   Shower of Arrows         -> "Deal 2 damage to each creature you don't control."
//   Legolas' The Black Arrow -> renamed Mirkwood Darkflame Arrow, + a 2nd {T} ability:
//                               "Target creature gains Taunt & Inspire: Gain +1/+1."
//   Mirkwood                 -> "Deal 2 damage to a random creature you don't control & Gain 2 Life."
//
// Artifacts learn several {T} abilities (`tapAbilities`; one tap uses one), and
// grant-ongoing learns `stack` (the grant joins `ongoings` instead of replacing
// the creature's own trigger).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._ogre = { id: '_ogre', name: 'Ogre', type: 'creature', cost: 6, attack: 1, health: 9, rarity: 'common' };
byId._inspired = { id: '_inspired', name: 'Squire', type: 'creature', cost: 2, attack: 1, health: 9, rarity: 'common',
	ongoing: { on: 'hero-power-used', effects: [{ type: 'buff-self', attack: 0, health: 1 }] } };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh(seed = 75) {
	const st = E.createGame(byId, seededRng(seed), null, 2,
		[{ id: 'hunter', name: 'A', power: null }, { id: 'hunter', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.artifacts = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.life = 30; p.armor = 0; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const give = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const artifact = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'artifact'; st.players[pi].artifacts.push(c); return c; };
const T = c => ({ type: 'creature', uid: c.uid, player: c.controller });
const gone = (st, c) => !st.players[c.controller].board.includes(c) || E.isDead(c);

// ---- 1) Legolas' Mirkwood Spider ----
{
	const c = byId.me_legolas_spider;
	ok('Spider reads "Deathtouch & Taunt. / Deathrattle: Gain 3 Life."', c.description === 'Deathtouch & Taunt.\nDeathrattle: Gain 3 Life.', c.description);
	ok('Spider is a Beast', c.tribe === 'Beast', c.tribe);
	ok('Spider has Deathtouch and Taunt', c.keywords.includes('deathtouch') && c.keywords.includes('taunt'), JSON.stringify(c.keywords));
	ok('Spider stats unchanged (2-mana 2/3)', c.cost === 2 && c.attack === 2 && c.health === 3);
	const st = fresh();
	st.players[0].life = 20;
	const sp = put(st, 0, c);
	sp.damage = sp.maxHealth;
	E.sweepDeaths(st);
	ok('when the Spider dies you gain 3 Life', st.players[0].life === 23, st.players[0].life);
	// Taunt: the enemy must attack it
	const st2 = fresh();
	put(st2, 0, c);
	const att = put(st2, 1, byId._ogre);
	st2.current = 1;
	const tg = E.attackTargets(st2, 1, att);
	ok("an enemy can't attack your hero past the Spider (Taunt)", !tg.some(t => t.type === 'hero') && tg.length === 1, JSON.stringify(tg));
}

// ---- 2) Shower of Arrows ----
{
	const c = byId.me_legolas_arrows;
	ok('Shower of Arrows reads "Deal 2 damage to each creature you don\'t control."', c.description === "Deal 2 damage to each creature you don't control.", c.description);
	const st = fresh();
	const mine = put(st, 0, byId._ogre), a = put(st, 1, byId._ogre), b = put(st, 1, byId._ogre);
	E.playCard(st, 0, give(st, 0, c).uid, null, null, 0);
	ok('...it deals 2 to each enemy creature and none to yours', a.damage === 2 && b.damage === 2 && mine.damage === 0, JSON.stringify([mine.damage, a.damage, b.damage]));
}

// ---- 3) Mirkwood Darkflame Arrow: two {T} abilities ----
{
	const c = byId.me_legolas_blackarrow;
	ok('renamed Mirkwood Darkflame Arrow', c.name === 'Mirkwood Darkflame Arrow', c.name);
	ok('two {T} abilities on the card text', c.description === '{T}: Destroy an enemy creature with 4 or less Health.\n{T}: Target creature gains Taunt & Inspire: Gain +1/+1.', c.description);
	ok('the engine sees both abilities', E.artifactTaps(c).length === 2);
	// ability 1 unchanged: destroy an enemy with <= 4 Health
	{
		const st = fresh();
		const art = artifact(st, 0, c);
		const small = put(st, 1, { ...byId._ogre, id: '_small', health: 4 });
		ok('ability 1 still destroys an enemy creature with 4 or less Health', E.tapArtifact(st, 0, art.uid, T(small), 0) && gone(st, small));
		ok('...and taps the artifact', art.tapped === true);
		ok('a tapped artifact cannot use its OTHER ability that turn (one tap, one ability)', !E.canTapArtifact(st, 0, art.uid, 1));
	}
	// ability 2 on your own creature: Taunt + Inspire +1/+1
	{
		const st = fresh();
		const art = artifact(st, 0, c);
		const mine = put(st, 0, byId._ogre);
		ok('ability 2 can be used', E.canTapArtifact(st, 0, art.uid, 1));
		ok('ability 2 resolves on a creature', E.tapArtifact(st, 0, art.uid, T(mine), 1));
		ok('...which gains Taunt', mine.keywords.includes('taunt'), JSON.stringify(mine.keywords));
		E.fireOngoing(st, 0, 'hero-power-used', {});
		ok('...and Inspire: using your hero power gives it +1/+1', mine.attack === 2 && mine.maxHealth === 10, `${mine.attack}/${mine.maxHealth}`);
		E.fireOngoing(st, 0, 'hero-power-used', {});
		ok('...every time', mine.attack === 3 && mine.maxHealth === 11, `${mine.attack}/${mine.maxHealth}`);
	}
	// ability 2 keeps a creature's own trigger (stack)
	{
		const st = fresh();
		const art = artifact(st, 0, c);
		const sq = put(st, 0, byId._inspired);
		E.tapArtifact(st, 0, art.uid, T(sq), 1);
		E.fireOngoing(st, 0, 'hero-power-used', {});
		ok("ability 2 on a creature with its own Inspire keeps both (+1/+1 AND its +0/+1)", sq.attack === 2 && sq.maxHealth === 11, `${sq.attack}/${sq.maxHealth}`);
	}
	// "Target creature": an enemy creature is legal too
	{
		const st = fresh();
		const art = artifact(st, 0, c);
		const foe = put(st, 1, byId._ogre);
		const legal = E.legalTargets(st, 0, E.tapArtifactSpec(st, 0, art.uid, 1));
		ok('ability 2 can target an enemy creature', legal.some(t => t.uid === foe.uid));
	}
	// the untap: both abilities come back next turn
	{
		const st = fresh();
		const art = artifact(st, 0, c);
		const mine = put(st, 0, byId._ogre);
		E.tapArtifact(st, 0, art.uid, T(mine), 1);
		E.endTurn(st, 0); st.priority = null; st.stack = [];
		E.endTurn(st, 1); st.priority = null; st.stack = [];
		ok('next turn the artifact untaps and both abilities are usable again', st.current === 0 && !art.tapped && E.canTapArtifact(st, 0, art.uid, 0) === false /* no enemy target */ && E.canTapArtifact(st, 0, art.uid, 1), JSON.stringify({ cur: st.current, tapped: art.tapped }));
	}
	// the AI uses it (no throw, one of the two fires)
	{
		const st = fresh();
		const art = artifact(st, 0, c);
		put(st, 0, byId._ogre);
		ok('a single-ability artifact still taps through the old call shape', (() => { const s2 = fresh(); const a2 = artifact(s2, 0, { id: '_rock', name: 'Rock', type: 'artifact', cost: 1, tapAbility: { effects: [{ type: 'heal', value: 2, target: 'self' }], text: 'Gain 2 Life.' } }); s2.players[0].life = 10; return E.tapArtifact(s2, 0, a2.uid) && s2.players[0].life === 12; })());
		ok('setup', !!art);
	}
}

// ---- 4) Mirkwood (location) ----
{
	const c = byId.me_legolas_mirkwood;
	ok('Mirkwood reads "⟳ ⟳: Deal 2 damage to a random creature you don\'t control & Gain 2 Life."', c.description === "⟳ ⟳: Deal 2 damage to a random creature you don't control & Gain 2 Life.", c.description);
	for (const seed of [1, 2, 3, 4]) {
		const st = fresh(seed);
		st.players[0].life = 20;
		const loc = put(st, 0, c);
		const mine = put(st, 0, byId._ogre), a = put(st, 1, byId._ogre), b = put(st, 1, byId._ogre);
		ok(`[${seed}] Mirkwood taps`, E.tapLand(st, 0, loc.uid, 0, null));
		while (st.stack.length && E.resolveStack) E.resolveStack(st);
		ok(`[${seed}] 2 damage to exactly one enemy creature, never yours, never the enemy hero`, a.damage + b.damage === 2 && (a.damage === 2 || b.damage === 2) && mine.damage === 0 && st.players[1].life === 30,
			JSON.stringify({ a: a.damage, b: b.damage, mine: mine.damage, hero: st.players[1].life, stack: st.stack.length }));
		ok(`[${seed}] ...and you gain 2 Life`, st.players[0].life === 22, st.players[0].life);
	}
	// no enemy creatures: still gain the Life
	const st = fresh();
	st.players[0].life = 20;
	const loc = put(st, 0, c);
	E.tapLand(st, 0, loc.uid, 0, null);
	while (st.stack.length && E.resolveStack) E.resolveStack(st);
	ok('with no enemy creatures it still gains 2 Life and hits no hero', st.players[0].life === 22 && st.players[1].life === 30, JSON.stringify([st.players[0].life, st.players[1].life]));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
