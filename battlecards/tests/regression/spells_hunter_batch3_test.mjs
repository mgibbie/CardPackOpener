// Hunter spell-import batch 3 — Beast summon/draw + Twinspell + conjure-secret.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'hunter', name: 'M', power: null }, { id: 'hunter', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'hunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const cast = (st, id, target = null, choice = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, target, choice, 0); return s; };
const enemy = (st, hp = 9) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 3, attack: 2, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const beast = (st, atk = 2, hp = 3) => { const m = E.instantiate({ id: 'b', name: 'B', type: 'creature', cost: 1, attack: atk, health: hp, tribe: 'Beast' }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };

for (const id of ['furious_howl', 'goblin_prank', 'rapid_fire', 'fresh_scent', 'toxic_arrow', 'hunters_pack', 'scavengers_ingenuity', 'story_of_carnassa', 'revive_pet', 'nurturing_nature', 'aimed_shot', 'infest'])
	ok(`${id} present`, cardsById[id], id);
for (const id of ['rapid_fire_ii', 'fresh_scent_ii', 'carnassas_brood', 'arcane_tripwire_token'])
	ok(`token ${id} present`, cardsById[id], id);

// Furious Howl: draw until you hold at least 3
{
	const st = game();
	st.players[0].deck = ['carnassas_brood', 'carnassas_brood', 'carnassas_brood', 'carnassas_brood'];
	cast(st, 'furious_howl'); // hand had just this spell (now 0), draw up to 3
	ok('Furious Howl drew up to 3 cards', st.players[0].hand.length === 3, st.players[0].hand.length);
}

// Goblin Prank: +3/+3 & Rush now, dies at end of THIS turn
{
	const st = game();
	const m = beast(st, 2, 2);
	cast(st, 'goblin_prank', { type: 'creature', uid: m.uid, player: 0 });
	ok('Goblin Prank buffed to 5/5', m.attack === 5 && m.maxHealth === 5, [m.attack, m.maxHealth]);
	ok('and granted Rush', m.keywords.includes('rush'), m.keywords);
	E.endTurn(st); // end of turn -> it dies
	ok('the minion died at end of turn', !st.players[0].board.some(c => c.uid === m.uid), st.players[0].board.map(c => c.name));
}

// Rapid Fire (Twinspell): deal 2 + add a Rapid Fire copy (no Twinspell) to hand
{
	const st = game();
	const foe = enemy(st, 9);
	cast(st, 'rapid_fire', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Rapid Fire dealt 2', foe.damage === 2, foe.damage);
	ok('Rapid Fire added its Twinspell copy (rapid_fire_ii) to hand', st.players[0].hand.some(c => c.id === 'rapid_fire_ii'), st.players[0].hand.map(c => c.id));
}

// Fresh Scent (Twinspell): buff a Beast +2/+2 + add the single-cast copy to hand
{
	const st = game();
	const m = beast(st, 2, 2);
	cast(st, 'fresh_scent', { type: 'creature', uid: m.uid, player: 0 });
	ok('Fresh Scent buffed the Beast to 4/4', m.attack === 4 && m.maxHealth === 4, [m.attack, m.maxHealth]);
	ok('Fresh Scent added its copy (fresh_scent_ii) to hand', st.players[0].hand.some(c => c.id === 'fresh_scent_ii'), st.players[0].hand.map(c => c.id));
}

// Toxic Arrow: 2 damage; if it survives, give it Poisonous
{
	const st = game();
	const foe = enemy(st, 9); // survives 2 -> gets Poisonous
	cast(st, 'toxic_arrow', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Toxic Arrow dealt 2', foe.damage === 2, foe.damage);
	ok('the survivor gained Poisonous', foe.keywords.includes('poisonous'), foe.keywords);
	const st2 = game();
	const small = enemy(st2, 2); // dies to 2 -> no Poisonous to grant (it's dead)
	cast(st2, 'toxic_arrow', { type: 'creature', uid: small.uid, player: 1 });
	ok('a killed minion is gone (not granted Poisonous)', !st2.players[1].board.some(c => c.uid === small.uid), st2.players[1].board.length);
}

// Hunter's Pack: add a random Hunter Beast, Secret, and weapon (the new conjure-secret branch)
{
	const st = game();
	cast(st, 'hunters_pack');
	const hand = st.players[0].hand.filter(c => c.id !== 'hunters_pack');
	ok('Hunter\'s Pack added 3 cards', hand.length === 3, hand.map(c => c.id));
	ok('one is a Secret', hand.some(c => c.type === 'secret' || c.secret), hand.map(c => c.type));
	ok('one is a weapon', hand.some(c => c.type === 'weapon'), hand.map(c => c.type));
	ok('one is a Beast creature', hand.some(c => c.type === 'creature' && (c.tribe || '').includes('Beast')), hand.map(c => c.type));
}

// Scavenger's Ingenuity: draw a Beast, give it +3/+3
{
	const st = game();
	st.players[0].deck = ['b_deck'];
	cardsById.b_deck = { id: 'b_deck', name: 'Pup', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Beast' };
	cast(st, 'scavengers_ingenuity');
	const drawn = st.players[0].hand.find(c => c.id === 'b_deck');
	ok('Scavenger\'s Ingenuity drew the Beast and buffed it to 5/5', drawn && drawn.attack === 5 && drawn.maxHealth === 5, drawn && [drawn.attack, drawn.maxHealth]);
}

// Story of Carnassa: shuffle ten Carnassa's Brood into your deck
{
	const st = game();
	cast(st, 'story_of_carnassa');
	ok('Story of Carnassa shuffled 10 Raptors into the deck', st.players[0].deck.filter(id => id === 'carnassas_brood').length === 10, st.players[0].deck.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
