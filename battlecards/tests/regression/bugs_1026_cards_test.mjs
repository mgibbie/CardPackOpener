// Bug review 2026-10-26 — Battlecards card-effect bugs (instinctgauntlet reports).
//   1 Gyreworm              conditional battlecry asked for a target when unmet, then dealt 0
//   2 granted Rush           NOT A BUG: the replay's enemy board held a Taunt (Monstrosity of the Lake)
//   3 Su Leadfoot            hand-played creatures got no Divine Shield/Rush (+ Impish Aid, Spiked Arms,
//                            Bolster Defenses, Take the Bridge!, Collapsing Star: same summon-only gap)
//   4 Sylvanas's Triumph     `if:{playedBefore}` had no branch; unknown keys passed TRUE (+4 cards,
//                            + Crooked Cook / Careless Mechanist ongoing keys, + Cultivation cost cond)
//   5 Inexorable Ghoul       "Revive after 2 turns" put a dormant copy on the board at once
//   6 Hysteria               fizzled: force-attack had no chosen-target branch and no target prompt
//   7 Azog's Executioner     destroyed a 4-Health creature (maxHealth unchecked; + Walk the Plank,
//                            Garona's Last Stand, Eternus/Bugsquasher prompts)
//   8 Kronx Dragonhoof       Galakrond Invokes never counted toward "Invoked twice"
//   9 EVIL Recruiter         destroyed a non-Lackey (+ Elder Nadox: any friendly, not an Undead)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import * as HM from '../../engine/effects/handlers-misc.js';
import * as TR from '../../engine/triggers.js';
// namespace imports: with the fix reverted these exports are absent and their checks FAIL (not crash)
const evalConditional = HM.evalConditional || (() => { warns.push('evalConditional missing'); return true; });
const ONGOING_COND_KEYS = TR.ONGOING_COND_KEYS || new Set();
const ongoingCondOk = TR.ongoingCondOk;

const warns = [];
const _warn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._ogre = { id: '_ogre', name: 'Ogre', type: 'creature', cost: 6, attack: 1, health: 9, rarity: 'common' };
byId._bear = { id: '_bear', name: 'Bear', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', cardClass: 'neutral' };
byId._wall = { id: '_wall', name: 'Wall', type: 'creature', cost: 2, attack: 0, health: 30, rarity: 'common', keywords: ['taunt'] };
byId._viper = { id: '_viper', name: 'Viper', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common' }; // Rustrot Viper's stats
byId._demon = { id: '_demon', name: 'Imp', type: 'creature', cost: 1, attack: 2, health: 2, rarity: 'common', tribe: 'Demon' };
byId._undead = { id: '_undead', name: 'Ghoul', type: 'creature', cost: 1, attack: 4, health: 2, rarity: 'common', tribe: 'Undead' };
byId._legend = { id: '_legend', name: 'Legend', type: 'creature', cost: 5, attack: 5, health: 5, rarity: 'legendary' };
byId._elem = { id: '_elem', name: 'Ember', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Elemental' };
byId._magespell = { id: '_magespell', name: 'Spark', type: 'sorcery', cost: 0, rarity: 'common', cardClass: 'mage', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh(seed = 1026) {
	const st = E.createGame(byId, seededRng(seed), null, 2, [{ id: 'warrior', name: 'A', power: null }, { id: 'warrior', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.artifacts = []; p.enchantments = []; p.secrets = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.life = 30; p.armor = 0; p.deck = Array(30).fill('_bear'); }
	return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const play = (st, pi, id, target) => { const c = give(st, pi, id); const r = E.playCard(st, pi, c.uid, target || null, null, null); return { r, c }; };
const tc = c => ({ type: 'creature', uid: c.uid, player: c.controller });
const onBoard = (st, pi, id) => st.players[pi].board.filter(c => c.id === id && !E.isDead(c));
const legalUids = (st, pi, card) => { const spec = E.targetSpec(st, pi, card); return spec ? E.legalTargets(st, pi, spec).filter(t => t.type === 'creature').map(t => t.uid) : null; };
// advance to the start of player pi's NEXT turn
const toNextTurnOf = (st, pi) => { do { E.endTurn(st); } while (st.current !== pi); };

// ---------- 1) Gyreworm: no Elemental last turn -> no target prompt ----------
{
	const st = fresh();
	const foe = put(st, 1, '_ogre');
	const g = give(st, 0, 'gyreworm');
	st.players[0].elementalLastTurn = false;
	ok('Gyreworm (no Elemental last turn): no target prompt', E.targetSpec(st, 0, g) === null, JSON.stringify(E.targetSpec(st, 0, g)));
	E.playCard(st, 0, g.uid, tc(foe), null, null);
	ok('...and nothing is dealt', foe.damage === 0 && st.players[1].life === 30, foe.damage);
	const st2 = fresh();
	const foe2 = put(st2, 1, '_ogre');
	const g2 = give(st2, 0, 'gyreworm');
	st2.players[0].elementalLastTurn = true;
	const spec = E.targetSpec(st2, 0, g2);
	ok('Gyreworm (Elemental last turn): asks for a target (positive control)', spec && spec.targets === 'any');
	E.playCard(st2, 0, g2.uid, tc(foe2), null, null);
	ok('...and deals 3 to it', foe2.damage === 3, foe2.damage);
	// same gate on Lilypad Lurker
	const st3 = fresh(); put(st3, 1, '_ogre'); const ll = give(st3, 0, 'lilypad_lurker');
	ok('Lilypad Lurker (no Elemental last turn): no target prompt', E.targetSpec(st3, 0, ll) === null);
	// the prompt still appears after a REAL Elemental turn (tracker carries over the turn change)
	const st4 = fresh(); put(st4, 1, '_ogre');
	play(st4, 0, '_elem');
	toNextTurnOf(st4, 0);
	const g4 = give(st4, 0, 'gyreworm');
	ok('Gyreworm the turn after an Elemental: prompt appears', !!E.targetSpec(st4, 0, g4));
}

// ---------- 2) granted Rush (not a bug — Taunt) ----------
{
	const st = fresh();
	const kelpie = put(st, 1, 'me_wa_kelpie');
	play(st, 0, 'me_gandalf_sig', { type: 'hero', player: 1 });
	const gan = onBoard(st, 0, 'me_gandalf_sig')[0];
	play(st, 0, 'me_cw_tactics', tc(gan));
	ok('Warg Tactics grants Rush to a just-played creature', gan.sick && gan.keywords.includes('rush'));
	ok('...it can attack an enemy creature that turn', E.canAttackWith(st, 0, gan) && E.attackTargets(st, 0, gan).some(t => t.uid === kelpie.uid));
	ok('...but not the hero (Rush is not Charge)', !E.attackTargets(st, 0, gan).some(t => t.type === 'hero'));
	const wall = put(st, 1, 'me_wa_monstrosity');
	const legal = E.attackTargets(st, 0, gan).map(t => t.uid);
	ok('replay r/7d82ce19: with Monstrosity of the Lake (Taunt) up, only the Taunt is attackable', legal.length === 1 && legal[0] === wall.uid, legal);
	ok('...so the attack on River Kelpie is refused by Taunt, not by the granted Rush', E.attack(st, 0, gan.uid, tc(kelpie)) === false && E.attack(st, 0, gan.uid, tc(wall)) === true);
}

// ---------- 3) Su Leadfoot & the other "after you summon" reactors, on HAND-played creatures ----------
{
	const st = fresh();
	put(st, 0, 'duels_su_leadfoot');
	const { c } = play(st, 0, '_bear');
	ok('Su Leadfoot: a hand-played creature gains Divine Shield & Rush at once', c.keywords.includes('divine_shield') && c.keywords.includes('rush') && c.shield === true, c.keywords.join('+'));
	const foe = put(st, 1, '_ogre');
	ok('...so it can attack a creature the turn it is played', E.attack(st, 0, c.uid, tc(foe)) === true);
	ok('...and its Divine Shield absorbs the first hit', c.damage === 0 && c.shield === false, `${c.damage} ${c.shield}`);
	E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Uruk' }], null, null);
	const tok = st.players[0].board.find(x => x.name === 'Uruk');
	ok('...effect-summoned tokens still gain both', tok && tok.shield && tok.keywords.includes('rush'));
	const st2 = fresh(); const { c: c2 } = play(st2, 0, '_bear');
	ok('no Su Leadfoot: no Divine Shield', !c2.shield && !c2.keywords.includes('divine_shield'));
	const st3 = fresh(); put(st3, 0, 'duels_impish_aid'); const { c: d } = play(st3, 0, '_demon');
	ok('Impish Aid: a hand-played Demon gets +2/+2', d.attack === 4 && d.maxHealth === 4, `${d.attack}/${d.maxHealth}`);
	const st4 = fresh(); const sa = E.instantiate(byId.duels_spiked_arms, 0); sa.zone = 'weapon'; st4.players[0].weapon = sa;
	const { c: o } = play(st4, 0, '_ogre');
	ok('Spiked Arms: a hand-played creature takes 1 and gains +2 Attack', o.attack === 3 && o.damage === 1, `${o.attack} ${o.damage}`);
}

// ---------- 4) conditional keys: Sylvanas's Triumph + the audit's four + fail-closed ----------
{
	const st = fresh();
	const a = put(st, 1, '_ogre'), b = put(st, 1, '_ogre');
	play(st, 0, 'sylvanas_triumph', tc(a));
	ok("Sylvanas's Triumph, first cast: 3 to the chosen target only", a.damage === 3 && b.damage === 0 && st.players[1].life === 30, `${a.damage} ${b.damage} ${st.players[1].life}`);
	play(st, 0, 'sylvanas_triumph', tc(a));
	ok('...second copy: hits all enemies', a.damage === 6 && b.damage === 3 && st.players[1].life === 27, `${a.damage} ${b.damage} ${st.players[1].life}`);
}
{
	const st = fresh(); const foe = put(st, 1, '_ogre');
	st.players[0].deck = ['_ogre', '_bear'];
	play(st, 0, 'precursory_strike', tc(foe));
	ok('Precursory Strike, no 5+ cost creature in hand: no draw', st.players[0].hand.length === 0, st.players[0].hand.map(c => c.id));
	const st2 = fresh(); const foe2 = put(st2, 1, '_ogre'); give(st2, 0, '_ogre'); st2.players[0].deck = ['_bear'];
	play(st2, 0, 'precursory_strike', tc(foe2));
	ok('...holding one: draws a creature', st2.players[0].hand.length === 2);
}
{
	const st = fresh(); const foe = put(st, 1, '_ogre'); st.players[0].life = 30;
	play(st, 0, 'sensory_deprivation', tc(foe));
	ok('Sensory Deprivation above 20 Health: the original survives', !E.isDead(foe) && st.players[1].board.includes(foe));
	const st2 = fresh(); const foe2 = put(st2, 1, '_ogre'); st2.players[0].life = 20;
	play(st2, 0, 'sensory_deprivation', tc(foe2));
	ok('...at 20 or less: the original is destroyed', E.isDead(foe2) || !st2.players[1].board.includes(foe2));
}
{
	const st = fresh(); const foe = put(st, 1, '_ogre');
	play(st, 0, 'ransack', tc(foe));
	ok('Ransack, no other-class card played earlier this turn: 1 damage (itself does not count)', foe.damage === 1, foe.damage);
	play(st, 0, '_magespell');
	play(st, 0, 'ransack', tc(foe));
	ok('...after a Mage card this turn: 4 damage', foe.damage === 5, foe.damage);
	toNextTurnOf(st, 0);
	play(st, 0, 'ransack', tc(foe));
	ok('...the count resets next turn', foe.damage === 6, foe.damage);
}
{
	const st = fresh(); const mine = put(st, 0, '_bear'); const foe = put(st, 1, '_ogre');
	play(st, 0, 'go_with_the_flow', tc(mine));
	ok('Go with the Flow on a FRIENDLY creature: Spell Damage +1, not Frozen', !mine.frozen && mine.static?.type === 'spell-damage' && mine.static.value === 1, JSON.stringify([mine.frozen, mine.static]));
	play(st, 0, 'go_with_the_flow', tc(foe));
	ok('...on an ENEMY creature: Frozen', !!foe.frozen && !(foe.static?.type === 'spell-damage'));
}
{
	const st = fresh(); const foe = put(st, 1, '_ogre');
	E.execEffects(st, 0, [{ type: 'conditional', if: { noSuchKey_1026: true }, then: [{ type: 'damage', value: 5, target: 'enemy-creatures' }], else: [] }], null, null);
	ok('an unknown condition key FAILS CLOSED (the then-branch does not run)', foe.damage === 0, foe.damage);
	ok('...and warns once, naming the key', warns.some(w => w.includes("'noSuchKey_1026'")), warns);
}
{
	// audit: FIRE the evaluator on every distinct conditional `if` in cards.json — none may be unhandled
	const ifs = new Map();
	const walk = (o, id) => { if (Array.isArray(o)) { for (const x of o) walk(x, id); return; } if (!o || typeof o !== 'object') return; if (o.type === 'conditional' && o.if) ifs.set(JSON.stringify(o.if), id); for (const k in o) walk(o[k], id); };
	for (const c of raw.cards) walk(c, c.id);
	const st = fresh(); put(st, 0, '_bear'); put(st, 1, '_bear');
	warns.length = 0;
	for (const [s, id] of ifs) { try { evalConditional(st, 0, JSON.parse(s), st.players[1].board[0], st.players[0].board[0]); } catch (err) { warns.push(`threw on ${s} (${id}): ${err.message}`); } }
	ok(`audit: all ${ifs.size} distinct conditional conditions in cards.json have a branch`, ifs.size > 150 && warns.length === 0, warns);
	// ...and every ongoing-trigger `if` key is one ongoingCondOk reads
	const bad = [];
	const walk2 = (o, id) => { if (Array.isArray(o)) { for (const x of o) walk2(x, id); return; } if (!o || typeof o !== 'object') return; if (o.if && !o.type) for (const k of Object.keys(o.if)) if (!ONGOING_COND_KEYS.has(k)) bad.push(`${id}:${k}`); for (const k in o) if (k !== 'if') walk2(o[k], id); };
	for (const c of raw.cards) walk2(c, c.id);
	ok('audit: every ongoing-trigger condition key is handled', bad.length === 0, bad);
	warns.length = 0;
	ok('an unknown ongoing condition key fails closed', ongoingCondOk(st, 0, { noSuchKey_1026: true }, {}) === false && warns.length === 1);
}
{
	// Crooked Cook: only after 3+ damage to the enemy hero this turn
	const st = fresh(); put(st, 0, 'crooked_cook');
	const h0 = st.players[0].hand.length;
	E.endTurn(st);
	ok('Crooked Cook: no hero damage this turn -> no draw at end of turn', st.players[0].hand.length === h0, st.players[0].hand.length);
	const st2 = fresh(); put(st2, 0, 'crooked_cook');
	E.execEffects(st2, 0, [{ type: 'damage', value: 3, target: 'enemy-heroes' }], null, null);
	const h1 = st2.players[0].hand.length;
	E.endTurn(st2);
	ok('...after 3 damage: draws a card', st2.players[0].hand.length === h1 + 1, `${h1} -> ${st2.players[0].hand.length}`);
	// Careless Mechanist: survives the FIRST draw of a turn, dies on the second
	const st3 = fresh(); const cm = put(st3, 0, 'careless_mechanist');
	st3.players[0].drawsThisTurn = 0;
	E.execEffects(st3, 0, [{ type: 'draw', value: 1 }], null, null); E.sweepDeaths(st3);
	ok('Careless Mechanist survives your first draw of the turn', st3.players[0].board.includes(cm) && !E.isDead(cm));
	E.execEffects(st3, 0, [{ type: 'draw', value: 1 }], null, null); E.sweepDeaths(st3);
	ok('...and is destroyed by the second', !st3.players[0].board.includes(cm) || E.isDead(cm));
}
{
	// Cultivation: (1) less per Treant created this game (its cost condition had no case)
	const st = fresh(); const cv = give(st, 0, 'cultivation');
	ok('Cultivation costs 8 with no Treants', E.effectiveCost(st, 0, cv) === 8, E.effectiveCost(st, 0, cv));
	E.execEffects(st, 0, [{ type: 'summon', count: 3, attack: 2, health: 2, name: 'Treant' }], null, null);
	ok('...and 5 after three Treants', E.effectiveCost(st, 0, cv) === 5, E.effectiveCost(st, 0, cv));
}

// ---------- 5) Inexorable Ghoul: leaves play, a fresh copy returns after 2 of your turns ----------
{
	const st = fresh();
	const whale = put(st, 1, '_ogre'); whale.attack = 6; // Colossal Whale stand-in
	const { c: ghoul } = play(st, 0, 'duels_inexorable_ghoul');
	const startTurn = st.turnNumber;
	ok('Ghoul has Rush and can attack the turn it is played', E.attack(st, 0, ghoul.uid, tc(whale)) === true);
	E.sweepDeaths(st);
	ok('Ghoul died in combat: NOTHING of it stays on the board (no instant/dormant copy)', onBoard(st, 0, 'duels_inexorable_ghoul').length === 0, st.players[0].board.map(c => `${c.id}:${c.dormantLeft}`));
	E.execEffects(st, 0, [{ type: 'buff', attack: 1, health: 0, target: 'friendly-creatures' }], null, null);
	toNextTurnOf(st, 0);
	ok('...still gone at the start of your next turn', onBoard(st, 0, 'duels_inexorable_ghoul').length === 0);
	toNextTurnOf(st, 0);
	const back = onBoard(st, 0, 'duels_inexorable_ghoul');
	ok('...revives at the start of your 2nd turn after the death (turn T+4)', back.length === 1 && st.turnNumber === startTurn + 4, `${back.length} @${st.turnNumber - startTurn}`);
	ok('...as a FRESH 5/5 (no buffs carried over), awake', back[0] && back[0].attack === 5 && hp(back[0]) === 5 && !(back[0].dormantLeft > 0) && back[0].uid !== ghoul.uid);
	// dies on the ENEMY's turn: same clock (the owner's 2nd turn start)
	const st2 = fresh(); const g2 = put(st2, 0, 'duels_inexorable_ghoul');
	E.endTurn(st2); // enemy turn
	const t0 = st2.turnNumber;
	g2.damage = g2.maxHealth; E.sweepDeaths(st2);
	toNextTurnOf(st2, 0);
	ok('died on the enemy turn: gone at your next turn start', onBoard(st2, 0, 'duels_inexorable_ghoul').length === 0);
	toNextTurnOf(st2, 0);
	ok('...back at your 2nd turn start', onBoard(st2, 0, 'duels_inexorable_ghoul').length === 1 && st2.turnNumber === t0 + 3);
	// repeat deaths each schedule their own revive
	const back2 = onBoard(st2, 0, 'duels_inexorable_ghoul')[0];
	back2.damage = back2.maxHealth; E.sweepDeaths(st2);
	toNextTurnOf(st2, 0); toNextTurnOf(st2, 0);
	ok('...a second death schedules a second revive', onBoard(st2, 0, 'duels_inexorable_ghoul').length === 1);
	// snapshot round-trip keeps the pending revive
	const st3 = fresh(); const g3 = put(st3, 0, 'duels_inexorable_ghoul'); g3.damage = g3.maxHealth; E.sweepDeaths(st3);
	const st3b = E.fromSnapshot(JSON.parse(JSON.stringify(E.toSnapshot(st3))), byId, seededRng(3));
	toNextTurnOf(st3b, 0); toNextTurnOf(st3b, 0);
	ok('...and the pending revive survives a save/resume', onBoard(st3b, 0, 'duels_inexorable_ghoul').length === 1);
}
function hp(c) { return c.maxHealth - c.damage; }

// ---------- 6) Hysteria ----------
{
	const st = fresh();
	const h = give(st, 0, 'hysteria');
	const cmd = put(st, 1, '_viper'); cmd.attack = 4; cmd.maxHealth = 4; // Siege-Gang Commander 4/4
	put(st, 1, '_bear'); put(st, 1, '_bear'); put(st, 0, '_bear'); put(st, 0, '_bear');
	const spec = E.targetSpec(st, 0, h);
	ok('Hysteria asks for an ENEMY creature', spec && spec.targets === 'enemy-creature' && spec.required);
	const mana0 = E.availableMana(st.players[0]);
	E.playCard(st, 0, h.uid, tc(cmd), null, null);
	E.sweepDeaths(st);
	ok('Hysteria: mana is paid', E.availableMana(st.players[0]) === mana0 - 4);
	ok('...and the chosen creature attacks random creatures until it dies', !st.players[1].board.includes(cmd) || E.isDead(cmd));
	const totalDead = 4 - [...st.players[0].board, ...st.players[1].board].filter(c => c.id === '_bear').length;
	ok('...taking others with it', totalDead >= 1, totalDead);
	// terminates: a 0-Attack standoff that can never kill it
	const st2 = fresh(); const tough = put(st2, 1, '_ogre'); tough.attack = 0; put(st2, 0, '_wall');
	E.playCard(st2, 0, give(st2, 0, 'hysteria').uid, tc(tough), null, null);
	ok('...and always terminates (unkillable target)', st2.players[1].board.includes(tough));
}

// ---------- 6b) Hysteria's failure mode elsewhere: spells whose effect type had no play-path handler ----------
{
	const snap = st => JSON.stringify(st.players.map(p => p.board.map(c => [c.uid, c.damage, c.attack])));
	// Unholy Frenzy: your creatures attack the chosen enemy; any that die are resummoned
	{
		const st = fresh(); const a = put(st, 0, '_bear'); const foe = put(st, 1, '_ogre'); foe.attack = 5;
		const c = give(st, 0, 'unholy_frenzy');
		ok('Unholy Frenzy asks for an enemy creature', E.targetSpec(st, 0, c)?.targets === 'enemy-creature');
		E.playCard(st, 0, c.uid, tc(foe), null, null);
		ok('...your creature attacks it', foe.damage === 2, foe.damage);
		ok('...and the one that died is resummoned fresh', !st.players[0].board.includes(a) && onBoard(st, 0, '_bear').length === 1 && onBoard(st, 0, '_bear')[0].damage === 0);
	}
	// Devouring Swarm: ...then return any that die to your hand
	{
		const st = fresh(); put(st, 0, '_bear'); const foe = put(st, 1, '_ogre'); foe.attack = 5;
		play(st, 0, 'devouring_swarm', tc(foe));
		ok('Devouring Swarm: the creature that died returns to your hand', foe.damage === 2 && st.players[0].hand.some(c => c.id === '_bear') && onBoard(st, 0, '_bear').length === 0);
	}
	// Ramming Speed: the chosen creature attacks a neighbor
	{
		const st = fresh(); const l = put(st, 1, '_ogre'); const mid = put(st, 1, '_ogre'); mid.attack = 4;
		play(st, 0, 'ramming_speed', tc(mid));
		ok('Ramming Speed: the creature attacks its neighbor', l.damage === 4 && mid.damage === 1, `${l.damage} ${mid.damage}`);
	}
	// The Beast Within: the buffed friendly creature attacks a random enemy creature
	{
		const st = fresh(); const b = put(st, 0, '_bear'); const foe = put(st, 1, '_ogre');
		play(st, 0, 'the_beast_within', tc(b));
		ok('The Beast Within: +1/+1, then it attacks a random enemy creature', b.attack === 3 && foe.damage === 3, `${b.attack} ${foe.damage}`);
	}
	// Shattering Blast: destroy all Frozen creatures
	{
		const st = fresh(); const fz = put(st, 1, '_ogre'); fz.frozen = 1; const warm = put(st, 1, '_ogre');
		play(st, 0, 'shattering_blast');
		ok('Shattering Blast destroys Frozen creatures only', !st.players[1].board.includes(fz) && st.players[1].board.includes(warm) && warm.damage === 0);
	}
	// Sensory Deprivation: the copy half
	{
		const st = fresh(); const foe = put(st, 1, '_ogre');
		play(st, 0, 'sensory_deprivation', tc(foe));
		ok('Sensory Deprivation creates a copy of the enemy creature', onBoard(st, 0, '_ogre').length === 1);
	}
	// Wreck'em and Deck'em: a copy of the chosen friendly Mech attacks, then dies
	{
		byId._mech = { id: '_mech', name: 'Bot', type: 'creature', cost: 2, attack: 3, health: 3, rarity: 'common', tribe: 'Mech' };
		const st = fresh(); const m = put(st, 0, '_mech'); put(st, 0, '_bear'); put(st, 1, '_wall');
		const c = give(st, 0, 'wreckem_and_deckem');
		ok("Wreck'em and Deck'em offers only a friendly Mech", JSON.stringify(legalUids(st, 0, c)) === JSON.stringify([m.uid]), legalUids(st, 0, c));
		const before = snap(st);
		E.playCard(st, 0, c.uid, tc(m), null, null);
		ok('...a copy attacks a random enemy and then dies', onBoard(st, 0, '_mech').length === 1 && snap(st) !== before && (st.players[1].board[0].damage === 3 || st.players[1].life === 27));
	}
	// Furious Fowls: two Birds attack the chosen enemy, Immune while attacking
	{
		const st = fresh(); const foe = put(st, 1, '_ogre'); foe.attack = 5;
		const c = give(st, 0, 'furious_fowls');
		ok('Furious Fowls asks for an enemy', E.targetSpec(st, 0, c)?.targets === 'enemy-creature');
		E.playCard(st, 0, c.uid, tc(foe), null, null);
		const birds = st.players[0].board.filter(x => x.name === 'Bird');
		ok('...two 3/3 Birds attack it and take no retaliation', foe.damage === 6 && birds.length === 2 && birds.every(b => b.damage === 0), `${foe.damage} ${birds.map(b => b.damage)}`);
	}
	// Arcane Overflow / Pressure Points / Ransack used the trigger-only 'damage-minion' (dealt nothing)
	{
		const st = fresh(); const foe = put(st, 1, '_ogre'); foe.maxHealth = 12;
		play(st, 0, 'arcane_overflow', tc(foe));
		ok('Arcane Overflow deals 8 to the enemy creature', foe.damage === 8, foe.damage);
		const st2 = fresh(); const foe2 = put(st2, 1, '_ogre');
		const pp = give(st2, 0, 'pressure_points');
		ok('Pressure Points asks for a creature', E.targetSpec(st2, 0, pp)?.targets === 'creature');
		E.playCard(st2, 0, pp.uid, tc(foe2), null, null);
		ok('...and deals 3', foe2.damage === 3, foe2.damage);
	}
	// Waxmancy / Final Frontier: the Discovered card's cost changes ride the Discover itself
	{
		const st = fresh(); play(st, 0, 'waxmancy');
		const q = st.pickQueue.find(x => x.player === 0 && x.discover);
		ok('Waxmancy: the Discover carries the (2) discount', q && q.costMod === -2);
		const st2 = fresh(); play(st2, 0, 'final_frontier');
		const q2 = st2.pickQueue.find(x => x.player === 0 && x.discover);
		ok('Final Frontier: the Discover sets the cost to (1)', q2 && q2.setCost === 1);
		if (q2) { const id = q2.ids[0].id || q2.ids[0]; E.resolvePick(st2, id); const got = st2.players[0].hand.find(c => c.id === id); ok('...and the picked card costs (1)', got && got.cost === 1, got && got.cost); }
	}
}

// ---------- 7) Azog's Merciless Executioner & friends: target restrictions honoured ----------
{
	const st = fresh(); st.current = 1;
	const viper = put(st, 0, '_viper'); // full-health 3/4
	const ex = give(st, 1, 'me_az_executioner');
	ok("Azog's Executioner: a 4-Health creature is not a legal target", (legalUids(st, 1, ex) || []).length === 0, legalUids(st, 1, ex));
	E.playCard(st, 1, ex.uid, tc(viper), null, null); E.sweepDeaths(st);
	ok('...and even if forced as the target it survives (r/c340417b turn 12)', st.players[0].board.includes(viper) && !E.isDead(viper));
	const st2 = fresh(); st2.current = 1;
	const v2 = put(st2, 0, '_viper'); v2.damage = 1; // 3 Health left
	const big = put(st2, 0, '_ogre');
	const ex2 = give(st2, 1, 'me_az_executioner');
	const lu = legalUids(st2, 1, ex2);
	ok('...a damaged creature at 3 Health is legal, a 9-Health one is not', lu.includes(v2.uid) && !lu.includes(big.uid), lu);
	E.playCard(st2, 1, ex2.uid, tc(v2), null, null); E.sweepDeaths(st2);
	ok('...and is destroyed', !st2.players[0].board.includes(v2));
	// same filter on the other "N or less Health" cards
	const st3 = fresh(); const v3 = put(st3, 1, '_viper');
	ok("Gothmog's / Gríma's Executioners (2 or less): a 4-Health creature is not legal", (legalUids(st3, 0, E.instantiate(byId.me_gt_executioner, 0)) || []).length === 0 && (legalUids(st3, 0, E.instantiate(byId.me_gm_executioner, 0)) || []).length === 0);
	E.execEffects(st3, 0, byId.me_bo_nasty.effects, tc(v3), null);
	ok("Bolg's Nasty (3 or less): does not destroy a 4-Health creature", !E.isDead(v3));
	ok('Eternus: only creatures with 2 or less Health are offered', (legalUids(st3, 0, E.instantiate(byId.eternus, 0)) || []).length === 0);
	// Walk the Plank: an UNDAMAGED creature only
	const st4 = fresh(); const hurt = put(st4, 1, '_ogre'); hurt.damage = 1; const whole = put(st4, 1, '_ogre');
	const wtp = give(st4, 0, 'walk_the_plank');
	ok('Walk the Plank offers only undamaged creatures', JSON.stringify(legalUids(st4, 0, wtp)) === JSON.stringify([whole.uid]), legalUids(st4, 0, wtp));
	E.playCard(st4, 0, wtp.uid, tc(hurt), null, null);
	ok('...and will not destroy a damaged one', !E.isDead(hurt));
	// Garona's Last Stand: a LEGENDARY creature only (its data said `rarity`, the handler reads `requireRarity`)
	const st5 = fresh(); const plain = put(st5, 1, '_ogre'); const leg = put(st5, 1, '_legend');
	const gls = give(st5, 0, 'garona_s_last_stand');
	ok("Garona's Last Stand offers only Legendary creatures", JSON.stringify(legalUids(st5, 0, gls)) === JSON.stringify([leg.uid]), legalUids(st5, 0, gls));
	E.playCard(st5, 0, gls.uid, tc(plain), null, null);
	ok('...and will not destroy a non-Legendary one', !E.isDead(plain));
	// Bugsquasher: an enemy creature WITH a creature type
	const st6 = fresh(); const untyped = put(st6, 1, '_ogre'); const typed = put(st6, 1, '_demon');
	ok('Bugsquasher offers only typed enemy creatures', JSON.stringify(legalUids(st6, 0, E.instantiate(byId.bugsquasher, 0))) === JSON.stringify([typed.uid]));
}

// ---------- 8) Kronx Dragonhoof: Galakrond Invokes count toward "Invoked twice" ----------
{
	const st = fresh(); const foe = put(st, 1, '_ogre');
	play(st, 0, 'shield_of_galakrond'); play(st, 0, 'shield_of_galakrond');
	play(st, 0, 'kronx_dragonhoof');
	ok('Kronx after 2x Shield of Galakrond: Devastation (5 to all enemies)', foe.damage === 5 && st.players[1].life === 25 && (st.players[0].armor || 0) === 0, `${foe.damage} ${st.players[1].life} ${st.players[0].armor}`);
	const st2 = fresh(); const foe2 = put(st2, 1, '_ogre');
	play(st2, 0, 'shield_of_galakrond');
	play(st2, 0, 'kronx_dragonhoof');
	ok('...after only one Invoke: +5 Armor instead', foe2.damage === 0 && st2.players[0].armor === 5);
	const st3 = fresh();
	play(st3, 0, 'dragonblight_cultist');
	ok('Dragonblight Cultist\'s Invoke also powers up Galakrond (no double count)', st3.players[0].galakrondInvokes === 1 && st3.players[0].invokeCount === 1, `${st3.players[0].galakrondInvokes}/${st3.players[0].invokeCount}`);
	play(st3, 0, 'shield_of_galakrond');
	const foe3 = put(st3, 1, '_ogre');
	play(st3, 0, 'kronx_dragonhoof');
	ok('...mixed Invoke cards add up to "Invoked twice"', foe3.damage === 5);
	// class-agnostic: a run hero of a non-Galakrond class (Death Knight, as in r/deb4e467)
	const st4 = E.createGame(byId, seededRng(7), null, 2, [{ id: 'death_knight', name: 'A', power: null }, { id: 'warrior', name: 'B', power: null }]);
	st4.current = 0; for (const p of st4.players) { p.hand = []; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.armor = 0; }
	const foe4 = put(st4, 1, '_ogre');
	play(st4, 0, 'devoted_maniac'); play(st4, 0, 'shield_of_galakrond'); play(st4, 0, 'kronx_dragonhoof');
	ok('...also for a Death Knight hero (Lorequest Galakrond bucket)', foe4.damage === 5, foe4.damage);
}

// ---------- 9) EVIL Recruiter / Elder Nadox: only the named kind of friendly ----------
{
	const st = fresh();
	const torment = put(st, 0, '_demon'); // Ob Nixilis's Torment stand-in: a Demon, not a Lackey
	const rec = give(st, 0, 'evil_recruiter');
	ok('EVIL Recruiter offers no target without a Lackey', (legalUids(st, 0, rec) || []).length === 0, legalUids(st, 0, rec));
	E.playCard(st, 0, rec.uid, tc(torment), null, null); E.sweepDeaths(st);
	ok('...a non-Lackey is NOT destroyed (r/b76ff6ef)', st.players[0].board.includes(torment) && !E.isDead(torment));
	ok('...and no 5/5 Demon appears', !st.players[0].board.some(c => c.name === 'Demon'));
	const st2 = fresh(); const lk = put(st2, 0, 'lackey_kobold'); const other = put(st2, 0, '_demon');
	const rec2 = give(st2, 0, 'evil_recruiter');
	ok('...with a Lackey and a non-Lackey, only the Lackey is legal', JSON.stringify(legalUids(st2, 0, rec2)) === JSON.stringify([lk.uid]));
	E.playCard(st2, 0, rec2.uid, tc(lk), null, null); E.sweepDeaths(st2);
	ok('...the Lackey is destroyed and a 5/5 Demon is created', !st2.players[0].board.includes(lk) && st2.players[0].board.some(c => c.name === 'Demon' && c.attack === 5 && c.maxHealth === 5) && st2.players[0].board.includes(other));
	const st3 = fresh(); const bear = put(st3, 0, '_bear'); const und = put(st3, 0, '_undead');
	const nad = give(st3, 0, 'elder_nadox');
	ok('Elder Nadox offers only a friendly Undead', JSON.stringify(legalUids(st3, 0, nad)) === JSON.stringify([und.uid]), legalUids(st3, 0, nad));
	E.playCard(st3, 0, nad.uid, tc(bear), null, null); E.sweepDeaths(st3);
	ok('...and will not destroy a non-Undead', st3.players[0].board.includes(bear) && bear.attack === 2);
}

console.warn = _warn;
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
