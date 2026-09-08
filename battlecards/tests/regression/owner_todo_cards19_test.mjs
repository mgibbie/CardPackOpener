// Nineteenth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//
//   Colossodon Yearling -> Taunt & Cleave.
//   Elvish Ranger       -> Rush & Divine Shield.
//   Archers of Qarsi    -> Defender & Impulsive.
//   Assault Zeppelid    -> retag Alien Beast; add "Deathrattle: Planeshift".
//   Durkwood Boars      -> a 2/5 for 4 with Trample & Swift.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const byId = cardsById;

// ---------- declarative / stat changes ----------
ok('Colossodon Yearling: Taunt & Cleave', ['taunt', 'cleave'].every(k => byId.colossodon_yearling.keywords.includes(k)), JSON.stringify(byId.colossodon_yearling.keywords));
ok('Elvish Ranger: Rush & Divine Shield', ['rush', 'divine_shield'].every(k => byId.elvish_ranger.keywords.includes(k)), JSON.stringify(byId.elvish_ranger.keywords));
ok('Archers of Qarsi: Defender & Impulsive', ['defender', 'impulsive'].every(k => byId.archers_of_qarsi.keywords.includes(k)), JSON.stringify(byId.archers_of_qarsi.keywords));
{
	const c = byId.durkwood_boars;
	ok('Durkwood Boars is a 2/5 for 4 with Trample & Swift', c.attack === 2 && c.health === 5 && c.cost === 4 && ['trample', 'first_strike'].every(k => c.keywords.includes(k)), JSON.stringify([c.attack, c.health, c.cost, c.keywords]));
}
{
	const c = byId.assault_zeppelid;
	ok('Assault Zeppelid is now an Alien Beast', c.tribe === 'Alien Beast', c.tribe);
	ok('Assault Zeppelid: Deathrattle Planeshift wired', c.keywords.includes('deathrattle') && c.deathrattle?.[0]?.type === 'planeshift', JSON.stringify([c.keywords, c.deathrattle]));
}

// ---------- FIRE: Assault Zeppelid's Deathrattle shifts the plane ----------
{
	const st = E.createGame(cardsById, seededRng(41), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	const planePool = Object.values(cardsById).filter(d => d.type === 'plane');
	ok('there are planes to shift to', planePool.length > 0, planePool.length);
	const z = E.instantiate(cardsById.assault_zeppelid, 0); z.zone = 'board'; st.players[0].board.push(z);
	const before = st.plane || null;
	z.damage = z.maxHealth;
	E.sweepDeaths(st);
	ok('Deathrattle: Planeshift set a new active plane', !!st.plane && st.plane !== before && cardsById[st.plane]?.type === 'plane', ['from', before, 'to', st.plane]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
