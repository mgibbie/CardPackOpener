// gen-learn-glossary.mjs — regenerate the Keyword Glossary on /learnmagepunk
// from the game's own glossary (battlecards/keywords.js), so the learn page
// never drifts from the engine. Re-run after adding or rewording keywords:
//
//   node tools/gen-learn-glossary.mjs && git add learnmagepunk/index.html
//
// Keywords that appear on at least one card in the pool link to their
// designwiki page (/designwiki/#/keyword/<slug>); the rest render unlinked.
// The plane-flavored "Static" entry is skipped: on the learn page Static means
// only the Paralyze combat keyword (planes just have a "continuous rule").

import { readFileSync, writeFileSync } from 'fs';

// keywords.js keeps its K array module-private; import a scratch copy that exports it
const src = readFileSync('battlecards/keywords.js', 'utf8');
writeFileSync('/tmp/kwexport.mjs', src.replace('if (typeof document', 'export { K };\nif (typeof document'));
const { K, keywordsFor } = await import('/tmp/kwexport.mjs');

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pool = JSON.parse(readFileSync('battlecards/cards.json', 'utf8')).cards;
const live = new Set();
for (const c of pool) for (const k of keywordsFor(c)) live.add(norm(k.label));

const entries = K
	.filter(k => !(k.plane && k.p[0] === 'Static'))
	.map(k => ({ label: k.p[0], aliases: k.p.slice(1), text: k.t, plane: !!k.plane, slug: norm(k.p[0]) }))
	.sort((a, b) => a.label.localeCompare(b.label));

let html = '<dl class="kw-grid">\n';
for (const e of entries) {
	const name = live.has(e.slug)
		? `<a href="/designwiki/#/keyword/${e.slug}">${esc(e.label)}</a>`
		: esc(e.label);
	const tag = e.plane ? ' <span class="plane-tag">Plane</span>' : '';
	const alias = e.aliases.length ? ` <span class="alias">(also: ${e.aliases.map(esc).join(', ')})</span>` : '';
	html += `\t<div class="kw"><dt>${name}${tag}${alias}</dt><dd>${esc(e.text)}</dd></div>\n`;
}
html += '</dl>';

const page = readFileSync('learnmagepunk/index.html', 'utf8');
const out = page.replace(/<dl class="kw-grid">[\s\S]*?<\/dl>/, html);
if (out === page) { console.error('glossary block not found/unchanged'); process.exit(1); }
writeFileSync('learnmagepunk/index.html', out);
console.log(`glossary: ${entries.length} keywords, ${entries.filter(e => live.has(e.slug)).length} linked to the wiki`);
