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
		for (const e of part.matchAll(/(?:\{\{TCGPocketDeckList\/Entry\||\| *)(\d+)(?:\||× *\r?\n\|[^|\n]*\| *)\{\{TCG ID\|([^|}]*)\|([^|}]*)\|(\d+)/g)) { const code = CODE[e[2].trim()]; if (!code) { problems.push(`${set} / ${h3[1]}: unknown set "${e[2]}"`); continue; } for (let k = 0; k < +e[1]; k++) cards.push({ id: `${code}-${pad(e[4])}`, name: e[3].trim() }); }
		const foot = /\{\{TCGPocketDeckList\/Footer\|[^\n]*?energy=([^\n]*)/.exec(part), energy = foot ? [...foot[1].matchAll(/\{\{e\|(\w+)\}\}/g)].map(m => m[1]) : [];
		const tasks = [...part.matchAll(/\{\{TCGPocketMission\/Entry\|mission=((?:[^|{}]|\{\{[^{}]*\}\})*)/g)].map(m => plain(m[1]));
		if (cards.length !== 20) problems.push(`${set} / ${plain(h3[1])}: ${cards.length} cards`);
		tier.battles.push({ name: plain(h3[1]).replace(/ \([^)]*\)$/, ''), energy, cards, tasks });
	}
	sets.push({ set, rules, tiers: tiers.filter(t => t.battles.length) });
}

// --- Serebii's solo battle pages, as a check and to fill a deck Bulbapedia has short or long ---
// One page for each set and tier; under each deck's heading its cards (by set folder and number) and their quantities.
// A Serebii deck is matched to the Bulbapedia battle of the same set whose cards' names it shares (a card may be listed
// as another printing of itself). The same 20 names: the battle is marked checked. Bulbapedia not 20 cards and Serebii
// 20: Serebii's list is used. Both 20 and different: Bulbapedia's is kept and the difference recorded.
const { card } = await import('../pocketenhanced/js/data/cards.js');
const text = async url => { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 generic-client' } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); };
const norm = s => s.toLowerCase().replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]/g, ''), FOLDER = Object.fromEntries(Object.entries(CODE).map(([k, v]) => [norm(k), v]));
const nameOf = id => (card(id) ? card(id).name : id), names = ids => ids.map(nameOf).sort();
const SB = 'https://www.serebii.net/tcgpocket/', idx = await text(SB + 'solobattles.shtml'), differs = [];
let sBoth = 0, sAgree = 0, sFilled = 0;
for (const href of [...new Set([...idx.matchAll(/href="(solobattles\/[^"]+\.shtml)"/g)].map(m => m[1]))]) {
	const html = await text(SB + href), h1 = /<h1>([^<]*?) - ([^<]*)<\/h1>/.exec(html); if (!h1) { problems.push(`Serebii ${href}: no heading`); continue; }
	const set = sets.find(s => norm(s.set) === norm(h1[1])); if (!set) { problems.push(`Serebii ${href}: no set "${h1[1]}"`); continue; }
	const tierWord = (/(Beginner|Intermediate|Advanced|Expert)/i.exec(h1[2]) || [])[1] || '';
	for (const part of html.split(/<h2>/).slice(1)) {
		const title = part.slice(0, part.indexOf('</h2>')).replace(/<[^>]+>/g, '').trim(), list = part.split(/Battle Tasks/)[0];
		const links = [...list.matchAll(/<td class="fooevo"><a href="\/tcgpocket\/([a-z0-9-]+)\/(\d+)\.shtml">/g)], qty = [...list.matchAll(/<b>Quantity<\/b><br \/>(\d+)/g)].map(m => +m[1]);
		if (!links.length || links.length !== qty.length) { if (links.length) problems.push(`Serebii ${href} / ${title}: ${links.length} cards, ${qty.length} quantities`); continue; }
		const ids = []; let unknown = null; links.forEach((l, i) => { const code = FOLDER[norm(l[1])]; if (!code) unknown = l[1]; for (let k = 0; k < qty[i]; k++) ids.push(`${code}-${pad(l[2])}`); });
		if (unknown) { problems.push(`Serebii ${href} / ${title}: unknown set folder ${unknown}`); continue; }
		const want = names(ids), over = b => { const left = want.slice(); let n = 0; for (const c of names(b.cards.map(c => c.id))) { const k = left.indexOf(c); if (k >= 0) { left.splice(k, 1); n++; } } return n; };
		const best = set.tiers.flatMap(t => t.battles.map(b => ({ b, t }))).filter(x => !x.b.serebii).map(x => ({ ...x, n: over(x.b) + (tierWord && x.t.name.toLowerCase().startsWith(tierWord.toLowerCase()) ? 0.5 : 0) })).sort((a, b) => b.n - a.n)[0];
		if (!best || best.n < 15) continue;   // (a battle Bulbapedia does not list, or lists too differently to be sure it is the same one)
		const b = best.b; b.serebii = true; sBoth++;
		if (Math.floor(best.n) === 20 && ids.length === 20 && b.cards.length === 20) { sAgree++; b.checked = 'Serebii'; continue; }
		if (b.cards.length !== 20 && ids.length === 20 && ids.every(id => card(id))) { differs.push({ battle: `${set.set} / ${best.t.name} / ${b.name}`, settled: `Bulbapedia's list has ${b.cards.length} cards; Serebii's has 20 and is used` }); b.cards = ids.map(id => ({ id, name: nameOf(id) })); b.source = 'Serebii'; sFilled++; continue; }
		differs.push({ battle: `${set.set} / ${best.t.name} / ${b.name}`, serebiiPage: `${href} / ${title}`, bulbapedia: b.cards.length, serebii: ids.length, onlyBulbapedia: names(b.cards.map(c => c.id)).filter(n => !want.includes(n)), onlySerebii: want.filter(n => !names(b.cards.map(c => c.id)).includes(n)) });
	}
}
for (const s of sets) for (const t of s.tiers) for (const b of t.battles) { delete b.serebii; if (b.cards.length !== 20) console.error('NOT WHOLE', s.set, '/', t.name, '/', b.name, b.cards.length); }
for (const x of differs) console.error('DIFFERS', JSON.stringify(x));
console.log(`Serebii has ${sBoth} of the battles: ${sAgree} name the same 20 cards, ${sFilled} filled from it, ${differs.length - sFilled} differ`);
for (const p of problems) console.error('PROBLEM', p);
fs.writeFileSync(out, JSON.stringify({ note: "Pokémon TCG Pocket's solo battles: each set's tiers in order, and each battle's opposing deck (20 cards by set and number), Energy types and battle-task wording, from Bulbapedia's \"List of <set> solo battles in Pokémon TCG Pocket\" pages (bulbapedia.bulbagarden.net). Kept as fetched. Made by tools/pocket_fetch_solo.mjs.", sets }, null, '\t') + '\n');
const all = sets.flatMap(s => s.tiers.flatMap(t => t.battles));
console.log(`${sets.length} sets, ${all.length} battles (${all.filter(b => b.cards.length === 20).length} with 20 cards, ${all.filter(b => !b.energy.length).length} with no Energy named); ${problems.length} problems`);
for (const s of sets) console.log(' ', s.set, '|', s.tiers.map(t => `${t.name}: ${t.battles.length}`).join(', '));
