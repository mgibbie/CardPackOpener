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
		const hl = /highlight cards? (?:is|are) (.*)/.exec(w), highlight = hl ? [...hl[1].matchAll(/\{\{TCG ID\|([^|}]*)\|[^|}]*\|(\d+)/g)].filter(m => CODE[m[1].trim()]).map(m => `${CODE[m[1].trim()]}-${pad(m[2])}`) : [];
		const cards = [];
		for (const e of w.matchAll(/(?:\{\{TCGPocketDeckList\/Entry\||\| *)(\d+)(?:\||× *\r?\n\|[^|\n]*\| *)\{\{TCG ID\|([^|}]*)\|([^|}]*)\|(\d+)/g)) { const code = CODE[e[2].trim()]; if (!code) { problems.push(`${p.title}: unknown set "${e[2]}"`); continue; } for (let k = 0; k < +e[1]; k++) cards.push({ id: `${code}-${pad(e[4])}`, name: clean(e[3]) }); }
		if (cards.length !== 20) problems.push(`${p.title}: ${cards.length} cards on Bulbapedia`);
		decks.push({ name: p.title.replace(/ \([^)]*\)$/, ''), set: setname ? setname.trim() : (/\(([^)]*)\)$/.exec(p.title) || [])[1] || null, title: p.title, energy, highlight, cards });
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
	const deck = d[1]; both++; deck.serebii = cards.slice();
	if (d[0] === 20 && cards.length === 20 && deck.cards.length === 20) { agree++; deck.checked = 'Serebii'; continue; }
	const names = new Map(decks.flatMap(x => x.cards).map(c => [c.id, c.name]));
	if (deck.cards.length !== 20 && cards.length === 20) { differs.push({ deck: deck.title, settled: `Bulbapedia's list has ${deck.cards.length} cards; Serebii's has 20 and is used` }); deck.cards = cards.map(id => ({ id, name: names.get(id) || null })); deck.source = 'Serebii'; continue; }
	differs.push({ deck: deck.title, serebiiPage: name, bulbapedia: deck.cards.length, serebii: cards.length, onlyBulbapedia: deck.cards.map(c => c.id).filter(x => !cards.includes(x)), onlySerebii: cards.filter(x => !deck.cards.some(c => c.id === x)) });
}

// --- PokéWiki (the German wiki's "Leihdecks/<set>" pages: every set's rental decks, each card by set code and number) ---
// A third reading. Its decks are matched to Bulbapedia's by their cards' names (it often lists a card's first printing
// where Bulbapedia lists the set's own reprint: the same card). Where the two name the same 20 cards the deck is marked;
// where Bulbapedia's list is not 20 cards and PokéWiki's is, PokéWiki's is used.
const { card } = await import('../pocketenhanced/js/data/cards.js');
const nameOf = id => (card(id) ? card(id).name : id), names = ids => ids.map(nameOf).sort();
const DE = 'https://www.pokewiki.de/api.php?format=json&', dePages = (await get(DE + 'action=query&list=allpages&aplimit=100&apprefix=' + encodeURIComponent('Leihdecks/'), true)).query.allpages.map(p => p.title);
const deDecks = [];
for (const title of dePages) {
	const j = await get(DE + 'action=query&prop=revisions&rvprop=content&rvslots=main&titles=' + encodeURIComponent(title), true), w = Object.values(j.query.pages)[0].revisions[0].slots.main['*'];
	for (const part of w.split(/\n(?===[^=])/)) {
		const h = /^==\s*([^=\n]+?)\s*==/.exec(part); if (!h) continue;
		const ids = []; for (const e of part.matchAll(/\{\{Deckzeile\/TCGP\|(\d+)\|([A-Za-z0-9-]+)\|(\d+)\|/g)) for (let k = 0; k < +e[1]; k++) ids.push(`${e[2]}-${pad(e[3])}`);
		if (ids.length) deDecks.push({ title: `${h[1]} [${title}]`, ids });
	}
}
let deBoth = 0, deAgree = 0; const used = new Set();
for (const de of deDecks) {
	const want = names(de.ids);
	const over = x => { const left = want.slice(); let n = 0; for (const c of names(x.cards.map(c => c.id))) { const k = left.indexOf(c); if (k >= 0) { left.splice(k, 1); n++; } } return n; };
	const best = decks.filter(x => !used.has(x.title)).map(x => [over(x), x]).sort((a, b) => b[0] - a[0])[0];
	if (!best || best[0] < 15) { problems.push(`PokéWiki's "${de.title}" matches no Bulbapedia deck`); continue; }
	const deck = best[1]; used.add(deck.title); deBoth++;
	if (best[0] === 20 && de.ids.length === 20 && deck.cards.length === 20) { deAgree++; deck.alsoChecked = 'PokéWiki'; continue; }
	if (deck.cards.length !== 20 && de.ids.length === 20 && de.ids.every(id => card(id))) { differs.push({ deck: deck.title, settled: `Bulbapedia's list has ${deck.cards.length} cards; PokéWiki's has 20 and is used` }); deck.cards = de.ids.map(id => ({ id, name: nameOf(id) })); deck.source = 'PokéWiki'; continue; }
	// two against one: Serebii and PokéWiki name the same 20 cards and Bulbapedia's 20 differ
	if (deck.serebii && deck.serebii.length === 20 && de.ids.length === 20 && names(deck.serebii).join() === want.join()) { differs.push({ deck: deck.title, settled: `Serebii and PokéWiki name the same 20 cards and Bulbapedia differs (${names(deck.cards.map(c => c.id)).filter(n => !want.includes(n)).join(', ')} where they have ${want.filter(n => !names(deck.cards.map(c => c.id)).includes(n)).join(', ')}): theirs is used` }); deck.cards = deck.serebii.map(id => ({ id, name: nameOf(id) })); deck.source = 'Serebii and PokéWiki'; continue; }
	differs.push({ deck: deck.title, pokewikiSection: de.title, bulbapedia: deck.cards.length, pokewiki: de.ids.length, onlyBulbapedia: names(deck.cards.map(c => c.id)).filter(n => !want.includes(n)), onlyPokewiki: want.filter(n => !names(deck.cards.map(c => c.id)).includes(n)) });
}
console.log(`PokéWiki has ${deBoth} of them: ${deAgree} name the same 20 cards`);
for (const d of decks) { delete d.serebii; if (d.cards.length !== 20) console.error('NOT WHOLE', d.title, d.cards.length); }
for (const p of problems) console.error('PROBLEM', p);
for (const x of differs) console.error('DIFFERS', JSON.stringify(x));
fs.writeFileSync(out, JSON.stringify({ note: "The decks Pokémon TCG Pocket hands out (its theme decks, lent as rental decks): each deck's name, its set, its Energy types, its highlight card and its 20 cards by set and number, from Bulbapedia's deck pages (bulbapedia.bulbagarden.net, the category \"Pokémon TCG Pocket decks\"). A deck marked checked: \"Serebii\" has the same 20 cards on Serebii's Theme Decks page. Kept as fetched. Made by tools/pocket_fetch_theme_decks.mjs.", differs, decks }, null, '\t') + '\n');
console.log(`${decks.length} decks written (${decks.filter(d => d.cards.length === 20).length} of 20 cards); Serebii has ${both} of them: ${agree} agree card for card, ${differs.length} differ; ${problems.length} problems`);
