// keywords.js — the keyword glossary. Drives two things: bolding keyword phrases
// in the rules text on a card face, and the small "what does this do" lines shown
// beneath the main hover tooltip. Meanings match the engine (see KW in engine.js).
const K = [
	{ p: ['Taunt'], t: 'Enemies must attack this before your other creatures.', tag: 'taunt' },
	{ p: ['Battlecry'], t: 'Triggers an effect when you play it from your hand.', tag: 'battlecry' },
	{ p: ['Deathrattle'], t: 'Triggers an effect when it dies.', tag: 'deathrattle' },
	{ p: ['Charge'], t: 'Can attack anything the turn it is played.', tag: 'charge' },
	{ p: ['Rush'], t: 'Can attack enemy creatures the turn it is played.', tag: 'rush' },
	{ p: ['Divine Shield'], t: 'Ignores the first damage it would take.', tag: 'divine_shield' },
	{ p: ['Lifesteal'], t: 'Damage it deals also heals your hero.', tag: 'lifesteal' },
	{ p: ['Windfury'], t: 'Can attack twice each turn.', tag: 'windfury' },
	{ p: ['Stealth'], t: "Can't be attacked or targeted until it attacks.", tag: 'stealth' },
	{ p: ['Reborn'], t: 'Returns with 1 Health the first time it dies.', tag: 'reborn' },
	{ p: ['Deathtouch', 'Poisonous', 'Venomous'], t: 'Any damage it deals destroys the creature.', tag: 'deathtouch' },
	{ p: ['Elusive', 'Hexproof'], t: "Can't be targeted by spells or Hero Powers.", tag: 'elusive' },
	{ p: ['Trample'], t: 'Excess lethal damage carries over to the hero.', tag: 'trample' },
	{ p: ['First Strike', 'Swift'], t: 'Deals its combat damage first.', tag: 'first_strike' },
	{ p: ['Piercing'], t: 'Its attacks ignore Taunt.', tag: 'piercing' },
	{ p: ['Cleave'], t: 'Combat damage also hits the creatures beside the target.', tag: 'cleave' },
	{ p: ['Pacifist'], t: "Can't attack.", tag: 'pacifist' },
	{ p: ['Defender'], t: 'May redirect attacks on your other permanents onto itself.', tag: 'defender' },
	{ p: ['Sanguine'], t: 'Banks a Blood Token whenever it attacks or is attacked.', tag: 'sanguine' },
	{ p: ['Impulsive'], t: 'Must attack — it swings on its own before your turn ends.', tag: 'impulsive' },
	{ p: ['Chromatic'], t: 'Its colour boosts roll twice and keep both results.', tag: 'chromatic' },
	{ p: ['Freeze', 'Frozen', 'Freezer'], t: 'A Frozen character skips its next attack.', tag: 'freezer' },
	// text-only keywords: no engine tag, but worth explaining where they appear
	{ p: ['Discover'], t: 'Choose one of three cards to add to your hand.' },
	{ p: ['Overload'], t: 'Locks that much of your mana next turn.' },
	{ p: ['Combo'], t: 'A bonus effect if you already played a card this turn.' },
	{ p: ['Spell Damage'], t: 'Your spells deal extra damage.' },
	{ p: ['Magnetic'], t: 'Play it left of a friendly Mech to fuse their stats and text.' },
	{ p: ['Inspire'], t: 'Triggers after you use your Hero Power.' },
	{ p: ['Secret'], t: "Stays hidden until its trigger fires on the opponent's turn." },
	{ p: ['Tradeable'], t: 'Drag it onto your deck to pay 1 and draw a card.' },
	{ p: ['Connect'], t: 'Triggers when this deals combat damage to the enemy hero.' },
	{ p: ['Honorable Kill'], t: 'Bonus if it kills a creature with an exact-lethal blow.' },
	{ p: ['Adapt'], t: 'Choose one of three upgrades for the creature.' },
	{ p: ['Quest'], t: 'Complete its goal for a powerful reward.', tag: 'quest' },
];

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// every display phrase, longest first so "Divine Shield" beats "Shield"
const ALL_PHRASES = K.flatMap(k => k.p).sort((a, b) => b.length - a.length);
const byTag = {}; for (const k of K) if (k.tag) byTag[k.tag] = k;

// split rules text into runs of { text, bold } with keyword phrases marked bold
export function segmentKeywords(text) {
	if (!text) return [{ text: '', bold: false }];
	const ranges = [];
	for (const p of ALL_PHRASES) {
		const re = new RegExp('\\b' + escRe(p) + '\\b', 'gi');
		let m;
		while ((m = re.exec(text))) {
			const s = m.index, e = s + m[0].length;
			if (!ranges.some(r => s < r.e && e > r.s)) ranges.push({ s, e });
		}
	}
	ranges.sort((a, b) => a.s - b.s);
	const segs = [];
	let i = 0;
	for (const r of ranges) {
		if (r.s > i) segs.push({ text: text.slice(i, r.s), bold: false });
		segs.push({ text: text.slice(r.s, r.e), bold: true });
		i = r.e;
	}
	if (i < text.length) segs.push({ text: text.slice(i), bold: false });
	return segs.length ? segs : [{ text, bold: false }];
}

// keyword explanations for a card: its engine tags first, then any phrase found
// in its rules text — deduped, in reading order
export function keywordsFor(card) {
	const out = [], seen = new Set();
	const add = k => { if (k && !seen.has(k.p[0])) { seen.add(k.p[0]); out.push({ label: k.p[0], text: k.t }); } };
	for (const tag of (card.keywords || [])) add(byTag[tag]);
	const text = card.description || '';
	for (const k of K) if (k.p.some(p => new RegExp('\\b' + escRe(p) + '\\b', 'i').test(text))) add(k);
	return out;
}
