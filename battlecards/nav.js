// nav.js — a clear, consistent "Back" affordance for every card mode. Returns to
// the overworld in Test-Realm (mp) mode, or the battle menu in free play. Also
// keeps cross-page links in mp mode so hopping between card modes doesn't drop you.
import * as MPX from './mpmode.js';

const MP = MPX.wantsMp() && MPX.hasToken();
const backHref = MP ? '/overworld/?mp=1' : 'index.html';
const goBack = () => { location.href = backHref; };

const btn = document.createElement('button');
btn.id = 'mp-back';
btn.textContent = '← Back';
btn.title = (MP ? 'Back to the overworld' : 'Back to the menu') + ' (Esc)';
Object.assign(btn.style, {
	position: 'fixed', top: '10px', left: '10px', zIndex: '10000',
	background: 'rgba(30,22,48,0.92)', color: '#e8e2f4',
	border: '1px solid #8f6fff', borderRadius: '9px',
	padding: '8px 14px', font: '600 14px "Segoe UI", sans-serif',
	cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
});
btn.addEventListener('pointerenter', () => { btn.style.background = 'rgba(62,46,98,0.96)'; });
btn.addEventListener('pointerleave', () => { btn.style.background = 'rgba(30,22,48,0.92)'; });
btn.addEventListener('click', goBack);
document.body.appendChild(btn);

// nudge the page header right so the button never covers the title
const header = document.getElementById('title') || document.querySelector('h1');
if (header) header.style.paddingLeft = '96px';

// Esc = back, unless a page opts out (the live game uses Esc for its own menus)
if (!window.__noEscBack) {
	addEventListener('keydown', e => {
		if (e.key !== 'Escape') return;
		if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
		goBack();
	});
}

// carry mp=1 across the in-page nav links so you stay in the Test Realm
if (MP) for (const a of document.querySelectorAll('a[href$=".html"]')) {
	const h = a.getAttribute('href');
	if (h && !/[?&]mp=/.test(h)) a.setAttribute('href', h + (h.includes('?') ? '&' : '?') + 'mp=1');
}
