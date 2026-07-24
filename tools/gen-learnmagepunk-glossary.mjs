// gen-learnmagepunk-glossary.mjs — regenerate the keyword glossary section of
// learnmagepunk/index.html from the game's own glossary (battlecards/keywords.js),
// so the learn page never drifts from the engine. Run after adding or rewording
// keywords:
//
//   node tools/gen-learnmagepunk-glossary.mjs && git add learnmagepunk/index.html
//
// Keywords that appear on at least one card in the pool get a deep link to
// their designwiki page (/designwiki/#/keyword/<slug>); the rest render as
// plain text (the wiki would show "Unknown keyword" for them).

import { readFileSync, writeFileSync } from 'fs';

// keywords.js keeps its K array module-private; import a shimmed copy
const src = readFileSync('battlecards/keywords.js', 'utf8');
writeFileSync('/tmp/kwexport.mjs', src.replace('if (typeof document', 'export { K };\nif (typeof document'));
const { K, keywordsFor } = await import('/tmp/kwexport.mjs');

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pool = JSON.parse(readFileSync('battlecards/cards.json', 'utf8')).cards;
const live = new Set();
for (const c of pool) for (const k of keywordsFor(c)) live.add(norm(k.label));

const entries = K
	// per design ruling, the plane-flavored "Static" is not a keyword — Static
	// means the Paralyze combat keyword; skip the plane duplicate
	.filter(k => !(k.plane && k.p[0] === 'Static'))
	.map(k => ({ label: k.p[0], aliases: k.p.slice(1), text: k.t, plane: !!k.plane, slug: norm(k.p[0]) }))
	.sort((a, b) => a.label.localeCompare(b.label));

let html = '<dl class="kw-grid">\n';
for (const e of entries) {
	const name = live.has(e.slug)
		? `<a href="/designwiki/#/keyword/${e.slug}">${esc(e.label)}</a>`
		: esc(e.label);
	const alias = e.aliases.length ? ` <span class="alias">(also: ${e.aliases.map(esc).join(', ')})</span>` : '';
	const tag = e.plane ? ' <span class="plane-tag">Plane</span>' : '';
	html += `\t<div class="kw"><dt>${name}${tag}${alias}</dt><dd>${esc(e.text)}</dd></div>\n`;
}
html += '\t</dl>';

const path = 'learnmagepunk/index.html';
const page = readFileSync(path, 'utf8');
const re = /<dl class="kw-grid">[\s\S]*?<\/dl>/;
if (!re.test(page)) { console.error('kw-grid block not found in ' + path); process.exit(1); }
writeFileSync(path, page.replace(re, html));
console.log(`glossary: ${entries.length} keywords, ${entries.filter(e => live.has(e.slug)).length} linked to the wiki`);
