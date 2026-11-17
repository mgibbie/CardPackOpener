// Pocket Enhanced: Pokémon TCG Pocket's solo battles, from Bulbapedia's "List of <set> solo battles in Pokémon TCG Pocket"
// pages (read through the wiki's API): for each set, its tiers in order, and for each battle the opponent's deck (20 cards
// by set and number), its Energy types and the wording of its battle tasks. Names, numbers and task wording only.
//   node tools/pocket_fetch_solo.mjs pocketenhanced/data/source/solo_battles.json
import fs from 'fs';
const out = process.argv[2]; if (!out) { console.error('usage: node tools/pocket_fetch_solo.mjs <out.json>'); process.exit(2); }
const get = async url => { const r = await fetch(url, { headers: { 'User-Agent': 'generic-client' } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
const CODE = { 'Genetic Apex': 'A1', 'Mythical Island': 'A1a', 'Space-Time Smackdown': 'A2', 'Triumphant Light': 'A2a', 'Shining Revelry': 'A2b', 'Celestial Guardians': 'A3', 'Extradimensional Crisis': 'A3a', 'Eevee Grove': 'A3b', 'Wisdom of Sea and Sky': 'A4', 'Secluded Springs': 'A4a', 'Deluxe Pack: ex': 'A4b', 'Deluxe Pack ex': 'A4b', 'Mega Rising': 'B1', 'Crimson Blaze': 'B1a', 'Fantastical Parade': 'B2', 'Paldean Wonders': 'B2a', 'Mega Shine': 'B2b', 'Pulsing Aura': 'B3', 'Paradox Drive': 'B3a', 'Everyday Wonders': 'B3b', 'Ruler of the Skies': 'B4', "Team Rocket's Ambition": 'B4a', 'Deluxe Pack: Mega': 'B4b', 'Deluxe Pack Mega': 'B4b', 'Dual Fusion': 'C1', 'First Partners': 'SP1', 'Special Pack: First Partners': 'SP1', 'Promo-A': 'P-A', 'Promo-B': 'P-B', 'Promo-C': 'P-C' };
const SETS = ['Genetic Apex', 'Mythical Island', 'Space-Time Smackdown', 'Triumphant Light', 'Shining Revelry', 'Celestial Guardians', 'Extradimensional Crisis', 'Eevee Grove', 'Wisdom of Sea and Sky', 'Secluded Springs', 'Deluxe Pack: ex', 'Mega Rising', 'Crimson Blaze', 'Fantastical Parade', 'Paldean Wonders', 'Mega Shine', 'Pulsing Aura', 'Paradox Drive', 'Everyday Wonders', 'Ruler of the Skies', "Team Rocket's Ambition", 'Deluxe Pack: Mega', 'Dual Fusion'];
const pad = n => String(n).padStart(3, '0'), problems = [];
// wiki markup to plain words
const plain = s => { let t = s, was; do { was = t; t = t.replace(/\{\{TCG ID\|[^|{}]*\|([^|{}]*)\|[^{}]*\}\}/g, '$1').replace(/\{\{TCGP Icon\|ex\}\}/g, ' ex').replace(/\{\{rar\/TCGP\|Diamond\|(\d)\}\}/g, '$1-diamond').replace(/\{\{(?:ct|e|TCGP|TCG)\|([^|{}]*)(?:\|[^{}]*)?\}\}/g, '$1').replace(/\{\{TCGPocketItem\|([^|{}]*)(?:\|[^{}]*?)?(?:\|num=(\d+))?[^{}]*\}\}/g, (m, a, n) => (n ? `${n} ${a}` : a)).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1'); } while (t !== was); return t.replace(/'''?/g, '').replace(/<br\s*\/?>/g, '; ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); };
const API = 'https://bulbapedia.bulbagarden.net/w/api.php?format=json&action=query&prop=revisions&rvprop=content&rvslots=main&titles=';
const sets = [];
for (const set of SETS) {
	const j = await get(API + encodeURIComponent(`List of ${set} solo battles in Pokémon TCG Pocket`)), p = Object.values(j.query.pages)[0], w = p.revisions && p.revisions[0].slots.main['*'];
	if (!w) { problems.push(`${set}: no page`); continue; }
	const rules = [...w.slice(0, w.search(/\n==[^=]/)).matchAll(/\*\s*'''Rule \d+:'''\s*([^\n]*)/g)].map(m => plain(m[1]));
	const tiers = []; let tier = null;
	// a tier is a "== heading ==", a battle a "=== heading ===" with a deck list under it
	const parts = w.split(/\n(?===)/);
	for (const part of parts) {
		const h2 = /^==([^=].*?)==\s*\n?/.exec(part), h3 = /^===([^=].*?)===\s*\n?/.exec(part);
		if (h2) { tier = { name: plain(h2[1]), battles: [] }; tiers.push(tier); continue; }
		if (!h3 || !tier || !/TCGPocketDeckList\/Entry/.test(part)) continue;
		const cards = [];
		for (const e of part.matchAll(/\{\{TCGPocketDeckList\/Entry\|(\d+)\|\{\{TCG ID\|([^|}]*)\|([^|}]*)\|(\d+)/g)) { const code = CODE[e[2].trim()]; if (!code) { problems.push(`${set} / ${h3[1]}: unknown set "${e[2]}"`); continue; } for (let k = 0; k < +e[1]; k++) cards.push({ id: `${code}-${pad(e[4])}`, name: e[3].trim() }); }
		const foot = /\{\{TCGPocketDeckList\/Footer\|[^\n]*?energy=([^\n]*)/.exec(part), energy = foot ? [...foot[1].matchAll(/\{\{e\|(\w+)\}\}/g)].map(m => m[1]) : [];
		const tasks = [...part.matchAll(/\{\{TCGPocketMission\/Entry\|mission=((?:[^|{}]|\{\{[^{}]*\}\})*)/g)].map(m => plain(m[1]));
		if (cards.length !== 20) problems.push(`${set} / ${plain(h3[1])}: ${cards.length} cards`);
		tier.battles.push({ name: plain(h3[1]).replace(/ \([^)]*\)$/, ''), energy, cards, tasks });
	}
	sets.push({ set, rules, tiers: tiers.filter(t => t.battles.length) });
}
for (const p of problems) console.error('PROBLEM', p);
fs.writeFileSync(out, JSON.stringify({ note: "Pokémon TCG Pocket's solo battles: each set's tiers in order, and each battle's opposing deck (20 cards by set and number), Energy types and battle-task wording, from Bulbapedia's \"List of <set> solo battles in Pokémon TCG Pocket\" pages (bulbapedia.bulbagarden.net). Kept as fetched. Made by tools/pocket_fetch_solo.mjs.", sets }, null, '\t') + '\n');
const all = sets.flatMap(s => s.tiers.flatMap(t => t.battles));
console.log(`${sets.length} sets, ${all.length} battles (${all.filter(b => b.cards.length === 20).length} with 20 cards, ${all.filter(b => !b.energy.length).length} with no Energy named); ${problems.length} problems`);
for (const s of sets) console.log(' ', s.set, '|', s.tiers.map(t => `${t.name}: ${t.battles.length}`).join(', '));
