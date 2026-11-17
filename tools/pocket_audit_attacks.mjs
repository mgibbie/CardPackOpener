// Pocket Enhanced: an audit by play. Every attack of every Pokémon card is used once (three seeds) on a plain table:
// the attacker in Active A with exactly the Energy the attack costs, a healthy Benched Pokémon beside it, and two
// opposing Active Pokémon and one Benched. What is reported:
//   THROW     the engine failed (never acceptable)
//   REFUSED   the engine would not take the attack on that table (listed by reason: most need something the table lacks)
//   NO-ATTACK the attack was taken but never happened and nothing says why
//   BASE      the damage line's base number is not the card's printed damage, for an attack with no effect at all
//   STATE     after the attack a count is impossible (damage below 0, not a number, a card gained or lost)
//   TEXT      a number in a card's rules text (attack, Ability or Trainer) that its structured effect does not have
//   node tools/pocket_audit_attacks.mjs [--json]
import { CARDS, card } from '../pocketenhanced/js/data/cards.js';
import * as E from '../pocketenhanced/js/engine/engine.js';
import { STARTERS, starterDeck } from '../pocketenhanced/js/decks.js';
import { nextAction } from '../pocketenhanced/js/ai.js';

const REAL = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'];
const wall = CARDS.find(c => c.name === 'Snorlax' && c.kind === 'pokemon').id, spare = CARDS.find(c => c.name === 'Rattata' && c.kind === 'pokemon').id;
function arena(seed) {
	const S = E.createGame({ seed, rules: E.RULES, players: [0, 1].map(i => ({ name: 'P' + (i + 1), ...starterDeck(STARTERS[i].id) })) });
	for (const p of S.players) { const b = p.hand.findIndex(c => card(c).kind === 'pokemon' && card(c).stage === 0); E.apply(S, { t: 'setup', seat: p.seat, active: [b], bench: [] }); }
	for (const p of S.players) { p.turns = 1; for (const k of [...p.active, ...p.bench]) if (k) p.deck.push(...k.cards); p.active = [null, null]; p.bench = [null, null, null, null]; p.flags = {}; }   // (the opening Pokémon go back to the deck: every card stays counted)
	S.order = [0, 1]; S.first = 0; S.current = 0; S.turn = 10;
	return S;
}
const put = (S, seat, zone, idx, cid, o = {}) => { const k = E.makePoke(S, cid); k.turnPlayed = -1; Object.assign(k, o); S.players[seat][zone][idx] = k; return k; };
const count = S => S.players.map(p => p.deck.length + p.hand.length + p.discard.length + [...p.active, ...p.bench].filter(Boolean).reduce((n, k) => n + k.cards.length + (k.tool ? 1 : 0) + (k.tool2 ? 1 : 0), 0)).reduce((a, b) => a + b, 0) + (S.stadium ? 1 : 0);
const out = { attacks: 0, ok: 0, THROW: [], REFUSED: {}, 'NO-ATTACK': [], BASE: [], STATE: [] };
const seen = new Set();
for (const c of CARDS) {
	if (c.kind !== 'pokemon') continue;
	(c.attacks || []).forEach((a, ai) => {
		const sig = c.name + '|' + JSON.stringify([a.name, a.cost, a.damage, a.damageMode, a.fx, c.cardType, c.hp]); if (seen.has(sig)) return; seen.add(sig);   // (a reprint is the same attack)
		out.attacks++; let good = false;
		for (const seed of ['audit-a', 'audit-b', 'audit-c']) {
			const S = arena(seed), energy = a.cost.map(t => (REAL.includes(t) ? t : REAL.includes(c.cardType) ? c.cardType : 'Fire'));
			const me = put(S, 0, 'active', 0, c.id, { energy }); put(S, 0, 'bench', 0, spare, { energy: ['Fire'] });
			const foe = put(S, 1, 'active', 0, wall, { energy: ['Fire', 'Fire'] }); put(S, 1, 'active', 1, wall, { energy: ['Fire'] }); put(S, 1, 'bench', 0, wall, { energy: ['Fire'] });
			const before = count(S), mark = S.log.length, who = `${c.id} ${c.name}: ${a.name}`;
			// the command: the plain one first; if the engine wants more (a Benched Pokémon, a second target), the computer player's own choice of it
			const cmds = [{ attack: ai, target: a.target === 'none' ? null : { seat: 1, zone: 'active', idx: 0 }, args: {} }];
			if (a.target !== 'none') cmds.push({ attack: ai, target: { seat: 1, zone: 'bench', idx: 0 }, args: {} });   // (an attack that aims at the Bench)
			try { const plan = nextAction(E.view(S, 0), new Set()); if (plan && plan.t === 'execute' && plan.commands[0] && plan.commands[0].attack === ai) cmds.push(plan.commands[0]); } catch (e) { out.THROW.push(`${who}: the computer player: ${e.message}`); }
			let why = null, done = false;
			for (const cmd of cmds) {
				try { E.apply(S, { t: 'execute', seat: 0, commands: [cmd, null] }); done = true; break; } catch (e) { if (!e.refused) { out.THROW.push(`${who}: ${e.message}`); why = null; done = null; break; } why = e.message; }
			}
			if (done === null) break;
			if (!done) { const k = why.replace(/\d+/g, 'N'); (out.REFUSED[k] = out.REFUSED[k] || []).push(who); break; }
			// answer whatever the attack asks, as the computer player would
			let guard = 0; try { while (S.pending && !S.over && guard++ < 40) { const act = nextAction(E.view(S, S.pending.seat), new Set()); if (!act) break; E.apply(S, act); } } catch (e) { if (!e.refused) { out.THROW.push(`${who}: answering a choice: ${e.message}`); break; } }
			const log = S.log.slice(mark), used = log.some(e => e.k === 'attack'), failed = log.filter(e => e.k === 'fail').map(e => e.msg);
			if (!used) { if (!failed.length) out['NO-ATTACK'].push(who); else { const k = 'fails: ' + failed[0].replace(/^.*?(fails|doesn't happen)[:.]?\s*/, '').replace(/\d+/g, 'N'); (out.REFUSED[k] = out.REFUSED[k] || []).push(who); } break; }
			good = true;
			if (!a.fx.length && !a.damageMode && a.damage > 0) { const d = log.find(e => e.k === 'damage' && e.to && e.to.seat === 1), base = d && /\[base (\d+)/.exec(d.msg); if (!base || +base[1] !== a.damage) out.BASE.push(`${who}: printed ${a.damage}, the damage line says ${d ? d.msg : 'nothing'}`); }
			const all = S.players.flatMap(p => [...p.active, ...p.bench]).filter(Boolean);
			if (all.some(k => !Number.isFinite(k.dmg) || k.dmg < 0 || !Array.isArray(k.energy))) out.STATE.push(`${who}: an impossible damage or Energy value`);
			if (count(S) !== before) out.STATE.push(`${who}: ${before} cards before, ${count(S)} after`);
			if (S.players.some(p => !Number.isFinite(p.points) || p.points < 0)) out.STATE.push(`${who}: impossible points`);
		}
		if (good) out.ok++;
	});
}
// TEXT: every number in a card's rules text should be somewhere in its structured effect (or be its printed damage).
// The five known exceptions say the number in the effect's NAME (doubleEnergy, dualTools, ...) or as a table.
{
	const KNOWN = new Set(['Serperior / Jungle Totem', 'Rare Candy', 'Bounded Field', 'Iron Moth / Thermal Gust', 'Revavroom / Dual Customization']), done = new Set(); out.TEXT = [];
	const check = (who, text, fx, extra = []) => {
		if (!text || KNOWN.has(who) || done.has(who + '|' + text)) return; done.add(who + '|' + text);
		const have = new Set([...JSON.stringify(fx).matchAll(/\d+/g)].map(m => +m[0]).concat(extra, 1));
		const miss = [...text.replace(/\{[A-Z]\}/g, '').matchAll(/\b(\d+)\b/g)].map(m => +m[1]).filter(n => !have.has(n));
		if (miss.length) out.TEXT.push(`${who}: its text says ${[...new Set(miss)].join(', ')}, its effect does not: ${text.slice(0, 140)}`);
	};
	for (const c of CARDS) {
		if (c.kind === 'pokemon') { for (const a of c.attacks || []) check(`${c.name} / ${a.name}`, a.text, a.fx, [a.damage]); if (c.ability) check(`${c.name} / ${c.ability.name}`, c.ability.text, c.ability.fx); }
		else check(c.name, c.text, c.fx);
	}
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, '\t'));
else {
	console.log(`${out.attacks} different attacks; ${out.ok} used cleanly`);
	for (const k of ['THROW', 'NO-ATTACK', 'BASE', 'STATE', 'TEXT']) { console.log(`${k}: ${out[k].length}`); for (const x of [...new Set(out[k])].slice(0, 40)) console.log('   ', x); }
	console.log('REFUSED, by reason:'); for (const [k, v] of Object.entries(out.REFUSED).sort((a, b) => b[1].length - a[1].length)) console.log(`   ${v.length}  ${k}   e.g. ${v.slice(0, 3).join('; ')}`);
}
process.exit(out.THROW.length || out.STATE.length || out.BASE.length || out['NO-ATTACK'].length || out.TEXT.length ? 1 : 0);
