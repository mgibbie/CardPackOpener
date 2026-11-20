// site/pagesounds.js — Balatro's button sounds on one of the site's own pages (home, login, profile, watch, ...).
//
// The kit's sfx.wire() (site/ui/sfx.js) sounds the kit's own buttons (.bal-btn, .bal-tab, [data-sfx], a .bal-row).
// The site's pages also draw their own buttons and links (rendered by their scripts, often after load), so this adds
// one delegated listener that gives every other press on the page the kit's sound too:
//   a tab ([role=tab], .bal-tab)                   -> sfx.tab()
//   a Back / Close / Cancel ([data-sfx-back], .bal-back) -> sfx.back()
//   any other button, link, checkbox, <summary>     -> sfx.press()
//   a <select>, when a choice is picked             -> sfx.select()
// Disabled controls stay silent. The shared overlays that sound themselves (the top bar and its inbox, the Games
// switcher, the on-screen keyboard, the bets panel, the chat, the profile popup) are left to their own sounds.
// Nothing plays before a user gesture and Micatro's sound setting (micatro_sfx) turns it all off: both are the kit's.
//   <script type="module">import { wirePage } from '/site/pagesounds.js'; wirePage();</script>
import { sfx } from './ui/sfx.js';

const OWN = '#mp-topbar, #mp-inbox, #mp-deckpick, #mpsw, #osk, #bets-panel, #bets-chip, #mp-chat, #mp-profile';
const KIT = '.bal-btn, .bal-tab, [data-sfx], button.bal-row, a.bal-row, select.bal-select';   // (sfx.wire's own)
const PRESSABLE = 'button, a[href], [role="button"], [role="tab"], summary, input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"]';

export function wirePage(root = document) {
	if (!root || root.__balPage) return;
	root.__balPage = true;
	sfx.wire(root);
	root.addEventListener('click', (e) => {
		const t = e.target && e.target.closest ? e.target.closest(PRESSABLE) : null;
		if (!t || !root.contains(t) || t.closest(OWN) || t.closest(KIT)) return;
		if (t.disabled || t.getAttribute('aria-disabled') === 'true') return;
		if (t.matches('[role="tab"]')) sfx.tab();
		else if (t.matches('[data-sfx-back], .bal-back')) sfx.back();
		else sfx.press();
	}, true);
	// a <select> sounds when a choice is picked: a click on it opens the browser's own list, which does not reliably send
	// the page a click (sfx.wire does the same for the kit's .bal-select)
	root.addEventListener('change', (e) => {
		const t = e.target;
		if (!t || !t.matches || !t.matches('select') || !root.contains(t) || t.closest(OWN) || t.closest(KIT) || t.disabled) return;
		sfx.select();
	}, true);
}
export { sfx };
