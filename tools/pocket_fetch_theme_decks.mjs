// Pocket Enhanced: the decks the game itself hands out (its theme decks, lent as rental decks). Two sources, checked
// against each other where both have a deck:
//   - Bulbapedia's deck pages (the category "Pokémon TCG Pocket decks", read through the wiki's API): every deck, its set,
//     its Energy types and its 20 cards by set and number;
//   - Serebii's Theme Decks page (the A-series decks): the same 20 cards by set and number.
// Deck names, Energy types, and card names and numbers only.
//   node tools/pocket_fetch_theme_decks.mjs pocketenhanced/data/source/theme_decks.json
import fs from 'fs';
const out = process.argv[2]; if (!out) { console.error('usage: node tools/pocket_fetch_theme_decks.mjs <out.json>'); process.exit(2); }
const get = async (url, json) => { const r = await fetch(url, { headers: { 'User-Agent': 'generic-client' } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return json ? r.json() : r.text(); };
const CODE = { 'Genetic Apex': 'A1', 'Mythical Island': 'A1a', 'Space-Time Smackdown': 'A2', 'Triumphant Light': 'A2a', 'Shining Revelry': 'A2b', 'Celestial Guardians': 'A3', 'Extradimensional Crisis': 'A3a', 'Eevee Grove': 'A3b', 'Wisdom of Sea and Sky': 'A4', 'Secluded Springs': 'A4a', 'Deluxe Pack: ex': 'A4b', 'Deluxe Pack ex': 'A4b', 'Mega Rising': 'B1', 'Crimson Blaze': 'B1a', 'Fantastical Parade': 'B2', 'Paldean Wonders': 'B2a', 'Mega Shine': 'B2b', 'Pulsing Aura': 'B3', 'Paradox Drive': 'B3a', 'Everyday Wonders': 'B3b', 'Ruler of the Skies': 'B4', "Team Rocket's Ambition": 'B4a', 'Deluxe Pack: Mega': 'B4b', 'Deluxe Pack Mega': 'B4b', 'Dual Fusion': 'C1', 'First Partners': 'SP1', 'Special Pack: First Partners': 'SP1', 'Promo-A': 'P-A', 'Promo-B': 'P-B', 'Promo-C': 'P-C' };
const FOLDER = { geneticapex: 'A1', mythicalisland: 'A1a', 'space-timesmackdown': 'A2', triumphantlight: 'A2a', shiningrevelry: 'A2b', celestialguardians: 'A3', extradimensionalcrisis: 'A3a', eeveegrove: 'A3b', wisdomofseaandsky: 'A4', secludedsprings: 'A4a', 'promo-a': 'P-A' };
const clean = s => s.replace(/<[^>]+>/g, '').replace(/&eacute;/g, 'é').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|’/g, "'").replace(/\s+/g, ' ').trim();
const pad = n => String(n).padStart(3, '0'), problems = [];

// --- Bulbapedia ---
const API = 'https://bulbapedia.bulbagarden.net/w/api.php?format=json&';
const titles = []; for (let cont = ''; ;) { const j = await get(API + 'action=query&list=categorymembers&cmtitle=' + encodeURIComponent('Category:Pokémon TCG Pocket decks') + '&cmlimit=500' + cont, true); titles.push(...j.query.categorymembers.filter(m => m.ns === 0).map(m => m.title)); if (!j.continue) break; cont = '&cmcontinue=' + encodeURIComponent(j.continue.cmcontinue); }
const decks = [];
for (let i = 0; i < titles.length; i += 40) {
	const j = await get(API + 'action=query&prop=revisions&rvprop=content&rvslots=main&titles=' + encodeURIComponent(titles.slice(i, i + 40).join('|')), true);
	for (const p of Object.values(j.query.pages)) {
		const w = p.revisions && p.revisions[0].slots.main['*']; if (!w || !/TCGPocketDeckList\/Entry/.test(w)) continue;   // (a page with no deck list: a list page)
		const setname = (/\|setname=([^\n|]*)/.exec(w) || [])[1], energy = [...((/\|types=([^\n]*)/.exec(w) || [])[1] || '').matchAll(/\{\{e\|(\w+)\}\}/g)].map(m => m[1]);
		const cards = [];
		for (const e of w.matchAll(/\{\{TCGPocketDeckList\/Entry\|(\d+)\|\{\{TCG ID\|([^|}]*)\|([^|}]*)\|(\d+)/g)) { const code = CODE[e[2].trim()]; if (!code) { problems.push(`${p.title}: unknown set "${e[2]}"`); continue; } for (let k = 0; k < +e[1]; k++) cards.push({ id: `${code}-${pad(e[4])}`, name: clean(e[3]) }); }
		if (cards.length !== 20) problems.push(`${p.title}: ${cards.length} cards on Bulbapedia`);
		decks.push({ name: p.title.replace(/ \([^)]*\)$/, ''), set: setname ? setname.trim() : (/\(([^)]*)\)$/.exec(p.title) || [])[1] || null, title: p.title, energy, cards });
	}
}
decks.sort((a, b) => a.title.localeCompare(b.title));

// --- Serebii, as a check ---
const BASE = 'https://www.serebii.net/tcgpocket/', index = await get(BASE + 'themedecks.shtml');
const norm = s => s.toLowerCase().replace(/\band\b/g, '&').replace(/[^a-z0-9&]/g, '');
let both = 0, agree = 0; const differs = [];
for (const m of index.matchAll(/<td class="fooinfo"><a href="(themedecks\/[^"]+)"><u>([^<]*)<\/u><\/a><\/td>\s*<td class="fooinfo">([^<]*)<\/td>/g)) {
	const html = await get(BASE + m[1].split('/').map(encodeURIComponent).join('/')), name = clean(m[2]).replace(/ \([^)]*\)$/, ''), set = clean(m[3]), cards = [];
	const marks = [...html.matchAll(/<td class="cen" width="20%"><a href="\/tcgpocket\/([a-z-]+)\/(\d+)\.shtml">\s*(?:<font size="2">)?([^<]*)/g)];
	marks.forEach((c, n) => { const rest = html.slice(c.index, n + 1 < marks.length ? marks[n + 1].index : html.length), q = /<td class="cen">(\d+)<\/td>/.exec(rest), k = q ? +q[1] : 1; for (let x = 0; x < k; x++) cards.push(`${FOLDER[c[1]] || c[1]}-${pad(c[2])}`); });
	// Serebii's page for a deck is matched to Bulbapedia's by the cards, not the name: some of Serebii's pages carry
	// another deck's name (its Wisdom of Sea and Sky pages are each one deck along)
	const over = x => { const left = cards.slice(); let n = 0; for (const c of x.cards) { const k = left.indexOf(c.id); if (k >= 0) { left.splice(k, 1); n++; } } return n; };
	const d = decks.map(x => [over(x), x]).sort((a, b) => b[0] - a[0] || (norm(b[1].name) === norm(name)) - (norm(a[1].name) === norm(name)))[0];
	if (!d || d[0] < 15) { problems.push(`Serebii's "${name}" (${set}) matches no Bulbapedia deck`); continue; }
	const deck = d[1]; both++;
	if (d[0] === 20 && cards.length === 20 && deck.cards.length === 20) { agree++; deck.checked = 'Serebii'; continue; }
	const names = new Map(decks.flatMap(x => x.cards).map(c => [c.id, c.name]));
	if (deck.cards.length !== 20 && cards.length === 20) { differs.push({ deck: deck.title, settled: `Bulbapedia's list has ${deck.cards.length} cards; Serebii's has 20 and is used` }); deck.cards = cards.map(id => ({ id, name: names.get(id) || null })); deck.source = 'Serebii'; continue; }
	differs.push({ deck: deck.title, serebiiPage: name, bulbapedia: deck.cards.length, serebii: cards.length, onlyBulbapedia: deck.cards.map(c => c.id).filter(x => !cards.includes(x)), onlySerebii: cards.filter(x => !deck.cards.some(c => c.id === x)) });
}
for (const p of problems) console.error('PROBLEM', p);
for (const x of differs) console.error('DIFFERS', JSON.stringify(x));
fs.writeFileSync(out, JSON.stringify({ note: "The decks Pokémon TCG Pocket hands out (its theme decks, lent as rental decks): each deck's name, its set, its Energy types and its 20 cards by set and number, from Bulbapedia's deck pages (bulbapedia.bulbagarden.net, the category \"Pokémon TCG Pocket decks\"). A deck marked checked: \"Serebii\" has the same 20 cards on Serebii's Theme Decks page. Kept as fetched. Made by tools/pocket_fetch_theme_decks.mjs.", differs, decks }, null, '\t') + '\n');
console.log(`${decks.length} decks written (${decks.filter(d => d.cards.length === 20).length} of 20 cards); Serebii has ${both} of them: ${agree} agree card for card, ${differs.length} differ; ${problems.length} problems`);
