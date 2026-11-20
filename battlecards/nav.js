// nav.js — a clear, consistent "Back" affordance for every card mode. Returns to
// the overworld in Test-Realm (mp) mode, or the Battlecards hub (start.html) in free play. Also
// keeps cross-page links in mp mode so hopping between card modes doesn't drop you.
import * as MPX from './mpmode.js';
import './padnav.js';   // keyboard + controller navigation (everyone; Plans/CONTROLLER_SUPPORT_PLAN.md phase 3, controls sweep B3)
import { isTyping } from '../site/input.js';

const MP = MPX.wantsMp() && MPX.hasToken();
const backHref = MP ? '/overworld/?mp=1' : 'start.html';
const goBack = () => { location.href = backHref; };

// Balatro's orange Back button from the site UI kit (site/ui/balatro.css). Every page that loads nav.js links the
// kit already; the check keeps the button styled on one that doesn't.
if (!document.querySelector('link[href$="/site/ui/balatro.css"]')) {
	const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/site/ui/balatro.css'; document.head.appendChild(l);
}
const btn = document.createElement('button');
btn.id = 'mp-back';
btn.className = 'bal-btn bal-orange bal-back bal-sm';
btn.textContent = '← Back';
btn.title = (MP ? 'Back to the overworld' : 'Back to Battlecards') + ' (Esc / X)';
Object.assign(btn.style, { position: 'fixed', top: '10px', left: '10px', zIndex: '10000' });
btn.addEventListener('click', goBack);
document.body.appendChild(btn);

// nudge the page header right so the button never covers the title
const header = document.getElementById('title') || document.querySelector('h1');
if (header) header.style.paddingLeft = '96px';

// Esc = back, unless a page opts out (the live game uses Esc for its own menus).
// Never while something on the page is open (the deck builder's / gallery's card
// zoom, a picker, a dialog: Esc closes THAT), when a handler already used this
// Esc (defaultPrevented), or while typing in a field. (X / a pad's B send this
// same Escape through padnav.js.)
const OPEN_LAYER = '#zoom.open, #lopick.open, [aria-modal="true"], dialog[open], #osk';
const somethingOpen = () => [...document.querySelectorAll(OPEN_LAYER)].some(el => el.id !== 'mp-back' && el.getClientRects().length > 0);
if (!window.__noEscBack) {
	addEventListener('keydown', e => {
		if (e.key !== 'Escape' || e.defaultPrevented) return;
		if (isTyping(document.activeElement)) return;
		if (somethingOpen()) return;
		goBack();
	});
}

// carry mp=1 across the in-page nav links so you stay in the Test Realm
if (MP) for (const a of document.querySelectorAll('a[href$=".html"]')) {
	const h = a.getAttribute('href');
	if (h && !/[?&]mp=/.test(h)) a.setAttribute('href', h + (h.includes('?') ? '&' : '?') + 'mp=1');
}
