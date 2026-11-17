// Fetch one Pokémon TCG Pocket set that TCGdex does not have, in the shape of pocketenhanced/data/source/tcgdex_*.json,
// from two independent sources that are checked against each other:
//   - the Limitless TCG Pocket card database (pocket.limitlesstcg.com/cards/<set>?display=full): names, stats, attacks,
//     Abilities and rules text. Its flavour text, illustrator credits and card images are NOT taken.
//   - the open dataset pokemon-tcg-pocket-database (github.com/flibustier, MIT): rarity, booster packs, and the same stats.
// A card whose HP, Stage, Retreat Cost, Weakness or name differ between the two is reported and the run fails: nothing is guessed.
//   node tools/pocket_fetch_alt.mjs <setId> <out.json> [--allow-mismatch]
import fs from 'fs';
const [setId, out] = process.argv.slice(2), ALLOW = process.argv.includes('--allow-mismatch');
if (!setId || !out) { console.error('usage: node tools/pocket_fetch_alt.mjs <setId> <out.json>'); process.exit(2); }
const UA = { 'user-agent': 'generic-client' };
const get = async (u, json) => { for (let i = 0; i < 4; i++) { try { const r = await fetch(u, { headers: UA }); if (r.ok) return json ? await r.json() : await r.text(); } catch (e) { /* retry */ } await new Promise(r => setTimeout(r, 900)); } throw new Error('failed ' + u); };
const DB = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/';
const [html, extra, sets, pulls] = await Promise.all([get(`https://pocket.limitlesstcg.com/cards/${setId}?display=full`), get(DB + 'cards.extra.json', true), get(DB + 'sets.json', true), get(DB + 'pullRates.json', true)]);
// a set whose packs hold foil versions of its diamond cards (the Deluxe Packs): the dataset's pull rates list them (CF, UF, RF),
// and the foil printing is the card's second image variant
// Disagreements looked into and settled for the card page (each checked on a third source, Serebii's page for the card).
const SETTLED = { 'P-A-022': { differs: 'HP 50 vs 60', hp: 50 } };   // Jigglypuff: 50 HP in the dataset and on Serebii; the card page's 60 is wrong
const DS = setId.replace(/^P-/, 'PROMO-');   // (the dataset's code for a promo series: the card page says P-A, the dataset PROMO-A)
const FOILS = JSON.stringify(pulls[DS] || {}).includes('"CF"');
const meta = Object.values(sets).flat().find(s => s.code === DS); if (!meta) throw new Error(`the dataset has no set ${setId}`);
const stats = new Map(extra.filter(c => c.set === DS).map(c => [c.number, c]));

const TYPE = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', C: 'Colorless', N: 'Dragon' };
const RARITY = { C: 'One Diamond', U: 'Two Diamond', R: 'Three Diamond', RR: 'Four Diamond', AR: 'One Star', SR: 'Two Star', SAR: 'Two Star', IM: 'Three Star', UR: 'Crown', S: 'One Shiny', SSR: 'Two Shiny' };
const SYMBOL = { '◊': 'One Diamond', '◊◊': 'Two Diamond', '◊◊◊': 'Three Diamond', '◊◊◊◊': 'Four Diamond', '☆': 'One Star', '☆☆': 'Two Star', '☆☆☆': 'Three Star', Crown: 'Crown' };
// (the card pages show a shiny card with the star symbols of its rarity tier; the dataset says which cards are shiny)
const sameRarity = (page, data) => page === data || (page === 'One Star' && data === 'One Shiny') || (page === 'Two Star' && data === 'Two Shiny');
const apos = t => String(t).replace(/’/g, "'");
// (transcription only, never content: a curly apostrophe, "Pokemon" without its accent, and the circled numbers of a choose-1 list)
const ent = s => s.replace(/’/g, "'").replace(/Pokemon/g, 'Pokémon').replace(/\s*[①②③]\s*/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&eacute;/g, 'é').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
// rules text: an Energy symbol is written "[R]" in a span; here it becomes "{R}" as in the other source files
const text = h => ent(h.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\[([GRWLPFDMCN])\]/g, '{$1}').replace(/\s+/g, ' ').trim());
const plainText = h => ent(h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
const one = (re, s) => { const m = re.exec(s); return m ? m[1] : null; };

const cards = [], problems = [];
for (const b of html.split('<div class="card-page-main">').slice(1)) {
	const number = +one(/class="card-text-name"><a href="\/cards\/[^/]+\/(\d+)"/, b), name = plainText(one(/class="card-text-name"><a[^>]*>([\s\S]*?)<\/a>/, b) || '');
	const title = plainText(one(/<p class="card-text-title">([\s\S]*?)<\/p>/, b) || ''), kind = plainText(one(/<p class="card-text-type">([\s\S]*?)<\/p>/, b) || '');
	const st = stats.get(number);
	if (!number || !name) { problems.push(`a card block could not be read (${name || '?'})`); continue; }
	if (!st) { problems.push(`${setId}-${number} ${name}: not in the dataset`); continue; }
	const id = `${setId}-${String(number).padStart(3, '0')}`, c = { id, localId: String(number).padStart(3, '0'), name };
	const sym = one(/prints-current-details[\s\S]*?<span>\s*#\d+\s*·\s*([^\s<]+)/, b);
	c.rarity = RARITY[st.rarity] || null;
	if (!c.rarity) problems.push(`${id} ${name}: unknown rarity code ${st.rarity}`);
	else if (sym && SYMBOL[sym] && !sameRarity(SYMBOL[sym], c.rarity)) problems.push(`${id} ${name}: rarity ${c.rarity} in the dataset, ${SYMBOL[sym]} on the card page`);
	c.boosters = (st.packs || []).map(n => ({ name: n }));
	if (FOILS && /^(C|U|R)$/.test(st.rarity) && /_0[1-9]_[^_]+_(C|U|R)\.webp$/.test(st.image || '')) c.foil = true;
	if (/^Pok[eé]mon/.test(kind)) {
		c.category = 'Pokemon';
		const tm = /-\s*(\w+(?:\/\w+)?)\s*-\s*(\d+)\s*HP/.exec(title);   // ("Water/Darkness": a Pokémon of two types, from Dual Fusion on)
		if (!tm) { problems.push(`${id} ${name}: no type and HP`); continue; }
		c.hp = +tm[2]; c.types = tm[1].split('/');
		c.stage = /Stage 2/.test(kind) ? 'Stage2' : /Stage 1/.test(kind) ? 'Stage1' : 'Basic';
		const ev = one(/Evolves from\s*(.+)$/, kind); if (ev) c.evolveFrom = ev.trim();
		if (/\sex$/.test(name)) c.suffix = 'EX';
		const ab = [...b.matchAll(/<div class="card-text-ability">[\s\S]*?card-text-ability-info">([\s\S]*?)<\/p>[\s\S]*?card-text-ability-effect">([\s\S]*?)<\/p>/g)].map(m => ({ type: 'Ability', name: plainText(m[1]).replace(/^Ability:\s*/, ''), effect: text(m[2]) }));
		if (ab.length) c.abilities = ab;
		c.attacks = [...b.matchAll(/<div class="card-text-attack">[\s\S]*?card-text-attack-info">([\s\S]*?)<\/p>[\s\S]*?card-text-attack-effect">([\s\S]*?)<\/p>/g)].map(m => {
			const cost = (one(/<span class="ptcg-symbol">([^<]*)<\/span>/, m[1]) || '').trim().split('').filter(x => TYPE[x]).map(x => TYPE[x]);
			const line = plainText(m[1].replace(/<span class="ptcg-symbol">[^<]*<\/span>/, '')), dm = /^(.*?)\s+(\d+[+x×\-−]?)$/.exec(line), eff = text(m[2]);
			const a = { cost, name: (dm ? dm[1] : line).trim() }; if (eff) a.effect = eff; if (dm) a.damage = /\d$/.test(dm[2]) ? dm[2] : dm[2].replace(/x$/, '×').replace(/−$/, '-'); return a;   // ("140-": an attack whose effect takes damage off)
		});
		const wk = one(/Weakness:\s*([A-Za-z]+)/, b), rt = one(/Retreat:\s*(\d+)/, b);
		if (wk && wk !== 'none') c.weaknesses = [{ type: wk, value: '+20' }];
		c.retreat = rt == null ? 0 : +rt;
		// the two sources must agree
		const el = st.element ? st.element[0].toUpperCase() + st.element.slice(1) : null, stg = { basic: 'Basic', stage1: 'Stage1', stage2: 'Stage2', 'stage 1': 'Stage1', 'stage 2': 'Stage2' }[String(st.stage || '').toLowerCase()];
		const differs = [];
		if (apos(st.name) !== apos(name)) differs.push(`name "${st.name}"`);
		if (st.health != null && st.health !== c.hp) differs.push(`HP ${st.health} vs ${c.hp}`);
		if (el && el !== c.types[0]) differs.push(`type ${el} vs ${c.types[0]}`);
		if (stg && stg !== c.stage) differs.push(`stage ${stg} vs ${c.stage}`);
		if (st.retreatCost != null && st.retreatCost !== c.retreat) differs.push(`Retreat Cost ${st.retreatCost} vs ${c.retreat}`);
		if ((st.weakness || null) !== (wk && wk !== 'none' ? wk.toLowerCase() : null)) differs.push(`Weakness ${st.weakness} vs ${wk}`);
		if (SETTLED[id] && SETTLED[id].differs === differs.join(', ')) { differs.length = 0; if (SETTLED[id].hp) c.hp = SETTLED[id].hp; }
		if (differs.length) problems.push(`${id} ${name}: the sources differ: ${differs.join(', ')}`);
	} else {
		c.category = 'Trainer';
		c.trainerType = /Supporter/.test(kind) ? 'Supporter' : /Tool/.test(kind) ? 'Tool' : /Stadium/.test(kind) ? 'Stadium' : 'Item';
		const body = b.split('<div class="card-text-section">')[2] || '';
		c.effect = text(body.split('</div>')[0]);
		if (!c.effect) problems.push(`${id} ${name}: no rules text`);
		if (apos(st.name) !== apos(name)) problems.push(`${id} ${name}: the sources differ: name "${st.name}"`);
	}
	cards.push(c);
}
if (cards.length !== (meta.count ?? stats.size)) problems.push(`the card page has ${cards.length} cards, the dataset says ${meta.count}`);
for (const p of problems) console.error('PROBLEM', p);
if (problems.length && !ALLOW) { console.error(`${problems.length} problem(s): nothing written (re-run with --allow-mismatch to write the file and decide each one in the generator)`); process.exit(1); }
cards.sort((a, b) => +a.localId - +b.localId);
fs.writeFileSync(out, JSON.stringify({ note: `Card data for ${meta.name.en} (${setId}), which TCGdex does not have. Rules text and stats as shown by the Limitless TCG Pocket card database (pocket.limitlesstcg.com); rarity and booster packs from the open dataset pokemon-tcg-pocket-database (MIT). No flavour text, illustrator or image is taken. Kept as fetched: this is the ORIGINAL printed card data and is never edited. tools/gen_pocket_cards.mjs builds the game data from it.`, fetched: new Date().toISOString().slice(0, 10), set: { id: setId, name: meta.name.en, releaseDate: meta.releaseDate || null, boosters: (meta.packs || []).map(n => ({ name: n })), pullRates: pulls[DS] || null }, cards }, null, '\t') + '\n');
const by = {}; for (const c of cards) by[c.category + '/' + c.rarity] = (by[c.category + '/' + c.rarity] || 0) + 1;
console.log(meta.name.en, meta.releaseDate, cards.length, 'written', JSON.stringify(by), 'packs', JSON.stringify(meta.packs || []), problems.length ? `(${problems.length} problems allowed)` : '');
