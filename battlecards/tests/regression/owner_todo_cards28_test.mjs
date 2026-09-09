// Twenty-eighth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Chardalyn Dragon -> retribe "Mech Dragon"; add "(4): Create a 1/1 Mech".
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 61) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

const c = cardsById.chardalyn_dragon;

// ---------- card data ----------
ok('Chardalyn Dragon is a "Mech Dragon"', c.tribe === 'Mech Dragon', c.tribe);
ok('reads "Elusive & Trample.\\n(4): Create a 1/1 Mech."', c.description === 'Elusive & Trample.\n(4): Create a 1/1 Mech.', JSON.stringify(c.description));
ok('keeps Elusive & Trample keywords', ['elusive', 'trample'].every(k => c.keywords.includes(k)), JSON.stringify(c.keywords));
ok('activated ability costs 4 and summons a 1/1 Mech', c.activated?.[0]?.cost === 4 && c.activated[0].effects[0].type === 'summon' && c.activated[0].effects[0].attack === 1 && c.activated[0].effects[0].health === 1 && c.activated[0].effects[0].tribe === 'Mech', JSON.stringify(c.activated));

// ---------- FIRE the ability ----------
{
	const st = game();
	const drag = put(st, 0, E.instantiate(c, 0));
	const manaBefore = E.availableMana ? E.availableMana(st.players[0]) : st.players[0].mana.cur;
	const before = st.players[0].board.length;
	const used = E.activateAbility(st, 0, drag.uid, 0, null);
	ok('the ability activated', used === true, used);
	const mech = st.players[0].board.find(x => x.name === 'Mech' && x.attack === 1 && x.maxHealth === 1 && !E.isDead(x));
	ok('a 1/1 Mech token entered the battlefield', !!mech, st.players[0].board.map(x => `${x.name} ${x.attack}/${x.maxHealth}`));
	ok('the token is tribe Mech', !!mech && (mech.tribe || '').includes('Mech'), mech && mech.tribe);
	ok('board grew by exactly one (the Mech)', st.players[0].board.length === before + 1, st.players[0].board.length);
	ok('4 mana was spent', st.players[0].mana.cur === 10 - 4, st.players[0].mana.cur);
}

// ---------- costs too much: no mana -> cannot activate ----------
{
	const st = game();
	st.players[0].mana = { cur: 3, max: 3, bonus: 0 };
	const drag = put(st, 0, E.instantiate(c, 0));
	const used = E.activateAbility(st, 0, drag.uid, 0, null);
	ok('cannot activate with only 3 mana', used === false, used);
	ok('no Mech was made', !st.players[0].board.some(x => x.name === 'Mech'), st.players[0].board.map(x => x.name));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
