// Thirty-third batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Questing Beast -> drop Haste (charge); add "Alliance, Frenzy & Inspire:
//     Gain +1/+1" (three triggers -> creature-played / self-damaged(once) /
//     hero-power-used, each +1/+1).
//   Rumbling Baloth -> add "Connect: Add a Green card to each player's hand"
//     (self-hit-player -> conjure a Forest-pool card for every player).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 77) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };
const zapAt = (st, pi, tgtUid, tgtPlayer, val = 2) => { const sp = E.instantiate({ id: 'zap', name: 'Zap', type: 'sorcery', cost: 1, effects: [{ type: 'damage', value: val, target: 'creature' }] }, pi); sp.zone = 'hand'; st.players[pi].hand.push(sp); st.players[pi].mana.cur = 10; E.playCard(st, pi, sp.uid, { type: 'creature', uid: tgtUid, player: tgtPlayer }, null, 0); };

// ---------- Questing Beast: card data ----------
{
	const c = cardsById.questing_beast;
	ok('Haste is gone (no charge keyword)', !(c.keywords || []).includes('charge'), JSON.stringify(c.keywords));
	ok('keeps Deathtouch', (c.keywords || []).includes('deathtouch'), JSON.stringify(c.keywords));
	ok('reads "Deathtouch.\\nAlliance, Frenzy & Inspire: Gain +1/+1."', c.description === 'Deathtouch.\nAlliance, Frenzy & Inspire: Gain +1/+1.', JSON.stringify(c.description));
	const ons = (c.ongoings || []).map(o => o.on);
	ok('carries the three triggers (creature-played / self-damaged / hero-power-used)', ['creature-played', 'self-damaged', 'hero-power-used'].every(o => ons.includes(o)), JSON.stringify(ons));
	const frenzy = (c.ongoings || []).find(o => o.on === 'self-damaged');
	ok('Frenzy is a one-time, survives-only trigger', frenzy && frenzy.once === true && frenzy.survives === true, JSON.stringify(frenzy));
}

// ---------- Alliance: playing another creature grows it +1/+1 ----------
{
	const st = game();
	const beast = put(st, 0, E.instantiate(cardsById.questing_beast, 0)); // 4/4
	const other = E.instantiate({ id: 'o', name: 'O', type: 'creature', cost: 1, attack: 1, health: 1 }, 0);
	E.fireOngoing(st, 0, 'creature-played', { minion: other });
	ok('Alliance grew it +1/+1 (4/4 -> 5/5)', beast.attack === 5 && beast.maxHealth === 5, [beast.attack, beast.maxHealth]);
}

// ---------- Frenzy: first survived hit grows it +1/+1, then never again ----------
{
	const st = game();
	const beast = put(st, 0, E.instantiate(cardsById.questing_beast, 0)); // 4/4
	zapAt(st, 0, beast.uid, 0, 2); // survives -> Frenzy fires
	ok('Frenzy grew it +1/+1 on the first survived hit (5/5)', beast.attack === 5 && beast.maxHealth === 5, [beast.attack, beast.maxHealth]);
	zapAt(st, 0, beast.uid, 0, 1); // survives again -> Frenzy already spent
	ok('Frenzy does NOT fire a second time (still 5/5)', beast.attack === 5 && beast.maxHealth === 5, [beast.attack, beast.maxHealth]);
}

// ---------- Inspire: using your Hero Power grows it +1/+1 ----------
{
	const st = game();
	const beast = put(st, 0, E.instantiate(cardsById.questing_beast, 0)); // 4/4
	E.fireOngoing(st, 0, 'hero-power-used', {});
	ok('Inspire grew it +1/+1 (5/5)', beast.attack === 5 && beast.maxHealth === 5, [beast.attack, beast.maxHealth]);
}

// ---------- Rumbling Baloth: Connect -> a Green card for each player ----------
{
	const c = cardsById.rumbling_baloth;
	ok('reads "Trample.\\nConnect: Add a Green card to each player\'s hand."', c.description === "Trample.\nConnect: Add a Green card to each player's hand.", JSON.stringify(c.description));
	ok('Connect conjures a Forest-pool card for every player', c.ongoing?.on === 'self-hit-player' && c.ongoing.effects[0].type === 'conjure' && c.ongoing.effects[0].landSet === 'Forest' && c.ongoing.effects[0].eachPlayer === true, JSON.stringify(c.ongoing));

	const st = game();
	const baloth = put(st, 0, E.instantiate(c, 0));
	const h0 = st.players[0].hand.length, h1 = st.players[1].hand.length;
	E.attack(st, 0, baloth.uid, { type: 'hero', player: 1 });
	ok('the attacker gained a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]);
	ok('the opponent gained a card too', st.players[1].hand.length === h1 + 1, [h1, st.players[1].hand.length]);
	const mine = st.players[0].hand[st.players[0].hand.length - 1];
	const theirs = st.players[1].hand[st.players[1].hand.length - 1];
	ok('both new cards are Green (Forest-pool)', cardsById[mine.id]?.landSet === 'Forest' && cardsById[theirs.id]?.landSet === 'Forest', [mine.id, theirs.id].map(id => cardsById[id]?.landSet));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
