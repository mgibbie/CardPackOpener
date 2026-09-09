// keyword_text_field_sync_test.mjs (2026-09-08)
//
// Guards against the "card names a keyword its data doesn't back" bug class
// (the samurai/pyrog/paper-import family). For every creature & weapon, the
// card's PURE KEYWORD PREFIX — the leading run of comma/&/period-separated
// tokens that are ALL known keywords — must be fully wired: declarative
// keywords in keywords[], value keywords (Medic/Regenerate/Ward/Overkill/
// Spell Damage) backed by their field. A one-time sweep fixed 30 cards; this
// keeps new imports honest.
//
// It only inspects the keyword PREFIX, so keyword-granting spells ("Give a
// creature Taunt"), token-bonus lists, and "Battlecry:" clauses are ignored.
import fs from 'fs';
const here = new URL('.', import.meta.url);
const cards = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url))).cards;
const kwSrc = fs.readFileSync(new URL('../../keywords.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const KNOWN = new Set();
for (const m of kwSrc.matchAll(/p:\s*\[([^\]]*)\]/g)) for (const q of m[1].matchAll(/'([^']+)'/g)) KNOWN.add(q[1]);

const DECL = {
	'Taunt': 'taunt', 'Charge': 'charge', 'Rush': 'rush', 'Divine Shield': 'divine_shield',
	'Lifesteal': 'lifesteal', 'Windfury': 'windfury', 'Stealth': 'stealth', 'Reborn': 'reborn',
	'Deathtouch': 'deathtouch', 'Venomous': 'venomous', 'Poisonous': 'poisonous', 'Trample': 'trample',
	'Hexproof': 'hexproof', 'Elusive': 'elusive', 'Swift': 'first_strike', 'First Strike': 'first_strike',
	'Piercing': 'piercing', 'Slashing': 'slashing', 'Cleave': 'cleave', 'Pacifist': 'pacifist',
	'Defender': 'defender', 'Sanguine': 'sanguine', 'Impulsive': 'impulsive', 'Chromatic': 'chromatic',
	'Firebreathing': 'firebreathing', 'Static': 'static', 'Meteoric': 'meteoric', 'Bash': 'bash',
	'Immune': 'immune',
};
const VALUE = {
	'Tradeable': c => !!c.tradeable, // field-backed (card.tradeable), not a keyword-array keyword
	'Medic': c => (c.medic || 0) > 0,
	'Regenerate': c => (c.regen || 0) > 0,
	'Ward': c => !!(c.ward && (c.ward.mana != null || c.ward.discard != null || c.ward.life != null)),
	'Overkill': c => Array.isArray(c.overkill) && c.overkill.length > 0,
	'Spell Damage': c => (c.static?.type || '').startsWith('spell-damage') || (c.statics || []).some(s => (s.type || '').startsWith('spell-damage')),
};
const SCHOOLS = ['Arcane', 'Fel', 'Fire', 'Frost', 'Holy', 'Nature', 'Shadow', 'Song'];
const norm = tok => {
	let t = tok.replace(/\s*\(\d+\)$/, '').replace(/\s*\+?\d+$/, '').trim();
	const m = t.match(new RegExp('^(?:' + SCHOOLS.join('|') + ')\\s+(Spell Damage)$'));
	if (m) t = m[1];
	return (KNOWN.has(t) || DECL[t] || VALUE[t]) ? t : null;
};
const prefix = desc => { const out = []; for (let raw of desc.split(/\s*[,&.\n]\s*/)) { raw = raw.trim(); if (!raw) continue; const n = norm(raw); if (n === null) break; out.push(n); } return out; };

// A card also DECLARES keywords in any sentence that is a PURE keyword list —
// even one that sits AFTER a triggered-ability clause, which the leading
// `prefix` scan never reaches (e.g. "Battlecry: …\nDivine Shield & Tradeable.").
// A sentence counts only if EVERY comma/&-separated part is a known keyword, so
// prose ("Give a creature Taunt.", "Deal 1 damage.") is ignored.
const keywordSentences = desc => {
	const out = [];
	for (const line of desc.split('\n')) {
		for (const sent of line.split(/(?<=\.)\s+/)) {
			const body = sent.replace(/\.$/, '').trim();
			if (!body) continue;
			const parts = body.split(/,\s+|\s+&\s+/).map(s => s.trim()).filter(Boolean);
			if (!parts.length) continue;
			const normed = parts.map(norm);
			if (normed.every(n => n !== null)) out.push(...normed); // pure keyword-list sentence
		}
	}
	return out;
};

const mismatches = [];
for (const c of cards) {
	if (c.token || (c.type !== 'creature' && c.type !== 'weapon') || !c.description) continue;
	const kw = c.keywords || [];
	const declared = [...new Set([...prefix(c.description), ...keywordSentences(c.description)])];
	for (const w of declared) {
		if (DECL[w] && !kw.includes(DECL[w])) mismatches.push(`${c.id}: names ${w} but keywords[] lacks '${DECL[w]}'`);
		else if (VALUE[w] && !VALUE[w](c)) mismatches.push(`${c.id}: names ${w} but its backing field is missing`);
	}
}
ok('no creature/weapon names a keyword its data does not back', mismatches.length === 0,
	'\n  - ' + mismatches.slice(0, 30).join('\n  - '));

// spot-check a few of the cards the one-time sweep fixed
const byId = Object.fromEntries(cards.map(c => [c.id, c]));
ok('tracker_jacker wired Poisonous/Swift/Rush', ['poisonous', 'first_strike', 'rush'].every(k => byId.tracker_jacker.keywords.includes(k)));
ok('green_eyes_ultimate_dragon has Spell Damage +3', byId.green_eyes_ultimate_dragon.static?.type === 'spell-damage' && byId.green_eyes_ultimate_dragon.static?.value === 3);
ok('roaming_throne has Regenerate 2', byId.roaming_throne.regen === 2);
ok('terror_evolsaur typo fixed to Meteoric', /Meteoric/.test(byId.terror_evolsaur.description) && !/Metoric/.test(byId.terror_evolsaur.description) && byId.terror_evolsaur.keywords.includes('meteoric'));
ok('city_tax lifesteal is effect-backed', byId.city_tax.effects.some(e => e.type === 'damage' && e.lifesteal === true));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
