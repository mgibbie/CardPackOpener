// Forty-fourth batch from the wiki's owner inbox (owner_todo), 2026-09-11.
// All four are Middle-earth "Aragorn" lorequest cards.
//   me_aragorn_rally     -> add Twinspell (conjures a single-cast me_aragorn_rally_ii copy)
//   me_aragorn_anduril   -> reword to "Swift. / Swing: Creatures you control gain +1 Attack." (mechanic unchanged)
//   me_aragorn_ithilien  -> Battlecry now grants BOTH Swift AND Taunt to the target
//   me_aragorn_whitetree -> reword to "At the start of your turn, creatures you control gain +1 Attack." (mechanic unchanged)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 44) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'paladin', name: 'M', power: null }, { id: 'paladin', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};
const putCreature = (st, pi, atk = 2, hp = 3) => { const c = E.instantiate({ id: 'grunt', name: 'Grunt', type: 'creature', cost: 1, attack: atk, health: hp }, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, target, null, 0); return s; };

// ---------- 1) Rally at the Hornburg: Twinspell ----------
{
	const def = cardsById.me_aragorn_rally;
	ok('Rally text names Twinspell', /Twinspell/.test(def.description), JSON.stringify(def.description));
	ok('Rally conjures its _ii twin', (def.effects || []).some(e => e.type === 'conjure-id' && e.id === 'me_aragorn_rally_ii'), JSON.stringify(def.effects));

	const twin = cardsById.me_aragorn_rally_ii;
	ok('me_aragorn_rally_ii exists', !!twin, 'missing twin');
	ok('the twin is uncollectible', twin && twin.collectible === false, twin && twin.collectible);
	ok('the twin is not draftable (no meDeck tag)', twin && twin.meDeck === undefined, twin && twin.meDeck);
	ok('the twin does NOT re-conjure (no Twinspell loop)', twin && !(twin.effects || []).some(e => e.type === 'conjure-id'), twin && JSON.stringify(twin.effects));

	// FIRE it: buffs the whole friendly board +1/+1 and drops the twin into hand
	const st = game();
	const g = putCreature(st, 0, 2, 3);
	cast(st, 'me_aragorn_rally');
	ok('Rally buffs friendly creatures +1/+1 (2/3 -> 3/4)', g.attack === 3 && g.maxHealth === 4, [g.attack, g.maxHealth]);
	ok('Rally added me_aragorn_rally_ii to hand', st.players[0].hand.some(c => c.id === 'me_aragorn_rally_ii'), st.players[0].hand.map(c => c.id));
	// play the twin Twinspell actually conjured (not a fresh one): buffs again, adds no further copy
	const conjured = st.players[0].hand.find(c => c.id === 'me_aragorn_rally_ii');
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, conjured.uid, null, null, 0);
	ok('the twin buffs again (3/4 -> 4/5)', g.attack === 4 && g.maxHealth === 5, [g.attack, g.maxHealth]);
	ok('the twin adds no second copy', st.players[0].hand.filter(c => c.id === 'me_aragorn_rally_ii').length === 0, st.players[0].hand.map(c => c.id));
}

// ---------- 2) Andúril: Swing wording, mechanic unchanged (equip weapon, hero swings) ----------
{
	const def = cardsById.me_aragorn_anduril;
	ok('Andúril text uses Swift + Swing', def.description === 'Swift.\nSwing: Creatures you control gain +1 Attack.', JSON.stringify(def.description));
	ok('Andúril keeps Swift (first_strike)', (def.keywords || []).includes('first_strike'), JSON.stringify(def.keywords));
	ok('Andúril still triggers on the hero swinging (hero-attacks)', def.ongoing && def.ongoing.on === 'hero-attacks', JSON.stringify(def.ongoing));

	const st = game();
	const g = putCreature(st, 0, 2, 3);
	const w = E.instantiate(def, 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10;
	E.playCard(st, 0, w.uid, null, null, 0); // equip
	ok('Andúril equipped to the hero', !!st.players[0].weapon, st.players[0].weapon);
	E.fireOngoing(st, 0, 'hero-attacks', {});
	ok('a Swing gives your creatures +1 Attack (2 -> 3)', g.attack === 3 && g.maxHealth === 3, [g.attack, g.maxHealth]);
}

// ---------- 3) Rangers of Ithilien: Battlecry grants Swift AND Taunt ----------
{
	const def = cardsById.me_aragorn_ithilien;
	ok('Ithilien text grants Swift & Taunt', def.description === 'Battlecry: Target creature gains Swift & Taunt.', JSON.stringify(def.description));
	const grants = (def.effects || []).filter(e => e.type === 'grant').map(e => e.keyword).sort();
	ok('Ithilien data grants both first_strike and taunt', grants.join(',') === 'first_strike,taunt', grants);

	const st = game();
	const t = putCreature(st, 0, 2, 3);
	cast(st, 'me_aragorn_ithilien', { type: 'creature', uid: t.uid });
	ok('the target gains Swift', (t.keywords || []).includes('first_strike'), JSON.stringify(t.keywords));
	ok('the target gains Taunt', (t.keywords || []).includes('taunt'), JSON.stringify(t.keywords));
}

// ---------- 4) Flowering of the White Tree: reworded, mechanic unchanged ----------
{
	const def = cardsById.me_aragorn_whitetree;
	ok('White Tree reworded to +1 Attack at turn start', def.description === 'At the start of your turn, creatures you control gain +1 Attack.', JSON.stringify(def.description));
	ok('White Tree still triggers on turn-start', def.ongoing && def.ongoing.on === 'turn-start', JSON.stringify(def.ongoing));

	const st = game();
	const g = putCreature(st, 0, 2, 3);
	st.players[0].enchantments.push(E.instantiate(def, 0));
	E.fireOngoing(st, 0, 'turn-start', {});
	ok('turn start gives your creatures +1 Attack (2 -> 3)', g.attack === 3 && g.maxHealth === 3, [g.attack, g.maxHealth]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
