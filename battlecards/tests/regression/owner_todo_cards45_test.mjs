// Forty-fifth batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   me_gm_whisper (Gríma Wormtongue's Night's Whisper) -> reword to
//   "Draw two cards & Lose 2 Life." (the Sign in Blood idiom). In this engine
//   "lose N Life" IS self-damage to own-hero (no distinct lose-life effect —
//   see noxious_cadaver / obliterate), so the mechanic is unchanged.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const def = cardsById.me_gm_whisper;
ok('me_gm_whisper reworded to Draw two cards & Lose 2 Life', def.description === 'Draw two cards & Lose 2 Life.', JSON.stringify(def.description));
ok('draws two cards', (def.effects || []).some(e => e.type === 'draw' && e.value === 2), JSON.stringify(def.effects));
ok('loses 2 Life (self-damage to own-hero)', (def.effects || []).some(e => e.type === 'damage' && e.value === 2 && e.target === 'own-hero'), JSON.stringify(def.effects));

// FIRE it: hand gains two cards, the caster loses exactly 2 Life
{
	const st = E.createGame(cardsById, seededRng(5), null, 2, [{ id: 'warlock', name: 'M', power: null }, { id: 'warlock', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.graveyard = []; }
	const p = st.players[0];
	p.deck = ['grizzly_bears', 'grizzly_bears', 'grizzly_bears'];
	p.mana = { cur: 10, max: 10, bonus: 0 };
	const life0 = p.life;
	const c = E.instantiate(def, 0); c.zone = 'hand'; p.hand.push(c);
	E.playCard(st, 0, c.uid, null, null, 0);
	ok('drew two cards', p.hand.length === 2, p.hand.map(x => x.id));
	ok('lost exactly 2 Life', p.life === life0 - 2, [life0, p.life]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
