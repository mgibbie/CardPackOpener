// Pocket Enhanced: a set's source file for a set the Limitless card pages do not have (Special Pack: First Partners), built
// from Serebii's card pages and checked against the open dataset pokemon-tcg-pocket-database (MIT), the way
// tools/pocket_fetch_alt.mjs checks its two sources. Card stats and rules text only: no flavour text, illustrator or picture.
//   node tools/pocket_fetch_serebii.mjs <setId> <serebii folder> <count> <out.json>
//   node tools/pocket_fetch_serebii.mjs SP1 firstpartners 30 pocketenhanced/data/source/alt_sp1.json
import fs from 'fs';
const [setId, folder, countArg, out] = process.argv.slice(2), COUNT = +countArg;
if (!setId || !folder || !COUNT || !out) { console.error('usage: node tools/pocket_fetch_serebii.mjs <setId> <serebii folder> <count> <out.json>'); process.exit(2); }
const DB = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/';
const get = async (url, json) => { const r = await fetch(url, { headers: { 'User-Agent': 'generic-client' } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return json ? r.json() : r.text(); };
const TYPES = { grass: 'Grass', fire: 'Fire', water: 'Water', electric: 'Lightning', lightning: 'Lightning', psychic: 'Psychic', fighting: 'Fighting', darkness: 'Darkness', dark: 'Darkness', metal: 'Metal', steel: 'Metal', dragon: 'Dragon', colorless: 'Colorless' };
const SYM = { Grass: 'G', Fire: 'R', Water: 'W', Lightning: 'L', Psychic: 'P', Fighting: 'F', Darkness: 'D', Metal: 'M', Colorless: 'C', Dragon: 'N' };
const RARITY = { C: 'One Diamond', U: 'Two Diamond', R: 'Three Diamond', RR: 'Four Diamond', AR: 'One Star', AN: 'One Star', SR: 'Two Star', SAR: 'Two Star', IM: 'Three Star', UR: 'Crown', S: 'One Shiny', SSR: 'Two Shiny' };
const clean = h => h.replace(/<img[^>]*alt="(\w+)"[^>]*>/g, (m, t) => (SYM[TYPES[t.toLowerCase()]] ? `{${SYM[TYPES[t.toLowerCase()]]}}` : '')).replace(/<img[^>]*\/image\/(\w+)\.png[^>]*>/g, (m, t) => (SYM[TYPES[t]] ? `{${SYM[TYPES[t]]}}` : '')).replace(/<[^>]+>/g, ' ').replace(/&eacute;/g, 'é').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|’/g, "'").replace(/\s+/g, ' ').trim();
const [extra, sets] = await Promise.all([get(DB + 'cards.extra.json', true), get(DB + 'sets.json', true)]);
const meta = Object.values(sets).flat().find(s => s.code === setId); if (!meta) throw new Error(`the dataset has no set ${setId}`);
// the dataset numbers this set's three secret Mew -3, -2 and -1; Serebii numbers them after the others (28, 29, 30)
const stats = extra.filter(c => c.set === setId).sort((a, b) => (a.number < 0) - (b.number < 0) || a.number - b.number);
const cards = [], problems = [];
for (let n = 1; n <= COUNT; n++) {
	const html = await get(`https://www.serebii.net/tcgpocket/${folder}/${String(n).padStart(3, '0')}.shtml`), i = html.indexOf('<td class="cardinfo">'); if (i < 0) { problems.push(`${n}: no card on the page`); continue; }
	const b = html.slice(i, html.indexOf('</table>', html.indexOf('Retreat Cost', i)) + 8), st = stats[n - 1];
	const head = /class="main"><b>\s*<font size="2">([^<]*)<\/b><\/td>\s*<td nowrap align="right"><b>(\d+) HP[^<]*<\/b><\/td>\s*<td[^>]*><img[^>]*\/image\/(\w+)\.png/.exec(b);
	if (!head) { problems.push(`${n}: no name, HP and type`); continue; }
	const id = `${setId}-${String(n).padStart(3, '0')}`, c = { id, localId: String(n).padStart(3, '0'), name: clean(head[1]), category: 'Pokemon', hp: +head[2], types: [TYPES[head[3]]], stage: 'Basic' };
	c.attacks = [...b.matchAll(/<td align="center" width="15%">([\s\S]*?)<\/td>\s*<td><span class="main">(?:<a[^>]*>)?<b>([^<]*)<\/b>(?:<\/a>)?<\/span><br>([\s\S]*?)<\/td>\s*<td colspan="2" align="center" class="main"><b>([^<]*)<\/b>/g)].map(m => {
		const cost = [...m[1].matchAll(/alt="(\w+)"/g)].map(x => TYPES[x[1].toLowerCase()]), a = { cost, name: clean(m[2]) }; let eff = clean(m[3]); if (eff && !/[.)]$/.test(eff)) eff += '.';
		if (eff) a.effect = eff; const dmg = clean(m[4]); if (dmg) a.damage = dmg.replace(/x$/, '×'); return a;
	});
	if (/Ability/i.test(b.replace(/Retreat Cost[\s\S]*$/, ''))) problems.push(`${id} ${c.name}: has an Ability, which this tool does not read`);
	const wk = /<b>Weakness<\/b><\/td>\s*<td>(?:<img[^>]*\/image\/(\w+)\.png[^>]*>)?/.exec(b), rt = /<b>Retreat Cost<\/b><\/td>\s*<td[^>]*>([\s\S]*?)<\/t[rd]>/.exec(b);
	if (wk && wk[1] && TYPES[wk[1]]) c.weaknesses = [{ type: TYPES[wk[1]], value: '+20' }];
	c.retreat = rt ? (rt[1].match(/<img/g) || []).length : 0;
	if (!st) { problems.push(`${id} ${c.name}: not in the dataset`); cards.push(c); continue; }
	c.rarity = RARITY[st.rarity] || null; c.boosters = (st.packs || []).map(p => ({ name: p }));
	const el = st.element ? TYPES[st.element] : null, differs = [];
	if (st.name !== c.name) differs.push(`name "${st.name}"`);
	if (st.health != null && st.health !== c.hp) differs.push(`HP ${st.health} vs ${c.hp}`);
	if (el && el !== c.types[0]) differs.push(`type ${el} vs ${c.types[0]}`);
	if (String(st.stage || '').toLowerCase() !== 'basic') differs.push(`stage ${st.stage}`);
	if (st.retreatCost != null && st.retreatCost !== c.retreat) differs.push(`Retreat Cost ${st.retreatCost} vs ${c.retreat}`);
	if ((st.weakness ? TYPES[st.weakness] : null) !== ((c.weaknesses || [])[0]?.type || null)) differs.push(`Weakness ${st.weakness} vs ${(c.weaknesses || [])[0]?.type}`);
	if (!c.rarity) differs.push(`rarity ${st.rarity}`);
	if (differs.length) problems.push(`${id} ${c.name}: the sources differ: ${differs.join(', ')}`);
	cards.push(c);
}
if (cards.length !== stats.length) problems.push(`Serebii has ${cards.length} cards, the dataset ${stats.length}`);
for (const p of problems) console.error('PROBLEM', p);
if (problems.length) { console.error(`${problems.length} problem(s): nothing written`); process.exit(1); }
fs.writeFileSync(out, JSON.stringify({ note: `Card data for ${meta.name.en} (${setId}), which neither TCGdex nor the Limitless card pages have. Rules text and stats as shown by Serebii's card pages (serebii.net/tcgpocket/${folder}); rarity and booster packs from the open dataset pokemon-tcg-pocket-database (MIT), against which the stats are checked. No flavour text, illustrator or picture is kept. Made by tools/pocket_fetch_serebii.mjs.`, set: { id: setId, name: meta.name.en, releaseDate: meta.releaseDate || null, boosters: (meta.packs || []).map(n => ({ name: n })) }, cards }, null, '\t') + '\n');
console.log(meta.name.en, cards.length, 'written', JSON.stringify(cards.reduce((t, c) => { t[c.rarity] = (t[c.rarity] || 0) + 1; return t; }, {})));
