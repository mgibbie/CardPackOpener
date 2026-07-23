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
	{ p: ['Indestructible'], t: "Damage and “destroy” effects don't kill it — only being sacrificed does.", tag: 'indestructible' },
	{ p: ['Landfall'], t: 'Triggers whenever a land you control enters (you develop a land).', tag: 'landfall' },
	{ p: ['Blink'], t: 'Exile a creature, then immediately return it — resetting it and retriggering its Battlecry.', tag: 'blink' },
	{ p: ['Proliferate'], t: "Give each creature you've strengthened (that has a permanent +1/+1) another +1/+1, and each of your planeswalkers 1 loyalty.", tag: 'proliferate' },
	{ p: ['Flying'], t: 'Flavor only — there is no blocking in this format, so Flying has no rules effect here.', tag: 'flying' },
	{ p: ['Vigilance'], t: 'Flavor only — attacking never taps in this format, so Vigilance has no rules effect here.', tag: 'vigilance' },
	{ p: ['Menace'], t: 'Flavor only — there is no blocking in this format, so Menace has no rules effect here.', tag: 'menace' },
	{ p: ['Reach'], t: 'Flavor only — there is no blocking in this format, so Reach has no rules effect here.', tag: 'reach' },
	{ p: ['Deathtouch'], t: 'Any damage it deals to a creature destroys that creature.', tag: 'deathtouch' },
	{ p: ['Venomous'], t: 'Like Deathtouch, but one-shot: the first time it damages a creature that creature is destroyed, then Venomous is used up.', tag: 'venomous' },
	{ p: ['Poisonous'], t: 'Damaging a creature Poisons it instead of destroying it outright.', tag: 'poisonous' },
	{ p: ['Poisoned'], t: "At the end of its controller's turn, a Poisoned creature takes 2 damage. The condition stays until it's cleansed or dies.", tag: 'poisoned' },
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
	{ p: ['Firebreathing'], t: 'Spend 1 mana any number of times: +1 Attack until end of turn.', tag: 'firebreathing' },
	{ p: ['Static'], t: '50% chance to Paralyze any creature that survives combat with it.', tag: 'static' },
	{ p: ['Paralyzed', 'Paralyze'], t: "A Paralyzed creature's attacks fail 50% of the time (coin flip)." },
	{ p: ['Freeze', 'Frozen', 'Freezer'], t: 'A Frozen character skips its next attack.', tag: 'freezer' },
	// text-only keywords: no engine tag, but worth explaining where they appear
	{ p: ['Discover'], t: 'Choose one of three cards to add to your hand.' },
	{ p: ['Dredge'], t: 'Look at the bottom 3 cards of your deck and put one on top (you don\'t draw it).' },
	{ p: ['Investigate'], t: 'Make a Clue token — sacrifice it and pay 2 to draw a card.' },
	{ p: ['Excavate'], t: 'Dig up a treasure to your hand; each Excavate is one tier higher (Common → Legendary), then loops.' },
	{ p: ['Planeshift'], t: 'Shift the arena to a random plane (the old one departs, the new one arrives). The plane is shared — nobody controls it.' },
	{ p: ['Spark'], t: 'Unlocks Planeswalk — you may now roll the planar die on your turn.' },
	{ p: ['Planeswalk'], t: 'Roll the planar die (needs a planeswalker or Spark). First roll each turn is free, then +1 mana each. 6 = Planeshift, 5 = Chaos, 1-4 nothing.' },
	{ p: ['Cook'], t: 'Make a Food token — sacrifice it and pay 2 to restore 3 Health to your hero.' },
	{ p: ['Morbid'], t: 'Morbid N — its effect triggers each time N creatures have died.' },
	{ p: ['Overload'], t: 'Locks that much of your mana next turn.' },
	{ p: ['Manathirst'], t: 'Manathirst N — a bonus effect that activates once your mana crystals this turn reach N (whether or not you have spent them).' },
	{ p: ['Combo'], t: 'A bonus effect if you already played a card this turn.' },
	{ p: ['Finale'], t: 'A bonus effect that happens if you spent all your remaining mana to play this card.' },
	{ p: ['Emerge'], t: 'Triggers from your hand the moment this card is drawn or discovered (not from your opening hand).' },
	{ p: ['Spell Damage'], t: 'Your spells deal extra damage.' },
	{ p: ['Magnetic'], t: 'Play it left of a friendly Mech to fuse their stats and text.' },
	{ p: ['Inspire'], t: 'Triggers after you use your Hero Power.' },
	{ p: ['Secret'], t: "Stays hidden until its trigger fires on the opponent's turn." },
	{ p: ['Counter target spell', 'Counter'], t: 'When an opponent casts a spell, you may play this in response from your hand to counter it — it goes on the stack and is stopped before it resolves.' },
	{ p: ['Tradeable'], t: 'Drag it onto your deck to pay 1 and draw a card.' },
	{ p: ['Connect'], t: 'Triggers when this deals combat damage to the enemy hero.' },
	{ p: ['Swing'], t: 'Triggers when this attacks.' },
	{ p: ['Ponder'], t: 'Triggers whenever you draw an extra card (past your first draw of the turn), Scry, Dredge or Gaze.' },
	{ p: ['Honorable Kill'], t: 'Bonus if it kills a creature with an exact-lethal blow.' },
	{ p: ['Adapt'], t: 'Choose one of three upgrades for the creature.' },
	{ p: ['Quest'], t: 'Complete its goal for a powerful reward.', tag: 'quest' },
	// heals, coin flips, and other mechanics that were showing up unbolded
	{ p: ['Medic'], t: 'Medic N — restores N Health to the creatures beside it at the end of your turn.' },
	{ p: ['Luck'], t: 'Flip a coin: heads the effect happens, tails it fizzles.' },
	{ p: ['Ward'], t: 'Ward N — an opponent must pay N extra (mana or Life) to target this.' },
	{ p: ['Scry'], t: 'Scry N — look at the top N cards of your deck; keep them on top or send them to the bottom.' },
	{ p: ['Gaze'], t: 'Gaze N — look at the top N cards of your deck and reorder them (like Scry).' },
	{ p: ['Prowess'], t: 'Gains +1/+1 until end of turn each time you cast a spell.' },
	{ p: ['Avenge'], t: 'Avenge N — its effect triggers after N of your creatures have died.' },
	{ p: ['Frenzy'], t: 'A one-time effect the first time this survives taking damage.' },
	{ p: ['Overheal'], t: 'A bonus that triggers when this is healed above its maximum Health.' },
	{ p: ['Outcast'], t: 'A bonus if this was the left- or right-most card in your hand when you played it.' },
	{ p: ['Corrupt'], t: 'While in your hand, upgrades once you play a card that costs more than it.' },
	{ p: ['Colossal'], t: 'Colossal +N — enters play alongside its Appendage tokens.' },
	{ p: ['Echo'], t: 'Leaves a temporary copy in your hand when played, so you can keep replaying it while you have mana.' },
	{ p: ['Spellburst'], t: 'A one-time effect that triggers after you cast your next spell.' },
	{ p: ['Constellation'], t: 'Triggers each time you play an Enchantment.' },
	{ p: ['Alliance'], t: 'Triggers each time you play another creature.' },
	{ p: ['Quickdraw'], t: 'Quickdraw N — draw N cards; cards drawn this way shuffle back into your deck at end of turn.' },
	{ p: ['Mill'], t: 'Mill N — put the top N cards of a deck into its graveyard.' },
	{ p: ['Arrival'], t: "A plane's effect that triggers when it arrives (becomes the active plane).", plane: true },
	{ p: ['Departure'], t: "A plane's effect that triggers when it leaves play.", plane: true },
	{ p: ['Chaos'], t: 'A shared plane effect that fires when a planar roll comes up Chaos.', plane: true },
	{ p: ['Static'], t: "A plane's continuous effect that applies while it is the active plane.", plane: true },
	{ p: ['Regenerate'], t: 'Regenerate N — restores N Health to itself at the end of your turn.' },
	{ p: ['Ephemeral'], t: 'Destroyed at the end of the turn.' },
	{ p: ['Bushido'], t: 'Gains +1/+1 whenever it attacks.' },
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

// ---------- inline mana / tap symbols ----------
// rules text stores them as plain tokens: '⟳' (tap) and '(W)/(U)/(B)/(R)/(G)/(N)'
// (coloured mana / generic). We render them as little coloured pips.
export const SYM = {
	tap: { label: '⟳', bg: '#4a4a52', fg: '#f5f5f7', ring: '#26262c' },
	W: { label: 'W', bg: '#f6f0cf', fg: '#3a3416', ring: '#c7bf8c' },
	U: { label: 'U', bg: '#2f80d6', fg: '#eef6ff', ring: '#175a9c' },
	B: { label: 'B', bg: '#453c50', fg: '#e9e2f2', ring: '#1f1a26' },
	R: { label: 'R', bg: '#d8462f', fg: '#fff0ec', ring: '#9c2a1a' },
	G: { label: 'G', bg: '#41ab61', fg: '#eefff2', ring: '#237c42' },
	C: { label: 'C', bg: '#bbb4a6', fg: '#2a271f', ring: '#8a857a' },
};
const SYM_RE = /⟳|\((W|U|B|R|G|C|\d+)\)/g;

// ordered word / symbol tokens; words carry the keyword bold flag, symbols carry
// a SYM key + label. Drives both the canvas card face and the HTML tooltips.
export function richTokens(text) {
	const out = [];
	// split on spaces AND hard newlines (a newline becomes a line break)
	const pushWords = (t, bold) => {
		t.split('\n').forEach((ln, i) => {
			if (i > 0) out.push({ kind: 'br' });
			for (const w of ln.split(/\s+/)) if (w) out.push({ kind: 'word', text: w, bold });
		});
	};
	for (const seg of segmentKeywords(text || '')) {
		let last = 0, m;
		SYM_RE.lastIndex = 0;
		while ((m = SYM_RE.exec(seg.text))) {
			if (m.index > last) pushWords(seg.text.slice(last, m.index), seg.bold);
			if (m[0] === '⟳') out.push({ kind: 'sym', key: 'tap', label: SYM.tap.label });
			else if (SYM[m[1]]) out.push({ kind: 'sym', key: m[1], label: m[1] });
			else out.push({ kind: 'sym', key: 'N', label: m[1] }); // generic number
			last = m.index + m[0].length;
		}
		if (last < seg.text.length) pushWords(seg.text.slice(last), seg.bold);
	}
	return out;
}

// authentic MTG symbols come from the open-source Mana font (Andrew Gioia, OFL).
// Loading its stylesheet gives us both the .ms icon classes (tooltips) and the
// @font-face the canvas card faces draw with.
export const MANA_CSS = 'https://cdn.jsdelivr.net/npm/mana-font@1.18.0/css/mana.min.css';
if (typeof document !== 'undefined' && !document.getElementById('mana-font-css')) {
	const l = document.createElement('link');
	l.id = 'mana-font-css'; l.rel = 'stylesheet'; l.href = MANA_CSS;
	document.head.appendChild(l);
}
const MS_CLASS = { tap: 'ms-tap', W: 'ms-w', U: 'ms-u', B: 'ms-b', R: 'ms-r', G: 'ms-g', C: 'ms-c' };
const _esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// a real mana / tap symbol pip via the Mana font's icon classes
export function pipHtml(tok) {
	const cls = tok.key === 'N' ? 'ms-' + tok.label : (MS_CLASS[tok.key] || 'ms-c');
	return `<i class="ms ${cls} ms-cost" style="font-size:15px;vertical-align:-2px;margin:0 1px;"></i>`;
}
const PUNCT = /^[,.;:!?)%]/;
// rules text as HTML with keyword <b> and inline symbol pips
export function richHtml(text) {
	let html = '';
	const toks = richTokens(text);
	for (let i = 0; i < toks.length; i++) {
		const tk = toks[i];
		if (tk.kind === 'br') { html += '<br>'; continue; }
		const punct = tk.kind === 'word' && PUNCT.test(tk.text);
		if (i > 0 && !punct && toks[i - 1].kind !== 'br') html += ' ';
		if (tk.kind === 'sym') html += pipHtml(tk);
		else html += tk.bold ? `<b>${_esc(tk.text)}</b>` : _esc(tk.text);
	}
	return html;
}

// keyword explanations for a card: its engine tags first, then any phrase found
// in its rules text — deduped, in reading order
export function keywordsFor(card) {
	const out = [], seen = new Set();
	const add = k => { if (k && !seen.has(k.p[0])) { seen.add(k.p[0]); out.push({ label: k.p[0], text: k.t }); } };
	for (const tag of (card.keywords || [])) add(byTag[tag]);
	const text = card.description || '';
	const isPlane = card.type === 'plane';
	for (const k of K) {
		if (k.plane && !isPlane) continue;            // plane-only vocab (Arrival/Chaos/Departure/Static)
		if (k.tag === 'static' && isPlane) continue;  // on planes, "Static" means the plane keyword, not combat Static
		if (k.p.some(p => new RegExp('\\b' + escRe(p) + '\\b', 'i').test(text))) add(k);
	}
	return out;
}

// Display label for an engine keyword tag (e.g. 'divine_shield' -> 'Divine Shield').
// Falls back to a Title-Cased version of the tag for keywords with no glossary entry.
export function keywordLabel(tag) {
	if (byTag[tag]) return byTag[tag].p[0];
	return tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
