// token_text_test.mjs — a summoned token's text must describe the token.
//
// Reported: "Tezzeret Thopter tooltip mismatch — the tooltip text/stats did not
// match the token's actual behavior."
//
// CAUSE. The generic summon handler built every inline token's face text as:
//     description: opt.description || `A ${opt.attack}/${opt.health} token.`
// which names neither the token nor its KEYWORDS. Tezzeret's Scheme summons
//     { name: 'Thopter', attack: 1, health: 1, keywords: ['elusive'] }
// so the token genuinely HAS Elusive — and read as "A 1/1 token." The data was
// right the whole time; the text was describing nothing.
//
// That is a real play problem beyond cosmetics: a token whose face does not
// mention Taunt looks like it will not block, and one that does not mention
// Divine Shield looks like it will die to the first hit.
//
//   node battlecards/tests/regression/token_text_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

const HUMAN = 0;
function game() {
	const st = E.createGame(byId, seededRng(17), null, 2,
		[{ id: 'mage', name: 'You', power: null }, { id: 'mage', name: 'Foe', power: null }]);
	st.current = HUMAN; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
}
// run a card's own effect list — playCard puts a sorcery on the stack, which
// needs a full priority round to resolve, and this test is about the TEXT the
// token ends up wearing, not the stack
function tokensFrom(id) {
	const st = game();
	E.execEffects(st, HUMAN, byId[id].effects, null, null);
	return st.players[HUMAN].board;
}

// ---------- the reported card ----------
{
	const toks = tokensFrom('tezzeret_scheme');   // "Summon two 1/1 Thopters with Elusive."
	ok("Tezzeret's Scheme summons two tokens", toks.length === 2, 'got ' + toks.length);
	const t = toks[0];
	if (t) {
		ok('the Thopter really has Elusive', E.has(t, 'elusive'), JSON.stringify(t.keywords));
		ok('its text names the token, not "token"', /Thopter/.test(t.description || ''), t.description);
		ok('its text mentions Elusive, matching its behaviour', /Elusive/i.test(t.description || ''), t.description);
		ok('its text carries its real stats', new RegExp(`${t.attack}/${t.maxHealth}`).test(t.description || ''),
			`${t.attack}/${t.maxHealth} vs "${t.description}"`);
	}
}

// ---------- a token with NO keywords stays plain ----------
{
	const st2 = game();
	E.execEffects(st2, HUMAN, [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Construct', tribe: 'Construct' }], null, null);
	const c = st2.players[HUMAN].board[0];
	ok('a keyword-less token reads plainly', c && /^A 2\/2 Construct\.$/.test(c.description || ''), c && c.description);
}

// ---------- several keywords read as a list ----------
{
	const st = game();
	E.execEffects(st, HUMAN, [{ type: 'summon', count: 1, attack: 3, health: 3, name: 'Golem', keywords: ['taunt', 'divine_shield'] }], null, null);
	const c = st.players[HUMAN].board[0];
	ok('multiple keywords are listed', c && /Taunt and Divine Shield/.test(c.description || ''), c && c.description);
	ok('and the token has both', c && E.has(c, 'taunt') && E.has(c, 'divine_shield'), c && JSON.stringify(c.keywords));
}

// ---------- an explicit description is still respected ----------
{
	const st = game();
	E.execEffects(st, HUMAN, [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Sheep', description: 'A hand-written line.' }], null, null);
	const c = st.players[HUMAN].board[0];
	ok('an authored description wins over the generated one', c && c.description === 'A hand-written line.', c && c.description);
}

// ---------- and the invariant, across every inline token in the game ----------
{
	// no summoned token may claim a keyword it lacks, or hide one it has
	const st = game();
	let checked = 0, bad = [];
	for (const def of Object.values(byId)) {
		const eff = [].concat(def.effects || [], def.ongoing?.effects || [], def.deathrattle || []);
		for (const e of eff) {
			if (!e || e.type !== 'summon' || !e.name || e.description || !(e.keywords || []).length) continue;
			const s2 = game();
			E.execEffects(s2, HUMAN, [{ ...e, count: 1 }], null, null);
			const c = s2.players[HUMAN].board[0];
			if (!c) continue;
			checked++;
			for (const k of e.keywords) {
				const label = String(k).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
				if (!new RegExp(label, 'i').test(c.description || '')) bad.push(`${def.id}: "${c.description}" omits ${label}`);
			}
		}
	}
	ok(`every inline token's text lists its keywords (${checked} checked)`, bad.length === 0,
		'\n    ' + bad.slice(0, 8).join('\n    '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
