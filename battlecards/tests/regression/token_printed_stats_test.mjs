// token_printed_stats_test.mjs — an inline summoned token must know its PRINTED body.
//
// Reported (Lorequest, Tezzeret): a token's tooltip showed "Modifiers — +5/+5" on a
// freshly summoned 5/5 Construct that had gained nothing.
//
// Cause: tokens summoned with inline stats (Thopter / Construct / Servo …) are built
// at summon time and have NO entry in state.cardsById. The UI recovered a card's
// printed body via cardsById[card.id] and fell back to {} — so a token's ENTIRE body
// read as a gained modifier (+5/+5), and the board token lost the baseline it uses to
// colour buffed stats.
//
// Fix: instantiate() freezes printedAttack/printedHealth on every instance, so the
// baseline is always available — including for tokens, and across a snapshot restore.
import fs from 'fs';
import * as E from '../../engine.js';
import { toSnapshot, fromSnapshot } from '../../engine/serialize.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

// the UI's modifier math (modifierLinesHtml), with its def fallback
const modifierDelta = (card, cardsById) => {
	const def = cardsById[card.id]
		|| { attack: card.printedAttack ?? card.attack, health: card.printedHealth ?? card.maxHealth, keywords: card.keywords || [] };
	return [(card.attack || 0) - (def.attack || 0) - (card.tempAttack || 0), (card.maxHealth || 0) - (def.health || 0)];
};

function fresh() {
	const st = E.createGame(byId, seededRng(71), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}

// ---- 1) the reported case: Tezzeret's 5/5 Construct has NO modifiers ----
{
	const st = fresh();
	E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 5, health: 5, name: 'Construct', tribe: 'Construct' }], null, null);
	const tok = st.players[0].board.find(c => c.name === 'Construct');
	ok('the Construct token was summoned', !!tok, st.players[0].board.map(c => c.name).join(','));
	ok('it has no cardsById def (inline token) — the condition that caused the bug', !st.cardsById[tok.id], tok.id);
	ok('it carries its printed body 5/5', tok.printedAttack === 5 && tok.printedHealth === 5, [tok.printedAttack, tok.printedHealth].join('/'));
	ok('board stats are 5/5', tok.attack === 5 && tok.maxHealth === 5, [tok.attack, tok.maxHealth].join('/'));
	ok('MODIFIERS ARE 0/0 (was the fabricated +5/+5)', modifierDelta(tok, st.cardsById).join('/') === '0/0', modifierDelta(tok, st.cardsById).join('/'));
	ok('its description matches the printed body', tok.description === 'A 5/5 token.', tok.description);
}

// ---- 2) a 1/1 Thopter likewise reports nothing gained ----
{
	const st = fresh();
	E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Thopter', tribe: 'Thopter', keywords: ['elusive'] }], null, null);
	const tok = st.players[0].board.find(c => c.name === 'Thopter');
	ok('Thopter printed 1/1', tok.printedAttack === 1 && tok.printedHealth === 1, [tok.printedAttack, tok.printedHealth].join('/'));
	ok('Thopter shows no stat modifiers (was +1/+1)', modifierDelta(tok, st.cardsById).join('/') === '0/0', modifierDelta(tok, st.cardsById).join('/'));
	ok('it is named Thopter, not Construct', tok.name === 'Thopter' && tok.description === 'A 1/1 token.', [tok.name, tok.description].join(' | '));
}

// ---- 3) a REAL buff on a token still reports the true delta ----
{
	const st = fresh();
	E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 5, health: 5, name: 'Construct', tribe: 'Construct' }], null, null);
	const tok = st.players[0].board.find(c => c.name === 'Construct');
	E.execEffects(st, 0, [{ type: 'buff', target: 'friendly-creatures', attack: 2, health: 3 }], null, null);
	ok('buffed to 7/8', tok.attack === 7 && tok.maxHealth === 8, [tok.attack, tok.maxHealth].join('/'));
	ok('printed body is untouched by the buff', tok.printedAttack === 5 && tok.printedHealth === 5, [tok.printedAttack, tok.printedHealth].join('/'));
	ok('modifiers report the REAL gain (+2/+3)', modifierDelta(tok, st.cardsById).join('/') === '2/3', modifierDelta(tok, st.cardsById).join('/'));
}

// ---- 4) the baseline survives a snapshot restore (resume keeps tooltips honest) ----
{
	const st = fresh();
	E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 5, health: 5, name: 'Construct', tribe: 'Construct' }], null, null);
	const st2 = fromSnapshot(toSnapshot(st), byId, seededRng(71));
	const tok = st2.players[0].board.find(c => c.name === 'Construct');
	ok('restored token keeps its printed body', tok && tok.printedAttack === 5 && tok.printedHealth === 5, tok && [tok.printedAttack, tok.printedHealth].join('/'));
	ok('restored token still reports 0/0 modifiers', modifierDelta(tok, st2.cardsById).join('/') === '0/0', modifierDelta(tok, st2.cardsById).join('/'));
}

// ---- 5) a normal (non-token) card is unaffected: def still drives the baseline ----
{
	const st = fresh();
	const def = Object.values(byId).find(d => d.type === 'creature' && d.attack > 0 && d.health > 0 && !d.token);
	const c = E.instantiate(def, 0); c.zone = 'board'; c.sick = false; st.players[0].board.push(c);
	ok('a printed card records its printed body too', c.printedAttack === def.attack && c.printedHealth === def.health, [c.printedAttack, c.printedHealth].join('/'));
	ok('an unbuffed printed card shows no modifiers', modifierDelta(c, st.cardsById).join('/') === '0/0', modifierDelta(c, st.cardsById).join('/'));
	c.attack += 4; c.maxHealth += 1;
	ok('and a buffed one reports the delta from its DEF', modifierDelta(c, st.cardsById).join('/') === '4/1', modifierDelta(c, st.cardsById).join('/'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
