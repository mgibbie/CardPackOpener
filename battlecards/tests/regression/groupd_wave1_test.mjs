// Group D (turn triggers) wave 1 — "At the end of your turn, get a token / random
// card" via ongoing:{on:'turn-end', effects}.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 20) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	return st;
};
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

for (const id of ['whelp_wrangler', 'tentacle_tender', 'selenic_drake', 'daydreaming_pixie', 'voodoo_totem'])
	ok(`${id} carries a turn-end ongoing`, cardsById[id].ongoing && cardsById[id].ongoing.on === 'turn-end', id);
ok('selenic_drake gained its Elusive keyword', cardsById['selenic_drake'].keywords.includes('elusive'));

// Whelp Wrangler: end of turn -> a 1/2 Whelp with Taunt to hand
{
	const st = game(); put(st, 0, 'whelp_wrangler'); const h0 = st.players[0].hand.length;
	E.endTurn(st);
	const w = st.players[0].hand.find(c => c.name === 'Whelp');
	ok('Whelp Wrangler: a 1/2 Taunt Whelp is added to hand', w && w.attack === 1 && E.hp(w) === 2 && w.keywords.includes('taunt'), w && [w.attack, E.hp(w)]);
	ok('it only fired at YOUR turn end (hand grew by exactly 1)', st.players[0].hand.length === h0 + 1);
}
// Tentacle Tender: end of turn -> a 1/1 Chaotic Tendril
{
	const st = game(); put(st, 0, 'tentacle_tender');
	E.endTurn(st);
	ok('Tentacle Tender: a Chaotic Tendril is added', st.players[0].hand.some(c => c.id === 'token_chaotic_tendril'));
}
// Selenic Drake: end of turn -> a random Dragon
{
	const st = game(); put(st, 0, 'selenic_drake');
	E.endTurn(st);
	const d = st.players[0].hand.find(c => (cardsById[c.id]?.tribe || '').includes('Dragon'));
	ok('Selenic Drake: a random Dragon is added to hand', !!d, st.players[0].hand.map(c => c.id));
}
// Daydreaming Pixie: end of turn -> a random Nature spell
{
	const st = game(); put(st, 0, 'daydreaming_pixie');
	E.endTurn(st);
	const s = st.players[0].hand.find(c => { const d = cardsById[c.id]; return d && (d.type === 'sorcery' || d.type === 'instant') && (d.tribe === 'Nature'); });
	ok('Daydreaming Pixie: a random Nature spell is added', !!s, st.players[0].hand.map(c => c.id));
}
// Voodoo Totem: end of turn -> a random Shadow spell
{
	const st = game(); put(st, 0, 'voodoo_totem');
	E.endTurn(st);
	const s = st.players[0].hand.find(c => { const d = cardsById[c.id]; return d && (d.type === 'sorcery' || d.type === 'instant') && (d.tribe === 'Shadow'); });
	ok('Voodoo Totem: a random Shadow spell is added', !!s, st.players[0].hand.map(c => c.id));
}
// only fires on the controller's turn end, not the opponent's
{
	const st = game(); put(st, 0, 'whelp_wrangler');
	st.current = 1; E.endTurn(st); // opponent's turn ends
	ok('does NOT fire on the opponent\'s turn end', !st.players[0].hand.some(c => c.name === 'Whelp'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
