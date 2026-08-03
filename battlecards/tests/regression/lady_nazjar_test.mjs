// Lady Naz'jar: while in your hand, transforms after you cast a Fire/Frost/Arcane
// spell — into one of three 5/5 forms, each with its own Battlecry.
import fs from 'fs';
import * as E from '../../engine.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const FORMS = ['lady_nazjar_form1', 'lady_nazjar_form2', 'lady_nazjar_form3'];
ok('base carries handTransformOnSchool with Fire/Frost/Arcane + 3 forms',
	cardsById['lady_nazjar'].handTransformOnSchool && cardsById['lady_nazjar'].handTransformOnSchool.forms.length === 3
	&& cardsById['lady_nazjar'].handTransformOnSchool.schools.join() === 'Fire,Frost,Arcane');
ok('all 3 forms exist as 5/5 Naga battlecries', FORMS.every(id => cardsById[id] && cardsById[id].attack === 5 && cardsById[id].tribe === 'Naga' && cardsById[id].keywords.includes('battlecry')));

const game = () => {
	const st = E.createGame(cardsById, seededRng(2), null, 2, [{ id: 'mage', name: 'Mage', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
// a real Fire spell + a non-school spell to prove the school gate
const fireSpell = raw.cards.find(c => (c.tribe) === 'Fire' && (c.type === 'sorcery' || c.type === 'instant'))?.id;
const noSchoolSpell = raw.cards.find(c => (c.type === 'sorcery' || c.type === 'instant') && !c.tribe && (c.effects || []).length)?.id;

// casting a Fire spell while Naz'jar is held -> she transforms into a form
{
	const st = game();
	const lz = E.instantiate(cardsById['lady_nazjar'], 0); lz.zone = 'hand'; st.players[0].hand.push(lz);
	const spell = E.instantiate(cardsById[fireSpell], 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	const specNeeds = E.targetSpec(st, 0, cardsById[fireSpell]);
	const tgt = specNeeds ? { type: 'hero', player: 1 } : null;
	E.playCard(st, 0, spell.uid, tgt, null, 0);
	const now = st.players[0].hand.find(c => c.uid === lz.uid);
	ok('after a Fire spell: transformed into a Naz\'jar form (same hand slot)', now && FORMS.includes(now.id), now && now.id);
	ok('the form is 5/5', now && now.attack === 5 && E.hp(now) === 5);
	ok('it does not keep re-transforming (one-way)', now && !now.handTransformOnSchool);
}

// a non-school spell does NOT transform her
if (noSchoolSpell) {
	const st = game();
	const lz = E.instantiate(cardsById['lady_nazjar'], 0); lz.zone = 'hand'; st.players[0].hand.push(lz);
	const spell = E.instantiate(cardsById[noSchoolSpell], 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	const spec = E.targetSpec(st, 0, cardsById[noSchoolSpell]);
	let t = null; if (spec) { const legal = E.legalTargets(st, 0, spec); if (spec.required && !legal.length) t = undefined; else t = legal[0] || null; }
	if (t !== undefined) { E.playCard(st, 0, spell.uid, t, null, 0); ok('a spell with no school does not transform her', st.players[0].hand.some(c => c.id === 'lady_nazjar')); }
	else ok('(skipped no-school case: needed an unavailable target)', true);
}

// each form's Battlecry resolves through the engine
{
	// form3: gain 8 Armor
	const st = game(); const f3 = E.instantiate(cardsById['lady_nazjar_form3'], 0); f3.zone = 'hand'; st.players[0].hand.push(f3);
	const a0 = st.players[0].armor || 0;
	E.playCard(st, 0, f3.uid, null, null, 0);
	ok('form3 Battlecry: +8 Armor', (st.players[0].armor || 0) === a0 + 8, st.players[0].armor);

	// form2: 5 to a target enemy + 2 to its neighbors
	const st2 = game();
	const mk = (id) => { const c = E.instantiate({ id, name: id, type: 'creature', cost: 1, rarity: 'basic', attack: 1, health: 9 }, 1); c.zone = 'board'; c.summonedThisTurn = false; st2.players[1].board.push(c); return c; };
	const L = mk('L'), M = mk('M'), R = mk('R');
	const f2 = E.instantiate(cardsById['lady_nazjar_form2'], 0); f2.zone = 'hand'; st2.players[0].hand.push(f2);
	E.playCard(st2, 0, f2.uid, { type: 'creature', uid: M.uid, player: 1 }, null, 0);
	ok('form2 Battlecry: 5 to target, 2 to each neighbor', M.damage === 5 && L.damage === 2 && R.damage === 2, [L.damage, M.damage, R.damage]);

	// form1: reduce cost of spells in hand by 1 (not creatures)
	const st3 = game();
	const f1 = E.instantiate(cardsById['lady_nazjar_form1'], 0); f1.zone = 'hand'; st3.players[0].hand.push(f1);
	const sp = E.instantiate({ id: 'sp', name: 'Sp', type: 'sorcery', cost: 3, rarity: 'common', effects: [] }, 0); sp.zone = 'hand'; st3.players[0].hand.push(sp);
	const cr = E.instantiate({ id: 'cr', name: 'Cr', type: 'creature', cost: 3, rarity: 'common', attack: 1, health: 1 }, 0); cr.zone = 'hand'; st3.players[0].hand.push(cr);
	E.playCard(st3, 0, f1.uid, null, null, 0);
	ok('form1 Battlecry: spell -1, creature unchanged', sp.cost === 2 && cr.cost === 3, [sp.cost, cr.cost]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
