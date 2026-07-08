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
	{ p: ['Firebreathing'], t: 'Spend 1 mana any number of times: +1 Attack until end of turn.', tag: 'firebreathing' },
	{ p: ['Static'], t: '50% chance to Paralyze any creature that survives combat with it.', tag: 'static' },
	{ p: ['Paralyzed', 'Paralyze'], t: "A Paralyzed creature's attacks fail 50% of the time (coin flip)." },
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
	for (const k of K) if (k.p.some(p => new RegExp('\\b' + escRe(p) + '\\b', 'i').test(text))) add(k);
	return out;
}
