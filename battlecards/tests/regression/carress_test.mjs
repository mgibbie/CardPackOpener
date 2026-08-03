// Carress, Cabaret Star: while in hand, cast two DIFFERENT spell schools to
// transform into one of 21 forms (every pair of 7 battlecry building blocks).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const FORMS = cardsById['carress_cabaret_star'].handTransformOnTwoSchools.forms;
ok('base wired with 21 forms', FORMS.length === 21 && FORMS.every(id => cardsById[id]));
ok('all forms are 3/3 Naga battlecries', FORMS.every(id => { const c = cardsById[id]; return c.attack === 3 && c.health === 3 && c.tribe === 'Naga' && c.keywords.includes('battlecry') && c.effects.length >= 2; }));

const game = () => {
	const st = E.createGame(cardsById, seededRng(2), null, 2, [{ id: 'mage', name: 'Mage', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = [];
	st.players[0].mana.max = 20; st.players[0].mana.cur = 20;
	return st;
};
// a spell of a given school (or none)
const spellOf = (school) => raw.cards.find(c => (c.type === 'sorcery' || c.type === 'instant') && c.tribe === school && !E.targetSpec({ players: [{}, {}] }, 0, c));
const fire = raw.cards.find(c => c.tribe === 'Fire' && (c.type === 'sorcery' || c.type === 'instant'))?.id;
const frost = raw.cards.find(c => c.tribe === 'Frost' && (c.type === 'sorcery' || c.type === 'instant'))?.id;
const play = (st, id) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); const spec = E.targetSpec(st, 0, cardsById[id]); let t = null; if (spec) { const legal = E.legalTargets(st, 0, spec); t = legal[0] || (spec.required ? undefined : null); } if (t !== undefined) E.playCard(st, 0, s.uid, t, null, 0); return t !== undefined; };

// one school -> no transform; second DIFFERENT school -> transform
{
	const st = game();
	const car = E.instantiate(cardsById['carress_cabaret_star'], 0); car.zone = 'hand'; st.players[0].hand.push(car);
	ok('has fire + frost spells to test with', fire && frost);
	play(st, fire);
	ok('after ONE school: still Carress (needs two DIFFERENT)', st.players[0].hand.some(c => c.id === 'carress_cabaret_star'));
	play(st, fire); // same school again -> still one distinct
	ok('after the same school twice: still Carress', st.players[0].hand.some(c => c.id === 'carress_cabaret_star'));
	play(st, frost); // second DISTINCT school -> transform
	const now = st.players[0].hand.find(c => c.uid === car.uid);
	ok('after a second DIFFERENT school: transformed into a form', now && FORMS.includes(now.id), now && now.id);
	ok('the form is one-way (no re-trigger)', now && !now.handTransformOnTwoSchools);
}

// a representative form's battlecry resolves (destroy2 + aoe2 form)
{
	const st = game();
	const mk = () => { const c = E.instantiate({ id: 'e', name: 'E', type: 'creature', cost: 1, rarity: 'basic', attack: 1, health: 2 }, 1); c.zone = 'board'; c.summonedThisTurn = false; st.players[1].board.push(c); return c; };
	mk(); mk(); mk();
	const formId = FORMS.find(id => id.includes('destroy2') && id.includes('aoe2'));
	const f = E.instantiate(cardsById[formId], 0); f.zone = 'hand'; st.players[0].hand.push(f);
	E.playCard(st, 0, f.uid, null, null, 0);
	// aoe2 (2 to all) kills the 1/2s OR destroy2 removes 2 -> board should be near-empty
	ok('form battlecry clears the enemy board (destroy 2 + 2 AoE)', st.players[1].board.filter(c => !(c.damage >= c.maxHealth)).length === 0, st.players[1].board.length);
}

// heal6+buff form: hero heals & the minion gains +2/+2 & Taunt
{
	const st = game(); st.players[0].life = 20;
	const formId = FORMS.find(id => id.includes('heal6') && id.includes('buff'));
	const f = E.instantiate(cardsById[formId], 0); f.zone = 'hand'; st.players[0].hand.push(f);
	E.playCard(st, 0, f.uid, null, null, 0);
	const onBoard = st.players[0].board.find(c => c.id === formId);
	ok('heal6+buff: hero +6 Health & minion is 5/5 Taunt', st.players[0].life === 26 && onBoard && onBoard.attack === 5 && E.hp(onBoard) === 5 && onBoard.keywords.includes('taunt'), [st.players[0].life, onBoard && onBoard.attack, onBoard && E.hp(onBoard)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
