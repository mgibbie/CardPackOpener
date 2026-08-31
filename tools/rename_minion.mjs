// rename_minion.mjs — say "creature", not "minion", in card text.
//
// ONLY rewrites fields a player actually reads: `description` and `text`, at any
// depth. Everything else that contains the word is an INTERNAL IDENTIFIER and
// renaming it would break the engine:
//     effects[].type      'summon-minion', 'copy-minion', …   (99 + nested)
//     secret.trigger      'minion-played'                     (22)
//     ongoing.on          'minion-summoned'                   (6)
//     selfCost.per        'minions-played'                    (2)
//     effects[].cardType  'minion'                            (1)
//     aura.tribe / buff `name`   matchers, not display strings
//     the card id of curious_lightsworn_dominion
// Those are listed at the end of a run so the split stays visible.
//
// Also repairs sentence-start capitalisation. Ten descriptions already read
// "Taunt. creatures you control…" — the fingerprint of an earlier, cruder pass —
// and this rename would otherwise add more of them.
//
// Idempotent.
//
//   node tools/rename_minion.mjs            (dry run)
//   node tools/rename_minion.mjs --write
import fs from 'fs';

const WRITE = process.argv.includes('--write');
const CARDS = 'battlecards/cards.json';
const PROSE = new Set(['description', 'text']); // the only player-visible string fields

const say = s => s
	.replace(/\bMinions\b/g, 'Creatures').replace(/\bminions\b/g, 'creatures')
	.replace(/\bMinion\b/g, 'Creature').replace(/\bminion\b/g, 'creature');
// a sentence opens after start-of-string, a . ! ? or a newline — but NOT after a
// colon, where "Battlecry: creatures…" is the house style
const capitalise = s => s.replace(/(^|[.!?]\s+|\n)(creatures?\b)/g,
	(_, pre, w) => pre + w[0].toUpperCase() + w.slice(1));

const db = JSON.parse(fs.readFileSync(CARDS, 'utf8'));
let renamed = 0, recapped = 0;
const samples = [], caps = [];

function walk(node) {
	if (Array.isArray(node)) return node.forEach(walk);
	if (!node || typeof node !== 'object') return;
	for (const [k, v] of Object.entries(node)) {
		if (typeof v === 'string' && PROSE.has(k)) {
			const said = say(v);
			const fixed = capitalise(said);
			if (fixed === v) continue;
			if (said !== v) { renamed++; if (samples.length < 8) samples.push(`${JSON.stringify(v)}\n      -> ${JSON.stringify(fixed)}`); }
			else { recapped++; if (caps.length < 6) caps.push(`${JSON.stringify(v)}  ->  ${JSON.stringify(fixed)}`); }
			node[k] = fixed;
		} else walk(v);
	}
}
for (const c of db.cards) walk(c);

// what deliberately stayed
const left = {};
const scan = (node, path) => {
	if (Array.isArray(node)) return node.forEach(x => scan(x, path + '[]'));
	if (!node || typeof node !== 'object') return;
	for (const [k, v] of Object.entries(node)) {
		if (typeof v === 'string') { if (/minion/i.test(v)) left[path ? path + '.' + k : k] = (left[path ? path + '.' + k : k] || 0) + 1; }
		else scan(v, path ? path + '.' + k : k);
	}
};
for (const c of db.cards) scan(c, '');

console.log(`prose rewritten: ${renamed}   sentence-starts recapitalised: ${recapped}`);
for (const s of samples) console.log('   ' + s);
if (caps.length) { console.log('  capitalisation only:'); for (const c of caps) console.log('   ' + c); }
console.log('\nleft alone (internal identifiers / matchers):');
for (const [k, n] of Object.entries(left).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

if (WRITE) { fs.writeFileSync(CARDS, JSON.stringify(db)); console.log('\nwritten to ' + CARDS); }
else console.log('\n(dry run — pass --write)');
